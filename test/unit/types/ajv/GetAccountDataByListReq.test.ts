import { initGetAccountDataByListReq } from '../../../../src/types/ajv/GetAccountDataByListReq'
import { addSchema } from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'
import Ajv from 'ajv'

// Mock the SchemaHelpers module
jest.mock('../../../../src/utils/serialization/SchemaHelpers')

describe('GetAccountDataByListReq', () => {
  let mockAddSchema: jest.Mock

  beforeEach(() => {
    mockAddSchema = addSchema as jest.Mock
    jest.clearAllMocks()
  })

  describe('schema validation', () => {
    // Since the schema is not exported, we'll test it through the addSchema mock
    let capturedSchema: any

    beforeEach(() => {
      mockAddSchema.mockImplementation((enumValue, schema) => {
        if (enumValue === AJVSchemaEnum.GetAccountDataByListReq) {
          capturedSchema = schema
        }
      })
      initGetAccountDataByListReq()
    })

    it('should have correct schema structure', () => {
      expect(capturedSchema).toEqual({
        type: 'object',
        properties: {
          accountIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['accountIds'],
      })
    })

    it('should validate valid objects', () => {
      const ajv = new Ajv()
      const validate = ajv.compile(capturedSchema)

      const validObjects = [
        { accountIds: [] }, // Empty array is valid
        { accountIds: ['account1'] },
        { accountIds: ['account1', 'account2', 'account3'] },
        { accountIds: [''] }, // Array with empty string
        { accountIds: ['very-long-account-id-with-special-chars-!@#$%'] },
        { accountIds: Array(100).fill('accountId') }, // Large array
      ]

      validObjects.forEach((obj) => {
        expect(validate(obj)).toBe(true)
        expect(validate.errors).toBeNull()
      })
    })

    it('should reject invalid objects', () => {
      const ajv = new Ajv()
      const validate = ajv.compile(capturedSchema)

      const invalidObjects = [
        {}, // Missing required accountIds
        { accountIds: null }, // null is not an array
        { accountIds: 'not-an-array' }, // string is not an array
        { accountIds: 123 }, // number is not an array
        { accountIds: true }, // boolean is not an array
        { accountIds: {} }, // object is not an array
        { accountIds: [123] }, // array with non-string items
        { accountIds: [true, false] }, // array with boolean items
        { accountIds: [null] }, // array with null items
        { accountIds: [{}] }, // array with object items
        { accountIds: [[]] }, // array with array items
        { accountIds: ['valid', 123, 'valid'] }, // mixed types
        { wrongProperty: ['account1'] }, // wrong property name
        null, // null is not an object
        undefined, // undefined object
        'string', // not an object
        123, // not an object
      ]

      invalidObjects.forEach((obj) => {
        expect(validate(obj)).toBe(false)
        expect(validate.errors).not.toBeNull()
      })
    })

    it('should handle null value (rejects due to type constraint)', () => {
      const ajv = new Ajv()
      const validate = ajv.compile(capturedSchema)

      // The schema specifies type: 'object', so null fails validation
      expect(validate(null)).toBe(false)
      expect(validate.errors).not.toBeNull()
    })

    it('should allow additional properties by default', () => {
      const ajv = new Ajv()
      const validate = ajv.compile(capturedSchema)

      const objWithExtra = {
        accountIds: ['account1', 'account2'],
        extraField: 'extra value',
        anotherField: 123,
      }

      expect(validate(objWithExtra)).toBe(true)
    })

    it('should handle unicode in accountIds', () => {
      const ajv = new Ajv()
      const validate = ajv.compile(capturedSchema)

      const unicodeObjects = [
        { accountIds: ['🚀✨💎'] },
        { accountIds: ['中文字符', '日本語'] },
        { accountIds: ['مرحبا', 'العربية'] },
        { accountIds: ['Здравствуйте', 'Русский'] },
      ]

      unicodeObjects.forEach((obj) => {
        expect(validate(obj)).toBe(true)
      })
    })

    it('should handle special string values in array', () => {
      const ajv = new Ajv()
      const validate = ajv.compile(capturedSchema)

      const specialCases = [
        { accountIds: ['line1\nline2'] },
        { accountIds: ['tab\there'] },
        { accountIds: ['quotes"and\'apostrophes'] },
        { accountIds: ['\u0000\u0001\u0002'] }, // control characters
        { accountIds: ['a'.repeat(10000)] }, // very long string
      ]

      specialCases.forEach((obj) => {
        expect(validate(obj)).toBe(true)
      })
    })
  })

  describe('initGetAccountDataByListReq', () => {
    it('should add schema with correct enum key', () => {
      initGetAccountDataByListReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(
        AJVSchemaEnum.GetAccountDataByListReq,
        expect.objectContaining({
          type: 'object',
          properties: {
            accountIds: { type: 'array', items: { type: 'string' } },
          },
          required: ['accountIds'],
        })
      )
    })

    it('should be idempotent (callable multiple times)', () => {
      initGetAccountDataByListReq()
      initGetAccountDataByListReq()
      initGetAccountDataByListReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(3)
    })
  })

  describe('edge cases', () => {
    let capturedSchema: any

    beforeEach(() => {
      mockAddSchema.mockImplementation((enumValue, schema) => {
        if (enumValue === AJVSchemaEnum.GetAccountDataByListReq) {
          capturedSchema = schema
        }
      })
      initGetAccountDataByListReq()
    })

    it('should validate arrays with duplicate values', () => {
      const ajv = new Ajv()
      const validate = ajv.compile(capturedSchema)

      const duplicates = {
        accountIds: ['account1', 'account1', 'account1'],
      }

      expect(validate(duplicates)).toBe(true)
    })

    it('should validate very large arrays', () => {
      const ajv = new Ajv()
      const validate = ajv.compile(capturedSchema)

      const largeArray = {
        accountIds: Array(10000).fill('accountId'),
      }

      expect(validate(largeArray)).toBe(true)
    })

    it('should handle arrays with mixed valid string types', () => {
      const ajv = new Ajv()
      const validate = ajv.compile(capturedSchema)

      const mixed = {
        accountIds: [
          '', // empty string
          ' ', // whitespace
          'normal-id',
          '123', // numeric string
          'true', // boolean as string
          'null', // null as string
          JSON.stringify({ complex: 'object' }), // stringified object
        ],
      }

      expect(validate(mixed)).toBe(true)
    })
  })

  describe('type exports', () => {
    it('should export required function', () => {
      expect(initGetAccountDataByListReq).toBeDefined()
      expect(typeof initGetAccountDataByListReq).toBe('function')
    })
  })
})
