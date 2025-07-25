import * as syncFinished from '../../../../../../src/p2p/Join/v2/syncFinished'
import * as NodeList from '../../../../../../src/p2p/NodeList'
import * as CycleChain from '../../../../../../src/p2p/CycleChain'
import { crypto } from '../../../../../../src/p2p/Context'
import { config } from '../../../../../../src/p2p/Context'
import { nestedCountersInstance } from '../../../../../../src/utils/nestedCounters'
import { logFlags } from '../../../../../../src/logger'
import * as Self from '../../../../../../src/p2p/Self'
import { FinishedSyncingRequest } from '@shardeum-foundation/lib-types/build/src/p2p/JoinTypes'
import { P2P } from '@shardeum-foundation/lib-types'

// Mock dependencies
jest.mock('../../../../../../src/p2p/NodeList')
jest.mock('../../../../../../src/p2p/CycleChain')
jest.mock('../../../../../../src/p2p/Context', () => ({
  crypto: {
    verify: jest.fn(),
    keypair: { publicKey: 'test-public-key' },
  },
  config: {},
  setDefaultConfigs: jest.fn(),
}))
jest.mock('../../../../../../src/utils/nestedCounters')
jest.mock('../../../../../../src/logger')
jest.mock('../../../../../../src/p2p/Self')
jest.mock('../../../../../../src/p2p/CycleCreator')
jest.mock('../../../../../../src/p2p/CycleAutoScale')
jest.mock('../../../../../../src/network', () => ({
  shardusGetTime: jest.fn(() => Date.now()),
}))
jest.mock('../../../../../../src/shardus', () => ({}))
jest.mock('../../../../../../src/index', () => ({}))

const mockedNodeList = NodeList as jest.Mocked<typeof NodeList>
const mockedCycleChain = CycleChain as jest.Mocked<typeof CycleChain>
const mockedCrypto = crypto as jest.Mocked<typeof crypto>
const mockedConfig = config as jest.Mocked<typeof config>
const mockedNestedCounters = nestedCountersInstance as jest.Mocked<typeof nestedCountersInstance>
const mockedLogFlags = logFlags as jest.Mocked<typeof logFlags>
const mockedSelf = Self as jest.Mocked<typeof Self>

describe('syncFinished', () => {
  beforeEach(() => {
    // Reset the module state
    syncFinished.newSyncFinishedNodes.clear()

    // Reset mocks
    jest.clearAllMocks()

    // Setup default mock returns
    mockedLogFlags.verbose = false
    mockedLogFlags.console = false
    mockedNestedCounters.countEvent = jest.fn()
    mockedCrypto.verify.mockReturnValue(true)
    mockedConfig.p2p = {
      allowActivePerCycle: 5,
      activeRecoveryEnabled: false,
      allowActivePerCycleRecover: 1,
    } as any
    mockedConfig.debug = {
      readyNodeDelay: 0,
    } as any
  })

  describe('addFinishedSyncing', () => {
    const mockRequest: FinishedSyncingRequest = {
      nodeId: 'test-node-id',
      cycleNumber: 100,
      sign: {
        owner: 'test-public-key',
        sig: 'test-signature',
      },
    }

    it('should successfully add a valid finished syncing request', () => {
      const mockNode = {
        id: 'test-node-id',
        publicKey: 'test-public-key',
        externalPort: 9001,
      } as unknown as P2P.NodeListTypes.Node
      mockedNodeList.byIdOrder = [mockNode]
      mockedCycleChain.getNewest = jest.fn().mockReturnValue({ counter: 100 })

      const result = syncFinished.addFinishedSyncing(mockRequest)

      expect(result.success).toBe(true)
      expect(result.reason).toBe('Node test-node-id added to syncFinishedNodesInfo map')
      expect(result.fatal).toBe(false)
      expect(syncFinished.newSyncFinishedNodes.has('test-node-id')).toBe(true)
      expect(mockedNestedCounters.countEvent).toHaveBeenCalledWith('syncFinished.ts', 'addFinishedSyncing(): success')
    })

    it('should fail when public keys do not match', () => {
      const mockNode = {
        id: 'test-node-id',
        publicKey: 'different-public-key',
        externalPort: 9001,
      } as unknown as P2P.NodeListTypes.Node
      mockedNodeList.byIdOrder = [mockNode]

      const result = syncFinished.addFinishedSyncing(mockRequest)

      expect(result.success).toBe(false)
      expect(result.reason).toBe('public key in addFinishedSyncing does not match public key of node')
      expect(result.fatal).toBe(false)
      expect(mockedNestedCounters.countEvent).toHaveBeenCalledWith(
        'syncFinished.ts',
        'addFinishedSyncing(): publicKeysMatch failed'
      )
    })

    it('should use crypto keypair public key when node is not found', () => {
      mockedNodeList.byIdOrder = []
      mockedCycleChain.getNewest = jest.fn().mockReturnValue({ counter: 100 })

      const result = syncFinished.addFinishedSyncing(mockRequest)

      expect(result.success).toBe(true)
      expect(syncFinished.newSyncFinishedNodes.has('test-node-id')).toBe(true)
    })

    it('should fail when cycle numbers do not match', () => {
      const mockNode = {
        id: 'test-node-id',
        publicKey: 'test-public-key',
        externalPort: 9001,
      } as unknown as P2P.NodeListTypes.Node
      mockedNodeList.byIdOrder = [mockNode]
      mockedCycleChain.getNewest = jest.fn().mockReturnValue({ counter: 99 })

      const result = syncFinished.addFinishedSyncing(mockRequest)

      expect(result.success).toBe(false)
      expect(result.reason).toBe('cycleNumber in request does not match cycleNumber of node')
      expect(result.fatal).toBe(false)
      expect(mockedNestedCounters.countEvent).toHaveBeenCalledWith(
        'syncFinished.ts',
        'addFinishedSyncing(): cycleNumber match failed'
      )
    })

    it('should fail when node already exists in the list', () => {
      const mockNode = {
        id: 'test-node-id',
        publicKey: 'test-public-key',
        externalPort: 9001,
      } as unknown as P2P.NodeListTypes.Node
      mockedNodeList.byIdOrder = [mockNode]
      mockedCycleChain.getNewest = jest.fn().mockReturnValue({ counter: 100 })

      // Add the node first
      syncFinished.newSyncFinishedNodes.set('test-node-id', mockRequest)

      const result = syncFinished.addFinishedSyncing(mockRequest)

      expect(result.success).toBe(false)
      expect(result.reason).toBe('node has already submitted syncFinished request')
      expect(result.fatal).toBe(false)
      expect(mockedNestedCounters.countEvent).toHaveBeenCalledWith(
        'syncFinished.ts',
        'addFinishedSyncing(): already in local list'
      )
    })

    it('should fail when signature verification fails', () => {
      const mockNode = {
        id: 'test-node-id',
        publicKey: 'test-public-key',
        externalPort: 9001,
      } as unknown as P2P.NodeListTypes.Node
      mockedNodeList.byIdOrder = [mockNode]
      mockedCycleChain.getNewest = jest.fn().mockReturnValue({ counter: 100 })
      mockedCrypto.verify = jest.fn().mockReturnValue(false)

      const result = syncFinished.addFinishedSyncing(mockRequest)

      expect(result.success).toBe(false)
      expect(result.reason).toBe('verification of syncFinished request failed')
      expect(result.fatal).toBe(false)
      expect(mockedNestedCounters.countEvent).toHaveBeenCalledWith(
        'syncFinished.ts',
        'addFinishedSyncing(): signature invalid'
      )
    })

    it('should log verbose messages when verbose flag is enabled', () => {
      mockedLogFlags.verbose = true
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      const mockNode = {
        id: 'test-node-id',
        publicKey: 'different-public-key',
        externalPort: 9001,
      } as unknown as P2P.NodeListTypes.Node
      mockedNodeList.byIdOrder = [mockNode]

      syncFinished.addFinishedSyncing(mockRequest)

      expect(consoleSpy).toHaveBeenCalledWith(
        'addFinishedSyncing(): public key in addFinishedSyncing does not match public key of node',
        'test-node-id'
      )

      consoleSpy.mockRestore()
    })

    it('should log console messages when console flag is enabled', () => {
      mockedLogFlags.console = true
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      const mockNode = {
        id: 'test-node-id',
        publicKey: 'test-public-key',
        externalPort: 9001,
      } as unknown as P2P.NodeListTypes.Node
      mockedNodeList.byIdOrder = [mockNode]
      mockedCycleChain.getNewest = jest.fn().mockReturnValue({ counter: 99 })

      syncFinished.addFinishedSyncing(mockRequest)

      expect(consoleSpy).toHaveBeenCalledWith(
        'addFinishedSyncing(): cycleNumber in request does not match cycleNumber of node',
        'test-node-id'
      )

      consoleSpy.mockRestore()
    })
  })

  describe('drainFinishedSyncingRequest', () => {
    it('should return all finished syncing requests and clear the map', () => {
      const mockRequest1: FinishedSyncingRequest = {
        nodeId: 'node-1',
        cycleNumber: 100,
        sign: { owner: 'key1', sig: 'sig1' },
      }
      const mockRequest2: FinishedSyncingRequest = {
        nodeId: 'node-2',
        cycleNumber: 100,
        sign: { owner: 'key2', sig: 'sig2' },
      }

      syncFinished.newSyncFinishedNodes.set('node-1', mockRequest1)
      syncFinished.newSyncFinishedNodes.set('node-2', mockRequest2)

      const result = syncFinished.drainFinishedSyncingRequest()

      expect(result).toHaveLength(2)
      expect(result).toContain(mockRequest1)
      expect(result).toContain(mockRequest2)
      expect(syncFinished.newSyncFinishedNodes.size).toBe(0)
    })

    it('should return empty array when no nodes are present', () => {
      const result = syncFinished.drainFinishedSyncingRequest()

      expect(result).toEqual([])
      expect(syncFinished.newSyncFinishedNodes.size).toBe(0)
    })
  })

  describe('isNodeSelectedReadyList', () => {
    const mockReadyNodes: P2P.NodeListTypes.Node[] = [
      { id: 'node-1', readyTimestamp: 1000 } as P2P.NodeListTypes.Node,
      { id: 'node-2', readyTimestamp: 2000 } as P2P.NodeListTypes.Node,
      { id: 'node-3', readyTimestamp: 3000 } as P2P.NodeListTypes.Node,
      { id: 'node-4', readyTimestamp: 4000 } as P2P.NodeListTypes.Node,
      { id: 'node-5', readyTimestamp: 5000 } as P2P.NodeListTypes.Node,
      { id: 'node-6', readyTimestamp: 6000 } as P2P.NodeListTypes.Node,
    ]

    beforeEach(() => {
      mockedNodeList.readyByTimeAndIdOrder = mockReadyNodes
    })

    it('should return true for node in first N positions when mode is processing', () => {
      mockedCycleChain.getNewest = jest.fn().mockReturnValue({ mode: 'processing' })
      mockedConfig.p2p.allowActivePerCycle = 3

      expect(syncFinished.isNodeSelectedReadyList('node-1')).toBe(true)
      expect(syncFinished.isNodeSelectedReadyList('node-2')).toBe(true)
      expect(syncFinished.isNodeSelectedReadyList('node-3')).toBe(true)
    })

    it('should return false for node beyond first N positions when mode is processing', () => {
      mockedCycleChain.getNewest = jest.fn().mockReturnValue({ mode: 'processing' })
      mockedConfig.p2p.allowActivePerCycle = 3

      expect(syncFinished.isNodeSelectedReadyList('node-4')).toBe(false)
      expect(syncFinished.isNodeSelectedReadyList('node-5')).toBe(false)
      expect(syncFinished.isNodeSelectedReadyList('node-6')).toBe(false)
    })

    it('should return true for any node in the list when mode is not processing', () => {
      mockedCycleChain.getNewest = jest.fn().mockReturnValue({ mode: 'forming' })

      expect(syncFinished.isNodeSelectedReadyList('node-1')).toBe(true)
      expect(syncFinished.isNodeSelectedReadyList('node-4')).toBe(true)
      expect(syncFinished.isNodeSelectedReadyList('node-6')).toBe(true)
    })

    it('should return false for node not in the list', () => {
      mockedCycleChain.getNewest = jest.fn().mockReturnValue({ mode: 'processing' })

      expect(syncFinished.isNodeSelectedReadyList('non-existent-node')).toBe(false)
    })
  })

  describe('selectNodesFromReadyList', () => {
    const mockReadyNodes: P2P.NodeListTypes.Node[] = [
      { id: 'node-1', readyTimestamp: 1000 } as P2P.NodeListTypes.Node,
      { id: 'node-2', readyTimestamp: 2000 } as P2P.NodeListTypes.Node,
      { id: 'node-3', readyTimestamp: 3000 } as P2P.NodeListTypes.Node,
      { id: 'node-4', readyTimestamp: 4000 } as P2P.NodeListTypes.Node,
      { id: 'node-5', readyTimestamp: 5000 } as P2P.NodeListTypes.Node,
    ]

    beforeEach(() => {
      mockedNodeList.readyByTimeAndIdOrder = mockReadyNodes
      mockedNodeList.activeByIdOrder = []
      mockedCycleChain.newest = {
        active: 10,
        desired: 15,
        start: 10000,
      } as any
    })

    it('should return first N nodes when mode is processing', () => {
      mockedConfig.p2p.allowActivePerCycle = 3

      const result = syncFinished.selectNodesFromReadyList('processing')

      expect(result).toHaveLength(3)
      expect(result[0].id).toBe('node-1')
      expect(result[1].id).toBe('node-2')
      expect(result[2].id).toBe('node-3')
    })

    it('should boost allowActivePerCycle when activeRecoveryEnabled and deficit exists', () => {
      mockedConfig.p2p.allowActivePerCycle = 2
      mockedConfig.p2p.activeRecoveryEnabled = true
      mockedConfig.p2p.allowActivePerCycleRecover = 3
      mockedCycleChain.newest = {
        active: 10,
        desired: 15,
        start: 10000,
      } as any

      const result = syncFinished.selectNodesFromReadyList('processing')

      expect(result).toHaveLength(3) // boost applied
    })

    it('should filter nodes by readyNodeDelay when configured in processing mode', () => {
      mockedConfig.p2p.allowActivePerCycle = 5
      mockedConfig.debug.readyNodeDelay = 2000
      mockedCycleChain.newest = { start: 5000 } as any

      const result = syncFinished.selectNodesFromReadyList('processing')

      expect(result).toHaveLength(3) // only node-1, node-2, and node-3 meet delay requirement (5000 >= timestamp + 2000)
      expect(result[0].id).toBe('node-1')
      expect(result[1].id).toBe('node-2')
      expect(result[2].id).toBe('node-3')
    })

    it('should return all ready nodes when mode is forming and isFirst with no active nodes', () => {
      mockedSelf.isFirst = true
      mockedNodeList.activeByIdOrder = []

      const result = syncFinished.selectNodesFromReadyList('forming')

      expect(result).toHaveLength(5)
      expect(result).toEqual(mockReadyNodes)
    })

    it('should filter by readyNodeDelay in non-processing modes', () => {
      mockedSelf.isFirst = false // ensure we don't hit the special forming condition
      mockedNodeList.activeByIdOrder = [{ id: 'active-node' } as unknown as P2P.NodeListTypes.Node] // ensure activeByIdOrder is not empty
      mockedConfig.debug.readyNodeDelay = 2000
      mockedCycleChain.newest = { start: 5000 } as any

      const result = syncFinished.selectNodesFromReadyList('forming')

      expect(result).toHaveLength(3) // only node-1, node-2, and node-3 meet delay requirement (5000 >= timestamp + 2000)
    })

    it('should return all ready nodes in non-processing modes without delay', () => {
      const result = syncFinished.selectNodesFromReadyList('forming')

      expect(result).toHaveLength(5)
      expect(result).toEqual(mockReadyNodes)
    })

    it('should log when readyNodeDelay is applied', () => {
      mockedConfig.debug.readyNodeDelay = 1000

      syncFinished.selectNodesFromReadyList('processing')

      expect(mockedNestedCounters.countEvent).toHaveBeenCalledWith(
        'p2p',
        'selectNodesFromReadyList: only returning nodes from the ready list that were added at least 1000 seconds ago'
      )
    })
  })
})
