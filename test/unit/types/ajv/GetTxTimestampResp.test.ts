import { initGetTxTimestampResp } from '../../../../src/types/ajv/GetTxTimestampResp'
import * as SchemaHelpers from '../../../../src/utils/serialization/SchemaHelpers'

describe('GetTxTimestampResp', () => {
  describe('initGetTxTimestampResp', () => {
    let addSchemaSpy: any

    beforeEach(() => {
      jest.clearAllMocks()
      addSchemaSpy = jest.spyOn(SchemaHelpers, 'addSchema').mockImplementation(() => {})
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should call addSchema with correct parameters', () => {
      initGetTxTimestampResp()

      expect(addSchemaSpy).toHaveBeenCalledTimes(1)
      expect(addSchemaSpy).toHaveBeenCalledWith(
        'GetTxTimestampResp',
        {
          type: 'object',
          properties: {
            txId: { type: 'string' },
            cycleCounter: { type: 'number' },
            cycleMarker: { type: 'string' },
            timestamp: { type: 'number' },
            sign: {
              type: 'object',
              properties: {
                owner: { type: 'string' },
                sig: { type: 'string' },
              },
            },
            isResponse: { type: 'boolean' },
          },
          required: ['txId', 'cycleCounter', 'cycleMarker', 'timestamp'],
        }
      )
    })

    it('should not throw any errors', () => {
      expect(() => initGetTxTimestampResp()).not.toThrow()
    })

    it('should have correct schema structure', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initGetTxTimestampResp()

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

      initGetTxTimestampResp()

      const { properties } = capturedSchema
      
      expect(properties.txId).toEqual({ type: 'string' })
      expect(properties.cycleCounter).toEqual({ type: 'number' })
      expect(properties.cycleMarker).toEqual({ type: 'string' })
      expect(properties.timestamp).toEqual({ type: 'number' })
      expect(properties.sign).toBeDefined()
      expect(properties.isResponse).toEqual({ type: 'boolean' })
    })

    it('should have correct sign object structure', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initGetTxTimestampResp()

      const sign = capturedSchema.properties.sign
      expect(sign.type).toBe('object')
      expect(sign.properties).toBeDefined()
      expect(sign.properties.owner).toEqual({ type: 'string' })
      expect(sign.properties.sig).toEqual({ type: 'string' })
    })

    it('should have correct required fields', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initGetTxTimestampResp()

      expect(capturedSchema.required).toEqual([
        'txId',
        'cycleCounter',
        'cycleMarker',
        'timestamp'
      ])
    })

    it('should not require sign and isResponse fields', () => {
      let capturedSchema: any
      addSchemaSpy.mockImplementation((enumValue, schema) => {
        capturedSchema = schema
      })

      initGetTxTimestampResp()

      expect(capturedSchema.required).not.toContain('sign')
      expect(capturedSchema.required).not.toContain('isResponse')
    })

    it('should register schema with string identifier', () => {
      initGetTxTimestampResp()

      // Check that the first argument is a string, not an enum value
      expect(addSchemaSpy).toHaveBeenCalledWith(
        'GetTxTimestampResp',
        expect.any(Object)
      )
      expect(typeof addSchemaSpy.mock.calls[0][0]).toBe('string')
    })
  })
})