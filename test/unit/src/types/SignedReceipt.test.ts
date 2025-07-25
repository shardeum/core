import { VectorBufferStream } from '../../../../src/utils/serialization/VectorBufferStream'
import {
  SignedReceiptSerializable,
  serializeSignedReceipt,
  deserializeSignedReceipt,
  cSignedReceiptVersion,
} from '../../../../src/types/SignedReceipt'
import { ProposalSerializable } from '../../../../src/types/Proposal'
import { SignSerializable } from '../../../../src/types/Sign'
import { TypeIdentifierEnum } from '../../../../src/types/enum/TypeIdentifierEnum'
import { initAjvSchemas } from '../../../../src/types/ajv/Helpers'

describe('SignedReceiptSerializable Serialization and Deserialization', () => {
  beforeAll(() => {
    initAjvSchemas()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  const mockProposal: ProposalSerializable = {
    applied: true,
    cant_preApply: false,
    accountIDs: ['account1', 'account2'],
    beforeStateHashes: ['hash1', 'hash2'],
    afterStateHashes: ['hash3', 'hash4'],
    appReceiptDataHash: 'receiptHash',
    txid: 'tx123',
    executionShardKey: 'shard1',
  }

  const mockSign: SignSerializable = {
    owner: 'owner123',
    sig: 'signature123',
  }

  const mockSignaturePack: SignSerializable[] = [
    { owner: 'owner1', sig: 'sig1' },
    { owner: 'owner2', sig: 'sig2' },
  ]

  describe('serializeSignedReceipt', () => {
    test('should serialize data correctly with root true and sign present', () => {
      const obj: SignedReceiptSerializable = {
        proposal: mockProposal,
        proposalHash: 'proposalHash123',
        voteOffsets: [1, 2, 3],
        signaturePack: mockSignaturePack,
        sign: mockSign,
      }
      const stream = new VectorBufferStream(0)
      serializeSignedReceipt(stream, obj, true)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })

    test('should serialize data correctly with root false', () => {
      const obj: SignedReceiptSerializable = {
        proposal: mockProposal,
        proposalHash: 'proposalHash123',
        voteOffsets: [1, 2, 3],
        signaturePack: mockSignaturePack,
        sign: mockSign,
      }
      const stream = new VectorBufferStream(0)
      serializeSignedReceipt(stream, obj, false)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })

    test('should serialize data correctly without sign', () => {
      const obj: SignedReceiptSerializable = {
        proposal: mockProposal,
        proposalHash: 'proposalHash123',
        voteOffsets: [1, 2, 3],
        signaturePack: mockSignaturePack,
      }
      const stream = new VectorBufferStream(0)
      serializeSignedReceipt(stream, obj, false)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })

    test('should handle empty arrays', () => {
      const obj: SignedReceiptSerializable = {
        proposal: mockProposal,
        proposalHash: 'proposalHash123',
        voteOffsets: [],
        signaturePack: [],
      }
      const stream = new VectorBufferStream(0)
      serializeSignedReceipt(stream, obj, false)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })

    test('should handle large arrays', () => {
      const largeVoteOffsets = Array.from({ length: 1000 }, (_, i) => i)
      const largeSignaturePack = Array.from({ length: 100 }, (_, i) => ({
        owner: `owner${i}`,
        sig: `sig${i}`,
      }))

      const obj: SignedReceiptSerializable = {
        proposal: mockProposal,
        proposalHash: 'proposalHash123',
        voteOffsets: largeVoteOffsets,
        signaturePack: largeSignaturePack,
      }
      const stream = new VectorBufferStream(0)
      serializeSignedReceipt(stream, obj, false)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })
  })

  describe('deserializeSignedReceipt', () => {
    test('should deserialize data correctly with sign present', () => {
      const obj: SignedReceiptSerializable = {
        proposal: mockProposal,
        proposalHash: 'proposalHash123',
        voteOffsets: [1, 2, 3],
        signaturePack: mockSignaturePack,
        sign: mockSign,
      }

      const stream = new VectorBufferStream(0)
      serializeSignedReceipt(stream, obj, false)
      stream.position = 0

      const deserializedObj = deserializeSignedReceipt(stream)
      expect(deserializedObj.proposal).toEqual(obj.proposal)
      expect(deserializedObj.proposalHash).toEqual(obj.proposalHash)
      expect(deserializedObj.voteOffsets).toEqual(obj.voteOffsets)
      expect(deserializedObj.signaturePack).toEqual(obj.signaturePack)
      expect(deserializedObj.sign).toEqual(obj.sign)
    })

    test('should deserialize data correctly without sign', () => {
      const obj: SignedReceiptSerializable = {
        proposal: mockProposal,
        proposalHash: 'proposalHash123',
        voteOffsets: [1, 2, 3],
        signaturePack: mockSignaturePack,
      }

      const stream = new VectorBufferStream(0)
      serializeSignedReceipt(stream, obj, false)
      stream.position = 0

      const deserializedObj = deserializeSignedReceipt(stream)
      expect(deserializedObj.proposal).toEqual(obj.proposal)
      expect(deserializedObj.proposalHash).toEqual(obj.proposalHash)
      expect(deserializedObj.voteOffsets).toEqual(obj.voteOffsets)
      expect(deserializedObj.signaturePack).toEqual(obj.signaturePack)
      expect(deserializedObj.sign).toBeUndefined()
    })

    test('should handle empty arrays', () => {
      const obj: SignedReceiptSerializable = {
        proposal: mockProposal,
        proposalHash: 'proposalHash123',
        voteOffsets: [],
        signaturePack: [],
      }

      const stream = new VectorBufferStream(0)
      serializeSignedReceipt(stream, obj, false)
      stream.position = 0

      const deserializedObj = deserializeSignedReceipt(stream)
      expect(deserializedObj.voteOffsets).toEqual([])
      expect(deserializedObj.signaturePack).toEqual([])
    })

    test('should throw version mismatch error', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cSignedReceiptVersion + 1)
      stream.position = 0

      expect(() => deserializeSignedReceipt(stream)).toThrow(
        `SignedReceiptDeserializer expected version ${cSignedReceiptVersion}, got ${cSignedReceiptVersion + 1}`
      )
    })

    test('should handle large arrays', () => {
      const largeVoteOffsets = Array.from({ length: 1000 }, (_, i) => i)
      const largeSignaturePack = Array.from({ length: 100 }, (_, i) => ({
        owner: `owner${i}`,
        sig: `sig${i}`,
      }))

      const obj: SignedReceiptSerializable = {
        proposal: mockProposal,
        proposalHash: 'proposalHash123',
        voteOffsets: largeVoteOffsets,
        signaturePack: largeSignaturePack,
      }

      const stream = new VectorBufferStream(0)
      serializeSignedReceipt(stream, obj, false)
      stream.position = 0

      const deserializedObj = deserializeSignedReceipt(stream)
      expect(deserializedObj.voteOffsets).toEqual(largeVoteOffsets)
      expect(deserializedObj.signaturePack).toEqual(largeSignaturePack)
    })
  })

  describe('Serialization and Deserialization Together', () => {
    test('should serialize and deserialize data correctly with sign', () => {
      const originalObj: SignedReceiptSerializable = {
        proposal: mockProposal,
        proposalHash: 'proposalHash123',
        voteOffsets: [1, 2, 3],
        signaturePack: mockSignaturePack,
        sign: mockSign,
      }

      const stream = new VectorBufferStream(0)
      serializeSignedReceipt(stream, originalObj, false)
      stream.position = 0

      const deserializedObj = deserializeSignedReceipt(stream)
      expect(deserializedObj).toEqual(originalObj)
    })

    test('should serialize and deserialize data correctly without sign', () => {
      const originalObj: SignedReceiptSerializable = {
        proposal: mockProposal,
        proposalHash: 'proposalHash123',
        voteOffsets: [1, 2, 3],
        signaturePack: mockSignaturePack,
      }

      const stream = new VectorBufferStream(0)
      serializeSignedReceipt(stream, originalObj, false)
      stream.position = 0

      const deserializedObj = deserializeSignedReceipt(stream)
      expect(deserializedObj).toEqual(originalObj)
    })

    test('should handle edge cases with empty data', () => {
      const originalObj: SignedReceiptSerializable = {
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
      }

      const stream = new VectorBufferStream(0)
      serializeSignedReceipt(stream, originalObj, false)
      stream.position = 0

      const deserializedObj = deserializeSignedReceipt(stream)
      expect(deserializedObj).toEqual(originalObj)
    })

    test('should serialize and deserialize with root flag', () => {
      const originalObj: SignedReceiptSerializable = {
        proposal: mockProposal,
        proposalHash: 'proposalHash123',
        voteOffsets: [1, 2, 3],
        signaturePack: mockSignaturePack,
        sign: mockSign,
      }

      const stream = new VectorBufferStream(0)
      serializeSignedReceipt(stream, originalObj, true)

      const expectedPosition = 2
      expect(stream.position).toBeGreaterThanOrEqual(expectedPosition)

      stream.position = 2
      const deserializedObj = deserializeSignedReceipt(stream)
      expect(deserializedObj).toEqual(originalObj)
    })
  })
})
