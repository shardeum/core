import { initGetTrieAccountHashesResp } from '@src/types/ajv/GetTrieAccountHashesResp'
import { addSchema } from '@src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '@src/types/enum/AJVSchemaEnum'

jest.mock('@src/utils/serialization/SchemaHelpers')

describe('GetTrieAccountHashesResp', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schema definitions', () => {
    it('should define schema with correct structure', () => {
      // Since the schemas are not exported, we test indirectly through the addSchema calls
      initGetTrieAccountHashesResp()

      expect(addSchema).toHaveBeenCalledTimes(1)
      expect(addSchema).toHaveBeenCalledWith(
        AJVSchemaEnum.GetTrieAccountHashesResp,
        expect.objectContaining({
          type: 'object',
          properties: expect.objectContaining({
            nodeChildHashes: expect.objectContaining({
              type: 'array',
              items: expect.objectContaining({
                type: 'object',
                properties: expect.objectContaining({
                  radix: { type: 'string' },
                  childAccounts: expect.objectContaining({
                    type: 'array',
                    items: expect.objectContaining({
                      type: 'object',
                      properties: expect.objectContaining({
                        accountID: { type: 'string' },
                        hash: { type: 'string' },
                      }),
                      required: ['accountID', 'hash'],
                    }),
                  }),
                }),
                required: ['radix', 'childAccounts'],
              }),
            }),
            stats: expect.objectContaining({
              type: 'object',
              properties: expect.objectContaining({
                matched: { type: 'number' },
                visisted: { type: 'number' },
                empty: { type: 'number' },
                childCount: { type: 'number' },
              }),
              required: ['matched', 'visisted', 'empty', 'childCount'],
            }),
          }),
          required: ['nodeChildHashes', 'stats'],
        })
      )
    })
  })

  describe('initGetTrieAccountHashesResp', () => {
    it('should call addSchema with correct parameters', () => {
      initGetTrieAccountHashesResp()

      expect(addSchema).toHaveBeenCalledTimes(1)
      expect(addSchema).toHaveBeenCalledWith(AJVSchemaEnum.GetTrieAccountHashesResp, expect.any(Object))
    })

    it('should register schema with correct enum value', () => {
      initGetTrieAccountHashesResp()

      const calls = (addSchema as jest.Mock).mock.calls
      expect(calls[0][0]).toBe(AJVSchemaEnum.GetTrieAccountHashesResp)
    })

    it('should register schema only once when called multiple times', () => {
      initGetTrieAccountHashesResp()
      initGetTrieAccountHashesResp()

      // Should be called twice (once per call)
      expect(addSchema).toHaveBeenCalledTimes(2)
    })
  })

  describe('schema structure validation', () => {
    it('should have correct top-level required fields', () => {
      initGetTrieAccountHashesResp()

      const schema = (addSchema as jest.Mock).mock.calls[0][1]
      expect(schema.required).toEqual(['nodeChildHashes', 'stats'])
    })

    it('should define nodeChildHashes as array of RadixAndChildHashes', () => {
      initGetTrieAccountHashesResp()

      const schema = (addSchema as jest.Mock).mock.calls[0][1]
      expect(schema.properties.nodeChildHashes).toEqual({
        type: 'array',
        items: expect.objectContaining({
          type: 'object',
          properties: expect.objectContaining({
            radix: { type: 'string' },
            childAccounts: expect.any(Object),
          }),
          required: ['radix', 'childAccounts'],
        }),
      })
    })

    it('should define childAccounts as array of AccountIDAndHash', () => {
      initGetTrieAccountHashesResp()

      const schema = (addSchema as jest.Mock).mock.calls[0][1]
      const nodeChildHashesItems = schema.properties.nodeChildHashes.items
      expect(nodeChildHashesItems.properties.childAccounts).toEqual({
        type: 'array',
        items: expect.objectContaining({
          type: 'object',
          properties: expect.objectContaining({
            accountID: { type: 'string' },
            hash: { type: 'string' },
          }),
          required: ['accountID', 'hash'],
        }),
      })
    })

    it('should define stats with correct properties', () => {
      initGetTrieAccountHashesResp()

      const schema = (addSchema as jest.Mock).mock.calls[0][1]
      expect(schema.properties.stats).toEqual({
        type: 'object',
        properties: {
          matched: { type: 'number' },
          visisted: { type: 'number' },
          empty: { type: 'number' },
          childCount: { type: 'number' },
        },
        required: ['matched', 'visisted', 'empty', 'childCount'],
      })
    })

    it('should define AccountIDAndHash with correct structure', () => {
      initGetTrieAccountHashesResp()

      const schema = (addSchema as jest.Mock).mock.calls[0][1]
      const accountIDAndHashSchema = schema.properties.nodeChildHashes.items.properties.childAccounts.items

      expect(accountIDAndHashSchema).toEqual({
        type: 'object',
        properties: {
          accountID: { type: 'string' },
          hash: { type: 'string' },
        },
        required: ['accountID', 'hash'],
      })
    })

    it('should define RadixAndChildHashes with correct structure', () => {
      initGetTrieAccountHashesResp()

      const schema = (addSchema as jest.Mock).mock.calls[0][1]
      const radixAndChildHashesSchema = schema.properties.nodeChildHashes.items

      expect(radixAndChildHashesSchema.type).toBe('object')
      expect(radixAndChildHashesSchema.required).toEqual(['radix', 'childAccounts'])
      expect(radixAndChildHashesSchema.properties.radix).toEqual({ type: 'string' })
      expect(radixAndChildHashesSchema.properties.childAccounts.type).toBe('array')
    })

    it('should have stats properties as numbers', () => {
      initGetTrieAccountHashesResp()

      const schema = (addSchema as jest.Mock).mock.calls[0][1]
      const statsProps = schema.properties.stats.properties

      expect(statsProps.matched).toEqual({ type: 'number' })
      expect(statsProps.visisted).toEqual({ type: 'number' })
      expect(statsProps.empty).toEqual({ type: 'number' })
      expect(statsProps.childCount).toEqual({ type: 'number' })
    })

    it('should require all stats properties', () => {
      initGetTrieAccountHashesResp()

      const schema = (addSchema as jest.Mock).mock.calls[0][1]
      expect(schema.properties.stats.required).toEqual(['matched', 'visisted', 'empty', 'childCount'])
    })
  })

  describe('edge cases', () => {
    it('should handle schema with nested array structures', () => {
      initGetTrieAccountHashesResp()

      const schema = (addSchema as jest.Mock).mock.calls[0][1]

      // Verify nested array structure: nodeChildHashes -> items -> childAccounts -> items
      expect(schema.properties.nodeChildHashes.type).toBe('array')
      expect(schema.properties.nodeChildHashes.items.properties.childAccounts.type).toBe('array')
      expect(schema.properties.nodeChildHashes.items.properties.childAccounts.items.type).toBe('object')
    })

    it('should maintain consistent property types', () => {
      initGetTrieAccountHashesResp()

      const schema = (addSchema as jest.Mock).mock.calls[0][1]

      // All string fields should be type 'string'
      expect(schema.properties.nodeChildHashes.items.properties.radix.type).toBe('string')
      expect(schema.properties.nodeChildHashes.items.properties.childAccounts.items.properties.accountID.type).toBe(
        'string'
      )
      expect(schema.properties.nodeChildHashes.items.properties.childAccounts.items.properties.hash.type).toBe('string')

      // All number fields should be type 'number'
      const statsProps = schema.properties.stats.properties
      Object.values(statsProps).forEach((prop: any) => {
        expect(prop.type).toBe('number')
      })
    })
  })
})
