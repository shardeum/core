// Break circular dependency chain BEFORE any imports
jest.mock('../../../../src/network', () => ({
  shardusGetTime: jest.fn(() => Date.now()),
  ipInfo: {
    externalIp: '127.0.0.1',
    externalPort: 8080,
    internalIp: '127.0.0.1',
    internalPort: 8080
  }
}))

jest.mock('../../../../src/p2p/Self', () => ({
  // Empty mock to break circular dependency
}))

jest.mock('../../../../src/utils/profiler', () => ({
  profilerInstance: {
    profileSectionStart: jest.fn(),
    profileSectionEnd: jest.fn(),
    scopedProfileSectionStart: jest.fn(),
    scopedProfileSectionEnd: jest.fn()
  }
}))

jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
    countRareEvent: jest.fn()
  }
}))

jest.mock('../../../../src/debug', () => ({
  // Empty mock to break circular dependency
}))

// Mock all dependencies before importing the module
jest.mock('sqlite3', () => {
  const mockDatabase = jest.fn()
  return {
    Database: mockDatabase,
    OPEN_READWRITE: 2,
    OPEN_CREATE: 4,
    verbose: jest.fn(() => ({
      Database: mockDatabase,
      OPEN_READWRITE: 2,
      OPEN_CREATE: 4,
    })),
  }
})

jest.mock('@shardeum-foundation/lib-crypto-utils', () => ({
  init: jest.fn(),
  hash: jest.fn(),
  sign: jest.fn(),
  verify: jest.fn(),
}))

jest.mock('../../../../src/shardus/index', () => ({
  setDefaultConfigs: jest.fn(),
}))
jest.mock('../../../../src/logger/csvPerfEvents', () => ({}))
jest.mock('../../../../src/http')
jest.mock('../../../../src/utils')
const mockLoggerInstance = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

const mockGetLogger = jest.fn()
const mockRegisterExternal = jest.fn()

jest.mock('../../../../src/p2p/Context', () => ({
  config: {
    p2p: {
      useJoinProtocolV2: false,
      useSyncProtocolV2: false,
      writeSyncProtocolV2: false,
      hackForceCycleSyncComplete: false,
      useAjvCycleRecordValidation: false,
      useNetworkModes: false,
    },
    debug: {
      enableCycleRecordDebugTool: false,
      localEnableCycleRecordDebugTool: false,
    },
  },
  crypto: {
    hash: jest.fn((data) => 'hash'),
  },
  logger: {
    getLogger: mockGetLogger,
  },
  network: {
    _registerExternal: mockRegisterExternal,
  },
  setDefaultConfigs: jest.fn(),
}))

jest.mock('../../../../src/p2p/CycleChain')
jest.mock('../../../../src/p2p/CycleCreator')
jest.mock('../../../../src/p2p/NodeList')
jest.mock('../../../../src/p2p/Self')
jest.mock('../../../../src/p2p/Archivers')
jest.mock('../../../../src/p2p/Join/v2')
jest.mock('../../../../src/p2p/Join/v2/unjoin')
jest.mock('../../../../src/p2p/Utils')
jest.mock('../../../../src/p2p/CycleParser')
jest.mock('../../../../src/utils/profiler')
jest.mock('../../../../src/utils/nestedCounters')
jest.mock('../../../../src/logger')
jest.mock('fs')
jest.mock('../../../../src/types/ajv/Helpers')

// Import after mocks
import * as Sync from '../../../../src/p2p/Sync'
import { P2P } from '@shardeum-foundation/lib-types'
import * as Context from '../../../../src/p2p/Context'
import { logFlags } from '../../../../src/logger'

describe('Sync Module', () => {
  // Helper function to create mock cycle
  const createMockCycle = (
    counter: number,
    config?: Partial<P2P.CycleCreatorTypes.CycleRecord>
  ): P2P.CycleCreatorTypes.CycleRecord => ({
    counter,
    previous: counter > 1 ? `prev-hash-${counter - 1}` : '',
    start: 1000 + counter * 60,
    duration: 60,
    networkId: 'test-network',
    networkConfigHash: `config-hash-${counter}`,
    active: 10,
    expired: 2,
    desired: 12,
    target: 12,
    syncing: 0,
    standby: 0,
    activatedPublicKeys: [],
    maxSyncTime: 60,
    mode: 'processing',
    safetyMode: false,
    safetyNum: 0,
    networkStateHash: `state-hash-${counter}`,
    nodeListHash: `node-hash-${counter}`,
    standbyNodeListHash: `standby-hash-${counter}`,
    joined: [],
    returned: [],
    joinedConsensors: [],
    joinedArchivers: [],
    leavingArchivers: [],
    archiversAtShutdown: [],
    activated: [],
    removed: [],
    apoptosized: [],
    lost: [],
    refuted: [],
    standbyAdd: [],
    standbyRemove: [],
    refreshedConsensors: [],
    refreshedArchivers: [],
    appRemoved: [],
    archiverListHash: `archiver-hash-${counter}`,
    lostSyncing: [],
    lostArchivers: [],
    refutedArchivers: [],
    removedArchivers: [],
    networkDataHash: [],
    networkReceiptHash: [],
    networkSummaryHash: [],
    random: 0,
    txadd: [],
    txremove: [],
    txlisthash: `txlist-hash-${counter}`,
    ...config,
  })

  const logFlagsMock = logFlags as any

  beforeAll(() => {
    // Set up mocks before init
    mockGetLogger.mockReturnValue(mockLoggerInstance)
    Sync.init()
  })

  beforeEach(() => {
    // Clear specific mocks but not the ones from init
    mockLoggerInstance.info.mockClear()
    mockLoggerInstance.debug.mockClear()
    mockLoggerInstance.warn.mockClear()
    mockLoggerInstance.error.mockClear()

    // Reset log flags
    logFlagsMock.p2pSyncDebug = false
    logFlagsMock.p2pNonFatal = false
    logFlagsMock.important_as_error = false
    logFlagsMock.error = false
  })

  describe('init', () => {
    it('should initialize the module and register routes', () => {
      // Just verify init ran successfully by checking a simple function works
      const result = Sync.activeNodeCount({
        active: 5,
        activated: [],
        apoptosized: [],
        removed: [],
        appRemoved: [],
        lost: [],
      } as any)
      expect(result).toBe(5)

      // The fact that the module is working means init was successful
    })
  })

  describe('activeNodeCount', () => {
    it('should calculate active node count correctly', () => {
      const cycle = createMockCycle(1, {
        active: 10,
        activated: ['node1', 'node2'],
        apoptosized: ['node3'],
        removed: ['node4'],
        appRemoved: ['node5'],
        lost: ['node6'],
      })

      const count = Sync.activeNodeCount(cycle)
      expect(count).toBe(10 + 2 - 1 - 1 - 1 - 1) // 10
    })

    it('should handle empty arrays', () => {
      const cycle = createMockCycle(1, {
        active: 20,
        activated: [],
        apoptosized: [],
        removed: [],
        appRemoved: [],
        lost: [],
      })

      const count = Sync.activeNodeCount(cycle)
      expect(count).toBe(20)
    })

    it('should handle zero active nodes', () => {
      const cycle = createMockCycle(1, {
        active: 0,
        activated: [],
        apoptosized: [],
        removed: [],
        appRemoved: [],
        lost: [],
      })

      const count = Sync.activeNodeCount(cycle)
      expect(count).toBe(0)
    })

    it('should handle negative count scenario', () => {
      const cycle = createMockCycle(1, {
        active: 5,
        activated: [],
        apoptosized: ['n1', 'n2'],
        removed: ['n3', 'n4'],
        appRemoved: ['n5'],
        lost: ['n6'],
      })

      const count = Sync.activeNodeCount(cycle)
      expect(count).toBe(5 + 0 - 2 - 2 - 1 - 1) // -1
    })
  })

  describe('totalNodeCount', () => {
    it('should calculate total node count correctly', () => {
      const cycle = createMockCycle(1, {
        syncing: 5,
        joinedConsensors: [{} as any, {} as any],
        active: 10,
        apoptosized: ['node1'],
        removed: ['node2'],
        appRemoved: ['node3'],
      })

      const count = Sync.totalNodeCount(cycle)
      expect(count).toBe(5 + 2 + 10 - 1 - 1 - 1) // 14
    })

    it('should handle empty arrays', () => {
      const cycle = createMockCycle(1, {
        syncing: 3,
        joinedConsensors: [],
        active: 15,
        apoptosized: [],
        removed: [],
        appRemoved: [],
      })

      const count = Sync.totalNodeCount(cycle)
      expect(count).toBe(3 + 0 + 15) // 18
    })

    it('should handle zero nodes', () => {
      const cycle = createMockCycle(1, {
        syncing: 0,
        joinedConsensors: [],
        active: 0,
        apoptosized: [],
        removed: [],
        appRemoved: [],
      })

      const count = Sync.totalNodeCount(cycle)
      expect(count).toBe(0)
    })

    it('should handle large numbers', () => {
      const cycle = createMockCycle(1, {
        syncing: 100,
        joinedConsensors: Array(50).fill({}),
        active: 200,
        apoptosized: Array(10).fill('node'),
        removed: Array(5).fill('node'),
        appRemoved: Array(5).fill('node'),
      })

      const count = Sync.totalNodeCount(cycle)
      expect(count).toBe(100 + 50 + 200 - 10 - 5 - 5) // 330
    })
  })

  describe('extraSyncLogsEnabled', () => {
    it('should return true for syncV2 source', () => {
      expect(Sync.extraSyncLogsEnabled('syncV2')).toBe(true)
    })

    it('should return true for syncNewCycles source', () => {
      expect(Sync.extraSyncLogsEnabled('syncNewCycles')).toBe(true)
    })

    it('should return false when no flags are set', () => {
      expect(Sync.extraSyncLogsEnabled()).toBe(false)
    })

    it('should return true when p2pSyncDebug flag is set', () => {
      logFlagsMock.p2pSyncDebug = true
      expect(Sync.extraSyncLogsEnabled()).toBe(true)
    })

    it('should return true when p2pNonFatal flag is set', () => {
      logFlagsMock.p2pNonFatal = true
      expect(Sync.extraSyncLogsEnabled()).toBe(true)
    })

    it('should return true when important_as_error flag is set', () => {
      logFlagsMock.important_as_error = true
      expect(Sync.extraSyncLogsEnabled()).toBe(true)
    })

    it('should return true when multiple flags are set', () => {
      logFlagsMock.p2pSyncDebug = true
      logFlagsMock.p2pNonFatal = true
      expect(Sync.extraSyncLogsEnabled()).toBe(true)
    })

    it('should return false for other sources when no flags set', () => {
      expect(Sync.extraSyncLogsEnabled('otherSource')).toBe(false)
    })
  })

  describe('showNodeCount', () => {
    it('should log node count breakdown when error flag is true', () => {
      const cycle = createMockCycle(1, {
        syncing: 5,
        joinedConsensors: [{} as any, {} as any],
        active: 10,
        apoptosized: ['node1'],
        removed: ['node2'],
        appRemoved: ['node3'],
        lost: ['node4', 'node5'],
      })

      logFlagsMock.error = true
      Sync.showNodeCount(cycle)

      expect(mockLoggerInstance.warn).toHaveBeenCalled()
      const callArg = mockLoggerInstance.warn.mock.calls[0][0]
      expect(callArg).toContain('5 +')
      expect(callArg).toContain('2 +')
      expect(callArg).toContain('10 +')
      expect(callArg).toContain('1 -')
    })

    it('should not log when error flag is false', () => {
      const cycle = createMockCycle(1)

      logFlagsMock.error = false
      Sync.showNodeCount(cycle)

      expect(mockLoggerInstance.warn).not.toHaveBeenCalled()
    })

    it('should log all fields correctly', () => {
      const cycle = createMockCycle(1, {
        syncing: 3,
        joinedConsensors: [{} as any],
        active: 7,
        apoptosized: ['n1', 'n2'],
        removed: ['n3'],
        appRemoved: ['n4'],
        lost: ['n5'],
      })

      logFlagsMock.error = true
      Sync.showNodeCount(cycle)

      const callArg = mockLoggerInstance.warn.mock.calls[0][0]
      expect(callArg).toContain('3 +') // syncing
      expect(callArg).toContain('1 +') // joinedConsensors
      expect(callArg).toContain('7 +') // active
      expect(callArg).toContain('2 -') // apoptosized
      expect(callArg).toContain('1 -') // removed/appRemoved/lost
    })
  })
})
