import SERVER_CONFIG from '../../../src/config/server'
import { ServerMode, StrictServerConfiguration } from '../../../src/shardus/shardus-types'

describe('SERVER_CONFIG', () => {
  it('should export a configuration object', () => {
    expect(SERVER_CONFIG).toBeDefined()
    expect(typeof SERVER_CONFIG).toBe('object')
  })

  it('should be a StrictServerConfiguration', () => {
    // Verify it has the required structure of StrictServerConfiguration
    expect(SERVER_CONFIG).toMatchObject({
      heartbeatInterval: expect.any(Number),
      baseDir: expect.any(String),
      transactionExpireTime: expect.any(Number),
      globalAccount: expect.any(String),
      nonceMode: expect.any(Boolean),
      crypto: expect.any(Object),
      p2p: expect.any(Object),
      ip: expect.any(Object),
      network: expect.any(Object),
      reporting: expect.any(Object),
      debug: expect.any(Object),
      statistics: expect.any(Object),
      loadDetection: expect.any(Object),
      rateLimiting: expect.any(Object),
      stateManager: expect.any(Object),
      sharding: expect.any(Object),
      mode: expect.any(String),
      features: expect.any(Object)
    })
  })

  describe('basic configuration properties', () => {
    it('should have valid heartbeatInterval', () => {
      expect(SERVER_CONFIG.heartbeatInterval).toBe(5)
      expect(typeof SERVER_CONFIG.heartbeatInterval).toBe('number')
      expect(SERVER_CONFIG.heartbeatInterval).toBeGreaterThan(0)
    })

    it('should have valid baseDir', () => {
      expect(SERVER_CONFIG.baseDir).toBe('.')
      expect(typeof SERVER_CONFIG.baseDir).toBe('string')
    })

    it('should have valid transactionExpireTime', () => {
      expect(SERVER_CONFIG.transactionExpireTime).toBe(5)
      expect(typeof SERVER_CONFIG.transactionExpireTime).toBe('number')
      expect(SERVER_CONFIG.transactionExpireTime).toBeGreaterThan(0)
    })

    it('should have valid globalAccount', () => {
      expect(SERVER_CONFIG.globalAccount).toBe('0'.repeat(64))
      expect(typeof SERVER_CONFIG.globalAccount).toBe('string')
      expect(SERVER_CONFIG.globalAccount).toHaveLength(64)
    })

    it('should have valid nonceMode', () => {
      expect(SERVER_CONFIG.nonceMode).toBe(true)
      expect(typeof SERVER_CONFIG.nonceMode).toBe('boolean')
    })

    it('should have valid mode', () => {
      expect(SERVER_CONFIG.mode).toBe(ServerMode.Release)
      expect(Object.values(ServerMode)).toContain(SERVER_CONFIG.mode)
    })
  })

  describe('crypto configuration', () => {
    it('should have valid crypto configuration', () => {
      expect(SERVER_CONFIG.crypto).toBeDefined()
      expect(typeof SERVER_CONFIG.crypto).toBe('object')
    })

    it('should have valid hashKey', () => {
      expect(SERVER_CONFIG.crypto.hashKey).toBeDefined()
      expect(typeof SERVER_CONFIG.crypto.hashKey).toBe('string')
      expect(SERVER_CONFIG.crypto.hashKey).toHaveLength(64) // Hex string length
    })

    it('should have valid keyPairConfig', () => {
      expect(SERVER_CONFIG.crypto.keyPairConfig).toBeDefined()
      expect(typeof SERVER_CONFIG.crypto.keyPairConfig).toBe('object')
      expect(SERVER_CONFIG.crypto.keyPairConfig.useKeyPairFromFile).toBe(true)
      expect(SERVER_CONFIG.crypto.keyPairConfig.keyPairJsonFile).toBe('secrets.json')
    })
  })

  describe('p2p configuration', () => {
    it('should have valid p2p configuration', () => {
      expect(SERVER_CONFIG.p2p).toBeDefined()
      expect(typeof SERVER_CONFIG.p2p).toBe('object')
    })

    it('should have valid ipServers array', () => {
      expect(Array.isArray(SERVER_CONFIG.p2p.ipServers)).toBe(true)
      expect(SERVER_CONFIG.p2p.ipServers.length).toBeGreaterThan(0)
      SERVER_CONFIG.p2p.ipServers.forEach(server => {
        expect(typeof server).toBe('string')
      })
    })

    it('should have valid timeServers array', () => {
      expect(Array.isArray(SERVER_CONFIG.p2p.timeServers)).toBe(true)
      expect(SERVER_CONFIG.p2p.timeServers.length).toBeGreaterThan(0)
      SERVER_CONFIG.p2p.timeServers.forEach(server => {
        expect(typeof server).toBe('string')
      })
    })

    it('should have valid existingArchivers array', () => {
      expect(Array.isArray(SERVER_CONFIG.p2p.existingArchivers)).toBe(true)
      SERVER_CONFIG.p2p.existingArchivers.forEach(archiver => {
        expect(archiver).toHaveProperty('ip')
        expect(archiver).toHaveProperty('port')
        expect(archiver).toHaveProperty('publicKey')
        expect(typeof archiver.ip).toBe('string')
        expect(typeof archiver.port).toBe('number')
        expect(typeof archiver.publicKey).toBe('string')
      })
    })

    it('should have valid numeric p2p settings', () => {
      expect(typeof SERVER_CONFIG.p2p.syncLimit).toBe('number')
      expect(typeof SERVER_CONFIG.p2p.cycleDuration).toBe('number')
      expect(typeof SERVER_CONFIG.p2p.maxRejoinTime).toBe('number')
      expect(typeof SERVER_CONFIG.p2p.difficulty).toBe('number')
      expect(typeof SERVER_CONFIG.p2p.minNodes).toBe('number')
      expect(typeof SERVER_CONFIG.p2p.maxNodes).toBe('number')
      
      expect(SERVER_CONFIG.p2p.syncLimit).toBeGreaterThan(0)
      expect(SERVER_CONFIG.p2p.cycleDuration).toBeGreaterThan(0)
      expect(SERVER_CONFIG.p2p.maxRejoinTime).toBeGreaterThan(0)
      expect(SERVER_CONFIG.p2p.difficulty).toBeGreaterThan(0)
      expect(SERVER_CONFIG.p2p.minNodes).toBeGreaterThan(0)
      expect(SERVER_CONFIG.p2p.maxNodes).toBeGreaterThan(0)
    })

    it('should have valid boolean p2p settings', () => {
      expect(typeof SERVER_CONFIG.p2p.useNTPOffsets).toBe('boolean')
      expect(typeof SERVER_CONFIG.p2p.useFakeTimeOffsets).toBe('boolean')
      expect(typeof SERVER_CONFIG.p2p.dynamicBogonFiltering).toBe('boolean')
      expect(typeof SERVER_CONFIG.p2p.forceBogonFilteringOn).toBe('boolean')
      expect(typeof SERVER_CONFIG.p2p.continueOnException).toBe('boolean')
    })
  })

  describe('ip configuration', () => {
    it('should have valid ip configuration', () => {
      expect(SERVER_CONFIG.ip).toBeDefined()
      expect(typeof SERVER_CONFIG.ip).toBe('object')
      expect(SERVER_CONFIG.ip).toHaveProperty('externalIp')
      expect(SERVER_CONFIG.ip).toHaveProperty('externalPort')
      expect(SERVER_CONFIG.ip).toHaveProperty('internalIp')
      expect(SERVER_CONFIG.ip).toHaveProperty('internalPort')
    })

    it('should have valid IP addresses', () => {
      expect(typeof SERVER_CONFIG.ip.externalIp).toBe('string')
      expect(typeof SERVER_CONFIG.ip.internalIp).toBe('string')
    })

    it('should have valid port numbers', () => {
      expect(typeof SERVER_CONFIG.ip.externalPort).toBe('number')
      expect(typeof SERVER_CONFIG.ip.internalPort).toBe('number')
      expect(SERVER_CONFIG.ip.externalPort).toBeGreaterThan(0)
      expect(SERVER_CONFIG.ip.externalPort).toBeLessThanOrEqual(65535)
      expect(SERVER_CONFIG.ip.internalPort).toBeGreaterThan(0)
      expect(SERVER_CONFIG.ip.internalPort).toBeLessThanOrEqual(65535)
    })
  })

  describe('network configuration', () => {
    it('should have valid network configuration', () => {
      expect(SERVER_CONFIG.network).toBeDefined()
      expect(typeof SERVER_CONFIG.network).toBe('object')
      expect(SERVER_CONFIG.network).toHaveProperty('timeout')
      expect(typeof SERVER_CONFIG.network.timeout).toBe('number')
      expect(SERVER_CONFIG.network.timeout).toBeGreaterThan(0)
    })
  })

  describe('reporting configuration', () => {
    it('should have valid reporting configuration', () => {
      expect(SERVER_CONFIG.reporting).toBeDefined()
      expect(typeof SERVER_CONFIG.reporting).toBe('object')
    })

    it('should have valid reporting properties', () => {
      expect(typeof SERVER_CONFIG.reporting.report).toBe('boolean')
      expect(typeof SERVER_CONFIG.reporting.recipient).toBe('string')
      expect(typeof SERVER_CONFIG.reporting.interval).toBe('number')
      expect(typeof SERVER_CONFIG.reporting.console).toBe('boolean')
      expect(typeof SERVER_CONFIG.reporting.logSocketReports).toBe('boolean')
    })
  })

  describe('debug configuration', () => {
    it('should have valid debug configuration', () => {
      expect(SERVER_CONFIG.debug).toBeDefined()
      expect(typeof SERVER_CONFIG.debug).toBe('object')
    })

    it('should have valid debug boolean properties', () => {
      expect(typeof SERVER_CONFIG.debug.ignoreScaleGossipSelfCheck).toBe('boolean')
      expect(typeof SERVER_CONFIG.debug.canDataRepair).toBe('boolean')
      expect(typeof SERVER_CONFIG.debug.startInFatalsLogMode).toBe('boolean')
      expect(typeof SERVER_CONFIG.debug.startInErrorLogMode).toBe('boolean')
      expect(typeof SERVER_CONFIG.debug.verboseNestedCounters).toBe('boolean')
      expect(typeof SERVER_CONFIG.debug.disableSnapshots).toBe('boolean')
    })

    it('should have valid debug numeric properties', () => {
      expect(typeof SERVER_CONFIG.debug.loseReceiptChance).toBe('number')
      expect(typeof SERVER_CONFIG.debug.loseTxChance).toBe('number')
      expect(typeof SERVER_CONFIG.debug.fakeNetworkDelay).toBe('number')
      expect(typeof SERVER_CONFIG.debug.countEndpointStart).toBe('number')
      expect(typeof SERVER_CONFIG.debug.countEndpointStop).toBe('number')
    })

    it('should have valid debug objects', () => {
      expect(typeof SERVER_CONFIG.debug.devPublicKeys).toBe('object')
      expect(typeof SERVER_CONFIG.debug.multisigKeys).toBe('object')
    })
  })

  describe('statistics configuration', () => {
    it('should have valid statistics configuration', () => {
      expect(SERVER_CONFIG.statistics).toBeDefined()
      expect(typeof SERVER_CONFIG.statistics).toBe('object')
      expect(typeof SERVER_CONFIG.statistics.save).toBe('boolean')
      expect(typeof SERVER_CONFIG.statistics.interval).toBe('number')
      expect(SERVER_CONFIG.statistics.interval).toBeGreaterThan(0)
    })
  })

  describe('loadDetection configuration', () => {
    it('should have valid loadDetection configuration', () => {
      expect(SERVER_CONFIG.loadDetection).toBeDefined()
      expect(typeof SERVER_CONFIG.loadDetection).toBe('object')
    })

    it('should have valid loadDetection properties', () => {
      expect(typeof SERVER_CONFIG.loadDetection.queueLimit).toBe('number')
      expect(typeof SERVER_CONFIG.loadDetection.executeQueueLimit).toBe('number')
      expect(typeof SERVER_CONFIG.loadDetection.desiredTxTime).toBe('number')
      expect(typeof SERVER_CONFIG.loadDetection.highThreshold).toBe('number')
      expect(typeof SERVER_CONFIG.loadDetection.lowThreshold).toBe('number')
      
      expect(SERVER_CONFIG.loadDetection.queueLimit).toBeGreaterThan(0)
      expect(SERVER_CONFIG.loadDetection.executeQueueLimit).toBeGreaterThan(0)
      expect(SERVER_CONFIG.loadDetection.desiredTxTime).toBeGreaterThan(0)
      expect(SERVER_CONFIG.loadDetection.highThreshold).toBeGreaterThan(0)
      expect(SERVER_CONFIG.loadDetection.lowThreshold).toBeGreaterThan(0)
    })
  })

  describe('rateLimiting configuration', () => {
    it('should have valid rateLimiting configuration', () => {
      expect(SERVER_CONFIG.rateLimiting).toBeDefined()
      expect(typeof SERVER_CONFIG.rateLimiting).toBe('object')
      expect(typeof SERVER_CONFIG.rateLimiting.limitRate).toBe('boolean')
    })

    it('should have valid loadLimit configuration', () => {
      expect(SERVER_CONFIG.rateLimiting.loadLimit).toBeDefined()
      expect(typeof SERVER_CONFIG.rateLimiting.loadLimit).toBe('object')
      
      const loadLimit = SERVER_CONFIG.rateLimiting.loadLimit
      expect(typeof loadLimit.internal).toBe('number')
      expect(typeof loadLimit.external).toBe('number')
      expect(typeof loadLimit.txTimeInQueue).toBe('number')
      expect(typeof loadLimit.queueLength).toBe('number')
      expect(typeof loadLimit.executeQueueLength).toBe('number')
    })
  })

  describe('stateManager configuration', () => {
    it('should have valid stateManager configuration', () => {
      expect(SERVER_CONFIG.stateManager).toBeDefined()
      expect(typeof SERVER_CONFIG.stateManager).toBe('object')
    })

    it('should have valid stateManager numeric properties', () => {
      expect(typeof SERVER_CONFIG.stateManager.maxNonceQueueSize).toBe('number')
      expect(typeof SERVER_CONFIG.stateManager.stateTableBucketSize).toBe('number')
      expect(typeof SERVER_CONFIG.stateManager.accountBucketSize).toBe('number')
      expect(typeof SERVER_CONFIG.stateManager.patcherAccountsPerRequest).toBe('number')
      
      expect(SERVER_CONFIG.stateManager.maxNonceQueueSize).toBeGreaterThan(0)
      expect(SERVER_CONFIG.stateManager.stateTableBucketSize).toBeGreaterThan(0)
      expect(SERVER_CONFIG.stateManager.accountBucketSize).toBeGreaterThan(0)
      expect(SERVER_CONFIG.stateManager.patcherAccountsPerRequest).toBeGreaterThan(0)
    })

    it('should have valid stateManager boolean properties', () => {
      expect(typeof SERVER_CONFIG.stateManager.syncWithAccountOffset).toBe('boolean')
      expect(typeof SERVER_CONFIG.stateManager.useAccountCopiesTable).toBe('boolean')
      expect(typeof SERVER_CONFIG.stateManager.autoUnstickProcessing).toBe('boolean')
      expect(typeof SERVER_CONFIG.stateManager.apopFromStuckProcessing).toBe('boolean')
    })
  })

  describe('sharding configuration', () => {
    it('should have valid sharding configuration', () => {
      expect(SERVER_CONFIG.sharding).toBeDefined()
      expect(typeof SERVER_CONFIG.sharding).toBe('object')
    })

    it('should have valid sharding properties', () => {
      expect(typeof SERVER_CONFIG.sharding.nodesPerConsensusGroup).toBe('number')
      expect(typeof SERVER_CONFIG.sharding.nodesPerEdge).toBe('number')
      expect(typeof SERVER_CONFIG.sharding.executeInOneShard).toBe('boolean')
      
      expect(SERVER_CONFIG.sharding.nodesPerConsensusGroup).toBeGreaterThan(0)
      expect(SERVER_CONFIG.sharding.nodesPerEdge).toBeGreaterThan(0)
    })
  })

  describe('features configuration', () => {
    it('should have valid features configuration', () => {
      expect(SERVER_CONFIG.features).toBeDefined()
      expect(typeof SERVER_CONFIG.features).toBe('object')
    })

    it('should have valid feature flags', () => {
      expect(typeof SERVER_CONFIG.features.dappFeature1enabled).toBe('boolean')
      expect(typeof SERVER_CONFIG.features.fixHomeNodeCheckForTXGroupChanges).toBe('boolean')
      expect(typeof SERVER_CONFIG.features.archiverDataSubscriptionsUpdate).toBe('boolean')
      expect(typeof SERVER_CONFIG.features.startInServiceMode).toBe('boolean')
      expect(typeof SERVER_CONFIG.features.enableRIAccountsCache).toBe('boolean')
    })

    it('should have valid tickets configuration', () => {
      expect(SERVER_CONFIG.features.tickets).toBeDefined()
      expect(typeof SERVER_CONFIG.features.tickets).toBe('object')
      expect(typeof SERVER_CONFIG.features.tickets.updateTicketListTimeInMs).toBe('number')
      expect(Array.isArray(SERVER_CONFIG.features.tickets.ticketTypes)).toBe(true)
      
      SERVER_CONFIG.features.tickets.ticketTypes.forEach(ticket => {
        expect(ticket).toHaveProperty('type')
        expect(ticket).toHaveProperty('enabled')
        expect(typeof ticket.type).toBe('string')
        expect(typeof ticket.enabled).toBe('boolean')
      })
    })
  })

  it('should have all required top-level properties', () => {
    const requiredProperties = [
      'heartbeatInterval',
      'baseDir', 
      'transactionExpireTime',
      'globalAccount',
      'nonceMode',
      'crypto',
      'p2p',
      'ip',
      'network',
      'reporting',
      'debug',
      'statistics',
      'loadDetection',
      'rateLimiting',
      'stateManager',
      'sharding',
      'mode',
      'features'
    ]

    requiredProperties.forEach(prop => {
      expect(SERVER_CONFIG).toHaveProperty(prop)
    })
  })

  it('should not have unexpected properties at the top level', () => {
    const expectedProperties = [
      'heartbeatInterval',
      'baseDir',
      'transactionExpireTime', 
      'globalAccount',
      'nonceMode',
      'crypto',
      'p2p',
      'ip',
      'network',
      'reporting',
      'debug',
      'statistics',
      'loadDetection',
      'rateLimiting',
      'stateManager',
      'sharding',
      'mode',
      'features'
    ]

    const actualProperties = Object.keys(SERVER_CONFIG)
    expect(actualProperties.sort()).toEqual(expectedProperties.sort())
  })
})