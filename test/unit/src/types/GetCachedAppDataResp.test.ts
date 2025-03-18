import { Utils } from '@shardeum-foundation/lib-types'
import { initAjvSchemas } from '../../../../src/types/ajv/Helpers'
import {
  deserializeGetCachedAppDataResp,
  GetCachedAppDataResp,
  serializeGetCachedAppDataResp,
} from '../../../../src/types/GetCachedAppDataResp'
import { VectorBufferStream } from '../../../../src'

import { beforeEachHandler } from './stateManagerSerializeMocks'

jest.mock('../../../../src/p2p/Context', () => ({
  stateManager: {
    app: {
      binarySerializeObject: jest.fn(),
      binaryDeserializeObject: jest.fn(),
    }
  },
  setDefaultConfigs: jest.fn(),
}))

describe('GetCachedAppDataResp serialization and deserialization', () => {
  beforeEach(() => {
    beforeEachHandler()
  })

  beforeAll(() => {
    initAjvSchemas()
  })

  test('combined serialization and deserialization happy case', () => {
    const stream = new VectorBufferStream(0)
    const request: GetCachedAppDataResp = {
      cachedAppData: {
        dataID: 'testDataId',
        appData: { hello: 'world' },
        cycle: 1,
      },
    }
    serializeGetCachedAppDataResp(stream, request)
    stream.position = 0

    const deserialized = deserializeGetCachedAppDataResp(stream)

    expect(deserialized).toEqual(request)
  })

  test('combined serialization and deserialization happy case without any cached app data', () => {
    const stream = new VectorBufferStream(0)
    const request: GetCachedAppDataResp = {}
    serializeGetCachedAppDataResp(stream, request)
    stream.position = 0

    const deserialized = deserializeGetCachedAppDataResp(stream)

    expect(deserialized).toEqual(request)
  })

  test('invalid deserialised payload ajv fail', () => {
    try {
      const stream = new VectorBufferStream(0)
      const request: GetCachedAppDataResp = {
        cachedAppData: {
          dataID: 'testDataId',
          appData: { hello: 'world' },
          cycle: 1,
        },
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const req = request as any
      delete req.topic
      req.hello = 'world'
      serializeGetCachedAppDataResp(stream, req)
      stream.position = 0

      deserializeGetCachedAppDataResp(stream)
    } catch (e) {
      expect(e).toBeDefined()
    }
  })
})
