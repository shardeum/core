import { P2P } from '@shardeum-foundation/lib-types'
import * as Lost from '../../../../src/p2p/Lost'
import * as RefuteCycleCache from '../../../../src/p2p/RefuteCycleCache'
import * as NodeList from '../../../../src/p2p/NodeList'
import { config } from '../../../../src/p2p/Context'
import * as Self from '../../../../src/p2p/Self'

// Mock dependencies
jest.mock('../../../../src/p2p/Context', () => ({
  config: {
    p2p: {
      enableProblematicNodeRemoval: true,
      problematicNodeHistoryLength: 100,
      enableProblematicNodeRemovalOnCycle: 1
    }
  },
  logger: {
    getLogger: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }))
  }
}))

jest.mock('../../../../src/logger', () => ({
  logFlags: {
    p2pNonFatal: false,
    verbose: false,
    lost: false
  }
}))

jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn()
  }
}))

jest.mock('../../../../src/p2p/NodeList', () => ({
  nodes: new Map(),
  emitSyncTimeoutEvent: jest.fn()
}))

jest.mock('../../../../src/p2p/Self', () => ({
  id: 'self-node-id',
  emitter: {
    emit: jest.fn()
  }
}))

jest.mock('../../../../src/logger/csvPerfEvents', () => ({
  logPerfEvents: jest.fn()
}))

describe('Lost module integration with RefuteCycleCache', () => {
  beforeEach(() => {
    // Clear cache and mocks before each test
    RefuteCycleCache.clearRefuteCache()
    jest.clearAllMocks()
    
    // Reset Lost module state
    Lost.reset()
  })

  describe('parseRecord integration', () => {
    it('should update RefuteCycleCache when processing cycle with refuted nodes', () => {
      const record: P2P.CycleCreatorTypes.CycleRecord = {
        counter: 10,
        refuted: ['node1', 'node2', 'node3'],
        lost: [],
        lostSyncing: [],
        appRemoved: [],
        start: Date.now()
      } as P2P.CycleCreatorTypes.CycleRecord

      // Add nodes to NodeList
      const mockNodes = ['node1', 'node2', 'node3'].map(id => ({
        id,
        publicKey: `key-${id}`
      }))
      mockNodes.forEach(node => {
        NodeList.nodes.set(node.id, node as any)
      })

      // Process the record
      Lost.parseRecord(record)

      // Verify cache was updated
      const stats = RefuteCycleCache.getCacheStats()
      expect(stats.totalCycles).toBe(1)
      expect(stats.totalRefutedNodes).toBe(3)

      // Verify specific nodes are in cache
      const node1Cycles = RefuteCycleCache.getRefuteCyclesForNode('node1', 10)
      expect(node1Cycles).toEqual([10])
    })

    it('should handle multiple cycles with different refuted nodes', () => {
      // Add nodes to NodeList
      const nodeIds = ['node1', 'node2', 'node3', 'node4']
      nodeIds.forEach(id => {
        NodeList.nodes.set(id, { id, publicKey: `key-${id}` } as any)
      })

      // Process multiple cycles
      const cycles = [
        { counter: 10, refuted: ['node1', 'node2'] },
        { counter: 11, refuted: ['node2', 'node3'] },
        { counter: 12, refuted: ['node1', 'node3', 'node4'] },
        { counter: 13, refuted: ['node4'] }
      ]

      cycles.forEach(cycleData => {
        const record = {
          ...cycleData,
          lost: [],
          lostSyncing: [],
          appRemoved: [],
          start: Date.now()
        } as P2P.CycleCreatorTypes.CycleRecord
        
        Lost.parseRecord(record)
      })

      // Verify cache contains all cycles
      const stats = RefuteCycleCache.getCacheStats()
      expect(stats.totalCycles).toBe(4)
      expect(stats.oldestCycle).toBe(10)
      expect(stats.newestCycle).toBe(13)

      // Verify node refute cycles
      expect(RefuteCycleCache.getRefuteCyclesForNode('node1', 13)).toEqual([10, 12])
      expect(RefuteCycleCache.getRefuteCyclesForNode('node2', 13)).toEqual([10, 11])
      expect(RefuteCycleCache.getRefuteCyclesForNode('node3', 13)).toEqual([11, 12])
      expect(RefuteCycleCache.getRefuteCyclesForNode('node4', 13)).toEqual([12, 13])
    })

    it('should handle self-refute and emit events', () => {
      // Set self node in refuted list
      const record: P2P.CycleCreatorTypes.CycleRecord = {
        counter: 10,
        refuted: ['self-node-id', 'node2'],
        lost: [],
        lostSyncing: [],
        appRemoved: [],
        start: Date.now()
      } as P2P.CycleCreatorTypes.CycleRecord

      // Add nodes to NodeList
      NodeList.nodes.set('self-node-id', { id: 'self-node-id', publicKey: 'self-key' } as any)
      NodeList.nodes.set('node2', { id: 'node2', publicKey: 'key-2' } as any)

      // Process the record
      Lost.parseRecord(record)

      // Verify self-refute was handled
      expect(Self.emitter.emit).toHaveBeenCalledWith('node-refuted', expect.objectContaining({
        nodeId: 'self-node-id',
        reason: 'Node refuted',
        cycleNumber: 10
      }))

      // Verify cache was still updated
      const selfCycles = RefuteCycleCache.getRefuteCyclesForNode('self-node-id', 10)
      expect(selfCycles).toEqual([10])
    })

    it('should prune old cycles from cache automatically', () => {
      // Set history length to 5 for testing
      config.p2p.problematicNodeHistoryLength = 5

      // Add a node
      NodeList.nodes.set('node1', { id: 'node1', publicKey: 'key-1' } as any)

      // Process cycles 1-10
      for (let i = 1; i <= 10; i++) {
        const record: P2P.CycleCreatorTypes.CycleRecord = {
          counter: i,
          refuted: ['node1'],
          lost: [],
          lostSyncing: [],
          appRemoved: [],
          start: Date.now()
        } as P2P.CycleCreatorTypes.CycleRecord
        
        Lost.parseRecord(record)
      }

      // Verify only last 5 cycles are in cache
      const stats = RefuteCycleCache.getCacheStats()
      expect(stats.totalCycles).toBe(5)
      expect(stats.oldestCycle).toBe(6)
      expect(stats.newestCycle).toBe(10)

      // Verify node only has cycles 6-10
      const nodeCycles = RefuteCycleCache.getRefuteCyclesForNode('node1', 10)
      expect(nodeCycles).toEqual([6, 7, 8, 9, 10])

      // Restore config
      config.p2p.problematicNodeHistoryLength = 100
    })

    it('should handle empty refuted list', () => {
      const record: P2P.CycleCreatorTypes.CycleRecord = {
        counter: 10,
        refuted: [],
        lost: ['node1'],
        lostSyncing: [],
        appRemoved: [],
        start: Date.now()
      } as P2P.CycleCreatorTypes.CycleRecord

      Lost.parseRecord(record)

      // Verify cache is empty
      const stats = RefuteCycleCache.getCacheStats()
      expect(stats.totalCycles).toBe(0)
      expect(stats.totalRefutedNodes).toBe(0)
    })

    it('should not update cache when feature is disabled', () => {
      config.p2p.enableProblematicNodeRemoval = false

      const record: P2P.CycleCreatorTypes.CycleRecord = {
        counter: 10,
        refuted: ['node1', 'node2'],
        lost: [],
        lostSyncing: [],
        appRemoved: [],
        start: Date.now()
      } as P2P.CycleCreatorTypes.CycleRecord

      Lost.parseRecord(record)

      // Verify cache was not updated
      const stats = RefuteCycleCache.getCacheStats()
      expect(stats.totalCycles).toBe(0)

      // Restore config
      config.p2p.enableProblematicNodeRemoval = true
    })
  })

  describe('Problematic node detection flow', () => {
    it('should correctly identify problematic nodes after multiple cycles', () => {
      // Import the actual implementation to test the full flow
      const ProblemNodeHandler = require('../../../../src/p2p/ProblemNodeHandler')
      
      // Clear any mocks on ProblemNodeHandler
      jest.unmock('../../../../src/p2p/RefuteCycleCache')
      
      // Add test node
      const testNode = { id: 'test-node', publicKey: 'test-key' }
      NodeList.nodes.set(testNode.id, testNode as any)

      // Process multiple cycles with refutes
      const cycles = [
        { counter: 98, refuted: ['test-node'] },
        { counter: 99, refuted: ['test-node'] },
        { counter: 100, refuted: ['test-node'] }
      ]

      cycles.forEach(cycleData => {
        const record = {
          ...cycleData,
          lost: [],
          lostSyncing: [],
          appRemoved: [],
          start: Date.now()
        } as P2P.CycleCreatorTypes.CycleRecord
        
        Lost.parseRecord(record)
      })

      // Check if node is problematic (3 consecutive refutes)
      const isProblematic = ProblemNodeHandler.isNodeProblematic(testNode as any, 100)
      expect(isProblematic).toBe(true)

      // Verify the refute cycles are correct
      const refuteCycles = RefuteCycleCache.getRefuteCyclesForNode('test-node', 100)
      expect(refuteCycles).toEqual([98, 99, 100])
    })
  })
})