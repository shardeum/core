import { VectorBufferStream } from '../../../../src/utils/serialization/VectorBufferStream'
import { SignSerializable } from '../../../../src/types/Sign'
import { TypeIdentifierEnum } from '../../../../src/types/enum/TypeIdentifierEnum'
import {
  AppliedVoteSerializable,
  serializeAppliedVote,
  deserializeAppliedVote,
} from '../../../../src/types/AppliedVote'

describe('AppliedVote', () => {
  let mockAppliedVote: AppliedVoteSerializable
  let mockSign: SignSerializable

  beforeEach(() => {
    mockSign = {
      owner: 'test-owner',
      sig: 'test-signature',
    }

    mockAppliedVote = {
      txid: 'test-transaction-id',
      transaction_result: true,
      account_id: ['account1', 'account2'],
      account_state_hash_after: ['hash_after_1', 'hash_after_2'],
      account_state_hash_before: ['hash_before_1', 'hash_before_2'],
      cant_apply: false,
      node_id: 'test-node-id',
      sign: mockSign,
      app_data_hash: 'test-app-data-hash',
    }
  })

  describe('serializeAppliedVote', () => {
    it('should serialize applied vote with all fields', () => {
      const stream = new VectorBufferStream(0)
      serializeAppliedVote(stream, mockAppliedVote)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })

    it('should serialize applied vote as root with type identifier', () => {
      const stream = new VectorBufferStream(0)
      serializeAppliedVote(stream, mockAppliedVote, true)

      stream.position = 0
      const typeId = stream.readUInt16()
      expect(typeId).toBe(TypeIdentifierEnum.cAppliedVote)
    })

    it('should serialize applied vote without optional sign', () => {
      const voteWithoutSign = { ...mockAppliedVote }
      delete voteWithoutSign.sign
      
      const stream = new VectorBufferStream(0)
      serializeAppliedVote(stream, voteWithoutSign)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })

    it('should serialize applied vote without optional app_data_hash', () => {
      const voteWithoutAppDataHash = { ...mockAppliedVote }
      delete voteWithoutAppDataHash.app_data_hash
      
      const stream = new VectorBufferStream(0)
      serializeAppliedVote(stream, voteWithoutAppDataHash)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })

    it('should serialize applied vote with empty arrays', () => {
      const voteWithEmptyArrays = {
        ...mockAppliedVote,
        account_id: [],
        account_state_hash_after: [],
        account_state_hash_before: [],
      }
      
      const stream = new VectorBufferStream(0)
      serializeAppliedVote(stream, voteWithEmptyArrays)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })

    it('should serialize transaction_result as false', () => {
      const voteWithFalseResult = { ...mockAppliedVote, transaction_result: false }
      
      const stream = new VectorBufferStream(0)
      serializeAppliedVote(stream, voteWithFalseResult)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })

    it('should serialize cant_apply as true', () => {
      const voteWithCantApply = { ...mockAppliedVote, cant_apply: true }
      
      const stream = new VectorBufferStream(0)
      serializeAppliedVote(stream, voteWithCantApply)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })
  })

  describe('deserializeAppliedVote', () => {
    it('should deserialize applied vote with all fields', () => {
      const stream = new VectorBufferStream(0)
      serializeAppliedVote(stream, mockAppliedVote)
      
      stream.position = 0
      const deserialized = deserializeAppliedVote(stream)

      expect(deserialized.txid).toBe(mockAppliedVote.txid)
      expect(deserialized.transaction_result).toBe(mockAppliedVote.transaction_result)
      expect(deserialized.account_id).toEqual(mockAppliedVote.account_id)
      expect(deserialized.account_state_hash_after).toEqual(mockAppliedVote.account_state_hash_after)
      expect(deserialized.account_state_hash_before).toEqual(mockAppliedVote.account_state_hash_before)
      expect(deserialized.cant_apply).toBe(mockAppliedVote.cant_apply)
      expect(deserialized.node_id).toBe(mockAppliedVote.node_id)
      expect(deserialized.sign).toEqual(mockAppliedVote.sign)
      expect(deserialized.app_data_hash).toBe(mockAppliedVote.app_data_hash)
    })

    it('should deserialize applied vote without optional sign', () => {
      const voteWithoutSign = { ...mockAppliedVote }
      delete voteWithoutSign.sign

      const stream = new VectorBufferStream(0)
      serializeAppliedVote(stream, voteWithoutSign)
      
      stream.position = 0
      const deserialized = deserializeAppliedVote(stream)

      expect(deserialized.sign).toBeUndefined()
      expect(deserialized.txid).toBe(voteWithoutSign.txid)
    })

    it('should deserialize applied vote without optional app_data_hash', () => {
      const voteWithoutAppDataHash = { ...mockAppliedVote }
      delete voteWithoutAppDataHash.app_data_hash

      const stream = new VectorBufferStream(0)
      serializeAppliedVote(stream, voteWithoutAppDataHash)
      
      stream.position = 0
      const deserialized = deserializeAppliedVote(stream)

      expect(deserialized.app_data_hash).toBeUndefined()
      expect(deserialized.txid).toBe(voteWithoutAppDataHash.txid)
    })

    it('should deserialize applied vote with empty arrays', () => {
      const voteWithEmptyArrays = {
        ...mockAppliedVote,
        account_id: [],
        account_state_hash_after: [],
        account_state_hash_before: [],
      }

      const stream = new VectorBufferStream(0)
      serializeAppliedVote(stream, voteWithEmptyArrays)
      
      stream.position = 0
      const deserialized = deserializeAppliedVote(stream)

      expect(deserialized.account_id).toEqual([])
      expect(deserialized.account_state_hash_after).toEqual([])
      expect(deserialized.account_state_hash_before).toEqual([])
    })

    it('should throw error for unsupported version', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(99) // Invalid version
      stream.writeString('test-txid')
      stream.writeUInt8(1)
      stream.writeUInt16(0) // Empty arrays
      stream.writeUInt16(0)
      stream.writeUInt16(0)
      stream.writeUInt8(0)
      stream.writeString('test-node-id')
      stream.writeUInt8(0) // No sign
      stream.writeUInt8(0) // No app_data_hash
      
      stream.position = 0
      expect(() => deserializeAppliedVote(stream)).toThrow('AppliedVote version mismatch')
    })

    it('should deserialize transaction_result as false', () => {
      const voteWithFalseResult = { ...mockAppliedVote, transaction_result: false }

      const stream = new VectorBufferStream(0)
      serializeAppliedVote(stream, voteWithFalseResult)
      
      stream.position = 0
      const deserialized = deserializeAppliedVote(stream)

      expect(deserialized.transaction_result).toBe(false)
    })

    it('should deserialize cant_apply as true', () => {
      const voteWithCantApply = { ...mockAppliedVote, cant_apply: true }

      const stream = new VectorBufferStream(0)
      serializeAppliedVote(stream, voteWithCantApply)
      
      stream.position = 0
      const deserialized = deserializeAppliedVote(stream)

      expect(deserialized.cant_apply).toBe(true)
    })
  })

  describe('serialize/deserialize round trip', () => {
    it('should maintain data integrity through serialize/deserialize cycle', () => {
      const stream = new VectorBufferStream(0)
      serializeAppliedVote(stream, mockAppliedVote)
      
      stream.position = 0
      const deserialized = deserializeAppliedVote(stream)

      expect(deserialized).toEqual(mockAppliedVote)
    })

    it('should handle minimal applied vote data', () => {
      const minimalVote: AppliedVoteSerializable = {
        txid: 'minimal-tx',
        transaction_result: false,
        account_id: [],
        account_state_hash_after: [],
        account_state_hash_before: [],
        cant_apply: true,
        node_id: 'minimal-node',
      }

      const stream = new VectorBufferStream(0)
      serializeAppliedVote(stream, minimalVote)
      
      stream.position = 0
      const deserialized = deserializeAppliedVote(stream)

      expect(deserialized).toEqual(minimalVote)
    })
  })
})