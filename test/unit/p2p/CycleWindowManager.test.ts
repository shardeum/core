import { CycleWindowManager } from '../../../src/p2p/CycleWindowManager'
import { P2P } from '@shardus/types'

describe('CycleWindowManager', () => {
  let manager: CycleWindowManager
  
  beforeEach(() => {
    manager = new CycleWindowManager(33, 30)
  })
  
  afterEach(() => {
    manager.clear()
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
  
  describe('constructor', () => {
    it('should throw if analysis window > max cycles', () => {
      expect(() => new CycleWindowManager(20, 30)).toThrow()
    })
  })
  
  describe('addCycle', () => {
    it('should add cycles in order', () => {
      manager.addCycle(createMockCycle(1))
      manager.addCycle(createMockCycle(2))
      manager.addCycle(createMockCycle(3))
      
      expect(manager.getCycleCount()).toBe(3)
      expect(manager.getOldestCycle()?.counter).toBe(1)
      expect(manager.getNewestCycle()?.counter).toBe(3)
    })
    
    it('should maintain sorted order when adding out of order', () => {
      manager.addCycle(createMockCycle(5))
      manager.addCycle(createMockCycle(2))
      manager.addCycle(createMockCycle(8))
      
      const cycles = manager.getAllCycles()
      expect(cycles.map(c => c.counter)).toEqual([2, 5, 8])
    })
    
    it('should replace existing cycle with same counter', () => {
      const cycle1 = createMockCycle(5)
      cycle1.active = 100
      
      const cycle2 = createMockCycle(5)
      cycle2.active = 200
      
      manager.addCycle(cycle1)
      manager.addCycle(cycle2)
      
      expect(manager.getCycleCount()).toBe(1)
      expect(manager.getCycle(5)?.active).toBe(200)
    })
    
    it('should prune old cycles when exceeding max', () => {
      // Add 35 cycles (more than max of 33)
      for (let i = 0; i < 35; i++) {
        manager.addCycle(createMockCycle(i))
      }
      
      expect(manager.getCycleCount()).toBe(33)
      expect(manager.getOldestCycle()?.counter).toBe(2) // 0 and 1 were pruned
      expect(manager.getNewestCycle()?.counter).toBe(34)
    })
  })
  
  describe('getAnalysisWindow', () => {
    it('should return all cycles when count < analysis window size', () => {
      for (let i = 0; i < 20; i++) {
        manager.addCycle(createMockCycle(i))
      }
      
      const analysisWindow = manager.getAnalysisWindow()
      expect(analysisWindow.length).toBe(20)
    })
    
    it('should return oldest 30 cycles when full', () => {
      for (let i = 0; i < 33; i++) {
        manager.addCycle(createMockCycle(i))
      }
      
      const analysisWindow = manager.getAnalysisWindow()
      expect(analysisWindow.length).toBe(30)
      expect(analysisWindow[0].counter).toBe(0)
      expect(analysisWindow[29].counter).toBe(29)
    })
  })
  
  describe('getBufferCycles', () => {
    it('should return empty when cycles <= analysis window', () => {
      for (let i = 0; i < 30; i++) {
        manager.addCycle(createMockCycle(i))
      }
      
      expect(manager.getBufferCycles().length).toBe(0)
    })
    
    it('should return newest 3 cycles when full', () => {
      for (let i = 0; i < 33; i++) {
        manager.addCycle(createMockCycle(i))
      }
      
      const bufferCycles = manager.getBufferCycles()
      expect(bufferCycles.length).toBe(3)
      expect(bufferCycles[0].counter).toBe(30)
      expect(bufferCycles[1].counter).toBe(31)
      expect(bufferCycles[2].counter).toBe(32)
    })
  })
  
  describe('hasCompleteAnalysisWindow', () => {
    it('should return false when cycles < analysis window', () => {
      for (let i = 0; i < 29; i++) {
        manager.addCycle(createMockCycle(i))
      }
      
      expect(manager.hasCompleteAnalysisWindow()).toBe(false)
    })
    
    it('should return true when cycles >= analysis window', () => {
      for (let i = 0; i < 30; i++) {
        manager.addCycle(createMockCycle(i))
      }
      
      expect(manager.hasCompleteAnalysisWindow()).toBe(true)
    })
  })
  
  describe('verifyCycleChainIntegrity', () => {
    it('should validate correct chain', () => {
      for (let i = 0; i < 10; i++) {
        const cycle = createMockCycle(i)
        if (i > 0) {
          cycle.previous = `hash-${i - 1}`
        }
        manager.addCycle(cycle)
      }
      
      const result = manager.verifyCycleChainIntegrity()
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })
    
    it('should detect gaps in sequence', () => {
      manager.addCycle(createMockCycle(1))
      manager.addCycle(createMockCycle(2))
      manager.addCycle(createMockCycle(5)) // Gap: missing 3, 4
      
      const result = manager.verifyCycleChainIntegrity()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Gap in cycle sequence: 2 -> 5')
    })
    
    it('should detect broken chain links', () => {
      const cycle1 = createMockCycle(1)
      cycle1.marker = 'hash-1'
      
      const cycle2 = createMockCycle(2)
      cycle2.previous = 'wrong-hash' // Should be 'hash-1'
      
      manager.addCycle(cycle1)
      manager.addCycle(cycle2)
      
      const result = manager.verifyCycleChainIntegrity()
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Broken chain link at cycle 2: previous marker mismatch')
    })
  })
  
  describe('initializeFromCycles', () => {
    it('should initialize from unsorted cycles', () => {
      const cycles = [
        createMockCycle(5),
        createMockCycle(2),
        createMockCycle(8),
        createMockCycle(3)
      ]
      
      manager.initializeFromCycles(cycles)
      
      const allCycles = manager.getAllCycles()
      expect(allCycles.map(c => c.counter)).toEqual([2, 3, 5, 8])
    })
    
    it('should respect max cycles limit when initializing', () => {
      const cycles = []
      for (let i = 0; i < 40; i++) {
        cycles.push(createMockCycle(i))
      }
      
      manager.initializeFromCycles(cycles)
      
      expect(manager.getCycleCount()).toBe(33)
      expect(manager.getOldestCycle()?.counter).toBe(7) // First 7 were pruned
    })
  })
  
  describe('getDiagnostics', () => {
    it('should provide comprehensive diagnostic info', () => {
      for (let i = 10; i < 43; i++) {
        manager.addCycle(createMockCycle(i))
      }
      
      const diagnostics = manager.getDiagnostics()
      expect(diagnostics).toEqual({
        maxCycles: 33,
        analysisWindowSize: 30,
        currentCycleCount: 33,
        oldestCycleCounter: 10,
        newestCycleCounter: 42,
        analysisWindowCount: 30,
        bufferCycleCount: 3,
        hasCompleteAnalysisWindow: true
      })
    })
  })
})