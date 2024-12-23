import { CycleRecord } from '@shardus/types/build/src/p2p/CycleCreatorTypes';
import { P2P as P2PTypes, StateManager as StateManagerTypes } from '@shardus/types';
import { Logger as log4jLogger } from 'log4js';
import StateManager from '.';
import Crypto from '../crypto';
import Logger, { logFlags } from '../logger';
import * as Comms from '../p2p/Comms';
import * as Context from '../p2p/Context';
import { P2PModuleContext as P2P } from '../p2p/Context';
import * as CycleChain from '../p2p/CycleChain';
import * as Self from '../p2p/Self';
import * as Shardus from '../shardus/shardus-types';
import { TimestampReceipt } from '../shardus/shardus-types';
import Storage from '../storage';
import * as utils from '../utils';
import { Ordering } from '../utils';
import { nestedCountersInstance } from '../utils/nestedCounters';
import Profiler, { cUninitializedSize, profilerInstance } from '../utils/profiler';
import ShardFunctions from './shardFunctions';
import * as NodeList from '../p2p/NodeList';
import { AppliedReceipt, AppliedVote, AppliedVoteHash, AppliedVoteQuery, AppliedVoteQueryResponse, ConfirmOrChallengeMessage, ConfirmOrChallengeQuery, ConfirmOrChallengeQueryResponse, GetAccountData3Req, GetAccountData3Resp, QueueEntry, WrappedResponses, TimestampRemoveRequest, Proposal, Vote, SignedReceipt, } from './state-manager-types';
import { ipInfo, shardusGetTime } from '../network';
import { robustQuery } from '../p2p/Utils';
import { SignedObject } from '@shardus/crypto-utils';
import { isDebugModeMiddleware } from '../network/debugMiddleware';
import { GetAccountDataReqSerializable, serializeGetAccountDataReq } from '../types/GetAccountDataReq';
import { GetAccountDataRespSerializable, deserializeGetAccountDataResp } from '../types/GetAccountDataResp';
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum';
import { InternalBinaryHandler } from '../types/Handler';
import { Route } from '@shardus/types/build/src/p2p/P2PTypes';
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum';
import { getStreamWithTypeCheck, requestErrorHandler } from '../types/Helpers';
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum';
import { deserializeGetTxTimestampResp, getTxTimestampResp, serializeGetTxTimestampResp, } from '../types/GetTxTimestampResp';
import { deserializeGetTxTimestampReq, getTxTimestampReq, serializeGetTxTimestampReq, } from '../types/GetTxTimestampReq';
import { SpreadAppliedVoteHashReq, serializeSpreadAppliedVoteHashReq, } from '../types/SpreadAppliedVoteHashReq';
import { GetConfirmOrChallengeReq, deserializeGetConfirmOrChallengeReq, serializeGetConfirmOrChallengeReq, } from '../types/GetConfirmOrChallengeReq';
import { GetConfirmOrChallengeResp, deserializeGetConfirmOrChallengeResp, serializeGetConfirmOrChallengeResp, } from '../types/GetConfirmOrChallengeResp';
import { GetAppliedVoteReq, deserializeGetAppliedVoteReq, serializeGetAppliedVoteReq, } from '../types/GetAppliedVoteReq';
import { GetAppliedVoteResp, deserializeGetAppliedVoteResp, serializeGetAppliedVoteResp, } from '../types/GetAppliedVoteResp';
import { BadRequest, InternalError, NotFound, serializeResponseError } from '../types/ResponseError';
import { randomUUID } from 'crypto';
import { Utils } from '@shardus/types';
import { PoqoSendReceiptReq, deserializePoqoSendReceiptReq, serializePoqoSendReceiptReq } from '../types/PoqoSendReceiptReq';
import { deserializePoqoDataAndReceiptResp } from '../types/PoqoDataAndReceiptReq';
import { deserializePoqoSendVoteReq, serializePoqoSendVoteReq } from '../types/PoqoSendVoteReq';
import { RequestReceiptForTxReqSerialized, serializeRequestReceiptForTxReq } from '../types/RequestReceiptForTxReq';
import { RequestReceiptForTxRespSerialized, deserializeRequestReceiptForTxResp } from '../types/RequestReceiptForTxResp';
import { removeDuplicateSignatures } from '../utils/functions/signs';
class TransactionConsenus {
    app: Shardus.App;
    crypto: Crypto;
    config: Shardus.StrictServerConfiguration;
    profiler: Profiler;
    logger: Logger;
    p2p: P2P;
    storage: Storage;
    stateManager: StateManager;
    mainLogger: log4jLogger;
    seqLogger: log4jLogger;
    fatalLogger: log4jLogger;
    shardLogger: log4jLogger;
    statsLogger: log4jLogger;
    statemanager_fatal: (key: string, log: string) => void;
    txTimestampCache: Map<number | string, Map<string, TimestampReceipt>>;
    txTimestampCacheByTxId: Map<string, TimestampReceipt>;
    seenTimestampRequests: Set<string>;
    produceBadVote: boolean;
    produceBadChallenge: boolean;
    debugFailPOQo: number;
    constructor(stateManager: StateManager, profiler: Profiler, app: Shardus.App, logger: Logger, storage: Storage, p2p: P2P, crypto: Crypto, config: Shardus.StrictServerConfiguration) {
        this.crypto = crypto;
        this.app = app;
        this.logger = logger;
        this.config = config;
        this.profiler = profiler;
        this.p2p = p2p;
        this.storage = storage;
        this.stateManager = stateManager;
        this.mainLogger = logger.getLogger('main');
        this.seqLogger = logger.getLogger('seq');
        this.fatalLogger = logger.getLogger('fatal');
        this.shardLogger = logger.getLogger('shardDump');
        this.statsLogger = logger.getLogger('statsDump');
        this.statemanager_fatal = stateManager.statemanager_fatal;
        this.txTimestampCache = new Map();
        this.txTimestampCacheByTxId = new Map();
        this.seenTimestampRequests = new Set();
        this.produceBadVote = this.config.debug.produceBadVote;
        this.produceBadChallenge = this.config.debug.produceBadChallenge;
        this.debugFailPOQo = 0;
    }
    setupHandlers(): void {
        Context.network.registerExternalGet('debug-poqo-fail', isDebugModeMiddleware, (req, res) => {
            try {
                const newChance = req.query.newChance;
                if (typeof newChance !== 'string' || !newChance) {
                    res.write(`debug-poqo-fail: missing param newChance ${this.debugFailPOQo}\n`);
                    res.end();
                    return;
                }
                const newChanceInt = parseFloat(newChance);
                if (newChanceInt >= 1) {
                    res.write(`debug-poqo-fail: newChance not a float: ${this.debugFailPOQo}\n`);
                    res.end();
                    return;
                }
                this.debugFailPOQo = newChanceInt;
                res.write(`debug-poqo-fail: set: ${this.debugFailPOQo}\n`);
            }
            catch (e) {
                res.write(`debug-poqo-fail: error: ${this.debugFailPOQo}\n`);
            }
            res.end();
        });
        Context.network.registerExternalGet('debug-poq-switch', isDebugModeMiddleware, (_req, res) => {
            try {
                this.stateManager.transactionQueue.useNewPOQ = !this.stateManager.transactionQueue.useNewPOQ;
                res.write(`this.useNewPOQ: ${this.stateManager.transactionQueue.useNewPOQ}\n`);
            }
            catch (e) {
                res.write(`${e}\n`);
            }
            res.end();
        });
        Context.network.registerExternalGet('debug-poq-wait-before-confirm', isDebugModeMiddleware, (_req, res) => {
            try {
                const waitTimeBeforeConfirm = _req.query.waitTimeBeforeConfirm as string;
                if (waitTimeBeforeConfirm && !isNaN(parseInt(waitTimeBeforeConfirm)))
                    this.config.stateManager.waitTimeBeforeConfirm = parseInt(waitTimeBeforeConfirm);
                res.write(`stateManager.waitTimeBeforeConfirm: ${this.config.stateManager.waitTimeBeforeConfirm}\n`);
            }
            catch (e) {
                res.write(`${e}\n`);
            }
            res.end();
        });
        Context.network.registerExternalGet('debug-poq-wait-limit-confirm', isDebugModeMiddleware, (_req, res) => {
            try {
                const waitLimitAfterFirstVote = _req.query.waitLimitAfterFirstVote as string;
                if (waitLimitAfterFirstVote && !isNaN(parseInt(waitLimitAfterFirstVote)))
                    this.config.stateManager.waitLimitAfterFirstVote = parseInt(waitLimitAfterFirstVote);
                res.write(`stateManager.waitLimitAfterFirstVote: ${this.config.stateManager.waitLimitAfterFirstVote}\n`);
            }
            catch (e) {
                res.write(`${e}\n`);
            }
            res.end();
        });
        Context.network.registerExternalGet('debug-poq-wait-before-receipt', isDebugModeMiddleware, (_req, res) => {
            try {
                const waitTimeBeforeReceipt = _req.query.waitTimeBeforeReceipt as string;
                if (waitTimeBeforeReceipt && !isNaN(parseInt(waitTimeBeforeReceipt)))
                    this.config.stateManager.waitTimeBeforeReceipt = parseInt(waitTimeBeforeReceipt);
                res.write(`stateManager.waitTimeBeforeReceipt: ${this.config.stateManager.waitTimeBeforeReceipt}\n`);
            }
            catch (e) {
                res.write(`${e}\n`);
            }
            res.end();
        });
        Context.network.registerExternalGet('debug-poq-wait-limit-receipt', isDebugModeMiddleware, (_req, res) => {
            try {
                const waitLimitAfterFirstMessage = _req.query.waitLimitAfterFirstMessage as string;
                if (waitLimitAfterFirstMessage && !isNaN(parseInt(waitLimitAfterFirstMessage)))
                    this.config.stateManager.waitLimitAfterFirstMessage = parseInt(waitLimitAfterFirstMessage);
                res.write(`stateManager.waitLimitAfterFirstVote: ${this.config.stateManager.waitLimitAfterFirstMessage}\n`);
            }
            catch (e) {
                res.write(`${e}\n`);
            }
            res.end();
        });
        Context.network.registerExternalGet('debug-produceBadVote', isDebugModeMiddleware, (req, res) => {
            this.produceBadVote = !this.produceBadVote;
            res.json({ status: 'ok', produceBadVote: this.produceBadVote });
        });
        Context.network.registerExternalGet('debug-produceBadChallenge', isDebugModeMiddleware, (req, res) => {
            this.produceBadChallenge = !this.produceBadChallenge;
            res.json({ status: 'ok', produceBadChallenge: this.produceBadChallenge });
        });
        const getTxTimestampBinary: Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_get_tx_timestamp,
            handler: async (payload, respond, header) => {
                const route = InternalRouteEnum.binary_get_tx_timestamp;
                const errorHandler = (errorType: RequestErrorEnum, opts?: {
                    customErrorLog?: string;
                    customCounterSuffix?: string;
                }): void => requestErrorHandler(route, errorType, header, opts);
                let tsReceipt: Shardus.TimestampReceipt;
                try {
                    const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cGetTxTimestampReq);
                    if (!requestStream) {
                        errorHandler(RequestErrorEnum.InvalidRequest);
                        return respond(tsReceipt, serializeGetTxTimestampResp);
                    }
                    const readableReq = deserializeGetTxTimestampReq(requestStream);
                    if (Context.config.p2p.timestampCacheFix && this.seenTimestampRequests.has(readableReq.txId) && !this.txTimestampCacheByTxId.has(readableReq.txId)) {
                        return respond(BadRequest('get_tx_timestamp seen txId but found no timestamp'), serializeResponseError);
                    }
                    this.seenTimestampRequests.add(readableReq.txId);
                    tsReceipt = this.getOrGenerateTimestampReceiptFromCache(readableReq.txId, readableReq.cycleMarker, readableReq.cycleCounter);
                    return respond(tsReceipt, serializeGetTxTimestampResp);
                }
                catch (e) {
                    if (logFlags.error)
                        this.mainLogger.error(`${route}: Exception executing request: ${utils.errorToStringFull(e)}`);
                    respond(tsReceipt, serializeGetTxTimestampResp);
                }
                finally {
                }
            },
        };
        this.p2p.registerInternalBinary(getTxTimestampBinary.name, getTxTimestampBinary.handler);
        const getChallengeOrConfirmBinaryHandler: Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_get_confirm_or_challenge,
            handler: async (payload, respond, header, sign) => {
                const route = InternalRouteEnum.binary_get_confirm_or_challenge;
                const confirmOrChallengeResult: GetConfirmOrChallengeResp = {
                    txId: '',
                    appliedVoteHash: '',
                    result: null,
                    uniqueCount: 0,
                };
                try {
                    const reqStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cGetConfirmOrChallengeReq);
                    if (!reqStream) {
                        respond(confirmOrChallengeResult, serializeGetConfirmOrChallengeResp);
                        return;
                    }
                    const request = deserializeGetConfirmOrChallengeReq(reqStream);
                    const { txId } = request;
                    let queueEntry = this.stateManager.transactionQueue.getQueueEntrySafe(txId);
                    if (queueEntry == null) {
                        queueEntry = this.stateManager.transactionQueue.getQueueEntryArchived(txId, route);
                    }
                    if (queueEntry == null) {
                        if (logFlags.error)
                            this.mainLogger.error(`get_confirm_or_challenge no queue entry for ${txId} dbg:${this.stateManager.debugTXHistory[utils.stringifyReduce(txId)]}`);
                        respond(confirmOrChallengeResult, serializeGetConfirmOrChallengeResp);
                        return;
                    }
                    if (queueEntry.receivedBestConfirmation == null && queueEntry.receivedBestChallenge == null) {
                        if (logFlags.error)
                            this.mainLogger.error(`get_confirm_or_challenge no confirmation or challenge for ${queueEntry.logID}, bestVote: ${Utils.safeStringify(queueEntry.receivedBestVote)},  bestConfirmation: ${Utils.safeStringify(queueEntry.receivedBestConfirmation)}`);
                        respond(confirmOrChallengeResult, serializeGetConfirmOrChallengeResp);
                        return;
                    }
                    const { receivedBestChallenge, receivedBestConfirmation, uniqueChallengesCount } = queueEntry;
                    if (receivedBestChallenge && uniqueChallengesCount >= this.config.stateManager.minRequiredChallenges) {
                        confirmOrChallengeResult.result = receivedBestChallenge;
                        confirmOrChallengeResult.uniqueCount = uniqueChallengesCount;
                    }
                    else {
                        confirmOrChallengeResult.result = receivedBestConfirmation;
                        confirmOrChallengeResult.uniqueCount = 1;
                    }
                    respond(confirmOrChallengeResult, serializeGetConfirmOrChallengeResp);
                }
                catch (e) {
                    if (logFlags.error)
                        this.mainLogger.error(`get_confirm_or_challenge error ${e.message}`);
                    respond(confirmOrChallengeResult, serializeGetConfirmOrChallengeResp);
                }
                finally {
                }
            },
        };
        this.p2p.registerInternalBinary(getChallengeOrConfirmBinaryHandler.name, getChallengeOrConfirmBinaryHandler.handler);
        Comms.registerGossipHandler('poqo-receipt-gossip', (payload: SignedReceipt & {
            txGroupCycle: number;
        }) => {
            try {
                const queueEntry = this.stateManager.transactionQueue.getQueueEntrySafe(payload.proposal.txid);
                if (queueEntry == null) {
                    if (logFlags.error)
                        this.mainLogger.error(`poqo-receipt-gossip no queue entry for ${payload.proposal.txid}`);
                    return;
                }
                if (payload.txGroupCycle) {
                    if (queueEntry.txGroupCycle !== payload.txGroupCycle) {
                        if (logFlags.error)
                            this.mainLogger.error(`poqo-receipt-gossip mismatch txGroupCycle for txid: ${payload.proposal.txid}, sender's txGroupCycle: ${payload.txGroupCycle}, our txGroupCycle: ${queueEntry.txGroupCycle}`);
                    }
                    delete payload.txGroupCycle;
                }
                if (queueEntry.hasSentFinalReceipt === true) {
                    return;
                }
                const executionGroupNodes = new Set(queueEntry.executionGroup.map((node) => node.publicKey));
                const hasTwoThirdsMajority = this.verifyAppliedReceipt(payload, executionGroupNodes);
                if (!hasTwoThirdsMajority) {
                    if (logFlags.error)
                        this.mainLogger.error(`Receipt does not have the required majority for txid: ${payload.proposal.txid}`);
                    return;
                }
                queueEntry.signedReceipt = payload;
                payload.txGroupCycle = queueEntry.txGroupCycle;
                Comms.sendGossip('poqo-receipt-gossip', payload, null, null, queueEntry.transactionGroup, false, 4, payload.proposal.txid, '', true);
                queueEntry.hasSentFinalReceipt = true;
                if (!queueEntry.hasValidFinalData) {
                    setTimeout(async () => {
                        if (queueEntry.hasValidFinalData) {
                            return;
                        }
                        const nodesToAskKeys = payload.signaturePack?.map((signature) => signature.owner);
                        await this.stateManager.transactionQueue.requestFinalData(queueEntry, payload.proposal.accountIDs, nodesToAskKeys);
                    }, this.config.stateManager.nonExWaitForData);
                }
            }
            finally {
            }
        });
        const poqoDataAndReceiptBinaryHandler: Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_poqo_data_and_receipt,
            handler: async (payload, respond, header, sign) => {
                const route = InternalRouteEnum.binary_poqo_data_and_receipt;
                try {
                    const _sender = header.sender_id;
                    const reqStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cPoqoDataAndReceiptReq);
                    if (!reqStream) {
                        return;
                    }
                    const readableReq = deserializePoqoDataAndReceiptResp(reqStream);
                    const queueEntry = this.stateManager.transactionQueue.getQueueEntrySafe(readableReq.finalState.txid);
                    if (queueEntry == null) {
                        return;
                    }
                    if (_sender == null) {
                        if (logFlags.error)
                            this.mainLogger.error(`poqo-data-and-receipt invalid sender for txid: ${readableReq.finalState.txid}, sender: ${_sender}`);
                        return;
                    }
                    if (readableReq.txGroupCycle) {
                        if (queueEntry.txGroupCycle !== readableReq.txGroupCycle) {
                            if (logFlags.error)
                                this.mainLogger.error(`binary_poqo_data_and_receipt mismatch txGroupCycle for txid: ${readableReq.finalState.txid}, sender's txGroupCycle: ${readableReq.txGroupCycle}, our txGroupCycle: ${queueEntry.txGroupCycle}`);
                        }
                        delete readableReq.txGroupCycle;
                    }
                    const isValidFinalDataSender = this.stateManager.transactionQueue.factValidateCorrespondingTellFinalDataSender(queueEntry, _sender);
                    if (isValidFinalDataSender === false) {
                        if (logFlags.error)
                            this.mainLogger.error(`poqo-data-and-receipt invalid: sender ${_sender} for data: ${queueEntry.acceptedTx.txId}`);
                        return;
                    }
                    if (readableReq.receipt == null) {
                        if (logFlags.error)
                            this.mainLogger.error(`poqo-data-and-receipt invalid: readableReq.receipt == null sender ${_sender}`);
                        return;
                    }
                    if (readableReq.finalState.txid != readableReq.receipt.proposal.txid) {
                        if (logFlags.error)
                            this.mainLogger.error(`poqo-data-and-receipt invalid: readableReq.finalState.txid != readableReq.receipt.txid sender ${_sender}  ${readableReq.finalState.txid} != ${readableReq.receipt.proposal.txid}`);
                        return;
                    }
                    if (!queueEntry.hasSentFinalReceipt) {
                        const executionGroupNodes = new Set(queueEntry.executionGroup.map(node => node.publicKey));
                        const hasTwoThirdsMajority = this.verifyAppliedReceipt(readableReq.receipt, executionGroupNodes);
                        if (!hasTwoThirdsMajority) {
                            if (logFlags.error)
                                this.mainLogger.error(`Receipt does not have the required majority for txid: ${readableReq.receipt.proposal.txid}`);
                            return;
                        }
                        queueEntry.signedReceipt = readableReq.receipt;
                        const receiptToGossip = { ...readableReq.receipt, txGroupCycle: queueEntry.txGroupCycle };
                        Comms.sendGossip('poqo-receipt-gossip', receiptToGossip, null, null, queueEntry.transactionGroup, false, 4, readableReq.finalState.txid, '', true);
                        queueEntry.hasSentFinalReceipt = true;
                    }
                    const savedAccountIds: Set<string> = new Set();
                    for (const data of readableReq.finalState.stateList) {
                        if (data == null) {
                            if (logFlags.error && logFlags.verbose)
                                this.mainLogger.error(`poqo-data-and-receipt data == null`);
                            continue;
                        }
                        if (queueEntry.collectedFinalData[data.accountId] == null) {
                            queueEntry.collectedFinalData[data.accountId] = data;
                            savedAccountIds.add(data.accountId);
                        }
                    }
                }
                catch (e) {
                    if (logFlags.error)
                        console.error(`Error processing poqoDataAndReceipt Binary handler: ${e}`);
                    if (logFlags.error)
                        this.mainLogger.error(`${route}: Exception executing request: ${utils.errorToStringFull(e)}`);
                }
                finally {
                }
            },
        };
        Comms.registerInternalBinary(poqoDataAndReceiptBinaryHandler.name, poqoDataAndReceiptBinaryHandler.handler);
        const poqoSendReceiptBinary: Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_poqo_send_receipt,
            handler: async (payload, respond, header) => {
                const route = InternalRouteEnum.binary_poqo_send_receipt;
                const errorHandler = (errorType: RequestErrorEnum, opts?: {
                    customErrorLog?: string;
                    customCounterSuffix?: string;
                }): void => requestErrorHandler(route, errorType, header, opts);
                try {
                    const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cPoqoSendReceiptReq);
                    if (!requestStream) {
                        return errorHandler(RequestErrorEnum.InvalidRequest);
                    }
                    const readableReq = deserializePoqoSendReceiptReq(requestStream);
                    const queueEntry = this.stateManager.transactionQueue.getQueueEntrySafe(readableReq.proposal.txid);
                    if (queueEntry == null) {
                        return;
                    }
                    if (readableReq.txGroupCycle) {
                        if (queueEntry.txGroupCycle !== readableReq.txGroupCycle) {
                            if (logFlags.error)
                                this.mainLogger.error(`binary_poqo_send_receipt mismatch txGroupCycle for txid: ${readableReq.proposal.txid}, sender's txGroupCycle: ${readableReq.txGroupCycle}, our txGroupCycle: ${queueEntry.txGroupCycle}`);
                        }
                        delete readableReq.txGroupCycle;
                    }
                    if (queueEntry.signedReceipt) {
                        return;
                    }
                    const executionGroupNodes = new Set(queueEntry.executionGroup.map((node) => node.publicKey));
                    const hasTwoThirdsMajority = this.verifyAppliedReceipt(readableReq, executionGroupNodes);
                    if (!hasTwoThirdsMajority) {
                        if (logFlags.error)
                            this.mainLogger.error(`Receipt does not have the required majority for txid: ${readableReq.proposal.txid}`);
                        return;
                    }
                    const receivedReceipt = readableReq as SignedReceipt;
                    queueEntry.signedReceipt = receivedReceipt;
                    queueEntry.hasSentFinalReceipt = true;
                    const receiptToGossip = { ...readableReq, txGroupCycle: queueEntry.txGroupCycle };
                    Comms.sendGossip('poqo-receipt-gossip', receiptToGossip, null, null, queueEntry.transactionGroup, false, 4, readableReq.proposal.txid, '', true);
                    if (queueEntry.ourVoteHash === readableReq.proposalHash) {
                        this.stateManager.transactionQueue.factTellCorrespondingNodesFinalData(queueEntry);
                    }
                    else {
                    }
                }
                catch (e) {
                    if (logFlags.error)
                        console.error(`Error processing poqoSendReceiptBinary handler: ${e}`);
                    if (logFlags.error)
                        this.mainLogger.error(`${route}: Exception executing request: ${utils.errorToStringFull(e)}`);
                }
                finally {
                }
            },
        };
        Comms.registerInternalBinary(poqoSendReceiptBinary.name, poqoSendReceiptBinary.handler);
        const poqoSendVoteBinaryHandler: Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_poqo_send_vote,
            handler: (payload, respond, header, sign) => {
                const route = InternalRouteEnum.binary_poqo_send_vote;
                try {
                    const stream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cPoqoSendVoteReq);
                    if (!payload) {
                        return;
                    }
                    const readableReq = deserializePoqoSendVoteReq(stream);
                    const queueEntry = this.stateManager.transactionQueue.getQueueEntrySafe(readableReq.txid);
                    if (queueEntry == null) {
                        return;
                    }
                    const collectedVoteHash = readableReq as AppliedVoteHash;
                    if (!collectedVoteHash.sign) {
                        return;
                    }
                    this.tryAppendVoteHash(queueEntry, collectedVoteHash);
                }
                catch (e) {
                    if (logFlags.error)
                        console.error(`Error processing poqoSendVoteBinary handler: ${e}`);
                    if (logFlags.error)
                        this.mainLogger.error(`${route}: Exception executing request: ${utils.errorToStringFull(e)}`);
                }
                finally {
                }
            },
        };
        Comms.registerInternalBinary(poqoSendVoteBinaryHandler.name, poqoSendVoteBinaryHandler.handler);
    }
    verifyAppliedReceipt(receipt: SignedReceipt, executionGroupNodes: Set<string>): boolean {
        if (!receipt.sign) {
            return false;
        }
        if (!executionGroupNodes.has(receipt.sign.owner)) {
            return false;
        }
        if (!this.crypto.verify(receipt as SignedObject, receipt.sign.owner)) {
            return false;
        }
        receipt.signaturePack = removeDuplicateSignatures(receipt.signaturePack);
        if (receipt.signaturePack.length !== receipt.voteOffsets.length) {
            return false;
        }
        let validSignatures = 0;
        const appliedVoteHash: AppliedVoteHash = {
            txid: receipt.proposal.txid,
            voteHash: receipt.proposalHash,
            voteTime: 0,
        };
        if (receipt.proposalHash !==
            this.stateManager.transactionConsensus.calculateVoteHash(receipt.proposal)) {
            return false;
        }
        for (let i = 0; i < receipt.signaturePack.length; i++) {
            const sign = receipt.signaturePack[i];
            if (!executionGroupNodes.has(sign.owner))
                continue;
            appliedVoteHash.voteTime = receipt.voteOffsets[i];
            const signedObject = { ...appliedVoteHash, sign };
            if (this.crypto.verify(signedObject, sign.owner)) {
                validSignatures++;
            }
        }
        const totalNodes = Math.max(executionGroupNodes.size, this.config.sharding.nodesPerConsensusGroup);
        const requiredMajority = Math.ceil(totalNodes * this.config.p2p.requiredVotesPercentage);
        return validSignatures >= requiredMajority;
    }
    async poqoVoteSendLoop(queueEntry: QueueEntry, appliedVoteHash: AppliedVoteHash): Promise<void> {
        queueEntry.poqoNextSendIndex = 0;
        const aggregatorList = queueEntry.executionGroup;
        while (!queueEntry.signedReceipt) {
            if (queueEntry.poqoNextSendIndex >= aggregatorList.length) {
                break;
            }
            const voteReceivers = aggregatorList.slice(queueEntry.poqoNextSendIndex, queueEntry.poqoNextSendIndex + this.config.stateManager.poqobatchCount);
            queueEntry.poqoNextSendIndex += this.config.stateManager.poqobatchCount;
            const updatedVoteHash: AppliedVoteHash = {
                txid: appliedVoteHash.txid,
                voteHash: appliedVoteHash.voteHash,
                voteTime: Math.ceil((shardusGetTime() - queueEntry.acceptedTx.timestamp) / 1000)
            };
            const newHash = this.crypto.sign(updatedVoteHash);
            Comms.tellBinary<AppliedVoteHash>(voteReceivers, InternalRouteEnum.binary_poqo_send_vote, newHash, serializePoqoSendVoteReq, {});
            await utils.sleep(this.config.stateManager.poqoloopTime);
        }
    }
    getOrGenerateTimestampReceiptFromCache(txId: string, cycleMarker: string, cycleCounter: CycleRecord['counter']): TimestampReceipt {
        if (this.txTimestampCache.has(cycleCounter) &&
            this.txTimestampCache.get(cycleCounter).has(txId)) {
            const tsReceipt = this.txTimestampCache.get(cycleCounter).get(txId);
            return tsReceipt;
        }
        else if (Context.config.p2p.timestampCacheFix && this.txTimestampCacheByTxId.has(txId)) {
            const tsReceipt = this.txTimestampCacheByTxId.get(txId);
            return tsReceipt;
        }
        const tsReceipt: TimestampReceipt = {
            txId,
            cycleMarker,
            cycleCounter,
            timestamp: shardusGetTime(),
        };
        const signedTsReceipt = this.crypto.sign(tsReceipt);
        if (!this.txTimestampCache.has(signedTsReceipt.cycleCounter)) {
            this.txTimestampCache.set(signedTsReceipt.cycleCounter, new Map());
        }
        this.txTimestampCache.get(signedTsReceipt.cycleCounter).set(txId, signedTsReceipt);
        if (Context.config.p2p.timestampCacheFix) {
            this.txTimestampCacheByTxId.set(txId, signedTsReceipt);
            this.seenTimestampRequests.add(txId);
        }
        return signedTsReceipt;
    }
    pruneTxTimestampCache(): void {
        let cycleToKeepCache = 1;
        if (Context.config.p2p.timestampCacheFix) {
            cycleToKeepCache = 2;
        }
        for (const [cycleCounter, txMap] of this.txTimestampCache.entries()) {
            const cycleCounterInt = parseInt(cycleCounter as string);
            const shouldPruneThisCounter = cycleCounterInt + cycleToKeepCache < CycleChain.newest.counter;
            if (shouldPruneThisCounter) {
                for (const txId of txMap.keys()) {
                    if (Context.config.p2p.timestampCacheFix) {
                        this.txTimestampCacheByTxId.delete(txId);
                        this.seenTimestampRequests.delete(txId);
                    }
                }
                this.txTimestampCache.delete(cycleCounter);
            }
        }
    }
    async askTxnTimestampFromNode(txId: string): Promise<Shardus.TimestampReceipt | null> {
        const homeNode = ShardFunctions.findHomeNode(Context.stateManager.currentCycleShardData.shardGlobals, txId, Context.stateManager.currentCycleShardData.parititionShardDataMap);
        const cycleMarker = CycleChain.getCurrentCycleMarker();
        const cycleCounter = CycleChain.newest.counter;
        if (homeNode.node.id === Self.id) {
            return this.getOrGenerateTimestampReceiptFromCache(txId, cycleMarker, cycleCounter);
        }
        else {
            let timestampReceipt;
            try {
                const serialized_res = await this.p2p.askBinary<getTxTimestampReq, getTxTimestampResp>(homeNode.node, InternalRouteEnum.binary_get_tx_timestamp, {
                    cycleMarker,
                    cycleCounter,
                    txId,
                }, serializeGetTxTimestampReq, deserializeGetTxTimestampResp, {}, '', false, this.config.p2p.getTxTimestampTimeoutOffset ?? 0);
                timestampReceipt = serialized_res;
            }
            catch (e) {
                if (logFlags.error)
                    this.mainLogger.error(`Error asking timestamp from node ${homeNode.node.publicKey}: ${e.message}`);
                return null;
            }
            delete timestampReceipt.isResponse;
            const isValid = this.crypto.verify(timestampReceipt, homeNode.node.publicKey);
            if (isValid) {
                return timestampReceipt;
            }
            else {
                if (logFlags.fatal)
                    this.mainLogger.fatal(`Timestamp receipt received from home node ${homeNode.node.publicKey} is not valid. ${utils.stringifyReduce(timestampReceipt)}`);
                return null;
            }
        }
    }
    hasAppliedReceiptMatchingPreApply(queueEntry: QueueEntry, signedReceipt: SignedReceipt): boolean {
        if (queueEntry.preApplyTXResult == null || queueEntry.preApplyTXResult.applyResponse == null) {
            return false;
        }
        if (queueEntry.ourVote) {
            const receipt = queueEntry.signedReceipt;
            if (receipt != null && queueEntry.ourVoteHash != null) {
                const receiptVoteHash = this.calculateVoteHash(receipt.proposal);
                if (receiptVoteHash === queueEntry.ourVoteHash) {
                    return true;
                }
                else {
                    return false;
                }
            }
            return false;
        }
        if (signedReceipt == null) {
            return false;
        }
        if (queueEntry.ourVote == null) {
            return false;
        }
        if (signedReceipt != null) {
            if (signedReceipt.proposal.applied !== queueEntry.ourProposal.applied) {
                return false;
            }
            if (signedReceipt.proposal.txid !== queueEntry.ourProposal.txid) {
                return false;
            }
            if (signedReceipt.signaturePack.length === 0) {
                return false;
            }
            if (signedReceipt.proposal.cant_preApply === true) {
                return true;
            }
            if (signedReceipt.proposal.applied === false) {
                return true;
            }
            let wrappedStates = this.stateManager.useAccountWritesOnly ? {} : queueEntry.collectedData;
            let wrappedStateKeys = Object.keys(queueEntry.collectedData);
            const appOrderedKeys = [];
            const writtenAccountsMap: WrappedResponses = {};
            const applyResponse = queueEntry?.preApplyTXResult?.applyResponse;
            if (applyResponse.accountWrites != null && applyResponse.accountWrites.length > 0) {
                for (const wrappedAccount of applyResponse.accountWrites) {
                    appOrderedKeys.push(wrappedAccount.accountId);
                    writtenAccountsMap[wrappedAccount.accountId] = wrappedAccount.data;
                }
                wrappedStateKeys = appOrderedKeys;
                wrappedStates = writtenAccountsMap;
            }
            for (let j = 0; j < signedReceipt.proposal.accountIDs.length; j++) {
                const id = signedReceipt.proposal.accountIDs[j];
                const hash = signedReceipt.proposal.afterStateHashes[j];
                let found = false;
                for (const key of wrappedStateKeys) {
                    const wrappedState = wrappedStates[key];
                    if (wrappedState.accountId === id) {
                        found = true;
                        if (wrappedState.stateId !== hash) {
                            return false;
                        }
                    }
                }
                if (found === false) {
                    return false;
                }
            }
        }
        return true;
    }
    async tryProduceReceipt(queueEntry: QueueEntry): Promise<SignedReceipt> {
        try {
            if (queueEntry.waitForReceiptOnly === true) {
                return null;
            }
            if (queueEntry.signedReceipt != null) {
                return queueEntry.signedReceipt;
            }
            if (queueEntry.queryingRobustConfirmOrChallenge === true) {
                return null;
            }
            let votingGroup: Shardus.NodeWithRank[] | P2PTypes.NodeListTypes.Node[];
            if (this.stateManager.transactionQueue.usePOQo === true) {
                votingGroup = queueEntry.executionGroup;
            }
            else if (this.stateManager.transactionQueue.executeInOneShard &&
                this.stateManager.transactionQueue.useNewPOQ === false) {
                votingGroup = queueEntry.executionGroup;
            }
            else {
                votingGroup = this.stateManager.transactionQueue.queueEntryGetTransactionGroup(queueEntry);
            }
            if (Math.random() < this.debugFailPOQo) {
                return null;
            }
            if (queueEntry.ourVote === undefined) {
                return null;
            }
            const majorityCount = Math.ceil(votingGroup.length * this.config.p2p.requiredVotesPercentage);
            const numVotes = queueEntry.collectedVoteHashes.length;
            if (numVotes < majorityCount) {
                return null;
            }
            if (queueEntry.newVotes === false) {
                return null;
            }
            queueEntry.newVotes = false;
            let winningVoteHash: string;
            const hashCounts: Map<string, number> = new Map();
            for (let i = 0; i < numVotes; i++) {
                const currentVote = queueEntry.collectedVoteHashes[i];
                const voteCount = hashCounts.get(currentVote.voteHash) || 0;
                hashCounts.set(currentVote.voteHash, voteCount + 1);
                if (voteCount + 1 > majorityCount) {
                    winningVoteHash = currentVote.voteHash;
                    break;
                }
            }
            if (winningVoteHash != undefined) {
                if (queueEntry.ourVoteHash !== winningVoteHash) {
                    return;
                }
                const receipt: SignedReceipt = {
                    proposal: queueEntry.ourProposal,
                    proposalHash: queueEntry.ourVoteHash,
                    voteOffsets: [],
                    signaturePack: []
                };
                for (let i = 0; i < numVotes; i++) {
                    const currentVote = queueEntry.collectedVoteHashes[i];
                    if (currentVote.voteHash === winningVoteHash) {
                        receipt.signaturePack.push(currentVote.sign);
                        receipt.voteOffsets.push(currentVote.voteTime);
                    }
                }
                const signedReceipt: SignedReceipt = this.crypto.sign(receipt);
                queueEntry.signedReceipt = signedReceipt;
                const payload = { ...signedReceipt, txGroupCycle: queueEntry.txGroupCycle };
                Comms.tellBinary<PoqoSendReceiptReq>(votingGroup, InternalRouteEnum.binary_poqo_send_receipt, payload, serializePoqoSendReceiptReq, {});
                if (queueEntry.preApplyTXResult != null && queueEntry.preApplyTXResult.applyResponse != null) {
                    this.stateManager.transactionQueue.factTellCorrespondingNodesFinalData(queueEntry);
                }
                else {
                    if (signedReceipt.proposal.applied === true) {
                        if (logFlags.error)
                            this.mainLogger.error(`error: unexpected preApplyTXResult == null while result === true ${queueEntry.logID}   preApplyTXResult:${queueEntry.preApplyTXResult != null}  applyResponse:${queueEntry.preApplyTXResult?.applyResponse != null}`);
                    }
                    else {
                    }
                }
                queueEntry.hasSentFinalReceipt = true;
                Comms.sendGossip('poqo-receipt-gossip', payload, null, null, queueEntry.transactionGroup, false, 4, queueEntry.acceptedTx.txId, '', true);
                return signedReceipt;
            }
            return null;
        }
        catch (e) {
            if (logFlags.error)
                this.mainLogger.error(`tryProduceReceipt: error ${queueEntry.logID} error: ${utils.formatErrorMessage(e)}`);
        }
        finally {
        }
    }
    async robustQueryBestVote(queueEntry: QueueEntry): Promise<AppliedVote> {
        const txId = queueEntry.acceptedTx.txId;
        try {
            queueEntry.queryingRobustVote = true;
            const queryFn = async (node: Shardus.Node): Promise<AppliedVoteQueryResponse> => {
                try {
                    const ip = node.externalIp;
                    const port = node.externalPort;
                    if (ip === Self.ip && port === Self.port)
                        return null;
                    const queryData: AppliedVoteQuery = { txId: queueEntry.acceptedTx.txId };
                    const req = queryData as GetAppliedVoteReq;
                    const rBin = await Comms.askBinary<GetAppliedVoteReq, GetAppliedVoteResp>(node, InternalRouteEnum.binary_get_applied_vote, req, serializeGetAppliedVoteReq, deserializeGetAppliedVoteResp, {
                        verification_data: `${queryData.txId}`,
                    });
                    return rBin;
                }
                catch (e) {
                    this.mainLogger.error(`robustQueryBestVote: Failed query to node ${node.id} error: ${e.message}`);
                    return {
                        txId: `invalid-${randomUUID()}`,
                        appliedVote: null,
                        appliedVoteHash: null,
                    };
                }
            };
            const eqFn = (item1: AppliedVoteQueryResponse, item2: AppliedVoteQueryResponse): boolean => {
                try {
                    if (item1.appliedVoteHash === item2.appliedVoteHash)
                        return true;
                    return false;
                }
                catch (err) {
                    return false;
                }
            };
            const redundancy = 3;
            const { topResult: response } = await robustQuery(this.stateManager.transactionQueue.queueEntryGetTransactionGroup(queueEntry), queryFn, eqFn, redundancy, true, true, false, 'robustQueryBestVote');
            if (response && response.appliedVote) {
                return response.appliedVote;
            }
            else {
                this.mainLogger.error(`robustQueryBestVote: ${txId} no response from robustQuery`);
            }
        }
        catch (e) {
            this.mainLogger.error(`robustQueryBestVote: ${queueEntry.logID} error: ${e.message}`);
        }
        finally {
            queueEntry.queryingRobustVote = false;
        }
    }
    async robustQueryConfirmOrChallenge(queueEntry: QueueEntry): Promise<ConfirmOrChallengeQueryResponse> {
        try {
            if (this.stateManager.consensusLog) {
            }
            queueEntry.queryingRobustConfirmOrChallenge = true;
            const queryFn = async (node: Shardus.Node): Promise<ConfirmOrChallengeQueryResponse> => {
                if (node.externalIp === Self.ip && node.externalPort === Self.port)
                    return null;
                const queryData = { txId: queueEntry.acceptedTx.txId };
                const response = await Comms.askBinary<GetConfirmOrChallengeReq, GetConfirmOrChallengeResp>(node, InternalRouteEnum.binary_get_confirm_or_challenge, queryData, serializeGetConfirmOrChallengeReq, deserializeGetConfirmOrChallengeResp, {});
                return {
                    txId: response.txId,
                    appliedVoteHash: response.appliedVoteHash,
                    result: response.result ?? null,
                    uniqueCount: response.uniqueCount
                } as ConfirmOrChallengeQueryResponse;
            };
            const eqFn = (item1: ConfirmOrChallengeQueryResponse, item2: ConfirmOrChallengeQueryResponse): boolean => {
                try {
                    if (item1 == null || item2 == null)
                        return false;
                    if (item1.appliedVoteHash == null || item2.appliedVoteHash == null)
                        return false;
                    if (item1.result == null || item2.result == null)
                        return false;
                    const message1 = item1.appliedVoteHash + item1.result.message + item1.result.nodeId + item1.uniqueCount;
                    const message2 = item2.appliedVoteHash + item2.result.message + item2.result.nodeId + item2.uniqueCount;
                    if (message1 === message2)
                        return true;
                    return false;
                }
                catch (err) {
                    return false;
                }
                finally {
                }
            };
            let nodesToAsk = [];
            if (nodesToAsk.length === 0) {
                nodesToAsk = this.stateManager.transactionQueue.queueEntryGetTransactionGroup(queueEntry);
            }
            const redundancy = 3;
            const maxRetry = 10;
            const { topResult: response, isRobustResult, winningNodes, } = await robustQuery(nodesToAsk, queryFn, eqFn, redundancy, true, true, false, 'robustQueryConfirmOrChallenge', maxRetry);
            if (!isRobustResult) {
                return null;
            }
            if (response && response.result) {
                return response;
            }
            else {
            }
        }
        catch (e) {
            this.mainLogger.error(`robustQueryConfirmOrChallenge: ${queueEntry.logID} error: ${e.message}`);
        }
        finally {
            queueEntry.queryingRobustConfirmOrChallenge = false;
        }
    }
    async robustQueryAccountData(consensNodes: Shardus.Node[], accountId: string, txId: string): Promise<Shardus.WrappedData> {
        const queryFn = async (node: Shardus.Node): Promise<GetAccountData3Resp> => {
            const ip = node.externalIp;
            const port = node.externalPort;
            if (ip === Self.ip && port === Self.port)
                return null;
            const message: GetAccountData3Req = {
                accountStart: accountId,
                accountEnd: accountId,
                tsStart: 0,
                maxRecords: this.config.stateManager.accountBucketSize,
                offset: 0,
                accountOffset: '',
            };
            let result;
            try {
                const req = message as GetAccountDataReqSerializable;
                const rBin = await Comms.askBinary<GetAccountDataReqSerializable, GetAccountDataRespSerializable>(node, InternalRouteEnum.binary_get_account_data, req, serializeGetAccountDataReq, deserializeGetAccountDataResp, {});
                if (((rBin.errors && rBin.errors.length === 0) || !rBin.errors) && rBin.data) {
                    result = rBin as GetAccountData3Resp;
                }
            }
            catch (error) {
                this.mainLogger.error(`robustQueryAccountData: Failed query to node ${node.id}. askBinary ex: ${error.message}`);
                return {
                    data: null,
                    errors: [`robustQueryAccountData: Failed query to node ${node.id}. askBinary ex: ${error.message}`],
                };
            }
            return result;
        };
        const eqFn = (item1: GetAccountData3Resp, item2: GetAccountData3Resp): boolean => {
            try {
                const account1 = item1.data.wrappedAccounts[0];
                const account2 = item1.data.wrappedAccounts[0];
                if (account1.stateId === account2.stateId)
                    return true;
                return false;
            }
            catch (err) {
                return false;
            }
        };
        const redundancy = 3;
        const maxRetry = 5;
        const { topResult: response } = await robustQuery(consensNodes, queryFn, eqFn, redundancy, true, true, false, 'robustQueryAccountData', maxRetry);
        if (response && response.data) {
            const accountData = response.data.wrappedAccounts[0];
            return accountData;
        }
    }
    sortByAccountId(first: Shardus.WrappedResponse, second: Shardus.WrappedResponse): Ordering {
        return utils.sortAscProp(first, second, 'accountId');
    }
    async checkAccountIntegrity(queueEntry: QueueEntry): Promise<boolean> {
        queueEntry.queryingRobustAccountData = true;
        let success = true;
        for (const key of queueEntry.uniqueKeys) {
            const collectedAccountData = queueEntry.collectedData[key];
            if (collectedAccountData.accountCreated) {
                continue;
            }
            const consensuGroupForAccount = this.stateManager.transactionQueue.queueEntryGetConsensusGroupForAccount(queueEntry, key);
            const promise = this.stateManager.transactionConsensus.robustQueryAccountData(consensuGroupForAccount, key, queueEntry.acceptedTx.txId);
            queueEntry.robustAccountDataPromises[key] = promise;
        }
        if (queueEntry.robustAccountDataPromises &&
            Object.keys(queueEntry.robustAccountDataPromises).length > 0) {
            const keys = Object.keys(queueEntry.robustAccountDataPromises);
            const promises = Object.values(queueEntry.robustAccountDataPromises);
            const results: Shardus.WrappedData[] = await Promise.all(promises);
            for (let i = 0; i < results.length; i++) {
                const key = keys[i];
                const collectedAccountData = queueEntry.collectedData[key];
                const robustQueryAccountData = results[i];
                if (robustQueryAccountData.stateId === collectedAccountData.stateId &&
                    robustQueryAccountData.timestamp === collectedAccountData.timestamp) {
                }
                else {
                    success = false;
                    if (logFlags.debug) {
                    }
                }
            }
        }
        else {
        }
        queueEntry.queryingRobustAccountData = false;
        return success;
    }
    async createAndShareVote(queueEntry: QueueEntry): Promise<unknown> {
        if (queueEntry.isInExecutionHome === false) {
            return;
        }
        if (Context.config.debug.forcedExpiration) {
            if (Math.random() < 0.7) {
                return;
            }
        }
        if (queueEntry.almostExpired) {
            return;
        }
        try {
            const ourNodeId = Self.id;
            const isEligibleToShareVote = queueEntry.eligibleNodeIdsToVote.has(ourNodeId);
            const proposal: Proposal = {
                txid: queueEntry.acceptedTx.txId,
                applied: queueEntry.preApplyTXResult.passed,
                accountIDs: [],
                afterStateHashes: [],
                beforeStateHashes: [],
                cant_preApply: queueEntry.preApplyTXResult.applied === false,
                appReceiptDataHash: '',
            };
            proposal.appReceiptDataHash = queueEntry?.preApplyTXResult?.applyResponse?.appReceiptDataHash || '';
            if (queueEntry.debugFail_voteFlip === true) {
                proposal.applied = !proposal.applied;
            }
            let wrappedStates = this.stateManager.useAccountWritesOnly ? {} : queueEntry.collectedData;
            const applyResponse = queueEntry?.preApplyTXResult?.applyResponse;
            const stats = {
                usedApplyResponse: false,
                wrappedStateSet: 0,
                optimized: false,
            };
            if (applyResponse != null) {
                const writtenAccountsMap: WrappedResponses = {};
                if (applyResponse.accountWrites != null && applyResponse.accountWrites.length > 0) {
                    for (const writtenAccount of applyResponse.accountWrites) {
                        writtenAccountsMap[writtenAccount.accountId] = writtenAccount.data;
                    }
                    wrappedStates = writtenAccountsMap;
                }
                stats.usedApplyResponse = true;
                stats.wrappedStateSet = Object.keys(wrappedStates).length;
            }
            if (wrappedStates != null) {
                stats.optimized = true;
                const wrappedStatesList = [...Object.values(wrappedStates)];
                wrappedStatesList.sort(this.sortByAccountId);
                for (const wrappedState of wrappedStatesList) {
                    const updatedHash = this.app.calculateAccountHash(wrappedState.data);
                    wrappedState.stateId = updatedHash;
                    proposal.accountIDs.push(wrappedState.accountId);
                    proposal.afterStateHashes.push(wrappedState.stateId);
                    const wrappedResponse = queueEntry.collectedData[wrappedState.accountId];
                    if (wrappedResponse != null)
                        proposal.beforeStateHashes.push(wrappedResponse.stateId);
                }
            }
            let appliedVoteHash: AppliedVoteHash;
            const voteHash = this.calculateVoteHash(proposal);
            appliedVoteHash = {
                txid: proposal.txid,
                voteHash,
                voteTime: Math.ceil((shardusGetTime() - queueEntry.acceptedTx.timestamp) / 1000),
            };
            queueEntry.ourVoteHash = voteHash;
            const ourVote: Vote = {
                proposalHash: voteHash,
            };
            appliedVoteHash = this.crypto.sign(appliedVoteHash);
            this.tryAppendVoteHash(queueEntry, appliedVoteHash);
            this.crypto.sign(ourVote);
            queueEntry.ourVote = ourVote;
            queueEntry.ourProposal = proposal;
            if (queueEntry.firstVoteReceivedTimestamp === 0) {
                queueEntry.firstVoteReceivedTimestamp = shardusGetTime();
            }
            if (Math.random() < this.debugFailPOQo) {
                return;
            }
            this.poqoVoteSendLoop(queueEntry, appliedVoteHash);
            return;
        }
        catch (e) {
            this.mainLogger.error(`createAndShareVote: error ${e.message}`);
        }
        finally {
        }
    }
    calculateVoteHash(vote: Proposal): string {
        const proposal = vote;
        const applyStatus = {
            applied: proposal.applied,
            cantApply: proposal.cant_preApply,
        };
        const accountsHash = this.crypto.hash(this.crypto.hash(proposal.accountIDs) +
            this.crypto.hash(proposal.beforeStateHashes) +
            this.crypto.hash(proposal.afterStateHashes));
        const proposalHash = this.crypto.hash(this.crypto.hash(applyStatus) + accountsHash + proposal.appReceiptDataHash);
        return proposalHash;
    }
    addPendingConfirmOrChallenge(queueEntry: QueueEntry, confirmOrChallenge: ConfirmOrChallengeMessage): void {
        if (queueEntry.pendingConfirmOrChallenge.has(confirmOrChallenge.nodeId) === false) {
            queueEntry.pendingConfirmOrChallenge.set(confirmOrChallenge.nodeId, confirmOrChallenge);
        }
    }
    tryAppendVote(queueEntry: QueueEntry, vote: AppliedVote): boolean {
        if (!queueEntry.executionGroup.some((node) => node.publicKey === vote.sign.owner)) {
            return false;
        }
        if (vote.sign == null) {
            return false;
        }
        if (!this.crypto.verify(vote as SignedObject, vote.sign.owner)) {
            return false;
        }
        const numVotes = queueEntry.collectedVotes.length;
        if (numVotes === 0) {
            queueEntry.collectedVotes.push(vote);
            queueEntry.newVotes = true;
            if (queueEntry.firstVoteReceivedTimestamp === 0)
                queueEntry.firstVoteReceivedTimestamp = shardusGetTime();
            queueEntry.lastVoteReceivedTimestamp = shardusGetTime();
            return true;
        }
        for (let i = 0; i < numVotes; i++) {
            const currentVote = queueEntry.collectedVotes[i];
            if (currentVote.sign.owner === vote.sign.owner) {
                return false;
            }
        }
        queueEntry.lastVoteReceivedTimestamp = shardusGetTime();
        queueEntry.collectedVotes.push(vote);
        queueEntry.newVotes = true;
        return true;
    }
    tryAppendVoteHash(queueEntry: QueueEntry, voteHash: AppliedVoteHash): boolean {
        if (!queueEntry.executionGroup.some((node) => node.publicKey === voteHash.sign.owner)) {
            return false;
        }
        if (voteHash.sign == null) {
            return false;
        }
        if (!this.crypto.verify(voteHash as SignedObject, voteHash.sign.owner)) {
            return false;
        }
        const numVotes = queueEntry.collectedVoteHashes.length;
        if (numVotes === 0) {
            queueEntry.collectedVoteHashes.push(voteHash);
            queueEntry.newVotes = true;
            queueEntry.lastVoteReceivedTimestamp = shardusGetTime();
            return true;
        }
        for (let i = 0; i < numVotes; i++) {
            const currentVote = queueEntry.collectedVoteHashes[i];
            if (currentVote.sign.owner === voteHash.sign.owner) {
                if (currentVote.voteTime < voteHash.voteTime) {
                    queueEntry.collectedVoteHashes[i] = voteHash;
                    queueEntry.newVotes = true;
                    queueEntry.lastVoteReceivedTimestamp = shardusGetTime();
                    return true;
                }
                else {
                    return false;
                }
            }
        }
        queueEntry.collectedVoteHashes.push(voteHash);
        queueEntry.newVotes = true;
        queueEntry.lastVoteReceivedTimestamp = shardusGetTime();
        return true;
    }
}
export default TransactionConsenus;