import AccountPatcher from '../../../src/state-manager/AccountPatcher'
import StateManager from '../../../src/state-manager'
import Profiler from '../../../src/utils/profiler'
import * as Shardus from '../../../src/shardus/shardus-types'
import Logger from '../../../src/logger'
import Crypto from '../../../src/crypto'
import { P2PModuleContext as P2P } from '../../../src/p2p/Context'
import {
  TrieAccount,
  HashTrieNode,
  RadixAndHash,
  ShardedHashTrie,
  IsInsyncResult,
  HashTrieSyncConsensus,
} from '../../../src/state-manager/state-manager-types'
import { Ordering } from '../../../src/utils'

// Mock the Context module
jest.mock('../../../src/p2p/Context', () => ({
  network: {
    registerExternalGet: jest.fn(),
  },
  setDefaultConfigs: jest.fn(),
  P2PModuleContext: jest.fn(),
}))

import * as Context from '../../../src/p2p/Context'

describe('AccountPatcher', () => {
  let accountPatcher: AccountPatcher
  let mockStateManager: any
  let mockProfiler: any
  let mockApp: any
  let mockLogger: any
  let mockP2P: any
  let mockCrypto: any
  let mockConfig: any

  beforeEach(() => {
    // Mock dependencies
    mockStateManager = {
      statemanager_fatal: jest.fn(),
      currentCycleShardData: {
        cycleNumber: 10,
        shardGlobals: {
          nodesPerConsenusGroup: 5,
        },
        nodes: [],
      },
      shardValuesByCycle: new Map(),
      lastShardReport: 'test shard report',
      accountCache: {
        getAccountHash: jest.fn(),
        getAccountDebugObject: jest.fn(),
      },
      transactionQueue: {
        getConsenusGroupForAccount: jest.fn(() => []),
        getStorageGroupForAccount: jest.fn(() => []),
      },
    }

    mockProfiler = {
      scopedProfileSectionStart: jest.fn(),
      scopedProfileSectionEnd: jest.fn(),
    } as any

    mockApp = {} as Shardus.App

    mockLogger = {
      getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      })),
    }

    mockP2P = {
      registerInternalBinary: jest.fn(),
    } as any

    mockCrypto = {
      hash: jest.fn((value) => `hash_${JSON.stringify(value)}`),
    } as any

    mockConfig = {
      debug: {
        verboseNestedCounters: false,
      },
      stateManager: {
        patcherMaxChildHashResponses: 1000,
      },
    } as any

    accountPatcher = new AccountPatcher(
      mockStateManager,
      mockProfiler,
      mockApp,
      mockLogger,
      mockP2P,
      mockCrypto,
      mockConfig
    )
  })

  describe('constructor', () => {
    it('should initialize with correct default values', () => {
      expect(accountPatcher.treeMaxDepth).toBe(4)
      expect(accountPatcher.treeSyncDepth).toBe(1)
      expect(accountPatcher.totalAccounts).toBe(0)
      expect(accountPatcher.debug_ignoreUpdates).toBe(false)
      expect(accountPatcher.failedLastTrieSync).toBe(false)
      expect(accountPatcher.sendHashesToEdgeNodes).toBe(true)
    })

    it('should initialize shardTrie with correct number of layers', () => {
      expect(accountPatcher.shardTrie.layerMaps).toHaveLength(5) // treeMaxDepth + 1
      accountPatcher.shardTrie.layerMaps.forEach((layerMap) => {
        expect(layerMap).toBeInstanceOf(Map)
      })
    })

    it('should initialize empty collections', () => {
      expect(accountPatcher.accountUpdateQueue).toEqual([])
      expect(accountPatcher.accountUpdateQueueFuture).toEqual([])
      expect(accountPatcher.accountRemovalQueue).toEqual([])
      expect(accountPatcher.incompleteNodes).toEqual([])
      expect(accountPatcher.hashTrieSyncConsensusByCycle).toBeInstanceOf(Map)
    })

    it('should handle null logger gracefully', () => {
      const nullLoggerPatcher = new AccountPatcher(
        mockStateManager,
        mockProfiler,
        mockApp,
        null as any,
        mockP2P,
        mockCrypto,
        mockConfig
      )
      expect(nullLoggerPatcher).toBeDefined()
    })

    it('should set up loggers correctly', () => {
      expect(mockLogger.getLogger).toHaveBeenCalledWith('main')
      expect(mockLogger.getLogger).toHaveBeenCalledWith('fatal')
      expect(mockLogger.getLogger).toHaveBeenCalledWith('shardDump')
      expect(mockLogger.getLogger).toHaveBeenCalledWith('statsDump')
    })
  })

  describe('hashObj', () => {
    it('should hash an object using crypto.hash', () => {
      const testObj = { key: 'value' }
      const result = accountPatcher.hashObj(testObj)
      expect(mockCrypto.hash).toHaveBeenCalledWith(testObj)
      expect(result).toBe('hash_{"key":"value"}')
    })

    it('should handle null values', () => {
      const result = accountPatcher.hashObj(null as any)
      expect(mockCrypto.hash).toHaveBeenCalledWith(null)
      expect(result).toBe('hash_null')
    })

    it('should handle complex objects', () => {
      const complexObj = { nested: { data: [1, 2, 3] } }
      const result = accountPatcher.hashObj(complexObj)
      expect(mockCrypto.hash).toHaveBeenCalledWith(complexObj)
      expect(result).toBe('hash_{"nested":{"data":[1,2,3]}}')
    })

    it('should handle arrays', () => {
      const arr = [1, 2, 3]
      const result = accountPatcher.hashObj(arr as any)
      expect(mockCrypto.hash).toHaveBeenCalledWith(arr)
      expect(result).toBe('hash_[1,2,3]')
    })

    it('should handle strings', () => {
      const str = 'test string'
      const result = accountPatcher.hashObj(str as any)
      expect(mockCrypto.hash).toHaveBeenCalledWith(str)
      expect(result).toBe('hash_"test string"')
    })
  })

  describe('sortByAccountID', () => {
    it('should return -1 when first account ID is less than second', () => {
      const a: TrieAccount = { accountID: 'abc123', hash: 'hash1' }
      const b: TrieAccount = { accountID: 'def456', hash: 'hash2' }
      expect(accountPatcher.sortByAccountID(a, b)).toBe(-1)
    })

    it('should return 1 when first account ID is greater than second', () => {
      const a: TrieAccount = { accountID: 'xyz789', hash: 'hash1' }
      const b: TrieAccount = { accountID: 'abc123', hash: 'hash2' }
      expect(accountPatcher.sortByAccountID(a, b)).toBe(1)
    })

    it('should return 0 when account IDs are equal', () => {
      const a: TrieAccount = { accountID: 'same123', hash: 'hash1' }
      const b: TrieAccount = { accountID: 'same123', hash: 'hash2' }
      expect(accountPatcher.sortByAccountID(a, b)).toBe(0)
    })

    it('should handle empty string account IDs', () => {
      const a: TrieAccount = { accountID: '', hash: 'hash1' }
      const b: TrieAccount = { accountID: 'abc', hash: 'hash2' }
      expect(accountPatcher.sortByAccountID(a, b)).toBe(-1)
    })

    it('should correctly sort an array of accounts', () => {
      const accounts: TrieAccount[] = [
        { accountID: 'zzz', hash: 'hash1' },
        { accountID: 'aaa', hash: 'hash2' },
        { accountID: 'mmm', hash: 'hash3' },
      ]
      const sorted = accounts.sort((a, b) => accountPatcher.sortByAccountID(a, b))
      expect(sorted[0].accountID).toBe('aaa')
      expect(sorted[1].accountID).toBe('mmm')
      expect(sorted[2].accountID).toBe('zzz')
    })
  })

  describe('sortByRadix', () => {
    it('should return -1 when first radix is less than second', () => {
      const a: RadixAndHash = { radix: '0001', hash: 'hash1' }
      const b: RadixAndHash = { radix: '0010', hash: 'hash2' }
      expect(accountPatcher.sortByRadix(a, b)).toBe(-1)
    })

    it('should return 1 when first radix is greater than second', () => {
      const a: RadixAndHash = { radix: '1111', hash: 'hash1' }
      const b: RadixAndHash = { radix: '0000', hash: 'hash2' }
      expect(accountPatcher.sortByRadix(a, b)).toBe(1)
    })

    it('should return 0 when radixes are equal', () => {
      const a: RadixAndHash = { radix: '1010', hash: 'hash1' }
      const b: RadixAndHash = { radix: '1010', hash: 'hash2' }
      expect(accountPatcher.sortByRadix(a, b)).toBe(0)
    })

    it('should handle empty radixes', () => {
      const a: RadixAndHash = { radix: '', hash: 'hash1' }
      const b: RadixAndHash = { radix: '0001', hash: 'hash2' }
      expect(accountPatcher.sortByRadix(a, b)).toBe(-1)
    })

    it('should correctly sort an array of radix and hash objects', () => {
      const items: RadixAndHash[] = [
        { radix: 'ff', hash: 'hash1' },
        { radix: '00', hash: 'hash2' },
        { radix: 'aa', hash: 'hash3' },
      ]
      const sorted = items.sort((a, b) => accountPatcher.sortByRadix(a, b))
      expect(sorted[0].radix).toBe('00')
      expect(sorted[1].radix).toBe('aa')
      expect(sorted[2].radix).toBe('ff')
    })
  })

  describe('getAccountTreeInfo', () => {
    it('should return null when tree node does not exist', () => {
      const accountID = 'abcd1234'
      const result = accountPatcher.getAccountTreeInfo(accountID)

      expect(result).toBeNull()
    })

    it('should return null when accountTempMap is null', () => {
      const accountID = 'abcd1234'
      const radix = 'abcd' // First 4 chars based on treeMaxDepth

      // Add a tree node without accountTempMap
      accountPatcher.shardTrie.layerMaps[4].set(radix, {
        radix,
        hash: 'somehash',
        accounts: [],
        children: [],
        accountTempMap: null,
      } as any)

      const result = accountPatcher.getAccountTreeInfo(accountID)
      expect(result).toBeNull()
    })

    it('should return account info when it exists in the tree', () => {
      const accountID = 'abcd1234567890'
      const radix = 'abcd' // First 4 chars based on treeMaxDepth
      const expectedAccount = { accountID, hash: 'hash123' }

      // Create accountTempMap with the account
      const accountTempMap = new Map()
      accountTempMap.set(accountID, expectedAccount)

      // Add a tree node with accountTempMap
      accountPatcher.shardTrie.layerMaps[4].set(radix, {
        radix,
        hash: 'somehash',
        accounts: [],
        children: [],
        accountTempMap,
      } as any)

      const result = accountPatcher.getAccountTreeInfo(accountID)
      expect(result).toEqual(expectedAccount)
    })
  })

  describe('updateAccountHash', () => {
    beforeEach(() => {
      // Clear the queues
      accountPatcher.accountUpdateQueue = []
      accountPatcher.debug_ignoreUpdates = false
    })

    it('should add account to update queue when not ignoring updates', () => {
      const accountID = 'account123'
      const hash = 'hash123'

      accountPatcher.updateAccountHash(accountID, hash)

      expect(accountPatcher.accountUpdateQueue).toHaveLength(1)
      expect(accountPatcher.accountUpdateQueue[0]).toEqual({
        accountID,
        hash,
      })
    })

    it('should not add account when debug_ignoreUpdates is true', () => {
      accountPatcher.debug_ignoreUpdates = true
      const accountID = 'account123'
      const hash = 'hash123'

      accountPatcher.updateAccountHash(accountID, hash)

      expect(accountPatcher.accountUpdateQueue).toHaveLength(0)
    })

    it('should handle multiple updates', () => {
      accountPatcher.updateAccountHash('acc1', 'hash1')
      accountPatcher.updateAccountHash('acc2', 'hash2')
      accountPatcher.updateAccountHash('acc3', 'hash3')

      expect(accountPatcher.accountUpdateQueue).toHaveLength(3)
      expect(accountPatcher.accountUpdateQueue[0].accountID).toBe('acc1')
      expect(accountPatcher.accountUpdateQueue[1].accountID).toBe('acc2')
      expect(accountPatcher.accountUpdateQueue[2].accountID).toBe('acc3')
    })

    it('should allow duplicate account IDs with different hashes', () => {
      accountPatcher.updateAccountHash('acc1', 'hash1')
      accountPatcher.updateAccountHash('acc1', 'hash2')

      expect(accountPatcher.accountUpdateQueue).toHaveLength(2)
      expect(accountPatcher.accountUpdateQueue[0].hash).toBe('hash1')
      expect(accountPatcher.accountUpdateQueue[1].hash).toBe('hash2')
    })
  })

  describe('removeAccountHash', () => {
    beforeEach(() => {
      // Clear the removal queue
      accountPatcher.accountRemovalQueue = []
      accountPatcher.debug_ignoreUpdates = false
    })

    it('should add account ID to removal queue when not ignoring updates', () => {
      const accountID = 'account123'

      accountPatcher.removeAccountHash(accountID)

      expect(accountPatcher.accountRemovalQueue).toHaveLength(1)
      expect(accountPatcher.accountRemovalQueue[0]).toBe(accountID)
    })

    it('should add account even when debug_ignoreUpdates is true', () => {
      // removeAccountHash doesn't check debug_ignoreUpdates unlike updateAccountHash
      accountPatcher.debug_ignoreUpdates = true
      const accountID = 'account123'

      accountPatcher.removeAccountHash(accountID)

      expect(accountPatcher.accountRemovalQueue).toHaveLength(1)
      expect(accountPatcher.accountRemovalQueue[0]).toBe(accountID)
    })

    it('should handle multiple removals', () => {
      accountPatcher.removeAccountHash('acc1')
      accountPatcher.removeAccountHash('acc2')
      accountPatcher.removeAccountHash('acc3')

      expect(accountPatcher.accountRemovalQueue).toHaveLength(3)
      expect(accountPatcher.accountRemovalQueue[0]).toBe('acc1')
      expect(accountPatcher.accountRemovalQueue[1]).toBe('acc2')
      expect(accountPatcher.accountRemovalQueue[2]).toBe('acc3')
    })

    it('should allow duplicate account ID removals', () => {
      accountPatcher.removeAccountHash('acc1')
      accountPatcher.removeAccountHash('acc1')

      expect(accountPatcher.accountRemovalQueue).toHaveLength(2)
      expect(accountPatcher.accountRemovalQueue[0]).toBe('acc1')
      expect(accountPatcher.accountRemovalQueue[1]).toBe('acc1')
    })
  })

  describe('isRadixStored', () => {
    beforeEach(() => {
      accountPatcher.radixIsStored.clear()
      accountPatcher.nonStoredRanges = []
    })

    it('should return true when radix is not in any non-stored range', () => {
      const result = accountPatcher.isRadixStored(1, 'abcd')
      expect(result).toBe(true) // Default is true when not in nonStoredRanges
      expect(accountPatcher.radixIsStored.get('abcd')).toBe(true) // Should cache the result
    })

    it('should return false when radix is in non-stored range', () => {
      accountPatcher.nonStoredRanges = [{ low: 'aaaa', high: 'bbbb' }]
      const result = accountPatcher.isRadixStored(1, 'abcd')
      expect(result).toBe(false)
      expect(accountPatcher.radixIsStored.get('abcd')).toBe(false)
    })

    it('should return cached value when radix is already in map', () => {
      accountPatcher.radixIsStored.set('abcd', false)
      const result = accountPatcher.isRadixStored(1, 'abcd')
      expect(result).toBe(false)
    })

    it('should handle multiple ranges correctly', () => {
      accountPatcher.nonStoredRanges = [
        { low: 'aaaa', high: 'bbbb' },
        { low: 'eeee', high: 'ffff' },
      ]

      expect(accountPatcher.isRadixStored(1, 'abcd')).toBe(false) // In first range
      expect(accountPatcher.isRadixStored(1, 'cccc')).toBe(true) // Not in any range
      expect(accountPatcher.isRadixStored(1, 'efgh')).toBe(false) // In second range
      expect(accountPatcher.isRadixStored(1, 'gggg')).toBe(true) // Not in any range
    })
  })

  describe('calculateMinVotes', () => {
    it('should return 1 when there are no active nodes', () => {
      mockStateManager.currentCycleShardData.nodes = []
      const result = accountPatcher.calculateMinVotes()
      expect(result).toBe(1)
    })

    it('should return 1 when there is 1 active node', () => {
      mockStateManager.currentCycleShardData.nodes = [{ id: 'node1' }]
      const result = accountPatcher.calculateMinVotes()
      expect(result).toBe(1)
    })

    it('should return 2 when there are 2 active nodes', () => {
      mockStateManager.currentCycleShardData.nodes = [{ id: 'node1' }, { id: 'node2' }]
      const result = accountPatcher.calculateMinVotes()
      expect(result).toBe(2)
    })

    it('should return 2 when there are 3 active nodes', () => {
      mockStateManager.currentCycleShardData.nodes = [{ id: 'node1' }, { id: 'node2' }, { id: 'node3' }]
      const result = accountPatcher.calculateMinVotes()
      expect(result).toBe(2)
    })

    it('should use nodesPerConsenusGroup when it provides smaller value', () => {
      mockStateManager.currentCycleShardData.nodes = new Array(100).fill(null).map((_, i) => ({ id: `node${i}` }))
      mockStateManager.currentCycleShardData.shardGlobals.nodesPerConsenusGroup = 10
      // nodesPerConsenusGroup: ceil(10 * 0.51) = 6
      // majorityOfActiveNodes: ceil(100 * 0.51) = 51
      // min(6, 51) = 6
      const result = accountPatcher.calculateMinVotes()
      expect(result).toBe(6)
    })

    it('should use majorityOfActiveNodes when it provides smaller value', () => {
      mockStateManager.currentCycleShardData.nodes = new Array(10).fill(null).map((_, i) => ({ id: `node${i}` }))
      mockStateManager.currentCycleShardData.shardGlobals.nodesPerConsenusGroup = 100
      // nodesPerConsenusGroup: ceil(100 * 0.51) = 51
      // majorityOfActiveNodes: ceil(10 * 0.51) = 6
      // min(51, 6) = 6
      const result = accountPatcher.calculateMinVotes()
      expect(result).toBe(6)
    })
  })

  describe('setupHandlers', () => {
    it('should register internal binary handlers', () => {
      accountPatcher.setupHandlers()

      expect(mockP2P.registerInternalBinary).toHaveBeenCalledWith('binary/get_trie_hashes', expect.any(Function))
      expect(mockP2P.registerInternalBinary).toHaveBeenCalledWith('binary/repair_oos_accounts', expect.any(Function))
      expect(mockP2P.registerInternalBinary).toHaveBeenCalledWith('binary/sync_trie_hashes', expect.any(Function))
      expect(mockP2P.registerInternalBinary).toHaveBeenCalledWith(
        'binary/get_trie_account_hashes',
        expect.any(Function)
      )
    })

    it('should register external GET endpoints', () => {
      accountPatcher.setupHandlers()

      expect(Context.network.registerExternalGet).toHaveBeenCalledWith(
        'debug-patcher-ignore-hash-updates',
        expect.any(Function),
        expect.any(Function)
      )
      expect(Context.network.registerExternalGet).toHaveBeenCalledWith(
        'get-tree-last-insync-detail',
        expect.any(Function),
        expect.any(Function)
      )
      expect(Context.network.registerExternalGet).toHaveBeenCalledWith(
        'trie-repair-dump',
        expect.any(Function),
        expect.any(Function)
      )
      expect(Context.network.registerExternalGet).toHaveBeenCalledWith(
        'get-shard-dump',
        expect.any(Function),
        expect.any(Function)
      )
      expect(Context.network.registerExternalGet).toHaveBeenCalledWith(
        'account-report',
        expect.any(Function),
        expect.any(Function)
      )
      expect(Context.network.registerExternalGet).toHaveBeenCalledWith(
        'account-coverage',
        expect.any(Function),
        expect.any(Function)
      )

      // Verify it was called multiple times
      expect(Context.network.registerExternalGet).toHaveBeenCalledTimes(15)
    })
  })
})
