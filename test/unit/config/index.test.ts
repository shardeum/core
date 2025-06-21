import SHARDUS_CONFIG from '../../../src/config/index'
import LOGS_CONFIG from '../../../src/config/logs'
import SERVER_CONFIG from '../../../src/config/server'
import STORAGE_CONFIG from '../../../src/config/storage'

describe('SHARDUS_CONFIG', () => {
  it('should export a configuration object', () => {
    expect(SHARDUS_CONFIG).toBeDefined()
    expect(typeof SHARDUS_CONFIG).toBe('object')
  })

  it('should have the required configuration sections', () => {
    expect(SHARDUS_CONFIG).toHaveProperty('server')
    expect(SHARDUS_CONFIG).toHaveProperty('logs')
    expect(SHARDUS_CONFIG).toHaveProperty('storage')
  })

  it('should include the server configuration', () => {
    expect(SHARDUS_CONFIG.server).toBe(SERVER_CONFIG)
    expect(SHARDUS_CONFIG.server).toBeDefined()
    expect(typeof SHARDUS_CONFIG.server).toBe('object')
  })

  it('should include the logs configuration', () => {
    expect(SHARDUS_CONFIG.logs).toBe(LOGS_CONFIG)
    expect(SHARDUS_CONFIG.logs).toBeDefined()
    expect(typeof SHARDUS_CONFIG.logs).toBe('object')
  })

  it('should include the storage configuration', () => {
    expect(SHARDUS_CONFIG.storage).toBe(STORAGE_CONFIG)
    expect(SHARDUS_CONFIG.storage).toBeDefined()
    expect(typeof SHARDUS_CONFIG.storage).toBe('object')
  })

  it('should only have the expected properties', () => {
    const configKeys = Object.keys(SHARDUS_CONFIG)
    expect(configKeys).toHaveLength(3)
    expect(configKeys).toEqual(['server', 'logs', 'storage'])
  })

  it('should have the correct structure matching StrictShardusConfiguration', () => {
    // Verify the overall structure
    expect(SHARDUS_CONFIG).toMatchObject({
      server: expect.any(Object),
      logs: expect.any(Object),
      storage: expect.any(Object),
    })
  })

  it('should reference the same config objects from imports', () => {
    // Ensure the config is using the imported configs, not copies
    expect(SHARDUS_CONFIG.server).toBe(SERVER_CONFIG)
    expect(SHARDUS_CONFIG.logs).toBe(LOGS_CONFIG)
    expect(SHARDUS_CONFIG.storage).toBe(STORAGE_CONFIG)
  })
})