import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { P2P } from '@shardeum-foundation/lib-types'
import * as LostArchivers from '../../../../../src/p2p/LostArchivers/index'

// Mock dependencies
jest.mock('../../../../../src/utils', () => ({
  insertSorted: jest.fn((arr: any[], item: any) => {
    arr.push(item)
    return arr.sort()
  }),
}))

jest.mock('../../../../../src/p2p/Archivers', () => ({
  removeArchiverByPublicKey: jest.fn(),
}))

jest.mock('../../../../../src/p2p/LostArchivers/functions', () => ({
  errorForArchiverDownMsg: jest.fn(),
  errorForArchiverUpMsg: jest.fn(),
  informInvestigator: jest.fn(),
  tellNetworkArchiverIsDown: jest.fn(),
  tellNetworkArchiverIsUp: jest.fn(),
}))

jest.mock('../../../../../src/p2p/LostArchivers/logging', () => ({
  info: jest.fn(),
  initLogging: jest.fn(),
}))

jest.mock('../../../../../src/p2p/LostArchivers/routes', () => ({
  registerRoutes: jest.fn(),
}))

jest.mock('../../../../../src/p2p/LostArchivers/state', () => ({
  lostArchiversMap: new Map(),
}))

jest.mock('../../../../../src/logger', () => ({
  logFlags: {
    p2pNonFatal: true,
    debug: true,
  },
}))

jest.mock('../../../../../src/shardus/shardus-types', () => ({}))

const { insertSorted } = require('../../../../../src/utils')
const { removeArchiverByPublicKey } = require('../../../../../src/p2p/Archivers')
const {
  errorForArchiverDownMsg,
  errorForArchiverUpMsg,
  informInvestigator,
  tellNetworkArchiverIsDown,
  tellNetworkArchiverIsUp,
} = require('../../../../../src/p2p/LostArchivers/functions')
const { info, initLogging } = require('../../../../../src/p2p/LostArchivers/logging')
const { registerRoutes } = require('../../../../../src/p2p/LostArchivers/routes')
const { lostArchiversMap } = require('../../../../../src/p2p/LostArchivers/state')

describe('LostArchivers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    lostArchiversMap.clear()
  })

  describe('init', () => {
    it('should initialize logging, reset state, and register routes', () => {
      LostArchivers.init()

      expect(initLogging).toHaveBeenCalled()
      expect(info).toHaveBeenCalledWith('init() called')
      expect(registerRoutes).toHaveBeenCalled()
    })
  })

  describe('reset', () => {
    it('should log reset call', () => {
      LostArchivers.reset()

      expect(info).toHaveBeenCalledWith('reset() called')
    })
  })

  describe('getTxs', () => {
    it('should return empty arrays when no entries in lostArchiversMap', () => {
      const result = LostArchivers.getTxs()

      expect(result).toEqual({
        lostArchivers: [],
        refutedArchivers: [],
      })
    })

    it('should call insertSorted for valid down archiver entries', () => {
      const mockArchiverDownMsg = { test: 'msg' }

      lostArchiversMap.set('archiver1', {
        status: 'down',
        archiverDownMsg: mockArchiverDownMsg,
        isInvestigator: false,
        gossippedDownMsg: false,
      })

      LostArchivers.getTxs()

      expect(insertSorted).toHaveBeenCalledWith(expect.any(Array), mockArchiverDownMsg)
    })

    it('should call insertSorted for valid up archiver entries', () => {
      const mockArchiverUpMsg = { test: 'msg' }

      lostArchiversMap.set('archiver1', {
        status: 'up',
        archiverUpMsg: mockArchiverUpMsg,
        isInvestigator: false,
        gossippedUpMsg: false,
      })

      LostArchivers.getTxs()

      expect(insertSorted).toHaveBeenCalledWith(expect.any(Array), mockArchiverUpMsg)
    })

    it('should skip investigator entries that havent gossiped', () => {
      lostArchiversMap.set('archiver1', {
        status: 'down',
        archiverDownMsg: { test: 'msg' },
        isInvestigator: true,
        gossippedDownMsg: false,
      })

      LostArchivers.getTxs()

      // Should not call insertSorted since entry is skipped
      expect(insertSorted).not.toHaveBeenCalled()
    })
  })

  describe('dropInvalidTxs', () => {
    it('should filter out invalid ArchiverDownMsgs', () => {
      errorForArchiverDownMsg
        .mockReturnValueOnce(null) // Valid
        .mockReturnValueOnce('error') // Invalid

      const txs = {
        lostArchivers: [{ investigateMsg: { target: 'archiver1' } }, { investigateMsg: { target: 'archiver2' } }],
        refutedArchivers: [],
      } as any

      const result = LostArchivers.dropInvalidTxs(txs)

      expect(result.lostArchivers).toHaveLength(1)
      expect(result.lostArchivers[0]).toEqual({ investigateMsg: { target: 'archiver1' } })
      expect(errorForArchiverDownMsg).toHaveBeenCalledTimes(2)
    })

    it('should filter out invalid ArchiverUpMsgs', () => {
      errorForArchiverUpMsg
        .mockReturnValueOnce(null) // Valid
        .mockReturnValueOnce('error') // Invalid

      const txs = {
        lostArchivers: [],
        refutedArchivers: [
          { downMsg: { investigateMsg: { target: 'archiver1' } } },
          { downMsg: { investigateMsg: { target: 'archiver2' } } },
        ],
      } as any

      const result = LostArchivers.dropInvalidTxs(txs)

      expect(result.refutedArchivers).toHaveLength(1)
      expect(result.refutedArchivers[0]).toEqual({ downMsg: { investigateMsg: { target: 'archiver1' } } })
      expect(errorForArchiverUpMsg).toHaveBeenCalledTimes(2)
    })

    it('should return empty arrays when all txs are invalid', () => {
      errorForArchiverDownMsg.mockReturnValue('error')
      errorForArchiverUpMsg.mockReturnValue('error')

      const txs = {
        lostArchivers: [{ investigateMsg: { target: 'archiver1' } }],
        refutedArchivers: [{ downMsg: { investigateMsg: { target: 'archiver2' } } }],
      } as any

      const result = LostArchivers.dropInvalidTxs(txs)

      expect(result.lostArchivers).toHaveLength(0)
      expect(result.refutedArchivers).toHaveLength(0)
    })
  })

  describe('updateRecord', () => {
    it('should extract targets from valid txs', () => {
      const txs = {
        lostArchivers: [{ investigateMsg: { target: 'archiver1' } }],
        refutedArchivers: [{ downMsg: { investigateMsg: { target: 'archiver2' } } }],
      } as any

      const record = {} as any

      LostArchivers.updateRecord(txs, record, null)

      expect(insertSorted).toHaveBeenCalledWith(expect.any(Array), 'archiver1')
      expect(insertSorted).toHaveBeenCalledWith(expect.any(Array), 'archiver2')
      expect(record.lostArchivers).toBeDefined()
      expect(record.refutedArchivers).toBeDefined()
      expect(record.removedArchivers).toBeDefined()
    })

    it('should handle empty txs arrays', () => {
      const txs = { lostArchivers: [], refutedArchivers: [] } as any
      const record = {} as any

      LostArchivers.updateRecord(txs, record, null)

      expect(record.lostArchivers).toEqual([])
      expect(record.refutedArchivers).toEqual([])
      expect(record.removedArchivers).toEqual([])
    })

    it('should handle prev.lostArchivers and modify cyclesToWait', () => {
      lostArchiversMap.set('archiver1', { cyclesToWait: 1 })

      const txs = { lostArchivers: [], refutedArchivers: [] } as any
      const record = {} as any
      const prev = { lostArchivers: ['archiver1'] } as any

      LostArchivers.updateRecord(txs, record, prev)

      expect(lostArchiversMap.get('archiver1').cyclesToWait).toBe(0)
    })
  })

  describe('parseRecord', () => {
    it('should remove archivers from maps for removedArchivers', () => {
      lostArchiversMap.set('archiver1', { status: 'down' })
      lostArchiversMap.set('archiver2', { status: 'down' })

      const record = {
        removedArchivers: ['archiver1', 'archiver2'],
        refutedArchivers: [],
      } as any

      const result = LostArchivers.parseRecord(record)

      expect(removeArchiverByPublicKey).toHaveBeenCalledWith('archiver1')
      expect(removeArchiverByPublicKey).toHaveBeenCalledWith('archiver2')
      expect(lostArchiversMap.has('archiver1')).toBe(false)
      expect(lostArchiversMap.has('archiver2')).toBe(false)
      expect(result).toEqual({
        added: [],
        removed: [],
        updated: [],
      })
    })

    it('should remove entries from lostArchiversMap for refutedArchivers', () => {
      lostArchiversMap.set('archiver1', { status: 'up' })
      lostArchiversMap.set('archiver2', { status: 'up' })

      const record = {
        removedArchivers: [],
        refutedArchivers: ['archiver1', 'archiver2'],
      } as any

      LostArchivers.parseRecord(record)

      expect(lostArchiversMap.has('archiver1')).toBe(false)
      expect(lostArchiversMap.has('archiver2')).toBe(false)
      expect(removeArchiverByPublicKey).not.toHaveBeenCalled()
    })

    it('should handle empty arrays', () => {
      const record = {
        removedArchivers: [],
        refutedArchivers: [],
      } as any

      const result = LostArchivers.parseRecord(record)

      expect(result).toEqual({
        added: [],
        removed: [],
        updated: [],
      })
      expect(removeArchiverByPublicKey).not.toHaveBeenCalled()
    })
  })

  describe('queueRequest', () => {
    it('should execute without errors', () => {
      expect(() => LostArchivers.queueRequest({})).not.toThrow()
    })
  })

  describe('sendRequests', () => {
    it('should process reported entries by informing investigator and deleting', () => {
      lostArchiversMap.set('archiver1', {
        status: 'reported',
        isInvestigator: false,
      })

      lostArchiversMap.set('archiver2', {
        status: 'reported',
        isInvestigator: false,
      })

      LostArchivers.sendRequests()

      expect(informInvestigator).toHaveBeenCalledWith('archiver1')
      expect(informInvestigator).toHaveBeenCalledWith('archiver2')
      expect(lostArchiversMap.has('archiver1')).toBe(false)
      expect(lostArchiversMap.has('archiver2')).toBe(false)
    })

    it('should process investigator entries with status down', () => {
      const record = {
        status: 'down',
        isInvestigator: true,
        gossippedDownMsg: false,
      }

      lostArchiversMap.set('archiver1', record)

      LostArchivers.sendRequests()

      expect(tellNetworkArchiverIsDown).toHaveBeenCalledWith(record)
      expect(record.gossippedDownMsg).toBe(true)
      expect(lostArchiversMap.has('archiver1')).toBe(true) // Should not be deleted
    })

    it('should not process investigator entries with status down if already gossiped', () => {
      const record = {
        status: 'down',
        isInvestigator: true,
        gossippedDownMsg: true,
      }

      lostArchiversMap.set('archiver1', record)

      LostArchivers.sendRequests()

      expect(tellNetworkArchiverIsDown).not.toHaveBeenCalled()
    })

    it('should process non-investigator entries with status up', () => {
      const record = {
        status: 'up',
        isInvestigator: false,
        gossippedUpMsg: false,
      }

      lostArchiversMap.set('archiver1', record)

      LostArchivers.sendRequests()

      expect(tellNetworkArchiverIsUp).toHaveBeenCalledWith(record)
      expect(record.gossippedUpMsg).toBe(true)
    })

    it('should not process non-investigator entries with status up if already gossiped', () => {
      const record = {
        status: 'up',
        isInvestigator: false,
        gossippedUpMsg: true,
      }

      lostArchiversMap.set('archiver1', record)

      LostArchivers.sendRequests()

      expect(tellNetworkArchiverIsUp).not.toHaveBeenCalled()
    })

    it('should handle empty lostArchiversMap', () => {
      expect(() => LostArchivers.sendRequests()).not.toThrow()
      expect(informInvestigator).not.toHaveBeenCalled()
      expect(tellNetworkArchiverIsDown).not.toHaveBeenCalled()
      expect(tellNetworkArchiverIsUp).not.toHaveBeenCalled()
    })
  })

  describe('validateRecordTypes', () => {
    it('should return empty string for any record', () => {
      const record = {} as any
      const result = LostArchivers.validateRecordTypes(record)
      expect(result).toBe('')
    })
  })
})
