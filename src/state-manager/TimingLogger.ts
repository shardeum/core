import { Logger as Log4jsLogger } from 'log4js'
import { nestedCountersInstance } from '../utils/nestedCounters'

export enum TimingOperation {
  CACHE_UPDATE = 'CACHE_UPDATE',
  CACHE_UPDATE_BEFORE_STORAGE = 'CACHE_UPDATE_BEFORE_STORAGE',
  CACHE_UPDATE_AFTER_STORAGE = 'CACHE_UPDATE_AFTER_STORAGE',
  CACHE_ROLLBACK = 'CACHE_ROLLBACK',
  STORAGE_WRITE_START = 'STORAGE_WRITE_START',
  STORAGE_WRITE_COMPLETE = 'STORAGE_WRITE_COMPLETE',
  STORAGE_WRITE_ERROR = 'STORAGE_WRITE_ERROR',
  ACCOUNT_COPY_WRITE_START = 'ACCOUNT_COPY_WRITE_START',
  ACCOUNT_COPY_WRITE_COMPLETE = 'ACCOUNT_COPY_WRITE_COMPLETE',
  SET_ACCOUNT_START = 'SET_ACCOUNT_START',
  SET_ACCOUNT_COMPLETE = 'SET_ACCOUNT_COMPLETE',
  CHECK_AND_SET_START = 'CHECK_AND_SET_START',
  CHECK_AND_SET_COMPLETE = 'CHECK_AND_SET_COMPLETE',
  DIVERGENCE_DETECTED = 'DIVERGENCE_DETECTED',
}

export interface TimingLogEntry {
  timestamp: bigint
  timestampMs: number
  operation: TimingOperation
  accountId?: string
  hash?: string
  correlationId?: string
  context?: string
  duration?: bigint
  metadata?: Record<string, unknown>
}

export class TimingLogger {
  private logger: Log4jsLogger
  private enabled: boolean
  private pendingOperations: Map<string, TimingLogEntry>
  private logBuffer: TimingLogEntry[]
  private maxBufferSize: number

  constructor(logger: Log4jsLogger, enabled = true) {
    this.logger = logger
    this.enabled = enabled
    this.pendingOperations = new Map()
    this.logBuffer = []
    this.maxBufferSize = 10000
  }

  /**
   * Get high-precision timestamp in nanoseconds
   */
  private getNanoTime(): bigint {
    return process.hrtime.bigint()
  }

  /**
   * Get millisecond timestamp for readability
   */
  private getMsTime(): number {
    return Date.now()
  }

  /**
   * Generate a unique operation key for tracking
   */
  private getOperationKey(operation: TimingOperation, accountId?: string, correlationId?: string): string {
    return `${operation}:${accountId || 'global'}:${correlationId || 'none'}`
  }

  /**
   * Log a timing event
   */
  log(
    operation: TimingOperation,
    accountId?: string,
    hash?: string,
    correlationId?: string,
    context?: string,
    metadata?: Record<string, unknown>
  ): void {
    if (!this.enabled) return

    const entry: TimingLogEntry = {
      timestamp: this.getNanoTime(),
      timestampMs: this.getMsTime(),
      operation,
      accountId,
      hash,
      correlationId,
      context,
      metadata,
    }

    // Track start operations for duration calculation
    if (operation.includes('_START')) {
      const key = this.getOperationKey(operation, accountId, correlationId)
      this.pendingOperations.set(key, entry)
    }

    // Calculate duration for complete operations
    if (operation.includes('_COMPLETE') || operation.includes('_ERROR')) {
      const startOp = operation.replace(/_COMPLETE|_ERROR/, '_START') as TimingOperation
      const key = this.getOperationKey(startOp, accountId, correlationId)
      const startEntry = this.pendingOperations.get(key)
      
      if (startEntry) {
        entry.duration = entry.timestamp - startEntry.timestamp
        this.pendingOperations.delete(key)
      }
    }

    // Add to buffer
    this.logBuffer.push(entry)
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift()
    }

    // Log the entry
    this.writeLog(entry)

    // Update counters
    nestedCountersInstance.countEvent('timing-logger', operation)
  }

  /**
   * Write log entry to logger
   */
  private writeLog(entry: TimingLogEntry): void {
    const parts = [
      '[TIMING]',
      entry.timestampMs,
      `${entry.timestamp}n`,
      entry.operation,
      entry.accountId || '-',
      entry.hash || '-',
      entry.correlationId || '-',
      entry.context || '-',
    ]

    if (entry.duration !== undefined) {
      parts.push(`duration:${entry.duration}n`)
    }

    if (entry.metadata) {
      parts.push(`meta:${JSON.stringify(entry.metadata)}`)
    }

    // Always log to main logger
    this.logger.debug(parts.join(' '))
  }

  /**
   * Get timing analysis for recent operations
   */
  getTimingAnalysis(accountId?: string, windowMs = 5000): {
    cacheUpdates: number
    storageWrites: number
    pendingWrites: number
    avgWriteDuration: bigint
    maxWriteDuration: bigint
    potentialRaceConditions: TimingLogEntry[]
  } {
    const now = this.getMsTime()
    const windowStart = now - windowMs

    const relevantEntries = this.logBuffer.filter(entry => {
      if (entry.timestampMs < windowStart) return false
      if (accountId && entry.accountId !== accountId) return false
      return true
    })

    let cacheUpdates = 0
    let storageWrites = 0
    let pendingWrites = this.pendingOperations.size
    let totalWriteDuration = 0n
    let maxWriteDuration = 0n
    let writeCount = 0
    const potentialRaceConditions: TimingLogEntry[] = []

    // Track cache updates by account
    const cacheUpdatesByAccount = new Map<string, TimingLogEntry>()
    const storageWritesByAccount = new Map<string, TimingLogEntry[]>()

    for (const entry of relevantEntries) {
      switch (entry.operation) {
        case TimingOperation.CACHE_UPDATE:
          cacheUpdates++
          if (entry.accountId) {
            cacheUpdatesByAccount.set(entry.accountId, entry)
          }
          break
        
        case TimingOperation.STORAGE_WRITE_COMPLETE:
        case TimingOperation.ACCOUNT_COPY_WRITE_COMPLETE:
          storageWrites++
          if (entry.duration) {
            totalWriteDuration += entry.duration
            maxWriteDuration = entry.duration > maxWriteDuration ? entry.duration : maxWriteDuration
            writeCount++
          }
          if (entry.accountId) {
            if (!storageWritesByAccount.has(entry.accountId)) {
              storageWritesByAccount.set(entry.accountId, [])
            }
            storageWritesByAccount.get(entry.accountId)!.push(entry)
          }
          break
      }
    }

    // Detect potential race conditions
    for (const [accId, cacheEntry] of cacheUpdatesByAccount) {
      const storageWrites = storageWritesByAccount.get(accId) || []
      
      // Check if cache was updated but no storage write completed after it
      const hasLaterStorageWrite = storageWrites.some(
        writeEntry => writeEntry.timestamp > cacheEntry.timestamp
      )
      
      if (!hasLaterStorageWrite) {
        potentialRaceConditions.push(cacheEntry)
      }
    }

    const avgWriteDuration = writeCount > 0 ? totalWriteDuration / BigInt(writeCount) : 0n

    return {
      cacheUpdates,
      storageWrites,
      pendingWrites,
      avgWriteDuration,
      maxWriteDuration,
      potentialRaceConditions,
    }
  }

  /**
   * Export timing data for external analysis
   */
  exportTimingData(): TimingLogEntry[] {
    return [...this.logBuffer]
  }

  /**
   * Clear timing data
   */
  clearTimingData(): void {
    this.logBuffer = []
    this.pendingOperations.clear()
  }

  /**
   * Enable/disable timing logger
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  /**
   * Track cache/storage divergence for an account
   */
  detectDivergence(accountId: string, cacheHash?: string, storageHash?: string): void {
    if (!this.enabled) return

    if (cacheHash && storageHash && cacheHash !== storageHash) {
      this.log(
        TimingOperation.DIVERGENCE_DETECTED,
        accountId,
        undefined,
        undefined,
        'cache_storage_hash_mismatch',
        {
          cacheHash,
          storageHash,
          mismatch: true
        }
      )
      
      // Count the divergence
      nestedCountersInstance.countEvent('cache-storage-divergence', 'hash_mismatch')
    }
  }

  /**
   * Check for orphaned cache updates (cache updated but no storage write)
   */
  checkOrphanedCacheUpdates(windowMs = 1000): string[] {
    const now = this.getMsTime()
    const windowStart = now - windowMs
    const orphanedAccounts: string[] = []

    // Group operations by account
    const accountOperations = new Map<string, {
      cacheUpdates: TimingLogEntry[]
      storageWrites: TimingLogEntry[]
    }>()

    for (const entry of this.logBuffer) {
      if (entry.timestampMs < windowStart) continue
      if (!entry.accountId) continue

      if (!accountOperations.has(entry.accountId)) {
        accountOperations.set(entry.accountId, {
          cacheUpdates: [],
          storageWrites: []
        })
      }

      const ops = accountOperations.get(entry.accountId)!
      
      if (entry.operation === TimingOperation.CACHE_UPDATE ||
          entry.operation === TimingOperation.CACHE_UPDATE_BEFORE_STORAGE) {
        ops.cacheUpdates.push(entry)
      } else if (entry.operation === TimingOperation.STORAGE_WRITE_COMPLETE) {
        ops.storageWrites.push(entry)
      }
    }

    // Check for orphaned cache updates
    for (const [accountId, ops] of accountOperations) {
      if (ops.cacheUpdates.length > 0 && ops.storageWrites.length === 0) {
        orphanedAccounts.push(accountId)
        this.log(
          TimingOperation.DIVERGENCE_DETECTED,
          accountId,
          undefined,
          undefined,
          'orphaned_cache_update',
          {
            cacheUpdateCount: ops.cacheUpdates.length,
            storageWriteCount: 0
          }
        )
      }
    }

    return orphanedAccounts
  }

  /**
   * Track operation pairs for correlation analysis
   */
  trackCorrelatedOperation(
    operation: TimingOperation,
    accountId: string,
    hash?: string,
    correlationId?: string,
    context?: string,
    metadata?: Record<string, unknown>
  ): string {
    // Generate correlation ID if not provided
    const corrId = correlationId || generateCorrelationId('op')
    
    this.log(operation, accountId, hash, corrId, context, metadata)
    
    return corrId
  }
}

// Singleton instance
let timingLogger: TimingLogger | null = null

export function initTimingLogger(logger: Log4jsLogger, enabled = true): TimingLogger {
  if (!timingLogger) {
    timingLogger = new TimingLogger(logger, enabled)
  }
  return timingLogger
}

export function getTimingLogger(): TimingLogger {
  if (!timingLogger) {
    throw new Error('TimingLogger not initialized. Call initTimingLogger first.')
  }
  return timingLogger
}

/**
 * Generate a correlation ID for tracking related operations
 */
export function generateCorrelationId(prefix?: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`
}