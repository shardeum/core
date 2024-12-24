import * as ShardusTypes from '../shardus/shardus-types';
import Shardus from '../shardus';
import { StateManager as StateManagerTypes, P2P as P2PTypes } from '@shardus/types';
import { isNodeDown, isNodeLost, isNodeUpRecent } from '../p2p/Lost';
import ShardFunctions from './shardFunctions';
import EventEmitter from 'events';
import * as utils from '../utils';
import { Utils } from '@shardus/types';
import Profiler, { cUninitializedSize, profilerInstance } from '../utils/profiler';
import { P2PModuleContext as P2P } from '../p2p/Context';
import Storage from '../storage';
import Crypto from '../crypto';
import Logger, { logFlags } from '../logger';
import * as Context from '../p2p/Context';
import { activeByIdOrder, byIdOrder } from '../p2p/NodeList';
import * as Self from '../p2p/Self';
import * as NodeList from '../p2p/NodeList';
import * as CycleChain from '../p2p/CycleChain';
import * as Comms from '../p2p/Comms';
import { nestedCountersInstance } from '../utils/nestedCounters';
import PartitionStats from './PartitionStats';
import AccountCache from './AccountCache';
import AccountSync from './AccountSync';
import AccountGlobals from './AccountGlobals';
import TransactionQueue, { DebugComplete } from './TransactionQueue';
import TransactionRepair from './TransactionRepair';
import TransactionConsenus from './TransactionConsensus';
import PartitionObjects from './PartitionObjects';
import Deprecated from './Deprecated';
import AccountPatcher from './AccountPatcher';
import CachedAppDataManager from './CachedAppDataManager';
import { CycleShardData, PartitionReceipt, FifoLockObjectMap, QueueEntry, AcceptedTx, AccountCopy, GetAccountDataByRangeSmart, WrappedStateArray, AccountHashCache, RequestReceiptForTxReq, RequestReceiptForTxResp, RequestStateForTxReqPost, RequestStateForTxResp, RequestTxResp, AppliedVote, GetAccountDataWithQueueHintsResp, DebugDumpPartitions, DebugDumpRangesCovered, DebugDumpNodesCovered, DebugDumpPartition, DebugDumpPartitionSkip, MainHashResults, SimpleDistanceObject, WrappedResponses, LocalCachedData, AccountFilter, StringBoolObjectMap, CycleDebugNotes, AppliedVoteHash, RequestReceiptForTxResp_old, RequestAccountQueueCounts, QueueCountsResponse, QueueCountsResult, TimestampRemoveRequest, SignedReceipt, Proposal } from './state-manager-types';
import { isDebugModeMiddleware, isDebugModeMiddlewareLow } from '../network/debugMiddleware';
import { ReceiptMapResult } from '@shardus/types/build/src/state-manager/StateManagerTypes';
import { Logger as Log4jsLogger } from 'log4js';
import { timingSafeEqual } from 'crypto';
import { shardusGetTime } from '../network';
import { isServiceMode } from '../debug';
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum';
import { InternalBinaryHandler } from '../types/Handler';
import { Route } from '@shardus/types/build/src/p2p/P2PTypes';
import { VectorBufferStream } from '../utils/serialization/VectorBufferStream';
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum';
import { deserializeGetAccountDataWithQueueHintsResp, GetAccountDataWithQueueHintsRespSerializable, serializeGetAccountDataWithQueueHintsResp, } from '../types/GetAccountDataWithQueueHintsResp';
import { deserializeGetAccountDataWithQueueHintsReq, GetAccountDataWithQueueHintsReqSerializable, serializeGetAccountDataWithQueueHintsReq, } from '../types/GetAccountDataWithQueueHintsReq';
import { WrappedDataFromQueueSerializable } from '../types/WrappedDataFromQueue';
import { deserializeGetAccountQueueCountResp, GetAccountQueueCountResp, serializeGetAccountQueueCountResp, } from '../types/GetAccountQueueCountResp';
import { deserializeGetAccountQueueCountReq, GetAccountQueueCountReq, serializeGetAccountQueueCountReq, } from '../types/GetAccountQueueCountReq';
import { deserializeRequestStateForTxPostReq } from '../types/RequestStateForTxPostReq';
import { RequestStateForTxPostResp, serializeRequestStateForTxPostResp, } from '../types/RequestStateForTxPostResp';
import { getStreamWithTypeCheck, requestErrorHandler } from '../types/Helpers';
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum';
import { deserializeSpreadAppliedVoteHashReq } from '../types/SpreadAppliedVoteHashReq';
import { RequestTxAndStateReq, deserializeRequestTxAndStateReq } from '../types/RequestTxAndStateReq';
import { serializeRequestTxAndStateResp } from '../types/RequestTxAndStateResp';
import { RequestReceiptForTxRespSerialized, serializeRequestReceiptForTxResp, } from '../types/RequestReceiptForTxResp';
import { deserializeRequestReceiptForTxReq } from '../types/RequestReceiptForTxReq';
import { BadRequest, InternalError, ResponseError, serializeResponseError } from '../types/ResponseError';
export type Callback = (...args: unknown[]) => void;
class WrappedEventEmitter extends EventEmitter {
    constructor() {
        super();
    }
}
class StateManager {
    shardus: Shardus;
    app: ShardusTypes.App;
    storage: Storage;
    p2p: P2P;
    crypto: Crypto;
    config: ShardusTypes.StrictServerConfiguration;
    profiler: Profiler;
    mainLogger: Log4jsLogger;
    fatalLogger: Log4jsLogger;
    shardLogger: Log4jsLogger;
    statsLogger: Log4jsLogger;
    eventEmitter: WrappedEventEmitter;
    partitionStats: PartitionStats;
    accountCache: AccountCache;
    accountSync: AccountSync;
    accountGlobals: AccountGlobals;
    transactionQueue: TransactionQueue;
    private transactionRepair: TransactionRepair;
    transactionConsensus: TransactionConsenus;
    partitionObjects: PartitionObjects;
    accountPatcher: AccountPatcher;
    cachedAppDataManager: CachedAppDataManager;
    depricated: Deprecated;
    shardValuesByCycle: Map<number, CycleShardData>;
    currentCycleShardData: CycleShardData | null;
    globalAccountsSynced: boolean;
    dataRepairsCompleted: number;
    dataRepairsStarted: number;
    useStoredPartitionsForReport: boolean;
    partitionReceiptsByCycleCounter: {
        [cycleKey: string]: PartitionReceipt[];
    };
    ourPartitionReceiptsByCycleCounter: {
        [cycleKey: string]: PartitionReceipt;
    };
    fifoLocks: FifoLockObjectMap;
    lastSeenAccountsMap: {
        [accountId: string]: QueueEntry;
    };
    appFinishedSyncing: boolean;
    debugNoTxVoting: boolean;
    debugSkipPatcherRepair: boolean;
    ignoreRecieptChance: number;
    ignoreVoteChance: number;
    loseTxChance: number;
    failReceiptChance: number;
    voteFlipChance: number;
    failNoRepairTxChance: number;
    syncSettleTime: number;
    debugTXHistory: {
        [id: string]: string;
    };
    stateIsGood_txHashsetOld: boolean;
    stateIsGood_accountPartitions: boolean;
    stateIsGood_activeRepairs: boolean;
    stateIsGood: boolean;
    feature_receiptMapResults: boolean;
    feature_partitionHashes: boolean;
    feature_generateStats: boolean;
    feature_useNewParitionReport: boolean;
    debugFeature_dumpAccountData: boolean;
    debugFeature_dumpAccountDataFromSQL: boolean;
    debugFeatureOld_partitionReciepts: boolean;
    logger: Logger;
    extendedRepairLogging: boolean;
    consensusLog: boolean;
    lastActiveNodeCount: number;
    doDataCleanup: boolean;
    _listeners: Record<string, [
        EventEmitter,
        () => void
    ]>;
    queueSitTime: number;
    dataPhaseTag: string;
    preTXQueue: AcceptedTx[];
    lastShardCalculationTS: number;
    firstTimeToRuntimeSync: boolean;
    lastShardReport: string;
    processCycleSummaries: boolean;
    cycleDebugNotes: CycleDebugNotes;
    superLargeNetworkDebugReduction: boolean;
    lastActiveCount: number;
    useAccountWritesOnly: boolean;
    reinjectTxsMap: Map<string, number>;
    coverageChangesCopy: {
        start: number;
        end: number;
    }[];
    constructor(profiler: Profiler, app: ShardusTypes.App, logger: Logger, storage: Storage, p2p: P2P, crypto: Crypto, config: ShardusTypes.StrictServerConfiguration, shardus: Shardus) {
        this.shardus = shardus;
        this.p2p = p2p;
        this.crypto = crypto;
        this.storage = storage;
        this.app = app;
        this.logger = logger;
        this.config = config;
        this.profiler = profiler;
        this.eventEmitter = new WrappedEventEmitter();
        this._listeners = {};
        this.queueSitTime = 6000;
        this.syncSettleTime = this.queueSitTime + 2000;
        this.lastSeenAccountsMap = null;
        this.appFinishedSyncing = false;
        this.useAccountWritesOnly = false;
        this.dataPhaseTag = 'DATASYNC: ';
        this.lastActiveNodeCount = 0;
        this.extendedRepairLogging = true;
        this.consensusLog = false;
        this.shardValuesByCycle = new Map();
        this.currentCycleShardData = null as CycleShardData | null;
        this.preTXQueue = [];
        this.configsInit();
        this.accountCache = new AccountCache(this, profiler, app, logger, crypto, config);
        this.partitionStats = new PartitionStats(this, profiler, app, logger, crypto, config, this.accountCache);
        this.partitionStats.summaryPartitionCount = 4096;
        this.partitionStats.initSummaryBlobs();
        this.accountSync = new AccountSync(this, profiler, app, logger, storage, p2p, crypto, config);
        this.accountGlobals = new AccountGlobals(this, profiler, app, logger, storage, p2p, crypto, config);
        this.transactionQueue = new TransactionQueue(this, profiler, app, logger, storage, p2p, crypto, config);
        this.transactionRepair = new TransactionRepair(this, profiler, app, logger, storage, p2p, crypto, config);
        this.transactionConsensus = new TransactionConsenus(this, profiler, app, logger, storage, p2p, crypto, config);
        this.partitionObjects = new PartitionObjects(this, profiler, app, logger, storage, p2p, crypto, config);
        this.depricated = new Deprecated(this, profiler, app, logger, storage, p2p, crypto, config);
        this.accountPatcher = new AccountPatcher(this, profiler, app, logger, p2p, crypto, config);
        this.cachedAppDataManager = new CachedAppDataManager(this, profiler, app, logger, crypto, p2p, config);
        this.processCycleSummaries = false;
        this.debugSkipPatcherRepair = config.debug.skipPatcherRepair;
        this.feature_receiptMapResults = true;
        this.feature_partitionHashes = true;
        this.feature_generateStats = false;
        this.feature_useNewParitionReport = true;
        this.debugFeature_dumpAccountData = true;
        this.debugFeature_dumpAccountDataFromSQL = false;
        this.debugFeatureOld_partitionReciepts = false;
        this.stateIsGood_txHashsetOld = true;
        this.stateIsGood_activeRepairs = true;
        this.stateIsGood = true;
        if (this.config && this.config.debug) {
            this.feature_useNewParitionReport = this.tryGetBoolProperty(this.config.debug, 'useNewParitionReport', this.feature_useNewParitionReport);
            this.debugFeature_dumpAccountDataFromSQL = this.tryGetBoolProperty(this.config.debug, 'dumpAccountReportFromSQL', this.debugFeature_dumpAccountDataFromSQL);
        }
        this.cycleDebugNotes = {
            repairs: 0,
            lateRepairs: 0,
            patchedAccounts: 0,
            badAccounts: 0,
            noRcptRepairs: 0,
        };
        this.dataRepairsCompleted = 0;
        this.dataRepairsStarted = 0;
        this.useStoredPartitionsForReport = true;
        this.partitionReceiptsByCycleCounter = {};
        this.ourPartitionReceiptsByCycleCounter = {};
        this.doDataCleanup = true;
        this.fifoLocks = {};
        this.debugTXHistory = {};
        if (p2p == null) {
            return;
        }
        this.mainLogger = logger.getLogger('main');
        this.fatalLogger = logger.getLogger('fatal');
        this.shardLogger = logger.getLogger('shardDump');
        ShardFunctions.logger = logger;
        ShardFunctions.fatalLogger = this.fatalLogger;
        ShardFunctions.mainLogger = this.mainLogger;
        this.registerEndpoints();
        this.accountSync.isSyncingAcceptedTxs = true;
        this.lastShardCalculationTS = -1;
        this.startShardCalculations();
        this.firstTimeToRuntimeSync = true;
        this.lastShardReport = '';
        this.superLargeNetworkDebugReduction = true;
        this.lastActiveCount = -1;
        this.reinjectTxsMap = new Map();
    }
    renewState() {
        this.lastSeenAccountsMap = null;
        this.appFinishedSyncing = false;
        this.dataPhaseTag = 'DATASYNC: ';
        this.lastActiveNodeCount = 0;
        this.preTXQueue = [];
        this.accountCache.resetAccountCache();
        this.accountSync.clearSyncData();
        this.accountSync.clearSyncTrackers();
        this.accountSync.dataSyncMainPhaseComplete = false;
        this.processCycleSummaries = false;
        this.fifoLocks = {};
    }
    configsInit() {
        this.debugNoTxVoting = false;
        if (this.config && this.config.debug) {
            this.debugNoTxVoting = this.config.debug.debugNoTxVoting;
            if (this.debugNoTxVoting == null) {
                this.debugNoTxVoting = false;
            }
        }
        this.ignoreRecieptChance = 0;
        if (this.config && this.config.debug) {
            this.ignoreRecieptChance = this.config.debug.ignoreRecieptChance;
            if (this.ignoreRecieptChance == null) {
                this.ignoreRecieptChance = 0;
            }
        }
        this.ignoreVoteChance = 0;
        if (this.config && this.config.debug) {
            this.ignoreVoteChance = this.config.debug.ignoreVoteChance;
            if (this.ignoreVoteChance == null) {
                this.ignoreVoteChance = 0;
            }
        }
        this.loseTxChance = 0;
        if (this.config && this.config.debug) {
            this.loseTxChance = this.config.debug.loseTxChance;
            if (this.loseTxChance == null) {
                this.loseTxChance = 0;
            }
        }
        this.failReceiptChance = 0;
        if (this.config && this.config.debug) {
            this.failReceiptChance = this.config.debug.failReceiptChance;
            if (this.failReceiptChance == null) {
                this.failReceiptChance = 0;
            }
        }
        this.voteFlipChance = 0;
        if (this.config && this.config.debug) {
            this.voteFlipChance = this.config.debug.voteFlipChance;
            if (this.voteFlipChance == null) {
                this.voteFlipChance = 0;
            }
        }
        this.failNoRepairTxChance = 0;
        if (this.config && this.config.debug) {
            this.failNoRepairTxChance = this.config.debug.failNoRepairTxChance;
            if (this.failNoRepairTxChance == null) {
                this.failNoRepairTxChance = 0;
            }
        }
    }
    updateShardValues(cycleNumber: number, mode: P2PTypes.ModesTypes.Record['mode']) {
        if (this.currentCycleShardData == null) {
        }
        const cycleShardData = {} as CycleShardData;
        const calculationTime = shardusGetTime();
        if (this.lastShardCalculationTS > 0) {
            const delay = calculationTime - this.lastShardCalculationTS - this.config.p2p.cycleDuration * 1000;
            if (delay > 5000) {
                this.statemanager_fatal(`updateShardValues-delay > 5s ${delay / 1000}`, `updateShardValues-delay ${delay / 1000}`);
            }
            else if (delay > 4000) {
            }
            else if (delay > 3000) {
            }
            else if (delay > 2000) {
            }
            cycleShardData.calculationTime = calculationTime;
        }
        this.lastShardCalculationTS = calculationTime;
        cycleShardData.nodeShardDataMap = new Map();
        cycleShardData.parititionShardDataMap = new Map();
        cycleShardData.nodes = this.getNodesForCycleShard(mode);
        cycleShardData.cycleNumber = cycleNumber;
        cycleShardData.partitionsToSkip = new Map();
        cycleShardData.hasCompleteData = false;
        if (this.lastActiveCount === -1) {
            this.lastActiveCount = activeByIdOrder.length;
        }
        else {
            const change = activeByIdOrder.length - this.lastActiveCount;
            if (change != 0) {
            }
            this.lastActiveCount = activeByIdOrder.length;
        }
        try {
            cycleShardData.ourNode = NodeList.nodes.get(this.p2p.getNodeId());
        }
        catch (ex) {
            return;
        }
        if (cycleShardData.nodes.length === 0) {
            return;
        }
        if (this.config === null || this.config.sharding === null) {
            throw new Error('this.config.sharding === null');
        }
        const cycle = this.p2p.state.getLastCycle();
        if (cycle !== null && cycle !== undefined) {
            cycleShardData.timestamp = cycle.start * 1000;
            cycleShardData.timestampEndCycle = (cycle.start + cycle.duration) * 1000;
        }
        const edgeNodes = this.config.sharding.nodesPerEdge as number;
        cycleShardData.shardGlobals = ShardFunctions.calculateShardGlobals(cycleShardData.nodes.length, this.config.sharding.nodesPerConsensusGroup as number, edgeNodes);
        ShardFunctions.computePartitionShardDataMap(cycleShardData.shardGlobals, cycleShardData.parititionShardDataMap, 0, cycleShardData.shardGlobals.numPartitions);
        ShardFunctions.computeNodePartitionDataMap(cycleShardData.shardGlobals, cycleShardData.nodeShardDataMap, cycleShardData.nodes, cycleShardData.parititionShardDataMap, cycleShardData.nodes, false);
        cycleShardData.nodeShardData = ShardFunctions.computeNodePartitionData(cycleShardData.shardGlobals, cycleShardData.ourNode, cycleShardData.nodeShardDataMap, cycleShardData.parititionShardDataMap, cycleShardData.nodes, true);
        const fullDataForDebug = true;
        ShardFunctions.computeNodePartitionDataMap(cycleShardData.shardGlobals, cycleShardData.nodeShardDataMap, cycleShardData.nodes, cycleShardData.parititionShardDataMap, cycleShardData.nodes, fullDataForDebug);
        this.currentCycleShardData = cycleShardData;
        this.shardValuesByCycle.set(cycleNumber, cycleShardData);
        if (cycleShardData.ourNode.status === 'active') {
            cycleShardData.syncingNeighbors = this.p2p.state.getOrderedSyncingNeighbors(cycleShardData.ourNode);
            if (cycleShardData.syncingNeighbors.length > 0) {
                cycleShardData.syncingNeighborsTxGroup = [...cycleShardData.syncingNeighbors];
                cycleShardData.syncingNeighborsTxGroup.push(cycleShardData.ourNode);
                cycleShardData.hasSyncingNeighbors = true;
            }
            else {
                cycleShardData.hasSyncingNeighbors = false;
            }
            this.accountSync.updateRuntimeSyncTrackers();
        }
        const partitions = ShardFunctions.getConsenusPartitionList(cycleShardData.shardGlobals, cycleShardData.nodeShardData);
        cycleShardData.ourConsensusPartitions = partitions;
        const partitions2 = ShardFunctions.getStoredPartitionList(cycleShardData.shardGlobals, cycleShardData.nodeShardData);
        cycleShardData.ourStoredPartitions = partitions2;
        this.lastActiveNodeCount = cycleShardData.nodes.length;
        cycleShardData.hasCompleteData = true;
    }
    calculateChangeInCoverage(): void {
        const newSharddata = this.currentCycleShardData;
        if (newSharddata == null || this.currentCycleShardData == null) {
            return;
        }
        let cycleToCompareTo = newSharddata.cycleNumber - 1;
        if (this.firstTimeToRuntimeSync === true) {
            this.firstTimeToRuntimeSync = false;
            if (this.accountSync.syncStatement.cycleStarted < cycleToCompareTo) {
                cycleToCompareTo = this.accountSync.syncStatement.cycleStarted;
            }
            else {
            }
        }
        const oldShardData = this.shardValuesByCycle.get(cycleToCompareTo);
        if (oldShardData == null) {
            return;
        }
        const cycle = this.currentCycleShardData.cycleNumber;
        const coverageChanges = ShardFunctions.computeCoverageChanges(oldShardData.nodeShardData, newSharddata.nodeShardData);
        this.coverageChangesCopy = coverageChanges;
        for (const change of coverageChanges) {
            const range = {
                startAddr: 0,
                endAddr: 0,
                low: '',
                high: '',
            } as StateManagerTypes.shardFunctionTypes.BasicAddressRange;
            range.startAddr = change.start;
            range.endAddr = change.end;
            range.low = ShardFunctions.leadZeros8(range.startAddr.toString(16)) + '0'.repeat(56);
            range.high = ShardFunctions.leadZeros8(range.endAddr.toString(16)) + 'f'.repeat(56);
            this.accountSync.createSyncTrackerByRange(range, cycle);
        }
        if (coverageChanges.length > 0) {
            this.accountSync.syncRuntimeTrackers();
        }
    }
    getCurrentCycleShardData(): CycleShardData | null {
        if (this.currentCycleShardData === null) {
            const cycle = this.p2p.state.getLastCycle();
            if (cycle === null || cycle === undefined) {
                return null;
            }
            this.updateShardValues(cycle.counter, cycle.mode);
        }
        return this.currentCycleShardData;
    }
    hasCycleShardData() {
        return this.currentCycleShardData != null;
    }
    async waitForShardCalcs() {
        while (this.currentCycleShardData == null) {
            this.getCurrentCycleShardData();
            await utils.sleep(1000);
        }
    }
    debugNodeGroup(key: string, key2: number, msg: string, nodes: P2PTypes.P2PTypes.NodeInfo[]) {
    }
    getRandomInt(max: number): number {
        return Math.floor(Math.random() * Math.floor(max));
    }
    tryGetBoolProperty(parent: Record<string, unknown>, propertyName: string, defaultValue: boolean) {
        if (parent == null) {
            return defaultValue;
        }
        const tempValue = parent[propertyName];
        if (typeof tempValue === 'boolean') {
            return tempValue;
        }
        return defaultValue;
    }
    testFailChance(failChance: number, debugName: string, key: string, message: string, verboseRequired: boolean): boolean {
        if (failChance == null) {
            return false;
        }
        const rand = Math.random();
        if (failChance > rand) {
            if (debugName != null) {
                if (verboseRequired === false || logFlags.verbose) {
                }
            }
            return true;
        }
        return false;
    }
    async startCatchUpQueue() {
        await this.waitForShardData('startCatchUpQueue');
        await this._firstTimeQueueAwait();
        this.logger.playbackLogState('datasyncComplete', '', '');
        this.dataPhaseTag = 'ACTIVE: ';
        this.accountSync.dataSyncMainPhaseComplete = true;
        this.accountSync.syncStatement.syncComplete = true;
        this.accountSync.syncStatement.cycleEnded = this.currentCycleShardData.cycleNumber;
        this.accountSync.syncStatement.numCycles =
            this.accountSync.syncStatement.cycleEnded - this.accountSync.syncStatement.cycleStarted;
        this.accountSync.syncStatement.syncEndTime = shardusGetTime();
        this.accountSync.syncStatement.syncSeconds =
            (this.accountSync.syncStatement.syncEndTime - this.accountSync.syncStatement.syncStartTime) / 1000;
        if (this.accountSync.syncStatement.internalFlag === true) {
            this.accountSync.syncStatmentIsComplete();
            this.statemanager_fatal('shrd_sync_syncStatement-startCatchUpQueue', `${utils.stringifyReduce(this.accountSync.syncStatement)}`);
        }
        else {
            this.accountSync.syncStatement.internalFlag = true;
        }
        this.tryStartTransactionProcessingQueue();
    }
    recordPotentialBadnode() {
    }
    async writeCombinedAccountDataToBackups(goodAccounts: ShardusTypes.WrappedData[], failedHashes: string[]): Promise<number> {
        if (failedHashes.length === 0 && goodAccounts.length === 0) {
            return 0;
        }
        const failedAccountsById: {
            [id: string]: boolean;
        } = {};
        for (const hash of failedHashes) {
            failedAccountsById[hash] = true;
        }
        const lastCycle = this.p2p.state.getLastCycle();
        const cycleNumber = lastCycle.counter;
        const accountCopies: AccountCopy[] = [];
        for (const accountEntry of goodAccounts) {
            if (failedAccountsById[accountEntry.stateId]) {
                continue;
            }
            const isGlobal = this.accountGlobals.isGlobalAccount(accountEntry.accountId);
            const accountCopy: AccountCopy = {
                accountId: accountEntry.accountId,
                data: accountEntry.data,
                timestamp: accountEntry.timestamp,
                hash: accountEntry.stateId,
                cycleNumber,
                isGlobal: isGlobal || false,
            };
            accountCopies.push(accountCopy);
        }
        await this.storage.createOrReplaceAccountCopy(accountCopies);
        return accountCopies.length;
    }
    async getAccountDataByRangeSmart(accountStart: string, accountEnd: string, tsStart: number, maxRecords: number, offset: number, accountOffset: string): Promise<GetAccountDataByRangeSmart> {
        const tsEnd = shardusGetTime();
        const wrappedAccounts = await this.app.getAccountDataByRange(accountStart, accountEnd, tsStart, tsEnd, maxRecords, offset, accountOffset);
        let lastUpdateNeeded = false;
        let wrappedAccounts2: WrappedStateArray = [];
        let highestTs = 0;
        let delta = 0;
        if (wrappedAccounts.length === 0) {
            lastUpdateNeeded = true;
        }
        else {
            highestTs = 0;
            for (const account of wrappedAccounts) {
                if (account.timestamp > highestTs) {
                    highestTs = account.timestamp;
                }
            }
            delta = tsEnd - highestTs;
            if (delta < this.queueSitTime * 2) {
                const tsStart2 = highestTs;
                wrappedAccounts2 = await this.app.getAccountDataByRange(accountStart, accountEnd, tsStart2, shardusGetTime(), maxRecords, 0, '');
                lastUpdateNeeded = true;
            }
        }
        return { wrappedAccounts, lastUpdateNeeded, wrappedAccounts2, highestTs, delta };
    }
    testAccountDataWrapped(accountDataList: ShardusTypes.WrappedData[]) {
        if (accountDataList == null) {
            return;
        }
        for (const wrappedData of accountDataList) {
            const { accountId, stateId, data: recordData } = wrappedData;
            if (stateId != wrappedData.stateId) {
                if (logFlags.error)
                    this.mainLogger.error(`testAccountDataWrapped what is going on!!:  ${utils.makeShortHash(wrappedData.stateId)}  stateId: ${utils.makeShortHash(stateId)} `);
            }
            const hash = this.app.calculateAccountHash(recordData);
            if (stateId.length !== hash.length || !timingSafeEqual(Buffer.from(stateId), Buffer.from(hash))) {
                if (logFlags.error)
                    this.mainLogger.error(`testAccountDataWrapped hash test failed: setAccountData for account ${utils.makeShortHash(accountId)} expected account hash: ${utils.makeShortHash(stateId)} got ${utils.makeShortHash(hash)} `);
                if (logFlags.error)
                    this.mainLogger.error('testAccountDataWrapped hash test failed: details: ' + Utils.safeStringify(recordData));
                if (logFlags.error)
                    this.mainLogger.error('testAccountDataWrapped hash test failed: wrappedData.stateId: ' + utils.makeShortHash(wrappedData.stateId));
                const stack = new Error().stack;
                if (logFlags.error)
                    this.mainLogger.error(`stack: ${stack}`);
            }
        }
    }
    async checkAndSetAccountData(accountRecords: ShardusTypes.WrappedData[], note: string, processStats: boolean, updatedAccounts: string[] = null): Promise<string[]> {
        const accountsToAdd: unknown[] = [];
        const wrappedAccountsToAdd: ShardusTypes.WrappedData[] = [];
        const failedHashes: string[] = [];
        for (const wrappedAccount of accountRecords) {
            const { accountId, stateId, data: recordData, timestamp } = wrappedAccount;
            const hash = this.app.calculateAccountHash(recordData);
            const cycleToRecordOn = CycleChain.getCycleNumberFromTimestamp(wrappedAccount.timestamp);
            if (cycleToRecordOn <= -1) {
                this.statemanager_fatal(`checkAndSetAccountData cycleToRecordOn==-1`, `checkAndSetAccountData cycleToRecordOn==-1 ${wrappedAccount.timestamp}`);
                failedHashes.push(accountId);
                return failedHashes;
            }
            if (this.accountCache.hasAccount(accountId)) {
                const accountMemData: AccountHashCache = this.accountCache.getAccountHash(accountId);
                if (timestamp < accountMemData.t) {
                    this.accountCache.updateAccountHash(wrappedAccount.accountId, wrappedAccount.stateId, wrappedAccount.timestamp, cycleToRecordOn);
                    if (logFlags.error)
                        this.mainLogger.error(`setAccountData: abort. checkAndSetAccountData older timestamp note:${note} acc: ${utils.makeShortHash(accountId)} timestamp:${timestamp} accountMemData.t:${accountMemData.t} hash: ${utils.makeShortHash(hash)} cache:${utils.stringifyReduce(accountMemData)}`);
                    continue;
                }
            }
            if (stateId.length === hash.length && timingSafeEqual(Buffer.from(stateId), Buffer.from(hash))) {
                accountsToAdd.push(recordData);
                wrappedAccountsToAdd.push(wrappedAccount);
                if (updatedAccounts != null) {
                    updatedAccounts.push(accountId);
                }
                const debugString = `setAccountData: note:${note} acc: ${utils.makeShortHash(accountId)} hash: ${utils.makeShortHash(hash)} ts:${wrappedAccount.timestamp}`;
                if (wrappedAccount.timestamp === 0) {
                    const stack = new Error().stack;
                    this.statemanager_fatal(`checkAndSetAccountData ts=0`, `checkAndSetAccountData ts=0 ${debugString}    ${stack}`);
                }
                if (processStats) {
                    if (this.accountCache.hasAccount(accountId)) {
                        const tryToCorrectStats = true;
                        if (tryToCorrectStats) {
                            this.transactionQueue.setDebugLastAwaitedCallInner('ths.app.getAccountDataByList');
                            const accounts = await this.app.getAccountDataByList([wrappedAccount.accountId]);
                            this.transactionQueue.setDebugLastAwaitedCallInner('ths.app.getAccountDataByList', DebugComplete.Completed);
                            if (accounts != null && accounts.length === 1) {
                                this.partitionStats.statsDataSummaryUpdate(cycleToRecordOn, accounts[0].data, wrappedAccount, 'checkAndSetAccountData-' + note);
                            }
                        }
                        else {
                            this.accountCache.updateAccountHash(wrappedAccount.accountId, wrappedAccount.stateId, wrappedAccount.timestamp, cycleToRecordOn);
                        }
                    }
                    else {
                        this.partitionStats.statsDataSummaryInit(cycleToRecordOn, wrappedAccount.accountId, wrappedAccount.data, 'checkAndSetAccountData-' + note);
                    }
                }
                else {
                    this.accountCache.updateAccountHash(wrappedAccount.accountId, wrappedAccount.stateId, wrappedAccount.timestamp, cycleToRecordOn);
                }
            }
            else {
                if (logFlags.error)
                    this.mainLogger.error(`setAccountData hash test failed: setAccountData for account ${utils.makeShortHash(accountId)} expected account hash: ${utils.makeShortHash(stateId)} got ${utils.makeShortHash(hash)} `);
                if (logFlags.error)
                    this.mainLogger.error('setAccountData hash test failed: details: ' + utils.stringifyReduce(recordData));
                failedHashes.push(accountId);
            }
        }
        this.transactionQueue.setDebugLastAwaitedCallInner('ths.app.setAccountData');
        await this.app.setAccountData(accountsToAdd);
        this.transactionQueue.setDebugLastAwaitedCallInner('ths.app.setAccountData', DebugComplete.Completed);
        this.transactionQueue.processNonceQueue(wrappedAccountsToAdd);
        return failedHashes;
    }
    _registerListener(emitter: EventEmitter, event: string, callback: Callback) {
        if (this._listeners[event]) {
            this.statemanager_fatal(`_registerListener_dupes`, 'State Manager can only register one listener per event!');
            return;
        }
        emitter.on(event, callback);
        this._listeners[event] = [emitter, callback];
    }
    _unregisterListener(event: string) {
        if (!this._listeners[event]) {
            this.mainLogger.warn(`This event listener doesn't exist! Event: \`${event}\` in StateManager`);
            return;
        }
        const entry = this._listeners[event];
        const [emitter, callback] = entry;
        emitter.removeListener(event, callback);
        delete this._listeners[event];
    }
    _cleanupListeners() {
        for (const event of Object.keys(this._listeners)) {
            this._unregisterListener(event);
        }
    }
    registerEndpoints() {
        this.accountGlobals.setupHandlers();
        this.depricated.setupHandlers();
        if (this.partitionObjects != null) {
            this.partitionObjects.setupHandlers();
        }
        this.transactionQueue.setupHandlers();
        this.accountSync.setupHandlers();
        this.transactionConsensus.setupHandlers();
        this.accountPatcher.setupHandlers();
        this.cachedAppDataManager.setupHandlers();
        this.partitionStats.setupHandlers();
        const requestReceiptForTxBinaryHandler: P2PTypes.P2PTypes.Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_request_receipt_for_tx,
            handler: (payload, respond) => {
                const route = InternalRouteEnum.binary_request_receipt_for_tx;
                const response: RequestReceiptForTxRespSerialized = { receipt: null, note: '', success: false };
                try {
                    const req = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cRequestReceiptForTxReq);
                    const deserialized = deserializeRequestReceiptForTxReq(req);
                    let queueEntry = this.transactionQueue.getQueueEntrySafe(deserialized.txid);
                    if (queueEntry == null) {
                        queueEntry = this.transactionQueue.getQueueEntryArchived(deserialized.txid, route);
                    }
                    if (queueEntry == null) {
                        response.note = `failed to find queue entry: ${utils.stringifyReduce(deserialized.txid)}  ${deserialized.timestamp} dbg:${this.debugTXHistory[utils.stringifyReduce(deserialized.txid)]}`;
                        respond(response, serializeRequestReceiptForTxResp);
                        return;
                    }
                    if (queueEntry.acceptedTx?.timestamp !== deserialized.timestamp) {
                        response.note = `requested timestamp does not match txid: ${utils.stringifyReduce(deserialized.txid)} 
            request: ${deserialized.timestamp} 
            queueuEntry timestamp: ${queueEntry.acceptedTx?.timestamp}
            dbg:${this.debugTXHistory[utils.stringifyReduce(deserialized.txid)]}`;
                        respond(response, serializeRequestReceiptForTxResp);
                        return;
                    }
                    response.receipt = this.getSignedReceipt(queueEntry);
                    if (response.receipt != null) {
                        response.success = true;
                    }
                    else {
                        response.note = `found queueEntry but no receipt: ${utils.stringifyReduce(deserialized.txid)} ${deserialized.txid}  ${deserialized.timestamp}`;
                    }
                    respond(response, serializeRequestReceiptForTxResp);
                }
                catch (e) {
                    this.mainLogger.error(`${route} error: ${e.message} stack: ${e.stack}`);
                    respond(response, serializeRequestReceiptForTxResp);
                }
                finally {
                }
            },
        };
        this.p2p.registerInternalBinary(requestReceiptForTxBinaryHandler.name, requestReceiptForTxBinaryHandler.handler);
        const requestStateForTxPostBinaryHandler: Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_request_state_for_tx_post,
            handler: async (payload, respond, header, sign) => {
                const route = InternalRouteEnum.binary_request_state_for_tx_post;
                const errorHandler = (errorType: RequestErrorEnum, opts?: {
                    customErrorLog?: string;
                    customCounterSuffix?: string;
                }): void => requestErrorHandler(route, errorType, header, opts);
                try {
                    const response: RequestStateForTxPostResp = {
                        stateList: [],
                        beforeHashes: {},
                        note: '',
                        success: false,
                    };
                    const txId = header.verification_data;
                    let queueEntry = this.transactionQueue.getQueueEntrySafe(txId);
                    if (queueEntry == null) {
                        queueEntry = this.transactionQueue.getQueueEntryArchived(txId, route);
                    }
                    if (queueEntry == null) {
                        response.note = `failed to find queue entry: ${utils.stringifyReduce(txId)} dbg:${this.debugTXHistory[utils.stringifyReduce(txId)]}`;
                        return respond(response, serializeRequestStateForTxPostResp);
                    }
                    if (queueEntry.hasValidFinalData === false) {
                        response.note = `has queue entry but not final data: ${utils.stringifyReduce(txId)} dbg:${this.debugTXHistory[utils.stringifyReduce(txId)]}`;
                        if (logFlags.error && logFlags.verbose)
                            this.mainLogger.error(response.note);
                        return respond(response, serializeRequestStateForTxPostResp);
                    }
                    const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cRequestStateForTxPostReq);
                    if (!requestStream) {
                        errorHandler(RequestErrorEnum.InvalidRequest);
                        return respond(response, serializeRequestStateForTxPostResp);
                    }
                    const req = deserializeRequestStateForTxPostReq(requestStream);
                    let wrappedStates = this.useAccountWritesOnly ? {} : queueEntry.collectedData;
                    const applyResponse = queueEntry?.preApplyTXResult.applyResponse;
                    if (applyResponse != null &&
                        applyResponse.accountWrites != null &&
                        applyResponse.accountWrites.length > 0) {
                        const writtenAccountsMap: WrappedResponses = {};
                        for (const writtenAccount of applyResponse.accountWrites) {
                            writtenAccountsMap[writtenAccount.accountId] = writtenAccount.data;
                        }
                        wrappedStates = writtenAccountsMap;
                    }
                    if (wrappedStates != null) {
                        for (const [key, accountData] of Object.entries(wrappedStates)) {
                            if (req.key !== accountData.accountId) {
                                continue;
                            }
                            if (accountData.stateId != req.hash) {
                                response.note = `failed accountData.stateId != req.hash txid: ${utils.makeShortHash(req.txid)} hash:${utils.makeShortHash(accountData.stateId)}`;
                                return respond(response, serializeRequestStateForTxPostResp);
                            }
                            if (accountData) {
                                response.beforeHashes[key] = queueEntry.beforeHashes[key];
                                response.stateList.push(accountData);
                            }
                        }
                    }
                    response.success = true;
                    return respond(response, serializeRequestStateForTxPostResp);
                }
                catch (e) {
                    if (logFlags.error)
                        this.mainLogger.error(`${route} error: ${utils.errorToStringFull(e)}`);
                    respond({ stateList: [], beforeHashes: {}, note: '', success: false }, serializeRequestStateForTxPostResp);
                }
                finally {
                }
            },
        };
        this.p2p.registerInternalBinary(requestStateForTxPostBinaryHandler.name, requestStateForTxPostBinaryHandler.handler);
        const requestTxAndStateBinaryHandler: Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_request_tx_and_state,
            handler: async (payload, respond, header, sign) => {
                const route = InternalRouteEnum.binary_request_tx_and_state;
                const errorHandler = (errorType: RequestErrorEnum, opts?: {
                    customErrorLog?: string;
                    customCounterSuffix?: string;
                }): void => requestErrorHandler(route, errorType, header, opts);
                let response: RequestTxResp = {
                    stateList: [],
                    account_state_hash_before: {},
                    account_state_hash_after: {},
                    note: '',
                    success: false,
                    appReceiptData: null
                };
                try {
                    const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cRequestTxAndStateReq);
                    if (!requestStream) {
                        errorHandler(RequestErrorEnum.InvalidRequest);
                        respond(response, serializeRequestTxAndStateResp);
                        return;
                    }
                    const req: RequestTxAndStateReq = deserializeRequestTxAndStateReq(requestStream);
                    const txid = req.txid;
                    const requestedAccountIds = req.accountIds;
                    let queueEntry = this.transactionQueue.getQueueEntrySafe(txid);
                    if (queueEntry == null) {
                        queueEntry = this.transactionQueue.getQueueEntryArchived(txid, route);
                    }
                    if (queueEntry == null) {
                        response.note = `failed to find queue entry: ${utils.stringifyReduce(txid)} dbg:${this.debugTXHistory[utils.stringifyReduce(txid)]}`;
                        if (logFlags.error)
                            this.mainLogger.error(`${route} ${response.note}`);
                        respond(response, serializeRequestTxAndStateResp);
                        return;
                    }
                    if (queueEntry.isInExecutionHome === false) {
                        response.note = `${route} not in execution group: ${utils.stringifyReduce(txid)}`;
                        if (logFlags.error)
                            this.mainLogger.error(response.note);
                        respond(response, serializeRequestTxAndStateResp);
                        return;
                    }
                    let receipt2 = this.getSignedReceipt(queueEntry);
                    if (receipt2 == null) {
                        response.note = `${route} does not have valid receipt2: ${utils.stringifyReduce(txid)}`;
                        if (logFlags.error)
                            this.mainLogger.error(response.note);
                        respond(response, serializeRequestTxAndStateResp);
                        return;
                    }
                    let wrappedStates = this.useAccountWritesOnly ? {} : queueEntry.collectedData;
                    const writtenAccountsMap: WrappedResponses = {};
                    const applyResponse = queueEntry?.preApplyTXResult.applyResponse;
                    if (applyResponse != null &&
                        applyResponse.accountWrites != null &&
                        applyResponse.accountWrites.length > 0) {
                        for (const writtenAccount of applyResponse.accountWrites) {
                            writtenAccountsMap[writtenAccount.accountId] = writtenAccount.data;
                        }
                        wrappedStates = writtenAccountsMap;
                    }
                    if (wrappedStates != null) {
                        for (let i = 0; i < receipt2.proposal.accountIDs.length; i++) {
                            let key = receipt2.proposal.accountIDs[i];
                            let accountData = wrappedStates[key];
                            if (accountData && requestedAccountIds.includes(key)) {
                                response.account_state_hash_before[key] = receipt2.proposal.beforeStateHashes[i];
                                response.account_state_hash_after[key] = receipt2.proposal.afterStateHashes[i];
                                response.stateList.push(accountData);
                            }
                        }
                        response.appReceiptData = queueEntry.preApplyTXResult?.applyResponse?.appReceiptData;
                    }
                    response.success = true;
                    respond(response, serializeRequestTxAndStateResp);
                }
                catch (e) {
                    if (logFlags.error)
                        Context.logger.getLogger('p2p').error(`${route}: Exception executing request: ${utils.errorToStringFull(e)}`);
                    respond(response, serializeRequestTxAndStateResp);
                }
                finally {
                }
            },
        };
        const requestTxAndStateBeforeBinaryHandler: Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_request_tx_and_state_before,
            handler: async (payload, respond, header, sign) => {
                const route = InternalRouteEnum.binary_request_tx_and_state_before;
                const errorHandler = (errorType: RequestErrorEnum, opts?: {
                    customErrorLog?: string;
                    customCounterSuffix?: string;
                }): void => requestErrorHandler(route, errorType, header, opts);
                let response: RequestTxResp = {
                    stateList: [],
                    account_state_hash_before: {},
                    account_state_hash_after: {},
                    note: '',
                    success: false,
                };
                try {
                    const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cRequestTxAndStateReq);
                    if (!requestStream) {
                        errorHandler(RequestErrorEnum.InvalidRequest);
                        respond(response, serializeRequestTxAndStateResp);
                        return;
                    }
                    const req: RequestTxAndStateReq = deserializeRequestTxAndStateReq(requestStream);
                    const txid = req.txid;
                    const requestedAccountIds = req.accountIds;
                    let queueEntry = this.transactionQueue.getQueueEntrySafe(txid);
                    if (queueEntry == null) {
                        queueEntry = this.transactionQueue.getQueueEntryArchived(txid, route);
                    }
                    if (queueEntry == null) {
                        response.note = `failed to find queue entry: ${utils.stringifyReduce(txid)} dbg:${this.debugTXHistory[utils.stringifyReduce(txid)]}`;
                        if (logFlags.error)
                            this.mainLogger.error(`${route} ${response.note}`);
                        respond(response, serializeRequestTxAndStateResp);
                        return;
                    }
                    if (queueEntry.isInExecutionHome === false) {
                        response.note = `${route} not in execution group: ${utils.stringifyReduce(txid)}`;
                        if (logFlags.error)
                            this.mainLogger.error(response.note);
                        respond(response, serializeRequestTxAndStateResp);
                        return;
                    }
                    let receipt2 = this.getSignedReceipt(queueEntry);
                    if (receipt2 == null) {
                        response.note = `${route} does not have valid receipt2: ${utils.stringifyReduce(txid)}`;
                        if (logFlags.error)
                            this.mainLogger.error(response.note);
                        respond(response, serializeRequestTxAndStateResp);
                        return;
                    }
                    for (const accountId of requestedAccountIds) {
                        const beforeState = queueEntry.collectedData[accountId];
                        const index = receipt2.proposal.accountIDs.indexOf(accountId);
                        if (beforeState &&
                            beforeState.stateId === receipt2.proposal.beforeStateHashes[index]) {
                            response.stateList.push(queueEntry.collectedData[accountId]);
                        }
                        else {
                            response.note = `has bad beforeStateAccount: ${utils.stringifyReduce(txid)} dbg:${this.debugTXHistory[utils.stringifyReduce(txid)]}`;
                            if (logFlags.error)
                                this.mainLogger.error(`${route} ${response.note}`);
                            respond(response, serializeRequestTxAndStateResp);
                            return;
                        }
                    }
                    response.success = true;
                    respond(response, serializeRequestTxAndStateResp);
                }
                catch (e) {
                    if (logFlags.error)
                        Context.logger.getLogger('p2p').error(`${route}: Exception executing request: ${utils.errorToStringFull(e)}`);
                    respond(response, serializeRequestTxAndStateResp);
                }
                finally {
                }
            },
        };
        this.p2p.registerInternalBinary(requestTxAndStateBinaryHandler.name, requestTxAndStateBinaryHandler.handler);
        this.p2p.registerInternalBinary(requestTxAndStateBeforeBinaryHandler.name, requestTxAndStateBeforeBinaryHandler.handler);
        const binaryGetAccDataWithQueueHintsHandler: Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_get_account_data_with_queue_hints,
            handler: async (payload, respond, header, sign) => {
                const route = InternalRouteEnum.binary_get_account_data_with_queue_hints;
                try {
                    let accountData = null;
                    const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cGetAccountDataWithQueueHintsReq);
                    if (!requestStream) {
                        return respond(BadRequest(`${route} invalid request`), serializeResponseError);
                    }
                    const req = deserializeGetAccountDataWithQueueHintsReq(requestStream);
                    if (utils.isValidShardusAddress(req.accountIds) === false) {
                        return respond(BadRequest(`${route} invalid account_ids`), serializeResponseError);
                    }
                    let ourLockID = -1;
                    try {
                        ourLockID = await this.fifoLock('accountModification');
                        accountData = await this.app.getAccountDataByList(req.accountIds);
                    }
                    finally {
                        this.fifoUnlock('accountModification', ourLockID);
                    }
                    if (accountData != null) {
                        for (const wrappedAccount of accountData) {
                            const wrappedAccountInQueueRef = wrappedAccount as WrappedDataFromQueueSerializable;
                            wrappedAccountInQueueRef.seenInQueue = false;
                            if (this.lastSeenAccountsMap != null) {
                                const queueEntry = this.lastSeenAccountsMap[wrappedAccountInQueueRef.accountId];
                                if (queueEntry != null) {
                                    wrappedAccountInQueueRef.seenInQueue = true;
                                }
                            }
                        }
                    }
                    const resp: GetAccountDataWithQueueHintsResp = {
                        accountData: accountData as WrappedDataFromQueueSerializable[] | null,
                    };
                    respond(resp, serializeGetAccountDataWithQueueHintsResp);
                }
                catch (e) {
                    if (logFlags.error || logFlags.getLocalOrRemote)
                        this.mainLogger.error(`${route} error: ${utils.errorToStringFull(e)}`);
                    return respond(InternalError(`${route} exception executing request`), serializeResponseError);
                }
                finally {
                }
            },
        };
        this.p2p.registerInternalBinary(binaryGetAccDataWithQueueHintsHandler.name, binaryGetAccDataWithQueueHintsHandler.handler);
        const binaryGetAccountQueueCountHandler: Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_get_account_queue_count,
            handler: async (payload, respond, header, sign) => {
                const route = InternalRouteEnum.binary_get_account_queue_count;
                try {
                    const requestStream = VectorBufferStream.fromBuffer(payload);
                    const requestType = requestStream.readUInt16();
                    if (requestType !== TypeIdentifierEnum.cGetAccountQueueCountReq) {
                        respond(false, serializeGetAccountQueueCountResp);
                        return;
                    }
                    const req = deserializeGetAccountQueueCountReq(requestStream);
                    const MAX_ACCOUNTS = this.config.stateManager.accountBucketSize;
                    if (req.accountIds.length > MAX_ACCOUNTS) {
                        return respond(BadRequest(`${route} too many accounts requested`), serializeResponseError);
                    }
                    const result: GetAccountQueueCountResp = {
                        counts: [],
                        committingAppData: [],
                        accounts: [],
                    };
                    if (utils.isValidShardusAddress(req.accountIds) === false) {
                        respond(false, serializeGetAccountQueueCountResp);
                        return;
                    }
                    for (const address of req.accountIds) {
                        const { count, committingAppData } = this.transactionQueue.getAccountQueueCount(address, true);
                        result.counts.push(count);
                        result.committingAppData.push(committingAppData);
                        if (this.config.stateManager.enableAccountFetchForQueueCounts) {
                            const currentAccountData = await this.getLocalOrRemoteAccount(address);
                            if (currentAccountData && currentAccountData.data) {
                                result.accounts.push(currentAccountData.data);
                            }
                        }
                    }
                    respond(result, serializeGetAccountQueueCountResp);
                }
                catch (e) {
                    if (logFlags.error)
                        this.mainLogger.error(`${route} error: ${e}`);
                    respond(false, serializeGetAccountQueueCountResp);
                }
                finally {
                }
            },
        };
        this.p2p.registerInternalBinary(binaryGetAccountQueueCountHandler.name, binaryGetAccountQueueCountHandler.handler);
        Context.network.registerExternalGet('debug_stats', isDebugModeMiddleware, (_req, res) => {
            const cycle = this.currentCycleShardData.cycleNumber - 1;
            let cycleShardValues = null;
            if (this.shardValuesByCycle.has(cycle)) {
                cycleShardValues = this.shardValuesByCycle.get(cycle);
            }
            const blob = this.partitionStats.dumpLogsForCycle(cycle, false, cycleShardValues);
            res.json({ cycle, blob });
        });
        Context.network.registerExternalGet('debug_stats2', isDebugModeMiddleware, (_req, res) => {
            const cycle = this.currentCycleShardData.cycleNumber - 1;
            let blob = {};
            let cycleShardValues = null;
            if (this.shardValuesByCycle.has(cycle)) {
                cycleShardValues = this.shardValuesByCycle.get(cycle);
                blob = this.partitionStats.buildStatsReport(cycleShardValues);
            }
            res.json({ cycle, blob });
        });
        Context.network.registerExternalGet('clear_tx_debug', isDebugModeMiddlewareLow, (_req, res) => {
            this.transactionQueue.clearTxDebugStatList();
            res.json({ success: true });
        });
        Context.network.registerExternalGet('print_tx_debug', isDebugModeMiddlewareLow, (_req, res) => {
            const result = this.transactionQueue.printTxDebug();
            res.write(result);
            res.end();
        });
        Context.network.registerExternalGet('print_tx_debug_by_txid', isDebugModeMiddlewareLow, (_req, res) => {
            const txId = _req.query.txId;
            if (txId == null) {
                res.write('txId parameter required');
                res.end();
                return;
            }
            if (typeof txId !== 'string') {
                res.write('txId parameter must be a string');
                res.end();
                return;
            }
            const result = this.transactionQueue.printTxDebugByTxId(txId);
            res.write(result);
            res.end();
        });
        Context.network.registerExternalGet('last_process_stats', isDebugModeMiddlewareLow, (_req, res) => {
            const result = JSON.stringify(this.transactionQueue.lastProcessStats, null, 2);
            res.write(result);
            res.end();
        });
        Context.network.registerExternalGet('nodelist_debug', isDebugModeMiddleware, (_req, res) => {
            const debugNodeList = [];
            for (const node of activeByIdOrder) {
                const nodeEntry = {
                    id: utils.makeShortHash(node.id),
                    ip: node.externalIp,
                    port: node.externalPort,
                };
                debugNodeList.push(nodeEntry);
            }
            res.json(debugNodeList);
        });
        Context.network.registerExternalGet('debug-consensus-log', isDebugModeMiddleware, (req, res) => {
            this.consensusLog = !this.consensusLog;
            res.write(`consensusLog: ${this.consensusLog}`);
            res.end();
        });
        Context.network.registerExternalGet('debug-noncequeue-count', isDebugModeMiddleware, (req, res) => {
            let result = this.transactionQueue.getPendingCountInNonceQueue();
            res.json(result);
            res.end();
        });
        Context.network.registerExternalGet('debug-queue-item-by-txid', isDebugModeMiddlewareLow, (_req, res) => {
            const txId = _req.query.txId;
            if (txId == null || typeof txId !== 'string' || txId.length !== 64) {
                res.write('invalid txId provided');
                res.end();
                return;
            }
            const result = this.transactionQueue.getQueueItemById(txId);
            res.write(Utils.safeStringify(result));
            res.end();
        });
        Context.network.registerExternalGet('debug-queue-items', isDebugModeMiddleware, (req, res) => {
            let result = this.transactionQueue.getQueueItems();
            res.write(Utils.safeStringify(result));
            res.end();
        });
        Context.network.registerExternalGet('debug-queue-clear', isDebugModeMiddleware, (req, res) => {
            let minAge = req.query.minAge ? parseInt(req.query.minAge as string) : -1;
            if (isNaN(minAge))
                minAge = -1;
            let result = this.transactionQueue.clearQueueItems(minAge);
            res.write(Utils.safeStringify(result));
            res.end();
        });
        Context.network.registerExternalGet('debug-stuck-tx', isDebugModeMiddleware, (_req, res) => {
            const opts = {
                minAge: _req.query?.minAge || 0,
                state: _req.query?.state,
                nextStates: _req.query?.nextStates === 'false' ? false : true,
            };
            res.json(this.transactionQueue.getDebugStuckTxs(opts));
        });
        Context.network.registerExternalGet('debug-stuck-processing', isDebugModeMiddleware, (_req, res) => {
            res.json(this.transactionQueue.getDebugProccessingStatus());
        });
        Context.network.registerExternalGet('debug-fix-stuck-processing', isDebugModeMiddleware, (req, res) => {
            let response = 'not stuck';
            const clear = req.query.clear === 'true' || false;
            const isStuck = this.transactionQueue.isStuckProcessing;
            if (isStuck) {
                response = Utils.safeStringify(this.transactionQueue.getDebugProccessingStatus());
                this.transactionQueue.fixStuckProcessing(clear);
            }
            res.write(response);
            res.end();
        });
        Context.network.registerExternalGet('debug-fifoLocks', isDebugModeMiddleware, (req, res) => {
            const getAll = req.query.all === 'true' || false;
            let toPrint = this.fifoLocks;
            if (getAll === false) {
                toPrint = this.getLockedFifoAccounts();
            }
            const response = JSON.stringify(toPrint, null, 2);
            res.write(response);
            res.end();
        });
        Context.network.registerExternalGet('debug-fifoLocks-unlock', isDebugModeMiddleware, (_req, res) => {
            const unlockCount = this.forceUnlockAllFifoLocks('debug-fifoLocks-unlock');
            const response = JSON.stringify({ unlockCount }, null, 2);
            res.write(response);
            res.end();
        });
    }
    _unregisterEndpoints() {
        this.p2p.unregisterGossipHandler('spread_tx_to_group');
        this.p2p.unregisterGossipHandler('spread_appliedReceipt');
        for (const binary_endpoint of Object.values(InternalRouteEnum)) {
            this.p2p.unregisterInternal(binary_endpoint);
        }
    }
    tryStartTransactionProcessingQueue() {
        if (!this.accountSync.dataSyncMainPhaseComplete) {
            return;
        }
        if (!this.transactionQueue.transactionProcessingQueueRunning) {
            this.transactionQueue.processTransactions();
        }
    }
    async _firstTimeQueueAwait() {
        if (this.transactionQueue.transactionProcessingQueueRunning) {
            this.statemanager_fatal(`queueAlreadyRunning`, 'DATASYNC: newAcceptedTxQueueRunning');
            return;
        }
        this.accountSync.syncStatement.nonDiscardedTXs = this.transactionQueue.pendingTransactionQueue.length;
        await this.transactionQueue.processTransactions(true);
        if (this.accountSync.syncStatement.internalFlag === true) {
            this.accountSync.syncStatmentIsComplete();
            this.statemanager_fatal('shrd_sync_syncStatement-firstTimeQueueAwait', `${utils.stringifyReduce(this.accountSync.syncStatement)}`);
        }
        else {
            this.accountSync.syncStatement.internalFlag = true;
        }
    }
    _sortByIdAsc(first: {
        id: string;
    }, second: {
        id: string;
    }): number {
        if (first.id < second.id) {
            return -1;
        }
        if (first.id > second.id) {
            return 1;
        }
        return 0;
    }
    async dumpAccountDebugData2(mainHashResults: MainHashResults) {
        if (this.currentCycleShardData == null) {
            return;
        }
        const partitionMap = this.currentCycleShardData.parititionShardDataMap;
        const ourNodeShardData: StateManagerTypes.shardFunctionTypes.NodeShardData = this.currentCycleShardData.nodeShardData;
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
        };
        partitionDump.cycle = this.currentCycleShardData.cycleNumber;
        const minP = ourNodeShardData.consensusStartPartition;
        const maxP = ourNodeShardData.consensusEndPartition;
        const cMin = ourNodeShardData.consensusStartPartition;
        const cMax = ourNodeShardData.consensusEndPartition;
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
        };
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
        };
        for (const node of ourNodeShardData.consensusNodeForOurNode) {
            const nodeData = this.currentCycleShardData.nodeShardDataMap.get(node.id);
            partitionDump.nodesCovered.consensus.push({ idx: nodeData.ourNodeIndex, hp: nodeData.homePartition });
        }
        for (const node of ourNodeShardData.nodeThatStoreOurParitionFull) {
            const nodeData = this.currentCycleShardData.nodeShardDataMap.get(node.id);
            partitionDump.nodesCovered.stored.push({ idx: nodeData.ourNodeIndex, hp: nodeData.homePartition });
        }
        if (this.currentCycleShardData.ourNode.status === 'active') {
            for (const [key, value] of partitionMap) {
                const partition: DebugDumpPartition = {
                    parititionID: key,
                    accounts: [],
                    accounts2: [],
                    skip: {} as DebugDumpPartitionSkip,
                };
                partitionDump.partitions.push(partition);
                if (maxP > minP) {
                    if (key < minP || key > maxP) {
                        partition.skip = { p: key, min: minP, max: maxP };
                        continue;
                    }
                }
                else if (maxP === minP) {
                    if (key !== maxP) {
                        partition.skip = { p: key, min: minP, max: maxP, noSpread: true };
                        continue;
                    }
                }
                else {
                    if (key > maxP && key < minP) {
                        partition.skip = { p: key, min: minP, max: maxP, inverted: true };
                        continue;
                    }
                }
                const partitionShardData = value;
                const accountStart = partitionShardData.homeRange.low;
                const accountEnd = partitionShardData.homeRange.high;
                if (this.debugFeature_dumpAccountDataFromSQL === true) {
                    const wrappedAccounts = await this.app.getAccountData(accountStart, accountEnd, 10000000);
                    const duplicateCheck = {};
                    for (const wrappedAccount of wrappedAccounts) {
                        if (duplicateCheck[wrappedAccount.accountId] != null) {
                            continue;
                        }
                        duplicateCheck[wrappedAccount.accountId] = true;
                        let v: string;
                        if (this.app.getAccountDebugValue != null) {
                            v = this.app.getAccountDebugValue(wrappedAccount);
                        }
                        else {
                            v = 'getAccountDebugValue not defined';
                        }
                        partition.accounts.push({ id: wrappedAccount.accountId, hash: wrappedAccount.stateId, v: v });
                    }
                    partition.accounts.sort(this._sortByIdAsc);
                }
                if (mainHashResults.partitionHashResults.has(partition.parititionID)) {
                    const partitionHashResults = mainHashResults.partitionHashResults.get(partition.parititionID);
                    for (let index = 0; index < partitionHashResults.hashes.length; index++) {
                        const id = partitionHashResults.ids[index];
                        const hash = partitionHashResults.hashes[index];
                        const v = `{t:${partitionHashResults.timestamps[index]}}`;
                        partition.accounts2.push({ id, hash, v });
                    }
                    partition.partitionHash2 = partitionHashResults.hashOfHashes;
                }
            }
            for (const node of this.currentCycleShardData.nodes) {
                partitionDump.allNodeIds.push(utils.makeShortHash(node.id));
            }
            partitionDump.globalAccountIDs = Array.from(this.accountGlobals.globalAccountSet.keys());
            partitionDump.globalAccountIDs.sort();
            const { globalAccountSummary, globalStateHash } = this.accountGlobals.getGlobalDebugReport();
            partitionDump.globalAccountSummary = globalAccountSummary;
            partitionDump.globalStateHash = globalStateHash;
        }
        else {
            if (this.currentCycleShardData != null && this.currentCycleShardData.nodes.length > 0) {
                for (const node of this.currentCycleShardData.nodes) {
                    partitionDump.allNodeIds.push(utils.makeShortHash(node.id));
                }
            }
        }
        this.lastShardReport = utils.stringifyReduce(partitionDump);
    }
    async waitForShardData(counterMsg = '') {
        while (this.currentCycleShardData == null) {
            this.getCurrentCycleShardData();
            await utils.sleep(1000);
            if (counterMsg.length > 0) {
            }
        }
    }
    async getLocalOrRemoteAccountQueueCount(address: string): Promise<QueueCountsResult> {
        let count: number = -1;
        let committingAppData: unknown = undefined;
        let account: unknown = undefined;
        if (this.currentCycleShardData == null) {
            await this.waitForShardData();
        }
        if (this.currentCycleShardData == null) {
            throw new Error('getLocalOrRemoteAccount: network not ready');
        }
        let forceLocalGlobalLookup = false;
        if (this.accountGlobals.isGlobalAccount(address)) {
            forceLocalGlobalLookup = true;
        }
        let accountIsRemote = this.transactionQueue.isAccountRemote(address);
        if (forceLocalGlobalLookup) {
            accountIsRemote = false;
        }
        if (accountIsRemote) {
            const maxRetry = 3;
            let success = false;
            let retryCount = 0;
            const triedConsensusNodeIds: string[] = [];
            while (success === false && retryCount < maxRetry) {
                retryCount += 1;
                const randomConsensusNode = this.transactionQueue.getRandomConsensusNodeForAccount(address, triedConsensusNodeIds);
                if (randomConsensusNode == null) {
                    this.statemanager_fatal('getLocalOrRemoteAccountQueueCount', `No consensus node found for account ${address}, retry ${retryCount}`);
                    continue;
                }
                triedConsensusNodeIds.push(randomConsensusNode.id);
                if (this.isNodeValidForInternalMessage(randomConsensusNode.id, 'getLocalOrRemoteAccountQueueCount', true, true, true, true) === false) {
                    if (logFlags.verbose)
                        this.getAccountFailDump(address, `getLocalOrRemoteAccountQueueCount: isNodeValidForInternalMessage failed, retry ${retryCount}`);
                    continue;
                }
                const message: RequestAccountQueueCounts = { accountIds: [address] };
                let r: QueueCountsResponse | false;
                try {
                    const serialized_res = await this.p2p.askBinary<GetAccountQueueCountReq, GetAccountQueueCountResp>(randomConsensusNode, InternalRouteEnum.binary_get_account_queue_count, message, serializeGetAccountQueueCountReq, deserializeGetAccountQueueCountResp, {});
                    r = serialized_res as QueueCountsResponse;
                }
                catch (error) {
                    if (logFlags.error)
                        this.mainLogger.error(`ASK FAIL getLocalOrRemoteAccountQueueCount: askBinary ex: ${error.message}`);
                    r = null;
                }
                if (!r) {
                    if (logFlags.error)
                        this.mainLogger.error('ASK FAIL getLocalOrRemoteAccountQueueCount r === false');
                }
                const result = r as QueueCountsResponse;
                if (result != null && result.counts != null && result.counts.length > 0) {
                    count = result.counts[0];
                    committingAppData = result.committingAppData[0];
                    if (this.config.stateManager.enableAccountFetchForQueueCounts) {
                        account = result.accounts[0];
                    }
                    success = true;
                }
                else {
                    if (result == null) {
                        if (logFlags.verbose)
                            this.getAccountFailDump(address, 'remote request missing data 2: result == null');
                    }
                    else if (result.counts == null) {
                        if (logFlags.verbose)
                            this.getAccountFailDump(address, 'remote request missing data 2: result.counts == null ' + utils.stringifyReduce(result));
                    }
                    else if (result.counts.length <= 0) {
                        if (logFlags.verbose)
                            this.getAccountFailDump(address, 'remote request missing data 2: result.counts.length <= 0 ' + utils.stringifyReduce(result));
                    }
                }
            }
        }
        else {
            const queueCountResult = this.transactionQueue.getAccountQueueCount(address);
            count = queueCountResult.count;
            committingAppData = queueCountResult.committingAppData;
            if (this.config.stateManager.enableAccountFetchForQueueCounts) {
                const currentAccountData = await this.getLocalOrRemoteAccount(address);
                if (currentAccountData) {
                    account = currentAccountData.data;
                }
            }
        }
        return { count, committingAppData, account };
    }
    async getLocalOrRemoteAccount(address: string, opts: {
        useRICache: boolean;
        canThrowException?: boolean;
    } = { useRICache: false, canThrowException: false }): Promise<ShardusTypes.WrappedDataFromQueue | null> {
        let wrappedAccount: ShardusTypes.WrappedDataFromQueue | null = null;
        if (!isServiceMode()) {
            if (this.currentCycleShardData == null) {
                await this.waitForShardData();
            }
            if (this.currentCycleShardData == null) {
                throw new Error('getLocalOrRemoteAccount: network not ready');
            }
        }
        if (opts.useRICache) {
            const riCacheResult = await this.app.getCachedRIAccountData([address]);
            if (riCacheResult != null) {
                if (riCacheResult.length > 0) {
                    wrappedAccount = riCacheResult[0] as ShardusTypes.WrappedDataFromQueue;
                    return wrappedAccount;
                }
            }
            else {
            }
        }
        let forceLocalGlobalLookup = false;
        if (this.accountGlobals.isGlobalAccount(address) || isServiceMode()) {
            forceLocalGlobalLookup = true;
        }
        let accountIsRemote = isServiceMode() ? true : this.transactionQueue.isAccountRemote(address);
        if (!isServiceMode()) {
            if (this.currentCycleShardData.nodes.length <= this.currentCycleShardData.shardGlobals.consensusRadius) {
                accountIsRemote = false;
            }
        }
        if (forceLocalGlobalLookup) {
            accountIsRemote = false;
        }
        if (accountIsRemote) {
            let randomConsensusNode: P2PTypes.NodeListTypes.Node;
            const preCheckLimit = 5;
            for (let i = 0; i < preCheckLimit; i++) {
                randomConsensusNode = this.transactionQueue.getRandomConsensusNodeForAccount(address);
                if (randomConsensusNode == null) {
                    throw new Error(`getLocalOrRemoteAccount: no consensus node found`);
                }
                if (this.isNodeValidForInternalMessage(randomConsensusNode.id, 'getLocalOrRemoteAccount', true, true, true, true) === false) {
                    if (i >= preCheckLimit - 1) {
                        if (logFlags.verbose || logFlags.getLocalOrRemote)
                            this.getAccountFailDump(address, 'getLocalOrRemoteAccount: isNodeValidForInternalMessage failed, no retry');
                        if (opts.canThrowException) {
                            throw new Error(`getLocalOrRemoteAccount: no consensus nodes worth asking`);
                        }
                        else
                            return null;
                    }
                }
                else {
                    break;
                }
            }
            const message = { accountIds: [address] };
            let r: GetAccountDataWithQueueHintsResp;
            try {
                const serialized_res = await this.p2p.askBinary<GetAccountDataWithQueueHintsReqSerializable, GetAccountDataWithQueueHintsRespSerializable>(randomConsensusNode, InternalRouteEnum.binary_get_account_data_with_queue_hints, message, serializeGetAccountDataWithQueueHintsReq, deserializeGetAccountDataWithQueueHintsResp, {});
                r = serialized_res as GetAccountDataWithQueueHintsResp;
            }
            catch (er) {
                if (er instanceof ResponseError && logFlags.error) {
                    this.mainLogger.error(`ASK FAIL getLocalOrRemoteAccount exception: ResponseError encountered. Code: ${er.Code}, AppCode: ${er.AppCode}, Message: ${er.Message}`);
                }
                if (logFlags.verbose || logFlags.getLocalOrRemote)
                    this.mainLogger.error('askBinary', er);
                if (opts.canThrowException) {
                    throw er;
                }
                else {
                }
            }
            if (!r) {
                if (logFlags.error || logFlags.getLocalOrRemote)
                    this.mainLogger.error('ASK FAIL getLocalOrRemoteAccount r === false');
                if (opts.canThrowException)
                    throw new Error(`getLocalOrRemoteAccount: remote node had an exception`);
            }
            const result = r as GetAccountDataWithQueueHintsResp;
            if (result != null && result.accountData != null && result.accountData.length > 0) {
                wrappedAccount = result.accountData[0];
                if (wrappedAccount == null) {
                    if (logFlags.verbose || logFlags.getLocalOrRemote)
                        this.getAccountFailDump(address, 'remote result.accountData[0] == null');
                }
                return wrappedAccount;
            }
            else {
                if (result == null) {
                    if (logFlags.verbose || logFlags.getLocalOrRemote)
                        this.getAccountFailDump(address, 'remote request missing data: result == null');
                }
                else if (result.accountData == null) {
                    if (logFlags.verbose || logFlags.getLocalOrRemote)
                        this.getAccountFailDump(address, 'remote request missing data: result.accountData == null ' + utils.stringifyReduce(result));
                }
                else if (result.accountData.length <= 0) {
                    if (logFlags.verbose || logFlags.getLocalOrRemote)
                        this.getAccountFailDump(address, 'remote request missing data: result.accountData.length <= 0 ' + utils.stringifyReduce(result));
                }
            }
        }
        else {
            const accountData = await this.app.getAccountDataByList([address]);
            if (accountData != null) {
                for (const wrappedAccountEntry of accountData) {
                    const expandedRef = wrappedAccountEntry as ShardusTypes.WrappedDataFromQueue;
                    expandedRef.seenInQueue = false;
                    if (this.lastSeenAccountsMap != null) {
                        const queueEntry = this.lastSeenAccountsMap[expandedRef.accountId];
                        if (queueEntry != null) {
                            expandedRef.seenInQueue = true;
                        }
                    }
                    wrappedAccount = expandedRef;
                }
            }
            else {
                if (logFlags.verbose || logFlags.getLocalOrRemote)
                    this.getAccountFailDump(address, 'getAccountDataByList() returned null');
                return null;
            }
            if (accountData[0] == null) {
                if (logFlags.verbose || logFlags.getLocalOrRemote)
                    this.getAccountFailDump(address, 'accountData[0] == null');
            }
            if (accountData.length > 1 || accountData.length == 0) {
                if (logFlags.verbose || logFlags.getLocalOrRemote)
                    this.getAccountFailDump(address, `getAccountDataByList() returned wrong element count: ${accountData}`);
            }
            return wrappedAccount;
        }
        return null;
    }
    getAccountFailDump(address: string, message: string) {
    }
    async getRemoteAccount(address: string) {
        let wrappedAccount: unknown;
        await this.waitForShardData();
        if (this.currentCycleShardData == null) {
            throw new Error('getRemoteAccount: network not ready');
        }
        const homeNode = ShardFunctions.findHomeNode(this.currentCycleShardData.shardGlobals, address, this.currentCycleShardData.parititionShardDataMap);
        if (homeNode == null) {
            throw new Error(`getRemoteAccount: no home node found`);
        }
        if (this.isNodeValidForInternalMessage(homeNode.node.id, 'getRemoteAccount', true, true) === false) {
            if (logFlags.error)
                this.mainLogger.error('getRemoteAccount: isNodeValidForInternalMessage failed, no retry yet');
            return null;
        }
        const message = { accountIds: [address] };
        let result: GetAccountDataWithQueueHintsResp;
        try {
            const serialized_res = await this.p2p.askBinary<GetAccountDataWithQueueHintsReqSerializable, GetAccountDataWithQueueHintsRespSerializable>(homeNode.node, InternalRouteEnum.binary_get_account_data_with_queue_hints, message, serializeGetAccountDataWithQueueHintsReq, deserializeGetAccountDataWithQueueHintsResp, {});
            result = serialized_res as GetAccountDataWithQueueHintsResp;
        }
        catch (er) {
            if (er instanceof ResponseError && logFlags.error) {
                this.mainLogger.error(`ASK FAIL getRemoteAccount exception: ResponseError encountered. Code: ${er.Code}, AppCode: ${er.AppCode}, Message: ${er.Message}`);
            }
            else if (logFlags.verbose)
                this.mainLogger.error('ASK FAIL getRemoteAccount exception:', er);
            return null;
        }
        if (!result) {
            if (logFlags.error)
                this.mainLogger.error('ASK FAIL getRemoteAccount result === false');
        }
        if (result === null) {
            if (logFlags.error)
                this.mainLogger.error('ASK FAIL getRemoteAccount result === null');
        }
        if (result != null && result.accountData != null && result.accountData.length > 0) {
            wrappedAccount = result.accountData[0];
            return wrappedAccount;
        }
        return null;
    }
    getClosestNodes(hash: string, count = 1, selfExclude = false): ShardusTypes.Node[] {
        if (this.currentCycleShardData == null) {
            throw new Error('getClosestNodes: network not ready');
        }
        const cycleShardData = this.currentCycleShardData;
        const homeNode = ShardFunctions.findHomeNode(cycleShardData.shardGlobals, hash, cycleShardData.parititionShardDataMap);
        if (homeNode == null) {
            throw new Error(`getClosestNodes: no home node found`);
        }
        const homeNodeIndex = homeNode.ourNodeIndex;
        let idToExclude = '';
        if (selfExclude === true) {
            idToExclude = Self.id;
        }
        const results = ShardFunctions.getNodesByProximity(cycleShardData.shardGlobals, cycleShardData.nodes, homeNodeIndex, idToExclude, count, true);
        const uniqueNodes = results.filter((node, index, self) => {
            return self.findIndex(({ id }) => id === node.id) === index;
        });
        return uniqueNodes;
    }
    checkCycleShardData(tag: string): boolean {
        if (this.currentCycleShardData == null) {
            this.mainLogger.error(`checkCycleShardData: currentCycleShardData == null for eventType ${tag}`);
            return false;
        }
        return true;
    }
    _distanceSortAsc(a: SimpleDistanceObject, b: SimpleDistanceObject) {
        if (a.distance === b.distance) {
            return 0;
        }
        if (a.distance < b.distance) {
            return -1;
        }
        else {
            return 1;
        }
    }
    getClosestNodesGlobal(hash: string, count: number) {
        const hashNumber = parseInt(hash.slice(0, 7), 16);
        const nodes = activeByIdOrder;
        const nodeDistMap: {
            id: string;
            distance: number;
        }[] = nodes.map((node) => ({
            id: node.id,
            distance: Math.abs(hashNumber - parseInt(node.id.slice(0, 7), 16)),
        }));
        nodeDistMap.sort(this._distanceSortAsc);
        return nodeDistMap.slice(0, count).map((node) => node.id);
    }
    isNodeInDistance(_shardGlobals: StateManagerTypes.shardFunctionTypes.ShardGlobals, _parititionShardDataMap: StateManagerTypes.shardFunctionTypes.ParititionShardDataMap, hash: string, nodeId: string, distance: number) {
        const cycleShardData = this.currentCycleShardData;
        if (cycleShardData == null) {
            return false;
        }
        const someNode = ShardFunctions.findHomeNode(cycleShardData.shardGlobals, nodeId, cycleShardData.parititionShardDataMap);
        if (someNode == null) {
            return false;
        }
        const someNodeIndex = someNode.ourNodeIndex;
        const homeNode = ShardFunctions.findHomeNode(cycleShardData.shardGlobals, hash, cycleShardData.parititionShardDataMap);
        if (homeNode == null) {
            return false;
        }
        const homeNodeIndex = homeNode.ourNodeIndex;
        const partitionDistance = Math.abs(someNodeIndex - homeNodeIndex);
        if (partitionDistance <= distance) {
            return true;
        }
        return false;
    }
    async _clearState() {
        await this.storage.clearAppRelatedState();
    }
    _stopQueue() {
        this.transactionQueue.queueStopped = true;
    }
    _clearQueue() {
        this.transactionQueue._transactionQueue = [];
    }
    async cleanup() {
        this._stopQueue();
        this._unregisterEndpoints();
        this._clearQueue();
        this._cleanupListeners();
        await this._clearState();
    }
    isStateGood() {
        return this.stateIsGood;
    }
    async setAccount(wrappedStates: WrappedResponses, localCachedData: LocalCachedData, applyResponse: ShardusTypes.ApplyResponse, isGlobalModifyingTX: boolean, accountFilter?: AccountFilter, note?: string) {
        const canWriteToAccount = function (accountId: string) {
            return !accountFilter || accountFilter[accountId] !== undefined;
        };
        let savedSomething = false;
        let keys = Object.keys(wrappedStates);
        keys.sort();
        const appOrderedKeys = [];
        if (applyResponse?.accountWrites?.length != null && applyResponse.accountWrites.length > 0) {
            for (const wrappedAccount of applyResponse.accountWrites) {
                appOrderedKeys.push(wrappedAccount.accountId);
            }
            keys = appOrderedKeys;
        }
        for (const key of keys) {
            const wrappedData = wrappedStates[key];
            if (wrappedData == null) {
                continue;
            }
            if (canWriteToAccount(wrappedData.accountId) === false) {
                continue;
            }
            if (this.accountGlobals.isGlobalAccount(key)) {
                if (isGlobalModifyingTX === false) {
                    continue;
                }
            }
            if (wrappedData.isPartial) {
                this.transactionQueue.setDebugLastAwaitedCallInner('this.app.updateAccountPartial');
                await this.app.updateAccountPartial(wrappedData, localCachedData[key], applyResponse);
                this.transactionQueue.setDebugLastAwaitedCallInner('this.app.updateAccountPartial', DebugComplete.Completed);
            }
            else {
                this.transactionQueue.setDebugLastAwaitedCallInner('this.app.updateAccountFull');
                await this.app.updateAccountFull(wrappedData, localCachedData[key], applyResponse);
                this.transactionQueue.setDebugLastAwaitedCallInner('this.app.updateAccountFull', DebugComplete.Completed);
            }
            savedSomething = true;
            this.transactionQueue.processNonceQueue([wrappedData]);
        }
        return savedSomething;
    }
    async updateAccountsCopyTable(accountDataList: ShardusTypes.AccountData[], _repairing: boolean, txTimestamp: number) {
        let cycleNumber = -1;
        const timePlusSettle = txTimestamp + this.syncSettleTime;
        const cycle = CycleChain.getCycleNumberFromTimestamp(txTimestamp);
        cycleNumber = cycle;
        if (cycleNumber <= -1) {
            this.statemanager_fatal(`updateAccountsCopyTable cycleToRecordOn==-1`, `updateAccountsCopyTable cycleToRecordOn==-1 ${timePlusSettle}`);
            return;
        }
        if (accountDataList.length > 0 && accountDataList[0].timestamp !== txTimestamp) {
            if (logFlags.verbose)
                if (logFlags.error)
                    this.mainLogger.error(`updateAccountsCopyTable timestamps do match txts:${txTimestamp} acc.ts:${accountDataList[0].timestamp} `);
        }
        if (accountDataList.length === 0) {
            if (logFlags.verbose)
                if (logFlags.error)
                    this.mainLogger.error(`updateAccountsCopyTable empty txts:${txTimestamp}  `);
        }
        for (const accountEntry of accountDataList) {
            const { accountId, data, timestamp, hash } = accountEntry;
            const isGlobal = this.accountGlobals.isGlobalAccount(accountId);
            const backupObj: ShardusTypes.AccountsCopy = { accountId, data, timestamp, hash, cycleNumber, isGlobal };
            await this.storage.createOrReplaceAccountCopy(backupObj);
        }
    }
    async _commitAccountCopies(accountCopies: ShardusTypes.AccountsCopy[]) {
        const rawDataList: unknown[] = [];
        if (accountCopies.length > 0) {
            for (const accountData of accountCopies) {
                if (utils.isString(accountData.data)) {
                    try {
                        accountData.data = Utils.safeJsonParse(accountData.data as string);
                    }
                    catch (error) {
                        this.mainLogger.error(` _commitAccountCopies fail to parse accountData.data: ${accountData.data} data: ${utils.stringifyReduce(accountData)}`);
                    }
                }
                if (accountData == null || accountData.data == null || accountData.accountId == null) {
                    if (logFlags.verbose)
                        if (logFlags.error)
                            this.mainLogger.error(` _commitAccountCopies null account data found: ${accountData.accountId} data: ${utils.stringifyReduce(accountData)}`);
                    continue;
                }
                else {
                }
                rawDataList.push(accountData.data);
            }
            await this.app.setAccountData(rawDataList);
            const globalAccountKeyMap: {
                [key: string]: boolean;
            } = {};
            this.accountGlobals.hasknownGlobals = true;
            for (const accountEntry of accountCopies) {
                const { accountId, data, timestamp, hash, cycleNumber, isGlobal } = accountEntry;
                if (isGlobal == true) {
                    globalAccountKeyMap[accountId] = true;
                }
                const backupObj: ShardusTypes.AccountsCopy = { accountId, data, timestamp, hash, cycleNumber, isGlobal };
                if (globalAccountKeyMap[accountId] === true) {
                    if (this.accountGlobals.isGlobalAccount(accountId) === false) {
                        this.accountGlobals.setGlobalAccount(accountId);
                    }
                }
                this.accountCache.updateAccountHash(accountId, hash, timestamp, 0);
                try {
                    await this.storage.createOrReplaceAccountCopy(backupObj);
                }
                catch (error) {
                    if (logFlags.verbose)
                        if (logFlags.error)
                            this.mainLogger.error(` _commitAccountCopies storage: ${Utils.safeStringify(error)}}`);
                }
            }
        }
    }
    async fifoLock(fifoName: string): Promise<number> {
        if (this.config.stateManager.fifoUnlockFix3 === true) {
            return;
        }
        const stack = '';
        let thisFifo = this.fifoLocks[fifoName];
        if (thisFifo == null) {
            thisFifo = {
                fifoName,
                queueCounter: 0,
                waitingList: [],
                lastServed: 0,
                queueLocked: false,
                lockOwner: 1,
                lastLock: shardusGetTime(),
            };
            this.fifoLocks[fifoName] = thisFifo;
        }
        thisFifo.queueCounter++;
        const ourID = thisFifo.queueCounter;
        const entry = { id: ourID };
        if (fifoName === 'accountModification') {
        }
        if (thisFifo.waitingList.length > 0 || thisFifo.queueLocked) {
            thisFifo.waitingList.push(entry);
            while ((thisFifo.waitingList.length > 0 && thisFifo.waitingList[0]?.id !== ourID) ||
                thisFifo.queueLocked) {
                let sleepEstimate = ourID - thisFifo.lastServed;
                if (sleepEstimate < 1) {
                    sleepEstimate = 1;
                }
                await utils.sleep(1 * sleepEstimate);
            }
            thisFifo.waitingList.shift();
        }
        thisFifo.queueLocked = true;
        thisFifo.lockOwner = ourID;
        thisFifo.lastServed = ourID;
        thisFifo.lastLock = shardusGetTime();
        return ourID;
    }
    fifoUnlock(fifoName: string, id: number) {
        if (this.config.stateManager.fifoUnlockFix3 === true) {
            return;
        }
        const stack = '';
        const thisFifo = this.fifoLocks[fifoName];
        if (id === -1 || !thisFifo) {
            return;
        }
        if (thisFifo.lockOwner === id) {
            thisFifo.queueLocked = false;
        }
        else if (id !== -1) {
            this.statemanager_fatal(`fifoUnlock`, `Failed to unlock the fifo ${thisFifo.fifoName}: ${id}`);
        }
    }
    async bulkFifoLockAccounts(accountIDs: string[]) {
        if (this.config.stateManager.fifoUnlockFix3 === true) {
            return [];
        }
        const wrapperLockId = await this.fifoLock('atomicWrapper');
        const ourLocks = [];
        const seen: StringBoolObjectMap = {};
        for (const accountKey of accountIDs) {
            if (seen[accountKey] === true) {
                ourLocks.push(-1);
                continue;
            }
            seen[accountKey] = true;
            const ourLockID = await this.fifoLock(accountKey);
            ourLocks.push(ourLockID);
        }
        this.fifoUnlock('atomicWrapper', wrapperLockId);
        return ourLocks;
    }
    bulkFifoUnlockAccounts(accountIDs: string[], ourLocks: number[]) {
        if (this.config.stateManager.fifoUnlockFix3 === true) {
            return;
        }
        const seen: StringBoolObjectMap = {};
        for (let i = 0; i < ourLocks.length; i++) {
            const accountID = accountIDs[i];
            if (seen[accountID] === true) {
                continue;
            }
            seen[accountID] = true;
            const ourLockID = ourLocks[i];
            if (ourLockID == -1) {
                this.statemanager_fatal(`bulkFifoUnlockAccounts_fail`, `bulkFifoUnlockAccounts hit placeholder i:${i} ${utils.stringifyReduce({ accountIDs, ourLocks })} `);
            }
            this.fifoUnlock(accountID, ourLockID);
        }
    }
    getLockedFifoAccounts(): FifoLockObjectMap {
        const results = {};
        if (this.fifoLocks != null) {
            for (const [key, value] of Object.entries(this.fifoLocks)) {
                if (value.queueLocked) {
                    results[key] = value;
                }
            }
        }
        return results;
    }
    forceUnlockAllFifoLocks(tag: string): number {
        const locked = this.getLockedFifoAccounts();
        let clearCount = 0;
        for (const value of Object.values(locked)) {
            value.queueLocked = false;
            value.waitingList = [];
            value.lastLock = shardusGetTime();
            clearCount++;
        }
        return clearCount;
    }
    clearStaleFifoLocks() {
        try {
            const time = shardusGetTime() - 1000 * 60 * 10;
            const keysToDelete = [];
            for (const [key, value] of Object.entries(this.fifoLocks)) {
                if (value.lastLock < time && value.queueLocked === false) {
                    keysToDelete.push(key);
                }
            }
            for (const key of keysToDelete) {
                delete this.fifoLocks[key];
            }
        }
        catch (err) {
            this.mainLogger.error(`clearStaleFifoLocks: ${err}`);
        }
    }
    periodicCycleDataCleanup(oldestCycle: number) {
        if (oldestCycle < 0) {
            return;
        }
        if (this.partitionObjects != null) {
            if (this.partitionObjects.allPartitionResponsesByCycleByPartition == null) {
                return;
            }
            if (this.partitionObjects.ourPartitionResultsByCycle == null) {
                return;
            }
        }
        if (this.shardValuesByCycle == null) {
            return;
        }
        const removedrepairTrackingByCycleById = 0;
        let removedallPartitionResponsesByCycleByPartition = 0;
        let removedourPartitionResultsByCycle = 0;
        let removedshardValuesByCycle = 0;
        let removedTrieConsensusData = 0;
        if (this.partitionObjects != null) {
            for (const cycleKey of Object.keys(this.partitionObjects.allPartitionResponsesByCycleByPartition)) {
                const cycle = cycleKey.slice(1);
                const cycleNum = parseInt(cycle, 10);
                if (cycleNum < oldestCycle) {
                    delete this.partitionObjects.allPartitionResponsesByCycleByPartition[cycleKey];
                    removedallPartitionResponsesByCycleByPartition++;
                }
            }
            for (const cycleKey of Object.keys(this.partitionObjects.ourPartitionResultsByCycle)) {
                const cycle = cycleKey.slice(1);
                const cycleNum = parseInt(cycle, 10);
                if (cycleNum < oldestCycle) {
                    delete this.partitionObjects.ourPartitionResultsByCycle[cycleKey];
                    removedourPartitionResultsByCycle++;
                }
            }
        }
        for (const cycleNum of this.shardValuesByCycle.keys()) {
            if (cycleNum < oldestCycle) {
                this.shardValuesByCycle.delete(cycleNum);
                removedshardValuesByCycle++;
            }
        }
        for (const cycleNum of this.accountPatcher.hashTrieSyncConsensusByCycle.keys()) {
            if (cycleNum < oldestCycle) {
                this.accountPatcher.hashTrieSyncConsensusByCycle.delete(cycleNum);
                removedTrieConsensusData++;
            }
        }
        let removedtxByCycleByPartition = 0;
        let removedrecentPartitionObjectsByCycleByHash = 0;
        const removedrepairUpdateDataByCycle = 0;
        let removedpartitionObjectsByCycle = 0;
        if (this.partitionObjects != null) {
            for (const cycleKey of Object.keys(this.partitionObjects.txByCycleByPartition)) {
                const cycle = cycleKey.slice(1);
                const cycleNum = parseInt(cycle, 10);
                if (cycleNum < oldestCycle) {
                    delete this.partitionObjects.txByCycleByPartition[cycleKey];
                    removedtxByCycleByPartition++;
                }
            }
            for (const cycleKey of Object.keys(this.partitionObjects.recentPartitionObjectsByCycleByHash)) {
                const cycle = cycleKey.slice(1);
                const cycleNum = parseInt(cycle, 10);
                if (cycleNum < oldestCycle) {
                    delete this.partitionObjects.recentPartitionObjectsByCycleByHash[cycleKey];
                    removedrecentPartitionObjectsByCycleByHash++;
                }
            }
        }
        if (this.partitionObjects != null) {
            for (const cycleKey of Object.keys(this.partitionObjects.partitionObjectsByCycle)) {
                const cycle = cycleKey.slice(1);
                const cycleNum = parseInt(cycle, 10);
                if (cycleNum < oldestCycle) {
                    delete this.partitionObjects.partitionObjectsByCycle[cycleKey];
                    removedpartitionObjectsByCycle++;
                }
            }
        }
        let removepartitionReceiptsByCycleCounter = 0;
        let removeourPartitionReceiptsByCycleCounter = 0;
        for (const cycleKey of Object.keys(this.partitionReceiptsByCycleCounter)) {
            const cycle = cycleKey.slice(1);
            const cycleNum = parseInt(cycle, 10);
            if (cycleNum < oldestCycle) {
                delete this.partitionReceiptsByCycleCounter[cycleKey];
                removepartitionReceiptsByCycleCounter++;
            }
        }
        for (const cycleKey of Object.keys(this.ourPartitionReceiptsByCycleCounter)) {
            const cycle = cycleKey.slice(1);
            const cycleNum = parseInt(cycle, 10);
            if (cycleNum < oldestCycle) {
                delete this.ourPartitionReceiptsByCycleCounter[cycleKey];
                removeourPartitionReceiptsByCycleCounter++;
            }
        }
        let oldQueueEntries = true;
        let archivedEntriesRemoved = 0;
        while (oldQueueEntries && this.transactionQueue.archivedQueueEntries.length > 0) {
            const queueEntry = this.transactionQueue.archivedQueueEntries[0];
            if (queueEntry.approximateCycleAge < oldestCycle - 3) {
                this.transactionQueue.archivedQueueEntries.shift();
                this.transactionQueue.archivedQueueEntriesByID.delete(queueEntry.acceptedTx.txId);
                delete this.debugTXHistory[utils.stringifyReduce(queueEntry.logID)];
                archivedEntriesRemoved++;
            }
            else {
                oldQueueEntries = false;
                break;
            }
        }
        this.clearStaleFifoLocks();
    }
    startShardCalculations() {
        this._registerListener(this.p2p.state, 'cycle_q1_start', async () => {
            try {
                this.eventEmitter.emit('set_queue_partition_gossip');
                const lastCycle = CycleChain.getNewest();
                if (lastCycle) {
                    const ourNode = NodeList.nodes.get(Self.id);
                    if (ourNode === null || ourNode === undefined) {
                        return;
                    }
                    this.updateShardValues(lastCycle.counter, lastCycle.mode);
                    if (this.currentCycleShardData && this.currentCycleShardData.ourNode.status === 'active') {
                        this.calculateChangeInCoverage();
                    }
                    if (this.processCycleSummaries) {
                        this.processPreviousCycleSummaries();
                    }
                }
            }
            finally {
            }
        });
        this._registerListener(this.p2p.state, 'cycle_q3_start', async () => {
            try {
                this.transactionQueue.checkForStuckProcessing();
                const lastCycle = CycleChain.getNewest();
                if (lastCycle == null) {
                    return;
                }
                const lastCycleShardValues = this.shardValuesByCycle.get(lastCycle.counter);
                if (lastCycleShardValues == null) {
                    return;
                }
                if (lastCycle.counter % 5 !== 0) {
                    return;
                }
                if (this.doDataCleanup === true) {
                    this.periodicCycleDataCleanup(lastCycle.counter - this.config.stateManager.maxCyclesShardDataToKeep);
                }
            }
            finally {
            }
        });
    }
    async processPreviousCycleSummaries() {
        const lastCycle = CycleChain.getNewest();
        if (lastCycle == null) {
            return;
        }
        const cycleShardValues = this.shardValuesByCycle.get(lastCycle.counter - 1);
        if (cycleShardValues == null) {
            return;
        }
        if (this.currentCycleShardData == null) {
            return;
        }
        if (this.currentCycleShardData.ourNode.status !== 'active') {
            return;
        }
        if (cycleShardValues.ourNode.status !== 'active') {
            return;
        }
        const cycle = CycleChain.getCycleChain(cycleShardValues.cycleNumber, cycleShardValues.cycleNumber)[0];
        if (cycle === null || cycle === undefined) {
            return;
        }
        await utils.sleep(1000);
        let receiptMapResults = [];
        if (this.feature_receiptMapResults === true) {
            receiptMapResults = this.generateReceiptMapResults(cycle);
        }
        let statsClump = {};
        if (this.feature_generateStats === true) {
            statsClump = this.partitionStats.buildStatsReport(cycleShardValues);
            this.partitionStats.dumpLogsForCycle(cycleShardValues.cycleNumber, true, cycleShardValues);
        }
        else {
            this.partitionStats.workQueue = [];
        }
        if (this.feature_partitionHashes === true) {
            if (cycleShardValues && cycleShardValues.ourNode.status === 'active') {
                this.accountCache.processCacheUpdates(cycleShardValues);
                this.accountPatcher.updateTrieAndBroadCast(lastCycle.counter);
            }
        }
        this.cycleDebugNotes = {
            repairs: 0,
            lateRepairs: 0,
            patchedAccounts: 0,
            badAccounts: 0,
            noRcptRepairs: 0,
        };
        this.eventEmitter.emit('cycleTxsFinalized', cycleShardValues, receiptMapResults, statsClump);
        this.transactionConsensus.pruneTxTimestampCache();
        if (this.debugFeature_dumpAccountData === true) {
            if (this.superLargeNetworkDebugReduction === true || logFlags.verbose) {
                const partitionDump = { cycle: cycleShardValues.cycleNumber, allNodeIds: [] };
                for (const node of this.currentCycleShardData.nodes) {
                    partitionDump.allNodeIds.push(utils.makeShortHash(node.id));
                }
                this.lastShardReport = utils.stringifyReduce(partitionDump);
            }
        }
        if (this.partitionObjects != null) {
            for (let i = 1; i <= 2; i++) {
                const prekey = 'c' + (cycle.counter + i);
                if (this.partitionObjects.partitionObjectsByCycle[prekey] == null) {
                    this.partitionObjects.partitionObjectsByCycle[prekey] = [];
                }
                if (this.partitionObjects.ourPartitionResultsByCycle[prekey] == null) {
                    this.partitionObjects.ourPartitionResultsByCycle[prekey] = [];
                }
            }
        }
        await utils.sleep(10000);
        try {
            await this.accountPatcher.testAndPatchAccounts(lastCycle.counter);
        }
        catch (e) {
            this.statemanager_fatal('processPreviousCycleSummaries', `testAndPatchAccounts ${e.message}`);
        }
    }
    initApoptosisAndQuitSyncing(logMsg: string) {
        const log = `initApoptosisAndQuitSyncing ${utils.getTime('s')}  ${logMsg}`;
        if (logFlags.error)
            this.mainLogger.error(log);
        const stack = new Error().stack;
        this.statemanager_fatal('initApoptosisAndQuitSyncing', `initApoptosisAndQuitSyncing ${logMsg} ${stack}`);
        this.accountSync.failAndDontRestartSync();
        this.p2p.initApoptosis('Apoptosis being initialized by `p2p.initApoptosis` within initApoptosisAndQuitSyncing() at src/state-manager/index.ts');
    }
    getSignedReceipt(queueEntry: QueueEntry): SignedReceipt {
        if (queueEntry.signedReceiptFinal != null) {
            return queueEntry.signedReceiptFinal;
        }
        let finalReceipt: SignedReceipt;
        if (queueEntry.signedReceipt && queueEntry.receivedSignedReceipt == null) {
            finalReceipt = queueEntry.signedReceipt;
        }
        if (queueEntry.signedReceipt == null && queueEntry.receivedSignedReceipt) {
            finalReceipt = queueEntry.receivedSignedReceipt;
        }
        if (queueEntry.signedReceiptForRepair != null) {
            finalReceipt = queueEntry.signedReceiptForRepair;
        }
        queueEntry.signedReceiptFinal = finalReceipt;
        return finalReceipt;
    }
    hasReceipt(queueEntry: QueueEntry) {
        return this.getSignedReceipt(queueEntry) != null;
    }
    getReceiptResult(queueEntry: QueueEntry) {
        const receipt = this.getSignedReceipt(queueEntry);
        if (receipt) {
            return receipt.proposal.applied;
        }
        return false;
    }
    getReceiptProposal(queueEntry: QueueEntry): Proposal {
        const receipt = this.getSignedReceipt(queueEntry);
        if (receipt) {
            return receipt.proposal;
        }
    }
    generateReceiptMapResults(lastCycle: ShardusTypes.Cycle): StateManagerTypes.StateManagerTypes.ReceiptMapResult[] {
        const results: StateManagerTypes.StateManagerTypes.ReceiptMapResult[] = [];
        const cycleToSave = lastCycle.counter;
        const receiptMapByPartition: Map<number, StateManagerTypes.StateManagerTypes.ReceiptMapResult> = new Map();
        for (let i = 0; i < this.currentCycleShardData.shardGlobals.numPartitions; i++) {
            const mapResult: ReceiptMapResult = {
                cycle: cycleToSave,
                partition: i,
                receiptMap: {},
                txCount: 0,
                txsMap: {},
                txsMapEVMReceipt: {},
            };
            receiptMapByPartition.set(i, mapResult);
            results.push(mapResult);
        }
        const queueEntriesToSave: QueueEntry[] = [];
        for (const queueEntry of this.transactionQueue._transactionQueue) {
            if (queueEntry.cycleToRecordOn === cycleToSave) {
                const receipt: SignedReceipt = this.getSignedReceipt(queueEntry);
                if (receipt == null) {
                    if (logFlags.error && queueEntry.globalModification === false)
                        this.mainLogger.error(`generateReceiptMapResults found entry in with no receipt in newAcceptedTxQueue. ${utils.stringifyReduce(queueEntry.acceptedTx)}`);
                }
                else {
                    queueEntriesToSave.push(queueEntry);
                }
            }
        }
        for (const queueEntry of this.transactionQueue.archivedQueueEntries) {
            if (queueEntry.cycleToRecordOn === cycleToSave) {
                const receipt: SignedReceipt = this.getSignedReceipt(queueEntry);
                if (receipt == null) {
                    if (queueEntry.state != 'expired') {
                        if (logFlags.error && queueEntry.globalModification === false)
                            this.mainLogger.error(`generateReceiptMapResults found entry in with no receipt in archivedQueueEntries. ${utils.stringifyReduce(queueEntry.acceptedTx)} state:${queueEntry.state}`);
                    }
                }
                else {
                    queueEntriesToSave.push(queueEntry);
                }
            }
        }
        const netId = '123abc';
        for (const queueEntry of queueEntriesToSave) {
            const accountData: ShardusTypes.WrappedResponse[] = queueEntry?.preApplyTXResult?.applyResponse?.accountData;
            if (accountData == null) {
            }
            if (accountData != null) {
                for (const account of accountData) {
                    delete account.localCache;
                }
            }
            for (const partition of queueEntry.involvedPartitions) {
                const receipt: SignedReceipt = this.getSignedReceipt(queueEntry);
                const status = receipt.proposal.applied === true ? 'applied' : 'rejected';
                const txHash = queueEntry.acceptedTx.txId;
                const obj = { tx: queueEntry.acceptedTx.data, status, netId };
                const txResultFullHash = this.crypto.hash(obj);
                const txIdShort = utils.short(txHash);
                const txResult = utils.short(txResultFullHash);
                if (receiptMapByPartition.has(partition)) {
                    const mapResult: ReceiptMapResult = receiptMapByPartition.get(partition);
                    if (mapResult.receiptMap[txIdShort] == null) {
                        mapResult.receiptMap[txIdShort] = [];
                    }
                    let gotAppReceipt = false;
                    if (receipt.proposal.appReceiptDataHash != null && receipt.proposal.appReceiptDataHash != '') {
                        const applyResponse = queueEntry?.preApplyTXResult?.applyResponse;
                        if (applyResponse && applyResponse.appReceiptDataHash === receipt.proposal.appReceiptDataHash) {
                            mapResult.txsMapEVMReceipt[txIdShort] = applyResponse.appReceiptData;
                            gotAppReceipt = true;
                        }
                    }
                    mapResult.txsMap[txIdShort] = accountData;
                    mapResult.receiptMap[txIdShort].push(txResult);
                    mapResult.txCount++;
                }
            }
        }
        return results;
    }
    isNodeValidForInternalMessage(nodeId: string, debugMsg: string, checkForNodeDown = true, checkForNodeLost = true, checkIsUpRecent = true, checkNodesRotationBounds = false): boolean {
        const node: ShardusTypes.Node = this.p2p.state.getNode(nodeId);
        return Comms.isNodeValidForInternalMessage(node, debugMsg, checkForNodeDown, checkForNodeLost, checkIsUpRecent, checkNodesRotationBounds);
    }
    filterValidNodesForInternalMessage(nodeList: ShardusTypes.Node[], debugMsg: string, checkForNodeDown = true, checkForNodeLost = true, checkIsUpRecent = true): ShardusTypes.Node[] {
        const filteredNodes = [];
        const logErrors = logFlags.debug;
        for (const node of nodeList) {
            const nodeId = node.id;
            if (node == null) {
                if (logErrors)
                    if (logFlags.error)
                        this.mainLogger.error(`isNodeValidForInternalMessage node == null ${utils.stringifyReduce(nodeId)} ${debugMsg}`);
                continue;
            }
            if (checkIsUpRecent) {
                const { upRecent, age } = isNodeUpRecent(nodeId, 5000);
                if (upRecent === true) {
                    filteredNodes.push(node);
                    if (this.config.p2p.downNodeFilteringEnabled && checkForNodeDown) {
                        const { down, state } = isNodeDown(nodeId);
                        if (down === true) {
                        }
                    }
                    if (checkForNodeLost) {
                        if (isNodeLost(nodeId) === true) {
                        }
                    }
                    continue;
                }
                else {
                }
            }
            if (this.config.p2p.downNodeFilteringEnabled && checkForNodeDown) {
                const { down, state } = isNodeDown(nodeId);
                if (down === true) {
                    if (logErrors)
                        if (logFlags.error)
                            this.mainLogger.error(`isNodeValidForInternalMessage isNodeDown == true state:${state} ${utils.stringifyReduce(nodeId)} ${debugMsg}`);
                    continue;
                }
            }
            if (checkForNodeLost) {
                if (isNodeLost(nodeId) === true) {
                    if (logErrors)
                        if (logFlags.error)
                            this.mainLogger.error(`isNodeValidForInternalMessage isNodeLost == true ${utils.stringifyReduce(nodeId)} ${debugMsg}`);
                    continue;
                }
            }
            filteredNodes.push(node);
        }
        return filteredNodes;
    }
    getNodesForCycleShard(mode: P2PTypes.ModesTypes.Record['mode']): ShardusTypes.Node[] {
        if (mode === 'forming' || mode === 'processing' || mode === 'safety')
            return activeByIdOrder;
        if (mode === 'restart' || mode === 'restore' || mode === 'recovery')
            return byIdOrder;
        if (mode === 'shutdown')
            return byIdOrder;
    }
    getTxRepair(): TransactionRepair {
        if (this.transactionRepair) {
            return this.transactionRepair;
        }
    }
    async askToRemoveTimestampCache(acceptedTx: QueueEntry['acceptedTx'], signedReceipt: SignedReceipt) {
        const homeNode = ShardFunctions.findHomeNode(Context.stateManager.currentCycleShardData.shardGlobals, acceptedTx.txId, Context.stateManager.currentCycleShardData.parititionShardDataMap);
        if (signedReceipt == null) {
            this.mainLogger.error(`askToRemoveTimestampCache signedReceipt == null ${utils.stringifyReduce(acceptedTx)}`);
            return;
        }
        if (acceptedTx.data.timestampReceipt == null) {
            this.mainLogger.error(`askToRemoveTimestampCache queueEntry.acceptedTx.data.timestampReceipt == null ${utils.stringifyReduce(acceptedTx)}`);
            return;
        }
        const cycleCounter = acceptedTx.data.timestampReceipt.cycleCounter;
        const payload: TimestampRemoveRequest = { txId: acceptedTx.txId, signedReceipt, cycleCounter };
        try {
            await this.p2p.tell([homeNode.node], 'remove_timestamp_cache', payload);
        }
        catch (e) {
            this.mainLogger.error(`askToRemoveTimestampCache error: ${e.message}`);
        }
    }
    startProcessingCycleSummaries() {
        this.processCycleSummaries = true;
    }
    statemanager_fatal(key: string, log: string) {
        this.fatalLogger.fatal(key + ' ' + log);
    }
}
export default StateManager;