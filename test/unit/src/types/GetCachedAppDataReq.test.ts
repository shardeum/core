import { Utils } from '@shardeum-foundation/lib-types'
import { initAjvSchemas } from '../../../../src/types/ajv/Helpers'
import {
  deserializeGetCachedAppDataReq,
  GetCachedAppDataReq,
  serializeGetCachedAppDataReq,
} from '../../../../src/types/GetCachedAppDataReq'
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
describe('GetCachedAppDataReq serialization and deserialization', () => {
  beforeEach(() => {
    beforeEachHandler() 
  })
  
  beforeAll(() => {
    initAjvSchemas()
  })

  test('combined serialization and deserialization happy case', () => {
    const stream = new VectorBufferStream(0)
    const request: GetCachedAppDataReq = { topic: 'testTopic', dataId: 'testDataId' }
    serializeGetCachedAppDataReq(stream, request)
    stream.position = 0

    const deserialized = deserializeGetCachedAppDataReq(stream)

    expect(deserialized).toEqual(request)
  })

  test('invalid deserialised payload ajv fail', () => {
    try {
      const stream = new VectorBufferStream(0)
      const request: GetCachedAppDataReq = { topic: 'testTopic', dataId: 'testDataId' }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const req = request as any
      delete req.topic
      req.hello = 'world'
      serializeGetCachedAppDataReq(stream, req)
      stream.position = 0

      deserializeGetCachedAppDataReq(stream)
    } catch (e) {
      expect(e).toBeDefined()
    }
  })
})
