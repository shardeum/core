import {
  GetConfirmOrChallengeReq,
  serializeGetConfirmOrChallengeReq,
  deserializeGetConfirmOrChallengeReq
} from '../../../src/types/GetConfirmOrChallengeReq'
import { VectorBufferStream } from '../../../src/utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from '../../../src/types/enum/TypeIdentifierEnum'

describe('GetConfirmOrChallengeReq', () => {
  let mockStream: VectorBufferStream

  beforeEach(() => {
    mockStream = {
      writeUInt16: jest.fn(),
      writeUInt8: jest.fn(),
      writeString: jest.fn(),
      readUInt8: jest.fn(),
      readString: jest.fn()
    } as unknown as VectorBufferStream
  })

  describe('serializeGetConfirmOrChallengeReq', () => {
    it('should serialize without root flag', () => {
      const req: GetConfirmOrChallengeReq = {
        txId: 'test-transaction-id-123'
      }

      serializeGetConfirmOrChallengeReq(mockStream, req, false)

      expect(mockStream.writeUInt16).not.toHaveBeenCalled()
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(1) // version
      expect(mockStream.writeString).toHaveBeenCalledWith('test-transaction-id-123')
    })

    it('should serialize with root flag', () => {
      const req: GetConfirmOrChallengeReq = {
        txId: 'test-transaction-id-456'
      }

      serializeGetConfirmOrChallengeReq(mockStream, req, true)

      expect(mockStream.writeUInt16).toHaveBeenCalledWith(TypeIdentifierEnum.cGetConfirmOrChallengeReq)
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(1) // version
      expect(mockStream.writeString).toHaveBeenCalledWith('test-transaction-id-456')
    })

    it('should handle empty txId', () => {
      const req: GetConfirmOrChallengeReq = {
        txId: ''
      }

      serializeGetConfirmOrChallengeReq(mockStream, req)

      expect(mockStream.writeUInt8).toHaveBeenCalledWith(1)
      expect(mockStream.writeString).toHaveBeenCalledWith('')
    })

    it('should handle special characters in txId', () => {
      const req: GetConfirmOrChallengeReq = {
        txId: 'tx-!@#$%^&*()_+-=[]{}|;:",.<>?'
      }

      serializeGetConfirmOrChallengeReq(mockStream, req)

      expect(mockStream.writeString).toHaveBeenCalledWith('tx-!@#$%^&*()_+-=[]{}|;:",.<>?')
    })
  })

  describe('deserializeGetConfirmOrChallengeReq', () => {
    it('should deserialize correctly', () => {
      const expectedTxId = 'test-transaction-id-789'

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(1) // version
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce(expectedTxId)

      const result = deserializeGetConfirmOrChallengeReq(mockStream)

      expect(result).toEqual({
        txId: expectedTxId
      })
      expect(mockStream.readUInt8).toHaveBeenCalledTimes(1)
      expect(mockStream.readString).toHaveBeenCalledTimes(1)
    })

    it('should throw error for version mismatch', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(2) // version > cGetConfirmOrChallengeReqVersion

      expect(() => deserializeGetConfirmOrChallengeReq(mockStream)).toThrow(
        'GetConfirmOrChallengeReq version mismatch'
      )
    })

    it('should handle empty txId', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(1)
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce('')

      const result = deserializeGetConfirmOrChallengeReq(mockStream)

      expect(result).toEqual({
        txId: ''
      })
    })

    it('should handle special characters in txId', () => {
      const specialTxId = 'tx-!@#$%^&*()_+-=[]{}|;:",.<>?'

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(1)
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce(specialTxId)

      const result = deserializeGetConfirmOrChallengeReq(mockStream)

      expect(result).toEqual({
        txId: specialTxId
      })
    })

    it('should accept version 0', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(0) // version = 0 (less than current)
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce('tx-123')

      const result = deserializeGetConfirmOrChallengeReq(mockStream)

      expect(result).toEqual({
        txId: 'tx-123'
      })
    })
  })
})