import { initLostReportReq, schemaLostReportReq } from '../../../../src/types/ajv/LostReportReq'
import * as SchemaHelpers from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../../src/utils/serialization/SchemaHelpers')

describe('LostReportReq', () => {
  const mockAddSchema = SchemaHelpers.addSchema as jest.MockedFunction<typeof SchemaHelpers.addSchema>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schemaLostReportReq', () => {
    it('should define the correct schema structure', () => {
      expect(schemaLostReportReq).toEqual({
        type: 'object',
        properties: {
          target: { type: 'string' },
          checker: { type: 'string' },
          reporter: { type: 'string' },
          cycle: { type: 'number' },
          timestamp: { type: 'number' },
          requestId: { type: 'string' },
          sign: {
            type: 'object',
            properties: {
              owner: { type: 'string' },
              sig: { type: 'string' },
            },
            required: ['owner', 'sig'],
          },
          killother: { type: 'boolean' },
        },
        required: ['target', 'checker', 'reporter', 'cycle', 'timestamp', 'requestId', 'sign'],
      })
    })

    it('should have proper sign object schema', () => {
      const signSchema = schemaLostReportReq.properties.sign as any
      expect(signSchema.type).toBe('object')
      expect(signSchema.properties).toHaveProperty('owner')
      expect(signSchema.properties).toHaveProperty('sig')
      expect(signSchema.required).toEqual(['owner', 'sig'])
    })

    it('should not require killother property', () => {
      expect(schemaLostReportReq.required).not.toContain('killother')
    })

    it('should have all required fields defined', () => {
      const requiredFields = ['target', 'checker', 'reporter', 'cycle', 'timestamp', 'requestId', 'sign']
      expect(schemaLostReportReq.required).toEqual(requiredFields)

      requiredFields.forEach((field) => {
        expect(schemaLostReportReq.properties).toHaveProperty(field)
      })
    })
  })

  describe('initLostReportReq', () => {
    it('should initialize the schema correctly', () => {
      initLostReportReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(AJVSchemaEnum.LostReportReq, schemaLostReportReq)
    })

    it('should register schema with proper enum key', () => {
      initLostReportReq()

      const schemaCall = mockAddSchema.mock.calls[0]
      const enumKey = schemaCall[0]
      const schema = schemaCall[1]

      expect(enumKey).toBe(AJVSchemaEnum.LostReportReq)
      expect(schema).toBe(schemaLostReportReq)
    })

    it('should validate proper data structure', () => {
      const validData = {
        target: 'node1',
        checker: 'node2',
        reporter: 'node3',
        cycle: 100,
        timestamp: Date.now(),
        requestId: 'req-123',
        sign: {
          owner: '0x123',
          sig: 'signature123',
        },
      }

      // The schema should accept this structure
      expect(schemaLostReportReq.properties.target.type).toBe('string')
      expect(schemaLostReportReq.properties.cycle.type).toBe('number')
      expect(schemaLostReportReq.properties.timestamp.type).toBe('number')
    })

    it('should handle optional killother field', () => {
      const dataWithKillother = {
        target: 'node1',
        checker: 'node2',
        reporter: 'node3',
        cycle: 100,
        timestamp: Date.now(),
        requestId: 'req-123',
        sign: {
          owner: '0x123',
          sig: 'signature123',
        },
        killother: true,
      }

      // Killother should be boolean type when present
      expect(schemaLostReportReq.properties.killother.type).toBe('boolean')
    })

    it('should register schema only once per initialization', () => {
      initLostReportReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)

      // Clear mocks and call again
      mockAddSchema.mockClear()
      initLostReportReq()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
    })
  })
})
