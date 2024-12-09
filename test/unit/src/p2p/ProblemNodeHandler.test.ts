import { getProblematicNodes } from '../../../../src/p2p/ProblemNodeHandler'
import { P2P } from '@shardus/types'

// Import the tracker class for resetting
import { ProblemNodeTracker } from '../../../../src/p2p/ProblemNodeHandler'

describe('ProblemNodeHandler', () => {
  const createMockCycleRecord = (
    counter: number,
    refuted: string[] = [],
    lost: string[] = [],
    active: string[] = []
  ): P2P.CycleCreatorTypes.CycleRecord => ({
    counter,
    refuted,
    lost,
    active: active as any,
    start: Date.now(),
    mode: 'processing',
    desired: 100
  } as P2P.CycleCreatorTypes.CycleRecord)

  beforeEach(() => {
    // Reset module state between tests
    jest.resetModules()
    // Reset the tracker instance
    ProblemNodeTracker.resetInstance()
  })

  describe('getProblematicNodes', () => {
    it('should identify nodes with 3 consecutive refutes as problematic', () => {
      const nodeId = 'node1'
      
      // First cycle - node is refuted
      let record = createMockCycleRecord(1, [nodeId], [], [nodeId])
      getProblematicNodes(record)

      // Second cycle - node is refuted again
      record = createMockCycleRecord(2, [nodeId], [], [nodeId])
      getProblematicNodes(record)

      // Third cycle - node is refuted for the third time
      record = createMockCycleRecord(3, [nodeId], [], [nodeId])
      const result = getProblematicNodes(record)

      expect(result).toContain(nodeId)
    })

    it('should not mark node as problematic with non-consecutive refutes', () => {
      const nodeId = 'node1'
      
      // First cycle - node is refuted
      let record = createMockCycleRecord(1, [nodeId], [], [nodeId])
      getProblematicNodes(record)

      // Second cycle - node is not refuted
      record = createMockCycleRecord(2, [], [], [nodeId])
      getProblematicNodes(record)

      // Third cycle - node is refuted again
      record = createMockCycleRecord(3, [nodeId], [], [nodeId])
      const result = getProblematicNodes(record)

      expect(result).not.toContain(nodeId)
    })

    it('should identify nodes refuted in more than 10% of recent cycles', () => {
      const nodeId = 'node1'
      const cycles = 100 // HISTORY_LENGTH in ProblemNodeHandler
      
      // Refute the node in 11 out of 100 cycles (11%)
      for (let i = 1; i <= cycles; i++) {
        const isRefuted = i <= 11 // First 11 cycles will have refutes
        const record = createMockCycleRecord(
          i,
          isRefuted ? [nodeId] : [],
          [],
          [nodeId]
        )
        if (i === cycles) {
          const result = getProblematicNodes(record)
          expect(result).toContain(nodeId)
        } else {
          getProblematicNodes(record)
        }
      }
    })

    it('should not mark node as problematic with less than 10% refutes', () => {
      const nodeId = 'node1'
      const cycles = 100
      
      // Refute the node in 9 out of 100 cycles (9%)
      for (let i = 1; i <= cycles; i++) {
        const isRefuted = i % 11 === 0 // Refute every 11th cycle (9 times in 100 cycles)
        const record = createMockCycleRecord(
          i,
          isRefuted ? [nodeId] : [],
          [],
          [nodeId]
        )
        if (i === cycles) {
          const result = getProblematicNodes(record)
          expect(result).not.toContain(nodeId)
        } else {
          getProblematicNodes(record)
        }
      }
    })

    it('should immediately mark lost nodes as problematic', () => {
      const nodeId = 'node1'
      const record = createMockCycleRecord(1, [], [nodeId], [nodeId])
      const result = getProblematicNodes(record)
      expect(result).toContain(nodeId)
    })

    it('should sort problematic nodes by refute percentage', () => {
      const node1 = 'node1' // Will have 20% refutes
      const node2 = 'node2' // Will have 15% refutes
      const node3 = 'node3' // Will have 10% refutes
      const cycles = 100

      // Create refute history for all nodes
      for (let i = 1; i <= cycles; i++) {
        const refuted = []
        if (i <= 20) refuted.push(node1) // 20 refutes
        if (i <= 15) refuted.push(node2) // 15 refutes
        if (i <= 10) refuted.push(node3) // 10 refutes

        const record = createMockCycleRecord(
          i,
          refuted,
          [],
          [node1, node2, node3]
        )
        if (i === cycles) {
          const result = getProblematicNodes(record)
          expect(result).toEqual([node1, node2, node3])
        } else {
          getProblematicNodes(record)
        }
      }
    })

    it('should handle empty records', () => {
      const record = createMockCycleRecord(1)
      const result = getProblematicNodes(record)
      expect(result).toEqual([])
    })

    it('should handle undefined arrays in record', () => {
      const record = createMockCycleRecord(1, undefined, undefined, undefined)
      const result = getProblematicNodes(record)
      expect(result).toEqual([])
    })
  })
}) 