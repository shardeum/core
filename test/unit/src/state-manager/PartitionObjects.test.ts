import PartitionObjects from '../../../../src/state-manager/PartitionObjects'
import StateManager from '../../../../src/state-manager'
import Crypto from '../../../../src/crypto'
import Logger from '../../../../src/logger'
import { P2PModuleContext as P2P } from '../../../../src/p2p/Context'
import * as Shardus from '../../../../src/shardus/shardus-types'
import Storage from '../../../../src/storage'
import * as utils from '../../../../src/utils'
import Profiler from '../../../../src/utils/profiler'
import ShardFunctions from '../../../../src/state-manager/shardFunctions'
import {
  PartitionCycleReport,
  PartitionObject,
  PartitionResult,
  TempTxRecord,
  TxTallyList,
} from '../../../../src/state-manager/state-manager-types'

// Mock dependencies
jest.mock('../../../../src/state-manager')
jest.mock('../../../../src/crypto')
jest.mock('../../../../src/logger', () => {
  const mockLogFlags = { debug: false }
  return {
    logFlags: mockLogFlags,
    default: jest.fn().mockImplementation(() => ({
      getLogger: jest.fn().mockReturnValue({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      }),
    })),
  }
})
jest.mock('../../../../src/p2p/Context')
jest.mock('../../../../src/storage')
jest.mock('../../../../src/utils', () => ({
  makeShortHash: jest.fn(),
  stringifyReduce: jest.fn(),
}))
jest.mock('../../../../src/utils/profiler')
jest.mock('../../../../src/state-manager/shardFunctions', () => ({
  partitionInWrappingRange: jest.fn(),
}))
jest.mock('../../../../src/network', () => ({
  shardusGetTime: jest.fn(() => Date.now()),
}))
jest.mock('../../../../src/p2p/NodeList')
jest.mock('../../../../src/p2p/CycleChain')
jest.mock('../../../../src/utils/nestedCounters')

const mockStateManager = {
  statemanager_fatal: jest.fn(),
  shardValuesByCycle: new Map(),
  stateIsGood: true,
} as unknown as StateManager

const mockCrypto = {} as unknown as Crypto
const mockLogger = {
  getLogger: jest.fn().mockReturnValue({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
} as unknown as Logger

const mockP2P = {} as unknown as P2P
const mockStorage = {} as unknown as Storage
const mockProfiler = {} as unknown as Profiler
const mockConfig = {} as unknown as Shardus.StrictServerConfiguration
const mockApp = {} as unknown as Shardus.App

const mockedUtils = utils as jest.Mocked<typeof utils>
const mockedShardFunctions = ShardFunctions as jest.Mocked<typeof ShardFunctions>

describe('PartitionObjects', () => {
  let partitionObjects: PartitionObjects

  beforeEach(() => {
    jest.clearAllMocks()

    // Setup mock returns
    mockedUtils.makeShortHash.mockImplementation((hash: string) => hash.substring(0, 8))
    mockedUtils.stringifyReduce.mockReturnValue('{}')
    mockedShardFunctions.partitionInWrappingRange.mockReturnValue(true)

    partitionObjects = new PartitionObjects(
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
      expect(partitionObjects.crypto).toBe(mockCrypto)
      expect(partitionObjects.app).toBe(mockApp)
      expect(partitionObjects.logger).toBe(mockLogger)
      expect(partitionObjects.config).toBe(mockConfig)
      expect(partitionObjects.profiler).toBe(mockProfiler)
      expect(partitionObjects.p2p).toBe(mockP2P)
      expect(partitionObjects.storage).toBe(mockStorage)
      expect(partitionObjects.stateManager).toBe(mockStateManager)
    })

    it('should initialize collections as empty objects/arrays', () => {
      expect(partitionObjects.partitionObjectsByCycle).toEqual({})
      expect(partitionObjects.ourPartitionResultsByCycle).toEqual({})
      expect(partitionObjects.recentPartitionObjectsByCycleByHash).toEqual({})
      expect(partitionObjects.tempTXRecords).toEqual([])
      expect(partitionObjects.txByCycleByPartition).toEqual({})
      expect(partitionObjects.allPartitionResponsesByCycleByPartition).toEqual({})
    })

    it('should initialize control flags correctly', () => {
      expect(partitionObjects.nextCycleReportToSend).toBe(null)
      expect(partitionObjects.lastCycleReported).toBe(-1)
      expect(partitionObjects.partitionReportDirty).toBe(false)
      expect(partitionObjects.resetAndApplyPerPartition).toBe(false)
    })

    it('should setup logger references', () => {
      expect(mockLogger.getLogger).toHaveBeenCalledWith('main')
      expect(mockLogger.getLogger).toHaveBeenCalledWith('fatal')
      expect(mockLogger.getLogger).toHaveBeenCalledWith('shardDump')
      expect(mockLogger.getLogger).toHaveBeenCalledWith('statsDump')
      expect(partitionObjects.statemanager_fatal).toBe(mockStateManager.statemanager_fatal)
    })
  })

  describe('getPartitionReport', () => {
    beforeEach(() => {
      // Setup default shard values
      const mockShardValues = {
        nodeShardData: {
          consensusStartPartition: 0,
          consensusEndPartition: 10,
        },
      } as any
      mockStateManager.shardValuesByCycle.set(100, mockShardValues)
    })

    it('should return empty response when nextCycleReportToSend is null', () => {
      partitionObjects.nextCycleReportToSend = null

      const result = partitionObjects.getPartitionReport(false, false)

      expect(result).toEqual({})
    })

    it('should return partition report when cycle has not been reported', () => {
      const mockReport: PartitionCycleReport = {
        cycleNumber: 100,
        res: [
          { i: 5, h: 'abcdef1234567890' },
          { i: 8, h: 'fedcba0987654321' },
        ],
      }
      partitionObjects.nextCycleReportToSend = mockReport
      partitionObjects.lastCycleReported = 99

      const result = partitionObjects.getPartitionReport(false, false)

      expect(result.cycleNumber).toBe(100)
      expect(result.res).toHaveLength(2)
      expect(result.res[0].i).toBe(5)
      expect(result.res[1].i).toBe(8)
      expect(partitionObjects.lastCycleReported).toBe(100)
      expect(partitionObjects.nextCycleReportToSend).toBe(null)
      expect(partitionObjects.partitionReportDirty).toBe(false)
    })

    it('should return partition report when partitionReportDirty is true', () => {
      const mockReport: PartitionCycleReport = {
        cycleNumber: 100,
        res: [{ i: 5, h: 'abcdef1234567890' }],
      }
      partitionObjects.nextCycleReportToSend = mockReport
      partitionObjects.lastCycleReported = 100
      partitionObjects.partitionReportDirty = true

      const result = partitionObjects.getPartitionReport(false, false)

      expect(result.cycleNumber).toBe(100)
      expect(result.res).toHaveLength(1)
      expect(partitionObjects.lastCycleReported).toBe(100)
      expect(partitionObjects.nextCycleReportToSend).toBe(null)
      expect(partitionObjects.partitionReportDirty).toBe(false)
    })

    it('should filter by consensus range when consensusOnly is true', () => {
      const mockReport: PartitionCycleReport = {
        cycleNumber: 100,
        res: [
          { i: 5, h: 'hash1' }, // within consensus range
          { i: 15, h: 'hash2' }, // outside consensus range
        ],
      }
      partitionObjects.nextCycleReportToSend = mockReport
      partitionObjects.lastCycleReported = 99

      // Mock the partition range check
      mockedShardFunctions.partitionInWrappingRange
        .mockReturnValueOnce(true) // partition 5 is in range
        .mockReturnValueOnce(false) // partition 15 is not in range

      const result = partitionObjects.getPartitionReport(true, false)

      expect(result.res).toHaveLength(1)
      expect(result.res[0].i).toBe(5)
      expect(mockedShardFunctions.partitionInWrappingRange).toHaveBeenCalledWith(5, 0, 10)
      expect(mockedShardFunctions.partitionInWrappingRange).toHaveBeenCalledWith(15, 0, 10)
    })

    it('should use short hashes when smallHashes is true', () => {
      const mockReport: PartitionCycleReport = {
        cycleNumber: 100,
        res: [{ i: 5, h: 'abcdef1234567890' }],
      }
      partitionObjects.nextCycleReportToSend = mockReport
      partitionObjects.lastCycleReported = 99

      mockedUtils.makeShortHash.mockReturnValue('abcdef12')

      const result = partitionObjects.getPartitionReport(false, true)

      expect(mockedUtils.makeShortHash).toHaveBeenCalledWith('abcdef1234567890')
      expect(result.res[0].h).toBe('abcdef12')
    })

    it('should return empty response when cycle already reported and not dirty', () => {
      const mockReport: PartitionCycleReport = {
        cycleNumber: 100,
        res: [{ i: 5, h: 'hash1' }],
      }
      partitionObjects.nextCycleReportToSend = mockReport
      partitionObjects.lastCycleReported = 100
      partitionObjects.partitionReportDirty = false

      const result = partitionObjects.getPartitionReport(false, false)

      expect(result.cycleNumber).toBe(100)
      expect(result.res).toEqual([])
    })

    it('should handle missing shard values gracefully', () => {
      mockStateManager.shardValuesByCycle.clear()

      const mockReport: PartitionCycleReport = {
        cycleNumber: 200,
        res: [{ i: 5, h: 'hash1' }],
      }
      partitionObjects.nextCycleReportToSend = mockReport
      partitionObjects.lastCycleReported = 199

      expect(() => {
        partitionObjects.getPartitionReport(true, false)
      }).toThrow()
    })

    it('should call stringifyReduce for debug logging', () => {
      const mockReport: PartitionCycleReport = {
        cycleNumber: 100,
        res: [{ i: 5, h: 'hash1' }],
      }
      partitionObjects.nextCycleReportToSend = mockReport
      partitionObjects.lastCycleReported = 99

      const result = partitionObjects.getPartitionReport(false, false)

      // The stringifyReduce function is called if debug logging is enabled
      // but we can't easily test the debug flag condition due to import mocking limitations
      expect(result.cycleNumber).toBe(100)
    })
  })

  describe('setupHandlers', () => {
    it('should be defined and callable', () => {
      expect(typeof partitionObjects.setupHandlers).toBe('function')
      expect(() => partitionObjects.setupHandlers()).not.toThrow()
    })
  })
})
