import * as syncStarted from '../../../../../../src/p2p/Join/v2/syncStarted'
import { StartedSyncingRequest } from '@shardeum-foundation/lib-types/build/src/p2p/JoinTypes'
import { SignedObject } from '@shardeum-foundation/lib-types/build/src/p2p/P2PTypes'

// Mock all dependencies at the top level
jest.mock('../../../../../../src/logger', () => ({
  logFlags: { verbose: false },
}))

jest.mock('../../../../../../src/p2p/NodeList', () => ({
  byIdOrder: [{ id: 'node123', publicKey: 'publicKey123' }],
}))

jest.mock('../../../../../../src/p2p/CycleChain', () => ({
  getNewest: jest.fn().mockReturnValue({ counter: 100 }),
}))

jest.mock('../../../../../../src/p2p/Context', () => ({
  crypto: {
    verify: jest.fn().mockReturnValue(true),
  },
}))

let mockCurrentQuarter = 3
jest.mock('../../../../../../src/p2p/CycleCreator', () => ({
  get currentQuarter() {
    return mockCurrentQuarter
  },
}))

describe('syncStarted', () => {
  let mockStartedSyncingRequest: StartedSyncingRequest

  beforeEach(() => {
    mockStartedSyncingRequest = {
      nodeId: 'node123',
      cycleNumber: 100,
      sign: {
        owner: 'publicKey123',
        sig: 'signature123',
      },
    } as StartedSyncingRequest

    mockCurrentQuarter = 3

    // Reset module state
    syncStarted.nodesYetToStartSyncing.clear()
    syncStarted.lostAfterSelection.length = 0

    // Reset CycleChain mock
    const CycleChain = require('../../../../../../src/p2p/CycleChain')
    CycleChain.getNewest.mockReturnValue({ counter: 100 })

    // Reset crypto mock
    const { crypto } = require('../../../../../../src/p2p/Context')
    crypto.verify.mockReturnValue(true)

    // Clear the internal newSyncStarted map
    syncStarted.drainSyncStarted()
  })

  describe('addSyncStarted', () => {
    it('should successfully add sync started request when all checks pass', () => {
      const result = syncStarted.addSyncStarted(mockStartedSyncingRequest)

      expect(result.success).toBe(true)
      expect(result.reason).toBe('syncStarted passed all checks and verification')
      expect(result.fatal).toBe(false)
    })

    it('should fail when public keys do not match', () => {
      const request = { ...mockStartedSyncingRequest }
      request.sign.owner = 'differentPublicKey'

      const result = syncStarted.addSyncStarted(request)

      expect(result.success).toBe(false)
      expect(result.reason).toBe('public key in syncStarted request does not match public key of node')
      expect(result.fatal).toBe(false)
    })

    it('should fail when node is not found in NodeList', () => {
      const request = { ...mockStartedSyncingRequest }
      request.nodeId = 'unknownNode'

      const result = syncStarted.addSyncStarted(request)

      expect(result.success).toBe(false)
      expect(result.reason).toBe('public key in syncStarted request does not match public key of node')
      expect(result.fatal).toBe(false)
    })

    it('should fail when cycle numbers do not match', () => {
      const request = { ...mockStartedSyncingRequest }
      request.cycleNumber = 99

      const result = syncStarted.addSyncStarted(request)

      expect(result.success).toBe(false)
      expect(result.reason).toBe('cycle number in syncStarted request does not match current cycle number')
      expect(result.fatal).toBe(false)
    })

    it('should fail when node has already submitted syncStarted request', () => {
      // First request should succeed
      const result1 = syncStarted.addSyncStarted(mockStartedSyncingRequest)
      expect(result1.success).toBe(true)

      // Second request should fail
      const result2 = syncStarted.addSyncStarted(mockStartedSyncingRequest)
      expect(result2.success).toBe(false)
      expect(result2.reason).toBe('node has already submitted syncStarted request')
      expect(result2.fatal).toBe(false)
    })

    it('should fail when verification fails', () => {
      const { crypto } = require('../../../../../../src/p2p/Context')
      crypto.verify.mockReturnValueOnce(false)

      const result = syncStarted.addSyncStarted(mockStartedSyncingRequest)

      expect(result.success).toBe(false)
      expect(result.reason).toBe('verification of syncStarted request failed')
      expect(result.fatal).toBe(false)
    })
  })

  describe('drainSyncStarted', () => {
    it('should return empty array when not in quarter 3', () => {
      mockCurrentQuarter = 1

      // Add sync started request first
      syncStarted.addSyncStarted(mockStartedSyncingRequest)

      const result = syncStarted.drainSyncStarted()

      expect(result).toEqual([])
    })

    it('should return and clear sync started requests when in quarter 3', () => {
      mockCurrentQuarter = 3

      // Clear any existing state first
      syncStarted.drainSyncStarted()

      // Add sync started request
      syncStarted.addSyncStarted(mockStartedSyncingRequest)

      const result = syncStarted.drainSyncStarted()

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(mockStartedSyncingRequest)

      // Verify map is cleared - second call should return empty array
      const result2 = syncStarted.drainSyncStarted()
      expect(result2).toEqual([])
    })

    it('should sort results by nodeId', () => {
      mockCurrentQuarter = 3

      // Clear any existing state first
      syncStarted.drainSyncStarted()

      const request1 = { ...mockStartedSyncingRequest, nodeId: 'nodeC', sign: { ...mockStartedSyncingRequest.sign } }
      const request2 = { ...mockStartedSyncingRequest, nodeId: 'nodeA', sign: { ...mockStartedSyncingRequest.sign } }
      const request3 = { ...mockStartedSyncingRequest, nodeId: 'nodeB', sign: { ...mockStartedSyncingRequest.sign } }

      // Mock NodeList to include all nodes
      const NodeList = require('../../../../../../src/p2p/NodeList')
      NodeList.byIdOrder.push(
        { id: 'nodeA', publicKey: 'publicKey123' },
        { id: 'nodeB', publicKey: 'publicKey123' },
        { id: 'nodeC', publicKey: 'publicKey123' }
      )

      syncStarted.addSyncStarted(request1)
      syncStarted.addSyncStarted(request2)
      syncStarted.addSyncStarted(request3)

      const result = syncStarted.drainSyncStarted()

      expect(result).toHaveLength(3)
      expect(result[0].nodeId).toBe('nodeA')
      expect(result[1].nodeId).toBe('nodeB')
      expect(result[2].nodeId).toBe('nodeC')
    })
  })

  describe('drainLostAfterSelectionNodes', () => {
    it('should return empty array when not in quarter 3', () => {
      mockCurrentQuarter = 1

      // Manually set lostAfterSelection
      syncStarted.lostAfterSelection.push('node1', 'node2')

      const result = syncStarted.drainLostAfterSelectionNodes()

      expect(result).toEqual([])
    })

    it('should return and clear lost nodes when in quarter 3', () => {
      mockCurrentQuarter = 3

      // Clear any existing state
      syncStarted.lostAfterSelection.length = 0

      // Manually set lostAfterSelection
      syncStarted.lostAfterSelection.push('node1', 'node2')

      const result = syncStarted.drainLostAfterSelectionNodes()

      expect(result).toEqual(['node1', 'node2'])
      expect(syncStarted.lostAfterSelection).toHaveLength(0)
    })

    it('should sort the lost nodes', () => {
      mockCurrentQuarter = 3

      // Clear any existing state
      syncStarted.lostAfterSelection.length = 0

      syncStarted.lostAfterSelection.push('nodeC', 'nodeA', 'nodeB')

      const result = syncStarted.drainLostAfterSelectionNodes()

      expect(result).toEqual(['nodeA', 'nodeB', 'nodeC'])
    })

    it('should handle empty lostAfterSelection array', () => {
      mockCurrentQuarter = 3

      // Clear any existing state
      syncStarted.lostAfterSelection.length = 0

      const result = syncStarted.drainLostAfterSelectionNodes()

      expect(result).toEqual([])
    })
  })

  describe('module exports', () => {
    it('should export nodesYetToStartSyncing Map', () => {
      expect(syncStarted.nodesYetToStartSyncing).toBeInstanceOf(Map)
    })

    it('should export lostAfterSelection array', () => {
      expect(Array.isArray(syncStarted.lostAfterSelection)).toBe(true)
    })

    it('should allow modification of nodesYetToStartSyncing Map', () => {
      syncStarted.nodesYetToStartSyncing.set('testNode', 123)
      expect(syncStarted.nodesYetToStartSyncing.get('testNode')).toBe(123)
    })

    it('should allow modification of lostAfterSelection array', () => {
      const initialLength = syncStarted.lostAfterSelection.length
      syncStarted.lostAfterSelection.push('testNode')
      expect(syncStarted.lostAfterSelection).toHaveLength(initialLength + 1)
      expect(syncStarted.lostAfterSelection).toContain('testNode')
    })
  })
})
