import { StateManager as StateManagerTypes } from '@shardus/types';
import * as Shardus from '../shardus/shardus-types';
import * as utils from '../utils';
import { Logger as L4jsLogger } from 'log4js';
import StateManager from '.';
import Crypto from '../crypto';
import Logger, { logFlags } from '../logger';
import { isDebugModeMiddleware } from '../network/debugMiddleware';
import * as Context from '../p2p/Context';
import { P2PModuleContext as P2P } from '../p2p/Context';
import * as Self from '../p2p/Self';
import { robustQuery } from '../p2p/Utils';
import { safetyModeVals } from '../snapshot';
import Storage from '../storage';
import { verifyPayload } from '../types/ajv/Helpers';
import { errorToStringFull } from '../utils';
import { nestedCountersInstance } from '../utils/nestedCounters';
import Profiler, { cUninitializedSize } from '../utils/profiler';
import NodeSyncTracker, { SyncTrackerInterface } from './NodeSyncTracker';
import ShardFunctions from './shardFunctions';
import { AccountStateHashReq, AccountStateHashResp, CycleShardData, GetAccountData3Req, GetAccountDataByRangeSmart, GetAccountStateReq, GlobalAccountReportResp, } from './state-manager-types';
import { shardusGetTime } from '../network';
import { networkMode } from '../p2p/Modes';
import ArchiverSyncTracker from './ArchiverSyncTracker';
import { getArchiversList } from '../p2p/Archivers';
import * as http from '../http';
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum';
import { GetAccountDataByListResp, serializeGetAccountDataByListResp, } from '../types/GetAccountDataByListResp';
import { InternalBinaryHandler } from '../types/Handler';
import { Route } from '@shardus/types/build/src/p2p/P2PTypes';
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum';
import { deserializeGetAccountDataByListReq } from '../types/GetAccountDataByListReq';
import { getStreamWithTypeCheck } from '../types/Helpers';
import { GetAccountDataRespSerializable, serializeGetAccountDataResp } from '../types/GetAccountDataResp';
import { deserializeGetAccountDataReq, verifyGetAccountDataReq } from '../types/GetAccountDataReq';
import { GlobalAccountReportReqSerializable, serializeGlobalAccountReportReq, } from '../types/GlobalAccountReportReq';
import { GlobalAccountReportRespSerializable, deserializeGlobalAccountReportResp, } from '../types/GlobalAccountReportResp';
import { BadRequest, InternalError, serializeResponseError } from '../types/ResponseError';
import { Utils } from '@shardus/types';
import { AJVSchemaEnum } from '../types/enum/AJVSchemaEnum';
const REDUNDANCY = 3;
type SyncStatment = {
    p2pJoinTime: number;
    timeBeforeDataSync: number;
    timeBeforeDataSync2: number;
    totalSyncTime: number;
    cycleStarted: number;
    cycleEnded: number;
    numCycles: number;
    syncComplete: boolean;
    numNodesOnStart: number;
    syncStartTime: number;
    syncEndTime: number;
    syncSeconds: number;
    syncRanges: number;
    failedAccountLoops: number;
    failedAccounts: number;
    failAndRestart: number;
    discardedTXs: number;
    nonDiscardedTXs: number;
    numSyncedState: number;
    numAccounts: number;
    numGlobalAccounts: number;
    internalFlag: boolean;
};
class AccountSync {
    stateManager: StateManager;
    app: Shardus.App;
    crypto: Crypto;
    config: Shardus.StrictServerConfiguration;
    profiler: Profiler;
    logger: Logger;
    p2p: P2P;
    storage: Storage;
    mainLogger: L4jsLogger;
    fatalLogger: L4jsLogger;
    shardLogger: L4jsLogger;
    statsLogger: L4jsLogger;
    dataSyncMainPhaseComplete: boolean;
    globalAccountsSynced: boolean;
    isSyncingAcceptedTxs: boolean;
    requiredNodeCount: number;
    runtimeSyncTrackerSyncing: boolean;
    syncTrackerIndex: number;
    initalSyncRemaining: number;
    readyforTXs: boolean;
    syncTrackers: SyncTrackerInterface[];
    lastWinningGlobalReportNodes: Shardus.Node[];
    statemanager_fatal: (key: string, log: string) => void;
    syncStatement: SyncStatment;
    isSyncStatementCompleted: boolean;
    softSync_earlyOut: boolean;
    softSync_noSyncDelay: boolean;
    softSync_checkInitialFlag: boolean;
    initalSyncFinished: boolean;
    forceSyncComplete: boolean;
    dataSourceTest: boolean;
    debugFail1: boolean;
    debugFail2: boolean;
    debugFail3: boolean;
    debugFail4: boolean;
    constructor(stateManager: StateManager, profiler: Profiler, app: Shardus.App, logger: Logger, storage: Storage, p2p: P2P, crypto: Crypto, config: Shardus.StrictServerConfiguration) {
        this.stateManager = stateManager;
        this.crypto = crypto;
        this.app = app;
        this.logger = logger;
        this.config = config;
        this.profiler = profiler;
        this.p2p = p2p;
        this.storage = storage;
        this.mainLogger = logger.getLogger('main');
        this.fatalLogger = logger.getLogger('fatal');
        this.shardLogger = logger.getLogger('shardDump');
        this.statsLogger = logger.getLogger('statsDump');
        this.statemanager_fatal = stateManager.statemanager_fatal;
        this.dataSyncMainPhaseComplete = false;
        this.globalAccountsSynced = false;
        this.isSyncingAcceptedTxs = false;
        this.syncTrackers = [];
        this.runtimeSyncTrackerSyncing = false;
        this.readyforTXs = false;
        this.syncTrackerIndex = 1;
        this.clearSyncData();
        this.syncStatement = {
            cycleStarted: -1,
            cycleEnded: -1,
            numCycles: -1,
            syncComplete: false,
            numNodesOnStart: 0,
            p2pJoinTime: Self.p2pJoinTime,
            timeBeforeDataSync: 0,
            timeBeforeDataSync2: 0,
            totalSyncTime: 0,
            syncStartTime: 0,
            syncEndTime: 0,
            syncSeconds: 0,
            syncRanges: 0,
            failedAccountLoops: 0,
            failedAccounts: 0,
            failAndRestart: 0,
            discardedTXs: 0,
            nonDiscardedTXs: 0,
            numSyncedState: 0,
            numAccounts: 0,
            numGlobalAccounts: 0,
            internalFlag: false,
        };
        this.isSyncStatementCompleted = false;
        this.softSync_earlyOut = false;
        this.softSync_noSyncDelay = true;
        this.softSync_checkInitialFlag = false;
        this.initalSyncFinished = false;
        this.initalSyncRemaining = 0;
        this.forceSyncComplete = false;
        this.dataSourceTest = false;
        this.debugFail1 = false;
        this.debugFail2 = false;
        this.debugFail3 = false;
        this.debugFail4 = false;
        this.lastWinningGlobalReportNodes = [];
    }
    clearSyncData(): void {
        if (this.config.stateManager.fifoUnlockFix) {
            this.stateManager.forceUnlockAllFifoLocks('clearSyncData');
        }
        else {
            this.stateManager.fifoLocks = {};
        }
    }
    clearSyncTrackers(): void {
        this.syncTrackers = [];
    }
    setupHandlers(): void {
        Context.network.registerExternalGet('sync-globals', isDebugModeMiddleware, async (req, res) => {
            try {
                const cycle = this.stateManager.currentCycleShardData.cycleNumber;
                const syncFromArchiver = false;
                const syncTracker = this.createSyncTrackerByForGlobals(cycle, false, syncFromArchiver);
                await syncTracker.syncStateDataGlobals();
                this.syncTrackers.pop();
            }
            catch (e) {
                this.mainLogger.error(`sync-globals: Exception executing request: ${errorToStringFull(e)}`);
                res.write('error');
            }
            res.write('ok');
            res.end();
        });
        const getAccDataBinaryHandler: Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_get_account_data,
            handler: async (payload, respond, header, sign) => {
                const route = InternalRouteEnum.binary_get_account_data;
                const result = {
                    data: null,
                    errors: [],
                } as GetAccountDataRespSerializable;
                try {
                    const reqStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cGetAccountDataReq);
                    if (!reqStream) {
                        result.errors.push(`invalid request payload`);
                        respond(result, serializeGetAccountDataResp);
                        return;
                    }
                    const readableReq = deserializeGetAccountDataReq(reqStream);
                    const valid = verifyGetAccountDataReq(readableReq);
                    if (valid === false) {
                        result.errors.push(`request validation failed`);
                        respond(result, serializeGetAccountDataResp);
                        return;
                    }
                    let accountData = null;
                    let ourLockID = -1;
                    try {
                        ourLockID = await this.stateManager.fifoLock('accountModification');
                        accountData = await this.stateManager.getAccountDataByRangeSmart(readableReq.accountStart, readableReq.accountEnd, readableReq.tsStart, readableReq.maxRecords, readableReq.offset, readableReq.accountOffset);
                    }
                    finally {
                        this.stateManager.fifoUnlock('accountModification', ourLockID);
                    }
                    result.data = accountData;
                    respond(result, serializeGetAccountDataResp);
                }
                catch (e) {
                    result.errors.push(`${route} internal error`);
                    this.mainLogger.error(`${route}: request validation errors: ${errorToStringFull(e)}`);
                    respond(result, serializeGetAccountDataResp);
                }
                finally {
                }
            },
        };
        this.p2p.registerInternalBinary(getAccDataBinaryHandler.name, getAccDataBinaryHandler.handler);
        const getAccDataByListBinaryHandler: Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_get_account_data_by_list,
            handler: async (payload, respond, header, sign) => {
                const route = InternalRouteEnum.binary_get_account_data_by_list;
                let ourLockID = -1;
                let accountData = null;
                try {
                    const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cGetAccountDataByListReq);
                    if (!requestStream) {
                        return respond(BadRequest(`${route} invalid request`), serializeResponseError);
                    }
                    const readableReq = deserializeGetAccountDataByListReq(requestStream);
                    const MAX_ACCOUNTS = this.config.stateManager.accountBucketSize;
                    if (readableReq.accountIds.length > MAX_ACCOUNTS) {
                        return respond(BadRequest(`${route} too many accounts requested`), serializeResponseError);
                    }
                    if (utils.isValidShardusAddress(readableReq.accountIds) === false) {
                        return respond(BadRequest(`${route} invalid account_ids`), serializeResponseError);
                    }
                    const result = {} as GetAccountDataByListResp;
                    try {
                        ourLockID = await this.stateManager.fifoLock('accountModification');
                        accountData = await this.app.getAccountDataByList(readableReq.accountIds);
                    }
                    finally {
                        this.stateManager.fifoUnlock('accountModification', ourLockID);
                    }
                    this.stateManager.testAccountDataWrapped(accountData);
                    result.accountData = accountData;
                    respond(result, serializeGetAccountDataByListResp);
                }
                catch (e) {
                    if (logFlags.error)
                        this.mainLogger.error(`${route}: Exception executing request: ${errorToStringFull(e)}`);
                    return respond(InternalError(`${route} exception executing request`), serializeResponseError);
                }
                finally {
                }
            },
        };
        this.p2p.registerInternalBinary(getAccDataByListBinaryHandler.name, getAccDataByListBinaryHandler.handler);
        Context.network.registerExternalGet('sync-statement', isDebugModeMiddleware, (_req, res) => {
            res.write(`${utils.stringifyReduce(this.syncStatement)}\n`);
            res.end();
        });
        Context.network.registerExternalGet('forceFinishSync', isDebugModeMiddleware, (_req, res) => {
            res.write(`sync forcing complete. \n`);
            this.forceSyncComplete = true;
            res.end();
        });
        Context.network.registerExternalGet('dataSourceTest', isDebugModeMiddleware, (_req, res) => {
            this.dataSourceTest = !this.dataSourceTest;
            res.write(`dataSourceTest = ${this.dataSourceTest} \n`);
            res.end();
        });
        Context.network.registerExternalGet('syncFail1', isDebugModeMiddleware, (_req, res) => {
            this.debugFail1 = !this.debugFail1;
            res.write(`debugFail1 = ${this.debugFail1} \n`);
            res.end();
        });
        Context.network.registerExternalGet('syncFail2', isDebugModeMiddleware, (_req, res) => {
            this.debugFail2 = !this.debugFail2;
            res.write(`debugFail2 = ${this.debugFail2} \n`);
            res.end();
        });
        Context.network.registerExternalGet('syncFail3', isDebugModeMiddleware, (_req, res) => {
            this.debugFail3 = !this.debugFail3;
            res.write(`debugFail3 = ${this.debugFail3} \n`);
            res.end();
        });
        Context.network.registerExternalGet('syncFail4', isDebugModeMiddleware, (_req, res) => {
            this.debugFail4 = !this.debugFail4;
            res.write(`debugFail4 = ${this.debugFail4} \n`);
            res.end();
        });
    }
    async initialSyncMain(requiredNodeCount: number): Promise<void> {
        const safetyMode = safetyModeVals.safetyMode;
        await this.app.deleteLocalAccountData();
        if ((this.p2p.isFirstSeed && networkMode !== 'restore') || safetyMode) {
            this.dataSyncMainPhaseComplete = true;
            this.syncStatement.syncComplete = true;
            this.initalSyncFinished = true;
            this.globalAccountsSynced = true;
            this.stateManager.accountGlobals.hasknownGlobals = true;
            this.readyforTXs = true;
            if (logFlags.debug) {
            }
            this.syncStatement.cycleStarted = 0;
            this.syncStatement.cycleEnded = 0;
            this.syncStatement.numCycles = 1;
            this.syncStatement.syncSeconds = 0;
            this.syncStatement.syncStartTime = shardusGetTime();
            this.syncStatement.syncEndTime = this.syncStatement.syncStartTime;
            this.syncStatement.numNodesOnStart = 0;
            this.syncStatement.p2pJoinTime = Self.p2pJoinTime;
            this.syncStatement.timeBeforeDataSync = (shardusGetTime() - Self.p2pSyncEnd) / 1000;
            this.syncStatement.timeBeforeDataSync2 = this.syncStatement.timeBeforeDataSync;
            this.syncStatmentIsComplete();
            this.statemanager_fatal('shrd_sync_syncStatement-initialSyncMain-firstnode', `${utils.stringifyReduce(this.syncStatement)}`);
            return;
        }
        this.isSyncingAcceptedTxs = true;
        this.syncStatement.timeBeforeDataSync = (shardusGetTime() - Self.p2pSyncEnd) / 1000;
        await utils.sleep(5000);
        await this.storage.clearAppRelatedState();
        await this.app.deleteLocalAccountData();
        this.requiredNodeCount = requiredNodeCount;
        let hasValidShardData = this.stateManager.currentCycleShardData != null;
        if (this.stateManager.currentCycleShardData != null) {
            hasValidShardData = this.stateManager.currentCycleShardData.hasCompleteData;
        }
        hasValidShardData = await this.waitForValidShardData(hasValidShardData);
        this.syncStatement.cycleStarted = this.stateManager.currentCycleShardData.cycleNumber;
        this.syncStatement.syncStartTime = shardusGetTime();
        this.syncStatement.numNodesOnStart = this.stateManager.currentCycleShardData.nodes.length;
        this.syncStatement.p2pJoinTime = Self.p2pJoinTime;
        let nodeShardData = this.stateManager.currentCycleShardData.nodeShardData;
        let rangesToSync: StateManagerTypes.shardFunctionTypes.AddressRange[];
        let cycle = this.stateManager.currentCycleShardData.cycleNumber;
        let homePartition = nodeShardData.homePartition;
        rangesToSync = this.initRangesToSync(nodeShardData, homePartition);
        this.syncStatement.syncRanges = rangesToSync.length;
        let syncFromArchiver = false;
        if (networkMode === 'restore')
            syncFromArchiver = true;
        for (const range of rangesToSync) {
            this.createSyncTrackerByRange(range, cycle, true, syncFromArchiver);
        }
        const useGlobalAccounts = true;
        if (useGlobalAccounts === true) {
            this.createSyncTrackerByForGlobals(cycle, true, syncFromArchiver);
        }
        this.syncStatement.timeBeforeDataSync2 = (shardusGetTime() - Self.p2pSyncEnd) / 1000;
        if (useGlobalAccounts === true) {
            await this.stateManager.accountGlobals.getGlobalListEarly(syncFromArchiver);
            this.readyforTXs = true;
        }
        else {
            this.stateManager.accountGlobals.hasknownGlobals = true;
        }
        let breakCount = 0;
        let running = true;
        while (running) {
            try {
                for (const syncTracker of this.syncTrackers) {
                    if (this.dataSyncMainPhaseComplete === true) {
                        running = false;
                        break;
                    }
                    if (this.debugFail1) {
                        await utils.sleep(3000);
                        throw new Error('reset-sync-ranges debugFail1');
                    }
                    if (this.debugFail2) {
                        await utils.sleep(3000);
                        this.debugFail2 = false;
                        throw new Error('debugFail2 causes apop');
                    }
                    syncTracker.syncStarted = true;
                    if (syncTracker.isGlobalSyncTracker === false) {
                        if (this.softSync_earlyOut === true) {
                        }
                        else {
                            await syncTracker.syncStateDataForRange2();
                        }
                    }
                    else {
                        await syncTracker.syncStateDataGlobals();
                    }
                    syncTracker.syncFinished = true;
                    this.clearSyncData();
                }
                running = false;
            }
            catch (error) {
                if (error.message.includes('reset-sync-ranges')) {
                    this.statemanager_fatal(`mainSyncLoop_reset-sync-ranges`, 'DATASYNC: reset-sync-ranges: ' + errorToStringFull(error));
                    if (breakCount > this.config.stateManager.maxDataSyncRestarts) {
                        this.statemanager_fatal(`mainSyncLoop_reset-sync-ranges-givingUP`, 'too many tries');
                        running = false;
                        this.clearSyncTrackers();
                        this.stateManager.initApoptosisAndQuitSyncing('too many exceptions in accound data sync');
                        return;
                    }
                    breakCount++;
                    this.clearSyncData();
                    let cleared = 0;
                    let kept = 0;
                    let newTrackers = 0;
                    const trackersToKeep = [];
                    let keptGlobal = false;
                    let addedGlobal = false;
                    for (const syncTracker of this.syncTrackers) {
                        if (syncTracker.isGlobalSyncTracker === true && syncTracker.syncFinished === false) {
                            trackersToKeep.push(syncTracker);
                            kept++;
                            keptGlobal = true;
                        }
                        else {
                            cleared++;
                        }
                    }
                    this.syncTrackers = trackersToKeep;
                    nodeShardData = this.stateManager.currentCycleShardData.nodeShardData;
                    const lastCycle = cycle;
                    cycle = this.stateManager.currentCycleShardData.cycleNumber;
                    homePartition = nodeShardData.homePartition;
                    if (keptGlobal === false && this.globalAccountsSynced === false && useGlobalAccounts === true) {
                        this.createSyncTrackerByForGlobals(cycle, true);
                        addedGlobal = true;
                    }
                    rangesToSync = this.initRangesToSync(nodeShardData, homePartition, 4, 4);
                    this.syncStatement.syncRanges = rangesToSync.length;
                    for (const range of rangesToSync) {
                        this.createSyncTrackerByRange(range, cycle, true);
                        newTrackers++;
                    }
                    this.createSyncTrackerByForGlobals(cycle, true);
                    continue;
                }
                else {
                    this.statemanager_fatal(`initialSyncMain unhandledEX`, 'initialSyncMain unhandledEX:' + errorToStringFull(error));
                    running = false;
                    this.stateManager.initApoptosisAndQuitSyncing('initialSyncMain unhandledEX');
                }
            }
        }
        cycle = this.stateManager.currentCycleShardData?.cycleNumber;
    }
    private async waitForValidShardData(hasValidShardData: boolean): Promise<true> {
        while (hasValidShardData === false) {
            this.stateManager.getCurrentCycleShardData();
            await utils.sleep(1000);
            if (this.stateManager.currentCycleShardData == null) {
                hasValidShardData = false;
            }
            if (this.stateManager.currentCycleShardData != null) {
                if (this.stateManager.currentCycleShardData.hasCompleteData == false) {
                    const temp = this.p2p.state.getActiveNodes(null);
                }
                else {
                    hasValidShardData = true;
                }
            }
        }
        return hasValidShardData;
    }
    private initRangesToSync(nodeShardData: StateManagerTypes.shardFunctionTypes.NodeShardData, homePartition: number, chunksGuide = 4, minSyncRangeGuide = 1): StateManagerTypes.shardFunctionTypes.AddressRange[] {
        const syncRangeGoal = Math.max(minSyncRangeGuide, Math.min(chunksGuide, Math.floor(this.stateManager.currentCycleShardData.shardGlobals.numPartitions / chunksGuide)));
        let partitionsCovered = 0;
        let partitionsPerRange = 1;
        const rangesToSync = [];
        if (nodeShardData.storedPartitions.rangeIsSplit === true) {
            partitionsCovered =
                nodeShardData.storedPartitions.partitionEnd1 - nodeShardData.storedPartitions.partitionStart1;
            partitionsCovered +=
                nodeShardData.storedPartitions.partitionEnd2 - nodeShardData.storedPartitions.partitionStart2;
            partitionsPerRange = Math.max(Math.floor(partitionsCovered / syncRangeGoal), 1);
            let start = nodeShardData.storedPartitions.partitionStart1;
            let end = nodeShardData.storedPartitions.partitionEnd1;
            let currentStart = start;
            let currentEnd = 0;
            let nextLowAddress: string | null = null;
            let i = 0;
            while (currentEnd < end) {
                currentEnd = Math.min(currentStart + partitionsPerRange, end);
                const range = ShardFunctions.partitionToAddressRange2(this.stateManager.currentCycleShardData.shardGlobals, currentStart, currentEnd);
                const { address1, address2 } = ShardFunctions.getNextAdjacentAddresses(range.high);
                range.high = address1;
                if (nextLowAddress != null) {
                    range.low = nextLowAddress;
                }
                nextLowAddress = address2;
                currentStart = currentEnd;
                i++;
                rangesToSync.push(range);
            }
            start = nodeShardData.storedPartitions.partitionStart2;
            end = nodeShardData.storedPartitions.partitionEnd2;
            currentStart = start;
            currentEnd = 0;
            nextLowAddress = null;
            while (currentEnd < end) {
                currentEnd = Math.min(currentStart + partitionsPerRange, end);
                const range = ShardFunctions.partitionToAddressRange2(this.stateManager.currentCycleShardData.shardGlobals, currentStart, currentEnd);
                const { address1, address2 } = ShardFunctions.getNextAdjacentAddresses(range.high);
                range.high = address1;
                if (nextLowAddress != null) {
                    range.low = nextLowAddress;
                }
                nextLowAddress = address2;
                currentStart = currentEnd;
                i++;
                rangesToSync.push(range);
            }
        }
        else {
            partitionsCovered =
                nodeShardData.storedPartitions.partitionEnd - nodeShardData.storedPartitions.partitionStart;
            partitionsPerRange = Math.max(Math.floor(partitionsCovered / syncRangeGoal), 1);
            const start = nodeShardData.storedPartitions.partitionStart;
            const end = nodeShardData.storedPartitions.partitionEnd;
            let currentStart = start;
            let currentEnd = 0;
            let nextLowAddress: string | null = null;
            let i = 0;
            while (currentEnd < end) {
                currentEnd = Math.min(currentStart + partitionsPerRange, end);
                const range = ShardFunctions.partitionToAddressRange2(this.stateManager.currentCycleShardData.shardGlobals, currentStart, currentEnd);
                const { address1, address2 } = ShardFunctions.getNextAdjacentAddresses(range.high);
                range.high = address1;
                if (nextLowAddress != null) {
                    range.low = nextLowAddress;
                }
                nextLowAddress = address2;
                currentStart = currentEnd;
                i++;
                rangesToSync.push(range);
            }
        }
        if (rangesToSync.length === 0) {
            const range = ShardFunctions.partitionToAddressRange2(this.stateManager.currentCycleShardData.shardGlobals, 0, this.stateManager.currentCycleShardData.shardGlobals.numPartitions - 1);
            rangesToSync.push(range);
        }
        return rangesToSync;
    }
    async getRobustGlobalReport(tag = '', syncFromArchiver: boolean = false): Promise<GlobalAccountReportResp> {
        if (!syncFromArchiver) {
            this.lastWinningGlobalReportNodes = [];
        }
        const equalFn = (a: Partial<GlobalAccountReportResp>, b: Partial<GlobalAccountReportResp>): boolean => {
            if (a == null || b == null) {
                return false;
            }
            if (a.combinedHash == null || a.combinedHash === '') {
                return false;
            }
            if (b.combinedHash == null || b.combinedHash === '') {
                return false;
            }
            return a.combinedHash === b.combinedHash;
        };
        const queryFn = async (node: Shardus.Node): Promise<Partial<GlobalAccountReportResp> & {
            msg: string;
        }> => {
            try {
                if (this.stateManager.isNodeValidForInternalMessage(node.id, 'getRobustGlobalReport', true, true) ===
                    false) {
                    return {
                        ready: false,
                        msg: `getRobustGlobalReport invalid node to ask: ${utils.stringifyReduce(node.id)}`,
                    };
                }
                let result;
                const request = {} as GlobalAccountReportReqSerializable;
                result = await this.p2p.askBinary<GlobalAccountReportReqSerializable, GlobalAccountReportRespSerializable>(node, InternalRouteEnum.binary_get_globalaccountreport, request, serializeGlobalAccountReportReq, deserializeGlobalAccountReportResp, {});
                return checkResultFn(result, node.id);
            }
            catch (error) {
                if (logFlags.error)
                    this.mainLogger.error(`ASK FAIL getRobustGlobalReport exception ${utils.stringifyReduce(node.id)}, error: ${errorToStringFull(error)}`);
                return {
                    ready: false,
                    msg: `getRobustGlobalReport exception for node: ${utils.stringifyReduce(node.id)}`,
                };
            }
        };
        const queryFnFromArchiver = async (archiver: Shardus.Archiver): Promise<Partial<GlobalAccountReportResp> & {
            msg: string;
        }> => {
            const payload = {};
            const signedPayload = this.crypto.sign(payload);
            const getGlobalAccountReportFromArchiver = async () => {
                const globalAccountReportArchiverUrl = `http://${archiver.ip}:${archiver.port}/get_globalaccountreport_archiver`;
                try {
                    const r = await http.post(globalAccountReportArchiverUrl, signedPayload, false, 2000);
                    return r;
                }
                catch (error) {
                    console.error('getGlobalAccountReportFromArchiver error', error);
                    return null;
                }
            };
            let result: Partial<GlobalAccountReportResp> & {
                msg: string;
            };
            result = await getGlobalAccountReportFromArchiver();
            return checkResultFn(result, archiver.publicKey, true);
        };
        const checkResultFn = (result: (Partial<GlobalAccountReportResp> & {
            msg: string;
        }) | boolean, nodeId: string, resultFromArchiver: boolean = false) => {
            if (result === false) {
                if (logFlags.error)
                    this.mainLogger.error(`ASK FAIL getRobustGlobalReport result === false ${resultFromArchiver ? 'archiver:' : 'node:'}${utils.stringifyReduce(nodeId)} `);
                result = { ready: false, msg: `result === false: ${Math.random()}` };
                return result;
            }
            result = result as Partial<GlobalAccountReportResp> & {
                msg: string;
            };
            if (result == null) {
                if (logFlags.error)
                    this.mainLogger.error(`ASK FAIL getRobustGlobalReport result === null ${resultFromArchiver ? 'archiver:' : 'node:'}${utils.stringifyReduce(nodeId)} `);
                result = { ready: false, msg: `result === null: ${Math.random()}` };
                return result;
            }
            if (result.ready === false) {
                if (logFlags.error)
                    this.mainLogger.error(`ASK FAIL getRobustGlobalReport result.ready === false, result: ${utils.stringifyReduce(result)}`);
                result = { ready: false, msg: `not ready: ${Math.random()}` };
                return result;
            }
            if (result.accounts == null) {
                if (logFlags.error)
                    this.mainLogger.error(`ASK FAIL getRobustGlobalReport result.stateHash == null, result: ${utils.stringifyReduce(result)}`);
                result = { ready: false, msg: `invalid data format: ${Math.random()}` };
                return result;
            }
            return result;
        };
        let nodes: Shardus.Node[] | Shardus.Archiver[];
        if (syncFromArchiver) {
            nodes = getArchiversList();
            if (nodes.length === 0) {
                return;
            }
        }
        else {
            nodes = this.stateManager.currentCycleShardData.nodes;
            if (nodes.length === 0) {
                return;
            }
        }
        let result: Partial<GlobalAccountReportResp> & {
            msg: string;
        };
        let winners: string | unknown[];
        try {
            const robustQueryResult = await robustQuery<Shardus.Node | Shardus.Archiver, Partial<GlobalAccountReportResp> & {
                msg: string;
            }>(nodes, syncFromArchiver ? queryFnFromArchiver : queryFn, equalFn, REDUNDANCY, true, false, true);
            if (robustQueryResult === null) {
                await utils.sleep(10 * 1000);
                return await this.getRobustGlobalReport(tag + '_rt', syncFromArchiver);
            }
            result = robustQueryResult.topResult;
            winners = robustQueryResult.winningNodes;
            if (robustQueryResult.isRobustResult == false) {
                this.statemanager_fatal(`getRobustGlobalReport_nonRobust`, `getRobustGlobalReport: robustQuery isRobustResult == false, result: ${utils.stringifyReduce(result)}`);
                throw new Error('FailAndRestartPartition_globalReport_A');
            }
            if (result.ready === false) {
                await utils.sleep(10 * 1000);
                return await this.getRobustGlobalReport(tag + '_rt2', syncFromArchiver);
            }
        }
        catch (ex) {
            this.statemanager_fatal(`getRobustGlobalReport_ex`, 'getRobustGlobalReport: robustQuery ' + ex.name + ': ' + ex.message + ' at ' + ex.stack);
            throw new Error('FailAndRestartPartition_globalReport_B');
        }
        if (!winners || winners.length === 0) {
            this.statemanager_fatal(`getRobustGlobalReport_noWin`, `DATASYNC: getRobustGlobalReport no winners, going to throw fail and restart`);
            throw new Error('FailAndRestartPartition_globalReport_noWin');
        }
        if (!syncFromArchiver)
            this.lastWinningGlobalReportNodes = winners as Shardus.Node[];
        return result as GlobalAccountReportResp;
    }
    async failandRestart_depricated(): Promise<void> {
        this.logger.playbackLogState('datasyncFail', '', '');
        this.clearSyncData();
        await utils.sleep(1000);
        let anyNonGlobalSyncTrackersLeft = false;
        for (const syncTracker of this.syncTrackers) {
            if (syncTracker.isGlobalSyncTracker === false && syncTracker.syncFinished === false) {
                anyNonGlobalSyncTrackersLeft = true;
            }
        }
        if (this.forceSyncComplete) {
            this.syncStatmentIsComplete();
            this.clearSyncData();
            this.skipSync();
            for (const syncTracker of this.syncTrackers) {
                syncTracker.syncFinished = true;
            }
            return;
        }
        this.syncStatement.failAndRestart++;
    }
    failAndDontRestartSync(): void {
        this.clearSyncData();
        this.clearSyncTrackers();
    }
    updateRuntimeSyncTrackers(): void {
        let initalSyncRemaining = 0;
        if (this.syncTrackers != null) {
            for (let i = this.syncTrackers.length - 1; i >= 0; i--) {
                const syncTracker = this.syncTrackers[i];
                if (syncTracker.isPartOfInitialSync) {
                    initalSyncRemaining++;
                }
                if (syncTracker.syncFinished === true) {
                    for (const queueEntry of syncTracker.queueEntries) {
                        for (const key of queueEntry.uniqueKeys) {
                            if (syncTracker.keys[key] === true) {
                                queueEntry.syncCounter--;
                            }
                        }
                        if (queueEntry.syncCounter <= 0) {
                            const found = this.stateManager.transactionQueue.getQueueEntry(queueEntry.acceptedTx.txId);
                            if (!found) {
                                continue;
                            }
                            if (queueEntry.state != 'syncing') {
                                continue;
                            }
                            const before = queueEntry.ourNodeInTransactionGroup;
                            if (queueEntry.ourNodeInTransactionGroup === false) {
                                const old = queueEntry.transactionGroup;
                                queueEntry.transactionGroup = null;
                                this.stateManager.transactionQueue.queueEntryGetTransactionGroup(queueEntry);
                                queueEntry.transactionGroup = old;
                            }
                            queueEntry.txGroupDebug = `${before} -> ${queueEntry.ourNodeInTransactionGroup}`;
                            this.stateManager.transactionQueue.updateTxState(queueEntry, 'aging');
                            queueEntry.didWakeup = true;
                            this.stateManager.transactionQueue.updateHomeInformation(queueEntry);
                        }
                    }
                    syncTracker.queueEntries = [];
                    this.syncTrackers.splice(i, 1);
                }
            }
            if (this.initalSyncRemaining > 0 && initalSyncRemaining === 0) {
                this.initalSyncFinished = true;
                this.initalSyncRemaining = 0;
            }
        }
    }
    async syncRuntimeTrackers(): Promise<void> {
        if (this.runtimeSyncTrackerSyncing === true) {
            return;
        }
        try {
            this.runtimeSyncTrackerSyncing = true;
            let startedCount = 0;
            do {
                startedCount = 0;
                const arrayCopy = this.syncTrackers.slice(0);
                for (const syncTracker of arrayCopy) {
                    if (syncTracker.syncStarted === false) {
                        syncTracker.syncStarted = true;
                        startedCount++;
                        await syncTracker.syncStateDataForRange2();
                        syncTracker.syncFinished = true;
                        if (this.config.stateManager.fifoUnlockFix2 === false) {
                            this.clearSyncData();
                        }
                    }
                }
            } while (startedCount > 0);
        }
        catch (ex) {
            this.statemanager_fatal(`syncRuntimeTrackers_ex`, 'syncRuntimeTrackers: ' + ex.name + ': ' + ex.message + ' at ' + ex.stack);
            const cleared = this.syncTrackers.length;
            const kept = 0;
            const newTrackers = 0;
            const cycle = this.stateManager.currentCycleShardData.cycleNumber;
            const lastCycle = cycle - 1;
            this.clearSyncTrackers();
        }
        finally {
            this.runtimeSyncTrackerSyncing = false;
        }
    }
    createSyncTrackerByRange(range: StateManagerTypes.shardFunctionTypes.BasicAddressRange, cycle: number, initalSync = false, syncFromArchiver: boolean = false): SyncTrackerInterface {
        const index = this.syncTrackerIndex++;
        let syncTracker: SyncTrackerInterface;
        if (syncFromArchiver) {
            syncTracker = new ArchiverSyncTracker();
        }
        else {
            syncTracker = new NodeSyncTracker();
        }
        syncTracker.initByRange(this, this.p2p, index, range, cycle, initalSync);
        this.syncTrackers.push(syncTracker);
        if (initalSync) {
            this.initalSyncRemaining++;
        }
        return syncTracker;
    }
    createSyncTrackerByForGlobals(cycle: number, initalSync = false, syncFromArchiver: boolean = false): SyncTrackerInterface {
        const index = this.syncTrackerIndex++;
        let syncTracker: SyncTrackerInterface;
        if (syncFromArchiver) {
            syncTracker = new ArchiverSyncTracker();
        }
        else {
            syncTracker = new NodeSyncTracker();
        }
        syncTracker.initGlobal(this, this.p2p, index, cycle, initalSync);
        this.syncTrackers.push(syncTracker);
        if (initalSync) {
            this.initalSyncRemaining++;
        }
        return syncTracker;
    }
    getSyncTracker(address: string): SyncTrackerInterface | null {
        for (let i = 0; i < this.syncTrackers.length; i++) {
            const syncTracker = this.syncTrackers[i];
            if (syncTracker.isGlobalSyncTracker === true && syncTracker.globalAddressMap[address] === true) {
                return syncTracker;
            }
            if (syncTracker.range.low <= address && address <= syncTracker.range.high) {
                return syncTracker;
            }
        }
        return null;
    }
    getSyncTrackerForParition(partitionID: number, cycleShardData: CycleShardData): SyncTrackerInterface | null {
        if (cycleShardData == null) {
            return null;
        }
        const partitionShardData: StateManagerTypes.shardFunctionTypes.ShardInfo = cycleShardData.parititionShardDataMap.get(partitionID);
        const addressLow = partitionShardData.homeRange.low;
        const addressHigh = partitionShardData.homeRange.high;
        for (let i = 0; i < this.syncTrackers.length; i++) {
            const syncTracker = this.syncTrackers[i];
            if (syncTracker.range.low <= addressLow && addressHigh <= syncTracker.range.high) {
                return syncTracker;
            }
        }
        return null;
    }
    syncStatmentIsComplete(): void {
        this.syncStatement.totalSyncTime = (shardusGetTime() - Self.p2pSyncStart) / 1000;
        this.readyforTXs = true;
        this.clearSyncTrackers();
        this.isSyncStatementCompleted = true;
        Context.reporter.reportSyncStatement(Self.id, this.syncStatement);
    }
    skipSync(): void {
        this.dataSyncMainPhaseComplete = true;
        this.syncStatement.syncComplete = true;
        this.readyforTXs = true;
        return;
    }
    setGlobalSyncFinished(): void {
        this.globalAccountsSynced = true;
    }
    reSyncGlobals(): void {
        const cycle = this.stateManager.currentCycleShardData.cycleNumber;
        const syncFromArchiver = false;
        this.createSyncTrackerByForGlobals(cycle, false, syncFromArchiver);
    }
}
export default AccountSync;