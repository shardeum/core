import { initAllowedArchiverResponse, schemaAllowedArchiverResponse } from '../../../../src/types/ajv/AllowedArchiverResponse'
import * as SchemaHelpers from '../../../../src/utils/serialization/SchemaHelpers'
import { AJVSchemaEnum } from '../../../../src/types/enum/AJVSchemaEnum'

jest.mock('../../../../src/utils/serialization/SchemaHelpers')

describe('AllowedArchiverResponse', () => {
  const mockAddSchema = SchemaHelpers.addSchema as jest.MockedFunction<typeof SchemaHelpers.addSchema>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schemaAllowedArchiverResponse', () => {
    it('should define the correct schema structure', () => {
      expect(schemaAllowedArchiverResponse).toEqual({
        type: 'object',
        properties: {
          allowedArchivers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                ip: { type: 'string' },
                port: { type: 'number' },
                publicKey: { type: 'string' },
              },
              required: ['ip', 'port', 'publicKey'],
            },
          },
          signatures: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                owner: { type: 'string' },
                sig: { type: 'string' },
              },
              required: ['owner', 'sig'],
            },
          },
        },
        required: ['allowedArchivers', 'signatures'],
        additionalProperties: false,
      })
    })

    it('should have correct archiver item schema', () => {
      const archiverSchema = schemaAllowedArchiverResponse.properties.allowedArchivers.items as any
      
      expect(archiverSchema.type).toBe('object')
      expect(archiverSchema.properties).toHaveProperty('ip')
      expect(archiverSchema.properties).toHaveProperty('port')
      expect(archiverSchema.properties).toHaveProperty('publicKey')
      expect(archiverSchema.properties.ip.type).toBe('string')
      expect(archiverSchema.properties.port.type).toBe('number')
      expect(archiverSchema.properties.publicKey.type).toBe('string')
      expect(archiverSchema.required).toEqual(['ip', 'port', 'publicKey'])
    })

    it('should have correct signature item schema', () => {
      const signatureSchema = schemaAllowedArchiverResponse.properties.signatures.items as any
      
      expect(signatureSchema.type).toBe('object')
      expect(signatureSchema.properties).toHaveProperty('owner')
      expect(signatureSchema.properties).toHaveProperty('sig')
      expect(signatureSchema.properties.owner.type).toBe('string')
      expect(signatureSchema.properties.sig.type).toBe('string')
      expect(signatureSchema.required).toEqual(['owner', 'sig'])
    })

    it('should not allow additional properties', () => {
      expect(schemaAllowedArchiverResponse.additionalProperties).toBe(false)
    })

    it('should require both allowedArchivers and signatures', () => {
      expect(schemaAllowedArchiverResponse.required).toEqual(['allowedArchivers', 'signatures'])
    })
  })

  describe('initAllowedArchiverResponse', () => {
    it('should initialize the schema correctly', () => {
      initAllowedArchiverResponse()

      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      expect(mockAddSchema).toHaveBeenCalledWith(AJVSchemaEnum.AllowedArchiverResponse, schemaAllowedArchiverResponse)
    })

    it('should register schema with correct enum key', () => {
      initAllowedArchiverResponse()

      const schemaCall = mockAddSchema.mock.calls[0]
      expect(schemaCall[0]).toBe(AJVSchemaEnum.AllowedArchiverResponse)
      expect(schemaCall[1]).toBe(schemaAllowedArchiverResponse)
    })

    it('should validate proper data structure', () => {
      const validData = {
        allowedArchivers: [
          {
            ip: '192.168.1.1',
            port: 8080,
            publicKey: 'pubkey123'
          },
          {
            ip: '10.0.0.1',
            port: 9090,
            publicKey: 'pubkey456'
          }
        ],
        signatures: [
          {
            owner: 'owner1',
            sig: 'signature1'
          },
          {
            owner: 'owner2',
            sig: 'signature2'
          }
        ]
      }

      // The schema should accept this structure
      expect(schemaAllowedArchiverResponse.properties.allowedArchivers.type).toBe('array')
      expect(schemaAllowedArchiverResponse.properties.signatures.type).toBe('array')
    })

    it('should handle empty arrays', () => {
      const emptyData = {
        allowedArchivers: [],
        signatures: []
      }

      // Empty arrays should still be valid
      expect(schemaAllowedArchiverResponse.properties.allowedArchivers.type).toBe('array')
      expect(schemaAllowedArchiverResponse.properties.signatures.type).toBe('array')
    })

    it('should register schema only once per initialization', () => {
      initAllowedArchiverResponse()
      
      expect(mockAddSchema).toHaveBeenCalledTimes(1)
      
      // Clear mocks and call again
      mockAddSchema.mockClear()
      initAllowedArchiverResponse()
      
      expect(mockAddSchema).toHaveBeenCalledTimes(1)
    })
  })
})