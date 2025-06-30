import { 
  schemaCycleRecordArray, 
  initCycleRecords, 
  addSchemaDependencies, 
  addSchemas 
} from '../../../../../src/types/ajv/CycleRecordSchema'
import { AJVSchemaEnum } from '../../../../../src/types/enum/AJVSchemaEnum'
import * as SchemaHelpers from '../../../../../src/utils/serialization/SchemaHelpers'

// Mock dependencies
jest.mock('../../../../../src/utils/serialization/SchemaHelpers', () => ({
  addSchema: jest.fn(),
  addSchemaDependency: jest.fn()
}))

const mockSchemaHelpers = SchemaHelpers as jest.Mocked<typeof SchemaHelpers>

describe('CycleRecordSchema', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('schemaCycleRecordArray', () => {
    it('should be defined and be an object', () => {
      expect(schemaCycleRecordArray).toBeDefined()
      expect(typeof schemaCycleRecordArray).toBe('object')
    })

    it('should have correct array structure', () => {
      expect(schemaCycleRecordArray).toHaveProperty('type', 'array')
      expect(schemaCycleRecordArray).toHaveProperty('items')
    })

    it('should have items property that is an object with cycle record schema', () => {
      const schema = schemaCycleRecordArray as any
      expect(schema.items).toBeDefined()
      expect(schema.items.type).toBe('object')
      expect(schema.items.properties).toBeDefined()
    })

    it('should contain all required CycleRecord properties', () => {
      const schema = schemaCycleRecordArray as any
      const cycleRecordSchema = schema.items
      
      // Test basic required properties
      expect(cycleRecordSchema.properties).toHaveProperty('networkId')
      expect(cycleRecordSchema.properties).toHaveProperty('counter')
      expect(cycleRecordSchema.properties).toHaveProperty('previous')
      expect(cycleRecordSchema.properties).toHaveProperty('start')
      expect(cycleRecordSchema.properties).toHaveProperty('duration')
      expect(cycleRecordSchema.properties).toHaveProperty('mode')
    })

    it('should have correct mode enum values', () => {
      const schema = schemaCycleRecordArray as any
      const modeProperty = schema.items.properties.mode
      
      expect(modeProperty.type).toBe('string')
      expect(modeProperty.enum).toEqual([
        'forming', 'processing', 'safety', 'recovery', 'restart', 'restore', 'shutdown'
      ])
    })

    it('should have correct refreshedConsensors schema structure', () => {
      const schema = schemaCycleRecordArray as any
      const refreshedConsensors = schema.items.properties.refreshedConsensors
      
      expect(refreshedConsensors.type).toBe('array')
      expect(refreshedConsensors.items.type).toBe('object')
      expect(refreshedConsensors.items.properties).toHaveProperty('publicKey')
      expect(refreshedConsensors.items.properties).toHaveProperty('externalIp')
      expect(refreshedConsensors.items.properties).toHaveProperty('status')
      
      // Check status enum
      expect(refreshedConsensors.items.properties.status.enum).toEqual([
        'initializing', 'standby', 'selected', 'syncing', 'ready', 'active'
      ])
    })

    it('should have correct archiver schemas', () => {
      const schema = schemaCycleRecordArray as any
      const cycleRecordSchema = schema.items
      
      // Check refreshedArchivers
      const refreshedArchivers = cycleRecordSchema.properties.refreshedArchivers
      expect(refreshedArchivers.type).toBe('array')
      expect(refreshedArchivers.items.properties).toHaveProperty('publicKey')
      expect(refreshedArchivers.items.properties).toHaveProperty('ip')
      expect(refreshedArchivers.items.properties).toHaveProperty('port')
      expect(refreshedArchivers.items.properties).toHaveProperty('curvePk')
      
      // Check joinedArchivers
      const joinedArchivers = cycleRecordSchema.properties.joinedArchivers
      expect(joinedArchivers.type).toBe('array')
      expect(joinedArchivers.items.properties).toHaveProperty('publicKey')
      
      // Check leavingArchivers
      const leavingArchivers = cycleRecordSchema.properties.leavingArchivers
      expect(leavingArchivers.type).toBe('array')
      expect(leavingArchivers.items.properties).toHaveProperty('publicKey')
    })

    it('should have correct standbyAdd schema structure', () => {
      const schema = schemaCycleRecordArray as any
      const standbyAdd = schema.items.properties.standbyAdd
      
      expect(standbyAdd.type).toBe('array')
      expect(standbyAdd.items.type).toBe('object')
      expect(standbyAdd.items.properties).toHaveProperty('appJoinData')
      expect(standbyAdd.items.properties).toHaveProperty('cycleMarker')
      expect(standbyAdd.items.properties).toHaveProperty('nodeInfo')
      expect(standbyAdd.items.properties).toHaveProperty('proofOfWork')
      expect(standbyAdd.items.properties).toHaveProperty('selectionNum')
      expect(standbyAdd.items.properties).toHaveProperty('sign')
      expect(standbyAdd.items.properties).toHaveProperty('version')
      
      // Check sign structure
      const signProperty = standbyAdd.items.properties.sign
      expect(signProperty.type).toBe('object')
      expect(signProperty.properties).toHaveProperty('owner')
      expect(signProperty.properties).toHaveProperty('sig')
      expect(signProperty.required).toEqual(['owner', 'sig'])
    })

    it('should have correct transaction schema structure', () => {
      const schema = schemaCycleRecordArray as any
      const cycleRecordSchema = schema.items
      
      // Check txadd
      const txadd = cycleRecordSchema.properties.txadd
      expect(txadd.type).toBe('array')
      expect(txadd.items.properties).toHaveProperty('hash')
      expect(txadd.items.properties).toHaveProperty('type')
      expect(txadd.items.properties).toHaveProperty('txData')
      expect(txadd.items.properties).toHaveProperty('cycle')
      expect(txadd.items.required).toEqual(['hash', 'type', 'txData', 'cycle'])
      
      // Check txremove
      const txremove = cycleRecordSchema.properties.txremove
      expect(txremove.type).toBe('array')
      expect(txremove.items.properties).toHaveProperty('txHash')
      expect(txremove.items.properties).toHaveProperty('cycle')
      expect(txremove.items.required).toEqual(['txHash', 'cycle'])
      
      // Check txlisthash
      expect(cycleRecordSchema.properties).toHaveProperty('txlisthash')
      expect(cycleRecordSchema.properties.txlisthash.type).toBe('string')
    })

    it('should have correct network hash schemas', () => {
      const schema = schemaCycleRecordArray as any
      const cycleRecordSchema = schema.items
      
      // Check networkDataHash
      const networkDataHash = cycleRecordSchema.properties.networkDataHash
      expect(networkDataHash.type).toBe('array')
      expect(networkDataHash.items.properties).toHaveProperty('cycle')
      expect(networkDataHash.items.properties).toHaveProperty('hash')
      
      // Check networkReceiptHash
      const networkReceiptHash = cycleRecordSchema.properties.networkReceiptHash
      expect(networkReceiptHash.type).toBe('array')
      expect(networkReceiptHash.items.properties).toHaveProperty('cycle')
      expect(networkReceiptHash.items.properties).toHaveProperty('hash')
      
      // Check networkSummaryHash
      const networkSummaryHash = cycleRecordSchema.properties.networkSummaryHash
      expect(networkSummaryHash.type).toBe('array')
      expect(networkSummaryHash.items.properties).toHaveProperty('cycle')
      expect(networkSummaryHash.items.properties).toHaveProperty('hash')
    })

    it('should have correct array properties with string items', () => {
      const schema = schemaCycleRecordArray as any
      const cycleRecordSchema = schema.items
      
      const stringArrayProps = [
        'activated', 'activatedPublicKeys', 'apoptosized', 'appRemoved', 
        'finishedSyncing', 'joined', 'lost', 'lostAfterSelection', 
        'lostArchivers', 'lostSyncing', 'refuted', 'refutedArchivers', 
        'removed', 'removedArchivers', 'returned', 'standbyRefresh', 
        'standbyRemove', 'startedSyncing'
      ]
      
      stringArrayProps.forEach(prop => {
        expect(cycleRecordSchema.properties).toHaveProperty(prop)
        expect(cycleRecordSchema.properties[prop].type).toBe('array')
        expect(cycleRecordSchema.properties[prop].items.type).toBe('string')
      })
    })

    it('should have correct required fields', () => {
      const schema = schemaCycleRecordArray as any
      const cycleRecordSchema = schema.items
      
      const requiredFields = [
        'networkId', 'counter', 'previous', 'start', 'duration', 'networkConfigHash',
        'mode', 'refreshedArchivers', 'refreshedConsensors', 'activated', 
        'activatedPublicKeys', 'active', 'apoptosized', 'appRemoved', 
        'archiverListHash', 'expired', 'joined', 'joinedArchivers', 
        'joinedConsensors', 'leavingArchivers', 'lost', 'lostArchivers', 
        'lostSyncing', 'maxSyncTime', 'nodeListHash', 'refuted', 
        'refutedArchivers', 'removed', 'removedArchivers', 'returned', 
        'standby', 'standbyNodeListHash', 'syncing', 'target', 'desired', 
        'random', 'txadd', 'txremove', 'txlisthash'
      ]
      
      expect(cycleRecordSchema.required).toEqual(expect.arrayContaining(requiredFields))
      expect(cycleRecordSchema.required).toHaveLength(requiredFields.length)
    })

    it('should have correct numeric properties', () => {
      const schema = schemaCycleRecordArray as any
      const cycleRecordSchema = schema.items
      
      const numericProps = [
        'counter', 'start', 'duration', 'safetyNum', 'active', 'expired',
        'standby', 'maxSyncTime', 'syncing', 'target', 'desired', 'random'
      ]
      
      numericProps.forEach(prop => {
        expect(cycleRecordSchema.properties).toHaveProperty(prop)
        expect(cycleRecordSchema.properties[prop].type).toBe('number')
      })
    })

    it('should have correct string properties', () => {
      const schema = schemaCycleRecordArray as any
      const cycleRecordSchema = schema.items
      
      const stringProps = [
        'networkId', 'previous', 'networkConfigHash', 'networkStateHash',
        'archiverListHash', 'marker', 'nodeListHash', 'standbyNodeListHash',
        'txlisthash'
      ]
      
      stringProps.forEach(prop => {
        expect(cycleRecordSchema.properties).toHaveProperty(prop)
        expect(cycleRecordSchema.properties[prop].type).toBe('string')
      })
    })

    it('should have safetyMode as boolean', () => {
      const schema = schemaCycleRecordArray as any
      const cycleRecordSchema = schema.items
      
      expect(cycleRecordSchema.properties).toHaveProperty('safetyMode')
      expect(cycleRecordSchema.properties.safetyMode.type).toBe('boolean')
    })
  })

  describe('initCycleRecords', () => {
    it('should call addSchemaDependencies and addSchemas', () => {
      // Since initCycleRecords calls addSchemaDependencies and addSchemas internally,
      // and addSchemas calls addSchema, we can verify the end result
      initCycleRecords()
      
      // addSchemas should call addSchema once
      expect(mockSchemaHelpers.addSchema).toHaveBeenCalledTimes(1)
      expect(mockSchemaHelpers.addSchema).toHaveBeenCalledWith(
        AJVSchemaEnum.CycleRecords, 
        schemaCycleRecordArray
      )
    })

    it('should not throw when called', () => {
      expect(() => initCycleRecords()).not.toThrow()
    })
  })

  describe('addSchemaDependencies', () => {
    it('should complete without throwing', () => {
      expect(() => addSchemaDependencies()).not.toThrow()
    })

    it('should not call any schema helper methods since there are no dependencies', () => {
      addSchemaDependencies()
      
      expect(mockSchemaHelpers.addSchemaDependency).not.toHaveBeenCalled()
    })
  })

  describe('addSchemas', () => {
    it('should call addSchema with correct parameters', () => {
      // Clear previous calls from initCycleRecords test
      jest.clearAllMocks()
      
      addSchemas()
      
      expect(mockSchemaHelpers.addSchema).toHaveBeenCalledWith(
        AJVSchemaEnum.CycleRecords, 
        schemaCycleRecordArray
      )
      expect(mockSchemaHelpers.addSchema).toHaveBeenCalledTimes(1)
    })

    it('should not throw when called', () => {
      expect(() => addSchemas()).not.toThrow()
    })
  })

  describe('Schema validation scenarios', () => {
    it('should handle valid minimal cycle record structure', () => {
      const schema = schemaCycleRecordArray as any
      const cycleRecordSchema = schema.items
      
      // Test that the schema structure allows for a valid minimal cycle record
      expect(cycleRecordSchema.type).toBe('object')
      expect(cycleRecordSchema.properties).toBeDefined()
      expect(cycleRecordSchema.required).toBeDefined()
      expect(Array.isArray(cycleRecordSchema.required)).toBe(true)
    })

    it('should handle archiver objects with all required fields', () => {
      const schema = schemaCycleRecordArray as any
      const archiverSchema = schema.items.properties.refreshedArchivers.items
      
      expect(archiverSchema.required).toEqual(['publicKey', 'ip', 'port', 'curvePk'])
      expect(archiverSchema.properties.publicKey.type).toBe('string')
      expect(archiverSchema.properties.ip.type).toBe('string')
      expect(archiverSchema.properties.port.type).toBe('number')
      expect(archiverSchema.properties.curvePk.type).toBe('string')
    })

    it('should handle consensor objects with all required fields', () => {
      const schema = schemaCycleRecordArray as any
      const consensorSchema = schema.items.properties.refreshedConsensors.items
      
      const expectedRequired = [
        'publicKey', 'externalIp', 'externalPort', 'internalIp', 'internalPort',
        'address', 'joinRequestTimestamp', 'activeTimestamp', 'activeCycle',
        'syncingTimestamp', 'readyTimestamp'
      ]
      
      expect(consensorSchema.required).toEqual(expect.arrayContaining(expectedRequired))
      expect(consensorSchema.properties.publicKey.type).toBe('string')
      expect(consensorSchema.properties.externalPort.type).toBe('number')
      expect(consensorSchema.properties.joinRequestTimestamp.type).toBe('number')
    })

    it('should handle standbyAdd with complex nested structure', () => {
      const schema = schemaCycleRecordArray as any
      const standbyAddSchema = schema.items.properties.standbyAdd.items
      
      expect(standbyAddSchema.required).toEqual([
        'appJoinData', 'cycleMarker', 'nodeInfo', 'proofOfWork', 
        'selectionNum', 'sign', 'version'
      ])
      
      // Test nodeInfo structure
      const nodeInfoSchema = standbyAddSchema.properties.nodeInfo
      expect(nodeInfoSchema.type).toBe('object')
      expect(nodeInfoSchema.required).toContain('publicKey')
      expect(nodeInfoSchema.required).toContain('address')
    })

    it('should handle network hash array structures', () => {
      const schema = schemaCycleRecordArray as any
      const networkDataHashSchema = schema.items.properties.networkDataHash.items
      
      expect(networkDataHashSchema.type).toBe('object')
      expect(networkDataHashSchema.properties.cycle.type).toBe('number')
      expect(networkDataHashSchema.properties.hash.type).toBe('string')
    })

    it('should handle transaction arrays correctly', () => {
      const schema = schemaCycleRecordArray as any
      const txaddSchema = schema.items.properties.txadd.items
      const txremoveSchema = schema.items.properties.txremove.items
      
      // txadd should have txData as object
      expect(txaddSchema.properties.txData.type).toBe('object')
      expect(txaddSchema.properties.priority.type).toBe('number')
      expect(txaddSchema.properties.subQueueKey.type).toBe('string')
      
      // txremove should be simpler
      expect(txremoveSchema.properties.txHash.type).toBe('string')
      expect(txremoveSchema.properties.cycle.type).toBe('number')
    })
  })

  describe('Edge cases and error handling', () => {
    it('should handle undefined schema gracefully', () => {
      // The schema is defined as object | undefined in the source
      expect(schemaCycleRecordArray).toBeDefined()
      expect(schemaCycleRecordArray).not.toBeNull()
    })

    it('should handle function calls with no side effects', () => {
      // Clear previous mock calls
      jest.clearAllMocks()
      
      addSchemaDependencies()
      addSchemas()
      
      // addSchemaDependencies should not add any calls to addSchema
      // addSchemas should add exactly one call to addSchema
      expect(mockSchemaHelpers.addSchema).toHaveBeenCalledTimes(1)
      expect(mockSchemaHelpers.addSchemaDependency).not.toHaveBeenCalled()
    })

    it('should handle repeated initialization calls', () => {
      expect(() => {
        initCycleRecords()
        initCycleRecords()
        initCycleRecords()
      }).not.toThrow()
    })

    it('should handle empty arrays in schema validation', () => {
      const schema = schemaCycleRecordArray as any
      const cycleRecordSchema = schema.items
      
      // All array properties should accept empty arrays
      const arrayProps = ['activated', 'apoptosized', 'joined', 'lost', 'refuted']
      arrayProps.forEach(prop => {
        expect(cycleRecordSchema.properties[prop].type).toBe('array')
        expect(cycleRecordSchema.properties[prop].items).toBeDefined()
      })
    })
  })

  describe('Schema consistency', () => {
    it('should have consistent archiver schema across different arrays', () => {
      const schema = schemaCycleRecordArray as any
      const cycleRecordSchema = schema.items
      
      const archiverArrays = ['refreshedArchivers', 'joinedArchivers', 'leavingArchivers', 'archiversAtShutdown']
      
      archiverArrays.forEach(arrayName => {
        const archiverSchema = cycleRecordSchema.properties[arrayName].items
        expect(archiverSchema.type).toBe('object')
        expect(archiverSchema.properties).toHaveProperty('publicKey')
        expect(archiverSchema.properties).toHaveProperty('ip')
        expect(archiverSchema.properties).toHaveProperty('port')
        expect(archiverSchema.properties).toHaveProperty('curvePk')
        expect(archiverSchema.required).toEqual(['publicKey', 'ip', 'port', 'curvePk'])
      })
    })

    it('should have consistent hash object schema across network hash arrays', () => {
      const schema = schemaCycleRecordArray as any
      const cycleRecordSchema = schema.items
      
      const hashArrays = ['networkDataHash', 'networkReceiptHash', 'networkSummaryHash']
      
      hashArrays.forEach(arrayName => {
        const hashSchema = cycleRecordSchema.properties[arrayName].items
        expect(hashSchema.type).toBe('object')
        expect(hashSchema.properties).toHaveProperty('cycle')
        expect(hashSchema.properties).toHaveProperty('hash')
        expect(hashSchema.properties.cycle.type).toBe('number')
        expect(hashSchema.properties.hash.type).toBe('string')
      })
    })

    it('should maintain schema export structure', () => {
      // Verify that the exported schema array structure is consistent
      expect(schemaCycleRecordArray).toHaveProperty('type', 'array')
      expect(schemaCycleRecordArray).toHaveProperty('items')
      
      const schema = schemaCycleRecordArray as any
      expect(schema.items).toHaveProperty('type', 'object')
      expect(schema.items).toHaveProperty('properties')
      expect(schema.items).toHaveProperty('required')
    })
  })
})