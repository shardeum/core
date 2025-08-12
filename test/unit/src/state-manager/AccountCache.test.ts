// Mock all dependencies before importing
jest.mock('../../../../src/utils/profiler')
jest.mock('../../../../src/logger')
jest.mock('../../../../src/crypto')
jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn()
  }
}))
jest.mock('../../../../src/network', () => ({
  shardusGetTime: jest.fn(() => Date.now())
}))
jest.mock('../../../../src/p2p/NodeList', () => ({
  reset: jest.fn()
}))
jest.mock('../../../../src/p2p/CycleChain', () => ({}))
jest.mock('../../../../src/snapshot', () => ({}))
jest.mock('../../../../src/p2p/Active', () => ({}))

import AccountCache from '../../../../src/state-manager/AccountCache'
import { AccountHashCache, AccountHashCacheHistory } from '../../../../src/state-manager/state-manager-types'

describe('AccountCache', () => {
  let accountCache: AccountCache
  let mockStateManager: any
  let mockProfiler: any
  let mockApp: any
  let mockLogger: any
  let mockCrypto: any
  let mockConfig: any

  beforeEach(() => {
    // Mock StateManager
    mockStateManager = {
      currentCycleShardData: {
        cycleNumber: 100
      },
      statemanager_fatal: jest.fn(),
      transactionRepair: {},
      transactionQueue: {},
      accountCache: {},
      accountPatcher: {},
      accountGlobals: {},
      accountSync: {},
      partitionObjects: {},
      partitionStats: {},
      archiverDataSourceHelper: {},
      archiverSyncTracker: {},
      cachedAppDataManager: {},
      dataSourceHelper: {},
      nodeSyncTracker: {}
    }

    // Mock Profiler
    mockProfiler = {
      scopedProfileSectionStart: jest.fn(),
      scopedProfileSectionEnd: jest.fn()
    }

    // Mock App
    mockApp = {
      getAccountDataByList: jest.fn()
    }

    // Mock Logger
    mockLogger = {
      getLogger: jest.fn().mockReturnValue({
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        trace: jest.fn()
      })
    }

    // Mock Crypto
    mockCrypto = {
      sign: jest.fn(),
      verify: jest.fn(),
      hash: jest.fn()
    }

    // Default config with bypassAccountCache disabled
    mockConfig = {
      stateManager: {
        bypassAccountCache: false
      }
    }

    accountCache = new AccountCache(
      mockStateManager,
      mockProfiler,
      mockApp,
      mockLogger,
      mockCrypto,
      mockConfig
    )
  })

  describe('hasAccount', () => {
    const testAccountId = 'test-account-123'

    describe('when bypassAccountCache is false (default behavior)', () => {
      beforeEach(() => {
        mockConfig.stateManager.bypassAccountCache = false
      })

      it('should return true when account exists in cache', async () => {
        // Setup cache to have the account
        accountCache.accountsHashCache3.accountHashMap.set(testAccountId, {
          lastSeenCycle: 99,
          lastSeenSortIndex: -1,
          queueIndex: { id: -1, idx: -1 },
          accountHashList: [],
          lastStaleCycle: -1,
          lastUpdateCycle: -1
        })

        const result = await accountCache.hasAccount(testAccountId)

        expect(result).toBe(true)
        expect(mockApp.getAccountDataByList).not.toHaveBeenCalled()
      })

      it('should return false when account does not exist in cache', async () => {
        // Cache is empty by default
        const result = await accountCache.hasAccount(testAccountId)

        expect(result).toBe(false)
        expect(mockApp.getAccountDataByList).not.toHaveBeenCalled()
      })
    })

    describe('when bypassAccountCache is true', () => {
      beforeEach(() => {
        mockConfig.stateManager.bypassAccountCache = true
      })

      it('should return true when account exists in storage', async () => {
        const mockAccountData = {
          accountId: testAccountId,
          stateId: 'hash123',
          timestamp: Date.now(),
          data: { balance: 100 }
        }
        mockApp.getAccountDataByList.mockResolvedValue([mockAccountData])

        const result = await accountCache.hasAccount(testAccountId)

        expect(result).toBe(true)
        expect(mockApp.getAccountDataByList).toHaveBeenCalledWith([testAccountId])
      })

      it('should return false when account does not exist in storage', async () => {
        mockApp.getAccountDataByList.mockResolvedValue([])

        const result = await accountCache.hasAccount(testAccountId)

        expect(result).toBe(false)
        expect(mockApp.getAccountDataByList).toHaveBeenCalledWith([testAccountId])
      })

      it('should return false when storage returns null account', async () => {
        mockApp.getAccountDataByList.mockResolvedValue([null])

        const result = await accountCache.hasAccount(testAccountId)

        expect(result).toBe(false)
        expect(mockApp.getAccountDataByList).toHaveBeenCalledWith([testAccountId])
      })

      it('should return false when storage returns undefined', async () => {
        mockApp.getAccountDataByList.mockResolvedValue(undefined)

        const result = await accountCache.hasAccount(testAccountId)

        expect(result).toBe(false)
        expect(mockApp.getAccountDataByList).toHaveBeenCalledWith([testAccountId])
      })

      it('should handle storage errors gracefully', async () => {
        mockApp.getAccountDataByList.mockRejectedValue(new Error('Storage error'))

        await expect(accountCache.hasAccount(testAccountId)).rejects.toThrow('Storage error')
        expect(mockApp.getAccountDataByList).toHaveBeenCalledWith([testAccountId])
      })
    })
  })

  describe('getAccountHash', () => {
    const testAccountId = 'test-account-456'

    describe('when bypassAccountCache is false (default behavior)', () => {
      beforeEach(() => {
        mockConfig.stateManager.bypassAccountCache = false
      })

      it('should return account hash when account exists in cache', async () => {
        const mockAccountHash: AccountHashCache = {
          h: 'cached-hash-123',
          t: 1234567890,
          c: 99
        }

        const mockCacheHistory: AccountHashCacheHistory = {
          lastSeenCycle: 99,
          lastSeenSortIndex: -1,
          queueIndex: { id: -1, idx: -1 },
          accountHashList: [mockAccountHash],
          lastStaleCycle: -1,
          lastUpdateCycle: -1
        }

        accountCache.accountsHashCache3.accountHashMap.set(testAccountId, mockCacheHistory)

        const result = await accountCache.getAccountHash(testAccountId)

        expect(result).toEqual(mockAccountHash)
        expect(mockApp.getAccountDataByList).not.toHaveBeenCalled()
      })

      it('should return null when account does not exist in cache', async () => {
        const result = await accountCache.getAccountHash(testAccountId)

        expect(result).toBeNull()
        expect(mockApp.getAccountDataByList).not.toHaveBeenCalled()
      })

      it('should return undefined when account exists but has no hash list', async () => {
        const mockCacheHistory: AccountHashCacheHistory = {
          lastSeenCycle: 99,
          lastSeenSortIndex: -1,
          queueIndex: { id: -1, idx: -1 },
          accountHashList: [],
          lastStaleCycle: -1,
          lastUpdateCycle: -1
        }

        accountCache.accountsHashCache3.accountHashMap.set(testAccountId, mockCacheHistory)

        const result = await accountCache.getAccountHash(testAccountId)

        expect(result).toBeUndefined()
        expect(mockApp.getAccountDataByList).not.toHaveBeenCalled()
      })
    })

    describe('when bypassAccountCache is true', () => {
      beforeEach(() => {
        mockConfig.stateManager.bypassAccountCache = true
      })

      it('should return account hash from storage when account exists', async () => {
        const mockTimestamp = 1640995200000 // 2022-01-01
        const mockAccountData = {
          accountId: testAccountId,
          stateId: 'storage-hash-456',
          timestamp: mockTimestamp,
          data: { balance: 200 }
        }
        mockApp.getAccountDataByList.mockResolvedValue([mockAccountData])

        const result = await accountCache.getAccountHash(testAccountId)

        expect(result).toEqual({
          h: 'storage-hash-456',
          t: mockTimestamp,
          c: 100 // Current cycle number from mockStateManager
        })
        expect(mockApp.getAccountDataByList).toHaveBeenCalledWith([testAccountId])
      })

      it('should use current timestamp when account data has no timestamp', async () => {
        const mockAccountData = {
          accountId: testAccountId,
          stateId: 'storage-hash-789',
          data: { balance: 300 }
        }
        mockApp.getAccountDataByList.mockResolvedValue([mockAccountData])

        const beforeCall = Date.now()
        const result = await accountCache.getAccountHash(testAccountId)
        const afterCall = Date.now()

        expect(result!.h).toBe('storage-hash-789')
        expect(result!.t).toBeGreaterThanOrEqual(beforeCall)
        expect(result!.t).toBeLessThanOrEqual(afterCall)
        expect(result!.c).toBe(100)
        expect(mockApp.getAccountDataByList).toHaveBeenCalledWith([testAccountId])
      })

      it('should use cycle 0 when currentCycleShardData is null', async () => {
        mockStateManager.currentCycleShardData = null

        const mockAccountData = {
          accountId: testAccountId,
          stateId: 'storage-hash-999',
          timestamp: 1640995200000,
          data: { balance: 400 }
        }
        mockApp.getAccountDataByList.mockResolvedValue([mockAccountData])

        const result = await accountCache.getAccountHash(testAccountId)

        expect(result).toEqual({
          h: 'storage-hash-999',
          t: 1640995200000,
          c: 0
        })
      })

      it('should return null when account does not exist in storage', async () => {
        mockApp.getAccountDataByList.mockResolvedValue([])

        const result = await accountCache.getAccountHash(testAccountId)

        expect(result).toBeNull()
        expect(mockApp.getAccountDataByList).toHaveBeenCalledWith([testAccountId])
      })

      it('should return null when storage returns null account', async () => {
        mockApp.getAccountDataByList.mockResolvedValue([null])

        const result = await accountCache.getAccountHash(testAccountId)

        expect(result).toBeNull()
        expect(mockApp.getAccountDataByList).toHaveBeenCalledWith([testAccountId])
      })

      it('should return null when storage returns undefined', async () => {
        mockApp.getAccountDataByList.mockResolvedValue(undefined)

        const result = await accountCache.getAccountHash(testAccountId)

        expect(result).toBeNull()
        expect(mockApp.getAccountDataByList).toHaveBeenCalledWith([testAccountId])
      })

      it('should handle storage errors gracefully', async () => {
        mockApp.getAccountDataByList.mockRejectedValue(new Error('Storage error'))

        await expect(accountCache.getAccountHash(testAccountId)).rejects.toThrow('Storage error')
        expect(mockApp.getAccountDataByList).toHaveBeenCalledWith([testAccountId])
      })
    })
  })

  describe('integration tests', () => {
    const testAccountId = 'integration-test-account'

    it('should handle switching between bypass modes correctly', async () => {
      // Start with cache disabled (bypass enabled)
      mockConfig.stateManager.bypassAccountCache = true

      const mockAccountData = {
        accountId: testAccountId,
        stateId: 'storage-hash-integration',
        timestamp: 1640995200000,
        data: { balance: 500 }
      }
      mockApp.getAccountDataByList.mockResolvedValue([mockAccountData])

      // Test with bypass enabled
      let hasAccount = await accountCache.hasAccount(testAccountId)
      let accountHash = await accountCache.getAccountHash(testAccountId)

      expect(hasAccount).toBe(true)
      expect(accountHash).toEqual({
        h: 'storage-hash-integration',
        t: 1640995200000,
        c: 100
      })
      expect(mockApp.getAccountDataByList).toHaveBeenCalledTimes(2)

      // Switch to cache enabled (bypass disabled)
      mockConfig.stateManager.bypassAccountCache = false

      // Add account to cache
      const mockCacheHash: AccountHashCache = {
        h: 'cached-hash-integration',
        t: 1640995300000,
        c: 101
      }

      accountCache.accountsHashCache3.accountHashMap.set(testAccountId, {
        lastSeenCycle: 101,
        lastSeenSortIndex: -1,
        queueIndex: { id: -1, idx: -1 },
        accountHashList: [mockCacheHash],
        lastStaleCycle: -1,
        lastUpdateCycle: -1
      })

      // Test with bypass disabled (should use cache)
      hasAccount = await accountCache.hasAccount(testAccountId)
      accountHash = await accountCache.getAccountHash(testAccountId)

      expect(hasAccount).toBe(true)
      expect(accountHash).toEqual(mockCacheHash)
      // Should still be 2 calls, not more, since we're using cache now
      expect(mockApp.getAccountDataByList).toHaveBeenCalledTimes(2)
    })

    it('should handle concurrent requests correctly', async () => {
      mockConfig.stateManager.bypassAccountCache = true

      const mockAccountData = {
        accountId: testAccountId,
        stateId: 'concurrent-hash',
        timestamp: 1640995200000,
        data: { balance: 600 }
      }
      mockApp.getAccountDataByList.mockResolvedValue([mockAccountData])

      // Make multiple concurrent requests
      const promises = [
        accountCache.hasAccount(testAccountId),
        accountCache.getAccountHash(testAccountId),
        accountCache.hasAccount(testAccountId),
        accountCache.getAccountHash(testAccountId)
      ]

      const results = await Promise.all(promises)

      expect(results[0]).toBe(true) // hasAccount
      expect(results[1]).toEqual({ // getAccountHash
        h: 'concurrent-hash',
        t: 1640995200000,
        c: 100
      })
      expect(results[2]).toBe(true) // hasAccount
      expect(results[3]).toEqual({ // getAccountHash
        h: 'concurrent-hash',
        t: 1640995200000,
        c: 100
      })

      // Should have been called for each request
      expect(mockApp.getAccountDataByList).toHaveBeenCalledTimes(4)
    })
  })
})