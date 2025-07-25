import {
  serializeRequestReceiptForTxReq,
  deserializeRequestReceiptForTxReq,
  RequestReceiptForTxReqSerialized,
  cRequestReceiptForTxReqVersion,
} from '../../../src/types/RequestReceiptForTxReq'
import { VectorBufferStream } from '../../../src/utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from '../../../src/types/enum/TypeIdentifierEnum'
import * as ajvHelpers from '../../../src/types/ajv/Helpers'
import { AJVSchemaEnum } from '../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../src/types/ajv/Helpers')

describe('RequestReceiptForTxReq', () => {
  let mockStream: VectorBufferStream
  const mockVerifyPayload = ajvHelpers.verifyPayload as jest.MockedFunction<typeof ajvHelpers.verifyPayload>

  beforeEach(() => {
    jest.clearAllMocks()
    mockStream = {
      writeUInt16: jest.fn(),
      writeUInt8: jest.fn(),
      writeString: jest.fn(),
      readUInt8: jest.fn(),
      readString: jest.fn(),
    } as unknown as VectorBufferStream
  })

  describe('serializeRequestReceiptForTxReq', () => {
    const mockData: RequestReceiptForTxReqSerialized = {
      txid: 'tx123',
      timestamp: 1234567890,
    }

    it('should serialize without root flag', () => {
      serializeRequestReceiptForTxReq(mockStream, mockData, false)

      expect(mockStream.writeUInt16).not.toHaveBeenCalled()
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(cRequestReceiptForTxReqVersion)
      expect(mockStream.writeString).toHaveBeenCalledWith('tx123')
      expect(mockStream.writeString).toHaveBeenCalledWith('1234567890')
    })

    it('should serialize with root flag', () => {
      serializeRequestReceiptForTxReq(mockStream, mockData, true)

      expect(mockStream.writeUInt16).toHaveBeenCalledWith(TypeIdentifierEnum.cRequestReceiptForTxReq)
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(cRequestReceiptForTxReqVersion)
      expect(mockStream.writeString).toHaveBeenCalledWith('tx123')
      expect(mockStream.writeString).toHaveBeenCalledWith('1234567890')
    })

    it('should convert timestamp to string', () => {
      const dataWithLargeTimestamp: RequestReceiptForTxReqSerialized = {
        txid: 'tx456',
        timestamp: 9999999999999,
      }

      serializeRequestReceiptForTxReq(mockStream, dataWithLargeTimestamp)

      expect(mockStream.writeString).toHaveBeenCalledWith('tx456')
      expect(mockStream.writeString).toHaveBeenCalledWith('9999999999999')
    })

    it('should handle empty txid', () => {
      const dataWithEmptyTxid: RequestReceiptForTxReqSerialized = {
        txid: '',
        timestamp: 1234567890,
      }

      serializeRequestReceiptForTxReq(mockStream, dataWithEmptyTxid)

      expect(mockStream.writeString).toHaveBeenCalledWith('')
      expect(mockStream.writeString).toHaveBeenCalledWith('1234567890')
    })

    it('should write in correct order', () => {
      serializeRequestReceiptForTxReq(mockStream, mockData)

      const writeStringCalls = (mockStream.writeString as jest.Mock).mock.calls
      expect(writeStringCalls[0][0]).toBe('tx123') // txid first
      expect(writeStringCalls[1][0]).toBe('1234567890') // timestamp second
    })
  })

  describe('deserializeRequestReceiptForTxReq', () => {
    beforeEach(() => {
      mockVerifyPayload.mockReturnValue([])
    })

    it('should deserialize valid data correctly', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cRequestReceiptForTxReqVersion)
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce('tx123').mockReturnValueOnce('1234567890')

      const result = deserializeRequestReceiptForTxReq(mockStream)

      expect(result).toEqual({
        txid: 'tx123',
        timestamp: 1234567890,
      })
      expect(mockVerifyPayload).toHaveBeenCalledWith(AJVSchemaEnum.RequestReceiptForTxReq, result)
    })

    it('should throw error for version mismatch', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cRequestReceiptForTxReqVersion + 1)

      expect(() => deserializeRequestReceiptForTxReq(mockStream)).toThrow('RequestReceiptForTxReq version mismatch')
    })

    it('should convert timestamp string to number', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cRequestReceiptForTxReqVersion)
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce('tx789').mockReturnValueOnce('9876543210')

      const result = deserializeRequestReceiptForTxReq(mockStream)

      expect(result.timestamp).toBe(9876543210)
      expect(typeof result.timestamp).toBe('number')
    })

    it('should throw error for validation failure', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cRequestReceiptForTxReqVersion)
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce('tx123').mockReturnValueOnce('1234567890')
      mockVerifyPayload.mockReturnValueOnce(['Invalid txid', 'Invalid timestamp'])

      expect(() => deserializeRequestReceiptForTxReq(mockStream)).toThrow(
        'AJV: validation error -> Invalid txid, Invalid timestamp'
      )
    })

    it('should handle empty txid', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cRequestReceiptForTxReqVersion)
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce('').mockReturnValueOnce('1234567890')

      const result = deserializeRequestReceiptForTxReq(mockStream)

      expect(result).toEqual({
        txid: '',
        timestamp: 1234567890,
      })
    })

    it('should handle zero timestamp', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cRequestReceiptForTxReqVersion)
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce('tx123').mockReturnValueOnce('0')

      const result = deserializeRequestReceiptForTxReq(mockStream)

      expect(result).toEqual({
        txid: 'tx123',
        timestamp: 0,
      })
    })
  })

  describe('version constant', () => {
    it('should have correct version number', () => {
      expect(cRequestReceiptForTxReqVersion).toBe(1)
    })
  })
})
