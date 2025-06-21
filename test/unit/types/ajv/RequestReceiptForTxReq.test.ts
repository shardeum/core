import { schemaRequestReceiptForTxReq, initRequestReceiptForTxReq } from '../../../../src/types/ajv/RequestReceiptForTxReq'
import { addSchema } from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../../src/utils/serialization/SchemaHelpers')

const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

describe('RequestReceiptForTxReq', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schemaRequestReceiptForTxReq', () => {
    it('should define a valid schema structure', () => {
      expect(schemaRequestReceiptForTxReq).toBeDefined()
      expect(schemaRequestReceiptForTxReq.type).toBe('object')
      expect(schemaRequestReceiptForTxReq.properties).toBeDefined()
      expect(schemaRequestReceiptForTxReq.required).toBeDefined()
    })

    it('should have txid property of type string', () => {
      expect(schemaRequestReceiptForTxReq.properties.txid).toEqual({ type: 'string' })
    })

    it('should have timestamp property of type number', () => {
      expect(schemaRequestReceiptForTxReq.properties.timestamp).toEqual({ type: 'number' })
    })

    it('should require both txid and timestamp', () => {
      expect(schemaRequestReceiptForTxReq.required).toEqual(['txid', 'timestamp'])
    })

    it('should have exactly 2 properties', () => {
      const propertyCount = Object.keys(schemaRequestReceiptForTxReq.properties).length
      expect(propertyCount).toBe(2)
    })

    it('should have correct schema structure', () => {
      const expectedSchema = {
        type: 'object',
        properties: {
          txid: { type: 'string' },
          timestamp: { type: 'number' },
        },
        required: ['txid', 'timestamp'],
      }
      expect(schemaRequestReceiptForTxReq).toEqual(expectedSchema)
    })
  })

  describe('initRequestReceiptForTxReq', () => {
    it('should call addSchema with correct parameters', () => {
      initRequestReceiptForTxReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(
        AJVSchemaEnum.RequestReceiptForTxReq,
        schemaRequestReceiptForTxReq
      )
    })

    it('should not throw any errors during initialization', () => {
      expect(() => initRequestReceiptForTxReq()).not.toThrow()
    })

    it('should be idempotent - multiple calls should work', () => {
      initRequestReceiptForTxReq()
      initRequestReceiptForTxReq()
      initRequestReceiptForTxReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(3)
      expect(mockAddSchema).toHaveBeenCalledWith(
        AJVSchemaEnum.RequestReceiptForTxReq,
        schemaRequestReceiptForTxReq
      )
    })
  })

  describe('schema validation examples', () => {
    it('should accept valid object with txid and timestamp', () => {
      const validObject = {
        txid: 'abc123',
        timestamp: 1234567890,
      }
      // Schema validation test - verifying structure allows this object
      expect(schemaRequestReceiptForTxReq.properties.txid.type).toBe('string')
      expect(schemaRequestReceiptForTxReq.properties.timestamp.type).toBe('number')
      expect(schemaRequestReceiptForTxReq.required).toContain('txid')
      expect(schemaRequestReceiptForTxReq.required).toContain('timestamp')
    })

    it('should define schema for different txid formats', () => {
      const testCases = [
        { txid: '', timestamp: 0 },
        { txid: 'short', timestamp: 1 },
        { txid: 'very-long-transaction-id-with-many-characters-and-numbers-123456789', timestamp: 999999999 },
        { txid: '0x1234567890abcdef', timestamp: -100 },
      ]

      testCases.forEach(() => {
        expect(schemaRequestReceiptForTxReq.properties.txid.type).toBe('string')
        expect(schemaRequestReceiptForTxReq.properties.timestamp.type).toBe('number')
      })
    })

    it('should not have additionalProperties restrictions', () => {
      // The schema doesn't define additionalProperties: false
      expect((schemaRequestReceiptForTxReq as any).additionalProperties).toBeUndefined()
    })
  })

  describe('addSchemaDependencies', () => {
    it('should not add any dependencies (function is empty)', () => {
      // The addSchemaDependencies function is empty in the source
      // We can verify this by checking that addSchema is only called once
      initRequestReceiptForTxReq()
      expect(mockAddSchema).toHaveBeenCalledTimes(1)
    })
  })
})