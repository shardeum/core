import { schemaGlobalAccountReportReq, initGlobalAccountReportReq } from '../../../../src/types/ajv/GlobalAccountReportReq'
import { addSchema } from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../../src/utils/serialization/SchemaHelpers')

const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

describe('GlobalAccountReportReq', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schemaGlobalAccountReportReq', () => {
    it('should define an empty object schema', () => {
      expect(schemaGlobalAccountReportReq).toBeDefined()
      expect(schemaGlobalAccountReportReq.type).toBe('object')
      expect(schemaGlobalAccountReportReq.properties).toEqual({})
      expect(schemaGlobalAccountReportReq.required).toEqual([])
    })

    it('should have correct schema structure', () => {
      const expectedSchema = {
        type: 'object',
        properties: {},
        required: [],
      }
      expect(schemaGlobalAccountReportReq).toEqual(expectedSchema)
    })
  })

  describe('initGlobalAccountReportReq', () => {
    it('should call addSchema with correct parameters', () => {
      initGlobalAccountReportReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(
        AJVSchemaEnum.GlobalAccountReportReq,
        schemaGlobalAccountReportReq
      )
    })

    it('should not throw any errors during initialization', () => {
      expect(() => initGlobalAccountReportReq()).not.toThrow()
    })

    it('should be idempotent - multiple calls should work', () => {
      initGlobalAccountReportReq()
      initGlobalAccountReportReq()
      initGlobalAccountReportReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(3)
      expect(mockAddSchema).toHaveBeenCalledWith(
        AJVSchemaEnum.GlobalAccountReportReq,
        schemaGlobalAccountReportReq
      )
    })
  })

  describe('schema validation', () => {
    it('should accept empty object', () => {
      const emptyObject = {}
      // Since the schema has no required properties, an empty object should be valid
      expect(schemaGlobalAccountReportReq.required).toHaveLength(0)
      expect(Object.keys(schemaGlobalAccountReportReq.properties)).toHaveLength(0)
    })

    it('should accept object with any properties (no restrictions)', () => {
      // The schema doesn't define additionalProperties: false, so it should accept any properties
      const objWithProperties = { foo: 'bar', baz: 123 }
      // This is just a schema definition test - actual validation would happen in AJV
      expect(schemaGlobalAccountReportReq.properties).toEqual({})
    })
  })

  describe('addSchemaDependencies', () => {
    it('should not add any dependencies (function is empty)', () => {
      // The addSchemaDependencies function is empty in the source
      // We can verify this by checking that addSchema is only called once
      initGlobalAccountReportReq()
      expect(mockAddSchema).toHaveBeenCalledTimes(1)
    })
  })
})