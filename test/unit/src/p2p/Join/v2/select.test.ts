// Mock all dependencies at the top level before importing
jest.mock('../../../../../../src/p2p/Self')
jest.mock('../../../../../../src/p2p/CycleChain')
jest.mock('../../../../../../src/p2p/Join/v2', () => ({
  getStandbyNodesInfoMap: jest.fn()
}))
jest.mock('../../../../../../src/p2p/ModeSystemFuncs')
jest.mock('../../../../../../src/utils')
jest.mock('../../../../../../src/p2p/Context', () => ({
  crypto: {
    keypair: { publicKey: 'test-public-key' },
    sign: jest.fn().mockReturnValue({ signature: 'test-signature', sign: 'test-sign' })
  },
  shardus: {
    config: {
      p2p: {
        goldenTicketEnabled: false
      }
    }
  }
}))
jest.mock('../../../../../../src/http')
jest.mock('../../../../../../src/logger', () => ({
  logFlags: {
    p2pNonFatal: false,
    console: false,
    verbose: false
  },
  logger: {
    mainLog_debug: jest.fn(),
    combine: jest.fn()
  }
}))
jest.mock('../../../../../../src/utils/nestedCounters')
jest.mock('../../../../../../src/p2p/NodeList')
jest.mock('../../../../../../src/p2p/Utils')
jest.mock('../../../../../../src/network')
jest.mock('../../../../../../src/p2p/CycleCreator', () => ({
  currentCycle: 1,
  currentQuarter: 1
}))
jest.mock('../../../../../../src/p2p/CycleAutoScale', () => ({
  reset: jest.fn()
}))
jest.mock('../../../../../../src/shardus', () => ({
  Context: {
    setDefaultConfigs: jest.fn()
  }
}))

import * as select from '../../../../../../src/p2p/Join/v2/select'
import * as Self from '../../../../../../src/p2p/Self'
import * as CycleChain from '../../../../../../src/p2p/CycleChain'
import { getStandbyNodesInfoMap } from '../../../../../../src/p2p/Join/v2'
import { calculateToAcceptV2 } from '../../../../../../src/p2p/ModeSystemFuncs'
import { selectIndexesWithOffeset } from '../../../../../../src/utils'
import { crypto, shardus } from '../../../../../../src/p2p/Context'
import * as http from '../../../../../../src/http'

const mockSelf = Self as jest.Mocked<typeof Self>
const mockCycleChain = CycleChain as jest.Mocked<typeof CycleChain>
const mockGetStandbyNodesInfoMap = getStandbyNodesInfoMap as jest.MockedFunction<typeof getStandbyNodesInfoMap>
const mockCalculateToAcceptV2 = calculateToAcceptV2 as jest.MockedFunction<typeof calculateToAcceptV2>
const mockSelectIndexesWithOffeset = selectIndexesWithOffeset as jest.MockedFunction<typeof selectIndexesWithOffeset>
const mockCrypto = crypto as jest.Mocked<typeof crypto>
const mockShardus = shardus as jest.Mocked<typeof shardus>
const mockHttp = http as jest.Mocked<typeof http>

describe('select', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Default mock setup
    Object.defineProperty(mockSelf, 'isActive', { value: true, writable: true })
    Object.defineProperty(mockSelf, 'isRestartNetwork', { value: false, writable: true })
    Object.defineProperty(mockSelf, 'isFirst', { value: false, writable: true })
    
    mockCycleChain.newest = { counter: 1, joinedConsensors: [] } as any
    mockCycleChain.getCurrentCycleMarker = jest.fn().mockReturnValue('abcd1234')
    mockCycleChain.getNewest = jest.fn().mockReturnValue({ counter: 1, joinedConsensors: [] })
    
    mockCrypto.keypair = { publicKey: 'test-public-key' }
    mockCrypto.sign = jest.fn().mockReturnValue({ signature: 'test-signature', sign: 'test-sign' } as any)
    
    mockShardus.config = { p2p: { goldenTicketEnabled: false } } as any
    
    mockGetStandbyNodesInfoMap.mockReturnValue(new Map())
    mockCalculateToAcceptV2.mockReturnValue({ add: 0, remove: 0 })
    mockSelectIndexesWithOffeset.mockReturnValue([])
    mockHttp.post = jest.fn().mockResolvedValue({})
    
    // Clear any previously selected keys
    select.drainSelectedPublicKeys()
  })

  describe('executeNodeSelection', () => {
    it('should execute node selection when node is active', () => {
      Object.defineProperty(mockSelf, 'isActive', { value: true, writable: true })
      mockCalculateToAcceptV2.mockReturnValue({ add: 3, remove: 0 })
      
      // Setup mock for getStandbyNodesInfoMap to simulate actual nodes
      const standbyNodesInfo = new Map([
        ['key1', { selectionNum: '100', appJoinData: null }],
        ['key2', { selectionNum: '200', appJoinData: null }],
        ['key3', { selectionNum: '050', appJoinData: null }]
      ])
      mockGetStandbyNodesInfoMap.mockReturnValue(standbyNodesInfo as any)
      mockSelectIndexesWithOffeset.mockReturnValue([0, 1, 2])
      
      select.executeNodeSelection()
      
      expect(mockCalculateToAcceptV2).toHaveBeenCalledWith(mockCycleChain.newest)
      expect(mockSelectIndexesWithOffeset).toHaveBeenCalledWith(3, 3, expect.any(Number))
      
      // Check that nodes were actually selected
      const drainedKeys = select.drainSelectedPublicKeys()
      expect(drainedKeys).toHaveLength(3)
    })

    it('should execute node selection when node is not active but restart network is enabled', () => {
      Object.defineProperty(mockSelf, 'isActive', { value: false, writable: true })
      Object.defineProperty(mockSelf, 'isRestartNetwork', { value: true, writable: true })
      mockCalculateToAcceptV2.mockReturnValue({ add: 2, remove: 0 })
      
      // Setup mock for getStandbyNodesInfoMap to simulate actual nodes
      const standbyNodesInfo = new Map([
        ['key1', { selectionNum: '100', appJoinData: null }],
        ['key2', { selectionNum: '200', appJoinData: null }]
      ])
      mockGetStandbyNodesInfoMap.mockReturnValue(standbyNodesInfo as any)
      mockSelectIndexesWithOffeset.mockReturnValue([0, 1])
      
      select.executeNodeSelection()
      
      expect(mockSelectIndexesWithOffeset).toHaveBeenCalledWith(2, 2, expect.any(Number))
      
      // Check that nodes were actually selected
      const drainedKeys = select.drainSelectedPublicKeys()
      expect(drainedKeys).toHaveLength(2)
    })

    it('should not execute node selection when node is not active and restart network is disabled', () => {
      Object.defineProperty(mockSelf, 'isActive', { value: false, writable: true })
      Object.defineProperty(mockSelf, 'isRestartNetwork', { value: false, writable: true })
      
      select.executeNodeSelection()
      
      expect(mockSelectIndexesWithOffeset).not.toHaveBeenCalled()
    })
  })

  describe('selectNodes', () => {
    it('should select nodes based on selection numbers', () => {
      const standbyNodesInfo = new Map([
        ['key1', { selectionNum: '100', appJoinData: null }],
        ['key2', { selectionNum: '200', appJoinData: null }],
        ['key3', { selectionNum: '050', appJoinData: null }]
      ])
      
      mockGetStandbyNodesInfoMap.mockReturnValue(standbyNodesInfo as any)
      mockSelectIndexesWithOffeset.mockReturnValue([0, 1])
      
      select.selectNodes(2)
      
      const drainedKeys = select.drainSelectedPublicKeys()
      expect(drainedKeys).toHaveLength(2)
      expect(drainedKeys).toContain('key2') // key2 has highest selectionNum (200) so should be at index 0
      expect(drainedKeys).toContain('key1') // key1 has second highest selectionNum (100) so should be at index 1
    })

    it('should cap maxAllowed to available nodes length', () => {
      const standbyNodesInfo = new Map([
        ['key1', { selectionNum: '100', appJoinData: null }]
      ])
      
      mockGetStandbyNodesInfoMap.mockReturnValue(standbyNodesInfo as any)
      mockSelectIndexesWithOffeset.mockReturnValue([0])
      
      select.selectNodes(5)
      
      const drainedKeys = select.drainSelectedPublicKeys()
      expect(drainedKeys).toHaveLength(1)
      expect(drainedKeys).toContain('key1')
    })

    it('should handle empty standby nodes', () => {
      mockGetStandbyNodesInfoMap.mockReturnValue(new Map())
      
      select.selectNodes(3)
      
      const drainedKeys = select.drainSelectedPublicKeys()
      expect(drainedKeys).toHaveLength(0)
    })

    it('should handle invalid input parameters', () => {
      const standbyNodesInfo = new Map([
        ['key1', { selectionNum: '100', appJoinData: null }]
      ])
      
      mockGetStandbyNodesInfoMap.mockReturnValue(standbyNodesInfo as any)
      
      select.selectNodes(0)
      
      const drainedKeys = select.drainSelectedPublicKeys()
      expect(drainedKeys).toHaveLength(0)
    })

    it('should sort nodes by selection numbers in descending order', () => {
      const standbyNodesInfo = new Map([
        ['key1', { selectionNum: '050', appJoinData: null }],
        ['key2', { selectionNum: '200', appJoinData: null }],
        ['key3', { selectionNum: '100', appJoinData: null }]
      ])
      
      mockGetStandbyNodesInfoMap.mockReturnValue(standbyNodesInfo as any)
      mockSelectIndexesWithOffeset.mockReturnValue([0])
      
      select.selectNodes(1)
      
      expect(mockSelectIndexesWithOffeset).toHaveBeenCalledWith(3, 1, expect.any(Number))
    })

    it('should add golden ticket nodes when enabled', () => {
      const standbyNodesInfo = new Map([
        ['key1', { selectionNum: '100', appJoinData: { adminCert: { goldenTicket: true } } }],
        ['key2', { selectionNum: '200', appJoinData: null }]
      ])
      
      mockGetStandbyNodesInfoMap.mockReturnValue(standbyNodesInfo as any)
      mockSelectIndexesWithOffeset.mockReturnValue([0]) // This will select key2 (highest selectionNum)
      
      // Enable golden ticket in config
      mockShardus.config.p2p.goldenTicketEnabled = true
      
      select.selectNodes(1)
      
      const drainedKeys = select.drainSelectedPublicKeys()
      expect(drainedKeys).toContain('key1') // Should be added by golden ticket logic
      expect(drainedKeys).toContain('key2') // Should be added by normal selection
      
      // Reset config
      mockShardus.config.p2p.goldenTicketEnabled = false
    })
  })

  describe('notifyNewestJoinedConsensors', () => {
    it('should return early due to deprecated endpoint', async () => {
      const result = await select.notifyNewestJoinedConsensors()
      expect(result).toBeUndefined()
    })
  })

  describe('notifyingNewestJoinedConsensors', () => {
    it('should notify joined consensors', async () => {
      const joinedConsensors = [
        { publicKey: 'other-key', externalIp: '192.168.1.1', externalPort: 9001 },
        { publicKey: 'test-public-key', externalIp: '192.168.1.2', externalPort: 9002 }
      ]
      
      mockCycleChain.newest = { joinedConsensors } as any
      mockCycleChain.getCurrentCycleMarker.mockReturnValue('marker123')
      mockCrypto.sign.mockReturnValue({ signature: 'test-sig', sign: 'test-sign' } as any)
      mockHttp.post.mockResolvedValue({})
      
      await select.notifyingNewestJoinedConsensors()
      
      expect(mockCrypto.sign).toHaveBeenCalledWith({
        cycleMarker: 'marker123',
        activeNodePublicKey: 'test-public-key'
      })
      expect(mockHttp.post).toHaveBeenCalledWith(
        'http://192.168.1.1:9001/accepted',
        { signature: 'test-sig', sign: 'test-sign' }
      )
      expect(mockHttp.post).not.toHaveBeenCalledWith(
        'http://192.168.1.2:9002/accepted',
        expect.anything()
      )
    })

    it('should handle http errors gracefully', async () => {
      const joinedConsensors = [
        { publicKey: 'other-key', externalIp: '192.168.1.1', externalPort: 9001 }
      ]
      
      mockCycleChain.newest = { joinedConsensors } as any
      mockCrypto.sign.mockReturnValue({ signature: 'test-sig', sign: 'test-sign' } as any)
      mockHttp.post.mockRejectedValue(new Error('Network error'))
      
      await expect(select.notifyingNewestJoinedConsensors()).resolves.not.toThrow()
    })
  })

  describe('drainSelectedPublicKeys', () => {
    it('should return and clear selected public keys', () => {
      // First select some nodes
      const standbyNodesInfo = new Map([
        ['key1', { selectionNum: '100', appJoinData: null }],
        ['key2', { selectionNum: '200', appJoinData: null }]
      ])
      
      mockGetStandbyNodesInfoMap.mockReturnValue(standbyNodesInfo as any)
      mockSelectIndexesWithOffeset.mockReturnValue([0, 1])
      
      select.selectNodes(2)
      
      const drainedKeys1 = select.drainSelectedPublicKeys()
      expect(drainedKeys1).toHaveLength(2)
      expect(drainedKeys1).toContain('key1')
      expect(drainedKeys1).toContain('key2')
      
      const drainedKeys2 = select.drainSelectedPublicKeys()
      expect(drainedKeys2).toHaveLength(0)
    })

    it('should return empty array when no keys selected', () => {
      const drainedKeys = select.drainSelectedPublicKeys()
      expect(drainedKeys).toEqual([])
    })
  })

  describe('forceSelectSelf', () => {
    it('should add own public key to selected keys', () => {
      mockCrypto.keypair.publicKey = 'my-public-key'
      
      select.forceSelectSelf()
      
      const drainedKeys = select.drainSelectedPublicKeys()
      expect(drainedKeys).toContain('my-public-key')
    })
  })
})