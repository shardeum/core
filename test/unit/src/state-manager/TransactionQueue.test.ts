import TransactionQueue from '../../../../src/state-manager/TransactionQueue';
import { NonceQueueItem } from '../../../../src/state-manager/state-manager-types';
import { config } from '../../../../src/p2p/Context';

jest.mock('../../../../src/p2p/Context', () => {
  const config = {}
  return {
    config,
    setDefaultConfigs: jest.fn((newConfig) => {
      Object.assign(config, newConfig.server);
    }),
    shardusGetTime: jest.fn(() => Date.now())
  };
});

describe.only('TransactionQueue', () => {
  let transactionQueue: TransactionQueue;

  beforeEach(() => {
    // Mock dependencies
    const mockStateManager = {} as any;
    const mockProfiler = {} as any;
    const mockApp = {} as any;
    const mockLogger = {
      getLogger: jest.fn().mockReturnValue({
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        debug: jest.fn(),
        trace: jest.fn()
      })
    } as any;
    const mockStorage = {} as any;
    const mockP2P = {} as any;
    const mockCrypto = {} as any;

    // Use the mocked config from Context
    const { config } = require('../../../../src/p2p/Context');

    transactionQueue = new TransactionQueue(
      mockStateManager,
      mockProfiler,
      mockApp,
      mockLogger,
      mockStorage,
      mockP2P,
      mockCrypto,
      config
    );
  });

  describe('addTransactionToNonceQueue', () => {
    it('should add a new transaction to an empty queue', () => {
      const nonceQueueEntry: NonceQueueItem = {
        accountId: 'account1',
        nonce: 1n,
        txId: 'tx1',
        tx: {} as any,
        appData: {},
        global: false,
        noConsensus: false
      };

      const result = transactionQueue.addTransactionToNonceQueue(nonceQueueEntry);

      expect(result.success).toBe(true);
      expect(result.alreadyAdded).toBe(false);
      expect(transactionQueue.nonceQueue.get('account1')).toHaveLength(1);
      expect(transactionQueue.nonceQueue.get('account1')?.[0]).toEqual(nonceQueueEntry);
    });

    it('should replace an existing transaction with the same nonce', () => {
      const existingEntry: NonceQueueItem = {
        accountId: 'account1',
        nonce: 1n,
        txId: 'tx1',
        tx: {} as any,
        appData: {},
        global: false,
        noConsensus: false
      };
      transactionQueue.nonceQueue.set('account1', [existingEntry]);

      const newEntry: NonceQueueItem = {
        ...existingEntry,
        txId: 'tx2'
      };

      const result = transactionQueue.addTransactionToNonceQueue(newEntry);

      expect(result.success).toBe(true);
      expect(result.alreadyAdded).toBe(true);
      expect(transactionQueue.nonceQueue.get('account1')).toHaveLength(1);
      expect(transactionQueue.nonceQueue.get('account1')?.[0]).not.toBeUndefined();
      expect(transactionQueue.nonceQueue.get('account1')?.[0]?.txId).toBe('tx2');
    });

    it('should add a transaction with a higher nonce to an existing queue', () => {
      const existingEntry: NonceQueueItem = {
        accountId: 'account1',
        nonce: 1n,
        txId: 'tx1',
        tx: {} as any,
        appData: {},
        global: false,
        noConsensus: false
      }
      transactionQueue.nonceQueue.set('account1', [existingEntry])

      const newEntry: NonceQueueItem = {
        ...existingEntry,
        nonce: 2n,
        txId: 'tx2'
      }

      const result = transactionQueue.addTransactionToNonceQueue(newEntry)

      expect(result.success).toBe(true)
      expect(result.alreadyAdded).toBe(false)
      expect(transactionQueue.nonceQueue.get('account1')).toHaveLength(2)
      expect(transactionQueue.nonceQueue.get('account1')?.[0].txId).toEqual(existingEntry.txId)
      expect(transactionQueue.nonceQueue.get('account1')?.[1].txId).toEqual(newEntry.txId)
    });
  });
});
