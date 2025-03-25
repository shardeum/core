import { AppHeader } from '@shardeum-foundation/lib-net/build/src/types'
import { VectorBufferStream } from '../../../../src/utils/serialization/VectorBufferStream'
import {
  estimateBinarySizeOfObject,
  getStreamWithTypeCheck,
  requestErrorHandler,
  requestSerializer,
  responseDeserializer,
  responseSerializer,
  verificationDataCombiner,
  verificationDataSplitter,
} from '../../../../src/types/Helpers'
import { WrappedReq, serializeWrappedReq } from '../../../../src/types/WrappedReq'
import { WrappedResp, deserializeWrappedResp, serializeWrappedResp } from '../../../../src/types/WrappedResp'
import { deserializeResponseError } from '../../../../src/types/ResponseError'
import { nestedCountersInstance } from '../../../../src/utils/nestedCounters'
import { InternalRouteEnum } from '../../../../src/types/enum/InternalRouteEnum'
import { RequestErrorEnum } from '../../../../src/types/enum/RequestErrorEnum'
import { TypeIdentifierEnum } from '../../../../src/types/enum/TypeIdentifierEnum'
import { ResponseError } from '../../../../src/types/ResponseError'
import { ResponseErrorEnum } from '../../../../src/types/enum/ResponseErrorEnum'

// Mock the dependencies
jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
  },
}))

jest.mock('../../../../src/logger', () => ({
  logFlags: {
    error: true,
    console: true,
  },
}))

// Mock console.log to prevent output during tests
const originalConsoleLog = console.log
beforeAll(() => {
  console.log = jest.fn()
})

afterAll(() => {
  console.log = originalConsoleLog
})

describe('Helpers', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('responseSerializer', () => {
    it('should correctly serialize data', () => {
      // Arrange
      const testData = { test: 'data' }
      const mockSerializerFunc = jest.fn((stream, obj) => {
        stream.writeString(JSON.stringify(obj))
      })

      // Act
      const result = responseSerializer(testData, mockSerializerFunc)

      // Assert
      expect(result).toBeInstanceOf(VectorBufferStream)
      expect(mockSerializerFunc).toHaveBeenCalledWith(expect.any(VectorBufferStream), testData, true)

      // Reset the position to read from the beginning
      result.position = 0

      // Verify that the stream contains a wrapped response
      const responseType = result.readUInt16()
      expect(responseType).toBe(TypeIdentifierEnum.cWrappedResp)
    })

    it('should handle empty data', () => {
      // Arrange
      const emptyData = {}
      const mockSerializerFunc = jest.fn((stream, obj) => {
        stream.writeString(JSON.stringify(obj))
      })

      // Act
      const result = responseSerializer(emptyData, mockSerializerFunc)

      // Assert
      expect(result).toBeInstanceOf(VectorBufferStream)
      expect(mockSerializerFunc).toHaveBeenCalledWith(expect.any(VectorBufferStream), emptyData, true)
    })
  })

  describe('responseDeserializer', () => {
    it('should correctly deserialize valid response data', () => {
      // Arrange
      const testData = { test: 'data' }
      const payload = Buffer.from(JSON.stringify(testData))

      // Create a wrapped response
      const wrappedResp: WrappedResp = { payload }

      // Serialize it
      const stream = new VectorBufferStream(1024)
      serializeWrappedResp(stream, wrappedResp, true)

      // Create a mock deserializer function
      const mockDeserializerFunc = jest.fn().mockReturnValue(testData)

      // Act
      const result = responseDeserializer(stream, mockDeserializerFunc)

      // Assert
      expect(result).toEqual(testData)
      expect(mockDeserializerFunc).toHaveBeenCalled()
    })

    it('should throw an error for invalid response stream', () => {
      // Arrange
      const stream = new VectorBufferStream(1024)
      stream.writeUInt16(999) // Invalid response type
      const mockDeserializerFunc = jest.fn()

      // Act & Assert
      expect(() => responseDeserializer(stream, mockDeserializerFunc)).toThrow('Invalid response stream')
      expect(mockDeserializerFunc).not.toHaveBeenCalled()
    })

    it('should throw a ResponseError when payload contains an error', () => {
      // Arrange
      // Create a ResponseError payload
      const errorPayload = new VectorBufferStream(1024)
      errorPayload.writeUInt16(TypeIdentifierEnum.cResponseError)
      errorPayload.writeUInt8(1) // Version
      errorPayload.writeInt32(ResponseErrorEnum.BadRequest) // Error code
      errorPayload.writeInt32(0) // App code
      errorPayload.writeString('Test error message') // Message

      // Create a wrapped response containing the error
      const wrappedResp: WrappedResp = { payload: errorPayload.getBuffer() }

      // Serialize the wrapped response
      const stream = new VectorBufferStream(1024)
      serializeWrappedResp(stream, wrappedResp, true)

      const mockDeserializerFunc = jest.fn()

      // Act & Assert
      expect(() => responseDeserializer(stream, mockDeserializerFunc)).toThrow(ResponseError)
      expect(mockDeserializerFunc).not.toHaveBeenCalled()
    })
  })

  describe('requestSerializer', () => {
    it('should correctly serialize request data', () => {
      // Arrange
      const testData = { test: 'request data' }
      const mockSerializerFunc = jest.fn((stream, obj) => {
        stream.writeString(JSON.stringify(obj))
      })

      // Act
      const result = requestSerializer(testData, mockSerializerFunc)

      // Assert
      expect(result).toBeInstanceOf(VectorBufferStream)
      expect(mockSerializerFunc).toHaveBeenCalledWith(expect.any(VectorBufferStream), testData, true)

      // Reset the position to read from the beginning
      result.position = 0

      // Verify that the stream contains a wrapped request
      const requestType = result.readUInt16()
      expect(requestType).toBe(TypeIdentifierEnum.cWrappedReq)
    })

    it('should handle empty request data', () => {
      // Arrange
      const emptyData = {}
      const mockSerializerFunc = jest.fn((stream, obj) => {
        stream.writeString(JSON.stringify(obj))
      })

      // Act
      const result = requestSerializer(emptyData, mockSerializerFunc)

      // Assert
      expect(result).toBeInstanceOf(VectorBufferStream)
      expect(mockSerializerFunc).toHaveBeenCalledWith(expect.any(VectorBufferStream), emptyData, true)
    })
  })

  describe('getStreamWithTypeCheck', () => {
    it('should return a VectorBufferStream when type ID matches', () => {
      // Arrange
      const expectedTypeId = TypeIdentifierEnum.cWrappedReq
      const buffer = new VectorBufferStream(1024)
      buffer.writeUInt16(expectedTypeId)
      buffer.writeString('test data')

      // Act
      const result = getStreamWithTypeCheck(buffer.getBuffer(), expectedTypeId)

      // Assert
      expect(result).toBeInstanceOf(VectorBufferStream)
    })

    it('should return null when type ID does not match', () => {
      // Arrange
      const buffer = new VectorBufferStream(1024)
      buffer.writeUInt16(TypeIdentifierEnum.cWrappedReq)
      buffer.writeString('test data')

      // Act
      const result = getStreamWithTypeCheck(buffer.getBuffer(), TypeIdentifierEnum.cWrappedResp)

      // Assert
      expect(result).toBeNull()
      expect(console.log).toHaveBeenCalled()
    })

    it('should include custom error log in the console message', () => {
      // Arrange
      const buffer = new VectorBufferStream(1024)
      buffer.writeUInt16(TypeIdentifierEnum.cWrappedReq)
      buffer.writeString('test data')
      const customError = 'Custom error message'

      // Act
      getStreamWithTypeCheck(buffer.getBuffer(), TypeIdentifierEnum.cWrappedResp, customError)

      // Assert
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining(customError))
    })
  })

  describe('verificationDataCombiner', () => {
    it('should correctly join arguments with colons', () => {
      // Act
      const result = verificationDataCombiner('a', 'b', 'c')

      // Assert
      expect(result).toBe('a:b:c')
    })

    it('should handle empty strings', () => {
      // Act
      const result = verificationDataCombiner('a', '', 'c')

      // Assert
      expect(result).toBe('a::c')
    })

    it('should handle single argument', () => {
      // Act
      const result = verificationDataCombiner('a')

      // Assert
      expect(result).toBe('a')
    })
  })

  describe('verificationDataSplitter', () => {
    it('should correctly split string by colons', () => {
      // Act
      const result = verificationDataSplitter('a:b:c')

      // Assert
      expect(result).toEqual(['a', 'b', 'c'])
    })

    it('should handle empty string', () => {
      // Act
      const result = verificationDataSplitter('')

      // Assert
      expect(result).toEqual([''])
    })

    it('should handle string with no colons', () => {
      // Act
      const result = verificationDataSplitter('abc')

      // Assert
      expect(result).toEqual(['abc'])
    })
  })

  describe('requestErrorHandler', () => {
    it('should log appropriate error message', () => {
      // Arrange
      const apiRoute = InternalRouteEnum.binary_get_account_data
      const errorType = RequestErrorEnum.InvalidRequest
      const header: AppHeader = {
        sender_id: 'sender123',
        tracker_id: 'tracker456',
        verification_data: 'verificationData789',
      }

      // Act
      requestErrorHandler(apiRoute, errorType, header)

      // Assert
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining(apiRoute))
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining(errorType))
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining(header.sender_id))
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining(header.tracker_id))
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining(header.verification_data))
    })

    it('should include custom error log in the message', () => {
      // Arrange
      const apiRoute = InternalRouteEnum.binary_get_account_data
      const errorType = RequestErrorEnum.InvalidRequest
      const header: AppHeader = {
        sender_id: 'sender123',
        tracker_id: 'tracker456',
        verification_data: 'verificationData789',
      }
      const customErrorLog = 'Custom error information'

      // Act
      requestErrorHandler(apiRoute, errorType, header, { customErrorLog })

      // Assert
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining(customErrorLog))
    })

    it('should increment the correct counter in nestedCountersInstance', () => {
      // Arrange
      const apiRoute = InternalRouteEnum.binary_get_account_data
      const errorType = RequestErrorEnum.InvalidRequest
      const header: AppHeader = {
        sender_id: 'sender123',
        tracker_id: 'tracker456',
        verification_data: 'verificationData789',
      }

      // Act
      requestErrorHandler(apiRoute, errorType, header)

      // Assert
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('internal', `${apiRoute}_${errorType}`)
    })

    it('should add custom counter suffix when provided', () => {
      // Arrange
      const apiRoute = InternalRouteEnum.binary_get_account_data
      const errorType = RequestErrorEnum.InvalidRequest
      const header: AppHeader = {
        sender_id: 'sender123',
        tracker_id: 'tracker456',
        verification_data: 'verificationData789',
      }
      const customCounterSuffix = 'custom_suffix'

      // Act
      requestErrorHandler(apiRoute, errorType, header, { customCounterSuffix })

      // Assert
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'internal',
        `${apiRoute}_${errorType}_${customCounterSuffix}`
      )
    })
  })

  describe('estimateBinarySizeOfObject', () => {
    it('should correctly estimate size for number', () => {
      // Act
      const result = estimateBinarySizeOfObject(123)

      // Assert
      expect(result).toBe(8) // 8 bytes for a number
    })

    it('should correctly estimate size for boolean', () => {
      // Act
      const result = estimateBinarySizeOfObject(true)

      // Assert
      expect(result).toBe(1) // 1 byte for a boolean
    })

    it('should correctly estimate size for string', () => {
      // Arrange
      const testString = 'Hello, world!'

      // Act
      const result = estimateBinarySizeOfObject(testString)

      // Assert
      // 2 bytes for length + string length * 2 bytes
      expect(result).toBe(2 + testString.length * 2)
    })

    it('should correctly estimate size for arrays', () => {
      // Arrange
      const numArray = [1, 2, 3]

      // Act
      const result = estimateBinarySizeOfObject(numArray)

      // Assert
      // 2 bytes for array length + 3 elements * 8 bytes each
      expect(result).toBe(2 + 3 * 8)
    })

    it('should correctly estimate size for nested objects', () => {
      // Arrange
      const testObj = {
        num: 123,
        bool: true,
        str: 'test',
      }

      // Act
      const result = estimateBinarySizeOfObject(testObj)

      // Assert
      // 8 (number) + 1 (boolean) + (2 + 4*2) (string)
      expect(result).toBe(8 + 1 + (2 + 4 * 2))
    })

    it('should handle empty objects', () => {
      // Act
      const result = estimateBinarySizeOfObject({})

      // Assert
      expect(result).toBe(0)
    })

    it('should handle empty arrays', () => {
      // Act
      const result = estimateBinarySizeOfObject([])

      // Assert
      expect(result).toBe(0)
    })
  })
})
