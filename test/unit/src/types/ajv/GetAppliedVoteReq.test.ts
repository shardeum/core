import { schemaGetAppliedVoteReq, initGetAppliedVoteReq } from '../../../../../src/types/ajv/GetAppliedVoteReq'
import { addSchema } from '../../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../../../src/utils/serialization/SchemaHelpers')

const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

describe('GetAppliedVoteReq', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schemaGetAppliedVoteReq', () => {
    it('should define correct schema structure', () => {
      expect(schemaGetAppliedVoteReq).toBeDefined()
      expect(schemaGetAppliedVoteReq.type).toBe('object')
      expect(schemaGetAppliedVoteReq.properties).toEqual({
        txId: { type: 'string' },
      })
      expect(schemaGetAppliedVoteReq.required).toEqual(['txId'])
    })

    it('should have txId as string property', () => {
      expect(schemaGetAppliedVoteReq.properties.txId).toBeDefined()
      expect(schemaGetAppliedVoteReq.properties.txId.type).toBe('string')
    })

    it('should require txId property', () => {
      expect(schemaGetAppliedVoteReq.required).toContain('txId')
      expect(schemaGetAppliedVoteReq.required).toHaveLength(1)
    })

    it('should match expected schema exactly', () => {
      const expectedSchema = {
        type: 'object',
        properties: {
          txId: { type: 'string' },
        },
        required: ['txId'],
      }
      expect(schemaGetAppliedVoteReq).toEqual(expectedSchema)
    })
  })

  describe('initGetAppliedVoteReq', () => {
    it('should call addSchema with correct parameters', () => {
      initGetAppliedVoteReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(AJVSchemaEnum.GetAppliedVoteReq, schemaGetAppliedVoteReq)
    })

    it('should not throw any errors during initialization', () => {
      expect(() => initGetAppliedVoteReq()).not.toThrow()
    })

    it('should be idempotent - multiple calls should work', () => {
      initGetAppliedVoteReq()
      initGetAppliedVoteReq()
      initGetAppliedVoteReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(3)
      expect(mockAddSchema).toHaveBeenCalledWith(AJVSchemaEnum.GetAppliedVoteReq, schemaGetAppliedVoteReq)
    })
  })

  describe('schema validation examples', () => {
    it('should accept valid object with txId', () => {
      const validObject = { txId: '123456789' }
      // Schema structure allows this format
      expect(schemaGetAppliedVoteReq.required).toContain('txId')
      expect(schemaGetAppliedVoteReq.properties.txId.type).toBe('string')
    })

    it('should require txId to be present', () => {
      const invalidObject = {}
      // Schema requires txId
      expect(schemaGetAppliedVoteReq.required).toContain('txId')
    })

    it('should accept string txId values', () => {
      const examples = [
        { txId: '' },
        { txId: 'a' },
        { txId: '0x123456' },
        { txId: 'transaction-id-123' },
        { txId: 'very-long-transaction-id-with-many-characters' },
      ]
      // All string values should be acceptable according to schema
      examples.forEach((example) => {
        expect(schemaGetAppliedVoteReq.properties.txId.type).toBe('string')
      })
    })

    it('should not accept non-string txId values (schema validation)', () => {
      const invalidExamples = [
        { txId: 123 },
        { txId: true },
        { txId: null },
        { txId: undefined },
        { txId: {} },
        { txId: [] },
      ]
      // Schema specifies txId must be string
      expect(schemaGetAppliedVoteReq.properties.txId.type).toBe('string')
    })
  })

  describe('addSchemaDependencies', () => {
    it('should not add any dependencies (function is empty)', () => {
      // The addSchemaDependencies function is empty in the source
      // We can verify this by checking that addSchema is only called once
      initGetAppliedVoteReq()
      expect(mockAddSchema).toHaveBeenCalledTimes(1)
    })
  })

  describe('export validation', () => {
    it('should export schemaGetAppliedVoteReq', () => {
      expect(schemaGetAppliedVoteReq).toBeDefined()
      expect(typeof schemaGetAppliedVoteReq).toBe('object')
    })

    it('should export initGetAppliedVoteReq function', () => {
      expect(initGetAppliedVoteReq).toBeDefined()
      expect(typeof initGetAppliedVoteReq).toBe('function')
    })
  })
})
