import { hexstring, P2P, publicKey, StateManager } from '@shardus/types';
import deepmerge from 'deepmerge';
import * as http from '../http';
import { logFlags } from '../logger';
import { getReceiptHashes, getReceiptMap, getStateHashes, getSummaryBlob, getSummaryHashes, } from '../snapshot';
import { shuffleMapIterator, sleep, validateTypes } from '../utils';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { profilerInstance } from '../utils/profiler';
import * as Self from './Self';
import * as Comms from './Comms';
import * as Context from './Context';
import { isBogonIP } from '../utils/functions/checkIP';
import { config, crypto, io, logger, network, stateManager, shardus } from './Context';
import { computeCycleMarker, getCycleChain, newest } from './CycleChain';
import * as CycleCreator from './CycleCreator';
import * as NodeList from './NodeList';
import Timeout = NodeJS.Timeout;
import { apoptosizeSelf } from './Apoptosis';
import { randomInt } from 'crypto';
import { CycleRecord } from '@shardus/types/build/src/p2p/CycleCreatorTypes';
import { StateMetaData } from '@shardus/types/build/src/p2p/SnapshotTypes';
import { DataRequest, JoinedArchiver } from '@shardus/types/build/src/p2p/ArchiversTypes';
import * as CycleChain from './CycleChain';
import rfdc from 'rfdc';
import { shardusGetTime } from '../network';
import { reportLostArchiver } from '../p2p/LostArchivers/functions';
import { ActiveNode } from '@shardus/types/build/src/p2p/SyncTypes';
import { Result, ResultAsync } from 'neverthrow';
import { Utils } from '@shardus/types';
import { arch } from 'os';
import { checkGossipPayload } from '../utils/GossipValidation';
const clone = rfdc();
let p2pLogger;
export let archivers: Map<P2P.ArchiversTypes.JoinedArchiver['publicKey'], P2P.ArchiversTypes.JoinedArchiver>;
export let recipients: Map<P2P.ArchiversTypes.JoinedArchiver['publicKey'], P2P.ArchiversTypes.DataRecipient | any>;
let joinRequests: P2P.ArchiversTypes.Request[];
let leaveRequests: P2P.ArchiversTypes.Request[];
let receiptForwardInterval: Timeout | null = null;
let networkCheckInterval: Timeout | null = null;
let networkCheckInProgress = false;
export let connectedSockets = {};
let lastSentCycle = -1;
let lastTimeForwardedArchivers = [];
export const RECEIPT_FORWARD_INTERVAL_MS = 5000;
export enum DataRequestTypes {
    SUBSCRIBE = 'SUBSCRIBE',
    UNSUBSCRIBE = 'UNSUBSCRIBE'
}
export let archiverDataSubscriptionsUpdateFeatureActivated = false;
export function getNumArchivers(): number {
    return archivers.size;
}
export function getArchiverWithPublicKey(publicKey: publicKey): P2P.ArchiversTypes.JoinedArchiver | undefined {
    return archivers.get(publicKey);
}
export function getRandomArchiver(): P2P.ArchiversTypes.JoinedArchiver | null {
    if (archivers.size === 0)
        return null;
    const list = Array.from(archivers.values());
    const index = randomInt(0, list.length);
    return list[index];
}
export function init() {
    p2pLogger = logger.getLogger('p2p');
    archivers = new Map();
    recipients = new Map();
    reset();
    resetLeaveRequests();
    registerRoutes();
    if (config.p2p.experimentalSnapshot && !receiptForwardInterval) {
        receiptForwardInterval = setInterval(forwardReceipts, RECEIPT_FORWARD_INTERVAL_MS);
    }
    if (config.p2p.checkNetworkStopped) {
        setTimeout(() => {
            networkCheckInterval = setInterval(() => {
                hasNetworkStopped().then((stopped) => {
                    if (stopped) {
                        const msg = 'checkNetworkStopped: Network has stopped. Initiating apoptosis';
                        if (logFlags.important_as_fatal)
                            info(msg);
                        this.fatalLogger.fatal('checkNetworkStopped: Network has stopped. Initiating apoptosis');
                        apoptosizeSelf(msg);
                    }
                });
            }, 1000 * 60 * 5);
        }, randomInt(1000 * 60, 1000 * 60 * 5));
    }
}
export function reset() {
    resetJoinRequests();
}
export function getTxs(): P2P.ArchiversTypes.Txs {
    const requestsCopy = deepmerge({}, [...joinRequests, ...leaveRequests]);
    return {
        archivers: requestsCopy,
    };
}
export function validateRecordTypes(rec: P2P.ArchiversTypes.Record): string {
    let err = validateTypes(rec, { joinedArchivers: 'a' });
    if (err)
        return err;
    for (const item of rec.joinedArchivers) {
        err = validateTypes(item, {
            publicKey: 's',
            ip: 's',
            port: 'n',
            curvePk: 's',
        });
        if (err)
            return 'in joinedArchivers array ' + err;
    }
    return '';
}
export function updateRecord(txs: P2P.ArchiversTypes.Txs, record: P2P.CycleCreatorTypes.CycleRecord) {
    const joinedArchivers = txs.archivers
        .filter((request) => request.requestType === P2P.ArchiversTypes.RequestTypes.JOIN)
        .map((joinRequest) => joinRequest.nodeInfo);
    const leavingArchivers = txs.archivers
        .filter((request) => request.requestType === P2P.ArchiversTypes.RequestTypes.LEAVE)
        .map((leaveRequest) => leaveRequest.nodeInfo);
    record.joinedArchivers = joinedArchivers.sort((a: P2P.ArchiversTypes.JoinedArchiver, b: P2P.ArchiversTypes.JoinedArchiver) => a.publicKey > b.publicKey ? 1 : -1);
    record.leavingArchivers = leavingArchivers.sort((a: P2P.ArchiversTypes.JoinedArchiver, b: P2P.ArchiversTypes.JoinedArchiver) => a.publicKey > b.publicKey ? 1 : -1);
}
export function parseRecord(record: P2P.CycleCreatorTypes.CycleRecord): P2P.CycleParserTypes.Change {
    updateArchivers(record);
    return {
        added: [],
        removed: [],
        updated: [],
    };
}
export function sendRequests() { }
export function queueRequest() { }
export function resetJoinRequests() {
    joinRequests = [];
}
export function resetLeaveRequests() {
    leaveRequests = [];
}
export function addArchiverJoinRequest(joinRequest: P2P.ArchiversTypes.Request, tracker?, gossip = true) {
    let err = validateTypes(joinRequest, { nodeInfo: 'o', requestType: 's', requestTimestamp: 'n', sign: 'o' });
    if (err) {
        warn('addJoinRequest: bad joinRequest ' + err);
        return { success: false, reason: 'bad joinRequest ' + err };
    }
    err = validateTypes(joinRequest.nodeInfo, {
        curvePk: 's',
        ip: 's',
        port: 'n',
        publicKey: 's',
    });
    if (err) {
        warn('addJoinRequest: bad joinRequest.nodeInfo ' + err);
        return { success: false, reason: 'bad joinRequest ' + err };
    }
    if (joinRequest.requestType !== P2P.ArchiversTypes.RequestTypes.JOIN) {
        warn('addJoinRequest: invalid joinRequest.requestType');
        return { success: false, reason: 'invalid joinRequest.requestType' };
    }
    err = validateTypes(joinRequest.sign, { owner: 's', sig: 's' });
    if (err) {
        warn('addJoinRequest: bad joinRequest.sign ' + err);
        return { success: false, reason: 'bad joinRequest.sign ' + err };
    }
    if (!crypto.verify(joinRequest, joinRequest.nodeInfo.publicKey)) {
        warn('addJoinRequest: bad signature');
        return { success: false, reason: 'bad signature ' };
    }
    if (archivers.get(joinRequest.nodeInfo.publicKey)) {
        warn('addJoinRequest: This archiver is already in the active archiver list');
        return { success: false, reason: 'This archiver is already in the active archiver list' };
    }
    const existingJoinRequest = joinRequests.find((j) => j.nodeInfo.publicKey === joinRequest.nodeInfo.publicKey);
    if (existingJoinRequest) {
        warn('addJoinRequest: This archiver join request already exists');
        return { success: false, reason: 'This archiver join request already exists' };
    }
    if (Context.config.p2p.forceBogonFilteringOn) {
        if (isBogonIP(joinRequest.nodeInfo.ip)) {
            warn('addJoinRequest: This archiver join request uses a bogon IP');
            return { success: false, reason: 'This archiver join request is a bogon IP' };
        }
    }
    if (archivers.size > 0) {
        if (Context.config.p2p.validateArchiverAppData) {
            const validationResponse = validateArchiverAppData(joinRequest);
            if (validationResponse && !validationResponse.success)
                return validationResponse;
        }
        const requestTimestamp = joinRequest.requestTimestamp;
        const cycleDuration = newest.duration;
        const cycleStart = newest.start;
        const currentCycleStartTime = (cycleStart + cycleDuration) * 1000;
        const nextCycleStartTime = (cycleStart + 2 * cycleDuration) * 1000;
        if (requestTimestamp < currentCycleStartTime) {
            warn('addJoinRequest: This archiver join request timestamp is earlier than acceptable timestamp range');
            return {
                success: false,
                reason: 'This archiver join request timestamp is earlier than acceptable timestamp range',
            };
        }
        if (requestTimestamp > nextCycleStartTime) {
            warn('addJoinRequest: This archiver join request timestamp exceeds acceptable timestamp range');
            return {
                success: false,
                reason: 'This archiver join request timestamp exceeds acceptable timestamp range',
            };
        }
        try {
            const { shardGlobals: { consensusRadius }, } = Context.stateManager.getCurrentCycleShardData();
            if (archivers.size >= consensusRadius * config.p2p.maxArchiversSubscriptionPerNode) {
                warn('addJoinRequest: This archiver cannot join as max archivers limit has been reached');
                return { success: false, reason: 'Max number of archivers limit reached' };
            }
        }
        catch (e) {
            warn('addJoinRequest: Failed to get consensus radius', e);
            return { success: false, reason: 'This node is not ready to accept this request!' };
        }
    }
    joinRequests.push(joinRequest);
    if (gossip === true) {
        Comms.sendGossip('joinarchiver', joinRequest, tracker, null, NodeList.byIdOrder, true);
    }
    return { success: true };
}
function validateArchiverAppData(joinRequest: P2P.ArchiversTypes.Request): {
    success: boolean;
    reason?: string;
} {
    if (typeof shardus.app.validateArchiverJoinRequest === 'function') {
        try {
            const validationResponse = shardus.app.validateArchiverJoinRequest(joinRequest);
            if (validationResponse.success !== true) {
                error(`Validation of Archiver join request data failed due to ${validationResponse.reason || 'unknown reason'}`);
                return {
                    success: validationResponse.success,
                    reason: validationResponse.reason,
                };
            }
            return { success: true };
        }
        catch (e) {
            warn(`shardus.app.validateArchiverJoinRequest failed due to ${e}`);
            return {
                success: false,
                reason: `Could not validate archiver join request due to Error`,
            };
        }
    }
}
export function addLeaveRequest(leaveRequest: P2P.ArchiversTypes.Request, tracker?, gossip = true) {
    let err = validateTypes(leaveRequest, { nodeInfo: 'o', requestType: 's', sign: 'o' });
    if (err) {
        warn('addLeaveRequest: bad leaveRequest ' + err);
        return { success: false, reason: 'bad leaveRequest ' + err };
    }
    err = validateTypes(leaveRequest.nodeInfo, {
        curvePk: 's',
        ip: 's',
        port: 'n',
        publicKey: 's',
    });
    if (err) {
        warn('addLeaveRequest: bad leaveRequest.nodeInfo ' + err);
        return { success: false, reason: 'bad leaveRequest.nodeInfo ' + err };
    }
    if (leaveRequest.requestType !== P2P.ArchiversTypes.RequestTypes.LEAVE) {
        warn('addLeaveRequest: invalid leaveRequest.requestType');
        return { success: false, reason: 'invalid leaveRequest.requestType' };
    }
    err = validateTypes(leaveRequest.sign, { owner: 's', sig: 's' });
    if (err) {
        warn('addLeaveRequest: bad leaveRequest.sign ' + err);
        return { success: false, reason: 'bad leaveRequest.sign ' + err };
    }
    if (!crypto.verify(leaveRequest, leaveRequest.nodeInfo.publicKey)) {
        warn('addLeaveRequest: bad signature');
        return { success: false, reason: 'bad signature' };
    }
    if (!archivers.get(leaveRequest.nodeInfo.publicKey)) {
        warn('addLeaveRequest: Not a valid archiver to be sending leave request, archiver was not found in active archiver list');
        return {
            success: false,
            reason: 'Not a valid archiver to be sending leave request, archiver was not found in active archiver list',
        };
    }
    const existingLeaveRequest = leaveRequests.find((j) => j.nodeInfo.publicKey === leaveRequest.nodeInfo.publicKey);
    if (existingLeaveRequest) {
        warn('addLeaveRequest: This archiver leave request already exists');
        return { success: false, reason: 'This archiver leave request already exists' };
    }
    const requestTimestamp = leaveRequest.requestTimestamp;
    const cycleDuration = newest.duration;
    const cycleStart = newest.start;
    const currentCycleStartTime = (cycleStart + cycleDuration) * 1000;
    const nextCycleStartTime = (cycleStart + 2 * cycleDuration) * 1000;
    if (requestTimestamp < currentCycleStartTime) {
        warn('addLeaveRequest: This archiver leave request timestamp is earlier than acceptable timestamp range');
        return {
            success: false,
            reason: 'This archiver leave request timestamp is earlier than acceptable timestamp range',
        };
    }
    if (requestTimestamp > nextCycleStartTime) {
        warn('addLeaveRequest: This archiver leave request timestamp exceeds acceptable timestamp range');
        return {
            success: false,
            reason: 'This archiver leave request timestamp exceeds acceptable timestamp range',
        };
    }
    leaveRequests.push(leaveRequest);
    if (gossip === true) {
        Comms.sendGossip('leavingarchiver', leaveRequest, tracker, null, NodeList.byIdOrder, true);
    }
    return { success: true };
}
export function getArchiverUpdates() {
    return joinRequests;
}
export function removeArchiverByPublicKey(publicKey: publicKey) {
    const archiverInfo = archivers.get(publicKey);
    removeArchiver(archiverInfo);
}
export function removeArchiver(nodeInfo: JoinedArchiver) {
    archivers.delete(nodeInfo.publicKey);
    removeDataRecipient(nodeInfo.publicKey);
    removeArchiverConnection(nodeInfo.publicKey);
    leaveRequests = leaveRequests.filter((request) => request.nodeInfo.publicKey !== nodeInfo.publicKey);
}
export function updateArchivers(record: P2P.CycleCreatorTypes.CycleRecord) {
    for (const nodeInfo of record.leavingArchivers) {
        removeArchiver(nodeInfo);
    }
    for (const nodeInfo of record.joinedArchivers) {
        archivers.set(nodeInfo.publicKey, nodeInfo);
    }
}
export function addDataRecipient(nodeInfo: P2P.ArchiversTypes.JoinedArchiver, dataRequests: {
    dataRequestCycle?: number;
} | DataRequest<CycleRecord | StateMetaData>[], overrideLastSentCycle?: number) {
    if (config.p2p.experimentalSnapshot && config.features.archiverDataSubscriptionsUpdate) {
        if (!archiverDataSubscriptionsUpdateFeatureActivated) {
            for (const [key, value] of Object.entries(connectedSockets)) {
                removeArchiverConnection(key);
            }
            for (const [key, value] of recipients) {
                recipients.delete(key);
            }
            archiverDataSubscriptionsUpdateFeatureActivated = true;
        }
        const recipient = {
            nodeInfo,
            dataRequestCycle: dataRequests['dataRequestCycle'],
            curvePk: crypto.convertPublicKeyToCurve(nodeInfo.publicKey),
        };
        if (overrideLastSentCycle)
            lastSentCycle = overrideLastSentCycle;
        if (lastSentCycle > recipient.dataRequestCycle) {
            if (lastSentCycle - recipient.dataRequestCycle > 10)
                lastSentCycle = lastSentCycle - 10;
            else
                lastSentCycle = recipient.dataRequestCycle;
        }
        recipients.set(nodeInfo.publicKey, recipient);
        return;
    }
    const recipient = {
        nodeInfo,
        dataRequests: dataRequests,
        curvePk: crypto.convertPublicKeyToCurve(nodeInfo.publicKey),
    };
    recipients.set(nodeInfo.publicKey, recipient);
}
export function getArchiversList() {
    return [...archivers.values()];
}
async function forwardReceipts() {
    if (!config.p2p.experimentalSnapshot)
        return;
    let pingNeeded = true;
    const LEAST_LAST_PING_TIME_MS = 3000;
    if (config.p2p.instantForwardReceipts &&
        shardusGetTime() - stateManager.transactionQueue.receiptsForwardedTimestamp < LEAST_LAST_PING_TIME_MS) {
        pingNeeded = false;
    }
    const responses: any = {};
    responses.RECEIPT = [];
    const newArchiversToForward = [];
    const stillConnectedArchivers = [];
    for (const [publicKey, recipient] of recipients) {
        if (config.p2p.instantForwardReceipts)
            if (!lastTimeForwardedArchivers.includes(publicKey)) {
                newArchiversToForward.push(publicKey);
            }
            else
                stillConnectedArchivers.push(publicKey);
        if (pingNeeded)
            stateManager.transactionQueue.receiptsForwardedTimestamp = shardusGetTime();
        else
            continue;
        forwardDataToSubscribedArchivers(responses, publicKey, recipient);
    }
    if (config.p2p.instantForwardReceipts) {
        if (newArchiversToForward.length > 0) {
            const receipts = stateManager.transactionQueue.getReceiptsToForward();
            if (receipts && receipts.length > 0) {
                responses.RECEIPT = receipts;
                for (let publicKey of newArchiversToForward) {
                    const recipient = recipients.get(publicKey);
                    if (!recipient)
                        continue;
                    forwardDataToSubscribedArchivers(responses, publicKey, recipient);
                }
            }
        }
        lastTimeForwardedArchivers = [...newArchiversToForward, ...stillConnectedArchivers];
    }
    stateManager.transactionQueue.resetReceiptsToForward();
}
async function forwardDataToSubscribedArchivers(responses, publicKey, recipient) {
    const dataResponse: P2P.ArchiversTypes.DataResponse = {
        publicKey: crypto.getPublicKey(),
        responses,
        recipient: publicKey,
    };
    const taggedDataResponse = crypto.tag(dataResponse, recipient.curvePk);
    try {
        if (io.sockets.sockets[connectedSockets[publicKey]]) {
            io.sockets.sockets[connectedSockets[publicKey]].emit('DATA', Utils.safeStringify(taggedDataResponse));
        }
        else {
            warn(`Subscribed Archiver ${publicKey} is not connected over socket connection`);
            reportLostArchiver(publicKey, 'forwardDataToSubscribedArchivers() error');
        }
    }
    catch (e) {
        error('Run into issue in forwarding data', e);
        reportLostArchiver(publicKey, 'forwardDataToSubscribedArchivers() error');
    }
}
export async function instantForwardReceipts(receipts) {
    if (!config.p2p.experimentalSnapshot)
        return;
    const responses: any = {};
    responses.RECEIPT = [...receipts];
    for (const [publicKey, recipient] of recipients) {
        forwardDataToSubscribedArchivers(responses, publicKey, recipient);
    }
}
export async function instantForwardOriginalTxData(originalTxData) {
    if (!config.p2p.experimentalSnapshot)
        return;
    const responses: any = {};
    responses.ORIGINAL_TX_DATA = [originalTxData];
    for (const [publicKey, recipient] of recipients) {
        forwardDataToSubscribedArchivers(responses, publicKey, recipient);
    }
}
async function hasNetworkStopped(): Promise<boolean> {
    if (networkCheckInProgress)
        return;
    networkCheckInProgress = true;
    try {
        const shuffledArchivers = shuffleMapIterator(archivers);
        for (const archiver of shuffledArchivers) {
            const response: Result<{
                data: unknown;
            }, Error> = await getFromArchiver(archiver, '/nodelist', 'hasNetworkStopped() could not fetch nodelist');
            if (response.isOk() && response.value.data) {
                return false;
            }
            else if (response.isErr()) {
                warn(`hasNetworkStopped(): network error: ${response.error.message}`);
            }
        }
        return true;
    }
    finally {
        networkCheckInProgress = false;
    }
}
export interface InitialAccountsData {
    accounts: any[];
    receipts: any[];
}
export async function forwardAccounts(data: InitialAccountsData) {
    if (!config.p2p.experimentalSnapshot)
        return;
    const responses: any = {};
    responses.ACCOUNT = data;
    if (recipients.size === 0) {
    }
    for (const [publicKey, recipient] of recipients) {
        const dataResponse: P2P.ArchiversTypes.DataResponse = {
            publicKey: crypto.getPublicKey(),
            responses,
            recipient: publicKey,
        };
        const taggedDataResponse = crypto.tag(dataResponse, recipient.curvePk);
        try {
            if (io.sockets.sockets[connectedSockets[publicKey]]) {
                io.sockets.sockets[connectedSockets[publicKey]].emit('DATA', Utils.safeStringify(taggedDataResponse));
            }
        }
        catch (e) {
            error('Run into error in forwarding accounts', e);
            reportLostArchiver(publicKey, 'forwardAccounts() error');
        }
    }
}
export function removeDataRecipient(publicKey) {
    if (recipients.has(publicKey)) {
        recipients.delete(publicKey);
    }
    else {
    }
}
export function sendData() {
    const responses: P2P.ArchiversTypes.DataResponse['responses'] = {};
    if (config.p2p.experimentalSnapshot && config.features.archiverDataSubscriptionsUpdate) {
        if (recipients.size === 0) {
            lastSentCycle = CycleCreator.currentCycle;
            return;
        }
        const cycleRecords = getCycleChain(lastSentCycle + 1);
        const cyclesWithMarker = [];
        for (let i = 0; i < cycleRecords.length; i++) {
            cyclesWithMarker.push({
                ...cycleRecords[i],
                marker: computeCycleMarker(cycleRecords[i]),
            });
        }
        if (cyclesWithMarker.length > 0) {
            lastSentCycle = cyclesWithMarker[cyclesWithMarker.length - 1].counter;
        }
        responses.CYCLE = cyclesWithMarker;
        for (const [publicKey, recipient] of recipients) {
            const dataResponse: P2P.ArchiversTypes.DataResponse = {
                publicKey: crypto.getPublicKey(),
                responses,
                recipient: publicKey,
            };
            const taggedDataResponse = crypto.tag(dataResponse, recipient.curvePk);
            try {
                if (io.sockets.sockets[connectedSockets[publicKey]])
                    io.sockets.sockets[connectedSockets[publicKey]].emit('DATA', Utils.safeStringify(taggedDataResponse));
                else {
                    warn(`Subscribed Archiver ${publicKey} is not connected over socket connection`);
                    reportLostArchiver(publicKey, 'sendData() error');
                }
            }
            catch (e) {
                error('Run into issue in forwarding cycles data', e);
                reportLostArchiver(publicKey, 'sendData() error');
            }
        }
        return;
    }
    for (const [publicKey, recipient] of recipients) {
        const responses: P2P.ArchiversTypes.DataResponse['responses'] = {};
        for (const request of recipient.dataRequests) {
            switch (request.type) {
                case P2P.SnapshotTypes.TypeNames.CYCLE: {
                    const typedRequest = request as P2P.ArchiversTypes.DataRequest<P2P.SnapshotTypes.NamesToTypes['CYCLE']>;
                    const cycleRecords = getCycleChain(typedRequest.lastData + 1);
                    const cyclesWithMarker = [];
                    for (let i = 0; i < cycleRecords.length; i++) {
                        cyclesWithMarker.push({
                            ...cycleRecords[i],
                            marker: computeCycleMarker(cycleRecords[i]),
                        });
                    }
                    if (cyclesWithMarker.length > 0) {
                        typedRequest.lastData = cyclesWithMarker[cyclesWithMarker.length - 1].counter;
                    }
                    responses.CYCLE = cyclesWithMarker;
                    break;
                }
                case P2P.SnapshotTypes.TypeNames.STATE_METADATA: {
                    const typedRequest = request as P2P.ArchiversTypes.DataRequest<P2P.SnapshotTypes.NamesToTypes['STATE_METADATA']>;
                    const stateHashes = getStateHashes(typedRequest.lastData + 1);
                    const receiptHashes = getReceiptHashes(typedRequest.lastData + 1);
                    const summaryHashes = getSummaryHashes(typedRequest.lastData + 1);
                    if (stateHashes.length > 0) {
                        typedRequest.lastData = stateHashes[stateHashes.length - 1].counter;
                    }
                    const metadata: P2P.SnapshotTypes.StateMetaData = {
                        counter: typedRequest.lastData >= 0 ? typedRequest.lastData : 0,
                        stateHashes,
                        receiptHashes,
                        summaryHashes,
                    };
                    responses.STATE_METADATA = [metadata];
                    break;
                }
                default:
            }
        }
        const dataResponse: P2P.ArchiversTypes.DataResponse = {
            publicKey: crypto.getPublicKey(),
            responses,
            recipient: publicKey,
        };
        const taggedDataResponse = crypto.tag(dataResponse, recipient.curvePk);
        try {
            if (io.sockets.sockets[connectedSockets[publicKey]])
                io.sockets.sockets[connectedSockets[publicKey]].emit('DATA', Utils.safeStringify(taggedDataResponse));
            else {
                warn(`Subscribed Archiver ${publicKey} is not connected over socket connection`);
                reportLostArchiver(publicKey, 'sendData() error');
            }
        }
        catch (e) {
            error('Run into issue in forwarding cycles data', e);
            reportLostArchiver(publicKey, 'sendData() error');
        }
    }
}
export function getRefreshedArchivers(record) {
    let refreshedArchivers = getArchiversList();
    if (record.leavingArchivers) {
        for (const archiverInfo of record.leavingArchivers) {
            refreshedArchivers = refreshedArchivers.filter((archiver) => archiver.publicKey !== archiverInfo.publicKey);
        }
    }
    return refreshedArchivers;
}
export function addArchiverConnection(publicKey, socketId) {
    connectedSockets[publicKey] = socketId;
}
export function removeArchiverConnection(publicKey) {
    if (io.sockets.sockets[connectedSockets[publicKey]]) {
        io.sockets.sockets[connectedSockets[publicKey]].disconnect();
    }
    delete connectedSockets[publicKey];
}
export function registerRoutes() {
    network.registerExternalPost('joinarchiver', (req, res) => {
        const err = validateTypes(req, { body: 'o' });
        if (err) {
            warn(`joinarchiver: bad req ${err}`);
            res.json({ success: false, error: err });
            return;
        }
        const joinRequest = req.body;
        if (logFlags.p2pNonFatal)
            info(`Archiver join request received: ${Utils.safeStringify(joinRequest)}`);
        const accepted = addArchiverJoinRequest(joinRequest);
        if (!accepted.success) {
            warn('Archiver join request not accepted.');
            res.json({ success: false, error: `Archiver join request rejected! ${accepted.reason}` });
            return;
        }
        if (logFlags.p2pNonFatal)
            info('Archiver join request accepted!');
        res.json({ success: true });
        return;
    });
    network.registerExternalPost('leavingarchivers', (req, res) => {
        const err = validateTypes(req, { body: 'o' });
        if (err) {
            warn(`leavingarchivers: bad req ${err}`);
            res.json({ success: false, error: err });
            return;
        }
        const leaveRequest = req.body;
        if (logFlags.p2pNonFatal)
            info(`Archiver leave request received: ${Utils.safeStringify(leaveRequest)}`);
        const accepted = addLeaveRequest(leaveRequest);
        if (!accepted.success) {
            warn('Archiver leave request not accepted.');
            res.json({ success: false, error: `Archiver leave request rejected! ${accepted.reason}` });
            return;
        }
        if (logFlags.p2pNonFatal)
            info('Archiver leave request accepted!');
        res.json({ success: true });
        return;
    });
    Comms.registerGossipHandler('joinarchiver', async (payload, sender, tracker) => {
        try {
            const accepted = await addArchiverJoinRequest(payload, tracker, false);
            if (logFlags.console) {
            }
            if (!accepted.success)
                return warn('Archiver join request not accepted.');
            if (logFlags.p2pNonFatal)
                info('Archiver join request accepted!');
            Comms.sendGossip('joinarchiver', payload, tracker, sender, NodeList.byIdOrder, false);
        }
        finally {
        }
    });
    Comms.registerGossipHandler('leavingarchiver', async (payload, sender, tracker) => {
        if (payload === undefined || payload === null)
            return warn('Archiver leave payload empty.');
        if (sender === undefined || sender === null)
            return warn('Archiver leave sender empty.');
        if (tracker === undefined || tracker === null)
            return warn('Archiver leave tracker empty.');
        try {
            if (NodeList.nodes.get(sender) == null) {
                return warn('Archiver leave gossip came from invalid consensor');
            }
            const accepted = await addLeaveRequest(payload, tracker, false);
            if (!accepted.success)
                return warn('Archiver leave request not accepted.');
            if (logFlags.p2pNonFatal)
                info('Archiver leave request accepted!');
            Comms.sendGossip('leavingarchiver', payload, tracker, sender, NodeList.byIdOrder, false);
        }
        finally {
        }
    });
    network.registerExternalPost('requestdata', (req, res) => {
        let err = validateTypes(req, { body: 'o' });
        if (err) {
            if (logFlags.error)
                warn(`requestdata: bad req ${err}`);
            res.json({ success: false, error: err });
            return;
        }
        err = validateTypes(req.body, {
            tag: 's',
        });
        if (err) {
            if (logFlags.error)
                warn(`requestdata: bad req.body ${err}`);
            res.json({ success: false, error: err });
            return;
        }
        const dataRequest = req.body;
        if (logFlags.p2pNonFatal)
            info('dataRequest received', Utils.safeStringify(dataRequest));
        const foundArchiver = archivers.get(dataRequest.publicKey);
        if (!foundArchiver) {
            const archiverNotFoundErr = 'Archiver not found in list';
            if (logFlags.error)
                warn(archiverNotFoundErr);
            res.json({ success: false, error: archiverNotFoundErr });
            return;
        }
        const invalidTagErr = 'Tag is invalid';
        const archiverCurvePk = crypto.convertPublicKeyToCurve(foundArchiver.publicKey);
        if (!crypto.authenticate(dataRequest, archiverCurvePk)) {
            if (logFlags.error)
                warn(invalidTagErr);
            res.json({ success: false, error: invalidTagErr });
            return;
        }
        if (logFlags.p2pNonFatal)
            info('Tag in data request is valid');
        if (config.p2p.experimentalSnapshot && config.features.archiverDataSubscriptionsUpdate) {
            if (dataRequest.dataRequestType === DataRequestTypes.SUBSCRIBE) {
                if (dataRequest.nodeInfo && recipients.has(dataRequest.nodeInfo.publicKey)) {
                    removeArchiverConnection(dataRequest.nodeInfo.publicKey);
                    recipients.delete(dataRequest.nodeInfo.publicKey);
                }
                if (recipients.size >= config.p2p.maxArchiversSubscriptionPerNode) {
                    const maxArchiversSupportErr = 'Max archivers support reached';
                    warn(maxArchiversSupportErr);
                    res.json({ success: false, error: maxArchiversSupportErr });
                    return;
                }
                addDataRecipient(dataRequest.nodeInfo, dataRequest);
            }
            if (dataRequest.dataRequestType === DataRequestTypes.UNSUBSCRIBE) {
                removeDataRecipient(dataRequest.publicKey);
                removeArchiverConnection(dataRequest.publicKey);
            }
            res.json({ success: true });
            return;
        }
        delete dataRequest.publicKey;
        delete dataRequest.tag;
        const dataRequestCycle = dataRequest.dataRequestCycle;
        const dataRequestStateMetaData = dataRequest.dataRequestStateMetaData;
        const dataRequests = [];
        if (dataRequestCycle) {
            dataRequests.push(dataRequestCycle);
        }
        if (dataRequestStateMetaData) {
            dataRequests.push(dataRequestStateMetaData);
        }
        if (dataRequests.length > 0) {
            addDataRecipient(dataRequest.nodeInfo, dataRequests);
        }
        res.json({ success: true });
    });
    network.registerExternalPost('querydata', (req, res) => {
        let err = validateTypes(req, { body: 'o' });
        if (err) {
            warn(`querydata: bad req ${err}`);
            res.json({ success: false, error: err });
            return;
        }
        err = validateTypes(req.body, {
            publicKey: 's',
            tag: 's',
            nodeInfo: 'o',
        });
        if (err) {
            warn(`querydata: bad req.body ${err}`);
            res.json({ success: false, error: err });
            return;
        }
        const queryRequest = req.body;
        if (logFlags.p2pNonFatal)
            info('queryRequest received', Utils.safeStringify(queryRequest));
        const foundArchiver = archivers.get(queryRequest.publicKey);
        if (!foundArchiver) {
            const archiverNotFoundErr = 'Archiver not found in list';
            warn(archiverNotFoundErr);
            res.json({ success: false, error: archiverNotFoundErr });
            return;
        }
        delete queryRequest.publicKey;
        delete queryRequest.tag;
        let data: {
            [key: number]: StateManager.StateManagerTypes.ReceiptMapResult[] | StateManager.StateManagerTypes.StatsClump;
        };
        if (queryRequest.type === 'RECEIPT_MAP') {
            data = getReceiptMap(queryRequest.lastData);
        }
        else if (queryRequest.type === 'SUMMARY_BLOB') {
            data = getSummaryBlob(queryRequest.lastData);
        }
        res.json({ success: true, data: data });
    });
    network.registerExternalGet('archivers', (req, res) => {
        let archivers = getArchiversList();
        if (Self.isFirst && Self.isRestartNetwork && NodeList.nodes.size < 2)
            archivers = [...recipients.values()];
        res.json({ archivers });
    });
    network.registerExternalGet('joinedArchiver/:publicKey', ({ params: { publicKey } }, res) => {
        const isJoined = archivers.has(publicKey);
        res.json({ isJoined });
    });
    network.registerExternalGet('datarecipients', (req, res) => {
        res.json({ dataRecipients: [...recipients.values()] });
    });
}
export function sortedByPubKey(): P2P.ArchiversTypes.JoinedArchiver[] {
    return [...archivers.values()].sort((a, b) => a.publicKey > b.publicKey ? 1 : -1);
}
export function computeNewArchiverListHash(): hexstring {
    lastHashedList = clone(sortedByPubKey());
    if (logFlags.p2pNonFatal)
        info('hashing archiver list:', Utils.safeStringify(lastHashedList));
    const hash = crypto.hash(lastHashedList);
    if (logFlags.p2pNonFatal)
        info('the new archiver list hash is', hash);
    return hash;
}
export function getArchiverListHash(): hexstring | undefined {
    if (config.p2p.writeSyncProtocolV2 || config.p2p.useSyncProtocolV2) {
        if (logFlags.p2pNonFatal)
            info('returning archiver hash:', CycleChain.newest?.archiverListHash);
        return CycleChain.newest?.archiverListHash;
    }
    else {
        const archiverListIDs = [...archivers.keys()].sort();
        return crypto.hash(archiverListIDs);
    }
}
let lastHashedList: P2P.ArchiversTypes.JoinedArchiver[] = [];
export function getLastHashedArchiverList(): P2P.ArchiversTypes.JoinedArchiver[] {
    if (logFlags.p2pNonFatal)
        info('returning last hashed archiver list:', Utils.safeStringify(lastHashedList));
    return lastHashedList;
}
export function getFromArchiver<R>(archiver: ActiveNode, endpoint: string, failureReportMessage?: string, timeout?: number): ResultAsync<R, Error> {
    return ResultAsync.fromPromise(http.get(`http://${archiver.ip}:${archiver.port}/${endpoint}`, false, timeout ?? 1000), (e: Error) => {
        warn(`${archiver.ip}:${archiver.port} is unreachable`);
        reportLostArchiver(archiver.publicKey, failureReportMessage || `cannot GET archiver endpoint ${endpoint}`);
        return e;
    });
}
export function postToArchiver<B, R>(archiver: ActiveNode, endpoint: string, body?: B, timeout?: number, failureReportMessage?: string): ResultAsync<R, Error> {
    return ResultAsync.fromPromise(http.post(`http://${archiver.ip}:${archiver.port}/${endpoint}`, body, false, timeout), (e: Error) => {
        warn(`${archiver.ip}:${archiver.port} is unreachable`);
        reportLostArchiver(archiver.publicKey, failureReportMessage || `cannot POST archiver endpoint ${endpoint}`);
        return e;
    });
}
function info(...msg) {
    const entry = `Archiver: ${msg.join(' ')}`;
}
function warn(...msg) {
    const entry = `Archiver: ${msg.join(' ')}`;
    p2pLogger.warn(entry);
}
function error(...msg) {
    const entry = `Archiver: ${msg.join(' ')}`;
    p2pLogger.error(entry);
}