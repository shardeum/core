import { EventEmitter } from 'events'
import { P2P, p2p } from '../../../../src/p2p/Wrapper'
import * as Comms from '../../../../src/p2p/Comms'
import * as Utils from '../../../../src/p2p/Utils'
import * as Self from '../../../../src/p2p/Self'
import * as NodeList from '../../../../src/p2p/NodeList'
import * as CycleChain from '../../../../src/p2p/CycleChain'
import * as CycleCreator from '../../../../src/p2p/CycleCreator'
import * as CycleAutoScale from '../../../../src/p2p/CycleAutoScale'
import { apoptosizeSelf } from '../../../../src/p2p/Apoptosis'
import { getNodeRequestingJoin } from '../../../../src/p2p/Join'
import * as utils from '../../../../src/utils'
import { logFlags } from '../../../../src/logger'

jest.mock('../../../../src/p2p/Comms')
jest.mock('../../../../src/p2p/Utils')
jest.mock('../../../../src/p2p/Self')
jest.mock('../../../../src/p2p/NodeList')
jest.mock('../../../../src/p2p/CycleChain')
jest.mock('../../../../src/p2p/CycleCreator')
jest.mock('../../../../src/p2p/CycleAutoScale')
jest.mock('../../../../src/p2p/Apoptosis')
jest.mock('../../../../src/p2p/Join')
jest.mock('../../../../src/utils', () => ({
  binarySearch: jest.fn(),
  propComparator: jest.fn(),
  makeShortHash: jest.fn(),
  stringifyReduce: jest.fn(),
  deepCopy: jest.fn()
}))
jest.mock('../../../../src/logger', () => ({
  logFlags: { console: false }
}))

jest.mock('../../../../src/p2p/Context', () => ({
  config: {
    p2p: {
      minNodesToAllowTxs: 3,
      useNTPOffsets: false
    }
  },
  setDefaultConfigs: jest.fn()
}))

jest.mock('../../../../src/network', () => ({
  ipInfo: {
    externalIp: '127.0.0.1',
    externalPort: 9001,
    internalIp: '127.0.0.1',
    internalPort: 9001
  },
  shardusGetTime: jest.fn(() => Date.now())
}))

describe('P2P Class', () => {
  let p2pInstance: P2P

  beforeEach(() => {
    jest.clearAllMocks()
    p2pInstance = new P2P()
  })

  describe('constructor', () => {
    it('should initialize all communication methods from Comms', () => {
      expect(p2pInstance.registerInternal).toBe(Comms.registerInternal)
      expect(p2pInstance.registerInternalBinary).toBe(Comms.registerInternalBinary)
      expect(p2pInstance.registerGossipHandler).toBe(Comms.registerGossipHandler)
      expect(p2pInstance.unregisterGossipHandler).toBe(Comms.unregisterGossipHandler)
      expect(p2pInstance.unregisterInternal).toBe(Comms.unregisterInternal)
      expect(p2pInstance.ask).toBe(Comms.ask)
      expect(p2pInstance.askBinary).toBe(Comms.askBinary)
      expect(p2pInstance.tell).toBe(Comms.tell)
      expect(p2pInstance.tellBinary).toBe(Comms.tellBinary)
      expect(p2pInstance.sendGossipIn).toBe(Comms.sendGossip)
      expect(p2pInstance.sendGossipAll).toBe(Comms.sendGossipAll)
      expect(p2pInstance.robustQuery).toBe(Utils.robustQuery)
    })

    it('should inherit from EventEmitter', () => {
      expect(p2pInstance).toBeInstanceOf(EventEmitter)
    })
  })

  describe('getters', () => {
    describe('isFirstSeed', () => {
      it('should return Self.isFirst', () => {
        ;(Self as any).isFirst = true
        expect(p2pInstance.isFirstSeed).toBe(true)
        
        ;(Self as any).isFirst = false
        expect(p2pInstance.isFirstSeed).toBe(false)
      })
    })

    describe('isActive', () => {
      it('should return Self.isActive', () => {
        ;(Self as any).isActive = true
        expect(p2pInstance.isActive).toBe(true)
        
        ;(Self as any).isActive = false
        expect(p2pInstance.isActive).toBe(false)
      })
    })

    describe('id', () => {
      it('should return Self.id', () => {
        ;(Self as any).id = 'test-id-123'
        expect(p2pInstance.id).toBe('test-id-123')
      })
    })
  })

  describe('getNodeId', () => {
    it('should return Self.id', () => {
      ;(Self as any).id = 'node-id-456'
      expect(p2pInstance.getNodeId()).toBe('node-id-456')
    })
  })

  describe('initApoptosis', () => {
    it('should call apoptosizeSelf with message', () => {
      const message = 'shutting down'
      p2pInstance.initApoptosis(message)
      expect(apoptosizeSelf).toHaveBeenCalledWith(message, undefined)
    })

    it('should call apoptosizeSelf with message and userFriendlyMessage', () => {
      const message = 'shutting down'
      const userFriendlyMessage = 'Node is restarting'
      p2pInstance.initApoptosis(message, userFriendlyMessage)
      expect(apoptosizeSelf).toHaveBeenCalledWith(message, userFriendlyMessage)
    })
  })

  describe('allowTransactions', () => {

    it('should return true when active nodes >= minNodesToAllowTxs', () => {
      ;(NodeList as any).activeByIdOrder = { length: 5 }
      expect(p2pInstance.allowTransactions()).toBe(true)
    })

    it('should return false when active nodes < minNodesToAllowTxs', () => {
      ;(NodeList as any).activeByIdOrder = { length: 2 }
      expect(p2pInstance.allowTransactions()).toBe(false)
    })

    it('should return true when active nodes equals minNodesToAllowTxs', () => {
      ;(NodeList as any).activeByIdOrder = { length: 3 }
      expect(p2pInstance.allowTransactions()).toBe(true)
    })
  })

  describe('allowSet', () => {
    it('should return true when only one active node', () => {
      ;(NodeList as any).activeByIdOrder = { length: 1 }
      expect(p2pInstance.allowSet()).toBe(true)
    })

    it('should return false when multiple active nodes', () => {
      ;(NodeList as any).activeByIdOrder = { length: 2 }
      expect(p2pInstance.allowSet()).toBe(false)
    })

    it('should return false when no active nodes', () => {
      ;(NodeList as any).activeByIdOrder = { length: 0 }
      expect(p2pInstance.allowSet()).toBe(false)
    })
  })

  describe('setJoinRequestToggle', () => {
    it('should accept boolean parameter without error', () => {
      expect(() => p2pInstance.setJoinRequestToggle(true)).not.toThrow()
      expect(() => p2pInstance.setJoinRequestToggle(false)).not.toThrow()
    })
  })

  describe('getLatestCycles', () => {
    it('should return all cycles when requested amount exceeds available', () => {
      const mockCycles = [{ id: 1 }, { id: 2 }, { id: 3 }]
      ;(CycleChain as any).cycles = mockCycles
      
      const result = p2pInstance.getLatestCycles(5)
      expect(result).toBe(mockCycles)
    })

    it('should return last N cycles when requested amount is less than available', () => {
      const mockCycles = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]
      ;(CycleChain as any).cycles = mockCycles
      
      const result = p2pInstance.getLatestCycles(3)
      expect(result).toEqual([{ id: 3 }, { id: 4 }, { id: 5 }])
    })

    it('should return empty array when no cycles available', () => {
      ;(CycleChain as any).cycles = []
      
      const result = p2pInstance.getLatestCycles(2)
      expect(result).toEqual([])
    })
  })

  describe('shutdown', () => {
    it('should call CycleCreator.shutdown', () => {
      p2pInstance.shutdown()
      expect(CycleCreator.shutdown).toHaveBeenCalled()
    })
  })

  describe('configUpdated', () => {
    it('should call CycleAutoScale.configUpdated', () => {
      p2pInstance.configUpdated()
      expect(CycleAutoScale.configUpdated).toHaveBeenCalled()
    })
  })
})

describe('State Class', () => {
  let state: any

  beforeEach(() => {
    jest.clearAllMocks()
    // Access state through p2p.state since State class is not exported
    state = p2p.state
  })

  describe('constructor', () => {
    it('should inherit from EventEmitter', () => {
      expect(state).toBeInstanceOf(EventEmitter)
    })
  })

  describe('getNode', () => {
    it('should return node from NodeList.nodes', () => {
      const mockNode = { id: 'test-node', status: 'active' }
      const mockNodesMap = new Map([['test-id', mockNode]])
      ;(NodeList as any).nodes = mockNodesMap

      const result = state.getNode('test-id')
      expect(result).toBe(mockNode)
    })

    it('should return undefined for non-existent node', () => {
      const mockNodesMap = new Map()
      ;(NodeList as any).nodes = mockNodesMap

      const result = state.getNode('non-existent')
      expect(result).toBeUndefined()
    })
  })

  describe('getRemovedNodePubKeyFromCache', () => {
    it('should call NodeList.getRemovedNodePubKeyFromCache', () => {
      const mockPubKey = 'test-pub-key'
      ;(NodeList.getRemovedNodePubKeyFromCache as jest.Mock).mockReturnValue(mockPubKey)

      const result = state.getRemovedNodePubKeyFromCache('test-id')
      expect(NodeList.getRemovedNodePubKeyFromCache).toHaveBeenCalledWith('test-id')
      expect(result).toBe(mockPubKey)
    })
  })

  describe('getNodes', () => {
    it('should return NodeList.nodes', () => {
      const mockNodes = new Map([['id1', { id: 'id1' }]])
      ;(NodeList as any).nodes = mockNodes

      const result = state.getNodes()
      expect(result).toBe(mockNodes)
    })
  })

  describe('getNodesRequestingJoin', () => {
    it('should call getNodeRequestingJoin', () => {
      const mockJoiningNodes = [{ id: 'joining-node' }]
      ;(getNodeRequestingJoin as jest.Mock).mockReturnValue(mockJoiningNodes)

      const result = state.getNodesRequestingJoin()
      expect(getNodeRequestingJoin).toHaveBeenCalled()
      expect(result).toBe(mockJoiningNodes)
    })
  })

  describe('getNodeByPubKey', () => {
    it('should return node when pubkey exists', () => {
      const mockNode = { id: 'test-node' }
      const mockByPubKey = new Map([['test-pubkey', mockNode]])
      ;(NodeList as any).byPubKey = mockByPubKey

      const result = state.getNodeByPubKey('test-pubkey')
      expect(result).toBe(mockNode)
    })

    it('should log warning and return undefined when pubkey not found', () => {
      const mockByPubKey = new Map()
      ;(NodeList as any).byPubKey = mockByPubKey
      ;(logFlags as any).console = true
      ;(utils.makeShortHash as jest.Mock).mockReturnValue('short-hash')
      ;(utils.stringifyReduce as jest.Mock).mockReturnValue('stringified-keys')

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      const result = state.getNodeByPubKey('non-existent-key')
      
      expect(result).toBeUndefined()
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('getActiveNodes', () => {
    it('should return activeOthersByIdOrder when id provided', () => {
      const mockActiveOthers = { 'id1': { id: 'id1' }, 'id2': { id: 'id2' } }
      ;(NodeList as any).activeOthersByIdOrder = mockActiveOthers

      const result = state.getActiveNodes('self-id')
      expect(result).toEqual(Object.values(mockActiveOthers))
    })

    it('should return activeByIdOrder when no id provided', () => {
      const mockActiveAll = { 'id1': { id: 'id1' }, 'id2': { id: 'id2' }, 'self': { id: 'self' } }
      ;(NodeList as any).activeByIdOrder = mockActiveAll

      const result = state.getActiveNodes()
      expect(result).toEqual(Object.values(mockActiveAll))
    })
  })

  describe('getOrderedSyncingNeighbors', () => {
    it('should return syncing nodes excluding self', () => {
      const mockNodes = [
        { id: 'node1', status: 'syncing' },
        { id: 'node2', status: 'active' },
        { id: 'node3', status: 'syncing' }
      ]
      ;(NodeList as any).othersByIdOrder = mockNodes

      const result = state.getOrderedSyncingNeighbors('any-node')
      expect(result).toEqual([
        { id: 'node1', status: 'syncing' },
        { id: 'node3', status: 'syncing' }
      ])
    })

    it('should return empty array when no syncing nodes', () => {
      const mockNodes = [
        { id: 'node1', status: 'active' },
        { id: 'node2', status: 'ready' }
      ]
      ;(NodeList as any).othersByIdOrder = mockNodes

      const result = state.getOrderedSyncingNeighbors('any-node')
      expect(result).toEqual([])
    })
  })

  describe('getLastCycle', () => {
    it('should return CycleChain.newest', () => {
      const mockCycle = { counter: 100, timestamp: Date.now() }
      ;(CycleChain as any).newest = mockCycle

      const result = state.getLastCycle()
      expect(result).toBe(mockCycle)
    })
  })

  describe('getCycleByCounter', () => {
    it('should return cycle when found', () => {
      const mockCycles = [
        { counter: 98 },
        { counter: 99 },
        { counter: 100 }
      ]
      const mockComparator = jest.fn()
      ;(CycleChain as any).cycles = mockCycles
      ;(utils.binarySearch as jest.Mock).mockReturnValue(1)
      ;(utils.propComparator as jest.Mock).mockReturnValue(mockComparator)

      const result = state.getCycleByCounter(99)
      expect(utils.propComparator).toHaveBeenCalledWith('counter')
      expect(utils.binarySearch).toHaveBeenCalledWith(mockCycles, { counter: 99 }, mockComparator)
      expect(result).toBe(mockCycles[1])
    })

    it('should return null when cycle not found', () => {
      const mockCycles = [{ counter: 98 }, { counter: 100 }]
      ;(CycleChain as any).cycles = mockCycles
      ;(utils.binarySearch as jest.Mock).mockReturnValue(-1)

      const result = state.getCycleByCounter(99)
      expect(result).toBeNull()
    })
  })

  describe('getCycleByTimestamp', () => {
    it('should return cycle when timestamp falls within cycle duration', () => {
      const mockCycles = [
        { start: 1000, duration: 30 },
        { start: 1030, duration: 30 },
        { start: 1060, duration: 30 }
      ]
      ;(CycleChain as any).cycles = mockCycles
      ;(utils.binarySearch as jest.Mock).mockReturnValue(1)

      const result = state.getCycleByTimestamp(1045000) // 1045 seconds * 1000 ms
      expect(result).toBe(mockCycles[1])
    })

    it('should return null when timestamp does not fall within any cycle', () => {
      const mockCycles = [{ start: 1000, duration: 30 }]
      ;(CycleChain as any).cycles = mockCycles
      ;(utils.binarySearch as jest.Mock).mockReturnValue(-1)

      const result = state.getCycleByTimestamp(2000000) // 2000 seconds * 1000 ms
      expect(result).toBeNull()
    })
  })
})

describe('p2p instance', () => {
  it('should be an instance of P2P class', () => {
    expect(p2p).toBeInstanceOf(P2P)
  })

  it('should have state property', () => {
    expect(p2p.state).toBeDefined()
    expect(p2p.state).toBeInstanceOf(EventEmitter)
  })
})

describe('getSubsetOfNodeList', () => {
  // Access the internal function through module for testing
  const getSubsetOfNodeList = require('../../../../src/p2p/Wrapper').__testing?.getSubsetOfNodeList

  if (getSubsetOfNodeList) {
    it('should return all nodes when no self provided', () => {
      const nodes = { id1: { id: 'id1' }, id2: { id: 'id2' } }
      const result = getSubsetOfNodeList(nodes)
      expect(result).toEqual(Object.values(nodes))
    })

    it('should return nodes excluding self', () => {
      const nodes = { id1: { id: 'id1' }, self: { id: 'self' }, id2: { id: 'id2' } }
      ;(utils.deepCopy as jest.Mock).mockReturnValue({ id1: { id: 'id1' }, id2: { id: 'id2' } })
      
      const result = getSubsetOfNodeList(nodes, 'self')
      expect(result).toEqual([{ id: 'id1' }, { id: 'id2' }])
    })
  }
})