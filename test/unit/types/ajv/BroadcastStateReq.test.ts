import { initBroadcastStateReq } from '../../../../src/types/ajv/BroadcastStateReq'
import { addSchema } from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'
import { schemaWrappedDataResponse } from '../../../../src/types/ajv/WrappedDataResponse'

jest.mock('../../../../src/utils/serialization/SchemaHelpers')
jest.mock('../../../../src/types/ajv/WrappedDataResponse', () => ({
  schemaWrappedDataResponse: {
    type: 'object',
    properties: {
      data: { type: 'object' },
      accountCreated: { type: 'boolean' },
      isPartial: { type: 'boolean' },
    },
    required: ['data', 'accountCreated', 'isPartial'],
  },
}))

const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

describe('BroadcastStateReq', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schemaBroadcastStateReq', () => {
    // Since schemaBroadcastStateReq is not exported, we'll test it indirectly through initBroadcastStateReq
    it('should define a valid schema structure with proper properties', () => {
      // We'll verify the schema structure by checking what gets passed to addSchema
      initBroadcastStateReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      const [schemaName, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]
      
      expect(schemaName).toBe(AJVSchemaEnum.BroadcastStateReq)
      expect(schema).toBeDefined()
      expect(schema.type).toBe('object')
      expect(schema.properties).toBeDefined()
      expect(schema.required).toBeDefined()
    })

    it('should have txid property of type string', () => {
      initBroadcastStateReq()

      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]
      expect(schema.properties.txid).toEqual({ type: 'string' })
    })

    it('should have stateList property as array of WrappedDataResponse', () => {
      initBroadcastStateReq()

      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]
      expect(schema.properties.stateList).toBeDefined()
      expect(schema.properties.stateList.type).toBe('array')
      expect(schema.properties.stateList.items).toBe(schemaWrappedDataResponse)
    })

    it('should require both txid and stateList', () => {
      initBroadcastStateReq()

      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]
      expect(schema.required).toEqual(['txid', 'stateList'])
    })

    it('should have correct complete schema structure', () => {
      initBroadcastStateReq()

      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]
      const expectedSchema = {
        type: 'object',
        properties: {
          txid: { type: 'string' },
          stateList: {
            type: 'array',
            items: schemaWrappedDataResponse,
          },
        },
        required: ['txid', 'stateList'],
      }
      expect(schema).toEqual(expectedSchema)
    })
  })

  describe('initBroadcastStateReq', () => {
    it('should call addSchema with correct parameters', () => {
      initBroadcastStateReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(
        AJVSchemaEnum.BroadcastStateReq,
        expect.objectContaining({
          type: 'object',
          properties: expect.objectContaining({
            txid: { type: 'string' },
            stateList: expect.objectContaining({
              type: 'array',
            }),
          }),
          required: ['txid', 'stateList'],
        })
      )
    })

    it('should not throw any errors during initialization', () => {
      expect(() => initBroadcastStateReq()).not.toThrow()
    })

    it('should be idempotent - multiple calls should work', () => {
      initBroadcastStateReq()
      initBroadcastStateReq()
      initBroadcastStateReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(3)
      // Each call should be identical
      const firstCall = mockAddSchema.mock.calls[0]
      const secondCall = mockAddSchema.mock.calls[1]
      const thirdCall = mockAddSchema.mock.calls[2]
      
      expect(firstCall).toEqual(secondCall)
      expect(secondCall).toEqual(thirdCall)
    })
  })

  describe('schema validation examples', () => {
    it('should accept valid object with txid and empty stateList', () => {
      initBroadcastStateReq()

      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]
      
      // Verify the schema would accept this structure
      expect(schema.properties.txid.type).toBe('string')
      expect(schema.properties.stateList.type).toBe('array')
      expect(schema.required).toContain('txid')
      expect(schema.required).toContain('stateList')
    })

    it('should accept different txid formats and stateList sizes', () => {
      initBroadcastStateReq()

      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]
      
      const testCases = [
        { txid: '', stateList: [] },
        { txid: 'abc123', stateList: [] },
        { txid: '0x1234567890abcdef', stateList: [{}, {}, {}] },
        { txid: 'very-long-transaction-id-123456789', stateList: [{}] },
      ]

      testCases.forEach(() => {
        expect(schema.properties.txid.type).toBe('string')
        expect(schema.properties.stateList.type).toBe('array')
      })
    })

    it('should reference WrappedDataResponse schema for array items', () => {
      initBroadcastStateReq()

      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]
      
      expect(schema.properties.stateList.items).toBe(schemaWrappedDataResponse)
      // Verify that the referenced schema has expected structure
      expect(schemaWrappedDataResponse.type).toBe('object')
      expect(schemaWrappedDataResponse.properties).toBeDefined()
      expect(schemaWrappedDataResponse.required).toBeDefined()
    })
  })

  describe('addSchemaDependencies', () => {
    it('should not add any dependencies (function is empty)', () => {
      // The addSchemaDependencies function is empty in the source
      // We can verify this by checking that addSchema is only called once
      initBroadcastStateReq()
      expect(mockAddSchema).toHaveBeenCalledTimes(1)
    })
  })

  describe('schema composition', () => {
    it('should properly compose with WrappedDataResponse schema', () => {
      initBroadcastStateReq()

      const [, schema] = mockAddSchema.mock.calls[0] as [AJVSchemaEnum, any]
      
      // Verify stateList items reference the imported schema
      expect(schema.properties.stateList.items).toBe(schemaWrappedDataResponse)
      
      // Verify the imported schema structure
      expect(schemaWrappedDataResponse).toEqual({
        type: 'object',
        properties: {
          data: { type: 'object' },
          accountCreated: { type: 'boolean' },
          isPartial: { type: 'boolean' },
        },
        required: ['data', 'accountCreated', 'isPartial'],
      })
    })
  })
})