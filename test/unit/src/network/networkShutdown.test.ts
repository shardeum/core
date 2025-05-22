import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals'
import { NetworkClass } from '../../../../src/network'
import SERVER_CONFIG from '../../../../src/config/server'

const createMockLogger = () => ({
  getLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
  playbackLog: jest.fn(),
  setPlaybackIPInfo: jest.fn(),
})

describe('NetworkClass.shutdown', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  test('stopListening timeout does not block shutdown', async () => {
    jest.useFakeTimers()
    const logger = createMockLogger()
    const network = new NetworkClass(SERVER_CONFIG, logger as any)

    network.extServer = { close: jest.fn(), unref: jest.fn() } as any
    const stopListening = jest.fn(() => new Promise(() => {}))
    network.sn = { stopListening }
    network.intServer = {}

    const shutdownPromise = network.shutdown()
    jest.advanceTimersByTime(5000)
    jest.runOnlyPendingTimers()
    await expect(shutdownPromise).resolves.toBeUndefined()
    expect(stopListening).toHaveBeenCalledWith(network.intServer)
  })

  test('stopListening resolves normally', async () => {
    const logger = createMockLogger()
    const network = new NetworkClass(SERVER_CONFIG, logger as any)

    network.extServer = { close: jest.fn(), unref: jest.fn() } as any
    const stopListening = jest.fn(() => Promise.resolve())
    network.sn = { stopListening }
    network.intServer = {}

    await expect(network.shutdown()).resolves.toBeUndefined()
    expect(stopListening).toHaveBeenCalled()
  })
})
