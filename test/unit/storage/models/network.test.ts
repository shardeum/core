import network from '../../../../src/storage/models/network'
import { SQLDataTypes } from '../../../../src/storage/utils/schemaDefintions'

describe('network model', () => {
  it('should export a valid model definition', () => {
    expect(network).toBeDefined()
    expect(Array.isArray(network)).toBe(true)
    expect(network).toHaveLength(2)
  })

  it('should have correct table name', () => {
    expect(network[0]).toBe('network')
  })

  it('should have correct schema structure', () => {
    const schema = network[1] as Record<string, any>
    expect(schema).toBeDefined()
    expect(typeof schema).toBe('object')
    expect(Object.keys(schema)).toHaveLength(2)
    expect(schema).toHaveProperty('cycleNumber')
    expect(schema).toHaveProperty('hash')
  })

  it('should define cycleNumber field correctly', () => {
    const schema = network[1] as Record<string, any>
    expect(schema.cycleNumber).toBeDefined()
    expect(schema.cycleNumber.type).toBe(SQLDataTypes.STRING)
    expect(schema.cycleNumber.allowNull).toBe(false)
    expect(schema.cycleNumber.unique).toBe('compositeIndex')
  })

  it('should define hash field correctly', () => {
    const schema = network[1] as Record<string, any>
    expect(schema.hash).toBeDefined()
    expect(schema.hash.type).toBe(SQLDataTypes.STRING)
    expect(schema.hash.allowNull).toBe(false)
  })

  it('should export expected structure', () => {
    const [tableName, schema] = network
    expect(tableName).toBe('network')
    expect(schema).toEqual({
      cycleNumber: {
        type: SQLDataTypes.STRING,
        allowNull: false,
        unique: 'compositeIndex',
      },
      hash: { type: SQLDataTypes.STRING, allowNull: false },
    })
  })

  it('should have unique constraint on cycleNumber', () => {
    const schema = network[1] as Record<string, any>
    expect(schema.cycleNumber.unique).toBe('compositeIndex')
  })

  it('should not have additional fields', () => {
    const schema = network[1] as Record<string, any>
    const fields = Object.keys(schema)
    expect(fields).toHaveLength(2)
    expect(fields).toEqual(['cycleNumber', 'hash'])
  })
})
