import {
  GetAppliedVoteReq,
  serializeGetAppliedVoteReq,
  deserializeGetAppliedVoteReq
} from '../../../src/types/GetAppliedVoteReq'
import { VectorBufferStream } from '../../../src/utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from '../../../src/types/enum/TypeIdentifierEnum'
import * as Helpers from '../../../src/types/ajv/Helpers'
import { AJVSchemaEnum } from '../../../src/types/enum/AJVSchemaEnum'

// Mock the verifyPayload function
jest.mock('../../../src/types/ajv/Helpers', () => ({
  verifyPayload: jest.fn()
}))

describe('GetAppliedVoteReq', () => {
  let mockStream: VectorBufferStream
  let verifyPayloadMock: any

  beforeEach(() => {
    mockStream = {
      writeUInt16: jest.fn(),
      writeUInt8: jest.fn(),
      writeString: jest.fn(),
      readUInt8: jest.fn(),
      readString: jest.fn()
    } as unknown as VectorBufferStream

    verifyPayloadMock = Helpers.verifyPayload as any
    verifyPayloadMock.mockClear()
  })

  describe('serializeGetAppliedVoteReq', () => {
    it('should serialize without root flag', () => {
      const req: GetAppliedVoteReq = {
        txId: 'transaction-id-123'
      }

      serializeGetAppliedVoteReq(mockStream, req, false)

      expect(mockStream.writeUInt16).not.toHaveBeenCalled()
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(1) // version
      expect(mockStream.writeString).toHaveBeenCalledWith('transaction-id-123')
    })

    it('should serialize with root flag', () => {
      const req: GetAppliedVoteReq = {
        txId: 'transaction-id-456'
      }

      serializeGetAppliedVoteReq(mockStream, req, true)

      expect(mockStream.writeUInt16).toHaveBeenCalledWith(TypeIdentifierEnum.cGetAppliedVoteReq)
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(1) // version
      expect(mockStream.writeString).toHaveBeenCalledWith('transaction-id-456')
    })

    it('should handle empty txId', () => {
      const req: GetAppliedVoteReq = {
        txId: ''
      }

      serializeGetAppliedVoteReq(mockStream, req)

      expect(mockStream.writeUInt8).toHaveBeenCalledWith(1)
      expect(mockStream.writeString).toHaveBeenCalledWith('')
    })

    it('should handle special characters in txId', () => {
      const req: GetAppliedVoteReq = {
        txId: 'tx-!@#$%^&*()_+-=[]{}|;:",.<>?'
      }

      serializeGetAppliedVoteReq(mockStream, req)

      expect(mockStream.writeString).toHaveBeenCalledWith('tx-!@#$%^&*()_+-=[]{}|;:",.<>?')
    })

    it('should handle long txId', () => {
      const longTxId = 'a'.repeat(1000)
      const req: GetAppliedVoteReq = {
        txId: longTxId
      }

      serializeGetAppliedVoteReq(mockStream, req)

      expect(mockStream.writeString).toHaveBeenCalledWith(longTxId)
    })
  })

  describe('deserializeGetAppliedVoteReq', () => {
    it('should deserialize correctly with valid data', () => {
      const expectedTxId = 'transaction-id-789'

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(1) // version
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce(expectedTxId)
      verifyPayloadMock.mockReturnValueOnce(null)

      const result = deserializeGetAppliedVoteReq(mockStream)

      expect(result).toEqual({
        txId: expectedTxId
      })
      expect(mockStream.readUInt8).toHaveBeenCalledTimes(1)
      expect(mockStream.readString).toHaveBeenCalledTimes(1)
      expect(verifyPayloadMock).toHaveBeenCalledWith(
        AJVSchemaEnum.GetAppliedVoteReq,
        { txId: expectedTxId }
      )
    })

    it('should throw error for version mismatch', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(2) // version > cGetAppliedVoteReqVersion

      expect(() => deserializeGetAppliedVoteReq(mockStream)).toThrow(
        'GetAppliedVoteReq version mismatch'
      )
      expect(verifyPayloadMock).not.toHaveBeenCalled()
    })

    it('should throw error when validation fails', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(1)
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce('some-tx-id')
      verifyPayloadMock.mockReturnValueOnce(['Field txId is invalid', 'Another error'])

      expect(() => deserializeGetAppliedVoteReq(mockStream)).toThrow(
        'AJV: validation error -> Field txId is invalid, Another error'
      )
    })

    it('should handle empty txId', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(1)
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce('')
      verifyPayloadMock.mockReturnValueOnce(null)

      const result = deserializeGetAppliedVoteReq(mockStream)

      expect(result).toEqual({
        txId: ''
      })
    })

    it('should handle special characters in txId', () => {
      const specialTxId = 'tx-!@#$%^&*()_+-=[]{}|;:",.<>?'

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(1)
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce(specialTxId)
      verifyPayloadMock.mockReturnValueOnce(null)

      const result = deserializeGetAppliedVoteReq(mockStream)

      expect(result).toEqual({
        txId: specialTxId
      })
    })

    it('should accept version 0', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(0) // version = 0 (less than current)
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce('tx-123')
      verifyPayloadMock.mockReturnValueOnce(null)

      const result = deserializeGetAppliedVoteReq(mockStream)

      expect(result).toEqual({
        txId: 'tx-123'
      })
    })

    it('should validate the deserialized object', () => {
      const txId = 'test-transaction-id'

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(1)
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce(txId)
      verifyPayloadMock.mockReturnValueOnce(null)

      deserializeGetAppliedVoteReq(mockStream)

      expect(verifyPayloadMock).toHaveBeenCalledWith(
        AJVSchemaEnum.GetAppliedVoteReq,
        { txId }
      )
    })
  })
})