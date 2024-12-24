import * as Shardus from '../shardus/shardus-types';
import { StateManager as StateManagerTypes } from '@shardus/types';
import * as utils from '../utils';
import Profiler from '../utils/profiler';
import { P2PModuleContext as P2P } from '../p2p/Context';
import Storage from '../storage';
import Crypto from '../crypto';
import Logger, { logFlags } from '../logger';
import ShardFunctions from './shardFunctions';
import { shardusGetTime } from '../network';
import StateManager from '.';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { QueueEntry, AccountHashCache, RequestStateForTxResp, Proposal } from './state-manager-types';
import { Logger as log4jsLogger } from 'log4js';
import { RequestStateForTxPostReq, serializeRequestStateForTxPostReq } from '../types/RequestStateForTxPostReq';
import { RequestStateForTxPostResp, deserializeRequestStateForTxPostResp } from '../types/RequestStateForTxPostResp';
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum';
import * as NodeList from '../p2p/NodeList';
import * as Self from '../p2p/Self';
import { Utils } from '@shardus/types';
class TransactionRepair {
    app: Shardus.App;
    crypto: Crypto;
    config: Shardus.StrictServerConfiguration;
    profiler: Profiler;
    logger: Logger;
    p2p: P2P;
    storage: Storage;
    stateManager: StateManager;
    mainLogger: log4jsLogger;
    seqLogger: log4jsLogger;
    fatalLogger: log4jsLogger;
    shardLogger: log4jsLogger;
    statsLogger: log4jsLogger;
    statemanager_fatal: (key: string, log: string) => void;
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
    }
    async repairToMatchReceipt(queueEntry: QueueEntry): Promise<void> {
        if (this.stateManager.currentCycleShardData == null) {
            return;
        }
        if (queueEntry.uniqueKeys == null) {
            throw new Error('repairToMatchReceipt queueEntry.uniqueKeys == null');
        }
        queueEntry.repairStarted = true;
        const updatedAccountAndHashes = [];
        const localUpdatedAccountAndHashes = [];
        const stats = {
            requestObjectCount: 0,
            requestsMade: 0,
            responseFails: 0,
            dataRecieved: 0,
            dataApplied: 0,
            failedHash: 0,
            numUpToDateAccounts: 0,
            repairsGoodCount: 0,
            skipNonStored: 0,
            localAccUsed: 0,
            localAccSkipped: 0,
            rLoop1: 0,
            rLoop2: 0,
            rLoop3: 0,
            rLoop4: 0,
            rangeErr: 0,
        };
        const allKeys = [];
        const repairFix = true;
        let keysList = [];
        const voteHashMap: Map<string, string> = new Map();
        const localReadyRepairs: Map<string, Shardus.WrappedResponse> = new Map();
        const nonStoredKeys = [];
        try {
            this.stateManager.dataRepairsStarted++;
            if (queueEntry.didSync) {
            }
            else {
            }
            const txLogID = queueEntry.logID;
            const requestObjects: {
                [id: string]: {
                    proposal: Proposal;
                    voteIndex: number;
                    accountHash: string;
                    accountId: string;
                    nodeShardInfo: StateManagerTypes.shardFunctionTypes.NodeShardData;
                    alternates: string[];
                };
            } = {};
            const receivedReceipt = queueEntry?.signedReceiptForRepair;
            if (!receivedReceipt) {
                return;
            }
            if (receivedReceipt.proposal.applied === false) {
                return;
            }
            const proposal = queueEntry?.signedReceiptForRepair?.proposal;
            if (!proposal) {
                return;
            }
            const voters = queueEntry.signedReceiptForRepair.signaturePack;
            utils.shuffleArray(voters);
            if (queueEntry.ourVoteHash != null) {
                if (queueEntry.ourVoteHash === queueEntry.signedReceiptForRepair.proposalHash) {
                }
            }
            const upToDateAccounts: {
                [id: string]: boolean;
            } = {};
            const nodeShardData: StateManagerTypes.shardFunctionTypes.NodeShardData = this.stateManager.currentCycleShardData.nodeShardData;
            for (let i = 0; i < proposal.accountIDs.length; i++) {
                const accountID = proposal.accountIDs[i];
                if (ShardFunctions.testAddressInRange(accountID, nodeShardData.storedPartitions) === false) {
                    stats.skipNonStored++;
                    nonStoredKeys.push(accountID);
                    continue;
                }
                voteHashMap.set(proposal.accountIDs[i], proposal.afterStateHashes[i]);
            }
            if (repairFix) {
                keysList = Array.from(voteHashMap.keys());
            }
            else {
                keysList = Array.from(queueEntry.uniqueKeys);
            }
            if (repairFix) {
                const applyResponse = queueEntry?.preApplyTXResult?.applyResponse;
                if (applyResponse != null) {
                    if (applyResponse.accountWrites != null && applyResponse.accountWrites.length > 0) {
                        for (const writtenAccount of applyResponse.accountWrites) {
                            const key = writtenAccount.accountId;
                            const shortKey = utils.stringifyReduce(key);
                            const goalHash = voteHashMap.get(key);
                            const data = writtenAccount.data;
                            const hashObj = this.stateManager.accountCache.getAccountHash(key);
                            if (goalHash != null && goalHash === data.stateId) {
                                localReadyRepairs.set(key, data);
                                if (hashObj != null && hashObj.t > data.timestamp) {
                                    continue;
                                }
                                if (hashObj != null && hashObj.h === data.stateId) {
                                    continue;
                                }
                                const dataToSet = [data];
                                const failedHashes = await this.stateManager.checkAndSetAccountData(dataToSet, `tx:${txLogID} repairToMatchReceipt`, true);
                                if (failedHashes.length === 0) {
                                    stats.localAccUsed++;
                                }
                                else {
                                    stats.failedHash++;
                                    if (logFlags.error)
                                        this.statemanager_fatal(`repairToMatchReceipt_failedhash 2`, ` tx:${txLogID}  failed:${failedHashes[0]} acc:${shortKey}`);
                                }
                                await this.stateManager.writeCombinedAccountDataToBackups(dataToSet, failedHashes);
                                localUpdatedAccountAndHashes.push({ accountID: data.accountId, hash: data.stateId });
                            }
                        }
                    }
                }
            }
            for (const key of keysList) {
                stats.rLoop1++;
                if (localReadyRepairs.has(key)) {
                    stats.localAccSkipped++;
                    continue;
                }
                let coveredKey = false;
                const isGlobal = this.stateManager.accountGlobals.isGlobalAccount(key);
                const shortKey = utils.stringifyReduce(key);
                const eligibleNodeIdMap: any = {};
                for (let i = 0; i < voters.length; i++) {
                    const voter = voters[i];
                    const node = this.stateManager.p2p.state.getNodeByPubKey(voter.owner);
                    if (node == null) {
                        continue;
                    }
                    eligibleNodeIdMap[node.id] = true;
                }
                const eligibleNodeIdsArray = Object.keys(eligibleNodeIdMap);
                utils.shuffleArray(eligibleNodeIdsArray);
                const eligibleNodeIds = new Set(eligibleNodeIdsArray);
                for (const node_id of eligibleNodeIds) {
                    stats.rLoop2++;
                    for (let j = 0; j < proposal.accountIDs.length; j++) {
                        stats.rLoop3++;
                        const accountId = proposal.accountIDs[j];
                        const hash = proposal.afterStateHashes[j];
                        if (accountId === key && hash != null) {
                            if (upToDateAccounts[accountId] === true) {
                                continue;
                            }
                            const hashObj = this.stateManager.accountCache.getAccountHash(key);
                            if (hashObj != null) {
                                if (hashObj.h === hash) {
                                    upToDateAccounts[accountId] = true;
                                    stats.numUpToDateAccounts++;
                                    break;
                                }
                            }
                            if (repairFix) {
                                if (hashObj != null && hashObj.t > queueEntry.acceptedTx.timestamp) {
                                    continue;
                                }
                            }
                            if (requestObjects[key] != null) {
                                if (node_id !== this.stateManager.currentCycleShardData.ourNode.id) {
                                    if (this.stateManager.currentCycleShardData.nodeShardDataMap.has(node_id) === true) {
                                        requestObjects[key].alternates.push(node_id);
                                    }
                                }
                                continue;
                            }
                            stats.rLoop4++;
                            coveredKey = true;
                            if (node_id === this.stateManager.currentCycleShardData.ourNode.id) {
                                continue;
                            }
                            if (this.stateManager.currentCycleShardData.nodeShardDataMap.has(node_id) === false) {
                                continue;
                            }
                            const nodeShardInfo: StateManagerTypes.shardFunctionTypes.NodeShardData = this.stateManager.currentCycleShardData.nodeShardDataMap.get(node_id);
                            if (nodeShardInfo == null) {
                                if (logFlags.error)
                                    this.mainLogger.error(`shrd_repairToMatchReceipt nodeShardInfo == null ${utils.stringifyReduce(node_id)} tx:${txLogID} acc:${shortKey}`);
                                continue;
                            }
                            if (queueEntry.executionGroupMap.has(node_id) === false) {
                                if (isGlobal === false &&
                                    ShardFunctions.testAddressInRange(accountId, nodeShardInfo.storedPartitions) == false) {
                                    stats.rangeErr++;
                                    continue;
                                }
                            }
                            const objectToSet = {
                                proposal,
                                voteIndex: j,
                                accountHash: hash,
                                accountId: accountId,
                                nodeShardInfo,
                                alternates: [],
                            };
                            requestObjects[key] = objectToSet;
                            allKeys.push(key);
                            stats.requestObjectCount++;
                        }
                    }
                }
                if (coveredKey === false) {
                }
            }
            for (const key of allKeys) {
                const shortKey = utils.stringifyReduce(key);
                if (requestObjects[key] != null) {
                    const requestObject = requestObjects[key];
                    if (requestObject == null) {
                        continue;
                    }
                    let node = requestObject.nodeShardInfo.node;
                    if (node == null) {
                        if (logFlags.error)
                            this.mainLogger.error(`shrd_repairToMatchReceipt node == null ${utils.stringifyReduce(requestObject.accountId)}`);
                        continue;
                    }
                    let alternateIndex = 0;
                    let attemptsRemaining = true;
                    let checkNodeDown = true;
                    let checkNodeLost = true;
                    let outerloopCount = 0;
                    while (outerloopCount <= 2) {
                        outerloopCount++;
                        while (attemptsRemaining === true) {
                            while (node == null) {
                                if (logFlags.error)
                                    this.mainLogger.error(`shrd_repairToMatchReceipt while(node == null) look for other node txId. idx:${alternateIndex} txid: ${utils.stringifyReduce(requestObject.proposal.txid)} alts: ${utils.stringifyReduce(requestObject.alternates)}  acc:${shortKey}`);
                                if (alternateIndex >= requestObject.alternates.length) {
                                    if (logFlags.error)
                                        this.statemanager_fatal(`repairToMatchReceipt_1`, `ASK FAIL repairToMatchReceipt failed to find alternate node to ask for receipt data. txId. ${utils.stringifyReduce(requestObject.proposal.txid)} alts: ${utils.stringifyReduce(requestObject.alternates)}  acc:${shortKey}`);
                                    attemptsRemaining = false;
                                    if (outerloopCount <= 2) {
                                        alternateIndex = 0;
                                        attemptsRemaining = true;
                                        checkNodeDown = false;
                                        checkNodeLost = false;
                                        if (logFlags.error)
                                            this.statemanager_fatal(`repairToMatchReceipt_2`, `ASK FAIL repairToMatchReceipt making attempt #${outerloopCount + 1}   tx:${txLogID}  acc:${shortKey}`);
                                        break;
                                    }
                                    else {
                                        if (logFlags.error)
                                            this.mainLogger.error(`repairToMatchReceipt FAILED out of attempts #${outerloopCount + 1} tx:${txLogID}  acc:${shortKey}`);
                                        if (logFlags.error)
                                            this.statemanager_fatal(`repairToMatchReceipt_3`, `ASK FAIL repairToMatchReceipt FAILED out of attempts   tx:${txLogID}  acc:${shortKey}`);
                                        return;
                                    }
                                }
                                const altId = requestObject.alternates[alternateIndex];
                                const nodeShardInfo: StateManagerTypes.shardFunctionTypes.NodeShardData = this.stateManager.currentCycleShardData.nodeShardDataMap.get(altId);
                                if (nodeShardInfo != null) {
                                    node = nodeShardInfo.node;
                                    if (logFlags.error)
                                        this.mainLogger.error(`shrd_repairToMatchReceipt got alt source node: idx:${alternateIndex} txid: ${utils.stringifyReduce(requestObject.proposal.txid)} alts: ${utils.stringifyReduce(node.id)}  acc:${shortKey}`);
                                }
                                else {
                                    if (logFlags.error)
                                        this.mainLogger.error(`shrd_repairToMatchReceipt nodeShardInfo == null for ${utils.stringifyReduce(altId)}  tx:${txLogID}  acc:${shortKey}`);
                                }
                                alternateIndex++;
                            }
                            if (node == null) {
                                if (logFlags.error)
                                    this.statemanager_fatal(`repairToMatchReceipt_4`, `ASK FAIL repairToMatchReceipt node == null in list. #${outerloopCount + 1}  tx:${txLogID}  acc:${shortKey}`);
                                node = null;
                                break;
                            }
                            const relationString = '';
                            if (outerloopCount < 2) {
                                if (this.stateManager.isNodeValidForInternalMessage(node.id, 'repairToMatchReceipt', checkNodeDown, checkNodeLost) === false) {
                                    node = null;
                                    continue;
                                }
                            }
                            if (this.stateManager.accountCache.hasAccount(requestObject.accountId)) {
                                const accountMemData: AccountHashCache = this.stateManager.accountCache.getAccountHash(requestObject.accountId);
                                if (accountMemData.h === requestObject.accountHash) {
                                    if (logFlags.error)
                                        this.mainLogger.error(`Fix Worked: repairToMatchReceipt. already have latest ${utils.makeShortHash(requestObject.accountId)} cache:${utils.stringifyReduce(accountMemData)}`);
                                    attemptsRemaining = false;
                                    continue;
                                }
                            }
                            let result: RequestStateForTxResp;
                            try {
                                stats.requestsMade++;
                                const message = {
                                    key: requestObject.accountId,
                                    hash: requestObject.accountHash,
                                    txid: queueEntry.acceptedTx.txId,
                                    timestamp: queueEntry.acceptedTx.timestamp,
                                };
                                const request = message as RequestStateForTxPostReq;
                                result = await this.p2p.askBinary<RequestStateForTxPostReq, RequestStateForTxPostResp>(node, InternalRouteEnum.binary_request_state_for_tx_post, request, serializeRequestStateForTxPostReq, deserializeRequestStateForTxPostResp, {
                                    verification_data: request.txid,
                                });
                                if (result == null) {
                                    if (logFlags.verbose) {
                                        if (logFlags.error)
                                            this.mainLogger.error(`ASK FAIL repairToMatchReceipt request_state_for_tx_post result == null tx:${txLogID}  acc:${shortKey}`);
                                    }
                                    if (logFlags.error)
                                        this.mainLogger.error(`ASK FAIL repairToMatchReceipt request_state_for_tx_post no reponse from ${utils.stringifyReduce(node.id)}  tx:${txLogID}  acc:${shortKey}`);
                                    node = null;
                                    stats.responseFails++;
                                    continue;
                                }
                                if (result.success !== true) {
                                    if (logFlags.error)
                                        this.mainLogger.error(`ASK FAIL repairToMatchReceipt result.success === ${result.success}   tx:${txLogID}  acc:${shortKey}`);
                                    node = null;
                                    stats.responseFails++;
                                    continue;
                                }
                            }
                            catch (e) {
                                if (logFlags.error)
                                    this.mainLogger.error(`ASK FAIL repairToMatchReceipt request_state_for_tx_post  tx:${txLogID}  acc:${shortKey} e:${e}`);
                                node = null;
                                stats.responseFails++;
                                continue;
                            }
                            finally {
                            }
                            const dataCountReturned = 0;
                            const accountIdsReturned = [];
                            for (const data of result.stateList) {
                                try {
                                    stats.dataRecieved++;
                                    if (repairFix) {
                                        const hashObj = this.stateManager.accountCache.getAccountHash(key);
                                        if (hashObj != null && hashObj.t > data.timestamp) {
                                            continue;
                                        }
                                    }
                                    if (data.stateId !== requestObject.accountHash) {
                                        if (logFlags.error)
                                            this.mainLogger.error(`repairToMatchReceipt: ${txLogID} data.stateId !== requestObject.accountHash  tx:${txLogID}  acc:${shortKey} data.stateId:${data.stateId}, requestObj.accountHash: ${requestObject.accountHash}`);
                                        continue;
                                    }
                                    const dataToSet = [data];
                                    const failedHashes = await this.stateManager.checkAndSetAccountData(dataToSet, `tx:${txLogID} repairToMatchReceipt`, true);
                                    if (failedHashes.length === 0) {
                                        stats.dataApplied++;
                                    }
                                    else {
                                        stats.failedHash++;
                                        if (logFlags.error)
                                            this.statemanager_fatal(`repairToMatchReceipt_failedhash`, ` tx:${txLogID}  failed:${failedHashes[0]} acc:${shortKey}`);
                                    }
                                    await this.stateManager.writeCombinedAccountDataToBackups(dataToSet, failedHashes);
                                    attemptsRemaining = false;
                                    let beforeData = data.prevDataCopy;
                                    if (beforeData == null) {
                                        const wrappedAccountDataBefore = queueEntry.collectedData[data.accountId];
                                        if (wrappedAccountDataBefore != null) {
                                            beforeData = wrappedAccountDataBefore.data;
                                        }
                                    }
                                    if (beforeData == null) {
                                        const results = await this.app.getAccountDataByList([data.accountId]);
                                        beforeData = results[0];
                                        if (logFlags.error)
                                            this.mainLogger.error(`repairToMatchReceipt: statsDataSummaryUpdate2 beforeData: had to query for data 1 ${utils.stringifyReduce(data.accountId)}  tx:${txLogID}  acc:${shortKey} h:${utils.stringifyReduce(data.stateId)}`);
                                        if (beforeData == null) {
                                            if (logFlags.error)
                                                this.mainLogger.error(`repairToMatchReceipt: statsDataSummaryUpdate2 beforeData: had to query for data 1 not found ${utils.stringifyReduce(data.accountId)}  tx:${txLogID}  acc:${shortKey} h:${utils.stringifyReduce(data.stateId)}`);
                                        }
                                    }
                                    if (beforeData == null) {
                                        if (logFlags.error)
                                            this.mainLogger.error(`repairToMatchReceipt: statsDataSummaryUpdate2 beforeData data is null ${utils.stringifyReduce(data.accountId)} WILL CAUSE DATA OOS  tx:${txLogID}  acc:${shortKey} h:${utils.stringifyReduce(data.stateId)}`);
                                    }
                                    else {
                                        const { timestamp: updatedTimestamp, hash: updatedHash } = this.app.getTimestampAndHashFromAccount(data.data);
                                        if (data.timestamp != updatedTimestamp) {
                                            if (logFlags.error)
                                                this.mainLogger.error(`repairToMatchReceipt: statsDataSummaryUpdate2 timstamp had to be corrected from ${data.timestamp} to ${updatedTimestamp}   tx:${txLogID}  acc:${shortKey} hash:${utils.stringifyReduce(updatedHash)} `);
                                        }
                                        data.timestamp = updatedTimestamp;
                                        let { hash: oldhash } = this.app.getTimestampAndHashFromAccount(beforeData);
                                        const hashNeededUpdate = oldhash !== result.beforeHashes[data.accountId];
                                        oldhash = result.beforeHashes[data.accountId];
                                        const stateTableResults: Shardus.StateTableObject = {
                                            accountId: data.accountId,
                                            txId: queueEntry.acceptedTx.txId,
                                            stateBefore: oldhash,
                                            stateAfter: updatedHash,
                                            txTimestamp: `${updatedTimestamp}`,
                                        };
                                        let updateStateTable = true;
                                        const timeStampMatches = updatedTimestamp === queueEntry.acceptedTx.timestamp;
                                        let test2 = false;
                                        if (timeStampMatches === false) {
                                            if (this.stateManager.accountGlobals.isGlobalAccount(data.accountId)) {
                                                updateStateTable = false;
                                                test2 = true;
                                            }
                                        }
                                        const isGlobal = this.stateManager.accountGlobals.isGlobalAccount(data.accountId);
                                        let test3 = false;
                                        if (isGlobal) {
                                            if (oldhash === updatedHash) {
                                                updateStateTable = false;
                                                test3 = true;
                                            }
                                        }
                                        let test4 = false;
                                        let branch4 = -1;
                                        if (isGlobal === false) {
                                            const hash = this.stateManager.accountCache.getAccountHash(data.accountId);
                                            if (hash != null) {
                                                test4 = hash.h === updatedHash;
                                                branch4 = 1;
                                            }
                                            else {
                                                branch4 = 0;
                                            }
                                        }
                                        if (updateStateTable === true) {
                                            if (stateTableResults.stateBefore == null) {
                                                stateTableResults.stateBefore = '0000';
                                                await this.storage.addAccountStates(stateTableResults);
                                            }
                                            else {
                                                await this.storage.addAccountStates(stateTableResults);
                                            }
                                        }
                                        data.stateId = updatedHash;
                                        updatedAccountAndHashes.push({ accountID: data.accountId, hash: data.stateId });
                                    }
                                }
                                finally {
                                }
                            }
                            if (outerloopCount > 1) {
                                if (logFlags.important_as_error)
                                    this.statemanager_fatal(`repairToMatchReceipt_5 outerloopCount ok`, `ASK FAIL repairToMatchReceipt FIX WORKED ${outerloopCount} tx:${txLogID}  acc:${shortKey}`);
                            }
                            break;
                        }
                    }
                }
            }
            queueEntry.repairFinished = true;
            this.stateManager.dataRepairsCompleted++;
            this.stateManager.cycleDebugNotes.repairs++;
            if (this.stateManager.currentCycleShardData.cycleNumber != queueEntry.cycleToRecordOn) {
                this.stateManager.cycleDebugNotes.lateRepairs++;
            }
        }
        finally {
            if (queueEntry.repairFinished === true) {
                let allGood = false;
                const badHashKeys = [];
                const noHashKeys = [];
                for (const key of keysList) {
                    const hashObj = this.stateManager.accountCache.getAccountHash(key);
                    if (hashObj == null) {
                        noHashKeys.push(key);
                        continue;
                    }
                    if (hashObj.h === voteHashMap.get(key)) {
                        stats.repairsGoodCount++;
                    }
                    else {
                        badHashKeys.push(key);
                    }
                }
                if (stats.repairsGoodCount === keysList.length) {
                    allGood = true;
                }
                else {
                }
                queueEntry.hasValidFinalData = true;
                if (queueEntry.isInExecutionHome === true) {
                    if (queueEntry.preApplyTXResult && queueEntry.preApplyTXResult.applyResponse) {
                        if (queueEntry.ourVoteHash &&
                            queueEntry.signedReceiptForRepair?.proposalHash)
                            if (queueEntry.ourVoteHash === queueEntry.signedReceiptForRepair.proposalHash) {
                                this.stateManager.transactionQueue.addReceiptToForward(queueEntry, 'repair');
                            }
                    }
                }
                const repairLogString = `tx:${queueEntry.logID} updatedAccountAndHashes:${utils.stringifyReduce(updatedAccountAndHashes)}  localUpdatedAccountAndHashes:${utils.stringifyReduce(localUpdatedAccountAndHashes)} state:${queueEntry.state} counters:${utils.stringifyReduce(stats)}`;
                if (logFlags.error && allGood === false)
                    this.mainLogger.error(`repair1 success: req:${stats.requestsMade} apl:${stats.dataApplied} localAccUsed:${stats.localAccUsed} localAccSkipped:${stats.localAccSkipped} key count:${voteHashMap.size} allGood:${allGood} updatedAccountAndHashes:${utils.stringifyReduce(updatedAccountAndHashes)} localUpdatedAccountAndHashes:${utils.stringifyReduce(localUpdatedAccountAndHashes)} badHashKeys:${utils.stringifyReduce(badHashKeys)} noHashKeys:${utils.stringifyReduce(noHashKeys)} nonStoredKeys:${utils.stringifyReduce(nonStoredKeys)} keysList:${utils.stringifyReduce(keysList)} localReadyRepairs:${utils.stringifyReduce(localReadyRepairs.keys())} stats:${utils.stringifyReduce(stats)}`);
            }
            else {
                queueEntry.repairFailed = true;
                if (logFlags.error)
                    this.statemanager_fatal(`repairToMatchReceipt_failed`, `tx:${queueEntry.logID} state:${queueEntry.state} counters:${utils.stringifyReduce(stats)}  keys ${utils.stringifyReduce(allKeys)}  `);
            }
        }
    }
}
export default TransactionRepair;