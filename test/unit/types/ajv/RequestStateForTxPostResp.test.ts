import { initRequestStateForTxPostResp } from '../../../../src/types/ajv/RequestStateForTxPostResp'
import * as SchemaHelpers from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'
import { schemaWrappedDataResponse } from '../../../../src/types/ajv/WrappedDataResponse'

describe('RequestStateForTxPostResp', () => {
  describe('initRequestStateForTxPostResp', () => {
    let addSchemaSpy: any

    beforeEach(() => {
      jest.clearAllMocks()
      addSchemaSpy = jest.spyOn(SchemaHelpers, 'addSchema').mockImplementation(() => {})
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should call addSchema with correct parameters', () => {
      initRequestStateForTxPostResp()

      expect(addSchemaSpy).toHaveBeenCalledTimes(1)
      expect(addSchemaSpy).toHaveBeenCalledWith(AJVSchemaEnum.RequestStateForTxPostResp, {
        type: 'object',
        properties: {
          stateList: {
            type: 'array',
            items: schemaWrappedDataResponse,
          },
          beforeHashes: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
          note: { type: 'string' },
          success: { type: 'boolean' },
        },
        required: ['stateList', 'beforeHashes', 'note', 'success'],
      })
    })

    it('should not throw any errors', () => {
      expect(() => initRequestStateForTxPostResp()).not.toThrow()
    })

    it('should have correct schema structure', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initRequestStateForTxPostResp()

      expect(capturedSchema).toBeDefined()
      expect(capturedSchema.type).toBe('object')
      expect(capturedSchema.properties).toBeDefined()
      expect(capturedSchema.required).toBeDefined()
    })

    it('should have correct properties', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initRequestStateForTxPostResp()

      const { properties } = capturedSchema

      expect(properties.stateList).toBeDefined()
      expect(properties.beforeHashes).toBeDefined()
      expect(properties.note).toBeDefined()
      expect(properties.success).toBeDefined()
    })

    it('should have stateList as array of schemaWrappedDataResponse', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initRequestStateForTxPostResp()

      const stateList = capturedSchema.properties.stateList
      expect(stateList.type).toBe('array')
      expect(stateList.items).toBe(schemaWrappedDataResponse)
    })

    it('should have beforeHashes as object with string values', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initRequestStateForTxPostResp()

      const beforeHashes = capturedSchema.properties.beforeHashes
      expect(beforeHashes.type).toBe('object')
      expect(beforeHashes.additionalProperties).toEqual({ type: 'string' })
    })

    it('should have note as string', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initRequestStateForTxPostResp()

      expect(capturedSchema.properties.note).toEqual({ type: 'string' })
    })

    it('should have success as boolean', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initRequestStateForTxPostResp()

      expect(capturedSchema.properties.success).toEqual({ type: 'boolean' })
    })

    it('should have correct required fields', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initRequestStateForTxPostResp()

      expect(capturedSchema.required).toEqual(['stateList', 'beforeHashes', 'note', 'success'])
    })

    it('should reference schemaWrappedDataResponse correctly', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initRequestStateForTxPostResp()

      expect(capturedSchema.properties.stateList.items).toBe(schemaWrappedDataResponse)
    })
  })
})
