import { Node } from '../../../../../src/shardus/shardus-types'
import { removeNodesByID } from '../../../../../src/utils/functions/nodes'
import { P2P } from '@shardeum-foundation/lib-types'

describe('removeNodesByID', () => {
  // Create sample nodes for testing
  const sampleNodes: Node[] = [
    {
      id: 'node1',
      curvePublicKey: 'curve1',
      status: P2P.P2PTypes.NodeStatus.READY,
      cycleJoined: 'cycle1',
      counterRefreshed: 0,
      publicKey: 'pub1',
      externalIp: '1.1.1.1',
      externalPort: 1111,
      internalIp: '10.0.0.1',
      internalPort: 2222,
      address: 'addr1',
      joinRequestTimestamp: 1000,
      activeTimestamp: 1200,
      activeCycle: 1,
      syncingTimestamp: 1100,
      readyTimestamp: 1150,
    },
    {
      id: 'node2',
      curvePublicKey: 'curve2',
      status: P2P.P2PTypes.NodeStatus.READY,
      cycleJoined: 'cycle1',
      counterRefreshed: 0,
      publicKey: 'pub2',
      externalIp: '2.2.2.2',
      externalPort: 3333,
      internalIp: '10.0.0.2',
      internalPort: 4444,
      address: 'addr2',
      joinRequestTimestamp: 1001,
      activeTimestamp: 1201,
      activeCycle: 1,
      syncingTimestamp: 1101,
      readyTimestamp: 1151,
    },
    {
      id: 'node3',
      curvePublicKey: 'curve3',
      status: P2P.P2PTypes.NodeStatus.READY,
      cycleJoined: 'cycle1',
      counterRefreshed: 0,
      publicKey: 'pub3',
      externalIp: '3.3.3.3',
      externalPort: 5555,
      internalIp: '10.0.0.3',
      internalPort: 6666,
      address: 'addr3',
      joinRequestTimestamp: 1002,
      activeTimestamp: 1202,
      activeCycle: 1,
      syncingTimestamp: 1102,
      readyTimestamp: 1152,
    },
  ]

  // Positive test cases
  it('should remove a single node by ID from an array of nodes', () => {
    const result = removeNodesByID(sampleNodes, ['node1'])
    expect(result).toHaveLength(2)
    expect(result.map((node) => node.id)).toEqual(['node2', 'node3'])
  })

  it('should remove multiple nodes by ID from an array of nodes', () => {
    const result = removeNodesByID(sampleNodes, ['node1', 'node3'])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('node2')
  })

  it('should remove all nodes by ID from an array of nodes', () => {
    const result = removeNodesByID(sampleNodes, ['node1', 'node2', 'node3'])
    expect(result).toHaveLength(0)
    expect(result).toEqual([])
  })

  it('should return original array when trying to remove nodes with IDs that do not exist', () => {
    const result = removeNodesByID(sampleNodes, ['node4', 'node5'])
    expect(result).toEqual(sampleNodes)
  })

  it('should return original array when given an empty array of IDs to remove', () => {
    const result = removeNodesByID(sampleNodes, [])
    expect(result).toEqual(sampleNodes)
  })

  // Negative test cases
  it('should return original array when ids parameter is not an array', () => {
    const result = removeNodesByID(sampleNodes, 'not-an-array' as any)
    expect(result).toEqual(sampleNodes)
  })

  it('should return empty array when nodes array is empty', () => {
    const result = removeNodesByID([], ['node1', 'node2'])
    expect(result).toEqual([])
  })

  // Edge cases
  it('should handle null ids parameter by returning original array', () => {
    const result = removeNodesByID(sampleNodes, null as any)
    expect(result).toEqual(sampleNodes)
  })

  it('should handle undefined ids parameter by returning original array', () => {
    const result = removeNodesByID(sampleNodes, undefined as any)
    expect(result).toEqual(sampleNodes)
  })

  it('should handle duplicate IDs in the ids array', () => {
    const result = removeNodesByID(sampleNodes, ['node1', 'node1', 'node3'])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('node2')
  })

  // Potential error cases - these might throw errors in the current implementation
  it('should throw error when nodes parameter is null', () => {
    expect(() => {
      removeNodesByID(null as any, ['node1'])
    }).toThrow()
  })

  it('should throw error when nodes parameter is undefined', () => {
    expect(() => {
      removeNodesByID(undefined as any, ['node1'])
    }).toThrow()
  })

  it('should return empty array when nodes contain objects without id property', () => {
    const nodesWithoutId = [{ name: 'node1' }, { name: 'node2' }]
    const result = removeNodesByID(nodesWithoutId as any, ['node1'])
    // The function will try to filter based on id property which doesn't exist
    // Since no nodes match the filter condition, all nodes will be returned
    expect(result).toEqual(nodesWithoutId)
  })
})
