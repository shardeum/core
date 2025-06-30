import {
  WrappedResp,
  serializeWrappedResp,
  deserializeWrappedResp,
  cWrappedRespVersion
} from '../../../src/types/WrappedResp'
import { VectorBufferStream } from '../../../src/utils/serialization/VectorBufferStream'
import { TypeIdentifierEnum } from '../../../src/types/enum/TypeIdentifierEnum'

describe('WrappedResp', () => {
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

  describe('cWrappedRespVersion', () => {
    it('should have correct version', () => {
      expect(cWrappedRespVersion).toBe(1)
    })
  })

  describe('serializeWrappedResp', () => {
    it('should serialize without root flag', () => {
      const payload = Buffer.from('response payload data')
      const resp: WrappedResp = {
        payload
      }

      serializeWrappedResp(mockStream, resp, false)

      expect(mockStream.writeUInt16).not.toHaveBeenCalled()
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(cWrappedRespVersion)
      expect(mockStream.writeBuffer).toHaveBeenCalledWith(payload)
    })

    it('should serialize with root flag', () => {
      const payload = Buffer.from('response payload data')
      const resp: WrappedResp = {
        payload
      }

      serializeWrappedResp(mockStream, resp, true)

      expect(mockStream.writeUInt16).toHaveBeenCalledWith(TypeIdentifierEnum.cWrappedResp)
      expect(mockStream.writeUInt8).toHaveBeenCalledWith(cWrappedRespVersion)
      expect(mockStream.writeBuffer).toHaveBeenCalledWith(payload)
    })

    it('should handle empty buffer', () => {
      const resp: WrappedResp = {
        payload: Buffer.alloc(0)
      }

      serializeWrappedResp(mockStream, resp)

      expect(mockStream.writeUInt8).toHaveBeenCalledWith(cWrappedRespVersion)
      expect(mockStream.writeBuffer).toHaveBeenCalledWith(Buffer.alloc(0))
    })

    it('should handle large buffer', () => {
      const largePayload = Buffer.alloc(50000, 'z')
      const resp: WrappedResp = {
        payload: largePayload
      }

      serializeWrappedResp(mockStream, resp)

      expect(mockStream.writeBuffer).toHaveBeenCalledWith(largePayload)
    })

    it('should handle binary data in buffer', () => {
      const binaryData = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE, 0xBA, 0xBE])
      const resp: WrappedResp = {
        payload: binaryData
      }

      serializeWrappedResp(mockStream, resp)

      expect(mockStream.writeBuffer).toHaveBeenCalledWith(binaryData)
    })

    it('should handle UTF-8 encoded string data', () => {
      const utf8Data = Buffer.from('Hello 世界! 🌍', 'utf8')
      const resp: WrappedResp = {
        payload: utf8Data
      }

      serializeWrappedResp(mockStream, resp)

      expect(mockStream.writeBuffer).toHaveBeenCalledWith(utf8Data)
    })
  })

  describe('deserializeWrappedResp', () => {
    it('should deserialize correctly', () => {
      const expectedPayload = Buffer.from('response payload data')

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cWrappedRespVersion)
      ;(mockStream.readBuffer as jest.Mock).mockReturnValueOnce(expectedPayload)

      const result = deserializeWrappedResp(mockStream)

      expect(result).toEqual({
        payload: expectedPayload
      })
      expect(mockStream.readUInt8).toHaveBeenCalledTimes(1)
      expect(mockStream.readBuffer).toHaveBeenCalledTimes(1)
    })

    it('should throw error for version mismatch', () => {
      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cWrappedRespVersion + 1)

      expect(() => deserializeWrappedResp(mockStream)).toThrow('WrappedResp version mismatch')
    })

    it('should handle empty buffer', () => {
      const emptyBuffer = Buffer.alloc(0)

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cWrappedRespVersion)
      ;(mockStream.readBuffer as jest.Mock).mockReturnValueOnce(emptyBuffer)

      const result = deserializeWrappedResp(mockStream)

      expect(result).toEqual({
        payload: emptyBuffer
      })
    })

    it('should handle large buffer', () => {
      const largePayload = Buffer.alloc(50000, 'w')

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cWrappedRespVersion)
      ;(mockStream.readBuffer as jest.Mock).mockReturnValueOnce(largePayload)

      const result = deserializeWrappedResp(mockStream)

      expect(result).toEqual({
        payload: largePayload
      })
    })

    it('should handle binary data', () => {
      const binaryData = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE, 0xBA, 0xBE])

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cWrappedRespVersion)
      ;(mockStream.readBuffer as jest.Mock).mockReturnValueOnce(binaryData)

      const result = deserializeWrappedResp(mockStream)

      expect(result).toEqual({
        payload: binaryData
      })
    })

    it('should accept version 0', () => {
      const payload = Buffer.from('test response')

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(0)
      ;(mockStream.readBuffer as jest.Mock).mockReturnValueOnce(payload)

      const result = deserializeWrappedResp(mockStream)

      expect(result).toEqual({
        payload
      })
    })

    it('should handle UTF-8 encoded data', () => {
      const utf8Data = Buffer.from('Hello 世界! 🌍', 'utf8')

      ;(mockStream.readUInt8 as jest.Mock).mockReturnValueOnce(cWrappedRespVersion)
      ;(mockStream.readBuffer as jest.Mock).mockReturnValueOnce(utf8Data)

      const result = deserializeWrappedResp(mockStream)

      expect(result).toEqual({
        payload: utf8Data
      })
    })
  })
})