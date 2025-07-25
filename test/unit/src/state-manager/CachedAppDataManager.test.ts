// Mock network module first
jest.mock('../../../../src/network', () => ({
  shardusGetTime: jest.fn(() => Date.now()),
  getTime: jest.fn(() => Date.now()),
}))

// Mock config before other imports
jest.mock('../../../../src/config', () => ({
  config: {
    p2p: {
      useNTPOffsets: false,
      cycleDuration: 60,
    },
  },
}))

// Mock nestedCounters
jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
  },
}))

// Mock fastAggregatedCorrespondingTell
jest.mock('../../../../src/utils/fastAggregatedCorrespondingTell', () => ({
  verifyCorrespondingSender: jest.fn(),
  getCorrespondingNodes: jest.fn(),
}))

// Mock type modules
jest.mock('../../../../src/types/GetCachedAppDataReq', () => ({
  serializeGetCachedAppDataReq: jest.fn((stream, req) => {
    stream.writeString(req.topic)
    stream.writeString(req.dataId)
  }),
  deserializeGetCachedAppDataReq: jest.fn(),
  GetCachedAppDataReq: {},
  TypeIdentifierEnum: { cGetCachedAppDataReq: 1 },
}))

jest.mock('../../../../src/types/GetCachedAppDataResp', () => ({
  serializeGetCachedAppDataResp: jest.fn(),
  deserializeGetCachedAppDataResp: jest.fn(),
}))

jest.mock('../../../../src/types/SendCachedAppDataReq', () => ({
  serializeSendCachedAppDataReq: jest.fn(),
  deserializeSendCachedAppDataReq: jest.fn(),
  SendCachedAppDataReq: {},
}))

jest.mock('../../../../src/types/Helpers', () => ({
  getStreamWithTypeCheck: jest.fn(),
  requestErrorHandler: jest.fn(),
  verificationDataCombiner: jest.fn(),
  estimateBinarySizeOfObject: jest.fn((obj) => JSON.stringify(obj).length),
}))

// Mock lib-types Uint8ArrayWriter
jest.mock('@shardeum-foundation/lib-types', () => {
  const original = jest.requireActual('@shardeum-foundation/lib-types')
  return {
    ...(original || {}),
    Uint8ArrayWriter: jest.fn().mockImplementation(function (size) {
      this.writeByte = jest.fn()
      this.writeString = jest.fn()
      this.getBuffer = jest.fn(() => Buffer.from([1, 2, 3]))
      return this
    }),
  }
})

// Mock profiler
jest.mock('../../../../src/utils/profiler', () => ({
  profilerInstance: {
    scopedProfileSectionStart: jest.fn(),
    scopedProfileSectionEnd: jest.fn(),
  },
  default: jest.fn(),
}))

// Mock logger flags
jest.mock('../../../../src/logger', () => ({
  default: jest.fn(),
  logFlags: {
    error: false,
    verbose: false,
    shardedCache: true, // Enable for the tests that need it
    net_trace: false,
    playback: false,
  },
}))

// Mock NodeList
jest.mock('../../../../src/p2p/NodeList', () => ({
  nodes: new Map(),
}))

// Mock other dependencies
jest.mock('../../../../src/state-manager')
jest.mock('../../../../src/crypto')
jest.mock('../../../../src/p2p/Context')

import { P2P as P2PTypes } from '@shardeum-foundation/lib-types'
import CachedAppDataManager from '../../../../src/state-manager/CachedAppDataManager'
import StateManager from '../../../../src/state-manager'
import Crypto from '../../../../src/crypto'
import Logger from '../../../../src/logger'
import { P2PModuleContext as P2P } from '../../../../src/p2p/Context'
import * as Shardus from '../../../../src/shardus/shardus-types'
import Profiler from '../../../../src/utils/profiler'
import { CachedAppData, CacheTopic, QueueEntry } from '../../../../src/state-manager/state-manager-types'
import * as NodeList from '../../../../src/p2p/NodeList'
import { InternalRouteEnum } from '../../../../src/types/enum/InternalRouteEnum'

describe('CachedAppDataManager', () => {
  let cachedAppDataManager: CachedAppDataManager
  let mockStateManager: jest.Mocked<StateManager>
  let mockProfiler: jest.Mocked<Profiler>
  let mockApp: Shardus.App
  let mockLogger: jest.Mocked<Logger>
  let mockCrypto: jest.Mocked<Crypto>
  let mockP2P: jest.Mocked<P2P>
  let mockConfig: Shardus.StrictServerConfiguration

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Create mock instances
    mockStateManager = {
      statemanager_fatal: jest.fn(),
      currentCycleShardData: {
        cycleNumber: 10,
        nodeShardData: {
          node: {
            id: 'test-node-id',
          },
        },
        shardGlobals: {
          consensusRadius: 5,
        },
        nodes: [],
        parititionShardDataMap: new Map(),
        ourNode: {
          id: 'test-node-id',
        },
      },
      transactionQueue: {
        getQueueEntry: jest.fn(),
        getConsenusGroupForAccount: jest.fn(),
        getStartAndEndIndexOfTargetGroup: jest.fn(),
        isAccountRemote: jest.fn(),
        getRandomConsensusNodeForAccount: jest.fn(),
      } as any,
      filterValidNodesForInternalMessage: jest.fn(),
      waitForShardData: jest.fn(),
      accountGlobals: {
        isGlobalAccount: jest.fn(),
      } as any,
      isNodeValidForInternalMessage: jest.fn(),
      getAccountFailDump: jest.fn(),
    } as any

    mockProfiler = {} as any

    mockApp = {} as any

    mockLogger = {
      getLogger: jest.fn().mockReturnValue({
        error: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
      }),
      playbackLogNote: jest.fn(),
    } as any

    mockCrypto = {} as any

    mockP2P = {
      registerInternalBinary: jest.fn(),
      tellBinary: jest.fn(),
      askBinary: jest.fn(),
    } as any

    mockConfig = {
      p2p: {
        cycleDuration: 60,
        useFactCorrespondingTell: false,
        useBinarySerializedEndpoints: true,
        sendCachedAppDataBinary: true,
        getCachedAppDataBinary: true,
      },
    } as any

    // Create instance
    cachedAppDataManager = new CachedAppDataManager(
      mockStateManager,
      mockProfiler,
      mockApp,
      mockLogger,
      mockCrypto,
      mockP2P,
      mockConfig
    )

    // Ensure statemanager_fatal is properly bound
    cachedAppDataManager.statemanager_fatal = mockStateManager.statemanager_fatal
  })

  afterEach(() => {
    jest.clearAllTimers()
  })

  describe('constructor', () => {
    it('should initialize with provided dependencies', () => {
      expect(cachedAppDataManager.app).toBe(mockApp)
      expect(cachedAppDataManager.crypto).toBe(mockCrypto)
      expect(cachedAppDataManager.config).toBe(mockConfig)
      expect(cachedAppDataManager.profiler).toBe(mockProfiler)
      expect(cachedAppDataManager.p2p).toBe(mockP2P)
      expect(cachedAppDataManager.stateManager).toBe(mockStateManager)
    })

    it('should initialize empty cacheTopicMap', () => {
      expect(cachedAppDataManager.cacheTopicMap).toBeInstanceOf(Map)
      expect(cachedAppDataManager.cacheTopicMap.size).toBe(0)
    })

    it('should set up pruning interval', () => {
      jest.useFakeTimers()
      const setIntervalSpy = jest.spyOn(global, 'setInterval')

      // Create a new instance to capture the setInterval call
      new CachedAppDataManager(mockStateManager, mockProfiler, mockApp, mockLogger, mockCrypto, mockP2P, mockConfig)

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), mockConfig.p2p.cycleDuration * 1000)

      setIntervalSpy.mockRestore()
      jest.useRealTimers()
    })

    it('should handle null logger gracefully', () => {
      const managerWithNullLogger = new CachedAppDataManager(
        mockStateManager,
        mockProfiler,
        mockApp,
        null as any,
        mockCrypto,
        mockP2P,
        mockConfig
      )

      expect(managerWithNullLogger.mainLogger).toBeUndefined()
      expect(managerWithNullLogger.fatalLogger).toBeUndefined()
    })

    it('should get loggers from logger instance', () => {
      expect(mockLogger.getLogger).toHaveBeenCalledWith('main')
      expect(mockLogger.getLogger).toHaveBeenCalledWith('fatal')
      expect(mockLogger.getLogger).toHaveBeenCalledWith('shardDump')
      expect(mockLogger.getLogger).toHaveBeenCalledWith('statsDump')
    })
  })

  describe('registerTopic', () => {
    it('should register a new topic successfully', () => {
      const topic = 'test-topic'
      const maxCycleAge = 10
      const maxCacheElements = 100

      const result = cachedAppDataManager.registerTopic(topic, maxCycleAge, maxCacheElements)

      expect(result).toBe(true)
      expect(cachedAppDataManager.cacheTopicMap.has(topic)).toBe(true)

      const cacheTopic = cachedAppDataManager.cacheTopicMap.get(topic)
      expect(cacheTopic).toMatchObject({
        topic,
        maxCycleAge,
        maxCacheElements,
        maxItemSize: Number.MAX_VALUE,
      })
      expect(cacheTopic.cacheAppDataMap).toBeInstanceOf(Map)
      expect(cacheTopic.cachedAppDataArray).toEqual([])
    })

    it('should return false when registering duplicate topic', () => {
      const topic = 'test-topic'

      cachedAppDataManager.registerTopic(topic, 10, 100)
      const result = cachedAppDataManager.registerTopic(topic, 20, 200)

      expect(result).toBe(false)
      // Original values should be preserved
      const cacheTopic = cachedAppDataManager.cacheTopicMap.get(topic)
      expect(cacheTopic.maxCycleAge).toBe(10)
      expect(cacheTopic.maxCacheElements).toBe(100)
    })

    it('should handle edge cases for maxCycleAge and maxCacheElements', () => {
      const result1 = cachedAppDataManager.registerTopic('topic1', 0, 100)
      const result2 = cachedAppDataManager.registerTopic('topic2', 10, 0)
      const result3 = cachedAppDataManager.registerTopic('topic3', -1, -1)

      expect(result1).toBe(true)
      expect(result2).toBe(true)
      expect(result3).toBe(true)

      expect(cachedAppDataManager.cacheTopicMap.get('topic1').maxCycleAge).toBe(0)
      expect(cachedAppDataManager.cacheTopicMap.get('topic2').maxCacheElements).toBe(0)
      expect(cachedAppDataManager.cacheTopicMap.get('topic3').maxCycleAge).toBe(-1)
    })
  })

  describe('getCachedItem', () => {
    beforeEach(() => {
      cachedAppDataManager.registerTopic('test-topic', 10, 100)
    })

    it('should return cached item when it exists', () => {
      const topic = 'test-topic'
      const dataID = 'data-123'
      const appData = { test: 'data' }
      const cycle = 5

      // Insert item first
      cachedAppDataManager.insertCachedItem(topic, dataID, appData, cycle)

      const result = cachedAppDataManager.getCachedItem(topic, dataID)

      expect(result).toEqual({
        dataID,
        appData,
        cycle,
      })
    })

    it('should return undefined when topic does not exist', () => {
      const result = cachedAppDataManager.getCachedItem('non-existent-topic', 'data-123')
      expect(result).toBeUndefined()
    })

    it('should return undefined when item does not exist in topic', () => {
      const result = cachedAppDataManager.getCachedItem('test-topic', 'non-existent-data')
      expect(result).toBeUndefined()
    })

    it('should handle multiple items in same topic', () => {
      const topic = 'test-topic'

      cachedAppDataManager.insertCachedItem(topic, 'data-1', { value: 1 }, 1)
      cachedAppDataManager.insertCachedItem(topic, 'data-2', { value: 2 }, 2)
      cachedAppDataManager.insertCachedItem(topic, 'data-3', { value: 3 }, 3)

      expect(cachedAppDataManager.getCachedItem(topic, 'data-2')).toEqual({
        dataID: 'data-2',
        appData: { value: 2 },
        cycle: 2,
      })
    })
  })

  describe('insertCachedItem', () => {
    beforeEach(() => {
      cachedAppDataManager.registerTopic('test-topic', 10, 100)
    })

    it('should insert new cached item successfully', () => {
      const topic = 'test-topic'
      const dataID = 'data-123'
      const appData = { test: 'data' }
      const cycle = 5

      cachedAppDataManager.insertCachedItem(topic, dataID, appData, cycle)

      const cacheTopic = cachedAppDataManager.cacheTopicMap.get(topic)
      expect(cacheTopic.cacheAppDataMap.has(dataID)).toBe(true)
      expect(cacheTopic.cachedAppDataArray).toHaveLength(1)
      expect(cacheTopic.cachedAppDataArray[0]).toEqual({
        dataID,
        appData,
        cycle,
      })
    })

    it('should not insert duplicate items', () => {
      const topic = 'test-topic'
      const dataID = 'data-123'

      cachedAppDataManager.insertCachedItem(topic, dataID, { value: 1 }, 1)
      cachedAppDataManager.insertCachedItem(topic, dataID, { value: 2 }, 2)

      const cacheTopic = cachedAppDataManager.cacheTopicMap.get(topic)
      expect(cacheTopic.cachedAppDataArray).toHaveLength(1)
      expect(cacheTopic.cachedAppDataArray[0].appData).toEqual({ value: 1 })
    })

    it('should not insert if topic is not registered', () => {
      const statemanagerFatalSpy = jest.spyOn(mockStateManager, 'statemanager_fatal')

      cachedAppDataManager.insertCachedItem('non-existent-topic', 'data-123', {}, 1)

      expect(statemanagerFatalSpy).toHaveBeenCalledWith(
        'insertCachedItem',
        'Topic non-existent-topic is not registered yet.'
      )
    })

    it('should not insert if max cache elements reached', () => {
      const topic = 'limited-topic'
      cachedAppDataManager.registerTopic(topic, 10, 2) // Max 2 elements

      cachedAppDataManager.insertCachedItem(topic, 'data-1', {}, 1)
      cachedAppDataManager.insertCachedItem(topic, 'data-2', {}, 2)

      const statemanagerFatalSpy = jest.spyOn(mockStateManager, 'statemanager_fatal')
      cachedAppDataManager.insertCachedItem(topic, 'data-3', {}, 3)

      expect(statemanagerFatalSpy).toHaveBeenCalledWith(
        'insertCachedItem',
        'Topic limited-topic is at max cache count limit'
      )

      const cacheTopic = cachedAppDataManager.cacheTopicMap.get(topic)
      expect(cacheTopic.cachedAppDataArray).toHaveLength(2)
    })
  })

  describe('setMemoryLimit', () => {
    it('should set memory limit for registered topic', () => {
      const topic = 'test-topic'
      const maxItemSize = 1000

      cachedAppDataManager.registerTopic(topic, 10, 100)
      cachedAppDataManager.setMemoryLimit(topic, maxItemSize)

      const cacheTopic = cachedAppDataManager.cacheTopicMap.get(topic)
      expect(cacheTopic.maxItemSize).toBe(maxItemSize)
    })

    it('should call statemanager_fatal for unregistered topic', () => {
      const statemanagerFatalSpy = jest.spyOn(mockStateManager, 'statemanager_fatal')

      cachedAppDataManager.setMemoryLimit('non-existent-topic', 1000)

      expect(statemanagerFatalSpy).toHaveBeenCalledWith(
        'setMemoryLimit',
        'Topic non-existent-topic is not registered yet.'
      )
    })

    it('should handle edge cases for maxItemSize', () => {
      const topic = 'test-topic'
      cachedAppDataManager.registerTopic(topic, 10, 100)

      cachedAppDataManager.setMemoryLimit(topic, 0)
      expect(cachedAppDataManager.cacheTopicMap.get(topic).maxItemSize).toBe(0)

      cachedAppDataManager.setMemoryLimit(topic, -1)
      expect(cachedAppDataManager.cacheTopicMap.get(topic).maxItemSize).toBe(-1)

      cachedAppDataManager.setMemoryLimit(topic, Number.MAX_SAFE_INTEGER)
      expect(cachedAppDataManager.cacheTopicMap.get(topic).maxItemSize).toBe(Number.MAX_SAFE_INTEGER)
    })
  })

  describe('pruneCachedItems', () => {
    beforeEach(() => {
      cachedAppDataManager.registerTopic('test-topic', 2, 3) // maxCycleAge: 2, maxCacheElements: 3
    })

    it('should prune items older than maxCycleAge', () => {
      const topic = 'test-topic'

      // Insert items with different cycles
      cachedAppDataManager.insertCachedItem(topic, 'data-1', { value: 1 }, 5)
      cachedAppDataManager.insertCachedItem(topic, 'data-2', { value: 2 }, 8)
      cachedAppDataManager.insertCachedItem(topic, 'data-3', { value: 3 }, 10)

      // Set current cycle to 12 (data-1 and data-2 should be pruned as they're older than maxCycleAge of 2)
      mockStateManager.currentCycleShardData.cycleNumber = 12

      cachedAppDataManager.pruneCachedItems()

      const cacheTopic = cachedAppDataManager.cacheTopicMap.get(topic)
      expect(cacheTopic.cachedAppDataArray).toHaveLength(1)
      expect(cacheTopic.cacheAppDataMap.has('data-1')).toBe(false)
      expect(cacheTopic.cacheAppDataMap.has('data-2')).toBe(false)
      expect(cacheTopic.cacheAppDataMap.has('data-3')).toBe(true)
    })

    it('should prune items exceeding maxCacheElements', () => {
      // Create a topic with maxCacheElements = 5 initially
      cachedAppDataManager.registerTopic('test-topic-2', 10, 5)

      // Insert 5 items
      for (let i = 1; i <= 5; i++) {
        cachedAppDataManager.insertCachedItem('test-topic-2', `data-${i}`, { value: i }, 10)
      }

      // Now change the limit to 3 and prune
      const cacheTopic = cachedAppDataManager.cacheTopicMap.get('test-topic-2')
      cacheTopic.maxCacheElements = 3

      mockStateManager.currentCycleShardData.cycleNumber = 11

      cachedAppDataManager.pruneCachedItems()

      expect(cacheTopic.cachedAppDataArray).toHaveLength(3)
      // Should keep the last 3 items as the pruning processes from the beginning when count exceeds max
      expect(cacheTopic.cacheAppDataMap.has('data-3')).toBe(true)
      expect(cacheTopic.cacheAppDataMap.has('data-4')).toBe(true)
      expect(cacheTopic.cacheAppDataMap.has('data-5')).toBe(true)
      expect(cacheTopic.cacheAppDataMap.has('data-1')).toBe(false)
      expect(cacheTopic.cacheAppDataMap.has('data-2')).toBe(false)
    })

    it('should handle multiple topics independently', () => {
      cachedAppDataManager.registerTopic('topic-2', 1, 2)

      // Add items to both topics
      cachedAppDataManager.insertCachedItem('test-topic', 'data-1', {}, 8)
      cachedAppDataManager.insertCachedItem('test-topic', 'data-2', {}, 9)
      cachedAppDataManager.insertCachedItem('topic-2', 'data-a', {}, 9)
      cachedAppDataManager.insertCachedItem('topic-2', 'data-b', {}, 10)

      mockStateManager.currentCycleShardData.cycleNumber = 11

      cachedAppDataManager.pruneCachedItems()

      const cacheTopic1 = cachedAppDataManager.cacheTopicMap.get('test-topic')
      const cacheTopic2 = cachedAppDataManager.cacheTopicMap.get('topic-2')

      // test-topic: maxCycleAge 2, only data-2 should remain (data-1 is 3 cycles old)
      expect(cacheTopic1.cachedAppDataArray).toHaveLength(1)
      expect(cacheTopic1.cacheAppDataMap.has('data-2')).toBe(true)
      expect(cacheTopic1.cacheAppDataMap.has('data-1')).toBe(false)

      // topic-2: maxCycleAge 1, so data-a should be pruned
      expect(cacheTopic2.cachedAppDataArray).toHaveLength(1)
      expect(cacheTopic2.cacheAppDataMap.has('data-b')).toBe(true)
      expect(cacheTopic2.cacheAppDataMap.has('data-a')).toBe(false)
    })

    it('should handle empty cache topics', () => {
      // No items inserted
      expect(() => cachedAppDataManager.pruneCachedItems()).not.toThrow()

      const cacheTopic = cachedAppDataManager.cacheTopicMap.get('test-topic')
      expect(cacheTopic.cachedAppDataArray).toHaveLength(0)
      expect(cacheTopic.cacheAppDataMap.size).toBe(0)
    })
  })

  describe('setupHandlers', () => {
    it('should register binary handlers for send and get cached app data', () => {
      cachedAppDataManager.setupHandlers()

      expect(mockP2P.registerInternalBinary).toHaveBeenCalledTimes(2)
      expect(mockP2P.registerInternalBinary).toHaveBeenCalledWith(
        InternalRouteEnum.binary_send_cachedAppData,
        expect.any(Function)
      )
      expect(mockP2P.registerInternalBinary).toHaveBeenCalledWith(
        InternalRouteEnum.binary_get_cached_app_data,
        expect.any(Function)
      )
    })
  })

  describe('factValidateCorrespondingCachedAppDataSender', () => {
    beforeEach(() => {
      mockConfig.p2p.useFactCorrespondingTell = true

      // Mock NodeList
      const mockNode = { id: 'sender-node-id' }
      ;(NodeList.nodes as Map<string, any>).set('sender-node-id', mockNode)

      // Mock consensus group
      const consensusGroup = [{ id: 'sender-node-id' }, { id: 'node-2' }, { id: 'node-3' }]
      ;(mockStateManager.transactionQueue.getConsenusGroupForAccount as jest.Mock).mockReturnValue(consensusGroup)
      ;(mockStateManager.transactionQueue.getStartAndEndIndexOfTargetGroup as jest.Mock).mockReturnValue({
        startIndex: 0,
        endIndex: 2,
      })
    })

    afterEach(() => {
      ;(NodeList.nodes as Map<string, any>).clear()
    })

    it('should return false if sender node is null', () => {
      const result = cachedAppDataManager.factValidateCorrespondingCachedAppDataSender(
        'data-id',
        'non-existent-node',
        'execution-shard-key',
        'tx-123'
      )

      expect(result).toBe(false)
    })

    it('should return false if sender is not in execution group', () => {
      const consensusGroup = [{ id: 'node-2' }, { id: 'node-3' }]
      ;(mockStateManager.transactionQueue.getConsenusGroupForAccount as jest.Mock).mockReturnValue(consensusGroup)

      const result = cachedAppDataManager.factValidateCorrespondingCachedAppDataSender(
        'data-id',
        'sender-node-id',
        'execution-shard-key',
        'tx-123'
      )

      expect(result).toBe(false)
    })

    it('should validate correct FACT sender', () => {
      // Import and mock verifyCorrespondingSender
      const { verifyCorrespondingSender } = require('../../../../src/utils/fastAggregatedCorrespondingTell')
      verifyCorrespondingSender.mockReturnValue(true)

      const result = cachedAppDataManager.factValidateCorrespondingCachedAppDataSender(
        'data-id',
        'sender-node-id',
        'execution-shard-key',
        'tx-123'
      )

      expect(result).toBe(true)
      expect(verifyCorrespondingSender).toHaveBeenCalled()
    })
  })

  describe('getLocalOrRemoteCachedAppData', () => {
    beforeEach(() => {
      cachedAppDataManager.registerTopic('test-topic', 10, 100)
    })

    it('should return local cached data when available', async () => {
      const dataId = 'local-data-123'
      const appData = { value: 'test' }

      cachedAppDataManager.insertCachedItem('test-topic', dataId, appData, 5)
      ;(mockStateManager.accountGlobals.isGlobalAccount as jest.Mock).mockReturnValue(false)
      ;(mockStateManager.transactionQueue.isAccountRemote as jest.Mock).mockReturnValue(false)

      const result = await cachedAppDataManager.getLocalOrRemoteCachedAppData('test-topic', dataId)

      expect(result).toEqual({
        dataID: dataId,
        appData,
        cycle: 5,
      })
    })

    it('should return null when local data not found', async () => {
      ;(mockStateManager.accountGlobals.isGlobalAccount as jest.Mock).mockReturnValue(false)
      ;(mockStateManager.transactionQueue.isAccountRemote as jest.Mock).mockReturnValue(false)

      const result = await cachedAppDataManager.getLocalOrRemoteCachedAppData('test-topic', 'non-existent')

      expect(result).toBeNull()
    })

    it('should fetch remote cached data', async () => {
      const dataId = 'remote-data-123'
      const appData = { value: 'remote' }

      // Ensure currentCycleShardData is set
      mockStateManager.currentCycleShardData = {
        cycleNumber: 10,
        nodeShardData: { node: { id: 'test-node-id' } },
        shardGlobals: { consensusRadius: 5 },
        nodes: new Array(10), // More nodes than consensus radius to trigger remote logic
      } as any
      ;(mockStateManager.accountGlobals.isGlobalAccount as jest.Mock).mockReturnValue(false)
      ;(mockStateManager.transactionQueue.isAccountRemote as jest.Mock).mockReturnValue(true)
      ;(mockStateManager.transactionQueue.getRandomConsensusNodeForAccount as jest.Mock).mockReturnValue({
        id: 'remote-node',
        ip: '1.2.3.4',
        port: 1234,
      })
      ;(mockStateManager.isNodeValidForInternalMessage as jest.Mock).mockReturnValue(true)

      mockP2P.askBinary.mockResolvedValue({
        cachedAppData: {
          dataID: dataId,
          appData,
          cycle: 10,
        },
      })

      const result = await cachedAppDataManager.getLocalOrRemoteCachedAppData('test-topic', dataId)

      expect(result).toEqual({
        dataID: dataId,
        appData,
        cycle: 10,
      })
      expect(mockP2P.askBinary).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'remote-node' }),
        InternalRouteEnum.binary_get_cached_app_data,
        { topic: 'test-topic', dataId },
        expect.any(Function),
        expect.any(Function),
        {}
      )
    })

    it('should handle remote request failures', async () => {
      // Ensure currentCycleShardData is set
      mockStateManager.currentCycleShardData = {
        cycleNumber: 10,
        nodeShardData: { node: { id: 'test-node-id' } },
        shardGlobals: { consensusRadius: 5 },
        nodes: new Array(10), // More nodes than consensus radius to trigger remote logic
      } as any
      ;(mockStateManager.accountGlobals.isGlobalAccount as jest.Mock).mockReturnValue(false)
      ;(mockStateManager.transactionQueue.isAccountRemote as jest.Mock).mockReturnValue(true)
      ;(mockStateManager.transactionQueue.getRandomConsensusNodeForAccount as jest.Mock).mockReturnValue({
        id: 'remote-node',
        ip: '1.2.3.4',
        port: 1234,
      })
      ;(mockStateManager.isNodeValidForInternalMessage as jest.Mock).mockReturnValue(true)

      mockP2P.askBinary.mockRejectedValue(new Error('Network error'))

      const result = await cachedAppDataManager.getLocalOrRemoteCachedAppData('test-topic', 'data-123')

      expect(result).toBeNull()
    })

    it('should wait for shard data if not available', async () => {
      // Set currentCycleShardData to null initially
      mockStateManager.currentCycleShardData = null

      // Mock waitForShardData to set the shard data when called
      ;(mockStateManager.waitForShardData as jest.Mock).mockImplementation(() => {
        mockStateManager.currentCycleShardData = {
          cycleNumber: 10,
          nodeShardData: { node: { id: 'test-node-id' } },
          shardGlobals: { consensusRadius: 5 },
          nodes: [],
        } as any
        return Promise.resolve()
      })
      ;(mockStateManager.accountGlobals.isGlobalAccount as jest.Mock).mockReturnValue(false)
      ;(mockStateManager.transactionQueue.isAccountRemote as jest.Mock).mockReturnValue(false)

      const result = await cachedAppDataManager.getLocalOrRemoteCachedAppData('test-topic', 'data-123')

      expect(mockStateManager.waitForShardData).toHaveBeenCalled()
      expect(result).toBeNull()
    })
  })

  describe('insertCachedItem with size limits', () => {
    beforeEach(() => {
      // Enable shardedCache flag for these tests
      require('../../../../src/logger').logFlags.shardedCache = true

      cachedAppDataManager.registerTopic('test-topic', 10, 100)
      cachedAppDataManager.setMemoryLimit('test-topic', 100) // Set a small memory limit
    })

    afterEach(() => {
      // Reset the flag
      require('../../../../src/logger').logFlags.shardedCache = false
    })

    it('should not insert item exceeding maxItemSize', () => {
      const topic = 'test-topic'
      const largeData = { data: 'x'.repeat(1000) } // Large data that exceeds size limit

      // Ensure estimateBinarySizeOfObject mock returns a large value
      const { estimateBinarySizeOfObject } = require('../../../../src/types/Helpers')
      estimateBinarySizeOfObject.mockReturnValue(1050) // Larger than maxItemSize of 100

      const statemanagerFatalSpy = jest.spyOn(mockStateManager, 'statemanager_fatal')

      cachedAppDataManager.insertCachedItem(topic, 'large-data', largeData, 1)

      expect(statemanagerFatalSpy).toHaveBeenCalledWith('insertCachedItem', 'Topic test-topic is at max size limit')

      const cacheTopic = cachedAppDataManager.cacheTopicMap.get(topic)
      expect(cacheTopic.cachedAppDataArray).toHaveLength(0)
      expect(cacheTopic.cacheAppDataMap.size).toBe(0)
    })
  })

  describe('binary handler execution', () => {
    let sendCachedAppDataHandler: Function
    let getCachedAppDataHandler: Function

    beforeEach(() => {
      cachedAppDataManager.setupHandlers()

      // Capture the registered handlers
      const calls = (mockP2P.registerInternalBinary as jest.Mock).mock.calls
      sendCachedAppDataHandler = calls.find((call) => call[0] === InternalRouteEnum.binary_send_cachedAppData)[1]
      getCachedAppDataHandler = calls.find((call) => call[0] === InternalRouteEnum.binary_get_cached_app_data)[1]

      cachedAppDataManager.registerTopic('test-topic', 10, 100)
    })

    it('should handle invalid send cached app data request', () => {
      const mockRespond = jest.fn()
      const mockHeader = { sender_id: 'sender-node' }
      const mockSign = jest.fn()

      // Mock getStreamWithTypeCheck to return null for invalid request
      const { getStreamWithTypeCheck } = require('../../../../src/types/Helpers')
      getStreamWithTypeCheck.mockReturnValue(null)

      // Send invalid payload (empty buffer)
      sendCachedAppDataHandler(Buffer.from([]), mockRespond, mockHeader, mockSign)

      // Handler should return early without processing
      expect(mockRespond).not.toHaveBeenCalled()
    })

    it('should process valid send cached app data request', () => {
      const mockRespond = jest.fn()
      const mockHeader = { sender_id: 'sender-node' }
      const mockSign = jest.fn()

      // Mock getStreamWithTypeCheck and deserialize
      const { getStreamWithTypeCheck } = require('../../../../src/types/Helpers')
      const { deserializeSendCachedAppDataReq } = require('../../../../src/types/SendCachedAppDataReq')

      const mockStream = {}
      getStreamWithTypeCheck.mockReturnValue(mockStream)
      deserializeSendCachedAppDataReq.mockReturnValue({
        topic: 'test-topic',
        txId: 'tx-123',
        executionShardKey: 'exec-key',
        cachedAppData: {
          dataID: 'data-123',
          appData: { value: 'test' },
          cycle: 5,
        },
      })

      // Send valid payload
      sendCachedAppDataHandler(Buffer.from([1, 2, 3]), mockRespond, mockHeader, mockSign)

      // Should insert the item
      const cachedItem = cachedAppDataManager.getCachedItem('test-topic', 'data-123')
      expect(cachedItem).toEqual({
        dataID: 'data-123',
        appData: { value: 'test' },
        cycle: 5,
      })
    })

    it('should handle get cached app data request', async () => {
      const mockRespond = jest.fn()
      const mockHeader = { sender_id: 'sender-node' }
      const mockSign = jest.fn()

      // First insert some data
      cachedAppDataManager.insertCachedItem('test-topic', 'data-123', { value: 'test' }, 5)

      // Mock getStreamWithTypeCheck and deserialize
      const { getStreamWithTypeCheck } = require('../../../../src/types/Helpers')
      const { deserializeGetCachedAppDataReq } = require('../../../../src/types/GetCachedAppDataReq')

      const mockStream = {}
      getStreamWithTypeCheck.mockReturnValue(mockStream)
      deserializeGetCachedAppDataReq.mockReturnValue({
        topic: 'test-topic',
        dataId: 'data-123',
      })

      await getCachedAppDataHandler(Buffer.from([1, 2, 3]), mockRespond, mockHeader, mockSign)

      expect(mockRespond).toHaveBeenCalledWith(
        expect.objectContaining({
          cachedAppData: expect.objectContaining({
            dataID: 'data-123',
            appData: { value: 'test' },
            cycle: 5,
          }),
        }),
        expect.any(Function)
      )
    })
  })

  describe('factSendCorrespondingCachedAppData', () => {
    beforeEach(() => {
      cachedAppDataManager.registerTopic('test-topic', 10, 100)

      // Mock queue entry
      const mockQueueEntry = {
        executionShardKey: 'exec-key',
        executionGroup: ['node1', 'node2', 'node3'],
        txKeys: { allKeys: ['key1'] },
      }
      ;(mockStateManager.transactionQueue.getQueueEntry as jest.Mock).mockReturnValue(mockQueueEntry)

      // Mock consensus groups
      const senderGroup = [{ id: 'test-node-id' }, { id: 'node2' }, { id: 'node3' }]
      const targetGroup = [{ id: 'target1' }, { id: 'target2' }, { id: 'target3' }]
      ;(mockStateManager.transactionQueue.getConsenusGroupForAccount as jest.Mock).mockImplementation((key: string) => {
        if (key === 'exec-key') return senderGroup
        return targetGroup
      })
      ;(mockStateManager.transactionQueue.getStartAndEndIndexOfTargetGroup as jest.Mock).mockReturnValue({
        startIndex: 3,
        endIndex: 5,
      })

      // Mock getCorrespondingNodes
      const { getCorrespondingNodes } = require('../../../../src/utils/fastAggregatedCorrespondingTell')
      getCorrespondingNodes.mockReturnValue([3, 4])

      // Mock filterValidNodesForInternalMessage
      ;(mockStateManager.filterValidNodesForInternalMessage as jest.Mock).mockImplementation((nodes) => nodes)
    })

    it('should throw error when currentCycleShardData is null', () => {
      mockStateManager.currentCycleShardData = null

      expect(() => {
        cachedAppDataManager.factSendCorrespondingCachedAppData(
          'test-topic',
          'data-123',
          { value: 'test' },
          5,
          'form-id',
          'tx-123'
        )
      }).toThrow('factSendCorrespondingCachedAppData: currentCycleShardData == null')
    })

    it('should throw error when dataID is null', () => {
      expect(() => {
        cachedAppDataManager.factSendCorrespondingCachedAppData(
          'test-topic',
          null,
          { value: 'test' },
          5,
          'form-id',
          'tx-123'
        )
      }).toThrow('factSendCorrespondingCachedAppData: dataId == null')
    })

    it('should return early when no execution group', () => {
      const mockQueueEntry = {
        executionShardKey: 'exec-key',
        executionGroup: null,
        txKeys: { allKeys: ['key1'] },
      }
      ;(mockStateManager.transactionQueue.getQueueEntry as jest.Mock).mockReturnValue(mockQueueEntry)

      cachedAppDataManager.factSendCorrespondingCachedAppData(
        'test-topic',
        'data-123',
        { value: 'test' },
        5,
        'form-id',
        'tx-123'
      )

      expect(mockP2P.tellBinary).not.toHaveBeenCalled()
    })

    it('should send to corresponding nodes', () => {
      cachedAppDataManager.factSendCorrespondingCachedAppData(
        'test-topic',
        'data-123',
        { value: 'test' },
        5,
        'form-id',
        'tx-123'
      )

      expect(mockP2P.tellBinary).toHaveBeenCalledWith(
        expect.any(Array),
        InternalRouteEnum.binary_send_cachedAppData,
        expect.objectContaining({
          topic: 'test-topic',
          txId: 'tx-123',
          executionShardKey: 'exec-key',
          cachedAppData: {
            dataID: 'data-123',
            appData: { value: 'test' },
            cycle: 5,
          },
        }),
        expect.any(Function),
        {}
      )
    })

    it('should handle edge case of sending to own node', () => {
      // Create nodes with proper structure
      const ourNode = { id: 'test-node-id' }
      const node2 = { id: 'node2' }
      const node3 = { id: 'node3' }
      const target2 = { id: 'target2' }
      const target3 = { id: 'target3' }

      const senderGroup = [ourNode, node2, node3]
      const targetGroup = [ourNode, target2, target3]

      // Create a combined allNodes array that will be sorted
      const allNodes = Array.from(new Set([...senderGroup, ...targetGroup])).sort((a, b) => a.id.localeCompare(b.id))

      // Find the actual index of our node in the sorted allNodes array
      const ourNodeIndex = allNodes.findIndex((node) => node.id === 'test-node-id')

      // Mock to return only our own node's index
      const { getCorrespondingNodes } = require('../../../../src/utils/fastAggregatedCorrespondingTell')
      getCorrespondingNodes.mockReturnValue([ourNodeIndex])
      ;(mockStateManager.transactionQueue.getConsenusGroupForAccount as jest.Mock).mockImplementation((key: string) => {
        if (key === 'exec-key') return senderGroup
        return targetGroup
      })

      // Find the actual start and end indices of the target group in allNodes
      const targetIds = targetGroup.map((n) => n.id)
      const targetIndicesInAllNodes = allNodes
        .map((node, index) => (targetIds.includes(node.id) ? index : -1))
        .filter((index) => index !== -1)
      const targetStartIndex = Math.min(...targetIndicesInAllNodes)
      const targetEndIndex = Math.max(...targetIndicesInAllNodes)

      ;(mockStateManager.transactionQueue.getStartAndEndIndexOfTargetGroup as jest.Mock).mockReturnValue({
        startIndex: targetStartIndex,
        endIndex: targetEndIndex,
      })

      cachedAppDataManager.factSendCorrespondingCachedAppData(
        'test-topic',
        'data-123',
        { value: 'test' },
        5,
        'form-id',
        'tx-123'
      )

      // Should insert locally instead of sending
      const cachedItem = cachedAppDataManager.getCachedItem('test-topic', 'data-123')
      expect(cachedItem).toEqual({
        dataID: 'data-123',
        appData: { value: 'test' },
        cycle: 5,
      })
      expect(mockP2P.tellBinary).not.toHaveBeenCalled()
    })
  })

  describe('getLocalOrRemoteCachedAppData edge cases', () => {
    beforeEach(() => {
      cachedAppDataManager.registerTopic('test-topic', 10, 100)
    })

    it('should throw error when network not ready after waiting', async () => {
      mockStateManager.currentCycleShardData = null
      ;(mockStateManager.waitForShardData as jest.Mock).mockResolvedValue(undefined)

      await expect(cachedAppDataManager.getLocalOrRemoteCachedAppData('test-topic', 'data-123')).rejects.toThrow(
        'getLocalOrRemoteCachedAppData: network not ready'
      )
    })

    it('should force local lookup for global accounts', async () => {
      ;(mockStateManager.accountGlobals.isGlobalAccount as jest.Mock).mockReturnValue(true)
      ;(mockStateManager.transactionQueue.isAccountRemote as jest.Mock).mockReturnValue(true)

      const result = await cachedAppDataManager.getLocalOrRemoteCachedAppData('test-topic', 'data-123')

      // Should not make remote call even though isAccountRemote returns true
      expect(mockP2P.askBinary).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })

    it('should return null when no valid node found after retries', async () => {
      ;(mockStateManager.accountGlobals.isGlobalAccount as jest.Mock).mockReturnValue(false)
      ;(mockStateManager.transactionQueue.isAccountRemote as jest.Mock).mockReturnValue(true)
      ;(mockStateManager.transactionQueue.getRandomConsensusNodeForAccount as jest.Mock).mockReturnValue({
        id: 'remote-node',
        ip: '1.2.3.4',
        port: 1234,
      })
      ;(mockStateManager.isNodeValidForInternalMessage as jest.Mock).mockReturnValue(false)

      const result = await cachedAppDataManager.getLocalOrRemoteCachedAppData('test-topic', 'data-123')

      expect(result).toBeNull()
      expect(mockP2P.askBinary).not.toHaveBeenCalled()
    })

    it('should return null when remote result is false', async () => {
      mockStateManager.currentCycleShardData = {
        cycleNumber: 10,
        nodeShardData: { node: { id: 'test-node-id' } },
        shardGlobals: { consensusRadius: 5 },
        nodes: new Array(10),
      } as any
      ;(mockStateManager.accountGlobals.isGlobalAccount as jest.Mock).mockReturnValue(false)
      ;(mockStateManager.transactionQueue.isAccountRemote as jest.Mock).mockReturnValue(true)
      ;(mockStateManager.transactionQueue.getRandomConsensusNodeForAccount as jest.Mock).mockReturnValue({
        id: 'remote-node',
        ip: '1.2.3.4',
        port: 1234,
      })
      ;(mockStateManager.isNodeValidForInternalMessage as jest.Mock).mockReturnValue(true)

      mockP2P.askBinary.mockResolvedValue({ cachedAppData: false })

      const result = await cachedAppDataManager.getLocalOrRemoteCachedAppData('test-topic', 'data-123')

      expect(result).toBeNull()
    })

    it('should handle small network scenario', async () => {
      // Set nodes length <= consensusRadius to trigger local lookup
      mockStateManager.currentCycleShardData = {
        cycleNumber: 10,
        nodeShardData: { node: { id: 'test-node-id' } },
        shardGlobals: { consensusRadius: 5 },
        nodes: new Array(3), // Only 3 nodes, less than consensus radius
      } as any
      ;(mockStateManager.accountGlobals.isGlobalAccount as jest.Mock).mockReturnValue(false)
      ;(mockStateManager.transactionQueue.isAccountRemote as jest.Mock).mockReturnValue(true)

      const result = await cachedAppDataManager.getLocalOrRemoteCachedAppData('test-topic', 'data-123')

      // Should not make remote call due to small network
      expect(mockP2P.askBinary).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })
  })
})
