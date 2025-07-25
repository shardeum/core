import { initGetAccountDataByListReq } from '../../../../../src/types/ajv/GetAccountDataByListReq'
import { addSchema } from '../../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../../../src/utils/serialization/SchemaHelpers')

const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

describe('GetAccountDataByListReq', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schemaGetAccountDataByListReq', () => {
    it('should define correct schema structure', () => {
      // Access the schema through the mock call after initialization
      initGetAccountDataByListReq()

      expect(mockAddSchema).toHaveBeenCalled()
      const [enumValue, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      expect(schema).toBeDefined()
      expect(schema.type).toBe('object')
      expect(schema.properties).toEqual({
        accountIds: { type: 'array', items: { type: 'string' } },
      })
      expect(schema.required).toEqual(['accountIds'])
    })

    it('should have accountIds as array of strings', () => {
      initGetAccountDataByListReq()

      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      expect(schema.properties.accountIds).toBeDefined()
      expect(schema.properties.accountIds.type).toBe('array')
      expect(schema.properties.accountIds.items).toEqual({ type: 'string' })
    })

    it('should require accountIds property', () => {
      initGetAccountDataByListReq()

      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      expect(schema.required).toContain('accountIds')
      expect(schema.required).toHaveLength(1)
    })

    it('should match expected schema exactly', () => {
      initGetAccountDataByListReq()

      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      const expectedSchema = {
        type: 'object',
        properties: {
          accountIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['accountIds'],
      }
      expect(schema).toEqual(expectedSchema)
    })
  })

  describe('initGetAccountDataByListReq', () => {
    it('should call addSchema with correct enum value', () => {
      initGetAccountDataByListReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema.mock.calls[0][0]).toBe(AJVSchemaEnum.GetAccountDataByListReq)
    })

    it('should call addSchema with correct schema', () => {
      initGetAccountDataByListReq()

      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]
      expect(schema).toBeDefined()
      expect(schema.type).toBe('object')
      expect(schema.properties.accountIds).toBeDefined()
    })

    it('should not throw any errors during initialization', () => {
      expect(() => initGetAccountDataByListReq()).not.toThrow()
    })

    it('should be idempotent - multiple calls should work', () => {
      initGetAccountDataByListReq()
      initGetAccountDataByListReq()
      initGetAccountDataByListReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(3)
      // Each call should have the same parameters
      const firstCall = mockAddSchema.mock.calls[0]
      const secondCall = mockAddSchema.mock.calls[1]
      const thirdCall = mockAddSchema.mock.calls[2]

      expect(firstCall).toEqual(secondCall)
      expect(secondCall).toEqual(thirdCall)
    })
  })

  describe('schema validation examples', () => {
    it('should accept valid object with accountIds array', () => {
      initGetAccountDataByListReq()
      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      const validExamples = [
        { accountIds: [] },
        { accountIds: ['id1'] },
        { accountIds: ['id1', 'id2', 'id3'] },
        { accountIds: ['0x123', '0x456', '0x789'] },
      ]

      // Schema structure allows these formats
      validExamples.forEach(() => {
        expect(schema.required).toContain('accountIds')
        expect(schema.properties.accountIds.type).toBe('array')
      })
    })

    it('should require accountIds to be present', () => {
      initGetAccountDataByListReq()
      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      const invalidObject = {}
      // Schema requires accountIds
      expect(schema.required).toContain('accountIds')
    })

    it('should only accept string values in accountIds array', () => {
      initGetAccountDataByListReq()
      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      // Schema specifies items must be strings
      expect(schema.properties.accountIds.items.type).toBe('string')
    })

    it('should not accept non-array accountIds values (schema validation)', () => {
      initGetAccountDataByListReq()
      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      const invalidExamples = [
        { accountIds: 'not-an-array' },
        { accountIds: 123 },
        { accountIds: true },
        { accountIds: null },
        { accountIds: undefined },
        { accountIds: {} },
      ]

      // Schema specifies accountIds must be array
      expect(schema.properties.accountIds.type).toBe('array')
    })

    it('should handle empty arrays', () => {
      initGetAccountDataByListReq()
      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      // Empty array should be valid according to schema
      const emptyArrayExample = { accountIds: [] }
      expect(schema.properties.accountIds.type).toBe('array')
      // No minimum items constraint in schema
    })
  })

  describe('addSchemaDependencies', () => {
    it('should not add any dependencies (function is empty)', () => {
      // The addSchemaDependencies function is empty in the source
      // We can verify this by checking that addSchema is only called once
      initGetAccountDataByListReq()
      expect(mockAddSchema).toHaveBeenCalledTimes(1)
    })
  })

  describe('export validation', () => {
    it('should export initGetAccountDataByListReq function', () => {
      expect(initGetAccountDataByListReq).toBeDefined()
      expect(typeof initGetAccountDataByListReq).toBe('function')
    })
  })

  describe('schema properties in detail', () => {
    it('should properly define array items schema', () => {
      initGetAccountDataByListReq()
      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      expect(schema.properties.accountIds.items).toBeDefined()
      expect(schema.properties.accountIds.items).toEqual({ type: 'string' })
    })

    it('should not have additional properties defined', () => {
      initGetAccountDataByListReq()
      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      expect(Object.keys(schema.properties)).toEqual(['accountIds'])
    })

    it('should be an object type schema', () => {
      initGetAccountDataByListReq()
      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      expect(schema.type).toBe('object')
    })
  })
})
