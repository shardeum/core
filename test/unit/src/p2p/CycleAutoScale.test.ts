jest.mock('../../../../src/logger', () => ({
  getLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), mainLog_debug: jest.fn(), combine: jest.fn() }),
  logFlags: {},
}))

import { setJoinLimit, getJoinLimit } from '../../../../src/p2p/CycleAutoScale'

describe('CycleAutoScale join limit', () => {
  it('should update join limit', () => {
    setJoinLimit(7)
    expect(getJoinLimit()).toBe(7)
    setJoinLimit(2)
    expect(getJoinLimit()).toBe(2)
  })
})
