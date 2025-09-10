import { jest } from '@jest/globals'
import { err, ok } from 'neverthrow'
import { P2P } from '@shardeum-foundation/lib-types'

// Mock external dependencies
jest.mock('../../../../../../src/p2p/Context', () => ({
  crypto: {
    keypair: {
      publicKey: 'mockPublicKey',
    },
    sign: jest.fn(),
    verify: jest.fn(),
  },
}))

jest.mock('../../../../../../src/utils', () => ({
  getRandom: jest.fn(),
}))

jest.mock('../../../../../../src/http', () => ({
  get: jest.fn(),
  post: jest.fn(),
}))

jest.mock('../../../../../../src/p2p/NodeList', () => ({
  byPubKey: new Map(),
}))

jest.mock('../../../../../../src/p2p/Join/v2', () => ({
  deleteStandbyNodeFromMap: jest.fn(),
  getStandbyNodesInfoMap: jest.fn(),
}))

jest.mock('../../../../../../src/p2p/Utils', () => ({
  getActiveNodesFromArchiver: jest.fn(),
  getRandomAvailableArchiver: jest.fn(),
}))

jest.mock('../../../../../../src/logger', () => ({
  logFlags: {
    verbose: true,
  },
}))

jest.mock('../../../../../../src/p2p/CycleChain', () => ({
  getNewest: jest.fn(),
  newest: {
    joinedConsensors: [],
  },
}))

jest.mock('../../../../../../src/p2p/Self', () => ({
  getPublicNodeInfo: jest.fn(),
}))

import * as unjoin from '../../../../../../src/p2p/Join/v2/unjoin'
import { crypto } from '../../../../../../src/p2p/Context'
import * as utils from '../../../../../../src/utils'
import * as http from '../../../../../../src/http'
import * as NodeList from '../../../../../../src/p2p/NodeList'
import { deleteStandbyNodeFromMap, getStandbyNodesInfoMap } from '../../../../../../src/p2p/Join/v2'
import { getActiveNodesFromArchiver, getRandomAvailableArchiver } from '../../../../../../src/p2p/Utils'
import * as CycleChain from '../../../../../../src/p2p/CycleChain'
import { getPublicNodeInfo } from '../../../../../../src/p2p/Self'

describe('unjoin', () => {
  const mockPublicKey = 'mockPublicKey'
  const mockActiveNode = {
    ip: '127.0.0.1',
    port: 8080,
    publicKey: 'activeNodePublicKey',
  }
  const mockCycleRecord = {
    counter: 100,
  }
  const mockSignedUnjoinRequest = {
    publicKey: 'testPublicKey',
    cycleNumber: 100,
    sign: 'mockSignature',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // Clear any existing unjoin requests
    unjoin.drainNewUnjoinRequests()
    ;(crypto.keypair.publicKey as any) = mockPublicKey
    ;(utils.getRandom as jest.Mock).mockReturnValue([mockActiveNode])
    ;(http.get as jest.Mock).mockImplementation(() => Promise.resolve(mockCycleRecord))
    ;(http.post as jest.Mock).mockImplementation(() => Promise.resolve({}))
    ;(crypto.sign as jest.Mock).mockReturnValue({ publicKey: mockPublicKey, cycleNumber: 100, sign: 'mockSign' })
    ;(crypto.verify as jest.Mock).mockReturnValue(true)
    ;(getRandomAvailableArchiver as jest.Mock).mockReturnValue('mockArchiver')
    ;(getActiveNodesFromArchiver as jest.Mock).mockImplementation(() =>
      Promise.resolve(ok({ nodeList: [mockActiveNode] }))
    )
    ;(getPublicNodeInfo as jest.Mock).mockReturnValue({ status: P2P.P2PTypes.NodeStatus.STANDBY })
    ;(CycleChain.getNewest as jest.Mock).mockReturnValue({ counter: 100 })
    ;(getStandbyNodesInfoMap as jest.Mock).mockReturnValue(
      new Map([
        ['testPublicKey', {}],
        ['anotherKey', {}],
      ])
    )
    ;(deleteStandbyNodeFromMap as jest.Mock).mockReturnValue(true)
    ;(NodeList.byPubKey as Map<string, any>).clear()
  })

  describe('submitUnjoin', () => {
    it('should return error when node is not in standby status', async () => {
      ;(getPublicNodeInfo as jest.Mock).mockReturnValue({ status: P2P.P2PTypes.NodeStatus.ACTIVE })

      const result = await unjoin.submitUnjoin()

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toBe('node is not in standby. Do not send unjoin request')
    })

    it('should return error when unable to get active nodes', async () => {
      ;(getActiveNodesFromArchiver as jest.Mock).mockImplementation(() => Promise.resolve(err('Failed to get nodes')))

      const result = await unjoin.submitUnjoin()

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toContain("couldn't get active nodes")
    })

    it('should return error when no cycle counter is found', async () => {
      ;(http.get as jest.Mock).mockImplementation(() => Promise.resolve({}))

      const result = await unjoin.submitUnjoin()

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toBe('No cycle counter found. Do not send unjoin request')
    })

    it('should return error when cycle counter is undefined', async () => {
      ;(http.get as jest.Mock).mockImplementation(() => Promise.resolve({ counter: null }))

      const result = await unjoin.submitUnjoin()

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toBe('No cycle counter found. Do not send unjoin request')
    })

    it('should throw error when HTTP post fails', async () => {
      ;(http.post as jest.Mock).mockImplementation(() => Promise.reject(new Error('Network error')))

      await expect(unjoin.submitUnjoin()).rejects.toThrow('submitUnjoin: Error posting unjoin request')
    })

    it('should successfully submit unjoin request', async () => {
      const result = await unjoin.submitUnjoin()

      expect(result.isOk()).toBe(true)
      expect(crypto.sign).toHaveBeenCalledWith({
        publicKey: mockPublicKey,
        cycleNumber: mockCycleRecord.counter,
      })
      expect(http.post).toHaveBeenCalledWith(`${mockActiveNode.ip}:${mockActiveNode.port}/unjoin`, expect.any(Object))
    })

    it('should get newest cycle record from random active node', async () => {
      await unjoin.submitUnjoin()

      expect(utils.getRandom).toHaveBeenCalledWith([mockActiveNode], 1)
      expect(http.get).toHaveBeenCalledWith(`${mockActiveNode.ip}:${mockActiveNode.port}/newest-cycle-record`)
    })
  })

  describe('processNewUnjoinRequest', () => {
    it('should add valid unjoin request to set', () => {
      const result = unjoin.processNewUnjoinRequest(mockSignedUnjoinRequest as any)

      expect(result.isOk()).toBe(true)
      // Verify the request was added by checking if it's in the drained requests
      const drained = unjoin.drainNewUnjoinRequests()
      expect(drained).toContain(mockSignedUnjoinRequest)
    })

    it('should return error for invalid unjoin request', () => {
      ;(crypto.verify as jest.Mock).mockReturnValue(false)

      const result = unjoin.processNewUnjoinRequest(mockSignedUnjoinRequest as any)

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toBe('unjoin request signature is invalid')
    })

    it('should log the public key when processing request', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

      unjoin.processNewUnjoinRequest(mockSignedUnjoinRequest as any)

      expect(consoleSpy).toHaveBeenCalledWith('processing unjoin request for', mockSignedUnjoinRequest.publicKey)
      consoleSpy.mockRestore()
    })
  })

  describe('validateUnjoinRequest', () => {
    it('should return error for duplicate unjoin request', () => {
      // First request should succeed
      const result1 = unjoin.processNewUnjoinRequest(mockSignedUnjoinRequest as any)
      expect(result1.isOk()).toBe(true)

      // Second request with same public key should fail
      const result2 = unjoin.validateUnjoinRequest(mockSignedUnjoinRequest as any)
      expect(result2.isErr()).toBe(true)
      expect(result2._unsafeUnwrapErr().message).toContain('already exists')
    })

    it('should return error when cycle number is too far from current', () => {
      const requestWithWrongCycle = {
        ...mockSignedUnjoinRequest,
        cycleNumber: 50, // More than 1 cycle away from current (100)
      }

      const result = unjoin.validateUnjoinRequest(requestWithWrongCycle as any)

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toContain(
        'cycle number in SignedUnjoinRequest request is not close enough'
      )
    })

    it('should accept cycle number within 1 of current cycle', () => {
      const requestWithCloseCycle = {
        ...mockSignedUnjoinRequest,
        cycleNumber: 99, // Within 1 of current (100)
      }

      const result = unjoin.validateUnjoinRequest(requestWithCloseCycle as any)

      expect(result.isOk()).toBe(true)
    })

    it('should return error for active node that was not selected last cycle', () => {
      ;(NodeList.byPubKey as Map<string, any>).set('testPublicKey', {})
      ;(CycleChain.newest.joinedConsensors as any) = []

      const result = unjoin.validateUnjoinRequest(mockSignedUnjoinRequest as any)

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toContain("is from an active node that can't unjoin")
    })

    it('should allow active node that was selected last cycle to unjoin', () => {
      ;(NodeList.byPubKey as Map<string, any>).set('testPublicKey', {})
      ;(CycleChain.newest.joinedConsensors as any) = [{ publicKey: 'testPublicKey' }]

      const result = unjoin.validateUnjoinRequest(mockSignedUnjoinRequest as any)

      expect(result.isOk()).toBe(true)
    })

    it('should return error for node not in standby and not selected last cycle', () => {
      ;(getStandbyNodesInfoMap as jest.Mock).mockReturnValue(new Map())
      ;(CycleChain.newest.joinedConsensors as any) = []

      const result = unjoin.validateUnjoinRequest(mockSignedUnjoinRequest as any)

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toContain('is from a node not in standby')
    })

    it('should return error for invalid signature', () => {
      ;(crypto.verify as jest.Mock).mockReturnValue(false)

      const result = unjoin.validateUnjoinRequest(mockSignedUnjoinRequest as any)

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toBe('unjoin request signature is invalid')
    })

    it('should verify signature with correct parameters', () => {
      unjoin.validateUnjoinRequest(mockSignedUnjoinRequest as any)

      expect(crypto.verify).toHaveBeenCalledWith(mockSignedUnjoinRequest, mockSignedUnjoinRequest.publicKey)
    })

    it('should return ok for valid unjoin request', () => {
      const result = unjoin.validateUnjoinRequest(mockSignedUnjoinRequest as any)

      expect(result.isOk()).toBe(true)
    })
  })

  describe('drainNewUnjoinRequests', () => {
    it('should return empty array when no requests exist', () => {
      const drained = unjoin.drainNewUnjoinRequests()

      expect(Array.isArray(drained)).toBe(true)
      expect(drained.length).toBe(0)
    })

    it('should return all unjoin requests and clear the set', () => {
      // Add some requests
      const result1 = unjoin.processNewUnjoinRequest(mockSignedUnjoinRequest as any)
      expect(result1.isOk()).toBe(true)

      const anotherRequest = { ...mockSignedUnjoinRequest, publicKey: 'anotherKey' }
      const result2 = unjoin.processNewUnjoinRequest(anotherRequest as any)
      expect(result2.isOk()).toBe(true)

      const drained = unjoin.drainNewUnjoinRequests()

      expect(drained.length).toBe(2)
      expect(drained).toContain(mockSignedUnjoinRequest)
      expect(drained).toContain(anotherRequest)

      // Verify the set is cleared
      const drainedAgain = unjoin.drainNewUnjoinRequests()
      expect(drainedAgain.length).toBe(0)
    })

    it('should maintain immutability - modifying returned array should not affect internal state', () => {
      unjoin.processNewUnjoinRequest(mockSignedUnjoinRequest as any)

      const drained = unjoin.drainNewUnjoinRequests()
      drained.push({ publicKey: 'newKey' } as any)

      const drainedAgain = unjoin.drainNewUnjoinRequests()
      expect(drainedAgain.length).toBe(0)
    })
  })

  describe('deleteStandbyNode', () => {
    it('should log success when node is successfully removed', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
      ;(deleteStandbyNodeFromMap as jest.Mock).mockReturnValue(true)
      ;(getStandbyNodesInfoMap as jest.Mock).mockReturnValue(new Map())

      unjoin.deleteStandbyNode('testPublicKey')

      expect(deleteStandbyNodeFromMap).toHaveBeenCalledWith('testPublicKey')
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('--removed standby node testPublicKey count: 0'))
      consoleSpy.mockRestore()
    })

    it('should log failure when node removal fails', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
      ;(deleteStandbyNodeFromMap as jest.Mock).mockReturnValue(false)
      ;(getStandbyNodesInfoMap as jest.Mock).mockReturnValue(new Map())

      unjoin.deleteStandbyNode('testPublicKey')

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('--failed to remove standby node testPublicKey count: 0')
      )
      consoleSpy.mockRestore()
    })

    it('should call deleteStandbyNodeFromMap with correct parameter', () => {
      unjoin.deleteStandbyNode('testPublicKey')

      expect(deleteStandbyNodeFromMap).toHaveBeenCalledWith('testPublicKey')
    })
  })

  describe('removeUnjoinRequest', () => {
    it('should remove unjoin request with matching public key', () => {
      // Set up standby nodes for both requests
      ;(getStandbyNodesInfoMap as jest.Mock).mockReturnValue(
        new Map([
          ['testPublicKey', {}],
          ['anotherKey', {}],
        ])
      )

      // Add multiple requests
      const result1 = unjoin.processNewUnjoinRequest(mockSignedUnjoinRequest as any)
      expect(result1.isOk()).toBe(true)

      const anotherRequest = { ...mockSignedUnjoinRequest, publicKey: 'anotherKey' }
      const result2 = unjoin.processNewUnjoinRequest(anotherRequest as any)
      expect(result2.isOk()).toBe(true)

      // Remove one request
      unjoin.removeUnjoinRequest('testPublicKey')

      // Verify only the other request remains
      const drained = unjoin.drainNewUnjoinRequests()
      expect(drained.length).toBe(1)
      expect(drained[0].publicKey).toBe('anotherKey')
    })

    it('should do nothing when no matching request exists', () => {
      unjoin.processNewUnjoinRequest(mockSignedUnjoinRequest as any)

      unjoin.removeUnjoinRequest('nonExistentKey')

      const drained = unjoin.drainNewUnjoinRequests()
      expect(drained.length).toBe(1)
      expect(drained[0].publicKey).toBe('testPublicKey')
    })

    it('should handle empty request set gracefully', () => {
      expect(() => unjoin.removeUnjoinRequest('anyKey')).not.toThrow()
    })

    it('should remove all requests with matching public key', () => {
      // This tests the forEach implementation - though in practice,
      // duplicates shouldn't exist due to Set semantics
      unjoin.processNewUnjoinRequest(mockSignedUnjoinRequest as any)

      unjoin.removeUnjoinRequest('testPublicKey')

      const drained = unjoin.drainNewUnjoinRequests()
      expect(drained.length).toBe(0)
    })
  })
})
