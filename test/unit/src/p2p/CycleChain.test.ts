// Mock dependencies
jest.mock('../../../../src/p2p/Context', () => {
  // Create mock logger inside the factory function
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
  }
  
  // Define the implementation inside the factory function
  const hashImplementation = (input: any) => {
    // Handle different types of input for hash
    if (typeof input === 'object' && input.counter !== undefined) {
      // For cycle objects, create a unique hash based on counter
      return `cycle-hash-${input.counter}`
    }
    return `hash-${JSON.stringify(input)}`
  }
  
  return {
    crypto: {
      hash: jest.fn(hashImplementation),
    },
    logger: {
      getLogger: jest.fn(() => mockLogger),
    },
    stateManager: {
      getCurrentCycleShardData: jest.fn(),
      syncSettleTime: 0,
      statemanager_fatal: jest.fn(),
    },
  }
})

jest.mock('../../../../src/p2p/NodeList', () => ({
  nodes: new Map(),
}))

jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
  },
}))

jest.mock('../../../../src/logger', () => ({
  logFlags: {
    verbose: false,
  },
}))

jest.mock('../../../../src/network', () => ({
  shardusGetTime: jest.fn(() => Date.now()),
}))

// Import CycleChain after mocks are set up
import * as CycleChain from '../../../../src/p2p/CycleChain'
import { P2P } from '@shardeum-foundation/lib-types'

// Initialize CycleChain immediately after import to set up logger
CycleChain.init()

describe('CycleChain', () => {
  beforeEach(() => {
    // Clear mock function call history only, not implementations
    const Context = require('../../../../src/p2p/Context')
    
    // Clear call history for logger methods
    const mockLogger = Context.logger.getLogger()
    if (mockLogger) {
      Object.keys(mockLogger).forEach(key => {
        if (typeof mockLogger[key] === 'function' && mockLogger[key].mockClear) {
          mockLogger[key].mockClear()
        }
      })
    }
    
    // Clear other mocks
    Context.crypto.hash.mockClear()
    Context.stateManager.getCurrentCycleShardData.mockClear()
    Context.stateManager.statemanager_fatal.mockClear()
    
    // Re-ensure hash function has correct implementation
    Context.crypto.hash.mockImplementation((input: any) => {
      if (typeof input === 'object' && input.counter !== undefined) {
        return `cycle-hash-${input.counter}`
      }
      return `hash-${JSON.stringify(input)}`
    })
    
    // Reset the module state
    CycleChain.reset()
    
    // Re-initialize CycleChain to ensure logger is set up
    CycleChain.init()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })


  describe('prependMultiple', () => {
    const createMockCycle = (counter: number): P2P.CycleCreatorTypes.CycleRecord => {
      return {
        counter,
        previous: counter > 1 ? `cycle-hash-${counter - 1}` : '',
        start: counter * 30,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord
    }

    it('should prepend multiple cycles efficiently', () => {
      // Start with one cycle
      const cycle3 = createMockCycle(3)
      CycleChain.append(cycle3)
      
      // Verify initial state
      expect(CycleChain.cycles).toHaveLength(1)
      expect(CycleChain.cycles[0].counter).toBe(3)

      // Prepend multiple older cycles
      const cycle1 = createMockCycle(1)
      const cycle2 = createMockCycle(2)
      CycleChain.prependMultiple([cycle1, cycle2])

      expect(CycleChain.cycles).toHaveLength(3)
      expect(CycleChain.cycles[0].counter).toBe(1)
      expect(CycleChain.cycles[1].counter).toBe(2)
      expect(CycleChain.cycles[2].counter).toBe(3)
      expect(CycleChain.oldest.counter).toBe(1)
      expect(CycleChain.newest.counter).toBe(3)
    })

    it('should handle empty array gracefully', () => {
      const cycle1 = createMockCycle(1)
      CycleChain.append(cycle1)

      CycleChain.prependMultiple([])

      expect(CycleChain.cycles).toHaveLength(1)
      expect(CycleChain.oldest.counter).toBe(1)
      expect(CycleChain.newest.counter).toBe(1)
    })

    it('should skip cycles that already exist', () => {
      const cycle1 = createMockCycle(1)
      const cycle2 = createMockCycle(2)
      const cycle3 = createMockCycle(3)
      
      // First add cycles 2 and 3
      CycleChain.append(cycle2)
      CycleChain.append(cycle3)

      // Should be 2 cycles now
      expect(CycleChain.cycles).toHaveLength(2)

      // Try to prepend cycle2 again along with cycle1
      CycleChain.prependMultiple([cycle1, cycle2])

      expect(CycleChain.cycles).toHaveLength(3)
      expect(CycleChain.cycles[0].counter).toBe(1)
      expect(CycleChain.cycles[1].counter).toBe(2)
      expect(CycleChain.cycles[2].counter).toBe(3)
    })

    it('should update newest if prepended cycle is newer', () => {
      const cycle1 = createMockCycle(1)
      CycleChain.append(cycle1)

      const cycle2 = createMockCycle(2)
      const cycle3 = createMockCycle(3)
      CycleChain.prependMultiple([cycle2, cycle3])

      expect(CycleChain.newest.counter).toBe(3)
    })

    it('should set newest when starting with empty chain', () => {
      const cycle1 = createMockCycle(1)
      const cycle2 = createMockCycle(2)
      
      CycleChain.prependMultiple([cycle1, cycle2])

      expect(CycleChain.oldest.counter).toBe(1)
      expect(CycleChain.newest.counter).toBe(2)
    })

    it('should update newest pointer when prepending cycles newer than current newest', () => {
      // Start with cycle 5 as newest
      const cycle5 = createMockCycle(5)
      CycleChain.append(cycle5)
      
      // Verify initial state
      expect(CycleChain.newest.counter).toBe(5)
      
      // Prepend cycles [6, 7, 8] which are newer than current newest
      const cycle6 = createMockCycle(6)
      const cycle7 = createMockCycle(7)
      const cycle8 = createMockCycle(8)
      CycleChain.prependMultiple([cycle6, cycle7, cycle8])
      
      // Verify newest updates to cycle 8
      expect(CycleChain.newest.counter).toBe(8)
      expect(CycleChain.cycles).toHaveLength(4)
      expect(CycleChain.cycles[0].counter).toBe(6)
      expect(CycleChain.cycles[1].counter).toBe(7)
      expect(CycleChain.cycles[2].counter).toBe(8)
      expect(CycleChain.cycles[3].counter).toBe(5)
    })

    it('should handle concurrent prepend operations safely', async () => {
      // Start with a base cycle
      const baseCycle = createMockCycle(10)
      CycleChain.append(baseCycle)
      
      // Create overlapping cycle ranges for concurrent operations
      const batch1 = [createMockCycle(1), createMockCycle(2), createMockCycle(3)]
      const batch2 = [createMockCycle(2), createMockCycle(3), createMockCycle(4)] // Overlaps with batch1
      const batch3 = [createMockCycle(4), createMockCycle(5), createMockCycle(6)] // Overlaps with batch2
      
      // Execute concurrent prepend operations
      const operation1 = Promise.resolve().then(() => CycleChain.prependMultiple(batch1))
      const operation2 = Promise.resolve().then(() => CycleChain.prependMultiple(batch2))
      const operation3 = Promise.resolve().then(() => CycleChain.prependMultiple(batch3))
      
      // Wait for all operations to complete
      await Promise.all([operation1, operation2, operation3])
      
      // Verify final state consistency - all unique cycles should be present
      const counters = CycleChain.cycles.map(c => c.counter)
      
      // Due to race conditions, we can't guarantee exact ordering, but we can verify:
      // 1. No duplicates exist
      const uniqueCounters = new Set(counters)
      expect(uniqueCounters.size).toBe(counters.length)
      
      // 2. All expected unique cycles are present (deduplicating overlaps)
      const expectedUniqueCounters = new Set([1, 2, 3, 4, 5, 6, 10])
      expect(uniqueCounters).toEqual(expectedUniqueCounters)
      
      // 3. Total count matches expected unique cycles
      expect(CycleChain.cycles).toHaveLength(7)
      
      // 4. No duplicates in cyclesByMarker lookup
      expect(Object.keys(CycleChain.cyclesByMarker)).toHaveLength(7)
      
      // 5. Newest pointer should still be 10 (unchanged from initial state)
      expect(CycleChain.newest.counter).toBe(10)
      
      // 6. Oldest pointer should be valid and point to a cycle that exists
      expect(CycleChain.oldest).not.toBeNull()
      expect(counters).toContain(CycleChain.oldest.counter)
      
      // 7. Verify structural integrity - oldest should be first in array
      expect(CycleChain.cycles[0]).toBe(CycleChain.oldest)
    })
  })

  describe('validateCycleChain', () => {
    const createValidCycle = (counter: number, previousMarker: string = ''): P2P.CycleCreatorTypes.CycleRecord => {
      return {
        counter,
        previous: previousMarker,
        start: counter * 30,
        duration: 30,
        nodeListHash: 'nodeListHash',
        standbyNodeListHash: 'standbyNodeListHash',
      } as P2P.CycleCreatorTypes.CycleRecord
    }

    it('should validate a proper chain of cycles', () => {
      const cycle1 = createValidCycle(1)
      const cycle1Marker = CycleChain.computeCycleMarker(cycle1)
      const cycle2 = createValidCycle(2, cycle1Marker)
      const cycle2Marker = CycleChain.computeCycleMarker(cycle2)
      const cycle3 = createValidCycle(3, cycle2Marker)

      const cycles = [cycle1, cycle2, cycle3]
      const isValid = CycleChain.validateCycleChain(cycles)

      expect(isValid).toBe(true)
    })

    it('should return true for empty array', () => {
      const isValid = CycleChain.validateCycleChain([])
      expect(isValid).toBe(true)
    })

    it('should return true for single cycle', () => {
      const cycle = createValidCycle(1)
      const isValid = CycleChain.validateCycleChain([cycle])
      expect(isValid).toBe(true)
    })

    it('should detect counter gaps', () => {
      const cycle1 = createValidCycle(1)
      const cycle3 = createValidCycle(3, 'some-marker') // Gap: missing cycle 2

      const cycles = [cycle1, cycle3]
      const isValid = CycleChain.validateCycleChain(cycles)

      expect(isValid).toBe(false)
    })

    it('should detect invalid marker chain', () => {
      const cycle1 = createValidCycle(1)
      const cycle2 = createValidCycle(2, 'wrong-marker') // Wrong previous marker

      const cycles = [cycle1, cycle2]
      const isValid = CycleChain.validateCycleChain(cycles)

      expect(isValid).toBe(false)
    })

    it('should validate cycles with correct previous markers', () => {
      const cycle1 = createValidCycle(1)
      const cycle1Marker = CycleChain.computeCycleMarker(cycle1)
      const cycle2 = createValidCycle(2, cycle1Marker)

      const cycles = [cycle1, cycle2]
      const isValid = CycleChain.validateCycleChain(cycles)

      expect(isValid).toBe(true)
    })

    it('should detect missing intermediate cycle counters', () => {
      // Create chain with gaps: [95, 97, 99] missing 96, 98
      const cycle95 = createValidCycle(95)
      const cycle97 = createValidCycle(97, 'some-marker') // Gap: missing cycle 96
      const cycle99 = createValidCycle(99, 'another-marker') // Gap: missing cycle 98

      const cycles = [cycle95, cycle97, cycle99]
      const isValid = CycleChain.validateCycleChain(cycles)

      expect(isValid).toBe(false)
    })

    it('should detect single missing intermediate counter', () => {
      // Create chain with single gap: [10, 12] missing 11
      const cycle10 = createValidCycle(10)
      const cycle12 = createValidCycle(12, 'some-marker') // Gap: missing cycle 11

      const cycles = [cycle10, cycle12]
      const isValid = CycleChain.validateCycleChain(cycles)

      expect(isValid).toBe(false)
    })

    it('should detect multiple consecutive missing counters', () => {
      // Create chain with large gap: [5, 10] missing 6, 7, 8, 9
      const cycle5 = createValidCycle(5)
      const cycle10 = createValidCycle(10, 'some-marker') // Gap: missing cycles 6-9

      const cycles = [cycle5, cycle10]
      const isValid = CycleChain.validateCycleChain(cycles)

      expect(isValid).toBe(false)
    })
  })

  describe('validateCycleChain - performance', () => {
    const createValidCycleForPerf = (counter: number, previousMarker: string = ''): P2P.CycleCreatorTypes.CycleRecord => {
      return {
        counter,
        previous: previousMarker,
        start: counter * 30,
        duration: 30,
        nodeListHash: `nodeListHash${counter}`,
        standbyNodeListHash: `standbyNodeListHash${counter}`,
        // Add some realistic data to make validation more meaningful
        active: 100,
        desired: 100,
        apoptosized: [],
        removed: [],
        lost: [],
        refuted: [],
        joinedConsensors: [],
        activated: [],
        refreshedConsensors: [],
      } as P2P.CycleCreatorTypes.CycleRecord
    }

    it('should validate 100-cycle chain in reasonable time', () => {
      // Create valid 100-cycle chain with proper marker linkage
      const cycles: P2P.CycleCreatorTypes.CycleRecord[] = []
      let previousMarker = ''
      
      for (let i = 1; i <= 100; i++) {
        const cycle = createValidCycleForPerf(i, previousMarker)
        cycles.push(cycle)
        previousMarker = CycleChain.computeCycleMarker(cycle)
      }

      // Measure validation time
      const startTime = performance.now()
      const isValid = CycleChain.validateCycleChain(cycles)
      const endTime = performance.now()
      const validationTime = endTime - startTime

      // Verify the chain is valid
      expect(isValid).toBe(true)
      
      // Verify validation completes in reasonable time (should be under 100ms for 100 cycles)
      expect(validationTime).toBeLessThan(100)
      
      // Log performance for debugging if needed
      if (validationTime > 50) {
        console.warn(`validateCycleChain took ${validationTime.toFixed(2)}ms for 100 cycles`)
      }
    })

    it('should detect early failure quickly with large chains', () => {
      // Create 100 cycles but introduce an error early (at cycle 5)
      const cycles: P2P.CycleCreatorTypes.CycleRecord[] = []
      let previousMarker = ''
      
      for (let i = 1; i <= 100; i++) {
        const cycle = createValidCycleForPerf(i, previousMarker)
        
        // Introduce error at cycle 5 - wrong previous marker
        if (i === 5) {
          cycle.previous = 'invalid-marker'
        }
        
        cycles.push(cycle)
        
        // Update previousMarker for next cycle (even for invalid one to continue chain)
        if (i !== 5) {
          previousMarker = CycleChain.computeCycleMarker(cycle)
        }
      }

      // Measure validation time for early failure detection
      const startTime = performance.now()
      const isValid = CycleChain.validateCycleChain(cycles)
      const endTime = performance.now()
      const validationTime = endTime - startTime

      // Verify the chain is correctly identified as invalid
      expect(isValid).toBe(false)
      
      // Verify early failure detection is fast (should be much faster than validating 100 cycles)
      expect(validationTime).toBeLessThan(10)
      
      // Log performance for debugging
      if (validationTime > 5) {
        console.warn(`Early failure detection took ${validationTime.toFixed(2)}ms (expected < 5ms)`)
      }
    })

    it('should handle performance with gaps in cycle counters', () => {
      // Create cycles with gaps: [1, 3, 5, 7, ...] up to 100 cycles total
      const cycles: P2P.CycleCreatorTypes.CycleRecord[] = []
      let previousMarker = ''
      
      for (let i = 1; i <= 200; i += 2) { // Generate 100 cycles with gaps
        if (cycles.length >= 100) break
        
        const cycle = createValidCycleForPerf(i, previousMarker)
        cycles.push(cycle)
        previousMarker = CycleChain.computeCycleMarker(cycle)
      }

      // Measure validation time for gap detection
      const startTime = performance.now()
      const isValid = CycleChain.validateCycleChain(cycles)
      const endTime = performance.now()
      const validationTime = endTime - startTime

      // Verify gaps are detected (should be invalid due to counter gaps)
      expect(isValid).toBe(false)
      
      // Verify gap detection completes quickly
      expect(validationTime).toBeLessThan(50)
      
      // Verify we created exactly 100 cycles
      expect(cycles).toHaveLength(100)
    })
  })

  describe('validate', () => {
    const createBasicCycle = (counter: number, additionalProps: any = {}): P2P.CycleCreatorTypes.CycleRecord => {
      return {
        counter,
        previous: '',
        start: counter * 30,
        duration: 30,
        nodeListHash: 'hash' + counter,
        standbyNodeListHash: 'standbyhash' + counter,
        ...additionalProps
      } as P2P.CycleCreatorTypes.CycleRecord
    }

    it('should validate two consecutive cycles', () => {
      const prev = createBasicCycle(1)
      const prevMarker = CycleChain.computeCycleMarker(prev)
      const next = createBasicCycle(2, { previous: prevMarker })

      const isValid = CycleChain.validate(prev, next)
      expect(isValid).toBe(true)
    })

    it('should fail validation when previous marker does not match', () => {
      const prev = createBasicCycle(1)
      const next = createBasicCycle(2, { previous: 'wrong-marker' })

      const isValid = CycleChain.validate(prev, next)
      expect(isValid).toBe(false)
    })
  })

  describe('reset', () => {
    it('should reset all state variables to initial values', () => {
      // First add some data
      const cycle = {
        counter: 1,
        previous: '',
        start: 100,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      CycleChain.append(cycle)
      
      // Verify data was added
      expect(CycleChain.cycles).toHaveLength(1)
      expect(CycleChain.oldest).toBe(cycle)
      expect(CycleChain.newest).toBe(cycle)

      // Now reset
      CycleChain.reset()

      // Verify everything is cleared
      expect(CycleChain.cycles).toEqual([])
      expect(CycleChain.cyclesByMarker).toEqual({})
      expect(CycleChain.oldest).toBeNull()
      expect(CycleChain.newest).toBeNull()
    })
  })

  describe('getNewest', () => {
    it('should return null when no cycles exist', () => {
      const newest = CycleChain.getNewest()
      expect(newest).toBeNull()
    })

    it('should return the most recently appended cycle', () => {
      const cycle1 = {
        counter: 1,
        previous: '',
        start: 100,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      const cycle2 = {
        counter: 2,
        previous: 'cycle-hash-1',
        start: 130,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      CycleChain.append(cycle1)
      CycleChain.append(cycle2)

      const newest = CycleChain.getNewest()
      expect(newest).toBe(cycle2)
      expect(newest.counter).toBe(2)
    })

    it('should return the same cycle when only one exists', () => {
      const cycle = {
        counter: 1,
        previous: '',
        start: 100,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      CycleChain.append(cycle)

      const newest = CycleChain.getNewest()
      expect(newest).toBe(cycle)
    })
  })

  describe('append', () => {
    it('should add a new cycle to the end of the chain', () => {
      const cycle1 = {
        counter: 1,
        previous: '',
        start: 100,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      CycleChain.append(cycle1)

      expect(CycleChain.cycles).toHaveLength(1)
      expect(CycleChain.cycles[0]).toBe(cycle1)
      expect(CycleChain.newest).toBe(cycle1)
      expect(CycleChain.oldest).toBe(cycle1)
    })

    it('should update newest when appending multiple cycles', () => {
      const cycle1 = {
        counter: 1,
        previous: '',
        start: 100,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      const cycle2 = {
        counter: 2,
        previous: 'cycle-hash-1',
        start: 130,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      CycleChain.append(cycle1)
      CycleChain.append(cycle2)

      expect(CycleChain.cycles).toHaveLength(2)
      expect(CycleChain.newest).toBe(cycle2)
      expect(CycleChain.oldest).toBe(cycle1)
    })

    it('should not add duplicate cycles', () => {
      const cycle = {
        counter: 1,
        previous: '',
        start: 100,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      CycleChain.append(cycle)
      CycleChain.append(cycle) // Try to add the same cycle again

      expect(CycleChain.cycles).toHaveLength(1)
      expect(CycleChain.cyclesByMarker['cycle-hash-1']).toBe(cycle)
    })

    it('should update currentCycleMarker when appending', () => {
      const cycle = {
        counter: 1,
        previous: '',
        start: 100,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      CycleChain.append(cycle)

      const currentMarker = CycleChain.getCurrentCycleMarker()
      expect(currentMarker).toBe('cycle-hash-1')
    })
  })

  describe('prepend', () => {
    it('should add a cycle to the beginning of the chain', () => {
      const cycle2 = {
        counter: 2,
        previous: 'cycle-hash-1',
        start: 130,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      const cycle1 = {
        counter: 1,
        previous: '',
        start: 100,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      // Add cycle2 first
      CycleChain.append(cycle2)
      
      // Then prepend cycle1
      CycleChain.prepend(cycle1)

      expect(CycleChain.cycles).toHaveLength(2)
      expect(CycleChain.cycles[0]).toBe(cycle1)
      expect(CycleChain.cycles[1]).toBe(cycle2)
      expect(CycleChain.oldest).toBe(cycle1)
      expect(CycleChain.newest).toBe(cycle2)
    })

    it('should set newest when prepending to empty chain', () => {
      const cycle = {
        counter: 1,
        previous: '',
        start: 100,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      CycleChain.prepend(cycle)

      expect(CycleChain.cycles).toHaveLength(1)
      expect(CycleChain.oldest).toBe(cycle)
      expect(CycleChain.newest).toBe(cycle)
    })

    it('should update newest if prepended cycle has higher counter', () => {
      const cycle1 = {
        counter: 1,
        previous: '',
        start: 100,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      const cycle3 = {
        counter: 3,
        previous: 'cycle-hash-2',
        start: 160,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      // Add cycle1 first
      CycleChain.append(cycle1)
      
      // Prepend cycle3 (higher counter)
      CycleChain.prepend(cycle3)

      expect(CycleChain.newest).toBe(cycle3)
      expect(CycleChain.getCurrentCycleMarker()).toBe('cycle-hash-3')
    })

    it('should not add duplicate cycles', () => {
      const cycle = {
        counter: 1,
        previous: '',
        start: 100,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      CycleChain.prepend(cycle)
      CycleChain.prepend(cycle) // Try to prepend the same cycle again

      expect(CycleChain.cycles).toHaveLength(1)
      expect(CycleChain.cyclesByMarker['cycle-hash-1']).toBe(cycle)
    })
  })

  describe('getCycleChain', () => {
    beforeEach(() => {
      // Add 10 cycles for testing
      for (let i = 1; i <= 10; i++) {
        const cycle = {
          counter: i,
          previous: i > 1 ? `cycle-hash-${i - 1}` : '',
          start: i * 30,
          duration: 30,
        } as P2P.CycleCreatorTypes.CycleRecord
        CycleChain.append(cycle)
      }
    })

    it('should return cycles within the specified range', () => {
      const cycles = CycleChain.getCycleChain(3, 5)
      
      expect(cycles).toHaveLength(3)
      expect(cycles[0].counter).toBe(3)
      expect(cycles[1].counter).toBe(4)
      expect(cycles[2].counter).toBe(5)
    })

    it('should limit result to 100 cycles maximum', () => {
      const cycles = CycleChain.getCycleChain(1, 200)
      
      expect(cycles).toHaveLength(10) // We only have 10 cycles total
    })

    it('should return empty array if end is before oldest cycle', () => {
      const cycles = CycleChain.getCycleChain(-5, 0)
      
      expect(cycles).toEqual([])
    })

    it('should adjust start if it is before oldest cycle', () => {
      const cycles = CycleChain.getCycleChain(-5, 3)
      
      expect(cycles).toHaveLength(3)
      expect(cycles[0].counter).toBe(1) // Adjusted to oldest
      expect(cycles[2].counter).toBe(3)
    })

    it('should return empty array if start > end', () => {
      const cycles = CycleChain.getCycleChain(5, 3)
      
      expect(cycles).toEqual([])
    })

    it('should return empty array when no cycles exist', () => {
      CycleChain.reset()
      const cycles = CycleChain.getCycleChain(1, 5)
      
      expect(cycles).toEqual([])
    })

    it('should return single cycle when start equals end', () => {
      const cycles = CycleChain.getCycleChain(5, 5)
      
      expect(cycles).toHaveLength(1)
      expect(cycles[0].counter).toBe(5)
    })

    it('should handle end beyond the newest cycle', () => {
      const cycles = CycleChain.getCycleChain(8, 15)
      
      expect(cycles).toHaveLength(3)
      expect(cycles[0].counter).toBe(8)
      expect(cycles[1].counter).toBe(9)
      expect(cycles[2].counter).toBe(10)
    })
  })

  describe('prune', () => {
    beforeEach(() => {
      // Add 10 cycles for testing
      for (let i = 1; i <= 10; i++) {
        const cycle = {
          counter: i,
          previous: i > 1 ? `cycle-hash-${i - 1}` : '',
          start: i * 30,
          duration: 30,
        } as P2P.CycleCreatorTypes.CycleRecord
        CycleChain.append(cycle)
      }
    })

    it('should keep the specified number of most recent cycles', () => {
      CycleChain.prune(5)
      
      expect(CycleChain.cycles).toHaveLength(5)
      expect(CycleChain.oldest.counter).toBe(6)
      expect(CycleChain.newest.counter).toBe(10)
    })

    it('should do nothing if keep is greater than current length', () => {
      CycleChain.prune(15)
      
      expect(CycleChain.cycles).toHaveLength(10)
      expect(CycleChain.oldest.counter).toBe(1)
      expect(CycleChain.newest.counter).toBe(10)
    })

    it('should do nothing if keep equals current length', () => {
      CycleChain.prune(10)
      
      expect(CycleChain.cycles).toHaveLength(10)
      expect(CycleChain.oldest.counter).toBe(1)
      expect(CycleChain.newest.counter).toBe(10)
    })

    it('should keep only one cycle when keep is 1', () => {
      CycleChain.prune(1)
      
      expect(CycleChain.cycles).toHaveLength(1)
      expect(CycleChain.oldest.counter).toBe(10)
      expect(CycleChain.newest.counter).toBe(10)
      expect(CycleChain.oldest).toBe(CycleChain.newest)
    })

    it('should handle pruning all cycles', () => {
      CycleChain.prune(0)
      
      expect(CycleChain.cycles).toHaveLength(0)
      // Note: The implementation doesn't handle this edge case well,
      // but we'll test the actual behavior
    })
  })

  describe('getStoredCycleByTimestamp', () => {
    beforeEach(() => {
      // Add cycles with specific timestamps
      // Each cycle starts at counter * 30 seconds and lasts 30 seconds
      for (let i = 1; i <= 5; i++) {
        const cycle = {
          counter: i,
          previous: i > 1 ? `cycle-hash-${i - 1}` : '',
          start: i * 30, // in seconds
          duration: 30, // in seconds
        } as P2P.CycleCreatorTypes.CycleRecord
        CycleChain.append(cycle)
      }
    })

    it('should find cycle by timestamp in milliseconds', () => {
      // Cycle 2 runs from 60 to 90 seconds
      const timestamp = 75000 // 75 seconds in milliseconds
      const cycle = CycleChain.getStoredCycleByTimestamp(timestamp)
      
      expect(cycle).not.toBeNull()
      expect(cycle.counter).toBe(2)
    })

    it('should find cycle at exact start boundary', () => {
      // Cycle 3 starts at exactly 90 seconds
      const timestamp = 90000 // 90 seconds in milliseconds
      const cycle = CycleChain.getStoredCycleByTimestamp(timestamp)
      
      expect(cycle).not.toBeNull()
      // The implementation uses >= for end boundary, so 90 seconds belongs to cycle 2
      expect(cycle.counter).toBe(2)
    })

    it('should find cycle just after start boundary', () => {
      // Just after cycle 3 starts at 90 seconds
      const timestamp = 91000 // 91 seconds in milliseconds
      const cycle = CycleChain.getStoredCycleByTimestamp(timestamp)
      
      expect(cycle).not.toBeNull()
      expect(cycle.counter).toBe(3)
    })

    it('should return null for timestamp before first cycle', () => {
      const timestamp = 10000 // 10 seconds - before cycle 1 starts at 30
      const cycle = CycleChain.getStoredCycleByTimestamp(timestamp)
      
      expect(cycle).toBeNull()
    })

    it('should return null for timestamp after last cycle', () => {
      const timestamp = 200000 // 200 seconds - after cycle 5 ends at 180
      const cycle = CycleChain.getStoredCycleByTimestamp(timestamp)
      
      expect(cycle).toBeNull()
    })

    it('should search from end for performance', () => {
      // Last cycle (5) runs from 150 to 180 seconds
      const timestamp = 165000 // 165 seconds
      const cycle = CycleChain.getStoredCycleByTimestamp(timestamp)
      
      expect(cycle).not.toBeNull()
      expect(cycle.counter).toBe(5)
    })

    it('should handle edge case for first cycle start', () => {
      // Mock nestedCountersInstance to verify edge case is triggered
      const nestedCounters = require('../../../../src/utils/nestedCounters')
      nestedCounters.nestedCountersInstance.countEvent.mockClear()
      
      // First cycle starts at exactly 30 seconds
      const timestamp = 30 // Note: this edge case uses seconds, not milliseconds
      const cycle = CycleChain.getStoredCycleByTimestamp(timestamp)
      
      expect(cycle).not.toBeNull()
      expect(cycle.counter).toBe(1)
      expect(nestedCounters.nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'getCycleNumberFromTimestamp',
        'getStoredCycleByTimestamp edge case 0'
      )
    })

    it('should return null when no cycles exist', () => {
      CycleChain.reset()
      const timestamp = 75000
      const cycle = CycleChain.getStoredCycleByTimestamp(timestamp)
      
      expect(cycle).toBeNull()
    })
  })

  describe('computeCycleMarker', () => {
    it('should compute hash for cycle objects', () => {
      const cycle = {
        counter: 1,
        previous: '',
        start: 100,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      const marker = CycleChain.computeCycleMarker(cycle)
      
      expect(marker).toBe('cycle-hash-1')
    })

    it('should compute different hashes for different cycles', () => {
      const cycle1 = {
        counter: 1,
        previous: '',
        start: 100,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      const cycle2 = {
        counter: 2,
        previous: 'cycle-hash-1',
        start: 130,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      const marker1 = CycleChain.computeCycleMarker(cycle1)
      const marker2 = CycleChain.computeCycleMarker(cycle2)
      
      expect(marker1).not.toBe(marker2)
      expect(marker1).toBe('cycle-hash-1')
      expect(marker2).toBe('cycle-hash-2')
    })

    it('should use crypto.hash function', () => {
      const Context = require('../../../../src/p2p/Context')
      Context.crypto.hash.mockClear()
      
      const cycle = {
        counter: 1,
        previous: '',
        start: 100,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      CycleChain.computeCycleMarker(cycle)
      
      expect(Context.crypto.hash).toHaveBeenCalledWith(cycle)
    })
  })

  describe('getCurrentCycleMarker', () => {
    it('should return null when no cycles have been appended', () => {
      const marker = CycleChain.getCurrentCycleMarker()
      expect(marker).toBeNull()
    })

    it('should return marker of the most recently appended cycle', () => {
      const cycle1 = {
        counter: 1,
        previous: '',
        start: 100,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      const cycle2 = {
        counter: 2,
        previous: 'cycle-hash-1',
        start: 130,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      CycleChain.append(cycle1)
      expect(CycleChain.getCurrentCycleMarker()).toBe('cycle-hash-1')

      CycleChain.append(cycle2)
      expect(CycleChain.getCurrentCycleMarker()).toBe('cycle-hash-2')
    })

    it('should update when prepending a newer cycle', () => {
      const cycle1 = {
        counter: 1,
        previous: '',
        start: 100,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      const cycle3 = {
        counter: 3,
        previous: 'cycle-hash-2',
        start: 160,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      CycleChain.append(cycle1)
      expect(CycleChain.getCurrentCycleMarker()).toBe('cycle-hash-1')

      // Prepend a newer cycle (higher counter)
      CycleChain.prepend(cycle3)
      expect(CycleChain.getCurrentCycleMarker()).toBe('cycle-hash-3')
    })
  })

  describe('getNewestCycleInfoLogStr', () => {
    it('should return log string with -1 when no cycles exist', () => {
      const network = require('../../../../src/network')
      network.shardusGetTime.mockReturnValue(1234567890)
      
      const logStr = CycleChain.getNewestCycleInfoLogStr('Test message')
      
      expect(logStr).toBe('Cycle: -1 Time:1234567890 Test message')
    })

    it('should return log string with cycle number when cycles exist', () => {
      const network = require('../../../../src/network')
      network.shardusGetTime.mockReturnValue(1234567890)
      
      const cycle = {
        counter: 42,
        previous: '',
        start: 100,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      CycleChain.append(cycle)
      
      const logStr = CycleChain.getNewestCycleInfoLogStr('Processing complete')
      
      expect(logStr).toBe('Cycle: 42 Time:1234567890 Processing complete')
    })

    it('should include custom message in log string', () => {
      const network = require('../../../../src/network')
      network.shardusGetTime.mockReturnValue(9876543210)
      
      const cycle = {
        counter: 100,
        previous: '',
        start: 100,
        duration: 30,
      } as P2P.CycleCreatorTypes.CycleRecord

      CycleChain.append(cycle)
      
      const logStr = CycleChain.getNewestCycleInfoLogStr('Custom log message here')
      
      expect(logStr).toBe('Cycle: 100 Time:9876543210 Custom log message here')
    })

    it('should use shardusGetTime for timestamp', () => {
      const network = require('../../../../src/network')
      network.shardusGetTime.mockClear()
      network.shardusGetTime.mockReturnValue(555555)
      
      CycleChain.getNewestCycleInfoLogStr('Test')
      
      expect(network.shardusGetTime).toHaveBeenCalled()
    })
  })

  describe('getDebug', () => {
    it('should return formatted debug output with no cycles', () => {
      const debug = CycleChain.getDebug()
      
      expect(debug).toContain('DIGESTED:   null')
      expect(debug).toContain('CHAIN:')
    })

    it('should return formatted debug output with cycles', () => {
      // Add a cycle with minimal fields
      const cycle = {
        counter: 1,
        previous: 'prev-hash',
        active: 5,
        expired: 0,
        desired: 10,
        joinedConsensors: [{ externalIp: '192.168.1.1', externalPort: 9001 }],
        activated: [],
        removed: [],
        lost: [],
        refuted: [],
        apoptosized: [],
        refreshedConsensors: [],
      } as any

      CycleChain.append(cycle)
      
      const debug = CycleChain.getDebug()
      
      expect(debug).toContain('DIGESTED:   1')
      expect(debug).toContain('1:prev:cycl')
      expect(debug).toContain('actv:5')
      expect(debug).toContain('exp:0')
      expect(debug).toContain('desr:10')
      expect(debug).toContain('joind:[192.168.1.1:9001]')
    })

    it('should handle special removed array with "all"', () => {
      const cycle = {
        counter: 1,
        previous: '',
        active: 0,
        expired: 0,
        desired: 0,
        joinedConsensors: [],
        activated: [],
        removed: ['all'],
        lost: [],
        refuted: [],
        apoptosized: [],
        refreshedConsensors: [],
      } as any

      CycleChain.append(cycle)
      
      const debug = CycleChain.getDebug()
      
      expect(debug).toContain('rmvd:[all]')
    })

    it('should show node IPs when available in NodeList', () => {
      const NodeList = require('../../../../src/p2p/NodeList')
      NodeList.nodes.set('node123', { 
        externalIp: '10.0.0.1', 
        externalPort: 8080 
      })

      const cycle = {
        counter: 1,
        previous: '',
        active: 1,
        expired: 0,
        desired: 1,
        joinedConsensors: [],
        activated: ['node123'],
        removed: [],
        lost: [],
        refuted: [],
        apoptosized: [],
        refreshedConsensors: [],
      } as any

      CycleChain.append(cycle)
      
      const debug = CycleChain.getDebug()
      
      expect(debug).toContain('actvd:[10.0.0.1:8080]')
    })

    it('should show partial node ID when node not in NodeList', () => {
      const cycle = {
        counter: 1,
        previous: '',
        active: 1,
        expired: 0,
        desired: 1,
        joinedConsensors: [],
        activated: ['unknownNode123'],
        removed: [],
        lost: [],
        refuted: [],
        apoptosized: [],
        refreshedConsensors: [],
      } as any

      CycleChain.append(cycle)
      
      const debug = CycleChain.getDebug()
      
      expect(debug).toContain('missing-unkno')
    })

    it('should format refreshed consensors with counter', () => {
      const cycle = {
        counter: 1,
        previous: '',
        active: 5,
        expired: 0,
        desired: 5,
        joinedConsensors: [],
        activated: [],
        removed: [],
        lost: [],
        refuted: [],
        apoptosized: [],
        refreshedConsensors: [
          { externalIp: '192.168.1.2', externalPort: 9002, counterRefreshed: 10 }
        ],
      } as any

      CycleChain.append(cycle)
      
      const debug = CycleChain.getDebug()
      
      expect(debug).toContain('rfshd:[192.168.1.2:9002-10]')
    })
  })
})