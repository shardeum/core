import accountStates from '../../../../src/storage/models/accountStates'
import { SQLDataTypes } from '../../../../src/storage/utils/schemaDefintions'

describe('accountStates', () => {
  it('should export the correct model definition', () => {
    expect(accountStates).toBeDefined()
    expect(Array.isArray(accountStates)).toBe(true)
    expect(accountStates).toHaveLength(2)
  })

  it('should have the correct table name', () => {
    expect(accountStates[0]).toBe('accountStates')
  })

  it('should have the correct schema definition', () => {
    const schema = accountStates[1] as any
    expect(schema).toBeDefined()
    expect(typeof schema).toBe('object')
  })

  it('should have accountId field with correct properties', () => {
    const schema = accountStates[1] as any
    expect(schema.accountId).toBeDefined()
    expect(schema.accountId.type).toBe(SQLDataTypes.STRING)
    expect(schema.accountId.allowNull).toBe(false)
    expect(schema.accountId.unique).toBe('compositeIndex')
  })

  it('should have txId field with correct properties', () => {
    const schema = accountStates[1] as any
    expect(schema.txId).toBeDefined()
    expect(schema.txId.type).toBe(SQLDataTypes.STRING)
    expect(schema.txId.allowNull).toBe(false)
  })

  it('should have txTimestamp field with correct properties', () => {
    const schema = accountStates[1] as any
    expect(schema.txTimestamp).toBeDefined()
    expect(schema.txTimestamp.type).toBe(SQLDataTypes.BIGINT)
    expect(schema.txTimestamp.allowNull).toBe(false)
    expect(schema.txTimestamp.unique).toBe('compositeIndex')
  })

  it('should have stateBefore field with correct properties', () => {
    const schema = accountStates[1] as any
    expect(schema.stateBefore).toBeDefined()
    expect(schema.stateBefore.type).toBe(SQLDataTypes.STRING)
    expect(schema.stateBefore.allowNull).toBe(false)
  })

  it('should have stateAfter field with correct properties', () => {
    const schema = accountStates[1] as any
    expect(schema.stateAfter).toBeDefined()
    expect(schema.stateAfter.type).toBe(SQLDataTypes.STRING)
    expect(schema.stateAfter.allowNull).toBe(false)
  })

  it('should only have the expected fields', () => {
    const schema = accountStates[1] as any
    const expectedFields = ['accountId', 'txId', 'txTimestamp', 'stateBefore', 'stateAfter']
    const actualFields = Object.keys(schema)

    expect(actualFields).toHaveLength(expectedFields.length)
    expectedFields.forEach((field) => {
      expect(actualFields).toContain(field)
    })
  })

  it('should have unique constraint only on accountId and txTimestamp', () => {
    const schema = accountStates[1] as any
    expect(schema.accountId.unique).toBe('compositeIndex')
    expect(schema.txTimestamp.unique).toBe('compositeIndex')
    expect(schema.txId.unique).toBeUndefined()
    expect(schema.stateBefore.unique).toBeUndefined()
    expect(schema.stateAfter.unique).toBeUndefined()
  })

  it('should not have primaryKey on any field', () => {
    const schema = accountStates[1] as any
    expect(schema.accountId.primaryKey).toBeUndefined()
    expect(schema.txId.primaryKey).toBeUndefined()
    expect(schema.txTimestamp.primaryKey).toBeUndefined()
    expect(schema.stateBefore.primaryKey).toBeUndefined()
    expect(schema.stateAfter.primaryKey).toBeUndefined()
  })
})
