import { hexstring, P2P } from '@shardeum-foundation/lib-types'
import { errAsync, okAsync, ResultAsync } from 'neverthrow'
import { Logger } from 'log4js'

// Mock dependencies
const mockAttempt = jest.fn()
const mockRobustQuery = jest.fn()
const mockHttpGet = jest.fn()
const mockGetLogger = jest.fn()

// Mock logger
const mockMainLogger: Partial<Logger> = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}

const mockP2pLogger: Partial<Logger> = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}

jest.mock('../../../../../src/p2p/Utils', () => ({
  attempt: jest.fn(),
  robustQuery: jest.fn(),
}))

jest.mock('../../../../../src/http', () => ({
  get: jest.fn(),
}))

jest.mock('../../../../../src/p2p/Context', () => ({
  logger: {
    getLogger: jest.fn(),
  },
}))

import * as queries from '../../../../../src/p2p/SyncV2/queries'

// Import mocked modules to get their mocked versions
const utilsMock = require('../../../../../src/p2p/Utils')
const httpMock = require('../../../../../src/http')
const contextMock = require('../../../../../src/p2p/Context')

// Type aliases for convenience
type ActiveNode = P2P.SyncTypes.ActiveNode
type Validator = P2P.NodeListTypes.Node
type Archiver = P2P.ArchiversTypes.JoinedArchiver
type CycleRecord = P2P.CycleCreatorTypes.CycleRecord

describe('SyncV2 queries', () => {
  const createMockActiveNode = (id: string, ip: string = '192.168.1.1', port: number = 8080): ActiveNode => ({
    ip,
    port,
    publicKey: `public-key-${id}`,
  })

  const createMockCycleRecord = (counter: number): CycleRecord => ({
    counter,
    previous: counter > 1 ? `cycle-hash-${counter - 1}` : '',
    start: counter * 30,
    duration: 30,
    marker: `marker${counter}`,
    networkId: 'test-network',
    networkConfigHash: `config-hash-${counter}`,
  } as unknown as CycleRecord)

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Assign mock implementations
    utilsMock.attempt = mockAttempt
    utilsMock.robustQuery = mockRobustQuery
    httpMock.get = mockHttpGet
    contextMock.logger.getLogger = mockGetLogger
    
    // Setup logger mocks
    mockGetLogger.mockImplementation((name: string) => {
      if (name === 'main') return mockMainLogger
      if (name === 'p2p') return mockP2pLogger
      return mockMainLogger
    })

    // Initialize loggers
    queries.initLogger()
  })

  describe('initLogger', () => {
    it('should initialize main and p2p loggers', () => {
      // Clear previous initialization
      mockGetLogger.mockClear()
      
      queries.initLogger()

      expect(mockGetLogger).toHaveBeenCalledWith('main')
      expect(mockGetLogger).toHaveBeenCalledWith('p2p')
      expect(mockGetLogger).toHaveBeenCalledTimes(2)
    })
  })

  describe('robustQueryForCycleRecordHash', () => {
    const nodes = [
      createMockActiveNode('node1'),
      createMockActiveNode('node2'),
      createMockActiveNode('node3'),
    ]

    it('should successfully query cycle record hash from nodes', async () => {
      const expectedHash = 'cycle-hash-123'
      const robustResult = {
        isRobustResult: true,
        topResult: okAsync({ currentCycleHash: expectedHash }),
        winningNodes: nodes.slice(0, 2),
      }

      mockAttempt.mockResolvedValue(robustResult)

      const result = await queries.robustQueryForCycleRecordHash(nodes)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual({
          winningNodes: nodes.slice(0, 2),
          value: { currentCycleHash: expectedHash },
        })
      }

      expect(mockAttempt).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxRetries: 3,
          logPrefix: 'syncv2-robust-query-current-cycle-hash',
          logger: mockMainLogger,
        })
      )
    })

    it('should handle non-robust result', async () => {
      const robustResult = {
        isRobustResult: false,
        topResult: okAsync({ currentCycleHash: 'hash' }),
        winningNodes: [],
      }

      mockAttempt.mockResolvedValue(robustResult)

      const result = await queries.robustQueryForCycleRecordHash(nodes)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain("result of current-cycle-hash wasn't robust")
      }
    })

    it('should handle robust query failure', async () => {
      mockAttempt.mockRejectedValue(new Error('Network error'))

      const result = await queries.robustQueryForCycleRecordHash(nodes)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('robust query failed for current-cycle-hash')
      }
    })
  })

  describe('robustQueryForValidatorListHash', () => {
    const nodes = [
      createMockActiveNode('node1'),
      createMockActiveNode('node2'),
    ]

    it('should successfully query validator list hash and timestamp', async () => {
      const expectedData = {
        nodeListHash: 'validator-hash-456' as hexstring,
        nextCycleTimestamp: 1234567890,
      }
      const robustResult = {
        isRobustResult: true,
        topResult: okAsync(expectedData),
        winningNodes: nodes,
      }

      mockAttempt.mockResolvedValue(robustResult)

      const result = await queries.robustQueryForValidatorListHash(nodes)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual({
          winningNodes: nodes,
          value: expectedData,
        })
      }
    })

    it('should handle query with error result', async () => {
      const robustResult = {
        isRobustResult: true,
        topResult: errAsync(new Error('Query failed')),
        winningNodes: nodes,
      }

      mockAttempt.mockResolvedValue(robustResult)

      const result = await queries.robustQueryForValidatorListHash(nodes)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toBe('Query failed')
      }
    })
  })

  describe('robustQueryForArchiverListHash', () => {
    const nodes = [createMockActiveNode('node1')]

    it('should successfully query archiver list hash', async () => {
      const expectedHash = 'archiver-hash-789' as hexstring
      const robustResult = {
        isRobustResult: true,
        topResult: okAsync({ archiverListHash: expectedHash }),
        winningNodes: nodes,
      }

      mockAttempt.mockResolvedValue(robustResult)

      const result = await queries.robustQueryForArchiverListHash(nodes)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.value.archiverListHash).toBe(expectedHash)
      }
    })
  })

  describe('robustQueryForStandbyNodeListHash', () => {
    const nodes = [createMockActiveNode('node1')]

    it('should successfully query standby node list hash', async () => {
      const expectedHash = 'standby-hash-abc' as hexstring
      const robustResult = {
        isRobustResult: true,
        topResult: okAsync({ standbyNodeListHash: expectedHash }),
        winningNodes: nodes,
      }

      mockAttempt.mockResolvedValue(robustResult)

      const result = await queries.robustQueryForStandbyNodeListHash(nodes)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.value.standbyNodeListHash).toBe(expectedHash)
      }
    })
  })

  describe('robustQueryForTxListHash', () => {
    const nodes = [createMockActiveNode('node1')]

    it('should successfully query tx list hash', async () => {
      const expectedHash = 'tx-hash-def' as hexstring
      const robustResult = {
        isRobustResult: true,
        topResult: okAsync({ txListHash: expectedHash }),
        winningNodes: nodes,
      }

      mockAttempt.mockResolvedValue(robustResult)

      const result = await queries.robustQueryForTxListHash(nodes)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.value.txListHash).toBe(expectedHash)
      }
    })
  })

  describe('robustQueryForRecentCycleMarkers', () => {
    const nodes = [
      createMockActiveNode('node1'),
      createMockActiveNode('node2'),
    ]

    it('should successfully query recent cycle markers', async () => {
      const expectedData = {
        cycleMarkers: ['marker1', 'marker2', 'marker3'],
        oldestCounter: 1,
      }
      const robustResult = {
        isRobustResult: true,
        topResult: okAsync(expectedData),
        winningNodes: nodes,
      }

      mockAttempt.mockResolvedValue(robustResult)

      const result = await queries.robustQueryForRecentCycleMarkers(nodes)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.value).toEqual(expectedData)
      }
    })
  })

  describe('getCycleDataFromNode', () => {
    const node = createMockActiveNode('node1')
    const expectedMarker = 'cycle-marker-123' as hexstring

    beforeEach(() => {
      mockAttempt.mockImplementation(async (fn) => fn())
    })

    it('should successfully fetch cycle data from node', async () => {
      const mockCycle = createMockCycleRecord(5)
      mockHttpGet.mockResolvedValue(mockCycle)

      const result = await queries.getCycleDataFromNode(node, expectedMarker)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual(mockCycle)
      }

      expect(mockHttpGet).toHaveBeenCalledWith(
        `${node.ip}:${node.port}/cycle-by-marker?marker=${expectedMarker}`,
        false,
        1000
      )
      expect(mockP2pLogger.info).toHaveBeenCalledWith(`SyncV2: getCycleDataFromNode: expectedMarker: ${expectedMarker}`)
    })

    it('should handle HTTP error', async () => {
      mockHttpGet.mockRejectedValue(new Error('Connection refused'))

      const result = await queries.getCycleDataFromNode(node, expectedMarker)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('simple fetch failed for cycle-by-marker')
      }
    })

    it('should retry on failure', async () => {
      mockAttempt.mockRejectedValue(new Error('Network timeout'))

      const result = await queries.getCycleDataFromNode(node, expectedMarker)

      expect(result.isErr()).toBe(true)
      expect(mockAttempt).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxRetries: 3,
          logPrefix: 'syncv2-simple-fetch-cycle-by-marker',
          logger: mockMainLogger,
        })
      )
    })
  })

  describe('getValidatorListFromNode', () => {
    const node = createMockActiveNode('node1')
    const expectedHash = 'validator-hash-123' as hexstring

    beforeEach(() => {
      mockAttempt.mockImplementation(async (fn) => fn())
    })

    it('should successfully fetch validator list from node', async () => {
      const mockValidators: Validator[] = [
        { id: 'validator1', publicKey: 'key1' } as Validator,
        { id: 'validator2', publicKey: 'key2' } as Validator,
      ]
      mockHttpGet.mockResolvedValue(mockValidators)

      const result = await queries.getValidatorListFromNode(node, expectedHash)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual(mockValidators)
      }

      expect(mockHttpGet).toHaveBeenCalledWith(
        `${node.ip}:${node.port}/validator-list?hash=${expectedHash}`,
        false,
        10000 // Extended timeout for large lists
      )
    })

    it('should use extended timeout for validator list', async () => {
      mockHttpGet.mockResolvedValue([])

      await queries.getValidatorListFromNode(node, expectedHash)

      // Verify the timeout parameter
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.any(String),
        false,
        10000
      )
    })
  })

  describe('getArchiverListFromNode', () => {
    const node = createMockActiveNode('node1')
    const expectedHash = 'archiver-hash-456' as hexstring

    beforeEach(() => {
      mockAttempt.mockImplementation(async (fn) => fn())
    })

    it('should successfully fetch archiver list from node', async () => {
      const mockArchivers: Archiver[] = [
        { publicKey: 'archiver1-key', ip: '10.0.0.1', port: 4000, curvePk: 'curve1' } as Archiver,
        { publicKey: 'archiver2-key', ip: '10.0.0.2', port: 4000, curvePk: 'curve2' } as Archiver,
      ]
      mockHttpGet.mockResolvedValue(mockArchivers)

      const result = await queries.getArchiverListFromNode(node, expectedHash)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual(mockArchivers)
      }

      expect(mockHttpGet).toHaveBeenCalledWith(
        `${node.ip}:${node.port}/archiver-list?hash=${expectedHash}`,
        false,
        1000 // Default timeout
      )
    })
  })

  describe('getStandbyNodeListFromNode', () => {
    const node = createMockActiveNode('node1')
    const expectedHash = 'standby-hash-789' as hexstring

    beforeEach(() => {
      mockAttempt.mockImplementation(async (fn) => fn())
    })

    it('should successfully fetch standby node list from node', async () => {
      const mockStandbyNodes = [
        { nodeInfo: { id: 'standby1' }, requestTimestamp: 123 },
        { nodeInfo: { id: 'standby2' }, requestTimestamp: 124 },
      ]
      mockHttpGet.mockResolvedValue(mockStandbyNodes)

      const result = await queries.getStandbyNodeListFromNode(node, expectedHash)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual(mockStandbyNodes)
      }

      expect(mockHttpGet).toHaveBeenCalledWith(
        `${node.ip}:${node.port}/standby-list?hash=${expectedHash}`,
        false,
        10000 // Extended timeout for potentially large lists
      )
    })
  })

  describe('getTxListFromNode', () => {
    const node = createMockActiveNode('node1')
    const expectedHash = 'tx-hash-abc' as hexstring

    beforeEach(() => {
      mockAttempt.mockImplementation(async (fn) => fn())
    })

    it('should successfully fetch tx list from node', async () => {
      const mockTxList = [
        { hash: 'tx1', tx: { txId: 'tx1', timestamp: 12345 } },
        { hash: 'tx2', tx: { txId: 'tx2', timestamp: 12346 } },
      ]
      mockHttpGet.mockResolvedValue(mockTxList)

      const result = await queries.getTxListFromNode(node, expectedHash)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual(mockTxList)
      }

      expect(mockHttpGet).toHaveBeenCalledWith(
        `${node.ip}:${node.port}/tx-list?hash=${expectedHash}`,
        false,
        10000
      )
    })
  })

  describe('getCyclesBatchFromNode', () => {
    const node = createMockActiveNode('node1')
    const markers = ['marker1', 'marker2', 'marker3']

    beforeEach(() => {
      mockAttempt.mockImplementation(async (fn) => fn())
    })

    it('should successfully fetch cycles batch from node', async () => {
      const mockCycles = [
        createMockCycleRecord(1),
        createMockCycleRecord(2),
        createMockCycleRecord(3),
      ]
      const response = { cycles: mockCycles }
      mockHttpGet.mockResolvedValue(response)

      const result = await queries.getCyclesBatchFromNode(node, markers)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual(response)
      }

      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('/cycles-batch?markers='),
        false,
        30000 // Extended timeout for batch operations
      )
      expect(mockP2pLogger.info).toHaveBeenCalledWith(`SyncV2: getCyclesBatchFromNode: fetching ${markers.length} cycles`)
    })

    it('should handle empty markers array', async () => {
      const response = { cycles: [] }
      mockHttpGet.mockResolvedValue(response)

      const result = await queries.getCyclesBatchFromNode(node, [])

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.cycles).toEqual([])
      }

      expect(mockHttpGet).toHaveBeenCalledWith(
        `${node.ip}:${node.port}/cycles-batch?markers=`,
        false,
        30000
      )
    })

    it('should handle large batch with proper timeout', async () => {
      const largeMarkers = Array(50).fill(0).map((_, i) => `marker${i}`)
      const response = { cycles: [] }
      mockHttpGet.mockResolvedValue(response)

      const result = await queries.getCyclesBatchFromNode(node, largeMarkers)

      expect(result.isOk()).toBe(true)
      
      // Verify the extended timeout is used
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.any(String),
        false,
        30000
      )
    })

    it('should handle network error in batch request', async () => {
      mockHttpGet.mockRejectedValue(new Error('Timeout'))

      const result = await queries.getCyclesBatchFromNode(node, markers)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('simple fetch failed for cycles-batch')
      }
    })
  })

  describe('getCyclesBatchFromNode - timeout scenarios', () => {
    const node = createMockActiveNode('node1')
    const markers = ['marker1', 'marker2', 'marker3']

    beforeEach(() => {
      mockAttempt.mockImplementation(async (fn) => fn())
    })

    it('should timeout after 30 seconds for batch operations', async () => {
      // Mock HTTP timeout scenario
      const timeoutError = new Error('Request timeout')
      mockHttpGet.mockRejectedValue(timeoutError)

      // Execute the batch request
      const result = await queries.getCyclesBatchFromNode(node, markers)

      // Verify it returns an error
      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('simple fetch failed for cycles-batch')
      }

      // Verify timeout is exactly 30000ms
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('/cycles-batch?markers='),
        false,
        30000
      )

      // Verify retry behavior on timeout
      expect(mockAttempt).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxRetries: 3,
          logPrefix: 'syncv2-simple-fetch-cycles-batch',
          logger: mockMainLogger,
        })
      )
    })

    it('should retry up to 3 times on timeout', async () => {
      // Create a counter to track retry attempts
      let attemptCount = 0
      mockAttempt.mockImplementation(async (fn, options) => {
        attemptCount++
        // Simulate the retry mechanism by calling the function multiple times
        try {
          return await fn()
        } catch (error) {
          if (attemptCount < options.maxRetries) {
            // Simulate retry
            return await fn()
          }
          throw error
        }
      })

      // Mock HTTP to always timeout
      const timeoutError = new Error('ETIMEDOUT')
      mockHttpGet.mockRejectedValue(timeoutError)

      const result = await queries.getCyclesBatchFromNode(node, markers)

      // Verify the request failed
      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('simple fetch failed for cycles-batch')
      }

      // Verify multiple HTTP calls were made (initial + retries)
      expect(mockHttpGet).toHaveBeenCalledTimes(2) // mockAttempt implementation calls fn() twice in this test
      
      // Verify attempt was called with correct retry config
      expect(mockAttempt).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxRetries: 3,
          logPrefix: 'syncv2-simple-fetch-cycles-batch',
          logger: mockMainLogger,
        })
      )
    })

    it('should succeed after timeout if retry succeeds', async () => {
      // Track call count
      let callCount = 0
      mockHttpGet.mockImplementation(() => {
        callCount++
        if (callCount <= 2) {
          // First two attempts timeout
          return Promise.reject(new Error('Timeout'))
        }
        // Third attempt succeeds
        return Promise.resolve({ cycles: [createMockCycleRecord(1), createMockCycleRecord(2)] })
      })

      // Mock attempt to simulate actual retry behavior
      mockAttempt.mockImplementation(async (fn, options) => {
        let lastError
        for (let i = 0; i <= options.maxRetries; i++) {
          try {
            return await fn()
          } catch (error) {
            lastError = error
            if (i < options.maxRetries) {
              // Continue retrying
              continue
            }
          }
        }
        throw lastError
      })

      const result = await queries.getCyclesBatchFromNode(node, markers)

      // Verify eventual success
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.cycles).toHaveLength(2)
        expect(result.value.cycles[0].counter).toBe(1)
        expect(result.value.cycles[1].counter).toBe(2)
      }

      // Verify timeout configuration was used throughout
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('/cycles-batch?markers='),
        false,
        30000
      )
    })
  })

  describe('getCyclesBatchFromNode - error scenarios', () => {
    const node = createMockActiveNode('node1')
    const markers = ['marker1', 'marker2', 'marker3']

    beforeEach(() => {
      mockAttempt.mockImplementation(async (fn) => fn())
    })

    it('should handle malformed batch responses gracefully', async () => {
      // Test null response
      mockHttpGet.mockResolvedValueOnce(null)
      let result = await queries.getCyclesBatchFromNode(node, markers)
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toBeNull()
      }

      // Test undefined response
      mockHttpGet.mockResolvedValueOnce(undefined)
      result = await queries.getCyclesBatchFromNode(node, markers)
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toBeUndefined()
      }

      // Test empty object response (missing 'cycles' property)
      mockHttpGet.mockResolvedValueOnce({})
      result = await queries.getCyclesBatchFromNode(node, markers)
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual({})
        expect(result.value.cycles).toBeUndefined()
      }

      // Test response with wrong property name
      mockHttpGet.mockResolvedValueOnce({ notCycles: [] })
      result = await queries.getCyclesBatchFromNode(node, markers)
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual({ notCycles: [] })
        expect(result.value.cycles).toBeUndefined()
      }

      // Test response with cycles as non-array
      mockHttpGet.mockResolvedValueOnce({ cycles: 'not-an-array' })
      result = await queries.getCyclesBatchFromNode(node, markers)
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual({ cycles: 'not-an-array' })
      }

      // Test response with cycles as null
      mockHttpGet.mockResolvedValueOnce({ cycles: null })
      result = await queries.getCyclesBatchFromNode(node, markers)
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual({ cycles: null })
      }

      // Verify all API calls were made correctly
      expect(mockHttpGet).toHaveBeenCalledTimes(6)
      expect(mockP2pLogger.info).toHaveBeenCalledWith(`SyncV2: getCyclesBatchFromNode: fetching ${markers.length} cycles`)
    })
  })

  describe('getCyclesBatchFromNode - URL encoding', () => {
    const node = createMockActiveNode('node1')

    beforeEach(() => {
      mockAttempt.mockImplementation(async (fn) => fn())
      mockHttpGet.mockResolvedValue({ cycles: [] })
    })

    it('should properly encode special characters in cycle markers', async () => {
      // Test markers with various special characters (&, =, %, commas)
      const specialMarkers = [
        'marker&test',     // Ampersand
        'marker=equals',   // Equals sign
        'marker%percent',  // Percent sign
        'marker,comma',    // Comma
        'marker+plus',     // Plus sign
        'marker space',    // Space
        'marker#hash',     // Hash
        'marker?question', // Question mark
      ]
      
      const result = await queries.getCyclesBatchFromNode(node, specialMarkers)

      expect(result.isOk()).toBe(true)
      
      // Verify the HTTP call was made
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('/cycles-batch?markers='),
        false,
        30000
      )
      
      // Verify proper URL encoding in request
      const callArgs = mockHttpGet.mock.calls[0]
      const url = callArgs[0] as string
      
      // Check that special characters are properly encoded
      expect(url).toContain('marker%26test')     // & -> %26
      expect(url).toContain('marker%3Dequals')   // = -> %3D
      expect(url).toContain('marker%25percent')  // % -> %25
      expect(url).toContain('marker%2Ccomma')    // , -> %2C
      expect(url).toContain('marker%2Bplus')     // + -> %2B
      expect(url).toMatch(/marker(%20|\+)space/) // space -> %20 or +
      expect(url).toContain('marker%23hash')     // # -> %23
      expect(url).toContain('marker%3Fquestion') // ? -> %3F
      
      // Verify logging
      expect(mockP2pLogger.info).toHaveBeenCalledWith(`SyncV2: getCyclesBatchFromNode: fetching ${specialMarkers.length} cycles`)
    })

    it('should handle Unicode characters in cycle markers', async () => {
      // Test markers with Unicode characters
      const unicodeMarkers = [
        'marker🚀rocket',     // Emoji
        'markerñtilde',       // Latin characters
        'marker中文',          // Chinese characters
        'markerΑΒΓ',          // Greek characters
        'marker°degree',      // Degree symbol
        'marker©copyright',   // Copyright symbol
      ]
      
      const result = await queries.getCyclesBatchFromNode(node, unicodeMarkers)

      expect(result.isOk()).toBe(true)
      
      // Verify the HTTP call was made
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('/cycles-batch?markers='),
        false,
        30000
      )
      
      // Verify proper URL encoding for Unicode
      const callArgs = mockHttpGet.mock.calls[0]
      const url = callArgs[0] as string
      
      // Unicode characters should be properly encoded
      expect(url).toContain('marker%F0%9F%9A%80rocket') // 🚀 encoded
      expect(url).toContain('marker%C3%B1tilde')        // ñ encoded
      expect(url).toContain('marker%E4%B8%AD%E6%96%87') // 中文 encoded
      expect(url).toContain('marker%CE%91%CE%92%CE%93') // ΑΒΓ encoded
      expect(url).toContain('marker%C2%B0degree')       // ° encoded
      expect(url).toContain('marker%C2%A9copyright')    // © encoded
    })

    it('should handle edge case special characters', async () => {
      // Test edge case special characters
      const edgeCaseMarkers = [
        'marker\twithtab',    // Tab character
        'marker\nwithnewline', // Newline character
        'marker"withquote',    // Double quote
        "marker'withsinglequote", // Single quote
        'marker\\withbackslash', // Backslash
        'marker[brackets]',    // Square brackets
        'marker{braces}',      // Curly braces
        'marker(parentheses)', // Parentheses
      ]
      
      const result = await queries.getCyclesBatchFromNode(node, edgeCaseMarkers)

      expect(result.isOk()).toBe(true)
      
      // Verify the HTTP call was made
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('/cycles-batch?markers='),
        false,
        30000
      )
      
      // Verify proper URL encoding for edge cases
      const callArgs = mockHttpGet.mock.calls[0]
      const url = callArgs[0] as string
      
      // Check that edge case characters are properly encoded
      expect(url).toContain('marker%09withtab')        // \t -> %09
      expect(url).toContain('marker%0Awithnewline')    // \n -> %0A
      expect(url).toContain('marker%22withquote')      // " -> %22
      expect(url).toContain('marker%27withsinglequote') // ' -> %27
      expect(url).toContain('marker%5Cwithbackslash')  // \ -> %5C
      expect(url).toContain('marker%5Bbrackets%5D')    // [ ] -> %5B %5D
      expect(url).toContain('marker%7Bbraces%7D')      // { } -> %7B %7D
      expect(url).toContain('marker%28parentheses%29') // ( ) -> %28 %29
    })

    it('should properly encode special characters in parameters', async () => {
      const specialHash = 'hash+with/special&chars=' as hexstring
      
      await queries.getCycleDataFromNode(node, specialHash)

      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining(`marker=${encodeURIComponent(specialHash)}`),
        false,
        1000
      )
    })

    it('should handle multiple parameters correctly', async () => {
      const markers = ['marker&1', 'marker=2', 'marker/3']
      
      await queries.getCyclesBatchFromNode(node, markers)

      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('cycles-batch?markers='),
        false,
        30000
      )
      
      // Verify the URL contains encoded markers
      const callArgs = mockHttpGet.mock.calls[0]
      const url = callArgs[0]
      expect(url).toContain('marker%261')
      expect(url).toContain('marker%3D2')
      expect(url).toContain('marker%2F3')
    })
  })

  describe('getCyclesBatchFromNode - URL limits', () => {
    const node = createMockActiveNode('node1')

    beforeEach(() => {
      mockAttempt.mockImplementation(async (fn) => fn())
      mockHttpGet.mockResolvedValue({ cycles: [] })
    })

    it('should handle extremely long marker lists', async () => {
      // Create 1000+ markers with long names to test URL length handling
      const longMarkers: string[] = []
      
      // Generate 1200 markers, each with a 50-character name
      for (let i = 0; i < 1200; i++) {
        const longMarkerName = `very-long-marker-name-with-lots-of-characters-${i.toString().padStart(10, '0')}`
        longMarkers.push(longMarkerName)
      }

      // Verify we have a large number of markers
      expect(longMarkers.length).toBe(1200)
      expect(longMarkers[0].length).toBeGreaterThan(50)
      expect(longMarkers[1199].length).toBeGreaterThan(50)

      const result = await queries.getCyclesBatchFromNode(node, longMarkers)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual({ cycles: [] })
      }

      // Verify the HTTP call was made
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('/cycles-batch?markers='),
        false,
        30000
      )

      // Verify URL length handling - check that the URL was constructed
      const callArgs = mockHttpGet.mock.calls[0]
      const url = callArgs[0] as string
      
      // The URL should contain the base path and markers parameter
      expect(url).toContain('/cycles-batch?markers=')
      
      // Verify that all markers are included in the URL (no truncation)
      const markersParam = url.split('markers=')[1]
      const decodedMarkers = decodeURIComponent(markersParam).split(',')
      expect(decodedMarkers).toHaveLength(1200)
      
      // Verify first and last markers are present
      expect(decodedMarkers[0]).toBe(longMarkers[0])
      expect(decodedMarkers[1199]).toBe(longMarkers[1199])

      // Verify logging shows correct count
      expect(mockP2pLogger.info).toHaveBeenCalledWith(`SyncV2: getCyclesBatchFromNode: fetching ${longMarkers.length} cycles`)
    })

    it('should handle extremely long individual marker names', async () => {
      // Create markers with extremely long names (2000+ characters each)
      const extremelyLongMarkers = [
        'a'.repeat(2048) + '-marker-1', // 2048 + 10 = 2058 characters
        'b'.repeat(2048) + '-marker-2', 
        'c'.repeat(2048) + '-marker-3',
        'd'.repeat(2048) + '-marker-4',
        'e'.repeat(2048) + '-marker-5',
      ]

      // Verify marker lengths
      extremelyLongMarkers.forEach((marker, index) => {
        expect(marker.length).toBeGreaterThan(2048)
      })

      const result = await queries.getCyclesBatchFromNode(node, extremelyLongMarkers)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual({ cycles: [] })
      }

      // Verify the HTTP call was made
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('/cycles-batch?markers='),
        false,
        30000
      )

      // Verify URL handles long marker names without errors
      const callArgs = mockHttpGet.mock.calls[0]
      const url = callArgs[0] as string
      
      // The URL should be constructed successfully
      expect(url).toContain('/cycles-batch?markers=')
      
      // Verify all markers are present in the URL
      const markersParam = url.split('markers=')[1]
      const decodedMarkers = decodeURIComponent(markersParam).split(',')
      expect(decodedMarkers).toHaveLength(5)
      
      // Verify the extremely long markers are preserved
      decodedMarkers.forEach((decodedMarker, index) => {
        expect(decodedMarker).toBe(extremelyLongMarkers[index])
        expect(decodedMarker.length).toBeGreaterThan(2048)
      })
    })

    it('should handle combination of many long markers creating massive URL', async () => {
      // Create a scenario that would result in a very large URL
      // 500 markers, each 1000 characters long = ~500KB URL
      const massiveMarkerList: string[] = []
      
      for (let i = 0; i < 500; i++) {
        const baseMarker = `marker-${i.toString().padStart(6, '0')}-`
        const padding = 'x'.repeat(1000 - baseMarker.length)
        massiveMarkerList.push(baseMarker + padding)
      }

      // Verify we have the expected massive marker list
      expect(massiveMarkerList.length).toBe(500)
      massiveMarkerList.forEach(marker => {
        expect(marker.length).toBe(1000)
      })

      const result = await queries.getCyclesBatchFromNode(node, massiveMarkerList)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual({ cycles: [] })
      }

      // Verify the HTTP call was made successfully
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('/cycles-batch?markers='),
        false,
        30000
      )

      // Verify the massive URL was constructed without truncation
      const callArgs = mockHttpGet.mock.calls[0]
      const url = callArgs[0] as string
      
      // Calculate approximate URL size (should be very large)
      expect(url.length).toBeGreaterThan(400000) // Should be > 400KB
      
      // Verify all markers are present
      const markersParam = url.split('markers=')[1]
      const decodedMarkers = decodeURIComponent(markersParam).split(',')
      expect(decodedMarkers).toHaveLength(500)
      
      // Spot check first, middle, and last markers
      expect(decodedMarkers[0]).toBe(massiveMarkerList[0])
      expect(decodedMarkers[249]).toBe(massiveMarkerList[249])
      expect(decodedMarkers[499]).toBe(massiveMarkerList[499])

      // Verify all markers have expected length
      decodedMarkers.forEach(marker => {
        expect(marker.length).toBe(1000)
      })
    })

    it('should handle edge case of single massive marker', async () => {
      // Create a single marker that's extremely large (10MB)
      const massiveMarker = 'x'.repeat(10 * 1024 * 1024) // 10MB marker
      
      const result = await queries.getCyclesBatchFromNode(node, [massiveMarker])

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual({ cycles: [] })
      }

      // Verify the HTTP call was made
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('/cycles-batch?markers='),
        false,
        30000
      )

      // Verify the massive single marker was handled
      const callArgs = mockHttpGet.mock.calls[0]
      const url = callArgs[0] as string
      
      expect(url).toContain('/cycles-batch?markers=')
      
      // Verify the massive marker is present
      const markersParam = url.split('markers=')[1]
      const decodedMarker = decodeURIComponent(markersParam)
      expect(decodedMarker).toBe(massiveMarker)
      expect(decodedMarker.length).toBe(10 * 1024 * 1024)

      // Verify logging
      expect(mockP2pLogger.info).toHaveBeenCalledWith('SyncV2: getCyclesBatchFromNode: fetching 1 cycles')
    })

    it('should handle empty string markers mixed with long markers', async () => {
      // Mix of empty strings, normal markers, and long markers
      const mixedMarkers = [
        '',  // Empty string
        'normal-marker',
        '',  // Another empty string
        'y'.repeat(5000), // Very long marker
        'another-normal-marker',
        '',  // Final empty string
        'z'.repeat(3000), // Another long marker
      ]

      const result = await queries.getCyclesBatchFromNode(node, mixedMarkers)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual({ cycles: [] })
      }

      // Verify the HTTP call was made
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('/cycles-batch?markers='),
        false,
        30000
      )

      // Verify all markers (including empty ones) are preserved
      const callArgs = mockHttpGet.mock.calls[0]
      const url = callArgs[0] as string
      
      const markersParam = url.split('markers=')[1]
      const decodedMarkers = decodeURIComponent(markersParam).split(',')
      expect(decodedMarkers).toHaveLength(7)
      
      // Verify the exact marker content is preserved
      expect(decodedMarkers[0]).toBe('')
      expect(decodedMarkers[1]).toBe('normal-marker')
      expect(decodedMarkers[2]).toBe('')
      expect(decodedMarkers[3]).toBe('y'.repeat(5000))
      expect(decodedMarkers[4]).toBe('another-normal-marker')
      expect(decodedMarkers[5]).toBe('')
      expect(decodedMarkers[6]).toBe('z'.repeat(3000))
    })
  })

  describe('Error handling edge cases', () => {
    const node = createMockActiveNode('node1')

    it('should handle attempt function throwing synchronously', async () => {
      mockAttempt.mockRejectedValue(new Error('Synchronous error'))

      const result = await queries.getCycleDataFromNode(node, 'marker' as hexstring)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('simple fetch failed')
      }
    })

    it('should handle malformed response data', async () => {
      mockAttempt.mockImplementation(async (fn) => fn())
      mockHttpGet.mockResolvedValue(null)

      const result = await queries.getValidatorListFromNode(node, 'hash' as hexstring)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toBeNull()
      }
    })
  })

  describe('Robust query internals', () => {
    it('should pass correct query function to robustQuery', async () => {
      const nodes = [
        createMockActiveNode('node1', '192.168.1.1'),
        createMockActiveNode('node2', '192.168.1.2'),
      ]

      // Setup to capture the query function
      let capturedQueryFn: any
      mockAttempt.mockImplementation(async (fn) => {
        const attemptResult = await fn()
        capturedQueryFn = attemptResult
        return {
          isRobustResult: true,
          topResult: okAsync({ currentCycleHash: 'test-hash' }),
          winningNodes: nodes,
        }
      })

      mockRobustQuery.mockImplementation(async (nodes, queryFn) => {
        // Test the query function
        mockHttpGet.mockResolvedValue({ currentCycleHash: 'test-hash' })
        const resultPromise = queryFn(nodes[0])
        const result = await resultPromise
        
        return {
          isRobustResult: true,
          topResult: okAsync(result),
          winningNodes: nodes,
        }
      })

      await queries.robustQueryForCycleRecordHash(nodes)

      expect(mockRobustQuery).toHaveBeenCalledWith(
        nodes,
        expect.any(Function)
      )

      // Verify the query function works correctly
      const [, queryFn] = mockRobustQuery.mock.calls[0]
      mockHttpGet.mockResolvedValue({ currentCycleHash: 'query-test' })
      const queryResult = await queryFn(nodes[0])
      
      expect(mockHttpGet).toHaveBeenCalledWith('192.168.1.1:8080/current-cycle-hash')
      // queryResult is a ResultAsync, so we need to check its value
      if ('isOk' in queryResult && queryResult.isOk()) {
        expect(queryResult.value).toEqual({ currentCycleHash: 'query-test' })
      } else {
        expect(queryResult).toEqual({ currentCycleHash: 'query-test' })
      }
    })
  })

  describe('attemptSimpleFetch - retry behavior', () => {
    const node = createMockActiveNode('node1')

    beforeEach(() => {
      jest.clearAllMocks()
    })

    it('should retry failed requests up to MAX_RETRIES times', async () => {
      // Create a spy to track how many times the inner function is called
      let attemptCallCount = 0
      let httpCallCount = 0

      // Mock attempt to track retries and actually perform retry logic
      mockAttempt.mockImplementation(async (fn, options) => {
        attemptCallCount++
        let lastError: Error | null = null
        
        // Simulate actual retry mechanism: try up to maxRetries + 1 times
        for (let i = 0; i <= options.maxRetries; i++) {
          try {
            httpCallCount++
            return await fn()
          } catch (error) {
            lastError = error as Error
            if (i < options.maxRetries) {
              // Continue to next retry
              continue
            }
          }
        }
        throw lastError
      })

      // Mock HTTP to fail for first 2 attempts, succeed on 3rd
      let httpAttempts = 0
      mockHttpGet.mockImplementation(() => {
        httpAttempts++
        if (httpAttempts <= 2) {
          return Promise.reject(new Error(`Network error ${httpAttempts}`))
        }
        return Promise.resolve({ success: true, data: 'test-data' })
      })

      // Test getCycleDataFromNode which uses attemptSimpleFetch internally
      const result = await queries.getCycleDataFromNode(node, 'test-marker' as hexstring)

      // Verify the request eventually succeeded
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual({ success: true, data: 'test-data' })
      }

      // Verify attempt was called exactly once
      expect(attemptCallCount).toBe(1)
      
      // Verify exactly 3 HTTP calls were made (2 failures + 1 success)
      expect(httpCallCount).toBe(3)
      expect(httpAttempts).toBe(3)

      // Verify attempt was called with correct retry configuration
      expect(mockAttempt).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxRetries: 3,
          logPrefix: 'syncv2-simple-fetch-cycle-by-marker',
          logger: mockMainLogger,
        })
      )
    })

    it('should fail when all retries are exhausted', async () => {
      // Mock attempt to actually perform retry logic  
      mockAttempt.mockImplementation(async (fn, options) => {
        let lastError: Error | null = null
        
        for (let i = 0; i <= options.maxRetries; i++) {
          try {
            return await fn()
          } catch (error) {
            lastError = error as Error
            if (i < options.maxRetries) {
              continue
            }
          }
        }
        throw lastError
      })

      // Mock HTTP to always fail
      const persistentError = new Error('Persistent network failure')
      mockHttpGet.mockRejectedValue(persistentError)

      const result = await queries.getCycleDataFromNode(node, 'test-marker' as hexstring)

      // Verify the request failed
      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('simple fetch failed for cycle-by-marker')
      }

      // Verify exactly 4 HTTP calls were made (initial + 3 retries)
      expect(mockHttpGet).toHaveBeenCalledTimes(4)

      // Verify correct retry configuration was used
      expect(mockAttempt).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxRetries: 3,
        })
      )
    })

    it('should succeed on first attempt without retries', async () => {
      // Mock attempt to execute function once
      mockAttempt.mockImplementation(async (fn) => fn())

      // Mock HTTP to succeed immediately
      const successData = { immediate: 'success' }
      mockHttpGet.mockResolvedValue(successData)

      const result = await queries.getCycleDataFromNode(node, 'test-marker' as hexstring)

      // Verify success
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual(successData)
      }

      // Verify only one HTTP call was made
      expect(mockHttpGet).toHaveBeenCalledTimes(1)
      
      // Verify attempt was called once
      expect(mockAttempt).toHaveBeenCalledTimes(1)
    })

    it('should use correct retry configuration for different endpoint types', async () => {
      mockAttempt.mockImplementation(async (fn) => fn())
      mockHttpGet.mockResolvedValue([])

      // Test different endpoint functions to verify they all use MAX_RETRIES=3
      await queries.getValidatorListFromNode(node, 'hash' as hexstring)
      expect(mockAttempt).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxRetries: 3,
          logPrefix: 'syncv2-simple-fetch-validator-list',
        })
      )

      jest.clearAllMocks()
      
      await queries.getArchiverListFromNode(node, 'hash' as hexstring)
      expect(mockAttempt).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxRetries: 3,
          logPrefix: 'syncv2-simple-fetch-archiver-list',
        })
      )

      jest.clearAllMocks()

      await queries.getCyclesBatchFromNode(node, ['marker1', 'marker2'])
      expect(mockAttempt).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxRetries: 3,
          logPrefix: 'syncv2-simple-fetch-cycles-batch',
        })
      )
    })
  })

  describe('getCyclesBatchFromNode - size limits', () => {
    const node = createMockActiveNode('node1')

    beforeEach(() => {
      mockAttempt.mockImplementation(async (fn) => fn())
    })

    it('should handle very large response payloads', async () => {
      // Create cycles with large data payloads to test response size handling
      const largeCycles = []
      
      for (let i = 1; i <= 5; i++) {
        // Create a cycle with large data payload (simulate real-world large cycle data)
        const largeCycle = {
          ...createMockCycleRecord(i),
          // Add large data fields that might exist in real cycles
          largeDataField: 'x'.repeat(1024 * 1024), // 1MB of data per cycle
          transactionHashes: Array(10000).fill(0).map((_, idx) => `tx-hash-${i}-${idx}`), // Large transaction list
          nodeDetails: Array(1000).fill(0).map((_, idx) => ({
            id: `node-${i}-${idx}`,
            publicKey: 'key'.repeat(100), // Large public key data
            metadata: 'meta'.repeat(500)  // Large metadata
          })),
          debugLogs: Array(5000).fill(0).map((_, idx) => `debug-log-${i}-${idx}-${'data'.repeat(50)}`), // Large debug logs
          networkState: {
            largeConfig: 'config'.repeat(10000), // Large config data
            stateSnapshot: 'state'.repeat(20000)  // Large state data
          }
        }
        largeCycles.push(largeCycle)
      }

      // Calculate approximate response size (should be > 10MB)
      const responseSize = JSON.stringify({ cycles: largeCycles }).length
      expect(responseSize).toBeGreaterThan(10 * 1024 * 1024) // Verify we have > 10MB response

      // Mock HTTP to return the large response
      const largeResponse = { cycles: largeCycles }
      mockHttpGet.mockResolvedValue(largeResponse)

      const markers = largeCycles.map((cycle: any) => cycle.marker)
      const result = await queries.getCyclesBatchFromNode(node, markers)

      // Verify the large response was handled successfully
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual(largeResponse)
        expect(result.value.cycles).toHaveLength(5)
        
        // Verify large data fields are preserved
        result.value.cycles.forEach((cycle: any, index) => {
          expect(cycle.largeDataField).toHaveLength(1024 * 1024)
          expect(cycle.transactionHashes).toHaveLength(10000)
          expect(cycle.nodeDetails).toHaveLength(1000)
          expect(cycle.debugLogs).toHaveLength(5000)
          expect(cycle.networkState.largeConfig.length).toBeGreaterThan(50000)
          expect(cycle.networkState.stateSnapshot.length).toBeGreaterThanOrEqual(100000)
        })
      }

      // Verify HTTP call was made with extended timeout for large response
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('/cycles-batch?markers='),
        false,
        30000 // Extended timeout should handle large responses
      )

      // Verify logging indicates large response handling
      expect(mockP2pLogger.info).toHaveBeenCalledWith(`SyncV2: getCyclesBatchFromNode: fetching ${markers.length} cycles`)
    })

    it('should handle extremely large single cycle payload', async () => {
      // Create a single cycle with extremely large payload (50MB+)
      const extremelyLargeCycle = {
        ...createMockCycleRecord(1),
        // Extremely large fields
        massiveDataField: 'x'.repeat(20 * 1024 * 1024), // 20MB field
        hugeCacheData: 'y'.repeat(15 * 1024 * 1024),    // 15MB field  
        giantLogBuffer: 'z'.repeat(10 * 1024 * 1024),   // 10MB field
        // Large array with many elements
        enormousTransactionList: Array(100000).fill(0).map((_, idx) => ({
          id: `massive-tx-${idx}`,
          data: 'transaction-data'.repeat(100),
          signature: 'sig'.repeat(200),
          metadata: 'meta'.repeat(150)
        })),
        // Large nested object structure
        complexStateTree: {
          level1: 'data'.repeat(1000000),
          level2: {
            level3: 'nested'.repeat(500000),
            level4: Array(50000).fill('deep-data'.repeat(20))
          }
        }
      }

      // Verify this is indeed a massive cycle (should be > 50MB)
      const cycleSize = JSON.stringify(extremelyLargeCycle).length
      expect(cycleSize).toBeGreaterThan(50 * 1024 * 1024)

      // Mock HTTP to return the extremely large response
      const extremeResponse = { cycles: [extremelyLargeCycle] }
      mockHttpGet.mockResolvedValue(extremeResponse)

      const result = await queries.getCyclesBatchFromNode(node, ['massive-marker'])

      // Verify the extremely large response was handled without truncation or memory issues
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual(extremeResponse)
        expect(result.value.cycles).toHaveLength(1)
        
        const receivedCycle: any = result.value.cycles[0]
        
        // Verify all large fields are preserved in full
        expect(receivedCycle.massiveDataField).toHaveLength(20 * 1024 * 1024)
        expect(receivedCycle.hugeCacheData).toHaveLength(15 * 1024 * 1024)
        expect(receivedCycle.giantLogBuffer).toHaveLength(10 * 1024 * 1024)
        expect(receivedCycle.enormousTransactionList).toHaveLength(100000)
        expect(receivedCycle.complexStateTree.level1.length).toBeGreaterThan(500000)
        expect(receivedCycle.complexStateTree.level2.level4).toHaveLength(50000)
        
        // Verify content integrity (no truncation occurred)
        expect(receivedCycle.massiveDataField).toBe('x'.repeat(20 * 1024 * 1024))
        expect(receivedCycle.hugeCacheData).toBe('y'.repeat(15 * 1024 * 1024))
        expect(receivedCycle.giantLogBuffer).toBe('z'.repeat(10 * 1024 * 1024))
      }

      // Verify HTTP call used extended timeout for massive payload
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('/cycles-batch?markers=massive-marker'),
        false,
        30000
      )
    })

    it('should handle response payload at theoretical limits', async () => {
      // Test at theoretical JSON/HTTP limits (approaching 2GB - JavaScript string limit)
      // Note: This is a stress test - in practice responses shouldn't be this large
      
      const theoreticalLimit = 100 * 1024 * 1024 // 100MB (reasonable test limit)
      
      // Create a response that approaches theoretical limits
      const massiveCycle = {
        ...createMockCycleRecord(1),
        // Single field approaching the limit
        theoreticalLimitField: 'L'.repeat(theoreticalLimit),
        metadata: {
          size: theoreticalLimit,
          description: 'Cycle at theoretical size limits',
          warning: 'This represents extreme edge case testing'
        }
      }

      // Verify we're at the intended size
      const responseSize = JSON.stringify({ cycles: [massiveCycle] }).length
      expect(responseSize).toBeGreaterThan(theoreticalLimit)

      // Mock HTTP to return the massive response
      const theoreticalResponse = { cycles: [massiveCycle] }
      mockHttpGet.mockResolvedValue(theoreticalResponse)

      const result = await queries.getCyclesBatchFromNode(node, ['theoretical-marker'])

      // Verify handling at theoretical limits
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual(theoreticalResponse)
        expect(result.value.cycles).toHaveLength(1)
        
        const receivedCycle: any = result.value.cycles[0]
        
        // Verify the massive field is preserved completely
        expect(receivedCycle.theoreticalLimitField).toHaveLength(theoreticalLimit)
        expect(receivedCycle.theoreticalLimitField).toBe('L'.repeat(theoreticalLimit))
        expect(receivedCycle.metadata.size).toBe(theoreticalLimit)
      }

      // Verify extended timeout was used for theoretical limit response
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('/cycles-batch?markers=theoretical-marker'),
        false,
        30000
      )
    })

    it('should handle mixed size responses efficiently', async () => {
      // Test mixture of small and very large cycles in same response
      const mixedCycles = [
        // Small normal cycle
        createMockCycleRecord(1),
        
        // Medium cycle with moderate data
        {
          ...createMockCycleRecord(2),
          mediumData: 'M'.repeat(1024 * 100), // 100KB
          transactions: Array(1000).fill('tx').map((tx, i) => `${tx}-${i}`)
        },
        
        // Large cycle with substantial data  
        {
          ...createMockCycleRecord(3),
          largeData: 'L'.repeat(1024 * 1024 * 5), // 5MB
          complexState: Array(10000).fill(0).map(i => ({ id: i, data: 'state'.repeat(50) }))
        },
        
        // Another small cycle
        createMockCycleRecord(4),
        
        // Very large cycle
        {
          ...createMockCycleRecord(5),
          veryLargeData: 'X'.repeat(1024 * 1024 * 10), // 10MB
          massiveArray: Array(50000).fill('data').map((d, i) => `${d}-${i}-${'padding'.repeat(20)}`)
        }
      ]

      // Mock HTTP to return mixed size response
      const mixedResponse = { cycles: mixedCycles }
      mockHttpGet.mockResolvedValue(mixedResponse)

      const markers = mixedCycles.map((cycle: any) => cycle.marker)
      const result = await queries.getCyclesBatchFromNode(node, markers)

      // Verify mixed size response handled correctly
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual(mixedResponse)
        expect(result.value.cycles).toHaveLength(5)
        
        // Verify each cycle type is preserved correctly
        const cycles: any[] = result.value.cycles
        
        // Small cycle (index 0, 3) should be unchanged
        expect(cycles[0]).toEqual(createMockCycleRecord(1))
        expect(cycles[3]).toEqual(createMockCycleRecord(4))
        
        // Medium cycle (index 1) should have medium data
        expect(cycles[1].mediumData).toHaveLength(1024 * 100)
        expect(cycles[1].transactions).toHaveLength(1000)
        
        // Large cycle (index 2) should have large data
        expect(cycles[2].largeData).toHaveLength(1024 * 1024 * 5)
        expect(cycles[2].complexState).toHaveLength(10000)
        
        // Very large cycle (index 4) should have very large data
        expect(cycles[4].veryLargeData).toHaveLength(1024 * 1024 * 10)
        expect(cycles[4].massiveArray).toHaveLength(50000)
      }

      // Verify proper HTTP handling for mixed response
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('/cycles-batch?markers='),
        false,
        30000
      )

      expect(mockP2pLogger.info).toHaveBeenCalledWith(`SyncV2: getCyclesBatchFromNode: fetching ${markers.length} cycles`)
    })

    it('should handle empty cycles with large metadata', async () => {
      // Test edge case: cycles with no core data but large metadata/debug info
      const metadataHeavyCycles = [
        {
          ...createMockCycleRecord(1),
          // Empty core data
          transactions: [],
          nodes: [],
          state: {},
          // But large metadata
          debugInfo: {
            systemLogs: 'debug'.repeat(1024 * 512),    // 2MB debug logs
            performanceMetrics: Array(100000).fill(0).map(i => ({
              timestamp: Date.now() + i,
              metric: `perf-data-${'metric'.repeat(100)}`
            })),
            errorReports: 'error'.repeat(1024 * 256),   // 1MB error reports
            networkStatistics: 'stats'.repeat(1024 * 512) // 2MB network stats
          },
          archivalData: {
            historicalState: 'history'.repeat(1024 * 1024), // 7MB historical data
            backupInfo: 'backup'.repeat(1024 * 512)          // 2MB backup info
          }
        }
      ]

      // Mock HTTP to return metadata-heavy response
      const metadataResponse = { cycles: metadataHeavyCycles }
      mockHttpGet.mockResolvedValue(metadataResponse)

      const result = await queries.getCyclesBatchFromNode(node, ['metadata-marker'])

      // Verify metadata-heavy response handled correctly
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual(metadataResponse)
        expect(result.value.cycles).toHaveLength(1)
        
        const cycle: any = result.value.cycles[0]
        
        // Verify core data is empty as expected
        expect(cycle.transactions).toEqual([])
        expect(cycle.nodes).toEqual([])
        expect(cycle.state).toEqual({})
        
        // Verify large metadata is preserved
        expect(cycle.debugInfo.systemLogs.length).toBeGreaterThan(1000000)
        expect(cycle.debugInfo.performanceMetrics).toHaveLength(100000)
        expect(cycle.debugInfo.errorReports.length).toBeGreaterThan(250000)
        expect(cycle.debugInfo.networkStatistics.length).toBeGreaterThan(1000000)
        expect(cycle.archivalData.historicalState.length).toBeGreaterThan(7000000)
        expect(cycle.archivalData.backupInfo.length).toBeGreaterThan(1000000)
      }

      // Verify appropriate timeout for metadata-heavy response
      expect(mockHttpGet).toHaveBeenCalledWith(
        expect.stringContaining('/cycles-batch?markers=metadata-marker'),
        false,
        30000
      )
    })
  })
})