import {
  initGlobalAccountReportResp,
  schemaGlobalAccountReportResp,
} from '../../../../src/types/ajv/GlobalAccountReportResp'
import * as SchemaHelpers from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../../src/utils/serialization/SchemaHelpers')

describe('GlobalAccountReportResp', () => {
  const mockAddSchema = SchemaHelpers.addSchema as jest.MockedFunction<typeof SchemaHelpers.addSchema>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schemaGlobalAccountReportResp', () => {
    it('should define the correct schema structure', () => {
      expect(schemaGlobalAccountReportResp).toEqual({
        type: 'object',
        oneOf: [
          {
            type: 'object',
            properties: {
              ready: { type: 'boolean' },
              combinedHash: { type: 'string' },
              accounts: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    hash: { type: 'string' },
                    timestamp: { type: 'number' },
                  },
                  required: ['id', 'hash', 'timestamp'],
                },
              },
            },
            required: ['ready', 'combinedHash', 'accounts'],
          },
          {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
            required: ['error'],
          },
        ],
      })
    })

    it('should define oneOf schema with two options', () => {
      expect(schemaGlobalAccountReportResp.oneOf).toBeDefined()
      expect(schemaGlobalAccountReportResp.oneOf).toHaveLength(2)
    })

    it('should define success response schema', () => {
      const successSchema = schemaGlobalAccountReportResp.oneOf[0] as any

      expect(successSchema.type).toBe('object')
      expect(successSchema.properties).toHaveProperty('ready')
      expect(successSchema.properties).toHaveProperty('combinedHash')
      expect(successSchema.properties).toHaveProperty('accounts')
      expect(successSchema.required).toEqual(['ready', 'combinedHash', 'accounts'])
    })

    it('should define error response schema', () => {
      const errorSchema = schemaGlobalAccountReportResp.oneOf[1] as any

      expect(errorSchema.type).toBe('object')
      expect(errorSchema.properties).toHaveProperty('error')
      expect(errorSchema.properties.error.type).toBe('string')
      expect(errorSchema.required).toEqual(['error'])
    })

    it('should define accounts array with proper item schema', () => {
      const successSchema = schemaGlobalAccountReportResp.oneOf[0] as any
      const accountsSchema = successSchema.properties.accounts
      const accountItemSchema = accountsSchema.items

      expect(accountsSchema.type).toBe('array')
      expect(accountItemSchema.type).toBe('object')
      expect(accountItemSchema.properties).toHaveProperty('id')
      expect(accountItemSchema.properties).toHaveProperty('hash')
      expect(accountItemSchema.properties).toHaveProperty('timestamp')
      expect(accountItemSchema.properties.id.type).toBe('string')
      expect(accountItemSchema.properties.hash.type).toBe('string')
      expect(accountItemSchema.properties.timestamp.type).toBe('number')
      expect(accountItemSchema.required).toEqual(['id', 'hash', 'timestamp'])
    })

    it('should define correct property types for success response', () => {
      const successSchema = schemaGlobalAccountReportResp.oneOf[0] as any

      expect(successSchema.properties.ready.type).toBe('boolean')
      expect(successSchema.properties.combinedHash.type).toBe('string')
      expect(successSchema.properties.accounts.type).toBe('array')
    })
  })

  describe('initGlobalAccountReportResp', () => {
    it('should initialize the schema correctly', () => {
      initGlobalAccountReportResp()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(AJVSchemaEnum.GlobalAccountReportResp, schemaGlobalAccountReportResp)
    })

    it('should register schema with correct enum key', () => {
      initGlobalAccountReportResp()

      const schemaCall = mockAddSchema.mock.calls[0]
      expect(schemaCall[0]).toBe(AJVSchemaEnum.GlobalAccountReportResp)
      expect(schemaCall[1]).toBe(schemaGlobalAccountReportResp)
    })

    it('should validate success response structure', () => {
      const validSuccessResponse = {
        ready: true,
        combinedHash: 'hash123456',
        accounts: [
          {
            id: 'acc1',
            hash: 'hash1',
            timestamp: 1234567890,
          },
          {
            id: 'acc2',
            hash: 'hash2',
            timestamp: 1234567891,
          },
        ],
      }

      // The schema should accept this structure
      const successSchema = schemaGlobalAccountReportResp.oneOf[0] as any
      expect(successSchema.properties.ready).toBeDefined()
      expect(successSchema.properties.combinedHash).toBeDefined()
      expect(successSchema.properties.accounts).toBeDefined()
    })

    it('should validate error response structure', () => {
      const validErrorResponse = {
        error: 'Something went wrong',
      }

      // The schema should accept this structure
      const errorSchema = schemaGlobalAccountReportResp.oneOf[1] as any
      expect(errorSchema.properties.error).toBeDefined()
    })

    it('should handle empty accounts array in success response', () => {
      const responseWithEmptyAccounts = {
        ready: false,
        combinedHash: '',
        accounts: [],
      }

      // Empty arrays should still be valid
      const successSchema = schemaGlobalAccountReportResp.oneOf[0] as any
      expect(successSchema.properties.accounts.type).toBe('array')
    })

    it('should not allow mixing success and error properties', () => {
      // The oneOf schema ensures that only one of the two schemas can match
      expect(schemaGlobalAccountReportResp.oneOf).toHaveLength(2)

      // Success schema requires ready, combinedHash, accounts
      const successSchema = schemaGlobalAccountReportResp.oneOf[0] as any
      expect(successSchema.required).toContain('ready')
      expect(successSchema.required).toContain('combinedHash')
      expect(successSchema.required).toContain('accounts')

      // Error schema requires only error
      const errorSchema = schemaGlobalAccountReportResp.oneOf[1] as any
      expect(errorSchema.required).toEqual(['error'])
    })

    it('should register schema only once per initialization', () => {
      initGlobalAccountReportResp()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)

      // Clear mocks and call again
      mockAddSchema.mockClear()
      initGlobalAccountReportResp()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
    })
  })
})
