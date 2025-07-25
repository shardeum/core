import acceptedTx from '../../../../src/storage/models/acceptedTxs'
import { SQLDataTypes } from '../../../../src/storage/utils/schemaDefintions'

describe('acceptedTxs', () => {
  it('should export the correct model definition', () => {
    expect(acceptedTx).toBeDefined()
    expect(Array.isArray(acceptedTx)).toBe(true)
    expect(acceptedTx).toHaveLength(2)
  })

  it('should have the correct table name', () => {
    expect(acceptedTx[0]).toBe('acceptedTxs')
  })

  it('should have the correct schema definition', () => {
    const schema = acceptedTx[1] as any
    expect(schema).toBeDefined()
    expect(typeof schema).toBe('object')
  })

  it('should have txId field with correct properties', () => {
    const schema = acceptedTx[1] as any
    expect(schema.txId).toBeDefined()
    expect(schema.txId.type).toBe(SQLDataTypes.STRING)
    expect(schema.txId.allowNull).toBe(false)
    expect(schema.txId.primaryKey).toBe(true)
  })

  it('should have timestamp field with correct properties', () => {
    const schema = acceptedTx[1] as any
    expect(schema.timestamp).toBeDefined()
    expect(schema.timestamp.type).toBe(SQLDataTypes.BIGINT)
    expect(schema.timestamp.allowNull).toBe(false)
  })

  it('should have data field with correct properties', () => {
    const schema = acceptedTx[1] as any
    expect(schema.data).toBeDefined()
    expect(schema.data.type).toBe(SQLDataTypes.JSON)
    expect(schema.data.allowNull).toBe(false)
  })

  it('should have keys field with correct properties', () => {
    const schema = acceptedTx[1] as any
    expect(schema.keys).toBeDefined()
    expect(schema.keys.type).toBe(SQLDataTypes.JSON)
    expect(schema.keys.allowNull).toBe(false)
  })

  it('should only have the expected fields', () => {
    const schema = acceptedTx[1] as any
    const expectedFields = ['txId', 'timestamp', 'data', 'keys']
    const actualFields = Object.keys(schema)

    expect(actualFields).toHaveLength(expectedFields.length)
    expectedFields.forEach((field) => {
      expect(actualFields).toContain(field)
    })
  })

  it('should not have primaryKey set on non-txId fields', () => {
    const schema = acceptedTx[1] as any
    expect(schema.timestamp.primaryKey).toBeUndefined()
    expect(schema.data.primaryKey).toBeUndefined()
    expect(schema.keys.primaryKey).toBeUndefined()
  })
})
