import fs from 'fs'
import path from 'path'
import Log4js from 'log4js'

// Mock all dependencies before importing
jest.mock('fs')
jest.mock('path')
jest.mock('log4js')
const mockContext = {
  logger: {
    getLogger: jest.fn()
  },
  p2p: {
    getLatestCycles: jest.fn()
  }
}

const mockSelf = {
  getPublicNodeInfo: jest.fn(),
  emitter: {
    once: jest.fn(),
    on: jest.fn()
  },
  isActive: false
}

jest.mock('../../../../src/p2p/Context', () => mockContext)
jest.mock('../../../../src/utils/profiler', () => ({
  profilerInstance: {
    scopedProfileSectionStart: jest.fn(),
    scopedProfileSectionEnd: jest.fn()
  }
}))
jest.mock('../../../../src/p2p/Self', () => mockSelf)
const mockNodeList = {
  getAgeIndex: jest.fn(),
  activeByIdOrder: []
}

// Mock global process
const originalProcess = global.process
const mockMemoryUsage = jest.fn(() => ({
  rss: 100000000,
  heapTotal: 50000000,
  heapUsed: 30000000,
  external: 10000000,
  arrayBuffers: 5000000
}))

global.process = {
  ...originalProcess,
  memoryUsage: mockMemoryUsage,
  on: jest.fn(),
  exit: jest.fn()
} as any

jest.mock('../../../../src/p2p/NodeList', () => mockNodeList)

// Import after mocking
import ExitHandler from '../../../../src/exit-handler/index'
import * as Context from '../../../../src/p2p/Context'
import { profilerInstance } from '../../../../src/utils/profiler'
import * as Self from '../../../../src/p2p/Self'
import * as NodeList from '../../../../src/p2p/NodeList'

const mockedFs = fs as jest.Mocked<typeof fs>
const mockedPath = path as jest.Mocked<typeof path>
const mockedLog4js = Log4js as jest.Mocked<typeof Log4js>
const mockedContext = Context as jest.Mocked<typeof Context>
const mockedSelf = Self as jest.Mocked<typeof Self>
const mockedNodeList = NodeList as jest.Mocked<typeof NodeList>

describe('ExitHandler', () => {
  let exitHandler: ExitHandler
  let mockLogger: any
  let mockMemStats: any
  let mockCounters: any

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Reset memory usage mock
    mockMemoryUsage.mockReturnValue({
      rss: 100000000,
      heapTotal: 50000000,
      heapUsed: 30000000,
      external: 10000000,
      arrayBuffers: 5000000
    })

    // Setup mock logger
    mockLogger = {
      fatal: jest.fn()
    }
    mockContext.logger.getLogger.mockReturnValue(mockLogger)

    // Setup mock memory stats
    mockMemStats = {
      gatherReport: jest.fn(),
      reportToStream: jest.fn(),
      report: {}
    }

    // Setup mock counters
    mockCounters = {
      arrayitizeAndSort: jest.fn().mockReturnValue([]),
      printArrayReport: jest.fn(),
      eventCounters: {}
    }

    // Mock fs operations
    mockedFs.writeFileSync.mockImplementation(() => {})
    mockedPath.join.mockImplementation((...paths) => paths.join('/'))

    // Mock profiler
    ;(profilerInstance as any).scopedProfileSectionStart = jest.fn()
    ;(profilerInstance as any).scopedProfileSectionEnd = jest.fn()

    // Mock Self methods
    mockedSelf.getPublicNodeInfo.mockReturnValue({
      id: 'test-node',
      ip: '127.0.0.1',
      port: 9001
    } as any)

    // Mock NodeList
    mockedNodeList.getAgeIndex.mockReturnValue({ idx: 5, total: 10 })
    mockNodeList.activeByIdOrder = ['node1', 'node2', 'node3'] as any

    // Mock Context.p2p
    mockContext.p2p.getLatestCycles.mockReturnValue([
      { start: Date.now() / 1000 }
    ] as any)

    exitHandler = new ExitHandler('/test/logs', mockMemStats, mockCounters)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(exitHandler.exited).toBe(false)
      expect(exitHandler.syncFuncs).toBeInstanceOf(Map)
      expect(exitHandler.asyncFuncs).toBeInstanceOf(Map)
      expect(exitHandler.logDir).toBe('/test/logs')
      expect(mockContext.logger.getLogger).toHaveBeenCalledWith('exit')
    })

    it('should setup event listeners', () => {
      expect(mockSelf.emitter.once).toHaveBeenCalledWith('active', expect.any(Function))
      expect(mockSelf.emitter.on).toHaveBeenCalledWith('cycle_q1_start', expect.any(Function))
    })

    it('should call writeStartSummary', () => {
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        '/test/logs/start-summary.json',
        expect.stringContaining('"startTime"'),
        { encoding: 'utf8', flag: 'w' }
      )
    })
  })

  describe('registerSync', () => {
    it('should register sync function', () => {
      const testFunc = jest.fn()
      exitHandler.registerSync('test', testFunc)
      
      expect(exitHandler.syncFuncs.get('test')).toBe(testFunc)
    })
  })

  describe('registerAsync', () => {
    it('should register async function', () => {
      const testFunc = jest.fn()
      exitHandler.registerAsync('test', testFunc)
      
      expect(exitHandler.asyncFuncs.get('test')).toBe(testFunc)
    })
  })

  describe('_cleanupSync', () => {
    it('should call all registered sync functions', () => {
      const func1 = jest.fn()
      const func2 = jest.fn()
      
      exitHandler.registerSync('test1', func1)
      exitHandler.registerSync('test2', func2)
      
      exitHandler._cleanupSync()
      
      expect(func1).toHaveBeenCalled()
      expect(func2).toHaveBeenCalled()
    })
  })

  describe('_cleanupAsync', () => {
    it('should call all registered async functions', async () => {
      const func1 = jest.fn().mockResolvedValue(undefined)
      const func2 = jest.fn().mockResolvedValue(undefined)
      
      exitHandler.registerAsync('test1', func1)
      exitHandler.registerAsync('test2', func2)
      
      await exitHandler._cleanupAsync()
      
      expect(func1).toHaveBeenCalled()
      expect(func2).toHaveBeenCalled()
    })
  })

  describe('exitCleanly', () => {
    it('should exit cleanly when not already exited', async () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })
      
      try {
        await exitHandler.exitCleanly('test', 'test message')
      } catch (e) {
        // Expected to throw because of process.exit mock
      }
      
      expect(exitHandler.exited).toBe(true)
      expect(mockLogger.fatal).toHaveBeenCalled()
      expect(exitSpy).toHaveBeenCalled()
      
      exitSpy.mockRestore()
    })

    it('should not exit if already exited', async () => {
      exitHandler.exited = true
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })
      
      await exitHandler.exitCleanly('test', 'test message')
      
      expect(exitSpy).not.toHaveBeenCalled()
      exitSpy.mockRestore()
    })

    it('should not call process.exit when exitProcess is false', async () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })
      
      await exitHandler.exitCleanly('test', 'test message', false)
      
      expect(exitHandler.exited).toBe(true)
      expect(exitSpy).not.toHaveBeenCalled()
      exitSpy.mockRestore()
    })
  })

  describe('exitUncleanly', () => {
    it('should exit with status 1', async () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })
      
      try {
        await exitHandler.exitUncleanly('test', 'test message')
      } catch (e) {
        // Expected to throw because of process.exit mock
      }
      
      expect(exitHandler.exited).toBe(true)
      expect(exitSpy).toHaveBeenCalledWith(1)
      exitSpy.mockRestore()
    })

    it('should not exit if already exited', async () => {
      exitHandler.exited = true
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })
      
      await exitHandler.exitUncleanly('test', 'test message')
      
      expect(exitSpy).not.toHaveBeenCalled()
      exitSpy.mockRestore()
    })
  })

  describe('runExitLog', () => {
    it('should log memory and counter reports', () => {
      exitHandler.runExitLog(true, 'test', 'test message')
      
      expect(mockLogger.fatal).toHaveBeenCalledWith(
        expect.stringContaining('isCleanExit: true  exitType: test  msg: test message')
      )
      expect(mockMemStats.gatherReport).toHaveBeenCalled()
      expect(mockMemStats.reportToStream).toHaveBeenCalled()
      expect(mockCounters.arrayitizeAndSort).toHaveBeenCalled()
      expect(mockCounters.printArrayReport).toHaveBeenCalled()
      expect(profilerInstance.scopedProfileSectionStart).toHaveBeenCalledWith('counts')
      expect(profilerInstance.scopedProfileSectionEnd).toHaveBeenCalledWith('counts')
    })

    it('should write exit summary', () => {
      exitHandler.runExitLog(true, 'test', 'test message')
      
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        '/test/logs/exit-summary.json',
        expect.stringContaining('"status"'),
        { encoding: 'utf8', flag: 'w' }
      )
    })
  })

  describe('writeNodeProgress', () => {
    it('should write node progress to file', () => {
      exitHandler.lastRotationIndex = { idx: 5, total: 10 }
      exitHandler.lastActiveTime = Date.now()
      exitHandler.activeStartTime = Date.now() - 60000
      
      exitHandler.writeNodeProgress()
      
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        '/test/logs/node-progress.json',
        expect.stringContaining('"lastRotationIndex"'),
        { encoding: 'utf8', flag: 'w' }
      )
    })

    it('should handle errors gracefully', () => {
      mockedSelf.getPublicNodeInfo.mockImplementation(() => {
        throw new Error('Test error')
      })
      mockedFs.writeFileSync.mockImplementation(() => {
        throw new Error('File write error')
      })
      
      expect(() => exitHandler.writeNodeProgress()).not.toThrow()
    })
  })

  describe('writeExitSummary', () => {
    it('should set status to "Exited cleanly" for clean exits', () => {
      exitHandler.writeExitSummary(true, 'normal', 'test message')
      
      const writeCall = mockedFs.writeFileSync.mock.calls.find(call => 
        (call[0] as string).includes('exit-summary.json')
      )
      const content = JSON.parse(writeCall[1] as string)
      expect(content.status).toBe('Exited cleanly')
    })

    it('should set status to "Exit with warning" for Apoptosized clean exits', () => {
      exitHandler.writeExitSummary(true, 'Apoptosized', 'test message')
      
      const writeCall = mockedFs.writeFileSync.mock.calls.find(call => 
        (call[0] as string).includes('exit-summary.json')
      )
      const content = JSON.parse(writeCall[1] as string)
      expect(content.status).toBe('Exit with warning')
    })

    it('should set status to "Exit with warning" for SIGINT unclean exits', () => {
      exitHandler.writeExitSummary(false, 'SIGINT', 'test message')
      
      const writeCall = mockedFs.writeFileSync.mock.calls.find(call => 
        (call[0] as string).includes('exit-summary.json')
      )
      const content = JSON.parse(writeCall[1] as string)
      expect(content.status).toBe('Exit with warning')
    })

    it('should set status to "Exit with error" for SIGTERM unclean exits', () => {
      exitHandler.writeExitSummary(false, 'SIGTERM', 'test message')
      
      const writeCall = mockedFs.writeFileSync.mock.calls.find(call => 
        (call[0] as string).includes('exit-summary.json')
      )
      const content = JSON.parse(writeCall[1] as string)
      expect(content.status).toBe('Exit with error')
    })

    it('should calculate total active time', () => {
      exitHandler.activeStartTime = 1000
      exitHandler.lastActiveTime = 5000
      
      exitHandler.writeExitSummary(true, 'test', 'test message')
      
      const writeCall = mockedFs.writeFileSync.mock.calls.find(call => 
        (call[0] as string).includes('exit-summary.json')
      )
      const content = JSON.parse(writeCall[1] as string)
      expect(content.totalActiveTime).toBe(4000)
    })

    it('should handle errors gracefully', () => {
      mockedSelf.getPublicNodeInfo.mockImplementation(() => {
        throw new Error('Test error')
      })
      mockedFs.writeFileSync.mockImplementation(() => {
        throw new Error('File write error')
      })
      
      expect(() => exitHandler.writeExitSummary(true, 'test', 'message')).not.toThrow()
    })
  })

  describe('writeStartSummary', () => {
    it('should write start summary to file', () => {
      exitHandler.writeStartSummary()
      
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        '/test/logs/start-summary.json',
        expect.stringContaining('"startTime"'),
        { encoding: 'utf8', flag: 'w' }
      )
    })

    it('should handle file write errors gracefully', () => {
      mockedFs.writeFileSync.mockImplementation(() => {
        throw new Error('File write error')
      })
      
      expect(() => exitHandler.writeStartSummary()).not.toThrow()
    })
  })

  describe('addSigListeners', () => {
    let mockProcess: any

    beforeEach(() => {
      mockProcess = {
        on: jest.fn()
      }
      Object.defineProperty(global, 'process', {
        value: mockProcess,
        writable: true
      })
    })

    it('should add SIGINT listener by default', () => {
      exitHandler.addSigListeners()
      
      expect(mockProcess.on).toHaveBeenCalledWith('SIGINT', expect.any(Function))
      expect(mockProcess.on).toHaveBeenCalledWith('message', expect.any(Function))
    })

    it('should add SIGTERM listener by default', () => {
      exitHandler.addSigListeners()
      
      expect(mockProcess.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function))
    })

    it('should not add SIGINT listener when disabled', () => {
      exitHandler.addSigListeners(false, true)
      
      expect(mockProcess.on).not.toHaveBeenCalledWith('SIGINT', expect.any(Function))
      expect(mockProcess.on).not.toHaveBeenCalledWith('message', expect.any(Function))
    })

    it('should not add SIGTERM listener when disabled', () => {
      exitHandler.addSigListeners(true, false)
      
      expect(mockProcess.on).not.toHaveBeenCalledWith('SIGTERM', expect.any(Function))
    })
  })

  describe('event handlers', () => {
    it('should handle active event', () => {
      const onceCall = (mockSelf.emitter.once as jest.Mock).mock.calls.find(call => call[0] === 'active')
      const handler = onceCall[1]
      
      mockContext.p2p.getLatestCycles.mockReturnValue([{ start: 12345 }] as any)
      
      handler()
      
      expect(exitHandler.activeStartTime).toBe(12345000)
    })

    it('should handle cycle_q1_start event when active', () => {
      const onCall = (mockSelf.emitter.on as jest.Mock).mock.calls.find(call => call[0] === 'cycle_q1_start')
      const handler = onCall[1]
      
      mockSelf.isActive = true
      mockedNodeList.getAgeIndex.mockReturnValue({ idx: 3, total: 8 })
      mockContext.p2p.getLatestCycles.mockReturnValue([{ start: 54321 }] as any)
      
      handler()
      
      expect(exitHandler.lastRotationIndex).toEqual({ idx: 3, total: 8 })
      expect(exitHandler.lastActiveTime).toBe(54321000)
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        '/test/logs/node-progress.json',
        expect.any(String),
        { encoding: 'utf8', flag: 'w' }
      )
    })

    it('should not update rotation index when idx is negative', () => {
      const onCall = (mockSelf.emitter.on as jest.Mock).mock.calls.find(call => call[0] === 'cycle_q1_start')
      const handler = onCall[1]
      
      mockSelf.isActive = true
      mockedNodeList.getAgeIndex.mockReturnValue({ idx: -1, total: 8 })
      exitHandler.lastRotationIndex = { idx: 5, total: 10 }
      
      handler()
      
      expect(exitHandler.lastRotationIndex).toEqual({ idx: 5, total: 10 })
    })
  })
})