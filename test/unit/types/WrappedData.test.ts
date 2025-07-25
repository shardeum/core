import {
  serializeWrappedData,
  deserializeWrappedData,
  WrappedData,
  cWrappedDataVersion,
} from '../../../src/types/WrappedData'
import { VectorBufferStream } from '../../../src/utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from '../../../src/types/enum/TypeIdentifierEnum'
import { Utils } from '@shardeum-foundation/lib-types'
import { AppObjEnum } from '../../../src/types/enum/AppObjEnum'

// Mock the stateManager
jest.mock('../../../src/p2p/Context', () => ({
  stateManager: {
    app: {
      binarySerializeObject: jest.fn(),
      binaryDeserializeObject: jest.fn(),
    },
  },
}))

const { stateManager } = require('../../../src/p2p/Context')

describe('WrappedData', () => {
  let mockStream: VectorBufferStream

  beforeEach(() => {
    jest.clearAllMocks()
    mockStream = {
      writeUInt16: jest.fn(),
      writeUInt8: jest.fn(),
      writeString: jest.fn(),
      writeBuffer: jest.fn(),
      writeBigUInt64: jest.fn(),
      readUInt8: jest.fn(),
      readString: jest.fn(),
      readBuffer: jest.fn(),
      readBigUInt64: jest.fn(),
    } as unknown as VectorBufferStream
  })

  describe('serializeWrappedData', () => {
    const mockData: WrappedData = {
      accountId: 'acc123',
      stateId: 'state456',
      data: { someField: 'someValue' },
      timestamp: 1234567890,
    }

    it('should serialize without root flag and without syncData', () => {
      const mockSerializedData = Buffer.from('serialized data')
      stateManager.app.binarySerializeObject.mockReturnValue(mockSerializedData)

      serializeWrappedData(mockStream, mockData, false)

      expect(mockStream.writeUInt16).not.toHaveBeenCalled()
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(cWrappedDataVersion)
      expect(mockStream.writeString).toHaveBeenCalledWith('acc123')
      expect(mockStream.writeString).toHaveBeenCalledWith('state456')
      expect(stateManager.app.binarySerializeObject).toHaveBeenCalledWith(AppObjEnum.AppData, mockData.data)
      expect(mockStream.writeBuffer).toHaveBeenCalledWith(mockSerializedData)
      expect(mockStream.writeBigUInt64).toHaveBeenCalledWith(BigInt(1234567890))
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(0) // No syncData
    })

    it('should serialize with root flag', () => {
      const mockSerializedData = Buffer.from('serialized data')
      stateManager.app.binarySerializeObject.mockReturnValue(mockSerializedData)

      serializeWrappedData(mockStream, mockData, true)

      expect(mockStream.writeUInt16).toHaveBeenCalledWith(TypeIdentifierEnum.cWrappedData)
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(cWrappedDataVersion)
    })

    it('should serialize with syncData', () => {
      const mockSerializedData = Buffer.from('serialized data')
      stateManager.app.binarySerializeObject.mockReturnValue(mockSerializedData)

      const dataWithSync: WrappedData = {
        ...mockData,
        syncData: { syncField: 'syncValue', nested: { value: 123 } },
      }

      serializeWrappedData(mockStream, dataWithSync)

      expect(mockStream.writeUInt8).toHaveBeenNthCalledWith(2, 1) // Has syncData
      expect(mockStream.writeString).toHaveBeenCalledWith(Utils.safeStringify(dataWithSync.syncData))
    })

    it('should handle empty string fields', () => {
      const mockSerializedData = Buffer.from('serialized data')
      stateManager.app.binarySerializeObject.mockReturnValue(mockSerializedData)

      const dataWithEmptyStrings: WrappedData = {
        accountId: '',
        stateId: '',
        data: {},
        timestamp: 0,
      }

      serializeWrappedData(mockStream, dataWithEmptyStrings)

      expect(mockStream.writeString).toHaveBeenCalledWith('')
      expect(mockStream.writeString).toHaveBeenCalledWith('')
      expect(mockStream.writeBigUInt64).toHaveBeenCalledWith(BigInt(0))
    })

    it('should serialize fields in correct order', () => {
      const mockSerializedData = Buffer.from('serialized data')
      stateManager.app.binarySerializeObject.mockReturnValue(mockSerializedData)

      serializeWrappedData(mockStream, mockData)

      // Verify the basic order by checking what was called
      expect(mockStream.writeUInt8).toHaveBeenCalledTimes(2) // version and syncData flag
      expect(mockStream.writeString).toHaveBeenCalledTimes(2) // accountId and stateId
      expect(mockStream.writeBuffer).toHaveBeenCalledTimes(1)
      expect(mockStream.writeBigUInt64).toHaveBeenCalledTimes(1)

      // Check the actual values to ensure correct order
      expect(mockStream.writeString).toHaveBeenNthCalledWith(1, 'acc123')
      expect(mockStream.writeString).toHaveBeenNthCalledWith(2, 'state456')
      expect(mockStream.writeUInt8).toHaveBeenNthCalledWith(1, cWrappedDataVersion)
      expect(mockStream.writeUInt8).toHaveBeenNthCalledWith(2, 0) // no syncData
    })
  })

  describe('deserializeWrappedData', () => {
    beforeEach(() => {
      stateManager.app.binaryDeserializeObject.mockReturnValue({ deserializedField: 'value' })
    })

    it('should deserialize valid data without syncData', () => {
      const mockBuffer = Buffer.from('buffer data')

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cWrappedDataVersion).mockReturnValueOnce(0) // No syncData
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce('acc123').mockReturnValueOnce('state456')
      ;(mockStream.readBuffer as jest.Mock).mockReturnValueOnce(mockBuffer)
      ;(mockStream.readBigUInt64 as jest.Mock).mockReturnValueOnce(BigInt(1234567890))

      const result = deserializeWrappedData(mockStream)

      expect(result).toEqual({
        accountId: 'acc123',
        stateId: 'state456',
        data: { deserializedField: 'value' },
        timestamp: 1234567890,
        syncData: undefined,
      })
      expect(stateManager.app.binaryDeserializeObject).toHaveBeenCalledWith(AppObjEnum.AppData, mockBuffer)
    })

    it('should deserialize valid data with syncData', () => {
      const mockBuffer = Buffer.from('buffer data')
      const syncData = { syncField: 'syncValue' }

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cWrappedDataVersion).mockReturnValueOnce(1) // Has syncData
      ;(mockStream.readString as jest.Mock)
        .mockReturnValueOnce('acc123')
        .mockReturnValueOnce('state456')
        .mockReturnValueOnce(JSON.stringify(syncData))
      ;(mockStream.readBuffer as jest.Mock).mockReturnValueOnce(mockBuffer)
      ;(mockStream.readBigUInt64 as jest.Mock).mockReturnValueOnce(BigInt(1234567890))

      const result = deserializeWrappedData(mockStream)

      expect(result).toEqual({
        accountId: 'acc123',
        stateId: 'state456',
        data: { deserializedField: 'value' },
        timestamp: 1234567890,
        syncData: syncData,
      })
    })

    it('should throw error for unsupported version', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cWrappedDataVersion + 1)

      expect(() => deserializeWrappedData(mockStream)).toThrow('WrappedData version mismatch')
    })

    it('should convert BigInt timestamp to number', () => {
      const mockBuffer = Buffer.from('buffer data')

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cWrappedDataVersion).mockReturnValueOnce(0)
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce('acc123').mockReturnValueOnce('state456')
      ;(mockStream.readBuffer as jest.Mock).mockReturnValueOnce(mockBuffer)
      ;(mockStream.readBigUInt64 as jest.Mock).mockReturnValueOnce(BigInt(9999999999999))

      const result = deserializeWrappedData(mockStream)

      expect(result.timestamp).toBe(9999999999999)
      expect(typeof result.timestamp).toBe('number')
    })

    it('should handle empty strings', () => {
      const mockBuffer = Buffer.from('buffer data')

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cWrappedDataVersion).mockReturnValueOnce(0)
      ;(mockStream.readString as jest.Mock).mockReturnValueOnce('').mockReturnValueOnce('')
      ;(mockStream.readBuffer as jest.Mock).mockReturnValueOnce(mockBuffer)
      ;(mockStream.readBigUInt64 as jest.Mock).mockReturnValueOnce(BigInt(0))

      const result = deserializeWrappedData(mockStream)

      expect(result.accountId).toBe('')
      expect(result.stateId).toBe('')
      expect(result.timestamp).toBe(0)
    })

    it('should use Utils.safeJsonParse for syncData', () => {
      const mockBuffer = Buffer.from('buffer data')
      const complexSyncData = {
        nested: { deep: { value: 'test' } },
        array: [1, 2, 3],
        nullValue: null,
      }

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cWrappedDataVersion).mockReturnValueOnce(1)
      ;(mockStream.readString as jest.Mock)
        .mockReturnValueOnce('acc123')
        .mockReturnValueOnce('state456')
        .mockReturnValueOnce(JSON.stringify(complexSyncData))
      ;(mockStream.readBuffer as jest.Mock).mockReturnValueOnce(mockBuffer)
      ;(mockStream.readBigUInt64 as jest.Mock).mockReturnValueOnce(BigInt(1234567890))

      const result = deserializeWrappedData(mockStream)

      expect(result.syncData).toEqual(complexSyncData)
    })
  })

  describe('version constant', () => {
    it('should have correct version number', () => {
      expect(cWrappedDataVersion).toBe(1)
    })
  })
})
