import { beforeEach, describe, expect, test, jest } from '@jest/globals'

jest.mock('../../../../src/p2p/Context', () => ({
  config: { p2p: {} },
  crypto: { verify: jest.fn().mockReturnValue(true) },
  logger: { getLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })) },
  network: { _registerExternal: jest.fn(), registerExternalGet: jest.fn() },
  shardus: {},
}))
jest.mock('../../../../src/p2p/Join/routes', () => ({ routes: { external: [], gossip: {} } }))
jest.mock('../../../../src/logger', () => ({ logFlags: {}, getLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })) }))
jest.mock('../../../../src/p2p/Comms', () => ({ registerGossipHandler: jest.fn(), sendGossip: jest.fn() }))
jest.mock('../../../../src/utils/nestedCounters', () => ({ nestedCountersInstance: { countEvent: jest.fn(), countRareEvent: jest.fn() } }))
jest.mock('../../../../src/utils/functions/checkIP', () => ({ isBogonIP: jest.fn(), isInvalidIP: jest.fn(), isIPv6: jest.fn() }))
jest.mock('../../../../src/http', () => ({}))
jest.mock('../../../../src/shardus', () => ({}))
jest.mock('../../../../src/shardus/shardus-types', () => ({}))
jest.mock('../../../../src/config/server', () => ({ default: {} }))
jest.mock('../../../../src/network', () => ({ shardusGetTime: jest.fn(() => 0) }))
jest.mock('../../../../src/p2p/Join/v2', () => ({
  debugDumpJoinRequestList: jest.fn(),
  drainNewJoinRequests: jest.fn(() => []),
  getLastHashedStandbyList: jest.fn(() => []),
  getStandbyNodesInfoMap: jest.fn(() => new Map()),
  saveJoinRequest: jest.fn(),
  standbyNodesInfoHashes: new Map(),
}))
jest.mock('../../../../src/p2p/Join/v2/select', () => ({
  drainSelectedPublicKeys: jest.fn(() => []),
  forceSelectSelf: jest.fn(),
}))
jest.mock('../../../../src/p2p/Join/v2/unjoin', () => ({
  deleteStandbyNode: jest.fn(),
  drainNewUnjoinRequests: jest.fn(() => []),
  processNewUnjoinRequest: jest.fn(),
  validateUnjoinRequest: jest.fn(() => ({ isOk: () => true })),
}))
jest.mock('../../../../src/p2p/Join/v2/syncStarted', () => ({
  drainSyncStarted: jest.fn(() => []),
  lostAfterSelection: [],
  addSyncStarted: jest.fn(),
  drainLostAfterSelectionNodes: jest.fn(() => []),
}))
jest.mock('../../../../src/p2p/Join/v2/syncFinished', () => ({
  addFinishedSyncing: jest.fn(),
  drainFinishedSyncingRequest: jest.fn(() => []),
  newSyncFinishedNodes: new Map(),
}))
jest.mock('../../../../src/p2p/Join/v2/standbyRefresh', () => ({
  drainNewStandbyRefreshRequests: jest.fn(() => []),
  addStandbyRefresh: jest.fn(),
}))
jest.mock('rfdc', () => () => ((obj: any) => JSON.parse(JSON.stringify(obj))))

import { dropInvalidTxs } from '../../../../src/p2p/Join'

describe('dropInvalidTxs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('filters malformed requests', () => {
    const validJoin = {
      nodeInfo: {
        activeTimestamp: 0,
        address: 'addr',
        externalIp: '1.1.1.1',
        externalPort: 1,
        internalIp: '1.1.1.1',
        internalPort: 1,
        joinRequestTimestamp: 0,
        publicKey: 'pk1',
      },
      cycleMarker: 'marker',
      version: 'v',
      sign: { owner: 'pk1', sig: 'sig' },
    }
    const invalidJoin = { cycleMarker: 'marker' } as any
    const validStarted = { nodeId: 'id', cycleNumber: 1, sign: { owner: 'pk', sig: 'sig' } }
    const invalidStarted = { nodeId: 'id', cycleNumber: 'bad' } as any
    const validFinished = { nodeId: 'id2', cycleNumber: 1, sign: { owner: 'pk', sig: 'sig' } }
    const invalidFinished = { nodeId: 3, cycleNumber: 1 } as any
    const validRefresh = { publicKey: 'pk', cycleNumber: 1, sign: { owner: 'pk', sig: 'sig' } }
    const invalidRefresh = { publicKey: 'pk2' } as any
    const validRemove = { publicKey: 'pk3', cycleNumber: 1, sign: { owner: 'pk3', sig: 'sig' } }
    const invalidRemove = { publicKey: 'pk4', cycleNumber: 1 } as any

    const cleaned = dropInvalidTxs({
      standbyAdd: [validJoin, invalidJoin],
      startedSyncing: [validStarted, invalidStarted],
      finishedSyncing: [validFinished, invalidFinished],
      standbyRefresh: [validRefresh, invalidRefresh],
      standbyRemove: [validRemove, invalidRemove],
    })

    expect(cleaned.standbyAdd).toEqual([validJoin])
    expect(cleaned.startedSyncing).toEqual([validStarted])
    expect(cleaned.finishedSyncing).toEqual([validFinished])
    expect(cleaned.standbyRefresh).toEqual([validRefresh])
    expect(cleaned.standbyRemove).toEqual([validRemove])
  })
})
