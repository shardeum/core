import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { errAsync, okAsync } from 'neverthrow'
import { P2P } from '@shardeum-foundation/lib-types'
import * as SyncV2 from '../../../../../src/p2p/SyncV2/index'

// Mock all dependencies
jest.mock('../../../../../src/p2p/SyncV2/queries', () => ({
  initLogger: jest.fn(),
  robustQueryForValidatorListHash: jest.fn(),
  robustQueryForArchiverListHash: jest.fn(),
  robustQueryForStandbyNodeListHash: jest.fn(),
  robustQueryForTxListHash: jest.fn(),
  robustQueryForCycleRecordHash: jest.fn(),
  getValidatorListFromNode: jest.fn(),
  getArchiverListFromNode: jest.fn(),
  getStandbyNodeListFromNode: jest.fn(),
  getTxListFromNode: jest.fn(),
  getCycleDataFromNode: jest.fn(),
  robustQueryForRecentCycleMarkers: jest.fn(),
  getCyclesBatchFromNode: jest.fn(),
  p2pLogger: {
    info: jest.fn(),
  },
}))

jest.mock('../../../../../src/p2p/SyncV2/verify', () => ({
  verifyValidatorList: jest.fn(),
  verifyArchiverList: jest.fn(),
  verifyTxList: jest.fn(),
  verifyCycleRecord: jest.fn(),
}))

jest.mock('../../../../../src/p2p/SyncV2/routes', () => ({
  initRoutes: jest.fn(),
}))

jest.mock('../../../../../src/p2p/Archivers', () => ({
  archivers: new Map(),
}))

jest.mock('../../../../../src/p2p/NodeList', () => ({
  reset: jest.fn(),
  addNodes: jest.fn(),
}))

jest.mock('../../../../../src/p2p/CycleChain', () => ({
  reset: jest.fn(),
  newest: {
    counter: 1,
    nodeListHash: 'hash1',
    archiverListHash: 'hash2',
    standbyNodeListHash: 'hash3',
  },
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

jest.mock('../../../../../src/p2p/CycleCreator', () => ({
  makeCycleMarker: jest.fn(() => 'marker'),
}))

jest.mock('../../../../../src/utils', () => ({
  sleep: jest.fn(),
}))

jest.mock('../../../../../src/logger', () => ({
  logFlags: {
    important_as_fatal: true,
  },
}))

jest.mock('../../../../../src/p2p/ProblemNodeHandler', () => ({
  rebuildProblematicNodeCacheFromCycles: jest.fn(),
}))

jest.mock('../../../../../src/p2p/Context', () => ({
  config: {
    p2p: {
      syncV2HistoricalCyclesCount: 10,
    },
  },
}))

const {
  initLogger,
  robustQueryForValidatorListHash,
  robustQueryForArchiverListHash,
  robustQueryForStandbyNodeListHash,
  robustQueryForTxListHash,
  robustQueryForCycleRecordHash,
  getValidatorListFromNode,
  getArchiverListFromNode,
  getStandbyNodeListFromNode,
  getTxListFromNode,
  getCycleDataFromNode,
  robustQueryForRecentCycleMarkers,
  getCyclesBatchFromNode,
} = require('../../../../../src/p2p/SyncV2/queries')

const {
  verifyValidatorList,
  verifyArchiverList,
  verifyTxList,
  verifyCycleRecord,
} = require('../../../../../src/p2p/SyncV2/verify')

const { initRoutes } = require('../../../../../src/p2p/SyncV2/routes')

describe('SyncV2', () => {
  const mockActiveNodes: P2P.SyncTypes.ActiveNode[] = [
    {
      id: 'node1',
      ip: '127.0.0.1',
      port: 9001,
      publicKey: 'key1',
    } as P2P.SyncTypes.ActiveNode,
  ]

  const mockShardus = {
    earlyConfigFetchAndPatch: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('init', () => {
    it('should initialize logger and routes', () => {
      SyncV2.init()

      expect(initLogger).toHaveBeenCalled()
      expect(initRoutes).toHaveBeenCalled()
    })
  })

  describe('syncV2', () => {
    const mockValidatorList = [{ nodeId: 'node1', publicKey: 'key1' }]
    const mockArchiverList = [{ publicKey: 'archiver1' }]
    const mockStandbyList = [{ nodeId: 'standby1' }]
    const mockTxList = [{ hash: 'txhash1', tx: {} }]
    const mockCycle = {
      counter: 1,
      nodeListHash: 'validatorHash',
      archiverListHash: 'archiverHash',
      standbyNodeListHash: 'standbyHash',
    }

    beforeEach(() => {
      robustQueryForValidatorListHash.mockReturnValue(
        okAsync({
          value: { nodeListHash: 'validatorHash' },
          winningNodes: mockActiveNodes,
        })
      )
      getValidatorListFromNode.mockReturnValue(okAsync(mockValidatorList))
      verifyValidatorList.mockReturnValue(okAsync(undefined))

      robustQueryForArchiverListHash.mockReturnValue(
        okAsync({
          value: { archiverListHash: 'archiverHash' },
          winningNodes: mockActiveNodes,
        })
      )
      getArchiverListFromNode.mockReturnValue(okAsync(mockArchiverList))
      verifyArchiverList.mockReturnValue(okAsync(undefined))

      robustQueryForStandbyNodeListHash.mockReturnValue(
        okAsync({
          value: { standbyNodeListHash: 'standbyHash' },
          winningNodes: mockActiveNodes,
        })
      )
      getStandbyNodeListFromNode.mockReturnValue(okAsync(mockStandbyList))

      robustQueryForTxListHash.mockReturnValue(
        okAsync({
          value: { txListHash: 'txHash' },
          winningNodes: mockActiveNodes,
        })
      )
      getTxListFromNode.mockReturnValue(okAsync(mockTxList))
      verifyTxList.mockReturnValue(okAsync(undefined))

      robustQueryForCycleRecordHash.mockReturnValue(
        okAsync({
          value: { currentCycleHash: 'cycleHash' },
          winningNodes: mockActiveNodes,
        })
      )
      getCycleDataFromNode.mockReturnValue(okAsync(mockCycle))
      verifyCycleRecord.mockReturnValue(okAsync(undefined))

      mockShardus.earlyConfigFetchAndPatch.mockImplementation(() => Promise.resolve())

      // Mock historical cycles query - return empty array for test
      robustQueryForRecentCycleMarkers.mockReturnValue(
        okAsync({
          value: {
            cycleMarkers: [],
            oldestCounter: 1,
          },
          winningNodes: mockActiveNodes,
        })
      )
      getCyclesBatchFromNode.mockReturnValue(okAsync([]))
    })

    it('should successfully sync all components', async () => {
      const result = await SyncV2.syncV2(mockActiveNodes, mockShardus as any)

      expect(result.isOk()).toBe(true)
      expect(robustQueryForValidatorListHash).toHaveBeenCalledWith(mockActiveNodes)
      expect(robustQueryForArchiverListHash).toHaveBeenCalledWith(mockActiveNodes)
      expect(robustQueryForStandbyNodeListHash).toHaveBeenCalledWith(mockActiveNodes)
      expect(robustQueryForTxListHash).toHaveBeenCalledWith(mockActiveNodes)
      expect(robustQueryForCycleRecordHash).toHaveBeenCalledWith(mockActiveNodes)
    })

    it('should return error when validator list hash mismatch', async () => {
      const mismatchedCycle = {
        ...mockCycle,
        nodeListHash: 'wrongHash',
      }
      getCycleDataFromNode.mockReturnValue(okAsync(mismatchedCycle))

      const result = await SyncV2.syncV2(mockActiveNodes, mockShardus as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('validator list hash from received cycle')
      }
    })

    it('should return error when archiver list hash mismatch', async () => {
      const mismatchedCycle = {
        ...mockCycle,
        archiverListHash: 'wrongHash',
      }
      getCycleDataFromNode.mockReturnValue(okAsync(mismatchedCycle))

      const result = await SyncV2.syncV2(mockActiveNodes, mockShardus as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('archiver list hash from received cycle')
      }
    })

    it('should return error when validator list query fails', async () => {
      robustQueryForValidatorListHash.mockReturnValue(errAsync(new Error('Query failed')))

      const result = await SyncV2.syncV2(mockActiveNodes, mockShardus as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toBe('Query failed')
      }
    })

    it('should return error when archiver list query fails', async () => {
      robustQueryForArchiverListHash.mockReturnValue(errAsync(new Error('Archiver query failed')))

      const result = await SyncV2.syncV2(mockActiveNodes, mockShardus as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toBe('Archiver query failed')
      }
    })

    it('should return error when standby list query fails', async () => {
      robustQueryForStandbyNodeListHash.mockReturnValue(errAsync(new Error('Standby query failed')))

      const result = await SyncV2.syncV2(mockActiveNodes, mockShardus as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toBe('Standby query failed')
      }
    })

    it('should return error when tx list query fails', async () => {
      robustQueryForTxListHash.mockReturnValue(errAsync(new Error('Tx list query failed')))

      const result = await SyncV2.syncV2(mockActiveNodes, mockShardus as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toBe('Tx list query failed')
      }
    })

    it('should return error when cycle record query fails', async () => {
      robustQueryForCycleRecordHash.mockReturnValue(errAsync(new Error('Cycle query failed')))

      const result = await SyncV2.syncV2(mockActiveNodes, mockShardus as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toBe('Cycle query failed')
      }
    })

    it('should return error when config fetch fails', async () => {
      mockShardus.earlyConfigFetchAndPatch.mockImplementation(() => Promise.reject(new Error('Config fetch failed')))

      const result = await SyncV2.syncV2(mockActiveNodes, mockShardus as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('Failed to fetch and patch config')
      }
    })

    it('should return error when validator list verification fails', async () => {
      verifyValidatorList.mockReturnValue(errAsync(new Error('Verification failed')))

      const result = await SyncV2.syncV2(mockActiveNodes, mockShardus as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toBe('Verification failed')
      }
    })

    it('should return error when archiver list verification fails', async () => {
      verifyArchiverList.mockReturnValue(errAsync(new Error('Archiver verification failed')))

      const result = await SyncV2.syncV2(mockActiveNodes, mockShardus as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toBe('Archiver verification failed')
      }
    })

    it('should return error when tx list verification fails', async () => {
      verifyTxList.mockReturnValue(errAsync(new Error('Tx verification failed')))

      const result = await SyncV2.syncV2(mockActiveNodes, mockShardus as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toBe('Tx verification failed')
      }
    })

    it('should return error when cycle record verification fails', async () => {
      verifyCycleRecord.mockReturnValue(errAsync(new Error('Cycle verification failed')))

      const result = await SyncV2.syncV2(mockActiveNodes, mockShardus as any)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toBe('Cycle verification failed')
      }
    })
  })
})
