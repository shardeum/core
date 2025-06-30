import { jest } from '@jest/globals'

// Mock all dependencies before importing server module
jest.mock('../../src/utils', () => ({
  readJSONDir: jest.fn()
}))

jest.mock('../../src/shardus', () => {
  return jest.fn().mockImplementation(() => ({
    setup: jest.fn(),
    start: jest.fn(() => Promise.resolve()),
    registerExceptionHandler: jest.fn()
  }))
})

// Store original process.argv
const originalArgv = process.argv

describe('server', () => {
  let mockReadJSONDir: jest.Mock
  let mockShardus: jest.Mock
  let shardusInstance: any

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()
    
    // Reset modules to ensure fresh imports
    jest.resetModules()
    
    // Set default process.argv
    process.argv = ['node', 'server.js']
    
    // Get mocked functions
    const utils = jest.requireMock('../../src/utils') as any
    mockReadJSONDir = utils.readJSONDir
    
    const Shardus = jest.requireMock('../../src/shardus') as any
    mockShardus = Shardus
    
    // Create a mock instance
    shardusInstance = {
      setup: jest.fn(),
      start: jest.fn(() => Promise.resolve()),
      registerExceptionHandler: jest.fn()
    }
    mockShardus.mockImplementation(() => shardusInstance)
  })

  afterEach(() => {
    // Restore original process.argv
    process.argv = originalArgv
  })

  describe('config loading', () => {
    it('should load config from custom directory when provided via argv', async () => {
      // Set custom directory path
      process.argv = ['node', 'server.js', '/custom/path']
      
      // Mock successful config read from custom path
      const customConfig = { server: { someConfig: 'value' } }
      mockReadJSONDir.mockReturnValueOnce(customConfig)
      
      // Import server module (this will trigger the config loading)
      await import('../../src/server')
      
      // Verify readJSONDir was called with custom path
      expect(mockReadJSONDir).toHaveBeenCalledWith('/custom/path/config')
      
      // Verify Shardus was initialized with the custom config
      expect(mockShardus).toHaveBeenCalledWith(expect.objectContaining({
        server: expect.objectContaining({
          someConfig: 'value',
          baseDir: '/custom/path'
        })
      }))
    })

    it('should use default config directory when no argv is provided', async () => {
      // No custom path in argv
      process.argv = ['node', 'server.js']
      
      // Mock empty config from default path (baseDirPath) and valid config from __dirname
      const defaultConfig = { server: { defaultConfig: 'value' } }
      mockReadJSONDir
        .mockReturnValueOnce({}) // First call returns empty object
        .mockReturnValueOnce(defaultConfig) // Second call returns default config
      
      // Import server module
      await import('../../src/server')
      
      // Verify readJSONDir was called twice
      expect(mockReadJSONDir).toHaveBeenCalledTimes(2)
      expect(mockReadJSONDir).toHaveBeenNthCalledWith(1, expect.stringContaining('/config'))
      expect(mockReadJSONDir).toHaveBeenNthCalledWith(2, expect.stringContaining('/src/config'))
      
      // Verify Shardus was initialized with default config
      expect(mockShardus).toHaveBeenCalledWith(expect.objectContaining({
        server: expect.objectContaining({
          defaultConfig: 'value',
          baseDir: expect.stringContaining('/')
        })
      }))
    })

    it('should fallback to default config when custom directory throws error', async () => {
      // Set custom directory path
      process.argv = ['node', 'server.js', '/invalid/path']
      
      // Mock error when reading custom path
      const defaultConfig = { server: { fallbackConfig: 'value' } }
      mockReadJSONDir
        .mockImplementationOnce(() => { throw new Error('Directory not found') })
        .mockReturnValueOnce(defaultConfig)
      
      // Import server module
      await import('../../src/server')
      
      // Verify both paths were tried
      expect(mockReadJSONDir).toHaveBeenCalledTimes(2)
      expect(mockReadJSONDir).toHaveBeenNthCalledWith(1, '/invalid/path/config')
      expect(mockReadJSONDir).toHaveBeenNthCalledWith(2, expect.stringContaining('config'))
      
      // Verify Shardus was initialized with fallback config
      expect(mockShardus).toHaveBeenCalledWith(expect.objectContaining({
        server: expect.objectContaining({
          fallbackConfig: 'value',
          baseDir: '/invalid/path'
        })
      }))
    })

    it('should handle empty config object as error and use default', async () => {
      // Mock empty config object from custom path
      const defaultConfig = { server: { defaultAfterEmpty: 'value' } }
      mockReadJSONDir
        .mockReturnValueOnce({}) // Empty object
        .mockReturnValueOnce(defaultConfig)
      
      // Import server module
      await import('../../src/server')
      
      // Verify fallback to default config
      expect(mockReadJSONDir).toHaveBeenCalledTimes(2)
      expect(mockShardus).toHaveBeenCalledWith(expect.objectContaining({
        server: expect.objectContaining({
          defaultAfterEmpty: 'value',
          baseDir: expect.stringContaining('/')
        })
      }))
    })
  })

  describe('init function', () => {
    it('should properly initialize and start shardus', async () => {
      // Mock successful config
      const config = { server: { testConfig: 'value' } }
      mockReadJSONDir.mockReturnValueOnce(config)
      
      // Import server module
      await import('../../src/server')
      
      // Wait for async operations to complete
      await new Promise(resolve => setImmediate(resolve))
      
      // Verify shardus methods were called in correct order
      expect(shardusInstance.setup).toHaveBeenCalledWith(null)
      expect(shardusInstance.start).toHaveBeenCalled()
      expect(shardusInstance.registerExceptionHandler).toHaveBeenCalled()
      
      // Verify order of operations
      const setupOrder = shardusInstance.setup.mock.invocationCallOrder[0]
      const startOrder = shardusInstance.start.mock.invocationCallOrder[0]
      const exceptionOrder = shardusInstance.registerExceptionHandler.mock.invocationCallOrder[0]
      
      expect(setupOrder).toBeLessThan(startOrder)
      expect(startOrder).toBeLessThan(exceptionOrder)
    })

  })

  describe('edge cases', () => {
    it('should handle undefined process.argv[2]', async () => {
      // Set argv without custom path
      process.argv = ['node', 'server.js', undefined as any]
      
      // Mock config
      const config = { server: { test: 'value' } }
      mockReadJSONDir.mockReturnValueOnce(config)
      
      // Import server module
      await import('../../src/server')
      
      // Should use resolved path as baseDirPath
      expect(mockReadJSONDir).toHaveBeenCalledWith(expect.stringContaining('/config'))
      expect(mockShardus).toHaveBeenCalledWith(expect.objectContaining({
        server: expect.objectContaining({
          baseDir: expect.stringContaining('/')
        })
      }))
    })

    it('should handle empty string in process.argv[2]', async () => {
      // Set argv with empty string
      process.argv = ['node', 'server.js', '']
      
      // Mock config
      const config = { server: { test: 'value' } }
      mockReadJSONDir.mockReturnValueOnce(config)
      
      // Import server module
      await import('../../src/server')
      
      // Should use resolved path as baseDirPath due to || operator
      expect(mockReadJSONDir).toHaveBeenCalledWith(expect.stringContaining('/config'))
      expect(mockShardus).toHaveBeenCalledWith(expect.objectContaining({
        server: expect.objectContaining({
          baseDir: expect.stringContaining('/')
        })
      }))
    })
  })
})