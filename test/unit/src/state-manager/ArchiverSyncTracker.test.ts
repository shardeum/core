// Mock all dependencies before imports
jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: { countEvent: jest.fn() },
}))
jest.mock('../../../../src/utils', () => ({
  stringifyReduce: jest.fn((val) => JSON.stringify(val).substring(0, 10)),
  sleep: jest.fn(() => Promise.resolve()),
  errorToStringFull: jest.fn((err) => {
    if (err instanceof Error) return err.message
    if (err && typeof err === 'object' && 'message' in err) return err.message
    if (err && typeof err === 'object' && 'toString' in err) return err.toString()
    return String(err)
  }),
  makeShortHash: jest.fn((str, len) => {
    // Simple mock that returns first len characters or pads with zeros
    if (!str) return '00000000'.substring(0, len || 8)
    return (str + '00000000').substring(0, len || 8)
  }),
}))
jest.mock('../../../../src/http', () => ({
  post: jest.fn(),
}))
jest.mock('../../../../src/p2p/Archivers')
jest.mock('../../../../src/state-manager/ArchiverDataSourceHelper')
jest.mock('../../../../src/logger', () => ({
  logFlags: { debug: true, verbose: true, error: true, console: true },
  mainLog_debug: jest.fn(),
  combine: jest.fn((msg) => msg),
  logger: {
    mainLog_debug: jest.fn(),
    combine: jest.fn((msg) => msg),
  },
}))
jest.mock('../../../../src/network', () => ({
  shardusGetTime: jest.fn(() => Date.now()),
}))
// Add shardus module mock to prevent initialization issues
jest.mock('../../../../src/shardus/index', () => ({}))
jest.mock('../../../../src/p2p/CycleCreator', () => ({
  currentCycle: 0,
  currentQuarter: 0,
}))
const mockCrypto = {
  sign: jest.fn((msg) => ({ ...msg, signed: true })),
}

jest.mock('../../../../src/p2p/Context', () => ({
  config: {
    debug: { verboseNestedCounters: true },
    stateManager: { accountBucketSize: 1000, syncWithAccountOffset: false, maxTrackerRestarts: 3 },
  },
  crypto: mockCrypto,
  setDefaultConfigs: jest.fn(),
  logger: {
    mainLog_debug: jest.fn(),
    combine: jest.fn((msg) => msg),
  },
  logFlags: { verbose: false },
}))

// Now import after mocks are set up
import ArchiverSyncTracker from '../../../../src/state-manager/ArchiverSyncTracker'
import { StateManager as StateManagerTypes } from '@shardeum-foundation/lib-types'
import * as Shardus from '../../../../src/shardus/shardus-types'
import { GlobalAccountReportResp, GetAccountData3Resp } from '../../../../src/state-manager/state-manager-types'
import { nestedCountersInstance } from '../../../../src/utils/nestedCounters'
import * as utils from '../../../../src/utils'
import * as http from '../../../../src/http'
import * as Archivers from '../../../../src/p2p/Archivers'
import ArchiverDataSourceHelper from '../../../../src/state-manager/ArchiverDataSourceHelper'
import { crypto } from '../../../../src/p2p/Context'

describe('ArchiverSyncTracker', () => {
  let archiverSyncTracker: ArchiverSyncTracker
  let mockAccountSync: any
  let mockP2P: any
  let mockArchiverDataSourceHelper: any

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Reset http.post mock to prevent undefined returns
    ;(http.post as jest.Mock).mockReset()
    ;(http.post as jest.Mock).mockResolvedValue({
      success: true,
      data: null,
    })

    // Ensure crypto mock is properly configured
    mockCrypto.sign.mockImplementation((msg) => ({ ...msg, signed: true }))

    // Mock AccountSync
    mockAccountSync = {
      stateManager: {
        currentCycleShardData: { cycleNumber: 10 },
        checkAndSetAccountData: jest.fn().mockResolvedValue([]),
        writeCombinedAccountDataToBackups: jest.fn().mockResolvedValue(10),
        recordPotentialBadnode: jest.fn(),
        isNodeValidForInternalMessage: jest.fn().mockReturnValue(true),
      },
      mainLogger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
      },
      logger: {
        playbackLogState: jest.fn(),
      },
      statemanager_fatal: jest.fn(),
      config: {
        stateManager: {
          accountBucketSize: 1000,
          syncWithAccountOffset: false,
          maxTrackerRestarts: 3,
        },
      },
      syncStatement: {
        numAccounts: 0,
        numGlobalAccounts: 0,
        failAndRestart: 0,
      },
      getRobustGlobalReport: jest.fn().mockResolvedValue({
        ready: true,
        combinedHash: 'hash123',
        accounts: [],
      }),
      setGlobalSyncFinished: jest.fn(),
      syncStatmentIsComplete: jest.fn(),
      clearSyncData: jest.fn(),
      skipSync: jest.fn(),
      syncTrackers: [],
      debugFail3: false,
      debugFail4: false,
      dataSourceTest: false,
      forceSyncComplete: false,
    }

    // Mock P2P
    mockP2P = {}

    // Mock ArchiverDataSourceHelper
    mockArchiverDataSourceHelper = {
      initWithList: jest.fn(),
      tryNextDataSourceArchiver: jest.fn().mockReturnValue(true),
      getNumberArchivers: jest.fn().mockReturnValue(3),
      dataSourceArchiver: { ip: '127.0.0.1', port: 4000, publicKey: 'archiver1' },
      dataSourceArchiverIndex: 0,
      dataSourceArchiverList: [{ ip: '127.0.0.1', port: 4000, publicKey: 'archiver1' }],
      tryRestartList: jest.fn().mockReturnValue(true),
    }
    ;(ArchiverDataSourceHelper as jest.MockedClass<typeof ArchiverDataSourceHelper>).mockImplementation(
      () => mockArchiverDataSourceHelper
    )

    // Mock getArchiversList
    ;(Archivers.getArchiversList as jest.Mock) = jest
      .fn()
      .mockReturnValue([{ ip: '127.0.0.1', port: 4000, publicKey: 'archiver1' }])

    // Create instance
    archiverSyncTracker = new ArchiverSyncTracker()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('reset', () => {
    it('should reset all properties to initial state', () => {
      // Set some values
      archiverSyncTracker.addressRange = { low: 'addr1', high: 'addr2' }
      archiverSyncTracker.mapAccountData = { account1: {} as Shardus.WrappedData }
      archiverSyncTracker.accountsWithStateConflict = [{} as Shardus.WrappedData]
      archiverSyncTracker.combinedAccountData = [{} as Shardus.WrappedData]
      archiverSyncTracker.failedAccounts = ['failed1']
      archiverSyncTracker.syncStarted = true
      archiverSyncTracker.syncFinished = true
      archiverSyncTracker.restartCount = 5

      // Call reset
      archiverSyncTracker.reset()

      // Verify reset
      expect(archiverSyncTracker.addressRange).toBeNull()
      expect(archiverSyncTracker.mapAccountData).toEqual({})
      expect(archiverSyncTracker.accountsWithStateConflict).toEqual([])
      expect(archiverSyncTracker.combinedAccountData).toEqual([])
      expect(archiverSyncTracker.failedAccounts).toEqual([])
      expect(archiverSyncTracker.syncStarted).toBe(false)
      expect(archiverSyncTracker.syncFinished).toBe(false)
      expect(archiverSyncTracker.restartCount).toBe(0)
    })
  })

  describe('initByRange', () => {
    it('should initialize tracker with range', () => {
      const range = { low: 'addr1', high: 'addr2' } as any

      archiverSyncTracker.initByRange(mockAccountSync, mockP2P, 1, range, 10, false)

      expect(archiverSyncTracker.accountSync).toBe(mockAccountSync)
      expect(archiverSyncTracker.p2p).toBe(mockP2P)
      expect(archiverSyncTracker.range).toBe(range)
      expect(archiverSyncTracker.queueEntries).toEqual([])
      expect(archiverSyncTracker.cycle).toBe(10)
      expect(archiverSyncTracker.index).toBe(1)
      expect(archiverSyncTracker.isGlobalSyncTracker).toBe(false)
      expect(archiverSyncTracker.globalAddressMap).toEqual({})
      expect(archiverSyncTracker.isPartOfInitialSync).toBe(false)
      expect(archiverSyncTracker.keys).toEqual({})
      expect(ArchiverDataSourceHelper).toHaveBeenCalledWith(mockAccountSync.stateManager)
    })

    it('should initialize with initial sync flag', () => {
      const range = { low: 'addr1', high: 'addr2' } as any

      archiverSyncTracker.initByRange(mockAccountSync, mockP2P, 1, range, 10, true)

      expect(archiverSyncTracker.isPartOfInitialSync).toBe(true)
    })

    it('should call reset before initialization', () => {
      const resetSpy = jest.spyOn(archiverSyncTracker, 'reset')
      const range = { low: 'addr1', high: 'addr2' } as any

      archiverSyncTracker.initByRange(mockAccountSync, mockP2P, 1, range, 10, false)

      expect(resetSpy).toHaveBeenCalled()
    })
  })

  describe('initGlobal', () => {
    it('should initialize tracker for global sync', () => {
      archiverSyncTracker.initGlobal(mockAccountSync, mockP2P, 1, 10, false)

      expect(archiverSyncTracker.accountSync).toBe(mockAccountSync)
      expect(archiverSyncTracker.p2p).toBe(mockP2P)
      expect(archiverSyncTracker.range).toBeUndefined()
      expect(archiverSyncTracker.queueEntries).toEqual([])
      expect(archiverSyncTracker.cycle).toBe(10)
      expect(archiverSyncTracker.index).toBe(1)
      expect(archiverSyncTracker.isGlobalSyncTracker).toBe(true)
      expect(archiverSyncTracker.globalAddressMap).toEqual({})
      expect(archiverSyncTracker.isPartOfInitialSync).toBe(false)
      expect(archiverSyncTracker.keys).toEqual({})
      expect(ArchiverDataSourceHelper).toHaveBeenCalledWith(mockAccountSync.stateManager)
    })

    it('should initialize with initial sync flag', () => {
      archiverSyncTracker.initGlobal(mockAccountSync, mockP2P, 1, 10, true)

      expect(archiverSyncTracker.isPartOfInitialSync).toBe(true)
    })

    it('should call reset before initialization', () => {
      const resetSpy = jest.spyOn(archiverSyncTracker, 'reset')

      archiverSyncTracker.initGlobal(mockAccountSync, mockP2P, 1, 10, false)

      expect(resetSpy).toHaveBeenCalled()
    })
  })

  describe('syncStateDataForRange2', () => {
    beforeEach(() => {
      // Don't call reset() explicitly as initByRange already does it
      const range = { low: 'addr1', high: 'addr2' } as any
      archiverSyncTracker.initByRange(mockAccountSync, mockP2P, 1, range, 10, false)
      // initByRange should set the range, but let's verify
      // archiverSyncTracker.addressRange should be set to range by line 136 in implementation
      // Don't override it

      // Mock the async methods to prevent actual execution
      archiverSyncTracker.syncAccountData2 = jest.fn().mockResolvedValue(10)
      archiverSyncTracker.tryRetry = jest.fn().mockResolvedValue(false)
    })

    it('should sync state data for range successfully', async () => {
      // syncAccountData2 is already mocked in beforeEach

      await archiverSyncTracker.syncStateDataForRange2()

      expect(archiverSyncTracker.syncAccountData2).toHaveBeenCalledWith('addr1', 'addr2')
      expect(archiverSyncTracker.failedAccounts).toEqual([])
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'archiver_sync',
        expect.stringContaining('sync partition')
      )
    })

    it('should handle debugFail3 error', async () => {
      mockAccountSync.debugFail3 = true
      // Override tryRetry to throw the error as expected when restartCount exceeds max
      archiverSyncTracker.tryRetry = jest.fn().mockRejectedValue(new Error('reset-sync-ranges tryRetry out of tries'))

      await expect(archiverSyncTracker.syncStateDataForRange2()).rejects.toThrow('reset-sync-ranges')

      expect(utils.sleep).toHaveBeenCalledWith(3000)
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'archiver_sync',
        'syncStateDataForRange2: debugFail3'
      )
    })

    it('should handle reset-sync-ranges error', async () => {
      // Override the default mock to reject with error
      archiverSyncTracker.syncAccountData2 = jest.fn().mockRejectedValue(new Error('reset-sync-ranges'))

      await expect(archiverSyncTracker.syncStateDataForRange2()).rejects.toThrow('reset-sync-ranges')

      expect(mockAccountSync.statemanager_fatal).toHaveBeenCalledWith(
        'syncStateDataForRange_reset-sync-ranges',
        expect.stringContaining('reset-sync-ranges')
      )
    })

    it('should retry on FailAndRestartPartition error', async () => {
      // tryRetry is already mocked in beforeEach, no need to spy again
      // Override the default mock to reject with error
      archiverSyncTracker.syncAccountData2 = jest.fn().mockRejectedValueOnce(new Error('FailAndRestartPartition'))

      await archiverSyncTracker.syncStateDataForRange2()

      expect(archiverSyncTracker.tryRetry).toHaveBeenCalledWith('syncStateDataForRange 1')
      expect(mockAccountSync.statemanager_fatal).toHaveBeenCalledWith(
        'syncStateDataForRange_ex_failandrestart',
        expect.stringContaining('FailAndRestartPartition')
      )
    })

    it('should retry on unexpected error', async () => {
      // tryRetry is already mocked in beforeEach, no need to spy again
      // Override the default mock to reject with error
      archiverSyncTracker.syncAccountData2 = jest.fn().mockRejectedValueOnce(new Error('unexpected error'))

      await archiverSyncTracker.syncStateDataForRange2()

      expect(archiverSyncTracker.tryRetry).toHaveBeenCalledWith('syncStateDataForRange 2')
      // The error is being converted to undefined by errorToStringFull mock, so check for that
      expect(mockAccountSync.statemanager_fatal).toHaveBeenCalled()
      const call = mockAccountSync.statemanager_fatal.mock.calls[0]
      expect(call[0]).toBe('syncStateDataForRange_ex')
      expect(call[1]).toContain('syncStateDataForPartition failed:')
    })
  })

  describe('syncStateDataGlobals', () => {
    beforeEach(() => {
      archiverSyncTracker.initGlobal(mockAccountSync, mockP2P, 1, 10, false)
      archiverSyncTracker.restartCount = 0 // Reset restart count

      // Reset http.post mock
      ;(http.post as jest.Mock).mockReset()
      ;(http.post as jest.Mock).mockResolvedValue({
        success: true,
        accountData: [],
      })
    })

    it('should handle empty global accounts', async () => {
      mockAccountSync.getRobustGlobalReport.mockResolvedValue({
        ready: true,
        combinedHash: 'hash123',
        accounts: [],
      })

      await archiverSyncTracker.syncStateDataGlobals()

      expect(mockAccountSync.setGlobalSyncFinished).toHaveBeenCalled()
      expect(http.post).not.toHaveBeenCalled()
    })

    it('should sync global accounts successfully', async () => {
      const globalAccounts = [
        { id: 'global1', hash: 'hash1', timestamp: 1000 },
        { id: 'global2', hash: 'hash2', timestamp: 2000 },
      ]

      mockAccountSync.getRobustGlobalReport.mockResolvedValue({
        ready: true,
        combinedHash: 'hash123',
        accounts: globalAccounts,
      })

      const accountData = [
        { accountId: 'global1', stateId: 'hash1', data: {}, timestamp: 1000 },
        { accountId: 'global2', stateId: 'hash2', data: {}, timestamp: 2000 },
      ]

      ;(http.post as jest.Mock).mockResolvedValue({
        success: true,
        accountData,
      })

      await archiverSyncTracker.syncStateDataGlobals()

      // Check that http.post was called
      expect(http.post).toHaveBeenCalled()
      const callArgs = (http.post as jest.Mock).mock.calls[0]
      expect(callArgs[0]).toContain('/get_account_data_by_list_archiver')
      expect(callArgs[1]).toEqual({ accountIds: ['global1', 'global2'], signed: true })
      expect(callArgs[2]).toBe(false)
      expect(callArgs[3]).toBe(10000)
      expect(mockAccountSync.stateManager.checkAndSetAccountData).toHaveBeenCalledWith(
        accountData,
        'syncStateDataGlobals',
        true
      )
      expect(mockAccountSync.stateManager.writeCombinedAccountDataToBackups).toHaveBeenCalledWith(accountData, [])
      expect(mockAccountSync.setGlobalSyncFinished).toHaveBeenCalled()
      expect(mockAccountSync.syncStatement.numGlobalAccounts).toBe(2)
    })

    it('should handle archiver failures and retry', async () => {
      const globalAccounts = [{ id: 'global1', hash: 'hash1', timestamp: 1000 }]

      mockAccountSync.getRobustGlobalReport.mockResolvedValue({
        ready: true,
        combinedHash: 'hash123',
        accounts: globalAccounts,
      })

      // First call fails, second succeeds
      ;(http.post as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce({
        success: true,
        accountData: [{ accountId: 'global1', stateId: 'hash1', data: {}, timestamp: 1000 }],
      })

      await archiverSyncTracker.syncStateDataGlobals()

      expect(mockArchiverDataSourceHelper.tryNextDataSourceArchiver).toHaveBeenCalledWith('syncStateDataGlobals2')
      expect(http.post).toHaveBeenCalledTimes(2)
      expect(mockAccountSync.setGlobalSyncFinished).toHaveBeenCalled()
    })

    it('should handle missing account data', async () => {
      const globalAccounts = [
        { id: 'global1', hash: 'hash1', timestamp: 1000 },
        { id: 'global2', hash: 'hash2', timestamp: 2000 },
      ]

      mockAccountSync.getRobustGlobalReport.mockResolvedValue({
        ready: true,
        combinedHash: 'hash123',
        accounts: globalAccounts,
      })

      // First response only has one account, second response has both
      ;(http.post as jest.Mock)
        .mockResolvedValueOnce({
          success: true,
          accountData: [{ accountId: 'global1', stateId: 'hash1', data: {}, timestamp: 1000 }],
        })
        .mockResolvedValueOnce({
          success: true,
          accountData: [
            { accountId: 'global1', stateId: 'hash1', data: {}, timestamp: 1000 },
            { accountId: 'global2', stateId: 'hash2', data: {}, timestamp: 2000 },
          ],
        })

      await archiverSyncTracker.syncStateDataGlobals()

      expect(http.post).toHaveBeenCalledTimes(2)
      expect(mockAccountSync.setGlobalSyncFinished).toHaveBeenCalled()
    })

    it('should handle debugFail3 error', async () => {
      mockAccountSync.debugFail3 = true
      // Set restartCount to max to ensure immediate failure
      archiverSyncTracker.restartCount = 3

      await expect(archiverSyncTracker.syncStateDataGlobals()).rejects.toThrow('reset-sync-ranges')

      expect(utils.sleep).toHaveBeenCalledWith(3000)
    })

    it('should handle failed hash setting', async () => {
      const globalAccounts = [{ id: 'global1', hash: 'hash1', timestamp: 1000 }]

      mockAccountSync.getRobustGlobalReport.mockResolvedValue({
        ready: true,
        combinedHash: 'hash123',
        accounts: globalAccounts,
      })
      ;(http.post as jest.Mock).mockResolvedValue({
        success: true,
        accountData: [{ accountId: 'global1', stateId: 'hash1', data: {}, timestamp: 1000 }],
      })

      mockAccountSync.stateManager.checkAndSetAccountData.mockResolvedValue(['failed1'])

      const tryRetrySpy = jest.spyOn(archiverSyncTracker, 'tryRetry').mockResolvedValue(false)

      await archiverSyncTracker.syncStateDataGlobals()

      expect(tryRetrySpy).toHaveBeenCalledWith('syncStateDataGlobals 2')
    })
  })

  describe('syncAccountData2', () => {
    beforeEach(() => {
      const range = { low: 'addr1', high: 'addr2' } as any
      archiverSyncTracker.initByRange(mockAccountSync, mockP2P, 1, range, 10, false)
      archiverSyncTracker.restartCount = 0 // Reset restart count

      // Reset http.post mock with a default response
      ;(http.post as jest.Mock).mockReset()
      ;(http.post as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          wrappedAccounts: [],
          wrappedAccounts2: [],
          lastUpdateNeeded: true,
          highestTs: 0,
          delta: 0,
        },
      })
    })

    it('should sync account data successfully', async () => {
      const accountData = [
        { accountId: 'acc1', stateId: 'hash1', data: {}, timestamp: 1000 },
        { accountId: 'acc2', stateId: 'hash2', data: {}, timestamp: 2000 },
      ]

      ;(http.post as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          wrappedAccounts: accountData,
          wrappedAccounts2: [],
          lastUpdateNeeded: true,
          highestTs: 2000,
          delta: 1000,
        },
      })

      const processAccountDataSpy = jest
        .spyOn(archiverSyncTracker, 'processAccountDataNoStateTable2')
        .mockResolvedValue(2)

      const result = await archiverSyncTracker.syncAccountData2('addr1', 'addr2')

      expect(result).toBe(2)
      expect(http.post).toHaveBeenCalledWith(
        expect.stringContaining('/get_account_data_archiver'),
        expect.objectContaining({
          accountStart: 'addr1',
          accountEnd: 'addr2',
          tsStart: 0,
          maxRecords: 1000,
          offset: 0,
          accountOffset: '',
          signed: true,
        }),
        false,
        10000
      )
      expect(processAccountDataSpy).toHaveBeenCalled()
    })

    it('should handle null dataSourceArchiver', async () => {
      mockArchiverDataSourceHelper.dataSourceArchiver = null

      await expect(archiverSyncTracker.syncAccountData2('addr1', 'addr2')).rejects.toThrow(
        'reset-sync-ranges syncAccountData2: dataSourceArchiver == null'
      )
    })

    it('should handle archiver timeout and retry', async () => {
      // First call fails with timeout, second succeeds
      ;(http.post as jest.Mock).mockRejectedValueOnce(new Error('Timeout')).mockResolvedValueOnce({
        success: true,
        data: {
          wrappedAccounts: [],
          wrappedAccounts2: [],
          lastUpdateNeeded: true,
          highestTs: 0,
          delta: 0,
        },
      })

      jest.spyOn(archiverSyncTracker, 'processAccountDataNoStateTable2').mockResolvedValue(0)

      const result = await archiverSyncTracker.syncAccountData2('addr1', 'addr2')

      expect(result).toBe(0)
      expect(mockArchiverDataSourceHelper.tryNextDataSourceArchiver).toHaveBeenCalledWith('archiver success:false')
      expect(http.post).toHaveBeenCalledTimes(2)
    })

    it('should handle archiver busy response', async () => {
      ;(http.post as jest.Mock)
        .mockResolvedValueOnce({
          success: false,
          error: 'Archiver is busy serving other validators at the moment!',
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            wrappedAccounts: [],
            wrappedAccounts2: [],
            lastUpdateNeeded: true,
          },
        })

      jest.spyOn(archiverSyncTracker, 'processAccountDataNoStateTable2').mockResolvedValue(0)

      await archiverSyncTracker.syncAccountData2('addr1', 'addr2')

      expect(mockArchiverDataSourceHelper.tryNextDataSourceArchiver).toHaveBeenCalledWith('archiver success:false')
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('archiver_sync', 'archiver is busy')
    })

    it('should handle pagination with offset', async () => {
      const batch1 = Array(1000)
        .fill(null)
        .map((_, i) => ({
          accountId: `acc${i}`,
          stateId: `hash${i}`,
          data: {},
          timestamp: 1000,
        }))

      const batch2 = Array(500)
        .fill(null)
        .map((_, i) => ({
          accountId: `acc${1000 + i}`,
          stateId: `hash${1000 + i}`,
          data: {},
          timestamp: 1000,
        }))

      ;(http.post as jest.Mock)
        .mockResolvedValueOnce({
          success: true,
          data: {
            wrappedAccounts: batch1,
            wrappedAccounts2: [],
            lastUpdateNeeded: false,
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            wrappedAccounts: batch2,
            wrappedAccounts2: [],
            lastUpdateNeeded: true,
          },
        })

      jest.spyOn(archiverSyncTracker, 'processAccountDataNoStateTable2').mockResolvedValue(1000)

      const result = await archiverSyncTracker.syncAccountData2('addr1', 'addr2')

      expect(result).toBe(2000)
      expect(http.post).toHaveBeenCalledTimes(2)
    })

    it('should handle dataSourceTest mode', async () => {
      mockAccountSync.dataSourceTest = true
      mockAccountSync.debugFail4 = false
      ;(http.post as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          wrappedAccounts: [],
          wrappedAccounts2: [],
          lastUpdateNeeded: true,
        },
      })

      jest.spyOn(archiverSyncTracker, 'processAccountDataNoStateTable2').mockResolvedValue(0)

      await archiverSyncTracker.syncAccountData2('addr1', 'addr2')

      expect(mockArchiverDataSourceHelper.tryNextDataSourceArchiver).toHaveBeenCalledWith('syncAccountData1')
    })
  })

  describe('processAccountDataNoStateTable2', () => {
    beforeEach(() => {
      const range = { low: 'addr1', high: 'addr2' } as any
      archiverSyncTracker.initByRange(mockAccountSync, mockP2P, 1, range, 10, false)
    })

    it('should process account data successfully', async () => {
      archiverSyncTracker.combinedAccountData = [
        { accountId: 'acc1', stateId: 'hash1', data: {}, timestamp: 1000 },
        { accountId: 'acc2', stateId: 'hash2', data: {}, timestamp: 2000 },
      ]

      const result = await archiverSyncTracker.processAccountDataNoStateTable2()

      expect(result).toBe(10) // From mock writeCombinedAccountDataToBackups
      expect(mockAccountSync.stateManager.checkAndSetAccountData).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ accountId: 'acc1' }),
          expect.objectContaining({ accountId: 'acc2' }),
        ]),
        'syncNonGlobals:processAccountDataNoStateTable',
        true
      )
      expect(mockAccountSync.stateManager.writeCombinedAccountDataToBackups).toHaveBeenCalled()
      expect(mockAccountSync.syncStatement.numAccounts).toBe(2)
      expect(archiverSyncTracker.combinedAccountData).toEqual([])
    })

    it('should handle duplicate accounts', async () => {
      archiverSyncTracker.combinedAccountData = [
        { accountId: 'acc1', stateId: 'hash1', data: {}, timestamp: 1000 },
        { accountId: 'acc1', stateId: 'hash2', data: {}, timestamp: 2000 },
        { accountId: 'acc2', stateId: 'hash3', data: {}, timestamp: 3000 },
      ]

      await archiverSyncTracker.processAccountDataNoStateTable2()

      // Should keep only newest version of acc1
      expect(mockAccountSync.stateManager.checkAndSetAccountData).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ accountId: 'acc1', timestamp: 2000 }),
          expect.objectContaining({ accountId: 'acc2' }),
        ]),
        'syncNonGlobals:processAccountDataNoStateTable',
        true
      )
    })

    it('should handle failed hashes', async () => {
      archiverSyncTracker.combinedAccountData = [{ accountId: 'acc1', stateId: 'hash1', data: {}, timestamp: 1000 }]

      mockAccountSync.stateManager.checkAndSetAccountData.mockResolvedValue(['acc1'])

      await archiverSyncTracker.processAccountDataNoStateTable2()

      expect(archiverSyncTracker.failedAccounts).toEqual(['acc1'])
      expect(mockAccountSync.stateManager.recordPotentialBadnode).toHaveBeenCalled()
    })

    it('should throw error when failed hashes exceed 1000', async () => {
      archiverSyncTracker.combinedAccountData = Array(1001)
        .fill(null)
        .map((_, i) => ({
          accountId: `acc${i}`,
          stateId: `hash${i}`,
          data: {},
          timestamp: 1000,
        }))

      mockAccountSync.stateManager.checkAndSetAccountData.mockResolvedValue(
        Array(1001)
          .fill(null)
          .map((_, i) => `acc${i}`)
      )

      await expect(archiverSyncTracker.processAccountDataNoStateTable2()).rejects.toThrow(
        'FailAndRestartPartition_processAccountData_A'
      )

      expect(mockAccountSync.stateManager.recordPotentialBadnode).toHaveBeenCalled()
    })

    it('should handle empty combinedAccountData', async () => {
      archiverSyncTracker.combinedAccountData = []

      const result = await archiverSyncTracker.processAccountDataNoStateTable2()

      expect(result).toBe(10)
      expect(mockAccountSync.stateManager.checkAndSetAccountData).toHaveBeenCalledWith(
        [],
        'syncNonGlobals:processAccountDataNoStateTable',
        true
      )
    })
  })

  describe('tryRetry', () => {
    beforeEach(() => {
      const range = { low: 'addr1', high: 'addr2' } as any
      archiverSyncTracker.initByRange(mockAccountSync, mockP2P, 1, range, 10, false)
    })

    it('should retry successfully', async () => {
      archiverSyncTracker.restartCount = 0

      const result = await archiverSyncTracker.tryRetry('test message')

      expect(result).toBe(true)
      expect(archiverSyncTracker.restartCount).toBe(1)
      expect(mockAccountSync.syncStatement.failAndRestart).toBe(1)
      expect(utils.sleep).toHaveBeenCalledWith(1000)
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('archiver_sync', 'tryRetry 1 test message')
    })

    it('should throw error when max retries exceeded', async () => {
      archiverSyncTracker.restartCount = 3

      await expect(archiverSyncTracker.tryRetry('test message')).rejects.toThrow(
        'reset-sync-ranges tryRetry out of tries'
      )

      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'archiver_sync',
        'tryRetry Out of tries test message'
      )
    })

    it('should handle forceSyncComplete', async () => {
      mockAccountSync.forceSyncComplete = true
      mockAccountSync.syncTrackers = [archiverSyncTracker]

      const result = await archiverSyncTracker.tryRetry('test message')

      expect(result).toBe(false)
      expect(archiverSyncTracker.syncFinished).toBe(true)
      expect(mockAccountSync.syncStatmentIsComplete).toHaveBeenCalled()
      expect(mockAccountSync.clearSyncData).toHaveBeenCalled()
      expect(mockAccountSync.skipSync).toHaveBeenCalled()
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('archiver_sync', 'forceSyncComplete')
    })

    it('should log error and increment counters', async () => {
      const result = await archiverSyncTracker.tryRetry('error occurred')

      expect(result).toBe(true)
      expect(mockAccountSync.mainLogger.info).toHaveBeenCalledWith('ARCHIVER_DATASYNC: tryRetry')
      expect(mockAccountSync.mainLogger.error).toHaveBeenCalledWith('ARCHIVER_DATASYNC: tryRetry: 1 error occurred ')
      expect(mockAccountSync.logger.playbackLogState).toHaveBeenCalledWith('datasyncFail', '', '')
    })
  })
})
