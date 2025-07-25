// Set up module mocks before any imports
const mockIsString = jest.fn()
const mockIsObject = jest.fn()
const mockMakeShortHash = jest.fn()
const mockStringifyReduceLimit = jest.fn()
const mockDeepCopy = jest.fn()
const mockSafeStringify = jest.fn()

// Mock all dependencies
jest.mock('log4js')
jest.mock('fs')
jest.mock('os', () => ({
  hostname: jest.fn(() => 'test-host'),
}))
jest.mock('log4js-extend', () => jest.fn())
jest.mock('url', () => ({
  parse: jest.fn((url) => ({ href: url })),
}))
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
}))

// Mock utils with our controlled functions
jest.mock('../../../../src/utils', () => ({
  isString: mockIsString,
  isObject: mockIsObject,
  makeShortHash: mockMakeShortHash,
  stringifyReduceLimit: mockStringifyReduceLimit,
  deepCopy: mockDeepCopy,
}))

// Mock lib-types
jest.mock('@shardeum-foundation/lib-types', () => ({
  Utils: {
    safeStringify: mockSafeStringify,
  },
  P2P: {
    P2PTypes: {
      NodeStatus: {
        INITIALIZING: 'INITIALIZING',
      },
    },
  },
}))

// Mock all p2p modules
jest.mock('../../../../src/p2p/Self', () => ({}))
jest.mock('../../../../src/p2p/Active', () => ({}))
jest.mock('../../../../src/p2p/Wrapper', () => ({}))
jest.mock('../../../../src/p2p/Context', () => ({
  config: {
    debug: {
      localEnableCycleRecordDebugTool: false,
    },
  },
}))

// Mock network module
jest.mock('../../../../src/network', () => ({
  shardusGetTime: jest.fn(() => 1000),
}))
jest.mock('../../../../src/network/debugMiddleware', () => ({
  isDebugModeMiddleware: jest.fn((req, res, next) => next()),
  isDebugModeMiddlewareLow: jest.fn((req, res, next) => next()),
  isDebugModeMiddlewareMedium: jest.fn((req, res, next) => next()),
}))

// Mock debug module
jest.mock('../../../../src/debug', () => ({
  isDebugMode: jest.fn(() => false),
}))

// Mock http module
jest.mock('../../../../src/http', () => ({
  setLogger: jest.fn(),
}))
jest.mock('../../../../src/http/customHttpFunctions', () => ({
  customGot: jest.fn(() => ({
    get: jest.fn(),
  })),
}))

// Mock profiler and counters
jest.mock('../../../../src/utils/profiler', () => ({
  profilerInstance: {},
}))
jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
  },
}))

// Create mock logFlags
const mockLogFlags = {
  debug: true,
  fatal: true,
  verbose: true,
  info: true,
  console: true,
  error: true,
  playback: false,
  playback_trace: false,
  playback_debug: false,
  net_trace: false,
  p2pNonFatal: true,
  newFilter: false,
  important_as_error: true,
  important_as_fatal: true,
  net_rust: false,
  net_verbose: false,
  net_stats: false,
  dapp_verbose: false,
  profiling_verbose: false,
  aalg: false,
  shardedCache: false,
  lost: false,
  rotation: false,
  seqdiagram: false,
  txCancel: false,
  getLocalOrRemote: false,
  verboseNestedCounters: false,
  node_rotation_debug: false,
  p2pSyncDebug: false,
  p2pExtraHeavyLogs: false,
}

// Import modules
import * as log4js from 'log4js'
import * as fs from 'fs'
import { StrictLogsConfiguration } from '../../../../src/shardus/shardus-types'

// Mock and import Logger
jest.mock('../../../../src/logger', () => {
  const actualLogger = jest.requireActual('../../../../src/logger')
  actualLogger.logFlags = mockLogFlags
  return actualLogger
})

import Logger, { logFlags, LogFlags } from '../../../../src/logger'

describe('Logger', () => {
  let logger: Logger
  let mockConfig: StrictLogsConfiguration
  let mockLoggers: any

  beforeEach(() => {
    jest.clearAllMocks()

    // Set up mock implementations
    mockIsString.mockImplementation((val) => typeof val === 'string')
    mockIsObject.mockImplementation((val) => typeof val === 'object' && val !== null)
    mockMakeShortHash.mockImplementation((hash) => (hash ? hash.substring(0, 8) : ''))
    mockStringifyReduceLimit.mockImplementation((obj) => JSON.stringify(obj))
    mockDeepCopy.mockImplementation((obj) => JSON.parse(JSON.stringify(obj)))
    mockSafeStringify.mockImplementation((obj) => JSON.stringify(obj))

    // Reset logFlags to default values
    Object.assign(logFlags, {
      debug: true,
      fatal: true,
      verbose: true,
      info: true,
      console: true,
      error: true,
      playback: false,
      playback_trace: false,
      playback_debug: false,
      net_trace: false,
      p2pNonFatal: true,
      newFilter: false,
      important_as_error: true,
      important_as_fatal: true,
      net_rust: false,
      net_verbose: false,
      net_stats: false,
      dapp_verbose: false,
      profiling_verbose: false,
      aalg: false,
      shardedCache: false,
      lost: false,
      rotation: false,
      seqdiagram: false,
      txCancel: false,
      getLocalOrRemote: false,
      verboseNestedCounters: false,
      node_rotation_debug: false,
      p2pSyncDebug: false,
      p2pExtraHeavyLogs: false,
    })

    mockConfig = {
      dir: 'logs',
      files: {
        main: 'main.log',
        app: 'app.log',
        fatal: 'fatal.log',
        net: 'net.log',
        seq: 'seq.log',
      },
      options: {
        appenders: {
          out: { type: 'stdout', maxLogSize: 10485760, backups: 3 },
          main: { type: 'file', maxLogSize: 10485760, backups: 3 },
          app: { type: 'file', maxLogSize: 10485760, backups: 3 },
          seq: { type: 'file', maxLogSize: 10485760, backups: 3 },
          p2p: { type: 'file', maxLogSize: 10485760, backups: 3 },
          snapshot: { type: 'file', maxLogSize: 10485760, backups: 3 },
          cycle: { type: 'file', maxLogSize: 10485760, backups: 3 },
          fatal: { type: 'file', maxLogSize: 10485760, backups: 3 },
          exit: { type: 'file', maxLogSize: 10485760, backups: 3 },
          errorFile: { type: 'file', maxLogSize: 10485760, backups: 3 },
          errors: { type: 'logLevelFilter', level: 'error', appender: 'errorFile' },
          net: { type: 'file', maxLogSize: 10485760, backups: 3 },
          playback: { type: 'file', maxLogSize: 10485760, backups: 3 },
          shardDump: { type: 'file', maxLogSize: 10485760, backups: 3 },
          statsDump: { type: 'file', maxLogSize: 10485760, backups: 3 },
        },
        categories: {
          default: { appenders: ['out'], level: 'info' },
          app: { appenders: ['app'], level: 'info' },
          main: { appenders: ['main'], level: 'info' },
          seq: { appenders: ['seq'], level: 'info' },
          p2p: { appenders: ['p2p'], level: 'info' },
          snapshot: { appenders: ['snapshot'], level: 'info' },
          cycle: { appenders: ['cycle'], level: 'info' },
          fatal: { appenders: ['fatal'], level: 'fatal' },
          exit: { appenders: ['exit'], level: 'info' },
          net: { appenders: ['net'], level: 'info' },
          playback: { appenders: ['playback'], level: 'info' },
          shardDump: { appenders: ['shardDump'], level: 'info' },
          statsDump: { appenders: ['statsDump'], level: 'info' },
        },
      },
      saveConsoleOutput: false,
    } as StrictLogsConfiguration

    mockLoggers = {
      main: {
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
        level: { levelStr: 'INFO' },
      },
      playback: {
        trace: jest.fn(),
        debug: jest.fn(),
        level: { levelStr: 'DEBUG' },
      },
      net: {
        level: { levelStr: 'INFO' },
      },
      p2p: {
        level: { levelStr: 'INFO' },
      },
    }
    ;(log4js.getLogger as jest.Mock).mockImplementation((name: string) => {
      return mockLoggers[name] || mockLoggers.main
    })
    ;(log4js.configure as jest.Mock).mockReturnValue({})
    ;(fs.existsSync as jest.Mock).mockReturnValue(true)
    ;(fs.mkdirSync as jest.Mock).mockImplementation(() => {})
  })

  describe('constructor', () => {
    it('should initialize logger with valid configuration', () => {
      expect(() => {
        logger = new Logger('/base/dir', mockConfig, 'info')
      }).not.toThrow()

      expect(logger.baseDir).toBe('/base/dir')
      expect(logger.config).toBe(mockConfig)
      expect(logger.logDir).toBe('/base/dir/logs')
    })

    it('should throw error if base directory is not provided', () => {
      expect(() => {
        logger = new Logger('', mockConfig, 'info')
      }).toThrow('Fatal Error: Base directory not defined.')
    })

    it('should throw error if configuration is not provided', () => {
      expect(() => {
        logger = new Logger('/base/dir', null as any, 'info')
      }).toThrow('Fatal Error: No configuration provided.')
    })

    it('should create log directory if it does not exist', () => {
      ;(fs.existsSync as jest.Mock).mockReturnValue(false)

      logger = new Logger('/base/dir', mockConfig, 'info')

      expect(fs.mkdirSync).toHaveBeenCalledWith('/base/dir/logs')
    })

    it('should set fatal flags when dynamicLogMode is fatal', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      logger = new Logger('/base/dir', mockConfig, 'fatal')

      expect(logFlags.fatal).toBe(true)
      expect(logFlags.error).toBe(false)
      expect(logFlags.debug).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith('startInFatalsLogMode=true!')

      consoleSpy.mockRestore()
    })

    it('should set error flags when dynamicLogMode is error', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      logger = new Logger('/base/dir', mockConfig, 'error')

      expect(logFlags.fatal).toBe(true)
      expect(logFlags.error).toBe(true)
      expect(logFlags.debug).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith('startInErrorLogMode=true!')

      consoleSpy.mockRestore()
    })
  })

  describe('_checkValidConfig', () => {
    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')
    })

    it('should throw error if dir is not defined', () => {
      logger.config.dir = ''
      expect(() => logger._checkValidConfig()).toThrow('Fatal Error: Log directory not defined.')
    })

    it('should throw error if files is not an object', () => {
      logger.config.files = null as any
      expect(() => logger._checkValidConfig()).toThrow('Fatal Error: Valid log file locations not provided.')
    })
  })

  describe('getLogger', () => {
    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')
    })

    it('should return a logger instance', () => {
      const result = logger.getLogger('main')
      expect(log4js.getLogger).toHaveBeenCalledWith('main')
      expect(result).toBe(mockLoggers.main)
    })
  })

  describe('shutdown', () => {
    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')
    })

    it('should return a promise that resolves when shutdown is complete', async () => {
      ;(log4js.shutdown as jest.Mock).mockImplementation((callback) => {
        callback()
      })

      const result = await logger.shutdown()
      expect(result).toBe('done')
      expect(log4js.shutdown).toHaveBeenCalled()
    })
  })

  describe('setPlaybackIPInfo', () => {
    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')
      logger.playbackLogNote = jest.fn()
    })

    it('should update playback owner with IP info', () => {
      const ipInfo = { externalPort: 8080 }

      logger.setPlaybackIPInfo(ipInfo)

      expect(logger._playbackIPInfo).toBe(ipInfo)
      expect(logger._playbackOwner).toContain(':8080')
      expect(logger.playbackLogNote).toHaveBeenCalledWith(
        'logHostNameUpdate',
        '',
        expect.objectContaining({ newName: expect.stringContaining(':8080') })
      )
    })
  })

  describe('setPlaybackID', () => {
    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')
      logger._playbackIPInfo = { externalPort: 8080 }
      logger.playbackLogNote = jest.fn()
    })

    it('should update playback owner with node ID', () => {
      const nodeID = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

      logger.setPlaybackID(nodeID)

      expect(logger._playbackNodeID).toBe(nodeID)
      expect(logger._playbackOwner).toContain(':8080')
      expect(logger.playbackLogNote).toHaveBeenCalledWith(
        'logHostNameUpdate',
        '',
        expect.objectContaining({
          newName: expect.stringContaining(':8080'),
          nodeID: nodeID + ' ',
        })
      )
    })
  })

  describe('identifyNode', () => {
    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')
    })

    it('should return short hash for 64-character string', () => {
      const nodeId = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      const result = logger.identifyNode(nodeId)
      expect(mockMakeShortHash).toHaveBeenCalledWith(nodeId)
      expect(result).toBe('12345678')
    })

    it('should return input for non-64-character string', () => {
      const input = 'short-string'
      const result = logger.identifyNode(input)
      expect(result).toBe(input)
    })

    it('should handle object with id property', () => {
      const node = {
        id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        externalPort: 8080,
      }
      const result = logger.identifyNode(node)
      expect(result).toBe('12345678:8080')
    })

    it('should stringify object without id property', () => {
      const obj = { someKey: 'someValue' }
      const result = logger.identifyNode(obj)
      expect(mockSafeStringify).toHaveBeenCalledWith(obj)
      expect(result).toBe(JSON.stringify(obj))
    })
  })

  describe('processDesc', () => {
    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')
    })

    it('should stringify object descriptions', () => {
      const desc = { key: 'value' }
      const result = logger.processDesc(desc)
      expect(mockStringifyReduceLimit).toHaveBeenCalledWith(desc, 1000)
      expect(result).toBe(JSON.stringify(desc))
    })

    it('should return non-object descriptions as-is', () => {
      const desc = 'string description'
      const result = logger.processDesc(desc)
      expect(result).toBe(desc)
    })
  })

  describe('playbackLog', () => {
    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')
      logFlags.playback = true
      logFlags.playback_trace = true
    })

    it('should log playback trace when enabled', () => {
      // Set up the playback owner properly
      logger._playbackOwner = 'test-host:8080'

      logger.playbackLog('from', 'to', 'type', 'endpoint', 'id', 'desc')

      expect(mockLoggers.playback.trace).toHaveBeenCalled()
      const callArg = mockLoggers.playback.trace.mock.calls[0][0]
      expect(callArg).toContain('from')
      expect(callArg).toContain('to')
      expect(callArg).toContain('type')
      expect(callArg).toContain('endpoint')
    })

    it('should not log when playback flag is false', () => {
      logFlags.playback = false

      logger.playbackLog('from', 'to', 'type', 'endpoint', 'id', 'desc')

      expect(mockLoggers.playback.trace).not.toHaveBeenCalled()
    })
  })

  describe('playbackLogState', () => {
    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')
      logger.playbackLog = jest.fn()
    })

    it('should call playbackLog with StateChange type', () => {
      logger.playbackLogState('newState', 'id', 'desc')

      expect(logger.playbackLog).toHaveBeenCalledWith('', '', 'StateChange', 'newState', 'id', 'desc')
    })
  })

  describe('playbackLogNote', () => {
    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')
      logger.playbackLog = jest.fn()
    })

    it('should call playbackLog with Note type', () => {
      logger.playbackLogNote('category', 'id', 'desc')

      expect(logger.playbackLog).toHaveBeenCalledWith('', '', 'Note', 'category', 'id', 'desc')
    })
  })

  describe('setFatalFlags', () => {
    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')
    })

    it('should set only fatal and important_as_fatal to true', () => {
      logger.setFatalFlags()

      expect(logFlags.fatal).toBe(true)
      expect(logFlags.important_as_fatal).toBe(true)
      expect(logFlags.error).toBe(false)
      expect(logFlags.debug).toBe(false)
      expect(logFlags.playback).toBe(false)
    })
  })

  describe('setDisableAllFlags', () => {
    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')
    })

    it('should set all flags to false', () => {
      logger.setDisableAllFlags()

      Object.values(logFlags).forEach((value) => {
        expect(value).toBe(false)
      })
    })
  })

  describe('setErrorFlags', () => {
    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')
    })

    it('should set error-related flags to true', () => {
      logger.setErrorFlags()

      expect(logFlags.fatal).toBe(true)
      expect(logFlags.error).toBe(true)
      expect(logFlags.important_as_fatal).toBe(true)
      expect(logFlags.important_as_error).toBe(true)
      expect(logFlags.debug).toBe(false)
      expect(logFlags.playback).toBe(false)
    })
  })

  describe('setDefaultFlags', () => {
    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')
      // Ensure backupLogFlags is set
      logger.backupLogFlags = { ...logFlags }
    })

    it('should restore flags from backup', () => {
      logger.setDisableAllFlags()
      logger.setDefaultFlags()

      expect(logFlags.important_as_fatal).toBe(true)
      expect(logFlags.important_as_error).toBe(true)
    })
  })

  describe('setFlagByName', () => {
    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')
    })

    it('should set specific flag by name', () => {
      // Start with verbose as true
      logFlags.verbose = true
      logger.setFlagByName('verbose', false)
      expect(logFlags.verbose).toBe(false)

      // Start with debug as false
      logFlags.debug = false
      logger.setFlagByName('debug', true)
      expect(logFlags.debug).toBe(true)
    })
  })

  describe('mainLog', () => {
    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')
    })

    it('should log message with key to main logger', () => {
      logger.mainLog('info', 'KEY', 'message')

      expect(mockLoggers.main.info).toHaveBeenCalledWith('KEY message')
    })
  })

  describe('mainLog_debug', () => {
    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')
      logger.mainLog = jest.fn()
    })

    it('should call mainLog with debug level and DBG_ prefix', () => {
      logger.mainLog_debug('KEY', 'message')

      expect(logger.mainLog).toHaveBeenCalledWith('debug', 'DBG_KEY', 'message')
    })
  })

  describe('combine', () => {
    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')
    })

    it('should combine string arguments', () => {
      const result = logger.combine('hello', 'world', '!')
      expect(result).toBe('hello world !')
    })

    it('should stringify object arguments', () => {
      const result = logger.combine('data:', { key: 'value' }, 123)
      expect(mockSafeStringify).toHaveBeenCalledWith({ key: 'value' })
      expect(result).toBe('data: {"key":"value"} 123')
    })
  })

  describe('_containsProtocol', () => {
    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')
    })

    it('should return true for URLs with protocol', () => {
      expect(logger._containsProtocol('http://example.com')).toBe(true)
      expect(logger._containsProtocol('https://example.com')).toBe(true)
    })

    it('should return false for URLs without protocol', () => {
      expect(logger._containsProtocol('example.com')).toBe(false)
      expect(logger._containsProtocol('www.example.com')).toBe(false)
    })
  })

  describe('_normalizeUrl', () => {
    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')
    })

    it('should add http protocol if missing', () => {
      expect(logger._normalizeUrl('example.com')).toBe('http://example.com')
    })

    it('should not modify URLs with protocol', () => {
      expect(logger._normalizeUrl('https://example.com')).toBe('https://example.com')
    })
  })

  describe('setupLogControlValues', () => {
    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')
    })

    it('should set log flags based on logger levels', () => {
      mockLoggers.main.level.levelStr = 'TRACE'
      mockLoggers.net.level.levelStr = 'TRACE'
      mockLoggers.p2p.level.levelStr = 'FATAL'

      logger.setupLogControlValues()

      expect(logFlags.verbose).toBe(true)
      expect(logFlags.debug).toBe(true)
      expect(logFlags.net_trace).toBe(true)
      expect(logFlags.p2pNonFatal).toBe(false)
    })

    it('should set appropriate flags for DEBUG level', () => {
      mockLoggers.main.level.levelStr = 'DEBUG'

      logger.setupLogControlValues()

      expect(logFlags.verbose).toBe(false)
      expect(logFlags.debug).toBe(true)
      expect(logFlags.info).toBe(true)
    })

    it('should set appropriate flags for INFO level', () => {
      mockLoggers.main.level.levelStr = 'INFO'

      logger.setupLogControlValues()

      expect(logFlags.verbose).toBe(false)
      expect(logFlags.debug).toBe(false)
      expect(logFlags.info).toBe(true)
    })

    it('should set appropriate flags for ERROR level', () => {
      mockLoggers.main.level.levelStr = 'ERROR'

      logger.setupLogControlValues()

      expect(logFlags.verbose).toBe(false)
      expect(logFlags.debug).toBe(false)
      expect(logFlags.info).toBe(true)
      expect(logFlags.error).toBe(true)
    })
  })

  describe('registerEndpoints', () => {
    let mockContext: any
    let mockReq: any
    let mockRes: any

    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')

      mockReq = {
        query: {},
      }

      mockRes = {
        write: jest.fn(),
        end: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
      }

      mockContext = {
        network: {
          registerExternalGet: jest.fn(),
        },
      }
    })

    it('should register log-fatal endpoint', () => {
      logger.registerEndpoints(mockContext)

      const handler = mockContext.network.registerExternalGet.mock.calls.find((call) => call[0] === 'log-fatal')[2]

      handler(mockReq, mockRes)

      expect(logFlags.fatal).toBe(true)
      expect(logFlags.error).toBe(false)
      expect(mockRes.write).toHaveBeenCalled()
      expect(mockRes.end).toHaveBeenCalled()
    })

    it('should register log-disable endpoint', () => {
      logger.registerEndpoints(mockContext)

      const handler = mockContext.network.registerExternalGet.mock.calls.find((call) => call[0] === 'log-disable')[2]

      handler(mockReq, mockRes)

      Object.values(logFlags).forEach((value) => {
        expect(value).toBe(false)
      })
    })

    it('should register log-error endpoint', () => {
      logger.registerEndpoints(mockContext)

      const handler = mockContext.network.registerExternalGet.mock.calls.find((call) => call[0] === 'log-error')[2]

      handler(mockReq, mockRes)

      expect(logFlags.fatal).toBe(true)
      expect(logFlags.error).toBe(true)
    })

    it('should register log-default endpoint', () => {
      logger.registerEndpoints(mockContext)

      const handler = mockContext.network.registerExternalGet.mock.calls.find((call) => call[0] === 'log-default')[2]

      // Ensure backupLogFlags exists before calling handler
      logger.backupLogFlags = { ...logFlags }

      handler(mockReq, mockRes)

      expect(logFlags.important_as_fatal).toBe(true)
      expect(logFlags.important_as_error).toBe(true)
    })

    it('should register log-flag endpoint', () => {
      logger.registerEndpoints(mockContext)

      const handler = mockContext.network.registerExternalGet.mock.calls.find((call) => call[0] === 'log-flag')[2]

      mockReq.query = { name: 'verbose', value: 'false' }
      handler(mockReq, mockRes)

      expect(logFlags.verbose).toBe('false' as any) // The code passes string directly without conversion
    })

    it('should register log-getflags endpoint', () => {
      logger.registerEndpoints(mockContext)

      const handler = mockContext.network.registerExternalGet.mock.calls.find((call) => call[0] === 'log-getflags')[2]

      handler(mockReq, mockRes)

      expect(mockRes.write).toHaveBeenCalled()
      expect(mockRes.end).toHaveBeenCalled()
    })
  })

  describe('_addFileNamesToAppenders', () => {
    beforeEach(() => {
      logger = new Logger('/base/dir', mockConfig, 'info')
    })

    it('should add filenames to file appenders', () => {
      logger._addFileNamesToAppenders()

      expect((logger.log4Conf.appenders.main as any).filename).toBe('/base/dir/logs/main.log')
      expect((logger.log4Conf.appenders.app as any).filename).toBe('/base/dir/logs/app.log')
      expect((logger.log4Conf.appenders.out as any).filename).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('should handle missing appenders gracefully', () => {
      ;(mockConfig.options.appenders as any) = {}
      expect(() => {
        logger = new Logger('/base/dir', mockConfig, 'info')
      }).not.toThrow()
    })

    it('should handle invalid log levels gracefully', () => {
      mockLoggers.main.level = { levelStr: null }
      expect(() => {
        logger = new Logger('/base/dir', mockConfig, 'info')
      }).not.toThrow()
    })
  })
})

describe('LogFlags type', () => {
  it('should have all expected properties', () => {
    const expectedFlags: (keyof LogFlags)[] = [
      'verbose',
      'fatal',
      'debug',
      'info',
      'error',
      'console',
      'playback',
      'playback_trace',
      'playback_debug',
      'net_trace',
      'p2pNonFatal',
      'newFilter',
      'important_as_error',
      'important_as_fatal',
      'net_verbose',
      'net_stats',
      'net_rust',
      'dapp_verbose',
      'profiling_verbose',
      'aalg',
      'shardedCache',
      'lost',
      'rotation',
      'seqdiagram',
      'txCancel',
      'getLocalOrRemote',
      'verboseNestedCounters',
      'node_rotation_debug',
      'p2pSyncDebug',
      'p2pExtraHeavyLogs',
    ]

    expectedFlags.forEach((flag) => {
      expect(flag in logFlags).toBe(true)
    })
  })
})
