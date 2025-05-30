import { P2P } from '@shardeum-foundation/lib-types'
import * as RefuteCycleCache from '../../../../src/p2p/RefuteCycleCache'
import { config } from '../../../../src/p2p/Context'

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

describe('RefuteCycleCache', () => {
  beforeEach(() => {
    // Clear cache before each test
    RefuteCycleCache.clearRefuteCache()
  })

  describe('updateRefuteCache', () => {
    it('should add refuted nodes to cache', () => {
      const cycle: P2P.CycleCreatorTypes.CycleRecord = {
        counter: 10,
        refuted: ['node1', 'node2', 'node3']
      } as P2P.CycleCreatorTypes.CycleRecord

      RefuteCycleCache.updateRefuteCache(cycle)

      const stats = RefuteCycleCache.getCacheStats()
      expect(stats.totalCycles).toBe(1)
      expect(stats.totalRefutedNodes).toBe(3)
      expect(stats.oldestCycle).toBe(10)
      expect(stats.newestCycle).toBe(10)
    })

    it('should handle empty refuted list', () => {
      const cycle: P2P.CycleCreatorTypes.CycleRecord = {
        counter: 10,
        refuted: []
      } as P2P.CycleCreatorTypes.CycleRecord

      RefuteCycleCache.updateRefuteCache(cycle)

      const stats = RefuteCycleCache.getCacheStats()
      expect(stats.totalCycles).toBe(0)
      expect(stats.totalRefutedNodes).toBe(0)
    })

    it('should prune old cycles outside history window', () => {
      // Add cycles from 1 to 15
      for (let i = 1; i <= 15; i++) {
        const cycle: P2P.CycleCreatorTypes.CycleRecord = {
          counter: i,
          refuted: [`node${i}`]
        } as P2P.CycleCreatorTypes.CycleRecord
        RefuteCycleCache.updateRefuteCache(cycle)
      }

      const stats = RefuteCycleCache.getCacheStats()
      // History window is 10, so cycles 1-5 should be pruned
      expect(stats.totalCycles).toBe(10)
      expect(stats.oldestCycle).toBe(6)
      expect(stats.newestCycle).toBe(15)
    })

    it('should not update cache when feature is disabled', () => {
      const originalConfig = config.p2p.enableProblematicNodeRemoval
      config.p2p.enableProblematicNodeRemoval = false

      const cycle: P2P.CycleCreatorTypes.CycleRecord = {
        counter: 10,
        refuted: ['node1']
      } as P2P.CycleCreatorTypes.CycleRecord

      RefuteCycleCache.updateRefuteCache(cycle)

      const stats = RefuteCycleCache.getCacheStats()
      expect(stats.totalCycles).toBe(0)

      // Restore config
      config.p2p.enableProblematicNodeRemoval = originalConfig
    })
  })

  describe('getRefuteCyclesForNode', () => {
    beforeEach(() => {
      // Set up test data
      const cycles = [
        { counter: 10, refuted: ['node1', 'node2'] },
        { counter: 11, refuted: ['node2', 'node3'] },
        { counter: 12, refuted: ['node1', 'node3'] },
        { counter: 13, refuted: ['node1', 'node2', 'node3'] },
      ]

      cycles.forEach(cycle => {
        RefuteCycleCache.updateRefuteCache(cycle as P2P.CycleCreatorTypes.CycleRecord)
      })
    })

    it('should return cycles where node was refuted', () => {
      const node1Cycles = RefuteCycleCache.getRefuteCyclesForNode('node1', 15)
      expect(node1Cycles).toEqual([10, 12, 13])

      const node2Cycles = RefuteCycleCache.getRefuteCyclesForNode('node2', 15)
      expect(node2Cycles).toEqual([10, 11, 13])

      const node3Cycles = RefuteCycleCache.getRefuteCyclesForNode('node3', 15)
      expect(node3Cycles).toEqual([11, 12, 13])
    })

    it('should return empty array for non-refuted node', () => {
      const cycles = RefuteCycleCache.getRefuteCyclesForNode('node4', 15)
      expect(cycles).toEqual([])
    })

    it('should only return cycles within history window', () => {
      // History window is 10, so with current cycle 15, only cycles 6+ are valid
      const node1Cycles = RefuteCycleCache.getRefuteCyclesForNode('node1', 15)
      expect(node1Cycles).toEqual([10, 12, 13])

      // If current cycle is 20, cycle 10 should be excluded
      const node1CyclesAt20 = RefuteCycleCache.getRefuteCyclesForNode('node1', 20)
      expect(node1CyclesAt20).toEqual([12, 13])
    })

    it('should return empty array when feature is disabled', () => {
      const originalConfig = config.p2p.enableProblematicNodeRemoval
      config.p2p.enableProblematicNodeRemoval = false

      const cycles = RefuteCycleCache.getRefuteCyclesForNode('node1', 15)
      expect(cycles).toEqual([])

      // Restore config
      config.p2p.enableProblematicNodeRemoval = originalConfig
    })
  })

  describe('getAllRefutedNodes', () => {
    beforeEach(() => {
      const cycles = [
        { counter: 10, refuted: ['node1', 'node2'] },
        { counter: 11, refuted: ['node2', 'node3'] },
        { counter: 12, refuted: ['node1', 'node3'] },
      ]

      cycles.forEach(cycle => {
        RefuteCycleCache.updateRefuteCache(cycle as P2P.CycleCreatorTypes.CycleRecord)
      })
    })

    it('should return all refuted nodes with their cycles', () => {
      const allRefuted = RefuteCycleCache.getAllRefutedNodes(15)
      
      expect(allRefuted.size).toBe(3)
      expect(allRefuted.get('node1')).toEqual([10, 12])
      expect(allRefuted.get('node2')).toEqual([10, 11])
      expect(allRefuted.get('node3')).toEqual([11, 12])
    })

    it('should respect history window', () => {
      const allRefuted = RefuteCycleCache.getAllRefutedNodes(20)
      
      // Cycle 10 should be excluded (outside window)
      expect(allRefuted.get('node1')).toEqual([12])
      expect(allRefuted.get('node2')).toEqual([11])
      expect(allRefuted.get('node3')).toEqual([11, 12])
    })
  })

  describe('clearRefuteCache', () => {
    it('should clear all cache data', () => {
      // Add some data
      const cycle: P2P.CycleCreatorTypes.CycleRecord = {
        counter: 10,
        refuted: ['node1', 'node2']
      } as P2P.CycleCreatorTypes.CycleRecord
      RefuteCycleCache.updateRefuteCache(cycle)

      // Verify data exists
      let stats = RefuteCycleCache.getCacheStats()
      expect(stats.totalCycles).toBe(1)

      // Clear cache
      RefuteCycleCache.clearRefuteCache()

      // Verify cache is empty
      stats = RefuteCycleCache.getCacheStats()
      expect(stats.totalCycles).toBe(0)
      expect(stats.totalRefutedNodes).toBe(0)
      expect(stats.oldestCycle).toBeNull()
      expect(stats.newestCycle).toBeNull()
    })
  })

  describe('getCacheStats', () => {
    it('should return correct statistics', () => {
      const cycles = [
        { counter: 10, refuted: ['node1', 'node2'] },
        { counter: 11, refuted: ['node2', 'node3', 'node4'] },
        { counter: 12, refuted: ['node1'] },
      ]

      cycles.forEach(cycle => {
        RefuteCycleCache.updateRefuteCache(cycle as P2P.CycleCreatorTypes.CycleRecord)
      })

      const stats = RefuteCycleCache.getCacheStats()
      expect(stats.totalCycles).toBe(3)
      expect(stats.totalRefutedNodes).toBe(6) // 2 + 3 + 1
      expect(stats.oldestCycle).toBe(10)
      expect(stats.newestCycle).toBe(12)
    })

    it('should return nulls for empty cache', () => {
      const stats = RefuteCycleCache.getCacheStats()
      expect(stats.totalCycles).toBe(0)
      expect(stats.totalRefutedNodes).toBe(0)
      expect(stats.oldestCycle).toBeNull()
      expect(stats.newestCycle).toBeNull()
    })
  })
})