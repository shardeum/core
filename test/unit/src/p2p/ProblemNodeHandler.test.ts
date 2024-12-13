import { isNodeProblematic, getConsecutiveRefutes, getRefutePercentage, getProblematicNodes } from '../../../../src/p2p/ProblemNodeHandler'
import { P2P } from '@shardus/types'
import { NodeWithRefuteCycles } from '../../../../src/p2p/NodeList'
import * as NodeList from '../../../../src/p2p/NodeList'
import * as Context from '../../../../src/p2p/Context'

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
      problematicNodeHistoryLength: 100,
    }
  }
}))

describe('ProblemNodeHandler', () => {
  let mockNode: NodeWithRefuteCycles

  beforeEach(() => {
    // Reset config values before each test
    (Context.config as any).p2p.problematicNodeConsecutiveRefuteThreshold = 3;
    (Context.config as any).p2p.problematicNodeRefutePercentageThreshold = 0.1;
    (Context.config as any).p2p.problematicNodeHistoryLength = 100;

    // Create a mock node for testing
    mockNode = {
      id: 'node1',
      refuteCycles: new Set<number>(),
    } as NodeWithRefuteCycles

    // Clear NodeList mocks before each test
    NodeList.activeByIdOrder.length = 0
    NodeList.nodes.clear()
  })

  describe('isNodeProblematic', () => {
    it('should return false if node has no refuteCycles', () => {
      (mockNode.refuteCycles as any) = undefined
      expect(isNodeProblematic(mockNode, 1)).toBe(false)
    })

    it('should return true if node has consecutive refutes above threshold', () => {
      mockNode.refuteCycles = new Set([98, 99, 100])
      expect(isNodeProblematic(mockNode, 100)).toBe(true)
    })

    it('should return false if consecutive refutes are below threshold', () => {
      mockNode.refuteCycles = new Set([97, 98, 99])
      expect(isNodeProblematic(mockNode, 100)).toBe(false)
    })

    it('should return true if refute percentage is above threshold', () => {
      // Add 11 refutes in last 100 cycles (11%)
      for (let i = 90; i <= 100; i++) {
        mockNode.refuteCycles.add(i)
      }
      expect(isNodeProblematic(mockNode, 100)).toBe(true)
    })

    it('should return false if refute percentage is below threshold', () => {
      // Add 9 refutes in last 100 cycles (9%), spread out to avoid consecutive threshold
      mockNode.refuteCycles.add(10)
      mockNode.refuteCycles.add(20)
      mockNode.refuteCycles.add(30)
      mockNode.refuteCycles.add(40)
      mockNode.refuteCycles.add(50)
      mockNode.refuteCycles.add(60)
      mockNode.refuteCycles.add(70)
      mockNode.refuteCycles.add(80)
      mockNode.refuteCycles.add(90)
      expect(isNodeProblematic(mockNode, 100)).toBe(false)
    })
  })

  describe('getConsecutiveRefutes', () => {
    it('should return 0 if current cycle is not in refutes', () => {
      expect(getConsecutiveRefutes([97, 98, 99], 100)).toBe(0)
    })

    it('should count consecutive refutes up to current cycle', () => {
      expect(getConsecutiveRefutes([98, 99, 100], 100)).toBe(3)
    })

    it('should only count consecutive sequences', () => {
      expect(getConsecutiveRefutes([97, 99, 100], 100)).toBe(2)
    })

    it('should handle empty refute array', () => {
      expect(getConsecutiveRefutes([], 100)).toBe(0)
    })

    it('should handle single refute at current cycle', () => {
      expect(getConsecutiveRefutes([100], 100)).toBe(1)
    })
  })

  describe('getRefutePercentage', () => {
    it('should calculate correct percentage in full window', () => {
      const refuteCycles = new Set([96, 97, 98, 99, 100])
      expect(getRefutePercentage(refuteCycles, 100)).toBe(0.05) // 5/100 = 5%
    })

    it('should handle empty refute set', () => {
      const refuteCycles = new Set<number>()
      expect(getRefutePercentage(refuteCycles, 100)).toBe(0)
    })

    it('should only count refutes within window', () => {
      const refuteCycles = new Set([1, 2, 98, 99, 100, 100])
      expect(getRefutePercentage(refuteCycles, 102)).toBe(0.03) // Only counting 98,99,100
    })

    it('should handle early cycles with smaller window', () => {
      const refuteCycles = new Set([1, 2, 3])
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
        desired: 100
      } as any
    })

    it('should return empty array when no problematic nodes exist', () => {
      // Add a non-problematic node
      const node: NodeWithRefuteCycles = {
        id: 'node1',
        refuteCycles: new Set([90]), // Only 1% refute rate
      } as NodeWithRefuteCycles

      NodeList.activeByIdOrder.push(node)
      NodeList.nodes.set(node.id, node)

      const result = getProblematicNodes(mockCycleRecord)
      expect(result).toEqual([])
    })

    it('should sort problematic nodes by refute percentage', () => {
      // Create nodes with different refute percentages
      const node1: NodeWithRefuteCycles = {
        id: 'node1',
        refuteCycles: new Set([2, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]), // 11% refute rate
      } as NodeWithRefuteCycles

      const node2: NodeWithRefuteCycles = {
        id: 'node2',
        refuteCycles: new Set([90, 92, 94, 96, 98, 100]), // 6% refute rate
      } as NodeWithRefuteCycles

      const node3: NodeWithRefuteCycles = {
        id: 'node3',
        refuteCycles: new Set([98, 99, 100]), // 3% refute rate but 3 consecutive
      } as NodeWithRefuteCycles

      // Add nodes to NodeList mock
      NodeList.activeByIdOrder.push(node1, node2, node3)
      NodeList.nodes.set(node1.id, node1)
      NodeList.nodes.set(node2.id, node2)
      NodeList.nodes.set(node3.id, node3)

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
      const node: NodeWithRefuteCycles = {
        id: 'node1',
        refuteCycles: new Set([98, 99, 100]), // 3 consecutive refutes
      } as NodeWithRefuteCycles

      NodeList.activeByIdOrder.push(node)
      NodeList.nodes.set(node.id, node)

      const result = getProblematicNodes(mockCycleRecord)
      expect(result).toContain('node1')
    })

    it('should identify nodes with high refute percentage', () => {
      const node: NodeWithRefuteCycles = {
        id: 'node1',
        refuteCycles: new Set(), // Will add 11 refutes (11%)
      } as NodeWithRefuteCycles

      for (let i = 90; i <= 100; i++) {
        node.refuteCycles.add(i)
      }

      NodeList.activeByIdOrder.push(node)
      NodeList.nodes.set(node.id, node)

      const result = getProblematicNodes(mockCycleRecord)
      expect(result).toContain('node1')
    })

    it('should not include nodes that are neither consecutive nor percentage problematic', () => {
      const node: NodeWithRefuteCycles = {
        id: 'node1',
        refuteCycles: new Set([95, 97, 99]), // Non-consecutive and only 3%
      } as NodeWithRefuteCycles

      NodeList.activeByIdOrder.push(node)
      NodeList.nodes.set(node.id, node)

      const result = getProblematicNodes(mockCycleRecord)
      expect(result).not.toContain('node1')
    })
  })
}) 