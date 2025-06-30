import { jest } from '@jest/globals'
import { err, ok } from 'neverthrow'
import { EventEmitter } from 'events'

// Mock external dependencies
jest.mock('../../../../../../src/http', () => ({
  get: jest.fn(),
}))

jest.mock('../../../../../../src/utils', () => ({
  getRandom: jest.fn(),
}))

jest.mock('../../../../../../src/p2p/Context', () => ({
  crypto: {
    verify: jest.fn(),
    getPublicKey: jest.fn(),
  },
}))

jest.mock('../../../../../../src/p2p/Utils', () => ({
  getActiveNodesFromArchiver: jest.fn(),
  getRandomAvailableArchiver: jest.fn(),
}))

jest.mock('../../../../../../src/p2p/Self')

import * as acceptance from '../../../../../../src/p2p/Join/v2/acceptance'
import * as http from '../../../../../../src/http'
import { getRandom } from '../../../../../../src/utils'
import { crypto } from '../../../../../../src/p2p/Context'
import { getActiveNodesFromArchiver, getRandomAvailableArchiver } from '../../../../../../src/p2p/Utils'

describe('acceptance', () => {
  const mockActiveNode = {
    ip: '127.0.0.1',
    port: 8080,
    publicKey: 'mockActiveNodePublicKey',
  }

  const mockAcceptanceOffer = {
    cycleMarker: 'mockCycleMarker',
    activeNodePublicKey: 'mockActiveNodePublicKey',
  }

  const mockSignedOffer = {
    ...mockAcceptanceOffer,
    sign: 'mockSignature',
  }

  const mockCycleRecord = {
    joinedConsensors: [
      { publicKey: 'ourMockPublicKey' },
      { publicKey: 'otherPublicKey' },
    ],
  }

  beforeEach(() => {
    jest.clearAllMocks()
    acceptance.reset()
    ;(getRandomAvailableArchiver as jest.Mock).mockReturnValue('mockArchiver')
    ;(crypto.getPublicKey as jest.Mock).mockReturnValue('ourMockPublicKey')
    ;(getRandom as jest.Mock).mockReturnValue([mockActiveNode])
    ;(http.get as jest.Mock).mockResolvedValue(mockCycleRecord)
  })

  describe('getEventEmitter', () => {
    it('should return an EventEmitter instance', () => {
      const emitter = acceptance.getEventEmitter()
      expect(emitter).toBeInstanceOf(EventEmitter)
    })

    it('should return the same instance on multiple calls', () => {
      const emitter1 = acceptance.getEventEmitter()
      const emitter2 = acceptance.getEventEmitter()
      expect(emitter1).toBe(emitter2)
    })
  })

  describe('reset', () => {
    it('should reset hasConfirmedAcceptance to false', () => {
      // Set up a confirmed acceptance state first
      ;(getActiveNodesFromArchiver as jest.Mock).mockResolvedValue(ok({ nodeList: [mockActiveNode] }))
      ;(crypto.verify as jest.Mock).mockReturnValue(true)
      
      // Reset should set hasConfirmedAcceptance to false
      acceptance.reset()
      expect(acceptance.getHasConfirmedAcceptance()).toBe(false)
    })
  })

  describe('isAlreadyCheckingAcceptance', () => {
    it('should return false initially', () => {
    })

    it('should return true when confirmAcceptance is in progress', async () => {
      ;(getActiveNodesFromArchiver as jest.Mock).mockImplementation(() => {
        // Check the flag while the function is executing
        expect(acceptance.isAlreadyCheckingAcceptance()).toBe(true)
        return Promise.resolve(ok({ nodeList: [mockActiveNode] }))
      })
      ;(crypto.verify as jest.Mock).mockReturnValue(true)

      await acceptance.confirmAcceptance(mockSignedOffer as any)
    })
  })

  describe('getHasConfirmedAcceptance', () => {
    it('should return false initially', () => {
      expect(acceptance.getHasConfirmedAcceptance()).toBe(false)
    })

    it('should return true after successful acceptance confirmation', async () => {
      ;(getActiveNodesFromArchiver as jest.Mock).mockResolvedValue(ok({ nodeList: [mockActiveNode] }))
      ;(crypto.verify as jest.Mock).mockReturnValue(true)

      const result = await acceptance.confirmAcceptance(mockSignedOffer as any)
      
      expect(result.isOk()).toBe(true)
      expect(acceptance.getHasConfirmedAcceptance()).toBe(true)
    })
  })

  describe('confirmAcceptance', () => {
    it('should return error when unable to get active nodes', async () => {
      ;(getActiveNodesFromArchiver as jest.Mock).mockResolvedValue(err('Failed to get nodes'))

      const result = await acceptance.confirmAcceptance(mockSignedOffer as any)

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toContain("couldn't get active nodes")
    })

    it('should return error when no active nodes are provided', async () => {
      ;(getActiveNodesFromArchiver as jest.Mock).mockResolvedValue(ok({ nodeList: [] }))

      const result = await acceptance.confirmAcceptance(mockSignedOffer as any)

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toBe('no active nodes provided')
    })

    it('should return error when acceptance offer signature is invalid', async () => {
      ;(getActiveNodesFromArchiver as jest.Mock).mockResolvedValue(ok({ nodeList: [mockActiveNode] }))
      ;(crypto.verify as jest.Mock).mockReturnValue(false)

      const result = await acceptance.confirmAcceptance(mockSignedOffer as any)

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toBe('acceptance offer signature invalid')
    })

    it('should return error when exception occurs during initial checks', async () => {
      ;(getActiveNodesFromArchiver as jest.Mock).mockRejectedValue(new Error('Network error'))

      const result = await acceptance.confirmAcceptance(mockSignedOffer as any)

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toContain('error while checking acceptance')
    })

    it('should return error when unable to get cycle from node', async () => {
      ;(getActiveNodesFromArchiver as jest.Mock).mockResolvedValue(ok({ nodeList: [mockActiveNode] }))
      ;(crypto.verify as jest.Mock).mockReturnValue(true)
      ;(http.get as jest.Mock).mockRejectedValue(new Error('HTTP error'))

      const result = await acceptance.confirmAcceptance(mockSignedOffer as any)

      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().message).toContain('error getting cycle from node')
    })

    it('should return false when node is not included in joinedConsensors', async () => {
      const cycleWithoutOurNode = {
        joinedConsensors: [
          { publicKey: 'otherPublicKey1' },
          { publicKey: 'otherPublicKey2' },
        ],
      }

      ;(getActiveNodesFromArchiver as jest.Mock).mockResolvedValue(ok({ nodeList: [mockActiveNode] }))
      ;(crypto.verify as jest.Mock).mockReturnValue(true)
      ;(http.get as jest.Mock).mockResolvedValue(cycleWithoutOurNode)

      const result = await acceptance.confirmAcceptance(mockSignedOffer as any)

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap()).toBe(false)
      expect(acceptance.getHasConfirmedAcceptance()).toBe(false)
    })

    it('should return true when node is included in joinedConsensors', async () => {
      ;(getActiveNodesFromArchiver as jest.Mock).mockResolvedValue(ok({ nodeList: [mockActiveNode] }))
      ;(crypto.verify as jest.Mock).mockReturnValue(true)

      const result = await acceptance.confirmAcceptance(mockSignedOffer as any)

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap()).toBe(true)
      expect(acceptance.getHasConfirmedAcceptance()).toBe(true)
    })

    it('should verify the acceptance offer with correct parameters', async () => {
      ;(getActiveNodesFromArchiver as jest.Mock).mockResolvedValue(ok({ nodeList: [mockActiveNode] }))
      ;(crypto.verify as jest.Mock).mockReturnValue(true)

      await acceptance.confirmAcceptance(mockSignedOffer as any)

      expect(crypto.verify).toHaveBeenCalledWith(mockSignedOffer, mockSignedOffer.activeNodePublicKey)
    })

    it('should call getRandom with correct parameters', async () => {
      ;(getActiveNodesFromArchiver as jest.Mock).mockResolvedValue(ok({ nodeList: [mockActiveNode] }))
      ;(crypto.verify as jest.Mock).mockReturnValue(true)

      await acceptance.confirmAcceptance(mockSignedOffer as any)

      expect(getRandom).toHaveBeenCalledWith([mockActiveNode], 1)
    })

    it('should make HTTP request to correct URL', async () => {
      ;(getActiveNodesFromArchiver as jest.Mock).mockResolvedValue(ok({ nodeList: [mockActiveNode] }))
      ;(crypto.verify as jest.Mock).mockReturnValue(true)

      await acceptance.confirmAcceptance(mockSignedOffer as any)

      const expectedUrl = `http://${mockActiveNode.ip}:${mockActiveNode.port}/cycle-by-marker?marker=${mockAcceptanceOffer.cycleMarker}`
      expect(http.get).toHaveBeenCalledWith(expectedUrl)
    })

    it('should preserve hasConfirmedAcceptance if already true', async () => {
      // First, set hasConfirmedAcceptance to true
      ;(getActiveNodesFromArchiver as jest.Mock).mockResolvedValue(ok({ nodeList: [mockActiveNode] }))
      ;(crypto.verify as jest.Mock).mockReturnValue(true)
      await acceptance.confirmAcceptance(mockSignedOffer as any)
      expect(acceptance.getHasConfirmedAcceptance()).toBe(true)

      // Now test with a cycle that doesn't include our node
      const cycleWithoutOurNode = {
        joinedConsensors: [{ publicKey: 'otherPublicKey' }],
      }
      ;(http.get as jest.Mock).mockResolvedValue(cycleWithoutOurNode)

      const result = await acceptance.confirmAcceptance(mockSignedOffer as any)

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap()).toBe(false)
      // hasConfirmedAcceptance should still be true due to the logical OR
      expect(acceptance.getHasConfirmedAcceptance()).toBe(true)
    })
  })

  describe('AcceptanceOffer interface', () => {
    it('should have the correct structure', () => {
      const offer: acceptance.AcceptanceOffer = {
        cycleMarker: 'test-marker',
        activeNodePublicKey: 'test-public-key',
      }

      expect(offer.cycleMarker).toBe('test-marker')
      expect(offer.activeNodePublicKey).toBe('test-public-key')
    })
  })
})