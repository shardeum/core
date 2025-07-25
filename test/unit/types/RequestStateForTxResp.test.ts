import {
  RequestStateForTxRespSerialized,
  serializeRequestStateForTxResp,
  deserializeRequestStateForTxResp,
  cRequestStateForTxRespVersion,
} from '../../../src/types/RequestStateForTxResp'
import { VectorBufferStream } from '../../../src/utils/serialization/VectorBufferStream'
import * as AjvHelpers from '../../../src/types/ajv/Helpers'
import * as WrappedData from '../../../src/types/WrappedData'

jest.mock('../../../src/types/ajv/Helpers')
jest.mock('../../../src/types/WrappedData')

describe('RequestStateForTxResp', () => {
  const mockWrappedData = {
    accountId: 'acc123',
    stateId: 'state456',
    data: { test: 'data' },
    timestamp: 1234567890,
  }

  const mockRequestStateForTxResp: RequestStateForTxRespSerialized = {
    stateList: [mockWrappedData],
    beforeHashes: {
      acc1: 'hash1',
      acc2: 'hash2',
    },
    note: 'test note',
    success: true,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(AjvHelpers.verifyPayload as jest.Mock).mockReturnValue(null)
    ;(WrappedData.serializeWrappedData as jest.Mock).mockImplementation(() => {})
    ;(WrappedData.deserializeWrappedData as jest.Mock).mockReturnValue(mockWrappedData)

    // Mock console.log to suppress output in tests
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('cRequestStateForTxRespVersion', () => {
    it('should have correct version', () => {
      expect(cRequestStateForTxRespVersion).toBe(1)
    })
  })

  describe('serializeRequestStateForTxResp', () => {
    it('should serialize without type identifier when bool is false', () => {
      const stream = new VectorBufferStream(0)

      serializeRequestStateForTxResp(stream, mockRequestStateForTxResp, false)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
      expect(WrappedData.serializeWrappedData).toHaveBeenCalledTimes(1)
      expect(WrappedData.serializeWrappedData).toHaveBeenCalledWith(stream, mockWrappedData)
    })

    it('should serialize with type identifier when bool is true', () => {
      const stream = new VectorBufferStream(0)

      serializeRequestStateForTxResp(stream, mockRequestStateForTxResp, true)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })

    it('should serialize empty stateList', () => {
      const stream = new VectorBufferStream(0)
      const emptyResp = { ...mockRequestStateForTxResp, stateList: [] }

      serializeRequestStateForTxResp(stream, emptyResp)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
      expect(WrappedData.serializeWrappedData).not.toHaveBeenCalled()
    })

    it('should serialize multiple wrapped data items', () => {
      const stream = new VectorBufferStream(0)
      const multipleStateResp = {
        ...mockRequestStateForTxResp,
        stateList: [mockWrappedData, mockWrappedData, mockWrappedData],
      }

      serializeRequestStateForTxResp(stream, multipleStateResp)

      expect(WrappedData.serializeWrappedData).toHaveBeenCalledTimes(3)
    })

    it('should serialize empty beforeHashes', () => {
      const stream = new VectorBufferStream(0)
      const emptyHashesResp = { ...mockRequestStateForTxResp, beforeHashes: {} }

      serializeRequestStateForTxResp(stream, emptyHashesResp)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })

    it('should serialize success false correctly', () => {
      const stream = new VectorBufferStream(0)
      const failureResp = { ...mockRequestStateForTxResp, success: false }

      serializeRequestStateForTxResp(stream, failureResp)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })

    it('should serialize empty note', () => {
      const stream = new VectorBufferStream(0)
      const emptyNoteResp = { ...mockRequestStateForTxResp, note: '' }

      serializeRequestStateForTxResp(stream, emptyNoteResp)

      expect(stream.getBuffer().length).toBeGreaterThan(0)
    })
  })

  describe('deserializeRequestStateForTxResp', () => {
    it('should deserialize valid data correctly', () => {
      const stream = new VectorBufferStream(0)
      serializeRequestStateForTxResp(stream, mockRequestStateForTxResp)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeRequestStateForTxResp(readStream)

      expect(result.stateList).toHaveLength(1)
      expect(result.beforeHashes).toEqual(mockRequestStateForTxResp.beforeHashes)
      expect(result.note).toBe(mockRequestStateForTxResp.note)
      expect(result.success).toBe(mockRequestStateForTxResp.success)
      expect(WrappedData.deserializeWrappedData).toHaveBeenCalledTimes(1)
      expect(AjvHelpers.verifyPayload).toHaveBeenCalled()
    })

    it('should deserialize empty stateList', () => {
      const stream = new VectorBufferStream(0)
      const emptyResp = { ...mockRequestStateForTxResp, stateList: [] }
      serializeRequestStateForTxResp(stream, emptyResp)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeRequestStateForTxResp(readStream)

      expect(result.stateList).toHaveLength(0)
      expect(WrappedData.deserializeWrappedData).not.toHaveBeenCalled()
    })

    it('should deserialize multiple wrapped data items', () => {
      const stream = new VectorBufferStream(0)
      const multipleStateResp = {
        ...mockRequestStateForTxResp,
        stateList: [mockWrappedData, mockWrappedData, mockWrappedData],
      }
      serializeRequestStateForTxResp(stream, multipleStateResp)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeRequestStateForTxResp(readStream)

      expect(result.stateList).toHaveLength(3)
      expect(WrappedData.deserializeWrappedData).toHaveBeenCalledTimes(3)
    })

    it('should deserialize empty beforeHashes', () => {
      const stream = new VectorBufferStream(0)
      const emptyHashesResp = { ...mockRequestStateForTxResp, beforeHashes: {} }
      serializeRequestStateForTxResp(stream, emptyHashesResp)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeRequestStateForTxResp(readStream)

      expect(result.beforeHashes).toEqual({})
    })

    it('should deserialize success false correctly', () => {
      const stream = new VectorBufferStream(0)
      const failureResp = { ...mockRequestStateForTxResp, success: false }
      serializeRequestStateForTxResp(stream, failureResp)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeRequestStateForTxResp(readStream)

      expect(result.success).toBe(false)
    })

    it('should throw error for unsupported version', () => {
      const stream = new VectorBufferStream(10)
      stream.writeUInt8(2) // Invalid version (> 1)

      stream.position = 0
      expect(() => deserializeRequestStateForTxResp(stream)).toThrow('Unsupported version')
    })

    it('should throw error when AJV validation fails', () => {
      ;(AjvHelpers.verifyPayload as jest.Mock).mockReturnValue(['validation error'])

      const stream = new VectorBufferStream(0)
      serializeRequestStateForTxResp(stream, mockRequestStateForTxResp)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())

      expect(() => deserializeRequestStateForTxResp(readStream)).toThrow('AJV: validation error -> validation error')
    })

    it('should handle complex beforeHashes with many entries', () => {
      const stream = new VectorBufferStream(0)
      const complexHashes = {}
      for (let i = 0; i < 100; i++) {
        complexHashes[`acc${i}`] = `hash${i}`
      }
      const complexResp = { ...mockRequestStateForTxResp, beforeHashes: complexHashes }
      serializeRequestStateForTxResp(stream, complexResp)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeRequestStateForTxResp(readStream)

      expect(Object.keys(result.beforeHashes)).toHaveLength(100)
      expect(result.beforeHashes['acc50']).toBe('hash50')
    })

    it('should handle long note strings', () => {
      const stream = new VectorBufferStream(0)
      const longNote = 'x'.repeat(10000)
      const longNoteResp = { ...mockRequestStateForTxResp, note: longNote }
      serializeRequestStateForTxResp(stream, longNoteResp)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeRequestStateForTxResp(readStream)

      expect(result.note).toBe(longNote)
      expect(result.note.length).toBe(10000)
    })

    it('should log result during deserialization', () => {
      const stream = new VectorBufferStream(0)
      serializeRequestStateForTxResp(stream, mockRequestStateForTxResp)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      deserializeRequestStateForTxResp(readStream)

      expect(console.log).toHaveBeenCalledWith('ret', expect.any(Object))
    })
  })
})
