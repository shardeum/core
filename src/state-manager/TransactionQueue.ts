import * as Context from '../p2p/Context';
import { P2P as P2PTypes, StateManager as StateManagerTypes } from '@shardus/types';
import StateManager from '.';
import Crypto from '../crypto';
import Logger, { logFlags } from '../logger';
import * as Apoptosis from '../p2p/Apoptosis';
import * as Archivers from '../p2p/Archivers';
import { P2PModuleContext as P2P, network as networkContext, config as configContext } from '../p2p/Context';
import * as CycleChain from '../p2p/CycleChain';
import { nodes, byPubKey, potentiallyRemoved, activeByIdOrder } from '../p2p/NodeList';
import * as Shardus from '../shardus/shardus-types';
import Storage from '../storage';
import * as utils from '../utils';
import { getCorrespondingNodes, verifyCorrespondingSender } from '../utils/fastAggregatedCorrespondingTell';
import { Signature, SignedObject } from '@shardus/crypto-utils';
import { errorToStringFull, inRangeOfCurrentTime, withTimeout, XOR, } from '../utils';
import { Utils } from '@shardus/types';
import * as Self from '../p2p/Self';
import * as Comms from '../p2p/Comms';
import { nestedCountersInstance } from '../utils/nestedCounters';
import Profiler, { cUninitializedSize, profilerInstance } from '../utils/profiler';
import ShardFunctions from './shardFunctions';
import * as NodeList from '../p2p/NodeList';
import { AcceptedTx, AccountFilter, CommitConsensedTransactionResult, PreApplyAcceptedTransactionResult, ProcessQueueStats, QueueCountsResult, QueueEntry, RequestReceiptForTxResp_old, RequestStateForTxReq, RequestStateForTxResp, SeenAccounts, SimpleNumberStats, StringBoolObjectMap, StringNodeObjectMap, TxDebug, WrappedResponses, ArchiverReceipt, NonceQueueItem, SignedReceipt, Proposal, RequestFinalDataResp } from './state-manager-types';
import { isInternalTxAllowed, networkMode } from '../p2p/Modes';
import { Node } from '@shardus/types/build/src/p2p/NodeListTypes';
import { Logger as L4jsLogger } from 'log4js';
import { getNetworkTimeOffset, ipInfo, shardusGetTime } from '../network';
import { InternalBinaryHandler } from '../types/Handler';
import { BroadcastStateReq, deserializeBroadcastStateReq, serializeBroadcastStateReq, } from '../types/BroadcastStateReq';
import { getStreamWithTypeCheck, requestErrorHandler, verificationDataCombiner, verificationDataSplitter, } from '../types/Helpers';
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum';
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum';
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum';
import { BroadcastFinalStateReq, deserializeBroadcastFinalStateReq, serializeBroadcastFinalStateReq, } from '../types/BroadcastFinalStateReq';
import { verifyPayload } from '../types/ajv/Helpers';
import { SpreadTxToGroupSyncingReq, deserializeSpreadTxToGroupSyncingReq, serializeSpreadTxToGroupSyncingReq, } from '../types/SpreadTxToGroupSyncingReq';
import { RequestTxAndStateReq, serializeRequestTxAndStateReq } from '../types/RequestTxAndStateReq';
import { RequestTxAndStateResp, deserializeRequestTxAndStateResp } from '../types/RequestTxAndStateResp';
import { deserializeRequestStateForTxReq, serializeRequestStateForTxReq } from '../types/RequestStateForTxReq';
import { deserializeRequestStateForTxResp, RequestStateForTxRespSerialized, serializeRequestStateForTxResp, } from '../types/RequestStateForTxResp';
import { deserializeRequestReceiptForTxResp, RequestReceiptForTxRespSerialized, } from '../types/RequestReceiptForTxResp';
import { RequestReceiptForTxReqSerialized, serializeRequestReceiptForTxReq, } from '../types/RequestReceiptForTxReq';
import { isNodeInRotationBounds } from '../p2p/Utils';
import { BadRequest, ResponseError, serializeResponseError } from '../types/ResponseError';
import { error } from 'console';
import { PoqoDataAndReceiptReq, serializePoqoDataAndReceiptReq } from '../types/PoqoDataAndReceiptReq';
import { AJVSchemaEnum } from '../types/enum/AJVSchemaEnum';
import { getGlobalTxReceipt } from '../p2p/GlobalAccounts';
interface Receipt {
    tx: AcceptedTx;
}
const txStatBucketSize = {
    default: [
        1, 2, 4, 8, 16, 30, 60, 125, 250, 500, 1000, 2000, 4000, 8000, 10000, 20000, 30000, 60000, 100000,
    ],
};
export enum DebugComplete {
    Incomplete = 0,
    Completed = 1
}
class TransactionQueue {
    app: Shardus.App;
    crypto: Crypto;
    config: Shardus.StrictServerConfiguration;
    profiler: Profiler;
    logger: Logger;
    p2p: P2P;
    storage: Storage;
    stateManager: StateManager;
    mainLogger: L4jsLogger;
    seqLogger: L4jsLogger;
    fatalLogger: L4jsLogger;
    shardLogger: L4jsLogger;
    statsLogger: L4jsLogger;
    statemanager_fatal: (key: string, log: string) => void;
    _transactionQueue: QueueEntry[];
    pendingTransactionQueue: QueueEntry[];
    archivedQueueEntries: QueueEntry[];
    txDebugStatList: utils.FIFOCache<string, TxDebug>;
    _transactionQueueByID: Map<string, QueueEntry>;
    pendingTransactionQueueByID: Map<string, QueueEntry>;
    archivedQueueEntriesByID: Map<string, QueueEntry>;
    receiptsToForward: ArchiverReceipt[];
    forwardedReceiptsByTimestamp: Map<number, ArchiverReceipt>;
    receiptsBundleByInterval: Map<number, ArchiverReceipt[]>;
    receiptsForwardedTimestamp: number;
    queueStopped: boolean;
    queueEntryCounter: number;
    queueRestartCounter: number;
    archivedQueueEntryMaxCount: number;
    transactionProcessingQueueRunning: boolean;
    processingLastRunTime: number;
    processingMinRunBreak: number;
    transactionQueueHasRemainingWork: boolean;
    executeInOneShard: boolean;
    useNewPOQ: boolean;
    usePOQo: boolean;
    txCoverageMap: {
        [key: symbol]: unknown;
    };
    queueTimingFixes: boolean;
    lastProcessStats: {
        [limitName: string]: ProcessQueueStats;
    };
    largePendingQueueReported: boolean;
    queueReads: Set<string>;
    queueWrites: Set<string>;
    queueReadWritesOld: Set<string>;
    isStuckProcessing: boolean;
    stuckProcessingCount: number;
    stuckProcessingCyclesCount: number;
    stuckProcessingQueueLockedCyclesCount: number;
    debugLastAwaitedCall: string;
    debugLastAwaitedCallInner: string;
    debugLastAwaitedAppCall: string;
    debugLastAwaitedCallInnerStack: {
        [key: string]: number;
    };
    debugLastAwaitedAppCallStack: {
        [key: string]: number;
    };
    debugLastProcessingQueueStartTime: number;
    debugRecentQueueEntry: QueueEntry;
    nonceQueue: Map<string, NonceQueueItem[]>;
    constructor(stateManager: StateManager, profiler: Profiler, app: Shardus.App, logger: Logger, storage: Storage, p2p: P2P, crypto: Crypto, config: Shardus.StrictServerConfiguration) {
        this.crypto = crypto;
        this.app = app;
        this.logger = logger;
        this.config = config;
        this.profiler = profiler;
        this.p2p = p2p;
        this.storage = storage;
        this.stateManager = stateManager;
        this.useNewPOQ = this.config.stateManager.useNewPOQ;
        this.usePOQo = this.config.stateManager.usePOQo;
        this.mainLogger = logger.getLogger('main');
        this.seqLogger = logger.getLogger('seq');
        this.fatalLogger = logger.getLogger('fatal');
        this.shardLogger = logger.getLogger('shardDump');
        this.statsLogger = logger.getLogger('statsDump');
        this.statemanager_fatal = stateManager.statemanager_fatal;
        this.queueStopped = false;
        this.queueEntryCounter = 0;
        this.queueRestartCounter = 0;
        this._transactionQueue = [];
        this.pendingTransactionQueue = [];
        this.archivedQueueEntries = [];
        this.nonceQueue = new Map();
        this.txDebugStatList = new utils.FIFOCache<string, TxDebug>(this.config.debug.debugStatListMaxSize);
        this.receiptsToForward = [];
        this.forwardedReceiptsByTimestamp = new Map();
        this.receiptsBundleByInterval = new Map();
        this.receiptsForwardedTimestamp = shardusGetTime();
        this._transactionQueueByID = new Map();
        this.pendingTransactionQueueByID = new Map();
        this.archivedQueueEntriesByID = new Map();
        this.archivedQueueEntryMaxCount = 5000;
        this.transactionProcessingQueueRunning = false;
        this.processingLastRunTime = 0;
        this.processingMinRunBreak = 200;
        this.transactionQueueHasRemainingWork = false;
        this.executeInOneShard = false;
        if (this.config.sharding.executeInOneShard === true) {
            this.executeInOneShard = true;
        }
        this.txCoverageMap = {};
        this.queueTimingFixes = true;
        this.lastProcessStats = {};
        this.largePendingQueueReported = false;
        this.isStuckProcessing = false;
        this.stuckProcessingCount = 0;
        this.stuckProcessingCyclesCount = 0;
        this.stuckProcessingQueueLockedCyclesCount = 0;
        this.debugLastAwaitedCall = '';
        this.debugLastAwaitedCallInner = '';
        this.debugLastAwaitedAppCall = '';
        this.debugLastProcessingQueueStartTime = 0;
        this.debugLastAwaitedCallInnerStack = {};
        this.debugLastAwaitedAppCallStack = {};
        this.debugRecentQueueEntry = null;
    }
    setupHandlers(): void {
        const broadcastStateRoute: P2PTypes.P2PTypes.Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_broadcast_state,
            handler: (payload, respond, header, sign) => {
                const route = InternalRouteEnum.binary_broadcast_state;
                const errorHandler = (errorType: RequestErrorEnum, opts?: {
                    customErrorLog?: string;
                    customCounterSuffix?: string;
                }): void => requestErrorHandler(route, errorType, header, opts);
                try {
                    const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cBroadcastStateReq);
                    if (!requestStream) {
                        return errorHandler(RequestErrorEnum.InvalidRequest);
                    }
                    if (header.verification_data == null) {
                        return errorHandler(RequestErrorEnum.MissingVerificationData);
                    }
                    const verificationDataParts = verificationDataSplitter(header.verification_data);
                    if (verificationDataParts.length !== 3) {
                        return errorHandler(RequestErrorEnum.InvalidVerificationData);
                    }
                    const [vTxId, vStateSize, vStateAddress] = verificationDataParts;
                    const queueEntry = this.getQueueEntrySafe(vTxId);
                    if (queueEntry == null) {
                        if (logFlags.error && logFlags.verbose)
                            this.mainLogger.error(`${route} cant find queueEntry for: ${utils.makeShortHash(vTxId)}`);
                        return errorHandler(RequestErrorEnum.InvalidVerificationData, {
                            customCounterSuffix: 'queueEntryNotFound',
                        });
                    }
                    const req = deserializeBroadcastStateReq(requestStream);
                    if (req.txid !== vTxId) {
                        return errorHandler(RequestErrorEnum.InvalidVerificationData);
                    }
                    if (req.stateList.length !== parseInt(vStateSize)) {
                        return errorHandler(RequestErrorEnum.InvalidVerificationData);
                    }
                    const senderNodeId = header.sender_id;
                    let isSenderOurExeNeighbour = false;
                    const senderIsInExecutionGroup = queueEntry.executionGroupMap.has(senderNodeId);
                    const neighbourNodes = utils.selectNeighbors(queueEntry.executionGroup, queueEntry.ourExGroupIndex, 2) as Shardus.Node[];
                    const neighbourNodeIds = neighbourNodes.map((node) => node.id);
                    isSenderOurExeNeighbour = senderIsInExecutionGroup && neighbourNodeIds.includes(senderNodeId);
                    for (let i = 0; i < req.stateList.length; i++) {
                        const state = req.stateList[i];
                        let isSenderValid = false;
                        if (configContext.p2p.useFactCorrespondingTell) {
                            if (configContext.stateManager.shareCompleteData) {
                                if (isSenderOurExeNeighbour) {
                                    isSenderValid = true;
                                }
                                else {
                                    isSenderValid = this.factValidateCorrespondingTellSender(queueEntry, state.accountId, senderNodeId);
                                }
                            }
                            else {
                                isSenderValid = this.factValidateCorrespondingTellSender(queueEntry, state.accountId, senderNodeId);
                            }
                        }
                        else {
                            isSenderValid = this.validateCorrespondingTellSender(queueEntry, state.accountId, senderNodeId);
                        }
                        if (this.stateManager.testFailChance(configContext.debug.ignoreDataTellChance, 'ignoreDataTellChance', queueEntry.logID, '', logFlags.verbose) === true) {
                            isSenderValid = false;
                        }
                        if (isSenderValid === false) {
                            this.mainLogger.error(`${route} validateCorrespondingTellSender failed for ${state.accountId}`);
                            return errorHandler(RequestErrorEnum.InvalidSender);
                        }
                    }
                    for (let i = 0; i < req.stateList.length; i++) {
                        const state = req.stateList[i];
                        if (configContext.stateManager.collectedDataFix && configContext.stateManager.rejectSharedDataIfCovered) {
                            const consensusNodes = this.stateManager.transactionQueue.getConsenusGroupForAccount(state.accountId);
                            const coveredByUs = consensusNodes.map((node) => node.id).includes(Self.id);
                            if (coveredByUs) {
                                continue;
                            }
                            else {
                                this.queueEntryAddData(queueEntry, state);
                            }
                        }
                        else {
                            this.queueEntryAddData(queueEntry, state);
                        }
                        if (queueEntry.state === 'syncing') {
                        }
                    }
                }
                catch (e) {
                    if (logFlags.error)
                        this.mainLogger.error(`${route}: Exception executing request: ${errorToStringFull(e)}`);
                }
                finally {
                }
            },
        };
        this.p2p.registerInternalBinary(broadcastStateRoute.name, broadcastStateRoute.handler);
        const broadcastFinalStateRoute: P2PTypes.P2PTypes.Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_broadcast_finalstate,
            handler: (payload, response, header, sign) => {
                const route = InternalRouteEnum.binary_broadcast_finalstate;
                const errorHandler = (errorType: RequestErrorEnum, opts?: {
                    customErrorLog?: string;
                    customCounterSuffix?: string;
                }): void => requestErrorHandler(route, errorType, header, opts);
                try {
                    const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cBroadcastFinalStateReq);
                    if (!requestStream) {
                        return errorHandler(RequestErrorEnum.InvalidRequest);
                    }
                    if (header.verification_data == null) {
                        return errorHandler(RequestErrorEnum.MissingVerificationData);
                    }
                    const verificationDataParts = verificationDataSplitter(header.verification_data);
                    if (verificationDataParts.length !== 2) {
                        return errorHandler(RequestErrorEnum.InvalidVerificationData);
                    }
                    const [vTxId, vStateSize] = verificationDataParts;
                    const queueEntry = this.getQueueEntrySafe(vTxId);
                    if (queueEntry == null) {
                        if (logFlags.error && logFlags.verbose)
                            this.mainLogger.error(`${route} cant find queueEntry for: ${utils.makeShortHash(vTxId)}`);
                        return errorHandler(RequestErrorEnum.InvalidVerificationData, {
                            customCounterSuffix: 'queueEntryNotFound',
                        });
                    }
                    const req = deserializeBroadcastFinalStateReq(requestStream);
                    if (req.txid !== vTxId) {
                        return errorHandler(RequestErrorEnum.InvalidVerificationData);
                    }
                    if (req.stateList.length !== parseInt(vStateSize)) {
                        return errorHandler(RequestErrorEnum.InvalidVerificationData);
                    }
                    let saveSomething = false;
                    for (const data of req.stateList) {
                        if (data == null) {
                            if (logFlags.error && logFlags.verbose)
                                this.mainLogger.error(`broadcast_finalstate data == null`);
                            continue;
                        }
                        const isValidFinalDataSender = this.factValidateCorrespondingTellFinalDataSender(queueEntry, header.sender_id);
                        if (isValidFinalDataSender === false) {
                            if (logFlags.error)
                                this.mainLogger.error(`broadcast_finalstate invalid sender ${header.sender_id} for data: ${data.accountId}`);
                            return errorHandler(RequestErrorEnum.InvalidSender);
                        }
                    }
                    for (const data of req.stateList) {
                        if (data == null) {
                            if (logFlags.error && logFlags.verbose)
                                this.mainLogger.error(`broadcast_finalstate data == null`);
                            continue;
                        }
                        if (queueEntry.collectedFinalData[data.accountId] == null) {
                            queueEntry.collectedFinalData[data.accountId] = data;
                            saveSomething = true;
                        }
                    }
                }
                catch (e) {
                    if (logFlags.error)
                        this.mainLogger.error(`${route}: Exception executing request: ${errorToStringFull(e)}`);
                }
                finally {
                }
            },
        };
        this.p2p.registerInternalBinary(broadcastFinalStateRoute.name, broadcastFinalStateRoute.handler);
        const spreadTxToGroupSyncingBinaryHandler: P2PTypes.P2PTypes.Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_spread_tx_to_group_syncing,
            handler: async (payload, respond, header, sign) => {
                const route = InternalRouteEnum.binary_spread_tx_to_group_syncing;
                const errorHandler = (errorType: RequestErrorEnum, opts?: {
                    customErrorLog?: string;
                    customCounterSuffix?: string;
                }): void => requestErrorHandler(route, errorType, header, opts);
                try {
                    const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cSpreadTxToGroupSyncingReq);
                    if (!requestStream) {
                        return errorHandler(RequestErrorEnum.InvalidRequest);
                    }
                    const req: SpreadTxToGroupSyncingReq = deserializeSpreadTxToGroupSyncingReq(requestStream);
                    const ajvErrors = verifyPayload(AJVSchemaEnum.SpreadTxToGroupSyncingReq, req);
                    if (ajvErrors && ajvErrors.length > 0) {
                        this.mainLogger.error(`${route}: request validation errors: ${ajvErrors}`);
                        return errorHandler(RequestErrorEnum.InvalidPayload);
                    }
                    const node = this.p2p.state.getNode(header.sender_id);
                    this.handleSharedTX(req.data, req.appData, node);
                }
                catch (e) {
                    if (logFlags.error)
                        this.mainLogger.error(`${route}: Exception executing request: ${errorToStringFull(e)}`);
                }
                finally {
                }
            },
        };
        this.p2p.registerInternalBinary(spreadTxToGroupSyncingBinaryHandler.name, spreadTxToGroupSyncingBinaryHandler.handler);
        this.p2p.registerGossipHandler('spread_tx_to_group', async (payload: {
            data: Shardus.TimestampedTx;
            appData: unknown;
        }, sender: Node, tracker: string, msgSize: number) => {
            let respondSize = cUninitializedSize;
            try {
                const queueEntry = this.handleSharedTX(payload.data, payload.appData, sender);
                if (queueEntry == null) {
                    return;
                }
                const transactionGroup = this.queueEntryGetTransactionGroup(queueEntry);
                if (queueEntry.ourNodeInTransactionGroup === false) {
                    return;
                }
                if (transactionGroup.length > 1) {
                    this.stateManager.debugNodeGroup(queueEntry.acceptedTx.txId, queueEntry.acceptedTx.timestamp, `spread_tx_to_group transactionGroup:`, transactionGroup);
                    respondSize = await this.p2p.sendGossipIn('spread_tx_to_group', payload, tracker, sender, transactionGroup, false, -1, queueEntry.acceptedTx.txId);
                    if (queueEntry.isInExecutionHome === true) {
                        this.addOriginalTxDataToForward(queueEntry);
                    }
                }
            }
            finally {
            }
        });
        const requestStateForTxRoute: P2PTypes.P2PTypes.Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_request_state_for_tx,
            handler: (payload, respond) => {
                const route = InternalRouteEnum.binary_request_state_for_tx;
                const response: RequestStateForTxRespSerialized = {
                    stateList: [],
                    beforeHashes: {},
                    note: '',
                    success: false,
                };
                try {
                    const responseStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cRequestStateForTxReq);
                    if (!responseStream) {
                        this.mainLogger.error(`${route}: Invalid request`);
                        respond(response, serializeRequestStateForTxResp);
                        return;
                    }
                    const req = deserializeRequestStateForTxReq(responseStream);
                    if (req.txid == null) {
                        throw new Error('Txid is null');
                    }
                    let queueEntry = this.getQueueEntrySafe(req.txid);
                    if (queueEntry == null) {
                        queueEntry = this.getQueueEntryArchived(req.txid, InternalRouteEnum.binary_request_state_for_tx);
                    }
                    if (queueEntry == null) {
                        response.note = `failed to find queue entry: ${utils.stringifyReduce(req.txid)}  ${req.timestamp} dbg:${this.stateManager.debugTXHistory[utils.stringifyReduce(req.txid)]}`;
                        respond(response, serializeRequestStateForTxResp);
                        return;
                    }
                    for (const key of req.keys) {
                        const data = queueEntry.originalData[key];
                        if (data) {
                            response.stateList.push(data);
                        }
                    }
                    response.success = true;
                    respond(response, serializeRequestStateForTxResp);
                }
                catch (e) {
                    if (logFlags.error)
                        this.mainLogger.error(`${InternalRouteEnum.binary_request_state_for_tx}: Exception executing request: ${errorToStringFull(e)}`);
                    respond(response, serializeRequestStateForTxResp);
                }
                finally {
                }
            },
        };
        this.p2p.registerInternalBinary(requestStateForTxRoute.name, requestStateForTxRoute.handler);
        networkContext.registerExternalPost('get-tx-receipt', async (req, res) => {
            let result: {
                success: boolean;
                receipt?: ArchiverReceipt | SignedReceipt;
                reason?: string;
            };
            try {
                let error = utils.validateTypes(req.body, {
                    txId: 's',
                    timestamp: 'n',
                    full_receipt: 'b',
                    sign: 'o',
                });
                if (error) {
                    res.json((result = { success: false, reason: error }));
                    return;
                }
                error = utils.validateTypes(req.body.sign, {
                    owner: 's',
                    sig: 's',
                });
                if (error) {
                    res.json((result = { success: false, reason: error }));
                    return;
                }
                const { txId, timestamp, full_receipt, sign } = req.body;
                const isReqFromArchiver = Archivers.archivers.has(sign.owner);
                if (!isReqFromArchiver) {
                    result = { success: false, reason: 'Request not from Archiver.' };
                }
                else {
                    const isValidSignature = this.crypto.verify(req.body, sign.owner);
                    if (isValidSignature) {
                        let queueEntry: QueueEntry;
                        if (this.archivedQueueEntriesByID.has(txId) &&
                            this.archivedQueueEntriesByID.get(txId)?.acceptedTx?.timestamp === timestamp) {
                            queueEntry = this.archivedQueueEntriesByID.get(txId);
                        }
                        else if (this._transactionQueueByID.has(txId) &&
                            this._transactionQueueByID.get(txId)?.state === 'commiting' &&
                            this._transactionQueueByID.get(txId)?.acceptedTx?.timestamp === timestamp) {
                            queueEntry = this._transactionQueueByID.get(txId);
                        }
                        if (!queueEntry) {
                            res.status(400).json({ success: false, reason: 'Receipt Not Found.' });
                            return;
                        }
                        if (full_receipt) {
                            const fullReceipt: ArchiverReceipt = await this.getArchiverReceiptFromQueueEntry(queueEntry);
                            if (fullReceipt === null) {
                                res.status(400).json({ success: false, reason: 'Receipt Not Found.' });
                                return;
                            }
                            result = Utils.safeJsonParse(Utils.safeStringify({ success: true, receipt: fullReceipt }));
                        }
                        else {
                            result = { success: true, receipt: this.stateManager.getSignedReceipt(queueEntry) };
                        }
                    }
                    else {
                        result = { success: false, reason: 'Invalid Signature.' };
                    }
                }
                res.json(result);
            }
            catch (e) {
                res.json((result = { success: false, reason: e }));
            }
        });
    }
    isTxInPendingNonceQueue(accountId: string, txId: string): boolean {
        const queue = this.nonceQueue.get(accountId);
        if (queue == null) {
            return false;
        }
        for (const item of queue) {
            if (item.txId === txId) {
                return true;
            }
        }
        return false;
    }
    getPendingCountInNonceQueue(): {
        totalQueued: number;
        totalAccounts: number;
        avgQueueLength: number;
    } {
        let totalQueued = 0;
        let totalAccounts = 0;
        for (const queue of this.nonceQueue.values()) {
            totalQueued += queue.length;
            totalAccounts++;
        }
        const avgQueueLength = totalQueued / totalAccounts;
        return { totalQueued, totalAccounts, avgQueueLength };
    }
    addTransactionToNonceQueue(nonceQueueEntry: NonceQueueItem): {
        success: boolean;
        reason?: string;
        alreadyAdded?: boolean;
    } {
        try {
            let queue = this.nonceQueue.get(nonceQueueEntry.accountId);
            if (queue == null || (Array.isArray(queue) && queue.length === 0)) {
                queue = [nonceQueueEntry];
                this.nonceQueue.set(nonceQueueEntry.accountId, queue);
            }
            else if (queue && queue.length > 0) {
                const index = utils.binarySearch(queue, nonceQueueEntry, (a, b) => Number(a.nonce) - Number(b.nonce));
                if (index >= 0) {
                    queue[index] = nonceQueueEntry;
                    this.nonceQueue.set(nonceQueueEntry.accountId, queue);
                    return { success: true, reason: 'Replace existing pending nonce tx', alreadyAdded: true };
                }
                utils.insertSorted(queue, nonceQueueEntry, (a, b) => Number(a.nonce) - Number(b.nonce));
                this.nonceQueue.set(nonceQueueEntry.accountId, queue);
            }
            return { success: true, reason: `Nonce queue size for account: ${queue.length}`, alreadyAdded: false };
        }
        catch (e) {
            this.mainLogger.error(`Error adding tx to nonce queue: ${e.message}, tx: ${utils.stringifyReduce(nonceQueueEntry)}`);
            return { success: false, reason: e.message, alreadyAdded: false };
        }
    }
    async processNonceQueue(accounts: Shardus.WrappedData[]): Promise<void> {
        for (const account of accounts) {
            const queue = this.nonceQueue.get(account.accountId);
            if (queue == null) {
                continue;
            }
            for (const item of queue) {
                const accountNonce = await this.app.getAccountNonce(account.accountId, account);
                if (item.nonce === accountNonce) {
                    item.appData.requestNewTimestamp = true;
                    if (logFlags.important_as_error) {
                        const txTimestamp = this.app.getTimestampFromTransaction(item.tx, item.appData);
                        const nowNodeTimestamp = shardusGetTime();
                        const delta = nowNodeTimestamp - txTimestamp;
                        const ntpOffset = getNetworkTimeOffset();
                    }
                    await this.stateManager.shardus._timestampAndQueueTransaction(item.tx, item.appData, item.global, item.noConsensus, 'nonceQueue');
                    if (logFlags.important_as_error) {
                        const txTimestamp = this.app.getTimestampFromTransaction(item.tx, item.appData);
                        const nowNodeTimestamp = shardusGetTime();
                        const delta = nowNodeTimestamp - txTimestamp;
                        const ntpOffset = getNetworkTimeOffset();
                    }
                    const index = queue.indexOf(item);
                    queue.splice(index, 1);
                    break;
                }
            }
        }
    }
    handleSharedTX(tx: Shardus.TimestampedTx, appData: unknown, sender: Shardus.Node): QueueEntry {
        const internalTx = this.app.isInternalTx(tx);
        if ((internalTx && !isInternalTxAllowed()) || (!internalTx && networkMode !== 'processing')) {
            return null;
        }
        const validateResult = this.app.validate(tx, appData);
        if (validateResult.success === false) {
            this.statemanager_fatal(`spread_tx_to_group_validateTX`, `spread_tx_to_group validateTxnFields failed: ${utils.stringifyReduce(validateResult)}`);
            return null;
        }
        const { timestamp, id, keys, shardusMemoryPatterns } = this.app.crack(tx, appData);
        let queueEntry = this.getQueueEntrySafe(id);
        if (queueEntry) {
            return null;
        }
        const mostOfQueueSitTimeMs = this.stateManager.queueSitTime * 0.9;
        const txExpireTimeMs = this.config.transactionExpireTime * 1000;
        const age = shardusGetTime() - timestamp;
        if (inRangeOfCurrentTime(timestamp, mostOfQueueSitTimeMs, txExpireTimeMs) === false) {
            if (logFlags.verbose)
                this.statemanager_fatal(`spread_tx_to_group_OldTx_or_tooFuture`, 'spread_tx_to_group cannot accept tx with age: ' + age);
            return null;
        }
        const acceptedTx: AcceptedTx = {
            timestamp,
            txId: id,
            keys,
            data: tx,
            appData,
            shardusMemoryPatterns,
        };
        const noConsensus = false;
        const added = this.routeAndQueueAcceptedTransaction(acceptedTx, false, sender, false, noConsensus);
        if (added === 'lost') {
            return null;
        }
        if (added === 'out of range') {
            return null;
        }
        if (added === 'notReady') {
            return null;
        }
        queueEntry = this.getQueueEntrySafe(id);
        if (queueEntry == null) {
            return null;
        }
        return queueEntry;
    }
    async getAccountsStateHash(accountStart = '0'.repeat(64), accountEnd = 'f'.repeat(64), tsStart = 0, tsEnd = shardusGetTime()): Promise<string> {
        const accountStates = await this.storage.queryAccountStateTable(accountStart, accountEnd, tsStart, tsEnd, 100000000);
        const seenAccounts = new Set();
        const filteredAccountStates = [];
        for (let i = accountStates.length - 1; i >= 0; i--) {
            const accountState: Shardus.StateTableObject = accountStates[i];
            if (seenAccounts.has(accountState.accountId) === true) {
                continue;
            }
            seenAccounts.add(accountState.accountId);
            filteredAccountStates.unshift(accountState);
        }
        const stateHash = this.crypto.hash(filteredAccountStates);
        return stateHash;
    }
    async preApplyTransaction(queueEntry: QueueEntry): Promise<PreApplyAcceptedTransactionResult> {
        if (this.queueStopped)
            return;
        const acceptedTX = queueEntry.acceptedTx;
        const wrappedStates = queueEntry.collectedData;
        const localCachedData = queueEntry.localCachedData;
        const tx = acceptedTX.data;
        const keysResponse = queueEntry.txKeys;
        const { timestamp, debugInfo } = keysResponse;
        const uniqueKeys = queueEntry.uniqueKeys;
        let accountTimestampsAreOK = true;
        let ourLockID = -1;
        let ourAccountLocks = null;
        let applyResponse: Shardus.ApplyResponse | null = null;
        const isGlobalModifyingTX = queueEntry.globalModification === true;
        let passedApply = false;
        let applyResult: string;
        const appData = acceptedTX.appData;
        this.txDebugMarkStartTime(queueEntry, 'preApplyTransaction');
        for (const key of uniqueKeys) {
            if (wrappedStates[key] == null) {
                this.txDebugMarkEndTime(queueEntry, 'preApplyTransaction');
                return { applied: false, passed: false, applyResult: '', reason: 'missing some account data' };
            }
            else {
                const wrappedState = wrappedStates[key];
                wrappedState.prevStateId = wrappedState.stateId;
                wrappedState.prevDataCopy = utils.deepCopy(wrappedState.data);
                const { timestamp: updatedTimestamp } = this.app.getTimestampAndHashFromAccount(wrappedState.data);
                wrappedState.timestamp = updatedTimestamp;
                if (wrappedState.timestamp >= timestamp) {
                    accountTimestampsAreOK = false;
                    break;
                }
            }
        }
        if (!accountTimestampsAreOK) {
            this.txDebugMarkEndTime(queueEntry, 'preApplyTransaction');
            return {
                applied: false,
                passed: false,
                applyResult: '',
                reason: 'preApplyTransaction pretest failed, TX rejected',
            };
        }
        try {
            if (logFlags.verbose) {
            }
            this.setDebugLastAwaitedCallInner('preApplyTransaction-bulkFifoLockAccounts');
            ourAccountLocks = await this.stateManager.bulkFifoLockAccounts(uniqueKeys);
            this.setDebugLastAwaitedCallInner('preApplyTransaction-bulkFifoLockAccounts', DebugComplete.Completed);
            this.setDebugLastAwaitedCallInner('preApplyTransaction-fifoLock(accountModification)');
            ourLockID = await this.stateManager.fifoLock('accountModification');
            this.setDebugLastAwaitedCallInner('preApplyTransaction-fifoLock(accountModification)', DebugComplete.Completed);
            if (configContext.stateManager.useCopiedWrappedStateForApply === true) {
                const deepCopyWrappedStates = utils.deepCopy(wrappedStates);
                this.setDebugLastAwaitedCallInner('stateManager.transactionQueue.app.apply(tx)');
                applyResponse = await this.app.apply(tx as Shardus.OpaqueTransaction, deepCopyWrappedStates, appData);
                this.setDebugLastAwaitedCallInner('stateManager.transactionQueue.app.apply(tx)', DebugComplete.Completed);
            }
            else {
                this.setDebugLastAwaitedCallInner('stateManager.transactionQueue.app.apply(tx)');
                applyResponse = await this.app.apply(tx as Shardus.OpaqueTransaction, wrappedStates, appData);
                this.setDebugLastAwaitedCallInner('stateManager.transactionQueue.app.apply(tx)', DebugComplete.Completed);
            }
            if (applyResponse == null) {
                throw Error('null response from app.apply');
            }
            if (this.config.debug.checkTxGroupChanges && applyResponse.accountWrites.length > 0) {
                const transactionGroupIDs = new Set(queueEntry.transactionGroup.map((node) => node.id));
                for (const account of applyResponse.accountWrites) {
                    let txGroupCycle = queueEntry.txGroupCycle;
                    if (txGroupCycle > CycleChain.newest.counter) {
                        txGroupCycle = CycleChain.newest.counter;
                    }
                    const cycleShardDataForTx = this.stateManager.shardValuesByCycle.get(txGroupCycle);
                    const fixHomeNodeCheckForTXGroupChanges = this.config.features.fixHomeNodeCheckForTXGroupChanges ?? false;
                    const homeNode = fixHomeNodeCheckForTXGroupChanges
                        ? ShardFunctions.findHomeNode(cycleShardDataForTx.shardGlobals, account.accountId, cycleShardDataForTx.parititionShardDataMap)
                        : ShardFunctions.findHomeNode(this.stateManager.currentCycleShardData.shardGlobals, account.accountId, this.stateManager.currentCycleShardData.parititionShardDataMap);
                    let isUnexpectedAccountWrite = false;
                    for (const storageNode of homeNode.nodeThatStoreOurParitionFull) {
                        const isStorageNodeInTxGroup = transactionGroupIDs.has(storageNode.id);
                        if (!isStorageNodeInTxGroup) {
                            isUnexpectedAccountWrite = true;
                            break;
                        }
                    }
                    if (isUnexpectedAccountWrite) {
                        applyResponse.failed = true;
                        applyResponse.failMessage = `preApplyTransaction unexpected account ${account.accountId} is not covered by transaction group`;
                    }
                }
            }
            if (applyResponse.failed === true) {
                passedApply = false;
                applyResult = applyResponse.failMessage;
            }
            else {
                passedApply = true;
                applyResult = 'applied';
            }
        }
        catch (ex) {
            if (logFlags.error)
                this.mainLogger.error(`preApplyTransaction failed id:${utils.makeShortHash(acceptedTX.txId)}: ` + ex.name + ': ' + ex.message + ' at ' + ex.stack);
            if (logFlags.error)
                this.mainLogger.error(`preApplyTransaction failed id:${utils.makeShortHash(acceptedTX.txId)}  ${utils.stringifyReduce(acceptedTX)}`);
            passedApply = false;
            applyResult = ex.message;
        }
        finally {
            this.stateManager.fifoUnlock('accountModification', ourLockID);
            if (ourAccountLocks != null) {
                this.stateManager.bulkFifoUnlockAccounts(uniqueKeys, ourAccountLocks);
            }
        }
        this.txDebugMarkEndTime(queueEntry, 'preApplyTransaction');
        return {
            applied: true,
            passed: passedApply,
            applyResult: applyResult,
            reason: 'apply result',
            applyResponse: applyResponse,
        };
    }
    configUpdated(): void {
        this.useNewPOQ = this.config.stateManager.useNewPOQ;
    }
    resetTxCoverageMap(): void {
        this.txCoverageMap = {};
    }
    async commitConsensedTransaction(queueEntry: QueueEntry): Promise<CommitConsensedTransactionResult> {
        let ourLockID = -1;
        let accountDataList: string | unknown[];
        let uniqueKeys = [];
        let ourAccountLocks = null;
        const acceptedTX = queueEntry.acceptedTx;
        let wrappedStates = this.stateManager.useAccountWritesOnly ? {} : queueEntry.collectedData;
        const localCachedData = queueEntry.localCachedData;
        const keysResponse = queueEntry.txKeys;
        const { timestamp, debugInfo } = keysResponse;
        const applyResponse = queueEntry?.preApplyTXResult?.applyResponse;
        const isGlobalModifyingTX = queueEntry.globalModification === true;
        let savedSomething = false;
        try {
            if (logFlags.verbose) {
            }
            uniqueKeys = queueEntry.uniqueKeys;
            this.setDebugLastAwaitedCallInner('commit this.stateManager.bulkFifoLockAccounts');
            ourAccountLocks = await this.stateManager.bulkFifoLockAccounts(uniqueKeys);
            this.setDebugLastAwaitedCallInner('commit this.stateManager.bulkFifoLockAccounts', DebugComplete.Completed);
            this.setDebugLastAwaitedCallInner('commit this.stateManager.fifoLock');
            ourLockID = await this.stateManager.fifoLock('accountModification');
            this.setDebugLastAwaitedCallInner('commit this.stateManager.fifoLock', DebugComplete.Completed);
            let stateTableResults = null;
            let _accountdata = [];
            if (applyResponse != null) {
                stateTableResults = applyResponse.stateTableResults;
                _accountdata = applyResponse.accountData;
            }
            accountDataList = _accountdata;
            const writtenAccountsMap: WrappedResponses = {};
            if (applyResponse != null &&
                applyResponse.accountWrites != null &&
                applyResponse.accountWrites.length > 0) {
                const collectedData = queueEntry.collectedData;
                for (const writtenAccount of applyResponse.accountWrites) {
                    writtenAccountsMap[writtenAccount.accountId] = writtenAccount.data;
                    writtenAccountsMap[writtenAccount.accountId].prevStateId = collectedData[writtenAccount.accountId]
                        ? collectedData[writtenAccount.accountId].stateId
                        : '';
                    writtenAccountsMap[writtenAccount.accountId].prevDataCopy = collectedData[writtenAccount.accountId]
                        ? utils.deepCopy(collectedData[writtenAccount.accountId].data)
                        : {};
                }
                wrappedStates = writtenAccountsMap;
            }
            if (queueEntry.globalModification === false &&
                this.executeInOneShard &&
                queueEntry.isInExecutionHome === false) {
                wrappedStates = {};
                for (const key of Object.keys(queueEntry.collectedFinalData)) {
                    const finalAccount = queueEntry.collectedFinalData[key];
                    const accountId = finalAccount.accountId;
                    const prevStateCalc = wrappedStates[accountId] ? wrappedStates[accountId].stateId : '';
                    wrappedStates[key] = finalAccount;
                }
            }
            const filter: AccountFilter = {};
            const nodeShardData: StateManagerTypes.shardFunctionTypes.NodeShardData = this.stateManager.currentCycleShardData.nodeShardData;
            if (applyResponse != null &&
                applyResponse.accountWrites != null &&
                applyResponse.accountWrites.length > 0) {
                for (const writtenAccount of applyResponse.accountWrites) {
                    const isLocal = ShardFunctions.testAddressInRange(writtenAccount.accountId, nodeShardData.storedPartitions);
                    if (isLocal) {
                        filter[writtenAccount.accountId] = 1;
                    }
                }
            }
            if (this.executeInOneShard && applyResponse == null && queueEntry.collectedFinalData != null) {
                for (const writtenAccount of Object.values(wrappedStates)) {
                    const isLocal = ShardFunctions.testAddressInRange(writtenAccount.accountId, nodeShardData.storedPartitions);
                    if (isLocal) {
                        filter[writtenAccount.accountId] = 1;
                    }
                }
            }
            const note = `setAccountData: tx:${queueEntry.logID} in commitConsensedTransaction. `;
            for (const key of Object.keys(queueEntry.localKeys)) {
                filter[key] = 1;
            }
            this.setDebugLastAwaitedCallInner('this.stateManager.setAccount');
            savedSomething = await this.stateManager.setAccount(wrappedStates, localCachedData, applyResponse, isGlobalModifyingTX, filter, note);
            this.setDebugLastAwaitedCallInner('this.stateManager.setAccount', DebugComplete.Completed);
            queueEntry.accountDataSet = true;
            if (savedSomething) {
            }
            if (logFlags.verbose) {
            }
            if (stateTableResults != null) {
                for (const stateT of stateTableResults) {
                    let wrappedRespose = wrappedStates[stateT.accountId];
                    if (wrappedRespose == null) {
                        wrappedRespose = writtenAccountsMap[stateT.accountId];
                    }
                    stateT.stateBefore = wrappedRespose.prevStateId;
                    if (logFlags.verbose) {
                    }
                }
                this.setDebugLastAwaitedCallInner('this.storage.addAccountStates');
                await this.storage.addAccountStates(stateTableResults);
                this.setDebugLastAwaitedCallInner('this.storage.addAccountStates', DebugComplete.Completed);
            }
            this.storage.addAcceptedTransactions([acceptedTX]);
            this.app.transactionReceiptPass(acceptedTX.data, wrappedStates, applyResponse, true);
        }
        catch (ex) {
            this.statemanager_fatal(`commitConsensedTransaction_ex`, 'commitConsensedTransaction failed: ' + ex.name + ': ' + ex.message + ' at ' + ex.stack);
            return { success: false };
        }
        finally {
            this.stateManager.fifoUnlock('accountModification', ourLockID);
            if (ourAccountLocks != null) {
                this.stateManager.bulkFifoUnlockAccounts(uniqueKeys, ourAccountLocks);
            }
        }
        const dataResultsFullList = [];
        for (const wrappedData of applyResponse.accountData) {
            if (wrappedData.localCache != null) {
                dataResultsFullList.push(wrappedData);
            }
        }
        const upgradedAccountDataList: Shardus.AccountData[] = dataResultsFullList as unknown as Shardus.AccountData[];
        const repairing = false;
        this.setDebugLastAwaitedCallInner('stateManager.updateAccountsCopyTable');
        await this.stateManager.updateAccountsCopyTable(upgradedAccountDataList, repairing, timestamp);
        this.setDebugLastAwaitedCallInner('stateManager.updateAccountsCopyTable', DebugComplete.Completed);
        if (queueEntry != null &&
            queueEntry.transactionGroup != null &&
            this.p2p.getNodeId() === queueEntry.transactionGroup[0].id) {
            if (queueEntry.globalModification === false) {
                this.stateManager.eventEmitter.emit('txProcessed');
            }
        }
        this.stateManager.eventEmitter.emit('txApplied', acceptedTX);
        this.stateManager.partitionStats.statsTxSummaryUpdate(queueEntry.cycleToRecordOn, queueEntry);
        for (const wrappedData of applyResponse.accountData) {
            const queueData = wrappedStates[wrappedData.accountId];
            if (queueData != null) {
                if (queueData.accountCreated) {
                    this.stateManager.partitionStats.statsDataSummaryInit(queueEntry.cycleToRecordOn, queueData.accountId, queueData.prevDataCopy, 'commit');
                }
                this.stateManager.partitionStats.statsDataSummaryUpdate(queueEntry.cycleToRecordOn, queueData.prevDataCopy, wrappedData, 'commit');
            }
            else {
                if (logFlags.error)
                    this.mainLogger.error(`commitConsensedTransaction failed to get account data for stats ${wrappedData.accountId}`);
            }
        }
        return { success: true };
    }
    updateHomeInformation(txQueueEntry: QueueEntry): void {
        let cycleShardData = this.stateManager.currentCycleShardData;
        if (Context.config.stateManager.deterministicTXCycleEnabled) {
            cycleShardData = this.stateManager.shardValuesByCycle.get(txQueueEntry.txGroupCycle);
        }
        if (cycleShardData != null && txQueueEntry.hasShardInfo === false) {
            const txId = txQueueEntry.acceptedTx.txId;
            for (const key of txQueueEntry.txKeys.allKeys) {
                if (key == null) {
                    throw new Error(`updateHomeInformation key == null ${key}`);
                }
                const homeNode = ShardFunctions.findHomeNode(cycleShardData.shardGlobals, key, cycleShardData.parititionShardDataMap);
                if (homeNode == null) {
                    throw new Error(`updateHomeInformation homeNode == null ${key}`);
                }
                txQueueEntry.homeNodes[key] = homeNode;
                if (homeNode == null) {
                    if (logFlags.verbose)
                        if (logFlags.error)
                            this.mainLogger.error(` routeAndQueueAcceptedTransaction: ${key} `);
                    throw new Error(`updateHomeInformation homeNode == null ${txQueueEntry}`);
                }
                const isGlobalAccount = this.stateManager.accountGlobals.isGlobalAccount(key);
                if (isGlobalAccount === true) {
                    txQueueEntry.involvedPartitions.push(homeNode.homePartition);
                    txQueueEntry.involvedGlobalPartitions.push(homeNode.homePartition);
                }
                else {
                    txQueueEntry.involvedPartitions.push(homeNode.homePartition);
                }
                if (logFlags.playback) {
                    const summaryObject = ShardFunctions.getHomeNodeSummaryObject(homeNode);
                    const relationString = ShardFunctions.getNodeRelation(homeNode, cycleShardData.ourNode.id);
                }
            }
            txQueueEntry.hasShardInfo = true;
        }
    }
    tryInvloveAccount(txId: string, address: string, isRead: boolean): boolean {
        const queueEntry = this.getQueueEntry(txId);
        if (queueEntry.collectedData[address]) {
            return true;
        }
        if (queueEntry.involvedReads[address] || queueEntry.involvedWrites[address]) {
            return true;
        }
        if (isRead) {
            queueEntry.involvedReads[address] = true;
        }
        else {
            queueEntry.involvedWrites[address] = true;
        }
        return true;
    }
    routeAndQueueAcceptedTransaction(acceptedTx: AcceptedTx, sendGossip = true, sender: Shardus.Node | null, globalModification: boolean, noConsensus: boolean): string | boolean {
        if (this.stateManager.accountSync.readyforTXs === false) {
            if (logFlags.verbose)
                if (logFlags.error)
                    this.mainLogger.error(`routeAndQueueAcceptedTransaction too early for TX: this.readyforTXs === false`);
            return 'notReady';
        }
        if (this.stateManager.currentCycleShardData == null) {
            if (logFlags.verbose)
                if (logFlags.error)
                    this.mainLogger.error(`routeAndQueueAcceptedTransaction too early for TX: this.stateManager.currentCycleShardData == null`);
            return 'notReady';
        }
        try {
            if (this.stateManager.accountGlobals.hasknownGlobals == false) {
                if (logFlags.verbose)
                    if (logFlags.error)
                        this.mainLogger.error(`routeAndQueueAcceptedTransaction too early for TX: hasknownGlobals == false`);
                return 'notReady';
            }
            const keysResponse = acceptedTx.keys;
            const timestamp = acceptedTx.timestamp;
            const txId = acceptedTx.txId;
            if (this.stateManager.debugNoTxVoting === true) {
                noConsensus = true;
            }
            if (configContext.stateManager.waitUpstreamTx) {
                const keysToCheck = [];
                if (acceptedTx.shardusMemoryPatterns && acceptedTx.shardusMemoryPatterns.rw) {
                    keysToCheck.push(...acceptedTx.shardusMemoryPatterns.rw);
                }
                if (acceptedTx.shardusMemoryPatterns && acceptedTx.shardusMemoryPatterns.wo) {
                    keysToCheck.push(...acceptedTx.shardusMemoryPatterns.wo);
                }
                if (keysToCheck.length === 0) {
                    const sourceKey = acceptedTx.keys.sourceKeys[0];
                    keysToCheck.push(sourceKey);
                }
                for (const key of keysToCheck) {
                    const isAccountInQueue = this.isAccountInQueue(key);
                    if (isAccountInQueue) {
                        return false;
                    }
                }
            }
            let cycleNumber = this.stateManager.currentCycleShardData.cycleNumber;
            if (Context.config.stateManager.deterministicTXCycleEnabled) {
                cycleNumber = CycleChain.getCycleNumberFromTimestamp(acceptedTx.timestamp - Context.config.stateManager.reduceTimeFromTxTimestamp, true, false);
                if (cycleNumber > this.stateManager.currentCycleShardData.cycleNumber) {
                    if (logFlags.error)
                        this.mainLogger.error(`routeAndQueueAcceptedTransaction derived txGroupCycle > currentCycleShardData.cycleNumber. txId:${txId} txGroupCycle:${cycleNumber} currentCycleShardData.cycleNumber:${this.stateManager.currentCycleShardData.cycleNumber}`);
                    if (Context.config.stateManager.fallbackToCurrentCycleFortxGroup) {
                        cycleNumber = this.stateManager.currentCycleShardData.cycleNumber;
                    }
                }
                else if (cycleNumber < this.stateManager.currentCycleShardData.cycleNumber) {
                    if (logFlags.error)
                        this.mainLogger.error(`routeAndQueueAcceptedTransaction derived txGroupCycle < currentCycleShardData.cycleNumber. txId:${txId} txGroupCycle:${cycleNumber} currentCycleShardData.cycleNumber:${this.stateManager.currentCycleShardData.cycleNumber}`);
                }
                else if (cycleNumber === this.stateManager.currentCycleShardData.cycleNumber) {
                }
            }
            this.queueEntryCounter++;
            const txQueueEntry: QueueEntry = {
                gossipedCompleteData: false,
                eligibleNodeIdsToConfirm: new Set(),
                eligibleNodeIdsToVote: new Set(),
                acceptedTx: acceptedTx,
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
                isSenderWrappedTxGroup: {}
            };
            this.txDebugMarkStartTime(txQueueEntry, 'total_queue_time');
            this.txDebugMarkStartTime(txQueueEntry, 'aging');
            const entry = this.getQueueEntrySafe(acceptedTx.txId);
            if (entry) {
                return false;
            }
            txQueueEntry.logID = utils.makeShortHash(acceptedTx.txId);
            this.stateManager.debugTXHistory[txQueueEntry.logID] = 'enteredQueue';
            if (this.app.canDebugDropTx(acceptedTx.data)) {
                if (this.stateManager.testFailChance(this.stateManager.loseTxChance, 'loseTxChance', txQueueEntry.logID, '', logFlags.verbose) === true) {
                    return 'lost';
                }
                if (this.stateManager.testFailChance(this.stateManager.voteFlipChance, 'voteFlipChance', txQueueEntry.logID, '', logFlags.verbose) === true) {
                    txQueueEntry.debugFail_voteFlip = true;
                }
                if (globalModification === false &&
                    this.stateManager.testFailChance(this.stateManager.failNoRepairTxChance, 'failNoRepairTxChance', txQueueEntry.logID, '', logFlags.verbose) === true) {
                    txQueueEntry.debugFail_failNoRepair = true;
                }
            }
            try {
                const age = shardusGetTime() - timestamp;
                const keyHash: StringBoolObjectMap = {};
                for (const key of txQueueEntry.txKeys.allKeys) {
                    if (key == null) {
                        if (logFlags.verbose)
                            if (logFlags.error)
                                this.mainLogger.error(`routeAndQueueAcceptedTransaction key == null ${timestamp} not putting tx in queue.`);
                        return false;
                    }
                    keyHash[key] = true;
                }
                txQueueEntry.uniqueKeys = Object.keys(keyHash);
                if (txQueueEntry.txKeys.allKeys == null || txQueueEntry.txKeys.allKeys.length === 0) {
                    if (logFlags.verbose)
                        if (logFlags.error)
                            this.mainLogger.error(`routeAndQueueAcceptedTransaction allKeys == null || allKeys.length === 0 ${timestamp} not putting tx in queue.`);
                    return false;
                }
                let cycleShardData = this.stateManager.currentCycleShardData;
                if (Context.config.stateManager.deterministicTXCycleEnabled) {
                    txQueueEntry.txGroupCycle = cycleNumber;
                    cycleShardData = this.stateManager.shardValuesByCycle.get(cycleNumber);
                }
                txQueueEntry.txDebug.cycleSinceActivated = cycleNumber - activeByIdOrder.find(node => node.id === Self.id).activeCycle;
                if (cycleShardData == null) {
                    if (logFlags.error)
                        this.mainLogger.error(`routeAndQueueAcceptedTransaction logID:${txQueueEntry.logID} cycleShardData == null cycle:${cycleNumber} not putting tx in queue.`);
                    return false;
                }
                this.updateHomeInformation(txQueueEntry);
                if (txQueueEntry.globalModification === false && this.executeInOneShard) {
                    txQueueEntry.executionShardKey = txQueueEntry.txKeys.allKeys[0];
                    const { homePartition } = ShardFunctions.addressToPartition(cycleShardData.shardGlobals, txQueueEntry.executionShardKey);
                    const homeShardData = cycleShardData.parititionShardDataMap.get(homePartition);
                    const unRankedExecutionGroup = homeShardData.homeNodes[0].consensusNodeForOurNodeFull.slice();
                    if (this.usePOQo) {
                        txQueueEntry.executionGroup = this.orderNodesByRank(unRankedExecutionGroup, txQueueEntry);
                    }
                    else if (this.useNewPOQ) {
                        txQueueEntry.executionGroup = this.orderNodesByRank(unRankedExecutionGroup, txQueueEntry);
                    }
                    else {
                        txQueueEntry.executionGroup = unRankedExecutionGroup;
                    }
                    txQueueEntry.executionNodeIdSorted = txQueueEntry.executionGroup.map((node) => node.id).sort();
                    if (txQueueEntry.isInExecutionHome) {
                        txQueueEntry.ourNodeRank = this.computeNodeRank(cycleShardData.ourNode.id, txQueueEntry.acceptedTx.txId, txQueueEntry.acceptedTx.timestamp);
                    }
                    const minNodesToVote = 3;
                    const voterPercentage = configContext.stateManager.voterPercentage;
                    const numberOfVoters = Math.max(minNodesToVote, Math.floor(txQueueEntry.executionGroup.length * voterPercentage));
                    txQueueEntry.eligibleNodeIdsToVote = new Set(txQueueEntry.executionGroup.slice(0, numberOfVoters).map((node) => node.id));
                    txQueueEntry.eligibleNodeIdsToConfirm = new Set(txQueueEntry.executionGroup
                        .slice(txQueueEntry.executionGroup.length - numberOfVoters)
                        .map((node) => node.id));
                    txQueueEntry.correspondingGlobalOffset = parseInt(txId.slice(-4), 16);
                    const ourID = cycleShardData.ourNode.id;
                    for (let idx = 0; idx < txQueueEntry.executionGroup.length; idx++) {
                        const node = txQueueEntry.executionGroup[idx];
                        txQueueEntry.executionGroupMap.set(node.id, node);
                        if (node.id === ourID) {
                            txQueueEntry.ourExGroupIndex = idx;
                        }
                    }
                    if (txQueueEntry.eligibleNodeIdsToConfirm.has(Self.id)) {
                    }
                    if (txQueueEntry.eligibleNodeIdsToVote.has(Self.id)) {
                    }
                    if (txQueueEntry.executionGroupMap.has(cycleShardData.ourNode.id) === false) {
                        txQueueEntry.isInExecutionHome = false;
                    }
                }
                txQueueEntry.cycleToRecordOn = CycleChain.getCycleNumberFromTimestamp(timestamp);
                if (txQueueEntry.cycleToRecordOn < 0) {
                    if (logFlags.verbose)
                        if (logFlags.error)
                            this.mainLogger.error(`routeAndQueueAcceptedTransaction failed to calculate cycle ${timestamp} error code:${txQueueEntry.cycleToRecordOn}`);
                    return false;
                }
                if (txQueueEntry.cycleToRecordOn == null) {
                    this.statemanager_fatal(`routeAndQueueAcceptedTransaction cycleToRecordOn==null`, `routeAndQueueAcceptedTransaction cycleToRecordOn==null  ${txQueueEntry.logID} ${timestamp}`);
                }
                for (const key of txQueueEntry.uniqueKeys) {
                    if (globalModification === true) {
                        if (this.stateManager.accountGlobals.isGlobalAccount(key)) {
                        }
                        else {
                            this.stateManager.accountGlobals.setGlobalAccount(key);
                        }
                    }
                }
                txQueueEntry.queuedBeforeMainSyncComplete = this.stateManager.accountSync.dataSyncMainPhaseComplete;
                if (age > this.stateManager.queueSitTime * 0.9) {
                    if (txQueueEntry.didSync === true) {
                    }
                    else {
                        if (txQueueEntry.queuedBeforeMainSyncComplete) {
                            this.statemanager_fatal(`routeAndQueueAcceptedTransaction_olderTX`, 'routeAndQueueAcceptedTransaction working on older tx ' + timestamp + ' age: ' + age);
                        }
                    }
                }
                for (const key of txQueueEntry.uniqueKeys) {
                    const isGlobalAcc = this.stateManager.accountGlobals.isGlobalAccount(key);
                    if (globalModification === true && isGlobalAcc === true) {
                        txQueueEntry.uniqueWritableKeys.push(key);
                    }
                    if (globalModification === false && isGlobalAcc === false) {
                        txQueueEntry.uniqueWritableKeys.push(key);
                    }
                }
                txQueueEntry.uniqueWritableKeys.sort();
                if (txQueueEntry.hasShardInfo) {
                    const transactionGroup = this.queueEntryGetTransactionGroup(txQueueEntry);
                    if (txQueueEntry.ourNodeInTransactionGroup || txQueueEntry.didSync === true) {
                        this.queueEntryGetConsensusGroup(txQueueEntry);
                        for (const accountId of txQueueEntry.uniqueKeys) {
                            const homeNodeShardData = txQueueEntry.homeNodes[accountId];
                            const consensusGroupForAccount = homeNodeShardData.consensusNodeForOurNodeFull.map(n => n.id);
                            const startAndEndIndices = this.getStartAndEndIndexOfTargetGroup(consensusGroupForAccount, txQueueEntry.transactionGroup);
                            const isWrapped = startAndEndIndices.endIndex < startAndEndIndices.startIndex;
                            if (isWrapped === false)
                                continue;
                            const unwrappedEndIndex = startAndEndIndices.endIndex + txQueueEntry.transactionGroup.length;
                            for (let i = startAndEndIndices.startIndex; i < unwrappedEndIndex; i++) {
                                if (i >= txQueueEntry.transactionGroup.length) {
                                    const wrappedIndex = i - txQueueEntry.transactionGroup.length;
                                    txQueueEntry.isSenderWrappedTxGroup[txQueueEntry.transactionGroup[wrappedIndex].id] = i;
                                }
                            }
                        }
                    }
                    if (sendGossip && txQueueEntry.globalModification === false) {
                        try {
                            if (transactionGroup.length > 1) {
                                this.stateManager.debugNodeGroup(txId, timestamp, `share to neighbors`, transactionGroup);
                                this.p2p.sendGossipIn('spread_tx_to_group', acceptedTx, '', sender, transactionGroup, true, -1, acceptedTx.txId);
                                this.addOriginalTxDataToForward(txQueueEntry);
                            }
                        }
                        catch (ex) {
                            this.statemanager_fatal(`txQueueEntry_ex`, 'txQueueEntry: ' + utils.stringifyReduce(txQueueEntry));
                        }
                    }
                    if (txQueueEntry.didSync === false) {
                        if (txQueueEntry.ourNodeInTransactionGroup === false &&
                            txQueueEntry.globalModification === false) {
                            return 'out of range';
                        }
                        else {
                            if (this.config.debug.forwardTXToSyncingNeighbors &&
                                cycleShardData.hasSyncingNeighbors === true) {
                                let send_spread_tx_to_group_syncing = true;
                                if (txQueueEntry.ourNodeInTransactionGroup === false) {
                                    send_spread_tx_to_group_syncing = false;
                                }
                                else if (txQueueEntry.ourTXGroupIndex > 0) {
                                    const everyN = Math.max(1, Math.floor(txQueueEntry.transactionGroup.length * 0.4));
                                    const nonce = parseInt('0x' + txQueueEntry.acceptedTx.txId.substring(0, 2));
                                    const idxPlusNonce = txQueueEntry.ourTXGroupIndex + nonce;
                                    const idxModEveryN = idxPlusNonce % everyN;
                                    if (idxModEveryN > 0) {
                                        send_spread_tx_to_group_syncing = false;
                                    }
                                }
                                if (send_spread_tx_to_group_syncing) {
                                    if (txQueueEntry.globalModification === false) {
                                        this.stateManager.debugNodeGroup(txId, timestamp, `share to syncing neighbors`, cycleShardData.syncingNeighborsTxGroup);
                                        if (logFlags.seqdiagram) {
                                            for (const node of cycleShardData.syncingNeighborsTxGroup) {
                                            }
                                        }
                                        const request = acceptedTx as SpreadTxToGroupSyncingReq;
                                        this.p2p.tellBinary<SpreadTxToGroupSyncingReq>(cycleShardData.syncingNeighborsTxGroup, InternalRouteEnum.binary_spread_tx_to_group_syncing, request, serializeSpreadTxToGroupSyncingReq, {});
                                    }
                                    else {
                                    }
                                }
                            }
                        }
                    }
                }
                else {
                    throw new Error('missing shard info');
                }
                this.computeTxSieveTime(txQueueEntry);
                if (this.config.debug.useShardusMemoryPatterns &&
                    acceptedTx.shardusMemoryPatterns != null &&
                    acceptedTx.shardusMemoryPatterns.ro != null) {
                    txQueueEntry.shardusMemoryPatternSets = {
                        ro: new Set(acceptedTx.shardusMemoryPatterns.ro),
                        rw: new Set(acceptedTx.shardusMemoryPatterns.rw),
                        wo: new Set(acceptedTx.shardusMemoryPatterns.wo),
                        on: new Set(acceptedTx.shardusMemoryPatterns.on),
                        ri: new Set(acceptedTx.shardusMemoryPatterns.ri),
                    };
                }
                else {
                }
                this.queueEntryPrePush(txQueueEntry);
                this.pendingTransactionQueue.push(txQueueEntry);
                this.pendingTransactionQueueByID.set(txQueueEntry.acceptedTx.txId, txQueueEntry);
                this.stateManager.tryStartTransactionProcessingQueue();
            }
            catch (error) {
                this.statemanager_fatal(`routeAndQueueAcceptedTransaction_ex`, 'routeAndQueueAcceptedTransaction failed: ' + errorToStringFull(error));
                throw new Error(error);
            }
            return true;
        }
        finally {
        }
    }
    async queueEntryPrePush(txQueueEntry: QueueEntry): Promise<void> {
        if (this.config.features.enableRIAccountsCache &&
            txQueueEntry.shardusMemoryPatternSets &&
            txQueueEntry.shardusMemoryPatternSets.ri &&
            txQueueEntry.shardusMemoryPatternSets.ri.size > 0) {
            for (const key of txQueueEntry.shardusMemoryPatternSets.ri) {
                const accountData = await this.stateManager.getLocalOrRemoteAccount(key, {
                    useRICache: true,
                });
                if (accountData != null) {
                    this.app.setCachedRIAccountData([accountData]);
                    this.queueEntryAddData(txQueueEntry, {
                        accountId: accountData.accountId,
                        stateId: accountData.stateId,
                        data: accountData.data,
                        timestamp: accountData.timestamp,
                        syncData: accountData.syncData,
                        accountCreated: false,
                        isPartial: false,
                    }, false);
                }
            }
        }
    }
    getQueueEntry(txid: string): QueueEntry | null {
        const queueEntry = this._transactionQueueByID.get(txid);
        if (queueEntry === undefined) {
            return null;
        }
        return queueEntry;
    }
    getQueueEntrySafe(txid: string): QueueEntry | null {
        let queueEntry = this._transactionQueueByID.get(txid);
        if (queueEntry === undefined) {
            queueEntry = this.pendingTransactionQueueByID.get(txid);
            if (queueEntry === undefined) {
                return null;
            }
        }
        return queueEntry;
    }
    getQueueEntryArchived(txid: string, msg: string): QueueEntry | null {
        const queueEntry = this.archivedQueueEntriesByID.get(txid);
        if (queueEntry != null) {
            return queueEntry;
        }
        if (logFlags.error)
            this.mainLogger.error(`getQueueEntryArchived failed to find: ${utils.stringifyReduce(txid)} ${msg} dbg:${this.stateManager.debugTXHistory[utils.stringifyReduce(txid)]}`);
        return null;
    }
    getArchivedQueueEntryByAccountIdAndHash(accountId: string, hash: string, msg: string): QueueEntry | null {
        try {
            let foundQueueEntry = false;
            let foundVote = false;
            let foundVoteMatchingHash = false;
            for (const queueEntry of this.archivedQueueEntriesByID.values()) {
                if (queueEntry.uniqueKeys.includes(accountId)) {
                    foundQueueEntry = true;
                    const signedReceipt: SignedReceipt = this.stateManager.getSignedReceipt(queueEntry);
                    let proposal: Proposal | null = null;
                    if (signedReceipt != null) {
                        proposal = signedReceipt.proposal;
                    }
                    if (proposal == null) {
                        proposal = queueEntry.ourProposal;
                    }
                    if (proposal == null) {
                        continue;
                    }
                    foundVote = true;
                    for (let i = 0; i < proposal.accountIDs.length; i++) {
                        if (proposal.accountIDs[i] === accountId) {
                            if (proposal.afterStateHashes[i] === hash) {
                                foundVoteMatchingHash = true;
                                return queueEntry;
                            }
                        }
                    }
                }
            }
            return null;
        }
        catch (e) {
            this.statemanager_fatal(`getArchivedQueueEntryByAccountIdAndHash`, `error: ${e.message}`);
            return null;
        }
    }
    getQueueEntryArchivedByTimestamp(timestamp: number, msg: string): QueueEntry | null {
        for (const queueEntry of this.archivedQueueEntriesByID.values()) {
            if (queueEntry.acceptedTx.timestamp === timestamp) {
                return queueEntry;
            }
        }
        return null;
    }
    queueEntryAddData(queueEntry: QueueEntry, data: Shardus.WrappedResponse, signatureCheck = false): void {
        if (queueEntry.uniqueKeys == null) {
            throw new Error(`Attempting to add data and uniqueKeys are not available yet: ${utils.stringifyReduceLimit(queueEntry, 200)}`);
        }
        if (queueEntry.collectedData[data.accountId] != null) {
            if (configContext.stateManager.collectedDataFix) {
                const existingData = queueEntry.collectedData[data.accountId];
                if (data.timestamp > existingData.timestamp) {
                    queueEntry.collectedData[data.accountId] = data;
                }
                else {
                    return;
                }
            }
            else {
                return;
            }
        }
        if (signatureCheck && (data.sign == null || data.sign.owner == null || data.sign.sig == null)) {
            this.mainLogger.fatal(`queueEntryAddData: data.sign == null ${utils.stringifyReduce(data)}`);
            return;
        }
        if (signatureCheck) {
            const dataSenderPublicKey = data.sign.owner;
            const dataSenderNode: Shardus.Node = byPubKey[dataSenderPublicKey];
            if (dataSenderNode == null) {
                return;
            }
            const consensusNodesForAccount = queueEntry.homeNodes[data.accountId]?.consensusNodeForOurNodeFull;
            if (consensusNodesForAccount == null || consensusNodesForAccount.map(n => n.id).includes(dataSenderNode.id) === false) {
                return;
            }
            const singedData = data as SignedObject;
            if (this.crypto.verify(singedData) === false) {
                return;
            }
        }
        queueEntry.collectedData[data.accountId] = data;
        queueEntry.dataCollected = Object.keys(queueEntry.collectedData).length;
        queueEntry.originalData[data.accountId] = Utils.safeJsonParse(Utils.safeStringify(data));
        queueEntry.beforeHashes[data.accountId] = data.stateId;
        if (queueEntry.dataCollected === queueEntry.uniqueKeys.length) {
            queueEntry.hasAll = true;
            if (queueEntry.executionGroup && queueEntry.executionGroup.length > 1)
                this.shareCompleteDataToNeighbours(queueEntry);
            if (logFlags.debug || this.stateManager.consensusLog) {
            }
        }
        if (data.localCache) {
            queueEntry.localCachedData[data.accountId] = data.localCache;
            delete data.localCache;
        }
    }
    async shareCompleteDataToNeighbours(queueEntry: QueueEntry): Promise<void> {
        if (configContext.stateManager.shareCompleteData === false) {
            return;
        }
        if (queueEntry.hasAll === false || queueEntry.sharedCompleteData) {
            return;
        }
        if (queueEntry.isInExecutionHome === false) {
            return;
        }
        const dataToShare: WrappedResponses = {};
        const stateList: Shardus.WrappedResponse[] = [];
        for (const accountId in queueEntry.collectedData) {
            const data = queueEntry.collectedData[accountId];
            const riCacheResult = await this.app.getCachedRIAccountData([accountId]);
            if (riCacheResult != null && riCacheResult.length > 0) {
                continue;
            }
            else {
                dataToShare[accountId] = data;
                stateList.push(data);
            }
        }
        const payload = { txid: queueEntry.acceptedTx.txId, stateList };
        const neighboursNodes = utils.selectNeighbors(queueEntry.executionGroup, queueEntry.ourExGroupIndex, 2);
        if (stateList.length > 0) {
            this.broadcastState(neighboursNodes, payload, "shareCompleteDataToNeighbours");
            queueEntry.sharedCompleteData = true;
            if (logFlags.debug || this.stateManager.consensusLog) {
            }
        }
    }
    async gossipCompleteData(queueEntry: QueueEntry): Promise<void> {
        if (queueEntry.hasAll === false || queueEntry.gossipedCompleteData) {
            return;
        }
        if (configContext.stateManager.gossipCompleteData === false) {
            return;
        }
        const dataToGossip: WrappedResponses = {};
        const stateList: Shardus.WrappedResponse[] = [];
        for (const accountId in queueEntry.collectedData) {
            const data = queueEntry.collectedData[accountId];
            const riCacheResult = await this.app.getCachedRIAccountData([accountId]);
            if (riCacheResult != null && riCacheResult.length > 0) {
                continue;
            }
            else {
                dataToGossip[accountId] = data;
                stateList.push(data);
            }
        }
        const payload = { txid: queueEntry.acceptedTx.txId, stateList };
        if (stateList.length > 0) {
            Comms.sendGossip('broadcast_state_complete_data', payload, '', Self.id, queueEntry.executionGroup, true, 6, queueEntry.acceptedTx.txId);
            queueEntry.gossipedCompleteData = true;
            if (logFlags.debug || this.stateManager.consensusLog) {
            }
        }
    }
    queueEntryHasAllData(queueEntry: QueueEntry): boolean {
        if (queueEntry.hasAll === true) {
            return true;
        }
        if (queueEntry.uniqueKeys == null) {
            throw new Error(`queueEntryHasAllData (queueEntry.uniqueKeys == null)`);
        }
        let dataCollected = 0;
        for (const key of queueEntry.uniqueKeys) {
            if (queueEntry.collectedData[key] != null) {
                dataCollected++;
            }
        }
        if (dataCollected === queueEntry.uniqueKeys.length) {
            queueEntry.hasAll = true;
            return true;
        }
        return false;
    }
    queueEntryListMissingData(queueEntry: QueueEntry): string[] {
        if (queueEntry.hasAll === true) {
            return [];
        }
        if (queueEntry.uniqueKeys == null) {
            throw new Error(`queueEntryListMissingData (queueEntry.uniqueKeys == null)`);
        }
        const missingAccounts = [];
        for (const key of queueEntry.uniqueKeys) {
            if (queueEntry.collectedData[key] == null) {
                missingAccounts.push(key);
            }
        }
        return missingAccounts;
    }
    async queueEntryRequestMissingData(queueEntry: QueueEntry): Promise<void> {
        if (this.stateManager.currentCycleShardData == null) {
            return;
        }
        if (queueEntry.pendingDataRequest === true) {
            return;
        }
        queueEntry.pendingDataRequest = true;
        if (!queueEntry.requests) {
            queueEntry.requests = {};
        }
        if (queueEntry.uniqueKeys == null) {
            throw new Error('queueEntryRequestMissingData queueEntry.uniqueKeys == null');
        }
        const allKeys = [];
        for (const key of queueEntry.uniqueKeys) {
            if (queueEntry.collectedData[key] == null) {
                allKeys.push(key);
            }
        }
        for (const key of queueEntry.uniqueKeys) {
            if (queueEntry.collectedData[key] == null && queueEntry.requests[key] == null) {
                let keepTrying = true;
                let triesLeft = 5;
                while (keepTrying) {
                    if (triesLeft <= 0) {
                        keepTrying = false;
                        break;
                    }
                    triesLeft--;
                    const homeNodeShardData = queueEntry.homeNodes[key];
                    let node = null;
                    let randomIndex: number;
                    let foundValidNode = false;
                    let maxTries = 1000;
                    while (foundValidNode == false) {
                        maxTries--;
                        randomIndex = this.stateManager.getRandomInt(homeNodeShardData.consensusNodeForOurNodeFull.length - 1);
                        node = homeNodeShardData.consensusNodeForOurNodeFull[randomIndex];
                        if (maxTries < 0) {
                            this.statemanager_fatal(`queueEntryRequestMissingData`, `queueEntryRequestMissingData: unable to find node to ask after 1000 tries tx:${queueEntry.logID} key: ${utils.makeShortHash(key)} ${utils.stringifyReduce(homeNodeShardData.consensusNodeForOurNodeFull.map((x) => (x != null ? x.id : 'null')))}`);
                            break;
                        }
                        if (node == null) {
                            continue;
                        }
                        if (node.id === this.stateManager.currentCycleShardData.nodeShardData.node.id) {
                            continue;
                        }
                        foundValidNode = true;
                    }
                    if (node == null) {
                        continue;
                    }
                    if (node.status != 'active' || potentiallyRemoved.has(node.id)) {
                        continue;
                    }
                    if (node === this.stateManager.currentCycleShardData.ourNode) {
                        continue;
                    }
                    for (const key2 of allKeys) {
                        queueEntry.requests[key2] = node;
                    }
                    const relationString = ShardFunctions.getNodeRelation(homeNodeShardData, this.stateManager.currentCycleShardData.ourNode.id);
                    if (this.stateManager.isNodeValidForInternalMessage(node.id, 'queueEntryRequestMissingData', true, true) === false) {
                        continue;
                    }
                    const message = {
                        keys: allKeys,
                        txid: queueEntry.acceptedTx.txId,
                        timestamp: queueEntry.acceptedTx.timestamp,
                    };
                    let result = null;
                    try {
                        result = (await this.p2p.askBinary<RequestStateForTxReq, RequestStateForTxRespSerialized>(node, InternalRouteEnum.binary_request_state_for_tx, message, serializeRequestStateForTxReq, deserializeRequestStateForTxResp, {})) as RequestStateForTxRespSerialized;
                    }
                    catch (error) {
                        if (logFlags.error) {
                            if (error instanceof ResponseError) {
                                this.mainLogger.error(`ASK FAIL request_state_for_tx : exception encountered where the error is ${error}`);
                            }
                        }
                        if (logFlags.error)
                            this.mainLogger.error('askBinary request_state_for_tx exception:', error);
                        if (logFlags.error)
                            this.mainLogger.error(`askBinary error: ${InternalRouteEnum.binary_request_state_for_tx} asked to ${node.externalIp}:${node.externalPort}:${node.id}`);
                    }
                    if (result == null) {
                        if (logFlags.verbose) {
                            if (logFlags.error)
                                this.mainLogger.error('ASK FAIL request_state_for_tx');
                        }
                        continue;
                    }
                    if (result.success !== true) {
                        if (logFlags.error)
                            this.mainLogger.error('ASK FAIL queueEntryRequestMissingData 9');
                        continue;
                    }
                    let dataCountReturned = 0;
                    const accountIdsReturned = [];
                    for (const data of result.stateList) {
                        this.queueEntryAddData(queueEntry, data);
                        dataCountReturned++;
                        accountIdsReturned.push(utils.makeShortHash(data.accountId));
                    }
                    if (queueEntry.hasAll === true) {
                        queueEntry.logstate = 'got all missing data';
                    }
                    else {
                        queueEntry.logstate = 'failed to get data:' + queueEntry.hasAll;
                    }
                    for (const key2 of allKeys) {
                        delete queueEntry.requests[key2];
                    }
                    if (queueEntry.hasAll === true) {
                        break;
                    }
                    keepTrying = false;
                }
            }
        }
        if (queueEntry.hasAll === true) {
        }
        else {
            queueEntry.waitForReceiptOnly = true;
            if (this.config.stateManager.txStateMachineChanges) {
                this.updateTxState(queueEntry, 'await final data', 'missing data');
            }
            else {
                this.updateTxState(queueEntry, 'consensing');
            }
        }
    }
    async queueEntryRequestMissingReceipt(queueEntry: QueueEntry): Promise<void> {
        if (this.stateManager.currentCycleShardData == null) {
            return;
        }
        if (queueEntry.uniqueKeys == null) {
            throw new Error('queueEntryRequestMissingReceipt queueEntry.uniqueKeys == null');
        }
        if (queueEntry.requestingReceipt === true) {
            return;
        }
        queueEntry.requestingReceipt = true;
        queueEntry.receiptEverRequested = true;
        const consensusGroup = this.queueEntryGetConsensusGroup(queueEntry);
        this.stateManager.debugNodeGroup(queueEntry.acceptedTx.txId, queueEntry.acceptedTx.timestamp, `queueEntryRequestMissingReceipt`, consensusGroup);
        let gotReceipt = false;
        for (const key of queueEntry.uniqueKeys) {
            if (gotReceipt === true) {
                break;
            }
            let keepTrying = true;
            let triesLeft = Math.min(5, consensusGroup.length);
            let nodeIndex = 0;
            while (keepTrying) {
                if (triesLeft <= 0) {
                    keepTrying = false;
                    break;
                }
                triesLeft--;
                const homeNodeShardData = queueEntry.homeNodes[key];
                const node = consensusGroup[nodeIndex];
                nodeIndex++;
                if (node == null) {
                    continue;
                }
                if (node.status != 'active' || potentiallyRemoved.has(node.id)) {
                    continue;
                }
                if (node === this.stateManager.currentCycleShardData.ourNode) {
                    continue;
                }
                const relationString = ShardFunctions.getNodeRelation(homeNodeShardData, this.stateManager.currentCycleShardData.ourNode.id);
                if (this.stateManager.isNodeValidForInternalMessage(node.id, 'queueEntryRequestMissingReceipt', true, true) === false) {
                    continue;
                }
                const message = { txid: queueEntry.acceptedTx.txId, timestamp: queueEntry.acceptedTx.timestamp };
                let result = null;
                try {
                    result = await this.p2p.askBinary<RequestReceiptForTxReqSerialized, RequestReceiptForTxRespSerialized>(node, InternalRouteEnum.binary_request_receipt_for_tx, message, serializeRequestReceiptForTxReq, deserializeRequestReceiptForTxResp, {});
                }
                catch (e) {
                    this.statemanager_fatal(`queueEntryRequestMissingReceipt`, `error: ${e.message}`);
                    this.mainLogger.error(`askBinary error: ${InternalRouteEnum.binary_request_receipt_for_tx} asked to ${node.externalIp}:${node.externalPort}:${node.id}`);
                }
                if (result == null) {
                    if (logFlags.verbose) {
                        if (logFlags.error)
                            this.mainLogger.error(`ASK FAIL request_receipt_for_tx ${triesLeft} ${utils.makeShortHash(node.id)}`);
                    }
                    continue;
                }
                if (result.success !== true) {
                    if (logFlags.error)
                        this.mainLogger.error(`ASK FAIL queueEntryRequestMissingReceipt 9 ${triesLeft} ${utils.makeShortHash(node.id)}:${utils.makeShortHash(node.internalPort)} note:${result.note} txid:${queueEntry.logID}`);
                    continue;
                }
                if (result.success === true && result.receipt != null) {
                    queueEntry.receivedSignedReceipt = result.receipt;
                    keepTrying = false;
                    gotReceipt = true;
                }
            }
            if (keepTrying == false) {
                break;
            }
        }
        queueEntry.requestingReceipt = false;
        if (gotReceipt === false) {
            queueEntry.requestingReceiptFailed = true;
        }
    }
    computeNodeRank(nodeId: string, txId: string, txTimestamp: number): bigint {
        if (nodeId == null || txId == null || txTimestamp == null)
            return BigInt(0);
        const hash = this.crypto.hash([txId, txTimestamp]);
        return BigInt(XOR(nodeId, hash));
    }
    orderNodesByRank(nodeList: Shardus.Node[], queueEntry: QueueEntry): Shardus.NodeWithRank[] {
        const nodeListWithRankData: Shardus.NodeWithRank[] = [];
        for (let i = 0; i < nodeList.length; i++) {
            const node: Shardus.Node = nodeList[i];
            const rank = this.computeNodeRank(node.id, queueEntry.acceptedTx.txId, queueEntry.acceptedTx.timestamp);
            const nodeWithRank: Shardus.NodeWithRank = {
                rank,
                id: node.id,
                status: node.status,
                publicKey: node.publicKey,
                externalIp: node.externalIp,
                externalPort: node.externalPort,
                internalIp: node.internalIp,
                internalPort: node.internalPort,
            };
            nodeListWithRankData.push(nodeWithRank);
        }
        return nodeListWithRankData.sort((a: Shardus.NodeWithRank, b: Shardus.NodeWithRank) => {
            return b.rank > a.rank ? 1 : -1;
        });
    }
    queueEntryGetTransactionGroup(queueEntry: QueueEntry, tryUpdate = false): Shardus.Node[] {
        let cycleShardData = this.stateManager.currentCycleShardData;
        if (Context.config.stateManager.deterministicTXCycleEnabled) {
            cycleShardData = this.stateManager.shardValuesByCycle.get(queueEntry.txGroupCycle);
        }
        if (cycleShardData == null) {
            throw new Error('queueEntryGetTransactionGroup: currentCycleShardData == null');
        }
        if (queueEntry.uniqueKeys == null) {
            throw new Error('queueEntryGetTransactionGroup: queueEntry.uniqueKeys == null');
        }
        if (queueEntry.transactionGroup != null && tryUpdate != true) {
            return queueEntry.transactionGroup;
        }
        const txGroup: Shardus.Node[] = [];
        const uniqueNodes: StringNodeObjectMap = {};
        let hasNonGlobalKeys = false;
        for (const key of queueEntry.uniqueKeys) {
            const homeNode = queueEntry.homeNodes[key];
            if (homeNode == null) {
            }
            if (homeNode.extendedData === false) {
                ShardFunctions.computeExtendedNodePartitionData(cycleShardData.shardGlobals, cycleShardData.nodeShardDataMap, cycleShardData.parititionShardDataMap, homeNode, cycleShardData.nodes);
            }
            if (queueEntry.globalModification === false) {
                if (this.stateManager.accountGlobals.isGlobalAccount(key) === true) {
                    continue;
                }
                else {
                    hasNonGlobalKeys = true;
                }
            }
            for (const node of homeNode.nodeThatStoreOurParitionFull) {
                uniqueNodes[node.id] = node;
            }
            const scratch1 = {};
            for (const node of homeNode.nodeThatStoreOurParitionFull) {
                scratch1[node.id] = true;
            }
            uniqueNodes[homeNode.node.id] = homeNode.node;
            const { homePartition } = ShardFunctions.addressToPartition(cycleShardData.shardGlobals, key);
            if (homePartition != homeNode.homePartition) {
                for (const nodeID of cycleShardData.nodeShardDataMap.keys()) {
                    const nodeShardData: StateManagerTypes.shardFunctionTypes.NodeShardData = cycleShardData.nodeShardDataMap.get(nodeID);
                    const nodeStoresThisPartition = ShardFunctions.testInRange(homePartition, nodeShardData.storedPartitions);
                    if (nodeStoresThisPartition === true && uniqueNodes[nodeID] == null) {
                        uniqueNodes[nodeID] = nodeShardData.node;
                        queueEntry.patchedOnNodes.set(nodeID, nodeShardData);
                    }
                    if (nodeStoresThisPartition === true) {
                        if (scratch1[nodeID] == null) {
                            homeNode.patchedOnNodes.push(nodeShardData.node);
                            scratch1[nodeID] = true;
                        }
                    }
                }
            }
            if (queueEntry.globalModification === false &&
                this.executeInOneShard &&
                key === queueEntry.executionShardKey) {
                const executionKeys = [];
                if (logFlags.verbose) {
                    for (const node of queueEntry.executionGroup) {
                        executionKeys.push(utils.makeShortHash(node.id) + `:${node.externalPort}`);
                    }
                }
            }
        }
        queueEntry.ourNodeInTransactionGroup = true;
        if (uniqueNodes[cycleShardData.ourNode.id] == null) {
            queueEntry.ourNodeInTransactionGroup = false;
        }
        uniqueNodes[cycleShardData.ourNode.id] =
            cycleShardData.ourNode;
        const values = Object.values(uniqueNodes);
        for (const v of values) {
            txGroup.push(v);
        }
        txGroup.sort(this.stateManager._sortByIdAsc);
        if (queueEntry.ourNodeInTransactionGroup) {
            const ourID = cycleShardData.ourNode.id;
            for (let idx = 0; idx < txGroup.length; idx++) {
                const node = txGroup[idx];
                if (node.id === ourID) {
                    queueEntry.ourTXGroupIndex = idx;
                    break;
                }
            }
        }
        if (tryUpdate != true) {
            if (Context.config.stateManager.deterministicTXCycleEnabled === false) {
                queueEntry.txGroupCycle = this.stateManager.currentCycleShardData.cycleNumber;
            }
            queueEntry.transactionGroup = txGroup;
        }
        else {
            queueEntry.updatedTxGroupCycle = this.stateManager.currentCycleShardData.cycleNumber;
            queueEntry.transactionGroup = txGroup;
        }
        return txGroup;
    }
    queueEntryGetConsensusGroup(queueEntry: QueueEntry): Shardus.Node[] {
        let cycleShardData = this.stateManager.currentCycleShardData;
        if (Context.config.stateManager.deterministicTXCycleEnabled) {
            cycleShardData = this.stateManager.shardValuesByCycle.get(queueEntry.txGroupCycle);
        }
        if (cycleShardData == null) {
            throw new Error('queueEntryGetConsensusGroup: currentCycleShardData == null');
        }
        if (queueEntry.uniqueKeys == null) {
            throw new Error('queueEntryGetConsensusGroup: queueEntry.uniqueKeys == null');
        }
        if (queueEntry.conensusGroup != null) {
            return queueEntry.conensusGroup;
        }
        const txGroup = [];
        const uniqueNodes: StringNodeObjectMap = {};
        let hasNonGlobalKeys = false;
        for (const key of queueEntry.uniqueKeys) {
            const homeNode = queueEntry.homeNodes[key];
            if (homeNode == null) {
            }
            if (homeNode.extendedData === false) {
                ShardFunctions.computeExtendedNodePartitionData(cycleShardData.shardGlobals, cycleShardData.nodeShardDataMap, cycleShardData.parititionShardDataMap, homeNode, cycleShardData.nodes);
            }
            if (queueEntry.globalModification === false) {
                if (this.stateManager.accountGlobals.isGlobalAccount(key) === true) {
                    continue;
                }
                else {
                    hasNonGlobalKeys = true;
                }
            }
            for (const node of homeNode.consensusNodeForOurNodeFull) {
                uniqueNodes[node.id] = node;
            }
            uniqueNodes[homeNode.node.id] = homeNode.node;
        }
        queueEntry.ourNodeInConsensusGroup = true;
        if (uniqueNodes[cycleShardData.ourNode.id] == null) {
            queueEntry.ourNodeInConsensusGroup = false;
        }
        uniqueNodes[cycleShardData.ourNode.id] =
            cycleShardData.ourNode;
        const values = Object.values(uniqueNodes);
        for (const v of values) {
            txGroup.push(v);
        }
        queueEntry.conensusGroup = txGroup;
        return txGroup;
    }
    queueEntryGetConsensusGroupForAccount(queueEntry: QueueEntry, accountId: string): Shardus.Node[] {
        let cycleShardData = this.stateManager.currentCycleShardData;
        if (Context.config.stateManager.deterministicTXCycleEnabled) {
            cycleShardData = this.stateManager.shardValuesByCycle.get(queueEntry.txGroupCycle);
        }
        if (cycleShardData == null) {
            throw new Error('queueEntryGetConsensusGroup: currentCycleShardData == null');
        }
        if (queueEntry.uniqueKeys == null) {
            throw new Error('queueEntryGetConsensusGroup: queueEntry.uniqueKeys == null');
        }
        if (queueEntry.conensusGroup != null) {
            return queueEntry.conensusGroup;
        }
        if (queueEntry.uniqueKeys.includes(accountId) === false) {
            throw new Error(`queueEntryGetConsensusGroup: account ${accountId} is not in the queueEntry.uniqueKeys`);
        }
        const txGroup = [];
        const uniqueNodes: StringNodeObjectMap = {};
        let hasNonGlobalKeys = false;
        const key = accountId;
        const homeNode = queueEntry.homeNodes[key];
        if (homeNode == null) {
        }
        if (homeNode.extendedData === false) {
            ShardFunctions.computeExtendedNodePartitionData(cycleShardData.shardGlobals, cycleShardData.nodeShardDataMap, cycleShardData.parititionShardDataMap, homeNode, cycleShardData.nodes);
        }
        if (queueEntry.globalModification === false) {
            if (this.stateManager.accountGlobals.isGlobalAccount(key) === true) {
            }
            else {
                hasNonGlobalKeys = true;
            }
        }
        for (const node of homeNode.consensusNodeForOurNodeFull) {
            uniqueNodes[node.id] = node;
        }
        uniqueNodes[homeNode.node.id] = homeNode.node;
        queueEntry.ourNodeInConsensusGroup = true;
        if (uniqueNodes[cycleShardData.ourNode.id] == null) {
            queueEntry.ourNodeInConsensusGroup = false;
        }
        uniqueNodes[cycleShardData.ourNode.id] = cycleShardData.ourNode;
        const values = Object.values(uniqueNodes);
        for (const v of values) {
            txGroup.push(v);
        }
        return txGroup;
    }
    async broadcastState(nodes: Shardus.Node[], message: {
        stateList: Shardus.WrappedResponse[];
        txid: string;
    }, context: string): Promise<void> {
        const request = message as BroadcastStateReq;
        if (logFlags.seqdiagram) {
            for (const node of nodes) {
                if (context == "tellCorrespondingNodes") {
                }
                else {
                }
            }
        }
        this.p2p.tellBinary<BroadcastStateReq>(nodes, InternalRouteEnum.binary_broadcast_state, request, serializeBroadcastStateReq, {
            verification_data: verificationDataCombiner(message.txid, message.stateList.length.toString(), request.stateList[0].accountId),
        });
    }
    async tellCorrespondingNodes(queueEntry: QueueEntry): Promise<unknown> {
        if (this.stateManager.currentCycleShardData == null) {
            throw new Error('tellCorrespondingNodes: currentCycleShardData == null');
        }
        if (queueEntry.uniqueKeys == null) {
            throw new Error('tellCorrespondingNodes: queueEntry.uniqueKeys == null');
        }
        const ourNodeData = this.stateManager.currentCycleShardData.nodeShardData;
        let correspondingAccNodes: Shardus.Node[] = [];
        const dataKeysWeHave = [];
        const dataValuesWeHave = [];
        const datas: {
            [accountID: string]: Shardus.WrappedResponse;
        } = {};
        const remoteShardsByKey: {
            [accountID: string]: StateManagerTypes.shardFunctionTypes.NodeShardData;
        } = {};
        let loggedPartition = false;
        for (const key of queueEntry.uniqueKeys) {
            let hasKey = false;
            const homeNode = queueEntry.homeNodes[key];
            if (homeNode.node.id === ourNodeData.node.id) {
                hasKey = true;
            }
            else {
                for (const node of homeNode.nodeThatStoreOurParitionFull) {
                    if (node.id === ourNodeData.node.id) {
                        hasKey = true;
                        break;
                    }
                }
            }
            if (queueEntry.patchedOnNodes.has(ourNodeData.node.id)) {
                hasKey = true;
            }
            let isGlobalKey = false;
            if (this.stateManager.accountGlobals.isGlobalAccount(key)) {
                hasKey = true;
                isGlobalKey = true;
            }
            if (hasKey === false) {
                if (loggedPartition === false) {
                    loggedPartition = true;
                }
            }
            if (hasKey) {
                this.setDebugLastAwaitedCallInner('this.stateManager.transactionQueue.app.getRelevantData');
                let data = await this.app.getRelevantData(key, queueEntry.acceptedTx.data, queueEntry.acceptedTx.appData);
                this.setDebugLastAwaitedCallInner('this.stateManager.transactionQueue.app.getRelevantData', DebugComplete.Completed);
                if (data.accountCreated == false) {
                    data = utils.deepCopy(data);
                }
                if (isGlobalKey === false) {
                    datas[key] = data;
                    dataKeysWeHave.push(key);
                    dataValuesWeHave.push(data);
                }
                queueEntry.localKeys[key] = true;
                this.queueEntryAddData(queueEntry, data, false);
            }
            else {
                remoteShardsByKey[key] = queueEntry.homeNodes[key];
            }
        }
        if (queueEntry.globalModification === true) {
            return;
        }
        let message: {
            stateList: Shardus.WrappedResponse[];
            txid: string;
        };
        let edgeNodeIds = [];
        let consensusNodeIds = [];
        const nodesToSendTo: StringNodeObjectMap = {};
        const doOnceNodeAccPair = new Set<string>();
        for (const key of queueEntry.uniqueKeys) {
            if (datas[key] != null) {
                for (const key2 of queueEntry.uniqueKeys) {
                    if (key !== key2) {
                        const localHomeNode = queueEntry.homeNodes[key];
                        const remoteHomeNode = queueEntry.homeNodes[key2];
                        const ourLocalConsensusIndex = localHomeNode.consensusNodeForOurNodeFull.findIndex((a) => a.id === ourNodeData.node.id);
                        if (ourLocalConsensusIndex === -1) {
                            continue;
                        }
                        edgeNodeIds = [];
                        consensusNodeIds = [];
                        correspondingAccNodes = [];
                        const ourSendingGroupSize = localHomeNode.consensusNodeForOurNodeFull.length;
                        const targetConsensusGroupSize = remoteHomeNode.consensusNodeForOurNodeFull.length;
                        const targetEdgeGroupSize = remoteHomeNode.edgeNodes.length;
                        const pachedListSize = remoteHomeNode.patchedOnNodes.length;
                        const indicies = ShardFunctions.debugFastStableCorrespondingIndicies(ourSendingGroupSize, targetConsensusGroupSize, ourLocalConsensusIndex + 1);
                        const edgeIndicies = ShardFunctions.debugFastStableCorrespondingIndicies(ourSendingGroupSize, targetEdgeGroupSize, ourLocalConsensusIndex + 1);
                        let patchIndicies = [];
                        if (remoteHomeNode.patchedOnNodes.length > 0) {
                            patchIndicies = ShardFunctions.debugFastStableCorrespondingIndicies(ourSendingGroupSize, remoteHomeNode.patchedOnNodes.length, ourLocalConsensusIndex + 1);
                        }
                        for (const index of indicies) {
                            const targetNode = remoteHomeNode.consensusNodeForOurNodeFull[index - 1];
                            if (queueEntry.executionGroupMap.has(targetNode.id) === false) {
                                continue;
                            }
                            if (targetNode != null && targetNode.id !== ourNodeData.node.id) {
                                nodesToSendTo[targetNode.id] = targetNode;
                                consensusNodeIds.push(targetNode.id);
                            }
                        }
                        for (const index of edgeIndicies) {
                            const targetNode = remoteHomeNode.edgeNodes[index - 1];
                            if (targetNode != null && targetNode.id !== ourNodeData.node.id) {
                                if (queueEntry.executionGroupMap.has(targetNode.id) === false) {
                                    continue;
                                }
                                nodesToSendTo[targetNode.id] = targetNode;
                                edgeNodeIds.push(targetNode.id);
                            }
                        }
                        for (const index of patchIndicies) {
                            const targetNode = remoteHomeNode.edgeNodes[index - 1];
                            if (queueEntry.executionGroupMap.has(targetNode.id) === false) {
                                continue;
                            }
                            if (targetNode != null && targetNode.id !== ourNodeData.node.id) {
                                nodesToSendTo[targetNode.id] = targetNode;
                            }
                        }
                        const dataToSend = [];
                        dataToSend.push(datas[key]);
                        for (let data of dataToSend) {
                            data = this.crypto.sign(data);
                        }
                        message = { stateList: dataToSend, txid: queueEntry.acceptedTx.txId };
                        for (const [accountID, node] of Object.entries(nodesToSendTo)) {
                            const keyPair = accountID + key;
                            if (node != null && doOnceNodeAccPair.has(keyPair) === false) {
                                doOnceNodeAccPair.add(keyPair);
                                correspondingAccNodes.push(node);
                            }
                        }
                        if (correspondingAccNodes.length > 0) {
                            const remoteRelation = ShardFunctions.getNodeRelation(remoteHomeNode, this.stateManager.currentCycleShardData.ourNode.id);
                            const localRelation = ShardFunctions.getNodeRelation(localHomeNode, this.stateManager.currentCycleShardData.ourNode.id);
                            const filteredNodes = this.stateManager.filterValidNodesForInternalMessage(correspondingAccNodes, 'tellCorrespondingNodes', true, true);
                            if (filteredNodes.length === 0) {
                                if (logFlags.error)
                                    this.mainLogger.error('tellCorrespondingNodes: filterValidNodesForInternalMessage no valid nodes left to try');
                                return null;
                            }
                            const filterdCorrespondingAccNodes = filteredNodes;
                            this.broadcastState(filterdCorrespondingAccNodes, message, "tellCorrespondingNodes");
                        }
                    }
                }
            }
        }
    }
    async factTellCorrespondingNodes(queueEntry: QueueEntry): Promise<unknown> {
        try {
            let cycleShardData = this.stateManager.currentCycleShardData;
            if (Context.config.stateManager.deterministicTXCycleEnabled) {
                cycleShardData = this.stateManager.shardValuesByCycle.get(queueEntry.txGroupCycle);
            }
            if (cycleShardData == null) {
                throw new Error('factTellCorrespondingNodes: cycleShardData == null');
            }
            if (queueEntry.uniqueKeys == null) {
                throw new Error('factTellCorrespondingNodes: queueEntry.uniqueKeys == null');
            }
            const ourNodeData = cycleShardData.nodeShardData;
            const dataKeysWeHave = [];
            const dataValuesWeHave = [];
            const datas: {
                [accountID: string]: Shardus.WrappedResponse;
            } = {};
            const remoteShardsByKey: {
                [accountID: string]: StateManagerTypes.shardFunctionTypes.NodeShardData;
            } = {};
            let loggedPartition = false;
            for (const key of queueEntry.uniqueKeys) {
                let hasKey = ShardFunctions.testAddressInRange(key, ourNodeData.storedPartitions);
                if (queueEntry.patchedOnNodes.has(ourNodeData.node.id)) {
                    hasKey = true;
                }
                let isGlobalKey = false;
                if (this.stateManager.accountGlobals.isGlobalAccount(key)) {
                    hasKey = true;
                    isGlobalKey = true;
                }
                if (hasKey === false) {
                    if (loggedPartition === false) {
                        loggedPartition = true;
                    }
                }
                if (hasKey) {
                    this.setDebugLastAwaitedCallInner('this.stateManager.transactionQueue.app.getRelevantData');
                    let data = await this.app.getRelevantData(key, queueEntry.acceptedTx.data, queueEntry.acceptedTx.appData);
                    this.setDebugLastAwaitedCallInner('this.stateManager.transactionQueue.app.getRelevantData', DebugComplete.Completed);
                    if (data.accountCreated == false) {
                        data = utils.deepCopy(data);
                    }
                    if (isGlobalKey === false) {
                        datas[key] = data;
                        dataKeysWeHave.push(key);
                        dataValuesWeHave.push(data);
                    }
                    queueEntry.localKeys[key] = true;
                    this.queueEntryAddData(queueEntry, data, false);
                }
                else {
                    remoteShardsByKey[key] = queueEntry.homeNodes[key];
                }
            }
            if (queueEntry.globalModification === true) {
                return;
            }
            const payload: {
                stateList: Shardus.WrappedResponse[];
                txid: string;
            } = {
                stateList: [],
                txid: queueEntry.acceptedTx.txId,
            };
            for (const key of queueEntry.uniqueKeys) {
                if (datas[key] != null) {
                    payload.stateList.push(datas[key]);
                }
            }
            const signedPayload = this.crypto.sign(payload);
            const ourIndexInTxGroup = queueEntry.ourTXGroupIndex;
            const targetGroup = queueEntry.executionNodeIdSorted;
            const targetGroupSize = targetGroup.length;
            const senderGroupSize = targetGroupSize;
            const targetIndices = this.getStartAndEndIndexOfTargetGroup(targetGroup, queueEntry.transactionGroup);
            const unwrappedIndex = queueEntry.isSenderWrappedTxGroup[Self.id];
            if (logFlags.verbose) {
            }
            let correspondingIndices = getCorrespondingNodes(ourIndexInTxGroup, targetIndices.startIndex, targetIndices.endIndex, queueEntry.correspondingGlobalOffset, targetGroupSize, senderGroupSize, queueEntry.transactionGroup.length);
            let oldCorrespondingIndices: number[] = undefined;
            if (this.config.stateManager.correspondingTellUseUnwrapped) {
                if (unwrappedIndex != null) {
                    const extraCorrespondingIndices = getCorrespondingNodes(unwrappedIndex, targetIndices.startIndex, targetIndices.endIndex, queueEntry.correspondingGlobalOffset, targetGroupSize, senderGroupSize, queueEntry.transactionGroup.length, queueEntry.logID);
                    if (Context.config.stateManager.concatCorrespondingTellUseUnwrapped) {
                        correspondingIndices = correspondingIndices.concat(extraCorrespondingIndices);
                    }
                    else {
                        oldCorrespondingIndices = correspondingIndices;
                        correspondingIndices = extraCorrespondingIndices;
                    }
                }
            }
            if (Context.config.stateManager.avoidOurIndexInFactTell && correspondingIndices.includes(ourIndexInTxGroup)) {
                queueEntry.correspondingGlobalOffset += 1;
                correspondingIndices = getCorrespondingNodes(ourIndexInTxGroup, targetIndices.startIndex, targetIndices.endIndex, queueEntry.correspondingGlobalOffset, targetGroupSize, senderGroupSize, queueEntry.transactionGroup.length);
                let oldCorrespondingIndices: number[] = undefined;
                if (this.config.stateManager.correspondingTellUseUnwrapped) {
                    if (unwrappedIndex != null) {
                        const extraCorrespondingIndices = getCorrespondingNodes(unwrappedIndex, targetIndices.startIndex, targetIndices.endIndex, queueEntry.correspondingGlobalOffset, targetGroupSize, senderGroupSize, queueEntry.transactionGroup.length, queueEntry.logID);
                        if (Context.config.stateManager.concatCorrespondingTellUseUnwrapped) {
                            correspondingIndices = correspondingIndices.concat(extraCorrespondingIndices);
                        }
                        else {
                            oldCorrespondingIndices = correspondingIndices;
                            correspondingIndices = extraCorrespondingIndices;
                        }
                    }
                }
            }
            const validCorrespondingIndices = [];
            for (const targetIndex of correspondingIndices) {
                validCorrespondingIndices.push(targetIndex);
            }
            const correspondingNodes = [];
            for (const index of validCorrespondingIndices) {
                if (index === ourIndexInTxGroup) {
                    continue;
                }
                const targetNode = queueEntry.transactionGroup[index];
                let targetHasOurData = false;
                if (this.config.stateManager.filterReceivingNodesForTXData) {
                    targetHasOurData = true;
                    for (const wrappedResponse of signedPayload.stateList) {
                        const accountId = wrappedResponse.accountId;
                        const targetNodeShardData = cycleShardData.nodeShardDataMap.get(targetNode.id);
                        if (targetNodeShardData == null) {
                            targetHasOurData = false;
                            break;
                        }
                        const targetHasKey = ShardFunctions.testAddressInRange(accountId, targetNodeShardData.storedPartitions);
                        if (targetHasKey === false) {
                            targetHasOurData = false;
                            break;
                        }
                    }
                }
                if (targetHasOurData === false) {
                    correspondingNodes.push(targetNode);
                }
            }
            const callParams = {
                oi: unwrappedIndex ?? ourIndexInTxGroup,
                st: targetIndices.startIndex,
                et: targetIndices.endIndex,
                gl: queueEntry.correspondingGlobalOffset,
                tg: targetGroupSize,
                sg: senderGroupSize,
                tn: queueEntry.transactionGroup.length
            };
            queueEntry.txDebug.correspondingDebugInfo = {
                ourIndex: ourIndexInTxGroup,
                ourUnwrappedIndex: unwrappedIndex,
                callParams,
                localKeys: queueEntry.localKeys,
                oldCorrespondingIndices,
                correspondingIndices: correspondingIndices,
                correspondingNodeIds: correspondingNodes.map(n => n.id)
            };
            if (correspondingNodes.length === 0) {
                return;
            }
            const filteredNodes = this.stateManager.filterValidNodesForInternalMessage(correspondingNodes, 'factTellCorrespondingNodes', true, true);
            if (filteredNodes.length === 0) {
                if (logFlags.error)
                    this.mainLogger.error("factTellCorrespondingNodes: filterValidNodesForInternalMessage no valid nodes left to try");
                return null;
            }
            if (payload.stateList.length === 0) {
                if (logFlags.error)
                    this.mainLogger.error("factTellCorrespondingNodes: filterValidNodesForInternalMessage payload.stateList.length === 0");
                return null;
            }
            this.broadcastState(filteredNodes, payload, 'factTellCorrespondingNodes');
        }
        catch (error) {
            this.statemanager_fatal(`factTellCorrespondingNodes_ex`, 'factTellCorrespondingNodes' + utils.formatErrorMessage(error));
        }
    }
    validateCorrespondingTellSender(queueEntry: QueueEntry, dataKey: string, senderNodeId: string): boolean {
        const receiverNode = this.stateManager.currentCycleShardData.nodeShardData;
        if (receiverNode == null)
            return false;
        const receiverIsInExecutionGroup = queueEntry.executionGroupMap.has(receiverNode.node.id);
        const senderNode = this.stateManager.currentCycleShardData.nodeShardDataMap.get(senderNodeId);
        if (senderNode === null)
            return false;
        const senderHasAddress = ShardFunctions.testAddressInRange(dataKey, senderNode.storedPartitions);
        if (configContext.stateManager.shareCompleteData) {
            const senderIsInExecutionGroup = queueEntry.executionGroupMap.has(senderNodeId);
            const neighbourNodes = utils.selectNeighbors(queueEntry.executionGroup, queueEntry.ourExGroupIndex, 2) as Shardus.Node[];
            const neighbourNodeIds = neighbourNodes.map((node) => node.id);
            if (senderIsInExecutionGroup && neighbourNodeIds.includes(senderNodeId) === false) {
                this.mainLogger.error(`validateCorrespondingTellSender: sender is an execution node but not a neighbour node`);
                return false;
            }
            if (receiverIsInExecutionGroup === true || senderHasAddress === true || senderIsInExecutionGroup === true) {
                return true;
            }
        }
        else {
            if (receiverIsInExecutionGroup === true || senderHasAddress === true) {
                return true;
            }
        }
        return false;
    }
    factValidateCorrespondingTellSender(queueEntry: QueueEntry, dataKey: string, senderNodeId: string): boolean {
        let cycleShardData = this.stateManager.currentCycleShardData;
        if (Context.config.stateManager.deterministicTXCycleEnabled) {
            cycleShardData = this.stateManager.shardValuesByCycle.get(queueEntry.txGroupCycle);
        }
        const receiverNodeShardData = cycleShardData.nodeShardData;
        if (receiverNodeShardData == null) {
            this.mainLogger.error(`factValidateCorrespondingTellSender: logID: ${queueEntry.logID} receiverNodeShardData == null, txGroupCycle: ${queueEntry.txGroupCycle}}`);
            return false;
        }
        const senderNodeShardData = cycleShardData.nodeShardDataMap.get(senderNodeId);
        if (senderNodeShardData === null) {
            this.mainLogger.error(`factValidateCorrespondingTellSender: logID: ${queueEntry.logID} senderNodeShardData == null, txGroupCycle: ${queueEntry.txGroupCycle}}`);
            return false;
        }
        const senderHasAddress = ShardFunctions.testAddressInRange(dataKey, senderNodeShardData.storedPartitions);
        const receivingNodeIndex = queueEntry.ourTXGroupIndex;
        const senderNodeIndex = queueEntry.transactionGroup.findIndex((node) => node.id === senderNodeId);
        let wrappedSenderNodeIndex = null;
        if (queueEntry.isSenderWrappedTxGroup[senderNodeId] != null) {
            wrappedSenderNodeIndex = queueEntry.isSenderWrappedTxGroup[senderNodeId];
        }
        const receiverGroupSize = queueEntry.executionNodeIdSorted.length;
        const senderGroupSize = receiverGroupSize;
        const targetGroup = queueEntry.executionNodeIdSorted;
        const targetIndices = this.getStartAndEndIndexOfTargetGroup(targetGroup, queueEntry.transactionGroup);
        let isValidFactSender = verifyCorrespondingSender(receivingNodeIndex, senderNodeIndex, queueEntry.correspondingGlobalOffset, receiverGroupSize, senderGroupSize, targetIndices.startIndex, targetIndices.endIndex, queueEntry.transactionGroup.length, false, queueEntry.logID);
        if (isValidFactSender === false && wrappedSenderNodeIndex != null && wrappedSenderNodeIndex >= 0) {
            isValidFactSender = verifyCorrespondingSender(receivingNodeIndex, wrappedSenderNodeIndex, queueEntry.correspondingGlobalOffset, receiverGroupSize, senderGroupSize, targetIndices.startIndex, targetIndices.endIndex, queueEntry.transactionGroup.length, false, queueEntry.logID);
        }
        if (senderHasAddress === false) {
            this.mainLogger.error(`factValidateCorrespondingTellSender: logId: ${queueEntry.logID} sender does not have the address and is not a exe neighbour`);
            return false;
        }
        if (isValidFactSender === false) {
            this.mainLogger.error(`factValidateCorrespondingTellSender: logId: ${queueEntry.logID} sender is neither a valid sender nor a neighbour node isValidSender:  ${isValidFactSender}`);
            return false;
        }
        return true;
    }
    getStartAndEndIndexOfTargetGroup(targetGroup: string[], transactionGroup: (Shardus.NodeWithRank | P2PTypes.NodeListTypes.Node)[]): {
        startIndex: number;
        endIndex: number;
    } {
        const targetIndexes: number[] = [];
        for (let i = 0; i < transactionGroup.length; i++) {
            const nodeId = transactionGroup[i].id;
            if (targetGroup.indexOf(nodeId) >= 0) {
                targetIndexes.push(i);
            }
        }
        const n = targetIndexes.length;
        let startIndex = targetIndexes[0];
        for (let i = 1; i < n; i++) {
            if (targetIndexes[i] > targetIndexes[i - 1] + 1) {
                startIndex = targetIndexes[i];
                break;
            }
        }
        let endIndex = startIndex + n;
        if (endIndex > transactionGroup.length) {
            endIndex = endIndex - transactionGroup.length;
        }
        return { startIndex, endIndex };
    }
    async tellCorrespondingNodesFinalData(queueEntry: QueueEntry): Promise<void> {
        if (this.stateManager.currentCycleShardData == null) {
            throw new Error('tellCorrespondingNodesFinalData: currentCycleShardData == null');
        }
        if (queueEntry.uniqueKeys == null) {
            throw new Error('tellCorrespondingNodesFinalData: queueEntry.uniqueKeys == null');
        }
        if (queueEntry.globalModification === true) {
            throw new Error('tellCorrespondingNodesFinalData globalModification === true');
        }
        if (this.executeInOneShard && queueEntry.isInExecutionHome === false) {
            throw new Error('tellCorrespondingNodesFinalData isInExecutionHome === false');
        }
        if (queueEntry.executionShardKey == null || queueEntry.executionShardKey == '') {
            throw new Error('tellCorrespondingNodesFinalData executionShardKey == null or empty');
        }
        if (queueEntry.preApplyTXResult == null) {
            throw new Error('tellCorrespondingNodesFinalData preApplyTXResult == null');
        }
        const ourNodeData = this.stateManager.currentCycleShardData.nodeShardData;
        let correspondingAccNodes: Shardus.Node[] = [];
        const datas: {
            [accountID: string]: Shardus.WrappedResponse;
        } = {};
        const applyResponse = queueEntry.preApplyTXResult.applyResponse;
        let wrappedStates = this.stateManager.useAccountWritesOnly ? {} : queueEntry.collectedData;
        const writtenAccountsMap: WrappedResponses = {};
        if (applyResponse.accountWrites != null && applyResponse.accountWrites.length > 0) {
            for (const writtenAccount of applyResponse.accountWrites) {
                writtenAccountsMap[writtenAccount.accountId] = writtenAccount.data;
                writtenAccountsMap[writtenAccount.accountId].prevStateId = wrappedStates[writtenAccount.accountId]
                    ? wrappedStates[writtenAccount.accountId].stateId
                    : '';
                writtenAccountsMap[writtenAccount.accountId].prevDataCopy = wrappedStates[writtenAccount.accountId]
                    ? utils.deepCopy(writtenAccount.data)
                    : {};
                datas[writtenAccount.accountId] = writtenAccount.data;
            }
            wrappedStates = writtenAccountsMap;
        }
        const keysToShare = Object.keys(wrappedStates);
        let message: {
            stateList: Shardus.WrappedResponse[];
            txid: string;
        };
        let edgeNodeIds = [];
        let consensusNodeIds = [];
        const localHomeNode = queueEntry.homeNodes[queueEntry.executionShardKey];
        let nodesToSendTo: StringNodeObjectMap = {};
        let doOnceNodeAccPair = new Set<string>();
        let totalShares = 0;
        for (const key of keysToShare) {
            nodesToSendTo = {};
            doOnceNodeAccPair = new Set<string>();
            if (wrappedStates[key] != null) {
                let accountHomeNode = queueEntry.homeNodes[key];
                if (accountHomeNode == null) {
                    accountHomeNode = ShardFunctions.findHomeNode(this.stateManager.currentCycleShardData.shardGlobals, key, this.stateManager.currentCycleShardData.parititionShardDataMap);
                }
                if (accountHomeNode == null) {
                    throw new Error('tellCorrespondingNodesFinalData: should never get here.  accountHomeNode == null');
                }
                edgeNodeIds = [];
                consensusNodeIds = [];
                correspondingAccNodes = [];
                if (queueEntry.ourExGroupIndex === -1) {
                    throw new Error('tellCorrespondingNodesFinalData: should never get here.  our sending node must be in the execution group');
                }
                const ourLocalExecutionSetIndex = queueEntry.ourExGroupIndex;
                const ourSendingGroupSize = queueEntry.executionGroupMap.size;
                const consensusListSize = accountHomeNode.consensusNodeForOurNodeFull.length;
                const edgeListSize = accountHomeNode.edgeNodes.length;
                const pachedListSize = accountHomeNode.patchedOnNodes.length;
                const indicies = ShardFunctions.debugFastStableCorrespondingIndicies(ourSendingGroupSize, consensusListSize, ourLocalExecutionSetIndex + 1);
                const edgeIndicies = ShardFunctions.debugFastStableCorrespondingIndicies(ourSendingGroupSize, edgeListSize, ourLocalExecutionSetIndex + 1);
                let patchIndicies = [];
                if (accountHomeNode.patchedOnNodes.length > 0) {
                    patchIndicies = ShardFunctions.debugFastStableCorrespondingIndicies(ourSendingGroupSize, pachedListSize, ourLocalExecutionSetIndex + 1);
                }
                for (const index of indicies) {
                    const node = accountHomeNode.consensusNodeForOurNodeFull[index - 1];
                    if (node != null && node.id !== ourNodeData.node.id) {
                        nodesToSendTo[node.id] = node;
                        consensusNodeIds.push(node.id);
                    }
                }
                for (const index of edgeIndicies) {
                    const node = accountHomeNode.edgeNodes[index - 1];
                    if (node != null && node.id !== ourNodeData.node.id) {
                        nodesToSendTo[node.id] = node;
                        edgeNodeIds.push(node.id);
                    }
                }
                for (const index of patchIndicies) {
                    const node = accountHomeNode.edgeNodes[index - 1];
                    if (node != null && node.id !== ourNodeData.node.id) {
                        nodesToSendTo[node.id] = node;
                    }
                }
                for (const [accountID, node] of Object.entries(nodesToSendTo)) {
                    const keyPair = accountID + key;
                    if (node != null && doOnceNodeAccPair.has(keyPair) === false) {
                        doOnceNodeAccPair.add(keyPair);
                        correspondingAccNodes.push(node);
                    }
                }
                const dataToSend: Shardus.WrappedResponse[] = [];
                dataToSend.push(datas[key]);
                message = { stateList: dataToSend, txid: queueEntry.acceptedTx.txId };
                if (correspondingAccNodes.length > 0) {
                    const remoteRelation = ShardFunctions.getNodeRelation(accountHomeNode, this.stateManager.currentCycleShardData.ourNode.id);
                    const localRelation = ShardFunctions.getNodeRelation(localHomeNode, this.stateManager.currentCycleShardData.ourNode.id);
                    const filteredNodes = this.stateManager.filterValidNodesForInternalMessage(correspondingAccNodes, 'tellCorrespondingNodesFinalData', true, true);
                    if (filteredNodes.length === 0) {
                        if (logFlags.error)
                            this.mainLogger.error('tellCorrespondingNodesFinalData: filterValidNodesForInternalMessage no valid nodes left to try');
                        continue;
                    }
                    const filterdCorrespondingAccNodes = filteredNodes;
                    const filterNodesIpPort = filterdCorrespondingAccNodes.map((node) => node.externalIp + ':' + node.externalPort);
                    const request = message as BroadcastFinalStateReq;
                    if (logFlags.seqdiagram) {
                        for (const node of filterdCorrespondingAccNodes) {
                        }
                    }
                    this.p2p.tellBinary<BroadcastFinalStateReq>(filterdCorrespondingAccNodes, InternalRouteEnum.binary_broadcast_finalstate, request, serializeBroadcastFinalStateReq, {
                        verification_data: verificationDataCombiner(message.txid, message.stateList.length.toString()),
                    });
                    totalShares++;
                }
            }
        }
    }
    factTellCorrespondingNodesFinalData(queueEntry: QueueEntry): void {
        if (this.stateManager.currentCycleShardData == null) {
            throw new Error('factTellCorrespondingNodesFinalData: currentCycleShardData == null');
        }
        if (queueEntry.uniqueKeys == null) {
            throw new Error('factTellCorrespondingNodesFinalData: queueEntry.uniqueKeys == null');
        }
        if (queueEntry.globalModification === true) {
            throw new Error('factTellCorrespondingNodesFinalData globalModification === true');
        }
        if (this.executeInOneShard && queueEntry.isInExecutionHome === false) {
            throw new Error('factTellCorrespondingNodesFinalData isInExecutionHome === false');
        }
        if (queueEntry.executionShardKey == null || queueEntry.executionShardKey == '') {
            throw new Error('factTellCorrespondingNodesFinalData executionShardKey == null or empty');
        }
        if (queueEntry.preApplyTXResult == null) {
            throw new Error('factTellCorrespondingNodesFinalData preApplyTXResult == null');
        }
        const datas: {
            [accountID: string]: Shardus.WrappedResponse;
        } = {};
        const applyResponse = queueEntry.preApplyTXResult.applyResponse;
        let wrappedStates = this.stateManager.useAccountWritesOnly ? {} : queueEntry.collectedData;
        const writtenAccountsMap: WrappedResponses = {};
        if (applyResponse.accountWrites != null && applyResponse.accountWrites.length > 0) {
            for (const writtenAccount of applyResponse.accountWrites) {
                writtenAccountsMap[writtenAccount.accountId] = writtenAccount.data;
                writtenAccountsMap[writtenAccount.accountId].prevStateId = wrappedStates[writtenAccount.accountId]
                    ? wrappedStates[writtenAccount.accountId].stateId
                    : '';
                writtenAccountsMap[writtenAccount.accountId].prevDataCopy = wrappedStates[writtenAccount.accountId]
                    ? utils.deepCopy(writtenAccount.data)
                    : {};
                datas[writtenAccount.accountId] = writtenAccount.data;
            }
            wrappedStates = writtenAccountsMap;
        }
        const keysToShare = Object.keys(wrappedStates);
        let message: {
            stateList: Shardus.WrappedResponse[];
            txid: string;
        };
        let totalShares = 0;
        const targetStartIndex = 0;
        const targetEndIndex = queueEntry.transactionGroup.length;
        const targetGroupSize = queueEntry.transactionGroup.length;
        const senderIndexInTxGroup = queueEntry.ourTXGroupIndex;
        const senderGroupSize = queueEntry.executionGroup.length;
        const unwrappedIndex = queueEntry.isSenderWrappedTxGroup[Self.id];
        let correspondingIndices = getCorrespondingNodes(senderIndexInTxGroup, targetStartIndex, targetEndIndex, queueEntry.correspondingGlobalOffset, targetGroupSize, senderGroupSize, queueEntry.transactionGroup.length, queueEntry.logID);
        if (this.config.stateManager.correspondingTellUseUnwrapped) {
            if (unwrappedIndex != null) {
                const extraCorrespondingIndices = getCorrespondingNodes(unwrappedIndex, targetStartIndex, targetEndIndex, queueEntry.correspondingGlobalOffset, targetGroupSize, senderGroupSize, queueEntry.transactionGroup.length, queueEntry.logID);
                if (Context.config.stateManager.concatCorrespondingTellUseUnwrapped) {
                    correspondingIndices.concat(extraCorrespondingIndices);
                }
                else {
                    correspondingIndices = extraCorrespondingIndices;
                }
            }
        }
        for (const key of keysToShare) {
            if (wrappedStates[key] != null) {
                if (queueEntry.ourExGroupIndex === -1) {
                    throw new Error('factTellCorrespondingNodesFinalData: should never get here.  our sending node must be in the execution group');
                }
                const storageNodesForAccount = this.getStorageGroupForAccount(key);
                const storageNodesAccountIds = new Set(storageNodesForAccount.map((node) => node.id));
                const correspondingNodes: P2PTypes.NodeListTypes.Node[] = [];
                for (const index of correspondingIndices) {
                    const node = queueEntry.transactionGroup[index];
                    if (storageNodesAccountIds.has(node.id)) {
                        correspondingNodes.push(node);
                    }
                }
                if (logFlags.verbose)
                    if (logFlags.playback) {
                    }
                const dataToSend: Shardus.WrappedResponse[] = [];
                dataToSend.push(datas[key]);
                message = { stateList: dataToSend, txid: queueEntry.acceptedTx.txId };
                if (correspondingNodes.length > 0) {
                    const filteredNodes = this.stateManager.filterValidNodesForInternalMessage(correspondingNodes, 'factTellCorrespondingNodesFinalData', true, true);
                    if (filteredNodes.length === 0) {
                        if (logFlags.error)
                            this.mainLogger.error('factTellCorrespondingNodesFinalData: filterValidNodesForInternalMessage no valid nodes left to try');
                        continue;
                    }
                    const filterdCorrespondingAccNodes = filteredNodes;
                    const filterNodesIpPort = filterdCorrespondingAccNodes.map((node) => node.externalIp + ':' + node.externalPort);
                    const request = message as BroadcastFinalStateReq;
                    if (logFlags.seqdiagram) {
                        for (const node of filterdCorrespondingAccNodes) {
                        }
                    }
                    if (this.usePOQo) {
                        this.p2p.tellBinary<PoqoDataAndReceiptReq>(filterdCorrespondingAccNodes, InternalRouteEnum.binary_poqo_data_and_receipt, {
                            finalState: message,
                            receipt: queueEntry.signedReceipt,
                            txGroupCycle: queueEntry.txGroupCycle
                        }, serializePoqoDataAndReceiptReq, {});
                    }
                    else
                        this.p2p.tellBinary<BroadcastFinalStateReq>(filterdCorrespondingAccNodes, InternalRouteEnum.binary_broadcast_finalstate, request, serializeBroadcastFinalStateReq, {
                            verification_data: verificationDataCombiner(message.txid, message.stateList.length.toString()),
                        });
                    totalShares++;
                }
            }
        }
    }
    factValidateCorrespondingTellFinalDataSender(queueEntry: QueueEntry, senderNodeId: string): boolean {
        const senderNode = NodeList.nodes.get(senderNodeId);
        if (senderNode === null) {
            if (logFlags.error)
                this.mainLogger.error(`factValidateCorrespondingTellFinalDataSender: logId: ${queueEntry.logID} sender node is null`);
            return false;
        }
        const senderIsInExecutionGroup = queueEntry.executionGroupMap.has(senderNodeId);
        if (senderIsInExecutionGroup === false) {
            if (logFlags.error)
                this.mainLogger.error(`factValidateCorrespondingTellFinalDataSender: logId: ${queueEntry.logID} sender is not in the execution group sender:${senderNodeId}`);
            return false;
        }
        let senderNodeIndex = queueEntry.transactionGroup.findIndex((node) => node.id === senderNodeId);
        if (queueEntry.isSenderWrappedTxGroup[senderNodeId] != null) {
            senderNodeIndex = queueEntry.isSenderWrappedTxGroup[senderNodeId];
        }
        const senderGroupSize = queueEntry.executionGroup.length;
        const targetNodeIndex = queueEntry.ourTXGroupIndex;
        const targetGroupSize = queueEntry.transactionGroup.length;
        const targetStartIndex = 0;
        const targetEndIndex = queueEntry.transactionGroup.length;
        const isValidFactSender = verifyCorrespondingSender(targetNodeIndex, senderNodeIndex, queueEntry.correspondingGlobalOffset, targetGroupSize, senderGroupSize, targetStartIndex, targetEndIndex, queueEntry.transactionGroup.length);
        if (isValidFactSender === false) {
            if (logFlags.error)
                this.mainLogger.error(`factValidateCorrespondingTellFinalDataSender: logId: ${queueEntry.logID} sender is not a valid sender isValidSender:  ${isValidFactSender}`);
            return false;
        }
        return true;
    }
    dumpTxDebugToStatList(queueEntry: QueueEntry): void {
        this.txDebugStatList.set(queueEntry.acceptedTx.txId, { ...queueEntry.txDebug });
    }
    clearTxDebugStatList(): void {
        this.txDebugStatList.clear();
    }
    printTxDebugByTxId(txId: string): string {
        const txStat = this.txDebugStatList.get(txId);
        if (txStat == null) {
            return 'No txStat found';
        }
        let resultStr = '';
        for (const key in txStat.duration) {
            resultStr += `${key}: start:${txStat.startTimestamp[key]} end:${txStat.endTimestamp[key]} ${txStat.duration[key]} ms\n`;
        }
        return resultStr;
    }
    printTxDebug(): string {
        const collector = {};
        const totalTxCount = this.txDebugStatList.size();
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
        ];
        for (const [txId, txStat] of this.txDebugStatList.entries()) {
            for (const key in txStat.duration) {
                if (!collector[key]) {
                    collector[key] = {};
                    for (const bucket of txStatBucketSize.default) {
                        collector[key][bucket] = [];
                    }
                }
                const duration = txStat.duration[key];
                for (const bucket of txStatBucketSize.default) {
                    if (duration < bucket) {
                        collector[key][bucket].push(duration);
                        break;
                    }
                }
            }
        }
        const sortedCollector = {};
        for (const key of indexes) {
            sortedCollector[key] = { ...collector[key] };
        }
        const lines = [];
        lines.push(`=> Total Transactions: ${totalTxCount}`);
        for (const [key, collectorForThisKey] of Object.entries(sortedCollector)) {
            lines.push(`\n => Tx ${key}: \n`);
            for (let i = 0; i < Object.keys(collectorForThisKey).length; i++) {
                const time = Object.keys(collectorForThisKey)[i];
                const arr = collectorForThisKey[time];
                if (!arr)
                    continue;
                const percentage = (arr.length / totalTxCount) * 100;
                const blockCount = Math.round(percentage / 2);
                const blockStr = '|'.repeat(blockCount);
                const lowerLimit = i === 0 ? 0 : Object.keys(collectorForThisKey)[i - 1];
                const upperLimit = time;
                const bucketDescription = `${lowerLimit} ms - ${upperLimit} ms:`.padEnd(19, ' ');
                lines.push(`${bucketDescription}  ${arr.length} ${percentage.toFixed(1).padEnd(5, ' ')}%  ${blockStr} `);
            }
        }
        const strToPrint = lines.join('\n');
        return strToPrint;
    }
    removeFromQueue(queueEntry: QueueEntry, currentIndex: number, archive = true): void {
        for (const key in queueEntry.txDebug.startTime) {
            if (queueEntry.txDebug.startTime[key] != null) {
                this.txDebugMarkEndTime(queueEntry, key);
            }
        }
        this.stateManager.eventEmitter.emit('txPopped', queueEntry.acceptedTx.txId);
        if (queueEntry.txDebug)
            this.dumpTxDebugToStatList(queueEntry);
        this._transactionQueue.splice(currentIndex, 1);
        this._transactionQueueByID.delete(queueEntry.acceptedTx.txId);
        if (archive === false) {
            return;
        }
        queueEntry.archived = true;
        queueEntry.ourVote = null;
        queueEntry.collectedVotes = null;
        queueEntry.appliedReceipt =
            queueEntry.appliedReceipt ??
                queueEntry.recievedAppliedReceipt ??
                queueEntry.appliedReceiptForRepair ??
                queueEntry.appliedReceiptFinal;
        queueEntry.recievedAppliedReceipt = null;
        queueEntry.appliedReceiptForRepair = null;
        queueEntry.appliedReceiptFinal = queueEntry.appliedReceipt;
        delete queueEntry.recievedAppliedReceipt;
        delete queueEntry.appliedReceiptForRepair;
        queueEntry.recievedAppliedReceipt2 = null;
        queueEntry.appliedReceiptForRepair2 = null;
        delete queueEntry.recievedAppliedReceipt2;
        delete queueEntry.appliedReceiptForRepair2;
        queueEntry.signedReceipt =
            queueEntry.signedReceipt ??
                queueEntry.receivedSignedReceipt ??
                queueEntry.signedReceiptForRepair ??
                queueEntry.signedReceiptFinal;
        queueEntry.receivedSignedReceipt = null;
        queueEntry.signedReceiptForRepair = null;
        queueEntry.signedReceiptFinal = queueEntry.signedReceipt;
        delete queueEntry.receivedSignedReceipt;
        delete queueEntry.signedReceiptForRepair;
        this.archivedQueueEntries.push(queueEntry);
        this.archivedQueueEntriesByID.set(queueEntry.acceptedTx.txId, queueEntry);
        if (this.archivedQueueEntries.length > this.archivedQueueEntryMaxCount) {
            this.archivedQueueEntriesByID.delete(this.archivedQueueEntries[0].acceptedTx.txId);
            this.archivedQueueEntries.shift();
        }
    }
    async processTransactions(firstTime = false): Promise<void> {
        const seenAccounts: SeenAccounts = {};
        let pushedProfilerTag = null;
        const startTime = shardusGetTime();
        const processStats: ProcessQueueStats = {
            totalTime: 0,
            inserted: 0,
            sameState: 0,
            stateChanged: 0,
            sameStateStats: {},
            stateChangedStats: {},
            awaitStats: {},
        };
        this.lastProcessStats['current'] = processStats;
        this.queueReads = new Set();
        this.queueWrites = new Set();
        this.queueReadWritesOld = new Set();
        try {
            if (this.pendingTransactionQueue.length > 5000) {
                if (this.largePendingQueueReported === false) {
                    this.largePendingQueueReported = true;
                }
            }
            if (this.transactionProcessingQueueRunning === true) {
                return;
            }
            this.transactionProcessingQueueRunning = true;
            this.isStuckProcessing = false;
            this.debugLastProcessingQueueStartTime = shardusGetTime();
            const timeSinceLastRun = startTime - this.processingLastRunTime;
            if (timeSinceLastRun < this.processingMinRunBreak) {
                const sleepTime = Math.max(5, this.processingMinRunBreak - timeSinceLastRun);
                await utils.sleep(sleepTime);
            }
            if (this.transactionQueueHasRemainingWork && timeSinceLastRun > 500) {
                if (logFlags.verbose)
                    this.statemanager_fatal(`processAcceptedTxQueue left busy and waited too long to restart`, `processAcceptedTxQueue left busy and waited too long to restart ${timeSinceLastRun / 1000} `);
            }
            if (this.stateManager.currentCycleShardData == null) {
                return;
            }
            if (this._transactionQueue.length === 0 && this.pendingTransactionQueue.length === 0) {
                return;
            }
            if (this.queueRestartCounter == null) {
                this.queueRestartCounter = 0;
            }
            this.queueRestartCounter++;
            const localRestartCounter = this.queueRestartCounter;
            const timeM = this.stateManager.queueSitTime;
            const timeM2 = timeM * 2;
            const timeM2_5 = timeM * 2.5;
            const timeM3 = timeM * 3;
            let currentTime = shardusGetTime();
            const app = this.app;
            if (this.pendingTransactionQueue.length > 0) {
                for (const txQueueEntry of this.pendingTransactionQueue) {
                    const timestamp = txQueueEntry.txKeys.timestamp;
                    const acceptedTx = txQueueEntry.acceptedTx;
                    const txId = acceptedTx.txId;
                    let index = this._transactionQueue.length - 1;
                    let lastTx = this._transactionQueue[index];
                    while (index >= 0 &&
                        (timestamp > lastTx.txKeys.timestamp ||
                            (timestamp === lastTx.txKeys.timestamp && txId < lastTx.acceptedTx.txId))) {
                        index--;
                        lastTx = this._transactionQueue[index];
                    }
                    const age = shardusGetTime() - timestamp;
                    if (age > timeM * 0.9) {
                        if (txQueueEntry.didSync == false) {
                            if (logFlags.verbose)
                                this.statemanager_fatal(`processAcceptedTxQueue_oldTX.9 fromClient:${txQueueEntry.fromClient}`, `processAcceptedTxQueue cannot accept tx older than 0.9M ${timestamp} age: ${age} fromClient:${txQueueEntry.fromClient}`);
                        }
                    }
                    if (age > timeM) {
                        txQueueEntry.waitForReceiptOnly = true;
                        if (this.config.stateManager.txStateMachineChanges) {
                            this.updateTxState(txQueueEntry, 'await final data', 'processTx1');
                        }
                        else {
                            this.updateTxState(txQueueEntry, 'consensing');
                        }
                    }
                    if (age > timeM3 * 5 && this.stateManager.config.stateManager.discardVeryOldPendingTX === true) {
                        continue;
                    }
                    txQueueEntry.approximateCycleAge = this.stateManager.currentCycleShardData.cycleNumber;
                    this._transactionQueue.splice(index + 1, 0, txQueueEntry);
                    this._transactionQueueByID.set(txQueueEntry.acceptedTx.txId, txQueueEntry);
                    processStats.inserted++;
                    this.stateManager.eventEmitter.emit('txQueued', acceptedTx.txId);
                }
                this.pendingTransactionQueue = [];
                this.pendingTransactionQueueByID.clear();
            }
            let currentIndex = this._transactionQueue.length - 1;
            let lastLog = 0;
            currentIndex++;
            let lastRest = shardusGetTime();
            while (this._transactionQueue.length > 0) {
                currentTime = shardusGetTime();
                if (currentTime - lastRest > 1000) {
                    await utils.sleep(5);
                    lastRest = currentTime;
                    if (currentTime - this.stateManager.currentCycleShardData.calculationTime >
                        this.config.p2p.cycleDuration * 1000 + 5000) {
                    }
                    if (currentTime - this.stateManager.currentCycleShardData.calculationTime >
                        this.config.p2p.cycleDuration * 1000 + 11000) {
                        return;
                    }
                }
                if (pushedProfilerTag != null) {
                    pushedProfilerTag = null;
                }
                currentIndex--;
                if (currentIndex < 0) {
                    break;
                }
                this.clearDebugAwaitStrings();
                const queueEntry: QueueEntry | undefined = this._transactionQueue[currentIndex];
                if (queueEntry == null) {
                    this.statemanager_fatal(`queueEntry is null`, `currentIndex:${currentIndex}`);
                    continue;
                }
                const txTime = queueEntry.txKeys.timestamp;
                const txAge = currentTime - txTime;
                this.debugRecentQueueEntry = queueEntry;
                if (txAge < timeM) {
                    break;
                }
                if (localRestartCounter < this.queueRestartCounter && lastLog !== this.queueRestartCounter) {
                    lastLog = this.queueRestartCounter;
                }
                this.stateManager.debugTXHistory[queueEntry.logID] = queueEntry.state;
                const hasApplyReceipt = queueEntry.signedReceipt != null;
                const hasReceivedApplyReceipt = queueEntry.receivedSignedReceipt != null;
                const hasReceivedApplyReceiptForRepair = queueEntry.signedReceiptForRepair != null;
                const shortID = queueEntry.logID;
                if (queueEntry.state === 'pass' || queueEntry.state === 'fail') {
                    this.statemanager_fatal(`pass or fail entry should not be in queue`, `txid: ${shortID} state: ${queueEntry.state} receiptEverRequested:${queueEntry.receiptEverRequested} age:${txAge}`);
                    this.removeFromQueue(queueEntry, currentIndex);
                    continue;
                }
                if (this.queueTimingFixes === false) {
                    if (this.stateManager.accountSync.dataSyncMainPhaseComplete === true) {
                        if (txAge > timeM3 * 2 && queueEntry.didSync == false) {
                            this.statemanager_fatal(`txExpired1 > M3 * 2. NormalTX Timed out.`, `txExpired txAge > timeM3*2 && queueEntry.didSync == false. ` +
                                `txid: ${shortID} state: ${queueEntry.state} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} hasReceivedApplyReceiptForRepair:${hasReceivedApplyReceiptForRepair} receiptEverRequested:${queueEntry.receiptEverRequested} age:${txAge} ${utils.stringifyReduce(queueEntry.uniqueWritableKeys)}`);
                            if (queueEntry.receiptEverRequested && queueEntry.globalModification === false) {
                                this.statemanager_fatal(`txExpired1 > M3 * 2 -!receiptEverRequested`, `txExpired txAge > timeM3*2 && queueEntry.didSync == false. !receiptEverRequested ` +
                                    `txid: ${shortID} state: ${queueEntry.state} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} hasReceivedApplyReceiptForRepair:${hasReceivedApplyReceiptForRepair} receiptEverRequested:${queueEntry.receiptEverRequested} age:${txAge}`);
                            }
                            if (queueEntry.globalModification) {
                                this.statemanager_fatal(`txExpired1 > M3 * 2 -GlobalModification!!`, `txExpired txAge > timeM3*2 && queueEntry.didSync == false. !receiptEverRequested ` +
                                    `txid: ${shortID} state: ${queueEntry.state} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} hasReceivedApplyReceiptForRepair:${hasReceivedApplyReceiptForRepair} receiptEverRequested:${queueEntry.receiptEverRequested} age:${txAge}`);
                            }
                            if (configContext.stateManager.disableTxExpiration === false) {
                                this.setTXExpired(queueEntry, currentIndex, 'old, timeM3 * 2');
                                continue;
                            }
                        }
                        if (this.queueTimingFixes === false) {
                            if (txAge > timeM3 && queueEntry.requestingReceiptFailed) {
                                this.statemanager_fatal(`txExpired3 > M3. receiptRequestFail after Timed Out`, `txExpired txAge > timeM3 && queueEntry.requestingReceiptFailed ` +
                                    `txid: ${shortID} state: ${queueEntry.state} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} age:${txAge}`);
                                if (configContext.stateManager.disableTxExpiration === false) {
                                    this.setTXExpired(queueEntry, currentIndex, 'old, timeM3, requestingReceiptFailed');
                                    continue;
                                }
                            }
                            if (txAge > timeM3 && queueEntry.repairFailed) {
                                this.statemanager_fatal(`txExpired3 > M3. repairFailed after Timed Out`, `txExpired txAge > timeM3 && queueEntry.repairFailed ` +
                                    `txid: ${shortID} state: ${queueEntry.state} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} age:${txAge}`);
                                if (configContext.stateManager.disableTxExpiration === false) {
                                    this.setTXExpired(queueEntry, currentIndex, 'old, timeM3, repairFailed');
                                    continue;
                                }
                            }
                            if (queueEntry.state != 'await repair' && queueEntry.state != 'commiting') {
                                if (txAge > timeM2_5 &&
                                    queueEntry.m2TimeoutReached === false &&
                                    queueEntry.globalModification === false &&
                                    queueEntry.requestingReceipt === false) {
                                    if (queueEntry.state == 'awaiting data') {
                                        if (queueEntry.receivedSignedReceipt == null && queueEntry.signedReceipt == null) {
                                            if (logFlags.verbose)
                                                if (logFlags.error)
                                                    this.mainLogger.error(`Wait for reciept only: txAge > timeM2_5 txid:${shortID} `);
                                            queueEntry.waitForReceiptOnly = true;
                                            queueEntry.m2TimeoutReached = true;
                                            if (this.config.stateManager.txStateMachineChanges) {
                                                this.updateTxState(queueEntry, 'await final data', 'processTx2');
                                            }
                                            else {
                                                this.updateTxState(queueEntry, 'consensing');
                                            }
                                            continue;
                                        }
                                    }
                                }
                                if (queueEntry.requestingReceipt === true) {
                                    this.processQueue_markAccountsSeen(seenAccounts, queueEntry);
                                    continue;
                                }
                                if (txAge > timeM3 &&
                                    queueEntry.requestingReceiptFailed === false &&
                                    queueEntry.globalModification === false) {
                                    if (this.stateManager.hasReceipt(queueEntry) === false &&
                                        queueEntry.requestingReceipt === false) {
                                        if (logFlags.verbose)
                                            if (logFlags.error)
                                                this.mainLogger.error(`txAge > timeM3 => ask for receipt now ` + `txid: ${shortID} state: ${queueEntry.state} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} age:${txAge}`);
                                        const seen = this.processQueue_accountSeen(seenAccounts, queueEntry);
                                        this.processQueue_markAccountsSeen(seenAccounts, queueEntry);
                                        this.queueEntryRequestMissingReceipt(queueEntry);
                                        queueEntry.waitForReceiptOnly = true;
                                        queueEntry.m2TimeoutReached = true;
                                        if (this.config.stateManager.txStateMachineChanges) {
                                            this.updateTxState(queueEntry, 'await final data', 'processTx3');
                                        }
                                        else {
                                            this.updateTxState(queueEntry, 'consensing');
                                        }
                                        continue;
                                    }
                                }
                            }
                        }
                    }
                    else {
                        if (txAge > timeM3 * 50) {
                            this.statemanager_fatal(`txExpired4`, `Still on inital syncing.  txExpired txAge > timeM3 * 50. ` +
                                `txid: ${shortID} state: ${queueEntry.state} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} age:${txAge}`);
                            this.setTXExpired(queueEntry, currentIndex, 'old, timeM3 * 50!!');
                            continue;
                        }
                    }
                }
                if (this.queueTimingFixes === true) {
                    if (queueEntry.state === 'processing' || queueEntry.state === 'awaiting data') {
                        if (this.processQueue_accountSeen(seenAccounts, queueEntry) === true) {
                            if (txAge > timeM2 + queueEntry.txSieveTime) {
                                if (configContext.stateManager.disableTxExpiration === false) {
                                    this.setTXExpired(queueEntry, currentIndex, 'm2, processing or awaiting');
                                    if (configContext.stateManager.stuckTxQueueFix)
                                        continue;
                                }
                                if (configContext.stateManager.stuckTxQueueFix === false)
                                    continue;
                            }
                        }
                    }
                    const hasSeenVote = queueEntry.receivedBestVote != null || queueEntry.ourVote != null;
                    const hasSeenConfirmation = queueEntry.receivedBestConfirmation != null;
                    if (configContext.stateManager.removeStuckTxsFromQueue === true && txAge > configContext.stateManager.stuckTxRemoveTime) {
                        this.statemanager_fatal(`txSafelyRemoved_1`, `stuck_in_consensus_3 txid: ${shortID} state: ${queueEntry.state} age:${txAge}`);
                        if (logFlags.txCancel)
                            this.statemanager_fatal(`txSafelyRemoved_1_dump`, `${this.getDebugQueueInfo(queueEntry)}`);
                        this.removeFromQueue(queueEntry, currentIndex);
                        continue;
                    }
                    if (configContext.stateManager.removeStuckTxsFromQueue2 === true) {
                        const timeSinceLastVoteMessage = queueEntry.lastVoteReceivedTimestamp > 0 ? currentTime - queueEntry.lastVoteReceivedTimestamp : 0;
                        if (timeSinceLastVoteMessage > configContext.stateManager.stuckTxRemoveTime2) {
                            this.statemanager_fatal(`txSafelyRemoved_2`, `stuck_in_consensus_2. waiting for votes. txid: ${shortID} state: ${queueEntry.state} age:${txAge} tx first vote seen ${timeSinceLastVoteMessage / 1000} seconds ago`);
                            if (logFlags.txCancel)
                                this.statemanager_fatal(`txSafelyRemoved_2_dump`, `${this.getDebugQueueInfo(queueEntry)}`);
                            this.removeFromQueue(queueEntry, currentIndex);
                            continue;
                        }
                    }
                    if (configContext.stateManager.removeStuckTxsFromQueue3 === true) {
                        if (queueEntry.state === 'consensing' && txAge > configContext.stateManager.stuckTxRemoveTime3) {
                            const anyVotes = (queueEntry.lastVoteReceivedTimestamp > 0);
                            this.statemanager_fatal(`txSafelyRemoved_3`, `stuck_in_consensus_3. txid: ${shortID} state: ${queueEntry.state} age:${txAge}`);
                            if (logFlags.txCancel)
                                this.statemanager_fatal(`txSafelyRemoved_3_dump`, `${this.getDebugQueueInfo(queueEntry)}`);
                            this.removeFromQueue(queueEntry, currentIndex);
                            continue;
                        }
                    }
                    if (txAge > timeM3 + configContext.stateManager.confirmationSeenExpirationTime + 10000) {
                        if (configContext.stateManager.disableTxExpiration && hasSeenVote && queueEntry.firstVoteReceivedTimestamp > 0) {
                            if (this.config.stateManager.txStateMachineChanges) {
                                if (configContext.stateManager.stuckTxQueueFix) {
                                    if (configContext.stateManager.singleAccountStuckFix) {
                                        const timeSinceVoteSeen = shardusGetTime() - queueEntry.firstVoteReceivedTimestamp;
                                        if (queueEntry.state === 'consensing' && timeSinceVoteSeen > configContext.stateManager.stuckTxMoveTime) {
                                            this.updateTxState(queueEntry, 'await final data');
                                        }
                                    }
                                    else {
                                        if (queueEntry.state !== 'await final data' && queueEntry.state !== 'await repair')
                                            this.updateTxState(queueEntry, 'await final data');
                                    }
                                }
                                else {
                                    this.updateTxState(queueEntry, 'await final data', 'processTx4');
                                }
                            }
                            else {
                                this.updateTxState(queueEntry, 'consensing');
                            }
                            if (configContext.stateManager.stuckTxQueueFix === false)
                                continue;
                        }
                        if (configContext.stateManager.disableTxExpiration === false) {
                            this.setTXExpired(queueEntry, currentIndex, 'txAge > timeM3 + confirmSeenExpirationTime + 10s');
                            continue;
                        }
                    }
                    else if (txAge > timeM3 + configContext.stateManager.confirmationSeenExpirationTime) {
                        let shouldExpire = true;
                        if (queueEntry.hasRobustConfirmation && queueEntry.isInExecutionHome) {
                            shouldExpire = false;
                        }
                        if (shouldExpire && configContext.stateManager.disableTxExpiration === false) {
                            this.setTXExpired(queueEntry, currentIndex, 'txAge > timeM3 + confirmSeenExpirationTime general case has' +
                                ' vote and robust confirmation but fail' +
                                ' to' +
                                ' commit the tx');
                            continue;
                        }
                    }
                    else if (txAge > timeM3 + configContext.stateManager.voteSeenExpirationTime && hasSeenVote && !hasSeenConfirmation) {
                        if (configContext.stateManager.disableTxExpiration === false) {
                            this.mainLogger.error(`${queueEntry.logID} txAge > timeM3 + voteSeenExpirationTime general case has vote but fail to generate receipt`);
                            this.setTXExpired(queueEntry, currentIndex, 'txAge > timeM3 + voteSeenExpirationTime general case has vote but fail' +
                                ' to' +
                                ' commit the tx');
                            continue;
                        }
                    }
                    else if (txAge > timeM3 + configContext.stateManager.noVoteSeenExpirationTime && !hasSeenVote) {
                        if (configContext.stateManager.disableTxExpiration === false) {
                            this.setTXExpired(queueEntry, currentIndex, 'txAge > timeM3 + noVoteSeenExpirationTime general case. no vote seen');
                            continue;
                        }
                    }
                    if (txAge > timeM2) {
                        let expireTx = false;
                        let reason = '';
                        if (queueEntry.requestingReceiptFailed) {
                            expireTx = true;
                            reason = 'requestingReceiptFailed';
                        }
                        if (queueEntry.repairFailed) {
                            expireTx = true;
                            reason = 'repairFailed';
                        }
                        if (expireTx) {
                            this.statemanager_fatal(`txExpired3 > M2. fail ${reason}`, `txExpired txAge > timeM2 fail ${reason} ` +
                                `txid: ${shortID} state: ${queueEntry.state} hasAll:${queueEntry.hasAll} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} age:${txAge}`);
                            if (configContext.stateManager.disableTxExpiration === false) {
                                this.setTXExpired(queueEntry, currentIndex, 'm2 ' + reason);
                            }
                        }
                    }
                    const isConsensing = queueEntry.state === 'consensing';
                    const isAwaitingFinalData = queueEntry.state === 'await final data';
                    const isInExecutionHome = queueEntry.isInExecutionHome;
                    const signedReceipt = this.stateManager.getSignedReceipt(queueEntry);
                    const hasReceipt = signedReceipt != null;
                    const hasCastVote = queueEntry.ourVote != null;
                    let extraTime = 0;
                    let matchingReceipt = false;
                    if (isInExecutionHome && isConsensing && hasReceipt === false) {
                        extraTime = timeM * 0.5;
                    }
                    if (isInExecutionHome && hasReceipt) {
                        matchingReceipt = this.stateManager.transactionConsensus.hasAppliedReceiptMatchingPreApply(queueEntry, null);
                        extraTime = timeM;
                    }
                    if (extraTime < timeM && hasCastVote === true) {
                        const ageDiff = queueEntry.voteCastAge + timeM - timeM3;
                        if (ageDiff > 0) {
                            extraTime = ageDiff;
                        }
                    }
                    if (isAwaitingFinalData) {
                        if (hasReceipt) {
                            extraTime = timeM2 * 1.5;
                        }
                        else {
                            extraTime = timeM;
                        }
                    }
                    if (extraTime > 0) {
                        extraTime = Math.ceil(extraTime / 500) * 500;
                        if (extraTime > timeM) {
                            extraTime = timeM;
                        }
                    }
                    if (txAge > timeM3 + extraTime && queueEntry.isInExecutionHome && queueEntry.almostExpired == null && configContext.stateManager.disableTxExpiration === false) {
                        const hasVoted = queueEntry.ourVote != null;
                        const receivedVote = queueEntry.receivedBestVote != null;
                        if (!receivedVote && !hasVoted && queueEntry.almostExpired == null) {
                            this.statemanager_fatal(`setTxAlmostExpired > M3. general case`, `setTxAlmostExpired txAge > timeM3 general case ` +
                                `txid: ${shortID} state: ${queueEntry.state} hasAll:${queueEntry.hasAll} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} age:${txAge}  hasReceipt:${hasReceipt} matchingReceipt:${matchingReceipt} isInExecutionHome:${isInExecutionHome} hasVote: ${queueEntry.receivedBestVote != null}`);
                            this.setTxAlmostExpired(queueEntry, currentIndex, 'm3 general: almostExpired not voted or received vote');
                        }
                    }
                }
                const txStartTime = shardusGetTime();
                try {
                    pushedProfilerTag = queueEntry.state;
                    if (queueEntry.state === 'syncing') {
                        if (queueEntry.syncCounter <= 0) {
                            queueEntry.waitForReceiptOnly = true;
                            if (this.config.stateManager.txStateMachineChanges) {
                            }
                            else {
                                this.updateTxState(queueEntry, 'await final data', 'processTx5');
                            }
                        }
                        this.processQueue_markAccountsSeen(seenAccounts, queueEntry);
                    }
                    else if (queueEntry.state === 'aging') {
                        queueEntry.executionDebug = { a: 'go' };
                        this.updateTxState(queueEntry, 'processing');
                        this.processQueue_markAccountsSeen(seenAccounts, queueEntry);
                    }
                    if (queueEntry.state === 'processing') {
                        if (this.processQueue_accountSeen(seenAccounts, queueEntry) === false) {
                            this.processQueue_markAccountsSeen(seenAccounts, queueEntry);
                            const time = shardusGetTime();
                            try {
                                const awaitStart = shardusGetTime();
                                if (this.executeInOneShard === true) {
                                    this.setDebugLastAwaitedCall('this.stateManager.transactionQueue.tellCorrespondingNodes(queueEntry)');
                                    if (configContext.p2p.useFactCorrespondingTell) {
                                        await this.factTellCorrespondingNodes(queueEntry);
                                    }
                                    else {
                                        await this.tellCorrespondingNodes(queueEntry);
                                    }
                                    this.setDebugLastAwaitedCall('this.stateManager.transactionQueue.tellCorrespondingNodes(queueEntry)', DebugComplete.Completed);
                                }
                                else {
                                    this.setDebugLastAwaitedCall('this.stateManager.transactionQueue.tellCorrespondingNodesOld(queueEntry)');
                                    if (configContext.p2p.useFactCorrespondingTell) {
                                        await this.factTellCorrespondingNodes(queueEntry);
                                    }
                                    else {
                                        await this.tellCorrespondingNodes(queueEntry);
                                    }
                                    this.setDebugLastAwaitedCall('this.stateManager.transactionQueue.tellCorrespondingNodesOld(queueEntry)', DebugComplete.Completed);
                                }
                                queueEntry.dataSharedTimestamp = shardusGetTime();
                                this.updateSimpleStatsObject(processStats.awaitStats, 'tellCorrespondingNodes', shardusGetTime() - awaitStart);
                            }
                            catch (ex) {
                                this.statemanager_fatal(`processAcceptedTxQueue2_ex`, 'processAcceptedTxQueue2 tellCorrespondingNodes:' +
                                    ex.name +
                                    ': ' +
                                    ex.message +
                                    ' at ' +
                                    ex.stack);
                                queueEntry.dataSharedTimestamp = shardusGetTime();
                                queueEntry.executionDebug.process1 = 'tell fail';
                            }
                            finally {
                                this.updateTxState(queueEntry, 'awaiting data', 'mainLoop');
                                if (queueEntry.globalModification === false &&
                                    this.executeInOneShard &&
                                    queueEntry.isInExecutionHome === false) {
                                    this.updateTxState(queueEntry, 'consensing', 'fromProcessing');
                                }
                            }
                            queueEntry.executionDebug.processElapsed = shardusGetTime() - time;
                        }
                        else {
                            const upstreamTx = this.processQueue_getUpstreamTx(seenAccounts, queueEntry);
                            if (upstreamTx == null) {
                                if (logFlags.seqdiagram && queueEntry?.upStreamBlocker !== 'null') {
                                    queueEntry.upStreamBlocker = 'null';
                                }
                            }
                            else {
                                if (upstreamTx.logID === queueEntry.logID) {
                                    if (logFlags.seqdiagram && queueEntry?.upStreamBlocker !== upstreamTx.logID) {
                                        queueEntry.upStreamBlocker = upstreamTx.logID;
                                    }
                                    if (upstreamTx === queueEntry) {
                                    }
                                    else {
                                    }
                                }
                                else {
                                    if (logFlags.seqdiagram && queueEntry?.upStreamBlocker !== upstreamTx.logID) {
                                        queueEntry.upStreamBlocker = upstreamTx.logID;
                                    }
                                }
                            }
                        }
                        this.processQueue_markAccountsSeen(seenAccounts, queueEntry);
                    }
                    if (queueEntry.state === 'awaiting data') {
                        queueEntry.executionDebug.log = 'entered awaiting data';
                        if (queueEntry.hasAll === false && txAge > timeM2) {
                            this.processQueue_markAccountsSeen(seenAccounts, queueEntry);
                            if (queueEntry.pendingDataRequest === true) {
                                continue;
                            }
                            if (this.queueEntryHasAllData(queueEntry) === true) {
                                continue;
                            }
                            if (this.config.stateManager.awaitingDataCanBailOnReceipt) {
                                const signedReceipt = this.stateManager.getSignedReceipt(queueEntry);
                                if (signedReceipt != null) {
                                    this.updateTxState(queueEntry, 'await final data', 'receipt while waiting for initial data');
                                    continue;
                                }
                            }
                            if (this.config.stateManager.requestAwaitedDataAllowed) {
                                try {
                                    this.queueEntryRequestMissingData(queueEntry);
                                }
                                catch (ex) {
                                    this.statemanager_fatal(`processAcceptedTxQueue2_missingData`, 'processAcceptedTxQueue2 queueEntryRequestMissingData:' +
                                        ex.name +
                                        ': ' +
                                        ex.message +
                                        ' at ' +
                                        ex.stack);
                                }
                            }
                        }
                        else if (queueEntry.hasAll) {
                            queueEntry.executionDebug.log1 = 'has all';
                            if (this.processQueue_accountSeen(seenAccounts, queueEntry) === false) {
                                this.processQueue_markAccountsSeen(seenAccounts, queueEntry);
                                try {
                                    const accountsValid = this.checkAccountTimestamps(queueEntry);
                                    if (accountsValid === false) {
                                        this.updateTxState(queueEntry, 'consensing');
                                        queueEntry.preApplyTXResult = {
                                            applied: false,
                                            passed: false,
                                            applyResult: 'failed account TS checks',
                                            reason: 'apply result',
                                            applyResponse: null,
                                        };
                                        continue;
                                    }
                                    if (queueEntry.transactionGroup.length > 1) {
                                        queueEntry.robustAccountDataPromises = {};
                                    }
                                    queueEntry.executionDebug.log2 = 'call pre apply';
                                    const awaitStart = shardusGetTime();
                                    this.setDebugLastAwaitedCall('this.stateManager.transactionQueue.preApplyTransaction(queueEntry)');
                                    let txResult = undefined;
                                    if (this.config.stateManager.transactionApplyTimeout > 0) {
                                        txResult = await withTimeout<PreApplyAcceptedTransactionResult>(() => this.preApplyTransaction(queueEntry), this.config.stateManager.transactionApplyTimeout);
                                        if (txResult === 'timeout') {
                                            txResult = null;
                                            this.statemanager_fatal('timeout-preApply', `preApplyTransaction timed out for txid: ${queueEntry.logID} ${this.getDebugProccessingStatus()}`);
                                            this.stateManager.forceUnlockAllFifoLocks('timeout-preApply');
                                        }
                                    }
                                    else {
                                        txResult = await this.preApplyTransaction(queueEntry);
                                    }
                                    this.setDebugLastAwaitedCall('this.stateManager.transactionQueue.preApplyTransaction(queueEntry)', DebugComplete.Completed);
                                    this.updateSimpleStatsObject(processStats.awaitStats, 'preApplyTransaction', shardusGetTime() - awaitStart);
                                    queueEntry.executionDebug.log3 = 'called pre apply';
                                    queueEntry.executionDebug.txResult = txResult;
                                    if (configContext.stateManager.forceVoteForFailedPreApply || (txResult && txResult.applied === true)) {
                                        this.updateTxState(queueEntry, 'consensing');
                                        queueEntry.preApplyTXResult = txResult;
                                        for (const key of Object.keys(queueEntry.collectedData)) {
                                            const wrappedAccount = queueEntry.collectedData[key];
                                            const { timestamp, hash } = this.app.getTimestampAndHashFromAccount(wrappedAccount.data);
                                            if (wrappedAccount.timestamp != timestamp) {
                                                wrappedAccount.timestamp = timestamp;
                                            }
                                            if (wrappedAccount.stateId != hash) {
                                                wrappedAccount.stateId = hash;
                                            }
                                        }
                                        if (queueEntry.noConsensus === true) {
                                            this.updateTxState(queueEntry, 'commiting');
                                            queueEntry.hasValidFinalData = true;
                                        }
                                        else {
                                            const awaitStart = shardusGetTime();
                                            queueEntry.voteCastAge = txAge;
                                            this.setDebugLastAwaitedCall('this.stateManager.transactionConsensus.createAndShareVote(queueEntry)');
                                            await this.stateManager.transactionConsensus.createAndShareVote(queueEntry);
                                            this.setDebugLastAwaitedCall('this.stateManager.transactionConsensus.createAndShareVote(queueEntry)', DebugComplete.Completed);
                                            this.updateSimpleStatsObject(processStats.awaitStats, 'createAndShareVote', shardusGetTime() - awaitStart);
                                        }
                                    }
                                    else {
                                        if (logFlags.error)
                                            this.mainLogger.error(`processAcceptedTxQueue2 txResult problem txid:${queueEntry.logID} res: ${utils.stringifyReduce(txResult)} `);
                                        queueEntry.waitForReceiptOnly = true;
                                        this.updateTxState(queueEntry, 'consensing');
                                    }
                                }
                                catch (ex) {
                                    this.statemanager_fatal(`processAcceptedTxQueue2b_ex`, 'processAcceptedTxQueue2 preApplyAcceptedTransaction:' +
                                        ex.name +
                                        ': ' +
                                        ex.message +
                                        ' at ' +
                                        ex.stack);
                                }
                                finally {
                                }
                            }
                            else {
                                queueEntry.executionDebug.logBusy = 'has all, but busy';
                            }
                            this.processQueue_markAccountsSeen(seenAccounts, queueEntry);
                        }
                        else {
                            this.processQueue_markAccountsSeen(seenAccounts, queueEntry);
                        }
                    }
                    else if (queueEntry.state === 'consensing') {
                        if (this.processQueue_accountSeen(seenAccounts, queueEntry) === false) {
                            this.processQueue_markAccountsSeen(seenAccounts, queueEntry);
                            let didNotMatchReceipt = false;
                            let finishedConsensing = false;
                            let result: SignedReceipt;
                            const receipt2 = queueEntry.receivedSignedReceipt ?? queueEntry.signedReceipt;
                            if (receipt2 != null) {
                                result = queueEntry.signedReceipt;
                            }
                            else {
                                result = await this.stateManager.transactionConsensus.tryProduceReceipt(queueEntry);
                            }
                            const signedReceipt = this.stateManager.getSignedReceipt(queueEntry);
                            if (signedReceipt != null) {
                                if (logFlags.debug || this.stateManager.consensusLog) {
                                }
                                const isReceiptMatchPreApply = this.stateManager.transactionConsensus.hasAppliedReceiptMatchingPreApply(queueEntry, result);
                                if (logFlags.debug || this.stateManager.consensusLog) {
                                }
                                if (isReceiptMatchPreApply && queueEntry.isInExecutionHome) {
                                    if (this.stateManager.getReceiptProposal(queueEntry).cant_preApply === false &&
                                        this.stateManager.getReceiptResult(queueEntry) === true) {
                                        this.updateTxState(queueEntry, 'commiting');
                                        queueEntry.hasValidFinalData = true;
                                        finishedConsensing = true;
                                    }
                                    else {
                                        if (logFlags.debug || this.stateManager.consensusLog) {
                                            this.statemanager_fatal(`processAcceptedTxQueue2`, `tryProduceReceipt failed result: false : ${queueEntry.logID} ${utils.stringifyReduce(result)}`);
                                        }
                                        this.updateTxState(queueEntry, 'fail');
                                        this.removeFromQueue(queueEntry, currentIndex);
                                        continue;
                                    }
                                    if (queueEntry.globalModification === false &&
                                        finishedConsensing === true &&
                                        this.executeInOneShard &&
                                        queueEntry.isInExecutionHome) {
                                        const awaitStart = shardusGetTime();
                                        if (configContext.stateManager.attachDataToReceipt === false) {
                                            if (configContext.p2p.useFactCorrespondingTell) {
                                                this.factTellCorrespondingNodesFinalData(queueEntry);
                                            }
                                            else {
                                                this.tellCorrespondingNodesFinalData(queueEntry);
                                            }
                                        }
                                        this.updateSimpleStatsObject(processStats.awaitStats, 'tellCorrespondingNodesFinalData', shardusGetTime() - awaitStart);
                                    }
                                }
                                else {
                                    if (this.stateManager.getReceiptResult(queueEntry) === false) {
                                        if (logFlags.verbose)
                                            this.statemanager_fatal(`consensing: on a failed receipt`, `consensing: got a failed receipt for ` +
                                                `txid: ${shortID} state: ${queueEntry.state} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} age:${txAge}`);
                                        if (logFlags.debug || this.stateManager.consensusLog) {
                                            this.statemanager_fatal(`processAcceptedTxQueue2`, `tryProduceReceipt failed result: false : ${queueEntry.logID} ${utils.stringifyReduce(result)}`);
                                        }
                                        this.updateTxState(queueEntry, 'fail');
                                        this.removeFromQueue(queueEntry, currentIndex);
                                        continue;
                                    }
                                    didNotMatchReceipt = true;
                                    queueEntry.signedReceiptForRepair = result;
                                    if (queueEntry.isInExecutionHome === false && queueEntry.signedReceipt != null) {
                                        this.updateTxState(queueEntry, 'await final data', 'processTx7');
                                    }
                                }
                            }
                            if (finishedConsensing === false) {
                                if (hasReceivedApplyReceipt && queueEntry.receivedSignedReceipt != null) {
                                    if (this.stateManager.transactionConsensus.hasAppliedReceiptMatchingPreApply(queueEntry, queueEntry.receivedSignedReceipt)) {
                                        if (this.stateManager.getReceiptProposal(queueEntry).cant_preApply === false &&
                                            this.stateManager.getReceiptResult(queueEntry) === true) {
                                            this.updateTxState(queueEntry, 'commiting');
                                            queueEntry.hasValidFinalData = true;
                                            finishedConsensing = true;
                                        }
                                        else {
                                            this.removeFromQueue(queueEntry, currentIndex);
                                            this.updateTxState(queueEntry, 'fail');
                                            continue;
                                        }
                                    }
                                    else {
                                        didNotMatchReceipt = true;
                                        queueEntry.signedReceiptForRepair = queueEntry.receivedSignedReceipt;
                                        queueEntry.signedReceiptForRepair = this.stateManager.getSignedReceipt(queueEntry);
                                    }
                                }
                                else {
                                }
                                if (didNotMatchReceipt === true && queueEntry.isInExecutionHome) {
                                    if (queueEntry.debugFail_failNoRepair) {
                                        this.updateTxState(queueEntry, 'fail');
                                        this.removeFromQueue(queueEntry, currentIndex);
                                        this.statemanager_fatal(`processAcceptedTxQueue_debugFail_failNoRepair2`, `processAcceptedTxQueue_debugFail_failNoRepair2 tx: ${shortID} cycle:${queueEntry.cycleToRecordOn}  accountkeys: ${utils.stringifyReduce(queueEntry.uniqueWritableKeys)}`);
                                        this.processQueue_clearAccountsSeen(seenAccounts, queueEntry);
                                        continue;
                                    }
                                    queueEntry.repairFinished = false;
                                    if (queueEntry.signedReceiptForRepair.proposal.applied === true) {
                                        if (configContext.stateManager.noRepairIfDataAttached && configContext.stateManager.attachDataToReceipt) {
                                            this.updateTxState(queueEntry, 'await final data');
                                        }
                                        else {
                                            this.stateManager.getTxRepair().repairToMatchReceipt(queueEntry);
                                            this.updateTxState(queueEntry, 'await repair');
                                        }
                                        continue;
                                    }
                                    else {
                                        this.statemanager_fatal(`consensing: repairToMatchReceipt failed`, `consensing: repairToMatchReceipt failed ` +
                                            `txid: ${shortID} state: ${queueEntry.state} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} age:${txAge}`);
                                        this.removeFromQueue(queueEntry, currentIndex);
                                        this.updateTxState(queueEntry, 'fail');
                                        continue;
                                    }
                                }
                            }
                        }
                        else {
                        }
                        this.processQueue_markAccountsSeen(seenAccounts, queueEntry);
                    }
                    if (queueEntry.state === 'await repair') {
                        this.processQueue_markAccountsSeen(seenAccounts, queueEntry);
                        if (queueEntry.repairFinished === true) {
                            if (queueEntry.signedReceiptForRepair.proposal.applied === true) {
                                this.updateTxState(queueEntry, 'pass');
                            }
                            else {
                                this.updateTxState(queueEntry, 'fail');
                            }
                            this.removeFromQueue(queueEntry, currentIndex);
                            continue;
                        }
                        else if (queueEntry.repairFailed === true) {
                            this.updateTxState(queueEntry, 'fail');
                            this.removeFromQueue(queueEntry, currentIndex);
                            continue;
                        }
                    }
                    if (queueEntry.state === 'await final data') {
                        if (this.processQueue_accountSeen(seenAccounts, queueEntry) === false) {
                            this.processQueue_markAccountsSeen(seenAccounts, queueEntry);
                            if (configContext.stateManager.attachDataToReceipt && queueEntry.accountDataSet === true) {
                                this.removeFromQueue(queueEntry, currentIndex);
                                continue;
                            }
                            const signedReceipt = this.stateManager.getSignedReceipt(queueEntry);
                            const timeSinceAwaitFinalStart = queueEntry.txDebug.startTimestamp['await final data'] > 0 ? shardusGetTime() - queueEntry.txDebug.startTimestamp['await final data'] : 0;
                            const accountsNotStored = new Set();
                            if (signedReceipt) {
                                let failed = false;
                                let incomplete = false;
                                let skipped = 0;
                                const missingAccounts = [];
                                const nodeShardData: StateManagerTypes.shardFunctionTypes.NodeShardData = this.stateManager.currentCycleShardData.nodeShardData;
                                for (let i = 0; i < signedReceipt.proposal.accountIDs.length; i++) {
                                    const accountID = signedReceipt.proposal.accountIDs[i];
                                    const accountHash = signedReceipt.proposal.afterStateHashes[i];
                                    if (ShardFunctions.testAddressInRange(accountID, nodeShardData.storedPartitions) === false) {
                                        skipped++;
                                        accountsNotStored.add(accountID);
                                        continue;
                                    }
                                    const wrappedAccount = queueEntry.collectedFinalData[accountID];
                                    if (wrappedAccount == null) {
                                        incomplete = true;
                                        queueEntry.debug.waitingOn = accountID;
                                        missingAccounts.push(accountID);
                                    }
                                    if (wrappedAccount && wrappedAccount.stateId != accountHash) {
                                        failed = true;
                                        break;
                                    }
                                }
                                if (incomplete && missingAccounts.length > 0) {
                                    let shouldStartFinalDataRequest = false;
                                    if (timeSinceAwaitFinalStart > 5000) {
                                        shouldStartFinalDataRequest = true;
                                    }
                                    else if (txAge > timeM3) {
                                        shouldStartFinalDataRequest = true;
                                    }
                                    const timeSinceLastFinalDataRequest = shardusGetTime() - queueEntry.lastFinalDataRequestTimestamp;
                                    if (this.config.stateManager.canRequestFinalData && shouldStartFinalDataRequest && timeSinceLastFinalDataRequest > 5000) {
                                        this.requestFinalData(queueEntry, missingAccounts);
                                        queueEntry.lastFinalDataRequestTimestamp = shardusGetTime();
                                        continue;
                                    }
                                }
                                else {
                                }
                                if (failed === true) {
                                    this.stateManager.getTxRepair().repairToMatchReceipt(queueEntry);
                                    this.updateTxState(queueEntry, 'await repair');
                                    continue;
                                }
                                if (failed === false && incomplete === false) {
                                    queueEntry.hasValidFinalData = true;
                                    const rawAccounts = [];
                                    const accountRecords: Shardus.WrappedData[] = [];
                                    for (let i = 0; i < signedReceipt.proposal.accountIDs.length; i++) {
                                        const accountID = signedReceipt.proposal.accountIDs[i];
                                        if (accountsNotStored.has(accountID)) {
                                            continue;
                                        }
                                        const wrappedAccount = queueEntry.collectedFinalData[accountID];
                                        rawAccounts.push(wrappedAccount.data);
                                        accountRecords.push(wrappedAccount);
                                    }
                                    const awaitStart = shardusGetTime();
                                    this.setDebugLastAwaitedCall('this.stateManager.transactionConsensus.checkAndSetAccountData()');
                                    await this.stateManager.checkAndSetAccountData(accountRecords, `txId: ${queueEntry.logID} awaitFinalData_passed`, false);
                                    this.setDebugLastAwaitedCall('this.stateManager.transactionConsensus.checkAndSetAccountData()', DebugComplete.Completed);
                                    queueEntry.accountDataSet = true;
                                    this.app.transactionReceiptPass(queueEntry.acceptedTx.data, queueEntry.collectedFinalData, queueEntry?.preApplyTXResult?.applyResponse, false);
                                    this.updateSimpleStatsObject(processStats.awaitStats, 'checkAndSetAccountData', shardusGetTime() - awaitStart);
                                    if (queueEntry != null &&
                                        queueEntry.transactionGroup != null &&
                                        this.p2p.getNodeId() === queueEntry.transactionGroup[0].id) {
                                        if (queueEntry.globalModification === false) {
                                            this.stateManager.eventEmitter.emit('txProcessed');
                                        }
                                    }
                                    if (queueEntry.receivedSignedReceipt?.proposal?.applied === true ||
                                        queueEntry.signedReceipt?.proposal?.applied === true) {
                                        this.updateTxState(queueEntry, 'pass');
                                    }
                                    else {
                                        if (logFlags.debug)
                                            this.mainLogger.error(`shrd_awaitFinalData_fail : ${queueEntry.logID} no receivedSignedReceipt. signedReceipt: ${utils.stringifyReduce(queueEntry.signedReceipt)}`);
                                        this.updateTxState(queueEntry, 'fail');
                                    }
                                    this.removeFromQueue(queueEntry, currentIndex);
                                }
                            }
                            else {
                            }
                        }
                        else {
                            const upstreamTx = this.processQueue_getUpstreamTx(seenAccounts, queueEntry);
                            if (queueEntry.executionDebug == null)
                                queueEntry.executionDebug = {};
                            queueEntry.executionDebug.logFinalData = `has all final data, but busy. upstreamTx: ${upstreamTx?.logID}`;
                            if (upstreamTx == null) {
                                queueEntry.executionDebug.logFinalData = `has all final data, but busy. upstreamTx: null`;
                            }
                            else {
                                if (upstreamTx.acceptedTx.txId === queueEntry.acceptedTx.txId) {
                                }
                                else {
                                }
                            }
                        }
                    }
                    if (queueEntry.state === 'commiting') {
                        if (this.processQueue_accountSeen(seenAccounts, queueEntry) === false) {
                            this.processQueue_markAccountsSeen(seenAccounts, queueEntry);
                            if (queueEntry.debugFail_failNoRepair) {
                                this.updateTxState(queueEntry, 'fail');
                                this.removeFromQueue(queueEntry, currentIndex);
                                this.statemanager_fatal(`processAcceptedTxQueue_debugFail_failNoRepair`, `processAcceptedTxQueue_debugFail_failNoRepair tx: ${shortID} cycle:${queueEntry.cycleToRecordOn}  accountkeys: ${utils.stringifyReduce(queueEntry.uniqueWritableKeys)}`);
                                this.processQueue_clearAccountsSeen(seenAccounts, queueEntry);
                                continue;
                            }
                            const wrappedStates = queueEntry.collectedData;
                            try {
                                let canCommitTX = true;
                                let hasReceiptFail = false;
                                if (queueEntry.noConsensus === true) {
                                    if (queueEntry.preApplyTXResult.passed === false) {
                                        canCommitTX = false;
                                    }
                                }
                                else if (queueEntry.signedReceipt != null) {
                                    if (queueEntry.signedReceipt.proposal.applied === false) {
                                        canCommitTX = false;
                                        hasReceiptFail = true;
                                    }
                                }
                                else if (queueEntry.receivedSignedReceipt != null) {
                                    if (queueEntry.receivedSignedReceipt.proposal.applied === false) {
                                        canCommitTX = false;
                                        if (configContext.stateManager.receiptRemoveFix) {
                                            hasReceiptFail = true;
                                        }
                                        else {
                                            hasReceiptFail = false;
                                        }
                                    }
                                }
                                else {
                                    canCommitTX = false;
                                }
                                if (canCommitTX) {
                                    const awaitStart = shardusGetTime();
                                    this.setDebugLastAwaitedCall('this.stateManager.transactionConsensus.commitConsensedTransaction()');
                                    await this.commitConsensedTransaction(queueEntry);
                                    this.setDebugLastAwaitedCall('this.stateManager.transactionConsensus.commitConsensedTransaction()', DebugComplete.Completed);
                                    this.updateSimpleStatsObject(processStats.awaitStats, 'commitConsensedTransaction', shardusGetTime() - awaitStart);
                                    if (queueEntry.repairFinished) {
                                        this.statemanager_fatal(`processAcceptedTxQueue_commitingRepairedReceipt`, `${shortID} `);
                                    }
                                    if (queueEntry.hasValidFinalData === false) {
                                        queueEntry.hasValidFinalData = true;
                                    }
                                }
                                if (this.config.p2p.experimentalSnapshot)
                                    this.addReceiptToForward(queueEntry, 'commit');
                                if (hasReceiptFail) {
                                    const applyReponse = queueEntry.preApplyTXResult.applyResponse;
                                    this.app.transactionReceiptFail(queueEntry.acceptedTx.data, wrappedStates, applyReponse);
                                }
                            }
                            catch (ex) {
                                this.statemanager_fatal(`processAcceptedTxQueue2b_ex`, 'processAcceptedTxQueue2 commiting Transaction:' +
                                    ex.name +
                                    ': ' +
                                    ex.message +
                                    ' at ' +
                                    ex.stack);
                            }
                            finally {
                                this.processQueue_clearAccountsSeen(seenAccounts, queueEntry);
                                if (queueEntry.noConsensus === true) {
                                    if (queueEntry.preApplyTXResult.passed === true) {
                                        this.updateTxState(queueEntry, 'pass');
                                    }
                                    else {
                                        this.updateTxState(queueEntry, 'fail');
                                    }
                                }
                                else if (queueEntry.signedReceipt != null) {
                                    if (queueEntry.signedReceipt.proposal.applied === true) {
                                        this.updateTxState(queueEntry, 'pass');
                                    }
                                    else {
                                        this.updateTxState(queueEntry, 'fail');
                                    }
                                }
                                else if (queueEntry.receivedSignedReceipt != null) {
                                    if (queueEntry.receivedSignedReceipt.proposal.applied === true) {
                                        this.updateTxState(queueEntry, 'pass');
                                    }
                                    else {
                                        this.updateTxState(queueEntry, 'fail');
                                    }
                                }
                                else {
                                    this.updateTxState(queueEntry, 'fail');
                                    if (logFlags.error)
                                        this.mainLogger.error(`processAcceptedTxQueue2 commiting finished : no receipt ${queueEntry.logID} `);
                                }
                                this.removeFromQueue(queueEntry, currentIndex);
                            }
                        }
                    }
                    if (queueEntry.state === 'canceled') {
                        this.processQueue_clearAccountsSeen(seenAccounts, queueEntry);
                        this.removeFromQueue(queueEntry, currentIndex);
                    }
                }
                finally {
                    const txElapsed = shardusGetTime() - txStartTime;
                    if (queueEntry.state != pushedProfilerTag) {
                        processStats.stateChanged++;
                        this.updateSimpleStatsObject(processStats.stateChangedStats, pushedProfilerTag, txElapsed);
                    }
                    else {
                        processStats.sameState++;
                        this.updateSimpleStatsObject(processStats.sameStateStats, pushedProfilerTag, txElapsed);
                    }
                    pushedProfilerTag = null;
                }
            }
        }
        finally {
            if (pushedProfilerTag != null) {
                pushedProfilerTag = null;
            }
            const processTime = shardusGetTime() - startTime;
            processStats.totalTime = processTime;
            this.finalizeSimpleStatsObject(processStats.awaitStats);
            this.finalizeSimpleStatsObject(processStats.sameStateStats);
            this.finalizeSimpleStatsObject(processStats.stateChangedStats);
            this.lastProcessStats['latest'] = processStats;
            if (processTime > 10000) {
                this.statemanager_fatal(`processAcceptedTxQueue excceded time ${processTime / 1000} firstTime:${firstTime}`, `processAcceptedTxQueue excceded time ${processTime / 1000} firstTime:${firstTime} stats:${Utils.safeStringify(processStats)}`);
                this.lastProcessStats['10+'] = processStats;
            }
            else if (processTime > 5000) {
                if (logFlags.error)
                    this.mainLogger.error(`processTime > 5s ${processTime / 1000} stats:${Utils.safeStringify(processStats)}`);
                this.lastProcessStats['5+'] = processStats;
            }
            else if (processTime > 2000) {
                if (logFlags.error && logFlags.verbose)
                    this.mainLogger.error(`processTime > 2s ${processTime / 1000} stats:${Utils.safeStringify(processStats)}`);
                this.lastProcessStats['2+'] = processStats;
            }
            else if (processTime > 1000) {
                if (logFlags.error && logFlags.verbose)
                    this.mainLogger.error(`processTime > 1s ${processTime / 1000} stats:${Utils.safeStringify(processStats)}`);
                this.lastProcessStats['1+'] = processStats;
            }
            if (this._transactionQueue.length > 0 || this.pendingTransactionQueue.length > 0) {
                this.transactionQueueHasRemainingWork = true;
                setTimeout(() => {
                    this.stateManager.tryStartTransactionProcessingQueue();
                }, 15);
            }
            else {
                this.transactionQueueHasRemainingWork = false;
            }
            this.transactionProcessingQueueRunning = false;
            this.processingLastRunTime = shardusGetTime();
            this.stateManager.lastSeenAccountsMap = seenAccounts;
        }
    }
    private setTXExpired(queueEntry: QueueEntry, currentIndex: number, message: string): void {
        this.updateTxState(queueEntry, 'expired');
        this.removeFromQueue(queueEntry, currentIndex);
        this.app.transactionReceiptFail(queueEntry.acceptedTx.data, queueEntry.collectedData, queueEntry.preApplyTXResult?.applyResponse);
        this.stateManager.eventEmitter.emit('txExpired', queueEntry.acceptedTx.txId);
        if (queueEntry.signedReceiptFinal != null) {
            const startRepair = queueEntry.repairStarted === false;
            if (startRepair) {
                queueEntry.signedReceiptForRepair = queueEntry.signedReceiptFinal;
                this.stateManager.getTxRepair().repairToMatchReceipt(queueEntry);
            }
        }
        else {
        }
    }
    private setTxAlmostExpired(queueEntry: QueueEntry, currentIndex: number, message: string): void {
        queueEntry.almostExpired = true;
    }
    async getArchiverReceiptFromQueueEntry(queueEntry: QueueEntry): Promise<ArchiverReceipt> {
        if (!queueEntry.preApplyTXResult || !queueEntry.preApplyTXResult.applyResponse)
            return null as ArchiverReceipt;
        const txId = queueEntry.acceptedTx.txId;
        const timestamp = queueEntry.acceptedTx.timestamp;
        const globalModification = queueEntry.globalModification;
        let signedReceipt = null as SignedReceipt | P2PTypes.GlobalAccountsTypes.GlobalTxReceipt;
        let executionShardKey: string;
        if (globalModification) {
            signedReceipt = getGlobalTxReceipt(queueEntry.acceptedTx.txId) as P2PTypes.GlobalAccountsTypes.GlobalTxReceipt;
        }
        else {
            signedReceipt = this.stateManager.getSignedReceipt(queueEntry) as SignedReceipt;
            executionShardKey = queueEntry.executionShardKey;
        }
        if (!signedReceipt) {
            return null as ArchiverReceipt;
        }
        const accountsToAdd: {
            [accountId: string]: Shardus.AccountsCopy;
        } = {};
        const beforeAccountsToAdd: {
            [accountId: string]: Shardus.AccountsCopy;
        } = {};
        if (globalModification) {
            signedReceipt = signedReceipt as P2PTypes.GlobalAccountsTypes.GlobalTxReceipt;
            executionShardKey = signedReceipt.tx.source;
            if (signedReceipt.tx && signedReceipt.tx.addressHash != '' && !beforeAccountsToAdd[signedReceipt.tx.address]) {
                if (queueEntry.collectedData[signedReceipt.tx.address].stateId === signedReceipt.tx.addressHash) {
                    const isGlobal = this.stateManager.accountGlobals.isGlobalAccount(signedReceipt.tx.addressHash);
                    const account = queueEntry.collectedData[signedReceipt.tx.address];
                    const accountCopy = {
                        accountId: account.accountId,
                        data: account.data,
                        hash: account.stateId,
                        timestamp: account.timestamp,
                        isGlobal,
                    } as Shardus.AccountsCopy;
                    beforeAccountsToAdd[account.accountId] = accountCopy;
                }
                else {
                }
            }
        }
        else if (this.config.stateManager.includeBeforeStatesInReceipts) {
            if (configContext.mode === 'debug' && configContext.debug.beforeStateFailChance > Math.random()) {
                for (const accountId in queueEntry.collectedData) {
                    const account = queueEntry.collectedData[accountId];
                    account.stateId = 'debugFail2';
                }
            }
            const fileredBeforeStateToSend = [];
            const badBeforeStateAccounts = [];
            for (const account of Object.values(queueEntry.collectedData)) {
                if (typeof this.app.beforeStateAccountFilter !== 'function' ||
                    this.app.beforeStateAccountFilter(account)) {
                    fileredBeforeStateToSend.push(account.accountId);
                }
            }
            for (const accountId of fileredBeforeStateToSend) {
                signedReceipt = signedReceipt as SignedReceipt;
                const index = signedReceipt.proposal.accountIDs.indexOf(accountId);
                if (index === -1)
                    continue;
                const account = queueEntry.collectedData[accountId];
                if (account == null) {
                    badBeforeStateAccounts.push(accountId);
                    continue;
                }
                if (account.stateId !== signedReceipt.proposal.beforeStateHashes[index]) {
                    badBeforeStateAccounts.push(accountId);
                }
            }
            if (badBeforeStateAccounts.length > 0) {
                const wrappedResponses: WrappedResponses = await this.requestInitialData(queueEntry, badBeforeStateAccounts);
                for (const accountId in wrappedResponses) {
                    queueEntry.collectedData[accountId] = wrappedResponses[accountId];
                }
            }
            for (const accountId of fileredBeforeStateToSend) {
                const account = queueEntry.collectedData[accountId];
                const isGlobal = this.stateManager.accountGlobals.isGlobalAccount(account.accountId);
                const accountCopy = {
                    accountId: account.accountId,
                    data: account.data,
                    hash: account.stateId,
                    timestamp: account.timestamp,
                    isGlobal,
                } as Shardus.AccountsCopy;
                beforeAccountsToAdd[account.accountId] = accountCopy;
            }
        }
        let isAccountsMatchWithReceipt2 = true;
        const accountWrites = queueEntry.preApplyTXResult?.applyResponse?.accountWrites;
        if (globalModification) {
            if (accountWrites === null || accountWrites.length === 0) {
            }
        }
        else if (accountWrites != null && accountWrites.length === (signedReceipt as SignedReceipt).proposal.accountIDs.length) {
            signedReceipt = signedReceipt as SignedReceipt;
            for (const account of accountWrites) {
                const indexInVote = signedReceipt.proposal.accountIDs.indexOf(account.accountId);
                if (signedReceipt.proposal.afterStateHashes[indexInVote] !== account.data.stateId) {
                    isAccountsMatchWithReceipt2 = false;
                    break;
                }
            }
        }
        else {
            isAccountsMatchWithReceipt2 = false;
        }
        let finalAccounts = [];
        let appReceiptData = queueEntry.preApplyTXResult?.applyResponse?.appReceiptData || null;
        if (isAccountsMatchWithReceipt2) {
            finalAccounts = accountWrites;
        }
        else {
            signedReceipt = signedReceipt as SignedReceipt;
            let success = false;
            let count = 0;
            const maxRetry = 3;
            const nodesToAskKeys = signedReceipt.signaturePack?.map((signature) => signature.owner);
            while (success === false && count < maxRetry) {
                count++;
                const requestedData = await this.requestFinalData(queueEntry, signedReceipt.proposal.accountIDs, nodesToAskKeys, true);
                if (requestedData && requestedData.wrappedResponses && requestedData.appReceiptData) {
                    success = true;
                    for (const accountId in requestedData.wrappedResponses) {
                        finalAccounts.push(requestedData.wrappedResponses[accountId]);
                    }
                    appReceiptData = requestedData.appReceiptData;
                }
            }
        }
        for (const account of finalAccounts) {
            const isGlobal = this.stateManager.accountGlobals.isGlobalAccount(account.accountId);
            const accountCopy = {
                accountId: account.accountId,
                data: account.data.data,
                timestamp: account.timestamp,
                hash: account.data.stateId,
                isGlobal
            } as Shardus.AccountsCopy;
            accountsToAdd[account.accountId] = accountCopy;
        }
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
            executionShardKey,
            globalModification,
        };
        return archiverReceipt;
    }
    addOriginalTxDataToForward(queueEntry: QueueEntry): void {
        const { acceptedTx } = queueEntry;
        const originalTxData = {
            txId: acceptedTx.txId,
            originalTxData: acceptedTx.data,
            cycle: queueEntry.cycleToRecordOn,
            timestamp: acceptedTx.timestamp,
        };
        Archivers.instantForwardOriginalTxData(originalTxData);
    }
    async addReceiptToForward(queueEntry: QueueEntry, debugString = ''): Promise<void> {
        const archiverReceipt = await this.getArchiverReceiptFromQueueEntry(queueEntry);
        Archivers.instantForwardReceipts([archiverReceipt]);
        this.receiptsForwardedTimestamp = shardusGetTime();
        this.forwardedReceiptsByTimestamp.set(this.receiptsForwardedTimestamp, archiverReceipt);
    }
    getReceiptsToForward(): ArchiverReceipt[] {
        return [...this.forwardedReceiptsByTimestamp.values()];
    }
    async requestFinalData(queueEntry: QueueEntry, accountIds: string[], nodesToAskKeys: string[] | null = null, includeAppReceiptData = false): Promise<RequestFinalDataResp> {
        const message = { txid: queueEntry.acceptedTx.txId, accountIds, includeAppReceiptData };
        let success = false;
        let successCount = 0;
        let validAppReceiptData = includeAppReceiptData === false ? true : false;
        for (const accountId of accountIds) {
            if (queueEntry.collectedFinalData[accountId] != null) {
                successCount++;
            }
        }
        if (successCount === accountIds.length && includeAppReceiptData === false) {
            return;
        }
        try {
            let nodeToAsk: Shardus.Node;
            if (nodesToAskKeys && nodesToAskKeys.length > 0) {
                const randomIndex = Math.floor(Math.random() * nodesToAskKeys.length);
                const randomNodeToAskKey = nodesToAskKeys[randomIndex];
                nodeToAsk = byPubKey.get(randomNodeToAskKey);
            }
            else {
                const randomIndex = Math.floor(Math.random() * queueEntry.executionGroup.length);
                const randomExeNode = queueEntry.executionGroup[randomIndex];
                nodeToAsk = nodes.get(randomExeNode.id);
            }
            if (!nodeToAsk) {
                if (logFlags.error)
                    this.mainLogger.error('requestFinalData: could not find node from execution group');
                throw new Error('requestFinalData: could not find node from execution group');
            }
            const requestMessage = message as RequestTxAndStateReq;
            const response = await Comms.askBinary<RequestTxAndStateReq, RequestTxAndStateResp>(nodeToAsk, InternalRouteEnum.binary_request_tx_and_state, requestMessage, serializeRequestTxAndStateReq, deserializeRequestTxAndStateResp, {});
            if (response && response.stateList && response.stateList.length > 0) {
            }
            else {
                if (logFlags.error)
                    this.mainLogger.error(`requestFinalData: txid: ${queueEntry.logID} response is null`);
                return;
            }
            for (const data of response.stateList) {
                if (data == null) {
                    if (logFlags.error && logFlags.debug)
                        this.mainLogger.error(`requestFinalData data == null for tx ${queueEntry.logID}`);
                    success = false;
                    break;
                }
                const indexInVote = queueEntry.signedReceipt.proposal.accountIDs.indexOf(data.accountId);
                if (indexInVote === -1)
                    continue;
                const afterStateIdFromVote = queueEntry.signedReceipt.proposal.afterStateHashes[indexInVote];
                if (data.stateId !== afterStateIdFromVote) {
                    continue;
                }
                if (queueEntry.collectedFinalData[data.accountId] == null) {
                    queueEntry.collectedFinalData[data.accountId] = data;
                    successCount++;
                }
            }
            if (includeAppReceiptData && response.appReceiptData) {
                const receivedAppReceiptDataHash = this.crypto.hash(response.appReceiptData);
                const receipt2 = this.stateManager.getSignedReceipt(queueEntry);
                if (receipt2 != null) {
                    validAppReceiptData = receivedAppReceiptDataHash === receipt2.proposal.appReceiptDataHash;
                }
            }
            if (successCount === accountIds.length && validAppReceiptData === true) {
                success = true;
                queueEntry.hasValidFinalData = true;
                return { wrappedResponses: queueEntry.collectedFinalData, appReceiptData: response.appReceiptData };
            }
            else {
            }
        }
        catch (e) {
            if (logFlags.error)
                this.mainLogger.error(`requestFinalData: txid: ${queueEntry.logID} error: ${e.message}`);
        }
        finally {
            if (success === false) {
                if (logFlags.error)
                    this.mainLogger.error(`requestFinalData: txid: ${queueEntry.logID} failed. successCount: ${successCount} accountIds: ${accountIds.length}`);
            }
        }
    }
    async requestInitialData(queueEntry: QueueEntry, accountIds: string[]): Promise<WrappedResponses> {
        const message = { txid: queueEntry.acceptedTx.txId, accountIds };
        let success = false;
        let successCount = 0;
        let retries = 0;
        const maxRetry = 3;
        const triedNodes = new Set<string>();
        if (queueEntry.executionGroup == null)
            return;
        while (retries < maxRetry) {
            const executionNodeIds = queueEntry.executionGroup.map(node => node.id);
            const randomExeNodeId = utils.getRandom(executionNodeIds, 1)[0];
            if (triedNodes.has(randomExeNodeId))
                continue;
            if (randomExeNodeId === Self.id)
                continue;
            const nodeToAsk = nodes.get(randomExeNodeId);
            if (!nodeToAsk) {
                if (logFlags.error)
                    this.mainLogger.error('requestInitialData: could not find node from execution group');
                throw new Error('requestInitialData: could not find node from execution group');
            }
            triedNodes.add(randomExeNodeId);
            retries++;
            try {
                const requestMessage = message as RequestTxAndStateReq;
                const response = await Comms.askBinary<RequestTxAndStateReq, RequestTxAndStateResp>(nodeToAsk, InternalRouteEnum.binary_request_tx_and_state_before, requestMessage, serializeRequestTxAndStateReq, deserializeRequestTxAndStateResp, {});
                if (response && response.stateList && response.stateList.length === accountIds.length) {
                }
                else {
                    this.mainLogger.error(`requestInitialData: txid: ${queueEntry.logID} response is null or incomplete`);
                    continue;
                }
                const results: WrappedResponses = {};
                const receipt2 = this.stateManager.getSignedReceipt(queueEntry);
                if (receipt2 == null) {
                    return;
                }
                if (receipt2.proposal.accountIDs.length !== response.stateList.length) {
                    if (logFlags.error && logFlags.debug)
                        this.mainLogger.error(`requestInitialData data.length not matching for tx ${queueEntry.logID}`);
                    return;
                }
                for (const data of response.stateList) {
                    if (data == null) {
                        if (logFlags.error && logFlags.debug)
                            this.mainLogger.error(`requestInitialData data == null for tx ${queueEntry.logID}`);
                        success = false;
                        break;
                    }
                    const indexInVote = receipt2.proposal.accountIDs.indexOf(data.accountId);
                    if (data.stateId === receipt2.proposal.beforeStateHashes[indexInVote]) {
                        successCount++;
                        results[data.accountId] = data;
                    }
                }
                return results;
            }
            catch (e) {
                if (logFlags.error)
                    this.mainLogger.error(`requestInitialData: txid: ${queueEntry.logID} error: ${e.message}`);
            }
        }
        if (logFlags.error)
            this.mainLogger.error(`requestInitialData: txid: ${queueEntry.logID} failed. successCount: ${successCount} accountIds: ${accountIds.length}`);
    }
    resetReceiptsToForward(): void {
        const MAX_RECEIPT_AGE_MS = 15000;
        const now = shardusGetTime();
        for (const [key] of this.forwardedReceiptsByTimestamp) {
            if (now - key > MAX_RECEIPT_AGE_MS) {
                this.forwardedReceiptsByTimestamp.delete(key);
            }
        }
    }
    processQueue_accountSeen(seenAccounts: SeenAccounts, queueEntry: QueueEntry): boolean {
        if (this.config.debug.useShardusMemoryPatterns && queueEntry.shardusMemoryPatternSets != null) {
            return this.processQueue_accountSeen2(seenAccounts, queueEntry);
        }
        if (queueEntry.uniqueKeys == null) {
            return false;
        }
        for (const key of queueEntry.uniqueKeys) {
            if (seenAccounts[key] != null) {
                return true;
            }
        }
        return false;
    }
    processQueue_getUpstreamTx(seenAccounts: SeenAccounts, queueEntry: QueueEntry): QueueEntry | null {
        if (this.config.debug.useShardusMemoryPatterns && queueEntry.shardusMemoryPatternSets != null) {
            return null;
        }
        if (queueEntry.uniqueKeys == null) {
            return null;
        }
        for (const key of queueEntry.uniqueKeys) {
            if (seenAccounts[key] != null) {
                return seenAccounts[key];
            }
        }
        return null;
    }
    processQueue_markAccountsSeen(seenAccounts: SeenAccounts, queueEntry: QueueEntry): void {
        if (this.config.debug.useShardusMemoryPatterns && queueEntry.shardusMemoryPatternSets != null) {
            this.processQueue_markAccountsSeen2(seenAccounts, queueEntry);
            return;
        }
        if (queueEntry.uniqueWritableKeys == null) {
            return;
        }
        for (const key of queueEntry.uniqueWritableKeys) {
            if (seenAccounts[key] == null) {
                seenAccounts[key] = queueEntry;
            }
        }
    }
    processQueue_accountSeen2(seenAccounts: SeenAccounts, queueEntry: QueueEntry): boolean {
        if (queueEntry.uniqueKeys == null) {
            return false;
        }
        if (queueEntry.shardusMemoryPatternSets != null) {
            for (const id of queueEntry.shardusMemoryPatternSets.rw) {
                if (this.queueWrites.has(id)) {
                    return true;
                }
                if (this.queueReadWritesOld.has(id)) {
                    return true;
                }
                if (this.queueReads.has(id)) {
                    return true;
                }
            }
            for (const id of queueEntry.shardusMemoryPatternSets.wo) {
                if (this.queueReads.has(id)) {
                    return true;
                }
                if (this.queueReadWritesOld.has(id)) {
                    return true;
                }
            }
            for (const id of queueEntry.shardusMemoryPatternSets.ro) {
                if (this.queueWrites.has(id)) {
                    return true;
                }
                if (this.queueReadWritesOld.has(id)) {
                    return true;
                }
            }
            return false;
        }
        for (const key of queueEntry.uniqueKeys) {
            if (seenAccounts[key] != null) {
                return true;
            }
        }
        return false;
    }
    processQueue_markAccountsSeen2(seenAccounts: SeenAccounts, queueEntry: QueueEntry): void {
        if (queueEntry.uniqueWritableKeys == null) {
            return;
        }
        if (queueEntry.shardusMemoryPatternSets != null) {
            for (const id of queueEntry.shardusMemoryPatternSets.rw) {
                this.queueWrites.add(id);
                this.queueReads.add(id);
            }
            for (const id of queueEntry.shardusMemoryPatternSets.wo) {
                this.queueWrites.add(id);
            }
            for (const id of queueEntry.shardusMemoryPatternSets.on) {
                this.queueWrites.add(id);
            }
            for (const id of queueEntry.shardusMemoryPatternSets.ro) {
                this.queueReads.add(id);
            }
            return;
        }
        for (const key of queueEntry.uniqueWritableKeys) {
            if (seenAccounts[key] == null) {
                seenAccounts[key] = queueEntry;
            }
            this.queueReadWritesOld.add(key);
        }
    }
    processQueue_clearAccountsSeen(seenAccounts: SeenAccounts, queueEntry: QueueEntry): void {
        if (queueEntry.uniqueKeys == null) {
            return;
        }
        for (const key of queueEntry.uniqueKeys) {
            if (seenAccounts[key] != null && seenAccounts[key].logID === queueEntry.logID) {
                seenAccounts[key] = null;
            }
        }
    }
    processQueue_debugAccountData(queueEntry: QueueEntry, app: Shardus.App): string {
        let debugStr = '';
        if (queueEntry.uniqueKeys == null) {
            return queueEntry.logID + ' uniqueKeys empty error';
        }
        for (const key of queueEntry.uniqueKeys) {
            if (queueEntry.collectedData[key] != null) {
                debugStr +=
                    utils.makeShortHash(key) + ' : ' + app.getAccountDebugValue(queueEntry.collectedData[key]) + ', ';
            }
        }
        return debugStr;
    }
    txWillChangeLocalData(queueEntry: QueueEntry): boolean {
        if (queueEntry.globalModification) {
            return true;
        }
        const timestamp = queueEntry.acceptedTx.timestamp;
        const ourNodeData = this.stateManager.currentCycleShardData.nodeShardData;
        for (const key of queueEntry.uniqueWritableKeys) {
            if (this.stateManager.accountGlobals.isGlobalAccount(key)) {
                continue;
            }
            let hasKey = false;
            const { homePartition } = ShardFunctions.addressToPartition(this.stateManager.currentCycleShardData.shardGlobals, key);
            const nodeStoresThisPartition = ShardFunctions.testInRange(homePartition, ourNodeData.storedPartitions);
            hasKey = nodeStoresThisPartition;
            if (hasKey) {
                const accountHash = this.stateManager.accountCache.getAccountHash(key);
                if (accountHash != null) {
                    if (timestamp > accountHash.t) {
                        return true;
                    }
                }
                else {
                    return true;
                }
            }
        }
        return false;
    }
    checkAccountTimestamps(queueEntry: QueueEntry): boolean {
        for (const accountID of Object.keys(queueEntry.involvedReads)) {
            const cacheEntry = this.stateManager.accountCache.getAccountHash(accountID);
            if (cacheEntry != null && cacheEntry.t >= queueEntry.acceptedTx.timestamp) {
                return false;
            }
        }
        for (const accountID of Object.keys(queueEntry.involvedWrites)) {
            const cacheEntry = this.stateManager.accountCache.getAccountHash(accountID);
            if (cacheEntry != null && cacheEntry.t >= queueEntry.acceptedTx.timestamp) {
                return false;
            }
        }
        return true;
    }
    computeTxSieveTime(queueEntry: QueueEntry): void {
        let score = 0;
        const fourByteString = queueEntry.acceptedTx.txId.slice(0, 8);
        const intScore = Number.parseInt(fourByteString, 16);
        score = intScore / 4294967296.0;
        score = Math.abs(score);
        let extraRare = false;
        if (score > 0.99) {
            extraRare = true;
        }
        score = score * score * score;
        score = Math.round(score * 10) / 10;
        if (score > 1) {
            score = 1;
        }
        else {
            if (extraRare) {
                score = score + 0.3;
            }
        }
        queueEntry.txSieveTime = 0.5 * this.stateManager.queueSitTime * score;
    }
    updateSimpleStatsObject(statsObj: {
        [statName: string]: SimpleNumberStats;
    }, statName: string, duration: number): void {
        let statsEntry = statsObj[statName];
        if (statsEntry == null) {
            statsEntry = {
                min: Number.MAX_SAFE_INTEGER,
                max: 0,
                total: 0,
                count: 0,
                average: 0,
            };
            statsObj[statName] = statsEntry;
        }
        statsEntry.count++;
        statsEntry.max = Math.max(statsEntry.max, duration);
        statsEntry.min = Math.min(statsEntry.min, duration);
        statsEntry.total += duration;
    }
    finalizeSimpleStatsObject(statsObj: {
        [statName: string]: SimpleNumberStats;
    }): void {
        for (const [, value] of Object.entries(statsObj)) {
            if (value.count) {
                value.average = value.total / value.count;
            }
            value.average = Math.round(value.average * 100) / 100;
            value.max = Math.round(value.max * 100) / 100;
            value.min = Math.round(value.min * 100) / 100;
            value.total = Math.round(value.total * 100) / 100;
        }
    }
    getConsenusGroupForAccount(accountID: string): Shardus.Node[] {
        const { homePartition } = ShardFunctions.addressToPartition(this.stateManager.currentCycleShardData.shardGlobals, accountID);
        const homeShardData = this.stateManager.currentCycleShardData.parititionShardDataMap.get(homePartition);
        const consenusGroup = homeShardData.homeNodes[0].consensusNodeForOurNodeFull.slice();
        return consenusGroup;
    }
    getRandomConsensusNodeForAccount(accountID: string, excludeNodeIds: string[] = []): Shardus.Node {
        const { homePartition } = ShardFunctions.addressToPartition(this.stateManager.currentCycleShardData.shardGlobals, accountID);
        const homeShardData = this.stateManager.currentCycleShardData.parititionShardDataMap.get(homePartition);
        const consenusGroup = homeShardData.homeNodes[0].consensusNodeForOurNodeFull;
        const filteredConsensusGroup = consenusGroup.filter((node) => excludeNodeIds.indexOf(node.id) === -1);
        let maxRetry = 5;
        let potentialNode: Shardus.Node;
        let invalidNode: boolean;
        do {
            potentialNode = filteredConsensusGroup[Math.floor(Math.random() * filteredConsensusGroup.length)];
            invalidNode = isNodeInRotationBounds(potentialNode.id);
            maxRetry--;
        } while (invalidNode && maxRetry > 0);
        return potentialNode;
    }
    getStorageGroupForAccount(accountID: string): Shardus.Node[] {
        const { homePartition } = ShardFunctions.addressToPartition(this.stateManager.currentCycleShardData.shardGlobals, accountID);
        const homeShardData = this.stateManager.currentCycleShardData.parititionShardDataMap.get(homePartition);
        const storageGroup = homeShardData.homeNodes[0].nodeThatStoreOurParitionFull.slice();
        return storageGroup;
    }
    isAccountRemote(accountID: string): boolean {
        const ourNodeShardData = this.stateManager.currentCycleShardData.nodeShardData;
        const minP = ourNodeShardData.consensusStartPartition;
        const maxP = ourNodeShardData.consensusEndPartition;
        const { homePartition } = ShardFunctions.addressToPartition(this.stateManager.currentCycleShardData.shardGlobals, accountID);
        const accountIsRemote = ShardFunctions.partitionInWrappingRange(homePartition, minP, maxP) === false;
        return accountIsRemote;
    }
    getExecuteQueueLength(): number {
        let length = 0;
        for (const queueEntry of this._transactionQueue) {
            if (queueEntry.isInExecutionHome) {
                length++;
            }
        }
        return length;
    }
    getAccountQueueCount(accountID: string, remote = false): QueueCountsResult {
        let count = 0;
        const committingAppData: Shardus.AcceptedTx['appData'] = [];
        for (const queueEntry of this.pendingTransactionQueue) {
            if (queueEntry.txKeys.sourceKeys.length > 0 && accountID === queueEntry.txKeys.sourceKeys[0]) {
                const tx = queueEntry.acceptedTx;
                count++;
            }
        }
        for (const queueEntry of this._transactionQueue) {
            if (queueEntry.txKeys.sourceKeys.length > 0 && accountID === queueEntry.txKeys.sourceKeys[0]) {
                const tx = queueEntry.acceptedTx;
                if (queueEntry.state === 'commiting' && queueEntry.accountDataSet === false) {
                    committingAppData.push(tx.appData);
                    continue;
                }
                count++;
            }
        }
        return { count, committingAppData };
    }
    isAccountInQueue(accountID: string, remote = false): boolean {
        for (const queueEntry of this.pendingTransactionQueue) {
            if (queueEntry.uniqueKeys.includes(accountID)) {
                const memoryPatterns = queueEntry.acceptedTx.shardusMemoryPatterns;
                if (queueEntry.txKeys.sourceKeys.length > 0 && accountID === queueEntry.txKeys.sourceKeys[0]) {
                    return true;
                }
                const rw = memoryPatterns?.rw;
                const wo = memoryPatterns?.wo;
                if (rw && rw.includes(accountID) || wo && wo.includes(accountID)) {
                    return true;
                }
            }
        }
        for (const queueEntry of this._transactionQueue) {
            if (queueEntry.uniqueKeys.includes(accountID)) {
                const memoryPatterns = queueEntry.acceptedTx.shardusMemoryPatterns;
                if (queueEntry.txKeys.sourceKeys.length > 0 && accountID === queueEntry.txKeys.sourceKeys[0]) {
                    return true;
                }
                const rw = memoryPatterns?.rw;
                const wo = memoryPatterns?.wo;
                if (rw && rw.includes(accountID) || wo && wo.includes(accountID)) {
                    return true;
                }
            }
        }
        return false;
    }
    checkForStuckProcessing(): void {
        const timeSinceLastProcessLoop = shardusGetTime() - this.processingLastRunTime;
        const limitInMS = this.config.stateManager.stuckProcessingLimit * 1000;
        if (timeSinceLastProcessLoop > limitInMS) {
            if (this.isStuckProcessing === false) {
                this.isStuckProcessing = true;
                this.onProcesssingQueueStuck();
                this.stuckProcessingCount++;
            }
            this.stuckProcessingCyclesCount++;
            if (this.transactionProcessingQueueRunning) {
                this.stuckProcessingQueueLockedCyclesCount++;
            }
            if (this.config.stateManager.autoUnstickProcessing === true) {
                this.fixStuckProcessing(true);
                this.stateManager.forceUnlockAllFifoLocks('autoUnstickProcessing');
            }
        }
    }
    onProcesssingQueueStuck(): void {
        if (this.stuckProcessingCount === 0) {
            this.statemanager_fatal(`onProcesssingQueueStuck`, `onProcesssingQueueStuck: ${Utils.safeStringify(this.getDebugProccessingStatus())}`);
        }
        this.stateManager.lastSeenAccountsMap = null;
        if (this.config.stateManager.apopFromStuckProcessing === true) {
            Apoptosis.apoptosizeSelf('Apoptosized due to stuck processing');
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
        ];
        const stateIndex = txStates.indexOf(opts.state);
        if (stateIndex === -1) {
            return `${opts.state} is not a valid tx state.`;
        }
        const queueItems = this.getQueueItems();
        const stuckTxs = queueItems.filter((queueEntry) => {
            const queueStateIndex = txStates.indexOf(queueEntry.state);
            return (queueEntry.txAge > opts.minAge &&
                queueEntry.state &&
                (opts.nextStates ? queueStateIndex >= stateIndex : queueStateIndex === stateIndex));
        });
        return stuckTxs;
    }
    getDebugProccessingStatus(): unknown {
        let txDebug = '';
        if (this.debugRecentQueueEntry != null) {
            const app = this.app;
            const queueEntry = this.debugRecentQueueEntry;
            txDebug = `logID:${queueEntry.logID} state:${queueEntry.state} hasAll:${queueEntry.hasAll} globalMod:${queueEntry.globalModification}`;
            txDebug += ` qId: ${queueEntry.entryID} values: ${this.processQueue_debugAccountData(queueEntry, app)} AcceptedTransaction: ${utils.stringifyReduce(queueEntry.acceptedTx)}`;
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
        };
    }
    clearStuckProcessingDebugVars(): void {
        this.isStuckProcessing = false;
        this.debugLastAwaitedCall = '';
        this.debugLastAwaitedCallInner = '';
        this.debugLastAwaitedAppCall = '';
        this.debugLastAwaitedCallInnerStack = {};
        this.debugLastAwaitedAppCallStack = {};
        this.debugRecentQueueEntry = null;
        this.debugLastProcessingQueueStartTime = 0;
        this.stuckProcessingCount = 0;
        this.stuckProcessingCyclesCount = 0;
        this.stuckProcessingQueueLockedCyclesCount = 0;
    }
    fixStuckProcessing(clearPendingTransactions: boolean): void {
        this.clearStuckProcessingDebugVars();
        this.stateManager.lastSeenAccountsMap = null;
        this.transactionProcessingQueueRunning = false;
        if (clearPendingTransactions) {
            this.pendingTransactionQueue = [];
        }
        this.stateManager.tryStartTransactionProcessingQueue();
    }
    setDebugLastAwaitedCall(label: string, complete = DebugComplete.Incomplete): void {
        this.debugLastAwaitedCall = label + (complete === DebugComplete.Completed ? ' complete' : '');
        this.debugLastAwaitedCallInner = '';
        this.debugLastAwaitedAppCall = '';
    }
    setDebugLastAwaitedCallInner(label: string, complete = DebugComplete.Incomplete): void {
        this.debugLastAwaitedCallInner = label + (complete === DebugComplete.Completed ? ' complete' : '');
        this.debugLastAwaitedAppCall = '';
        if (complete === DebugComplete.Incomplete) {
            if (this.debugLastAwaitedCallInnerStack[label] == null) {
                this.debugLastAwaitedCallInnerStack[label] = 1;
            }
            else {
                this.debugLastAwaitedCallInnerStack[label]++;
            }
        }
        else {
            if (this.debugLastAwaitedCallInnerStack[label] != null) {
                if (this.debugLastAwaitedCallInnerStack[label] > 1) {
                    this.debugLastAwaitedCallInnerStack[label]--;
                }
                else {
                    delete this.debugLastAwaitedCallInnerStack[label];
                }
            }
        }
    }
    setDebugSetLastAppAwait(label: string, complete = DebugComplete.Incomplete): void {
        this.debugLastAwaitedAppCall = label + (complete === DebugComplete.Completed ? ' complete' : '');
        if (complete === DebugComplete.Incomplete) {
            if (this.debugLastAwaitedAppCallStack[label] == null) {
                this.debugLastAwaitedAppCallStack[label] = 1;
            }
            else {
                this.debugLastAwaitedAppCallStack[label]++;
            }
        }
        else {
            if (this.debugLastAwaitedAppCallStack[label] != null) {
                if (this.debugLastAwaitedAppCallStack[label] > 1) {
                    this.debugLastAwaitedAppCallStack[label]--;
                }
                else {
                    delete this.debugLastAwaitedAppCallStack[label];
                }
            }
        }
    }
    clearQueueItems(minAge: number): number {
        let count = 0;
        try {
            const currentTime = shardusGetTime();
            for (let i = this._transactionQueue.length - 1; i >= 0; i--) {
                const queueEntry = this._transactionQueue[i];
                const txAge = currentTime - queueEntry.acceptedTx.timestamp;
                if (txAge > minAge) {
                    this.removeFromQueue(queueEntry, i);
                    count++;
                }
            }
        }
        catch (e) {
            console.error('clearQueueItems error:', e);
        }
        return count;
    }
    getQueueItems(): any[] {
        return this._transactionQueue.map((queueEntry) => {
            return this.getDebugQueueInfo(queueEntry);
        });
    }
    getQueueItemById(txId: string): any {
        if (this._transactionQueueByID.has(txId))
            return this.getDebugQueueInfo(this._transactionQueueByID.get(txId));
        if (this.archivedQueueEntriesByID.has(txId))
            return this.getDebugQueueInfo(this.archivedQueueEntriesByID.get(txId));
        return null;
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
            txDebug: queueEntry.txDebug,
            executionDebug: queueEntry.executionDebug,
            waitForReceiptOnly: queueEntry.waitForReceiptOnly,
            ourVote: queueEntry.ourVote || null,
            signedReceipt: this.stateManager.getSignedReceipt(queueEntry) || null,
            collectedVoteCount: queueEntry.collectedVoteHashes.length,
            simpleDebugStr: this.app.getSimpleTxDebugValue ? this.app.getSimpleTxDebugValue(queueEntry.acceptedTx?.data) : "",
        };
    }
    removeTxFromArchivedQueue(txId: string) {
        const index = this.archivedQueueEntries.findIndex((queueEntry) => queueEntry.acceptedTx.txId === txId);
        if (index !== -1) {
            this.archivedQueueEntries.splice(index, 1);
        }
        if (this.archivedQueueEntriesByID.has(txId))
            delete this.archivedQueueEntriesByID[txId];
    }
    updateTxState(queueEntry: QueueEntry, nextState: string, context = ''): void {
        if (logFlags.seqdiagram)
            if (context == '') {
            }
            else {
            }
        const currentState = queueEntry.state;
        this.txDebugMarkEndTime(queueEntry, currentState);
        queueEntry.state = nextState;
        this.txDebugMarkStartTime(queueEntry, nextState);
    }
    txDebugMarkStartTime(queueEntry: QueueEntry, state: string): void {
        if (queueEntry.txDebug.startTime[state] == null) {
            queueEntry.txDebug.startTime[state] = process.hrtime();
            queueEntry.txDebug.startTimestamp[state] = shardusGetTime();
        }
    }
    txDebugMarkEndTime(queueEntry: QueueEntry, state: string): void {
        if (queueEntry.txDebug.startTime[state]) {
            const endTime = process.hrtime(queueEntry.txDebug.startTime[state]);
            queueEntry.txDebug.endTime[state] = endTime;
            queueEntry.txDebug.endTimestamp[state] = shardusGetTime();
            const durationInNanoseconds = endTime[0] * 1e9 + endTime[1];
            const durationInMilliseconds = durationInNanoseconds / 1e6;
            queueEntry.txDebug.duration[state] = durationInMilliseconds;
            delete queueEntry.txDebug.startTime[state];
            delete queueEntry.txDebug.endTime[state];
        }
    }
    clearDebugAwaitStrings(): void {
        this.debugLastAwaitedCall = '';
        this.debugLastAwaitedCallInner = '';
        this.debugLastAwaitedAppCall = '';
        this.debugLastAwaitedCallInnerStack = {};
        this.debugLastAwaitedAppCallStack = {};
    }
    getQueueLengthBuckets(): any {
        try {
            const buckets = { c15: 0, c60: 0, c120: 0, c600: 0 };
            if (!this._transactionQueue || this._transactionQueue.length === 0) {
                return buckets;
            }
            const currentTime = shardusGetTime();
            this._transactionQueue.forEach((queueEntry) => {
                if (queueEntry && queueEntry.acceptedTx && queueEntry.acceptedTx.timestamp) {
                    const txAgeInSeconds = (currentTime - queueEntry.acceptedTx.timestamp) / 1000;
                    if (txAgeInSeconds >= 15 && txAgeInSeconds < 60) {
                        buckets.c15++;
                    }
                    else if (txAgeInSeconds >= 60 && txAgeInSeconds < 120) {
                        buckets.c60++;
                    }
                    else if (txAgeInSeconds >= 120 && txAgeInSeconds < 600) {
                        buckets.c120++;
                    }
                    else if (txAgeInSeconds >= 600) {
                        buckets.c600++;
                    }
                }
            });
            return buckets;
        }
        catch (e) {
            return {};
        }
    }
}
export default TransactionQueue;