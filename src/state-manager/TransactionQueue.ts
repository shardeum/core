// Original Imports (keep all of them)
import * as Context from '../p2p/Context'
import { P2P as P2PTypes, StateManager as StateManagerTypes } from '@shardeum-foundation/lib-types'
import StateManager from '.'
import Crypto from '../crypto'
import Logger, { logFlags } from '../logger'
import * as Apoptosis from '../p2p/Apoptosis'
import * as Archivers from '../p2p/Archivers'
import { P2PModuleContext as P2P, network as networkContext, config as configContext } from '../p2p/Context'
import * as CycleChain from '../p2p/CycleChain'
import { nodes, byPubKey, potentiallyRemoved, activeByIdOrder } from '../p2p/NodeList'
import * as Shardus from '../shardus/shardus-types'
import Storage from '../storage'
import * as utils from '../utils'
import { getCorrespondingNodes, verifyCorrespondingSender } from '../utils/fastAggregatedCorrespondingTell'
import {Signature, SignedObject} from '@shardeum-foundation/lib-crypto-utils'
import {
  errorToStringFull,
  inRangeOfCurrentTime,
  withTimeout,
  XOR,
} from '../utils'
import { Utils } from '@shardeum-foundation/lib-types'
import * as Self from '../p2p/Self'
import * as Comms from '../p2p/Comms'
import { nestedCountersInstance } from '../utils/nestedCounters'
import Profiler, { cUninitializedSize, profilerInstance } from '../utils/profiler'
import ShardFunctions from './shardFunctions'
import * as NodeList from '../p2p/NodeList'
import {
  AcceptedTx,
  AccountFilter,
  CommitConsensedTransactionResult,
  PreApplyAcceptedTransactionResult,
  ProcessQueueStats,
  QueueCountsResult,
  QueueEntry,
  RequestReceiptForTxResp_old,
  RequestStateForTxReq,
  RequestStateForTxResp,
  SeenAccounts,
  SimpleNumberStats,
  StringBoolObjectMap,
  StringNodeObjectMap,
  TxDebug,
  WrappedResponses,
  ArchiverReceipt,
  NonceQueueItem,
  SignedReceipt,
  Proposal,
  RequestFinalDataResp
} from './state-manager-types'
import { isInternalTxAllowed, networkMode } from '../p2p/Modes'
import { Node } from '@shardeum-foundation/lib-types/build/src/p2p/NodeListTypes'
import { Logger as L4jsLogger } from 'log4js'
import { getNetworkTimeOffset, ipInfo, shardusGetTime } from '../network'
import { InternalBinaryHandler } from '../types/Handler'
import {
  BroadcastStateReq,
  deserializeBroadcastStateReq,
  serializeBroadcastStateReq,
} from '../types/BroadcastStateReq'
import {
  getStreamWithTypeCheck,
  requestErrorHandler,
  verificationDataCombiner,
  verificationDataSplitter,
} from '../types/Helpers'
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum'
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum'
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum'
import {
  BroadcastFinalStateReq,
  deserializeBroadcastFinalStateReq,
  serializeBroadcastFinalStateReq,
} from '../types/BroadcastFinalStateReq'
import { verifyPayload } from '../types/ajv/Helpers'
import {
  SpreadTxToGroupSyncingReq,
  deserializeSpreadTxToGroupSyncingReq,
  serializeSpreadTxToGroupSyncingReq,
} from '../types/SpreadTxToGroupSyncingReq'
import { RequestTxAndStateReq, serializeRequestTxAndStateReq } from '../types/RequestTxAndStateReq'
import { RequestTxAndStateResp, deserializeRequestTxAndStateResp } from '../types/RequestTxAndStateResp'
import { deserializeRequestStateForTxReq, serializeRequestStateForTxReq } from '../types/RequestStateForTxReq'
import {
  deserializeRequestStateForTxResp,
  RequestStateForTxRespSerialized,
  serializeRequestStateForTxResp,
} from '../types/RequestStateForTxResp'
import {
  deserializeRequestReceiptForTxResp,
  RequestReceiptForTxRespSerialized,
} from '../types/RequestReceiptForTxResp'
import {
  RequestReceiptForTxReqSerialized,
  serializeRequestReceiptForTxReq,
} from '../types/RequestReceiptForTxReq'
import { isNodeInRotationBounds } from '../p2p/Utils'
import { BadRequest, ResponseError, serializeResponseError } from '../types/ResponseError'
import { error } from 'console'
import { PoqoDataAndReceiptReq, serializePoqoDataAndReceiptReq } from '../types/PoqoDataAndReceiptReq'
import { AJVSchemaEnum } from '../types/enum/AJVSchemaEnum'
import { getGlobalTxReceipt } from '../p2p/GlobalAccounts'

// New imports for split logic
import {
  _processTransactionsLogic,
  _setTXExpiredLogic,
  _setTxAlmostExpiredLogic,
  _updateTxStateLogic,
  _txDebugMarkStartTimeLogic,
  _txDebugMarkEndTimeLogic,
  _processQueue_accountSeenLogic,
  _processQueue_getUpstreamTxLogic,
  _processQueue_markAccountsSeenLogic,
  _processQueue_clearAccountsSeenLogic,
  _processQueue_debugAccountDataLogic,
  _processQueue_accountSeen2Logic,
  _processQueue_markAccountsSeen2Logic,
} from './transactionQueue.process'
import { _setupHandlersLogic } from './transactionQueue.handlers'
import {
  _getAccountsStateHashLogic,
  _preApplyTransactionLogic,
  _commitConsensedTransactionLogic,
  _routeAndQueueAcceptedTransactionLogic,
  _queueEntryRequestMissingDataLogic,
  _queueEntryRequestMissingReceiptLogic,
  _computeTxSieveTimeLogic,
  _getArchiverReceiptFromQueueEntryLogic,
  _requestFinalDataLogic,
  _requestInitialDataLogic
} from './transactionQueue.core'
import {
  _tellCorrespondingNodesLogic,
  _factTellCorrespondingNodesLogic,
  _validateCorrespondingTellSenderLogic,
  _factValidateCorrespondingTellSenderLogic,
  _getStartAndEndIndexOfTargetGroupLogic,
  _broadcastStateLogic,
  _factTellCorrespondingNodesFinalDataLogic,
  _factValidateCorrespondingTellFinalDataSenderLogic,
} from './transactionQueue.corresponding'
import {
  _dumpTxDebugToStatListLogic,
  _clearTxDebugStatListLogic,
  _printTxDebugByTxIdLogic,
  _printTxDebugLogic,
  _checkForStuckProcessingLogic,
  _onProcesssingQueueStuckLogic,
  _getDebugProccessingStatusLogic,
  _clearStuckProcessingDebugVarsLogic,
  _fixStuckProcessingLogic,
  _setDebugLastAwaitedCallLogic,
  _setDebugLastAwaitedCallInnerLogic,
  _setDebugSetLastAppAwaitLogic,
  _clearDebugAwaitStringsLogic,
  _getDebugQueueInfoLogic,
  _getQueueItemsLogic,
  _getQueueItemByIdLogic,
  _clearQueueItemsLogic,
  _removeTxFromArchivedQueueLogic,
  _getDebugStuckTxsLogic,
  _getQueueLengthBucketsLogic,
} from './transactionQueue.debug'


interface Receipt {
  tx: AcceptedTx
}

const txStatBucketSize = {
  default: [
    1, 2, 4, 8, 16, 30, 60, 125, 250, 500, 1000, 2000, 4000, 8000, 10000, 20000, 30000, 60000, 100000,
  ],
}

export enum DebugComplete {
  Incomplete = 0,
  Completed = 1,
}

class TransactionQueue {
  app: Shardus.App
  crypto: Crypto
  config: Shardus.StrictServerConfiguration
  profiler: Profiler

  logger: Logger
  p2p: P2P
  storage: Storage
  stateManager: StateManager

  mainLogger: L4jsLogger
  seqLogger: L4jsLogger
  fatalLogger: L4jsLogger
  shardLogger: L4jsLogger
  statsLogger: L4jsLogger
  statemanager_fatal: (key: string, log: string) => void

  _transactionQueue: QueueEntry[] //old name: newAcceptedTxQueue
  pendingTransactionQueue: QueueEntry[] //old name: newAcceptedTxQueueTempInjest
  archivedQueueEntries: QueueEntry[]
  txDebugStatList: utils.FIFOCache<string, TxDebug>

  _transactionQueueByID: Map<string, QueueEntry> //old name: newAcceptedTxQueueByID
  pendingTransactionQueueByID: Map<string, QueueEntry> //old name: newAcceptedTxQueueTempInjestByID
  archivedQueueEntriesByID: Map<string, QueueEntry>
  receiptsToForward: ArchiverReceipt[]
  forwardedReceiptsByTimestamp: Map<number, ArchiverReceipt>
  receiptsBundleByInterval: Map<number, ArchiverReceipt[]>
  receiptsForwardedTimestamp: number

  queueStopped: boolean
  queueEntryCounter: number
  queueRestartCounter: number

  archivedQueueEntryMaxCount: number
  transactionProcessingQueueRunning: boolean //archivedQueueEntryMaxCount is a maximum amount of queue entries to store, usually we should never have this many stored since tx age will be used to clean up the list

  processingLastRunTime: number
  processingMinRunBreak: number
  transactionQueueHasRemainingWork: boolean

  executeInOneShard: boolean
  useNewPOQ: boolean
  usePOQo: boolean

  txCoverageMap: { [key: symbol]: unknown }

  /** This is a set of updates to rework how TXs can time out in the queue.  After a enough testing this should become the default and we can remove the old code */
  queueTimingFixes: boolean

  /** process loop stats.  This map contains the latest and the last of each time overage category */
  lastProcessStats: { [limitName: string]: ProcessQueueStats }

  largePendingQueueReported: boolean

  queueReads: Set<string>
  queueWrites: Set<string>
  queueReadWritesOld: Set<string>

  /** is the processing queue currently considered stuck */
  isStuckProcessing: boolean
  /** this s how many times the processing queue has transitioned from unstuck to stuck */
  stuckProcessingCount: number
  /** this is how many cycles processing is stuck becuase it has not run recently  */
  stuckProcessingCyclesCount: number
  /** this is how many cycles processing is stuck and we can confirm the queue did not finish  */
  stuckProcessingQueueLockedCyclesCount: number

  /** these three strings help us have a trail if the processing queue becomes stuck */
  debugLastAwaitedCall: string
  debugLastAwaitedCallInner: string
  debugLastAwaitedAppCall: string

  debugLastAwaitedCallInnerStack: { [key: string]: number }
  debugLastAwaitedAppCallStack: { [key: string]: number }

  debugLastProcessingQueueStartTime: number

  debugRecentQueueEntry: QueueEntry
  nonceQueue: Map<string, NonceQueueItem[]>

  constructor(
    stateManager: StateManager,
    profiler: Profiler,
    app: Shardus.App,
    logger: Logger,
    storage: Storage,
    p2p: P2P,
    crypto: Crypto,
    config: Shardus.StrictServerConfiguration,
  ) {
    this.crypto = crypto
    this.app = app
    this.logger = logger
    this.config = config
    this.profiler = profiler
    this.p2p = p2p
    this.storage = storage
    this.stateManager = stateManager
    this.useNewPOQ = this.config.stateManager.useNewPOQ
    this.usePOQo = this.config.stateManager.usePOQo

    this.mainLogger = logger.getLogger('main')
    this.seqLogger = logger.getLogger('seq')
    this.fatalLogger = logger.getLogger('fatal')
    this.shardLogger = logger.getLogger('shardDump')
    this.statsLogger = logger.getLogger('statsDump')
    this.statemanager_fatal = stateManager.statemanager_fatal

    this.queueStopped = false
    this.queueEntryCounter = 0
    this.queueRestartCounter = 0

    this._transactionQueue = []
    this.pendingTransactionQueue = []
    this.archivedQueueEntries = []
    this.nonceQueue = new Map()
    this.txDebugStatList = new utils.FIFOCache<string, TxDebug>(this.config.debug.debugStatListMaxSize)
    this.receiptsToForward = []
    this.forwardedReceiptsByTimestamp = new Map()
    this.receiptsBundleByInterval = new Map()
    this.receiptsForwardedTimestamp = shardusGetTime()

    this._transactionQueueByID = new Map()
    this.pendingTransactionQueueByID = new Map()
    this.archivedQueueEntriesByID = new Map()

    this.archivedQueueEntryMaxCount = 5000 // was 50000 but this too high
    // 10k will fit into memory and should persist long enough at desired loads
    this.transactionProcessingQueueRunning = false

    this.processingLastRunTime = 0
    this.processingMinRunBreak = 200 //20 //200ms breaks between processing loops
    this.transactionQueueHasRemainingWork = false

    this.executeInOneShard = false

    if (this.config.sharding.executeInOneShard === true) {
      this.executeInOneShard = true
    }

    this.txCoverageMap = {}

    this.queueTimingFixes = true

    this.lastProcessStats = {}

    this.largePendingQueueReported = false

    this.isStuckProcessing = false
    this.stuckProcessingCount = 0
    this.stuckProcessingCyclesCount = 0
    this.stuckProcessingQueueLockedCyclesCount = 0

    this.debugLastAwaitedCall = ''
    this.debugLastAwaitedCallInner = ''
    this.debugLastAwaitedAppCall = ''
    this.debugLastProcessingQueueStartTime = 0

    this.debugLastAwaitedCallInnerStack = {}
    this.debugLastAwaitedAppCallStack = {}

    this.debugRecentQueueEntry = null
  }

  // Wrapper methods for extracted logic
  setupHandlers(): void {
    _setupHandlersLogic(this)
  }

  async getAccountsStateHash(accountStart?: string, accountEnd?: string, tsStart?: number, tsEnd?: number): Promise<string> {
    return _getAccountsStateHashLogic(this, accountStart, accountEnd, tsStart, tsEnd)
  }

  async preApplyTransaction(queueEntry: QueueEntry): Promise<PreApplyAcceptedTransactionResult> {
    return _preApplyTransactionLogic(this, queueEntry)
  }

  async commitConsensedTransaction(queueEntry: QueueEntry): Promise<CommitConsensedTransactionResult> {
    return _commitConsensedTransactionLogic(this, queueEntry)
  }

  routeAndQueueAcceptedTransaction(acceptedTx: AcceptedTx, sendGossip?: boolean, sender?: Node, globalModification?: boolean, noConsensus?: boolean): string | boolean {
    return _routeAndQueueAcceptedTransactionLogic(this, acceptedTx, sendGossip, sender, globalModification, noConsensus)
  }

  async queueEntryRequestMissingData(queueEntry: QueueEntry): Promise<void> {
    return _queueEntryRequestMissingDataLogic(this, queueEntry)
  }

  async queueEntryRequestMissingReceipt(queueEntry: QueueEntry): Promise<void> {
    return _queueEntryRequestMissingReceiptLogic(this, queueEntry)
  }
  
  async requestFinalData(queueEntry: QueueEntry, accountIds: string[], nodesToAskKeys?: string[], includeAppReceiptData?: boolean): Promise<RequestFinalDataResp> {
    return _requestFinalDataLogic(this, queueEntry, accountIds, nodesToAskKeys, includeAppReceiptData)
  }

  async requestInitialData(queueEntry: QueueEntry, accountIds: string[]): Promise<WrappedResponses> {
    return _requestInitialDataLogic(this, queueEntry, accountIds)
  }

  async getArchiverReceiptFromQueueEntry(queueEntry: QueueEntry): Promise<ArchiverReceipt> {
    return _getArchiverReceiptFromQueueEntryLogic(this, queueEntry)
  }

  async processTransactions(firstTime = false): Promise<void> {
    return _processTransactionsLogic(this, firstTime)
  }

  // For methods that were directly part of processTransactions or very small helpers
  private setTXExpired(queueEntry: QueueEntry, currentIndex: number, message: string): void {
    _setTXExpiredLogic(this, queueEntry, currentIndex, message)
  }

  private setTxAlmostExpired(queueEntry: QueueEntry, currentIndex: number, message: string): void {
    _setTxAlmostExpiredLogic(this, queueEntry, currentIndex, message)
  }

  updateTxState(queueEntry: QueueEntry, nextState: string, context = ''): void {
    _updateTxStateLogic(this, queueEntry, nextState, context)
  }

  txDebugMarkStartTime(queueEntry: QueueEntry, state: string): void {
    _txDebugMarkStartTimeLogic(this, queueEntry, state)
  }

  txDebugMarkEndTime(queueEntry: QueueEntry, state: string): void {
    _txDebugMarkEndTimeLogic(this, queueEntry, state)
  }

  processQueue_accountSeen(seenAccounts: SeenAccounts, queueEntry: QueueEntry): boolean {
    return _processQueue_accountSeenLogic(this, seenAccounts, queueEntry)
  }

  processQueue_getUpstreamTx(seenAccounts: SeenAccounts, queueEntry: QueueEntry): QueueEntry | null {
    return _processQueue_getUpstreamTxLogic(this, seenAccounts, queueEntry)
  }

  processQueue_markAccountsSeen(seenAccounts: SeenAccounts, queueEntry: QueueEntry): void {
    _processQueue_markAccountsSeenLogic(this, seenAccounts, queueEntry)
  }

  processQueue_clearAccountsSeen(seenAccounts: SeenAccounts, queueEntry: QueueEntry): void {
    _processQueue_clearAccountsSeenLogic(this, seenAccounts, queueEntry)
  }

  processQueue_debugAccountData(queueEntry: QueueEntry, app: Shardus.App): string {
    return _processQueue_debugAccountDataLogic(this, queueEntry, app)
  }
  
  processQueue_accountSeen2(seenAccounts: SeenAccounts, queueEntry: QueueEntry): boolean {
    return _processQueue_accountSeen2Logic(this, seenAccounts, queueEntry)
  }

  processQueue_markAccountsSeen2(seenAccounts: SeenAccounts, queueEntry: QueueEntry): void {
    _processQueue_markAccountsSeen2Logic(this, seenAccounts, queueEntry)
  }

  tellCorrespondingNodes(queueEntry: QueueEntry): Promise<unknown> {
    return _tellCorrespondingNodesLogic(this, queueEntry)
  }

  factTellCorrespondingNodes(queueEntry: QueueEntry): Promise<unknown> {
    return _factTellCorrespondingNodesLogic(this, queueEntry)
  }

  validateCorrespondingTellSender(queueEntry: QueueEntry, dataKey: string, senderNodeId: string): boolean {
    return _validateCorrespondingTellSenderLogic(this, queueEntry, dataKey, senderNodeId)
  }

  factValidateCorrespondingTellSender(queueEntry: QueueEntry, dataKey: string, senderNodeId: string): boolean {
    return _factValidateCorrespondingTellSenderLogic(this, queueEntry, dataKey, senderNodeId)
  }

  getStartAndEndIndexOfTargetGroup(targetGroup: string[], transactionGroup: (Shardus.NodeWithRank | P2PTypes.NodeListTypes.Node)[]): { startIndex: number; endIndex: number } {
    return _getStartAndEndIndexOfTargetGroupLogic(this, targetGroup, transactionGroup)
  }
  
  broadcastState(nodes: Shardus.Node[], message: { stateList: Shardus.WrappedResponse[]; txid: string }, context: string): Promise<void> {
    return _broadcastStateLogic(this, nodes, message, context)
  }

  factTellCorrespondingNodesFinalData(queueEntry: QueueEntry): void {
    _factTellCorrespondingNodesFinalDataLogic(this, queueEntry)
  }

  factValidateCorrespondingTellFinalDataSender(queueEntry: QueueEntry, senderNodeId: string): boolean {
    return _factValidateCorrespondingTellFinalDataSenderLogic(this, queueEntry, senderNodeId)
  }

  dumpTxDebugToStatList(queueEntry: QueueEntry): void {
    _dumpTxDebugToStatListLogic(this, queueEntry)
  }

  clearTxDebugStatList(): void {
    _clearTxDebugStatListLogic(this)
  }

  printTxDebugByTxId(txId: string): string {
    return _printTxDebugByTxIdLogic(this, txId)
  }

  printTxDebug(): string {
    return _printTxDebugLogic(this)
  }

  checkForStuckProcessing(): void {
    _checkForStuckProcessingLogic(this)
  }

  onProcesssingQueueStuck(): void {
    _onProcesssingQueueStuckLogic(this)
  }

  getDebugProccessingStatus(): unknown {
    return _getDebugProccessingStatusLogic(this)
  }

  clearStuckProcessingDebugVars(): void {
    _clearStuckProcessingDebugVarsLogic(this)
  }

  fixStuckProcessing(clearPendingTransactions: boolean): void {
    _fixStuckProcessingLogic(this, clearPendingTransactions)
  }

  setDebugLastAwaitedCall(label: string, complete?: DebugComplete): void {
    _setDebugLastAwaitedCallLogic(this, label, complete)
  }

  setDebugLastAwaitedCallInner(label: string, complete?: DebugComplete): void {
    _setDebugLastAwaitedCallInnerLogic(this, label, complete)
  }

  setDebugSetLastAppAwait(label: string, complete?: DebugComplete): void {
    _setDebugSetLastAppAwaitLogic(this, label, complete)
  }

  clearDebugAwaitStrings(): void {
    _clearDebugAwaitStringsLogic(this)
  }
  
  getDebugQueueInfo(queueEntry: QueueEntry): any {
    return _getDebugQueueInfoLogic(this, queueEntry)
  }

  getQueueItems(): any[] {
    return _getQueueItemsLogic(this)
  }
  
  getQueueItemById(txId: string): any {
    return _getQueueItemByIdLogic(this, txId)
  }
  
  clearQueueItems(minAge: number): number {
    return _clearQueueItemsLogic(this, minAge)
  }
  
  removeTxFromArchivedQueue(txId: string): void {
    _removeTxFromArchivedQueueLogic(this, txId)
  }

  getDebugStuckTxs(opts: { state: string; minAge: number; nextStates?: boolean }): unknown {
    return _getDebugStuckTxsLogic(this, opts);
  }

  getQueueLengthBuckets(): any {
    return _getQueueLengthBucketsLogic(this);
  }


  // Methods remaining in this file:
  isTxInPendingNonceQueue(accountId: string, txId: string): boolean {
    /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`isTxInPendingNonceQueue ${accountId} ${txId}`, this.nonceQueue)
    const queue = this.nonceQueue.get(accountId)
    if (queue == null) {
      return false
    }
    for (const item of queue) {
      if (item.txId === txId) {
        return true
      }
    }
    return false
  }

  getPendingCountInNonceQueue(): { totalQueued: number; totalAccounts: number; avgQueueLength: number} {
    let totalQueued = 0
    let totalAccounts = 0
    for (const queue of this.nonceQueue.values()) {
      totalQueued += queue.length
      totalAccounts++
    }
    const avgQueueLength = totalAccounts > 0 ? totalQueued / totalAccounts : 0;
    return { totalQueued, totalAccounts, avgQueueLength }
  }

  addTransactionToNonceQueue(nonceQueueEntry: NonceQueueItem): {success: boolean; reason?: string, alreadyAdded?: boolean} {
    try {
      let queue = this.nonceQueue.get(nonceQueueEntry.accountId)
      if (queue == null || (Array.isArray(queue) && queue.length === 0)) {
        queue = [nonceQueueEntry]
        this.nonceQueue.set(nonceQueueEntry.accountId, queue)
        if (logFlags.debug) this.mainLogger.debug(`adding new nonce tx: ${nonceQueueEntry.txId} ${nonceQueueEntry.accountId} with nonce ${nonceQueueEntry.nonce}`)
      } else if (queue && queue.length > 0) {
        const index = utils.binarySearch(queue, nonceQueueEntry, (a, b) => Number(a.nonce) - Number(b.nonce))

        if (index >= 0) {
          // there is existing item with the same nonce. replace it with the new one
          queue[index] = nonceQueueEntry
          this.nonceQueue.set(nonceQueueEntry.accountId, queue)
          nestedCountersInstance.countEvent('processing', 'replaceExistingNonceTx')
          if (logFlags.debug) this.mainLogger.debug(`replace existing nonce tx ${nonceQueueEntry.accountId} with nonce ${nonceQueueEntry.nonce}, txId: ${nonceQueueEntry.txId}`)
          return { success: true, reason: 'Replace existing pending nonce tx', alreadyAdded: true }
        }
        // add new item to the queue
        utils.insertSorted(queue, nonceQueueEntry, (a, b) => Number(a.nonce) - Number(b.nonce))
        this.nonceQueue.set(nonceQueueEntry.accountId, queue)
      }
      /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455106 ${shardusGetTime()} tx:${nonceQueueEntry.txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: pause_nonceQ`)
      nestedCountersInstance.countEvent('processing', 'addTransactionToNonceQueue')
      if (logFlags.debug) this.mainLogger.debug(`Added tx to nonce queue for ${nonceQueueEntry.accountId} with nonce ${nonceQueueEntry.nonce} nonceQueue: ${queue.length}`)
      return { success: true, reason: `Nonce queue size for account: ${queue.length}`, alreadyAdded: false }
    } catch (e) {
      nestedCountersInstance.countEvent('processing', 'addTransactionToNonceQueueError')
      this.mainLogger.error(`Error adding tx to nonce queue: ${e.message}, tx: ${utils.stringifyReduce(nonceQueueEntry)}`)
      return { success: false, reason: e.message, alreadyAdded: false }
    }
  }
  async processNonceQueue(accounts: Shardus.WrappedData[]): Promise<void> {
    for (const account of accounts) {
      const queue = this.nonceQueue.get(account.accountId)
      if (queue == null) {
        continue
      }
      for (const item of [...queue]) { // Iterate over a copy in case of modification
        const accountNonce = await this.app.getAccountNonce(account.accountId, account)
        if (item.nonce === accountNonce) {
          nestedCountersInstance.countEvent('processing', 'processNonceQueue foundMatchingNonce')
          if (logFlags.debug) this.mainLogger.debug(`Found matching nonce in queue or ${account.accountId} with nonce ${item.nonce}`, item)
          item.appData.requestNewTimestamp = true

          // start of timestamp logging
          if (logFlags.important_as_error) {
            const txTimestamp = this.app.getTimestampFromTransaction(item.tx, item.appData);
            const nowNodeTimestamp = shardusGetTime()
            const delta = nowNodeTimestamp - txTimestamp
            const ntpOffset = getNetworkTimeOffset()        
            /* prettier-ignore */ console.log(`TxnTS: pre _timestampAndQueueTransaction txTimestamp=${txTimestamp}, nowNodeTimestamp=${nowNodeTimestamp}, delta=${delta}, ntpOffset=${ntpOffset}, txID=${item.txId}`) 
          }
          // end of timestamp logging.

          await this.stateManager.shardus._timestampAndQueueTransaction(
            item.tx,
            item.appData,
            item.global,
            item.noConsensus,
            'nonceQueue'
          )

          // start of timestamp logging
          if (logFlags.important_as_error) {
            const txTimestamp = this.app.getTimestampFromTransaction(item.tx, item.appData);
            const nowNodeTimestamp = shardusGetTime()
            const delta = nowNodeTimestamp - txTimestamp
            const ntpOffset = getNetworkTimeOffset()        
            /* prettier-ignore */ console.log(`TxnTS: post _timestampAndQueueTransaction txTimestamp=${txTimestamp}, nowNodeTimestamp=${nowNodeTimestamp}, delta=${delta}, ntpOffset=${ntpOffset}, txID=${item.txId}`) 
          }
          // end of timestamp logging.

          // remove the item from the queue
          const index = queue.indexOf(item)
          if (index > -1) {
            queue.splice(index, 1)
          }

          //we should break here. we keep looking up account values after we go to the step needed.
          //this assumes we will not put two TXs with the same nonce value in the queue.
          break
        }
      }
    }
  }

  handleSharedTX(tx: Shardus.TimestampedTx, appData: unknown, sender: Shardus.Node): QueueEntry {
    profilerInstance.profileSectionStart('handleSharedTX')
    const internalTx = this.app.isInternalTx(tx)
    if ((internalTx && !isInternalTxAllowed()) || (!internalTx && networkMode !== 'processing')) {
      profilerInstance.profileSectionEnd('handleSharedTX')
      // Block invalid txs in case a node maliciously relays them to other nodes
      return null
    }
    // Perform fast validation of the transaction fields
    profilerInstance.scopedProfileSectionStart('handleSharedTX_validateTX')
    const validateResult = this.app.validate(tx, appData)
    profilerInstance.scopedProfileSectionEnd('handleSharedTX_validateTX')
    if (validateResult.success === false) {
      this.statemanager_fatal(
        `spread_tx_to_group_validateTX`,
        `spread_tx_to_group validateTxnFields failed: ${utils.stringifyReduce(validateResult)}`
      )
      profilerInstance.profileSectionEnd('handleSharedTX')
      return null
    }

    // Ask App to crack open tx and return timestamp, id (hash), and keys
    const { timestamp, id, keys, shardusMemoryPatterns } = this.app.crack(tx, appData)

    // Check if we already have this tx in our queue
    let queueEntry = this.getQueueEntrySafe(id) // , payload.timestamp)
    if (queueEntry) {
      profilerInstance.profileSectionEnd('handleSharedTX')
      return null
    }

    const mostOfQueueSitTimeMs = this.stateManager.queueSitTime * 0.9
    const txExpireTimeMs = this.config.transactionExpireTime * 1000
    const age = shardusGetTime() - timestamp
    if (inRangeOfCurrentTime(timestamp, mostOfQueueSitTimeMs, txExpireTimeMs) === false) {
      /* prettier-ignore */ if (logFlags.verbose) this.statemanager_fatal( `spread_tx_to_group_OldTx_or_tooFuture`, 'spread_tx_to_group cannot accept tx with age: ' + age )
      /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_spread_tx_to_groupToOldOrTooFuture', '', 'spread_tx_to_group working on tx with age: ' + age)
      profilerInstance.profileSectionEnd('handleSharedTX')
      return null
    }

    const acceptedTx: AcceptedTx = {
      timestamp,
      txId: id,
      keys,
      data: tx,
      appData,
      shardusMemoryPatterns,
    }

    const noConsensus = false // this can only be true for a set command which will never come from an endpoint
    const added = this.routeAndQueueAcceptedTransaction(
      acceptedTx,
      /*sendGossip*/ false,
      sender,
      /*globalModification*/ false,
      noConsensus
    )
    if (added === 'lost') {
      profilerInstance.profileSectionEnd('handleSharedTX')
      return null 
    }
    if (added === 'out of range') {
      profilerInstance.profileSectionEnd('handleSharedTX')
      return null
    }
    if (added === 'notReady') {
      profilerInstance.profileSectionEnd('handleSharedTX')
      return null
    }
    queueEntry = this.getQueueEntrySafe(id) 

    if (queueEntry == null) {
      /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('spread_tx_to_group_noQE', '', `spread_tx_to_group failed: cant find queueEntry for:  ${utils.makeShortHash(id)}`)
      profilerInstance.profileSectionEnd('handleSharedTX')
      return null
    }

    profilerInstance.profileSectionEnd('handleSharedTX')
    return queueEntry
  }

  configUpdated(): void {
    this.useNewPOQ = this.config.stateManager.useNewPOQ
    console.log('Config updated for stateManager.useNewPOQ', this.useNewPOQ)
    nestedCountersInstance.countEvent('stateManager', `useNewPOQ config updated to ${this.useNewPOQ}`)
  }

  resetTxCoverageMap(): void {
    this.txCoverageMap = {}
  }

  updateHomeInformation(txQueueEntry: QueueEntry): void {
    let cycleShardData = this.stateManager.currentCycleShardData
    if (Context.config.stateManager.deterministicTXCycleEnabled) {
      cycleShardData = this.stateManager.shardValuesByCycle.get(txQueueEntry.txGroupCycle)
    }

    if (cycleShardData != null && txQueueEntry.hasShardInfo === false) {
      const txId = txQueueEntry.acceptedTx.txId
      for (const key of txQueueEntry.txKeys.allKeys) {
        if (key == null) {
          throw new Error(`updateHomeInformation key == null ${key}`)
        }
        const homeNode = ShardFunctions.findHomeNode(
          cycleShardData.shardGlobals,
          key,
          cycleShardData.parititionShardDataMap
        )
        if (homeNode == null) {
          nestedCountersInstance.countRareEvent('fatal', 'updateHomeInformation homeNode == null')
          throw new Error(`updateHomeInformation homeNode == null ${key}`)
        }
        txQueueEntry.homeNodes[key] = homeNode
        if (homeNode == null) {
          /* prettier-ignore */ if (logFlags.verbose && logFlags.error) this.mainLogger.error(` routeAndQueueAcceptedTransaction: ${key} `)
          throw new Error(`updateHomeInformation homeNode == null ${txQueueEntry}`)
        }

        const isGlobalAccount = this.stateManager.accountGlobals.isGlobalAccount(key)
        if (isGlobalAccount === true) {
          txQueueEntry.involvedPartitions.push(homeNode.homePartition)
          txQueueEntry.involvedGlobalPartitions.push(homeNode.homePartition)
        } else {
          txQueueEntry.involvedPartitions.push(homeNode.homePartition)
        }

        if (logFlags.playback) {
          const summaryObject = ShardFunctions.getHomeNodeSummaryObject(homeNode)
          const relationString = ShardFunctions.getNodeRelation(homeNode, cycleShardData.ourNode.id)
          this.logger.playbackLogNote(
            'shrd_homeNodeSummary',
            `${txId}`,
            `account:${utils.makeShortHash(key)} rel:${relationString} summary:${utils.stringifyReduce(
              summaryObject
            )}`
          )
        }
      }
      txQueueEntry.hasShardInfo = true
    }
  }

  tryInvloveAccount(txId: string, address: string, isRead: boolean): boolean {
    const queueEntry = this.getQueueEntry(txId)
    if (!queueEntry) return false; // Should not happen if called correctly

    if (queueEntry.collectedData[address]) {
      return true
    }
    if (queueEntry.involvedReads[address] || queueEntry.involvedWrites[address]) {
      return true
    }

    if (isRead) {
      queueEntry.involvedReads[address] = true
    } else {
      queueEntry.involvedWrites[address] = true
    }
    return true
  }

  async queueEntryPrePush(txQueueEntry: QueueEntry): Promise<void> {
    this.profiler.profileSectionStart('queueEntryPrePush', true)
    this.profiler.scopedProfileSectionStart('queueEntryPrePush', true)
    if (
      this.config.features.enableRIAccountsCache &&
      txQueueEntry.shardusMemoryPatternSets &&
      txQueueEntry.shardusMemoryPatternSets.ri &&
      txQueueEntry.shardusMemoryPatternSets.ri.size > 0
    ) {
      for (const key of txQueueEntry.shardusMemoryPatternSets.ri) {
        nestedCountersInstance.countEvent('transactionQueue', 'queueEntryPrePush_ri')
        if (logFlags.verbose) this.mainLogger.info(`queueEntryPrePush: fetching immutable data for tx ${txQueueEntry.acceptedTx.txId} key ${key}`)
        const accountData = await this.stateManager.getLocalOrRemoteAccount(key, {
          useRICache: true,
        })
        if (accountData != null) {
          this.app.setCachedRIAccountData([accountData])
          this.queueEntryAddData(txQueueEntry, {
            accountId: accountData.accountId,
              stateId: accountData.stateId,
              data: accountData.data,
              timestamp: accountData.timestamp,
              syncData: accountData.syncData,
              accountCreated: false,
              isPartial: false,
          }, false)
          nestedCountersInstance.countEvent('transactionQueue', 'queueEntryPrePush_ri_added')
        }
      }
    }
    this.profiler.scopedProfileSectionEnd('queueEntryPrePush')
    this.profiler.profileSectionStart('queueEntryPrePush', true) // This seems like a redundant start, original code had it.
  }

  getQueueEntry(txid: string): QueueEntry | null {
    const queueEntry = this._transactionQueueByID.get(txid)
    if (queueEntry === undefined) {
      return null
    }
    return queueEntry
  }

  getQueueEntrySafe(txid: string): QueueEntry | null {
    let queueEntry = this._transactionQueueByID.get(txid)
    if (queueEntry === undefined) {
      queueEntry = this.pendingTransactionQueueByID.get(txid)
      if (queueEntry === undefined) {
        if (logFlags.debug) this.mainLogger.debug(`getQueueEntrySafe failed to find: ${utils.stringifyReduce(txid)}`)
        nestedCountersInstance.countEvent('getQueueEntrySafe', 'failed to find returning null')
        return null
      }
    }
    return queueEntry
  }

  getQueueEntryArchived(txid: string, msg: string): QueueEntry | null {
    const queueEntry = this.archivedQueueEntriesByID.get(txid)
    if (queueEntry != null) {
      return queueEntry
    }
    nestedCountersInstance.countRareEvent('error', `getQueueEntryArchived no entry: ${msg}`)
    if (logFlags.error) this.mainLogger.error(`getQueueEntryArchived failed to find: ${utils.stringifyReduce(txid)} ${msg} dbg:${this.stateManager.debugTXHistory[utils.stringifyReduce(txid)]}`)
    return null
  }
  
  getArchivedQueueEntryByAccountIdAndHash(accountId: string, hash: string, msg: string): QueueEntry | null {
    try {
      let foundQueueEntry = false
      let foundVote = false
      let foundVoteMatchingHash = false
      for (const queueEntry of this.archivedQueueEntriesByID.values()) {
        if (queueEntry.uniqueKeys.includes(accountId)) {
          foundQueueEntry = true
          const signedReceipt: SignedReceipt = this.stateManager.getSignedReceipt(queueEntry)
          let proposal: Proposal | null = null
          if (signedReceipt !=  null) {
            proposal = signedReceipt.proposal
            if (signedReceipt.proposal) nestedCountersInstance.countEvent('getArchivedQueueEntryByAccountIdAndHash', 'get proposal from signedReceipt')
          }
          if (proposal == null) {
            proposal = queueEntry.ourProposal
            if (queueEntry.receivedBestVote) nestedCountersInstance.countEvent('getArchivedQueueEntryByAccountIdAndHash', 'get proposal' +
              ' from' +
              ' queueEntry.ourProposal')
          }
          if (proposal == null) {
            continue
          }
          foundVote = true
          for (let i = 0; i < proposal.accountIDs.length; i++) {
            if (proposal.accountIDs[i] === accountId) {
              if (proposal.afterStateHashes[i] === hash) {
                foundVoteMatchingHash = true
                return queueEntry
              }
            }
          }
        }
      }
      nestedCountersInstance.countRareEvent('error', `getQueueEntryArchived no entry: ${msg}`)
      nestedCountersInstance.countEvent('error', `getQueueEntryArchived no entry: ${msg}, found queue entry: ${foundQueueEntry}, found vote: ${foundVote}, found vote matching hash: ${foundVoteMatchingHash}`)
      return null
    } catch(e) {
      this.statemanager_fatal(`getArchivedQueueEntryByAccountIdAndHash`, `error: ${e.message}`)
      return null
    }
  }

  getQueueEntryArchivedByTimestamp(timestamp: number, msg: string): QueueEntry | null {
    for (const queueEntry of this.archivedQueueEntriesByID.values()) {
      if (queueEntry.acceptedTx.timestamp === timestamp) {
        return queueEntry
      }
    }
    nestedCountersInstance.countRareEvent('error', `getQueueEntryArchived no entry: ${msg}`)
    nestedCountersInstance.countEvent('error', `getQueueEntryArchived no entry: ${msg}`)
    return null
  }

  queueEntryAddData(queueEntry: QueueEntry, data: Shardus.WrappedResponse, signatureCheck = false): void {
    if (queueEntry.uniqueKeys == null) {
      nestedCountersInstance.countEvent('queueEntryAddData', 'uniqueKeys == null')
      throw new Error(
        `Attempting to add data and uniqueKeys are not available yet: ${utils.stringifyReduceLimit(
          queueEntry,
          200
        )}`
      )
    }
    if (queueEntry.collectedData[data.accountId] != null) {
      if (configContext.stateManager.collectedDataFix) {
        const existingData = queueEntry.collectedData[data.accountId]
        if (data.timestamp > existingData.timestamp) {
          queueEntry.collectedData[data.accountId] = data
          nestedCountersInstance.countEvent('queueEntryAddData', 'collectedDataFix replace with newer data')
        } else {
          nestedCountersInstance.countEvent('queueEntryAddData', 'already collected 1')
          return
        }
      } else {
        nestedCountersInstance.countEvent('queueEntryAddData', 'already collected 2')
        return
      }
    }
    profilerInstance.profileSectionStart('queueEntryAddData', true)
    if (signatureCheck && (data.sign == null || data.sign.owner == null || data.sign.sig == null)) {
      this.mainLogger.fatal(`queueEntryAddData: data.sign == null ${utils.stringifyReduce(data)}`)
      nestedCountersInstance.countEvent('queueEntryAddData', 'data.sign == null')
      profilerInstance.profileSectionEnd('queueEntryAddData', true) // End profiling before early return
      return
    }

    if (signatureCheck) {
      const dataSenderPublicKey = data.sign.owner
      const dataSenderNode: Shardus.Node = byPubKey[dataSenderPublicKey]
      if (dataSenderNode == null) {
        nestedCountersInstance.countEvent('queueEntryAddData', 'dataSenderNode == null')
        profilerInstance.profileSectionEnd('queueEntryAddData', true) // End profiling
        return
      }
      const consensusNodesForAccount = queueEntry.homeNodes[data.accountId]?.consensusNodeForOurNodeFull
      if (consensusNodesForAccount == null || consensusNodesForAccount.map(n => n.id).includes(dataSenderNode.id) === false) {
        nestedCountersInstance.countEvent('queueEntryAddData', 'data sender node is not in the consensus group of the' +
          ' account')
        profilerInstance.profileSectionEnd('queueEntryAddData', true) // End profiling
        return
      }

      const singedData = data as SignedObject
      if (this.crypto.verify(singedData) === false) {
        nestedCountersInstance.countEvent('queueEntryAddData', 'data signature verification failed')
        profilerInstance.profileSectionEnd('queueEntryAddData', true) // End profiling
        return
      }
    }

    queueEntry.collectedData[data.accountId] = data
    queueEntry.dataCollected = Object.keys(queueEntry.collectedData).length

    queueEntry.originalData[data.accountId] = Utils.safeJsonParse(Utils.safeStringify(data))
    queueEntry.beforeHashes[data.accountId] = data.stateId

    if (queueEntry.dataCollected === queueEntry.uniqueKeys.length) {
      queueEntry.hasAll = true
      if (queueEntry.executionGroup && queueEntry.executionGroup.length > 1) this.shareCompleteDataToNeighbours(queueEntry)
      if (logFlags.debug || this.stateManager.consensusLog) {
        this.mainLogger.debug(
          `queueEntryAddData hasAll: true for txId ${queueEntry.logID} ${queueEntry.acceptedTx.txId} at timestamp: ${shardusGetTime()} nodeId: ${Self.id} collected ${Object.keys(queueEntry.collectedData).length} uniqueKeys ${queueEntry.uniqueKeys.length}`
        )
      }
    }

    if (data.localCache) {
      queueEntry.localCachedData[data.accountId] = data.localCache
      delete data.localCache
    }

    if (logFlags.playback) this.logger.playbackLogNote('shrd_addData', `${queueEntry.logID}`, `key ${utils.makeShortHash(data.accountId)} hash: ${utils.makeShortHash(data.stateId)} hasAll:${queueEntry.hasAll} collected:${queueEntry.dataCollected}  ${queueEntry.acceptedTx.timestamp}`)
    profilerInstance.profileSectionEnd('queueEntryAddData', true) // Changed to End
  }
  
  async shareCompleteDataToNeighbours(queueEntry: QueueEntry): Promise<void> {
    if (configContext.stateManager.shareCompleteData === false) {
      return
    }
    if (queueEntry.hasAll === false || queueEntry.sharedCompleteData) {
      return
    }
    if (queueEntry.isInExecutionHome === false) {
      return
    }
    const dataToShare: WrappedResponses = {}
    const stateList: Shardus.WrappedResponse[] = []
    for (const accountId in queueEntry.collectedData) {
      const data = queueEntry.collectedData[accountId]
      const riCacheResult = await this.app.getCachedRIAccountData([accountId])
      if (riCacheResult != null && riCacheResult.length > 0) {
        nestedCountersInstance.countEvent('shareCompleteDataToNeighbours', 'riCacheResult, skipping')
        continue
      } else {
        dataToShare[accountId] = data
        stateList.push(data)
      }
    }
    const payload = {txid: queueEntry.acceptedTx.txId, stateList}
    const neighboursNodes = utils.selectNeighbors(queueEntry.executionGroup, queueEntry.ourExGroupIndex, 2)
    if (stateList.length > 0) {
      this.broadcastState(neighboursNodes, payload, "shareCompleteDataToNeighbours")

      queueEntry.sharedCompleteData = true
      nestedCountersInstance.countEvent(`queueEntryAddData`, `sharedCompleteData stateList: ${stateList.length} neighbours: ${neighboursNodes.length}`)
      if (logFlags.debug || this.stateManager.consensusLog) {
        this.mainLogger.debug(
          `shareCompleteDataToNeighbours: shared complete data for txId ${queueEntry.logID} at timestamp: ${shardusGetTime()} nodeId: ${Self.id} to neighbours: ${Utils.safeStringify(neighboursNodes.map((node) => node.id))}`
        )
      }
    }
  }


  async gossipCompleteData(queueEntry: QueueEntry): Promise<void> {
    if (queueEntry.hasAll === false || queueEntry.gossipedCompleteData) {
      return
    }
    if (configContext.stateManager.gossipCompleteData === false) {
      return
    }
    const dataToGossip: WrappedResponses = {}
    const stateList: Shardus.WrappedResponse[] = []
    for (const accountId in queueEntry.collectedData) {
      const data = queueEntry.collectedData[accountId]
      const riCacheResult = await this.app.getCachedRIAccountData([accountId])
      if (riCacheResult != null && riCacheResult.length > 0) {
        nestedCountersInstance.countEvent('gossipCompleteData', 'riCacheResult, skipping')
        continue
      } else {
        dataToGossip[accountId] = data
        stateList.push(data)
      }
    }
    const payload = {txid: queueEntry.acceptedTx.txId, stateList}
    if (stateList.length > 0) {
      Comms.sendGossip(
        'broadcast_state_complete_data', // deprecated
        payload,
        '',
        Self.id,
        queueEntry.executionGroup,
        true,
        6,
        queueEntry.acceptedTx.txId
      )
      queueEntry.gossipedCompleteData = true
      nestedCountersInstance.countEvent('gossipCompleteData', `stateList: ${stateList.length}`)
      if (logFlags.debug || this.stateManager.consensusLog) {
        this.mainLogger.debug(
          `gossipQueueEntryData: gossiped data for txId ${queueEntry.logID} at timestamp: ${shardusGetTime()} nodeId: ${Self.id}`
        )
      }
    }
  }

  queueEntryHasAllData(queueEntry: QueueEntry): boolean {
    if (queueEntry.hasAll === true) {
      return true
    }
    if (queueEntry.uniqueKeys == null) {
      throw new Error(`queueEntryHasAllData (queueEntry.uniqueKeys == null)`)
    }
    let dataCollected = 0
    for (const key of queueEntry.uniqueKeys) {
      if (queueEntry.collectedData[key] != null) {
        dataCollected++
      }
    }
    if (dataCollected === queueEntry.uniqueKeys.length) {
      queueEntry.hasAll = true
      return true
    }
    return false
  }

  queueEntryListMissingData(queueEntry: QueueEntry): string[] {
    if (queueEntry.hasAll === true) {
      return []
    }
    if (queueEntry.uniqueKeys == null) {
      throw new Error(`queueEntryListMissingData (queueEntry.uniqueKeys == null)`)
    }
    const missingAccounts = []
    for (const key of queueEntry.uniqueKeys) {
      if (queueEntry.collectedData[key] == null) {
        missingAccounts.push(key)
      }
    }
    return missingAccounts
  }

  addOriginalTxDataToForward(queueEntry: QueueEntry): void {
    if (logFlags.verbose)
      console.log('originalTxData', queueEntry.acceptedTx.txId, queueEntry.acceptedTx.timestamp)
    const { acceptedTx } = queueEntry
    const originalTxData = {
      txId: acceptedTx.txId,
      originalTxData: acceptedTx.data,
      cycle: queueEntry.cycleToRecordOn,
      timestamp: acceptedTx.timestamp,
    }
    Archivers.instantForwardOriginalTxData(originalTxData)
  }

  async addReceiptToForward(queueEntry: QueueEntry, debugString = ''): Promise<void> {
    if (logFlags.verbose)
      console.log(
        'addReceiptToForward',
        queueEntry.acceptedTx.txId,
        queueEntry.acceptedTx.timestamp,
        debugString
      )
    const archiverReceipt = await this.getArchiverReceiptFromQueueEntry(queueEntry)
    if (archiverReceipt) { // Only forward if receipt is not null
      Archivers.instantForwardReceipts([archiverReceipt])
      this.receiptsForwardedTimestamp = shardusGetTime()
      this.forwardedReceiptsByTimestamp.set(this.receiptsForwardedTimestamp, archiverReceipt)
    }
  }

  getReceiptsToForward(): ArchiverReceipt[] {
    return [...this.forwardedReceiptsByTimestamp.values()]
  }

  resetReceiptsToForward(): void {
    const MAX_RECEIPT_AGE_MS = 15000 // 15s
    const now = shardusGetTime()
    for (const [key] of this.forwardedReceiptsByTimestamp) {
      if (now - key > MAX_RECEIPT_AGE_MS) {
        this.forwardedReceiptsByTimestamp.delete(key)
      }
    }
  }

  removeFromQueue(queueEntry: QueueEntry, currentIndex: number, archive = true): void {
    for (const key in queueEntry.txDebug.startTime) {
      if (queueEntry.txDebug.startTime[key] != null) {
        this.txDebugMarkEndTime(queueEntry, key)
      }
    }
    this.stateManager.eventEmitter.emit('txPopped', queueEntry.acceptedTx.txId)
    if (queueEntry.txDebug) this.dumpTxDebugToStatList(queueEntry)
    this._transactionQueue.splice(currentIndex, 1)
    this._transactionQueueByID.delete(queueEntry.acceptedTx.txId)

    if (archive === false) {
      if (logFlags.debug) this.mainLogger.debug(`removeFromQueue: ${queueEntry.logID} done. No archive`);
      return
    }

    queueEntry.archived = true
    queueEntry.ourVote = null
    queueEntry.collectedVotes = null

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

    this.archivedQueueEntries.push(queueEntry)
    this.archivedQueueEntriesByID.set(queueEntry.acceptedTx.txId, queueEntry)
    if (this.archivedQueueEntries.length > this.archivedQueueEntryMaxCount) {
      if (this.archivedQueueEntries[0] && this.archivedQueueEntries[0].acceptedTx) {
          this.archivedQueueEntriesByID.delete(this.archivedQueueEntries[0].acceptedTx.txId);
      }
      this.archivedQueueEntries.shift();
    }
    if (logFlags.debug) this.mainLogger.debug(`removeFromQueue: ${queueEntry.logID} and added to archive done`);
  }

  computeNodeRank(nodeId: string, txId: string, txTimestamp: number): bigint {
    if (nodeId == null || txId == null || txTimestamp == null) return BigInt(0)
    const hash = this.crypto.hash([txId, txTimestamp])
    return BigInt(XOR(nodeId, hash))
  }

  orderNodesByRank(nodeList: Shardus.Node[], queueEntry: QueueEntry): Shardus.NodeWithRank[] {
    const nodeListWithRankData: Shardus.NodeWithRank[] = []
    for (let i = 0; i < nodeList.length; i++) {
      const node: Shardus.Node = nodeList[i]
      const rank = this.computeNodeRank(node.id, queueEntry.acceptedTx.txId, queueEntry.acceptedTx.timestamp)
      const nodeWithRank: Shardus.NodeWithRank = {
        rank,
        id: node.id,
        status: node.status,
        publicKey: node.publicKey,
        externalIp: node.externalIp,
        externalPort: node.externalPort,
        internalIp: node.internalIp,
        internalPort: node.internalPort,
      }
      nodeListWithRankData.push(nodeWithRank)
    }
    return nodeListWithRankData.sort((a: Shardus.NodeWithRank, b: Shardus.NodeWithRank) => {
      if (b.rank > a.rank) return 1;
      if (b.rank < a.rank) return -1;
      return 0;
    })
  }

  queueEntryGetTransactionGroup(queueEntry: QueueEntry, tryUpdate = false): Shardus.Node[] {
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
      const homeNode = queueEntry.homeNodes[key]
      if (homeNode == null) {
        if (logFlags.verbose) this.mainLogger.debug('queueEntryGetTransactionGroup homenode:null')
        // Potentially skip or handle error if homeNode is critical
        continue; 
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

      if (queueEntry.globalModification === false) {
        if (this.stateManager.accountGlobals.isGlobalAccount(key) === true) {
          if (logFlags.verbose) this.mainLogger.debug(`queueEntryGetTransactionGroup skipping: ${utils.makeShortHash(key)} tx: ${queueEntry.logID}`)
          continue
        } else {
          hasNonGlobalKeys = true
        }
      }

      for (const node of homeNode.nodeThatStoreOurParitionFull) {
        uniqueNodes[node.id] = node
        if (node.id === Self.id)
          if (logFlags.verbose)
            this.mainLogger.debug(`queueEntryGetTransactionGroup tx ${queueEntry.logID} our node coverage key ${key}`)
      }

      const scratch1 = {}
      for (const node of homeNode.nodeThatStoreOurParitionFull) {
        scratch1[node.id] = true
      }
      uniqueNodes[homeNode.node.id] = homeNode.node

      const { homePartition } = ShardFunctions.addressToPartition(
        cycleShardData.shardGlobals,
        key
      )
      if (homePartition != homeNode.homePartition) {
        for (const nodeID of cycleShardData.nodeShardDataMap.keys()) {
          const nodeShardData: StateManagerTypes.shardFunctionTypes.NodeShardData =
            cycleShardData.nodeShardDataMap.get(nodeID)
          const nodeStoresThisPartition = ShardFunctions.testInRange(
            homePartition,
            nodeShardData.storedPartitions
          )
          if (nodeStoresThisPartition === true && uniqueNodes[nodeID] == null) {
            uniqueNodes[nodeID] = nodeShardData.node
            queueEntry.patchedOnNodes.set(nodeID, nodeShardData)
          }
          if (nodeStoresThisPartition === true) {
            if (scratch1[nodeID] == null) {
              homeNode.patchedOnNodes.push(nodeShardData.node)
              scratch1[nodeID] = true
            }
          }
        }
      }

      if (
        queueEntry.globalModification === false &&
        this.executeInOneShard &&
        key === queueEntry.executionShardKey
      ) {
        const executionKeys = []
        if (logFlags.verbose) {
          for (const node of queueEntry.executionGroup) {
            executionKeys.push(utils.makeShortHash(node.id) + `:${node.externalPort}`)
          }
        }
        if (logFlags.verbose) this.mainLogger.debug(`queueEntryGetTransactionGroup executeInOneShard ${queueEntry.logID} isInExecutionHome:${queueEntry.isInExecutionHome} executionGroup:${Utils.safeStringify(executionKeys)}`)
        if (logFlags.playback && logFlags.verbose) this.logger.playbackLogNote('queueEntryGetTransactionGroup', `queueEntryGetTransactionGroup executeInOneShard ${queueEntry.logID} isInExecutionHome:${queueEntry.isInExecutionHome} executionGroup:${Utils.safeStringify(executionKeys)}`)
      }
    }
    queueEntry.ourNodeInTransactionGroup = true
    if (uniqueNodes[cycleShardData.ourNode.id] == null) {
      queueEntry.ourNodeInTransactionGroup = false
      if (logFlags.verbose) this.mainLogger.debug(`queueEntryGetTransactionGroup not involved: hasNonG:${hasNonGlobalKeys} tx ${queueEntry.logID}`)
    }
    if (queueEntry.ourNodeInTransactionGroup)
      if (logFlags.seqdiagram) this.seqLogger.info(`0x53455105 ${shardusGetTime()} tx:${queueEntry.acceptedTx.txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: targetgroup`)

    uniqueNodes[cycleShardData.ourNode.id] = cycleShardData.ourNode

    const values = Object.values(uniqueNodes)
    for (const v of values) {
      txGroup.push(v)
    }

    txGroup.sort(this.stateManager._sortByIdAsc)
    if (queueEntry.ourNodeInTransactionGroup) {
      const ourID = cycleShardData.ourNode.id
      for (let idx = 0; idx < txGroup.length; idx++) {
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
    return txGroup
  }

  queueEntryGetConsensusGroup(queueEntry: QueueEntry): Shardus.Node[] {
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
      const homeNode = queueEntry.homeNodes[key]
      if (homeNode == null) {
        if (logFlags.verbose) this.mainLogger.debug('queueEntryGetConsensusGroup homenode:null')
        continue;
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

      if (queueEntry.globalModification === false) {
        if (this.stateManager.accountGlobals.isGlobalAccount(key) === true) {
          if (logFlags.verbose) this.mainLogger.debug(`queueEntryGetConsensusGroup skipping: ${utils.makeShortHash(key)} tx: ${queueEntry.logID}`)
          continue
        } else {
          hasNonGlobalKeys = true
        }
      }

      for (const node of homeNode.consensusNodeForOurNodeFull) {
        uniqueNodes[node.id] = node
      }
      uniqueNodes[homeNode.node.id] = homeNode.node
    }
    queueEntry.ourNodeInConsensusGroup = true
    if (uniqueNodes[cycleShardData.ourNode.id] == null) {
      queueEntry.ourNodeInConsensusGroup = false
      if (logFlags.verbose) this.mainLogger.debug(`queueEntryGetConsensusGroup not involved: hasNonG:${hasNonGlobalKeys} tx ${queueEntry.logID}`)
    }

    uniqueNodes[cycleShardData.ourNode.id] = cycleShardData.ourNode

    const values = Object.values(uniqueNodes)
    for (const v of values) {
      txGroup.push(v)
    }
    queueEntry.conensusGroup = txGroup
    return txGroup
  }

  getConsenusGroupForAccount(accountID: string): Shardus.Node[] {
    const { homePartition } = ShardFunctions.addressToPartition(
      this.stateManager.currentCycleShardData.shardGlobals,
      accountID
    )
    const homeShardData = this.stateManager.currentCycleShardData.parititionShardDataMap.get(homePartition)
    if (!homeShardData || !homeShardData.homeNodes || homeShardData.homeNodes.length === 0) {
        this.mainLogger.error(`getConsenusGroupForAccount: homeShardData or homeNodes not found for partition ${homePartition} of account ${accountID}`);
        return []; // Or handle error appropriately
    }
    const consenusGroup = homeShardData.homeNodes[0].consensusNodeForOurNodeFull.slice()
    return consenusGroup
  }

  getRandomConsensusNodeForAccount(accountID: string, excludeNodeIds: string[] = []): Shardus.Node {
    const { homePartition } = ShardFunctions.addressToPartition(
      this.stateManager.currentCycleShardData.shardGlobals,
      accountID
    )
    const homeShardData = this.stateManager.currentCycleShardData.parititionShardDataMap.get(homePartition)
    if (!homeShardData || !homeShardData.homeNodes || homeShardData.homeNodes.length === 0) {
        this.mainLogger.error(`getRandomConsensusNodeForAccount: homeShardData or homeNodes not found for partition ${homePartition} of account ${accountID}`);
        return null; // Or handle error
    }
    const consenusGroup = homeShardData.homeNodes[0].consensusNodeForOurNodeFull

    const filteredConsensusGroup = consenusGroup.filter((node) => excludeNodeIds.indexOf(node.id) === -1)
    if (filteredConsensusGroup.length === 0) return null; // No valid nodes left

    let maxRetry = 5
    let potentialNode: Shardus.Node
    let invalidNode: boolean
    do {
      potentialNode = filteredConsensusGroup[Math.floor(Math.random() * filteredConsensusGroup.length)]
      invalidNode = potentialNode ? isNodeInRotationBounds(potentialNode.id) : true; // Assume invalid if potentialNode is undefined
      maxRetry--
    } while (invalidNode && maxRetry > 0)

    return invalidNode ? null : potentialNode; // Return null if still invalid after retries
  }

  getStorageGroupForAccount(accountID: string): Shardus.Node[] {
    const { homePartition } = ShardFunctions.addressToPartition(
      this.stateManager.currentCycleShardData.shardGlobals,
      accountID
    )
    const homeShardData = this.stateManager.currentCycleShardData.parititionShardDataMap.get(homePartition)
    if (!homeShardData || !homeShardData.homeNodes || homeShardData.homeNodes.length === 0) {
        this.mainLogger.error(`getStorageGroupForAccount: homeShardData or homeNodes not found for partition ${homePartition} of account ${accountID}`);
        return [];
    }
    const storageGroup = homeShardData.homeNodes[0].nodeThatStoreOurParitionFull.slice()
    return storageGroup
  }

  isAccountRemote(accountID: string): boolean {
    const ourNodeShardData = this.stateManager.currentCycleShardData.nodeShardData
    const minP = ourNodeShardData.consensusStartPartition
    const maxP = ourNodeShardData.consensusEndPartition
    const { homePartition } = ShardFunctions.addressToPartition(
      this.stateManager.currentCycleShardData.shardGlobals,
      accountID
    )
    const accountIsRemote = ShardFunctions.partitionInWrappingRange(homePartition, minP, maxP) === false
    return accountIsRemote
  }

  getExecuteQueueLength(): number {
    let length = 0
    for (const queueEntry of this._transactionQueue) {
      if (queueEntry.isInExecutionHome) {
        length++
      }
    }
    return length
  }

  getAccountQueueCount(accountID: string, remote = false): QueueCountsResult {
    nestedCountersInstance.countEvent('stateManager', `getAccountQueueCount`)
    let count = 0
    const committingAppData: Shardus.AcceptedTx['appData'] = []
    for (const queueEntry of this.pendingTransactionQueue) {
      if (queueEntry.txKeys.sourceKeys.length > 0 && accountID === queueEntry.txKeys.sourceKeys[0]) {
        const tx = queueEntry.acceptedTx
        if (logFlags.verbose) console.log( 'getAccountQueueCount: found upstream tx in the injested queue:', `appData: ${Utils.safeStringify(tx.appData)}` )
        count++
      }
    }
    for (const queueEntry of this._transactionQueue) {
      if (queueEntry.txKeys.sourceKeys.length > 0 && accountID === queueEntry.txKeys.sourceKeys[0]) {
        const tx = queueEntry.acceptedTx
        if (queueEntry.state === 'commiting' && queueEntry.accountDataSet === false) {
          committingAppData.push(tx.appData)
          continue
        }
        if (logFlags.verbose) console.log( 'getAccountQueueCount: found upstream tx in the newAccepted queue:', `appData: ${Utils.safeStringify(tx.appData)}` )
        count++
      }
    }
    if (logFlags.verbose) console.log(`getAccountQueueCount: remote:${remote} ${count} acc:${utils.stringifyReduce(accountID)}`)
    return { count, committingAppData }
  }

  isAccountInQueue(accountID: string, remote = false): boolean {
    for (const queueEntry of this.pendingTransactionQueue) {
      if (queueEntry.uniqueKeys.includes(accountID)) {
        const memoryPatterns = queueEntry.acceptedTx.shardusMemoryPatterns
        if (queueEntry.txKeys.sourceKeys.length > 0 && accountID === queueEntry.txKeys.sourceKeys[0]) {
          if (logFlags.verbose) console.log( 'isAccountInQueue: found upstream tx in the injested queue:' )
          nestedCountersInstance.countEvent('stateManager', `isAccountInQueue of injested`)
          return true
        }
        const rw = memoryPatterns?.rw
        const wo = memoryPatterns?.wo
        if (rw && rw.includes(accountID) || wo && wo.includes(accountID)) {
          if (logFlags.verbose) console.log( 'isAccountInQueue: found upstream tx in the injested queue:' )
          nestedCountersInstance.countEvent('stateManager', `isAccountInQueue rw or wo of injested`)
          return true
        }
      }
    }
    for (const queueEntry of this._transactionQueue) {
      if (queueEntry.uniqueKeys.includes(accountID)) {
        const memoryPatterns = queueEntry.acceptedTx.shardusMemoryPatterns
        if (queueEntry.txKeys.sourceKeys.length > 0 && accountID === queueEntry.txKeys.sourceKeys[0]) {
          if (logFlags.verbose) console.log( 'isAccountInQueue: found upstream tx in the newAccepted queue:' )
          nestedCountersInstance.countEvent('stateManager', `isAccountInQueue of newAccepted`)
          return true
        }
        const rw = memoryPatterns?.rw
        const wo = memoryPatterns?.wo
        if (rw && rw.includes(accountID) || wo && wo.includes(accountID)) {
          if (logFlags.verbose) console.log( 'isAccountInQueue: found upstream tx in the newAccepted queue:' )
          nestedCountersInstance.countEvent('stateManager', `isAccountInQueue rw or wo of newAccepted`)
          return true
        }
      }
    }
    if (logFlags.verbose) console.log(`isAccountInQueue: false`)
    return false
  }

  updateSimpleStatsObject(
    statsObj: { [statName: string]: SimpleNumberStats },
    statName: string,
    duration: number
  ): void {
    let statsEntry = statsObj[statName]
    if (statsEntry == null) {
      statsEntry = {
        min: Number.MAX_SAFE_INTEGER,
        max: 0,
        total: 0,
        count: 0,
        average: 0,
      }
      statsObj[statName] = statsEntry
    }
    statsEntry.count++
    statsEntry.max = Math.max(statsEntry.max, duration)
    statsEntry.min = Math.min(statsEntry.min, duration)
    statsEntry.total += duration
  }

  finalizeSimpleStatsObject(statsObj: { [statName: string]: SimpleNumberStats }): void {
    for (const [, value] of Object.entries(statsObj)) {
      if (value.count) {
        value.average = value.total / value.count
      }
      value.average = Math.round(value.average * 100) / 100
      value.max = Math.round(value.max * 100) / 100
      value.min = Math.round(value.min * 100) / 100
      value.total = Math.round(value.total * 100) / 100
    }
  }
  
  computeTxSieveTime(queueEntry: QueueEntry): void {
    _computeTxSieveTimeLogic(this, queueEntry)
  }

  txWillChangeLocalData(queueEntry: QueueEntry): boolean {
    //if this TX modifies a global then return true since all nodes own all global accounts.
    if (queueEntry.globalModification) {
      return true
    }
    const timestamp = queueEntry.acceptedTx.timestamp
    const ourNodeData = this.stateManager.currentCycleShardData.nodeShardData
    for (const key of queueEntry.uniqueWritableKeys) {
      if (this.stateManager.accountGlobals.isGlobalAccount(key)) {
        //ignore globals in non global mod tx.
        continue
      }

      let hasKey = false
      const { homePartition } = ShardFunctions.addressToPartition(
        this.stateManager.currentCycleShardData.shardGlobals,
        key
      )
      const nodeStoresThisPartition = ShardFunctions.testInRange(homePartition, ourNodeData.storedPartitions)
      hasKey = nodeStoresThisPartition

      if (hasKey) {
        const accountHash = this.stateManager.accountCache.getAccountHash(key)
        if (accountHash != null) {
          if (timestamp > accountHash.t) {
            return true
          }
        } else {
          return true
        }
      }
    }
    return false
  }

  checkAccountTimestamps(queueEntry: QueueEntry): boolean {
    for (const accountID of Object.keys(queueEntry.involvedReads)) {
      const cacheEntry = this.stateManager.accountCache.getAccountHash(accountID)
      if (cacheEntry != null && cacheEntry.t >= queueEntry.acceptedTx.timestamp) {
        return false
      }
    }
    for (const accountID of Object.keys(queueEntry.involvedWrites)) {
      const cacheEntry = this.stateManager.accountCache.getAccountHash(accountID)
      if (cacheEntry != null && cacheEntry.t >= queueEntry.acceptedTx.timestamp) {
        return false
      }
    }
    return true
  }
}

export default TransactionQueue