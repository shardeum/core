import { initJoinReq } from '../../../../src/types/ajv/JoinReq'
import * as SchemaHelpers from '../../../../src/utils/serialization/SchemaHelpers'

jest.mock('../../../../src/utils/serialization/SchemaHelpers')

describe('JoinReq', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('initJoinReq', () => {
    it('should initialize JoinReq schema', () => {
      initJoinReq()

      expect(SchemaHelpers.addSchema).toHaveBeenCalledWith(
        'JoinReq',
        expect.objectContaining({
          type: 'object',
          properties: expect.objectContaining({
            nodeInfo: expect.any(Object),
            selectionNum: expect.objectContaining({ type: 'string' }),
            cycleMarker: expect.objectContaining({ type: 'string' }),
            proofOfWork: expect.objectContaining({ type: 'string' }),
            version: expect.objectContaining({ type: 'string' }),
            sign: expect.any(Object),
            appJoinData: expect.objectContaining({
              type: 'object',
              additionalProperties: true,
            }),
          }),
          required: ['nodeInfo', 'cycleMarker', 'proofOfWork', 'version', 'sign'],
        })
      )
    })

    it('should call addSchema with correct schema structure', () => {
      initJoinReq()

      const schemaCall = (SchemaHelpers.addSchema as jest.Mock).mock.calls[0]
      const schemaName = schemaCall[0]
      const schema = schemaCall[1]

      expect(schemaName).toBe('JoinReq')
      expect(schema.type).toBe('object')
      expect(schema.required).toEqual(['nodeInfo', 'cycleMarker', 'proofOfWork', 'version', 'sign'])
    })

    it('should define nodeInfo schema with correct properties', () => {
      initJoinReq()

      const schema = (SchemaHelpers.addSchema as jest.Mock).mock.calls[0][1]
      const nodeInfoSchema = schema.properties.nodeInfo

      expect(nodeInfoSchema.type).toBe('object')
      expect(nodeInfoSchema.properties).toHaveProperty('publicKey')
      expect(nodeInfoSchema.properties).toHaveProperty('externalIp')
      expect(nodeInfoSchema.properties).toHaveProperty('externalPort')
      expect(nodeInfoSchema.properties).toHaveProperty('internalIp')
      expect(nodeInfoSchema.properties).toHaveProperty('internalPort')
      expect(nodeInfoSchema.properties).toHaveProperty('address')
      expect(nodeInfoSchema.properties).toHaveProperty('joinRequestTimestamp')
      expect(nodeInfoSchema.properties).toHaveProperty('activeTimestamp')
      expect(nodeInfoSchema.properties).toHaveProperty('syncingTimestamp')
      expect(nodeInfoSchema.properties).toHaveProperty('readyTimestamp')
      expect(nodeInfoSchema.properties).toHaveProperty('refreshedCounter')
    })

    it('should define nodeInfo schema with correct required fields', () => {
      initJoinReq()

      const schema = (SchemaHelpers.addSchema as jest.Mock).mock.calls[0][1]
      const nodeInfoSchema = schema.properties.nodeInfo

      expect(nodeInfoSchema.required).toEqual([
        'publicKey',
        'externalIp',
        'externalPort',
        'internalIp',
        'internalPort',
        'address',
        'joinRequestTimestamp',
        'activeTimestamp',
        'syncingTimestamp',
        'readyTimestamp',
      ])
    })

    it('should define IP validation with correct regex pattern', () => {
      initJoinReq()

      const schema = (SchemaHelpers.addSchema as jest.Mock).mock.calls[0][1]
      const nodeInfoSchema = schema.properties.nodeInfo

      expect(nodeInfoSchema.properties.externalIp.pattern).toBeDefined()
      expect(nodeInfoSchema.properties.internalIp.pattern).toBeDefined()

      // Test that the pattern matches valid IPs
      const ipPattern = nodeInfoSchema.properties.externalIp.pattern
      const regex = new RegExp(ipPattern)

      expect(regex.test('192.168.1.1')).toBe(true)
      expect(regex.test('10.0.0.1')).toBe(true)
      expect(regex.test('255.255.255.255')).toBe(true)
      expect(regex.test('0.0.0.0')).toBe(true)
      expect(regex.test('invalid.ip')).toBe(false)
      expect(regex.test('256.1.1.1')).toBe(false)
    })

    it('should define port validation with correct range', () => {
      initJoinReq()

      const schema = (SchemaHelpers.addSchema as jest.Mock).mock.calls[0][1]
      const nodeInfoSchema = schema.properties.nodeInfo

      expect(nodeInfoSchema.properties.externalPort.type).toBe('integer')
      expect(nodeInfoSchema.properties.externalPort.minimum).toBe(1)
      expect(nodeInfoSchema.properties.externalPort.maximum).toBe(65535)

      expect(nodeInfoSchema.properties.internalPort.type).toBe('integer')
      expect(nodeInfoSchema.properties.internalPort.minimum).toBe(1)
      expect(nodeInfoSchema.properties.internalPort.maximum).toBe(65535)
    })

    it('should define timestamp fields with correct validation', () => {
      initJoinReq()

      const schema = (SchemaHelpers.addSchema as jest.Mock).mock.calls[0][1]
      const nodeInfoSchema = schema.properties.nodeInfo

      const timestampFields = ['joinRequestTimestamp', 'activeTimestamp', 'syncingTimestamp', 'readyTimestamp']

      timestampFields.forEach((field) => {
        expect(nodeInfoSchema.properties[field].type).toBe('integer')
        expect(nodeInfoSchema.properties[field].minimum).toBe(0)
      })

      expect(nodeInfoSchema.properties.refreshedCounter.type).toBe('integer')
      expect(nodeInfoSchema.properties.refreshedCounter.minimum).toBe(0)
    })

    it('should define signature schema correctly', () => {
      initJoinReq()

      const schema = (SchemaHelpers.addSchema as jest.Mock).mock.calls[0][1]
      const signatureSchema = schema.properties.sign

      expect(signatureSchema.type).toBe('object')
      expect(signatureSchema.properties).toHaveProperty('owner')
      expect(signatureSchema.properties).toHaveProperty('sig')
      expect(signatureSchema.properties.owner.type).toBe('string')
      expect(signatureSchema.properties.sig.type).toBe('string')
      expect(signatureSchema.required).toEqual(['owner', 'sig'])
    })

    it('should define appJoinData as optional with additionalProperties', () => {
      initJoinReq()

      const schema = (SchemaHelpers.addSchema as jest.Mock).mock.calls[0][1]
      const appJoinDataSchema = schema.properties.appJoinData

      expect(appJoinDataSchema.type).toBe('object')
      expect(appJoinDataSchema.additionalProperties).toBe(true)
      expect(schema.required).not.toContain('appJoinData') // Should be optional
    })

    it('should call addSchema exactly once', () => {
      initJoinReq()

      expect(SchemaHelpers.addSchema).toHaveBeenCalledTimes(1)
    })

    it('should handle multiple calls without issues', () => {
      initJoinReq()
      initJoinReq()
      initJoinReq()

      expect(SchemaHelpers.addSchema).toHaveBeenCalledTimes(3)
    })
  })
})
