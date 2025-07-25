import {
  calculatePartitionBlock,
  createNetworkHash,
  updateStateHashesByCycleMap,
  updateReceiptHashesByCycleMap,
  updateSummaryHashesByCycleMap,
  savePartitionAndNetworkHashes,
  saveReceiptAndNetworkHashes,
  saveSummaryAndNetworkHashes,
  readOldCycleRecord,
  readOldNetworkHash,
  readOldPartitionHashes,
  calculateOldDataMap,
  copyOldDataToDataToMigrate,
  getMissingPartitions,
  registerDownloadRoutes,
  downloadDataFromNode,
  convertMapToObj,
} from '../../../../src/snapshot/snapshotFunctions'
import { P2P, StateManager } from '@shardeum-foundation/lib-types'
import * as Context from '../../../../src/p2p/Context'
import * as NodeList from '../../../../src/p2p/NodeList'
import * as Self from '../../../../src/p2p/Self'
import ShardFunctions from '../../../../src/state-manager/shardFunctions'
import { safetyModeVals, snapshotLogger } from '../../../../src/snapshot/index'
import { NetworkClass } from '../../../../src/network'
import { Utils } from '@shardeum-foundation/lib-types'
import got from 'got'
import zlib from 'zlib'
import stream from 'stream'

// Mock dependencies
jest.mock('../../../../src/p2p/Context')
jest.mock('../../../../src/p2p/NodeList')
jest.mock('../../../../src/p2p/Self')
jest.mock('../../../../src/state-manager/shardFunctions')
jest.mock('../../../../src/snapshot/index', () => ({
  safetyModeVals: { safetyNum: 100 },
  snapshotLogger: {
    error: jest.fn(),
  },
}))
jest.mock('../../../../src/network')
jest.mock('../../../../src/logger', () => ({
  logFlags: { console: false, verbose: false },
  logger: {
    mainLog_debug: jest.fn(),
    combine: jest.fn(),
  },
}))
jest.mock('got')
jest.mock('zlib')
jest.mock('stream')

const mockContext = Context as jest.Mocked<typeof Context>
const mockNodeList = NodeList as jest.Mocked<typeof NodeList>
const mockSelf = Self as jest.Mocked<typeof Self>
const mockShardFunctions = ShardFunctions as jest.Mocked<typeof ShardFunctions>
const mockGot = got as jest.MockedFunction<typeof got>
const mockZlib = zlib as jest.Mocked<typeof zlib>
const mockStream = stream as jest.Mocked<typeof stream>

describe('snapshotFunctions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Setup common mocks
    mockContext.crypto = {
      hash: jest.fn(),
    } as any

    // Set default return value for hash
    ;(mockContext.crypto.hash as jest.Mock).mockReturnValue('mock-hash')

    mockContext.storage = {
      addPartitionHash: jest.fn() as jest.Mock,
      addNetworkState: jest.fn() as jest.Mock,
      addReceiptMapHash: jest.fn() as jest.Mock,
      addNetworkReceipt: jest.fn() as jest.Mock,
      addSummaryHash: jest.fn() as jest.Mock,
      addNetworkSummary: jest.fn() as jest.Mock,
      listOldCycles: jest.fn() as jest.Mock,
      getLastOldNetworkHash: jest.fn() as jest.Mock,
      getLastOldPartitionHashes: jest.fn() as jest.Mock,
      getOldAccountCopiesByCycleAndRange: jest.fn() as jest.Mock,
      getOldGlobalAccountCopies: jest.fn() as jest.Mock,
    } as any
  })

  describe('calculatePartitionBlock', () => {
    it('should create partition to receipt map for stored partitions', () => {
      const mockShard = { ourStoredPartitions: [1, 2, 3] }
      const result = calculatePartitionBlock(mockShard)

      expect(result.size).toBe(4) // 3 partitions + global partition
      expect(result.has(1)).toBe(true)
      expect(result.has(2)).toBe(true)
      expect(result.has(3)).toBe(true)
      expect(result.has(-1)).toBe(true) // global partition
    })

    it('should handle empty stored partitions', () => {
      const mockShard = { ourStoredPartitions: [] }
      const result = calculatePartitionBlock(mockShard)

      expect(result.size).toBe(1) // only global partition
      expect(result.has(-1)).toBe(true)
    })
  })

  describe('createNetworkHash', () => {
    it('should create network hash from partition hashes', () => {
      const hashes = new Map([
        [1, 'hash1'],
        [2, 'hash2'],
        [3, 'hash3'],
      ])
      ;(mockContext.crypto.hash as jest.Mock).mockReturnValue('network-hash')

      const result = createNetworkHash(hashes)

      expect(mockContext.crypto.hash).toHaveBeenCalledWith(['hash1', 'hash2', 'hash3'])
      expect(result).toBe('network-hash')
    })

    it('should handle empty hashes map', () => {
      const hashes = new Map()
      ;(mockContext.crypto.hash as jest.Mock).mockReturnValue('empty-hash')

      const result = createNetworkHash(hashes)

      expect(mockContext.crypto.hash).toHaveBeenCalledWith([])
      expect(result).toBe('empty-hash')
    })

    it('should sort hashes before creating network hash', () => {
      const hashes = new Map([
        [3, 'hash3'],
        [1, 'hash1'],
        [2, 'hash2'],
      ])

      createNetworkHash(hashes)

      expect(mockContext.crypto.hash).toHaveBeenCalledWith(['hash1', 'hash2', 'hash3'])
    })
  })

  describe('updateStateHashesByCycleMap', () => {
    it('should add new state hash to cycle map', () => {
      const counter = 50
      const stateHash = {
        partitionHashes: new Map([['1', 'hash1']]),
        networkHash: 'network-hash',
        counter: 50,
      } as P2P.SnapshotTypes.StateHashes
      const existingMap = new Map([[49, { partitionHashes: {}, networkHash: 'old-hash', counter: 49 }]])

      const result = updateStateHashesByCycleMap(counter, stateHash, existingMap)

      expect(result.has(50)).toBe(true)
      expect(result.has(49)).toBe(true)
      expect(result.get(50)?.networkHash).toBe('network-hash')
    })

    it('should limit map size to 100 entries', () => {
      const counter = 150
      const stateHash = {
        partitionHashes: new Map(),
        networkHash: 'new-hash',
        counter: 150,
      } as P2P.SnapshotTypes.StateHashes

      // Create a map with 100 entries from 49 to 148 (this will make it 101 after adding the new entry at 150)
      const existingEntries: [number, P2P.SnapshotTypes.StateHashes][] = []
      for (let i = 49; i <= 148; i++) {
        existingEntries.push([i, { partitionHashes: {}, networkHash: `hash-${i}`, counter: i }])
      }
      const existingMap = new Map(existingEntries)

      const result = updateStateHashesByCycleMap(counter, stateHash, existingMap)

      expect(result.size).toBeLessThanOrEqual(100)
      expect(result.has(150)).toBe(true)
      expect(result.has(49)).toBe(false) // Should be deleted (49 < limit which is 150-100=50)
    })

    it('should not delete entries when counter is less than 100', () => {
      const counter = 50
      const stateHash = {
        partitionHashes: new Map(),
        networkHash: 'new-hash',
        counter: 50,
      } as P2P.SnapshotTypes.StateHashes
      const existingMap = new Map([[49, { partitionHashes: {}, networkHash: 'old-hash', counter: 49 }]])

      const result = updateStateHashesByCycleMap(counter, stateHash, existingMap)

      expect(result.size).toBe(2)
      expect(result.has(49)).toBe(true)
    })
  })

  describe('updateReceiptHashesByCycleMap', () => {
    it('should add new receipt hash to cycle map', () => {
      const counter = 50
      const receiptHash = {
        receiptMapHashes: new Map([['1', 'receipt-hash1']]),
        networkReceiptHash: 'network-receipt-hash',
        counter: 50,
      } as P2P.SnapshotTypes.ReceiptHashes
      const existingMap = new Map()

      const result = updateReceiptHashesByCycleMap(counter, receiptHash, existingMap)

      expect(result.has(50)).toBe(true)
      expect(result.get(50)?.networkReceiptHash).toBe('network-receipt-hash')
    })

    it('should convert receiptMapHashes Map to object', () => {
      const counter = 50
      const receiptHash = {
        receiptMapHashes: new Map([
          ['1', 'hash1'],
          ['2', 'hash2'],
        ]),
        networkReceiptHash: 'network-hash',
        counter: 50,
      } as P2P.SnapshotTypes.ReceiptHashes
      const existingMap = new Map()

      const result = updateReceiptHashesByCycleMap(counter, receiptHash, existingMap)

      const storedHash = result.get(50)
      expect(storedHash?.receiptMapHashes).toEqual({ '1': 'hash1', '2': 'hash2' })
    })
  })

  describe('updateSummaryHashesByCycleMap', () => {
    it('should add new summary hash to cycle map', () => {
      const counter = 50
      const summaryHashes = {
        summaryHashes: new Map([['1', 'summary-hash1']]),
        networkSummaryHash: 'network-summary-hash',
        counter: 50,
      } as P2P.SnapshotTypes.SummaryHashes
      const existingMap = new Map()

      const result = updateSummaryHashesByCycleMap(counter, summaryHashes, existingMap)

      expect(result.has(50)).toBe(true)
      expect(result.get(50)?.networkSummaryHash).toBe('network-summary-hash')
    })

    it('should convert summaryHashes Map to object', () => {
      const counter = 50
      const summaryHashes = {
        summaryHashes: new Map([
          ['1', 'hash1'],
          ['2', 'hash2'],
        ]),
        networkSummaryHash: 'network-hash',
        counter: 50,
      } as P2P.SnapshotTypes.SummaryHashes
      const existingMap = new Map()

      const result = updateSummaryHashesByCycleMap(counter, summaryHashes, existingMap)

      const storedHash = result.get(50)
      expect(storedHash?.summaryHashes).toEqual({ '1': 'hash1', '2': 'hash2' })
    })
  })

  describe('savePartitionAndNetworkHashes', () => {
    it('should save partition hashes and network hash to storage', async () => {
      const shard = { cycleNumber: 10 } as any
      const partitionHashes = new Map([
        [1, 'hash1'],
        [2, 'hash2'],
      ])
      const networkHash = 'network-hash'

      await savePartitionAndNetworkHashes(shard, partitionHashes, networkHash)

      expect(mockContext.storage.addPartitionHash).toHaveBeenCalledTimes(2)
      expect(mockContext.storage.addPartitionHash).toHaveBeenCalledWith({
        partitionId: 1,
        cycleNumber: 10,
        hash: 'hash1',
      })
      expect(mockContext.storage.addPartitionHash).toHaveBeenCalledWith({
        partitionId: 2,
        cycleNumber: 10,
        hash: 'hash2',
      })
      expect(mockContext.storage.addNetworkState).toHaveBeenCalledWith({
        cycleNumber: 10,
        hash: 'network-hash',
      })
    })

    it('should handle empty partition hashes', async () => {
      const shard = { cycleNumber: 10 } as any
      const partitionHashes = new Map()
      const networkHash = 'network-hash'

      await savePartitionAndNetworkHashes(shard, partitionHashes, networkHash)

      expect(mockContext.storage.addPartitionHash).not.toHaveBeenCalled()
      expect(mockContext.storage.addNetworkState).toHaveBeenCalledWith({
        cycleNumber: 10,
        hash: 'network-hash',
      })
    })
  })

  describe('saveReceiptAndNetworkHashes', () => {
    it('should save receipt hashes and network receipt hash to storage', async () => {
      const shard = { cycleNumber: 10 } as any
      const receiptMapHashes = new Map([
        [1, 'receipt-hash1'],
        [2, 'receipt-hash2'],
      ])
      const networkReceiptHash = 'network-receipt-hash'

      await saveReceiptAndNetworkHashes(shard, receiptMapHashes, networkReceiptHash)

      expect(mockContext.storage.addReceiptMapHash).toHaveBeenCalledTimes(2)
      expect(mockContext.storage.addNetworkReceipt).toHaveBeenCalledWith({
        cycleNumber: 10,
        hash: 'network-receipt-hash',
      })
    })
  })

  describe('saveSummaryAndNetworkHashes', () => {
    it('should save summary hashes and network summary hash to storage', async () => {
      const shard = { cycleNumber: 10 } as any
      const summaryHashes = new Map([
        [1, 'summary-hash1'],
        [2, 'summary-hash2'],
      ])
      const summaryReceiptHash = 'network-summary-hash'

      await saveSummaryAndNetworkHashes(shard, summaryHashes, summaryReceiptHash)

      expect(mockContext.storage.addSummaryHash).toHaveBeenCalledTimes(2)
      expect(mockContext.storage.addNetworkSummary).toHaveBeenCalledWith({
        cycleNumber: 10,
        hash: 'network-summary-hash',
      })
    })
  })

  describe('readOldCycleRecord', () => {
    it('should return first old cycle record when available', async () => {
      const mockCycleRecord = { counter: 10, timestamp: 123456 }
      ;(mockContext.storage.listOldCycles as jest.Mock).mockResolvedValue([mockCycleRecord])

      const result = await readOldCycleRecord()

      expect(result).toBe(mockCycleRecord)
      expect(mockContext.storage.listOldCycles).toHaveBeenCalledTimes(1)
    })

    it('should return undefined when no old cycles exist', async () => {
      ;(mockContext.storage.listOldCycles as jest.Mock).mockResolvedValue([])

      const result = await readOldCycleRecord()

      expect(result).toBeUndefined()
    })

    it('should return undefined when old cycles is null', async () => {
      ;(mockContext.storage.listOldCycles as jest.Mock).mockResolvedValue(null)

      const result = await readOldCycleRecord()

      expect(result).toBeUndefined()
    })
  })

  describe('readOldNetworkHash', () => {
    it('should return first network hash when available', async () => {
      const mockNetworkHash = { hash: 'old-network-hash' }
      ;(mockContext.storage.getLastOldNetworkHash as jest.Mock).mockResolvedValue([mockNetworkHash])

      const result = await readOldNetworkHash()

      expect(result).toBe(mockNetworkHash)
    })

    it('should return undefined when no network hash exists', async () => {
      ;(mockContext.storage.getLastOldNetworkHash as jest.Mock).mockResolvedValue([])

      const result = await readOldNetworkHash()

      expect(result).toBeUndefined()
    })

    it('should handle storage errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      ;(mockContext.storage.getLastOldNetworkHash as jest.Mock).mockRejectedValue(new Error('Storage error'))

      const result = await readOldNetworkHash()

      expect(result).toBeUndefined()
      consoleSpy.mockRestore()
    })
  })

  describe('readOldPartitionHashes', () => {
    it('should return partition hashes when available', async () => {
      const mockPartitionHashes = [
        { hash: 'hash1', partitionId: '1' },
        { hash: 'hash2', partitionId: '2' },
      ]
      ;(mockContext.storage.getLastOldPartitionHashes as jest.Mock).mockResolvedValue(mockPartitionHashes)

      const result = await readOldPartitionHashes()

      expect(result).toBe(mockPartitionHashes)
    })

    it('should handle storage errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      ;(mockContext.storage.getLastOldPartitionHashes as jest.Mock).mockRejectedValue(new Error('Storage error'))

      const result = await readOldPartitionHashes()

      expect(result).toBeUndefined()
      consoleSpy.mockRestore()
    })
  })

  describe('calculateOldDataMap', () => {
    const mockShardGlobals = {
      numPartitions: 100,
    } as StateManager.shardFunctionTypes.ShardGlobals

    const mockNodeShardDataMap = new Map()
    const mockOldPartitionHashMap = new Map([
      [1, 'hash1'],
      [-1, 'global-hash'],
    ])
    const lastSnapshotCycle = 10

    beforeEach(() => {
      mockNodeList.byIdOrder = [{ id: 'node1', cycleJoined: 1 }] as any
      mockShardFunctions.computePartitionShardDataMap = jest.fn()
      mockShardFunctions.computeNodePartitionDataMap = jest.fn()

      // Mock partition shard data map
      const mockPartitionShardDataMap = new Map([
        [
          1,
          {
            homeRange: {
              low: 'low1',
              high: 'high1',
              partition: 1,
              p_low: 1,
              p_high: 2,
              partitionEnd: 2,
              startAddr: 1,
              endAddr: 2,
            },
          },
        ],
      ])
      mockShardFunctions.computePartitionShardDataMap.mockImplementation((globals, map) => {
        map.set(1, {
          homeRange: {
            low: 'low1',
            high: 'high1',
            partition: 1,
            p_low: 1,
            p_high: 2,
            partitionEnd: 2,
            startAddr: 1,
            endAddr: 2,
          },
        } as any)
      })
    })

    it('should return old data map with matching hashes', async () => {
      const mockAccountCopies = [{ accountId: 'acc1', data: {}, timestamp: 123, hash: 'acc-hash1', isGlobal: false }]
      const mockGlobalAccounts = [
        { accountId: 'global1', data: {}, timestamp: 123, hash: 'global-hash1', isGlobal: true },
      ]

      ;(mockContext.storage.getOldAccountCopiesByCycleAndRange as jest.Mock).mockResolvedValue(mockAccountCopies)
      ;(mockContext.storage.getOldGlobalAccountCopies as jest.Mock).mockResolvedValue(mockGlobalAccounts)
      ;(mockContext.crypto.hash as jest.Mock).mockReturnValueOnce('hash1').mockReturnValueOnce('global-hash')

      const result = await calculateOldDataMap(
        mockShardGlobals,
        mockNodeShardDataMap,
        mockOldPartitionHashMap,
        lastSnapshotCycle
      )

      expect(result.has(1)).toBe(true)
      expect(result.has(-1)).toBe(true)
      expect(result.get(1)).toBe(mockAccountCopies)
      expect(result.get(-1)).toBe(mockGlobalAccounts)
    })

    it('should exclude data with mismatched hashes', async () => {
      const mockAccountCopies = [{ accountId: 'acc1', data: {}, timestamp: 123, hash: 'acc-hash1', isGlobal: false }]

      ;(mockContext.storage.getOldAccountCopiesByCycleAndRange as jest.Mock).mockResolvedValue(mockAccountCopies)
      ;(mockContext.crypto.hash as jest.Mock).mockReturnValue('different-hash')

      const result = await calculateOldDataMap(
        mockShardGlobals,
        mockNodeShardDataMap,
        mockOldPartitionHashMap,
        lastSnapshotCycle
      )

      expect(result.has(1)).toBe(false)
    })

    it('should handle storage errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      ;(mockContext.storage.getOldAccountCopiesByCycleAndRange as jest.Mock).mockRejectedValue(
        new Error('Storage error')
      )

      const result = await calculateOldDataMap(
        mockShardGlobals,
        mockNodeShardDataMap,
        mockOldPartitionHashMap,
        lastSnapshotCycle
      )

      expect(result.size).toBe(0)
      consoleSpy.mockRestore()
    })
  })

  describe('copyOldDataToDataToMigrate', () => {
    it('should copy data from oldDataMap to dataToMigrate for missing keys', () => {
      const oldDataMap = new Map([
        [1, [{ accountId: 'acc1', cycleNumber: 1, data: {}, timestamp: 123, hash: 'hash1', isGlobal: false }]],
        [2, [{ accountId: 'acc2', cycleNumber: 1, data: {}, timestamp: 123, hash: 'hash2', isGlobal: false }]],
        [3, [{ accountId: 'acc3', cycleNumber: 1, data: {}, timestamp: 123, hash: 'hash3', isGlobal: false }]],
      ])
      const dataToMigrate = new Map([
        [1, [{ accountId: 'existing-acc1', cycleNumber: 1, data: {}, timestamp: 123, hash: 'hash1', isGlobal: false }]],
      ])

      copyOldDataToDataToMigrate(oldDataMap, dataToMigrate)

      expect(dataToMigrate.size).toBe(3)
      expect(dataToMigrate.has(1)).toBe(true)
      expect(dataToMigrate.has(2)).toBe(true)
      expect(dataToMigrate.has(3)).toBe(true)
      expect(dataToMigrate.get(1)).toEqual([
        { accountId: 'existing-acc1', cycleNumber: 1, data: {}, timestamp: 123, hash: 'hash1', isGlobal: false },
      ]) // Should not overwrite
      expect(dataToMigrate.get(2)).toEqual([
        { accountId: 'acc2', cycleNumber: 1, data: {}, timestamp: 123, hash: 'hash2', isGlobal: false },
      ])
    })

    it('should handle empty oldDataMap', () => {
      const oldDataMap = new Map()
      const dataToMigrate = new Map([
        [1, [{ accountId: 'acc1', cycleNumber: 1, data: {}, timestamp: 123, hash: 'hash1', isGlobal: false }]],
      ])

      copyOldDataToDataToMigrate(oldDataMap, dataToMigrate)

      expect(dataToMigrate.size).toBe(1)
    })
  })

  describe('getMissingPartitions', () => {
    const mockShardGlobals = {
      numPartitions: 100,
    } as StateManager.shardFunctionTypes.ShardGlobals

    beforeEach(() => {
      mockSelf.id = 'node1'

      mockShardFunctions.addressToPartition.mockReturnValue({ homePartition: 10, addressNum: 123 })
      mockShardFunctions.calculateStoredPartitions2.mockReturnValue({
        partitionStart: 8,
        partitionEnd: 12,
      } as any)
    })

    it('should return missing partitions when partitionStart < partitionEnd', () => {
      const oldDataMap = new Map([
        [9, []],
        [11, []],
      ])

      const result = getMissingPartitions(mockShardGlobals, oldDataMap)

      expect(result).toContain(8)
      expect(result).toContain(10)
      expect(result).toContain(12)
      expect(result).toContain(-1) // global partition
      expect(result).not.toContain(9)
      expect(result).not.toContain(11)
    })

    it('should handle wrapped partitions when partitionStart > partitionEnd', () => {
      mockShardFunctions.calculateStoredPartitions2.mockReturnValue({
        partitionStart: 98,
        partitionEnd: 2,
      } as any)
      const oldDataMap = new Map([
        [99, []],
        [1, []],
      ])

      const result = getMissingPartitions(mockShardGlobals, oldDataMap)

      expect(result).toContain(98)
      expect(result).toContain(0)
      expect(result).toContain(2)
      expect(result).toContain(-1)
      expect(result).not.toContain(99)
      expect(result).not.toContain(1)
    })

    it('should always include global partition (-1) if missing', () => {
      const oldDataMap = new Map([
        [8, []],
        [9, []],
        [10, []],
        [11, []],
        [12, []],
      ])

      const result = getMissingPartitions(mockShardGlobals, oldDataMap)

      expect(result).toContain(-1)
    })

    it('should return empty array when all partitions are present', () => {
      const oldDataMap = new Map([
        [8, []],
        [9, []],
        [10, []],
        [11, []],
        [12, []],
        [-1, []],
      ])

      const result = getMissingPartitions(mockShardGlobals, oldDataMap)

      expect(result).toEqual([])
    })
  })

  describe('registerDownloadRoutes', () => {
    let mockNetwork: jest.Mocked<NetworkClass>
    let mockResponse: any

    beforeEach(() => {
      mockNetwork = {
        registerExternalGet: jest.fn(),
      } as any

      mockResponse = {
        set: jest.fn(),
        on: jest.fn(),
        end: jest.fn(),
      }

      Utils.safeStringify = jest.fn().mockReturnValue('{"stringified": "data"}')
    })

    it('should register download route with compressed data', () => {
      const oldDataMap = new Map([
        [1, [{ accountId: 'acc1', cycleNumber: 1, data: {}, timestamp: 123, hash: 'hash1', isGlobal: false }]],
        [2, [{ accountId: 'acc2', cycleNumber: 1, data: {}, timestamp: 123, hash: 'hash2', isGlobal: false }]],
      ])
      const oldPartitionHashMap = new Map([
        [1, 'hash1'],
        [2, 'hash2'],
      ])

      registerDownloadRoutes(mockNetwork, oldDataMap, oldPartitionHashMap)

      expect(mockNetwork.registerExternalGet).toHaveBeenCalledWith('download-snapshot-data', expect.any(Function))
    })

    it('should handle download request with streaming and compression', () => {
      const oldDataMap = new Map([
        [1, [{ accountId: 'acc1', cycleNumber: 1, data: {}, timestamp: 123, hash: 'hash1', isGlobal: false }]],
      ])
      const oldPartitionHashMap = new Map([[1, 'hash1']])

      const mockGzip = {
        pipe: jest.fn().mockImplementation(() => ({
          on: jest.fn((event, callback) => {
            if (event === 'end') {
              // Simulate the end event
              callback()
            }
          }),
        })),
        on: jest.fn(),
      }
      const mockReadableStream = {
        pipe: jest.fn().mockReturnValue(mockGzip),
        on: jest.fn(),
      }

      mockStream.Readable.from = jest.fn().mockReturnValue(mockReadableStream)
      mockZlib.createGzip = jest.fn().mockReturnValue(mockGzip)

      registerDownloadRoutes(mockNetwork, oldDataMap, oldPartitionHashMap)

      const routeHandler = mockNetwork.registerExternalGet.mock.calls[0][1]
      const mockNext = jest.fn()
      const mockRequest = {} as any
      routeHandler(mockRequest, mockResponse, mockNext)

      expect(mockResponse.set).toHaveBeenCalledWith('content-disposition', 'attachment; filename="snapshot-data"')
      expect(mockResponse.set).toHaveBeenCalledWith('content-type', 'application/gzip')
      expect(mockReadableStream.pipe).toHaveBeenCalledWith(mockGzip)
      expect(mockGzip.pipe).toHaveBeenCalledWith(mockResponse)
    })
  })

  describe('downloadDataFromNode', () => {
    const mockUrl = 'http://example.com/snapshot'

    beforeEach(() => {
      Utils.safeJsonParse = jest.fn()
    })

    it('should download and decompress data successfully', async () => {
      const mockResponseBody = Buffer.from('compressed-data')
      const mockDecompressedData = Buffer.from('{"data": "decompressed"}')
      const mockParsedData = { data: 'decompressed' }

      mockGot.mockResolvedValue({ body: mockResponseBody } as any)
      ;(mockZlib.unzip as any) = jest.fn().mockImplementation((data, callback) => {
        callback(null, mockDecompressedData)
      })
      Utils.safeJsonParse = jest.fn().mockReturnValue(mockParsedData)

      const result = await downloadDataFromNode(mockUrl)

      expect(mockGot).toHaveBeenCalledWith(mockUrl, {
        timeout: 1000,
        retry: 0,
        decompress: true,
        encoding: null,
        headers: {
          'Content-Encoding': 'gzip',
        },
      })
      expect(result).toBe(mockParsedData)
    })

    it('should handle decompression errors', async () => {
      const mockResponseBody = Buffer.from('compressed-data')
      mockGot.mockResolvedValue({ body: mockResponseBody } as any)
      ;(mockZlib.unzip as any) = jest.fn().mockImplementation((data, callback) => {
        callback(new Error('Decompression error'), null)
      })

      await expect(downloadDataFromNode(mockUrl)).rejects.toThrow('Decompression error')
    })

    it('should handle JSON parsing errors gracefully', async () => {
      const mockResponseBody = Buffer.from('compressed-data')
      const mockDecompressedData = Buffer.from('invalid-json')

      mockGot.mockResolvedValue({ body: mockResponseBody } as any)
      ;(mockZlib.unzip as any) = jest.fn().mockImplementation((data, callback) => {
        callback(null, mockDecompressedData)
      })
      Utils.safeJsonParse = jest.fn().mockImplementation(() => {
        throw new Error('Invalid JSON')
      })

      const result = await downloadDataFromNode(mockUrl)

      expect(result).toBeNull()
    })
  })

  describe('convertMapToObj', () => {
    it('should convert Map to plain object', () => {
      const inputMap = new Map<string | number, string>([
        ['key1', 'value1'],
        ['key2', 'value2'],
        [3, 'value3'],
      ])

      const result = convertMapToObj(inputMap)

      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2',
        3: 'value3',
      })
    })

    it('should return input object if not a Map', () => {
      const inputObj = { key1: 'value1', key2: 'value2' }

      const result = convertMapToObj(inputObj)

      expect(result).toBe(inputObj)
    })

    it('should handle empty Map', () => {
      const inputMap = new Map()

      const result = convertMapToObj(inputMap)

      expect(result).toEqual({})
    })

    it('should handle Map with various key types', () => {
      const inputMap = new Map<string | number | symbol, string>([
        [Symbol('sym'), 'symbol-value'],
        [1, 'number-value'],
        ['string', 'string-value'],
      ])

      const result = convertMapToObj(inputMap)

      expect(result).toHaveProperty('1', 'number-value')
      expect(result).toHaveProperty('string', 'string-value')
    })
  })
})
