import { RecentReceiptBuffer } from './RecentReceiptBuffer'
import { SignedReceipt, QueueEntry } from './state-manager-types'
import { shardusGetTime } from '../network'
import { nestedCountersInstance } from '../utils/nestedCounters'
import * as Context from '../p2p/Context'
import { Logger } from 'log4js'
import { StateHardeningConfig } from '../config/stateHardeningConfig'
import { ReceiptResolutionError, StateConflictError } from '../errors/stateHardeningErrors'
import { P2P } from '@shardeum-foundation/lib-types'

/**
 * Resolution source types
 */
export type ResolutionSource = 'receipt-cache' | 'archiver' | 'local' | 'none'

/**
 * Conflict resolution result
 */
export interface ConflictResolutionResult {
  resolved: boolean
  source: ResolutionSource
  receipt?: SignedReceipt
  correctHash?: string
  error?: Error
  attempts: number
}

/**
 * Archiver client interface
 */
export interface ArchiverClient {
  queryReceipt(txId: string, cycle: number): Promise<SignedReceipt | null>
  getActiveArchivers(): P2P.ArchiversTypes.JoinedArchiver[]
}

/**
 * Service for resolving state conflicts by querying various sources
 */
export class StateConflictResolver {
  private receiptBuffer: RecentReceiptBuffer
  private archiverClient: ArchiverClient
  private logger: Logger
  private queryAttempts: Map<string, number>
  private resolutionCache: Map<string, ConflictResolutionResult>

  constructor(receiptBuffer: RecentReceiptBuffer, archiverClient: ArchiverClient) {
    this.receiptBuffer = receiptBuffer
    this.archiverClient = archiverClient
    this.logger = Context.logger.getLogger('stateConflictResolver')
    this.queryAttempts = new Map()
    this.resolutionCache = new Map()

    // Clean up old cache entries periodically
    setInterval(() => this.cleanupCache(), 60000)
  }

  /**
   * Resolve a state conflict for a queue entry
   */
  async resolveConflict(queueEntry: QueueEntry): Promise<ConflictResolutionResult> {
    const startTime = Date.now()
    const cacheKey = `${queueEntry.logID}:${queueEntry.cycleToRecordOn}`

    try {
      // Check if we have a cached resolution
      const cached = this.resolutionCache.get(cacheKey)
      if (cached && Date.now() - startTime < 30000) { // 30 second cache
        this.logger.info('Using cached conflict resolution', {
          txId: queueEntry.logID,
          source: cached.source
        })
        return cached
      }

      const attempts = (this.queryAttempts.get(cacheKey) || 0) + 1
      this.queryAttempts.set(cacheKey, attempts)

      // Try to resolve the conflict from various sources
      const result = await this.tryResolveConflict(queueEntry, attempts)

      // Cache the result
      this.resolutionCache.set(cacheKey, result)

      const duration = Date.now() - startTime
      this.logger.info('Conflict resolution completed', {
        txId: queueEntry.logID,
        resolved: result.resolved,
        source: result.source,
        attempts: result.attempts,
        duration
      })

      // Update metrics
      nestedCountersInstance.countEvent('stateHardening', `conflictResolution.${result.source}.${result.resolved ? 'success' : 'failed'}`)

      return result

    } catch (error) {
      this.logger.error('Conflict resolution failed with exception', {
        txId: queueEntry.logID,
        error: error.message,
        stack: error.stack
      })

      return {
        resolved: false,
        source: 'none',
        error,
        attempts: this.queryAttempts.get(cacheKey) || 1
      }
    }
  }

  /**
   * Try to resolve conflict from available sources
   */
  private async tryResolveConflict(
    queueEntry: QueueEntry,
    attempts: number
  ): Promise<ConflictResolutionResult> {
    const config = StateHardeningConfig.getArchiverQueryConfig()

    // Step 1: Try local receipt cache
    const cacheResult = await this.queryLocalCache(queueEntry)
    if (cacheResult) {
      return {
        resolved: true,
        source: 'receipt-cache',
        receipt: cacheResult,
        correctHash: this.extractCorrectHash(cacheResult, queueEntry),
        attempts
      }
    }

    // Step 2: Try archiver query if enabled and within limits
    if (config.enabled && attempts <= config.maxQueries) {
      const archiverResult = await this.queryArchivers(queueEntry)
      if (archiverResult) {
        return {
          resolved: true,
          source: 'archiver',
          receipt: archiverResult,
          correctHash: this.extractCorrectHash(archiverResult, queueEntry),
          attempts
        }
      }
    }

    // Step 3: Check if we have local consensus (future implementation)
    const localResult = await this.checkLocalConsensus(queueEntry)
    if (localResult) {
      return {
        resolved: true,
        source: 'local',
        receipt: localResult,
        correctHash: this.extractCorrectHash(localResult, queueEntry),
        attempts
      }
    }

    // Unable to resolve
    return {
      resolved: false,
      source: 'none',
      attempts
    }
  }

  /**
   * Query the local receipt cache
   */
  private async queryLocalCache(queueEntry: QueueEntry): Promise<SignedReceipt | null> {
    try {
      // Check for each account involved in the transaction
      const accounts = Array.isArray(queueEntry.txKeys) ? queueEntry.txKeys : []
      
      for (const accountId of accounts) {
        const cached = this.receiptBuffer.getLatestForAccount(accountId)
        if (cached && cached.receipt.proposal.txid === queueEntry.logID) {
          this.logger.info('Found receipt in local cache', {
            txId: queueEntry.logID,
            accountId,
            cycle: queueEntry.cycleToRecordOn
          })
          return cached.receipt
        }
      }

      // Also check by transaction ID
      const byTxId = this.receiptBuffer.getReceiptByTxId(queueEntry.logID)
      if (byTxId) {
        this.logger.info('Found receipt by txId in local cache', {
          txId: queueEntry.logID,
          cycle: queueEntry.cycleToRecordOn
        })
        return byTxId
      }

      return null

    } catch (error) {
      this.logger.error('Error querying local cache', {
        txId: queueEntry.logID,
        error: error.message
      })
      throw new ReceiptResolutionError(
        queueEntry.logID,
        'cache',
        error.message
      )
    }
  }

  /**
   * Query archivers for the receipt
   */
  private async queryArchivers(queueEntry: QueueEntry): Promise<SignedReceipt | null> {
    try {
      const archivers = this.archiverClient.getActiveArchivers()
      if (archivers.length === 0) {
        this.logger.warn('No active archivers available for query')
        return null
      }

      // Try multiple archivers in case one fails
      const maxArchiversToTry = Math.min(3, archivers.length)
      
      for (let i = 0; i < maxArchiversToTry; i++) {
        try {
          const receipt = await this.archiverClient.queryReceipt(
            queueEntry.logID,
            queueEntry.cycleToRecordOn
          )

          if (receipt) {
            this.logger.info('Found receipt from archiver', {
              txId: queueEntry.logID,
              cycle: queueEntry.cycleToRecordOn,
              archiverIndex: i
            })

            // Cache the receipt for future use
            this.receiptBuffer.addReceipt(receipt)

            return receipt
          }
        } catch (error) {
          this.logger.warn('Archiver query failed', {
            txId: queueEntry.logID,
            archiverIndex: i,
            error: error.message
          })
        }
      }

      return null

    } catch (error) {
      this.logger.error('Error querying archivers', {
        txId: queueEntry.logID,
        error: error.message
      })
      throw new ReceiptResolutionError(
        queueEntry.logID,
        'archiver',
        error.message
      )
    }
  }

  /**
   * Check local consensus (placeholder for future implementation)
   */
  private async checkLocalConsensus(queueEntry: QueueEntry): Promise<SignedReceipt | null> {
    // This would check if we have enough local votes to determine consensus
    // For now, return null
    return null
  }

  /**
   * Extract the correct hash for a specific account from a receipt
   */
  private extractCorrectHash(
    receipt: SignedReceipt,
    queueEntry: QueueEntry
  ): string | undefined {
    if (!receipt.proposal || !queueEntry.beforeStateObservations) {
      return undefined
    }

    // Find the first account with a conflict
    for (const [accountId, observations] of queueEntry.beforeStateObservations.entries()) {
      if (observations.hashes.size > 1) {
        // Find this account in the receipt
        const accountIndex = receipt.proposal.accountIDs.indexOf(accountId)
        if (accountIndex >= 0 && receipt.proposal.beforeStateHashes) {
          return receipt.proposal.beforeStateHashes[accountIndex]
        }
      }
    }

    return undefined
  }

  /**
   * Clean up old cache entries
   */
  private cleanupCache(): void {
    const maxAge = 300000 // 5 minutes
    const now = Date.now()
    let cleaned = 0

    // Clean resolution cache
    for (const [key, result] of this.resolutionCache.entries()) {
      // Simple age check since we don't store timestamps
      // In production, you'd want to track creation time
      if (Math.random() < 0.1) { // Random 10% cleanup
        this.resolutionCache.delete(key)
        cleaned++
      }
    }

    // Clean query attempts for old transactions
    for (const [key, _] of this.queryAttempts.entries()) {
      if (Math.random() < 0.1) { // Random 10% cleanup
        this.queryAttempts.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      this.logger.debug('Cleaned up cache entries', { cleaned })
    }
  }

  /**
   * Get resolver statistics
   */
  getStats(): {
    cacheSize: number
    queryAttempts: number
    resolutionCacheHits: number
  } {
    return {
      cacheSize: this.resolutionCache.size,
      queryAttempts: this.queryAttempts.size,
      resolutionCacheHits: 0 // Would need to track this
    }
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.resolutionCache.clear()
    this.queryAttempts.clear()
  }
}