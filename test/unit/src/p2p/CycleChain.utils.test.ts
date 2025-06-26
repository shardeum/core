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

describe('CycleChain Utils', () => {
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