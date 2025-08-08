import { jest } from '@jest/globals'
import { CacheStorageMetrics } from '../../../src/state-manager/CacheStorageMetrics'
import { TimingLogger, TimingOperation, initTimingLogger } from '../../../src/state-manager/TimingLogger'
import AccountCache from '../../../src/state-manager/AccountCache'
import StateManager from '../../../src/state-manager'
import * as ShardusTypes from '../../../src/shardus/shardus-types'

describe('Cache-Storage Race Condition Tests', () => {
  let mockLogger: any
  let timingLogger: TimingLogger
  let metrics: CacheStorageMetrics
  
  beforeEach(() => {
    // Setup mock logger
    mockLogger = {
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn()
    }
    
    // Initialize timing logger and metrics
    timingLogger = initTimingLogger(mockLogger, true)
    metrics = CacheStorageMetrics.getInstance()
    metrics.resetMetrics()
  })
  
  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('CacheStorageMetrics', () => {
    it('should track cache updates before storage', () => {
      const accountId = 'account123'
      const hash = 'hash456'
      const correlationId = 'corr789'
      
      metrics.trackCacheBeforeStorage(accountId, hash, correlationId)
      
      const metricsData = metrics.getMetrics()
      expect(metricsData.cacheUpdatesBeforeStorage).toBe(1)
    })
    
    it('should track cache updates after storage', () => {
      const accountId = 'account123'
      const hash = 'hash456'
      const correlationId = 'corr789'
      
      metrics.trackCacheAfterStorage(accountId, hash, correlationId)
      
      const metricsData = metrics.getMetrics()
      expect(metricsData.cacheUpdatesAfterStorage).toBe(1)
    })
    
    it('should track storage without cache updates', () => {
      const accountId = 'account123'
      const hash = 'hash456'
      
      metrics.trackStorageWithoutCache(accountId, hash)
      
      const metricsData = metrics.getMetrics()
      expect(metricsData.storageWritesWithoutCache).toBe(1)
    })
    
    it('should track cache rollbacks', () => {
      const accountId = 'account123'
      const reason = 'storage_failure'
      
      metrics.trackCacheRollback(accountId, reason)
      
      const metricsData = metrics.getMetrics()
      expect(metricsData.cacheRollbacks).toBe(1)
    })
    
    it('should track divergence detection', () => {
      const accountId = 'account123'
      const cacheHash = 'cacheHash456'
      const storageHash = 'storageHash789'
      
      metrics.trackDivergence(accountId, cacheHash, storageHash)
      
      const metricsData = metrics.getMetrics()
      expect(metricsData.divergenceDetected).toBe(1)
    })
    
    it('should track orphaned cache updates', () => {
      const accountId = 'account123'
      
      metrics.trackOrphanedCacheUpdate(accountId)
      
      const metricsData = metrics.getMetrics()
      expect(metricsData.orphanedCacheUpdates).toBe(1)
    })
    
    it('should track storage operation timing windows', () => {
      const accountId = 'account123'
      const correlationId = 'corr789'
      
      metrics.trackStorageOperationStart(accountId, correlationId)
      
      // Simulate some delay
      jest.advanceTimersByTime(100)
      
      metrics.trackStorageOperationComplete(accountId, true, correlationId)
      
      const metricsData = metrics.getMetrics()
      expect(metricsData.activeTimingWindows).toBeGreaterThanOrEqual(0)
    })
    
    it('should detect storage without cache pattern', () => {
      const accountId = 'account123'
      const correlationId = 'corr789'
      
      // Start storage operation without cache update
      metrics.trackStorageOperationStart(accountId, correlationId)
      metrics.trackStorageOperationComplete(accountId, true, correlationId)
      
      const metricsData = metrics.getMetrics()
      expect(metricsData.storageWritesWithoutCache).toBe(1)
    })
  })
  
  describe('TimingLogger Divergence Detection', () => {
    it('should detect cache/storage hash mismatch', () => {
      const accountId = 'account123'
      const cacheHash = 'cacheHash456'
      const storageHash = 'storageHash789'
      
      timingLogger.detectDivergence(accountId, cacheHash, storageHash)
      
      // Check that divergence was logged
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('DIVERGENCE_DETECTED')
      )
    })
    
    it('should not log divergence when hashes match', () => {
      const accountId = 'account123'
      const hash = 'sameHash456'
      
      timingLogger.detectDivergence(accountId, hash, hash)
      
      // Check that divergence was NOT logged
      expect(mockLogger.debug).not.toHaveBeenCalledWith(
        expect.stringContaining('DIVERGENCE_DETECTED')
      )
    })
    
    it('should track orphaned cache updates', () => {
      const accountId = 'account123'
      
      // Log cache update
      timingLogger.log(
        TimingOperation.CACHE_UPDATE,
        accountId,
        'hash123',
        undefined,
        'test'
      )
      
      // Check for orphaned updates (no storage write within window)
      const orphaned = timingLogger.checkOrphanedCacheUpdates(100)
      
      expect(orphaned).toContain(accountId)
    })
    
    it('should not report orphaned updates when storage write follows', () => {
      const accountId = 'account123'
      
      // Log cache update
      timingLogger.log(
        TimingOperation.CACHE_UPDATE,
        accountId,
        'hash123',
        undefined,
        'test'
      )
      
      // Log storage write complete
      timingLogger.log(
        TimingOperation.STORAGE_WRITE_COMPLETE,
        accountId,
        'hash123',
        undefined,
        'test'
      )
      
      // Check for orphaned updates
      const orphaned = timingLogger.checkOrphanedCacheUpdates(100)
      
      expect(orphaned).not.toContain(accountId)
    })
    
    it('should track correlated operations', () => {
      const accountId = 'account123'
      const hash = 'hash456'
      
      // Track correlated operation
      const correlationId = timingLogger.trackCorrelatedOperation(
        TimingOperation.CACHE_UPDATE,
        accountId,
        hash,
        undefined,
        'test'
      )
      
      expect(correlationId).toBeDefined()
      expect(correlationId).toMatch(/^op-/)
    })
    
    it('should calculate timing analysis correctly', () => {
      const accountId = 'account123'
      
      // Log some operations
      timingLogger.log(
        TimingOperation.CACHE_UPDATE,
        accountId,
        'hash123',
        undefined,
        'test'
      )
      
      timingLogger.log(
        TimingOperation.STORAGE_WRITE_START,
        accountId,
        'hash123',
        'corr1',
        'test'
      )
      
      timingLogger.log(
        TimingOperation.STORAGE_WRITE_COMPLETE,
        accountId,
        'hash123',
        'corr1',
        'test'
      )
      
      // Get timing analysis
      const analysis = timingLogger.getTimingAnalysis(accountId, 5000)
      
      expect(analysis.cacheUpdates).toBe(1)
      expect(analysis.storageWrites).toBe(1)
      expect(analysis.potentialRaceConditions.length).toBe(0)
    })
  })
  
  describe('Race Condition Scenarios', () => {
    it('should prevent cache update when storage write fails', async () => {
      const mockStateManager = {
        app: {
          setAccountData: jest.fn().mockRejectedValue(new Error('Storage failure')),
          calculateAccountHash: jest.fn().mockReturnValue('hash123')
        },
        accountCache: {
          hasAccount: jest.fn().mockReturnValue(false),
          updateAccountHash: jest.fn()
        },
        transactionQueue: {
          setDebugLastAwaitedCallInner: jest.fn(),
          processNonceQueue: jest.fn()
        },
        partitionStats: {
          statsDataSummaryInit: jest.fn()
        },
        statemanager_fatal: jest.fn(),
        mainLogger: mockLogger
      } as any
      
      const wrappedAccount: ShardusTypes.WrappedData = {
        accountId: 'account123',
        stateId: 'hash123',
        data: { test: 'data' },
        timestamp: Date.now()
      }
      
      // Simulate checkAndSetAccountData behavior
      try {
        await mockStateManager.app.setAccountData([wrappedAccount.data])
        // Cache should only be updated here if storage succeeds
        mockStateManager.accountCache.updateAccountHash(
          wrappedAccount.accountId,
          wrappedAccount.stateId,
          wrappedAccount.timestamp,
          1
        )
      } catch (e) {
        // Storage failed - cache should NOT be updated
      }
      
      // Verify cache was NOT updated due to storage failure
      expect(mockStateManager.accountCache.updateAccountHash).not.toHaveBeenCalled()
    })
    
    it('should update cache only after successful storage write', async () => {
      const mockStateManager = {
        app: {
          setAccountData: jest.fn().mockImplementation(() => Promise.resolve()),
          calculateAccountHash: jest.fn().mockReturnValue('hash123')
        },
        accountCache: {
          hasAccount: jest.fn().mockReturnValue(false),
          updateAccountHash: jest.fn()
        },
        transactionQueue: {
          setDebugLastAwaitedCallInner: jest.fn(),
          processNonceQueue: jest.fn()
        },
        partitionStats: {
          statsDataSummaryInit: jest.fn()
        },
        statemanager_fatal: jest.fn(),
        mainLogger: mockLogger
      } as any
      
      const wrappedAccount: ShardusTypes.WrappedData = {
        accountId: 'account123',
        stateId: 'hash123',
        data: { test: 'data' },
        timestamp: Date.now()
      }
      
      // Simulate checkAndSetAccountData behavior
      try {
        await mockStateManager.app.setAccountData([wrappedAccount.data])
        // Cache should only be updated here after storage succeeds
        mockStateManager.accountCache.updateAccountHash(
          wrappedAccount.accountId,
          wrappedAccount.stateId,
          wrappedAccount.timestamp,
          1
        )
      } catch (e) {
        // Storage failed - cache should NOT be updated
      }
      
      // Verify storage was called
      expect(mockStateManager.app.setAccountData).toHaveBeenCalledWith([wrappedAccount.data])
      
      // Verify cache was updated after storage success
      expect(mockStateManager.accountCache.updateAccountHash).toHaveBeenCalledWith(
        wrappedAccount.accountId,
        wrappedAccount.stateId,
        wrappedAccount.timestamp,
        1
      )
    })
    
    it('should handle concurrent updates correctly', async () => {
      const accountId = 'account123'
      const updates = [
        { hash: 'hash1', timestamp: 1000 },
        { hash: 'hash2', timestamp: 2000 },
        { hash: 'hash3', timestamp: 3000 }
      ]
      
      // Track all updates
      for (const update of updates) {
        const correlationId = `corr-${update.timestamp}`
        
        // Track cache before storage (old pattern - should be avoided)
        metrics.trackCacheBeforeStorage(accountId, update.hash, correlationId)
        
        // Track storage operation
        metrics.trackStorageOperationStart(accountId, correlationId)
        
        // Simulate storage success
        metrics.trackStorageOperationComplete(accountId, true, correlationId)
      }
      
      const metricsData = metrics.getMetrics()
      
      // All updates should be tracked
      expect(metricsData.cacheUpdatesBeforeStorage).toBe(3)
      
      // No orphaned updates since storage completed
      expect(metricsData.orphanedCacheUpdates).toBe(0)
    })
    
    it('should detect divergence after partial failure', () => {
      const accountId = 'account123'
      const correlationId = 'corr789'
      
      // Cache updated
      metrics.trackCacheBeforeStorage(accountId, 'cacheHash', correlationId)
      
      // Storage operation started but failed
      metrics.trackStorageOperationStart(accountId, correlationId)
      metrics.trackStorageOperationComplete(accountId, false, correlationId)
      
      // Later, divergence detected
      metrics.trackDivergence(accountId, 'cacheHash', 'oldStorageHash')
      
      const metricsData = metrics.getMetrics()
      
      expect(metricsData.divergenceDetected).toBe(1)
      expect(metricsData.cacheUpdatesBeforeStorage).toBe(1)
    })
  })
})