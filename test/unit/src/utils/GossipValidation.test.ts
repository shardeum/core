// Mock console first
const mockWarn = jest.fn()
jest.mock('console', () => ({
  warn: mockWarn,
}))

// Mock all the dependencies to prevent them from loading
jest.mock('../../../../src/p2p/NodeList', () => ({
  byPubKey: new Map(),
}))

jest.mock('../../../../src/p2p/CycleCreator', () => ({
  currentQuarter: 1,
  currentCycle: 1,
}))

jest.mock('../../../../src/p2p/CycleChain', () => ({
  newest: {
    joinedConsensors: [],
  },
}))

jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
  },
}))

jest.mock('../../../../src/logger', () => ({
  logFlags: {
    error: true,
  },
}))

jest.mock('../../../../src/utils', () => ({
  validateTypes: jest.fn(),
}))

jest.mock('../../../../src/p2p/Join/v2', () => ({
  getStandbyNodesInfoMap: jest.fn(),
}))

// Mock all the heavy imports that cause problems
jest.mock('../../../../src/shardus/index', () => ({}))
jest.mock('../../../../src/p2p/Context', () => ({
  setDefaultConfigs: jest.fn(),
  logger: {
    getLogger: jest.fn().mockReturnValue({
      mainLog_debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })
  },
  config: {},
  crypto: {},
}))

jest.mock('@shardeum-foundation/lib-types', () => ({
  P2P: {
    NodeListTypes: {},
    CycleCreatorTypes: {},
  },
}))

// Now import the function under test
import { checkGossipPayload } from '../../../../src/utils/GossipValidation'

describe('GossipValidation', () => {
  let mockNodeList: any
  let mockCycleCreator: any
  let mockCycleChain: any
  let mockNestedCounters: any
  let mockLogFlags: any
  let mockUtils: any
  let mockGetStandbyNodesInfoMap: any

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Reset mocks
    mockWarn.mockClear()
    
    // Get mocked modules
    mockNodeList = require('../../../../src/p2p/NodeList')
    mockCycleCreator = require('../../../../src/p2p/CycleCreator')
    mockCycleChain = require('../../../../src/p2p/CycleChain')
    mockNestedCounters = require('../../../../src/utils/nestedCounters')
    mockLogFlags = require('../../../../src/logger')
    mockUtils = require('../../../../src/utils')
    mockGetStandbyNodesInfoMap = require('../../../../src/p2p/Join/v2').getStandbyNodesInfoMap
    
    // Set default values
    mockCycleCreator.currentQuarter = 1
    mockCycleCreator.currentCycle = 1
    mockLogFlags.logFlags.error = true
    mockNodeList.byPubKey = new Map()
    mockCycleChain.newest = { joinedConsensors: [] }
    mockGetStandbyNodesInfoMap.mockReturnValue(new Map())
    mockUtils.validateTypes.mockReturnValue(null)
  })

  describe('checkGossipPayload', () => {
    const validPayload = {
      nodeId: 'test-node-id',
      nodeInfo: { 
        id: 'test-node', 
        publicKey: 'test-pub-key',
        ip: '127.0.0.1',
        port: 9001
      },
      sign: {
        owner: 'test-owner',
        sig: 'test-signature'
      },
      cycleNumber: 1
    }

    const validationSchema = {
      nodeId: 's',
      nodeInfo: 'o',
      sign: 'o',
      cycleNumber: 'n'
    }

    const logContext = 'test-gossip'
    const sender = 'test-sender'

    it('should return false when payload is missing', () => {
      const result = checkGossipPayload(null as any, validationSchema, logContext, sender)
      
      expect(result).toBe(false)
      expect(mockWarn).toHaveBeenCalledWith(`${logContext}-reject: missing payload`)
    })

    it('should return false when current quarter is not 1 or 2', () => {
      mockCycleCreator.currentQuarter = 3
      
      const result = checkGossipPayload(validPayload, validationSchema, logContext, sender)
      
      expect(result).toBe(false)
      expect(mockNestedCounters.nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'p2p',
        `${logContext}-reject: not in Q1 or Q2. currentCycle: ${mockCycleCreator.currentCycle} `
      )
      expect(mockWarn).toHaveBeenCalledWith(
        `${logContext}-reject: not in Q1 or Q2, currentQuarter: ${mockCycleCreator.currentQuarter}`
      )
    })

    it('should accept gossip in quarter 1', () => {
      mockCycleCreator.currentQuarter = 1
      mockNodeList.byPubKey.set('test-owner', { id: 'test-sender' })
      
      const result = checkGossipPayload(validPayload, validationSchema, logContext, sender)
      
      expect(result).toBe(true)
    })

    it('should accept gossip in quarter 2', () => {
      mockCycleCreator.currentQuarter = 2
      mockNodeList.byPubKey.set('test-owner', { id: 'different-sender' })
      
      const result = checkGossipPayload(validPayload, validationSchema, logContext, sender)
      
      expect(result).toBe(true)
    })

    it('should handle gossip-unjoin context with joined consensor', () => {
      mockCycleChain.newest.joinedConsensors = [{ publicKey: 'test-owner' }]
      mockNodeList.byPubKey.set('test-owner', { id: 'test-sender' })
      
      const result = checkGossipPayload(validPayload, validationSchema, 'gossip-unjoin', sender)
      
      expect(result).toBe(true)
    })

    it('should handle gossip-unjoin context with standby node', () => {
      mockCycleChain.newest.joinedConsensors = []
      const standbyMap = new Map()
      standbyMap.set('test-owner', { id: 'test-sender' })
      mockGetStandbyNodesInfoMap.mockReturnValue(standbyMap)
      
      const result = checkGossipPayload(validPayload, validationSchema, 'gossip-unjoin', sender)
      
      expect(result).toBe(true)
    })

    it('should return false for gossip-unjoin from unknown joined consensor', () => {
      mockCycleChain.newest.joinedConsensors = [{ publicKey: 'test-owner' }]
      mockNodeList.byPubKey.set('test-owner', null)
      
      const result = checkGossipPayload(validPayload, validationSchema, 'gossip-unjoin', sender)
      
      expect(result).toBe(false)
      expect(mockWarn).toHaveBeenCalledWith(
        'gossip-unjoin: Got gossip-unjoin from standby node that was selected to join, but can\'t find it in NodeList.byPubKey'
      )
    })

    it('should return false for gossip-unjoin from unknown standby node', () => {
      mockCycleChain.newest.joinedConsensors = []
      mockGetStandbyNodesInfoMap.mockReturnValue(new Map())
      
      const result = checkGossipPayload(validPayload, validationSchema, 'gossip-unjoin', sender)
      
      expect(result).toBe(false)
      expect(mockWarn).toHaveBeenCalledWith('gossip-unjoin: Got gossip-unjoin from unknown standby node')
    })

    it('should return false for gossip from unknown node (non-unjoin)', () => {
      mockNodeList.byPubKey.set('test-owner', null)
      
      const result = checkGossipPayload(validPayload, validationSchema, logContext, sender)
      
      expect(result).toBe(false)
      expect(mockWarn).toHaveBeenCalledWith(`${logContext}: Got ${logContext} from unknown node`)
    })

    it('should reject original sender gossip in quarter > 1', () => {
      mockCycleCreator.currentQuarter = 2
      mockNodeList.byPubKey.set('test-owner', { id: sender })
      
      const result = checkGossipPayload(validPayload, validationSchema, logContext, sender)
      
      expect(result).toBe(false)
      expect(mockNestedCounters.nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'p2p',
        `${logContext}-reject: CycleCreator.currentQuarter > 1, currentQuarter: ${mockCycleCreator.currentQuarter}`
      )
    })

    it('should return false when payload validation fails', () => {
      mockNodeList.byPubKey.set('test-owner', { id: 'different-sender' })
      mockUtils.validateTypes.mockReturnValue('validation error')
      
      const result = checkGossipPayload(validPayload, validationSchema, logContext, sender)
      
      expect(result).toBe(false)
      expect(mockWarn).toHaveBeenCalledWith(`${logContext}-reject: bad input validation error`)
    })

    it('should return false when sign validation fails', () => {
      mockNodeList.byPubKey.set('test-owner', { id: 'different-sender' })
      mockUtils.validateTypes
        .mockReturnValueOnce(null) // First call for payload validation
        .mockReturnValueOnce('sign validation error') // Second call for sign validation
      
      const result = checkGossipPayload(validPayload, validationSchema, logContext, sender)
      
      expect(result).toBe(false)
      expect(mockWarn).toHaveBeenCalledWith(`${logContext}-reject: bad input sign sign validation error`)
    })

    it('should return false when sign is missing from schema', () => {
      mockNodeList.byPubKey.set('test-owner', { id: 'different-sender' })
      
      const schemaWithoutSign = {
        nodeId: 's',
        nodeInfo: 'o',
        cycleNumber: 'n'
      }
      
      const result = checkGossipPayload(validPayload, schemaWithoutSign, logContext, sender)
      
      expect(result).toBe(false)
      expect(mockWarn).toHaveBeenCalledWith(`${logContext}-reject: missing sign`)
    })

    it('should not log when error logging is disabled', () => {
      mockLogFlags.logFlags.error = false
      
      const result = checkGossipPayload(null as any, validationSchema, logContext, sender)
      
      expect(result).toBe(false)
      expect(mockWarn).not.toHaveBeenCalled()
    })

    it('should validate sign structure when sign is in schema', () => {
      mockNodeList.byPubKey.set('test-owner', { id: 'different-sender' })
      
      const result = checkGossipPayload(validPayload, validationSchema, logContext, sender)
      
      expect(result).toBe(true)
      expect(mockUtils.validateTypes).toHaveBeenCalledWith(validPayload.sign, {
        owner: 's',
        sig: 's',
      })
    })
  })
})