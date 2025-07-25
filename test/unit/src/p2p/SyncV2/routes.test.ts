import { Request, Response } from 'express'

// Mock all dependencies before importing
const mockCycleChain = {
  getCurrentCycleMarker: jest.fn(),
  cyclesByMarker: {},
  newest: {},
}
jest.mock('../../../../../src/p2p/CycleChain', () => mockCycleChain)

const mockCycleCreator = {
  nextQ1Start: 0,
}
jest.mock('../../../../../src/p2p/CycleCreator', () => mockCycleCreator)

jest.mock('../../../../../src/p2p/NodeList', () => ({
  getNodeListHash: jest.fn(),
  getLastHashedNodeList: jest.fn(),
}))
jest.mock('../../../../../src/p2p/Archivers', () => ({
  getArchiverListHash: jest.fn(),
  getLastHashedArchiverList: jest.fn(),
}))
jest.mock('../../../../../src/p2p/Join/v2', () => ({
  getStandbyListHash: jest.fn(),
  getLastHashedStandbyList: jest.fn(),
}))
jest.mock('../../../../../src/p2p/ServiceQueue', () => ({
  getTxListHash: jest.fn(),
  getTxList: jest.fn(),
}))
jest.mock('../../../../../src/utils/profiler', () => ({
  profilerInstance: {
    scopedProfileSectionStart: jest.fn(),
    scopedProfileSectionEnd: jest.fn(),
  },
}))
jest.mock('../../../../../src/logger', () => ({
  logFlags: {
    debug: false,
  },
}))
jest.mock('../../../../../src/utils', () => ({
  jsonHttpResWithSize: jest.fn(),
}))
jest.mock('../../../../../src/p2p/Context', () => ({
  network: {
    _registerExternal: jest.fn(),
    registerExternalGet: jest.fn(),
  },
  setDefaultConfigs: jest.fn(),
}))

// Import after mocking
import * as CycleChain from '../../../../../src/p2p/CycleChain'
import * as NodeList from '../../../../../src/p2p/NodeList'
import * as Archivers from '../../../../../src/p2p/Archivers'
import * as CycleCreator from '../../../../../src/p2p/CycleCreator'
import * as JoinV2 from '../../../../../src/p2p/Join/v2'
import * as ServiceQueue from '../../../../../src/p2p/ServiceQueue'
import { profilerInstance } from '../../../../../src/utils/profiler'
import { logFlags } from '../../../../../src/logger'
import { jsonHttpResWithSize } from '../../../../../src/utils'
import { network } from '../../../../../src/p2p/Context'
import { initRoutes } from '../../../../../src/p2p/SyncV2/routes'

const mockedNodeList = NodeList as jest.Mocked<typeof NodeList>
const mockedArchivers = Archivers as jest.Mocked<typeof Archivers>
const mockedJoinV2 = JoinV2 as jest.Mocked<typeof JoinV2>
const mockedServiceQueue = ServiceQueue as jest.Mocked<typeof ServiceQueue>
const mockedJsonHttpResWithSize = jsonHttpResWithSize as jest.MockedFunction<typeof jsonHttpResWithSize>

describe('SyncV2 Routes', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>

  beforeEach(() => {
    mockReq = {
      query: {},
    }
    mockRes = {
      json: jest.fn(),
      send: jest.fn(),
      status: jest.fn().mockReturnThis(),
      write: jest.fn(),
      end: jest.fn(),
    }

    // Reset all mocks
    jest.clearAllMocks()

    // Setup default mock implementations
    mockedJsonHttpResWithSize.mockReturnValue(100)
  })

  describe('initRoutes', () => {
    it('should register all routes', () => {
      initRoutes()

      // 13 routes from main routes array + 4 cycle monitoring routes
      expect(network._registerExternal).toHaveBeenCalledTimes(13)
      expect(network.registerExternalGet).toHaveBeenCalledTimes(4)
      expect(network._registerExternal).toHaveBeenCalledWith('GET', 'validator-list-hash', expect.any(Function))
      expect(network._registerExternal).toHaveBeenCalledWith('GET', 'archiver-list-hash', expect.any(Function))
      expect(network._registerExternal).toHaveBeenCalledWith('GET', 'standby-list-hash', expect.any(Function))
      expect(network._registerExternal).toHaveBeenCalledWith('GET', 'tx-list-hash', expect.any(Function))
      expect(network._registerExternal).toHaveBeenCalledWith('GET', 'current-cycle-hash', expect.any(Function))
      expect(network._registerExternal).toHaveBeenCalledWith('GET', 'validator-list', expect.any(Function))
      expect(network._registerExternal).toHaveBeenCalledWith('GET', 'archiver-list', expect.any(Function))
      expect(network._registerExternal).toHaveBeenCalledWith('GET', 'standby-list', expect.any(Function))
      expect(network._registerExternal).toHaveBeenCalledWith('GET', 'tx-list', expect.any(Function))
      expect(network._registerExternal).toHaveBeenCalledWith('GET', 'cycle-by-marker', expect.any(Function))
      expect(network._registerExternal).toHaveBeenCalledWith('GET', 'newest-cycle-record', expect.any(Function))
    })
  })

  describe('validator-list-hash route', () => {
    it('should return nodeListHash and nextCycleTimestamp', () => {
      const mockHash = 'test-hash'
      const mockTimestamp = 123456789

      mockedNodeList.getNodeListHash.mockReturnValue(mockHash)
      mockCycleCreator.nextQ1Start = mockTimestamp

      // Get the handler from the registered routes
      initRoutes()
      const handler = (network._registerExternal as jest.Mock).mock.calls.find(
        (call: any) => call[1] === 'validator-list-hash'
      )[2]

      handler(mockReq, mockRes)

      expect(mockRes.json).toHaveBeenCalledWith({
        nodeListHash: mockHash,
        nextCycleTimestamp: mockTimestamp,
      })
    })
  })

  describe('archiver-list-hash route', () => {
    it('should return archiverListHash', () => {
      const mockHash = 'archiver-hash'
      mockedArchivers.getArchiverListHash.mockReturnValue(mockHash)

      initRoutes()
      const handler = (network._registerExternal as jest.Mock).mock.calls.find(
        (call: any) => call[1] === 'archiver-list-hash'
      )[2]

      handler(mockReq, mockRes)

      expect(mockRes.json).toHaveBeenCalledWith({
        archiverListHash: mockHash,
      })
    })
  })

  describe('standby-list-hash route', () => {
    it('should return standbyNodeListHash', () => {
      const mockHash = 'standby-hash'
      mockedJoinV2.getStandbyListHash.mockReturnValue(mockHash)

      initRoutes()
      const handler = (network._registerExternal as jest.Mock).mock.calls.find(
        (call: any) => call[1] === 'standby-list-hash'
      )[2]

      handler(mockReq, mockRes)

      expect(mockRes.json).toHaveBeenCalledWith({
        standbyNodeListHash: mockHash,
      })
    })
  })

  describe('tx-list-hash route', () => {
    it('should return txListHash', () => {
      const mockHash = 'tx-hash'
      mockedServiceQueue.getTxListHash.mockReturnValue(mockHash)

      initRoutes()
      const handler = (network._registerExternal as jest.Mock).mock.calls.find(
        (call: any) => call[1] === 'tx-list-hash'
      )[2]

      handler(mockReq, mockRes)

      expect(mockRes.send).toHaveBeenCalledWith({
        txListHash: mockHash,
      })
    })
  })

  describe('current-cycle-hash route', () => {
    it('should return currentCycleHash', () => {
      const mockHash = 'cycle-hash'
      mockCycleChain.getCurrentCycleMarker.mockReturnValue(mockHash)

      initRoutes()
      const handler = (network._registerExternal as jest.Mock).mock.calls.find(
        (call: any) => call[1] === 'current-cycle-hash'
      )[2]

      handler(mockReq, mockRes)

      expect(mockRes.json).toHaveBeenCalledWith({
        currentCycleHash: mockHash,
      })
    })
  })

  describe('validator-list route', () => {
    it('should return validator list when hash matches', () => {
      const mockHash = 'valid-hash'
      const mockNodeList = [] as any

      mockReq.query = { hash: mockHash }
      mockedNodeList.getNodeListHash.mockReturnValue(mockHash)
      mockedNodeList.getLastHashedNodeList.mockReturnValue(mockNodeList)

      initRoutes()
      const handler = (network._registerExternal as jest.Mock).mock.calls.find(
        (call: any) => call[1] === 'validator-list'
      )[2]

      handler(mockReq, mockRes)

      expect(mockedJsonHttpResWithSize).toHaveBeenCalledWith(mockRes, mockNodeList)
      expect(profilerInstance.scopedProfileSectionStart).toHaveBeenCalledWith('validator-list', false)
      expect(profilerInstance.scopedProfileSectionEnd).toHaveBeenCalledWith('validator-list', 100)
    })

    it('should return 404 when hash does not match', () => {
      const expectedHash = 'expected-hash'
      const actualHash = 'actual-hash'

      mockReq.query = { hash: expectedHash }
      mockedNodeList.getNodeListHash.mockReturnValue(actualHash)

      initRoutes()
      const handler = (network._registerExternal as jest.Mock).mock.calls.find(
        (call: any) => call[1] === 'validator-list'
      )[2]

      handler(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        error: `validator list with hash '${expectedHash}' not found`,
      })
    })

    it('should return 404 when no hash provided', () => {
      mockReq.query = {}

      initRoutes()
      const handler = (network._registerExternal as jest.Mock).mock.calls.find(
        (call: any) => call[1] === 'validator-list'
      )[2]

      handler(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        error: `validator list with hash 'undefined' not found`,
      })
    })
  })

  describe('archiver-list route', () => {
    it('should return archiver list when hash matches', () => {
      const mockHash = 'valid-hash'
      const mockArchiverList = [] as any

      mockReq.query = { hash: mockHash }
      mockedArchivers.getArchiverListHash.mockReturnValue(mockHash)
      mockedArchivers.getLastHashedArchiverList.mockReturnValue(mockArchiverList)

      initRoutes()
      const handler = (network._registerExternal as jest.Mock).mock.calls.find(
        (call: any) => call[1] === 'archiver-list'
      )[2]

      handler(mockReq, mockRes)

      expect(mockRes.json).toHaveBeenCalledWith(mockArchiverList)
      expect(profilerInstance.scopedProfileSectionStart).toHaveBeenCalledWith('archiver-list', false)
      expect(profilerInstance.scopedProfileSectionEnd).toHaveBeenCalledWith('archiver-list')
    })

    it('should return 404 when hash does not match', () => {
      const expectedHash = 'expected-hash'
      const actualHash = 'actual-hash'

      mockReq.query = { hash: expectedHash }
      mockedArchivers.getArchiverListHash.mockReturnValue(actualHash)

      initRoutes()
      const handler = (network._registerExternal as jest.Mock).mock.calls.find(
        (call: any) => call[1] === 'archiver-list'
      )[2]

      handler(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        error: `archiver list with hash '${expectedHash}' not found`,
      })
    })
  })

  describe('standby-list route', () => {
    it('should return standby list when hash matches', () => {
      const mockHash = 'valid-hash'
      const mockStandbyList = [] as any

      mockReq.query = { hash: mockHash }
      mockedJoinV2.getStandbyListHash.mockReturnValue(mockHash)
      mockedJoinV2.getLastHashedStandbyList.mockReturnValue(mockStandbyList)

      initRoutes()
      const handler = (network._registerExternal as jest.Mock).mock.calls.find(
        (call: any) => call[1] === 'standby-list'
      )[2]

      handler(mockReq, mockRes)

      expect(mockedJsonHttpResWithSize).toHaveBeenCalledWith(mockRes, mockStandbyList)
      expect(profilerInstance.scopedProfileSectionStart).toHaveBeenCalledWith('standby-list', false)
      expect(profilerInstance.scopedProfileSectionEnd).toHaveBeenCalledWith('standby-list', 100)
    })

    it('should return 404 when hash does not match', () => {
      const expectedHash = 'expected-hash'
      const actualHash = 'actual-hash'

      mockReq.query = { hash: expectedHash }
      mockedJoinV2.getStandbyListHash.mockReturnValue(actualHash)

      initRoutes()
      const handler = (network._registerExternal as jest.Mock).mock.calls.find(
        (call: any) => call[1] === 'standby-list'
      )[2]

      handler(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        error: `standby list with hash '${expectedHash}' not found`,
      })
    })
  })

  describe('tx-list route', () => {
    it('should return tx list when hash matches', () => {
      const mockHash = 'valid-hash'
      const mockTxList = [] as any

      mockReq.query = { hash: mockHash }
      mockedServiceQueue.getTxListHash.mockReturnValue(mockHash)
      mockedServiceQueue.getTxList.mockReturnValue(mockTxList)

      initRoutes()
      const handler = (network._registerExternal as jest.Mock).mock.calls.find((call: any) => call[1] === 'tx-list')[2]

      handler(mockReq, mockRes)

      expect(mockRes.json).toHaveBeenCalledWith(mockTxList)
      expect(profilerInstance.scopedProfileSectionStart).toHaveBeenCalledWith('tx-list', false)
      expect(profilerInstance.scopedProfileSectionEnd).toHaveBeenCalledWith('tx-list')
    })

    it('should return 404 when hash does not match', () => {
      const expectedHash = 'expected-hash'
      const actualHash = 'actual-hash'

      mockReq.query = { hash: expectedHash }
      mockedServiceQueue.getTxListHash.mockReturnValue(actualHash)

      initRoutes()
      const handler = (network._registerExternal as jest.Mock).mock.calls.find((call: any) => call[1] === 'tx-list')[2]

      handler(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.send).toHaveBeenCalledWith(`tx list with hash '${expectedHash}' not found`)
    })
  })

  describe('cycle-by-marker route', () => {
    it('should return cycle when marker exists', () => {
      const mockMarker = 'test-marker'
      const mockCycle = {} as any

      mockReq.query = { marker: mockMarker }
      mockCycleChain.cyclesByMarker = { [mockMarker]: mockCycle }

      initRoutes()
      const handler = (network._registerExternal as jest.Mock).mock.calls.find(
        (call: any) => call[1] === 'cycle-by-marker'
      )[2]

      handler(mockReq, mockRes)

      expect(mockRes.json).toHaveBeenCalledWith(mockCycle)
      expect(profilerInstance.scopedProfileSectionStart).toHaveBeenCalledWith('cycle-by-marker', false)
      expect(profilerInstance.scopedProfileSectionEnd).toHaveBeenCalledWith('cycle-by-marker')
    })

    it('should return 404 when marker does not exist', () => {
      const mockMarker = 'nonexistent-marker'

      mockReq.query = { marker: mockMarker }
      mockCycleChain.cyclesByMarker = {}

      initRoutes()
      const handler = (network._registerExternal as jest.Mock).mock.calls.find(
        (call: any) => call[1] === 'cycle-by-marker'
      )[2]

      handler(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        error: `cycle with marker '${mockMarker}' not found`,
      })
    })
  })

  describe('newest-cycle-record route', () => {
    it('should return newest cycle', () => {
      const mockNewestCycle = {} as any
      mockCycleChain.newest = mockNewestCycle

      initRoutes()
      const handler = (network._registerExternal as jest.Mock).mock.calls.find(
        (call: any) => call[1] === 'newest-cycle-record'
      )[2]

      handler(mockReq, mockRes)

      expect(mockRes.json).toHaveBeenCalledWith(mockNewestCycle)
      expect(profilerInstance.scopedProfileSectionStart).toHaveBeenCalledWith('newest-cycle-record', false)
      expect(profilerInstance.scopedProfileSectionEnd).toHaveBeenCalledWith('newest-cycle-record')
    })
  })
})
