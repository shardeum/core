import * as Types from '../../../../src/state-manager/state-manager-types'

describe('state-manager-types', () => {
  describe('Type exports', () => {
    it('should export types from shardus-types', () => {
      // These are re-exported from shardus-types, just verify they exist as types
      // Note: We can't test type exports directly, but we can verify the module structure
      expect(Types).toBeDefined()
    })
  })

  describe('HRTime', () => {
    it('should allow creation of valid HRTime tuples', () => {
      const hrTime: Types.HRTime = [123456789, 987654321]
      expect(hrTime).toHaveLength(2)
      expect(hrTime[0]).toBe(123456789)
      expect(hrTime[1]).toBe(987654321)
    })
  })

  describe('TxDebug', () => {
    it('should create a valid TxDebug object with required fields', () => {
      const txDebug: Types.TxDebug = {
        duration: { start: 100, end: 200 },
        startTime: { process: [123, 456] },
        endTime: { process: [124, 789] },
        startTimestamp: { process: 1234567890 },
        endTimestamp: { process: 1234567990 },
      }

      expect(txDebug.duration).toBeDefined()
      expect(txDebug.startTime.process).toEqual([123, 456])
      expect(txDebug.endTimestamp.process).toBe(1234567990)
    })

    it('should allow optional fields in TxDebug', () => {
      const txDebug: Types.TxDebug = {
        duration: {},
        startTime: {},
        endTime: {},
        startTimestamp: {},
        endTimestamp: {},
        enqueueHrTime: [100, 200],
        dequeueHrTime: [101, 300],
        cycleSinceActivated: 5,
        correspondingDebugInfo: {
          ourIndex: 1,
          ourUnwrappedIndex: 2,
          callParams: {
            oi: 1,
            st: 100,
            et: 200,
            gl: 10,
            tg: 20,
            sg: 30,
            tn: 40,
          },
          localKeys: { key1: true },
          oldCorrespondingIndices: [1, 2, 3],
          correspondingIndices: [4, 5, 6],
          correspondingNodeIds: ['node1', 'node2'],
        },
      }

      expect(txDebug.enqueueHrTime).toEqual([100, 200])
      expect(txDebug.cycleSinceActivated).toBe(5)
      expect(txDebug.correspondingDebugInfo?.ourIndex).toBe(1)
    })
  })

  describe('QueueEntry', () => {
    it('should create a valid QueueEntry with required fields', () => {
      const queueEntry: Partial<Types.QueueEntry> = {
        gossipedCompleteData: true,
        sharedCompleteData: false,
        eligibleNodeIdsToVote: new Set(['node1', 'node2']),
        eligibleNodeIdsToConfirm: new Set(['node3']),
        acceptedTx: {} as any, // Mock accepted tx
        txKeys: {} as any,
        collectedData: {},
        originalData: {},
        collectedFinalData: {},
        beforeHashes: { account1: 'hash1' },
        homeNodes: {},
        executionShardKey: 'key123',
        isInExecutionHome: true,
        patchedOnNodes: new Map(),
        hasShardInfo: false,
        state: 'pending',
        dataCollected: 0,
        hasAll: false,
        entryID: 123,
        localKeys: { key1: true },
      }

      expect(queueEntry.gossipedCompleteData).toBe(true)
      expect(queueEntry.eligibleNodeIdsToVote?.has('node1')).toBe(true)
      expect(queueEntry.state).toBe('pending')
      expect(queueEntry.entryID).toBe(123)
    })

    it('should handle QueueEntry with optional uniqueTags', () => {
      const queueEntry: Partial<Types.QueueEntry> = {
        uniqueTags: { tag1: 'value1', tag2: 'value2' },
      }

      expect(queueEntry.uniqueTags).toEqual({ tag1: 'value1', tag2: 'value2' })

      const queueEntryNull: Partial<Types.QueueEntry> = {
        uniqueTags: null,
      }

      expect(queueEntryNull.uniqueTags).toBeNull()
    })
  })

  describe('CycleShardData', () => {
    it('should create a valid CycleShardData object', () => {
      const cycleData: Partial<Types.CycleShardData> = {
        shardGlobals: {} as any,
        cycleNumber: 100,
        ourNode: { id: 'node1' } as any,
        nodeShardData: {} as any,
        nodeShardDataMap: new Map(),
        parititionShardDataMap: new Map(),
        nodes: [],
        syncingNeighbors: [],
        syncingNeighborsTxGroup: [],
        hasSyncingNeighbors: false,
        activeFoundationNodes: [],
        partitionsToSkip: new Map([[1, true]]),
        timestamp: 1234567890,
        timestampEndCycle: 1234567990,
        hasCompleteData: true,
        voters: [1, 2, 3],
        ourConsensusPartitions: [1, 2],
        ourStoredPartitions: [1, 2, 3],
        calculationTime: 150,
      }

      expect(cycleData.cycleNumber).toBe(100)
      expect(cycleData.timestamp).toBe(1234567890)
      expect(cycleData.hasCompleteData).toBe(true)
      expect(cycleData.voters).toEqual([1, 2, 3])
      expect(cycleData.partitionsToSkip?.get(1)).toBe(true)
    })
  })

  describe('RepairTracker', () => {
    it('should create a valid RepairTracker object', () => {
      const repairTracker: Types.RepairTracker = {
        triedHashes: ['hash1', 'hash2'],
        numNodes: 5,
        counter: 100,
        partitionId: 1,
        key: 'c100',
        key2: 'p1',
        removedTXIds: ['tx1', 'tx2'],
        repairedTXs: ['tx3', 'tx4'],
        newPendingTXs: [],
        newFailedTXs: [],
        extraTXIds: ['tx5'],
        missingTXIds: ['tx6'],
        repairing: true,
        repairsNeeded: true,
        busy: false,
        txRepairReady: false,
        txRepairComplete: false,
        evaluationStarted: true,
        evaluationComplete: false,
        awaitWinningHash: false,
        repairsFullyComplete: false,
      }

      expect(repairTracker.counter).toBe(100)
      expect(repairTracker.partitionId).toBe(1)
      expect(repairTracker.key).toBe('c100')
      expect(repairTracker.key2).toBe('p1')
      expect(repairTracker.repairing).toBe(true)
    })

    it('should handle optional solutionDeltas and outputHashSet', () => {
      const repairTracker: Types.RepairTracker = {
        triedHashes: [],
        numNodes: 0,
        counter: 0,
        partitionId: 0,
        key: 'c0',
        key2: 'p0',
        removedTXIds: [],
        repairedTXs: [],
        newPendingTXs: [],
        newFailedTXs: [],
        extraTXIds: [],
        missingTXIds: [],
        repairing: false,
        repairsNeeded: false,
        busy: false,
        txRepairReady: false,
        txRepairComplete: false,
        evaluationStarted: false,
        evaluationComplete: false,
        awaitWinningHash: false,
        repairsFullyComplete: false,
        solutionDeltas: [{ i: 0, tx: {} as any, pf: 1, state: 'state1' }],
        outputHashSet: 'hashset123',
      }

      expect(repairTracker.solutionDeltas).toBeDefined()
      expect(repairTracker.solutionDeltas?.[0].i).toBe(0)
      expect(repairTracker.outputHashSet).toBe('hashset123')
    })
  })

  describe('PartitionReceipt', () => {
    it('should create a valid PartitionReceipt object', () => {
      const partitionReceipt: Types.PartitionReceipt = {
        resultsList: [
          {
            Partition_id: 1,
            Partition_hash: 'hash123',
            Cycle_number: 100,
            hashSet: 'set123',
          },
        ],
      }

      expect(partitionReceipt.resultsList).toHaveLength(1)
      expect(partitionReceipt.resultsList[0].Partition_id).toBe(1)
    })

    it('should handle optional sign field', () => {
      const partitionReceipt: Types.PartitionReceipt = {
        resultsList: [],
        sign: { owner: 'owner123' } as any,
      }

      expect(partitionReceipt.sign?.owner).toBe('owner123')
    })
  })

  describe('SimpleRange', () => {
    it('should create a valid SimpleRange object', () => {
      const range: Types.SimpleRange = {
        low: '0000000000',
        high: 'ffffffffff',
      }

      expect(range.low).toBe('0000000000')
      expect(range.high).toBe('ffffffffff')
    })
  })

  describe('PartitionObject', () => {
    it('should create a valid PartitionObject', () => {
      const partition: Types.PartitionObject = {
        Partition_id: 5,
        Partitions: 10,
        Cycle_number: 100,
        Cycle_marker: 'marker123',
        Txids: ['tx1', 'tx2', 'tx3'],
        Status: [1, 0, 1],
        States: ['state1', 'state2', 'state3'],
        Chain: [{ data: 'chain1' }, { data: 'chain2' }],
      }

      expect(partition.Partition_id).toBe(5)
      expect(partition.Partitions).toBe(10)
      expect(partition.Txids).toEqual(['tx1', 'tx2', 'tx3'])
      expect(partition.Status).toEqual([1, 0, 1])
    })
  })

  describe('PartitionResult', () => {
    it('should create a valid PartitionResult', () => {
      const result: Types.PartitionResult = {
        Partition_id: 3,
        Partition_hash: 'hash456',
        Cycle_number: 200,
        hashSet: 'set456',
      }

      expect(result.Partition_id).toBe(3)
      expect(result.Partition_hash).toBe('hash456')
      expect(result.Cycle_number).toBe(200)
      expect(result.hashSet).toBe('set456')
    })

    it('should handle optional sign field', () => {
      const result: Types.PartitionResult = {
        Partition_id: 1,
        Partition_hash: 'hash',
        Cycle_number: 100,
        hashSet: 'set',
        sign: { owner: 'signer123' } as any,
      }

      expect(result.sign?.owner).toBe('signer123')
    })
  })

  describe('Vote', () => {
    it('should create a valid Vote object', () => {
      const vote: Types.Vote = {
        proposalHash: 'hash789',
      }

      expect(vote.proposalHash).toBe('hash789')
    })

    it('should handle optional sign field', () => {
      const vote: Types.Vote = {
        proposalHash: 'hash123',
        sign: { owner: 'voter1', sig: 'sig123' } as any,
      }

      expect(vote.sign?.owner).toBe('voter1')
    })
  })

  describe('Proposal', () => {
    it('should create a valid Proposal object', () => {
      const proposal: Types.Proposal = {
        applied: true,
        cant_preApply: false,
        accountIDs: ['acc1', 'acc2', 'acc3'],
        beforeStateHashes: ['hash1', 'hash2', 'hash3'],
        afterStateHashes: ['hash4', 'hash5', 'hash6'],
        appReceiptDataHash: 'apphash123',
        txid: 'tx123',
        executionShardKey: 'shard123',
      }

      expect(proposal.applied).toBe(true)
      expect(proposal.cant_preApply).toBe(false)
      expect(proposal.accountIDs).toEqual(['acc1', 'acc2', 'acc3'])
      expect(proposal.beforeStateHashes).toHaveLength(3)
      expect(proposal.afterStateHashes).toHaveLength(3)
      expect(proposal.txid).toBe('tx123')
    })
  })

  describe('SignedReceipt', () => {
    it('should create a valid SignedReceipt object', () => {
      const signedReceipt: Types.SignedReceipt = {
        proposal: {
          applied: true,
          cant_preApply: false,
          accountIDs: ['acc1'],
          beforeStateHashes: ['hash1'],
          afterStateHashes: ['hash2'],
          appReceiptDataHash: 'apphash',
          txid: 'tx1',
          executionShardKey: 'key1',
        },
        proposalHash: 'prophash123',
        signaturePack: [{ owner: 'node1' } as any, { owner: 'node2' } as any],
        voteOffsets: [0, 1],
      }

      expect(signedReceipt.proposalHash).toBe('prophash123')
      expect(signedReceipt.signaturePack).toHaveLength(2)
      expect(signedReceipt.voteOffsets).toEqual([0, 1])
    })

    it('should handle optional sign field', () => {
      const signedReceipt: Types.SignedReceipt = {
        proposal: {} as any,
        proposalHash: 'hash',
        signaturePack: [],
        voteOffsets: [],
        sign: { owner: 'signer' } as any,
      }

      expect(signedReceipt.sign?.owner).toBe('signer')
    })
  })

  describe('AppliedVote', () => {
    it('should create a valid AppliedVote object', () => {
      const appliedVote: Types.AppliedVote = {
        txid: 'tx456',
        transaction_result: true,
        account_id: ['acc1', 'acc2'],
        account_state_hash_after: ['hashafter1', 'hashafter2'],
        account_state_hash_before: ['hashbefore1', 'hashbefore2'],
        cant_apply: false,
        node_id: 'node123',
      }

      expect(appliedVote.txid).toBe('tx456')
      expect(appliedVote.transaction_result).toBe(true)
      expect(appliedVote.account_id).toEqual(['acc1', 'acc2'])
      expect(appliedVote.cant_apply).toBe(false)
      expect(appliedVote.node_id).toBe('node123')
    })

    it('should handle optional fields', () => {
      const appliedVote: Types.AppliedVote = {
        txid: 'tx1',
        transaction_result: false,
        account_id: [],
        account_state_hash_after: [],
        account_state_hash_before: [],
        cant_apply: true,
        node_id: 'node1',
        sign: { owner: 'voter' } as any,
        app_data_hash: 'appdatahash123',
      }

      expect(appliedVote.sign?.owner).toBe('voter')
      expect(appliedVote.app_data_hash).toBe('appdatahash123')
    })
  })

  describe('ArchiverReceipt', () => {
    it('should create a valid ArchiverReceipt object', () => {
      const archiverReceipt: Types.ArchiverReceipt = {
        tx: {
          originalTxData: { data: 'txdata' } as any,
          txId: 'tx789',
          timestamp: 1234567890,
        },
        signedReceipt: {
          proposal: {} as any,
          proposalHash: 'hash',
          signaturePack: [],
          voteOffsets: [],
        },
        appReceiptData: { some: 'data' },
        cycle: 100,
        globalModification: false,
      }

      expect(archiverReceipt.tx.txId).toBe('tx789')
      expect(archiverReceipt.tx.timestamp).toBe(1234567890)
      expect(archiverReceipt.cycle).toBe(100)
      expect(archiverReceipt.globalModification).toBe(false)
    })

    it('should handle optional beforeStates and afterStates', () => {
      const archiverReceipt: Types.ArchiverReceipt = {
        tx: {
          originalTxData: {} as any,
          txId: 'tx1',
          timestamp: 123,
        },
        signedReceipt: {} as any,
        appReceiptData: null,
        beforeStates: [{ accountId: 'acc1', data: {} } as any],
        afterStates: [{ accountId: 'acc1', data: {} } as any],
        cycle: 50,
        globalModification: true,
      }

      expect(archiverReceipt.beforeStates).toBeDefined()
      expect(archiverReceipt.afterStates).toBeDefined()
      expect(archiverReceipt.beforeStates).toHaveLength(1)
      expect(archiverReceipt.globalModification).toBe(true)
    })
  })

  describe('ConfirmOrChallengeMessage', () => {
    it('should create a valid ConfirmOrChallengeMessage object', () => {
      const message: Types.ConfirmOrChallengeMessage = {
        message: 'confirm',
        nodeId: 'node456',
        appliedVote: {
          txid: 'tx1',
          transaction_result: true,
          account_id: ['acc1'],
          account_state_hash_after: ['hash1'],
          account_state_hash_before: ['hash0'],
          cant_apply: false,
          node_id: 'node456',
        },
      }

      expect(message.message).toBe('confirm')
      expect(message.nodeId).toBe('node456')
      expect(message.appliedVote.txid).toBe('tx1')
    })

    it('should handle optional sign field', () => {
      const message: Types.ConfirmOrChallengeMessage = {
        message: 'challenge',
        nodeId: 'node1',
        appliedVote: {} as any,
        sign: { owner: 'challenger' } as any,
      }

      expect(message.sign?.owner).toBe('challenger')
    })
  })

  describe('AppliedReceipt', () => {
    it('should create a valid AppliedReceipt object', () => {
      const receipt: Types.AppliedReceipt = {
        txid: 'tx999',
        result: true,
        appliedVotes: [
          {
            txid: 'tx999',
            transaction_result: true,
            account_id: ['acc1'],
            account_state_hash_after: ['hash1'],
            account_state_hash_before: ['hash0'],
            cant_apply: false,
            node_id: 'node1',
          },
        ],
        confirmOrChallenge: [],
        app_data_hash: 'apphash999',
      }

      expect(receipt.txid).toBe('tx999')
      expect(receipt.result).toBe(true)
      expect(receipt.appliedVotes).toHaveLength(1)
      expect(receipt.app_data_hash).toBe('apphash999')
    })

    it('should handle multiple votes and confirmations', () => {
      const receipt: Types.AppliedReceipt = {
        txid: 'tx1',
        result: false,
        appliedVotes: [{} as any, {} as any],
        confirmOrChallenge: [
          {
            message: 'confirm',
            nodeId: 'node1',
            appliedVote: {} as any,
          },
          {
            message: 'challenge',
            nodeId: 'node2',
            appliedVote: {} as any,
          },
        ],
        app_data_hash: 'hash',
      }

      expect(receipt.appliedVotes).toHaveLength(2)
      expect(receipt.confirmOrChallenge).toHaveLength(2)
      expect(receipt.confirmOrChallenge[0].message).toBe('confirm')
      expect(receipt.confirmOrChallenge[1].message).toBe('challenge')
    })
  })

  describe('AppliedReceipt2', () => {
    it('should create a valid AppliedReceipt2 object', () => {
      const receipt2: Types.AppliedReceipt2 = {
        txid: 'tx888',
        result: true,
        appliedVote: {
          txid: 'tx888',
          transaction_result: true,
          account_id: ['acc1', 'acc2'],
          account_state_hash_after: ['hash1', 'hash2'],
          account_state_hash_before: ['hash0', 'hash00'],
          cant_apply: false,
          node_id: 'node1',
        },
        signatures: [{ owner: 'node1' } as any, { owner: 'node2' } as any, { owner: 'node3' } as any],
        app_data_hash: 'apphash888',
      }

      expect(receipt2.txid).toBe('tx888')
      expect(receipt2.result).toBe(true)
      expect(receipt2.appliedVote.account_id).toEqual(['acc1', 'acc2'])
      expect(receipt2.signatures).toHaveLength(3)
    })

    it('should handle optional confirmOrChallenge field', () => {
      const receipt2: Types.AppliedReceipt2 = {
        txid: 'tx1',
        result: false,
        appliedVote: {} as any,
        confirmOrChallenge: {
          message: 'challenge',
          nodeId: 'challenger1',
          appliedVote: {} as any,
        },
        signatures: [],
        app_data_hash: 'hash',
      }

      expect(receipt2.confirmOrChallenge?.message).toBe('challenge')
      expect(receipt2.confirmOrChallenge?.nodeId).toBe('challenger1')
    })
  })

  describe('AppliedVoteHash', () => {
    it('should create a valid AppliedVoteHash object', () => {
      const voteHash: Types.AppliedVoteHash = {
        txid: 'tx777',
        voteHash: 'votehash777',
        voteTime: 1234567890,
      }

      expect(voteHash.txid).toBe('tx777')
      expect(voteHash.voteHash).toBe('votehash777')
      expect(voteHash.voteTime).toBe(1234567890)
    })

    it('should handle optional sign field', () => {
      const voteHash: Types.AppliedVoteHash = {
        txid: 'tx1',
        voteHash: 'hash1',
        voteTime: 123,
        sign: { owner: 'voter1', sig: 'sig1' } as any,
      }

      expect(voteHash.sign?.owner).toBe('voter1')
      expect(voteHash.sign?.sig).toBe('sig1')
    })
  })

  describe('Request/Response Types', () => {
    describe('AccountStateHashReq/Resp', () => {
      it('should create valid AccountStateHashReq and AccountStateHashResp', () => {
        const req: Types.AccountStateHashReq = {
          accountStart: 'acc000',
          accountEnd: 'accfff',
          tsStart: 1000,
          tsEnd: 2000,
        }

        const resp: Types.AccountStateHashResp = {
          stateHash: 'statehash123',
          ready: true,
        }

        expect(req.accountStart).toBe('acc000')
        expect(req.tsEnd).toBe(2000)
        expect(resp.stateHash).toBe('statehash123')
        expect(resp.ready).toBe(true)
      })
    })

    describe('GetAccountDataReq variations', () => {
      it('should create valid GetAccountDataReq', () => {
        const req: Types.GetAccountDataReq = {
          accountStart: 'acc001',
          accountEnd: 'acc100',
          maxRecords: 50,
        }

        expect(req.accountStart).toBe('acc001')
        expect(req.accountEnd).toBe('acc100')
        expect(req.maxRecords).toBe(50)
      })

      it('should create valid GetAccountData2Req', () => {
        const req: Types.GetAccountData2Req = {
          accountStart: 'acc001',
          accountEnd: 'acc100',
          tsStart: 1000,
          tsEnd: 2000,
          maxRecords: 100,
        }

        expect(req.tsStart).toBe(1000)
        expect(req.tsEnd).toBe(2000)
        expect(req.maxRecords).toBe(100)
      })

      it('should create valid GetAccountData3Req and Response', () => {
        const req: Types.GetAccountData3Req = {
          accountStart: 'acc001',
          accountEnd: 'acc100',
          tsStart: 1000,
          maxRecords: 100,
          offset: 50,
          accountOffset: 'acc050',
        }

        const resp: Types.GetAccountData3Resp = {
          data: {
            wrappedAccounts: [],
            lastUpdateNeeded: false,
            wrappedAccounts2: [],
            highestTs: 2000,
            delta: 10,
          },
        }

        expect(req.offset).toBe(50)
        expect(req.accountOffset).toBe('acc050')
        expect(resp.data.highestTs).toBe(2000)
        expect(resp.data.delta).toBe(10)
      })
    })

    describe('Transaction Request/Response Types', () => {
      it('should create valid RequestStateForTxReq and Resp', () => {
        const req: Types.RequestStateForTxReq = {
          txid: 'tx123',
          timestamp: 1234567890,
          keys: ['key1', 'key2', 'key3'],
        }

        const resp: Types.RequestStateForTxResp = {
          stateList: [],
          beforeHashes: { acc1: 'hash1' },
          note: 'Success',
          success: true,
        }

        expect(req.txid).toBe('tx123')
        expect(req.keys).toEqual(['key1', 'key2', 'key3'])
        expect(resp.success).toBe(true)
        expect(resp.beforeHashes['acc1']).toBe('hash1')
      })

      it('should create valid RequestReceiptForTxReq and Resp', () => {
        const req: Types.RequestReceiptForTxReq = {
          txid: 'tx456',
          timestamp: 9876543210,
        }

        const resp: Types.RequestReceiptForTxResp = {
          receipt: {} as any,
          note: 'Receipt found',
          success: true,
        }

        expect(req.txid).toBe('tx456')
        expect(req.timestamp).toBe(9876543210)
        expect(resp.note).toBe('Receipt found')
        expect(resp.success).toBe(true)
      })
    })

    describe('Queue Related Types', () => {
      it('should create valid QueueCountsResponse and QueueCountsResult', () => {
        const resp: Types.QueueCountsResponse = {
          counts: [1, 2, 3, 4],
          committingAppData: [],
          accounts: [],
        }

        const result: Types.QueueCountsResult = {
          count: 5,
          committingAppData: { some: 'data' } as any,
          account: { id: 'acc1' },
        }

        expect(resp.counts).toEqual([1, 2, 3, 4])
        expect(result.count).toBe(5)
        expect(result.account?.id).toBe('acc1')
      })
    })

    describe('NonceQueueItem', () => {
      it('should create valid NonceQueueItem', () => {
        const item: Types.NonceQueueItem = {
          tx: { data: 'tx' } as any,
          txId: 'tx789',
          nonce: BigInt(12345),
          accountId: 'acc123',
          appData: { app: 'data' },
          global: false,
          noConsensus: true,
        }

        expect(item.txId).toBe('tx789')
        expect(item.nonce).toBe(BigInt(12345))
        expect(item.accountId).toBe('acc123')
        expect(item.global).toBe(false)
        expect(item.noConsensus).toBe(true)
      })
    })
  })

  describe('Additional Types', () => {
    describe('PreTestStatus enum', () => {
      it('should have correct enum values', () => {
        expect(Types.PreTestStatus.Valid).toBe(1)
        expect(Types.PreTestStatus.CantValidate).toBe(2)
        expect(Types.PreTestStatus.ValidationFailed).toBe(3)
      })
    })

    describe('HashTrieNode', () => {
      it('should create valid HashTrieNode', () => {
        const node: Types.HashTrieNode = {
          radix: 'abc',
          hash: 'nodehash123',
          childHashes: ['hash1', 'hash2'],
          children: [],
          nonSparseChildCount: 2,
          updated: true,
          isIncomplete: false,
        }

        expect(node.radix).toBe('abc')
        expect(node.hash).toBe('nodehash123')
        expect(node.childHashes).toEqual(['hash1', 'hash2'])
        expect(node.updated).toBe(true)
      })

      it('should handle leaf node with accounts', () => {
        const leafNode: Types.HashTrieNode = {
          radix: 'abcdef',
          hash: 'leafhash',
          childHashes: [],
          children: [],
          nonSparseChildCount: 0,
          updated: false,
          isIncomplete: false,
          accounts: [
            { accountID: 'acc1', hash: 'hash1' },
            { accountID: 'acc2', hash: 'hash2' },
          ],
          accountTempMap: new Map([['acc1', { accountID: 'acc1', hash: 'hash1' }]]),
        }

        expect(leafNode.accounts).toHaveLength(2)
        expect(leafNode.accountTempMap?.get('acc1')?.hash).toBe('hash1')
      })
    })

    describe('AccountHashCache types', () => {
      it('should create valid AccountHashCache', () => {
        const cache: Types.AccountHashCache = {
          t: 1234567890,
          h: 'cachehash',
          c: 100,
        }

        expect(cache.t).toBe(1234567890)
        expect(cache.h).toBe('cachehash')
        expect(cache.c).toBe(100)
      })

      it('should create valid AccountHashCacheHistory', () => {
        const history: Types.AccountHashCacheHistory = {
          lastSeenCycle: 50,
          lastSeenSortIndex: 10,
          queueIndex: { id: 1, idx: 5 },
          accountHashList: [{ t: 123, h: 'hash1', c: 50 }],
          lastStaleCycle: 45,
          lastUpdateCycle: 50,
        }

        expect(history.lastSeenCycle).toBe(50)
        expect(history.queueIndex.id).toBe(1)
        expect(history.accountHashList).toHaveLength(1)
      })
    })

    describe('Map types', () => {
      it('should handle StringBoolObjectMap', () => {
        const map: Types.StringBoolObjectMap = {
          key1: true,
          key2: false,
          key3: true,
        }

        expect(map['key1']).toBe(true)
        expect(map['key2']).toBe(false)
      })

      it('should handle StringNumberObjectMap', () => {
        const map: Types.StringNumberObjectMap = {
          a: 1,
          b: 2,
          c: 3,
        }

        expect(map['a']).toBe(1)
        expect(map['c']).toBe(3)
      })
    })

    describe('CacheTopic', () => {
      it('should create valid CacheTopic', () => {
        const topic: Types.CacheTopic = {
          topic: 'myTopic',
          maxCycleAge: 10,
          maxCacheElements: 1000,
          cacheAppDataMap: new Map([['data1', { dataID: 'data1', appData: {}, cycle: 5 }]]),
          cachedAppDataArray: [],
          maxItemSize: 1024,
        }

        expect(topic.topic).toBe('myTopic')
        expect(topic.maxCycleAge).toBe(10)
        expect(topic.cacheAppDataMap.get('data1')?.cycle).toBe(5)
      })
    })

    describe('WrappedStates and filters', () => {
      it('should handle WrappedStates', () => {
        const states: Types.WrappedStates = {
          acc1: { data: 'wrapped1' } as any,
          acc2: { data: 'wrapped2' } as any,
        }

        expect(Object.keys(states)).toHaveLength(2)
        expect(states['acc1'].data).toBe('wrapped1')
      })

      it('should handle AccountFilter', () => {
        const filter: Types.AccountFilter = {
          acc1: 1,
          acc2: 2,
          acc3: 0,
        }

        expect(filter['acc1']).toBe(1)
        expect(filter['acc3']).toBe(0)
      })
    })

    describe('FifoLock', () => {
      it('should create valid FifoLock', () => {
        const lock: Types.FifoLock = {
          fifoName: 'testLock',
          queueCounter: 10,
          waitingList: [{ id: 1 }, { id: 2 }],
          lastServed: 5,
          queueLocked: true,
          lockOwner: 1,
          lastLock: 1234567890,
        }

        expect(lock.fifoName).toBe('testLock')
        expect(lock.queueCounter).toBe(10)
        expect(lock.waitingList).toHaveLength(2)
        expect(lock.queueLocked).toBe(true)
      })
    })
  })
})
