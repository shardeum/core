import networkReceipt from '../../../../src/storage/models/networkReceipt'
import { SQLDataTypes } from '../../../../src/storage/utils/schemaDefintions'

describe('networkReceipt model', () => {
  it('should export a valid model definition', () => {
    expect(networkReceipt).toBeDefined()
    expect(Array.isArray(networkReceipt)).toBe(true)
    expect(networkReceipt).toHaveLength(2)
  })

  it('should have correct table name', () => {
    expect(networkReceipt[0]).toBe('networkReceipt')
  })

  it('should have correct schema structure', () => {
    const schema = networkReceipt[1] as Record<string, any>
    expect(schema).toBeDefined()
    expect(typeof schema).toBe('object')
    expect(Object.keys(schema)).toHaveLength(2)
    expect(schema).toHaveProperty('cycleNumber')
    expect(schema).toHaveProperty('hash')
  })

  it('should define cycleNumber field correctly', () => {
    const schema = networkReceipt[1] as Record<string, any>
    expect(schema.cycleNumber).toBeDefined()
    expect(schema.cycleNumber.type).toBe(SQLDataTypes.STRING)
    expect(schema.cycleNumber.allowNull).toBe(false)
    expect(schema.cycleNumber.unique).toBe('compositeIndex')
  })

  it('should define hash field correctly', () => {
    const schema = networkReceipt[1] as Record<string, any>
    expect(schema.hash).toBeDefined()
    expect(schema.hash.type).toBe(SQLDataTypes.STRING)
    expect(schema.hash.allowNull).toBe(false)
  })

  it('should export expected structure', () => {
    const [tableName, schema] = networkReceipt
    expect(tableName).toBe('networkReceipt')
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
    const schema = networkReceipt[1] as Record<string, any>
    expect(schema.cycleNumber.unique).toBe('compositeIndex')
  })

  it('should have identical structure to network model', () => {
    const schema = networkReceipt[1] as Record<string, any>
    // Both network and networkReceipt have the same structure
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
})