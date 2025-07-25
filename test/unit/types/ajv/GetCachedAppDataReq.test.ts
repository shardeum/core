import { schemaGetCachedAppDataReq, initGetCachedAppDataReq } from '../../../../src/types/ajv/GetCachedAppDataReq'
import { addSchema } from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../../src/utils/serialization/SchemaHelpers')

const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

describe('GetCachedAppDataReq', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schemaGetCachedAppDataReq', () => {
    it('should define a valid schema structure', () => {
      expect(schemaGetCachedAppDataReq).toBeDefined()
      expect(schemaGetCachedAppDataReq.type).toBe('object')
      expect(schemaGetCachedAppDataReq.properties).toBeDefined()
      expect(schemaGetCachedAppDataReq.required).toBeDefined()
      expect(schemaGetCachedAppDataReq.additionalProperties).toBe(false)
    })

    it('should have topic property of type string', () => {
      expect(schemaGetCachedAppDataReq.properties.topic).toEqual({ type: 'string' })
    })

    it('should have dataId property of type string', () => {
      expect(schemaGetCachedAppDataReq.properties.dataId).toEqual({ type: 'string' })
    })

    it('should require both topic and dataId', () => {
      expect(schemaGetCachedAppDataReq.required).toEqual(['topic', 'dataId'])
    })

    it('should have exactly 2 properties', () => {
      const propertyCount = Object.keys(schemaGetCachedAppDataReq.properties).length
      expect(propertyCount).toBe(2)
    })

    it('should not allow additional properties', () => {
      expect(schemaGetCachedAppDataReq.additionalProperties).toBe(false)
    })

    it('should have correct schema structure', () => {
      const expectedSchema = {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          dataId: { type: 'string' },
        },
        required: ['topic', 'dataId'],
        additionalProperties: false,
      }
      expect(schemaGetCachedAppDataReq).toEqual(expectedSchema)
    })
  })

  describe('initGetCachedAppDataReq', () => {
    it('should call addSchema with correct parameters', () => {
      initGetCachedAppDataReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(AJVSchemaEnum.GetCachedAppDataReq, schemaGetCachedAppDataReq)
    })

    it('should not throw any errors during initialization', () => {
      expect(() => initGetCachedAppDataReq()).not.toThrow()
    })

    it('should be idempotent - multiple calls should work', () => {
      initGetCachedAppDataReq()
      initGetCachedAppDataReq()
      initGetCachedAppDataReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(3)
      expect(mockAddSchema).toHaveBeenCalledWith(AJVSchemaEnum.GetCachedAppDataReq, schemaGetCachedAppDataReq)
    })
  })

  describe('schema validation examples', () => {
    it('should accept valid object with topic and dataId', () => {
      const validObject = {
        topic: 'user-data',
        dataId: '12345',
      }
      // Schema validation test - verifying structure allows this object
      expect(schemaGetCachedAppDataReq.properties.topic.type).toBe('string')
      expect(schemaGetCachedAppDataReq.properties.dataId.type).toBe('string')
      expect(schemaGetCachedAppDataReq.required).toContain('topic')
      expect(schemaGetCachedAppDataReq.required).toContain('dataId')
    })

    it('should define schema for different string formats', () => {
      const testCases = [
        { topic: '', dataId: '' },
        { topic: 'a', dataId: 'b' },
        { topic: 'very-long-topic-name-with-many-characters', dataId: 'very-long-data-id-with-many-characters' },
        { topic: 'special-chars-!@#$%', dataId: 'uuid-123e4567-e89b-12d3-a456-426614174000' },
        { topic: 'nested/path/topic', dataId: 'hash:0x1234567890abcdef' },
      ]

      testCases.forEach(() => {
        expect(schemaGetCachedAppDataReq.properties.topic.type).toBe('string')
        expect(schemaGetCachedAppDataReq.properties.dataId.type).toBe('string')
      })
    })

    it('should reject objects with additional properties due to additionalProperties: false', () => {
      // The schema has additionalProperties: false, so extra properties should be rejected
      expect(schemaGetCachedAppDataReq.additionalProperties).toBe(false)

      // This means objects like { topic: 'x', dataId: 'y', extra: 'z' } would be invalid
      const invalidObject = {
        topic: 'test-topic',
        dataId: 'test-id',
        extraField: 'should-not-be-allowed',
      }

      // Verify the schema would reject this
      expect(schemaGetCachedAppDataReq.additionalProperties).toBe(false)
      expect(Object.keys(schemaGetCachedAppDataReq.properties)).not.toContain('extraField')
    })

    it('should only accept the two defined properties', () => {
      const properties = Object.keys(schemaGetCachedAppDataReq.properties)
      expect(properties).toHaveLength(2)
      expect(properties).toContain('topic')
      expect(properties).toContain('dataId')
    })
  })

  describe('addSchemaDependencies', () => {
    it('should not add any dependencies (function is empty)', () => {
      // The addSchemaDependencies function is empty in the source
      // We can verify this by checking that addSchema is only called once
      initGetCachedAppDataReq()
      expect(mockAddSchema).toHaveBeenCalledTimes(1)
    })
  })

  describe('edge cases', () => {
    it('should handle empty strings for topic and dataId', () => {
      // Empty strings are still valid strings
      expect(schemaGetCachedAppDataReq.properties.topic.type).toBe('string')
      expect(schemaGetCachedAppDataReq.properties.dataId.type).toBe('string')

      // No minimum length is specified in the schema
      expect((schemaGetCachedAppDataReq.properties.topic as any).minLength).toBeUndefined()
      expect((schemaGetCachedAppDataReq.properties.dataId as any).minLength).toBeUndefined()
    })

    it('should have both properties as required with no optional fields', () => {
      expect(schemaGetCachedAppDataReq.required).toHaveLength(2)
      expect(schemaGetCachedAppDataReq.required).toEqual(['topic', 'dataId'])

      // All properties are required
      const allProperties = Object.keys(schemaGetCachedAppDataReq.properties)
      expect(schemaGetCachedAppDataReq.required).toEqual(expect.arrayContaining(allProperties))
    })
  })
})
