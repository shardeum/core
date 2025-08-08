import StateManager from './index'
import AccountCache from './AccountCache'
import { cacheStorageMetrics } from './CacheStorageMetrics'
import { generateCorrelationId, getTimingLogger, TimingOperation } from './TimingLogger'
import * as ShardusTypes from '../shardus/shardus-types'
import * as utils from '../utils'
import { logFlags } from '../logger'
import { nestedCountersInstance } from '../utils/nestedCounters'

/**
 * AtomicCacheStorage provides atomic operations for cache and storage updates
 * ensuring they are always synchronized under FIFO lock protection.
 */
export class AtomicCacheStorage {
  private stateManager: StateManager
  private accountCache: AccountCache
  
  constructor(stateManager: StateManager) {
    this.stateManager = stateManager
    this.accountCache = stateManager.accountCache
  }
  
  /**
   * Atomically update both storage and cache under FIFO lock protection
   * Cache is only updated if storage write succeeds
   */
  async atomicUpdate(
    accountId: string,
    data: unknown,
    stateId: string,
    timestamp: number,
    cycleToRecordOn: number,
    storageWriteFn: () => Promise<void>,
    context: string = 'atomic_update'
  ): Promise<{ success: boolean; error?: Error }> {
    const correlationId = generateCorrelationId('atomic')
    let ourLockID: number | undefined
    
    try {
      // Acquire FIFO lock for this account modification
      const lockKey = `accountModification_${accountId}`
      ourLockID = await this.stateManager.fifoLock(lockKey)
      
      // Track operation start
      cacheStorageMetrics.trackStorageOperationStart(accountId, correlationId)
      
      // Log storage write start
      try {
        const timingLogger = getTimingLogger()
        timingLogger.log(
          TimingOperation.STORAGE_WRITE_START,
          accountId,
          stateId,
          correlationId,
          context,
          { timestamp }
        )
      } catch (e) {
        // Timing logger not initialized
      }
      
      // Perform storage write
      await storageWriteFn()
      
      // Log storage write complete
      try {
        const timingLogger = getTimingLogger()
        timingLogger.log(
          TimingOperation.STORAGE_WRITE_COMPLETE,
          accountId,
          stateId,
          correlationId,
          context,
          { timestamp }
        )
      } catch (e) {
        // Timing logger not initialized
      }
      
      // Storage succeeded - update cache atomically
      try {
        // Track cache update after storage
        cacheStorageMetrics.trackCacheAfterStorage(accountId, stateId, correlationId)
        
        // Update the cache
        this.accountCache.updateAccountHash(accountId, stateId, timestamp, cycleToRecordOn)
        
        // Track successful completion
        cacheStorageMetrics.trackStorageOperationComplete(accountId, true, correlationId)
        
        nestedCountersInstance.countEvent('atomic-cache-storage', 'success')
        
        return { success: true }
      } catch (cacheError) {
        // Cache update failed but storage succeeded - this is a problem
        /* prettier-ignore */ if (logFlags.error) this.stateManager.mainLogger.error(`AtomicCacheStorage: Cache update failed after storage success for ${utils.makeShortHash(accountId)}: ${cacheError.message}`)
        
        cacheStorageMetrics.trackOrphanedCacheUpdate(accountId)
        nestedCountersInstance.countEvent('atomic-cache-storage', 'cache_update_failed')
        
        return { success: false, error: cacheError as Error }
      }
    } catch (storageError) {
      // Storage write failed - do NOT update cache
      try {
        const timingLogger = getTimingLogger()
        timingLogger.log(
          TimingOperation.STORAGE_WRITE_ERROR,
          accountId,
          stateId,
          correlationId,
          `${context} error: ${(storageError as Error).message}`,
          { error: (storageError as Error).message }
        )
      } catch (e) {
        // Timing logger not initialized
      }
      
      // Track storage failure
      cacheStorageMetrics.trackStorageOperationComplete(accountId, false, correlationId)
      nestedCountersInstance.countEvent('atomic-cache-storage', 'storage_write_failed')
      
      return { success: false, error: storageError as Error }
    } finally {
      // Always release the lock
      if (ourLockID !== undefined) {
        this.stateManager.fifoUnlock('accountModification_' + accountId, ourLockID)
      }
    }
  }
  
  /**
   * Atomically update multiple accounts with rollback capability
   */
  async atomicBatchUpdate(
    updates: Array<{
      accountId: string
      data: unknown
      stateId: string
      timestamp: number
      cycleToRecordOn: number
    }>,
    batchStorageWriteFn: () => Promise<void>,
    context: string = 'atomic_batch_update'
  ): Promise<{ success: boolean; error?: Error; failedAccounts?: string[] }> {
    const correlationId = generateCorrelationId('batch')
    const lockIDs: Map<string, number> = new Map()
    const successfulCacheUpdates: string[] = []
    
    try {
      // Acquire locks for all accounts in sorted order to prevent deadlocks
      const sortedAccountIds = updates.map(u => u.accountId).sort()
      for (const accountId of sortedAccountIds) {
        const lockKey = `accountModification_${accountId}`
        const lockID = await this.stateManager.fifoLock(lockKey)
        if (lockID !== undefined) {
          lockIDs.set(lockKey, lockID)
        }
      }
      
      // Track operation start for all accounts
      for (const update of updates) {
        cacheStorageMetrics.trackStorageOperationStart(update.accountId, correlationId)
      }
      
      // Perform batch storage write
      await batchStorageWriteFn()
      
      // Storage succeeded - update cache for all accounts
      const failedCacheUpdates: string[] = []
      
      for (const update of updates) {
        try {
          // Track cache update after storage
          cacheStorageMetrics.trackCacheAfterStorage(update.accountId, update.stateId, correlationId)
          
          // Update the cache
          this.accountCache.updateAccountHash(
            update.accountId,
            update.stateId,
            update.timestamp,
            update.cycleToRecordOn
          )
          
          successfulCacheUpdates.push(update.accountId)
          
          // Track successful completion
          cacheStorageMetrics.trackStorageOperationComplete(update.accountId, true, correlationId)
        } catch (cacheError) {
          // Track individual cache update failure
          failedCacheUpdates.push(update.accountId)
          cacheStorageMetrics.trackOrphanedCacheUpdate(update.accountId)
          
          /* prettier-ignore */ if (logFlags.error) this.stateManager.mainLogger.error(`AtomicBatchUpdate: Cache update failed for ${utils.makeShortHash(update.accountId)}: ${cacheError.message}`)
        }
      }
      
      if (failedCacheUpdates.length > 0) {
        nestedCountersInstance.countEvent('atomic-cache-storage', 'batch_partial_cache_failure')
        return { 
          success: false, 
          error: new Error(`Cache updates failed for ${failedCacheUpdates.length} accounts`),
          failedAccounts: failedCacheUpdates
        }
      }
      
      nestedCountersInstance.countEvent('atomic-cache-storage', 'batch_success')
      return { success: true }
      
    } catch (storageError) {
      // Storage write failed - do NOT update any cache entries
      for (const update of updates) {
        cacheStorageMetrics.trackStorageOperationComplete(update.accountId, false, correlationId)
      }
      
      nestedCountersInstance.countEvent('atomic-cache-storage', 'batch_storage_failed')
      return { success: false, error: storageError as Error }
      
    } finally {
      // Release all locks in reverse order
      const reversedLockEntries = Array.from(lockIDs.entries()).reverse()
      for (const [lockKey, lockID] of reversedLockEntries) {
        this.stateManager.fifoUnlock(lockKey, lockID)
      }
    }
  }
  
  /**
   * Validate consistency between cache and storage
   */
  async validateConsistency(
    accountId: string,
    expectedHash?: string
  ): Promise<{ consistent: boolean; cacheHash?: string; storageHash?: string; error?: string }> {
    try {
      // Get cache hash
      const cacheEntry = this.accountCache.getAccountHash(accountId)
      const cacheHash = cacheEntry?.h
      
      // Get storage data and compute hash
      const accounts = await this.stateManager.app.getAccountDataByList([accountId])
      if (!accounts || accounts.length === 0) {
        return {
          consistent: false,
          cacheHash,
          error: 'Account not found in storage'
        }
      }
      
      const storageHash = this.stateManager.app.calculateAccountHash(accounts[0].data)
      
      // Check consistency
      const consistent = cacheHash === storageHash
      
      if (!consistent) {
        // Log and track divergence
        cacheStorageMetrics.trackDivergence(accountId, cacheHash || '', storageHash)
        
        /* prettier-ignore */ if (logFlags.error) this.stateManager.mainLogger.error(`Consistency check failed for ${utils.makeShortHash(accountId)}: cache=${cacheHash} storage=${storageHash}`)
        
        nestedCountersInstance.countEvent('atomic-cache-storage', 'consistency_check_failed')
      }
      
      // Also check against expected hash if provided
      if (expectedHash && expectedHash !== storageHash) {
        return {
          consistent: false,
          cacheHash,
          storageHash,
          error: `Storage hash doesn't match expected: ${expectedHash}`
        }
      }
      
      return { consistent, cacheHash, storageHash }
      
    } catch (error) {
      return {
        consistent: false,
        error: `Validation error: ${(error as Error).message}`
      }
    }
  }
  
  /**
   * Repair inconsistency by updating cache from storage
   */
  async repairFromStorage(accountId: string): Promise<{ success: boolean; error?: string }> {
    const correlationId = generateCorrelationId('repair')
    let ourLockID: number | undefined
    
    try {
      // Acquire lock for repair operation
      const lockKey = `accountModification_${accountId}`
      ourLockID = await this.stateManager.fifoLock(lockKey)
      
      // Get current storage state
      const accounts = await this.stateManager.app.getAccountDataByList([accountId])
      if (!accounts || accounts.length === 0) {
        return { success: false, error: 'Account not found in storage' }
      }
      
      const account = accounts[0]
      const storageHash = this.stateManager.app.calculateAccountHash(account.data)
      const timestamp = account.timestamp || Date.now()
      const cycleToRecordOn = this.stateManager.currentCycleShardData?.cycleNumber || 0
      
      // Update cache to match storage
      this.accountCache.updateAccountHash(accountId, storageHash, timestamp, cycleToRecordOn)
      
      // Track the repair
      cacheStorageMetrics.trackCacheAfterStorage(accountId, storageHash, correlationId)
      nestedCountersInstance.countEvent('atomic-cache-storage', 'repair_from_storage')
      
      /* prettier-ignore */ if (logFlags.verbose) this.stateManager.mainLogger.debug(`Repaired cache for ${utils.makeShortHash(accountId)} from storage`)
      
      return { success: true }
      
    } catch (error) {
      nestedCountersInstance.countEvent('atomic-cache-storage', 'repair_failed')
      return { success: false, error: (error as Error).message }
      
    } finally {
      if (ourLockID !== undefined) {
        this.stateManager.fifoUnlock('accountModification_' + accountId, ourLockID)
      }
    }
  }
}