import { 
  serializeRequestStateForTxReq, 
  deserializeRequestStateForTxReq, 
  RequestStateForTxReq,
  cRequestStateForTxReqVersion 
} from '../../../src/types/RequestStateForTxReq'
import { VectorBufferStream } from '../../../src/utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from '../../../src/types/enum/TypeIdentifierEnum'
import * as ajvHelpers from '../../../src/types/ajv/Helpers'
import { AJVSchemaEnum } from '../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../src/types/ajv/Helpers')

describe('RequestStateForTxReq', () => {
  let mockStream: VectorBufferStream
  const mockVerifyPayload = ajvHelpers.verifyPayload as jest.MockedFunction<typeof ajvHelpers.verifyPayload>

  beforeEach(() => {
    jest.clearAllMocks()
    mockStream = {
      writeUInt16: jest.fn(),
      writeUInt8: jest.fn(),
      writeString: jest.fn(),
      writeUInt32: jest.fn(),
      readUInt8: jest.fn(),
      readString: jest.fn(),
      readUInt32: jest.fn()
    } as unknown as VectorBufferStream
  })

  describe('serializeRequestStateForTxReq', () => {
    const mockData: RequestStateForTxReq = {
      txid: 'tx123',
      timestamp: 1234567890,
      keys: ['key1', 'key2', 'key3']
    }

    it('should serialize without root flag', () => {
      serializeRequestStateForTxReq(mockStream, mockData, false)

      expect(mockStream.writeUInt16).not.toHaveBeenCalled()
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(cRequestStateForTxReqVersion)
      expect(mockStream.writeString).toHaveBeenCalledWith('tx123')
      expect(mockStream.writeString).toHaveBeenCalledWith('1234567890')
      expect(mockStream.writeUInt32).toHaveBeenCalledWith(3)
      expect(mockStream.writeString).toHaveBeenCalledWith('key1')
      expect(mockStream.writeString).toHaveBeenCalledWith('key2')
      expect(mockStream.writeString).toHaveBeenCalledWith('key3')
    })

    it('should serialize with root flag', () => {
      serializeRequestStateForTxReq(mockStream, mockData, true)

      expect(mockStream.writeUInt16).toHaveBeenCalledWith(TypeIdentifierEnum.cRequestStateForTxReq)
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(cRequestStateForTxReqVersion)
    })

    it('should handle empty keys array', () => {
      const dataWithEmptyKeys: RequestStateForTxReq = {
        txid: 'tx456',
        timestamp: 9876543210,
        keys: []
      }

      serializeRequestStateForTxReq(mockStream, dataWithEmptyKeys)

      expect(mockStream.writeString).toHaveBeenCalledWith('tx456')
      expect(mockStream.writeString).toHaveBeenCalledWith('9876543210')
      expect(mockStream.writeUInt32).toHaveBeenCalledWith(0)
      // No additional writeString calls for keys
      expect(mockStream.writeString).toHaveBeenCalledTimes(2)
    })

    it('should serialize keys in order', () => {
      const dataWithManyKeys: RequestStateForTxReq = {
        txid: 'tx789',
        timestamp: 1111111111,
        keys: ['a', 'b', 'c', 'd', 'e']
      }

      serializeRequestStateForTxReq(mockStream, dataWithManyKeys)

      const writeStringCalls = (mockStream.writeString as jest.Mock).mock.calls
      expect(writeStringCalls[0][0]).toBe('tx789')
      expect(writeStringCalls[1][0]).toBe('1111111111')
      expect(writeStringCalls[2][0]).toBe('a')
      expect(writeStringCalls[3][0]).toBe('b')
      expect(writeStringCalls[4][0]).toBe('c')
      expect(writeStringCalls[5][0]).toBe('d')
      expect(writeStringCalls[6][0]).toBe('e')
    })

    it('should write keys length before keys', () => {
      serializeRequestStateForTxReq(mockStream, mockData)

      // Verify order
      const writeUInt32Order = (mockStream.writeUInt32 as jest.Mock).mock.invocationCallOrder[0]
      const firstKeyOrder = (mockStream.writeString as jest.Mock).mock.invocationCallOrder[2] // After txid and timestamp
      
      expect(writeUInt32Order).toBeLessThan(firstKeyOrder)
    })
  })

  describe('deserializeRequestStateForTxReq', () => {
    beforeEach(() => {
      mockVerifyPayload.mockReturnValue([])
    })

    it('should deserialize valid data correctly', () => {
      (mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cRequestStateForTxReqVersion);
      (mockStream.readString as jest.Mock)
        .mockReturnValueOnce('tx123')
        .mockReturnValueOnce('1234567890')
        .mockReturnValueOnce('key1')
        .mockReturnValueOnce('key2')
        .mockReturnValueOnce('key3');
      (mockStream.readUInt32 as jest.Mock).mockReturnValueOnce(3)

      const result = deserializeRequestStateForTxReq(mockStream)

      expect(result).toEqual({
        txid: 'tx123',
        timestamp: 1234567890,
        keys: ['key1', 'key2', 'key3']
      })
      expect(mockVerifyPayload).toHaveBeenCalledWith(AJVSchemaEnum.RequestStateForTxReq, result)
    })

    it('should throw error for unsupported version', () => {
      (mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cRequestStateForTxReqVersion + 1)

      expect(() => deserializeRequestStateForTxReq(mockStream)).toThrow('Unsupported version')
    })

    it('should deserialize empty keys array', () => {
      (mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cRequestStateForTxReqVersion);
      (mockStream.readString as jest.Mock)
        .mockReturnValueOnce('tx456')
        .mockReturnValueOnce('9876543210');
      (mockStream.readUInt32 as jest.Mock).mockReturnValueOnce(0)

      const result = deserializeRequestStateForTxReq(mockStream)

      expect(result).toEqual({
        txid: 'tx456',
        timestamp: 9876543210,
        keys: []
      })
    })

    it('should parse timestamp string to number', () => {
      (mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cRequestStateForTxReqVersion);
      (mockStream.readString as jest.Mock)
        .mockReturnValueOnce('tx789')
        .mockReturnValueOnce('9999999999');
      (mockStream.readUInt32 as jest.Mock).mockReturnValueOnce(0)

      const result = deserializeRequestStateForTxReq(mockStream)

      expect(result.timestamp).toBe(9999999999)
      expect(typeof result.timestamp).toBe('number')
    })

    it('should throw error for validation failure', () => {
      (mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cRequestStateForTxReqVersion);
      (mockStream.readString as jest.Mock)
        .mockReturnValueOnce('tx123')
        .mockReturnValueOnce('1234567890');
      (mockStream.readUInt32 as jest.Mock).mockReturnValueOnce(0)
      mockVerifyPayload.mockReturnValueOnce(['Invalid field'])

      expect(() => deserializeRequestStateForTxReq(mockStream)).toThrow('AJV: validation error -> Invalid field')
    })

    it('should handle large keys arrays', () => {
      const keyCount = 100
      const mockKeys = Array.from({ length: keyCount }, (_, i) => `key${i}`);

      (mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cRequestStateForTxReqVersion);
      const readStringMock = mockStream.readString as jest.Mock
      readStringMock
        .mockReturnValueOnce('tx123')
        .mockReturnValueOnce('1234567890')
      
      mockKeys.forEach(key => {
        readStringMock.mockReturnValueOnce(key)
      });
      
      (mockStream.readUInt32 as jest.Mock).mockReturnValueOnce(keyCount)

      const result = deserializeRequestStateForTxReq(mockStream)

      expect(result.keys).toEqual(mockKeys)
      expect(result.keys.length).toBe(keyCount)
    })

    it('should deserialize keys in correct order', () => {
      (mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cRequestStateForTxReqVersion);
      (mockStream.readString as jest.Mock)
        .mockReturnValueOnce('tx123')
        .mockReturnValueOnce('1234567890')
        .mockReturnValueOnce('first')
        .mockReturnValueOnce('second')
        .mockReturnValueOnce('third');
      (mockStream.readUInt32 as jest.Mock).mockReturnValueOnce(3)

      const result = deserializeRequestStateForTxReq(mockStream)

      expect(result.keys[0]).toBe('first')
      expect(result.keys[1]).toBe('second')
      expect(result.keys[2]).toBe('third')
    })
  })

  describe('version constant', () => {
    it('should have correct version number', () => {
      expect(cRequestStateForTxReqVersion).toBe(1)
    })
  })
})