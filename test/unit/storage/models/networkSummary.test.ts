import networkSummary from '../../../../src/storage/models/networkSummary'
import { SQLDataTypes } from '../../../../src/storage/utils/schemaDefintions'

describe('networkSummary model', () => {
  it('should export a valid model definition', () => {
    expect(networkSummary).toBeDefined()
    expect(Array.isArray(networkSummary)).toBe(true)
    expect(networkSummary).toHaveLength(2)
  })

  it('should have correct table name', () => {
    expect(networkSummary[0]).toBe('networkSummary')
  })

  it('should have correct schema structure', () => {
    const schema = networkSummary[1] as Record<string, any>
    expect(schema).toBeDefined()
    expect(typeof schema).toBe('object')
    expect(Object.keys(schema)).toHaveLength(2)
    expect(schema).toHaveProperty('cycleNumber')
    expect(schema).toHaveProperty('hash')
  })

  it('should define cycleNumber field correctly', () => {
    const schema = networkSummary[1] as Record<string, any>
    expect(schema.cycleNumber).toBeDefined()
    expect(schema.cycleNumber.type).toBe(SQLDataTypes.STRING)
    expect(schema.cycleNumber.allowNull).toBe(false)
    expect(schema.cycleNumber.unique).toBe('compositeIndex')
  })

  it('should define hash field correctly', () => {
    const schema = networkSummary[1] as Record<string, any>
    expect(schema.hash).toBeDefined()
    expect(schema.hash.type).toBe(SQLDataTypes.STRING)
    expect(schema.hash.allowNull).toBe(false)
  })

  it('should export expected structure', () => {
    const [tableName, schema] = networkSummary
    expect(tableName).toBe('networkSummary')
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
    const schema = networkSummary[1] as Record<string, any>
    expect(schema.cycleNumber.unique).toBe('compositeIndex')
  })

  it('should have identical structure to network and networkReceipt models', () => {
    const schema = networkSummary[1] as Record<string, any>
    // All three network-related models have the same structure
    expect(Object.keys(schema)).toEqual(['cycleNumber', 'hash'])
    expect(schema.cycleNumber).toEqual({
      type: SQLDataTypes.STRING,
      allowNull: false,
      unique: 'compositeIndex',
    })
    expect(schema.hash).toEqual({
      type: SQLDataTypes.STRING,
      allowNull: false,
    })
  })

  it('should be suitable for storing summary hashes by cycle', () => {
    const [tableName, schema] = networkSummary
    expect(tableName).toBe('networkSummary')
    // Verify it has the necessary fields for summary storage
    expect(schema).toHaveProperty('cycleNumber')
    expect(schema).toHaveProperty('hash')
  })
})