import { VectorBufferStream } from '@src/utils/serialization/VectorBufferStream'
import {
  PoqoDataAndReceiptReq,
  serializePoqoDataAndReceiptReq,
  deserializePoqoDataAndReceiptResp,
} from '@src/types/PoqoDataAndReceiptReq'
import { TypeIdentifierEnum } from '@src/types/enum/TypeIdentifierEnum'
import { serializeSignedReceipt, deserializeSignedReceipt } from '@src/types/SignedReceipt'
import { Utils as StringUtils } from '@shardeum-foundation/lib-types'

jest.mock('@src/types/SignedReceipt', () => ({
  serializeSignedReceipt: jest.fn(),
  deserializeSignedReceipt: jest.fn(),
}))

jest.mock('@shardeum-foundation/lib-types', () => ({
  Utils: {
    safeStringify: jest.fn(),
    safeJsonParse: jest.fn(),
  },
}))

describe('PoqoDataAndReceiptReq', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('serializePoqoDataAndReceiptReq', () => {
    it('should serialize with root=true correctly', () => {
      const mockReceipt = { tx: { txId: 'test-tx' }, sign: { sig: 'test-sig' } }
      const obj: PoqoDataAndReceiptReq = {
        finalState: {
          txid: 'test-tx-id',
          stateList: [{
            accountId: 'account1',
            stateId: 'state1',
            data: 'test-data',
            timestamp: 1234567890,
            accountCreated: true,
            isPartial: false
          }],
        },
        receipt: mockReceipt as any,
        txGroupCycle: 12345,
      }

      const mockStateListString = JSON.stringify(obj.finalState.stateList)
      ;(StringUtils.safeStringify as jest.Mock).mockReturnValue(mockStateListString)

      const stream = new VectorBufferStream(0)
      serializePoqoDataAndReceiptReq(stream, obj, true)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt16()).toBe(TypeIdentifierEnum.cPoqoDataAndReceiptReq)
      expect(readStream.readUInt8()).toBe(1) // version
      expect(readStream.readString()).toBe('test-tx-id')
      expect(readStream.readString()).toBe(mockStateListString)
      expect(readStream.readUInt32()).toBe(12345)

      expect(StringUtils.safeStringify).toHaveBeenCalledWith(obj.finalState.stateList)
      expect(serializeSignedReceipt).toHaveBeenCalledWith(stream, mockReceipt)
    })

    it('should serialize with root=false correctly', () => {
      const mockReceipt = { tx: { txId: 'test-tx' }, sign: { sig: 'test-sig' } }
      const obj: PoqoDataAndReceiptReq = {
        finalState: {
          txid: 'test-tx-id',
          stateList: [],
        },
        receipt: mockReceipt as any,
        txGroupCycle: 99999,
      }

      const mockStateListString = '[]'
      ;(StringUtils.safeStringify as jest.Mock).mockReturnValue(mockStateListString)

      const stream = new VectorBufferStream(0)
      serializePoqoDataAndReceiptReq(stream, obj, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(1) // version
      expect(readStream.readString()).toBe('test-tx-id')
      expect(readStream.readString()).toBe(mockStateListString)
      expect(readStream.readUInt32()).toBe(99999)

      expect(StringUtils.safeStringify).toHaveBeenCalledWith(obj.finalState.stateList)
      expect(serializeSignedReceipt).toHaveBeenCalledWith(stream, mockReceipt)
    })

    it('should handle complex stateList', () => {
      const mockReceipt = { tx: { txId: 'test-tx' }, sign: { sig: 'test-sig' } }
      const complexStateList = [
        { 
          accountId: 'account1',
          stateId: 'state1',
          data: { key: 'value1', nested: { prop: 'test' } },
          timestamp: 1234567890,
          accountCreated: true,
          isPartial: false
        },
        { 
          accountId: 'account2',
          stateId: 'state2', 
          data: 'string-data',
          timestamp: 1234567891,
          accountCreated: false,
          isPartial: true
        },
        { 
          accountId: 'account3',
          stateId: 'state3',
          data: null,
          timestamp: 1234567892,
          accountCreated: true,
          isPartial: false
        },
      ]
      const obj: PoqoDataAndReceiptReq = {
        finalState: {
          txid: 'complex-tx-id',
          stateList: complexStateList as any,
        },
        receipt: mockReceipt as any,
        txGroupCycle: 0,
      }

      const mockStateListString = JSON.stringify(complexStateList)
      ;(StringUtils.safeStringify as jest.Mock).mockReturnValue(mockStateListString)

      const stream = new VectorBufferStream(0)
      serializePoqoDataAndReceiptReq(stream, obj, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(1) // version
      expect(readStream.readString()).toBe('complex-tx-id')
      expect(readStream.readString()).toBe(mockStateListString)
      expect(readStream.readUInt32()).toBe(0)

      expect(StringUtils.safeStringify).toHaveBeenCalledWith(complexStateList)
      expect(serializeSignedReceipt).toHaveBeenCalledWith(stream, mockReceipt)
    })

    it('should handle maximum txGroupCycle value', () => {
      const mockReceipt = { tx: { txId: 'test-tx' }, sign: { sig: 'test-sig' } }
      const obj: PoqoDataAndReceiptReq = {
        finalState: {
          txid: 'max-cycle-tx',
          stateList: [],
        },
        receipt: mockReceipt as any,
        txGroupCycle: 4294967295, // Max UInt32
      }

      ;(StringUtils.safeStringify as jest.Mock).mockReturnValue('[]')

      const stream = new VectorBufferStream(0)
      serializePoqoDataAndReceiptReq(stream, obj, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(1) // version
      expect(readStream.readString()).toBe('max-cycle-tx')
      expect(readStream.readString()).toBe('[]')
      expect(readStream.readUInt32()).toBe(4294967295)
    })
  })

  describe('deserializePoqoDataAndReceiptResp', () => {
    it('should deserialize correctly', () => {
      const mockReceipt = { tx: { txId: 'test-tx' }, sign: { sig: 'test-sig' } }
      const mockStateList = [{
        accountId: 'account1',
        stateId: 'state1',
        data: 'test-data',
        timestamp: 1234567890,
        accountCreated: true,
        isPartial: false
      }]
      
      ;(StringUtils.safeJsonParse as jest.Mock).mockReturnValue(mockStateList)
      ;(deserializeSignedReceipt as jest.Mock).mockReturnValue(mockReceipt)

      const stream = new VectorBufferStream(0)
      stream.writeUInt8(1) // version
      stream.writeString('test-tx-id')
      stream.writeString(JSON.stringify(mockStateList))
      stream.writeUInt32(12345)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializePoqoDataAndReceiptResp(readStream)

      expect(result).toEqual({
        finalState: {
          txid: 'test-tx-id',
          stateList: mockStateList,
        },
        receipt: mockReceipt,
        txGroupCycle: 12345,
      })

      expect(StringUtils.safeJsonParse).toHaveBeenCalledWith(JSON.stringify(mockStateList))
      expect(deserializeSignedReceipt).toHaveBeenCalledWith(readStream)
    })

    it('should throw error for version mismatch', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(2) // wrong version
      stream.writeString('test-tx-id')
      stream.writeString('[]')
      stream.writeUInt32(12345)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(() => deserializePoqoDataAndReceiptResp(readStream)).toThrow(
        'PoqoDataAndReceiptReq version mismatch'
      )
    })

    it('should handle empty stateList', () => {
      const mockReceipt = { tx: { txId: 'test-tx' }, sign: { sig: 'test-sig' } }
      
      ;(StringUtils.safeJsonParse as jest.Mock).mockReturnValue([])
      ;(deserializeSignedReceipt as jest.Mock).mockReturnValue(mockReceipt)

      const stream = new VectorBufferStream(0)
      stream.writeUInt8(1) // version
      stream.writeString('empty-state-tx')
      stream.writeString('[]')
      stream.writeUInt32(0)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializePoqoDataAndReceiptResp(readStream)

      expect(result).toEqual({
        finalState: {
          txid: 'empty-state-tx',
          stateList: [],
        },
        receipt: mockReceipt,
        txGroupCycle: 0,
      })

      expect(StringUtils.safeJsonParse).toHaveBeenCalledWith('[]')
    })

    it('should handle complex parsed stateList', () => {
      const mockReceipt = { tx: { txId: 'test-tx' }, sign: { sig: 'test-sig' } }
      const complexStateList = [
        { 
          accountId: 'account1',
          stateId: 'state1',
          data: { complex: { nested: 'object' } },
          timestamp: 1234567890,
          accountCreated: true,
          isPartial: false
        },
        { 
          accountId: 'account2',
          stateId: 'state2',
          data: null,
          timestamp: 1234567891,
          accountCreated: false,
          isPartial: true
        },
      ]
      const serializedStateList = JSON.stringify(complexStateList)
      
      ;(StringUtils.safeJsonParse as jest.Mock).mockReturnValue(complexStateList)
      ;(deserializeSignedReceipt as jest.Mock).mockReturnValue(mockReceipt)

      const stream = new VectorBufferStream(0)
      stream.writeUInt8(1) // version
      stream.writeString('complex-tx')
      stream.writeString(serializedStateList)
      stream.writeUInt32(999)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializePoqoDataAndReceiptResp(readStream)

      expect(result).toEqual({
        finalState: {
          txid: 'complex-tx',
          stateList: complexStateList,
        },
        receipt: mockReceipt,
        txGroupCycle: 999,
      })

      expect(StringUtils.safeJsonParse).toHaveBeenCalledWith(serializedStateList)
    })
  })

  describe('serialize/deserialize round trip', () => {
    it('should correctly serialize and deserialize', () => {
      const mockReceipt = { tx: { txId: 'test-tx' }, sign: { sig: 'test-sig' } }
      const original: PoqoDataAndReceiptReq = {
        finalState: {
          txid: 'round-trip-tx',
          stateList: [{ 
            accountId: 'account1',
            stateId: 'state1',
            data: { test: 'data' },
            timestamp: 1234567890,
            accountCreated: true,
            isPartial: false
          }] as any,
        },
        receipt: mockReceipt as any,
        txGroupCycle: 54321,
      }

      const serializedStateList = JSON.stringify(original.finalState.stateList)
      ;(StringUtils.safeStringify as jest.Mock).mockReturnValue(serializedStateList)
      ;(StringUtils.safeJsonParse as jest.Mock).mockReturnValue(original.finalState.stateList)
      ;(deserializeSignedReceipt as jest.Mock).mockReturnValue(mockReceipt)

      const stream = new VectorBufferStream(0)
      serializePoqoDataAndReceiptReq(stream, original, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const deserialized = deserializePoqoDataAndReceiptResp(readStream)

      expect(deserialized).toEqual(original)
    })

    it('should correctly serialize and deserialize with root=true', () => {
      const mockReceipt = { tx: { txId: 'test-tx' }, sign: { sig: 'test-sig' } }
      const original: PoqoDataAndReceiptReq = {
        finalState: {
          txid: 'root-round-trip',
          stateList: [] as any,
        },
        receipt: mockReceipt as any,
        txGroupCycle: 11111,
      }

      ;(StringUtils.safeStringify as jest.Mock).mockReturnValue('[]')
      ;(StringUtils.safeJsonParse as jest.Mock).mockReturnValue([])
      ;(deserializeSignedReceipt as jest.Mock).mockReturnValue(mockReceipt)

      const stream = new VectorBufferStream(0)
      serializePoqoDataAndReceiptReq(stream, original, true)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt16()).toBe(TypeIdentifierEnum.cPoqoDataAndReceiptReq)
      const deserialized = deserializePoqoDataAndReceiptResp(readStream)

      expect(deserialized).toEqual(original)
    })
  })
})