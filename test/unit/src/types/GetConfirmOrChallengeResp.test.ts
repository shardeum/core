import { VectorBufferStream } from '@src/utils/serialization/VectorBufferStream'
import {
  GetConfirmOrChallengeResp,
  serializeGetConfirmOrChallengeResp,
  deserializeGetConfirmOrChallengeResp,
} from '@src/types/GetConfirmOrChallengeResp'
import { TypeIdentifierEnum } from '@src/types/enum/TypeIdentifierEnum'
import { Utils } from '@shardeum-foundation/lib-types'

jest.mock('@shardeum-foundation/lib-types', () => ({
  Utils: {
    safeStringify: jest.fn(),
    safeJsonParse: jest.fn(),
  },
}))

describe('GetConfirmOrChallengeResp', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('serializeGetConfirmOrChallengeResp', () => {
    it('should serialize with result and root=true correctly', () => {
      const mockResult = {
        message: 'confirm',
        signatures: ['sig1', 'sig2'],
        metadata: { cycle: 42 },
      }
      const obj: GetConfirmOrChallengeResp = {
        txId: 'test-tx-id',
        appliedVoteHash: 'test-vote-hash',
        result: mockResult as any,
        uniqueCount: 123,
      }

      const mockResultString = JSON.stringify(mockResult)
      ;(Utils.safeStringify as jest.Mock).mockReturnValue(mockResultString)

      const stream = new VectorBufferStream(0)
      serializeGetConfirmOrChallengeResp(stream, obj, true)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt16()).toBe(TypeIdentifierEnum.cGetConfirmOrChallengeResp)
      expect(readStream.readUInt8()).toBe(1) // version
      expect(readStream.readString()).toBe('test-tx-id')
      expect(readStream.readString()).toBe('test-vote-hash')
      expect(readStream.readUInt8()).toBe(1) // has result
      expect(readStream.readString()).toBe(mockResultString)
      expect(readStream.readUInt32()).toBe(123)

      expect(Utils.safeStringify).toHaveBeenCalledWith(mockResult)
    })

    it('should serialize without result and root=false correctly', () => {
      const obj: GetConfirmOrChallengeResp = {
        txId: 'another-tx-id',
        appliedVoteHash: 'another-vote-hash',
        uniqueCount: 456,
      }

      const stream = new VectorBufferStream(0)
      serializeGetConfirmOrChallengeResp(stream, obj, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(1) // version
      expect(readStream.readString()).toBe('another-tx-id')
      expect(readStream.readString()).toBe('another-vote-hash')
      expect(readStream.readUInt8()).toBe(0) // no result
      expect(readStream.readUInt32()).toBe(456)

      expect(Utils.safeStringify).not.toHaveBeenCalled()
    })

    it('should serialize with undefined result', () => {
      const obj: GetConfirmOrChallengeResp = {
        txId: 'undefined-result-tx',
        appliedVoteHash: 'undefined-result-hash',
        result: undefined,
        uniqueCount: 789,
      }

      const stream = new VectorBufferStream(0)
      serializeGetConfirmOrChallengeResp(stream, obj, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(1) // version
      expect(readStream.readString()).toBe('undefined-result-tx')
      expect(readStream.readString()).toBe('undefined-result-hash')
      expect(readStream.readUInt8()).toBe(0) // no result
      expect(readStream.readUInt32()).toBe(789)

      expect(Utils.safeStringify).not.toHaveBeenCalled()
    })

    it('should handle zero uniqueCount', () => {
      const obj: GetConfirmOrChallengeResp = {
        txId: 'zero-count-tx',
        appliedVoteHash: 'zero-count-hash',
        uniqueCount: 0,
      }

      const stream = new VectorBufferStream(0)
      serializeGetConfirmOrChallengeResp(stream, obj, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(1) // version
      expect(readStream.readString()).toBe('zero-count-tx')
      expect(readStream.readString()).toBe('zero-count-hash')
      expect(readStream.readUInt8()).toBe(0) // no result
      expect(readStream.readUInt32()).toBe(0)
    })

    it('should handle maximum uniqueCount value', () => {
      const obj: GetConfirmOrChallengeResp = {
        txId: 'max-count-tx',
        appliedVoteHash: 'max-count-hash',
        uniqueCount: 4294967295, // Max UInt32
      }

      const stream = new VectorBufferStream(0)
      serializeGetConfirmOrChallengeResp(stream, obj, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(1) // version
      expect(readStream.readString()).toBe('max-count-tx')
      expect(readStream.readString()).toBe('max-count-hash')
      expect(readStream.readUInt8()).toBe(0) // no result
      expect(readStream.readUInt32()).toBe(4294967295)
    })

    it('should handle complex result object', () => {
      const complexResult = {
        type: 'challenge',
        data: {
          nestedObject: {
            array: [1, 2, 3],
            nullValue: null,
            boolValue: true,
          },
        },
        signatures: ['sig1', 'sig2', 'sig3'],
      }
      const obj: GetConfirmOrChallengeResp = {
        txId: 'complex-result-tx',
        appliedVoteHash: 'complex-result-hash',
        result: complexResult as any,
        uniqueCount: 999,
      }

      const mockComplexResultString = JSON.stringify(complexResult)
      ;(Utils.safeStringify as jest.Mock).mockReturnValue(mockComplexResultString)

      const stream = new VectorBufferStream(0)
      serializeGetConfirmOrChallengeResp(stream, obj, false)

      expect(Utils.safeStringify).toHaveBeenCalledWith(complexResult)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt8()).toBe(1) // version
      expect(readStream.readString()).toBe('complex-result-tx')
      expect(readStream.readString()).toBe('complex-result-hash')
      expect(readStream.readUInt8()).toBe(1) // has result
      expect(readStream.readString()).toBe(mockComplexResultString)
      expect(readStream.readUInt32()).toBe(999)
    })
  })

  describe('deserializeGetConfirmOrChallengeResp', () => {
    it('should deserialize with result correctly', () => {
      const mockResult = {
        message: 'confirm',
        signatures: ['sig1', 'sig2'],
        metadata: { cycle: 42 },
      }
      const mockResultString = JSON.stringify(mockResult)

      ;(Utils.safeJsonParse as jest.Mock).mockReturnValue(mockResult)

      const stream = new VectorBufferStream(0)
      stream.writeUInt8(1) // version
      stream.writeString('test-tx-id')
      stream.writeString('test-vote-hash')
      stream.writeUInt8(1) // has result
      stream.writeString(mockResultString)
      stream.writeUInt32(123)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeGetConfirmOrChallengeResp(readStream)

      expect(result).toEqual({
        txId: 'test-tx-id',
        appliedVoteHash: 'test-vote-hash',
        result: mockResult,
        uniqueCount: 123,
      })

      expect(Utils.safeJsonParse).toHaveBeenCalledWith(mockResultString)
    })

    it('should deserialize without result correctly', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(1) // version
      stream.writeString('no-result-tx')
      stream.writeString('no-result-hash')
      stream.writeUInt8(0) // no result
      stream.writeUInt32(456)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeGetConfirmOrChallengeResp(readStream)

      expect(result).toEqual({
        txId: 'no-result-tx',
        appliedVoteHash: 'no-result-hash',
        result: undefined,
        uniqueCount: 456,
      })

      expect(Utils.safeJsonParse).not.toHaveBeenCalled()
    })

    it('should throw error for version mismatch', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(2) // wrong version
      stream.writeString('test-tx-id')
      stream.writeString('test-vote-hash')
      stream.writeUInt8(0)
      stream.writeUInt32(123)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(() => deserializeGetConfirmOrChallengeResp(readStream)).toThrow(
        'GetConfirmOrChallengeResponse version mismatch'
      )
    })

    it('should handle zero uniqueCount', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(1) // version
      stream.writeString('zero-count-tx')
      stream.writeString('zero-count-hash')
      stream.writeUInt8(0) // no result
      stream.writeUInt32(0)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeGetConfirmOrChallengeResp(readStream)

      expect(result).toEqual({
        txId: 'zero-count-tx',
        appliedVoteHash: 'zero-count-hash',
        result: undefined,
        uniqueCount: 0,
      })
    })

    it('should handle maximum uniqueCount value', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(1) // version
      stream.writeString('max-count-tx')
      stream.writeString('max-count-hash')
      stream.writeUInt8(0) // no result
      stream.writeUInt32(4294967295)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeGetConfirmOrChallengeResp(readStream)

      expect(result).toEqual({
        txId: 'max-count-tx',
        appliedVoteHash: 'max-count-hash',
        result: undefined,
        uniqueCount: 4294967295,
      })
    })

    it('should handle hasResult flag with value other than 1', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(1) // version
      stream.writeString('flag-test-tx')
      stream.writeString('flag-test-hash')
      stream.writeUInt8(255) // not 1, so no result
      stream.writeUInt32(789)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeGetConfirmOrChallengeResp(readStream)

      expect(result).toEqual({
        txId: 'flag-test-tx',
        appliedVoteHash: 'flag-test-hash',
        result: undefined,
        uniqueCount: 789,
      })

      expect(Utils.safeJsonParse).not.toHaveBeenCalled()
    })

    it('should handle complex parsed result', () => {
      const complexResult = {
        type: 'challenge',
        data: {
          nestedObject: {
            array: [1, 2, 3],
            nullValue: null,
            boolValue: true,
          },
        },
        signatures: ['sig1', 'sig2', 'sig3'],
      }
      const mockComplexResultString = JSON.stringify(complexResult)

      ;(Utils.safeJsonParse as jest.Mock).mockReturnValue(complexResult)

      const stream = new VectorBufferStream(0)
      stream.writeUInt8(1) // version
      stream.writeString('complex-result-tx')
      stream.writeString('complex-result-hash')
      stream.writeUInt8(1) // has result
      stream.writeString(mockComplexResultString)
      stream.writeUInt32(999)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const result = deserializeGetConfirmOrChallengeResp(readStream)

      expect(result).toEqual({
        txId: 'complex-result-tx',
        appliedVoteHash: 'complex-result-hash',
        result: complexResult,
        uniqueCount: 999,
      })

      expect(Utils.safeJsonParse).toHaveBeenCalledWith(mockComplexResultString)
    })
  })

  describe('serialize/deserialize round trip', () => {
    it('should correctly serialize and deserialize with result', () => {
      const mockResult = {
        message: 'confirm',
        data: { test: 'value' },
        signatures: ['sig1', 'sig2'],
      }
      const original: GetConfirmOrChallengeResp = {
        txId: 'round-trip-tx',
        appliedVoteHash: 'round-trip-hash',
        result: mockResult as any,
        uniqueCount: 555,
      }

      const mockResultString = JSON.stringify(mockResult)
      ;(Utils.safeStringify as jest.Mock).mockReturnValue(mockResultString)
      ;(Utils.safeJsonParse as jest.Mock).mockReturnValue(mockResult)

      const stream = new VectorBufferStream(0)
      serializeGetConfirmOrChallengeResp(stream, original, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const deserialized = deserializeGetConfirmOrChallengeResp(readStream)

      expect(deserialized).toEqual(original)
    })

    it('should correctly serialize and deserialize without result', () => {
      const original: GetConfirmOrChallengeResp = {
        txId: 'no-result-round-trip',
        appliedVoteHash: 'no-result-round-trip-hash',
        uniqueCount: 777,
      }

      const stream = new VectorBufferStream(0)
      serializeGetConfirmOrChallengeResp(stream, original, false)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      const deserialized = deserializeGetConfirmOrChallengeResp(readStream)

      expect(deserialized).toEqual(original)
    })

    it('should correctly serialize and deserialize with root=true', () => {
      const original: GetConfirmOrChallengeResp = {
        txId: 'root-round-trip',
        appliedVoteHash: 'root-round-trip-hash',
        uniqueCount: 888,
      }

      const stream = new VectorBufferStream(0)
      serializeGetConfirmOrChallengeResp(stream, original, true)

      const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
      expect(readStream.readUInt16()).toBe(TypeIdentifierEnum.cGetConfirmOrChallengeResp)
      const deserialized = deserializeGetConfirmOrChallengeResp(readStream)

      expect(deserialized).toEqual(original)
    })

    it('should handle edge cases in round trip', () => {
      const edgeCases = [
        {
          txId: '',
          appliedVoteHash: '',
          uniqueCount: 0,
        },
        {
          txId: 'special-chars-!@#$%^&*()',
          appliedVoteHash: 'hash-with-unicode-😀🔥',
          result: { empty: {} } as any,
          uniqueCount: 4294967295,
        },
      ]

      edgeCases.forEach((original, index) => {
        ;(Utils.safeStringify as jest.Mock).mockReturnValue(JSON.stringify(original.result))
        ;(Utils.safeJsonParse as jest.Mock).mockReturnValue(original.result)

        const stream = new VectorBufferStream(0)
        serializeGetConfirmOrChallengeResp(stream, original as GetConfirmOrChallengeResp, false)

        const readStream = VectorBufferStream.fromBuffer(stream.getBuffer())
        const deserialized = deserializeGetConfirmOrChallengeResp(readStream)

        expect(deserialized).toEqual(original)
      })
    })
  })
})