import AccountSync from '../../../../src/state-manager/AccountSync'
import * as utils from '../../../../src/utils'
import { logFlags } from '../../../../src/logger'

// Mock p2p/Context 
jest.mock('../../../../src/p2p/Context', () => ({
  config: {
    stateManager: {
      fifoUnlockFix: false,
      fifoUnlockFix2: false,
      accountBucketSize: 200,
      maxDataSyncRestarts: 5
    },
    p2p: {
      useBinarySerializedEndpoints: true,
      getGloablAccountReportBinary: true
    }
  },
  P2PModuleContext: jest.fn(),
  setDefaultConfigs: jest.fn(),
  network: {
    registerExternalGet: jest.fn()
  },
  reporter: {
    reportSyncStatement: jest.fn()
  }
}))

// Mock logger with logFlags
jest.mock('../../../../src/logger', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    getLogger: jest.fn(() => ({
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn()
    })),
    playbackLogNote: jest.fn(),
    playbackLogState: jest.fn()
  })),
  logFlags: {
    debug: false,
    error: false,
    console: false,
    playback: false,
    verbose: false
  }
}))

jest.mock('../../../../src/network', () => ({
  shardusGetTime: jest.fn(() => Date.now())
}))

jest.mock('../../../../src/p2p/Self', () => ({
  p2pJoinTime: 1000,
  p2pSyncStart: 2000,
  p2pSyncEnd: 3000,
  id: 'test-node-id'
}))

jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
    countRareEvent: jest.fn()
  }
}))

jest.mock('../../../../src/p2p/Modes', () => ({
  networkMode: 'forming'
}))

jest.mock('../../../../src/snapshot', () => ({
  safetyModeVals: {
    safetyMode: false
  }
}))

jest.mock('../../../../src/p2p/Archivers', () => ({
  getArchiversList: jest.fn(() => [])
}))

jest.mock('../../../../src/p2p/Utils', () => ({
  robustQuery: jest.fn()
}))

jest.mock('../../../../src/utils', () => ({
  sleep: jest.fn(() => Promise.resolve()),
  stringifyReduce: jest.fn((obj: any) => JSON.stringify(obj)),
  stringifyReduceLimit: jest.fn((obj: any) => JSON.stringify(obj)),
  makeShortHash: jest.fn((id: string) => id.slice(0, 8)),
  isValidShardusAddress: jest.fn(() => true),
  errorToStringFull: jest.fn((e: any) => e.toString())
}))

jest.mock('../../../../src/state-manager/shardFunctions', () => ({
  __esModule: true,
  default: {
    partitionToAddressRange2: jest.fn(() => ({
      low: '0000',
      high: 'ffff'
    })),
    getNextAdjacentAddresses: jest.fn(() => ({
      address1: '0001',
      address2: '0002'
    }))
  }
}))

jest.mock('../../../../src/state-manager/NodeSyncTracker', () => ({
  __esModule: true,
  default: jest.fn(() => {
    return {
      initByRange: jest.fn(),
      initGlobal: jest.fn(),
      syncStateDataForRange2: jest.fn(),
      syncStateDataGlobals: jest.fn()
    }
  })
}))

jest.mock('../../../../src/state-manager/ArchiverSyncTracker', () => ({
  __esModule: true,
  default: jest.fn(() => {
    return {
      initByRange: jest.fn(),
      initGlobal: jest.fn(),
      syncStateDataForRange2: jest.fn(),
      syncStateDataGlobals: jest.fn()
    }
  })
}))

// Minimal mocks for types
jest.mock('../../../../src/types/enum/InternalRouteEnum', () => ({
  InternalRouteEnum: {
    binary_get_account_data: 'binary_get_account_data',
    binary_get_account_data_by_list: 'binary_get_account_data_by_list',
    binary_get_globalaccountreport: 'binary_get_globalaccountreport'
  }
}))

jest.mock('../../../../src/types/ajv/Helpers', () => ({
  verifyPayload: jest.fn(() => null)
}))

jest.mock('../../../../src/types/GetAccountDataReq', () => ({
  deserializeGetAccountDataReq: jest.fn(),
  verifyGetAccountDataReq: jest.fn(() => true)
}))

jest.mock('../../../../src/types/GetAccountDataResp', () => ({
  serializeGetAccountDataResp: jest.fn()
}))

jest.mock('../../../../src/types/GetAccountDataByListReq', () => ({
  deserializeGetAccountDataByListReq: jest.fn()
}))

jest.mock('../../../../src/types/GetAccountDataByListResp', () => ({
  serializeGetAccountDataByListResp: jest.fn()
}))

jest.mock('../../../../src/types/GlobalAccountReportReq', () => ({
  serializeGlobalAccountReportReq: jest.fn()
}))

jest.mock('../../../../src/types/GlobalAccountReportResp', () => ({
  deserializeGlobalAccountReportResp: jest.fn()
}))

jest.mock('../../../../src/types/ResponseError', () => ({
  BadRequest: jest.fn((msg) => ({ error: msg })),
  InternalError: jest.fn((msg) => ({ error: msg })),
  serializeResponseError: jest.fn()
}))

jest.mock('../../../../src/types/Helpers', () => ({
  getStreamWithTypeCheck: jest.fn()
}))

jest.mock('../../../../src/types/enum/TypeIdentifierEnum', () => ({
  TypeIdentifierEnum: {
    cGetAccountDataReq: 1,
    cGetAccountDataByListReq: 2
  }
}))

jest.mock('../../../../src/http', () => ({
  post: jest.fn()
}))

// Mock state-manager to avoid circular dependency issues
jest.mock('../../../../src/state-manager', () => ({
  __esModule: true,
  default: jest.fn()
}))

describe('AccountSync', () => {
  let accountSync: AccountSync
  let mockStateManager: any
  let mockProfiler: any
  let mockApp: any
  let mockLogger: any
  let mockStorage: any
  let mockP2P: any
  let mockCrypto: any
  let mockConfig: any

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Create mock instances
    mockStateManager = {
      fifoLocks: {},
      forceUnlockAllFifoLocks: jest.fn(),
      fifoLock: jest.fn().mockResolvedValue(1),
      fifoUnlock: jest.fn(),
      testAccountDataWrapped: jest.fn(),
      getAccountDataByRangeSmart: jest.fn().mockResolvedValue({
        wrappedAccounts: [],
        wrappedAccounts2: [],
        lastUpdateNeeded: false,
        highestTs: 0
      }),
      isNodeValidForInternalMessage: jest.fn().mockReturnValue(true),
      currentCycleShardData: {
        cycleNumber: 1,
        hasCompleteData: true,
        nodes: [],
        nodeShardData: {
          homePartition: 0,
          storedPartitions: {
            rangeIsSplit: false,
            partitionStart: 0,
            partitionEnd: 10
          }
        },
        shardGlobals: {
          numPartitions: 10
        },
        parititionShardDataMap: new Map()
      },
      accountGlobals: {
        hasknownGlobals: false,
        getGlobalListEarly: jest.fn()
      },
      statemanager_fatal: jest.fn(),
      getCurrentCycleShardData: jest.fn(),
      initApoptosisAndQuitSyncing: jest.fn(),
      transactionQueue: {
        getQueueEntry: jest.fn(),
        updateTxState: jest.fn(),
        updateHomeInformation: jest.fn(),
        queueEntryGetTransactionGroup: jest.fn()
      }
    }

    mockProfiler = {
      scopedProfileSectionStart: jest.fn(),
      scopedProfileSectionEnd: jest.fn()
    }

    mockApp = {
      deleteLocalAccountData: jest.fn().mockResolvedValue(undefined),
      getAccountDataByList: jest.fn().mockResolvedValue([])
    }

    mockLogger = {
      getLogger: jest.fn(() => ({
        debug: jest.fn(),
        error: jest.fn(),
        info: jest.fn()
      })),
      playbackLogNote: jest.fn(),
      playbackLogState: jest.fn()
    }

    mockStorage = {
      clearAppRelatedState: jest.fn().mockResolvedValue(undefined)
    }

    mockP2P = {
      isFirstSeed: false,
      registerInternalBinary: jest.fn(),
      askBinary: jest.fn(),
      ask: jest.fn(),
      state: {
        getActiveNodes: jest.fn(() => [])
      }
    }

    mockCrypto = {
      sign: jest.fn()
    }

    mockConfig = {
      stateManager: {
        fifoUnlockFix: false,
        fifoUnlockFix2: false,
        accountBucketSize: 200,
        maxDataSyncRestarts: 5
      },
      p2p: {
        useBinarySerializedEndpoints: true,
        getGloablAccountReportBinary: true
      }
    }

    // Create AccountSync instance
    accountSync = new AccountSync(
      mockStateManager,
      mockProfiler,
      mockApp,
      mockLogger,
      mockStorage,
      mockP2P,
      mockCrypto,
      mockConfig
    )
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with correct default values', () => {
      expect(accountSync.dataSyncMainPhaseComplete).toBe(false)
      expect(accountSync.globalAccountsSynced).toBe(false)
      expect(accountSync.isSyncingAcceptedTxs).toBe(false)
      expect(accountSync.readyforTXs).toBe(false)
      expect(accountSync.syncTrackers).toEqual([])
      expect(accountSync.runtimeSyncTrackerSyncing).toBe(false)
      expect(accountSync.syncTrackerIndex).toBe(1)
    })

    it('should initialize sync statement with correct values', () => {
      expect(accountSync.syncStatement).toEqual({
        cycleStarted: -1,
        cycleEnded: -1,
        numCycles: -1,
        syncComplete: false,
        numNodesOnStart: 0,
        p2pJoinTime: 1000,
        timeBeforeDataSync: 0,
        timeBeforeDataSync2: 0,
        totalSyncTime: 0,
        syncStartTime: 0,
        syncEndTime: 0,
        syncSeconds: 0,
        syncRanges: 0,
        failedAccountLoops: 0,
        failedAccounts: 0,
        failAndRestart: 0,
        discardedTXs: 0,
        nonDiscardedTXs: 0,
        numSyncedState: 0,
        numAccounts: 0,
        numGlobalAccounts: 0,
        internalFlag: false
      })
    })

    it('should set softSync flags correctly', () => {
      expect(accountSync.softSync_earlyOut).toBe(false)
      expect(accountSync.softSync_noSyncDelay).toBe(true)
      expect(accountSync.softSync_checkInitialFlag).toBe(false)
    })

    it('should initialize debug flags to false', () => {
      expect(accountSync.dataSourceTest).toBe(false)
      expect(accountSync.debugFail1).toBe(false)
      expect(accountSync.debugFail2).toBe(false)
      expect(accountSync.debugFail3).toBe(false)
      expect(accountSync.debugFail4).toBe(false)
    })

    it('should initialize other properties correctly', () => {
      expect(accountSync.initalSyncFinished).toBe(false)
      expect(accountSync.initalSyncRemaining).toBe(0)
      expect(accountSync.forceSyncComplete).toBe(false)
      expect(accountSync.lastWinningGlobalReportNodes).toEqual([])
      expect(accountSync.isSyncStatementCompleted).toBe(false)
    })
  })

  describe('clearSyncData', () => {
    it('should clear fifo locks when fifoUnlockFix is false', () => {
      accountSync.clearSyncData()
      expect(mockStateManager.fifoLocks).toEqual({})
      expect(mockStateManager.forceUnlockAllFifoLocks).not.toHaveBeenCalled()
    })

    it('should force unlock fifo locks when fifoUnlockFix is true', () => {
      mockConfig.stateManager.fifoUnlockFix = true
      accountSync.clearSyncData()
      expect(mockStateManager.forceUnlockAllFifoLocks).toHaveBeenCalledWith('clearSyncData')
    })
  })

  describe('clearSyncTrackers', () => {
    it('should clear all sync trackers', () => {
      // Add some mock sync trackers
      accountSync.syncTrackers = [
        { id: 1 } as any,
        { id: 2 } as any
      ]
      
      accountSync.clearSyncTrackers()
      
      expect(accountSync.syncTrackers).toEqual([])
    })
  })

  describe('setupHandlers', () => {
    it('should register internal binary handlers', () => {
      accountSync.setupHandlers()
      
      expect(mockP2P.registerInternalBinary).toHaveBeenCalledTimes(2)
      expect(mockP2P.registerInternalBinary).toHaveBeenCalledWith(
        'binary_get_account_data',
        expect.any(Function)
      )
      expect(mockP2P.registerInternalBinary).toHaveBeenCalledWith(
        'binary_get_account_data_by_list',
        expect.any(Function)
      )
    })

    it('should register external GET endpoints', () => {
      const Context = require('../../../../src/p2p/Context')
      
      // Reinitialize the mock in case it was cleared
      Context.network = {
        registerExternalGet: jest.fn()
      }
      
      accountSync.setupHandlers()
      
      expect(Context.network.registerExternalGet).toHaveBeenCalledWith(
        'sync-globals',
        expect.any(Function),
        expect.any(Function)
      )
      expect(Context.network.registerExternalGet).toHaveBeenCalledWith(
        'sync-statement',
        expect.any(Function),
        expect.any(Function)
      )
      expect(Context.network.registerExternalGet).toHaveBeenCalledWith(
        'forceFinishSync',
        expect.any(Function),
        expect.any(Function)
      )
      expect(Context.network.registerExternalGet).toHaveBeenCalledWith(
        'dataSourceTest',
        expect.any(Function),
        expect.any(Function)
      )
    })
  })

  describe('skipSync', () => {
    it('should set correct flags when skipping sync', () => {
      accountSync.skipSync()
      
      expect(accountSync.dataSyncMainPhaseComplete).toBe(true)
      expect(accountSync.syncStatement.syncComplete).toBe(true)
      expect(accountSync.readyforTXs).toBe(true)
    })
  })

  describe('setGlobalSyncFinished', () => {
    it('should set globalAccountsSynced to true', () => {
      expect(accountSync.globalAccountsSynced).toBe(false)
      
      accountSync.setGlobalSyncFinished()
      
      expect(accountSync.globalAccountsSynced).toBe(true)
    })
  })

  describe('syncStatmentIsComplete', () => {
    it('should update totalSyncTime and clear sync trackers', () => {
      const mockTime = 10000
      const networkModule = require('../../../../src/network')
      networkModule.shardusGetTime.mockReturnValue(mockTime)
      
      // Add some mock sync trackers
      accountSync.syncTrackers = [{ id: 1 } as any]
      
      accountSync.syncStatmentIsComplete()
      
      expect(accountSync.syncStatement.totalSyncTime).toBe((mockTime - 2000) / 1000) // p2pSyncStart is 2000
      expect(accountSync.readyforTXs).toBe(true)
      expect(accountSync.syncTrackers).toEqual([])
      expect(accountSync.isSyncStatementCompleted).toBe(true)
    })

    it('should report sync statement', () => {
      const Context = require('../../../../src/p2p/Context')
      const mockTime = 10000
      const networkModule = require('../../../../src/network')
      networkModule.shardusGetTime.mockReturnValue(mockTime)
      
      accountSync.syncStatmentIsComplete()
      
      expect(Context.reporter.reportSyncStatement).toHaveBeenCalledWith(
        'test-node-id',
        expect.objectContaining({
          totalSyncTime: (mockTime - 2000) / 1000
        })
      )
    })
  })

  describe('failAndDontRestartSync', () => {
    it('should clear sync data and trackers', () => {
      // Add some mock sync trackers
      accountSync.syncTrackers = [{ id: 1 } as any]
      mockStateManager.fifoLocks = { test: 'lock' }
      
      accountSync.failAndDontRestartSync()
      
      expect(mockStateManager.fifoLocks).toEqual({})
      expect(accountSync.syncTrackers).toEqual([])
    })
  })

  describe('createSyncTrackerByRange', () => {
    it('should create a NodeSyncTracker when syncFromArchiver is false', () => {
      const NodeSyncTracker = require('../../../../src/state-manager/NodeSyncTracker').default
      // Ensure the mock returns a new instance with methods
      NodeSyncTracker.mockImplementation(() => ({
        initByRange: jest.fn(),
        initGlobal: jest.fn(),
        syncStateDataForRange2: jest.fn(),
        syncStateDataGlobals: jest.fn()
      }))
      
      const mockRange = { startAddr: 0, endAddr: 1000, low: '0000', high: 'ffff' }
      const cycle = 5
      
      const tracker = accountSync.createSyncTrackerByRange(mockRange, cycle, true, false)
      
      expect(NodeSyncTracker).toHaveBeenCalled()
      expect(tracker.initByRange).toHaveBeenCalledWith(
        accountSync,
        mockP2P,
        1, // syncTrackerIndex starts at 1
        mockRange,
        cycle,
        true
      )
      expect(accountSync.syncTrackers).toContain(tracker)
      expect(accountSync.syncTrackerIndex).toBe(2)
      expect(accountSync.initalSyncRemaining).toBe(1)
    })

    it('should create an ArchiverSyncTracker when syncFromArchiver is true', () => {
      const ArchiverSyncTracker = require('../../../../src/state-manager/ArchiverSyncTracker').default
      // Ensure the mock returns a new instance with methods
      ArchiverSyncTracker.mockImplementation(() => ({
        initByRange: jest.fn(),
        initGlobal: jest.fn(),
        syncStateDataForRange2: jest.fn(),
        syncStateDataGlobals: jest.fn()
      }))
      
      const mockRange = { startAddr: 0, endAddr: 1000, low: '0000', high: 'ffff' }
      const cycle = 5
      
      const tracker = accountSync.createSyncTrackerByRange(mockRange, cycle, true, true)
      
      expect(ArchiverSyncTracker).toHaveBeenCalled()
      expect(tracker.initByRange).toHaveBeenCalled()
      expect(accountSync.syncTrackers).toContain(tracker)
    })

    it('should not increment initalSyncRemaining when initalSync is false', () => {
      const NodeSyncTracker = require('../../../../src/state-manager/NodeSyncTracker').default
      NodeSyncTracker.mockImplementation(() => ({
        initByRange: jest.fn(),
        initGlobal: jest.fn(),
        syncStateDataForRange2: jest.fn(),
        syncStateDataGlobals: jest.fn()
      }))
      
      const mockRange = { startAddr: 0, endAddr: 1000, low: '0000', high: 'ffff' }
      const cycle = 5
      accountSync.initalSyncRemaining = 0
      
      accountSync.createSyncTrackerByRange(mockRange, cycle, false, false)
      
      expect(accountSync.initalSyncRemaining).toBe(0)
    })
  })

  describe('createSyncTrackerByForGlobals', () => {
    it('should create a global sync tracker', () => {
      const NodeSyncTracker = require('../../../../src/state-manager/NodeSyncTracker').default
      NodeSyncTracker.mockImplementation(() => ({
        initByRange: jest.fn(),
        initGlobal: jest.fn(),
        syncStateDataForRange2: jest.fn(),
        syncStateDataGlobals: jest.fn()
      }))
      
      const cycle = 5
      
      const tracker = accountSync.createSyncTrackerByForGlobals(cycle, true, false)
      
      expect(NodeSyncTracker).toHaveBeenCalled()
      expect(tracker.initGlobal).toHaveBeenCalledWith(
        accountSync,
        mockP2P,
        1,
        cycle,
        true
      )
      expect(accountSync.syncTrackers).toContain(tracker)
      expect(accountSync.syncTrackerIndex).toBe(2)
      expect(accountSync.initalSyncRemaining).toBe(1)
    })
  })

  describe('getSyncTracker', () => {
    it('should return sync tracker for address within range', () => {
      const mockTracker = {
        isGlobalSyncTracker: false,
        range: { low: '0000', high: '5000' },
        globalAddressMap: {}
      }
      accountSync.syncTrackers = [mockTracker as any]
      
      const result = accountSync.getSyncTracker('2500')
      
      expect(result).toBe(mockTracker)
    })

    it('should return global sync tracker for global address', () => {
      const mockTracker = {
        isGlobalSyncTracker: true,
        globalAddressMap: { 'global123': true },
        range: { low: '', high: '' }
      }
      accountSync.syncTrackers = [mockTracker as any]
      
      const result = accountSync.getSyncTracker('global123')
      
      expect(result).toBe(mockTracker)
    })

    it('should return null when no tracker found', () => {
      accountSync.syncTrackers = []
      
      const result = accountSync.getSyncTracker('test-address')
      
      expect(result).toBeNull()
    })
  })

  describe('reSyncGlobals', () => {
    it('should create a new global sync tracker', () => {
      const NodeSyncTracker = require('../../../../src/state-manager/NodeSyncTracker').default
      NodeSyncTracker.mockImplementation(() => ({
        initByRange: jest.fn(),
        initGlobal: jest.fn(),
        syncStateDataForRange2: jest.fn(),
        syncStateDataGlobals: jest.fn()
      }))
      
      mockStateManager.currentCycleShardData.cycleNumber = 10
      
      accountSync.reSyncGlobals()
      
      expect(accountSync.syncTrackers).toHaveLength(1)
      expect(accountSync.syncTrackers[0].initGlobal).toHaveBeenCalledWith(
        accountSync,
        mockP2P,
        1,
        10,
        false
      )
    })
  })
})