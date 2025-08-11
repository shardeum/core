import { SignedReceipt } from './state-manager-types'
import * as utils from '../utils'

interface ReceiptEntry {
  receipt: SignedReceipt
  timestamp: number
  accountId: string
  afterHash: string
  txid: string
}

interface ReceiptBufferConfig {
  bufferSize: number
  ttl: number
}

export class RecentReceiptBuffer {
  private receiptsByAccount: Map<string, ReceiptEntry[]>
  private receiptsByTxId: Map<string, ReceiptEntry>
  private oldestTimestamp: number
  private config: ReceiptBufferConfig
  private totalEntries: number

  constructor(config: ReceiptBufferConfig) {
    this.config = config
    this.receiptsByAccount = new Map()
    this.receiptsByTxId = new Map()
    this.oldestTimestamp = Date.now()
    this.totalEntries = 0
  }

  addReceipt(receipt: SignedReceipt): void {
    const timestamp = Date.now()
    const txid = receipt.proposal.txid
    
    if (this.receiptsByTxId.has(txid)) {
      return
    }

    const accountIds = this.extractAccountIds(receipt)
    
    for (const accountId of accountIds) {
      const accountIndex = receipt.proposal.accountIDs.indexOf(accountId)
      const afterHash = accountIndex >= 0 ? receipt.proposal.afterStateHashes[accountIndex] : ''
      const entry: ReceiptEntry = {
        receipt,
        timestamp,
        accountId,
        afterHash,
        txid
      }

      if (!this.receiptsByAccount.has(accountId)) {
        this.receiptsByAccount.set(accountId, [])
      }
      
      const accountReceipts = this.receiptsByAccount.get(accountId)!
      accountReceipts.push(entry)
      
      if (accountReceipts.length > 10) {
        const removed = accountReceipts.shift()
        if (removed && !this.hasOtherReferences(removed)) {
          this.receiptsByTxId.delete(removed.txid)
        }
      }
    }

    this.receiptsByTxId.set(txid, {
      receipt,
      timestamp,
      accountId: accountIds[0] || '',
      afterHash: '',
      txid
    })
    
    this.totalEntries++
    
    if (this.totalEntries > this.config.bufferSize) {
      this.pruneOldEntries()
    }
    
    if (timestamp - this.oldestTimestamp > this.config.ttl) {
      this.pruneExpiredEntries()
    }
  }

  getLatestForAccount(accountId: string): SignedReceipt | null {
    const entries = this.receiptsByAccount.get(accountId)
    if (!entries || entries.length === 0) {
      return null
    }
    
    const now = Date.now()
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]
      if (now - entry.timestamp <= this.config.ttl) {
        return entry.receipt
      }
    }
    
    return null
  }

  getReceiptByTxId(txid: string): SignedReceipt | null {
    const entry = this.receiptsByTxId.get(txid)
    if (!entry) {
      return null
    }
    
    const now = Date.now()
    if (now - entry.timestamp > this.config.ttl) {
      this.receiptsByTxId.delete(txid)
      return null
    }
    
    return entry.receipt
  }

  getReceiptsForAccount(accountId: string, limit: number = 5): SignedReceipt[] {
    const entries = this.receiptsByAccount.get(accountId)
    if (!entries || entries.length === 0) {
      return []
    }
    
    const now = Date.now()
    const validEntries = entries.filter(e => now - e.timestamp <= this.config.ttl)
    
    return validEntries
      .slice(-limit)
      .map(e => e.receipt)
      .reverse()
  }

  validateBeforeStateLink(accountId: string, beforeHash: string): SignedReceipt | null {
    const entries = this.receiptsByAccount.get(accountId)
    if (!entries || entries.length === 0) {
      return null
    }
    
    const now = Date.now()
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]
      if (now - entry.timestamp > this.config.ttl) {
        continue
      }
      
      if (entry.afterHash === beforeHash) {
        return entry.receipt
      }
    }
    
    return null
  }

  private extractAccountIds(receipt: SignedReceipt): string[] {
    return receipt.proposal.accountIDs || []
  }

  private hasOtherReferences(entry: ReceiptEntry): boolean {
    for (const [accountId, entries] of this.receiptsByAccount) {
      if (accountId === entry.accountId) continue
      if (entries.some(e => e.txid === entry.txid)) {
        return true
      }
    }
    return false
  }

  private pruneOldEntries(): void {
    const targetSize = Math.floor(this.config.bufferSize * 0.9)
    const entriesToRemove = this.totalEntries - targetSize
    
    if (entriesToRemove <= 0) return
    
    const allEntries: ReceiptEntry[] = []
    for (const entries of this.receiptsByAccount.values()) {
      allEntries.push(...entries)
    }
    
    allEntries.sort((a, b) => a.timestamp - b.timestamp)
    
    const toRemove = allEntries.slice(0, entriesToRemove)
    for (const entry of toRemove) {
      this.removeEntry(entry)
    }
    
    this.totalEntries = targetSize
  }

  private pruneExpiredEntries(): void {
    const now = Date.now()
    const cutoff = now - this.config.ttl
    
    for (const [accountId, entries] of this.receiptsByAccount) {
      const validEntries = entries.filter(e => e.timestamp > cutoff)
      if (validEntries.length === 0) {
        this.receiptsByAccount.delete(accountId)
      } else if (validEntries.length < entries.length) {
        this.receiptsByAccount.set(accountId, validEntries)
      }
    }
    
    for (const [txid, entry] of this.receiptsByTxId) {
      if (entry.timestamp <= cutoff) {
        this.receiptsByTxId.delete(txid)
      }
    }
    
    let newTotal = 0
    for (const entries of this.receiptsByAccount.values()) {
      newTotal += entries.length
    }
    this.totalEntries = newTotal
    
    this.oldestTimestamp = now
  }

  private removeEntry(entry: ReceiptEntry): void {
    const accountEntries = this.receiptsByAccount.get(entry.accountId)
    if (accountEntries) {
      const index = accountEntries.findIndex(e => e.txid === entry.txid)
      if (index >= 0) {
        accountEntries.splice(index, 1)
        if (accountEntries.length === 0) {
          this.receiptsByAccount.delete(entry.accountId)
        }
      }
    }
    
    if (!this.hasOtherReferences(entry)) {
      this.receiptsByTxId.delete(entry.txid)
    }
  }

  clear(): void {
    this.receiptsByAccount.clear()
    this.receiptsByTxId.clear()
    this.oldestTimestamp = Date.now()
    this.totalEntries = 0
  }

  getStats(): { totalEntries: number; accountCount: number; txCount: number } {
    return {
      totalEntries: this.totalEntries,
      accountCount: this.receiptsByAccount.size,
      txCount: this.receiptsByTxId.size
    }
  }
}