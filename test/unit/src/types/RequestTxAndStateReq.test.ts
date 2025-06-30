import { VectorBufferStream } from '@src/utils/serialization/VectorBufferStream'
import {
  RequestTxAndStateReq,
  serializeRequestTxAndStateReq,
  deserializeRequestTxAndStateReq,
  cRequestTxAndStateReqVersion,
} from '@src/types/RequestTxAndStateReq'
import { TypeIdentifierEnum } from '@src/types/enum/TypeIdentifierEnum'

describe('RequestTxAndStateReq', () => {
  describe('serializeRequestTxAndStateReq', () => {
    it('should serialize with root=true correctly', () => {
      const obj: RequestTxAndStateReq = {
        txid: 'test-tx-id',
        accountIds: ['account1', 'account2'],
        includeAppReceiptData: true,
      }

      const stream = new VectorBufferStream(0)
      serializeRequestTxAndStateReq(stream, obj, true)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt16()).toBe(TypeIdentifierEnum.cRequestTxAndStateReq)
      expect(readStream.readUInt8()).toBe(cRequestTxAndStateReqVersion)
      expect(readStream.readString()).toBe('test-tx-id')
      expect(readStream.readUInt32()).toBe(2)
      expect(readStream.readString()).toBe('account1')
      expect(readStream.readString()).toBe('account2')
      expect(readStream.readUInt8()).toBe(1)
    })

    it('should serialize with root=false correctly', () => {
      const obj: RequestTxAndStateReq = {
        txid: 'test-tx-id',
        accountIds: ['account1', 'account2'],
        includeAppReceiptData: false,
      }

      const stream = new VectorBufferStream(0)
      serializeRequestTxAndStateReq(stream, obj, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(cRequestTxAndStateReqVersion)
      expect(readStream.readString()).toBe('test-tx-id')
      expect(readStream.readUInt32()).toBe(2)
      expect(readStream.readString()).toBe('account1')
      expect(readStream.readString()).toBe('account2')
      expect(readStream.readUInt8()).toBe(0)
    })

    it('should serialize empty accountIds array', () => {
      const obj: RequestTxAndStateReq = {
        txid: 'test-tx-id',
        accountIds: [],
        includeAppReceiptData: true,
      }

      const stream = new VectorBufferStream(0)
      serializeRequestTxAndStateReq(stream, obj, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(cRequestTxAndStateReqVersion)
      expect(readStream.readString()).toBe('test-tx-id')
      expect(readStream.readUInt32()).toBe(0)
      expect(readStream.readUInt8()).toBe(1)
    })

    it('should serialize with undefined includeAppReceiptData as false', () => {
      const obj: RequestTxAndStateReq = {
        txid: 'test-tx-id',
        accountIds: ['account1'],
      }

      const stream = new VectorBufferStream(0)
      serializeRequestTxAndStateReq(stream, obj, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(cRequestTxAndStateReqVersion)
      expect(readStream.readString()).toBe('test-tx-id')
      expect(readStream.readUInt32()).toBe(1)
      expect(readStream.readString()).toBe('account1')
      expect(readStream.readUInt8()).toBe(0)
    })

    it('should handle large number of accountIds', () => {
      const accountIds = Array.from({ length: 100 }, (_, i) => `account${i}`)
      const obj: RequestTxAndStateReq = {
        txid: 'test-tx-id',
        accountIds,
        includeAppReceiptData: true,
      }

      const stream = new VectorBufferStream(0)
      serializeRequestTxAndStateReq(stream, obj, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(cRequestTxAndStateReqVersion)
      expect(readStream.readString()).toBe('test-tx-id')
      expect(readStream.readUInt32()).toBe(100)
      for (let i = 0; i < 100; i++) {
        expect(readStream.readString()).toBe(`account${i}`)
      }
      expect(readStream.readUInt8()).toBe(1)
    })

    it('should handle special characters in txid and accountIds', () => {
      const obj: RequestTxAndStateReq = {
        txid: 'test-tx-id-!@#$%^&*()',
        accountIds: ['account-with-special-chars-😀', 'account2'],
        includeAppReceiptData: true,
      }

      const stream = new VectorBufferStream(0)
      serializeRequestTxAndStateReq(stream, obj, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(cRequestTxAndStateReqVersion)
      expect(readStream.readString()).toBe('test-tx-id-!@#$%^&*()')
      expect(readStream.readUInt32()).toBe(2)
      expect(readStream.readString()).toBe('account-with-special-chars-😀')
      expect(readStream.readString()).toBe('account2')
      expect(readStream.readUInt8()).toBe(1)
    })
  })

  describe('deserializeRequestTxAndStateReq', () => {
    it('should deserialize correctly with includeAppReceiptData=true', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cRequestTxAndStateReqVersion)
      stream.writeString('test-tx-id')
      stream.writeUInt32(2)
      stream.writeString('account1')
      stream.writeString('account2')
      stream.writeUInt8(1)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeRequestTxAndStateReq(readStream)

      expect(result).toEqual({
        txid: 'test-tx-id',
        accountIds: ['account1', 'account2'],
        includeAppReceiptData: true,
      })
    })

    it('should deserialize correctly with includeAppReceiptData=false', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cRequestTxAndStateReqVersion)
      stream.writeString('test-tx-id')
      stream.writeUInt32(2)
      stream.writeString('account1')
      stream.writeString('account2')
      stream.writeUInt8(0)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeRequestTxAndStateReq(readStream)

      expect(result).toEqual({
        txid: 'test-tx-id',
        accountIds: ['account1', 'account2'],
        includeAppReceiptData: false,
      })
    })

    it('should deserialize empty accountIds array', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cRequestTxAndStateReqVersion)
      stream.writeString('test-tx-id')
      stream.writeUInt32(0)
      stream.writeUInt8(1)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeRequestTxAndStateReq(readStream)

      expect(result).toEqual({
        txid: 'test-tx-id',
        accountIds: [],
        includeAppReceiptData: true,
      })
    })

    it('should throw error for version mismatch', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cRequestTxAndStateReqVersion + 1) // Higher version
      stream.writeString('test-tx-id')
      stream.writeUInt32(0)
      stream.writeUInt8(1)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(() => deserializeRequestTxAndStateReq(readStream)).toThrow(
        'cRequestTxAndStateReqVersion version mismatch'
      )
    })

    it('should handle large number of accountIds', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cRequestTxAndStateReqVersion)
      stream.writeString('test-tx-id')
      stream.writeUInt32(100)
      for (let i = 0; i < 100; i++) {
        stream.writeString(`account${i}`)
      }
      stream.writeUInt8(1)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeRequestTxAndStateReq(readStream)

      expect(result.txid).toBe('test-tx-id')
      expect(result.accountIds).toHaveLength(100)
      for (let i = 0; i < 100; i++) {
        expect(result.accountIds[i]).toBe(`account${i}`)
      }
      expect(result.includeAppReceiptData).toBe(true)
    })

    it('should handle any non-1 value as false for includeAppReceiptData', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cRequestTxAndStateReqVersion)
      stream.writeString('test-tx-id')
      stream.writeUInt32(1)
      stream.writeString('account1')
      stream.writeUInt8(255) // Any value other than 1

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeRequestTxAndStateReq(readStream)

      expect(result).toEqual({
        txid: 'test-tx-id',
        accountIds: ['account1'],
        includeAppReceiptData: false,
      })
    })
  })

  describe('serialize/deserialize round trip', () => {
    it('should correctly serialize and deserialize with all fields', () => {
      const original: RequestTxAndStateReq = {
        txid: 'test-tx-id-123',
        accountIds: ['acc1', 'acc2', 'acc3'],
        includeAppReceiptData: true,
      }

      const stream = new VectorBufferStream(0)
      serializeRequestTxAndStateReq(stream, original, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const deserialized = deserializeRequestTxAndStateReq(readStream)

      expect(deserialized).toEqual(original)
    })

    it('should correctly serialize and deserialize with optional field undefined', () => {
      const original: RequestTxAndStateReq = {
        txid: 'test-tx-id-456',
        accountIds: ['acc1'],
      }

      const stream = new VectorBufferStream(0)
      serializeRequestTxAndStateReq(stream, original, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const deserialized = deserializeRequestTxAndStateReq(readStream)

      expect(deserialized).toEqual({
        txid: 'test-tx-id-456',
        accountIds: ['acc1'],
        includeAppReceiptData: false,
      })
    })

    it('should correctly serialize and deserialize with root=true', () => {
      const original: RequestTxAndStateReq = {
        txid: 'test-tx-id-789',
        accountIds: ['acc1', 'acc2'],
        includeAppReceiptData: false,
      }

      const stream = new VectorBufferStream(0)
      serializeRequestTxAndStateReq(stream, original, true)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt16()).toBe(TypeIdentifierEnum.cRequestTxAndStateReq)
      const deserialized = deserializeRequestTxAndStateReq(readStream)

      expect(deserialized).toEqual(original)
    })
  })
})