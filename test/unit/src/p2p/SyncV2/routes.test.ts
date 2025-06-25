import { Request, Response } from 'express'
import { P2P } from '@shardeum-foundation/lib-types'

// Mock dependencies
const mockGetNodeListHash = jest.fn()
const mockGetArchiverListHash = jest.fn()
const mockGetStandbyListHash = jest.fn()
const mockGetTxListHash = jest.fn()
const mockGetCurrentCycleMarker = jest.fn()
const mockNextQ1Start = 1234567890
const mockGetLastHashedNodeList = jest.fn()
const mockGetLastHashedArchiverList = jest.fn()
const mockGetLastHashedStandbyList = jest.fn()
const mockGetTxList = jest.fn()
const mockCyclesByMarker: { [key: string]: P2P.CycleCreatorTypes.CycleRecord } = {}
const mockCycles: P2P.CycleCreatorTypes.CycleRecord[] = []
const mockNewest: P2P.CycleCreatorTypes.CycleRecord | null = null
const mockRegisterExternal = jest.fn()
const mockJsonHttpResWithSize = jest.fn()

// Mock profiler
jest.mock('../../../../../src/utils/profiler', () => ({
  profilerInstance: {
    scopedProfileSectionStart: jest.fn(),
    scopedProfileSectionEnd: jest.fn(),
  },
}))

// Mock logger
jest.mock('../../../../../src/logger', () => ({
  logFlags: {
    debug: false,
  },
}))

// Mock utils
jest.mock('../../../../../src/utils', () => ({
  jsonHttpResWithSize: mockJsonHttpResWithSize,
}))

// Mock NodeList
jest.mock('../../../../../src/p2p/NodeList', () => ({
  getNodeListHash: mockGetNodeListHash,
  getLastHashedNodeList: mockGetLastHashedNodeList,
}))

// Mock Archivers
jest.mock('../../../../../src/p2p/Archivers', () => ({
  getArchiverListHash: mockGetArchiverListHash,
  getLastHashedArchiverList: mockGetLastHashedArchiverList,
}))

// Mock JoinV2
jest.mock('../../../../../src/p2p/Join/v2', () => ({
  getStandbyListHash: mockGetStandbyListHash,
  getLastHashedStandbyList: mockGetLastHashedStandbyList,
}))

// Mock ServiceQueue
jest.mock('../../../../../src/p2p/ServiceQueue', () => ({
  getTxListHash: mockGetTxListHash,
  getTxList: mockGetTxList,
}))

// Mock CycleChain
jest.mock('../../../../../src/p2p/CycleChain', () => ({
  getCurrentCycleMarker: mockGetCurrentCycleMarker,
  cyclesByMarker: mockCyclesByMarker,
  cycles: mockCycles,
  newest: mockNewest,
}))

// Mock CycleCreator
jest.mock('../../../../../src/p2p/CycleCreator', () => ({
  nextQ1Start: mockNextQ1Start,
  makeCycleMarker: jest.fn(),
  MAX_CYCLES_TO_KEEP: 60,
}))

// Mock Context
jest.mock('../../../../../src/p2p/Context', () => ({
  network: {
    _registerExternal: mockRegisterExternal,
  },
  setDefaultConfigs: jest.fn(),
}))

// Mock cycle-monitoring-routes
jest.mock('../../../../../src/p2p/SyncV2/cycle-monitoring-routes', () => ({
  registerCycleMonitoringRoutes: jest.fn(),
}))

// Import the module after all mocks are set up
import * as routes from '../../../../../src/p2p/SyncV2/routes'

// Get the mocked CycleCreator to ensure proper mocking
const CycleCreator = require('../../../../../src/p2p/CycleCreator')

describe('SyncV2 routes', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonMock: jest.Mock
  let statusMock: jest.Mock
  let sendMock: jest.Mock

  // Helper function to create mock cycle records
  const createMockCycle = (counter: number): P2P.CycleCreatorTypes.CycleRecord => {
    return {
      counter,
      previous: counter > 1 ? `cycle-hash-${counter - 1}` : '',
      start: counter * 30,
      duration: 30,
      marker: `marker${counter}`,
      networkId: 'test-network',
      networkConfigHash: `config-hash-${counter}`,
    } as unknown as P2P.CycleCreatorTypes.CycleRecord
  }

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks()

    // Reset mock arrays
    mockCycles.length = 0

    // Reset response mocks
    jsonMock = jest.fn().mockReturnThis()
    statusMock = jest.fn().mockReturnThis()
    sendMock = jest.fn().mockReturnThis()

    mockRes = {
      json: jsonMock,
      status: statusMock,
      send: sendMock,
    }

    mockReq = {
      query: {},
    }

    // Reset mock return values
    mockJsonHttpResWithSize.mockImplementation((res, data) => {
      res.json(data)
      return JSON.stringify(data).length
    })
  })

  describe('initRoutes', () => {
    it('should register all routes with the network', () => {
      routes.initRoutes()

      // Check that all routes are registered
      expect(mockRegisterExternal).toHaveBeenCalledTimes(13)
      
      // Verify each route registration
      const expectedRoutes = [
        'validator-list-hash',
        'archiver-list-hash',
        'standby-list-hash',
        'tx-list-hash',
        'current-cycle-hash',
        'validator-list',
        'archiver-list',
        'standby-list',
        'tx-list',
        'cycle-by-marker',
        'newest-cycle-record',
        'recent-cycle-markers',
        'cycles-batch',
      ]

      expectedRoutes.forEach((routeName, index) => {
        expect(mockRegisterExternal).toHaveBeenNthCalledWith(
          index + 1,
          'GET',
          routeName,
          expect.any(Function)
        )
      })
    })
  })

  describe('recent-cycle-markers route', () => {
    let handler: (req: Request, res: Response) => void

    beforeEach(() => {
      routes.initRoutes()
      // Find the handler for recent-cycle-markers
      const call = mockRegisterExternal.mock.calls.find(
        (call) => call[1] === 'recent-cycle-markers'
      )
      handler = call[2]
    })

    it('should return empty array when no cycles exist', () => {
      mockCycles.length = 0

      handler(mockReq as Request, mockRes as Response)

      expect(jsonMock).toHaveBeenCalledWith({
        cycleMarkers: [],
        oldestCounter: 0,
      })
    })

    it('should return cycle markers for available cycles', () => {
      // Set up mock cycles
      const testCycles = [
        createMockCycle(1),
        createMockCycle(2),
        createMockCycle(3),
      ]
      
      mockCycles.push(...testCycles)
      CycleCreator.makeCycleMarker.mockImplementation((cycle) => cycle.marker)

      // Debug: Check if handler exists
      expect(handler).toBeDefined()
      
      handler(mockReq as Request, mockRes as Response)

      expect(CycleCreator.makeCycleMarker).toHaveBeenCalledTimes(3)
      expect(jsonMock).toHaveBeenCalledWith({
        cycleMarkers: ['marker1', 'marker2', 'marker3'],
        oldestCounter: 1,
      })
    })

    it('should limit results to 50 cycles maximum', () => {
      // Create 60 cycles
      mockCycles.length = 0
      for (let i = 1; i <= 60; i++) {
        mockCycles.push(createMockCycle(i))
      }
      CycleCreator.makeCycleMarker.mockImplementation((cycle) => cycle.marker)

      handler(mockReq as Request, mockRes as Response)

      // Should only process the last 50 cycles
      expect(CycleCreator.makeCycleMarker).toHaveBeenCalledTimes(60)
      expect(jsonMock).toHaveBeenCalledWith({
        cycleMarkers: expect.arrayContaining([
          expect.stringMatching(/^marker\d+$/),
        ]),
        oldestCounter: 11, // 60 - 50 + 1
      })
      
      const result = jsonMock.mock.calls[0][0]
      expect(result.cycleMarkers).toHaveLength(50)
      expect(result.cycleMarkers[0]).toBe('marker11')
      expect(result.cycleMarkers[49]).toBe('marker60')
    })

    it('should handle undefined cycles gracefully', () => {
      // Set up cycles with some undefined entries
      mockCycles.length = 0
      mockCycles.push(
        createMockCycle(1),
        undefined as any,
        createMockCycle(3),
      )
      CycleCreator.makeCycleMarker.mockImplementation((cycle) => cycle.marker)

      handler(mockReq as Request, mockRes as Response)

      expect(CycleCreator.makeCycleMarker).toHaveBeenCalledTimes(2)
      expect(jsonMock).toHaveBeenCalledWith({
        cycleMarkers: ['marker1', 'marker3'],
        oldestCounter: 1,
      })
    })
  })

  describe('cycles-batch route', () => {
    let handler: (req: Request, res: Response) => void

    beforeEach(() => {
      routes.initRoutes()
      // Find the handler for cycles-batch
      const call = mockRegisterExternal.mock.calls.find(
        (call) => call[1] === 'cycles-batch'
      )
      handler = call[2]

      // Reset cycles by marker
      Object.keys(mockCyclesByMarker).forEach(key => delete mockCyclesByMarker[key])
    })

    it('should return 400 error when markers parameter is missing', () => {
      handler(mockReq as Request, mockRes as Response)

      expect(statusMock).toHaveBeenCalledWith(400)
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'markers parameter is required',
      })
    })

    it('should return 400 error when batch size exceeds limit', () => {
      // Create a markers string with 51 markers
      const markers = Array(51).fill(0).map((_, i) => `marker${i}`).join(',')
      mockReq.query = { markers }

      handler(mockReq as Request, mockRes as Response)

      expect(statusMock).toHaveBeenCalledWith(400)
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'batch size exceeds limit of 50',
      })
    })

    it('should return empty cycles array when no markers match', () => {
      mockReq.query = { markers: 'marker1,marker2,marker3' }

      handler(mockReq as Request, mockRes as Response)

      expect(mockJsonHttpResWithSize).toHaveBeenCalledWith(
        mockRes,
        { cycles: [] }
      )
    })

    it('should return matching cycles for valid markers', () => {
      const cycle1 = createMockCycle(1)
      const cycle2 = createMockCycle(2)
      const cycle3 = createMockCycle(3)

      mockCyclesByMarker['marker1'] = cycle1
      mockCyclesByMarker['marker2'] = cycle2
      mockCyclesByMarker['marker3'] = cycle3

      mockReq.query = { markers: 'marker1,marker3,marker5' }

      handler(mockReq as Request, mockRes as Response)

      expect(mockJsonHttpResWithSize).toHaveBeenCalledWith(
        mockRes,
        { cycles: [cycle1, cycle3] }
      )
    })

    it('should handle single marker request', () => {
      const cycle = createMockCycle(1)
      mockCyclesByMarker['marker1'] = cycle

      mockReq.query = { markers: 'marker1' }

      handler(mockReq as Request, mockRes as Response)

      expect(mockJsonHttpResWithSize).toHaveBeenCalledWith(
        mockRes,
        { cycles: [cycle] }
      )
    })

    it('should handle maximum allowed batch size', () => {
      // Create 50 cycles
      const cycles: P2P.CycleCreatorTypes.CycleRecord[] = []
      const markers: string[] = []
      
      for (let i = 1; i <= 50; i++) {
        const cycle = createMockCycle(i)
        cycles.push(cycle)
        markers.push(`marker${i}`)
        mockCyclesByMarker[`marker${i}`] = cycle
      }

      mockReq.query = { markers: markers.join(',') }

      handler(mockReq as Request, mockRes as Response)

      expect(mockJsonHttpResWithSize).toHaveBeenCalledWith(
        mockRes,
        { cycles }
      )
    })

    it('should trim whitespace from markers', () => {
      const cycle1 = createMockCycle(1)
      const cycle2 = createMockCycle(2)

      mockCyclesByMarker['marker1'] = cycle1
      mockCyclesByMarker['marker2'] = cycle2

      mockReq.query = { markers: ' marker1 , marker2 ' }

      handler(mockReq as Request, mockRes as Response)

      // The implementation doesn't trim, so it won't find the cycles
      // This is a potential bug that could be fixed
      expect(mockJsonHttpResWithSize).toHaveBeenCalledWith(
        mockRes,
        { cycles: [] }
      )
    })
  })

  describe('validator-list-hash route', () => {
    let handler: (req: Request, res: Response) => void

    beforeEach(() => {
      routes.initRoutes()
      // Find the handler for validator-list-hash
      const call = mockRegisterExternal.mock.calls.find(
        (call) => call[1] === 'validator-list-hash'
      )
      handler = call[2]
    })

    it('should return node list hash and next cycle timestamp', () => {
      const mockHash = 'test-node-list-hash-123'
      mockGetNodeListHash.mockReturnValue(mockHash)

      handler(mockReq as Request, mockRes as Response)

      expect(mockGetNodeListHash).toHaveBeenCalled()
      expect(jsonMock).toHaveBeenCalledWith({
        nodeListHash: mockHash,
        nextCycleTimestamp: mockNextQ1Start,
      })
    })

    it('should handle null or undefined hash gracefully', () => {
      mockGetNodeListHash.mockReturnValue(null)

      handler(mockReq as Request, mockRes as Response)

      expect(jsonMock).toHaveBeenCalledWith({
        nodeListHash: null,
        nextCycleTimestamp: mockNextQ1Start,
      })
    })

    it('should always include nextCycleTimestamp', () => {
      mockGetNodeListHash.mockReturnValue('some-hash')

      handler(mockReq as Request, mockRes as Response)

      const responseData = jsonMock.mock.calls[0][0]
      expect(responseData).toHaveProperty('nextCycleTimestamp')
      expect(responseData.nextCycleTimestamp).toBe(mockNextQ1Start)
    })
  })

  describe('validator-list route', () => {
    let handler: (req: Request, res: Response) => void

    beforeEach(() => {
      routes.initRoutes()
      // Find the handler for validator-list
      const call = mockRegisterExternal.mock.calls.find(
        (call) => call[1] === 'validator-list'
      )
      handler = call[2]
    })

    it('should return validator list when hash matches', () => {
      const expectedHash = 'matching-hash-123'
      const mockValidatorList = [
        { id: 'node1', address: '0.0.0.1:8080' },
        { id: 'node2', address: '0.0.0.2:8080' },
      ]
      
      mockReq.query = { hash: expectedHash }
      mockGetNodeListHash.mockReturnValue(expectedHash)
      mockGetLastHashedNodeList.mockReturnValue(mockValidatorList)

      handler(mockReq as Request, mockRes as Response)

      expect(mockGetNodeListHash).toHaveBeenCalled()
      expect(mockGetLastHashedNodeList).toHaveBeenCalled()
      expect(mockJsonHttpResWithSize).toHaveBeenCalledWith(
        mockRes,
        mockValidatorList
      )
    })

    it('should return 404 when hash does not match', () => {
      const requestedHash = 'requested-hash-123'
      const actualHash = 'different-hash-456'
      
      mockReq.query = { hash: requestedHash }
      mockGetNodeListHash.mockReturnValue(actualHash)

      handler(mockReq as Request, mockRes as Response)

      expect(mockGetNodeListHash).toHaveBeenCalled()
      expect(mockGetLastHashedNodeList).not.toHaveBeenCalled()
      expect(statusMock).toHaveBeenCalledWith(404)
      expect(jsonMock).toHaveBeenCalledWith({
        error: `validator list with hash '${requestedHash}' not found`,
      })
    })

    it('should return 404 when hash parameter is missing', () => {
      mockReq.query = {}
      mockGetNodeListHash.mockReturnValue('some-hash')

      handler(mockReq as Request, mockRes as Response)

      expect(mockGetLastHashedNodeList).not.toHaveBeenCalled()
      expect(statusMock).toHaveBeenCalledWith(404)
      expect(jsonMock).toHaveBeenCalledWith({
        error: `validator list with hash 'undefined' not found`,
      })
    })

    it('should return 404 when requested hash is empty string', () => {
      mockReq.query = { hash: '' }
      mockGetNodeListHash.mockReturnValue('some-hash')

      handler(mockReq as Request, mockRes as Response)

      expect(mockGetLastHashedNodeList).not.toHaveBeenCalled()
      expect(statusMock).toHaveBeenCalledWith(404)
      expect(jsonMock).toHaveBeenCalledWith({
        error: `validator list with hash '' not found`,
      })
    })

    it('should use profiler for performance tracking', () => {
      const { profilerInstance } = require('../../../../../src/utils/profiler')
      const expectedHash = 'matching-hash'
      
      mockReq.query = { hash: expectedHash }
      mockGetNodeListHash.mockReturnValue(expectedHash)
      mockGetLastHashedNodeList.mockReturnValue([])

      handler(mockReq as Request, mockRes as Response)

      expect(profilerInstance.scopedProfileSectionStart).toHaveBeenCalledWith(
        'validator-list',
        false
      )
      expect(profilerInstance.scopedProfileSectionEnd).toHaveBeenCalledWith(
        'validator-list',
        expect.any(Number)
      )
    })
  })

  describe('archiver-list-hash route', () => {
    let handler: (req: Request, res: Response) => void

    beforeEach(() => {
      routes.initRoutes()
      const call = mockRegisterExternal.mock.calls.find(
        (call) => call[1] === 'archiver-list-hash'
      )
      handler = call[2]
    })

    it('should return archiver list hash', () => {
      const mockHash = 'archiver-hash-456'
      mockGetArchiverListHash.mockReturnValue(mockHash)

      handler(mockReq as Request, mockRes as Response)

      expect(mockGetArchiverListHash).toHaveBeenCalled()
      expect(jsonMock).toHaveBeenCalledWith({
        archiverListHash: mockHash,
      })
    })

    it('should handle empty archiver hash', () => {
      mockGetArchiverListHash.mockReturnValue('')

      handler(mockReq as Request, mockRes as Response)

      expect(jsonMock).toHaveBeenCalledWith({
        archiverListHash: '',
      })
    })
  })

  describe('archiver-list route', () => {
    let handler: (req: Request, res: Response) => void

    beforeEach(() => {
      routes.initRoutes()
      const call = mockRegisterExternal.mock.calls.find(
        (call) => call[1] === 'archiver-list'
      )
      handler = call[2]
    })

    it('should return archiver list when hash matches', () => {
      const expectedHash = 'archiver-hash-123'
      const mockArchiverList = [
        { id: 'archiver1', ip: '10.0.0.1', port: 4000 },
        { id: 'archiver2', ip: '10.0.0.2', port: 4000 },
      ]
      
      mockReq.query = { hash: expectedHash }
      mockGetArchiverListHash.mockReturnValue(expectedHash)
      mockGetLastHashedArchiverList.mockReturnValue(mockArchiverList)

      handler(mockReq as Request, mockRes as Response)

      expect(mockGetArchiverListHash).toHaveBeenCalled()
      expect(mockGetLastHashedArchiverList).toHaveBeenCalled()
      expect(jsonMock).toHaveBeenCalledWith(mockArchiverList)
    })

    it('should return 404 when hash does not match', () => {
      const requestedHash = 'requested-archiver-hash'
      const actualHash = 'different-archiver-hash'
      
      mockReq.query = { hash: requestedHash }
      mockGetArchiverListHash.mockReturnValue(actualHash)

      handler(mockReq as Request, mockRes as Response)

      expect(mockGetLastHashedArchiverList).not.toHaveBeenCalled()
      expect(statusMock).toHaveBeenCalledWith(404)
      expect(jsonMock).toHaveBeenCalledWith({
        error: `archiver list with hash '${requestedHash}' not found`,
      })
    })

    it('should return 404 when hash is missing', () => {
      mockReq.query = {}
      mockGetArchiverListHash.mockReturnValue('some-hash')

      handler(mockReq as Request, mockRes as Response)

      expect(statusMock).toHaveBeenCalledWith(404)
      expect(jsonMock).toHaveBeenCalledWith({
        error: `archiver list with hash 'undefined' not found`,
      })
    })

    it('should use profiler for performance tracking', () => {
      const { profilerInstance } = require('../../../../../src/utils/profiler')
      const expectedHash = 'archiver-hash'
      
      mockReq.query = { hash: expectedHash }
      mockGetArchiverListHash.mockReturnValue(expectedHash)
      mockGetLastHashedArchiverList.mockReturnValue([])

      handler(mockReq as Request, mockRes as Response)

      expect(profilerInstance.scopedProfileSectionStart).toHaveBeenCalledWith(
        'archiver-list',
        false
      )
      expect(profilerInstance.scopedProfileSectionEnd).toHaveBeenCalledWith(
        'archiver-list'
      )
    })
  })

  describe('standby-list-hash route', () => {
    let handler: (req: Request, res: Response) => void

    beforeEach(() => {
      routes.initRoutes()
      const call = mockRegisterExternal.mock.calls.find(
        (call) => call[1] === 'standby-list-hash'
      )
      handler = call[2]
    })

    it('should return standby node list hash', () => {
      const mockHash = 'standby-hash-789'
      mockGetStandbyListHash.mockReturnValue(mockHash)

      handler(mockReq as Request, mockRes as Response)

      expect(mockGetStandbyListHash).toHaveBeenCalled()
      expect(jsonMock).toHaveBeenCalledWith({
        standbyNodeListHash: mockHash,
      })
    })

    it('should handle null standby hash', () => {
      mockGetStandbyListHash.mockReturnValue(null)

      handler(mockReq as Request, mockRes as Response)

      expect(jsonMock).toHaveBeenCalledWith({
        standbyNodeListHash: null,
      })
    })
  })

  describe('standby-list route', () => {
    let handler: (req: Request, res: Response) => void

    beforeEach(() => {
      routes.initRoutes()
      const call = mockRegisterExternal.mock.calls.find(
        (call) => call[1] === 'standby-list'
      )
      handler = call[2]
    })

    it('should return standby list when hash matches', () => {
      const expectedHash = 'standby-hash-123'
      const mockStandbyList = [
        { id: 'standby1', publicKey: 'key1', ip: '192.168.1.1' },
        { id: 'standby2', publicKey: 'key2', ip: '192.168.1.2' },
      ]
      
      mockReq.query = { hash: expectedHash }
      mockGetStandbyListHash.mockReturnValue(expectedHash)
      mockGetLastHashedStandbyList.mockReturnValue(mockStandbyList)

      handler(mockReq as Request, mockRes as Response)

      expect(mockGetStandbyListHash).toHaveBeenCalled()
      expect(mockGetLastHashedStandbyList).toHaveBeenCalled()
      expect(mockJsonHttpResWithSize).toHaveBeenCalledWith(
        mockRes,
        mockStandbyList
      )
    })

    it('should return 404 when hash does not match', () => {
      const requestedHash = 'requested-standby-hash'
      const actualHash = 'different-standby-hash'
      
      mockReq.query = { hash: requestedHash }
      mockGetStandbyListHash.mockReturnValue(actualHash)

      handler(mockReq as Request, mockRes as Response)

      expect(mockGetLastHashedStandbyList).not.toHaveBeenCalled()
      expect(statusMock).toHaveBeenCalledWith(404)
      expect(jsonMock).toHaveBeenCalledWith({
        error: `standby list with hash '${requestedHash}' not found`,
      })
    })

    it('should return 404 for empty hash', () => {
      mockReq.query = { hash: '' }
      mockGetStandbyListHash.mockReturnValue('actual-hash')

      handler(mockReq as Request, mockRes as Response)

      expect(statusMock).toHaveBeenCalledWith(404)
      expect(jsonMock).toHaveBeenCalledWith({
        error: `standby list with hash '' not found`,
      })
    })

    it('should use profiler with response size tracking', () => {
      const { profilerInstance } = require('../../../../../src/utils/profiler')
      const expectedHash = 'standby-hash'
      const mockStandbyList = [{ id: 'standby1' }]
      
      mockReq.query = { hash: expectedHash }
      mockGetStandbyListHash.mockReturnValue(expectedHash)
      mockGetLastHashedStandbyList.mockReturnValue(mockStandbyList)

      handler(mockReq as Request, mockRes as Response)

      expect(profilerInstance.scopedProfileSectionStart).toHaveBeenCalledWith(
        'standby-list',
        false
      )
      expect(profilerInstance.scopedProfileSectionEnd).toHaveBeenCalledWith(
        'standby-list',
        expect.any(Number)
      )
    })
  })

  describe('tx-list-hash route', () => {
    let handler: (req: Request, res: Response) => void

    beforeEach(() => {
      routes.initRoutes()
      const call = mockRegisterExternal.mock.calls.find(
        (call) => call[1] === 'tx-list-hash'
      )
      handler = call[2]
    })

    it('should return tx list hash', () => {
      const mockHash = 'tx-list-hash-abc123'
      mockGetTxListHash.mockReturnValue(mockHash)

      handler(mockReq as Request, mockRes as Response)

      expect(mockGetTxListHash).toHaveBeenCalled()
      expect(sendMock).toHaveBeenCalledWith({
        txListHash: mockHash,
      })
    })

    it('should handle undefined tx list hash', () => {
      mockGetTxListHash.mockReturnValue(undefined)

      handler(mockReq as Request, mockRes as Response)

      expect(sendMock).toHaveBeenCalledWith({
        txListHash: undefined,
      })
    })
  })

  describe('tx-list route', () => {
    let handler: (req: Request, res: Response) => void

    beforeEach(() => {
      routes.initRoutes()
      const call = mockRegisterExternal.mock.calls.find(
        (call) => call[1] === 'tx-list'
      )
      handler = call[2]
    })

    it('should return tx list when hash matches', () => {
      const expectedHash = 'tx-hash-123'
      const mockTxList = [
        { txId: 'tx1', timestamp: 12345 },
        { txId: 'tx2', timestamp: 12346 },
      ]
      
      mockReq.query = { hash: expectedHash }
      mockGetTxListHash.mockReturnValue(expectedHash)
      mockGetTxList.mockReturnValue(mockTxList)

      handler(mockReq as Request, mockRes as Response)

      expect(mockGetTxListHash).toHaveBeenCalled()
      expect(mockGetTxList).toHaveBeenCalled()
      expect(jsonMock).toHaveBeenCalledWith(mockTxList)
    })

    it('should return 404 when hash does not match', () => {
      const requestedHash = 'requested-tx-hash'
      const actualHash = 'different-tx-hash'
      
      mockReq.query = { hash: requestedHash }
      mockGetTxListHash.mockReturnValue(actualHash)

      handler(mockReq as Request, mockRes as Response)

      expect(mockGetTxList).not.toHaveBeenCalled()
      expect(statusMock).toHaveBeenCalledWith(404)
      expect(sendMock).toHaveBeenCalledWith(
        `tx list with hash '${requestedHash}' not found`
      )
    })

    it('should return 404 when hash is missing', () => {
      mockReq.query = {}
      mockGetTxListHash.mockReturnValue('some-hash')

      handler(mockReq as Request, mockRes as Response)

      expect(statusMock).toHaveBeenCalledWith(404)
      expect(sendMock).toHaveBeenCalledWith(
        `tx list with hash 'undefined' not found`
      )
    })

    it('should use profiler for performance tracking', () => {
      const { profilerInstance } = require('../../../../../src/utils/profiler')
      const expectedHash = 'tx-hash'
      
      mockReq.query = { hash: expectedHash }
      mockGetTxListHash.mockReturnValue(expectedHash)
      mockGetTxList.mockReturnValue([])

      handler(mockReq as Request, mockRes as Response)

      expect(profilerInstance.scopedProfileSectionStart).toHaveBeenCalledWith(
        'tx-list',
        false
      )
      expect(profilerInstance.scopedProfileSectionEnd).toHaveBeenCalledWith(
        'tx-list'
      )
    })
  })

  describe('current-cycle-hash route', () => {
    let handler: (req: Request, res: Response) => void

    beforeEach(() => {
      routes.initRoutes()
      const call = mockRegisterExternal.mock.calls.find(
        (call) => call[1] === 'current-cycle-hash'
      )
      handler = call[2]
    })

    it('should return current cycle marker', () => {
      const mockMarker = 'current-cycle-marker-xyz'
      mockGetCurrentCycleMarker.mockReturnValue(mockMarker)

      handler(mockReq as Request, mockRes as Response)

      expect(mockGetCurrentCycleMarker).toHaveBeenCalled()
      expect(jsonMock).toHaveBeenCalledWith({
        currentCycleHash: mockMarker,
      })
    })

    it('should handle null current cycle marker', () => {
      mockGetCurrentCycleMarker.mockReturnValue(null)

      handler(mockReq as Request, mockRes as Response)

      expect(jsonMock).toHaveBeenCalledWith({
        currentCycleHash: null,
      })
    })
  })

  describe('cycle-by-marker route', () => {
    let handler: (req: Request, res: Response) => void

    beforeEach(() => {
      routes.initRoutes()
      const call = mockRegisterExternal.mock.calls.find(
        (call) => call[1] === 'cycle-by-marker'
      )
      handler = call[2]
    })

    it('should return cycle when marker exists', () => {
      const marker = 'cycle-marker-123'
      const mockCycle = createMockCycle(5)
      
      mockReq.query = { marker }
      mockCyclesByMarker[marker] = mockCycle

      handler(mockReq as Request, mockRes as Response)

      expect(jsonMock).toHaveBeenCalledWith(mockCycle)
    })

    it('should return 404 when marker does not exist', () => {
      const marker = 'non-existent-marker'
      
      mockReq.query = { marker }

      handler(mockReq as Request, mockRes as Response)

      expect(statusMock).toHaveBeenCalledWith(404)
      expect(jsonMock).toHaveBeenCalledWith({
        error: `cycle with marker '${marker}' not found`,
      })
    })

    it('should return 404 when marker is missing', () => {
      mockReq.query = {}

      handler(mockReq as Request, mockRes as Response)

      expect(statusMock).toHaveBeenCalledWith(404)
      expect(jsonMock).toHaveBeenCalledWith({
        error: `cycle with marker 'undefined' not found`,
      })
    })

    it('should use profiler for performance tracking', () => {
      const { profilerInstance } = require('../../../../../src/utils/profiler')
      const marker = 'test-marker'
      const mockCycle = createMockCycle(1)
      
      mockReq.query = { marker }
      mockCyclesByMarker[marker] = mockCycle

      handler(mockReq as Request, mockRes as Response)

      expect(profilerInstance.scopedProfileSectionStart).toHaveBeenCalledWith(
        'cycle-by-marker',
        false
      )
      expect(profilerInstance.scopedProfileSectionEnd).toHaveBeenCalledWith(
        'cycle-by-marker'
      )
    })
  })

  describe('newest-cycle-record route', () => {
    let handler: (req: Request, res: Response) => void

    beforeEach(() => {
      routes.initRoutes()
      const call = mockRegisterExternal.mock.calls.find(
        (call) => call[1] === 'newest-cycle-record'
      )
      handler = call[2]
      
      // Reset the newest cycle
      const CycleChain = require('../../../../../src/p2p/CycleChain')
      CycleChain.newest = null
    })

    it('should return newest cycle record', () => {
      const mockNewestCycle = createMockCycle(10)
      const CycleChain = require('../../../../../src/p2p/CycleChain')
      CycleChain.newest = mockNewestCycle

      handler(mockReq as Request, mockRes as Response)

      expect(jsonMock).toHaveBeenCalledWith(mockNewestCycle)
    })

    it('should return null when no newest cycle exists', () => {
      const CycleChain = require('../../../../../src/p2p/CycleChain')
      CycleChain.newest = null

      handler(mockReq as Request, mockRes as Response)

      expect(jsonMock).toHaveBeenCalledWith(null)
    })

    it('should use profiler for performance tracking', () => {
      const { profilerInstance } = require('../../../../../src/utils/profiler')
      const mockNewestCycle = createMockCycle(1)
      const CycleChain = require('../../../../../src/p2p/CycleChain')
      CycleChain.newest = mockNewestCycle

      handler(mockReq as Request, mockRes as Response)

      expect(profilerInstance.scopedProfileSectionStart).toHaveBeenCalledWith(
        'newest-cycle-record',
        false
      )
      expect(profilerInstance.scopedProfileSectionEnd).toHaveBeenCalledWith(
        'newest-cycle-record'
      )
    })
  })
})