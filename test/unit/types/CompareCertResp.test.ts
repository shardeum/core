import {
  serializeCompareCertResp,
  deserializeCompareCertResp,
  CompareCertRespSerializable,
  cCompareCertRespVersion,
} from '../../../src/types/CompareCertResp'
import { VectorBufferStream } from '../../../src/utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from '../../../src/types/enum/TypeIdentifierEnum'
import { Utils } from '@shardeum-foundation/lib-types'
import * as ajvHelpers from '../../../src/types/ajv/Helpers'
import { AJVSchemaEnum } from '../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../src/types/ajv/Helpers')

describe('CompareCertResp', () => {
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

  describe('serializeCompareCertResp', () => {
    const mockData: CompareCertRespSerializable = {
      certs: [{ marker: 'cert1', score: 100 } as any, { marker: 'cert2', score: 200 } as any],
      record: { counter: 1, previous: 'prev123' } as any,
    }

    it('should serialize without root flag', () => {
      serializeCompareCertResp(mockStream, mockData, false)

      expect(mockStream.writeUInt16).not.toHaveBeenCalled()
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(cCompareCertRespVersion)
      expect(mockStream.writeString).toHaveBeenCalledWith(Utils.safeStringify(mockData))
    })

    it('should serialize with root flag', () => {
      serializeCompareCertResp(mockStream, mockData, true)

      expect(mockStream.writeUInt16).toHaveBeenCalledWith(TypeIdentifierEnum.cCompareCertResp)
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(cCompareCertRespVersion)
      expect(mockStream.writeString).toHaveBeenCalledWith(Utils.safeStringify(mockData))
    })

    it('should serialize empty data correctly', () => {
      const emptyData: CompareCertRespSerializable = {
        certs: [],
        record: {} as any,
      }

      serializeCompareCertResp(mockStream, emptyData)

      expect(mockStream.writeUInt8).toHaveBeenCalledWith(cCompareCertRespVersion)
      expect(mockStream.writeString).toHaveBeenCalledWith(Utils.safeStringify(emptyData))
    })

    it('should handle complex nested data', () => {
      const complexData: CompareCertRespSerializable = {
        certs: [
          {
            marker: 'cert1',
            score: 100,
            nested: { deep: { value: 'test' } },
          } as any,
        ],
        record: {
          counter: 1,
          data: { key: 'value' },
          array: [1, 2, 3],
        } as any,
      }

      serializeCompareCertResp(mockStream, complexData)

      expect(mockStream.writeString).toHaveBeenCalledWith(Utils.safeStringify(complexData))
    })

    it('should write version before data', () => {
      serializeCompareCertResp(mockStream, mockData)

      // Verify the order of calls
      const calls = (mockStream.writeUInt8 as jest.Mock).mock.invocationCallOrder[0]
      const stringCalls = (mockStream.writeString as jest.Mock).mock.invocationCallOrder[0]

      expect(calls).toBeLessThan(stringCalls)
    })
  })

  describe('deserializeCompareCertResp', () => {
    const mockData: CompareCertRespSerializable = {
      certs: [{ marker: 'cert1', score: 100 } as any],
      record: { counter: 1 } as any,
    }

    beforeEach(() => {
      mockVerifyPayload.mockReturnValue([])
    })

    it('should deserialize valid data correctly', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cCompareCertRespVersion)
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce(JSON.stringify(mockData))

      const result = deserializeCompareCertResp(mockStream)

      expect(result).toEqual(mockData)
      expect(mockStream.readUInt8).toHaveBeenCalledTimes(1)
      expect(mockStream.readString).toHaveBeenCalledTimes(1)
      expect(mockVerifyPayload).toHaveBeenCalledWith(AJVSchemaEnum.CompareCertResp, mockData)
    })

    it('should throw error for unsupported version', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cCompareCertRespVersion + 1)

      expect(() => deserializeCompareCertResp(mockStream)).toThrow(
        `Unsupported CompareCertRespSerializable version ${cCompareCertRespVersion + 1}`
      )
    })

    it('should throw error for validation failure', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cCompareCertRespVersion)
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce(JSON.stringify(mockData))
      mockVerifyPayload.mockReturnValueOnce(['Validation error 1', 'Validation error 2'])

      expect(() => deserializeCompareCertResp(mockStream)).toThrow('Data validation error')
    })

    it('should handle empty arrays correctly', () => {
      const emptyData: CompareCertRespSerializable = {
        certs: [],
        record: {} as any,
      }

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cCompareCertRespVersion)
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce(JSON.stringify(emptyData))

      const result = deserializeCompareCertResp(mockStream)

      expect(result).toEqual(emptyData)
      expect(mockVerifyPayload).toHaveBeenCalledWith(AJVSchemaEnum.CompareCertResp, emptyData)
    })

    it('should parse JSON correctly', () => {
      const jsonString = JSON.stringify(mockData)

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cCompareCertRespVersion)
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce(jsonString)

      const result = deserializeCompareCertResp(mockStream)

      expect(result).toEqual(mockData)
      // Verify it used Utils.safeJsonParse by checking the result matches
      expect(result.certs).toEqual(mockData.certs)
      expect(result.record).toEqual(mockData.record)
    })

    it('should validate payload after parsing', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cCompareCertRespVersion)
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce(JSON.stringify(mockData))

      deserializeCompareCertResp(mockStream)

      expect(mockVerifyPayload).toHaveBeenCalledTimes(1)
      expect(mockVerifyPayload).toHaveBeenCalledWith(AJVSchemaEnum.CompareCertResp, mockData)
    })
  })

  describe('version constant', () => {
    it('should have correct version number', () => {
      expect(cCompareCertRespVersion).toBe(1)
    })
  })
})
