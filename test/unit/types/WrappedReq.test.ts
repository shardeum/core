import {
  WrappedReq,
  serializeWrappedReq,
  deserializeWrappedReq,
  cWrappedReqVersion
} from '../../../src/types/WrappedReq'
import { VectorBufferStream } from '../../../src/utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from '../../../src/types/enum/TypeIdentifierEnum'

describe('WrappedReq', () => {
  let mockStream: VectorBufferStream

  beforeEach(() => {
    mockStream = {
      writeUInt16: jest.fn(),
      writeUInt8: jest.fn(),
      writeBuffer: jest.fn(),
      readUInt8: jest.fn(),
      readBuffer: jest.fn()
    } as unknown as VectorBufferStream
  })

  describe('cWrappedReqVersion', () => {
    it('should have correct version', () => {
      expect(cWrappedReqVersion).toBe(1)
    })
  })

  describe('serializeWrappedReq', () => {
    it('should serialize without root flag', () => {
      const payload = Buffer.from('test payload data')
      const req: WrappedReq = {
        payload
      }

      serializeWrappedReq(mockStream, req, false)

      expect(mockStream.writeUInt16).not.toHaveBeenCalled()
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(cWrappedReqVersion)
      expect(mockStream.writeBuffer).toHaveBeenCalledWith(payload)
    })

    it('should serialize with root flag', () => {
      const payload = Buffer.from('test payload data')
      const req: WrappedReq = {
        payload
      }

      serializeWrappedReq(mockStream, req, true)

      expect(mockStream.writeUInt16).toHaveBeenCalledWith(TypeIdentifierEnum.cWrappedReq)
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(cWrappedReqVersion)
      expect(mockStream.writeBuffer).toHaveBeenCalledWith(payload)
    })

    it('should handle empty buffer', () => {
      const req: WrappedReq = {
        payload: Buffer.alloc(0)
      }

      serializeWrappedReq(mockStream, req)

      expect(mockStream.writeUInt8).toHaveBeenCalledWith(cWrappedReqVersion)
      expect(mockStream.writeBuffer).toHaveBeenCalledWith(Buffer.alloc(0))
    })

    it('should handle large buffer', () => {
      const largePayload = Buffer.alloc(10000, 'x')
      const req: WrappedReq = {
        payload: largePayload
      }

      serializeWrappedReq(mockStream, req)

      expect(mockStream.writeBuffer).toHaveBeenCalledWith(largePayload)
    })

    it('should handle binary data in buffer', () => {
      const binaryData = Buffer.from([0x00, 0xFF, 0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0])
      const req: WrappedReq = {
        payload: binaryData
      }

      serializeWrappedReq(mockStream, req)

      expect(mockStream.writeBuffer).toHaveBeenCalledWith(binaryData)
    })
  })

  describe('deserializeWrappedReq', () => {
    it('should deserialize correctly', () => {
      const expectedPayload = Buffer.from('test payload data')

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cWrappedReqVersion)
      ;(mockStream.readBuffer as jest.Mock).mockReturnValueOnce(expectedPayload)

      const result = deserializeWrappedReq(mockStream)

      expect(result).toEqual({
        payload: expectedPayload
      })
      expect(mockStream.readUInt8).toHaveBeenCalledTimes(1)
      expect(mockStream.readBuffer).toHaveBeenCalledTimes(1)
    })

    it('should throw error for version mismatch', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cWrappedReqVersion + 1)

      expect(() => deserializeWrappedReq(mockStream)).toThrow('WrappedReq version mismatch')
    })

    it('should handle empty buffer', () => {
      const emptyBuffer = Buffer.alloc(0)

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cWrappedReqVersion)
      ;(mockStream.readBuffer as jest.Mock).mockReturnValueOnce(emptyBuffer)

      const result = deserializeWrappedReq(mockStream)

      expect(result).toEqual({
        payload: emptyBuffer
      })
    })

    it('should handle large buffer', () => {
      const largePayload = Buffer.alloc(10000, 'y')

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cWrappedReqVersion)
      ;(mockStream.readBuffer as jest.Mock).mockReturnValueOnce(largePayload)

      const result = deserializeWrappedReq(mockStream)

      expect(result).toEqual({
        payload: largePayload
      })
    })

    it('should handle binary data', () => {
      const binaryData = Buffer.from([0x00, 0xFF, 0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0])

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cWrappedReqVersion)
      ;(mockStream.readBuffer as jest.Mock).mockReturnValueOnce(binaryData)

      const result = deserializeWrappedReq(mockStream)

      expect(result).toEqual({
        payload: binaryData
      })
    })

    it('should accept version 0', () => {
      const payload = Buffer.from('test')

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(0)
      ;(mockStream.readBuffer as jest.Mock).mockReturnValueOnce(payload)

      const result = deserializeWrappedReq(mockStream)

      expect(result).toEqual({
        payload
      })
    })
  })
})