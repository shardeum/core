import { VectorBufferStream } from '../../../../src/utils/serialization/VectorBufferStream'
import {
  cSignAppDataReqVersion,
  deserializeSignAppDataReq,
  serializeSignAppDataReq,
  SignAppDataReq,
} from '../../../../src/types/SignAppDataReq'
import { TypeIdentifierEnum } from '../../../../src/types/enum/TypeIdentifierEnum'
import { initSignAppDataReq } from '../../../../src/types/ajv/SignAppDataReq'
import { stateManager } from '@src/p2p/Context'
import { Utils } from '@shardeum-foundation/lib-types'
import { AppObjEnum } from '../../../../src/types/enum/AppObjEnum'
describe('SignAppDataReq Tests', () => {
  beforeEach(() => {
    (stateManager as any) = {
      app: {
        binarySerializeObject: jest.fn((_, data: any) =>
          Buffer.from(Utils.safeStringify(data), 'utf8')
        ),
        binaryDeserializeObject: jest.fn((_, buffer: Buffer) =>
          Utils.safeJsonParse(buffer.toString('utf8'))
        ),
      },
    }
  })

  beforeAll(() => {
    initSignAppDataReq()
  })

  describe('Serialization Tests', () => {
    test('Serialize valid data with root true', () => {
      const obj: SignAppDataReq = {
        type: 'type1',
        nodesToSign: 2,
        hash: 'hash123',
        appData: 'appData123',
      }
      const stream = new VectorBufferStream(0)
      serializeSignAppDataReq(stream, obj, true)
      const expectedStream = new VectorBufferStream(0)
      expectedStream.writeUInt16(TypeIdentifierEnum.cSignAppDataReq)
      expectedStream.writeUInt8(cSignAppDataReqVersion)
      expectedStream.writeString('type1')
      expectedStream.writeUInt8(2)
      expectedStream.writeString('hash123')
      expectedStream.writeBuffer(stateManager.app.binarySerializeObject(AppObjEnum.AppData, 'appData123'))

      expect(stream.getBuffer()).toEqual(expectedStream.getBuffer())
    })

    test('Serialize empty array with root false', () => {
      const obj: SignAppDataReq = {
        type: 'type1',
        nodesToSign: 3,
        hash: 'hash123',
        appData: 'appData123',
      }
      const stream = new VectorBufferStream(0)
      serializeSignAppDataReq(stream, obj, false)
      const expectedStream = new VectorBufferStream(0)
      expectedStream.writeUInt8(cSignAppDataReqVersion)
      expectedStream.writeString('type1')
      expectedStream.writeUInt8(3)
      expectedStream.writeString('hash123')
      expectedStream.writeBuffer(stateManager.app.binarySerializeObject(AppObjEnum.AppData, 'appData123'))

      expect(stream.getBuffer()).toEqual(expectedStream.getBuffer())
    })
  })

  describe('Deserialization Tests', () => {
    test('Deserialize valid data', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cSignAppDataReqVersion)
      stream.writeString('type1')
      stream.writeUInt8(2)
      stream.writeString('hash123')
      stream.writeBuffer(stateManager.app.binarySerializeObject(AppObjEnum.AppData, 'appData123'))
      stream.position = 0

      const result = deserializeSignAppDataReq(stream)
      expect(result).toEqual({
        type: 'type1',
        nodesToSign: 2,
        hash: 'hash123',
        appData: 'appData123',
      })
    })

    test('Version mismatch error', () => {
      const stream = new VectorBufferStream(0)
      stream.writeUInt8(cSignAppDataReqVersion + 1)
      stream.position = 0

      expect(() => deserializeSignAppDataReq(stream)).toThrow('SignAppDataReq version mismatch')
    })
  })

  describe('SignAppDataReq Serialization and Deserialization Together', () => {
    test('Correct round-trip for non-empty array', () => {
      const originalObj: SignAppDataReq = {
        type: 'type1',
        nodesToSign: 3,
        hash: 'hash123',
        appData: 'appData123',
      }
      const stream = new VectorBufferStream(0)
      serializeSignAppDataReq(stream, originalObj, false)
      stream.position = 0

      const deserializedObj = deserializeSignAppDataReq(stream)
      expect(deserializedObj).toEqual(originalObj)
    })
  })
})
