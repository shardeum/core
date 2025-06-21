import nodes from '../../../../src/storage/models/nodes'
import { SQLDataTypes } from '../../../../src/storage/utils/schemaDefintions'

describe('nodes', () => {
  it('should export the correct model definition', () => {
    expect(nodes).toBeDefined()
    expect(Array.isArray(nodes)).toBe(true)
    expect(nodes).toHaveLength(2)
  })

  it('should have the correct table name', () => {
    expect(nodes[0]).toBe('nodes')
  })

  it('should have the correct schema definition', () => {
    const schema = nodes[1] as any
    expect(schema).toBeDefined()
    expect(typeof schema).toBe('object')
  })

  it('should have id field with correct properties', () => {
    const schema = nodes[1] as any
    expect(schema.id).toBeDefined()
    expect(schema.id.type).toBe(SQLDataTypes.TEXT)
    expect(schema.id.allowNull).toBe(false)
    expect(schema.id.primaryKey).toBe(true)
  })

  it('should have publicKey field with correct properties', () => {
    const schema = nodes[1] as any
    expect(schema.publicKey).toBeDefined()
    expect(schema.publicKey.type).toBe(SQLDataTypes.TEXT)
    expect(schema.publicKey.allowNull).toBe(false)
  })

  it('should have curvePublicKey field with correct properties', () => {
    const schema = nodes[1] as any
    expect(schema.curvePublicKey).toBeDefined()
    expect(schema.curvePublicKey.type).toBe(SQLDataTypes.TEXT)
    expect(schema.curvePublicKey.allowNull).toBe(false)
  })

  it('should have cycleJoined field with correct properties', () => {
    const schema = nodes[1] as any
    expect(schema.cycleJoined).toBeDefined()
    expect(schema.cycleJoined.type).toBe(SQLDataTypes.TEXT)
    expect(schema.cycleJoined.allowNull).toBe(false)
  })

  it('should have internalIp field with correct properties', () => {
    const schema = nodes[1] as any
    expect(schema.internalIp).toBeDefined()
    expect(schema.internalIp.type).toBe(SQLDataTypes.STRING)
    expect(schema.internalIp.allowNull).toBe(false)
  })

  it('should have externalIp field with correct properties', () => {
    const schema = nodes[1] as any
    expect(schema.externalIp).toBeDefined()
    expect(schema.externalIp.type).toBe(SQLDataTypes.STRING)
    expect(schema.externalIp.allowNull).toBe(false)
  })

  it('should have internalPort field with correct properties', () => {
    const schema = nodes[1] as any
    expect(schema.internalPort).toBeDefined()
    expect(schema.internalPort.type).toBe(SQLDataTypes.SMALLINT)
    expect(schema.internalPort.allowNull).toBe(false)
  })

  it('should have externalPort field with correct properties', () => {
    const schema = nodes[1] as any
    expect(schema.externalPort).toBeDefined()
    expect(schema.externalPort.type).toBe(SQLDataTypes.SMALLINT)
    expect(schema.externalPort.allowNull).toBe(false)
  })

  it('should have joinRequestTimestamp field with correct properties', () => {
    const schema = nodes[1] as any
    expect(schema.joinRequestTimestamp).toBeDefined()
    expect(schema.joinRequestTimestamp.type).toBe(SQLDataTypes.BIGINT)
    expect(schema.joinRequestTimestamp.allowNull).toBe(false)
  })

  it('should have activeTimestamp field with correct properties', () => {
    const schema = nodes[1] as any
    expect(schema.activeTimestamp).toBeDefined()
    expect(schema.activeTimestamp.type).toBe(SQLDataTypes.BIGINT)
    expect(schema.activeTimestamp.allowNull).toBe(false)
  })

  it('should have address field with correct properties', () => {
    const schema = nodes[1] as any
    expect(schema.address).toBeDefined()
    expect(schema.address.type).toBe(SQLDataTypes.STRING)
    expect(schema.address.allowNull).toBe(false)
  })

  it('should have status field with correct properties', () => {
    const schema = nodes[1] as any
    expect(schema.status).toBeDefined()
    expect(schema.status.type).toBe(SQLDataTypes.STRING)
    expect(schema.status.allowNull).toBe(false)
  })

  it('should only have the expected fields', () => {
    const schema = nodes[1] as any
    const expectedFields = [
      'id', 'publicKey', 'curvePublicKey', 'cycleJoined',
      'internalIp', 'externalIp', 'internalPort', 'externalPort',
      'joinRequestTimestamp', 'activeTimestamp', 'address', 'status'
    ]
    const actualFields = Object.keys(schema)
    
    expect(actualFields).toHaveLength(expectedFields.length)
    expectedFields.forEach(field => {
      expect(actualFields).toContain(field)
    })
  })

  it('should have primaryKey only on id field', () => {
    const schema = nodes[1] as any
    expect(schema.id.primaryKey).toBe(true)
    
    // Check all other fields don't have primaryKey
    const nonIdFields = ['publicKey', 'curvePublicKey', 'cycleJoined',
      'internalIp', 'externalIp', 'internalPort', 'externalPort',
      'joinRequestTimestamp', 'activeTimestamp', 'address', 'status']
    
    nonIdFields.forEach(field => {
      expect(schema[field].primaryKey).toBeUndefined()
    })
  })

  it('should use correct data types for different fields', () => {
    const schema = nodes[1] as any
    
    // TEXT fields
    const textFields = ['id', 'publicKey', 'curvePublicKey', 'cycleJoined']
    textFields.forEach(field => {
      expect(schema[field].type).toBe(SQLDataTypes.TEXT)
    })
    
    // STRING fields
    const stringFields = ['internalIp', 'externalIp', 'address', 'status']
    stringFields.forEach(field => {
      expect(schema[field].type).toBe(SQLDataTypes.STRING)
    })
    
    // SMALLINT fields
    const smallintFields = ['internalPort', 'externalPort']
    smallintFields.forEach(field => {
      expect(schema[field].type).toBe(SQLDataTypes.SMALLINT)
    })
    
    // BIGINT fields
    const bigintFields = ['joinRequestTimestamp', 'activeTimestamp']
    bigintFields.forEach(field => {
      expect(schema[field].type).toBe(SQLDataTypes.BIGINT)
    })
  })
})