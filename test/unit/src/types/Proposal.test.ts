import { VectorBufferStream } from '../../../../src/utils/serialization/VectorBufferStream'
import {
  ProposalSerializable,
  serializeProposal,
  deserializeProposal,
  cProposalVersion,
} from '../../../../src/types/Proposal'
import { TypeIdentifierEnum } from '../../../../src/types/enum/TypeIdentifierEnum'
import { initAjvSchemas } from '../../../../src/types/ajv/Helpers'

describe('ProposalSerializable Serialization and Deserialization', () => {
  beforeAll(() => {
    initAjvSchemas()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  const mockProposal: ProposalSerializable = {
    applied: true,
    cant_preApply: false,
    accountIDs: ['account1', 'account2', 'account3'],
    beforeStateHashes: ['hash1', 'hash2', 'hash3'],
    afterStateHashes: ['hash4', 'hash5', 'hash6'],
    appReceiptDataHash: 'receiptHash123',
    txid: 'transaction123',
    executionShardKey: 'shard123',
  }

  describe('serializeProposal', () => {
    test('should serialize data correctly with root true', () => {
      const stream = new VectorBufferStream(0)
      serializeProposal(stream, mockProposal, true)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })

    test('should serialize data correctly with root false', () => {
      const stream = new VectorBufferStream(0)
      serializeProposal(stream, mockProposal, false)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })

    test('should handle empty arrays', () => {
      const obj: ProposalSerializable = {
        applied: false,
        cant_preApply: true,
        accountIDs: [],
        beforeStateHashes: [],
        afterStateHashes: [],
        appReceiptDataHash: '',
        txid: '',
        executionShardKey: '',
      }
      const stream = new VectorBufferStream(0)
      serializeProposal(stream, obj, false)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })

    test('should handle large arrays', () => {
      const largeAccountIDs = Array.from({ length: 1000 }, (_, i) => `account${i}`)
      const largeBeforeHashes = Array.from({ length: 500 }, (_, i) => `beforeHash${i}`)
      const largeAfterHashes = Array.from({ length: 500 }, (_, i) => `afterHash${i}`)

      const obj: ProposalSerializable = {
        applied: true,
        cant_preApply: false,
        accountIDs: largeAccountIDs,
        beforeStateHashes: largeBeforeHashes,
        afterStateHashes: largeAfterHashes,
        appReceiptDataHash: 'largeReceiptHash',
        txid: 'largeTxId',
        executionShardKey: 'largeShardKey',
      }
      const stream = new VectorBufferStream(0)
      serializeProposal(stream, obj, false)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })

    test('should handle boolean edge cases', () => {
      const obj1: ProposalSerializable = {
        applied: true,
        cant_preApply: true,
        accountIDs: ['test'],
        beforeStateHashes: ['test'],
        afterStateHashes: ['test'],
        appReceiptDataHash: 'test',
        txid: 'test',
        executionShardKey: 'test',
      }
      const stream1 = new VectorBufferStream(0)
      serializeProposal(stream1, obj1, false)

      const obj2: ProposalSerializable = {
        applied: false,
        cant_preApply: false,
        accountIDs: ['test'],
        beforeStateHashes: ['test'],
        afterStateHashes: ['test'],
        appReceiptDataHash: 'test',
        txid: 'test',
        executionShardKey: 'test',
      }
      const stream2 = new VectorBufferStream(0)
      serializeProposal(stream2, obj2, false)

      expect(stream1.getBuffer()).not.toEqual(stream2.getBuffer())
    })
  })

  describe('deserializeProposal', () => {
    test('should deserialize data correctly', () => {
      const stream = new VectorBufferStream(0)
      serializeProposal(stream, mockProposal, false)
      stream.position = 0

      const deserializedObj = deserializeProposal(stream)
      expect(deserializedObj).toEqual(mockProposal)
    })

    test('should handle empty arrays', () => {
      const obj: ProposalSerializable = {
        applied: false,
        cant_preApply: true,
        accountIDs: [],
        beforeStateHashes: [],
        afterStateHashes: [],
        appReceiptDataHash: '',
        txid: '',
        executionShardKey: '',
      }

      const stream = new VectorBufferStream(0)
      serializeProposal(stream, obj, false)
      stream.position = 0

      const deserializedObj = deserializeProposal(stream)
      expect(deserializedObj).toEqual(obj)
      expect(deserializedObj.accountIDs).toEqual([])
      expect(deserializedObj.beforeStateHashes).toEqual([])
      expect(deserializedObj.afterStateHashes).toEqual([])
    })

    test('should throw version mismatch error', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cProposalVersion + 1)
      stream.position = 0

      expect(() => deserializeProposal(stream)).toThrow(
        `ProposalDeserializer expected version ${cProposalVersion}, got ${cProposalVersion + 1}`
      )
    })

    test('should handle large arrays', () => {
      const largeAccountIDs = Array.from({ length: 1000 }, (_, i) => `account${i}`)
      const largeBeforeHashes = Array.from({ length: 500 }, (_, i) => `beforeHash${i}`)
      const largeAfterHashes = Array.from({ length: 500 }, (_, i) => `afterHash${i}`)

      const obj: ProposalSerializable = {
        applied: true,
        cant_preApply: false,
        accountIDs: largeAccountIDs,
        beforeStateHashes: largeBeforeHashes,
        afterStateHashes: largeAfterHashes,
        appReceiptDataHash: 'largeReceiptHash',
        txid: 'largeTxId',
        executionShardKey: 'largeShardKey',
      }

      const stream = new VectorBufferStream(0)
      serializeProposal(stream, obj, false)
      stream.position = 0

      const deserializedObj = deserializeProposal(stream)
      expect(deserializedObj).toEqual(obj)
      expect(deserializedObj.accountIDs).toEqual(largeAccountIDs)
      expect(deserializedObj.beforeStateHashes).toEqual(largeBeforeHashes)
      expect(deserializedObj.afterStateHashes).toEqual(largeAfterHashes)
    })

    test('should handle boolean values correctly', () => {
      const obj1: ProposalSerializable = {
        applied: true,
        cant_preApply: true,
        accountIDs: ['test'],
        beforeStateHashes: ['test'],
        afterStateHashes: ['test'],
        appReceiptDataHash: 'test',
        txid: 'test',
        executionShardKey: 'test',
      }

      const stream = new VectorBufferStream(0)
      serializeProposal(stream, obj1, false)
      stream.position = 0

      const deserializedObj = deserializeProposal(stream)
      expect(deserializedObj.applied).toBe(true)
      expect(deserializedObj.cant_preApply).toBe(true)

      const obj2: ProposalSerializable = {
        applied: false,
        cant_preApply: false,
        accountIDs: ['test'],
        beforeStateHashes: ['test'],
        afterStateHashes: ['test'],
        appReceiptDataHash: 'test',
        txid: 'test',
        executionShardKey: 'test',
      }

      const stream2 = new VectorBufferStream(0)
      serializeProposal(stream2, obj2, false)
      stream2.position = 0

      const deserializedObj2 = deserializeProposal(stream2)
      expect(deserializedObj2.applied).toBe(false)
      expect(deserializedObj2.cant_preApply).toBe(false)
    })
  })

  describe('Serialization and Deserialization Together', () => {
    test('should serialize and deserialize data correctly', () => {
      const stream = new VectorBufferStream(0)
      serializeProposal(stream, mockProposal, false)
      stream.position = 0

      const deserializedObj = deserializeProposal(stream)
      expect(deserializedObj).toEqual(mockProposal)
    })

    test('should handle edge cases with empty data', () => {
      const originalObj: ProposalSerializable = {
        applied: false,
        cant_preApply: false,
        accountIDs: [],
        beforeStateHashes: [],
        afterStateHashes: [],
        appReceiptDataHash: '',
        txid: '',
        executionShardKey: '',
      }

      const stream = new VectorBufferStream(0)
      serializeProposal(stream, originalObj, false)
      stream.position = 0

      const deserializedObj = deserializeProposal(stream)
      expect(deserializedObj).toEqual(originalObj)
    })

    test('should serialize and deserialize with root flag', () => {
      const stream = new VectorBufferStream(0)
      serializeProposal(stream, mockProposal, true)

      const expectedPosition = 2
      expect(stream.position).toBeGreaterThanOrEqual(expectedPosition)

      stream.position = 2
      const deserializedObj = deserializeProposal(stream)
      expect(deserializedObj).toEqual(mockProposal)
    })

    test('should handle mixed array lengths', () => {
      const originalObj: ProposalSerializable = {
        applied: true,
        cant_preApply: false,
        accountIDs: ['acc1', 'acc2'],
        beforeStateHashes: ['hash1'],
        afterStateHashes: ['hash1', 'hash2', 'hash3', 'hash4'],
        appReceiptDataHash: 'receiptHash',
        txid: 'txid',
        executionShardKey: 'shardKey',
      }

      const stream = new VectorBufferStream(0)
      serializeProposal(stream, originalObj, false)
      stream.position = 0

      const deserializedObj = deserializeProposal(stream)
      expect(deserializedObj).toEqual(originalObj)
      expect(deserializedObj.accountIDs.length).toBe(2)
      expect(deserializedObj.beforeStateHashes.length).toBe(1)
      expect(deserializedObj.afterStateHashes.length).toBe(4)
    })
  })
})
