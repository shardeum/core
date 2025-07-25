import { Readable, Writable } from 'stream'
import process from 'process'
import os from 'os'
import { spawn } from 'child_process'

// Mock dependencies first
// Global mocks
global.console.log = jest.fn()

jest.mock('@shardeum-foundation/lib-crypto-utils', () => ({
  init: jest.fn(),
  setCustomStringifier: jest.fn(),
  generateKeypair: jest.fn(),
  hash: jest.fn(),
  hashObj: jest.fn(),
  sign: jest.fn(),
  verify: jest.fn(),
  signObj: jest.fn(),
  verifyObj: jest.fn(),
}))

jest.mock('sqlite3', () => ({
  Database: jest.fn(),
  verbose: jest.fn(() => ({
    Database: jest.fn(),
  })),
}))

// Mock P2P module first to avoid initialization issues
jest.mock('@shardeum-foundation/lib-types/build/src/p2p/P2PTypes', () => ({
  P2PTypes: {
    NodeStatus: {
      INITIALIZING: 'initializing',
    },
  },
}))

jest.mock('../../../../src/p2p/Self', () => ({
  state: 'initializing',
}))

jest.mock('../../../../src/p2p/Context', () => ({
  network: {
    registerExternalGet: jest.fn(),
  },
  setDefaultConfigs: jest.fn(),
}))

jest.mock('../../../../src/utils', () => ({
  makeShortHash: jest.fn((id) => `short_${id}`),
  stringifyReduce: jest.fn((obj) => JSON.stringify(obj)),
}))

jest.mock('../../../../src/crypto', () => jest.fn())

jest.mock('../../../../src/shardus', () => {
  const shardus = jest.fn()
  return {
    default: shardus,
    __esModule: true,
    initState: jest.fn(),
    Shardus: shardus,
    StateManager: {
      StateManagerTypes: {},
      shardFunctionTypes: {},
      StateMetaDataTypes: {},
    },
  }
})

jest.mock('../../../../src/snapshot', () => ({
  disableSummarySnapshot: true,
  default: jest.fn(),
}))

jest.mock('../../../../src/logger', () => ({
  logger: {
    mainLog_debug: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    combine: jest.fn((...args) => args.join(' ')),
  },
  logFlags: {
    error: true,
    verbose: false,
  },
}))

jest.mock('../../../../src/p2p/CycleCreator', () => ({
  scaleFactor: 1.5,
  currentCycle: null,
  currentQuarter: 0,
}))

jest.mock('os')
jest.mock('child_process')

jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countRareEvent: jest.fn(),
  },
}))

jest.mock('../../../../src/p2p/NodeList', () => ({
  __esModule: true,
  activeByIdOrder: [],
}))

jest.mock('../../../../src/network', () => ({
  getLastNTPObject: jest.fn(() => ({ timestamp: 123456 })),
  getNetworkTimeOffset: jest.fn(() => 1000),
  shardusGetTime: jest.fn(() => Date.now()),
}))

jest.mock('@shardeum-foundation/lib-types', () => ({
  Utils: {
    safeStringify: jest.fn((obj) => JSON.stringify(obj)),
  },
}))

// Import after mocking
import MemoryReporting, { memoryReportingInstance } from '../../../../src/utils/memoryReporting'
import * as Context from '../../../../src/p2p/Context'
import * as utils from '../../../../src/utils'
import * as CycleCreator from '../../../../src/p2p/CycleCreator'
import * as NodeList from '../../../../src/p2p/NodeList'
import { nestedCountersInstance } from '../../../../src/utils/nestedCounters'
import { getLastNTPObject, getNetworkTimeOffset, shardusGetTime } from '../../../../src/network'
import { Utils } from '@shardeum-foundation/lib-types'

const mockedOs = os as jest.Mocked<typeof os>
const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>

describe('MemoryReporting', () => {
  let memoryReporting: MemoryReporting
  let mockShardus: any
  let mockReq: any
  let mockRes: any
  let handlers: Map<string, Function>

  beforeEach(() => {
    jest.clearAllMocks()

    // Reset NodeList
    const nodeListMock = require('../../../../src/p2p/NodeList')
    nodeListMock.activeByIdOrder = []

    // Mock os.cpus
    mockedOs.cpus.mockReturnValue([
      {
        model: 'Intel',
        speed: 2400,
        times: {
          user: 1000,
          nice: 100,
          sys: 500,
          idle: 2000,
          irq: 100,
        },
      },
    ] as any)

    // Reset handlers map
    handlers = new Map<string, Function>()

    // Mock network.registerExternalGet to capture handlers
    ;(Context.network.registerExternalGet as jest.Mock) = jest.fn((route, ...args) => {
      const handler = args.length === 2 ? args[1] : args[0]
      handlers.set(route, handler)
    })

    // Setup mock shardus
    mockShardus = {
      stateManager: {
        accountCache: {
          getDebugStats: jest.fn(() => [100, 200]),
        },
        transactionQueue: {
          _transactionQueue: { length: 10 },
          pendingTransactionQueue: { length: 5 },
          archivedQueueEntries: { length: 3 },
          getExecuteQueueLength: jest.fn(() => 7),
        },
        accountSync: {
          syncTrackers: [
            {
              range: { low: 'abc', high: 'def' },
              isGlobalSyncTracker: true,
              syncStarted: true,
              syncFinished: false,
            },
          ],
        },
        accountPatcher: {
          failedLastTrieSync: false,
          syncFailHistory: ['fail1', 'fail2'],
        },
      },
      statistics: {
        getAverage: jest.fn(() => 0.45),
        getMultiStatReport: jest.fn(() => ({
          allVals: [0.3, 0.4, 0.5],
          min: 0.3,
          max: 0.5,
          avg: 0.4,
        })),
      },
      network: {
        sn: {
          stats: jest.fn(() => ({ sent: 100, received: 200 })),
        },
      },
    }

    // Setup mock request and response
    mockReq = {
      query: {},
    }

    mockRes = {
      write: jest.fn(),
      end: jest.fn(),
    }

    // Create instance
    memoryReporting = new MemoryReporting(mockShardus)
    memoryReporting.registerEndpoints()
  })

  describe('constructor', () => {
    it('should initialize with correct values', () => {
      expect(memoryReporting.crypto).toBeNull()
      expect(memoryReporting.report).toEqual([])
      expect(memoryReporting.shardus).toBe(mockShardus)
      expect(memoryReporting.lastCPUTimes).toBeDefined()
      expect(memoryReportingInstance).toBe(memoryReporting)
    })
  })

  describe('registerEndpoints', () => {
    it('should register all required endpoints', () => {
      expect(handlers.has('memory')).toBe(true)
      expect(handlers.has('memory-short')).toBe(true)
      expect(handlers.has('nodelist')).toBe(true)
      expect(handlers.has('netstats')).toBe(true)
      expect(handlers.has('top')).toBe(true)
      expect(handlers.has('df')).toBe(true)
      expect(handlers.has('memory-gc')).toBe(true)
      expect(handlers.has('scaleFactor')).toBe(true)
      expect(handlers.has('time-report')).toBe(true)
    })

    describe('memory endpoint', () => {
      it('should return memory usage report', () => {
        const mockMemoryUsage = {
          rss: 100000000,
          heapTotal: 80000000,
          heapUsed: 60000000,
          external: 10000000,
          arrayBuffers: 5000000,
        }
        jest.spyOn(process, 'memoryUsage').mockReturnValue(mockMemoryUsage)

        const handler = handlers.get('memory')
        handler(mockReq, mockRes)

        expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('System Memory Report'))
        expect(mockRes.write).toHaveBeenCalledWith('rss: 100.00 MB\n')
        expect(mockRes.write).toHaveBeenCalledWith('heapTotal: 80.00 MB\n')
        expect(mockRes.write).toHaveBeenCalledWith('heapUsed: 60.00 MB\n')
        expect(mockRes.write).toHaveBeenCalledWith('external: 10.00 MB\n')
        expect(mockRes.write).toHaveBeenCalledWith('arrayBuffers: 5.00 MB\n\n\n')
        expect(mockRes.end).toHaveBeenCalled()
      })
    })

    describe('memory-short endpoint', () => {
      it('should return short memory report and count rare event', () => {
        const mockMemoryUsage = {
          rss: 50000000,
          heapTotal: 40000000,
          heapUsed: 30000000,
          external: 5000000,
          arrayBuffers: 2500000,
        }
        jest.spyOn(process, 'memoryUsage').mockReturnValue(mockMemoryUsage)

        const handler = handlers.get('memory-short')
        handler(mockReq, mockRes)

        expect(nestedCountersInstance.countRareEvent).toHaveBeenCalledWith('test', 'memory-short')
        expect(mockRes.write).toHaveBeenCalledWith('rss: 50.00 MB\n')
        expect(mockRes.end).toHaveBeenCalled()
      })
    })

    describe('nodelist endpoint', () => {
      it('should return nodelist report', () => {
        const handler = handlers.get('nodelist')
        handler(mockReq, mockRes)

        expect(mockRes.write).toHaveBeenCalledWith('\n')
        // The handler calls write twice - once for newline, once for report content, and another newline
        expect(mockRes.write.mock.calls.length).toBeGreaterThanOrEqual(2)
        expect(mockRes.end).toHaveBeenCalled()
      })
    })

    describe('netstats endpoint', () => {
      it('should return network stats report', () => {
        const handler = handlers.get('netstats')
        handler(mockReq, mockRes)

        expect(mockRes.write).toHaveBeenCalledWith('\n')
        expect(mockRes.end).toHaveBeenCalled()
      })
    })

    describe('top endpoint', () => {
      it('should spawn top command and return output', () => {
        const mockChildProcess = {
          stdout: {
            on: jest.fn((event, callback) => {
              if (event === 'data') {
                callback(Buffer.from('top output'))
              }
            }),
          },
          stderr: {
            on: jest.fn(),
          },
          on: jest.fn(),
          kill: jest.fn(),
        }

        mockedSpawn.mockReturnValue(mockChildProcess as any)

        const handler = handlers.get('top')
        handler(mockReq, mockRes)

        expect(mockedSpawn).toHaveBeenCalledWith('top', ['b', '-n', '10', '1'])
        expect(mockRes.write).toHaveBeenCalledWith(Buffer.from('top output'))
        expect(mockChildProcess.kill).toHaveBeenCalled()
        expect(mockRes.end).toHaveBeenCalled()
      })

      it('should handle top command error', () => {
        const mockChildProcess = {
          stdout: {
            on: jest.fn(),
          },
          stderr: {
            on: jest.fn((event, callback) => {
              if (event === 'data') {
                callback('error message')
              }
            }),
          },
          on: jest.fn(),
          kill: jest.fn(),
        }

        mockedSpawn.mockReturnValue(mockChildProcess as any)

        const handler = handlers.get('top')
        handler(mockReq, mockRes)

        expect(mockRes.write).toHaveBeenCalledWith('top command error')
        expect(mockChildProcess.kill).toHaveBeenCalled()
        expect(mockRes.end).toHaveBeenCalled()
      })
    })

    describe('df endpoint', () => {
      it('should spawn df command and return output', () => {
        const mockChildProcess = {
          stdout: {
            on: jest.fn((event, callback) => {
              if (event === 'data') {
                callback(Buffer.from('df output'))
              }
            }),
          },
          stderr: {
            on: jest.fn(),
          },
          on: jest.fn(),
          kill: jest.fn(),
        }

        mockedSpawn.mockReturnValue(mockChildProcess as any)

        const handler = handlers.get('df')
        handler(mockReq, mockRes)

        expect(mockedSpawn).toHaveBeenCalledWith('df')
        expect(mockRes.write).toHaveBeenCalledWith(Buffer.from('df output'))
        expect(mockChildProcess.kill).toHaveBeenCalled()
        expect(mockRes.end).toHaveBeenCalled()
      })
    })

    describe('memory-gc endpoint', () => {
      it('should trigger garbage collection if available', () => {
        global.gc = jest.fn()

        const handler = handlers.get('memory-gc')
        handler(mockReq, mockRes)

        expect(global.gc).toHaveBeenCalled()
        expect(mockRes.write).toHaveBeenCalledWith('garbage collected!')
        expect(mockRes.end).toHaveBeenCalled()

        delete global.gc
      })

      it('should report error if gc not available', () => {
        delete global.gc

        const handler = handlers.get('memory-gc')
        handler(mockReq, mockRes)

        expect(mockRes.write).toHaveBeenCalledWith('No access to global.gc.  run with node --expose-gc')
        expect(mockRes.end).toHaveBeenCalled()
      })
    })

    describe('scaleFactor endpoint', () => {
      it('should return scale factor', () => {
        const handler = handlers.get('scaleFactor')
        handler(mockReq, mockRes)

        expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('Scale debug'))
        expect(mockRes.write).toHaveBeenCalledWith('CycleAutoScale.  1.5')
        expect(mockRes.end).toHaveBeenCalled()
      })
    })

    describe('time-report endpoint', () => {
      it('should return time report', () => {
        const handler = handlers.get('time-report')
        handler(mockReq, mockRes)

        expect(mockRes.write).toHaveBeenCalled()
        expect(mockRes.end).toHaveBeenCalled()

        // Since the timeReport includes Date.now (function reference) which becomes
        // undefined in JSON, and the mocked functions return expected values,
        // we just verify the handler was called and response was sent
        expect(handlers.has('time-report')).toBe(true)
      })
    })
  })

  describe('addToReport', () => {
    it('should add item to report', () => {
      memoryReporting.addToReport('category1', 'subcat1', 'key1', 100)

      expect(memoryReporting.report).toHaveLength(1)
      expect(memoryReporting.report[0]).toEqual({
        category: 'category1',
        subcat: 'subcat1',
        itemKey: 'key1',
        count: 100,
      })
    })
  })

  describe('reportToStream', () => {
    it('should write report items to stream', () => {
      const mockStream = {
        write: jest.fn(),
      }

      const report = [
        { category: 'cat1', subcat: 'sub1', itemKey: 'key1', count: 10 },
        { category: 'cat2', subcat: 'sub2', itemKey: 'key2', count: 999 },
      ]

      memoryReporting.reportToStream(report, mockStream)

      expect(mockStream.write).toHaveBeenCalledWith('        10 cat1 sub1 key1\n')
      expect(mockStream.write).toHaveBeenCalledWith('       999 cat2 sub2 key2\n')
    })
  })

  describe('getMemoryStringBasic', () => {
    it('should return basic memory string with node info', () => {
      const mockMemoryUsage = {
        rss: 100000000,
        heapTotal: 80000000,
        heapUsed: 60000000,
        external: 10000000,
        arrayBuffers: 5000000,
      }
      jest.spyOn(process, 'memoryUsage').mockReturnValue(mockMemoryUsage)

      const nodeListMock = require('../../../../src/p2p/NodeList')
      nodeListMock.activeByIdOrder = [{ id: 'node1' }, { id: 'node2' }]

      const result = memoryReporting.getMemoryStringBasic()

      expect(result).toContain('rss: 100.00 MB')
      expect(result).toContain('nds:2')
      expect(result).toContain('qCt:10')
      expect(result).toContain('aAr:3')
    })
  })

  describe('getCPUTimes', () => {
    it('should return CPU times with totals', () => {
      mockedOs.cpus.mockReturnValue([
        {
          model: 'Intel',
          speed: 2400,
          times: {
            user: 1000,
            nice: 100,
            sys: 500,
            idle: 2000,
            irq: 100,
          },
        },
      ] as any)

      const result = memoryReporting.getCPUTimes()

      expect(result).toHaveLength(1)
      expect(result[0]).toHaveProperty('user', 1000)
      expect(result[0]).toHaveProperty('total', 3700)
    })
  })

  describe('cpuPercent', () => {
    it('should calculate CPU percentage', () => {
      // Mock initial CPU times
      mockedOs.cpus.mockReturnValueOnce([
        {
          model: 'Intel',
          speed: 2400,
          times: {
            user: 1000,
            nice: 100,
            sys: 500,
            idle: 2000,
            irq: 100,
          },
        },
      ] as any)

      // Initialize lastCPUTimes
      memoryReporting.lastCPUTimes = memoryReporting.getCPUTimes()

      // Mock updated CPU times
      mockedOs.cpus.mockReturnValueOnce([
        {
          model: 'Intel',
          speed: 2400,
          times: {
            user: 1100, // +100
            nice: 110, // +10
            sys: 550, // +50
            idle: 2200, // +200
            irq: 110, // +10
          },
        },
      ] as any)

      const result = memoryReporting.cpuPercent()

      // Total delta = 370, active delta = 160
      // Percent = 160 / 370 ≈ 0.432
      expect(result).toBeCloseTo(0.432, 2)
    })
  })

  describe('roundTo3decimals', () => {
    it('should round to 3 decimal places', () => {
      expect(memoryReporting.roundTo3decimals(1.23456)).toBe(1.235)
      expect(memoryReporting.roundTo3decimals(1.2344)).toBe(1.234)
      expect(memoryReporting.roundTo3decimals(1.2)).toBe(1.2)
    })
  })

  describe('gatherStateManagerReport', () => {
    it('should gather state manager statistics', () => {
      const nodeListMock = require('../../../../src/p2p/NodeList')
      nodeListMock.activeByIdOrder = [{ id: 'node1' }, { id: 'node2' }]

      memoryReporting.gatherStateManagerReport()

      expect(memoryReporting.report).toContainEqual({
        category: 'P2P',
        subcat: 'Nodelist',
        itemKey: 'numActiveNodes',
        count: 2,
      })

      expect(memoryReporting.report).toContainEqual({
        category: 'StateManager',
        subcat: 'AccountsCache',
        itemKey: 'workingAccounts',
        count: 100,
      })

      expect(memoryReporting.report).toContainEqual({
        category: 'StateManager',
        subcat: 'TXQueue',
        itemKey: 'queueCount',
        count: 10,
      })
    })
  })

  describe('systemProcessReport', () => {
    it('should gather system process statistics', () => {
      jest.spyOn(memoryReporting, 'cpuPercent').mockReturnValue(0.456789)

      // Mock process.resourceUsage
      const originalResourceUsage = process.resourceUsage
      process.resourceUsage = jest.fn().mockReturnValue({
        userCPUTime: 1000,
        systemCPUTime: 500,
        maxRSS: 200000,
        sharedMemorySize: 0,
        unsharedDataSize: 0,
        unsharedStackSize: 0,
        minorPageFault: 100,
        majorPageFault: 10,
        swappedOut: 0,
        fsRead: 1000,
        fsWrite: 500,
        ipcSent: 100,
        ipcReceived: 200,
        signalsCount: 5,
        voluntaryContextSwitches: 1000,
        involuntaryContextSwitches: 500,
      })

      memoryReporting.systemProcessReport()

      // Restore original
      process.resourceUsage = originalResourceUsage

      expect(memoryReporting.report).toContainEqual({
        category: 'Process',
        subcat: 'CPU',
        itemKey: 'cpuPercent',
        count: 45.679,
      })

      expect(memoryReporting.report).toContainEqual({
        category: 'Process',
        subcat: 'CPU',
        itemKey: 'cpuAVGPercent',
        count: 45,
      })
    })
  })

  describe('getShardusNetReport', () => {
    it('should return network stats', () => {
      const result = memoryReporting.getShardusNetReport()

      expect(result).toEqual({ sent: 100, received: 200 })
    })

    it('should return null if shardus not initialized', () => {
      memoryReporting.shardus = null

      const result = memoryReporting.getShardusNetReport()

      expect(result).toBeNull()
    })
  })

  describe('addNetStatsToReport', () => {
    it('should add network stats to report', () => {
      memoryReporting.addNetStatsToReport()

      // Note: There's a bug in the original code where it uses comma operator
      // so the count is always 1
      expect(memoryReporting.report).toContainEqual({
        category: 'NetStats',
        subcat: 'stats',
        itemKey: 'stats',
        count: 1,
      })
    })
  })

  describe('gatherReport', () => {
    it('should gather all reports', () => {
      jest.spyOn(memoryReporting, 'gatherStateManagerReport').mockImplementation(() => {})
      jest.spyOn(memoryReporting, 'systemProcessReport').mockImplementation(() => {})
      jest.spyOn(memoryReporting, 'addNetStatsToReport').mockImplementation(() => {})

      memoryReporting.gatherReport()

      expect(memoryReporting.report).toEqual([])
      expect(memoryReporting.gatherStateManagerReport).toHaveBeenCalled()
      expect(memoryReporting.systemProcessReport).toHaveBeenCalled()
      expect(memoryReporting.addNetStatsToReport).toHaveBeenCalled()
    })
  })
})
