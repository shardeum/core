import AccountGlobals from '../../../../src/state-manager/AccountGlobals'
import * as Shardus from '../../../../src/shardus/shardus-types'
import Profiler from '../../../../src/utils/profiler'
import { P2PModuleContext as P2P } from '../../../../src/p2p/Context'
import Storage from '../../../../src/storage'
import Crypto from '../../../../src/crypto'
import Logger from '../../../../src/logger'
import StateManager from '../../../../src/state-manager'

// Mock the utils module to prevent actual sleep calls
jest.mock('../../../../src/utils', () => ({
  sleep: jest.fn().mockResolvedValue(undefined),
  stringifyReduce: jest.fn((obj) => JSON.stringify(obj)),
}))

jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
  },
}))

// Mock network and other problematic modules
jest.mock('../../../../src/network', () => ({
  shardusGetTime: jest.fn(() => Date.now()),
}))

jest.mock('../../../../src/p2p/Context', () => ({
  config: {
    p2p: {
      useNTPOffsets: false,
    },
  },
  setDefaultConfigs: jest.fn(),
}))

jest.mock('../../../../src/p2p/NodeList', () => ({}))
jest.mock('../../../../src/p2p/ProblemNodeHandler', () => ({}))
jest.mock('../../../../src/p2p/Active', () => ({}))
jest.mock('../../../../src/snapshot', () => ({}))
jest.mock('../../../../src/shardus', () => ({}))
jest.mock('../../../../src/logger/csvPerfEvents', () => ({}))

// Mock all dependencies
const mockStateManager = {
  appFinishedSyncing: true,
  accountSync: {
    globalAccountsSynced: true,
    getRobustGlobalReport: jest.fn().mockResolvedValue({
      accounts: [],
      ready: true,
      combinedHash: 'test-hash',
    }),
  },
  accountCache: {
    getAccountHash: jest.fn().mockReturnValue({ h: 'default-hash', t: 123456 }),
  },
  fifoLock: jest.fn().mockResolvedValue(1),
  fifoUnlock: jest.fn(),
  testAccountDataWrapped: jest.fn(),
  statemanager_fatal: jest.fn(),
} as any

const mockProfiler = {
  scopedProfileSectionStart: jest.fn(),
  scopedProfileSectionEnd: jest.fn(),
} as any

const mockApp = {
  getAccountDataByList: jest.fn().mockResolvedValue([]),
} as any

const mockLoggerInstance = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  fatal: jest.fn(),
}

const mockLogger = {
  getLogger: jest.fn(),
} as any

const mockStorage = {} as any
const mockP2P = {
  registerInternalBinary: jest.fn(),
} as any

const mockCrypto = {
  hash: jest.fn().mockReturnValue('mock-hash'),
} as any

const mockConfig = {} as any

describe('AccountGlobals', () => {
  let accountGlobals: AccountGlobals

  beforeEach(() => {
    jest.clearAllMocks()

    // Set up the logger mock to return the mock logger instance
    mockLogger.getLogger.mockReturnValue(mockLoggerInstance)

    // Create AccountGlobals instance
    accountGlobals = new AccountGlobals(
      mockStateManager,
      mockProfiler,
      mockApp,
      mockLogger,
      mockStorage,
      mockP2P,
      mockCrypto,
      mockConfig
    )
  })

  describe('constructor', () => {
    it('should initialize with correct dependencies', () => {
      expect(accountGlobals.app).toBe(mockApp)
      expect(accountGlobals.crypto).toBe(mockCrypto)
      expect(accountGlobals.config).toBe(mockConfig)
      expect(accountGlobals.profiler).toBe(mockProfiler)
      expect(accountGlobals.logger).toBe(mockLogger)
      expect(accountGlobals.p2p).toBe(mockP2P)
      expect(accountGlobals.storage).toBe(mockStorage)
      expect(accountGlobals.stateManager).toBe(mockStateManager)
    })

    it('should initialize loggers correctly', () => {
      expect(mockLogger.getLogger).toHaveBeenCalledWith('main')
      expect(mockLogger.getLogger).toHaveBeenCalledWith('fatal')
      expect(mockLogger.getLogger).toHaveBeenCalledWith('shardDump')
      expect(mockLogger.getLogger).toHaveBeenCalledWith('statsDump')
    })

    it('should initialize global account set as empty', () => {
      expect(accountGlobals.globalAccountSet).toBeInstanceOf(Set)
      expect(accountGlobals.globalAccountSet.size).toBe(0)
    })

    it('should initialize hasknownGlobals as false', () => {
      expect(accountGlobals.hasknownGlobals).toBe(false)
    })
  })

  describe('isGlobalAccount', () => {
    it('should return true for global accounts', () => {
      accountGlobals.setGlobalAccount('global-account-1')

      expect(accountGlobals.isGlobalAccount('global-account-1')).toBe(true)
    })

    it('should return false for non-global accounts', () => {
      expect(accountGlobals.isGlobalAccount('non-global-account')).toBe(false)
    })

    it('should handle empty string', () => {
      expect(accountGlobals.isGlobalAccount('')).toBe(false)
    })
  })

  describe('setGlobalAccount', () => {
    it('should add account to global set', () => {
      const accountId = 'test-global-account'

      accountGlobals.setGlobalAccount(accountId)

      expect(accountGlobals.globalAccountSet.has(accountId)).toBe(true)
    })

    it('should handle multiple accounts', () => {
      const accounts = ['account1', 'account2', 'account3']

      accounts.forEach((account) => accountGlobals.setGlobalAccount(account))

      accounts.forEach((account) => {
        expect(accountGlobals.globalAccountSet.has(account)).toBe(true)
      })
      expect(accountGlobals.globalAccountSet.size).toBe(3)
    })

    it('should handle duplicate accounts', () => {
      const accountId = 'duplicate-account'

      accountGlobals.setGlobalAccount(accountId)
      accountGlobals.setGlobalAccount(accountId)
      accountGlobals.setGlobalAccount(accountId)

      expect(accountGlobals.globalAccountSet.has(accountId)).toBe(true)
      expect(accountGlobals.globalAccountSet.size).toBe(1)
    })
  })

  describe('setupHandlers', () => {
    it('should register binary handler', () => {
      accountGlobals.setupHandlers()

      expect(mockP2P.registerInternalBinary).toHaveBeenCalled()
    })
  })

  describe('getGlobalListEarly', () => {
    beforeEach(() => {
      // Reset the hasknownGlobals flag before each test
      accountGlobals.hasknownGlobals = false
      accountGlobals.globalAccountSet.clear()
    })

    it('should successfully get global list on first try', async () => {
      ;(mockStateManager.accountSync.getRobustGlobalReport as jest.Mock).mockResolvedValue({
        accounts: [
          { id: 'global1', hash: 'hash1', timestamp: 123 },
          { id: 'global2', hash: 'hash2', timestamp: 456 },
        ],
        ready: true,
        combinedHash: 'combined-hash',
      })

      await accountGlobals.getGlobalListEarly()

      expect(mockStateManager.accountSync.getRobustGlobalReport).toHaveBeenCalledWith('getGlobalListEarly', false)
      expect(accountGlobals.hasknownGlobals).toBe(true)
      expect(accountGlobals.globalAccountSet.has('global1')).toBe(true)
      expect(accountGlobals.globalAccountSet.has('global2')).toBe(true)
    })

    it('should throw error after maximum retries', async () => {
      ;(mockStateManager.accountSync.getRobustGlobalReport as jest.Mock).mockRejectedValue(
        new Error('Persistent error')
      )

      await expect(accountGlobals.getGlobalListEarly()).rejects.toThrow(
        'DATASYNC: getGlobalListEarly: failed to get global list after 10 retries'
      )
    })
  })

  describe('getGlobalDebugReport', () => {
    beforeEach(() => {
      // Ensure crypto.hash mock is properly set up
      mockCrypto.hash.mockReturnValue('mock-hash')
    })

    it('should generate debug report structure', () => {
      const report = accountGlobals.getGlobalDebugReport()

      expect(report).toHaveProperty('globalAccountSummary')
      expect(report).toHaveProperty('globalStateHash')
      expect(Array.isArray(report.globalAccountSummary)).toBe(true)
      expect(typeof report.globalStateHash).toBe('string')
    })

    it('should call crypto.hash with global account summary', () => {
      const report = accountGlobals.getGlobalDebugReport()

      expect(mockCrypto.hash).toHaveBeenCalledWith(report.globalAccountSummary)
      expect(report.globalStateHash).toBe('mock-hash')
    })

    it('should handle empty global account set', () => {
      const report = accountGlobals.getGlobalDebugReport()

      expect(report.globalAccountSummary).toEqual([])
      expect(mockCrypto.hash).toHaveBeenCalledWith([])
      expect(report.globalStateHash).toBe('mock-hash')
    })
  })

  describe('Edge cases and error handling', () => {
    it('should handle large number of global accounts', () => {
      // Add many global accounts
      for (let i = 0; i < 100; i++) {
        accountGlobals.setGlobalAccount(`global-account-${i}`)
      }

      expect(accountGlobals.globalAccountSet.size).toBe(100)

      for (let i = 0; i < 100; i++) {
        expect(accountGlobals.isGlobalAccount(`global-account-${i}`)).toBe(true)
      }
    })

    it('should handle special characters in account IDs', () => {
      const specialAccounts = ['account-with-dashes', 'account_with_underscores', 'account.with.dots']

      specialAccounts.forEach((account) => {
        accountGlobals.setGlobalAccount(account)
        expect(accountGlobals.isGlobalAccount(account)).toBe(true)
      })

      expect(accountGlobals.globalAccountSet.size).toBe(specialAccounts.length)
    })
  })

  describe('Integration scenarios', () => {
    it('should maintain state consistency across operations', () => {
      // Initial state
      expect(accountGlobals.globalAccountSet.size).toBe(0)
      expect(accountGlobals.hasknownGlobals).toBe(false)

      // Add accounts manually
      accountGlobals.setGlobalAccount('manual1')
      accountGlobals.setGlobalAccount('manual2')
      expect(accountGlobals.globalAccountSet.size).toBe(2)

      // Check individual accounts
      expect(accountGlobals.isGlobalAccount('manual1')).toBe(true)
      expect(accountGlobals.isGlobalAccount('manual2')).toBe(true)
      expect(accountGlobals.isGlobalAccount('manual3')).toBe(false)

      // State should persist
      expect(accountGlobals.globalAccountSet.size).toBe(2)
    })
  })
})
