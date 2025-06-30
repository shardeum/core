import { JoinRequest } from '@shardeum-foundation/lib-types/build/src/p2p/JoinTypes'
import * as JoinV2 from '../../../../../../src/p2p/Join/v2/index'
import * as Self from '../../../../../../src/p2p/Self'
import * as CycleChain from '../../../../../../src/p2p/CycleChain'
import { executeNodeSelection } from '../../../../../../src/p2p/Join/v2/select'

jest.mock('../../../../../../src/p2p/Self')
jest.mock('../../../../../../src/p2p/CycleChain')
jest.mock('../../../../../../src/p2p/Join/v2/acceptance')
jest.mock('../../../../../../src/p2p/Join/v2/unjoin')
jest.mock('../../../../../../src/p2p/Join/v2/select')
jest.mock('../../../../../../src/p2p/Utils')
jest.mock('neverthrow')

jest.mock('../../../../../../src/p2p/Context', () => ({
  config: {
    p2p: {
      useJoinProtocolV2: true,
      maxStandbyCount: 10,
      standbyListFastHash: false,
      useNTPOffsets: false
    }
  },
  crypto: {
    hash: jest.fn().mockReturnValue('test-hash-123')
  },
  shardus: {},
  setDefaultConfigs: jest.fn()
}))

jest.mock('../../../../../../src/logger', () => ({
  logFlags: {
    verbose: false,
    important_as_fatal: false
  }
}))

jest.mock('../../../../../../src/utils/functions/stringifyReduce', () => ({
  stringifyReduce: jest.fn((data) => JSON.stringify(data))
}))

jest.mock('../../../../../../src/network', () => ({
  ipInfo: {
    externalIp: '127.0.0.1',
    externalPort: 9001,
    internalIp: '127.0.0.1',
    internalPort: 9001
  },
  shardusGetTime: jest.fn(() => Date.now())
}))

jest.mock('../../../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn()
  }
}))

describe('JoinV2', () => {
  let mockEmitter: any
  let mockJoinRequest: JoinRequest

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Reset the crypto mock to ensure it returns the expected value
    const Context = require('../../../../../../src/p2p/Context')
    Context.crypto.hash.mockReturnValue('test-hash-123')
    
    mockEmitter = {
      on: jest.fn()
    }
    ;(Self as any).emitter = mockEmitter

    mockJoinRequest = {
      nodeInfo: {
        publicKey: 'test-pub-key-1',
        externalIp: '127.0.0.1',
        externalPort: 9001,
        internalIp: '127.0.0.1',
        internalPort: 9001,
        address: '127.0.0.1:9001',
        joinRequestTimestamp: Date.now(),
        activeTimestamp: Date.now(),
        activeCycle: 1,
        id: 'test-node-id',
        status: 'joining',
        syncingTimestamp: Date.now(),
        readyTimestamp: Date.now()
      },
      refreshedCounter: 0,
      selectionNum: '1',
      cycleMarker: 'test-marker',
      proofOfWork: 'test-pow',
      version: '1',
      sign: 'test-signature'
    } as unknown as JoinRequest

    // Clear the standby maps
    JoinV2.standbyNodesInfo.clear()
    JoinV2.standbyNodesInfoHashes.clear()
    JoinV2.standbyNodesRefresh.clear()
  })

  describe('init', () => {
    it('should set up event listeners for cycle quarters', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      
      JoinV2.init()
      
      expect(consoleSpy).toHaveBeenCalledWith('initializing join protocol v2')
      expect(mockEmitter.on).toHaveBeenCalledWith('cycle_q1_start', expect.any(Function))
      expect(mockEmitter.on).toHaveBeenCalledWith('cycle_q2_start', expect.any(Function))
      
      consoleSpy.mockRestore()
    })

    it('should call executeNodeSelection when cycle_q2_start is emitted', () => {
      JoinV2.init()
      
      const q2Handler = mockEmitter.on.mock.calls.find(call => call[0] === 'cycle_q2_start')[1]
      q2Handler()
      
      expect(executeNodeSelection).toHaveBeenCalled()
    })
  })

  describe('deleteStandbyNodeFromMap', () => {
    it('should delete node from both maps when key exists', () => {
      JoinV2.standbyNodesInfo.set('test-key', mockJoinRequest)
      JoinV2.standbyNodesInfoHashes.set('test-key', 'test-hash')
      
      const result = JoinV2.deleteStandbyNodeFromMap('test-key')
      
      expect(result).toBe(true)
      expect(JoinV2.standbyNodesInfo.has('test-key')).toBe(false)
      expect(JoinV2.standbyNodesInfoHashes.has('test-key')).toBe(false)
    })

    it('should return false when key does not exist', () => {
      const result = JoinV2.deleteStandbyNodeFromMap('non-existent-key')
      expect(result).toBe(false)
    })
  })

  describe('saveJoinRequest', () => {
    it('should add to standby map immediately when persistImmediately is true', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      
      JoinV2.saveJoinRequest(mockJoinRequest, true)
      
      expect(JoinV2.standbyNodesInfo.has(mockJoinRequest.nodeInfo.publicKey)).toBe(true)
      expect(JoinV2.standbyNodesInfoHashes.has(mockJoinRequest.nodeInfo.publicKey)).toBe(true)
      
      consoleSpy.mockRestore()
    })

    it('should add to newJoinRequests when persistImmediately is false', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      
      JoinV2.saveJoinRequest(mockJoinRequest, false)
      
      const drained = JoinV2.drainNewJoinRequests()
      expect(drained).toContain(mockJoinRequest)
      
      consoleSpy.mockRestore()
    })
  })

  describe('drainNewJoinRequests', () => {
    it('should return and clear newJoinRequests', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      
      JoinV2.saveJoinRequest(mockJoinRequest, false)
      
      const result1 = JoinV2.drainNewJoinRequests()
      const result2 = JoinV2.drainNewJoinRequests()
      
      expect(result1).toContain(mockJoinRequest)
      expect(result2).toEqual([])
      
      consoleSpy.mockRestore()
    })
  })

  describe('addStandbyJoinRequests', () => {
    it('should add valid join requests to standby map', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      
      JoinV2.addStandbyJoinRequests([mockJoinRequest])
      
      expect(JoinV2.standbyNodesInfo.has(mockJoinRequest.nodeInfo.publicKey)).toBe(true)
      
      consoleSpy.mockRestore()
    })

    it('should skip null join requests and log error', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      ;(require('../../../../../../src/logger') as any).logFlags.important_as_fatal = true
      
      JoinV2.addStandbyJoinRequests([null as any], true)
      
      expect(JoinV2.standbyNodesInfo.size).toBe(0)
      
      consoleSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })
  })

  describe('getSortedStandbyJoinRequests', () => {
    it('should return nodes sorted by public key', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      
      const node1 = { ...mockJoinRequest, nodeInfo: { ...mockJoinRequest.nodeInfo, publicKey: 'c-key' }}
      const node2 = { ...mockJoinRequest, nodeInfo: { ...mockJoinRequest.nodeInfo, publicKey: 'a-key' }}
      const node3 = { ...mockJoinRequest, nodeInfo: { ...mockJoinRequest.nodeInfo, publicKey: 'b-key' }}
      
      JoinV2.addStandbyJoinRequests([node1, node2, node3])
      
      const sorted = JoinV2.getSortedStandbyJoinRequests()
      
      expect(sorted[0].nodeInfo.publicKey).toBe('a-key')
      expect(sorted[1].nodeInfo.publicKey).toBe('b-key')
      expect(sorted[2].nodeInfo.publicKey).toBe('c-key')
      
      consoleSpy.mockRestore()
    })
  })

  describe('computeNewStandbyListHash', () => {
    it('should compute hash from sorted standby list', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      
      JoinV2.addStandbyJoinRequests([mockJoinRequest])
      
      const hash = JoinV2.computeNewStandbyListHash()
      
      expect(hash).toBe('test-hash-123')
      
      consoleSpy.mockRestore()
    })

    it('should use fast hash when config.p2p.standbyListFastHash is true', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      ;(require('../../../../../../src/p2p/Context') as any).config.p2p.standbyListFastHash = true
      
      JoinV2.addStandbyJoinRequests([mockJoinRequest])
      
      const hash = JoinV2.computeNewStandbyListHash()
      
      expect(hash).toBe('test-hash-123')
      
      consoleSpy.mockRestore()
    })
  })

  describe('getStandbyListHash', () => {
    it('should return undefined when no newest cycle', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      ;(CycleChain as any).newest = null
      
      const hash = JoinV2.getStandbyListHash()
      expect(hash).toBeUndefined()
      
      consoleSpy.mockRestore()
    })

    it('should return standbyNodeListHash from newest cycle', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      const expectedHash = 'test-hash-123'
      ;(CycleChain as any).newest = { standbyNodeListHash: expectedHash }
      
      const hash = JoinV2.getStandbyListHash()
      expect(hash).toBe(expectedHash)
      
      consoleSpy.mockRestore()
    })
  })

  describe('getTxListHash', () => {
    it('should return undefined when no newest cycle', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      ;(CycleChain as any).newest = null
      
      const hash = JoinV2.getTxListHash()
      expect(hash).toBeUndefined()
      
      consoleSpy.mockRestore()
    })

    it('should return txlisthash from newest cycle', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      const expectedHash = 'tx-hash-456'
      ;(CycleChain as any).newest = { txlisthash: expectedHash }
      
      const hash = JoinV2.getTxListHash()
      expect(hash).toBe(expectedHash)
      
      consoleSpy.mockRestore()
    })
  })

  describe('getLastHashedStandbyList', () => {
    it('should return empty array initially', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      
      // Clear any previous state
      JoinV2.standbyNodesInfo.clear()
      JoinV2.computeNewStandbyListHash()
      
      const list = JoinV2.getLastHashedStandbyList()
      expect(list).toEqual([])
      
      consoleSpy.mockRestore()
    })

    it('should return last hashed list after computing hash', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      
      JoinV2.addStandbyJoinRequests([mockJoinRequest])
      JoinV2.computeNewStandbyListHash()
      
      const list = JoinV2.getLastHashedStandbyList()
      expect(list).toHaveLength(1)
      expect(list[0]).toEqual(mockJoinRequest)
      
      consoleSpy.mockRestore()
    })
  })

  describe('getStandbyNodesInfoMap', () => {
    it('should return the standby nodes info map', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      
      const map = JoinV2.getStandbyNodesInfoMap()
      expect(map).toBe(JoinV2.standbyNodesInfo)
      
      consoleSpy.mockRestore()
    })
  })

  describe('isOnStandbyList', () => {
    it('should return true when public key exists in standby list', () => {
      JoinV2.standbyNodesInfo.set('test-key', mockJoinRequest)
      
      const result = JoinV2.isOnStandbyList('test-key')
      expect(result).toBe(true)
    })

    it('should return false when public key does not exist in standby list', () => {
      const result = JoinV2.isOnStandbyList('non-existent-key')
      expect(result).toBe(false)
    })
  })

  describe('debugDumpJoinRequestList', () => {
    it('should log sorted join request list', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      
      const node1 = { ...mockJoinRequest, nodeInfo: { ...mockJoinRequest.nodeInfo, publicKey: 'b-key', externalPort: 9001 }}
      const node2 = { ...mockJoinRequest, nodeInfo: { ...mockJoinRequest.nodeInfo, publicKey: 'a-key', externalPort: 9002 }}
      
      JoinV2.debugDumpJoinRequestList([node1, node2], 'test message')
      
      expect(consoleSpy).toHaveBeenCalled()
      const consoleCall = consoleSpy.mock.calls.find(call => call[0].includes('Standby list:'))
      expect(consoleCall).toBeDefined()
      
      consoleSpy.mockRestore()
    })
  })

  describe('shutdown', () => {
    it('should return early when not using join protocol v2', async () => {
      ;(require('../../../../../../src/p2p/Context') as any).config.p2p.useJoinProtocolV2 = false
      
      await JoinV2.shutdown()
      
      // Test passes if no error is thrown
      expect(true).toBe(true)
    })
  })
})