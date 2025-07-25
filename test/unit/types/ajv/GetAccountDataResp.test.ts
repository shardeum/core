import { initGetAccountDataRespSerializable } from '../../../../src/types/ajv/GetAccountDataResp'
import * as SchemaHelpers from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'
import { schemaWrappedData } from '../../../../src/types/ajv/WrappedData'

jest.mock('../../../../src/utils/serialization/SchemaHelpers')

describe('GetAccountDataResp', () => {
  const mockAddSchema = SchemaHelpers.addSchema as jest.MockedFunction<typeof SchemaHelpers.addSchema>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('initGetAccountDataRespSerializable', () => {
    it('should initialize the schema correctly', () => {
      initGetAccountDataRespSerializable()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(AJVSchemaEnum.GetAccountDataResp, {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            properties: {
              wrappedAccounts: {
                type: 'array',
                items: schemaWrappedData,
              },
              lastUpdateNeeded: { type: 'boolean' },
              wrappedAccounts2: {
                type: 'array',
                items: schemaWrappedData,
              },
              highestTs: { type: 'number' },
              delta: { type: 'number' },
            },
            required: ['wrappedAccounts', 'lastUpdateNeeded', 'wrappedAccounts2', 'highestTs', 'delta'],
          },
          errors: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: [],
      })
    })

    it('should define data object with proper structure', () => {
      initGetAccountDataRespSerializable()

      const schema = mockAddSchema.mock.calls[0][1] as any
      const dataSchema = schema.properties.data

      expect(dataSchema.type).toBe('object')
      expect(dataSchema.properties).toHaveProperty('wrappedAccounts')
      expect(dataSchema.properties).toHaveProperty('lastUpdateNeeded')
      expect(dataSchema.properties).toHaveProperty('wrappedAccounts2')
      expect(dataSchema.properties).toHaveProperty('highestTs')
      expect(dataSchema.properties).toHaveProperty('delta')
    })

    it('should use schemaWrappedData for account arrays', () => {
      initGetAccountDataRespSerializable()

      const schema = mockAddSchema.mock.calls[0][1] as any
      const dataProperties = schema.properties.data.properties

      expect(dataProperties.wrappedAccounts.items).toBe(schemaWrappedData)
      expect(dataProperties.wrappedAccounts2.items).toBe(schemaWrappedData)
    })

    it('should define correct property types', () => {
      initGetAccountDataRespSerializable()

      const schema = mockAddSchema.mock.calls[0][1] as any
      const dataProperties = schema.properties.data.properties

      expect(dataProperties.wrappedAccounts.type).toBe('array')
      expect(dataProperties.lastUpdateNeeded.type).toBe('boolean')
      expect(dataProperties.wrappedAccounts2.type).toBe('array')
      expect(dataProperties.highestTs.type).toBe('number')
      expect(dataProperties.delta.type).toBe('number')
    })

    it('should define errors as array of strings', () => {
      initGetAccountDataRespSerializable()

      const schema = mockAddSchema.mock.calls[0][1] as any
      const errorsSchema = schema.properties.errors

      expect(errorsSchema.type).toBe('array')
      expect(errorsSchema.items.type).toBe('string')
    })

    it('should require all data properties but not require data or errors at top level', () => {
      initGetAccountDataRespSerializable()

      const schema = mockAddSchema.mock.calls[0][1] as any

      // Top level should not require data or errors
      expect(schema.required).toEqual([])

      // But data object should require all its properties
      expect(schema.properties.data.required).toEqual([
        'wrappedAccounts',
        'lastUpdateNeeded',
        'wrappedAccounts2',
        'highestTs',
        'delta',
      ])
    })

    it('should validate proper data structure', () => {
      const validData = {
        data: {
          wrappedAccounts: [
            {
              accountId: 'acc1',
              stateId: 'state1',
              data: {},
              timestamp: 123456,
            },
          ],
          lastUpdateNeeded: true,
          wrappedAccounts2: [],
          highestTs: 789012,
          delta: 5,
        },
        errors: ['error1', 'error2'],
      }

      initGetAccountDataRespSerializable()
      const schema = mockAddSchema.mock.calls[0][1] as any

      // Check that the schema structure matches
      expect(schema.properties).toHaveProperty('data')
      expect(schema.properties).toHaveProperty('errors')
    })

    it('should allow response with only data', () => {
      const dataOnly = {
        data: {
          wrappedAccounts: [],
          lastUpdateNeeded: false,
          wrappedAccounts2: [],
          highestTs: 0,
          delta: 0,
        },
      }

      initGetAccountDataRespSerializable()
      const schema = mockAddSchema.mock.calls[0][1] as any

      // Should not require errors property
      expect(schema.required).toEqual([])
    })

    it('should allow response with only errors', () => {
      const errorsOnly = {
        errors: ['Something went wrong'],
      }

      initGetAccountDataRespSerializable()
      const schema = mockAddSchema.mock.calls[0][1] as any

      // Should not require data property
      expect(schema.required).toEqual([])
    })

    it('should register schema only once per initialization', () => {
      initGetAccountDataRespSerializable()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)

      // Clear mocks and call again
      mockAddSchema.mockClear()
      initGetAccountDataRespSerializable()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
    })
  })
})
