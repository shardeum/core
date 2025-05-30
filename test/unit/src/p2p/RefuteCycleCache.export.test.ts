import * as RefuteCycleCache from '../../../../src/p2p/RefuteCycleCache'
import { config } from '../../../../src/p2p/Context'
import * as crypto from '@shardeum-foundation/lib-crypto-utils'

// Mock the config and logger
jest.mock('../../../../src/p2p/Context', () => ({
  config: {
    p2p: {
      enableProblematicNodeRemoval: true,
      problematicNodeHistoryLength: 100
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

// Mock crypto module - need to mock the actual lib-crypto-utils
jest.mock('@shardeum-foundation/lib-crypto-utils', () => ({
  init: jest.fn(),
  hash: jest.fn((data: string) => {
    // Simple mock hash function - just return first 8 chars of data
    return 'hash_' + data.substring(0, 8)
  })
}))

describe('RefuteCycleCache Export/Import Tests', () => {
  beforeEach(() => {
    RefuteCycleCache.clearRefuteCache()
    config.p2p.enableProblematicNodeRemoval = true
    config.p2p.problematicNodeHistoryLength = 100
  })

  describe('exportCacheState', () => {
    it('should export empty state when cache is empty', () => {
      const state = RefuteCycleCache.exportCacheState(50)
      
      expect(state.cycleNumber).toBe(50)
      expect(state.cacheData).toHaveLength(0)
      expect(state.checksum).toBeDefined()
    })

    it('should export cache data within history window', () => {
      // Add some test data
      RefuteCycleCache.updateRefuteCache({
        counter: 10,
        refuted: ['node1', 'node2']
      } as any)
      
      RefuteCycleCache.updateRefuteCache({
        counter: 20,
        refuted: ['node3']
      } as any)
      
      RefuteCycleCache.updateRefuteCache({
        counter: 110,
        refuted: ['node4']
      } as any)
      
      const state = RefuteCycleCache.exportCacheState(110)
      
      expect(state.cycleNumber).toBe(110)
      expect(state.cacheData).toHaveLength(2) // Only cycles 20 and 110 should be in window
      expect(state.cacheData[0].cycle).toBe(20)
      expect(state.cacheData[1].cycle).toBe(110)
      expect(state.cacheData[0].refutedNodes).toEqual(['node3'])
      expect(state.cacheData[1].refutedNodes).toEqual(['node4'])
    })

    it('should create deterministic checksums', () => {
      RefuteCycleCache.updateRefuteCache({
        counter: 50,
        refuted: ['node1', 'node2']
      } as any)
      
      const state1 = RefuteCycleCache.exportCacheState(100)
      const state2 = RefuteCycleCache.exportCacheState(100)
      
      expect(state1.checksum).toBe(state2.checksum)
    })
  })

  describe('importCacheState', () => {
    it('should successfully import valid cache state', () => {
      const stateToImport: RefuteCycleCache.RefuteCacheState = {
        cycleNumber: 100,
        cacheData: [
          { cycle: 50, refutedNodes: ['node1', 'node2'] },
          { cycle: 60, refutedNodes: ['node3'] }
        ],
        checksum: 'hash_[{"cycle"' // Mock checksum that matches
      }
      
      const result = RefuteCycleCache.importCacheState(stateToImport)
      
      expect(result).toBe(true)
      
      // Verify the data was imported correctly
      const refuteCycles = RefuteCycleCache.getRefuteCyclesForNode('node1', 100)
      expect(refuteCycles).toEqual([50])
    })

    it('should reject state with invalid checksum', () => {
      const stateToImport: RefuteCycleCache.RefuteCacheState = {
        cycleNumber: 100,
        cacheData: [
          { cycle: 50, refutedNodes: ['node1'] }
        ],
        checksum: 'invalid_checksum'
      }
      
      const result = RefuteCycleCache.importCacheState(stateToImport)
      
      expect(result).toBe(false)
    })

    it('should clear existing cache before import', () => {
      // Add existing data
      RefuteCycleCache.updateRefuteCache({
        counter: 30,
        refuted: ['existing_node']
      } as any)
      
      const stateToImport: RefuteCycleCache.RefuteCacheState = {
        cycleNumber: 100,
        cacheData: [
          { cycle: 50, refutedNodes: ['new_node'] }
        ],
        checksum: 'hash_[{"cycle"'
      }
      
      RefuteCycleCache.importCacheState(stateToImport)
      
      // Old data should be gone
      const oldRefutes = RefuteCycleCache.getRefuteCyclesForNode('existing_node', 100)
      expect(oldRefutes).toEqual([])
      
      // New data should be present
      const newRefutes = RefuteCycleCache.getRefuteCyclesForNode('new_node', 100)
      expect(newRefutes).toEqual([50])
    })
  })

  describe('calculateCacheChecksum', () => {
    it('should calculate checksum from provided data', () => {
      const cacheData = [
        { cycle: 10, refutedNodes: ['node1', 'node2'] },
        { cycle: 20, refutedNodes: ['node3'] }
      ]
      
      const checksum = RefuteCycleCache.calculateCacheChecksum(cacheData)
      
      expect(checksum).toBeDefined()
      expect(checksum).toContain('hash_')
    })

    it('should calculate checksum from current cache if no data provided', () => {
      RefuteCycleCache.updateRefuteCache({
        counter: 50,
        refuted: ['node1']
      } as any)
      
      const checksum = RefuteCycleCache.calculateCacheChecksum()
      
      expect(checksum).toBeDefined()
      expect(checksum).toContain('hash_')
    })
  })

  describe('getCacheCompleteness', () => {
    it('should return 0 for empty cache', () => {
      const completeness = RefuteCycleCache.getCacheCompleteness(100)
      expect(completeness).toBe(0)
    })

    it('should calculate correct completeness percentage', () => {
      // Add data for cycles 95, 96, 97, 98, 99, 100 (6 out of 100 possible)
      for (let i = 95; i <= 100; i++) {
        RefuteCycleCache.updateRefuteCache({
          counter: i,
          refuted: ['node1']
        } as any)
      }
      
      const completeness = RefuteCycleCache.getCacheCompleteness(100)
      expect(completeness).toBe(0.06) // 6/100
    })

    it('should handle early cycles correctly', () => {
      // For cycle 10, window size should be 10, not 100
      for (let i = 1; i <= 5; i++) {
        RefuteCycleCache.updateRefuteCache({
          counter: i,
          refuted: ['node1']
        } as any)
      }
      
      const completeness = RefuteCycleCache.getCacheCompleteness(10)
      expect(completeness).toBe(0.5) // 5/10
    })
  })

  describe('Export/Import Round Trip', () => {
    it('should maintain data integrity through export and import', () => {
      // Create test data
      const testData = [
        { cycle: 50, nodes: ['node1', 'node2', 'node3'] },
        { cycle: 60, nodes: ['node2', 'node4'] },
        { cycle: 70, nodes: ['node5'] },
        { cycle: 80, nodes: ['node1', 'node5', 'node6'] }
      ]
      
      // Add test data to cache
      for (const data of testData) {
        RefuteCycleCache.updateRefuteCache({
          counter: data.cycle,
          refuted: data.nodes
        } as any)
      }
      
      // Export state
      const exportedState = RefuteCycleCache.exportCacheState(100)
      
      // Clear cache
      RefuteCycleCache.clearRefuteCache()
      
      // Verify cache is empty
      expect(RefuteCycleCache.getCacheCompleteness(100)).toBe(0)
      
      // Import state
      const importSuccess = RefuteCycleCache.importCacheState(exportedState)
      expect(importSuccess).toBe(true)
      
      // Verify all data is restored correctly
      expect(RefuteCycleCache.getRefuteCyclesForNode('node1', 100)).toEqual([50, 80])
      expect(RefuteCycleCache.getRefuteCyclesForNode('node2', 100)).toEqual([50, 60])
      expect(RefuteCycleCache.getRefuteCyclesForNode('node5', 100)).toEqual([70, 80])
    })
  })
})