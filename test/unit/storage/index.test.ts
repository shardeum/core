// Mock modules before imports
jest.mock('../../../src/p2p/Apoptosis', () => ({
  addCycleFieldQuery: 'ALTER TABLE cycles ADD COLUMN IF NOT EXISTS archiversAtShutdown JSON',
}))
jest.mock('../../../src/p2p/Context', () => ({
  config: {
    stateManager: {
      useAccountCopiesTable: true,
    },
  },
  setDefaultConfigs: jest.fn(),
}))
jest.mock('../../../src/storage/sqlite3storage')
jest.mock('../../../src/logger', () => ({
  default: jest.fn().mockImplementation(() => ({
    getLogger: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      fatal: jest.fn(),
    }),
  })),
  logFlags: {
    important_as_fatal: false,
    p2pNonFatal: false,
    console: false,
    error: false,
  },
}))
jest.mock('../../../src/utils/profiler')
jest.mock('../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
  },
}))
jest.mock('../../../src/network', () => ({
  shardusGetTime: jest.fn().mockReturnValue(1234567890),
}))
jest.mock('@shardeum-foundation/lib-types', () => ({
  Utils: {
    safeStringify: jest.fn().mockImplementation((obj) => JSON.stringify(obj)),
    safeJsonParse: jest.fn().mockImplementation((str) => {
      try {
        return JSON.parse(str)
      } catch {
        return null
      }
    }),
  },
}))
jest.mock('../../../src/snapshot', () => ({
  oldDataPath: null,
}))
jest.mock('../../../src/state-manager')
jest.mock('../../../src/storage/models', () => [
  ['cycles', {}],
  ['nodes', {}],
  ['properties', {}],
  ['acceptedTxs', {}],
  ['accountStates', {}],
  ['accountsCopy', {}],
  ['partitions', {}],
  ['receipt', {}],
  ['summary', {}],
  ['network', {}],
  ['networkReceipt', {}],
  ['networkSummary', {}],
])

import Storage from '../../../src/storage/index'
import Sqlite3Storage from '../../../src/storage/sqlite3storage'
import Logger from '../../../src/logger'
import Profiler from '../../../src/utils/profiler'
import * as ShardusTypes from '../../../src/shardus/shardus-types'
import { Op } from '../../../src/storage/utils/sqlOpertors'
import { config } from '../../../src/p2p/Context'
import { nestedCountersInstance } from '../../../src/utils/nestedCounters'
import * as network from '../../../src/network'
import { Utils } from '@shardeum-foundation/lib-types'

describe('Storage', () => {
  let storage: Storage
  let mockLogger: any
  let mockProfiler: any
  let mockSqliteStorage: any
  let mockConfig: ShardusTypes.StrictStorageConfiguration
  let mockServerConfig: ShardusTypes.StrictServerConfiguration

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Setup mock logger
    mockLogger = {
      getLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        fatal: jest.fn(),
      }),
    }

    // Setup mock profiler
    mockProfiler = {
      profileSectionStart: jest.fn(),
      profileSectionEnd: jest.fn(),
    }

    // Setup mock sqlite storage
    mockSqliteStorage = {
      init: jest.fn().mockResolvedValue(undefined),
      runCreate: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      deleteOldDBPath: jest.fn().mockResolvedValue(undefined),
      _create: jest.fn().mockResolvedValue(undefined),
      _read: jest.fn().mockResolvedValue([]),
      _readOld: jest.fn().mockResolvedValue([]),
      _update: jest.fn().mockResolvedValue(undefined),
      _delete: jest.fn().mockResolvedValue(undefined),
      _rawQuery: jest.fn().mockResolvedValue([]),
      _rawQueryOld: jest.fn().mockResolvedValue([]),
      storageModels: {
        cycles: 'cycles',
        nodes: 'nodes',
        properties: 'properties',
        acceptedTxs: 'acceptedTxs',
        accountStates: 'accountStates',
        accountsCopy: 'accountsCopy',
        partitions: 'partitions',
        receipt: 'receipt',
        summary: 'summary',
        network: 'network',
        networkReceipt: 'networkReceipt',
        networkSummary: 'networkSummary',
      },
    }

    // Mock the Sqlite3Storage constructor
    ;(Sqlite3Storage as jest.MockedClass<typeof Sqlite3Storage>).mockImplementation(() => mockSqliteStorage)

    // Setup configs
    mockConfig = {} as ShardusTypes.StrictStorageConfiguration
    mockServerConfig = {
      debug: {
        recordAcceptedTx: true,
        recordAccountStates: true,
      },
    } as ShardusTypes.StrictServerConfiguration

    // Create storage instance
    storage = new Storage('/base/dir', mockConfig, mockServerConfig, mockLogger as Logger, mockProfiler as Profiler)
  })

  describe('constructor', () => {
    it('should initialize with correct parameters', () => {
      expect(storage).toBeDefined()
      expect(storage.profiler).toBe(mockProfiler)
      expect(storage.serverConfig).toBe(mockServerConfig)
      expect(storage.storage).toBeDefined()
      expect(Sqlite3Storage).toHaveBeenCalledWith(expect.any(Array), mockConfig, mockLogger, '/base/dir', mockProfiler)
    })

    it('should set up loggers correctly', () => {
      expect(mockLogger.getLogger).toHaveBeenCalledWith('main')
      expect(mockLogger.getLogger).toHaveBeenCalledWith('fatal')
      expect(storage.mainLogger).toBeDefined()
      expect(storage.fatalLogger).toBeDefined()
    })
  })

  describe('init', () => {
    it('should initialize storage and create all required tables', async () => {
      await storage.init()

      expect(mockSqliteStorage.init).toHaveBeenCalled()
      expect(storage.initialized).toBe(true)

      // Check that all tables are created
      const expectedTables = [
        'acceptedTxs',
        'accountStates',
        'cycles',
        'nodes',
        'properties',
        'accountsCopy',
        'globalAccounts',
        'partitions',
        'receipt',
        'summary',
        'network',
        'networkReceipt',
        'networkSummary',
      ]

      expect(mockSqliteStorage.runCreate).toHaveBeenCalledTimes(expectedTables.length)
    })

    it('should set up helper methods after initialization', async () => {
      await storage.init()

      expect(storage._create).toBeDefined()
      expect(storage._read).toBeDefined()
      expect(storage._readOld).toBeDefined()
      expect(storage._update).toBeDefined()
      expect(storage._delete).toBeDefined()
      expect(storage._query).toBeDefined()
      expect(storage._queryOld).toBeDefined()
    })
  })

  describe('_checkInit', () => {
    it('should throw error if not initialized', () => {
      expect(() => storage._checkInit()).toThrow('Storage not initialized.')
    })

    it('should not throw error if initialized', async () => {
      await storage.init()
      expect(() => storage._checkInit()).not.toThrow()
    })
  })

  describe('close', () => {
    it('should close the storage', async () => {
      await storage.close()
      expect(mockSqliteStorage.close).toHaveBeenCalled()
    })
  })

  describe('deleteOldDBPath', () => {
    it('should delete old database path', async () => {
      await storage.deleteOldDBPath()
      expect(mockSqliteStorage.deleteOldDBPath).toHaveBeenCalled()
    })
  })

  describe('Cycle Methods', () => {
    beforeEach(async () => {
      await storage.init()
    })

    describe('addCycles', () => {
      it('should add cycles successfully', async () => {
        const cycles = [{ counter: 1, marker: 'test' }]
        await storage.addCycles(cycles)

        expect(mockSqliteStorage._create).toHaveBeenCalledWith('cycles', cycles, undefined)
      })

      it('should throw error if not initialized', async () => {
        storage.initialized = false
        await expect(storage.addCycles([])).rejects.toThrow('Storage not initialized.')
      })

      it('should throw error if database operation fails', async () => {
        mockSqliteStorage._create.mockRejectedValueOnce(new Error('DB Error'))
        await expect(storage.addCycles([])).rejects.toThrow('DB Error')
      })
    })

    describe('updateCycle', () => {
      it('should update cycle successfully', async () => {
        const record = { counter: 1 }
        const newRecord = { counter: 1, marker: 'updated' }

        await storage.updateCycle(record, newRecord)

        expect(mockSqliteStorage._update).toHaveBeenCalledWith('cycles', newRecord, record, undefined)
      })

      it('should throw error if database operation fails', async () => {
        mockSqliteStorage._update.mockRejectedValueOnce(new Error('Update Error'))
        await expect(storage.updateCycle({}, {})).rejects.toThrow('Update Error')
      })
    })

    describe('getCycleByCounter', () => {
      it('should return cycle when found', async () => {
        const mockCycle = { dataValues: { counter: 1, marker: 'test' } }
        mockSqliteStorage._read.mockResolvedValueOnce([mockCycle])

        const result = await storage.getCycleByCounter(1)

        expect(result).toEqual(mockCycle.dataValues)
        expect(mockSqliteStorage._read).toHaveBeenCalledWith(
          'cycles',
          { counter: 1 },
          { attributes: { exclude: ['createdAt', 'updatedAt'] } }
        )
      })

      it('should return null when cycle not found', async () => {
        mockSqliteStorage._read.mockResolvedValueOnce([])

        const result = await storage.getCycleByCounter(999)

        expect(result).toBeNull()
      })

      it('should throw error if database operation fails', async () => {
        mockSqliteStorage._read.mockRejectedValueOnce(new Error('Read Error'))
        await expect(storage.getCycleByCounter(1)).rejects.toThrow('Read Error')
      })
    })

    describe('getCycleByMarker', () => {
      it('should return cycle when found', async () => {
        const mockCycle = { dataValues: { counter: 1, marker: 'test' } }
        mockSqliteStorage._read.mockResolvedValueOnce([mockCycle])

        const result = await storage.getCycleByMarker('test')

        expect(result).toEqual(mockCycle.dataValues)
        expect(mockSqliteStorage._read).toHaveBeenCalledWith(
          'cycles',
          { marker: 'test' },
          { attributes: { exclude: ['createdAt', 'updatedAt'] } }
        )
      })

      it('should return null when cycle not found', async () => {
        mockSqliteStorage._read.mockResolvedValueOnce([])

        const result = await storage.getCycleByMarker('nonexistent')

        expect(result).toBeNull()
      })
    })

    describe('deleteCycleByCounter', () => {
      it('should delete cycle successfully', async () => {
        await storage.deleteCycleByCounter(1)

        expect(mockSqliteStorage._delete).toHaveBeenCalledWith('cycles', { counter: 1 }, undefined)
      })
    })

    describe('deleteCycleByMarker', () => {
      it('should delete cycle successfully', async () => {
        await storage.deleteCycleByMarker('test')

        expect(mockSqliteStorage._delete).toHaveBeenCalledWith('cycles', { marker: 'test' }, undefined)
      })
    })

    describe('listCycles', () => {
      it('should return list of cycles', async () => {
        const mockCycles = [{ dataValues: { counter: 1 } }, { dataValues: { counter: 2 } }]
        mockSqliteStorage._read.mockResolvedValueOnce(mockCycles)

        const result = await storage.listCycles()

        expect(result).toEqual([{ counter: 1 }, { counter: 2 }])
        expect(mockSqliteStorage._read).toHaveBeenCalledWith('cycles', null, {
          attributes: { exclude: ['createdAt', 'updatedAt'] },
        })
      })
    })

    describe('listOldCycles', () => {
      it('should return list of old cycles', async () => {
        const mockCycles = [{ counter: 1 }, { counter: 2 }]
        mockSqliteStorage._readOld.mockResolvedValueOnce(mockCycles)

        const result = await storage.listOldCycles()

        expect(result).toEqual(mockCycles)
      })
    })
  })

  describe('Node Methods', () => {
    beforeEach(async () => {
      await storage.init()
    })

    describe('addNodes', () => {
      it('should add nodes successfully', async () => {
        const nodes = [{ id: 'node1', publicKey: 'key1' }]
        await storage.addNodes(nodes)

        expect(mockSqliteStorage._create).toHaveBeenCalledWith('nodes', nodes, undefined)
      })
    })

    describe('getNodes', () => {
      it('should get nodes successfully', async () => {
        const node = { id: 'node1' }
        const mockNodes = [{ id: 'node1', publicKey: 'key1' }]
        mockSqliteStorage._read.mockResolvedValueOnce(mockNodes)

        const result = await storage.getNodes(node)

        expect(result).toEqual(mockNodes)
        expect(mockSqliteStorage._read).toHaveBeenCalledWith('nodes', node, {
          attributes: { exclude: ['createdAt', 'updatedAt'] },
          raw: true,
        })
      })
    })

    describe('updateNodes', () => {
      it('should update nodes successfully', async () => {
        const node = { id: 'node1' }
        const newNode = { id: 'node1', status: 'active' }

        await storage.updateNodes(node, newNode)

        expect(mockSqliteStorage._update).toHaveBeenCalledWith('nodes', newNode, node, undefined)
      })
    })

    describe('deleteNodes', () => {
      it('should delete single node', async () => {
        const node = { id: 'node1' }
        await storage.deleteNodes(node)

        expect(mockSqliteStorage._delete).toHaveBeenCalledWith('nodes', { id: { [Op.in]: ['node1'] } }, undefined)
      })

      it('should delete multiple nodes', async () => {
        const nodes = [{ id: 'node1' }, { id: 'node2' }]
        await storage.deleteNodes(nodes)

        expect(mockSqliteStorage._delete).toHaveBeenCalledWith(
          'nodes',
          { id: { [Op.in]: ['node1', 'node2'] } },
          undefined
        )
      })

      it('should log error for nodes without ID', async () => {
        // Mock logFlags.error to be true
        const logFlags = require('../../../src/logger').logFlags
        logFlags.error = true

        const nodes = [{ id: 'node1' }, { noId: 'test' }]
        await storage.deleteNodes(nodes)

        expect(mockSqliteStorage._delete).toHaveBeenCalledWith('nodes', { id: { [Op.in]: ['node1'] } }, undefined)
        expect(storage.mainLogger.error).toHaveBeenCalled()
      })
    })

    describe('listNodes', () => {
      it('should list all nodes', async () => {
        const mockNodes = [{ id: 'node1' }, { id: 'node2' }]
        mockSqliteStorage._read.mockResolvedValueOnce(mockNodes)

        const result = await storage.listNodes()

        expect(result).toEqual(mockNodes)
      })
    })
  })

  describe('Property Methods', () => {
    beforeEach(async () => {
      await storage.init()
    })

    describe('setProperty', () => {
      it('should create new property if not exists', async () => {
        mockSqliteStorage._read.mockResolvedValueOnce([])

        await storage.setProperty('key1', { value: 'test' })

        expect(mockSqliteStorage._create).toHaveBeenCalledWith(
          'properties',
          { key: 'key1', value: { value: 'test' } },
          undefined
        )
      })

      it('should update existing property', async () => {
        mockSqliteStorage._read.mockResolvedValueOnce([{ key: 'key1' }])

        await storage.setProperty('key1', { value: 'updated' })

        expect(mockSqliteStorage._update).toHaveBeenCalledWith(
          'properties',
          { key: 'key1', value: { value: 'updated' } },
          { key: 'key1' },
          undefined
        )
      })
    })

    describe('getProperty', () => {
      it('should return property value when found', async () => {
        const testValue = { test: 'value' }
        const jsonValue = JSON.stringify(testValue)

        // Reset and setup the Utils mock
        ;(Utils.safeJsonParse as jest.Mock).mockClear()
        ;(Utils.safeJsonParse as jest.Mock).mockReturnValueOnce(testValue)

        // Mock the _read to return a property with a JSON string value
        mockSqliteStorage._read.mockResolvedValueOnce([{ value: jsonValue }])

        const result = await storage.getProperty('key1')

        expect(mockSqliteStorage._read).toHaveBeenCalledWith('properties', { key: 'key1' }, undefined)
        expect(Utils.safeJsonParse).toHaveBeenCalledWith(jsonValue)
        expect(result).toEqual(testValue)
      })

      it('should return null when property not found', async () => {
        mockSqliteStorage._read.mockResolvedValueOnce([])

        const result = await storage.getProperty('nonexistent')

        expect(result).toBeNull()
      })
    })

    describe('deleteProperty', () => {
      it('should delete property successfully', async () => {
        await storage.deleteProperty('key1')

        expect(mockSqliteStorage._delete).toHaveBeenCalledWith('properties', { key: 'key1' }, undefined)
      })
    })

    describe('listProperties', () => {
      it('should return list of property keys', async () => {
        mockSqliteStorage._read.mockResolvedValueOnce([{ key: 'key1' }, { key: 'key2' }])

        const result = await storage.listProperties()

        expect(result).toEqual(['key1', 'key2'])
      })
    })
  })

  describe('State Management Methods', () => {
    beforeEach(async () => {
      await storage.init()
    })

    describe('clearP2pState', () => {
      it('should clear cycles and nodes tables', async () => {
        await storage.clearP2pState()

        expect(mockSqliteStorage._delete).toHaveBeenCalledWith('cycles', null, { truncate: true })
        expect(mockSqliteStorage._delete).toHaveBeenCalledWith('nodes', null, { truncate: true })
      })
    })

    describe('clearAppRelatedState', () => {
      it('should clear app-related tables', async () => {
        await storage.clearAppRelatedState()

        expect(mockSqliteStorage._delete).toHaveBeenCalledWith('accountStates', null, { truncate: true })
        expect(mockSqliteStorage._delete).toHaveBeenCalledWith('acceptedTxs', null, { truncate: true })
        expect(mockSqliteStorage._delete).toHaveBeenCalledWith('accountsCopy', null, { truncate: true })
      })
    })
  })

  describe('Transaction Methods', () => {
    beforeEach(async () => {
      await storage.init()
    })

    describe('addAcceptedTransactions', () => {
      it('should add accepted transactions when recordAcceptedTx is true', async () => {
        const transactions = [{ txId: 'tx1', timestamp: 123 }]
        await storage.addAcceptedTransactions(transactions)

        expect(mockSqliteStorage._create).toHaveBeenCalledWith('acceptedTxs', transactions, { createOrReplace: true })
      })

      it('should not add transactions when recordAcceptedTx is false', async () => {
        storage.serverConfig.debug.recordAcceptedTx = false
        const transactions = [{ txId: 'tx1', timestamp: 123 }]
        await storage.addAcceptedTransactions(transactions)

        expect(mockSqliteStorage._create).not.toHaveBeenCalled()
      })

      it('should throw error if database operation fails', async () => {
        mockSqliteStorage._create.mockRejectedValueOnce(new Error('DB Error'))
        await expect(storage.addAcceptedTransactions([])).rejects.toThrow('DB Error')
      })
    })

    describe('queryAcceptedTransactions', () => {
      it('should query transactions by timestamp range', async () => {
        const mockTxs = [{ txId: 'tx1' }, { txId: 'tx2' }]
        mockSqliteStorage._read.mockResolvedValueOnce(mockTxs)

        const result = await storage.queryAcceptedTransactions(100, 200, 10)

        expect(result).toEqual(mockTxs)
        expect(mockSqliteStorage._read).toHaveBeenCalledWith(
          'acceptedTxs',
          { timestamp: { [Op.between]: [100, 200] } },
          {
            limit: 10,
            order: [['timestamp', 'ASC']],
            attributes: { exclude: ['createdAt', 'updatedAt', 'id'] },
            raw: true,
          }
        )
      })
    })

    describe('queryAcceptedTransactionsByIds', () => {
      it('should query transactions by IDs', async () => {
        const mockTxs = [{ txId: 'tx1' }, { txId: 'tx2' }]
        mockSqliteStorage._read.mockResolvedValueOnce(mockTxs)

        const result = await storage.queryAcceptedTransactionsByIds(['tx1', 'tx2'])

        expect(result).toEqual(mockTxs)
        expect(mockSqliteStorage._read).toHaveBeenCalledWith(
          'acceptedTxs',
          { id: { [Op.in]: ['tx1', 'tx2'] } },
          {
            order: [['timestamp', 'ASC']],
            attributes: { exclude: ['createdAt', 'updatedAt', 'id'] },
            raw: true,
          }
        )
      })
    })

    describe('clearAcceptedTX', () => {
      it('should clear transactions in timestamp range', async () => {
        await storage.clearAcceptedTX(100, 200)

        expect(mockSqliteStorage._delete).toHaveBeenCalledWith(
          'acceptedTxs',
          { timestamp: { [Op.between]: [100, 200] } },
          {
            attributes: { exclude: ['createdAt', 'updatedAt', 'id'] },
            raw: true,
          }
        )
      })
    })
  })

  describe('Account State Methods', () => {
    beforeEach(async () => {
      await storage.init()
      storage.stateManager = {
        initApoptosisAndQuitSyncing: jest.fn(),
      } as any
    })

    describe('addAccountStates', () => {
      it('should add account states when recordAccountStates is true', async () => {
        const accountStates = [{ accountId: 'acc1', txId: 'tx1' }]
        await storage.addAccountStates(accountStates)

        expect(mockSqliteStorage._create).toHaveBeenCalledWith('accountStates', accountStates, {
          createOrReplace: true,
        })
      })

      it('should not add account states when recordAccountStates is false', async () => {
        storage.serverConfig.debug.recordAccountStates = false
        const accountStates = [{ accountId: 'acc1', txId: 'tx1' }]
        await storage.addAccountStates(accountStates)

        expect(mockSqliteStorage._create).not.toHaveBeenCalled()
      })

      it('should initiate apoptosis on database failure', async () => {
        mockSqliteStorage._create.mockRejectedValueOnce(new Error('DB Error'))
        const accountStates = [{ accountId: 'acc1' }]

        // Should not throw, but initiate apoptosis
        await storage.addAccountStates(accountStates)

        expect(storage.fatalLogger.fatal).toHaveBeenCalled()
        expect(nestedCountersInstance.countEvent).toHaveBeenCalled()
        expect(storage.stateManager.initApoptosisAndQuitSyncing).toHaveBeenCalledWith(
          'addAccountStates',
          'Node stopped due to database failure during addAccountStates.'
        )
      })
    })

    describe('queryAccountStateTable', () => {
      it('should query account states by ranges', async () => {
        const mockStates = [{ accountId: 'acc1' }]
        mockSqliteStorage._read.mockResolvedValueOnce(mockStates)

        const result = await storage.queryAccountStateTable('acc1', 'acc9', 100, 200, 10)

        expect(result).toEqual(mockStates)
        expect(mockSqliteStorage._read).toHaveBeenCalledWith(
          'accountStates',
          {
            accountId: { [Op.between]: ['acc1', 'acc9'] },
            txTimestamp: { [Op.between]: [100, 200] },
          },
          {
            limit: 10,
            order: [
              ['txTimestamp', 'ASC'],
              ['accountId', 'ASC'],
            ],
            attributes: { exclude: ['createdAt', 'updatedAt', 'id'] },
            raw: true,
          }
        )
      })
    })

    describe('queryAccountStateTableByList', () => {
      it('should query account states by address list', async () => {
        const mockStates = [{ accountId: 'acc1' }]
        mockSqliteStorage._read.mockResolvedValueOnce(mockStates)

        const result = await storage.queryAccountStateTableByList(['acc1', 'acc2'], 100, 200)

        expect(result).toEqual(mockStates)
        expect(mockSqliteStorage._read).toHaveBeenCalledWith(
          'accountStates',
          {
            txTimestamp: { [Op.between]: [100, 200] },
            accountId: { [Op.in]: ['acc1', 'acc2'] },
          },
          {
            order: [['address', 'ASC']],
            attributes: { exclude: ['createdAt', 'updatedAt', 'id'] },
            raw: true,
          }
        )
      })
    })

    describe('queryAccountStateTableByListNewest', () => {
      it('should query newest account states by IDs', async () => {
        const mockStates = [{ accountId: 'acc1', txTimestamp: 200 }]
        mockSqliteStorage._rawQuery.mockResolvedValueOnce(mockStates)

        const result = await storage.queryAccountStateTableByListNewest(['acc1', 'acc2'])

        expect(result).toEqual(mockStates)
        expect(mockSqliteStorage._rawQuery).toHaveBeenCalledWith(
          expect.stringContaining('select accountId, txId, max(txTimestamp)'),
          ['acc1', 'acc2']
        )
      })
    })

    describe('searchAccountStateTable', () => {
      it('should search account state by ID and timestamp', async () => {
        const mockStates = [{ accountId: 'acc1' }]
        mockSqliteStorage._read.mockResolvedValueOnce(mockStates)

        const result = await storage.searchAccountStateTable('acc1', 123)

        expect(result).toEqual(mockStates)
        expect(mockSqliteStorage._read).toHaveBeenCalledWith(
          'accountStates',
          { accountId: 'acc1', txTimestamp: 123 },
          {
            attributes: { exclude: ['createdAt', 'updatedAt', 'id'] },
            raw: true,
          }
        )
      })
    })

    describe('clearAccountStateTableByList', () => {
      it('should clear account states by list', async () => {
        await storage.clearAccountStateTableByList(['acc1', 'acc2'], 100, 200)

        expect(mockSqliteStorage._delete).toHaveBeenCalledWith(
          'accountStates',
          {
            txTimestamp: { [Op.between]: [100, 200] },
            accountId: { [Op.in]: ['acc1', 'acc2'] },
          },
          {
            attributes: { exclude: ['createdAt', 'updatedAt', 'id'] },
            raw: true,
          }
        )
      })
    })

    describe('clearAccountStateTableOlderThan', () => {
      it('should clear old account states', async () => {
        await storage.clearAccountStateTableOlderThan(1000)

        expect(mockSqliteStorage._rawQuery).toHaveBeenCalledWith(
          expect.stringContaining('Delete from accountStates where txTimestamp < ?'),
          '1000'
        )
      })
    })
  })

  describe('Hash Methods', () => {
    beforeEach(async () => {
      await storage.init()
    })

    describe('addPartitionHash', () => {
      it('should add partition hash', async () => {
        const partition = { partitionId: 'p1', cycleNumber: 1, hash: 'hash1' }
        await storage.addPartitionHash(partition)

        expect(mockSqliteStorage._create).toHaveBeenCalledWith('partitions', partition, { createOrReplace: true })
      })
    })

    describe('addReceiptMapHash', () => {
      it('should add receipt map hash', async () => {
        const receiptMap = { partitionId: 'p1', cycleNumber: 1, hash: 'hash1' }
        await storage.addReceiptMapHash(receiptMap)

        expect(mockSqliteStorage._create).toHaveBeenCalledWith('receipt', receiptMap, { createOrReplace: true })
      })
    })

    describe('addSummaryHash', () => {
      it('should add summary hash', async () => {
        const summaryHash = { partitionId: 'p1', cycleNumber: 1, hash: 'hash1' }
        await storage.addSummaryHash(summaryHash)

        expect(mockSqliteStorage._create).toHaveBeenCalledWith('summary', summaryHash, { createOrReplace: true })
      })
    })

    describe('addNetworkState', () => {
      it('should add network state', async () => {
        const networkState = { cycleNumber: 1, hash: 'hash1' }
        await storage.addNetworkState(networkState)

        expect(mockSqliteStorage._create).toHaveBeenCalledWith('network', networkState, { createOrReplace: true })
      })
    })

    describe('addNetworkReceipt', () => {
      it('should add network receipt', async () => {
        const networkReceipt = { cycleNumber: 1, hash: 'hash1' }
        await storage.addNetworkReceipt(networkReceipt)

        expect(mockSqliteStorage._create).toHaveBeenCalledWith('networkReceipt', networkReceipt, {
          createOrReplace: true,
        })
      })
    })

    describe('addNetworkSummary', () => {
      it('should add network summary', async () => {
        const networkSummary = { cycleNumber: 1, hash: 'hash1' }
        await storage.addNetworkSummary(networkSummary)

        expect(mockSqliteStorage._create).toHaveBeenCalledWith('networkSummary', networkSummary, {
          createOrReplace: true,
        })
      })
    })

    describe('getLastOldNetworkHash', () => {
      it('should get last old network hash', async () => {
        const mockHash = [{ cycleNumber: 5, hash: 'hash5' }]
        mockSqliteStorage._readOld.mockResolvedValueOnce(mockHash)

        const result = await storage.getLastOldNetworkHash()

        expect(result).toEqual(mockHash)
        expect(mockSqliteStorage._readOld).toHaveBeenCalledWith('network', null, {
          limit: 1,
          order: [['cycleNumber', 'DESC']],
          attributes: { exclude: ['createdAt', 'updatedAt', 'id'] },
          raw: true,
        })
      })
    })

    describe('getLastOldPartitionHashes', () => {
      it('should get last old partition hashes', async () => {
        const mockHashes = [{ partitionId: 'p1', hash: 'hash1' }]
        mockSqliteStorage._rawQueryOld.mockResolvedValueOnce(mockHashes)

        const result = await storage.getLastOldPartitionHashes()

        expect(result).toEqual(mockHashes)
        expect(mockSqliteStorage._rawQueryOld).toHaveBeenCalledWith(
          expect.stringContaining('SELECT partitionId, hash FROM partitions'),
          []
        )
      })
    })
  })

  describe('Account Copy Methods', () => {
    beforeEach(async () => {
      await storage.init()
    })

    describe('createAccountCopies', () => {
      it('should create account copies when enabled', async () => {
        const accountCopies = [{ accountId: 'acc1', cycleNumber: 1 }]
        await storage.createAccountCopies(accountCopies)

        expect(mockSqliteStorage._create).toHaveBeenCalledWith('accountsCopy', accountCopies, undefined)
      })

      it('should not create copies when disabled', async () => {
        config.stateManager.useAccountCopiesTable = false
        const accountCopies = [{ accountId: 'acc1', cycleNumber: 1 }]
        await storage.createAccountCopies(accountCopies)

        expect(mockSqliteStorage._create).not.toHaveBeenCalled()
        config.stateManager.useAccountCopiesTable = true
      })
    })

    describe('createOrReplaceAccountCopy', () => {
      it('should create or replace account copy when enabled', async () => {
        const accountCopy = { accountId: 'acc1', cycleNumber: 1 }
        await storage.createOrReplaceAccountCopy(accountCopy)

        expect(mockSqliteStorage._create).toHaveBeenCalledWith('accountsCopy', accountCopy, { createOrReplace: true })
      })
    })

    describe('getAccountReplacmentCopies', () => {
      it('should get account replacement copies', async () => {
        const mockCopies = [{ accountId: 'acc1' }]
        mockSqliteStorage._rawQuery.mockResolvedValueOnce(mockCopies)

        const result = await storage.getAccountReplacmentCopies(['acc1', 'acc2'], 5)

        expect(result).toEqual(mockCopies)
        expect(mockSqliteStorage._rawQuery).toHaveBeenCalledWith(
          expect.stringContaining('select accountId, max(cycleNumber)'),
          [5, 'acc1', 'acc2']
        )
      })

      it('should return empty array when disabled', async () => {
        config.stateManager.useAccountCopiesTable = false
        const result = await storage.getAccountReplacmentCopies(['acc1'], 5)

        expect(result).toEqual([])
        expect(mockSqliteStorage._rawQuery).not.toHaveBeenCalled()
        config.stateManager.useAccountCopiesTable = true
      })
    })

    describe('clearAccountReplacmentCopies', () => {
      it('should clear account replacement copies', async () => {
        await storage.clearAccountReplacmentCopies(['acc1', 'acc2'], 5)

        expect(mockSqliteStorage._delete).toHaveBeenCalledWith(
          'accountsCopy',
          {
            cycleNumber: { [Op.gte]: 5 },
            accountId: { [Op.in]: ['acc1', 'acc2'] },
          },
          {
            attributes: { exclude: ['createdAt', 'updatedAt'] },
            raw: true,
          }
        )
      })
    })

    describe('getAccountCopiesByCycle', () => {
      it('should get account copies by cycle', async () => {
        const mockCopies = [{ accountId: 'acc1' }]
        mockSqliteStorage._rawQuery.mockResolvedValueOnce(mockCopies)

        const result = await storage.getAccountCopiesByCycle(5)

        expect(result).toEqual(mockCopies)
        expect(mockSqliteStorage._rawQuery).toHaveBeenCalledWith(
          expect.stringContaining('SELECT a.accountId,a.data,a.timestamp,a.hash,a.isGlobal FROM accountsCopy'),
          [5]
        )
      })
    })

    describe('getAccountCopiesByCycleAndRange', () => {
      it('should get account copies by cycle and range', async () => {
        const mockCopies = [{ accountId: 'acc1' }]
        mockSqliteStorage._rawQuery.mockResolvedValueOnce(mockCopies)

        const result = await storage.getAccountCopiesByCycleAndRange(5, 'acc1', 'acc9')

        expect(result).toEqual(mockCopies)
        expect(mockSqliteStorage._rawQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE a.cycleNumber<=5 and a.accountId>="acc1" and a.accountId<="acc9"'),
          []
        )
      })
    })

    describe('getGlobalAccountCopies', () => {
      it('should get global account copies', async () => {
        const mockCopies = [{ accountId: 'global1', isGlobal: true }]
        mockSqliteStorage._rawQuery.mockResolvedValueOnce(mockCopies)

        const result = await storage.getGlobalAccountCopies(5)

        expect(result).toEqual(mockCopies)
        expect(mockSqliteStorage._rawQuery).toHaveBeenCalledWith(expect.stringContaining('and a.isGlobal=true'), [])
      })
    })

    describe('getOldAccountCopiesByCycleAndRange', () => {
      it('should get old account copies by cycle and range', async () => {
        const mockCopies = [{ accountId: 'acc1' }]
        mockSqliteStorage._rawQueryOld.mockResolvedValueOnce(mockCopies)

        const result = await storage.getOldAccountCopiesByCycleAndRange(5, 'acc1', 'acc9')

        expect(result).toEqual(mockCopies)
        expect(mockSqliteStorage._rawQueryOld).toHaveBeenCalled()
      })
    })

    describe('getOldGlobalAccountCopies', () => {
      it('should get old global account copies', async () => {
        const mockCopies = [{ accountId: 'global1', isGlobal: true }]
        mockSqliteStorage._rawQueryOld.mockResolvedValueOnce(mockCopies)

        const result = await storage.getOldGlobalAccountCopies(5)

        expect(result).toEqual(mockCopies)
        expect(mockSqliteStorage._rawQueryOld).toHaveBeenCalled()
      })
    })
  })
})
