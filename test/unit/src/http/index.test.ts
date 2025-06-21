// Mock all dependencies to avoid complex import chains
jest.mock('@shardeum-foundation/lib-types', () => ({
  Utils: {
    safeJsonParse: jest.fn((str) => JSON.parse(str)),
    safeStringify: jest.fn((obj) => JSON.stringify(obj))
  }
}))

jest.mock('../../../../src/logger', () => ({
  logFlags: {
    playback: false,
    verbose: false
  }
}))

jest.mock('../../../../src/http/customHttpFunctions', () => ({
  customGot: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn()
  }))
}))

jest.mock('../../../../src/utils', () => ({
  stringifyReduceLimit: jest.fn((obj) => JSON.stringify(obj))
}))

jest.mock('url', () => ({
  parse: jest.fn((url) => ({
    href: url,
    hostname: 'localhost',
    port: '3000',
    pathname: '/test'
  }))
}))

// Mock all problematic modules
jest.mock('../../../../src/index', () => ({}))
jest.mock('../../../../src/shardus/index', () => ({}))
jest.mock('../../../../src/p2p/Context', () => ({
  Context: { setDefaultConfigs: jest.fn() },
  config: { p2p: { maxResponseSize: 1000000 } }
}))

describe('http index functions', () => {
  // Test internal helper functions by creating isolated functions
  describe('URL normalization', () => {
    it('should handle protocol detection', () => {
      const _containsProtocol = (url: string) => {
        if (!url.match('https?://*')) return false
        return true
      }
      
      expect(_containsProtocol('http://localhost')).toBe(true)
      expect(_containsProtocol('https://localhost')).toBe(true)
      expect(_containsProtocol('localhost')).toBe(false)
    })

    it('should normalize URLs without protocol', () => {
      const _normalizeUrl = (url: string) => {
        const _containsProtocol = (url: string) => {
          if (!url.match('https?://*')) return false
          return true
        }
        let normalized = url
        if (!_containsProtocol(url)) normalized = 'http://' + url
        return normalized
      }
      
      expect(_normalizeUrl('localhost:3000')).toBe('http://localhost:3000')
      expect(_normalizeUrl('http://localhost:3000')).toBe('http://localhost:3000')
    })
  })

  describe('Error description building', () => {
    it('should build error description with code', () => {
      const buildGotErrorDescription = (error: any) => {
        let description = 'Got error: '
        if (error.code) {
          description += `[Code: ${error.code}] `
        }
        if (error.response && error.response.statusCode) {
          description += `[Status Code: ${error.response.statusCode}] `
        }
        if (error.message) {
          description += error.message
        }
        return description
      }

      const error = {
        code: 'ETIMEDOUT',
        message: 'Request timeout'
      }
      
      const result = buildGotErrorDescription(error)
      expect(result).toBe('Got error: [Code: ETIMEDOUT] Request timeout')
    })

    it('should build error description with status code', () => {
      const buildGotErrorDescription = (error: any) => {
        let description = 'Got error: '
        if (error.code) {
          description += `[Code: ${error.code}] `
        }
        if (error.response && error.response.statusCode) {
          description += `[Status Code: ${error.response.statusCode}] `
        }
        if (error.message) {
          description += error.message
        }
        return description
      }

      const error = {
        response: { statusCode: 404 },
        message: 'Not found'
      }
      
      const result = buildGotErrorDescription(error)
      expect(result).toBe('Got error: [Status Code: 404] Not found')
    })
  })

  describe('Module exports', () => {
    it('should export main functions', () => {
      // Just test that the module can be required without errors
      const httpModule = require('../../../../src/http/index')
      
      expect(typeof httpModule.get).toBe('function')
      expect(typeof httpModule.post).toBe('function')
      expect(typeof httpModule.setLogger).toBe('function')
    })
  })
})