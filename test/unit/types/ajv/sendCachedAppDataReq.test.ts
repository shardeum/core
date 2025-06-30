import { initSendCachedAppDataReq } from '../../../../src/types/ajv/sendCachedAppDataReq'
import * as SchemaHelpers from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'
import { schemaCachedAppData } from '../../../../src/types/ajv/CachedAppData'

describe('sendCachedAppDataReq', () => {
  describe('initSendCachedAppDataReq', () => {
    let addSchemaSpy: any

    beforeEach(() => {
      jest.clearAllMocks()
      addSchemaSpy = jest.spyOn(SchemaHelpers, 'addSchema').mockImplementation(() => {})
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should call addSchema with correct parameters', () => {
      initSendCachedAppDataReq()

      expect(addSchemaSpy).toHaveBeenCalledTimes(1)
      expect(addSchemaSpy).toHaveBeenCalledWith(
        AJVSchemaEnum.SendCachedAppDataReq,
        {
          type: 'object',
          properties: {
            topic: { type: 'string' },
            txId: { type: 'string' },
            executionShardKey: { type: 'string' },
            cachedAppData: schemaCachedAppData,
          },
          required: ['topic', 'cachedAppData', 'executionShardKey', 'txId'],
          additionalProperties: false,
        }
      )
    })

    it('should not throw any errors', () => {
      expect(() => initSendCachedAppDataReq()).not.toThrow()
    })

    it('should have correct schema structure', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initSendCachedAppDataReq()

      expect(capturedSchema).toBeDefined()
      expect(capturedSchema.type).toBe('object')
      expect(capturedSchema.properties).toBeDefined()
      expect(capturedSchema.required).toBeDefined()
      expect(capturedSchema.additionalProperties).toBe(false)
    })

    it('should have all required properties defined', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initSendCachedAppDataReq()

      const { properties, required } = capturedSchema

      // Check all required fields have corresponding properties
      required.forEach((field: string) => {
        expect(properties).toHaveProperty(field)
      })

      // Check property types
      expect(properties.topic).toEqual({ type: 'string' })
      expect(properties.txId).toEqual({ type: 'string' })
      expect(properties.executionShardKey).toEqual({ type: 'string' })
      expect(properties.cachedAppData).toBe(schemaCachedAppData)
    })

    it('should have correct required fields', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initSendCachedAppDataReq()

      expect(capturedSchema.required).toEqual([
        'topic',
        'cachedAppData',
        'executionShardKey',
        'txId'
      ])
    })

    it('should reference schemaCachedAppData correctly', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initSendCachedAppDataReq()

      // Verify that cachedAppData property references the imported schema
      expect(capturedSchema.properties.cachedAppData).toBe(schemaCachedAppData)
    })

    it('should not allow additional properties', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initSendCachedAppDataReq()

      expect(capturedSchema.additionalProperties).toBe(false)
    })
  })
})