// Break circular dependency chain BEFORE any imports
jest.mock('../../../../src/network', () => ({
  shardusGetTime: jest.fn(() => Date.now())
}))

jest.mock('../../../../src/p2p/Self', () => ({
  // Empty mock to break circular dependency
}))

jest.mock('../../../../src/utils/profiler', () => ({
  profilerInstance: {
    profileSectionStart: jest.fn(),
    profileSectionEnd: jest.fn(),
    scopedProfileSectionStart: jest.fn(),
    scopedProfileSectionEnd: jest.fn()
  }
}))

jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
    countRareEvent: jest.fn()
  }
}))

jest.mock('../../../../src/debug', () => ({
  // Empty mock to break circular dependency
}))

// Mock all dependencies before importing
const mockLogger = {
  getLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}
const mockContext = {
  config: {
    p2p: {
      enableProblematicNodeRemoval: false,
      enableProblematicNodeRemovalOnCycle: 10,
      maxShrinkMultiplier: 0.02,
    },
  },
  logger: mockLogger,
  setDefaultConfigs: jest.fn(),
}

jest.mock('@shardeum-foundation/lib-types')
jest.mock('../../../../src/utils')
jest.mock('../../../../src/p2p/Comms')
jest.mock('../../../../src/p2p/Context', () => mockContext)
jest.mock('../../../../src/p2p/NodeList')
jest.mock('../../../../src/p2p/Self')
const mockCycleCreator = {
  currentCycle: 5,
  scaleFactor: 1.0,
}
jest.mock('../../../../src/p2p/CycleCreator', () => mockCycleCreator)
const mockCycleChain = {
  newest: {
    counter: 10,
  },
}
jest.mock('../../../../src/p2p/CycleChain', () => mockCycleChain)
jest.mock('../../../../src/utils/nestedCounters')
jest.mock('../../../../src/p2p/ModeSystemFuncs')
jest.mock('../../../../src/logger', () => mockLogger)
jest.mock('../../../../src/p2p/CycleAutoScale', () => ({
  reset: jest.fn(),
  getDesiredCount: jest.fn(() => 5),
  updateDesiredNodes: jest.fn(),
}))

// Import after mocking
import * as Rotation from '../../../../src/p2p/Rotation'
import * as Comms from '../../../../src/p2p/Comms'
import { config, logger } from '../../../../src/p2p/Context'
import * as NodeList from '../../../../src/p2p/NodeList'
import * as CycleCreator from '../../../../src/p2p/CycleCreator'
import { nestedCountersInstance } from '../../../../src/utils/nestedCounters'
import { getExpiredRemovedV2, getExpiredRemovedV3 } from '../../../../src/p2p/ModeSystemFuncs'
import { validateTypes } from '../../../../src/utils'

const mockedComms = Comms as jest.Mocked<typeof Comms>
const mockedConfig = mockContext.config
const mockedLogger = mockLogger
const mockedNodeList = NodeList as jest.Mocked<typeof NodeList>
const mockedCycleCreator = mockCycleCreator
const mockedNestedCounters = nestedCountersInstance as jest.Mocked<typeof nestedCountersInstance>
const mockedGetExpiredRemovedV2 = getExpiredRemovedV2 as jest.MockedFunction<typeof getExpiredRemovedV2>
const mockedGetExpiredRemovedV3 = getExpiredRemovedV3 as jest.MockedFunction<typeof getExpiredRemovedV3>
const mockedValidateTypes = validateTypes as jest.MockedFunction<typeof validateTypes>

describe('Rotation', () => {
  let mockP2pLogger: any

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Setup mock logger
    mockP2pLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }
    ;(mockedLogger.getLogger as jest.Mock).mockReturnValue(mockP2pLogger)

    // Setup mock config
    mockedConfig.p2p = {
      enableProblematicNodeRemoval: false,
      enableProblematicNodeRemovalOnCycle: 10,
      maxShrinkMultiplier: 0.02,
    }

    // Setup mock nested counters
    mockedNestedCounters.countEvent = jest.fn()

    // Setup mock validate types
    mockedValidateTypes.mockReturnValue('')

    // Setup mock expired/removed functions
    mockedGetExpiredRemovedV2.mockReturnValue({ expired: 0, removed: [] })
    mockedGetExpiredRemovedV3.mockReturnValue({ expired: 0, removed: [], problematic: 0 })

    // Setup mock cycle creator
    mockedCycleCreator.currentCycle = 5
  })

  describe('init', () => {
    it('should initialize logger and reset state', () => {
      Rotation.init()

      expect(mockedLogger.getLogger).toHaveBeenCalledWith('p2p')
      // Reset function is called but currently returns early
    })
  })

  describe('reset', () => {
    it('should reset state', () => {
      const result = Rotation.reset()
      expect(result).toBeUndefined()
    })
  })

  describe('getTxs', () => {
    it('should return empty object', () => {
      const result = Rotation.getTxs()
      expect(result).toEqual({})
    })
  })

  describe('validateRecordTypes', () => {
    it('should validate valid record types', () => {
      const record = {
        expired: 5,
        removed: ['node1', 'node2'],
      }

      const result = Rotation.validateRecordTypes(record as any)

      expect(mockedValidateTypes).toHaveBeenCalledWith(record, { expired: 'n', removed: 'a' })
      expect(result).toBe('')
    })

    it('should return error for invalid types', () => {
      mockedValidateTypes.mockReturnValue('Invalid type')
      const record = {
        expired: 'invalid',
        removed: ['node1'],
      }

      const result = Rotation.validateRecordTypes(record as any)

      expect(result).toBe('Invalid type')
    })

    it('should return error for non-string removed items', () => {
      const record = {
        expired: 5,
        removed: ['node1', 123], // Invalid non-string item
      }

      const result = Rotation.validateRecordTypes(record as any)

      expect(result).toBe('items of removed array must be strings')
    })

    it('should handle empty removed array', () => {
      const record = {
        expired: 0,
        removed: [],
      }

      const result = Rotation.validateRecordTypes(record as any)

      expect(result).toBe('')
    })
  })

  describe('dropInvalidTxs', () => {
    it('should return the same txs object', () => {
      const txs = { test: 'data' }

      const result = Rotation.dropInvalidTxs(txs as any)

      expect(result).toBe(txs)
    })
  })

  describe('updateRecord', () => {
    let mockRecord: any
    let mockPrevRecord: any
    let mockTxs: any

    beforeEach(() => {
      mockRecord = {
        expired: undefined,
        removed: undefined,
      }
      mockPrevRecord = {
        start: 1000,
        desired: 100,
      }
      mockTxs = {
        apoptosis: [],
      }
    })

    it('should handle null previous record', () => {
      Rotation.updateRecord(mockTxs, mockRecord, null)

      expect(mockRecord.expired).toBe(0)
      expect(mockRecord.removed).toEqual([])
    })

    it('should handle undefined previous record', () => {
      Rotation.updateRecord(mockTxs, mockRecord, undefined)

      expect(mockRecord.expired).toBe(0)
      expect(mockRecord.removed).toEqual([])
    })

    it('should use getExpiredRemovedV2 when problematic node removal is disabled', () => {
      mockedConfig.p2p.enableProblematicNodeRemoval = false
      mockedGetExpiredRemovedV2.mockReturnValue({ expired: 3, removed: ['node1', 'node2'] })

      Rotation.updateRecord(mockTxs, mockRecord, mockPrevRecord)

      expect(mockedGetExpiredRemovedV2).toHaveBeenCalledWith(
        mockPrevRecord,
        expect.any(Number),
        mockTxs,
        expect.any(Function)
      )
      expect(mockedNestedCounters.countEvent).toHaveBeenCalledWith(
        'p2p',
        'results of getExpiredRemovedV2: expired: 3 removed: 2',
        1
      )
    })

    it('should use getExpiredRemovedV3 when problematic node removal is enabled and past threshold cycle', () => {
      mockedConfig.p2p.enableProblematicNodeRemoval = true
      mockedConfig.p2p.enableProblematicNodeRemovalOnCycle = 3
      mockedCycleCreator.currentCycle = 5 // Past threshold
      mockedGetExpiredRemovedV3.mockReturnValue({ expired: 2, removed: ['problematic1'], problematic: 1 })

      Rotation.updateRecord(mockTxs, mockRecord, mockPrevRecord)

      expect(mockedGetExpiredRemovedV3).toHaveBeenCalledWith(
        mockPrevRecord,
        expect.any(Number),
        mockTxs,
        expect.any(Function)
      )
      expect(mockedNestedCounters.countEvent).toHaveBeenCalledWith(
        'p2p',
        'results of getExpiredRemovedV3: expired: 2 removed: 1 problematic: 1',
        1
      )
    })

    it('should not enable problematic node removal when current cycle is before threshold', () => {
      mockedConfig.p2p.enableProblematicNodeRemoval = true
      mockedConfig.p2p.enableProblematicNodeRemovalOnCycle = 10
      mockedCycleCreator.currentCycle = 5 // Before threshold
      mockedGetExpiredRemovedV2.mockReturnValue({ expired: 1, removed: [] })

      Rotation.updateRecord(mockTxs, mockRecord, mockPrevRecord)

      expect(mockedGetExpiredRemovedV2).toHaveBeenCalled()
      expect(mockedGetExpiredRemovedV3).not.toHaveBeenCalled()
    })

    it('should count events for both V2 and V3 results', () => {
      mockedConfig.p2p.enableProblematicNodeRemoval = false
      mockedGetExpiredRemovedV2.mockReturnValue({ expired: 5, removed: ['a', 'b', 'c'] })

      Rotation.updateRecord(mockTxs, mockRecord, mockPrevRecord)

      expect(mockedNestedCounters.countEvent).toHaveBeenCalledWith(
        'p2p',
        'results of getExpiredRemovedV2: expired: 5 removed: 3',
        1
      )
    })
  })

  describe('integration scenarios', () => {
    it('should handle complete initialization flow', () => {
      Rotation.init()

      const txs = Rotation.getTxs()
      expect(txs).toEqual({})

      const validRecord = {
        expired: 0,
        removed: [],
      }
      const validationResult = Rotation.validateRecordTypes(validRecord as any)
      expect(validationResult).toBe('')
    })

    it('should handle record update with various configurations', () => {
      Rotation.init()

      const record = { expired: undefined, removed: undefined }
      const prevRecord = { start: 2000, desired: 50 }
      const txs = { someTransaction: 'data', apoptosis: [] }

      // Test with problematic node removal disabled
      mockedConfig.p2p.enableProblematicNodeRemoval = false
      Rotation.updateRecord(txs as any, record as any, prevRecord as any)

      expect(mockedGetExpiredRemovedV2).toHaveBeenCalled()
    })
  })
})
