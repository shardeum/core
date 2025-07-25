import DataSourceHelper from '../../../../src/state-manager/DataSourceHelper'
import * as Shardus from '../../../../src/shardus/shardus-types'
import * as utils from '../../../../src/utils'
import { nestedCountersInstance } from '../../../../src/utils/nestedCounters'
import { logFlags } from '../../../../src/logger'
import ShardFunctions from '../../../../src/state-manager/shardFunctions'
import { potentiallyRemoved } from '../../../../src/p2p/NodeList'

jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
  },
}))

jest.mock('../../../../src/logger', () => ({
  logFlags: {
    error: false,
  },
}))

jest.mock('../../../../src/utils', () => ({
  stringifyReduce: jest.fn().mockReturnValue('mock-stringify'),
}))

jest.mock('../../../../src/state-manager/shardFunctions', () => ({
  __esModule: true,
  default: {
    getCenterHomeNode: jest.fn(),
    getNodesByProximity: jest.fn(),
    testAddressInRange: jest.fn(),
  },
}))

jest.mock('../../../../src/p2p/NodeList', () => ({
  potentiallyRemoved: new Set(),
}))

const createMockNode = (id: string, externalIp: string, externalPort: number): Shardus.Node =>
  ({
    id,
    externalIp,
    externalPort,
    internalIp: '192.168.1.1',
    internalPort: 9001,
    publicKey: `mock-public-key-${id}`,
    status: 'active',
  } as Shardus.Node)

const createMockStateManager = (): any => ({
  mainLogger: {
    error: jest.fn(),
  },
  p2p: {
    id: 'mock-p2p-id',
  },
  currentCycleShardData: null,
})

const createMockCycleShardData = (): any => ({
  shardGlobals: {
    numNodes: 10,
    nodesPerConsensusGroup: 5,
  },
  parititionShardDataMap: new Map(),
  nodes: [
    createMockNode('node1', '127.0.0.1', 4000),
    createMockNode('node2', '127.0.0.2', 4001),
    createMockNode('node3', '127.0.0.3', 4002),
  ],
  nodeShardDataMap: new Map(),
})

const createMockNodeShardData = (): any => ({
  consensusPartitions: [
    { low: '0000', high: '3333' },
    { low: '6666', high: '9999' },
  ],
  node: createMockNode('node1', '127.0.0.1', 4000),
  ourNodeIndex: 1,
  nodeAddressNum: 1,
  homePartition: 0,
  centeredAddress: '1234567890123456789012345678901234567890',
  consensusStartPartition: 0,
  consensusEndPartition: 2,
  storedPartitions: { partitionStart: 0, partitionEnd: 2 },
})

const createMockCenterNodeShardData = (): any => ({
  node: createMockNode('center', '127.0.0.1', 4000),
  ourNodeIndex: 1,
  nodeAddressNum: 1,
  homePartition: 0,
  centeredAddress: '1234567890123456789012345678901234567890',
  consensusStartPartition: 0,
  consensusEndPartition: 2,
  storedPartitions: { partitionStart: 0, partitionEnd: 2 },
  consensusPartitions: [
    { low: '0000', high: '3333' },
    { low: '6666', high: '9999' },
  ],
})

describe('DataSourceHelper', () => {
  let dataSourceHelper: DataSourceHelper
  let mockStateManager: any
  let mockShardFunctions: jest.Mocked<typeof ShardFunctions>

  beforeEach(() => {
    jest.clearAllMocks()
    mockStateManager = createMockStateManager()
    dataSourceHelper = new DataSourceHelper(mockStateManager)
    mockShardFunctions = ShardFunctions as jest.Mocked<typeof ShardFunctions>
    ;(potentiallyRemoved as Set<string>).clear()
  })

  describe('constructor', () => {
    it('should initialize with stateManager', () => {
      expect(dataSourceHelper.stateManager).toBe(mockStateManager)
    })
  })

  describe('initWithList', () => {
    it('should initialize with list of nodes', () => {
      const nodes = [
        createMockNode('node1', '127.0.0.1', 4000),
        createMockNode('node2', '127.0.0.2', 4001),
        createMockNode('node3', '127.0.0.3', 4002),
      ]

      dataSourceHelper.initWithList(nodes)

      expect(dataSourceHelper.dataSourceNodeIndex).toBe(0)
      expect(dataSourceHelper.dataSourceNode).toBe(nodes[0])
      expect(dataSourceHelper.dataSourceNodeList).toEqual(nodes)
    })

    it('should handle empty list', () => {
      const nodes: Shardus.Node[] = []

      dataSourceHelper.initWithList(nodes)

      expect(dataSourceHelper.dataSourceNodeIndex).toBe(0)
      expect(dataSourceHelper.dataSourceNode).toBeUndefined()
      expect(dataSourceHelper.dataSourceNodeList).toEqual([])
    })

    it('should create copy of node list', () => {
      const nodes = [createMockNode('node1', '127.0.0.1', 4000)]
      const originalLength = nodes.length

      dataSourceHelper.initWithList(nodes)

      nodes.push(createMockNode('node2', '127.0.0.2', 4001))

      expect(dataSourceHelper.dataSourceNodeList.length).toBe(originalLength)
    })
  })

  describe('initByRange', () => {
    it('should return early when currentCycleShardData is null', () => {
      mockStateManager.currentCycleShardData = null
      ;(logFlags as any).error = true

      dataSourceHelper.initByRange('1000', '2000')

      expect(mockStateManager.mainLogger.error).toHaveBeenCalledWith(
        'getDataSourceNode: initByRange currentCycleShardData == null'
      )
      expect(dataSourceHelper.dataSourceNodeList).toEqual([])
    })

    it('should return early when centerNode is null', () => {
      mockStateManager.currentCycleShardData = createMockCycleShardData()
      mockShardFunctions.getCenterHomeNode.mockReturnValue(null)
      ;(logFlags as any).error = true

      dataSourceHelper.initByRange('1000', '2000')

      expect(mockShardFunctions.getCenterHomeNode).toHaveBeenCalled()
      expect(mockStateManager.mainLogger.error).toHaveBeenCalledWith('getDataSourceNode: centerNode not found')
      expect(dataSourceHelper.dataSourceNodeList).toEqual([])
    })

    it('should successfully initialize with valid range and nodes', () => {
      const mockCycleShardData = createMockCycleShardData()
      mockStateManager.currentCycleShardData = mockCycleShardData

      const centerNode = createMockCenterNodeShardData()
      const proximityNodes = [createMockNode('node1', '127.0.0.1', 4000), createMockNode('node2', '127.0.0.2', 4001)]

      mockShardFunctions.getCenterHomeNode.mockReturnValue(centerNode)
      mockShardFunctions.getNodesByProximity.mockReturnValue(proximityNodes)
      mockShardFunctions.testAddressInRange.mockReturnValue(true)

      // Mock nodeShardDataMap
      proximityNodes.forEach((node) => {
        mockCycleShardData.nodeShardDataMap.set(node.id, createMockNodeShardData())
      })

      const mathRandomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5)

      dataSourceHelper.initByRange('1000', '2000')

      expect(mockShardFunctions.getCenterHomeNode).toHaveBeenCalledWith(
        mockCycleShardData.shardGlobals,
        mockCycleShardData.parititionShardDataMap,
        '1000',
        '2000'
      )
      expect(mockShardFunctions.getNodesByProximity).toHaveBeenCalledWith(
        mockCycleShardData.shardGlobals,
        mockCycleShardData.nodes,
        centerNode.ourNodeIndex,
        mockStateManager.p2p.id,
        40
      )
      expect(dataSourceHelper.dataSourceNodeList.length).toBe(2)
      expect(dataSourceHelper.dataSourceNode).toBeDefined()

      mathRandomSpy.mockRestore()
    })

    it('should filter out nodes that cannot fit the range', () => {
      const mockCycleShardData = createMockCycleShardData()
      mockStateManager.currentCycleShardData = mockCycleShardData

      const centerNode = createMockCenterNodeShardData()
      const proximityNodes = [createMockNode('node1', '127.0.0.1', 4000), createMockNode('node2', '127.0.0.2', 4001)]

      mockShardFunctions.getCenterHomeNode.mockReturnValue(centerNode)
      mockShardFunctions.getNodesByProximity.mockReturnValue(proximityNodes)
      // First node fails range test, second passes
      mockShardFunctions.testAddressInRange
        .mockReturnValueOnce(false) // queryLow fails for node1
        .mockReturnValueOnce(true) // queryLow passes for node2
        .mockReturnValueOnce(true) // queryHigh passes for node2

      // Mock nodeShardDataMap
      proximityNodes.forEach((node) => {
        mockCycleShardData.nodeShardDataMap.set(node.id, createMockNodeShardData())
      })
      ;(logFlags as any).error = true

      dataSourceHelper.initByRange('1000', '2000')

      expect(dataSourceHelper.dataSourceNodeList.length).toBe(1)
      expect(dataSourceHelper.dataSourceNodeList[0].id).toBe('node2')
      expect(mockStateManager.mainLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('node cant fit range: queryLow:1000')
      )
    })

    it('should filter out potentially removed nodes', () => {
      const mockCycleShardData = createMockCycleShardData()
      mockStateManager.currentCycleShardData = mockCycleShardData

      const centerNode = createMockCenterNodeShardData()
      const proximityNodes = [createMockNode('node1', '127.0.0.1', 4000), createMockNode('node2', '127.0.0.2', 4001)]

      // Mark node1 as potentially removed
      ;(potentiallyRemoved as Set<string>).add('node1')

      mockShardFunctions.getCenterHomeNode.mockReturnValue(centerNode)
      mockShardFunctions.getNodesByProximity.mockReturnValue(proximityNodes)
      mockShardFunctions.testAddressInRange.mockReturnValue(true)

      proximityNodes.forEach((node) => {
        mockCycleShardData.nodeShardDataMap.set(node.id, createMockNodeShardData())
      })

      dataSourceHelper.initByRange('1000', '2000')

      expect(dataSourceHelper.dataSourceNodeList.length).toBe(1)
      expect(dataSourceHelper.dataSourceNodeList[0].id).toBe('node2')
    })

    it('should handle case with no valid nodes found', () => {
      const mockCycleShardData = createMockCycleShardData()
      mockStateManager.currentCycleShardData = mockCycleShardData

      const centerNode = createMockCenterNodeShardData()
      const proximityNodes = [createMockNode('node1', '127.0.0.1', 4000)]

      mockShardFunctions.getCenterHomeNode.mockReturnValue(centerNode)
      mockShardFunctions.getNodesByProximity.mockReturnValue(proximityNodes)
      mockShardFunctions.testAddressInRange.mockReturnValue(false)

      proximityNodes.forEach((node) => {
        mockCycleShardData.nodeShardDataMap.set(node.id, createMockNodeShardData())
      })
      ;(logFlags as any).error = true

      dataSourceHelper.initByRange('1000', '2000')

      expect(dataSourceHelper.dataSourceNodeList.length).toBe(0)
      expect(mockStateManager.mainLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('no data source nodes found')
      )
    })
  })

  describe('tryNextDataSourceNode', () => {
    beforeEach(() => {
      const nodes = [
        createMockNode('node1', '127.0.0.1', 4000),
        createMockNode('node2', '127.0.0.2', 4001),
        createMockNode('node3', '127.0.0.3', 4002),
      ]
      dataSourceHelper.initWithList(nodes)
    })

    it('should move to next node successfully', () => {
      ;(logFlags as any).error = true

      const result = dataSourceHelper.tryNextDataSourceNode('test-debug')

      expect(result).toBe(true)
      expect(dataSourceHelper.dataSourceNodeIndex).toBe(1)
      expect(dataSourceHelper.dataSourceNode.externalIp).toBe('127.0.0.2')
      expect(mockStateManager.mainLogger.error).toHaveBeenCalledWith(
        'tryNextDataSourceNode test-debug try next node: 1'
      )
      expect(mockStateManager.mainLogger.error).toHaveBeenCalledWith(
        'tryNextDataSourceNode test-debug found: 127.0.0.2 4001 '
      )
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'sync',
        'tryNextDataSourceNode next try: 1 of 3',
        1
      )
    })

    it('should return false when reaching end of list', () => {
      dataSourceHelper.dataSourceNodeIndex = 2
      ;(logFlags as any).error = true

      const result = dataSourceHelper.tryNextDataSourceNode('test-debug')

      expect(result).toBe(false)
      expect(dataSourceHelper.dataSourceNodeIndex).toBe(0)
      expect(mockStateManager.mainLogger.error).toHaveBeenCalledWith(
        'tryNextDataSourceNode test-debug ran out of nodes ask for data'
      )
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'sync',
        'tryNextDataSourceNode Out of tries: 0 of 3 ',
        1
      )
    })

    it('should handle null node in list', () => {
      dataSourceHelper.dataSourceNodeList[1] = null as any

      const result = dataSourceHelper.tryNextDataSourceNode('test-debug')

      expect(result).toBe(false)
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'sync',
        'tryNextDataSourceNode next try: 1 of 3 NODE==null',
        1
      )
    })

    it('should handle single node list', () => {
      const singleNode = [createMockNode('node1', '127.0.0.1', 4000)]
      dataSourceHelper.initWithList(singleNode)

      const result = dataSourceHelper.tryNextDataSourceNode('test-debug')

      expect(result).toBe(false)
      expect(dataSourceHelper.dataSourceNodeIndex).toBe(0)
    })
  })

  describe('tryRestartList', () => {
    it('should restart list with small number of nodes', () => {
      const nodes = [createMockNode('node1', '127.0.0.1', 4000), createMockNode('node2', '127.0.0.2', 4001)]
      dataSourceHelper.initWithList(nodes)
      dataSourceHelper.dataSourceNodeIndex = 1

      const result = dataSourceHelper.tryRestartList('test-debug')

      expect(result).toBe(true)
      expect(dataSourceHelper.dataSourceNodeIndex).toBe(0)
      expect(dataSourceHelper.dataSourceNode).toBe(nodes[0])
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'sync',
        'DataSourceHelper restartList test-debug numnodes:2',
        1
      )
    })

    it('should not restart list with large number of nodes', () => {
      const nodes = [
        createMockNode('node1', '127.0.0.1', 4000),
        createMockNode('node2', '127.0.0.2', 4001),
        createMockNode('node3', '127.0.0.3', 4002),
        createMockNode('node4', '127.0.0.4', 4003),
        createMockNode('node5', '127.0.0.5', 4004),
      ]
      dataSourceHelper.initWithList(nodes)
      dataSourceHelper.dataSourceNodeIndex = 2

      const result = dataSourceHelper.tryRestartList('test-debug')

      expect(result).toBe(false)
      expect(dataSourceHelper.dataSourceNodeIndex).toBe(0)
    })

    it('should return false with empty list', () => {
      dataSourceHelper.initWithList([])

      const result = dataSourceHelper.tryRestartList('test-debug')

      expect(result).toBe(false)
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'sync',
        'DataSourceHelper restartList test-debug numnodes:0',
        1
      )
    })

    it('should handle exactly 3 nodes', () => {
      const nodes = [
        createMockNode('node1', '127.0.0.1', 4000),
        createMockNode('node2', '127.0.0.2', 4001),
        createMockNode('node3', '127.0.0.3', 4002),
      ]
      dataSourceHelper.initWithList(nodes)
      dataSourceHelper.dataSourceNodeIndex = 2

      const result = dataSourceHelper.tryRestartList('test-debug')

      expect(result).toBe(true)
      expect(dataSourceHelper.dataSourceNodeIndex).toBe(0)
      expect(dataSourceHelper.dataSourceNode).toBe(nodes[0])
    })

    it('should handle exactly 4 nodes', () => {
      const nodes = [
        createMockNode('node1', '127.0.0.1', 4000),
        createMockNode('node2', '127.0.0.2', 4001),
        createMockNode('node3', '127.0.0.3', 4002),
        createMockNode('node4', '127.0.0.4', 4003),
      ]
      dataSourceHelper.initWithList(nodes)
      dataSourceHelper.dataSourceNodeIndex = 2

      const result = dataSourceHelper.tryRestartList('test-debug')

      expect(result).toBe(false)
      expect(dataSourceHelper.dataSourceNodeIndex).toBe(0)
    })
  })

  describe('getNumNodes', () => {
    it('should return number of nodes in list', () => {
      const nodes = [
        createMockNode('node1', '127.0.0.1', 4000),
        createMockNode('node2', '127.0.0.2', 4001),
        createMockNode('node3', '127.0.0.3', 4002),
      ]
      dataSourceHelper.initWithList(nodes)

      const result = dataSourceHelper.getNumNodes()

      expect(result).toBe(3)
    })

    it('should return 0 for empty list', () => {
      dataSourceHelper.initWithList([])

      const result = dataSourceHelper.getNumNodes()

      expect(result).toBe(0)
    })

    it('should return correct count after initialization', () => {
      const nodes = [createMockNode('node1', '127.0.0.1', 4000)]
      dataSourceHelper.initWithList(nodes)

      const result = dataSourceHelper.getNumNodes()

      expect(result).toBe(1)
    })
  })

  describe('removePotentiallyRemovedNodes', () => {
    it('should return true for node not in potentially removed set', () => {
      const node = createMockNode('node1', '127.0.0.1', 4000)
      ;(potentiallyRemoved as Set<string>).clear()

      const result = dataSourceHelper.removePotentiallyRemovedNodes(node)

      expect(result).toBe(true)
    })

    it('should return false for node in potentially removed set', () => {
      const node = createMockNode('node1', '127.0.0.1', 4000)
      ;(potentiallyRemoved as Set<string>).add('node1')

      const result = dataSourceHelper.removePotentiallyRemovedNodes(node)

      expect(result).toBe(false)
    })
  })

  describe('integration scenarios', () => {
    it('should handle complete node rotation', () => {
      const nodes = [createMockNode('node1', '127.0.0.1', 4000), createMockNode('node2', '127.0.0.2', 4001)]
      dataSourceHelper.initWithList(nodes)

      expect(dataSourceHelper.dataSourceNode.externalIp).toBe('127.0.0.1')

      const first = dataSourceHelper.tryNextDataSourceNode('test-1')
      expect(first).toBe(true)
      expect(dataSourceHelper.dataSourceNode.externalIp).toBe('127.0.0.2')

      const second = dataSourceHelper.tryNextDataSourceNode('test-2')
      expect(second).toBe(false)
      expect(dataSourceHelper.dataSourceNodeIndex).toBe(0)

      const restart = dataSourceHelper.tryRestartList('test-restart')
      expect(restart).toBe(true)
      expect(dataSourceHelper.dataSourceNode.externalIp).toBe('127.0.0.1')
    })

    it('should handle node failure and recovery', () => {
      const nodes = [
        createMockNode('node1', '127.0.0.1', 4000),
        null as any,
        createMockNode('node3', '127.0.0.3', 4002),
      ]
      dataSourceHelper.initWithList(nodes)

      const first = dataSourceHelper.tryNextDataSourceNode('test-1')
      expect(first).toBe(false)

      const second = dataSourceHelper.tryNextDataSourceNode('test-2')
      expect(second).toBe(true)
      expect(dataSourceHelper.dataSourceNode.externalIp).toBe('127.0.0.3')
    })

    it('should track counter events properly', () => {
      const nodes = [createMockNode('node1', '127.0.0.1', 4000)]
      dataSourceHelper.initWithList(nodes)

      dataSourceHelper.tryNextDataSourceNode('test-1')
      dataSourceHelper.tryRestartList('test-restart')

      expect(nestedCountersInstance.countEvent).toHaveBeenCalledTimes(2)
      expect(nestedCountersInstance.countEvent).toHaveBeenNthCalledWith(
        1,
        'sync',
        'tryNextDataSourceNode Out of tries: 0 of 1 ',
        1
      )
      expect(nestedCountersInstance.countEvent).toHaveBeenNthCalledWith(
        2,
        'sync',
        'DataSourceHelper restartList test-restart numnodes:1',
        1
      )
    })
  })
})
