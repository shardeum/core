import partitions from '../../../../src/storage/models/partitions'
import { SQLDataTypes } from '../../../../src/storage/utils/schemaDefintions'

describe('partitions model', () => {
  it('should export a valid model definition', () => {
    expect(partitions).toBeDefined()
    expect(Array.isArray(partitions)).toBe(true)
    expect(partitions).toHaveLength(2)
  })

  it('should have correct table name', () => {
    expect(partitions[0]).toBe('partitions')
  })

  it('should have correct schema structure', () => {
    const schema = partitions[1] as Record<string, any>
    expect(schema).toBeDefined()
    expect(typeof schema).toBe('object')
    expect(Object.keys(schema)).toHaveLength(3)
    expect(schema).toHaveProperty('partitionId')
    expect(schema).toHaveProperty('cycleNumber')
    expect(schema).toHaveProperty('hash')
  })

  it('should define partitionId field correctly', () => {
    const schema = partitions[1] as Record<string, any>
    expect(schema.partitionId).toBeDefined()
    expect(schema.partitionId.type).toBe(SQLDataTypes.STRING)
    expect(schema.partitionId.allowNull).toBe(false)
    expect(schema.partitionId.unique).toBe('compositeIndex')
  })

  it('should define cycleNumber field correctly', () => {
    const schema = partitions[1] as Record<string, any>
    expect(schema.cycleNumber).toBeDefined()
    expect(schema.cycleNumber.type).toBe(SQLDataTypes.STRING)
    expect(schema.cycleNumber.allowNull).toBe(false)
    expect(schema.cycleNumber.unique).toBe('compositeIndex')
  })

  it('should define hash field correctly', () => {
    const schema = partitions[1] as Record<string, any>
    expect(schema.hash).toBeDefined()
    expect(schema.hash.type).toBe(SQLDataTypes.STRING)
    expect(schema.hash.allowNull).toBe(false)
    expect(schema.hash.unique).toBeUndefined()
  })

  it('should have composite index on partitionId and cycleNumber', () => {
    const schema = partitions[1] as Record<string, any>
    expect(schema.partitionId.unique).toBe('compositeIndex')
    expect(schema.cycleNumber.unique).toBe('compositeIndex')
    // Both fields should have the same composite index name
    expect(schema.partitionId.unique).toBe(schema.cycleNumber.unique)
  })

  it('should export expected structure', () => {
    const [tableName, schema] = partitions
    expect(tableName).toBe('partitions')
    expect(schema).toEqual({
      partitionId: { type: SQLDataTypes.STRING, allowNull: false, unique: 'compositeIndex' },
      cycleNumber: { type: SQLDataTypes.STRING, allowNull: false, unique: 'compositeIndex' },
      hash: { type: SQLDataTypes.STRING, allowNull: false },
    })
  })

  it('should not allow null values for any field', () => {
    const schema = partitions[1] as Record<string, any>
    Object.values(schema).forEach((field: any) => {
      expect(field.allowNull).toBe(false)
    })
  })

  it('should use STRING type for all fields', () => {
    const schema = partitions[1] as Record<string, any>
    Object.values(schema).forEach((field: any) => {
      expect(field.type).toBe(SQLDataTypes.STRING)
    })
  })
})