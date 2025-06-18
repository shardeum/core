import { P2P } from '@shardeum-foundation/lib-types'
import { EventEmitter } from 'events'

// Create EventEmitter instance before other imports
const mockEmitter = new EventEmitter()

// Mock nestedCountersInstance
jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
  },
}))

// Mock Comms module
jest.mock('../../../../src/p2p/Comms', () => ({
  evictCachedSockets: jest.fn(),
}))

// Mock Self module
jest.mock('../../../../src/p2p/Self', () => ({
  id: 'mock-self-id',
  emitter: mockEmitter,
  isRestartNetwork: false,
}))

// Create mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

// Mock Context module with all required functions
jest.mock('../../../../src/p2p/Context', () => {
  const mockContext = {
    config: {
      p2p: {
        enableProblematicNodeRemoval: true,
        enableProblematicNodeRemovalOnCycle: 1,
        problematicNodeHistoryLength: 60,
        removedNodeIDCacheSize: 1000,
        hardenNewSyncingProtocol: true,
        useSyncProtocolV2: false,
        writeSyncProtocolV2: false,
        minNodesToAllowTxs: 1,
      },
    },
    crypto: {
      hash: jest.fn().mockReturnValue('mock-hash'),
      verify: jest.fn().mockReturnValue(true),
    },
    logger: {
      getLogger: jest.fn().mockReturnValue(mockLogger),
    },
    network: {
      registerExternalGet: jest.fn(),
    },
    setDefaultConfigs: jest.fn(),
  }
  return mockContext
})

// Mock CycleChain module
jest.mock('../../../../src/p2p/CycleChain', () => ({
  newest: {
    nodeListHash: 'mock-cycle-hash',
    lost: [],
  },
}))

// Mock Join module
jest.mock('../../../../src/p2p/Join', () => ({
  v2: {
    getStandbyNodesInfoMap: jest.fn().mockReturnValue(new Map()),
    standbyNodesInfo: new Map(),
  },
}))

// Mock CycleAutoScale module
jest.mock('../../../../src/p2p/CycleAutoScale', () => ({
  getDesiredCount: jest.fn().mockReturnValue(100),
}))

// Mock Modes module
jest.mock('../../../../src/p2p/Modes', () => ({
  networkMode: 'processing',
}))

// Mock Sync module
jest.mock('../../../../src/p2p/Sync', () => ({
  getNewestCycle: jest.fn().mockReturnValue(null),
}))

// Mock logger module to prevent initialization
jest.mock('../../../../src/logger', () => ({
  getLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
  logFlags: {
    verbose: false,
    p2pNonFatal: false,
    important_as_error: false,
  },
}))

// Mock shardus module to prevent initialization
jest.mock('../../../../src/shardus', () => ({
  init: jest.fn(),
}))

// Import NodeList after all mocks are set up
import * as NodeList from '../../../../src/p2p/NodeList'
import * as Context from '../../../../src/p2p/Context'
import { nestedCountersInstance } from '../../../../src/utils/nestedCounters'

// Initialize loggers before tests
beforeAll(() => {
  NodeList.init()
})

// Base mock node for testing
const baseMockNode = {
  id: 'mock-node-id',
  publicKey: 'mock-public-key',
  curvePublicKey: 'mock-curve-key',
  status: P2P.P2PTypes.NodeStatus.SELECTED,
  externalIp: '127.0.0.1',
  externalPort: 9001,
  internalIp: '127.0.0.1',
  internalPort: 9001,
  timestamp: Date.now(),
  joinRequestTimestamp: Date.now(),
  syncingTimestamp: Date.now(),
  readyTimestamp: Date.now(),
  activeTimestamp: Date.now(),
  counterRefreshed: 0,
  activeCycle: 0,
  version: '1.0.0',
  refuteCycles: [],
  cycleJoined: '0',
  address: '127.0.0.1:9001',
  nodeId: 'mock-node-id',
} as P2P.NodeListTypes.Node

// Mock cycle record for testing
const mockCycleRecord = {
  counter: 1,
  start: Date.now(),
  mode: 'processing',
  refuted: [],
  lost: [],
  active: 0,
  desired: 100,
  nodeListHash: 'mock-hash',
} as P2P.CycleCreatorTypes.CycleRecord

describe('NodeList', () => {
  beforeEach(() => {
    // Reset all NodeList state before each test
    NodeList.reset('test')
  })

  afterEach(() => {
    // Clean up after each test
    jest.clearAllMocks()
  })

  describe('Node Addition and Removal', () => {
    it('should add a node correctly', () => {
      const node = { ...baseMockNode }
      NodeList.addNode(node, 'test', mockCycleRecord)

      expect(NodeList.nodes.has(node.id)).toBe(true)
      expect(NodeList.byPubKey.has(node.publicKey)).toBe(true)
      expect(NodeList.byIpPort.has('127.0.0.1:9001')).toBe(true)
      expect(NodeList.byJoinOrder).toContainEqual(node)
      expect(NodeList.byIdOrder).toContainEqual(node)
    })

    it('should not add duplicate nodes', () => {
      const node = { ...baseMockNode }
      NodeList.addNode(node, 'test', mockCycleRecord)
      NodeList.addNode(node, 'test', mockCycleRecord)

      expect(NodeList.nodes.size).toBe(1)
    })

    it('should not add null nodes', () => {
      NodeList.addNode(null, 'test', mockCycleRecord)
      expect(NodeList.nodes.size).toBe(0)
    })

    it('should remove a node correctly', () => {
      const node = { ...baseMockNode }
      NodeList.addNode(node, 'test', mockCycleRecord)
      NodeList.removeNode(node.id, true, mockCycleRecord)

      expect(NodeList.nodes.has(node.id)).toBe(false)
      expect(NodeList.byPubKey.has(node.publicKey)).toBe(false)
      expect(NodeList.byIpPort.has('127.0.0.1:9001')).toBe(false)
      expect(NodeList.byJoinOrder).not.toContainEqual(node)
      expect(NodeList.byIdOrder).not.toContainEqual(node)
    })

    it('should handle removing non-existent nodes', () => {
      NodeList.removeNode('non-existent-id', true, mockCycleRecord)
      expect(NodeList.nodes.size).toBe(0)
    })
  })

  describe('Node State Transitions', () => {
    it('should transition node from SELECTED to SYNCING', () => {
      const node = { ...baseMockNode }
      NodeList.addNode(node, 'test', mockCycleRecord)

      const update = {
        id: node.id,
        status: P2P.P2PTypes.NodeStatus.SYNCING,
      }
      NodeList.updateNode(update, true, mockCycleRecord)

      expect(NodeList.syncingByIdOrder).toContainEqual(expect.objectContaining({ id: node.id }))
      expect(NodeList.selectedByIdOrder).not.toContainEqual(expect.objectContaining({ id: node.id }))
    })

    it('should transition node from SYNCING to READY', () => {
      const node = { ...baseMockNode, status: P2P.P2PTypes.NodeStatus.SYNCING }
      NodeList.addNode(node, 'test', mockCycleRecord)

      const update = {
        id: node.id,
        status: P2P.P2PTypes.NodeStatus.READY,
      }
      NodeList.updateNode(update, true, mockCycleRecord)

      expect(NodeList.readyByTimeAndIdOrder).toContainEqual(expect.objectContaining({ id: node.id }))
      expect(NodeList.syncingByIdOrder).not.toContainEqual(expect.objectContaining({ id: node.id }))
    })

    it('should transition node from READY to ACTIVE', () => {
      const node = { ...baseMockNode, status: P2P.P2PTypes.NodeStatus.READY }
      NodeList.addNode(node, 'test', mockCycleRecord)

      const update = {
        id: node.id,
        status: P2P.P2PTypes.NodeStatus.ACTIVE,
      }
      NodeList.updateNode(update, true, mockCycleRecord)

      expect(NodeList.activeByIdOrder).toContainEqual(expect.objectContaining({ id: node.id }))
      expect(NodeList.readyByTimeAndIdOrder).not.toContainEqual(expect.objectContaining({ id: node.id }))
    })
  })

  describe('Node List Hash Computation', () => {
    it('should compute node list hash correctly', () => {
      const node = { ...baseMockNode }
      NodeList.addNode(node, 'test', mockCycleRecord)

      const mockHash = 'mock-hash-value'
      ;(Context.crypto.hash as jest.Mock).mockReturnValue(mockHash)

      const hash = NodeList.computeNewNodeListHash()
      expect(hash).toBe(mockHash)
      expect(Context.crypto.hash).toHaveBeenCalled()
    })

    it('should get node list hash from cycle record when sync v2 is enabled', () => {
      Context.config.p2p.useSyncProtocolV2 = true
      const hash = NodeList.getNodeListHash()
      expect(hash).toBe('mock-cycle-hash')
    })
  })

  describe('Age Index Calculation', () => {
    it('should calculate age index correctly for a node', () => {
      const node1 = { ...baseMockNode, id: 'node1', status: P2P.P2PTypes.NodeStatus.ACTIVE }
      const node2 = { ...baseMockNode, id: 'node2', status: P2P.P2PTypes.NodeStatus.ACTIVE }
      const node3 = { ...baseMockNode, id: 'node3', status: P2P.P2PTypes.NodeStatus.ACTIVE }

      NodeList.addNode(node1, 'test', mockCycleRecord)
      NodeList.addNode(node2, 'test', mockCycleRecord)
      NodeList.addNode(node3, 'test', mockCycleRecord)

      const index = NodeList.getAgeIndexForNodeId('node2')
      expect(index.idx).toBe(2)
      expect(index.total).toBe(3)
    })

    it('should return -1 for non-existent node', () => {
      const index = NodeList.getAgeIndexForNodeId('non-existent')
      expect(index.idx).toBe(-1)
    })
  })

  describe('Problematic Node Tracking', () => {
    it('should initialize refute cycles for new nodes', () => {
      const node = { ...baseMockNode }
      NodeList.addNode(node, 'test', mockCycleRecord)

      expect(node.refuteCycles).toBeDefined()
      expect(Array.isArray(node.refuteCycles)).toBe(true)
    })

    it('should update problematic node tracking', () => {
      const node = { ...baseMockNode }
      NodeList.addNode(node, 'test', mockCycleRecord)

      const cycleWithRefute = {
        ...mockCycleRecord,
        refuted: [node.id],
      }

      NodeList.updateProblematicNodeTracking(cycleWithRefute)
      expect(node.refuteCycles).toContain(cycleWithRefute.counter)
    })
  })

  describe('Node List Updates', () => {
    it('should update multiple nodes correctly', () => {
      const node1 = { ...baseMockNode, id: 'node1' }
      const node2 = { ...baseMockNode, id: 'node2' }
      NodeList.addNode(node1, 'test', mockCycleRecord)
      NodeList.addNode(node2, 'test', mockCycleRecord)

      const updates = [
        { id: 'node1', status: P2P.P2PTypes.NodeStatus.ACTIVE },
        { id: 'node2', status: P2P.P2PTypes.NodeStatus.SYNCING },
      ]

      NodeList.updateNodes(updates, true, mockCycleRecord)

      expect(NodeList.activeByIdOrder).toContainEqual(expect.objectContaining({ id: 'node1' }))
      expect(NodeList.syncingByIdOrder).toContainEqual(expect.objectContaining({ id: 'node2' }))
    })
  })

  describe('Node List in Restore', () => {
    it('should change node list in restore mode', () => {
      const node = { ...baseMockNode, status: P2P.P2PTypes.NodeStatus.ACTIVE }
      NodeList.addNode(node, 'test', mockCycleRecord)

      const cycleStartTimestamp = Date.now()
      NodeList.changeNodeListInRestore(cycleStartTimestamp)

      expect(node.status).toBe(P2P.P2PTypes.NodeStatus.SYNCING)
      expect(node.syncingTimestamp).toBe(cycleStartTimestamp)
      expect(NodeList.activeByIdOrder.length).toBe(0)
      expect(NodeList.syncingByIdOrder).toContainEqual(expect.objectContaining({ id: node.id }))
    })
  })

  describe('Network Stats', () => {
    it('should register network stats endpoint', () => {
      NodeList.init()
      expect(Context.network.registerExternalGet).toHaveBeenCalledWith('network-stats', expect.any(Function))
    })
  })
})
