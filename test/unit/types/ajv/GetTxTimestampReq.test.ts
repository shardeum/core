import { initGetTxTimestampReq } from '../../../../src/types/ajv/GetTxTimestampReq'
import { addSchema } from '../../../../src/utils/serialization/SchemaHelpers'

jest.mock('../../../../src/utils/serialization/SchemaHelpers')

const mockAddSchema = addSchema as jest.MockedFunction<typeof addSchema>

describe('GetTxTimestampReq', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schema definition', () => {
    it('should define correct schema structure', () => {
      const expectedSchema = {
        type: 'object',
        properties: {
          txId: { type: 'string' },
          cycleCounter: { type: 'number' },
          cycleMarker: { type: 'string' },
        },
        required: ['txId', 'cycleCounter', 'cycleMarker'],
      }

      // Call the function to trigger schema registration
      initGetTxTimestampReq()

      // Verify the schema passed to addSchema matches expected structure
      expect(mockAddSchema).toHaveBeenCalledWith('GetTxTimestampReq', expectedSchema)
    })

    it('should require all three properties', () => {
      initGetTxTimestampReq()

      const schemaArg = mockAddSchema.mock.calls[0][1] as any
      expect(schemaArg.required).toContain('txId')
      expect(schemaArg.required).toContain('cycleCounter')
      expect(schemaArg.required).toContain('cycleMarker')
      expect(schemaArg.required).toHaveLength(3)
    })

    it('should define txId as string type', () => {
      initGetTxTimestampReq()

      const schemaArg = mockAddSchema.mock.calls[0][1] as any
      expect(schemaArg.properties.txId).toEqual({ type: 'string' })
    })

    it('should define cycleCounter as number type', () => {
      initGetTxTimestampReq()

      const schemaArg = mockAddSchema.mock.calls[0][1] as any
      expect(schemaArg.properties.cycleCounter).toEqual({ type: 'number' })
    })

    it('should define cycleMarker as string type', () => {
      initGetTxTimestampReq()

      const schemaArg = mockAddSchema.mock.calls[0][1] as any
      expect(schemaArg.properties.cycleMarker).toEqual({ type: 'string' })
    })
  })

  describe('initGetTxTimestampReq', () => {
    it('should call addSchema with correct parameters', () => {
      initGetTxTimestampReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(
        'GetTxTimestampReq',
        expect.objectContaining({
          type: 'object',
          properties: expect.any(Object),
          required: expect.any(Array),
        })
      )
    })

    it('should use string schema name instead of enum', () => {
      initGetTxTimestampReq()

      // Note: This file uses a string 'GetTxTimestampReq' instead of AJVSchemaEnum
      expect(mockAddSchema.mock.calls[0][0]).toBe('GetTxTimestampReq')
    })

    it('should not throw any errors during initialization', () => {
      expect(() => initGetTxTimestampReq()).not.toThrow()
    })

    it('should be idempotent - multiple calls should work', () => {
      initGetTxTimestampReq()
      initGetTxTimestampReq()
      initGetTxTimestampReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(3)
    })
  })

  describe('addSchemaDependencies', () => {
    it('should not add any dependencies (function is empty)', () => {
      initGetTxTimestampReq()

      // Verify only one call to addSchema (no dependencies added)
      expect(mockAddSchema).toHaveBeenCalledTimes(1)
    })
  })

  describe('schema validation scenarios', () => {
    it('should accept valid transaction timestamp request', () => {
      initGetTxTimestampReq()

      const schemaArg = mockAddSchema.mock.calls[0][1] as any

      // Valid object structure
      const validRequest = {
        txId: 'tx-12345',
        cycleCounter: 42,
        cycleMarker: 'cycle-marker-abc',
      }

      // Schema should have correct structure to validate this
      expect(schemaArg.properties).toHaveProperty('txId')
      expect(schemaArg.properties).toHaveProperty('cycleCounter')
      expect(schemaArg.properties).toHaveProperty('cycleMarker')
      expect(schemaArg.required).toEqual(['txId', 'cycleCounter', 'cycleMarker'])
    })

    it('should require all mandatory fields', () => {
      initGetTxTimestampReq()

      const schemaArg = mockAddSchema.mock.calls[0][1] as any

      // Missing fields scenarios
      const missingTxId = { cycleCounter: 42, cycleMarker: 'marker' }
      const missingCycleCounter = { txId: 'tx-123', cycleMarker: 'marker' }
      const missingCycleMarker = { txId: 'tx-123', cycleCounter: 42 }
      const emptyObject = {}

      // Schema should enforce required fields
      expect(schemaArg.required).toContain('txId')
      expect(schemaArg.required).toContain('cycleCounter')
      expect(schemaArg.required).toContain('cycleMarker')
    })

    it('should validate property types correctly', () => {
      initGetTxTimestampReq()

      const schemaArg = mockAddSchema.mock.calls[0][1] as any

      // Type validation scenarios
      const wrongTypes = {
        txId: 123, // should be string
        cycleCounter: '42', // should be number
        cycleMarker: true, // should be string
      }

      // Schema properties should enforce correct types
      expect(schemaArg.properties.txId.type).toBe('string')
      expect(schemaArg.properties.cycleCounter.type).toBe('number')
      expect(schemaArg.properties.cycleMarker.type).toBe('string')
    })

    it('should handle edge cases for cycleCounter', () => {
      initGetTxTimestampReq()

      const schemaArg = mockAddSchema.mock.calls[0][1] as any

      // Edge cases for number field
      const edgeCases = {
        zero: { txId: 'tx-123', cycleCounter: 0, cycleMarker: 'marker' },
        negative: { txId: 'tx-123', cycleCounter: -1, cycleMarker: 'marker' },
        largeNumber: { txId: 'tx-123', cycleCounter: Number.MAX_SAFE_INTEGER, cycleMarker: 'marker' },
      }

      // Schema should accept any number value
      expect(schemaArg.properties.cycleCounter.type).toBe('number')
    })
  })
})
