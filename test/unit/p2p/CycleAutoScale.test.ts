jest.mock('deepmerge', () => jest.fn((a, b) => {
  // Mock the actual behavior of deepmerge({}, [...array])
  // deepmerge({}, array) returns the array itself
  if (Array.isArray(b)) {
    return b
  }
  return { ...a, ...b }
}))
jest.mock('../../../src/logger', () => ({
  logFlags: {
    console: false,
    error: false,
    important_as_fatal: false,
    p2pNonFatal: false,
    verbose: false
  }
}))
jest.mock('../../../src/utils', () => ({
  sleep: jest.fn(() => Promise.resolve()),
  validateTypes: jest.fn(() => ''),
  fastIsPicked: jest.fn(() => true)
}))
jest.mock('../../../src/p2p/Comms')
jest.mock('../../../src/p2p/Context')
jest.mock('../../../src/p2p/CycleChain')
jest.mock('../../../src/p2p/CycleCreator')
jest.mock('../../../src/p2p/NodeList')
jest.mock('../../../src/p2p/Self')
jest.mock('../../../src/utils/profiler', () => ({
  profilerInstance: {
    scopedProfileSectionStart: jest.fn(),
    scopedProfileSectionEnd: jest.fn()
  }
}))
jest.mock('../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn()
  }
}))
jest.mock('../../../src/p2p/Modes', () => ({
  enterRecovery: jest.fn(() => false),
  enterSafety: jest.fn(() => false)
}))
jest.mock('../../../src/p2p/Utils', () => ({
  getOurNodeIndex: jest.fn(() => 0)
}))
jest.mock('../../../src/network', () => ({
  shardusGetTime: jest.fn(() => Date.now())
}))
jest.mock('../../../src/snapshot', () => ({}))
jest.mock('../../../src/state-manager', () => ({}))
jest.mock('../../../src/p2p/Archivers', () => ({}))
jest.mock('../../../src/network/debugMiddleware', () => ({}))
jest.mock('../../../src/p2p/Active', () => ({}))

import deepmerge from 'deepmerge'
import * as CycleAutoScale from '../../../src/p2p/CycleAutoScale'
import * as Comms from '../../../src/p2p/Comms'
import { config, crypto, logger, stateManager } from '../../../src/p2p/Context'
import * as CycleChain from '../../../src/p2p/CycleChain'
import * as CycleCreator from '../../../src/p2p/CycleCreator'
import * as NodeList from '../../../src/p2p/NodeList'
import * as Self from '../../../src/p2p/Self'
import { profilerInstance } from '../../../src/utils/profiler'
import { nestedCountersInstance } from '../../../src/utils/nestedCounters'
import { enterRecovery, enterSafety } from '../../../src/p2p/Modes'
import { getOurNodeIndex } from '../../../src/p2p/Utils'
import { shardusGetTime } from '../../../src/network'
import { sleep, validateTypes, fastIsPicked } from '../../../src/utils'
import { logFlags } from '../../../src/logger'
import { P2P } from '@shardeum-foundation/lib-types'
import { Utils } from '@shardeum-foundation/lib-types'

// Mock Utils.safeStringify
jest.mock('@shardeum-foundation/lib-types', () => ({
  P2P: {
    CycleAutoScaleTypes: {
      ScaleType: {
        UP: 'up',
        DOWN: 'down'
      }
    },
    CycleCreatorTypes: {},
    CycleParserTypes: {},
    P2PTypes: {
      NodeStatus: {
        INITIALIZING: 'initializing',
        SYNCING: 'syncing',
        ACTIVE: 'active',
        FAILED: 'failed'
      }
    }
  },
  Utils: {
    safeStringify: jest.fn((obj) => JSON.stringify(obj))
  }
}))

describe('CycleAutoScale', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Setup default mocks for Context
    ;(config as any) = {
      p2p: {
        minNodes: 10,
        maxNodes: 100,
        scaleGroupLimit: 20,
        minScaleReqsNeeded: 3,
        scaleConsensusRequired: 0.6,
        amountToGrow: 5,
        maxDesiredMultiplier: 1.2,
        maxScaleReqs: 50,
        queryDelay: 1000,
        formingNodesPerCycle: 2,
        extraNodesToAddInRestart: 5
      },
      debug: {
        ignoreScaleGossipSelfCheck: false
      }
    }
    
    ;(crypto as any) = {
      sign: jest.fn((obj) => ({ ...obj, sign: { owner: 'test-owner', sig: 'test-sig' } })),
      verify: jest.fn(() => true)
    }
    
    ;(logger as any) = {
      getLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      })
    }
    
    ;(stateManager as any) = {
      currentCycleShardData: {}
    }
    
    // Setup CycleCreator mocks
    ;(CycleCreator as any).currentCycle = 10
    ;(CycleCreator as any).currentQuarter = 1
    ;(CycleCreator as any).nextQ1Start = Date.now() + 30000
    
    // Setup CycleChain mocks
    ;(CycleChain as any).newest = {
      counter: 10,
      desired: 20,
      target: 15,
      mode: 'processing'
    }
    
    // Setup NodeList mocks
    ;(NodeList as any).nodes = new Map()
    ;(NodeList as any).byIdOrder = []
    ;(NodeList as any).activeByIdOrder = []
    ;(NodeList as any).syncingByIdOrder = []
    
    // Setup Self mocks
    ;(Self as any).id = 'test-node-id'
    ;(Self as any).isActive = true
    ;(Self as any).isFirst = false
    
    // Setup Comms mocks
    ;(Comms.registerGossipHandler as jest.Mock) = jest.fn()
    ;(Comms.sendGossip as jest.Mock) = jest.fn()
    
    // Setup shardusGetTime mock
    ;(shardusGetTime as jest.Mock).mockReturnValue(Date.now())
  })

  describe('init', () => {
    it('should initialize p2p logger and desired count', () => {
      const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
      ;(logger.getLogger as jest.Mock).mockReturnValue(mockLogger)
      
      CycleAutoScale.init()
      
      expect(logger.getLogger).toHaveBeenCalledWith('p2p')
      expect(CycleAutoScale.getDesiredCount()).toBe(config.p2p.minNodes)
    })

    it('should register gossip handler for scaling', () => {
      CycleAutoScale.init()
      
      expect(Comms.registerGossipHandler).toHaveBeenCalledWith('scaling', expect.any(Function))
    })
  })

  describe('reset', () => {
    it('should reset scaling state variables', () => {
      CycleAutoScale.reset()
      
      expect(CycleAutoScale.scalingRequested).toBe(false)
      expect(CycleAutoScale.scalingRequestsCollector).toBeInstanceOf(Map)
      expect(CycleAutoScale.scalingRequestsCollector.size).toBe(0)
      expect(CycleAutoScale.requestedScalingType).toBe(null)
      expect(CycleAutoScale.approvedScalingType).toBe(null)
    })
  })

  describe('getDesiredCount', () => {
    it('should return configured minNodes if desiredCount is less than minNodes', () => {
      ;(CycleAutoScale as any).desiredCount = 5
      config.p2p.minNodes = 10
      
      const result = CycleAutoScale.getDesiredCount()
      
      expect(result).toBe(10)
      expect(CycleAutoScale.desiredCount).toBe(10)
    })

    it('should return desiredCount if it is greater than or equal to minNodes', () => {
      ;(CycleAutoScale as any).desiredCount = 15
      config.p2p.minNodes = 10
      
      const result = CycleAutoScale.getDesiredCount()
      
      expect(result).toBe(15)
    })
  })

  describe('requestNetworkUpsize', () => {
    beforeEach(() => {
      CycleAutoScale.reset()
    })

    it('should return early if desired count exceeds max nodes', () => {
      ;(CycleAutoScale as any).desiredCount = 100
      config.p2p.maxNodes = 90
      
      CycleAutoScale.requestNetworkUpsize()
      
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })

    it('should return early if node cannot send scale requests', () => {
      ;(fastIsPicked as jest.Mock).mockReturnValue(false)
      config.debug.ignoreScaleGossipSelfCheck = false
      
      CycleAutoScale.requestNetworkUpsize()
      
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })

    it('should return early if not active', () => {
      ;(Self as any).isActive = false
      
      CycleAutoScale.requestNetworkUpsize()
      
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })

    it('should return early if already scaling requested', () => {
      ;(CycleAutoScale as any).scalingRequested = true
      
      CycleAutoScale.requestNetworkUpsize()
      
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })

    it('should create and gossip upsize request when conditions are met', () => {
      // Setup conditions for successful scaling request
      ;(Self as any).isActive = true
      CycleAutoScale.reset() // Reset scaling state
      ;(fastIsPicked as jest.Mock).mockReturnValue(true)
      ;(CycleAutoScale as any).desiredCount = 20
      config.p2p.maxNodes = 100
      config.debug.ignoreScaleGossipSelfCheck = true // Bypass scale check
      
      // Setup node in NodeList for validation
      const selfNode = { id: 'test-node-id', publicKey: 'test-pubkey' }
      ;(NodeList as any).nodes = new Map([['test-node-id', selfNode]])
      ;(crypto.verify as jest.Mock).mockReturnValue(true)
      
      CycleAutoScale.requestNetworkUpsize()
      
      expect(crypto.sign).toHaveBeenCalledWith({
        nodeId: 'test-node-id',
        timestamp: expect.any(Number),
        counter: 10,
        scale: P2P.CycleAutoScaleTypes.ScaleType.UP
      })
      
      expect(Comms.sendGossip).toHaveBeenCalledWith(
        'scaling',
        expect.objectContaining({
          scale: P2P.CycleAutoScaleTypes.ScaleType.UP
        }),
        '',
        null,
        NodeList.byIdOrder,
        true,
        2
      )
      
      expect(CycleAutoScale.scalingRequested).toBe(true)
      expect(CycleAutoScale.requestedScalingType).toBe(P2P.CycleAutoScaleTypes.ScaleType.UP)
    })
  })

  describe('requestNetworkDownsize', () => {
    beforeEach(() => {
      CycleAutoScale.reset()
    })

    it('should return early if desired count is at minNodes', () => {
      ;(CycleAutoScale as any).desiredCount = 10
      config.p2p.minNodes = 10
      
      CycleAutoScale.requestNetworkDownsize()
      
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })

    it('should create and gossip downsize request when conditions are met', () => {
      ;(Self as any).isActive = true
      CycleAutoScale.reset() // Reset scaling state
      ;(CycleAutoScale as any).desiredCount = 20
      config.p2p.minNodes = 10
      ;(fastIsPicked as jest.Mock).mockReturnValue(true)
      config.debug.ignoreScaleGossipSelfCheck = true // Bypass scale check
      
      // Setup node in NodeList for validation
      const selfNode = { id: 'test-node-id', publicKey: 'test-pubkey' }
      ;(NodeList as any).nodes = new Map([['test-node-id', selfNode]])
      ;(crypto.verify as jest.Mock).mockReturnValue(true)
      
      CycleAutoScale.requestNetworkDownsize()
      
      expect(crypto.sign).toHaveBeenCalledWith({
        nodeId: 'test-node-id',
        timestamp: expect.any(Number),
        counter: 10,
        scale: P2P.CycleAutoScaleTypes.ScaleType.DOWN
      })
      
      expect(Comms.sendGossip).toHaveBeenCalledWith(
        'scaling',
        expect.objectContaining({
          scale: P2P.CycleAutoScaleTypes.ScaleType.DOWN
        }),
        '',
        null,
        NodeList.byIdOrder,
        true,
        2
      )
      
      expect(CycleAutoScale.scalingRequested).toBe(true)
      expect(CycleAutoScale.requestedScalingType).toBe(P2P.CycleAutoScaleTypes.ScaleType.DOWN)
    })
  })

  describe('configUpdated', () => {
    it('should update desired count if it is less than minNodes', () => {
      ;(CycleAutoScale as any).desiredCount = 5
      config.p2p.minNodes = 10
      
      CycleAutoScale.configUpdated()
      
      expect(CycleAutoScale.desiredCount).toBe(10)
    })

    it('should not change desired count if it is greater than or equal to minNodes', () => {
      ;(CycleAutoScale as any).desiredCount = 15
      config.p2p.minNodes = 10
      
      CycleAutoScale.configUpdated()
      
      expect(CycleAutoScale.desiredCount).toBe(15)
    })
  })

  describe('getTxs', () => {
    it('should return copy of scaling requests collector', () => {
      // Reset to ensure clean state
      CycleAutoScale.reset()
      
      const result = CycleAutoScale.getTxs()
      
      // The function should return an object with autoscaling property
      expect(result).toHaveProperty('autoscaling')
      expect(typeof result).toBe('object')
      // deepmerge should be called during getTxs execution
      expect(deepmerge).toHaveBeenCalled()
    })
  })

  describe('validateRecordTypes', () => {
    it('should return empty string for valid record', () => {
      const record = { desired: 20, target: 15 }
      
      const result = CycleAutoScale.validateRecordTypes(record)
      
      expect(result).toBe('')
      expect(validateTypes).toHaveBeenCalledWith(record, { desired: 'n' })
    })

    it('should return error for invalid record', () => {
      ;(validateTypes as jest.Mock).mockReturnValue('error message')
      const record = { desired: 20, target: 15 } as any
      
      const result = CycleAutoScale.validateRecordTypes(record)
      
      expect(result).toBe('error message')
    })
  })

  describe('updateRecord', () => {
    it('should update record with desired and target counts', () => {
      const txs = { autoscaling: [] }
      const record: any = {}
      const prevRecord: any = { target: 15, desired: 20, mode: 'processing' }
      ;(NodeList as any).activeByIdOrder = new Array(15) // 15 active nodes
      ;(enterSafety as jest.Mock).mockReturnValue(false)
      ;(enterRecovery as jest.Mock).mockReturnValue(false)
      
      ;(CycleAutoScale as any).desiredCount = 20
      
      CycleAutoScale.updateRecord(txs, record, prevRecord)
      
      expect(record.desired).toBe(20)
      expect(record.target).toBeDefined()
    })

    it('should call reset after updating record', () => {
      const txs = { autoscaling: [] }
      const record: any = {}
      const prevRecord: any = { target: 15, mode: 'processing' }
      
      // Add some requests to verify reset clears them
      CycleAutoScale.scalingRequestsCollector.set('node1', {} as any)
      
      CycleAutoScale.updateRecord(txs, record, prevRecord)
      
      expect(CycleAutoScale.scalingRequestsCollector.size).toBe(0)
    })
  })

  describe('parseRecord', () => {
    it('should return empty change object', () => {
      const record: any = { desired: 20, target: 15 }
      
      const result = CycleAutoScale.parseRecord(record)
      
      expect(result).toEqual({
        added: [],
        removed: [],
        updated: []
      })
    })
  })

  describe('queueRequest', () => {
    it('should be a no-op function', () => {
      expect(() => CycleAutoScale.queueRequest({})).not.toThrow()
    })
  })

  describe('sendRequests', () => {
    it('should be a no-op function', () => {
      expect(() => CycleAutoScale.sendRequests()).not.toThrow()
    })
  })

  describe('setAndGetTargetCount (via updateRecord)', () => {
    it('should handle forming mode with active less than desired', () => {
      const txs = { autoscaling: [] }
      const record: any = {}
      const prevRecord: any = { desired: 20, mode: 'forming' }
      ;(NodeList as any).activeByIdOrder = new Array(10) // 10 active nodes
      ;(NodeList as any).syncingByIdOrder = new Array(5) // 5 syncing nodes
      
      CycleAutoScale.updateRecord(txs, record, prevRecord)
      
      expect(record.target).toBeGreaterThan(10)
    })

    it('should handle processing mode without safety/recovery', () => {
      const txs = { autoscaling: [] }
      const record: any = {}
      const prevRecord: any = { desired: 20, target: 15, mode: 'processing' }
      ;(NodeList as any).activeByIdOrder = new Array(15)
      ;(enterSafety as jest.Mock).mockReturnValue(false)
      ;(enterRecovery as jest.Mock).mockReturnValue(false)
      
      CycleAutoScale.updateRecord(txs, record, prevRecord)
      
      expect(record.target).toBeDefined()
    })

    it('should handle safety mode', () => {
      const txs = { autoscaling: [] }
      const record: any = {}
      const prevRecord: any = { desired: 20, mode: 'safety' }
      ;(NodeList as any).activeByIdOrder = new Array(15)
      
      CycleAutoScale.updateRecord(txs, record, prevRecord)
      
      expect(record.target).toBe(config.p2p.minNodes)
    })

    it('should handle recovery mode', () => {
      const txs = { autoscaling: [] }
      const record: any = {}
      const prevRecord: any = { desired: 20, mode: 'recovery' }
      ;(NodeList as any).activeByIdOrder = new Array(15)
      
      CycleAutoScale.updateRecord(txs, record, prevRecord)
      
      expect(record.target).toBe(config.p2p.minNodes + config.p2p.extraNodesToAddInRestart)
    })

    it('should handle restart mode', () => {
      const txs = { autoscaling: [] }
      const record: any = {}
      const prevRecord: any = { desired: 20, mode: 'restart' }
      ;(NodeList as any).activeByIdOrder = new Array(15)
      ;(NodeList as any).syncingByIdOrder = new Array(10)
      
      CycleAutoScale.updateRecord(txs, record, prevRecord)
      
      expect(record.target).toBeGreaterThan(10)
    })

    it('should handle shutdown mode', () => {
      const txs = { autoscaling: [] }
      const record: any = {}
      const prevRecord: any = { desired: 20, mode: 'shutdown' }
      ;(NodeList as any).activeByIdOrder = new Array(15)
      
      CycleAutoScale.updateRecord(txs, record, prevRecord)
      
      expect(record.target).toBe(config.p2p.formingNodesPerCycle)
    })

    it('should handle first node condition', () => {
      const txs = { autoscaling: [] }
      const record: any = {}
      const prevRecord = null
      ;(Self as any).isFirst = true
      ;(NodeList as any).activeByIdOrder = []
      
      CycleAutoScale.updateRecord(txs, record, prevRecord)
      
      expect(record.target).toBe(config.p2p.formingNodesPerCycle)
    })
  })

  describe('scaling validation and consensus', () => {
    beforeEach(() => {
      CycleAutoScale.reset()
    })

    it('should validate scaling request with all required fields', () => {
      const node = { id: 'node1', publicKey: 'pk1' }
      ;(NodeList as any).nodes = new Map([['node1', node]])
      ;(crypto.verify as jest.Mock).mockReturnValue(true)
      
      const request = {
        nodeId: 'node1',
        timestamp: Date.now(),
        counter: 10,
        scale: P2P.CycleAutoScaleTypes.ScaleType.UP,
        sign: { owner: 'pk1', sig: 'sig1' }
      }
      
      // Test through the gossip handler
      CycleAutoScale.init()
      const gossipHandler = (Comms.registerGossipHandler as jest.Mock).mock.calls[0][1]
      
      gossipHandler(request, 'sender', 'tracker')
      
      expect(crypto.verify).toHaveBeenCalledWith(request, 'pk1')
      expect(Comms.sendGossip).toHaveBeenCalled()
    })

    it('should reject scaling request with invalid cycle counter', () => {
      const node = { id: 'node1', publicKey: 'pk1' }
      ;(NodeList as any).nodes = new Map([['node1', node]])
      
      const request = {
        nodeId: 'node1',
        timestamp: Date.now(),
        counter: 999, // Wrong cycle
        scale: P2P.CycleAutoScaleTypes.ScaleType.UP,
        sign: { owner: 'pk1', sig: 'sig1' }
      }
      
      CycleAutoScale.init()
      const gossipHandler = (Comms.registerGossipHandler as jest.Mock).mock.calls[0][1]
      
      gossipHandler(request, 'sender', 'tracker')
      
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })

    it('should reject scaling request with invalid signature', () => {
      const node = { id: 'node1', publicKey: 'pk1' }
      ;(NodeList as any).nodes = new Map([['node1', node]])
      ;(crypto.verify as jest.Mock).mockReturnValue(false)
      
      const request = {
        nodeId: 'node1',
        timestamp: Date.now(),
        counter: 10,
        scale: P2P.CycleAutoScaleTypes.ScaleType.UP,
        sign: { owner: 'pk1', sig: 'invalid' }
      }
      
      CycleAutoScale.init()
      const gossipHandler = (Comms.registerGossipHandler as jest.Mock).mock.calls[0][1]
      
      gossipHandler(request, 'sender', 'tracker')
      
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })

    it('should handle scale consensus with sufficient votes', () => {
      // Setup nodes and scaling requests to test _checkScaling logic
      ;(NodeList as any).activeByIdOrder = new Array(20) // 20 active nodes
      config.p2p.scaleConsensusRequired = 0.6 // 60% consensus required
      config.p2p.minScaleReqsNeeded = 3 // Minimum 3 requests
      config.p2p.scaleGroupLimit = 0 // Disable group limits
      ;(CycleChain as any).newest = { desired: 20, counter: 10 }
      
      // Reset to clear any previous state and ensure approvedScalingType is null
      CycleAutoScale.reset()
      expect(CycleAutoScale.approvedScalingType).toBe(null) // Verify clean state
      
      // Required votes = max(3, 0.6 * 20) = max(3, 12) = 12
      // Add 13 scale up requests to exceed required threshold
      for (let i = 0; i < 13; i++) {
        CycleAutoScale.scalingRequestsCollector.set(`node${i}`, {
          nodeId: `node${i}`,
          timestamp: Date.now(),
          counter: 10,
          scale: P2P.CycleAutoScaleTypes.ScaleType.UP,
          sign: { owner: 'test', sig: 'test' }
        } as any)
      }
      
      const txs = { autoscaling: [] }
      const record: any = {}
      const prevRecord: any = { desired: 20, target: 15, mode: 'processing' }
      
      // Call updateRecord which internally calls _checkScaling
      CycleAutoScale.updateRecord(txs, record, prevRecord)
      
      // Note: updateRecord calls reset() at the end, so approvedScalingType will be null after
      // But the scaling logic should have processed the votes and set the desired count
      expect(CycleAutoScale.approvedScalingType).toBe(null) // Reset after updateRecord
      expect(record.desired).toBeGreaterThan(20) // Should have increased desired count due to scale up
    })

    it('should handle scale voting limits with scaleGroupLimit', () => {
      ;(NodeList as any).activeByIdOrder = new Array(50) // 50 active nodes
      config.p2p.scaleGroupLimit = 20 // Limit voting to 20 nodes
      config.p2p.scaleConsensusRequired = 0.6 // 60% consensus required
      config.p2p.minScaleReqsNeeded = 3
      ;(CycleChain as any).newest = { desired: 20, counter: 10 }
      
      // Reset to clear any previous state
      CycleAutoScale.reset()
      expect(CycleAutoScale.approvedScalingType).toBe(null) // Verify clean state
      
      // With scaleGroupLimit, requiredVotes = min(max(3, 0.6*50), 20*0.6) = min(30, 12) = 12
      // Add 13 scale up requests to exceed required threshold
      for (let i = 0; i < 13; i++) {
        CycleAutoScale.scalingRequestsCollector.set(`node${i}`, {
          nodeId: `node${i}`,
          timestamp: Date.now(),
          counter: 10,
          scale: P2P.CycleAutoScaleTypes.ScaleType.UP,
          sign: { owner: 'test', sig: 'test' }
        } as any)
      }
      
      const txs = { autoscaling: [] }
      const record: any = {}
      const prevRecord: any = { desired: 20, target: 15, mode: 'processing' }
      
      CycleAutoScale.updateRecord(txs, record, prevRecord)
      
      // Note: updateRecord calls reset() at the end, so approvedScalingType will be null after
      // But the scaling logic should have processed the votes and set the desired count
      expect(CycleAutoScale.approvedScalingType).toBe(null) // Reset after updateRecord
      expect(record.desired).toBeGreaterThan(20) // Should have increased desired count due to scale up
    })
  })

  describe('error handling', () => {
    it('should handle invalid scale type in createScaleRequest', () => {
      expect(() => {
        // This will test the createScaleRequest function indirectly through requestNetworkUpsize
        ;(P2P.CycleAutoScaleTypes.ScaleType as any).UP = 'invalid'
        CycleAutoScale.requestNetworkUpsize()
      }).not.toThrow() // The function should handle errors gracefully
    })

    it('should handle missing node in scaling request validation', () => {
      const request = {
        nodeId: 'nonexistent',
        timestamp: Date.now(),
        counter: 10,
        scale: P2P.CycleAutoScaleTypes.ScaleType.UP,
        sign: { owner: 'pk1', sig: 'sig1' }
      }
      
      CycleAutoScale.init()
      const gossipHandler = (Comms.registerGossipHandler as jest.Mock).mock.calls[0][1]
      
      gossipHandler(request, 'sender', 'tracker')
      
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })

    it('should handle missing fields in scaling request', () => {
      const request = {
        nodeId: 'node1',
        // Missing required fields
      }
      
      CycleAutoScale.init()
      const gossipHandler = (Comms.registerGossipHandler as jest.Mock).mock.calls[0][1]
      
      gossipHandler(request, 'sender', 'tracker')
      
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })
  })

  describe('node scale request permissions', () => {
    it('should allow scale requests when scaleGroupLimit is disabled', () => {
      config.p2p.scaleGroupLimit = 0
      config.debug.ignoreScaleGossipSelfCheck = true // Bypass permission check
      
      // Test through _canThisNodeSendScaleRequests via requestNetworkUpsize
      ;(Self as any).isActive = true
      CycleAutoScale.reset() // Reset scaling state
      ;(CycleAutoScale as any).desiredCount = 20
      config.p2p.maxNodes = 100
      
      // Setup node in NodeList for validation
      const selfNode = { id: 'test-node-id', publicKey: 'test-pubkey' }
      ;(NodeList as any).nodes = new Map([['test-node-id', selfNode]])
      ;(crypto.verify as jest.Mock).mockReturnValue(true)
      
      CycleAutoScale.requestNetworkUpsize()
      
      expect(Comms.sendGossip).toHaveBeenCalled()
    })

    it('should check node permissions when scaleGroupLimit is enabled', () => {
      config.p2p.scaleGroupLimit = 20
      config.debug.ignoreScaleGossipSelfCheck = false // Enable permission check
      ;(NodeList as any).activeByIdOrder = new Array(50)
      ;(getOurNodeIndex as jest.Mock).mockReturnValue(5)
      ;(fastIsPicked as jest.Mock).mockReturnValue(true)
      
      ;(Self as any).isActive = true
      CycleAutoScale.reset() // Reset scaling state
      ;(CycleAutoScale as any).desiredCount = 20
      config.p2p.maxNodes = 100
      
      // Setup node in NodeList for validation
      const selfNode = { id: 'test-node-id', publicKey: 'test-pubkey' }
      ;(NodeList as any).nodes = new Map([['test-node-id', selfNode]])
      ;(crypto.verify as jest.Mock).mockReturnValue(true)
      
      CycleAutoScale.requestNetworkUpsize()
      
      expect(fastIsPicked).toHaveBeenCalledWith(5, 50, 20, 10)
      expect(Comms.sendGossip).toHaveBeenCalled()
    })

    it('should reject scale requests when node index is null', () => {
      config.p2p.scaleGroupLimit = 20
      ;(getOurNodeIndex as jest.Mock).mockReturnValue(null)
      
      ;(Self as any).isActive = true
      ;(CycleAutoScale as any).scalingRequested = false
      
      CycleAutoScale.requestNetworkUpsize()
      
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })

    it('should allow all nodes to vote when below scaleGroupLimit', () => {
      config.p2p.scaleGroupLimit = 20
      config.debug.ignoreScaleGossipSelfCheck = false // Enable permission check
      ;(NodeList as any).activeByIdOrder = new Array(15) // Below limit
      
      ;(Self as any).isActive = true
      CycleAutoScale.reset() // Reset scaling state
      ;(CycleAutoScale as any).desiredCount = 20
      config.p2p.maxNodes = 100
      
      // Setup node in NodeList for validation
      const selfNode = { id: 'test-node-id', publicKey: 'test-pubkey' }
      ;(NodeList as any).nodes = new Map([['test-node-id', selfNode]])
      ;(crypto.verify as jest.Mock).mockReturnValue(true)
      
      CycleAutoScale.requestNetworkUpsize()
      
      expect(Comms.sendGossip).toHaveBeenCalled()
    })
  })

  describe('scaling request limits', () => {
    it('should respect maxScaleReqs limit', () => {
      config.p2p.maxScaleReqs = 2
      
      // Fill up to the limit
      for (let i = 0; i < 2; i++) {
        CycleAutoScale.scalingRequestsCollector.set(`node${i}`, {
          nodeId: `node${i}`,
          scale: P2P.CycleAutoScaleTypes.ScaleType.UP
        } as any)
      }
      
      // Try to add another request
      const node = { id: 'node3', publicKey: 'pk3' }
      ;(NodeList as any).nodes = new Map([['node3', node]])
      ;(crypto.verify as jest.Mock).mockReturnValue(true)
      
      const request = {
        nodeId: 'node3',
        timestamp: Date.now(),
        counter: 10,
        scale: P2P.CycleAutoScaleTypes.ScaleType.UP,
        sign: { owner: 'pk3', sig: 'sig3' }
      }
      
      CycleAutoScale.init()
      const gossipHandler = (Comms.registerGossipHandler as jest.Mock).mock.calls[0][1]
      
      gossipHandler(request, 'sender', 'tracker')
      
      // Should still gossip even when limit is exceeded (return true for gossip continuation)
      expect(Comms.sendGossip).toHaveBeenCalled()
    })

    it('should prevent duplicate requests from same node', () => {
      CycleAutoScale.reset() // Start with clean state
      
      const node = { id: 'node1', publicKey: 'pk1' }
      ;(NodeList as any).nodes = new Map([['node1', node]])
      ;(crypto.verify as jest.Mock).mockReturnValue(true)
      
      const request = {
        nodeId: 'node1',
        timestamp: Date.now(),
        counter: 10,
        scale: P2P.CycleAutoScaleTypes.ScaleType.UP,
        sign: { owner: 'pk1', sig: 'sig1' }
      }
      
      CycleAutoScale.init()
      const gossipHandler = (Comms.registerGossipHandler as jest.Mock).mock.calls[0][1]
      
      // First request should succeed
      gossipHandler(request, 'sender', 'tracker')
      expect(Comms.sendGossip).toHaveBeenCalledTimes(1)
      
      // Second request from same node should be ignored
      jest.clearAllMocks()
      gossipHandler(request, 'sender', 'tracker')
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })
  })
})