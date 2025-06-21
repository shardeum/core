import { Utils } from '@shardeum-foundation/lib-types'
import { serializeGossipReq, deserializeGossipReq, GossipReqBinary } from '../../../src/types/GossipReq'
import { VectorBufferStream } from '../../../src/utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from '../../../src/types/enum/TypeIdentifierEnum'

describe('GossipReq', () => {
  let mockStream: VectorBufferStream

  beforeEach(() => {
    mockStream = {
      writeUInt16: jest.fn(),
      writeUInt8: jest.fn(),
      writeString: jest.fn(),
      readUInt8: jest.fn(),
      readString: jest.fn()
    } as unknown as VectorBufferStream
  })

  describe('serializeGossipReq', () => {
    it('should serialize GossipReqBinary without root flag', () => {
      const obj: GossipReqBinary = {
        type: 'testType',
        data: { key: 'value', number: 123 }
      }

      serializeGossipReq(mockStream, obj, false)

      expect(mockStream.writeUInt16).not.toHaveBeenCalled()
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(1) // version
      expect(mockStream.writeString).toHaveBeenCalledWith('testType')
      expect(mockStream.writeString).toHaveBeenCalledWith(Utils.safeStringify(obj.data))
    })

    it('should serialize GossipReqBinary with root flag', () => {
      const obj: GossipReqBinary = {
        type: 'testType',
        data: { key: 'value' }
      }

      serializeGossipReq(mockStream, obj, true)

      expect(mockStream.writeUInt16).toHaveBeenCalledWith(TypeIdentifierEnum.cGossipReq)
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(1) // version
      expect(mockStream.writeString).toHaveBeenCalledWith('testType')
      expect(mockStream.writeString).toHaveBeenCalledWith(Utils.safeStringify(obj.data))
    })

    it('should handle null data', () => {
      const obj: GossipReqBinary = {
        type: 'nullType',
        data: null
      }

      serializeGossipReq(mockStream, obj)

      expect(mockStream.writeString).toHaveBeenCalledWith('nullType')
      expect(mockStream.writeString).toHaveBeenCalledWith(Utils.safeStringify(null))
    })

    it('should handle complex data structures', () => {
      const obj: GossipReqBinary = {
        type: 'complexType',
        data: {
          array: [1, 2, 3],
          nested: {
            deep: {
              value: 'test'
            }
          },
          boolean: true
        }
      }

      serializeGossipReq(mockStream, obj)

      expect(mockStream.writeString).toHaveBeenCalledWith('complexType')
      expect(mockStream.writeString).toHaveBeenCalledWith(Utils.safeStringify(obj.data))
    })
  })

  describe('deserializeGossipReq', () => {
    it('should deserialize GossipReqBinary correctly', () => {
      const expectedData = { key: 'value', number: 123 }
      const expectedType = 'testType'

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(1) // version
      ;(mockStream.readString as jest.Mock)
        .mockReturnValueOnce(expectedType)
        .mockReturnValueOnce(JSON.stringify(expectedData))

      const result = deserializeGossipReq(mockStream)

      expect(result).toEqual({
        type: expectedType,
        data: expectedData
      })
      expect(mockStream.readUInt8).toHaveBeenCalledTimes(1)
      expect(mockStream.readString).toHaveBeenCalledTimes(2)
    })

    it('should throw error for version mismatch', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(2) // version > cGossipReqVersion

      expect(() => deserializeGossipReq(mockStream)).toThrow('GossipReq version mismatch')
    })

    it('should handle null data', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(1)
      ;(mockStream.readString as jest.Mock)
        .mockReturnValueOnce('nullType')
        .mockReturnValueOnce('null')

      const result = deserializeGossipReq(mockStream)

      expect(result).toEqual({
        type: 'nullType',
        data: null
      })
    })

    it('should handle complex data structures', () => {
      const complexData = {
        array: [1, 2, 3],
        nested: { deep: { value: 'test' } },
        boolean: true
      }

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(1)
      ;(mockStream.readString as jest.Mock)
        .mockReturnValueOnce('complexType')
        .mockReturnValueOnce(JSON.stringify(complexData))

      const result = deserializeGossipReq(mockStream)

      expect(result).toEqual({
        type: 'complexType',
        data: complexData
      })
    })

    it('should handle empty type string', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(1)
      ;(mockStream.readString as jest.Mock)
        .mockReturnValueOnce('')
        .mockReturnValueOnce('{}')

      const result = deserializeGossipReq(mockStream)

      expect(result).toEqual({
        type: '',
        data: {}
      })
    })
  })
})