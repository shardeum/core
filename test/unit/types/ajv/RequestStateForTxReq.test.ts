import { initRequestStateForTxReq, shcemaRequestStateForTxReq } from '../../../../src/types/ajv/RequestStateForTxReq'
import { addSchema } from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../../src/utils/serialization/SchemaHelpers', () => ({
  addSchema: jest.fn(),
}))

describe('RequestStateForTxReq', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('shcemaRequestStateForTxReq', () => {
    it('should be an object type schema', () => {
      expect(shcemaRequestStateForTxReq.type).toBe('object')
    })

    it('should have txid property as string', () => {
      expect(shcemaRequestStateForTxReq.properties.txid).toEqual({ type: 'string' })
    })

    it('should have timestamp property as number', () => {
      expect(shcemaRequestStateForTxReq.properties.timestamp).toEqual({ type: 'number' })
    })

    it('should have keys property as array of strings', () => {
      expect(shcemaRequestStateForTxReq.properties.keys).toEqual({
        type: 'array',
        items: { type: 'string' },
      })
    })

    it('should have exactly 3 properties', () => {
      expect(Object.keys(shcemaRequestStateForTxReq.properties)).toHaveLength(3)
    })

    it('should require all fields', () => {
      expect(shcemaRequestStateForTxReq.required).toEqual(['txid', 'timestamp', 'keys'])
    })

    it('should have exactly 3 required fields', () => {
      expect(shcemaRequestStateForTxReq.required).toHaveLength(3)
    })

    it('should not have additionalProperties field', () => {
      expect('additionalProperties' in shcemaRequestStateForTxReq).toBe(false)
    })
  })

  describe('initRequestStateForTxReq', () => {
    it('should call addSchema with correct parameters', () => {
      const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

      initRequestStateForTxReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(AJVSchemaEnum.RequestStateForTxReq, shcemaRequestStateForTxReq)
    })

    it('should not throw any errors during initialization', () => {
      expect(() => initRequestStateForTxReq()).not.toThrow()
    })
  })

  describe('schema structure validation', () => {
    it('should have all properties as required', () => {
      const propertyNames = Object.keys(shcemaRequestStateForTxReq.properties)
      propertyNames.forEach((prop) => {
        expect(shcemaRequestStateForTxReq.required).toContain(prop)
      })
    })

    it('should define keys as array type', () => {
      expect(shcemaRequestStateForTxReq.properties.keys.type).toBe('array')
    })

    it('should define keys items as strings', () => {
      expect(shcemaRequestStateForTxReq.properties.keys.items).toEqual({ type: 'string' })
    })

    it('should require txid field', () => {
      expect(shcemaRequestStateForTxReq.required).toContain('txid')
    })

    it('should require timestamp field', () => {
      expect(shcemaRequestStateForTxReq.required).toContain('timestamp')
    })

    it('should require keys field', () => {
      expect(shcemaRequestStateForTxReq.required).toContain('keys')
    })
  })
})
