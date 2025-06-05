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

describe('CycleChain Validation', () => {
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
})