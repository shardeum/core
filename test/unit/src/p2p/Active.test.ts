import { EventEmitter } from 'events'

// Mock dependencies first
jest.mock('@shardeum-foundation/lib-crypto-utils', () => ({
  init: jest.fn(),
  setCustomStringifier: jest.fn(),
  generateKeypair: jest.fn(),
  hash: jest.fn(),
  hashObj: jest.fn(),
  sign: jest.fn(),
  verify: jest.fn(),
  signObj: jest.fn(),
  verifyObj: jest.fn()
}))

jest.mock('sqlite3', () => ({
  Database: jest.fn(),
  verbose: jest.fn(() => ({
    Database: jest.fn()
  }))
}))

jest.mock('../../../../src/logger', () => ({
  logger: {
    getLogger: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }))
  },
  logFlags: {
    p2pNonFatal: false,
    important_as_error: false,
    important_as_fatal: false,
    error: false
  }
}))

jest.mock('../../../../src/utils', () => ({
  getTime: jest.fn(() => 1234567890),
  validateTypes: jest.fn(),
  safeStringify: jest.fn((obj) => JSON.stringify(obj))
}))

jest.mock('../../../../src/p2p/Comms', () => ({
  sendGossip: jest.fn(),
  registerInternal: jest.fn(),
  registerGossipHandler: jest.fn()
}))

jest.mock('../../../../src/p2p/Context', () => ({
  config: {
    p2p: {
      validateActiveRequests: true,
      cycleDuration: 60,
      maxNodeForSyncTime: 100,
      maxSyncTimeFloor: 120
    }
  },
  crypto: {
    sign: jest.fn((obj) => ({ ...obj, sign: { owner: 'test-owner' } })),
    verify: jest.fn(() => true)
  },
  logger: {
    getLogger: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }))
  },
  network: {
    registerExternalGet: jest.fn()
  }
}))

jest.mock('../../../../src/p2p/CycleCreator')
jest.mock('../../../../src/p2p/CycleChain', () => ({
  newest: { counter: 100 }
}))

jest.mock('../../../../src/p2p/NodeList', () => {
  const state = {
    activeByIdOrder: [],
    readyByTimeAndIdOrder: [],
    byPubKey: new Map(),
    nodes: new Map()
  }
  return {
    get activeByIdOrder() { return state.activeByIdOrder },
    set activeByIdOrder(value) { state.activeByIdOrder = value },
    get readyByTimeAndIdOrder() { return state.readyByTimeAndIdOrder },
    set readyByTimeAndIdOrder(value) { state.readyByTimeAndIdOrder = value },
    get byPubKey() { return state.byPubKey },
    set byPubKey(value) { state.byPubKey = value },
    get nodes() { return state.nodes },
    set nodes(value) { state.nodes = value }
  }
})

jest.mock('../../../../src/p2p/Self', () => ({
  id: 'self-id',
  setActive: jest.fn(),
  emitter: new EventEmitter(),
  updateNodeState: jest.fn()
}))

jest.mock('../../../../src/utils/profiler', () => ({
  profilerInstance: {
    scopedProfileSectionStart: jest.fn(),
    scopedProfileSectionEnd: jest.fn()
  }
}))

jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn()
  }
}))

jest.mock('../../../../src/p2p/Join/v2', () => ({
  getSortedStandbyJoinRequests: jest.fn(() => [])
}))

jest.mock('../../../../src/p2p/Join/v2/syncFinished', () => ({
  selectNodesFromReadyList: jest.fn(() => [])
}))

jest.mock('../../../../src/network/debugMiddleware', () => ({
  isDebugModeMiddleware: jest.fn((req, res, next) => next())
}))

jest.mock('@shardeum-foundation/lib-types', () => ({
  Utils: {
    safeStringify: jest.fn((obj) => JSON.stringify(obj))
  },
  P2P: {
    P2PTypes: {
      NodeStatus: {
        ACTIVE: 'ACTIVE',
        READY: 'READY',
        SYNCING: 'SYNCING'
      }
    }
  }
}))

jest.mock('../../../../src/p2p/Join', () => ({
  nodeListFromStates: jest.fn(() => undefined)
}))

jest.mock('../../../../src/utils/GossipValidation', () => ({
  checkGossipPayload: jest.fn(() => true)
}))

// Import after mocking
import * as Active from '../../../../src/p2p/Active'
import * as Comms from '../../../../src/p2p/Comms'
import * as Self from '../../../../src/p2p/Self'
import * as NodeList from '../../../../src/p2p/NodeList'
import { config, crypto, network, logger } from '../../../../src/p2p/Context'
import { nestedCountersInstance } from '../../../../src/utils/nestedCounters'
import * as JoinV2 from '../../../../src/p2p/Join/v2'
import { selectNodesFromReadyList } from '../../../../src/p2p/Join/v2/syncFinished'
import { nodeListFromStates } from '../../../../src/p2p/Join'
import { checkGossipPayload } from '../../../../src/utils/GossipValidation'
import { P2P } from '@shardeum-foundation/lib-types'
import { NodeStatus } from '@shardeum-foundation/lib-types/build/src/p2p/P2PTypes'
import * as utils from '../../../../src/utils'

describe('Active', () => {
  let mockLogger: any
  let nodeListMock: any

  beforeEach(() => {
    jest.clearAllMocks()
    
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }
    
    // Mock the logger
    ;(logger.getLogger as jest.Mock).mockReturnValue(mockLogger)
    
    // Reset module state
    Active.reset()
    ;(Active as any).neverGoActive = false
    ;(Active as any).queuedRequest = undefined
    
    // Reset NodeList state
    nodeListMock = require('../../../../src/p2p/NodeList')
    nodeListMock.activeByIdOrder = []
    nodeListMock.readyByTimeAndIdOrder = []
    nodeListMock.byPubKey = new Map()
    nodeListMock.nodes = new Map()
    
    // Initialize the module to set up p2pLogger
    Active.init()
  })
  
  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('init', () => {
    it('should initialize the module correctly', () => {
      // The init is already called in beforeEach, so we check the calls
      expect(Comms.registerInternal).not.toHaveBeenCalled() // No internal routes
      expect(Comms.registerGossipHandler).toHaveBeenCalledWith('gossip-active', expect.any(Function))
      expect(network.registerExternalGet).toHaveBeenCalledWith(
        'debug-neverGoActive',
        expect.any(Function),
        expect.any(Function)
      )
    })

    it('should register debug endpoint that toggles neverGoActive', () => {
      // Already initialized in beforeEach
      const handler = (network.registerExternalGet as jest.Mock).mock.calls[0][2]
      const mockReq = {}
      const mockRes = { json: jest.fn() }

      // Initially false
      expect(Active.neverGoActive).toBe(false)

      // Toggle to true
      handler(mockReq, mockRes)
      expect(Active.neverGoActive).toBe(true)
      expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok', neverGoActive: true })

      // Toggle back to false
      handler(mockReq, mockRes)
      expect(Active.neverGoActive).toBe(false)
    })
  })

  describe('reset', () => {
    it('should reset module state', () => {
      // Add some data
      const txs = Active.getTxs()
      expect(txs.active).toEqual([])

      // Reset
      Active.reset()
      
      const txsAfter = Active.getTxs()
      expect(txsAfter.active).toEqual([])
      expect(Active.activated).toEqual([])
    })
  })

  describe('getTxs', () => {
    it('should return empty array initially', () => {
      const txs = Active.getTxs()
      expect(txs.active).toEqual([])
    })
  })

  describe('validateRecordTypes', () => {
    it('should validate correct record', () => {
      const record: P2P.ActiveTypes.Record = {
        active: 10,
        activated: ['node1', 'node2'],
        activatedPublicKeys: ['key1', 'key2'],
        standby: 5,
        maxSyncTime: 120
      }

      const result = Active.validateRecordTypes(record)
      expect(result).toBe('')
    })

    it('should return error for invalid activated array items', () => {
      const record: any = {
        active: 10,
        activated: ['node1', 123], // Invalid: number instead of string
        activatedPublicKeys: ['key1', 'key2'],
        standby: 5,
        maxSyncTime: 120
      }

      const result = Active.validateRecordTypes(record)
      expect(result).toBe('items of activated array must be strings')
    })

    it('should return error for invalid activatedPublicKeys array items', () => {
      const record: any = {
        active: 10,
        activated: ['node1', 'node2'],
        activatedPublicKeys: ['key1', {}], // Invalid: object instead of string
        standby: 5,
        maxSyncTime: 120
      }

      const result = Active.validateRecordTypes(record)
      expect(result).toBe('items of activatedPublicKeys array must be strings')
    })

    it('should return error from validateTypes', () => {
      (utils.validateTypes as jest.Mock).mockReturnValueOnce('Invalid field type')

      const record: P2P.ActiveTypes.Record = {
        active: 10,
        activated: ['node1'],
        activatedPublicKeys: ['key1'],
        standby: 5,
        maxSyncTime: 120
      }

      const result = Active.validateRecordTypes(record)
      expect(result).toBe('Invalid field type')
    })
  })

  describe('dropInvalidTxs', () => {
    it('should filter out invalid transactions', () => {
      const validRequest: P2P.ActiveTypes.SignedActiveRequest = {
        nodeId: 'node1',
        status: 'active',
        timestamp: 1234567890,
        sign: { owner: 'owner1', sig: 'sig1' }
      }

      const invalidRequest: P2P.ActiveTypes.SignedActiveRequest = {
        nodeId: 'invalid-node',
        status: 'active',
        timestamp: 1234567890,
        sign: { owner: 'owner2', sig: 'sig2' }
      }

      // Setup node for valid request
      const node1 = { id: 'node1', publicKey: 'owner1', status: NodeStatus.READY }
      nodeListMock.nodes.set('node1', node1)
      
      // Mock crypto.verify to return true for valid request
      ;(crypto.verify as jest.Mock).mockImplementation((request, publicKey) => {
        return request.nodeId === 'node1' && publicKey === 'owner1'
      })

      const txs: P2P.ActiveTypes.Txs = {
        active: [validRequest, invalidRequest]
      }

      const result = Active.dropInvalidTxs(txs)
      
      expect(result.active).toHaveLength(1)
      expect(result.active[0]).toBe(validRequest)
    })
  })

  describe('updateRecord', () => {
    it('should update record with activated nodes from ready list', () => {
      const readyNode1 = { id: 'ready1', publicKey: 'readyKey1' }
      const readyNode2 = { id: 'ready2', publicKey: 'readyKey2' }
      
      nodeListMock.activeByIdOrder = [{ id: 'active1' }]
      nodeListMock.readyByTimeAndIdOrder = [readyNode1, readyNode2]
      ;(selectNodesFromReadyList as jest.Mock).mockReturnValue([readyNode1])
      ;(JoinV2.getSortedStandbyJoinRequests as jest.Mock).mockReturnValue([])

      const txs: P2P.ActiveTypes.Txs = { active: [] }
      const record: any = {}
      const prev: any = { mode: 'normal' }

      Active.updateRecord(txs, record, prev)

      expect(record.active).toBe(1)
      expect(record.activated).toEqual(['ready1'])
      expect(record.activatedPublicKeys).toEqual(['readyKey1'])
      expect(record.standby).toBe(0)
      expect(selectNodesFromReadyList).toHaveBeenCalledWith('normal')
    })

    it('should calculate maxSyncTime correctly', () => {
      const activeNode1 = {
        id: 'active1',
        activeTimestamp: 1000,
        syncingTimestamp: 500
      }
      const activeNode2 = {
        id: 'active2',
        activeTimestamp: 2000,
        syncingTimestamp: 1000
      }

      nodeListMock.activeByIdOrder = [activeNode1, activeNode2]
      nodeListMock.readyByTimeAndIdOrder = []
      ;(selectNodesFromReadyList as jest.Mock).mockReturnValue([])
      ;(JoinV2.getSortedStandbyJoinRequests as jest.Mock).mockReturnValue([])

      const txs: P2P.ActiveTypes.Txs = { active: [] }
      const record: any = {}
      const prev: any = { mode: 'normal' }

      Active.updateRecord(txs, record, prev)

      // Sync durations: [500ms, 1000ms], when sorted = [500, 1000]
      // Median = 500ms (floor of length/2 = floor(2/2) = 1), maxSyncTime = 500 * 2 = 1000ms
      // Since 1000ms > maxSyncTimeFloor (120), it uses 1000
      expect(record.maxSyncTime).toBe(1000)
    })

    it('should handle error in maxSyncTime calculation', () => {
      // Set up normal mocks first
      ;(selectNodesFromReadyList as jest.Mock).mockReturnValue([])
      ;(JoinV2.getSortedStandbyJoinRequests as jest.Mock).mockReturnValue([])
      
      // Set up activeByIdOrder with no nodes (empty array)
      nodeListMock.activeByIdOrder = []

      const txs: P2P.ActiveTypes.Txs = { active: [] }
      const record: any = {}
      const prev: any = { mode: 'normal' }

      Active.updateRecord(txs, record, prev)

      // When there are no nodes, medianSyncTime is undefined, maxSyncTime = 0
      // Since 0 < maxSyncTimeFloor (120), it uses the floor value
      expect(record.maxSyncTime).toBe(config.p2p.maxSyncTimeFloor)
    })
  })

  describe('parseRecord', () => {
    it('should activate self if in activated list', () => {
      const record: any = {
        activated: ['self-id', 'other-id'],
        start: 1234567890,
        counter: 100
      }

      const result = Active.parseRecord(record)

      expect(Self.setActive).toHaveBeenCalled()
      expect(Self.updateNodeState).toHaveBeenCalledWith('ACTIVE')
      expect(result.updated).toHaveLength(2)
      expect(result.updated[0]).toEqual({
        id: 'self-id',
        activeTimestamp: 1234567890,
        activeCycle: 100,
        status: 'ACTIVE'
      })
    })

    it('should not activate self if neverGoActive is true', () => {
      ;(Active as any).neverGoActive = true
      
      const record: any = {
        activated: ['self-id'],
        start: 1234567890,
        counter: 100
      }

      const result = Active.parseRecord(record)

      expect(Self.setActive).not.toHaveBeenCalled()
      expect(result.updated).toHaveLength(1)
    })

    it('should not activate self if not in activated list', () => {
      const record: any = {
        activated: ['other-id'],
        start: 1234567890,
        counter: 100
      }

      const result = Active.parseRecord(record)

      expect(Self.setActive).not.toHaveBeenCalled()
      expect(result.updated).toHaveLength(1)
    })
  })

  describe('sendRequests', () => {
    it('should send queued request', () => {
      const request: P2P.ActiveTypes.ActiveRequest = {
        nodeId: 'self-id',
        status: 'active',
        timestamp: 1234567890
      }

      Active.queueRequest(request)
      
      const signedRequest = { ...request, sign: { owner: 'test-owner' } }
      ;(crypto.sign as jest.Mock).mockReturnValue(signedRequest)

      // Setup node for validation
      const selfNode = { id: 'self-id', publicKey: 'test-owner', status: NodeStatus.READY }
      nodeListMock.nodes.set('self-id', selfNode)
      nodeListMock.byPubKey.set('test-owner', selfNode)

      Active.sendRequests()

      expect(crypto.sign).toHaveBeenCalledWith(request)
      expect(Comms.sendGossip).toHaveBeenCalledWith(
        'gossip-active',
        signedRequest,
        '',
        null,
        undefined,
        true
      )
    })

    it('should not send if neverGoActive is true', () => {
      ;(Active as any).neverGoActive = true
      
      const request: P2P.ActiveTypes.ActiveRequest = {
        nodeId: 'self-id',
        status: 'active',
        timestamp: 1234567890
      }

      Active.queueRequest(request)
      Active.sendRequests()

      expect(crypto.sign).not.toHaveBeenCalled()
      expect(Comms.sendGossip).not.toHaveBeenCalled()
      
      // Clean up - reset neverGoActive and clear the request
      ;(Active as any).neverGoActive = false
      ;(Active as any).queuedRequest = undefined
    })


    it('should retry if not activated within timeout', () => {
      jest.useFakeTimers()

      const request: P2P.ActiveTypes.ActiveRequest = {
        nodeId: 'self-id',
        status: 'active',
        timestamp: 1234567890
      }

      Active.queueRequest(request)
      
      const signedRequest = { ...request, sign: { owner: 'test-owner' } }
      ;(crypto.sign as jest.Mock).mockReturnValue(signedRequest)

      // Setup node
      const selfNode = { id: 'self-id', publicKey: 'test-owner', status: NodeStatus.READY }
      nodeListMock.nodes.set('self-id', selfNode)

      // Mock setTimeout to capture the callback
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout')

      Active.sendRequests()

      expect(crypto.sign).toHaveBeenCalled()
      expect(setTimeoutSpy).toHaveBeenCalledWith(
        Active.requestActive,
        (config.p2p.cycleDuration * 1000) + 500
      )

      jest.useRealTimers()
      
      // Clean up
      ;(Active as any).queuedRequest = undefined
    })

    it('should clear timeout if activated', () => {
      jest.useFakeTimers()

      const request: P2P.ActiveTypes.ActiveRequest = {
        nodeId: 'self-id',
        status: 'active',
        timestamp: 1234567890
      }

      Active.queueRequest(request)
      
      const signedRequest = { ...request, sign: { owner: 'test-owner' } }
      ;(crypto.sign as jest.Mock).mockReturnValue(signedRequest)

      // Setup node
      const selfNode = { id: 'self-id', publicKey: 'test-owner', status: NodeStatus.READY }
      nodeListMock.nodes.set('self-id', selfNode)

      const requestActiveSpy = jest.spyOn(Active, 'requestActive')

      Active.sendRequests()

      // Emit active event
      Self.emitter.emit('active')

      // Fast-forward time - timeout is set for cycleDuration * 1000 + 500
      jest.advanceTimersByTime((config.p2p.cycleDuration * 1000) + 500)

      // requestActive should not be called because timeout was cleared
      expect(requestActiveSpy).not.toHaveBeenCalled()

      jest.useRealTimers()
      
      // Clean up
      ;(Active as any).queuedRequest = undefined
    })
  })

  describe('queueRequest', () => {
    it('should queue a request', () => {
      const request: P2P.ActiveTypes.ActiveRequest = {
        nodeId: 'test-id',
        status: 'active',
        timestamp: 1234567890
      }

      Active.queueRequest(request)
      
      // Can't directly access queuedRequest, but we can test by calling sendRequests
      const signedRequest = { ...request, sign: { owner: 'test-owner' } }
      ;(crypto.sign as jest.Mock).mockReturnValue(signedRequest)

      // Setup node
      const node = { id: 'test-id', publicKey: 'test-owner', status: NodeStatus.READY }
      nodeListMock.nodes.set('test-id', node)

      Active.sendRequests()

      expect(crypto.sign).toHaveBeenCalledWith(request)
      
      // The request should be cleared after sendRequests
      expect((Active as any).queuedRequest).toBeUndefined()
    })
  })

  describe('requestActive', () => {
    it('should create and queue an active request', () => {
      ;(utils.getTime as jest.Mock).mockReturnValue(9876543210)
      
      // Clear any existing queued request
      ;(Active as any).queuedRequest = undefined

      Active.requestActive()

      // After calling requestActive, the request should be queued
      // We'll call sendRequests to verify the request was queued correctly
      const signedRequest = { nodeId: 'self-id', status: 'active', timestamp: 9876543210, sign: { owner: 'test-owner' } }
      ;(crypto.sign as jest.Mock).mockReturnValue(signedRequest)
      
      // Setup node for validation
      const selfNode = { id: 'self-id', publicKey: 'test-owner', status: NodeStatus.READY }
      nodeListMock.nodes.set('self-id', selfNode)

      Active.sendRequests()

      expect(crypto.sign).toHaveBeenCalledWith({
        nodeId: 'self-id',
        status: 'active',
        timestamp: 9876543210
      })
    })
  })

  describe('gossip-active handler', () => {
    let gossipHandler: P2P.P2PTypes.GossipHandler<P2P.ActiveTypes.SignedActiveRequest>

    beforeEach(() => {
      // Active.init() is already called in parent beforeEach
      gossipHandler = (Comms.registerGossipHandler as jest.Mock).mock.calls[0][1]
    })

    it('should process valid active request', () => {
      const payload: P2P.ActiveTypes.SignedActiveRequest = {
        nodeId: 'node1',
        status: 'active',
        timestamp: 1234567890,
        sign: { owner: 'node1-pubkey', sig: 'sig1' }
      }

      const sender = 'sender-id'
      const tracker = 'tracker-id'

      // Setup node with proper publicKey
      const node = { id: 'node1', publicKey: 'node1-pubkey', status: NodeStatus.READY }
      nodeListMock.nodes.set('node1', node)
      nodeListMock.byPubKey.set('node1-pubkey', node)

      // Mock crypto.verify to return true
      ;(crypto.verify as jest.Mock).mockReturnValue(true)
      
      // Make sure checkGossipPayload returns true
      ;(checkGossipPayload as jest.Mock).mockReturnValue(true)
      
      // Make sure nodeListFromStates returns something
      ;(nodeListFromStates as jest.Mock).mockReturnValue(['some-node'])

      gossipHandler(payload, sender, tracker, 100)

      expect(checkGossipPayload).toHaveBeenCalledWith(
        payload,
        { nodeId: 's', status: 's', timestamp: 'n', sign: 'o' },
        'gossip-active',
        sender
      )
      expect(Comms.sendGossip).toHaveBeenCalledWith(
        'gossip-active',
        payload,
        tracker,
        sender,
        ['some-node'],
        false
      )
    })

    it('should ignore invalid payload structure', () => {
      const payload: P2P.ActiveTypes.SignedActiveRequest = {
        nodeId: 'node1',
        status: 'active',
        timestamp: 1234567890,
        sign: { owner: 'owner1', sig: 'sig1' }
      }

      ;(checkGossipPayload as jest.Mock).mockReturnValue(false)

      gossipHandler(payload, 'sender', 'tracker', 100)

      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })

    it('should not gossip if addActiveTx returns false', () => {
      const payload: P2P.ActiveTypes.SignedActiveRequest = {
        nodeId: 'invalid-node',
        status: 'active',
        timestamp: 1234567890,
        sign: { owner: 'owner1', sig: 'sig1' }
      }

      // No node setup, so validation will fail

      gossipHandler(payload, 'sender', 'tracker', 100)

      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })
  })

  describe('enableSkipActivatedCert', () => {
    it('should be set based on environment variable', () => {
      // The value is set at module load time, so we can only test the current value
      expect(typeof Active.enableSkipActivatedCert).toBe('boolean')
    })
  })

  describe('sendRequests - edge cases', () => {
    it('should not send if no queued request', () => {
      // Reset the entire module state to ensure clean state
      Active.reset()
      jest.clearAllMocks()
      
      // Explicitly ensure no request is queued
      ;(Active as any).queuedRequest = undefined
      
      // Don't queue any request, just call sendRequests
      Active.sendRequests()

      expect(crypto.sign).not.toHaveBeenCalled()
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })
  })
})