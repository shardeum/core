import { initWrappedDataResponse, schemaWrappedDataResponse } from '../../../../src/types/ajv/WrappedDataResponse'
import * as SchemaHelpers from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'
import { schemaWrappedData } from '../../../../src/types/ajv/WrappedData'

describe('WrappedDataResponse', () => {
  describe('schemaWrappedDataResponse', () => {
    it('should have correct schema structure', () => {
      expect(schemaWrappedDataResponse).toBeDefined()
      expect(schemaWrappedDataResponse.type).toBe('object')
      expect(schemaWrappedDataResponse.properties).toBeDefined()
    })

    it('should extend schemaWrappedData properties', () => {
      const baseProperties = Object.keys(schemaWrappedData.properties)
      baseProperties.forEach((prop) => {
        expect(schemaWrappedDataResponse.properties).toHaveProperty(prop)
      })
    })

    it('should have additional properties', () => {
      expect(schemaWrappedDataResponse.properties.accountCreated).toEqual({ type: 'boolean' })
      expect(schemaWrappedDataResponse.properties.isPartial).toEqual({ type: 'boolean' })
    })

    it('should have correct required fields', () => {
      expect(schemaWrappedDataResponse.required).toBeDefined()
      expect(Array.isArray(schemaWrappedDataResponse.required)).toBe(true)

      // Should include all base required fields
      schemaWrappedData.required.forEach((field) => {
        expect(schemaWrappedDataResponse.required).toContain(field)
      })

      // Should include additional required fields
      expect(schemaWrappedDataResponse.required).toContain('accountCreated')
      expect(schemaWrappedDataResponse.required).toContain('isPartial')
    })

    it('should have all properties from schemaWrappedData', () => {
      // Check that all properties from schemaWrappedData are present
      expect(schemaWrappedDataResponse.properties).toHaveProperty('accountId')
      expect(schemaWrappedDataResponse.properties).toHaveProperty('stateId')
      expect(schemaWrappedDataResponse.properties).toHaveProperty('data')
      expect(schemaWrappedDataResponse.properties).toHaveProperty('timestamp')
      expect(schemaWrappedDataResponse.properties).toHaveProperty('syncData')
    })
  })

  describe('initWrappedDataResponse', () => {
    let addSchemaSpy: any

    beforeEach(() => {
      jest.clearAllMocks()
      addSchemaSpy = jest.spyOn(SchemaHelpers, 'addSchema').mockImplementation(() => {})
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should call addSchema with correct parameters', () => {
      initWrappedDataResponse()

      expect(addSchemaSpy).toHaveBeenCalledTimes(1)
      expect(addSchemaSpy).toHaveBeenCalledWith(AJVSchemaEnum.WrappedDataResponse, schemaWrappedDataResponse)
    })

    it('should not throw any errors', () => {
      expect(() => initWrappedDataResponse()).not.toThrow()
    })
  })
})
