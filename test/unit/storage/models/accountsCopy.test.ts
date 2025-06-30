import accountsCopy from '../../../../src/storage/models/accountsCopy'
import { SQLDataTypes } from '../../../../src/storage/utils/schemaDefintions'

describe('accountsCopy model', () => {
  it('should export a valid model definition', () => {
    expect(accountsCopy).toBeDefined()
    expect(Array.isArray(accountsCopy)).toBe(true)
    expect(accountsCopy).toHaveLength(2)
  })

  it('should have correct table name', () => {
    expect(accountsCopy[0]).toBe('accountsCopy')
  })

  it('should have correct schema structure', () => {
    const schema = accountsCopy[1] as Record<string, any>
    expect(schema).toBeDefined()
    expect(typeof schema).toBe('object')
    expect(Object.keys(schema)).toHaveLength(6)
    expect(schema).toHaveProperty('accountId')
    expect(schema).toHaveProperty('cycleNumber')
    expect(schema).toHaveProperty('data')
    expect(schema).toHaveProperty('timestamp')
    expect(schema).toHaveProperty('hash')
    expect(schema).toHaveProperty('isGlobal')
  })

  it('should define accountId field correctly', () => {
    const schema = accountsCopy[1] as Record<string, any>
    expect(schema.accountId).toBeDefined()
    expect(schema.accountId.type).toBe(SQLDataTypes.STRING)
    expect(schema.accountId.allowNull).toBe(false)
    expect(schema.accountId.unique).toBe('compositeIndex')
  })

  it('should define cycleNumber field correctly', () => {
    const schema = accountsCopy[1] as Record<string, any>
    expect(schema.cycleNumber).toBeDefined()
    expect(schema.cycleNumber.type).toBe(SQLDataTypes.STRING)
    expect(schema.cycleNumber.allowNull).toBe(false)
    expect(schema.cycleNumber.unique).toBe('compositeIndex')
  })

  it('should define data field correctly', () => {
    const schema = accountsCopy[1] as Record<string, any>
    expect(schema.data).toBeDefined()
    expect(schema.data.type).toBe(SQLDataTypes.JSON)
    expect(schema.data.allowNull).toBe(false)
  })

  it('should define timestamp field correctly', () => {
    const schema = accountsCopy[1] as Record<string, any>
    expect(schema.timestamp).toBeDefined()
    expect(schema.timestamp.type).toBe(SQLDataTypes.BIGINT)
    expect(schema.timestamp.allowNull).toBe(false)
  })

  it('should define hash field correctly', () => {
    const schema = accountsCopy[1] as Record<string, any>
    expect(schema.hash).toBeDefined()
    expect(schema.hash.type).toBe(SQLDataTypes.STRING)
    expect(schema.hash.allowNull).toBe(false)
  })

  it('should define isGlobal field correctly', () => {
    const schema = accountsCopy[1] as Record<string, any>
    expect(schema.isGlobal).toBeDefined()
    expect(schema.isGlobal.type).toBe(SQLDataTypes.BOOLEAN)
    expect(schema.isGlobal.allowNull).toBe(false)
  })

  it('should export expected structure', () => {
    const [tableName, schema] = accountsCopy
    expect(tableName).toBe('accountsCopy')
    expect(schema).toEqual({
      accountId: { type: SQLDataTypes.STRING, allowNull: false, unique: 'compositeIndex' },
      cycleNumber: { type: SQLDataTypes.STRING, allowNull: false, unique: 'compositeIndex' },
      data: { type: SQLDataTypes.JSON, allowNull: false },
      timestamp: { type: SQLDataTypes.BIGINT, allowNull: false },
      hash: { type: SQLDataTypes.STRING, allowNull: false },
      isGlobal: { type: SQLDataTypes.BOOLEAN, allowNull: false },
    })
  })

  it('should have composite index on accountId and cycleNumber', () => {
    const schema = accountsCopy[1] as Record<string, any>
    expect(schema.accountId.unique).toBe('compositeIndex')
    expect(schema.cycleNumber.unique).toBe('compositeIndex')
  })

  it('should differ from globalAccounts by having isGlobal field', () => {
    const schema = accountsCopy[1] as Record<string, any>
    expect(schema.isGlobal).toBeDefined()
    expect(Object.keys(schema)).toContain('isGlobal')
  })
})