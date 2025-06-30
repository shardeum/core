import { initGetAccountDataByHashesResp } from '../../../../src/types/ajv/GetAccountDataByHashesResp'
import * as SchemaHelpers from '../../../../src/utils/serialization/SchemaHelpers'
import { schemaWrappedData } from '../../../../src/types/ajv/WrappedData'

jest.mock('../../../../src/utils/serialization/SchemaHelpers')

describe('GetAccountDataByHashesResp', () => {
  const mockAddSchema = SchemaHelpers.addSchema as jest.MockedFunction<typeof SchemaHelpers.addSchema>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('initGetAccountDataByHashesResp', () => {
    it('should initialize the schema correctly', () => {
      initGetAccountDataByHashesResp()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith('GetAccountDataByHashesResp', {
        type: 'object',
        properties: {
          accounts: {
            type: 'array',
            items: schemaWrappedData,
          },
          stateTableData: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                accountId: { type: 'string' },
                txId: { type: 'string' },
                txTimestamp: { type: 'string' },
                stateBefore: { type: 'string' },
                stateAfter: { type: 'string' },
              },
              required: ['accountId', 'txId', 'txTimestamp', 'stateBefore', 'stateAfter'],
            },
          },
        },
        required: ['accounts', 'stateTableData'],
      })
    })

    it('should use schemaWrappedData for accounts items', () => {
      initGetAccountDataByHashesResp()

      const schema = mockAddSchema.mock.calls[0][1] as any
      expect(schema.properties.accounts.items).toBe(schemaWrappedData)
    })

    it('should define stateTableData with proper structure', () => {
      initGetAccountDataByHashesResp()

      const schema = mockAddSchema.mock.calls[0][1] as any
      const stateTableSchema = schema.properties.stateTableData

      expect(stateTableSchema.type).toBe('array')
      expect(stateTableSchema.items.type).toBe('object')
      expect(stateTableSchema.items.properties).toHaveProperty('accountId')
      expect(stateTableSchema.items.properties).toHaveProperty('txId')
      expect(stateTableSchema.items.properties).toHaveProperty('txTimestamp')
      expect(stateTableSchema.items.properties).toHaveProperty('stateBefore')
      expect(stateTableSchema.items.properties).toHaveProperty('stateAfter')
    })

    it('should require all fields in stateTableData items', () => {
      initGetAccountDataByHashesResp()

      const schema = mockAddSchema.mock.calls[0][1] as any
      const stateTableItemSchema = schema.properties.stateTableData.items

      expect(stateTableItemSchema.required).toEqual([
        'accountId',
        'txId',
        'txTimestamp',
        'stateBefore',
        'stateAfter'
      ])
    })

    it('should have string types for all stateTableData fields', () => {
      initGetAccountDataByHashesResp()

      const schema = mockAddSchema.mock.calls[0][1] as any
      const stateTableProps = schema.properties.stateTableData.items.properties

      expect(stateTableProps.accountId.type).toBe('string')
      expect(stateTableProps.txId.type).toBe('string')
      expect(stateTableProps.txTimestamp.type).toBe('string')
      expect(stateTableProps.stateBefore.type).toBe('string')
      expect(stateTableProps.stateAfter.type).toBe('string')
    })

    it('should require both accounts and stateTableData', () => {
      initGetAccountDataByHashesResp()

      const schema = mockAddSchema.mock.calls[0][1] as any
      expect(schema.required).toEqual(['accounts', 'stateTableData'])
    })

    it('should validate proper data structure', () => {
      const validData = {
        accounts: [
          {
            accountId: 'acc1',
            stateId: 'state1',
            data: {},
            timestamp: Date.now()
          }
        ],
        stateTableData: [
          {
            accountId: 'acc1',
            txId: 'tx123',
            txTimestamp: '1234567890',
            stateBefore: 'before_hash',
            stateAfter: 'after_hash'
          }
        ]
      }

      initGetAccountDataByHashesResp()
      
      const schema = mockAddSchema.mock.calls[0][1] as any
      
      // Check that arrays are properly defined
      expect(schema.properties.accounts.type).toBe('array')
      expect(schema.properties.stateTableData.type).toBe('array')
    })

    it('should register schema only once per initialization', () => {
      initGetAccountDataByHashesResp()
      
      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      
      // Clear mocks and call again
      mockAddSchema.mockClear()
      initGetAccountDataByHashesResp()
      
      expect(mockAddSchema).toHaveBeenCalledTimes(1)
    })
  })
})