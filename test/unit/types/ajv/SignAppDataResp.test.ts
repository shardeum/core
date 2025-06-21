import { initSignAppDataResp, schemaSignAppDataResp } from '../../../../src/types/ajv/SignAppDataResp'
import * as SchemaHelpers from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'

describe('SignAppDataResp', () => {
  describe('schemaSignAppDataResp', () => {
    it('should have correct schema structure', () => {
      expect(schemaSignAppDataResp).toBeDefined()
      expect(schemaSignAppDataResp.type).toBe('object')
      expect(schemaSignAppDataResp.properties).toBeDefined()
      expect(schemaSignAppDataResp.required).toBeDefined()
      expect(schemaSignAppDataResp.additionalProperties).toBe(false)
    })

    it('should have correct properties', () => {
      const { properties } = schemaSignAppDataResp
      
      expect(properties.success).toBeDefined()
      expect(properties.signature).toBeDefined()
    })

    it('should have success as boolean', () => {
      expect(schemaSignAppDataResp.properties.success).toEqual({ type: 'boolean' })
    })

    it('should have signature with correct structure', () => {
      const signature = schemaSignAppDataResp.properties.signature
      expect(signature.type).toBe('object')
      expect(signature.properties).toBeDefined()
      expect(signature.required).toBeDefined()
    })

    it('should have correct signature properties', () => {
      const { properties } = schemaSignAppDataResp.properties.signature
      expect(properties.owner).toEqual({ type: 'string' })
      expect(properties.sig).toEqual({ type: 'string' })
    })

    it('should have correct required fields in signature', () => {
      expect(schemaSignAppDataResp.properties.signature.required).toEqual(['owner', 'sig'])
    })

    it('should have correct required fields at root level', () => {
      expect(schemaSignAppDataResp.required).toEqual(['success', 'signature'])
    })

    it('should not allow additional properties', () => {
      expect(schemaSignAppDataResp.additionalProperties).toBe(false)
    })
  })

  describe('initSignAppDataResp', () => {
    let addSchemaSpy: any

    beforeEach(() => {
      jest.clearAllMocks()
      addSchemaSpy = jest.spyOn(SchemaHelpers, 'addSchema').mockImplementation(() => {})
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should call addSchema with correct parameters', () => {
      initSignAppDataResp()

      expect(addSchemaSpy).toHaveBeenCalledTimes(1)
      expect(addSchemaSpy).toHaveBeenCalledWith(
        AJVSchemaEnum.SignAppDataResp,
        schemaSignAppDataResp
      )
    })

    it('should not throw any errors', () => {
      expect(() => initSignAppDataResp()).not.toThrow()
    })

    it('should register the complete schema object', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initSignAppDataResp()

      expect(capturedSchema).toEqual(schemaSignAppDataResp)
      expect(capturedSchema.type).toBe('object')
      expect(capturedSchema.properties).toBeDefined()
      expect(capturedSchema.required).toHaveLength(2)
      expect(capturedSchema.additionalProperties).toBe(false)
    })

    it('should maintain nested schema structure', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initSignAppDataResp()

      // Verify nested signature object structure
      const signature = capturedSchema.properties.signature
      expect(signature.type).toBe('object')
      expect(signature.properties.owner.type).toBe('string')
      expect(signature.properties.sig.type).toBe('string')
      expect(signature.required).toEqual(['owner', 'sig'])
    })
  })
})