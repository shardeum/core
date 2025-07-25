import properties from '../../../../src/storage/models/properties'
import { SQLDataTypes } from '../../../../src/storage/utils/schemaDefintions'

describe('properties model', () => {
  it('should export a valid model definition', () => {
    expect(properties).toBeDefined()
    expect(Array.isArray(properties)).toBe(true)
    expect(properties).toHaveLength(2)
  })

  it('should have correct table name', () => {
    expect(properties[0]).toBe('properties')
  })

  it('should have correct schema structure', () => {
    const schema = properties[1] as Record<string, any>
    expect(schema).toBeDefined()
    expect(typeof schema).toBe('object')
    expect(Object.keys(schema)).toHaveLength(2)
    expect(schema).toHaveProperty('key')
    expect(schema).toHaveProperty('value')
  })

  it('should define key field correctly', () => {
    const schema = properties[1] as Record<string, any>
    expect(schema.key).toBeDefined()
    expect(schema.key.type).toBe(SQLDataTypes.STRING)
    expect(schema.key.allowNull).toBe(false)
    expect(schema.key.primaryKey).toBe(true)
  })

  it('should define value field correctly', () => {
    const schema = properties[1] as Record<string, any>
    expect(schema.value).toBe(SQLDataTypes.JSON)
  })

  it('should export expected structure', () => {
    const [tableName, schema] = properties
    expect(tableName).toBe('properties')
    expect(schema).toEqual({
      key: { type: SQLDataTypes.STRING, allowNull: false, primaryKey: true },
      value: SQLDataTypes.JSON,
    })
  })
})
