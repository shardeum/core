import { 
  Node, 
  Cycle, 
  Archiver, 
  NodeWithRank, 
  AppObjEnum,
  InjectTxResponse,
  TransactionKeys,
  ApplyResponse,
  WrappedData,
  WrappedResponse,
  Sign,
  IncomingTransactionResult,
  ServerMode,
  DevSecurityLevel,
  AcceptedTx,
  ShardusMemoryPatternsInput,
  TxReceipt,
  OpaqueTransaction,
  ReinjectedOpaqueTransaction,
  ShardusEvent,
  ValidatorNodeDetails
} from '../../../../src/shardus/shardus-types'

describe('shardus-types', () => {
  describe('Type exports from lib-types', () => {
    it('should export Node type alias', () => {
      // Node is a type alias from lib-types, so we just verify it's usable
      const nodeKeys: keyof Node = 'id'
      expect(nodeKeys).toBe('id')
    })

    it('should export Cycle type alias', () => {
      // Cycle is a type alias from lib-types, so we just verify it's usable
      const cycleKeys: keyof Cycle = 'counter'
      expect(cycleKeys).toBe('counter')
    })

    it('should export Archiver type alias', () => {
      // Archiver is a type alias from lib-types, so we just verify it's usable
      const archiverKeys: keyof Archiver = 'publicKey'
      expect(archiverKeys).toBe('publicKey')
    })
  })

  describe('NodeWithRank interface', () => {
    it('should create a valid NodeWithRank object', () => {
      const nodeWithRank: NodeWithRank = {
        rank: BigInt(100),
        id: 'test-node-id',
        status: 'active',
        publicKey: 'test-public-key',
        externalIp: '192.168.1.1',
        externalPort: 9000,
        internalIp: '10.0.0.1',
        internalPort: 9001
      }
      
      expect(nodeWithRank).toBeDefined()
      expect(nodeWithRank.rank).toBe(BigInt(100))
      expect(nodeWithRank.id).toBe('test-node-id')
      expect(nodeWithRank.status).toBe('active')
    })

    it('should handle bigint rank correctly', () => {
      const nodeWithRank: NodeWithRank = {
        rank: BigInt('9007199254740991'), // Max safe integer
        id: 'test',
        status: 'active',
        publicKey: 'key',
        externalIp: '127.0.0.1',
        externalPort: 8080,
        internalIp: '127.0.0.1',
        internalPort: 8081
      }
      
      expect(nodeWithRank.rank).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER - 1))
    })
  })

  describe('AppObjEnum export', () => {
    it('should re-export AppObjEnum', () => {
      expect(AppObjEnum).toBeDefined()
    })
  })

  describe('InjectTxResponse interface', () => {
    it('should create a valid InjectTxResponse object', () => {
      const response: InjectTxResponse = {
        success: true,
        reason: 'Transaction injected successfully'
      }
      
      expect(response.success).toBe(true)
      expect(response.reason).toBe('Transaction injected successfully')
    })

    it('should allow optional reason field', () => {
      const response: InjectTxResponse = {
        success: false
      }
      
      expect(response.reason).toBeUndefined()
    })
  })

  describe('TransactionKeys interface', () => {
    it('should create a valid TransactionKeys object', () => {
      const keys: TransactionKeys = {
        sourceKeys: ['key1', 'key2'],
        targetKeys: ['key3', 'key4'],
        allKeys: ['key1', 'key2', 'key3', 'key4'],
        timestamp: 123456789,
        debugInfo: 'test debug info'
      }
      
      expect(keys.sourceKeys).toHaveLength(2)
      expect(keys.targetKeys).toHaveLength(2)
      expect(keys.allKeys).toHaveLength(4)
      expect(keys.timestamp).toBe(123456789)
      expect(keys.debugInfo).toBe('test debug info')
    })

    it('should allow optional debugInfo field', () => {
      const keys: TransactionKeys = {
        sourceKeys: [],
        targetKeys: [],
        allKeys: [],
        timestamp: 123456789
      }
      
      expect(keys.debugInfo).toBeUndefined()
    })
  })

  describe('ServerMode enum', () => {
    it('should have Debug and Release values', () => {
      expect(ServerMode.Debug).toBe('debug')
      expect(ServerMode.Release).toBe('release')
    })
  })

  describe('DevSecurityLevel enum', () => {
    it('should have correct security level values', () => {
      expect(DevSecurityLevel.Unauthorized).toBe(0)
      expect(DevSecurityLevel.Low).toBe(1)
      expect(DevSecurityLevel.Medium).toBe(2)
      expect(DevSecurityLevel.High).toBe(3)
    })
  })

  describe('Sign interface', () => {
    it('should create a valid Sign object', () => {
      const sign: Sign = {
        owner: 'test-owner',
        sig: 'test-signature'
      }
      
      expect(sign.owner).toBe('test-owner')
      expect(sign.sig).toBe('test-signature')
    })
  })

  describe('WrappedData interface', () => {
    it('should create a valid WrappedData object', () => {
      const wrappedData: WrappedData = {
        accountId: 'test-account-id',
        stateId: 'test-state-id',
        data: { value: 100 },
        timestamp: 123456789,
        syncData: { synced: true }
      }
      
      expect(wrappedData.accountId).toBe('test-account-id')
      expect(wrappedData.stateId).toBe('test-state-id')
      expect(wrappedData.data).toEqual({ value: 100 })
      expect(wrappedData.timestamp).toBe(123456789)
      expect(wrappedData.syncData).toEqual({ synced: true })
    })

    it('should allow optional syncData field', () => {
      const wrappedData: WrappedData = {
        accountId: 'test-account-id',
        stateId: 'test-state-id',
        data: {},
        timestamp: 123456789
      }
      
      expect(wrappedData.syncData).toBeUndefined()
    })
  })

  describe('OpaqueTransaction interface', () => {
    it('should accept any object as OpaqueTransaction', () => {
      // OpaqueTransaction is an opaque type that extends object
      // It's meant to be a black box that shardus doesn't inspect
      const tx: OpaqueTransaction = {}
      const tx2: OpaqueTransaction = { value: 123 }
      const tx3: OpaqueTransaction = { nested: { data: true } }
      
      expect(tx).toBeDefined()
      expect(tx2).toBeDefined()
      expect(tx3).toBeDefined()
      expect(typeof tx).toBe('object')
    })
  })

  describe('ReinjectedOpaqueTransaction interface', () => {
    it('should require isReinjected property', () => {
      const tx: ReinjectedOpaqueTransaction = {
        isReinjected: true
      }
      
      expect(tx.isReinjected).toBe(true)
    })

    it('should extend OpaqueTransaction', () => {
      const tx: ReinjectedOpaqueTransaction = {
        isReinjected: false
      }
      
      // Verify it can be used as OpaqueTransaction
      const opaqueTx: OpaqueTransaction = tx
      expect(opaqueTx).toBeDefined()
    })
  })

  describe('ValidatorNodeDetails interface', () => {
    it('should create a valid ValidatorNodeDetails object', () => {
      const details: ValidatorNodeDetails = {
        ip: '192.168.1.1',
        port: 8080,
        publicKey: 'test-public-key'
      }
      
      expect(details.ip).toBe('192.168.1.1')
      expect(details.port).toBe(8080)
      expect(details.publicKey).toBe('test-public-key')
    })
  })

  describe('ApplyResponse interface', () => {
    it('should create a valid ApplyResponse object', () => {
      const response: ApplyResponse = {
        stateTableResults: [],
        txId: 'tx-123',
        txTimestamp: 123456789,
        accountData: [],
        accountWrites: [],
        appDefinedData: { custom: 'data' },
        failed: false,
        failMessage: '',
        appReceiptData: null,
        appReceiptDataHash: 'hash-123'
      }
      
      expect(response.txId).toBe('tx-123')
      expect(response.failed).toBe(false)
    })
  })

  describe('WrappedResponse interface', () => {
    it('should extend WrappedData with additional properties', () => {
      const response: WrappedResponse = {
        accountId: 'account-123',
        stateId: 'state-123',
        data: { balance: 1000 },
        timestamp: 123456789,
        accountCreated: true,
        isPartial: false,
        userTag: 'tag',
        localCache: { cached: true },
        prevStateId: 'prev-state-123',
        prevDataCopy: { balance: 900 },
        sign: { owner: 'owner', sig: 'signature' }
      }
      
      expect(response.accountCreated).toBe(true)
      expect(response.isPartial).toBe(false)
    })
  })

  describe('IncomingTransactionResult interface', () => {
    it('should create a valid IncomingTransactionResult object', () => {
      const result: IncomingTransactionResult = {
        success: true,
        reason: 'Transaction processed',
        txnTimestamp: 123456789,
        status: 200
      }
      
      expect(result.success).toBe(true)
      expect(result.status).toBe(200)
    })
  })

  describe('ShardusEvent type', () => {
    it('should create valid ShardusEvent objects', () => {
      const event: ShardusEvent = {
        type: 'node-activated',
        nodeId: 'node-123',
        reason: 'Node joined network',
        time: 123456789,
        publicKey: 'pk-123',
        cycleNumber: 100,
        activeCycle: 101,
        additionalData: { extra: 'info' }
      }
      
      expect(event.type).toBe('node-activated')
      expect(event.cycleNumber).toBe(100)
    })
  })

  describe('AcceptedTx interface', () => {
    it('should create a valid AcceptedTx object', () => {
      const acceptedTx: AcceptedTx = {
        timestamp: 123456789,
        txId: 'tx-123',
        keys: {
          sourceKeys: ['key1'],
          targetKeys: ['key2'],
          allKeys: ['key1', 'key2'],
          timestamp: 123456789
        },
        data: {
          tx: {},
          timestampReceipt: {
            txId: 'tx-123',
            cycleMarker: 'marker',
            cycleCounter: 100,
            timestamp: 123456789
          }
        },
        appData: { app: 'data' },
        shardusMemoryPatterns: {
          ro: ['pattern1'],
          rw: ['pattern2'],
          wo: ['pattern3'],
          on: ['pattern4'],
          ri: ['pattern5']
        }
      }
      
      expect(acceptedTx.txId).toBe('tx-123')
      expect(acceptedTx.shardusMemoryPatterns.ro).toContain('pattern1')
    })
  })
})