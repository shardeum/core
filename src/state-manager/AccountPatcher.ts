import * as Shardus from '../shardus/shardus-types';
import { StateManager as StateManagerTypes } from '@shardus/types';
import * as utils from '../utils';
import Profiler, { profilerInstance } from '../utils/profiler';
import { P2PModuleContext as P2P } from '../p2p/Context';
import Crypto, { HashableObject } from '../crypto';
import Logger, { logFlags } from '../logger';
import log4js from 'log4js';
import ShardFunctions from './shardFunctions';
import StateManager from '.';
import { nestedCountersInstance } from '../utils/nestedCounters';
import * as NodeList from '../p2p/NodeList';
import * as Context from '../p2p/Context';
import * as Self from '../p2p/Self';
import { SignedObject } from '@shardus/crypto-utils';
import { AccountHashCache, AccountHashCacheHistory, AccountIDAndHash, AccountIdAndHashToRepair, AccountPreTest, HashTrieAccountDataRequest, HashTrieAccountDataResponse, HashTrieAccountsResp, HashTrieNode, HashTrieRadixCoverage, HashTrieReq, HashTrieResp, HashTrieSyncConsensus, HashTrieSyncTell, HashTrieUpdateStats, RadixAndHashWithNodeId, RadixAndChildHashesWithNodeId, RadixAndHash, ShardedHashTrie, TrieAccount, IsInsyncResult, CycleShardData, SignedReceipt } from "./state-manager-types";
import { isDebugModeMiddleware, isDebugModeMiddlewareLow, isDebugModeMiddlewareMedium, } from '../network/debugMiddleware';
import { appdata_replacer, errorToStringFull, Ordering } from '../utils';
import { Response } from 'express-serve-static-core';
import { shardusGetTime } from '../network';
import { InternalBinaryHandler } from '../types/Handler';
import { Route } from '@shardus/types/build/src/p2p/P2PTypes';
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum';
import { SyncTrieHashesRequest, deserializeSyncTrieHashesReq, serializeSyncTrieHashesReq, } from '../types/SyncTrieHashesReq';
import { GetTrieHashesResponse, serializeGetTrieHashesResp, deserializeGetTrieHashesResp, } from '../types/GetTrieHashesResp';
import { GetTrieHashesRequest, deserializeGetTrieHashesReq, serializeGetTrieHashesReq, } from '../types/GetTrieHashesReq';
import { deserializeGetAccountDataByHashesResp, GetAccountDataByHashesResp, serializeGetAccountDataByHashesResp, } from '../types/GetAccountDataByHashesResp';
import { deserializeGetAccountDataByHashesReq, GetAccountDataByHashesReq, serializeGetAccountDataByHashesReq, } from '../types/GetAccountDataByHashesReq';
import { WrappedData } from '../types/WrappedData';
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum';
import { getStreamWithTypeCheck, requestErrorHandler } from '../types/Helpers';
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum';
import { GetTrieAccountHashesReq, deserializeGetTrieAccountHashesReq, serializeGetTrieAccountHashesReq, } from '../types/GetTrieAccountHashesReq';
import { GetTrieAccountHashesResp, deserializeGetTrieAccountHashesResp, serializeGetTrieAccountHashesResp, } from '../types/GetTrieAccountHashesResp';
import { BadRequest, InternalError, serializeResponseError } from '../types/ResponseError';
import { Utils } from '@shardus/types';
import { RepairOOSAccountsReq, deserializeRepairOOSAccountsReq, serializeRepairOOSAccountsReq } from '../types/RepairOOSAccountsReq';
import { robustQuery } from '../p2p/Utils';
import { RequestReceiptForTxReqSerialized, serializeRequestReceiptForTxReq } from '../types/RequestReceiptForTxReq';
import { deserializeRequestReceiptForTxResp, RequestReceiptForTxRespSerialized } from '../types/RequestReceiptForTxResp';
import { Node } from '../shardus/shardus-types';
type Line = {
    raw: string;
    file: {
        owner: string;
    };
};
type AccountHashStats = {
    matched: number;
    visisted: number;
    empty: number;
    nullResults: number;
    numRequests: number;
    responses: number;
    exceptions: number;
    radixToReq: number;
    actualRadixRequests: number;
};
type AccountStats = {
    skipping: number;
    multiRequests: number;
    requested: number;
};
interface AccountRepairDataResponse {
    nodes: Shardus.Node[];
    wrappedDataList: Shardus.WrappedData[];
}
interface TooOldAccountRecord {
    wrappedData: Shardus.WrappedData;
    accountMemData: AccountHashCache;
    node: Shardus.Node;
}
interface TooOldAccountUpdateRequest {
    accountID: string;
    txId: string;
    signedReceipt: SignedReceipt;
    updatedAccountData: Shardus.WrappedData;
}
type RequestEntry = {
    node: Shardus.Node;
    request: {
        cycle: number;
        accounts: AccountIDAndHash[];
    };
};
class AccountPatcher {
    app: Shardus.App;
    crypto: Crypto;
    config: Shardus.StrictServerConfiguration;
    profiler: Profiler;
    p2p: P2P;
    logger: Logger;
    mainLogger: log4js.Logger;
    fatalLogger: log4js.Logger;
    shardLogger: log4js.Logger;
    statsLogger: log4js.Logger;
    statemanager_fatal: (key: string, log: string) => void;
    stateManager: StateManager;
    treeMaxDepth: number;
    treeSyncDepth: number;
    shardTrie: ShardedHashTrie;
    totalAccounts: number;
    accountUpdateQueue: TrieAccount[];
    accountUpdateQueueFuture: TrieAccount[];
    accountRemovalQueue: string[];
    hashTrieSyncConsensusByCycle: Map<number, HashTrieSyncConsensus>;
    incompleteNodes: HashTrieNode[];
    debug_ignoreUpdates: boolean;
    lastInSyncResult: IsInsyncResult;
    failedLastTrieSync: boolean;
    failStartCycle: number;
    failEndCycle: number;
    failRepairsCounter: number;
    syncFailHistory: {
        s: number;
        e: number;
        cycles: number;
        repaired: number;
    }[];
    sendHashesToEdgeNodes: boolean;
    lastCycleNonConsensusRanges: {
        low: string;
        high: string;
    }[];
    nonStoredRanges: {
        low: string;
        high: string;
    }[];
    radixIsStored: Map<string, boolean>;
    lastRepairInfo: unknown;
    constructor(stateManager: StateManager, profiler: Profiler, app: Shardus.App, logger: Logger, p2p: P2P, crypto: Crypto, config: Shardus.StrictServerConfiguration) {
        this.crypto = crypto;
        this.app = app;
        this.logger = logger;
        this.config = config;
        this.profiler = profiler;
        this.p2p = p2p;
        if (logger == null) {
            return;
        }
        this.mainLogger = logger.getLogger('main');
        this.fatalLogger = logger.getLogger('fatal');
        this.shardLogger = logger.getLogger('shardDump');
        this.statsLogger = logger.getLogger('statsDump');
        this.statemanager_fatal = stateManager.statemanager_fatal;
        this.stateManager = stateManager;
        this.treeMaxDepth = 4;
        this.treeSyncDepth = 1;
        this.shardTrie = {
            layerMaps: [],
        };
        for (let i = 0; i < this.treeMaxDepth + 1; i++) {
            this.shardTrie.layerMaps.push(new Map());
        }
        this.totalAccounts = 0;
        this.hashTrieSyncConsensusByCycle = new Map();
        this.incompleteNodes = [];
        this.accountUpdateQueue = [];
        this.accountUpdateQueueFuture = [];
        this.accountRemovalQueue = [];
        this.debug_ignoreUpdates = false;
        this.failedLastTrieSync = false;
        this.lastInSyncResult = null;
        this.sendHashesToEdgeNodes = true;
        this.lastCycleNonConsensusRanges = [];
        this.nonStoredRanges = [];
        this.radixIsStored = new Map();
        this.lastRepairInfo = 'none';
        this.failStartCycle = -1;
        this.failEndCycle = -1;
        this.failRepairsCounter = 0;
        this.syncFailHistory = [];
    }
    hashObj(value: HashableObject): string {
        return this.crypto.hash(value);
    }
    sortByAccountID(a: TrieAccount, b: TrieAccount): Ordering {
        if (a.accountID < b.accountID) {
            return -1;
        }
        if (a.accountID > b.accountID) {
            return 1;
        }
        return 0;
    }
    sortByRadix(a: RadixAndHash, b: RadixAndHash): Ordering {
        if (a.radix < b.radix) {
            return -1;
        }
        if (a.radix > b.radix) {
            return 1;
        }
        return 0;
    }
    setupHandlers(): void {
        const repairMissingAccountsBinary: Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_repair_oos_accounts,
            handler: async (payloadBuffer, respond, header, sign) => {
                const route = InternalRouteEnum.binary_repair_oos_accounts;
                try {
                    const requestStream = getStreamWithTypeCheck(payloadBuffer, TypeIdentifierEnum.cRepairOOSAccountsReq);
                    if (!requestStream) {
                        return;
                    }
                    const payload = deserializeRepairOOSAccountsReq(requestStream);
                    for (const repairInstruction of payload?.repairInstructions) {
                        const { accountID, txId, hash, accountData, targetNodeId, signedReceipt } = repairInstruction;
                        if (targetNodeId !== Self.id) {
                            continue;
                        }
                        const storageNodes = this.stateManager.transactionQueue.getStorageGroupForAccount(accountID);
                        const isInStorageGroup = storageNodes.map((node) => node.id).includes(Self.id);
                        if (!isInStorageGroup) {
                            continue;
                        }
                        const accountHashCache = this.stateManager.accountCache.getAccountHash(accountID);
                        if (accountHashCache != null && accountHashCache.h === hash) {
                            continue;
                        }
                        if (accountHashCache != null && accountHashCache.t > accountData.timestamp) {
                            continue;
                        }
                        const archivedQueueEntry = this.stateManager.transactionQueue.getQueueEntryArchived(txId, 'repair_oos_accounts');
                        if (archivedQueueEntry == null) {
                            continue;
                        }
                        const proposal = signedReceipt.proposal;
                        if (signedReceipt.proposalHash !==
                            this.stateManager.transactionConsensus.calculateVoteHash(proposal)) {
                            continue;
                        }
                        const queryFn = async (node: Node) => {
                            const message = { txid: txId, timestamp: accountData.timestamp };
                            return await this.p2p.askBinary<RequestReceiptForTxReqSerialized, RequestReceiptForTxRespSerialized>(node, InternalRouteEnum.binary_request_receipt_for_tx, message, serializeRequestReceiptForTxReq, deserializeRequestReceiptForTxResp, {});
                        };
                        const txReceipt = await robustQuery(storageNodes, queryFn);
                        if (txReceipt.isRobustResult === false) {
                            continue;
                        }
                        if (txReceipt.topResult.success !== true
                            || txReceipt.topResult.receipt == null
                            || txReceipt.topResult.receipt.proposalHash == null) {
                            continue;
                        }
                        if (signedReceipt.proposalHash !== txReceipt.topResult.receipt.proposalHash) {
                            continue;
                        }
                        const executionGroupNodes = new Set(archivedQueueEntry.executionGroup.map((node) => node.publicKey));
                        const receiptVerification = this.stateManager.transactionConsensus.verifyAppliedReceipt(signedReceipt, executionGroupNodes);
                        if (receiptVerification !== true) {
                            continue;
                        }
                        if (!proposal.applied) {
                            continue;
                        }
                        const calculatedAccountHash = this.app.calculateAccountHash(accountData.data);
                        let accountHashMatch = false;
                        for (let i = 0; i < proposal.accountIDs.length; i++) {
                            if (proposal.accountIDs[i] === accountID) {
                                if (proposal.afterStateHashes[i] !== calculatedAccountHash) {
                                    accountHashMatch = false;
                                }
                                else {
                                    accountHashMatch = true;
                                }
                                break;
                            }
                        }
                        if (accountHashMatch === false) {
                            continue;
                        }
                        const updatedAccounts: string[] = [];
                        const failedHashes = await this.stateManager.checkAndSetAccountData([accountData], `binary/repair_oos_accounts:${txId}`, true, updatedAccounts);
                        let success = false;
                        if (updatedAccounts.length > 0 && failedHashes.length === 0) {
                            success = true;
                        }
                    }
                }
                catch (e) {
                    console.error(`Error in repairMissingAccountsBinary handler: ${e.message}`);
                }
                finally {
                }
            },
        };
        const getTrieHashesBinary: Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_get_trie_hashes,
            handler: async (payloadBuffer, respond, header, sign) => {
                const route = InternalRouteEnum.binary_get_trie_hashes;
                const result = { nodeHashes: [], nodeId: Self.id } as GetTrieHashesResponse;
                try {
                    const requestStream = getStreamWithTypeCheck(payloadBuffer, TypeIdentifierEnum.cGetTrieHashesReq);
                    if (!requestStream) {
                        respond(result, serializeGetTrieHashesResp);
                        return;
                    }
                    const readableReq = deserializeGetTrieHashesReq(requestStream);
                    let responseCount = 0;
                    if (!Self.isFailed) {
                        for (const radix of readableReq.radixList) {
                            const level = radix.length;
                            const layerMap = this.shardTrie.layerMaps[level];
                            if (layerMap == null) {
                                break;
                            }
                            const hashTrieNode = layerMap.get(radix);
                            if (hashTrieNode != null) {
                                for (const childTreeNode of hashTrieNode.children) {
                                    if (childTreeNode != null) {
                                        result.nodeHashes.push({ radix: childTreeNode.radix, hash: childTreeNode.hash });
                                        responseCount++;
                                    }
                                }
                            }
                        }
                        if (responseCount > 0) {
                        }
                    }
                    respond(result, serializeGetTrieHashesResp);
                }
                catch (e) {
                    console.error(`Error in getTrieHashesBinary handler: ${e.message}`);
                    respond({ nodeHashes: null }, serializeGetTrieHashesResp);
                }
                finally {
                }
            },
        };
        this.p2p.registerInternalBinary(getTrieHashesBinary.name, getTrieHashesBinary.handler);
        this.p2p.registerInternalBinary(repairMissingAccountsBinary.name, repairMissingAccountsBinary.handler);
        const syncTrieHashesBinaryHandler: Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_sync_trie_hashes,
            handler: async (payload, respond, header, sign) => {
                const route = InternalRouteEnum.binary_sync_trie_hashes;
                const errorHandler = (errorType: RequestErrorEnum, opts?: {
                    customErrorLog?: string;
                    customCounterSuffix?: string;
                }): void => requestErrorHandler(route, errorType, header, opts);
                try {
                    const stream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cSyncTrieHashesReq);
                    if (!stream) {
                        return errorHandler(RequestErrorEnum.InvalidRequest);
                    }
                    const request = deserializeSyncTrieHashesReq(stream);
                    const cycle = request.cycle;
                    let hashTrieSyncConsensus = this.hashTrieSyncConsensusByCycle.get(cycle);
                    if (hashTrieSyncConsensus == null) {
                        hashTrieSyncConsensus = {
                            cycle,
                            radixHashVotes: new Map(),
                            coverageMap: new Map(),
                        };
                        this.hashTrieSyncConsensusByCycle.set(cycle, hashTrieSyncConsensus);
                        const shardValues = this.stateManager.shardValuesByCycle.get(cycle);
                        if (shardValues == null) {
                            if (logFlags.debug)
                                console.error(`Shard values not ready for cycle: ${cycle}`);
                            return;
                        }
                        this.initStoredRadixValues(cycle);
                    }
                    const node = NodeList.nodes.get(header.sender_id);
                    for (const nodeHashes of request.nodeHashes) {
                        if (this.isRadixStored(cycle, nodeHashes.radix) === false) {
                            continue;
                        }
                        if (nodeHashes.radix.length !== this.treeSyncDepth) {
                            if (logFlags.error)
                                this.mainLogger.error(`syncTrieHashesBinaryHandler: radix length mismatch: ${nodeHashes.radix}`);
                            continue;
                        }
                        let hashVote = hashTrieSyncConsensus.radixHashVotes.get(nodeHashes.radix);
                        if (hashVote == null) {
                            hashVote = { allVotes: new Map(), bestHash: nodeHashes.hash, bestVotes: 1 };
                            hashTrieSyncConsensus.radixHashVotes.set(nodeHashes.radix, hashVote);
                            hashVote.allVotes.set(nodeHashes.hash, { count: 1, voters: new Set([node]) });
                        }
                        else {
                            const voteEntry = hashVote.allVotes.get(nodeHashes.hash);
                            if (voteEntry == null) {
                                hashVote.allVotes.set(nodeHashes.hash, { count: 1, voters: new Set([node]) });
                            }
                            else {
                                voteEntry.voters.add(node);
                                const voteCount = voteEntry.voters.size;
                                voteEntry.count = voteCount;
                                if (voteCount > hashVote.bestVotes) {
                                    hashVote.bestVotes = voteCount;
                                    hashVote.bestHash = nodeHashes.hash;
                                }
                            }
                        }
                    }
                }
                catch (e) {
                    if (logFlags.error)
                        console.error(`Error processing syncTrieHashesBinaryHandler: ${e}`);
                    if (logFlags.error)
                        this.mainLogger.error(`${route}: Exception executing request: ${errorToStringFull(e)}`);
                }
                finally {
                }
            },
        };
        this.p2p.registerInternalBinary(syncTrieHashesBinaryHandler.name, syncTrieHashesBinaryHandler.handler);
        const getTrieAccountHashesBinaryHandler: Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_get_trie_account_hashes,
            handler: (payload, respond, header, sign) => {
                const route = InternalRouteEnum.binary_get_trie_account_hashes;
                const result = {
                    nodeChildHashes: [],
                    stats: { matched: 0, visisted: 0, empty: 0, childCount: 0 },
                    nodeId: Self.id
                } as HashTrieAccountsResp;
                try {
                    const stream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cGetAccountTrieHashesReq);
                    if (!stream) {
                        requestErrorHandler(route, RequestErrorEnum.InvalidRequest, header);
                        return respond(BadRequest('invalid request stream'), serializeResponseError);
                    }
                    const req = deserializeGetTrieAccountHashesReq(stream);
                    const radixList = req.radixList;
                    const patcherMaxChildHashResponses = this.config.stateManager.patcherMaxChildHashResponses;
                    for (const radix of radixList) {
                        result.stats.visisted++;
                        const level = radix.length;
                        const layerMap = this.shardTrie.layerMaps[level];
                        if (layerMap == null) {
                            break;
                        }
                        const hashTrieNode = layerMap.get(radix);
                        if (hashTrieNode != null && hashTrieNode.accounts != null) {
                            result.stats.matched++;
                            const childAccounts = [];
                            result.nodeChildHashes.push({ radix, childAccounts });
                            for (const account of hashTrieNode.accounts) {
                                childAccounts.push({ accountID: account.accountID, hash: account.hash });
                                result.stats.childCount++;
                            }
                            if (hashTrieNode.accounts.length === 0) {
                                result.stats.empty++;
                            }
                        }
                        if (result.stats.childCount > patcherMaxChildHashResponses) {
                            break;
                        }
                    }
                    respond(result, serializeGetTrieAccountHashesResp);
                }
                catch (e) {
                    this.statemanager_fatal('binary_get_trie_accountHashes-failed', 'binary_get_trie_accountHashes:' + e.name + ': ' + e.message + ' at ' + e.stack);
                    respond(InternalError('exception executing request'), serializeResponseError);
                }
                finally {
                }
            },
        };
        this.p2p.registerInternalBinary(getTrieAccountHashesBinaryHandler.name, getTrieAccountHashesBinaryHandler.handler);
        const getAccountDataByHashesBinaryHandler: Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_get_account_data_by_hashes,
            handler: async (payload, respond) => {
                const route = InternalRouteEnum.binary_get_account_data_by_hashes;
                const result = { accounts: [], stateTableData: [] } as GetAccountDataByHashesResp;
                try {
                    const stream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cGetAccountDataByHashesReq);
                    if (!stream) {
                        return respond(result, serializeGetAccountDataByHashesResp);
                    }
                    const req = deserializeGetAccountDataByHashesReq(stream);
                    const queryStats = {
                        fix1: 0,
                        fix2: 0,
                        skip_localHashMismatch: 0,
                        skip_requestHashMismatch: 0,
                        returned: 0,
                        missingResp: false,
                        noResp: false,
                    };
                    const hashMap = new Map();
                    const accountIDs = [];
                    if (req.accounts.length > 900) {
                        req.accounts = req.accounts.slice(0, 900);
                    }
                    for (const accountHashEntry of req.accounts) {
                        if (accountHashEntry == null ||
                            accountHashEntry.hash == null ||
                            accountHashEntry.accountID == null) {
                            queryStats.fix1++;
                            continue;
                        }
                        hashMap.set(accountHashEntry.accountID, accountHashEntry.hash);
                        accountIDs.push(accountHashEntry.accountID);
                    }
                    const accountData = await this.app.getAccountDataByList(accountIDs);
                    const skippedAccounts: AccountIDAndHash[] = [];
                    const returnedAccounts: AccountIDAndHash[] = [];
                    const accountsToGetStateTableDataFor = [];
                    const accountDataFinal: WrappedData[] = [];
                    if (accountData != null) {
                        for (const wrappedAccount of accountData) {
                            if (wrappedAccount == null || wrappedAccount.stateId == null || wrappedAccount.data == null) {
                                queryStats.fix2++;
                                continue;
                            }
                            const { accountId, stateId, data: recordData } = wrappedAccount;
                            const accountHash = this.app.calculateAccountHash(recordData);
                            if (stateId !== accountHash) {
                                skippedAccounts.push({ accountID: accountId, hash: stateId });
                                queryStats.skip_localHashMismatch++;
                                continue;
                            }
                            if (hashMap.get(accountId) === wrappedAccount.stateId) {
                                accountDataFinal.push(wrappedAccount);
                                returnedAccounts.push({ accountID: accountId, hash: stateId });
                                accountsToGetStateTableDataFor.push(accountId);
                                queryStats.returned++;
                            }
                            else {
                                queryStats.skip_requestHashMismatch++;
                                skippedAccounts.push({ accountID: accountId, hash: stateId });
                            }
                        }
                    }
                    if (queryStats.returned < req.accounts.length) {
                        queryStats.missingResp = true;
                        if (queryStats.returned === 0) {
                            queryStats.noResp = true;
                        }
                    }
                    result.accounts = accountDataFinal;
                    respond(result, serializeGetAccountDataByHashesResp);
                }
                catch (ex) {
                    this.statemanager_fatal(`get_account_data_by_hashes-failed`, 'get_account_data_by_hashes:' + ex.name + ': ' + ex.message + ' at ' + ex.stack);
                    respond(result, serializeGetAccountDataByHashesResp);
                }
                finally {
                }
            },
        };
        this.p2p.registerInternalBinary(getAccountDataByHashesBinaryHandler.name, getAccountDataByHashesBinaryHandler.handler);
        Context.network.registerExternalGet('debug-patcher-ignore-hash-updates', isDebugModeMiddleware, (_req, res) => {
            try {
                this.debug_ignoreUpdates = !this.debug_ignoreUpdates;
                res.write(`this.debug_ignoreUpdates: ${this.debug_ignoreUpdates}\n`);
            }
            catch (e) {
                res.write(`${e}\n`);
            }
            res.end();
        });
        Context.network.registerExternalGet('debug-patcher-fail-tx', isDebugModeMiddleware, (_req, res) => {
            try {
                if (this.stateManager.failNoRepairTxChance === 0) {
                    this.stateManager.failNoRepairTxChance = 1;
                }
                else {
                    this.stateManager.failNoRepairTxChance = 0;
                }
                res.write(`this.failNoRepairTxChance: ${this.stateManager.failNoRepairTxChance}\n`);
            }
            catch (e) {
                res.write(`${e}\n`);
            }
            res.end();
        });
        Context.network.registerExternalGet('debug-patcher-voteflip', isDebugModeMiddleware, (_req, res) => {
            try {
                if (this.stateManager.voteFlipChance === 0) {
                    this.stateManager.voteFlipChance = 1;
                }
                else {
                    this.stateManager.voteFlipChance = 0;
                }
                res.write(`this.voteFlipChance: ${this.stateManager.voteFlipChance}\n`);
            }
            catch (e) {
                res.write(`${e}\n`);
            }
            res.end();
        });
        Context.network.registerExternalGet('debug-patcher-toggle-skip', isDebugModeMiddleware, (_req, res) => {
            try {
                if (this.stateManager.debugSkipPatcherRepair === false) {
                    this.stateManager.debugSkipPatcherRepair = true;
                }
                else {
                    this.stateManager.debugSkipPatcherRepair = false;
                }
                res.write(`this.debugSkipPatcherRepair: ${this.stateManager.debugSkipPatcherRepair}\n`);
            }
            catch (e) {
                res.write(`${e}\n`);
            }
            res.end();
        });
        Context.network.registerExternalGet('debug-patcher-dumpTree', isDebugModeMiddlewareMedium, (_req, res) => {
            try {
                const trieRoot = this.shardTrie.layerMaps[0].values().next().value;
                const tempString = JSON.stringify(trieRoot, utils.debugReplacer);
                const processedObject = Utils.safeJsonParse(tempString);
                const finalStr = utils.stringifyReduce(processedObject);
                this.statemanager_fatal('debug shardTrie', `temp shardTrie ${finalStr}`);
                res.write(`${finalStr}\n`);
            }
            catch (e) {
                res.write(`${e}\n`);
            }
            res.end();
        });
        Context.network.registerExternalGet('debug-patcher-dumpTree-partial', isDebugModeMiddlewareMedium, (req, res) => {
            try {
                const subTree: boolean = req.query.subtree === 'true';
                let radix: string = req.query.radix as string;
                if (radix.length > this.treeMaxDepth)
                    radix = radix.slice(0, this.treeMaxDepth);
                const level = radix.length;
                const layerMap = this.shardTrie.layerMaps[level];
                let hashTrieNode = layerMap.get(radix.toLowerCase());
                if (!subTree) {
                    hashTrieNode = Utils.safeJsonParse(Utils.safeStringify(hashTrieNode));
                    delete hashTrieNode.children;
                }
                if (!hashTrieNode) {
                    if (logFlags.error)
                        console.error('debug-patcher-dumpTree-partial - Radix not found. Returning 404');
                    res.status(404).json({ error: 'Radix not found' });
                    return;
                }
                const tempString = JSON.stringify(hashTrieNode, utils.debugReplacer);
                const processedObject = Utils.safeJsonParse(tempString);
                const finalStr = utils.stringifyReduce(processedObject);
                this.statemanager_fatal('debug shardTrie', `temp shardTrie ${finalStr}`);
                res.write(`${finalStr}\n`);
            }
            catch (e) {
                res.write(`${e}\n`);
            }
            res.end();
        });
        Context.network.registerExternalGet('debug-patcher-fail-hashes', isDebugModeMiddlewareLow, (_req, res) => {
            try {
                const lastCycle = this.p2p.state.getLastCycle();
                const cycle = lastCycle.counter;
                const minVotes = this.calculateMinVotes();
                const notEnoughVotesRadix = {};
                const outOfSyncRadix = {};
                const hashTrieSyncConsensus = this.hashTrieSyncConsensusByCycle.get(cycle);
                if (!hashTrieSyncConsensus) {
                    res.json({ error: `Unable to find hashTrieSyncConsensus for last cycle ${lastCycle}` });
                    return;
                }
                for (const radix of hashTrieSyncConsensus.radixHashVotes.keys()) {
                    const votesMap = hashTrieSyncConsensus.radixHashVotes.get(radix);
                    const ourTrieNode = this.shardTrie.layerMaps[this.treeSyncDepth].get(radix);
                    const hasEnoughVotes = votesMap.bestVotes >= minVotes;
                    const isRadixInSync = ourTrieNode ? ourTrieNode.hash === votesMap.bestHash : false;
                    if (!hasEnoughVotes || !isRadixInSync) {
                        const kvp = [];
                        for (const [key, value] of votesMap.allVotes.entries()) {
                            kvp.push({
                                id: key,
                                count: value.count,
                                nodeIDs: [...value.voters].map((node) => utils.makeShortHash(node.id) + ':' + node.externalPort),
                            });
                        }
                        const simpleMap = {
                            bestHash: votesMap.bestHash,
                            ourHash: ourTrieNode ? ourTrieNode.hash : '',
                            bestVotes: votesMap.bestVotes,
                            minVotes,
                            allVotes: kvp,
                        };
                        if (!hasEnoughVotes)
                            notEnoughVotesRadix[radix] = simpleMap;
                        if (!isRadixInSync)
                            outOfSyncRadix[radix] = simpleMap;
                    }
                }
                res.json({
                    cycle,
                    notEnoughVotesRadix,
                    outOfSyncRadix,
                });
                return;
            }
            catch (e) {
                res.write(`${e}\n`);
            }
            res.end();
        });
        Context.network.registerExternalGet('get-tree-last-insync', isDebugModeMiddlewareLow, (_req, res) => {
            res.write(`${this.failedLastTrieSync === false}\n`);
            res.end();
        });
        Context.network.registerExternalGet('get-tree-last-insync-detail', isDebugModeMiddlewareLow, (_req, res) => {
            let prettyJSON = JSON.stringify(this.lastInSyncResult, null, 2);
            res.write(`${prettyJSON}\n`);
            res.end();
        });
        Context.network.registerExternalGet('trie-repair-dump', isDebugModeMiddleware, (_req, res) => {
            res.write(`${utils.stringifyReduce(this.lastRepairInfo)}\n`);
            res.end();
        });
        Context.network.registerExternalGet('get-shard-dump', isDebugModeMiddleware, (_req, res) => {
            res.write(`${this.stateManager.lastShardReport}\n`);
            res.end();
        });
        Context.network.registerExternalGet('account-report', isDebugModeMiddleware, async (req, res) => {
            if (req.query.id == null)
                return;
            let id = req.query.id as string;
            res.write(`report for: ${id} \n`);
            try {
                if (id.length === 10) {
                    let found = false;
                    const prefix = id.substring(0, 4);
                    const low = prefix + '0'.repeat(60);
                    const high = prefix + 'f'.repeat(60);
                    const suffix = id.substring(5, 10);
                    const possibleAccounts = await this.app.getAccountDataByRange(low, high, 0, shardusGetTime(), 100, 0, '');
                    res.write(`searching ${possibleAccounts.length} accounts \n`);
                    for (const account of possibleAccounts) {
                        if (account.accountId.endsWith(suffix)) {
                            res.write(`found full account ${id} => ${account.accountId} \n`);
                            id = account.accountId;
                            found = true;
                            break;
                        }
                    }
                    if (found == false) {
                        res.write(`could not find account\n`);
                        res.end();
                        return;
                    }
                }
                const trieAccount = this.getAccountTreeInfo(id);
                const accountHash = this.stateManager.accountCache.getAccountHash(id);
                const accountHashFull = this.stateManager.accountCache.getAccountDebugObject(id);
                const accountData = await this.app.getAccountDataByList([id]);
                res.write(`trieAccount: ${Utils.safeStringify(trieAccount)} \n`);
                res.write(`accountHash: ${Utils.safeStringify(accountHash)} \n`);
                res.write(`accountHashFull: ${Utils.safeStringify(accountHashFull)} \n`);
                res.write(`accountData: ${JSON.stringify(accountData, appdata_replacer)} \n\n`);
                res.write(`tests: \n`);
                if (accountData != null && accountData.length === 1 && accountHash != null) {
                    res.write(`accountData hash matches cache ${accountData[0].stateId === accountHash.h} \n`);
                }
                if (accountData != null && accountData.length === 1 && trieAccount != null) {
                    res.write(`accountData matches trieAccount ${accountData[0].stateId === trieAccount.hash} \n`);
                }
            }
            catch (e) {
                res.write(`${e}\n`);
            }
            res.end();
        });
        Context.network.registerExternalGet('account-coverage', isDebugModeMiddleware, async (req, res) => {
            if (req.query.id === null)
                return;
            const id = req.query.id as string;
            const possibleAccountsIds: string[] = [];
            try {
                if (id.length === 10) {
                    const prefix = id.substring(0, 4);
                    const low = prefix + '0'.repeat(60);
                    const high = prefix + 'f'.repeat(60);
                    const suffix = id.substring(5, 10);
                    const possibleAccounts = await this.app.getAccountDataByRange(low, high, 0, shardusGetTime(), 100, 0, '');
                    for (const account of possibleAccounts) {
                        if (account.accountId.endsWith(suffix)) {
                            possibleAccountsIds.push(account.accountId);
                        }
                    }
                }
                else {
                    possibleAccountsIds.push(id);
                }
                if (possibleAccountsIds.length === 0) {
                    res.write(Utils.safeStringify({
                        success: false,
                        error: 'could not find account',
                    }));
                }
                else {
                    const resObj = {};
                    for (const accountId of possibleAccountsIds) {
                        const consensusNodes = this.stateManager.transactionQueue.getConsenusGroupForAccount(accountId);
                        const storedNodes = this.stateManager.transactionQueue.getStorageGroupForAccount(accountId);
                        resObj[accountId] = {
                            consensusNodes: consensusNodes.map((node) => {
                                return {
                                    id: node.id,
                                    externalIp: node.externalIp,
                                    externalPort: node.externalPort,
                                    internalIp: node.internalIp,
                                    internalPort: node.internalPort,
                                };
                            }),
                            storedNodes: storedNodes.map((node) => {
                                return {
                                    id: node.id,
                                    externalIp: node.externalIp,
                                    externalPort: node.externalPort,
                                    internalIp: node.internalIp,
                                    internalPort: node.internalPort,
                                };
                            }),
                        };
                    }
                    res.write(Utils.safeStringify({
                        success: true,
                        result: resObj,
                    }));
                }
            }
            catch (e) {
                res.write(Utils.safeStringify({
                    success: false,
                    error: e,
                }));
            }
            res.end();
        });
        Context.network.registerExternalGet('hack-version', isDebugModeMiddleware, (_req, res) => {
            res.write(`1.0.1\n`);
            res.end();
        });
    }
    getAccountTreeInfo(accountID: string): TrieAccount {
        const radix = accountID.substring(0, this.treeMaxDepth);
        const treeNode = this.shardTrie.layerMaps[this.treeMaxDepth].get(radix);
        if (treeNode == null || treeNode.accountTempMap == null) {
            return null;
        }
        return treeNode.accountTempMap.get(accountID);
    }
    upateShardTrie(cycle: number): HashTrieUpdateStats {
        const currentLayer = this.treeMaxDepth;
        let treeNodeQueue: HashTrieNode[] = [];
        const updateStats = {
            leafsUpdated: 0,
            leafsCreated: 0,
            updatedNodesPerLevel: new Array(this.treeMaxDepth + 1).fill(0),
            hashedChildrenPerLevel: new Array(this.treeMaxDepth + 1).fill(0),
            totalHashes: 0,
            totalNodesHashed: 0,
            totalAccountsHashed: 0,
            totalLeafs: 0,
        };
        let currentMap = this.shardTrie.layerMaps[currentLayer];
        if (currentMap == null) {
            currentMap = new Map();
            this.shardTrie.layerMaps[currentLayer] = currentMap;
        }
        for (let i = 0; i < this.accountUpdateQueue.length; i++) {
            const tx = this.accountUpdateQueue[i];
            const key = tx.accountID.slice(0, currentLayer);
            let leafNode = currentMap.get(key);
            if (leafNode == null) {
                leafNode = {
                    radix: key,
                    children: [],
                    childHashes: [],
                    accounts: [],
                    hash: '',
                    accountTempMap: new Map(),
                    updated: true,
                    isIncomplete: false,
                    nonSparseChildCount: 0,
                };
                currentMap.set(key, leafNode);
                updateStats.leafsCreated++;
                treeNodeQueue.push(leafNode);
            }
            if (leafNode.accountTempMap == null) {
                leafNode.accountTempMap = new Map();
            }
            if (leafNode.accounts == null) {
                leafNode.accounts = [];
            }
            if (leafNode.accountTempMap.has(tx.accountID) === false) {
                this.totalAccounts++;
            }
            leafNode.accountTempMap.set(tx.accountID, tx);
            if (leafNode.updated === false) {
                treeNodeQueue.push(leafNode);
                updateStats.leafsUpdated++;
            }
            leafNode.updated = true;
        }
        let removedAccounts = 0;
        let removedAccountsFailed = 0;
        if (this.accountRemovalQueue.length > 0) {
        }
        for (let i = 0; i < this.accountRemovalQueue.length; i++) {
            const accountID = this.accountRemovalQueue[i];
            const key = accountID.slice(0, currentLayer);
            const treeNode = currentMap.get(key);
            if (treeNode == null) {
                continue;
            }
            if (treeNode.updated === false) {
                treeNodeQueue.push(treeNode);
            }
            treeNode.updated = true;
            if (treeNode.accountTempMap == null) {
                treeNode.accountTempMap = new Map();
            }
            if (treeNode.accounts == null) {
                treeNode.accounts = [];
            }
            const removed = treeNode.accountTempMap.delete(accountID);
            if (removed) {
                removedAccounts++;
            }
            else {
                removedAccountsFailed++;
            }
        }
        if (removedAccounts > 0) {
        }
        if (removedAccountsFailed > 0) {
        }
        this.accountRemovalQueue = [];
        for (let i = 0; i < treeNodeQueue.length; i++) {
            const treeNode = treeNodeQueue[i];
            if (treeNode.updated === true) {
                treeNode.accounts = Array.from(treeNode.accountTempMap.values());
                treeNode.accounts.sort(this.sortByAccountID);
                treeNode.hash = this.hashObj(treeNode.accounts.map((a) => a.hash));
                treeNode.updated = false;
                updateStats.totalHashes++;
                updateStats.totalAccountsHashed = updateStats.totalAccountsHashed + treeNode.accounts.length;
                updateStats.updatedNodesPerLevel[currentLayer] = updateStats.updatedNodesPerLevel[currentLayer] + 1;
            }
        }
        let parentTreeNodeQueue = [];
        for (let i = currentLayer - 1; i >= 0; i--) {
            currentMap = this.shardTrie.layerMaps[i];
            if (currentMap == null) {
                currentMap = new Map();
                this.shardTrie.layerMaps[i] = currentMap;
            }
            for (let j = 0; j < treeNodeQueue.length; j++) {
                const treeNode = treeNodeQueue[j];
                const parentKey = treeNode.radix.slice(0, i);
                let index = treeNode.radix.charCodeAt(i);
                index = index < 90 ? index - 48 : index - 87;
                let parentTreeNode = currentMap.get(parentKey);
                if (parentTreeNode == null) {
                    parentTreeNode = {
                        radix: parentKey,
                        children: new Array(16),
                        childHashes: new Array(16),
                        updated: false,
                        hash: '',
                        isIncomplete: false,
                        nonSparseChildCount: 0,
                    };
                    currentMap.set(parentKey, parentTreeNode);
                }
                if (parentTreeNode.children[index] == null) {
                    parentTreeNode.nonSparseChildCount++;
                }
                parentTreeNode.children[index] = treeNode;
                parentTreeNode.childHashes[index] = treeNode.hash;
                if (parentTreeNode.updated === false) {
                    parentTreeNodeQueue.push(parentTreeNode);
                    parentTreeNode.updated = true;
                }
                if (treeNode.isIncomplete) {
                    parentTreeNode.isIncomplete = true;
                }
                treeNode.updated = false;
            }
            updateStats.updatedNodesPerLevel[i] = parentTreeNodeQueue.length;
            for (let j = 0; j < parentTreeNodeQueue.length; j++) {
                const parentTreeNode = parentTreeNodeQueue[j];
                parentTreeNode.hash = this.hashObj(parentTreeNode.childHashes);
                updateStats.totalHashes++;
                updateStats.totalNodesHashed = updateStats.totalNodesHashed + parentTreeNode.nonSparseChildCount;
                updateStats.hashedChildrenPerLevel[i] =
                    updateStats.hashedChildrenPerLevel[i] + parentTreeNode.nonSparseChildCount;
            }
            treeNodeQueue = parentTreeNodeQueue;
            parentTreeNodeQueue = [];
        }
        updateStats.totalLeafs = this.shardTrie.layerMaps[this.treeMaxDepth].size;
        this.accountUpdateQueue = [];
        return updateStats;
    }
    getNonConsensusRanges(cycle: number): {
        low: string;
        high: string;
    }[] {
        let incompleteRanges = [];
        const shardValues = this.stateManager.shardValuesByCycle.get(cycle);
        const consensusStartPartition = shardValues.nodeShardData.consensusStartPartition;
        const consensusEndPartition = shardValues.nodeShardData.consensusEndPartition;
        incompleteRanges = this.getNonParitionRanges(shardValues, consensusStartPartition, consensusEndPartition, this.treeSyncDepth);
        return incompleteRanges;
    }
    getConsensusRanges(cycle: number): {
        low: string;
        high: string;
    }[] {
        let incompleteRanges = [];
        const shardValues = this.stateManager.shardValuesByCycle.get(cycle);
        const consensusStartPartition = shardValues.nodeShardData.consensusStartPartition;
        const consensusEndPartition = shardValues.nodeShardData.consensusEndPartition;
        incompleteRanges = this.getNonParitionRanges(shardValues, consensusStartPartition, consensusEndPartition, this.treeSyncDepth);
        return incompleteRanges;
    }
    getNonStoredRanges(cycle: number): {
        low: string;
        high: string;
    }[] {
        let incompleteRanges = [];
        const shardValues = this.stateManager.shardValuesByCycle.get(cycle);
        if (shardValues) {
            const consensusStartPartition = shardValues.nodeShardData.storedPartitions.partitionStart;
            const consensusEndPartition = shardValues.nodeShardData.storedPartitions.partitionEnd;
            incompleteRanges = this.getNonParitionRanges(shardValues, consensusStartPartition, consensusEndPartition, this.treeSyncDepth);
        }
        return incompleteRanges;
    }
    getSyncTrackerRanges(): {
        low: string;
        high: string;
    }[] {
        const incompleteRanges = [];
        for (const syncTracker of this.stateManager.accountSync.syncTrackers) {
            if (syncTracker.syncFinished === false && syncTracker.isGlobalSyncTracker === false) {
                incompleteRanges.push({
                    low: syncTracker.range.low.substring(0, this.treeSyncDepth),
                    high: syncTracker.range.high.substring(0, this.treeSyncDepth),
                });
            }
        }
        return incompleteRanges;
    }
    getNonParitionRanges(shardValues: CycleShardData, startPartition: number, endPartition: number, depth: number): {
        low: string;
        high: string;
    }[] {
        const incompleteRanges = [];
        const shardGlobals = shardValues.shardGlobals as StateManagerTypes.shardFunctionTypes.ShardGlobals;
        const numPartitions = shardGlobals.numPartitions;
        if (startPartition === 0 && endPartition === numPartitions - 1) {
            return incompleteRanges;
        }
        if (startPartition > endPartition) {
            const incompletePartition1 = endPartition + 1;
            const incompletePartition2 = startPartition - 1;
            const partition1 = shardValues.parititionShardDataMap.get(incompletePartition1);
            const partition2 = shardValues.parititionShardDataMap.get(incompletePartition2);
            const incompleteRange = {
                low: partition1.homeRange.low.substring(0, depth),
                high: partition2.homeRange.high.substring(0, depth),
            };
            incompleteRanges.push(incompleteRange);
            return incompleteRanges;
        }
        else if (endPartition > startPartition) {
            let incompletePartition1 = startPartition - 1;
            let incompletePartition2 = endPartition + 1;
            if (startPartition === 0) {
                incompletePartition1 = numPartitions - 1;
                const partition1 = shardValues.parititionShardDataMap.get(incompletePartition2);
                const partition2 = shardValues.parititionShardDataMap.get(incompletePartition1);
                const incompleteRange = {
                    low: partition1.homeRange.low.substring(0, depth),
                    high: partition2.homeRange.high.substring(0, depth),
                };
                incompleteRanges.push(incompleteRange);
                return incompleteRanges;
            }
            if (endPartition === numPartitions - 1) {
                incompletePartition2 = 0;
                const partition1 = shardValues.parititionShardDataMap.get(incompletePartition2);
                const partition2 = shardValues.parititionShardDataMap.get(incompletePartition1);
                const incompleteRange = {
                    low: partition1.homeRange.low.substring(0, depth),
                    high: partition2.homeRange.high.substring(0, depth),
                };
                incompleteRanges.push(incompleteRange);
                return incompleteRanges;
            }
            const partition1 = shardValues.parititionShardDataMap.get(0);
            const partition2 = shardValues.parititionShardDataMap.get(incompletePartition1);
            const incompleteRange = {
                low: partition1.homeRange.low.substring(0, depth),
                high: partition2.homeRange.high.substring(0, depth),
            };
            const partition1b = shardValues.parititionShardDataMap.get(incompletePartition2);
            const partition2b = shardValues.parititionShardDataMap.get(numPartitions - 1);
            const incompleteRangeB = {
                low: partition1b.homeRange.low.substring(0, depth),
                high: partition2b.homeRange.high.substring(0, depth),
            };
            incompleteRanges.push(incompleteRange);
            incompleteRanges.push(incompleteRangeB);
            return incompleteRanges;
        }
    }
    initStoredRadixValues(cycle: number): void {
        this.nonStoredRanges = this.getNonStoredRanges(cycle);
        this.radixIsStored.clear();
    }
    isRadixStored(_cycle: number, radix: string): boolean {
        if (this.radixIsStored.has(radix)) {
            return this.radixIsStored.get(radix);
        }
        let isNotStored = false;
        for (const range of this.nonStoredRanges) {
            if (radix >= range.low && radix <= range.high) {
                isNotStored = true;
                continue;
            }
        }
        const isStored = !isNotStored;
        this.radixIsStored.set(radix, isStored);
        return isStored;
    }
    diffConsenus(consensusArray: RadixAndHash[], localMap: Map<string, HashTrieNode>): {
        radix: string;
        hash: string;
    }[] {
        if (consensusArray == null) {
            this.statemanager_fatal('diffConsenus: consensusArray == null', 'diffConsenus: consensusArray == null');
            return [];
        }
        const toFix = [];
        for (const value of consensusArray) {
            if (localMap == null) {
                toFix.push(value);
                continue;
            }
            const valueB = localMap.get(value.radix);
            if (valueB == null) {
                toFix.push(value);
                continue;
            }
            if (valueB.hash !== value.hash) {
                toFix.push(value);
            }
        }
        return toFix;
    }
    findExtraBadKeys(consensusArray: RadixAndHashWithNodeId[], localLayerMap: Map<string, HashTrieNode>): RadixAndHashWithNodeId[] {
        const extraBadRadixes: RadixAndHashWithNodeId[] = [];
        if (consensusArray == null) {
            this.statemanager_fatal('findExtraBadKeys: consensusArray == null', 'findExtraBadKeys: consensusArray == null');
            return [];
        }
        const parentKeys: Set<{
            parentKey: string;
            nodeId: string;
        }> = new Set();
        const goodKeys: Set<string> = new Set();
        for (const value of consensusArray) {
            const parentKey = value.radix.slice(0, value.radix.length - 1);
            parentKeys.add({ parentKey, nodeId: value.nodeId });
            goodKeys.add(value.radix);
        }
        for (const item of parentKeys) {
            for (let i = 0; i < 16; i++) {
                const childKey = item.parentKey + i.toString(16);
                const weHaveKey = localLayerMap.has(childKey);
                if (weHaveKey) {
                    const theyHaveKey = goodKeys.has(childKey);
                    if (theyHaveKey === false) {
                        extraBadRadixes.push({ radix: localLayerMap.get(childKey).radix, hash: localLayerMap.get(childKey).hash, nodeId: item.nodeId });
                    }
                }
            }
        }
        let uniqueExtraBadRadixes = [];
        for (const item of extraBadRadixes) {
            if (uniqueExtraBadRadixes.find((x) => x.radix === item.radix) == null) {
                uniqueExtraBadRadixes.push(item);
            }
        }
        return uniqueExtraBadRadixes;
    }
    computeCoverage(cycle: number): void {
        const hashTrieSyncConsensus = this.hashTrieSyncConsensusByCycle.get(cycle);
        const coverageMap: Map<string, HashTrieRadixCoverage> = new Map();
        hashTrieSyncConsensus.coverageMap = coverageMap;
        for (const radixHash of hashTrieSyncConsensus.radixHashVotes.keys()) {
            const coverage = coverageMap.get(radixHash);
            if (coverage == null) {
                const votes = hashTrieSyncConsensus.radixHashVotes.get(radixHash);
                const bestVote = votes.allVotes.get(votes.bestHash);
                const potentialNodes = [...bestVote.voters];
                utils.shuffleArray(potentialNodes);
                const node = potentialNodes[0];
                coverageMap.set(radixHash, { firstChoice: node, fullList: potentialNodes, refuted: new Set() });
            }
        }
    }
    getNodeForQuery(radix: string, cycle: number, nextNode = false): Shardus.Node | null {
        const hashTrieSyncConsensus = this.hashTrieSyncConsensusByCycle.get(cycle);
        const parentRadix = radix.substring(0, this.treeSyncDepth);
        const coverageEntry = hashTrieSyncConsensus.coverageMap.get(parentRadix);
        if (coverageEntry == null || coverageEntry.firstChoice == null) {
            const numActiveNodes = this.stateManager.currentCycleShardData.nodes.length;
            this.statemanager_fatal(`getNodeForQuery null ${coverageEntry == null} ${coverageEntry?.firstChoice == null} numActiveNodes:${numActiveNodes}`, `getNodeForQuery null ${coverageEntry == null} ${coverageEntry?.firstChoice == null}`);
            return null;
        }
        if (nextNode === true) {
            coverageEntry.refuted.add(coverageEntry.firstChoice.id);
            for (let i = 0; i < coverageEntry.fullList.length; i++) {
                const node = coverageEntry.fullList[i];
                if (node == null || coverageEntry.refuted.has(node.id)) {
                    continue;
                }
                coverageEntry.firstChoice = node;
                return coverageEntry.firstChoice;
            }
        }
        else {
            return coverageEntry.firstChoice;
        }
        return null;
    }
    async getChildrenOf(radixHashEntries: RadixAndHash[], cycle: number): Promise<RadixAndHashWithNodeId[]> {
        let results: RadixAndHashWithNodeId[] = [];
        const requestMap: Map<Shardus.Node, HashTrieReq> = new Map();
        for (const radixHash of radixHashEntries) {
            const node = this.getNodeForQuery(radixHash.radix, cycle);
            if (node == null) {
                this.statemanager_fatal('getChildrenOf node null', 'getChildrenOf node null');
                continue;
            }
            let existingRequest = requestMap.get(node);
            if (existingRequest == null) {
                existingRequest = { radixList: [] };
                requestMap.set(node, existingRequest);
            }
            existingRequest.radixList.push(radixHash.radix);
        }
        const promises = [];
        for (const [node, value] of requestMap) {
            try {
                let promise;
                promise = this.p2p.askBinary<GetTrieHashesRequest, GetTrieHashesResponse>(node, InternalRouteEnum.binary_get_trie_hashes, value, serializeGetTrieHashesReq, deserializeGetTrieHashesResp, {});
                promises.push(promise);
            }
            catch (error) {
                this.statemanager_fatal('getChildrenOf failed', `getChildrenOf ASK-1 failed: node: ${node.id} error: ${errorToStringFull(error)}`);
            }
        }
        try {
            const trieHashesResponses: GetTrieHashesResponse[] = await Promise.all(promises);
            for (const response of trieHashesResponses) {
                if (response != null && response.nodeHashes != null) {
                    let data: RadixAndHashWithNodeId[] = response.nodeHashes.map(nodeHash => {
                        let item: RadixAndHash = {
                            radix: nodeHash.radix,
                            hash: nodeHash.hash
                        };
                        return {
                            radix: item.radix,
                            hash: item.hash,
                            nodeId: response.nodeId
                        };
                    });
                    results = results.concat(data);
                }
                else {
                }
            }
        }
        catch (error) {
            this.statemanager_fatal('getChildrenOf failed', `getChildrenOf ASK-2 failed: ` + errorToStringFull(error));
        }
        if (results.length > 0) {
        }
        else {
        }
        return results;
    }
    async getChildAccountHashes(radixHashEntries: RadixAndHash[], cycle: number): Promise<{
        radixAndChildHashes: RadixAndChildHashesWithNodeId[];
        getAccountHashStats: AccountHashStats;
    }> {
        let nodeChildHashes: RadixAndChildHashesWithNodeId[] = [];
        const requestMap: Map<Shardus.Node, HashTrieReq> = new Map();
        let actualRadixRequests = 0;
        const patcherMaxLeafHashesPerRequest = this.config.stateManager.patcherMaxLeafHashesPerRequest;
        for (const radixHash of radixHashEntries) {
            const node = this.getNodeForQuery(radixHash.radix, cycle);
            if (node == null) {
                this.statemanager_fatal('getChildAccountHashes node null', 'getChildAccountHashes node null ');
                continue;
            }
            let existingRequest = requestMap.get(node);
            if (existingRequest == null) {
                existingRequest = { radixList: [] };
                requestMap.set(node, existingRequest);
            }
            if (existingRequest.radixList.length > patcherMaxLeafHashesPerRequest) {
                continue;
            }
            else {
                actualRadixRequests++;
            }
            existingRequest.radixList.push(radixHash.radix);
        }
        const promises = [];
        for (const [key, value] of requestMap) {
            try {
                let promise;
                promise = this.p2p.askBinary<GetTrieAccountHashesReq, GetTrieAccountHashesResp>(key, InternalRouteEnum.binary_get_trie_account_hashes, value, serializeGetTrieAccountHashesReq, deserializeGetTrieAccountHashesResp, {});
                promises.push(promise);
            }
            catch (error) {
                this.statemanager_fatal('getChildAccountHashes failed', `getChildAccountHashes failed: ` + errorToStringFull(error));
            }
        }
        const getAccountHashStats: AccountHashStats = {
            matched: 0,
            visisted: 0,
            empty: 0,
            nullResults: 0,
            numRequests: requestMap.size,
            responses: 0,
            exceptions: 0,
            radixToReq: radixHashEntries.length,
            actualRadixRequests,
        };
        try {
            const results = await Promise.all(promises);
            for (const result of results) {
                if (result != null && result.nodeChildHashes != null) {
                    nodeChildHashes = nodeChildHashes.concat(result.nodeChildHashes);
                    utils.sumObject(getAccountHashStats, result.stats);
                    getAccountHashStats.responses++;
                }
                else {
                    getAccountHashStats.nullResults++;
                }
            }
        }
        catch (error) {
            this.statemanager_fatal('getChildAccountHashes failed', `getChildAccountHashes failed: ` + errorToStringFull(error));
            getAccountHashStats.exceptions++;
        }
        if (nodeChildHashes.length > 0) {
        }
        if (logFlags.debug) {
        }
        return { radixAndChildHashes: nodeChildHashes, getAccountHashStats: getAccountHashStats };
    }
    isInSync(cycle: number): IsInsyncResult {
        const hashTrieSyncConsensus = this.hashTrieSyncConsensusByCycle.get(cycle);
        let isInsyncResult: IsInsyncResult = {
            radixes: [],
            insync: true,
            stats: {
                good: 0,
                bad: 0,
                total: 0
            }
        };
        if (hashTrieSyncConsensus == null) {
            return isInsyncResult;
        }
        const minVotes = this.calculateMinVotes();
        for (const radix of hashTrieSyncConsensus.radixHashVotes.keys()) {
            if (radix.length !== this.treeSyncDepth) {
                if (logFlags.error)
                    this.mainLogger.error(`syncTrieHashesBinaryHandler: radix length mismatch: ${radix}`);
                continue;
            }
            const votesMap = hashTrieSyncConsensus.radixHashVotes.get(radix);
            const ourTrieNode = this.shardTrie.layerMaps[this.treeSyncDepth].get(radix);
            const nonConsensusRanges = this.getNonConsensusRanges(cycle);
            const nonStorageRanges = this.getNonStoredRanges(cycle);
            let hasNonConsensusRange = false;
            let hasNonStorageRange = false;
            let lastCycleNonConsensus = false;
            for (const range of this.lastCycleNonConsensusRanges) {
                if (radix >= range.low && radix <= range.high) {
                    lastCycleNonConsensus = true;
                }
            }
            for (const range of nonConsensusRanges) {
                if (radix >= range.low && radix <= range.high) {
                    hasNonConsensusRange = true;
                }
            }
            for (const range of nonStorageRanges) {
                if (radix >= range.low && radix <= range.high) {
                    hasNonStorageRange = true;
                }
            }
            let inConsensusRange = !hasNonConsensusRange;
            let inStorageRange = !hasNonStorageRange;
            let inEdgeRange = inStorageRange && !inConsensusRange;
            if (hasNonConsensusRange && hasNonStorageRange)
                continue;
            if (ourTrieNode == null) {
                isInsyncResult.radixes.push({
                    radix,
                    insync: false,
                    inConsensusRange,
                    inEdgeRange,
                    recentRuntimeSync: false,
                    recentRuntimeSyncCycle: -1,
                });
                isInsyncResult.insync = false;
                isInsyncResult.stats.bad++;
                isInsyncResult.stats.total++;
                continue;
            }
            if (votesMap.bestVotes < minVotes) {
            }
            ourTrieNode.hash = this.crypto.hash(ourTrieNode.childHashes);
            if (ourTrieNode.hash != votesMap.bestHash) {
                if (logFlags.debug) {
                    const kvp = [];
                    for (const [key, value] of votesMap.allVotes.entries()) {
                        kvp.push({
                            id: key,
                            count: value.count,
                            nodeIDs: [...value.voters].map((node) => utils.makeShortHash(node.id) + ':' + node.externalPort),
                        });
                    }
                    const simpleMap = {
                        bestHash: votesMap.bestHash,
                        bestVotes: votesMap.bestVotes,
                        allVotes: kvp,
                    };
                    this.statemanager_fatal('isInSync', `isInSync fail ${cycle}: ${radix}  uniqueVotes: ${votesMap.allVotes.size} ${utils.stringifyReduce(simpleMap)}`);
                }
                isInsyncResult.insync = false;
                isInsyncResult.radixes.push({
                    radix,
                    insync: false,
                    inConsensusRange,
                    inEdgeRange,
                    recentRuntimeSync: false,
                    recentRuntimeSyncCycle: -1,
                });
                isInsyncResult.stats.bad++;
                isInsyncResult.stats.total++;
            }
            else if (ourTrieNode.hash === votesMap.bestHash) {
                isInsyncResult.radixes.push({
                    radix,
                    insync: true,
                    inConsensusRange,
                    inEdgeRange,
                    recentRuntimeSync: false,
                    recentRuntimeSyncCycle: -1,
                });
                isInsyncResult.stats.good++;
                isInsyncResult.stats.total++;
            }
        }
        isInsyncResult.radixes.sort((a, b) => {
            return a.radix.localeCompare(b.radix);
        });
        for (const coverageChange of this.stateManager.coverageChangesCopy) {
            const startRadix = coverageChange.start.toString().substring(0, this.treeSyncDepth);
            const endRadix = coverageChange.end.toString().substring(0, this.treeSyncDepth);
            if (startRadix <= endRadix) {
                for (let i = 0; i <= isInsyncResult.radixes.length; i++) {
                    const radixEntry = isInsyncResult.radixes[i];
                    if (radixEntry.radix >= startRadix && radixEntry.radix <= endRadix) {
                        radixEntry.recentRuntimeSync = true;
                        radixEntry.recentRuntimeSyncCycle = cycle;
                    }
                }
            }
            else {
                for (let i = 0; i <= isInsyncResult.radixes.length; i++) {
                    const radixEntry = isInsyncResult.radixes[i];
                    if (radixEntry.radix >= startRadix || radixEntry.radix <= endRadix) {
                        radixEntry.recentRuntimeSync = true;
                        radixEntry.recentRuntimeSyncCycle = cycle;
                    }
                }
            }
        }
        return isInsyncResult;
    }
    async findBadAccounts(cycle: number): Promise<BadAccountsInfo> {
        let badAccounts: AccountIDAndHash[] = [];
        let accountsTheyNeedToRepair: AccountIdAndHashToRepair[] = [];
        let accountsWeNeedToRepair: AccountIDAndHash[] = [];
        const hashesPerLevel: number[] = Array(this.treeMaxDepth + 1).fill(0);
        const checkedKeysPerLevel = Array(this.treeMaxDepth);
        const badHashesPerLevel: number[] = Array(this.treeMaxDepth + 1).fill(0);
        const requestedKeysPerLevel: number[] = Array(this.treeMaxDepth + 1).fill(0);
        let level = this.treeSyncDepth;
        let badLayerMap = this.shardTrie.layerMaps[level];
        const syncTrackerRanges = this.getSyncTrackerRanges();
        const stats = {
            testedSyncRadix: 0,
            skippedSyncRadix: 0,
            badSyncRadix: 0,
            ok_noTrieAcc: 0,
            ok_trieHashBad: 0,
            fix_butHashMatch: 0,
            fixLastSeen: 0,
            needsVotes: 0,
            subHashesTested: 0,
            trailColdLevel: 0,
            checkedLevel: 0,
            leafsChecked: 0,
            leafResponses: 0,
            getAccountHashStats: {},
        };
        let extraBadKeys: RadixAndHashWithNodeId[] = [];
        let extraBadAccounts: AccountIdAndHashToRepair[] = [];
        const minVotes = this.calculateMinVotes();
        const goodVotes: RadixAndHash[] = [];
        const hashTrieSyncConsensus = this.hashTrieSyncConsensusByCycle.get(cycle);
        for (const radix of hashTrieSyncConsensus.radixHashVotes.keys()) {
            const votesMap = hashTrieSyncConsensus.radixHashVotes.get(radix);
            let isSyncingRadix = false;
            if (votesMap.bestVotes < minVotes) {
                stats.needsVotes++;
                if (logFlags.debug) {
                    const kvp = [];
                    for (const [key, value] of votesMap.allVotes.entries()) {
                        kvp.push({
                            id: key,
                            count: value.count,
                            nodeIDs: [...value.voters].map((node) => utils.makeShortHash(node.id) + ':' + node.externalPort),
                        });
                    }
                    const simpleMap = {
                        bestHash: votesMap.bestHash,
                        bestVotes: votesMap.bestVotes,
                        allVotes: kvp,
                    };
                    this.statemanager_fatal('debug findBadAccounts', `debug findBadAccounts ${cycle}: ${radix} bestVotes${votesMap.bestVotes} < minVotes:${minVotes} uniqueVotes: ${votesMap.allVotes.size} ${utils.stringifyReduce(simpleMap)}`);
                }
            }
            for (const range of syncTrackerRanges) {
                if (radix >= range.low && radix <= range.high) {
                    isSyncingRadix = true;
                    break;
                }
            }
            if (isSyncingRadix === true) {
                stats.skippedSyncRadix++;
                continue;
            }
            stats.testedSyncRadix++;
            goodVotes.push({ radix, hash: votesMap.bestHash });
        }
        let toFix = this.diffConsenus(goodVotes, badLayerMap);
        stats.badSyncRadix = toFix.length;
        if (logFlags.debug) {
            toFix.sort(this.sortByRadix);
            this.statemanager_fatal('debug findBadAccounts', `debug findBadAccounts ${cycle}: toFix: ${utils.stringifyReduce(toFix)}`);
            for (let radixToFix of toFix) {
                const votesMap = hashTrieSyncConsensus.radixHashVotes.get(radixToFix.radix);
                let hasNonConsensusRange = false;
                let hasNonStorageRange = false;
                const nonConsensusRanges = this.getNonConsensusRanges(cycle);
                const nonStorageRange = this.getNonStoredRanges(cycle);
                for (const range of nonConsensusRanges) {
                    if (radixToFix.radix >= range.low && radixToFix.radix <= range.high) {
                        hasNonConsensusRange = true;
                    }
                }
                for (const range of nonStorageRange) {
                    if (radixToFix.radix >= range.low && radixToFix.radix <= range.high) {
                        hasNonStorageRange = true;
                    }
                }
                const kvp = [];
                for (const [key, value] of votesMap.allVotes.entries()) {
                    kvp.push({
                        id: key,
                        count: value.count,
                        nodeIDs: [...value.voters].map((node) => utils.makeShortHash(node.id) + ':' + node.externalPort),
                    });
                }
                const simpleMap = {
                    bestHash: votesMap.bestHash,
                    bestVotes: votesMap.bestVotes,
                    allVotes: kvp,
                };
                this.statemanager_fatal('debug findBadAccounts', `debug findBadAccounts ${cycle}: ${radixToFix.radix} isInNonConsensusRange: ${hasNonConsensusRange} isInNonStorageRange: ${hasNonStorageRange} bestVotes ${votesMap.bestVotes} minVotes:${minVotes} uniqueVotes: ${votesMap.allVotes.size} ${utils.stringifyReduce(simpleMap)}`);
            }
        }
        badHashesPerLevel[level] = toFix.length;
        checkedKeysPerLevel[level] = toFix.map((x) => x.radix);
        requestedKeysPerLevel[level] = goodVotes.length;
        hashesPerLevel[level] = goodVotes.length;
        this.computeCoverage(cycle);
        stats.checkedLevel = level;
        while (level < this.treeMaxDepth && toFix.length > 0) {
            level++;
            stats.checkedLevel = level;
            badLayerMap = this.shardTrie.layerMaps[level];
            const remoteChildrenToDiff: RadixAndHashWithNodeId[] = await this.getChildrenOf(toFix, cycle);
            if (remoteChildrenToDiff == null) {
            }
            if (remoteChildrenToDiff.length === 0) {
            }
            toFix = this.diffConsenus(remoteChildrenToDiff, badLayerMap);
            stats.subHashesTested += toFix.length;
            if (toFix.length === 0) {
                stats.trailColdLevel = level;
                extraBadKeys = this.findExtraBadKeys(remoteChildrenToDiff, badLayerMap);
                let result = {
                    nodeChildHashes: [],
                    stats: {
                        matched: 0,
                        visisted: 0,
                        empty: 0,
                        childCount: 0,
                    },
                } as HashTrieAccountsResp;
                let allLeafNodes: HashTrieNode[] = [];
                for (const radixAndHash of extraBadKeys) {
                    let level = radixAndHash.radix.length;
                    while (level < this.treeMaxDepth) {
                        level++;
                        const layerMap = this.shardTrie.layerMaps[level];
                        if (layerMap == null) {
                            break;
                        }
                        const hashTrieNode = layerMap.get(radixAndHash.radix);
                        if (hashTrieNode != null && hashTrieNode.accounts != null) {
                            result.stats.visisted++;
                            const childAccounts = [];
                            result.nodeChildHashes.push({ radix: radixAndHash.radix, childAccounts });
                            for (const account of hashTrieNode.accounts) {
                                childAccounts.push({ accountID: account.accountID, hash: account.hash });
                                extraBadAccounts.push({ accountID: account.accountID, hash: account.hash, targetNodeId: radixAndHash.nodeId });
                                result.stats.childCount++;
                            }
                            if (hashTrieNode.accounts.length === 0) {
                                result.stats.empty++;
                            }
                        }
                    }
                }
                for (const radixAndHash of extraBadKeys) {
                    const radix = radixAndHash.radix;
                    result.stats.visisted++;
                    const level = radix.length;
                    const layerMap = this.shardTrie.layerMaps[level];
                    if (layerMap == null) {
                        break;
                    }
                    const currentNode = layerMap.get(radix);
                    const leafs: HashTrieNode[] = this.extractLeafNodes(currentNode);
                    for (const leaf of leafs) {
                        if (leaf != null && leaf.accounts != null) {
                            result.stats.matched++;
                            const childAccounts = [];
                            result.nodeChildHashes.push({ radix, childAccounts });
                            for (const account of leaf.accounts) {
                                childAccounts.push({ accountID: account.accountID, hash: account.hash });
                                extraBadAccounts.push({ accountID: account.accountID, hash: account.hash, targetNodeId: radixAndHash.nodeId });
                                result.stats.childCount++;
                            }
                            if (leaf.accounts.length === 0) {
                                result.stats.empty++;
                            }
                        }
                    }
                }
                if (extraBadKeys.length > 0) {
                    toFix = toFix.concat(extraBadKeys);
                    break;
                }
            }
            badHashesPerLevel[level] = toFix.length;
            checkedKeysPerLevel[level] = toFix.map((x) => x.radix);
            requestedKeysPerLevel[level] = remoteChildrenToDiff.length;
            hashesPerLevel[level] = remoteChildrenToDiff.length;
        }
        stats.leafsChecked = toFix.length;
        const { radixAndChildHashes, getAccountHashStats } = await this.getChildAccountHashes(toFix, cycle);
        stats.getAccountHashStats = getAccountHashStats;
        stats.leafResponses = radixAndChildHashes.length;
        let accountHashesChecked = 0;
        for (const radixAndChildHash of radixAndChildHashes) {
            accountHashesChecked += radixAndChildHash.childAccounts.length;
            const badTreeNode = badLayerMap.get(radixAndChildHash.radix);
            if (badTreeNode != null) {
                const localAccountsMap = new Map();
                const remoteAccountsMap = new Map();
                if (badTreeNode.accounts != null) {
                    for (let i = 0; i < badTreeNode.accounts.length; i++) {
                        if (badTreeNode.accounts[i] == null)
                            continue;
                        localAccountsMap.set(badTreeNode.accounts[i].accountID, badTreeNode.accounts[i]);
                    }
                }
                for (let account of radixAndChildHash.childAccounts) {
                    remoteAccountsMap.set(account.accountID, { account, nodeId: radixAndChildHash.nodeId });
                }
                if (radixAndChildHash.childAccounts.length > localAccountsMap.size) {
                }
                else if (radixAndChildHash.childAccounts.length < localAccountsMap.size) {
                }
                else if (radixAndChildHash.childAccounts.length === localAccountsMap.size) {
                }
                for (let i = 0; i < radixAndChildHash.childAccounts.length; i++) {
                    const potentalGoodAcc = radixAndChildHash.childAccounts[i];
                    const potentalBadAcc = localAccountsMap.get(potentalGoodAcc.accountID);
                    const accountMemData: AccountHashCache = this.stateManager.accountCache.getAccountHash(potentalGoodAcc.accountID);
                    if (accountMemData != null && accountMemData.h === potentalGoodAcc.hash) {
                        if (accountMemData.c >= cycle - 1) {
                            if (potentalBadAcc != null) {
                                if (potentalBadAcc.hash != potentalGoodAcc.hash) {
                                    stats.ok_trieHashBad++;
                                }
                            }
                            else {
                                stats.ok_noTrieAcc++;
                            }
                            const accountHashCacheHistory: AccountHashCacheHistory = this.stateManager.accountCache.getAccountHashHistoryItem(potentalGoodAcc.accountID);
                            if (accountHashCacheHistory != null &&
                                accountHashCacheHistory.lastStaleCycle >= accountHashCacheHistory.lastSeenCycle) {
                                stats.fixLastSeen++;
                                accountHashCacheHistory.lastSeenCycle = cycle;
                            }
                            continue;
                        }
                        else {
                            stats.fix_butHashMatch++;
                            this.updateAccountHash(potentalGoodAcc.accountID, potentalGoodAcc.hash);
                            continue;
                        }
                    }
                    if (potentalBadAcc != null) {
                        if (potentalBadAcc.hash != potentalGoodAcc.hash) {
                            badAccounts.push(potentalGoodAcc);
                        }
                    }
                    else {
                        badAccounts.push(potentalGoodAcc);
                    }
                }
                for (let i = 0; i < badTreeNode.accounts.length; i++) {
                    const localAccount = badTreeNode.accounts[i];
                    if (localAccount == null)
                        continue;
                    const remoteNodeItem = remoteAccountsMap.get(localAccount.accountID);
                    if (remoteNodeItem == null) {
                        accountsWeNeedToRepair.push(localAccount);
                        continue;
                    }
                    const { account: remoteAccount, nodeId: targetNodeId } = remoteNodeItem;
                    if (remoteAccount == null) {
                        accountsTheyNeedToRepair.push({ ...localAccount, targetNodeId });
                    }
                }
            }
            else {
                badAccounts = badAccounts.concat(radixAndChildHash.childAccounts);
            }
        }
        if (accountsTheyNeedToRepair.length > 0) {
        }
        return {
            badAccounts,
            hashesPerLevel,
            checkedKeysPerLevel,
            requestedKeysPerLevel,
            badHashesPerLevel,
            accountHashesChecked,
            stats,
            extraBadAccounts,
            extraBadKeys,
            accountsTheyNeedToRepair
        };
    }
    extractLeafNodes(rootNode: HashTrieNode): HashTrieNode[] {
        const leafNodes: HashTrieNode[] = [];
        function traverse(node: HashTrieNode) {
            if (node == null) {
                return;
            }
            if (node.children && node.children.length === 0) {
                leafNodes.push(node);
                return;
            }
            if (node.children && node.children.length > 0) {
                for (const childNode of node.children) {
                    if (childNode) {
                        traverse(childNode);
                    }
                }
            }
        }
        traverse(rootNode);
        return leafNodes;
    }
    updateAccountHash(accountID: string, hash: string): void {
        if (this.debug_ignoreUpdates) {
            this.statemanager_fatal(`patcher ignored: tx`, `patcher ignored: ${accountID} hash:${hash}`);
            return;
        }
        const accountData = { accountID, hash };
        this.accountUpdateQueue.push(accountData);
    }
    removeAccountHash(accountID: string): void {
        this.accountRemovalQueue.push(accountID);
    }
    async broadcastSyncHashes(cycle: number): Promise<void> {
        const syncLayer = this.shardTrie.layerMaps[this.treeSyncDepth];
        const shardGlobals = this.stateManager.currentCycleShardData.shardGlobals;
        const messageToNodeMap: Map<string, {
            node: Shardus.Node;
            message: HashTrieSyncTell;
        }> = new Map();
        const radixUsed: Map<string, Set<string>> = new Map();
        const nonConsensusRanges = this.getNonConsensusRanges(cycle);
        const nonStoredRanges = this.getNonStoredRanges(cycle);
        const syncTrackerRanges = this.getSyncTrackerRanges();
        let hasNonConsensusRange = false;
        let lastCycleNonConsensus = false;
        let hasNonStorageRange = false;
        let inSyncTrackerRange = false;
        const debugSyncSkipSet = new Set<string>();
        const debugRadixSet = new Set<string>();
        const stats = {
            broadcastSkip: 0,
        };
        for (const treeNode of syncLayer.values()) {
            hasNonConsensusRange = false;
            lastCycleNonConsensus = false;
            hasNonStorageRange = false;
            inSyncTrackerRange = false;
            for (const range of this.lastCycleNonConsensusRanges) {
                if (treeNode.radix >= range.low && treeNode.radix <= range.high) {
                    lastCycleNonConsensus = true;
                }
            }
            for (const range of nonStoredRanges) {
                if (treeNode.radix >= range.low && treeNode.radix <= range.high) {
                    hasNonStorageRange = true;
                }
            }
            for (const range of nonConsensusRanges) {
                if (treeNode.radix >= range.low && treeNode.radix <= range.high) {
                    hasNonConsensusRange = true;
                }
            }
            for (const range of syncTrackerRanges) {
                if (treeNode.radix >= range.low && treeNode.radix <= range.high) {
                    inSyncTrackerRange = true;
                }
            }
            if (inSyncTrackerRange) {
                stats.broadcastSkip++;
                if (logFlags.verbose && logFlags.playback) {
                    debugSyncSkipSet.add(treeNode.radix);
                }
                continue;
            }
            if (hasNonConsensusRange) {
                if (lastCycleNonConsensus === false && hasNonStorageRange === false) {
                }
                else {
                    continue;
                }
            }
            debugRadixSet.add(`${treeNode.radix}:${utils.stringifyReduce(treeNode.hash)}`);
            const partitionRange = ShardFunctions.getPartitionRangeFromRadix(shardGlobals, treeNode.radix);
            for (let i = partitionRange.low; i <= partitionRange.high; i++) {
                const shardInfo = this.stateManager.currentCycleShardData.parititionShardDataMap.get(i);
                let sendToMap = shardInfo.coveredBy;
                if (this.sendHashesToEdgeNodes) {
                    sendToMap = shardInfo.storedBy;
                }
                for (const value of Object.values(sendToMap)) {
                    let messagePair = messageToNodeMap.get(value.id);
                    if (messagePair == null) {
                        messagePair = { node: value, message: { cycle, nodeHashes: [] } };
                        messageToNodeMap.set(value.id, messagePair);
                    }
                    let radixSeenSet = radixUsed.get(value.id);
                    if (radixSeenSet == null) {
                        radixSeenSet = new Set();
                        radixUsed.set(value.id, radixSeenSet);
                    }
                    if (radixSeenSet.has(treeNode.radix) === false) {
                        treeNode.hash = this.hashObj(treeNode.childHashes);
                        messagePair.message.nodeHashes.push({ radix: treeNode.radix, hash: treeNode.hash });
                        radixSeenSet.add(treeNode.radix);
                    }
                }
            }
        }
        if (stats.broadcastSkip > 0) {
        }
        const promises = [];
        for (const messageEntry of messageToNodeMap.values()) {
            const syncTrieHashesRequest: SyncTrieHashesRequest = {
                cycle,
                nodeHashes: messageEntry.message.nodeHashes,
            };
            const promise = this.p2p.tellBinary<SyncTrieHashesRequest>([messageEntry.node], InternalRouteEnum.binary_sync_trie_hashes, syncTrieHashesRequest, serializeSyncTrieHashesReq, {});
            promises.push(promise);
        }
        await Promise.all(promises);
    }
    async updateTrieAndBroadCast(cycle: number): Promise<void> {
        const shardValues = this.stateManager.shardValuesByCycle.get(cycle);
        const shardGlobals = shardValues.shardGlobals as StateManagerTypes.shardFunctionTypes.ShardGlobals;
        const minHashesPerRange = 4;
        let syncDepthRaw = Math.log(minHashesPerRange * Math.max(1, shardGlobals.numPartitions / (shardGlobals.consensusRadius * 2 + 1))) / Math.log(16);
        syncDepthRaw = Math.max(1, syncDepthRaw);
        const newSyncDepth = Math.ceil(syncDepthRaw);
        if (this.treeSyncDepth != newSyncDepth) {
            const resizeStats = {
                nodesWithAccounts: 0,
                nodesWithoutAccounts: 0,
            };
            const newMaxDepth = newSyncDepth + 3;
            while (this.shardTrie.layerMaps.length < newMaxDepth + 1) {
                this.shardTrie.layerMaps.push(new Map());
            }
            const currentLeafMap = this.shardTrie.layerMaps[this.treeMaxDepth];
            for (const treeNode of currentLeafMap.values()) {
                if (treeNode.accounts != null) {
                    for (const account of treeNode.accounts) {
                        this.accountUpdateQueue.unshift(account);
                    }
                    resizeStats.nodesWithAccounts++;
                }
                else {
                    resizeStats.nodesWithoutAccounts++;
                }
            }
            for (let idx = 0; idx < newMaxDepth; idx++) {
                this.shardTrie.layerMaps[idx].clear();
            }
            if (newMaxDepth < this.treeMaxDepth) {
            }
            else {
            }
            this.treeSyncDepth = newSyncDepth;
            this.treeMaxDepth = newMaxDepth;
        }
        const updateStats = this.upateShardTrie(cycle);
        await this.broadcastSyncHashes(cycle);
    }
    async requestOtherNodesToRepair(accountsToFix: AccountIdAndHashToRepair[]): Promise<void> {
        try {
            const accountIdsToFix = accountsToFix.map((x) => x.accountID);
            const accountDataList = await this.app.getAccountDataByList(accountIdsToFix);
            const accountDataMap = new Map<string, Shardus.WrappedData>();
            const repairInstructionMap = new Map<string, AccountRepairInstruction[]>();
            for (const accountData of accountDataList) {
                accountDataMap.set(accountData.accountId, accountData);
            }
            for (const accountToFix of accountsToFix) {
                let accountData = accountDataMap.get(accountToFix.accountID);
                if (accountData == null) {
                    continue;
                }
                if (accountData.stateId !== accountToFix.hash) {
                    continue;
                }
                const archivedQueueEntry = this.stateManager.transactionQueue.getArchivedQueueEntryByAccountIdAndHash(accountToFix.accountID, accountToFix.hash, 'requestOtherNodesToRepair');
                if (archivedQueueEntry == null) {
                    continue;
                }
                const repairInstruction: AccountRepairInstruction = {
                    accountID: accountData.accountId,
                    hash: accountData.stateId,
                    txId: archivedQueueEntry.acceptedTx.txId,
                    accountData,
                    targetNodeId: accountToFix.targetNodeId,
                    signedReceipt: archivedQueueEntry.signedReceipt
                };
                if (repairInstructionMap.has(repairInstruction.targetNodeId)) {
                    repairInstructionMap.get(repairInstruction.targetNodeId).push(repairInstruction);
                }
                else {
                    repairInstructionMap.set(repairInstruction.targetNodeId, [repairInstruction]);
                }
            }
            if (repairInstructionMap.size > 0) {
                for (const [nodeId, repairInstructions] of repairInstructionMap) {
                    const node = NodeList.nodes.get(nodeId);
                    if (node == null) {
                    }
                    const message = {
                        repairInstructions
                    };
                    await this.p2p.tellBinary<RepairOOSAccountsReq>([node], InternalRouteEnum.binary_repair_oos_accounts, message, serializeRepairOOSAccountsReq, {});
                }
            }
        }
        catch (e) {
            this.statemanager_fatal(`requestOtherNodesToRepair`, `error: ${e}`);
        }
    }
    async testAndPatchAccounts(cycle: number): Promise<void> {
        const lastFail = this.failedLastTrieSync;
        const lastInsyncResult = this.lastInSyncResult;
        this.failedLastTrieSync = false;
        const trieRepairDump = {
            cycle,
            stats: null,
            z_accountSummary: null,
        };
        if (logFlags.debug) {
            const hashTrieSyncConsensus = this.hashTrieSyncConsensusByCycle.get(cycle);
            const debug = [];
            if (hashTrieSyncConsensus && hashTrieSyncConsensus.radixHashVotes) {
                for (const [key, value] of hashTrieSyncConsensus.radixHashVotes) {
                    debug.push({ radix: key, hash: value.bestHash, votes: value.bestVotes });
                }
            }
            debug.sort(this.sortByRadix);
            this.statemanager_fatal('debug shardTrie', `temp shardTrie votes c:${cycle}: ${utils.stringifyReduce(debug)}`);
        }
        let isInsyncResult = this.isInSync(cycle);
        this.lastInSyncResult = isInsyncResult;
        if (isInsyncResult == null || isInsyncResult.insync === false) {
            let failHistoryObject: {
                repaired: number;
                s: number;
                e: number;
                cycles: number;
            };
            if (lastFail === false) {
                this.failStartCycle = cycle;
                this.failEndCycle = -1;
                this.failRepairsCounter = 0;
                failHistoryObject = {
                    s: this.failStartCycle,
                    e: this.failEndCycle,
                    cycles: 1,
                    repaired: this.failRepairsCounter,
                };
                this.syncFailHistory.push(failHistoryObject);
            }
            else {
                failHistoryObject = this.syncFailHistory[this.syncFailHistory.length - 1];
            }
            const results = await this.findBadAccounts(cycle);
            if (logFlags.debug) {
            }
            if (results.accountsTheyNeedToRepair.length > 0 || results.extraBadAccounts.length > 0) {
                let accountsTheyNeedToRepair = [...results.accountsTheyNeedToRepair];
                if (results.extraBadAccounts.length > 0) {
                    accountsTheyNeedToRepair = accountsTheyNeedToRepair.concat(results.extraBadAccounts);
                }
                this.requestOtherNodesToRepair(accountsTheyNeedToRepair);
            }
            if (this.config.mode === 'debug' && this.config.debug.haltOnDataOOS) {
                this.statemanager_fatal('testAndPatchAccounts', 'Data OOS detected. We are halting the repair process on purpose');
                this.failedLastTrieSync = true;
                return;
            }
            this.stateManager.cycleDebugNotes.badAccounts = results.badAccounts.length;
            if (results.extraBadKeys.length > 0) {
                this.statemanager_fatal('checkAndSetAccountData extra bad keys', `c:${cycle} extra bad keys: ${Utils.safeStringify(results.extraBadKeys)}  `);
            }
            const { repairDataResponse, stateTableDataMap, getAccountStats } = await this.getAccountRepairData(cycle, results.badAccounts);
            if (repairDataResponse == null) {
                this.statemanager_fatal('checkAndSetAccountData repairDataResponse', `c:${cycle} repairDataResponse is null`);
            }
            const wrappedDataListFiltered: Shardus.WrappedData[] = [];
            const noChange = new Set();
            const updateTooOld = new Set();
            const filterStats = {
                accepted: 0,
                tooOld: 0,
                sameTS: 0,
                sameTSFix: 0,
                tsFix2: 0,
                tsFix3: 0,
            };
            let tooOldAccountsMap: Map<string, TooOldAccountRecord> = new Map();
            let wrappedDataList = repairDataResponse.wrappedDataList;
            for (let i = 0; i < wrappedDataList.length; i++) {
                let wrappedData: Shardus.WrappedData = wrappedDataList[i];
                let nodeWeAsked = repairDataResponse.nodes[i];
                if (this.stateManager.accountCache.hasAccount(wrappedData.accountId)) {
                    const accountMemData: AccountHashCache = this.stateManager.accountCache.getAccountHash(wrappedData.accountId);
                    if (wrappedData.timestamp < accountMemData.t) {
                        updateTooOld.add(wrappedData.accountId);
                        this.statemanager_fatal('checkAndSetAccountData updateTooOld', `checkAndSetAccountData updateTooOld ${cycle}: acc:${utils.stringifyReduce(wrappedData.accountId)} updateTS:${wrappedData.timestamp} updateHash:${utils.stringifyReduce(wrappedData.stateId)}  cacheTS:${accountMemData.t} cacheHash:${utils.stringifyReduce(accountMemData.h)}`);
                        filterStats.tooOld++;
                        tooOldAccountsMap.set(wrappedData.accountId, {
                            wrappedData,
                            accountMemData,
                            node: nodeWeAsked
                        });
                        continue;
                    }
                    if (wrappedData.timestamp === accountMemData.t) {
                        let allowPatch = false;
                        const accountHashCacheHistory: AccountHashCacheHistory = this.stateManager.accountCache.getAccountHashHistoryItem(wrappedData.accountId);
                        if (accountHashCacheHistory != null &&
                            accountHashCacheHistory.lastStaleCycle >= accountHashCacheHistory.lastSeenCycle) {
                            filterStats.sameTSFix++;
                            accountHashCacheHistory.lastSeenCycle = cycle;
                        }
                        else if (accountHashCacheHistory != null &&
                            accountHashCacheHistory.accountHashList.length > 0 &&
                            wrappedData.stateId != accountHashCacheHistory.accountHashList[0].h) {
                            this.statemanager_fatal('accountPatcher_tsFix2', `tsFix2 c:${cycle} wrappedData:${utils.stringifyReduce(wrappedData)} accountHashCacheHistory:${utils.stringifyReduce(accountHashCacheHistory)}`);
                            filterStats.tsFix2++;
                            accountHashCacheHistory.lastSeenCycle = cycle;
                            allowPatch = true;
                            accountMemData.h = wrappedData.stateId;
                        }
                        else {
                            this.statemanager_fatal('accountPatcher_tsFix3', `tsFix3 c:${cycle} wrappedData:${utils.stringifyReduce(wrappedData)} accountHashCacheHistory:${utils.stringifyReduce(accountHashCacheHistory)}`);
                            filterStats.tsFix3++;
                            accountHashCacheHistory.lastSeenCycle = cycle;
                        }
                        if (allowPatch === false) {
                            noChange.add(wrappedData.accountId);
                            continue;
                        }
                        filterStats.sameTS++;
                    }
                    filterStats.accepted++;
                    wrappedDataListFiltered.push(wrappedData);
                }
                else {
                    filterStats.accepted++;
                    wrappedDataListFiltered.push(wrappedData);
                }
            }
            if (tooOldAccountsMap.size > 0) {
                for (let [accountId, tooOldRecord] of tooOldAccountsMap) {
                    const archivedQueueEntry = this.stateManager.transactionQueue.getArchivedQueueEntryByAccountIdAndHash(accountId, tooOldRecord.accountMemData.h, 'too_old_account repair');
                    if (archivedQueueEntry == null) {
                        continue;
                    }
                    const accountDataList = await this.app.getAccountDataByList([accountId]);
                    const skippedAccounts: AccountIDAndHash[] = [];
                    const accountDataFinal: Shardus.WrappedData[] = [];
                    if (accountDataList != null) {
                        for (const wrappedAccount of accountDataList) {
                            if (wrappedAccount == null || wrappedAccount.stateId == null || wrappedAccount.data == null) {
                                continue;
                            }
                            const { accountId, stateId, data: recordData } = wrappedAccount;
                            const accountHash = this.app.calculateAccountHash(recordData);
                            if (tooOldRecord.accountMemData.h !== accountHash) {
                                skippedAccounts.push({ accountID: accountId, hash: stateId });
                                continue;
                            }
                            accountDataFinal.push(wrappedAccount);
                        }
                    }
                    if (accountDataFinal.length === 0) {
                        continue;
                    }
                    let updatedAccountData = accountDataFinal[0];
                    if (updatedAccountData == null || updatedAccountData.timestamp != tooOldRecord.accountMemData.t) {
                        continue;
                    }
                    const accountDataRequest: TooOldAccountUpdateRequest = {
                        accountID: accountId,
                        txId: archivedQueueEntry.acceptedTx.txId,
                        signedReceipt: this.stateManager.getSignedReceipt(archivedQueueEntry),
                        updatedAccountData: updatedAccountData
                    };
                    const message: RepairOOSAccountsReq = {
                        repairInstructions: [{
                                accountID: accountId,
                                hash: updatedAccountData.stateId,
                                txId: archivedQueueEntry.acceptedTx.txId,
                                accountData: updatedAccountData,
                                targetNodeId: tooOldRecord.node.id,
                                signedReceipt: this.stateManager.getSignedReceipt(archivedQueueEntry)
                            }]
                    };
                    await this.p2p.tellBinary<RepairOOSAccountsReq>([tooOldRecord.node], InternalRouteEnum.binary_repair_oos_accounts, message, serializeRepairOOSAccountsReq, {});
                    let shortAccountId = utils.makeShortHash(accountId);
                    let shortNodeId = utils.makeShortHash(tooOldRecord.node.id);
                }
            }
            const updatedAccounts: string[] = [];
            const failedHashes = await this.stateManager.checkAndSetAccountData(wrappedDataListFiltered, `testAndPatchAccounts`, true, updatedAccounts);
            if (failedHashes.length != 0) {
                this.statemanager_fatal('isInSync = false, failed hashes', `isInSync = false cycle:${cycle}:  failed hashes:${failedHashes.length}`);
            }
            const appliedFixes = Math.max(0, wrappedDataListFiltered.length - failedHashes.length);
            this.stateManager.cycleDebugNotes.patchedAccounts = appliedFixes;
            let logLimit = 3000000;
            if (logFlags.verbose === false) {
                logLimit = 2000;
            }
            const repairedAccountSummary = utils.stringifyReduceLimit(wrappedDataListFiltered.map((account) => {
                return { a: account.accountId, h: account.stateId };
            }), logLimit);
            this.statemanager_fatal('isInSync = false', `bad accounts cycle:${cycle} bad:${results.badAccounts.length} received:${wrappedDataList.length} failedH: ${failedHashes.length} filtered:${utils.stringifyReduce(filterStats)} stats:${utils.stringifyReduce(results.stats)} getAccountStats: ${utils.stringifyReduce(getAccountStats)} details: ${utils.stringifyReduceLimit(results.badAccounts, logLimit)}`);
            this.statemanager_fatal('isInSync = false', `isInSync = false ${cycle}: fixed:${appliedFixes}  repaired: ${repairedAccountSummary}`);
            trieRepairDump.stats = {
                badAcc: results.badAccounts.length,
                received: wrappedDataList.length,
                filterStats,
                getAccountStats,
                findBadAccountStats: results.stats,
            };
            trieRepairDump.z_accountSummary = repairedAccountSummary;
            const combinedAccountStateData: Shardus.StateTableObject[] = [];
            const updatedSet = new Set();
            for (const updated of updatedAccounts) {
                updatedSet.add(updated);
            }
            for (const wrappedData of wrappedDataListFiltered) {
                if (updatedSet.has(wrappedData.accountId)) {
                    const stateTableData = stateTableDataMap.get(wrappedData.stateId);
                    if (stateTableData != null) {
                        combinedAccountStateData.push(stateTableData);
                    }
                }
            }
            if (combinedAccountStateData.length > 0) {
                await this.stateManager.storage.addAccountStates(combinedAccountStateData);
            }
            if (wrappedDataListFiltered.length > 0) {
                await this.stateManager.writeCombinedAccountDataToBackups(wrappedDataListFiltered, failedHashes);
            }
            this.lastRepairInfo = trieRepairDump;
            failHistoryObject.repaired += appliedFixes;
            this.failedLastTrieSync = true;
        }
        else {
            if (lastFail === true) {
                const failHistoryObject = this.syncFailHistory[this.syncFailHistory.length - 1];
                this.failEndCycle = cycle;
                failHistoryObject.e = this.failEndCycle;
                failHistoryObject.cycles = this.failEndCycle - this.failStartCycle;
                this.statemanager_fatal(`inSync again`, Utils.safeStringify(this.syncFailHistory));
            }
        }
    }
    simulateRepairs(_cycle: number, badAccounts: AccountIDAndHash[]): AccountPreTest[] {
        const results = [];
        for (const badAccount of badAccounts) {
            const preTestResult = {
                accountID: badAccount.accountID,
                hash: badAccount.hash,
                preTestStatus: 1,
            };
            results.push(preTestResult);
        }
        return results;
    }
    async getAccountRepairData(cycle: number, badAccounts: AccountIDAndHash[]): Promise<{
        repairDataResponse: AccountRepairDataResponse;
        stateTableDataMap: Map<string, Shardus.StateTableObject>;
        getAccountStats: AccountStats;
    }> {
        const nodesBySyncRadix: Map<string, RequestEntry> = new Map();
        const accountHashMap = new Map();
        const wrappedDataList: Shardus.WrappedData[] = [];
        const stateTableDataMap: Map<string, Shardus.StateTableObject> = new Map();
        const getAccountStats: AccountStats = {
            skipping: 0,
            multiRequests: 0,
            requested: 0,
        };
        let repairDataResponse: AccountRepairDataResponse;
        let allRequestEntries: Map<string, RequestEntry> = new Map();
        try {
            for (const accountEntry of badAccounts) {
                const syncRadix = accountEntry.accountID.substring(0, this.treeSyncDepth);
                let requestEntry = nodesBySyncRadix.get(syncRadix);
                accountHashMap.set(accountEntry.accountID, accountEntry.hash);
                if (requestEntry == null) {
                    const nodeToAsk = this.getNodeForQuery(accountEntry.accountID, cycle, true);
                    if (nodeToAsk == null) {
                        this.statemanager_fatal('getAccountRepairData no node avail', `getAccountRepairData no node avail ${cycle}`);
                        continue;
                    }
                    requestEntry = { node: nodeToAsk, request: { cycle, accounts: [] } };
                    nodesBySyncRadix.set(syncRadix, requestEntry);
                }
                requestEntry.request.accounts.push(accountEntry);
                allRequestEntries.set(accountEntry.accountID, requestEntry);
            }
            const promises = [];
            const accountPerRequest = this.config.stateManager.patcherAccountsPerRequest;
            const maxAskCount = this.config.stateManager.patcherAccountsPerUpdate;
            for (const requestEntry of nodesBySyncRadix.values()) {
                if (requestEntry.request.accounts.length > accountPerRequest) {
                    let offset = 0;
                    const allAccounts = requestEntry.request.accounts;
                    let thisAskCount = 0;
                    while (offset < allAccounts.length &&
                        Math.min(offset + accountPerRequest, allAccounts.length) < maxAskCount) {
                        requestEntry.request.accounts = allAccounts.slice(offset, offset + accountPerRequest);
                        let promise = null;
                        promise = this.p2p.askBinary<GetAccountDataByHashesReq, GetAccountDataByHashesResp>(requestEntry.node, InternalRouteEnum.binary_get_account_data_by_hashes, requestEntry.request, serializeGetAccountDataByHashesReq, deserializeGetAccountDataByHashesResp, {});
                        promises.push(promise);
                        offset = offset + accountPerRequest;
                        getAccountStats.multiRequests++;
                        thisAskCount = requestEntry.request.accounts.length;
                    }
                    getAccountStats.skipping += Math.max(0, allAccounts.length - thisAskCount);
                    getAccountStats.requested += thisAskCount;
                }
                else {
                    let promise = null;
                    promise = this.p2p.askBinary<GetAccountDataByHashesReq, GetAccountDataByHashesResp>(requestEntry.node, InternalRouteEnum.binary_get_account_data_by_hashes, requestEntry.request, serializeGetAccountDataByHashesReq, deserializeGetAccountDataByHashesResp, {});
                    promises.push(promise);
                    getAccountStats.requested = requestEntry.request.accounts.length;
                }
            }
            const promiseResults = await Promise.allSettled(promises);
            for (const promiseResult of promiseResults) {
                if (promiseResult.status === 'rejected') {
                    continue;
                }
                const result = promiseResult.value as HashTrieAccountDataResponse;
                if (result != null && result.accounts != null && result.accounts.length > 0) {
                    if (result.stateTableData != null && result.stateTableData.length > 0) {
                        for (const stateTableData of result.stateTableData) {
                            stateTableDataMap.set(stateTableData.stateAfter, stateTableData);
                        }
                    }
                    for (const wrappedAccount of result.accounts) {
                        const desiredHash = accountHashMap.get(wrappedAccount.accountId);
                        if (desiredHash != wrappedAccount.stateId) {
                            this.statemanager_fatal('getAccountRepairData wrong hash', `getAccountRepairData wrong hash ${utils.stringifyReduce(wrappedAccount.accountId)}`);
                            continue;
                        }
                        wrappedDataList.push(wrappedAccount);
                    }
                }
            }
            let nodesWeAsked = [];
            for (const wrappedData of wrappedDataList) {
                let requestEntry = allRequestEntries.get(wrappedData.accountId);
                if (requestEntry != null) {
                    nodesWeAsked.push(requestEntry.node);
                }
                else {
                    nodesWeAsked.push(null);
                }
            }
            repairDataResponse = { wrappedDataList, nodes: nodesWeAsked };
        }
        catch (error) {
            this.statemanager_fatal('getAccountRepairData fatal ' + wrappedDataList.length, 'getAccountRepairData fatal ' + wrappedDataList.length + ' ' + errorToStringFull(error));
        }
        return { repairDataResponse, stateTableDataMap, getAccountStats };
    }
    processShardDump(stream: Response<unknown, Record<string, unknown>, number>, lines: Line[]): {
        allPassed: boolean;
        allPassed2: boolean;
    } {
        const dataByParition = new Map();
        const rangesCovered = [];
        const nodesListsCovered = [];
        const nodeLists = [];
        let newestCycle = -1;
        const partitionObjects = [];
        for (const line of lines) {
            const index = line.raw.indexOf('{"allNodeIds');
            if (index >= 0) {
                const partitionStr = line.raw.slice(index);
                let partitionObj: {
                    cycle: number;
                    owner: string;
                };
                try {
                    partitionObj = Utils.safeJsonParse(partitionStr);
                }
                catch (error) {
                    this.mainLogger.error('error parsing partitionObj', error, partitionStr);
                    continue;
                }
                if (newestCycle > 0 && partitionObj.cycle != newestCycle) {
                    stream.write(`wrong cycle for node: ${line.file.owner} reportCycle:${newestCycle} thisNode:${partitionObj.cycle} \n`);
                    continue;
                }
                partitionObjects.push(partitionObj);
                if (partitionObj.cycle > newestCycle) {
                    newestCycle = partitionObj.cycle;
                }
                partitionObj.owner = line.file.owner;
            }
        }
        for (const partitionObj of partitionObjects) {
            if (partitionObj.cycle === newestCycle) {
                for (const partition of partitionObj.partitions) {
                    let results = dataByParition.get(partition.parititionID);
                    if (results == null) {
                        results = [];
                        dataByParition.set(partition.parititionID, results);
                    }
                    results.push({
                        owner: partitionObj.owner,
                        accounts: partition.accounts,
                        ownerId: partitionObj.rangesCovered.id,
                        accounts2: partition.accounts2,
                        partitionHash2: partition.partitionHash2,
                    });
                }
                rangesCovered.push(partitionObj.rangesCovered);
                nodesListsCovered.push(partitionObj.nodesCovered);
                nodeLists.push(partitionObj.allNodeIds);
            }
        }
        let allPassed = true;
        for (const [key, value] of dataByParition) {
            const results = value;
            const votes = {};
            for (const entry of results) {
                if (entry.accounts.length === 0) {
                    continue;
                }
                entry.accounts.sort(function (a: {
                    id: number;
                }, b: {
                    id: number;
                }) {
                    return a.id === b.id ? 0 : a.id < b.id ? -1 : 1;
                });
                const string = utils.stringifyReduce(entry.accounts);
                let voteEntry = votes[string];
                if (voteEntry == null) {
                    voteEntry = {};
                    voteEntry.voteCount = 0;
                    voteEntry.ownerIds = [];
                    votes[string] = voteEntry;
                }
                voteEntry.voteCount++;
                votes[string] = voteEntry;
                voteEntry.ownerIds.push(entry.ownerId);
            }
            for (const key2 of Object.keys(votes)) {
                const voteEntry = votes[key2];
                let voters = '';
                if (key2 !== '[]') {
                    voters = `---voters:${Utils.safeStringify(voteEntry.ownerIds)}`;
                }
                stream.write(`partition: ${key}  votes: ${voteEntry.voteCount} values: ${key2} \t\t\t${voters}\n`);
            }
            const numUniqueVotes = Object.keys(votes).length;
            if (numUniqueVotes > 2 || (numUniqueVotes > 1 && votes['[]'] == null)) {
                allPassed = false;
                stream.write(`partition: ${key} failed.  Too many different version of data: ${numUniqueVotes} \n`);
            }
        }
        stream.write(`partition tests all passed: ${allPassed}\n`);
        let allPassed2 = true;
        for (const [key, value] of dataByParition) {
            const results = value;
            const votes = {};
            for (const entry of results) {
                const fullString = utils.stringifyReduce(entry.accounts2);
                let string = entry.partitionHash2;
                if (string === undefined) {
                    string = '[]';
                }
                let voteEntry = votes[string];
                if (voteEntry == null) {
                    voteEntry = {};
                    voteEntry.voteCount = 0;
                    voteEntry.ownerIds = [];
                    voteEntry.fullString = fullString;
                    votes[string] = voteEntry;
                }
                voteEntry.voteCount++;
                votes[string] = voteEntry;
                voteEntry.ownerIds.push(entry.ownerId);
            }
            for (const key2 of Object.keys(votes)) {
                const voteEntry = votes[key2];
                let voters = '';
                if (key2 !== '[]') {
                    voters = `---voters:${Utils.safeStringify(voteEntry.ownerIds)}`;
                }
                stream.write(`partition: ${key}  votes: ${voteEntry.voteCount} values: ${key2} \t\t\t${voters}\t -details:${voteEntry.fullString}   \n`);
            }
            const numUniqueVotes = Object.keys(votes).length;
            if (numUniqueVotes > 2 || (numUniqueVotes > 1 && votes['[]'] == null)) {
                allPassed2 = false;
                stream.write(`partition: ${key} failed.  Too many different version of data: ${numUniqueVotes} \n`);
            }
        }
        stream.write(`partition tests all passed: ${allPassed2}\n`);
        rangesCovered.sort(function (a, b) {
            return a.id === b.id ? 0 : a.id < b.id ? -1 : 1;
        });
        const isStored = function (i: number, rangeCovered: {
            stMin: number;
            stMax: number;
        }): boolean {
            const key = i;
            const minP = rangeCovered.stMin;
            const maxP = rangeCovered.stMax;
            if (minP === maxP) {
                if (i !== minP) {
                    return false;
                }
            }
            else if (maxP > minP) {
                if (key < minP || key > maxP) {
                    return false;
                }
            }
            else {
                if (key > maxP && key < minP) {
                    return false;
                }
            }
            return true;
        };
        const isConsensus = function (i: number, rangeCovered: {
            cMin: number;
            cMax: number;
        }): boolean {
            const key = i;
            const minP = rangeCovered.cMin;
            const maxP = rangeCovered.cMax;
            if (minP === maxP) {
                if (i !== minP) {
                    return false;
                }
            }
            else if (maxP > minP) {
                if (key < minP || key > maxP) {
                    return false;
                }
            }
            else {
                if (key > maxP && key < minP) {
                    return false;
                }
            }
            return true;
        };
        for (const range of rangesCovered) {
            let partitionGraph = '';
            for (let i = 0; i < range.numP; i++) {
                const isC = isConsensus(i, range);
                const isSt = isStored(i, range);
                if (i === range.hP) {
                    partitionGraph += 'H';
                }
                else if (isC && isSt) {
                    partitionGraph += 'C';
                }
                else if (isC) {
                    partitionGraph += '!';
                }
                else if (isSt) {
                    partitionGraph += 'e';
                }
                else {
                    partitionGraph += '_';
                }
            }
            stream.write(`node: ${range.id} ${range.ipPort}\tgraph: ${partitionGraph}\thome: ${range.hP}   data:${Utils.safeStringify(range)}\n`);
        }
        stream.write(`\n\n`);
        nodesListsCovered.sort(function (a, b) {
            return a.id === b.id ? 0 : a.id < b.id ? -1 : 1;
        });
        for (const nodesCovered of nodesListsCovered) {
            let partitionGraph = '';
            const consensusMap = {};
            const storedMap = {};
            for (const entry of nodesCovered.consensus) {
                consensusMap[entry.idx] = { hp: entry.hp };
            }
            for (const entry of nodesCovered.stored) {
                storedMap[entry.idx] = { hp: entry.hp };
            }
            for (let i = 0; i < nodesCovered.numP; i++) {
                const isC = consensusMap[i] != null;
                const isSt = storedMap[i] != null;
                if (i === nodesCovered.idx) {
                    partitionGraph += 'O';
                }
                else if (isC && isSt) {
                    partitionGraph += 'C';
                }
                else if (isC) {
                    partitionGraph += '!';
                }
                else if (isSt) {
                    partitionGraph += 'e';
                }
                else {
                    partitionGraph += '_';
                }
            }
            stream.write(`node: ${nodesCovered.id} ${nodesCovered.ipPort}\tgraph: ${partitionGraph}\thome: ${nodesCovered.hP} data:${Utils.safeStringify(nodesCovered)}\n`);
        }
        stream.write(`\n\n`);
        for (const list of nodeLists) {
            stream.write(`${Utils.safeStringify(list)} \n`);
        }
        return { allPassed, allPassed2 };
    }
    calculateMinVotes(): number {
        let minVotes = Math.ceil(this.stateManager.currentCycleShardData.shardGlobals.nodesPerConsenusGroup * 0.51);
        const majorityOfActiveNodes = Math.ceil(this.stateManager.currentCycleShardData.nodes.length * 0.51);
        minVotes = Math.min(minVotes, majorityOfActiveNodes);
        minVotes = Math.max(1, minVotes);
        return minVotes;
    }
}
type BadAccountStats = {
    testedSyncRadix: number;
    skippedSyncRadix: number;
    badSyncRadix: number;
    ok_noTrieAcc: number;
    ok_trieHashBad: number;
    fix_butHashMatch: number;
    fixLastSeen: number;
    needsVotes: number;
    subHashesTested: number;
    trailColdLevel: number;
    checkedLevel: number;
    leafsChecked: number;
    leafResponses: number;
    getAccountHashStats: Record<string, never>;
};
type BadAccountsInfo = {
    badAccounts: AccountIDAndHash[];
    hashesPerLevel: number[];
    checkedKeysPerLevel: number[];
    requestedKeysPerLevel: number[];
    badHashesPerLevel: number[];
    accountHashesChecked: number;
    stats: BadAccountStats;
    extraBadAccounts: AccountIdAndHashToRepair[];
    extraBadKeys: RadixAndHash[];
    accountsTheyNeedToRepair: AccountIdAndHashToRepair[];
};
export type AccountRepairInstruction = {
    accountID: string;
    hash: string;
    txId: string;
    accountData: Shardus.WrappedData;
    targetNodeId: string;
    signedReceipt: SignedReceipt;
};
export default AccountPatcher;