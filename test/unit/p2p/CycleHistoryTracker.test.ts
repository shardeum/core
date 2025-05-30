import { CycleHistoryTracker } from '../../../src/p2p/CycleHistoryTracker'
import { P2P } from '@shardus/types'

describe('CycleHistoryTracker', () => {
  let tracker: CycleHistoryTracker
  
  beforeEach(() => {
    tracker = new CycleHistoryTracker(33)
  })
  
  afterEach(() => {
    tracker.clear()
  })
  
  const createMockCycle = (counter: number): P2P.CycleCreatorTypes.CycleRecord => {
    return {
      counter,
      previous: counter > 0 ? `hash-${counter - 1}` : '',
      marker: `hash-${counter}`,
      start: counter * 30,
      duration: 30,
      networkId: 'test-network',
      mode: 'processing',
      active: 100,
      desired: 100,
      activated: [],
      activatedPublicKeys: [],
      joined: [],
      joinedArchivers: [],
      joinedConsensors: [],
      refreshedConsensors: [],
      refreshedArchivers: [],
      expired: [],
      lost: [],
      lostSyncing: [],
      refuted: [],
      archiverListHash: 'archiver-hash',
      standbyNodeListHash: 'standby-hash',
      removed: [],
      apoptosized: [],
      nodeListHash: 'node-hash',
      syncing: 0,
      standby: 0,
      standbyAdd: [],
      standbyRemove: [],
      startedSyncing: [],
      finishedSyncing: [],
      txlisthash: 'tx-hash',
    } as P2P.CycleCreatorTypes.CycleRecord
  }
  
  describe('addCycle', () => {
    it('should add a valid cycle', () => {
      const cycle = createMockCycle(10)
      tracker.addCycle(cycle)
      
      expect(tracker.getCycle(10)).toEqual(cycle)
      expect(tracker.getCycleRange()).toEqual({
        oldest: 10,
        newest: 10,
        count: 1
      })
    })
    
    it('should handle invalid cycle gracefully', () => {
      tracker.addCycle(null as any)
      tracker.addCycle({} as any)
      
      expect(tracker.getCycleRange().count).toBe(0)
    })
    
    it('should update oldest and newest correctly', () => {
      tracker.addCycle(createMockCycle(5))
      tracker.addCycle(createMockCycle(10))
      tracker.addCycle(createMockCycle(3))
      
      const range = tracker.getCycleRange()
      expect(range.oldest).toBe(3)
      expect(range.newest).toBe(10)
      expect(range.count).toBe(3)
    })
    
    it('should identify missing cycles', () => {
      tracker.addCycle(createMockCycle(1))
      tracker.addCycle(createMockCycle(3))
      tracker.addCycle(createMockCycle(5))
      
      const missing = tracker.getMissingCycles()
      expect(missing).toEqual([2, 4])
    })
  })
  
  describe('hasCompleteHistory', () => {
    it('should return false when no cycles', () => {
      expect(tracker.hasCompleteHistory(10)).toBe(false)
    })
    
    it('should return true when all required cycles present', () => {
      // Add cycles 0-32 (33 cycles)
      for (let i = 0; i <= 32; i++) {
        tracker.addCycle(createMockCycle(i))
      }
      
      expect(tracker.hasCompleteHistory(32)).toBe(true)
    })
    
    it('should return false when missing cycles', () => {
      // Add cycles 0-32 but skip 15
      for (let i = 0; i <= 32; i++) {
        if (i !== 15) {
          tracker.addCycle(createMockCycle(i))
        }
      }
      
      expect(tracker.hasCompleteHistory(32)).toBe(false)
    })
    
    it('should handle young networks correctly', () => {
      // Network with only 10 cycles (0-9)
      for (let i = 0; i <= 9; i++) {
        tracker.addCycle(createMockCycle(i))
      }
      
      // Should return true because network only has 10 cycles
      expect(tracker.hasCompleteHistory(9)).toBe(true)
    })
  })
  
  describe('getCompleteness', () => {
    it('should return 0 when no cycles', () => {
      expect(tracker.getCompleteness(10)).toBe(0)
    })
    
    it('should return 1 when all cycles present', () => {
      for (let i = 0; i <= 32; i++) {
        tracker.addCycle(createMockCycle(i))
      }
      
      expect(tracker.getCompleteness(32)).toBe(1)
    })
    
    it('should return partial completeness', () => {
      // Add 20 out of 33 required cycles
      for (let i = 13; i <= 32; i++) {
        tracker.addCycle(createMockCycle(i))
      }
      
      expect(tracker.getCompleteness(32)).toBeCloseTo(20/33, 2)
    })
  })
  
  describe('getAllCycles', () => {
    it('should return cycles in sorted order', () => {
      tracker.addCycle(createMockCycle(5))
      tracker.addCycle(createMockCycle(2))
      tracker.addCycle(createMockCycle(8))
      
      const cycles = tracker.getAllCycles()
      expect(cycles.map(c => c.counter)).toEqual([2, 5, 8])
    })
  })
  
  describe('getDiagnostics', () => {
    it('should provide accurate diagnostic information', () => {
      tracker.addCycle(createMockCycle(10))
      tracker.addCycle(createMockCycle(12))
      tracker.addCycle(createMockCycle(14))
      
      const diagnostics = tracker.getDiagnostics()
      expect(diagnostics).toEqual({
        targetCycleCount: 33,
        cycleCount: 3,
        oldestCycle: 10,
        newestCycle: 14,
        missingCyclesCount: 2,
        missingCycles: [11, 13],
        completenessPercentage: expect.any(Number)
      })
    })
  })
})