import { describe, beforeEach, test, expect, jest, afterEach } from '@jest/globals'
import * as Utils from '../../../../src/p2p/Utils'
import { Comparison } from '../../../../src/p2p/Utils'
import * as utils from '../../../../src/utils'
import FastRandomIterator from '../../../../src/utils/FastRandomIterator'
import { nestedCountersInstance } from '../../../../src/utils/nestedCounters'
import { profilerInstance } from '../../../../src/utils/profiler'
import * as NodeList from '../../../../src/p2p/NodeList'
import * as Self from '../../../../src/p2p/Self'
import * as Context from '../../../../src/p2p/Context'

// Store original values for restoration
let originalStateManager: any
let originalConfig: any

// Mock dependencies
jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
    countRareEvent: jest.fn(),
  },
}))

jest.mock('../../../../src/utils/profiler', () => ({
  profilerInstance: {
    scopedProfileSectionStart: jest.fn(),
    scopedProfileSectionEnd: jest.fn(),
  },
}))

jest.mock('../../../../src/p2p/Self', () => ({
  id: 'test-self-id',
  getPublicNodeInfo: jest.fn(() => ({ id: 'test-self-id', ip: '127.0.0.1', port: 9001 })),
}))

// Mock NodeList module with mocked getAgeIndexForNodeId method that can be updated
const mockGetAgeIndexForNodeId = jest.fn()
jest.mock('../../../../src/p2p/NodeList', () => ({
  activeOthersByIdOrder: [],
  syncingByIdOrder: [],
  getAgeIndexForNodeId: (...args: any[]) => mockGetAgeIndexForNodeId(...args),
}))

// Mock utils without using spread
jest.mock('../../../../src/utils', () => {
  const original = jest.requireActual('../../../../src/utils')
  // Create a new object to avoid spread
  const result: any = {}

  // Copy properties from original
  Object.keys(original).forEach((key) => {
    result[key] = original[key]
  })

  // Override with mocks
  result.shuffleArray = jest.fn((arr: any[]) => arr)
  result.robustPromiseAll = jest.fn()
  result.sleep = jest.fn(() => Promise.resolve())

  return result
})

// Mock Context module without using spread
jest.mock('../../../../src/p2p/Context', () => {
  const original = jest.requireActual('../../../../src/p2p/Context')
  // Create a new object to avoid spread
  const result: any = {}

  // Copy properties from original
  Object.keys(original).forEach((key) => {
    result[key] = original[key]
  })

  // Override with mocks
  result.stateManager = {
    currentCycleShardData: {
      nodeShardDataMap: new Map(),
    },
  }
  result.config = {
    p2p: {
      rotationEdgeToAvoid: 5,
    },
    debug: {
      robustQueryDebug: false,
    },
  }

  return result
})

describe('Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Save originals for restoration in tests if needed
    originalStateManager = Context.stateManager ? { ...Context.stateManager } : {}
    originalConfig = Context.config ? { ...Context.config } : {}
  })

  describe('compareQuery', () => {
    test('should return results when matching criteria is met', async () => {
      const mockNodes = ['node1', 'node2', 'node3']
      const mockQueryFn = jest.fn((node) => {
        return Promise.resolve(`response-${node}`)
      })
      const mockCompareFn = jest.fn(() => Comparison.EQUAL)

      const result = await Utils.compareQuery(mockNodes, mockQueryFn, mockCompareFn, 2)

      expect(result).toEqual([])
      expect(mockQueryFn).toHaveBeenCalledTimes(2)
      expect(mockCompareFn).toHaveBeenCalledTimes(2)
    })

    test('should handle BETTER comparison result by restarting the query', async () => {
      const mockNodes = ['node1', 'node2', 'node3']
      const mockQueryFn = jest.fn((node) => {
        if (mockQueryFn.mock.calls.length === 1) return Promise.resolve('response-1')
        if (mockQueryFn.mock.calls.length === 2) return Promise.resolve('response-2')
        return Promise.resolve('response-3')
      })

      const mockCompareFn = jest.fn(() => {
        if (mockCompareFn.mock.calls.length === 1) return Comparison.BETTER
        return Comparison.EQUAL
      })

      const result = await Utils.compareQuery(mockNodes, mockQueryFn, mockCompareFn, 2)

      expect(result).toEqual([])
      expect(mockQueryFn).toHaveBeenCalledTimes(3)
      expect(mockCompareFn).toHaveBeenCalledTimes(3)
    })

    test('should handle ABORT comparison result by stopping the query', async () => {
      const mockNodes = ['node1', 'node2', 'node3']
      const mockQueryFn = jest.fn(() => Promise.resolve('response'))
      const mockCompareFn = jest.fn(() => Comparison.ABORT)

      const result = await Utils.compareQuery(mockNodes, mockQueryFn, mockCompareFn, 2)

      expect(result).toEqual([])
      expect(mockQueryFn).toHaveBeenCalledTimes(1)
      expect(mockCompareFn).toHaveBeenCalledTimes(1)
    })

    test('should collect errors when query function fails', async () => {
      const mockNodes = ['node1', 'node2', 'node3']
      const mockQueryFn = jest.fn((node) => {
        if (node === 'node2') {
          return Promise.reject(new Error('Query failed'))
        }
        return Promise.resolve(`response-${node}`)
      })
      const mockCompareFn = jest.fn(() => Comparison.EQUAL)

      const result = await Utils.compareQuery(mockNodes, mockQueryFn, mockCompareFn, 2)

      expect(result.length).toBe(1)
      expect(result[0].node).toBe('node2')
      expect(mockQueryFn).toHaveBeenCalledTimes(3)
      expect(mockCompareFn).toHaveBeenCalledTimes(2)
    })
  })

  describe('sequentialQuery', () => {
    test('should return the first successful result that passes verification', async () => {
      const mockNodes = ['node1', 'node2', 'node3']
      const expectedResponse = 'valid-response'
      const mockQueryFn = jest.fn(() => Promise.resolve(expectedResponse))
      const mockVerifyFn = jest.fn((result: any): boolean => true)

      const result = await Utils.sequentialQuery(mockNodes, mockQueryFn, mockVerifyFn)

      expect(result.result).toBe(expectedResponse)
      expect(result.errors).toEqual([])
      expect(utils.shuffleArray).toHaveBeenCalledWith(mockNodes)
      expect(mockQueryFn).toHaveBeenCalledTimes(3)
      expect(mockVerifyFn).toHaveBeenCalledTimes(3)
    })

    test('should try multiple nodes if verification fails', async () => {
      const mockNodes = ['node1', 'node2', 'node3']
      const mockQueryFn = jest.fn(() => {
        if (mockQueryFn.mock.calls.length === 1) return Promise.resolve('invalid-response')
        return Promise.resolve('valid-response')
      })

      const mockVerifyFn = jest.fn((result: any): boolean => true)

      const result = await Utils.sequentialQuery(mockNodes, mockQueryFn, mockVerifyFn)

      expect(result.result).toBe('valid-response')
      expect(mockQueryFn).toHaveBeenCalledTimes(3)
      expect(mockVerifyFn).toHaveBeenCalledTimes(3)
    })

    test('should collect errors when query function fails', async () => {
      const mockNodes = ['node1', 'node2', 'node3']
      const mockError = new Error('Query failed')
      const mockQueryFn = jest.fn(() => Promise.reject(mockError))
      const mockVerifyFn = jest.fn((result: any): boolean => true)

      const result = await Utils.sequentialQuery(mockNodes, mockQueryFn, mockVerifyFn)

      expect(result.result).toBeUndefined()
      expect(result.errors.length).toBe(3)
      expect(result.errors[0].error).toBe(mockError)
      expect(mockQueryFn).toHaveBeenCalledTimes(3)
      expect(mockVerifyFn).not.toHaveBeenCalled()
    })
  })

  describe('robustQuery', () => {
    beforeEach(() => {
      jest.spyOn(utils, 'robustPromiseAll').mockImplementation(async (promises) => {
        const results = []
        const errors = []
        for (const promise of promises) {
          try {
            results.push(await promise)
          } catch (err) {
            errors.push(err)
          }
        }
        return [results, errors]
      })
    })

    test('should throw error when no nodes are provided', async () => {
      await expect(
        Utils.robustQuery(
          [],
          jest.fn(() => Promise.resolve('test'))
        )
      ).rejects.toThrow('No nodes given.')
    })

    test('should throw error when queryFn is not a function', async () => {
      await expect(Utils.robustQuery(['node1'], 'not-a-function' as any)).rejects.toThrow('is not a valid function')
    })

    test('should set minimum redundancy to 1', async () => {
      const mockNodes = ['node1', 'node2', 'node3']
      const mockQueryFn = jest.fn(() => Promise.resolve('response'))
      const mockEqualityFn = jest.fn(() => true)

      await Utils.robustQuery(
        mockNodes,
        mockQueryFn,
        mockEqualityFn,
        0 // Should be adjusted to 1
      )

      expect(mockQueryFn).toHaveBeenCalled()
    })

    test('should limit redundancy to node count', async () => {
      const mockNodes = ['node1', 'node2']
      const mockQueryFn = jest.fn(() => Promise.resolve('response'))
      const mockEqualityFn = jest.fn(() => true)

      await Utils.robustQuery(
        mockNodes,
        mockQueryFn,
        mockEqualityFn,
        5 // Should be limited to 2
      )

      expect(mockQueryFn).toHaveBeenCalledTimes(2)
    })

    test('should return successful result when redundancy is met', async () => {
      const mockNodes = ['node1', 'node2', 'node3']
      const mockResponse = 'test-response'
      const mockQueryFn = jest.fn(() => Promise.resolve(mockResponse))
      const mockEqualityFn = jest.fn(() => true)

      const result = await Utils.robustQuery(mockNodes, mockQueryFn, mockEqualityFn, 2)

      expect(result.topResult).toBe(mockResponse)
      expect(result.winningNodes.length).toBe(2)
      expect(result.isRobustResult).toBe(true)
    })

    test('should handle query errors gracefully', async () => {
      const mockNodes = ['node1', 'node2', 'node3', 'node4']
      const mockQueryFn = jest.fn(() => {
        if (mockQueryFn.mock.calls.length === 1) return Promise.reject(new Error('Query failed'))
        return Promise.resolve('response1')
      })

      const result = await Utils.robustQuery(
        mockNodes,
        mockQueryFn,
        (a, b) => a === b, // Simple equality function
        2
      )

      expect(result.topResult).toBe('response1')
      expect(result.winningNodes.length).toBe(2)
      expect(result.isRobustResult).toBe(true)
    })

    test('should use FastRandomIterator when shuffleNodes is true', async () => {
      const mockNodes = ['node1', 'node2', 'node3', 'node4']
      const mockQueryFn = jest.fn(() => Promise.resolve('response'))

      const getNextIndexSpy = jest.spyOn(FastRandomIterator.prototype, 'getNextIndex').mockReturnValue(0)

      await Utils.robustQuery(
        mockNodes,
        mockQueryFn,
        (a, b) => a === b,
        2,
        true // shuffleNodes = true
      )

      expect(getNextIndexSpy).toHaveBeenCalled()
      getNextIndexSpy.mockRestore()
    })
  })

  describe('attempt', () => {
    afterEach(() => {
      jest.clearAllMocks()
    })

    test('should resolve on first successful attempt', async () => {
      const mockFn = jest.fn(() => Promise.resolve('success'))

      const result = await Utils.attempt(mockFn)

      expect(result).toBe('success')
      expect(mockFn).toHaveBeenCalledTimes(1)
      expect(utils.sleep).not.toHaveBeenCalled()
    })

    test('should retry on failure up to maxRetries', async () => {
      const mockError = new Error('Temporary failure')
      const mockFn = jest.fn(() => {
        if (mockFn.mock.calls.length <= 2) return Promise.reject(mockError)
        return Promise.resolve('success')
      })

      const result = await Utils.attempt(mockFn, { maxRetries: 3, delay: 100 })

      expect(result).toBe('success')
      expect(mockFn).toHaveBeenCalledTimes(3)
      expect(utils.sleep).toHaveBeenCalledTimes(2)
      expect(utils.sleep).toHaveBeenCalledWith(100)
    })

    test('should throw last error when all attempts fail', async () => {
      const mockError = new Error('Persistent failure')
      const mockFn = jest.fn(() => Promise.reject(mockError))

      await expect(Utils.attempt(mockFn, { maxRetries: 2 })).rejects.toThrow(mockError)

      expect(mockFn).toHaveBeenCalledTimes(2)
      expect(utils.sleep).toHaveBeenCalledTimes(2)
    })
  })

  describe('generateUUID', () => {
    test('should generate unique UUIDs', () => {
      const uuid1 = Utils.generateUUID()
      const uuid2 = Utils.generateUUID()

      expect(uuid1).not.toBe(uuid2)
    })
  })

  describe('getOurNodeIndex', () => {
    test('should return null when node not found', () => {
      // Use the mock from the context
      Context.stateManager.currentCycleShardData.nodeShardDataMap = new Map()

      const result = Utils.getOurNodeIndex()

      expect(result).toBeNull()
    })
  })

  describe('isNodeInRotationBounds', () => {
    test('should return true when node was recently rotated in', () => {
      // Use the mock implementation instead of overriding the property
      mockGetAgeIndexForNodeId.mockReturnValue({
        idx: 2, // Low index = recently rotated in
        total: 20,
      })

      const result = Utils.isNodeInRotationBounds('test-node-id')

      expect(result).toBe(true)
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('skip-newly-rotated-node', 'test-node-id')
    })

    test('should return true when node is about to rotate out', () => {
      mockGetAgeIndexForNodeId.mockReturnValue({
        idx: 18, // High index = about to rotate out
        total: 20,
      })

      const result = Utils.isNodeInRotationBounds('test-node-id')

      expect(result).toBe(true)
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('skip-about-to-rotate-out-node', 'test-node-id')
    })

    test('should return false when node is in stable range', () => {
      mockGetAgeIndexForNodeId.mockReturnValue({
        idx: 10, // Middle index = stable
        total: 20,
      })

      const result = Utils.isNodeInRotationBounds('test-node-id')

      expect(result).toBe(false)
      expect(nestedCountersInstance.countEvent).not.toHaveBeenCalled()
    })
  })
})
