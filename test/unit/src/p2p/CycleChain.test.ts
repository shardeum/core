import { P2P } from '@shardeum-foundation/lib-types'
import * as CycleChain from '../../../../src/p2p/CycleChain'
import { crypto } from '@src/p2p/Context'
import * as console from 'node:console'

/**
 * Mock out the imports that CycleChain.ts depends on.
 * Feel free to refine or remove mocks if you prefer real implementations.
 */
jest.mock('log4js', () => ({
  getLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  }),
}))

jest.mock('@shardeum-foundation/lib-crypto-utils', () => ({
  hash: jest.fn((data) => {
    return 'mockedHash-' + JSON.stringify(data)
  }),
}))

jest.mock('../../../../src/p2p/Context', () => {
  return {
    logger: {
      getLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
      }),
    },
    crypto: {
      hash: (data) => {
        return 'mockedHash-' + JSON.stringify(data)
      },
    },
    stateManager: {
      // Provide methods that CycleChain.ts uses
      getCurrentCycleShardData: jest.fn().mockReturnValue({
        timestamp: 10000,
        timestampEndCycle: 20000,
        cycleNumber: 10,
      }),
      syncSettleTime: 5000,
      statemanager_fatal: jest.fn((msg: string) => {
        throw new Error(`statemanager_fatal triggered: ${msg}`)
      }),
    },
    config: {
      p2p: {
        useNTPOffsets: false,
        useFakeTimeOffsets: false,
      },
    },
    setDefaultConfigs: () => {
      // No
    },
  }
})

jest.mock('../../../../src/p2p/NodeList', () => ({
  nodes: {
    get: jest.fn().mockReturnValue({
      externalIp: '192.168.1.2',
      externalPort: '9001',
    }),
  },
}))

// jest.mock('../../../../src/p2p/logger', () => ({
//   logFlags: {
//     verbose: false,
//   },
// }))

// jest.mock('../../../../src/p2p/network', () => ({
//   shardusGetTime: jest.fn().mockReturnValue(123456789),
// }))

jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
  },
}))

describe('CycleChain.ts Tests', () => {
  // Helper to create a dummy CycleRecord
  function createCycleRecord(counter: number, previous = 'prevHash'): P2P.CycleCreatorTypes.CycleRecord {
    return {
      counter,
      previous,
      standbyNodeListHash: 'standbyListHash',
      nodeListHash: 'nodeListHash',
      start: 1000,
      duration: 3600,
      active: 100,
      expired: 10,
      desired: 100,
      joinedConsensors: [],
      activated: [],
      removed: [],
      lost: [],
      refuted: [],
      apoptosized: [],
      refreshedConsensors: [],
      networkConfigHash: 'networkConfigHash',
      networkId: 'networkId',
      mode: 'processing',
      safetyMode: false,
      networkStateHash: 'networkStateHash',
      safetyNum: 100,
    } as any
  }

  beforeAll(() => {
    CycleChain.init()
  })

  beforeEach(() => {
    // Clear all internal data
    CycleChain.reset()
    jest.clearAllMocks()
  })

  describe('Initialization and Reset', () => {
    test('reset() should clear cycles, oldest, newest, and currentCycleMarker', () => {
      // Make sure it's empty right after reset
      expect(CycleChain.cycles).toEqual([])
      expect(CycleChain.oldest).toBeNull()
      expect(CycleChain.newest).toBeNull()
      expect(CycleChain.getCurrentCycleMarker()).toBeNull()
    })
  })

  describe('append() Functionality', () => {
    test('append() adds a new cycle to cycles, sets newest and oldest if first cycle', () => {
      const record = createCycleRecord(1)
      CycleChain.append(record)
      expect(CycleChain.cycles.length).toBe(1)
      expect(CycleChain.oldest).toBe(record)
      expect(CycleChain.newest).toBe(record)
      expect(CycleChain.getCurrentCycleMarker()).toContain(`mockedHash-`)
    })

    test('append() does not add a cycle if marker is already in cyclesByMarker', () => {
      const record1 = createCycleRecord(1)
      CycleChain.append(record1)
      // Try appending it again
      CycleChain.append(record1)
      // Should still be length 1
      expect(CycleChain.cycles.length).toBe(1)
    })

    test('append() updates only newest for subsequent cycles', () => {
      const record1 = createCycleRecord(1)
      const record2 = createCycleRecord(2)
      CycleChain.append(record1)
      CycleChain.append(record2)

      expect(CycleChain.cycles.length).toBe(2)
      expect(CycleChain.oldest).toBe(record1)
      expect(CycleChain.newest).toBe(record2)
    })
  })

  describe('prepend() Functionality', () => {
    test('prepend() adds a cycle to front of cycles if not already present', () => {
      const record1 = createCycleRecord(1)
      const record2 = createCycleRecord(2)
      const record3 = createCycleRecord(3)
      CycleChain.append(record1)
      CycleChain.prepend(record2)
      CycleChain.append(record3)

      // todo: prepend right now can update the newest even though in the cycle chain it will be at the beginning
      expect(CycleChain.cycles.length).toBe(3)
      expect(CycleChain.oldest).toBe(record2) // record2 is now at front
      expect(CycleChain.newest).toBe(record3)
    })

    test('prepend() does not add if cycle marker is already present', () => {
      const record1 = createCycleRecord(1)
      CycleChain.prepend(record1)
      // Prepending same record again should have no effect
      CycleChain.prepend(record1)
      expect(CycleChain.cycles.length).toBe(1)
    })

    test('prepend() can also set newest if it was null initially', () => {
      // By default, after a reset, oldest/newest is null
      const record = createCycleRecord(42)
      CycleChain.prepend(record)
      expect(CycleChain.oldest).toBe(record)
      expect(CycleChain.newest).toBe(record)
    })

    test('prepend() does not automatically override newest if new cycle is older', () => {
      // Start with record2 as newest
      const record2 = createCycleRecord(2)
      CycleChain.append(record2)
      const record1 = createCycleRecord(1)
      CycleChain.prepend(record1)
      expect(CycleChain.newest).toBe(record2)
      expect(CycleChain.oldest).toBe(record1)
    })
  })

  describe('validate() Functionality', () => {
    test('validate() returns false if next.previous != computeCycleMarker(prev)', () => {
      const prev = createCycleRecord(1)
      const next = createCycleRecord(2, 'someWrongHash')
      const result = CycleChain.validate(prev, next)
      expect(result).toBe(false)
    })

    test('validate() returns true if next.previous = computeCycleMarker(prev)', () => {
      const prev = createCycleRecord(1)
      const prevMarker = CycleChain.computeCycleMarker(prev)
      const next = createCycleRecord(2, prevMarker)
      const result = CycleChain.validate(prev, next)
      expect(result).toBe(true)
    })
  })

  describe('getCycleChain() Functionality', () => {
    beforeEach(() => {
      // Reset and add a handful of records
      const record1 = createCycleRecord(10)
      const record2 = createCycleRecord(11)
      const record3 = createCycleRecord(12)
      CycleChain.append(record1)
      CycleChain.append(record2)
      CycleChain.append(record3)
    })

    test('Returns an empty array if no cycles or if requested range is outside existing range', () => {
      CycleChain.reset()
      const chain = CycleChain.getCycleChain(1, 2)
      expect(chain).toEqual([])
    })

    test('Returns cycles in the requested [start, end] range, max length 100', () => {
      const chain1 = CycleChain.getCycleChain(10, 10)
      expect(chain1.length).toBe(1)
      expect(chain1[0].counter).toBe(10)

      const chain2 = CycleChain.getCycleChain(10, 12)
      expect(chain2.length).toBe(3)
      expect(chain2.map((c) => c.counter)).toEqual([10, 11, 12])
    })

    test('Cap the return to 100 cycles if request is bigger than 100 difference', () => {
      // Our chain is small, so it returns just the available 3.
      const largeRange = CycleChain.getCycleChain(10, 999999)
      expect(largeRange.length).toBeLessThanOrEqual(100)
      expect(largeRange.length).toBe(3) // actually only 3 available
    })
  })

  describe('computeCycleMarker()', () => {
    test('Uses crypto.hash() on the cycle record to compute a string marker', () => {
      const cycle = createCycleRecord(1)
      const marker = CycleChain.computeCycleMarker(cycle)
      // By default, our jest mock returns 'mockedHash-<stringifiedData>'
      expect(marker).toContain('mockedHash-')
    })
  })

  describe('prune() Functionality', () => {
    test('Removes oldest records beyond the "keep" threshold', () => {
      // Add 5 cycles
      for (let i = 0; i < 5; i++) {
        CycleChain.append(createCycleRecord(i))
      }
      expect(CycleChain.cycles.length).toBe(5)
      CycleChain.prune(2)
      expect(CycleChain.cycles.length).toBe(2)
      // Should have removed the 3 oldest cycles
      expect(CycleChain.oldest.counter).toBe(3)
      expect(CycleChain.newest.counter).toBe(4)
    })
    test('Does nothing if cycles.length <= keep', () => {
      for (let i = 0; i < 3; i++) {
        CycleChain.append(createCycleRecord(i))
      }
      CycleChain.prune(5)
      expect(CycleChain.cycles.length).toBe(3)
    })
  })

  describe('Timestamp-based lookups', () => {
    /**
     * Depending on your real logic, you may want more robust tests here.
     * We’ll show a basic example.  Because we’re mocking `stateManager.getCurrentCycleShardData()`,
     * you may want to refine the mock or spy on it to see calls.
     */

    test('getStoredCycleByTimestamp() finds a cycle if within [start, start+duration]', () => {
      // Make a cycle that starts at 1000, lasts 3600 seconds, so ends at 4600
      const cycleRec = createCycleRecord(5)
      cycleRec.start = 1000
      cycleRec.duration = 3600
      CycleChain.append(cycleRec)

      // 2000 is in between [1000, 4600]
      const found = CycleChain.getStoredCycleByTimestamp(2000 * 1000) // the function divides by 1000 internally
      expect(found).toBe(cycleRec)

      // 999 is out-of-range (less than start)
      const notFound = CycleChain.getStoredCycleByTimestamp(999 * 1000)
      expect(notFound).toBeNull()
    })

    test('getCycleNumberFromTimestamp() returns currentCycleShardData.cycleNumber if within current cycle range', () => {
      // Our mock says timestamp=10000, timestampEndCycle=20000 => cycleNumber=10
      const cycleNum = CycleChain.getCycleNumberFromTimestamp(15000)
      expect(cycleNum).toBe(10)
    })

    test('getCycleNumberFromTimestamp() returns future cycle if offsetTimestamp > currentCycleShardData.timestampEndCycle', () => {
      // With mock data, timestampEndCycle=20000 => if you pass e.g. 30000, that’s 10000 beyond
      // The cycle’s duration is 3600 by default in our createCycleRecord
      // but we rely on the appended cycles for actual durations in real logic.
      // For demonstration, we just check that it’s not returning 10.
      const cycleNum = CycleChain.getCycleNumberFromTimestamp(30000)
      expect(cycleNum).toBeGreaterThan(10)
    })
  })

  describe('Debug info & logging', () => {
    test('getDebug() returns a string summary of the chain', () => {
      CycleChain.append(createCycleRecord(1))
      CycleChain.append(createCycleRecord(2))
      const debugStr = CycleChain.getDebug()
      expect(debugStr).toContain('CHAIN:')
      expect(debugStr).toContain('prevHash') // from the record’s `previous`
    })

    test('getNewestCycleInfoLogStr() returns string with cycle number, time, and message', () => {
      const mockTime = 123456789
      jest.spyOn(Date, 'now').mockReturnValue(mockTime) // Mock Date.now to return a fixed value

      CycleChain.append(createCycleRecord(42))
      const str = CycleChain.getNewestCycleInfoLogStr('Some message')
      expect(str).toContain('Cycle: 42')
      expect(str).toContain(`Time:${mockTime}`)
      expect(str).toContain('Some message')

      jest.restoreAllMocks() // Restore original Date.now after the test
    })
  })
})
