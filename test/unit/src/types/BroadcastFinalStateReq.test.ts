import { Utils } from '@shardeum-foundation/lib-types'
import { initAjvSchemas } from '../../../../src/types/ajv/Helpers'
import { TypeIdentifierEnum } from '../../../../src/types/enum/TypeIdentifierEnum'
import { serializeWrappedDataResponse } from '../../../../src/types/WrappedDataResponse'
import { VectorBufferStream } from '../../../../src'
import {
  BroadcastFinalStateReq,
  cBroadcastFinalStateReqVersion,
  deserializeBroadcastFinalStateReq,
  serializeBroadcastFinalStateReq,
} from '../../../../src/types/BroadcastFinalStateReq'
import { stateManager } from '@src/p2p/Context'
import { beforeEachHandler } from './stateManagerSerializeMocks'

jest.mock('../../../../src/p2p/Context', () => ({
  stateManager: {
    app: {
      binarySerializeObject: jest.fn(),
      binaryDeserializeObject: jest.fn(),
    },
  },
  setDefaultConfigs: jest.fn(),
}))

describe('BroadcastFinalStateReq', () => {
  beforeAll(() => {
    initAjvSchemas()
  })
  beforeEach(() => {
    beforeEachHandler()
  })

  describe('BroadcastFinalStateReq Serialization Tests', () => {
    test('Serialize BroadcastFinalStateReq with Valid Input Correctly, root true', () => {
      const stream = new VectorBufferStream(0)
      const obj: BroadcastFinalStateReq = {
        txid: 'testTxid',
        stateList: [
          {
            accountCreated: true,
            isPartial: true,
            accountId: 'id1',
            stateId: 'stateid2',
            data: {},
            timestamp: 12345678,
          },
        ],
      }
      serializeBroadcastFinalStateReq(stream, obj, true)

      const expectedStream = new VectorBufferStream(0)
      expectedStream.writeUInt16(TypeIdentifierEnum.cBroadcastFinalStateReq)
      expectedStream.writeUInt8(cBroadcastFinalStateReqVersion)
      expectedStream.writeString(obj.txid)
      expectedStream.writeUInt16(obj.stateList.length)
      obj.stateList.forEach((item) => serializeWrappedDataResponse(expectedStream, item))

      expect(stream.getBuffer()).toEqual(expectedStream.getBuffer())
    })

    test('Handle Empty StateList Correctly', () => {
      const stream = new VectorBufferStream(0)
      const obj: BroadcastFinalStateReq = { txid: 'testTxid', stateList: [] }
      serializeBroadcastFinalStateReq(stream, obj, true)

      const expectedStream = new VectorBufferStream(0)
      expectedStream.writeUInt16(TypeIdentifierEnum.cBroadcastFinalStateReq)
      expectedStream.writeUInt8(cBroadcastFinalStateReqVersion)
      expectedStream.writeString(obj.txid)
      expectedStream.writeUInt16(obj.stateList.length)
      obj.stateList.forEach((item) => serializeWrappedDataResponse(expectedStream, item))

      expect(stream.getBuffer()).toEqual(expectedStream.getBuffer())
    })

    test('Serialize with Root Flag Set to False', () => {
      const stream = new VectorBufferStream(0)
      const obj: BroadcastFinalStateReq = {
        txid: 'testTxid',
        stateList: [
          {
            accountCreated: true,
            isPartial: true,
            accountId: 'id1',
            stateId: 'stateid2',
            data: {},
            timestamp: 12345678,
          },
        ],
      }
      serializeBroadcastFinalStateReq(stream, obj, false)

      const expectedStream = new VectorBufferStream(0)
      expectedStream.writeUInt8(cBroadcastFinalStateReqVersion)
      expectedStream.writeString(obj.txid)
      expectedStream.writeUInt16(obj.stateList.length)
      obj.stateList.forEach((item) => serializeWrappedDataResponse(expectedStream, item))

      expect(stream.getBuffer()).toEqual(expectedStream.getBuffer())
    })
  })

  describe('BroadcastFinalStateReq Deserialization Tests', () => {
    test('Deserialize Data Correctly', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cBroadcastFinalStateReqVersion)
      stream.writeString('testTxid')
      stream.writeUInt16(1)
      serializeWrappedDataResponse(stream, {
        accountCreated: true,
        isPartial: true,
        accountId: 'id1',
        stateId: 'stateid2',
        data: {},
        timestamp: 12345678,
      })

      stream.position = 0
      const result = deserializeBroadcastFinalStateReq(stream)

      const expected: BroadcastFinalStateReq = {
        txid: 'testTxid',
        stateList: [
          {
            accountCreated: true,
            isPartial: true,
            accountId: 'id1',
            stateId: 'stateid2',
            data: {},
            timestamp: 12345678,
          },
        ],
      }
      expect(result).toEqual(expected)
    })

    test('Throw Error on Version Mismatch', () => {
      const obj: BroadcastFinalStateReq = {
        txid: 'testTxid',
        stateList: [
          {
            accountCreated: true,
            isPartial: true,
            accountId: 'id1',
            stateId: 'stateid2',
            data: {},
            timestamp: 12345678,
          },
        ],
      }
      const stream = new VectorBufferStream(0)
      serializeBroadcastFinalStateReq(stream, obj, false)
      // Manually increase the version number in the buffer to simulate a mismatch
      const buffer = stream.getBuffer()
      buffer[0] = cBroadcastFinalStateReqVersion + 1
      const alteredStream = VectorBufferStream.fromBuffer(buffer)

      expect(() => deserializeBroadcastFinalStateReq(alteredStream)).toThrow('BroadcastFinalStateReq version mismatch')
    })
  })

  describe('BroadcastFinalStateReq Round-trip Tests', () => {
    test('Maintain Data Integrity Through Serialization and Deserialization', () => {
      const stream = new VectorBufferStream(0)
      const obj: BroadcastFinalStateReq = {
        txid: 'testTxid',
        stateList: [
          {
            accountCreated: true,
            isPartial: true,
            accountId: 'id1',
            stateId: 'stateid2',
            data: {},
            timestamp: 12345678,
          },
        ],
      }
      serializeBroadcastFinalStateReq(stream, obj, false)
      stream.position = 0

      const result = deserializeBroadcastFinalStateReq(stream)

      expect(result).toEqual(obj)
    })
  })
})
