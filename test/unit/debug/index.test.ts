// Mock native modules and dependencies before importing the module under test
jest.mock('@shardeum-foundation/lib-net', () => ({
  // Mock the native module
}))

jest.mock('tar-fs', () => ({
  pack: jest.fn().mockReturnValue({
    pipe: jest.fn().mockReturnThis(),
  }),
}))

jest.mock('fs', () => ({
  createReadStream: jest.fn().mockReturnValue({
    on: jest.fn(),
    pipe: jest.fn(),
  }),
}))

jest.mock('../../../src/network', () => ({
  NetworkClass: jest.fn().mockImplementation(() => ({
    ipInfo: { externalIp: '127.0.0.1', externalPort: 8080 },
    registerExternalGet: jest.fn(),
    setDebugNetworkDelay: jest.fn(),
  })),
}))

jest.mock('../../../src/logger', () => ({
  logFlags: {
    error: false,
    verbose: false,
  },
}))

jest.mock('../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
  },
}))

jest.mock('../../../src/p2p/Context', () => ({
  config: {
    debug: {},
    p2p: {},
    mode: 'debug',
  },
  p2p: {
    state: {
      getLastCycle: jest.fn(),
    },
  },
}))

jest.mock('../../../src/p2p/NodeList', () => ({
  nodes: new Map(),
  activeByIdOrder: [],
}))

jest.mock('../../../src/p2p/CycleChain', () => ({
  newest: { counter: 1, networkId: 'test' },
}))

jest.mock('../../../src/p2p/ProblemNodeHandler', () => ({
  getProblematicNodes: jest.fn().mockReturnValue([]),
  getRefutePercentage: jest.fn().mockReturnValue(0),
  getMaxConsecutiveRefutes: jest.fn().mockReturnValue(0),
  isNodeProblematic: jest.fn().mockReturnValue(false),
  exportProblematicNodeCache: jest.fn().mockReturnValue(null),
}))

jest.mock('../../../src/network/debugMiddleware', () => ({
  isDebugModeMiddleware: jest.fn((req, res, next) => next()),
  isDebugModeMiddlewareMedium: jest.fn((req, res, next) => next()),
}))

// Import the modules after mocks are set up
import DefaultDebug from '../../../src/debug/index'
import * as debugExports from '../../../src/debug/index'
import { DebugConfigurations } from '../../../src/debug/index'

describe('debug/index', () => {
  describe('module exports', () => {
    it('should export default Debug class', () => {
      expect(DefaultDebug).toBeDefined()
      expect(typeof DefaultDebug).toBe('function')
    })

    it('should re-export unsafeUnlock from debug module', () => {
      expect(debugExports.unsafeUnlock).toBeDefined()
      expect(typeof debugExports.unsafeUnlock).toBe('boolean')
      expect(debugExports.unsafeUnlock).toBe(false)
    })

    it('should re-export all functions from config module', () => {
      // Test all config module exports
      const configExports = [
        'isDebugMode',
        'isDebugModeAnd',
        'isServiceMode',
        'getHashedDevKey',
        'getDevPublicKeys',
        'ensureKeySecurity',
        'getDevPublicKey',
        'getDevPublicKeyMaxLevel',
        'getMultisigPublicKeys',
        'getMultisigPublicKey',
        'ensureMultisigKeySecurity',
      ]

      configExports.forEach((exportName) => {
        expect(debugExports[exportName]).toBeDefined()
        expect(typeof debugExports[exportName]).toBe('function')
      })
    })

    it('should export DebugConfigurations type', () => {
      // Type exports can't be tested at runtime, but we can ensure it's importable
      type TestType = DebugConfigurations
      const typeTest: TestType | undefined = undefined
      expect(typeTest).toBeUndefined()
    })
  })

  describe('module structure verification', () => {
    it('should have correct export structure', () => {
      // Verify the module exports both default and named exports
      const moduleExports = require('../../../src/debug/index')

      expect(moduleExports).toBeDefined()
      expect(moduleExports.default).toBeDefined()
      expect(moduleExports.unsafeUnlock).toBeDefined()
      expect(moduleExports.isDebugMode).toBeDefined()
    })

    it('should export all expected functions and values', () => {
      // List of all expected exports
      const expectedExports = [
        'default',
        'unsafeUnlock',
        'isDebugMode',
        'isDebugModeAnd',
        'isServiceMode',
        'getHashedDevKey',
        'getDevPublicKeys',
        'ensureKeySecurity',
        'getDevPublicKey',
        'getDevPublicKeyMaxLevel',
        'getMultisigPublicKeys',
        'getMultisigPublicKey',
        'ensureMultisigKeySecurity',
      ]

      const moduleExports = require('../../../src/debug/index')
      const exportKeys = Object.keys(moduleExports)

      // Check all expected exports are present
      expectedExports.forEach((exportName) => {
        expect(exportKeys).toContain(exportName)
      })
    })

    it('should maintain export consistency between import styles', () => {
      // CommonJS require
      const cjsExports = require('../../../src/debug/index')

      // ES6 imports (already imported at top)
      expect(cjsExports.default).toBe(DefaultDebug)
      expect(cjsExports.unsafeUnlock).toBe(debugExports.unsafeUnlock)
      expect(cjsExports.isDebugMode).toBe(debugExports.isDebugMode)
    })
  })
})
