import { VectorBufferStream } from '../../../src/utils/serialization/VectorBufferStream'
import { serializeLostReportReq, deserializeLostReportReq, LostReportReq } from '../../../src/types/LostReportReq'
import * as AjvHelpers from '../../../src/types/ajv/Helpers'

jest.mock('../../../src/types/ajv/Helpers')

describe('LostReportReq', () => {
  const mockLostReportReq: LostReportReq = {
    target: 'target123',
    checker: 'checker456',
    reporter: 'reporter789',
    cycle: 100,
    timestamp: 1234567890,
    requestId: 'req123',
    sign: {
      owner: 'owner123',
      sig: 'signature456',
    },
  }

  const mockLostReportReqWithKillOther: LostReportReq = {
    ...mockLostReportReq,
    killother: true,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(AjvHelpers.verifyPayload as jest.Mock).mockReturnValue(null)
  })

  describe('serializeLostReportReq', () => {
    it('should serialize LostReportReq without killother', () => {
      const stream = new VectorBufferStream(0)
      serializeLostReportReq(stream, mockLostReportReq)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })

    it('should serialize LostReportReq with killother true', () => {
      const stream = new VectorBufferStream(0)
      serializeLostReportReq(stream, mockLostReportReqWithKillOther)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })

    it('should serialize LostReportReq with killother false', () => {
      const stream = new VectorBufferStream(0)
      const reqWithKillOtherFalse = { ...mockLostReportReq, killother: false }
      serializeLostReportReq(stream, reqWithKillOtherFalse)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })

    it('should write type identifier when root is true', () => {
      const stream = new VectorBufferStream(0)
      serializeLostReportReq(stream, mockLostReportReq, true)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })
  })

  describe('deserializeLostReportReq', () => {
    it('should deserialize LostReportReq without killother', () => {
      const stream = new VectorBufferStream(0)
      serializeLostReportReq(stream, mockLostReportReq)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())

      const result = deserializeLostReportReq(readStream)

      expect(result).toEqual(mockLostReportReq)
      expect(AjvHelpers.verifyPayload).toHaveBeenCalled()
    })

    it('should deserialize LostReportReq with killother true', () => {
      const stream = new VectorBufferStream(0)
      serializeLostReportReq(stream, mockLostReportReqWithKillOther)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())

      const result = deserializeLostReportReq(readStream)

      expect(result).toEqual(mockLostReportReqWithKillOther)
    })

    it('should deserialize LostReportReq with killother false', () => {
      const reqWithKillOtherFalse = { ...mockLostReportReq, killother: false }
      const stream = new VectorBufferStream(0)
      serializeLostReportReq(stream, reqWithKillOtherFalse)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())

      const result = deserializeLostReportReq(readStream)

      // When killother is false, it's not serialized, so it won't be in the result
      expect(result).toEqual(mockLostReportReq)
      expect(result.killother).toBeUndefined()
    })

    it('should throw error for unsupported version', () => {
      const stream = new VectorBufferStream(10)
      stream.writeUInt8(2) // Invalid version (> 1)

      stream.position = 0
      expect(() => deserializeLostReportReq(stream)).toThrow('cLostReportReq version mismatch')
    })

    it('should throw error when AJV validation fails', () => {
      ;(AjvHelpers.verifyPayload as jest.Mock).mockReturnValue(['validation error'])

      const stream = new VectorBufferStream(0)
      serializeLostReportReq(stream, mockLostReportReq)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())

      expect(() => deserializeLostReportReq(readStream)).toThrow('AJV: validation error -> validation error')
    })

    it('should handle large timestamp values', () => {
      const reqWithLargeTimestamp = { ...mockLostReportReq, timestamp: Number.MAX_SAFE_INTEGER }
      const stream = new VectorBufferStream(0)
      serializeLostReportReq(stream, reqWithLargeTimestamp)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())

      const result = deserializeLostReportReq(readStream)

      expect(result.timestamp).toBe(Number.MAX_SAFE_INTEGER)
    })

    it('should handle empty string values', () => {
      const reqWithEmptyStrings = {
        ...mockLostReportReq,
        target: '',
        checker: '',
        reporter: '',
        requestId: '',
        sign: { owner: '', sig: '' },
      }
      const stream = new VectorBufferStream(0)
      serializeLostReportReq(stream, reqWithEmptyStrings)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())

      const result = deserializeLostReportReq(readStream)

      expect(result).toEqual(reqWithEmptyStrings)
    })
  })
})
