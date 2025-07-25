import { initRequestStateForTxPostReq } from '../../../../src/types/ajv/RequestStateForTxPostReq'
import { addSchema } from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../../src/utils/serialization/SchemaHelpers', () => ({
  addSchema: jest.fn(),
}))

describe('RequestStateForTxPostReq', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('initRequestStateForTxPostReq', () => {
    it('should call addSchema with correct enum value', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

      initRequestStateForTxPostReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(AJVSchemaEnum.RequestStateForTxPostReq, expect.any(Object))
    })

    it('should call addSchema with correct schema structure', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

      initRequestStateForTxPostReq()

      const schemaArg = mockAddSchema.mock.calls[0][1]
      expect(schemaArg).toEqual({
        type: 'object',
        properties: {
          txid: { type: 'string' },
          timestamp: { type: 'number' },
          key: { type: 'string' },
          hash: { type: 'string' },
        },
        required: ['txid', 'timestamp', 'key', 'hash'],
      })
    })

    it('should not throw any errors during initialization', () => {
      expect(() => initRequestStateForTxPostReq()).not.toThrow()
    })
  })

  describe('schema structure validation', () => {
    it('should define schema as object type', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initRequestStateForTxPostReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect(schema.type).toBe('object')
    })

    it('should have txid property as string', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initRequestStateForTxPostReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect(schema.properties.txid).toEqual({ type: 'string' })
    })

    it('should have timestamp property as number', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initRequestStateForTxPostReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect(schema.properties.timestamp).toEqual({ type: 'number' })
    })

    it('should have key property as string', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initRequestStateForTxPostReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect(schema.properties.key).toEqual({ type: 'string' })
    })

    it('should have hash property as string', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initRequestStateForTxPostReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect(schema.properties.hash).toEqual({ type: 'string' })
    })

    it('should have exactly 4 properties', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initRequestStateForTxPostReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect(Object.keys(schema.properties)).toHaveLength(4)
    })

    it('should require all fields', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initRequestStateForTxPostReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect(schema.required).toEqual(['txid', 'timestamp', 'key', 'hash'])
    })

    it('should have exactly 4 required fields', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initRequestStateForTxPostReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect(schema.required).toHaveLength(4)
    })

    it('should not have additionalProperties field', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initRequestStateForTxPostReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect('additionalProperties' in schema).toBe(false)
    })

    it('should have all properties marked as required', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initRequestStateForTxPostReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      const propertyNames = Object.keys(schema.properties)
      propertyNames.forEach((prop) => {
        expect(schema.required).toContain(prop)
      })
    })
  })
})
