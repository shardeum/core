import { jest } from '@jest/globals'

// Mock the SchemaHelpers module
jest.mock('../../../../../src/utils/serialization/SchemaHelpers', () => ({
  addSchema: jest.fn(),
}))

import * as CompareCert from '../../../../../src/types/ajv/CompareCert'
import { AJVSchemaEnum } from '../../../../../src/types/enum/AJVSchemaEnum'

describe('CompareCert', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('initCompareCertReq', () => {
    it('should call addSchemaDependencies and addSchemas', () => {
      CompareCert.initCompareCertReq()

      const { addSchema } = require('../../../../../src/utils/serialization/SchemaHelpers')
      
      // Verify that addSchema was called with correct parameters
      expect(addSchema).toHaveBeenCalledTimes(2)
      expect(addSchema).toHaveBeenCalledWith(
        AJVSchemaEnum.CompareCertReq,
        expect.objectContaining({
          type: 'object',
          properties: expect.objectContaining({
            certs: expect.objectContaining({
              type: 'array',
              items: expect.objectContaining({
                type: 'object',
                properties: expect.objectContaining({
                  marker: { type: 'string' },
                  score: { type: 'number' },
                }),
                required: ['marker'],
              }),
            }),
            record: expect.objectContaining({
              type: 'object',
            }),
          }),
          required: ['certs'],
          additionalProperties: true,
        })
      )
      expect(addSchema).toHaveBeenCalledWith(
        AJVSchemaEnum.CompareCertResp,
        expect.objectContaining({
          type: 'object',
          properties: expect.objectContaining({
            certs: expect.any(Object),
            record: expect.any(Object),
          }),
          required: ['certs'],
          additionalProperties: true,
        })
      )
    })

    it('should register schemas with correct enum values', () => {
      const { addSchema } = require('../../../../../src/utils/serialization/SchemaHelpers')
      CompareCert.initCompareCertReq()

      const firstCall = addSchema.mock.calls[0]
      const secondCall = addSchema.mock.calls[1]

      expect(firstCall[0]).toBe(AJVSchemaEnum.CompareCertReq)
      expect(secondCall[0]).toBe(AJVSchemaEnum.CompareCertResp)
    })

    it('should register schema with correct certs structure', () => {
      const { addSchema } = require('../../../../../src/utils/serialization/SchemaHelpers')
      CompareCert.initCompareCertReq()

      const schema = addSchema.mock.calls[0][1] as any
      
      expect(schema.properties.certs).toEqual({
        type: 'array',
        items: {
          type: 'object',
          properties: {
            marker: { type: 'string' },
            score: { type: 'number' },
          },
          required: ['marker'],
        },
      })
    })

    it('should register schema with correct record structure', () => {
      const { addSchema } = require('../../../../../src/utils/serialization/SchemaHelpers')
      CompareCert.initCompareCertReq()

      const schema = addSchema.mock.calls[0][1] as any
      
      // Verify record has required properties
      expect(schema.properties.record.properties).toHaveProperty('networkId')
      expect(schema.properties.record.properties).toHaveProperty('counter')
      expect(schema.properties.record.properties).toHaveProperty('previous')
      expect(schema.properties.record.properties).toHaveProperty('start')
      expect(schema.properties.record.properties).toHaveProperty('duration')
      expect(schema.properties.record.properties).toHaveProperty('networkConfigHash')
      expect(schema.properties.record.properties).toHaveProperty('mode')
      
      // Verify mode enum values
      expect(schema.properties.record.properties.mode).toEqual({
        type: 'string',
        enum: ['forming', 'processing', 'safety', 'recovery', 'restart', 'restore', 'shutdown'],
      })
      
      // Verify required fields
      expect(schema.properties.record.required).toContain('networkId')
      expect(schema.properties.record.required).toContain('counter')
      expect(schema.properties.record.required).toContain('previous')
      expect(schema.properties.record.required).toContain('start')
      expect(schema.properties.record.required).toContain('duration')
      expect(schema.properties.record.required).toContain('networkConfigHash')
      expect(schema.properties.record.required).toContain('nodeListHash')
      expect(schema.properties.record.required).toContain('archiverListHash')
      expect(schema.properties.record.required).toContain('standbyNodeListHash')
    })

    it('should handle networkDataHash array structure correctly', () => {
      const { addSchema } = require('../../../../../src/utils/serialization/SchemaHelpers')
      CompareCert.initCompareCertReq()

      const schema = addSchema.mock.calls[0][1] as any
      
      expect(schema.properties.record.properties.networkDataHash).toEqual({
        type: 'array',
        items: {
          type: 'object',
          properties: {
            hash: { type: 'string' },
            cycle: { type: 'number' },
          },
          required: ['hash', 'cycle'],
        },
      })
    })

    it('should set additionalProperties correctly', () => {
      const { addSchema } = require('../../../../../src/utils/serialization/SchemaHelpers')
      CompareCert.initCompareCertReq()

      const schema = addSchema.mock.calls[0][1] as any
      
      expect(schema.additionalProperties).toBe(true)
      expect(schema.properties.record.additionalProperties).toBe(true)
    })

    it('should register both request and response schemas with same structure', () => {
      const { addSchema } = require('../../../../../src/utils/serialization/SchemaHelpers')
      CompareCert.initCompareCertReq()

      const reqSchema = addSchema.mock.calls[0][1] as any
      const respSchema = addSchema.mock.calls[1][1] as any
      
      // Both schemas should be identical
      expect(reqSchema).toEqual(respSchema)
    })
  })

  describe('addSchemaDependencies', () => {
    it('should not throw when called directly', () => {
      // Since addSchemaDependencies is not exported, we test it indirectly
      // through initCompareCertReq which calls it
      expect(() => CompareCert.initCompareCertReq()).not.toThrow()
    })
  })

  describe('schema structure validation', () => {
    it('should have all required array properties with correct types', () => {
      const { addSchema } = require('../../../../../src/utils/serialization/SchemaHelpers')
      CompareCert.initCompareCertReq()

      const schema = addSchema.mock.calls[0][1] as any
      const recordProps = schema.properties.record.properties
      
      // Array properties that should allow any items
      const arrayPropsWithTrueItems = [
        'refreshedArchivers',
        'refreshedConsensors',
        'joinedArchivers',
        'leavingArchivers',
        'archiversAtShutdown',
        'joinedConsensors',
        'standbyAdd',
      ]
      
      arrayPropsWithTrueItems.forEach(prop => {
        expect(recordProps[prop]).toEqual({
          type: 'array',
          items: true,
        })
      })
      
      // Array properties that should have string items
      const arrayPropsWithStringItems = [
        'standbyRemove',
        'startedSyncing',
        'lostAfterSelection',
        'finishedSyncing',
        'standbyRefresh',
        'activated',
        'activatedPublicKeys',
        'apoptosized',
        'lost',
        'lostSyncing',
        'refuted',
        'appRemoved',
        'removed',
        'joined',
        'returned',
      ]
      
      arrayPropsWithStringItems.forEach(prop => {
        expect(recordProps[prop]).toEqual({
          type: 'array',
          items: { type: 'string' },
        })
      })
    })

    it('should have correct primitive type properties', () => {
      const { addSchema } = require('../../../../../src/utils/serialization/SchemaHelpers')
      CompareCert.initCompareCertReq()

      const schema = addSchema.mock.calls[0][1] as any
      const recordProps = schema.properties.record.properties
      
      // String properties
      const stringProps = [
        'networkId',
        'previous',
        'networkConfigHash',
        'networkStateHash',
        'nodeListHash',
        'archiverListHash',
        'standbyNodeListHash',
      ]
      
      stringProps.forEach(prop => {
        expect(recordProps[prop]).toEqual({ type: 'string' })
      })
      
      // Number properties
      const numberProps = [
        'counter',
        'start',
        'duration',
        'safetyNum',
        'syncing',
        'active',
        'standby',
        'maxSyncTime',
        'expired',
        'random',
        'desired',
        'target',
      ]
      
      numberProps.forEach(prop => {
        expect(recordProps[prop]).toEqual({ type: 'number' })
      })
      
      // Boolean properties
      expect(recordProps.safetyMode).toEqual({ type: 'boolean' })
    })
  })
})