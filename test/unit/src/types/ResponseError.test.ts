import { VectorBufferStream } from '@src/utils/serialization/VectorBufferStream'
import {
  ResponseError,
  serializeResponseError,
  deserializeResponseError,
  cResponseErrorVersion,
  InternalError,
  BadRequest,
  NotFound,
} from '@src/types/ResponseError'
import { ResponseErrorEnum } from '@src/types/enum/ResponseErrorEnum'
import { TypeIdentifierEnum } from '@src/types/enum/TypeIdentifierEnum'

describe('ResponseError', () => {
  describe('ResponseError class', () => {
    it('should create instance with correct properties', () => {
      const error = new ResponseError(ResponseErrorEnum.BadRequest, 123, 'Test error message')

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(ResponseError)
      expect(error.Code).toBe(ResponseErrorEnum.BadRequest)
      expect(error.AppCode).toBe(123)
      expect(error.Message).toBe('Test error message')
      expect(error.message).toBe('Code: 2, AppCode: 123, Message: Test error message')
    })

    it('should handle different error codes', () => {
      const errors = [
        new ResponseError(ResponseErrorEnum.InternalError, 1, 'Internal error'),
        new ResponseError(ResponseErrorEnum.Unauthorized, 2, 'Unauthorized'),
        new ResponseError(ResponseErrorEnum.Forbidden, 3, 'Forbidden'),
        new ResponseError(ResponseErrorEnum.NotFound, 4, 'Not found'),
      ]

      expect(errors[0].Code).toBe(ResponseErrorEnum.InternalError)
      expect(errors[1].Code).toBe(ResponseErrorEnum.Unauthorized)
      expect(errors[2].Code).toBe(ResponseErrorEnum.Forbidden)
      expect(errors[3].Code).toBe(ResponseErrorEnum.NotFound)
    })

    it('should handle zero AppCode', () => {
      const error = new ResponseError(ResponseErrorEnum.InternalError, 0, 'Zero app code')
      expect(error.AppCode).toBe(0)
    })

    it('should handle empty message', () => {
      const error = new ResponseError(ResponseErrorEnum.BadRequest, 100, '')
      expect(error.Message).toBe('')
      expect(error.message).toBe('Code: 2, AppCode: 100, Message: ')
    })

    it('should handle negative AppCode', () => {
      const error = new ResponseError(ResponseErrorEnum.Forbidden, -999, 'Negative code')
      expect(error.AppCode).toBe(-999)
    })
  })

  describe('serializeResponseError', () => {
    it('should serialize with root=true correctly', () => {
      const error = new ResponseError(ResponseErrorEnum.BadRequest, 123, 'Test error')
      const stream = new VectorBufferStream(0)
      serializeResponseError(stream, error, true)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt16()).toBe(TypeIdentifierEnum.cResponseError)
      expect(readStream.readUInt8()).toBe(cResponseErrorVersion)
      expect(readStream.readInt32()).toBe(ResponseErrorEnum.BadRequest)
      expect(readStream.readInt32()).toBe(123)
      expect(readStream.readString()).toBe('Test error')
    })

    it('should serialize with root=false correctly', () => {
      const error = new ResponseError(ResponseErrorEnum.NotFound, 404, 'Resource not found')
      const stream = new VectorBufferStream(0)
      serializeResponseError(stream, error, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(cResponseErrorVersion)
      expect(readStream.readInt32()).toBe(ResponseErrorEnum.NotFound)
      expect(readStream.readInt32()).toBe(404)
      expect(readStream.readString()).toBe('Resource not found')
    })

    it('should handle negative values correctly', () => {
      const error = new ResponseError(ResponseErrorEnum.InternalError, -2147483648, 'Min int32')
      const stream = new VectorBufferStream(0)
      serializeResponseError(stream, error, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(cResponseErrorVersion)
      expect(readStream.readInt32()).toBe(ResponseErrorEnum.InternalError)
      expect(readStream.readInt32()).toBe(-2147483648)
      expect(readStream.readString()).toBe('Min int32')
    })

    it('should handle max int32 values', () => {
      const error = new ResponseError(ResponseErrorEnum.Forbidden, 2147483647, 'Max int32')
      const stream = new VectorBufferStream(0)
      serializeResponseError(stream, error, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(cResponseErrorVersion)
      expect(readStream.readInt32()).toBe(ResponseErrorEnum.Forbidden)
      expect(readStream.readInt32()).toBe(2147483647)
      expect(readStream.readString()).toBe('Max int32')
    })

    it('should handle special characters in message', () => {
      const error = new ResponseError(ResponseErrorEnum.BadRequest, 100, 'Special chars: 💀🔥\n\t"quotes"')
      const stream = new VectorBufferStream(0)
      serializeResponseError(stream, error, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(cResponseErrorVersion)
      expect(readStream.readInt32()).toBe(ResponseErrorEnum.BadRequest)
      expect(readStream.readInt32()).toBe(100)
      expect(readStream.readString()).toBe('Special chars: 💀🔥\n\t"quotes"')
    })
  })

  describe('deserializeResponseError', () => {
    it('should deserialize correctly', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cResponseErrorVersion)
      stream.writeInt32(ResponseErrorEnum.Unauthorized)
      stream.writeInt32(401)
      stream.writeString('Unauthorized access')

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const error = deserializeResponseError(readStream)

      expect(error).toBeInstanceOf(ResponseError)
      expect(error.Code).toBe(ResponseErrorEnum.Unauthorized)
      expect(error.AppCode).toBe(401)
      expect(error.Message).toBe('Unauthorized access')
    })

    it('should throw error for version mismatch', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cResponseErrorVersion + 1) // Higher version
      stream.writeInt32(ResponseErrorEnum.BadRequest)
      stream.writeInt32(400)
      stream.writeString('Bad request')

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(() => deserializeResponseError(readStream)).toThrow('ResponseError version mismatch')
    })

    it('should handle zero values', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cResponseErrorVersion)
      stream.writeInt32(0) // Code 0 (not a valid enum but should still work)
      stream.writeInt32(0)
      stream.writeString('')

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const error = deserializeResponseError(readStream)

      expect(error.Code).toBe(0)
      expect(error.AppCode).toBe(0)
      expect(error.Message).toBe('')
    })

    it('should handle negative values', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cResponseErrorVersion)
      stream.writeInt32(ResponseErrorEnum.InternalError)
      stream.writeInt32(-999)
      stream.writeString('Negative app code')

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const error = deserializeResponseError(readStream)

      expect(error.Code).toBe(ResponseErrorEnum.InternalError)
      expect(error.AppCode).toBe(-999)
      expect(error.Message).toBe('Negative app code')
    })
  })

  describe('serialize/deserialize round trip', () => {
    it('should correctly serialize and deserialize', () => {
      const original = new ResponseError(ResponseErrorEnum.NotFound, 404, 'Page not found')

      const stream = new VectorBufferStream(0)
      serializeResponseError(stream, original, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const deserialized = deserializeResponseError(readStream)

      expect(deserialized.Code).toBe(original.Code)
      expect(deserialized.AppCode).toBe(original.AppCode)
      expect(deserialized.Message).toBe(original.Message)
    })

    it('should correctly serialize and deserialize with root=true', () => {
      const original = new ResponseError(ResponseErrorEnum.Forbidden, 403, 'Access denied')

      const stream = new VectorBufferStream(0)
      serializeResponseError(stream, original, true)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt16()).toBe(TypeIdentifierEnum.cResponseError)
      const deserialized = deserializeResponseError(readStream)

      expect(deserialized.Code).toBe(original.Code)
      expect(deserialized.AppCode).toBe(original.AppCode)
      expect(deserialized.Message).toBe(original.Message)
    })

    it('should handle all error codes in round trip', () => {
      const errorCodes = [
        ResponseErrorEnum.InternalError,
        ResponseErrorEnum.BadRequest,
        ResponseErrorEnum.Unauthorized,
        ResponseErrorEnum.Forbidden,
        ResponseErrorEnum.NotFound,
      ]

      errorCodes.forEach((code, index) => {
        const original = new ResponseError(code, index * 100, `Error message ${index}`)

        const stream = new VectorBufferStream(0)
        serializeResponseError(stream, original, false)

        const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
        const deserialized = deserializeResponseError(readStream)

        expect(deserialized.Code).toBe(original.Code)
        expect(deserialized.AppCode).toBe(original.AppCode)
        expect(deserialized.Message).toBe(original.Message)
      })
    })
  })

  describe('helper functions', () => {
    describe('InternalError', () => {
      it('should create InternalError with default appCode', () => {
        const error = InternalError('Internal server error')
        expect(error).toBeInstanceOf(ResponseError)
        expect(error.Code).toBe(ResponseErrorEnum.InternalError)
        expect(error.AppCode).toBe(0)
        expect(error.Message).toBe('Internal server error')
      })

      it('should create InternalError with custom appCode', () => {
        const error = InternalError('Database connection failed', 500)
        expect(error.Code).toBe(ResponseErrorEnum.InternalError)
        expect(error.AppCode).toBe(500)
        expect(error.Message).toBe('Database connection failed')
      })
    })

    describe('BadRequest', () => {
      it('should create BadRequest with default appCode', () => {
        const error = BadRequest('Invalid input')
        expect(error).toBeInstanceOf(ResponseError)
        expect(error.Code).toBe(ResponseErrorEnum.BadRequest)
        expect(error.AppCode).toBe(0)
        expect(error.Message).toBe('Invalid input')
      })

      it('should create BadRequest with custom appCode', () => {
        const error = BadRequest('Missing required field', 4001)
        expect(error.Code).toBe(ResponseErrorEnum.BadRequest)
        expect(error.AppCode).toBe(4001)
        expect(error.Message).toBe('Missing required field')
      })
    })

    describe('NotFound', () => {
      it('should create NotFound with default appCode', () => {
        const error = NotFound('Resource not found')
        expect(error).toBeInstanceOf(ResponseError)
        expect(error.Code).toBe(ResponseErrorEnum.NotFound)
        expect(error.AppCode).toBe(0)
        expect(error.Message).toBe('Resource not found')
      })

      it('should create NotFound with custom appCode', () => {
        const error = NotFound('User not found', 4041)
        expect(error.Code).toBe(ResponseErrorEnum.NotFound)
        expect(error.AppCode).toBe(4041)
        expect(error.Message).toBe('User not found')
      })
    })
  })
})
