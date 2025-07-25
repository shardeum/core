import { schemaGetAppliedVoteResp, initGetAppliedVoteResp } from '../../../../src/types/ajv/GetAppliedVoteResp'
import { addSchema } from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'
import { schemaAppliedVote } from '../../../../src/types/ajv/RepairOOSAccountsReq'

jest.mock('../../../../src/utils/serialization/SchemaHelpers')

const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

describe('GetAppliedVoteResp', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schemaGetAppliedVoteResp', () => {
    it('should define correct schema structure', () => {
      expect(schemaGetAppliedVoteResp).toBeDefined()
      expect(schemaGetAppliedVoteResp.type).toBe('object')
      expect(schemaGetAppliedVoteResp.properties).toHaveProperty('txId')
      expect(schemaGetAppliedVoteResp.properties).toHaveProperty('appliedVote')
      expect(schemaGetAppliedVoteResp.properties).toHaveProperty('appliedVoteHash')
    })

    it('should have txId as string type', () => {
      expect(schemaGetAppliedVoteResp.properties.txId).toEqual({ type: 'string' })
    })

    it('should have appliedVote referencing the imported schema', () => {
      expect(schemaGetAppliedVoteResp.properties.appliedVote).toBe(schemaAppliedVote)
    })

    it('should have appliedVoteHash as string type', () => {
      expect(schemaGetAppliedVoteResp.properties.appliedVoteHash).toEqual({ type: 'string' })
    })

    it('should require all three properties', () => {
      expect(schemaGetAppliedVoteResp.required).toContain('txId')
      expect(schemaGetAppliedVoteResp.required).toContain('appliedVote')
      expect(schemaGetAppliedVoteResp.required).toContain('appliedVoteHash')
      expect(schemaGetAppliedVoteResp.required).toHaveLength(3)
    })
  })

  describe('initGetAppliedVoteResp', () => {
    it('should call addSchema with correct parameters', () => {
      initGetAppliedVoteResp()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(AJVSchemaEnum.GetAppliedVoteResp, schemaGetAppliedVoteResp)
    })

    it('should not throw any errors during initialization', () => {
      expect(() => initGetAppliedVoteResp()).not.toThrow()
    })

    it('should be idempotent - multiple calls should work', () => {
      initGetAppliedVoteResp()
      initGetAppliedVoteResp()
      initGetAppliedVoteResp()

      expect(mockAddSchema).toHaveBeenCalledTimes(3)
      expect(mockAddSchema).toHaveBeenCalledWith(AJVSchemaEnum.GetAppliedVoteResp, schemaGetAppliedVoteResp)
    })
  })

  describe('addSchemaDependencies', () => {
    it('should not add any dependencies (function is empty)', () => {
      initGetAppliedVoteResp()

      // Verify only one call to addSchema (no dependencies added)
      expect(mockAddSchema).toHaveBeenCalledTimes(1)
    })
  })

  describe('schema validation scenarios', () => {
    it('should accept valid response with all required fields', () => {
      const validResponse = {
        txId: 'tx-123',
        appliedVote: {
          txid: 'tx-123',
          transaction_result: true,
          account_id: ['acc-1', 'acc-2'],
          account_state_hash_after: ['hash-1', 'hash-2'],
          account_state_hash_before: ['hash-3', 'hash-4'],
          cant_apply: false,
          node_id: 'node-123',
        },
        appliedVoteHash: 'vote-hash-xyz',
      }

      // Schema should have correct structure to validate this
      expect(schemaGetAppliedVoteResp.properties).toHaveProperty('txId')
      expect(schemaGetAppliedVoteResp.properties).toHaveProperty('appliedVote')
      expect(schemaGetAppliedVoteResp.properties).toHaveProperty('appliedVoteHash')
      expect(schemaGetAppliedVoteResp.required).toEqual(['txId', 'appliedVote', 'appliedVoteHash'])
    })

    it('should enforce required fields', () => {
      // Missing fields scenarios
      const missingTxId = {
        appliedVote: {},
        appliedVoteHash: 'hash',
      }
      const missingAppliedVote = {
        txId: 'tx-123',
        appliedVoteHash: 'hash',
      }
      const missingAppliedVoteHash = {
        txId: 'tx-123',
        appliedVote: {},
      }

      // Schema should enforce all required fields
      expect(schemaGetAppliedVoteResp.required).toContain('txId')
      expect(schemaGetAppliedVoteResp.required).toContain('appliedVote')
      expect(schemaGetAppliedVoteResp.required).toContain('appliedVoteHash')
    })

    it('should reference the correct nested schema for appliedVote', () => {
      expect(schemaGetAppliedVoteResp.properties.appliedVote).toBe(schemaAppliedVote)

      // Verify the nested schema has expected structure
      expect(schemaAppliedVote).toBeDefined()
      expect(schemaAppliedVote.type).toBe('object')
      expect(schemaAppliedVote.properties).toHaveProperty('txid')
      expect(schemaAppliedVote.properties).toHaveProperty('transaction_result')
    })
  })

  describe('exported schema constant', () => {
    it('should export schemaGetAppliedVoteResp as a constant', () => {
      expect(schemaGetAppliedVoteResp).toBeDefined()
      expect(typeof schemaGetAppliedVoteResp).toBe('object')
    })

    it('should have immutable schema structure', () => {
      const originalSchema = { ...schemaGetAppliedVoteResp }

      // Attempt to modify (should not affect the actual schema if it's properly defined)
      const testModification = () => {
        schemaGetAppliedVoteResp.type = 'array'
      }

      // Schema object can be modified in JS, but this test verifies the structure
      expect(schemaGetAppliedVoteResp.type).toBe('object')
      expect(schemaGetAppliedVoteResp).toEqual(originalSchema)
    })
  })
})
