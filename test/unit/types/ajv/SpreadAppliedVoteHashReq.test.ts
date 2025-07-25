import { initSpreadAppliedVoteHashReq } from '../../../../src/types/ajv/SpreadAppliedVoteHashReq'
import * as SchemaHelpers from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'

describe('SpreadAppliedVoteHashReq', () => {
  describe('initSpreadAppliedVoteHashReq', () => {
    let addSchemaSpy: any

    beforeEach(() => {
      jest.clearAllMocks()
      addSchemaSpy = jest.spyOn(SchemaHelpers, 'addSchema').mockImplementation(() => {})
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should call addSchema with correct parameters', () => {
      initSpreadAppliedVoteHashReq()

      expect(addSchemaSpy).toHaveBeenCalledTimes(1)
      expect(addSchemaSpy).toHaveBeenCalledWith(AJVSchemaEnum.SpreadAppliedVoteHashReq, {
        type: 'object',
        properties: {
          txid: { type: 'string' },
          voteHash: { type: 'string' },
          sign: {
            type: 'object',
            properties: {
              owner: { type: 'string' },
              sig: { type: 'string' },
            },
            required: ['owner', 'sig'],
            additionalProperties: false,
          },
        },
        required: ['txid', 'voteHash'],
        additionalProperties: false,
      })
    })

    it('should not throw any errors', () => {
      expect(() => initSpreadAppliedVoteHashReq()).not.toThrow()
    })

    it('should have correct schema structure', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initSpreadAppliedVoteHashReq()

      expect(capturedSchema).toBeDefined()
      expect(capturedSchema.type).toBe('object')
      expect(capturedSchema.properties).toBeDefined()
      expect(capturedSchema.required).toBeDefined()
      expect(capturedSchema.additionalProperties).toBe(false)
    })

    it('should have all properties defined', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initSpreadAppliedVoteHashReq()

      const { properties } = capturedSchema

      expect(properties.txid).toEqual({ type: 'string' })
      expect(properties.voteHash).toEqual({ type: 'string' })
      expect(properties.sign).toBeDefined()
    })

    it('should have correct sign object structure', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initSpreadAppliedVoteHashReq()

      const sign = capturedSchema.properties.sign
      expect(sign.type).toBe('object')
      expect(sign.properties).toBeDefined()
      expect(sign.properties.owner).toEqual({ type: 'string' })
      expect(sign.properties.sig).toEqual({ type: 'string' })
      expect(sign.required).toEqual(['owner', 'sig'])
      expect(sign.additionalProperties).toBe(false)
    })

    it('should have correct required fields at root level', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initSpreadAppliedVoteHashReq()

      expect(capturedSchema.required).toEqual(['txid', 'voteHash'])
    })

    it('should not require sign field at root level', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initSpreadAppliedVoteHashReq()

      expect(capturedSchema.required).not.toContain('sign')
    })

    it('should not allow additional properties at any level', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initSpreadAppliedVoteHashReq()

      // Check root level
      expect(capturedSchema.additionalProperties).toBe(false)

      // Check sign object level
      expect(capturedSchema.properties.sign.additionalProperties).toBe(false)
    })
  })
})
