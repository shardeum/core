import { 
  serializeGetAppliedVoteResp, 
  deserializeGetAppliedVoteResp, 
  GetAppliedVoteResp 
} from '../../../src/types/GetAppliedVoteResp'
import { VectorBufferStream } from '../../../src/utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from '../../../src/types/enum/TypeIdentifierEnum'
import * as AppliedVote from '../../../src/types/AppliedVote'
import * as ajvHelpers from '../../../src/types/ajv/Helpers'
import { AJVSchemaEnum } from '../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../src/types/AppliedVote')
jest.mock('../../../src/types/ajv/Helpers')

describe('GetAppliedVoteResp', () => {
  let mockStream: VectorBufferStream
  const mockSerializeAppliedVote = AppliedVote.serializeAppliedVote as jest.MockedFunction<typeof AppliedVote.serializeAppliedVote>
  const mockDeserializeAppliedVote = AppliedVote.deserializeAppliedVote as jest.MockedFunction<typeof AppliedVote.deserializeAppliedVote>
  const mockVerifyPayload = ajvHelpers.verifyPayload as jest.MockedFunction<typeof ajvHelpers.verifyPayload>

  beforeEach(() => {
    jest.clearAllMocks()
    mockStream = {
      writeUInt16: jest.fn(),
      writeUInt8: jest.fn(),
      writeString: jest.fn(),
      readUInt8: jest.fn(),
      readString: jest.fn()
    } as unknown as VectorBufferStream
  })

  describe('serializeGetAppliedVoteResp', () => {
    const mockData: GetAppliedVoteResp = {
      txId: 'tx123',
      appliedVote: {
        txid: 'tx123',
        transaction_result: true,
        account_id: ['acc1', 'acc2'],
        account_state_hash_after: ['hash1', 'hash2'],
        account_state_hash_before: ['hash3', 'hash4'],
        cant_apply: false,
        node_id: 'node1'
      },
      appliedVoteHash: 'vote_hash_123'
    }

    it('should serialize without root flag', () => {
      serializeGetAppliedVoteResp(mockStream, mockData, false)

      expect(mockStream.writeUInt16).not.toHaveBeenCalled()
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(1) // version
      expect(mockStream.writeString).toHaveBeenCalledWith('tx123')
      expect(mockSerializeAppliedVote).toHaveBeenCalledWith(mockStream, mockData.appliedVote)
      expect(mockStream.writeString).toHaveBeenCalledWith('vote_hash_123')
    })

    it('should serialize with root flag', () => {
      serializeGetAppliedVoteResp(mockStream, mockData, true)

      expect(mockStream.writeUInt16).toHaveBeenCalledWith(TypeIdentifierEnum.cGetAppliedVoteResp)
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(1) // version
      expect(mockStream.writeString).toHaveBeenCalledWith('tx123')
      expect(mockSerializeAppliedVote).toHaveBeenCalledWith(mockStream, mockData.appliedVote)
      expect(mockStream.writeString).toHaveBeenCalledWith('vote_hash_123')
    })

    it('should serialize fields in correct order', () => {
      serializeGetAppliedVoteResp(mockStream, mockData)

      const writeStringCalls = (mockStream.writeString as jest.Mock).mock.calls
      expect(writeStringCalls[0][0]).toBe('tx123') // txId first
      expect(writeStringCalls[1][0]).toBe('vote_hash_123') // appliedVoteHash last
      
      // Applied vote serialization should happen between the two string writes
      const serializeOrder = mockSerializeAppliedVote.mock.invocationCallOrder[0]
      const lastWriteOrder = (mockStream.writeString as jest.Mock).mock.invocationCallOrder[1]
      expect(serializeOrder).toBeLessThan(lastWriteOrder)
    })

    it('should handle empty strings', () => {
      const dataWithEmptyStrings: GetAppliedVoteResp = {
        txId: '',
        appliedVote: mockData.appliedVote,
        appliedVoteHash: ''
      }

      serializeGetAppliedVoteResp(mockStream, dataWithEmptyStrings)

      expect(mockStream.writeString).toHaveBeenCalledWith('')
      expect(mockStream.writeString).toHaveBeenCalledWith('')
    })

    it('should pass appliedVote to serializer', () => {
      serializeGetAppliedVoteResp(mockStream, mockData)

      expect(mockSerializeAppliedVote).toHaveBeenCalledTimes(1)
      expect(mockSerializeAppliedVote).toHaveBeenCalledWith(mockStream, mockData.appliedVote)
    })
  })

  describe('deserializeGetAppliedVoteResp', () => {
    const mockAppliedVote: AppliedVote.AppliedVoteSerializable = {
      txid: 'tx123',
      transaction_result: true,
      account_id: ['acc1'],
      account_state_hash_after: ['hash1'],
      account_state_hash_before: ['hash2'],
      cant_apply: false,
      node_id: 'node1'
    }

    beforeEach(() => {
      mockVerifyPayload.mockReturnValue([])
      mockDeserializeAppliedVote.mockReturnValue(mockAppliedVote)
    })

    it('should deserialize valid data correctly', () => {
      (mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(1);
      (mockStream.readString as jest.Mock)
        .mockReturnValueOnce('tx123')
        .mockReturnValueOnce('vote_hash_123')

      const result = deserializeGetAppliedVoteResp(mockStream)

      expect(result).toEqual({
        txId: 'tx123',
        appliedVote: mockAppliedVote,
        appliedVoteHash: 'vote_hash_123'
      })
      expect(mockDeserializeAppliedVote).toHaveBeenCalledWith(mockStream)
      expect(mockVerifyPayload).toHaveBeenCalledWith(AJVSchemaEnum.GetAppliedVoteResp, result)
    })

    it('should throw error for unsupported version', () => {
      (mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(2)

      expect(() => deserializeGetAppliedVoteResp(mockStream)).toThrow('GetAppliedVoteResp version mismatch')
    })

    it('should throw error for validation failure', () => {
      (mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(1);
      (mockStream.readString as jest.Mock)
        .mockReturnValueOnce('tx123')
        .mockReturnValueOnce('vote_hash_123')
      mockVerifyPayload.mockReturnValueOnce(['Invalid field', 'Another error'])

      expect(() => deserializeGetAppliedVoteResp(mockStream)).toThrow('AJV: validation error -> Invalid field, Another error')
    })

    it('should deserialize in correct order', () => {
      (mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(1);
      (mockStream.readString as jest.Mock)
        .mockReturnValueOnce('tx456')
        .mockReturnValueOnce('hash456')

      const result = deserializeGetAppliedVoteResp(mockStream)

      expect(result.txId).toBe('tx456')
      expect(result.appliedVoteHash).toBe('hash456')
      expect(mockDeserializeAppliedVote).toHaveBeenCalledTimes(1)
    })

    it('should handle empty strings', () => {
      (mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(1);
      (mockStream.readString as jest.Mock)
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')

      const result = deserializeGetAppliedVoteResp(mockStream)

      expect(result.txId).toBe('')
      expect(result.appliedVoteHash).toBe('')
    })

    it('should validate after full deserialization', () => {
      (mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(1);
      (mockStream.readString as jest.Mock)
        .mockReturnValueOnce('tx123')
        .mockReturnValueOnce('vote_hash_123')

      deserializeGetAppliedVoteResp(mockStream)

      expect(mockVerifyPayload).toHaveBeenCalledTimes(1)
      expect(mockVerifyPayload).toHaveBeenCalledWith(
        AJVSchemaEnum.GetAppliedVoteResp,
        expect.objectContaining({
          txId: 'tx123',
          appliedVote: mockAppliedVote,
          appliedVoteHash: 'vote_hash_123'
        })
      )
    })
  })

  describe('version handling', () => {
    it('should use version 1 for serialization', () => {
      const mockData: GetAppliedVoteResp = {
        txId: 'tx123',
        appliedVote: {} as any,
        appliedVoteHash: 'hash123'
      }

      serializeGetAppliedVoteResp(mockStream, mockData)

      expect(mockStream.writeUInt8).toHaveBeenCalledWith(1)
    })
  })
})