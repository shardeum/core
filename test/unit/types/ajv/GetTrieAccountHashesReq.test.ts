import { initGetTrieAccountHashesReq } from '../../../../src/types/ajv/GetTrieAccountHashesReq'
import { addSchema } from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../../src/utils/serialization/SchemaHelpers', () => ({
  addSchema: jest.fn(),
}))

describe('GetTrieAccountHashesReq', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('initGetTrieAccountHashesReq', () => {
    it('should call addSchema with correct enum value', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

      initGetTrieAccountHashesReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(AJVSchemaEnum.GetTrieAccountHashesReq, expect.any(Object))
    })

    it('should call addSchema with correct schema structure', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

      initGetTrieAccountHashesReq()

      const schemaArg = mockAddSchema.mock.calls[0][1]
      expect(schemaArg).toEqual({
        type: 'object',
        properties: {
          radixList: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['radixList'],
      })
    })

    it('should not throw any errors during initialization', () => {
      expect(() => initGetTrieAccountHashesReq()).not.toThrow()
    })
  })

  describe('schema structure validation', () => {
    it('should define schema as object type', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initGetTrieAccountHashesReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect(schema.type).toBe('object')
    })

    it('should have radixList property', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initGetTrieAccountHashesReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect(schema.properties.radixList).toBeDefined()
    })

    it('should define radixList as array of strings', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initGetTrieAccountHashesReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect(schema.properties.radixList.type).toBe('array')
      expect(schema.properties.radixList.items).toEqual({ type: 'string' })
    })

    it('should have exactly 1 property', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initGetTrieAccountHashesReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect(Object.keys(schema.properties)).toHaveLength(1)
    })

    it('should require radixList field', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initGetTrieAccountHashesReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect(schema.required).toEqual(['radixList'])
    })

    it('should have exactly 1 required field', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initGetTrieAccountHashesReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect(schema.required).toHaveLength(1)
    })

    it('should not have additionalProperties field', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initGetTrieAccountHashesReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect('additionalProperties' in schema).toBe(false)
    })

    it('should have all properties marked as required', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initGetTrieAccountHashesReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      const propertyNames = Object.keys(schema.properties)
      propertyNames.forEach((prop) => {
        expect(schema.required).toContain(prop)
      })
    })
  })
})
