import { schemaGetAppliedVoteReq, initGetAppliedVoteReq } from '../../../../src/types/ajv/GetAppliedVoteReq'
import { addSchema } from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'
import Ajv from 'ajv'

// Mock the SchemaHelpers module
jest.mock('../../../../src/utils/serialization/SchemaHelpers')

describe('GetAppliedVoteReq', () => {
  let mockAddSchema: jest.Mock

  beforeEach(() => {
    mockAddSchema = addSchema as jest.Mock
    jest.clearAllMocks()
  })

  describe('schemaGetAppliedVoteReq', () => {
    it('should have correct schema structure', () => {
      expect(schemaGetAppliedVoteReq).toEqual({
        type: 'object',
        properties: {
          txId: { type: 'string' },
        },
        required: ['txId'],
      })
    })

    it('should validate valid objects', () => {
      const ajv = new Ajv()
      const validate = ajv.compile(schemaGetAppliedVoteReq)

      const validObjects = [
        { txId: 'abc123' },
        { txId: '' }, // Empty string is still valid
        { txId: 'very-long-transaction-id-with-special-chars-!@#$%' },
        { txId: '0x1234567890abcdef' },
      ]

      validObjects.forEach(obj => {
        expect(validate(obj)).toBe(true)
        expect(validate.errors).toBeNull()
      })
    })

    it('should reject invalid objects', () => {
      const ajv = new Ajv()
      const validate = ajv.compile(schemaGetAppliedVoteReq)

      const invalidObjects = [
        {}, // Missing required txId
        { txId: null }, // null is not a string
        { txId: 123 }, // number is not a string
        { txId: true }, // boolean is not a string
        { txId: [] }, // array is not a string
        { txId: {} }, // object is not a string
        { notTxId: 'abc123' }, // wrong property name
        null, // null object
        undefined, // undefined object
        'string', // not an object
        123, // not an object
      ]

      invalidObjects.forEach(obj => {
        expect(validate(obj)).toBe(false)
        expect(validate.errors).not.toBeNull()
      })
    })

    it('should allow additional properties by default', () => {
      const ajv = new Ajv()
      const validate = ajv.compile(schemaGetAppliedVoteReq)

      const objWithExtra = { 
        txId: 'abc123',
        extraField: 'extra value',
        anotherField: 123 
      }

      expect(validate(objWithExtra)).toBe(true)
    })

    it('should handle unicode in txId', () => {
      const ajv = new Ajv()
      const validate = ajv.compile(schemaGetAppliedVoteReq)

      const unicodeObjects = [
        { txId: '🚀✨💎' },
        { txId: '中文字符' },
        { txId: 'مرحبا' },
        { txId: 'Здравствуйте' },
      ]

      unicodeObjects.forEach(obj => {
        expect(validate(obj)).toBe(true)
      })
    })
  })

  describe('initGetAppliedVoteReq', () => {
    it('should add schema with correct enum key', () => {
      initGetAppliedVoteReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(
        AJVSchemaEnum.GetAppliedVoteReq,
        schemaGetAppliedVoteReq
      )
    })

    it('should be idempotent (callable multiple times)', () => {
      initGetAppliedVoteReq()
      initGetAppliedVoteReq()
      initGetAppliedVoteReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(3)
      expect(mockAddSchema).toHaveBeenCalledWith(
        AJVSchemaEnum.GetAppliedVoteReq,
        schemaGetAppliedVoteReq
      )
    })
  })

  describe('schema validation edge cases', () => {
    it('should validate objects with prototype chain', () => {
      const ajv = new Ajv()
      const validate = ajv.compile(schemaGetAppliedVoteReq)

      class CustomRequest {
        txId: string
        constructor(txId: string) {
          this.txId = txId
        }
      }

      const customObj = new CustomRequest('test-123')
      expect(validate(customObj)).toBe(true)
    })

    it('should handle very long txId strings', () => {
      const ajv = new Ajv()
      const validate = ajv.compile(schemaGetAppliedVoteReq)

      const longId = 'a'.repeat(10000)
      expect(validate({ txId: longId })).toBe(true)
    })

    it('should handle txId with newlines and special characters', () => {
      const ajv = new Ajv()
      const validate = ajv.compile(schemaGetAppliedVoteReq)

      const specialIds = [
        { txId: 'line1\nline2' },
        { txId: 'tab\there' },
        { txId: 'quotes"and\'apostrophes' },
        { txId: 'backslash\\forward/' },
        { txId: '\u0000\u0001\u0002' }, // control characters
      ]

      specialIds.forEach(obj => {
        expect(validate(obj)).toBe(true)
      })
    })
  })

  describe('type exports', () => {
    it('should export all required functions', () => {
      expect(schemaGetAppliedVoteReq).toBeDefined()
      expect(initGetAppliedVoteReq).toBeDefined()
      expect(typeof initGetAppliedVoteReq).toBe('function')
    })

    it('should export schema as a plain object', () => {
      // Verify the schema is a plain object (not a class instance or function)
      expect(schemaGetAppliedVoteReq).toEqual(expect.any(Object))
      expect(schemaGetAppliedVoteReq.constructor).toBe(Object)
      
      // Verify it has the expected properties
      expect(schemaGetAppliedVoteReq).toHaveProperty('type', 'object')
      expect(schemaGetAppliedVoteReq).toHaveProperty('properties')
      expect(schemaGetAppliedVoteReq).toHaveProperty('required')
    })
  })
})