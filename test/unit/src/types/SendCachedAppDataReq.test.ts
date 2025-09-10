import { Utils } from '@shardeum-foundation/lib-types'
import { VectorBufferStream } from '../../../../src'
import { initAjvSchemas, verifyPayload } from '../../../../src/types/ajv/Helpers'
import { AppObjEnum } from '../../../../src/types/enum/AppObjEnum'
import { TypeIdentifierEnum } from '../../../../src/types/enum/TypeIdentifierEnum'

import {
  deserializeSendCachedAppDataReq,
  SendCachedAppDataReq,
  serializeSendCachedAppDataReq,
} from '../../../../src/types/SendCachedAppDataReq'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'
import { stateManager } from '@src/p2p/Context'
const cSendCachedAppDataReqVersion = 1

describe('SendCachedAppDataReq Serialization and Deserialization', () => {
  beforeEach(() => {
    ;(stateManager as any) = {
      app: {
        binarySerializeObject: jest.fn((_, data: any) => Buffer.from(Utils.safeStringify(data), 'utf8')),
        binaryDeserializeObject: jest.fn((_, buffer: Buffer) => Utils.safeJsonParse(buffer.toString('utf8'))),
      },
    }
  })

  beforeAll(() => {
    initAjvSchemas()
  })

  describe('serializeSendCachedAppDataReq Serialization', () => {
    test('should serialize with root true', () => {
      const obj: SendCachedAppDataReq = {
        topic: 'test',
        txId: 'test',
        executionShardKey: 'test',
        cachedAppData: {
          cycle: 1,
          appData: { data: 'test' },
          dataID: 'test',
        },
      }

      const stream = new VectorBufferStream(0)
      serializeSendCachedAppDataReq(stream, obj, true)

      const expectedStream = new VectorBufferStream(0)
      expectedStream.writeUInt16(TypeIdentifierEnum.cSendCachedAppDataReq)
      expectedStream.writeUInt8(cSendCachedAppDataReqVersion)
      expectedStream.writeString(obj.topic)
      expectedStream.writeString(obj.txId)
      expectedStream.writeString(obj.executionShardKey)
      expectedStream.writeUInt32(obj.cachedAppData.cycle)
      expectedStream.writeBuffer(Buffer.from(Utils.safeStringify(obj.cachedAppData.appData), 'utf8'))
      expectedStream.writeString(obj.cachedAppData.dataID)
      expect(stream.getBuffer()).toEqual(expectedStream.getBuffer())
    })

    test('should serialize with root false', () => {
      const obj: SendCachedAppDataReq = {
        topic: 'test',
        txId: 'test',
        executionShardKey: 'test',
        cachedAppData: {
          cycle: 1,
          appData: { data: 'test' },
          dataID: 'test',
        },
      }

      const stream = new VectorBufferStream(0)
      serializeSendCachedAppDataReq(stream, obj, false)

      const expectedStream = new VectorBufferStream(0)
      expectedStream.writeUInt8(cSendCachedAppDataReqVersion)
      expectedStream.writeString(obj.topic)
      expectedStream.writeString(obj.txId)
      expectedStream.writeString(obj.executionShardKey)
      expectedStream.writeUInt32(obj.cachedAppData.cycle)
      expectedStream.writeBuffer(Buffer.from(Utils.safeStringify(obj.cachedAppData.appData), 'utf8'))
      expectedStream.writeString(obj.cachedAppData.dataID)
      expect(stream.getBuffer()).toEqual(expectedStream.getBuffer())
    })
  })

  describe('deserializeSendCachedAppDataReq Deserialization', () => {
    test('should deserialize', () => {
      const obj: SendCachedAppDataReq = {
        topic: 'test',
        txId: 'test',
        executionShardKey: 'test',
        cachedAppData: {
          cycle: 1,
          appData: { data: 'test' },
          dataID: 'test',
        },
      }

      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cSendCachedAppDataReqVersion)
      stream.writeString(obj.topic)
      stream.writeString(obj.txId)
      stream.writeString(obj.executionShardKey)
      stream.writeUInt32(obj.cachedAppData.cycle)
      stream.writeBuffer(Buffer.from(Utils.safeStringify(obj.cachedAppData.appData), 'utf8'))
      stream.writeString(obj.cachedAppData.dataID)
      stream.position = 0 // Reset position for reading
      const data = deserializeSendCachedAppDataReq(stream)
      expect(data).toEqual(obj)
    })

    test('should throw error on version mismatch', () => {
      const obj: SendCachedAppDataReq = {
        topic: 'test',
        txId: 'test',
        executionShardKey: 'test',
        cachedAppData: {
          cycle: 1,
          appData: { data: 'test' },
          dataID: 'test',
        },
      }

      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cSendCachedAppDataReqVersion + 1)
      stream.writeString(obj.topic)
      stream.writeUInt32(obj.cachedAppData.cycle)
      stream.writeBuffer(Buffer.from(Utils.safeStringify(obj.cachedAppData.appData), 'utf8'))
      stream.writeString(obj.cachedAppData.dataID)
      stream.position = 0 // Reset position for reading

      expect(() => deserializeSendCachedAppDataReq(stream)).toThrow('SendCachedAppDataReq version mismatch')
    })

    test('should serialize and deserialize successfully', () => {
      const obj: SendCachedAppDataReq = {
        topic: 'test',
        txId: 'test',
        executionShardKey: 'test',
        cachedAppData: {
          cycle: 1,
          appData: { data: 'test' },
          dataID: 'test',
        },
      }

      const stream = new VectorBufferStream(0)
      serializeSendCachedAppDataReq(stream, obj)
      stream.position = 0

      const data = deserializeSendCachedAppDataReq(stream)
      expect(data).toEqual(obj)
    })

    test('should throw AJV validation failed error', () => {
      const obj = {
        topic: 'test',
        txId: 'test',
        executionShardKey: 'test',
        cachedAppData: {
          cycle: 1,
          appData: { data: 'test' },
        },
      }

      const errors = verifyPayload(AJVSchemaEnum.SendCachedAppDataReq, obj)
      expect(errors).not.toBeNull()
      expect(errors?.length).toBeGreaterThan(0)
    })

    test('AJV validation success', () => {
      const obj = {
        topic: 'test',
        txId: 'test',
        executionShardKey: 'test',
        cachedAppData: {
          dataID: 'test',
          cycle: 1,
          appData: { data: 'test' },
        },
      }

      const errors = verifyPayload(AJVSchemaEnum.SendCachedAppDataReq, obj)
      expect(errors).toBeNull()
    })
  })
})
