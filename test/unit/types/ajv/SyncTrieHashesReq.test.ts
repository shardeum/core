import { initSyncTrieHashesReq } from '../../../../src/types/ajv/SyncTrieHashesReq'
import * as SchemaHelpers from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'

describe('SyncTrieHashesReq', () => {
  describe('initSyncTrieHashesReq', () => {
    let addSchemaSpy: any

    beforeEach(() => {
      jest.clearAllMocks()
      addSchemaSpy = jest.spyOn(SchemaHelpers, 'addSchema').mockImplementation(() => {})
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should call addSchema with correct parameters', () => {
      initSyncTrieHashesReq()

      expect(addSchemaSpy).toHaveBeenCalledTimes(1)
      expect(addSchemaSpy).toHaveBeenCalledWith(
        AJVSchemaEnum.SyncTrieHashesReq,
        {
          type: 'object',
          properties: {
            cycle: { type: 'number' },
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
          },
          required: ['cycle', 'nodeHashes'],
        }
      )
    })

    it('should not throw any errors', () => {
      expect(() => initSyncTrieHashesReq()).not.toThrow()
    })

    it('should have correct schema structure', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initSyncTrieHashesReq()

      expect(capturedSchema).toBeDefined()
      expect(capturedSchema.type).toBe('object')
      expect(capturedSchema.properties).toBeDefined()
      expect(capturedSchema.required).toBeDefined()
    })

    it('should have all properties defined', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initSyncTrieHashesReq()

      const { properties } = capturedSchema
      
      expect(properties.cycle).toEqual({ type: 'number' })
      expect(properties.nodeHashes).toBeDefined()
    })

    it('should have nodeHashes as array of objects', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initSyncTrieHashesReq()

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

      initSyncTrieHashesReq()

      const nodeHashItem = capturedSchema.properties.nodeHashes.items
      expect(nodeHashItem.properties.radix).toEqual({ type: 'string' })
      expect(nodeHashItem.properties.hash).toEqual({ type: 'string' })
      expect(nodeHashItem.required).toEqual(['radix', 'hash'])
    })

    it('should have correct required fields', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initSyncTrieHashesReq()

      expect(capturedSchema.required).toEqual(['cycle', 'nodeHashes'])
    })

    it('should have all required fields with corresponding properties', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initSyncTrieHashesReq()

      const { properties, required } = capturedSchema
      
      // Check all required fields have corresponding properties
      required.forEach((field: string) => {
        expect(properties).toHaveProperty(field)
      })
    })

    it('should have matching structure with GetTrieHashesResp nodeHashes', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initSyncTrieHashesReq()

      // The nodeHashes structure should be consistent across related schemas
      const nodeHashItem = capturedSchema.properties.nodeHashes.items
      expect(nodeHashItem).toEqual({
        type: 'object',
        properties: {
          radix: { type: 'string' },
          hash: { type: 'string' },
        },
        required: ['radix', 'hash'],
      })
    })
  })
})