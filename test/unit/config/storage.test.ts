import STORAGE_CONFIG from '../../../src/config/storage'
import { StrictStorageConfiguration } from '../../../src/shardus/shardus-types'

describe('storage config', () => {
  it('should export a valid storage configuration', () => {
    expect(STORAGE_CONFIG).toBeDefined()
    expect(typeof STORAGE_CONFIG).toBe('object')
  })

  it('should have correct database credentials', () => {
    expect(STORAGE_CONFIG.database).toBe('database')
    expect(STORAGE_CONFIG.username).toBe('username')
    expect(STORAGE_CONFIG.password).toBe('password')
  })

  it('should have all required options', () => {
    expect(STORAGE_CONFIG.options).toBeDefined()
    expect(typeof STORAGE_CONFIG.options).toBe('object')
  })

  it('should have correct logging configuration', () => {
    expect(STORAGE_CONFIG.options.logging).toBe(false)
  })

  it('should have correct database connection settings', () => {
    expect(STORAGE_CONFIG.options.host).toBe('localhost')
    expect(STORAGE_CONFIG.options.dialect).toBe('sqlite')
    expect(STORAGE_CONFIG.options.operatorsAliases).toBe(false)
  })

  it('should have correct pool configuration', () => {
    expect(STORAGE_CONFIG.options.pool).toBeDefined()
    expect(STORAGE_CONFIG.options.pool.max).toBe(5)
    expect(STORAGE_CONFIG.options.pool.min).toBe(0)
    expect(STORAGE_CONFIG.options.pool.acquire).toBe(30000)
    expect(STORAGE_CONFIG.options.pool.idle).toBe(10000)
  })

  it('should have correct storage path', () => {
    expect(STORAGE_CONFIG.options.storage).toBe('db/db.sqlite')
  })

  it('should have correct sync configuration', () => {
    expect(STORAGE_CONFIG.options.sync).toBeDefined()
    expect(STORAGE_CONFIG.options.sync.force).toBe(false)
  })

  it('should have correct sqlite-specific settings', () => {
    expect(STORAGE_CONFIG.options.memoryFile).toBe(false)
    expect(STORAGE_CONFIG.options.saveOldDBFiles).toBe(false)
    expect(STORAGE_CONFIG.options.walMode).toBe(true)
    expect(STORAGE_CONFIG.options.exclusiveLockMode).toBe(true)
  })

  it('should match StrictStorageConfiguration type structure', () => {
    const config: StrictStorageConfiguration = STORAGE_CONFIG
    expect(config).toBe(STORAGE_CONFIG)
  })

  it('should contain all expected top-level properties', () => {
    const expectedProperties = ['database', 'username', 'password', 'options']
    const actualProperties = Object.keys(STORAGE_CONFIG)

    expect(actualProperties).toHaveLength(expectedProperties.length)
    expectedProperties.forEach((prop) => {
      expect(actualProperties).toContain(prop)
    })
  })

  it('should contain all expected option properties', () => {
    const expectedOptions = [
      'logging',
      'host',
      'dialect',
      'operatorsAliases',
      'pool',
      'storage',
      'sync',
      'memoryFile',
      'saveOldDBFiles',
      'walMode',
      'exclusiveLockMode',
    ]
    const actualOptions = Object.keys(STORAGE_CONFIG.options)

    expect(actualOptions).toHaveLength(expectedOptions.length)
    expectedOptions.forEach((opt) => {
      expect(actualOptions).toContain(opt)
    })
  })
})
