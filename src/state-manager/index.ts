import Shardus from '../shardus'
import * as ShardusTypes from '../shardus/shardus-types'

import { P2P as P2PTypes, StateManager as StateManagerTypes } from '@shardeum-foundation/lib-types'

import { isNodeDown, isNodeLost, isNodeUpRecent } from '../p2p/Lost'

import ShardFunctions from './shardFunctions'

import EventEmitter from 'events'
import * as utils from '../utils'

import { Utils } from '@shardeum-foundation/lib-types'

// not sure about this.
import { ReceiptMapResult } from '@shardeum-foundation/lib-types/build/src/state-manager/StateManagerTypes'
import { timingSafeEqual } from 'crypto'
import { Logger as Log4jsLogger } from 'log4js'
import Crypto from '../crypto'
import { isServiceMode } from '../debug'
import Logger, { logFlags } from '../logger'
import { shardusGetTime } from '../network'
import * as Comms from '../p2p/Comms'
import * as Context from '../p2p/Context'
import { P2PModuleContext as P2P } from '../p2p/Context'
import * as CycleChain from '../p2p/CycleChain'
import * as NodeList from '../p2p/NodeList'
import { activeByIdOrder, byIdOrder } from '../p2p/NodeList'
import * as Self from '../p2p/Self'
import Storage from '../storage'
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum'
import {
  GetAccountDataWithQueueHintsReqSerializable,
  serializeGetAccountDataWithQueueHintsReq
} from '../types/GetAccountDataWithQueueHintsReq'
import {
  deserializeGetAccountDataWithQueueHintsResp,
  GetAccountDataWithQueueHintsRespSerializable
} from '../types/GetAccountDataWithQueueHintsResp'
import {
  GetAccountQueueCountReq,
  serializeGetAccountQueueCountReq
} from '../types/GetAccountQueueCountReq'
import {
  deserializeGetAccountQueueCountResp,
  GetAccountQueueCountResp
} from '../types/GetAccountQueueCountResp'
// GetAccountDataByRange types are not needed in this file
import { ResponseError } from '../types/ResponseError'
import { nestedCountersInstance } from '../utils/nestedCounters'
import Profiler from '../utils/profiler'
import AccountCache from './AccountCache'
import AccountGlobals from './AccountGlobals'
import AccountPatcher from './AccountPatcher'
import AccountSync from './AccountSync'
import CachedAppDataManager from './CachedAppDataManager'
import PartitionObjects from './PartitionObjects'
import PartitionStats from './PartitionStats'
import {
  AcceptedTx,
  AccountCopy,
  AccountFilter,
  AccountHashCache,
  CycleDebugNotes,
  CycleShardData,
  DebugDumpNodesCovered,
  DebugDumpPartition,
  DebugDumpPartitions,
  DebugDumpPartitionSkip,
  DebugDumpRangesCovered,
  FifoLockObjectMap,
  GetAccountDataByRangeSmart,
  GetAccountDataWithQueueHintsResp,
  LocalCachedData,
  MainHashResults,
  PartitionReceipt,
  Proposal,
  QueueCountsResponse,
  QueueCountsResult,
  QueueEntry,
  RequestAccountQueueCounts,
  SignedReceipt,
  SimpleDistanceObject,
  StringBoolObjectMap,
  TimestampRemoveRequest,
  WrappedResponses,
  WrappedStateArray
} from './state-manager-types'
import TransactionConsenus from './TransactionConsensus'
import TransactionQueue, { DebugComplete } from './TransactionQueue'
import TransactionRepair from './TransactionRepair'
import { endpointMethods } from './Endpoints'
import { fifoMethods } from './FIFO'
import { receiptMethods } from './Receipt'
import { remoteAccountMethods } from './RemoteAccount'
import { shardMethods } from './Shard'
import { utilsMethods } from './Utils'

export type Callback = (...args: unknown[]) => void

/**
 * WrappedEventEmitter just a default extended WrappedEventEmitter
 * using EventEmitter was causing issues?
 */
class WrappedEventEmitter extends EventEmitter {
  constructor() {
    super()
  }
}

/**
 * StateManager
 */
// Interface declaration for methods from split files
interface StateManager {
  // Methods from Endpoints.ts
  registerEndpoints(): void
  _unregisterEndpoints(): void
  _registerListener(emitter: EventEmitter, event: string, callback: Callback): void
  _unregisterListener(event: string): void
  _cleanupListeners(): void

  // Methods from FIFO.ts
  fifoLock(fifoName: string): Promise<number>
  fifoUnlock(fifoName: string, id: number): void
  bulkFifoLockAccounts(accountIDs: string[]): Promise<number[]>
  bulkFifoUnlockAccounts(accountIDs: string[], ourLocks: number[]): void
  getLockedFifoAccounts(): FifoLockObjectMap
  forceUnlockAllFifoLocks(tag: string): number
  clearStaleFifoLocks(): void

  // Methods from Receipt.ts
  getSignedReceipt(queueEntry: QueueEntry): SignedReceipt
  hasReceipt(queueEntry: QueueEntry): boolean
  getReceiptResult(queueEntry: QueueEntry): boolean
  getReceiptProposal(queueEntry: QueueEntry): Proposal
  generateReceiptMapResults(lastCycle: ShardusTypes.Cycle): ReceiptMapResult[]

  // Methods from RemoteAccount.ts
  getLocalOrRemoteAccountQueueCount(address: string): Promise<QueueCountsResult>
  getLocalOrRemoteAccount(address: string, opts?: { useRICache: boolean; canThrowException?: boolean }): Promise<ShardusTypes.WrappedDataFromQueue | null>
  getAccountFailDump(address: string, message: string): void
  getRemoteAccount(address: string): Promise<unknown>

  // Methods from Shard.ts
  updateShardValues(cycleNumber: number, mode: P2PTypes.ModesTypes.Record['mode']): void
  calculateChangeInCoverage(): void
  getCurrentCycleShardData(): CycleShardData | null
  hasCycleShardData(): boolean
  waitForShardCalcs(): Promise<void>

  // Methods from Utils.ts
  debugNodeGroup(key: string, key2: number, msg: string, nodes: P2PTypes.P2PTypes.NodeInfo[]): void
  getRandomInt(max: number): number
  tryGetBoolProperty(parent: Record<string, unknown>, propertyName: string, defaultValue: boolean): boolean
  testFailChance(failChance: number, debugName: string, key: string, message: string, verboseRequired: boolean): boolean
  startCatchUpQueue(): Promise<void>
  recordPotentialBadnode(): void
  writeCombinedAccountDataToBackups(goodAccounts: ShardusTypes.WrappedData[], failedHashes: string[]): Promise<number>
  getAccountDataByRangeSmart(accountStart: string, accountEnd: string, tsStart: number, maxRecords: number, offset: number, accountOffset: string): Promise<GetAccountDataByRangeSmart>
  testAccountDataWrapped(accountDataList: ShardusTypes.WrappedData[]): void
  checkAndSetAccountData(accountRecords: ShardusTypes.WrappedData[], note: string, processStats: boolean, updatedAccounts?: string[]): Promise<string[]>
}

class StateManager {
  //  class StateManager {

  shardus: Shardus
  app: ShardusTypes.App
  storage: Storage
  p2p: P2P
  crypto: Crypto
  config: ShardusTypes.StrictServerConfiguration
  profiler: Profiler

  mainLogger: Log4jsLogger
  fatalLogger: Log4jsLogger
  shardLogger: Log4jsLogger
  statsLogger: Log4jsLogger

  eventEmitter: WrappedEventEmitter

  //Sub modules
  partitionStats: PartitionStats
  accountCache: AccountCache
  accountSync: AccountSync
  accountGlobals: AccountGlobals
  transactionQueue: TransactionQueue
  private transactionRepair: TransactionRepair
  transactionConsensus: TransactionConsenus
  partitionObjects: PartitionObjects
  accountPatcher: AccountPatcher
  cachedAppDataManager: CachedAppDataManager

  // syncTrackers:SyncTracker[];
  shardValuesByCycle: Map<number, CycleShardData>
  currentCycleShardData: CycleShardData | null
  globalAccountsSynced: boolean

  dataRepairsCompleted: number
  dataRepairsStarted: number
  useStoredPartitionsForReport: boolean

  partitionReceiptsByCycleCounter: { [cycleKey: string]: PartitionReceipt[] } //Object.<string, PartitionReceipt[]> // a map of cycle keys to lists of partition receipts.
  ourPartitionReceiptsByCycleCounter: { [cycleKey: string]: PartitionReceipt } //Object.<string, PartitionReceipt> //a map of cycle keys to lists of partition receipts.

  fifoLocks: FifoLockObjectMap

  lastSeenAccountsMap: { [accountId: string]: QueueEntry }

  appFinishedSyncing: boolean

  debugNoTxVoting: boolean
  debugSkipPatcherRepair: boolean

  ignoreRecieptChance: number
  ignoreVoteChance: number
  loseTxChance: number
  failReceiptChance: number
  voteFlipChance: number
  failNoRepairTxChance: number

  syncSettleTime: number
  debugTXHistory: { [id: string]: string } // need to disable or clean this as it will leak memory

  stateIsGood_txHashsetOld: boolean
  stateIsGood_accountPartitions: boolean
  stateIsGood_activeRepairs: boolean
  stateIsGood: boolean

  // oldFeature_TXHashsetTest: boolean
  // oldFeature_GeneratePartitionReport: boolean
  // oldFeature_BroadCastPartitionReport: boolean
  // useHashSets: boolean //Old feature but must stay on (uses hash set string vs. older method)

  feature_receiptMapResults: boolean
  feature_partitionHashes: boolean
  feature_generateStats: boolean
  feature_useNewParitionReport: boolean // old way uses generatePartitionObjects to build a report

  debugFeature_dumpAccountData: boolean
  debugFeature_dumpAccountDataFromSQL: boolean

  debugFeatureOld_partitionReciepts: boolean // depends on old partition report features.

  logger: Logger

  extendedRepairLogging: boolean

  consensusLog: boolean

  //canDataRepair: boolean // the old repair.. todo depricate further.
  lastActiveNodeCount: number

  doDataCleanup: boolean

  _listeners: Record<string, [EventEmitter, () => void]> //Event listners

  queueSitTime: number
  dataPhaseTag: string

  preTXQueue: AcceptedTx[] // mostly referenced in commented out code for queing up TXs before systems are ready.

  lastShardCalculationTS: number

  firstTimeToRuntimeSync: boolean

  lastShardReport: string

  processCycleSummaries: boolean // controls if we execute processPreviousCycleSummaries() at cycle_q1_start

  cycleDebugNotes: CycleDebugNotes

  superLargeNetworkDebugReduction: boolean

  lastActiveCount: number

  useAccountWritesOnly: boolean
  reinjectTxsMap: Map<string, number>

  // idk if this copy is needed. there's a function called getSyncTrackerRanges in AccountPatcher.ts that looks like
  // it does the same thing. just doing this as a temp measure to move fast
  coverageChangesCopy: { start: number; end: number }[]
  /***
   *     ######   #######  ##    ##  ######  ######## ########  ##     ##  ######  ########  #######  ########
   *    ##    ## ##     ## ###   ## ##    ##    ##    ##     ## ##     ## ##    ##    ##    ##     ## ##     ##
   *    ##       ##     ## ####  ## ##          ##    ##     ## ##     ## ##          ##    ##     ## ##     ##
   *    ##       ##     ## ## ## ##  ######     ##    ########  ##     ## ##          ##    ##     ## ########
   *    ##       ##     ## ##  ####       ##    ##    ##   ##   ##     ## ##          ##    ##     ## ##   ##
   *    ##    ## ##     ## ##   ### ##    ##    ##    ##    ##  ##     ## ##    ##    ##    ##     ## ##    ##
   *     ######   #######  ##    ##  ######     ##    ##     ##  #######   ######     ##     #######  ##     ##
   */
  constructor(
    profiler: Profiler,
    app: ShardusTypes.App,
    logger: Logger,
    storage: Storage,
    p2p: P2P,
    crypto: Crypto,
    config: ShardusTypes.StrictServerConfiguration,
    shardus: Shardus
  ) {
    //super()

    this.shardus = shardus
    this.p2p = p2p
    this.crypto = crypto
    this.storage = storage
    this.app = app
    this.logger = logger
    this.config = config
    this.profiler = profiler

    this.eventEmitter = new WrappedEventEmitter()

    //BLOCK1
    this._listeners = {}

    this.queueSitTime = 6000 // todo make this a setting. and tie in with the value in consensus
    this.syncSettleTime = this.queueSitTime + 2000 // 3 * 10 // an estimate of max transaction settle time. todo make it a config or function of consensus later

    this.lastSeenAccountsMap = null

    this.appFinishedSyncing = false
    this.useAccountWritesOnly = false

    //BLOCK2

    //BLOCK3
    this.dataPhaseTag = 'DATASYNC: '

    //BLOCK4
    this.lastActiveNodeCount = 0

    this.extendedRepairLogging = true
    this.consensusLog = false

    this.shardValuesByCycle = new Map()
    this.currentCycleShardData = null as CycleShardData | null
    this.preTXQueue = []

    this.configsInit()

    // Bind methods from split files BEFORE initializing modules
    Object.assign(StateManager.prototype, endpointMethods)
    Object.assign(StateManager.prototype, fifoMethods)
    Object.assign(StateManager.prototype, receiptMethods)
    Object.assign(StateManager.prototype, remoteAccountMethods)
    Object.assign(StateManager.prototype, shardMethods)
    Object.assign(StateManager.prototype, utilsMethods)

    //INIT our various modules

    this.accountCache = new AccountCache(this, profiler, app, logger, crypto, config)

    this.partitionStats = new PartitionStats(this, profiler, app, logger, crypto, config, this.accountCache)
    this.partitionStats.summaryPartitionCount = 4096 //32
    this.partitionStats.initSummaryBlobs()

    this.accountSync = new AccountSync(this, profiler, app, logger, storage, p2p, crypto, config)

    this.accountGlobals = new AccountGlobals(this, profiler, app, logger, storage, p2p, crypto, config)
    this.transactionQueue = new TransactionQueue(this, profiler, app, logger, storage, p2p, crypto, config)

    this.transactionRepair = new TransactionRepair(this, profiler, app, logger, storage, p2p, crypto, config)

    this.transactionConsensus = new TransactionConsenus(this, profiler, app, logger, storage, p2p, crypto, config)
    this.partitionObjects = new PartitionObjects(this, profiler, app, logger, storage, p2p, crypto, config)
    this.accountPatcher = new AccountPatcher(this, profiler, app, logger, p2p, crypto, config)
    this.cachedAppDataManager = new CachedAppDataManager(this, profiler, app, logger, crypto, p2p, config)

    // feature controls.
    // this.oldFeature_TXHashsetTest = true
    // this.oldFeature_GeneratePartitionReport = false
    // this.oldFeature_BroadCastPartitionReport = true // leaving this true since it depends on the above value

    this.processCycleSummaries = false //starts false and get enabled when startProcessingCycleSummaries() is called
    this.debugSkipPatcherRepair = config.debug.skipPatcherRepair

    this.feature_receiptMapResults = true
    this.feature_partitionHashes = true
    this.feature_generateStats = false

    this.feature_useNewParitionReport = true

    this.debugFeature_dumpAccountData = true
    this.debugFeature_dumpAccountDataFromSQL = false
    this.debugFeatureOld_partitionReciepts = false

    this.stateIsGood_txHashsetOld = true
    this.stateIsGood_activeRepairs = true
    this.stateIsGood = true

    // other debug features
    if (this.config && this.config.debug) {
      this.feature_useNewParitionReport = this.tryGetBoolProperty(
        this.config.debug,
        'useNewParitionReport',
        this.feature_useNewParitionReport
      )

      this.debugFeature_dumpAccountDataFromSQL = this.tryGetBoolProperty(
        this.config.debug,
        'dumpAccountReportFromSQL',
        this.debugFeature_dumpAccountDataFromSQL
      )
    }

    this.cycleDebugNotes = {
      repairs: 0,
      lateRepairs: 0,
      patchedAccounts: 0,
      badAccounts: 0,
      noRcptRepairs: 0,
    }

    /** @type {number} */
    this.dataRepairsCompleted = 0
    /** @type {number} */
    this.dataRepairsStarted = 0
    this.useStoredPartitionsForReport = true

    /** @type {Object.<string, PartitionReceipt[]>} a map of cycle keys to lists of partition receipts.  */
    this.partitionReceiptsByCycleCounter = {}
    /** @type {Object.<string, PartitionReceipt>} a map of cycle keys to lists of partition receipts.  */
    this.ourPartitionReceiptsByCycleCounter = {}
    this.doDataCleanup = true

    //Fifo locks.
    this.fifoLocks = {}

    this.debugTXHistory = {}

    // debug hack
    if (p2p == null) {
      return
    }

    this.mainLogger = logger.getLogger('main')
    this.fatalLogger = logger.getLogger('fatal')
    this.shardLogger = logger.getLogger('shardDump')

    ShardFunctions.logger = logger
    ShardFunctions.fatalLogger = this.fatalLogger
    ShardFunctions.mainLogger = this.mainLogger

    //this.clearPartitionData()

    this.registerEndpoints()

    this.accountSync.isSyncingAcceptedTxs = true // default is true so we will start adding to our tx queue asap

    this.lastShardCalculationTS = -1

    this.startShardCalculations()

    this.firstTimeToRuntimeSync = true

    this.lastShardReport = ''
    //if (logFlags.playback) this.logger.playbackLogNote('canDataRepair', `0`, `canDataRepair: ${this.canDataRepair}  `)

    this.superLargeNetworkDebugReduction = true

    this.lastActiveCount = -1
    this.reinjectTxsMap = new Map()

  }

  renewState() {
    //BLOCK1
    this.lastSeenAccountsMap = null

    this.appFinishedSyncing = false

    //BLOCK2

    //BLOCK3
    this.dataPhaseTag = 'DATASYNC: '

    //BLOCK4
    this.lastActiveNodeCount = 0

    this.preTXQueue = []

    //RESET some required modules

    this.accountCache.resetAccountCache()

    this.accountSync.clearSyncData()
    this.accountSync.clearSyncTrackers()
    this.accountSync.dataSyncMainPhaseComplete = false

    this.processCycleSummaries = false //starts false and get enabled when startProcessingCycleSummaries() is called

    //Fifo locks.
    this.fifoLocks = {}
  }

  configsInit() {
    //this.canDataRepair = false
    // this controls the OLD repair portion of data repair.
    // if (this.config && this.config.debug) {
    //   this.canDataRepair = this.config.debug.canDataRepair
    //   if (this.canDataRepair == null) {
    //     this.canDataRepair = false
    //   }
    // }
    this.debugNoTxVoting = false
    // this controls the repair portion of data repair.
    if (this.config && this.config.debug) {
      this.debugNoTxVoting = this.config.debug.debugNoTxVoting
      if (this.debugNoTxVoting == null) {
        this.debugNoTxVoting = false
      }
    }

    this.ignoreRecieptChance = 0
    if (this.config && this.config.debug) {
      this.ignoreRecieptChance = this.config.debug.ignoreRecieptChance
      if (this.ignoreRecieptChance == null) {
        this.ignoreRecieptChance = 0
      }
    }

    this.ignoreVoteChance = 0
    if (this.config && this.config.debug) {
      this.ignoreVoteChance = this.config.debug.ignoreVoteChance
      if (this.ignoreVoteChance == null) {
        this.ignoreVoteChance = 0
      }
    }

    this.loseTxChance = 0
    if (this.config && this.config.debug) {
      this.loseTxChance = this.config.debug.loseTxChance
      if (this.loseTxChance == null) {
        this.loseTxChance = 0
      }
    }

    this.failReceiptChance = 0
    if (this.config && this.config.debug) {
      this.failReceiptChance = this.config.debug.failReceiptChance
      if (this.failReceiptChance == null) {
        this.failReceiptChance = 0
      }
    }

    this.voteFlipChance = 0
    if (this.config && this.config.debug) {
      this.voteFlipChance = this.config.debug.voteFlipChance
      if (this.voteFlipChance == null) {
        this.voteFlipChance = 0
      }
    }

    this.failNoRepairTxChance = 0
    if (this.config && this.config.debug) {
      this.failNoRepairTxChance = this.config.debug.failNoRepairTxChance
      if (this.failNoRepairTxChance == null) {
        this.failNoRepairTxChance = 0
      }
    }
  }

  // TEMP hack emit events through p2p
  // had issues with composition
  // emit(event: string | symbol, ...args: any[]){
  //   this.p2p.emit(event, args)

  // }

  
  

  // //////////////////////////////////////////////////////////////////////////
  // //////////////////////////   END Old sync check     //////////////////////////
  // //////////////////////////////////////////////////////////////////////////

  /***
   *     ######   #######  ########  ########
   *    ##    ## ##     ## ##     ## ##
   *    ##       ##     ## ##     ## ##
   *    ##       ##     ## ########  ######
   *    ##       ##     ## ##   ##   ##
   *    ##    ## ##     ## ##    ##  ##
   *     ######   #######  ##     ## ########
   */

  tryStartTransactionProcessingQueue() {
    if (!this.accountSync.dataSyncMainPhaseComplete) {
      nestedCountersInstance.countEvent('processing', 'data sync pending')
      return
    }
    if (!this.transactionQueue.transactionProcessingQueueRunning) {
      this.transactionQueue.processTransactions()
    }
  }

  async _firstTimeQueueAwait() {
    if (this.transactionQueue.transactionProcessingQueueRunning) {
      this.statemanager_fatal(`queueAlreadyRunning`, 'DATASYNC: newAcceptedTxQueueRunning')
      return
    }

    /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('_firstTimeQueueAwait', `this.transactionQueue.newAcceptedTxQueue.length:${this.transactionQueue._transactionQueue.length} this.transactionQueue.newAcceptedTxQueue.length:${this.transactionQueue._transactionQueue.length}`)

    this.accountSync.syncStatement.nonDiscardedTXs = this.transactionQueue.pendingTransactionQueue.length

    await this.transactionQueue.processTransactions(true)

    if (this.accountSync.syncStatement.internalFlag === true) {
      /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_sync_syncStatement', ` `, `${utils.stringifyReduce(this.accountSync.syncStatement)}`)
      this.accountSync.syncStatmentIsComplete()
      /* prettier-ignore */ this.statemanager_fatal( 'shrd_sync_syncStatement-firstTimeQueueAwait', `${utils.stringifyReduce(this.accountSync.syncStatement)}` )
      /* prettier-ignore */ this.mainLogger.debug(`DATASYNC: syncStatement-firstTimeQueueAwait c:${this.currentCycleShardData.cycleNumber} ${utils.stringifyReduce(this.accountSync.syncStatement)}`)
    } else {
      this.accountSync.syncStatement.internalFlag = true
    }
  }

  // for debug. need to check it sorts in correcdt direction.
  _sortByIdAsc(first: { id: string }, second: { id: string }): number {
    if (first.id < second.id) {
      return -1
    }
    if (first.id > second.id) {
      return 1
    }
    return 0
  }

  /**
   * dumpAccountDebugData2 a temporary version that also uses stats data
   */
  async dumpAccountDebugData2(mainHashResults: MainHashResults) {
    if (this.currentCycleShardData == null) {
      return
    }

    // hmm how to deal with data that is changing... it cant!!
    const partitionMap = this.currentCycleShardData.parititionShardDataMap

    const ourNodeShardData: StateManagerTypes.shardFunctionTypes.NodeShardData =
      this.currentCycleShardData.nodeShardData
    // partittions:
    const partitionDump: DebugDumpPartitions = {
      partitions: [],
      cycle: 0,
      rangesCovered: {} as DebugDumpRangesCovered,
      nodesCovered: {} as DebugDumpNodesCovered,
      allNodeIds: [],
      globalAccountIDs: [],
      globalAccountSummary: [],
      globalStateHash: '',
      calculationTime: this.currentCycleShardData.calculationTime,
    }
    partitionDump.cycle = this.currentCycleShardData.cycleNumber

    // todo port this to a static stard function!
    // check if we are in the consenus group for this partition
    const minP = ourNodeShardData.consensusStartPartition // storedPartitions.partitionStart
    const maxP = ourNodeShardData.consensusEndPartition // storedPartitions.partitionEnd

    const cMin = ourNodeShardData.consensusStartPartition
    const cMax = ourNodeShardData.consensusEndPartition

    partitionDump.rangesCovered = {
      ipPort: `${ourNodeShardData.node.externalIp}:${ourNodeShardData.node.externalPort}`,
      id: utils.makeShortHash(ourNodeShardData.node.id),
      fracID: ourNodeShardData.nodeAddressNum / 0xffffffff,
      hP: ourNodeShardData.homePartition,
      cMin: cMin,
      cMax: cMax,
      stMin: ourNodeShardData.storedPartitions.partitionStart,
      stMax: ourNodeShardData.storedPartitions.partitionEnd,
      numP: this.currentCycleShardData.shardGlobals.numPartitions,
    }

    // todo print out coverage map by node index

    partitionDump.nodesCovered = {
      idx: ourNodeShardData.ourNodeIndex,
      ipPort: `${ourNodeShardData.node.externalIp}:${ourNodeShardData.node.externalPort}`,
      id: utils.makeShortHash(ourNodeShardData.node.id),
      fracID: ourNodeShardData.nodeAddressNum / 0xffffffff,
      hP: ourNodeShardData.homePartition,
      consensus: [],
      stored: [],
      extra: [],
      numP: this.currentCycleShardData.shardGlobals.numPartitions,
    }

    for (const node of ourNodeShardData.consensusNodeForOurNode) {
      const nodeData = this.currentCycleShardData.nodeShardDataMap.get(node.id)
      partitionDump.nodesCovered.consensus.push({ idx: nodeData.ourNodeIndex, hp: nodeData.homePartition })
    }
    for (const node of ourNodeShardData.nodeThatStoreOurParitionFull) {
      const nodeData = this.currentCycleShardData.nodeShardDataMap.get(node.id)
      partitionDump.nodesCovered.stored.push({ idx: nodeData.ourNodeIndex, hp: nodeData.homePartition })
    }

    if (this.currentCycleShardData.ourNode.status === 'active') {
      for (const [key, value] of partitionMap) {
        const partition: DebugDumpPartition = {
          parititionID: key,
          accounts: [],
          accounts2: [],
          skip: {} as DebugDumpPartitionSkip,
        }
        partitionDump.partitions.push(partition)

        // normal case
        if (maxP > minP) {
          // are we outside the min to max range
          if (key < minP || key > maxP) {
            partition.skip = { p: key, min: minP, max: maxP }
            continue
          }
        } else if (maxP === minP) {
          if (key !== maxP) {
            partition.skip = { p: key, min: minP, max: maxP, noSpread: true }
            continue
          }
        } else {
          // are we inside the min to max range (since the covered rage is inverted)
          if (key > maxP && key < minP) {
            partition.skip = { p: key, min: minP, max: maxP, inverted: true }
            continue
          }
        }

        const partitionShardData = value
        const accountStart = partitionShardData.homeRange.low
        const accountEnd = partitionShardData.homeRange.high

        if (this.debugFeature_dumpAccountDataFromSQL === true) {
          const wrappedAccounts = await this.app.getAccountData(accountStart, accountEnd, 10000000)
          // { accountId: account.address, stateId: account.hash, data: account, timestamp: account.timestamp }
          const duplicateCheck = {}
          for (const wrappedAccount of wrappedAccounts) {
            if (duplicateCheck[wrappedAccount.accountId] != null) {
              continue
            }
            duplicateCheck[wrappedAccount.accountId] = true
            let v: string
            if (this.app.getAccountDebugValue != null) {
              v = this.app.getAccountDebugValue(wrappedAccount)
            } else {
              v = 'getAccountDebugValue not defined'
            }
            partition.accounts.push({ id: wrappedAccount.accountId, hash: wrappedAccount.stateId, v: v })
          }

          partition.accounts.sort(this._sortByIdAsc)
        }

        // Take the cache data report and fill out accounts2 and partitionHash2
        if (mainHashResults.partitionHashResults.has(partition.parititionID)) {
          const partitionHashResults = mainHashResults.partitionHashResults.get(partition.parititionID)

          /* eslint-disable security/detect-object-injection */
          for (let index = 0; index < partitionHashResults.hashes.length; index++) {
            const id = partitionHashResults.ids[index]
            const hash = partitionHashResults.hashes[index]
            const v = `{t:${partitionHashResults.timestamps[index]}}`
            partition.accounts2.push({ id, hash, v })
          }
          /* eslint-enable security/detect-object-injection */

          partition.partitionHash2 = partitionHashResults.hashOfHashes
        }
      }

      //partitionDump.allNodeIds = []
      for (const node of this.currentCycleShardData.nodes) {
        partitionDump.allNodeIds.push(utils.makeShortHash(node.id))
      }

      partitionDump.globalAccountIDs = Array.from(this.accountGlobals.globalAccountSet.keys())
      partitionDump.globalAccountIDs.sort()

      const { globalAccountSummary, globalStateHash } = this.accountGlobals.getGlobalDebugReport()
      partitionDump.globalAccountSummary = globalAccountSummary
      partitionDump.globalStateHash = globalStateHash
    } else {
      if (this.currentCycleShardData != null && this.currentCycleShardData.nodes.length > 0) {
        for (const node of this.currentCycleShardData.nodes) {
          partitionDump.allNodeIds.push(utils.makeShortHash(node.id))
        }
      }
    }

    this.lastShardReport = utils.stringifyReduce(partitionDump)
    this.shardLogger.debug(this.lastShardReport)
  }

  async waitForShardData(counterMsg = '') {
    // wait for shard data
    while (this.currentCycleShardData == null) {
      this.getCurrentCycleShardData()
      await utils.sleep(1000)

      if (counterMsg.length > 0) {
        nestedCountersInstance.countRareEvent('sync', `waitForShardData ${counterMsg}`)
      }

      /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('_waitForShardData', ` `, ` ${utils.stringifyReduce(this.currentCycleShardData)} `)
    }
  }  

  getClosestNodes(hash: string, count = 1, selfExclude = false): ShardusTypes.Node[] {
    if (this.currentCycleShardData == null) {
      throw new Error('getClosestNodes: network not ready')
    }
    const cycleShardData = this.currentCycleShardData
    const homeNode = ShardFunctions.findHomeNode(
      cycleShardData.shardGlobals,
      hash,
      cycleShardData.parititionShardDataMap
    )
    if (homeNode == null) {
      throw new Error(`getClosestNodes: no home node found`)
    }

    // HOMENODEMATHS consider using partition of the raw hash instead of home node of hash
    const homeNodeIndex = homeNode.ourNodeIndex
    let idToExclude = ''
    if (selfExclude === true) {
      idToExclude = Self.id
    }
    const results = ShardFunctions.getNodesByProximity(
      cycleShardData.shardGlobals,
      cycleShardData.nodes,
      homeNodeIndex,
      idToExclude,
      count,
      true
    )

    // Filter unique nodes
    const uniqueNodes = results.filter((node, index, self) => {
      return self.findIndex(({ id }) => id === node.id) === index
    })

    return uniqueNodes
  }

  checkCycleShardData(tag: string): boolean {
    if (this.currentCycleShardData == null) {
      nestedCountersInstance.countEvent(
        'stateManager',
        `checkCycleShardData: currentCycleShardData == null for eventType ${tag}`
      )
      this.mainLogger.error(`checkCycleShardData: currentCycleShardData == null for eventType ${tag}`)
      return false
    }
    return true
  }

  _distanceSortAsc(a: SimpleDistanceObject, b: SimpleDistanceObject) {
    if (a.distance === b.distance) {
      return 0
    }
    if (a.distance < b.distance) {
      return -1
    } else {
      return 1
    }
  }

  getClosestNodesGlobal(hash: string, count: number) {
    const hashNumber = parseInt(hash.slice(0, 7), 16)
    const nodes = activeByIdOrder
    const nodeDistMap: { id: string; distance: number }[] = nodes.map((node) => ({
      id: node.id,
      distance: Math.abs(hashNumber - parseInt(node.id.slice(0, 7), 16)),
    }))
    nodeDistMap.sort(this._distanceSortAsc) ////(a, b) => a.distance < b.distance)
    return nodeDistMap.slice(0, count).map((node) => node.id)
  }

  // TSConversion todo see if we need to log any of the new early exits.
  isNodeInDistance(
    _shardGlobals: StateManagerTypes.shardFunctionTypes.ShardGlobals,
    _parititionShardDataMap: StateManagerTypes.shardFunctionTypes.ParititionShardDataMap,
    hash: string,
    nodeId: string,
    distance: number
  ) {
    const cycleShardData = this.currentCycleShardData
    if (cycleShardData == null) {
      return false
    }
    // HOMENODEMATHS need to eval useage here
    const someNode = ShardFunctions.findHomeNode(
      cycleShardData.shardGlobals,
      nodeId,
      cycleShardData.parititionShardDataMap
    )
    if (someNode == null) {
      return false
    }
    const someNodeIndex = someNode.ourNodeIndex

    const homeNode = ShardFunctions.findHomeNode(
      cycleShardData.shardGlobals,
      hash,
      cycleShardData.parititionShardDataMap
    )
    if (homeNode == null) {
      return false
    }
    const homeNodeIndex = homeNode.ourNodeIndex

    const partitionDistance = Math.abs(someNodeIndex - homeNodeIndex)
    if (partitionDistance <= distance) {
      return true
    }
    return false
  }

  async _clearState() {
    await this.storage.clearAppRelatedState()
  }

  _stopQueue() {
    this.transactionQueue.queueStopped = true
  }

  _clearQueue() {
    this.transactionQueue._transactionQueue = []
  }

  async cleanup() {
    this._stopQueue()
    this._unregisterEndpoints()
    this._clearQueue()
    this._cleanupListeners()
    await this._clearState()
  }

  isStateGood() {
    return this.stateIsGood
  }

  /***
   *     ######  ######## ########          ###     ######   ######   #######  ##     ## ##    ## ########
   *    ##    ## ##          ##            ## ##   ##    ## ##    ## ##     ## ##     ## ###   ##    ##
   *    ##       ##          ##           ##   ##  ##       ##       ##     ## ##     ## ####  ##    ##
   *     ######  ######      ##          ##     ## ##       ##       ##     ## ##     ## ## ## ##    ##
   *          ## ##          ##          ######### ##       ##       ##     ## ##     ## ##  ####    ##
   *    ##    ## ##          ##          ##     ## ##    ## ##    ## ##     ## ##     ## ##   ###    ##
   *     ######  ########    ##          ##     ##  ######   ######   #######   #######  ##    ##    ##
   */

  // TODO WrappedStates
  async setAccount(
    wrappedStates: WrappedResponses,
    localCachedData: LocalCachedData,
    applyResponse: ShardusTypes.ApplyResponse,
    isGlobalModifyingTX: boolean,
    accountFilter?: AccountFilter,
    note?: string
  ) {
    const canWriteToAccount = function (accountId: string) {
      // eslint-disable-next-line security/detect-object-injection
      return !accountFilter || accountFilter[accountId] !== undefined
    }
    // const { accountWrites } = applyResponse

    let savedSomething = false

    let keys = Object.keys(wrappedStates)
    keys.sort() // have to sort this because object.keys is non sorted and we always use the [0] index for hashset strings

    // if we have any account writes then get the key order from them
    // This ordering can be vitally important for things like a contract account that requires contract storage to be saved first
    // note that the wrapped data passed in alread had accountWrites merged in
    const appOrderedKeys = []
    if (applyResponse?.accountWrites?.length != null && applyResponse.accountWrites.length > 0) {
      for (const wrappedAccount of applyResponse.accountWrites) {
        appOrderedKeys.push(wrappedAccount.accountId)
      }
      keys = appOrderedKeys
    }
    //todo how to handle case where apply response is null?  probably need to get write order from the other nodes
    //it may be impossible to work without an apply response..

    for (const key of keys) {
      // eslint-disable-next-line security/detect-object-injection
      const wrappedData = wrappedStates[key]

      // let wrappedData = wrappedStates[key]
      if (wrappedData == null) {
        // TSConversion todo: harden this. throw exception?
        /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`setAccount wrappedData == null :${utils.makeShortHash(wrappedData.accountId)}`)
        continue
      }

      // TODO: to discuss how to handle this
      if (canWriteToAccount(wrappedData.accountId) === false) {
        /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`setAccount canWriteToAccount == false :${utils.makeShortHash(wrappedData.accountId)}`)
        continue
      }

      //intercept that we have this data rather than requesting it.
      // only if this tx is not a global modifying tx.   if it is a global set then it is ok to save out the global here.
      if (this.accountGlobals.isGlobalAccount(key)) {
        if (isGlobalModifyingTX === false) {
          if (logFlags.playback) this.logger.playbackLogNote('globalAccountMap', `setAccount - has`)
          /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug('setAccount: Not writing global account: ' + utils.makeShortHash(key))
          continue
        }
        /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug('setAccount: writing global account: ' + utils.makeShortHash(key))
      }

      /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`${note} setAccount partial:${wrappedData.isPartial} key:${utils.makeShortHash(key)} hash:${utils.makeShortHash(wrappedData.stateId)} ts:${wrappedData.timestamp}`)
      if (wrappedData.isPartial) {
        /* prettier-ignore */ this.transactionQueue.setDebugLastAwaitedCallInner('this.app.updateAccountPartial')
        // eslint-disable-next-line security/detect-object-injection
        await this.app.updateAccountPartial(wrappedData, localCachedData[key], applyResponse)
        /* prettier-ignore */ this.transactionQueue.setDebugLastAwaitedCallInner('this.app.updateAccountPartial', DebugComplete.Completed)
      } else {
        /* prettier-ignore */ this.transactionQueue.setDebugLastAwaitedCallInner('this.app.updateAccountFull')
        // eslint-disable-next-line security/detect-object-injection
        await this.app.updateAccountFull(wrappedData, localCachedData[key], applyResponse)
        /* prettier-ignore */ this.transactionQueue.setDebugLastAwaitedCallInner('this.app.updateAccountFull', DebugComplete.Completed)
      }
      savedSomething = true
      this.transactionQueue.processNonceQueue([wrappedData])
    }

    return savedSomething
  }

  /**
   * updateAccountsCopyTable
   * originally this only recorder results if we were not repairing but it turns out we need to update our copies any time we apply state.
   * with the update we will calculate the cycle based on timestamp rather than using the last current cycle counter
   */
  async updateAccountsCopyTable(accountDataList: ShardusTypes.AccountData[], _repairing: boolean, txTimestamp: number) {
    let cycleNumber = -1

    const timePlusSettle = txTimestamp + this.syncSettleTime //tx timestamp + settle time to determine what cycle to save in

    //use different function to get cycle number
    const cycle = CycleChain.getCycleNumberFromTimestamp(txTimestamp)
    cycleNumber = cycle

    if (cycleNumber <= -1) {
      this.statemanager_fatal(
        `updateAccountsCopyTable cycleToRecordOn==-1`,
        `updateAccountsCopyTable cycleToRecordOn==-1 ${timePlusSettle}`
      )
      return
    }

    // TSConversion need to sort out account types!!!
    if (accountDataList.length > 0 && accountDataList[0].timestamp !== txTimestamp) {
      /* prettier-ignore */ if (logFlags.verbose) if (logFlags.error) this.mainLogger.error(`updateAccountsCopyTable timestamps do match txts:${txTimestamp} acc.ts:${accountDataList[0].timestamp} `)
    }
    if (accountDataList.length === 0) {
      // need to decide if this matters!
      /* prettier-ignore */ if (logFlags.verbose) if (logFlags.error) this.mainLogger.error(`updateAccountsCopyTable empty txts:${txTimestamp}  `)
    }

    for (const accountEntry of accountDataList) {
      const { accountId, data, timestamp, hash } = accountEntry
      const isGlobal = this.accountGlobals.isGlobalAccount(accountId)

      const backupObj: ShardusTypes.AccountsCopy = { accountId, data, timestamp, hash, cycleNumber, isGlobal }

      /* prettier-ignore */ if (logFlags.verbose && this.extendedRepairLogging) this.mainLogger.debug(`updateAccountsCopyTable acc.timestamp: ${timestamp} cycle computed:${cycleNumber} accountId:${utils.makeShortHash(accountId)}`)

      //Saves the last copy per given cycle! this way when you query cycle-1 you get the right data.
      await this.storage.createOrReplaceAccountCopy(backupObj)
    }
  }

  /**
   * _commitAccountCopies
   * This takes an array of account data and pushes it directly into the system with app.resetAccountData
   * Account backup copies and in memory global account backups are also updated
   * you only need to set the true values for the globalAccountKeyMap
   * @param accountCopies
   */
  async _commitAccountCopies(accountCopies: ShardusTypes.AccountsCopy[]) {
    const rawDataList: unknown[] = []
    if (accountCopies.length > 0) {
      for (const accountData of accountCopies) {
        // make sure the data is not a json string
        if (utils.isString(accountData.data)) {
          try {
            accountData.data = Utils.safeJsonParse(accountData.data as string)
          } catch (error) {
            /* prettier-ignore */ this.mainLogger.error(` _commitAccountCopies fail to parse accountData.data: ${accountData.data} data: ${utils.stringifyReduce(accountData)}`)
          }
        }

        if (accountData == null || accountData.data == null || accountData.accountId == null) {
          /* prettier-ignore */ if (logFlags.verbose) if (logFlags.error) this.mainLogger.error(` _commitAccountCopies null account data found: ${accountData.accountId} data: ${utils.stringifyReduce(accountData)}`)
          continue
        } else {
          /* prettier-ignore */ if (logFlags.verbose && this.extendedRepairLogging) this.mainLogger.debug(` _commitAccountCopies: ${utils.makeShortHash(accountData.accountId)} ts: ${utils.makeShortHash(accountData.timestamp)} data: ${utils.stringifyReduce(accountData)}`)
        }

        rawDataList.push(accountData.data)
      }
      // tell the app to replace the account data
      await this.app.setAccountData(rawDataList)

      const globalAccountKeyMap: { [key: string]: boolean } = {}

      //we just have to trust that if we are restoring from data then the globals will be known
      this.accountGlobals.hasknownGlobals = true

      // update the account copies and global backups
      // it is possible some of this gets to go away eventually
      for (const accountEntry of accountCopies) {
        const { accountId, data, timestamp, hash, cycleNumber, isGlobal } = accountEntry

        // check if the is global bit was set and keep local track of it.  Before this was going to be passed in as separate data
        if (isGlobal == true) {
          // eslint-disable-next-line security/detect-object-injection
          globalAccountKeyMap[accountId] = true
        }

        const backupObj: ShardusTypes.AccountsCopy = { accountId, data, timestamp, hash, cycleNumber, isGlobal }

        /* prettier-ignore */ if (logFlags.verbose && this.extendedRepairLogging) this.mainLogger.debug(`_commitAccountCopies acc.timestamp: ${timestamp} cycle computed:${cycleNumber} accountId:${utils.makeShortHash(accountId)}`)

        // If the account is global ad it to the global backup list
        // eslint-disable-next-line security/detect-object-injection
        if (globalAccountKeyMap[accountId] === true) {
          //this.accountGlobals.isGlobalAccount(accountId)){

          // If we do not realized this account is global yet, then set it and log to playback log
          if (this.accountGlobals.isGlobalAccount(accountId) === false) {
            //this.accountGlobals.globalAccountMap.set(accountId, null) // we use null. ended up not using the data, only checking for the key is used
            this.accountGlobals.setGlobalAccount(accountId)
            /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('globalAccountMap', `set global in _commitAccountCopies accountId:${utils.makeShortHash(accountId)}`)
          }
        }

        this.accountCache.updateAccountHash(accountId, hash, timestamp, 0)

        try {
          //Saves the last copy per given cycle! this way when you query cycle-1 you get the right data.
          await this.storage.createOrReplaceAccountCopy(backupObj)
        } catch (error) {
          /* prettier-ignore */ if (logFlags.verbose) if (logFlags.error) this.mainLogger.error(` _commitAccountCopies storage: ${Utils.safeStringify(error)}}`)
          nestedCountersInstance.countEvent('_commitAccountCopies', `_commitAccountCopies fail`)
        }
      }
    }
  }  

  /***
   *     ######  ##       ########    ###    ##    ## ##     ## ########
   *    ##    ## ##       ##         ## ##   ###   ## ##     ## ##     ##
   *    ##       ##       ##        ##   ##  ####  ## ##     ## ##     ##
   *    ##       ##       ######   ##     ## ## ## ## ##     ## ########
   *    ##       ##       ##       ######### ##  #### ##     ## ##
   *    ##    ## ##       ##       ##     ## ##   ### ##     ## ##
   *     ######  ######## ######## ##     ## ##    ##  #######  ##
   */

  // could do this every 5 cycles instead to save perf.
  // TODO refactor period cleanup into sub modules!!!
  periodicCycleDataCleanup(oldestCycle: number) {
    // On a periodic bases older copies of the account data where we have more than 2 copies for the same account can be deleted.

    if (oldestCycle < 0) {
      return
    }

    // if (this.depricated.repairTrackingByCycleById == null) {
    //   return
    // }
    if (this.partitionObjects != null) {
      if (this.partitionObjects.allPartitionResponsesByCycleByPartition == null) {
        return
      }
      if (this.partitionObjects.ourPartitionResultsByCycle == null) {
        return
      }
    }

    if (this.shardValuesByCycle == null) {
      return
    }

    // todo refactor some of the common code below.  may be put the counters in a map.

    // Partition receipts and cycles:
    // partitionObjectsByCycle
    // cycleReceiptsByCycleCounter

    if (logFlags.debug) this.mainLogger.debug('Clearing out old data Start')

    const removedrepairTrackingByCycleById = 0
    let removedallPartitionResponsesByCycleByPartition = 0
    let removedourPartitionResultsByCycle = 0
    let removedshardValuesByCycle = 0
    let removedTrieConsensusData = 0

    // cleanup old partition objects / receipts.
    /* eslint-disable security/detect-object-injection */
    if (this.partitionObjects != null) {
      for (const cycleKey of Object.keys(this.partitionObjects.allPartitionResponsesByCycleByPartition)) {
        const cycle = cycleKey.slice(1)
        const cycleNum = parseInt(cycle, 10)
        if (cycleNum < oldestCycle) {
          // delete old cycle
          delete this.partitionObjects.allPartitionResponsesByCycleByPartition[cycleKey]
          removedallPartitionResponsesByCycleByPartition++
        }
      }

      for (const cycleKey of Object.keys(this.partitionObjects.ourPartitionResultsByCycle)) {
        const cycle = cycleKey.slice(1)
        const cycleNum = parseInt(cycle, 10)
        if (cycleNum < oldestCycle) {
          // delete old cycle
          delete this.partitionObjects.ourPartitionResultsByCycle[cycleKey]
          removedourPartitionResultsByCycle++
        }
      }
    }
    /* eslint-enable security/detect-object-injection */

    // cleanup this.shardValuesByCycle
    for (const cycleNum of this.shardValuesByCycle.keys()) {
      if (cycleNum < oldestCycle) {
        // delete old cycle
        this.shardValuesByCycle.delete(cycleNum)
        removedshardValuesByCycle++
      }
    }

    for (const cycleNum of this.accountPatcher.hashTrieSyncConsensusByCycle.keys()) {
      if (cycleNum < oldestCycle) {
        // delete old cycle
        this.accountPatcher.hashTrieSyncConsensusByCycle.delete(cycleNum)
        removedTrieConsensusData++
      }
    }

    let removedtxByCycleByPartition = 0
    let removedrecentPartitionObjectsByCycleByHash = 0
    const removedrepairUpdateDataByCycle = 0
    let removedpartitionObjectsByCycle = 0

    if (this.partitionObjects != null) {
      // cleanup this.partitionObjects.txByCycleByPartition
      for (const cycleKey of Object.keys(this.partitionObjects.txByCycleByPartition)) {
        const cycle = cycleKey.slice(1)
        const cycleNum = parseInt(cycle, 10)
        if (cycleNum < oldestCycle) {
          // delete old cycle
          // eslint-disable-next-line security/detect-object-injection
          delete this.partitionObjects.txByCycleByPartition[cycleKey]
          removedtxByCycleByPartition++
        }
      }
      // cleanup this.partitionObjects.recentPartitionObjectsByCycleByHash
      for (const cycleKey of Object.keys(this.partitionObjects.recentPartitionObjectsByCycleByHash)) {
        const cycle = cycleKey.slice(1)
        const cycleNum = parseInt(cycle, 10)
        if (cycleNum < oldestCycle) {
          // delete old cycle
          // eslint-disable-next-line security/detect-object-injection
          delete this.partitionObjects.recentPartitionObjectsByCycleByHash[cycleKey]
          removedrecentPartitionObjectsByCycleByHash++
        }
      }
    }

    // // cleanup this.depricated.repairUpdateDataByCycle
    // for (let cycleKey of Object.keys(this.depricated.repairUpdateDataByCycle)) {
    //   let cycle = cycleKey.slice(1)
    //   let cycleNum = parseInt(cycle, 10)
    //   if (cycleNum < oldestCycle) {
    //     // delete old cycle
    //     delete this.depricated.repairUpdateDataByCycle[cycleKey]
    //     removedrepairUpdateDataByCycle++
    //   }
    // }
    if (this.partitionObjects != null) {
      // cleanup this.partitionObjects.partitionObjectsByCycle
      for (const cycleKey of Object.keys(this.partitionObjects.partitionObjectsByCycle)) {
        const cycle = cycleKey.slice(1)
        const cycleNum = parseInt(cycle, 10)
        if (cycleNum < oldestCycle) {
          // delete old cycle
          // eslint-disable-next-line security/detect-object-injection
          delete this.partitionObjects.partitionObjectsByCycle[cycleKey]
          removedpartitionObjectsByCycle++
        }
      }
    }

    let removepartitionReceiptsByCycleCounter = 0
    let removeourPartitionReceiptsByCycleCounter = 0
    // cleanup this.partitionReceiptsByCycleCounter
    for (const cycleKey of Object.keys(this.partitionReceiptsByCycleCounter)) {
      const cycle = cycleKey.slice(1)
      const cycleNum = parseInt(cycle, 10)
      if (cycleNum < oldestCycle) {
        // delete old cycle
        // eslint-disable-next-line security/detect-object-injection
        delete this.partitionReceiptsByCycleCounter[cycleKey]
        removepartitionReceiptsByCycleCounter++
      }
    }

    // cleanup this.ourPartitionReceiptsByCycleCounter
    for (const cycleKey of Object.keys(this.ourPartitionReceiptsByCycleCounter)) {
      const cycle = cycleKey.slice(1)
      const cycleNum = parseInt(cycle, 10)
      if (cycleNum < oldestCycle) {
        // delete old cycle
        // eslint-disable-next-line security/detect-object-injection
        delete this.ourPartitionReceiptsByCycleCounter[cycleKey]
        removeourPartitionReceiptsByCycleCounter++
      }
    }

    // start at the front of the archivedQueueEntries fifo and remove old entries untill they are current.
    let oldQueueEntries = true
    let archivedEntriesRemoved = 0
    while (oldQueueEntries && this.transactionQueue.archivedQueueEntries.length > 0) {
      const queueEntry = this.transactionQueue.archivedQueueEntries[0]
      // the time is approximate so make sure it is older than five cycles.
      // added a few more to oldest cycle to keep entries in the queue longer in case syncing nodes need the data
      if (queueEntry.approximateCycleAge < oldestCycle - 3) {
        this.transactionQueue.archivedQueueEntries.shift()
        this.transactionQueue.archivedQueueEntriesByID.delete(queueEntry.acceptedTx.txId)
        delete this.debugTXHistory[utils.stringifyReduce(queueEntry.logID)]
        archivedEntriesRemoved++

        //if (logFlags.verbose) this.mainLogger.log(`queue entry removed from archive ${queueEntry.logID} tx cycle: ${queueEntry.approximateCycleAge} cycle: ${this.currentCycleShardData.cycleNumber}`)
      } else {
        oldQueueEntries = false
        break
      }
    }

    //periodically clear any fifo locks that are unlocked and have not been used in 10 minutes.
    this.clearStaleFifoLocks()

    /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`Clearing out old data Cleared: ${removedrepairTrackingByCycleById} ${removedallPartitionResponsesByCycleByPartition} ${removedourPartitionResultsByCycle} ${removedshardValuesByCycle} ${removedtxByCycleByPartition} ${removedrecentPartitionObjectsByCycleByHash} ${removedrepairUpdateDataByCycle} ${removedpartitionObjectsByCycle} ${removepartitionReceiptsByCycleCounter} ${removeourPartitionReceiptsByCycleCounter} archQ:${archivedEntriesRemoved} removedTrieConsensusData:${removedTrieConsensusData}`)

    // TODO 1 calculate timestamp for oldest accepted TX to delete.

    // TODO effient process to query all accounts and get rid of themm but keep at least one table entry (prefably the newest)
    // could do this in two steps
  }

  /***
   *     #######     ##                  #######   #######     ##     ##    ###    ##    ## ########  ##       ######## ########   ######
   *    ##     ##  ####                 ##     ## ##     ##    ##     ##   ## ##   ###   ## ##     ## ##       ##       ##     ## ##    ##
   *    ##     ##    ##                 ##     ##        ##    ##     ##  ##   ##  ####  ## ##     ## ##       ##       ##     ## ##
   *    ##     ##    ##      #######    ##     ##  #######     ######### ##     ## ## ## ## ##     ## ##       ######   ########   ######
   *    ##  ## ##    ##                 ##  ## ##        ##    ##     ## ######### ##  #### ##     ## ##       ##       ##   ##         ##
   *    ##    ##     ##                 ##    ##  ##     ##    ##     ## ##     ## ##   ### ##     ## ##       ##       ##    ##  ##    ##
   *     ##### ##  ######                ##### ##  #######     ##     ## ##     ## ##    ## ########  ######## ######## ##     ##  ######
   */

  startShardCalculations() {
    //this.p2p.state.on('cycle_q1_start', async (lastCycle, time) => {
    this._registerListener(this.p2p.state, 'cycle_q1_start', async () => {
      try {
        this.profiler.profileSectionStart('stateManager_cycle_q1_start')

        this.eventEmitter.emit('set_queue_partition_gossip')
        const lastCycle = CycleChain.getNewest()
        if (lastCycle) {
          const ourNode = NodeList.nodes.get(Self.id)

          if (ourNode === null || ourNode === undefined) {
            //dont attempt more calculations we may be shutting down
            return
          }

          this.profiler.profileSectionStart('stateManager_cycle_q1_start_updateShardValues')

          this.updateShardValues(lastCycle.counter, lastCycle.mode)

          this.profiler.profileSectionEnd('stateManager_cycle_q1_start_updateShardValues')

          this.profiler.profileSectionStart('stateManager_cycle_q1_start_calculateChangeInCoverage')
          // calculate coverage change asap
          if (this.currentCycleShardData && this.currentCycleShardData.ourNode.status === 'active') {
            this.calculateChangeInCoverage()
          }
          this.profiler.profileSectionEnd('stateManager_cycle_q1_start_calculateChangeInCoverage')

          this.profiler.profileSectionStart('stateManager_cycle_q1_start_processPreviousCycleSummaries')
          if (this.processCycleSummaries) {
            // not certain if we want await
            this.processPreviousCycleSummaries()
          }
          this.profiler.profileSectionEnd('stateManager_cycle_q1_start_processPreviousCycleSummaries')
        }
      } finally {
        this.profiler.profileSectionEnd('stateManager_cycle_q1_start')
      }
    })

    this._registerListener(this.p2p.state, 'cycle_q3_start', async () => {
      try {
        this.profiler.profileSectionStart('stateManager_cycle_q3_start')

        this.transactionQueue.checkForStuckProcessing()

        const lastCycle = CycleChain.getNewest()
        if (lastCycle == null) {
          return
        }
        const lastCycleShardValues = this.shardValuesByCycle.get(lastCycle.counter)
        if (lastCycleShardValues == null) {
          return
        }

        // do this every 5 cycles.
        if (lastCycle.counter % 5 !== 0) {
          return
        }

        if (this.doDataCleanup === true) {
          if (logFlags.verbose) this.mainLogger.debug(`cycle_q3_start-clean cycle: ${lastCycle.counter}`)
          // clean up cycle data that is more than <maxCyclesShardDataToKeep> cycles old.
          this.periodicCycleDataCleanup(lastCycle.counter - this.config.stateManager.maxCyclesShardDataToKeep)
        }
      } finally {
        this.profiler.profileSectionEnd('stateManager_cycle_q3_start')
      }
    })
  }

  async processPreviousCycleSummaries() {
    const lastCycle = CycleChain.getNewest()
    if (lastCycle == null) {
      return
    }
    const cycleShardValues = this.shardValuesByCycle.get(lastCycle.counter - 1)
    if (cycleShardValues == null) {
      return
    }
    if (this.currentCycleShardData == null) {
      return
    }
    if (this.currentCycleShardData.ourNode.status !== 'active') {
      return
    }
    if (cycleShardValues.ourNode.status !== 'active') {
      return
    }

    const cycle = CycleChain.getCycleChain(cycleShardValues.cycleNumber, cycleShardValues.cycleNumber)[0]
    if (cycle === null || cycle === undefined) {
      return
    }

    await utils.sleep(1000) //wait one second helps with local networks

    let receiptMapResults = []

    this.profiler.profileSectionStart('stateManager_processPreviousCycleSummaries_generateReceiptMapResults')
    // Get the receipt map to send as a report
    if (this.feature_receiptMapResults === true) {
      receiptMapResults = this.generateReceiptMapResults(cycle)
      if (logFlags.verbose) this.mainLogger.debug(`receiptMapResults: ${Utils.safeStringify(receiptMapResults)}`)
    }
    this.profiler.profileSectionEnd('stateManager_processPreviousCycleSummaries_generateReceiptMapResults')

    this.profiler.profileSectionStart('stateManager_processPreviousCycleSummaries_buildStatsReport')
    // Get the stats data to send as a reort
    let statsClump = {}
    if (this.feature_generateStats === true) {
      statsClump = this.partitionStats.buildStatsReport(cycleShardValues)
      this.partitionStats.dumpLogsForCycle(cycleShardValues.cycleNumber, true, cycleShardValues)
    } else {
      //todo could make ncider way to avoid this memory
      this.partitionStats.workQueue = []
    }

    this.profiler.profileSectionEnd('stateManager_processPreviousCycleSummaries_buildStatsReport')

    // build partition hashes from previous full cycle
    if (this.feature_partitionHashes === true) {
      if (cycleShardValues && cycleShardValues.ourNode.status === 'active') {
        this.profiler.profileSectionStart('stateManager_processPreviousCycleSummaries_buildPartitionHashesForNode')
        this.accountCache.processCacheUpdates(cycleShardValues)

        this.profiler.profileSectionEnd('stateManager_processPreviousCycleSummaries_buildPartitionHashesForNode')

        this.profiler.profileSectionStart('stateManager_updatePartitionReport_updateTrie')
        //Note: the main work is happening in accountCache.buildPartitionHashesForNode, this just
        // uses that data to create our old report structure for reporting to the monitor-server
        // this.partitionObjects.updatePartitionReport(cycleShardValues, mainHashResults) //this needs to go away along all of partitionObjects I think
        //this is used in the reporter and account dump, but these features cant scale to hundreds of nodes.
        //
        this.accountPatcher.updateTrieAndBroadCast(lastCycle.counter)
        this.profiler.profileSectionEnd('stateManager_updatePartitionReport_updateTrie')
      }
    }

    //reset cycleDebugNotes
    this.cycleDebugNotes = {
      repairs: 0,
      lateRepairs: 0,
      patchedAccounts: 0,
      badAccounts: 0,
      noRcptRepairs: 0,
    }

    // Hook for Snapshot module to listen to after partition data is settled
    this.eventEmitter.emit('cycleTxsFinalized', cycleShardValues, receiptMapResults, statsClump)
    this.transactionConsensus.pruneTxTimestampCache()

    if (this.debugFeature_dumpAccountData === true) {
      if (this.superLargeNetworkDebugReduction === true || logFlags.verbose) {
        //log just the node IDS and cycle number even this may be too much eventually
        const partitionDump = { cycle: cycleShardValues.cycleNumber, allNodeIds: [] }
        for (const node of this.currentCycleShardData.nodes) {
          partitionDump.allNodeIds.push(utils.makeShortHash(node.id))
        }
        this.lastShardReport = utils.stringifyReduce(partitionDump)
        this.shardLogger.debug(this.lastShardReport)
      }
    }

    if (this.partitionObjects != null) {
      // pre-allocate the next two cycles if needed
      /* eslint-disable security/detect-object-injection */
      for (let i = 1; i <= 2; i++) {
        const prekey = 'c' + (cycle.counter + i)
        if (this.partitionObjects.partitionObjectsByCycle[prekey] == null) {
          this.partitionObjects.partitionObjectsByCycle[prekey] = []
        }
        if (this.partitionObjects.ourPartitionResultsByCycle[prekey] == null) {
          this.partitionObjects.ourPartitionResultsByCycle[prekey] = []
        }
      }
      /* eslint-enable security/detect-object-injection */
    }

    await utils.sleep(10000) //wait 10 seconds
    try {
      await this.accountPatcher.testAndPatchAccounts(lastCycle.counter)
    } catch (e) {
      this.statemanager_fatal('processPreviousCycleSummaries', `testAndPatchAccounts ${e.message}`)
      nestedCountersInstance.countEvent(
        'processPreviousCycleSummaries',
        `testAndPatchAccounts fail with exception: ${e.message}`
      )
    }
  }

  /**
   * initApoptosisAndQuitSyncing
   * stop syncing and init apoptosis
   */
  initApoptosisAndQuitSyncing(logMsg: string, userFriendlyMessage?: string) {
    const log = `initApoptosisAndQuitSyncing ${utils.getTime('s')}  ${logMsg}`
    if (logFlags.console) console.log(log)
    if (logFlags.error) this.mainLogger.error(log)

    const stack = new Error().stack
    this.statemanager_fatal('initApoptosisAndQuitSyncing', `initApoptosisAndQuitSyncing ${logMsg} ${stack}`)

    this.accountSync.failAndDontRestartSync()
    this.p2p.initApoptosis(
      'Apoptosis being initialized by `p2p.initApoptosis` within initApoptosisAndQuitSyncing() at src/state-manager/index.ts',
      userFriendlyMessage
    )
  }

  
  /***
   *     ######   #######  ########  ########
   *    ##    ## ##     ## ##     ## ##
   *    ##       ##     ## ##     ## ##
   *    ##       ##     ## ########  ######
   *    ##       ##     ## ##   ##   ##
   *    ##    ## ##     ## ##    ##  ##       ### ### ###
   *     ######   #######  ##     ## ######## ### ### ###
   */

  isNodeValidForInternalMessage(
    nodeId: string,
    debugMsg: string,
    checkForNodeDown = true,
    checkForNodeLost = true,
    checkIsUpRecent = true,
    checkNodesRotationBounds = false
  ): boolean {
    const node: ShardusTypes.Node = this.p2p.state.getNode(nodeId)
    return Comms.isNodeValidForInternalMessage(
      node,
      debugMsg,
      checkForNodeDown,
      checkForNodeLost,
      checkIsUpRecent,
      checkNodesRotationBounds
    )
  }

  /**
   * This takes a lists of nodes and test which are safe/smart to send to.
   * The node list is updated once per cycle but this function can take into nodes that may have been reported down but are
   * recently up again.
   * @param nodeList
   * @param debugMsg
   * @param checkForNodeDown
   * @param checkForNodeLost
   * @param checkIsUpRecent
   * @returns A list of filtered nodes based on the settings passed in
   */
  filterValidNodesForInternalMessage(
    nodeList: ShardusTypes.Node[],
    debugMsg: string,
    checkForNodeDown = true,
    checkForNodeLost = true,
    checkIsUpRecent = true
  ): ShardusTypes.Node[] {
    const filteredNodes = []

    const logErrors = logFlags.debug
    for (const node of nodeList) {
      const nodeId = node.id

      if (node == null) {
        if (logErrors)
          if (logFlags.error)
            /* prettier-ignore */ this.mainLogger.error(`isNodeValidForInternalMessage node == null ${utils.stringifyReduce(nodeId)} ${debugMsg}`)
        continue
      }
      // This is turned off and likely to be deleted.
      // This is because filtering gossip nodes after sending the list is causing holes to appear in gossip and some nodes do not get the gossip at all which causes stuck txn.
      // Do not turn this back on without talking to Andrew.
      // Note will also likely create an investigation task to see if this will cause any issues.
      //
      //const nodeStatus = node.status
      //if (nodeStatus != 'active' || potentiallyRemoved.has(node.id)) {
      //  if (logErrors)
      //    if (logFlags.error)
      //      /* prettier-ignore */ this.mainLogger.error(`isNodeValidForInternalMessage node not active. ${nodeStatus} ${utils.stringifyReduce(nodeId)} ${debugMsg}`)
      //  continue
      //}
      if (checkIsUpRecent) {
        const { upRecent, age } = isNodeUpRecent(nodeId, 5000)
        if (upRecent === true) {
          filteredNodes.push(node)

          if (this.config.p2p.downNodeFilteringEnabled && checkForNodeDown) {
            const { down, state } = isNodeDown(nodeId)
            if (down === true) {
              if (logErrors)
                this.mainLogger.debug(
                  `isNodeUpRecentOverride: ${age} isNodeValidForInternalMessage isNodeDown == true state:${state} ${utils.stringifyReduce(
                    nodeId
                  )} ${debugMsg}`
                )
            }
          }
          if (checkForNodeLost) {
            if (isNodeLost(nodeId) === true) {
              if (logErrors)
                this.mainLogger.debug(
                  `isNodeUpRecentOverride: ${age} isNodeValidForInternalMessage isNodeLost == true ${utils.stringifyReduce(
                    nodeId
                  )} ${debugMsg}`
                )
            }
          }
          continue
        } else {
          if (logErrors)
            this.mainLogger.debug(`isNodeUpRecentOverride: ${age} no recent TX, but this is not a fail conditions`)
        }
      }

      if (this.config.p2p.downNodeFilteringEnabled && checkForNodeDown) {
        const { down, state } = isNodeDown(nodeId)
        if (down === true) {
          if (logErrors)
            if (logFlags.error)
              /* prettier-ignore */ this.mainLogger.error(`isNodeValidForInternalMessage isNodeDown == true state:${state} ${utils.stringifyReduce(nodeId)} ${debugMsg}`)
          continue
        }
      }
      if (checkForNodeLost) {
        if (isNodeLost(nodeId) === true) {
          if (logErrors)
            if (logFlags.error)
              /* prettier-ignore */ this.mainLogger.error(`isNodeValidForInternalMessage isNodeLost == true ${utils.stringifyReduce(nodeId)} ${debugMsg}`)
          continue
        }
      }
      filteredNodes.push(node)
    }
    return filteredNodes
  }

  /**
   *
   * @returns
   */
  getNodesForCycleShard(mode: P2PTypes.ModesTypes.Record['mode']): ShardusTypes.Node[] {
    if (mode === 'forming' || mode === 'processing' || mode === 'safety') return activeByIdOrder
    if (mode === 'restart' || mode === 'restore' || mode === 'recovery') return byIdOrder
    // For shutdown mode as well, we may want all nodes (This needs review)
    if (mode === 'shutdown') return byIdOrder
  }

  getTxRepair(): TransactionRepair {
    if (this.transactionRepair) {
      return this.transactionRepair
    }
  }
  async askToRemoveTimestampCache(acceptedTx: QueueEntry['acceptedTx'], signedReceipt: SignedReceipt) {
    const homeNode = ShardFunctions.findHomeNode(
      Context.stateManager.currentCycleShardData.shardGlobals,
      acceptedTx.txId,
      Context.stateManager.currentCycleShardData.parititionShardDataMap
    )
    if (signedReceipt == null) {
      this.mainLogger.error(`askToRemoveTimestampCache signedReceipt == null ${utils.stringifyReduce(acceptedTx)}`)
      return
    }
    // if (receipt2.confirmOrChallenge.message !== 'challenge') {
    //   this.mainLogger.error(`askToRemoveTimestampCache receipt2.confirmOrChallenge.message !== 'challenge' ${utils.stringifyReduce(acceptedTx)}`)
    //   return
    // }
    if (acceptedTx.data.timestampReceipt == null) {
      this.mainLogger.error(
        `askToRemoveTimestampCache queueEntry.acceptedTx.data.timestampReceipt == null ${utils.stringifyReduce(
          acceptedTx
        )}`
      )
      return
    }
    const cycleCounter = acceptedTx.data.timestampReceipt.cycleCounter
    // attach challenge receipt to payload
    const payload: TimestampRemoveRequest = { txId: acceptedTx.txId, signedReceipt, cycleCounter }
    try {
      await this.p2p.tell([homeNode.node], 'remove_timestamp_cache', payload) //deprecated
    } catch (e) {
      nestedCountersInstance.countEvent('askToRemoveTimestampCache', `error: ${e.message}`)
      this.mainLogger.error(`askToRemoveTimestampCache error: ${e.message}`)
    }
  }

  startProcessingCycleSummaries() {
    this.processCycleSummaries = true
  }

  statemanager_fatal(key: string, log: string) {
    nestedCountersInstance.countEvent('fatal-log', key)
    this.fatalLogger.fatal(key + ' ' + log)
  }
}

export default StateManager
