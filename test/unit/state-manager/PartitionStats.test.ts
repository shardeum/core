// Mock all dependencies before importing the module under test
jest.mock('../../../src/logger', () => ({
  default: jest.fn().mockImplementation(() => ({
    getLogger: jest.fn().mockReturnValue({
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn()
    }),
    _internalHackGetWithResp: jest.fn()
  })),
  logFlags: {
    verbose: false,
    error: false,
    debug: false
  }
}))

jest.mock('../../../src/network', () => ({
  shardusGetTime: jest.fn(() => Date.now())
}))

jest.mock('../../../src/utils', () => ({
  makeShortHash: jest.fn((str) => str ? str.slice(0, 6) : ''),
  stringifyReduce: jest.fn((obj) => JSON.stringify(obj))
}))

jest.mock('@shardeum-foundation/lib-types', () => ({
  Utils: {
    safeStringify: jest.fn().mockImplementation((obj) => JSON.stringify(obj)),
    safeJsonParse: jest.fn().mockImplementation((str) => JSON.parse(str))
  }
}))

jest.mock('../../../src/network/debugMiddleware', () => ({
  isDebugModeMiddleware: jest.fn((req, res, next) => next())
}))

jest.mock('../../../src/p2p/Context', () => ({
  network: {
    registerExternalGet: jest.fn()
  }
}))

jest.mock('../../../src/p2p/Wrapper', () => ({
  p2p: {
    state: {
      getNodes: jest.fn().mockReturnValue([])
    }
  }
}))

jest.mock('../../../src/state-manager/AccountCache', () => {
  return jest.fn().mockImplementation(() => ({
    hasAccount: jest.fn().mockReturnValue(false),
    updateAccountHash: jest.fn(),
    getAccountHash: jest.fn()
  }))
})

import PartitionStats from '../../../src/state-manager/PartitionStats'
import { CycleShardData } from '../../../src/state-manager/state-manager-types'
import { Utils } from '@shardeum-foundation/lib-types'


describe('PartitionStats', () => {
  let partitionStats: PartitionStats
  let mockStateManager: any
  let mockProfiler: any
  let mockApp: any
  let mockLogger: any
  let mockCrypto: any
  let mockConfig: any
  let mockAccountCache: any

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Re-setup the mock implementations that get cleared
    const Utils = require('@shardeum-foundation/lib-types').Utils
    Utils.safeStringify.mockImplementation((obj) => JSON.stringify(obj))
    Utils.safeJsonParse.mockImplementation((str) => JSON.parse(str))
    
    // Also re-setup utils mocks
    const utils = require('../../../src/utils')
    utils.makeShortHash.mockImplementation((str) => str ? str.slice(0, 6) : '')
    utils.stringifyReduce.mockImplementation((obj) => JSON.stringify(obj))

    mockStateManager = {
      statemanager_fatal: jest.fn(),
      currentCycleShardData: { cycleNumber: 10 },
      shardValuesByCycle: new Map(),
      cycleDebugNotes: {},
      feature_generateStats: true,
      accountPatcher: {
        getNonParitionRanges: jest.fn().mockReturnValue([])
      }
    }

    mockProfiler = {}

    mockApp = {
      getTimestampAndHashFromAccount: jest.fn().mockReturnValue({ hash: 'mockhash', timestamp: 1234567890 }),
      dataSummaryInit: jest.fn(),
      dataSummaryUpdate: jest.fn(),
      txSummaryUpdate: jest.fn()
    }

    mockLogger = {
      getLogger: jest.fn().mockReturnValue({
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn()
      }),
      _internalHackGetWithResp: jest.fn()
    }

    mockCrypto = {}

    mockConfig = {
      debug: {
        enableSaving: false
      }
    }

    mockAccountCache = {
      hasAccount: jest.fn().mockReturnValue(false),
      updateAccountHash: jest.fn(),
      getAccountHash: jest.fn()
    }

    partitionStats = new PartitionStats(
      mockStateManager,
      mockProfiler,
      mockApp,
      mockLogger,
      mockCrypto,
      mockConfig,
      mockAccountCache
    )
  })

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(partitionStats.app).toBe(mockApp)
      expect(partitionStats.crypto).toBe(mockCrypto)
      expect(partitionStats.config).toBe(mockConfig)
      expect(partitionStats.profiler).toBe(mockProfiler)
      expect(partitionStats.stateManager).toBe(mockStateManager)
      expect(partitionStats.accountCache).toBe(mockAccountCache)
    })

    it('should initialize summary partition count to 4096', () => {
      expect(partitionStats.summaryPartitionCount).toBe(4096)
    })

    it('should initialize empty collections', () => {
      expect(partitionStats.summaryBlobByPartition).toBeInstanceOf(Map)
      expect(partitionStats.summaryBlobByPartition.size).toBe(0)
      expect(partitionStats.txSummaryBlobCollections).toEqual([])
      expect(partitionStats.workQueue).toEqual([])
    })

    it('should set invasiveDebugInfo to false by default', () => {
      expect(partitionStats.invasiveDebugInfo).toBe(false)
    })

    it('should handle null stateManager gracefully', () => {
      const nullPartitionStats = new PartitionStats(
        null as any,
        mockProfiler,
        mockApp,
        mockLogger,
        mockCrypto,
        mockConfig,
        mockAccountCache
      )
      expect(nullPartitionStats).toBeDefined()
    })
  })

  describe('getNewSummaryBlob', () => {
    it('should return a new summary blob with correct structure', () => {
      const partition = 42
      const blob = partitionStats.getNewSummaryBlob(partition)
      
      expect(blob).toEqual({
        counter: 0,
        latestCycle: 0,
        errorNull: 0,
        partition: 42,
        opaqueBlob: {}
      })
    })

    it('should create independent blob objects', () => {
      const blob1 = partitionStats.getNewSummaryBlob(1)
      const blob2 = partitionStats.getNewSummaryBlob(2)
      
      blob1.counter = 5
      expect(blob2.counter).toBe(0)
      expect(blob1.partition).toBe(1)
      expect(blob2.partition).toBe(2)
    })
  })

  describe('getSummaryBlobPartition', () => {
    it('should calculate partition from first 3 bytes of address', () => {
      const address = 'abc123456789'
      const partition = partitionStats.getSummaryBlobPartition(address)
      
      // 'abc' in hex = 0xabc = 2748
      expect(partition).toBe(2748)
    })

    it('should handle different address formats', () => {
      expect(partitionStats.getSummaryBlobPartition('000123')).toBe(0)
      expect(partitionStats.getSummaryBlobPartition('fff123')).toBe(4095)
      expect(partitionStats.getSummaryBlobPartition('123456')).toBe(291)
    })

    it('should work with short addresses', () => {
      expect(partitionStats.getSummaryBlobPartition('ab')).toBe(171) // 0xab
      expect(partitionStats.getSummaryBlobPartition('a')).toBe(10) // 0xa with implied 0s
    })
  })

  describe('getSummaryBlob', () => {
    it('should create and return blob for new partition', () => {
      const address = '123456789'
      const blob = partitionStats.getSummaryBlob(address)
      
      expect(blob).toBeDefined()
      expect(blob.partition).toBe(291) // 0x123
      expect(partitionStats.summaryBlobByPartition.has(291)).toBe(true)
    })

    it('should return existing blob for same partition', () => {
      const address = '123456789'
      const blob1 = partitionStats.getSummaryBlob(address)
      blob1.counter = 10
      
      const blob2 = partitionStats.getSummaryBlob(address)
      expect(blob2).toBe(blob1)
      expect(blob2.counter).toBe(10)
    })
  })

  describe('hasAccountBeenSeenByStats', () => {
    it('should delegate to accountCache.hasAccount', () => {
      const accountId = 'account123'
      mockAccountCache.hasAccount.mockReturnValue(true)
      
      const result = partitionStats.hasAccountBeenSeenByStats(accountId)
      
      expect(result).toBe(true)
      expect(mockAccountCache.hasAccount).toHaveBeenCalledWith(accountId)
    })

    it('should return false when account not in cache', () => {
      const accountId = 'newAccount'
      mockAccountCache.hasAccount.mockReturnValue(false)
      
      const result = partitionStats.hasAccountBeenSeenByStats(accountId)
      
      expect(result).toBe(false)
    })
  })

  describe('initTXSummaryBlobsForCycle', () => {
    it('should create a new summary blob collection for a cycle', () => {
      const cycleNumber = 5
      const collection = partitionStats.initTXSummaryBlobsForCycle(cycleNumber)
      
      expect(collection.cycle).toBe(5)
      expect(collection.blobsByPartition).toBeInstanceOf(Map)
      expect(collection.blobsByPartition.size).toBe(4096)
    })

    it('should add collection to txSummaryBlobCollections array', () => {
      expect(partitionStats.txSummaryBlobCollections.length).toBe(0)
      
      partitionStats.initTXSummaryBlobsForCycle(5)
      
      expect(partitionStats.txSummaryBlobCollections.length).toBe(1)
      expect(partitionStats.txSummaryBlobCollections[0].cycle).toBe(5)
    })

    it('should prune old collections when exceeding maxCyclesToStoreBlob', () => {
      partitionStats.maxCyclesToStoreBlob = 3
      
      // Add 4 collections
      for (let i = 1; i <= 4; i++) {
        partitionStats.initTXSummaryBlobsForCycle(i)
      }
      
      // Should only keep the last 3
      expect(partitionStats.txSummaryBlobCollections.length).toBe(3)
      expect(partitionStats.txSummaryBlobCollections[0].cycle).toBe(2)
      expect(partitionStats.txSummaryBlobCollections[2].cycle).toBe(4)
    })
  })

  describe('getOrCreateTXSummaryBlobCollectionByCycle', () => {
    it('should return existing collection for a cycle', () => {
      const collection = partitionStats.initTXSummaryBlobsForCycle(5)
      
      const retrieved = partitionStats.getOrCreateTXSummaryBlobCollectionByCycle(5)
      
      expect(retrieved).toBe(collection)
    })

    it('should create new collection if not exists', () => {
      const collection = partitionStats.getOrCreateTXSummaryBlobCollectionByCycle(7)
      
      expect(collection).toBeDefined()
      expect(collection.cycle).toBe(7)
      expect(partitionStats.txSummaryBlobCollections).toContainEqual(collection)
    })

    it('should return null for negative cycle', () => {
      const result = partitionStats.getOrCreateTXSummaryBlobCollectionByCycle(-1)
      
      expect(result).toBeNull()
    })

    it('should find collection when multiple exist', () => {
      partitionStats.initTXSummaryBlobsForCycle(3)
      partitionStats.initTXSummaryBlobsForCycle(5)
      partitionStats.initTXSummaryBlobsForCycle(7)
      
      const collection = partitionStats.getOrCreateTXSummaryBlobCollectionByCycle(5)
      
      expect(collection.cycle).toBe(5)
    })
  })

  describe('getConsensusSnapshotPartitions', () => {
    it('should return empty result when no ranges', () => {
      const cycleShardData: any = {
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      }
      
      const result = partitionStats.getConsensusSnapshotPartitions(cycleShardData)
      
      expect(result.list).toEqual([])
      expect(result.map.size).toBe(0)
    })

    it('should calculate covered partitions correctly', () => {
      const cycleShardData: any = {
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      }
      
      // Mock to return a range that excludes some partitions
      mockStateManager.accountPatcher.getNonParitionRanges.mockReturnValue([
        { low: '010000', high: '020000' } // This should exclude partitions 16-32
      ])
      
      const result = partitionStats.getConsensusSnapshotPartitions(cycleShardData)
      
      // Should include partitions outside the excluded range
      expect(result.list).not.toContain(16)
      expect(result.list).not.toContain(32)
      expect(result.map.has(16)).toBe(false)
      expect(result.map.has(32)).toBe(false)
    })

    it('should handle two ranges correctly', () => {
      const cycleShardData: any = {
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      }
      
      mockStateManager.accountPatcher.getNonParitionRanges.mockReturnValue([
        { low: '010000', high: '020000' },
        { low: '030000', high: '040000' }
      ])
      
      const result = partitionStats.getConsensusSnapshotPartitions(cycleShardData)
      
      // Should exclude both ranges
      expect(result.map.has(16)).toBe(false)
      expect(result.map.has(48)).toBe(false)
    })
  })

  describe('statsDataSummaryInit', () => {
    const accountId = 'acc123'
    const accountData = { balance: 100 }
    
    it('should update blob counter', () => {
      partitionStats.statsDataSummaryInit(5, accountId, accountData, 'test')
      
      const blob = partitionStats.getSummaryBlob(accountId)
      expect(blob.counter).toBe(1)
    })

    it('should return early if account already exists', () => {
      mockAccountCache.hasAccount.mockReturnValue(true)
      
      partitionStats.statsDataSummaryInit(5, accountId, accountData, 'test')
      
      expect(mockApp.getTimestampAndHashFromAccount).not.toHaveBeenCalled()
    })

    it('should update account cache for new account', () => {
      mockAccountCache.hasAccount.mockReturnValue(false)
      
      partitionStats.statsDataSummaryInit(5, accountId, accountData, 'test')
      
      expect(mockApp.getTimestampAndHashFromAccount).toHaveBeenCalledWith(accountData)
      expect(mockAccountCache.updateAccountHash).toHaveBeenCalledWith(
        accountId,
        'mockhash',
        1234567890,
        5
      )
    })

    it('should handle null account data', () => {
      partitionStats.statsDataSummaryInit(5, accountId, null, 'test')
      
      const blob = partitionStats.getSummaryBlob(accountId)
      expect(blob.errorNull).toBe(1)
    })

    it('should add work to queue when stats enabled', () => {
      mockStateManager.feature_generateStats = true
      
      partitionStats.statsDataSummaryInit(5, accountId, accountData, 'test')
      
      expect(partitionStats.workQueue.length).toBe(1)
      expect(partitionStats.workQueue[0].cycle).toBe(5)
    })
  })

  describe('statsDataSummaryUpdate', () => {
    const accountId = 'acc123'
    const accountBefore = { balance: 100 }
    const accountAfter = {
      accountId: accountId,
      data: { balance: 200 },
      timestamp: 1234567891,
      stateId: 'newhash'
    }
    
    it('should update blob counter', () => {
      partitionStats.statsDataSummaryUpdate(5, accountBefore, accountAfter, 'test')
      
      const blob = partitionStats.getSummaryBlob(accountId)
      expect(blob.counter).toBe(1)
    })

    it('should handle null account data after', () => {
      const nullAfter = { ...accountAfter, data: null }
      
      partitionStats.statsDataSummaryUpdate(5, accountBefore, nullAfter, 'test')
      
      const blob = partitionStats.getSummaryBlob(accountId)
      expect(blob.errorNull).toBe(100000000)
    })

    it('should handle null account data before', () => {
      partitionStats.statsDataSummaryUpdate(5, null, accountAfter, 'test')
      
      const blob = partitionStats.getSummaryBlob(accountId)
      expect(blob.errorNull).toBe(10000000000)
    })

    it('should skip update if cached timestamp is newer', () => {
      mockAccountCache.hasAccount.mockReturnValue(true)
      mockAccountCache.getAccountHash.mockReturnValue({ t: 1234567892 })
      
      partitionStats.statsDataSummaryUpdate(5, accountBefore, accountAfter, 'test')
      
      expect(partitionStats.workQueue.length).toBe(0)
    })

    it('should add work to queue when stats enabled', () => {
      mockStateManager.feature_generateStats = true
      mockAccountCache.hasAccount.mockReturnValue(false)
      
      partitionStats.statsDataSummaryUpdate(5, accountBefore, accountAfter, 'test')
      
      expect(partitionStats.workQueue.length).toBe(1)
      expect(partitionStats.workQueue[0].cycle).toBe(5)
    })
  })

  describe('statsTxSummaryUpdate', () => {
    const queueEntry: any = {
      cycleToRecordOn: 5,
      logID: 'tx123',
      uniqueWritableKeys: ['acc123'],
      acceptedTx: {
        data: { amount: 100 }
      }
    }
    
    it('should skip if no writable keys', () => {
      const emptyEntry = { ...queueEntry, uniqueWritableKeys: [] }
      
      partitionStats.statsTxSummaryUpdate(5, emptyEntry)
      
      expect(mockApp.txSummaryUpdate).not.toHaveBeenCalled()
    })

    it('should update TX blob for partition', () => {
      const collection = partitionStats.initTXSummaryBlobsForCycle(5)
      
      partitionStats.statsTxSummaryUpdate(5, queueEntry)
      
      expect(mockApp.txSummaryUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        queueEntry.acceptedTx.data,
        null
      )
    })

    it('should increment blob counter', () => {
      partitionStats.initTXSummaryBlobsForCycle(5)
      
      partitionStats.statsTxSummaryUpdate(5, queueEntry)
      
      const partition = partitionStats.getSummaryBlobPartition('acc123')
      const collection = partitionStats.getOrCreateTXSummaryBlobCollectionByCycle(5)
      const blob = collection.blobsByPartition.get(partition)
      
      expect(blob.counter).toBe(1)
    })

    it('should handle missing collection', () => {
      // Don't create collection - use a cycle that doesn't exist
      const missingCycleEntry = { ...queueEntry, cycleToRecordOn: -1 }
      
      partitionStats.statsTxSummaryUpdate(10, missingCycleEntry)
      
      expect(mockApp.txSummaryUpdate).not.toHaveBeenCalled()
    })

    it('should use first writable key for partitioning', () => {
      const keys = ['abc123', 'def456', 'ghi789']  // Use keys that start with valid hex chars
      const multiKeyEntry = { 
        ...queueEntry, 
        uniqueWritableKeys: keys 
      }
      const collection = partitionStats.initTXSummaryBlobsForCycle(5)
      
      partitionStats.statsTxSummaryUpdate(5, multiKeyEntry)
      
      // Should use 'abc123' for partition calculation
      const partition = partitionStats.getSummaryBlobPartition('abc123')
      const blob = collection.blobsByPartition.get(partition)
      
      expect(blob).toBeDefined()
      expect(blob.counter).toBe(1)
      expect(mockApp.txSummaryUpdate).toHaveBeenCalled()
    })
  })

  describe('buildStatsReport', () => {
    it('should execute queued work for current cycle', () => {
      const fn1 = jest.fn()
      const fn2 = jest.fn()
      
      partitionStats.workQueue = [
        { cycle: 3, fn: fn1, args: ['arg1'] },
        { cycle: 5, fn: fn2, args: ['arg2'] },
        { cycle: 7, fn: jest.fn(), args: [] }
      ]
      
      const cycleShardData: any = {
        cycleNumber: 5,
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      }
      
      partitionStats.buildStatsReport(cycleShardData)
      
      expect(fn1).toHaveBeenCalledWith('arg1')
      expect(fn2).toHaveBeenCalledWith('arg2')
      expect(partitionStats.workQueue.length).toBe(1) // Only cycle 7 remains
    })

    it('should handle null cycleShardData', () => {
      // The method tries to access cycleShardData.cycleNumber first, so it will throw
      expect(() => partitionStats.buildStatsReport(null as any)).toThrow()
    })

    it('should include covered partitions in report', () => {
      const cycleShardData: any = {
        cycleNumber: 5,
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      }
      
      // Create some data blobs
      const blob1 = partitionStats.getSummaryBlob('123456')
      blob1.counter = 5
      
      // Mock to include all partitions
      mockStateManager.accountPatcher.getNonParitionRanges.mockReturnValue([])
      
      const report = partitionStats.buildStatsReport(cycleShardData)
      
      expect(report.covered).toEqual([])
      expect(report.error).toBe(false)
    })

    it('should exclude empty blobs by default', () => {
      const cycleShardData: any = {
        cycleNumber: 5,
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      }
      
      // Create empty blob
      partitionStats.getSummaryBlob('aaa111')
      
      // Mock to include partition
      mockStateManager.accountPatcher.getNonParitionRanges.mockReturnValue([
        { low: 'bbb000', high: 'fff000' }
      ])
      
      const report = partitionStats.buildStatsReport(cycleShardData)
      
      expect(report.dataStats.length).toBe(0)
    })

    it('should include TX stats in report', () => {
      const cycleShardData: any = {
        cycleNumber: 5,
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      }
      
      // Create TX blob collection
      const collection = partitionStats.initTXSummaryBlobsForCycle(5)
      const blob = collection.blobsByPartition.get(291) // Partition for '123'
      blob.counter = 3
      
      // Mock to exclude partition 291 (hex 0x123)
      // The range needs to cover 0x123 (291) with padding
      mockStateManager.accountPatcher.getNonParitionRanges.mockReturnValue([
        { low: '122000', high: '124000' } // This will exclude partitions around 291 (0x123)
      ])
      
      const report = partitionStats.buildStatsReport(cycleShardData)
      
      expect(report.txStats.length).toBe(0) // Should be excluded by range
    })
  })

  describe('setupHandlers', () => {
    it('should register external endpoints', () => {
      const mockRegister = jest.fn()
      require('../../../src/p2p/Context').network.registerExternalGet = mockRegister
      
      partitionStats.setupHandlers()
      
      expect(mockRegister).toHaveBeenCalledWith(
        'get-stats-dump',
        expect.any(Function),
        expect.any(Function)
      )
      expect(mockRegister).toHaveBeenCalledWith(
        'get-stats-report-all',
        expect.any(Function),
        expect.any(Function)
      )
    })

    it('should handle get-stats-dump endpoint request', () => {
      let handler: any
      const mockRegister = jest.fn((name, middleware, fn) => {
        if (name === 'get-stats-dump') {
          handler = fn
        }
      })
      require('../../../src/p2p/Context').network.registerExternalGet = mockRegister
      
      partitionStats.setupHandlers()
      
      const req = { query: { cycle: '8' } }
      const res = {
        write: jest.fn(),
        end: jest.fn()
      }
      
      // Mock shardValuesByCycle
      mockStateManager.shardValuesByCycle.set(8, {
        cycleNumber: 8,
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      })
      
      handler(req, res)
      
      expect(res.write).toHaveBeenCalled()
      expect(res.end).toHaveBeenCalled()
    })

    it('should use default cycle when not provided', () => {
      let handler: any
      const mockRegister = jest.fn((name, middleware, fn) => {
        if (name === 'get-stats-dump') {
          handler = fn
        }
      })
      require('../../../src/p2p/Context').network.registerExternalGet = mockRegister
      
      partitionStats.setupHandlers()
      
      const req = { query: {} }
      const res = {
        write: jest.fn(),
        end: jest.fn()
      }
      
      handler(req, res)
      
      expect(res.write).toHaveBeenCalled()
      expect(res.end).toHaveBeenCalled()
    })

    it('should handle get-stats-report-all endpoint request', async () => {
      let handler: any
      const mockRegister = jest.fn((name, middleware, fn) => {
        if (name === 'get-stats-report-all') {
          handler = fn
        }
      })
      require('../../../src/p2p/Context').network.registerExternalGet = mockRegister
      
      partitionStats.setupHandlers()
      
      const req = { query: { raw: 'false' } }
      const res = {
        write: jest.fn(),
        end: jest.fn()
      }
      
      // Mock getNodes
      const mockGetNodes = jest.fn().mockReturnValue([
        { externalIp: '1.1.1.1', externalPort: 8080 },
        { externalIp: '2.2.2.2', externalPort: 8080 }
      ])
      require('../../../src/p2p/Wrapper').p2p.state.getNodes = mockGetNodes
      
      // Mock _internalHackGetWithResp
      mockLogger._internalHackGetWithResp = jest.fn().mockResolvedValue({
        body: '{"covered":[0,1,2],"cycle":8,"dataStats":[],"txStats":[]}'
      })
      
      await handler(req, res)
      
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('building shard report'))
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('statsReport'))
      expect(res.end).toHaveBeenCalled()
    })

    it('should handle get-stats-report-all with raw output', async () => {
      let handler: any
      const mockRegister = jest.fn((name, middleware, fn) => {
        if (name === 'get-stats-report-all') {
          handler = fn
        }
      })
      require('../../../src/p2p/Context').network.registerExternalGet = mockRegister
      
      partitionStats.setupHandlers()
      
      const req = { query: { raw: 'true' } }
      const res = {
        write: jest.fn(),
        end: jest.fn()
      }
      
      // Mock getNodes
      const mockGetNodes = jest.fn().mockReturnValue([
        { externalIp: '1.1.1.1', externalPort: 8080 }
      ])
      require('../../../src/p2p/Wrapper').p2p.state.getNodes = mockGetNodes
      
      // Mock _internalHackGetWithResp
      mockLogger._internalHackGetWithResp = jest.fn().mockResolvedValue({
        body: '{"test": "data"}'
      })
      
      await handler(req, res)
      
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('['))
      expect(res.end).toHaveBeenCalled()
    })

    it('should handle get-stats-report-all errors', async () => {
      let handler: any
      const mockRegister = jest.fn((name, middleware, fn) => {
        if (name === 'get-stats-report-all') {
          handler = fn
        }
      })
      require('../../../src/p2p/Context').network.registerExternalGet = mockRegister
      
      partitionStats.setupHandlers()
      
      const req = { query: {} }
      const res = {
        write: jest.fn(),
        end: jest.fn()
      }
      
      // Mock getNodes to throw
      const mockGetNodes = jest.fn().mockImplementation(() => {
        throw new Error('Network error')
      })
      require('../../../src/p2p/Wrapper').p2p.state.getNodes = mockGetNodes
      
      await handler(req, res)
      
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('Error'))
      expect(res.end).toHaveBeenCalled()
    })
  })

  describe('helper methods', () => {
    it('should calculate data stats tally correctly', () => {
      const result = partitionStats.dataStatsTallyFunction({ totalBalance: 1000 })
      expect(result).toBe(1000)
    })

    it('should handle missing totalBalance', () => {
      const result = partitionStats.dataStatsTallyFunction({})
      expect(result).toBe(0)
    })

    it('should calculate tx stats tally correctly', () => {
      const result = partitionStats.txStatsTallyFunction({ totalTx: 50 })
      expect(result).toBe(50)
    })

    it('should handle missing totalTx', () => {
      const result = partitionStats.txStatsTallyFunction({})
      expect(result).toBe(0)
    })
  })

  describe('dumpLogsForCycle', () => {
    it('should create stats dump for a cycle', () => {
      const cycleShardData: any = {
        cycleNumber: 5,
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      }
      
      // Create some test data
      const blob = partitionStats.getSummaryBlob('abc123')
      blob.counter = 5
      
      const txCollection = partitionStats.initTXSummaryBlobsForCycle(5)
      const txBlob = txCollection.blobsByPartition.get(2748) // partition for 'abc'
      txBlob.counter = 3
      
      const result = partitionStats.dumpLogsForCycle(5, false, cycleShardData)
      
      expect(result.cycle).toBe(5)
      expect(result.dataStats.length).toBeGreaterThan(0)
      expect(result.txStats.length).toBeGreaterThan(0)
    })

    it('should work without cycleShardData', () => {
      const result = partitionStats.dumpLogsForCycle(5, false)
      
      expect(result.cycle).toBe(5)
      expect(result.covered).toEqual([])
    })
  })

  describe('statsDataSummaryInit with invasiveDebugInfo', () => {
    beforeEach(() => {
      partitionStats.invasiveDebugInfo = true
    })

    it('should add debug info when invasiveDebugInfo is true', () => {
      const accountId = 'acc123'
      const accountData = { balance: 100 }
      
      partitionStats.statsDataSummaryInit(5, accountId, accountData, 'test')
      
      // Process the work queue
      const cycleShardData: any = {
        cycleNumber: 5,
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      }
      partitionStats.buildStatsReport(cycleShardData)
      
      const blob = partitionStats.getSummaryBlob(accountId)
      expect(blob.opaqueBlob.dbgData).toBeDefined()
    })
  })

  describe('statsDataSummaryUpdate with invasiveDebugInfo', () => {
    beforeEach(() => {
      partitionStats.invasiveDebugInfo = true
    })

    it('should add debug info when invasiveDebugInfo is true', () => {
      const accountId = 'acc123'
      const accountBefore = { balance: 100 }
      const accountAfter = {
        accountId: accountId,
        data: { balance: 200 },
        timestamp: 1234567891,
        stateId: 'newhash'
      }
      
      partitionStats.statsDataSummaryUpdate(5, accountBefore, accountAfter, 'test')
      
      // Process the work queue
      const cycleShardData: any = {
        cycleNumber: 5,
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      }
      partitionStats.buildStatsReport(cycleShardData)
      
      const blob = partitionStats.getSummaryBlob(accountId)
      expect(blob.opaqueBlob.dbgData).toBeDefined()
    })
  })

  describe('statsTxSummaryUpdate with invasiveDebugInfo', () => {
    beforeEach(() => {
      partitionStats.invasiveDebugInfo = true
    })

    it('should add debug info to TX blob when invasiveDebugInfo is true', () => {
      const queueEntry: any = {
        cycleToRecordOn: 5,
        logID: 'tx123',
        uniqueWritableKeys: ['acc123'],
        acceptedTx: {
          data: { amount: 100 }
        }
      }
      
      partitionStats.initTXSummaryBlobsForCycle(5)
      partitionStats.statsTxSummaryUpdate(5, queueEntry)
      
      const partition = partitionStats.getSummaryBlobPartition('acc123')
      const collection = partitionStats.getOrCreateTXSummaryBlobCollectionByCycle(5)
      const blob = collection.blobsByPartition.get(partition)
      
      expect(blob.opaqueBlob.dbg).toBeDefined()
      expect(blob.opaqueBlob.dbg).toContain('tx123')
    })
  })

  describe('debugAccountData', () => {
    it('should extract balance from nested data structure', () => {
      const accountData = {
        data: {
          data: {
            balance: '1000'
          }
        }
      }
      
      const result = partitionStats.debugAccountData(accountData)
      expect(result).toBe('1000')
    })

    it('should extract balance from data property', () => {
      const accountData = {
        data: {
          balance: '500'
        }
      }
      
      const result = partitionStats.debugAccountData(accountData)
      expect(result).toBe('500')
    })

    it('should extract balance from root level', () => {
      const accountData = {
        balance: '250'
      }
      
      const result = partitionStats.debugAccountData(accountData)
      expect(result).toBe('250')
    })

    it('should return X for unrecognized structure', () => {
      const accountData = { someOtherProperty: 'value' } as any
      
      const result = partitionStats.debugAccountData(accountData)
      expect(result).toBe('X')
    })
  })

  describe('buildStatsReport with non-empty data', () => {
    it('should include non-empty data blobs with counter > 0', () => {
      const cycleShardData: any = {
        cycleNumber: 5,
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      }
      
      // Create blobs with data
      const blob1 = partitionStats.getSummaryBlob('111222')
      blob1.counter = 5
      
      const blob2 = partitionStats.getSummaryBlob('aaa111')
      blob2.counter = 3
      
      // Mock to include partition 273 (0x111) and 2721 (0xaaa)
      mockStateManager.accountPatcher.getNonParitionRanges.mockReturnValue([
        { low: 'bbb000', high: 'fff000' }
      ])
      
      const report = partitionStats.buildStatsReport(cycleShardData, false)
      
      expect(report.dataStats.length).toBeGreaterThan(0)
      expect(report.error).toBe(false)
    })

    it('should clone summary blobs before adding to report', () => {
      const cycleShardData: any = {
        cycleNumber: 5,
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      }
      
      // Use address that maps to partition within consensus range (0-100)
      // '010' prefix = partition 16
      const blob = partitionStats.getSummaryBlob('010000')
      blob.counter = 5
      blob.opaqueBlob = { test: 'data' }
      
      // Return a range that excludes partitions outside consensus range
      // This will make partitions 0-100 be included
      mockStateManager.accountPatcher.getNonParitionRanges.mockReturnValue([
        { low: '065000', high: 'fff000' } // Exclude partitions 101 (0x065) and above
      ])
      
      const report = partitionStats.buildStatsReport(cycleShardData)
      
      // Check that the blob was cloned
      expect(report.dataStats.length).toBeGreaterThan(0)
      expect(report.dataStats[0]).not.toBe(blob)
      expect(report.dataStats[0].opaqueBlob).not.toBe(blob.opaqueBlob) // Should be deep cloned
      expect(report.dataStats[0].opaqueBlob).toEqual(blob.opaqueBlob) // But with same values
    })
  })

  describe('statsDataSummaryInit with stats disabled', () => {
    beforeEach(() => {
      mockStateManager.feature_generateStats = false
    })

    it('should not add work to queue when stats disabled', () => {
      const accountId = 'acc123'
      const accountData = { balance: 100 }
      
      partitionStats.statsDataSummaryInit(5, accountId, accountData, 'test')
      
      expect(partitionStats.workQueue.length).toBe(0)
    })
  })

  describe('statsDataSummaryUpdate with stats disabled', () => {
    beforeEach(() => {
      mockStateManager.feature_generateStats = false
    })

    it('should not add work to queue when stats disabled', () => {
      const accountId = 'acc123'
      const accountBefore = { balance: 100 }
      const accountAfter = {
        accountId: accountId,
        data: { balance: 200 },
        timestamp: 1234567891,
        stateId: 'newhash'
      }
      
      partitionStats.statsDataSummaryUpdate(5, accountBefore, accountAfter, 'test')
      
      expect(partitionStats.workQueue.length).toBe(0)
    })
  })

  describe('internal methods', () => {
    it('should handle internalDoInit correctly', () => {
      const accountId = 'acc123'
      const accountData = { balance: 100 }
      
      // Enable stats and add work
      mockStateManager.feature_generateStats = true
      partitionStats.statsDataSummaryInit(5, accountId, accountData, 'test')
      
      // Process the queue
      const cycleShardData: any = {
        cycleNumber: 5,
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      }
      partitionStats.buildStatsReport(cycleShardData)
      
      expect(mockApp.dataSummaryInit).toHaveBeenCalledWith(
        expect.any(Object),
        accountData
      )
    })

    it('should handle internalDoUpdate correctly', () => {
      const accountId = 'acc123'
      const accountBefore = { balance: 100 }
      const accountAfter = {
        accountId: accountId,
        data: { balance: 200 },
        timestamp: 1234567891,
        stateId: 'newhash'
      }
      
      // Enable stats and add work
      mockStateManager.feature_generateStats = true
      partitionStats.statsDataSummaryUpdate(5, accountBefore, accountAfter, 'test')
      
      // Process the queue
      const cycleShardData: any = {
        cycleNumber: 5,
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      }
      partitionStats.buildStatsReport(cycleShardData)
      
      expect(mockApp.dataSummaryUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        accountBefore,
        accountAfter.data
      )
    })
  })

  describe('edge cases', () => {
    it('should handle empty uniqueWritableKeys in statsTxSummaryUpdate', () => {
      const queueEntry: any = {
        cycleToRecordOn: 5,
        logID: 'tx123',
        uniqueWritableKeys: new Set(),
        acceptedTx: {
          data: { amount: 100 }
        }
      }
      
      partitionStats.statsTxSummaryUpdate(5, queueEntry)
      
      expect(mockApp.txSummaryUpdate).not.toHaveBeenCalled()
    })

    it('should log error when TX collection is null', () => {
      const queueEntry: any = {
        cycleToRecordOn: -1,
        logID: 'tx123',
        uniqueWritableKeys: ['acc123'],
        acceptedTx: {
          data: { amount: 100 }
        }
      }
      
      const originalMainLogger = partitionStats.mainLogger
      partitionStats.mainLogger = {
        error: jest.fn(),
        debug: jest.fn()
      } as any
      
      // Enable invasiveDebugInfo to ensure error is logged
      const originalInvasiveDebugInfo = partitionStats.invasiveDebugInfo
      partitionStats.invasiveDebugInfo = true
      
      partitionStats.statsTxSummaryUpdate(5, queueEntry)
      
      expect(partitionStats.mainLogger.error).toHaveBeenCalled()
      
      partitionStats.mainLogger = originalMainLogger
      partitionStats.invasiveDebugInfo = originalInvasiveDebugInfo
    })
  })

  describe('processDataStatsDump', () => {
    it('should process data stats dump correctly', () => {
      const stream = {
        write: jest.fn()
      }
      
      const lines = [
        {
          raw: 'some prefix {"covered":[0,1,2],"cycle":5,"dataStats":[{"partition":1,"counter":5,"opaqueBlob":{"totalBalance":1000}}],"owner":""}',
          file: { owner: 'node1' }
        },
        {
          raw: 'prefix {"covered":[0,1,2],"cycle":5,"dataStats":[{"partition":1,"counter":5,"opaqueBlob":{"totalBalance":1000}}],"owner":""}',
          file: { owner: 'node2' }
        }
      ]
      
      const result = partitionStats.processDataStatsDump(stream as any, partitionStats.dataStatsTallyFunction, lines)
      
      expect(result.allPassed).toBe(true)
      expect(result.singleVotePartitions).toBe(1)
      expect(result.multiVotePartitions).toBe(0)
    })

    it('should handle different votes for same partition', () => {
      const stream = {
        write: jest.fn()
      }
      
      const lines = [
        {
          raw: '{"covered":[0,1,2],"cycle":5,"dataStats":[{"partition":1,"counter":5,"opaqueBlob":{"totalBalance":1000}}],"owner":""}',
          file: { owner: 'node1' }
        },
        {
          raw: '{"covered":[0,1,2],"cycle":5,"dataStats":[{"partition":1,"counter":5,"opaqueBlob":{"totalBalance":2000}}],"owner":""}',
          file: { owner: 'node2' }
        }
      ]
      
      const result = partitionStats.processDataStatsDump(stream as any, partitionStats.dataStatsTallyFunction, lines)
      
      expect(result.allPassed).toBe(false)
      expect(result.multiVotePartitions).toBe(1)
      expect(result.badPartitions).toContain(1)
    })

    it('should skip wrong cycle', () => {
      const stream = {
        write: jest.fn()
      }
      
      const lines = [
        {
          raw: '{"covered":[0,1,2],"cycle":5,"dataStats":[],"owner":""}',
          file: { owner: 'node1' }
        },
        {
          raw: '{"covered":[0,1,2],"cycle":4,"dataStats":[],"owner":""}',
          file: { owner: 'node2' }
        }
      ]
      
      const result = partitionStats.processDataStatsDump(stream as any, null, lines)
      
      expect(stream.write).toHaveBeenCalledWith(expect.stringContaining('wrong cycle'))
    })
  })

  describe('processTxStatsDump', () => {
    it('should process TX stats dump correctly', () => {
      const stream = {
        write: jest.fn()
      }
      
      const lines = [
        {
          raw: '{"covered":[0,1,2],"cycle":5,"txStats":[{"partition":1,"counter":5,"opaqueBlob":{"totalTx":10}}],"owner":""}',
          file: { owner: 'node1' }
        },
        {
          raw: '{"covered":[0,1,2],"cycle":5,"txStats":[{"partition":1,"counter":5,"opaqueBlob":{"totalTx":10}}],"owner":""}',
          file: { owner: 'node2' }
        }
      ]
      
      const result = partitionStats.processTxStatsDump(stream as any, partitionStats.txStatsTallyFunction, lines)
      
      expect(result.allPassed).toBe(true)
      expect(result.singleVotePartitions).toBe(1)
      expect(result.totalTx).toBe(10)
    })

    it('should handle parse errors', () => {
      const stream = {
        write: jest.fn()
      }
      
      const lines = [
        {
          raw: 'invalid json {"covered"',
          file: { owner: 'node1' }
        }
      ]
      
      const result = partitionStats.processTxStatsDump(stream as any, null, lines)
      
      expect(result.allPassed).toBe(true) // No valid stats to process
    })

    it('should print cycle debug notes', () => {
      const stream = {
        write: jest.fn()
      }
      
      const lines = [
        {
          raw: '{"covered":[],"cycle":5,"txStats":[],"cycleDebugNotes":{"note1":5,"note2":0}}',
          file: { owner: 'node1' }
        }
      ]
      
      partitionStats.processTxStatsDump(stream as any, null, lines)
      
      expect(stream.write).toHaveBeenCalledWith(expect.stringContaining('node1'))
      expect(stream.write).toHaveBeenCalledWith(expect.stringContaining('"note1":5'))
    })
  })

  describe('addDebugToBlob', () => {
    it('should add debug data when invasiveDebugInfo is true', () => {
      partitionStats.invasiveDebugInfo = true
      const blob: any = {
        opaqueBlob: {}
      }
      
      partitionStats.addDebugToBlob(blob, 'account12345')
      
      expect(blob.opaqueBlob.dbgData).toBeDefined()
      expect(blob.opaqueBlob.dbgData).toContain('accoun')
    })

    it('should not add duplicate debug data', () => {
      partitionStats.invasiveDebugInfo = true
      const blob: any = {
        opaqueBlob: {
          dbgData: ['accoun']
        }
      }
      
      partitionStats.addDebugToBlob(blob, 'account12345')
      
      expect(blob.opaqueBlob.dbgData).toEqual(['accoun'])
    })

    it('should not add debug data when invasiveDebugInfo is false', () => {
      partitionStats.invasiveDebugInfo = false
      const blob: any = {
        opaqueBlob: {}
      }
      
      partitionStats.addDebugToBlob(blob, 'account12345')
      
      expect(blob.opaqueBlob.dbgData).toBeUndefined()
    })
  })

  describe('process stats with metrics', () => {
    it('should handle bad votes metric in processDataStatsDump', () => {
      const stream = {
        write: jest.fn()
      }
      
      // Test with 4 nodes where each votes differently - no vote gets > 1/3
      const lines = [
        {
          raw: '{"covered":[1],"cycle":5,"dataStats":[{"partition":1,"counter":5,"opaqueBlob":{"data":"A"}}],"owner":""}',
          file: { owner: 'node1' }
        },
        {
          raw: '{"covered":[1],"cycle":5,"dataStats":[{"partition":1,"counter":5,"opaqueBlob":{"data":"B"}}],"owner":""}',
          file: { owner: 'node2' }
        },
        {
          raw: '{"covered":[1],"cycle":5,"dataStats":[{"partition":1,"counter":5,"opaqueBlob":{"data":"C"}}],"owner":""}',
          file: { owner: 'node3' }
        },
        {
          raw: '{"covered":[1],"cycle":5,"dataStats":[{"partition":1,"counter":5,"opaqueBlob":{"data":"D"}}],"owner":""}',
          file: { owner: 'node4' }
        }
      ]
      
      const result = partitionStats.processDataStatsDump(stream as any, null, lines)
      
      // With 4 voters and 4 different votes, bestVote = 1
      // Math.ceil(4/3) = 2, so 1 < 2 is true, making allPassedMetric2 false
      expect(result.allPassedMetric2).toBe(false)
    })

    it('should handle uncovered partition in processDataStatsDump', () => {
      const stream = {
        write: jest.fn()
      }
      
      const lines = [
        {
          raw: '{"covered":[1,2,3],"cycle":5,"dataStats":[{"partition":4,"counter":5,"opaqueBlob":{}}],"owner":""}',
          file: { owner: 'node1' }
        }
      ]
      
      const result = partitionStats.processDataStatsDump(stream as any, null, lines)
      
      expect(result.dataByParition.size).toBe(0)
    })

    it('should handle best vote calculation in processTxStatsDump', () => {
      const stream = {
        write: jest.fn()
      }
      
      const lines = [
        {
          raw: '{"covered":[1],"cycle":5,"txStats":[{"partition":1,"counter":5,"opaqueBlob":{"totalTx":5}}],"owner":""}',
          file: { owner: 'node1' }
        },
        {
          raw: '{"covered":[1],"cycle":5,"txStats":[{"partition":1,"counter":5,"opaqueBlob":{"totalTx":5}}],"owner":""}',
          file: { owner: 'node2' }
        },
        {
          raw: '{"covered":[1],"cycle":5,"txStats":[{"partition":1,"counter":5,"opaqueBlob":{"totalTx":10}}],"owner":""}',
          file: { owner: 'node3' }
        }
      ]
      
      const result = partitionStats.processTxStatsDump(stream as any, partitionStats.txStatsTallyFunction, lines)
      
      expect(result.totalTx).toBe(5) // Best vote value
      expect(result.allPassedMetric2).toBe(true) // 2 out of 3 nodes agree
    })
  })

  describe('additional error cases', () => {
    it('should log errors when invasiveDebugInfo enabled', () => {
      partitionStats.invasiveDebugInfo = true
      const originalLogger = partitionStats.mainLogger
      partitionStats.mainLogger = {
        debug: jest.fn(),
        error: jest.fn()
      } as any
      
      const queueEntry: any = {
        cycleToRecordOn: 5,
        logID: 'tx123',
        uniqueWritableKeys: [],
        acceptedTx: {
          data: { amount: 100 }
        }
      }
      
      partitionStats.statsTxSummaryUpdate(5, queueEntry)
      
      expect(partitionStats.mainLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('skip(no local writable key)')
      )
      
      partitionStats.mainLogger = originalLogger
    })
  })

  describe('getConsensusSnapshotPartitions with edge cases', () => {
    it('should handle negative partition dialation', () => {
      const cycleShardData: any = {
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      }
      
      // Return range with low boundary
      mockStateManager.accountPatcher.getNonParitionRanges.mockReturnValue([
        { low: '001000', high: '002000' }
      ])
      
      const result = partitionStats.getConsensusSnapshotPartitions(cycleShardData)
      
      // Should handle negative dialation correctly
      expect(result.map.has(0)).toBe(false) // Should be excluded due to dialation
    })
  })

  describe('dumpLogsForCycle with logging', () => {
    it('should write logs to statsLogger when writeTofile is true', () => {
      const originalLogger = partitionStats.statsLogger
      partitionStats.statsLogger = {
        debug: jest.fn()
      } as any
      
      const cycleShardData: any = {
        cycleNumber: 5,
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      }
      
      partitionStats.dumpLogsForCycle(5, true, cycleShardData)
      
      expect(partitionStats.statsLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('logs for cycle 5')
      )
      
      partitionStats.statsLogger = originalLogger
    })
  })

  describe('edge case coverage', () => {
    it('should handle missing cycleDebugNotes in processTxStatsDump', () => {
      const stream = {
        write: jest.fn()
      }
      
      const lines = [
        {
          raw: '{"covered":[],"cycle":5,"txStats":[]}',
          file: { owner: 'node1' }
        }
      ]
      
      partitionStats.processTxStatsDump(stream as any, null, lines)
      
      expect(stream.write).not.toHaveBeenCalledWith(expect.stringContaining('node1'))
    })

    it('should log parse errors in processDataStatsDump', () => {
      const stream = {
        write: jest.fn()
      }
      
      // Mock logger for this test
      const originalMainLogger = partitionStats.mainLogger
      partitionStats.mainLogger = {
        error: jest.fn()
      } as any
      
      // Enable error logging
      const logFlags = require('../../../src/logger').logFlags
      const originalErrorFlag = logFlags.error
      logFlags.error = true
      
      const lines = [
        {
          raw: 'prefix {"covered":invalid json}',
          file: { owner: 'node1' }
        }
      ]
      
      const result = partitionStats.processDataStatsDump(stream as any, null, lines)
      
      expect(partitionStats.mainLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Fail to parse statsObj'),
        expect.any(Error)
      )
      
      partitionStats.mainLogger = originalMainLogger
      logFlags.error = originalErrorFlag
    })

    it('should handle parse errors in processTxStatsDump', () => {
      const stream = {
        write: jest.fn()
      }
      
      // Mock logger for this test
      const originalMainLogger = partitionStats.mainLogger
      partitionStats.mainLogger = {
        error: jest.fn()
      } as any
      
      // Enable error logging
      const logFlags = require('../../../src/logger').logFlags
      const originalErrorFlag = logFlags.error
      logFlags.error = true
      
      const lines = [
        {
          raw: 'prefix {"covered":invalid json}',
          file: { owner: 'node1' }
        }
      ]
      
      const result = partitionStats.processTxStatsDump(stream as any, null, lines)
      
      expect(partitionStats.mainLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Fail to parse statsObj'),
        expect.any(Error)
      )
      
      partitionStats.mainLogger = originalMainLogger
      logFlags.error = originalErrorFlag
    })
  })

  describe('coverage improvements', () => {
    it('should handle empty activeNodes in get-stats-report-all', async () => {
      let handler: any
      const mockRegister = jest.fn((name, middleware, fn) => {
        if (name === 'get-stats-report-all') {
          handler = fn
        }
      })
      require('../../../src/p2p/Context').network.registerExternalGet = mockRegister
      
      partitionStats.setupHandlers()
      
      const req = { query: {} }
      const res = {
        write: jest.fn(),
        end: jest.fn()
      }
      
      // Mock getNodes to return empty
      const mockGetNodes = jest.fn().mockReturnValue([])
      require('../../../src/p2p/Wrapper').p2p.state.getNodes = mockGetNodes
      
      await handler(req, res)
      
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('building shard report'))
      expect(res.end).toHaveBeenCalled()
    })

    it('should handle null body in _internalHackGetWithResp', async () => {
      let handler: any
      const mockRegister = jest.fn((name, middleware, fn) => {
        if (name === 'get-stats-report-all') {
          handler = fn
        }
      })
      require('../../../src/p2p/Context').network.registerExternalGet = mockRegister
      
      partitionStats.setupHandlers()
      
      const req = { query: { raw: 'false' } }
      const res = {
        write: jest.fn(),
        end: jest.fn()
      }
      
      // Mock getNodes
      const mockGetNodes = jest.fn().mockReturnValue([
        { externalIp: '1.1.1.1', externalPort: 8080 }
      ])
      require('../../../src/p2p/Wrapper').p2p.state.getNodes = mockGetNodes
      
      // Mock _internalHackGetWithResp to return null body
      mockLogger._internalHackGetWithResp = jest.fn().mockResolvedValue({
        body: null
      })
      
      await handler(req, res)
      
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('building shard report'))
      expect(res.end).toHaveBeenCalled()
    })

    it('should handle empty body in _internalHackGetWithResp', async () => {
      let handler: any
      const mockRegister = jest.fn((name, middleware, fn) => {
        if (name === 'get-stats-report-all') {
          handler = fn
        }
      })
      require('../../../src/p2p/Context').network.registerExternalGet = mockRegister
      
      partitionStats.setupHandlers()
      
      const req = { query: { raw: 'false' } }
      const res = {
        write: jest.fn(),
        end: jest.fn()
      }
      
      // Mock getNodes
      const mockGetNodes = jest.fn().mockReturnValue([
        { externalIp: '1.1.1.1', externalPort: 8080 }
      ])
      require('../../../src/p2p/Wrapper').p2p.state.getNodes = mockGetNodes
      
      // Mock _internalHackGetWithResp to return empty body
      mockLogger._internalHackGetWithResp = jest.fn().mockResolvedValue({
        body: ''
      })
      
      await handler(req, res)
      
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('building shard report'))
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('statsReport'))
      expect(res.end).toHaveBeenCalled()
    })

    it('should handle null statsObj owner in processDataStatsDump', () => {
      const stream = {
        write: jest.fn()
      }
      
      const lines = [
        {
          raw: '{"covered":[1],"cycle":5,"dataStats":[{"partition":1,"counter":5,"opaqueBlob":{}}]}',
          file: { owner: null }
        }
      ]
      
      const result = partitionStats.processDataStatsDump(stream as any, null, lines)
      
      expect(result).toBeDefined()
    })

    it('should handle null bestVoteValue in processTxStatsDump', () => {
      const stream = {
        write: jest.fn()
      }
      
      const lines = [
        {
          raw: '{"covered":[1],"cycle":5,"txStats":[{"partition":1,"counter":0,"opaqueBlob":{}}]}',
          file: { owner: 'node1' }
        }
      ]
      
      const result = partitionStats.processTxStatsDump(stream as any, partitionStats.txStatsTallyFunction, lines)
      
      expect(result.totalTx).toBe(0)
    })

    it('should handle logFlags.error enabled', () => {
      const originalLogFlags = require('../../../src/logger').logFlags
      require('../../../src/logger').logFlags = { error: true }
      
      const cycleShardData: any = null
      
      expect(() => partitionStats.buildStatsReport(cycleShardData, true)).toThrow('cycleShardData is required')
      
      require('../../../src/logger').logFlags = originalLogFlags
    })

    it('should update latestCycle in statsDataSummaryInit work', () => {
      const accountId = 'acc123'
      const accountData = { balance: 100 }
      
      mockStateManager.feature_generateStats = true
      partitionStats.statsDataSummaryInit(10, accountId, accountData, 'test')
      
      // Process the work queue with a higher cycle
      const cycleShardData: any = {
        cycleNumber: 10,
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      }
      partitionStats.buildStatsReport(cycleShardData)
      
      const blob = partitionStats.getSummaryBlob(accountId)
      expect(blob.latestCycle).toBe(10)
    })

    it('should update latestCycle in statsDataSummaryUpdate work', () => {
      const accountId = 'acc123'
      const accountBefore = { balance: 100 }
      const accountAfter = {
        accountId: accountId,
        data: { balance: 200 },
        timestamp: 1234567891,
        stateId: 'newhash'
      }
      
      mockStateManager.feature_generateStats = true
      partitionStats.statsDataSummaryUpdate(15, accountBefore, accountAfter, 'test')
      
      // Process the work queue with a higher cycle
      const cycleShardData: any = {
        cycleNumber: 15,
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      }
      partitionStats.buildStatsReport(cycleShardData)
      
      const blob = partitionStats.getSummaryBlob(accountId)
      expect(blob.latestCycle).toBe(15)
    })

    it('should handle missing shardValuesByCycle in get-stats-dump', () => {
      let handler: any
      const mockRegister = jest.fn((name, middleware, fn) => {
        if (name === 'get-stats-dump') {
          handler = fn
        }
      })
      require('../../../src/p2p/Context').network.registerExternalGet = mockRegister
      
      partitionStats.setupHandlers()
      
      const req = { query: { cycle: '999' } }
      const res = {
        write: jest.fn(),
        end: jest.fn()
      }
      
      handler(req, res)
      
      expect(res.write).toHaveBeenCalled()
      expect(res.end).toHaveBeenCalled()
    })

    it('should handle logFlags.verbose for TX stats', () => {
      const originalLogFlags = require('../../../src/logger').logFlags
      require('../../../src/logger').logFlags = { verbose: true }
      
      const collection = partitionStats.initTXSummaryBlobsForCycle(1)
      
      // Add more than maxCyclesToStoreBlob collections
      partitionStats.maxCyclesToStoreBlob = 2
      partitionStats.initTXSummaryBlobsForCycle(2)
      partitionStats.initTXSummaryBlobsForCycle(3)
      
      // Should have pruned and logged
      expect(partitionStats.txSummaryBlobCollections.length).toBe(2)
      
      require('../../../src/logger').logFlags = originalLogFlags
    })

    it('should handle dumpLogsForCycle with cycleDebugNotes', () => {
      mockStateManager.cycleDebugNotes = { note1: 'test', note2: 'test2' }
      
      const result = partitionStats.dumpLogsForCycle(5, false)
      
      expect(result.cycleDebugNotes).toBe(mockStateManager.cycleDebugNotes)
    })

    it('should handle invasiveDebugInfo in TX summary update with existing dbg', () => {
      partitionStats.invasiveDebugInfo = true
      
      const queueEntry: any = {
        cycleToRecordOn: 5,
        logID: 'tx123',
        uniqueWritableKeys: ['acc123'],
        acceptedTx: {
          data: { amount: 100 }
        }
      }
      
      const collection = partitionStats.initTXSummaryBlobsForCycle(5)
      const partition = partitionStats.getSummaryBlobPartition('acc123')
      const blob = collection.blobsByPartition.get(partition)
      
      // Add existing dbg
      blob.opaqueBlob.dbg = ['tx000']
      
      partitionStats.statsTxSummaryUpdate(5, queueEntry)
      
      expect(blob.opaqueBlob.dbg).toContain('tx000')
      expect(blob.opaqueBlob.dbg).toContain('tx123')
      expect(blob.opaqueBlob.dbg.length).toBe(2)
    })

    it('should handle skippedPartitionCount tracking', () => {
      const cycleShardData: any = {
        cycleNumber: 5,
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      }
      
      // Create blob outside coverage
      const blob = partitionStats.getSummaryBlob('fff123')
      blob.counter = 5
      
      // Mock to exclude the partition
      mockStateManager.accountPatcher.getNonParitionRanges.mockReturnValue([
        { low: 'fff000', high: 'ffffff' }
      ])
      
      const report = partitionStats.buildStatsReport(cycleShardData)
      
      expect(report.skippedParitionCount).toBeGreaterThan(0)
    })

    it('should handle TX summary update latestCycle', () => {
      const queueEntry: any = {
        cycleToRecordOn: 5,
        logID: 'tx123',
        uniqueWritableKeys: ['acc123'],
        acceptedTx: {
          data: { amount: 100 }
        }
      }
      
      const collection = partitionStats.initTXSummaryBlobsForCycle(5)
      const partition = partitionStats.getSummaryBlobPartition('acc123')
      const blob = collection.blobsByPartition.get(partition)
      blob.latestCycle = 3 // Set lower than cycle
      
      partitionStats.statsTxSummaryUpdate(6, queueEntry)
      
      expect(blob.latestCycle).toBe(6)
    })

    it('should clone blobs correctly in buildStatsReport', () => {
      const cycleShardData: any = {
        cycleNumber: 5,
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      }
      
      // Create TX blob
      const collection = partitionStats.initTXSummaryBlobsForCycle(5)
      const blob = collection.blobsByPartition.get(100)
      blob.counter = 5
      
      // Mock to include the partition
      mockStateManager.accountPatcher.getNonParitionRanges.mockReturnValue([
        { low: '200000', high: 'fff000' }
      ])
      
      const report = partitionStats.buildStatsReport(cycleShardData)
      
      // Should have TX stats
      expect(report.txStats.length).toBeGreaterThan(0)
    })

    it('should handle covered partition count', () => {
      const cycleShardData: any = {
        cycleNumber: 5,
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      }
      
      // Create blob
      const blob = partitionStats.getSummaryBlob('100123')
      blob.counter = 5
      
      // Mock to include some partitions
      mockStateManager.accountPatcher.getNonParitionRanges.mockReturnValue([
        { low: '200000', high: 'fff000' }
      ])
      
      const report = partitionStats.buildStatsReport(cycleShardData, false)
      
      expect(report.coveredParititionCount).toBeGreaterThan(0)
    })

    it('should include empty blobs when excludeEmpty is false', () => {
      const cycleShardData: any = {
        cycleNumber: 5,
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 100
        }
      }
      
      // Create empty blob
      partitionStats.getSummaryBlob('100123') // This creates a blob with counter = 0
      
      // Mock to include the partition
      mockStateManager.accountPatcher.getNonParitionRanges.mockReturnValue([
        { low: '200000', high: 'fff000' }
      ])
      
      const report = partitionStats.buildStatsReport(cycleShardData, false)
      
      expect(report.dataStats.length).toBeGreaterThanOrEqual(1)
    })
  })
})