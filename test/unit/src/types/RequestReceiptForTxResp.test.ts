import { VectorBufferStream } from '@src/utils/serialization/VectorBufferStream'
import {
  RequestReceiptForTxRespSerialized,
  serializeRequestReceiptForTxResp,
  deserializeRequestReceiptForTxResp,
  cRequestReceiptForTxRespVersion,
} from '@src/types/RequestReceiptForTxResp'
import { TypeIdentifierEnum } from '@src/types/enum/TypeIdentifierEnum'
import { AJVSchemaEnum } from '@src/types/enum/AJVSchemaEnum'
import { serializeSignedReceipt, deserializeSignedReceipt } from '@src/types/SignedReceipt'
import { verifyPayload } from '@src/types/ajv/Helpers'

jest.mock('@src/types/SignedReceipt', () => ({
  serializeSignedReceipt: jest.fn(),
  deserializeSignedReceipt: jest.fn(),
}))

jest.mock('@src/types/ajv/Helpers', () => ({
  verifyPayload: jest.fn(),
}))

describe('RequestReceiptForTxResp', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('serializeRequestReceiptForTxResp', () => {
    it('should serialize with receipt and root=true correctly', () => {
      const mockReceipt = {
        tx: { txId: 'test-tx' },
        sign: { sig: 'test-sig' },
        appliedVote: { vote: 'confirm' },
      }
      const obj: RequestReceiptForTxRespSerialized = {
        receipt: mockReceipt as any,
        note: 'Success message',
        success: true,
      }

      const stream = new VectorBufferStream(0)
      serializeRequestReceiptForTxResp(stream, obj, true)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt16()).toBe(TypeIdentifierEnum.cRequestReceiptForTxResp)
      expect(readStream.readUInt8()).toBe(cRequestReceiptForTxRespVersion)
      expect(readStream.readUInt8()).toBe(1) // has receipt
      expect(readStream.readString()).toBe('Success message')
      expect(readStream.readUInt8()).toBe(1) // success = true

      expect(serializeSignedReceipt).toHaveBeenCalledWith(stream, mockReceipt)
    })

    it('should serialize with null receipt and root=false correctly', () => {
      const obj: RequestReceiptForTxRespSerialized = {
        receipt: null,
        note: 'No receipt available',
        success: false,
      }

      const stream = new VectorBufferStream(0)
      serializeRequestReceiptForTxResp(stream, obj, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(cRequestReceiptForTxRespVersion)
      expect(readStream.readUInt8()).toBe(0) // no receipt
      expect(readStream.readString()).toBe('No receipt available')
      expect(readStream.readUInt8()).toBe(0) // success = false

      expect(serializeSignedReceipt).not.toHaveBeenCalled()
    })

    it('should handle empty note', () => {
      const obj: RequestReceiptForTxRespSerialized = {
        receipt: null,
        note: '',
        success: true,
      }

      const stream = new VectorBufferStream(0)
      serializeRequestReceiptForTxResp(stream, obj, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(cRequestReceiptForTxRespVersion)
      expect(readStream.readUInt8()).toBe(0) // no receipt
      expect(readStream.readString()).toBe('')
      expect(readStream.readUInt8()).toBe(1) // success = true
    })

    it('should handle note with special characters', () => {
      const specialNote = 'Error: Failed to process 💥\nException: 123\t"quoted text"'
      const obj: RequestReceiptForTxRespSerialized = {
        receipt: null,
        note: specialNote,
        success: false,
      }

      const stream = new VectorBufferStream(0)
      serializeRequestReceiptForTxResp(stream, obj, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(cRequestReceiptForTxRespVersion)
      expect(readStream.readUInt8()).toBe(0) // no receipt
      expect(readStream.readString()).toBe(specialNote)
      expect(readStream.readUInt8()).toBe(0) // success = false
    })

    it('should serialize success=true with receipt', () => {
      const mockReceipt = { tx: { txId: 'success-tx' } }
      const obj: RequestReceiptForTxRespSerialized = {
        receipt: mockReceipt as any,
        note: 'Operation completed successfully',
        success: true,
      }

      const stream = new VectorBufferStream(0)
      serializeRequestReceiptForTxResp(stream, obj, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(cRequestReceiptForTxRespVersion)
      expect(readStream.readUInt8()).toBe(1) // has receipt
      expect(readStream.readString()).toBe('Operation completed successfully')
      expect(readStream.readUInt8()).toBe(1) // success = true
    })

    it('should serialize success=false with receipt', () => {
      const mockReceipt = { tx: { txId: 'failed-tx' } }
      const obj: RequestReceiptForTxRespSerialized = {
        receipt: mockReceipt as any,
        note: 'Operation failed but receipt available',
        success: false,
      }

      const stream = new VectorBufferStream(0)
      serializeRequestReceiptForTxResp(stream, obj, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(cRequestReceiptForTxRespVersion)
      expect(readStream.readUInt8()).toBe(1) // has receipt
      expect(readStream.readString()).toBe('Operation failed but receipt available')
      expect(readStream.readUInt8()).toBe(0) // success = false
    })
  })

  describe('deserializeRequestReceiptForTxResp', () => {
    it('should deserialize with receipt correctly', () => {
      const mockReceipt = {
        tx: { txId: 'test-tx' },
        sign: { sig: 'test-sig' },
        appliedVote: { vote: 'confirm' },
      }

      ;(deserializeSignedReceipt as jest.Mock).mockReturnValue(mockReceipt)
      ;(verifyPayload as jest.Mock).mockReturnValue(null) // no errors

      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cRequestReceiptForTxRespVersion)
      stream.writeUInt8(1) // has receipt
      stream.writeString('Success message')
      stream.writeUInt8(1) // success = true

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeRequestReceiptForTxResp(readStream)

      expect(result).toEqual({
        receipt: mockReceipt,
        note: 'Success message',
        success: true,
      })

      expect(deserializeSignedReceipt).toHaveBeenCalledWith(readStream)
      expect(verifyPayload).toHaveBeenCalledWith(AJVSchemaEnum.RequestReceiptForTxResp, {
        receipt: mockReceipt,
        note: 'Success message',
        success: true,
      })
    })

    it('should deserialize with null receipt correctly', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cRequestReceiptForTxRespVersion)
      stream.writeUInt8(0) // no receipt
      stream.writeString('No receipt available')
      stream.writeUInt8(0) // success = false

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeRequestReceiptForTxResp(readStream)

      expect(result).toEqual({
        receipt: null,
        note: 'No receipt available',
        success: false,
      })

      expect(deserializeSignedReceipt).not.toHaveBeenCalled()
      expect(verifyPayload).not.toHaveBeenCalled()
    })

    it('should throw error for version mismatch', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cRequestReceiptForTxRespVersion + 1) // wrong version
      stream.writeUInt8(0)
      stream.writeString('test note')
      stream.writeUInt8(1)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(() => deserializeRequestReceiptForTxResp(readStream)).toThrow('RequestReceiptForTxResp version mismatch')
    })

    it('should throw error for AJV validation failure', () => {
      const mockReceipt = { tx: { txId: 'invalid-tx' } }
      const validationErrors = ['Invalid receipt format', 'Missing required field']

      ;(deserializeSignedReceipt as jest.Mock).mockReturnValue(mockReceipt)
      ;(verifyPayload as jest.Mock).mockReturnValue(validationErrors)

      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cRequestReceiptForTxRespVersion)
      stream.writeUInt8(1) // has receipt
      stream.writeString('Invalid data')
      stream.writeUInt8(1) // success = true

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(() => deserializeRequestReceiptForTxResp(readStream)).toThrow(
        'AJV: validation error -> Invalid receipt format, Missing required field'
      )
    })

    it('should handle success flag with non-1 value as false', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cRequestReceiptForTxRespVersion)
      stream.writeUInt8(0) // no receipt
      stream.writeString('test note')
      stream.writeUInt8(255) // not 1, so false

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeRequestReceiptForTxResp(readStream)

      expect(result).toEqual({
        receipt: null,
        note: 'test note',
        success: false,
      })
    })

    it('should handle empty note', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cRequestReceiptForTxRespVersion)
      stream.writeUInt8(0) // no receipt
      stream.writeString('')
      stream.writeUInt8(1) // success = true

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeRequestReceiptForTxResp(readStream)

      expect(result).toEqual({
        receipt: null,
        note: '',
        success: true,
      })
    })

    it('should handle AJV validation with empty errors array', () => {
      const mockReceipt = { tx: { txId: 'valid-tx' } }

      ;(deserializeSignedReceipt as jest.Mock).mockReturnValue(mockReceipt)
      ;(verifyPayload as jest.Mock).mockReturnValue([]) // empty errors array

      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cRequestReceiptForTxRespVersion)
      stream.writeUInt8(1) // has receipt
      stream.writeString('Valid data')
      stream.writeUInt8(1) // success = true

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeRequestReceiptForTxResp(readStream)

      expect(result).toEqual({
        receipt: mockReceipt,
        note: 'Valid data',
        success: true,
      })
    })
  })

  describe('serialize/deserialize round trip', () => {
    it('should correctly serialize and deserialize with receipt', () => {
      const mockReceipt = {
        tx: { txId: 'round-trip-tx' },
        sign: { sig: 'round-trip-sig' },
      }
      const original: RequestReceiptForTxRespSerialized = {
        receipt: mockReceipt as any,
        note: 'Round trip test',
        success: true,
      }

      ;(deserializeSignedReceipt as jest.Mock).mockReturnValue(mockReceipt)
      ;(verifyPayload as jest.Mock).mockReturnValue(null)

      const stream = new VectorBufferStream(0)
      serializeRequestReceiptForTxResp(stream, original, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const deserialized = deserializeRequestReceiptForTxResp(readStream)

      expect(deserialized).toEqual(original)
    })

    it('should correctly serialize and deserialize with null receipt', () => {
      const original: RequestReceiptForTxRespSerialized = {
        receipt: null,
        note: 'No receipt round trip',
        success: false,
      }

      const stream = new VectorBufferStream(0)
      serializeRequestReceiptForTxResp(stream, original, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const deserialized = deserializeRequestReceiptForTxResp(readStream)

      expect(deserialized).toEqual(original)
    })

    it('should correctly serialize and deserialize with root=true', () => {
      const original: RequestReceiptForTxRespSerialized = {
        receipt: null,
        note: 'Root round trip',
        success: true,
      }

      const stream = new VectorBufferStream(0)
      serializeRequestReceiptForTxResp(stream, original, true)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt16()).toBe(TypeIdentifierEnum.cRequestReceiptForTxResp)
      const deserialized = deserializeRequestReceiptForTxResp(readStream)

      expect(deserialized).toEqual(original)
    })

    it('should handle edge cases in round trip', () => {
      const edgeCases = [
        {
          receipt: null,
          note: '',
          success: false,
        },
        {
          receipt: null,
          note: 'Special chars: 💀🔥\n\t"quotes"',
          success: true,
        },
      ]

      edgeCases.forEach((original) => {
        const stream = new VectorBufferStream(0)
        serializeRequestReceiptForTxResp(stream, original as RequestReceiptForTxRespSerialized, false)

        const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
        const deserialized = deserializeRequestReceiptForTxResp(readStream)

        expect(deserialized).toEqual(original)
      })
    })
  })
})
