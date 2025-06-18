import { P2P } from '@shardeum-foundation/lib-types'
import { ProblematicNodeCache, NodeMetrics } from '../../../../src/p2p/ProblematicNodeCache'

describe('ProblematicNodeCache', () => {
  let cache: ProblematicNodeCache
  let config: any

  beforeEach(() => {
    config = {
      p2p: {
        problematicNodeHistoryLength: 60,
        problematicNodeConsecutiveRefuteThreshold: 6,
        problematicNodeRefutePercentageThreshold: 0.1,
        maxProblematicNodeRemovalsPerCycle: 1,
      },
    }
    cache = new ProblematicNodeCache(config)
  })

  describe('ProblematicNodeCache - Initialization', () => {
    test('should create empty cache with default values', () => {
      expect(cache.refuteHistory.size).toBe(0)
      expect(cache.nodeMetrics.size).toBe(0)
      expect(cache.lastProcessedCycle).toBe(0)
    })

    test('should initialize from empty cycle array', () => {
      cache.buildFromCycles([])
      expect(cache.refuteHistory.size).toBe(0)
      expect(cache.nodeMetrics.size).toBe(0)
      expect(cache.lastProcessedCycle).toBe(0)
    })

    test('should build cache from cycle records with refuted nodes', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [
        { counter: 1, refuted: ['node1', 'node2'] },
        { counter: 2, refuted: ['node1'] },
        { counter: 3, refuted: ['node3'] },
      ]

      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      expect(cache.refuteHistory.get('node1')).toEqual([1, 2])
      expect(cache.refuteHistory.get('node2')).toEqual([1])
      expect(cache.refuteHistory.get('node3')).toEqual([3])
      expect(cache.lastProcessedCycle).toBe(3)
    })

    test('should handle cycles with no refuted field', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [
        { counter: 1 },
        { counter: 2, refuted: ['node1'] },
        { counter: 3 },
      ]

      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      expect(cache.refuteHistory.get('node1')).toEqual([2])
      expect(cache.refuteHistory.size).toBe(1)
      expect(cache.lastProcessedCycle).toBe(3)
    })

    test('should handle cycles with empty refuted array', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [
        { counter: 1, refuted: [] },
        { counter: 2, refuted: ['node1'] },
        { counter: 3, refuted: [] },
      ]

      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      expect(cache.refuteHistory.get('node1')).toEqual([2])
      expect(cache.refuteHistory.size).toBe(1)
      expect(cache.lastProcessedCycle).toBe(3)
    })

    test('should correctly set lastProcessedCycle on init', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [
        { counter: 5, refuted: ['node1'] },
        { counter: 10, refuted: ['node2'] },
        { counter: 15, refuted: ['node3'] },
      ]

      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      expect(cache.lastProcessedCycle).toBe(15)
    })

    test('should handle duplicate cycle numbers gracefully', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [
        { counter: 1, refuted: ['node1'] },
        { counter: 1, refuted: ['node2'] }, // Duplicate cycle number
        { counter: 2, refuted: ['node3'] },
      ]

      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      // Should only process the first occurrence
      expect(cache.refuteHistory.get('node1')).toEqual([1])
      expect(cache.refuteHistory.has('node2')).toBe(false)
      expect(cache.refuteHistory.get('node3')).toEqual([2])
      expect(cache.lastProcessedCycle).toBe(2)
    })

    test('should validate cycle order and reject out-of-order cycles', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [
        { counter: 3, refuted: ['node1'] },
        { counter: 1, refuted: ['node2'] }, // Out of order
        { counter: 2, refuted: ['node3'] }, // Out of order
      ]

      expect(() => cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])).toThrow(
        'Cycles must be in ascending order'
      )
    })
  })

  describe('ProblematicNodeCache - Building', () => {
    test('should correctly map single node refuted once', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [{ counter: 1, refuted: ['node1'] }]

      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      expect(cache.refuteHistory.get('node1')).toEqual([1])
      expect(cache.refuteHistory.size).toBe(1)
    })

    test('should correctly map single node refuted multiple times', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [
        { counter: 1, refuted: ['node1'] },
        { counter: 3, refuted: ['node1'] },
        { counter: 5, refuted: ['node1'] },
      ]

      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      expect(cache.refuteHistory.get('node1')).toEqual([1, 3, 5])
    })

    test('should correctly map multiple nodes refuted in same cycle', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [
        { counter: 1, refuted: ['node1', 'node2', 'node3'] },
      ]

      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      expect(cache.refuteHistory.get('node1')).toEqual([1])
      expect(cache.refuteHistory.get('node2')).toEqual([1])
      expect(cache.refuteHistory.get('node3')).toEqual([1])
      expect(cache.refuteHistory.size).toBe(3)
    })

    test('should correctly map multiple nodes across multiple cycles', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [
        { counter: 1, refuted: ['node1', 'node2'] },
        { counter: 2, refuted: ['node2', 'node3'] },
        { counter: 3, refuted: ['node1', 'node3'] },
      ]

      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      expect(cache.refuteHistory.get('node1')).toEqual([1, 3])
      expect(cache.refuteHistory.get('node2')).toEqual([1, 2])
      expect(cache.refuteHistory.get('node3')).toEqual([2, 3])
    })

    test('should maintain cycle number order in refute arrays', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [
        { counter: 5, refuted: ['node1'] },
        { counter: 1, refuted: ['node1'] },
        { counter: 3, refuted: ['node1'] },
      ]

      // Build from sorted cycles
      const sortedCycles = [...cycles].sort((a, b) => a.counter - b.counter)
      cache.buildFromCycles(sortedCycles as P2P.CycleCreatorTypes.CycleRecord[])

      expect(cache.refuteHistory.get('node1')).toEqual([1, 3, 5])
    })

    test('should handle 1000+ cycles efficiently', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      for (let i = 1; i <= 1000; i++) {
        cycles.push({ counter: i, refuted: i % 10 === 0 ? [`node${i % 100}`] : [] })
      }

      const startTime = Date.now()
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])
      const endTime = Date.now()

      expect(endTime - startTime).toBeLessThan(100) // Should complete in < 100ms
      expect(cache.lastProcessedCycle).toBe(1000)
    })

    test('should handle cycles with 100+ refuted nodes', () => {
      const refutedNodes = Array.from({ length: 100 }, (_, i) => `node${i}`)
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [{ counter: 1, refuted: refutedNodes }]

      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      expect(cache.refuteHistory.size).toBe(100)
      refutedNodes.forEach((nodeId) => {
        expect(cache.refuteHistory.get(nodeId)).toEqual([1])
      })
    })

    test('should handle node ID edge cases (empty, very long, special chars)', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [
        { counter: 1, refuted: ['', 'a'.repeat(1000), 'node-with-special!@#$%^&*()_+chars'] },
      ]

      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      expect(cache.refuteHistory.get('')).toEqual([1])
      expect(cache.refuteHistory.get('a'.repeat(1000))).toEqual([1])
      expect(cache.refuteHistory.get('node-with-special!@#$%^&*()_+chars')).toEqual([1])
    })

    test('should handle maximum cycle number (Number.MAX_SAFE_INTEGER)', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [
        { counter: Number.MAX_SAFE_INTEGER, refuted: ['node1'] },
      ]

      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      expect(cache.refuteHistory.get('node1')).toEqual([Number.MAX_SAFE_INTEGER])
      expect(cache.lastProcessedCycle).toBe(Number.MAX_SAFE_INTEGER)
    })

    test('should handle cycles with duplicate refuted entries', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [
        { counter: 1, refuted: ['node1', 'node1', 'node1'] }, // Duplicate entries
      ]

      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      expect(cache.refuteHistory.get('node1')).toEqual([1])
      expect(cache.refuteHistory.size).toBe(1)
    })
  })

  describe('ProblematicNodeCache - Maintenance', () => {
    beforeEach(() => {
      // Initialize cache with some data
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [
        { counter: 1, refuted: ['node1'] },
        { counter: 2, refuted: ['node2'] },
        { counter: 3, refuted: ['node1', 'node2'] },
      ]
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])
    })

    test('should add new refuted nodes from new cycle', () => {
      const newCycle: Partial<P2P.CycleCreatorTypes.CycleRecord> = { counter: 4, refuted: ['node3'] }

      cache.addCycle(newCycle as P2P.CycleCreatorTypes.CycleRecord)

      expect(cache.refuteHistory.get('node3')).toEqual([4])
      expect(cache.lastProcessedCycle).toBe(4)
    })

    test('should append to existing node refute history', () => {
      const newCycle: Partial<P2P.CycleCreatorTypes.CycleRecord> = { counter: 4, refuted: ['node1'] }

      cache.addCycle(newCycle as P2P.CycleCreatorTypes.CycleRecord)

      expect(cache.refuteHistory.get('node1')).toEqual([1, 3, 4])
    })

    test('should create new entry for previously unrefuted node', () => {
      const newCycle: Partial<P2P.CycleCreatorTypes.CycleRecord> = { counter: 4, refuted: ['newNode'] }

      cache.addCycle(newCycle as P2P.CycleCreatorTypes.CycleRecord)

      expect(cache.refuteHistory.get('newNode')).toEqual([4])
    })

    test('should handle adding multiple cycles at once', () => {
      const newCycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [
        { counter: 4, refuted: ['node1'] },
        { counter: 5, refuted: ['node2'] },
        { counter: 6, refuted: ['node3'] },
      ]

      newCycles.forEach((cycle) => cache.addCycle(cycle as P2P.CycleCreatorTypes.CycleRecord))

      expect(cache.refuteHistory.get('node1')).toEqual([1, 3, 4])
      expect(cache.refuteHistory.get('node2')).toEqual([2, 3, 5])
      expect(cache.refuteHistory.get('node3')).toEqual([6])
      expect(cache.lastProcessedCycle).toBe(6)
    })

    test('should update lastProcessedCycle correctly', () => {
      expect(cache.lastProcessedCycle).toBe(3)

      cache.addCycle({ counter: 5, refuted: [] } as P2P.CycleCreatorTypes.CycleRecord)

      expect(cache.lastProcessedCycle).toBe(5)
    })

    test('should reject cycles older than lastProcessedCycle', () => {
      expect(() => cache.addCycle({ counter: 2, refuted: [] } as P2P.CycleCreatorTypes.CycleRecord)).toThrow(
        'Cannot add cycle 2, last processed cycle is 3'
      )
    })

    test('should handle gap in cycle numbers', () => {
      // Current lastProcessedCycle is 3
      const newCycle: Partial<P2P.CycleCreatorTypes.CycleRecord> = { counter: 10, refuted: ['node1'] }

      cache.addCycle(newCycle as P2P.CycleCreatorTypes.CycleRecord)

      expect(cache.refuteHistory.get('node1')).toEqual([1, 3, 10])
      expect(cache.lastProcessedCycle).toBe(10)
    })

    test('should invalidate metrics when new data added', () => {
      // Calculate metrics first
      cache.calculateNodeMetrics('node1', 3)
      expect(cache.nodeMetrics.has('node1')).toBe(true)

      // Add new cycle
      cache.addCycle({ counter: 4, refuted: ['node1'] } as P2P.CycleCreatorTypes.CycleRecord)

      // Metrics should be cleared
      expect(cache.nodeMetrics.size).toBe(0)
    })

    test('should preserve refute history when metrics invalidated', () => {
      const originalHistory = [...(cache.refuteHistory.get('node1') || [])]

      cache.addCycle({ counter: 4, refuted: ['node2'] } as P2P.CycleCreatorTypes.CycleRecord)

      expect(cache.refuteHistory.get('node1')).toEqual(originalHistory)
    })

    test('should handle selective metric invalidation', () => {
      // Calculate metrics for multiple nodes
      cache.calculateNodeMetrics('node1', 3)
      cache.calculateNodeMetrics('node2', 3)

      // Clear specific node's metrics
      cache.clearNodeMetrics('node1')

      expect(cache.nodeMetrics.has('node1')).toBe(false)
      expect(cache.nodeMetrics.has('node2')).toBe(true)
    })
  })

  describe('ProblematicNodeCache - Pruning', () => {
    test('should remove cycles older than historyLength', () => {
      // Build cache with cycles beyond history length
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      for (let i = 1; i <= 110; i++) {
        cycles.push({ counter: i, refuted: ['node1'] })
      }
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      cache.prune(110)

      const history = cache.refuteHistory.get('node1')
      expect(history?.length).toBe(60)
      expect(history?.[0]).toBe(51) // Oldest should be cycle 51
      expect(history?.[59]).toBe(110) // Newest should be cycle 110
    })

    test('should keep exactly historyLength cycles', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      for (let i = 1; i <= 200; i++) {
        cycles.push({ counter: i, refuted: ['node1'] })
      }
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      cache.prune(200)

      const history = cache.refuteHistory.get('node1')
      expect(history?.length).toBe(60)
    })

    test('should prune on every update if needed', () => {
      // Fill cache to history limit
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      for (let i = 1; i <= 100; i++) {
        cycles.push({ counter: i, refuted: ['node1'] })
      }
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      // Add new cycle with auto-prune
      cache.addCycle({ counter: 101, refuted: ['node1'] } as P2P.CycleCreatorTypes.CycleRecord, true)

      const history = cache.refuteHistory.get('node1')
      expect(history?.length).toBe(60)
      expect(history?.[0]).toBe(42) // Oldest cycle 41 should be pruned
      expect(history?.[59]).toBe(101) // Newest should be cycle 101
    })

    test('should handle pruning when historyLength = 1', () => {
      config.p2p.problematicNodeHistoryLength = 1
      cache = new ProblematicNodeCache(config)

      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [
        { counter: 1, refuted: ['node1'] },
        { counter: 2, refuted: ['node1'] },
        { counter: 3, refuted: ['node1'] },
      ]
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      cache.prune(3)

      const history = cache.refuteHistory.get('node1')
      expect(history?.length).toBe(1)
      expect(history?.[0]).toBe(3)
    })

    test('should handle pruning when historyLength = 0', () => {
      config.p2p.problematicNodeHistoryLength = 0
      cache = new ProblematicNodeCache(config)

      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [{ counter: 1, refuted: ['node1'] }]
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      cache.prune(1)

      expect(cache.refuteHistory.size).toBe(0)
    })

    test('should correctly update refute arrays after pruning', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      // Node1 refuted in all cycles, node2 only in early cycles
      for (let i = 1; i <= 110; i++) {
        if (i <= 10) {
          cycles.push({ counter: i, refuted: ['node1', 'node2'] })
        } else {
          cycles.push({ counter: i, refuted: ['node1'] })
        }
      }
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      cache.prune(110)

      expect(cache.refuteHistory.get('node1')?.length).toBe(60)
      expect(cache.refuteHistory.has('node2')).toBe(false) // Should be removed
    })

    test('should remove nodes with no refutes after pruning', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      // node1 only refuted in early cycles
      for (let i = 1; i <= 150; i++) {
        if (i <= 10) {
          cycles.push({ counter: i, refuted: ['node1'] })
        } else {
          cycles.push({ counter: i, refuted: [] })
        }
      }
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      cache.prune(150)

      expect(cache.refuteHistory.has('node1')).toBe(false)
    })

    test('should remove nodes that have left network', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [
        { counter: 1, refuted: ['node1', 'node2', 'node3'] },
      ]
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      const activeNodes = new Set(['node1', 'node3'])
      cache.pruneInactiveNodes(activeNodes)

      expect(cache.refuteHistory.has('node1')).toBe(true)
      expect(cache.refuteHistory.has('node2')).toBe(false)
      expect(cache.refuteHistory.has('node3')).toBe(true)
    })

    test('should handle pruning 50% of nodes at once', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      const allNodes = Array.from({ length: 100 }, (_, i) => `node${i}`)

      cycles.push({ counter: 1, refuted: allNodes })
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      const activeNodes = new Set(allNodes.slice(0, 50))
      cache.pruneInactiveNodes(activeNodes)

      expect(cache.refuteHistory.size).toBe(50)
      activeNodes.forEach((nodeId) => {
        expect(cache.refuteHistory.has(nodeId)).toBe(true)
      })
    })

    test('should maintain cache consistency after aggressive pruning', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      for (let i = 1; i <= 200; i++) {
        cycles.push({ counter: i, refuted: [`node${i % 10}`] })
      }
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      cache.prune(200)

      // Verify consistency
      cache.refuteHistory.forEach((refuteCycles, nodeId) => {
        expect(refuteCycles).toEqual([...refuteCycles].sort((a, b) => a - b))
        expect(refuteCycles.every((cycle) => cycle > 100 && cycle <= 200)).toBe(true)
      })
    })

    test('should track memory usage before and after pruning', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      for (let i = 1; i <= 200; i++) {
        cycles.push({ counter: i, refuted: Array.from({ length: 10 }, (_, j) => `node${j}`) })
      }
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      const beforeSize = cache.getMemoryUsage()
      cache.prune(200)
      const afterSize = cache.getMemoryUsage()

      // After pruning to keep only 100 cycles, memory should be roughly half
      expect(afterSize).toBeLessThanOrEqual(beforeSize)
      expect(afterSize).toBeGreaterThan(0)
    })
  })

  describe('ProblematicNodeCache - Metrics', () => {
    beforeEach(() => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [
        { counter: 95, refuted: ['node1'] },
        { counter: 96, refuted: ['node1', 'node2'] },
        { counter: 97, refuted: ['node1', 'node2'] },
        { counter: 98, refuted: ['node1', 'node2'] },
        { counter: 99, refuted: ['node1'] },
        { counter: 100, refuted: ['node1'] },
      ]
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])
    })

    test('should calculate 0 consecutive refutes for never refuted', () => {
      const metrics = cache.calculateNodeMetrics('node3', 100)
      expect(metrics.consecutiveRefutes).toBe(0)
    })

    test('should calculate 1 consecutive refute for last cycle only', () => {
      cache.addCycle({ counter: 101, refuted: ['node3'] } as P2P.CycleCreatorTypes.CycleRecord)
      const metrics = cache.calculateNodeMetrics('node3', 101)
      expect(metrics.consecutiveRefutes).toBe(1)
    })

    test('should calculate N consecutive refutes correctly', () => {
      const metrics = cache.calculateNodeMetrics('node1', 100)
      expect(metrics.consecutiveRefutes).toBe(6) // cycles 95-100
    })

    test('should reset consecutive count after gap', () => {
      // node2 is refuted in 96-98, gap at 99, no refute at 100
      const metrics = cache.calculateNodeMetrics('node2', 100)
      expect(metrics.consecutiveRefutes).toBe(0) // Gap breaks the consecutive count
    })

    test('should handle consecutive refutes at history boundary', () => {
      // Add more cycles to test boundary
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      for (let i = 1; i <= 105; i++) {
        cycles.push({ counter: i, refuted: i >= 100 ? ['node4'] : [] })
      }
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      const metrics = cache.calculateNodeMetrics('node4', 105)
      expect(metrics.consecutiveRefutes).toBe(6) // cycles 100-105
    })

    test('should calculate 0% for never refuted node', () => {
      const metrics = cache.calculateNodeMetrics('node3', 100)
      expect(metrics.refutePercentage).toBe(0)
    })

    test('should calculate 100% for always refuted node', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      for (let i = 1; i <= 100; i++) {
        cycles.push({ counter: i, refuted: ['node5'] })
      }
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      const metrics = cache.calculateNodeMetrics('node5', 100)
      expect(metrics.refutePercentage).toBe(1.0)
    })

    test('should calculate correct percentage for partial refutes', () => {
      const metrics = cache.calculateNodeMetrics('node1', 100)
      // node1 refuted in cycles 95-100 (6 times in last 100 cycles)
      expect(metrics.refutePercentage).toBe(0.1)
    })

    test('should calculate percentage over correct window', () => {
      // Test with a smaller window
      config.p2p.problematicNodeHistoryLength = 10
      const newCache = new ProblematicNodeCache(config)

      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      for (let i = 1; i <= 100; i++) {
        cycles.push({ counter: i, refuted: i > 90 ? ['node1'] : [] })
      }
      newCache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      const metrics = newCache.calculateNodeMetrics('node1', 100)
      expect(metrics.refutePercentage).toBe(1.0) // 10/10 in last 10 cycles
    })

    test('should handle percentage when history < historyLength', () => {
      const newCache = new ProblematicNodeCache(config)
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [
        { counter: 1, refuted: ['node1'] },
        { counter: 2, refuted: ['node1'] },
        { counter: 3, refuted: [] },
      ]
      newCache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      const metrics = newCache.calculateNodeMetrics('node1', 3)
      expect(metrics.refutePercentage).toBe(2 / 3) // 2 refutes in 3 cycles
    })

    test('should cache calculated metrics', () => {
      const metrics1 = cache.calculateNodeMetrics('node1', 100)
      const metrics2 = cache.calculateNodeMetrics('node1', 100)

      expect(metrics1).toBe(metrics2) // Should be same object reference
    })

    test('should return cached metrics if not stale', () => {
      cache.calculateNodeMetrics('node1', 100)
      const cachedMetrics = cache.nodeMetrics.get('node1')

      const metrics = cache.calculateNodeMetrics('node1', 100)
      expect(metrics).toBe(cachedMetrics)
    })

    test('should recalculate metrics if stale', () => {
      const metrics1 = cache.calculateNodeMetrics('node1', 100)
      const metrics2 = cache.calculateNodeMetrics('node1', 101) // Different cycle

      expect(metrics1).not.toBe(metrics2)
      expect(metrics2.lastCalculatedCycle).toBe(101)
    })

    test('should handle concurrent metric calculations', () => {
      // Simulate concurrent calculations
      const promises = Array.from({ length: 10 }, () =>
        Promise.resolve(cache.calculateNodeMetrics('node1', 100))
      )

      return Promise.all(promises).then((results) => {
        // All should return the same metrics object
        const firstMetric = results[0]
        results.forEach((metric) => {
          expect(metric).toBe(firstMetric)
        })
      })
    })
  })

  describe('ProblematicNodeCache - Queries', () => {
    beforeEach(() => {
      // Create a more straightforward test data structure
      const cyclesMap = new Map<number, string[]>()
      
      // node1: Always problematic (11% refute rate) - refuted in cycles 90-100
      for (let i = 90; i <= 100; i++) {
        if (!cyclesMap.has(i)) cyclesMap.set(i, [])
        cyclesMap.get(i)!.push('node1')
      }

      // node2: Consecutive refutes (6 in a row) - refuted in cycles 95-100
      for (let i = 95; i <= 100; i++) {
        if (!cyclesMap.has(i)) cyclesMap.set(i, [])
        cyclesMap.get(i)!.push('node2')
      }

      // node3: Below thresholds (5% refute rate, non-consecutive)
      const node3Cycles = [90, 92, 94, 96, 98]
      for (const cycle of node3Cycles) {
        if (!cyclesMap.has(cycle)) cyclesMap.set(cycle, [])
        cyclesMap.get(cycle)!.push('node3')
      }

      // Convert map to sorted array of cycles
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      const sortedCycles = Array.from(cyclesMap.keys()).sort((a, b) => a - b)
      
      for (const counter of sortedCycles) {
        cycles.push({ counter, refuted: cyclesMap.get(counter) })
      }

      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])
    })

    test('should return empty array when no problematic nodes', () => {
      const activeNodes = new Set(['node3']) // Only non-problematic node
      const result = cache.getProblematicNodes(100, activeNodes)
      expect(result).toEqual([])
    })

    test('should identify single problematic node', () => {
      const activeNodes = new Set(['node1'])
      const result = cache.getProblematicNodes(100, activeNodes)
      expect(result).toEqual(['node1'])
    })

    test('should identify multiple problematic nodes', () => {
      // Temporarily increase the limit to test multiple nodes
      const originalLimit = config.p2p.maxProblematicNodeRemovalsPerCycle
      config.p2p.maxProblematicNodeRemovalsPerCycle = 2
      
      const activeNodes = new Set(['node1', 'node2', 'node3'])
      const result = cache.getProblematicNodes(100, activeNodes)
      expect(result).toContain('node1')
      expect(result).toContain('node2')
      expect(result).not.toContain('node3')
      
      // Restore original limit
      config.p2p.maxProblematicNodeRemovalsPerCycle = originalLimit
    })

    test('should sort by refute percentage descending', () => {
      const activeNodes = new Set(['node1', 'node2'])
      const result = cache.getProblematicNodes(100, activeNodes)
      // node1 has 11%, node2 has 6%
      expect(result[0]).toBe('node1')
    })

    test('should respect maxProblematicNodeRemovalsPerCycle limit', () => {
      const activeNodes = new Set(['node1', 'node2'])
      const result = cache.getProblematicNodes(100, activeNodes)
      expect(result.length).toBe(1) // config limit is 1
    })

    test('should only check active nodes', () => {
      const activeNodes = new Set(['node3']) // Only include non-problematic node
      const result = cache.getProblematicNodes(100, activeNodes)
      expect(result).toEqual([])
    })

    test('should handle query with empty active node set', () => {
      const activeNodes = new Set<string>()
      const result = cache.getProblematicNodes(100, activeNodes)
      expect(result).toEqual([])
    })

    test('should handle query when cache is empty', () => {
      const emptyCache = new ProblematicNodeCache(config)
      const activeNodes = new Set(['node1', 'node2'])
      const result = emptyCache.getProblematicNodes(100, activeNodes)
      expect(result).toEqual([])
    })

    test('should respect consecutive refute threshold', () => {
      // node2 has 6 consecutive refutes, which meets the threshold
      const activeNodes = new Set(['node2'])
      const result = cache.getProblematicNodes(100, activeNodes)
      expect(result).toContain('node2')
    })

    test('should respect percentage threshold', () => {
      // node1 has 11% refute rate, which exceeds 10% threshold
      const activeNodes = new Set(['node1'])
      const result = cache.getProblematicNodes(100, activeNodes)
      expect(result).toContain('node1')
    })

    test('should require either threshold to be met', () => {
      // Test that meeting either threshold is sufficient
      config.p2p.problematicNodeConsecutiveRefuteThreshold = 20 // Very high
      const newCache = new ProblematicNodeCache(config)
      
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      // Create 11% refute rate without consecutive
      for (let i = 1; i <= 100; i++) {
        if (i % 9 === 0) {
          cycles.push({ counter: i, refuted: ['node1'] })
        } else {
          cycles.push({ counter: i, refuted: [] })
        }
      }
      newCache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      const activeNodes = new Set(['node1'])
      const result = newCache.getProblematicNodes(100, activeNodes)
      expect(result).toContain('node1') // Should still be problematic due to percentage
    })

    test('should handle threshold edge cases (0%, 100%)', () => {
      // Test 0% threshold
      config.p2p.problematicNodeRefutePercentageThreshold = 0
      let zeroCache = new ProblematicNodeCache(config)
      zeroCache.buildFromCycles([{ counter: 1, refuted: ['node1'] }] as P2P.CycleCreatorTypes.CycleRecord[])
      
      let result = zeroCache.getProblematicNodes(1, new Set(['node1']))
      expect(result).toContain('node1') // Any refute should trigger

      // Test 100% threshold
      config.p2p.problematicNodeRefutePercentageThreshold = 1.0
      config.p2p.problematicNodeConsecutiveRefuteThreshold = 999 // Disable consecutive check
      let fullCache = new ProblematicNodeCache(config)
      
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      for (let i = 1; i <= 100; i++) {
        cycles.push({ counter: i, refuted: i < 100 ? ['node1'] : [] }) // 99% refute rate
      }
      fullCache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])
      
      result = fullCache.getProblematicNodes(100, new Set(['node1']))
      expect(result).toEqual([]) // Should not be problematic at 99%
    })
  })

  describe('ProblematicNodeCache - Persistence', () => {
    let testCache: ProblematicNodeCache

    beforeEach(() => {
      testCache = new ProblematicNodeCache(config)
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = [
        { counter: 1, refuted: ['node1', 'node2'] },
        { counter: 2, refuted: ['node1'] },
        { counter: 3, refuted: ['node3'] },
      ]
      testCache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])
    })

    test('should serialize cache to JSON', () => {
      const json = testCache.toJSON()
      const parsed = JSON.parse(json)

      expect(parsed.lastProcessedCycle).toBe(3)
      expect(parsed.refuteHistory.node1).toEqual([1, 2])
      expect(parsed.refuteHistory.node2).toEqual([1])
      expect(parsed.refuteHistory.node3).toEqual([3])
    })

    test('should deserialize cache from JSON', () => {
      const json = testCache.toJSON()
      const newCache = ProblematicNodeCache.fromJSON(json, config)

      expect(newCache.lastProcessedCycle).toBe(3)
      expect(newCache.refuteHistory.get('node1')).toEqual([1, 2])
      expect(newCache.refuteHistory.get('node2')).toEqual([1])
      expect(newCache.refuteHistory.get('node3')).toEqual([3])
    })

    test('should handle corrupted cache data gracefully', () => {
      const corruptedData = [
        '', // Empty string
        '{}', // Empty object
        'not json', // Invalid JSON
      ]

      corruptedData.forEach((data) => {
        expect(() => ProblematicNodeCache.fromJSON(data, config)).toThrow()
      })
    })


    test('should handle missing cache file', () => {
      // Test loading from non-existent cache
      expect(() => ProblematicNodeCache.fromJSON(null as any, config)).toThrow()
      expect(() => ProblematicNodeCache.fromJSON(undefined as any, config)).toThrow()
    })

    test('should atomic write to prevent corruption', async () => {
      // This test would need actual file system operations
      // For now, we just test the serialization is consistent
      const json1 = testCache.toJSON()
      const json2 = testCache.toJSON()
      
      expect(json1).toBe(json2)
    })

    test('should compress large caches', () => {
      // Build a large cache
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      for (let i = 1; i <= 1000; i++) {
        const refuted = Array.from({ length: 50 }, (_, j) => `node${j}`)
        cycles.push({ counter: i, refuted })
      }
      
      const largeCache = new ProblematicNodeCache(config)
      largeCache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])
      
      const json = largeCache.toJSON()
      const compressed = largeCache.toCompressedJSON()
      
      expect(compressed.length).toBeLessThan(json.length)
    })

    test('should handle concurrent read/write operations', async () => {
      // Simulate concurrent operations
      const operations = []
      
      // Multiple reads
      for (let i = 0; i < 5; i++) {
        operations.push(Promise.resolve(testCache.toJSON()))
      }
      
      // Concurrent write
      operations.push(
        Promise.resolve(
          testCache.addCycle({ counter: 4, refuted: ['node4'] } as P2P.CycleCreatorTypes.CycleRecord)
        )
      )
      
      // More reads
      for (let i = 0; i < 5; i++) {
        operations.push(Promise.resolve(testCache.toJSON()))
      }
      
      const results = await Promise.all(operations)
      
      // Verify all operations completed without error
      expect(results.length).toBe(11)
    })
  })

  describe('ProblematicNodeCache - Performance', () => {
    test('should build 1000-cycle cache in < 100ms', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      for (let i = 1; i <= 1000; i++) {
        cycles.push({ counter: i, refuted: [`node${i % 100}`] })
      }

      const start = Date.now()
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])
      const duration = Date.now() - start

      expect(duration).toBeLessThan(100)
    })

    test('should update single cycle in < 10ms', () => {
      // Pre-populate cache
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      for (let i = 1; i <= 100; i++) {
        cycles.push({ counter: i, refuted: [] })
      }
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      const start = Date.now()
      cache.addCycle({ counter: 101, refuted: ['node1'] } as P2P.CycleCreatorTypes.CycleRecord)
      const duration = Date.now() - start

      expect(duration).toBeLessThan(10)
    })

    test('should query 1000 nodes in < 50ms', () => {
      // Build cache with many nodes
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      for (let i = 1; i <= 100; i++) {
        const refuted = Array.from({ length: 10 }, (_, j) => `node${j + (i * 10)}`)
        cycles.push({ counter: i, refuted })
      }
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      const activeNodes = new Set(Array.from({ length: 1000 }, (_, i) => `node${i}`))

      const start = Date.now()
      cache.getProblematicNodes(100, activeNodes)
      const duration = Date.now() - start

      expect(duration).toBeLessThan(50)
    })

    test('should prune 500 cycles in < 50ms', () => {
      // Build large cache
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      for (let i = 1; i <= 600; i++) {
        cycles.push({ counter: i, refuted: [`node${i % 100}`] })
      }
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      const start = Date.now()
      cache.prune(600)
      const duration = Date.now() - start

      expect(duration).toBeLessThan(50)
    })

    test('should handle 10k nodes without memory issues', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      const nodeCount = 10000

      // Each cycle refutes 100 random nodes
      for (let i = 1; i <= 100; i++) {
        const refuted = Array.from({ length: 100 }, () => `node${Math.floor(Math.random() * nodeCount)}`)
        cycles.push({ counter: i, refuted })
      }

      const memBefore = process.memoryUsage().heapUsed
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])
      const memAfter = process.memoryUsage().heapUsed

      const memUsed = memAfter - memBefore
      expect(memUsed).toBeLessThan(50 * 1024 * 1024) // Less than 50MB
    })

    test('should maintain O(1) lookup performance', () => {
      // Build progressively larger caches and measure lookup time
      const lookupTimes: number[] = []

      for (const size of [100, 1000, 10000]) {
        const testCache = new ProblematicNodeCache(config)
        const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []

        for (let i = 1; i <= 10; i++) {
          const refuted = Array.from({ length: size / 10 }, (_, j) => `node${j}`)
          cycles.push({ counter: i, refuted })
        }
        testCache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

        // Measure lookup time with more iterations for accuracy
        const start = process.hrtime.bigint()
        for (let i = 0; i < 10000; i++) {
          testCache.refuteHistory.get('node0')
        }
        const duration = Number(process.hrtime.bigint() - start)
        lookupTimes.push(duration)
      }

      // Verify lookup times don't scale with size
      // Allow some variance but should not scale linearly
      const ratio = lookupTimes[2] / lookupTimes[0]
      expect(ratio).toBeLessThan(10) // More lenient threshold
    })

    test('should batch updates efficiently', () => {
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      for (let i = 1; i <= 100; i++) {
        cycles.push({ counter: i, refuted: Array.from({ length: 10 }, (_, j) => `node${j}`) })
      }

      // Measure batch update
      const batchStart = process.hrtime.bigint()
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])
      const batchDuration = Number(process.hrtime.bigint() - batchStart)

      // Measure individual updates
      const individualCache = new ProblematicNodeCache(config)
      const individualStart = process.hrtime.bigint()
      cycles.forEach((cycle) => individualCache.addCycle(cycle as P2P.CycleCreatorTypes.CycleRecord))
      const individualDuration = Number(process.hrtime.bigint() - individualStart)

      // Batch should be faster than individual updates
      // But may not always be 2x faster due to small dataset
      expect(batchDuration).toBeLessThanOrEqual(individualDuration)
    })
  })

  describe('ProblematicNodeCache - Integration', () => {
    test('should match results with existing implementation', () => {
      // This test will be implemented when integrating with ProblemNodeHandler
      // For now, we just ensure the cache can identify the same patterns
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []

      // Create same test patterns as ProblemNodeHandler tests
      // node1: 11% refute rate
      for (let i = 90; i <= 100; i++) {
        cycles.push({ counter: i, refuted: ['node1'] })
      }

      // node2: 3 consecutive refutes
      for (let i = 98; i <= 100; i++) {
        const existing = cycles.find(c => c.counter === i)
        if (existing) {
          existing.refuted.push('node2')
        } else {
          cycles.push({ counter: i, refuted: ['node2'] })
        }
      }

      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      const activeNodes = new Set(['node1', 'node2'])
      const result = cache.getProblematicNodes(100, activeNodes)

      // Both nodes are problematic, but only node1 is returned due to maxProblematicNodeRemovalsPerCycle = 1
      // node1 has higher refute percentage (11%) than node2 (3%)
      expect(result).toEqual(['node1'])
    })

    test('should handle real cycle data from mainnet', () => {
      // This would use actual cycle data in a real test
      // For now, simulate realistic data
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      
      // Simulate 1000 cycles with realistic refute patterns
      for (let i = 1; i <= 1000; i++) {
        const refuted: string[] = []
        
        // 5% chance of refutes per cycle
        if (Math.random() < 0.05) {
          // 1-3 nodes refuted per cycle
          const refuteCount = Math.floor(Math.random() * 3) + 1
          for (let j = 0; j < refuteCount; j++) {
            refuted.push(`node${Math.floor(Math.random() * 1000)}`)
          }
        }
        
        cycles.push({ counter: i, refuted })
      }

      expect(() => cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])).not.toThrow()
      expect(cache.lastProcessedCycle).toBe(1000)
    })

    test('should integrate with CycleCreator correctly', () => {
      // Simulate cycle creation flow
      const initialCycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      for (let i = 1; i <= 100; i++) {
        initialCycles.push({ counter: i, refuted: [] })
      }
      cache.buildFromCycles(initialCycles as P2P.CycleCreatorTypes.CycleRecord[])

      // Simulate new cycle with refuted nodes
      const newCycle: Partial<P2P.CycleCreatorTypes.CycleRecord> = {
        counter: 101,
        refuted: ['node1', 'node2'],
      }

      cache.addCycle(newCycle as P2P.CycleCreatorTypes.CycleRecord)

      expect(cache.lastProcessedCycle).toBe(101)
      expect(cache.refuteHistory.get('node1')).toEqual([101])
      expect(cache.refuteHistory.get('node2')).toEqual([101])
    })

    test('should integrate with SyncV2 correctly', () => {
      // Simulate syncing historical cycles
      const syncedCycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      
      // Simulate 200 historical cycles
      for (let i = 1; i <= 200; i++) {
        syncedCycles.push({
          counter: i,
          refuted: i % 10 === 0 ? [`node${i % 5}`] : [],
        })
      }

      cache.buildFromCycles(syncedCycles as P2P.CycleCreatorTypes.CycleRecord[])

      // Verify cache built correctly
      expect(cache.lastProcessedCycle).toBe(200)
      
      // Verify pruning happened (should only keep last 100)
      cache.refuteHistory.forEach((cycles) => {
        expect(cycles.every(c => c > 100)).toBe(true)
      })
    })

    test('should handle network restarts', () => {
      // Build cache
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      for (let i = 1; i <= 50; i++) {
        cycles.push({ counter: i, refuted: [`node${i % 10}`] })
      }
      cache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])

      // Serialize (simulate save)
      const saved = cache.toJSON()

      // Create new cache (simulate restart)
      const restoredCache = ProblematicNodeCache.fromJSON(saved, config)

      // Verify restoration
      expect(restoredCache.lastProcessedCycle).toBe(50)
      expect(restoredCache.refuteHistory.size).toBe(cache.refuteHistory.size)

      // Verify can continue from where it left off
      restoredCache.addCycle({ counter: 51, refuted: ['node1'] } as P2P.CycleCreatorTypes.CycleRecord)
      expect(restoredCache.lastProcessedCycle).toBe(51)
    })

    test('should handle cache corruption recovery', () => {
      // Simulate corrupted cache scenario
      const errorCache = new ProblematicNodeCache(config)
      
      // If cache load fails, should be able to rebuild from cycles
      const cycles: Partial<P2P.CycleCreatorTypes.CycleRecord>[] = []
      for (let i = 1; i <= 100; i++) {
        cycles.push({ counter: i, refuted: i % 5 === 0 ? ['node1'] : [] })
      }

      // Should not throw and should build correctly
      expect(() => errorCache.buildFromCycles(cycles as P2P.CycleCreatorTypes.CycleRecord[])).not.toThrow()
      expect(errorCache.lastProcessedCycle).toBe(100)
      expect(errorCache.refuteHistory.get('node1')?.length).toBe(12) // Every 5th cycle 60 cycle history.
    })
  })

  describe('ProblematicNodeCache - Cycle Tracking', () => {
    let cache: ProblematicNodeCache
    const config = {
      p2p: {
        problematicNodeHistoryLength: 100,
        problematicNodeConsecutiveRefuteThreshold: 3,
        problematicNodeRefutePercentageThreshold: 0.5,
        maxProblematicNodeRemovalsPerCycle: 1
      }
    }

    beforeEach(() => {
      cache = new ProblematicNodeCache(config)
    })

    describe('processedCycles tracking', () => {
      it('should track all cycles, even those without refutes', () => {
        const cycles: P2P.CycleCreatorTypes.CycleRecord[] = [
          { counter: 1, refuted: [] } as any,
          { counter: 2, refuted: ['node1'] } as any,
          { counter: 3, refuted: [] } as any,
          { counter: 4, refuted: ['node2', 'node3'] } as any,
          { counter: 5, refuted: [] } as any,
        ]

        cache.buildFromCycles(cycles)

        // Check that all cycles are tracked
        expect(cache.processedCycles.size).toBe(5)
        expect(cache.isCycleProcessed(1)).toBe(true)
        expect(cache.isCycleProcessed(2)).toBe(true)
        expect(cache.isCycleProcessed(3)).toBe(true)
        expect(cache.isCycleProcessed(4)).toBe(true)
        expect(cache.isCycleProcessed(5)).toBe(true)
        expect(cache.isCycleProcessed(6)).toBe(false)

        // Check cycle range
        expect(cache.cycleRange).toEqual({ min: 1, max: 5 })
      })

      it('should correctly report cycle coverage', () => {
        const cycles: P2P.CycleCreatorTypes.CycleRecord[] = [
          { counter: 1, refuted: [] } as any,
          { counter: 2, refuted: ['node1'] } as any,
          { counter: 3, refuted: [] } as any,
          { counter: 5, refuted: [] } as any, // Gap at cycle 4
        ]

        cache.buildFromCycles(cycles)

        const coverage = cache.getCycleCoverage()
        
        expect(coverage.totalCycles).toBe(4)
        expect(coverage.cyclesWithRefutes).toBe(1) // Only cycle 2 has refutes
        expect(coverage.cycleRange).toEqual({ min: 1, max: 5 })
        expect(coverage.missingCycles).toEqual([4]) // Cycle 4 is missing
      })

      it('should handle addCycle for cycles without refutes', () => {
        const cycle1: P2P.CycleCreatorTypes.CycleRecord = { counter: 1, refuted: [] } as any
        const cycle2: P2P.CycleCreatorTypes.CycleRecord = { counter: 2, refuted: ['node1'] } as any
        const cycle3: P2P.CycleCreatorTypes.CycleRecord = { counter: 3, refuted: [] } as any

        cache.addCycle(cycle1)
        cache.addCycle(cycle2)
        cache.addCycle(cycle3)

        expect(cache.processedCycles.size).toBe(3)
        expect(cache.getProcessedCycles()).toEqual([1, 2, 3])
        expect(cache.cycleRange).toEqual({ min: 1, max: 3 })

        const coverage = cache.getCycleCoverage()
        expect(coverage.totalCycles).toBe(3)
        expect(coverage.cyclesWithRefutes).toBe(1)
      })

      it('should prune processedCycles correctly', () => {
        const cycles: P2P.CycleCreatorTypes.CycleRecord[] = []
        for (let i = 1; i <= 150; i++) {
          cycles.push({ counter: i, refuted: i % 10 === 0 ? [`node${i}`] : [] } as any)
        }

        cache.buildFromCycles(cycles)
        
        // With history length of 100, cycles 1-50 should be pruned
        expect(cache.processedCycles.size).toBe(100)
        expect(cache.isCycleProcessed(1)).toBe(false)
        expect(cache.isCycleProcessed(50)).toBe(false)
        expect(cache.isCycleProcessed(51)).toBe(true)
        expect(cache.isCycleProcessed(150)).toBe(true)
        expect(cache.cycleRange).toEqual({ min: 51, max: 150 })
      })
    })

    describe('export/import with cycle tracking', () => {
      it('should export and import v2 format correctly', () => {
        const cycles: P2P.CycleCreatorTypes.CycleRecord[] = [
          { counter: 1, refuted: [] } as any,
          { counter: 2, refuted: ['node1'] } as any,
          { counter: 3, refuted: [] } as any,
          { counter: 4, refuted: ['node2'] } as any,
        ]

        cache.buildFromCycles(cycles)

        const json = cache.toJSON()
        const data = JSON.parse(json)

        expect(data.processedCycles).toEqual([1, 2, 3, 4])
        expect(data.cycleRange).toEqual({ min: 1, max: 4 })

        // Import and verify
        const importedCache = ProblematicNodeCache.fromJSON(json, config)
        
        expect(importedCache.processedCycles.size).toBe(4)
        expect(importedCache.getProcessedCycles()).toEqual([1, 2, 3, 4])
        expect(importedCache.cycleRange).toEqual({ min: 1, max: 4 })
        expect(importedCache.getCycleCoverage().cyclesWithRefutes).toBe(2)
      })
    })

    describe('memory usage with cycle tracking', () => {
      it('should include processedCycles in memory calculation', () => {
        const cycles: P2P.CycleCreatorTypes.CycleRecord[] = []
        for (let i = 1; i <= 100; i++) {
          cycles.push({ counter: i, refuted: [] } as any)
        }

        cache.buildFromCycles(cycles)
        const memoryUsage = cache.getMemoryUsage()
        
        // Should include 100 cycles * 8 bytes = 800 bytes minimum
        expect(memoryUsage).toBeGreaterThanOrEqual(800)
      })
    })
  })
})