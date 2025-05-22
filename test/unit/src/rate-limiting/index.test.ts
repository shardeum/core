import RateLimiting from '../../../../src/rate-limiting'
import * as Context from '../../../../src/p2p/Context'

jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: { countEvent: jest.fn() },
}))

jest.mock('../../../../src/logger', () => ({
  logFlags: { seqdiagram: false },
}))

jest.mock('../../../../src/network', () => ({
  shardusGetTime: jest.fn().mockReturnValue(0),
}))

jest.mock('../../../../src/p2p/NodeList', () => ({
  activeIdToPartition: new Map().set('self', '0'),
}))

jest.mock('../../../../src/p2p/Self', () => ({ id: 'self' }))

const monitorEvent = jest.fn()
const getCurrentNodeLoad = jest.fn()
const getQueueLoad = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  ;(Context as any).shardus = {
    monitorEvent,
    loadDetection: { getCurrentNodeLoad, getQueueLoad },
  }
})

describe('RateLimiting.isOverloaded', () => {
  test('records loadType when throttling occurs', () => {
    const rateLimitConfig = { limitRate: true, loadLimit: { internal: 0.5 } }
    const rl = new RateLimiting(rateLimitConfig, { info: jest.fn() } as any)
    getCurrentNodeLoad.mockReturnValue({ internal: 0.9 })
    getQueueLoad.mockReturnValue({})
    jest.spyOn(Math, 'random').mockReturnValue(0)
    const result = rl.isOverloaded('tx1')
    expect(result).toBe(true)
    expect(monitorEvent).toHaveBeenCalledWith('loadRelated', 'txRejected:internal', 1, '')
  })

  test('does not record when under limit', () => {
    const rateLimitConfig = { limitRate: true, loadLimit: { internal: 0.9 } }
    const rl = new RateLimiting(rateLimitConfig, { info: jest.fn() } as any)
    getCurrentNodeLoad.mockReturnValue({ internal: 0.5 })
    getQueueLoad.mockReturnValue({})
    jest.spyOn(Math, 'random').mockReturnValue(0)
    const result = rl.isOverloaded('tx2')
    expect(result).toBe(false)
    expect(monitorEvent).not.toHaveBeenCalled()
  })
})
