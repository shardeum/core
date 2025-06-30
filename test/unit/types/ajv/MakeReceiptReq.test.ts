import { initMakeReceiptReq } from '../../../../src/types/ajv/MakeReceiptReq'
import * as SchemaHelpers from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../../src/utils/serialization/SchemaHelpers')

describe('MakeReceiptReq', () => {
  const mockAddSchema = SchemaHelpers.addSchema as jest.MockedFunction<typeof SchemaHelpers.addSchema>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('initMakeReceiptReq', () => {
    it('should initialize schemas correctly', () => {
      initMakeReceiptReq()

      // Should register two schemas: schemaSign and MakeReceiptReq
      expect(mockAddSchema).toHaveBeenCalledTimes(2)
    })

    it('should register schemaSign first', () => {
      initMakeReceiptReq()

      const firstCall = mockAddSchema.mock.calls[0]
      expect(firstCall[0]).toBe('schemaSign')
      expect(firstCall[1]).toEqual({
        type: 'object',
        properties: {
          owner: { type: 'string' },
          sig: { type: 'string' },
        },
        required: ['owner', 'sig'],
      })
    })

    it('should register MakeReceiptReq schema second', () => {
      initMakeReceiptReq()

      const secondCall = mockAddSchema.mock.calls[1]
      expect(secondCall[0]).toBe(AJVSchemaEnum.MakeReceiptReq)
      
      const schema = secondCall[1] as any
      expect(schema.type).toBe('object')
      expect(schema.properties).toHaveProperty('sign')
      expect(schema.properties).toHaveProperty('address')
      expect(schema.properties).toHaveProperty('value')
      expect(schema.properties).toHaveProperty('when')
      expect(schema.properties).toHaveProperty('source')
      expect(schema.required).toEqual(['sign', 'address', 'value', 'when', 'source'])
    })

    it('should define sign property with reference to schemaSign', () => {
      initMakeReceiptReq()

      const makeReceiptReqSchema = mockAddSchema.mock.calls[1][1] as any
      const signProperty = makeReceiptReqSchema.properties.sign

      expect(signProperty.type).toBe('object')
      expect(signProperty.items).toEqual({
        type: 'object',
        properties: {
          owner: { type: 'string' },
          sig: { type: 'string' },
        },
        required: ['owner', 'sig'],
      })
    })

    it('should have proper field types', () => {
      initMakeReceiptReq()

      const makeReceiptReqSchema = mockAddSchema.mock.calls[1][1] as any
      
      expect(makeReceiptReqSchema.properties.address.type).toBe('string')
      expect(makeReceiptReqSchema.properties.value).toEqual({}) // opaque value
      expect(makeReceiptReqSchema.properties.when.type).toBe('number')
      expect(makeReceiptReqSchema.properties.source.type).toBe('string')
    })

    it('should validate proper data structure', () => {
      const validData = {
        sign: {
          owner: '0xabc123',
          sig: 'signature_data'
        },
        address: '0xdef456',
        value: { amount: 100, currency: 'USD' },
        when: Date.now(),
        source: 'node1'
      }

      initMakeReceiptReq()
      
      const makeReceiptReqSchema = mockAddSchema.mock.calls[1][1] as any
      
      // Check that all required fields are in the schema
      expect(makeReceiptReqSchema.required).toContain('sign')
      expect(makeReceiptReqSchema.required).toContain('address')
      expect(makeReceiptReqSchema.required).toContain('value')
      expect(makeReceiptReqSchema.required).toContain('when')
      expect(makeReceiptReqSchema.required).toContain('source')
    })

    it('should accept any value type for value field', () => {
      initMakeReceiptReq()

      const makeReceiptReqSchema = mockAddSchema.mock.calls[1][1] as any
      
      // value property is defined as empty object, meaning any type is accepted
      expect(makeReceiptReqSchema.properties.value).toEqual({})
    })

    it('should register schemas in correct order', () => {
      initMakeReceiptReq()

      // Verify order of schema registration
      expect(mockAddSchema.mock.calls[0][0]).toBe('schemaSign')
      expect(mockAddSchema.mock.calls[1][0]).toBe(AJVSchemaEnum.MakeReceiptReq)
    })

    it('should register schemas only once per initialization', () => {
      initMakeReceiptReq()
      
      expect(mockAddSchema).toHaveBeenCalledTimes(2)
      
      // Clear mocks and call again
      mockAddSchema.mockClear()
      initMakeReceiptReq()
      
      expect(mockAddSchema).toHaveBeenCalledTimes(2)
    })
  })
})