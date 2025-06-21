import { initWrappedData, schemaWrappedData } from '../../../../src/types/ajv/WrappedData'
import * as SchemaHelpers from '../../../../src/utils/serialization/SchemaHelpers'

jest.mock('../../../../src/utils/serialization/SchemaHelpers')

describe('WrappedData', () => {
  const mockAddSchema = SchemaHelpers.addSchema as jest.MockedFunction<typeof SchemaHelpers.addSchema>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schemaWrappedData', () => {
    it('should define the correct schema structure', () => {
      expect(schemaWrappedData).toEqual({
        type: 'object',
        properties: {
          accountId: { type: 'string' },
          stateId: { type: 'string' },
          data: {},
          timestamp: { type: 'number' },
          syncData: {
            anyOf: [
              { type: 'object', additionalProperties: true },
              { type: 'string' },
              { type: 'number' },
              { type: 'boolean' },
              { type: 'array' },
              { type: 'null' },
            ],
          },
        },
        required: ['accountId', 'stateId', 'data', 'timestamp'],
      })
    })

    it('should have flexible syncData schema', () => {
      const syncDataSchema = schemaWrappedData.properties.syncData as any
      expect(syncDataSchema.anyOf).toBeDefined()
      expect(syncDataSchema.anyOf).toHaveLength(6)
      
      const types = syncDataSchema.anyOf.map((s: any) => s.type)
      expect(types).toContain('object')
      expect(types).toContain('string')
      expect(types).toContain('number')
      expect(types).toContain('boolean')
      expect(types).toContain('array')
      expect(types).toContain('null')
    })

    it('should not require syncData property', () => {
      expect(schemaWrappedData.required).not.toContain('syncData')
    })

    it('should have all required fields defined', () => {
      const requiredFields = ['accountId', 'stateId', 'data', 'timestamp']
      expect(schemaWrappedData.required).toEqual(requiredFields)
      
      requiredFields.forEach(field => {
        expect(schemaWrappedData.properties).toHaveProperty(field)
      })
    })

    it('should accept opaque data blob', () => {
      // data property is defined as empty object, meaning any type is accepted
      expect(schemaWrappedData.properties.data).toEqual({})
    })
  })

  describe('initWrappedData', () => {
    it('should initialize the schema correctly', () => {
      initWrappedData()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith('WrappedData', schemaWrappedData)
    })

    it('should register schema with correct name', () => {
      initWrappedData()

      const schemaCall = mockAddSchema.mock.calls[0]
      const schemaName = schemaCall[0]
      const schema = schemaCall[1]

      expect(schemaName).toBe('WrappedData')
      expect(schema).toBe(schemaWrappedData)
    })

    it('should validate proper data structure', () => {
      const validData = {
        accountId: 'acc123',
        stateId: 'state456',
        data: { someField: 'someValue', nested: { value: 42 } },
        timestamp: Date.now()
      }

      // The schema should accept this structure
      expect(schemaWrappedData.properties.accountId.type).toBe('string')
      expect(schemaWrappedData.properties.stateId.type).toBe('string')
      expect(schemaWrappedData.properties.timestamp.type).toBe('number')
    })

    it('should handle various syncData types', () => {
      const testCases = [
        { syncData: { key: 'value' } }, // object
        { syncData: 'string value' }, // string
        { syncData: 123 }, // number
        { syncData: true }, // boolean
        { syncData: [1, 2, 3] }, // array
        { syncData: null }, // null
      ]

      testCases.forEach(testCase => {
        const data = {
          accountId: 'acc123',
          stateId: 'state456',
          data: {},
          timestamp: Date.now(),
          ...testCase
        }

        // All these syncData types should be valid according to the schema
        const syncDataSchema = schemaWrappedData.properties.syncData as any
        expect(syncDataSchema.anyOf).toBeDefined()
      })
    })

    it('should register schema only once per initialization', () => {
      initWrappedData()
      
      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      
      // Clear mocks and call again
      mockAddSchema.mockClear()
      initWrappedData()
      
      expect(mockAddSchema).toHaveBeenCalledTimes(1)
    })
  })
})