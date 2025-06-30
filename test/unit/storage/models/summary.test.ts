import summary from '../../../../src/storage/models/summary'
import { SQLDataTypes } from '../../../../src/storage/utils/schemaDefintions'

describe('summary model', () => {
  it('should export a valid model definition', () => {
    expect(summary).toBeDefined()
    expect(Array.isArray(summary)).toBe(true)
    expect(summary).toHaveLength(2)
  })

  it('should have correct table name', () => {
    expect(summary[0]).toBe('summary')
  })

  it('should have correct schema structure', () => {
    const schema = summary[1] as Record<string, any>
    expect(schema).toBeDefined()
    expect(typeof schema).toBe('object')
    expect(Object.keys(schema)).toHaveLength(3)
    expect(schema).toHaveProperty('partitionId')
    expect(schema).toHaveProperty('cycleNumber')
    expect(schema).toHaveProperty('hash')
  })

  it('should define partitionId field correctly', () => {
    const schema = summary[1] as Record<string, any>
    expect(schema.partitionId).toBeDefined()
    expect(schema.partitionId.type).toBe(SQLDataTypes.STRING)
    expect(schema.partitionId.allowNull).toBe(false)
    expect(schema.partitionId.unique).toBe('compositeIndex')
  })

  it('should define cycleNumber field correctly', () => {
    const schema = summary[1] as Record<string, any>
    expect(schema.cycleNumber).toBeDefined()
    expect(schema.cycleNumber.type).toBe(SQLDataTypes.STRING)
    expect(schema.cycleNumber.allowNull).toBe(false)
    expect(schema.cycleNumber.unique).toBe('compositeIndex')
  })

  it('should define hash field correctly', () => {
    const schema = summary[1] as Record<string, any>
    expect(schema.hash).toBeDefined()
    expect(schema.hash.type).toBe(SQLDataTypes.STRING)
    expect(schema.hash.allowNull).toBe(false)
  })

  it('should export expected structure', () => {
    const [tableName, schema] = summary
    expect(tableName).toBe('summary')
    expect(schema).toEqual({
      partitionId: { type: SQLDataTypes.STRING, allowNull: false, unique: 'compositeIndex' },
      cycleNumber: { type: SQLDataTypes.STRING, allowNull: false, unique: 'compositeIndex' },
      hash: { type: SQLDataTypes.STRING, allowNull: false },
    })
  })

  it('should have composite index on partitionId and cycleNumber', () => {
    const schema = summary[1] as Record<string, any>
    expect(schema.partitionId.unique).toBe('compositeIndex')
    expect(schema.cycleNumber.unique).toBe('compositeIndex')
  })
})