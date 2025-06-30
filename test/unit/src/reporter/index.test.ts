import Reporter from '../../../../src/reporter/index'
import * as Context from '../../../../src/p2p/Context'
import * as Archivers from '../../../../src/p2p/Archivers'
import * as CycleAutoScale from '../../../../src/p2p/CycleAutoScale'
import * as CycleChain from '../../../../src/p2p/CycleChain'
import * as Self from '../../../../src/p2p/Self'
import * as NodeList from '../../../../src/p2p/NodeList'
import * as Rotation from '../../../../src/p2p/Rotation'
import { finishedSyncingCycle } from '../../../../src/p2p/Join'
import { currentCycle } from '../../../../src/p2p/CycleCreator'
import { ipInfo, shardusGetTime } from '../../../../src/network'
import { nestedCountersInstance } from '../../../../src/utils/nestedCounters'
import { memoryReportingInstance } from '../../../../src/utils/memoryReporting'
import { getSocketReport } from '../../../../src/utils/debugUtils'
import { logFlags } from '../../../../src/logger'

jest.mock('../../../../src/http')
jest.mock('../../../../src/p2p/Context')
jest.mock('../../../../src/p2p/Archivers')
jest.mock('../../../../src/p2p/CycleAutoScale')
jest.mock('../../../../src/p2p/CycleChain')
jest.mock('../../../../src/p2p/Self')
jest.mock('../../../../src/p2p/NodeList')
jest.mock('../../../../src/p2p/Rotation')
jest.mock('../../../../src/p2p/Join')
jest.mock('../../../../src/p2p/CycleCreator')
jest.mock('../../../../src/network')
jest.mock('../../../../src/utils/nestedCounters')
jest.mock('../../../../src/utils/memoryReporting')
jest.mock('../../../../src/utils/debugUtils')
jest.mock('../../../../src/logger')

const http = require('../../../../src/http')

describe('Reporter', () => {
  let reporter: Reporter
  let mockConfig: any
  let mockLogger: any
  let mockStatistics: any
  let mockStateManager: any
  let mockProfiler: any
  let mockLoadDetection: any
  let mockShardusApp: any

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    jest.spyOn(global, 'clearTimeout')
    jest.spyOn(global, 'clearInterval')

    // Mock config
    mockConfig = {
      recipient: 'http://test-recipient.com',
      interval: 5,
      mode: 'debug',
      debug: {
        disableTxCoverageReport: false
      },
      logSocketReports: false
    }

    // Mock logger
    const mockMainLogger = {
      error: jest.fn(),
      debug: jest.fn(),
      info: jest.fn()
    }
    mockLogger = {
      getLogger: jest.fn().mockReturnValue(mockMainLogger)
    }

    // Mock statistics
    mockStatistics = {
      getPreviousElement: jest.fn().mockReturnValue(0),
      getMax: jest.fn().mockReturnValue(0),
      getAllCountedEvents: jest.fn().mockReturnValue({}),
      resetCountedEvents: jest.fn()
    }

    // Mock state manager
    mockStateManager = {
      isStateGood: jest.fn().mockReturnValue(true),
      dataRepairsStarted: 0,
      dataRepairsCompleted: 0,
      partitionObjects: {
        getPartitionReport: jest.fn().mockReturnValue({})
      },
      transactionQueue: {
        txCoverageMap: {},
        resetTxCoverageMap: jest.fn(),
        getQueueLengthBuckets: jest.fn().mockReturnValue({})
      },
      currentCycleShardData: {
        shardGlobals: {
          numPartitions: 10
        },
        nodeShardData: {
          storedPartitions: {
            partitionsCovered: 5
          }
        }
      },
      accountPatcher: {
        failedLastTrieSync: false,
        lastInSyncResult: null
      }
    }

    // Mock profiler
    mockProfiler = {}

    // Mock load detection
    mockLoadDetection = {
      getCurrentLoad: jest.fn().mockReturnValue(0.5),
      getCurrentNodeLoad: jest.fn().mockReturnValue(0.3)
    }

    // Mock shardus app
    mockShardusApp = {
      getNodeInfoAppData: jest.fn().mockReturnValue({ test: 'data' })
    }

    // Set up module mocks
    ;(Context as any).shardus = { app: mockShardusApp }
    ;(Context as any).config = mockConfig
    ;(Context as any).crypto = {}
    ;(shardusGetTime as jest.Mock).mockReturnValue(1000000)
    ;(ipInfo as any) = { ip: '127.0.0.1', port: 8080 }
    ;(logFlags as any).error = true
    ;(logFlags as any).debug = false
    ;(logFlags as any).important_as_error = false
    ;(logFlags as any).console = false
    ;(Self as any).id = 'test-node-id'
    ;(NodeList as any).activeByIdOrder = []
    ;(CycleChain as any).newest = {
      counter: 10,
      previous: 'prev-cycle',
      networkId: 'test-network',
      lost: [],
      refuted: []
    }
    ;(CycleChain as any).getNewest = jest.fn().mockReturnValue(CycleChain.newest)
    ;(CycleAutoScale as any).getDesiredCount = jest.fn().mockReturnValue(100)
    ;(CycleAutoScale as any).lastScalingType = null
    ;(CycleAutoScale as any).requestedScalingType = null
    ;(NodeList as any).getNodeListHash = jest.fn().mockReturnValue('node-list-hash')
    ;(Archivers as any).getArchiverListHash = jest.fn().mockReturnValue('archiver-list-hash')
    ;(nestedCountersInstance as any).rareEventCounters = new Map()
    ;(memoryReportingInstance as any) = {
      getMemoryStringBasic: jest.fn().mockReturnValue('memory-report'),
      getShardusNetReport: jest.fn().mockReturnValue('network-report')
    }
    ;(getSocketReport as jest.Mock).mockResolvedValue({ error: false })
    ;(finishedSyncingCycle as any) = 5
    ;(currentCycle as any) = 10

    http.post = jest.fn().mockResolvedValue({})

    reporter = new Reporter(mockConfig, mockLogger, mockStatistics, mockStateManager, mockProfiler, mockLoadDetection)
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  describe('constructor', () => {
    it('should initialize reporter with all dependencies', () => {
      expect(reporter.config).toBe(mockConfig)
      expect(reporter.statistics).toBe(mockStatistics)
      expect(reporter.stateManager).toBe(mockStateManager)
      expect(reporter.profiler).toBe(mockProfiler)
      expect(reporter.loadDetection).toBe(mockLoadDetection)
      expect(reporter.logger).toBe(mockLogger)
      expect(reporter.hasRecipient).toBe(true)
      expect(reporter.stillNeedsInitialPatchPostActive).toBe(true)
    })

    it('should initialize with no recipient when config.recipient is null', () => {
      const noRecipientConfig = { ...mockConfig, recipient: null }
      const reporterNoRecipient = new Reporter(noRecipientConfig, mockLogger, mockStatistics, mockStateManager, mockProfiler, mockLoadDetection)
      expect(reporterNoRecipient.hasRecipient).toBe(false)
    })
  })

  describe('resetStatisticsReport', () => {
    it('should reset all statistics to zero', () => {
      reporter.statisticsReport = {
        txInjected: 100,
        txApplied: 200,
        txRejected: 50,
        txProcessed: 300,
        txExpired: 10
      }
      
      reporter.resetStatisticsReport()
      
      expect(reporter.statisticsReport).toEqual({
        txInjected: 0,
        txApplied: 0,
        txRejected: 0,
        txProcessed: 0,
        txExpired: 0
      })
    })
  })

  describe('collectStatisticToReport', () => {
    it('should accumulate statistics from statistics module', () => {
      mockStatistics.getPreviousElement.mockImplementation((key: string) => {
        const values = {
          txInjected: 10,
          txApplied: 20,
          txRejected: 5,
          txExpired: 2,
          txProcessed: 30
        }
        return values[key] || 0
      })

      reporter.collectStatisticToReport()

      expect(reporter.statisticsReport.txInjected).toBe(10)
      expect(reporter.statisticsReport.txApplied).toBe(20)
      expect(reporter.statisticsReport.txRejected).toBe(5)
      expect(reporter.statisticsReport.txExpired).toBe(2)
      expect(reporter.statisticsReport.txProcessed).toBe(30)
    })

    it('should handle null statistics module', () => {
      reporter.statistics = null

      reporter.collectStatisticToReport()

      expect(reporter.statisticsReport.txInjected).toBe(0)
      expect(reporter.statisticsReport.txApplied).toBe(0)
      expect(reporter.statisticsReport.txRejected).toBe(0)
      expect(reporter.statisticsReport.txExpired).toBe(0)
      expect(reporter.statisticsReport.txProcessed).toBe(0)
    })
  })

  describe('reportJoining', () => {
    it('should send joining report when recipient exists', async () => {
      const publicKey = 'test-public-key'
      
      await reporter.reportJoining(publicKey)

      expect(http.post).toHaveBeenCalledWith(
        'http://test-recipient.com/joining',
        {
          publicKey,
          nodeIpInfo: { ip: '127.0.0.1', port: 8080 },
          appData: { test: 'data' }
        }
      )
    })

    it('should not send report when no recipient', async () => {
      reporter.hasRecipient = false

      await reporter.reportJoining('test-public-key')

      expect(http.post).not.toHaveBeenCalled()
    })

    it('should handle errors gracefully', async () => {
      const error = new Error('Network error')
      http.post.mockRejectedValue(error)
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      await reporter.reportJoining('test-public-key')

      expect(consoleSpy).toHaveBeenCalledWith(error)
      consoleSpy.mockRestore()
    })
  })

  describe('reportJoined', () => {
    it('should send joined report with nodeId and publicKey', async () => {
      const nodeId = 'test-node-id'
      const publicKey = 'test-public-key'

      await reporter.reportJoined(nodeId, publicKey)

      expect(http.post).toHaveBeenCalledWith(
        'http://test-recipient.com/joined',
        {
          publicKey,
          nodeId,
          nodeIpInfo: { ip: '127.0.0.1', port: 8080 },
          appData: { test: 'data' }
        }
      )
    })

    it('should not send report when no recipient', async () => {
      reporter.hasRecipient = false

      await reporter.reportJoined('test-node-id', 'test-public-key')

      expect(http.post).not.toHaveBeenCalled()
    })
  })

  describe('reportActive', () => {
    it('should send active report with nodeId', async () => {
      const nodeId = 'test-node-id'

      await reporter.reportActive(nodeId)

      expect(http.post).toHaveBeenCalledWith(
        'http://test-recipient.com/active',
        { nodeId }
      )
    })

    it('should not send report when no recipient', async () => {
      reporter.hasRecipient = false

      await reporter.reportActive('test-node-id')

      expect(http.post).not.toHaveBeenCalled()
    })
  })

  describe('reportSyncStatement', () => {
    it('should send sync statement report', async () => {
      const nodeId = 'test-node-id'
      const syncStatement = { test: 'sync-data' }

      await reporter.reportSyncStatement(nodeId, syncStatement)

      expect(http.post).toHaveBeenCalledWith(
        'http://test-recipient.com/sync-statement',
        { nodeId, syncStatement }
      )
    })

    it('should not send report when no recipient', async () => {
      reporter.hasRecipient = false

      await reporter.reportSyncStatement('test-node-id', {})

      expect(http.post).not.toHaveBeenCalled()
    })
  })

  describe('reportRemoved', () => {
    it('should send removed report and disable recipient', async () => {
      const nodeId = 'test-node-id'

      await reporter.reportRemoved(nodeId)

      expect(http.post).toHaveBeenCalledWith(
        'http://test-recipient.com/removed',
        { nodeId }
      )
      expect(reporter.hasRecipient).toBe(false)
    })

    it('should not send report when no recipient', async () => {
      reporter.hasRecipient = false

      await reporter.reportRemoved('test-node-id')

      expect(http.post).not.toHaveBeenCalled()
    })
  })

  describe('_sendReport', () => {
    it('should send heartbeat report with data', async () => {
      const data = { test: 'report-data' }

      await reporter._sendReport(data)

      expect(http.post).toHaveBeenCalledWith(
        'http://test-recipient.com/heartbeat',
        {
          nodeId: 'test-node-id',
          data
        }
      )
    })

    it('should not send report when no recipient', async () => {
      reporter.hasRecipient = false

      await reporter._sendReport({ test: 'data' })

      expect(http.post).not.toHaveBeenCalled()
    })

    it('should throw error when no node ID available', async () => {
      ;(Self as any).id = null

      await expect(reporter._sendReport({ test: 'data' })).rejects.toThrow('No node ID available to the Reporter module.')
    })

    it('should handle errors gracefully', async () => {
      const error = new Error('Network error')
      http.post.mockRejectedValue(error)
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      await reporter._sendReport({ test: 'data' })

      expect(consoleSpy).toHaveBeenCalledWith(error)
      consoleSpy.mockRestore()
    })
  })

  describe('getReportInterval', () => {
    it('should return 10 seconds when network has 100+ nodes', () => {
      ;(NodeList as any).activeByIdOrder = new Array(100)

      const interval = reporter.getReportInterval()

      expect(interval).toBe(10000)
    })

    it('should return config interval for smaller networks', () => {
      ;(NodeList as any).activeByIdOrder = new Array(50)

      const interval = reporter.getReportInterval()

      expect(interval).toBe(5000)
    })
  })

  describe('getAppData', () => {
    it('should return app data when function exists', () => {
      const appData = reporter.getAppData()

      expect(appData).toEqual({ test: 'data' })
      expect(mockShardusApp.getNodeInfoAppData).toHaveBeenCalled()
    })

    it('should return "unknown" when function does not exist', () => {
      ;(Context as any).shardus.app.getNodeInfoAppData = undefined

      const appData = reporter.getAppData()

      expect(appData).toBe('unknown')
    })
  })

  describe('checkIsNodeLost', () => {
    it('should return true when node is in lost list', () => {
      ;(CycleChain as any).newest.lost = ['node1', 'node2', 'test-node']

      const result = reporter.checkIsNodeLost('node2')

      expect(result).toBe(true)
    })

    it('should return false when node is not in lost list', () => {
      ;(CycleChain as any).newest.lost = ['node1', 'node2']

      const result = reporter.checkIsNodeLost('node3')

      expect(result).toBe(false)
    })

    it('should return false when lost list is empty', () => {
      ;(CycleChain as any).newest.lost = []

      const result = reporter.checkIsNodeLost('node1')

      expect(result).toBe(false)
    })
  })

  describe('checkIsNodeRefuted', () => {
    it('should return true when node is in refuted list', () => {
      ;(CycleChain as any).newest.refuted = ['node1', 'node2', 'test-node']

      const result = reporter.checkIsNodeRefuted('node2')

      expect(result).toBe(true)
    })

    it('should return false when node is not in refuted list', () => {
      ;(CycleChain as any).newest.refuted = ['node1', 'node2']

      const result = reporter.checkIsNodeRefuted('node3')

      expect(result).toBe(false)
    })

    it('should return false when refuted list is empty', () => {
      ;(CycleChain as any).newest.refuted = []

      const result = reporter.checkIsNodeRefuted('node1')

      expect(result).toBe(false)
    })
  })

  describe('report', () => {
    beforeEach(() => {
      reporter.statisticsReport = {
        txInjected: 100,
        txApplied: 200,
        txRejected: 50,
        txProcessed: 300,
        txExpired: 10
      }
      mockStatistics.getPreviousElement.mockImplementation((key: string) => {
        const values = {
          queueLength: 5,
          executeQueueLength: 3,
          txTimeInQueue: 1500
        }
        return values[key] || 0
      })
      mockStatistics.getMax.mockReturnValue(3000)
    })

    it('should send complete report with all metrics', async () => {
      await reporter.report()

      expect(http.post).toHaveBeenCalled()
      const callArgs = http.post.mock.calls[0][1]
      expect(callArgs.nodeId).toBe('test-node-id')
      expect(callArgs.data).toMatchObject({
        repairsStarted: 0,
        repairsFinished: 0,
        isDataSynced: true,
        appState: '00ff00ff', // green for good state
        cycleMarker: 'prev-cycle',
        cycleCounter: 10,
        nodelistHash: 'node-list-hash',
        desiredNodes: 100,
        txInjected: 100,
        txApplied: 200,
        txRejected: 50,
        txExpired: 10,
        txProcessed: 300,
        reportInterval: 5000,
        networkId: 'test-network',
        globalSync: true,
        partitions: 10,
        partitionsCovered: 5,
        queueLength: 3,
        executeQueueLength: 3,
        txTimeInQueue: 1.5,
        maxTxTimeInQueue: 3,
        isLost: false,
        isRefuted: false,
        stillNeedsInitialPatchPostActive: false
      })
    })

    it('should handle null CycleChain.newest', async () => {
      ;(CycleChain as any).newest = null

      await reporter.report()

      expect(http.post).not.toHaveBeenCalled()
    })

    it('should show red app state when not synced', async () => {
      mockStateManager.isStateGood.mockReturnValue(false)

      await reporter.report()

      const callArgs = http.post.mock.calls[0][1]
      expect(callArgs.data.appState).toBe('ff0000ff') // red for bad state
    })

    it('should handle null state manager partition objects', async () => {
      reporter.stateManager.partitionObjects = null
      reporter.stateManager.currentCycleShardData = null

      await reporter.report()

      const callArgs = http.post.mock.calls[0][1]
      expect(callArgs.data.partitionReport).toBeNull()
      expect(callArgs.data.globalSync).toBe(true)
      expect(callArgs.data.partitions).toBe(0)
      expect(callArgs.data.partitionsCovered).toBe(0)
    })

    it('should reset statistics and tx coverage after report', async () => {
      await reporter.report()

      expect(reporter.statisticsReport).toEqual({
        txInjected: 0,
        txApplied: 0,
        txRejected: 0,
        txProcessed: 0,
        txExpired: 0
      })
      expect(mockStateManager.transactionQueue.resetTxCoverageMap).toHaveBeenCalled()
      expect(mockStatistics.resetCountedEvents).toHaveBeenCalled()
    })

    it('should include rare counters in report', async () => {
      const rareCounters = new Map([
        ['event1', { count: 5, subCounters: new Map([['sub1', 3]]) }]
      ])
      ;(nestedCountersInstance as any).rareEventCounters = rareCounters

      await reporter.report()

      const callArgs = http.post.mock.calls[0][1]
      expect(callArgs.data.rareCounters).toEqual({
        event1: {
          count: 5,
          subCounters: {
            sub1: 3
          }
        }
      })
    })
  })

  describe('startReporting', () => {
    it('should set up reporting intervals', () => {
      reporter.startReporting()

      expect(reporter.reportingInterval).toBeDefined()
      expect(reporter.socketReportInterval).toBeDefined()
      expect(reporter.reportTimer).toBeDefined()
    })

    it('should not start if already reporting', () => {
      reporter.reportingInterval = setInterval(() => {}, 1000)
      const originalInterval = reporter.reportingInterval

      reporter.startReporting()

      expect(reporter.reportingInterval).toBe(originalInterval)
    })

    it('should collect statistics every second', () => {
      reporter.startReporting()

      jest.advanceTimersByTime(3000)

      expect(mockStatistics.getPreviousElement).toHaveBeenCalled()
      expect(reporter.statisticsReport.txInjected).toBeGreaterThanOrEqual(0)
    })

    it('should log socket report when enabled', async () => {
      reporter.config.logSocketReports = true
      reporter.startReporting()

      jest.advanceTimersByTime(300000)
      await Promise.resolve()

      expect(getSocketReport).toHaveBeenCalled()
    })

    it('should clear socket interval on error', async () => {
      reporter.config.logSocketReports = true
      ;(getSocketReport as jest.Mock).mockResolvedValue({ error: true })
      
      reporter.startReporting()

      // Advance timers to trigger the interval
      jest.advanceTimersByTime(300000)
      
      // Wait for all promises to resolve, including the async interval callback
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()

      expect(clearInterval).toHaveBeenCalled()
    })
  })

  describe('stopReporting', () => {
    it('should clear all intervals and timers', () => {
      reporter.startReporting()
      
      reporter.stopReporting()

      expect(reporter.reportingInterval).toBeNull()
      expect(clearTimeout).toHaveBeenCalled()
      expect(clearInterval).toHaveBeenCalledTimes(2)
    })
  })

  describe('restartReportInterval', () => {
    it('should clear existing timer and set new one', () => {
      reporter.reportTimer = setTimeout(() => {}, 1000)
      
      reporter['restartReportInterval']()

      expect(clearTimeout).toHaveBeenCalled()
      expect(reporter.reportTimer).toBeDefined()
    })

    it('should use dynamic interval based on network size', () => {
      ;(NodeList as any).activeByIdOrder = new Array(150)
      
      reporter['restartReportInterval']()
      
      jest.advanceTimersByTime(10000)
      
      expect(http.post).toHaveBeenCalled()
    })
  })

  describe('consoleReport', () => {
    beforeEach(() => {
      reporter.lastTime = 1000000
      ;(shardusGetTime as jest.Mock).mockReturnValue(2000000)
      mockStatistics.getPreviousElement.mockImplementation((key: string) => {
        const values = {
          txInjected: 100,
          txApplied: 80
        }
        return values[key] || 0
      })
    })

    it('should log performance report to console when enabled', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      ;(logFlags as any).console = true

      reporter.consoleReport()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Perf inteval 1000')
      )
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('100 Injected @0.1 per second')
      )
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('80 Applied @0.08 per second')
      )
      expect(reporter.lastTime).toBe(2000000)
      consoleSpy.mockRestore()
    })

    it('should not log to console when disabled', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      ;(logFlags as any).console = false

      reporter.consoleReport()

      expect(consoleSpy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should handle null statistics module', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      ;(logFlags as any).console = true
      reporter.statistics = null

      reporter.consoleReport()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('0 Injected @0 per second')
      )
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('0 Applied @0 per second')
      )
      consoleSpy.mockRestore()
    })

    it('should log profiler and load information when profiler exists', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      ;(logFlags as any).console = true
      reporter.profiler = mockProfiler

      reporter.consoleReport()

      expect(consoleSpy).toHaveBeenCalledWith(
        'Current load',
        'counter',
        10,
        0.5
      )
      consoleSpy.mockRestore()
    })

    it('should not log profiler info when profiler is null', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      ;(logFlags as any).console = true
      reporter.profiler = null

      reporter.consoleReport()

      expect(consoleSpy).toHaveBeenCalledTimes(1) // Only the perf report
      consoleSpy.mockRestore()
    })

    it('should calculate delta time correctly', () => {
      reporter.lastTime = 1000000
      ;(shardusGetTime as jest.Mock).mockReturnValue(1005000)
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      ;(logFlags as any).console = true

      reporter.consoleReport()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Perf inteval 5')
      )
      consoleSpy.mockRestore()
    })
  })

  describe('edge cases', () => {
    it('should handle missing app data function gracefully', () => {
      ;(Context as any).shardus.app = {}

      const appData = reporter.getAppData()

      expect(appData).toBe('unknown')
    })

    it('should handle stillNeedsInitialPatchPostActive logic', async () => {
      reporter.stillNeedsInitialPatchPostActive = true
      ;(currentCycle as any) = 6
      ;(finishedSyncingCycle as any) = 5
      mockStateManager.accountPatcher.failedLastTrieSync = false

      await reporter.report()

      expect(reporter.stillNeedsInitialPatchPostActive).toBe(false)
    })

    it('should maintain stillNeedsInitialPatchPostActive when not synced', async () => {
      reporter.stillNeedsInitialPatchPostActive = true
      ;(currentCycle as any) = 6
      ;(finishedSyncingCycle as any) = 5
      mockStateManager.accountPatcher.failedLastTrieSync = true

      await reporter.report()

      expect(reporter.stillNeedsInitialPatchPostActive).toBe(true)
    })

    it('should handle tx coverage report when disabled', async () => {
      mockConfig.debug.disableTxCoverageReport = true
      reporter.config = mockConfig

      await reporter.report()

      expect(mockStateManager.transactionQueue.resetTxCoverageMap).not.toHaveBeenCalled()
    })

    it('should handle missing nodeId in various report methods', async () => {
      const originalId = Self.id
      ;(Self as any).id = null

      await expect(reporter._sendReport({ test: 'data' })).rejects.toThrow()
      
      ;(Self as any).id = originalId
    })

    it('should handle config mode not being debug', async () => {
      mockConfig.mode = 'production'
      reporter.config = mockConfig

      await reporter.report()

      const callArgs = http.post.mock.calls[0][1]
      expect(callArgs.data.txCoverage).toEqual({})
    })
  })
})