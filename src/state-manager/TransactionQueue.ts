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
import { Signature, SignedObject } from '@shardeum-foundation/lib-crypto-utils'
import { errorToStringFull, inRangeOfCurrentTime, withTimeout, XOR } from '../utils'
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
  RequestFinalDataResp,
} from './state-manager-types'
import { isInternalTxAllowed, networkMode } from '../p2p/Modes'
import { Node } from '@shardeum-foundation/lib-types/build/src/p2p/NodeListTypes'
import { Logger as L4jsLogger } from 'log4js'
import { getNetworkTimeOffset, ipInfo, shardusGetTime } from '../network'
import { InternalBinaryHandler } from '../types/Handler'
import { BroadcastStateReq, deserializeBroadcastStateReq, serializeBroadcastStateReq } from '../types/BroadcastStateReq'
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
import { deserializeRequestReceiptForTxResp, RequestReceiptForTxRespSerialized } from '../types/RequestReceiptForTxResp'
import { RequestReceiptForTxReqSerialized, serializeRequestReceiptForTxReq } from '../types/RequestReceiptForTxReq'
import { isNodeInRotationBounds } from '../p2p/Utils'
import { BadRequest, ResponseError, serializeResponseError } from '../types/ResponseError'
import { error } from 'console'
import { PoqoDataAndReceiptReq, serializePoqoDataAndReceiptReq } from '../types/PoqoDataAndReceiptReq'
import { AJVSchemaEnum } from '../types/enum/AJVSchemaEnum'
import { getGlobalTxReceipt } from '../p2p/GlobalAccounts'

import { handlers } from './TransactionQueue.handlers';
import { factMethods } from './TransactionQueue.fact';
import { coreMethods } from './TransactionQueue.core';
import { entryMethods } from './TransactionQueue.entry';
import { nonceMethods } from './TransactionQueue.nonce';
import { seenMethods } from './TransactionQueue.seen';

interface Receipt {
  tx: AcceptedTx
}

const txStatBucketSize = {
  default: [1, 2, 4, 8, 16, 30, 60, 125, 250, 500, 1000, 2000, 4000, 8000, 10000, 20000, 30000, 60000, 100000],
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
    config: Shardus.StrictServerConfiguration
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

  /***
   *       ###    ########  ########   ######  ########    ###    ######## ########
   *      ## ##   ##     ## ##     ## ##    ##    ##      ## ##      ##    ##
   *     ##   ##  ##     ## ##     ## ##          ##     ##   ##     ##    ##
   *    ##     ## ########  ########   ######     ##    ##     ##    ##    ######
   *    ######### ##        ##              ##    ##    #########    ##    ##
   *    ##     ## ##        ##        ##    ##    ##    ##     ##    ##    ##
   *    ##     ## ##        ##         ######     ##    ##     ##    ##    ########
   */

  /* -------- APPSTATE Functions ---------- */

  /**
   * getAccountsStateHash
   * DEPRICATED in current sync algorithm.  This is very slow when we have many accounts or TXs
   * @param accountStart
   * @param accountEnd
   * @param tsStart
   * @param tsEnd
   */
  async getAccountsStateHash(
    accountStart = '0'.repeat(64),
    accountEnd = 'f'.repeat(64),
    tsStart = 0,
    tsEnd = shardusGetTime()
  ): Promise<string> {
    const accountStates = await this.storage.queryAccountStateTable(accountStart, accountEnd, tsStart, tsEnd, 100000000)

    const seenAccounts = new Set()

    //only hash one account state per account. the most recent one!
    const filteredAccountStates = []
    for (let i = accountStates.length - 1; i >= 0; i--) {
      // eslint-disable-next-line security/detect-object-injection
      const accountState: Shardus.StateTableObject = accountStates[i]

      if (seenAccounts.has(accountState.accountId) === true) {
        continue
      }
      seenAccounts.add(accountState.accountId)
      filteredAccountStates.unshift(accountState)
    }

    const stateHash = this.crypto.hash(filteredAccountStates)
    return stateHash
  }

  /**
   * preApplyTransaction
   * call into the app code to apply a transaction on our in memory copies of data.
   * the results will be used for voting/consensus (if non-global)
   * when a receipt is formed commitConsensedTransaction will actually commit a the data
   * @param queueEntry
   */
  async preApplyTransaction(queueEntry: QueueEntry): Promise<PreApplyAcceptedTransactionResult> {
    if (this.queueStopped) return

    const acceptedTX = queueEntry.acceptedTx
    const wrappedStates = queueEntry.collectedData
    const localCachedData = queueEntry.localCachedData
    const tx = acceptedTX.data
    const keysResponse = queueEntry.txKeys
    const { timestamp, debugInfo } = keysResponse
    const uniqueKeys = queueEntry.uniqueKeys
    let accountTimestampsAreOK = true
    let ourLockID = -1
    let ourAccountLocks = null
    let applyResponse: Shardus.ApplyResponse | null = null
    const isGlobalModifyingTX = queueEntry.globalModification === true
    let passedApply = false
    let applyResult: string
    const appData = acceptedTX.appData

    /* prettier-ignore */ if (logFlags.verbose) if (logFlags.console) console.log('preApplyTransaction ' + timestamp + ' debugInfo:' + debugInfo)
    /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug('preApplyTransaction ' + timestamp + ' debugInfo:' + debugInfo)
    this.txDebugMarkStartTime(queueEntry, 'preApplyTransaction')

    //TODO need to adjust logic to add in more stuff.
    // may only need this in the case where we have hopped over to another shard or additional
    // accounts were passed in.  And that me handled earlier.

    /* eslint-disable security/detect-object-injection */
    for (const key of uniqueKeys) {
      if (wrappedStates[key] == null) {
        /* prettier-ignore */ if (logFlags.verbose) if (logFlags.console) console.log(`preApplyTransaction missing some account data. timestamp:${timestamp}  key: ${utils.makeShortHash(key)}  debuginfo:${debugInfo}`)
        this.txDebugMarkEndTime(queueEntry, 'preApplyTransaction')
        return { applied: false, passed: false, applyResult: '', reason: 'missing some account data' }
      } else {
        const wrappedState = wrappedStates[key]
        wrappedState.prevStateId = wrappedState.stateId
        wrappedState.prevDataCopy = utils.deepCopy(wrappedState.data)

        // important to update the wrappedState timestamp here to prevent bad timestamps from propagating the system
        const { timestamp: updatedTimestamp } = this.app.getTimestampAndHashFromAccount(wrappedState.data)
        wrappedState.timestamp = updatedTimestamp

        // check if current account timestamp is too new for this TX
        if (wrappedState.timestamp >= timestamp) {
          accountTimestampsAreOK = false
          break
        }
      }
    }
    /* eslint-enable security/detect-object-injection */

    if (!accountTimestampsAreOK) {
      if (logFlags.verbose) this.mainLogger.debug('preApplyTransaction pretest failed: ' + timestamp)
      /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('tx_preapply_rejected 1', `${acceptedTX.txId}`, `Transaction: ${utils.stringifyReduce(acceptedTX)}`)
      this.txDebugMarkEndTime(queueEntry, 'preApplyTransaction')
      return {
        applied: false,
        passed: false,
        applyResult: '',
        reason: 'preApplyTransaction pretest failed, TX rejected',
      }
    }

    try {
      if (logFlags.verbose) {
        this.mainLogger.debug(
          `preApplyTransaction  txid:${utils.stringifyReduce(
            acceptedTX.txId
          )} ts:${timestamp} isGlobalModifyingTX:${isGlobalModifyingTX}  Applying! debugInfo: ${debugInfo}`
        )
        this.mainLogger.debug(`preApplyTransaction  filter: ${utils.stringifyReduce(queueEntry.localKeys)}`)
        this.mainLogger.debug(`preApplyTransaction  acceptedTX: ${utils.stringifyReduce(acceptedTX)}`)
        this.mainLogger.debug(`preApplyTransaction  wrappedStates: ${utils.stringifyReduce(wrappedStates)}`)
        this.mainLogger.debug(`preApplyTransaction  localCachedData: ${utils.stringifyReduce(localCachedData)}`)
      }

      // TODO ARCH REVIEW:  review use of fifo lock of accountModification and account keys.
      // I think we need to consider adding reader-writer lock support so that a non written to global account is a "reader" lock: check but dont aquire
      // consider if it is safe to axe the use of fifolock accountModification.

      /* prettier-ignore */ this.setDebugLastAwaitedCallInner('preApplyTransaction-bulkFifoLockAccounts')
      /* prettier-ignore */ if (logFlags.verbose && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` preApplyTransaction FIFO lock outer: ${utils.stringifyReduce(uniqueKeys)} `)
      ourAccountLocks = await this.stateManager.bulkFifoLockAccounts(uniqueKeys)
      /* prettier-ignore */ if (logFlags.verbose && this.stateManager.extendedRepairLogging) this.mainLogger.debug(` preApplyTransaction FIFO lock inner: ${utils.stringifyReduce(uniqueKeys)} ourLocks: ${utils.stringifyReduce(ourAccountLocks)}`)
      /* prettier-ignore */ this.setDebugLastAwaitedCallInner('preApplyTransaction-bulkFifoLockAccounts', DebugComplete.Completed)

      /* prettier-ignore */ this.setDebugLastAwaitedCallInner('preApplyTransaction-fifoLock(accountModification)')
      ourLockID = await this.stateManager.fifoLock('accountModification')
      /* prettier-ignore */ this.setDebugLastAwaitedCallInner('preApplyTransaction-fifoLock(accountModification)', DebugComplete.Completed)

      this.profiler.profileSectionStart('process-dapp.apply')
      this.profiler.scopedProfileSectionStart('apply_duration')

      if (configContext.stateManager.useCopiedWrappedStateForApply === true) {
        // deep copy the wrappedStates so that the app can't mess with them when we later share coplete data to neighbors
        const deepCopyWrappedStates = utils.deepCopy(wrappedStates)
        /* prettier-ignore */ this.setDebugLastAwaitedCallInner('stateManager.transactionQueue.app.apply(tx)')
        applyResponse = await this.app.apply(tx as Shardus.OpaqueTransaction, deepCopyWrappedStates, appData)
        /* prettier-ignore */ this.setDebugLastAwaitedCallInner('stateManager.transactionQueue.app.apply(tx)', DebugComplete.Completed)
      } else {
        /* prettier-ignore */ this.setDebugLastAwaitedCallInner('stateManager.transactionQueue.app.apply(tx)')
        applyResponse = await this.app.apply(tx as Shardus.OpaqueTransaction, wrappedStates, appData)
        /* prettier-ignore */ this.setDebugLastAwaitedCallInner('stateManager.transactionQueue.app.apply(tx)', DebugComplete.Completed)
      }

      this.profiler.scopedProfileSectionEnd('apply_duration')
      this.profiler.profileSectionEnd('process-dapp.apply')
      if (applyResponse == null) {
        throw Error('null response from app.apply')
      }

      // check accountWrites of applyResponse
      if (this.config.debug.checkTxGroupChanges && applyResponse.accountWrites.length > 0) {
        const transactionGroupIDs = new Set(queueEntry.transactionGroup.map((node) => node.id))
        for (const account of applyResponse.accountWrites) {
          let txGroupCycle = queueEntry.txGroupCycle
          if (txGroupCycle > CycleChain.newest.counter) {
            txGroupCycle = CycleChain.newest.counter
          }
          const cycleShardDataForTx = this.stateManager.shardValuesByCycle.get(txGroupCycle)
          const fixHomeNodeCheckForTXGroupChanges = this.config.features.fixHomeNodeCheckForTXGroupChanges ?? false

          const homeNode = fixHomeNodeCheckForTXGroupChanges
            ? ShardFunctions.findHomeNode(
                cycleShardDataForTx.shardGlobals,
                account.accountId,
                cycleShardDataForTx.parititionShardDataMap
              )
            : ShardFunctions.findHomeNode(
                this.stateManager.currentCycleShardData.shardGlobals,
                account.accountId,
                this.stateManager.currentCycleShardData.parititionShardDataMap
              )

          let isUnexpectedAccountWrite = false
          for (const storageNode of homeNode.nodeThatStoreOurParitionFull) {
            const isStorageNodeInTxGroup = transactionGroupIDs.has(storageNode.id)
            if (!isStorageNodeInTxGroup) {
              isUnexpectedAccountWrite = true
              /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug( `preApplyTransaction Storage node ${storageNode.id} of accountId ${account.accountId} is not in transaction group` )
              break
            }
          }
          /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug( `preApplyTransaction isUnexpectedAccountWrite for account ${account.accountId}`, isUnexpectedAccountWrite )
          if (isUnexpectedAccountWrite) {
            applyResponse.failed = true
            applyResponse.failMessage = `preApplyTransaction unexpected account ${account.accountId} is not covered by transaction group`
          }
        }
      }

      if (applyResponse.failed === true) {
        passedApply = false
        applyResult = applyResponse.failMessage
      } else {
        passedApply = true
        applyResult = 'applied'
      }
      /* prettier-ignore */
      if (logFlags.verbose) this.mainLogger.debug(`preApplyTransaction ${queueEntry.logID} post apply wrappedStates: ${utils.stringifyReduce(wrappedStates)}`);
      /* prettier-ignore */ if (this.stateManager.consensusLog) this.mainLogger.debug(`preApplyTransaction ${queueEntry.logID} completed.`)

      //applyResponse = queueEntry?.preApplyTXResult?.applyResponse
      //super verbose option:
      /* prettier-ignore */
      if (logFlags.verbose && applyResponse != null) this.mainLogger.debug(`preApplyTransaction ${queueEntry.logID}  post applyResponse: ${utils.stringifyReduce(applyResponse)}`);
    } catch (ex) {
      /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`preApplyTransaction failed id:${utils.makeShortHash(acceptedTX.txId)}: ` + ex.name + ': ' + ex.message + ' at ' + ex.stack)
      /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`preApplyTransaction failed id:${utils.makeShortHash(acceptedTX.txId)}  ${utils.stringifyReduce(acceptedTX)}`)

      this.profiler.scopedProfileSectionEnd('apply_duration')
      passedApply = false
      applyResult = ex.message
    } finally {
      this.stateManager.fifoUnlock('accountModification', ourLockID)

      if (ourAccountLocks != null) {
        this.stateManager.bulkFifoUnlockAccounts(uniqueKeys, ourAccountLocks)
      }
      /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(` preApplyTransaction FIFO unlock inner: ${utils.stringifyReduce(uniqueKeys)} ourLocks: ${utils.stringifyReduce(ourAccountLocks)}`)
    }

    /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('tx_preapplied', `${acceptedTX.txId}`, `preApplyTransaction ${timestamp} `)
    if (logFlags.verbose) this.mainLogger.debug(`preApplyTransaction ${timestamp}`)

    this.txDebugMarkEndTime(queueEntry, 'preApplyTransaction')
    return {
      applied: true,
      passed: passedApply,
      applyResult: applyResult,
      reason: 'apply result',
      applyResponse: applyResponse,
    }
  }

  configUpdated(): void {
    this.useNewPOQ = this.config.stateManager.useNewPOQ
    console.log('Config updated for stateManager.useNewPOQ', this.useNewPOQ)
    nestedCountersInstance.countEvent('stateManager', `useNewPOQ config updated to ${this.useNewPOQ}`)
  }

  resetTxCoverageMap(): void {
    this.txCoverageMap = {}
  }

  /**
   * commitConsensedTransaction
   * This works with our in memory copies of data that have had a TX applied.
   * This calls into the app to save data and also updates:
   *    acceptedTransactions, stateTableData and accountsCopies DB tables
   *    accountCache and accountStats
   * @param queueEntry
   */
  async commitConsensedTransaction(queueEntry: QueueEntry): Promise<CommitConsensedTransactionResult> {
    let ourLockID = -1
    let accountDataList: string | unknown[]
    let uniqueKeys = []
    let ourAccountLocks = null
    const acceptedTX = queueEntry.acceptedTx
    let wrappedStates = this.stateManager.useAccountWritesOnly ? {} : queueEntry.collectedData
    const localCachedData = queueEntry.localCachedData
    const keysResponse = queueEntry.txKeys
    const { timestamp, debugInfo } = keysResponse
    const applyResponse = queueEntry?.preApplyTXResult?.applyResponse
    const isGlobalModifyingTX = queueEntry.globalModification === true
    let savedSomething = false
    try {
      this.profiler.profileSectionStart('commit-1-setAccount')
      if (logFlags.verbose) {
        /* prettier-ignore */ this.mainLogger.debug( `commitConsensedTransaction txId: ${queueEntry.logID}  ts:${timestamp} isGlobalModifyingTX:${isGlobalModifyingTX}  Applying! debugInfo: ${debugInfo}` )
        /* prettier-ignore */ this.mainLogger.debug( `commitConsensedTransaction  filter: ${utils.stringifyReduce(queueEntry.localKeys)}` )
        /* prettier-ignore */ this.mainLogger.debug(`commitConsensedTransaction  acceptedTX: ${utils.stringifyReduce(acceptedTX)}`)
        /* prettier-ignore */ this.mainLogger.debug( `commitConsensedTransaction  wrappedStates: ${utils.stringifyReduce(wrappedStates)}` )
        /* prettier-ignore */ this.mainLogger.debug( `commitConsensedTransaction  localCachedData: ${utils.stringifyReduce(localCachedData)}` )
        /* prettier-ignore */ this.mainLogger.debug(`commitConsensedTransaction  preApplyResponse: ${utils.stringifyReduce(queueEntry.preApplyTXResult.applyResponse)}`)
        /* prettier-ignore */ this.mainLogger.debug(`commitConsensedTransaction  queueEntry: ${utils.stringifyReduce(queueEntry)}`)
      }
      // TODO ARCH REVIEW:  review use of fifo lock of accountModification and account keys. (more notes in tryPreApplyTransaction() above )

      uniqueKeys = queueEntry.uniqueKeys

      /* prettier-ignore */ if (logFlags.verbose && this.stateManager.extendedRepairLogging) this.mainLogger.debug(`commitConsensedTransaction FIFO lock outer: ${utils.stringifyReduce(uniqueKeys)} `)
      // TODO Perf (for sharded networks).  consider if we can remove this lock
      /* prettier-ignore */ this.setDebugLastAwaitedCallInner('commit this.stateManager.bulkFifoLockAccounts')
      ourAccountLocks = await this.stateManager.bulkFifoLockAccounts(uniqueKeys)
      /* prettier-ignore */ this.setDebugLastAwaitedCallInner('commit this.stateManager.bulkFifoLockAccounts', DebugComplete.Completed)
      /* prettier-ignore */ if (logFlags.verbose && this.stateManager.extendedRepairLogging) this.mainLogger.debug(`commitConsensedTransaction FIFO lock inner: ${utils.stringifyReduce(uniqueKeys)} ourLocks: ${utils.stringifyReduce(ourAccountLocks)}`)

      /* prettier-ignore */ this.setDebugLastAwaitedCallInner('commit this.stateManager.fifoLock')
      ourLockID = await this.stateManager.fifoLock('accountModification')
      /* prettier-ignore */ this.setDebugLastAwaitedCallInner('commit this.stateManager.fifoLock', DebugComplete.Completed)

      /* prettier-ignore */ if (logFlags.verbose) if (logFlags.console) console.log(`commitConsensedTransaction tx:${queueEntry.logID} ts:${timestamp} Applying!`)
      // /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug('APPSTATE: tryApplyTransaction ' + timestamp + ' Applying!' + ' source: ' + utils.makeShortHash(sourceAddress) + ' target: ' + utils.makeShortHash(targetAddress) + ' srchash_before:' + utils.makeShortHash(sourceState) + ' tgtHash_before: ' + utils.makeShortHash(targetState))

      //let { stateTableResults, accountData: _accountdata } = applyResponse
      let stateTableResults = null
      let _accountdata = []

      if (applyResponse != null) {
        stateTableResults = applyResponse.stateTableResults
        _accountdata = applyResponse.accountData
      }

      accountDataList = _accountdata

      /**
       * Change to existing functionality.   Similar to how createAndShareVote should now check for the presence of
       * applyResponse.accountWrites, commitConsensedTransaction should also check for this data and use it.
       * It may take some more investigation but it is important that the order that accounts are added to accountWrites
       * will be maintained when committing the accounts.  We may have to investigate the code to make sure that there
       * is not any sorting by address that could get in the way.
       */

      /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`commitConsensedTransaction tx:${queueEntry.logID} ts:${timestamp} accounts: ${utils.stringifyReduce(Object.keys(wrappedStates))}  `)
      //create a temp map for state table logging below.
      //importantly, we override the wrappedStates with writtenAccountsMap if there is any accountWrites used
      //this should mean dapps don't have to use this feature.  (keeps simple dapps simpler)
      const writtenAccountsMap: WrappedResponses = {}
      if (applyResponse != null && applyResponse.accountWrites != null && applyResponse.accountWrites.length > 0) {
        const collectedData = queueEntry.collectedData
        /* prettier-ignore */ if (logFlags.verbose) if (logFlags.console) console.log(`commitConsensedTransaction collectedData: ${utils.stringifyReduce(collectedData)}`)
        for (const writtenAccount of applyResponse.accountWrites) {
          writtenAccountsMap[writtenAccount.accountId] = writtenAccount.data
          writtenAccountsMap[writtenAccount.accountId].prevStateId = collectedData[writtenAccount.accountId]
            ? collectedData[writtenAccount.accountId].stateId
            : ''
          writtenAccountsMap[writtenAccount.accountId].prevDataCopy = collectedData[writtenAccount.accountId]
            ? utils.deepCopy(collectedData[writtenAccount.accountId].data)
            : {}
          // writtenAccountsMap[writtenAccount.accountId].prevDataCopy = collectedData[writtenAccount.accountId] ? utils.deepCopy(writtenAccount.data) : {}
        }
        //override wrapped states with writtenAccountsMap which should be more complete if it included
        wrappedStates = writtenAccountsMap
        /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`commitConsensedTransaction applyResponse.accountWrites tx:${queueEntry.logID} ts:${timestamp} accounts: ${utils.stringifyReduce(Object.keys(wrappedStates))}  `)
      }

      //If we are not in the execution home then use data that was sent to us for the commit
      if (queueEntry.globalModification === false && this.executeInOneShard && queueEntry.isInExecutionHome === false) {
        //looks like this next line could be wiping out state from just above that used accountWrites
        //we have a task to refactor his code that needs to happen for executeInOneShard to work
        wrappedStates = {}

        /* eslint-disable security/detect-object-injection */
        for (const key of Object.keys(queueEntry.collectedFinalData)) {
          const finalAccount = queueEntry.collectedFinalData[key]
          const accountId = finalAccount.accountId

          //finalAccount.prevStateId = wrappedStates[accountId] ? wrappedStates[accountId].stateId : ''
          //finalAccount.prevDataCopy = wrappedStates[accountId] ? utils.deepCopy(wrappedStates[accountId].data) : {}
          const prevStateCalc = wrappedStates[accountId] ? wrappedStates[accountId].stateId : ''
          /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`commitConsensedTransaction collectedFinalData tx:${queueEntry.logID} ts:${timestamp} ${utils.makeShortHash(finalAccount)} preveStateID: ${finalAccount.prevStateId } vs expected: ${prevStateCalc}`)

          wrappedStates[key] = finalAccount
        }
        /* eslint-enable security/detect-object-injection */
        /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`commitConsensedTransaction collectedFinalData tx:${queueEntry.logID} ts:${timestamp} accounts: ${utils.stringifyReduce(Object.keys(wrappedStates))}  `)
      }

      // set a filter based so we only save data for local accounts.  The filter is a slightly different structure than localKeys
      // decided not to try and merge them just yet, but did accomplish some cleanup of the filter logic
      const filter: AccountFilter = {}

      const nodeShardData: StateManagerTypes.shardFunctionTypes.NodeShardData =
        this.stateManager.currentCycleShardData.nodeShardData
      //update the filter to contain any local accounts in accountWrites
      if (applyResponse != null && applyResponse.accountWrites != null && applyResponse.accountWrites.length > 0) {
        for (const writtenAccount of applyResponse.accountWrites) {
          const isLocal = ShardFunctions.testAddressInRange(writtenAccount.accountId, nodeShardData.storedPartitions)
          if (isLocal) {
            filter[writtenAccount.accountId] = 1
          }
          /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`commitConsensedTransaction  tx:${queueEntry.logID} ts:${timestamp} setWritefilter: ${isLocal}  acc:${writtenAccount.accountId} `)
        }
      }

      if (this.executeInOneShard && applyResponse == null && queueEntry.collectedFinalData != null) {
        for (const writtenAccount of Object.values(wrappedStates)) {
          const isLocal = ShardFunctions.testAddressInRange(writtenAccount.accountId, nodeShardData.storedPartitions)
          if (isLocal) {
            filter[writtenAccount.accountId] = 1
          }
          /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`commitConsensedTransaction queueEntry.collectedFinalData != null tx:${queueEntry.logID} ts:${timestamp} setWritefilter: ${isLocal}  acc:${writtenAccount.accountId} `)
        }
      }

      /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`commitConsensedTransaction  post apply wrappedStates: ${utils.stringifyReduce(wrappedStates)}`)

      const note = `setAccountData: tx:${queueEntry.logID} in commitConsensedTransaction. `

      for (const key of Object.keys(queueEntry.localKeys)) {
        // eslint-disable-next-line security/detect-object-injection
        filter[key] = 1
      }

      this.profiler.scopedProfileSectionStart('commit_setAccount')
      /* prettier-ignore */ this.setDebugLastAwaitedCallInner('this.stateManager.setAccount')
      // wrappedStates are side effected for now
      savedSomething = await this.stateManager.setAccount(
        wrappedStates,
        localCachedData,
        applyResponse,
        isGlobalModifyingTX,
        filter,
        note
      )
      /* prettier-ignore */ this.setDebugLastAwaitedCallInner('this.stateManager.setAccount', DebugComplete.Completed)
      queueEntry.accountDataSet = true
      this.profiler.scopedProfileSectionEnd('commit_setAccount')
      if (savedSomething) {
        //todo implement if we need it?
      }

      if (logFlags.verbose) {
        this.mainLogger.debug(`commitConsensedTransaction ${queueEntry.logID}  savedSomething: ${savedSomething}`)
        this.mainLogger.debug(
          `commitConsensedTransaction  accountData[${accountDataList.length}]: ${utils.stringifyReduce(
            accountDataList
          )}`
        )
        this.mainLogger.debug(
          `commitConsensedTransaction  stateTableResults[${stateTableResults.length}]: ${utils.stringifyReduce(
            stateTableResults
          )}`
        )
      }

      this.profiler.profileSectionEnd('commit-1-setAccount')
      this.profiler.profileSectionStart('commit-2-addAccountStatesAndTX')

      if (stateTableResults != null) {
        for (const stateT of stateTableResults) {
          let wrappedRespose = wrappedStates[stateT.accountId]

          //backup if we dont have the account in wrapped states (state table results is just for debugging now, and no longer used by sync)
          if (wrappedRespose == null) {
            wrappedRespose = writtenAccountsMap[stateT.accountId]
          }

          // we have to correct stateBefore because it now gets stomped in the vote, TODO cleaner fix?
          stateT.stateBefore = wrappedRespose.prevStateId

          if (logFlags.verbose) {
            /* prettier-ignore */ if (logFlags.console) console.log('writeStateTable ' + utils.makeShortHash(stateT.accountId) + ' before: ' + utils.makeShortHash(stateT.stateBefore) + ' after: ' + utils.makeShortHash(stateT.stateAfter) + ' txid: ' + utils.makeShortHash(acceptedTX.txId) + ' ts: ' + acceptedTX.timestamp)
            this.mainLogger.debug(
              'writeStateTable ' +
                utils.makeShortHash(stateT.accountId) +
                ' before: ' +
                utils.makeShortHash(stateT.stateBefore) +
                ' after: ' +
                utils.makeShortHash(stateT.stateAfter) +
                ' txid: ' +
                utils.makeShortHash(acceptedTX.txId) +
                ' ts: ' +
                acceptedTX.timestamp
            )
          }
        }
        /* prettier-ignore */ this.setDebugLastAwaitedCallInner('this.storage.addAccountStates')
        await this.storage.addAccountStates(stateTableResults)
        /* prettier-ignore */ this.setDebugLastAwaitedCallInner('this.storage.addAccountStates', DebugComplete.Completed)
      }

      // write the accepted TX to storage
      this.storage.addAcceptedTransactions([acceptedTX])
      this.profiler.profileSectionEnd('commit-2-addAccountStatesAndTX')
      this.profiler.profileSectionStart('commit-3-transactionReceiptPass')
      // endpoint to allow dapp to execute something that depends on a transaction being approved.
      this.app.transactionReceiptPass(acceptedTX.data, wrappedStates, applyResponse, true)
      /* prettier-ignore */ if (logFlags.verbose) console.log('transactionReceiptPass 2', acceptedTX.txId, queueEntry)

      this.profiler.profileSectionEnd('commit-3-transactionReceiptPass')
    } catch (ex) {
      this.statemanager_fatal(
        `commitConsensedTransaction_ex`,
        'commitConsensedTransaction failed: ' + ex.name + ': ' + ex.message + ' at ' + ex.stack
      )
      /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`commitConsensedTransaction failed id:${utils.makeShortHash(acceptedTX.txId)}  ${utils.stringifyReduce(acceptedTX)}`)
      return { success: false }
    } finally {
      this.stateManager.fifoUnlock('accountModification', ourLockID)

      if (ourAccountLocks != null) {
        this.stateManager.bulkFifoUnlockAccounts(uniqueKeys, ourAccountLocks)
      }
      /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`commitConsensedTransaction FIFO unlock inner: ${utils.stringifyReduce(uniqueKeys)} ourLocks: ${utils.stringifyReduce(ourAccountLocks)}`)
    }

    this.profiler.profileSectionStart('commit-4-updateAccountsCopyTable')
    // have to wrestle with the data a bit so we can backup the full account and not just the partial account!
    // let dataResultsByKey = {}
    const dataResultsFullList = []
    for (const wrappedData of applyResponse.accountData) {
      // TODO Before I clean this out, need to test a TX that uses localcache and partital data!!
      // if (wrappedData.isPartial === false) {
      //   dataResultsFullList.push(wrappedData.data)
      // } else {
      //   dataResultsFullList.push(wrappedData.localCache)
      // }
      if (wrappedData.localCache != null) {
        dataResultsFullList.push(wrappedData)
      }
      // dataResultsByKey[wrappedData.accountId] = wrappedData.data
    }

    // TSConversion verified that app.setAccount calls shardus.applyResponseAddState  that adds hash and txid to the data and turns it into AccountData
    const upgradedAccountDataList: Shardus.AccountData[] = dataResultsFullList as unknown as Shardus.AccountData[]

    const repairing = false
    // TODO ARCH REVIEW:  do we still need this table (answer: yes for sync. for now.).  do we need to await writing to it?
    /* prettier-ignore */ this.setDebugLastAwaitedCallInner('stateManager.updateAccountsCopyTable')
    await this.stateManager.updateAccountsCopyTable(upgradedAccountDataList, repairing, timestamp)
    /* prettier-ignore */ this.setDebugLastAwaitedCallInner('stateManager.updateAccountsCopyTable', DebugComplete.Completed)

    //the first node in the TX group will emit txProcessed.  I think this it to prevent over reporting (one node per tx group will report)
    if (
      queueEntry != null &&
      queueEntry.transactionGroup != null &&
      this.p2p.getNodeId() === queueEntry.transactionGroup[0].id
    ) {
      if (queueEntry.globalModification === false) {
        //temp way to make global modifying TXs not over count
        this.stateManager.eventEmitter.emit('txProcessed')
      }
    }
    this.stateManager.eventEmitter.emit('txApplied', acceptedTX)

    this.profiler.profileSectionEnd('commit-4-updateAccountsCopyTable')

    this.profiler.profileSectionStart('commit-5-stats')
    // STATS update
    this.stateManager.partitionStats.statsTxSummaryUpdate(queueEntry.cycleToRecordOn, queueEntry)
    for (const wrappedData of applyResponse.accountData) {
      //let queueData = queueEntry.collectedData[wrappedData.accountId]
      const queueData = wrappedStates[wrappedData.accountId]
      if (queueData != null) {
        if (queueData.accountCreated) {
          //account was created to do a summary init
          this.stateManager.partitionStats.statsDataSummaryInit(
            queueEntry.cycleToRecordOn,
            queueData.accountId,
            queueData.prevDataCopy,
            'commit'
          )
        }
        this.stateManager.partitionStats.statsDataSummaryUpdate(
          queueEntry.cycleToRecordOn,
          queueData.prevDataCopy,
          wrappedData,
          'commit'
        )
      } else {
        /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`commitConsensedTransaction failed to get account data for stats ${wrappedData.accountId}`)
      }
    }

    this.profiler.profileSectionEnd('commit-5-stats')

    return { success: true }
  }

  updateHomeInformation(txQueueEntry: QueueEntry): void {
    let cycleShardData = this.stateManager.currentCycleShardData
    if (Context.config.stateManager.deterministicTXCycleEnabled) {
      cycleShardData = this.stateManager.shardValuesByCycle.get(txQueueEntry.txGroupCycle)
    }

    if (cycleShardData != null && txQueueEntry.hasShardInfo === false) {
      const txId = txQueueEntry.acceptedTx.txId
      // Init home nodes!
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
        // eslint-disable-next-line security/detect-object-injection
        txQueueEntry.homeNodes[key] = homeNode
        if (homeNode == null) {
          /* prettier-ignore */ if (logFlags.verbose) if (logFlags.error) this.mainLogger.error(` routeAndQueueAcceptedTransaction: ${key} `)
          throw new Error(`updateHomeInformation homeNode == null ${txQueueEntry}`)
        }

        // calculate the partitions this TX is involved in for the receipt map
        const isGlobalAccount = this.stateManager.accountGlobals.isGlobalAccount(key)
        if (isGlobalAccount === true) {
          txQueueEntry.involvedPartitions.push(homeNode.homePartition)
          txQueueEntry.involvedGlobalPartitions.push(homeNode.homePartition)
        } else {
          txQueueEntry.involvedPartitions.push(homeNode.homePartition)
        }

        if (logFlags.playback) {
          // HOMENODEMATHS Based on home node.. should this be chaned to homepartition?
          const summaryObject = ShardFunctions.getHomeNodeSummaryObject(homeNode)
          const relationString = ShardFunctions.getNodeRelation(homeNode, cycleShardData.ourNode.id)
          // route_to_home_node
          this.logger.playbackLogNote(
            'shrd_homeNodeSummary',
            `${txId}`,
            `account:${utils.makeShortHash(key)} rel:${relationString} summary:${utils.stringifyReduce(summaryObject)}`
          )
        }
      }

      txQueueEntry.hasShardInfo = true
    }
  }

  /* eslint-disable security/detect-object-injection */
  tryInvloveAccount(txId: string, address: string, isRead: boolean): boolean {
    const queueEntry = this.getQueueEntry(txId)

    // check if address is already invloved in this tx
    if (queueEntry.collectedData[address]) {
      return true
    }
    if (queueEntry.involvedReads[address] || queueEntry.involvedWrites[address]) {
      return true
    }

    // test if the queue can take this account?
    // technically we can delay this check and since we have to run the just in time version of the check before apply
    // only difference of doing the work here also would be if we can more quickly reject a TX.

    // add the account to involved read or write
    if (isRead) {
      queueEntry.involvedReads[address] = true
    } else {
      queueEntry.involvedWrites[address] = true
    }
    return true
  }
  /* eslint-enable security/detect-object-injection */


  // compute the rand of the node where rank = node_id XOR hash(tx_id + tx_ts)
  computeNodeRank(nodeId: string, txId: string, txTimestamp: number): bigint {
    if (nodeId == null || txId == null || txTimestamp == null) return BigInt(0)
    const hash = this.crypto.hash([txId, txTimestamp])
    return BigInt(XOR(nodeId, hash))
  }

  // sort the nodeList by rank, in descending order
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
      return b.rank > a.rank ? 1 : -1
    })
  }

  async broadcastState(
    nodes: Shardus.Node[],
    message: { stateList: Shardus.WrappedResponse[]; txid: string },
    context: string
  ): Promise<void> {
    // if (this.config.p2p.useBinarySerializedEndpoints && this.config.p2p.broadcastStateBinary) {
    // convert legacy message to binary supported type
    const request = message as BroadcastStateReq
    if (logFlags.seqdiagram) {
      for (const node of nodes) {
        if (context == 'tellCorrespondingNodes') {
          /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455102 ${shardusGetTime()} tx:${message.txid} ${NodeList.activeIdToPartition.get(Self.id)}-->>${NodeList.activeIdToPartition.get(node.id)}: ${'broadcast_state_nodes'}`)
        } else {
          /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455102 ${shardusGetTime()} tx:${message.txid} ${NodeList.activeIdToPartition.get(Self.id)}-->>${NodeList.activeIdToPartition.get(node.id)}: ${'broadcast_state_neighbour'}`)
        }
      }
    }
    this.p2p.tellBinary<BroadcastStateReq>(
      nodes,
      InternalRouteEnum.binary_broadcast_state,
      request,
      serializeBroadcastStateReq,
      {
        verification_data: verificationDataCombiner(
          message.txid,
          message.stateList.length.toString(),
          request.stateList[0].accountId
        ),
      }
    )
    // return
    // }
    // this.p2p.tell(nodes, 'broadcast_state', message)
  }

  dumpTxDebugToStatList(queueEntry: QueueEntry): void {
    this.txDebugStatList.set(queueEntry.acceptedTx.txId, { ...queueEntry.txDebug })
  }

  clearTxDebugStatList(): void {
    this.txDebugStatList.clear()
  }

  printTxDebugByTxId(txId: string): string {
    // get the txStat from the txDebugStatList
    const txStat = this.txDebugStatList.get(txId)
    if (txStat == null) {
      return 'No txStat found'
    }
    let resultStr = ''
    for (const key in txStat.duration) {
      resultStr += `${key}: start:${txStat.startTimestamp[key]} end:${txStat.endTimestamp[key]} ${txStat.duration[key]} ms\n`
    }
    return resultStr
  }

  printTxDebug(): string {
    const collector = {}
    const totalTxCount = this.txDebugStatList.size()

    const indexes = [
      'aging',
      'processing',
      'awaiting data',
      'preApplyTransaction',
      'consensing',
      'commiting',
      'await final data',
      'expired',
      'total_queue_time',
      'pass',
      'fail',
    ]

    /* eslint-disable security/detect-object-injection */
    for (const [txId, txStat] of this.txDebugStatList.entries()) {
      for (const key in txStat.duration) {
        if (!collector[key]) {
          collector[key] = {}
          for (const bucket of txStatBucketSize.default) {
            collector[key][bucket] = []
          }
        }
        const duration = txStat.duration[key]
        for (const bucket of txStatBucketSize.default) {
          if (duration < bucket) {
            collector[key][bucket].push(duration)
            break
          }
        }
      }
    }
    const sortedCollector = {}
    for (const key of indexes) {
      sortedCollector[key] = { ...collector[key] }
    }
    /* eslint-enable security/detect-object-injection */
    const lines = []
    lines.push(`=> Total Transactions: ${totalTxCount}`)
    for (const [key, collectorForThisKey] of Object.entries(sortedCollector)) {
      lines.push(`\n => Tx ${key}: \n`)
      for (let i = 0; i < Object.keys(collectorForThisKey).length; i++) {
        // eslint-disable-next-line security/detect-object-injection
        const time = Object.keys(collectorForThisKey)[i]
        // eslint-disable-next-line security/detect-object-injection
        const arr = collectorForThisKey[time]
        if (!arr) continue
        const percentage = (arr.length / totalTxCount) * 100
        const blockCount = Math.round(percentage / 2)
        const blockStr = '|'.repeat(blockCount)
        const lowerLimit = i === 0 ? 0 : Object.keys(collectorForThisKey)[i - 1]
        const upperLimit = time
        const bucketDescription = `${lowerLimit} ms - ${upperLimit} ms:`.padEnd(19, ' ')
        lines.push(`${bucketDescription}  ${arr.length} ${percentage.toFixed(1).padEnd(5, ' ')}%  ${blockStr} `)
      }
    }

    const strToPrint = lines.join('\n')
    return strToPrint
  }

  async getArchiverReceiptFromQueueEntry(queueEntry: QueueEntry): Promise<ArchiverReceipt> {
    if (!queueEntry.preApplyTXResult || !queueEntry.preApplyTXResult.applyResponse) {
      /* prettier-ignore */ if (logFlags.verbose) console.log('getArchiverReceiptFromQueueEntry : no preApplyTXResult or applyResponse, returning null receipt')
      /* prettier-ignore */ nestedCountersInstance.countEvent('stateManager', 'getArchiverReceiptFromQueueEntry no preApplyTXResult or applyResponse')
      return null as ArchiverReceipt
    }

    const txId = queueEntry.acceptedTx.txId
    const timestamp = queueEntry.acceptedTx.timestamp
    const globalModification = queueEntry.globalModification

    let signedReceipt = null as SignedReceipt | P2PTypes.GlobalAccountsTypes.GlobalTxReceipt
    if (globalModification) {
      signedReceipt = getGlobalTxReceipt(queueEntry.acceptedTx.txId) as P2PTypes.GlobalAccountsTypes.GlobalTxReceipt
      /* prettier-ignore */ if (logFlags.important_as_error) console.log('getArchiverReceiptFromQueueEntry : globalModification signedReceipt txid', txId)
      /* prettier-ignore */ if (logFlags.important_as_error) console.log('getArchiverReceiptFromQueueEntry : globalModification signedReceipt signs', txId, Utils.safeStringify(signedReceipt.signs))
      /* prettier-ignore */ if (logFlags.important_as_error) console.log('getArchiverReceiptFromQueueEntry : globalModification signedReceipt tx', txId, Utils.safeStringify(signedReceipt.tx))
    } else {
      signedReceipt = this.stateManager.getSignedReceipt(queueEntry) as SignedReceipt
      /* prettier-ignore */ if (logFlags.important_as_error) console.log('getArchiverReceiptFromQueueEntry : nonGlobal signedReceipt txid', txId)
      /* prettier-ignore */ if (logFlags.important_as_error) console.log('getArchiverReceiptFromQueueEntry : nonGlobal signedReceipt proposal', txId, Utils.safeStringify(signedReceipt.proposal))
      /* prettier-ignore */ if (logFlags.important_as_error) console.log('getArchiverReceiptFromQueueEntry : nonGlobal signedReceipt proposalHash', txId, Utils.safeStringify(signedReceipt.proposalHash))
      /* prettier-ignore */ if (logFlags.important_as_error) console.log('getArchiverReceiptFromQueueEntry : nonGlobal signedReceipt signaturePack', txId, Utils.safeStringify(signedReceipt.signaturePack))
      /* prettier-ignore */ if (logFlags.important_as_error) console.log('getArchiverReceiptFromQueueEntry : nonGlobal signedReceipt voteOffsets', txId, Utils.safeStringify(signedReceipt.voteOffsets))
    }
    if (!signedReceipt) {
      /* prettier-ignore */ nestedCountersInstance.countEvent('stateManager', 'getArchiverReceiptFromQueueEntry no signedReceipt')
      /* prettier-ignore */ if (logFlags.important_as_error) console.log(`getArchiverReceiptFromQueueEntry: signedReceipt is null for txId: ${txId} timestamp: ${timestamp} globalModification: ${globalModification}`)
      return null as ArchiverReceipt
    }

    const accountsToAdd: { [accountId: string]: Shardus.AccountsCopy } = {}
    const beforeAccountsToAdd: { [accountId: string]: Shardus.AccountsCopy } = {}

    if (globalModification) {
      signedReceipt = signedReceipt as P2PTypes.GlobalAccountsTypes.GlobalTxReceipt
      if (signedReceipt.tx && signedReceipt.tx.addressHash != '' && !beforeAccountsToAdd[signedReceipt.tx.address]) {
        console.log(queueEntry.collectedData[signedReceipt.tx.address].stateId, signedReceipt.tx.addressHash)
        if (queueEntry.collectedData[signedReceipt.tx.address].stateId === signedReceipt.tx.addressHash) {
          const isGlobal = this.stateManager.accountGlobals.isGlobalAccount(signedReceipt.tx.addressHash)
          const account = queueEntry.collectedData[signedReceipt.tx.address]
          const accountCopy = {
            accountId: account.accountId,
            data: account.data,
            hash: account.stateId,
            timestamp: account.timestamp,
            isGlobal,
          } as Shardus.AccountsCopy
          beforeAccountsToAdd[account.accountId] = accountCopy
        } else {
          console.log(
            `getArchiverReceiptFromQueueEntry: before stateId does not match addressHash for txId: ${txId} timestamp: ${timestamp} globalModification: ${globalModification}`
          )
        }
      }
    } else if (this.config.stateManager.includeBeforeStatesInReceipts) {
      // simulate debug case
      if (configContext.mode === 'debug' && configContext.debug.beforeStateFailChance > Math.random()) {
        for (const accountId in queueEntry.collectedData) {
          const account = queueEntry.collectedData[accountId]
          account.stateId = 'debugFail2'
        }
      }

      const fileredBeforeStateToSend = []
      const badBeforeStateAccounts = []

      for (const account of Object.values(queueEntry.collectedData)) {
        if (typeof this.app.beforeStateAccountFilter !== 'function' || this.app.beforeStateAccountFilter(account)) {
          fileredBeforeStateToSend.push(account.accountId)
        }
      }

      // prepare before state accounts
      for (const accountId of fileredBeforeStateToSend) {
        signedReceipt = signedReceipt as SignedReceipt
        // check if our beforeState account hash is the same as the vote in the receipt2
        const index = signedReceipt.proposal.accountIDs.indexOf(accountId)
        if (index === -1) continue
        const account = queueEntry.collectedData[accountId]
        if (account == null) {
          badBeforeStateAccounts.push(accountId)
          continue
        }
        if (account.stateId !== signedReceipt.proposal.beforeStateHashes[index]) {
          badBeforeStateAccounts.push(accountId)
        }
      }

      if (badBeforeStateAccounts.length > 0) {
        nestedCountersInstance.countEvent(
          'stateManager',
          'badBeforeStateAccounts in getArchiverReceiptFromQueueEntry',
          badBeforeStateAccounts.length
        )

        // repair bad before state accounts
        const wrappedResponses: WrappedResponses = await this.requestInitialData(queueEntry, badBeforeStateAccounts)
        for (const accountId in wrappedResponses) {
          queueEntry.collectedData[accountId] = wrappedResponses[accountId]
        }
      }

      // add before state accounts
      for (const accountId of fileredBeforeStateToSend) {
        const account = queueEntry.collectedData[accountId]
        const isGlobal = this.stateManager.accountGlobals.isGlobalAccount(account.accountId)
        const accountCopy = {
          accountId: account.accountId,
          data: account.data,
          hash: account.stateId,
          timestamp: account.timestamp,
          isGlobal,
        } as Shardus.AccountsCopy
        beforeAccountsToAdd[account.accountId] = accountCopy
      }
    }

    let isAccountsMatchWithReceipt2 = true
    const accountWrites = queueEntry.preApplyTXResult?.applyResponse?.accountWrites

    if (globalModification) {
      if (accountWrites === null || accountWrites.length === 0) {
        console.log('No account update in global Modification tx', txId, timestamp)
      }
    } else if (
      accountWrites != null &&
      accountWrites.length === (signedReceipt as SignedReceipt).proposal.accountIDs.length
    ) {
      signedReceipt = signedReceipt as SignedReceipt
      for (const account of accountWrites) {
        const indexInVote = signedReceipt.proposal.accountIDs.indexOf(account.accountId)
        if (signedReceipt.proposal.afterStateHashes[indexInVote] !== account.data.stateId) {
          // console.log('Found afterStateHash mismatch', account.accountId, receipt2.proposal.afterStateHashes[indexInVote], account.data.stateId)
          isAccountsMatchWithReceipt2 = false
          break
        }
      }
    } else {
      isAccountsMatchWithReceipt2 = false
    }

    let finalAccounts = []
    let appReceiptData = queueEntry.preApplyTXResult?.applyResponse?.appReceiptData || null
    if (isAccountsMatchWithReceipt2) {
      finalAccounts = accountWrites
    } else {
      signedReceipt = signedReceipt as SignedReceipt
      // request the final accounts and appReceiptData
      let success = false
      let count = 0
      const maxRetry = 3
      const nodesToAskKeys = signedReceipt.signaturePack?.map((signature) => signature.owner)

      // retry 3 times if the request fails
      while (success === false && count < maxRetry) {
        count++
        const requestedData = await this.requestFinalData(
          queueEntry,
          signedReceipt.proposal.accountIDs,
          nodesToAskKeys,
          true
        )
        if (requestedData && requestedData.wrappedResponses && requestedData.appReceiptData) {
          success = true
          for (const accountId in requestedData.wrappedResponses) {
            finalAccounts.push(requestedData.wrappedResponses[accountId])
          }
          appReceiptData = requestedData.appReceiptData
        }
      }
    }

    // override with the accounts in accountWrites
    for (const account of finalAccounts) {
      const isGlobal = this.stateManager.accountGlobals.isGlobalAccount(account.accountId)
      const accountCopy = {
        accountId: account.accountId,
        data: account.data.data,
        timestamp: account.timestamp,
        hash: account.data.stateId,
        isGlobal,
      } as Shardus.AccountsCopy
      accountsToAdd[account.accountId] = accountCopy
    }

    // MIGHT NOT NEED THIS NOW WITH THE POQo RECEIPT REWRITE. NEED TO CONFIRM
    // if (!globalModification && this.useNewPOQ === false) {
    //   appliedReceipt = appliedReceipt as AppliedReceipt2
    //   if (appliedReceipt.appliedVote) {
    //     delete appliedReceipt.appliedVote.node_id
    //     delete appliedReceipt.appliedVote.sign
    //     delete appliedReceipt.confirmOrChallenge
    //     // Update the app_data_hash with the app_data_hash from the appliedVote
    //     appliedReceipt.app_data_hash = appliedReceipt.appliedVote.app_data_hash
    //   }
    // }

    const archiverReceipt: ArchiverReceipt = {
      tx: {
        originalTxData: queueEntry.acceptedTx.data,
        txId: queueEntry.acceptedTx.txId,
        timestamp: queueEntry.acceptedTx.timestamp,
      },
      signedReceipt,
      appReceiptData,
      beforeStates: [...Object.values(beforeAccountsToAdd)],
      afterStates: [...Object.values(accountsToAdd)],
      cycle: queueEntry.txGroupCycle,
      globalModification,
    }
    /* prettier-ignore */ if (logFlags.important_as_error) console.log('getArchiverReceiptFromQueueEntry : archiverReceipt', txId, Utils.safeStringify(archiverReceipt))
    /* prettier-ignore */ if (logFlags.important_as_error) console.log('getArchiverReceiptFromQueueEntry : originalTxData object', txId, Utils.safeStringify(archiverReceipt.tx.originalTxData))

    return archiverReceipt
  }

  addOriginalTxDataToForward(queueEntry: QueueEntry): void {
    if (logFlags.verbose) console.log('originalTxData', queueEntry.acceptedTx.txId, queueEntry.acceptedTx.timestamp)
    const { acceptedTx } = queueEntry
    const originalTxData = {
      txId: acceptedTx.txId,
      originalTxData: acceptedTx.data,
      cycle: queueEntry.cycleToRecordOn,
      timestamp: acceptedTx.timestamp,
    }
    // const signedOriginalTxData: any = this.crypto.sign(originalTxData) // maybe we don't need to send by signing it
    Archivers.instantForwardOriginalTxData(originalTxData)
  }

  async addReceiptToForward(queueEntry: QueueEntry, debugString = ''): Promise<void> {
    if (logFlags.verbose)
      console.log('addReceiptToForward', queueEntry.acceptedTx.txId, queueEntry.acceptedTx.timestamp, debugString)
    const archiverReceipt = await this.getArchiverReceiptFromQueueEntry(queueEntry)
    Archivers.instantForwardReceipts([archiverReceipt])
    this.receiptsForwardedTimestamp = shardusGetTime()
    this.forwardedReceiptsByTimestamp.set(this.receiptsForwardedTimestamp, archiverReceipt)
    // this.receiptsToForward.push(archiverReceipt)
  }

  getReceiptsToForward(): ArchiverReceipt[] {
    return [...this.forwardedReceiptsByTimestamp.values()]
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async requestFinalData(
    queueEntry: QueueEntry,
    accountIds: string[],
    nodesToAskKeys: string[] | null = null,
    includeAppReceiptData = false
  ): Promise<RequestFinalDataResp> {
    profilerInstance.profileSectionStart('requestFinalData')
    /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`requestFinalData: txid: ${queueEntry.logID} accountIds: ${utils.stringifyReduce(accountIds)}`);
    const message = { txid: queueEntry.acceptedTx.txId, accountIds, includeAppReceiptData }
    let success = false
    let successCount = 0
    let validAppReceiptData = includeAppReceiptData === false ? true : false

    // first check if we have received final data
    for (const accountId of accountIds) {
      // eslint-disable-next-line security/detect-object-injection
      if (queueEntry.collectedFinalData[accountId] != null) {
        successCount++
      }
    }
    if (successCount === accountIds.length && includeAppReceiptData === false) {
      nestedCountersInstance.countEvent('stateManager', 'requestFinalDataAlreadyReceived')
      /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`requestFinalData: txid: ${queueEntry.logID} already received all data`)
      // no need to request data
      return
    }

    try {
      let nodeToAsk: Shardus.Node
      if (nodesToAskKeys && nodesToAskKeys.length > 0) {
        const randomIndex = Math.floor(Math.random() * nodesToAskKeys.length)
        // eslint-disable-next-line security/detect-object-injection
        const randomNodeToAskKey = nodesToAskKeys[randomIndex]
        nodeToAsk = byPubKey.get(randomNodeToAskKey)
      } else {
        const randomIndex = Math.floor(Math.random() * queueEntry.executionGroup.length)
        // eslint-disable-next-line security/detect-object-injection
        const randomExeNode = queueEntry.executionGroup[randomIndex]
        nodeToAsk = nodes.get(randomExeNode.id)
      }

      if (!nodeToAsk) {
        /* prettier-ignore */ if (logFlags.error) this.mainLogger.error('requestFinalData: could not find node from execution group')
        throw new Error('requestFinalData: could not find node from execution group')
      }

      /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug( `requestFinalData: txid: ${queueEntry.acceptedTx.txId} accountIds: ${utils.stringifyReduce( accountIds )}, asking node: ${nodeToAsk.id} ${nodeToAsk.externalPort} at timestamp ${shardusGetTime()}` )

      // if (this.config.p2p.useBinarySerializedEndpoints && this.config.p2p.requestTxAndStateBinary) {
      const requestMessage = message as RequestTxAndStateReq
      /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455101 ${shardusGetTime()} tx:${queueEntry.acceptedTx.txId} ${NodeList.activeIdToPartition.get(Self.id)}-->>${NodeList.activeIdToPartition.get(nodeToAsk.id)}: ${'request_tx_and_state'}`)
      const response = await Comms.askBinary<RequestTxAndStateReq, RequestTxAndStateResp>(
        nodeToAsk,
        InternalRouteEnum.binary_request_tx_and_state,
        requestMessage,
        serializeRequestTxAndStateReq,
        deserializeRequestTxAndStateResp,
        {}
      )
      // } else response = await Comms.ask(nodeToAsk, 'request_tx_and_state', message)

      if (response && response.stateList && response.stateList.length > 0) {
        /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`requestFinalData: txid: ${queueEntry.logID} received data for ${response.stateList.length} accounts`)
      } else {
        /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`requestFinalData: txid: ${queueEntry.logID} response is null`)
        nestedCountersInstance.countEvent(
          'stateManager',
          'requestFinalData: failed: response or response.stateList null or statelist length 0'
        )
        return
      }

      for (const data of response.stateList) {
        if (data == null) {
          /* prettier-ignore */
          if (logFlags.error && logFlags.debug) this.mainLogger.error(`requestFinalData data == null for tx ${queueEntry.logID}`);
          success = false
          break
        }
        const indexInVote = queueEntry.signedReceipt.proposal.accountIDs.indexOf(data.accountId)
        if (indexInVote === -1) continue
        const afterStateIdFromVote = queueEntry.signedReceipt.proposal.afterStateHashes[indexInVote]
        if (data.stateId !== afterStateIdFromVote) {
          nestedCountersInstance.countEvent('stateManager', 'requestFinalDataMismatch')
          continue
        }
        if (queueEntry.collectedFinalData[data.accountId] == null) {
          // todo: check the state hashes and verify
          queueEntry.collectedFinalData[data.accountId] = data
          successCount++
          /* prettier-ignore */
          if (logFlags.debug) this.mainLogger.debug(`requestFinalData: txid: ${queueEntry.logID} success accountId: ${data.accountId} stateId: ${data.stateId}`);
        }
      }
      if (includeAppReceiptData && response.appReceiptData) {
        const receivedAppReceiptDataHash = this.crypto.hash(response.appReceiptData)
        const receipt2 = this.stateManager.getSignedReceipt(queueEntry)
        if (receipt2 != null) {
          validAppReceiptData = receivedAppReceiptDataHash === receipt2.proposal.appReceiptDataHash
        }
      }
      if (successCount === accountIds.length && validAppReceiptData === true) {
        success = true

        //setting this for completeness. if our node is awaiting final data it will utilize what was looked up here
        queueEntry.hasValidFinalData = true
        return { wrappedResponses: queueEntry.collectedFinalData, appReceiptData: response.appReceiptData }
      } else {
        nestedCountersInstance.countEvent(
          'stateManager',
          `requestFinalData: failed: did not get enough data: ${successCount} <  ${accountIds.length}`
        )
      }
    } catch (e) {
      nestedCountersInstance.countEvent('stateManager', 'requestFinalData: failed: Error')
      /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`requestFinalData: txid: ${queueEntry.logID} error: ${e.message}`)
    } finally {
      if (success === false) {
        nestedCountersInstance.countEvent('stateManager', 'requestFinalData: failed: success === false')
        /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`requestFinalData: txid: ${queueEntry.logID} failed. successCount: ${successCount} accountIds: ${accountIds.length}`);
      }
    }
    profilerInstance.profileSectionEnd('requestFinalData')
  }

  async requestInitialData(queueEntry: QueueEntry, accountIds: string[]): Promise<WrappedResponses> {
    profilerInstance.profileSectionStart('requestInitialData')
    this.mainLogger.debug(
      `requestInitialData: txid: ${queueEntry.logID} accountIds: ${utils.stringifyReduce(accountIds)}`
    )
    const message = { txid: queueEntry.acceptedTx.txId, accountIds }
    let success = false
    let successCount = 0
    let retries = 0
    const maxRetry = 3
    const triedNodes = new Set<string>()

    if (queueEntry.executionGroup == null) return

    while (retries < maxRetry) {
      const executionNodeIds = queueEntry.executionGroup.map((node) => node.id)
      const randomExeNodeId = utils.getRandom(executionNodeIds, 1)[0]
      if (triedNodes.has(randomExeNodeId)) continue
      if (randomExeNodeId === Self.id) continue
      const nodeToAsk = nodes.get(randomExeNodeId)
      if (!nodeToAsk) {
        if (logFlags.error) this.mainLogger.error('requestInitialData: could not find node from execution group')
        throw new Error('requestInitialData: could not find node from execution group')
      }
      triedNodes.add(randomExeNodeId)
      retries++
      try {
        if (logFlags.debug)
          this.mainLogger.debug(
            `requestInitialData: txid: ${queueEntry.acceptedTx.txId} accountIds: ${utils.stringifyReduce(
              accountIds
            )}, asking node: ${nodeToAsk.id} ${nodeToAsk.externalPort} at timestamp ${shardusGetTime()}`
          )

        const requestMessage = message as RequestTxAndStateReq
        /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455101 ${shardusGetTime()} tx:${queueEntry.acceptedTx.txId} ${NodeList.activeIdToPartition.get(Self.id)}-->>${NodeList.activeIdToPartition.get(nodeToAsk.id)}: ${'request_tx_and_state'}`)
        const response = await Comms.askBinary<RequestTxAndStateReq, RequestTxAndStateResp>(
          nodeToAsk,
          InternalRouteEnum.binary_request_tx_and_state_before,
          requestMessage,
          serializeRequestTxAndStateReq,
          deserializeRequestTxAndStateResp,
          {}
        )

        if (response && response.stateList && response.stateList.length === accountIds.length) {
          this.mainLogger.debug(
            `requestInitialData: txid: ${queueEntry.logID} received data for ${response.stateList.length} accounts`
          )
        } else {
          this.mainLogger.error(`requestInitialData: txid: ${queueEntry.logID} response is null or incomplete`)
          continue
        }

        const results: WrappedResponses = {}
        const receipt2 = this.stateManager.getSignedReceipt(queueEntry)
        if (receipt2 == null) {
          return
        }
        if (receipt2.proposal.accountIDs.length !== response.stateList.length) {
          if (logFlags.error && logFlags.debug)
            this.mainLogger.error(`requestInitialData data.length not matching for tx ${queueEntry.logID}`)
          return
        }
        for (const data of response.stateList) {
          if (data == null) {
            /* prettier-ignore */
            if (logFlags.error && logFlags.debug) this.mainLogger.error(`requestInitialData data == null for tx ${queueEntry.logID}`);
            success = false
            break
          }
          const indexInVote = receipt2.proposal.accountIDs.indexOf(data.accountId)
          if (data.stateId === receipt2.proposal.beforeStateHashes[indexInVote]) {
            successCount++
            results[data.accountId] = data
            /* prettier-ignore */
            if (logFlags.debug) this.mainLogger.debug(`requestInitialData: txid: ${queueEntry.logID} success accountId: ${data.accountId} stateId: ${data.stateId}`);
          }
        }
        return results
      } catch (e) {
        nestedCountersInstance.countEvent('stateManager', 'requestInitialDataError')
        /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`requestInitialData: txid: ${queueEntry.logID} error: ${e.message}`)
      }
    }
    /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`requestInitialData: txid: ${queueEntry.logID} failed. successCount: ${successCount} accountIds: ${accountIds.length}`);
    profilerInstance.profileSectionEnd('requestInitialData')
  }

  resetReceiptsToForward(): void {
    const MAX_RECEIPT_AGE_MS = 15000 // 15s
    const now = shardusGetTime()
    // Clear receipts that are older than MAX_RECEIPT_AGE_MS
    for (const [key] of this.forwardedReceiptsByTimestamp) {
      if (now - key > MAX_RECEIPT_AGE_MS) {
        this.forwardedReceiptsByTimestamp.delete(key)
      }
    }
  }

  /**
   * Helper for processQueue to dump debug info
   * @param queueEntry
   * @param app
   */
  processQueue_debugAccountData(queueEntry: QueueEntry, app: Shardus.App): string {
    let debugStr = ''
    //if (logFlags.verbose) { //this function is always verbose
    if (queueEntry.uniqueKeys == null) {
      //TSConversion double check if this needs extra logging
      return queueEntry.logID + ' uniqueKeys empty error'
    }
    /* eslint-disable security/detect-object-injection */
    for (const key of queueEntry.uniqueKeys) {
      if (queueEntry.collectedData[key] != null) {
        debugStr += utils.makeShortHash(key) + ' : ' + app.getAccountDebugValue(queueEntry.collectedData[key]) + ', '
      }
    }
    /* eslint-enable security/detect-object-injection */
    //}
    return debugStr
  }

  /**
   * txWillChangeLocalData
   * This is a just in time check to see if a TX will modify any local accounts managed by this node.
   * Not longer used. candidate for deprecation, but this may be useful in some logging/analysis later
   *
   * @param queueEntry
   */
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
      // if (queueEntry.patchedOnNodes.has(ourNodeData.node.id)) {
      //   hasKey = true
      // }
      hasKey = nodeStoresThisPartition

      //if(queueEntry.localKeys[key] === true){
      if (hasKey) {
        const accountHash = this.stateManager.accountCache.getAccountHash(key)
        if (accountHash != null) {
          // if the timestamp of the TX is newer than any local writeable keys then this tx will change local data
          if (timestamp > accountHash.t) {
            return true
          }
        } else {
          //no cache entry means it will do something
          return true
        }
      }
    }
    return false
  }

  /**
   * This is a new function.  It must be called before calling dapp.apply().
   * The purpose is to do a last minute test to make sure that no involved accounts have a
   * timestamp newer than our transaction timestamp.
   * If they do have a newer timestamp we must fail the TX and vote for a TX fail receipt.
   */
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

  /**
   * Computes a sieve time for a TX.  This is a deterministic time bonus that is given so that
   * when TXs older than time M2 are getting culled due waiting on an older upstream TX
   * that we thin the list between time M2 and M2.5.  The idea is that this thinning
   * makes next in line TXs that are close to M2.5 more rare.  Node processing loops are not time synced with
   * each other at a real time level so different nodes may resolve TX as slightly different times.
   * This method hopes to improve the probablity nodes choose the same TX to work on after a TX has timed out.
   * TXs may time out if they are prepetually too old. Simply cutting off the younger TXs as an earlier time when blocked
   * such as time = M2 is not good enough because there is too much time jitter between nodes are working on that part of the list
   * this was causing nodes to all pick different TXs to work on.  When nodes pick differnt TXs the are all likely to just
   * age out to time M3 without ever getting enough votes.  The could happen at even 5tps for the same contract.
   * The time sieve helps this situation.
   *
   * At high TPS per single problems there are still issues recovering.  extraRare is feature designed to help
   * give scores in the top 1% an extra second of queue life.  hopefully if the list is thrahsing badly due to too many TXs
   * and nodes having bad luck picking the next one to work on that this extra second will give a better chance that everything syncs
   * back up.  This may not bee enough yet. but probably good for 1.2 refresh 1.  The downside to extra rare is that it makes the
   * tx only about 2 seconds away from the hard M3 timeout.  But this is a rare event also, so if it backfires then the impact should also be
   * low.  There may even be a chance that this would still help nodes sync up a bit.
   * @param queueEntry
   */
  computeTxSieveTime(queueEntry: QueueEntry): void {
    //TODO need to make this non-exploitable.  Need to include factors
    //that could not be set by the transaction creator, but are deterministic in the network.

    let score = 0
    //queueEntry.cycleToRecordOn
    const fourByteString = queueEntry.acceptedTx.txId.slice(0, 8)
    const intScore = Number.parseInt(fourByteString, 16)
    score = intScore / 4294967296.0 //2147483648.0   // 0-1 range

    score = Math.abs(score)

    let extraRare = false
    if (score > 0.99) {
      extraRare = true
    }

    //shape the curve so that smaller values are more common
    score = score * score * score

    score = Math.round(score * 10) / 10

    if (score > 1) {
      nestedCountersInstance.countEvent('stateManager', `computeTxSieveTime score > 1 ${score}`)
      score = 1
    } else {
      if (extraRare) {
        score = score + 0.3 //this may help sync things if there is a very high volume of TX to the same contract
      }

      nestedCountersInstance.countEvent('stateManager', `computeTxSieveTime score ${score}`)
    }

    //The score can give us up to one half of M extra time after M2 timeout.  (but a bit extra if extraRare)
    queueEntry.txSieveTime = 0.5 * this.stateManager.queueSitTime * score
  }

  updateSimpleStatsObject(
    statsObj: { [statName: string]: SimpleNumberStats },
    statName: string,
    duration: number
  ): void {
    // eslint-disable-next-line security/detect-object-injection
    let statsEntry = statsObj[statName]
    if (statsEntry == null) {
      statsEntry = {
        min: Number.MAX_SAFE_INTEGER,
        max: 0,
        total: 0,
        count: 0,
        average: 0,
      }
      // eslint-disable-next-line security/detect-object-injection
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

  getConsenusGroupForAccount(accountID: string): Shardus.Node[] {
    const { homePartition } = ShardFunctions.addressToPartition(
      this.stateManager.currentCycleShardData.shardGlobals,
      accountID
    )
    const homeShardData = this.stateManager.currentCycleShardData.parititionShardDataMap.get(homePartition)
    const consenusGroup = homeShardData.homeNodes[0].consensusNodeForOurNodeFull.slice()
    return consenusGroup
  }

  getRandomConsensusNodeForAccount(accountID: string, excludeNodeIds: string[] = []): Shardus.Node {
    const { homePartition } = ShardFunctions.addressToPartition(
      this.stateManager.currentCycleShardData.shardGlobals,
      accountID
    )
    const homeShardData = this.stateManager.currentCycleShardData.parititionShardDataMap.get(homePartition)
    //dont need to copy list
    const consenusGroup = homeShardData.homeNodes[0].consensusNodeForOurNodeFull

    // remove excluded consensus nodes
    const filteredConsensusGroup = consenusGroup.filter((node) => excludeNodeIds.indexOf(node.id) === -1)

    let maxRetry = 5
    let potentialNode: Shardus.Node
    let invalidNode: boolean
    do {
      potentialNode = filteredConsensusGroup[Math.floor(Math.random() * filteredConsensusGroup.length)]
      invalidNode = isNodeInRotationBounds(potentialNode.id)
      maxRetry--
    } while (invalidNode && maxRetry > 0)

    return potentialNode
  }

  getStorageGroupForAccount(accountID: string): Shardus.Node[] {
    const { homePartition } = ShardFunctions.addressToPartition(
      this.stateManager.currentCycleShardData.shardGlobals,
      accountID
    )
    const homeShardData = this.stateManager.currentCycleShardData.parititionShardDataMap.get(homePartition)
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

  /** count the number of queue entries that will potentially execute on this node */
  getExecuteQueueLength(): number {
    let length = 0
    for (const queueEntry of this._transactionQueue) {
      //TODO shard hopping will have to consider if updating this value is imporant to how our load detection works.
      //probably not since it is a zero sum game if we move it
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
        /* prettier-ignore */ if (logFlags.verbose) console.log( 'getAccountQueueCount: found upstream tx in the injested queue:', `appData: ${Utils.safeStringify(tx.appData)}` )
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
        /* prettier-ignore */ if (logFlags.verbose) console.log( 'getAccountQueueCount: found upstream tx in the newAccepted queue:', `appData: ${Utils.safeStringify(tx.appData)}` )
        count++
      }
    }
    /* prettier-ignore */ if (logFlags.verbose) console.log(`getAccountQueueCount: remote:${remote} ${count} acc:${utils.stringifyReduce(accountID)}`)
    return { count, committingAppData }
  }

  isAccountInQueue(accountID: string, remote = false): boolean {
    for (const queueEntry of this.pendingTransactionQueue) {
      if (queueEntry.uniqueKeys.includes(accountID)) {
        const memoryPatterns = queueEntry.acceptedTx.shardusMemoryPatterns
        if (queueEntry.txKeys.sourceKeys.length > 0 && accountID === queueEntry.txKeys.sourceKeys[0]) {
          /* prettier-ignore */ if (logFlags.verbose) console.log( 'isAccountInQueue: found upstream tx in the' +
            ' injested' +
            ' queue:' )
          nestedCountersInstance.countEvent('stateManager', `isAccountInQueue of injested`)
          return true
        }
        const rw = memoryPatterns?.rw
        const wo = memoryPatterns?.wo
        if ((rw && rw.includes(accountID)) || (wo && wo.includes(accountID))) {
          /* prettier-ignore */ if (logFlags.verbose) console.log( 'isAccountInQueue: found upstream tx in the' +
            ' injested' +
            ' queue:' )
          nestedCountersInstance.countEvent('stateManager', `isAccountInQueue rw or wo of injested`)
          return true
        }
      }
    }
    for (const queueEntry of this._transactionQueue) {
      if (queueEntry.uniqueKeys.includes(accountID)) {
        const memoryPatterns = queueEntry.acceptedTx.shardusMemoryPatterns
        if (queueEntry.txKeys.sourceKeys.length > 0 && accountID === queueEntry.txKeys.sourceKeys[0]) {
          /* prettier-ignore */ if (logFlags.verbose) console.log( 'isAccountInQueue: found upstream tx in the' +
            ' newAccepted' +
            ' queue:' )
          nestedCountersInstance.countEvent('stateManager', `isAccountInQueue of newAccepted`)
          return true
        }
        const rw = memoryPatterns?.rw
        const wo = memoryPatterns?.wo
        if ((rw && rw.includes(accountID)) || (wo && wo.includes(accountID))) {
          /* prettier-ignore */ if (logFlags.verbose) console.log( 'isAccountInQueue: found upstream tx in the' +
            ' newAccepted' +
            ' queue:' )
          nestedCountersInstance.countEvent('stateManager', `isAccountInQueue rw or wo of newAccepted`)
          return true
        }
      }
    }
    /* prettier-ignore */ if (logFlags.verbose) console.log(`isAccountInQueue: false`)
    return false
  }

  /**
   * call this to test if the processing queue is stuck.
   * currently this may return false positives if the queue is not stuck but is just slow
   * autoUnstickProcessing will attempt to fix the stuck processing if set to true
   */
  checkForStuckProcessing(): void {
    const timeSinceLastProcessLoop = shardusGetTime() - this.processingLastRunTime
    const limitInMS = this.config.stateManager.stuckProcessingLimit * 1000

    if (timeSinceLastProcessLoop > limitInMS) {
      if (this.isStuckProcessing === false) {
        this.isStuckProcessing = true
        //we are now newly stuck processing
        this.onProcesssingQueueStuck()
        this.stuckProcessingCount++
      }
      nestedCountersInstance.countEvent('processing', 'processingStuckThisCycle')
      this.stuckProcessingCyclesCount++
      if (this.transactionProcessingQueueRunning) {
        this.stuckProcessingQueueLockedCyclesCount++
      }

      if (this.config.stateManager.autoUnstickProcessing === true) {
        this.fixStuckProcessing(true)
        //seems we should do this too:
        this.stateManager.forceUnlockAllFifoLocks('autoUnstickProcessing')
      }
    }
  }

  /**
   * This is called when we detect that the processing queue is stuck
   */
  onProcesssingQueueStuck(): void {
    if (this.stuckProcessingCount === 0) {
      //first time!
      nestedCountersInstance.countRareEvent('processing', `onProcesssingQueueStuck`)

      this.statemanager_fatal(
        `onProcesssingQueueStuck`,
        `onProcesssingQueueStuck: ${Utils.safeStringify(this.getDebugProccessingStatus())}`
      )
    }

    //clear this map as it would be stale now
    this.stateManager.lastSeenAccountsMap = null

    //in the future we could tell the node to go apop?
    if (this.config.stateManager.apopFromStuckProcessing === true) {
      Apoptosis.apoptosizeSelf(
        'Apoptosized due to stuck processing',
        'Node stopped due to transactions stuck processing.'
      )
    }
  }

  getDebugStuckTxs(opts): unknown {
    const txStates = [
      'syncing',
      'aging',
      'processing',
      'awaiting data',
      'consensing',
      'await repair',
      'await final data',
      'committing',
      'canceled',
    ]

    const stateIndex = txStates.indexOf(opts.state)
    if (stateIndex === -1) {
      return `${opts.state} is not a valid tx state.`
    }

    const queueItems = this.getQueueItems()
    const stuckTxs = queueItems.filter((queueEntry) => {
      const queueStateIndex = txStates.indexOf(queueEntry.state)
      return (
        queueEntry.txAge > opts.minAge &&
        queueEntry.state &&
        (opts.nextStates ? queueStateIndex >= stateIndex : queueStateIndex === stateIndex)
      )
    })

    return stuckTxs
  }

  getDebugProccessingStatus(): unknown {
    let txDebug = ''
    if (this.debugRecentQueueEntry != null) {
      const app = this.app
      const queueEntry = this.debugRecentQueueEntry
      txDebug = `logID:${queueEntry.logID} state:${queueEntry.state} hasAll:${queueEntry.hasAll} globalMod:${queueEntry.globalModification}`
      txDebug += ` qId: ${queueEntry.entryID} values: ${this.processQueue_debugAccountData(
        queueEntry,
        app
      )} AcceptedTransaction: ${utils.stringifyReduce(queueEntry.acceptedTx)}`
    }
    return {
      isStuckProcessing: this.isStuckProcessing,
      transactionProcessingQueueRunning: this.transactionProcessingQueueRunning,
      stuckProcessingCount: this.stuckProcessingCount,
      stuckProcessingCyclesCount: this.stuckProcessingCyclesCount,
      stuckProcessingQueueLockedCyclesCount: this.stuckProcessingQueueLockedCyclesCount,
      processingLastRunTime: this.processingLastRunTime,
      debugLastProcessingQueueStartTime: this.debugLastProcessingQueueStartTime,
      debugLastAwaitedCall: this.debugLastAwaitedCall,
      debugLastAwaitedCallInner: this.debugLastAwaitedCallInner,
      debugLastAwaitedAppCall: this.debugLastAwaitedAppCall,
      debugLastAwaitedCallInnerStack: this.debugLastAwaitedCallInnerStack,
      debugLastAwaitedAppCallStack: this.debugLastAwaitedAppCallStack,
      txDebug,
      //todo get the transaction we are stuck on. what type is it? id etc.
    }
  }

  clearStuckProcessingDebugVars(): void {
    this.isStuckProcessing = false
    this.debugLastAwaitedCall = ''
    this.debugLastAwaitedCallInner = ''
    this.debugLastAwaitedAppCall = ''
    this.debugLastAwaitedCallInnerStack = {}
    this.debugLastAwaitedAppCallStack = {}

    this.debugRecentQueueEntry = null
    this.debugLastProcessingQueueStartTime = 0

    this.stuckProcessingCount = 0
    this.stuckProcessingCyclesCount = 0
    this.stuckProcessingQueueLockedCyclesCount = 0
  }

  /**
   * Used to unblock and restart the processing queue if it gets stuck
   * @param clearPendingTransactions if true, will clear the pending transaction queue. if false, will leave it alone
   */
  fixStuckProcessing(clearPendingTransactions: boolean): void {
    nestedCountersInstance.countRareEvent('processing', `unstickProcessing`)
    this.clearStuckProcessingDebugVars()

    //clear this map as it would be stale now
    this.stateManager.lastSeenAccountsMap = null
    //unlock the queu so it can start again
    this.transactionProcessingQueueRunning = false

    if (clearPendingTransactions) {
      this.pendingTransactionQueue = []
    }

    this.stateManager.tryStartTransactionProcessingQueue()
  }

  setDebugLastAwaitedCall(label: string, complete = DebugComplete.Incomplete): void {
    this.debugLastAwaitedCall = label + (complete === DebugComplete.Completed ? ' complete' : '')
    this.debugLastAwaitedCallInner = ''
    this.debugLastAwaitedAppCall = ''
  }

  setDebugLastAwaitedCallInner(label: string, complete = DebugComplete.Incomplete): void {
    this.debugLastAwaitedCallInner = label + (complete === DebugComplete.Completed ? ' complete' : '')
    this.debugLastAwaitedAppCall = ''

    if (complete === DebugComplete.Incomplete) {
      // eslint-disable-next-line security/detect-object-injection
      if (this.debugLastAwaitedCallInnerStack[label] == null) {
        // eslint-disable-next-line security/detect-object-injection
        this.debugLastAwaitedCallInnerStack[label] = 1
      } else {
        // eslint-disable-next-line security/detect-object-injection
        this.debugLastAwaitedCallInnerStack[label]++
      }
    } else {
      //decrement the count if it is greater than 1, delete the key if the count is 1
      // eslint-disable-next-line security/detect-object-injection
      if (this.debugLastAwaitedCallInnerStack[label] != null) {
        // eslint-disable-next-line security/detect-object-injection
        if (this.debugLastAwaitedCallInnerStack[label] > 1) {
          // eslint-disable-next-line security/detect-object-injection
          this.debugLastAwaitedCallInnerStack[label]--
        } else {
          // eslint-disable-next-line security/detect-object-injection
          delete this.debugLastAwaitedCallInnerStack[label]
        }
      }
    }
  }
  setDebugSetLastAppAwait(label: string, complete = DebugComplete.Incomplete): void {
    this.debugLastAwaitedAppCall = label + (complete === DebugComplete.Completed ? ' complete' : '')

    if (complete === DebugComplete.Incomplete) {
      // eslint-disable-next-line security/detect-object-injection
      if (this.debugLastAwaitedAppCallStack[label] == null) {
        // eslint-disable-next-line security/detect-object-injection
        this.debugLastAwaitedAppCallStack[label] = 1
      } else {
        // eslint-disable-next-line security/detect-object-injection
        this.debugLastAwaitedAppCallStack[label]++
      }
    } else {
      //decrement the count if it is greater than 1, delete the key if the count is 1
      // eslint-disable-next-line security/detect-object-injection
      if (this.debugLastAwaitedAppCallStack[label] != null) {
        // eslint-disable-next-line security/detect-object-injection
        if (this.debugLastAwaitedAppCallStack[label] > 1) {
          // eslint-disable-next-line security/detect-object-injection
          this.debugLastAwaitedAppCallStack[label]--
        } else {
          // eslint-disable-next-line security/detect-object-injection
          delete this.debugLastAwaitedAppCallStack[label]
        }
      }
    }
  }

  addressCountInQueue(address: string, limit: number): number {
    let count = 0
    for (const queueEntry of this._transactionQueue) {
      // Add check to ensure uniqueKeys exists and is an array before calling includes
      if (queueEntry.uniqueKeys && Array.isArray(queueEntry.uniqueKeys) && queueEntry.uniqueKeys.includes(address)) {
        count++
        if (count > limit) {
          return count
        }
      }
    }
    return count
  }

  findEntryWithAnyTag(tags: {
    [key: string]: string
  }): { entry: QueueEntry; matchedKey: string; matchedValue: string } | null {
    const tagEntries = Object.entries(tags)

    for (const entry of this.pendingTransactionQueue) {
      if (entry.uniqueTags) {
        for (const [key, value] of tagEntries) {
          if (value && entry.uniqueTags[key] === value) {
            return { entry, matchedKey: key, matchedValue: value }
          }
        }
      }
    }

    for (const entry of this._transactionQueue) {
      if (entry.uniqueTags) {
        for (const [key, value] of tagEntries) {
          if (value && entry.uniqueTags[key] === value) {
            return { entry, matchedKey: key, matchedValue: value }
          }
        }
      }
    }

    return null
  }

  clearQueueItems(minAge: number): number {
    let count = 0
    try {
      const currentTime = shardusGetTime()
      for (let i = this._transactionQueue.length - 1; i >= 0; i--) {
        const queueEntry = this._transactionQueue[i]
        const txAge = currentTime - queueEntry.acceptedTx.timestamp
        if (txAge > minAge) {
          this.removeFromQueue(queueEntry, i)
          count++
        }
      }
    } catch (e) {
      console.error('clearQueueItems error:', e)
    }
    return count
  }
  getQueueItems(): any[] {
    return this._transactionQueue.map((queueEntry) => {
      return this.getDebugQueueInfo(queueEntry)
    })
  }
  getQueueItemById(txId: string): any {
    if (this._transactionQueueByID.has(txId)) return this.getDebugQueueInfo(this._transactionQueueByID.get(txId))
    if (this.archivedQueueEntriesByID.has(txId)) return this.getDebugQueueInfo(this.archivedQueueEntriesByID.get(txId))
    return null
  }
  getDebugQueueInfo(queueEntry: QueueEntry): any {
    return {
      txId: queueEntry.acceptedTx.txId,
      tx: queueEntry.acceptedTx,
      logID: queueEntry.logID,
      nodeId: Self.id,
      state: queueEntry.state,
      hasAll: queueEntry.hasAll,
      hasShardInfo: queueEntry.hasShardInfo,
      isExecutionNode: queueEntry.isInExecutionHome,
      globalModification: queueEntry.globalModification,
      entryID: queueEntry.entryID,
      txGroupCyle: queueEntry.txGroupCycle,
      uniqueKeys: queueEntry.uniqueKeys,
      collectedData: queueEntry.collectedData,
      finalData: queueEntry.collectedFinalData,
      preApplyResult: queueEntry.preApplyTXResult,
      txAge: shardusGetTime() - queueEntry.acceptedTx.timestamp,
      lastFinalDataRequestTimestamp: queueEntry.lastFinalDataRequestTimestamp,
      dataSharedTimestamp: queueEntry.dataSharedTimestamp,
      firstVoteTimestamp: queueEntry.firstVoteReceivedTimestamp,
      lastVoteTimestamp: queueEntry.lastVoteReceivedTimestamp,
      // firstConfirmationsTimestamp: queueEntry.firstConfirmOrChallengeTimestamp,
      // robustBestConfirmation: queueEntry.receivedBestConfirmation,
      // robustBestVote: queueEntry.receivedBestVote,
      // robustBestChallenge: queueEntry.receivedBestChallenge,
      // completedRobustVote: queueEntry.robustQueryVoteCompleted,
      // completedRobustChallenge: queueEntry.robustQueryConfirmOrChallengeCompleted,
      txDebug: queueEntry.txDebug,
      executionDebug: queueEntry.executionDebug,
      waitForReceiptOnly: queueEntry.waitForReceiptOnly,
      ourVote: queueEntry.ourVote || null,
      signedReceipt: this.stateManager.getSignedReceipt(queueEntry) || null,
      // uniqueChallenges: queueEntry.uniqueChallengesCount,
      collectedVoteCount: queueEntry.collectedVoteHashes.length,
      simpleDebugStr: this.app.getSimpleTxDebugValue ? this.app.getSimpleTxDebugValue(queueEntry.acceptedTx?.data) : '',
    }
  }
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  removeTxFromArchivedQueue(txId: string) {
    // remove from the archived queue array and map by txId
    const index = this.archivedQueueEntries.findIndex((queueEntry) => queueEntry.acceptedTx.txId === txId)
    if (index !== -1) {
      this.mainLogger.debug(`Removing tx ${txId} from archived queue`)
      this.archivedQueueEntries.splice(index, 1)
    }
    if (this.archivedQueueEntriesByID.has(txId)) delete this.archivedQueueEntriesByID[txId]
  }
  updateTxState(queueEntry: QueueEntry, nextState: string, context = ''): void {
    if (logFlags.seqdiagram)
      if (context == '') {
        /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455104 ${shardusGetTime()} tx:${queueEntry.acceptedTx.txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: ${queueEntry.state}-${nextState}`)
      } else {
        /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455104 ${shardusGetTime()} tx:${queueEntry.acceptedTx.txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: ${queueEntry.state}-${nextState}:${context}`)
      }
    const currentState = queueEntry.state
    this.txDebugMarkEndTime(queueEntry, currentState)
    queueEntry.state = nextState
    this.txDebugMarkStartTime(queueEntry, nextState)
  }
  txDebugMarkStartTime(queueEntry: QueueEntry, state: string): void {
    if (queueEntry.txDebug.startTime[state] == null) {
      queueEntry.txDebug.startTime[state] = process.hrtime()
      queueEntry.txDebug.startTimestamp[state] = shardusGetTime()
    }
  }
  txDebugMarkEndTime(queueEntry: QueueEntry, state: string): void {
    if (queueEntry.txDebug.startTime[state]) {
      const endTime = process.hrtime(queueEntry.txDebug.startTime[state])
      queueEntry.txDebug.endTime[state] = endTime
      queueEntry.txDebug.endTimestamp[state] = shardusGetTime()

      const durationInNanoseconds = endTime[0] * 1e9 + endTime[1]
      const durationInMilliseconds = durationInNanoseconds / 1e6

      queueEntry.txDebug.duration[state] = durationInMilliseconds

      delete queueEntry.txDebug.startTime[state]
      delete queueEntry.txDebug.endTime[state]
    }
  }
  clearDebugAwaitStrings(): void {
    this.debugLastAwaitedCall = ''
    this.debugLastAwaitedCallInner = ''
    this.debugLastAwaitedAppCall = ''
    this.debugLastAwaitedCallInnerStack = {}
    this.debugLastAwaitedAppCallStack = {}
  }

  getQueueLengthBuckets(): any {
    try {
      const buckets = { c15: 0, c60: 0, c120: 0, c600: 0 }

      if (!this._transactionQueue || this._transactionQueue.length === 0) {
        return buckets
      }

      const currentTime = shardusGetTime()

      this._transactionQueue.forEach((queueEntry) => {
        if (queueEntry && queueEntry.acceptedTx && queueEntry.acceptedTx.timestamp) {
          const txAgeInSeconds = (currentTime - queueEntry.acceptedTx.timestamp) / 1000

          if (txAgeInSeconds >= 15 && txAgeInSeconds < 60) {
            buckets.c15++
          } else if (txAgeInSeconds >= 60 && txAgeInSeconds < 120) {
            buckets.c60++
          } else if (txAgeInSeconds >= 120 && txAgeInSeconds < 600) {
            buckets.c120++
          } else if (txAgeInSeconds >= 600) {
            buckets.c600++
          }
        }
      })
      return buckets
    } catch (e) {
      return {}
    }
  }
}

Object.assign(TransactionQueue.prototype, handlers);
Object.assign(TransactionQueue.prototype, coreMethods);
Object.assign(TransactionQueue.prototype, factMethods);
Object.assign(TransactionQueue.prototype, nonceMethods);
Object.assign(TransactionQueue.prototype, entryMethods);
Object.assign(TransactionQueue.prototype, seenMethods);

export default TransactionQueue
