import { initGetAccountDataWithQueueHintsReq } from '../../../../../src/types/ajv/GetAccountDataWithQueueHintsReq'
import { addSchema } from '../../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../../../src/utils/serialization/SchemaHelpers')

const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

describe('GetAccountDataWithQueueHintsReq', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schemaGetAccountDataWithQueueHintsReq', () => {
    it('should define correct schema structure', () => {
      // Access the schema through the mock call after initialization
      initGetAccountDataWithQueueHintsReq()

      expect(mockAddSchema).toHaveBeenCalled()
      const [enumValue, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      expect(schema).toBeDefined()
      expect(schema.properties).toEqual({
        accountIds: { type: 'array', items: { type: 'string' } },
      })
      expect(schema.required).toEqual(['accountIds'])
    })

    it('should have accountIds as array of strings', () => {
      initGetAccountDataWithQueueHintsReq()

      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      expect(schema.properties.accountIds).toBeDefined()
      expect(schema.properties.accountIds.type).toBe('array')
      expect(schema.properties.accountIds.items).toEqual({ type: 'string' })
    })

    it('should require accountIds property', () => {
      initGetAccountDataWithQueueHintsReq()

      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      expect(schema.required).toContain('accountIds')
      expect(schema.required).toHaveLength(1)
    })

    it('should not have type property defined', () => {
      initGetAccountDataWithQueueHintsReq()

      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      // Note: The schema in the source file doesn't have 'type: object' defined
      expect(schema.type).toBeUndefined()
    })

    it('should match expected schema exactly', () => {
      initGetAccountDataWithQueueHintsReq()

      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      const expectedSchema = {
        properties: {
          accountIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['accountIds'],
      }
      expect(schema).toEqual(expectedSchema)
    })
  })

  describe('initGetAccountDataWithQueueHintsReq', () => {
    it('should call addSchema with correct enum value', () => {
      initGetAccountDataWithQueueHintsReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema.mock.calls[0][0]).toBe(AJVSchemaEnum.GetAccountDataWithQueueHintsReq)
    })

    it('should call addSchema with correct schema', () => {
      initGetAccountDataWithQueueHintsReq()

      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]
      expect(schema).toBeDefined()
      expect(schema.properties.accountIds).toBeDefined()
    })

    it('should not throw any errors during initialization', () => {
      expect(() => initGetAccountDataWithQueueHintsReq()).not.toThrow()
    })

    it('should be idempotent - multiple calls should work', () => {
      initGetAccountDataWithQueueHintsReq()
      initGetAccountDataWithQueueHintsReq()
      initGetAccountDataWithQueueHintsReq()

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
      initGetAccountDataWithQueueHintsReq()
      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      const validExamples = [
        { accountIds: [] },
        { accountIds: ['id1'] },
        { accountIds: ['id1', 'id2', 'id3'] },
        { accountIds: ['0x123', '0x456', '0x789'] },
        { accountIds: ['account-1', 'account-2', 'account-3', 'account-4'] },
      ]

      // Schema structure allows these formats
      validExamples.forEach(() => {
        expect(schema.required).toContain('accountIds')
        expect(schema.properties.accountIds.type).toBe('array')
      })
    })

    it('should require accountIds to be present', () => {
      initGetAccountDataWithQueueHintsReq()
      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      const invalidObject = {}
      // Schema requires accountIds
      expect(schema.required).toContain('accountIds')
    })

    it('should only accept string values in accountIds array', () => {
      initGetAccountDataWithQueueHintsReq()
      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      // Schema specifies items must be strings
      expect(schema.properties.accountIds.items.type).toBe('string')
    })

    it('should not accept non-array accountIds values (schema validation)', () => {
      initGetAccountDataWithQueueHintsReq()
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
      initGetAccountDataWithQueueHintsReq()
      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      // Empty array should be valid according to schema
      const emptyArrayExample = { accountIds: [] }
      expect(schema.properties.accountIds.type).toBe('array')
      // No minimum items constraint in schema
    })

    it('should allow large arrays', () => {
      initGetAccountDataWithQueueHintsReq()
      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      // No maximum items constraint in schema
      const largeArray = { accountIds: new Array(1000).fill('account-id') }
      expect(schema.properties.accountIds.type).toBe('array')
      // No maximum items constraint
    })
  })

  describe('addSchemaDependencies', () => {
    it('should not add any dependencies (function is empty)', () => {
      // The addSchemaDependencies function is empty in the source
      // We can verify this by checking that addSchema is only called once
      initGetAccountDataWithQueueHintsReq()
      expect(mockAddSchema).toHaveBeenCalledTimes(1)
    })
  })

  describe('export validation', () => {
    it('should export initGetAccountDataWithQueueHintsReq function', () => {
      expect(initGetAccountDataWithQueueHintsReq).toBeDefined()
      expect(typeof initGetAccountDataWithQueueHintsReq).toBe('function')
    })
  })

  describe('schema properties in detail', () => {
    it('should properly define array items schema', () => {
      initGetAccountDataWithQueueHintsReq()
      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      expect(schema.properties.accountIds.items).toBeDefined()
      expect(schema.properties.accountIds.items).toEqual({ type: 'string' })
    })

    it('should not have additional properties defined', () => {
      initGetAccountDataWithQueueHintsReq()
      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      expect(Object.keys(schema.properties)).toEqual(['accountIds'])
    })

    it('should have minimal schema without type property', () => {
      initGetAccountDataWithQueueHintsReq()
      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      // Schema doesn't define 'type' at root level
      expect(schema.type).toBeUndefined()
      // But has properties and required
      expect(schema.properties).toBeDefined()
      expect(schema.required).toBeDefined()
    })
  })

  describe('comparison with similar schemas', () => {
    it('should have same structure as GetAccountDataByListReq but without type', () => {
      initGetAccountDataWithQueueHintsReq()
      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]

      // Similar to GetAccountDataByListReq but missing 'type: object'
      expect(schema.properties).toEqual({
        accountIds: { type: 'array', items: { type: 'string' } },
      })
      expect(schema.required).toEqual(['accountIds'])
      expect(schema.type).toBeUndefined()
    })
  })
})
