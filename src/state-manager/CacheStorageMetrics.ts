import { nestedCountersInstance } from '../utils/nestedCounters'
import { getTimingLogger, TimingOperation } from './TimingLogger'
import * as utils from '../utils'

/**
 * Metrics tracker for cache/storage synchronization
 */
export class CacheStorageMetrics {
  private static instance: CacheStorageMetrics
  
  // Track operation counts
  private cacheUpdatesBeforeStorage = 0
  private cacheUpdatesAfterStorage = 0
  private storageWritesWithoutCache = 0
  private cacheRollbacks = 0
  private divergenceDetected = 0
  private orphanedCacheUpdates = 0
  
  // Track timing windows
  private timingWindows = new Map<string, {
    cacheUpdateTime?: bigint
    storageStartTime?: bigint
    storageEndTime?: bigint
  }>()

  private constructor() {}

  static getInstance(): CacheStorageMetrics {
    if (!CacheStorageMetrics.instance) {
      CacheStorageMetrics.instance = new CacheStorageMetrics()
    }
    return CacheStorageMetrics.instance
  }

  /**
   * Track cache update before storage
   */
  trackCacheBeforeStorage(accountId: string, hash: string, correlationId?: string): void {
    this.cacheUpdatesBeforeStorage++
    nestedCountersInstance.countEvent('cache-storage-sync', 'cache_before_storage')
    
    try {
      const timingLogger = getTimingLogger()
      timingLogger.trackCorrelatedOperation(
        TimingOperation.CACHE_UPDATE_BEFORE_STORAGE,
        accountId,
        hash,
        correlationId,
        'cache_update_before_storage'
      )
    } catch (e) {
      // Timing logger not initialized
    }
    
    // Track timing window
    const key = `${accountId}:${correlationId || 'none'}`
    if (!this.timingWindows.has(key)) {
      this.timingWindows.set(key, {})
    }
    this.timingWindows.get(key)!.cacheUpdateTime = process.hrtime.bigint()
  }

  /**
   * Track cache update after storage
   */
  trackCacheAfterStorage(accountId: string, hash: string, correlationId?: string): void {
    this.cacheUpdatesAfterStorage++
    nestedCountersInstance.countEvent('cache-storage-sync', 'cache_after_storage')
    
    try {
      const timingLogger = getTimingLogger()
      timingLogger.trackCorrelatedOperation(
        TimingOperation.CACHE_UPDATE_AFTER_STORAGE,
        accountId,
        hash,
        correlationId,
        'cache_update_after_storage'
      )
    } catch (e) {
      // Timing logger not initialized
    }
  }

  /**
   * Track storage write without corresponding cache update
   */
  trackStorageWithoutCache(accountId: string, hash: string): void {
    this.storageWritesWithoutCache++
    nestedCountersInstance.countEvent('cache-storage-sync', 'storage_without_cache')
    nestedCountersInstance.countRareEvent('cache-storage-sync', `storage_without_cache:${utils.makeShortHash(accountId)}`)
  }

  /**
   * Track cache rollback
   */
  trackCacheRollback(accountId: string, reason: string): void {
    this.cacheRollbacks++
    nestedCountersInstance.countEvent('cache-storage-sync', 'cache_rollback')
    nestedCountersInstance.countEvent('cache-storage-sync', `cache_rollback:${reason}`)
    
    try {
      const timingLogger = getTimingLogger()
      timingLogger.log(
        TimingOperation.CACHE_ROLLBACK,
        accountId,
        undefined,
        undefined,
        reason
      )
    } catch (e) {
      // Timing logger not initialized
    }
  }

  /**
   * Track divergence detection
   */
  trackDivergence(accountId: string, cacheHash: string, storageHash: string): void {
    this.divergenceDetected++
    nestedCountersInstance.countEvent('cache-storage-sync', 'divergence_detected')
    nestedCountersInstance.countRareEvent('cache-storage-sync', `divergence:${utils.makeShortHash(accountId)}`)
    
    try {
      const timingLogger = getTimingLogger()
      timingLogger.detectDivergence(accountId, cacheHash, storageHash)
    } catch (e) {
      // Timing logger not initialized
    }
  }

  /**
   * Track orphaned cache update
   */
  trackOrphanedCacheUpdate(accountId: string): void {
    this.orphanedCacheUpdates++
    nestedCountersInstance.countEvent('cache-storage-sync', 'orphaned_cache_update')
    nestedCountersInstance.countRareEvent('cache-storage-sync', `orphaned:${utils.makeShortHash(accountId)}`)
  }

  /**
   * Track storage operation timing
   */
  trackStorageOperationStart(accountId: string, correlationId?: string): void {
    const key = `${accountId}:${correlationId || 'none'}`
    if (!this.timingWindows.has(key)) {
      this.timingWindows.set(key, {})
    }
    this.timingWindows.get(key)!.storageStartTime = process.hrtime.bigint()
  }

  /**
   * Track storage operation completion and detect issues
   */
  trackStorageOperationComplete(accountId: string, success: boolean, correlationId?: string): void {
    const key = `${accountId}:${correlationId || 'none'}`
    const window = this.timingWindows.get(key)
    
    if (window) {
      window.storageEndTime = process.hrtime.bigint()
      
      // Check if cache was updated before storage started
      if (window.cacheUpdateTime && window.storageStartTime) {
        if (window.cacheUpdateTime < window.storageStartTime) {
          nestedCountersInstance.countEvent('cache-storage-sync', 'cache_before_storage_pattern')
        }
      }
      
      // Check if storage completed but cache was never updated
      if (!window.cacheUpdateTime && success) {
        this.trackStorageWithoutCache(accountId, '')
      }
      
      // Clean up old timing windows periodically
      if (this.timingWindows.size > 10000) {
        this.cleanupOldWindows()
      }
    }
  }

  /**
   * Clean up old timing windows to prevent memory leaks
   */
  private cleanupOldWindows(): void {
    const cutoffTime = process.hrtime.bigint() - BigInt(60 * 1e9) // 60 seconds ago
    
    for (const [key, window] of this.timingWindows.entries()) {
      const latestTime = Math.max(
        Number(window.cacheUpdateTime || 0),
        Number(window.storageEndTime || 0)
      )
      
      if (latestTime > 0 && BigInt(latestTime) < cutoffTime) {
        this.timingWindows.delete(key)
      }
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): {
    cacheUpdatesBeforeStorage: number
    cacheUpdatesAfterStorage: number
    storageWritesWithoutCache: number
    cacheRollbacks: number
    divergenceDetected: number
    orphanedCacheUpdates: number
    activeTimingWindows: number
  } {
    return {
      cacheUpdatesBeforeStorage: this.cacheUpdatesBeforeStorage,
      cacheUpdatesAfterStorage: this.cacheUpdatesAfterStorage,
      storageWritesWithoutCache: this.storageWritesWithoutCache,
      cacheRollbacks: this.cacheRollbacks,
      divergenceDetected: this.divergenceDetected,
      orphanedCacheUpdates: this.orphanedCacheUpdates,
      activeTimingWindows: this.timingWindows.size
    }
  }

  /**
   * Reset metrics (for testing)
   */
  resetMetrics(): void {
    this.cacheUpdatesBeforeStorage = 0
    this.cacheUpdatesAfterStorage = 0
    this.storageWritesWithoutCache = 0
    this.cacheRollbacks = 0
    this.divergenceDetected = 0
    this.orphanedCacheUpdates = 0
    this.timingWindows.clear()
  }
}

export const cacheStorageMetrics = CacheStorageMetrics.getInstance()