import TransactionRepair from '../../../../src/state-manager/TransactionRepair'
import * as Shardus from '../../../../src/shardus/shardus-types'
import { StateManager as StateManagerTypes } from '@shardeum-foundation/lib-types'
import { QueueEntry, AccountHashCache, RequestStateForTxResp, Proposal } from '../../../../src/state-manager/state-manager-types'
import { RequestStateForTxPostReq } from '../../../../src/types/RequestStateForTxPostReq'
import { RequestStateForTxPostResp } from '../../../../src/types/RequestStateForTxPostResp'
import { InternalRouteEnum } from '../../../../src/types/enum/InternalRouteEnum'
import * as ShardFunctions from '../../../../src/state-manager/shardFunctions'
import { nestedCountersInstance } from '../../../../src/utils/nestedCounters'

// Mock all dependencies
jest.mock('../../../../src/state-manager/shardFunctions', () => ({
  __esModule: true,
  default: {
    testAddressInRange: jest.fn()
  }
}))
jest.mock('../../../../src/utils/nestedCounters')
jest.mock('../../../../src/network', () => ({
  shardusGetTime: jest.fn(() => 1234567890)
}))
jest.mock('../../../../src/p2p/NodeList', () => ({
  activeIdToPartition: new Map()
}))
jest.mock('../../../../src/p2p/Self', () => ({
  id: 'self-node-id'
}))

describe('TransactionRepair', () => {
  let transactionRepair: TransactionRepair
  let mockStateManager: any
  let mockProfiler: any
  let mockApp: any
  let mockLogger: any
  let mockStorage: any
  let mockP2P: any
  let mockCrypto: any
  let mockConfig: any

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Mock nestedCountersInstance
    ;(nestedCountersInstance as any).countEvent = jest.fn()

    // Mock StateManager and its properties
    mockStateManager = {
      currentCycleShardData: {
        cycleNumber: 10,
        ourNode: {
          id: 'our-node-id',
          publicKey: 'our-public-key'
        },
        nodeShardDataMap: new Map(),
        nodeShardData: {
          storedPartitions: []
        }
      },
      accountCache: {
        getAccountHash: jest.fn(),
        hasAccount: jest.fn()
      },
      accountGlobals: {
        isGlobalAccount: jest.fn()
      },
      dataRepairsStarted: 0,
      dataRepairsCompleted: 0,
      cycleDebugNotes: {
        repairs: 0,
        lateRepairs: 0
      },
      transactionQueue: {
        addReceiptToForward: jest.fn()
      },
      checkAndSetAccountData: jest.fn().mockResolvedValue([]),
      writeCombinedAccountDataToBackups: jest.fn().mockResolvedValue(undefined),
      isNodeValidForInternalMessage: jest.fn().mockReturnValue(true),
      p2p: {
        state: {
          getNodeByPubKey: jest.fn()
        }
      },
      statemanager_fatal: jest.fn()
    }

    // Mock Profiler
    mockProfiler = {
      profileSectionStart: jest.fn(),
      profileSectionEnd: jest.fn()
    }

    // Mock App
    mockApp = {
      getAccountDataByList: jest.fn(),
      getTimestampAndHashFromAccount: jest.fn()
    }

    // Mock Logger
    const loggerInstance = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
      fatal: jest.fn()
    }
    mockLogger = {
      getLogger: jest.fn().mockReturnValue(loggerInstance),
      playbackLogNote: jest.fn()
    }

    // Mock Storage
    mockStorage = {
      addAccountStates: jest.fn()
    }

    // Mock P2P
    mockP2P = {
      askBinary: jest.fn(),
      ask: jest.fn()
    }

    // Mock Crypto
    mockCrypto = {}

    // Mock Config
    mockConfig = {
      p2p: {
        useBinarySerializedEndpoints: true,
        requestStateForTxPostBinary: true,
        experimentalSnapshot: false
      }
    }

    // Create TransactionRepair instance
    transactionRepair = new TransactionRepair(
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
    it('should initialize all properties correctly', () => {
      expect(transactionRepair.app).toBe(mockApp)
      expect(transactionRepair.crypto).toBe(mockCrypto)
      expect(transactionRepair.config).toBe(mockConfig)
      expect(transactionRepair.profiler).toBe(mockProfiler)
      expect(transactionRepair.logger).toBe(mockLogger)
      expect(transactionRepair.p2p).toBe(mockP2P)
      expect(transactionRepair.storage).toBe(mockStorage)
      expect(transactionRepair.stateManager).toBe(mockStateManager)
    })

    it('should get all required loggers', () => {
      expect(mockLogger.getLogger).toHaveBeenCalledWith('main')
      expect(mockLogger.getLogger).toHaveBeenCalledWith('seq')
      expect(mockLogger.getLogger).toHaveBeenCalledWith('fatal')
      expect(mockLogger.getLogger).toHaveBeenCalledWith('shardDump')
      expect(mockLogger.getLogger).toHaveBeenCalledWith('statsDump')
    })
  })

  describe('repairToMatchReceipt', () => {
    let mockQueueEntry: QueueEntry

    beforeEach(() => {
      // Create a basic mock queue entry
      mockQueueEntry = {
        entryID: 'entry-123',
        logID: 'log-123',
        uniqueKeys: ['account1', 'account2'],
        acceptedTx: {
          txId: 'tx-123',
          timestamp: 1234567890
        },
        executionGroupMap: new Map(),
        didSync: false,
        signedReceiptForRepair: {
          proposal: {
            applied: true,
            accountIDs: ['account1', 'account2'],
            afterStateHashes: ['hash1', 'hash2'],
            txid: 'tx-123'
          },
          proposalHash: 'proposal-hash-123',
          signaturePack: []
        },
        preApplyTXResult: null,
        repairStarted: false,
        repairFinished: false,
        hasValidFinalData: false,
        isInExecutionHome: false,
        state: 'processing',
        cycleToRecordOn: 10,
        collectedData: {}
      } as any
    })

    it('should return early if currentCycleShardData is null', async () => {
      mockStateManager.currentCycleShardData = null

      await transactionRepair.repairToMatchReceipt(mockQueueEntry)

      expect(mockQueueEntry.repairStarted).toBe(false)
      expect(mockProfiler.profileSectionStart).not.toHaveBeenCalled()
    })

    it('should throw error if uniqueKeys is null', async () => {
      mockQueueEntry.uniqueKeys = null

      await expect(transactionRepair.repairToMatchReceipt(mockQueueEntry)).rejects.toThrow(
        'repairToMatchReceipt queueEntry.uniqueKeys == null'
      )
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('repair1', 'queueEntry.uniqueKeys == null')
    })

    it('should return early if signedReceiptForRepair is falsy', async () => {
      mockQueueEntry.signedReceiptForRepair = null

      await transactionRepair.repairToMatchReceipt(mockQueueEntry)

      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('repair1', 'receivedReceipt is falsy')
      expect(mockQueueEntry.repairStarted).toBe(true)
    })

    it('should return early if receipt applied is false', async () => {
      mockQueueEntry.signedReceiptForRepair.proposal.applied = false

      await transactionRepair.repairToMatchReceipt(mockQueueEntry)

      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('repair1', 'receivedReceipt.result is false')
    })

    it('should return early if proposal is falsy', async () => {
      mockQueueEntry.signedReceiptForRepair = null

      await transactionRepair.repairToMatchReceipt(mockQueueEntry)

      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('repair1', 'receivedReceipt is falsy')
    })

    it('should handle local data repair from preApplyTXResult', async () => {
      const mockAccountData = {
        accountId: 'account1',
        data: {
          stateId: 'hash1',
          timestamp: 1234567890
        },
        stateId: 'hash1',
        timestamp: 1234567890,
        txId: 'tx-123'
      }

      mockQueueEntry.preApplyTXResult = {
        applyResponse: {
          accountWrites: [mockAccountData]
        }
      } as any

      mockStateManager.accountCache.getAccountHash.mockReturnValue(null)
      ;(ShardFunctions.default.testAddressInRange as jest.Mock).mockReturnValue(true)

      await transactionRepair.repairToMatchReceipt(mockQueueEntry)

      expect(mockStateManager.checkAndSetAccountData).toHaveBeenCalledWith(
        [mockAccountData.data],
        'tx:log-123 repairToMatchReceipt',
        true
      )
      expect(mockStateManager.writeCombinedAccountDataToBackups).toHaveBeenCalled()
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('repair1', 'q.repair applied cycle: 10')
    })

    it('should skip accounts with newer cached version', async () => {
      const mockAccountData = {
        accountId: 'account1',
        data: {
          stateId: 'hash1',
          timestamp: 1234567890
        },
        stateId: 'hash1',
        timestamp: 1234567890,
        txId: 'tx-123'
      }

      mockQueueEntry.preApplyTXResult = {
        applyResponse: {
          accountWrites: [mockAccountData]
        }
      } as any

      // Mock account cache to have newer timestamp
      mockStateManager.accountCache.getAccountHash.mockReturnValue({
        h: 'different-hash',
        t: 1234567900 // newer timestamp
      })
      ;(ShardFunctions.default.testAddressInRange as jest.Mock).mockReturnValue(true)

      await transactionRepair.repairToMatchReceipt(mockQueueEntry)

      expect(mockStateManager.checkAndSetAccountData).not.toHaveBeenCalled()
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('repair1', 'skip account repair 4, we have a newer copy')
    })

    it('should build request objects for missing accounts', async () => {
      // Setup voters
      const mockVoter = {
        owner: 'voter-public-key',
        sig: 'signature'
      }
      mockQueueEntry.signedReceiptForRepair.signaturePack = [mockVoter]

      // Mock node lookup
      const mockNode = {
        id: 'node-123',
        publicKey: 'voter-public-key'
      }
      mockStateManager.p2p.state.getNodeByPubKey.mockReturnValue(mockNode)

      // Mock node shard data
      const mockNodeShardData = {
        node: mockNode,
        storedPartitions: []
      }
      mockStateManager.currentCycleShardData.nodeShardDataMap.set('node-123', mockNodeShardData)

      // Mock ShardFunctions
      ;(ShardFunctions.default.testAddressInRange as jest.Mock).mockReturnValue(true)
      mockStateManager.accountGlobals.isGlobalAccount.mockReturnValue(false)

      // Mock no cached accounts
      mockStateManager.accountCache.getAccountHash.mockReturnValue(null)

      // Mock successful remote data request
      const mockResponse: RequestStateForTxResp = {
        success: true,
        stateList: [
          {
            accountId: 'account1',
            stateId: 'hash1',
            timestamp: 1234567890,
            data: { someData: 'value' },
            accountCreated: false,
            isPartial: false
          } as any
        ],
        beforeHashes: {
          account1: 'before-hash1'
        },
        note: 'success'
      }
      mockP2P.askBinary.mockResolvedValue(mockResponse)

      // Mock app functions
      mockApp.getTimestampAndHashFromAccount.mockReturnValue({ timestamp: 1234567890, hash: 'hash1' })
      mockApp.getAccountDataByList.mockResolvedValue([{ someBeforeData: 'value' }])

      await transactionRepair.repairToMatchReceipt(mockQueueEntry)

      expect(mockP2P.askBinary).toHaveBeenCalledWith(
        mockNode,
        InternalRouteEnum.binary_request_state_for_tx_post,
        expect.objectContaining({
          key: 'account1',
          hash: 'hash1',
          txid: 'tx-123',
          timestamp: 1234567890
        }),
        expect.any(Function),
        expect.any(Function),
        { verification_data: 'tx-123' }
      )
    })

    it('should handle failed remote data requests', async () => {
      // Setup voters
      const mockVoter = { owner: 'voter-public-key', sig: 'signature' }
      mockQueueEntry.signedReceiptForRepair.signaturePack = [mockVoter]

      // Mock node lookup
      const mockNode = { id: 'node-123', publicKey: 'voter-public-key' }
      mockStateManager.p2p.state.getNodeByPubKey.mockReturnValue(mockNode)

      // Mock node shard data
      mockStateManager.currentCycleShardData.nodeShardDataMap.set('node-123', { node: mockNode, storedPartitions: [] })

      ;(ShardFunctions.default.testAddressInRange as jest.Mock).mockReturnValue(true)
      mockStateManager.accountCache.getAccountHash.mockReturnValue(null)

      // Mock failed response
      mockP2P.askBinary.mockResolvedValue(null)

      await transactionRepair.repairToMatchReceipt(mockQueueEntry)

      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('repair1', 'failed out of attempts')
    })

    it('should handle successful repair with retry logic', async () => {
      // Setup voters with multiple nodes for alternates
      const mockVoters = [
        { owner: 'voter1-public-key', sig: 'sig1' },
        { owner: 'voter2-public-key', sig: 'sig2' }
      ]
      mockQueueEntry.signedReceiptForRepair.signaturePack = mockVoters

      // Mock nodes
      const mockNode1 = { id: 'node-1', publicKey: 'voter1-public-key' }
      const mockNode2 = { id: 'node-2', publicKey: 'voter2-public-key' }
      mockStateManager.p2p.state.getNodeByPubKey
        .mockReturnValueOnce(mockNode1)
        .mockReturnValueOnce(mockNode2)

      // Mock node shard data
      mockStateManager.currentCycleShardData.nodeShardDataMap.set('node-1', { node: mockNode1, storedPartitions: [] })
      mockStateManager.currentCycleShardData.nodeShardDataMap.set('node-2', { node: mockNode2, storedPartitions: [] })

      ;(ShardFunctions.default.testAddressInRange as jest.Mock).mockReturnValue(true)
      mockStateManager.accountCache.getAccountHash.mockReturnValue(null)

      // First request fails, second succeeds
      mockP2P.askBinary
        .mockResolvedValueOnce(null) // First node fails
        .mockResolvedValueOnce({
          success: true,
          stateList: [{
            accountId: 'account1',
            stateId: 'hash1',
            timestamp: 1234567890,
            data: { someData: 'value' },
            accountCreated: false,
            isPartial: false
          } as any],
          beforeHashes: { account1: 'before-hash1' }
        })

      mockApp.getTimestampAndHashFromAccount.mockReturnValue({ timestamp: 1234567890, hash: 'hash1' })
      mockApp.getAccountDataByList.mockResolvedValue([{ someBeforeData: 'value' }])

      await transactionRepair.repairToMatchReceipt(mockQueueEntry)

      expect(mockP2P.askBinary).toHaveBeenCalledTimes(2)
      expect(mockQueueEntry.repairFinished).toBe(true)
      expect(mockStateManager.dataRepairsCompleted).toBe(1)
    })

    it('should handle state table updates for non-global accounts', async () => {
      // Setup for successful repair
      mockQueueEntry.signedReceiptForRepair.signaturePack = [{ owner: 'voter-public-key', sig: 'signature' }]
      const mockNode = { id: 'node-123', publicKey: 'voter-public-key' }
      mockStateManager.p2p.state.getNodeByPubKey.mockReturnValue(mockNode)
      mockStateManager.currentCycleShardData.nodeShardDataMap.set('node-123', { node: mockNode, storedPartitions: [] })

      ;(ShardFunctions.default.testAddressInRange as jest.Mock).mockReturnValue(true)
      mockStateManager.accountGlobals.isGlobalAccount.mockReturnValue(false)
      mockStateManager.accountCache.getAccountHash.mockReturnValue(null)

      const mockResponse = {
        success: true,
        stateList: [{
          accountId: 'account1',
          stateId: 'hash1',
          timestamp: 1234567890,
          data: { someData: 'value' },
          accountCreated: false,
          isPartial: false
        } as any],
        beforeHashes: { account1: 'before-hash1' }
      }
      mockP2P.askBinary.mockResolvedValue(mockResponse)

      mockApp.getTimestampAndHashFromAccount
        .mockReturnValueOnce({ timestamp: 1234567890, hash: 'hash1' }) // For data.data (updatedHash)
        .mockReturnValueOnce({ timestamp: 1234567890, hash: 'before-hash1' }) // For beforeData (oldhash)
      mockApp.getAccountDataByList.mockResolvedValue([{ someBeforeData: 'value' }])

      await transactionRepair.repairToMatchReceipt(mockQueueEntry)

      expect(mockStorage.addAccountStates).toHaveBeenCalledWith({
        accountId: 'account1',
        txId: 'tx-123',
        stateBefore: 'before-hash1',
        stateAfter: 'hash1',
        txTimestamp: '1234567890'
      })
    })

    it('should handle global accounts differently', async () => {
      // Setup for successful repair with global account
      mockQueueEntry.signedReceiptForRepair.signaturePack = [{ owner: 'voter-public-key', sig: 'signature' }]
      const mockNode = { id: 'node-123', publicKey: 'voter-public-key' }
      mockStateManager.p2p.state.getNodeByPubKey.mockReturnValue(mockNode)
      mockStateManager.currentCycleShardData.nodeShardDataMap.set('node-123', { node: mockNode, storedPartitions: [] })

      ;(ShardFunctions.default.testAddressInRange as jest.Mock).mockReturnValue(true)
      mockStateManager.accountGlobals.isGlobalAccount.mockReturnValue(true) // Global account
      mockStateManager.accountCache.getAccountHash.mockReturnValue(null)

      const mockResponse = {
        success: true,
        stateList: [{
          accountId: 'account1',
          stateId: 'hash1',
          timestamp: 1234567890,
          data: { someData: 'value' },
          accountCreated: false,
          isPartial: false
        } as any],
        beforeHashes: { account1: 'hash1' } // Same hash before and after
      }
      mockP2P.askBinary.mockResolvedValue(mockResponse)

      mockApp.getTimestampAndHashFromAccount.mockReturnValue({ timestamp: 1234567890, hash: 'hash1' })
      mockApp.getAccountDataByList.mockResolvedValue([{ someBeforeData: 'value' }])

      await transactionRepair.repairToMatchReceipt(mockQueueEntry)

      // Should not update state table for global accounts with same hash
      expect(mockStorage.addAccountStates).not.toHaveBeenCalled()
    })

    it('should handle exceptions during remote data request', async () => {
      // Setup
      mockQueueEntry.signedReceiptForRepair.signaturePack = [{ owner: 'voter-public-key', sig: 'signature' }]
      const mockNode = { id: 'node-123', publicKey: 'voter-public-key' }
      mockStateManager.p2p.state.getNodeByPubKey.mockReturnValue(mockNode)
      mockStateManager.currentCycleShardData.nodeShardDataMap.set('node-123', { node: mockNode, storedPartitions: [] })

      ;(ShardFunctions.default.testAddressInRange as jest.Mock).mockReturnValue(true)
      mockStateManager.accountCache.getAccountHash.mockReturnValue(null)

      // Mock exception
      mockP2P.askBinary.mockRejectedValue(new Error('Network error'))

      await transactionRepair.repairToMatchReceipt(mockQueueEntry)

      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('repair1', 'failed out of attempts')
    })

    it('should handle node validation failures', async () => {
      // Setup
      mockQueueEntry.signedReceiptForRepair.signaturePack = [{ owner: 'voter-public-key', sig: 'signature' }]
      const mockNode = { id: 'node-123', publicKey: 'voter-public-key' }
      mockStateManager.p2p.state.getNodeByPubKey.mockReturnValue(mockNode)
      mockStateManager.currentCycleShardData.nodeShardDataMap.set('node-123', { node: mockNode, storedPartitions: [] })

      ;(ShardFunctions.default.testAddressInRange as jest.Mock).mockReturnValue(true)
      mockStateManager.accountCache.getAccountHash.mockReturnValue(null)

      // Mock node validation failure
      mockStateManager.isNodeValidForInternalMessage.mockReturnValue(false)

      await transactionRepair.repairToMatchReceipt(mockQueueEntry)

      expect(mockP2P.askBinary).not.toHaveBeenCalled()
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('repair1', 'failed out of attempts')
    })

    it('should handle mismatched state IDs in response', async () => {
      // Setup
      mockQueueEntry.signedReceiptForRepair.signaturePack = [{ owner: 'voter-public-key', sig: 'signature' }]
      const mockNode = { id: 'node-123', publicKey: 'voter-public-key' }
      mockStateManager.p2p.state.getNodeByPubKey.mockReturnValue(mockNode)
      mockStateManager.currentCycleShardData.nodeShardDataMap.set('node-123', { node: mockNode, storedPartitions: [] })

      ;(ShardFunctions.default.testAddressInRange as jest.Mock).mockReturnValue(true)
      mockStateManager.accountCache.getAccountHash.mockReturnValue(null)

      // Mock response with wrong state ID
      const mockResponse = {
        success: true,
        stateList: [{
          accountId: 'account1',
          stateId: 'wrong-hash', // Different from expected hash1
          timestamp: 1234567890,
          data: { someData: 'value' }
        }],
        beforeHashes: { account1: 'before-hash1' }
      }
      mockP2P.askBinary.mockResolvedValue(mockResponse)

      await transactionRepair.repairToMatchReceipt(mockQueueEntry)

      expect(mockStateManager.checkAndSetAccountData).not.toHaveBeenCalled()
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('repair1', 'skip account repair 3, stateId mismatch')
    })

    it('should forward receipt if repair succeeds and vote hashes match', async () => {
      // Setup successful repair
      mockQueueEntry.isInExecutionHome = true
      mockQueueEntry.ourVoteHash = 'proposal-hash-123'
      mockQueueEntry.preApplyTXResult = { applyResponse: {
        stateTableResults: [],
        txId: 'tx-123',
        txTimestamp: '1234567890',
        accountData: [],
        accountsToDelete: [],
        appReceiptData: null,
        appReceiptDataHash: null,
        failed: false,
        reason: null,
        txResult: null
      } } as any
      mockConfig.p2p.experimentalSnapshot = true

      // Setup for successful repair
      mockQueueEntry.signedReceiptForRepair.signaturePack = [{ owner: 'voter-public-key', sig: 'signature' }]
      const mockNode = { id: 'node-123', publicKey: 'voter-public-key' }
      mockStateManager.p2p.state.getNodeByPubKey.mockReturnValue(mockNode)
      mockStateManager.currentCycleShardData.nodeShardDataMap.set('node-123', { node: mockNode, storedPartitions: [] })

      ;(ShardFunctions.default.testAddressInRange as jest.Mock).mockReturnValue(true)
      // Make repair succeed by having correct hashes for all accounts
      mockStateManager.accountCache.getAccountHash
        .mockReturnValueOnce({ h: 'hash1', t: 1234567890 })
        .mockReturnValueOnce({ h: 'hash2', t: 1234567890 })

      await transactionRepair.repairToMatchReceipt(mockQueueEntry)

      expect(mockStateManager.transactionQueue.addReceiptToForward).toHaveBeenCalledWith(mockQueueEntry, 'repair')
    })

    it('should count late repairs when cycle numbers do not match', async () => {
      // Setup
      mockQueueEntry.cycleToRecordOn = 5 // Different from current cycle (10)
      mockQueueEntry.signedReceiptForRepair.signaturePack = [{ owner: 'voter-public-key', sig: 'signature' }]
      const mockNode = { id: 'node-123', publicKey: 'voter-public-key' }
      mockStateManager.p2p.state.getNodeByPubKey.mockReturnValue(mockNode)
      mockStateManager.currentCycleShardData.nodeShardDataMap.set('node-123', { node: mockNode, storedPartitions: [] })

      ;(ShardFunctions.default.testAddressInRange as jest.Mock).mockReturnValue(true)
      // Make repair succeed by having correct hashes
      mockStateManager.accountCache.getAccountHash
        .mockReturnValueOnce({ h: 'hash1', t: 1234567890 })
        .mockReturnValueOnce({ h: 'hash2', t: 1234567890 })

      await transactionRepair.repairToMatchReceipt(mockQueueEntry)

      expect(mockStateManager.cycleDebugNotes.lateRepairs).toBe(1)
    })

    it('should handle null state before in state table update', async () => {
      // Setup for successful repair
      mockQueueEntry.signedReceiptForRepair.signaturePack = [{ owner: 'voter-public-key', sig: 'signature' }]
      const mockNode = { id: 'node-123', publicKey: 'voter-public-key' }
      mockStateManager.p2p.state.getNodeByPubKey.mockReturnValue(mockNode)
      mockStateManager.currentCycleShardData.nodeShardDataMap.set('node-123', { node: mockNode, storedPartitions: [] })

      ;(ShardFunctions.default.testAddressInRange as jest.Mock).mockReturnValue(true)
      mockStateManager.accountGlobals.isGlobalAccount.mockReturnValue(false) // Not a global account
      mockStateManager.accountCache.getAccountHash.mockReturnValue(null) // No cached hash

      const mockResponse = {
        success: true,
        stateList: [{
          accountId: 'account1',
          stateId: 'hash1',
          timestamp: 1234567890,
          data: { someData: 'value' },
          accountCreated: false,
          isPartial: false,
          prevDataCopy: null // No previous data
        } as any],
        beforeHashes: { account1: null }, // Null before hash
        note: 'success'
      } as RequestStateForTxResp
      mockP2P.askBinary.mockResolvedValue(mockResponse)

      // Mock both getTimestampAndHashFromAccount calls - one for data.data, one for beforeData
      mockApp.getTimestampAndHashFromAccount
        .mockReturnValueOnce({ timestamp: 1234567890, hash: 'hash1' }) // For data.data (updatedHash)
        .mockReturnValueOnce({ timestamp: 1234567890, hash: 'before-hash' }) // For beforeData (will be overridden by beforeHashes)
      
      // Return some beforeData object so the code doesn't skip the state table update
      mockApp.getAccountDataByList.mockResolvedValue([{ someBeforeData: 'value' }]) // Has before data

      await transactionRepair.repairToMatchReceipt(mockQueueEntry)

      expect(mockStorage.addAccountStates).toHaveBeenCalledWith({
        accountId: 'account1',
        txId: 'tx-123',
        stateBefore: '0000', // Default value for null
        stateAfter: 'hash1',
        txTimestamp: '1234567890'
      })
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('repair1', 'addAccountStates-null')
    })
  })
})