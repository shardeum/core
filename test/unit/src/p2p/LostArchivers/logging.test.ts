import { initLogging, info, warn, error } from '../../../../../src/p2p/LostArchivers/logging'
import { logger } from '../../../../../src/p2p/Context'
import { Logger } from 'log4js'

jest.mock('../../../../../src/p2p/Context', () => ({
  logger: {
    getLogger: jest.fn(),
  },
}))

describe('LostArchivers/logging', () => {
  let mockP2pLogger: jest.Mocked<Logger>

  beforeEach(() => {
    jest.clearAllMocks()
    mockP2pLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any
    ;(logger.getLogger as jest.Mock).mockReturnValue(mockP2pLogger)
  })

  describe('initLogging', () => {
    it('should initialize p2p logger', () => {
      initLogging()

      expect(logger.getLogger).toHaveBeenCalledTimes(1)
      expect(logger.getLogger).toHaveBeenCalledWith('p2p')
    })

    it('should not throw any errors', () => {
      expect(() => initLogging()).not.toThrow()
    })

    it('should be idempotent - multiple calls should work', () => {
      initLogging()
      initLogging()
      initLogging()

      expect(logger.getLogger).toHaveBeenCalledTimes(3)
      expect(logger.getLogger).toHaveBeenCalledWith('p2p')
    })
  })

  describe('info', () => {
    beforeEach(() => {
      initLogging()
    })

    it('should log info messages with LostArchivers prefix', () => {
      info('test message')

      expect(mockP2pLogger.info).toHaveBeenCalledTimes(1)
      expect(mockP2pLogger.info).toHaveBeenCalledWith('LostArchivers: test message')
    })

    it('should handle multiple arguments', () => {
      info('test', 'multiple', 'arguments')

      expect(mockP2pLogger.info).toHaveBeenCalledTimes(1)
      expect(mockP2pLogger.info).toHaveBeenCalledWith('LostArchivers: test multiple arguments')
    })

    it('should handle different types of arguments', () => {
      info('string', 123, true, { key: 'value' }, ['array'])

      expect(mockP2pLogger.info).toHaveBeenCalledTimes(1)
      expect(mockP2pLogger.info).toHaveBeenCalledWith('LostArchivers: string 123 true [object Object] array')
    })

    it('should handle no arguments', () => {
      info()

      expect(mockP2pLogger.info).toHaveBeenCalledTimes(1)
      expect(mockP2pLogger.info).toHaveBeenCalledWith('LostArchivers: ')
    })

    it('should handle null and undefined arguments', () => {
      info(null, undefined, 'test')

      expect(mockP2pLogger.info).toHaveBeenCalledTimes(1)
      expect(mockP2pLogger.info).toHaveBeenCalledWith('LostArchivers:   test')
    })
  })

  describe('warn', () => {
    beforeEach(() => {
      initLogging()
    })

    it('should log warn messages with LostArchivers prefix', () => {
      warn('warning message')

      expect(mockP2pLogger.warn).toHaveBeenCalledTimes(1)
      expect(mockP2pLogger.warn).toHaveBeenCalledWith('LostArchivers: warning message')
    })

    it('should handle multiple arguments', () => {
      warn('warning', 'multiple', 'args')

      expect(mockP2pLogger.warn).toHaveBeenCalledTimes(1)
      expect(mockP2pLogger.warn).toHaveBeenCalledWith('LostArchivers: warning multiple args')
    })

    it('should handle different types of arguments', () => {
      warn('warn', 456, false, { warn: 'object' })

      expect(mockP2pLogger.warn).toHaveBeenCalledTimes(1)
      expect(mockP2pLogger.warn).toHaveBeenCalledWith('LostArchivers: warn 456 false [object Object]')
    })

    it('should handle no arguments', () => {
      warn()

      expect(mockP2pLogger.warn).toHaveBeenCalledTimes(1)
      expect(mockP2pLogger.warn).toHaveBeenCalledWith('LostArchivers: ')
    })
  })

  describe('error', () => {
    beforeEach(() => {
      initLogging()
    })

    it('should log error messages with LostArchivers prefix', () => {
      error('error message')

      expect(mockP2pLogger.error).toHaveBeenCalledTimes(1)
      expect(mockP2pLogger.error).toHaveBeenCalledWith('LostArchivers: error message')
    })

    it('should handle multiple arguments', () => {
      error('error', 'multiple', 'parameters')

      expect(mockP2pLogger.error).toHaveBeenCalledTimes(1)
      expect(mockP2pLogger.error).toHaveBeenCalledWith('LostArchivers: error multiple parameters')
    })

    it('should handle different types of arguments', () => {
      error('error', 789, new Error('test error'), [1, 2, 3])

      expect(mockP2pLogger.error).toHaveBeenCalledTimes(1)
      expect(mockP2pLogger.error).toHaveBeenCalledWith('LostArchivers: error 789 Error: test error 1,2,3')
    })

    it('should handle no arguments', () => {
      error()

      expect(mockP2pLogger.error).toHaveBeenCalledTimes(1)
      expect(mockP2pLogger.error).toHaveBeenCalledWith('LostArchivers: ')
    })
  })

  describe('logging functions edge cases', () => {
    it('should handle case when logger returns undefined', () => {
      ;(logger.getLogger as jest.Mock).mockReturnValue(undefined)
      initLogging()
      
      // Since p2pLogger is undefined, these will throw when trying to call .info, .warn, .error
      expect(() => info('test')).toThrow()
      expect(() => warn('test')).toThrow()
      expect(() => error('test')).toThrow()
    })

    it('should handle case when logger is null', () => {
      ;(logger.getLogger as jest.Mock).mockReturnValue(null)
      initLogging()
      
      // Since p2pLogger is null, these will throw when trying to call .info, .warn, .error
      expect(() => info('test')).toThrow()
      expect(() => warn('test')).toThrow() 
      expect(() => error('test')).toThrow()
    })
  })
})