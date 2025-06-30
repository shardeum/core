import { initRequestStateForTxResp, schemaRequestStateForTxResp } from '../../../../src/types/ajv/RequestStateForTxResp'
import * as SchemaHelpers from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'
import { schemaWrappedData } from '../../../../src/types/ajv/WrappedData'

describe('RequestStateForTxResp', () => {
  describe('schemaRequestStateForTxResp', () => {
    it('should have correct schema structure', () => {
      expect(schemaRequestStateForTxResp).toBeDefined()
      expect(schemaRequestStateForTxResp.type).toBe('object')
      expect(schemaRequestStateForTxResp.properties).toBeDefined()
      expect(schemaRequestStateForTxResp.required).toBeDefined()
    })

    it('should have correct properties', () => {
      const { properties } = schemaRequestStateForTxResp
      
      expect(properties.stateList).toBeDefined()
      expect(properties.beforeHashes).toBeDefined()
      expect(properties.note).toBeDefined()
      expect(properties.success).toBeDefined()
    })

    it('should have stateList as array of schemaWrappedData', () => {
      const stateList = schemaRequestStateForTxResp.properties.stateList
      expect(stateList.type).toBe('array')
      expect(stateList.items).toBe(schemaWrappedData)
    })

    it('should have beforeHashes as object with string values', () => {
      const beforeHashes = schemaRequestStateForTxResp.properties.beforeHashes
      expect(beforeHashes.type).toBe('object')
      expect(beforeHashes.additionalProperties).toEqual({ type: 'string' })
    })

    it('should have note as string', () => {
      expect(schemaRequestStateForTxResp.properties.note).toEqual({ type: 'string' })
    })

    it('should have success as boolean', () => {
      expect(schemaRequestStateForTxResp.properties.success).toEqual({ type: 'boolean' })
    })

    it('should have correct required fields', () => {
      expect(schemaRequestStateForTxResp.required).toEqual([
        'stateList',
        'beforeHashes',
        'note',
        'success'
      ])
    })

    it('should reference schemaWrappedData correctly in stateList', () => {
      expect(schemaRequestStateForTxResp.properties.stateList.items).toBe(schemaWrappedData)
    })
  })

  describe('initRequestStateForTxResp', () => {
    let addSchemaSpy: any

    beforeEach(() => {
      jest.clearAllMocks()
      addSchemaSpy = jest.spyOn(SchemaHelpers, 'addSchema').mockImplementation(() => {})
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should call addSchema with correct parameters', () => {
      initRequestStateForTxResp()

      expect(addSchemaSpy).toHaveBeenCalledTimes(1)
      expect(addSchemaSpy).toHaveBeenCalledWith(
        AJVSchemaEnum.RequestStateForTxResp,
        schemaRequestStateForTxResp
      )
    })

    it('should not throw any errors', () => {
      expect(() => initRequestStateForTxResp()).not.toThrow()
    })

    it('should register the complete schema object', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initRequestStateForTxResp()

      expect(capturedSchema).toEqual(schemaRequestStateForTxResp)
      expect(capturedSchema.type).toBe('object')
      expect(capturedSchema.properties).toBeDefined()
      expect(capturedSchema.required).toHaveLength(4)
    })

    it('should maintain all property types', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initRequestStateForTxResp()

      // Verify each property type
      expect(capturedSchema.properties.stateList.type).toBe('array')
      expect(capturedSchema.properties.beforeHashes.type).toBe('object')
      expect(capturedSchema.properties.note.type).toBe('string')
      expect(capturedSchema.properties.success.type).toBe('boolean')
    })
  })
})