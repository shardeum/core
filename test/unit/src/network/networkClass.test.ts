import { describe, beforeEach, test, expect, jest } from '@jest/globals'

jest.mock('../../../../src/utils/profiler', () => ({
  profilerInstance: {
    profileSectionStart: jest.fn(),
    profileSectionEnd: jest.fn(),
    scopedProfileSectionStart: jest.fn(),
    scopedProfileSectionEnd: jest.fn(),
  },
}))

jest.mock('../../../../src/p2p/NodeList', () => ({
  nodes: new Map(),
  byPubKey: new Map(),
  activeByIdOrder: [],
  byIdOrder: [],
  reset: jest.fn(),
}))

jest.mock('../../../../src/logger', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    getLogger: jest.fn().mockReturnValue({ info: jest.fn(), debug: jest.fn(), error: jest.fn() }),
    setPlaybackIPInfo: jest.fn(),
    playbackLog: jest.fn(),
  })),
  logFlags: { verbose: false, error: false, debug: false, info: false, net_verbose: false, playback: false },
}))

import { NetworkClass } from '../../../../src/network'

// Minimal logger mock used by NetworkClass
const loggerMock = {
  getLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  }),
  setPlaybackIPInfo: jest.fn(),
  playbackLog: jest.fn(),
}

// Basic configuration object with only fields required by NetworkClass
const baseConfig: any = {
  network: { timeout: 5 },
  p2p: {
    useLruCacheForSocketMgmt: false,
    lruCacheSizeForSocketMgmt: 1000,
    payloadSizeLimitInBytes: 1024,
    headerSizeLimitInBytes: 512,
  },
  crypto: { hashKey: 'hash' },
  debug: {},
}

let network: NetworkClass

beforeEach(() => {
  network = new NetworkClass(baseConfig, loggerMock as any)
})

describe('NetworkClass.setup', () => {
  test('calls internal and external setup with valid ipInfo', async () => {
    const ipInfo = {
      externalIp: '1.1.1.1',
      externalPort: 1111,
      internalIp: '2.2.2.2',
      internalPort: 2222,
    }
    const internalSpy = jest
      .spyOn(network as any, '_setupInternal')
      .mockImplementation(() => undefined)
    const externalSpy = jest
      .spyOn(network as any, '_setupExternal')
      .mockResolvedValue('ioMock')

    const result = await network.setup(ipInfo, 'secret')

    expect(internalSpy).toHaveBeenCalled()
    expect(externalSpy).toHaveBeenCalled()
    expect(network.ipInfo).toBe(ipInfo)
    expect(result).toBe('ioMock')
    expect(loggerMock.setPlaybackIPInfo).toHaveBeenCalledWith(ipInfo)
  })

  test('throws error when required ipInfo fields missing', async () => {
    await expect(network.setup({} as any, 'secret')).rejects.toThrow('externalIp')
  })
})

describe('NetworkClass.tell', () => {
  test('sends message to each node', async () => {
    const snMock = { send: jest.fn().mockImplementation(() => Promise.resolve()) }
    ;(network as any).sn = snMock
    const nodes = [
      { internalIp: '127.0.0.1', internalPort: 10 },
      { internalIp: '127.0.0.2', internalPort: 11 },
    ] as any

    await network.tell(nodes, 'route', { tracker: 't1' })

    expect(snMock.send).toHaveBeenCalledTimes(2)
    expect(snMock.send).toHaveBeenCalledWith(10, '127.0.0.1', {
      route: 'route',
      payload: { tracker: 't1' },
    })
  })

  test('does nothing when node list is empty', async () => {
    const snMock = { send: jest.fn().mockImplementation(() => Promise.resolve()) }
    ;(network as any).sn = snMock

    await network.tell([], 'route', {})

    expect(snMock.send).not.toHaveBeenCalled()
  })
})

describe('NetworkClass.ask', () => {
  test('resolves with response on success', async () => {
    const snMock = {
      send: jest.fn((p, ip, data, timeout, onRes: any) => {
        onRes('resp')
        return Promise.resolve()
      }),
    }
    ;(network as any).sn = snMock
    const node = { internalIp: '127.0.0.1', internalPort: 10 } as any

    await expect(network.ask(node, 'route', { tracker: 't' })).resolves.toBe('resp')
    expect(snMock.send).toHaveBeenCalled()
  })

  test('rejects on timeout', async () => {
    const snMock = {
      send: jest.fn((p, ip, data, timeout, onRes: any, onTimeout: any) => {
        onTimeout()
        return Promise.resolve()
      }),
    }
    ;(network as any).sn = snMock
    const node = { internalIp: '127.0.0.1', internalPort: 10 } as any

    await expect(network.ask(node, 'route', { tracker: 't' })).rejects.toThrow('Request timed out')
    expect(snMock.send).toHaveBeenCalled()
  })
})

describe('NetworkClass.shutdown', () => {
  test('closes external server if present', async () => {
    const close = jest.fn()
    const unref = jest.fn()
    ;(network as any).extServer = { close, unref }

    await network.shutdown()

    expect(close).toHaveBeenCalled()
    expect(unref).toHaveBeenCalled()
  })
})
