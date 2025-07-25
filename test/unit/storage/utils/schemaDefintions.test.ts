import { SQLDataTypes, ColumnDescription } from '../../../../src/storage/utils/schemaDefintions'

describe('schemaDefintions', () => {
  describe('SQLDataTypes enum', () => {
    it('should export all expected data types', () => {
      expect(SQLDataTypes.STRING).toBe('TEXT')
      expect(SQLDataTypes.TEXT).toBe('TEXT')
      expect(SQLDataTypes.INTEGER).toBe('INTEGER')
      expect(SQLDataTypes.SMALLINT).toBe('INTEGER')
      expect(SQLDataTypes.BIGINT).toBe('INTEGER')
      expect(SQLDataTypes.BOOLEAN).toBe('NUMERIC')
      expect(SQLDataTypes.FLOAT).toBe('REAL')
      expect(SQLDataTypes.DOUBLE).toBe('REAL')
      expect(SQLDataTypes.DATE).toBe('NUMERIC')
      expect(SQLDataTypes.JSON).toBe('JSON')
    })

    it('should have exactly 10 data types', () => {
      const dataTypes = Object.keys(SQLDataTypes)
      expect(dataTypes).toHaveLength(10)
    })

    it('should map multiple types to same SQL type', () => {
      // Text types
      expect(SQLDataTypes.STRING).toBe(SQLDataTypes.TEXT)

      // Integer types
      expect(SQLDataTypes.INTEGER).toBe(SQLDataTypes.SMALLINT)
      expect(SQLDataTypes.INTEGER).toBe(SQLDataTypes.BIGINT)

      // Real types
      expect(SQLDataTypes.FLOAT).toBe(SQLDataTypes.DOUBLE)
    })

    it('should have unique SQL type values', () => {
      const uniqueValues = new Set(Object.values(SQLDataTypes))
      expect(uniqueValues.size).toBe(5) // TEXT, INTEGER, NUMERIC, REAL, JSON
    })

    it('should contain all SQLite compatible types', () => {
      const sqliteTypes = ['TEXT', 'INTEGER', 'NUMERIC', 'REAL', 'JSON']
      const enumValues = Array.from(new Set(Object.values(SQLDataTypes)))

      sqliteTypes.forEach((type) => {
        expect(enumValues).toContain(type)
      })
    })
  })

  describe('ColumnDescription type', () => {
    it('should accept minimal column definition', () => {
      const column: ColumnDescription = {
        type: SQLDataTypes.STRING,
      }

      expect(column.type).toBe('TEXT')
      expect(column.allowNull).toBeUndefined()
      expect(column.primaryKey).toBeUndefined()
      expect(column.unique).toBeUndefined()
    })

    it('should accept full column definition', () => {
      const column: ColumnDescription = {
        type: SQLDataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
        unique: true,
      }

      expect(column.type).toBe('INTEGER')
      expect(column.allowNull).toBe(false)
      expect(column.primaryKey).toBe(true)
      expect(column.unique).toBe(true)
    })

    it('should accept string values for unique property', () => {
      // Note: The models use string values but the type definition only allows boolean
      // This test validates the runtime behavior, not the type safety
      const column = {
        type: SQLDataTypes.STRING,
        unique: 'compositeIndex',
      } as any

      expect(column.unique).toBe('compositeIndex')
    })

    it('should accept boolean values for unique property', () => {
      const column: ColumnDescription = {
        type: SQLDataTypes.STRING,
        unique: true,
      }

      expect(column.unique).toBe(true)
    })

    it('should work with all SQLDataTypes', () => {
      Object.values(SQLDataTypes).forEach((dataType) => {
        const column: ColumnDescription = { type: dataType }
        expect(column.type).toBe(dataType)
      })
    })
  })

  describe('Integration', () => {
    it('should work with model definitions', () => {
      // Example model definition similar to those in the codebase
      const modelDef = [
        'testTable',
        {
          id: { type: SQLDataTypes.STRING, allowNull: false, primaryKey: true },
          data: { type: SQLDataTypes.JSON, allowNull: false },
          count: { type: SQLDataTypes.INTEGER },
          isActive: { type: SQLDataTypes.BOOLEAN, allowNull: false },
          timestamp: { type: SQLDataTypes.BIGINT, allowNull: false },
        },
      ]

      expect(modelDef[0]).toBe('testTable')
      const schema = modelDef[1] as Record<string, any>
      expect(schema.id.type).toBe('TEXT')
      expect(schema.data.type).toBe('JSON')
      expect(schema.count.type).toBe('INTEGER')
      expect(schema.isActive.type).toBe('NUMERIC')
      expect(schema.timestamp.type).toBe('INTEGER')
    })

    it('should support composite indexes', () => {
      const modelWithComposite = {
        field1: { type: SQLDataTypes.STRING, unique: 'compositeIndex' },
        field2: { type: SQLDataTypes.STRING, unique: 'compositeIndex' },
      }

      expect(modelWithComposite.field1.unique).toBe('compositeIndex')
      expect(modelWithComposite.field2.unique).toBe('compositeIndex')
    })
  })
})
