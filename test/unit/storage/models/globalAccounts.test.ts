import globalAccounts from '../../../../src/storage/models/globalAccounts'
import { SQLDataTypes } from '../../../../src/storage/utils/schemaDefintions'

describe('globalAccounts model', () => {
  it('should export a valid model definition', () => {
    expect(globalAccounts).toBeDefined()
    expect(Array.isArray(globalAccounts)).toBe(true)
    expect(globalAccounts).toHaveLength(2)
  })

  it('should have correct table name', () => {
    expect(globalAccounts[0]).toBe('globalAccounts')
  })

  it('should have correct schema structure', () => {
    const schema = globalAccounts[1] as Record<string, any>
    expect(schema).toBeDefined()
    expect(typeof schema).toBe('object')
    expect(Object.keys(schema)).toHaveLength(5)
    expect(schema).toHaveProperty('accountId')
    expect(schema).toHaveProperty('cycleNumber')
    expect(schema).toHaveProperty('data')
    expect(schema).toHaveProperty('timestamp')
    expect(schema).toHaveProperty('hash')
  })

  it('should define accountId field correctly', () => {
    const schema = globalAccounts[1] as Record<string, any>
    expect(schema.accountId).toBeDefined()
    expect(schema.accountId.type).toBe(SQLDataTypes.STRING)
    expect(schema.accountId.allowNull).toBe(false)
    expect(schema.accountId.unique).toBe('compositeIndex')
  })

  it('should define cycleNumber field correctly', () => {
    const schema = globalAccounts[1] as Record<string, any>
    expect(schema.cycleNumber).toBeDefined()
    expect(schema.cycleNumber.type).toBe(SQLDataTypes.STRING)
    expect(schema.cycleNumber.allowNull).toBe(false)
    expect(schema.cycleNumber.unique).toBe('compositeIndex')
  })

  it('should define data field correctly', () => {
    const schema = globalAccounts[1] as Record<string, any>
    expect(schema.data).toBeDefined()
    expect(schema.data.type).toBe(SQLDataTypes.JSON)
    expect(schema.data.allowNull).toBe(false)
  })

  it('should define timestamp field correctly', () => {
    const schema = globalAccounts[1] as Record<string, any>
    expect(schema.timestamp).toBeDefined()
    expect(schema.timestamp.type).toBe(SQLDataTypes.BIGINT)
    expect(schema.timestamp.allowNull).toBe(false)
  })

  it('should define hash field correctly', () => {
    const schema = globalAccounts[1] as Record<string, any>
    expect(schema.hash).toBeDefined()
    expect(schema.hash.type).toBe(SQLDataTypes.STRING)
    expect(schema.hash.allowNull).toBe(false)
  })

  it('should export expected structure', () => {
    const [tableName, schema] = globalAccounts
    expect(tableName).toBe('globalAccounts')
    expect(schema).toEqual({
      accountId: { type: SQLDataTypes.STRING, allowNull: false, unique: 'compositeIndex' },
      cycleNumber: { type: SQLDataTypes.STRING, allowNull: false, unique: 'compositeIndex' },
      data: { type: SQLDataTypes.JSON, allowNull: false },
      timestamp: { type: SQLDataTypes.BIGINT, allowNull: false },
      hash: { type: SQLDataTypes.STRING, allowNull: false },
    })
  })

  it('should have composite index on accountId and cycleNumber', () => {
    const schema = globalAccounts[1] as Record<string, any>
    expect(schema.accountId.unique).toBe('compositeIndex')
    expect(schema.cycleNumber.unique).toBe('compositeIndex')
  })
})
