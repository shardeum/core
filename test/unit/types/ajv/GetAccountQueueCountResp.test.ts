import { initGetAccountQueueCountResp } from '../../../../src/types/ajv/GetAccountQueueCountResp'
import * as SchemaHelpers from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../../src/utils/serialization/SchemaHelpers')

describe('GetAccountQueueCountResp', () => {
  const mockAddSchema = SchemaHelpers.addSchema as jest.MockedFunction<typeof SchemaHelpers.addSchema>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('initGetAccountQueueCountResp', () => {
    it('should initialize the schema correctly', () => {
      initGetAccountQueueCountResp()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(AJVSchemaEnum.GetAccountQueueCountResp, {
        oneOf: [
          {
            type: 'object',
            properties: {
              counts: {
                type: 'array',
                items: { type: 'number' },
              },
              committingAppData: {
                type: 'array',
                items: {},
              },
              accounts: {
                type: 'array',
                items: {},
              },
            },
            required: ['counts', 'committingAppData', 'accounts'],
          },
          {
            type: 'boolean',
            enum: [false],
          },
        ],
      })
    })

    it('should define oneOf schema with two options', () => {
      initGetAccountQueueCountResp()

      const schema = mockAddSchema.mock.calls[0][1] as any
      expect(schema.oneOf).toBeDefined()
      expect(schema.oneOf).toHaveLength(2)
    })

    it('should define object schema as first option', () => {
      initGetAccountQueueCountResp()

      const schema = mockAddSchema.mock.calls[0][1] as any
      const objectSchema = schema.oneOf[0]

      expect(objectSchema.type).toBe('object')
      expect(objectSchema.properties).toHaveProperty('counts')
      expect(objectSchema.properties).toHaveProperty('committingAppData')
      expect(objectSchema.properties).toHaveProperty('accounts')
      expect(objectSchema.required).toEqual(['counts', 'committingAppData', 'accounts'])
    })

    it('should define boolean false as second option', () => {
      initGetAccountQueueCountResp()

      const schema = mockAddSchema.mock.calls[0][1] as any
      const booleanSchema = schema.oneOf[1]

      expect(booleanSchema.type).toBe('boolean')
      expect(booleanSchema.enum).toEqual([false])
    })

    it('should define counts as array of numbers', () => {
      initGetAccountQueueCountResp()

      const schema = mockAddSchema.mock.calls[0][1] as any
      const countsSchema = schema.oneOf[0].properties.counts

      expect(countsSchema.type).toBe('array')
      expect(countsSchema.items.type).toBe('number')
    })

    it('should define committingAppData and accounts as arrays with flexible items', () => {
      initGetAccountQueueCountResp()

      const schema = mockAddSchema.mock.calls[0][1] as any
      const objectSchema = schema.oneOf[0]

      expect(objectSchema.properties.committingAppData.type).toBe('array')
      expect(objectSchema.properties.committingAppData.items).toEqual({})

      expect(objectSchema.properties.accounts.type).toBe('array')
      expect(objectSchema.properties.accounts.items).toEqual({})
    })

    it('should register schema with correct enum key', () => {
      initGetAccountQueueCountResp()

      const schemaCall = mockAddSchema.mock.calls[0]
      expect(schemaCall[0]).toBe(AJVSchemaEnum.GetAccountQueueCountResp)
    })

    it('should validate both response types', () => {
      // Valid object response
      const validObjectResponse = {
        counts: [1, 2, 3],
        committingAppData: [{ some: 'data' }, { other: 'data' }],
        accounts: ['acc1', 'acc2', { id: 'acc3' }]
      }

      // Valid boolean response
      const validBooleanResponse = false

      initGetAccountQueueCountResp()
      const schema = mockAddSchema.mock.calls[0][1] as any

      // Both should be valid according to the oneOf schema
      expect(schema.oneOf).toHaveLength(2)
      expect(schema.oneOf[0].type).toBe('object')
      expect(schema.oneOf[1].type).toBe('boolean')
    })

    it('should not allow true as boolean response', () => {
      initGetAccountQueueCountResp()

      const schema = mockAddSchema.mock.calls[0][1] as any
      const booleanSchema = schema.oneOf[1]

      expect(booleanSchema.enum).toEqual([false])
      expect(booleanSchema.enum).not.toContain(true)
    })

    it('should register schema only once per initialization', () => {
      initGetAccountQueueCountResp()
      
      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      
      // Clear mocks and call again
      mockAddSchema.mockClear()
      initGetAccountQueueCountResp()
      
      expect(mockAddSchema).toHaveBeenCalledTimes(1)
    })
  })
})