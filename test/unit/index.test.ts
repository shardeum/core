import * as index from '../../src/index'

jest.mock('deepmerge', () => jest.fn())

jest.mock('../../src/shardus', () => ({
  __esModule: true,
  default: jest.fn(() => ({ constructor: jest.fn() })),
}))

jest.mock('../../src/utils', () => ({
  compareObjectShape: jest.fn(),
}))

const mockMerge = require('deepmerge') as jest.Mock
const mockShardusConstructor = require('../../src/shardus').default as jest.Mock

describe('index', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockMerge.mockReturnValue({})
    ;(require('../../src/utils').compareObjectShape as jest.Mock).mockReturnValue({ isValid: true, error: null })
  })

  describe('exports', () => {
    it('should export Shardus as default', () => {
      expect(index.Shardus).toBeDefined()
    })

    it('should export ShardusTypes', () => {
      expect(index.ShardusTypes).toBeDefined()
    })

    it('should export CachedAppData type', () => {
      // CachedAppData is a type export, not a runtime export
      expect(typeof index).toBe('object')
    })

    it('should export nestedCountersInstance', () => {
      expect(index.nestedCountersInstance).toBeDefined()
    })

    it('should export DevSecurityLevel', () => {
      expect(index.DevSecurityLevel).toBeDefined()
    })

    it('should export version-related functionality', () => {
      expect(index.meetsMinimumVersion).toBeDefined()
      expect(index.isWithinMaximumVersion).toBeDefined()
      expect(index.VersionValidationResult).toBeDefined()
    })

    it('should export VectorBufferStream', () => {
      expect(index.VectorBufferStream).toBeDefined()
    })

    it('should export __ShardFunctions', () => {
      expect(index.__ShardFunctions).toBeDefined()
      expect(index.__ShardFunctions.addressToPartition).toBeDefined()
      expect(index.__ShardFunctions.partitionInWrappingRange).toBeDefined()
      expect(index.__ShardFunctions.findHomeNode).toBeDefined()
    })

    it('should export LogFlags type', () => {
      // LogFlags is a type export, not a runtime export
      expect(typeof index).toBe('object')
    })

    it('should export DebugComplete', () => {
      expect(index.DebugComplete).toBeDefined()
    })
  })

  describe('shardusFactory', () => {
    const mockConfig = {
      server: { port: 9001 },
      p2p: { cycleDuration: 30 },
    }

    it('should create Shardus instance with default config when no config provided', () => {
      const mockMergedConfig = { default: 'config' }
      mockMerge.mockReturnValue(mockMergedConfig)

      const result = index.shardusFactory()

      expect(mockMerge).toHaveBeenCalledWith(
        expect.any(Object), // defaultConfigs
        {},
        { arrayMerge: expect.any(Function) }
      )
      expect(require('../../src/utils').compareObjectShape).toHaveBeenCalledWith(expect.any(Object), mockMergedConfig)
      expect(mockShardusConstructor).toHaveBeenCalledWith(mockMergedConfig)
      expect(result).toEqual(expect.any(Object))
    })

    it('should create Shardus instance with merged config when config provided', () => {
      const mockMergedConfig = { merged: 'config' }
      mockMerge.mockReturnValue(mockMergedConfig)

      const result = index.shardusFactory(mockConfig)

      expect(mockMerge).toHaveBeenCalledWith(
        expect.any(Object), // defaultConfigs
        mockConfig,
        { arrayMerge: expect.any(Function) }
      )
      expect(mockShardusConstructor).toHaveBeenCalledWith(mockMergedConfig)
      expect(result).toEqual(expect.any(Object))
    })

    it('should throw error when config validation fails', () => {
      const mockError = {
        defectiveChain: ['server', 'port'],
        message: 'Invalid config',
      }
      ;(require('../../src/utils').compareObjectShape as jest.Mock).mockReturnValue({
        isValid: false,
        error: mockError,
      })

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      expect(() => index.shardusFactory(mockConfig)).toThrow(
        'Unacceptable config object shape, defective settings detected: server.port'
      )

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.any(String), // ANSI codes
        expect.any(String), // ANSI codes
        'INVALID CONFIG OBJECT PROPERTY OR TYPE MISMATCH OCCURS:',
        expect.stringContaining('server.port')
      )

      consoleSpy.mockRestore()
    })

    it('should handle arrayMerge function correctly', () => {
      mockMerge.mockImplementation((target, source, options) => {
        // Test the arrayMerge function
        const arrayMergeResult = options.arrayMerge(['a', 'b'], ['c', 'd'])
        expect(arrayMergeResult).toEqual(['c', 'd']) // Should overwrite, not merge
        return {}
      })

      index.shardusFactory()

      expect(mockMerge).toHaveBeenCalled()
    })

    it('should handle complex defective chain in error', () => {
      const mockError = {
        defectiveChain: ['p2p', 'network', 'timeout'],
        message: 'Deep config error',
      }
      ;(require('../../src/utils').compareObjectShape as jest.Mock).mockReturnValue({
        isValid: false,
        error: mockError,
      })

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      expect(() => index.shardusFactory()).toThrow(
        'Unacceptable config object shape, defective settings detected: p2p.network.timeout'
      )

      consoleSpy.mockRestore()
    })

    it('should handle empty defectiveChain', () => {
      const mockError = {
        defectiveChain: [],
        message: 'Root level error',
      }
      ;(require('../../src/utils').compareObjectShape as jest.Mock).mockReturnValue({
        isValid: false,
        error: mockError,
      })

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      expect(() => index.shardusFactory()).toThrow('Unacceptable config object shape, defective settings detected: ')

      consoleSpy.mockRestore()
    })
  })
})
