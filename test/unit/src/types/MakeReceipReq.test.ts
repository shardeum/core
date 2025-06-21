import { Utils } from '@shardeum-foundation/lib-types'
import { VectorBufferStream } from '@src/utils/serialization/VectorBufferStream'
import {
  MakeReceiptReq,
  serializeMakeReceiptReq,
  deserializeMakeReceiptReq,
  cMakeReceiptReqVersion,
} from '@src/types/MakeReceipReq'
import { TypeIdentifierEnum } from '@src/types/enum/TypeIdentifierEnum'
import { verifyPayload } from '@src/types/ajv/Helpers'
import { AJVSchemaEnum } from '@src/types/enum/AJVSchemaEnum'

jest.mock('@shardeum-foundation/lib-types')
jest.mock('@src/types/ajv/Helpers')

describe('MakeReceipReq', () => {
  const mockUtils = Utils as jest.Mocked<typeof Utils>
  const mockVerifyPayload = verifyPayload as jest.MockedFunction<typeof verifyPayload>

  beforeEach(() => {
    jest.clearAllMocks()
    mockUtils.safeStringify = jest.fn()
    mockUtils.safeJsonParse = jest.fn()
    mockVerifyPayload.mockReturnValue(undefined)
  })

  describe('constants', () => {
    it('should have correct version', () => {
      expect(cMakeReceiptReqVersion).toBe(1)
    })
  })

  describe('serializeMakeReceiptReq', () => {
    let stream: VectorBufferStream
    let mockObj: MakeReceiptReq

    beforeEach(() => {
      stream = new VectorBufferStream(0)
      stream.writeInt16 = jest.fn()
      stream.writeUInt8 = jest.fn()
      stream.writeString = jest.fn()
      stream.writeBigUInt64 = jest.fn()

      mockObj = {
        sign: {
          owner: 'owner123',
          sig: 'signature456',
        },
        address: 'addr789',
        addressHash: 'hash123',
        value: { test: 'data' },
        when: 1234567890,
        source: 'source123',
        txId: 'tx456',
        afterStateHash: 'afterhash789',
      }

      mockUtils.safeStringify.mockReturnValue('{"test":"data"}')
    })

    it('should serialize object with root flag', () => {
      serializeMakeReceiptReq(stream, mockObj, true)

      expect(stream.writeInt16).toHaveBeenCalledWith(TypeIdentifierEnum.cMakeReceiptReq)
      expect(stream.writeUInt8).toHaveBeenCalledWith(cMakeReceiptReqVersion)
      expect(stream.writeString).toHaveBeenCalledWith('owner123')
      expect(stream.writeString).toHaveBeenCalledWith('signature456')
      expect(stream.writeString).toHaveBeenCalledWith('addr789')
      expect(stream.writeString).toHaveBeenCalledWith('hash123')
      expect(stream.writeString).toHaveBeenCalledWith('{"test":"data"}')
      expect(stream.writeBigUInt64).toHaveBeenCalledWith(BigInt(1234567890))
      expect(stream.writeString).toHaveBeenCalledWith('source123')
      expect(stream.writeString).toHaveBeenCalledWith('tx456')
      expect(stream.writeString).toHaveBeenCalledWith('afterhash789')
      expect(mockUtils.safeStringify).toHaveBeenCalledWith({ test: 'data' })
    })

    it('should serialize object without root flag', () => {
      serializeMakeReceiptReq(stream, mockObj, false)

      expect(stream.writeInt16).not.toHaveBeenCalled()
      expect(stream.writeUInt8).toHaveBeenCalledWith(cMakeReceiptReqVersion)
      expect(stream.writeString).toHaveBeenCalledTimes(8)
    })

    it('should serialize object with default root flag', () => {
      serializeMakeReceiptReq(stream, mockObj)

      expect(stream.writeInt16).not.toHaveBeenCalled()
      expect(stream.writeUInt8).toHaveBeenCalledWith(cMakeReceiptReqVersion)
    })

    it('should handle empty strings in object', () => {
      const emptyObj: MakeReceiptReq = {
        sign: { owner: '', sig: '' },
        address: '',
        addressHash: '',
        value: null,
        when: 0,
        source: '',
        txId: '',
        afterStateHash: '',
      }

      mockUtils.safeStringify.mockReturnValue('null')

      serializeMakeReceiptReq(stream, emptyObj)

      expect(stream.writeString).toHaveBeenCalledWith('')
      expect(stream.writeBigUInt64).toHaveBeenCalledWith(BigInt(0))
      expect(mockUtils.safeStringify).toHaveBeenCalledWith(null)
    })

    it('should handle complex value objects', () => {
      const complexObj: MakeReceiptReq = {
        ...mockObj,
        value: { nested: { deep: { data: [1, 2, 3] } }, array: ['a', 'b', 'c'] },
      }

      const complexJsonString = '{"nested":{"deep":{"data":[1,2,3]}},"array":["a","b","c"]}'
      mockUtils.safeStringify.mockReturnValue(complexJsonString)

      serializeMakeReceiptReq(stream, complexObj)

      expect(mockUtils.safeStringify).toHaveBeenCalledWith(complexObj.value)
      expect(stream.writeString).toHaveBeenCalledWith(complexJsonString)
    })

    it('should handle very large timestamp values', () => {
      const largeTimestampObj: MakeReceiptReq = {
        ...mockObj,
        when: Number.MAX_SAFE_INTEGER,
      }

      serializeMakeReceiptReq(stream, largeTimestampObj)

      expect(stream.writeBigUInt64).toHaveBeenCalledWith(BigInt(Number.MAX_SAFE_INTEGER))
    })
  })

  describe('deserializeMakeReceiptReq', () => {
    let stream: VectorBufferStream

    beforeEach(() => {
      stream = new VectorBufferStream(0)
      stream.readUInt8 = jest.fn().mockReturnValue(cMakeReceiptReqVersion)
      stream.readString = jest.fn()
      stream.readBigUInt64 = jest.fn().mockReturnValue(BigInt(1234567890))

      const stringCallSequence = [
        'owner123',
        'signature456',
        'addr789',
        'hash123',
        '{"test":"data"}',
        'source123',
        'tx456',
        'afterhash789',
      ]
      stream.readString = jest.fn()
        .mockReturnValueOnce(stringCallSequence[0])
        .mockReturnValueOnce(stringCallSequence[1])
        .mockReturnValueOnce(stringCallSequence[2])
        .mockReturnValueOnce(stringCallSequence[3])
        .mockReturnValueOnce(stringCallSequence[4])
        .mockReturnValueOnce(stringCallSequence[5])
        .mockReturnValueOnce(stringCallSequence[6])
        .mockReturnValueOnce(stringCallSequence[7])

      mockUtils.safeJsonParse.mockReturnValue({ test: 'data' })
    })

    it('should deserialize object successfully', () => {
      const result = deserializeMakeReceiptReq(stream)

      expect(result).toEqual({
        sign: {
          owner: 'owner123',
          sig: 'signature456',
        },
        address: 'addr789',
        addressHash: 'hash123',
        value: { test: 'data' },
        when: 1234567890,
        source: 'source123',
        txId: 'tx456',
        afterStateHash: 'afterhash789',
      })

      expect(stream.readUInt8).toHaveBeenCalledTimes(1)
      expect(stream.readString).toHaveBeenCalledTimes(8)
      expect(stream.readBigUInt64).toHaveBeenCalledTimes(1)
      expect(mockUtils.safeJsonParse).toHaveBeenCalledWith('{"test":"data"}')
      expect(mockVerifyPayload).toHaveBeenCalledWith(AJVSchemaEnum.MakeReceiptReq, expect.any(Object))
    })

    it('should throw error for invalid version', () => {
      stream.readUInt8 = jest.fn().mockReturnValue(999)

      expect(() => deserializeMakeReceiptReq(stream)).toThrow('Invalid version 999 for MakeReceiptReq')
      expect(mockVerifyPayload).not.toHaveBeenCalled()
    })

    it('should throw error when version is higher than current', () => {
      stream.readUInt8 = jest.fn().mockReturnValue(cMakeReceiptReqVersion + 1)

      expect(() => deserializeMakeReceiptReq(stream)).toThrow(
        `Invalid version ${cMakeReceiptReqVersion + 1} for MakeReceiptReq`
      )
    })

    it('should throw error when AJV validation fails', () => {
      mockVerifyPayload.mockReturnValue(['validation error'])

      expect(() => deserializeMakeReceiptReq(stream)).toThrow('Data validation error')
      expect(mockVerifyPayload).toHaveBeenCalledWith(AJVSchemaEnum.MakeReceiptReq, expect.any(Object))
    })

    it('should handle empty validation errors array', () => {
      mockVerifyPayload.mockReturnValue([])

      const result = deserializeMakeReceiptReq(stream)

      expect(result).toBeDefined()
      expect(result.sign.owner).toBe('owner123')
    })

    it('should handle null validation result', () => {
      mockVerifyPayload.mockReturnValue(null)

      const result = deserializeMakeReceiptReq(stream)

      expect(result).toBeDefined()
      expect(result.sign.owner).toBe('owner123')
    })

    it('should handle undefined validation result', () => {
      mockVerifyPayload.mockReturnValue(undefined)

      const result = deserializeMakeReceiptReq(stream)

      expect(result).toBeDefined()
      expect(result.sign.owner).toBe('owner123')
    })

    it('should convert BigInt timestamp to number correctly', () => {
      stream.readBigUInt64 = jest.fn().mockReturnValue(BigInt(9876543210))

      const result = deserializeMakeReceiptReq(stream)

      expect(result.when).toBe(9876543210)
      expect(typeof result.when).toBe('number')
    })

    it('should handle very large timestamp values', () => {
      stream.readBigUInt64 = jest.fn().mockReturnValue(BigInt(Number.MAX_SAFE_INTEGER))

      const result = deserializeMakeReceiptReq(stream)

      expect(result.when).toBe(Number.MAX_SAFE_INTEGER)
    })

    it('should handle JSON parsing of null value', () => {
      stream.readString = jest.fn()
        .mockReturnValueOnce('owner123')
        .mockReturnValueOnce('signature456')
        .mockReturnValueOnce('addr789')
        .mockReturnValueOnce('hash123')
        .mockReturnValueOnce('null')
        .mockReturnValueOnce('source123')
        .mockReturnValueOnce('tx456')
        .mockReturnValueOnce('afterhash789')

      mockUtils.safeJsonParse.mockReturnValue(null)

      const result = deserializeMakeReceiptReq(stream)

      expect(result.value).toBeNull()
      expect(mockUtils.safeJsonParse).toHaveBeenCalledWith('null')
    })

    it('should handle JSON parsing of complex objects', () => {
      const complexValue = { nested: { data: [1, 2, 3] }, flag: true }
      stream.readString = jest.fn()
        .mockReturnValueOnce('owner123')
        .mockReturnValueOnce('signature456')
        .mockReturnValueOnce('addr789')
        .mockReturnValueOnce('hash123')
        .mockReturnValueOnce('{"nested":{"data":[1,2,3]},"flag":true}')
        .mockReturnValueOnce('source123')
        .mockReturnValueOnce('tx456')
        .mockReturnValueOnce('afterhash789')

      mockUtils.safeJsonParse.mockReturnValue(complexValue)

      const result = deserializeMakeReceiptReq(stream)

      expect(result.value).toEqual(complexValue)
    })
  })

  describe('serialization round-trip', () => {
    it('should maintain data integrity through serialize/deserialize cycle', () => {
      const originalObj: MakeReceiptReq = {
        sign: {
          owner: 'test-owner',
          sig: 'test-signature',
        },
        address: 'test-address',
        addressHash: 'test-hash',
        value: { complex: { nested: true }, array: [1, 2, 3] },
        when: 1234567890,
        source: 'test-source',
        txId: 'test-tx-id',
        afterStateHash: 'test-after-hash',
      }

      mockUtils.safeStringify.mockImplementation((val) => JSON.stringify(val))
      mockUtils.safeJsonParse.mockImplementation((str) => JSON.parse(str))

      const stream = new VectorBufferStream(1000)
      serializeMakeReceiptReq(stream, originalObj)

      stream.position = 0
      const deserializedObj = deserializeMakeReceiptReq(stream)

      expect(deserializedObj).toEqual(originalObj)
    })
  })

  describe('edge cases', () => {
    it('should handle empty strings in all fields', () => {
      const emptyObj: MakeReceiptReq = {
        sign: { owner: '', sig: '' },
        address: '',
        addressHash: '',
        value: '',
        when: 0,
        source: '',
        txId: '',
        afterStateHash: '',
      }

      mockUtils.safeStringify.mockReturnValue('""')
      mockUtils.safeJsonParse.mockReturnValue('')

      const stream = new VectorBufferStream(1000)
      serializeMakeReceiptReq(stream, emptyObj)

      stream.position = 0
      const result = deserializeMakeReceiptReq(stream)

      expect(result.sign.owner).toBe('')
      expect(result.address).toBe('')
      expect(result.value).toBe('')
    })

    it('should handle special characters in string fields', () => {
      const specialCharsObj: MakeReceiptReq = {
        sign: {
          owner: 'owner-with-special-chars-!@#$%^&*()',
          sig: 'sig-with-unicode-测试',
        },
        address: 'address-with-newlines\n\r\t',
        addressHash: 'hash-with-quotes-"\'',
        value: { special: 'chars-测试-!@#$%^&*()' },
        when: 1234567890,
        source: 'source-with-backslash-\\',
        txId: 'tx-with-brackets-[]{}',
        afterStateHash: 'after-hash-with-spaces- - -',
      }

      mockUtils.safeStringify.mockImplementation((val) => JSON.stringify(val))
      mockUtils.safeJsonParse.mockImplementation((str) => JSON.parse(str))

      const stream = new VectorBufferStream(1000)
      serializeMakeReceiptReq(stream, specialCharsObj)

      stream.position = 0
      const result = deserializeMakeReceiptReq(stream)

      expect(result.sign.owner).toBe(specialCharsObj.sign.owner)
      expect(result.sign.sig).toBe(specialCharsObj.sign.sig)
      expect(result.address).toBe(specialCharsObj.address)
      expect(result.value).toEqual(specialCharsObj.value)
    })
  })
})