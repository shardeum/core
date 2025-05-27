import { AcceptedTx, QueueEntry, StringBoolObjectMap, StringNodeObjectMap, SignedReceipt, Proposal } from './state-manager-types'
import * as Shardus from '../shardus/shardus-types'
import { logFlags } from '../logger'
import * as utils from '../utils'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { config as configContext } from '../p2p/Context'
import * as Context from '../p2p/Context'
import * as CycleChain from '../p2p/CycleChain'
import { shardusGetTime } from '../network'
import ShardFunctions from './shardFunctions'
import * as NodeList from '../p2p/NodeList'
import { activeByIdOrder, byPubKey, potentiallyRemoved } from '../p2p/NodeList'
import * as Self from '../p2p/Self'
import { SpreadTxToGroupSyncingReq, serializeSpreadTxToGroupSyncingReq } from '../types/SpreadTxToGroupSyncingReq'
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum'
import { Utils, StateManager as StateManagerTypes } from '@shardus-global/p2p-state-sync'
import { Node } from '@shardus-global/p2p-state-sync/build/src/p2p/NodeListTypes'
import { profilerInstance } from '../utils/profiler'
import { errorToStringFull } from '../utils'
import { SignedObject } from '@shardus-global/p2p-state-sync/build/src/shardus/shardus-types'
import { RequestStateForTxReq, serializeRequestStateForTxReq } from '../types/RequestStateForTxReq'
import { RequestStateForTxRespSerialized, deserializeRequestStateForTxResp } from '../types/RequestStateForTxResp'
import { ResponseError } from '../types/ResponseError'
import { RequestReceiptForTxReqSerialized, serializeRequestReceiptForTxReq } from '../types/RequestReceiptForTxReq'
import { RequestReceiptForTxRespSerialized, deserializeRequestReceiptForTxResp } from '../types/RequestReceiptForTxResp'

interface TransactionQueueContext {
  stateManager: any
  logger: any
  mainLogger: any
  profiler: any
  queueEntryCounter: number
  isAccountInQueue: (accountId: string) => boolean
  pendingTransactionQueueByID: Map<string, QueueEntry>
  pendingTransactionQueue: QueueEntry[]
  p2p: any
  config: Shardus.StrictServerConfiguration
  app: Shardus.App
  executeInOneShard: boolean
  updateTxState: (queueEntry: QueueEntry, state: string, note?: string) => void
  _transactionQueueByID: Map<string, QueueEntry>
  txDebugStartTiming: (queueEntry: QueueEntry, tag: string) => void
  txDebugMarkStartTime: (queueEntry: QueueEntry, tag: string) => void
  isTxInPendingNonceQueue: (accountId: string, txId: string) => boolean
  addTransactionToNonceQueue: (nonceQueueItem: any) => { success: boolean; reason?: string; alreadyAdded?: boolean }
  getQueueEntrySafe: (txId: string) => QueueEntry | null
  updateHomeInformation: (queueEntry: QueueEntry) => void
  usePOQo: boolean
  useNewPOQ: boolean
  orderNodesByRank: (nodes: any[], key: string) => any[]
  computeNodeRank: (node: any, key: string) => number
  seqLogger: any
  statemanager_fatal: (key: string, log: string) => void
  queueEntryGetTransactionGroup: (queueEntry: QueueEntry, tryUpdate?: boolean) => Shardus.Node[]
  queueEntryGetConsensusGroup: (queueEntry: QueueEntry) => Shardus.Node[]
  getStartAndEndIndexOfTargetGroup: (targetGroup: string[], transactionGroup: any[]) => { startIndex: number; endIndex: number }
  addOriginalTxDataToForward: (queueEntry: QueueEntry) => void
  computeTxSieveTime: (queueEntry: QueueEntry) => number
  queueEntryPrePush: (queueEntry: QueueEntry) => void
  archivedQueueEntries: QueueEntry[]
  archivedQueueEntriesByID: Map<string, QueueEntry>
  _transactionQueue: QueueEntry[]
  archivedQueueEntryMaxCount: number
  crypto: any
  shareCompleteDataToNeighbours: (queueEntry: QueueEntry) => Promise<void>
  archiveQueueEntry: (queueEntry: QueueEntry) => void
  queueEntryAddData: (queueEntry: QueueEntry, data: Shardus.WrappedResponse, signatureCheck?: boolean) => void
  txDebugMarkEndTime: (queueEntry: QueueEntry, tag: string) => void
  dumpTxDebugToStatList: (queueEntry: QueueEntry) => void
}

export const entryMethods = {
    /***
   *    ######## ##    ##  #######  ##     ## ######## ##     ## ########
   *    ##       ###   ## ##     ## ##     ## ##       ##     ## ##
   *    ##       ####  ## ##     ## ##     ## ##       ##     ## ##
   *    ######   ## ## ## ##     ## ##     ## ######   ##     ## ######
   *    ##       ##  #### ##  ## ## ##     ## ##       ##     ## ##
   *    ##       ##   ### ##    ##  ##     ## ##       ##     ## ##
   *    ######## ##    ##  ##### ##  #######  ########  #######  ########
   */

  routeAndQueueAcceptedTransaction(
    this: TransactionQueueContext,
    acceptedTx: AcceptedTx,
    sendGossip = true,
    sender: Shardus.Node | null,
    globalModification: boolean,
    noConsensus: boolean
  ): string | boolean {
    // dropping these too early.. hmm  we finished syncing before we had the first shard data.
    // if (this.stateManager.currentCycleShardData == null) {
    //   // this.preTXQueue.push(acceptedTX)
    //   return 'notReady' // it is too early to care about the tx
    // }
    /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('routeAndQueueAcceptedTransaction-debug', '', `sendGossip:${sendGossip} globalModification:${globalModification} noConsensus:${noConsensus} this.readyforTXs:${this.stateManager.accountSync.readyforTXs} hasshardData:${this.stateManager.currentCycleShardData != null} acceptedTx:${utils.stringifyReduce(acceptedTx)} `)
    if (this.stateManager.accountSync.readyforTXs === false) {
      /* prettier-ignore */ if (logFlags.verbose) if (logFlags.error) this.mainLogger.error(`routeAndQueueAcceptedTransaction too early for TX: this.readyforTXs === false`)
      return 'notReady' // it is too early to care about the tx
    }
    if (this.stateManager.currentCycleShardData == null) {
      /* prettier-ignore */ if (logFlags.verbose) if (logFlags.error) this.mainLogger.error(`routeAndQueueAcceptedTransaction too early for TX: this.stateManager.currentCycleShardData == null`)
      return 'notReady'
    }

    try {
      this.profiler.profileSectionStart('enqueue')

      if (this.stateManager.accountGlobals.hasknownGlobals == false) {
        /* prettier-ignore */ if (logFlags.verbose) if (logFlags.error) this.mainLogger.error(`routeAndQueueAcceptedTransaction too early for TX: hasknownGlobals == false`)
        return 'notReady'
      }

      const keysResponse = acceptedTx.keys
      const timestamp = acceptedTx.timestamp
      const txId = acceptedTx.txId

      // This flag turns of consensus for all TXs for debuggging
      if (this.stateManager.debugNoTxVoting === true) {
        noConsensus = true
      }

      if (configContext.stateManager.waitUpstreamTx) {
        const keysToCheck = []
        if (acceptedTx.shardusMemoryPatterns && acceptedTx.shardusMemoryPatterns.rw) {
          keysToCheck.push(...acceptedTx.shardusMemoryPatterns.rw)
        }
        if (acceptedTx.shardusMemoryPatterns && acceptedTx.shardusMemoryPatterns.wo) {
          keysToCheck.push(...acceptedTx.shardusMemoryPatterns.wo)
        }
        if (keysToCheck.length === 0) {
          const sourceKey = acceptedTx.keys.sourceKeys[0]
          keysToCheck.push(sourceKey)
        }
        for (const key of keysToCheck) {
          const isAccountInQueue = this.isAccountInQueue(key)
          if (isAccountInQueue) {
            nestedCountersInstance.countEvent(
              'stateManager',
              `cancel enqueue, isAccountInQueue ${key} ${isAccountInQueue}`
            )
            return false
          }
        }
      }

      let cycleNumber = this.stateManager.currentCycleShardData.cycleNumber
      if (Context.config.stateManager.deterministicTXCycleEnabled) {
        cycleNumber = CycleChain.getCycleNumberFromTimestamp(
          acceptedTx.timestamp - Context.config.stateManager.reduceTimeFromTxTimestamp,
          true,
          false
        )
        if (cycleNumber > this.stateManager.currentCycleShardData.cycleNumber) {
          /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`routeAndQueueAcceptedTransaction derived txGroupCycle > currentCycleShardData.cycleNumber. txId:${txId} txGroupCycle:${cycleNumber} currentCycleShardData.cycleNumber:${this.stateManager.currentCycleShardData.cycleNumber}`)
          nestedCountersInstance.countEvent('stateManager', 'derived txGroupCycle is larger than current cycle')
          if (Context.config.stateManager.fallbackToCurrentCycleFortxGroup) {
            cycleNumber = this.stateManager.currentCycleShardData.cycleNumber
          }
        } else if (cycleNumber < this.stateManager.currentCycleShardData.cycleNumber) {
          /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`routeAndQueueAcceptedTransaction derived txGroupCycle < currentCycleShardData.cycleNumber. txId:${txId} txGroupCycle:${cycleNumber} currentCycleShardData.cycleNumber:${this.stateManager.currentCycleShardData.cycleNumber}`)
          nestedCountersInstance.countEvent('stateManager', 'derived txGroupCycle is less than current cycle')
        } else if (cycleNumber === this.stateManager.currentCycleShardData.cycleNumber) {
          nestedCountersInstance.countEvent('stateManager', 'derived txGroupCycle is same as current cycle')
        }
      }

      this.queueEntryCounter++
      const txQueueEntry: QueueEntry = {
        gossipedCompleteData: false,
        eligibleNodeIdsToConfirm: new Set(),
        eligibleNodeIdsToVote: new Set(),
        acceptedTx: acceptedTx,
        uniqueTags: this.app.getUniqueAppTags?.(acceptedTx.data.tx),
        txKeys: keysResponse,
        executionShardKey: null,
        isInExecutionHome: true,
        shardusMemoryPatternSets: null,
        noConsensus,
        collectedData: {},
        collectedFinalData: {},
        originalData: {},
        beforeHashes: {},
        homeNodes: {},
        patchedOnNodes: new Map(),
        hasShardInfo: false,
        state: 'aging',
        dataCollected: 0,
        hasAll: false,
        entryID: this.queueEntryCounter,
        localKeys: {},
        localCachedData: {},
        syncCounter: 0,
        didSync: false,
        queuedBeforeMainSyncComplete: false,
        didWakeup: false,
        syncKeys: [],
        logstate: '',
        requests: {},
        globalModification: globalModification,
        collectedVotes: [],
        collectedVoteHashes: [],
        pendingConfirmOrChallenge: new Map(),
        pendingVotes: new Map(),
        waitForReceiptOnly: false,
        m2TimeoutReached: false,
        debugFail_voteFlip: false,
        debugFail_failNoRepair: false,
        requestingReceipt: false,
        cycleToRecordOn: -5,
        involvedPartitions: [],
        involvedGlobalPartitions: [],
        shortReceiptHash: '',
        requestingReceiptFailed: false,
        approximateCycleAge: cycleNumber,
        ourNodeInTransactionGroup: false,
        ourNodeInConsensusGroup: false,
        logID: '',
        txGroupDebug: '',
        uniqueWritableKeys: [],
        txGroupCycle: 0,
        updatedTxGroupCycle: 0,
        updatedTransactionGroup: null,
        receiptEverRequested: false,
        repairStarted: false,
        repairFailed: false,
        hasValidFinalData: false,
        pendingDataRequest: false,
        queryingFinalData: false,
        lastFinalDataRequestTimestamp: 0,
        newVotes: false,
        fromClient: sendGossip,
        gossipedReceipt: false,
        gossipedVote: false,
        gossipedConfirmOrChallenge: false,
        completedConfirmedOrChallenge: false,
        uniqueChallengesCount: 0,
        uniqueChallenges: {},
        archived: false,
        ourTXGroupIndex: -1,
        ourExGroupIndex: -1,
        involvedReads: {},
        involvedWrites: {},
        txDebug: {
          enqueueHrTime: process.hrtime(),
          startTime: {},
          endTime: {},
          duration: {},
          startTimestamp: {},
          endTimestamp: {},
        },
        executionGroupMap: new Map(),
        executionNodeIdSorted: [],
        txSieveTime: 0,
        debug: {},
        voteCastAge: 0,
        dataSharedTimestamp: 0,
        firstVoteReceivedTimestamp: 0,
        firstConfirmOrChallengeTimestamp: 0,
        lastVoteReceivedTimestamp: 0,
        lastConfirmOrChallengeTimestamp: 0,
        robustQueryVoteCompleted: false,
        robustQueryConfirmOrChallengeCompleted: false,
        acceptVoteMessage: true,
        acceptConfirmOrChallenge: true,
        accountDataSet: false,
        topConfirmations: new Set(),
        topVoters: new Set(),
        hasRobustConfirmation: false,
        sharedCompleteData: false,
        correspondingGlobalOffset: 0,
        isSenderWrappedTxGroup: {},
        isNGT: this.app.isNGT(acceptedTx.data?.tx),
      } // age comes from timestamp
      this.txDebugMarkStartTime(txQueueEntry, 'total_queue_time')
      this.txDebugMarkStartTime(txQueueEntry, 'aging')

      // todo faster hash lookup for this maybe?
      const entry = this.getQueueEntrySafe(acceptedTx.txId) // , acceptedTx.timestamp)
      if (entry) {
        return false // already in our queue, or temp queue
      }

      txQueueEntry.logID = utils.makeShortHash(acceptedTx.txId)

      this.stateManager.debugTXHistory[txQueueEntry.logID] = 'enteredQueue'

      if (this.app.canDebugDropTx(acceptedTx.data)) {
        if (
          this.stateManager.testFailChance(
            this.stateManager.loseTxChance,
            'loseTxChance',
            txQueueEntry.logID,
            '',
            logFlags.verbose
          ) === true
        ) {
          return 'lost'
        }
        if (
          this.stateManager.testFailChance(
            this.stateManager.voteFlipChance,
            'voteFlipChance',
            txQueueEntry.logID,
            '',
            logFlags.verbose
          ) === true
        ) {
          txQueueEntry.debugFail_voteFlip = true
        }

        if (
          globalModification === false &&
          this.stateManager.testFailChance(
            this.stateManager.failNoRepairTxChance,
            'failNoRepairTxChance',
            txQueueEntry.logID,
            '',
            logFlags.verbose
          ) === true
        ) {
          txQueueEntry.debugFail_failNoRepair = true
        }
      }

      try {
        // use shardusGetTime() instead of Date.now as many thing depend on it
        const age = shardusGetTime() - timestamp

        const keyHash: StringBoolObjectMap = {} //TODO replace with Set<string>
        for (const key of txQueueEntry.txKeys.allKeys) {
          if (key == null) {
            // throw new Error(`routeAndQueueAcceptedTransaction key == null ${key}`)
            /* prettier-ignore */ if (logFlags.verbose) if (logFlags.error) this.mainLogger.error(`routeAndQueueAcceptedTransaction key == null ${timestamp} not putting tx in queue.`)
            return false
          }

          // eslint-disable-next-line security/detect-object-injection
          keyHash[key] = true
        }
        txQueueEntry.uniqueKeys = Object.keys(keyHash)

        if (txQueueEntry.txKeys.allKeys == null || txQueueEntry.txKeys.allKeys.length === 0) {
          /* prettier-ignore */ if (logFlags.verbose) if (logFlags.error) this.mainLogger.error(`routeAndQueueAcceptedTransaction allKeys == null || allKeys.length === 0 ${timestamp} not putting tx in queue.`)
          return false
        }
        let cycleShardData = this.stateManager.currentCycleShardData
        if (Context.config.stateManager.deterministicTXCycleEnabled) {
          txQueueEntry.txGroupCycle = cycleNumber
          cycleShardData = this.stateManager.shardValuesByCycle.get(cycleNumber)
        }
        txQueueEntry.txDebug.cycleSinceActivated =
          cycleNumber - activeByIdOrder.find((node) => node.id === Self.id).activeCycle

        if (cycleShardData == null) {
          /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`routeAndQueueAcceptedTransaction logID:${txQueueEntry.logID} cycleShardData == null cycle:${cycleNumber} not putting tx in queue.`)
          nestedCountersInstance.countEvent('stateManager', 'routeAndQueueAcceptedTransaction cycleShardData == null')
          return false
        }

        this.updateHomeInformation(txQueueEntry)

        //set the executionShardKey for the transaction
        if (txQueueEntry.globalModification === false && this.executeInOneShard) {
          //USE the first key in the list of all keys.  Applications much carefully sort this list
          //so that we start in the optimal shard.  This will matter less when shard hopping is implemented
          txQueueEntry.executionShardKey = txQueueEntry.txKeys.allKeys[0]
          /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`routeAndQueueAcceptedTransaction set executionShardKey tx:${txQueueEntry.logID} ts:${timestamp} executionShardKey: ${utils.stringifyReduce(txQueueEntry.executionShardKey)}  `)

          // we were doing this in queueEntryGetTransactionGroup.  moved it earlier.
          const { homePartition } = ShardFunctions.addressToPartition(
            cycleShardData.shardGlobals,
            txQueueEntry.executionShardKey
          )

          const homeShardData = cycleShardData.parititionShardDataMap.get(homePartition)

          //set the nodes that are in the executionGroup.
          //This is needed so that consensus will expect less nodes to be voting
          const unRankedExecutionGroup = homeShardData.homeNodes[0].consensusNodeForOurNodeFull.slice()
          if (this.usePOQo) {
            txQueueEntry.executionGroup = this.orderNodesByRank(unRankedExecutionGroup, txQueueEntry)
          } else if (this.useNewPOQ) {
            txQueueEntry.executionGroup = this.orderNodesByRank(unRankedExecutionGroup, txQueueEntry)
          } else {
            txQueueEntry.executionGroup = unRankedExecutionGroup
          }
          // for the new FACT algorithm
          txQueueEntry.executionNodeIdSorted = txQueueEntry.executionGroup.map((node) => node.id).sort()

          if (txQueueEntry.isInExecutionHome) {
            txQueueEntry.ourNodeRank = this.computeNodeRank(
              cycleShardData.ourNode.id,
              txQueueEntry.acceptedTx.txId,
              txQueueEntry.acceptedTx.timestamp
            )
          }

          const minNodesToVote = 3
          const voterPercentage = configContext.stateManager.voterPercentage
          const numberOfVoters = Math.max(
            minNodesToVote,
            Math.floor(txQueueEntry.executionGroup.length * voterPercentage)
          )
          // voters are highest ranked nodes
          txQueueEntry.eligibleNodeIdsToVote = new Set(
            txQueueEntry.executionGroup.slice(0, numberOfVoters).map((node) => node.id)
          )

          // confirm nodes are lowest ranked nodes
          txQueueEntry.eligibleNodeIdsToConfirm = new Set(
            txQueueEntry.executionGroup
              .slice(txQueueEntry.executionGroup.length - numberOfVoters)
              .map((node) => node.id)
          )

          // calculate globalOffset for FACT
          // take last 2 bytes of the txId and convert it to an integer
          txQueueEntry.correspondingGlobalOffset = parseInt(txId.slice(-4), 16)

          const ourID = cycleShardData.ourNode.id
          for (let idx = 0; idx < txQueueEntry.executionGroup.length; idx++) {
            // eslint-disable-next-line security/detect-object-injection
            const node = txQueueEntry.executionGroup[idx]
            txQueueEntry.executionGroupMap.set(node.id, node)
            if (node.id === ourID) {
              txQueueEntry.ourExGroupIndex = idx
              /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455105 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: executor index ${txQueueEntry.ourExGroupIndex}:${(node as Shardus.NodeWithRank).rank}`)
            }
          }
          if (txQueueEntry.eligibleNodeIdsToConfirm.has(Self.id)) {
            /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455105 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: confirmator`)
          }
          if (txQueueEntry.eligibleNodeIdsToVote.has(Self.id)) {
            /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455105 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: voter`)
          }
          /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455105 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: groupsize voters ${txQueueEntry.eligibleNodeIdsToConfirm.size}`)
          /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455105 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: groupsize confirmators ${txQueueEntry.eligibleNodeIdsToConfirm.size}`)
          /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455105 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: groupsize execution ${txQueueEntry.executionGroup.length}`)

          //if we are not in the execution group then set isInExecutionHome to false
          if (txQueueEntry.executionGroupMap.has(cycleShardData.ourNode.id) === false) {
            txQueueEntry.isInExecutionHome = false
          }

          /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`routeAndQueueAcceptedTransaction info ${txQueueEntry.logID} isInExecutionHome:${txQueueEntry.isInExecutionHome} hasShardInfo:${txQueueEntry.hasShardInfo}`)
          /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('routeAndQueueAcceptedTransaction', `routeAndQueueAcceptedTransaction info ${txQueueEntry.logID} isInExecutionHome:${txQueueEntry.isInExecutionHome} hasShardInfo:${txQueueEntry.hasShardInfo} executionShardKey:${utils.makeShortHash(txQueueEntry.executionShardKey)}`)
          /* prettier-ignore */ if (this.stateManager.consensusLog) this.mainLogger.debug(`routeAndQueueAcceptedTransaction info ${txQueueEntry.logID} isInExecutionHome:${txQueueEntry.isInExecutionHome}`)
        }

        // calculate information needed for receiptmap
        txQueueEntry.cycleToRecordOn = CycleChain.getCycleNumberFromTimestamp(timestamp)
        /* prettier-ignore */ if (logFlags.verbose) console.log('Cycle number from timestamp', timestamp, txQueueEntry.cycleToRecordOn)
        if (txQueueEntry.cycleToRecordOn < 0) {
          nestedCountersInstance.countEvent('getCycleNumberFromTimestamp', 'caused Enqueue fail')
          /* prettier-ignore */ if (logFlags.verbose) if (logFlags.error) this.mainLogger.error(`routeAndQueueAcceptedTransaction failed to calculate cycle ${timestamp} error code:${txQueueEntry.cycleToRecordOn}`)
          return false
        }
        if (txQueueEntry.cycleToRecordOn == null) {
          this.statemanager_fatal(
            `routeAndQueueAcceptedTransaction cycleToRecordOn==null`,
            `routeAndQueueAcceptedTransaction cycleToRecordOn==null  ${txQueueEntry.logID} ${timestamp}`
          )
        }

        /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_queueInsertion_start', txQueueEntry.logID, `${txQueueEntry.logID} uniqueKeys:${utils.stringifyReduce(txQueueEntry.uniqueKeys)}  txKeys: ${utils.stringifyReduce(txQueueEntry.txKeys)} cycleToRecordOn:${txQueueEntry.cycleToRecordOn}`)

        // Look at our keys and log which are known global accounts.  Set global accounts for keys if this is a globalModification TX
        for (const key of txQueueEntry.uniqueKeys) {
          if (globalModification === true) {
            if (this.stateManager.accountGlobals.isGlobalAccount(key)) {
              /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('globalAccountMap', `routeAndQueueAcceptedTransaction - has account:${utils.stringifyReduce(key)}`)
            } else {
              //this makes the code aware that this key is for a global account.
              //is setting this here too soon?
              //it should be that p2p has already checked the receipt before calling shardus.push with global=true
              this.stateManager.accountGlobals.setGlobalAccount(key)
              /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('globalAccountMap', `routeAndQueueAcceptedTransaction - set account:${utils.stringifyReduce(key)}`)
            }
          }
        }

        // slightly different flag that didsync.  This is less about if our address range was done syncing (which can happen any time)
        // and just a simple check to see if this was queued before the main sync phase.
        // for now, just used for more detailed logging so we can sort out if problem TXs were from shortly before we were fully done
        // but after a sync range was finished, (used shortly below in the age check)
        txQueueEntry.queuedBeforeMainSyncComplete = this.stateManager.accountSync.dataSyncMainPhaseComplete

        // Check to see if any keys are inside of a syncing range.
        // If it is a global key in a non-globalModification TX then we dont care about it

        // COMPLETE HACK!!!!!!!!!
        // for (let key of txQueueEntry.uniqueKeys) {
        //   let syncTracker = this.stateManager.accountSync.getSyncTracker(key)
        //   // only look at syncing for accounts that are changed.
        //   // if the sync range is for globals and the tx is not a global modifier then skip it!

        //   // todo take another look at this condition and syncTracker.globalAddressMap
        //   if (syncTracker != null && (syncTracker.isGlobalSyncTracker === false || txQueueEntry.globalModification === true)) {
        //     if (this.stateManager.accountSync.softSync_noSyncDelay === true) {
        //       //no delay means that don't pause the TX in state = 'syncing'
        //     } else {
        //       txQueueEntry.state = 'syncing'
        //       txQueueEntry.syncCounter++
        //       syncTracker.queueEntries.push(txQueueEntry) // same tx may get pushed in multiple times. that's ok.
        //       syncTracker.keys[key] = true //mark this key for fast testing later
        //     }

        //     txQueueEntry.didSync = true // mark that this tx had to sync, this flag should never be cleared, we will use it later to not through stuff away.
        //     txQueueEntry.syncKeys.push(key) // used later to instruct what local data we should JIT load
        //     txQueueEntry.localKeys[key] = true // used for the filter.  TODO review why this is set true here!!! seems like this may flag some keys not owned by this node!
        //     /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_sync_queued_and_set_syncing', `${txQueueEntry.logID}`, `${txQueueEntry.logID} qId: ${txQueueEntry.entryID} account:${utils.stringifyReduce(key)}`)
        //   }
        // }

        if (age > this.stateManager.queueSitTime * 0.9) {
          if (txQueueEntry.didSync === true) {
            /* prettier-ignore */ nestedCountersInstance.countEvent('stateManager', `enqueue old TX didSync === true queuedBeforeMainSyncComplete:${txQueueEntry.queuedBeforeMainSyncComplete}`)
          } else {
            /* prettier-ignore */ nestedCountersInstance.countEvent('stateManager', `enqueue old TX didSync === false queuedBeforeMainSyncComplete:${txQueueEntry.queuedBeforeMainSyncComplete}`)
            if (txQueueEntry.queuedBeforeMainSyncComplete) {
              //only a fatal if it was after the main sync phase was complete.
              this.statemanager_fatal(
                `routeAndQueueAcceptedTransaction_olderTX`,
                'routeAndQueueAcceptedTransaction working on older tx ' + timestamp + ' age: ' + age
              )
              // TODO consider throwing this out.  right now it is just a warning
              /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_oldQueueInsertion', '', 'routeAndQueueAcceptedTransaction working on older tx ' + timestamp + ' age: ' + age)
            }
          }
        }

        // Refine our list of which keys will be updated in this transaction : uniqueWritableKeys
        for (const key of txQueueEntry.uniqueKeys) {
          const isGlobalAcc = this.stateManager.accountGlobals.isGlobalAccount(key)

          // if it is a global modification and global account we can write
          if (globalModification === true && isGlobalAcc === true) {
            txQueueEntry.uniqueWritableKeys.push(key)
          }
          // if it is a normal transaction and non global account we can write
          if (globalModification === false && isGlobalAcc === false) {
            txQueueEntry.uniqueWritableKeys.push(key)
          }
        }
        txQueueEntry.uniqueWritableKeys.sort() //need this list to be deterministic!

        if (txQueueEntry.hasShardInfo) {
          const transactionGroup = this.queueEntryGetTransactionGroup(txQueueEntry)
          /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455105 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: groupsize transaction ${txQueueEntry.transactionGroup.length}`)
          if (txQueueEntry.ourNodeInTransactionGroup || txQueueEntry.didSync === true) {
            // go ahead and calculate this now if we are in the tx group or we are syncing this range!
            this.queueEntryGetConsensusGroup(txQueueEntry)

            // populate isSenderWrappedTxGroup
            for (const accountId of txQueueEntry.uniqueKeys) {
              const homeNodeShardData = txQueueEntry.homeNodes[accountId]
              const consensusGroupForAccount = homeNodeShardData.consensusNodeForOurNodeFull.map((n) => n.id)
              const startAndEndIndices = this.getStartAndEndIndexOfTargetGroup(
                consensusGroupForAccount,
                txQueueEntry.transactionGroup
              )
              const isWrapped = startAndEndIndices.endIndex < startAndEndIndices.startIndex
              if (isWrapped === false) continue
              const unwrappedEndIndex = startAndEndIndices.endIndex + txQueueEntry.transactionGroup.length
              for (let i = startAndEndIndices.startIndex; i < unwrappedEndIndex; i++) {
                if (i >= txQueueEntry.transactionGroup.length) {
                  const wrappedIndex = i - txQueueEntry.transactionGroup.length
                  txQueueEntry.isSenderWrappedTxGroup[txQueueEntry.transactionGroup[wrappedIndex].id] = i
                }
              }
            }
            /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`routeAndQueueAcceptedTransaction isSenderWrappedTxGroup ${txQueueEntry.logID} ${utils.stringifyReduce(txQueueEntry.isSenderWrappedTxGroup)}`)
          }
          if (sendGossip && txQueueEntry.globalModification === false) {
            try {
              if (transactionGroup.length > 1) {
                // should consider only forwarding in some cases?
                this.stateManager.debugNodeGroup(txId, timestamp, `share to neighbors`, transactionGroup)
                this.p2p.sendGossipIn(
                  'spread_tx_to_group',
                  acceptedTx,
                  '',
                  sender,
                  transactionGroup,
                  true,
                  -1,
                  acceptedTx.txId
                )
                /* prettier-ignore */ if (logFlags.verbose) console.log( 'spread_tx_to_group', txId, txQueueEntry.executionGroup.length, txQueueEntry.conensusGroup.length, txQueueEntry.transactionGroup.length )
                this.addOriginalTxDataToForward(txQueueEntry)
              }
              // /* prettier-ignore */ if (logFlags.playback ) this.logger.playbackLogNote('tx_homeGossip', `${txId}`, `AcceptedTransaction: ${acceptedTX}`)
            } catch (ex) {
              this.statemanager_fatal(`txQueueEntry_ex`, 'txQueueEntry: ' + utils.stringifyReduce(txQueueEntry))
            }
          }

          if (txQueueEntry.didSync === false) {
            // see if our node shard data covers any of the accounts?
            if (txQueueEntry.ourNodeInTransactionGroup === false && txQueueEntry.globalModification === false) {
              /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_notInTxGroup', `${txQueueEntry.logID}`, ``)
              return 'out of range' // we are done, not involved!!!
            } else {
              // If we have syncing neighbors forward this TX to them
              if (this.config.debug.forwardTXToSyncingNeighbors && cycleShardData.hasSyncingNeighbors === true) {
                let send_spread_tx_to_group_syncing = true
                //todo turn this back on if other testing goes ok
                if (txQueueEntry.ourNodeInTransactionGroup === false) {
                  /* prettier-ignore */ nestedCountersInstance.countEvent('transactionQueue', 'spread_tx_to_group_syncing-skipped2')
                  send_spread_tx_to_group_syncing = false
                } else if (txQueueEntry.ourTXGroupIndex > 0) {
                  const everyN = Math.max(1, Math.floor(txQueueEntry.transactionGroup.length * 0.4))
                  const nonce = parseInt('0x' + txQueueEntry.acceptedTx.txId.substring(0, 2))
                  const idxPlusNonce = txQueueEntry.ourTXGroupIndex + nonce
                  const idxModEveryN = idxPlusNonce % everyN
                  if (idxModEveryN > 0) {
                    /* prettier-ignore */ nestedCountersInstance.countEvent('transactionQueue', 'spread_tx_to_group_syncing-skipped')
                    send_spread_tx_to_group_syncing = false
                  }
                }
                if (send_spread_tx_to_group_syncing) {
                  /* prettier-ignore */ nestedCountersInstance.countEvent('transactionQueue', 'spread_tx_to_group_syncing-notSkipped')

                  // only send non global modification TXs
                  if (txQueueEntry.globalModification === false) {
                    /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`routeAndQueueAcceptedTransaction: spread_tx_to_group ${txQueueEntry.logID}`)
                    /* prettier-ignore */
                    if (logFlags.playback) this.logger.playbackLogNote("shrd_sync_tx", `${txQueueEntry.logID}`, `txts: ${timestamp} nodes:${utils.stringifyReduce(cycleShardData.syncingNeighborsTxGroup.map((x) => x.id))}`)

                    this.stateManager.debugNodeGroup(
                      txId,
                      timestamp,
                      `share to syncing neighbors`,
                      cycleShardData.syncingNeighborsTxGroup
                    )
                    //this.p2p.sendGossipAll('spread_tx_to_group', acceptedTx, '', sender, cycleShardData.syncingNeighborsTxGroup)
                    // if (
                    //   this.stateManager.config.p2p.useBinarySerializedEndpoints &&
                    //   this.stateManager.config.p2p.spreadTxToGroupSyncingBinary
                    // ) {
                    if (logFlags.seqdiagram) {
                      for (const node of cycleShardData.syncingNeighborsTxGroup) {
                        /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455102 ${shardusGetTime()} tx:${acceptedTx.txId} ${NodeList.activeIdToPartition.get(Self.id)}-->>${NodeList.activeIdToPartition.get(node.id)}: ${'spread_tx_to_group_syncing'}`)
                      }
                    }
                    const request = acceptedTx as SpreadTxToGroupSyncingReq
                    this.p2p.tellBinary<SpreadTxToGroupSyncingReq>(
                      cycleShardData.syncingNeighborsTxGroup,
                      InternalRouteEnum.binary_spread_tx_to_group_syncing,
                      request,
                      serializeSpreadTxToGroupSyncingReq,
                      {}
                    )
                    // } else {
                    //   this.p2p.tell(
                    //     cycleShardData.syncingNeighborsTxGroup,
                    //     'spread_tx_to_group_syncing',
                    //     acceptedTx
                    //   )
                    // }
                  } else {
                    /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`routeAndQueueAcceptedTransaction: bugfix detected. avoid forwarding txs where globalModification == true ${txQueueEntry.logID}`)
                  }
                }
              }
            }
          }
        } else {
          throw new Error('missing shard info')
        }

        this.computeTxSieveTime(txQueueEntry)

        if (
          this.config.debug.useShardusMemoryPatterns &&
          acceptedTx.shardusMemoryPatterns != null &&
          acceptedTx.shardusMemoryPatterns.ro != null
        ) {
          txQueueEntry.shardusMemoryPatternSets = {
            ro: new Set(acceptedTx.shardusMemoryPatterns.ro),
            rw: new Set(acceptedTx.shardusMemoryPatterns.rw),
            wo: new Set(acceptedTx.shardusMemoryPatterns.wo),
            on: new Set(acceptedTx.shardusMemoryPatterns.on),
            ri: new Set(acceptedTx.shardusMemoryPatterns.ri),
          }
          nestedCountersInstance.countEvent('transactionQueue', 'shardusMemoryPatternSets included')
        } else {
          nestedCountersInstance.countEvent('transactionQueue', 'shardusMemoryPatternSets not included')
        }

        // This call is not awaited. It is expected to be fast and will be done in the background.
        this.queueEntryPrePush(txQueueEntry)

        this.pendingTransactionQueue.push(txQueueEntry)
        this.pendingTransactionQueueByID.set(txQueueEntry.acceptedTx.txId, txQueueEntry)

        /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455105 ${shardusGetTime()} tx:${txQueueEntry.acceptedTx.txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: pendingQ`)

        /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_txPreQueued', `${txQueueEntry.logID}`, `${txQueueEntry.logID} gm:${txQueueEntry.globalModification}`)
        // start the queue if needed
        this.stateManager.tryStartTransactionProcessingQueue()
      } catch (error) {
        /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_addtoqueue_rejected', `${txId}`, `AcceptedTransaction: ${txQueueEntry.logID} ts: ${txQueueEntry.txKeys.timestamp} acc: ${utils.stringifyReduce(txQueueEntry.txKeys.allKeys)}`)
        this.statemanager_fatal(
          `routeAndQueueAcceptedTransaction_ex`,
          'routeAndQueueAcceptedTransaction failed: ' + errorToStringFull(error)
        )
        throw new Error(error)
      }
      return true
    } finally {
      this.profiler.profileSectionEnd('enqueue')
    }
  },

  async queueEntryPrePush(this: TransactionQueueContext, txQueueEntry: QueueEntry): Promise<void> {
    this.profiler.profileSectionStart('queueEntryPrePush', true)
    this.profiler.scopedProfileSectionStart('queueEntryPrePush', true)
    // Pre fetch immutable read account data for this TX
    if (
      this.config.features.enableRIAccountsCache &&
      txQueueEntry.shardusMemoryPatternSets &&
      txQueueEntry.shardusMemoryPatternSets.ri &&
      txQueueEntry.shardusMemoryPatternSets.ri.size > 0
    ) {
      for (const key of txQueueEntry.shardusMemoryPatternSets.ri) {
        /* prettier-ignore */ nestedCountersInstance.countEvent('transactionQueue', 'queueEntryPrePush_ri')
        /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.info(`queueEntryPrePush: fetching immutable data for tx ${txQueueEntry.acceptedTx.txId} key ${key}`)
        const accountData = await this.stateManager.getLocalOrRemoteAccount(key, {
          useRICache: true,
        })
        if (accountData != null) {
          this.app.setCachedRIAccountData([accountData])
          this.queueEntryAddData(
            txQueueEntry,
            {
              accountId: accountData.accountId,
              stateId: accountData.stateId,
              data: accountData.data,
              timestamp: accountData.timestamp,
              syncData: accountData.syncData,
              accountCreated: false,
              isPartial: false,
            },
            false
          )
          /* prettier-ignore */ nestedCountersInstance.countEvent('transactionQueue', 'queueEntryPrePush_ri_added')
        }
      }
    }
    this.profiler.scopedProfileSectionEnd('queueEntryPrePush')
    this.profiler.profileSectionStart('queueEntryPrePush', true)
  }

  /***
   *     #######           ###     ######   ######  ########  ######   ######
   *    ##     ##         ## ##   ##    ## ##    ## ##       ##    ## ##    ##
   *    ##     ##        ##   ##  ##       ##       ##       ##       ##
   *    ##     ##       ##     ## ##       ##       ######    ######   ######
   *    ##  ## ##       ######### ##       ##       ##             ##       ##
   *    ##    ##        ##     ## ##    ## ##    ## ##       ##    ## ##    ##
   *     ##### ##       ##     ##  ######   ######  ########  ######   ######
   */

  /**
   * getQueueEntry
   * get a queue entry from the current queue
   * @param txid
   */
  getQueueEntry(this: TransactionQueueContext, txid: string): QueueEntry | null {
    const queueEntry = this._transactionQueueByID.get(txid)
    if (queueEntry === undefined) {
      return null
    }
    return queueEntry
  },

  /**
   * getQueueEntrySafe
   * get a queue entry from the queue or the pending queue (but not archive queue)
   * @param txid
   */
  getQueueEntrySafe(this: TransactionQueueContext, txid: string): QueueEntry | null {
    let queueEntry = this._transactionQueueByID.get(txid)
    if (queueEntry === undefined) {
      queueEntry = this.pendingTransactionQueueByID.get(txid)
      if (queueEntry === undefined) {
        /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`getQueueEntrySafe failed to find: ${utils.stringifyReduce(txid)}`)
        nestedCountersInstance.countEvent('getQueueEntrySafe', 'failed to find returning null')
        return null
      }
    }
    return queueEntry
  },

  /**
   * getQueueEntryArchived
   * get a queue entry from the archive queue only
   * @param txid
   * @param msg
   */
  getQueueEntryArchived(this: TransactionQueueContext, txid: string, msg: string): QueueEntry | null {
    const queueEntry = this.archivedQueueEntriesByID.get(txid)
    if (queueEntry != null) {
      return queueEntry
    }
    nestedCountersInstance.countRareEvent('error', `getQueueEntryArchived no entry: ${msg}`)
    /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`getQueueEntryArchived failed to find: ${utils.stringifyReduce(txid)} ${msg} dbg:${this.stateManager.debugTXHistory[utils.stringifyReduce(txid)]}`)
    return null
  },

  getArchivedQueueEntryByAccountIdAndHash(this: TransactionQueueContext, accountId: string, hash: string, msg: string): QueueEntry | null {
    try {
      let foundQueueEntry = false
      let foundVote = false
      let foundVoteMatchingHash = false
      for (const queueEntry of this.archivedQueueEntriesByID.values()) {
        if (queueEntry.uniqueKeys.includes(accountId)) {
          foundQueueEntry = true
          const signedReceipt: SignedReceipt = this.stateManager.getSignedReceipt(queueEntry)
          let proposal: Proposal | null = null
          if (signedReceipt != null) {
            proposal = signedReceipt.proposal
            if (signedReceipt.proposal)
              nestedCountersInstance.countEvent(
                'getArchivedQueueEntryByAccountIdAndHash',
                'get proposal from signedReceipt'
              )
          }
          if (proposal == null) {
            proposal = queueEntry.ourProposal
            if (queueEntry.receivedBestVote)
              nestedCountersInstance.countEvent(
                'getArchivedQueueEntryByAccountIdAndHash',
                'get proposal' + ' from' + ' queueEntry.ourProposal'
              )
          }
          if (proposal == null) {
            continue
          }
          foundVote = true
          // this node might not have a vote for this tx
          for (let i = 0; i < proposal.accountIDs.length; i++) {
            // eslint-disable-next-line security/detect-object-injection
            if (proposal.accountIDs[i] === accountId) {
              // eslint-disable-next-line security/detect-possible-timing-attacks, security/detect-object-injection
              if (proposal.afterStateHashes[i] === hash) {
                foundVoteMatchingHash = true
                return queueEntry
              }
            }
          }
        }
      }
      nestedCountersInstance.countRareEvent('error', `getQueueEntryArchived no entry: ${msg}`)
      nestedCountersInstance.countEvent(
        'error',
        `getQueueEntryArchived no entry: ${msg}, found queue entry: ${foundQueueEntry}, found vote: ${foundVote}, found vote matching hash: ${foundVoteMatchingHash}`
      )
      return null
    } catch (e) {
      this.statemanager_fatal(`getArchivedQueueEntryByAccountIdAndHash`, `error: ${e.message}`)
      return null
    }
  }
  /**
   * getQueueEntryArchived
   * get a queue entry from the archive queue only
   * @param txid
   * @param msg
   */
  getQueueEntryArchivedByTimestamp(this: TransactionQueueContext, timestamp: number, msg: string): QueueEntry | null {
    for (const queueEntry of this.archivedQueueEntriesByID.values()) {
      if (queueEntry.acceptedTx.timestamp === timestamp) {
        return queueEntry
      }
    }
    nestedCountersInstance.countRareEvent('error', `getQueueEntryArchived no entry: ${msg}`)
    nestedCountersInstance.countEvent('error', `getQueueEntryArchived no entry: ${msg}`)
    return null
  },

  /**
   * queueEntryAddData
   * add data to a queue entry
   *   // TODO CODEREVIEW.  need to look at the use of local cache.  also is the early out ok?
   * @param queueEntry
   * @param data
   */
  queueEntryAddData(this: TransactionQueueContext, queueEntry: QueueEntry, data: Shardus.WrappedResponse, signatureCheck = false): void {
    if (queueEntry.uniqueKeys == null) {
      nestedCountersInstance.countEvent('queueEntryAddData', 'uniqueKeys == null')
      // cant have all data yet if we dont even have unique keys.
      throw new Error(
        `Attempting to add data and uniqueKeys are not available yet: ${utils.stringifyReduceLimit(queueEntry, 200)}`
      )
    }
    if (queueEntry.collectedData[data.accountId] != null) {
      if (configContext.stateManager.collectedDataFix) {
        // compare the timestamps and keep the newest
        const existingData = queueEntry.collectedData[data.accountId]
        if (data.timestamp > existingData.timestamp) {
          queueEntry.collectedData[data.accountId] = data
          nestedCountersInstance.countEvent('queueEntryAddData', 'collectedDataFix replace with newer data')
        } else {
          nestedCountersInstance.countEvent('queueEntryAddData', 'already collected 1')
          return
        }
      } else {
        // we have already collected this data
        nestedCountersInstance.countEvent('queueEntryAddData', 'already collected 2')
        return
      }
    }
    profilerInstance.profileSectionStart('queueEntryAddData', true)
    // check the signature of each account data
    if (signatureCheck && (data.sign == null || data.sign.owner == null || data.sign.sig == null)) {
      this.mainLogger.fatal(`queueEntryAddData: data.sign == null ${utils.stringifyReduce(data)}`)
      nestedCountersInstance.countEvent('queueEntryAddData', 'data.sign == null')
      return
    }

    if (signatureCheck) {
      const dataSenderPublicKey = data.sign.owner
      const dataSenderNode: Shardus.Node = byPubKey[dataSenderPublicKey]
      if (dataSenderNode == null) {
        nestedCountersInstance.countEvent('queueEntryAddData', 'dataSenderNode == null')
        return
      }
      const consensusNodesForAccount = queueEntry.homeNodes[data.accountId]?.consensusNodeForOurNodeFull
      if (
        consensusNodesForAccount == null ||
        consensusNodesForAccount.map((n) => n.id).includes(dataSenderNode.id) === false
      ) {
        nestedCountersInstance.countEvent(
          'queueEntryAddData',
          'data sender node is not in the consensus group of the' + ' account'
        )
        return
      }

      const singedData = data as SignedObject

      if (this.crypto.verify(singedData) === false) {
        nestedCountersInstance.countEvent('queueEntryAddData', 'data signature verification failed')
        return
      }
    }

    queueEntry.collectedData[data.accountId] = data
    queueEntry.dataCollected = Object.keys(queueEntry.collectedData).length

    //make a deep copy of the data
    queueEntry.originalData[data.accountId] = Utils.safeJsonParse(Utils.safeStringify(data))
    queueEntry.beforeHashes[data.accountId] = data.stateId

    if (queueEntry.dataCollected === queueEntry.uniqueKeys.length) {
      //  queueEntry.tx Keys.allKeys.length
      queueEntry.hasAll = true
      // this.gossipCompleteData(queueEntry)
      if (queueEntry.executionGroup && queueEntry.executionGroup.length > 1)
        this.shareCompleteDataToNeighbours(queueEntry)
      if (logFlags.debug || this.stateManager.consensusLog) {
        this.mainLogger.debug(
          `queueEntryAddData hasAll: true for txId ${queueEntry.logID} ${
            queueEntry.acceptedTx.txId
          } at timestamp: ${shardusGetTime()} nodeId: ${Self.id} collected ${
            Object.keys(queueEntry.collectedData).length
          } uniqueKeys ${queueEntry.uniqueKeys.length}`
        )
      }
    }

    if (data.localCache) {
      queueEntry.localCachedData[data.accountId] = data.localCache
      delete data.localCache
    }

    /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_addData', `${queueEntry.logID}`, `key ${utils.makeShortHash(data.accountId)} hash: ${utils.makeShortHash(data.stateId)} hasAll:${queueEntry.hasAll} collected:${queueEntry.dataCollected}  ${queueEntry.acceptedTx.timestamp}`)
    profilerInstance.profileSectionStart('queueEntryAddData', true)
  },

  /**
   * queueEntryHasAllData
   * Test if the queueEntry has all the data it needs.
   * TODO could be slightly more if it only recalculated when dirty.. but that would add more state and complexity,
   * so wait for this to show up in the profiler before fixing
   * @param queueEntry
   */
  queueEntryHasAllData(this: TransactionQueueContext, queueEntry: QueueEntry): boolean {
    if (queueEntry.hasAll === true) {
      return true
    }
    if (queueEntry.uniqueKeys == null) {
      throw new Error(`queueEntryHasAllData (queueEntry.uniqueKeys == null)`)
    }
    let dataCollected = 0
    for (const key of queueEntry.uniqueKeys) {
      // eslint-disable-next-line security/detect-object-injection
      if (queueEntry.collectedData[key] != null) {
        dataCollected++
      }
    }
    if (dataCollected === queueEntry.uniqueKeys.length) {
      //  queueEntry.tx Keys.allKeys.length uniqueKeys.length
      queueEntry.hasAll = true
      return true
    }
    return false
  },

  queueEntryListMissingData(this: TransactionQueueContext, queueEntry: QueueEntry): string[] {
    if (queueEntry.hasAll === true) {
      return []
    }
    if (queueEntry.uniqueKeys == null) {
      throw new Error(`queueEntryListMissingData (queueEntry.uniqueKeys == null)`)
    }
    const missingAccounts = []
    for (const key of queueEntry.uniqueKeys) {
      // eslint-disable-next-line security/detect-object-injection
      if (queueEntry.collectedData[key] == null) {
        missingAccounts.push(key)
      }
    }

    return missingAccounts
  },

  /**
   * queueEntryRequestMissingData
   * ask other nodes for data that is missing for this TX.
   * normally other nodes in the network should foward data to us at the correct time.
   * This is only for the case that a TX has waited too long and not received the data it needs.
   * @param queueEntry
   */
  async queueEntryRequestMissingData(this: TransactionQueueContext, queueEntry: QueueEntry): Promise<void> {
    if (this.stateManager.currentCycleShardData == null) {
      return
    }

    if (queueEntry.pendingDataRequest === true) {
      return
    }
    queueEntry.pendingDataRequest = true

    nestedCountersInstance.countEvent('processing', 'queueEntryRequestMissingData-start')

    if (!queueEntry.requests) {
      queueEntry.requests = {}
    }
    if (queueEntry.uniqueKeys == null) {
      throw new Error('queueEntryRequestMissingData queueEntry.uniqueKeys == null')
    }

    const allKeys = []
    for (const key of queueEntry.uniqueKeys) {
      // eslint-disable-next-line security/detect-object-injection
      if (queueEntry.collectedData[key] == null) {
        allKeys.push(key)
      }
    }

    /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_queueEntryRequestMissingData_start', `${queueEntry.acceptedTx.txId}`, `qId: ${queueEntry.entryID} AccountsMissing:${utils.stringifyReduce(allKeys)}`)

    // consensus group should have all the data.. may need to correct this later
    //let consensusGroup = this.queueEntryGetConsensusGroup(queueEntry)
    //let consensusGroup = this.queueEntryGetTransactionGroup(queueEntry)

    for (const key of queueEntry.uniqueKeys) {
      // eslint-disable-next-line security/detect-object-injection
      if (queueEntry.collectedData[key] == null && queueEntry.requests[key] == null) {
        let keepTrying = true
        let triesLeft = 5
        // let triesLeft = Math.min(5, consensusGroup.length )
        // let nodeIndex = 0
        while (keepTrying) {
          if (triesLeft <= 0) {
            keepTrying = false
            break
          }
          triesLeft--
          // eslint-disable-next-line security/detect-object-injection
          const homeNodeShardData = queueEntry.homeNodes[key] // mark outstanding request somehow so we dont rerequest

          // let node = consensusGroup[nodeIndex]
          // nodeIndex++

          // find a random node to ask that is not us
          let node = null
          let randomIndex: number
          let foundValidNode = false
          let maxTries = 1000

          // todo make this non random!!!.  It would be better to build a list and work through each node in order and then be finished
          // we have other code that does this fine.
          while (foundValidNode == false) {
            maxTries--
            randomIndex = this.stateManager.getRandomInt(homeNodeShardData.consensusNodeForOurNodeFull.length - 1)
            // eslint-disable-next-line security/detect-object-injection
            node = homeNodeShardData.consensusNodeForOurNodeFull[randomIndex]
            if (maxTries < 0) {
              //FAILED
              this.statemanager_fatal(
                `queueEntryRequestMissingData`,
                `queueEntryRequestMissingData: unable to find node to ask after 1000 tries tx:${
                  queueEntry.logID
                } key: ${utils.makeShortHash(key)} ${utils.stringifyReduce(
                  homeNodeShardData.consensusNodeForOurNodeFull.map((x) => (x != null ? x.id : 'null'))
                )}`
              )
              break
            }
            if (node == null) {
              continue
            }
            if (node.id === this.stateManager.currentCycleShardData.nodeShardData.node.id) {
              continue
            }
            foundValidNode = true
          }

          if (node == null) {
            continue
          }
          if (node.status != 'active' || potentiallyRemoved.has(node.id)) {
            continue
          }
          if (node === this.stateManager.currentCycleShardData.ourNode) {
            continue
          }

          // Todo: expand this to grab a consensus node from any of the involved consensus nodes.

          for (const key2 of allKeys) {
            // eslint-disable-next-line security/detect-object-injection
            queueEntry.requests[key2] = node
          }

          const relationString = ShardFunctions.getNodeRelation(
            homeNodeShardData,
            this.stateManager.currentCycleShardData.ourNode.id
          )
          /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_queueEntryRequestMissingData_ask', `${queueEntry.logID}`, `r:${relationString}   asking: ${utils.makeShortHash(node.id)} qId: ${queueEntry.entryID} AccountsMissing:${utils.stringifyReduce(allKeys)}`)

          // Node Precheck!
          if (
            this.stateManager.isNodeValidForInternalMessage(node.id, 'queueEntryRequestMissingData', true, true) ===
            false
          ) {
            // if(this.tryNextDataSourceNode('queueEntryRequestMissingData') == false){
            //   break
            // }
            continue
          }

          const message = {
            keys: allKeys,
            txid: queueEntry.acceptedTx.txId,
            timestamp: queueEntry.acceptedTx.timestamp,
          }
          let result = null
          try {
            // if (this.config.p2p.useBinarySerializedEndpoints && this.config.p2p.requestStateForTxBinary) {
            // GOLD-66 Error handling try/catch happens one layer outside of this function in process transactions
            /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455101 ${shardusGetTime()} tx:${message.txid} ${NodeList.activeIdToPartition.get(Self.id)}-->>${NodeList.activeIdToPartition.get(node.id)}: ${'request_state_for_tx'}`)
            result = (await this.p2p.askBinary<RequestStateForTxReq, RequestStateForTxRespSerialized>(
              node,
              InternalRouteEnum.binary_request_state_for_tx,
              message,
              serializeRequestStateForTxReq,
              deserializeRequestStateForTxResp,
              {}
            )) as RequestStateForTxRespSerialized
            // } else {
            //   result = (await this.p2p.ask(node, 'request_state_for_tx', message)) as RequestStateForTxResp
            // }
          } catch (error) {
            /* prettier-ignore */ if (logFlags.error) {
              if (error instanceof ResponseError) {
                this.mainLogger.error(
                  `ASK FAIL request_state_for_tx : exception encountered where the error is ${error}`
                )
              }
            }
            /* prettier-ignore */ if (logFlags.error) this.mainLogger.error('askBinary request_state_for_tx exception:', error)

            /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`askBinary error: ${InternalRouteEnum.binary_request_state_for_tx} asked to ${node.externalIp}:${node.externalPort}:${node.id}`)
          }

          if (result == null) {
            if (logFlags.verbose) {
              if (logFlags.error) this.mainLogger.error('ASK FAIL request_state_for_tx')
            }
            /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_queueEntryRequestMissingData_askfailretry', `${queueEntry.logID}`, `r:${relationString}   asking: ${utils.makeShortHash(node.id)} qId: ${queueEntry.entryID} `)
            continue
          }
          if (result.success !== true) {
            if (logFlags.error) this.mainLogger.error('ASK FAIL queueEntryRequestMissingData 9')
            /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_queueEntryRequestMissingData_askfailretry2', `${queueEntry.logID}`, `r:${relationString}   asking: ${utils.makeShortHash(node.id)} qId: ${queueEntry.entryID} `)
            continue
          }

          let dataCountReturned = 0
          const accountIdsReturned = []
          for (const data of result.stateList) {
            this.queueEntryAddData(queueEntry, data)
            dataCountReturned++
            accountIdsReturned.push(utils.makeShortHash(data.accountId))
          }

          if (queueEntry.hasAll === true) {
            queueEntry.logstate = 'got all missing data'
          } else {
            queueEntry.logstate = 'failed to get data:' + queueEntry.hasAll
            //This will time out and go to reciept repair mode if it does not get more data sent to it.
          }

          /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_queueEntryRequestMissingData_result', `${queueEntry.logID}`, `r:${relationString}   result:${queueEntry.logstate} dataCount:${dataCountReturned} asking: ${utils.makeShortHash(node.id)} qId: ${queueEntry.entryID}  AccountsMissing:${utils.stringifyReduce(allKeys)} AccountsReturned:${utils.stringifyReduce(accountIdsReturned)}`)

          // queueEntry.homeNodes[key] = null
          for (const key2 of allKeys) {
            //consider deleteing these instead?
            //TSConversion changed to a delete opertaion should double check this
            //queueEntry.requests[key2] = null
            // eslint-disable-next-line security/detect-object-injection
            delete queueEntry.requests[key2]
          }

          if (queueEntry.hasAll === true) {
            break
          }

          keepTrying = false
        }
      }
    }

    if (queueEntry.hasAll === true) {
      nestedCountersInstance.countEvent('processing', 'queueEntryRequestMissingData-success')
    } else {
      nestedCountersInstance.countEvent('processing', 'queueEntryRequestMissingData-failed')

      //give up and wait for receipt
      queueEntry.waitForReceiptOnly = true

      if (this.config.stateManager.txStateMachineChanges) {
        this.updateTxState(queueEntry, 'await final data', 'missing data')
      } else {
        this.updateTxState(queueEntry, 'consensing')
      }

      if (logFlags.debug)
        this.mainLogger.debug(`queueEntryRequestMissingData failed to get all data for: ${queueEntry.logID}`)
    }
  },

  /**
   * queueEntryRequestMissingReceipt
   * Ask other nodes for a receipt to go with this TX
   * @param queueEntry
   */
  async queueEntryRequestMissingReceipt(this: TransactionQueueContext, queueEntry: QueueEntry): Promise<void> {
    if (this.stateManager.currentCycleShardData == null) {
      return
    }

    if (queueEntry.uniqueKeys == null) {
      throw new Error('queueEntryRequestMissingReceipt queueEntry.uniqueKeys == null')
    }

    if (queueEntry.requestingReceipt === true) {
      return
    }

    queueEntry.requestingReceipt = true
    queueEntry.receiptEverRequested = true

    /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_queueEntryRequestMissingReceipt_start', `${queueEntry.acceptedTx.txId}`, `qId: ${queueEntry.entryID}`)

    const consensusGroup = this.queueEntryGetConsensusGroup(queueEntry)

    this.stateManager.debugNodeGroup(
      queueEntry.acceptedTx.txId,
      queueEntry.acceptedTx.timestamp,
      `queueEntryRequestMissingReceipt`,
      consensusGroup
    )
    //let consensusGroup = this.queueEntryGetTransactionGroup(queueEntry)
    //the outer loop here could just use the transaction group of nodes instead. but already had this working in a similar function
    //TODO change it to loop the transaction group untill we get a good receipt

    //Note: we only need to get one good receipt, the loop on keys is in case we have to try different groups of nodes
    let gotReceipt = false
    for (const key of queueEntry.uniqueKeys) {
      if (gotReceipt === true) {
        break
      }

      let keepTrying = true
      let triesLeft = Math.min(5, consensusGroup.length)
      let nodeIndex = 0
      while (keepTrying) {
        if (triesLeft <= 0) {
          keepTrying = false
          break
        }
        triesLeft--
        // eslint-disable-next-line security/detect-object-injection
        const homeNodeShardData = queueEntry.homeNodes[key] // mark outstanding request somehow so we dont rerequest

        // eslint-disable-next-line security/detect-object-injection
        const node = consensusGroup[nodeIndex]
        nodeIndex++

        if (node == null) {
          continue
        }
        if (node.status != 'active' || potentiallyRemoved.has(node.id)) {
          continue
        }
        if (node === this.stateManager.currentCycleShardData.ourNode) {
          continue
        }

        const relationString = ShardFunctions.getNodeRelation(
          homeNodeShardData,
          this.stateManager.currentCycleShardData.ourNode.id
        )
        /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_queueEntryRequestMissingReceipt_ask', `${queueEntry.logID}`, `r:${relationString}   asking: ${utils.makeShortHash(node.id)} qId: ${queueEntry.entryID} `)

        // Node Precheck!
        if (
          this.stateManager.isNodeValidForInternalMessage(node.id, 'queueEntryRequestMissingReceipt', true, true) ===
          false
        ) {
          // if(this.tryNextDataSourceNode('queueEntryRequestMissingReceipt') == false){
          //   break
          // }
          continue
        }

        const message = { txid: queueEntry.acceptedTx.txId, timestamp: queueEntry.acceptedTx.timestamp }
        let result = null
        // GOLD-67 to be safe this function needs a try/catch block to prevent a timeout from causing an unhandled exception
        // if (
        //   this.stateManager.config.p2p.useBinarySerializedEndpoints &&
        //   this.stateManager.config.p2p.requestReceiptForTxBinary
        // ) {
        try {
          /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455101 ${shardusGetTime()} tx:${message.txid} ${NodeList.activeIdToPartition.get(Self.id)}-->>${NodeList.activeIdToPartition.get(node.id)}: ${'request_receipt_for_tx'}`)
          result = await this.p2p.askBinary<RequestReceiptForTxReqSerialized, RequestReceiptForTxRespSerialized>(
            node,
            InternalRouteEnum.binary_request_receipt_for_tx,
            message,
            serializeRequestReceiptForTxReq,
            deserializeRequestReceiptForTxResp,
            {}
          )
        } catch (e) {
          this.statemanager_fatal(`queueEntryRequestMissingReceipt`, `error: ${e.message}`)
          /* prettier-ignore */ this.mainLogger.error(`askBinary error: ${InternalRouteEnum.binary_request_receipt_for_tx} asked to ${node.externalIp}:${node.externalPort}:${node.id}`)
        }
        // } else {
        //   result = await this.p2p.ask(node, 'request_receipt_for_tx', message) // not sure if we should await this.
        // }

        if (result == null) {
          if (logFlags.verbose) {
            /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`ASK FAIL request_receipt_for_tx ${triesLeft} ${utils.makeShortHash(node.id)}`)
          }
          /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_queueEntryRequestMissingReceipt_askfailretry', `${queueEntry.logID}`, `r:${relationString}   asking: ${utils.makeShortHash(node.id)} qId: ${queueEntry.entryID} `)
          continue
        }
        if (result.success !== true) {
          /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`ASK FAIL queueEntryRequestMissingReceipt 9 ${triesLeft} ${utils.makeShortHash(node.id)}:${utils.makeShortHash(node.internalPort)} note:${result.note} txid:${queueEntry.logID}`)
          continue
        }

        /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_queueEntryRequestMissingReceipt_result', `${queueEntry.logID}`, `r:${relationString}   result:${queueEntry.logstate} asking: ${utils.makeShortHash(node.id)} qId: ${queueEntry.entryID} result: ${utils.stringifyReduce(result)}`)

        if (result.success === true && result.receipt != null) {
          //TODO implement this!!!
          queueEntry.receivedSignedReceipt = result.receipt
          keepTrying = false
          gotReceipt = true

          this.mainLogger.debug(
            `queueEntryRequestMissingReceipt got good receipt for: ${queueEntry.logID} from: ${utils.makeShortHash(
              node.id
            )}:${utils.makeShortHash(node.internalPort)}`
          )
        }
      }

      // break the outer loop after we are done trying.  todo refactor this.
      if (keepTrying == false) {
        break
      }
    }
    queueEntry.requestingReceipt = false

    if (gotReceipt === false) {
      queueEntry.requestingReceiptFailed = true
    }
  }

  /**
     * queueEntryGetTransactionGroup
     * @param {QueueEntry} queueEntry
     * @returns {Node[]}
     */
    queueEntryGetTransactionGroup(this: TransactionQueueContext, queueEntry: QueueEntry, tryUpdate = false): Shardus.Node[] {
      let cycleShardData = this.stateManager.currentCycleShardData
      if (Context.config.stateManager.deterministicTXCycleEnabled) {
        cycleShardData = this.stateManager.shardValuesByCycle.get(queueEntry.txGroupCycle)
      }
      if (cycleShardData == null) {
        throw new Error('queueEntryGetTransactionGroup: currentCycleShardData == null')
      }
      if (queueEntry.uniqueKeys == null) {
        throw new Error('queueEntryGetTransactionGroup: queueEntry.uniqueKeys == null')
      }
      if (queueEntry.transactionGroup != null && tryUpdate != true) {
        return queueEntry.transactionGroup
      }
  
      const txGroup: Shardus.Node[] = []
      const uniqueNodes: StringNodeObjectMap = {}
  
      let hasNonGlobalKeys = false
      for (const key of queueEntry.uniqueKeys) {
        // eslint-disable-next-line security/detect-object-injection
        const homeNode = queueEntry.homeNodes[key]
        // txGroup = Array.concat(txGroup, homeNode.nodeThatStoreOurParitionFull)
        if (homeNode == null) {
          if (logFlags.verbose) this.mainLogger.debug('queueEntryGetTransactionGroup homenode:null')
        }
        if (homeNode.extendedData === false) {
          ShardFunctions.computeExtendedNodePartitionData(
            cycleShardData.shardGlobals,
            cycleShardData.nodeShardDataMap,
            cycleShardData.parititionShardDataMap,
            homeNode,
            cycleShardData.nodes
          )
        }
  
        //may need to go back and sync this logic with how we decide what partition to save a record in.
  
        // If this is not a global TX then skip tracking of nodes for global accounts used as a reference.
        if (queueEntry.globalModification === false) {
          if (this.stateManager.accountGlobals.isGlobalAccount(key) === true) {
            /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`queueEntryGetTransactionGroup skipping: ${utils.makeShortHash(key)} tx: ${queueEntry.logID}`)
            continue
          } else {
            hasNonGlobalKeys = true
          }
        }
  
        for (const node of homeNode.nodeThatStoreOurParitionFull) {
          // not iterable!
          uniqueNodes[node.id] = node
          if (node.id === Self.id)
            if (logFlags.verbose)
              /* prettier-ignore */ this.mainLogger.debug(`queueEntryGetTransactionGroup tx ${queueEntry.logID} our node coverage key ${key}`)
        }
  
        const scratch1 = {}
        for (const node of homeNode.nodeThatStoreOurParitionFull) {
          // not iterable!
          scratch1[node.id] = true
        }
        // make sure the home node is in there in case we hit and edge case
        uniqueNodes[homeNode.node.id] = homeNode.node
  
        // TODO STATESHARDING4 is this next block even needed:
        // HOMENODEMATHS need to patch in nodes that would cover this partition!
        // TODO PERF make an optimized version of this in ShardFunctions that is smarter about which node range to check and saves off the calculation
        // TODO PERF Update.  this will scale badly with 100s or 1000s of nodes. need a faster solution that can use the list of accounts to
        //                    build a list of nodes.
        // maybe this could go on the partitions.
        const { homePartition } = ShardFunctions.addressToPartition(cycleShardData.shardGlobals, key)
        if (homePartition != homeNode.homePartition) {
          //loop all nodes for now
          for (const nodeID of cycleShardData.nodeShardDataMap.keys()) {
            const nodeShardData: StateManagerTypes.shardFunctionTypes.NodeShardData =
              cycleShardData.nodeShardDataMap.get(nodeID)
            const nodeStoresThisPartition = ShardFunctions.testInRange(homePartition, nodeShardData.storedPartitions)
            /* eslint-disable security/detect-object-injection */
            if (nodeStoresThisPartition === true && uniqueNodes[nodeID] == null) {
              //setting this will cause it to end up in the transactionGroup
              uniqueNodes[nodeID] = nodeShardData.node
              queueEntry.patchedOnNodes.set(nodeID, nodeShardData)
            }
            // build index for patched nodes based on the home node:
            if (nodeStoresThisPartition === true) {
              if (scratch1[nodeID] == null) {
                homeNode.patchedOnNodes.push(nodeShardData.node)
                scratch1[nodeID] = true
              }
            }
            /* eslint-enable security/detect-object-injection */
          }
        }
  
        //todo refactor this to where we insert the tx
        if (queueEntry.globalModification === false && this.executeInOneShard && key === queueEntry.executionShardKey) {
          //queueEntry.executionGroup = homeNode.consensusNodeForOurNodeFull.slice()
          const executionKeys = []
          if (logFlags.verbose) {
            for (const node of queueEntry.executionGroup) {
              executionKeys.push(utils.makeShortHash(node.id) + `:${node.externalPort}`)
            }
          }
          /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`queueEntryGetTransactionGroup executeInOneShard ${queueEntry.logID} isInExecutionHome:${queueEntry.isInExecutionHome} executionGroup:${Utils.safeStringify(executionKeys)}`)
          /* prettier-ignore */ if (logFlags.playback && logFlags.verbose) this.logger.playbackLogNote('queueEntryGetTransactionGroup', `queueEntryGetTransactionGroup executeInOneShard ${queueEntry.logID} isInExecutionHome:${queueEntry.isInExecutionHome} executionGroup:${Utils.safeStringify(executionKeys)}`)
        }
  
        // if(queueEntry.globalModification === false && this.executeInOneShard && key === queueEntry.executionShardKey){
        //   let ourNodeShardData: StateManagerTypes.shardFunctionTypes.NodeShardData = this.stateManager.currentCycleShardData.nodeShardData
        //   let nodeStoresThisPartition = ShardFunctions.testInRange(homePartition, ourNodeShardData.storedPartitions)
        //   if(nodeStoresThisPartition === false){
        //     queueEntry.isInExecutionHome = false
        //     queueEntry.waitForReceiptOnly = true
        //   }
        //   /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`queueEntryGetTransactionGroup ${queueEntry.logID} isInExecutionHome:${queueEntry.isInExecutionHome} waitForReceiptOnly:${queueEntry.waitForReceiptOnly}`)
        //   /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('queueEntryGetTransactionGroup', `queueEntryGetTransactionGroup ${queueEntry.logID} isInExecutionHome:${queueEntry.isInExecutionHome} waitForReceiptOnly:${queueEntry.waitForReceiptOnly}`)
        // }
      }
      queueEntry.ourNodeInTransactionGroup = true
      if (uniqueNodes[cycleShardData.ourNode.id] == null) {
        queueEntry.ourNodeInTransactionGroup = false
        /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`queueEntryGetTransactionGroup not involved: hasNonG:${hasNonGlobalKeys} tx ${queueEntry.logID}`)
      }
      if (queueEntry.ourNodeInTransactionGroup)
        if (logFlags.seqdiagram)
          /* prettier-ignore */ this.seqLogger.info(`0x53455105 ${shardusGetTime()} tx:${queueEntry.acceptedTx.txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: targetgroup`)
  
      // make sure our node is included: needed for gossip! - although we may not care about the data!
      // This may seem confusing, but to gossip to other nodes, we have to have our node in the list we will gossip to
      // Other logic will use queueEntry.ourNodeInTransactionGroup to know what else to do with the queue entry
      uniqueNodes[cycleShardData.ourNode.id] = cycleShardData.ourNode
  
      const values = Object.values(uniqueNodes)
      for (const v of values) {
        txGroup.push(v)
      }
  
      txGroup.sort(this.stateManager._sortByIdAsc)
      if (queueEntry.ourNodeInTransactionGroup) {
        const ourID = cycleShardData.ourNode.id
        for (let idx = 0; idx < txGroup.length; idx++) {
          // eslint-disable-next-line security/detect-object-injection
          const node = txGroup[idx]
          if (node.id === ourID) {
            queueEntry.ourTXGroupIndex = idx
            break
          }
        }
      }
      if (tryUpdate != true) {
        if (Context.config.stateManager.deterministicTXCycleEnabled === false) {
          queueEntry.txGroupCycle = this.stateManager.currentCycleShardData.cycleNumber
        }
        queueEntry.transactionGroup = txGroup
      } else {
        queueEntry.updatedTxGroupCycle = this.stateManager.currentCycleShardData.cycleNumber
        queueEntry.transactionGroup = txGroup
      }
  
      // let uniqueNodes = {}
      // for (let n of gossipGroup) {
      //   uniqueNodes[n.id] = n
      // }
      // for (let n of updatedGroup) {
      //   uniqueNodes[n.id] = n
      // }
      // let values = Object.values(uniqueNodes)
      // let finalGossipGroup =
      // for (let n of updatedGroup) {
      //   uniqueNodes[n.id] = n
      // }
  
      return txGroup
    }
  
    /**
     * queueEntryGetConsensusGroup
     * Gets a merged results of all the consensus nodes for all of the accounts involved in the transaction
     * Ignores global accounts if globalModification == false and the account is global
     * @param {QueueEntry} queueEntry
     * @returns {Node[]}
     */
    queueEntryGetConsensusGroup(this: TransactionQueueContext, queueEntry: QueueEntry): Shardus.Node[] {
      let cycleShardData = this.stateManager.currentCycleShardData
      if (Context.config.stateManager.deterministicTXCycleEnabled) {
        cycleShardData = this.stateManager.shardValuesByCycle.get(queueEntry.txGroupCycle)
      }
      if (cycleShardData == null) {
        throw new Error('queueEntryGetConsensusGroup: currentCycleShardData == null')
      }
      if (queueEntry.uniqueKeys == null) {
        throw new Error('queueEntryGetConsensusGroup: queueEntry.uniqueKeys == null')
      }
      if (queueEntry.conensusGroup != null) {
        return queueEntry.conensusGroup
      }
      const txGroup = []
      const uniqueNodes: StringNodeObjectMap = {}
  
      let hasNonGlobalKeys = false
      for (const key of queueEntry.uniqueKeys) {
        // eslint-disable-next-line security/detect-object-injection
        const homeNode = queueEntry.homeNodes[key]
        if (homeNode == null) {
          if (logFlags.verbose) this.mainLogger.debug('queueEntryGetConsensusGroup homenode:null')
        }
        if (homeNode.extendedData === false) {
          ShardFunctions.computeExtendedNodePartitionData(
            cycleShardData.shardGlobals,
            cycleShardData.nodeShardDataMap,
            cycleShardData.parititionShardDataMap,
            homeNode,
            cycleShardData.nodes
          )
        }
  
        // TODO STATESHARDING4 GLOBALACCOUNTS is this next block of logic needed?
        // If this is not a global TX then skip tracking of nodes for global accounts used as a reference.
        if (queueEntry.globalModification === false) {
          if (this.stateManager.accountGlobals.isGlobalAccount(key) === true) {
            /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`queueEntryGetConsensusGroup skipping: ${utils.makeShortHash(key)} tx: ${queueEntry.logID}`)
            continue
          } else {
            hasNonGlobalKeys = true
          }
        }
  
        for (const node of homeNode.consensusNodeForOurNodeFull) {
          uniqueNodes[node.id] = node
        }
  
        // make sure the home node is in there in case we hit and edge case
        uniqueNodes[homeNode.node.id] = homeNode.node
      }
      queueEntry.ourNodeInConsensusGroup = true
      if (uniqueNodes[cycleShardData.ourNode.id] == null) {
        queueEntry.ourNodeInConsensusGroup = false
        /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`queueEntryGetConsensusGroup not involved: hasNonG:${hasNonGlobalKeys} tx ${queueEntry.logID}`)
      }
  
      // make sure our node is included: needed for gossip! - although we may not care about the data!
      uniqueNodes[cycleShardData.ourNode.id] = cycleShardData.ourNode
  
      const values = Object.values(uniqueNodes)
      for (const v of values) {
        txGroup.push(v)
      }
      queueEntry.conensusGroup = txGroup
      return txGroup
    }
  
    /**
     * queueEntryGetConsensusGroupForAccount
     * Gets a merged results of all the consensus nodes for a specific account involved in the transaction
     * Ignores global accounts if globalModification == false and the account is global
     * @param {QueueEntry} queueEntry
     * @returns {Node[]}
     */
    queueEntryGetConsensusGroupForAccount(this: TransactionQueueContext, queueEntry: QueueEntry, accountId: string): Shardus.Node[] {
      let cycleShardData = this.stateManager.currentCycleShardData
      if (Context.config.stateManager.deterministicTXCycleEnabled) {
        cycleShardData = this.stateManager.shardValuesByCycle.get(queueEntry.txGroupCycle)
      }
      if (cycleShardData == null) {
        throw new Error('queueEntryGetConsensusGroup: currentCycleShardData == null')
      }
      if (queueEntry.uniqueKeys == null) {
        throw new Error('queueEntryGetConsensusGroup: queueEntry.uniqueKeys == null')
      }
      if (queueEntry.conensusGroup != null) {
        return queueEntry.conensusGroup
      }
      if (queueEntry.uniqueKeys.includes(accountId) === false) {
        throw new Error(`queueEntryGetConsensusGroup: account ${accountId} is not in the queueEntry.uniqueKeys`)
      }
      const txGroup = []
      const uniqueNodes: StringNodeObjectMap = {}
  
      let hasNonGlobalKeys = false
      const key = accountId
      // eslint-disable-next-line security/detect-object-injection
      const homeNode = queueEntry.homeNodes[key]
      if (homeNode == null) {
        if (logFlags.verbose) this.mainLogger.debug('queueEntryGetConsensusGroup homenode:null')
      }
      if (homeNode.extendedData === false) {
        ShardFunctions.computeExtendedNodePartitionData(
          cycleShardData.shardGlobals,
          cycleShardData.nodeShardDataMap,
          cycleShardData.parititionShardDataMap,
          homeNode,
          cycleShardData.nodes
        )
      }
  
      // TODO STATESHARDING4 GLOBALACCOUNTS is this next block of logic needed?
      // If this is not a global TX then skip tracking of nodes for global accounts used as a reference.
      if (queueEntry.globalModification === false) {
        if (this.stateManager.accountGlobals.isGlobalAccount(key) === true) {
          /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`queueEntryGetConsensusGroup skipping: ${utils.makeShortHash(key)} tx: ${queueEntry.logID}`)
        } else {
          hasNonGlobalKeys = true
        }
      }
  
      for (const node of homeNode.consensusNodeForOurNodeFull) {
        uniqueNodes[node.id] = node
      }
  
      // make sure the home node is in there in case we hit and edge case
      uniqueNodes[homeNode.node.id] = homeNode.node
      queueEntry.ourNodeInConsensusGroup = true
      if (uniqueNodes[cycleShardData.ourNode.id] == null) {
        queueEntry.ourNodeInConsensusGroup = false
        /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`queueEntryGetConsensusGroup not involved: hasNonG:${hasNonGlobalKeys} tx ${queueEntry.logID}`)
      }
  
      // make sure our node is included: needed for gossip! - although we may not care about the data!
      uniqueNodes[cycleShardData.ourNode.id] = cycleShardData.ourNode
  
      const values = Object.values(uniqueNodes)
      for (const v of values) {
        txGroup.push(v)
      }
      return txGroup
    }

    /**
       * removeFromQueue remove an item from the queue and place it in the archivedQueueEntries list for awhile in case we have to access it again
       * @param {QueueEntry} queueEntry
       * @param {number} currentIndex
       */
      removeFromQueue(this: TransactionQueueContext, queueEntry: QueueEntry, currentIndex: number, archive = true): void {
        // end all the pending txDebug timers
        /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455104 ${shardusGetTime()} tx:${queueEntry.acceptedTx.txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: removed`)
        for (const key in queueEntry.txDebug.startTime) {
          if (queueEntry.txDebug.startTime[key] != null) {
            this.txDebugMarkEndTime(queueEntry, key)
          }
        }
        // this.txDebugMarkEndTime(queueEntry, 'total_queue_time')
        this.stateManager.eventEmitter.emit('txPopped', queueEntry.acceptedTx.txId)
        if (queueEntry.txDebug) this.dumpTxDebugToStatList(queueEntry)
        this._transactionQueue.splice(currentIndex, 1)
        this._transactionQueueByID.delete(queueEntry.acceptedTx.txId)
    
        if (archive === false) {
          if (logFlags.debug) this.mainLogger.debug(`removeFromQueue: ${queueEntry.logID} done. No archive`)
          return
        }
    
        queueEntry.archived = true
        //compact the queue entry before we push it!
        queueEntry.ourVote = null
        queueEntry.collectedVotes = null
    
        // coalesce the receipts into applied receipt. maybe not as descriptive, but save memory.
        queueEntry.appliedReceipt =
          queueEntry.appliedReceipt ??
          queueEntry.recievedAppliedReceipt ??
          queueEntry.appliedReceiptForRepair ??
          queueEntry.appliedReceiptFinal
        queueEntry.recievedAppliedReceipt = null
        queueEntry.appliedReceiptForRepair = null
        queueEntry.appliedReceiptFinal = queueEntry.appliedReceipt
    
        delete queueEntry.recievedAppliedReceipt
        delete queueEntry.appliedReceiptForRepair
    
        // coalesce the receipt2s into applied receipt. maybe not as descriptive, but save memory.
        queueEntry.recievedAppliedReceipt2 = null
        queueEntry.appliedReceiptForRepair2 = null
    
        delete queueEntry.recievedAppliedReceipt2
        delete queueEntry.appliedReceiptForRepair2
    
        queueEntry.signedReceipt =
          queueEntry.signedReceipt ??
          queueEntry.receivedSignedReceipt ??
          queueEntry.signedReceiptForRepair ??
          queueEntry.signedReceiptFinal
        queueEntry.receivedSignedReceipt = null
        queueEntry.signedReceiptForRepair = null
        queueEntry.signedReceiptFinal = queueEntry.signedReceipt
    
        delete queueEntry.receivedSignedReceipt
        delete queueEntry.signedReceiptForRepair
    
        //delete queueEntry.appliedReceiptFinal
    
        //delete queueEntry.preApplyTXResult //turn this off for now, until we can do some refactor of queueEntry.preApplyTXResult.applyResponse
    
        this.archivedQueueEntries.push(queueEntry)
    
        this.archivedQueueEntriesByID.set(queueEntry.acceptedTx.txId, queueEntry)
        // period cleanup will usually get rid of these sooner if the list fills up
        if (this.archivedQueueEntries.length > this.archivedQueueEntryMaxCount) {
          this.archivedQueueEntriesByID.delete(this.archivedQueueEntries[0].acceptedTx.txId)
          this.archivedQueueEntries.shift()
        }
        if (logFlags.debug) this.mainLogger.debug(`removeFromQueue: ${queueEntry.logID} and added to archive done`)
      }
}