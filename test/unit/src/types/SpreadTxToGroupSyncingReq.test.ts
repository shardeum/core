import { VectorBufferStream } from '@src/utils/serialization/VectorBufferStream'
import {
  SpreadTxToGroupSyncingReq,
  serializeSpreadTxToGroupSyncingReq,
  deserializeSpreadTxToGroupSyncingReq,
} from '@src/types/SpreadTxToGroupSyncingReq'
import { TypeIdentifierEnum } from '@src/types/enum/TypeIdentifierEnum'
import { AppObjEnum } from '@src/shardus/shardus-types'
import { Utils } from '@shardeum-foundation/lib-types'

// Mock the Context module
jest.mock('@src/p2p/Context', () => ({
  stateManager: {
    app: {
      binarySerializeObject: jest.fn(),
      binaryDeserializeObject: jest.fn(),
    },
  },
}))

// Mock Utils
jest.mock('@shardeum-foundation/lib-types', () => ({
  Utils: {
    safeStringify: jest.fn(),
    safeJsonParse: jest.fn(),
  },
}))

const mockStateManager = require('@src/p2p/Context').stateManager

describe('SpreadTxToGroupSyncingReq', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('serializeSpreadTxToGroupSyncingReq', () => {
    it('should serialize with root=true correctly', () => {
      const mockKeys = { sourceKeys: ['key1'], targetKeys: ['key2'], allKeys: ['key1', 'key2'] }
      const mockData = { txData: 'test', timestamp: 1234567890 }
      const mockAppData = { appField: 'appValue' }
      const mockPatterns = { ro: ['pattern1'], rw: ['pattern2'], wo: [], on: [], ri: [] }
      const mockSerializedAppData = Buffer.from('serialized-app-data')

      const obj: SpreadTxToGroupSyncingReq = {
        timestamp: 1234567890123,
        txId: 'test-tx-id',
        keys: mockKeys as any,
        data: mockData as any,
        appData: mockAppData,
        shardusMemoryPatterns: mockPatterns,
      }

      ;(Utils.safeStringify as jest.Mock).mockImplementation((data) => JSON.stringify(data))
      ;(mockStateManager.app.binarySerializeObject as jest.Mock).mockReturnValue(mockSerializedAppData)

      const stream = new VectorBufferStream(0)
      serializeSpreadTxToGroupSyncingReq(stream, obj, true)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt16()).toBe(TypeIdentifierEnum.cSpreadTxToGroupSyncingReq)
      expect(readStream.readUInt8()).toBe(1) // version
      expect(readStream.readBigUInt64()).toBe(BigInt(1234567890123))
      expect(readStream.readString()).toBe('test-tx-id')
      expect(readStream.readString()).toBe(JSON.stringify(mockKeys))
      expect(readStream.readString()).toBe(JSON.stringify(mockData))
      expect(readStream.readBuffer()).toEqual(mockSerializedAppData)
      expect(readStream.readString()).toBe(JSON.stringify(mockPatterns))

      expect(Utils.safeStringify).toHaveBeenCalledWith(mockKeys)
      expect(Utils.safeStringify).toHaveBeenCalledWith(mockData)
      expect(Utils.safeStringify).toHaveBeenCalledWith(mockPatterns)
      expect(mockStateManager.app.binarySerializeObject).toHaveBeenCalledWith(AppObjEnum.AppData, mockAppData)
    })

    it('should serialize with root=false correctly', () => {
      const obj: SpreadTxToGroupSyncingReq = {
        timestamp: 9876543210000,
        txId: 'another-tx-id',
        keys: { sourceKeys: [], targetKeys: [], allKeys: [] } as any,
        data: { tx: 'data' } as any,
        appData: null,
        shardusMemoryPatterns: { ro: [], rw: [], wo: [], on: [], ri: [] },
      }

      ;(Utils.safeStringify as jest.Mock).mockImplementation((data) => JSON.stringify(data))
      ;(mockStateManager.app.binarySerializeObject as jest.Mock).mockReturnValue(Buffer.from(''))

      const stream = new VectorBufferStream(0)
      serializeSpreadTxToGroupSyncingReq(stream, obj, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(1) // version
      expect(readStream.readBigUInt64()).toBe(BigInt(9876543210000))
      expect(readStream.readString()).toBe('another-tx-id')
    })

    it('should handle empty patterns', () => {
      const obj: SpreadTxToGroupSyncingReq = {
        timestamp: 1000,
        txId: 'empty-patterns-tx',
        keys: {} as any,
        data: {} as any,
        appData: {},
        shardusMemoryPatterns: { ro: [], rw: [], wo: [], on: [], ri: [] },
      }

      ;(Utils.safeStringify as jest.Mock).mockImplementation((data) => JSON.stringify(data))
      ;(mockStateManager.app.binarySerializeObject as jest.Mock).mockReturnValue(Buffer.from('test'))

      const stream = new VectorBufferStream(0)
      serializeSpreadTxToGroupSyncingReq(stream, obj, false)

      expect(Utils.safeStringify).toHaveBeenCalledWith(obj.shardusMemoryPatterns)
    })

    it('should handle complex app data', () => {
      const complexAppData = {
        nested: {
          deep: {
            value: 'test',
            array: [1, 2, 3],
          },
        },
      }
      const obj: SpreadTxToGroupSyncingReq = {
        timestamp: 555555,
        txId: 'complex-app-data-tx',
        keys: {} as any,
        data: {} as any,
        appData: complexAppData,
        shardusMemoryPatterns: { ro: ['r1'], rw: ['rw1'], wo: ['w1'], on: ['o1'], ri: ['ri1'] },
      }

      const mockBuffer = Buffer.from('complex-serialized-data')
      ;(Utils.safeStringify as jest.Mock).mockImplementation((data) => JSON.stringify(data))
      ;(mockStateManager.app.binarySerializeObject as jest.Mock).mockReturnValue(mockBuffer)

      const stream = new VectorBufferStream(0)
      serializeSpreadTxToGroupSyncingReq(stream, obj, false)

      expect(mockStateManager.app.binarySerializeObject).toHaveBeenCalledWith(AppObjEnum.AppData, complexAppData)
    })
  })

  describe('deserializeSpreadTxToGroupSyncingReq', () => {
    it('should deserialize correctly', () => {
      const mockKeys = { sourceKeys: ['key1'], targetKeys: ['key2'], allKeys: ['key1', 'key2'] }
      const mockData = { txData: 'test', timestamp: 1234567890 }
      const mockAppData = { appField: 'appValue' }
      const mockPatterns = { ro: ['pattern1'], rw: ['pattern2'], wo: [], on: [], ri: [] }
      const mockSerializedAppData = Buffer.from('serialized-app-data')

      ;(Utils.safeJsonParse as jest.Mock).mockImplementation((str) => JSON.parse(str))
      ;(mockStateManager.app.binaryDeserializeObject as jest.Mock).mockReturnValue(mockAppData)

      const stream = new VectorBufferStream(0)
      stream.writeUInt8(1) // version
      stream.writeBigUInt64(BigInt(1234567890123))
      stream.writeString('test-tx-id')
      stream.writeString(JSON.stringify(mockKeys))
      stream.writeString(JSON.stringify(mockData))
      stream.writeBuffer(mockSerializedAppData)
      stream.writeString(JSON.stringify(mockPatterns))

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeSpreadTxToGroupSyncingReq(readStream)

      expect(result).toEqual({
        timestamp: 1234567890123,
        txId: 'test-tx-id',
        keys: mockKeys,
        data: mockData,
        appData: mockAppData,
        shardusMemoryPatterns: mockPatterns,
      })

      expect(Utils.safeJsonParse).toHaveBeenCalledWith(JSON.stringify(mockKeys))
      expect(Utils.safeJsonParse).toHaveBeenCalledWith(JSON.stringify(mockData))
      expect(Utils.safeJsonParse).toHaveBeenCalledWith(JSON.stringify(mockPatterns))
      expect(mockStateManager.app.binaryDeserializeObject).toHaveBeenCalledWith(
        AppObjEnum.AppData,
        mockSerializedAppData
      )
    })

    it('should throw error for version mismatch', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(2) // wrong version
      stream.writeBigUInt64(BigInt(1234567890123))
      stream.writeString('test-tx-id')

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(() => deserializeSpreadTxToGroupSyncingReq(readStream)).toThrow(
        'SpreadTxToGroupSyncingReq Unsupported version'
      )
    })

    it('should handle empty data', () => {
      ;(Utils.safeJsonParse as jest.Mock).mockImplementation((str) => JSON.parse(str))
      ;(mockStateManager.app.binaryDeserializeObject as jest.Mock).mockReturnValue(null)

      const stream = new VectorBufferStream(0)
      stream.writeUInt8(1) // version
      stream.writeBigUInt64(BigInt(0))
      stream.writeString('')
      stream.writeString('{}')
      stream.writeString('{}')
      stream.writeBuffer(Buffer.from(''))
      stream.writeString('{"ro":[],"rw":[],"wo":[],"on":[],"ri":[]}')

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeSpreadTxToGroupSyncingReq(readStream)

      expect(result).toEqual({
        timestamp: 0,
        txId: '',
        keys: {},
        data: {},
        appData: null,
        shardusMemoryPatterns: { ro: [], rw: [], wo: [], on: [], ri: [] },
      })
    })

    it('should handle maximum timestamp value', () => {
      const maxTimestamp = Number.MAX_SAFE_INTEGER
      ;(Utils.safeJsonParse as jest.Mock).mockImplementation(() => ({}))
      ;(mockStateManager.app.binaryDeserializeObject as jest.Mock).mockReturnValue({})

      const stream = new VectorBufferStream(0)
      stream.writeUInt8(1) // version
      stream.writeBigUInt64(BigInt(maxTimestamp))
      stream.writeString('max-timestamp-tx')
      stream.writeString('{}')
      stream.writeString('{}')
      stream.writeBuffer(Buffer.from(''))
      stream.writeString('{"ro":[],"rw":[],"wo":[],"on":[],"ri":[]}')

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeSpreadTxToGroupSyncingReq(readStream)

      expect(result.timestamp).toBe(maxTimestamp)
      expect(result.txId).toBe('max-timestamp-tx')
    })
  })

  describe('serialize/deserialize round trip', () => {
    it('should correctly serialize and deserialize', () => {
      const original: SpreadTxToGroupSyncingReq = {
        timestamp: 1234567890123,
        txId: 'round-trip-tx',
        keys: { sourceKeys: ['src1'], targetKeys: ['tgt1'], allKeys: ['src1', 'tgt1'] } as any,
        data: { tx: { field: 'value' }, timestamp: 12345 } as any,
        appData: { app: 'data' },
        shardusMemoryPatterns: { ro: ['read'], rw: ['readwrite'], wo: ['write'], on: [], ri: [] },
      }

      const mockSerializedAppData = Buffer.from('app-data-buffer')
      ;(Utils.safeStringify as jest.Mock).mockImplementation((data) => JSON.stringify(data))
      ;(Utils.safeJsonParse as jest.Mock).mockImplementation((str) => JSON.parse(str))
      ;(mockStateManager.app.binarySerializeObject as jest.Mock).mockReturnValue(mockSerializedAppData)
      ;(mockStateManager.app.binaryDeserializeObject as jest.Mock).mockReturnValue(original.appData)

      const stream = new VectorBufferStream(0)
      serializeSpreadTxToGroupSyncingReq(stream, original, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const deserialized = deserializeSpreadTxToGroupSyncingReq(readStream)

      expect(deserialized).toEqual(original)
    })

    it('should correctly serialize and deserialize with root=true', () => {
      const original: SpreadTxToGroupSyncingReq = {
        timestamp: 9999999999999,
        txId: 'root-round-trip',
        keys: {} as any,
        data: {} as any,
        appData: { complex: { nested: { object: true } } },
        shardusMemoryPatterns: { ro: [], rw: [], wo: [], on: [], ri: [] },
      }

      const mockSerializedAppData = Buffer.from('complex-app-data')
      ;(Utils.safeStringify as jest.Mock).mockImplementation((data) => JSON.stringify(data))
      ;(Utils.safeJsonParse as jest.Mock).mockImplementation((str) => JSON.parse(str))
      ;(mockStateManager.app.binarySerializeObject as jest.Mock).mockReturnValue(mockSerializedAppData)
      ;(mockStateManager.app.binaryDeserializeObject as jest.Mock).mockReturnValue(original.appData)

      const stream = new VectorBufferStream(0)
      serializeSpreadTxToGroupSyncingReq(stream, original, true)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt16()).toBe(TypeIdentifierEnum.cSpreadTxToGroupSyncingReq)
      const deserialized = deserializeSpreadTxToGroupSyncingReq(readStream)

      expect(deserialized).toEqual(original)
    })
  })
})
