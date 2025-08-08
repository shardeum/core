import StateManager from './index'
import { AtomicCacheStorage } from './AtomicCacheStorage'
import { cacheStorageMetrics } from './CacheStorageMetrics'
import { getTimingLogger, TimingOperation } from './TimingLogger'
import * as utils from '../utils'
import { logFlags } from '../logger'
import { nestedCountersInstance } from '../utils/nestedCounters'

export interface ConsistencyCheckResult {
  totalChecked: number
  consistent: number
  inconsistent: number
  repaired: number
  failed: number
  divergentAccounts: Array<{
    accountId: string
    cacheHash?: string
    storageHash?: string
    error?: string
  }>
}

/**
 * ConsistencyValidator performs periodic validation of cache/storage consistency
 * and can repair inconsistencies when detected.
 */
export class ConsistencyValidator {
  private stateManager: StateManager
  private atomicCacheStorage: AtomicCacheStorage
  private validationInterval: NodeJS.Timeout | null = null
  private isValidating = false
  private lastValidationTime = 0
  private validationHistory: ConsistencyCheckResult[] = []
  private maxHistorySize = 100
  
  constructor(stateManager: StateManager) {
    this.stateManager = stateManager
    this.atomicCacheStorage = new AtomicCacheStorage(stateManager)
  }
  
  /**
   * Start periodic consistency validation
   */
  startPeriodicValidation(intervalMs: number = 60000, autoRepair = false): void {
    if (this.validationInterval) {
      this.stopPeriodicValidation()
    }
    
    this.validationInterval = setInterval(async () => {
      if (!this.isValidating) {
        await this.validateRandomSample(100, autoRepair)
      }
    }, intervalMs)
    
    /* prettier-ignore */ if (logFlags.verbose) this.stateManager.mainLogger.debug(`ConsistencyValidator: Started periodic validation every ${intervalMs}ms`)
  }
  
  /**
   * Stop periodic consistency validation
   */
  stopPeriodicValidation(): void {
    if (this.validationInterval) {
      clearInterval(this.validationInterval)
      this.validationInterval = null
      /* prettier-ignore */ if (logFlags.verbose) this.stateManager.mainLogger.debug('ConsistencyValidator: Stopped periodic validation')
    }
  }
  
  /**
   * Validate a random sample of accounts
   */
  async validateRandomSample(
    sampleSize: number = 100,
    autoRepair = false
  ): Promise<ConsistencyCheckResult> {
    if (this.isValidating) {
      return {
        totalChecked: 0,
        consistent: 0,
        inconsistent: 0,
        repaired: 0,
        failed: 0,
        divergentAccounts: []
      }
    }
    
    this.isValidating = true
    const startTime = Date.now()
    
    try {
      // Get a sample of account IDs from the cache
      const allAccountIds = Array.from(this.stateManager.accountCache.accountsHashCache3.accountHashMap.keys())
      
      if (allAccountIds.length === 0) {
        return {
          totalChecked: 0,
          consistent: 0,
          inconsistent: 0,
          repaired: 0,
          failed: 0,
          divergentAccounts: []
        }
      }
      
      // Sample random accounts
      const sampled = this.getRandomSample(allAccountIds, Math.min(sampleSize, allAccountIds.length))
      
      const result: ConsistencyCheckResult = {
        totalChecked: sampled.length,
        consistent: 0,
        inconsistent: 0,
        repaired: 0,
        failed: 0,
        divergentAccounts: []
      }
      
      // Check each sampled account
      for (const accountId of sampled) {
        const validation = await this.atomicCacheStorage.validateConsistency(accountId)
        
        if (validation.consistent) {
          result.consistent++
        } else {
          result.inconsistent++
          result.divergentAccounts.push({
            accountId,
            cacheHash: validation.cacheHash,
            storageHash: validation.storageHash,
            error: validation.error
          })
          
          // Attempt repair if enabled
          if (autoRepair) {
            const repairResult = await this.atomicCacheStorage.repairFromStorage(accountId)
            if (repairResult.success) {
              result.repaired++
            } else {
              result.failed++
            }
          }
        }
      }
      
      // Track metrics
      if (result.inconsistent > 0) {
        nestedCountersInstance.countEvent('consistency-validator', `divergence_found:${result.inconsistent}`)
        
        /* prettier-ignore */ if (logFlags.error) this.stateManager.mainLogger.error(`ConsistencyValidator: Found ${result.inconsistent} inconsistent accounts out of ${result.totalChecked} checked`)
        
        // Log divergent accounts
        for (const divergent of result.divergentAccounts) {
          /* prettier-ignore */ if (logFlags.error) this.stateManager.mainLogger.error(`  Divergent: ${utils.makeShortHash(divergent.accountId)} cache=${divergent.cacheHash} storage=${divergent.storageHash}`)
        }
      }
      
      // Update history
      this.lastValidationTime = Date.now()
      this.validationHistory.push(result)
      if (this.validationHistory.length > this.maxHistorySize) {
        this.validationHistory.shift()
      }
      
      // Log timing
      const duration = Date.now() - startTime
      /* prettier-ignore */ if (logFlags.verbose) this.stateManager.mainLogger.debug(`ConsistencyValidator: Checked ${result.totalChecked} accounts in ${duration}ms - ${result.consistent} consistent, ${result.inconsistent} inconsistent, ${result.repaired} repaired`)
      
      return result
      
    } finally {
      this.isValidating = false
    }
  }
  
  /**
   * Validate specific accounts
   */
  async validateAccounts(
    accountIds: string[],
    autoRepair = false
  ): Promise<ConsistencyCheckResult> {
    const result: ConsistencyCheckResult = {
      totalChecked: accountIds.length,
      consistent: 0,
      inconsistent: 0,
      repaired: 0,
      failed: 0,
      divergentAccounts: []
    }
    
    for (const accountId of accountIds) {
      const validation = await this.atomicCacheStorage.validateConsistency(accountId)
      
      if (validation.consistent) {
        result.consistent++
      } else {
        result.inconsistent++
        result.divergentAccounts.push({
          accountId,
          cacheHash: validation.cacheHash,
          storageHash: validation.storageHash,
          error: validation.error
        })
        
        if (autoRepair) {
          const repairResult = await this.atomicCacheStorage.repairFromStorage(accountId)
          if (repairResult.success) {
            result.repaired++
          } else {
            result.failed++
          }
        }
      }
    }
    
    return result
  }
  
  /**
   * Get validation history
   */
  getValidationHistory(): ConsistencyCheckResult[] {
    return [...this.validationHistory]
  }
  
  /**
   * Get last validation result
   */
  getLastValidationResult(): ConsistencyCheckResult | null {
    return this.validationHistory[this.validationHistory.length - 1] || null
  }
  
  /**
   * Get validation statistics
   */
  getValidationStats(): {
    totalValidations: number
    totalAccountsChecked: number
    totalInconsistencies: number
    totalRepairs: number
    lastValidationTime: number
    averageInconsistencyRate: number
  } {
    let totalAccountsChecked = 0
    let totalInconsistencies = 0
    let totalRepairs = 0
    
    for (const result of this.validationHistory) {
      totalAccountsChecked += result.totalChecked
      totalInconsistencies += result.inconsistent
      totalRepairs += result.repaired
    }
    
    const averageInconsistencyRate = totalAccountsChecked > 0
      ? (totalInconsistencies / totalAccountsChecked) * 100
      : 0
    
    return {
      totalValidations: this.validationHistory.length,
      totalAccountsChecked,
      totalInconsistencies,
      totalRepairs,
      lastValidationTime: this.lastValidationTime,
      averageInconsistencyRate
    }
  }
  
  /**
   * Perform emergency full validation
   */
  async emergencyFullValidation(autoRepair = true): Promise<ConsistencyCheckResult> {
    /* prettier-ignore */ if (logFlags.verbose) this.stateManager.mainLogger.debug('ConsistencyValidator: Starting emergency full validation')
    
    const allAccountIds = Array.from(this.stateManager.accountCache.accountsHashCache3.accountHashMap.keys())
    
    // Process in batches to avoid overwhelming the system
    const batchSize = 100
    const result: ConsistencyCheckResult = {
      totalChecked: 0,
      consistent: 0,
      inconsistent: 0,
      repaired: 0,
      failed: 0,
      divergentAccounts: []
    }
    
    for (let i = 0; i < allAccountIds.length; i += batchSize) {
      const batch = allAccountIds.slice(i, i + batchSize)
      const batchResult = await this.validateAccounts(batch, autoRepair)
      
      result.totalChecked += batchResult.totalChecked
      result.consistent += batchResult.consistent
      result.inconsistent += batchResult.inconsistent
      result.repaired += batchResult.repaired
      result.failed += batchResult.failed
      result.divergentAccounts.push(...batchResult.divergentAccounts)
      
      // Log progress
      const progress = Math.round((i + batch.length) / allAccountIds.length * 100)
      /* prettier-ignore */ if (logFlags.verbose) this.stateManager.mainLogger.debug(`ConsistencyValidator: Emergency validation ${progress}% complete`)
    }
    
    /* prettier-ignore */ if (logFlags.verbose) this.stateManager.mainLogger.debug(`ConsistencyValidator: Emergency validation complete - ${result.inconsistent} inconsistencies found, ${result.repaired} repaired`)
    
    return result
  }
  
  /**
   * Get random sample from array
   */
  private getRandomSample<T>(array: T[], sampleSize: number): T[] {
    const sample: T[] = []
    const used = new Set<number>()
    
    while (sample.length < sampleSize && sample.length < array.length) {
      const index = Math.floor(Math.random() * array.length)
      if (!used.has(index)) {
        used.add(index)
        sample.push(array[index])
      }
    }
    
    return sample
  }
  
  /**
   * Check if validation is currently running
   */
  isCurrentlyValidating(): boolean {
    return this.isValidating
  }
}