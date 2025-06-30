import { VectorBufferStream } from '../../../src/utils/serialization/VectorBufferStream'
import { serializePoqoSendVoteReq, deserializePoqoSendVoteReq } from '../../../src/types/PoqoSendVoteReq'
import { TypeIdentifierEnum } from '../../../src/types/enum/TypeIdentifierEnum'
import * as SpreadAppliedVoteHashReq from '../../../src/types/SpreadAppliedVoteHashReq'
import { AppliedVoteHash } from '../../../src/state-manager/state-manager-types'

// Mock the SpreadAppliedVoteHashReq module
jest.mock('../../../src/types/SpreadAppliedVoteHashReq')

describe('PoqoSendVoteReq', () => {
  let mockSerializeSpreadAppliedVoteHashReq: jest.SpyInstance
  let mockDeserializeSpreadAppliedVoteHashReq: jest.SpyInstance

  beforeEach(() => {
    mockSerializeSpreadAppliedVoteHashReq = SpreadAppliedVoteHashReq.serializeSpreadAppliedVoteHashReq as jest.Mock
    mockDeserializeSpreadAppliedVoteHashReq = SpreadAppliedVoteHashReq.deserializeSpreadAppliedVoteHashReq as jest.Mock
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('serializePoqoSendVoteReq', () => {
    it('should serialize with root flag true', () => {
      const stream = new VectorBufferStream(0)
      const writeUInt16Spy = jest.spyOn(stream, 'writeUInt16')
      const writeUInt8Spy = jest.spyOn(stream, 'writeUInt8')

      const appliedVoteHash: AppliedVoteHash = {
        txid: 'test-tx-id',
        voteHash: 'test-vote-hash',
        voteTime: 123456789,
      }

      serializePoqoSendVoteReq(stream, appliedVoteHash, true)

      expect(writeUInt16Spy).toHaveBeenCalledWith(TypeIdentifierEnum.cPoqoSendVoteReq)
      expect(writeUInt8Spy).toHaveBeenCalledWith(1) // version
      expect(mockSerializeSpreadAppliedVoteHashReq).toHaveBeenCalledWith(stream, appliedVoteHash)
    })

    it('should serialize without root flag', () => {
      const stream = new VectorBufferStream(0)
      const writeUInt16Spy = jest.spyOn(stream, 'writeUInt16')
      const writeUInt8Spy = jest.spyOn(stream, 'writeUInt8')

      const appliedVoteHash: AppliedVoteHash = {
        txid: 'test-tx-id',
        voteHash: 'test-vote-hash',
        voteTime: 123456789,
      }

      serializePoqoSendVoteReq(stream, appliedVoteHash, false)

      expect(writeUInt16Spy).not.toHaveBeenCalled()
      expect(writeUInt8Spy).toHaveBeenCalledWith(1) // version only
      expect(mockSerializeSpreadAppliedVoteHashReq).toHaveBeenCalledWith(stream, appliedVoteHash)
    })

    it('should serialize with default root flag (false)', () => {
      const stream = new VectorBufferStream(0)
      const writeUInt16Spy = jest.spyOn(stream, 'writeUInt16')
      const writeUInt8Spy = jest.spyOn(stream, 'writeUInt8')

      const appliedVoteHash: AppliedVoteHash = {
        txid: 'test-tx-id',
        voteHash: 'test-vote-hash',
        voteTime: 123456789,
      }

      serializePoqoSendVoteReq(stream, appliedVoteHash)

      expect(writeUInt16Spy).not.toHaveBeenCalled()
      expect(writeUInt8Spy).toHaveBeenCalledWith(1) // version only
      expect(mockSerializeSpreadAppliedVoteHashReq).toHaveBeenCalledWith(stream, appliedVoteHash)
    })

    it('should handle different AppliedVoteHash objects', () => {
      const stream = new VectorBufferStream(0)

      const testCases: AppliedVoteHash[] = [
        {
          txid: 'tx1',
          voteHash: 'hash1',
          voteTime: 111,
        },
        {
          txid: '',
          voteHash: '',
          voteTime: 0,
        },
        {
          txid: 'very-long-transaction-id-with-many-characters',
          voteHash: 'very-long-vote-hash-with-many-characters',
          voteTime: 999999999,
        },
      ]

      testCases.forEach(testCase => {
        serializePoqoSendVoteReq(stream, testCase)
        expect(mockSerializeSpreadAppliedVoteHashReq).toHaveBeenCalledWith(stream, testCase)
      })
    })
  })

  describe('deserializePoqoSendVoteReq', () => {
    it('should deserialize with correct version', () => {
      const stream = new VectorBufferStream(0)
      const readUInt8Spy = jest.spyOn(stream, 'readUInt8').mockReturnValue(1)

      const expectedResult = {
        txid: 'test-tx-id',
        voteHash: 'test-vote-hash',
        voteTime: 123456789,
      }

      mockDeserializeSpreadAppliedVoteHashReq.mockReturnValue(expectedResult)

      const result = deserializePoqoSendVoteReq(stream)

      expect(readUInt8Spy).toHaveBeenCalled()
      expect(mockDeserializeSpreadAppliedVoteHashReq).toHaveBeenCalledWith(stream)
      expect(result).toEqual(expectedResult)
    })

    it('should throw error for version mismatch', () => {
      const stream = new VectorBufferStream(0)
      jest.spyOn(stream, 'readUInt8').mockReturnValue(2) // wrong version

      expect(() => deserializePoqoSendVoteReq(stream)).toThrow('PoqoSendVoteReq version mismatch')
      expect(mockDeserializeSpreadAppliedVoteHashReq).not.toHaveBeenCalled()
    })

    it('should throw error for version 0', () => {
      const stream = new VectorBufferStream(0)
      jest.spyOn(stream, 'readUInt8').mockReturnValue(0)

      expect(() => deserializePoqoSendVoteReq(stream)).toThrow('PoqoSendVoteReq version mismatch')
    })

    it('should throw error for version 255', () => {
      const stream = new VectorBufferStream(0)
      jest.spyOn(stream, 'readUInt8').mockReturnValue(255)

      expect(() => deserializePoqoSendVoteReq(stream)).toThrow('PoqoSendVoteReq version mismatch')
    })

    it('should pass through the result from deserializeSpreadAppliedVoteHashReq', () => {
      const stream = new VectorBufferStream(0)
      jest.spyOn(stream, 'readUInt8').mockReturnValue(1)

      const differentResults = [
        {
          txid: 'result1',
          voteHash: 'hash1',
          voteTime: 111,
        },
        {
          txid: 'result2',
          voteHash: 'hash2',
          voteTime: 222,
        },
      ]

      differentResults.forEach(expectedResult => {
        mockDeserializeSpreadAppliedVoteHashReq.mockReturnValue(expectedResult)
        const result = deserializePoqoSendVoteReq(stream)
        expect(result).toEqual(expectedResult)
      })
    })
  })

  describe('integration test', () => {
    it('should serialize and deserialize correctly', () => {
      // Create mock functions for serialization/deserialization
      mockSerializeSpreadAppliedVoteHashReq.mockImplementation((stream, data) => {
        // Simple mock serialization
        stream.writeString(data.txid)
        stream.writeString(data.voteHash)
        stream.writeUInt32(data.voteTime)
      })

      mockDeserializeSpreadAppliedVoteHashReq.mockImplementation((stream) => {
        // Simple mock deserialization
        return {
          txid: stream.readString(),
          voteHash: stream.readString(),
          voteTime: stream.readUInt32(),
        }
      })

      const stream = new VectorBufferStream(0)
      const originalData: AppliedVoteHash = {
        txid: 'test-tx-id',
        voteHash: 'test-vote-hash',
        voteTime: 123456789,
      }

      // Serialize
      serializePoqoSendVoteReq(stream, originalData, true)

      // Reset stream position
      stream.position = 0

      // Skip type identifier if root was true
      stream.readUInt16()

      // Deserialize
      const result = deserializePoqoSendVoteReq(stream)

      expect(result.txid).toBe(originalData.txid)
      expect(result.voteHash).toBe(originalData.voteHash)
      expect(result.voteTime).toBe(originalData.voteTime)
    })
  })
})