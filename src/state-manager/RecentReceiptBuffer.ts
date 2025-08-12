import { SignedReceipt } from './state-manager-types'
import { nestedCountersInstance } from '../utils/nestedCounters'
import * as utils from '../utils'

export interface ReceiptEntry {
  receipt: SignedReceipt
  timestamp: number
  afterStateHash: string
  beforeStateHash?: string
}

interface AccountReceiptData {
  receipts: ReceiptEntry[]
  lastCleanup: number
}

export class RecentReceiptBuffer {
  private receiptsByAccount: Map<string, AccountReceiptData>
  private receiptsByTxId: Map<string, SignedReceipt>
  private insertionOrder: Array<{ key: string, type: 'account' | 'txId', timestamp: number }>
  private bufferSize: number
  private ttl: number
  private cleanupInterval: number
  private lastGlobalCleanup: number

  constructor(bufferSize: number = 1000, ttl: number = 60000) {
    this.bufferSize = bufferSize
    this.ttl = ttl
    this.cleanupInterval = ttl / 2 // Cleanup every 30s if TTL is 60s
    this.receiptsByAccount = new Map()
    this.receiptsByTxId = new Map()
    this.insertionOrder = []
    this.lastGlobalCleanup = Date.now()
  }

  addReceipt(receipt: SignedReceipt): void {
    if (!receipt || !receipt.proposal || !receipt.proposal.txid) {
      return
    }

    const timestamp = Date.now()
    const txId = receipt.proposal.txid

    // Check if we need to evict old entries to make room
    this.enforceBufferSize()

    // Store by txId
    if (!this.receiptsByTxId.has(txId)) {
      this.receiptsByTxId.set(txId, receipt)
      this.insertionOrder.push({ key: txId, type: 'txId', timestamp })
    }

    // Extract account IDs and state hashes from the receipt
    const accountsData = this.extractAccountData(receipt)
    
    for (const accData of accountsData) {
      const { accountId, afterStateHash, beforeStateHash } = accData
      
      const entry: ReceiptEntry = {
        receipt,
        timestamp,
        afterStateHash,
        beforeStateHash
      }

      // Store by account
      let accountData = this.receiptsByAccount.get(accountId)
      if (!accountData) {
        accountData = {
          receipts: [],
          lastCleanup: timestamp
        }
        this.receiptsByAccount.set(accountId, accountData)
        this.insertionOrder.push({ key: accountId, type: 'account', timestamp })
      }

      // Add to front for easy access to latest
      accountData.receipts.unshift(entry)

      // Limit receipts per account to prevent unbounded growth
      if (accountData.receipts.length > 10) {
        accountData.receipts = accountData.receipts.slice(0, 10)
      }
    }

    // Track metrics
    nestedCountersInstance.countEvent('stateManager', 'recentReceiptBuffer.receiptsAdded')

    // Periodic cleanup
    this.maybeCleanup()
  }

  getLatestForAccount(accountId: string): ReceiptEntry | null {
    const accountData = this.receiptsByAccount.get(accountId)
    if (!accountData || accountData.receipts.length === 0) {
      return null
    }

    // Clean up expired entries for this account
    this.cleanupAccountEntries(accountId, accountData)

    // Return the most recent non-expired entry
    const now = Date.now()
    for (const entry of accountData.receipts) {
      if (now - entry.timestamp <= this.ttl) {
        nestedCountersInstance.countEvent('stateManager', 'recentReceiptBuffer.accountHit')
        return entry
      }
    }

    nestedCountersInstance.countEvent('stateManager', 'recentReceiptBuffer.accountMiss')
    return null
  }

  getReceiptByTxId(txId: string): SignedReceipt | null {
    const receipt = this.receiptsByTxId.get(txId)
    if (!receipt) {
      nestedCountersInstance.countEvent('stateManager', 'recentReceiptBuffer.txIdMiss')
      return null
    }

    // Check if expired by finding in insertion order
    const now = Date.now()
    const orderEntry = this.insertionOrder.find(e => e.key === txId && e.type === 'txId')
    if (orderEntry && now - orderEntry.timestamp > this.ttl) {
      // Expired, remove it
      this.receiptsByTxId.delete(txId)
      nestedCountersInstance.countEvent('stateManager', 'recentReceiptBuffer.txIdExpired')
      return null
    }

    nestedCountersInstance.countEvent('stateManager', 'recentReceiptBuffer.txIdHit')
    return receipt
  }

  cleanup(): void {
    const now = Date.now()
    let expiredCount = 0

    // Clean up expired entries from txId map
    for (const [txId, receipt] of this.receiptsByTxId.entries()) {
      const orderEntry = this.insertionOrder.find(e => e.key === txId && e.type === 'txId')
      if (orderEntry && now - orderEntry.timestamp > this.ttl) {
        this.receiptsByTxId.delete(txId)
        expiredCount++
      }
    }

    // Clean up expired entries from account map and their receipts
    for (const [accountId, accountData] of this.receiptsByAccount.entries()) {
      this.cleanupAccountEntries(accountId, accountData)
      if (accountData.receipts.length === 0) {
        this.receiptsByAccount.delete(accountId)
      }
    }

    // Clean up insertion order
    this.insertionOrder = this.insertionOrder.filter(entry => {
      if (now - entry.timestamp > this.ttl) {
        return false
      }
      // Also check if the entry still exists in the maps
      if (entry.type === 'txId') {
        return this.receiptsByTxId.has(entry.key)
      } else {
        return this.receiptsByAccount.has(entry.key)
      }
    })

    if (expiredCount > 0) {
      nestedCountersInstance.countEvent('stateManager', 'recentReceiptBuffer.entriesExpired', expiredCount)
    }

    this.lastGlobalCleanup = now
  }

  private enforceBufferSize(): void {
    // Count actual unique entries (by txId)
    const uniqueEntries = this.receiptsByTxId.size
    
    // Only evict if we exceed buffer size
    while (uniqueEntries >= this.bufferSize && this.insertionOrder.length > 0) {
      const oldest = this.insertionOrder.shift()
      if (!oldest) break

      if (oldest.type === 'txId') {
        const txId = oldest.key
        this.receiptsByTxId.delete(txId)
        
        // Also remove associated account entries for this receipt
        for (const [accountId, accountData] of this.receiptsByAccount.entries()) {
          accountData.receipts = accountData.receipts.filter(entry => 
            entry.receipt.proposal.txid !== txId
          )
          if (accountData.receipts.length === 0) {
            this.receiptsByAccount.delete(accountId)
            // Remove from insertion order
            const index = this.insertionOrder.findIndex(e => 
              e.type === 'account' && e.key === accountId
            )
            if (index >= 0) {
              this.insertionOrder.splice(index, 1)
            }
          }
        }
        
        nestedCountersInstance.countEvent('stateManager', 'recentReceiptBuffer.lruEviction')
        break // We removed one receipt, check size again
      }
    }
  }

  private cleanupAccountEntries(accountId: string, accountData: AccountReceiptData): void {
    const now = Date.now()
    
    // Only cleanup if enough time has passed since last cleanup for this account
    if (now - accountData.lastCleanup < this.cleanupInterval) {
      return
    }

    const validReceipts = accountData.receipts.filter(entry => 
      now - entry.timestamp <= this.ttl
    )

    accountData.receipts = validReceipts
    accountData.lastCleanup = now
  }

  private maybeCleanup(): void {
    const now = Date.now()
    if (now - this.lastGlobalCleanup >= this.cleanupInterval) {
      this.cleanup()
    }
  }

  private extractAccountData(receipt: SignedReceipt): Array<{
    accountId: string
    afterStateHash: string
    beforeStateHash?: string
  }> {
    const accountsData: Array<{
      accountId: string
      afterStateHash: string
      beforeStateHash?: string
    }> = []

    // Extract from proposal
    if (receipt.proposal) {
      const { accountIDs, beforeStateHashes, afterStateHashes } = receipt.proposal
      
      // Process each account
      for (let i = 0; i < accountIDs.length; i++) {
        const accountId = accountIDs[i]
        const beforeStateHash = beforeStateHashes[i]
        const afterStateHash = afterStateHashes[i]
        
        accountsData.push({
          accountId,
          afterStateHash,
          beforeStateHash
        })
      }
    }

    return accountsData
  }

  // Debug methods
  getStats(): {
    accountEntries: number
    txIdEntries: number
    totalReceipts: number
    oldestEntryAge: number | null
    bufferUtilization: number
  } {
    const now = Date.now()
    let totalReceipts = 0
    
    for (const accountData of this.receiptsByAccount.values()) {
      totalReceipts += accountData.receipts.length
    }

    const oldestEntry = this.insertionOrder[0]
    const oldestAge = oldestEntry ? now - oldestEntry.timestamp : null

    return {
      accountEntries: this.receiptsByAccount.size,
      txIdEntries: this.receiptsByTxId.size,
      totalReceipts,
      oldestEntryAge: oldestAge,
      bufferUtilization: this.insertionOrder.length / this.bufferSize
    }
  }

  clear(): void {
    this.receiptsByAccount.clear()
    this.receiptsByTxId.clear()
    this.insertionOrder = []
    this.lastGlobalCleanup = Date.now()
  }
}