import { P2P } from '@shardus/types'
import * as NodeList from '../../../../src/p2p/NodeList'
import * as Context from '../../../../src/p2p/Context'
import { Node } from '@shardus/types/build/src/p2p/NodeListTypes'
import { getNewestCycle } from '../../../../src/p2p/Sync'

// Mock Context module
jest.mock('../../../../src/p2p/Context', () => ({
  config: {
    p2p: {
      problematicNodeConsecutiveRefuteThreshold: 3,
      problematicNodeRefutePercentageThreshold: 0.1,
      problematicNodeHistoryLength: 100,
      enableProblematicNodeRemovalOnCycle: 1,
      enableProblematicNodeRemoval: true
    }
  },
  nestedCountersInstance: {
    countEvent: jest.fn()
  },
  crypto: {
    convertPublicKeyToCurve: jest.fn().mockReturnValue('mockCurveKey'),
    hash: jest.fn().mockReturnValue('mockHash')
  },
  setDefaultConfigs: jest.fn()
}))

// Mock Sync module
jest.mock('../../../../src/p2p/Sync', () => ({
  getNewestCycle: jest.fn()
}))

const baseMockNode = {
  id: 'node1',
  curvePublicKey: 'mockKey',
  status: P2P.P2PTypes.NodeStatus.SELECTED,
  cycleJoined: '0',
  counterRefreshed: 0,
  activeTimestamp: Date.now(),
  externalIp: '127.0.0.1',
  externalPort: 9001,
  internalIp: '127.0.0.1',
  internalPort: 9001,
  publicKey: 'mockPublicKey',
  timestamp: Date.now(),
  version: '1.0.0',
  nodeId: 'mockNodeId',
  address: '127.0.0.1:9001',
  joinRequestTimestamp: Date.now(),
  activeCycle: 0,
  syncingTimestamp: Date.now(),
  readyTimestamp: Date.now()
}

const baseMockCycle: P2P.CycleCreatorTypes.CycleRecord = {
  counter: 101,
  refuted: ['test1'],
  lost: [],
  active: 0,
  start: Date.now(),
  mode: 'processing',
  desired: 100,
  networkId: 'test-network',
  previous: 'prev-hash',
  duration: 1000,
  networkConfigHash: 'config-hash',
  safetyMode: false,
  safetyNum: 0,
  networkStateHash: 'state-hash',
  refreshedArchivers: [],
  refreshedConsensors: [],
  joinedArchivers: [],
  leavingArchivers: [],
  archiversAtShutdown: [],
  syncing: 0,
  joinedConsensors: [],
  standby: 0,
  activated: [],
  activatedPublicKeys: [],
  maxSyncTime: 0,
  apoptosized: [],
  lostSyncing: [],
  appRemoved: [],
  expired: 0,
  removed: [],
  joined: [],
  returned: [],
  networkDataHash: [],
  networkReceiptHash: [],
  networkSummaryHash: [],
  target: 0,
  nodeListHash: 'node-list-hash',
  archiverListHash: 'archiver-list-hash',
  standbyNodeListHash: 'standby-node-list-hash',
  lostArchivers: [],
  refutedArchivers: [],
  removedArchivers: [],
  random: Math.random(),
  txadd: [],
  txremove: [],
  txlisthash: 'txlist-hash'
}

describe('NodeList RefuteCycles', () => {
  beforeEach(() => {
    // Reset NodeList state
    NodeList.reset('test')
    
    // Mock getNewestCycle to return cycle 100
    ;(getNewestCycle as jest.Mock).mockReturnValue({ counter: 100 })
  })

  describe('createNode', () => {
    it('should initialize refuteCycles when problematic node removal is enabled', () => {
      const node = NodeList.createNode({
        ...baseMockNode,
        id: 'test1'
      } as any)

      expect(node.refuteCycles).toBeDefined()
      expect(node.refuteCycles instanceof Set).toBe(true)
      expect(node.refuteCycles?.size).toBe(0)
    })

    it('should not initialize refuteCycles when problematic node removal is disabled', () => {
      // Disable problematic node removal
      ;(Context.config as any).p2p.enableProblematicNodeRemovalOnCycle = 200

      const node = NodeList.createNode({
        ...baseMockNode,
        id: 'test1'
      } as any)

      expect(node.refuteCycles).toBeUndefined()
    })
  })

  describe('updateNode', () => {
    let node: Node

    beforeEach(() => {
      node = NodeList.createNode({
        ...baseMockNode,
        id: 'test1'
      } as any)
      NodeList.addNode(node, 'test')
    })

    it('should add cycle to refuteCycles when node is refuted', () => {
      const cycle = {
        ...baseMockCycle,
        refuted: ['test1']
      }

      NodeList.updateNode({ id: 'test1' }, true, cycle)

      expect(node.refuteCycles?.has(101)).toBe(true)
      expect(node.refuteCycles?.size).toBe(1)
    })

    it('should not add cycle to refuteCycles when node is not refuted', () => {
      const cycle = {
        ...baseMockCycle,
        refuted: ['other-node']
      }

      NodeList.updateNode({ id: 'test1' }, true, cycle)

      expect(node.refuteCycles?.has(101)).toBe(false)
      expect(node.refuteCycles?.size).toBe(0)
    })

    it('should clean up old refutes outside the window', () => {
      // Add some old refutes
      node.refuteCycles?.add(1)
      node.refuteCycles?.add(2)
      node.refuteCycles?.add(100)

      const cycle = {
        ...baseMockCycle,
        refuted: ['test1']
      }

      NodeList.updateNode({ id: 'test1' }, true, cycle)

      // Should only keep refutes within window (101 - 100 = window start at 1)
      expect(node.refuteCycles?.has(1)).toBe(false)
      expect(node.refuteCycles?.has(2)).toBe(false)
      expect(node.refuteCycles?.has(100)).toBe(true)
      expect(node.refuteCycles?.has(101)).toBe(true)
    })

    it('should handle multiple updates in the same cycle', () => {
      const cycle = {
        ...baseMockCycle,
        refuted: ['test1']
      }

      // Update twice with same cycle
      NodeList.updateNode({ id: 'test1' }, true, cycle)
      NodeList.updateNode({ id: 'test1' }, true, cycle)

      // Should only record the refute once
      expect(node.refuteCycles?.size).toBe(1)
      expect(node.refuteCycles?.has(101)).toBe(true)
    })

    it('should handle updates with missing cycle data', () => {
      const initialSize = node.refuteCycles?.size

      NodeList.updateNode({ id: 'test1' }, true, null)

      // Should not modify refuteCycles when cycle data is missing
      expect(node.refuteCycles?.size).toBe(initialSize)
    })
  })
}) 