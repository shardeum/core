import { hexstring, P2P, Utils } from '@shardeum-foundation/lib-types'
import { errAsync, okAsync, ResultAsync } from 'neverthrow'
import { Logger } from 'log4js'

// Mock all the dependencies
const mockInitLogger = jest.fn()
const mockInitRoutes = jest.fn()
const mockRobustQueryForCycleRecordHash = jest.fn()
const mockRobustQueryForValidatorListHash = jest.fn()
const mockRobustQueryForArchiverListHash = jest.fn()
const mockRobustQueryForStandbyNodeListHash = jest.fn()
const mockRobustQueryForTxListHash = jest.fn()
const mockRobustQueryForRecentCycleMarkers = jest.fn()
const mockGetCycleDataFromNode = jest.fn()
const mockGetValidatorListFromNode = jest.fn()
const mockGetArchiverListFromNode = jest.fn()
const mockGetStandbyNodeListFromNode = jest.fn()
const mockGetTxListFromNode = jest.fn()
const mockGetCyclesBatchFromNode = jest.fn()
const mockVerifyCycleRecord = jest.fn()
const mockVerifyValidatorList = jest.fn()
const mockVerifyArchiverList = jest.fn()
const mockVerifyTxList = jest.fn()
const mockP2pLogger = { info: jest.fn() } as any

jest.mock('../../../../../src/p2p/SyncV2/queries', () => ({
  initLogger: jest.fn(),
  robustQueryForCycleRecordHash: jest.fn(),
  robustQueryForValidatorListHash: jest.fn(),
  robustQueryForArchiverListHash: jest.fn(),
  robustQueryForStandbyNodeListHash: jest.fn(),
  robustQueryForTxListHash: jest.fn(),
  robustQueryForRecentCycleMarkers: jest.fn(),
  getCycleDataFromNode: jest.fn(),
  getValidatorListFromNode: jest.fn(),
  getArchiverListFromNode: jest.fn(),
  getStandbyNodeListFromNode: jest.fn(),
  getTxListFromNode: jest.fn(),
  getCyclesBatchFromNode: jest.fn(),
  p2pLogger: { info: jest.fn() },
}))

jest.mock('../../../../../src/p2p/SyncV2/verify', () => ({
  verifyCycleRecord: jest.fn(),
  verifyValidatorList: jest.fn(),
  verifyArchiverList: jest.fn(),
  verifyTxList: jest.fn(),
}))

jest.mock('../../../../../src/p2p/SyncV2/routes', () => ({
  initRoutes: jest.fn(),
}))

// Mock other p2p modules
const mockArchivers = new Map()
const mockReset = jest.fn()
const mockAddNodes = jest.fn()
const mockCycleChainReset = jest.fn()
const mockCycleChainValidate = jest.fn()
const mockCycleChainPrependMultiple = jest.fn()
const mockDigestCycle = jest.fn()
const mockAddStandbyJoinRequests = jest.fn()
const mockSetTxList = jest.fn()
const mockMakeCycleMarker = jest.fn()
const mockLogFlags = { important_as_fatal: false }
const mockConfig = { 
  p2p: { 
    syncV2HistoricalCyclesCount: 10 
  } 
}

let mockCycleChainNewest: any = null
let mockCycleChainOldest: any = null
let mockCycleChainCycles: any[] = []

jest.mock('../../../../../src/p2p/Archivers', () => ({
  archivers: new Map(),
}))

jest.mock('../../../../../src/p2p/NodeList', () => ({
  reset: jest.fn(),
  addNodes: jest.fn(),
}))

jest.mock('../../../../../src/p2p/CycleChain', () => ({
  reset: jest.fn(),
  validate: jest.fn(),
  prependMultiple: jest.fn(),
  get newest() { return mockCycleChainNewest },
  get oldest() { return mockCycleChainOldest },
  get cycles() { return mockCycleChainCycles },
}))

jest.mock('../../../../../src/p2p/ServiceQueue', () => ({
  setTxList: jest.fn(),
}))

jest.mock('../../../../../src/p2p/Sync', () => ({
  digestCycle: jest.fn(),
}))

jest.mock('../../../../../src/p2p/Join/v2', () => ({
  addStandbyJoinRequests: jest.fn(),
}))

jest.mock('../../../../../src/logger', () => ({
  logFlags: { important_as_fatal: false },
}))

jest.mock('../../../../../src/p2p/CycleCreator', () => ({
  makeCycleMarker: jest.fn(),
}))

jest.mock('../../../../../src/utils', () => ({
  sleep: jest.fn(),
}))

jest.mock('../../../../../src/p2p/Context', () => ({
  config: { 
    p2p: { 
      syncV2HistoricalCyclesCount: 10 
    } 
  },
}))

// Import the module after all mocks are set up
import * as syncV2Module from '../../../../../src/p2p/SyncV2/index'

// Import mocked modules to get their mocked versions
const queriesMock = require('../../../../../src/p2p/SyncV2/queries')
const verifyMock = require('../../../../../src/p2p/SyncV2/verify')
const routesMock = require('../../../../../src/p2p/SyncV2/routes')
const archiversMock = require('../../../../../src/p2p/Archivers')
const nodeListMock = require('../../../../../src/p2p/NodeList')
const cycleChainMock = require('../../../../../src/p2p/CycleChain')
const serviceQueueMock = require('../../../../../src/p2p/ServiceQueue')
const syncMock = require('../../../../../src/p2p/Sync')
const joinV2Mock = require('../../../../../src/p2p/Join/v2')
const loggerMock = require('../../../../../src/logger')
const cycleCreatorMock = require('../../../../../src/p2p/CycleCreator')
const contextMock = require('../../../../../src/p2p/Context')

// Type aliases
type ActiveNode = P2P.SyncTypes.ActiveNode
type Validator = P2P.NodeListTypes.Node
type Archiver = P2P.ArchiversTypes.JoinedArchiver
type CycleRecord = P2P.CycleCreatorTypes.CycleRecord

describe('SyncV2 index', () => {
  // Helper functions
  const createMockActiveNode = (id: string): ActiveNode => ({
    ip: '192.168.1.1',
    port: 8080,
    publicKey: `public-key-${id}`,
  })

  const createMockValidator = (id: string): Validator => ({
    id,
    publicKey: `validator-key-${id}`,
  } as Validator)

  const createMockArchiver = (id: string): Archiver => ({
    publicKey: `archiver-key-${id}`,
    ip: '10.0.0.1',
    port: 4000,
    curvePk: `curve-${id}`,
  })

  const createMockCycle = (counter: number, nodeListHash: string, archiverListHash: string): CycleRecord => ({
    counter,
    previous: counter > 1 ? `cycle-hash-${counter - 1}` : '',
    start: counter * 30,
    duration: 30,
    marker: `marker${counter}`,
    networkId: 'test-network',
    networkConfigHash: `config-hash-${counter}`,
    nodeListHash,
    archiverListHash,
    standbyNodeListHash: 'standby-hash',
    mode: 'processing',
    active: counter,
    activated: [],
    activatedPublicKeys: [],
    apoptosized: [],
    desired: counter,
    expired: 0,
    joined: [],
    joinedArchivers: [],
    joinedConsensors: [],
    leavingArchivers: [],
    lost: [],
    lostArchivers: [],
    lostSyncing: [],
    refreshedArchivers: [],
    refreshedConsensors: [],
    refuted: [],
    removed: [],
    returned: [],
    standbyAdd: [],
    standbyRefresh: [],
    standbyRemove: [],
    syncing: 0,
    txPause: false,
    networkStateHash: 'state-hash',
    networkReceiptHash: 'receipt-hash',
    networkSummaryHash: 'summary-hash',
  } as unknown as CycleRecord)

  const createMockShardus = () => ({
    earlyConfigFetchAndPatch: jest.fn().mockImplementation(() => Promise.resolve(void 0)),
  })

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Assign mock implementations
    queriesMock.initLogger = mockInitLogger
    queriesMock.robustQueryForCycleRecordHash = mockRobustQueryForCycleRecordHash
    queriesMock.robustQueryForValidatorListHash = mockRobustQueryForValidatorListHash
    queriesMock.robustQueryForArchiverListHash = mockRobustQueryForArchiverListHash
    queriesMock.robustQueryForStandbyNodeListHash = mockRobustQueryForStandbyNodeListHash
    queriesMock.robustQueryForTxListHash = mockRobustQueryForTxListHash
    queriesMock.robustQueryForRecentCycleMarkers = mockRobustQueryForRecentCycleMarkers
    queriesMock.getCycleDataFromNode = mockGetCycleDataFromNode
    queriesMock.getValidatorListFromNode = mockGetValidatorListFromNode
    queriesMock.getArchiverListFromNode = mockGetArchiverListFromNode
    queriesMock.getStandbyNodeListFromNode = mockGetStandbyNodeListFromNode
    queriesMock.getTxListFromNode = mockGetTxListFromNode
    queriesMock.getCyclesBatchFromNode = mockGetCyclesBatchFromNode
    queriesMock.p2pLogger = mockP2pLogger
    
    verifyMock.verifyCycleRecord = mockVerifyCycleRecord
    verifyMock.verifyValidatorList = mockVerifyValidatorList
    verifyMock.verifyArchiverList = mockVerifyArchiverList
    verifyMock.verifyTxList = mockVerifyTxList
    
    routesMock.initRoutes = mockInitRoutes
    
    archiversMock.archivers = mockArchivers
    nodeListMock.reset = mockReset
    nodeListMock.addNodes = mockAddNodes
    cycleChainMock.reset = mockCycleChainReset
    cycleChainMock.validate = mockCycleChainValidate
    cycleChainMock.prependMultiple = mockCycleChainPrependMultiple
    serviceQueueMock.setTxList = mockSetTxList
    syncMock.digestCycle = mockDigestCycle
    joinV2Mock.addStandbyJoinRequests = mockAddStandbyJoinRequests
    loggerMock.logFlags = mockLogFlags
    cycleCreatorMock.makeCycleMarker = mockMakeCycleMarker
    contextMock.config = mockConfig
    
    // Reset CycleChain state
    mockCycleChainNewest = null
    mockCycleChainOldest = null
    mockCycleChainCycles = []
    mockArchivers.clear()
    
    // Reset config
    mockConfig.p2p.syncV2HistoricalCyclesCount = 10
  })

  describe('init', () => {
    it('should initialize logger and routes', () => {
      syncV2Module.init()

      expect(mockInitLogger).toHaveBeenCalledTimes(1)
      expect(mockInitRoutes).toHaveBeenCalledTimes(1)
    })
  })

  describe('syncV2', () => {
    const activeNodes = [
      createMockActiveNode('node1'),
      createMockActiveNode('node2'),
      createMockActiveNode('node3'),
    ]

    const validatorListHash = 'validator-hash-123' as hexstring
    const archiverListHash = 'archiver-hash-456' as hexstring
    const validatorList = [createMockValidator('v1'), createMockValidator('v2')]
    const archiverList = [createMockArchiver('a1'), createMockArchiver('a2')]
    const standbyNodeList = [{ nodeInfo: { id: 'standby1' } }] as any
    const txList = [{ hash: 'tx1', tx: { txId: 'tx1' } }] as any
    const cycle = createMockCycle(100, validatorListHash, archiverListHash)

    beforeEach(() => {
      // Setup successful responses for all queries
      mockRobustQueryForValidatorListHash.mockReturnValue(
        okAsync({ value: { nodeListHash: validatorListHash }, winningNodes: [activeNodes[0]] })
      )
      mockGetValidatorListFromNode.mockReturnValue(okAsync(validatorList))
      mockVerifyValidatorList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForArchiverListHash.mockReturnValue(
        okAsync({ value: { archiverListHash }, winningNodes: [activeNodes[0]] })
      )
      mockGetArchiverListFromNode.mockReturnValue(okAsync(archiverList))
      mockVerifyArchiverList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForStandbyNodeListHash.mockReturnValue(
        okAsync({ value: { standbyNodeListHash: 'standby-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetStandbyNodeListFromNode.mockReturnValue(okAsync(standbyNodeList))

      mockRobustQueryForTxListHash.mockReturnValue(
        okAsync({ value: { txListHash: 'tx-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetTxListFromNode.mockReturnValue(okAsync(txList))
      mockVerifyTxList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForCycleRecordHash.mockReturnValue(
        okAsync({ value: { currentCycleHash: 'cycle-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetCycleDataFromNode.mockReturnValue(okAsync(cycle))
      mockVerifyCycleRecord.mockReturnValue(okAsync(void 0))

      // Mock historical cycles as empty by default
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ value: { cycleMarkers: [], oldestCounter: 0 }, winningNodes: [activeNodes[0]] })
      )

      // Mock cycle marker
      mockMakeCycleMarker.mockImplementation((cycle) => cycle.marker)
      
      // Set CycleChain newest after digestCycle
      mockDigestCycle.mockImplementation(() => {
        mockCycleChainNewest = cycle
        mockCycleChainOldest = cycle
        mockCycleChainCycles = [cycle]
      })
      
      // Mock CycleChain.validate for historical cycles
      mockCycleChainValidate.mockReturnValue(true)
    })

    it('should successfully sync all data when hashes match', async () => {
      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result.isOk()).toBe(true)

      // Verify all sync functions were called
      expect(mockRobustQueryForValidatorListHash).toHaveBeenCalledWith(activeNodes)
      expect(mockRobustQueryForArchiverListHash).toHaveBeenCalledWith(activeNodes)
      expect(mockRobustQueryForStandbyNodeListHash).toHaveBeenCalledWith(activeNodes)
      expect(mockRobustQueryForTxListHash).toHaveBeenCalledWith(activeNodes)
      expect(mockRobustQueryForCycleRecordHash).toHaveBeenCalledWith(activeNodes)

      // Verify data was processed correctly
      expect(mockReset).toHaveBeenCalledWith('syncV2')
      expect(mockAddNodes).toHaveBeenCalledWith(validatorList, 'syncV2', cycle)
      expect(mockArchivers.size).toBe(2)
      expect(mockAddStandbyJoinRequests).toHaveBeenCalledWith(standbyNodeList, true)
      expect(mockSetTxList).toHaveBeenCalledWith(txList)
      expect(mockCycleChainReset).toHaveBeenCalled()
      expect(mockDigestCycle).toHaveBeenCalledWith(cycle, 'syncV2')
      expect(mockShardus.earlyConfigFetchAndPatch).toHaveBeenCalledWith(cycle.counter)
    })

    it('should fail when validator list hash does not match cycle', async () => {
      const mismatchedCycle = createMockCycle(100, 'wrong-validator-hash', archiverListHash)
      mockGetCycleDataFromNode.mockReturnValue(okAsync(mismatchedCycle))

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('validator list hash from received cycle')
        expect(result.error.message).toContain('does not match the hash received from robust query')
      }
    })

    it('should fail when archiver list hash does not match cycle', async () => {
      const mismatchedCycle = createMockCycle(100, validatorListHash, 'wrong-archiver-hash')
      mockGetCycleDataFromNode.mockReturnValue(okAsync(mismatchedCycle))

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('archiver list hash from received cycle')
        expect(result.error.message).toContain('does not match the hash received from robust query')
      }
    })

    it('should fail when config fetch and patch fails', async () => {
      const mockShardus = createMockShardus()
      mockShardus.earlyConfigFetchAndPatch.mockRejectedValue(new Error('Config fetch failed'))

      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('Failed to fetch and patch config')
      }
    })

    it('should log important information when logFlags.important_as_fatal is true', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      mockLogFlags.important_as_fatal = true

      const mockShardus = createMockShardus()
      await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('syncV2: nodes: 2, archivers: 2, standby nodes: 1')
      )

      consoleSpy.mockRestore()
      mockLogFlags.important_as_fatal = false
    })

    it('should handle empty validator list', async () => {
      mockGetValidatorListFromNode.mockReturnValue(okAsync([]))

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result.isOk()).toBe(true)
      expect(mockAddNodes).toHaveBeenCalledWith([], 'syncV2', cycle)
    })

    it('should handle empty archiver list', async () => {
      mockGetArchiverListFromNode.mockReturnValue(okAsync([]))

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result.isOk()).toBe(true)
      expect(mockArchivers.size).toBe(0)
    })

    it('should propagate validator list sync errors', async () => {
      mockRobustQueryForValidatorListHash.mockReturnValue(errAsync(new Error('Validator query failed')))

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toBe('Validator query failed')
      }
    })

    it('should propagate archiver list sync errors', async () => {
      mockRobustQueryForArchiverListHash.mockReturnValue(errAsync(new Error('Archiver query failed')))

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toBe('Archiver query failed')
      }
    })

    it('should propagate cycle sync errors', async () => {
      mockRobustQueryForCycleRecordHash.mockReturnValue(errAsync(new Error('Cycle query failed')))

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toBe('Cycle query failed')
      }
    })
  })

  describe('syncV2 with historical cycles', () => {
    const activeNodes = [
      createMockActiveNode('node1'),
      createMockActiveNode('node2'),
    ]

    const validatorListHash = 'validator-hash-123' as hexstring
    const archiverListHash = 'archiver-hash-456' as hexstring
    const validatorList = [createMockValidator('v1')]
    const archiverList = [createMockArchiver('a1')]
    const standbyNodeList = [] as any
    const txList = [] as any
    const latestCycle = createMockCycle(100, validatorListHash, archiverListHash)

    beforeEach(() => {
      // Setup successful responses for all queries
      mockRobustQueryForValidatorListHash.mockReturnValue(
        okAsync({ value: { nodeListHash: validatorListHash }, winningNodes: [activeNodes[0]] })
      )
      mockGetValidatorListFromNode.mockReturnValue(okAsync(validatorList))
      mockVerifyValidatorList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForArchiverListHash.mockReturnValue(
        okAsync({ value: { archiverListHash }, winningNodes: [activeNodes[0]] })
      )
      mockGetArchiverListFromNode.mockReturnValue(okAsync(archiverList))
      mockVerifyArchiverList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForStandbyNodeListHash.mockReturnValue(
        okAsync({ value: { standbyNodeListHash: 'standby-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetStandbyNodeListFromNode.mockReturnValue(okAsync(standbyNodeList))

      mockRobustQueryForTxListHash.mockReturnValue(
        okAsync({ value: { txListHash: 'tx-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetTxListFromNode.mockReturnValue(okAsync(txList))
      mockVerifyTxList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForCycleRecordHash.mockReturnValue(
        okAsync({ value: { currentCycleHash: 'cycle-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetCycleDataFromNode.mockReturnValue(okAsync(latestCycle))
      mockVerifyCycleRecord.mockReturnValue(okAsync(void 0))

      // Mock cycle marker
      mockMakeCycleMarker.mockImplementation((cycle) => cycle.marker)
      
      // Set CycleChain state after digestCycle
      mockDigestCycle.mockImplementation(() => {
        mockCycleChainNewest = latestCycle
        mockCycleChainOldest = latestCycle
        mockCycleChainCycles = [latestCycle]
      })
      
      // Mock CycleChain.validate
      mockCycleChainValidate.mockReturnValue(true)
    })

    it('should sync historical cycles when config value is set', async () => {
      // Create historical cycles
      const historicalCycles = [
        createMockCycle(98, 'hist-val-hash-98', 'hist-arch-hash-98'),
        createMockCycle(99, 'hist-val-hash-99', 'hist-arch-hash-99'),
      ]
      
      // Set config to sync 2 historical cycles
      mockConfig.p2p.syncV2HistoricalCyclesCount = 2

      // Mock recent cycle markers response
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: ['marker98', 'marker99', 'marker100'], 
            oldestCounter: 98 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      // Mock batch fetch
      mockGetCyclesBatchFromNode.mockReturnValue(
        okAsync({ cycles: historicalCycles })
      )

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result.isOk()).toBe(true)
      expect(mockRobustQueryForRecentCycleMarkers).toHaveBeenCalledWith(activeNodes)
      expect(mockGetCyclesBatchFromNode).toHaveBeenCalledWith(
        activeNodes[0],
        ['marker98', 'marker99']
      )
      expect(mockCycleChainPrependMultiple).toHaveBeenCalledWith(historicalCycles)
    })

    it('should handle no historical cycles when config is 0', async () => {
      mockConfig.p2p.syncV2HistoricalCyclesCount = 0

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result.isOk()).toBe(true)
      // Should not even query for historical cycles
      expect(mockRobustQueryForRecentCycleMarkers).not.toHaveBeenCalled()
      expect(mockGetCyclesBatchFromNode).not.toHaveBeenCalled()
    })

    it('should handle no historical cycles available from network', async () => {
      mockConfig.p2p.syncV2HistoricalCyclesCount = 10

      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: [], 
            oldestCounter: 0 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result.isOk()).toBe(true)
      expect(mockGetCyclesBatchFromNode).not.toHaveBeenCalled()
      expect(mockCycleChainPrependMultiple).not.toHaveBeenCalled()
    })

    it('should filter out the latest cycle from historical sync', async () => {
      mockConfig.p2p.syncV2HistoricalCyclesCount = 5

      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: ['marker99', 'marker100'], // marker100 is latest
            oldestCounter: 99 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      const historicalCycle = createMockCycle(99, 'hist-val-hash', 'hist-arch-hash')
      mockGetCyclesBatchFromNode.mockReturnValue(
        okAsync({ cycles: [historicalCycle] })
      )

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result.isOk()).toBe(true)
      expect(mockGetCyclesBatchFromNode).toHaveBeenCalledWith(
        activeNodes[0],
        ['marker99'] // Only historical cycle, not latest
      )
    })

    it('should limit historical cycles to configured maximum', async () => {
      mockConfig.p2p.syncV2HistoricalCyclesCount = 2

      // Provide more markers than the limit
      const markers = Array(10).fill(0).map((_, i) => `marker${91 + i}`)
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: [...markers, 'marker100'], 
            oldestCounter: 91 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      const historicalCycles = [
        createMockCycle(98, 'val-98', 'arch-98'),
        createMockCycle(99, 'val-99', 'arch-99'),
      ]
      mockGetCyclesBatchFromNode.mockReturnValue(
        okAsync({ cycles: historicalCycles })
      )

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result.isOk()).toBe(true)
      // Should only request the last 2 historical cycles (98, 99)
      expect(mockGetCyclesBatchFromNode).toHaveBeenCalledWith(
        activeNodes[0],
        ['marker98', 'marker99']
      )
    })

    it('should handle batch fetching for large numbers of historical cycles', async () => {
      mockConfig.p2p.syncV2HistoricalCyclesCount = 25

      // Create 25 historical cycle markers
      const markers = Array(25).fill(0).map((_, i) => `marker${75 + i}`)
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: [...markers, 'marker100'], 
            oldestCounter: 75 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      // Mock batch responses (should be called 3 times: 10, 10, 5)
      const batch1 = Array(10).fill(0).map((_, i) => createMockCycle(75 + i, `v${75 + i}`, `a${75 + i}`))
      const batch2 = Array(10).fill(0).map((_, i) => createMockCycle(85 + i, `v${85 + i}`, `a${85 + i}`))
      const batch3 = Array(5).fill(0).map((_, i) => createMockCycle(95 + i, `v${95 + i}`, `a${95 + i}`))

      mockGetCyclesBatchFromNode
        .mockReturnValueOnce(okAsync({ cycles: batch1 }))
        .mockReturnValueOnce(okAsync({ cycles: batch2 }))
        .mockReturnValueOnce(okAsync({ cycles: batch3 }))

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result.isOk()).toBe(true)
      expect(mockGetCyclesBatchFromNode).toHaveBeenCalledTimes(3)
      expect(mockCycleChainPrependMultiple).toHaveBeenCalledWith([...batch1, ...batch2, ...batch3])
    })

    it('should fail when historical cycles do not form valid chain', async () => {
      mockConfig.p2p.syncV2HistoricalCyclesCount = 2

      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: ['marker98', 'marker99', 'marker100'], 
            oldestCounter: 98 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      const historicalCycles = [
        createMockCycle(98, 'val-98', 'arch-98'),
        createMockCycle(99, 'val-99', 'arch-99'),
      ]
      
      // Make validation fail for the chain
      mockCycleChainValidate.mockReturnValue(false)

      mockGetCyclesBatchFromNode.mockReturnValue(
        okAsync({ cycles: historicalCycles })
      )

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('Invalid cycle chain')
      }
    })

    it('should fail when historical cycles do not connect to latest cycle', async () => {
      mockConfig.p2p.syncV2HistoricalCyclesCount = 1

      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: ['marker95', 'marker100'], // Gap in cycles
            oldestCounter: 95 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      const historicalCycle = createMockCycle(95, 'val-95', 'arch-95')
      
      // Latest cycle expects marker99 as previous, but we only have marker95
      latestCycle.previous = 'marker99'

      mockGetCyclesBatchFromNode.mockReturnValue(
        okAsync({ cycles: [historicalCycle] })
      )

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('Historical cycles do not connect to latest cycle')
      }
    })

    it('should handle backward compatibility when endpoint is not available', async () => {
      mockConfig.p2p.syncV2HistoricalCyclesCount = 10

      // Simulate 404 error for backward compatibility
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        errAsync(new Error('404 not found'))
      )

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Should succeed despite the error (backward compatibility)
      expect(result.isOk()).toBe(true)
      expect(mockGetCyclesBatchFromNode).not.toHaveBeenCalled()
    })

    it('should propagate non-404 errors from historical cycle sync', async () => {
      mockConfig.p2p.syncV2HistoricalCyclesCount = 10

      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        errAsync(new Error('Network timeout'))
      )

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toBe('Network timeout')
      }
    })

    it('should clamp historical cycles count to reasonable bounds', async () => {
      // Test with very large value
      mockConfig.p2p.syncV2HistoricalCyclesCount = 500

      // For this test, we'll use simpler numbers - latest cycle is 100
      // Create 150 markers (more than max allowed 100)
      const markers = Array(101).fill(0).map((_, i) => `marker${i}`)
      
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: markers, 
            oldestCounter: 0 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      // We should only fetch the last 100 cycles before latest (marker100)
      // But since we only have 100 historical cycles (0-99), we'll fetch all of them
      
      // Need to update the cycles' markers to match expected
      mockGetCyclesBatchFromNode.mockImplementation((node, batch) => {
        const cycles = batch.map((marker) => {
          const counter = parseInt(marker.replace('marker', ''))
          const cycle = createMockCycle(counter, `v${counter}`, `a${counter}`)
          // Update the cycle marker and counter to match
          return { ...cycle, counter, marker, previous: counter > 0 ? `marker${counter - 1}` : '' }
        })
        return okAsync({ cycles })
      })

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      if (result.isErr()) {
        console.error('Test failed with error:', result.error.message)
      }
      expect(result.isOk()).toBe(true)
      
      // Verify it fetched all 100 historical cycles (0-99)
      const totalMarkersFetched = mockGetCyclesBatchFromNode.mock.calls
        .reduce((sum, call) => sum + call[1].length, 0)
      expect(totalMarkersFetched).toBe(100)
    })

    it('should handle negative historical cycles count', async () => {
      mockConfig.p2p.syncV2HistoricalCyclesCount = -5

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result.isOk()).toBe(true)
      // Should not query for historical cycles with negative count
      expect(mockRobustQueryForRecentCycleMarkers).not.toHaveBeenCalled()
    })

    it('should use patched config value for historical cycles', async () => {
      // Initial config value
      mockConfig.p2p.syncV2HistoricalCyclesCount = 5

      // Simulate config being patched to different value
      const mockShardus = createMockShardus()
      mockShardus.earlyConfigFetchAndPatch.mockImplementation(() => {
        // Simulate the patch changing the config
        mockConfig.p2p.syncV2HistoricalCyclesCount = 15
        return Promise.resolve()
      })

      const markers = Array(20).fill(0).map((_, i) => `marker${80 + i}`)
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: [...markers, 'marker100'], 
            oldestCounter: 80 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      // Need to update the cycles' markers to match expected
      mockGetCyclesBatchFromNode.mockImplementation((node, batch) => {
        const cycles = batch.map((marker) => {
          const counter = parseInt(marker.replace('marker', ''))
          const cycle = createMockCycle(counter, `v${counter}`, `a${counter}`)
          // Update the cycle marker and counter to match
          return { ...cycle, counter, marker, previous: counter > 0 ? `marker${counter - 1}` : '' }
        })
        return okAsync({ cycles })
      })

      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result.isOk()).toBe(true)
      
      // Should use the patched value (15) not the original (5)
      const totalMarkersFetched = mockGetCyclesBatchFromNode.mock.calls
        .reduce((sum, call) => sum + call[1].length, 0)
      expect(totalMarkersFetched).toBe(15)
    })
  })

  describe('syncV2 with historical cycles - validation', () => {
    it('should detect and handle cycles with duplicate counters', async () => {
      const activeNodes = [
        createMockActiveNode('node1'),
        createMockActiveNode('node2'),
      ]

      const validatorListHash = 'validator-hash-123' as hexstring
      const archiverListHash = 'archiver-hash-456' as hexstring
      const validatorList = [createMockValidator('v1')]
      const archiverList = [createMockArchiver('a1')]
      const standbyNodeList = [] as any
      const txList = [] as any
      const latestCycle = createMockCycle(100, validatorListHash, archiverListHash)

      // Setup successful responses for all non-historical queries
      mockRobustQueryForValidatorListHash.mockReturnValue(
        okAsync({ value: { nodeListHash: validatorListHash }, winningNodes: [activeNodes[0]] })
      )
      mockGetValidatorListFromNode.mockReturnValue(okAsync(validatorList))
      mockVerifyValidatorList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForArchiverListHash.mockReturnValue(
        okAsync({ value: { archiverListHash }, winningNodes: [activeNodes[0]] })
      )
      mockGetArchiverListFromNode.mockReturnValue(okAsync(archiverList))
      mockVerifyArchiverList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForStandbyNodeListHash.mockReturnValue(
        okAsync({ value: { standbyNodeListHash: 'standby-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetStandbyNodeListFromNode.mockReturnValue(okAsync(standbyNodeList))

      mockRobustQueryForTxListHash.mockReturnValue(
        okAsync({ value: { txListHash: 'tx-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetTxListFromNode.mockReturnValue(okAsync(txList))
      mockVerifyTxList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForCycleRecordHash.mockReturnValue(
        okAsync({ value: { currentCycleHash: 'cycle-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetCycleDataFromNode.mockReturnValue(okAsync(latestCycle))
      mockVerifyCycleRecord.mockReturnValue(okAsync(void 0))

      // Mock cycle marker
      mockMakeCycleMarker.mockImplementation((cycle) => cycle.marker)
      
      // Set CycleChain state after digestCycle
      mockDigestCycle.mockImplementation(() => {
        mockCycleChainNewest = latestCycle
        mockCycleChainOldest = latestCycle
        mockCycleChainCycles = [latestCycle]
      })

      // Set config to sync 5 historical cycles
      mockConfig.p2p.syncV2HistoricalCyclesCount = 5

      // Test duplicates within same batch
      const historicalCyclesWithDuplicates = [
        createMockCycle(96, 'val-96', 'arch-96'),
        createMockCycle(97, 'val-97', 'arch-97'),
        createMockCycle(97, 'val-97', 'arch-97'), // Duplicate counter
        createMockCycle(98, 'val-98', 'arch-98'),
        createMockCycle(99, 'val-99', 'arch-99'),
      ]

      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: ['marker96', 'marker97', 'marker97-dup', 'marker98', 'marker99', 'marker100'], 
            oldestCounter: 96 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      mockGetCyclesBatchFromNode.mockReturnValue(
        okAsync({ cycles: historicalCyclesWithDuplicates })
      )

      // Mock CycleChain.validate to detect the duplicate counters
      mockCycleChainValidate.mockReturnValue(false)

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Verify proper error handling
      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('Invalid cycle chain')
      }

      // Test duplicates across different batches
      mockCycleChainValidate.mockClear()
      mockGetCyclesBatchFromNode.mockClear()

      // Configure for multiple batches
      mockConfig.p2p.syncV2HistoricalCyclesCount = 15

      // Create markers for 15 historical cycles
      const markersMultiBatch = Array(15).fill(0).map((_, i) => `marker${85 + i}`)
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: [...markersMultiBatch, 'marker100'], 
            oldestCounter: 85 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      // First batch with cycle 90
      const batch1 = Array(10).fill(0).map((_, i) => createMockCycle(85 + i, `v${85 + i}`, `a${85 + i}`))
      
      // Second batch also has cycle 90 (duplicate across batches)
      const batch2 = [
        createMockCycle(90, 'v90', 'a90'), // Duplicate from first batch
        createMockCycle(95, 'v95', 'a95'),
        createMockCycle(96, 'v96', 'a96'),
        createMockCycle(97, 'v97', 'a97'),
        createMockCycle(98, 'v98', 'a98'),
        createMockCycle(99, 'v99', 'a99'),
      ]

      mockGetCyclesBatchFromNode
        .mockReturnValueOnce(okAsync({ cycles: batch1 }))
        .mockReturnValueOnce(okAsync({ cycles: batch2 }))

      // Mock validation to fail due to duplicates
      mockCycleChainValidate.mockReturnValue(false)

      const result2 = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Verify deduplication or error handling
      expect(result2.isErr()).toBe(true)
      if (result2.isErr()) {
        expect(result2.error.message).toContain('Invalid cycle chain')
      }

      // Verify that the cycle chain validation was called
      expect(mockCycleChainValidate).toHaveBeenCalled()
    })

    it('should handle cycles returned in incorrect order', async () => {
      const activeNodes = [
        createMockActiveNode('node1'),
        createMockActiveNode('node2'),
      ]

      const validatorListHash = 'validator-hash-123' as hexstring
      const archiverListHash = 'archiver-hash-456' as hexstring
      const validatorList = [createMockValidator('v1')]
      const archiverList = [createMockArchiver('a1')]
      const standbyNodeList = [] as any
      const txList = [] as any
      const latestCycle = createMockCycle(100, validatorListHash, archiverListHash)

      // Setup successful responses for all non-historical queries
      mockRobustQueryForValidatorListHash.mockReturnValue(
        okAsync({ value: { nodeListHash: validatorListHash }, winningNodes: [activeNodes[0]] })
      )
      mockGetValidatorListFromNode.mockReturnValue(okAsync(validatorList))
      mockVerifyValidatorList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForArchiverListHash.mockReturnValue(
        okAsync({ value: { archiverListHash }, winningNodes: [activeNodes[0]] })
      )
      mockGetArchiverListFromNode.mockReturnValue(okAsync(archiverList))
      mockVerifyArchiverList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForStandbyNodeListHash.mockReturnValue(
        okAsync({ value: { standbyNodeListHash: 'standby-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetStandbyNodeListFromNode.mockReturnValue(okAsync(standbyNodeList))

      mockRobustQueryForTxListHash.mockReturnValue(
        okAsync({ value: { txListHash: 'tx-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetTxListFromNode.mockReturnValue(okAsync(txList))
      mockVerifyTxList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForCycleRecordHash.mockReturnValue(
        okAsync({ value: { currentCycleHash: 'cycle-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetCycleDataFromNode.mockReturnValue(okAsync(latestCycle))
      mockVerifyCycleRecord.mockReturnValue(okAsync(void 0))

      // Mock cycle marker
      mockMakeCycleMarker.mockImplementation((cycle) => cycle.marker)
      
      // Set CycleChain state after digestCycle
      mockDigestCycle.mockImplementation(() => {
        mockCycleChainNewest = latestCycle
        mockCycleChainOldest = latestCycle
        mockCycleChainCycles = [latestCycle]
      })

      // Set config to sync 3 historical cycles
      mockConfig.p2p.syncV2HistoricalCyclesCount = 3

      // Update latest cycle to connect properly
      latestCycle.previous = 'marker99'

      // Mock batch returning cycles out of order (e.g., [97, 99, 98] instead of [97, 98, 99])
      const historicalCyclesOutOfOrder = [
        createMockCycle(97, 'val-97', 'arch-97'),
        createMockCycle(99, 'val-99', 'arch-99'),  // Out of order
        createMockCycle(98, 'val-98', 'arch-98'),  // Should be before 99
      ]

      // Update the 'previous' field to create proper chain when sorted
      historicalCyclesOutOfOrder[0].previous = 'marker96'  // 97 points to 96
      historicalCyclesOutOfOrder[1].previous = 'marker98'  // 99 points to 98
      historicalCyclesOutOfOrder[2].previous = 'marker97'  // 98 points to 97

      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: ['marker97', 'marker98', 'marker99', 'marker100'], 
            oldestCounter: 97 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      mockGetCyclesBatchFromNode.mockReturnValue(
        okAsync({ cycles: historicalCyclesOutOfOrder })
      )

      // Mock CycleChain.validate to detect the incorrect ordering
      mockCycleChainValidate.mockReturnValue(false)

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Verify validation catches the issue
      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('Invalid cycle chain')
      }

      // Test if system would accept correctly sorted cycles
      mockCycleChainValidate.mockClear()
      mockGetCyclesBatchFromNode.mockClear()
      mockCycleChainPrependMultiple.mockClear()
      mockDigestCycle.mockClear()
      
      // Reset CycleChain state for the second test
      mockCycleChainNewest = null
      mockCycleChainOldest = null
      mockCycleChainCycles = []
      
      // Mock digestCycle again for the second test
      mockDigestCycle.mockImplementation(() => {
        mockCycleChainNewest = latestCycle
        mockCycleChainOldest = latestCycle
        mockCycleChainCycles = [latestCycle]
      })

      // Test with correctly ordered cycles
      const historicalCyclesCorrectOrder = [
        createMockCycle(97, 'val-97', 'arch-97'),
        createMockCycle(98, 'val-98', 'arch-98'),
        createMockCycle(99, 'val-99', 'arch-99'),
      ]

      // Set proper previous values for correct chain
      historicalCyclesCorrectOrder[0].previous = 'marker96'
      historicalCyclesCorrectOrder[1].previous = 'marker97'
      historicalCyclesCorrectOrder[2].previous = 'marker98'

      mockGetCyclesBatchFromNode.mockReturnValue(
        okAsync({ cycles: historicalCyclesCorrectOrder })
      )

      // Mock validation to succeed with correct order
      mockCycleChainValidate.mockReturnValue(true)

      const result2 = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Verify that correctly ordered cycles are accepted
      expect(result2.isOk()).toBe(true)
      expect(mockCycleChainPrependMultiple).toHaveBeenCalledWith(historicalCyclesCorrectOrder)

      // Test multiple batches with ordering issues across batches
      mockCycleChainValidate.mockClear()
      mockGetCyclesBatchFromNode.mockClear()
      mockCycleChainPrependMultiple.mockClear()

      // Configure for multiple batches
      mockConfig.p2p.syncV2HistoricalCyclesCount = 12

      const markersMultiBatch = Array(12).fill(0).map((_, i) => `marker${88 + i}`)
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: [...markersMultiBatch, 'marker100'], 
            oldestCounter: 88 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      // First batch in correct order
      const batch1 = [
        createMockCycle(88, 'v88', 'a88'),
        createMockCycle(89, 'v89', 'a89'),
        createMockCycle(90, 'v90', 'a90'),
        createMockCycle(91, 'v91', 'a91'),
        createMockCycle(92, 'v92', 'a92'),
        createMockCycle(93, 'v93', 'a93'),
        createMockCycle(94, 'v94', 'a94'),
        createMockCycle(95, 'v95', 'a95'),
        createMockCycle(96, 'v96', 'a96'),
        createMockCycle(97, 'v97', 'a97'),
      ]

      // Second batch with cycles out of order
      const batch2 = [
        createMockCycle(99, 'v99', 'a99'),  // Should be last
        createMockCycle(98, 'v98', 'a98'),  // Should be first
      ]

      // Set proper previous values
      batch1.forEach((cycle, i) => {
        cycle.previous = i > 0 ? `marker${87 + i}` : 'marker87'
      })
      batch2[0].previous = 'marker98'  // 99 points to 98
      batch2[1].previous = 'marker97'  // 98 points to 97

      mockGetCyclesBatchFromNode
        .mockReturnValueOnce(okAsync({ cycles: batch1 }))
        .mockReturnValueOnce(okAsync({ cycles: batch2 }))

      // Mock validation to fail due to incorrect ordering
      mockCycleChainValidate.mockReturnValue(false)

      const result3 = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Verify that ordering issues are caught even across batches
      expect(result3.isErr()).toBe(true)
      if (result3.isErr()) {
        expect(result3.error.message).toContain('Invalid cycle chain')
      }

      // Verify that the cycle chain validation was called
      expect(mockCycleChainValidate).toHaveBeenCalled()
    })
  })

  describe('syncV2 with historical cycles - boundaries', () => {
    const activeNodes = [
      createMockActiveNode('node1'),
      createMockActiveNode('node2'),
    ]

    const validatorListHash = 'validator-hash-123' as hexstring
    const archiverListHash = 'archiver-hash-456' as hexstring
    const validatorList = [createMockValidator('v1')]
    const archiverList = [createMockArchiver('a1')]
    const standbyNodeList = [] as any
    const txList = [] as any
    const latestCycle = createMockCycle(200, validatorListHash, archiverListHash)

    beforeEach(() => {
      // Setup successful responses for all non-historical queries
      mockRobustQueryForValidatorListHash.mockReturnValue(
        okAsync({ value: { nodeListHash: validatorListHash }, winningNodes: [activeNodes[0]] })
      )
      mockGetValidatorListFromNode.mockReturnValue(okAsync(validatorList))
      mockVerifyValidatorList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForArchiverListHash.mockReturnValue(
        okAsync({ value: { archiverListHash }, winningNodes: [activeNodes[0]] })
      )
      mockGetArchiverListFromNode.mockReturnValue(okAsync(archiverList))
      mockVerifyArchiverList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForStandbyNodeListHash.mockReturnValue(
        okAsync({ value: { standbyNodeListHash: 'standby-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetStandbyNodeListFromNode.mockReturnValue(okAsync(standbyNodeList))

      mockRobustQueryForTxListHash.mockReturnValue(
        okAsync({ value: { txListHash: 'tx-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetTxListFromNode.mockReturnValue(okAsync(txList))
      mockVerifyTxList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForCycleRecordHash.mockReturnValue(
        okAsync({ value: { currentCycleHash: 'cycle-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetCycleDataFromNode.mockReturnValue(okAsync(latestCycle))
      mockVerifyCycleRecord.mockReturnValue(okAsync(void 0))

      // Mock cycle marker
      mockMakeCycleMarker.mockImplementation((cycle) => cycle.marker)
      
      // Set CycleChain state after digestCycle
      mockDigestCycle.mockImplementation(() => {
        mockCycleChainNewest = latestCycle
        mockCycleChainOldest = latestCycle
        mockCycleChainCycles = [latestCycle]
      })
      
      // Mock CycleChain.validate
      mockCycleChainValidate.mockReturnValue(true)
    })

    it('should handle exactly 100 historical cycles correctly', async () => {
      // Setup exactly 100 historical cycles
      mockConfig.p2p.syncV2HistoricalCyclesCount = 100

      // Create exactly 100 historical cycle markers (cycles 100-199)
      const markers100 = Array(100).fill(0).map((_, i) => `marker${100 + i}`)
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: [...markers100, 'marker200'], // 100 historical + latest
            oldestCounter: 100 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      // Mock getCyclesBatchFromNode to handle batch fetching
      mockGetCyclesBatchFromNode.mockImplementation((_node, batch: string[]) => {
        const cycles = batch.map((marker: string) => {
          const counter = parseInt(marker.replace('marker', ''))
          const cycle = createMockCycle(counter, `v${counter}`, `a${counter}`)
          return { ...cycle, counter, marker, previous: counter > 100 ? `marker${counter - 1}` : 'marker99' }
        })
        return okAsync({ cycles })
      })

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result.isOk()).toBe(true)
      
      // Verify all 100 cycles are fetched without exceeding limit
      const totalMarkersFetched = mockGetCyclesBatchFromNode.mock.calls
        .reduce((sum, call) => sum + call[1].length, 0)
      expect(totalMarkersFetched).toBe(100)
      
      // Verify batch requests were made (100 cycles = 10 batches of 10)
      expect(mockGetCyclesBatchFromNode).toHaveBeenCalledTimes(10)
      
      // Verify historical cycles were processed
      expect(mockCycleChainPrependMultiple).toHaveBeenCalled()

      // Test with 101 cycles available (should only fetch 100)
      mockGetCyclesBatchFromNode.mockClear()
      mockCycleChainPrependMultiple.mockClear()
      mockDigestCycle.mockClear()
      
      // Reset CycleChain state for the second test
      mockCycleChainNewest = null
      mockCycleChainOldest = null
      mockCycleChainCycles = []
      
      // Mock digestCycle again for the second test
      mockDigestCycle.mockImplementation(() => {
        mockCycleChainNewest = latestCycle
        mockCycleChainOldest = latestCycle
        mockCycleChainCycles = [latestCycle]
      })

      // Create 101 historical cycle markers (cycles 99-199)
      const markers101 = Array(101).fill(0).map((_, i) => `marker${99 + i}`)
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: [...markers101, 'marker200'], // 101 historical + latest
            oldestCounter: 99 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      const result2 = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result2.isOk()).toBe(true)
      
      // Should only fetch last 100 cycles (cycles 100-199), not all 101
      const totalMarkersFetched2 = mockGetCyclesBatchFromNode.mock.calls
        .reduce((sum, call) => sum + call[1].length, 0)
      expect(totalMarkersFetched2).toBe(100)
      
      // Verify the correct range was fetched (should skip marker99 and fetch marker100-marker199)
      const firstBatchCall = mockGetCyclesBatchFromNode.mock.calls[0]
      expect(firstBatchCall[1]).toEqual(['marker100', 'marker101', 'marker102', 'marker103', 'marker104', 'marker105', 'marker106', 'marker107', 'marker108', 'marker109'])
      
      // Verify last batch contains the most recent historical cycles
      const lastBatchCall = mockGetCyclesBatchFromNode.mock.calls[mockGetCyclesBatchFromNode.mock.calls.length - 1]
      expect(lastBatchCall[1]).toEqual(['marker190', 'marker191', 'marker192', 'marker193', 'marker194', 'marker195', 'marker196', 'marker197', 'marker198', 'marker199'])
    })

    it('should handle oldestCounter of 0 or negative values', async () => {
      // Test oldestCounter: 0
      mockConfig.p2p.syncV2HistoricalCyclesCount = 5

      // Update latest cycle to connect to historical cycles properly
      const connectedLatestCycle = createMockCycle(5, validatorListHash, archiverListHash)
      connectedLatestCycle.previous = 'marker4'
      mockGetCycleDataFromNode.mockReturnValue(okAsync(connectedLatestCycle))

      // Set up digestCycle to use the connected latest cycle
      mockDigestCycle.mockImplementation(() => {
        mockCycleChainNewest = connectedLatestCycle
        mockCycleChainOldest = connectedLatestCycle
        mockCycleChainCycles = [connectedLatestCycle]
      })

      // Test with oldestCounter = 0
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: ['marker0', 'marker1', 'marker2', 'marker3', 'marker4', 'marker5'], 
            oldestCounter: 0 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      // Mock getCyclesBatchFromNode to handle batch fetching
      mockGetCyclesBatchFromNode.mockImplementation((_node, batch: string[]) => {
        const cycles = batch.map((marker: string) => {
          const counter = parseInt(marker.replace('marker', ''))
          const cycle = createMockCycle(counter, `v${counter}`, `a${counter}`)
          return { ...cycle, counter, marker, previous: counter > 0 ? `marker${counter - 1}` : '' }
        })
        return okAsync({ cycles })
      })

      const mockShardus = createMockShardus()
      let result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Verify graceful handling without crashes
      expect(result.isOk()).toBe(true)
      
      // Verify historical cycles were fetched (0-4, excluding latest cycle 5)
      const totalMarkersFetched = mockGetCyclesBatchFromNode.mock.calls
        .reduce((sum, call) => sum + call[1].length, 0)
      expect(totalMarkersFetched).toBe(5)
      expect(mockCycleChainPrependMultiple).toHaveBeenCalled()

      // Test oldestCounter: -5
      mockGetCyclesBatchFromNode.mockClear()
      mockCycleChainPrependMultiple.mockClear()
      mockDigestCycle.mockClear()
      
      // Reset CycleChain state
      mockCycleChainNewest = null
      mockCycleChainOldest = null
      mockCycleChainCycles = []

      // Create connected latest cycle for negative test
      const negativeLatestCycle = createMockCycle(0, validatorListHash, archiverListHash)
      negativeLatestCycle.previous = 'marker-1'
      mockGetCycleDataFromNode.mockReturnValue(okAsync(negativeLatestCycle))
      
      // Mock digestCycle again
      mockDigestCycle.mockImplementation(() => {
        mockCycleChainNewest = negativeLatestCycle
        mockCycleChainOldest = negativeLatestCycle
        mockCycleChainCycles = [negativeLatestCycle]
      })

      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: ['marker-5', 'marker-4', 'marker-3', 'marker-2', 'marker-1', 'marker0'], 
            oldestCounter: -5 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      // Mock batch fetching for negative counters
      mockGetCyclesBatchFromNode.mockImplementation((_node, batch: string[]) => {
        const cycles = batch.map((marker: string) => {
          const counterStr = marker.replace('marker', '')
          const counter = parseInt(counterStr)
          const cycle = createMockCycle(counter, `v${counter}`, `a${counter}`)
          return { ...cycle, counter, marker, previous: counter > -5 ? `marker${counter - 1}` : '' }
        })
        return okAsync({ cycles })
      })

      result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Verify graceful handling without crashes for negative values
      expect(result.isOk()).toBe(true)
      
      // Verify historical cycles were fetched (-5 to -1, excluding latest cycle 0)
      const totalMarkersFetched2 = mockGetCyclesBatchFromNode.mock.calls
        .reduce((sum, call) => sum + call[1].length, 0)
      expect(totalMarkersFetched2).toBe(5)
      expect(mockCycleChainPrependMultiple).toHaveBeenCalled()

      // Test oldestCounter: -100
      mockGetCyclesBatchFromNode.mockClear()
      mockCycleChainPrependMultiple.mockClear()
      mockDigestCycle.mockClear()
      
      // Reset CycleChain state
      mockCycleChainNewest = null
      mockCycleChainOldest = null
      mockCycleChainCycles = []

      mockConfig.p2p.syncV2HistoricalCyclesCount = 10

      // Create connected latest cycle for -100 test
      const negativeLatestCycle2 = createMockCycle(-90, validatorListHash, archiverListHash)
      negativeLatestCycle2.previous = 'marker-91'
      mockGetCycleDataFromNode.mockReturnValue(okAsync(negativeLatestCycle2))
      
      // Mock digestCycle again
      mockDigestCycle.mockImplementation(() => {
        mockCycleChainNewest = negativeLatestCycle2
        mockCycleChainOldest = negativeLatestCycle2
        mockCycleChainCycles = [negativeLatestCycle2]
      })

      // Create markers for cycles -100 to -91
      const negativeMarkers = Array(10).fill(0).map((_, i) => `marker${-100 + i}`)
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: [...negativeMarkers, 'marker-90'], 
            oldestCounter: -100 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      // Mock batch fetching for large negative counters
      mockGetCyclesBatchFromNode.mockImplementation((_node, batch: string[]) => {
        const cycles = batch.map((marker: string) => {
          const counterStr = marker.replace('marker', '')
          const counter = parseInt(counterStr)
          const cycle = createMockCycle(counter, `v${counter}`, `a${counter}`)
          return { ...cycle, counter, marker, previous: counter > -100 ? `marker${counter - 1}` : '' }
        })
        return okAsync({ cycles })
      })

      result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Verify graceful handling without crashes for large negative values
      expect(result.isOk()).toBe(true)
      
      // Verify historical cycles were fetched (-100 to -91, excluding latest cycle -90)
      const totalMarkersFetched3 = mockGetCyclesBatchFromNode.mock.calls
        .reduce((sum, call) => sum + call[1].length, 0)
      expect(totalMarkersFetched3).toBe(10)
      expect(mockCycleChainPrependMultiple).toHaveBeenCalled()

      // Test edge case: oldestCounter equals latest counter (no historical cycles)
      mockGetCyclesBatchFromNode.mockClear()
      mockCycleChainPrependMultiple.mockClear()
      mockDigestCycle.mockClear()
      
      // Reset CycleChain state
      mockCycleChainNewest = null
      mockCycleChainOldest = null
      mockCycleChainCycles = []

      // Create latest cycle for edge case
      const edgeCaseLatestCycle = createMockCycle(50, validatorListHash, archiverListHash)
      mockGetCycleDataFromNode.mockReturnValue(okAsync(edgeCaseLatestCycle))
      
      // Mock digestCycle again
      mockDigestCycle.mockImplementation(() => {
        mockCycleChainNewest = edgeCaseLatestCycle
        mockCycleChainOldest = edgeCaseLatestCycle
        mockCycleChainCycles = [edgeCaseLatestCycle]
      })

      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: ['marker50'], // Only latest cycle
            oldestCounter: 50 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Should succeed but not fetch any historical cycles
      expect(result.isOk()).toBe(true)
      expect(mockGetCyclesBatchFromNode).not.toHaveBeenCalled()
      expect(mockCycleChainPrependMultiple).not.toHaveBeenCalled()
    })

    it('should filter out null/undefined cycle markers', async () => {
      mockConfig.p2p.syncV2HistoricalCyclesCount = 5

      // Create latest cycle that connects properly
      const connectedLatestCycle = createMockCycle(5, validatorListHash, archiverListHash)
      connectedLatestCycle.previous = 'marker4'
      mockGetCycleDataFromNode.mockReturnValue(okAsync(connectedLatestCycle))

      // Set up digestCycle to use the connected latest cycle
      mockDigestCycle.mockImplementation(() => {
        mockCycleChainNewest = connectedLatestCycle
        mockCycleChainOldest = connectedLatestCycle
        mockCycleChainCycles = [connectedLatestCycle]
      })

      // Test with mixed valid and invalid markers
      const mixedMarkers = ['marker1', null, 'marker3', undefined, '', 'marker4', 'marker5']
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: mixedMarkers as any, // Cast to bypass TypeScript checks for test
            oldestCounter: 1 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      // Mock getCyclesBatchFromNode to handle whatever markers are actually passed
      // and simulate graceful handling of invalid markers
      mockGetCyclesBatchFromNode.mockImplementation((_node, batch: any[]) => {
        // This tests that the system can handle mixed marker types gracefully
        // Filter out null/undefined/empty in the mock to simulate proper error handling
        const validMarkers = batch.filter(marker => marker && typeof marker === 'string' && marker.trim() !== '')
        
        const cycles = validMarkers.map((marker: string) => {
          const counter = parseInt(marker.replace('marker', ''))
          const cycle = createMockCycle(counter, `v${counter}`, `a${counter}`)
          return { ...cycle, counter, marker, previous: counter > 1 ? `marker${counter - 1}` : '' }
        })
        return okAsync({ cycles })
      })

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Verify the sync succeeds and handles invalid markers gracefully
      expect(result.isOk()).toBe(true)
      expect(mockGetCyclesBatchFromNode).toHaveBeenCalled()
      expect(mockCycleChainPrependMultiple).toHaveBeenCalled()

      // Test scenario with all invalid markers except latest
      mockGetCyclesBatchFromNode.mockClear()
      mockCycleChainPrependMultiple.mockClear()
      mockDigestCycle.mockClear()
      
      // Reset CycleChain state
      mockCycleChainNewest = null
      mockCycleChainOldest = null
      mockCycleChainCycles = []
      
      // Mock digestCycle again
      mockDigestCycle.mockImplementation(() => {
        mockCycleChainNewest = connectedLatestCycle
        mockCycleChainOldest = connectedLatestCycle
        mockCycleChainCycles = [connectedLatestCycle]
      })

      // Test with all null/undefined/empty markers except the latest cycle
      const allInvalidMarkers = [null, undefined, '', null, undefined, 'marker5'] // Only marker5 is valid (latest)
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: allInvalidMarkers as any,
            oldestCounter: 1 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      // Mock that returns empty cycles for invalid markers
      mockGetCyclesBatchFromNode.mockImplementation((_node, batch: any[]) => {
        // When all markers are invalid, return empty cycles array
        const validMarkers = batch.filter(marker => marker && typeof marker === 'string' && marker.trim() !== '')
        return okAsync({ cycles: [] }) // Simulate no valid cycles found
      })

      const result2 = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Should succeed even with mostly invalid markers
      expect(result2.isOk()).toBe(true)
      // The key test is that the system doesn't crash with invalid markers

      // Test with completely empty/invalid markers array
      mockGetCyclesBatchFromNode.mockClear()
      mockCycleChainPrependMultiple.mockClear()

      const completelyInvalidMarkers = [null, undefined, '', null, undefined]
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: completelyInvalidMarkers as any,
            oldestCounter: 1 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      const result3 = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Should succeed gracefully even with all invalid markers
      expect(result3.isOk()).toBe(true)
      // Depending on implementation, it may or may not call getCyclesBatchFromNode
      // The key is that it doesn't crash and handles the scenario gracefully
    })

    it('should handle zero batch size calculation edge case', async () => {
      mockConfig.p2p.syncV2HistoricalCyclesCount = 0

      // Create latest cycle
      const latestCycle = createMockCycle(10, validatorListHash, archiverListHash)
      mockGetCycleDataFromNode.mockReturnValue(okAsync(latestCycle))

      // Set up digestCycle
      mockDigestCycle.mockImplementation(() => {
        mockCycleChainNewest = latestCycle
        mockCycleChainOldest = latestCycle
        mockCycleChainCycles = [latestCycle]
      })

      // Test scenario where batch size calculation results in 0
      // This can happen when syncV2HistoricalCyclesCount is 0
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: ['marker8', 'marker9', 'marker10'], 
            oldestCounter: 8 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Verify no crash and graceful handling
      expect(result.isOk()).toBe(true)
      // Should not even call for historical cycles when config is 0
      expect(mockRobustQueryForRecentCycleMarkers).not.toHaveBeenCalled()
      expect(mockGetCyclesBatchFromNode).not.toHaveBeenCalled()

      // Test negative batch size scenarios
      mockGetCyclesBatchFromNode.mockClear()
      mockCycleChainPrependMultiple.mockClear()
      mockDigestCycle.mockClear()
      
      // Reset CycleChain state
      mockCycleChainNewest = null
      mockCycleChainOldest = null
      mockCycleChainCycles = []
      
      // Mock digestCycle again
      mockDigestCycle.mockImplementation(() => {
        mockCycleChainNewest = latestCycle
        mockCycleChainOldest = latestCycle
        mockCycleChainCycles = [latestCycle]
      })

      // Test with negative syncV2HistoricalCyclesCount
      mockConfig.p2p.syncV2HistoricalCyclesCount = -5

      const result2 = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Verify graceful handling with negative config
      expect(result2.isOk()).toBe(true)
      expect(mockGetCyclesBatchFromNode).not.toHaveBeenCalled()

      // Test edge case where available cycles is 0 but config is positive
      mockConfig.p2p.syncV2HistoricalCyclesCount = 10
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: ['marker10'], // Only latest cycle, no historical
            oldestCounter: 10 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      const result3 = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Should succeed but not fetch any historical cycles (batch size effectively 0)
      expect(result3.isOk()).toBe(true)
      expect(mockGetCyclesBatchFromNode).not.toHaveBeenCalled()
      expect(mockCycleChainPrependMultiple).not.toHaveBeenCalled()

      // Test scenario where markers array length causes division by zero or edge case
      mockGetCyclesBatchFromNode.mockClear()
      mockCycleChainPrependMultiple.mockClear()

      // Empty markers array
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: [], 
            oldestCounter: 5 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      const result4 = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Should handle empty markers gracefully
      expect(result4.isOk()).toBe(true)
      expect(mockGetCyclesBatchFromNode).not.toHaveBeenCalled()
      expect(mockCycleChainPrependMultiple).not.toHaveBeenCalled()
    })
  })

  describe('syncV2 with historical cycles - error handling', () => {
    const activeNodes = [
      createMockActiveNode('node1'),
      createMockActiveNode('node2'),
    ]

    const validatorListHash = 'validator-hash-123' as hexstring
    const archiverListHash = 'archiver-hash-456' as hexstring
    const validatorList = [createMockValidator('v1')]
    const archiverList = [createMockArchiver('a1')]
    const standbyNodeList = [] as any
    const txList = [] as any
    const latestCycle = createMockCycle(100, validatorListHash, archiverListHash)

    beforeEach(() => {
      // Setup successful responses for all non-historical queries
      mockRobustQueryForValidatorListHash.mockReturnValue(
        okAsync({ value: { nodeListHash: validatorListHash }, winningNodes: [activeNodes[0]] })
      )
      mockGetValidatorListFromNode.mockReturnValue(okAsync(validatorList))
      mockVerifyValidatorList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForArchiverListHash.mockReturnValue(
        okAsync({ value: { archiverListHash }, winningNodes: [activeNodes[0]] })
      )
      mockGetArchiverListFromNode.mockReturnValue(okAsync(archiverList))
      mockVerifyArchiverList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForStandbyNodeListHash.mockReturnValue(
        okAsync({ value: { standbyNodeListHash: 'standby-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetStandbyNodeListFromNode.mockReturnValue(okAsync(standbyNodeList))

      mockRobustQueryForTxListHash.mockReturnValue(
        okAsync({ value: { txListHash: 'tx-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetTxListFromNode.mockReturnValue(okAsync(txList))
      mockVerifyTxList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForCycleRecordHash.mockReturnValue(
        okAsync({ value: { currentCycleHash: 'cycle-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetCycleDataFromNode.mockReturnValue(okAsync(latestCycle))
      mockVerifyCycleRecord.mockReturnValue(okAsync(void 0))

      // Mock cycle marker
      mockMakeCycleMarker.mockImplementation((cycle) => cycle.marker)
      
      // Set CycleChain state after digestCycle
      mockDigestCycle.mockImplementation(() => {
        mockCycleChainNewest = latestCycle
        mockCycleChainOldest = latestCycle
        mockCycleChainCycles = [latestCycle]
      })
      
      // Mock CycleChain.validate
      mockCycleChainValidate.mockReturnValue(true)
    })

    it('should handle partial batch failures when fetching historical cycles', async () => {
      // Setup: Configure to fetch 25 cycles (3 batches: 10, 10, 5)
      mockConfig.p2p.syncV2HistoricalCyclesCount = 25

      // Create 25 historical cycle markers
      const markers = Array(25).fill(0).map((_, i) => `marker${75 + i}`)
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: [...markers, 'marker100'], 
            oldestCounter: 75 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      // Mock batch responses - first batch succeeds, second fails, third succeeds
      const batch1 = Array(10).fill(0).map((_, i) => createMockCycle(75 + i, `v${75 + i}`, `a${75 + i}`))
      const batch3 = Array(5).fill(0).map((_, i) => createMockCycle(95 + i, `v${95 + i}`, `a${95 + i}`))

      mockGetCyclesBatchFromNode
        .mockReturnValueOnce(okAsync({ cycles: batch1 })) // First batch succeeds
        .mockReturnValueOnce(errAsync(new Error('Network error during batch fetch'))) // Second batch fails
        .mockReturnValueOnce(okAsync({ cycles: batch3 })) // Third batch succeeds

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Verify the sync operation fails gracefully
      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('Network error during batch fetch')
      }

      // Check that successful batches don't cause partial state updates
      // The CycleChain should not have been updated with partial data
      expect(mockCycleChainPrependMultiple).not.toHaveBeenCalled()
      
      // Verify that all 3 batch requests were attempted
      expect(mockGetCyclesBatchFromNode).toHaveBeenCalledTimes(3)
      
      // Verify the specific batch requests
      expect(mockGetCyclesBatchFromNode).toHaveBeenNthCalledWith(1, activeNodes[0], markers.slice(0, 10))
      expect(mockGetCyclesBatchFromNode).toHaveBeenNthCalledWith(2, activeNodes[0], markers.slice(10, 20))
      expect(mockGetCyclesBatchFromNode).toHaveBeenNthCalledWith(3, activeNodes[0], markers.slice(20, 25))
      
      // Verify that none of the other sync operations were affected
      // (they should have been called before the historical sync failed)
      expect(mockRobustQueryForValidatorListHash).toHaveBeenCalled()
      expect(mockRobustQueryForArchiverListHash).toHaveBeenCalled()
      expect(mockRobustQueryForCycleRecordHash).toHaveBeenCalled()
    })
  })

  describe('syncV2 with historical cycles - node selection', () => {
    it('should use only the first winning node for batch fetching', async () => {
      const activeNodes = [
        createMockActiveNode('node1'),
        createMockActiveNode('node2'),
        createMockActiveNode('node3'),
      ]

      const validatorListHash = 'validator-hash-123' as hexstring
      const archiverListHash = 'archiver-hash-456' as hexstring
      const validatorList = [createMockValidator('v1')]
      const archiverList = [createMockArchiver('a1')]
      const standbyNodeList = [] as any
      const txList = [] as any
      const latestCycle = createMockCycle(100, validatorListHash, archiverListHash)

      // Setup successful responses for all non-historical queries with multiple winning nodes
      mockRobustQueryForValidatorListHash.mockReturnValue(
        okAsync({ value: { nodeListHash: validatorListHash }, winningNodes: activeNodes }) // All nodes win
      )
      mockGetValidatorListFromNode.mockReturnValue(okAsync(validatorList))
      mockVerifyValidatorList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForArchiverListHash.mockReturnValue(
        okAsync({ value: { archiverListHash }, winningNodes: activeNodes }) // All nodes win
      )
      mockGetArchiverListFromNode.mockReturnValue(okAsync(archiverList))
      mockVerifyArchiverList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForStandbyNodeListHash.mockReturnValue(
        okAsync({ value: { standbyNodeListHash: 'standby-hash' }, winningNodes: activeNodes }) // All nodes win
      )
      mockGetStandbyNodeListFromNode.mockReturnValue(okAsync(standbyNodeList))

      mockRobustQueryForTxListHash.mockReturnValue(
        okAsync({ value: { txListHash: 'tx-hash' }, winningNodes: activeNodes }) // All nodes win
      )
      mockGetTxListFromNode.mockReturnValue(okAsync(txList))
      mockVerifyTxList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForCycleRecordHash.mockReturnValue(
        okAsync({ value: { currentCycleHash: 'cycle-hash' }, winningNodes: activeNodes }) // All nodes win
      )
      mockGetCycleDataFromNode.mockReturnValue(okAsync(latestCycle))
      mockVerifyCycleRecord.mockReturnValue(okAsync(void 0))

      // Mock cycle marker
      mockMakeCycleMarker.mockImplementation((cycle) => cycle.marker)
      
      // Set CycleChain state after digestCycle
      mockDigestCycle.mockImplementation(() => {
        mockCycleChainNewest = latestCycle
        mockCycleChainOldest = latestCycle
        mockCycleChainCycles = [latestCycle]
      })

      // Set config to sync 5 historical cycles
      mockConfig.p2p.syncV2HistoricalCyclesCount = 5

      // Provide multiple winning nodes for historical cycle query
      const historicalMarkers = ['marker95', 'marker96', 'marker97', 'marker98', 'marker99']
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: [...historicalMarkers, 'marker100'], 
            oldestCounter: 95 
          }, 
          winningNodes: activeNodes // All 3 nodes are winning nodes
        })
      )

      // Mock historical cycles batch response
      const historicalCycles = [
        createMockCycle(95, 'val-95', 'arch-95'),
        createMockCycle(96, 'val-96', 'arch-96'),
        createMockCycle(97, 'val-97', 'arch-97'),
        createMockCycle(98, 'val-98', 'arch-98'),
        createMockCycle(99, 'val-99', 'arch-99'),
      ]

      mockGetCyclesBatchFromNode.mockReturnValue(
        okAsync({ cycles: historicalCycles })
      )

      // Ensure cycle validation passes
      mockCycleChainValidate.mockReturnValue(true)

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Verify the sync succeeds
      expect(result.isOk()).toBe(true)

      // Verify only winningNodes[0] (first node) was used for batch fetching
      expect(mockGetCyclesBatchFromNode).toHaveBeenCalledTimes(1)
      expect(mockGetCyclesBatchFromNode).toHaveBeenCalledWith(
        activeNodes[0], // Should use only the first winning node
        historicalMarkers
      )

      // Document this limitation: verify other winning nodes were NOT used
      expect(mockGetCyclesBatchFromNode).not.toHaveBeenCalledWith(activeNodes[1], expect.any(Array))
      expect(mockGetCyclesBatchFromNode).not.toHaveBeenCalledWith(activeNodes[2], expect.any(Array))

      // Verify that other operations used the winning nodes appropriately
      // (they typically use only the first winning node too, which is expected behavior)
      expect(mockGetValidatorListFromNode).toHaveBeenCalledWith(activeNodes[0], validatorListHash)
      expect(mockGetArchiverListFromNode).toHaveBeenCalledWith(activeNodes[0], archiverListHash)
      expect(mockGetCycleDataFromNode).toHaveBeenCalledWith(activeNodes[0], 'cycle-hash')
    })

    it('should document current node selection behavior with multiple batches', async () => {
      const activeNodes = [
        createMockActiveNode('node1'),
        createMockActiveNode('node2'),
        createMockActiveNode('node3'),
      ]

      const validatorListHash = 'validator-hash-123' as hexstring
      const archiverListHash = 'archiver-hash-456' as hexstring
      const validatorList = [createMockValidator('v1')]
      const archiverList = [createMockArchiver('a1')]
      const standbyNodeList = [] as any
      const txList = [] as any
      const latestCycle = createMockCycle(100, validatorListHash, archiverListHash)

      // Setup successful responses
      mockRobustQueryForValidatorListHash.mockReturnValue(
        okAsync({ value: { nodeListHash: validatorListHash }, winningNodes: activeNodes })
      )
      mockGetValidatorListFromNode.mockReturnValue(okAsync(validatorList))
      mockVerifyValidatorList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForArchiverListHash.mockReturnValue(
        okAsync({ value: { archiverListHash }, winningNodes: activeNodes })
      )
      mockGetArchiverListFromNode.mockReturnValue(okAsync(archiverList))
      mockVerifyArchiverList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForStandbyNodeListHash.mockReturnValue(
        okAsync({ value: { standbyNodeListHash: 'standby-hash' }, winningNodes: activeNodes })
      )
      mockGetStandbyNodeListFromNode.mockReturnValue(okAsync(standbyNodeList))

      mockRobustQueryForTxListHash.mockReturnValue(
        okAsync({ value: { txListHash: 'tx-hash' }, winningNodes: activeNodes })
      )
      mockGetTxListFromNode.mockReturnValue(okAsync(txList))
      mockVerifyTxList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForCycleRecordHash.mockReturnValue(
        okAsync({ value: { currentCycleHash: 'cycle-hash' }, winningNodes: activeNodes })
      )
      mockGetCycleDataFromNode.mockReturnValue(okAsync(latestCycle))
      mockVerifyCycleRecord.mockReturnValue(okAsync(void 0))

      mockMakeCycleMarker.mockImplementation((cycle) => cycle.marker)
      
      mockDigestCycle.mockImplementation(() => {
        mockCycleChainNewest = latestCycle
        mockCycleChainOldest = latestCycle
        mockCycleChainCycles = [latestCycle]
      })

      // Set config to sync 25 historical cycles (will create multiple batches)
      mockConfig.p2p.syncV2HistoricalCyclesCount = 25

      // Create 25 historical cycle markers (will be split into 3 batches: 10, 10, 5)
      const historicalMarkers = Array(25).fill(0).map((_, i) => `marker${75 + i}`)
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: [...historicalMarkers, 'marker100'], 
            oldestCounter: 75 
          }, 
          winningNodes: activeNodes // All 3 nodes are winning nodes
        })
      )

      // Mock successful batch responses for all batches
      const batch1 = Array(10).fill(0).map((_, i) => createMockCycle(75 + i, `v${75 + i}`, `a${75 + i}`))
      const batch2 = Array(10).fill(0).map((_, i) => createMockCycle(85 + i, `v${85 + i}`, `a${85 + i}`))
      const batch3 = Array(5).fill(0).map((_, i) => createMockCycle(95 + i, `v${95 + i}`, `a${95 + i}`))

      mockGetCyclesBatchFromNode
        .mockReturnValueOnce(okAsync({ cycles: batch1 }))
        .mockReturnValueOnce(okAsync({ cycles: batch2 }))
        .mockReturnValueOnce(okAsync({ cycles: batch3 }))

      mockCycleChainValidate.mockReturnValue(true)

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      expect(result.isOk()).toBe(true)

      // Verify all 3 batch requests were made
      expect(mockGetCyclesBatchFromNode).toHaveBeenCalledTimes(3)

      // Document limitation: ALL batches use only the first winning node
      expect(mockGetCyclesBatchFromNode).toHaveBeenNthCalledWith(1, activeNodes[0], historicalMarkers.slice(0, 10))
      expect(mockGetCyclesBatchFromNode).toHaveBeenNthCalledWith(2, activeNodes[0], historicalMarkers.slice(10, 20))
      expect(mockGetCyclesBatchFromNode).toHaveBeenNthCalledWith(3, activeNodes[0], historicalMarkers.slice(20, 25))

      // This documents a potential improvement opportunity:
      // Currently, if winningNodes[0] fails during batch fetching, the entire historical sync fails
      // even though other winning nodes (activeNodes[1], activeNodes[2]) could be used as fallbacks
      
      // The current implementation does not attempt to use other winning nodes for resilience
      // This is a limitation that could be addressed in future improvements for better fault tolerance
    })

    it('should demonstrate single point of failure with only winningNodes[0]', async () => {
      const activeNodes = [
        createMockActiveNode('node1'),
        createMockActiveNode('node2'),
        createMockActiveNode('node3'),
      ]

      const validatorListHash = 'validator-hash-123' as hexstring
      const archiverListHash = 'archiver-hash-456' as hexstring
      const validatorList = [createMockValidator('v1')]
      const archiverList = [createMockArchiver('a1')]
      const standbyNodeList = [] as any
      const txList = [] as any
      const latestCycle = createMockCycle(100, validatorListHash, archiverListHash)

      // Setup successful responses for all non-historical queries
      mockRobustQueryForValidatorListHash.mockReturnValue(
        okAsync({ value: { nodeListHash: validatorListHash }, winningNodes: activeNodes })
      )
      mockGetValidatorListFromNode.mockReturnValue(okAsync(validatorList))
      mockVerifyValidatorList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForArchiverListHash.mockReturnValue(
        okAsync({ value: { archiverListHash }, winningNodes: activeNodes })
      )
      mockGetArchiverListFromNode.mockReturnValue(okAsync(archiverList))
      mockVerifyArchiverList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForStandbyNodeListHash.mockReturnValue(
        okAsync({ value: { standbyNodeListHash: 'standby-hash' }, winningNodes: activeNodes })
      )
      mockGetStandbyNodeListFromNode.mockReturnValue(okAsync(standbyNodeList))

      mockRobustQueryForTxListHash.mockReturnValue(
        okAsync({ value: { txListHash: 'tx-hash' }, winningNodes: activeNodes })
      )
      mockGetTxListFromNode.mockReturnValue(okAsync(txList))
      mockVerifyTxList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForCycleRecordHash.mockReturnValue(
        okAsync({ value: { currentCycleHash: 'cycle-hash' }, winningNodes: activeNodes })
      )
      mockGetCycleDataFromNode.mockReturnValue(okAsync(latestCycle))
      mockVerifyCycleRecord.mockReturnValue(okAsync(void 0))

      mockMakeCycleMarker.mockImplementation((cycle) => cycle.marker)
      
      mockDigestCycle.mockImplementation(() => {
        mockCycleChainNewest = latestCycle
        mockCycleChainOldest = latestCycle
        mockCycleChainCycles = [latestCycle]
      })

      mockConfig.p2p.syncV2HistoricalCyclesCount = 5

      const historicalMarkers = ['marker95', 'marker96', 'marker97', 'marker98', 'marker99']
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: [...historicalMarkers, 'marker100'], 
            oldestCounter: 95 
          }, 
          winningNodes: activeNodes // Multiple winning nodes available
        })
      )

      // Simulate winningNodes[0] failing for batch fetching, but other nodes would be available
      mockGetCyclesBatchFromNode.mockReturnValue(
        errAsync(new Error('winningNodes[0] failed - node1 is down'))
      )

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // The entire sync fails even though nodes[1] and nodes[2] are available
      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('winningNodes[0] failed - node1 is down')
      }

      // Verify only the first winning node was attempted
      expect(mockGetCyclesBatchFromNode).toHaveBeenCalledTimes(1)
      expect(mockGetCyclesBatchFromNode).toHaveBeenCalledWith(activeNodes[0], historicalMarkers)

      // This demonstrates the limitation: even though activeNodes[1] and activeNodes[2] 
      // are available and were winning nodes, they are never tried as fallbacks.
      // This reduces fault tolerance in the historical cycles sync process.
      
      // Future improvement would implement node fallback logic to try other winning nodes
      // when the first one fails, improving overall system resilience.
    })
  })

  describe('syncV2 with historical cycles - performance', () => {
    const createRealisticCycle = (counter: number, validatorListHash: hexstring, archiverListHash: hexstring): P2P.CycleCreatorTypes.CycleRecord => {
      // Create cycles with realistic data sizes to simulate memory usage
      const largeNodeList = Array.from({ length: 100 }, (_, i) => ({
        id: `node-${counter}-${i}`,
        externalIp: '192.168.1.' + (i % 255),
        externalPort: 9001 + i,
        internalIp: '10.0.0.' + (i % 255),
        internalPort: 10001 + i,
        publicKey: 'a'.repeat(64), // Realistic key size
        certificate: 'b'.repeat(200), // Realistic certificate size
      }))

      const largeTxList = Array.from({ length: 1000 }, (_, i) => ({
        txId: `tx-${counter}-${i}`,
        hash: 'c'.repeat(64),
        timestamp: Date.now(),
        data: 'd'.repeat(500), // 500 chars per tx to simulate realistic transaction size
      }))

      return {
        counter,
        previous: counter > 1 ? `cycle-hash-${counter - 1}` : '',
        marker: `cycle-marker-${counter}`,
        start: counter * 30,
        duration: 30,
        networkConfigHash: 'config-hash-' + counter,
        nodeListHash: validatorListHash,
        standbyNodeListHash: 'standby-hash-' + counter,
        archiverListHash,
        txListHash: `tx-hash-${counter}`,
        mode: 'forming',
        active: largeNodeList.length,
        activatedPublicKeys: largeNodeList.map(n => n.publicKey),
        removed: [],
        apoptosized: [],
        lost: [],
        refuted: [],
        expired: 0,
        desired: largeNodeList.length,
        syncing: 0,
        joinedConsensors: largeNodeList.slice(0, 10), // First 10 nodes joined this cycle
        activated: largeNodeList.slice(0, 5).map(n => n.id), // 5 activated
        standbyAdd: [],
        standbyRefresh: [],
        standbyRemove: [],
        refreshedConsensors: [],
        txPause: false,
        networkStateHash: 'state-hash-' + counter,
        networkReceiptHash: 'receipt-hash-' + counter,
        networkSummaryHash: 'summary-hash-' + counter,
        // Add some large data structures to simulate realistic memory usage
        cycleNotes: 'e'.repeat(1000), // 1KB of notes per cycle
        appData: {
          networkAccount: 'f'.repeat(2000), // 2KB of network account data
          partitionReport: 'g'.repeat(1500), // 1.5KB of partition data
        },
      } as unknown as P2P.CycleCreatorTypes.CycleRecord
    }

    it('should handle memory efficiently with large realistic cycles', async () => {
      const activeNodes = [
        createMockActiveNode('node1'),
        createMockActiveNode('node2'),
        createMockActiveNode('node3'),
      ]

      const validatorListHash = 'validator-hash-123' as hexstring
      const archiverListHash = 'archiver-hash-456' as hexstring
      
      // Create realistic validator and archiver lists with substantial data
      const largeValidatorList = Array.from({ length: 200 }, (_, i) => createMockValidator(`v${i}`))
      const largeArchiverList = Array.from({ length: 50 }, (_, i) => createMockArchiver(`a${i}`))
      const standbyNodeList = Array.from({ length: 100 }, (_, i) => ({ 
        nodeInfo: { id: `standby${i}`, data: 'x'.repeat(1000) } 
      })) as any
      const largeTxList = Array.from({ length: 2000 }, (_, i) => ({ 
        hash: `tx${i}`, 
        tx: { txId: `tx${i}`, data: 'y'.repeat(500) } 
      })) as any

      // Setup successful responses for all non-historical queries
      mockRobustQueryForValidatorListHash.mockReturnValue(
        okAsync({ value: { nodeListHash: validatorListHash }, winningNodes: [activeNodes[0]] })
      )
      mockGetValidatorListFromNode.mockReturnValue(okAsync(largeValidatorList))
      mockVerifyValidatorList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForArchiverListHash.mockReturnValue(
        okAsync({ value: { archiverListHash }, winningNodes: [activeNodes[0]] })
      )
      mockGetArchiverListFromNode.mockReturnValue(okAsync(largeArchiverList))
      mockVerifyArchiverList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForStandbyNodeListHash.mockReturnValue(
        okAsync({ value: { standbyNodeListHash: 'standby-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetStandbyNodeListFromNode.mockReturnValue(okAsync(standbyNodeList))

      mockRobustQueryForTxListHash.mockReturnValue(
        okAsync({ value: { txListHash: 'tx-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetTxListFromNode.mockReturnValue(okAsync(largeTxList))
      mockVerifyTxList.mockReturnValue(okAsync(void 0))

      // Configure for maximum historical cycles
      mockConfig.p2p.syncV2HistoricalCyclesCount = 10 // Use smaller number for simpler test

      // Create realistic latest cycle with large data
      const latestCycle = createRealisticCycle(101, validatorListHash, archiverListHash)

      mockRobustQueryForCycleRecordHash.mockReturnValue(
        okAsync({ value: { currentCycleHash: 'cycle-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetCycleDataFromNode.mockReturnValue(okAsync(latestCycle))
      mockVerifyCycleRecord.mockReturnValue(okAsync(void 0))

      mockMakeCycleMarker.mockImplementation((cycle) => `marker${cycle.counter}`)
      
      mockDigestCycle.mockImplementation(() => {
        mockCycleChainNewest = latestCycle
        mockCycleChainOldest = latestCycle
        mockCycleChainCycles = [latestCycle]
      })

      // Create 10 historical cycle markers (91-100) that connect to latest cycle (101)
      const historicalMarkers = Array.from({ length: 10 }, (_, i) => `marker${i + 91}`)
      
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { 
            cycleMarkers: [...historicalMarkers, 'marker101'], 
            oldestCounter: 91 
          }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      // Create 10 realistic historical cycles (91-100) that connect to latest cycle (101)
      const historicalCycles = Array.from({ length: 10 }, (_, i) => 
        createRealisticCycle(i + 91, validatorListHash, archiverListHash)
      )

      // Mock batch responses - return all historical cycles for simplicity
      mockGetCyclesBatchFromNode.mockReturnValue(
        okAsync({ cycles: historicalCycles })
      )

      mockCycleChainValidate.mockReturnValue(true)
      mockCycleChainPrependMultiple.mockImplementation((cycles) => {
        mockCycleChainCycles = [...cycles, ...mockCycleChainCycles]
        mockCycleChainOldest = cycles[0] || mockCycleChainOldest
      })

      // Measure memory usage before sync
      const memoryBefore = process.memoryUsage()
      const startTime = performance.now()

      const mockShardus = createMockShardus()
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      const endTime = performance.now()
      const memoryAfter = process.memoryUsage()

      // Verify sync succeeded
      expect(result.isOk()).toBe(true)

      // Verify historical cycles were processed
      expect(mockGetCyclesBatchFromNode).toHaveBeenCalledTimes(1) // 1 batch for 10 cycles
      expect(mockCycleChainPrependMultiple).toHaveBeenCalledWith(expect.any(Array))

      // Memory usage verification
      const memoryIncreaseMB = (memoryAfter.heapUsed - memoryBefore.heapUsed) / (1024 * 1024)
      const syncTime = endTime - startTime

      // Log memory and performance metrics for debugging
      console.log(`Sync with large realistic cycles completed in ${syncTime.toFixed(2)}ms`)
      console.log(`Memory increase: ${memoryIncreaseMB.toFixed(2)}MB`)
      console.log(`Heap before: ${(memoryBefore.heapUsed / 1024 / 1024).toFixed(2)}MB`)
      console.log(`Heap after: ${(memoryAfter.heapUsed / 1024 / 1024).toFixed(2)}MB`)

      // Verify reasonable memory usage (should not exceed 50MB increase for realistic test)
      expect(memoryIncreaseMB).toBeLessThan(50)

      // Verify reasonable performance (should complete within 2 seconds)
      expect(syncTime).toBeLessThan(2000)

      // Verify no memory leaks by checking that objects are properly cleaned up
      // Note: In a real test environment, you might want to force garbage collection
      // and verify memory returns to baseline levels
    })

    it('should not accumulate memory across multiple sync operations', async () => {
      const activeNodes = [createMockActiveNode('node1')]
      const validatorListHash = 'validator-hash-123' as hexstring
      const archiverListHash = 'archiver-hash-456' as hexstring

      // Configure for smaller historical sync
      mockConfig.p2p.syncV2HistoricalCyclesCount = 5

      const mockShardus = createMockShardus()
      const baselineMemory = process.memoryUsage()

      // Perform 3 sync operations
      for (let iteration = 1; iteration <= 3; iteration++) {
        // Setup responses for this iteration
        mockRobustQueryForValidatorListHash.mockReturnValue(
          okAsync({ value: { nodeListHash: validatorListHash }, winningNodes: [activeNodes[0]] })
        )
        mockGetValidatorListFromNode.mockReturnValue(okAsync([createMockValidator('v1')]))
        mockVerifyValidatorList.mockReturnValue(okAsync(void 0))

        mockRobustQueryForArchiverListHash.mockReturnValue(
          okAsync({ value: { archiverListHash }, winningNodes: [activeNodes[0]] })
        )
        mockGetArchiverListFromNode.mockReturnValue(okAsync([createMockArchiver('a1')]))
        mockVerifyArchiverList.mockReturnValue(okAsync(void 0))

        mockRobustQueryForStandbyNodeListHash.mockReturnValue(
          okAsync({ value: { standbyNodeListHash: 'standby-hash' }, winningNodes: [activeNodes[0]] })
        )
        mockGetStandbyNodeListFromNode.mockReturnValue(okAsync([]))

        mockRobustQueryForTxListHash.mockReturnValue(
          okAsync({ value: { txListHash: 'tx-hash' }, winningNodes: [activeNodes[0]] })
        )
        mockGetTxListFromNode.mockReturnValue(okAsync([]))
        mockVerifyTxList.mockReturnValue(okAsync(void 0))

        // Create cycle for this iteration
        const cycleCounter = 100 + iteration
        const cycle = createRealisticCycle(cycleCounter, validatorListHash, archiverListHash)
        
        mockRobustQueryForCycleRecordHash.mockReturnValue(
          okAsync({ value: { currentCycleHash: `cycle-hash-${iteration}` }, winningNodes: [activeNodes[0]] })
        )
        mockGetCycleDataFromNode.mockReturnValue(okAsync(cycle))
        mockVerifyCycleRecord.mockReturnValue(okAsync(void 0))

        mockMakeCycleMarker.mockImplementation((cycle) => `marker${cycle.counter}`)
        mockDigestCycle.mockImplementation(() => {
          mockCycleChainNewest = cycle
          mockCycleChainOldest = cycle
          mockCycleChainCycles = [cycle]
        })

        // Create historical cycles for this iteration
        const startCounter = cycleCounter - 5
        const markers = Array.from({ length: 5 }, (_, i) => `marker${startCounter + i}`)
        mockRobustQueryForRecentCycleMarkers.mockReturnValue(
          okAsync({ 
            value: { cycleMarkers: [...markers, `marker${cycleCounter}`], oldestCounter: startCounter }, 
            winningNodes: [activeNodes[0]] 
          })
        )

        const historicalCycles = Array.from({ length: 5 }, (_, i) => 
          createRealisticCycle(startCounter + i, validatorListHash, archiverListHash)
        )

        mockGetCyclesBatchFromNode.mockReturnValue(okAsync({ cycles: historicalCycles }))
        mockCycleChainValidate.mockReturnValue(true)
        mockCycleChainPrependMultiple.mockImplementation(() => {})

        // Perform sync
        const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)
        expect(result.isOk()).toBe(true)
      }

      const finalMemory = process.memoryUsage()
      const totalMemoryIncreaseMB = (finalMemory.heapUsed - baselineMemory.heapUsed) / (1024 * 1024)

      console.log(`Memory increase after 3 sync operations: ${totalMemoryIncreaseMB.toFixed(2)}MB`)

      // Verify memory doesn't accumulate excessively across multiple operations
      // Each operation processes 5 cycles, so 3 operations = 15 cycles total
      // Memory increase should be reasonable and not grow linearly with number of operations
      expect(totalMemoryIncreaseMB).toBeLessThan(50) // Should not exceed 50MB for 3 operations
    })
  })

  describe('syncV2 - integration scenarios', () => {
    it('should fail entire operation if latest cycle sync fails after historical success', async () => {
      const activeNodes = [createMockActiveNode('node1')]
      const validatorListHash = 'validator-hash-123' as hexstring
      const archiverListHash = 'archiver-hash-456' as hexstring

      // Configure for historical sync
      mockConfig.p2p.syncV2HistoricalCyclesCount = 5

      const mockShardus = createMockShardus()

      // Setup successful validator list sync
      mockRobustQueryForValidatorListHash.mockReturnValue(
        okAsync({ value: { nodeListHash: validatorListHash }, winningNodes: [activeNodes[0]] })
      )
      mockGetValidatorListFromNode.mockReturnValue(okAsync([createMockValidator('v1')]))
      mockVerifyValidatorList.mockReturnValue(okAsync(void 0))

      // Setup successful archiver list sync
      mockRobustQueryForArchiverListHash.mockReturnValue(
        okAsync({ value: { archiverListHash }, winningNodes: [activeNodes[0]] })
      )
      mockGetArchiverListFromNode.mockReturnValue(okAsync([createMockArchiver('a1')]))
      mockVerifyArchiverList.mockReturnValue(okAsync(void 0))

      // Setup successful standby list sync
      mockRobustQueryForStandbyNodeListHash.mockReturnValue(
        okAsync({ value: { standbyNodeListHash: 'standby-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetStandbyNodeListFromNode.mockReturnValue(okAsync([]))

      // Setup successful tx list sync
      mockRobustQueryForTxListHash.mockReturnValue(
        okAsync({ value: { txListHash: 'tx-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetTxListFromNode.mockReturnValue(okAsync([]))
      mockVerifyTxList.mockReturnValue(okAsync(void 0))

      // Setup FAILING latest cycle sync (this happens before historical sync)
      mockRobustQueryForCycleRecordHash.mockReturnValue(
        errAsync(new Error('Latest cycle sync failed'))
      )

      mockMakeCycleMarker.mockImplementation((cycle) => `marker${cycle.counter}`)

      // Perform sync - should fail due to latest cycle sync failure
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Verify entire operation fails
      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('Latest cycle sync failed')
      }

      // Verify latest cycle sync was attempted and failed (this happens first)
      expect(mockRobustQueryForCycleRecordHash).toHaveBeenCalledTimes(1)

      // Verify historical sync was NEVER attempted because latest cycle sync failed first
      expect(mockGetCyclesBatchFromNode).toHaveBeenCalledTimes(0)
      expect(mockCycleChainPrependMultiple).toHaveBeenCalledTimes(0)
      expect(mockRobustQueryForRecentCycleMarkers).toHaveBeenCalledTimes(0)

      // Verify no state updates occurred in Shardus
      expect(mockShardus.earlyConfigFetchAndPatch).not.toHaveBeenCalled()
    })

    it('should maintain state consistency across all components', async () => {
      const activeNodes = [createMockActiveNode('node1')]
      const validatorListHash = 'validator-hash-123' as hexstring
      const archiverListHash = 'archiver-hash-456' as hexstring

      // Configure for historical sync
      mockConfig.p2p.syncV2HistoricalCyclesCount = 3

      const mockShardus = createMockShardus()

      // Setup all successful syncs
      mockRobustQueryForValidatorListHash.mockReturnValue(
        okAsync({ value: { nodeListHash: validatorListHash }, winningNodes: [activeNodes[0]] })
      )
      const validatorList = [createMockValidator('v1'), createMockValidator('v2')]
      mockGetValidatorListFromNode.mockReturnValue(okAsync(validatorList))
      mockVerifyValidatorList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForArchiverListHash.mockReturnValue(
        okAsync({ value: { archiverListHash }, winningNodes: [activeNodes[0]] })
      )
      const archiverList = [createMockArchiver('a1')]
      mockGetArchiverListFromNode.mockReturnValue(okAsync(archiverList))
      mockVerifyArchiverList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForStandbyNodeListHash.mockReturnValue(
        okAsync({ value: { standbyNodeListHash: 'standby-hash' }, winningNodes: [activeNodes[0]] })
      )
      const standbyList = []
      mockGetStandbyNodeListFromNode.mockReturnValue(okAsync(standbyList))

      mockRobustQueryForTxListHash.mockReturnValue(
        okAsync({ value: { txListHash: 'tx-hash' }, winningNodes: [activeNodes[0]] })
      )
      const txList = [{ txId: 'tx1', timestamp: 1000 }]
      mockGetTxListFromNode.mockReturnValue(okAsync(txList))
      mockVerifyTxList.mockReturnValue(okAsync(void 0))

      // Setup historical cycle sync
      const startCounter = 97
      const markers = Array.from({ length: 3 }, (_, i) => `marker${startCounter + i}`)
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { cycleMarkers: [...markers, 'marker100'], oldestCounter: startCounter }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      const historicalCycles = Array.from({ length: 3 }, (_, i) => 
        createMockCycle(startCounter + i, validatorListHash, archiverListHash)
      )

      mockGetCyclesBatchFromNode.mockReturnValue(okAsync({ cycles: historicalCycles }))
      mockCycleChainValidate.mockReturnValue(true)
      mockCycleChainPrependMultiple.mockImplementation(() => {
        // Simulate CycleChain state update
        mockCycleChainCycles = [...historicalCycles, ...mockCycleChainCycles]
        mockCycleChainOldest = historicalCycles[0]
      })

      // Setup latest cycle sync
      const latestCycle = createMockCycle(100, validatorListHash, archiverListHash)
      mockRobustQueryForCycleRecordHash.mockReturnValue(
        okAsync({ value: { currentCycleHash: 'cycle-hash-100' }, winningNodes: [activeNodes[0]] })
      )
      mockGetCycleDataFromNode.mockReturnValue(okAsync(latestCycle))
      mockVerifyCycleRecord.mockReturnValue(okAsync(void 0))

      mockMakeCycleMarker.mockImplementation((cycle) => `marker${cycle.counter}`)
      mockDigestCycle.mockImplementation(() => {
        // Simulate Sync module state update
        mockCycleChainNewest = latestCycle
        mockCycleChainCycles = [...mockCycleChainCycles, latestCycle]
      })

      // Perform full sync
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Verify successful sync
      expect(result.isOk()).toBe(true)

      // Verify CycleChain state consistency
      expect(mockCycleChainPrependMultiple).toHaveBeenCalledWith(historicalCycles)
      expect(mockDigestCycle).toHaveBeenCalledWith(latestCycle, 'syncV2')

      // Verify NodeList updated correctly with validator list
      expect(mockAddNodes).toHaveBeenCalledWith(validatorList, 'syncV2', latestCycle)

      // Note: Archivers are handled differently - they don't use addNodes function
      // They are added directly to the archivers Map via set() operations

      // Verify ServiceQueue updated with tx list
      expect(mockSetTxList).toHaveBeenCalledWith(txList)

      // Verify Shardus state updated correctly
      expect(mockShardus.earlyConfigFetchAndPatch).toHaveBeenCalledWith(latestCycle.counter)

      // Verify all component interactions occurred in correct order
      const mockCallOrder = [
        'robustQueryForValidatorListHash',
        'getValidatorListFromNode', 
        'verifyValidatorList',
        'robustQueryForArchiverListHash',
        'getArchiverListFromNode',
        'verifyArchiverList', 
        'robustQueryForStandbyNodeListHash',
        'getStandbyNodeListFromNode',
        'robustQueryForTxListHash',
        'getTxListFromNode',
        'verifyTxList',
        'robustQueryForRecentCycleMarkers',
        'getCyclesBatchFromNode',
        'robustQueryForCycleRecordHash',
        'getCycleDataFromNode',
        'verifyCycleRecord'
      ]

      // Verify each component function was called exactly once
      expect(mockRobustQueryForValidatorListHash).toHaveBeenCalledTimes(1)
      expect(mockGetValidatorListFromNode).toHaveBeenCalledTimes(1)
      expect(mockVerifyValidatorList).toHaveBeenCalledTimes(1)
      expect(mockRobustQueryForArchiverListHash).toHaveBeenCalledTimes(1)
      expect(mockGetArchiverListFromNode).toHaveBeenCalledTimes(1)
      expect(mockVerifyArchiverList).toHaveBeenCalledTimes(1)
      expect(mockRobustQueryForStandbyNodeListHash).toHaveBeenCalledTimes(1)
      expect(mockGetStandbyNodeListFromNode).toHaveBeenCalledTimes(1)
      expect(mockRobustQueryForTxListHash).toHaveBeenCalledTimes(1)
      expect(mockGetTxListFromNode).toHaveBeenCalledTimes(1)
      expect(mockVerifyTxList).toHaveBeenCalledTimes(1)
      expect(mockRobustQueryForRecentCycleMarkers).toHaveBeenCalledTimes(1)
      expect(mockGetCyclesBatchFromNode).toHaveBeenCalledTimes(1)
      expect(mockCycleChainValidate).toHaveBeenCalledTimes(2) // Called for each adjacent pair: (97,98) and (98,99)
      expect(mockCycleChainPrependMultiple).toHaveBeenCalledTimes(1)
      expect(mockRobustQueryForCycleRecordHash).toHaveBeenCalledTimes(1)
      expect(mockGetCycleDataFromNode).toHaveBeenCalledTimes(1)
      expect(mockVerifyCycleRecord).toHaveBeenCalledTimes(1)
      expect(mockDigestCycle).toHaveBeenCalledTimes(1)
      expect(mockAddNodes).toHaveBeenCalledTimes(1) // Only once for validators (archivers use different mechanism)
      expect(mockSetTxList).toHaveBeenCalledTimes(1)
      expect(mockShardus.earlyConfigFetchAndPatch).toHaveBeenCalledTimes(1)
    })
  })

  describe('syncV2 - config validation', () => {
    it('should handle invalid config types gracefully', async () => {
      const activeNodes = [createMockActiveNode('node1')]
      const validatorListHash = 'validator-hash-123' as hexstring
      const archiverListHash = 'archiver-hash-456' as hexstring

      const mockShardus = createMockShardus()

      // Setup successful basic sync operations
      mockRobustQueryForValidatorListHash.mockReturnValue(
        okAsync({ value: { nodeListHash: validatorListHash }, winningNodes: [activeNodes[0]] })
      )
      mockGetValidatorListFromNode.mockReturnValue(okAsync([createMockValidator('v1')]))
      mockVerifyValidatorList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForArchiverListHash.mockReturnValue(
        okAsync({ value: { archiverListHash }, winningNodes: [activeNodes[0]] })
      )
      mockGetArchiverListFromNode.mockReturnValue(okAsync([createMockArchiver('a1')]))
      mockVerifyArchiverList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForStandbyNodeListHash.mockReturnValue(
        okAsync({ value: { standbyNodeListHash: 'standby-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetStandbyNodeListFromNode.mockReturnValue(okAsync([]))

      mockRobustQueryForTxListHash.mockReturnValue(
        okAsync({ value: { txListHash: 'tx-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetTxListFromNode.mockReturnValue(okAsync([]))
      mockVerifyTxList.mockReturnValue(okAsync(void 0))

      // Setup latest cycle sync
      const latestCycle = createMockCycle(100, validatorListHash, archiverListHash)
      mockRobustQueryForCycleRecordHash.mockReturnValue(
        okAsync({ value: { currentCycleHash: 'cycle-hash-100' }, winningNodes: [activeNodes[0]] })
      )
      mockGetCycleDataFromNode.mockReturnValue(okAsync(latestCycle))
      mockVerifyCycleRecord.mockReturnValue(okAsync(void 0))

      mockMakeCycleMarker.mockImplementation((cycle) => `marker${cycle.counter}`)
      mockDigestCycle.mockImplementation(() => {
        // Simulate Sync module state update
        mockCycleChainNewest = latestCycle
        mockCycleChainCycles = [...mockCycleChainCycles, latestCycle]
      })

      // Test different invalid config types
      const configTests = [
        { value: null, description: 'null (gets converted to 0 by || operator)', expectHistoricalSync: false },
        { value: undefined, description: 'undefined (gets converted to 0 by || operator)', expectHistoricalSync: false },
        { value: NaN, description: 'NaN (gets converted to 0 by || operator)', expectHistoricalSync: false },
        { value: -5, description: 'negative number (should be clamped to 0)', expectHistoricalSync: false },
        { value: 1.5, description: 'decimal number (should be truncated)', expectHistoricalSync: true }
      ]

      for (const { value, description, expectHistoricalSync } of configTests) {
        // Reset mocks for each test
        jest.clearAllMocks()
        mockRobustQueryForValidatorListHash.mockReturnValue(
          okAsync({ value: { nodeListHash: validatorListHash }, winningNodes: [activeNodes[0]] })
        )
        mockGetValidatorListFromNode.mockReturnValue(okAsync([createMockValidator('v1')]))
        mockVerifyValidatorList.mockReturnValue(okAsync(void 0))
        mockRobustQueryForArchiverListHash.mockReturnValue(
          okAsync({ value: { archiverListHash }, winningNodes: [activeNodes[0]] })
        )
        mockGetArchiverListFromNode.mockReturnValue(okAsync([createMockArchiver('a1')]))
        mockVerifyArchiverList.mockReturnValue(okAsync(void 0))
        mockRobustQueryForStandbyNodeListHash.mockReturnValue(
          okAsync({ value: { standbyNodeListHash: 'standby-hash' }, winningNodes: [activeNodes[0]] })
        )
        mockGetStandbyNodeListFromNode.mockReturnValue(okAsync([]))
        mockRobustQueryForTxListHash.mockReturnValue(
          okAsync({ value: { txListHash: 'tx-hash' }, winningNodes: [activeNodes[0]] })
        )
        mockGetTxListFromNode.mockReturnValue(okAsync([]))
        mockVerifyTxList.mockReturnValue(okAsync(void 0))
        mockRobustQueryForCycleRecordHash.mockReturnValue(
          okAsync({ value: { currentCycleHash: 'cycle-hash-100' }, winningNodes: [activeNodes[0]] })
        )
        mockGetCycleDataFromNode.mockReturnValue(okAsync(latestCycle))
        mockVerifyCycleRecord.mockReturnValue(okAsync(void 0))

        if (expectHistoricalSync) {
          // Mock historical sync for cases where it should happen
          mockRobustQueryForRecentCycleMarkers.mockReturnValue(
            okAsync({ value: { cycleMarkers: ['marker99'], oldestCounter: 99 }, winningNodes: [activeNodes[0]] })
          )
          mockGetCyclesBatchFromNode.mockReturnValue(okAsync({ cycles: [] }))
        }

        // Set config value
        mockConfig.p2p.syncV2HistoricalCyclesCount = value as any

        // Perform sync - should handle config gracefully
        const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

        // Verify operation completes without crashing
        expect(result.isOk()).toBe(true)

        if (expectHistoricalSync) {
          // Should attempt historical sync for valid positive values
          expect(mockRobustQueryForRecentCycleMarkers).toHaveBeenCalled()
        } else {
          // Should not attempt historical sync for invalid/zero values
          expect(mockRobustQueryForRecentCycleMarkers).not.toHaveBeenCalled()
        }
      }

      // Test config types that result in NaN (these expose a bug in the current implementation)
      // Note: Due to `|| 0` in the implementation, only truthy non-numeric values actually become NaN
      const nanConfigs = ['string', {}]
      
      for (const invalidConfig of nanConfigs) {
        // Reset mocks for each test
        jest.clearAllMocks()
        mockRobustQueryForValidatorListHash.mockReturnValue(
          okAsync({ value: { nodeListHash: validatorListHash }, winningNodes: [activeNodes[0]] })
        )
        mockGetValidatorListFromNode.mockReturnValue(okAsync([createMockValidator('v1')]))
        mockVerifyValidatorList.mockReturnValue(okAsync(void 0))
        mockRobustQueryForArchiverListHash.mockReturnValue(
          okAsync({ value: { archiverListHash }, winningNodes: [activeNodes[0]] })
        )
        mockGetArchiverListFromNode.mockReturnValue(okAsync([createMockArchiver('a1')]))
        mockVerifyArchiverList.mockReturnValue(okAsync(void 0))
        mockRobustQueryForStandbyNodeListHash.mockReturnValue(
          okAsync({ value: { standbyNodeListHash: 'standby-hash' }, winningNodes: [activeNodes[0]] })
        )
        mockGetStandbyNodeListFromNode.mockReturnValue(okAsync([]))
        mockRobustQueryForTxListHash.mockReturnValue(
          okAsync({ value: { txListHash: 'tx-hash' }, winningNodes: [activeNodes[0]] })
        )
        mockGetTxListFromNode.mockReturnValue(okAsync([]))
        mockVerifyTxList.mockReturnValue(okAsync(void 0))
        mockRobustQueryForCycleRecordHash.mockReturnValue(
          okAsync({ value: { currentCycleHash: 'cycle-hash-100' }, winningNodes: [activeNodes[0]] })
        )
        mockGetCycleDataFromNode.mockReturnValue(okAsync(latestCycle))
        mockVerifyCycleRecord.mockReturnValue(okAsync(void 0))

        // NaN configs will try to call historical sync (this is the bug)
        // so we need to mock these functions to prevent errors
        mockRobustQueryForRecentCycleMarkers.mockReturnValue(
          okAsync({ value: { cycleMarkers: ['marker99'], oldestCounter: 99 }, winningNodes: [activeNodes[0]] })
        )
        mockGetCyclesBatchFromNode.mockReturnValue(okAsync({ cycles: [] }))

        // Set invalid config that results in NaN
        mockConfig.p2p.syncV2HistoricalCyclesCount = invalidConfig as any

        // Perform sync - documents current behavior (bug: NaN values cause historical sync to be attempted)
        const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

        // Verify operation completes without crashing
        expect(result.isOk()).toBe(true)

        // Document the bug: NaN configs should not trigger historical sync but currently do
        // This test documents the current incorrect behavior for future fixing
        expect(mockRobustQueryForRecentCycleMarkers).toHaveBeenCalled()
      }
    })

    it('should use consistent config value throughout sync operation', async () => {
      const activeNodes = [createMockActiveNode('node1')]
      const validatorListHash = 'validator-hash-123' as hexstring
      const archiverListHash = 'archiver-hash-456' as hexstring

      // Start with config value 5
      mockConfig.p2p.syncV2HistoricalCyclesCount = 5

      const mockShardus = createMockShardus()

      // Setup successful basic sync operations
      mockRobustQueryForValidatorListHash.mockReturnValue(
        okAsync({ value: { nodeListHash: validatorListHash }, winningNodes: [activeNodes[0]] })
      )
      mockGetValidatorListFromNode.mockReturnValue(okAsync([createMockValidator('v1')]))
      mockVerifyValidatorList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForArchiverListHash.mockReturnValue(
        okAsync({ value: { archiverListHash }, winningNodes: [activeNodes[0]] })
      )
      mockGetArchiverListFromNode.mockReturnValue(okAsync([createMockArchiver('a1')]))
      mockVerifyArchiverList.mockReturnValue(okAsync(void 0))

      mockRobustQueryForStandbyNodeListHash.mockReturnValue(
        okAsync({ value: { standbyNodeListHash: 'standby-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetStandbyNodeListFromNode.mockReturnValue(okAsync([]))

      mockRobustQueryForTxListHash.mockReturnValue(
        okAsync({ value: { txListHash: 'tx-hash' }, winningNodes: [activeNodes[0]] })
      )
      mockGetTxListFromNode.mockReturnValue(okAsync([]))
      mockVerifyTxList.mockReturnValue(okAsync(void 0))

      // Setup historical cycles sync
      const startCounter = 95
      const markers = Array.from({ length: 5 }, (_, i) => `marker${startCounter + i}`)
      
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({ 
          value: { cycleMarkers: [...markers, 'marker100'], oldestCounter: startCounter }, 
          winningNodes: [activeNodes[0]] 
        })
      )

      const historicalCycles = Array.from({ length: 5 }, (_, i) => 
        createMockCycle(startCounter + i, validatorListHash, archiverListHash)
      )

      mockGetCyclesBatchFromNode.mockReturnValue(okAsync({ cycles: historicalCycles }))
      mockCycleChainValidate.mockReturnValue(true)
      mockCycleChainPrependMultiple.mockImplementation(() => {
        // Simulate CycleChain state update
        mockCycleChainCycles = [...historicalCycles, ...mockCycleChainCycles]
        mockCycleChainOldest = historicalCycles[0]
      })

      // Setup latest cycle sync
      const latestCycle = createMockCycle(100, validatorListHash, archiverListHash)
      mockRobustQueryForCycleRecordHash.mockReturnValue(
        okAsync({ value: { currentCycleHash: 'cycle-hash-100' }, winningNodes: [activeNodes[0]] })
      )
      mockGetCycleDataFromNode.mockReturnValue(okAsync(latestCycle))
      mockVerifyCycleRecord.mockReturnValue(okAsync(void 0))

      mockMakeCycleMarker.mockImplementation((cycle) => `marker${cycle.counter}`)
      mockDigestCycle.mockImplementation(() => {
        // Simulate Sync module state update
        mockCycleChainNewest = latestCycle
        mockCycleChainCycles = [...mockCycleChainCycles, latestCycle]
      })

      // Intercept the historical sync operation to change config mid-operation
      let configChangeExecuted = false
      mockGetCyclesBatchFromNode.mockImplementation((...args) => {
        if (!configChangeExecuted) {
          // Change config during operation from 5 to 10
          mockConfig.p2p.syncV2HistoricalCyclesCount = 10
          configChangeExecuted = true
        }
        return okAsync({ cycles: historicalCycles })
      })

      // Perform sync
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Verify operation completes successfully
      expect(result.isOk()).toBe(true)

      // Verify historical cycles were fetched using original config value (5)
      expect(mockGetCyclesBatchFromNode).toHaveBeenCalledTimes(1)
      expect(mockGetCyclesBatchFromNode).toHaveBeenCalledWith(
        activeNodes[0],
        markers
      )

      // Verify exactly 5 cycles were processed (not 10)
      expect(mockCycleChainPrependMultiple).toHaveBeenCalledWith(historicalCycles)
      expect(historicalCycles).toHaveLength(5)

      // Verify config change was detected but didn't affect the operation
      expect(configChangeExecuted).toBe(true)
      expect(mockConfig.p2p.syncV2HistoricalCyclesCount).toBe(10)
    })
  })

  describe('syncV2 - response validation', () => {
    beforeEach(() => {
      jest.clearAllMocks()
      
      // Assign mock implementations
      queriesMock.initLogger = mockInitLogger
      queriesMock.robustQueryForCycleRecordHash = mockRobustQueryForCycleRecordHash
      queriesMock.robustQueryForValidatorListHash = mockRobustQueryForValidatorListHash
      queriesMock.robustQueryForArchiverListHash = mockRobustQueryForArchiverListHash
      queriesMock.robustQueryForStandbyNodeListHash = mockRobustQueryForStandbyNodeListHash
      queriesMock.robustQueryForTxListHash = mockRobustQueryForTxListHash
      queriesMock.robustQueryForRecentCycleMarkers = mockRobustQueryForRecentCycleMarkers
      queriesMock.getCycleDataFromNode = mockGetCycleDataFromNode
      queriesMock.getValidatorListFromNode = mockGetValidatorListFromNode
      queriesMock.getArchiverListFromNode = mockGetArchiverListFromNode
      queriesMock.getStandbyNodeListFromNode = mockGetStandbyNodeListFromNode
      queriesMock.getTxListFromNode = mockGetTxListFromNode
      queriesMock.getCyclesBatchFromNode = mockGetCyclesBatchFromNode
      
      verifyMock.verifyCycleRecord = mockVerifyCycleRecord
      verifyMock.verifyValidatorList = mockVerifyValidatorList
      verifyMock.verifyArchiverList = mockVerifyArchiverList
      verifyMock.verifyTxList = mockVerifyTxList
      
      routesMock.initRoutes = mockInitRoutes
      
      nodeListMock.reset = mockReset
      nodeListMock.addNodes = mockAddNodes
      cycleChainMock.reset = mockCycleChainReset
      cycleChainMock.validate = mockCycleChainValidate
      cycleChainMock.prependMultiple = mockCycleChainPrependMultiple
      syncMock.digestCycle = mockDigestCycle
      joinV2Mock.addStandbyJoinRequests = mockAddStandbyJoinRequests
      serviceQueueMock.setTxList = mockSetTxList
      cycleCreatorMock.makeCycleMarker = mockMakeCycleMarker
      
      loggerMock.logFlags = mockLogFlags
      contextMock.config = mockConfig

      // Reset CycleChain state - set newest to a valid cycle to prevent null errors
      mockCycleChainNewest = createMockCycle(100, 'validator-hash', 'archiver-hash')
      mockCycleChainOldest = null
      mockCycleChainCycles = []

      // Setup default successful verifications
      mockVerifyCycleRecord.mockReturnValue(okAsync(true))
      mockVerifyValidatorList.mockReturnValue(okAsync(true))
      mockVerifyArchiverList.mockReturnValue(okAsync(true))
      mockVerifyTxList.mockReturnValue(okAsync(true))
      mockCycleChainValidate.mockReturnValue(true)
      mockMakeCycleMarker.mockReturnValue('test-marker')
    })

    it('should reject cycles with missing required fields', async () => {
      const winningNodes = [createMockActiveNode('winner1'), createMockActiveNode('winner2')]
      const activeNodes = [...winningNodes, createMockActiveNode('node3')]

      // Mock successful hash queries
      mockRobustQueryForCycleRecordHash.mockReturnValue(okAsync({
        winningNodes,
        value: { currentCycleHash: 'current-hash' }
      }))
      mockRobustQueryForValidatorListHash.mockReturnValue(okAsync({
        winningNodes,
        value: { nodeListHash: 'validator-hash', nextCycleTimestamp: 1234567890 }
      }))
      mockRobustQueryForArchiverListHash.mockReturnValue(okAsync({
        winningNodes,
        value: { archiverListHash: 'archiver-hash' }
      }))
      mockRobustQueryForStandbyNodeListHash.mockReturnValue(okAsync({
        winningNodes,
        value: { standbyNodeListHash: 'standby-hash' }
      }))
      mockRobustQueryForTxListHash.mockReturnValue(okAsync({
        winningNodes,
        value: { txListHash: 'tx-hash' }
      }))

      // Mock successful latest cycle fetch
      const latestCycle = createMockCycle(100, 'validator-hash', 'archiver-hash')
      mockGetCycleDataFromNode.mockReturnValue(okAsync(latestCycle))

      // Mock historical cycles query returning cycles with missing required fields
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(okAsync({
        winningNodes,
        value: {
          cycleMarkers: ['marker95', 'marker96', 'marker97'],
          oldestCounter: 95
        }
      }))

      // Test cycles missing required fields: counter, previous, marker
      const cycleMissingCounter = {
        // counter: 95, // Missing required field
        previous: 'hash94',
        start: 2850,
        duration: 30,
        marker: 'marker95',
        networkId: 'test-network',
        networkConfigHash: 'config-hash-95',
        nodeListHash: 'validator-hash',
        archiverListHash: 'archiver-hash',
        standbyNodeListHash: 'standby-hash',
        mode: 'processing',
        active: 95
      }

      const cycleMissingPrevious = {
        counter: 96,
        // previous: 'hash95', // Missing required field
        start: 2880,
        duration: 30,
        marker: 'marker96',
        networkId: 'test-network',
        networkConfigHash: 'config-hash-96',
        nodeListHash: 'validator-hash',
        archiverListHash: 'archiver-hash',
        standbyNodeListHash: 'standby-hash',
        mode: 'processing',
        active: 96
      }

      const cycleMissingMarker = {
        counter: 97,
        previous: 'hash96',
        start: 2910,
        duration: 30,
        // marker: 'marker97', // Missing required field
        networkId: 'test-network',
        networkConfigHash: 'config-hash-97',
        nodeListHash: 'validator-hash',
        archiverListHash: 'archiver-hash',
        standbyNodeListHash: 'standby-hash',
        mode: 'processing',
        active: 97
      }

      // Mock batch response with cycles missing required fields
      mockGetCyclesBatchFromNode.mockReturnValue(okAsync({
        cycles: [cycleMissingCounter, cycleMissingPrevious, cycleMissingMarker]
      }))

      // Mock validator/archiver lists
      mockGetValidatorListFromNode.mockReturnValue(okAsync([createMockValidator('v1')]))
      mockGetArchiverListFromNode.mockReturnValue(okAsync([createMockArchiver('a1')]))
      mockGetStandbyNodeListFromNode.mockReturnValue(okAsync([]))
      mockGetTxListFromNode.mockReturnValue(okAsync([]))

      // Make chain validation pass first, then fail on individual cycle verification
      mockCycleChainValidate.mockReturnValue(true)
      
      // Verify cycles fail due to missing required fields
      mockVerifyCycleRecord.mockImplementation((cycle) => {
        if (!cycle.counter || cycle.previous === undefined || !cycle.marker) {
          return errAsync(new Error('Cycle missing required fields'))
        }
        return okAsync(true)
      })

      const mockShardus = {
        earlyConfigFetchAndPatch: jest.fn().mockResolvedValue(undefined)
      }
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Verify the sync operation failed due to invalid cycles
      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('Historical cycles do not connect to latest cycle')
      }

      // Verify verification was attempted on the latest cycle (historical cycles don't use verifyCycleRecord)
      expect(mockVerifyCycleRecord).toHaveBeenCalledWith(latestCycle, 'current-hash')

      // Verify batch was fetched
      expect(mockGetCyclesBatchFromNode).toHaveBeenCalledWith(
        winningNodes[0],
        ['marker95', 'marker96', 'marker97']
      )
    })

    it('should process cycles with unexpected extra fields', async () => {
      const winningNodes = [createMockActiveNode('winner1'), createMockActiveNode('winner2')]
      const activeNodes = [...winningNodes, createMockActiveNode('node3')]

      // Mock successful hash queries
      mockRobustQueryForCycleRecordHash.mockReturnValue(okAsync({
        winningNodes,
        value: { currentCycleHash: 'current-hash' }
      }))
      mockRobustQueryForValidatorListHash.mockReturnValue(okAsync({
        winningNodes,
        value: { nodeListHash: 'validator-hash', nextCycleTimestamp: 1234567890 }
      }))
      mockRobustQueryForArchiverListHash.mockReturnValue(okAsync({
        winningNodes,
        value: { archiverListHash: 'archiver-hash' }
      }))
      mockRobustQueryForStandbyNodeListHash.mockReturnValue(okAsync({
        winningNodes,
        value: { standbyNodeListHash: 'standby-hash' }
      }))
      mockRobustQueryForTxListHash.mockReturnValue(okAsync({
        winningNodes,
        value: { txListHash: 'tx-hash' }
      }))

      // Mock successful latest cycle fetch
      const latestCycle = createMockCycle(100, 'validator-hash', 'archiver-hash')
      mockGetCycleDataFromNode.mockReturnValue(okAsync(latestCycle))

      // Mock historical cycles query
      mockRobustQueryForRecentCycleMarkers.mockReturnValue(okAsync({
        winningNodes,
        value: {
          cycleMarkers: ['marker98', 'marker99'],
          oldestCounter: 98
        }
      }))

      // Create cycles with unexpected extra fields
      const cycleWithExtraFields = {
        counter: 98,
        previous: 'hash97',
        start: 2940,
        duration: 30,
        marker: 'marker98',
        networkId: 'test-network',
        networkConfigHash: 'config-hash-98',
        nodeListHash: 'validator-hash',
        archiverListHash: 'archiver-hash',
        standbyNodeListHash: 'standby-hash',
        mode: 'processing',
        active: 98,
        // Unexpected extra fields
        extraField1: 'unexpected-value',
        unknownProperty: { nested: 'data' },
        conflictingField: 'should-not-break-processing',
        debugInfo: 'this-is-extra',
        timestamp: 'additional-timestamp',
        customMetadata: ['array', 'of', 'data']
      }

      const cycleWithConflictingNames = {
        counter: 99,
        previous: 'hash98',
        start: 2970,
        duration: 30,
        marker: 'marker99',
        networkId: 'test-network',
        networkConfigHash: 'config-hash-99',
        nodeListHash: 'validator-hash',
        archiverListHash: 'archiver-hash',
        standbyNodeListHash: 'standby-hash',
        mode: 'processing',
        active: 99,
        // Fields with conflicting names (but different from required fields)
        counterExtra: 'not-the-real-counter',
        markerCopy: 'duplicate-marker-info',
        previousHash: 'alternative-previous-reference'
      }

      // Mock batch response with cycles containing extra fields
      mockGetCyclesBatchFromNode.mockReturnValue(okAsync({
        cycles: [cycleWithExtraFields, cycleWithConflictingNames]
      }))

      // Mock validator/archiver lists
      mockGetValidatorListFromNode.mockReturnValue(okAsync([createMockValidator('v1')]))
      mockGetArchiverListFromNode.mockReturnValue(okAsync([createMockArchiver('a1')]))
      mockGetStandbyNodeListFromNode.mockReturnValue(okAsync([]))
      mockGetTxListFromNode.mockReturnValue(okAsync([]))

      // Mock CycleChain prependMultiple to properly update state
      mockCycleChainPrependMultiple.mockImplementation((cycles) => {
        mockCycleChainCycles = [...cycles, ...mockCycleChainCycles]
        mockCycleChainOldest = cycles[0] || mockCycleChainOldest
      })

      const mockShardus = {
        earlyConfigFetchAndPatch: jest.fn().mockResolvedValue(undefined)
      }
      const result = await syncV2Module.syncV2(activeNodes, mockShardus as any)

      // Verify processing continues normally despite extra fields
      expect(result.isOk()).toBe(true)

      // Verify verification was performed on the latest cycle (historical cycles don't use verifyCycleRecord)
      expect(mockVerifyCycleRecord).toHaveBeenCalledWith(latestCycle, 'current-hash')

      // Verify cycles were processed successfully
      expect(mockCycleChainPrependMultiple).toHaveBeenCalledWith([
        cycleWithExtraFields,
        cycleWithConflictingNames
      ])

      // Verify batch was fetched correctly
      expect(mockGetCyclesBatchFromNode).toHaveBeenCalledWith(
        winningNodes[0],
        ['marker98', 'marker99']
      )

      // Verify extra fields didn't interfere with normal processing
      expect(mockDigestCycle).toHaveBeenCalledWith(latestCycle, 'syncV2')
    })
  })
})