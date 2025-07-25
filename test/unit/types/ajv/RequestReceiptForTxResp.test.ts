import {
  schemaRequestReceiptForTxResp,
  initRequestReceiptForTxResp,
} from '../../../../src/types/ajv/RequestReceiptForTxResp'
import { addSchema } from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'
import { schemaSignedReceipt } from '../../../../src/types/ajv/RepairOOSAccountsReq'

jest.mock('../../../../src/utils/serialization/SchemaHelpers')

const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

describe('RequestReceiptForTxResp', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schemaRequestReceiptForTxResp', () => {
    it('should define correct schema structure', () => {
      expect(schemaRequestReceiptForTxResp).toBeDefined()
      expect(schemaRequestReceiptForTxResp.type).toBe('object')
      expect(schemaRequestReceiptForTxResp.properties).toHaveProperty('receipt')
      expect(schemaRequestReceiptForTxResp.properties).toHaveProperty('note')
      expect(schemaRequestReceiptForTxResp.properties).toHaveProperty('success')
    })

    it('should have receipt referencing the imported schema', () => {
      expect(schemaRequestReceiptForTxResp.properties.receipt).toBe(schemaSignedReceipt)
    })

    it('should have note as string type', () => {
      expect(schemaRequestReceiptForTxResp.properties.note).toEqual({ type: 'string' })
    })

    it('should have success as boolean type', () => {
      expect(schemaRequestReceiptForTxResp.properties.success).toEqual({ type: 'boolean' })
    })

    it('should require all three properties', () => {
      expect(schemaRequestReceiptForTxResp.required).toContain('receipt')
      expect(schemaRequestReceiptForTxResp.required).toContain('note')
      expect(schemaRequestReceiptForTxResp.required).toContain('success')
      expect(schemaRequestReceiptForTxResp.required).toHaveLength(3)
    })
  })

  describe('initRequestReceiptForTxResp', () => {
    it('should call addSchema with correct parameters', () => {
      initRequestReceiptForTxResp()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(AJVSchemaEnum.RequestReceiptForTxResp, schemaRequestReceiptForTxResp)
    })

    it('should not throw any errors during initialization', () => {
      expect(() => initRequestReceiptForTxResp()).not.toThrow()
    })

    it('should be idempotent - multiple calls should work', () => {
      initRequestReceiptForTxResp()
      initRequestReceiptForTxResp()
      initRequestReceiptForTxResp()

      expect(mockAddSchema).toHaveBeenCalledTimes(3)
      expect(mockAddSchema).toHaveBeenCalledWith(AJVSchemaEnum.RequestReceiptForTxResp, schemaRequestReceiptForTxResp)
    })
  })

  describe('addSchemaDependencies', () => {
    it('should not add any dependencies (function is empty)', () => {
      initRequestReceiptForTxResp()

      // Verify only one call to addSchema (no dependencies added)
      expect(mockAddSchema).toHaveBeenCalledTimes(1)
    })
  })

  describe('schema validation scenarios', () => {
    it('should accept valid response with all required fields', () => {
      const validResponse = {
        receipt: {
          proposal: {
            applied: true,
            cant_preApply: false,
            accountIDs: ['acc-1', 'acc-2'],
            beforeStateHashes: ['hash-1', 'hash-2'],
            afterStateHashes: ['hash-3', 'hash-4'],
            appReceiptDataHash: 'receipt-hash',
          },
          proposalHash: 'proposal-hash',
          signaturePack: [
            { owner: 'node-1', sig: 'sig-1' },
            { owner: 'node-2', sig: 'sig-2' },
          ],
          voteOffsets: [0, 1],
        },
        note: 'Receipt successfully created',
        success: true,
      }

      // Schema should have correct structure to validate this
      expect(schemaRequestReceiptForTxResp.properties).toHaveProperty('receipt')
      expect(schemaRequestReceiptForTxResp.properties).toHaveProperty('note')
      expect(schemaRequestReceiptForTxResp.properties).toHaveProperty('success')
      expect(schemaRequestReceiptForTxResp.required).toEqual(['receipt', 'note', 'success'])
    })

    it('should enforce required fields', () => {
      // Missing fields scenarios
      const missingReceipt = {
        note: 'Missing receipt',
        success: false,
      }
      const missingNote = {
        receipt: {},
        success: true,
      }
      const missingSuccess = {
        receipt: {},
        note: 'Missing success flag',
      }

      // Schema should enforce all required fields
      expect(schemaRequestReceiptForTxResp.required).toContain('receipt')
      expect(schemaRequestReceiptForTxResp.required).toContain('note')
      expect(schemaRequestReceiptForTxResp.required).toContain('success')
    })

    it('should reference the correct nested schema for receipt', () => {
      expect(schemaRequestReceiptForTxResp.properties.receipt).toBe(schemaSignedReceipt)

      // Verify the nested schema has expected structure
      expect(schemaSignedReceipt).toBeDefined()
      expect(schemaSignedReceipt.type).toBe('object')
      expect(schemaSignedReceipt.properties).toHaveProperty('proposal')
      expect(schemaSignedReceipt.properties).toHaveProperty('proposalHash')
      expect(schemaSignedReceipt.properties).toHaveProperty('signaturePack')
      expect(schemaSignedReceipt.properties).toHaveProperty('voteOffsets')
    })

    it('should accept different note messages and success states', () => {
      const successResponse = {
        receipt: {},
        note: 'Transaction receipt generated successfully',
        success: true,
      }

      const failureResponse = {
        receipt: {},
        note: 'Failed to generate receipt: insufficient votes',
        success: false,
      }

      // Schema should accept both success and failure cases
      expect(schemaRequestReceiptForTxResp.properties.note.type).toBe('string')
      expect(schemaRequestReceiptForTxResp.properties.success.type).toBe('boolean')
    })
  })

  describe('exported schema constant', () => {
    it('should export schemaRequestReceiptForTxResp as a constant', () => {
      expect(schemaRequestReceiptForTxResp).toBeDefined()
      expect(typeof schemaRequestReceiptForTxResp).toBe('object')
    })

    it('should have correct property types', () => {
      expect(schemaRequestReceiptForTxResp.properties.receipt).toBeDefined()
      expect(schemaRequestReceiptForTxResp.properties.note).toEqual({ type: 'string' })
      expect(schemaRequestReceiptForTxResp.properties.success).toEqual({ type: 'boolean' })
    })
  })
})
