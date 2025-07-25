import {
  WrappedDataFromQueueSerializable,
  serializeWrappedDataFromQueue,
  deserializeWrappedDataFromQueue,
  cWrappedDataFromQueueVersion,
  cWrappedDataFromQueueBinaryVersion,
} from '../../../src/types/WrappedDataFromQueue'
import { VectorBufferStream } from '../../../src/utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from '../../../src/types/enum/TypeIdentifierEnum'
import * as WrappedDataModule from '../../../src/types/WrappedData'

// Mock WrappedData module
jest.mock('../../../src/types/WrappedData', () => ({
  serializeWrappedData: jest.fn(),
  deserializeWrappedData: jest.fn(),
}))

describe('WrappedDataFromQueue', () => {
  let mockStream: VectorBufferStream
  let serializeWrappedDataMock: any
  let deserializeWrappedDataMock: any

  beforeEach(() => {
    mockStream = {
      writeUInt16: jest.fn(),
      writeUInt8: jest.fn(),
      readUInt8: jest.fn(),
    } as unknown as VectorBufferStream

    serializeWrappedDataMock = WrappedDataModule.serializeWrappedData as any
    deserializeWrappedDataMock = WrappedDataModule.deserializeWrappedData as any

    serializeWrappedDataMock.mockClear()
    deserializeWrappedDataMock.mockClear()
  })

  describe('constants', () => {
    it('should have correct version constants', () => {
      expect(cWrappedDataFromQueueVersion).toBe(1)
      expect(cWrappedDataFromQueueBinaryVersion).toBe(1)
    })
  })

  describe('serializeWrappedDataFromQueue', () => {
    it('should serialize without root flag when seenInQueue is true', () => {
      const obj: WrappedDataFromQueueSerializable = {
        accountId: 'account-123',
        stateId: 'state-456',
        data: { value: 'test' },
        timestamp: 1234567890,
        seenInQueue: true,
      }

      serializeWrappedDataFromQueue(mockStream, obj, false)

      expect(mockStream.writeUInt16).not.toHaveBeenCalled()
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(cWrappedDataFromQueueVersion)
      expect(serializeWrappedDataMock).toHaveBeenCalledWith(mockStream, obj)
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(1) // seenInQueue = true
    })

    it('should serialize with root flag when seenInQueue is false', () => {
      const obj: WrappedDataFromQueueSerializable = {
        accountId: 'account-789',
        stateId: 'state-012',
        data: { value: 'test2' },
        timestamp: 9876543210,
        seenInQueue: false,
      }

      serializeWrappedDataFromQueue(mockStream, obj, true)

      expect(mockStream.writeUInt16).toHaveBeenCalledWith(TypeIdentifierEnum.cWrappedDataFromQueue)
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(cWrappedDataFromQueueVersion)
      expect(serializeWrappedDataMock).toHaveBeenCalledWith(mockStream, obj)
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(0) // seenInQueue = false
    })

    it('should handle object with syncData', () => {
      const obj: WrappedDataFromQueueSerializable = {
        accountId: 'account-sync',
        stateId: 'state-sync',
        data: { value: 'sync-test' },
        timestamp: 1111111111,
        syncData: { extra: 'sync-info' },
        seenInQueue: true,
      }

      serializeWrappedDataFromQueue(mockStream, obj)

      expect(serializeWrappedDataMock).toHaveBeenCalledWith(mockStream, obj)
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(1) // seenInQueue = true
    })

    it('should correctly write seenInQueue boolean as uint8', () => {
      const objTrue: WrappedDataFromQueueSerializable = {
        accountId: 'acc1',
        stateId: 'state1',
        data: {},
        timestamp: 1,
        seenInQueue: true,
      }

      const objFalse: WrappedDataFromQueueSerializable = {
        accountId: 'acc2',
        stateId: 'state2',
        data: {},
        timestamp: 2,
        seenInQueue: false,
      }

      serializeWrappedDataFromQueue(mockStream, objTrue)
      expect(mockStream.writeUInt8).toHaveBeenLastCalledWith(1)

      jest.clearAllMocks()

      serializeWrappedDataFromQueue(mockStream, objFalse)
      expect(mockStream.writeUInt8).toHaveBeenLastCalledWith(0)
    })
  })

  describe('deserializeWrappedDataFromQueue', () => {
    it('should deserialize correctly when seenInQueue is true', () => {
      const expectedWrappedData = {
        accountId: 'account-123',
        stateId: 'state-456',
        data: { value: 'test' },
        timestamp: 1234567890,
      }

      ;(mockStream.readUInt8 as jest.Mock)
        .mockReturnValueOnce(cWrappedDataFromQueueBinaryVersion)
        .mockReturnValueOnce(1) // seenInQueue = true

      deserializeWrappedDataMock.mockReturnValueOnce(expectedWrappedData)

      const result = deserializeWrappedDataFromQueue(mockStream)

      expect(result).toEqual({
        ...expectedWrappedData,
        seenInQueue: true,
      })
      expect(mockStream.readUInt8).toHaveBeenCalledTimes(2)
      expect(deserializeWrappedDataMock).toHaveBeenCalledWith(mockStream)
    })

    it('should deserialize correctly when seenInQueue is false', () => {
      const expectedWrappedData = {
        accountId: 'account-789',
        stateId: 'state-012',
        data: { value: 'test2' },
        timestamp: 9876543210,
        syncData: { extra: 'data' },
      }

      ;(mockStream.readUInt8 as jest.Mock)
        .mockReturnValueOnce(cWrappedDataFromQueueBinaryVersion)
        .mockReturnValueOnce(0) // seenInQueue = false

      deserializeWrappedDataMock.mockReturnValueOnce(expectedWrappedData)

      const result = deserializeWrappedDataFromQueue(mockStream)

      expect(result).toEqual({
        ...expectedWrappedData,
        seenInQueue: false,
      })
    })

    it('should throw error for version mismatch', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cWrappedDataFromQueueBinaryVersion + 1)

      expect(() => deserializeWrappedDataFromQueue(mockStream)).toThrow('WrappedDataFromQueue version mismatch')
      expect(deserializeWrappedDataMock).not.toHaveBeenCalled()
    })

    it('should accept version 0', () => {
      const expectedWrappedData = {
        accountId: 'account-v0',
        stateId: 'state-v0',
        data: {},
        timestamp: 0,
      }

      ;(mockStream.readUInt8 as jest.Mock)
        .mockReturnValueOnce(0) // version 0
        .mockReturnValueOnce(1) // seenInQueue = true

      deserializeWrappedDataMock.mockReturnValueOnce(expectedWrappedData)

      const result = deserializeWrappedDataFromQueue(mockStream)

      expect(result).toEqual({
        ...expectedWrappedData,
        seenInQueue: true,
      })
    })

    it('should correctly convert uint8 to boolean for seenInQueue', () => {
      const baseData = {
        accountId: 'test',
        stateId: 'test',
        data: {},
        timestamp: 1,
      }

      // Test value 1 -> true
      ;(mockStream.readUInt8 as jest.Mock)
        .mockReturnValueOnce(1) // version
        .mockReturnValueOnce(1) // seenInQueue
      deserializeWrappedDataMock.mockReturnValueOnce(baseData)

      let result = deserializeWrappedDataFromQueue(mockStream)
      expect(result.seenInQueue).toBe(true)

      // Reset mocks
      jest.clearAllMocks()

      // Test value 0 -> false
      ;(mockStream.readUInt8 as jest.Mock)
        .mockReturnValueOnce(1) // version
        .mockReturnValueOnce(0) // seenInQueue
      deserializeWrappedDataMock.mockReturnValueOnce(baseData)

      result = deserializeWrappedDataFromQueue(mockStream)
      expect(result.seenInQueue).toBe(false)

      // Reset mocks
      jest.clearAllMocks()

      // Test any non-1 value -> false
      ;(mockStream.readUInt8 as jest.Mock)
        .mockReturnValueOnce(1) // version
        .mockReturnValueOnce(42) // seenInQueue (non-1 value)
      deserializeWrappedDataMock.mockReturnValueOnce(baseData)

      result = deserializeWrappedDataFromQueue(mockStream)
      expect(result.seenInQueue).toBe(false)
    })
  })
})
