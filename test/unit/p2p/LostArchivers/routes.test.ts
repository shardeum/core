/* eslint-disable @typescript-eslint/no-explicit-any */
import { P2P } from '@shardeum-foundation/lib-types'
import {
  ArchiverDownMsg,
  ArchiverRefutesLostMsg,
  ArchiverUpMsg,
  InvestigateArchiverMsg,
} from '@shardeum-foundation/lib-types/build/src/p2p/LostArchiverTypes'
import { Node } from '@shardeum-foundation/lib-types/build/src/p2p/NodeListTypes'
import { SignedObject } from '@shardeum-foundation/lib-types/build/src/p2p/P2PTypes'
import { Request, Response } from 'express'
import { InternalRouteEnum } from '../../../../src/types/enum/InternalRouteEnum'
import { TypeIdentifierEnum } from '../../../../src/types/enum/TypeIdentifierEnum'

// Create mock objects that will be used in mocks
const mockComms = {
  sendGossip: jest.fn(),
  registerInternal: jest.fn(),
  registerInternalBinary: jest.fn(),
  registerGossipHandler: jest.fn(),
}

const mockConfig = {
  p2p: {
    enableLostArchiversCycles: true,
  }
}

const mockCrypto = {
  sign: jest.fn((obj: any) => {
    const signed = { ...obj, sign: {} }
    return signed
  }),
}

const mockNetwork = {
  _registerExternal: jest.fn(),
}

const mockGetRandomAvailableArchiver = jest.fn()

const mockFuncs = {
  errorForArchiverDownMsg: jest.fn(),
  errorForArchiverUpMsg: jest.fn(),
  errorForArchiverRefutesLostMsg: jest.fn(),
  errorForInvestigateArchiverMsg: jest.fn(),
  investigateArchiver: jest.fn(),
  createLostArchiverRecord: jest.fn(),
  reportLostArchiver: jest.fn(),
}

const mockLogging = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

const mockCurrentQuarter = 0

let mockSelfId = 'node123'

const mockByIdOrder: Node[] = []

const mockNestedCounters = {
  countEvent: jest.fn(),
}

const mockProfiler = {
  scopedProfileSectionStart: jest.fn(),
  scopedProfileSectionEnd: jest.fn(),
}

const mockDeserializeLostArchiverInvestigateReq = jest.fn()

const mockGetStreamWithTypeCheck = jest.fn()

const mockIsDebugModeMiddleware = jest.fn()

const mockGetArchiverWithPublicKey = jest.fn()

const mockCheckGossipPayload = jest.fn()

// Mock all modules with factory functions
jest.mock('../../../../src/p2p/Comms', () => ({
  sendGossip: jest.fn(),
  registerInternal: jest.fn(),
  registerInternalBinary: jest.fn(),
  registerGossipHandler: jest.fn(),
}))

jest.mock('../../../../src/p2p/Context', () => ({
  config: {
    p2p: {
      enableLostArchiversCycles: true,
    }
  },
  crypto: {
    sign: jest.fn((obj: any) => ({ ...obj, sign: { owner: 'test', sig: 'testsig' } })),
  },
  network: {
    _registerExternal: jest.fn(),
  }
}))

jest.mock('../../../../src/p2p/Utils', () => ({
  getRandomAvailableArchiver: jest.fn(),
}))

jest.mock('../../../../src/p2p/LostArchivers/functions', () => ({
  errorForArchiverDownMsg: jest.fn(),
  errorForArchiverUpMsg: jest.fn(),
  errorForArchiverRefutesLostMsg: jest.fn(),
  errorForInvestigateArchiverMsg: jest.fn(),
  investigateArchiver: jest.fn(),
  createLostArchiverRecord: jest.fn(),
  reportLostArchiver: jest.fn(),
}))

jest.mock('../../../../src/p2p/LostArchivers/logging', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}))

jest.mock('../../../../src/p2p/CycleCreator', () => ({
  currentQuarter: 0,
}))

jest.mock('../../../../src/p2p/Self', () => ({
  get id() { return mockSelfId }
}))

jest.mock('../../../../src/p2p/NodeList', () => ({
  byIdOrder: [],
}))

jest.mock('../../../../src/network/debugMiddleware', () => ({
  isDebugModeMiddleware: jest.fn(),
}))

jest.mock('../../../../src/p2p/Archivers', () => ({
  getArchiverWithPublicKey: jest.fn(),
}))

jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
  },
}))

jest.mock('../../../../src/utils/profiler', () => ({
  profilerInstance: {
    scopedProfileSectionStart: jest.fn(),
    scopedProfileSectionEnd: jest.fn(),
  },
}))

jest.mock('../../../../src/types/LostArchiverInvestigateReq', () => ({
  deserializeLostArchiverInvestigateReq: jest.fn(),
}))

jest.mock('../../../../src/types/Helpers', () => ({
  getStreamWithTypeCheck: jest.fn(),
}))

jest.mock('../../../../src/utils/GossipValidation', () => ({
  checkGossipPayload: jest.fn(),
}))

// Import modules after mocks
import * as Comms from '../../../../src/p2p/Comms'
import { config, crypto, network } from '../../../../src/p2p/Context'
import { getRandomAvailableArchiver } from '../../../../src/p2p/Utils'
import * as funcs from '../../../../src/p2p/LostArchivers/functions'
import * as logging from '../../../../src/p2p/LostArchivers/logging'
import { byIdOrder } from '../../../../src/p2p/NodeList'
import { isDebugModeMiddleware } from '../../../../src/network/debugMiddleware'
import { getArchiverWithPublicKey } from '../../../../src/p2p/Archivers'
import { nestedCountersInstance } from '../../../../src/utils/nestedCounters'
import { profilerInstance } from '../../../../src/utils/profiler'
import { deserializeLostArchiverInvestigateReq } from '../../../../src/types/LostArchiverInvestigateReq'
import { getStreamWithTypeCheck } from '../../../../src/types/Helpers'
import { checkGossipPayload } from '../../../../src/utils/GossipValidation'

// Import after all mocks
import * as routes from '../../../../src/p2p/LostArchivers/routes'
import { lostArchiversMap } from '../../../../src/p2p/LostArchivers/state'

describe('LostArchivers/routes', () => {
  let registeredHandlers: {
    gossipUp?: any
    gossipDown?: any
    refute?: any
    reportFake?: any
    investigateBinary?: any
  } = {}

  beforeEach(() => {
    jest.clearAllMocks()
    lostArchiversMap.clear()
    registeredHandlers = {}
    
    // Reset default values
    config.p2p.enableLostArchiversCycles = true
    mockSelfId = 'node123'
    ;(checkGossipPayload as jest.Mock).mockReturnValue(true)
    ;(funcs.createLostArchiverRecord as jest.Mock).mockImplementation((obj) => ({ ...obj }))
    ;(crypto.sign as jest.Mock).mockImplementation((obj: any) => ({ ...obj, sign: { owner: 'test', sig: 'testsig' } }))
    ;(funcs.errorForArchiverDownMsg as jest.Mock).mockReturnValue(null)
    ;(funcs.errorForArchiverUpMsg as jest.Mock).mockReturnValue(null)
    ;(funcs.errorForArchiverRefutesLostMsg as jest.Mock).mockReturnValue(null)
    ;(funcs.errorForInvestigateArchiverMsg as jest.Mock).mockReturnValue(null)

    // Capture registered handlers
    ;(Comms.registerGossipHandler as jest.Mock).mockImplementation((name, handler) => {
      if (name === 'lost-archiver-up') registeredHandlers.gossipUp = handler
      if (name === 'lost-archiver-down') registeredHandlers.gossipDown = handler
    })
    ;(network._registerExternal as jest.Mock).mockImplementation((method, name, ...args) => {
      const handler = args[args.length - 1]
      if (name === 'lost-archiver-refute') registeredHandlers.refute = handler
      if (name === 'report-fake-lost-archiver') {
        registeredHandlers.reportFake = handler
      }
    })
    ;(Comms.registerInternalBinary as jest.Mock).mockImplementation((name, handler) => {
      if (name === InternalRouteEnum.binary_lost_archiver_investigate) {
        registeredHandlers.investigateBinary = handler
      }
    })

    // Register all routes
    routes.registerRoutes()
  })

  describe('lostArchiverUpGossip', () => {
    const mockUpMsg: SignedObject<ArchiverUpMsg> = {
      type: 'up',
      downMsg: {
        investigateMsg: {
          target: 'archiver123',
        },
      },
      refuteMsg: {},
      cycle: 'cycle1',
      sign: {},
    } as any

    it('should return early if enableLostArchiversCycles is false', () => {
      config.p2p.enableLostArchiversCycles = false
      registeredHandlers.gossipUp(mockUpMsg, 'sender123', 'tracker123')
      expect(checkGossipPayload).not.toHaveBeenCalled()
      expect(logging.info).not.toHaveBeenCalled()
    })

    it('should return early if checkGossipPayload fails', () => {
      ;(checkGossipPayload as jest.Mock).mockReturnValue(false)
      registeredHandlers.gossipUp(mockUpMsg, 'sender123', 'tracker123')
      expect(checkGossipPayload).toHaveBeenCalledWith(
        mockUpMsg,
        { type: 's', downMsg: 'o', refuteMsg: 'o', cycle: 's', sign: 'o' },
        'lostArchiverUpGossip',
        'sender123'
      )
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })

    it('should return early if missing sender', () => {
      registeredHandlers.gossipUp(mockUpMsg, null, 'tracker123')
      expect(logging.warn).toHaveBeenCalledWith('lostArchiverUpGossip: missing sender')
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })

    it('should return early if missing tracker', () => {
      registeredHandlers.gossipUp(mockUpMsg, 'sender123', null)
      expect(logging.warn).toHaveBeenCalledWith('lostArchiverUpGossip: missing tracker')
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })

    it('should return early if errorForArchiverUpMsg returns error', () => {
      ;(funcs.errorForArchiverUpMsg as jest.Mock).mockReturnValue('Invalid message')
      registeredHandlers.gossipUp(mockUpMsg, 'sender123', 'tracker123')
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'lostArchivers',
        'lostArchiverUpGossip invalid payload Invalid message'
      )
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })

    it('should return early if no record found', () => {
      registeredHandlers.gossipUp(mockUpMsg, 'sender123', 'tracker123')
      expect(logging.info).toHaveBeenCalledWith(
        'lostArchiverUpGossip: no record for target archiver123. returning'
      )
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })

    it('should return early if record already has up status', () => {
      lostArchiversMap.set('archiver123', { status: 'up', target: 'archiver123' } as any)
      registeredHandlers.gossipUp(mockUpMsg, 'sender123', 'tracker123')
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })

    it('should process valid up message and gossip it', () => {
      lostArchiversMap.set('archiver123', { status: 'down', target: 'archiver123' } as any)
      registeredHandlers.gossipUp(mockUpMsg, 'sender123', 'tracker123')
      
      const record = lostArchiversMap.get('archiver123')
      expect(record?.status).toBe('up')
      expect(record?.archiverUpMsg).toBe(mockUpMsg)
      expect(record?.gossippedUpMsg).toBe(true)
      
      expect(Comms.sendGossip).toHaveBeenCalledWith(
        'lost-archiver-up',
        mockUpMsg,
        'tracker123',
        'node123',
        byIdOrder,
        false
      )
    })
  })

  describe('lostArchiverDownGossip', () => {
    const mockDownMsg: SignedObject<ArchiverDownMsg> = {
      type: 'down',
      investigateMsg: {
        target: 'archiver123',
      },
      cycle: 'cycle1',
      sign: {},
    } as any

    it('should return early if enableLostArchiversCycles is false', () => {
      config.p2p.enableLostArchiversCycles = false
      registeredHandlers.gossipDown(mockDownMsg, 'sender123', 'tracker123')
      expect(checkGossipPayload).not.toHaveBeenCalled()
      expect(logging.info).not.toHaveBeenCalled()
    })

    it('should return early if checkGossipPayload fails', () => {
      ;(checkGossipPayload as jest.Mock).mockReturnValue(false)
      registeredHandlers.gossipDown(mockDownMsg, 'sender123', 'tracker123')
      expect(checkGossipPayload).toHaveBeenCalledWith(
        mockDownMsg,
        { type: 's', investigateMsg: 'o', cycle: 's', sign: 'o' },
        'lostArchiverDownGossip',
        'sender123'
      )
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })

    it('should return early if missing sender', () => {
      registeredHandlers.gossipDown(mockDownMsg, null, 'tracker123')
      expect(logging.warn).toHaveBeenCalledWith('lostArchiverDownGossip: missing sender')
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })

    it('should return early if missing tracker', () => {
      registeredHandlers.gossipDown(mockDownMsg, 'sender123', null)
      expect(logging.warn).toHaveBeenCalledWith('lostArchiverDownGossip: missing tracker')
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })

    it('should return early if errorForArchiverDownMsg returns error', () => {
      ;(funcs.errorForArchiverDownMsg as jest.Mock).mockReturnValue('Invalid message')
      registeredHandlers.gossipDown(mockDownMsg, 'sender123', 'tracker123')
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'lostArchivers',
        'lostArchiverDownGossip invalid payload Invalid message'
      )
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })

    it('should return early if record already exists with up or down status', () => {
      lostArchiversMap.set('archiver123', { status: 'up', target: 'archiver123' } as any)
      registeredHandlers.gossipDown(mockDownMsg, 'sender123', 'tracker123')
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })

    it('should create new record and gossip when no record exists', () => {
      registeredHandlers.gossipDown(mockDownMsg, 'sender123', 'tracker123')
      
      const record = lostArchiversMap.get('archiver123')
      expect(record?.status).toBe('down')
      expect(record?.archiverDownMsg).toBe(mockDownMsg)
      expect(record?.gossippedDownMsg).toBe(true)
      
      expect(funcs.createLostArchiverRecord).toHaveBeenCalledWith({
        target: 'archiver123',
        status: 'down',
        archiverDownMsg: mockDownMsg,
      })
      
      expect(Comms.sendGossip).toHaveBeenCalledWith(
        'lost-archiver-down',
        mockDownMsg,
        'tracker123',
        'node123',
        byIdOrder,
        false
      )
    })

    it('should update existing record and gossip', () => {
      lostArchiversMap.set('archiver123', { status: 'reported', target: 'archiver123' } as any)
      registeredHandlers.gossipDown(mockDownMsg, 'sender123', 'tracker123')
      
      const record = lostArchiversMap.get('archiver123')
      expect(record?.status).toBe('down')
      expect(record?.archiverDownMsg).toBe(mockDownMsg)
      expect(record?.gossippedDownMsg).toBe(true)
      
      expect(Comms.sendGossip).toHaveBeenCalled()
    })
  })

  describe('investigateLostArchiverRouteBinary', () => {
    const mockInvestigateMsg: SignedObject<InvestigateArchiverMsg> = {
      type: 'investigate',
      target: 'archiver123',
      investigator: 'node123',
      sender: 'sender123',
      cycle: 'cycle1',
      sign: {},
    } as any

    const mockRespond = jest.fn()
    const mockHeader = { sender_id: 'sender123' }

    beforeEach(() => {
      ;(getStreamWithTypeCheck as jest.Mock).mockReturnValue({})
      ;(deserializeLostArchiverInvestigateReq as jest.Mock).mockReturnValue(mockInvestigateMsg)
    })

    it('should return early if enableLostArchiversCycles is false', () => {
      config.p2p.enableLostArchiversCycles = false
      const payload = Buffer.from('test')
      registeredHandlers.investigateBinary(payload, mockRespond, mockHeader)
      expect(nestedCountersInstance.countEvent).not.toHaveBeenCalled()
      expect(funcs.investigateArchiver).not.toHaveBeenCalled()
    })

    it('should return early if getStreamWithTypeCheck returns null', () => {
      ;(getStreamWithTypeCheck as jest.Mock).mockReturnValue(null)
      const payload = Buffer.from('test')
      registeredHandlers.investigateBinary(payload, mockRespond, mockHeader)
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'internal',
        'binary/lost_archiver_investigate-invalid_request'
      )
      expect(funcs.investigateArchiver).not.toHaveBeenCalled()
    })

    it('should return early if missing payload', () => {
      ;(deserializeLostArchiverInvestigateReq as jest.Mock).mockReturnValue(null)
      const payload = Buffer.from('test')
      registeredHandlers.investigateBinary(payload, mockRespond, mockHeader)
      expect(logging.warn).toHaveBeenCalledWith(
        'binary/lost_archiver_investigate: Missing payload'
      )
      expect(funcs.investigateArchiver).not.toHaveBeenCalled()
    })

    it('should return early if missing response method', () => {
      const payload = Buffer.from('test')
      registeredHandlers.investigateBinary(payload, null, mockHeader)
      expect(logging.warn).toHaveBeenCalledWith(
        'binary/lost_archiver_investigate: Missing response method'
      )
      expect(funcs.investigateArchiver).not.toHaveBeenCalled()
    })

    it('should return early if missing sender ID', () => {
      const payload = Buffer.from('test')
      registeredHandlers.investigateBinary(payload, mockRespond, {})
      expect(logging.warn).toHaveBeenCalledWith(
        'binary/lost_archiver_investigate: Missing sender ID'
      )
      expect(funcs.investigateArchiver).not.toHaveBeenCalled()
    })

    it('should return early if errorForInvestigateArchiverMsg returns error', () => {
      ;(funcs.errorForInvestigateArchiverMsg as jest.Mock).mockReturnValue('Invalid message')
      const payload = Buffer.from('test')
      registeredHandlers.investigateBinary(payload, mockRespond, mockHeader)
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'lostArchivers',
        'investigateLostArchiverRouteBinary invalid payload Invalid message'
      )
      expect(funcs.investigateArchiver).not.toHaveBeenCalled()
    })

    it('should return early if not the investigator', () => {
      mockSelfId = 'other123'
      const payload = Buffer.from('test')
      registeredHandlers.investigateBinary(payload, mockRespond, mockHeader)
      expect(logging.info).toHaveBeenCalledWith(
        'binary/lost_archiver_investigate: Not the investigator, ignoring the request.'
      )
      expect(funcs.investigateArchiver).not.toHaveBeenCalled()
    })

    it('should call investigateArchiver when valid and is investigator', () => {
      const payload = Buffer.from('test')
      registeredHandlers.investigateBinary(payload, mockRespond, mockHeader)
      expect(funcs.investigateArchiver).toHaveBeenCalledWith(mockInvestigateMsg)
      expect(profilerInstance.scopedProfileSectionStart).toHaveBeenCalled()
      expect(profilerInstance.scopedProfileSectionEnd).toHaveBeenCalled()
    })

    it('should handle errors gracefully', () => {
      ;(deserializeLostArchiverInvestigateReq as jest.Mock).mockImplementation(() => {
        throw new Error('Test error')
      })
      const payload = Buffer.from('test')
      registeredHandlers.investigateBinary(payload, mockRespond, mockHeader)
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'internal',
        'binary/lost_archiver_investigate-exception'
      )
      expect(logging.error).toHaveBeenCalledWith(
        'binary/lost_archiver_investigate: Error processing request - Test error'
      )
      expect(profilerInstance.scopedProfileSectionEnd).toHaveBeenCalled()
    })
  })

  describe('refuteLostArchiverRoute', () => {
    const mockRefuteMsg: SignedObject<ArchiverRefutesLostMsg> = {
      archiver: 'archiver123',
      cycle: 'cycle1',
      sign: {},
    } as any

    const mockReq = { body: mockRefuteMsg } as unknown as Request
    const mockRes = {
      json: jest.fn(),
    } as unknown as Response

    it('should return early if enableLostArchiversCycles is false', () => {
      config.p2p.enableLostArchiversCycles = false
      registeredHandlers.refute(mockReq, mockRes)
      expect(funcs.errorForArchiverRefutesLostMsg).not.toHaveBeenCalled()
      expect(mockRes.json).not.toHaveBeenCalled()
    })

    it('should return failure if errorForArchiverRefutesLostMsg returns error', () => {
      ;(funcs.errorForArchiverRefutesLostMsg as jest.Mock).mockReturnValue('Invalid message')
      registeredHandlers.refute(mockReq, mockRes)
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'lostArchivers',
        'refuteLostArchiverRoute invalid payload Invalid message'
      )
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'failure',
        message: 'Invalid message',
      })
    })

    it('should create new record when no existing record', () => {
      registeredHandlers.refute(mockReq, mockRes)
      
      const record = lostArchiversMap.get('archiver123')
      expect(record?.status).toBe('up')
      expect(record?.archiverRefuteMsg).toBe(mockRefuteMsg)
      
      expect(funcs.createLostArchiverRecord).toHaveBeenCalledWith({
        target: 'archiver123',
        status: 'up',
        archiverRefuteMsg: mockRefuteMsg,
      })
      
      expect(mockRes.json).toHaveBeenCalledWith({ status: 'success' })
    })

    it('should update existing record', () => {
      lostArchiversMap.set('archiver123', { status: 'down', target: 'archiver123' } as any)
      registeredHandlers.refute(mockReq, mockRes)
      
      const record = lostArchiversMap.get('archiver123')
      expect(record?.status).toBe('up')
      expect(record?.archiverRefuteMsg).toBe(mockRefuteMsg)
      
      expect(mockRes.json).toHaveBeenCalledWith({ status: 'success' })
    })
  })

  describe('reportFakeLostArchiverRoute', () => {
    const mockRes = {
      json: jest.fn(),
    } as unknown as Response

    it('should return early if enableLostArchiversCycles is false', () => {
      config.p2p.enableLostArchiversCycles = false
      const mockReq = { query: {}, body: {} } as unknown as Request
      registeredHandlers.reportFake(mockReq, mockRes)
      expect(getRandomAvailableArchiver).not.toHaveBeenCalled()
      expect(mockRes.json).not.toHaveBeenCalled()
    })

    it('should report specified archiver by publicKey query param', () => {
      const mockArchiver = { publicKey: 'archiver123', ip: '127.0.0.1', port: 8080 }
      ;(getArchiverWithPublicKey as jest.Mock).mockReturnValue(mockArchiver)
      
      const mockReq = { query: { publicKey: 'archiver123' }, body: {} } as unknown as Request
      registeredHandlers.reportFake(mockReq, mockRes)
      
      expect(getArchiverWithPublicKey).toHaveBeenCalledWith('archiver123')
      expect(funcs.reportLostArchiver).toHaveBeenCalledWith(
        'archiver123',
        'fake lost archiver report'
      )
      expect(crypto.sign).toHaveBeenCalledWith({
        status: 'accepted',
        pick: 'specified',
        archiver: mockArchiver,
        message: 'will report fake lost archiver',
      })
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'accepted',
        pick: 'specified',
        archiver: mockArchiver,
        message: 'will report fake lost archiver',
        sign: { owner: 'test', sig: 'testsig' },
      })
    })

    it('should report specified archiver by publickey body param', () => {
      const mockArchiver = { publicKey: 'archiver123', ip: '127.0.0.1', port: 8080 }
      ;(getArchiverWithPublicKey as jest.Mock).mockReturnValue(mockArchiver)
      
      const mockReq = { query: {}, body: { publickey: 'archiver123' } } as unknown as Request
      registeredHandlers.reportFake(mockReq, mockRes)
      
      expect(getArchiverWithPublicKey).toHaveBeenCalledWith('archiver123')
      expect(funcs.reportLostArchiver).toHaveBeenCalledWith(
        'archiver123',
        'fake lost archiver report'
      )
      expect(crypto.sign).toHaveBeenCalledWith({
        status: 'accepted',
        pick: 'specified',
        archiver: mockArchiver,
        message: 'will report fake lost archiver',
      })
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'accepted',
        pick: 'specified',
        archiver: mockArchiver,
        message: 'will report fake lost archiver',
        sign: { owner: 'test', sig: 'testsig' },
      })
    })

    it('should report random archiver when no publicKey specified', () => {
      const mockArchiver = { publicKey: 'archiver123', ip: '127.0.0.1', port: 8080 }
      ;(getRandomAvailableArchiver as jest.Mock).mockReturnValue(mockArchiver)
      
      const mockReq = { query: {}, body: {} } as unknown as Request
      registeredHandlers.reportFake(mockReq, mockRes)
      
      expect(getRandomAvailableArchiver).toHaveBeenCalled()
      expect(funcs.reportLostArchiver).toHaveBeenCalledWith(
        'archiver123',
        'fake lost archiver report'
      )
      expect(crypto.sign).toHaveBeenCalledWith({
        status: 'accepted',
        pick: 'random',
        archiver: mockArchiver,
        message: 'will report fake lost archiver',
      })
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'accepted',
        pick: 'random',
        archiver: mockArchiver,
        message: 'will report fake lost archiver',
        sign: { owner: 'test', sig: 'testsig' },
      })
    })

    it('should return failure when archiver not found', () => {
      ;(getRandomAvailableArchiver as jest.Mock).mockReturnValue(null)
      
      const mockReq = { query: {}, body: {} } as unknown as Request
      registeredHandlers.reportFake(mockReq, mockRes)
      
      expect(crypto.sign).toHaveBeenCalledWith({
        status: 'failed',
        pick: 'random',
        archiver: null,
        message: 'archiver not found',
      })
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'failed',
        pick: 'random',
        archiver: null,
        message: 'archiver not found',
        sign: { owner: 'test', sig: 'testsig' },
      })
    })
  })

  describe('registerRoutes', () => {
    it('should register all routes correctly', () => {
      // Routes are already registered in beforeEach
      
      // Check debug external route
      expect(network._registerExternal).toHaveBeenCalledWith(
        'GET',
        'report-fake-lost-archiver',
        isDebugModeMiddleware,
        expect.any(Function)
      )
      
      // Check external route
      expect(network._registerExternal).toHaveBeenCalledWith(
        'POST',
        'lost-archiver-refute',
        expect.any(Function)
      )
      
      // Check internal binary route
      expect(Comms.registerInternalBinary).toHaveBeenCalledWith(
        InternalRouteEnum.binary_lost_archiver_investigate,
        expect.any(Function)
      )
      
      // Check gossip handlers
      expect(Comms.registerGossipHandler).toHaveBeenCalledWith(
        'lost-archiver-up',
        expect.any(Function)
      )
      expect(Comms.registerGossipHandler).toHaveBeenCalledWith(
        'lost-archiver-down',
        expect.any(Function)
      )
    })
  })
})