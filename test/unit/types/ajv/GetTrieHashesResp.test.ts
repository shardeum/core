import { initGetTrieHashesResp } from '../../../../src/types/ajv/GetTrieHashesResp'
import * as SchemaHelpers from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'

describe('GetTrieHashesResp', () => {
  describe('initGetTrieHashesResp', () => {
    let addSchemaSpy: any

    beforeEach(() => {
      jest.clearAllMocks()
      addSchemaSpy = jest.spyOn(SchemaHelpers, 'addSchema').mockImplementation(() => {})
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should call addSchema with correct parameters', () => {
      initGetTrieHashesResp()

      expect(addSchemaSpy).toHaveBeenCalledTimes(1)
      expect(addSchemaSpy).toHaveBeenCalledWith(
        AJVSchemaEnum.GetTrieHashesResp,
        {
          type: 'object',
          properties: {
            nodeHashes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  radix: { type: 'string' },
                  hash: { type: 'string' },
                },
                required: ['radix', 'hash'],
              },
            },
            nodeId: { type: 'string' },
          },
          required: ['nodeHashes'],
        }
      )
    })

    it('should not throw any errors', () => {
      expect(() => initGetTrieHashesResp()).not.toThrow()
    })

    it('should have correct schema structure', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initGetTrieHashesResp()

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

      initGetTrieHashesResp()

      const { properties } = capturedSchema
      
      expect(properties.nodeHashes).toBeDefined()
      expect(properties.nodeId).toBeDefined()
    })

    it('should have nodeHashes as array of objects', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initGetTrieHashesResp()

      const nodeHashes = capturedSchema.properties.nodeHashes
      expect(nodeHashes.type).toBe('array')
      expect(nodeHashes.items).toBeDefined()
      expect(nodeHashes.items.type).toBe('object')
    })

    it('should have correct structure for nodeHashes items', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initGetTrieHashesResp()

      const nodeHashItem = capturedSchema.properties.nodeHashes.items
      expect(nodeHashItem.properties.radix).toEqual({ type: 'string' })
      expect(nodeHashItem.properties.hash).toEqual({ type: 'string' })
      expect(nodeHashItem.required).toEqual(['radix', 'hash'])
    })

    it('should have nodeId as string', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initGetTrieHashesResp()

      expect(capturedSchema.properties.nodeId).toEqual({ type: 'string' })
    })

    it('should have correct required fields', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initGetTrieHashesResp()

      expect(capturedSchema.required).toEqual(['nodeHashes'])
    })

    it('should not require nodeId field', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initGetTrieHashesResp()

      expect(capturedSchema.required).not.toContain('nodeId')
    })
  })
})