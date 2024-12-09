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
    
    // Reset the tracker instance and verify it's clean
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

      // Third cycle - node is refuted a third time
      record = createMockCycleRecord(3, [nodeId], [], [nodeId])
      const result = getProblematicNodes(record)

      expect(result).toContain(nodeId)
    })

    it('should not mark node as problematic with non-consecutive refutes', () => {
      const nodeId = 'node1'
      
      // First cycle - node is refuted
      let record = createMockCycleRecord(101, [nodeId], [], [nodeId])
      getProblematicNodes(record)

      // Second cycle - node is not refuted
      record = createMockCycleRecord(102, [], [], [nodeId])
      getProblematicNodes(record)

      // Third cycle - node is refuted again
      record = createMockCycleRecord(103, [nodeId], [], [nodeId])
      const result = getProblematicNodes(record)

      expect(result).not.toContain(nodeId)
    })

    it('should identify nodes refuted in more than 10% of recent cycles', () => {
      const nodeId = 'node1'
      const cycles = 100 // HISTORY_LENGTH in ProblemNodeHandler
      
      // Refute the node in 11 out of 100 cycles (11%)
      for (let i = 1; i <= cycles; i++) {
        const isRefuted = i % 9 === 0 // Refute every 9th cycle
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

    it('should not automatically mark lost nodes as problematic', () => {
      const nodeId = 'node1'
      const record = createMockCycleRecord(1, [], [nodeId], [nodeId])
      const result = getProblematicNodes(record)
      expect(result).not.toContain(nodeId)
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

    it('should sort problematic nodes by refute percentage in descending order', () => {
      const node1 = 'node1' // Will have 30% refutes
      const node2 = 'node2' // Will have 20% refutes
      const node3 = 'node3' // Will have 15% refutes
      const cycles = 100

      // Create refute history for all nodes over 100 cycles
      for (let i = 1; i <= cycles; i++) {
        const refuted = []
        if (i <= 30) refuted.push(node1) // 30 refutes for node1
        if (i <= 20) refuted.push(node2) // 20 refutes for node2
        if (i <= 15) refuted.push(node3) // 15 refutes for node3

        const record = createMockCycleRecord(
          i,
          refuted,
          [],
          [node1, node2, node3]
        )
        
        if (i === cycles) {
          const result = getProblematicNodes(record)
          // Should be ordered from highest refute percentage to lowest
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

    it('should handle multiple problematic nodes simultaneously', () => {
      const node1 = 'node1'
      const node2 = 'node2'
      const node3 = 'node3'

      // Make node1 problematic by consecutive refutes
      // Make node2 problematic by percentage
      // Keep node3 healthy
      for (let i = 1; i <= 20; i++) {
        const refuted = []
        if (i <= 3) refuted.push(node1) // 3 consecutive for node1
        if (i % 5 === 0) refuted.push(node2) // 20% refute rate for node2
        if (i % 20 === 0) refuted.push(node3) // 5% refute rate for node3

        const record = createMockCycleRecord(i, refuted, [], [node1, node2, node3])
        if (i === 20) {
          const result = getProblematicNodes(record)
          expect(result).toContain(node1)
          expect(result).toContain(node2)
          expect(result).not.toContain(node3)
        } else {
          getProblematicNodes(record)
        }
      }
    })

    it('should maintain correct history across window boundaries', () => {
      const nodeId = 'node1'
      const windowSize = 100 // HISTORY_LENGTH

      let index = 1;

      // Fill up the initial window with refutes at the start
      for (; index <= windowSize; index++) {
        const isRefuted = index <= 10 // First 10 cycles are refutes (10%)
        const record = createMockCycleRecord(
          index,
          isRefuted ? [nodeId] : [],
          [],
          [nodeId]
        )
        
        if (index === windowSize) {
          const result = getProblematicNodes(record)
          expect(result).toContain(nodeId) // Should be problematic (10% >= 10%)
        } else {
          getProblematicNodes(record)
        }
      }

      // Move to next window, verify old refutes are forgotten
      for (; index <= windowSize + 20; index++) {
        const record = createMockCycleRecord(index, [], [], [nodeId])
        const result = getProblematicNodes(record)
        // By this point, the old refutes should have fallen out of the window
        // and the node should no longer be problematic
        expect(result).not.toContain(nodeId)
      }

      // Verify we can still detect new problems after window moves
      for (; index <= windowSize + 23; index++) {
        const record = createMockCycleRecord(index, [nodeId], [], [nodeId])
        const result = getProblematicNodes(record)
        
        if (index === windowSize + 23) {
          expect(result).toContain(nodeId) // Should be problematic again (3 consecutive refutes)
        } else {
          getProblematicNodes(record)
        }
      }
    })

    it('should properly track refutes within HISTORY_LENGTH window', () => {
      const nodeId = 'node1'
      const windowSize = 100 // HISTORY_LENGTH

      // First cycle - node is refuted
      let record = createMockCycleRecord(1, [nodeId], [], [nodeId])
      getProblematicNodes(record)

      // Add 98 more cycles with no refutes
      for (let i = 2; i <= 99; i++) {
        record = createMockCycleRecord(i, [], [], [nodeId])
        getProblematicNodes(record)
      }

      // At cycle 100, refute again
      record = createMockCycleRecord(100, [nodeId], [], [nodeId])
      let result = getProblematicNodes(record)

      // Should have 2 refutes in 100 cycles (2%)
      expect(result).not.toContain(nodeId)

      // Add 10 more refutes to make it problematic
      for (let i = 101; i <= 110; i++) {
        record = createMockCycleRecord(i, [nodeId], [], [nodeId])
        result = getProblematicNodes(record)
      }

      // Should now have 12 refutes in 100 cycles (12%)
      expect(result).toContain(nodeId)
    })
  })

  describe('ProblemNodeTracker', () => {
    it('should properly reset instance state', () => {
      const nodeId = 'node1'
      
      // Make node problematic
      for (let i = 1; i <= 3; i++) {
        const record = createMockCycleRecord(1, [nodeId], [], [nodeId])
        getProblematicNodes(record)
      }

      // Verify node is problematic
      let record = createMockCycleRecord(4, [], [], [nodeId])
      let result = getProblematicNodes(record)
      expect(result).toContain(nodeId)

      // Reset the tracker
      ProblemNodeTracker.resetInstance()

      // Verify state is cleared
      record = createMockCycleRecord(5, [], [], [nodeId])
      result = getProblematicNodes(record)
      expect(result).not.toContain(nodeId)

      // Verify we can still detect problems after reset
      for (let i = 6; i <= 8; i++) {
        record = createMockCycleRecord(i, [nodeId], [], [nodeId])
        result = getProblematicNodes(record)
        if (i === 8) {
          expect(result).toContain(nodeId)
        }
      }
    })
  })
}) 