import { initGetCachedAppDataResp, schemaGetCachedAppDataResp } from '../../../../src/types/ajv/GetCachedAppDataResp'
import * as SchemaHelpers from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'

describe('GetCachedAppDataResp', () => {
  describe('schemaGetCachedAppDataResp', () => {
    it('should have correct schema structure', () => {
      expect(schemaGetCachedAppDataResp).toBeDefined()
      expect(schemaGetCachedAppDataResp.type).toBe('object')
      expect(schemaGetCachedAppDataResp.properties).toBeDefined()
      expect(schemaGetCachedAppDataResp.additionalProperties).toBe(false)
    })

    it('should have cachedAppData property with correct structure', () => {
      const cachedAppData = schemaGetCachedAppDataResp.properties.cachedAppData
      expect(cachedAppData).toBeDefined()
      expect(cachedAppData.type).toBe('object')
      expect(cachedAppData.properties).toBeDefined()
      expect(cachedAppData.required).toBeDefined()
      expect(cachedAppData.additionalProperties).toBe(false)
    })

    it('should have correct properties in cachedAppData', () => {
      const { properties } = schemaGetCachedAppDataResp.properties.cachedAppData
      expect(properties.dataID).toEqual({ type: 'string' })
      expect(properties.appData).toEqual({})
      expect(properties.cycle).toEqual({ type: 'number' })
    })

    it('should have correct required fields in cachedAppData', () => {
      const { required } = schemaGetCachedAppDataResp.properties.cachedAppData
      expect(required).toEqual(['dataID', 'appData', 'cycle'])
    })

    it('should not allow additional properties at root level', () => {
      expect(schemaGetCachedAppDataResp.additionalProperties).toBe(false)
    })

    it('should not allow additional properties in cachedAppData', () => {
      expect(schemaGetCachedAppDataResp.properties.cachedAppData.additionalProperties).toBe(false)
    })
  })

  describe('initGetCachedAppDataResp', () => {
    let addSchemaSpy: any

    beforeEach(() => {
      jest.clearAllMocks()
      addSchemaSpy = jest.spyOn(SchemaHelpers, 'addSchema').mockImplementation(() => {})
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should call addSchema with correct parameters', () => {
      initGetCachedAppDataResp()

      expect(addSchemaSpy).toHaveBeenCalledTimes(1)
      expect(addSchemaSpy).toHaveBeenCalledWith(AJVSchemaEnum.GetCachedAppDataResp, schemaGetCachedAppDataResp)
    })

    it('should not throw any errors', () => {
      expect(() => initGetCachedAppDataResp()).not.toThrow()
    })

    it('should register the complete schema object', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initGetCachedAppDataResp()

      expect(capturedSchema).toEqual(schemaGetCachedAppDataResp)
      expect(capturedSchema.type).toBe('object')
      expect(capturedSchema.properties.cachedAppData).toBeDefined()
    })
  })
})
