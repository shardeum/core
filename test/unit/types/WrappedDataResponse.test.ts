import {
  serializeWrappedDataResponse,
  deserializeWrappedDataResponse,
  WrappedDataResponse,
  cWrappedDataResponseVersion,
} from '../../../src/types/WrappedDataResponse'
import { VectorBufferStream } from '../../../src/utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from '../../../src/types/enum/TypeIdentifierEnum'
import * as WrappedData from '../../../src/types/WrappedData'
import * as ajvHelpers from '../../../src/types/ajv/Helpers'
import { AJVSchemaEnum } from '../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../src/types/WrappedData')
jest.mock('../../../src/types/ajv/Helpers')

describe('WrappedDataResponse', () => {
  let mockStream: VectorBufferStream
  const mockSerializeWrappedData = WrappedData.serializeWrappedData as jest.MockedFunction<
    typeof WrappedData.serializeWrappedData
  >
  const mockDeserializeWrappedData = WrappedData.deserializeWrappedData as jest.MockedFunction<
    typeof WrappedData.deserializeWrappedData
  >
  const mockVerifyPayload = ajvHelpers.verifyPayload as jest.MockedFunction<typeof ajvHelpers.verifyPayload>

  beforeEach(() => {
    jest.clearAllMocks()
    mockStream = {
      writeUInt16: jest.fn(),
      writeUInt8: jest.fn(),
      readUInt8: jest.fn(),
    } as unknown as VectorBufferStream
  })

  describe('serializeWrappedDataResponse', () => {
    const mockData: WrappedDataResponse = {
      accountId: 'acc123',
      stateId: 'state456',
      data: { someField: 'someValue' },
      timestamp: 1234567890,
      accountCreated: true,
      isPartial: false,
    }

    it('should serialize without root flag', () => {
      serializeWrappedDataResponse(mockStream, mockData, false)

      expect(mockStream.writeUInt16).not.toHaveBeenCalled()
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(cWrappedDataResponseVersion)
      expect(mockSerializeWrappedData).toHaveBeenCalledWith(mockStream, mockData)
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(1) // accountCreated = true
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(0) // isPartial = false
    })

    it('should serialize with root flag', () => {
      serializeWrappedDataResponse(mockStream, mockData, true)

      expect(mockStream.writeUInt16).toHaveBeenCalledWith(TypeIdentifierEnum.cWrappedDataResponse)
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(cWrappedDataResponseVersion)
      expect(mockSerializeWrappedData).toHaveBeenCalledWith(mockStream, mockData)
    })

    it('should serialize boolean fields correctly', () => {
      const testCases = [
        { accountCreated: true, isPartial: true, expectedValues: [1, 1] },
        { accountCreated: true, isPartial: false, expectedValues: [1, 0] },
        { accountCreated: false, isPartial: true, expectedValues: [0, 1] },
        { accountCreated: false, isPartial: false, expectedValues: [0, 0] },
      ]

      testCases.forEach((testCase) => {
        mockStream.writeUInt8 = jest.fn()
        const data: WrappedDataResponse = {
          ...mockData,
          accountCreated: testCase.accountCreated,
          isPartial: testCase.isPartial,
        }

        serializeWrappedDataResponse(mockStream, data)

        expect(mockStream.writeUInt8).toHaveBeenNthCalledWith(2, testCase.expectedValues[0])
        expect(mockStream.writeUInt8).toHaveBeenNthCalledWith(3, testCase.expectedValues[1])
      })
    })

    it('should serialize fields in correct order', () => {
      serializeWrappedDataResponse(mockStream, mockData)

      const writeUInt8Calls = (mockStream.writeUInt8 as jest.Mock).mock.invocationCallOrder
      const serializeWrappedDataOrder = mockSerializeWrappedData.mock.invocationCallOrder[0]

      // Version is written first
      expect(writeUInt8Calls[0]).toBeLessThan(serializeWrappedDataOrder)
      // Boolean fields are written after wrapped data
      expect(serializeWrappedDataOrder).toBeLessThan(writeUInt8Calls[1])
      expect(writeUInt8Calls[1]).toBeLessThan(writeUInt8Calls[2])
    })

    it('should pass full object to serializeWrappedData', () => {
      serializeWrappedDataResponse(mockStream, mockData)

      expect(mockSerializeWrappedData).toHaveBeenCalledTimes(1)
      expect(mockSerializeWrappedData).toHaveBeenCalledWith(mockStream, mockData)
    })
  })

  describe('deserializeWrappedDataResponse', () => {
    const mockWrappedData: WrappedData.WrappedData = {
      accountId: 'acc123',
      stateId: 'state456',
      data: { deserializedField: 'value' },
      timestamp: 1234567890,
    }

    beforeEach(() => {
      mockVerifyPayload.mockReturnValue([])
      mockDeserializeWrappedData.mockReturnValue(mockWrappedData)
    })

    it('should deserialize valid data correctly', () => {
      ;(mockStream.readUInt8 as jest.Mock)
        .mockReturnValueOnce(cWrappedDataResponseVersion)
        .mockReturnValueOnce(1) // accountCreated = true
        .mockReturnValueOnce(0) // isPartial = false

      const result = deserializeWrappedDataResponse(mockStream)

      expect(result).toEqual({
        ...mockWrappedData,
        accountCreated: true,
        isPartial: false,
      })
      expect(mockDeserializeWrappedData).toHaveBeenCalledWith(mockStream)
      expect(mockVerifyPayload).toHaveBeenCalledWith(AJVSchemaEnum.WrappedDataResponse, result)
    })

    it('should throw error for unsupported version', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cWrappedDataResponseVersion + 1)

      expect(() => deserializeWrappedDataResponse(mockStream)).toThrow('WrappedDataResponse version mismatch')
    })

    it('should deserialize boolean fields correctly', () => {
      const testCases = [
        { readValues: [1, 1], expected: { accountCreated: true, isPartial: true } },
        { readValues: [1, 0], expected: { accountCreated: true, isPartial: false } },
        { readValues: [0, 1], expected: { accountCreated: false, isPartial: true } },
        { readValues: [0, 0], expected: { accountCreated: false, isPartial: false } },
      ]

      testCases.forEach((testCase) => {
        mockStream.readUInt8 = jest
          .fn()
          .mockReturnValueOnce(cWrappedDataResponseVersion)
          .mockReturnValueOnce(testCase.readValues[0])
          .mockReturnValueOnce(testCase.readValues[1])

        const result = deserializeWrappedDataResponse(mockStream)

        expect(result.accountCreated).toBe(testCase.expected.accountCreated)
        expect(result.isPartial).toBe(testCase.expected.isPartial)
      })
    })

    it('should throw error for validation failure', () => {
      ;(mockStream.readUInt8 as jest.Mock)
        .mockReturnValueOnce(cWrappedDataResponseVersion)
        .mockReturnValueOnce(1)
        .mockReturnValueOnce(0)
      mockVerifyPayload.mockReturnValueOnce(['Validation error'])

      expect(() => deserializeWrappedDataResponse(mockStream)).toThrow('Data validation error')
    })

    it('should merge wrapped data with boolean fields', () => {
      ;(mockStream.readUInt8 as jest.Mock)
        .mockReturnValueOnce(cWrappedDataResponseVersion)
        .mockReturnValueOnce(1)
        .mockReturnValueOnce(1)

      const result = deserializeWrappedDataResponse(mockStream)

      expect(result).toHaveProperty('accountId', 'acc123')
      expect(result).toHaveProperty('stateId', 'state456')
      expect(result).toHaveProperty('data')
      expect(result).toHaveProperty('timestamp', 1234567890)
      expect(result).toHaveProperty('accountCreated', true)
      expect(result).toHaveProperty('isPartial', true)
    })

    it('should validate the complete object', () => {
      ;(mockStream.readUInt8 as jest.Mock)
        .mockReturnValueOnce(cWrappedDataResponseVersion)
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(1)

      deserializeWrappedDataResponse(mockStream)

      expect(mockVerifyPayload).toHaveBeenCalledTimes(1)
      expect(mockVerifyPayload).toHaveBeenCalledWith(
        AJVSchemaEnum.WrappedDataResponse,
        expect.objectContaining({
          accountId: 'acc123',
          stateId: 'state456',
          data: expect.any(Object),
          timestamp: 1234567890,
          accountCreated: false,
          isPartial: true,
        })
      )
    })
  })

  describe('version constant', () => {
    it('should have correct version number', () => {
      expect(cWrappedDataResponseVersion).toBe(1)
    })
  })
})
