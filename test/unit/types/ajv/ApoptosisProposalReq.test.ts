import { initApoptosisProposalReq } from '../../../../src/types/ajv/ApoptosisProposalReq'
import { addSchema } from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../../src/utils/serialization/SchemaHelpers')

const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

describe('ApoptosisProposalReq', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schema definition', () => {
    it('should define correct schema structure', () => {
      const expectedSchema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          when: { type: 'number' },
        },
        required: ['id', 'when'],
      }

      // Call the function to trigger schema registration
      initApoptosisProposalReq()

      // Verify the schema passed to addSchema matches expected structure
      expect(mockAddSchema).toHaveBeenCalledWith(AJVSchemaEnum.ApoptosisProposalReq, expectedSchema)
    })

    it('should require both id and when properties', () => {
      initApoptosisProposalReq()

      const schemaArg = mockAddSchema.mock.calls[0][1] as any
      expect(schemaArg.required).toContain('id')
      expect(schemaArg.required).toContain('when')
      expect(schemaArg.required).toHaveLength(2)
    })

    it('should define id as string type', () => {
      initApoptosisProposalReq()

      const schemaArg = mockAddSchema.mock.calls[0][1] as any
      expect(schemaArg.properties.id).toEqual({ type: 'string' })
    })

    it('should define when as number type', () => {
      initApoptosisProposalReq()

      const schemaArg = mockAddSchema.mock.calls[0][1] as any
      expect(schemaArg.properties.when).toEqual({ type: 'number' })
    })
  })

  describe('initApoptosisProposalReq', () => {
    it('should call addSchema with correct parameters', () => {
      initApoptosisProposalReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(
        AJVSchemaEnum.ApoptosisProposalReq,
        expect.objectContaining({
          type: 'object',
          properties: expect.any(Object),
          required: expect.any(Array),
        })
      )
    })

    it('should not throw any errors during initialization', () => {
      expect(() => initApoptosisProposalReq()).not.toThrow()
    })

    it('should be idempotent - multiple calls should work', () => {
      initApoptosisProposalReq()
      initApoptosisProposalReq()
      initApoptosisProposalReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(3)
    })
  })

  describe('addSchemaDependencies', () => {
    it('should not add any dependencies (function is empty)', () => {
      initApoptosisProposalReq()

      // Verify only one call to addSchema (no dependencies added)
      expect(mockAddSchema).toHaveBeenCalledTimes(1)
    })
  })

  describe('schema validation scenarios', () => {
    it('should accept valid apoptosis proposal request', () => {
      initApoptosisProposalReq()

      const schemaArg = mockAddSchema.mock.calls[0][1] as any

      // Valid object structure
      const validRequest = {
        id: 'node-123',
        when: 1234567890,
      }

      // Schema should have correct structure to validate this
      expect(schemaArg.properties).toHaveProperty('id')
      expect(schemaArg.properties).toHaveProperty('when')
      expect(schemaArg.required).toEqual(['id', 'when'])
    })

    it('should require all mandatory fields', () => {
      initApoptosisProposalReq()

      const schemaArg = mockAddSchema.mock.calls[0][1] as any

      // Missing fields scenarios
      const missingId = { when: 1234567890 }
      const missingWhen = { id: 'node-123' }
      const emptyObject = {}

      // Schema should enforce required fields
      expect(schemaArg.required).toContain('id')
      expect(schemaArg.required).toContain('when')
    })
  })
})
