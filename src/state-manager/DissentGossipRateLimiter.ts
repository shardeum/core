import { DissentGossipRateLimiterConfig, DissentGossipRateLimiterState } from '../types/gossip/state-dissent'
import { shardusGetTime } from '../network'
import { nestedCountersInstance } from '../utils/nestedCounters'
import * as Context from '../p2p/Context'

/**
 * Rate limiter for state dissent and correction gossip messages
 * Prevents gossip storms while allowing critical conflict information to propagate
 */
export class DissentGossipRateLimiter {
  private config: DissentGossipRateLimiterConfig
  private state: DissentGossipRateLimiterState
  private correctionBuckets: Map<string, { count: number; windowStart: number }>

  constructor(config?: Partial<DissentGossipRateLimiterConfig>) {
    // Use config from Context if available, otherwise use defaults
    const contextConfig = Context.config?.stateManager
    
    this.config = {
      maxPerTx: config?.maxPerTx ?? contextConfig?.dissentGossipMaxPerTx ?? 3,
      globalRatePerSecond: config?.globalRatePerSecond ?? contextConfig?.dissentGossipGlobalRate ?? 10,
      maxCorrectionsPerAccount: config?.maxCorrectionsPerAccount ?? contextConfig?.correctionGossipMaxPerAccount ?? 1,
      correctionTimeWindow: config?.correctionTimeWindow ?? contextConfig?.correctionGossipWindow ?? 60000,
      messageTTL: config?.messageTTL ?? contextConfig?.gossipMessageTTL ?? 30000,
      maxCacheSize: config?.maxCacheSize ?? contextConfig?.gossipCacheSize ?? 10000
    }

    this.state = {
      perTxBudget: new Map(),
      globalBucket: {
        tokens: this.config.globalRatePerSecond,
        lastRefill: shardusGetTime()
      },
      seenMessages: new Set(),
      messageTimestamps: new Map()
    }

    this.correctionBuckets = new Map()

    // Start cleanup interval
    this.startCleanupInterval()
  }

  /**
   * Check if we can emit a dissent message for a transaction
   */
  canEmitDissent(txId: string): boolean {
    // Check if rate limiting is effectively disabled
    if (this.isRateLimitingDisabled('dissent')) {
      return true
    }

    // Refill global bucket
    this.refillGlobalBucket()

    // Check global rate limit
    if (this.state.globalBucket.tokens <= 0) {
      nestedCountersInstance.countEvent('stateHardening', 'rateLimiter.dissent.globalLimit')
      return false
    }

    // Check per-transaction limit
    const txBudget = this.state.perTxBudget.get(txId) || this.config.maxPerTx
    if (txBudget <= 0) {
      nestedCountersInstance.countEvent('stateHardening', 'rateLimiter.dissent.txLimit')
      return false
    }

    return true
  }

  /**
   * Check if we can emit a correction message for an account
   */
  canEmitCorrection(accountId: string): boolean {
    // Check if rate limiting is effectively disabled
    if (this.isRateLimitingDisabled('correction')) {
      return true
    }

    const now = shardusGetTime()
    const bucket = this.correctionBuckets.get(accountId)

    if (!bucket) {
      // First correction for this account
      return true
    }

    // Check if we're in a new time window
    if (now - bucket.windowStart > this.config.correctionTimeWindow) {
      // Reset bucket for new window
      this.correctionBuckets.set(accountId, {
        count: 0,
        windowStart: now
      })
      return true
    }

    // Check if we've exceeded the limit for this window
    if (bucket.count >= this.config.maxCorrectionsPerAccount) {
      nestedCountersInstance.countEvent('stateHardening', 'rateLimiter.correction.accountLimit')
      return false
    }

    return true
  }

  /**
   * Record that we emitted a dissent message
   */
  recordDissentEmission(txId: string): void {
    if (this.isRateLimitingDisabled('dissent')) {
      return
    }

    // Consume from global bucket
    this.state.globalBucket.tokens = Math.max(0, this.state.globalBucket.tokens - 1)

    // Consume from per-tx budget
    const currentBudget = this.state.perTxBudget.get(txId) || this.config.maxPerTx
    this.state.perTxBudget.set(txId, currentBudget - 1)

    nestedCountersInstance.countEvent('stateHardening', 'rateLimiter.dissent.emitted')
  }

  /**
   * Record that we emitted a correction message
   */
  recordCorrectionEmission(accountId: string): void {
    if (this.isRateLimitingDisabled('correction')) {
      return
    }

    const now = shardusGetTime()
    const bucket = this.correctionBuckets.get(accountId)

    if (!bucket) {
      this.correctionBuckets.set(accountId, {
        count: 1,
        windowStart: now
      })
    } else {
      bucket.count++
    }

    nestedCountersInstance.countEvent('stateHardening', 'rateLimiter.correction.emitted')
  }

  /**
   * Check if we've seen this message ID recently
   */
  hasSeenMessage(messageId: string): boolean {
    return this.state.seenMessages.has(messageId)
  }

  /**
   * Record that we've seen a message
   */
  recordSeenMessage(messageId: string): void {
    this.state.seenMessages.add(messageId)
    this.state.messageTimestamps.set(messageId, shardusGetTime())

    // Enforce cache size limit
    if (this.state.seenMessages.size > this.config.maxCacheSize) {
      this.evictOldestMessages(this.state.seenMessages.size - this.config.maxCacheSize)
    }
  }

  /**
   * Get current rate limiter statistics
   */
  getStats(): {
    globalTokens: number
    activeTxBudgets: number
    seenMessages: number
    activeCorrectionBuckets: number
  } {
    return {
      globalTokens: this.state.globalBucket.tokens,
      activeTxBudgets: this.state.perTxBudget.size,
      seenMessages: this.state.seenMessages.size,
      activeCorrectionBuckets: this.correctionBuckets.size
    }
  }

  /**
   * Reset rate limiter state
   */
  reset(): void {
    this.state.perTxBudget.clear()
    this.state.globalBucket.tokens = this.config.globalRatePerSecond
    this.state.globalBucket.lastRefill = shardusGetTime()
    this.state.seenMessages.clear()
    this.state.messageTimestamps.clear()
    this.correctionBuckets.clear()
  }

  /**
   * Check if rate limiting is effectively disabled based on config values
   */
  private isRateLimitingDisabled(type: 'dissent' | 'correction'): boolean {
    if (type === 'dissent') {
      // Check if values are set to effectively disable rate limiting
      return this.config.maxPerTx === 0 || 
             this.config.maxPerTx > 1000 ||
             this.config.globalRatePerSecond > 10000
    } else {
      return this.config.maxCorrectionsPerAccount === 0 ||
             this.config.maxCorrectionsPerAccount > 1000 ||
             this.config.correctionTimeWindow < 10
    }
  }

  /**
   * Refill the global token bucket based on elapsed time
   */
  private refillGlobalBucket(): void {
    const now = shardusGetTime()
    const elapsed = now - this.state.globalBucket.lastRefill
    const tokensToAdd = (elapsed / 1000) * this.config.globalRatePerSecond

    if (tokensToAdd >= 1) {
      this.state.globalBucket.tokens = Math.min(
        this.config.globalRatePerSecond,
        this.state.globalBucket.tokens + Math.floor(tokensToAdd)
      )
      this.state.globalBucket.lastRefill = now
    }
  }

  /**
   * Evict oldest messages from cache
   */
  private evictOldestMessages(count: number): void {
    const sortedMessages = Array.from(this.state.messageTimestamps.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, count)

    for (const [messageId] of sortedMessages) {
      this.state.seenMessages.delete(messageId)
      this.state.messageTimestamps.delete(messageId)
    }
  }

  /**
   * Start periodic cleanup of expired data
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanup()
    }, 30000) // Run every 30 seconds
  }

  /**
   * Clean up expired data
   */
  private cleanup(): void {
    const now = shardusGetTime()
    let cleanedMessages = 0
    let cleanedTxBudgets = 0
    let cleanedCorrectionBuckets = 0

    // Clean up seen messages
    for (const [messageId, timestamp] of this.state.messageTimestamps.entries()) {
      if (now - timestamp > this.config.messageTTL) {
        this.state.seenMessages.delete(messageId)
        this.state.messageTimestamps.delete(messageId)
        cleanedMessages++
      }
    }

    // Clean up per-tx budgets (remove entries with full budget restored)
    for (const [txId, budget] of this.state.perTxBudget.entries()) {
      if (budget >= this.config.maxPerTx) {
        this.state.perTxBudget.delete(txId)
        cleanedTxBudgets++
      }
    }

    // Clean up old correction buckets
    for (const [accountId, bucket] of this.correctionBuckets.entries()) {
      if (now - bucket.windowStart > this.config.correctionTimeWindow * 2) {
        this.correctionBuckets.delete(accountId)
        cleanedCorrectionBuckets++
      }
    }

    if (cleanedMessages > 0 || cleanedTxBudgets > 0 || cleanedCorrectionBuckets > 0) {
      nestedCountersInstance.countEvent('stateHardening', 'rateLimiter.cleanup', cleanedMessages + cleanedTxBudgets + cleanedCorrectionBuckets)
    }
  }
}