import AccountCache from '../../../src/state-manager/AccountCache'
import StateManager from '../../../src/state-manager'
import Profiler from '../../../src/utils/profiler'
import * as Shardus from '../../../src/shardus/shardus-types'
import Logger from '../../../src/logger'
import Crypto from '../../../src/crypto'
import { 
  AccountHashCacheHistory, 
  AccountHashCache,
  CycleShardData 
} from '../../../src/state-manager/state-manager-types'

describe('AccountCache', () => {
  let accountCache: AccountCache
  let mockStateManager: any
  let mockProfiler: any
  let mockApp: any
  let mockLogger: any
  let mockCrypto: any
  let mockConfig: any

  beforeEach(() => {
    // Mock dependencies
    mockStateManager = {
      statemanager_fatal: jest.fn(),
      currentCycleShardData: {
        cycleNumber: 10
      },
      accountPatcher: {
        updateAccountHash: jest.fn(),
        removeAccountHash: jest.fn()
      }
    }

    mockProfiler = {} as Profiler

    mockApp = {} as Shardus.App

    mockLogger = {
      getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      }))
    }

    mockCrypto = {} as Crypto

    mockConfig = {} as Shardus.StrictServerConfiguration

    accountCache = new AccountCache(
      mockStateManager,
      mockProfiler,
      mockApp,
      mockLogger,
      mockCrypto,
      mockConfig
    )
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with correct default values', () => {
      expect(accountCache.app).toBe(mockApp)
      expect(accountCache.crypto).toBe(mockCrypto)
      expect(accountCache.config).toBe(mockConfig)
      expect(accountCache.profiler).toBe(mockProfiler)
      expect(accountCache.stateManager).toBe(mockStateManager)
      expect(accountCache.accountsHashCache3.currentCalculationCycle).toBe(-1)
      expect(accountCache.accountsHashCache3.workingHistoryList.accountIDs).toEqual([])
      expect(accountCache.accountsHashCache3.workingHistoryList.accountHashesSorted).toEqual([])
      expect(accountCache.accountsHashCache3.accountHashMap.size).toBe(0)
      expect(accountCache.cacheUpdateQueue.accountIDs).toEqual([])
      expect(accountCache.cacheUpdateQueue.accountHashesSorted).toEqual([])
    })

    it('should handle null logger gracefully', () => {
      const cacheWithNullLogger = new AccountCache(
        mockStateManager,
        mockProfiler,
        mockApp,
        null,
        mockCrypto,
        mockConfig
      )
      expect(cacheWithNullLogger).toBeDefined()
    })
  })

  describe('resetAccountCache', () => {
    it('should reset all cache data to initial state', () => {
      // Add some data first
      accountCache.updateAccountHash('account1', 'hash1', 1000, 5)
      
      // Reset
      accountCache.resetAccountCache()

      expect(accountCache.accountsHashCache3.currentCalculationCycle).toBe(-1)
      expect(accountCache.accountsHashCache3.workingHistoryList.accountIDs).toEqual([])
      expect(accountCache.accountsHashCache3.workingHistoryList.accountHashesSorted).toEqual([])
      expect(accountCache.accountsHashCache3.accountHashMap.size).toBe(0)
      expect(accountCache.cacheUpdateQueue.accountIDs).toEqual([])
      expect(accountCache.cacheUpdateQueue.accountHashesSorted).toEqual([])
    })
  })

  describe('updateAccountHash', () => {
    it('should handle null hash', () => {
      accountCache.updateAccountHash('account1', null, 1000, 5)
      expect(mockStateManager.statemanager_fatal).toHaveBeenCalledWith(
        'updateAccountHash hash=null',
        expect.stringContaining('updateAccountHash hash=null')
      )
    })

    it('should handle invalid cycle', () => {
      accountCache.updateAccountHash('account1', 'hash1', 1000, -1)
      expect(mockStateManager.statemanager_fatal).toHaveBeenCalledWith(
        'updateAccountHash cycle == -1',
        expect.stringContaining('updateAccountHash cycle == -1')
      )

      accountCache.updateAccountHash('account1', 'hash1', 1000, null)
      expect(mockStateManager.statemanager_fatal).toHaveBeenCalledWith(
        'updateAccountHash cycle == null',
        expect.stringContaining('updateAccountHash cycle == null')
      )
    })

    it('should create new account history entry for new account', () => {
      accountCache.updateAccountHash('account1', 'hash1', 1000, 5)
      
      expect(accountCache.accountsHashCache3.accountHashMap.has('account1')).toBe(true)
      const history = accountCache.accountsHashCache3.accountHashMap.get('account1')
      expect(history.lastSeenCycle).toBe(9) // currentCycleShardData.cycleNumber - 1
      expect(history.accountHashList.length).toBe(1)
      expect(history.accountHashList[0]).toEqual({ t: 1000, h: 'hash1', c: 5 })
    })

    it('should update existing account with same cycle and newer timestamp', () => {
      accountCache.updateAccountHash('account1', 'hash1', 1000, 5)
      accountCache.updateAccountHash('account1', 'hash2', 2000, 5)
      
      const history = accountCache.accountsHashCache3.accountHashMap.get('account1')
      expect(history.accountHashList.length).toBe(1)
      expect(history.accountHashList[0]).toEqual({ t: 2000, h: 'hash2', c: 5 })
    })

    it('should not update existing account with same cycle and older timestamp', () => {
      accountCache.updateAccountHash('account1', 'hash1', 2000, 5)
      accountCache.updateAccountHash('account1', 'hash2', 1000, 5)
      
      const history = accountCache.accountsHashCache3.accountHashMap.get('account1')
      expect(history.accountHashList.length).toBe(1)
      expect(history.accountHashList[0]).toEqual({ t: 2000, h: 'hash1', c: 5 })
    })

    it('should add new entry for newer cycle', () => {
      accountCache.updateAccountHash('account1', 'hash1', 1000, 5)
      accountCache.updateAccountHash('account1', 'hash2', 2000, 6)
      
      const history = accountCache.accountsHashCache3.accountHashMap.get('account1')
      expect(history.accountHashList.length).toBe(2)
      expect(history.accountHashList[0]).toEqual({ t: 2000, h: 'hash2', c: 6 })
      expect(history.accountHashList[1]).toEqual({ t: 1000, h: 'hash1', c: 5 })
    })

    it('should handle edge case of older cycle with newer timestamp', () => {
      accountCache.updateAccountHash('account1', 'hash1', 1000, 6)
      accountCache.updateAccountHash('account1', 'hash2', 2000, 5)
      
      expect(mockStateManager.statemanager_fatal).toHaveBeenCalledWith(
        'updateAccountHash: cycleCalcOff',
        expect.stringContaining('older cycle but newer timestamp')
      )
    })

    it('should insert older cycle update in correct position', () => {
      // First add cycle 7 with timestamp 1000
      accountCache.updateAccountHash('account1', 'hash1', 1000, 7)
      // Then add cycle 5 with timestamp 2000 (older cycle, newer timestamp - will unshift)
      accountCache.updateAccountHash('account1', 'hash2', 2000, 5)
      // Then add cycle 6 with timestamp 1500 (will unshift since cycle 6 > cycle 5)
      accountCache.updateAccountHash('account1', 'hash3', 1500, 6)
      
      const history = accountCache.accountsHashCache3.accountHashMap.get('account1')
      expect(history.accountHashList.length).toBe(3)
      // Due to the unshift logic based on cycle OR timestamp, the order will be:
      // cycle 6 (unshifted last), cycle 5 (unshifted second), cycle 7 (original)
      expect(history.accountHashList[0]).toEqual({ t: 1500, h: 'hash3', c: 6 })
      expect(history.accountHashList[1]).toEqual({ t: 2000, h: 'hash2', c: 5 })
      expect(history.accountHashList[2]).toEqual({ t: 1000, h: 'hash1', c: 7 })
    })

    it('should update cache update queue when newer hash is added', () => {
      accountCache.updateAccountHash('account1', 'hash1', 1000, 5)
      
      expect(accountCache.cacheUpdateQueue.accountIDs).toContain('account1')
      expect(accountCache.cacheUpdateQueue.accountHashesSorted).toContainEqual({ t: 1000, h: 'hash1', c: 5 })
    })

    it('should limit account hash list length', () => {
      // Set current calculation cycle to make older entries removable
      accountCache.accountsHashCache3.currentCalculationCycle = 10
      
      // Add multiple entries
      for (let i = 0; i < 10; i++) {
        accountCache.updateAccountHash('account1', `hash${i}`, 1000 + i, i)
      }
      
      const history = accountCache.accountsHashCache3.accountHashMap.get('account1')
      // Should keep only recent entries
      expect(history.accountHashList.length).toBeLessThanOrEqual(3)
    })

    it('should handle null currentCycleShardData', () => {
      // Create a new instance with currentCalculationCycle already set to avoid null access
      accountCache.accountsHashCache3.currentCalculationCycle = 0
      mockStateManager.currentCycleShardData = null
      
      // This should skip the initialization of currentCalculationCycle
      accountCache.updateAccountHash('account1', 'hash1', 1000, 5)
      
      // Verify account was still added
      expect(accountCache.hasAccount('account1')).toBe(true)
    })
  })

  describe('hasAccount', () => {
    it('should return false for non-existent account', () => {
      expect(accountCache.hasAccount('nonexistent')).toBe(false)
    })

    it('should return true for existing account', () => {
      accountCache.updateAccountHash('account1', 'hash1', 1000, 5)
      expect(accountCache.hasAccount('account1')).toBe(true)
    })
  })

  describe('getAccountHash', () => {
    it('should return null for non-existent account', () => {
      expect(accountCache.getAccountHash('nonexistent')).toBe(null)
    })

    it('should return newest hash for existing account', () => {
      accountCache.updateAccountHash('account1', 'hash1', 1000, 5)
      accountCache.updateAccountHash('account1', 'hash2', 2000, 6)
      
      const result = accountCache.getAccountHash('account1')
      expect(result).toEqual({ t: 2000, h: 'hash2', c: 6 })
    })

    it('should return undefined for account with empty hash list', () => {
      // Manually create an account with empty hash list
      const emptyHistory: AccountHashCacheHistory = {
        lastSeenCycle: -1,
        lastSeenSortIndex: -1,
        queueIndex: { id: -1, idx: -1 },
        accountHashList: [],
        lastStaleCycle: -1,
        lastUpdateCycle: -1,
      }
      accountCache.accountsHashCache3.accountHashMap.set('emptyAccount', emptyHistory)
      
      expect(accountCache.getAccountHash('emptyAccount')).toBeUndefined()
    })
  })

  describe('sortByTimestampIdAsc', () => {
    it('should sort by timestamp ascending', () => {
      const result = accountCache.sortByTimestampIdAsc(
        { t: 1000, id: 'a' },
        { t: 2000, id: 'b' }
      )
      expect(result).toBe(-1)
    })

    it('should sort by timestamp descending', () => {
      const result = accountCache.sortByTimestampIdAsc(
        { t: 2000, id: 'a' },
        { t: 1000, id: 'b' }
      )
      expect(result).toBe(1)
    })

    it('should sort by id when timestamps are equal', () => {
      const result1 = accountCache.sortByTimestampIdAsc(
        { t: 1000, id: 'a' },
        { t: 1000, id: 'b' }
      )
      expect(result1).toBe(-1)

      const result2 = accountCache.sortByTimestampIdAsc(
        { t: 1000, id: 'b' },
        { t: 1000, id: 'a' }
      )
      expect(result2).toBe(1)
    })

    it('should return 0 for equal items', () => {
      const result = accountCache.sortByTimestampIdAsc(
        { t: 1000, id: 'a' },
        { t: 1000, id: 'a' }
      )
      expect(result).toBe(0)
    })
  })

  describe('processCacheUpdates', () => {
    it('should process cache updates for current cycle', () => {
      const cycleShardData: CycleShardData = {
        cycleNumber: 10,
        nodeShardData: null,
        nodeShardDataMap: new Map(),
        shardGlobals: null,
        parititionShardDataMap: new Map(),
        ourNode: null,
        nodes: [],
        syncingNeighbors: [],
        syncingNeighborsTxGroup: [],
        hasSyncingNeighbors: false,
        activeFoundationNodes: [],
        partitionsToSkip: new Map(),
        timestamp: 0,
        timestampEndCycle: 0,
        hasCompleteData: true,
        voters: [],
        calculationTime: 0
      }

      // Add some updates
      accountCache.updateAccountHash('account1', 'hash1', 1000, 9)
      accountCache.updateAccountHash('account2', 'hash2', 2000, 10)
      accountCache.updateAccountHash('account3', 'hash3', 3000, 11) // Future update

      accountCache.processCacheUpdates(cycleShardData)

      // Check that account patcher was called for non-future updates
      expect(mockStateManager.accountPatcher.updateAccountHash).toHaveBeenCalledWith('account1', 'hash1')
      expect(mockStateManager.accountPatcher.updateAccountHash).toHaveBeenCalledWith('account2', 'hash2')
      
      // Future update should be in the queue
      expect(accountCache.cacheUpdateQueue.accountIDs).toContain('account3')
      expect(accountCache.cacheUpdateQueue.accountHashesSorted).toContainEqual({ t: 3000, h: 'hash3', c: 11 })
      
      // Current calculation cycle should be updated
      expect(accountCache.accountsHashCache3.currentCalculationCycle).toBe(11)
    })

    it('should skip null entries in cache update queue', () => {
      const cycleShardData: CycleShardData = {
        cycleNumber: 10,
        nodeShardData: null,
        nodeShardDataMap: new Map(),
        shardGlobals: null,
        parititionShardDataMap: new Map(),
        ourNode: null,
        nodes: [],
        syncingNeighbors: [],
        syncingNeighborsTxGroup: [],
        hasSyncingNeighbors: false,
        activeFoundationNodes: [],
        partitionsToSkip: new Map(),
        timestamp: 0,
        timestampEndCycle: 0,
        hasCompleteData: true,
        voters: [],
        calculationTime: 0
      }

      // Manually add null entries
      accountCache.cacheUpdateQueue.accountHashesSorted = [null, { t: 1000, h: 'hash1', c: 9 }]
      accountCache.cacheUpdateQueue.accountIDs = ['null-account', 'account1']

      accountCache.processCacheUpdates(cycleShardData)

      expect(mockStateManager.accountPatcher.updateAccountHash).toHaveBeenCalledWith('account1', 'hash1')
      expect(mockStateManager.accountPatcher.updateAccountHash).toHaveBeenCalledTimes(1)
    })

    it('should handle fatal error when accountID is null but hash data exists', () => {
      const cycleShardData: CycleShardData = {
        cycleNumber: 10,
        nodeShardData: null,
        nodeShardDataMap: new Map(),
        shardGlobals: null,
        parititionShardDataMap: new Map(),
        ourNode: null,
        nodes: [],
        syncingNeighbors: [],
        syncingNeighborsTxGroup: [],
        hasSyncingNeighbors: false,
        activeFoundationNodes: [],
        partitionsToSkip: new Map(),
        timestamp: 0,
        timestampEndCycle: 0,
        hasCompleteData: true,
        voters: [],
        calculationTime: 0
      }

      // Manually add mismatched entries
      accountCache.cacheUpdateQueue.accountHashesSorted = [{ t: 1000, h: 'hash1', c: 9 }]
      accountCache.cacheUpdateQueue.accountIDs = [null]

      accountCache.processCacheUpdates(cycleShardData)

      expect(mockStateManager.statemanager_fatal).toHaveBeenCalledWith(
        'buildPartitionHashesForNode: accountID==null unexpected',
        expect.stringContaining('buildPartitionHashesForNode: accountID==null unexpected')
      )
    })
  })

  describe('getAccountDebugObject', () => {
    it('should return account hash cache history', () => {
      // Add accountCache to mockStateManager
      mockStateManager.accountCache = accountCache
      
      accountCache.updateAccountHash('account1', 'hash1', 1000, 5)
      
      const result = accountCache.getAccountDebugObject('account1')
      expect(result).toBeDefined()
      expect(result.accountHashList).toHaveLength(1)
      expect(result.accountHashList[0]).toEqual({ t: 1000, h: 'hash1', c: 5 })
    })

    it('should return undefined for non-existent account', () => {
      // Add accountCache to mockStateManager
      mockStateManager.accountCache = accountCache
      
      const result = accountCache.getAccountDebugObject('nonexistent')
      expect(result).toBeUndefined()
    })
  })

  describe('getDebugStats', () => {
    it('should return correct stats', () => {
      accountCache.updateAccountHash('account1', 'hash1', 1000, 5)
      accountCache.updateAccountHash('account2', 'hash2', 2000, 6)
      
      const [workingAccounts, mainMap] = accountCache.getDebugStats()
      
      expect(workingAccounts).toBe(0) // Working list is populated during processCacheUpdates
      expect(mainMap).toBe(2) // Two accounts in the map
    })
  })

  describe('getAccountHashHistoryItem', () => {
    it('should return account hash cache history', () => {
      // Add accountCache to mockStateManager
      mockStateManager.accountCache = accountCache
      
      accountCache.updateAccountHash('account1', 'hash1', 1000, 5)
      
      const result = accountCache.getAccountHashHistoryItem('account1')
      expect(result).toBeDefined()
      expect(result.accountHashList).toHaveLength(1)
      expect(result.accountHashList[0]).toEqual({ t: 1000, h: 'hash1', c: 5 })
    })

    it('should return undefined for non-existent account', () => {
      // Add accountCache to mockStateManager
      mockStateManager.accountCache = accountCache
      
      const result = accountCache.getAccountHashHistoryItem('nonexistent')
      expect(result).toBeUndefined()
    })
  })
})