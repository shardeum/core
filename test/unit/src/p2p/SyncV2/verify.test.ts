import { verifyValidatorList, verifyArchiverList, verifyCycleRecord, verifyTxList } from '../../../../../src/p2p/SyncV2/verify'
import { P2P, hexstring } from '@shardeum-foundation/lib-types'
import { crypto } from '../../../../../src/p2p/Context'
import { makeCycleMarker } from '../../../../../src/p2p/CycleCreator'
import { Utils } from '@shardeum-foundation/lib-types'
import { logFlags } from '../../../../../src/logger'

jest.mock('../../../../../src/p2p/Context', () => ({
  crypto: {
    hash: jest.fn(),
  },
}))

jest.mock('../../../../../src/p2p/CycleCreator', () => ({
  makeCycleMarker: jest.fn(),
}))

jest.mock('../../../../../src/p2p/SyncV2/queries', () => ({
  p2pLogger: {
    info: jest.fn(),
  },
}))

jest.mock('../../../../../src/logger', () => ({
  logFlags: {
    p2pSyncDebug: false,
  },
}))

const mockCrypto = crypto as jest.Mocked<typeof crypto>
const mockMakeCycleMarker = makeCycleMarker as jest.MockedFunction<typeof makeCycleMarker>

describe('SyncV2 verify', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    console.log = jest.fn()
  })

  describe('verifyValidatorList', () => {
    const mockValidatorList: P2P.NodeListTypes.Node[] = [
      {
        id: 'node1',
        publicKey: 'pubkey1',
        ip: '127.0.0.1',
        port: 9001,
        counterRefreshed: 1,
        activeTimestamp: Date.now(),
        status: 'active',
      } as unknown as P2P.NodeListTypes.Node,
      {
        id: 'node2',
        publicKey: 'pubkey2',
        ip: '127.0.0.2',
        port: 9002,
        counterRefreshed: 2,
        activeTimestamp: Date.now(),
        status: 'active',
      } as unknown as P2P.NodeListTypes.Node,
    ]

    test('should return ok(true) when hash matches', () => {
      const expectedHash = 'abcd1234'
      mockCrypto.hash.mockReturnValue(expectedHash)

      const result = verifyValidatorList(mockValidatorList, expectedHash)

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap()).toBe(true)
      expect(mockCrypto.hash).toHaveBeenCalledWith(mockValidatorList)
    })

    test('should return error when hash does not match', () => {
      const expectedHash = 'abcd1234'
      const actualHash = 'different_hash'
      mockCrypto.hash.mockReturnValue(actualHash)

      const result = verifyValidatorList(mockValidatorList, expectedHash)

      expect(result.isErr()).toBe(true)
      const error = result._unsafeUnwrapErr()
      expect(error.message).toBe('hash mismatch for validator list: expected abcd1234, got different_hash')
    })

    test('should handle empty validator list', () => {
      const expectedHash = 'empty_hash'
      mockCrypto.hash.mockReturnValue(expectedHash)

      const result = verifyValidatorList([], expectedHash)

      expect(result.isOk()).toBe(true)
      expect(mockCrypto.hash).toHaveBeenCalledWith([])
    })

    test('should log debug information when flag is enabled', () => {
      ;(logFlags as any).p2pSyncDebug = true
      const expectedHash = 'debug_hash'
      mockCrypto.hash.mockReturnValue(expectedHash)

      verifyValidatorList(mockValidatorList, expectedHash)

      expect(console.log).toHaveBeenCalledWith('hashing validator list:', Utils.safeStringify(mockValidatorList))
      expect(console.log).toHaveBeenCalledWith('got debug_hash')

      ;(logFlags as any).p2pSyncDebug = false
    })
  })

  describe('verifyArchiverList', () => {
    const mockArchiverList: P2P.ArchiversTypes.JoinedArchiver[] = [
      {
        ip: '127.0.0.1',
        port: 4000,
        publicKey: 'archiver_pubkey1',
        curvePk: 'curve_pk1',
        nodeId: 'archiver1',
        cycleJoined: 1,
        activeTimestamp: Date.now(),
      } as P2P.ArchiversTypes.JoinedArchiver,
    ]

    test('should return ok(true) when hash matches', () => {
      const expectedHash = 'archiver_hash'
      mockCrypto.hash.mockReturnValue(expectedHash)

      const result = verifyArchiverList(mockArchiverList, expectedHash)

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap()).toBe(true)
      expect(mockCrypto.hash).toHaveBeenCalledWith(mockArchiverList)
    })

    test('should return error when hash does not match', () => {
      const expectedHash = 'archiver_hash'
      const actualHash = 'wrong_archiver_hash'
      mockCrypto.hash.mockReturnValue(actualHash)

      const result = verifyArchiverList(mockArchiverList, expectedHash)

      expect(result.isErr()).toBe(true)
      const error = result._unsafeUnwrapErr()
      expect(error.message).toBe('hash mismatch for archiver list: expected archiver_hash, got wrong_archiver_hash')
    })

    test('should handle empty archiver list', () => {
      const expectedHash = 'empty_archiver_hash'
      mockCrypto.hash.mockReturnValue(expectedHash)

      const result = verifyArchiverList([], expectedHash)

      expect(result.isOk()).toBe(true)
      expect(mockCrypto.hash).toHaveBeenCalledWith([])
    })
  })

  describe('verifyCycleRecord', () => {
    const mockCycleRecord: P2P.CycleCreatorTypes.CycleRecord = {
      networkId: 'test_network',
      counter: 1,
      previous: 'prev_hash',
      start: 1000,
      duration: 30,
      networkConfigHash: 'config_hash',
      mode: 'processing',
      safetyMode: false,
      safetyNum: 0,
      networkStateHash: 'state_hash',
    } as P2P.CycleCreatorTypes.CycleRecord

    test('should return ok(true) when cycle marker matches', () => {
      const expectedHash = 'cycle_marker_hash'
      mockMakeCycleMarker.mockReturnValue(expectedHash)

      const result = verifyCycleRecord(mockCycleRecord, expectedHash)

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap()).toBe(true)
      expect(mockMakeCycleMarker).toHaveBeenCalledWith(mockCycleRecord)
    })

    test('should return error when cycle marker does not match', () => {
      const expectedHash = 'cycle_marker_hash'
      const actualHash = 'wrong_cycle_marker'
      mockMakeCycleMarker.mockReturnValue(actualHash)

      const result = verifyCycleRecord(mockCycleRecord, expectedHash)

      expect(result.isErr()).toBe(true)
      const error = result._unsafeUnwrapErr()
      expect(error.message).toBe('hash mismatch for cycle: expected cycle_marker_hash, got wrong_cycle_marker')
    })

    test('should handle different cycle record properties', () => {
      const differentCycleRecord = {
        ...mockCycleRecord,
        counter: 5,
        mode: 'safety' as const,
      }
      const expectedHash = 'different_cycle_hash'
      mockMakeCycleMarker.mockReturnValue(expectedHash)

      const result = verifyCycleRecord(differentCycleRecord, expectedHash)

      expect(result.isOk()).toBe(true)
      expect(mockMakeCycleMarker).toHaveBeenCalledWith(differentCycleRecord)
    })
  })

  describe('verifyTxList', () => {
    const mockTxList: { hash: string; tx: P2P.ServiceQueueTypes.AddNetworkTx }[] = [
      {
        hash: 'tx_hash_1',
        tx: {
          type: 'add_network_tx',
          nodeId: 'node1',
          timestamp: Date.now(),
        } as unknown as P2P.ServiceQueueTypes.AddNetworkTx,
      },
      {
        hash: 'tx_hash_2',
        tx: {
          type: 'add_network_tx',
          nodeId: 'node2',
          timestamp: Date.now(),
        } as unknown as P2P.ServiceQueueTypes.AddNetworkTx,
      },
    ]

    test('should return ok(true) when tx list hash matches', () => {
      const expectedHash = 'txlist_hash'
      mockCrypto.hash.mockReturnValue(expectedHash)

      const result = verifyTxList(mockTxList, expectedHash)

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap()).toBe(true)
      expect(mockCrypto.hash).toHaveBeenCalledWith(mockTxList)
    })

    test('should return error when tx list hash does not match', () => {
      const expectedHash = 'txlist_hash'
      const actualHash = 'wrong_txlist_hash'
      mockCrypto.hash.mockReturnValue(actualHash)

      const result = verifyTxList(mockTxList, expectedHash)

      expect(result.isErr()).toBe(true)
      const error = result._unsafeUnwrapErr()
      expect(error.message).toBe('hash mismatch for txList: expected txlist_hash, got wrong_txlist_hash')
    })

    test('should handle empty tx list', () => {
      const expectedHash = 'empty_txlist_hash'
      mockCrypto.hash.mockReturnValue(expectedHash)

      const result = verifyTxList([], expectedHash)

      expect(result.isOk()).toBe(true)
      expect(mockCrypto.hash).toHaveBeenCalledWith([])
    })

    test('should handle single transaction in list', () => {
      const singleTxList = [mockTxList[0]]
      const expectedHash = 'single_tx_hash'
      mockCrypto.hash.mockReturnValue(expectedHash)

      const result = verifyTxList(singleTxList, expectedHash)

      expect(result.isOk()).toBe(true)
      expect(mockCrypto.hash).toHaveBeenCalledWith(singleTxList)
    })
  })

  describe('edge cases and error handling', () => {
    test('should handle null values gracefully', () => {
      const expectedHash = 'null_hash'
      mockCrypto.hash.mockReturnValue(expectedHash)

      const result = verifyValidatorList(null as any, expectedHash)

      expect(result.isOk()).toBe(true)
      expect(mockCrypto.hash).toHaveBeenCalledWith(null)
    })

    test('should handle undefined values gracefully', () => {
      const expectedHash = 'undefined_hash'
      mockCrypto.hash.mockReturnValue(expectedHash)

      const result = verifyArchiverList(undefined as any, expectedHash)

      expect(result.isOk()).toBe(true)
      expect(mockCrypto.hash).toHaveBeenCalledWith(undefined)
    })

    test('should handle empty string as expected hash', () => {
      const expectedHash = ''
      mockCrypto.hash.mockReturnValue(expectedHash)

      const result = verifyValidatorList([], expectedHash)

      expect(result.isOk()).toBe(true)
    })

    test('should handle very long hash strings', () => {
      const longHash = 'a'.repeat(1000)
      mockCrypto.hash.mockReturnValue(longHash)

      const result = verifyArchiverList([], longHash)

      expect(result.isOk()).toBe(true)
    })

    test('should handle special characters in hash', () => {
      const specialHash = '!@#$%^&*()_+-=[]{}|;:,.<>?'
      mockCrypto.hash.mockReturnValue(specialHash)

      const result = verifyTxList([], specialHash)

      expect(result.isOk()).toBe(true)
    })
  })
})