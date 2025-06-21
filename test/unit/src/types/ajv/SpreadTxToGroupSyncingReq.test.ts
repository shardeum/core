import {
  schemaSpreadTxToGroupSyncingReq,
  schemaTransactionKeys,
  schemaOpaqueTransaction,
  schemaShardusMemoryPatternsInput,
  initSpreadTxToGroupSyncingReq,
  addSchemaDependencies,
  addSchemas,
} from '@src/types/ajv/SpreadTxToGroupSyncingReq'
import { addSchema, addSchemaDependency } from '@src/utils/serialization/SchemaHelpers'

jest.mock('@src/utils/serialization/SchemaHelpers')

describe('SpreadTxToGroupSyncingReq', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schema definitions', () => {
    it('should define schemaSpreadTxToGroupSyncingReq correctly', () => {
      expect(schemaSpreadTxToGroupSyncingReq).toEqual({
        type: 'object',
        properties: {
          timestamp: { type: 'number' },
          txId: { type: 'string' },
          keys: { $ref: 'TransactionKeys' },
          data: { $ref: 'OpaqueTransaction' },
          appData: { type: 'unknown' },
          shardusMemoryPatterns: { $ref: 'ShardusMemoryPatternsInput' },
        },
        required: ['timestamp', 'txId', 'keys', 'data', 'appData', 'shardusMemoryPatterns'],
      })
    })

    it('should define schemaTransactionKeys correctly', () => {
      expect(schemaTransactionKeys).toEqual({
        type: 'object',
        properties: {
          sourceKeys: { type: 'array', items: { type: 'string' } },
          targetKeys: { type: 'array', items: { type: 'string' } },
          allKeys: { type: 'array', items: { type: 'string' } },
          timestamp: { type: 'number' },
          debugInfo: { type: 'string' },
        },
        required: ['sourceKeys', 'targetKeys', 'allKeys', 'timestamp'],
      })
    })

    it('should define schemaOpaqueTransaction correctly', () => {
      expect(schemaOpaqueTransaction).toEqual({
        type: 'object',
      })
    })

    it('should define schemaShardusMemoryPatternsInput correctly', () => {
      expect(schemaShardusMemoryPatternsInput).toEqual({
        type: 'object',
        properties: {
          ro: { type: 'array', items: { type: 'string' } },
          rw: { type: 'array', items: { type: 'string' } },
          wo: { type: 'array', items: { type: 'string' } },
          on: { type: 'array', items: { type: 'string' } },
          ri: { type: 'array', items: { type: 'string' } },
        },
        required: ['ro', 'rw', 'wo', 'on', 'ri'],
      })
    })
  })

  describe('initSpreadTxToGroupSyncingReq', () => {
    it('should call addSchemaDependencies and addSchemas', () => {
      initSpreadTxToGroupSyncingReq()

      // Verify that both functions were called by checking the mock calls
      expect(addSchemaDependency).toHaveBeenCalledWith('TransactionKeys', 'SpreadTxToGroupSyncingReq')
      expect(addSchemaDependency).toHaveBeenCalledWith('OpaqueTransaction', 'SpreadTxToGroupSyncingReq')
      expect(addSchemaDependency).toHaveBeenCalledWith('ShardusMemoryPatternsInput', 'SpreadTxToGroupSyncingReq')

      expect(addSchema).toHaveBeenCalledWith('TransactionKeys', schemaTransactionKeys)
      expect(addSchema).toHaveBeenCalledWith('OpaqueTransaction', schemaOpaqueTransaction)
      expect(addSchema).toHaveBeenCalledWith('ShardusMemoryPatternsInput', schemaShardusMemoryPatternsInput)
      expect(addSchema).toHaveBeenCalledWith('SpreadTxToGroupSyncingReq', schemaSpreadTxToGroupSyncingReq)
    })
  })

  describe('addSchemaDependencies', () => {
    it('should add all required schema dependencies', () => {
      addSchemaDependencies()

      expect(addSchemaDependency).toHaveBeenCalledTimes(3)
      expect(addSchemaDependency).toHaveBeenCalledWith('TransactionKeys', 'SpreadTxToGroupSyncingReq')
      expect(addSchemaDependency).toHaveBeenCalledWith('OpaqueTransaction', 'SpreadTxToGroupSyncingReq')
      expect(addSchemaDependency).toHaveBeenCalledWith('ShardusMemoryPatternsInput', 'SpreadTxToGroupSyncingReq')
    })

    it('should add dependencies in correct order', () => {
      addSchemaDependencies()

      const calls = (addSchemaDependency as jest.Mock).mock.calls
      expect(calls[0]).toEqual(['TransactionKeys', 'SpreadTxToGroupSyncingReq'])
      expect(calls[1]).toEqual(['OpaqueTransaction', 'SpreadTxToGroupSyncingReq'])
      expect(calls[2]).toEqual(['ShardusMemoryPatternsInput', 'SpreadTxToGroupSyncingReq'])
    })
  })

  describe('addSchemas', () => {
    it('should add all schema definitions', () => {
      addSchemas()

      expect(addSchema).toHaveBeenCalledTimes(4)
      expect(addSchema).toHaveBeenCalledWith('TransactionKeys', schemaTransactionKeys)
      expect(addSchema).toHaveBeenCalledWith('OpaqueTransaction', schemaOpaqueTransaction)
      expect(addSchema).toHaveBeenCalledWith('ShardusMemoryPatternsInput', schemaShardusMemoryPatternsInput)
      expect(addSchema).toHaveBeenCalledWith('SpreadTxToGroupSyncingReq', schemaSpreadTxToGroupSyncingReq)
    })

    it('should add schemas in correct order', () => {
      addSchemas()

      const calls = (addSchema as jest.Mock).mock.calls
      expect(calls[0]).toEqual(['TransactionKeys', schemaTransactionKeys])
      expect(calls[1]).toEqual(['OpaqueTransaction', schemaOpaqueTransaction])
      expect(calls[2]).toEqual(['ShardusMemoryPatternsInput', schemaShardusMemoryPatternsInput])
      expect(calls[3]).toEqual(['SpreadTxToGroupSyncingReq', schemaSpreadTxToGroupSyncingReq])
    })
  })

  describe('schema validation', () => {
    it('should have correct required fields for SpreadTxToGroupSyncingReq', () => {
      expect(schemaSpreadTxToGroupSyncingReq.required).toEqual([
        'timestamp',
        'txId',
        'keys',
        'data',
        'appData',
        'shardusMemoryPatterns',
      ])
    })

    it('should have correct required fields for TransactionKeys', () => {
      expect(schemaTransactionKeys.required).toEqual(['sourceKeys', 'targetKeys', 'allKeys', 'timestamp'])
    })

    it('should have correct required fields for ShardusMemoryPatternsInput', () => {
      expect(schemaShardusMemoryPatternsInput.required).toEqual(['ro', 'rw', 'wo', 'on', 'ri'])
    })

    it('should use correct $ref for nested schemas', () => {
      expect(schemaSpreadTxToGroupSyncingReq.properties.keys).toEqual({ $ref: 'TransactionKeys' })
      expect(schemaSpreadTxToGroupSyncingReq.properties.data).toEqual({ $ref: 'OpaqueTransaction' })
      expect(schemaSpreadTxToGroupSyncingReq.properties.shardusMemoryPatterns).toEqual({
        $ref: 'ShardusMemoryPatternsInput',
      })
    })

    it('should define array properties correctly', () => {
      const transactionKeysProps = schemaTransactionKeys.properties
      expect(transactionKeysProps.sourceKeys).toEqual({ type: 'array', items: { type: 'string' } })
      expect(transactionKeysProps.targetKeys).toEqual({ type: 'array', items: { type: 'string' } })
      expect(transactionKeysProps.allKeys).toEqual({ type: 'array', items: { type: 'string' } })

      const memoryPatternsProps = schemaShardusMemoryPatternsInput.properties
      expect(memoryPatternsProps.ro).toEqual({ type: 'array', items: { type: 'string' } })
      expect(memoryPatternsProps.rw).toEqual({ type: 'array', items: { type: 'string' } })
      expect(memoryPatternsProps.wo).toEqual({ type: 'array', items: { type: 'string' } })
      expect(memoryPatternsProps.on).toEqual({ type: 'array', items: { type: 'string' } })
      expect(memoryPatternsProps.ri).toEqual({ type: 'array', items: { type: 'string' } })
    })

    it('should include optional properties in TransactionKeys', () => {
      expect(schemaTransactionKeys.properties).toHaveProperty('debugInfo')
      expect(schemaTransactionKeys.properties.debugInfo).toEqual({ type: 'string' })
      expect(schemaTransactionKeys.required).not.toContain('debugInfo')
    })

    it('should define appData as unknown type', () => {
      expect(schemaSpreadTxToGroupSyncingReq.properties.appData).toEqual({ type: 'unknown' })
    })
  })
})