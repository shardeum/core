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

describe('CycleChain Core', () => {
  beforeEach(() => {
    // Clear mock function call history only, not implementations
    const Context = require('../../../../src/p2p/Context')

    // Clear call history for logger methods
    const mockLogger = Context.logger.getLogger()
    if (mockLogger) {
      Object.keys(mockLogger).forEach((key) => {
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
})
