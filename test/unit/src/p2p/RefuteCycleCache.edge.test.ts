import { P2P } from '@shardeum-foundation/lib-types'
import * as RefuteCycleCache from '../../../../src/p2p/RefuteCycleCache'
import { config } from '../../../../src/p2p/Context'
import { logFlags } from '../../../../src/logger'

// Mock dependencies
jest.mock('../../../../src/p2p/Context', () => ({
  config: {
    p2p: {
      enableProblematicNodeRemoval: true,
      problematicNodeHistoryLength: 10,
      enableProblematicNodeRemovalOnCycle: 1
    }
  }
}))

jest.mock('../../../../src/logger', () => ({
  logFlags: {
    p2pNonFatal: false
  }
}))

jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn()
  }
}))

// Spy on console.log to test logging branches
const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()

describe('RefuteCycleCache Edge Cases', () => {
  beforeEach(() => {
    RefuteCycleCache.clearRefuteCache()
    jest.clearAllMocks()
  })

  describe('Logging branches', () => {
    it('should log when p2pNonFatal flag is true', () => {
      // Enable logging
      ;(logFlags as any).p2pNonFatal = true

      const cycle: P2P.CycleCreatorTypes.CycleRecord = {
        counter: 10,
        refuted: ['node1', 'node2']
      } as P2P.CycleCreatorTypes.CycleRecord

      RefuteCycleCache.updateRefuteCache(cycle)

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'RefuteCycleCache: Added 2 refuted nodes for cycle 10'
      )

      // Test pruning log
      const cycle2: P2P.CycleCreatorTypes.CycleRecord = {
        counter: 25,
        refuted: ['node3']
      } as P2P.CycleCreatorTypes.CycleRecord

      RefuteCycleCache.updateRefuteCache(cycle2)

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'RefuteCycleCache: Pruned 1 old cycles'
      )

      // Test clear log
      RefuteCycleCache.clearRefuteCache()
      expect(consoleLogSpy).toHaveBeenCalledWith('RefuteCycleCache: Cache cleared')

      // Restore flag
      ;(logFlags as any).p2pNonFatal = false
    })
  })

  describe('Invalid input handling', () => {
    it('should handle negative cycle numbers', () => {
      const cycle: P2P.CycleCreatorTypes.CycleRecord = {
        counter: -5,
        refuted: ['node1']
      } as P2P.CycleCreatorTypes.CycleRecord

      RefuteCycleCache.updateRefuteCache(cycle)

      // Should still add the cycle
      const stats = RefuteCycleCache.getCacheStats()
      expect(stats.totalCycles).toBe(1)
      expect(stats.oldestCycle).toBe(-5)

      // Should not return negative cycles when windowStart is positive
      const refuteCycles = RefuteCycleCache.getRefuteCyclesForNode('node1', 10)
      expect(refuteCycles).toEqual([])
    })

    it('should handle very large cycle numbers', () => {
      const largeCycle = Number.MAX_SAFE_INTEGER - 1
      const cycle: P2P.CycleCreatorTypes.CycleRecord = {
        counter: largeCycle,
        refuted: ['node1']
      } as P2P.CycleCreatorTypes.CycleRecord

      RefuteCycleCache.updateRefuteCache(cycle)

      const refuteCycles = RefuteCycleCache.getRefuteCyclesForNode('node1', largeCycle)
      expect(refuteCycles).toEqual([largeCycle])
    })

    it('should handle null/undefined in refuted array gracefully', () => {
      const cycle: P2P.CycleCreatorTypes.CycleRecord = {
        counter: 10,
        refuted: ['node1', null as any, undefined as any, 'node2']
      } as P2P.CycleCreatorTypes.CycleRecord

      RefuteCycleCache.updateRefuteCache(cycle)

      // Should add all values including null/undefined
      const stats = RefuteCycleCache.getCacheStats()
      expect(stats.totalRefutedNodes).toBe(4) // Includes null and undefined
    })

    it('should handle cycle.refuted being undefined', () => {
      const cycle: P2P.CycleCreatorTypes.CycleRecord = {
        counter: 10,
        refuted: undefined as any
      } as P2P.CycleCreatorTypes.CycleRecord

      // Should not throw
      expect(() => RefuteCycleCache.updateRefuteCache(cycle)).not.toThrow()

      const stats = RefuteCycleCache.getCacheStats()
      expect(stats.totalCycles).toBe(0)
    })
  })

  describe('Performance with large datasets', () => {
    it('should handle large number of refuted nodes efficiently', () => {
      const largeRefutedList = Array.from({ length: 1000 }, (_, i) => `node${i}`)
      const cycle: P2P.CycleCreatorTypes.CycleRecord = {
        counter: 10,
        refuted: largeRefutedList
      } as P2P.CycleCreatorTypes.CycleRecord

      const startTime = Date.now()
      RefuteCycleCache.updateRefuteCache(cycle)
      const updateTime = Date.now() - startTime

      expect(updateTime).toBeLessThan(100) // Should be fast

      // Test retrieval performance
      const retrieveStartTime = Date.now()
      const refuteCycles = RefuteCycleCache.getRefuteCyclesForNode('node500', 10)
      const retrieveTime = Date.now() - retrieveStartTime

      expect(retrieveTime).toBeLessThan(10) // Should be very fast
      expect(refuteCycles).toEqual([10])
    })

    it('should efficiently prune many old cycles', () => {
      // Add 100 cycles
      for (let i = 1; i <= 100; i++) {
        const cycle: P2P.CycleCreatorTypes.CycleRecord = {
          counter: i,
          refuted: [`node${i}`]
        } as P2P.CycleCreatorTypes.CycleRecord
        RefuteCycleCache.updateRefuteCache(cycle)
      }

      expect(RefuteCycleCache.getCacheStats().totalCycles).toBe(10) // Only last 10
    })
  })

  describe('Window boundary conditions', () => {
    it('should handle currentCycle equal to windowStart', () => {
      config.p2p.problematicNodeHistoryLength = 5

      // Add cycle 5
      const cycle: P2P.CycleCreatorTypes.CycleRecord = {
        counter: 5,
        refuted: ['node1']
      } as P2P.CycleCreatorTypes.CycleRecord
      RefuteCycleCache.updateRefuteCache(cycle)

      // Current cycle 10, window start is 5
      const refuteCycles = RefuteCycleCache.getRefuteCyclesForNode('node1', 10)
      expect(refuteCycles).toEqual([5]) // Should include cycle 5

      // Restore config
      config.p2p.problematicNodeHistoryLength = 10
    })

    it('should handle getAllRefutedNodes with no cycles in window', () => {
      // Add old cycle
      const cycle: P2P.CycleCreatorTypes.CycleRecord = {
        counter: 1,
        refuted: ['node1']
      } as P2P.CycleCreatorTypes.CycleRecord
      RefuteCycleCache.updateRefuteCache(cycle)

      // Query with current cycle way ahead
      const allRefuted = RefuteCycleCache.getAllRefutedNodes(100)
      expect(allRefuted.size).toBe(0)
    })
  })

  describe('Cache state consistency', () => {
    it('should maintain consistent state after multiple operations', () => {
      // Add, prune, add more
      for (let i = 1; i <= 20; i++) {
        const cycle: P2P.CycleCreatorTypes.CycleRecord = {
          counter: i,
          refuted: i % 2 === 0 ? ['nodeA', 'nodeB'] : ['nodeC']
        } as P2P.CycleCreatorTypes.CycleRecord
        RefuteCycleCache.updateRefuteCache(cycle)
      }

      const stats = RefuteCycleCache.getCacheStats()
      expect(stats.totalCycles).toBe(10)
      expect(stats.oldestCycle).toBe(11)
      expect(stats.newestCycle).toBe(20)

      // Verify data integrity
      const nodeARefutes = RefuteCycleCache.getRefuteCyclesForNode('nodeA', 20)
      expect(nodeARefutes).toEqual([12, 14, 16, 18, 20]) // Only even cycles in window
    })
  })
})