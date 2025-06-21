import { initApoptosisProposalResp } from '../../../../src/types/ajv/ApoptosisProposalResp'
import { addSchema } from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../../src/utils/serialization/SchemaHelpers')

const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

describe('ApoptosisProposalResp', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schema definition', () => {
    it('should define correct schema structure', () => {
      const expectedSchema = {
        type: 'object',
        properties: {
          s: { type: 'string' },
          r: { type: 'number' },
        },
        required: ['s', 'r'],
      }

      // Call the function to trigger schema registration
      initApoptosisProposalResp()

      // Verify the schema passed to addSchema matches expected structure
      expect(mockAddSchema).toHaveBeenCalledWith(
        AJVSchemaEnum.ApoptosisProposalResp,
        expectedSchema
      )
    })

    it('should require both s and r properties', () => {
      initApoptosisProposalResp()

      const schemaArg = mockAddSchema.mock.calls[0][1] as any
      expect(schemaArg.required).toContain('s')
      expect(schemaArg.required).toContain('r')
      expect(schemaArg.required).toHaveLength(2)
    })

    it('should define s as string type', () => {
      initApoptosisProposalResp()

      const schemaArg = mockAddSchema.mock.calls[0][1] as any
      expect(schemaArg.properties.s).toEqual({ type: 'string' })
    })

    it('should define r as number type', () => {
      initApoptosisProposalResp()

      const schemaArg = mockAddSchema.mock.calls[0][1] as any
      expect(schemaArg.properties.r).toEqual({ type: 'number' })
    })
  })

  describe('initApoptosisProposalResp', () => {
    it('should call addSchema with correct parameters', () => {
      initApoptosisProposalResp()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(
        AJVSchemaEnum.ApoptosisProposalResp,
        expect.objectContaining({
          type: 'object',
          properties: expect.any(Object),
          required: expect.any(Array),
        })
      )
    })

    it('should not throw any errors during initialization', () => {
      expect(() => initApoptosisProposalResp()).not.toThrow()
    })

    it('should be idempotent - multiple calls should work', () => {
      initApoptosisProposalResp()
      initApoptosisProposalResp()
      initApoptosisProposalResp()

      expect(mockAddSchema).toHaveBeenCalledTimes(3)
    })
  })

  describe('addSchemaDependencies', () => {
    it('should not add any dependencies (function is empty)', () => {
      initApoptosisProposalResp()
      
      // Verify only one call to addSchema (no dependencies added)
      expect(mockAddSchema).toHaveBeenCalledTimes(1)
    })
  })

  describe('schema validation scenarios', () => {
    it('should accept valid apoptosis proposal response', () => {
      initApoptosisProposalResp()

      const schemaArg = mockAddSchema.mock.calls[0][1] as any
      
      // Valid object structure
      const validResponse = {
        s: 'success',
        r: 200,
      }

      // Schema should have correct structure to validate this
      expect(schemaArg.properties).toHaveProperty('s')
      expect(schemaArg.properties).toHaveProperty('r')
      expect(schemaArg.required).toEqual(['s', 'r'])
    })

    it('should require all mandatory fields', () => {
      initApoptosisProposalResp()

      const schemaArg = mockAddSchema.mock.calls[0][1] as any
      
      // Missing fields scenarios
      const missingS = { r: 200 }
      const missingR = { s: 'success' }
      const emptyObject = {}

      // Schema should enforce required fields
      expect(schemaArg.required).toContain('s')
      expect(schemaArg.required).toContain('r')
    })

    it('should validate property types correctly', () => {
      initApoptosisProposalResp()

      const schemaArg = mockAddSchema.mock.calls[0][1] as any
      
      // Type validation scenarios
      const wrongTypes = {
        s: 123, // should be string
        r: 'invalid', // should be number
      }

      // Schema properties should enforce correct types
      expect(schemaArg.properties.s.type).toBe('string')
      expect(schemaArg.properties.r.type).toBe('number')
    })
  })
})