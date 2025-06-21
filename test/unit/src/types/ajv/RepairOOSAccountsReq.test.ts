import { jest } from '@jest/globals'

// Mock the SchemaHelpers module
jest.mock('../../../../../src/utils/serialization/SchemaHelpers', () => ({
  addSchema: jest.fn(),
}))

import * as RepairOOSAccountsReq from '../../../../../src/types/ajv/RepairOOSAccountsReq'
import { AJVSchemaEnum } from '../../../../../src/types/enum/AJVSchemaEnum'

describe('RepairOOSAccountsReq', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('initRepairOOSAccountReq', () => {
    it('should call addSchemaDependencies and addSchemas', () => {
      RepairOOSAccountsReq.initRepairOOSAccountReq()

      const { addSchema } = require('../../../../../src/utils/serialization/SchemaHelpers')
      
      // Verify that addSchema was called once
      expect(addSchema).toHaveBeenCalledTimes(1)
      expect(addSchema).toHaveBeenCalledWith(
        AJVSchemaEnum.RepairOOSAccountsReq,
        expect.objectContaining({
          type: 'object',
          properties: expect.objectContaining({
            repairInstructions: expect.objectContaining({
              type: 'array',
              items: expect.any(Object),
            }),
          }),
          required: ['repairInstructions'],
        })
      )
    })

    it('should register schema with correct enum value', () => {
      const { addSchema } = require('../../../../../src/utils/serialization/SchemaHelpers')
      RepairOOSAccountsReq.initRepairOOSAccountReq()

      const firstCall = addSchema.mock.calls[0]
      expect(firstCall[0]).toBe(AJVSchemaEnum.RepairOOSAccountsReq)
    })

    it('should register schema with correct repairInstructions structure', () => {
      const { addSchema } = require('../../../../../src/utils/serialization/SchemaHelpers')
      RepairOOSAccountsReq.initRepairOOSAccountReq()

      const schema = addSchema.mock.calls[0][1] as any
      
      expect(schema.properties.repairInstructions).toEqual({
        type: 'array',
        items: RepairOOSAccountsReq.schemaAccountRepairInstruction,
      })
    })
  })

  describe('schemaSign', () => {
    it('should have correct structure', () => {
      expect(RepairOOSAccountsReq.schemaSign).toEqual({
        type: 'object',
        properties: {
          owner: { type: 'string' },
          sig: { type: 'string' },
        },
        required: ['owner', 'sig'],
      })
    })
  })

  describe('schemaAppliedVote', () => {
    it('should have correct structure', () => {
      expect(RepairOOSAccountsReq.schemaAppliedVote).toEqual({
        type: 'object',
        properties: {
          txid: { type: 'string' },
          transaction_result: { type: 'boolean' },
          account_id: {
            type: 'array',
            items: { type: 'string' },
          },
          account_state_hash_after: {
            type: 'array',
            items: { type: 'string' },
          },
          account_state_hash_before: {
            type: 'array',
            items: { type: 'string' },
          },
          cant_apply: { type: 'boolean' },
          node_id: { type: 'string' },
          sign: RepairOOSAccountsReq.schemaSign,
          app_data_hash: { type: 'string' },
        },
        required: [
          'txid',
          'transaction_result',
          'account_id',
          'account_state_hash_after',
          'account_state_hash_before',
          'cant_apply',
          'node_id',
        ],
      })
    })

    it('should include schemaSign in properties', () => {
      expect(RepairOOSAccountsReq.schemaAppliedVote.properties.sign).toBe(RepairOOSAccountsReq.schemaSign)
    })
  })

  describe('schemaConfirmOrChallengeMessage', () => {
    it('should have correct structure', () => {
      expect(RepairOOSAccountsReq.schemaConfirmOrChallengeMessage).toEqual({
        type: 'object',
        properties: {
          message: { type: 'string' },
          nodeId: { type: 'string' },
          appliedVote: RepairOOSAccountsReq.schemaAppliedVote,
          sign: RepairOOSAccountsReq.schemaSign,
        },
        required: ['message', 'nodeId', 'appliedVote'],
      })
    })

    it('should reference other schemas correctly', () => {
      expect(RepairOOSAccountsReq.schemaConfirmOrChallengeMessage.properties.appliedVote).toBe(RepairOOSAccountsReq.schemaAppliedVote)
      expect(RepairOOSAccountsReq.schemaConfirmOrChallengeMessage.properties.sign).toBe(RepairOOSAccountsReq.schemaSign)
    })
  })

  describe('schemaProposal', () => {
    it('should have correct structure', () => {
      expect(RepairOOSAccountsReq.schemaProposal).toEqual({
        type: 'object',
        properties: {
          applied: { type: 'boolean' },
          cant_preApply: { type: 'boolean' },
          accountIDs: {
            type: 'array',
            items: { type: 'string' },
          },
          beforeStateHashes: {
            type: 'array',
            items: { type: 'string' },
          },
          afterStateHashes: {
            type: 'array',
            items: { type: 'string' },
          },
          appReceiptDataHash: { type: 'string' },
          txid: { type: 'string' },
        },
        required: ['applied', 'cant_preApply', 'accountIDs', 'beforeStateHashes', 'afterStateHashes', 'appReceiptDataHash'],
      })
    })
  })

  describe('schemaSignedReceipt', () => {
    it('should have correct structure', () => {
      expect(RepairOOSAccountsReq.schemaSignedReceipt).toEqual({
        type: 'object',
        properties: {
          proposal: RepairOOSAccountsReq.schemaProposal,
          proposalHash: { type: 'string' },
          signaturePack: {
            type: 'array',
            items: RepairOOSAccountsReq.schemaSign,
          },
          voteOffsets: {
            type: 'array',
            items: { type: 'number' },
          },
          sign: RepairOOSAccountsReq.schemaSign,
        },
        required: ['proposal', 'proposalHash', 'signaturePack', 'voteOffsets'],
      })
    })

    it('should reference other schemas correctly', () => {
      expect(RepairOOSAccountsReq.schemaSignedReceipt.properties.proposal).toBe(RepairOOSAccountsReq.schemaProposal)
      expect(RepairOOSAccountsReq.schemaSignedReceipt.properties.signaturePack.items).toBe(RepairOOSAccountsReq.schemaSign)
      expect(RepairOOSAccountsReq.schemaSignedReceipt.properties.sign).toBe(RepairOOSAccountsReq.schemaSign)
    })
  })

  describe('schemaAccountRepairInstruction', () => {
    it('should have correct structure', () => {
      expect(RepairOOSAccountsReq.schemaAccountRepairInstruction).toEqual({
        type: 'object',
        properties: {
          accountID: { type: 'string' },
          hash: { type: 'string' },
          txId: { type: 'string' },
          accountData: expect.any(Object), // schemaWrappedData is imported
          targetNodeId: { type: 'string' },
          signedReceipt: RepairOOSAccountsReq.schemaSignedReceipt,
        },
        required: ['accountID', 'hash', 'txId', 'accountData', 'targetNodeId', 'signedReceipt'],
      })
    })

    it('should reference signedReceipt schema correctly', () => {
      expect(RepairOOSAccountsReq.schemaAccountRepairInstruction.properties.signedReceipt).toBe(RepairOOSAccountsReq.schemaSignedReceipt)
    })
  })

  describe('schemaRepairOOSAccountsReq', () => {
    it('should have correct structure', () => {
      expect(RepairOOSAccountsReq.schemaRepairOOSAccountsReq).toEqual({
        type: 'object',
        properties: {
          repairInstructions: {
            type: 'array',
            items: RepairOOSAccountsReq.schemaAccountRepairInstruction,
          },
        },
        required: ['repairInstructions'],
      })
    })

    it('should reference accountRepairInstruction schema correctly', () => {
      expect(RepairOOSAccountsReq.schemaRepairOOSAccountsReq.properties.repairInstructions.items).toBe(RepairOOSAccountsReq.schemaAccountRepairInstruction)
    })
  })

  describe('addSchemaDependencies', () => {
    it('should not throw when called indirectly', () => {
      // Since addSchemaDependencies is not exported and does nothing, 
      // we test it indirectly through initRepairOOSAccountReq
      expect(() => RepairOOSAccountsReq.initRepairOOSAccountReq()).not.toThrow()
    })
  })
})