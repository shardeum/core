import { getConsecutiveRefutes, getRefutePercentage, getProblematicNodes } from '../../../../src/p2p/ProblemNodeHandler'
import { P2P } from '@shardeum-foundation/lib-types'
import * as NodeList from '../../../../src/p2p/NodeList'
import * as Context from '../../../../src/p2p/Context'
import { Node } from '@shardeum-foundation/lib-types/build/src/p2p/NodeListTypes'

// Mock logger module
jest.mock('../../../../src/logger', () => ({
  logFlags: {
    p2pNonFatal: false,
    verbose: false,
  },
}))

// Mock CycleChain module
jest.mock('../../../../src/p2p/CycleChain', () => ({
  newest: null,
  getCycleChain: jest.fn(() => []),
}))

// Mock NodeList module
jest.mock('../../../../src/p2p/NodeList', () => ({
  activeByIdOrder: [],
  nodes: new Map(),
}))

// Mock Context module
jest.mock('../../../../src/p2p/Context', () => ({
  config: {
    p2p: {
      problematicNodeConsecutiveRefuteThreshold: 3,
      problematicNodeRefutePercentageThreshold: 0.1,
      problematicNodeHistoryLength: 60,
      enableProblematicNodeCacheBuilding: false, // Disable cache in tests
      useProblematicNodeCacheV2: false,
    },
  },
  logger: {
    getLogger: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}))

const baseMockNode = {
  id: 'node1',
  refuteCycles: [],
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
  readyTimestamp: Date.now(),
}

describe('ProblemNodeHandler', () => {
  let mockNode: Node

  beforeEach(() => {
    // Reset config values before each test
    ;(Context.config as any).p2p.problematicNodeConsecutiveRefuteThreshold = 3
    ;(Context.config as any).p2p.problematicNodeRefutePercentageThreshold = 0.1
    ;(Context.config as any).p2p.problematicNodeHistoryLength = 100

    // Create a mock node for testing
    mockNode = {
      ...baseMockNode,
      refuteCycles: [],
    }

    // Clear NodeList mocks before each test
    NodeList.activeByIdOrder.length = 0
    NodeList.nodes.clear()
  })

  describe('getConsecutiveRefutes', () => {
    it('should return 0 if current cycle is more than 1 cycle ahead of last refute', () => {
      expect(getConsecutiveRefutes([97, 98, 99], 101)).toBe(0)
    })

    it('should count consecutive refutes ending at current cycle', () => {
      expect(getConsecutiveRefutes([98, 99, 100], 100)).toBe(3)
    })

    it('should count consecutive refutes ending one cycle before current cycle', () => {
      expect(getConsecutiveRefutes([98, 99, 100], 101)).toBe(3)
    })

    it('should only count the most recent consecutive sequence ending at or one before current cycle', () => {
      expect(getConsecutiveRefutes([95, 96, 97, 99, 100], 101)).toBe(2)
    })

    it('should handle non-consecutive sequences ending at current cycle', () => {
      expect(getConsecutiveRefutes([97, 98, 100], 100)).toBe(1)
    })

    it('should handle non-consecutive sequences ending one before current cycle', () => {
      expect(getConsecutiveRefutes([97, 98, 100], 101)).toBe(1)
    })

    it('should not count future cycles', () => {
      expect(getConsecutiveRefutes([98, 99, 101], 100)).toBe(2)
    })

    it('should handle empty refute array', () => {
      expect(getConsecutiveRefutes([], 100)).toBe(0)
    })

    it('should handle single refute at current cycle', () => {
      expect(getConsecutiveRefutes([100], 100)).toBe(1)
    })

    it('should handle single refute one cycle before current cycle', () => {
      expect(getConsecutiveRefutes([99], 100)).toBe(1)
    })

    it('should handle multiple non-consecutive sequences', () => {
      expect(getConsecutiveRefutes([95, 96, 98, 99, 100], 100)).toBe(3)
    })
    it('counts the current cycle if it is a refute', () => {
      expect(getConsecutiveRefutes([98, 99, 100], 100)).toBe(3)
    })
    it('gives 0 count if cycle number is -1', () => {
      expect(getConsecutiveRefutes([98, 99, 100], -1)).toBe(0)
    })
  })

  describe('getRefutePercentage', () => {
    it('should calculate correct percentage in full window', () => {
      const refuteCycles = [96, 97, 98, 99, 100]
      expect(getRefutePercentage(refuteCycles, 100)).toBe(0.05) // 5/100 = 5%
    })

    it('should handle empty refute array', () => {
      const refuteCycles = []
      expect(getRefutePercentage(refuteCycles, 100)).toBe(0)
    })

    it('should only count refutes within window', () => {
      const refuteCycles = [1, 2, 98, 99, 100]
      expect(getRefutePercentage(refuteCycles, 102)).toBe(0.04) // 2, 98, 99, 100
      expect(getRefutePercentage(refuteCycles, 103)).toBe(0.03) // Only counting 98,99,100
    })

    it('should handle early cycles with smaller window', () => {
      const refuteCycles = [1, 2, 3]
      expect(getRefutePercentage(refuteCycles, 3)).toBe(1) // 3/3 = 100%
    })
  })

  describe('getProblematicNodes', () => {
    let mockCycleRecord: P2P.CycleCreatorTypes.CycleRecord

    beforeEach(() => {
      mockCycleRecord = {
        counter: 100,
        refuted: [],
        lost: [],
        active: 0,
        start: Date.now(),
        mode: 'processing',
        desired: 100,
      } as any
    })

    it('should return empty array when no problematic nodes exist', () => {
      // Add a non-problematic node
      const node: Node = {
        ...baseMockNode,
        refuteCycles: [90], // Only 1% refute rate
      }

      NodeList.activeByIdOrder.push(node)
      NodeList.nodes.set(node.id, node)

      const result = getProblematicNodes(mockCycleRecord)
      expect(result).toEqual([])
    })

    it('should sort problematic nodes by refute percentage', () => {
      // Create nodes with different refute percentages
      const node1: Node = {
        ...baseMockNode,
        id: 'node1',
        refuteCycles: [2, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], // 11% refute rate
      }

      const node2: Node = {
        ...baseMockNode,
        id: 'node2',
        refuteCycles: [90, 92, 94, 96, 98, 100], // 6% refute rate
      }

      const node3: Node = {
        ...baseMockNode,
        id: 'node3',
        refuteCycles: [98, 99, 100], // 3% refute rate but 3 consecutive
      }

      // Add nodes to NodeList mock
      NodeList.activeByIdOrder.push(node1, node2, node3)
      NodeList.nodes.set(node1.id, node1)
      NodeList.nodes.set(node2.id, node2)
      NodeList.nodes.set(node3.id, node3)

      console.log(NodeList.activeByIdOrder, mockCycleRecord)
      const result = getProblematicNodes(mockCycleRecord)
      // Should contain node1 (11% refutes) and node3 (3 consecutive refutes)
      // Sorted by refute percentage (node1 first, then node3)
      expect(result).toEqual(['node1', 'node3'])
    })

    it('should handle empty NodeList', () => {
      const result = getProblematicNodes(mockCycleRecord)
      expect(result).toEqual([])
    })

    it('should identify nodes with consecutive refutes', () => {
      const node: Node = {
        ...baseMockNode,
        refuteCycles: [98, 99, 100], // 3 consecutive refutes
      }

      NodeList.activeByIdOrder.push(node)
      NodeList.nodes.set(node.id, node)

      const result = getProblematicNodes(mockCycleRecord)
      expect(result).toContain('node1')
    })

    it('should identify nodes with high refute percentage', () => {
      const node: Node = {
        ...baseMockNode,
        refuteCycles: [], // Will add 11 refutes (11%)
      }

      for (let i = 90; i <= 100; i++) {
        node.refuteCycles?.push(i)
      }

      NodeList.activeByIdOrder.push(node)
      NodeList.nodes.set(node.id, node)

      const result = getProblematicNodes(mockCycleRecord)
      expect(result).toContain('node1')
    })

    it('should not include nodes that are neither consecutive nor percentage problematic', () => {
      const node: Node = {
        ...baseMockNode,
        refuteCycles: [95, 97, 99], // Non-consecutive and only 3%
      }

      NodeList.activeByIdOrder.push(node)
      NodeList.nodes.set(node.id, node)

      const result = getProblematicNodes(mockCycleRecord)
      expect(result).not.toContain('node1')
    })
  })
})
