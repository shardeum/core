import { ok, err } from 'neverthrow'
import { JoinRequest, StandbyRefreshRequest } from '@shardeum-foundation/lib-types/build/src/p2p/JoinTypes'
import { SignedObject } from '@shardeum-foundation/lib-types/build/src/p2p/P2PTypes'
import { ActiveNode } from '@shardeum-foundation/lib-types/build/src/p2p/SyncTypes'
import { P2P } from '@shardeum-foundation/lib-types'
import {
  submitStandbyRefresh,
  addStandbyRefresh,
  drainNewStandbyRefreshRequests,
  StandbyRefreshRequestResponse,
} from '../../../../../../src/p2p/Join/v2/standbyRefresh'
import { SeedNodesList } from '../../../../../../src/p2p/Utils'

// Mock dependencies
jest.mock('../../../../../../src/p2p/Utils', () => ({
  getRandomAvailableArchiver: jest.fn(),
  getActiveNodesFromArchiver: jest.fn(),
}))

jest.mock('../../../../../../src/utils', () => ({
  getRandom: jest.fn(),
  sleep: jest.fn(),
}))

jest.mock('../../../../../../src/http', () => ({
  post: jest.fn(),
}))

jest.mock('../../../../../../src/logger', () => ({
  logFlags: {
    verbose: false,
  },
}))

jest.mock('../../../../../../src/p2p/Join/v2/index', () => ({
  isOnStandbyList: jest.fn(),
}))

jest.mock('../../../../../../src/p2p/CycleChain', () => ({
  getNewest: jest.fn(),
}))

jest.mock('../../../../../../src/p2p/Context', () => ({
  crypto: {
    verify: jest.fn(),
  },
  config: {
    p2p: {
      resumbitStandbyRefreshWaitDuration: 1000,
    },
  },
}))

import { getRandomAvailableArchiver, getActiveNodesFromArchiver } from '../../../../../../src/p2p/Utils'
import * as utils from '../../../../../../src/utils'
import * as http from '../../../../../../src/http'
import { isOnStandbyList } from '../../../../../../src/p2p/Join/v2/index'
import * as CycleChain from '../../../../../../src/p2p/CycleChain'
import { crypto } from '../../../../../../src/p2p/Context'

const mockGetRandomAvailableArchiver = getRandomAvailableArchiver as jest.MockedFunction<
  typeof getRandomAvailableArchiver
>
const mockGetActiveNodesFromArchiver = getActiveNodesFromArchiver as jest.MockedFunction<
  typeof getActiveNodesFromArchiver
>
const mockGetRandom = utils.getRandom as jest.MockedFunction<typeof utils.getRandom>
const mockSleep = utils.sleep as jest.MockedFunction<typeof utils.sleep>
const mockHttpPost = http.post as jest.MockedFunction<typeof http.post>
const mockIsOnStandbyList = isOnStandbyList as jest.MockedFunction<typeof isOnStandbyList>
const mockGetNewest = CycleChain.getNewest as jest.MockedFunction<typeof CycleChain.getNewest>
const mockCryptoVerify = crypto.verify as jest.MockedFunction<typeof crypto.verify>

describe('standbyRefresh', () => {
  let mockActiveNodes: P2P.P2PTypes.SignedObject<SeedNodesList>
  let mockStandbyRefreshRequest: StandbyRefreshRequest
  let mockArchiver: ActiveNode

  beforeEach(() => {
    jest.clearAllMocks()

    mockArchiver = {
      publicKey: 'archiver-key',
      ip: '127.0.0.1',
      port: 9000,
    } as ActiveNode

    mockActiveNodes = {
      nodeList: [
        { publicKey: 'node1', ip: '127.0.0.1', port: 9001 },
        { publicKey: 'node2', ip: '127.0.0.1', port: 9002 },
        { publicKey: 'node3', ip: '127.0.0.1', port: 9003 },
      ],
      joinRequest: undefined,
      restartCycleRecord: undefined,
      dataRequestCycle: undefined,
      dataRequestStateMetaData: undefined,
    } as P2P.P2PTypes.SignedObject<SeedNodesList>

    mockStandbyRefreshRequest = {
      publicKey: 'test-public-key',
      cycleNumber: 123,
      sign: {
        owner: 'test-owner',
        sig: 'test-signature',
      },
    } as StandbyRefreshRequest
  })

  describe('submitStandbyRefresh', () => {
    it('should successfully submit standby refresh on first attempt', async () => {
      mockGetRandomAvailableArchiver.mockReturnValue(mockArchiver)
      mockGetActiveNodesFromArchiver.mockResolvedValue(ok(mockActiveNodes))
      mockGetRandom.mockReturnValue([mockActiveNodes.nodeList[0]])
      mockHttpPost.mockResolvedValue({})

      const result = await submitStandbyRefresh('test-public-key')

      expect(result.isOk()).toBe(true)
      expect(mockHttpPost).toHaveBeenCalledWith('127.0.0.1:9001/standby-refresh', { publicKey: 'test-public-key' })
    })

    it('should retry on failed HTTP request and succeed on second attempt', async () => {
      mockGetRandomAvailableArchiver.mockReturnValue(mockArchiver)
      mockGetActiveNodesFromArchiver.mockResolvedValue(ok(mockActiveNodes))
      mockGetRandom
        .mockReturnValueOnce([mockActiveNodes.nodeList[0]])
        .mockReturnValueOnce([mockActiveNodes.nodeList[1]])
      mockHttpPost.mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce({})

      const result = await submitStandbyRefresh('test-public-key')

      expect(result.isOk()).toBe(true)
      expect(mockHttpPost).toHaveBeenCalledTimes(2)
      expect(mockSleep).toHaveBeenCalledWith(1000)
    })

    it('should fail after maximum retries', async () => {
      mockGetRandomAvailableArchiver.mockReturnValue(mockArchiver)
      mockGetActiveNodesFromArchiver.mockResolvedValue(ok(mockActiveNodes))
      mockGetRandom
        .mockReturnValueOnce([mockActiveNodes.nodeList[0]])
        .mockReturnValueOnce([mockActiveNodes.nodeList[1]])
        .mockReturnValueOnce([mockActiveNodes.nodeList[2]])
      mockHttpPost.mockRejectedValue(new Error('Network error'))

      await expect(submitStandbyRefresh('test-public-key')).rejects.toThrow(
        'submitStandbyRefresh: Error posting standbyRefresh request'
      )

      expect(mockHttpPost).toHaveBeenCalledTimes(3)
    })

    it('should handle error when getting active nodes from archiver', async () => {
      mockGetRandomAvailableArchiver.mockReturnValue(mockArchiver)
      mockGetActiveNodesFromArchiver.mockResolvedValue(err(new Error('Archiver error')))

      await expect(submitStandbyRefresh('test-public-key')).rejects.toThrow(
        "submitStandbyRefresh: Error posting standbyRefresh request: Error: couldn't get active nodes: Error: Archiver error"
      )
    })

    it('should handle case when no active nodes available', async () => {
      mockGetRandomAvailableArchiver.mockReturnValue(mockArchiver)
      const emptyNodeList = {
        nodeList: [],
        joinRequest: undefined,
        restartCycleRecord: undefined,
        dataRequestCycle: undefined,
        dataRequestStateMetaData: undefined,
      } as P2P.P2PTypes.SignedObject<SeedNodesList>
      mockGetActiveNodesFromArchiver.mockResolvedValue(ok(emptyNodeList))

      await expect(submitStandbyRefresh('test-public-key')).rejects.toThrow(
        'submitStandbyRefresh: Error posting standbyRefresh request'
      )
    })

    it('should avoid querying the same node twice', async () => {
      mockGetRandomAvailableArchiver.mockReturnValue(mockArchiver)
      mockGetActiveNodesFromArchiver.mockResolvedValue(ok(mockActiveNodes))
      mockGetRandom
        .mockReturnValueOnce([mockActiveNodes.nodeList[0]])
        .mockReturnValueOnce([mockActiveNodes.nodeList[0]])
        .mockReturnValueOnce([mockActiveNodes.nodeList[1]])
      mockHttpPost.mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce({})

      const result = await submitStandbyRefresh('test-public-key')

      expect(result.isOk()).toBe(true)
      expect(mockGetRandom).toHaveBeenCalledTimes(3)
    })
  })

  describe('addStandbyRefresh', () => {
    beforeEach(() => {
      mockIsOnStandbyList.mockReturnValue(true)
      mockGetNewest.mockReturnValue({
        counter: 123,
        networkId: 'test-network',
        previous: 'prev-hash',
        start: 1000,
        duration: 30,
        networkConfigHash: 'config-hash',
      } as any)
      mockCryptoVerify.mockReturnValue(true)
    })

    it('should successfully add standby refresh request', () => {
      const result = addStandbyRefresh(mockStandbyRefreshRequest)

      expect(result).toEqual({
        success: true,
        reason: 'standbyRefreshRequest passed all checks and verification',
        fatal: false,
      })
    })

    it('should reject request if node not on standby list', () => {
      mockIsOnStandbyList.mockReturnValue(false)

      const result = addStandbyRefresh(mockStandbyRefreshRequest)

      expect(result).toEqual({
        success: false,
        reason: 'Node not found in standby list',
        fatal: false,
      })
    })

    it('should reject request with wrong cycle number', () => {
      mockGetNewest.mockReturnValue({
        counter: 124,
        networkId: 'test-network',
        previous: 'prev-hash',
        start: 1000,
        duration: 30,
        networkConfigHash: 'config-hash',
      } as any)

      const result = addStandbyRefresh(mockStandbyRefreshRequest)

      expect(result).toEqual({
        success: false,
        reason: 'cycle number in StandbyRefreshRequest request does not match current cycle number',
        fatal: false,
      })
    })

    it('should reject duplicate standby refresh request', () => {
      addStandbyRefresh(mockStandbyRefreshRequest)
      const result = addStandbyRefresh(mockStandbyRefreshRequest)

      expect(result).toEqual({
        success: false,
        reason: 'Node already in standby refresh list',
        fatal: false,
      })
    })

    it('should reject request with invalid signature', () => {
      mockCryptoVerify.mockReturnValue(false)

      // Create a fresh request to avoid conflict with already added request
      const freshRequest = {
        ...mockStandbyRefreshRequest,
        publicKey: 'fresh-key-for-signature-test',
      }
      mockIsOnStandbyList.mockReturnValue(true)

      const result = addStandbyRefresh(freshRequest)

      expect(result).toEqual({
        success: false,
        reason: 'verification of syncStarted request failed',
        fatal: false,
      })
    })
  })

  describe('drainNewStandbyRefreshRequests', () => {
    it('should return empty array when no requests', () => {
      // Clear any existing requests first
      drainNewStandbyRefreshRequests()

      const result = drainNewStandbyRefreshRequests()

      expect(result).toEqual([])
    })

    it('should return all requests and clear the list', () => {
      mockIsOnStandbyList.mockReturnValue(true)
      mockGetNewest.mockReturnValue({
        counter: 123,
        networkId: 'test-network',
        previous: 'prev-hash',
        start: 1000,
        duration: 30,
        networkConfigHash: 'config-hash',
      } as any)
      mockCryptoVerify.mockReturnValue(true)

      const request1 = { ...mockStandbyRefreshRequest, publicKey: 'key1' }
      const request2 = { ...mockStandbyRefreshRequest, publicKey: 'key2' }

      addStandbyRefresh(request1)
      addStandbyRefresh(request2)

      const result = drainNewStandbyRefreshRequests()

      expect(result).toHaveLength(2)
      expect(result).toContainEqual(request1)
      expect(result).toContainEqual(request2)

      const secondResult = drainNewStandbyRefreshRequests()
      expect(secondResult).toEqual([])
    })

    it('should handle single request', () => {
      mockIsOnStandbyList.mockReturnValue(true)
      mockGetNewest.mockReturnValue({
        counter: 123,
        networkId: 'test-network',
        previous: 'prev-hash',
        start: 1000,
        duration: 30,
        networkConfigHash: 'config-hash',
      } as any)
      mockCryptoVerify.mockReturnValue(true)

      addStandbyRefresh(mockStandbyRefreshRequest)

      const result = drainNewStandbyRefreshRequests()

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(mockStandbyRefreshRequest)
    })
  })
})
