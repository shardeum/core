import { Utils } from '@shardeum-foundation/lib-types'

jest.mock('../../../../src/p2p/Context', () => ({
    stateManager: {
        app: {
        binarySerializeObject: jest.fn(),
        binaryDeserializeObject: jest.fn(),
        }
    },
    setDefaultConfigs: jest.fn(),
}))
  
export const beforeEachHandler = () => {
    const Context = jest.requireMock('../../../../src/p2p/Context')
    jest.spyOn(Context.stateManager.app, 'binarySerializeObject').mockImplementation((_, data: any) =>
        Buffer.from(Utils.safeStringify(data), 'utf8')
    )
    jest.spyOn(Context.stateManager.app, 'binaryDeserializeObject').mockImplementation((_, buffer: Buffer) =>
        Utils.safeJsonParse(buffer.toString('utf8'))
    )
}