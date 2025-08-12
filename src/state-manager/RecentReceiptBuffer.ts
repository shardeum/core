import { SignedReceipt } from './state-manager-types'
import { FIFOCache } from '../utils/fifoCache'
import { nestedCountersInstance } from '../utils/nestedCounters'
import * as Context from '../p2p/Context'

export interface ReceiptEntry {
  receipt: SignedReceipt
  timestamp: number
  afterStateHash: string
  beforeStateHash?: string
}

/**
 * Recent Receipt Buffer for Phase 2 State Hardening
 * Maintains a bounded cache of recent receipts for quick conflict resolution
 */
export class RecentReceiptBuffer {
  private receiptsByAccount: FIFOCache<string, ReceiptEntry[]>
  private receiptsByTxId: FIFOCache<string, SignedReceipt>
  private bufferSize: number
  private ttl: number
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(bufferSize: number, ttl: number) {
    this.bufferSize = bufferSize
    this.ttl = ttl
    this.receiptsByAccount = new FIFOCache<string, ReceiptEntry[]>(bufferSize)
    this.receiptsByTxId = new FIFOCache<string, SignedReceipt>(bufferSize)
    
    // Start cleanup interval
    this.startCleanupInterval()
  }

  /**
   * Add a receipt to the buffer
   */
  addReceipt(receipt: SignedReceipt): void {
    try {
      // Extract state information from receipt
      const proposal = receipt.proposal
      if (!proposal || !proposal.accountIDs || !proposal.afterStateHashes) {
        throw new Error('Invalid receipt structure')
      }
      
      const timestamp = Date.now()

      // Store by txId
      this.receiptsByTxId.set(proposal.txid, receipt)

      // Store by each account involved
      for (let i = 0; i < proposal.accountIDs.length; i++) {
        const accountId = proposal.accountIDs[i]
        const entry: ReceiptEntry = {
          receipt,
          timestamp,
          afterStateHash: proposal.afterStateHashes[i],
          beforeStateHash: proposal.beforeStateHashes[i]
        }

        // Get or create account receipt list
        let accountReceipts = this.receiptsByAccount.get(accountId)
        if (!accountReceipts) {
          accountReceipts = []
        }

        // Add to beginning for most recent first
        accountReceipts.unshift(entry)

        // Limit per-account storage to prevent memory bloat
        if (accountReceipts.length > 10) {
          accountReceipts.pop()
        }

        this.receiptsByAccount.set(accountId, accountReceipts)
      }

      // Update metrics
      nestedCountersInstance.countEvent('stateManager', 'recentReceiptBuffer.added')
    } catch (error) {
      if (Context.logger && Context.logger.getLogger) {
        Context.logger.getLogger('recentReceiptBuffer').error('RecentReceiptBuffer: Failed to add receipt', error)
      }
      nestedCountersInstance.countEvent('stateManager', 'recentReceiptBuffer.addError')
    }
  }

  /**
   * Get the most recent receipt for an account
   */
  getLatestForAccount(accountId: string): ReceiptEntry | null {
    const receipts = this.receiptsByAccount.get(accountId)
    if (!receipts || receipts.length === 0) {
      return null
    }

    // Check TTL on the most recent receipt
    const latest = receipts[0]
    const age = Date.now() - latest.timestamp
    if (age > this.ttl) {
      // Expired, trigger cleanup for this account
      this.cleanupAccountReceipts(accountId)
      return null
    }

    nestedCountersInstance.countEvent('stateManager', 'recentReceiptBuffer.hit')
    return latest
  }

  /**
   * Get receipt by transaction ID
   */
  getReceiptByTxId(txId: string): SignedReceipt | null {
    const receipt = this.receiptsByTxId.get(txId)
    if (receipt) {
      nestedCountersInstance.countEvent('stateManager', 'recentReceiptBuffer.txIdHit')
    }
    return receipt || null
  }

  /**
   * Get all recent receipts for an account (for debugging/analysis)
   */
  getReceiptsForAccount(accountId: string): ReceiptEntry[] {
    const receipts = this.receiptsByAccount.get(accountId)
    if (!receipts) {
      return []
    }

    // Filter out expired entries
    const now = Date.now()
    return receipts.filter(entry => (now - entry.timestamp) <= this.ttl)
  }

  /**
   * Clean up expired entries for a specific account
   */
  private cleanupAccountReceipts(accountId: string): void {
    const receipts = this.receiptsByAccount.get(accountId)
    if (!receipts) {
      return
    }

    const now = Date.now()
    const validReceipts = receipts.filter(entry => (now - entry.timestamp) <= this.ttl)

    if (validReceipts.length === 0) {
      this.receiptsByAccount.delete(accountId)
    } else if (validReceipts.length < receipts.length) {
      this.receiptsByAccount.set(accountId, validReceipts)
    }
  }

  /**
   * Start periodic cleanup interval
   */
  private startCleanupInterval(): void {
    // Run cleanup every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 30000)
  }

  /**
   * Clean up all expired entries
   */
  cleanup(): void {
    try {
      const now = Date.now()
      let cleanedAccounts = 0
      let cleanedTxIds = 0

      // Clean up account receipts
      for (const [accountId, receipts] of this.receiptsByAccount.entries()) {
        const validReceipts = receipts.filter(entry => (now - entry.timestamp) <= this.ttl)
        
        if (validReceipts.length === 0) {
          this.receiptsByAccount.delete(accountId)
          cleanedAccounts++
        } else if (validReceipts.length < receipts.length) {
          this.receiptsByAccount.set(accountId, validReceipts)
          cleanedAccounts++
        }
      }

      // Note: FIFOCache handles its own eviction, but we can track metrics
      const previousSize = this.receiptsByTxId.size()
      
      // Force FIFO eviction if needed
      if (this.receiptsByTxId.size() > this.bufferSize) {
        cleanedTxIds = this.receiptsByTxId.size() - this.bufferSize
      }

      if (cleanedAccounts > 0 || cleanedTxIds > 0) {
        nestedCountersInstance.countEvent('stateManager', 'recentReceiptBuffer.cleanup', cleanedAccounts + cleanedTxIds)
      }
    } catch (error) {
      if (Context.logger && Context.logger.getLogger) {
        Context.logger.getLogger('recentReceiptBuffer').error('RecentReceiptBuffer: Cleanup failed', error)
      }
    }
  }

  /**
   * Get buffer statistics
   */
  getStats(): {
    accountCount: number
    txIdCount: number
    totalReceiptEntries: number
  } {
    let totalEntries = 0
    for (const receipts of this.receiptsByAccount.values()) {
      totalEntries += receipts.length
    }

    return {
      accountCount: this.receiptsByAccount.size(),
      txIdCount: this.receiptsByTxId.size(),
      totalReceiptEntries: totalEntries
    }
  }

  /**
   * Clear the buffer and stop cleanup
   */
  clear(): void {
    this.receiptsByAccount.clear()
    this.receiptsByTxId.clear()
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }
}