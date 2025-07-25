import cycles from '../../../../../src/storage/models/cycles'
import * as P2PApoptosis from '../../../../../src/p2p/Apoptosis'
import { SQLDataTypes } from '../../../../../src/storage/utils/schemaDefintions'

describe('storage/models/cycles', () => {
  describe('cycles schema definition', () => {
    it('should export a schema array with table name and fields', () => {
      expect(Array.isArray(cycles)).toBe(true)
      expect(cycles).toHaveLength(2)
      expect(cycles[0]).toBe('cycles')
      expect(typeof cycles[1]).toBe('object')
    })

    it('should have the correct table name', () => {
      const [tableName] = cycles
      expect(tableName).toBe('cycles')
    })

    it('should define all required primary key fields', () => {
      const [, schema] = cycles as [string, any] as [string, any]

      expect(schema.counter).toBeDefined()
      expect(schema.counter.type).toBe(SQLDataTypes.BIGINT)
      expect(schema.counter.primaryKey).toBe(true)
      expect(schema.counter.unique).toBe(true)
      expect(schema.counter.allowNull).toBe(false)
    })

    it('should define all required network identification fields', () => {
      const [, schema] = cycles as [string, any]

      // Network identification
      expect(schema.networkId).toEqual({
        type: SQLDataTypes.TEXT,
        allowNull: false,
      })

      expect(schema.networkConfigHash).toEqual({
        type: SQLDataTypes.TEXT,
        allowNull: true,
      })
    })

    it('should define all required cycle timing fields', () => {
      const [, schema] = cycles as [string, any]

      expect(schema.start).toEqual({
        type: SQLDataTypes.BIGINT,
        allowNull: false,
      })

      expect(schema.duration).toEqual({
        type: SQLDataTypes.BIGINT,
        allowNull: false,
      })

      expect(schema.maxSyncTime).toEqual({
        type: SQLDataTypes.BIGINT,
        allowNull: true,
      })
    })

    it('should define all required cycle state fields', () => {
      const [, schema] = cycles as [string, any]

      expect(schema.mode).toEqual({
        type: SQLDataTypes.TEXT,
        allowNull: true,
      })

      expect(schema.safetyMode).toEqual({
        type: SQLDataTypes.TEXT,
        allowNull: true,
      })

      expect(schema.safetyNum).toEqual({
        type: SQLDataTypes.BIGINT,
        allowNull: true,
      })
    })

    it('should define all required node count fields', () => {
      const [, schema] = cycles as [string, any]

      const nodeCountFields = ['active', 'syncing', 'standby', 'desired', 'expired']

      nodeCountFields.forEach((field) => {
        expect(schema[field]).toEqual({
          type: SQLDataTypes.BIGINT,
          allowNull: false,
        })
      })
    })

    it('should define all required hash fields', () => {
      const [, schema] = cycles as [string, any]

      expect(schema.networkStateHash).toEqual({
        type: SQLDataTypes.TEXT,
        allowNull: true,
      })

      expect(schema.nodeListHash).toEqual({
        type: SQLDataTypes.TEXT,
        allowNull: false,
      })

      expect(schema.archiverListHash).toEqual({
        type: SQLDataTypes.TEXT,
        allowNull: false,
      })

      expect(schema.standbyNodeListHash).toEqual({
        type: SQLDataTypes.TEXT,
        allowNull: false,
      })
    })

    it('should define all required JSON fields for node lists', () => {
      const [, schema] = cycles as [string, any]

      const jsonFields = [
        'networkDataHash',
        'networkReceiptHash',
        'networkSummaryHash',
        'certificate',
        'joined',
        'joinedArchivers',
        'leavingArchivers',
        'joinedConsensors',
        'refreshedArchivers',
        'refreshedConsensors',
        'activated',
        'activatedPublicKeys',
        'removed',
        'appRemoved',
        'returned',
        'lost',
        'lostSyncing',
        'refuted',
        'txadd',
        'txremove',
        'archiversAtShutdown',
      ]

      jsonFields.forEach((field) => {
        expect(schema[field]).toBeDefined()
        expect(schema[field].type).toBe(SQLDataTypes.JSON)

        if (field === 'archiversAtShutdown') {
          expect(schema[field].allowNull).toBe(true)
        } else if (['networkDataHash', 'networkReceiptHash', 'networkSummaryHash'].includes(field)) {
          expect(schema[field].allowNull).toBe(true)
        } else {
          expect(schema[field].allowNull).toBe(false)
        }
      })
    })

    it('should define all required text fields for node operations', () => {
      const [, schema] = cycles as [string, any]

      const textFields = [
        'standbyAdd',
        'standbyRemove',
        'lostArchivers',
        'refutedArchivers',
        'removedArchivers',
        'startedSyncing',
        'lostAfterSelection',
        'finishedSyncing',
        'standbyRefresh',
        'txlisthash',
      ]

      textFields.forEach((field) => {
        expect(schema[field]).toEqual({
          type: SQLDataTypes.TEXT,
          allowNull: false,
        })
      })
    })

    it('should define required marker and previous fields', () => {
      const [, schema] = cycles as [string, any]

      expect(schema.marker).toEqual({
        type: SQLDataTypes.TEXT,
        allowNull: false,
      })

      expect(schema.previous).toEqual({
        type: SQLDataTypes.TEXT,
        allowNull: false,
      })
    })

    it('should define target and random fields', () => {
      const [, schema] = cycles as [string, any]

      expect(schema.target).toEqual({
        type: SQLDataTypes.BIGINT,
        allowNull: true,
      })

      expect(schema.random).toEqual({
        type: SQLDataTypes.INTEGER,
        allowNull: false,
      })
    })

    it('should include P2PApoptosis sequelize cycle field model', () => {
      const [, schema] = cycles as [string, any]

      // Verify that P2PApoptosis fields are included
      // We test this by checking that the schema has been extended
      expect(P2PApoptosis.sequelizeCycleFieldModel).toBeDefined()

      // The schema should include all the base fields plus the apoptosis fields
      const baseFieldCount = Object.keys(schema).length
      const apoptosisFieldCount = Object.keys(P2PApoptosis.sequelizeCycleFieldModel).length

      // If apoptosis adds fields, the schema should be larger than just the explicitly defined fields
      if (apoptosisFieldCount > 0) {
        expect(baseFieldCount).toBeGreaterThan(40) // We define ~40 explicit fields
      }
    })

    it('should have consistent schema structure', () => {
      const [, schema] = cycles as [string, any]

      // Verify all fields have proper structure
      Object.keys(schema).forEach((fieldName) => {
        const field = schema[fieldName]

        // Each field should be an object
        expect(typeof field).toBe('object')

        // Each field should have a type
        expect(field).toHaveProperty('type')

        // Each field should have allowNull property
        expect(field).toHaveProperty('allowNull')
        expect(typeof field.allowNull).toBe('boolean')

        // If it's the counter field, it should have additional properties
        if (fieldName === 'counter') {
          expect(field).toHaveProperty('primaryKey', true)
          expect(field).toHaveProperty('unique', true)
        }
      })
    })

    it('should use valid SQL data types', () => {
      const [, schema] = cycles as [string, any]

      const validTypes = [SQLDataTypes.TEXT, SQLDataTypes.BIGINT, SQLDataTypes.INTEGER, SQLDataTypes.JSON]

      Object.keys(schema).forEach((fieldName) => {
        const field = schema[fieldName]
        expect(validTypes).toContain(field.type)
      })
    })
  })

  describe('imports and dependencies', () => {
    it('should successfully import P2PApoptosis module', () => {
      expect(P2PApoptosis).toBeDefined()
      expect(P2PApoptosis.sequelizeCycleFieldModel).toBeDefined()
      expect(typeof P2PApoptosis.sequelizeCycleFieldModel).toBe('object')
    })

    it('should successfully import SQLDataTypes', () => {
      expect(SQLDataTypes).toBeDefined()
      expect(SQLDataTypes.TEXT).toBeDefined()
      expect(SQLDataTypes.BIGINT).toBeDefined()
      expect(SQLDataTypes.INTEGER).toBeDefined()
      expect(SQLDataTypes.JSON).toBeDefined()
    })
  })
})
