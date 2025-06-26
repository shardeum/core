import * as Context from '../../../../src/p2p/Context'
import { EventEmitter } from 'events'

// Create mock objects with minimal implementation needed for tests
class MockP2P extends EventEmitter {
  registerInternal = jest.fn()
  registerInternalBinary = jest.fn()
  registerGossipHandler = jest.fn()
  unregisterGossipHandler = jest.fn()
  unregisterInternal = jest.fn()
  ask = jest.fn()
  tell = jest.fn()
  testProperty = 'p2p'
}

// For other objects, we'll use simple mocks since we're just testing assignment
const mockP2p = new MockP2P()
const mockLogger = { testProperty: 'logger' }
const mockCrypto = { testProperty: 'crypto' }
const mockNetwork = { testProperty: 'network' }
const mockShardus = { testProperty: 'shardus' }
const mockStateManager = { testProperty: 'stateManager' }
const mockStorage = { testProperty: 'storage' }
const mockIO = { testProperty: 'io' }
const mockReporter = { testProperty: 'reporter' }
const mockConfig = {
  testProperty: 'config',
  p2p: {
    problematicNodeConsecutiveRefuteThreshold: 3,
    problematicNodeRefutePercentageThreshold: 0.1,
    problematicNodeHistoryLength: 60,
  },
}
const mockDefaultConfigs = { testProperty: 'defaultConfigs' }

describe('Context', () => {
  // Reset all context variables after each test to ensure test isolation
  afterEach(() => {
    // Set all context variables to undefined to reset state between tests
    // @ts-ignore - Intentionally setting to undefined for test cleanup
    Context.p2p = undefined
    // @ts-ignore
    Context.logger = undefined
    // @ts-ignore
    Context.crypto = undefined
    // @ts-ignore
    Context.network = undefined
    // @ts-ignore
    Context.shardus = undefined
    // @ts-ignore
    Context.stateManager = undefined
    // @ts-ignore
    Context.storage = undefined
    // @ts-ignore
    Context.io = undefined
    // @ts-ignore
    Context.reporter = undefined
    // @ts-ignore
    Context.config = undefined
    // @ts-ignore
    Context.defaultConfigs = undefined
  })

  describe('setP2pContext', () => {
    it('should set the p2p context correctly', () => {
      // @ts-ignore - Using type assertion for test
      Context.setP2pContext(mockP2p)
      expect(Context.p2p).toBe(mockP2p)
    })

    it('should override previous p2p context when called multiple times', () => {
      const firstMockP2p = new MockP2P()
      firstMockP2p.testProperty = 'first p2p'

      const secondMockP2p = new MockP2P()
      secondMockP2p.testProperty = 'second p2p'

      // @ts-ignore - Using type assertion for test
      Context.setP2pContext(firstMockP2p)
      expect(Context.p2p).toBe(firstMockP2p)

      // @ts-ignore - Using type assertion for test
      Context.setP2pContext(secondMockP2p)
      expect(Context.p2p).toBe(secondMockP2p)
      expect(Context.p2p).not.toBe(firstMockP2p)
    })

    it('should handle null value', () => {
      // @ts-ignore - Testing with null for negative case
      Context.setP2pContext(null)
      expect(Context.p2p).toBeNull()
    })

    it('should handle undefined value', () => {
      // @ts-ignore - Testing with undefined for negative case
      Context.setP2pContext(undefined)
      expect(Context.p2p).toBeUndefined()
    })
  })

  describe('setLoggerContext', () => {
    it('should set the logger context correctly', () => {
      Context.setLoggerContext(mockLogger)
      expect(Context.logger).toBe(mockLogger)
    })

    it('should override previous logger context when called multiple times', () => {
      const firstMockLogger = { testProperty: 'first logger' }
      const secondMockLogger = { testProperty: 'second logger' }

      Context.setLoggerContext(firstMockLogger)
      expect(Context.logger).toBe(firstMockLogger)

      Context.setLoggerContext(secondMockLogger)
      expect(Context.logger).toBe(secondMockLogger)
      expect(Context.logger).not.toBe(firstMockLogger)
    })

    it('should handle null value', () => {
      // @ts-ignore - Testing with null for negative case
      Context.setLoggerContext(null)
      expect(Context.logger).toBeNull()
    })
  })

  describe('setCryptoContext', () => {
    it('should set the crypto context correctly', () => {
      Context.setCryptoContext(mockCrypto)
      expect(Context.crypto).toBe(mockCrypto)
    })

    it('should override previous crypto context when called multiple times', () => {
      const firstMockCrypto = { testProperty: 'first crypto' }
      const secondMockCrypto = { testProperty: 'second crypto' }

      Context.setCryptoContext(firstMockCrypto)
      expect(Context.crypto).toBe(firstMockCrypto)

      Context.setCryptoContext(secondMockCrypto)
      expect(Context.crypto).toBe(secondMockCrypto)
      expect(Context.crypto).not.toBe(firstMockCrypto)
    })

    it('should handle empty object', () => {
      Context.setCryptoContext({})
      expect(Context.crypto).toEqual({})
    })
  })

  describe('setNetworkContext', () => {
    it('should set the network context correctly', () => {
      Context.setNetworkContext(mockNetwork)
      expect(Context.network).toBe(mockNetwork)
    })

    it('should handle object with additional properties', () => {
      const extendedNetwork = {
        testProperty: 'network',
        additionalProperty: 'should still work',
      }
      Context.setNetworkContext(extendedNetwork)
      expect(Context.network).toBe(extendedNetwork)
      // Using type assertion to avoid TypeScript error
      expect((Context.network as any).additionalProperty).toBe('should still work')
    })
  })

  describe('setShardusContext', () => {
    it('should set the shardus context correctly', () => {
      Context.setShardusContext(mockShardus)
      expect(Context.shardus).toBe(mockShardus)
    })
  })

  describe('setStateManagerContext', () => {
    it('should set the stateManager context correctly', () => {
      Context.setStateManagerContext(mockStateManager)
      expect(Context.stateManager).toBe(mockStateManager)
    })
  })

  describe('setStorageContext', () => {
    it('should set the storage context correctly', () => {
      Context.setStorageContext(mockStorage)
      expect(Context.storage).toBe(mockStorage)
    })
  })

  describe('setIOContext', () => {
    it('should set the io context correctly', () => {
      Context.setIOContext(mockIO)
      expect(Context.io).toBe(mockIO)
    })
  })

  describe('setReporterContext', () => {
    it('should set the reporter context correctly', () => {
      Context.setReporterContext(mockReporter)
      expect(Context.reporter).toBe(mockReporter)
    })
  })

  describe('setConfig', () => {
    it('should set the config correctly', () => {
      // @ts-ignore - Using type assertion for test
      Context.setConfig(mockConfig)
      expect(Context.config).toBe(mockConfig)
    })

    it('should handle complex nested config object', () => {
      const complexConfig = {
        p2p: {
          problematicNodeConsecutiveRefuteThreshold: 3,
          problematicNodeRefutePercentageThreshold: 0.1,
          problematicNodeHistoryLength: 60,
        },
        customProperty: {
          level1: {
            level2: 'nested value',
          },
        },
        arrayProperty: [1, 2, 3],
      }
      // @ts-ignore - Using type assertion for test
      Context.setConfig(complexConfig)
      expect(Context.config).toBe(complexConfig)
      // Using type assertion to avoid TypeScript error
      expect((Context.config as any).customProperty.level1.level2).toBe('nested value')
      expect((Context.config as any).arrayProperty).toEqual([1, 2, 3])
    })
  })

  describe('setDefaultConfigs', () => {
    it('should set the defaultConfigs correctly', () => {
      Context.setDefaultConfigs(mockDefaultConfigs)
      expect(Context.defaultConfigs).toBe(mockDefaultConfigs)
    })
  })

  describe('Multiple context setters', () => {
    it('should maintain all set contexts correctly', () => {
      // Set all contexts
      // @ts-ignore - Using type assertion for test
      Context.setP2pContext(mockP2p)
      Context.setLoggerContext(mockLogger)
      Context.setCryptoContext(mockCrypto)
      Context.setNetworkContext(mockNetwork)
      Context.setShardusContext(mockShardus)
      Context.setStateManagerContext(mockStateManager)
      Context.setStorageContext(mockStorage)
      Context.setIOContext(mockIO)
      Context.setReporterContext(mockReporter)
      // @ts-ignore - Using type assertion for test
      Context.setConfig(mockConfig)
      Context.setDefaultConfigs(mockDefaultConfigs)

      // Verify all contexts are set correctly
      expect(Context.p2p).toBe(mockP2p)
      expect(Context.logger).toBe(mockLogger)
      expect(Context.crypto).toBe(mockCrypto)
      expect(Context.network).toBe(mockNetwork)
      expect(Context.shardus).toBe(mockShardus)
      expect(Context.stateManager).toBe(mockStateManager)
      expect(Context.storage).toBe(mockStorage)
      expect(Context.io).toBe(mockIO)
      expect(Context.reporter).toBe(mockReporter)
      expect(Context.config).toBe(mockConfig)
      expect(Context.defaultConfigs).toBe(mockDefaultConfigs)
    })

    it('should allow setting contexts in any order', () => {
      // Set contexts in reverse order
      Context.setDefaultConfigs(mockDefaultConfigs)
      // @ts-ignore - Using type assertion for test
      Context.setConfig(mockConfig)
      Context.setReporterContext(mockReporter)
      Context.setIOContext(mockIO)
      Context.setStorageContext(mockStorage)
      Context.setStateManagerContext(mockStateManager)
      Context.setShardusContext(mockShardus)
      Context.setNetworkContext(mockNetwork)
      Context.setCryptoContext(mockCrypto)
      Context.setLoggerContext(mockLogger)
      // @ts-ignore - Using type assertion for test
      Context.setP2pContext(mockP2p)

      // Verify all contexts are set correctly
      expect(Context.p2p).toBe(mockP2p)
      expect(Context.logger).toBe(mockLogger)
      expect(Context.crypto).toBe(mockCrypto)
      expect(Context.network).toBe(mockNetwork)
      expect(Context.shardus).toBe(mockShardus)
      expect(Context.stateManager).toBe(mockStateManager)
      expect(Context.storage).toBe(mockStorage)
      expect(Context.io).toBe(mockIO)
      expect(Context.reporter).toBe(mockReporter)
      expect(Context.config).toBe(mockConfig)
      expect(Context.defaultConfigs).toBe(mockDefaultConfigs)
    })

    it('should allow setting only some contexts while others remain undefined', () => {
      // Only set a few contexts
      // @ts-ignore - Using type assertion for test
      Context.setP2pContext(mockP2p)
      Context.setNetworkContext(mockNetwork)
      // @ts-ignore - Using type assertion for test
      Context.setConfig(mockConfig)

      // Verify set contexts are correct
      expect(Context.p2p).toBe(mockP2p)
      expect(Context.network).toBe(mockNetwork)
      expect(Context.config).toBe(mockConfig)

      // Verify other contexts remain undefined
      expect(Context.logger).toBeUndefined()
      expect(Context.crypto).toBeUndefined()
      expect(Context.shardus).toBeUndefined()
      expect(Context.stateManager).toBeUndefined()
      expect(Context.storage).toBeUndefined()
      expect(Context.io).toBeUndefined()
      expect(Context.reporter).toBeUndefined()
      expect(Context.defaultConfigs).toBeUndefined()
    })
  })

  describe('Edge cases', () => {
    it('should handle setting the same object to multiple contexts', () => {
      const sharedObject = { sharedProperty: 'shared value' }

      // Set the same object to multiple contexts
      // Using type assertions to avoid TypeScript errors
      // @ts-ignore - Using type assertion for test
      Context.setP2pContext(sharedObject)
      Context.setLoggerContext(sharedObject)
      Context.setCryptoContext(sharedObject)

      // Verify all contexts point to the same object
      expect(Context.p2p).toBe(sharedObject)
      expect(Context.logger).toBe(sharedObject)
      expect(Context.crypto).toBe(sharedObject)

      // Verify modifying the shared object affects all contexts
      sharedObject.sharedProperty = 'modified value'
      // Using type assertions to access the property
      expect((Context.p2p as any).sharedProperty).toBe('modified value')
      expect((Context.logger as any).sharedProperty).toBe('modified value')
      expect((Context.crypto as any).sharedProperty).toBe('modified value')
    })

    it('should handle circular references', () => {
      const circularObj: any = { name: 'circular' }
      circularObj.self = circularObj

      // @ts-ignore - Using type assertion for test
      Context.setP2pContext(circularObj)
      expect(Context.p2p).toBe(circularObj)
      expect((Context.p2p as any).self).toBe(circularObj)
      expect((Context.p2p as any).self.self).toBe(circularObj)
    })

    it('should handle function objects', () => {
      const funcObj: any = () => 'test function'
      funcObj.testProperty = 'function property'

      // @ts-ignore - Using type assertion for test
      Context.setP2pContext(funcObj)
      expect(Context.p2p).toBe(funcObj)
      expect(typeof Context.p2p).toBe('function')
      expect((Context.p2p as any).testProperty).toBe('function property')
      expect((Context.p2p as any)()).toBe('test function')
    })
  })
})
