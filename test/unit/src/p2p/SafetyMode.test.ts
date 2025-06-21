import * as SafetyMode from '../../../../src/p2p/SafetyMode'
import { P2P } from '@shardeum-foundation/lib-types'

jest.mock('../../../../src/snapshot', () => ({
  safetyModeVals: {
    safetyMode: true,
    safetyNum: 10,
    networkStateHash: 'test-hash'
  },
  getStateHashes: jest.fn(),
  getReceiptHashes: jest.fn(),
  getSummaryHashes: jest.fn()
}))

jest.mock('../../../../src/p2p/Comms', () => ({
  registerInternal: jest.fn(),
  registerGossipHandler: jest.fn()
}))

jest.mock('../../../../src/p2p/Context', () => ({
  logger: {
    getLogger: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}))

jest.mock('../../../../src/p2p/Self', () => ({
  isFirst: false
}))

const mockSnapshot = require('../../../../src/snapshot')
const mockSelf = require('../../../../src/p2p/Self')

describe('SafetyMode', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSnapshot.getStateHashes.mockReturnValue([])
    mockSnapshot.getReceiptHashes.mockReturnValue([])
    mockSnapshot.getSummaryHashes.mockReturnValue([])
    mockSelf.isFirst = false
  })

  describe('init', () => {
    it('should initialize logger and reset state', () => {
      SafetyMode.init()
      expect(mockSnapshot.getStateHashes).toHaveBeenCalledTimes(0)
    })
  })

  describe('reset', () => {
    it('should reset without errors', () => {
      expect(() => SafetyMode.reset()).not.toThrow()
    })
  })

  describe('getTxs', () => {
    it('should return undefined', () => {
      const result = SafetyMode.getTxs()
      expect(result).toBeUndefined()
    })
  })

  describe('dropInvalidTxs', () => {
    it('should return undefined for any input', () => {
      const mockTxs = {} as P2P.SafetyModeTypes.Txs
      const result = SafetyMode.dropInvalidTxs(mockTxs)
      expect(result).toBeUndefined()
    })

    it('should handle null input', () => {
      const result = SafetyMode.dropInvalidTxs(null as any)
      expect(result).toBeUndefined()
    })
  })

  describe('updateRecord', () => {
    const mockTxs = {} as P2P.SafetyModeTypes.Txs
    let mockRecord: P2P.CycleCreatorTypes.CycleRecord
    let mockPrev: P2P.CycleCreatorTypes.CycleRecord

    beforeEach(() => {
      mockRecord = {
        safetyMode: false,
        safetyNum: 0,
        networkStateHash: '',
        networkDataHash: [],
        networkReceiptHash: [],
        networkSummaryHash: [],
        active: 0
      } as P2P.CycleCreatorTypes.CycleRecord

      mockPrev = {
        safetyMode: true,
        safetyNum: 10,
        networkStateHash: 'prev-hash',
        active: 5
      } as P2P.CycleCreatorTypes.CycleRecord
    })

    it('should use snapshot values for first node', () => {
      mockSelf.isFirst = true
      
      SafetyMode.updateRecord(mockTxs, mockRecord, mockPrev)
      
      expect(mockRecord.safetyMode).toBe(true)
      expect(mockRecord.safetyNum).toBe(10)
      expect(mockRecord.networkStateHash).toBe('test-hash')
    })

    it('should copy values from previous record for non-first node', () => {
      mockSelf.isFirst = false
      
      SafetyMode.updateRecord(mockTxs, mockRecord, mockPrev)
      
      expect(mockRecord.safetyMode).toBe(true)
      expect(mockRecord.safetyNum).toBe(10)
      expect(mockRecord.networkStateHash).toBe('prev-hash')
    })

    it('should handle null previous record', () => {
      mockSelf.isFirst = false
      
      expect(() => SafetyMode.updateRecord(mockTxs, mockRecord, null)).not.toThrow()
    })

    it('should turn off safety mode when active nodes >= safety number', () => {
      mockPrev.safetyMode = true
      mockPrev.active = 10
      mockPrev.safetyNum = 10
      mockSelf.isFirst = false
      
      SafetyMode.updateRecord(mockTxs, mockRecord, mockPrev)
      
      expect(mockRecord.safetyMode).toBe(false)
    })

    it('should keep safety mode on when active nodes < safety number', () => {
      mockPrev.safetyMode = true
      mockPrev.active = 5
      mockPrev.safetyNum = 10
      mockSelf.isFirst = false
      
      SafetyMode.updateRecord(mockTxs, mockRecord, mockPrev)
      
      expect(mockRecord.safetyMode).toBe(true)
    })

    it('should not change safety mode if already off', () => {
      mockPrev.safetyMode = false
      mockPrev.active = 15
      mockPrev.safetyNum = 10
      mockSelf.isFirst = false
      
      SafetyMode.updateRecord(mockTxs, mockRecord, mockPrev)
      
      expect(mockRecord.safetyMode).toBe(false)
    })

    it('should set empty network data hash when no state hashes', () => {
      mockSnapshot.getStateHashes.mockReturnValue([])
      
      SafetyMode.updateRecord(mockTxs, mockRecord, mockPrev)
      
      expect(mockRecord.networkDataHash).toEqual([])
    })

    it('should set network data hash when state hashes exist', () => {
      const mockStateHashes = [
        { counter: 1, networkHash: 'hash1' },
        { counter: 2, networkHash: 'hash2' }
      ]
      mockSnapshot.getStateHashes.mockReturnValue(mockStateHashes)
      
      SafetyMode.updateRecord(mockTxs, mockRecord, mockPrev)
      
      expect(mockRecord.networkDataHash).toEqual([
        { cycle: 1, hash: 'hash1' },
        { cycle: 2, hash: 'hash2' }
      ])
    })

    it('should set empty network receipt hash when no receipt hashes', () => {
      mockSnapshot.getReceiptHashes.mockReturnValue([])
      
      SafetyMode.updateRecord(mockTxs, mockRecord, mockPrev)
      
      expect(mockRecord.networkReceiptHash).toEqual([])
    })

    it('should set network receipt hash when receipt hashes exist', () => {
      const mockReceiptHashes = [
        { counter: 1, networkReceiptHash: 'receipt1' },
        { counter: 2, networkReceiptHash: 'receipt2' }
      ]
      mockSnapshot.getReceiptHashes.mockReturnValue(mockReceiptHashes)
      
      SafetyMode.updateRecord(mockTxs, mockRecord, mockPrev)
      
      expect(mockRecord.networkReceiptHash).toEqual([
        { cycle: 1, hash: 'receipt1' },
        { cycle: 2, hash: 'receipt2' }
      ])
    })

    it('should set empty network summary hash when no summary hashes', () => {
      mockSnapshot.getSummaryHashes.mockReturnValue([])
      
      SafetyMode.updateRecord(mockTxs, mockRecord, mockPrev)
      
      expect(mockRecord.networkSummaryHash).toEqual([])
    })

    it('should set network summary hash when summary hashes exist', () => {
      const mockSummaryHashes = [
        { counter: 1, networkSummaryHash: 'summary1' },
        { counter: 2, networkSummaryHash: 'summary2' }
      ]
      mockSnapshot.getSummaryHashes.mockReturnValue(mockSummaryHashes)
      
      SafetyMode.updateRecord(mockTxs, mockRecord, mockPrev)
      
      expect(mockRecord.networkSummaryHash).toEqual([
        { cycle: 1, hash: 'summary1' },
        { cycle: 2, hash: 'summary2' }
      ])
    })

    it('should handle null hash arrays', () => {
      mockSnapshot.getStateHashes.mockReturnValue(null)
      mockSnapshot.getReceiptHashes.mockReturnValue(null)
      mockSnapshot.getSummaryHashes.mockReturnValue(null)
      
      SafetyMode.updateRecord(mockTxs, mockRecord, mockPrev)
      
      expect(mockRecord.networkDataHash).toEqual([])
      expect(mockRecord.networkReceiptHash).toEqual([])
      expect(mockRecord.networkSummaryHash).toEqual([])
    })
  })

  describe('validateRecordTypes', () => {
    it('should return empty string for any record', () => {
      const mockRecord = {} as P2P.SafetyModeTypes.Record
      const result = SafetyMode.validateRecordTypes(mockRecord)
      expect(result).toBe('')
    })

    it('should handle null record', () => {
      const result = SafetyMode.validateRecordTypes(null as any)
      expect(result).toBe('')
    })
  })

  describe('parseRecord', () => {
    it('should return empty change object', () => {
      const mockRecord = {} as P2P.CycleCreatorTypes.CycleRecord
      const result = SafetyMode.parseRecord(mockRecord)
      
      expect(result).toEqual({
        added: [],
        removed: [],
        updated: []
      })
    })

    it('should handle null record', () => {
      const result = SafetyMode.parseRecord(null as any)
      
      expect(result).toEqual({
        added: [],
        removed: [],
        updated: []
      })
    })
  })

  describe('queueRequest', () => {
    it('should handle any request without errors', () => {
      const mockRequest = { type: 'test' }
      expect(() => SafetyMode.queueRequest(mockRequest)).not.toThrow()
    })

    it('should handle null request', () => {
      expect(() => SafetyMode.queueRequest(null)).not.toThrow()
    })

    it('should handle undefined request', () => {
      expect(() => SafetyMode.queueRequest(undefined)).not.toThrow()
    })
  })

  describe('sendRequests', () => {
    it('should execute without errors', () => {
      expect(() => SafetyMode.sendRequests()).not.toThrow()
    })
  })

  describe('integration tests', () => {
    it('should handle complete workflow', () => {
      SafetyMode.init()
      SafetyMode.reset()
      
      const txs = SafetyMode.getTxs()
      const filteredTxs = SafetyMode.dropInvalidTxs(txs)
      
      const record = {
        safetyMode: false,
        safetyNum: 0,
        networkStateHash: '',
        networkDataHash: [],
        networkReceiptHash: [],
        networkSummaryHash: []
      } as P2P.CycleCreatorTypes.CycleRecord
      
      const prev = {
        safetyMode: true,
        safetyNum: 10,
        networkStateHash: 'prev-hash',
        active: 5
      } as P2P.CycleCreatorTypes.CycleRecord
      
      SafetyMode.updateRecord(filteredTxs, record, prev)
      
      const validationResult = SafetyMode.validateRecordTypes(record as any)
      const parseResult = SafetyMode.parseRecord(record)
      
      SafetyMode.queueRequest({ test: 'request' })
      SafetyMode.sendRequests()
      
      expect(validationResult).toBe('')
      expect(parseResult).toEqual({
        added: [],
        removed: [],
        updated: []
      })
    })
  })

  describe('edge cases', () => {
    it('should handle zero safety number', () => {
      const record = { safetyMode: true, active: 0 } as P2P.CycleCreatorTypes.CycleRecord
      const prev = { safetyMode: true, safetyNum: 0, active: 0 } as P2P.CycleCreatorTypes.CycleRecord
      
      SafetyMode.updateRecord({} as any, record, prev)
      
      expect(record.safetyMode).toBe(false)
    })

    it('should handle negative active count', () => {
      const record = { safetyMode: true } as P2P.CycleCreatorTypes.CycleRecord
      const prev = { safetyMode: true, safetyNum: 10, active: -5 } as P2P.CycleCreatorTypes.CycleRecord
      
      SafetyMode.updateRecord({} as any, record, prev)
      
      expect(record.safetyMode).toBe(true)
    })
  })
})