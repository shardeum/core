import { initLogging, info, warn, error } from '../../../../src/p2p/LostArchivers/logging'
import { logger } from '../../../../src/p2p/Context'
import { Logger } from 'log4js'

// Mock the Context module
jest.mock('../../../../src/p2p/Context', () => ({
  logger: {
    getLogger: jest.fn()
  }
}))

describe('LostArchivers logging', () => {
  let mockP2pLogger: jest.Mocked<Logger>
  let mockGetLogger: jest.Mock

  beforeEach(() => {
    // Create mock logger
    mockP2pLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
      fatal: jest.fn(),
      level: 'info',
      isLevelEnabled: jest.fn(),
      isTraceEnabled: jest.fn(),
      isDebugEnabled: jest.fn(),
      isInfoEnabled: jest.fn(),
      isWarnEnabled: jest.fn(),
      isErrorEnabled: jest.fn(),
      isFatalEnabled: jest.fn(),
      _log: jest.fn(),
      addContext: jest.fn(),
      removeContext: jest.fn(),
      clearContext: jest.fn(),
      setParseCallStackFunction: jest.fn(),
    } as any

    // Get the mocked getLogger function
    mockGetLogger = logger.getLogger as jest.Mock
    mockGetLogger.mockReturnValue(mockP2pLogger)

    // Clear all mocks
    jest.clearAllMocks()
  })

  describe('initLogging', () => {
    it('should initialize logger with "p2p" category', () => {
      initLogging()

      expect(mockGetLogger).toHaveBeenCalledWith('p2p')
      expect(mockGetLogger).toHaveBeenCalledTimes(1)
    })

    it('should be callable multiple times', () => {
      initLogging()
      initLogging()
      initLogging()

      expect(mockGetLogger).toHaveBeenCalledTimes(3)
      expect(mockGetLogger).toHaveBeenCalledWith('p2p')
    })
  })

  describe('logging functions', () => {
    beforeEach(() => {
      // Initialize logging before each test
      initLogging()
    })

    describe('info', () => {
      it('should log info message with LostArchivers prefix', () => {
        info('test message')

        expect(mockP2pLogger.info).toHaveBeenCalledWith('LostArchivers: test message')
        expect(mockP2pLogger.info).toHaveBeenCalledTimes(1)
      })

      it('should handle multiple arguments', () => {
        info('first', 'second', 'third')

        expect(mockP2pLogger.info).toHaveBeenCalledWith('LostArchivers: first second third')
      })

      it('should handle no arguments', () => {
        info()

        expect(mockP2pLogger.info).toHaveBeenCalledWith('LostArchivers: ')
      })

      it('should handle non-string arguments', () => {
        info('number:', 42, 'boolean:', true, 'object:', { key: 'value' })

        expect(mockP2pLogger.info).toHaveBeenCalledWith(
          'LostArchivers: number: 42 boolean: true object: [object Object]'
        )
      })

      it('should handle null and undefined', () => {
        info('null:', null, 'undefined:', undefined)

        // Array.join converts null and undefined to empty strings
        expect(mockP2pLogger.info).toHaveBeenCalledWith('LostArchivers: null:  undefined: ')
      })

      it('should handle arrays', () => {
        info('array:', [1, 2, 3])

        expect(mockP2pLogger.info).toHaveBeenCalledWith('LostArchivers: array: 1,2,3')
      })
    })

    describe('warn', () => {
      it('should log warn message with LostArchivers prefix', () => {
        warn('warning message')

        expect(mockP2pLogger.warn).toHaveBeenCalledWith('LostArchivers: warning message')
        expect(mockP2pLogger.warn).toHaveBeenCalledTimes(1)
      })

      it('should handle multiple arguments', () => {
        warn('warning:', 'multiple', 'parts')

        expect(mockP2pLogger.warn).toHaveBeenCalledWith('LostArchivers: warning: multiple parts')
      })

      it('should handle complex objects', () => {
        const complexObj = { nested: { value: 123 }, array: [1, 2] }
        warn('complex:', complexObj)

        expect(mockP2pLogger.warn).toHaveBeenCalledWith('LostArchivers: complex: [object Object]')
      })
    })

    describe('error', () => {
      it('should log error message with LostArchivers prefix', () => {
        error('error message')

        expect(mockP2pLogger.error).toHaveBeenCalledWith('LostArchivers: error message')
        expect(mockP2pLogger.error).toHaveBeenCalledTimes(1)
      })

      it('should handle Error objects', () => {
        const err = new Error('test error')
        error('Error occurred:', err)

        expect(mockP2pLogger.error).toHaveBeenCalledWith(`LostArchivers: Error occurred: ${err}`)
      })

      it('should handle multiple error arguments', () => {
        error('Error:', 'code', 500, 'message:', 'Internal Server Error')

        expect(mockP2pLogger.error).toHaveBeenCalledWith(
          'LostArchivers: Error: code 500 message: Internal Server Error'
        )
      })
    })
  })

  describe('without initialization', () => {
    it('should throw error when info is called before initLogging', () => {
      // Create a new instance without initialization
      jest.resetModules()
      const { info: uninitializedInfo } = jest.requireActual('../../../../src/p2p/LostArchivers/logging')

      expect(() => uninitializedInfo('test')).toThrow()
    })

    it('should throw error when warn is called before initLogging', () => {
      jest.resetModules()
      const { warn: uninitializedWarn } = jest.requireActual('../../../../src/p2p/LostArchivers/logging')

      expect(() => uninitializedWarn('test')).toThrow()
    })

    it('should throw error when error is called before initLogging', () => {
      jest.resetModules()
      const { error: uninitializedError } = jest.requireActual('../../../../src/p2p/LostArchivers/logging')

      expect(() => uninitializedError('test')).toThrow()
    })
  })

  describe('edge cases', () => {
    beforeEach(() => {
      initLogging()
    })

    it('should handle very long messages', () => {
      const longMessage = 'a'.repeat(1000)
      info(longMessage)

      expect(mockP2pLogger.info).toHaveBeenCalledWith(`LostArchivers: ${longMessage}`)
    })

    it('should handle special characters', () => {
      const specialChars = 'Test\nwith\ttabs\rand "quotes" and \'apostrophes\''
      warn(specialChars)

      expect(mockP2pLogger.warn).toHaveBeenCalledWith(`LostArchivers: ${specialChars}`)
    })

    it('should handle empty strings', () => {
      error('', '', '')

      expect(mockP2pLogger.error).toHaveBeenCalledWith('LostArchivers:   ')
    })

    it('should handle symbols', () => {
      const sym = Symbol('test')
      
      // Symbol cannot be directly converted to string by join, it will throw
      expect(() => info('symbol:', sym)).toThrow('Cannot convert a Symbol value to a string')
    })
  })
})