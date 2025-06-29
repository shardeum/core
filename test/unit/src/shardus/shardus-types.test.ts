import {
  NodeWithRank,
  App,
  TransactionKeys,
  WrappedData,
  WrappedResponse,
  OpaqueTransaction,
  ReinjectedOpaqueTransaction,
  ServerConfiguration,
  ShardusEvent,
  DevSecurityLevel,
  ServerMode,
  DeepRequired,
  ShardusMemoryPatternsInput,
  AppObjEnum,
  InjectTxResponse,
  TimestampReceipt,
  TimestampedTx,
  IncomingTransaction,
  LogsConfiguration,
  StorageConfiguration,
  ShardusConfiguration,
  StrictShardusConfiguration,
  StrictServerConfiguration,
  StrictLogsConfiguration,
  StrictStorageConfiguration,
  AcceptedTx,
  TxReceipt,
  GetAppDataSignaturesResult,
  SignAppDataResult,
  ValidatorNodeDetails,
  ApplyResponse,
  AccountData,
  AccountsCopy,
  WrappedDataFromQueue,
  StateTableObject,
  Sign,
  IncomingTransactionResult,
  AccountData2,
} from '../../../../src/shardus/shardus-types'

describe('shardus-types', () => {
  // Test 0: Import verification
  describe('Import verification', () => {
    it('should properly import AppObjEnum', () => {
      // Simply verify that AppObjEnum is imported correctly
      expect(AppObjEnum).toBeDefined()
    })
  })

  // Test 1: Basic type structure verification
  describe('NodeWithRank', () => {
    it('should accept valid NodeWithRank objects', () => {
      // Create a valid NodeWithRank object
      const validNode: NodeWithRank = {
        rank: BigInt(1),
        id: 'node1',
        status: 'active',
        publicKey: 'someKey',
        externalIp: '192.168.1.1',
        externalPort: 8080,
        internalIp: '10.0.0.1',
        internalPort: 8081,
      }

      // Verify object structure at runtime
      expect(validNode).toHaveProperty('rank')
      expect(validNode).toHaveProperty('id')
      expect(validNode).toHaveProperty('status')
      expect(validNode).toHaveProperty('publicKey')
      expect(validNode).toHaveProperty('externalIp')
      expect(validNode).toHaveProperty('externalPort')
      expect(validNode).toHaveProperty('internalIp')
      expect(validNode).toHaveProperty('internalPort')

      // Verify types indirectly
      expect(typeof validNode.id).toBe('string')
      expect(typeof validNode.status).toBe('string')
      expect(typeof validNode.externalPort).toBe('number')
      // For BigInt we need a special check
      expect(validNode.rank.toString()).toBe('1')
    })
  })

  // Test 2: Transaction-related types
  describe('Transaction types', () => {
    it('should accept valid OpaqueTransaction objects', () => {
      const tx: OpaqueTransaction = { someField: 'value' }
      expect(tx).toBeDefined()
    })

    it('should accept valid ReinjectedOpaqueTransaction objects', () => {
      const reinjectedTx: ReinjectedOpaqueTransaction = {
        isReinjected: true,
      }
      expect(reinjectedTx).toHaveProperty('isReinjected')
      expect(reinjectedTx.isReinjected).toBe(true)
    })

    it('should accept valid TransactionKeys objects', () => {
      const txKeys: TransactionKeys = {
        sourceKeys: ['source1', 'source2'],
        targetKeys: ['target1'],
        allKeys: ['source1', 'source2', 'target1'],
        timestamp: 1234567890,
        debugInfo: 'Some debug info',
      }

      expect(txKeys).toHaveProperty('sourceKeys')
      expect(txKeys).toHaveProperty('targetKeys')
      expect(txKeys).toHaveProperty('allKeys')
      expect(txKeys).toHaveProperty('timestamp')
      expect(txKeys).toHaveProperty('debugInfo')

      expect(Array.isArray(txKeys.sourceKeys)).toBe(true)
      expect(txKeys.sourceKeys.length).toBe(2)
      expect(typeof txKeys.timestamp).toBe('number')
    })

    it('should accept TransactionKeys without optional fields', () => {
      const txKeysNoDebug: TransactionKeys = {
        sourceKeys: ['source1'],
        targetKeys: [],
        allKeys: ['source1'],
        timestamp: 1234567890,
      }

      expect(txKeysNoDebug).not.toHaveProperty('debugInfo')
      expect(txKeysNoDebug.sourceKeys).toContain('source1')
    })
  })

  // Test 3: Data wrapper types
  describe('Data wrapper types', () => {
    it('should accept valid WrappedData objects', () => {
      const wrappedData: WrappedData = {
        accountId: 'account1',
        stateId: 'state1',
        data: { balance: 100 },
        timestamp: 1234567890,
      }

      expect(wrappedData).toHaveProperty('accountId')
      expect(wrappedData).toHaveProperty('stateId')
      expect(wrappedData).toHaveProperty('data')
      expect(wrappedData).toHaveProperty('timestamp')

      expect(typeof wrappedData.accountId).toBe('string')
      expect(typeof wrappedData.timestamp).toBe('number')
    })

    it('should accept valid WrappedResponse objects', () => {
      const wrappedResponse: WrappedResponse = {
        accountId: 'account1',
        stateId: 'state1',
        data: { balance: 100 },
        timestamp: 1234567890,
        accountCreated: false,
        isPartial: true,
      }

      expect(wrappedResponse).toHaveProperty('accountId')
      expect(wrappedResponse).toHaveProperty('stateId')
      expect(wrappedResponse).toHaveProperty('data')
      expect(wrappedResponse).toHaveProperty('timestamp')
      expect(wrappedResponse).toHaveProperty('accountCreated')
      expect(wrappedResponse).toHaveProperty('isPartial')

      expect(typeof wrappedResponse.accountCreated).toBe('boolean')
      expect(typeof wrappedResponse.isPartial).toBe('boolean')
    })

    it('should accept WrappedResponse with optional fields', () => {
      const wrappedResponseWithOptionals: WrappedResponse = {
        accountId: 'account1',
        stateId: 'state1',
        data: { balance: 100 },
        timestamp: 1234567890,
        accountCreated: false,
        isPartial: true,
        userTag: 'tag1',
        localCache: { originalBalance: 50 },
        prevStateId: 'prevState1',
        prevDataCopy: { balance: 50 },
      }

      expect(wrappedResponseWithOptionals).toHaveProperty('userTag')
      expect(wrappedResponseWithOptionals).toHaveProperty('localCache')
      expect(wrappedResponseWithOptionals).toHaveProperty('prevStateId')
      expect(wrappedResponseWithOptionals).toHaveProperty('prevDataCopy')
    })
  })

  // Test 4: Complex configuration objects
  describe('Configuration objects', () => {
    it('should accept minimal ServerConfiguration', () => {
      const minimalConfig: ServerConfiguration = {
        globalAccount: 'global1',
        nonceMode: true,
      }

      expect(minimalConfig).toHaveProperty('globalAccount')
      expect(minimalConfig).toHaveProperty('nonceMode')
      expect(minimalConfig.globalAccount).toBe('global1')
      expect(minimalConfig.nonceMode).toBe(true)
    })

    it('should accept ServerConfiguration with optional fields', () => {
      const config: ServerConfiguration = {
        globalAccount: 'global1',
        nonceMode: true,
        heartbeatInterval: 30,
        baseDir: '/app',
        transactionExpireTime: 3600,
        crypto: {
          hashKey: 'secret',
        },
      }

      expect(config).toHaveProperty('heartbeatInterval')
      expect(config).toHaveProperty('baseDir')
      expect(config).toHaveProperty('transactionExpireTime')
      expect(config).toHaveProperty('crypto')
      expect(config.crypto).toHaveProperty('hashKey')
    })
  })

  // Test 5: Event types
  describe('Event types', () => {
    it('should accept valid ShardusEvent objects', () => {
      const nodeActivatedEvent: ShardusEvent = {
        type: 'node-activated',
        nodeId: 'node1',
        reason: 'joined',
        time: 1234567890,
        publicKey: 'key1',
        cycleNumber: 5,
      }

      expect(nodeActivatedEvent).toHaveProperty('type')
      expect(nodeActivatedEvent).toHaveProperty('nodeId')
      expect(nodeActivatedEvent).toHaveProperty('reason')
      expect(nodeActivatedEvent).toHaveProperty('time')
      expect(nodeActivatedEvent).toHaveProperty('publicKey')
      expect(nodeActivatedEvent).toHaveProperty('cycleNumber')

      expect(nodeActivatedEvent.type).toBe('node-activated')
    })

    it('should accept ShardusEvent with optional fields', () => {
      const eventWithOptionals: ShardusEvent = {
        type: 'node-deactivated',
        nodeId: 'node1',
        reason: 'left',
        time: 1234567890,
        publicKey: 'key1',
        cycleNumber: 5,
        activeCycle: 4,
        additionalData: { someInfo: 'value' },
      }

      expect(eventWithOptionals).toHaveProperty('activeCycle')
      expect(eventWithOptionals).toHaveProperty('additionalData')
      expect(eventWithOptionals.activeCycle).toBe(4)
      expect(eventWithOptionals.additionalData).toHaveProperty('someInfo')
    })

    it('should accept all valid event types', () => {
      // Test all valid event types
      const validTypes: Array<ShardusEvent['type']> = [
        'node-activated',
        'node-deactivated',
        'node-left-early',
        'node-refuted',
        'node-sync-timeout',
        'try-network-transaction',
      ]

      validTypes.forEach((type) => {
        const event: ShardusEvent = {
          type,
          nodeId: 'node1',
          reason: 'test',
          time: 1234567890,
          publicKey: 'key1',
          cycleNumber: 5,
        }

        expect(event.type).toBe(type)
      })
    })
  })

  // Test 6: App interface implementation
  describe('App interface', () => {
    it('should allow implementing the App interface', () => {
      // Create a minimal implementation of App interface
      class MinimalApp implements App {
        injectTxToConsensor() {
          return Promise.resolve({ success: true })
        }

        getNonceFromTx() {
          return BigInt(1)
        }

        getAccountNonce() {
          return Promise.resolve(BigInt(1))
        }

        getTxSenderAddress() {
          return 'sender'
        }

        validate() {
          return { success: true, reason: '', status: 200 }
        }

        isInternalTx() {
          return false
        }

        crack() {
          return {
            timestamp: 1234567890,
            id: 'tx1',
            keys: {
              sourceKeys: ['source1'],
              targetKeys: ['target1'],
              allKeys: ['source1', 'target1'],
              timestamp: 1234567890,
            },
            shardusMemoryPatterns: {
              ro: [],
              rw: [],
              wo: [],
              on: [],
              ri: [],
            },
          }
        }

        txPreCrackData() {
          return Promise.resolve({ status: true, reason: '' })
        }

        apply() {
          return Promise.resolve({
            stateTableResults: [],
            txId: 'tx1',
            txTimestamp: 1234567890,
            accountData: [],
            accountWrites: [],
            appDefinedData: {},
            failed: false,
            failMessage: '',
            appReceiptData: {},
            appReceiptDataHash: 'hash',
          })
        }

        updateAccountFull() {}
        updateAccountPartial() {}

        getRelevantData() {
          return Promise.resolve({
            accountId: 'account1',
            stateId: 'state1',
            data: {},
            timestamp: 1234567890,
            accountCreated: false,
            isPartial: false,
          })
        }

        getTimestampFromTransaction() {
          return 1234567890
        }

        calculateTxId() {
          return 'tx1'
        }

        close() {}

        getAccountData() {
          return Promise.resolve([])
        }

        getAccountDataByRange() {
          return Promise.resolve([])
        }

        calculateAccountHash() {
          return 'hash'
        }

        setAccountData() {
          return Promise.resolve()
        }

        resetAccountData() {}

        deleteAccountData() {}

        getAccountDataByList() {
          return Promise.resolve([])
        }

        getCachedRIAccountData() {
          return Promise.resolve([])
        }

        setCachedRIAccountData() {
          return Promise.resolve()
        }

        getNetworkAccount() {
          return Promise.resolve({
            accountId: 'network',
            stateId: 'state1',
            data: {},
            timestamp: 1234567890,
          })
        }

        deleteLocalAccountData() {
          return Promise.resolve()
        }

        getAccountDebugValue() {
          return 'debug'
        }

        isReadyToJoin() {
          return Promise.resolve(true)
        }

        isNGT() {
          return false
        }

        binarySerializeObject() {
          return Buffer.from('')
        }

        binaryDeserializeObject() {
          return {}
        }

        verifyMultiSigs() {
          return true
        }

        canStayOnStandby(joinInfo: any) {
          return { canStay: true, reason: '' }
        }
      }

      // Create an instance and verify it implements the interface
      const app = new MinimalApp()

      // Verify some key methods exist
      expect(typeof app.injectTxToConsensor).toBe('function')
      expect(typeof app.getNonceFromTx).toBe('function')
      expect(typeof app.validate).toBe('function')
      expect(typeof app.apply).toBe('function')
      expect(typeof app.canStayOnStandby).toBe('function')

      // Test a method call
      expect(app.isInternalTx()).toBe(false)
    })
  })

  // Test 7: Type guards
  describe('Type guards', () => {
    it('should allow creating type guards for ShardusEvent', () => {
      // Create a type guard for ShardusEvent
      function isNodeActivatedEvent(event: ShardusEvent): event is ShardusEvent & { type: 'node-activated' } {
        return event.type === 'node-activated'
      }

      const event: ShardusEvent = {
        type: 'node-activated',
        nodeId: 'node1',
        reason: 'joined',
        time: 1234567890,
        publicKey: 'key1',
        cycleNumber: 5,
      }

      // Test the type guard
      expect(isNodeActivatedEvent(event)).toBe(true)

      const deactivatedEvent: ShardusEvent = {
        type: 'node-deactivated',
        nodeId: 'node1',
        reason: 'left',
        time: 1234567890,
        publicKey: 'key1',
        cycleNumber: 5,
      }

      expect(isNodeActivatedEvent(deactivatedEvent)).toBe(false)
    })
  })

  // Test 8: DeepRequired type utility
  describe('DeepRequired type utility', () => {
    it('should make all properties required, including nested ones', () => {
      // Define a type with optional properties
      type TestType = {
        a?: string
        b?: {
          c?: number
          d?: {
            e?: boolean
          }
        }
      }

      // Use DeepRequired to make all properties required
      type RequiredTestType = DeepRequired<TestType>

      // Create an object that satisfies the RequiredTestType
      const requiredObj: RequiredTestType = {
        a: 'test',
        b: {
          c: 42,
          d: {
            e: true,
          },
        },
      }

      // Verify the object structure
      expect(requiredObj).toHaveProperty('a')
      expect(requiredObj).toHaveProperty('b')
      expect(requiredObj.b).toHaveProperty('c')
      expect(requiredObj.b).toHaveProperty('d')
      expect(requiredObj.b.d).toHaveProperty('e')

      // Verify types
      expect(typeof requiredObj.a).toBe('string')
      expect(typeof requiredObj.b.c).toBe('number')
      expect(typeof requiredObj.b.d.e).toBe('boolean')
    })
  })

  // Test 9: ShardusMemoryPatternsInput type
  describe('ShardusMemoryPatternsInput type', () => {
    it('should accept valid ShardusMemoryPatternsInput objects', () => {
      const memoryPatterns: ShardusMemoryPatternsInput = {
        ro: ['account1', 'account2'], // Read-only accounts
        rw: ['account3'], // Read-write accounts
        wo: ['account4'], // Write-only accounts
        on: [], // Other accounts
        ri: ['account5'], // Read-internal accounts
      }

      // Verify structure
      expect(memoryPatterns).toHaveProperty('ro')
      expect(memoryPatterns).toHaveProperty('rw')
      expect(memoryPatterns).toHaveProperty('wo')
      expect(memoryPatterns).toHaveProperty('on')
      expect(memoryPatterns).toHaveProperty('ri')

      // Verify types
      expect(Array.isArray(memoryPatterns.ro)).toBe(true)
      expect(Array.isArray(memoryPatterns.rw)).toBe(true)
      expect(Array.isArray(memoryPatterns.wo)).toBe(true)
      expect(Array.isArray(memoryPatterns.on)).toBe(true)
      expect(Array.isArray(memoryPatterns.ri)).toBe(true)

      // Verify content
      expect(memoryPatterns.ro).toContain('account1')
      expect(memoryPatterns.rw).toContain('account3')
      expect(memoryPatterns.wo).toContain('account4')
      expect(memoryPatterns.ri).toContain('account5')
    })

    it('should accept ShardusMemoryPatternsInput with empty arrays', () => {
      const emptyMemoryPatterns: ShardusMemoryPatternsInput = {
        ro: [],
        rw: [],
        wo: [],
        on: [],
        ri: [],
      }

      // Verify structure
      expect(emptyMemoryPatterns).toHaveProperty('ro')
      expect(emptyMemoryPatterns).toHaveProperty('rw')
      expect(emptyMemoryPatterns).toHaveProperty('wo')
      expect(emptyMemoryPatterns).toHaveProperty('on')
      expect(emptyMemoryPatterns).toHaveProperty('ri')

      // Verify all arrays are empty
      expect(emptyMemoryPatterns.ro.length).toBe(0)
      expect(emptyMemoryPatterns.rw.length).toBe(0)
      expect(emptyMemoryPatterns.wo.length).toBe(0)
      expect(emptyMemoryPatterns.on.length).toBe(0)
      expect(emptyMemoryPatterns.ri.length).toBe(0)
    })
  })

  // Test 10: P2P-related types
  describe('P2P-related types', () => {
    it('should allow using Node type', () => {
      // Create a Node-like object (simplified for testing)
      const node = {
        id: 'node1',
        publicKey: 'key1',
        externalIp: '192.168.1.1',
        externalPort: 9001,
      }

      // Verify structure
      expect(node).toHaveProperty('id')
      expect(node).toHaveProperty('publicKey')
      expect(node).toHaveProperty('externalIp')
      expect(node).toHaveProperty('externalPort')
    })

    it('should allow using Cycle type', () => {
      // Create a Cycle-like object (simplified for testing)
      const cycle = {
        number: 5,
        timestamp: 1234567890,
      }

      // Verify structure
      expect(cycle).toHaveProperty('number')
      expect(cycle).toHaveProperty('timestamp')
    })

    it('should allow using Archiver type', () => {
      // Create an Archiver-like object (simplified for testing)
      const archiver = {
        nodeId: 'archiver1',
        publicKey: 'key1',
      }

      // Verify structure
      expect(archiver).toHaveProperty('nodeId')
      expect(archiver).toHaveProperty('publicKey')
    })
  })

  // Test 11: DeepRequired with complex types
  describe('DeepRequired with complex types', () => {
    it('should work with complex nested objects', () => {
      // Define a complex type with optional properties
      type ComplexType = {
        name?: string
        config?: {
          enabled?: boolean
          settings?: {
            timeout?: number
            retries?: number
            options?: {
              debug?: boolean
              verbose?: boolean
            }
          }
        }
        data?: Array<{
          id?: number
          value?: string
        }>
      }

      // Use DeepRequired to make all properties required
      type RequiredComplexType = DeepRequired<ComplexType>

      // Create an object that satisfies the RequiredComplexType
      const requiredObj: RequiredComplexType = {
        name: 'test',
        config: {
          enabled: true,
          settings: {
            timeout: 1000,
            retries: 3,
            options: {
              debug: true,
              verbose: false,
            },
          },
        },
        data: [
          {
            id: 1,
            value: 'one',
          },
          {
            id: 2,
            value: 'two',
          },
        ],
      }

      // Verify the object structure
      expect(requiredObj).toHaveProperty('name')
      expect(requiredObj).toHaveProperty('config')
      expect(requiredObj.config).toHaveProperty('enabled')
      expect(requiredObj.config).toHaveProperty('settings')
      expect(requiredObj.config.settings).toHaveProperty('timeout')
      expect(requiredObj.config.settings).toHaveProperty('retries')
      expect(requiredObj.config.settings).toHaveProperty('options')
      expect(requiredObj.config.settings.options).toHaveProperty('debug')
      expect(requiredObj.config.settings.options).toHaveProperty('verbose')
      expect(requiredObj).toHaveProperty('data')
      expect(requiredObj.data.length).toBe(2)
      expect(requiredObj.data[0]).toHaveProperty('id')
      expect(requiredObj.data[0]).toHaveProperty('value')
      expect(requiredObj.data[1]).toHaveProperty('id')
      expect(requiredObj.data[1]).toHaveProperty('value')

      // Verify types
      expect(typeof requiredObj.name).toBe('string')
      expect(typeof requiredObj.config.enabled).toBe('boolean')
      expect(typeof requiredObj.config.settings.timeout).toBe('number')
      expect(typeof requiredObj.config.settings.retries).toBe('number')
      expect(typeof requiredObj.config.settings.options.debug).toBe('boolean')
      expect(typeof requiredObj.config.settings.options.verbose).toBe('boolean')
      expect(Array.isArray(requiredObj.data)).toBe(true)
      expect(typeof requiredObj.data[0].id).toBe('number')
      expect(typeof requiredObj.data[0].value).toBe('string')
      expect(typeof requiredObj.data[1].id).toBe('number')
      expect(typeof requiredObj.data[1].value).toBe('string')
    })
  })

  // Test 12: Transaction-related interfaces
  describe('Transaction-related interfaces', () => {
    it('should accept valid InjectTxResponse objects', () => {
      const response: InjectTxResponse = {
        success: true,
        reason: 'Transaction accepted',
      }

      expect(response).toHaveProperty('success')
      expect(response).toHaveProperty('reason')

      expect(typeof response.success).toBe('boolean')
      expect(typeof response.reason).toBe('string')
    })

    it('should accept valid TimestampReceipt objects', () => {
      const receipt: TimestampReceipt = {
        txId: 'tx123',
        cycleMarker: 'marker123',
        cycleCounter: 42,
        timestamp: 1234567890,
      }

      expect(receipt).toHaveProperty('txId')
      expect(receipt).toHaveProperty('cycleMarker')
      expect(receipt).toHaveProperty('cycleCounter')
      expect(receipt).toHaveProperty('timestamp')

      expect(typeof receipt.txId).toBe('string')
      expect(typeof receipt.cycleMarker).toBe('string')
      expect(typeof receipt.cycleCounter).toBe('number')
      expect(typeof receipt.timestamp).toBe('number')
    })

    it('should accept valid TimestampedTx objects', () => {
      const tx: TimestampedTx = {
        tx: { someData: 'value' },
        timestampReceipt: {
          txId: 'tx123',
          cycleMarker: 'marker123',
          cycleCounter: 42,
          timestamp: 1234567890,
        },
      }

      expect(tx).toHaveProperty('tx')
      expect(tx).toHaveProperty('timestampReceipt')
      expect(tx.timestampReceipt).toHaveProperty('txId')
    })

    it('should accept valid IncomingTransaction objects', () => {
      const incomingTx: IncomingTransaction = {
        srcAct: 'account123',
        tgtAct: 'account456',
        tgtActs: 'account789',
        txnType: 'transfer',
        txnAmt: 100,
        seqNum: 42,
        sign: {
          owner: 'owner123',
          sig: 'signature123',
        },
        txnTimestamp: '1234567890',
      }

      expect(incomingTx).toHaveProperty('srcAct')
      expect(incomingTx).toHaveProperty('tgtAct')
      expect(incomingTx).toHaveProperty('tgtActs')
      expect(incomingTx).toHaveProperty('txnType')
      expect(incomingTx).toHaveProperty('txnAmt')
      expect(incomingTx).toHaveProperty('seqNum')
      expect(incomingTx).toHaveProperty('sign')
      expect(incomingTx).toHaveProperty('txnTimestamp')

      expect(typeof incomingTx.srcAct).toBe('string')
      expect(typeof incomingTx.txnType).toBe('string')
      expect(typeof incomingTx.txnAmt).toBe('number')
      expect(typeof incomingTx.seqNum).toBe('number')
      expect(typeof incomingTx.sign.owner).toBe('string')
      expect(typeof incomingTx.sign.sig).toBe('string')
      expect(typeof incomingTx.txnTimestamp).toBe('string')
    })
  })

  // Test 13: Configuration interfaces
  describe('Configuration interfaces', () => {
    it('should accept valid LogsConfiguration objects', () => {
      const logsConfig: LogsConfiguration = {
        saveConsoleOutput: true,
        dir: '/var/log',
        files: {
          main: 'main.log',
          fatal: 'fatal.log',
          net: 'net.log',
          app: 'app.log',
          seq: 'seq.log',
        },
        options: {
          appenders: {
            out: {
              type: 'file',
              maxLogSize: 10485760,
              backups: 3,
            },
            main: {
              type: 'file',
              maxLogSize: 10485760,
            },
          },
        },
      }

      expect(logsConfig).toHaveProperty('saveConsoleOutput')
      expect(logsConfig).toHaveProperty('dir')
      expect(logsConfig).toHaveProperty('files')
      expect(logsConfig).toHaveProperty('options')
      expect(logsConfig.files).toHaveProperty('main')
      expect(logsConfig.options?.appenders?.out).toHaveProperty('type')
    })

    it('should accept valid StorageConfiguration objects', () => {
      const storageConfig: StorageConfiguration = {
        database: 'mydb',
        username: 'user',
        password: 'pass',
        options: {
          logging: false,
          host: 'localhost',
          dialect: 'sqlite',
          operatorsAliases: false,
          pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000,
          },
          storage: './db.sqlite',
          sync: {
            force: false,
          },
          memoryFile: false,
          saveOldDBFiles: true,
          walMode: true,
          exclusiveLockMode: true,
        },
      }

      expect(storageConfig).toHaveProperty('database')
      expect(storageConfig).toHaveProperty('username')
      expect(storageConfig).toHaveProperty('password')
      expect(storageConfig).toHaveProperty('options')
      expect(storageConfig.options).toHaveProperty('pool')
      expect(storageConfig.options?.pool).toHaveProperty('max')
    })

    it('should accept valid ShardusConfiguration objects', () => {
      const shardusConfig: ShardusConfiguration = {
        server: {
          globalAccount: 'global1',
          nonceMode: true,
        },
        logs: {
          saveConsoleOutput: true,
          dir: '/var/log',
        },
        storage: {
          database: 'mydb',
          username: 'user',
        },
      }

      expect(shardusConfig).toHaveProperty('server')
      expect(shardusConfig).toHaveProperty('logs')
      expect(shardusConfig).toHaveProperty('storage')
    })

    it('should enforce strict configuration types', () => {
      // Instead of creating a full StrictShardusConfiguration object,
      // we'll test the type relationships

      // Test that StrictServerConfiguration is a DeepRequired version of ServerConfiguration
      const serverConfig: ServerConfiguration = {
        globalAccount: 'global1',
        nonceMode: true,
      }

      // This would be a type error if StrictServerConfiguration wasn't properly defined
      type TestServerConfig = StrictServerConfiguration extends Required<ServerConfiguration> ? true : false
      const testServerConfig: TestServerConfig = true
      expect(testServerConfig).toBe(true)

      // Test that StrictLogsConfiguration is a DeepRequired version of LogsConfiguration
      const logsConfig: LogsConfiguration = {
        saveConsoleOutput: true,
      }

      // This would be a type error if StrictLogsConfiguration wasn't properly defined
      type TestLogsConfig = StrictLogsConfiguration extends Required<LogsConfiguration> ? true : false
      const testLogsConfig: TestLogsConfig = true
      expect(testLogsConfig).toBe(true)

      // Test that StrictStorageConfiguration is a DeepRequired version of StorageConfiguration
      const storageConfig: StorageConfiguration = {
        database: 'mydb',
      }

      // This would be a type error if StrictStorageConfiguration wasn't properly defined
      type TestStorageConfig = StrictStorageConfiguration extends Required<StorageConfiguration>
        ? true
        : false
      const testStorageConfig: TestStorageConfig = true
      expect(testStorageConfig).toBe(true)

      // Test that StrictShardusConfiguration requires the strict versions of its components
      type TestShardusConfig = StrictShardusConfiguration extends {
        server: StrictServerConfiguration
        logs: StrictLogsConfiguration
        storage: StrictStorageConfiguration
      }
        ? true
        : false
      const testShardusConfig: TestShardusConfig = true
      expect(testShardusConfig).toBe(true)
    })
  })

  // Test 14: Additional transaction-related types
  describe('Additional transaction-related types', () => {
    it('should accept valid AcceptedTx objects', () => {
      const acceptedTx: AcceptedTx = {
        timestamp: 1234567890,
        txId: 'tx123',
        keys: {
          sourceKeys: ['source1'],
          targetKeys: ['target1'],
          allKeys: ['source1', 'target1'],
          timestamp: 1234567890,
        },
        data: {
          tx: { someData: 'value' },
          timestampReceipt: {
            txId: 'tx123',
            cycleMarker: 'marker123',
            cycleCounter: 42,
            timestamp: 1234567890,
          },
        },
        appData: { customData: 'value' },
        shardusMemoryPatterns: {
          ro: ['account1'],
          rw: ['account2'],
          wo: ['account3'],
          on: [],
          ri: ['account4'],
        },
      }

      expect(acceptedTx).toHaveProperty('timestamp')
      expect(acceptedTx).toHaveProperty('txId')
      expect(acceptedTx).toHaveProperty('keys')
      expect(acceptedTx).toHaveProperty('data')
      expect(acceptedTx).toHaveProperty('appData')
      expect(acceptedTx).toHaveProperty('shardusMemoryPatterns')

      expect(typeof acceptedTx.timestamp).toBe('number')
      expect(typeof acceptedTx.txId).toBe('string')
      expect(Array.isArray(acceptedTx.keys.sourceKeys)).toBe(true)
      expect(acceptedTx.data).toHaveProperty('tx')
      expect(acceptedTx.shardusMemoryPatterns).toHaveProperty('ro')
    })

    it('should accept valid TxReceipt objects', () => {
      const txReceipt: TxReceipt = {
        txHash: 'hash123',
        sign: {
          owner: 'owner123',
          sig: 'signature123',
        },
        time: 1234567890,
        stateId: 'state123',
        targetStateId: 'targetState123',
      }

      expect(txReceipt).toHaveProperty('txHash')
      expect(txReceipt).toHaveProperty('sign')
      expect(txReceipt).toHaveProperty('time')
      expect(txReceipt).toHaveProperty('stateId')
      expect(txReceipt).toHaveProperty('targetStateId')

      expect(typeof txReceipt.txHash).toBe('string')
      expect(typeof txReceipt.time).toBe('number')
      expect(typeof txReceipt.stateId).toBe('string')
      expect(typeof txReceipt.targetStateId).toBe('string')
      expect(txReceipt.sign).toHaveProperty('owner')
      expect(txReceipt.sign).toHaveProperty('sig')
    })
  })

  // Test 15: Signature-related types
  describe('Signature-related types', () => {
    it('should accept valid GetAppDataSignaturesResult objects', () => {
      const result: GetAppDataSignaturesResult = {
        success: true,
        signatures: [
          {
            owner: 'owner1',
            sig: 'signature1',
          },
          {
            owner: 'owner2',
            sig: 'signature2',
          },
        ],
      }

      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('signatures')
      expect(typeof result.success).toBe('boolean')
      expect(Array.isArray(result.signatures)).toBe(true)
      expect(result.signatures[0]).toHaveProperty('owner')
      expect(result.signatures[0]).toHaveProperty('sig')
    })

    it('should accept valid SignAppDataResult objects', () => {
      const result: SignAppDataResult = {
        success: true,
        signature: {
          owner: 'owner123',
          sig: 'signature123',
        },
      }

      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('signature')
      expect(typeof result.success).toBe('boolean')
      expect(result.signature).toHaveProperty('owner')
      expect(result.signature).toHaveProperty('sig')
    })
  })

  // Test 16: Node-related types
  describe('Node-related types', () => {
    it('should accept valid ValidatorNodeDetails objects', () => {
      const validator: ValidatorNodeDetails = {
        ip: '192.168.1.1',
        port: 9001,
        publicKey: 'pubKey123',
      }

      expect(validator).toHaveProperty('ip')
      expect(validator).toHaveProperty('port')
      expect(validator).toHaveProperty('publicKey')

      expect(typeof validator.ip).toBe('string')
      expect(typeof validator.port).toBe('number')
      expect(typeof validator.publicKey).toBe('string')
    })
  })

  // Test 17: Apply and Account-related interfaces
  describe('Apply and Account-related interfaces', () => {
    it('should accept valid ApplyResponse objects', () => {
      const applyResponse: ApplyResponse = {
        stateTableResults: [
          {
            accountId: 'account123',
            txId: 'tx123',
            txTimestamp: '1234567890',
            stateBefore: 'hash1',
            stateAfter: 'hash2',
          },
        ],
        txId: 'tx123',
        txTimestamp: 1234567890,
        accountData: [
          {
            accountId: 'account123',
            stateId: 'state123',
            data: { balance: 100 },
            timestamp: 1234567890,
            accountCreated: false,
            isPartial: false,
          },
        ],
        accountWrites: [
          {
            accountId: 'account123',
            data: {
              accountId: 'account123',
              stateId: 'state123',
              data: { balance: 100 },
              timestamp: 1234567890,
              accountCreated: false,
              isPartial: false,
            },
            txId: 'tx123',
            timestamp: 1234567890,
          },
        ],
        appDefinedData: { customData: 'value' },
        failed: false,
        failMessage: '',
        appReceiptData: { receiptData: 'value' },
        appReceiptDataHash: 'hash123',
      }

      expect(applyResponse).toHaveProperty('stateTableResults')
      expect(applyResponse).toHaveProperty('txId')
      expect(applyResponse).toHaveProperty('txTimestamp')
      expect(applyResponse).toHaveProperty('accountData')
      expect(applyResponse).toHaveProperty('accountWrites')
      expect(applyResponse).toHaveProperty('appDefinedData')
      expect(applyResponse).toHaveProperty('failed')
      expect(applyResponse).toHaveProperty('failMessage')
      expect(applyResponse).toHaveProperty('appReceiptData')
      expect(applyResponse).toHaveProperty('appReceiptDataHash')

      expect(Array.isArray(applyResponse.stateTableResults)).toBe(true)
      expect(Array.isArray(applyResponse.accountData)).toBe(true)
      expect(Array.isArray(applyResponse.accountWrites)).toBe(true)
      expect(typeof applyResponse.failed).toBe('boolean')
    })

    it('should accept valid AccountData objects', () => {
      const accountData: AccountData = {
        accountId: 'account123',
        data: '{"balance":100}',
        txId: 'tx123',
        timestamp: 1234567890,
        hash: 'hash123',
      }

      expect(accountData).toHaveProperty('accountId')
      expect(accountData).toHaveProperty('data')
      expect(accountData).toHaveProperty('txId')
      expect(accountData).toHaveProperty('timestamp')
      expect(accountData).toHaveProperty('hash')

      expect(typeof accountData.accountId).toBe('string')
      expect(typeof accountData.data).toBe('string')
      expect(typeof accountData.txId).toBe('string')
      expect(typeof accountData.timestamp).toBe('number')
      expect(typeof accountData.hash).toBe('string')
    })

    it('should accept valid AccountsCopy objects', () => {
      const accountsCopy: AccountsCopy = {
        accountId: 'account123',
        cycleNumber: 5,
        data: { balance: 100 },
        timestamp: 1234567890,
        hash: 'hash123',
        isGlobal: false,
      }

      expect(accountsCopy).toHaveProperty('accountId')
      expect(accountsCopy).toHaveProperty('cycleNumber')
      expect(accountsCopy).toHaveProperty('data')
      expect(accountsCopy).toHaveProperty('timestamp')
      expect(accountsCopy).toHaveProperty('hash')
      expect(accountsCopy).toHaveProperty('isGlobal')

      expect(typeof accountsCopy.accountId).toBe('string')
      expect(typeof accountsCopy.cycleNumber).toBe('number')
      expect(typeof accountsCopy.timestamp).toBe('number')
      expect(typeof accountsCopy.hash).toBe('string')
      expect(typeof accountsCopy.isGlobal).toBe('boolean')
    })

    it('should accept valid WrappedDataFromQueue objects', () => {
      const wrappedDataFromQueue: WrappedDataFromQueue = {
        accountId: 'account123',
        stateId: 'state123',
        data: { balance: 100 },
        timestamp: 1234567890,
        seenInQueue: true,
      }

      expect(wrappedDataFromQueue).toHaveProperty('accountId')
      expect(wrappedDataFromQueue).toHaveProperty('stateId')
      expect(wrappedDataFromQueue).toHaveProperty('data')
      expect(wrappedDataFromQueue).toHaveProperty('timestamp')
      expect(wrappedDataFromQueue).toHaveProperty('seenInQueue')

      expect(typeof wrappedDataFromQueue.accountId).toBe('string')
      expect(typeof wrappedDataFromQueue.stateId).toBe('string')
      expect(typeof wrappedDataFromQueue.timestamp).toBe('number')
      expect(typeof wrappedDataFromQueue.seenInQueue).toBe('boolean')
    })

    it('should accept valid StateTableObject objects', () => {
      const stateTableObject: StateTableObject = {
        accountId: 'account123',
        txId: 'tx123',
        txTimestamp: '1234567890',
        stateBefore: 'hash1',
        stateAfter: 'hash2',
      }

      expect(stateTableObject).toHaveProperty('accountId')
      expect(stateTableObject).toHaveProperty('txId')
      expect(stateTableObject).toHaveProperty('txTimestamp')
      expect(stateTableObject).toHaveProperty('stateBefore')
      expect(stateTableObject).toHaveProperty('stateAfter')

      expect(typeof stateTableObject.accountId).toBe('string')
      expect(typeof stateTableObject.txId).toBe('string')
      expect(typeof stateTableObject.txTimestamp).toBe('string')
      expect(typeof stateTableObject.stateBefore).toBe('string')
      expect(typeof stateTableObject.stateAfter).toBe('string')
    })
  })

  // Test 18: Additional transaction result types
  describe('Additional transaction result types', () => {
    it('should accept valid Sign objects', () => {
      const sign: Sign = {
        owner: 'owner123',
        sig: 'signature123',
      }

      expect(sign).toHaveProperty('owner')
      expect(sign).toHaveProperty('sig')

      expect(typeof sign.owner).toBe('string')
      expect(typeof sign.sig).toBe('string')
    })

    it('should accept valid IncomingTransactionResult objects', () => {
      const result: IncomingTransactionResult = {
        success: true,
        reason: 'Transaction accepted',
        txnTimestamp: 1234567890,
        status: 200,
      }

      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('reason')
      expect(result).toHaveProperty('txnTimestamp')
      expect(result).toHaveProperty('status')

      expect(typeof result.success).toBe('boolean')
      expect(typeof result.reason).toBe('string')
      expect(typeof result.txnTimestamp).toBe('number')
      expect(typeof result.status).toBe('number')
    })

    it('should accept IncomingTransactionResult without optional fields', () => {
      const result: IncomingTransactionResult = {
        success: false,
        reason: 'Transaction rejected',
      }

      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('reason')
      expect(result).not.toHaveProperty('txnTimestamp')
      expect(result).not.toHaveProperty('status')

      expect(typeof result.success).toBe('boolean')
      expect(typeof result.reason).toBe('string')
    })
  })

  // Test 19: Additional account data types
  describe('Additional account data types', () => {
    it('should accept valid AccountData2 objects', () => {
      const accountData2: AccountData2 = {
        accountId: 'account123',
        data: '{"balance":100}',
        txId: 'tx123',
        txTimestamp: '1234567890',
        hash: 'hash123',
        accountData: { balance: 100 },
        localCache: { originalBalance: 50 },
      }

      expect(accountData2).toHaveProperty('accountId')
      expect(accountData2).toHaveProperty('data')
      expect(accountData2).toHaveProperty('txId')
      expect(accountData2).toHaveProperty('txTimestamp')
      expect(accountData2).toHaveProperty('hash')
      expect(accountData2).toHaveProperty('accountData')
      expect(accountData2).toHaveProperty('localCache')

      expect(typeof accountData2.accountId).toBe('string')
      expect(typeof accountData2.data).toBe('string')
      expect(typeof accountData2.txId).toBe('string')
      expect(typeof accountData2.txTimestamp).toBe('string')
      expect(typeof accountData2.hash).toBe('string')
    })
  })

  // Test 20: ShardusEventType
  describe('ShardusEventType', () => {
    it('should accept all valid ShardusEventType values', () => {
      // We can test ShardusEventType indirectly through ShardusEvent
      const validEventTypes = [
        'node-activated',
        'node-deactivated',
        'node-left-early',
        'node-refuted',
        'node-sync-timeout',
        'try-network-transaction',
      ]

      validEventTypes.forEach((type) => {
        const event: ShardusEvent = {
          type: type as any, // Type assertion needed since we're using a string array
          nodeId: 'node123',
          reason: 'test',
          time: 1234567890,
          publicKey: 'key123',
          cycleNumber: 5,
        }

        expect(event.type).toBe(type)
      })
    })
  })

  // Test 21: ObjectAlias
  describe('ObjectAlias', () => {
    it('should accept objects as OpaqueTransaction', () => {
      // ObjectAlias is just an alias for 'object', so we can test it through OpaqueTransaction
      const tx: OpaqueTransaction = {
        field1: 'value1',
        field2: 42,
      }

      expect(typeof tx).toBe('object')
      expect(tx).toHaveProperty('field1')
      expect(tx).toHaveProperty('field2')

      // We can also add properties dynamically
      const txAny = tx as any
      txAny.nested = { field3: true }

      expect(txAny).toHaveProperty('nested')
      expect(txAny.nested).toHaveProperty('field3')
    })
  })

  // Test 22: JoinRequest (indirectly through App.canStayOnStandby)
  describe('JoinRequest', () => {
    it('should be usable in App.canStayOnStandby method', () => {
      // We can test JoinRequest indirectly through the App interface
      class TestApp implements App {
        // Implement required methods with minimal functionality
        injectTxToConsensor() {
          return Promise.resolve({ success: true })
        }
        getNonceFromTx() {
          return BigInt(1)
        }
        getAccountNonce() {
          return Promise.resolve(BigInt(1))
        }
        getTxSenderAddress() {
          return 'sender'
        }
        validate() {
          return { success: true, reason: '', status: 200 }
        }
        isInternalTx() {
          return false
        }
        crack() {
          return {
            timestamp: 1234567890,
            id: 'tx1',
            keys: {
              sourceKeys: [],
              targetKeys: [],
              allKeys: [],
              timestamp: 1234567890,
            },
            shardusMemoryPatterns: {
              ro: [],
              rw: [],
              wo: [],
              on: [],
              ri: [],
            },
          }
        }
        txPreCrackData() {
          return Promise.resolve({ status: true, reason: '' })
        }
        apply() {
          return Promise.resolve({
            stateTableResults: [],
            txId: 'tx1',
            txTimestamp: 1234567890,
            accountData: [],
            accountWrites: [],
            appDefinedData: {},
            failed: false,
            failMessage: '',
            appReceiptData: {},
            appReceiptDataHash: '',
          })
        }
        updateAccountFull() {}
        updateAccountPartial() {}
        getRelevantData() {
          return Promise.resolve({
            accountId: 'account1',
            stateId: 'state1',
            data: {},
            timestamp: 1234567890,
            accountCreated: false,
            isPartial: false,
          })
        }
        getTimestampFromTransaction() {
          return 1234567890
        }
        calculateTxId() {
          return 'tx1'
        }
        close() {}
        getAccountData() {
          return Promise.resolve([])
        }
        getAccountDataByRange() {
          return Promise.resolve([])
        }
        calculateAccountHash() {
          return 'hash'
        }
        setAccountData() {
          return Promise.resolve()
        }
        resetAccountData() {}
        deleteAccountData() {}
        getAccountDataByList() {
          return Promise.resolve([])
        }
        getCachedRIAccountData() {
          return Promise.resolve([])
        }
        setCachedRIAccountData() {
          return Promise.resolve()
        }
        getNetworkAccount() {
          return Promise.resolve({
            accountId: 'network',
            stateId: 'state1',
            data: {},
            timestamp: 1234567890,
          })
        }
        deleteLocalAccountData() {
          return Promise.resolve()
        }
        getAccountDebugValue() {
          return 'debug'
        }
        isReadyToJoin() {
          return Promise.resolve(true)
        }
        isNGT() {
          return false
        }
        binarySerializeObject() {
          return Buffer.from('')
        }
        binaryDeserializeObject() {
          return {}
        }
        verifyMultiSigs() {
          return true
        }

        // Test the canStayOnStandby method with a JoinRequest-like object
        canStayOnStandby(joinInfo: any) {
          // Verify the joinInfo has expected properties of a JoinRequest
          expect(joinInfo).toHaveProperty('nodeId')
          expect(joinInfo).toHaveProperty('publicKey')
          expect(joinInfo).toHaveProperty('externalIp')
          expect(joinInfo).toHaveProperty('externalPort')

          return { canStay: true, reason: 'Test passed' }
        }
      }

      const app = new TestApp()

      // Create a mock JoinRequest
      const joinRequest = {
        nodeId: 'node123',
        publicKey: 'key123',
        externalIp: '192.168.1.1',
        externalPort: 9001,
        internalIp: '10.0.0.1',
        internalPort: 9002,
        version: '1.0.0',
        appData: { custom: 'data' },
      }

      // Test the canStayOnStandby method
      const result = app.canStayOnStandby(joinRequest)
      expect(result).toHaveProperty('canStay')
      expect(result).toHaveProperty('reason')
      expect(result.canStay).toBe(true)
      expect(result.reason).toBe('Test passed')
    })
  })

  // Test 23: Enum types
  describe('Enum types', () => {
    it('should have correct values for ServerMode enum', () => {
      // Test that ServerMode has the expected values
      expect(ServerMode.Debug).toBe('debug')
      expect(ServerMode.Release).toBe('release')

      // Test that the enum has exactly 2 values
      const enumValues = Object.keys(ServerMode).filter((key) => isNaN(Number(key)))
      expect(enumValues.length).toBe(2)
      expect(enumValues).toContain('Debug')
      expect(enumValues).toContain('Release')
    })

    it('should have correct values for DevSecurityLevel enum', () => {
      // Test that DevSecurityLevel has the expected values
      expect(DevSecurityLevel.Unauthorized).toBe(0)
      expect(DevSecurityLevel.Low).toBe(1)
      expect(DevSecurityLevel.Medium).toBe(2)
      expect(DevSecurityLevel.High).toBe(3)

      // Test that the enum has exactly 4 values
      const enumValues = Object.keys(DevSecurityLevel).filter((key) => isNaN(Number(key)))
      expect(enumValues.length).toBe(4)
      expect(enumValues).toContain('Unauthorized')
      expect(enumValues).toContain('Low')
      expect(enumValues).toContain('Medium')
      expect(enumValues).toContain('High')
    })
  })

  // Test 24: Negative tests for NodeWithRank
  describe('NodeWithRank negative tests', () => {
    it('should detect invalid NodeWithRank objects at runtime', () => {
      // Create invalid objects and verify they don't match expected structure
      
      // Missing required properties
      const invalidNode1 = {}
      expect(invalidNode1).not.toHaveProperty('rank')
      expect(invalidNode1).not.toHaveProperty('id')
      
      // Missing rank property
      const invalidNode2 = {
        id: 'node1',
        status: 'active',
        publicKey: 'someKey',
        externalIp: '192.168.1.1',
        externalPort: 8080,
        internalIp: '10.0.0.1',
        internalPort: 8081,
      }
      expect(invalidNode2).not.toHaveProperty('rank')
      
      // Wrong type for rank (should be BigInt)
      const invalidNode3 = {
        rank: 1, // Should be BigInt
        id: 'node1',
        status: 'active',
        publicKey: 'someKey',
        externalIp: '192.168.1.1',
        externalPort: 8080,
        internalIp: '10.0.0.1',
        internalPort: 8081,
      }
      expect(typeof invalidNode3.rank).not.toBe('bigint')
      
      // Function to validate NodeWithRank at runtime
      function isValidNodeWithRank(node: any): boolean {
        return (
          node &&
          typeof node === 'object' &&
          typeof node.id === 'string' &&
          typeof node.rank === 'bigint' &&
          typeof node.status === 'string' &&
          typeof node.publicKey === 'string' &&
          typeof node.externalIp === 'string' &&
          typeof node.externalPort === 'number' &&
          typeof node.internalIp === 'string' &&
          typeof node.internalPort === 'number'
        )
      }
      
      expect(isValidNodeWithRank(invalidNode1)).toBe(false)
      expect(isValidNodeWithRank(invalidNode2)).toBe(false)
      expect(isValidNodeWithRank(invalidNode3)).toBe(false)
    })
  })

  // Test 25: Negative tests for TransactionKeys
  describe('TransactionKeys negative tests', () => {
    it('should detect invalid TransactionKeys objects at runtime', () => {
      // Missing required properties
      const invalidTxKeys1 = {}
      expect(invalidTxKeys1).not.toHaveProperty('sourceKeys')
      expect(invalidTxKeys1).not.toHaveProperty('targetKeys')
      expect(invalidTxKeys1).not.toHaveProperty('allKeys')
      
      // Missing allKeys property
      const invalidTxKeys2 = {
        sourceKeys: ['source1'],
        targetKeys: ['target1'],
        timestamp: 1234567890,
      }
      expect(invalidTxKeys2).not.toHaveProperty('allKeys')
      
      // Wrong type for sourceKeys (should be string array)
      const invalidTxKeys3 = {
        sourceKeys: 'source1', // Should be string array
        targetKeys: ['target1'],
        allKeys: ['source1', 'target1'],
        timestamp: 1234567890,
      }
      expect(Array.isArray(invalidTxKeys3.sourceKeys)).toBe(false)
      
      // Function to validate TransactionKeys at runtime
      function isValidTransactionKeys(keys: any): boolean {
        return (
          keys &&
          typeof keys === 'object' &&
          Array.isArray(keys.sourceKeys) &&
          Array.isArray(keys.targetKeys) &&
          Array.isArray(keys.allKeys) &&
          typeof keys.timestamp === 'number'
        )
      }
      
      expect(isValidTransactionKeys(invalidTxKeys1)).toBe(false)
      expect(isValidTransactionKeys(invalidTxKeys2)).toBe(false)
      expect(isValidTransactionKeys(invalidTxKeys3)).toBe(false)
    })
  })

  // Test 26: Negative tests for WrappedData
  describe('WrappedData negative tests', () => {
    it('should detect invalid WrappedData objects at runtime', () => {
      // Missing required properties
      const invalidWrappedData1 = {}
      expect(invalidWrappedData1).not.toHaveProperty('accountId')
      expect(invalidWrappedData1).not.toHaveProperty('stateId')
      
      // Missing data property
      const invalidWrappedData2 = {
        accountId: 'account1',
        stateId: 'state1',
        timestamp: 1234567890,
      }
      expect(invalidWrappedData2).not.toHaveProperty('data')
      
      // Wrong type for timestamp (should be number)
      const invalidWrappedData3 = {
        accountId: 'account1',
        stateId: 'state1',
        data: { balance: 100 },
        timestamp: '1234567890' as any, // Should be number
      }
      expect(typeof invalidWrappedData3.timestamp).not.toBe('number')
      
      // Function to validate WrappedData at runtime
      function isValidWrappedData(data: any): boolean {
        return (
          data &&
          typeof data === 'object' &&
          typeof data.accountId === 'string' &&
          typeof data.stateId === 'string' &&
          typeof data.data === 'object' &&
          typeof data.timestamp === 'number'
        )
      }
      
      expect(isValidWrappedData(invalidWrappedData1)).toBe(false)
      expect(isValidWrappedData(invalidWrappedData2)).toBe(false)
      expect(isValidWrappedData(invalidWrappedData3)).toBe(false)
    })
  })

  // Test 27: Negative tests for ShardusEvent
  describe('ShardusEvent negative tests', () => {
    it('should detect ShardusEvent with invalid event type', () => {
      // Invalid event type
      const invalidEvent = {
        type: 'invalid-event-type', // Not a valid event type
        nodeId: 'node1',
        reason: 'test',
        time: 1234567890,
        publicKey: 'key1',
        cycleNumber: 5,
      }
      
      // Valid event types
      const validEventTypes = [
        'node-activated',
        'node-deactivated',
        'node-left-early',
        'node-refuted',
        'node-sync-timeout',
        'try-network-transaction',
      ]
      
      expect(validEventTypes).not.toContain(invalidEvent.type)
    })
    
    it('should detect ShardusEvent with missing required properties', () => {
      // Missing required properties
      const invalidEvent1 = {
        type: 'node-activated',
      }
      expect(invalidEvent1).not.toHaveProperty('nodeId')
      expect(invalidEvent1).not.toHaveProperty('reason')
      
      // Missing time property
      const invalidEvent2 = {
        type: 'node-activated',
        nodeId: 'node1',
        reason: 'joined',
        publicKey: 'key1',
        cycleNumber: 5,
      }
      expect(invalidEvent2).not.toHaveProperty('time')
      
      // Function to validate ShardusEvent at runtime
      function isValidShardusEvent(event: any): boolean {
        const validTypes = [
          'node-activated',
          'node-deactivated',
          'node-left-early',
          'node-refuted',
          'node-sync-timeout',
          'try-network-transaction',
        ]
        
        return (
          event &&
          typeof event === 'object' &&
          validTypes.includes(event.type) &&
          typeof event.nodeId === 'string' &&
          typeof event.reason === 'string' &&
          typeof event.time === 'number' &&
          typeof event.publicKey === 'string' &&
          typeof event.cycleNumber === 'number'
        )
      }
      
      expect(isValidShardusEvent(invalidEvent1)).toBe(false)
      expect(isValidShardusEvent(invalidEvent2)).toBe(false)
    })
  })

  // Test 28: Negative tests for ServerConfiguration
  describe('ServerConfiguration negative tests', () => {
    it('should detect invalid ServerConfiguration objects at runtime', () => {
      // Missing required properties
      const invalidConfig1 = {}
      expect(invalidConfig1).not.toHaveProperty('globalAccount')
      expect(invalidConfig1).not.toHaveProperty('nonceMode')
      
      // Missing nonceMode property
      const invalidConfig2 = {
        globalAccount: 'global1',
      }
      expect(invalidConfig2).not.toHaveProperty('nonceMode')
      
      // Wrong type for globalAccount (should be string)
      const invalidConfig3 = {
        globalAccount: 123, // Should be string
        nonceMode: true,
      }
      expect(typeof invalidConfig3.globalAccount).not.toBe('string')
      
      // Function to validate ServerConfiguration at runtime
      function isValidServerConfiguration(config: any): boolean {
        return (
          config &&
          typeof config === 'object' &&
          typeof config.globalAccount === 'string' &&
          typeof config.nonceMode === 'boolean'
        )
      }
      
      expect(isValidServerConfiguration(invalidConfig1)).toBe(false)
      expect(isValidServerConfiguration(invalidConfig2)).toBe(false)
      expect(isValidServerConfiguration(invalidConfig3)).toBe(false)
    })
  })

  // Test 29: Negative tests for ShardusMemoryPatternsInput
  describe('ShardusMemoryPatternsInput negative tests', () => {
    it('should detect invalid ShardusMemoryPatternsInput objects at runtime', () => {
      // Missing required properties
      const invalidPatterns1 = {}
      expect(invalidPatterns1).not.toHaveProperty('ro')
      expect(invalidPatterns1).not.toHaveProperty('rw')
      
      // Missing ri property
      const invalidPatterns2 = {
        ro: [],
        rw: [],
        wo: [],
        on: [],
      }
      expect(invalidPatterns2).not.toHaveProperty('ri')
      
      // Wrong type for ro (should be string array)
      const invalidPatterns3 = {
        ro: 'account1' as any, // Should be string array
        rw: [],
        wo: [],
        on: [],
        ri: [],
      }
      expect(Array.isArray(invalidPatterns3.ro)).toBe(false)
      
      // Function to validate ShardusMemoryPatternsInput at runtime
      function isValidShardusMemoryPatternsInput(patterns: any): boolean {
        return (
          patterns &&
          typeof patterns === 'object' &&
          Array.isArray(patterns.ro) &&
          Array.isArray(patterns.rw) &&
          Array.isArray(patterns.wo) &&
          Array.isArray(patterns.on) &&
          Array.isArray(patterns.ri)
        )
      }
      
      expect(isValidShardusMemoryPatternsInput(invalidPatterns1)).toBe(false)
      expect(isValidShardusMemoryPatternsInput(invalidPatterns2)).toBe(false)
      expect(isValidShardusMemoryPatternsInput(invalidPatterns3)).toBe(false)
    })
  })

  // Test 30: Negative tests for TimestampReceipt
  describe('TimestampReceipt negative tests', () => {
    it('should detect invalid TimestampReceipt objects at runtime', () => {
      // Missing required properties
      const invalidReceipt1 = {}
      expect(invalidReceipt1).not.toHaveProperty('txId')
      expect(invalidReceipt1).not.toHaveProperty('cycleMarker')
      
      // Missing timestamp property
      const invalidReceipt2 = {
        txId: 'tx123',
        cycleMarker: 'marker123',
        cycleCounter: 42,
      }
      expect(invalidReceipt2).not.toHaveProperty('timestamp')
      
      // Wrong type for cycleCounter (should be number)
      const invalidReceipt3 = {
        txId: 'tx123',
        cycleMarker: 'marker123',
        cycleCounter: '42' as any, // Should be number
        timestamp: 1234567890,
      }
      expect(typeof invalidReceipt3.cycleCounter).not.toBe('number')
      
      // Function to validate TimestampReceipt at runtime
      function isValidTimestampReceipt(receipt: any): boolean {
        return (
          receipt &&
          typeof receipt === 'object' &&
          typeof receipt.txId === 'string' &&
          typeof receipt.cycleMarker === 'string' &&
          typeof receipt.cycleCounter === 'number' &&
          typeof receipt.timestamp === 'number'
        )
      }
      
      expect(isValidTimestampReceipt(invalidReceipt1)).toBe(false)
      expect(isValidTimestampReceipt(invalidReceipt2)).toBe(false)
      expect(isValidTimestampReceipt(invalidReceipt3)).toBe(false)
    })
  })

  // Test 31: Negative tests for IncomingTransaction
  describe('IncomingTransaction negative tests', () => {
    it('should detect invalid IncomingTransaction objects at runtime', () => {
      // Missing required properties
      const invalidTx1 = {}
      expect(invalidTx1).not.toHaveProperty('srcAct')
      expect(invalidTx1).not.toHaveProperty('sign')
      
      // Missing sign property
      const invalidTx2 = {
        srcAct: 'account123',
        tgtAct: 'account456',
        tgtActs: 'account789',
        txnType: 'transfer',
        txnAmt: 100,
        seqNum: 42,
        txnTimestamp: '1234567890',
      }
      expect(invalidTx2).not.toHaveProperty('sign')
      
      // Wrong type for sign (should be Sign object)
      const invalidTx3 = {
        srcAct: 'account123',
        tgtAct: 'account456',
        tgtActs: 'account789',
        txnType: 'transfer',
        txnAmt: 100,
        seqNum: 42,
        sign: 'signature123' as any, // Should be Sign object
        txnTimestamp: '1234567890',
      }
      expect(typeof invalidTx3.sign).not.toBe('object')
      
      // Function to validate IncomingTransaction at runtime
      function isValidIncomingTransaction(tx: any): boolean {
        return (
          tx &&
          typeof tx === 'object' &&
          typeof tx.srcAct === 'string' &&
          typeof tx.sign === 'object' &&
          typeof tx.sign.owner === 'string' &&
          typeof tx.sign.sig === 'string'
        )
      }
      
      expect(isValidIncomingTransaction(invalidTx1)).toBe(false)
      expect(isValidIncomingTransaction(invalidTx2)).toBe(false)
      expect(isValidIncomingTransaction(invalidTx3)).toBe(false)
    })
  })

  // Test 32: Negative tests for Sign
  describe('Sign negative tests', () => {
    it('should detect invalid Sign objects at runtime', () => {
      // Missing required properties
      const invalidSign1 = {}
      expect(invalidSign1).not.toHaveProperty('owner')
      expect(invalidSign1).not.toHaveProperty('sig')
      
      // Missing sig property
      const invalidSign2 = {
        owner: 'owner123',
      }
      expect(invalidSign2).not.toHaveProperty('sig')
      
      // Wrong type for owner (should be string)
      const invalidSign3 = {
        owner: 123, // Should be string
        sig: 'signature123',
      }
      expect(typeof invalidSign3.owner).not.toBe('string')
      
      // Function to validate Sign at runtime
      function isValidSign(sign: any): boolean {
        return (
          sign &&
          typeof sign === 'object' &&
          typeof sign.owner === 'string' &&
          typeof sign.sig === 'string'
        )
      }
      
      expect(isValidSign(invalidSign1)).toBe(false)
      expect(isValidSign(invalidSign2)).toBe(false)
      expect(isValidSign(invalidSign3)).toBe(false)
    })
  })

  // Test 33: Negative tests for ValidatorNodeDetails
  describe('ValidatorNodeDetails negative tests', () => {
    it('should detect invalid ValidatorNodeDetails objects at runtime', () => {
      // Missing required properties
      const invalidValidator1 = {}
      expect(invalidValidator1).not.toHaveProperty('ip')
      expect(invalidValidator1).not.toHaveProperty('port')
      
      // Missing publicKey property
      const invalidValidator2 = {
        ip: '192.168.1.1',
        port: 9001,
      }
      expect(invalidValidator2).not.toHaveProperty('publicKey')
      
      // Wrong type for port (should be number)
      const invalidValidator3 = {
        ip: '192.168.1.1',
        port: '9001' as any, // Should be number
        publicKey: 'pubKey123',
      }
      expect(typeof invalidValidator3.port).not.toBe('number')
      
      // Function to validate ValidatorNodeDetails at runtime
      function isValidValidatorNodeDetails(validator: any): boolean {
        return (
          validator &&
          typeof validator === 'object' &&
          typeof validator.ip === 'string' &&
          typeof validator.port === 'number' &&
          typeof validator.publicKey === 'string'
        )
      }
      
      expect(isValidValidatorNodeDetails(invalidValidator1)).toBe(false)
      expect(isValidValidatorNodeDetails(invalidValidator2)).toBe(false)
      expect(isValidValidatorNodeDetails(invalidValidator3)).toBe(false)
    })
  })

  // Test 34: Negative tests for DeepRequired
  describe('DeepRequired negative tests', () => {
    it('should detect objects missing required properties after applying DeepRequired', () => {
      // Define a type with optional properties
      type TestType = {
        a?: string
        b?: {
          c?: number
        }
      }
      
      // Create invalid objects that wouldn't satisfy DeepRequired<TestType>
      const invalidObj1 = {}
      expect(invalidObj1).not.toHaveProperty('a')
      expect(invalidObj1).not.toHaveProperty('b')
      
      const invalidObj2 = {
        a: 'test',
        b: {},
      }
      expect(invalidObj2.b).not.toHaveProperty('c')
      
      const invalidObj3 = {
        a: 123, // Should be string
        b: {
          c: 42,
        },
      }
      expect(typeof invalidObj3.a).not.toBe('string')
      
      // Function to validate DeepRequired<TestType> at runtime
      function isValidDeepRequiredTestType(obj: any): boolean {
        return (
          obj &&
          typeof obj === 'object' &&
          typeof obj.a === 'string' &&
          typeof obj.b === 'object' &&
          typeof obj.b.c === 'number'
        )
      }
      
      expect(isValidDeepRequiredTestType(invalidObj1)).toBe(false)
      expect(isValidDeepRequiredTestType(invalidObj2)).toBe(false)
      expect(isValidDeepRequiredTestType(invalidObj3)).toBe(false)
    })
  })

  // Test 35: Negative tests for Enum values
  describe('Enum negative tests', () => {
    it('should detect invalid ServerMode values', () => {
      // Invalid ServerMode value
      const invalidMode = 'invalid-mode'
      expect(Object.values(ServerMode)).not.toContain(invalidMode)
      
      // Invalid ServerMode value (using number)
      const invalidModeNumber = 123
      expect(Object.values(ServerMode)).not.toContain(invalidModeNumber)
    })
    
    it('should detect invalid DevSecurityLevel values', () => {
      // Invalid DevSecurityLevel value
      const invalidLevel = 5
      expect(Object.values(DevSecurityLevel).filter(v => typeof v === 'number')).not.toContain(invalidLevel)
      
      // Invalid DevSecurityLevel value (using string)
      const invalidLevelString = 'high'
      expect(Object.values(DevSecurityLevel).filter(v => typeof v === 'number')).not.toContain(invalidLevelString)
    })
  })

  // Test 36: Negative tests for App interface implementation
  describe('App interface negative implementation tests', () => {
    it('should detect incomplete App implementations', () => {
      // Create a minimal class that doesn't fully implement App
      class IncompleteApp {
        // Only implementing one method
        injectTxToConsensor() {
          return Promise.resolve({ success: true })
        }
      }
      
      // Create an instance and verify it's missing methods
      const app = new IncompleteApp()
      expect(app).toHaveProperty('injectTxToConsensor')
      expect(app).not.toHaveProperty('getNonceFromTx')
      expect(app).not.toHaveProperty('validate')
      expect(app).not.toHaveProperty('apply')
      
      // Function to check if an object implements App interface
      function implementsAppInterface(obj: any): boolean {
        const requiredMethods = [
          'injectTxToConsensor',
          'getNonceFromTx',
          'getAccountNonce',
          'getTxSenderAddress',
          'validate',
          'isInternalTx',
          'crack',
          'txPreCrackData',
          'apply',
          'updateAccountFull',
          'updateAccountPartial',
          'getRelevantData',
          'getTimestampFromTransaction',
          'calculateTxId',
          'close',
          'getAccountData',
          'getAccountDataByRange',
          'calculateAccountHash',
          'setAccountData',
          'resetAccountData',
          'deleteAccountData',
          'getAccountDataByList',
          'getCachedRIAccountData',
          'setCachedRIAccountData',
          'getNetworkAccount',
          'deleteLocalAccountData',
          'getAccountDebugValue',
          'isReadyToJoin',
          'isNGT',
          'binarySerializeObject',
          'binaryDeserializeObject',
          'verifyMultiSigs',
          'canStayOnStandby',
        ]
        
        return requiredMethods.every(method => typeof obj[method] === 'function')
      }
      
      expect(implementsAppInterface(app)).toBe(false)
    })
  })

  // Test 37: Negative tests for ApplyResponse
  describe('ApplyResponse negative tests', () => {
    it('should detect invalid ApplyResponse objects at runtime', () => {
      // Missing required properties
      const invalidResponse1 = {}
      expect(invalidResponse1).not.toHaveProperty('stateTableResults')
      expect(invalidResponse1).not.toHaveProperty('txId')
      
      // Missing appReceiptDataHash property
      const invalidResponse2 = {
        stateTableResults: [],
        txId: 'tx123',
        txTimestamp: 1234567890,
        accountData: [],
        accountWrites: [],
        appDefinedData: {},
        failed: false,
        failMessage: '',
        appReceiptData: {},
      }
      expect(invalidResponse2).not.toHaveProperty('appReceiptDataHash')
      
      // Wrong type for failed (should be boolean)
      const invalidResponse3 = {
        stateTableResults: [],
        txId: 'tx123',
        txTimestamp: 1234567890,
        accountData: [],
        accountWrites: [],
        appDefinedData: {},
        failed: 'false' as any, // Should be boolean
        failMessage: '',
        appReceiptData: {},
        appReceiptDataHash: 'hash123',
      }
      expect(typeof invalidResponse3.failed).not.toBe('boolean')
      
      // Function to validate ApplyResponse at runtime
      function isValidApplyResponse(response: any): boolean {
        return (
          response &&
          typeof response === 'object' &&
          Array.isArray(response.stateTableResults) &&
          typeof response.txId === 'string' &&
          typeof response.txTimestamp === 'number' &&
          Array.isArray(response.accountData) &&
          Array.isArray(response.accountWrites) &&
          typeof response.appDefinedData === 'object' &&
          typeof response.failed === 'boolean' &&
          typeof response.failMessage === 'string' &&
          typeof response.appReceiptData === 'object' &&
          typeof response.appReceiptDataHash === 'string'
        )
      }
      
      expect(isValidApplyResponse(invalidResponse1)).toBe(false)
      expect(isValidApplyResponse(invalidResponse2)).toBe(false)
      expect(isValidApplyResponse(invalidResponse3)).toBe(false)
    })
  })
})
