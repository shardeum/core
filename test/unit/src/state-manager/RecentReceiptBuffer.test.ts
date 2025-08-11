import { RecentReceiptBuffer } from '../../../../src/state-manager/RecentReceiptBuffer'
import { SignedReceipt } from '../../../../src/state-manager/state-manager-types'

describe('RecentReceiptBuffer', () => {
  let buffer: RecentReceiptBuffer
  
  beforeEach(() => {
    buffer = new RecentReceiptBuffer({
      bufferSize: 100,
      ttl: 60000 // 1 minute
    })
  })
  
  afterEach(() => {
    buffer.clear()
  })
  
  const createMockReceipt = (txId: string, accountId: string, afterHash: string): SignedReceipt => {
    return {
      proposal: {
        txid: txId,
        timestamp: Date.now(),
        cycle: 1,
        accountIDs: [accountId],
        afterStateHashes: [afterHash],
        beforeStateHashes: ['before_' + afterHash]
      },
      sign: {
        owner: 'test_node',
        sig: 'test_sig'
      }
    } as any as SignedReceipt
  }
  
  describe('addReceipt', () => {
    it('should add a receipt to the buffer', () => {
      const receipt = createMockReceipt('tx1', 'account1', 'hash1')
      buffer.addReceipt(receipt)
      
      const retrieved = buffer.getLatestForAccount('account1')
      expect(retrieved).toBeDefined()
      expect(retrieved?.proposal?.txid).toBe('tx1')
    })
    
    it('should not add duplicate receipts for the same transaction', () => {
      const receipt1 = createMockReceipt('tx1', 'account1', 'hash1')
      const receipt2 = createMockReceipt('tx1', 'account1', 'hash1')
      
      buffer.addReceipt(receipt1)
      buffer.addReceipt(receipt2)
      
      const stats = buffer.getStats()
      expect(stats.txCount).toBe(1)
    })
    
    it('should maintain multiple receipts per account', () => {
      const receipt1 = createMockReceipt('tx1', 'account1', 'hash1')
      const receipt2 = createMockReceipt('tx2', 'account1', 'hash2')
      const receipt3 = createMockReceipt('tx3', 'account1', 'hash3')
      
      buffer.addReceipt(receipt1)
      buffer.addReceipt(receipt2)
      buffer.addReceipt(receipt3)
      
      const receipts = buffer.getReceiptsForAccount('account1', 5)
      expect(receipts.length).toBe(3)
      expect(receipts[0].proposal?.txid).toBe('tx3') // Most recent first
    })
    
    it('should handle receipts for multiple accounts', () => {
      const receipt1 = createMockReceipt('tx1', 'account1', 'hash1')
      const receipt2 = createMockReceipt('tx2', 'account2', 'hash2')
      
      buffer.addReceipt(receipt1)
      buffer.addReceipt(receipt2)
      
      expect(buffer.getLatestForAccount('account1')?.proposal?.txid).toBe('tx1')
      expect(buffer.getLatestForAccount('account2')?.proposal?.txid).toBe('tx2')
    })
  })
  
  describe('getLatestForAccount', () => {
    it('should return null for unknown account', () => {
      const result = buffer.getLatestForAccount('unknown_account')
      expect(result).toBeNull()
    })
    
    it('should return the most recent receipt for an account', () => {
      const receipt1 = createMockReceipt('tx1', 'account1', 'hash1')
      const receipt2 = createMockReceipt('tx2', 'account1', 'hash2')
      
      buffer.addReceipt(receipt1)
      // Add a small delay to ensure different timestamps
      setTimeout(() => {
        buffer.addReceipt(receipt2)
      }, 10)
      
      setTimeout(() => {
        const latest = buffer.getLatestForAccount('account1')
        expect(latest?.proposal?.txid).toBe('tx2')
      }, 20)
    })
    
    it('should respect TTL and return null for expired receipts', () => {
      const bufferWithShortTTL = new RecentReceiptBuffer({
        bufferSize: 100,
        ttl: 100 // 100ms TTL
      })
      
      const receipt = createMockReceipt('tx1', 'account1', 'hash1')
      bufferWithShortTTL.addReceipt(receipt)
      
      // Receipt should be available immediately
      expect(bufferWithShortTTL.getLatestForAccount('account1')).toBeDefined()
      
      // Wait for TTL to expire
      setTimeout(() => {
        expect(bufferWithShortTTL.getLatestForAccount('account1')).toBeNull()
      }, 150)
    })
  })
  
  describe('validateBeforeStateLink', () => {
    it('should validate correct before-state linkage', () => {
      const receipt = createMockReceipt('tx1', 'account1', 'hash_after')
      buffer.addReceipt(receipt)
      
      const result = buffer.validateBeforeStateLink('account1', 'hash_after')
      expect(result).toBeDefined()
      expect(result?.proposal?.txid).toBe('tx1')
    })
    
    it('should return null for incorrect before-state hash', () => {
      const receipt = createMockReceipt('tx1', 'account1', 'hash_after')
      buffer.addReceipt(receipt)
      
      const result = buffer.validateBeforeStateLink('account1', 'wrong_hash')
      expect(result).toBeNull()
    })
    
    it('should find the correct receipt among multiple', () => {
      const receipt1 = createMockReceipt('tx1', 'account1', 'hash1')
      const receipt2 = createMockReceipt('tx2', 'account1', 'hash2')
      const receipt3 = createMockReceipt('tx3', 'account1', 'hash3')
      
      buffer.addReceipt(receipt1)
      buffer.addReceipt(receipt2)
      buffer.addReceipt(receipt3)
      
      const result = buffer.validateBeforeStateLink('account1', 'hash2')
      expect(result?.proposal?.txid).toBe('tx2')
    })
  })
  
  describe('getReceiptByTxId', () => {
    it('should retrieve receipt by transaction ID', () => {
      const receipt = createMockReceipt('tx1', 'account1', 'hash1')
      buffer.addReceipt(receipt)
      
      const result = buffer.getReceiptByTxId('tx1')
      expect(result).toBeDefined()
      expect(result?.proposal?.txid).toBe('tx1')
    })
    
    it('should return null for unknown transaction ID', () => {
      const result = buffer.getReceiptByTxId('unknown_tx')
      expect(result).toBeNull()
    })
  })
  
  describe('pruning', () => {
    it('should prune old entries when buffer size is exceeded', () => {
      const smallBuffer = new RecentReceiptBuffer({
        bufferSize: 10,
        ttl: 60000
      })
      
      // Add more receipts than buffer size
      for (let i = 0; i < 15; i++) {
        const receipt = createMockReceipt(`tx${i}`, `account${i}`, `hash${i}`)
        smallBuffer.addReceipt(receipt)
      }
      
      const stats = smallBuffer.getStats()
      expect(stats.totalEntries).toBeLessThanOrEqual(10)
    })
    
    it('should keep per-account limit of receipts', () => {
      // The implementation limits to 10 receipts per account
      for (let i = 0; i < 15; i++) {
        const receipt = createMockReceipt(`tx${i}`, 'account1', `hash${i}`)
        buffer.addReceipt(receipt)
      }
      
      const receipts = buffer.getReceiptsForAccount('account1', 20)
      expect(receipts.length).toBeLessThanOrEqual(10)
    })
  })
  
  describe('clear', () => {
    it('should remove all entries', () => {
      const receipt1 = createMockReceipt('tx1', 'account1', 'hash1')
      const receipt2 = createMockReceipt('tx2', 'account2', 'hash2')
      
      buffer.addReceipt(receipt1)
      buffer.addReceipt(receipt2)
      
      buffer.clear()
      
      const stats = buffer.getStats()
      expect(stats.totalEntries).toBe(0)
      expect(stats.accountCount).toBe(0)
      expect(stats.txCount).toBe(0)
    })
  })
  
  describe('getStats', () => {
    it('should return accurate statistics', () => {
      const receipt1 = createMockReceipt('tx1', 'account1', 'hash1')
      const receipt2 = createMockReceipt('tx2', 'account2', 'hash2')
      const receipt3 = createMockReceipt('tx3', 'account1', 'hash3')
      
      buffer.addReceipt(receipt1)
      buffer.addReceipt(receipt2)
      buffer.addReceipt(receipt3)
      
      const stats = buffer.getStats()
      expect(stats.accountCount).toBe(2)
      expect(stats.txCount).toBe(3)
      expect(stats.totalEntries).toBeGreaterThan(0)
    })
  })
})