import * as RefuteCacheSync from '../../../../src/p2p/RefuteCacheSync'
import * as RefuteCycleCache from '../../../../src/p2p/RefuteCycleCache'
import * as Network from '../../../../src/network'
import { config } from '../../../../src/p2p/Context'
import { Node } from '@shardeum-foundation/lib-types/build/src/p2p/NodeListTypes'

// Mock dependencies
jest.mock('../../../../src/p2p/Context', () => ({
  config: {
    p2p: {
      enableProblematicNodeRemoval: true,
      enableRefuteCacheSync: true,
      requireRefuteCacheConsensus: 3,
      refuteCacheSyncTimeoutMs: 30000,
      minCyclesBeforeRemovalParticipation: 10,
      bootstrapCyclesBeforeRemoval: 20
    },
    nodelistHash: 'test-node-id'
  }
}))

jest.mock('../../../../src/logger', () => ({
  logFlags: {
    p2pNonFatal: false
  }
}))

jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
    countRareEvent: jest.fn()
  }
}))

jest.mock('../../../../src/network', () => ({
  registerExternalGet: jest.fn(),
  askBinary: jest.fn()
}))

jest.mock('../../../../src/p2p/RefuteCycleCache')

describe('RefuteCacheSync Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    config.p2p.enableProblematicNodeRemoval = true
    config.p2p.enableRefuteCacheSync = true
  })

  describe('init', () => {
    it('should register network routes', () => {
      RefuteCacheSync.init()
      
      expect(Network.registerExternalGet).toHaveBeenCalledWith(
        'refute-cache-state',
        expect.any(Function)
      )
    })
  })

  describe('syncRefuteCache', () => {
    const mockNodes: Node[] = [
      { id: 'node1', publicKey: 'pk1' } as Node,
      { id: 'node2', publicKey: 'pk2' } as Node,
      { id: 'node3', publicKey: 'pk3' } as Node,
      { id: 'node4', publicKey: 'pk4' } as Node,
      { id: 'node5', publicKey: 'pk5' } as Node,
      { id: 'node6', publicKey: 'pk6' } as Node
    ]

    const mockCacheState: RefuteCycleCache.RefuteCacheState = {
      cycleNumber: 100,
      cacheData: [
        { cycle: 80, refutedNodes: ['nodeA', 'nodeB'] },
        { cycle: 90, refutedNodes: ['nodeC'] }
      ],
      checksum: 'mock-checksum-123'
    }

    it('should return false if sync is disabled', async () => {
      config.p2p.enableRefuteCacheSync = false
      
      const result = await RefuteCacheSync.syncRefuteCache(mockNodes, 100)
      
      expect(result).toBe(false)
      expect(Network.askBinary).not.toHaveBeenCalled()
    })

    it('should successfully sync when consensus is reached', async () => {
      // Mock successful responses from nodes with same checksum
      const mockResponse = {
        success: true,
        cacheState: mockCacheState,
        responderNodeId: 'node1',
        timestamp: Date.now()
      }
      
      ;(Network.askBinary as jest.Mock).mockResolvedValue(mockResponse)
      ;(RefuteCycleCache.importCacheState as jest.Mock).mockReturnValue(true)
      ;(RefuteCycleCache.getCacheCompleteness as jest.Mock).mockReturnValue(0.9)
      
      const result = await RefuteCacheSync.syncRefuteCache(mockNodes, 100)
      
      expect(result).toBe(true)
      expect(Network.askBinary).toHaveBeenCalledTimes(6) // 2x consensus requirement
      expect(RefuteCycleCache.importCacheState).toHaveBeenCalledWith(mockCacheState)
    })

    it('should return false when insufficient responses', async () => {
      // Mock some failed responses
      ;(Network.askBinary as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockRejectedValueOnce(new Error('Node down'))
        .mockResolvedValue({
          success: false,
          error: 'No cache available',
          responderNodeId: 'node4',
          timestamp: Date.now()
        })
      
      const result = await RefuteCacheSync.syncRefuteCache(mockNodes, 100)
      
      expect(result).toBe(false)
      expect(RefuteCycleCache.importCacheState).not.toHaveBeenCalled()
    })

    it('should return false when no consensus on checksum', async () => {
      // Mock responses with different checksums
      const responses = [
        {
          success: true,
          cacheState: { ...mockCacheState, checksum: 'checksum1' },
          responderNodeId: 'node1',
          timestamp: Date.now()
        },
        {
          success: true,
          cacheState: { ...mockCacheState, checksum: 'checksum2' },
          responderNodeId: 'node2',
          timestamp: Date.now()
        },
        {
          success: true,
          cacheState: { ...mockCacheState, checksum: 'checksum3' },
          responderNodeId: 'node3',
          timestamp: Date.now()
        }
      ]
      
      ;(Network.askBinary as jest.Mock)
        .mockResolvedValueOnce(responses[0])
        .mockResolvedValueOnce(responses[1])
        .mockResolvedValueOnce(responses[2])
        .mockResolvedValueOnce(responses[0])
        .mockResolvedValueOnce(responses[1])
        .mockResolvedValueOnce(responses[2])
      
      const result = await RefuteCacheSync.syncRefuteCache(mockNodes, 100)
      
      expect(result).toBe(false)
      expect(RefuteCycleCache.importCacheState).not.toHaveBeenCalled()
    })

    it('should handle import failure gracefully', async () => {
      const mockResponse = {
        success: true,
        cacheState: mockCacheState,
        responderNodeId: 'node1',
        timestamp: Date.now()
      }
      
      ;(Network.askBinary as jest.Mock).mockResolvedValue(mockResponse)
      ;(RefuteCycleCache.importCacheState as jest.Mock).mockReturnValue(false)
      
      const result = await RefuteCacheSync.syncRefuteCache(mockNodes, 100)
      
      expect(result).toBe(false)
    })
  })

  describe('canParticipateInRemovalDecisions', () => {
    it('should return false if problematic node removal is disabled', () => {
      config.p2p.enableProblematicNodeRemoval = false
      
      const result = RefuteCacheSync.canParticipateInRemovalDecisions(50)
      
      expect(result).toBe(false)
    })

    it('should return false if node is not ready', () => {
      ;(RefuteCycleCache.getCacheCompleteness as jest.Mock).mockReturnValue(0.5)
      
      const result = RefuteCacheSync.canParticipateInRemovalDecisions(5)
      
      expect(result).toBe(false)
    })

    it('should return true if node is ready', () => {
      ;(RefuteCycleCache.getCacheCompleteness as jest.Mock).mockReturnValue(0.85)
      config.p2p.minCyclesBeforeRemovalParticipation = 10
      
      const result = RefuteCacheSync.canParticipateInRemovalDecisions(20)
      
      expect(result).toBe(true)
    })
  })

  describe('getParticipatingNodes', () => {
    const mockActiveNodes: Node[] = [
      { id: 'node1', publicKey: 'pk1' } as Node,
      { id: 'node2', publicKey: 'pk2' } as Node,
      { id: 'node3', publicKey: 'pk3' } as Node
    ]

    it('should return empty array during bootstrap period', () => {
      config.p2p.bootstrapCyclesBeforeRemoval = 20
      
      const result = RefuteCacheSync.getParticipatingNodes(mockActiveNodes, 10)
      
      expect(result).toEqual([])
    })

    it('should return all node IDs after bootstrap period', () => {
      config.p2p.bootstrapCyclesBeforeRemoval = 20
      
      const result = RefuteCacheSync.getParticipatingNodes(mockActiveNodes, 25)
      
      expect(result).toEqual(['node1', 'node2', 'node3'])
    })
  })

  describe('updateOurReadiness', () => {
    it('should update readiness based on cache completeness', () => {
      ;(RefuteCycleCache.getCacheCompleteness as jest.Mock).mockReturnValue(0.85)
      config.p2p.minCyclesBeforeRemovalParticipation = 10
      
      RefuteCacheSync.updateOurReadiness(15)
      
      expect(RefuteCacheSync.canParticipateInRemovalDecisions(15)).toBe(true)
    })

    it('should not be ready if cache completeness is too low', () => {
      ;(RefuteCycleCache.getCacheCompleteness as jest.Mock).mockReturnValue(0.7)
      
      RefuteCacheSync.updateOurReadiness(50)
      
      expect(RefuteCacheSync.canParticipateInRemovalDecisions(50)).toBe(false)
    })

    it('should not be ready if not enough cycles have passed', () => {
      ;(RefuteCycleCache.getCacheCompleteness as jest.Mock).mockReturnValue(0.9)
      config.p2p.minCyclesBeforeRemovalParticipation = 10
      
      RefuteCacheSync.updateOurReadiness(5)
      
      expect(RefuteCacheSync.canParticipateInRemovalDecisions(5)).toBe(false)
    })
  })
})