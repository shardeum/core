import { jest } from '@jest/globals'

// Mock logger first before any imports
jest.mock('../../../../../src/logger', () => ({
  logger: {
    mainLog_debug: jest.fn(),
  },
  logFlags: {
    verbose: false,
    p2pNonFatal: false,
    console: false,
  },
}))

// Mock CycleAutoScale to prevent initialization errors
jest.mock('../../../../../src/p2p/CycleAutoScale', () => ({
  reset: jest.fn(),
}))

import { routes } from '../../../../../src/p2p/Join/routes'
import * as Comms from '../../../../../src/p2p/Comms'
import * as CycleChain from '../../../../../src/p2p/CycleChain'
import * as CycleCreator from '../../../../../src/p2p/CycleCreator'
import * as NodeList from '../../../../../src/p2p/NodeList'
import * as Self from '../../../../../src/p2p/Self'
import * as utils from '../../../../../src/utils'
import * as Join from '../../../../../src/p2p/Join'
import * as JoinV2 from '../../../../../src/p2p/Join/v2'
import * as acceptance from '../../../../../src/p2p/Join/v2/acceptance'
import * as syncFinished from '../../../../../src/p2p/Join/v2/syncFinished'
import * as unjoin from '../../../../../src/p2p/Join/v2/unjoin'
import * as syncStarted from '../../../../../src/p2p/Join/v2/syncStarted'
import * as standbyRefresh from '../../../../../src/p2p/Join/v2/standbyRefresh'
import { P2P } from '@shardeum-foundation/lib-types'
import { Response } from 'express'
import { EventEmitter } from 'events'

// Mock Result type for testing
const createOkResult = <T>(value: T): any => ({
  isErr: () => false,
  isOk: () => true,
  value,
})

const createErrResult = <E>(error: E): any => ({
  isErr: () => true,
  isOk: () => false,
  error,
})

// Mock modules
jest.mock('../../../../../src/p2p/Comms')
jest.mock('../../../../../src/p2p/CycleChain')
jest.mock('../../../../../src/p2p/CycleCreator')
jest.mock('../../../../../src/p2p/NodeList')
jest.mock('../../../../../src/p2p/Self')
jest.mock('../../../../../src/utils')
jest.mock('../../../../../src/p2p/Join')
jest.mock('../../../../../src/p2p/Join/v2')
jest.mock('../../../../../src/p2p/Join/v2/acceptance')
jest.mock('../../../../../src/p2p/Join/v2/syncFinished')
jest.mock('../../../../../src/p2p/Join/v2/unjoin')
jest.mock('../../../../../src/p2p/Join/v2/syncStarted')
jest.mock('../../../../../src/p2p/Join/v2/standbyRefresh')
jest.mock('../../../../../src/p2p/Context', () => ({
  config: {},
  shardus: {},
  setDefaultConfigs: jest.fn(),
}))
jest.mock('../../../../../src/utils/functions/checkIP')
jest.mock('../../../../../src/utils/isPortReachable')
jest.mock('../../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
  },
}))
jest.mock('../../../../../src/utils/profiler', () => ({
  profilerInstance: {
    scopedProfileSectionStart: jest.fn(),
    scopedProfileSectionEnd: jest.fn(),
  },
}))
jest.mock('../../../../../src/utils/GossipValidation')
jest.mock('../../../../../src/network', () => ({
  shardusGetTime: jest.fn(() => Date.now()),
}))
jest.mock('../../../../../src/types/ajv/Helpers')

// Import mocked modules
const mockedComms = Comms as jest.Mocked<typeof Comms>
const mockedCycleChain = CycleChain as jest.Mocked<typeof CycleChain>
const mockedCycleCreator = CycleCreator as jest.Mocked<typeof CycleCreator>
const mockedNodeList = NodeList as jest.Mocked<typeof NodeList>
const mockedSelf = Self as jest.Mocked<typeof Self>
const mockedUtils = utils as jest.Mocked<typeof utils>
const mockedJoin = Join as jest.Mocked<typeof Join>
const mockedJoinV2 = JoinV2 as jest.Mocked<typeof JoinV2>
const mockedAcceptance = acceptance as jest.Mocked<typeof acceptance>
const mockedSyncFinished = syncFinished as jest.Mocked<typeof syncFinished>
const mockedUnjoin = unjoin as jest.Mocked<typeof unjoin>
const mockedSyncStarted = syncStarted as jest.Mocked<typeof syncStarted>
const mockedStandbyRefresh = standbyRefresh as jest.Mocked<typeof standbyRefresh>

// Import mocked dependencies for setup
import { config, shardus } from '../../../../../src/p2p/Context'
import { isBogonIP } from '../../../../../src/utils/functions/checkIP'
import { isPortReachable } from '../../../../../src/utils/isPortReachable'
import { nestedCountersInstance } from '../../../../../src/utils/nestedCounters'
import { profilerInstance } from '../../../../../src/utils/profiler'
import { checkGossipPayload } from '../../../../../src/utils/GossipValidation'
import { shardusGetTime } from '../../../../../src/network'
import { verifyPayload } from '../../../../../src/types/ajv/Helpers'
import { logFlags } from '../../../../../src/logger'

// Type imports for mocking
import {
  JoinRequest,
  SignedUnjoinRequest,
  StartedSyncingRequest,
} from '@shardeum-foundation/lib-types/build/src/p2p/JoinTypes'
import { Utils } from '@shardeum-foundation/lib-types'
import { testFailChance } from '../../../../../src/utils'

const mockedConfig = config as jest.Mocked<typeof config>
const mockedShardus = shardus as jest.Mocked<typeof shardus>
const mockedIsBogonIP = isBogonIP as jest.MockedFunction<typeof isBogonIP>
const mockedIsPortReachable = isPortReachable as jest.MockedFunction<typeof isPortReachable>
const mockedNestedCounters = nestedCountersInstance as jest.Mocked<typeof nestedCountersInstance>
const mockedProfiler = profilerInstance as jest.Mocked<typeof profilerInstance>
const mockedCheckGossipPayload = checkGossipPayload as jest.MockedFunction<typeof checkGossipPayload>
const mockedShardusGetTime = shardusGetTime as jest.MockedFunction<typeof shardusGetTime>
const mockedVerifyPayload = verifyPayload as jest.MockedFunction<typeof verifyPayload>
const mockedLogFlags = logFlags as jest.Mocked<typeof logFlags>
const mockedTestFailChance = testFailChance as jest.MockedFunction<typeof testFailChance>

describe('p2p/Join/routes', () => {
  let req: any
  let res: any
  let eventEmitter: EventEmitter
  let mockNext: any

  beforeEach(() => {
    jest.clearAllMocks()

    // Setup request and response mocks
    req = {
      body: {},
      params: {},
    }

    res = {
      json: jest.fn(),
      send: jest.fn(),
      status: jest.fn().mockReturnThis(),
    }

    // Setup event emitter
    eventEmitter = new EventEmitter()
    mockNext = jest.fn()

    // Setup default mock implementations
    mockedConfig.p2p = {
      useJoinProtocolV2: true,
      forceBogonFilteringOn: false,
    } as any

    mockedConfig.debug = {
      ignoreStandbyRefreshChance: 0,
    } as any

    mockedShardus.app = {
      verifyAppJoinData: jest.fn().mockReturnValue(null) as any,
    } as any

    mockedCycleChain.newest = {
      previous: '1234567890abcdef',
      counter: 100,
    } as any

    mockedCycleCreator.currentQuarter = 1

    mockedNodeList.activeByIdOrder = []
    mockedNodeList.byPubKey = new Map() as any
    mockedNodeList.byIdOrder = []

    mockedSelf.isActive = true
    mockedSelf.isRestartNetwork = false
    mockedSelf.isFirst = false

    mockedUtils.validateTypes = jest.fn().mockReturnValue('') as any
    ;(mockedUtils as any).safeJsonParse = jest.fn().mockImplementation((str: string) => JSON.parse(str))
    ;(mockedUtils as any).safeStringify = jest.fn().mockImplementation((obj: any) => JSON.stringify(obj))
    ;(mockedUtils as any).sleep = jest.fn()

    mockedJoin.addJoinRequest = jest.fn().mockReturnValue({ success: true, reason: '', fatal: false }) as any
    mockedJoin.computeSelectionNum = jest.fn().mockReturnValue(createOkResult('12345')) as any
    mockedJoin.getAllowBogon = jest.fn().mockReturnValue(false) as any
    mockedJoin.setAllowBogon = jest.fn() as any
    mockedJoin.validateJoinRequest = jest.fn().mockReturnValue(null) as any
    mockedJoin.verifyJoinRequestSignature = jest.fn().mockReturnValue(null) as any
    mockedJoin.warn = jest.fn() as any
    mockedJoin.queueStandbyRefreshRequest = jest.fn() as any
    mockedJoin.queueJoinRequest = jest.fn() as any
    mockedJoin.queueUnjoinRequest = jest.fn() as any
    mockedJoin.verifyJoinRequestTypes = jest.fn().mockReturnValue(true) as any
    mockedJoin.nodeListFromStates = jest.fn().mockReturnValue([]) as any

    mockedJoinV2.getStandbyNodesInfoMap = jest.fn().mockReturnValue(new Map()) as any
    mockedJoinV2.saveJoinRequest = jest.fn() as any
    mockedJoinV2.isOnStandbyList = jest.fn().mockReturnValue(false) as any

    mockedAcceptance.getEventEmitter = jest.fn().mockReturnValue(eventEmitter) as any
    mockedAcceptance.getHasConfirmedAcceptance = jest.fn().mockReturnValue(false) as any
    mockedAcceptance.isAlreadyCheckingAcceptance = jest.fn().mockReturnValue(false) as any
    mockedAcceptance.confirmAcceptance = jest.fn() as any

    mockedSyncFinished.addFinishedSyncing = jest
      .fn()
      .mockReturnValue({ success: true, reason: '', fatal: false }) as any
    mockedUnjoin.processNewUnjoinRequest = jest.fn().mockReturnValue(createOkResult(undefined)) as any
    mockedUnjoin.removeUnjoinRequest = jest.fn() as any
    mockedSyncStarted.addSyncStarted = jest.fn().mockReturnValue({ success: true, reason: '', fatal: false }) as any
    mockedStandbyRefresh.addStandbyRefresh = jest
      .fn()
      .mockReturnValue({ success: true, reason: '', fatal: false }) as any

    mockedIsBogonIP.mockReturnValue(false)
    mockedIsPortReachable.mockResolvedValue(true)
    mockedCheckGossipPayload.mockReturnValue(true)
    mockedShardusGetTime.mockReturnValue(Date.now())
    mockedVerifyPayload.mockReturnValue(null)
    mockedTestFailChance.mockReturnValue(false)

    mockedLogFlags.p2pNonFatal = false
    mockedLogFlags.verbose = false
    mockedLogFlags.console = false

    mockedComms.sendGossip = jest.fn() as any

    // Mock Utils functions
    ;(Utils as any).safeJsonParse = JSON.parse
    ;(Utils as any).safeStringify = JSON.stringify
  })

  describe('external routes', () => {
    describe('cycleMarkerRoute', () => {
      const route = routes.external.find((r) => r.name === 'cyclemarker')

      it('should return cycle marker when cycle chain exists', () => {
        route?.handler(req, res as Response, (() => {}) as any)

        expect(res.json).toHaveBeenCalledWith({ marker: '1234567890abcdef' })
      })

      it('should return zeros when cycle chain is null', () => {
        mockedCycleChain.newest = null

        route?.handler(req, res as Response, (() => {}) as any)

        expect(res.json).toHaveBeenCalledWith({ marker: '0'.repeat(64) })
      })
    })

    describe('joinRoute', () => {
      const route = routes.external.find((r) => r.name === 'join')
      let validJoinRequest: JoinRequest

      beforeEach(() => {
        validJoinRequest = {
          nodeInfo: {
            publicKey: 'test-public-key',
            externalIp: '192.168.1.1',
            externalPort: 8080,
            internalIp: '10.0.0.1',
            internalPort: 8081,
            address: 'address',
            joinRequestTimestamp: 123456,
            activeTimestamp: 0,
            activeCycle: 0,
            cycleJoined: 0,
            counterRefreshed: 0,
          } as any,
          cycleMarker: 'cycle-marker',
          proofOfWork: 'proof',
          version: '1.0.0',
          sign: { owner: 'owner', sig: 'signature' },
          appJoinData: {},
          selectionNum: '12345',
        }
        req.body = validJoinRequest
      })

      it('should reject request with validation errors', async () => {
        mockedVerifyPayload.mockReturnValue(['Invalid field: nodeInfo'])

        await route?.handler(req, res as Response, (() => {}) as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          fatal: true,
          reason: 'Validation error: Invalid field: nodeInfo',
        })
      })

      it('should reject request with app join data errors', async () => {
        ;(mockedShardus.app.verifyAppJoinData as any).mockReturnValue(['Invalid app data'])

        await route?.handler(req, res as Response, (() => {}) as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          fatal: true,
          reason: 'Validation error: Invalid app data',
        })
      })

      it('should reject request when node is not active', async () => {
        mockedSelf.isActive = false
        mockedSelf.isRestartNetwork = false

        await route?.handler(req, res as Response, (() => {}) as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          fatal: false,
          reason: 'this node is not active yet',
        })
      })

      it('should reject request when currentQuarter < 1', async () => {
        mockedCycleCreator.currentQuarter = 0

        await route?.handler(req, res as Response, (() => {}) as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          fatal: false,
          reason: "Can't join before quarter 1",
        })
      })

      it('should allow bogon IP for first node in restart network', async () => {
        mockedNodeList.activeByIdOrder = [{ id: 'node1' } as any]
        mockedSelf.isRestartNetwork = true
        mockedSelf.isFirst = true
        mockedIsBogonIP.mockReturnValue(true)

        await route?.handler(req, res as Response, (() => {}) as any)

        expect(mockedJoin.setAllowBogon).toHaveBeenCalledWith(true)
      })

      it('should reject when external port is not reachable', async () => {
        mockedIsPortReachable.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

        await route?.handler(req, res as Response, (() => {}) as any)

        expect(res.json).toHaveBeenCalledWith({
          success: false,
          fatal: true,
          reason: expect.stringContaining('IP or Port is not reachable'),
        })
      })

      it('should reject when internal port is not reachable', async () => {
        mockedIsPortReachable.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

        await route?.handler(req, res as Response, (() => {}) as any)

        expect(res.json).toHaveBeenCalledWith({
          success: false,
          fatal: true,
          reason: expect.stringContaining('IP or Port is not reachable'),
        })
      })

      describe('with Join Protocol V2', () => {
        beforeEach(() => {
          mockedConfig.p2p.useJoinProtocolV2 = true
        })

        it('should reject if node is already in standby', async () => {
          const standbyMap = new Map([['test-public-key', {}]])
          mockedJoinV2.getStandbyNodesInfoMap.mockReturnValue(standbyMap as any)

          await route?.handler(req, res as Response, (() => {}) as any)

          expect(res.status).toHaveBeenCalledWith(400)
          expect(res.json).toHaveBeenCalledWith({
            success: false,
            fatal: false,
            reason: expect.stringContaining('already exists as a standby node'),
          })
        })

        it('should reject invalid join request', async () => {
          mockedJoin.validateJoinRequest.mockReturnValue({
            success: false,
            fatal: true,
            reason: 'Invalid request',
          })

          await route?.handler(req, res as Response, (() => {}) as any)

          expect(res.status).toHaveBeenCalledWith(400)
          expect(res.json).toHaveBeenCalledWith({
            success: false,
            fatal: true,
            reason: 'Invalid request',
          })
        })

        it('should reject with signature error', async () => {
          mockedJoin.verifyJoinRequestSignature.mockReturnValue({
            success: false,
            fatal: true,
            reason: 'Invalid signature',
          })

          await route?.handler(req, res as Response, (() => {}) as any)

          expect(res.status).toHaveBeenCalledWith(400)
          expect(res.json).toHaveBeenCalledWith({
            success: false,
            fatal: true,
            reason: 'Invalid signature',
          })
        })

        it('should reject when selection number computation fails', async () => {
          mockedJoin.computeSelectionNum.mockReturnValue(
            createErrResult({ success: false, fatal: true, reason: 'Computation failed' })
          )

          await route?.handler(req, res as Response, (() => {}) as any)

          expect(res.status).toHaveBeenCalledWith(500)
          expect(res.json).toHaveBeenCalledWith({
            success: false,
            fatal: true,
            reason: 'Computation failed',
          })
        })

        it('should reject late join requests after Q1', async () => {
          mockedCycleCreator.currentQuarter = 2

          await route?.handler(req, res as Response, (() => {}) as any)

          expect(res.status).toHaveBeenCalledWith(400)
          expect(res.json).toHaveBeenCalledWith({
            success: false,
            fatal: false,
            reason: "Can't join after quarter 1",
          })
        })

        it('should successfully process valid join request', async () => {
          await route?.handler(req, res as Response, (() => {}) as any)

          expect(mockedJoin.queueJoinRequest).toHaveBeenCalledWith(
            expect.objectContaining({
              ...validJoinRequest,
              selectionNum: '12345',
            })
          )
          expect(res.status).toHaveBeenCalledWith(200)
          expect(res.json).toHaveBeenCalledWith({
            success: true,
            numStandbyNodes: 0,
          })
        })
      })

      describe('with old Join Protocol', () => {
        beforeEach(() => {
          mockedConfig.p2p.useJoinProtocolV2 = false
        })

        it('should process join request and gossip on success', async () => {
          mockedJoin.addJoinRequest.mockReturnValue({ success: true, reason: '', fatal: false })

          await route?.handler(req, res as Response, (() => {}) as any)

          expect(mockedComms.sendGossip).toHaveBeenCalledWith('gossip-join', validJoinRequest, '', null, [], true)
          expect(res.json).toHaveBeenCalledWith({ success: true, reason: '', fatal: false })
        })

        it('should not gossip on failed join request', async () => {
          mockedJoin.addJoinRequest.mockReturnValue({ success: false, reason: '', fatal: false })

          await route?.handler(req, res as Response, (() => {}) as any)

          expect(mockedComms.sendGossip).not.toHaveBeenCalled()
          expect(res.json).toHaveBeenCalledWith({ success: false, reason: '', fatal: false })
        })
      })

      it('should handle exceptions gracefully', async () => {
        mockedVerifyPayload.mockImplementation(() => {
          throw new Error('Unexpected error')
        })

        await route?.handler(req, res as Response, (() => {}) as any)

        expect(res.status).toHaveBeenCalledWith(500)
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          fatal: true,
          reason: 'An error occurred while processing the join request',
        })
      })
    })

    describe('unjoinRoute', () => {
      const route = routes.external.find((r) => r.name === 'unjoin')

      it('should process valid unjoin request', () => {
        const unjoinRequest = { publicKey: 'test-key' }
        req.body = unjoinRequest

        route?.handler(req, res as Response, (() => {}) as any)

        expect(mockedUnjoin.processNewUnjoinRequest).toHaveBeenCalledWith(unjoinRequest)
        expect(mockedUnjoin.removeUnjoinRequest).toHaveBeenCalledWith('test-key')
        expect(mockedJoin.queueUnjoinRequest).toHaveBeenCalledWith(unjoinRequest)
        expect(res.status).toHaveBeenCalledWith(200)
        expect(res.json).toHaveBeenCalledWith({ message: 'Unjoin request processed successfully' })
      })

      it('should handle process errors', () => {
        mockedUnjoin.processNewUnjoinRequest.mockReturnValue(
          createErrResult({ message: 'Processing failed', name: 'Error' } as Error)
        )
        req.body = { publicKey: 'test-key' }

        route?.handler(req, res as Response, (() => {}) as any)

        expect(res.status).toHaveBeenCalledWith(500)
        expect(res.json).toHaveBeenCalledWith({ error: 'Processing failed' })
      })

      it('should handle exceptions', () => {
        mockedUnjoin.processNewUnjoinRequest.mockImplementation(() => {
          throw new Error('Unexpected error')
        })
        req.body = { publicKey: 'test-key' }

        route?.handler(req, res as Response, (() => {}) as any)

        expect(res.status).toHaveBeenCalledWith(500)
        expect(res.json).toHaveBeenCalledWith({ error: 'Unexpected error' })
      })
    })

    describe('standbyRefreshRoute', () => {
      const route = routes.external.find((r) => r.name === 'standby-refresh')

      it('should process valid standby refresh request', async () => {
        req.body = { publicKey: 'test-key' }

        await route?.handler(req, res as Response, (() => {}) as any)

        expect(mockedJoin.queueStandbyRefreshRequest).toHaveBeenCalledWith('test-key')
        expect(res.status).toHaveBeenCalledWith(200)
        expect(res.json).toHaveBeenCalledWith()
      })

      it('should reject invalid ignoreStandbyRefreshChance config', async () => {
        mockedConfig.debug.ignoreStandbyRefreshChance = 1.5

        await route?.handler(req, res as Response, (() => {}) as any)

        expect(res.status).toHaveBeenCalledWith(500)
        expect(res.json).toHaveBeenCalledWith({ error: 'invalid config.debug.ignoreStandbyRefreshChance value' })
      })

      it('should simulate timeout when test fail chance triggers', async () => {
        mockedConfig.debug.ignoreStandbyRefreshChance = 0.5
        mockedTestFailChance.mockReturnValue(true)
        req.body = { publicKey: 'test-key' }

        await route?.handler(req, res as Response, (() => {}) as any)

        expect(mockedUtils.sleep).toHaveBeenCalledWith(3000)
        expect(res.status).toHaveBeenCalledWith(500)
        expect(res.json).toHaveBeenCalledWith({ error: 'simulated timeout' })
      })

      it('should handle invalid request body', async () => {
        mockedUtils.validateTypes.mockReturnValue('Invalid body')
        req.body = { publicKey: 'test-key' }

        await route?.handler(req, res as Response, (() => {}) as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith()
      })

      it('should handle non-string public key', async () => {
        req.body = { publicKey: 123 }

        await route?.handler(req, res as Response, (() => {}) as any)

        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith()
      })
    })

    describe('joinedV2Route', () => {
      const route = routes.external.find((r) => r.name === 'joinedV2/:publicKey')

      it('should return node id and standby status', () => {
        const node = { id: 'node-123' } as any
        mockedNodeList.byPubKey.set('test-key', node)
        mockedJoinV2.isOnStandbyList.mockReturnValue(true)
        req.params = { publicKey: 'test-key' }

        route?.handler(req, res as Response, (() => {}) as any)

        expect(res.json).toHaveBeenCalledWith({ id: 'node-123', isOnStandbyList: true })
      })

      it('should return null id when node not found', () => {
        req.params = { publicKey: 'unknown-key' }

        route?.handler(req, res as Response, (() => {}) as any)

        expect(res.json).toHaveBeenCalledWith({ id: null, isOnStandbyList: false })
      })

      it('should handle invalid params', () => {
        mockedUtils.validateTypes.mockReturnValueOnce('Invalid params')
        req.params = {}

        route?.handler(req, res as Response, (() => {}) as any)

        expect(res.json).toHaveBeenCalledWith()
      })
    })

    describe('joinedRoute', () => {
      const route = routes.external.find((r) => r.name === 'joined/:publicKey')

      it('should return full node info', () => {
        const node = { id: 'node-123', publicKey: 'test-key' } as any
        mockedNodeList.byPubKey.set('test-key', node)
        req.params = { publicKey: 'test-key' }

        route?.handler(req, res as Response, (() => {}) as any)

        expect(res.json).toHaveBeenCalledWith({ node })
      })

      it('should return undefined node when not found', () => {
        req.params = { publicKey: 'unknown-key' }

        route?.handler(req, res as Response, (() => {}) as any)

        expect(res.json).toHaveBeenCalledWith({ node: undefined })
      })
    })

    describe('acceptedRoute', () => {
      const route = routes.external.find((r) => r.name === 'accepted')

      it('should emit accepted event', async () => {
        const emitSpy = jest.spyOn(eventEmitter, 'emit')

        await route?.handler(req, res as Response, (() => {}) as any)

        expect(emitSpy).toHaveBeenCalledWith('accepted')
      })
    })
  })

  describe('gossip routes', () => {
    describe('gossip-join', () => {
      const handler = routes.gossip['gossip-join']

      it('should process valid gossip join with old protocol', () => {
        mockedConfig.p2p.useJoinProtocolV2 = false
        const payload = {
          nodeInfo: {},
          selectionNum: '123',
          cycleMarker: 'marker',
          proofOfWork: 'pow',
          version: '1.0',
          sign: {},
          appJoinData: {},
        }

        handler(payload as any, 'sender-id', 'tracker-123', 100)

        expect(mockedJoin.addJoinRequest).toHaveBeenCalledWith(payload)
        expect(mockedComms.sendGossip).toHaveBeenCalledWith(
          'gossip-join',
          payload,
          'tracker-123',
          'sender-id',
          [],
          false
        )
      })

      it('should ignore gossip with new protocol', () => {
        mockedConfig.p2p.useJoinProtocolV2 = true

        handler({} as any, 'sender-id', 'tracker-123', 100)

        expect(mockedJoin.addJoinRequest).not.toHaveBeenCalled()
      })

      it('should reject invalid payload', () => {
        mockedConfig.p2p.useJoinProtocolV2 = false
        mockedCheckGossipPayload.mockReturnValue(false)

        handler({} as any, 'sender-id', 'tracker-123', 100)

        expect(mockedJoin.addJoinRequest).not.toHaveBeenCalled()
      })
    })

    describe('gossip-valid-join-requests', () => {
      const handler = routes.gossip['gossip-valid-join-requests']
      let validPayload: any

      beforeEach(() => {
        validPayload = {
          joinRequest: {
            nodeInfo: { publicKey: 'test-key' },
            cycleMarker: 'marker',
            proofOfWork: 'pow',
            version: '1.0',
            sign: {},
            appJoinData: {},
          },
          sign: {},
        }
      })

      it('should process valid join request gossip', () => {
        handler(validPayload, 'sender-id', 'tracker-123', 100)

        expect(mockedJoinV2.saveJoinRequest).toHaveBeenCalled()
        expect(mockedComms.sendGossip).toHaveBeenCalledWith(
          'gossip-valid-join-requests',
          validPayload,
          'tracker-123',
          'sender-id',
          [],
          false
        )
      })

      it('should reject if already in standby', () => {
        const standbyMap = new Map([['test-key', {} as any]])
        mockedJoinV2.getStandbyNodesInfoMap.mockReturnValue(standbyMap)

        handler(validPayload, 'sender-id', 'tracker-123', 100)

        expect(mockedJoinV2.saveJoinRequest).not.toHaveBeenCalled()
      })

      it('should reject invalid join request', () => {
        mockedJoin.validateJoinRequest.mockReturnValue({ success: false, reason: 'Invalid', fatal: true })

        handler(validPayload, 'sender-id', 'tracker-123', 100)

        expect(mockedJoinV2.saveJoinRequest).not.toHaveBeenCalled()
      })

      it('should reject signature errors', () => {
        mockedJoin.verifyJoinRequestSignature.mockReturnValue({
          success: false,
          reason: 'Invalid signature',
          fatal: true,
        })

        handler(validPayload, 'sender-id', 'tracker-123', 100)

        expect(mockedJoinV2.saveJoinRequest).not.toHaveBeenCalled()
      })

      it('should reject selection number computation errors', () => {
        mockedJoin.computeSelectionNum.mockReturnValue(
          createErrResult({ success: false, reason: 'failed', fatal: true })
        )

        handler(validPayload, 'sender-id', 'tracker-123', 100)

        expect(mockedJoinV2.saveJoinRequest).not.toHaveBeenCalled()
      })
    })

    describe('gossip-unjoin', () => {
      const handler = routes.gossip['gossip-unjoin']

      it('should process valid unjoin gossip', () => {
        const payload = { publicKey: 'test-key', sign: {} }

        handler(payload as any, 'sender-id', 'tracker-123', 100)

        expect(mockedUnjoin.processNewUnjoinRequest).toHaveBeenCalledWith(payload)
        expect(mockedComms.sendGossip).toHaveBeenCalled()
      })

      it('should reject processing errors', () => {
        mockedUnjoin.processNewUnjoinRequest.mockReturnValue(createErrResult(new Error('Failed')))
        const payload = { publicKey: 'test-key', sign: {} }

        handler(payload as any, 'sender-id', 'tracker-123', 100)

        expect(mockedComms.sendGossip).not.toHaveBeenCalled()
      })
    })

    describe('gossip-sync-started', () => {
      const handler = routes.gossip['gossip-sync-started']

      it('should process valid sync started gossip', () => {
        const payload = { nodeId: 'node-123', cycleNumber: 100, sign: {} }

        handler(payload as any, 'sender-id', 'tracker-123', 100)

        expect(mockedSyncStarted.addSyncStarted).toHaveBeenCalledWith(payload)
        expect(mockedComms.sendGossip).toHaveBeenCalled()
      })

      it('should not gossip on validation failure', () => {
        mockedSyncStarted.addSyncStarted.mockReturnValue({ success: false, reason: 'Failed', fatal: false })
        const payload = { nodeId: 'node-123', cycleNumber: 100, sign: {} }

        handler(payload as any, 'sender-id', 'tracker-123', 100)

        expect(mockedComms.sendGossip).not.toHaveBeenCalled()
      })
    })

    describe('gossip-sync-finished', () => {
      const handler = routes.gossip['gossip-sync-finished']

      it('should process valid sync finished gossip', () => {
        const payload = { nodeId: 'node-123', cycleNumber: 100, sign: {} }

        handler(payload as any, 'sender-id', 'tracker-123', 100)

        expect(mockedSyncFinished.addFinishedSyncing).toHaveBeenCalledWith(payload)
        expect(mockedComms.sendGossip).toHaveBeenCalled()
      })

      it('should not gossip on validation failure', () => {
        mockedSyncFinished.addFinishedSyncing.mockReturnValue({ success: false, reason: 'Invalid', fatal: false })
        const payload = { nodeId: 'node-123', cycleNumber: 100, sign: {} }

        handler(payload as any, 'sender-id', 'tracker-123', 100)

        expect(mockedComms.sendGossip).not.toHaveBeenCalled()
      })
    })

    describe('gossip-standby-refresh', () => {
      const handler = routes.gossip['gossip-standby-refresh']

      it('should process valid standby refresh gossip', async () => {
        const payload = { publicKey: 'test-key', cycleNumber: 100, sign: {} }

        handler(payload as any, 'sender-id', 'tracker-123', 100)

        expect(mockedStandbyRefresh.addStandbyRefresh).toHaveBeenCalledWith(payload)
        expect(mockedComms.sendGossip).toHaveBeenCalled()
      })

      it('should not gossip on validation failure', async () => {
        mockedStandbyRefresh.addStandbyRefresh.mockReturnValue({ success: false, reason: 'Failed', fatal: false })
        const payload = { publicKey: 'test-key', cycleNumber: 100, sign: {} }

        handler(payload as any, 'sender-id', 'tracker-123', 100)

        expect(mockedComms.sendGossip).not.toHaveBeenCalled()
      })
    })
  })
})
