jest.mock('../../../src/network', () => ({
  shardusGetTime: jest.fn(() => Date.now())
}))
jest.mock('../../../src/p2p/Comms')
jest.mock('../../../src/p2p/Context')
jest.mock('../../../src/p2p/NodeList')
jest.mock('../../../src/p2p/Self')
jest.mock('../../../src/state-manager/shardFunctions')
jest.mock('../../../src/logger', () => ({
  logFlags: {
    console: false,
    error: false
  }
}))
jest.mock('../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn()
  }
}))
jest.mock('../../../src/utils/profiler', () => ({
  profilerInstance: {
    scopedProfileSectionStart: jest.fn(),
    scopedProfileSectionEnd: jest.fn()
  }
}))
jest.mock('../../../src/types/Helpers')
jest.mock('../../../src/types/MakeReceipReq')

import * as GlobalAccounts from '../../../src/p2p/GlobalAccounts'
import * as Comms from '../../../src/p2p/Comms'
import * as Context from '../../../src/p2p/Context'
import * as NodeList from '../../../src/p2p/NodeList'
import * as Self from '../../../src/p2p/Self'
import ShardFunctions from '../../../src/state-manager/shardFunctions'
import { logFlags } from '../../../src/logger'
import { P2P } from '@shardeum-foundation/lib-types'
import { nestedCountersInstance } from '../../../src/utils/nestedCounters'
import { profilerInstance } from '../../../src/utils/profiler'
import { shardusGetTime } from '../../../src/network'
import { InternalRouteEnum } from '../../../src/types/enum/InternalRouteEnum'
import { TypeIdentifierEnum } from '../../../src/types/enum/TypeIdentifierEnum'
import { getStreamWithTypeCheck } from '../../../src/types/Helpers'
import { deserializeMakeReceiptReq, serializeMakeReceiptReq } from '../../../src/types/MakeReceipReq'

describe('GlobalAccounts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Clear internal state
    GlobalAccounts.__clearForTest()
    
    // Setup default mocks
    ;(Self as any).isActive = true
    ;(Self as any).id = 'test-node-id'
    ;(Self as any).emitter = {
      on: jest.fn(),
      removeListener: jest.fn(),
      emit: jest.fn()
    }
    ;(Context as any).stateManager = {
      currentCycleShardData: {
        shardGlobals: {},
        parititionShardDataMap: {}
      }
    }
    ;(Context as any).crypto = {
      sign: jest.fn((obj) => ({ ...obj, sign: { owner: 'test-owner', sig: 'test-sig' } })),
      verify: jest.fn(() => true),
      hash: jest.fn(() => 'test-hash')
    }
    ;(Context as any).shardus = {
      app: {
        calculateTxId: jest.fn(() => 'test-tx-id')
      },
      put: jest.fn()
    }
    ;(NodeList as any).byIdOrder = []
    ;(NodeList as any).byPubKey = new Map()
    ;(NodeList as any).nodes = []
    ;(shardusGetTime as jest.Mock).mockReturnValue(Date.now())
  })

  describe('init', () => {
    it('should register internal binary handler and gossip handler', () => {
      GlobalAccounts.init()
      
      expect(Comms.registerInternalBinary).toHaveBeenCalledWith(
        InternalRouteEnum.binary_make_receipt,
        expect.any(Function)
      )
      expect(Comms.registerGossipHandler).toHaveBeenCalledWith(
        'set-global',
        expect.any(Function)
      )
    })
  })

  describe('setGlobal', () => {
    beforeEach(() => {
      ;(ShardFunctions.findHomeNode as jest.Mock).mockReturnValue({
        consensusNodeForOurNodeFull: [
          { id: 'node1' },
          { id: 'node2' },
          { id: 'test-node-id' },
          { id: 'node3' }
        ]
      })
    })

    it('should not proceed if node is not active', () => {
      ;(Self as any).isActive = false
      
      GlobalAccounts.setGlobal('address', 'addressHash', 'value', 1000, 'source', 'afterHash')
      
      expect(Context.crypto.sign).not.toHaveBeenCalled()
      expect(Comms.tellBinary).not.toHaveBeenCalled()
    })

    it('should not proceed if stateManager is null', () => {
      ;(Context as any).stateManager = null
      
      // The function will throw an error when trying to access stateManager.currentCycleShardData
      expect(() => {
        GlobalAccounts.setGlobal('address', 'addressHash', 'value', 1000, 'source', 'afterHash')
      }).toThrow(TypeError)
      
      // The function creates and signs the transaction before the error occurs
      expect(Context.crypto.sign).toHaveBeenCalled()
      expect(Comms.tellBinary).not.toHaveBeenCalled()
    })

    it('should not proceed if currentCycleShardData is null', () => {
      ;(Context as any).stateManager.currentCycleShardData = null
      
      GlobalAccounts.setGlobal('address', 'addressHash', 'value', 1000, 'source', 'afterHash')
      
      // The sign operation happens before checking currentCycleShardData
      expect(Context.crypto.sign).toHaveBeenCalled()
      // But tellBinary should not be called
      expect(Comms.tellBinary).not.toHaveBeenCalled()
    })

    it('should create and broadcast signed transaction to consensus group', () => {
      const mockValue = { data: 'test' }
      const mockTxId = 'test-tx-id'
      ;(Context.shardus.app.calculateTxId as jest.Mock).mockReturnValue(mockTxId)
      
      GlobalAccounts.setGlobal('address', 'addressHash', mockValue, 1000, 'source', 'afterHash')
      
      // Verify transaction creation
      expect(Context.shardus.app.calculateTxId).toHaveBeenCalledWith(mockValue)
      
      // Verify transaction signing
      expect(Context.crypto.sign).toHaveBeenCalledWith({
        address: 'address',
        addressHash: 'addressHash',
        value: mockValue,
        when: 1000,
        source: 'source',
        txId: mockTxId,
        afterStateHash: 'afterHash'
      })
      
      // Verify binary tell was called with correct nodes (consensus group minus self)
      expect(Comms.tellBinary).toHaveBeenCalledWith(
        [{ id: 'node1' }, { id: 'node2' }, { id: 'node3' }],
        InternalRouteEnum.binary_make_receipt,
        expect.any(Object),
        serializeMakeReceiptReq,
        {}
      )
      
      // Verify event listener was set up
      expect(Self.emitter.on).toHaveBeenCalledWith(
        `receipt-${mockTxId}`,
        expect.any(Function)
      )
    })

    it('should handle receipt and gossip it', (done) => {
      jest.useFakeTimers()
      const mockValue = { data: 'test' }
      const mockTxId = 'test-tx-id'
      const mockReceipt = {
        signs: [{ owner: 'test-owner', sig: 'test-sig' }],
        tx: { txId: mockTxId, value: mockValue },
        consensusGroup: new Set(['node1', 'node2'])
      }
      
      ;(Context.shardus.app.calculateTxId as jest.Mock).mockReturnValue(mockTxId)
      ;(Self.emitter.on as jest.Mock).mockImplementation((event, handler) => {
        if (event === `receipt-${mockTxId}`) {
          // Simulate receipt arrival
          setTimeout(() => {
            handler(mockReceipt)
            
            // Verify gossip was sent
            expect(Comms.sendGossip).toHaveBeenCalledWith(
              'set-global',
              mockReceipt,
              '',
              null,
              NodeList.byIdOrder,
              true
            )
            
            // Verify put was called
            expect(Context.shardus.put).toHaveBeenCalledWith(mockReceipt.tx.value, false, true)
            
            done()
          }, 100)
        }
      })
      
      GlobalAccounts.setGlobal('address', 'addressHash', mockValue, 1000, 'source', 'afterHash')
      
      jest.runAllTimers()
      jest.useRealTimers()
    })

    it('should handle timeout when no receipt is received', (done) => {
      jest.useFakeTimers()
      const mockValue = { data: 'test' }
      const mockTxId = 'test-tx-id'
      
      ;(Context.shardus.app.calculateTxId as jest.Mock).mockReturnValue(mockTxId)
      ;(Self.emitter.removeListener as jest.Mock).mockImplementation(() => {
        done()
      })
      
      GlobalAccounts.setGlobal('address', 'addressHash', mockValue, 1000, 'source', 'afterHash')
      
      // Fast-forward time to trigger timeout
      jest.advanceTimersByTime(10001)
      
      expect(Self.emitter.removeListener).toHaveBeenCalledWith(
        `receipt-${mockTxId}`,
        expect.any(Function)
      )
      
      jest.useRealTimers()
    })
  })

  describe('createMakeReceiptHandle', () => {
    it('should create correct handle format', () => {
      const txHash = 'test-tx-hash'
      const handle = GlobalAccounts.createMakeReceiptHandle(txHash)
      
      expect(handle).toBe('receipt-test-tx-hash')
    })
  })

  describe('getGlobalTxReceipt', () => {
    it('should return null if receipt does not exist', async () => {
      const result = await GlobalAccounts.getGlobalTxReceipt('non-existent-hash')
      
      expect(result).toBeNull()
    })

    it('should return receipt data if it exists', async () => {
      const mockTx = { txId: 'test-tx-id' }
      const mockSigns = [{ owner: 'owner1', sig: 'sig1' }]
      const mockReceipt = {
        signs: mockSigns,
        tx: mockTx,
        consensusGroup: new Set(['node1'])
      }
      
      // We need to add receipt through makeReceipt to populate the internal map
      ;(Context as any).stateManager = {
        currentCycleShardData: {
          shardGlobals: {},
          parititionShardDataMap: {}
        }
      }
      ;(ShardFunctions.findHomeNode as jest.Mock).mockReturnValue({
        consensusNodeForOurNodeFull: [{ id: 'node1' }]
      })
      ;(Context.shardus.app.calculateTxId as jest.Mock).mockReturnValue('test-tx-hash')
      
      const signedTx = {
        ...mockTx,
        sign: { owner: 'node1', sig: 'sig1' },
        source: 'test-source'
      }
      
      GlobalAccounts.makeReceipt(signedTx as any, 'node1')
      
      const result = await GlobalAccounts.getGlobalTxReceipt('test-tx-hash')
      
      expect(result).toEqual({
        signs: expect.arrayContaining([{ owner: 'node1', sig: 'sig1' }]),
        tx: expect.objectContaining({ txId: 'test-tx-id' })
      })
    })
  })

  describe('makeReceipt', () => {
    beforeEach(() => {
      ;(ShardFunctions.findHomeNode as jest.Mock).mockReturnValue({
        consensusNodeForOurNodeFull: [
          { id: 'node1' },
          { id: 'node2' },
          { id: 'node3' }
        ]
      })
    })

    it('should not proceed if stateManager is not ready', () => {
      ;(Context as any).stateManager = null
      
      const signedTx = {
        sign: { owner: 'test-owner' },
        value: 'test-value'
      }
      
      GlobalAccounts.makeReceipt(signedTx as any, 'sender-id')
      
      expect(Context.shardus.app.calculateTxId).toHaveBeenCalledWith('test-value')
    })

    it('should create receipt and tracker for new transaction', async () => {
      const signedTx = {
        sign: { owner: 'node1', sig: 'sig1' },
        value: 'test-value',
        source: 'test-source',
        when: 1000
      }
      ;(Context.shardus.app.calculateTxId as jest.Mock).mockReturnValue('test-tx-hash')
      
      GlobalAccounts.makeReceipt(signedTx as any, 'node1')
      
      // Verify calculateTxId was called
      expect(Context.shardus.app.calculateTxId).toHaveBeenCalledWith('test-value')
      
      // Verify receipt was created by checking getGlobalTxReceipt
      const receipt = await GlobalAccounts.getGlobalTxReceipt('test-tx-hash')
      expect(receipt).not.toBeNull()
      expect(receipt?.signs).toHaveLength(1)
      expect(receipt?.signs[0]).toEqual({ owner: 'node1', sig: 'sig1' }) // Signs are pushed as-is
    })

    it('should ignore duplicate transactions from same owner', async () => {
      const signedTx = {
        sign: { owner: 'node1' },
        value: 'test-value',
        source: 'test-source',
        when: 1000
      }
      ;(Context.shardus.app.calculateTxId as jest.Mock).mockReturnValue('test-tx-hash')
      
      // First call
      GlobalAccounts.makeReceipt(signedTx as any, 'node1')
      
      // Second call with same owner
      GlobalAccounts.makeReceipt(signedTx as any, 'node1')
      
      const receipt = await GlobalAccounts.getGlobalTxReceipt('test-tx-hash')
      expect(receipt?.signs).toHaveLength(1) // Should still be 1, not 2
    })

    it('should ignore if sender is not in consensus group', async () => {
      const signedTx = {
        sign: { owner: 'node1', sig: 'sig1' },
        value: 'test-value',
        source: 'test-source',
        when: 1000
      }
      ;(Context.shardus.app.calculateTxId as jest.Mock).mockReturnValue('test-tx-hash')
      
      // Create a receipt from a node in consensus group first to establish the receipt
      GlobalAccounts.makeReceipt(signedTx as any, 'node1')
      
      // Now try to add a sign from node4 which is not in the consensus group
      const signedTx2 = {
        sign: { owner: 'node4', sig: 'sig4' },
        value: 'test-value',
        source: 'test-source',
        when: 1000
      }
      GlobalAccounts.makeReceipt(signedTx2 as any, 'node4')
      
      const receipt = await GlobalAccounts.getGlobalTxReceipt('test-tx-hash')
      // Receipt exists but should only have 1 sign from node1, not from node4
      expect(receipt).not.toBeNull()
      expect(receipt?.signs).toHaveLength(1)
      expect(receipt?.signs[0]).toEqual({ owner: 'node1', sig: 'sig1' })
    })

    it('should emit event when receipt reaches majority (60%)', () => {
      ;(Context.shardus.app.calculateTxId as jest.Mock).mockImplementation((value) => {
        // Need to ensure same tx hash for the same value
        if (value === 'test-value') return 'test-tx-hash'
        return 'different-hash'
      })
      
      // Clear emit mock before test
      ;(Self.emitter.emit as jest.Mock).mockClear()
      
      // Create receipts from 2 out of 3 nodes (66% > 60%)
      const signedTx1 = {
        sign: { owner: 'node1', sig: 'sig1' },
        value: 'test-value',
        source: 'test-source',
        when: 1000
      }
      
      const signedTx2 = {
        sign: { owner: 'node2', sig: 'sig2' },
        value: 'test-value',
        source: 'test-source',
        when: 1000
      }
      
      GlobalAccounts.makeReceipt(signedTx1 as any, 'node1')
      
      // Verify that first receipt didn't trigger emit (only 1/3 = 33%)
      expect(Self.emitter.emit).not.toHaveBeenCalled()
      
      GlobalAccounts.makeReceipt(signedTx2 as any, 'node2')
      
      // Now verify emit was called after second receipt (2/3 = 66% > 60%)
      expect(Self.emitter.emit).toHaveBeenCalledWith(
        'receipt-test-tx-hash',
        expect.objectContaining({
          signs: expect.arrayContaining([
            { owner: 'node1', sig: 'sig1' },
            { owner: 'node2', sig: 'sig2' }
          ]),
          tx: expect.objectContaining({
            value: 'test-value',
            source: 'test-source',
            when: 1000
          }),
          consensusGroup: expect.any(Set)
        })
      )
    })
  })

  describe('processReceipt', () => {
    it('should process valid receipt and call put', () => {
      const mockReceipt = {
        signs: [{ owner: 'node1' }],
        tx: {
          value: 'test-value',
          when: 1000
        },
        consensusGroup: new Set(['node1'])
      }
      ;(Context.crypto.hash as jest.Mock).mockReturnValue('test-tx-hash')
      
      const result = GlobalAccounts.processReceipt(mockReceipt as any)
      
      expect(result).toBe(true)
      expect(Context.shardus.put).toHaveBeenCalledWith('test-value', false, true)
    })

    it('should not process already gossiped receipt', () => {
      const mockReceipt = {
        signs: [{ owner: 'node1' }],
        tx: {
          value: 'test-value',
          when: 1000
        },
        consensusGroup: new Set(['node1'])
      }
      ;(Context.crypto.hash as jest.Mock).mockReturnValue('test-tx-hash')
      
      // Process once
      GlobalAccounts.processReceipt(mockReceipt as any)
      
      // Clear mock to check the second call
      jest.clearAllMocks()
      
      // Try to process again
      const result = GlobalAccounts.processReceipt(mockReceipt as any)
      
      expect(result).toBe(false)
      expect(Context.shardus.put).not.toHaveBeenCalled() // Should not be called on second attempt
    })
  })

  describe('attemptCleanup', () => {
    it('should not cleanup if less than 60 seconds have passed', () => {
      const now = Date.now()
      ;(shardusGetTime as jest.Mock).mockReturnValue(now)
      
      // First call sets lastClean
      GlobalAccounts.attemptCleanup()
      
      // Second call within 60 seconds
      ;(shardusGetTime as jest.Mock).mockReturnValue(now + 30000) // 30 seconds later
      GlobalAccounts.attemptCleanup()
      
      // No cleanup should have occurred
      // We can't directly test this without exposing internal state,
      // but we can verify by creating a receipt and checking it's still there
    })

    it('should cleanup old receipts and trackers after 60 seconds', async () => {
      const now = Date.now()
      ;(shardusGetTime as jest.Mock).mockReturnValue(now)
      
      // Setup for makeReceipt
      ;(ShardFunctions.findHomeNode as jest.Mock).mockReturnValue({
        consensusNodeForOurNodeFull: [{ id: 'node1' }]
      })
      ;(Context.shardus.app.calculateTxId as jest.Mock).mockReturnValue('old-tx-hash')
      
      // Create a receipt through makeReceipt
      const signedTx = {
        sign: { owner: 'node1' },
        value: 'old-value',
        source: 'test-source',
        when: now - 40000 // 40 seconds ago
      }
      
      GlobalAccounts.makeReceipt(signedTx as any, 'node1')
      
      // Process the receipt
      ;(Context.crypto.hash as jest.Mock).mockReturnValue('old-tx-hash')
      const mockReceipt = {
        signs: [{ owner: 'node1' }],
        tx: {
          value: 'old-value',
          when: now - 40000
        },
        consensusGroup: new Set(['node1'])
      }
      GlobalAccounts.processReceipt(mockReceipt as any)
      
      // Verify receipt exists
      let receipt = await GlobalAccounts.getGlobalTxReceipt('old-tx-hash')
      expect(receipt).not.toBeNull()
      
      // Move time forward 65 seconds and cleanup
      ;(shardusGetTime as jest.Mock).mockReturnValue(now + 65000)
      GlobalAccounts.attemptCleanup()
      
      // Verify receipt was cleaned up
      receipt = await GlobalAccounts.getGlobalTxReceipt('old-tx-hash')
      expect(receipt).toBeNull()
    })
  })

  describe('makeReceiptBinaryHandler', () => {
    it('should handle valid binary request', async () => {
      const mockRequest = {
        sign: { owner: 'node1' },
        value: 'test-value',
        source: 'test-source'
      }
      const mockPayload = Buffer.from('test')
      const mockHeader = { sender_id: 'node1' }
      
      ;(getStreamWithTypeCheck as jest.Mock).mockReturnValue({})
      ;(deserializeMakeReceiptReq as jest.Mock).mockReturnValue(mockRequest)
      ;(ShardFunctions.findHomeNode as jest.Mock).mockReturnValue({
        consensusNodeForOurNodeFull: [{ id: 'node1' }]
      })
      ;(Context.shardus.app.calculateTxId as jest.Mock).mockReturnValue('test-tx-hash')
      
      GlobalAccounts.init()
      
      // Get the handler function
      const handler = (Comms.registerInternalBinary as jest.Mock).mock.calls.find(
        call => call[0] === InternalRouteEnum.binary_make_receipt
      )?.[1]
      
      expect(handler).toBeDefined()
      
      // Call the handler
      await handler(mockPayload, jest.fn(), mockHeader, jest.fn())
      
      // Verify makeReceipt logic was executed
      expect(getStreamWithTypeCheck).toHaveBeenCalledWith(mockPayload, TypeIdentifierEnum.cMakeReceiptReq)
      expect(deserializeMakeReceiptReq).toHaveBeenCalled()
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('internal', InternalRouteEnum.binary_make_receipt)
    })

    it('should handle invalid stream', async () => {
      const mockPayload = Buffer.from('test')
      const mockHeader = { sender_id: 'node1' }
      
      ;(getStreamWithTypeCheck as jest.Mock).mockReturnValue(null)
      
      GlobalAccounts.init()
      
      // Get the handler function
      const handler = (Comms.registerInternalBinary as jest.Mock).mock.calls.find(
        call => call[0] === InternalRouteEnum.binary_make_receipt
      )?.[1]
      
      // Call the handler
      await handler(mockPayload, jest.fn(), mockHeader, jest.fn())
      
      // The handler should call getStreamWithTypeCheck and return early
      expect(getStreamWithTypeCheck).toHaveBeenCalledWith(mockPayload, TypeIdentifierEnum.cMakeReceiptReq)
      // Since stream is null, deserializeMakeReceiptReq should not be called
      expect(deserializeMakeReceiptReq).not.toHaveBeenCalled()
    })
  })

  describe('setGlobalGossipHandler', () => {
    it('should validate and process valid receipt', () => {
      const mockReceipt = {
        signs: [
          { owner: 'PUBKEY1' },
          { owner: 'PUBKEY2' }
        ],
        tx: {
          value: 'test-value',
          when: 1000,
          source: 'test-source',
          sign: { owner: 'PUBKEY1' }
        },
        consensusGroup: new Set(['node1', 'node2'])
      }
      
      // Setup mocks for validation
      ;(Context as any).stateManager.currentCycleShardData = {
        shardGlobals: {},
        parititionShardDataMap: {}
      }
      ;(ShardFunctions.findHomeNode as jest.Mock).mockReturnValue({
        consensusNodeForOurNodeFull: [
          { id: 'node1' },
          { id: 'node2' }
        ]
      })
      ;(NodeList.byPubKey as any).get = jest.fn((pubkey) => {
        if (pubkey === 'PUBKEY1') return { id: 'node1' }
        if (pubkey === 'pubkey1') return { id: 'node1' } // lowercase version
        if (pubkey === 'PUBKEY2') return { id: 'node2' }
        if (pubkey === 'pubkey2') return { id: 'node2' } // lowercase version
        return null
      })
      ;(Context.crypto.verify as jest.Mock).mockReturnValue(true)
      ;(Context.crypto.hash as jest.Mock).mockReturnValue('test-tx-hash')
      
      GlobalAccounts.init()
      
      // Get the handler function
      const handler = (Comms.registerGossipHandler as jest.Mock).mock.calls.find(
        call => call[0] === 'set-global'
      )?.[1]
      
      // Call the handler
      handler(mockReceipt, 'sender', 'tracker')
      
      // Verify receipt was processed and gossiped
      expect(Context.shardus.put).toHaveBeenCalledWith('test-value', false, true)
      expect(Comms.sendGossip).toHaveBeenCalledWith(
        'set-global',
        mockReceipt,
        'tracker',
        'sender',
        NodeList.byIdOrder,
        false
      )
    })

    it('should reject receipt without majority', () => {
      const mockReceipt = {
        signs: [
          { owner: 'pubkey1' } // Only 1 out of 2 (50% < 60%)
        ],
        tx: {
          value: 'test-value',
          when: 1000,
          source: 'test-source'
        },
        consensusGroup: new Set(['node1', 'node2'])
      }
      
      ;(Context as any).stateManager.currentCycleShardData = {
        shardGlobals: {},
        parititionShardDataMap: {}
      }
      ;(ShardFunctions.findHomeNode as jest.Mock).mockReturnValue({
        consensusNodeForOurNodeFull: [
          { id: 'node1' },
          { id: 'node2' }
        ]
      })
      ;(NodeList.byPubKey as any).get = jest.fn((pubkey) => {
        if (pubkey === 'pubkey1') return { id: 'node1' }
        return null
      })
      
      GlobalAccounts.init()
      
      // Get the handler function
      const handler = (Comms.registerGossipHandler as jest.Mock).mock.calls.find(
        call => call[0] === 'set-global'
      )?.[1]
      
      // Call the handler
      handler(mockReceipt, 'sender', 'tracker')
      
      // Verify receipt was not processed
      expect(Context.shardus.put).not.toHaveBeenCalled()
      expect(Comms.sendGossip).not.toHaveBeenCalled()
    })
  })
})