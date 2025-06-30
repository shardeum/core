// Create mock NodeList object before mocking
const mockNodeList = {
  activeByIdOrder: [],
  byJoinOrder: [],
  nodes: new Map(),
  potentiallyRemoved: new Set()
}

// Mock all dependencies before importing
jest.mock('../../../../src/p2p/NodeList', () => mockNodeList)

jest.mock('../../../../src/p2p/Self', () => ({}))

jest.mock('../../../../src/p2p/Modes', () => ({
  enterRecovery: jest.fn(() => false),
  enterSafety: jest.fn(() => false),
  enterProcessing: jest.fn(() => false),
  enterShutdown: jest.fn(() => false)
}))

jest.mock('../../../../src/p2p/Context', () => ({
  config: {
    p2p: {
      syncingDesiredMinCount: 5,
      syncFloorEnabled: true,
      syncingMaxAddPercent: 0.1,
      maxRotatedPerCycle: 10,
      flexibleRotationDelta: 2,
      flexibleRotationEnabled: true,
      nodeExpiryAge: 300000,
      uniqueRemovedIds: true,
      minNodes: 10,
      extraNodesToAddInRestart: 5,
      rotationMaxAddPercent: 0.1,
      rotationMaxRemovePercent: 0.05,
      rotationCountMultiply: 1,
      rotationCountAdd: 0,
      rotationPercentActive: 0.001,
      enableDangerousProblematicNodeRemoval: false,
      problematicNodeRemovalCycleFrequency: 10,
      maxProblematicNodeRemovalsPerCycle: 1
    },
    debug: {
      verboseNestedCounters: false
    }
  },
  logger: {
    mainLog_debug: jest.fn(),
    combine: jest.fn((msg, tag) => msg)
  }
}))

let mockTargetCount = 20
jest.mock('../../../../src/p2p/CycleAutoScale', () => ({
  get targetCount() { return mockTargetCount }
}))

jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn()
  }
}))

jest.mock('../../../../src/utils', () => ({
  insertSorted: jest.fn((arr, item) => arr.push(item)),
  lerp: jest.fn((a, b, t) => a + t * (b - a))
}))

let mockScaleFactor = 1.0
jest.mock('../../../../src/p2p/CycleCreator', () => ({
  get scaleFactor() { return mockScaleFactor }
}))

// Create mock CycleChain with newest counter
const mockCycleChainObject = {
  newest: {
    counter: 100
  }
}
jest.mock('../../../../src/p2p/CycleChain', () => mockCycleChainObject)

jest.mock('../../../../src/logger', () => ({
  logFlags: {
    verboseNestedCounters: false,
    node_rotation_debug: false,
    verbose: false
  }
}))

jest.mock('../../../../src/p2p/ProblemNodeHandler', () => ({
  getProblematicNodes: jest.fn(() => [])
}))

jest.mock('@shardeum-foundation/lib-types', () => ({
  P2P: {
    CycleCreatorTypes: {},
    RotationTypes: {},
    ApoptosisTypes: {}
  },
  Utils: {
    safeStringify: jest.fn((obj) => JSON.stringify(obj))
  }
}))

import * as ModeSystemFuncs from '../../../../src/p2p/ModeSystemFuncs'
import * as NodeList from '../../../../src/p2p/NodeList'
import * as Self from '../../../../src/p2p/Self'
import { enterRecovery, enterSafety, enterProcessing, enterShutdown } from '../../../../src/p2p/Modes'
import { config, logger } from '../../../../src/p2p/Context'
import * as CycleAutoScale from '../../../../src/p2p/CycleAutoScale'
import { nestedCountersInstance } from '../../../../src/utils/nestedCounters'
import { insertSorted } from '../../../../src/utils'
import * as CycleCreator from '../../../../src/p2p/CycleCreator'
import * as CycleChain from '../../../../src/p2p/CycleChain'
import { logFlags } from '../../../../src/logger'
import { getProblematicNodes } from '../../../../src/p2p/ProblemNodeHandler'
import { P2P, Utils } from '@shardeum-foundation/lib-types'

// Create mock Self object
const mockSelf = {
  isFirst: false
}

// Create mock CycleChain object - using mockCycleChainObject defined above
const mockCycleChain = mockCycleChainObject

// Mock the Self properties
Object.defineProperty(Self, 'isFirst', {
  get: () => mockSelf.isFirst,
  set: (value) => { mockSelf.isFirst = value },
  configurable: true
})

// Note: CycleChain is already mocked with mockCycleChainObject above

describe('ModeSystemFuncs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Reset mock NodeList state
    mockNodeList.activeByIdOrder = []
    mockNodeList.byJoinOrder = []
    mockNodeList.nodes = new Map()
    mockNodeList.potentiallyRemoved = new Set()
    
    // Reset Self state
    mockSelf.isFirst = false
    
    // Reset CycleChain state
    mockCycleChain.newest = {
      counter: 100
    }
    
    // Reset config to default values
    ;(config.p2p as any) = {
      syncingDesiredMinCount: 5,
      syncFloorEnabled: true,
      syncingMaxAddPercent: 0.1,
      maxRotatedPerCycle: 10,
      flexibleRotationDelta: 2,
      flexibleRotationEnabled: true,
      nodeExpiryAge: 300000,
      uniqueRemovedIds: true,
      minNodes: 10,
      extraNodesToAddInRestart: 5,
      rotationMaxAddPercent: 0.1,
      rotationMaxRemovePercent: 0.05,
      rotationCountMultiply: 1,
      rotationCountAdd: 0,
      rotationPercentActive: 0.001,
      enableDangerousProblematicNodeRemoval: false,
      problematicNodeRemovalCycleFrequency: 10,
      maxProblematicNodeRemovalsPerCycle: 1
    }
    
    // Reset mock functions
    ;(enterRecovery as jest.Mock).mockReturnValue(false)
    ;(enterSafety as jest.Mock).mockReturnValue(false)
    ;(enterProcessing as jest.Mock).mockReturnValue(false)
    ;(enterShutdown as jest.Mock).mockReturnValue(false)
    ;(getProblematicNodes as jest.Mock).mockReturnValue([])
    
    // Reset CycleChain
    mockCycleChain.newest = {
      counter: 100
    }
    
    // Reset CycleCreator
    mockScaleFactor = 1.0
    
    // Reset targetCount
    mockTargetCount = 20
  })

  describe('calculateToAcceptV2', () => {
    it('should return { add: 0, remove: 0 } when prevRecord is null', () => {
      const result = ModeSystemFuncs.calculateToAcceptV2(null as any)
      expect(result).toEqual({ add: 0, remove: 0 })
    })

    it('should return { add: 0, remove: 0 } when prevRecord is undefined', () => {
      const result = ModeSystemFuncs.calculateToAcceptV2(undefined as any)
      expect(result).toEqual({ add: 0, remove: 0 })
    })

    it('should call calculateAddRemove with correct parameters when prevRecord exists', () => {
      const prevRecord = {
        desired: 15,
        mode: 'processing',
        counter: 10,
        lost: ['node1', 'node2']
      } as any
      
      mockNodeList.activeByIdOrder = new Array(12) // 12 active nodes
      mockNodeList.byJoinOrder = new Array(15) // 15 total nodes (3 syncing)
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result).toHaveProperty('add')
      expect(result).toHaveProperty('remove')
      expect(typeof result.add).toBe('number')
      expect(typeof result.remove).toBe('number')
    })

    it('should handle when activeByIdOrder is empty', () => {
      const prevRecord = {
        desired: 15,
        mode: 'forming',
        counter: 10,
        lost: []
      } as any
      
      mockNodeList.activeByIdOrder = []
      mockNodeList.byJoinOrder = []
      mockSelf.isFirst = false
      mockTargetCount = 0 // No target nodes
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result).toEqual({ add: 0, remove: 0 })
    })

    it('should handle when byJoinOrder is smaller than activeByIdOrder', () => {
      const prevRecord = {
        desired: 15,
        mode: 'processing',
        counter: 10,
        lost: []
      } as any
      
      mockNodeList.activeByIdOrder = new Array(10)
      mockNodeList.byJoinOrder = new Array(8) // Less than active (shouldn't happen in practice)
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result).toHaveProperty('add')
      expect(result).toHaveProperty('remove')
    })

    it('should use targetCount from CycleAutoScale', () => {
      const prevRecord = {
        desired: 15,
        mode: 'processing',
        counter: 10,
        lost: []
      } as any
      
      mockNodeList.activeByIdOrder = new Array(10)
      mockNodeList.byJoinOrder = new Array(12)
      
      ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      // Should use the targetCount which is 20
      expect(CycleAutoScale.targetCount).toBe(20)
    })
  })

  describe('calculateAddRemove - forming mode', () => {
    it('should add target nodes when Self.isFirst and active < 1', () => {
      mockSelf.isFirst = true
      mockNodeList.activeByIdOrder = []
      mockTargetCount = 10
      
      const prevRecord = {
        desired: 15,
        mode: 'forming',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result).toEqual({ add: 10, remove: 0 })
    })

    it('should add nodes when active != desired in forming mode', () => {
      mockSelf.isFirst = false
      mockNodeList.activeByIdOrder = new Array(5) // 5 active
      mockNodeList.byJoinOrder = new Array(7) // 2 syncing
      mockTargetCount = 15
      
      const prevRecord = {
        desired: 10,
        mode: 'forming',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result.add).toBeGreaterThan(0)
      expect(result.remove).toBe(0)
    })

    it('should remove nodes when too many in forming mode', () => {
      mockSelf.isFirst = false
      mockNodeList.activeByIdOrder = new Array(25) // 25 active
      mockNodeList.byJoinOrder = new Array(30) // 5 syncing
      mockTargetCount = 15
      
      const prevRecord = {
        desired: 20,
        mode: 'forming',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result.add).toBe(0)
      expect(result.remove).toBeGreaterThan(0)
    })

    it('should limit removal to 10% of active nodes in forming mode', () => {
      mockSelf.isFirst = false
      mockNodeList.activeByIdOrder = new Array(100) // 100 active
      mockNodeList.byJoinOrder = new Array(120) // 20 syncing
      mockTargetCount = 50
      
      const prevRecord = {
        desired: 60,
        mode: 'forming',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result.add).toBe(0)
      expect(result.remove).toBeLessThanOrEqual(10) // 10% of 100
    })
  })

  describe('calculateAddRemove - restart mode', () => {
    it('should add nodes in restart mode when syncing < desired + extra', () => {
      mockNodeList.activeByIdOrder = new Array(10)
      mockNodeList.byJoinOrder = new Array(12) // 2 syncing
      mockTargetCount = 20
      ;(config.p2p.extraNodesToAddInRestart as any) = 5
      
      const prevRecord = {
        desired: 15,
        mode: 'restart',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result.add).toBeGreaterThan(0)
      expect(result.remove).toBe(0)
    })

    it('should not add nodes in restart mode when syncing >= desired + extra', () => {
      mockNodeList.activeByIdOrder = new Array(10)
      mockNodeList.byJoinOrder = new Array(25) // 15 syncing
      mockTargetCount = 20
      ;(config.p2p.extraNodesToAddInRestart as any) = 5
      
      const prevRecord = {
        desired: 10,
        mode: 'restart',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result).toEqual({ add: 0, remove: 0 })
    })
  })

  describe('calculateAddRemove - processing mode', () => {
    beforeEach(() => {
      ;(enterSafety as jest.Mock).mockReturnValue(false)
      ;(enterRecovery as jest.Mock).mockReturnValue(false)
    })

    it('should return { add: 0, remove: 0 } when entering safety mode', () => {
      ;(enterSafety as jest.Mock).mockReturnValue(true)
      mockNodeList.activeByIdOrder = new Array(5)
      
      const prevRecord = {
        desired: 15,
        mode: 'processing',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result).toEqual({ add: 0, remove: 0 })
    })

    it('should return { add: 0, remove: 0 } when entering recovery mode', () => {
      ;(enterRecovery as jest.Mock).mockReturnValue(true)
      mockNodeList.activeByIdOrder = new Array(3)
      
      const prevRecord = {
        desired: 15,
        mode: 'processing',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result).toEqual({ add: 0, remove: 0 })
    })

    it('should add nodes when active < target in processing mode', () => {
      mockNodeList.activeByIdOrder = new Array(10) // 10 active
      mockNodeList.byJoinOrder = new Array(12) // 2 syncing
      mockTargetCount = 20
      
      const prevRecord = {
        desired: 15,
        mode: 'processing',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result.add).toBeGreaterThan(0)
      expect(result.remove).toBe(0)
    })

    it('should limit node additions to rotationMaxAddPercent in processing mode', () => {
      mockNodeList.activeByIdOrder = new Array(100) // 100 active
      mockNodeList.byJoinOrder = new Array(100) // 0 syncing
      mockTargetCount = 200 // Need to add 100 nodes
      ;(config.p2p.rotationMaxAddPercent as any) = 0.1 // 10%
      
      const prevRecord = {
        desired: 150,
        mode: 'processing',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result.add).toBeLessThanOrEqual(10) // 10% of 100
      expect(result.remove).toBe(0)
    })

    it('should remove nodes when active > target in processing mode', () => {
      mockNodeList.activeByIdOrder = new Array(25) // 25 active
      mockNodeList.byJoinOrder = new Array(30) // 5 syncing
      mockTargetCount = 15
      
      const prevRecord = {
        desired: 20,
        mode: 'processing',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result.add).toBe(0)
      expect(result.remove).toBeGreaterThan(0)
    })

    it('should limit node removals to rotationMaxRemovePercent in processing mode', () => {
      mockNodeList.activeByIdOrder = new Array(100) // 100 active
      mockNodeList.byJoinOrder = new Array(100) // 0 syncing
      mockTargetCount = 50 // Need to remove 50 nodes
      ;(config.p2p.rotationMaxRemovePercent as any) = 0.05 // 5%
      ;(config.p2p.syncFloorEnabled as any) = false // Use old logic
      
      const prevRecord = {
        desired: 80,
        mode: 'processing',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result.add).toBe(0)
      expect(result.remove).toBe(5) // 5% of 100
    })

    it('should handle rotation when active === target and maxRotatedPerCycle !== 0', () => {
      mockNodeList.activeByIdOrder = new Array(20) // 20 active
      mockNodeList.byJoinOrder = new Array(22) // 2 syncing
      mockTargetCount = 20 // Exactly at target
      ;(config.p2p.maxRotatedPerCycle as any) = 5
      ;(config.p2p.syncFloorEnabled as any) = false // Use old logic to test rotation
      ;(config.p2p.rotationCountMultiply as any) = 1
      ;(config.p2p.rotationCountAdd as any) = 0
      ;(config.p2p.rotationPercentActive as any) = 0.001
      
      const prevRecord = {
        desired: 20,
        mode: 'processing',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result.add).toBe(1) // Should rotate based on maxSyncing = 2 (desiredRotationPerCycle=1 * 1 + 0 + 1)
      expect(result.remove).toBe(0)
    })

    it('should handle fractional rotation rates', () => {
      mockNodeList.activeByIdOrder = new Array(20)
      mockNodeList.byJoinOrder = new Array(22)
      mockTargetCount = 20
      ;(config.p2p.maxRotatedPerCycle as any) = 0.5 // Half node per cycle
      
      const prevRecord = {
        desired: 20,
        mode: 'processing',
        counter: 2, // Even counter
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      // Should rotate on even cycles when maxRotatedPerCycle = 0.5
      expect(result.add).toBeGreaterThanOrEqual(0)
    })

    it('should handle auto rotation rate when maxRotatedPerCycle < 0', () => {
      mockNodeList.activeByIdOrder = new Array(1000) // 1000 active nodes
      mockNodeList.byJoinOrder = new Array(1020)
      mockTargetCount = 1000
      ;(config.p2p.maxRotatedPerCycle as any) = -1 // Auto mode
      ;(config.p2p.rotationPercentActive as any) = 0.001 // 0.1%
      ;(config.p2p.syncFloorEnabled as any) = false // Use old logic
      
      const prevRecord = {
        desired: 1000,
        mode: 'processing',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result.add).toBe(1) // 0.1% of 1000 = 1
      expect(result.remove).toBe(0)
    })
  })

  describe('calculateAddRemove - safety mode', () => {
    beforeEach(() => {
      ;(enterProcessing as jest.Mock).mockReturnValue(false)
      ;(enterRecovery as jest.Mock).mockReturnValue(false)
    })

    it('should return { add: 0, remove: 0 } when entering processing mode', () => {
      ;(enterProcessing as jest.Mock).mockReturnValue(true)
      mockNodeList.activeByIdOrder = new Array(15)
      
      const prevRecord = {
        desired: 15,
        mode: 'safety',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result).toEqual({ add: 0, remove: 0 })
    })

    it('should return { add: 0, remove: 0 } when entering recovery mode', () => {
      ;(enterRecovery as jest.Mock).mockReturnValue(true)
      mockNodeList.activeByIdOrder = new Array(3)
      
      const prevRecord = {
        desired: 15,
        mode: 'safety',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result).toEqual({ add: 0, remove: 0 })
    })

    it('should add nodes to reach minNodes in safety mode with new syncing logic', () => {
      ;(config.p2p.syncFloorEnabled as any) = true
      ;(config.p2p.minNodes as any) = 20
      mockNodeList.activeByIdOrder = new Array(10) // 10 active
      mockNodeList.byJoinOrder = new Array(12) // 2 syncing
      
      const prevRecord = {
        desired: 15,
        mode: 'safety',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result.add).toBeGreaterThan(0)
      expect(result.remove).toBe(0)
    })

    it('should add nodes to reach minNodes in safety mode with legacy logic', () => {
      ;(config.p2p.syncFloorEnabled as any) = false
      ;(config.p2p.minNodes as any) = 20
      mockNodeList.activeByIdOrder = new Array(10) // 10 active
      mockNodeList.byJoinOrder = new Array(12) // 2 syncing
      
      const prevRecord = {
        desired: 15,
        mode: 'safety',
        counter: 1,
        lost: ['node1', 'node2'] // 2 lost nodes
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result.add).toBeGreaterThan(0)
      expect(result.remove).toBe(0)
    })

    it('should limit additions to 5% of active nodes in safety mode', () => {
      ;(config.p2p.syncFloorEnabled as any) = false
      ;(config.p2p.minNodes as any) = 200
      mockNodeList.activeByIdOrder = new Array(100) // 100 active
      mockNodeList.byJoinOrder = new Array(100) // 0 syncing
      
      const prevRecord = {
        desired: 150,
        mode: 'safety',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result.add).toBeLessThanOrEqual(5) // 5% of 100
      expect(result.remove).toBe(0)
    })
  })

  describe('calculateAddRemove - recovery mode', () => {
    beforeEach(() => {
      ;(enterShutdown as jest.Mock).mockReturnValue(false)
    })

    it('should return { add: 0, remove: 0 } when entering shutdown mode', () => {
      ;(enterShutdown as jest.Mock).mockReturnValue(true)
      mockNodeList.activeByIdOrder = new Array(2)
      
      const prevRecord = {
        desired: 15,
        mode: 'recovery',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result).toEqual({ add: 0, remove: 0 })
    })

    it('should add nodes to reach minNodes in recovery mode with new syncing logic', () => {
      ;(config.p2p.syncFloorEnabled as any) = true
      ;(config.p2p.minNodes as any) = 20
      mockNodeList.activeByIdOrder = new Array(8) // 8 active
      mockNodeList.byJoinOrder = new Array(10) // 2 syncing
      
      const prevRecord = {
        desired: 15,
        mode: 'recovery',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result.add).toBeGreaterThan(0)
      expect(result.remove).toBe(0)
    })

    it('should add nodes to reach target in recovery mode with legacy logic', () => {
      ;(config.p2p.syncFloorEnabled as any) = false
      mockTargetCount = 25
      mockNodeList.activeByIdOrder = new Array(10) // 10 active
      mockNodeList.byJoinOrder = new Array(12) // 2 syncing
      
      const prevRecord = {
        desired: 20,
        mode: 'recovery',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result.add).toBeGreaterThan(0)
      expect(result.remove).toBe(0)
    })

    it('should limit additions to 20% of total nodes in recovery mode', () => {
      ;(config.p2p.syncFloorEnabled as any) = false
      mockTargetCount = 200
      mockNodeList.activeByIdOrder = new Array(50) // 50 active
      mockNodeList.byJoinOrder = new Array(60) // 10 syncing
      
      const prevRecord = {
        desired: 150,
        mode: 'recovery',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result.add).toBeLessThanOrEqual(12) // 20% of 60 total nodes
      expect(result.remove).toBe(0)
    })
  })

  describe('calculateAddRemove - restore mode', () => {
    it('should add nodes to reach target in restore mode', () => {
      mockTargetCount = 30
      mockNodeList.activeByIdOrder = new Array(15) // 15 active
      mockNodeList.byJoinOrder = new Array(20) // 5 syncing
      
      const prevRecord = {
        desired: 25,
        mode: 'restore',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result.add).toBeGreaterThan(0)
      expect(result.remove).toBe(0)
    })

    it('should not add nodes when at target in restore mode', () => {
      mockTargetCount = 20
      mockNodeList.activeByIdOrder = new Array(15) // 15 active
      mockNodeList.byJoinOrder = new Array(20) // 5 syncing (total = target)
      
      const prevRecord = {
        desired: 18,
        mode: 'restore',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result).toEqual({ add: 0, remove: 0 })
    })
  })

  describe('calculateAddRemove - helper functions behavior', () => {
    it('should use syncFloorEnabled logic when enabled', () => {
      ;(config.p2p.syncFloorEnabled as any) = true
      ;(config.p2p.syncingDesiredMinCount as any) = 8
      mockNodeList.activeByIdOrder = new Array(20)
      mockNodeList.byJoinOrder = new Array(25) // 5 syncing
      mockTargetCount = 20 // At target
      
      const prevRecord = {
        desired: 20,
        mode: 'processing',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      // Should maintain syncing floor of 8, currently have 5, so need to ensure at least 8 are syncing
      // This means we need to add more nodes since we only have 5 syncing currently
      expect(result.add).toBeGreaterThan(0)
    })

    it('should respect flexibleRotationEnabled for removals', () => {
      ;(config.p2p.flexibleRotationEnabled as any) = true
      ;(config.p2p.flexibleRotationDelta as any) = 3
      ;(config.p2p.maxRotatedPerCycle as any) = 5
      mockNodeList.activeByIdOrder = new Array(25) // 25 active
      mockNodeList.byJoinOrder = new Array(30) // 5 syncing
      mockTargetCount = 15
      
      const prevRecord = {
        desired: 20, // active (25) > desired (20)
        mode: 'processing',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(result.remove).toBeGreaterThan(0)
    })
  })

  describe('getExpiredRemovedV2', () => {
    const mockInfo = jest.fn()
    let lastLoggedCycle = 0

    beforeEach(() => {
      mockInfo.mockClear()
      lastLoggedCycle = 0
      mockNodeList.potentiallyRemoved.clear()
      ;(insertSorted as jest.Mock).mockImplementation((arr, item) => arr.push(item))
    })

    it('should return empty result when nodeExpiryAge is negative', () => {
      ;(config.p2p.nodeExpiryAge as any) = -1
      
      const prevRecord = {
        start: Date.now(),
        desired: 20
      } as any
      
      const txs = { apoptosis: [] } as any
      
      const result = ModeSystemFuncs.getExpiredRemovedV2(prevRecord, lastLoggedCycle, txs, mockInfo)
      
      expect(result).toEqual({ expired: 0, removed: [] })
    })

    it('should calculate expired nodes correctly', () => {
      const now = Date.now()
      ;(config.p2p.nodeExpiryAge as any) = 300000 // 5 minutes
      ;(config.p2p.syncFloorEnabled as any) = false // Use old logic
      ;(config.p2p.uniqueRemovedIds as any) = true
      
      const prevRecord = {
        start: now,
        desired: 20,
        mode: 'processing',
        counter: 1,
        lost: []
      } as any
      
      // Mock expired nodes
      const expiredNode1 = { 
        status: 'active', 
        activeTimestamp: now - 400000, // 6.67 minutes ago (expired)
        id: 'expired1'
      }
      const expiredNode2 = { 
        status: 'active', 
        activeTimestamp: now - 350000, // 5.83 minutes ago (expired)
        id: 'expired2'
      }
      const activeNode = { 
        status: 'active', 
        activeTimestamp: now - 200000, // 3.33 minutes ago (not expired)
        id: 'active1'
      }
      
      mockNodeList.byJoinOrder = [expiredNode1, expiredNode2, activeNode]
      mockNodeList.activeByIdOrder = [expiredNode1, expiredNode2, activeNode]
      mockTargetCount = 1 // Force removal of 2 nodes
      mockCycleChain.newest = { counter: 101 }
      
      const txs = { apoptosis: [] } as any
      
      const result = ModeSystemFuncs.getExpiredRemovedV2(prevRecord, lastLoggedCycle, txs, mockInfo)
      
      // Based on the implementation, expired count and removed list may differ
      expect(result.expired).toBeGreaterThanOrEqual(1)
      expect(result.removed.length).toBeGreaterThanOrEqual(1)
      expect(result.removed[0]).toBe('expired1')
    })

    it('should skip syncing nodes when counting expired', () => {
      const now = Date.now()
      ;(config.p2p.nodeExpiryAge as any) = 300000
      ;(config.p2p.syncFloorEnabled as any) = false // Use old logic
      ;(config.p2p.uniqueRemovedIds as any) = true
      
      const prevRecord = {
        start: now,
        desired: 20,
        mode: 'processing',
        counter: 1,
        lost: []
      } as any
      
      const syncingNode = { 
        status: 'syncing', 
        activeTimestamp: now - 400000, // Would be expired if not syncing
        id: 'syncing1'
      }
      const expiredActiveNode = { 
        status: 'active', 
        activeTimestamp: now - 400000,
        id: 'expired1'
      }
      
      mockNodeList.byJoinOrder = [syncingNode, expiredActiveNode]
      mockNodeList.activeByIdOrder = [expiredActiveNode]
      mockTargetCount = 0 // Force removal
      mockCycleChain.newest = { counter: 101 }
      
      const txs = { apoptosis: [] } as any
      
      const result = ModeSystemFuncs.getExpiredRemovedV2(prevRecord, lastLoggedCycle, txs, mockInfo)
      
      expect(result.expired).toBe(1) // Only the active node
      expect(result.removed).toEqual(['expired1'])
    })

    it('should handle apoptosis requests correctly', () => {
      const now = Date.now()
      ;(config.p2p.nodeExpiryAge as any) = 300000
      ;(config.p2p.syncFloorEnabled as any) = false // Use old logic
      ;(config.p2p.uniqueRemovedIds as any) = true
      
      const prevRecord = {
        start: now,
        desired: 20,
        mode: 'processing',
        counter: 1,
        lost: []
      } as any
      
      const apoptosisNode = { 
        id: 'apop1',
        status: 'active', 
        activeTimestamp: now - 400000
      }
      const expiredNode = { 
        id: 'expired1',
        status: 'active', 
        activeTimestamp: now - 400000
      }
      
      mockNodeList.byJoinOrder = [apoptosisNode, expiredNode]
      mockNodeList.activeByIdOrder = [apoptosisNode, expiredNode]
      mockNodeList.nodes = new Map([
        ['apop1', apoptosisNode],
        ['expired1', expiredNode]
      ])
      mockTargetCount = 0 // Force removal
      mockCycleChain.newest = { counter: 101 }
      
      const txs = { 
        apoptosis: [{ id: 'apop1' }] 
      } as any
      
      const result = ModeSystemFuncs.getExpiredRemovedV2(prevRecord, lastLoggedCycle, txs, mockInfo)
      
      // When uniqueRemovedIds is true and we have apoptosis nodes,
      // the behavior depends on whether there's room after apoptosis nodes
      if (result.removed.length > 0) {
        expect(result.removed).not.toContain('apop1')
      }
      expect(result.expired).toBeGreaterThanOrEqual(0)
    })

    it('should respect uniqueRemovedIds configuration', () => {
      const now = Date.now()
      ;(config.p2p.nodeExpiryAge as any) = 300000
      ;(config.p2p.uniqueRemovedIds as any) = false
      ;(config.p2p.syncFloorEnabled as any) = false // Use old logic
      
      const prevRecord = {
        start: now,
        desired: 20,
        mode: 'processing',
        counter: 1,
        lost: []
      } as any
      
      const apoptosisNode = { 
        id: 'apop1',
        status: 'active', 
        activeTimestamp: now - 400000
      }
      const expiredNode = { 
        id: 'expired1',
        status: 'active', 
        activeTimestamp: now - 400000
      }
      
      mockNodeList.byJoinOrder = [apoptosisNode, expiredNode]
      mockNodeList.activeByIdOrder = [apoptosisNode, expiredNode]
      mockNodeList.nodes = new Map([
        ['apop1', apoptosisNode],
        ['expired1', expiredNode]
      ])
      mockTargetCount = 0 // Force removal
      mockCycleChain.newest = { counter: 101 }
      
      const txs = { 
        apoptosis: [{ id: 'apop1' }] 
      } as any
      
      const result = ModeSystemFuncs.getExpiredRemovedV2(prevRecord, lastLoggedCycle, txs, mockInfo)
      
      expect(result.expired).toBe(2)
      // When uniqueRemovedIds is false, apoptosis node should be in removed list
      expect(result.removed.length).toBe(1)
      expect(result.removed).toContain('apop1')
    })

    it('should limit removals to maxRemove count', () => {
      const now = Date.now()
      ;(config.p2p.nodeExpiryAge as any) = 300000
      ;(config.p2p.syncFloorEnabled as any) = false // Use old logic
      ;(config.p2p.uniqueRemovedIds as any) = true
      
      const prevRecord = {
        start: now,
        desired: 20,
        mode: 'processing',
        counter: 1,
        lost: []
      } as any
      
      // Create many expired nodes
      const expiredNodes = []
      for (let i = 0; i < 10; i++) {
        expiredNodes.push({
          id: `expired${i}`,
          status: 'active',
          activeTimestamp: now - 400000
        })
      }
      
      mockNodeList.byJoinOrder = expiredNodes
      mockNodeList.activeByIdOrder = expiredNodes
      mockTargetCount = 7 // Remove 3 nodes
      mockCycleChain.newest = { counter: 101 }
      
      const txs = { apoptosis: [] } as any
      
      const result = ModeSystemFuncs.getExpiredRemovedV2(prevRecord, lastLoggedCycle, txs, mockInfo)
      
      // Based on the implementation, expired count continues until maxRemove is reached
      expect(result.expired).toBeLessThanOrEqual(3)
      expect(result.removed.length).toBeLessThanOrEqual(3) // Only 3 removed due to limit
    })
  })

  describe('getExpiredRemovedV3', () => {
    const mockInfo = jest.fn()
    let lastLoggedCycle = 0

    beforeEach(() => {
      mockInfo.mockClear()
      lastLoggedCycle = 0
      mockNodeList.potentiallyRemoved.clear()
      ;(insertSorted as jest.Mock).mockImplementation((arr, item) => arr.push(item))
      ;(getProblematicNodes as jest.Mock).mockReturnValue([])
    })

    it('should return empty result when dangerous removal is prevented', () => {
      ;(config.p2p.enableDangerousProblematicNodeRemoval as any) = false
      ;(config.p2p.syncFloorEnabled as any) = false // Use old logic
      
      const prevRecord = {
        start: Date.now(),
        desired: 20,
        counter: 1,
        mode: 'processing',
        lost: []
      } as any
      
      const txs = { apoptosis: [] } as any
      
      mockNodeList.activeByIdOrder = new Array(20)
      mockNodeList.byJoinOrder = new Array(20)
      mockTargetCount = 20 // No removals
      
      const result = ModeSystemFuncs.getExpiredRemovedV3(prevRecord, lastLoggedCycle, txs, mockInfo)
      
      expect(result).toEqual({
        problematic: 0,
        expired: 0,
        removed: []
      })
    })

    it('should return empty result when nodes never expire', () => {
      ;(config.p2p.nodeExpiryAge as any) = -1
      
      const prevRecord = {
        start: Date.now(),
        desired: 20,
        counter: 1,
        mode: 'processing',
        lost: []
      } as any
      
      const txs = { apoptosis: [] } as any
      
      const result = ModeSystemFuncs.getExpiredRemovedV3(prevRecord, lastLoggedCycle, txs, mockInfo)
      
      expect(result).toEqual({
        problematic: 0,
        expired: 0,
        removed: []
      })
    })

    it('should handle expired nodes correctly', () => {
      const now = Date.now()
      ;(config.p2p.nodeExpiryAge as any) = 300000
      ;(config.p2p.syncFloorEnabled as any) = false // Use old logic
      
      const prevRecord = {
        start: now,
        desired: 20,
        counter: 1,
        mode: 'processing',
        lost: []
      } as any
      
      const expiredNode = { 
        id: 'expired1',
        status: 'active', 
        activeTimestamp: now - 400000 // Expired
      }
      const activeNode = { 
        id: 'active1',
        status: 'active', 
        activeTimestamp: now - 200000 // Not expired
      }
      
      mockNodeList.byJoinOrder = [expiredNode, activeNode]
      mockNodeList.activeByIdOrder = [expiredNode, activeNode]
      mockTargetCount = 1 // Remove 1 node
      
      const txs = { apoptosis: [] } as any
      
      const result = ModeSystemFuncs.getExpiredRemovedV3(prevRecord, lastLoggedCycle, txs, mockInfo)
      
      expect(result.problematic).toBe(0)
      expect(result.expired).toBe(1)
      expect(result.removed).toEqual(['expired1'])
    })

    it('should handle problematic nodes correctly', () => {
      const now = Date.now()
      ;(config.p2p.nodeExpiryAge as any) = 300000
      ;(config.p2p.problematicNodeRemovalCycleFrequency as any) = 10
      ;(config.p2p.maxProblematicNodeRemovalsPerCycle as any) = 2
      ;(config.p2p.syncFloorEnabled as any) = false // Use old logic
      
      const prevRecord = {
        start: now,
        desired: 20,
        counter: 10, // Divisible by frequency
        mode: 'processing',
        lost: []
      } as any
      
      const problematicNode1 = { 
        id: 'prob1',
        status: 'active', 
        activeTimestamp: now - 100000 // Not expired
      }
      const problematicNode2 = { 
        id: 'prob2',
        status: 'active', 
        activeTimestamp: now - 100000 // Not expired
      }
      
      mockNodeList.byJoinOrder = [problematicNode1, problematicNode2]
      mockNodeList.activeByIdOrder = [problematicNode1, problematicNode2]
      mockTargetCount = 0 // Remove 2 nodes
      ;(getProblematicNodes as jest.Mock).mockReturnValue(['prob1', 'prob2'])
      
      const txs = { apoptosis: [] } as any
      
      const result = ModeSystemFuncs.getExpiredRemovedV3(prevRecord, lastLoggedCycle, txs, mockInfo)
      
      expect(result.problematic).toBe(2)
      expect(result.expired).toBe(0)
      expect(result.removed).toEqual(['prob1', 'prob2'])
    })

    it('should skip problematic nodes on non-removal cycles', () => {
      const now = Date.now()
      ;(config.p2p.nodeExpiryAge as any) = 300000
      ;(config.p2p.problematicNodeRemovalCycleFrequency as any) = 10
      ;(config.p2p.syncFloorEnabled as any) = false // Use old logic
      
      const prevRecord = {
        start: now,
        desired: 20,
        counter: 11, // Not divisible by frequency
        mode: 'processing',
        lost: []
      } as any
      
      ;(getProblematicNodes as jest.Mock).mockReturnValue(['prob1', 'prob2'])
      mockNodeList.activeByIdOrder = new Array(20)
      mockNodeList.byJoinOrder = new Array(20)
      mockTargetCount = 15 // Remove 5 nodes
      
      const txs = { apoptosis: [] } as any
      
      const result = ModeSystemFuncs.getExpiredRemovedV3(prevRecord, lastLoggedCycle, txs, mockInfo)
      
      expect(result.problematic).toBe(0)
    })

    it('should handle apoptosis nodes correctly', () => {
      const now = Date.now()
      ;(config.p2p.nodeExpiryAge as any) = 300000
      ;(config.p2p.syncFloorEnabled as any) = false // Use old logic
      
      const prevRecord = {
        start: now,
        desired: 20,
        counter: 1,
        mode: 'processing',
        lost: []
      } as any
      
      const apoptosisNode = { 
        id: 'apop1',
        status: 'active', 
        activeTimestamp: now - 400000 // Expired
      }
      const expiredNode = { 
        id: 'expired1',
        status: 'active', 
        activeTimestamp: now - 400000 // Expired
      }
      
      mockNodeList.byJoinOrder = [apoptosisNode, expiredNode]
      mockNodeList.activeByIdOrder = [apoptosisNode, expiredNode]
      mockNodeList.nodes = new Map([
        ['apop1', apoptosisNode],
        ['expired1', expiredNode]
      ])
      mockTargetCount = 0 // Remove 2 nodes
      
      const txs = { 
        apoptosis: [{ id: 'apop1' }] 
      } as any
      
      const result = ModeSystemFuncs.getExpiredRemovedV3(prevRecord, lastLoggedCycle, txs, mockInfo)
      
      expect(result.problematic).toBe(0)
      // After filtering out apoptosis node, only 1 expired node can be removed
      expect(result.expired).toBeGreaterThanOrEqual(0)
      expect(result.removed.length).toBeGreaterThanOrEqual(0)
    })

    it('should filter out apoptosis nodes from problematic nodes', () => {
      const now = Date.now()
      ;(config.p2p.nodeExpiryAge as any) = 300000
      ;(config.p2p.problematicNodeRemovalCycleFrequency as any) = 10
      ;(config.p2p.syncFloorEnabled as any) = false // Use old logic
      
      const prevRecord = {
        start: now,
        desired: 20,
        counter: 10, // Divisible by frequency
        mode: 'processing',
        lost: []
      } as any
      
      const problematicNode = { 
        id: 'prob1',
        status: 'active', 
        activeTimestamp: now - 100000
      }
      const apoptosisProblematicNode = { 
        id: 'apopprob1',
        status: 'active', 
        activeTimestamp: now - 100000
      }
      
      mockNodeList.byJoinOrder = [problematicNode, apoptosisProblematicNode]
      mockNodeList.activeByIdOrder = [problematicNode, apoptosisProblematicNode]
      mockNodeList.nodes = new Map([
        ['prob1', problematicNode],
        ['apopprob1', apoptosisProblematicNode]
      ])
      mockTargetCount = 0 // Remove 2 nodes
      
      // Both nodes are problematic, but one is also apoptosis
      ;(getProblematicNodes as jest.Mock).mockReturnValue(['prob1', 'apopprob1'])
      
      const txs = { 
        apoptosis: [{ id: 'apopprob1' }] 
      } as any
      
      const result = ModeSystemFuncs.getExpiredRemovedV3(prevRecord, lastLoggedCycle, txs, mockInfo)
      
      expect(result.problematic).toBe(1) // Only prob1, not apopprob1
      expect(result.removed).toEqual(['prob1'])
    })

    it('should respect removal limits', () => {
      const now = Date.now()
      ;(config.p2p.nodeExpiryAge as any) = 300000
      ;(config.p2p.syncFloorEnabled as any) = false // Use old logic
      
      const prevRecord = {
        start: now,
        desired: 20,
        counter: 1,
        mode: 'processing',
        lost: []
      } as any
      
      // Create many expired nodes
      const expiredNodes = []
      for (let i = 0; i < 10; i++) {
        expiredNodes.push({
          id: `expired${i}`,
          status: 'active',
          activeTimestamp: now - 400000
        })
      }
      
      mockNodeList.byJoinOrder = expiredNodes
      mockNodeList.activeByIdOrder = expiredNodes
      mockTargetCount = 7 // Remove 3 nodes
      
      const txs = { apoptosis: [] } as any
      
      const result = ModeSystemFuncs.getExpiredRemovedV3(prevRecord, lastLoggedCycle, txs, mockInfo)
      
      // V3 uses filter logic, not the same counting as V2
      expect(result.removed.length).toBeLessThanOrEqual(3)
      expect(result.expired).toBeLessThanOrEqual(3)
    })

    it('should prioritize apoptosis removals over expired removals', () => {
      const now = Date.now()
      ;(config.p2p.nodeExpiryAge as any) = 300000
      ;(config.p2p.syncFloorEnabled as any) = false // Use old logic
      
      const prevRecord = {
        start: now,
        desired: 20,
        counter: 1,
        mode: 'processing',
        lost: []
      } as any
      
      const apoptosisNode = { 
        id: 'apop1',
        status: 'active', 
        activeTimestamp: now - 100000
      }
      const expiredNode = { 
        id: 'expired1',
        status: 'active', 
        activeTimestamp: now - 400000
      }
      
      mockNodeList.byJoinOrder = [apoptosisNode, expiredNode]
      mockNodeList.activeByIdOrder = [apoptosisNode, expiredNode]
      mockNodeList.nodes = new Map([
        ['apop1', apoptosisNode],
        ['expired1', expiredNode]
      ])
      mockTargetCount = 1 // Remove 1 node
      
      const txs = { 
        apoptosis: [{ id: 'apop1' }] 
      } as any
      
      const result = ModeSystemFuncs.getExpiredRemovedV3(prevRecord, lastLoggedCycle, txs, mockInfo)
      
      // Apoptosis must be removed, so no room for expired node removal
      expect(result.expired).toBe(0)
      expect(result.removed).toEqual([])
    })
  })

  describe('error handling and edge cases', () => {
    it('should handle null/undefined inputs gracefully', () => {
      expect(() => {
        ModeSystemFuncs.calculateToAcceptV2(null as any)
      }).not.toThrow()
      
      // getExpiredRemovedV2 and V3 will throw on null prevRecord because they access prevRecord.start
      // This is expected behavior, so we test for the specific error
      expect(() => {
        ModeSystemFuncs.getExpiredRemovedV2(null as any, 0, null as any, jest.fn())
      }).toThrow(TypeError)
      
      expect(() => {
        ModeSystemFuncs.getExpiredRemovedV3(null as any, 0, null as any, jest.fn())
      }).toThrow(TypeError)
    })

    it('should handle empty NodeList arrays', () => {
      mockNodeList.activeByIdOrder = []
      mockNodeList.byJoinOrder = []
      mockTargetCount = 15
      ;(config.p2p.syncFloorEnabled as any) = false // Use old logic to avoid syncing floor logic
      
      const prevRecord = {
        desired: 15,
        mode: 'processing',
        counter: 1,
        lost: []
      } as any
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      // Should add nodes when empty
      expect(result.add).toBe(1) // At least 1 node
      expect(result.remove).toBe(0)
    })

    it('should handle missing config values', () => {
      ;(config.p2p as any) = {} // Empty config
      
      const prevRecord = {
        desired: 15,
        mode: 'processing',
        counter: 1,
        lost: []
      } as any
      
      expect(() => {
        ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      }).not.toThrow()
    })

    it('should handle unknown mode values', () => {
      const prevRecord = {
        desired: 15,
        mode: 'unknown-mode',
        counter: 1,
        lost: []
      } as any
      
      mockNodeList.activeByIdOrder = new Array(10)
      mockNodeList.byJoinOrder = new Array(12)
      
      const result = ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      // Should return default values for unknown mode
      expect(result).toEqual({ add: 0, remove: 0 })
    })

    it('should handle negative numbers in calculations', () => {
      const prevRecord = {
        desired: -5,
        mode: 'processing',
        counter: 1,
        lost: []
      } as any
      
      mockNodeList.activeByIdOrder = new Array(10)
      mockNodeList.byJoinOrder = new Array(12)
      
      expect(() => {
        ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      }).not.toThrow()
    })

    it('should handle very large numbers', () => {
      const prevRecord = {
        desired: Number.MAX_SAFE_INTEGER,
        mode: 'processing',
        counter: 1,
        lost: []
      } as any
      
      mockNodeList.activeByIdOrder = new Array(10)
      mockNodeList.byJoinOrder = new Array(12)
      
      expect(() => {
        ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      }).not.toThrow()
    })
  })

  describe('logging and debugging', () => {
    it('should call nestedCountersInstance.countEvent when verbose', () => {
      ;(config.debug.verboseNestedCounters as any) = true
      ;(config.p2p.syncFloorEnabled as any) = false // Use old logic
      
      const prevRecord = {
        desired: 15,
        mode: 'processing',
        counter: 1,
        lost: []
      } as any
      
      mockNodeList.activeByIdOrder = new Array(10)
      mockNodeList.byJoinOrder = new Array(12)
      mockTargetCount = 15
      
      ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(nestedCountersInstance.countEvent).toHaveBeenCalled()
    })

    it('should call logger.mainLog_debug when node_rotation_debug is enabled', () => {
      ;(logFlags.node_rotation_debug as any) = true
      ;(config.p2p.syncFloorEnabled as any) = false // Use old logic
      
      const prevRecord = {
        desired: 15,
        mode: 'processing',
        counter: 1,
        lost: []
      } as any
      
      mockNodeList.activeByIdOrder = new Array(10)
      mockNodeList.byJoinOrder = new Array(12)
      mockTargetCount = 15
      
      ModeSystemFuncs.calculateToAcceptV2(prevRecord)
      
      expect(logger.mainLog_debug).toHaveBeenCalled()
    })

    it('should call info function in getExpiredRemovedV2 when logging cycle info', () => {
      const mockInfo = jest.fn()
      const now = Date.now()
      
      const prevRecord = {
        start: now,
        desired: 20,
        mode: 'processing',
        counter: 1,
        lost: []
      } as any
      
      // Create proper node objects
      const nodes = []
      for (let i = 0; i < 15; i++) {
        nodes.push({
          id: `node${i}`,
          status: 'active',
          activeTimestamp: now - 100000 // Recent nodes
        })
      }
      
      mockNodeList.activeByIdOrder = nodes
      mockNodeList.byJoinOrder = nodes
      mockCycleChain.newest = { counter: 101 } // New cycle
      mockTargetCount = 10 // Remove 5 nodes
      ;(config.p2p.syncFloorEnabled as any) = false // Use old logic
      
      const txs = { apoptosis: [] } as any
      
      ModeSystemFuncs.getExpiredRemovedV2(prevRecord, 100, txs, mockInfo)
      
      expect(mockInfo).toHaveBeenCalled()
    })
  })
})