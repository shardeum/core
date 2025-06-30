import * as CycleParser from '../../../../src/p2p/CycleParser'
import * as CycleCreator from '../../../../src/p2p/CycleCreator'
import { P2P } from '@shardeum-foundation/lib-types'
import { reversed } from '../../../../src/utils'

// Mock dependencies
jest.mock('deepmerge')
jest.mock('../../../../src/p2p/CycleCreator')
jest.mock('../../../../src/utils')

const mockDeepmerge = require('deepmerge')
const mockCycleCreator = CycleCreator as jest.Mocked<typeof CycleCreator>
const mockReversed = reversed as jest.MockedFunction<typeof reversed>

describe('CycleParser', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('parse', () => {
    it('should parse a cycle record and return merged changes', () => {
      // Mock data
      const mockRecord: P2P.CycleCreatorTypes.CycleRecord = {
        counter: 1,
        previous: 'prev-hash',
        start: 1000,
        duration: 30000,
        networkId: 'test-network',
        networkConfigHash: 'test-config-hash',
        joined: [],
        returned: [],
        lost: [],
        refuted: [],
        appRemoved: [],
        apoptosized: [],
        nodeListHash: 'test-node-list-hash',
        archiverListHash: 'test-archiver-list-hash',
        standbyNodeListHash: 'test-standby-hash',
        random: 0.5,
      } as P2P.CycleCreatorTypes.CycleRecord

      const mockChange1: P2P.CycleParserTypes.Change = {
        added: [{ 
          id: 'node1', 
          publicKey: 'node1-key',
          externalIp: '127.0.0.1',
          externalPort: 9001,
          internalIp: '127.0.0.1',
          internalPort: 10001,
          cycleJoined: 'test-marker',
          counterRefreshed: 1
        } as P2P.JoinTypes.JoinedConsensor],
        removed: ['node2'],
        updated: [],
      }

      const mockChange2: P2P.CycleParserTypes.Change = {
        added: [],
        removed: ['node3'],
        updated: [{ id: 'node4', status: 'active' } as P2P.NodeListTypes.Update],
      }

      const mockMergedChange: P2P.CycleParserTypes.Change = {
        added: [{ 
          id: 'node1', 
          publicKey: 'node1-key',
          externalIp: '127.0.0.1',
          externalPort: 9001,
          internalIp: '127.0.0.1',
          internalPort: 10001,
          cycleJoined: 'test-marker',
          counterRefreshed: 1
        } as P2P.JoinTypes.JoinedConsensor],
        removed: ['node2', 'node3'],
        updated: [{ id: 'node4', status: 'active' } as P2P.NodeListTypes.Update],
      }

      // Mock submodule with parseRecord method
      const mockSubmodule1 = { parseRecord: jest.fn().mockReturnValue(mockChange1) }
      const mockSubmodule2 = { parseRecord: jest.fn().mockReturnValue(mockChange2) }

      mockCycleCreator.submodules = [mockSubmodule1, mockSubmodule2] as any

      // Mock deepmerge.all
      mockDeepmerge.all = jest.fn().mockReturnValue(mockMergedChange)

      // Execute
      const result = CycleParser.parse(mockRecord)

      // Verify
      expect(mockSubmodule1.parseRecord).toHaveBeenCalledWith(mockRecord)
      expect(mockSubmodule2.parseRecord).toHaveBeenCalledWith(mockRecord)
      expect(mockDeepmerge.all).toHaveBeenCalledWith([mockChange1, mockChange2])
      expect(result).toBe(mockMergedChange)
    })

    it('should handle empty submodules array', () => {
      const mockRecord: P2P.CycleCreatorTypes.CycleRecord = {
        counter: 1,
        previous: 'prev-hash',
        start: 1000,
        duration: 30000,
        networkId: 'test-network',
        networkConfigHash: 'test-config-hash',
        joined: [],
        returned: [],
        lost: [],
        refuted: [],
        appRemoved: [],
        apoptosized: [],
        nodeListHash: 'test-node-list-hash',
        archiverListHash: 'test-archiver-list-hash',
        standbyNodeListHash: 'test-standby-hash',
        random: 0.5,
      } as P2P.CycleCreatorTypes.CycleRecord

      const mockMergedChange: P2P.CycleParserTypes.Change = {
        added: [],
        removed: [],
        updated: [],
      }

      mockCycleCreator.submodules = []
      mockDeepmerge.all = jest.fn().mockReturnValue(mockMergedChange)

      const result = CycleParser.parse(mockRecord)

      expect(mockDeepmerge.all).toHaveBeenCalledWith([])
      expect(result).toBe(mockMergedChange)
    })

    it('should handle submodules throwing errors', () => {
      const mockRecord: P2P.CycleCreatorTypes.CycleRecord = {
        counter: 1,
        previous: 'prev-hash',
        start: 1000,
        duration: 30000,
        networkId: 'test-network',
        networkConfigHash: 'test-config-hash',
        joined: [],
        returned: [],
        lost: [],
        refuted: [],
        appRemoved: [],
        apoptosized: [],
        nodeListHash: 'test-node-list-hash',
        archiverListHash: 'test-archiver-list-hash',
        standbyNodeListHash: 'test-standby-hash',
        random: 0.5,
      } as P2P.CycleCreatorTypes.CycleRecord

      const mockSubmodule = { parseRecord: jest.fn().mockImplementation(() => { throw new Error('Parse error') }) }
      mockCycleCreator.submodules = [mockSubmodule] as any

      expect(() => CycleParser.parse(mockRecord)).toThrow('Parse error')
    })
  })

  describe('ChangeSquasher', () => {
    let squasher: CycleParser.ChangeSquasher

    beforeEach(() => {
      squasher = new CycleParser.ChangeSquasher()
    })

    describe('constructor', () => {
      it('should initialize with empty final change', () => {
        expect(squasher.final).toEqual({
          added: [],
          removed: [],
          updated: [],
        })
      })

      it('should initialize with empty sets and maps', () => {
        expect(squasher.removedIds).toBeInstanceOf(Set)
        expect(squasher.removedIds.size).toBe(0)
        expect(squasher.addedIds).toBeInstanceOf(Set)
        expect(squasher.addedIds.size).toBe(0)
        expect(squasher.seenUpdates).toBeInstanceOf(Map)
        expect(squasher.seenUpdates.size).toBe(0)
      })
    })

    describe('addChange', () => {
      it('should process removed nodes correctly', () => {
        const change: P2P.CycleParserTypes.Change = {
          added: [],
          removed: ['node1', 'node2'],
          updated: [],
        }

        // Mock reversed to return empty array since we have no added nodes
        mockReversed.mockReturnValue([])

        squasher.addChange(change)

        expect(squasher.removedIds.has('node1')).toBe(true)
        expect(squasher.removedIds.has('node2')).toBe(true)
      })

      it('should ignore duplicate removed nodes', () => {
        const change1: P2P.CycleParserTypes.Change = {
          added: [],
          removed: ['node1'],
          updated: [],
        }

        const change2: P2P.CycleParserTypes.Change = {
          added: [],
          removed: ['node1'],
          updated: [],
        }

        // Mock reversed to return empty array since we have no added nodes
        mockReversed.mockReturnValue([])

        squasher.addChange(change1)
        squasher.addChange(change2)

        expect(squasher.removedIds.size).toBe(1)
        expect(squasher.removedIds.has('node1')).toBe(true)
      })

      it('should process updated nodes correctly', () => {
        const update: P2P.NodeListTypes.Update = {
          id: 'node1',
          status: P2P.P2PTypes.NodeStatus.ACTIVE,
        }

        const change: P2P.CycleParserTypes.Change = {
          added: [],
          removed: [],
          updated: [update],
        }

        // Mock reversed to return empty array since we have no added nodes
        mockReversed.mockReturnValue([])

        squasher.addChange(change)

        expect(squasher.seenUpdates.has('node1')).toBe(true)
        expect(squasher.seenUpdates.get('node1')).toBe(update)
      })

      it('should ignore updates for removed nodes', () => {
        const change1: P2P.CycleParserTypes.Change = {
          added: [],
          removed: ['node1'],
          updated: [],
        }

        const update: P2P.NodeListTypes.Update = {
          id: 'node1',
          status: P2P.P2PTypes.NodeStatus.ACTIVE,
        }

        const change2: P2P.CycleParserTypes.Change = {
          added: [],
          removed: [],
          updated: [update],
        }

        // Mock reversed to return empty array since we have no added nodes
        mockReversed.mockReturnValue([])

        squasher.addChange(change1)
        squasher.addChange(change2)

        expect(squasher.seenUpdates.has('node1')).toBe(false)
      })

      it('should process added nodes correctly with reversed iteration', () => {
        const joinedConsensor = {
          id: 'node1',
          publicKey: 'node1-key',
          externalIp: '127.0.0.1',
          externalPort: 9001,
          internalIp: '127.0.0.1',
          internalPort: 10001,
          cycleJoined: 'test-marker',
          counterRefreshed: 1,
          address: 'node1-address',
          joinRequestTimestamp: 123456,
          activeTimestamp: 123456,
          activeCycle: 1,
          syncingTimestamp: 123456,
          readyTimestamp: 123456
        } as P2P.JoinTypes.JoinedConsensor

        const change: P2P.CycleParserTypes.Change = {
          added: [joinedConsensor],
          removed: [],
          updated: [],
        }

        // Mock reversed function
        const mockReversedIterator = [joinedConsensor]
        mockReversed.mockReturnValue(mockReversedIterator)

        squasher.addChange(change)

        expect(mockReversed).toHaveBeenCalledWith(change.added)
        expect(squasher.addedIds.has('node1')).toBe(true)
        expect(squasher.final.added).toEqual([joinedConsensor])
      })

      it('should ignore duplicate added nodes', () => {
        const joinedConsensor = {
          id: 'node1',
          publicKey: 'node1-key',
          externalIp: '127.0.0.1',
          externalPort: 9001,
          internalIp: '127.0.0.1',
          internalPort: 10001,
          cycleJoined: 'test-marker',
          counterRefreshed: 1,
          address: 'node1-address',
          joinRequestTimestamp: 123456,
          activeTimestamp: 123456,
          activeCycle: 1,
          syncingTimestamp: 123456,
          readyTimestamp: 123456
        } as P2P.JoinTypes.JoinedConsensor

        const change1: P2P.CycleParserTypes.Change = {
          added: [joinedConsensor],
          removed: [],
          updated: [],
        }

        const change2: P2P.CycleParserTypes.Change = {
          added: [joinedConsensor],
          removed: [],
          updated: [],
        }

        mockReversed.mockReturnValue([joinedConsensor])

        squasher.addChange(change1)
        squasher.addChange(change2)

        expect(squasher.final.added).toHaveLength(1)
        expect(squasher.addedIds.size).toBe(1)
      })

      it('should ignore added nodes that are already removed', () => {
        const joinedConsensor = {
          id: 'node1',
          publicKey: 'node1-key',
          externalIp: '127.0.0.1',
          externalPort: 9001,
          internalIp: '127.0.0.1',
          internalPort: 10001,
          cycleJoined: 'test-marker',
          counterRefreshed: 1,
          address: 'node1-address',
          joinRequestTimestamp: 123456,
          activeTimestamp: 123456,
          activeCycle: 1,
          syncingTimestamp: 123456,
          readyTimestamp: 123456
        } as P2P.JoinTypes.JoinedConsensor

        const change1: P2P.CycleParserTypes.Change = {
          added: [],
          removed: ['node1'],
          updated: [],
        }

        const change2: P2P.CycleParserTypes.Change = {
          added: [joinedConsensor],
          removed: [],
          updated: [],
        }

        mockReversed.mockReturnValue([joinedConsensor])

        squasher.addChange(change1)
        squasher.addChange(change2)

        expect(squasher.final.added).toHaveLength(0)
        expect(squasher.addedIds.size).toBe(0)
      })

      it('should merge updates with added nodes', () => {
        const joinedConsensor = {
          id: 'node1',
          publicKey: 'node1-key',
          externalIp: '127.0.0.1',
          externalPort: 9001,
          internalIp: '127.0.0.1',
          internalPort: 10001,
          cycleJoined: 'test-marker',
          counterRefreshed: 1,
          address: 'node1-address',
          joinRequestTimestamp: 123456,
          activeTimestamp: 123456,
          activeCycle: 1,
          syncingTimestamp: 123456,
          readyTimestamp: 123456
        } as P2P.JoinTypes.JoinedConsensor

        const update: P2P.NodeListTypes.Update = {
          id: 'node1',
          status: P2P.P2PTypes.NodeStatus.ACTIVE,
        }

        const change1: P2P.CycleParserTypes.Change = {
          added: [],
          removed: [],
          updated: [update],
        }

        const change2: P2P.CycleParserTypes.Change = {
          added: [joinedConsensor],
          removed: [],
          updated: [],
        }

        mockReversed.mockReturnValue([joinedConsensor])

        squasher.addChange(change1)
        squasher.addChange(change2)

        expect(squasher.final.added).toEqual([joinedConsensor])
        expect(squasher.final.updated).toEqual([update])
        expect(squasher.seenUpdates.has('node1')).toBe(false) // Should be removed after processing
      })

      it('should handle complex scenario with multiple changes', () => {
        const joinedConsensor1 = {
          id: 'node1',
          publicKey: 'node1-key',
          externalIp: '127.0.0.1',
          externalPort: 9001,
          internalIp: '127.0.0.1',
          internalPort: 10001,
          cycleJoined: 'test-marker',
          counterRefreshed: 1,
          address: 'node1-address',
          joinRequestTimestamp: 123456,
          activeTimestamp: 123456,
          activeCycle: 1,
          syncingTimestamp: 123456,
          readyTimestamp: 123456
        } as P2P.JoinTypes.JoinedConsensor

        const joinedConsensor2 = {
          id: 'node2',
          publicKey: 'node2-key',
          externalIp: '127.0.0.2',
          externalPort: 9002,
          internalIp: '127.0.0.2',
          internalPort: 10002,
          cycleJoined: 'test-marker',
          counterRefreshed: 1,
          address: 'node2-address',
          joinRequestTimestamp: 123456,
          activeTimestamp: 123456,
          activeCycle: 1,
          syncingTimestamp: 123456,
          readyTimestamp: 123456
        } as P2P.JoinTypes.JoinedConsensor

        const update1: P2P.NodeListTypes.Update = {
          id: 'node1',
          status: P2P.P2PTypes.NodeStatus.ACTIVE,
        }

        const update2: P2P.NodeListTypes.Update = {
          id: 'node3',
          status: P2P.P2PTypes.NodeStatus.READY,
        }

        // Change 1: Add node1, remove node4, update node3
        const change1: P2P.CycleParserTypes.Change = {
          added: [joinedConsensor1],
          removed: ['node4'],
          updated: [update2],
        }

        // Change 2: Add node2, update node1
        const change2: P2P.CycleParserTypes.Change = {
          added: [joinedConsensor2],
          removed: [],
          updated: [update1],
        }

        mockReversed.mockReturnValueOnce([joinedConsensor1])
        mockReversed.mockReturnValueOnce([joinedConsensor2])

        squasher.addChange(change1)
        squasher.addChange(change2)

        expect(squasher.final.added).toEqual([joinedConsensor2, joinedConsensor1])
        expect(squasher.final.updated).toEqual([])
        expect(squasher.removedIds.has('node4')).toBe(true)
        expect(squasher.seenUpdates.has('node3')).toBe(true) // node3 update should remain
        expect(squasher.seenUpdates.has('node1')).toBe(true) // node1 update should remain because it's processed after joinedConsensor1
      })
    })
  })
})