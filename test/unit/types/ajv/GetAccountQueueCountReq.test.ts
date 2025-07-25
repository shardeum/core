import { initGetAccountQueueCountReq } from '../../../../src/types/ajv/GetAccountQueueCountReq'
import { addSchema } from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../../src/utils/serialization/SchemaHelpers', () => ({
  addSchema: jest.fn(),
}))

describe('GetAccountQueueCountReq', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('initGetAccountQueueCountReq', () => {
    it('should call addSchema with correct enum value', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

      initGetAccountQueueCountReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(AJVSchemaEnum.GetAccountQueueCountReq, expect.any(Object))
    })

    it('should call addSchema with correct schema structure', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

      initGetAccountQueueCountReq()

      const schemaArg = mockAddSchema.mock.calls[0][1]
      expect(schemaArg).toEqual({
        type: 'object',
        properties: {
          accountIds: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['accountIds'],
      })
    })

    it('should not throw any errors during initialization', () => {
      expect(() => initGetAccountQueueCountReq()).not.toThrow()
    })
  })

  describe('schema structure validation', () => {
    it('should define schema as object type', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initGetAccountQueueCountReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect(schema.type).toBe('object')
    })

    it('should have accountIds property', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initGetAccountQueueCountReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect(schema.properties.accountIds).toBeDefined()
    })

    it('should define accountIds as array of strings', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initGetAccountQueueCountReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect(schema.properties.accountIds.type).toBe('array')
      expect(schema.properties.accountIds.items).toEqual({ type: 'string' })
    })

    it('should have exactly 1 property', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initGetAccountQueueCountReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect(Object.keys(schema.properties)).toHaveLength(1)
    })

    it('should require accountIds field', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initGetAccountQueueCountReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect(schema.required).toEqual(['accountIds'])
    })

    it('should have exactly 1 required field', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initGetAccountQueueCountReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect(schema.required).toHaveLength(1)
    })

    it('should not have additionalProperties field', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>
      initGetAccountQueueCountReq()
      const schema = mockAddSchema.mock.calls[0][1] as any

      expect('additionalProperties' in schema).toBe(false)
    })
  })
})
