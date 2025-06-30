import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { P2P } from '@shardeum-foundation/lib-types'
import * as Modes from '../../../../src/p2p/Modes'

// Mock dependencies
jest.mock('../../../../src/p2p/Context', () => ({
  logger: {
    getLogger: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
  config: {
    p2p: {
      initShutdown: false,
      forcedMode: '',
      networkBaselineEnabled: true,
      baselineNodes: 10,
      minNodes: 5,
      extraNodesToAddInRestart: 2,
    },
  },
}))

jest.mock('../../../../src/p2p/Self', () => ({
  isFirst: false,
  emitter: {
    emit: jest.fn(),
  },
  setRestartNetwork: jest.fn(),
  isRestartNetwork: false,
}))

jest.mock('../../../../src/p2p/NodeList', () => ({
  activeByIdOrder: [],
}))

jest.mock('../../../../src/p2p/CycleCreator', () => ({
  hasAlreadyEnteredProcessing: false,
}))

jest.mock('../../../../src/utils', () => ({
  validateTypes: jest.fn(),
}))

jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
  },
}))

jest.mock('../../../../src/logger', () => ({
  logFlags: {
    verbose: true,
  },
}))

const Context = require('../../../../src/p2p/Context')
const Self = require('../../../../src/p2p/Self')
const NodeList = require('../../../../src/p2p/NodeList')
const { hasAlreadyEnteredProcessing } = require('../../../../src/p2p/CycleCreator')
const { validateTypes } = require('../../../../src/utils')
const { nestedCountersInstance } = require('../../../../src/utils/nestedCounters')

describe('Modes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Reset defaults
    Context.config.p2p.initShutdown = false
    Context.config.p2p.forcedMode = ''
    Context.config.p2p.networkBaselineEnabled = true
    Context.config.p2p.baselineNodes = 10
    Context.config.p2p.minNodes = 5
    Self.isFirst = false
    NodeList.activeByIdOrder.length = 0
  })

  describe('init', () => {
    it('should initialize logger and reset state', () => {
      Modes.init()

      expect(Context.logger.getLogger).toHaveBeenCalledWith('p2p')
    })
  })

  describe('reset', () => {
    it('should execute without errors', () => {
      expect(() => Modes.reset()).not.toThrow()
    })
  })

  describe('getTxs', () => {
    it('should return undefined', () => {
      const result = Modes.getTxs()
      expect(result).toBeUndefined()
    })
  })

  describe('dropInvalidTxs', () => {
    it('should return undefined', () => {
      const result = Modes.dropInvalidTxs({} as any)
      expect(result).toBeUndefined()
    })
  })

  describe('updateRecord', () => {
    let record: any
    let prev: any

    beforeEach(() => {
      record = {}
      prev = null
      NodeList.activeByIdOrder.length = 8
    })

    it('should apply forced mode when valid', () => {
      Context.config.p2p.forcedMode = 'safety'

      Modes.updateRecord({} as any, record, prev)

      expect(record.mode).toBe('safety')
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('P2P: forcedMode', 'safety')
    })

    it('should reject invalid forced mode', () => {
      Context.config.p2p.forcedMode = 'invalid'

      Modes.updateRecord({} as any, record, prev)

      expect(record.mode).toBeUndefined()
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('P2P: forcedMode:invalid', 'invalid')
    })

    it('should set shutdown mode when initShutdown is true', () => {
      Context.config.p2p.initShutdown = true

      Modes.updateRecord({} as any, record, prev)

      expect(record.mode).toBe('shutdown')
    })

    it('should set forming mode for first node with no prev', () => {
      Self.isFirst = true

      Modes.updateRecord({} as any, record, null)

      expect(record.mode).toBe('forming')
    })

    it('should handle transition from safetyMode to mode system when not entered processing', () => {
      prev = { safetyMode: true, mode: undefined }
      NodeList.activeByIdOrder.length = 3 // Less than minNodes (5)
      // hasAlreadyEnteredProcessing is false by default in mock

      Modes.updateRecord({} as any, record, prev)

      expect(record.mode).toBe('forming')
    })

    it('should handle transition from safetyMode to recovery when entered processing', () => {
      const CycleCreator = require('../../../../src/p2p/CycleCreator')
      CycleCreator.hasAlreadyEnteredProcessing = true
      
      prev = { safetyMode: true, mode: undefined }
      NodeList.activeByIdOrder.length = 3 // Less than minNodes (5), should go to recovery

      Modes.updateRecord({} as any, record, prev)

      expect(record.mode).toBe('recovery')
      
      // Reset for other tests
      CycleCreator.hasAlreadyEnteredProcessing = false
    })

    it('should transition from forming to processing when enough nodes', () => {
      prev = { mode: 'forming' }
      NodeList.activeByIdOrder.length = 6 // >= minNodes (5)

      Modes.updateRecord({} as any, record, prev)

      expect(record.mode).toBe('processing')
    })

    it('should stay in forming when not enough nodes', () => {
      prev = { mode: 'forming' }
      NodeList.activeByIdOrder.length = 3 // < minNodes (5)

      Modes.updateRecord({} as any, record, prev)

      expect(record.mode).toBe('forming')
    })

    it('should transition from processing to safety when node count drops', () => {
      prev = { mode: 'processing' }
      NodeList.activeByIdOrder.length = 8 // Between 0.75 * 10 and 0.9 * 10 (7.5-9)

      Modes.updateRecord({} as any, record, prev)

      expect(record.mode).toBe('safety')
    })

    it('should transition from processing to recovery when node count drops significantly', () => {
      prev = { mode: 'processing' }
      NodeList.activeByIdOrder.length = 6 // < 0.75 * 10 (7.5)

      Modes.updateRecord({} as any, record, prev)

      expect(record.mode).toBe('recovery')
    })

    it('should transition from processing to shutdown when node count is very low', () => {
      prev = { mode: 'processing' }
      NodeList.activeByIdOrder.length = 2 // <= 0.3 * 10 (3)

      Modes.updateRecord({} as any, record, prev)

      expect(record.mode).toBe('shutdown')
    })

    it('should transition from safety to processing when node count improves', () => {
      prev = { mode: 'safety' }
      NodeList.activeByIdOrder.length = 10 // >= minNodes and >= 0.9 * baselineNodes

      Modes.updateRecord({} as any, record, prev)

      expect(record.mode).toBe('processing')
    })

    it('should transition from safety to recovery when node count drops', () => {
      prev = { mode: 'safety' }
      NodeList.activeByIdOrder.length = 6 // < 0.75 * 10 (7.5)

      Modes.updateRecord({} as any, record, prev)

      expect(record.mode).toBe('recovery')
    })

    it('should transition from recovery to restore when node count increases', () => {
      prev = { mode: 'recovery', syncing: 5 }
      NodeList.activeByIdOrder.length = 8 // 8 + 5 = 13 >= baselineNodes (10) + extraNodesToAddInRestart (2)

      Modes.updateRecord({} as any, record, prev)

      expect(record.mode).toBe('restore')
    })

    it('should transition from shutdown to restart if first node', () => {
      prev = { mode: 'shutdown' }
      Self.isFirst = true

      Modes.updateRecord({} as any, record, prev)

      expect(record.mode).toBe('restart')
    })

    it('should stay in shutdown if not first node', () => {
      prev = { mode: 'shutdown' }
      Self.isFirst = false

      Modes.updateRecord({} as any, record, prev)

      expect(record.mode).toBe('shutdown')
    })

    it('should transition from restart to restore when syncing nodes are ready', () => {
      prev = { mode: 'restart', syncing: 12 } // >= baselineNodes + extraNodesToAddInRestart

      Modes.updateRecord({} as any, record, prev)

      expect(record.mode).toBe('restore')
    })

    it('should transition from restore to processing when enough nodes', () => {
      prev = { mode: 'restore' }
      NodeList.activeByIdOrder.length = 6 // >= minNodes (5)

      Modes.updateRecord({} as any, record, prev)

      expect(record.mode).toBe('processing')
    })
  })

  describe('validateRecordTypes', () => {
    it('should return empty string for valid record', () => {
      validateTypes.mockReturnValue('')

      const record = { mode: 'processing' } as any
      const result = Modes.validateRecordTypes(record)

      expect(result).toBe('')
      expect(validateTypes).toHaveBeenCalledWith(record, { mode: 's' })
    })

    it('should return error for invalid record', () => {
      validateTypes.mockReturnValue('mode is required')

      const record = {} as any
      const result = Modes.validateRecordTypes(record)

      expect(result).toBe('mode is required')
    })
  })

  describe('parseRecord', () => {
    beforeEach(() => {
      // Set initial networkMode
      const ModesModule = require('../../../../src/p2p/Modes')
      ModesModule.networkMode = 'processing'
    })

    it('should emit restore event when transitioning from restart to restore', () => {
      // Set networkMode to restart
      const ModesModule = require('../../../../src/p2p/Modes')
      ModesModule.networkMode = 'restart'

      const record = { mode: 'restore', counter: 10 } as any

      Modes.parseRecord(record)

      expect(Self.emitter.emit).toHaveBeenCalledWith('restore', 10)
    })

    it('should emit restore event when transitioning from recovery to restore', () => {
      // Set networkMode to recovery
      const ModesModule = require('../../../../src/p2p/Modes')
      ModesModule.networkMode = 'recovery'

      const record = { mode: 'restore', counter: 15 } as any

      Modes.parseRecord(record)

      expect(Self.emitter.emit).toHaveBeenCalledWith('restore', 15)
    })

    it('should call setRestartNetwork when transitioning from restore to processing', () => {
      // Set networkMode to restore
      const ModesModule = require('../../../../src/p2p/Modes')
      ModesModule.networkMode = 'restore'

      const record = { mode: 'processing' } as any

      Modes.parseRecord(record)

      expect(Self.setRestartNetwork).toHaveBeenCalledWith(false)
    })

    it('should call setRestartNetwork(true) when entering restart mode', () => {
      Self.isRestartNetwork = false

      const record = { mode: 'restart' } as any

      Modes.parseRecord(record)

      expect(Self.setRestartNetwork).toHaveBeenCalledWith(true)
    })

    it('should return empty change object', () => {
      const record = { mode: 'processing' } as any

      const result = Modes.parseRecord(record)

      expect(result).toEqual({
        added: [],
        removed: [],
        updated: [],
      })
    })
  })

  describe('queueRequest', () => {
    it('should execute without errors', () => {
      expect(() => Modes.queueRequest()).not.toThrow()
    })
  })

  describe('sendRequests', () => {
    it('should execute without errors', () => {
      expect(() => Modes.sendRequests()).not.toThrow()
    })
  })

  describe('Helper Functions', () => {
    beforeEach(() => {
      Context.config.p2p.networkBaselineEnabled = true
      Context.config.p2p.baselineNodes = 10
      Context.config.p2p.minNodes = 5
    })

    describe('enterRecovery', () => {
      it('should return true when active count is below 75% of baseline', () => {
        const result = Modes.enterRecovery(6) // 6 < 0.75 * 10 (7.5)
        expect(result).toBe(true)
      })

      it('should return false when active count is above 75% of baseline', () => {
        const result = Modes.enterRecovery(8) // 8 >= 0.75 * 10 (7.5)
        expect(result).toBe(false)
      })

      it('should use minNodes when baseline is disabled', () => {
        Context.config.p2p.networkBaselineEnabled = false
        const result = Modes.enterRecovery(3) // 3 < 0.75 * 5 (3.75)
        expect(result).toBe(true)
      })
    })

    describe('enterShutdown', () => {
      it('should return true when active count is at or below 30% of baseline', () => {
        const result = Modes.enterShutdown(3) // 3 <= 0.3 * 10 (3)
        expect(result).toBe(true)
      })

      it('should return false when active count is above 30% of baseline', () => {
        const result = Modes.enterShutdown(4) // 4 > 0.3 * 10 (3)
        expect(result).toBe(false)
      })

      it('should use minNodes when baseline is disabled', () => {
        Context.config.p2p.networkBaselineEnabled = false
        const result = Modes.enterShutdown(1) // 1 <= 0.3 * 5 (1.5)
        expect(result).toBe(true)
      })
    })

    describe('enterSafety', () => {
      it('should return true when active count is between 75% and 90% of baseline', () => {
        const result = Modes.enterSafety(8) // 7.5 <= 8 < 9
        expect(result).toBe(true)
      })

      it('should return false when active count is below 75% of baseline', () => {
        const result = Modes.enterSafety(6) // 6 < 7.5
        expect(result).toBe(false)
      })

      it('should return false when active count is above 90% of baseline', () => {
        const result = Modes.enterSafety(10) // 10 >= 9
        expect(result).toBe(false)
      })

      it('should use minNodes when baseline is disabled', () => {
        Context.config.p2p.networkBaselineEnabled = false
        const result = Modes.enterSafety(4) // 3.75 <= 4 < 4.5
        expect(result).toBe(true)
      })
    })

    describe('enterProcessing', () => {
      it('should return true when active count meets minNodes', () => {
        const result = Modes.enterProcessing(5) // 5 >= 5
        expect(result).toBe(true)
      })

      it('should return false when active count is below minNodes', () => {
        const result = Modes.enterProcessing(4) // 4 < 5
        expect(result).toBe(false)
      })
    })

    describe('enterRestore', () => {
      it('should return true when total node count meets threshold plus extra nodes', () => {
        Context.config.p2p.extraNodesToAddInRestart = 2
        const result = Modes.enterRestore(12) // 12 >= 10 + 2
        expect(result).toBe(true)
      })

      it('should return false when total node count is below threshold', () => {
        Context.config.p2p.extraNodesToAddInRestart = 2
        const result = Modes.enterRestore(11) // 11 < 10 + 2
        expect(result).toBe(false)
      })

      it('should use minNodes when baseline is disabled', () => {
        Context.config.p2p.networkBaselineEnabled = false
        Context.config.p2p.extraNodesToAddInRestart = 1
        const result = Modes.enterRestore(6) // 6 >= 5 + 1
        expect(result).toBe(true)
      })
    })

    describe('isInternalTxAllowed', () => {
      it('should return true for processing mode', () => {
        const ModesModule = require('../../../../src/p2p/Modes')
        ModesModule.networkMode = 'processing'
        expect(Modes.isInternalTxAllowed()).toBe(true)
      })

      it('should return true for safety mode', () => {
        const ModesModule = require('../../../../src/p2p/Modes')
        ModesModule.networkMode = 'safety'
        expect(Modes.isInternalTxAllowed()).toBe(true)
      })

      it('should return true for forming mode', () => {
        const ModesModule = require('../../../../src/p2p/Modes')
        ModesModule.networkMode = 'forming'
        expect(Modes.isInternalTxAllowed()).toBe(true)
      })

      it('should return false for recovery mode', () => {
        const ModesModule = require('../../../../src/p2p/Modes')
        ModesModule.networkMode = 'recovery'
        expect(Modes.isInternalTxAllowed()).toBe(false)
      })

      it('should return false for shutdown mode', () => {
        const ModesModule = require('../../../../src/p2p/Modes')
        ModesModule.networkMode = 'shutdown'
        expect(Modes.isInternalTxAllowed()).toBe(false)
      })
    })
  })
})