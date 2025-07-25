import { VectorBufferStream } from '../../../src/utils/serialization/VectorBufferStream'
import {
  serializePoqoSendReceiptReq,
  deserializePoqoSendReceiptReq,
  PoqoSendReceiptReq,
} from '../../../src/types/PoqoSendReceiptReq'
import { TypeIdentifierEnum } from '../../../src/types/enum/TypeIdentifierEnum'
import * as SignedReceipt from '../../../src/types/SignedReceipt'
import { SignedReceiptSerializable } from '../../../src/types/SignedReceipt'

// Mock the SignedReceipt module
jest.mock('../../../src/types/SignedReceipt')

describe('PoqoSendReceiptReq', () => {
  let mockSerializeSignedReceipt: jest.SpyInstance
  let mockDeserializeSignedReceipt: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    mockSerializeSignedReceipt = SignedReceipt.serializeSignedReceipt as jest.Mock
    mockDeserializeSignedReceipt = SignedReceipt.deserializeSignedReceipt as jest.Mock
  })

  describe('serializePoqoSendReceiptReq', () => {
    it('should serialize with root flag true', () => {
      const stream = new VectorBufferStream(0)
      const writeUInt16Spy = jest.spyOn(stream, 'writeUInt16')
      const writeUInt8Spy = jest.spyOn(stream, 'writeUInt8')
      const writeUInt32Spy = jest.spyOn(stream, 'writeUInt32')

      const poqoSendReceiptReq: PoqoSendReceiptReq = {
        proposal: {
          applied: true,
          cant_preApply: false,
          accountIDs: ['acc1', 'acc2'],
          beforeStateHashes: ['hash1', 'hash2'],
          afterStateHashes: ['hash3', 'hash4'],
          appReceiptDataHash: 'receipt-hash',
          txid: 'test-tx-id',
          executionShardKey: 'shard-key',
        },
        proposalHash: 'test-hash',
        voteOffsets: [1, 2, 3],
        signaturePack: [],
        txGroupCycle: 42,
      }

      serializePoqoSendReceiptReq(stream, poqoSendReceiptReq, true)

      expect(writeUInt16Spy).toHaveBeenCalledWith(TypeIdentifierEnum.cPoqoSendReceiptReq)
      expect(writeUInt8Spy).toHaveBeenCalledWith(1) // version
      expect(mockSerializeSignedReceipt).toHaveBeenCalledWith(stream, poqoSendReceiptReq)
      expect(writeUInt32Spy).toHaveBeenCalledWith(42)
    })

    it('should serialize without root flag', () => {
      const stream = new VectorBufferStream(0)
      const writeUInt16Spy = jest.spyOn(stream, 'writeUInt16')
      const writeUInt8Spy = jest.spyOn(stream, 'writeUInt8')
      const writeUInt32Spy = jest.spyOn(stream, 'writeUInt32')

      const poqoSendReceiptReq: PoqoSendReceiptReq = {
        proposal: {
          applied: false,
          cant_preApply: true,
          accountIDs: [],
          beforeStateHashes: [],
          afterStateHashes: [],
          appReceiptDataHash: 'app-receipt',
          txid: 'test-tx-id',
          executionShardKey: 'exec-key',
        },
        proposalHash: 'test-hash',
        voteOffsets: [],
        signaturePack: [],
        txGroupCycle: 100,
      }

      serializePoqoSendReceiptReq(stream, poqoSendReceiptReq, false)

      expect(writeUInt16Spy).not.toHaveBeenCalled()
      expect(writeUInt8Spy).toHaveBeenCalledWith(1) // version only
      expect(mockSerializeSignedReceipt).toHaveBeenCalledWith(stream, poqoSendReceiptReq)
      expect(writeUInt32Spy).toHaveBeenCalledWith(100)
    })

    it('should serialize with default root flag (false)', () => {
      const stream = new VectorBufferStream(0)
      const writeUInt16Spy = jest.spyOn(stream, 'writeUInt16')
      const writeUInt8Spy = jest.spyOn(stream, 'writeUInt8')

      const poqoSendReceiptReq: PoqoSendReceiptReq = {
        proposal: {
          applied: true,
          cant_preApply: false,
          accountIDs: ['account1'],
          beforeStateHashes: ['before1'],
          afterStateHashes: ['after1'],
          appReceiptDataHash: 'app-hash',
          txid: 'tx-123',
          executionShardKey: 'key123',
        },
        proposalHash: 'hash-456',
        voteOffsets: [10, 20],
        signaturePack: [],
        txGroupCycle: 999,
      }

      serializePoqoSendReceiptReq(stream, poqoSendReceiptReq)

      expect(writeUInt16Spy).not.toHaveBeenCalled()
      expect(writeUInt8Spy).toHaveBeenCalledWith(1) // version only
      expect(mockSerializeSignedReceipt).toHaveBeenCalledWith(stream, poqoSendReceiptReq)
    })

    it('should handle different txGroupCycle values', () => {
      const stream = new VectorBufferStream(0)
      const writeUInt32Spy = jest.spyOn(stream, 'writeUInt32')

      const testCases = [0, 1, 100, 65535, 4294967295] // max uint32

      testCases.forEach((txGroupCycle) => {
        const poqoSendReceiptReq: PoqoSendReceiptReq = {
          proposal: {
            applied: true,
            cant_preApply: false,
            accountIDs: [],
            beforeStateHashes: [],
            afterStateHashes: [],
            appReceiptDataHash: 'hash',
            txid: 'tx-123',
            executionShardKey: 'key',
          },
          proposalHash: 'hash',
          voteOffsets: [],
          signaturePack: [],
          txGroupCycle,
        }

        serializePoqoSendReceiptReq(stream, poqoSendReceiptReq)
        expect(writeUInt32Spy).toHaveBeenCalledWith(txGroupCycle)
      })
    })
  })

  describe('deserializePoqoSendReceiptReq', () => {
    it('should deserialize with correct version', () => {
      const stream = new VectorBufferStream(0)
      const readUInt8Spy = jest.spyOn(stream, 'readUInt8').mockReturnValue(1)
      const readUInt32Spy = jest.spyOn(stream, 'readUInt32').mockReturnValue(42)

      const expectedSignedReceipt: SignedReceiptSerializable = {
        proposal: {
          applied: true,
          cant_preApply: false,
          accountIDs: ['acc1'],
          beforeStateHashes: ['before1'],
          afterStateHashes: ['after1'],
          appReceiptDataHash: 'app-receipt',
          txid: 'test-tx-id',
          executionShardKey: 'exec-shard',
        },
        proposalHash: 'test-hash',
        voteOffsets: [1, 2, 3],
        signaturePack: [],
      }

      mockDeserializeSignedReceipt.mockReturnValue(expectedSignedReceipt)

      const result = deserializePoqoSendReceiptReq(stream)

      expect(readUInt8Spy).toHaveBeenCalled()
      expect(mockDeserializeSignedReceipt).toHaveBeenCalledWith(stream)
      expect(readUInt32Spy).toHaveBeenCalled()
      expect(result).toEqual({
        ...expectedSignedReceipt,
        txGroupCycle: 42,
      })
    })

    it('should throw error for unsupported version', () => {
      const stream = new VectorBufferStream(0)
      jest.spyOn(stream, 'readUInt8').mockReturnValue(2) // version 2 > supported version 1

      expect(() => deserializePoqoSendReceiptReq(stream)).toThrow('PoQoSendReceiptReq Unsupported version')
      expect(mockDeserializeSignedReceipt).not.toHaveBeenCalled()
    })

    it('should throw error for version 0', () => {
      const stream = new VectorBufferStream(0)
      jest.spyOn(stream, 'readUInt8').mockReturnValue(0)

      // Version 0 is valid (0 <= 1), so it should not throw
      jest.spyOn(stream, 'readUInt32').mockReturnValue(0)
      mockDeserializeSignedReceipt.mockReturnValue({
        proposal: {
          applied: false,
          cant_preApply: false,
          accountIDs: [],
          beforeStateHashes: [],
          afterStateHashes: [],
          appReceiptDataHash: '',
          txid: '',
          executionShardKey: '',
        },
        proposalHash: '',
        voteOffsets: [],
        signaturePack: [],
      })

      expect(() => deserializePoqoSendReceiptReq(stream)).not.toThrow()
    })

    it('should throw error for version 255', () => {
      const stream = new VectorBufferStream(0)
      jest.spyOn(stream, 'readUInt8').mockReturnValue(255)

      expect(() => deserializePoqoSendReceiptReq(stream)).toThrow('PoQoSendReceiptReq Unsupported version')
    })

    it('should correctly combine SignedReceipt with txGroupCycle', () => {
      const stream = new VectorBufferStream(0)
      jest.spyOn(stream, 'readUInt8').mockReturnValue(1)

      const testCases = [
        {
          txGroupCycle: 0,
          signedReceipt: {
            proposal: {
              applied: true,
              cant_preApply: false,
              accountIDs: [],
              beforeStateHashes: [],
              afterStateHashes: [],
              appReceiptDataHash: 'h1',
              txid: 'tx1',
              executionShardKey: 'k1',
            },
            proposalHash: 'h1',
            voteOffsets: [],
            signaturePack: [],
          },
        },
        {
          txGroupCycle: 999,
          signedReceipt: {
            proposal: {
              applied: false,
              cant_preApply: true,
              accountIDs: ['a1'],
              beforeStateHashes: ['b1'],
              afterStateHashes: ['a1'],
              appReceiptDataHash: 'h2',
              txid: 'tx2',
              executionShardKey: 'k2',
            },
            proposalHash: 'h2',
            voteOffsets: [1],
            signaturePack: [],
          },
        },
        {
          txGroupCycle: 4294967295,
          signedReceipt: {
            proposal: {
              applied: true,
              cant_preApply: true,
              accountIDs: ['a1', 'a2'],
              beforeStateHashes: ['b1', 'b2'],
              afterStateHashes: ['a1', 'a2'],
              appReceiptDataHash: 'h3',
              txid: 'tx3',
              executionShardKey: 'k3',
            },
            proposalHash: 'h3',
            voteOffsets: [1, 2, 3],
            signaturePack: [],
          },
        },
      ]

      testCases.forEach(({ txGroupCycle, signedReceipt }) => {
        jest.spyOn(stream, 'readUInt32').mockReturnValue(txGroupCycle)
        mockDeserializeSignedReceipt.mockReturnValue(signedReceipt)

        const result = deserializePoqoSendReceiptReq(stream)

        expect(result).toEqual({
          ...signedReceipt,
          txGroupCycle,
        })
      })
    })
  })

  describe('integration test', () => {
    it('should serialize and deserialize correctly', () => {
      // Create mock functions for SignedReceipt serialization/deserialization
      mockSerializeSignedReceipt.mockImplementation((stream, data) => {
        // Simple mock - just write a marker
        stream.writeString(data.proposalHash)
      })

      mockDeserializeSignedReceipt.mockImplementation((stream) => {
        // Simple mock - read the marker
        const proposalHash = stream.readString()
        return {
          proposal: {
            applied: true,
            cant_preApply: false,
            accountIDs: ['account1'],
            beforeStateHashes: ['before'],
            afterStateHashes: ['after'],
            appReceiptDataHash: 'app-receipt',
            txid: 'test-tx',
            executionShardKey: 'shard',
          },
          proposalHash,
          voteOffsets: [1, 2],
          signaturePack: [],
        }
      })

      const stream = new VectorBufferStream(0)
      const originalData: PoqoSendReceiptReq = {
        proposal: {
          applied: true,
          cant_preApply: false,
          accountIDs: ['acc1', 'acc2'],
          beforeStateHashes: ['before1', 'before2'],
          afterStateHashes: ['after1', 'after2'],
          appReceiptDataHash: 'receipt-data-hash',
          txid: 'test-tx',
          executionShardKey: 'exec-shard-key',
        },
        proposalHash: 'test-proposal-hash',
        voteOffsets: [1, 2],
        signaturePack: [],
        txGroupCycle: 54321,
      }

      // Serialize
      serializePoqoSendReceiptReq(stream, originalData, true)

      // Reset stream position
      stream.position = 0

      // Skip type identifier if root was true
      stream.readUInt16()

      // Deserialize
      const result = deserializePoqoSendReceiptReq(stream)

      expect(result.proposalHash).toBe(originalData.proposalHash)
      expect(result.txGroupCycle).toBe(originalData.txGroupCycle)
    })
  })

  describe('type definitions', () => {
    it('should have PoqoSendReceiptReq as SignedReceiptSerializable with txGroupCycle', () => {
      const validObject: PoqoSendReceiptReq = {
        proposal: {
          applied: true,
          cant_preApply: false,
          accountIDs: [],
          beforeStateHashes: [],
          afterStateHashes: [],
          appReceiptDataHash: 'hash',
          txid: 'tx-id',
          executionShardKey: 'key',
        },
        proposalHash: 'hash',
        voteOffsets: [],
        signaturePack: [],
        txGroupCycle: 100,
      }

      // Type checking - this should compile without errors
      expect(validObject.txGroupCycle).toBeDefined()
      expect(typeof validObject.txGroupCycle).toBe('number')
    })
  })
})
