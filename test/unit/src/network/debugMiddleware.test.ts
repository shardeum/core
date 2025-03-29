// Mock CycleChain with a getter/setter approach - declare BEFORE imports
const cycleChainMock = {
  _newest: null as any,
  get newest() {
    return this._newest
  },
}

import { describe, beforeEach, test, expect, jest } from '@jest/globals'
import {
  stripQueryParams,
  isDebugModeMiddleware,
  isDebugModeMiddlewareLow,
  isDebugModeMiddlewareMedium,
  isDebugModeMiddlewareHigh,
  isDebugModeMiddlewareMultiSig,
  isDebugModeMiddlewareMultiSigHigh,
  isDebugModeMiddlewareMultiSigMedium,
  isDebugModeMiddlewareMultiSigLow,
} from '../../../../src/network/debugMiddleware'
import * as debugModule from '../../../../src/debug'
import * as Context from '../../../../src/p2p/Context'
import * as crypto from '@shardeum-foundation/lib-crypto-utils'
import { DevSecurityLevel } from '../../../../src/shardus/shardus-types'
import { Utils } from '@shardeum-foundation/lib-types'
import { contactArchiver, getStatusHistoryCopy } from '../../../../src/p2p/Self'
import { NodeStatus } from '@shardeum-foundation/lib-types/build/src/p2p/P2PTypes'
import { getNewestCycle } from '../../../../src/p2p/Sync'

// Define proper types for the mocks
type MockFunction<T extends (...args: any) => any> = jest.Mock<ReturnType<T>, Parameters<T>>

// Mock dependencies
jest.mock('../../../../src/debug', () => ({
  isDebugMode: jest.fn(),
  getDevPublicKeys: jest.fn(),
  ensureKeySecurity: jest.fn(),
  getMultisigPublicKeys: jest.fn(),
}))

jest.mock('../../../../src/p2p/Context', () => ({
  crypto: {
    getPublicKey: jest.fn(),
    verify: jest.fn(),
  },
  stateManager: {
    app: {
      verifyMultiSigs: jest.fn(),
    },
  },
}))

jest.mock('@shardeum-foundation/lib-crypto-utils', () => ({
  hash: jest.fn(),
}))

jest.mock('../../../../src/logger', () => ({
  logFlags: {
    verbose: false,
    console: false,
  },
}))

jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
  },
}))

jest.mock('@shardeum-foundation/lib-types', () => ({
  Utils: {
    safeStringify: jest.fn(),
    safeJsonParse: jest.fn(),
  },
}))

jest.mock('../../../../src/p2p/CycleChain', () => cycleChainMock)

jest.mock('../../../../src/p2p/Self', () => ({
  contactArchiver: jest.fn(),
  getStatusHistoryCopy: jest.fn(),
}))

jest.mock('../../../../src/p2p/Sync', () => ({
  getNewestCycle: jest.fn(),
}))

jest.mock('../../../../src/config/server', () => ({
  __esModule: true,
  default: {
    debug: {
      minMultiSigRequiredForEndpoints: 3,
    },
  },
}))

describe('debugMiddleware', () => {
  // Common test variables
  let req: any
  let res: any
  let next: any

  // Create typed references to mocked functions
  const mockIsDebugMode = debugModule.isDebugMode as MockFunction<typeof debugModule.isDebugMode>
  const mockGetPublicKey = Context.crypto.getPublicKey as MockFunction<typeof Context.crypto.getPublicKey>
  const mockGetStatusHistoryCopy = getStatusHistoryCopy as MockFunction<typeof getStatusHistoryCopy>
  const mockContactArchiver = contactArchiver as MockFunction<typeof contactArchiver>
  const mockGetNewestCycle = getNewestCycle as MockFunction<typeof getNewestCycle>
  const mockVerify = Context.crypto.verify as MockFunction<typeof Context.crypto.verify>
  const mockGetDevPublicKeys = debugModule.getDevPublicKeys as MockFunction<typeof debugModule.getDevPublicKeys>
  const mockEnsureKeySecurity = debugModule.ensureKeySecurity as MockFunction<typeof debugModule.ensureKeySecurity>
  const mockHash = crypto.hash as MockFunction<typeof crypto.hash>
  const mockSafeStringify = Utils.safeStringify as MockFunction<typeof Utils.safeStringify>
  const mockSafeJsonParse = Utils.safeJsonParse as MockFunction<typeof Utils.safeJsonParse>

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks()

    // Mock request, response, and next function
    req = {
      query: {},
      originalUrl: '/debug/endpoint',
    }

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }

    next = jest.fn()

    // Set up default mock behavior
    mockIsDebugMode.mockReturnValue(false)
    mockGetPublicKey.mockReturnValue('abcd1234')
    // Only mock what's needed for the tests
    mockGetStatusHistoryCopy.mockReturnValue([{ moduleStatus: NodeStatus.ACTIVE } as any])
    cycleChainMock._newest = { networkId: 'test-network-id', counter: 1 }
  })

  describe('#stripQueryParams', () => {
    test('should remove specified query parameters from URL', () => {
      // Arrange
      const url = '/debug/endpoint?param1=value1&param2=value2&param3=value3'
      const paramsToRemove = ['param1', 'param3']

      // Act
      const result = stripQueryParams(url, paramsToRemove)

      // Assert
      expect(result).toEqual('/debug/endpoint?param2=value2')
    })

    test('should return original URL if no query parameters exist', () => {
      // Arrange
      const url = '/debug/endpoint'
      const paramsToRemove = ['param1', 'param2']

      // Act
      const result = stripQueryParams(url, paramsToRemove)

      // Assert
      expect(result).toEqual('/debug/endpoint')
    })

    test('should return base URL if all query parameters are removed', () => {
      // Arrange
      const url = '/debug/endpoint?param1=value1&param2=value2'
      const paramsToRemove = ['param1', 'param2']

      // Act
      const result = stripQueryParams(url, paramsToRemove)

      // Assert
      expect(result).toEqual('/debug/endpoint')
    })

    test('should handle URLs with multiple question marks and ignore them correctly', () => {
      // Arrange
      const url = '/debug/endpoint?param1=value1?param2=value2'
      const paramsToRemove = ['param1']

      // Act
      const result = stripQueryParams(url, paramsToRemove)

      // Assert
      expect(result).toEqual('/debug/endpoint')
    })
  })

  describe('Middleware functions in debug mode', () => {
    beforeEach(() => {
      mockIsDebugMode.mockReturnValue(true)
    })

    test('isDebugModeMiddleware should call next() when in debug mode', async () => {
      // Act
      await isDebugModeMiddleware(req, res, next)

      // Assert
      expect(next).toHaveBeenCalledTimes(1)
      expect(res.status).not.toHaveBeenCalled()
    })

    test('isDebugModeMiddlewareLow should call next() when in debug mode', async () => {
      // Act
      await isDebugModeMiddlewareLow(req, res, next)

      // Assert
      expect(next).toHaveBeenCalledTimes(1)
      expect(res.status).not.toHaveBeenCalled()
    })

    test('isDebugModeMiddlewareMedium should call next() when in debug mode', async () => {
      // Act
      await isDebugModeMiddlewareMedium(req, res, next)

      // Assert
      expect(next).toHaveBeenCalledTimes(1)
      expect(res.status).not.toHaveBeenCalled()
    })

    test('isDebugModeMiddlewareHigh should call next() when in debug mode', async () => {
      // Act
      await isDebugModeMiddlewareHigh(req, res, next)

      // Assert
      expect(next).toHaveBeenCalledTimes(1)
      expect(res.status).not.toHaveBeenCalled()
    })

    test('isDebugModeMiddlewareMultiSig should call next() when in debug mode', async () => {
      // Act
      await isDebugModeMiddlewareMultiSig(req, res, next)

      // Assert
      expect(next).toHaveBeenCalledTimes(1)
      expect(res.status).not.toHaveBeenCalled()
    })

    test('isDebugModeMiddlewareMultiSigHigh should call next() when in debug mode', async () => {
      // Act
      await isDebugModeMiddlewareMultiSigHigh(req, res, next)

      // Assert
      expect(next).toHaveBeenCalledTimes(1)
      expect(res.status).not.toHaveBeenCalled()
    })

    test('isDebugModeMiddlewareMultiSigMedium should call next() when in debug mode', async () => {
      // Act
      await isDebugModeMiddlewareMultiSigMedium(req, res, next)

      // Assert
      expect(next).toHaveBeenCalledTimes(1)
      expect(res.status).not.toHaveBeenCalled()
    })

    test('isDebugModeMiddlewareMultiSigLow should call next() when in debug mode', async () => {
      // Act
      await isDebugModeMiddlewareMultiSigLow(req, res, next)

      // Assert
      expect(next).toHaveBeenCalledTimes(1)
      expect(res.status).not.toHaveBeenCalled()
    })
  })

  describe('Single signature authentication', () => {
    beforeEach(() => {
      mockIsDebugMode.mockReturnValue(false)
    })

    test('should return 401 when no signature is provided', async () => {
      // Act
      await isDebugModeMiddlewareHigh(req, res, next)

      // Assert
      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({
        status: 401,
        message: 'Unauthorized!',
      })
      expect(next).not.toHaveBeenCalled()
    })

    test('should return 401 when node is not intended target', async () => {
      // Arrange
      req.query = {
        sig: 'test-signature',
        sig_counter: '123456',
        nodePubkeys: 'other1,other2',
      }

      // Act
      await isDebugModeMiddlewareHigh(req, res, next)

      // Assert
      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({
        status: 401,
        message: 'Unauthorized!',
      })
      expect(next).not.toHaveBeenCalled()
    })

    test('should return 500 when latest cycle is not available', async () => {
      // Arrange
      req.query = {
        sig: 'test-signature',
        sig_counter: '123456',
        nodePubkeys: 'abcd',
      }
      cycleChainMock._newest = null
      mockContactArchiver.mockResolvedValue([])
      mockGetNewestCycle.mockResolvedValue(null)

      // Act
      await isDebugModeMiddlewareHigh(req, res, next)

      // Assert
      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({
        error: "Node can't gather latest Cycle to perform signature verification",
      })
    })

    test('should verify signature and proceed when valid', async () => {
      // Arrange
      const currentTime = Date.now()
      const validCounter = currentTime + 1000

      req.query = {
        sig: 'valid-signature',
        sig_counter: validCounter.toString(),
        nodePubkeys: 'abcd',
      }
      req.originalUrl = `/debug/endpoint?sig=valid-signature&sig_counter=${validCounter}&nodePubkeys=abcd&param=value`

      // Use proper DevSecurityLevel values
      const mockPublicKeys = { owner1: DevSecurityLevel.High }
      mockGetDevPublicKeys.mockReturnValue(mockPublicKeys)
      mockHash.mockReturnValue('hash-value')
      mockSafeStringify.mockReturnValue('{"stringified":"payload"}')
      mockVerify.mockReturnValue(true)
      mockEnsureKeySecurity.mockReturnValue(true)

      // Act
      await isDebugModeMiddlewareHigh(req, res, next)

      // Assert
      expect(mockVerify).toHaveBeenCalled()
      expect(mockEnsureKeySecurity).toHaveBeenCalled()
      expect(next).toHaveBeenCalledTimes(1)
      expect(res.status).not.toHaveBeenCalled()
    })

    test('should return 403 when security level check fails', async () => {
      // Arrange
      const currentTime = Date.now()
      const validCounter = currentTime + 1000

      req.query = {
        sig: 'valid-signature',
        sig_counter: validCounter.toString(),
        nodePubkeys: 'abcd',
      }
      req.originalUrl = `/debug/endpoint?sig=valid-signature&sig_counter=${validCounter}&nodePubkeys=abcd&param=value`

      // Use proper DevSecurityLevel values
      const mockPublicKeys = { owner1: DevSecurityLevel.High }
      mockGetDevPublicKeys.mockReturnValue(mockPublicKeys)
      mockHash.mockReturnValue('hash-value')
      mockSafeStringify.mockReturnValue('{"stringified":"payload"}')
      mockVerify.mockReturnValue(true)
      mockEnsureKeySecurity.mockReturnValue(false)

      // Act
      await isDebugModeMiddlewareHigh(req, res, next)

      // Assert
      expect(mockVerify).toHaveBeenCalled()
      expect(mockEnsureKeySecurity).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({
        status: 403,
        message: 'FORBIDDEN!',
      })
      expect(next).not.toHaveBeenCalled()
    })

    test('should reject when counter is not greater than last counter', async () => {
      // Arrange
      const validCounter = Date.now() - 1000 // Counter in the past

      req.query = {
        sig: 'valid-signature',
        sig_counter: validCounter.toString(),
        nodePubkeys: 'abcd',
      }
      req.originalUrl = `/debug/endpoint?sig=valid-signature&sig_counter=${validCounter}&nodePubkeys=abcd&param=value`

      // Use proper DevSecurityLevel values
      const mockPublicKeys = { owner1: DevSecurityLevel.High }
      mockGetDevPublicKeys.mockReturnValue(mockPublicKeys)
      mockHash.mockReturnValue('hash-value')
      mockSafeStringify.mockReturnValue('{"stringified":"payload"}')

      // Act
      await isDebugModeMiddlewareHigh(req, res, next)

      // Assert
      expect(mockVerify).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(401)
      expect(next).not.toHaveBeenCalled()
    })

    test('should reject when signature verification fails', async () => {
      // Arrange
      const currentTime = Date.now()
      const validCounter = currentTime + 1000

      req.query = {
        sig: 'invalid-signature',
        sig_counter: validCounter.toString(),
        nodePubkeys: 'abcd',
      }
      req.originalUrl = `/debug/endpoint?sig=invalid-signature&sig_counter=${validCounter}&nodePubkeys=abcd&param=value`

      // Use proper DevSecurityLevel values
      const mockPublicKeys = { owner1: DevSecurityLevel.High }
      mockGetDevPublicKeys.mockReturnValue(mockPublicKeys)
      mockHash.mockReturnValue('hash-value')
      mockSafeStringify.mockReturnValue('{"stringified":"payload"}')
      mockVerify.mockReturnValue(false)

      // Act
      await isDebugModeMiddlewareHigh(req, res, next)

      // Assert
      expect(mockVerify).toHaveBeenCalled()
      expect(mockEnsureKeySecurity).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(401)
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('Multi-signature authentication', () => {
    beforeEach(() => {
      mockIsDebugMode.mockReturnValue(false)
    })

    test('should return 400 when signatures are invalid format', async () => {
      // Arrange
      req.query = {
        sig: 'not-json-array',
        sig_counter: '123456',
        nodePubkeys: 'abcd',
      }
      mockSafeJsonParse.mockReturnValue(null)

      // Act
      await isDebugModeMiddlewareMultiSig(req, res, next)

      // Assert
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        status: 400,
        message: 'Bad Request!',
      })
      expect(next).not.toHaveBeenCalled()
    })

    test('should return 401 when node is not intended target', async () => {
      // Arrange
      req.query = {
        sig: JSON.stringify(['sig1', 'sig2']),
        sig_counter: '123456',
        nodePubkeys: 'other1,other2',
      }
      mockSafeJsonParse.mockReturnValue(['sig1', 'sig2'])

      // Act
      await isDebugModeMiddlewareMultiSig(req, res, next)

      // Assert
      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({
        status: 401,
        message: 'Unauthorized!',
      })
      expect(next).not.toHaveBeenCalled()
    })

    test('should return 500 when latest cycle is not available', async () => {
      // Arrange
      req.query = {
        sig: JSON.stringify(['sig1', 'sig2']),
        sig_counter: '123456',
        nodePubkeys: 'abcd',
      }
      cycleChainMock._newest = null
      mockContactArchiver.mockResolvedValue([])
      mockGetNewestCycle.mockResolvedValue(null)
      mockSafeJsonParse.mockReturnValue(['sig1', 'sig2'])

      // Act
      await isDebugModeMiddlewareMultiSig(req, res, next)

      // Assert
      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({
        error: "Node can't gather latest Cycle to perform signature verification",
      })
    })
  })
})
