import { initGetAccountData3Req } from '../../../../src/types/ajv/GetAccountData3Req'
import * as SchemaHelpers from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'

describe('GetAccountData3Req', () => {
  describe('initGetAccountData3Req', () => {
    let addSchemaSpy: any

    beforeEach(() => {
      jest.clearAllMocks()
      addSchemaSpy = jest.spyOn(SchemaHelpers, 'addSchema').mockImplementation(() => {})
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should call addSchema with correct parameters', () => {
      initGetAccountData3Req()

      expect(addSchemaSpy).toHaveBeenCalledTimes(1)
      expect(addSchemaSpy).toHaveBeenCalledWith(
        AJVSchemaEnum.GetAccountDataReq,
        {
          type: 'object',
          properties: {
            accountStart: { type: 'string' },
            accountEnd: { type: 'string' },
            tsStart: { type: 'number' },
            maxRecords: { type: 'number' },
            offset: { type: 'number' },
            accountOffset: { type: 'string' },
          },
          required: ['accountStart', 'accountEnd', 'tsStart', 'maxRecords', 'offset', 'accountOffset'],
        }
      )
    })

    it('should not throw any errors', () => {
      expect(() => initGetAccountData3Req()).not.toThrow()
    })

    it('should have correct schema structure', () => {
      // Capture the schema passed to addSchema
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initGetAccountData3Req()

      expect(capturedSchema).toBeDefined()
      expect(capturedSchema.type).toBe('object')
      expect(capturedSchema.properties).toBeDefined()
      expect(capturedSchema.required).toBeDefined()
    })

    it('should have all required properties defined', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initGetAccountData3Req()

      const { properties, required } = capturedSchema

      // Check all required fields have corresponding properties
      required.forEach((field: string) => {
        expect(properties).toHaveProperty(field)
      })

      // Check property types
      expect(properties.accountStart).toEqual({ type: 'string' })
      expect(properties.accountEnd).toEqual({ type: 'string' })
      expect(properties.tsStart).toEqual({ type: 'number' })
      expect(properties.maxRecords).toEqual({ type: 'number' })
      expect(properties.offset).toEqual({ type: 'number' })
      expect(properties.accountOffset).toEqual({ type: 'string' })
    })

    it('should have correct required fields', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initGetAccountData3Req()

      expect(capturedSchema.required).toEqual([
        'accountStart',
        'accountEnd',
        'tsStart',
        'maxRecords',
        'offset',
        'accountOffset'
      ])
    })
  })
})