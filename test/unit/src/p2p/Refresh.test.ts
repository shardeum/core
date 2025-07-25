import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { P2P } from '@shardeum-foundation/lib-types'
import * as Refresh from '../../../../src/p2p/Refresh'

// Mock dependencies
jest.mock('../../../../src/utils', () => ({
  propComparator2: jest.fn((prop1: string, prop2: string) => (a: any, b: any) => {
    if (a[prop1] !== b[prop1]) return a[prop1] - b[prop1]
    return a[prop2] < b[prop2] ? -1 : a[prop2] > b[prop2] ? 1 : 0
  }),
  reversed: jest.fn((arr: any[]) => [...arr].reverse()),
  validateTypes: jest.fn(),
}))

jest.mock('../../../../src/p2p/Archivers', () => ({
  getRefreshedArchivers: jest.fn(),
  archivers: new Map(),
}))

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

jest.mock('../../../../src/p2p/Context', () => ({
  logger: {
    getLogger: jest.fn(() => mockLogger),
  },
  config: {
    p2p: {
      useSyncProtocolV2: false,
      extraCyclesToKeepMultiplier: 2,
      extraCyclesToKeep: 5,
    },
  },
}))

jest.mock('../../../../src/p2p/CycleChain', () => ({
  cycles: [],
  newest: {
    counter: 1,
    totalArchivers: 3,
    totalStandbyArchivers: 1,
    totalSyncing: 2,
    totalValidators: 10,
  },
}))

jest.mock('../../../../src/p2p/NodeList', () => ({
  nodes: new Map(),
  activeByIdOrder: [],
}))

jest.mock('../../../../src/p2p/Sync', () => ({
  totalNodeCount: jest.fn(() => 10),
}))

jest.mock('deepmerge', () => jest.fn((target: any, source: any) => ({ ...target, ...source })))

const { validateTypes, reversed } = require('../../../../src/utils')
const { getRefreshedArchivers } = require('../../../../src/p2p/Archivers')
const NodeList = require('../../../../src/p2p/NodeList')
const { cycles, newest } = require('../../../../src/p2p/CycleChain')
const { totalNodeCount } = require('../../../../src/p2p/Sync')
const Context = require('../../../../src/p2p/Context')

describe('Refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    NodeList.activeByIdOrder.length = 0
    cycles.length = 0
  })

  describe('init', () => {
    it('should initialize logger and reset state', () => {
      Refresh.init()
      expect(Context.logger.getLogger).toHaveBeenCalledWith('p2p')
    })
  })

  describe('reset', () => {
    it('should reset without errors', () => {
      expect(() => Refresh.reset()).not.toThrow()
    })
  })

  describe('getTxs', () => {
    it('should return empty txs object', () => {
      const result = Refresh.getTxs()
      expect(result).toEqual({})
    })
  })

  describe('validateRecordTypes', () => {
    it('should return empty string for valid record', () => {
      validateTypes.mockReturnValue('')

      const validRecord = {
        refreshedArchivers: [{ publicKey: 'key1', ip: '127.0.0.1', port: 9001, curvePk: 'curve1' }],
        refreshedConsensors: [
          {
            activeTimestamp: 1234567890,
            address: 'addr1',
            externalIp: '127.0.0.1',
            externalPort: 9001,
            internalIp: '192.168.1.1',
            internalPort: 9002,
            joinRequestTimestamp: 1234567890,
            publicKey: 'key1',
            cycleJoined: 'cycle1',
            counterRefreshed: 1,
            id: 'node1',
            curvePublicKey: 'curveKey1',
            status: 'active',
            activeCycle: 'cycle1',
            syncingTimestamp: 1234567890,
            readyTimestamp: 1234567890,
          },
        ],
      } as any

      const result = Refresh.validateRecordTypes(validRecord)
      expect(result).toBe('')
    })

    it('should return error for invalid record structure', () => {
      validateTypes.mockReturnValue('missing field')

      const invalidRecord = {
        refreshedArchivers: [],
        refreshedConsensors: [],
      } as any

      const result = Refresh.validateRecordTypes(invalidRecord)
      expect(result).toBe('missing field')
    })

    it('should return error for invalid archiver in array', () => {
      validateTypes
        .mockReturnValueOnce('') // For main record
        .mockReturnValueOnce('missing ip field') // For archiver

      const recordWithInvalidArchiver = {
        refreshedArchivers: [{ publicKey: 'key1' }],
        refreshedConsensors: [],
      } as any

      const result = Refresh.validateRecordTypes(recordWithInvalidArchiver)
      expect(result).toBe('in refreshedArchivers array missing ip field')
    })

    it('should return error for invalid consensor in array', () => {
      validateTypes
        .mockReturnValueOnce('') // For main record
        .mockReturnValueOnce('missing activeTimestamp field') // For consensor

      const recordWithInvalidConsentor = {
        refreshedArchivers: [],
        refreshedConsensors: [{ publicKey: 'key1' }],
      } as any

      const result = Refresh.validateRecordTypes(recordWithInvalidConsentor)
      expect(result).toBe('in joinedConsensors array missing activeTimestamp field')
    })
  })

  describe('dropInvalidTxs', () => {
    it('should return the same txs object', () => {
      const txs = { tx1: 'data1', tx2: 'data2' }
      const result = Refresh.dropInvalidTxs(txs)
      expect(result).toBe(txs)
    })
  })

  describe('updateRecord', () => {
    it('should update record with empty arrays when using sync protocol v2', () => {
      Context.config.p2p.useSyncProtocolV2 = true

      const record = {} as any
      const txs = {}
      const prev = {} as any

      Refresh.updateRecord(txs, record, prev)

      expect(record.refreshedArchivers).toEqual([])
      expect(record.refreshedConsensors).toEqual([])
    })

    it('should update record with refreshed data when not using sync protocol v2', () => {
      Context.config.p2p.useSyncProtocolV2 = false
      getRefreshedArchivers.mockReturnValue([{ publicKey: 'arch1' }])
      NodeList.activeByIdOrder = [
        { id: 'node1', counterRefreshed: 0 },
        { id: 'node2', counterRefreshed: 1 },
      ]

      const record = {} as any
      const txs = {}
      const prev = {} as any

      Refresh.updateRecord(txs, record, prev)

      expect(getRefreshedArchivers).toHaveBeenCalledWith(record)
      expect(record.refreshedArchivers).toEqual([{ publicKey: 'arch1' }])
      expect(record.refreshedConsensors).toBeDefined()
    })
  })

  describe('parseRecord', () => {
    it('should return empty changes when using sync protocol v2', () => {
      Context.config.p2p.useSyncProtocolV2 = true

      const record = {
        refreshedArchivers: [],
        refreshedConsensors: [],
      } as any

      const result = Refresh.parseRecord(record)

      expect(result).toEqual({
        added: [],
        removed: [],
        updated: [],
      })
    })

    it('should process refreshed archivers when not using sync protocol v2', () => {
      Context.config.p2p.useSyncProtocolV2 = false
      const mockArchivers = require('../../../../src/p2p/Archivers')
      mockArchivers.archivers.clear()

      const record = {
        counter: 1,
        refreshedArchivers: [{ publicKey: 'arch1' }],
        refreshedConsensors: [],
      } as any

      Refresh.parseRecord(record)

      expect(mockArchivers.archivers.has('arch1')).toBe(true)
    })

    it('should add new consensor when not in node list', () => {
      Context.config.p2p.useSyncProtocolV2 = false
      NodeList.nodes.clear()

      const record = {
        counter: 2,
        refreshedArchivers: [],
        refreshedConsensors: [{ id: 'node1', publicKey: 'key1' }],
      } as any

      const result = Refresh.parseRecord(record)

      expect(result.added).toHaveLength(1)
      expect(result.added[0]).toEqual({ id: 'node1', publicKey: 'key1' })
      expect(result.updated).toHaveLength(1)
      expect(result.updated[0]).toEqual({
        id: 'node1',
        status: P2P.P2PTypes.NodeStatus.ACTIVE,
        counterRefreshed: 2,
      })
    })

    it('should update existing consensor when counter is greater', () => {
      Context.config.p2p.useSyncProtocolV2 = false
      NodeList.nodes.clear()
      NodeList.nodes.set('node1', { id: 'node1', counterRefreshed: 1 })

      const record = {
        counter: 2,
        refreshedArchivers: [],
        refreshedConsensors: [{ id: 'node1', publicKey: 'key1' }],
      } as any

      const result = Refresh.parseRecord(record)

      expect(result.added).toHaveLength(0)
      expect(result.updated).toHaveLength(1)
      expect(result.updated[0]).toEqual({
        id: 'node1',
        counterRefreshed: 2,
      })
    })

    it('should not update existing consensor when counter is not greater', () => {
      Context.config.p2p.useSyncProtocolV2 = false
      NodeList.nodes.clear()
      NodeList.nodes.set('node1', { id: 'node1', counterRefreshed: 2 })

      const record = {
        counter: 1,
        refreshedArchivers: [],
        refreshedConsensors: [{ id: 'node1', publicKey: 'key1' }],
      } as any

      const result = Refresh.parseRecord(record)

      expect(result.added).toHaveLength(0)
      expect(result.updated).toHaveLength(0)
    })
  })

  describe('queueRequest', () => {
    it('should execute without errors', () => {
      expect(() => Refresh.queueRequest({})).not.toThrow()
    })
  })

  describe('sendRequests', () => {
    it('should execute without errors', () => {
      expect(() => Refresh.sendRequests()).not.toThrow()
    })
  })

  describe('getRefreshCount', () => {
    it('should return floor of square root of active node count', () => {
      NodeList.activeByIdOrder.length = 16

      const result = Refresh.getRefreshCount()

      expect(result).toBe(4) // Math.floor(Math.sqrt(16))
    })

    it('should return 0 for empty active node list', () => {
      NodeList.activeByIdOrder.length = 0

      const result = Refresh.getRefreshCount()

      expect(result).toBe(0)
    })

    it('should handle non-perfect squares', () => {
      NodeList.activeByIdOrder.length = 10

      const result = Refresh.getRefreshCount()

      expect(result).toBe(3) // Math.floor(Math.sqrt(10))
    })
  })

  // Note: cyclesToKeep() tests are complex due to internal logging dependencies
  // This function could be tested in integration tests or with more advanced mocking
})
