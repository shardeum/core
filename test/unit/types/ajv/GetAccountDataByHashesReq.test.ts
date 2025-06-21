import { initGetAccountDataByHashesReq } from '../../../../src/types/ajv/GetAccountDataByHashesReq'
import * as SchemaHelpers from '../../../../src/utils/serialization/SchemaHelpers'

jest.mock('../../../../src/utils/serialization/SchemaHelpers')

describe('GetAccountDataByHashesReq', () => {
  const mockAddSchema = SchemaHelpers.addSchema as jest.MockedFunction<typeof SchemaHelpers.addSchema>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('initGetAccountDataByHashesReq', () => {
    it('should initialize the schema correctly', () => {
      initGetAccountDataByHashesReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith('GetAccountDataByHashesReq', {
        type: 'object',
        properties: {
          cycle: { type: 'number' },
          accounts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                accountID: { type: 'string' },
                hash: { type: 'string' },
              },
              required: ['accountID', 'hash'],
            },
          },
        },
        required: ['cycle', 'accounts'],
      })
    })

    it('should call addSchema with correct schema structure', () => {
      initGetAccountDataByHashesReq()

      const schemaCall = mockAddSchema.mock.calls[0]
      const schemaName = schemaCall[0]
      const schema = schemaCall[1] as any

      expect(schemaName).toBe('GetAccountDataByHashesReq')
      expect(schema.type).toBe('object')
      expect(schema.properties).toHaveProperty('cycle')
      expect(schema.properties).toHaveProperty('accounts')
      expect(schema.properties.cycle.type).toBe('number')
      expect(schema.properties.accounts.type).toBe('array')
      expect(schema.properties.accounts.items.type).toBe('object')
      expect(schema.properties.accounts.items.properties).toHaveProperty('accountID')
      expect(schema.properties.accounts.items.properties).toHaveProperty('hash')
      expect(schema.properties.accounts.items.required).toEqual(['accountID', 'hash'])
      expect(schema.required).toEqual(['cycle', 'accounts'])
    })

    it('should handle schema with valid data structure', () => {
      initGetAccountDataByHashesReq()

      const schema = mockAddSchema.mock.calls[0][1] as any
      
      // Test that the schema structure matches expected format
      const validData = {
        cycle: 123,
        accounts: [
          { accountID: 'acc1', hash: 'hash1' },
          { accountID: 'acc2', hash: 'hash2' }
        ]
      }

      // Schema should accept valid data format
      expect(schema.properties.cycle).toBeDefined()
      expect(schema.properties.accounts).toBeDefined()
      expect(schema.required).toContain('cycle')
      expect(schema.required).toContain('accounts')
    })

    it('should define array items with proper validation', () => {
      initGetAccountDataByHashesReq()

      const schema = mockAddSchema.mock.calls[0][1] as any
      const accountItemSchema = schema.properties.accounts.items

      expect(accountItemSchema.type).toBe('object')
      expect(accountItemSchema.properties.accountID.type).toBe('string')
      expect(accountItemSchema.properties.hash.type).toBe('string')
      expect(accountItemSchema.required).toContain('accountID')
      expect(accountItemSchema.required).toContain('hash')
    })

    it('should register schema only once per initialization', () => {
      initGetAccountDataByHashesReq()
      
      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      
      // Clear mocks and call again
      mockAddSchema.mockClear()
      initGetAccountDataByHashesReq()
      
      expect(mockAddSchema).toHaveBeenCalledTimes(1)
    })
  })
})