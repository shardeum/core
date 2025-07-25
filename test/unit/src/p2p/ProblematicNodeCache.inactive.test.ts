import { ProblematicNodeCache } from '../../../../src/p2p/ProblematicNodeCache'
import { P2P } from '@shardeum-foundation/lib-types'

describe('ProblematicNodeCache - Inactive Node Filtering', () => {
  let cache: ProblematicNodeCache
  const mockConfig = {
    p2p: {
      problematicNodeConsecutiveRefuteThreshold: 3,
      problematicNodeRefutePercentageThreshold: 0.1,
      problematicNodeHistoryLength: 100,
      maxProblematicNodeRemovalsPerCycle: 10,
    },
  }

  beforeEach(() => {
    cache = new ProblematicNodeCache(mockConfig)
  })

  it('should only return problematic nodes that are in the active nodes set', () => {
    // Build cache with refute history for multiple nodes
    const cycles: P2P.CycleCreatorTypes.CycleRecord[] = []

    for (let i = 1; i <= 100; i++) {
      const cycle = {
        counter: i,
        refuted: [] as string[],
        lost: [],
        active: 5,
        start: Date.now(),
        mode: 'processing' as const,
        desired: 100,
        networkId: '',
        previous: '',
        duration: 1000,
        networkConfigHash: '',
      } as P2P.CycleCreatorTypes.CycleRecord

      // Add refutes for different nodes
      if (i >= 98 && i <= 100) {
        cycle.refuted.push('active-node-1') // 3 consecutive refutes
        cycle.refuted.push('removed-node-1') // Also 3 consecutive refutes but removed
      }

      if (i >= 80 && i <= 90) {
        cycle.refuted.push('active-node-2') // 11% refute rate
        cycle.refuted.push('removed-node-2') // Also 11% refute rate but removed
      }

      if (i >= 95 && i <= 100) {
        cycle.refuted.push('removed-node-3') // 6 consecutive refutes, highly problematic but removed
      }

      cycles.push(cycle)
    }

    // Build cache from cycles
    cache.buildFromCycles(cycles)

    // Verify all nodes are in the cache
    expect(cache.refuteHistory.has('active-node-1')).toBe(true)
    expect(cache.refuteHistory.has('active-node-2')).toBe(true)
    expect(cache.refuteHistory.has('removed-node-1')).toBe(true)
    expect(cache.refuteHistory.has('removed-node-2')).toBe(true)
    expect(cache.refuteHistory.has('removed-node-3')).toBe(true)

    // Define active nodes (only node-1 and node-2 are active)
    const activeNodes = new Set(['active-node-1', 'active-node-2'])

    // Get problematic nodes - should only return active ones
    const problematicNodes = cache.getProblematicNodes(100, activeNodes)

    // Should only contain active nodes
    expect(problematicNodes).toContain('active-node-1')
    expect(problematicNodes).toContain('active-node-2')

    // Should NOT contain removed nodes even though they are problematic
    expect(problematicNodes).not.toContain('removed-node-1')
    expect(problematicNodes).not.toContain('removed-node-2')
    expect(problematicNodes).not.toContain('removed-node-3')

    // The cache still has data for removed nodes (for debugging/export purposes)
    expect(cache.refuteHistory.has('removed-node-1')).toBe(true)
    expect(cache.refuteHistory.has('removed-node-2')).toBe(true)
    expect(cache.refuteHistory.has('removed-node-3')).toBe(true)
  })

  it('should handle pruneInactiveNodes to remove inactive nodes from cache', () => {
    // Build cache with refute history
    const cycles: P2P.CycleCreatorTypes.CycleRecord[] = []

    for (let i = 98; i <= 100; i++) {
      cycles.push({
        counter: i,
        refuted: ['active-node', 'inactive-node'],
        lost: [],
        active: 2,
        start: Date.now(),
        mode: 'processing' as const,
        desired: 100,
        networkId: '',
        previous: '',
        duration: 1000,
        networkConfigHash: '',
      } as P2P.CycleCreatorTypes.CycleRecord)
    }

    cache.buildFromCycles(cycles)

    // Verify both nodes are in cache
    expect(cache.refuteHistory.has('active-node')).toBe(true)
    expect(cache.refuteHistory.has('inactive-node')).toBe(true)

    // Prune inactive nodes
    const activeNodes = new Set(['active-node'])
    cache.pruneInactiveNodes(activeNodes)

    // Active node should remain
    expect(cache.refuteHistory.has('active-node')).toBe(true)

    // Inactive node should be removed
    expect(cache.refuteHistory.has('inactive-node')).toBe(false)
  })

  it('should return empty array when no active nodes are problematic', () => {
    // Build cache with only non-problematic refute patterns
    const cycles: P2P.CycleCreatorTypes.CycleRecord[] = []

    for (let i = 1; i <= 100; i++) {
      const cycle = {
        counter: i,
        refuted: [] as string[],
        lost: [],
        active: 2,
        start: Date.now(),
        mode: 'processing' as const,
        desired: 100,
        networkId: '',
        previous: '',
        duration: 1000,
        networkConfigHash: '',
      } as P2P.CycleCreatorTypes.CycleRecord

      // Add sparse refutes that don't meet problematic thresholds
      if (i % 20 === 0) {
        cycle.refuted.push('node-1') // Only 5% refute rate
      }

      if (i === 50 || i === 70) {
        cycle.refuted.push('node-2') // Non-consecutive refutes
      }

      cycles.push(cycle)
    }

    cache.buildFromCycles(cycles)

    const activeNodes = new Set(['node-1', 'node-2'])
    const problematicNodes = cache.getProblematicNodes(100, activeNodes)

    // No nodes should be problematic
    expect(problematicNodes).toEqual([])
  })
})
