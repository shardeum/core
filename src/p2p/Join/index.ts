import deepmerge from 'deepmerge';
import { version } from '../../../package.json';
import * as http from '../../http';
import { logFlags } from '../../logger';
import { hexstring, P2P } from '@shardus/types';
import * as utils from '../../utils';
import { validateTypes, isEqualOrNewerVersion } from '../../utils';
import * as Comms from '../Comms';
import { config, crypto, logger, network, shardus } from '../Context';
import * as CycleChain from '../CycleChain';
import * as CycleCreator from '../CycleCreator';
import * as NodeList from '../NodeList';
import * as Self from '../Self';
import { getOurNodeIndex, robustQuery } from '../Utils';
import { isBogonIP, isInvalidIP, isIPv6 } from '../../utils/functions/checkIP';
import { nestedCountersInstance } from '../../utils/nestedCounters';
import { Logger } from 'log4js';
import { calculateToAcceptV2 } from '../ModeSystemFuncs';
import { routes } from './routes';
import { debugDumpJoinRequestList, drainNewJoinRequests, getLastHashedStandbyList, getStandbyNodesInfoMap, saveJoinRequest, standbyNodesInfoHashes, } from './v2';
import { err, ok, Result } from 'neverthrow';
import { drainSelectedPublicKeys, forceSelectSelf } from './v2/select';
import { deleteStandbyNode, drainNewUnjoinRequests, processNewUnjoinRequest } from './v2/unjoin';
import { JoinRequest } from '@shardus/types/build/src/p2p/JoinTypes';
import { updateNodeState } from '../Self';
import { HTTPError } from 'got';
import { drainLostAfterSelectionNodes, drainSyncStarted, lostAfterSelection, addSyncStarted, } from './v2/syncStarted';
import { addFinishedSyncing, drainFinishedSyncingRequest, newSyncFinishedNodes } from './v2/syncFinished';
import { drainNewStandbyRefreshRequests, addStandbyRefresh } from './v2/standbyRefresh';
import rfdc from 'rfdc';
import { Utils } from '@shardus/types';
import { neverGoActive } from '../Active';
let p2pLogger: Logger;
let mainLogger: Logger;
const clone = rfdc();
let requests: P2P.JoinTypes.JoinRequest[];
let seen: Set<P2P.P2PTypes.Node['publicKey']>;
let queuedReceivedJoinRequests: JoinRequest[] = [];
let queuedJoinRequestsForGossip: JoinRequest[] = [];
let queuedStartedSyncingId: string;
let queuedFinishedSyncingId: string;
let queuedStandbyRefreshPubKeys: string[] = [];
let queuedUnjoinRequestsForNextCycle: P2P.JoinTypes.SignedUnjoinRequest[] = [];
let queuedUnjoinRequestsForThisCycle: P2P.JoinTypes.SignedUnjoinRequest[] = [];
let cyclesToDelaySyncStarted = -1;
let cyclesToDelaySyncFinished = -1;
let lastLoggedCycle = 0;
let allowBogon = false;
export function setAllowBogon(value: boolean): void {
    allowBogon = value;
}
export function getAllowBogon(): boolean {
    return allowBogon;
}
let mode = null;
export let finishedSyncingCycle = -1;
export function init(): void {
    p2pLogger = logger.getLogger('p2p');
    mainLogger = logger.getLogger('main');
    reset();
    for (const route of routes.external) {
        network._registerExternal(route.method, route.name, route.handler);
    }
    for (const [name, handler] of Object.entries(routes.gossip)) {
        Comms.registerGossipHandler(name, handler);
    }
}
export function reset(): void {
    requests = [];
    seen = new Set();
}
export function getNodeRequestingJoin(): P2P.P2PTypes.P2PNode[] {
    const nodes: P2P.P2PTypes.P2PNode[] = [];
    for (const request of requests) {
        if (request && request.nodeInfo) {
            nodes.push(request.nodeInfo);
        }
    }
    return nodes;
}
export function calculateToAccept(): number {
    const desired = CycleChain.newest.desired;
    const active = CycleChain.newest.active;
    let maxJoin = config.p2p.maxJoinedPerCycle;
    const syncing = NodeList.byJoinOrder.length - active;
    const expired = CycleChain.newest.expired;
    maxJoin = Math.floor(maxJoin * CycleCreator.scaleFactor);
    let syncMax = CycleChain.newest.safetyMode === true
        ? CycleChain.newest.safetyNum
        : Math.floor(config.p2p.maxSyncingPerCycle * CycleCreator.scaleFactor * CycleCreator.scaleFactorSyncBoost);
    if (active === 0 && config.p2p.firstCycleJoin) {
        maxJoin = Math.max(config.p2p.firstCycleJoin, maxJoin);
        syncMax += config.p2p.firstCycleJoin;
    }
    if (CycleChain.newest.counter < 10 && config.p2p.firstCycleJoin) {
        syncMax += config.p2p.firstCycleJoin;
    }
    if (active > 0) {
        const syncMaxLimit = 150;
        if (syncMax > syncMaxLimit) {
            syncMax = syncMaxLimit;
        }
    }
    const canSync = syncMax - syncing;
    let needed = 0;
    if (desired > 0) {
        needed = desired - (active + syncing);
    }
    if (config.p2p.maxRotatedPerCycle > 0) {
        const maxToLeave = Math.min(expired, config.p2p.maxRotatedPerCycle);
        needed += maxToLeave;
    }
    if (needed > canSync) {
        needed = canSync;
    }
    if (needed > maxJoin) {
        needed = maxJoin;
    }
    if (needed < 0) {
        needed = 0;
    }
    const cycle = CycleChain.newest.counter;
    if (cycle > lastLoggedCycle) {
        lastLoggedCycle = cycle;
        info('scale dump:' +
            Utils.safeStringify({
                cycle,
                scaleFactor: CycleCreator.scaleFactor,
                needed,
                desired,
                active,
                syncing,
                canSync,
                syncMax,
                maxJoin,
                expired,
                scaleFactorSyncBoost: CycleCreator.scaleFactorSyncBoost,
            }));
    }
    return needed;
}
export function getTxs(): P2P.JoinTypes.Txs {
    return {
        standbyAdd: drainNewJoinRequests(),
        startedSyncing: drainSyncStarted(),
        finishedSyncing: drainFinishedSyncingRequest(),
        standbyRefresh: drainNewStandbyRefreshRequests(),
        standbyRemove: drainNewUnjoinRequests(),
    };
}
export function validateRecordTypes(rec: P2P.JoinTypes.Record): string {
    let err = validateTypes(rec, { syncing: 'n', joinedConsensors: 'a' });
    if (err)
        return err;
    for (const item of rec.joinedConsensors) {
        err = validateTypes(item, {
            activeTimestamp: 'n',
            address: 's',
            externalIp: 's',
            externalPort: 'n',
            internalIp: 's',
            internalPort: 'n',
            joinRequestTimestamp: 'n',
            publicKey: 's',
            cycleJoined: 's',
            counterRefreshed: 'n',
            id: 's',
        });
        if (err)
            return 'in joinedConsensors array ' + err;
    }
    return '';
}
export function dropInvalidTxs(txs: P2P.JoinTypes.Txs): P2P.JoinTypes.Txs {
    return {
        standbyAdd: txs.standbyAdd,
        startedSyncing: [],
        finishedSyncing: [],
        standbyRefresh: [],
        standbyRemove: [],
    };
}
export function updateRecord(txs: P2P.JoinTypes.Txs, record: P2P.CycleCreatorTypes.CycleRecord): void {
    record.syncing = NodeList.syncingByIdOrder.length;
    record.standbyAdd = [];
    record.standbyRemove = [];
    record.startedSyncing = [];
    record.lostAfterSelection = [];
    record.finishedSyncing = [];
    record.standbyRefresh = [];
    record.standbyAdd = [];
    if (config.p2p.useJoinProtocolV2) {
        for (const request of txs.standbyAdd) {
            record.standbyAdd.push(request);
        }
        for (const request of txs.startedSyncing) {
            const publicKey = request.sign.owner;
            const node = NodeList.byPubKey.get(publicKey);
            if (node) {
                record.startedSyncing.push(request.nodeId);
            }
            else {
                if (logFlags.important_as_error)
                    warn(`join:updateRecord:startedSyncing: node not found: ${publicKey}`);
            }
        }
        record.syncing += record.startedSyncing.length;
        for (const nodeId of drainLostAfterSelectionNodes()) {
            record.lostAfterSelection.push(nodeId);
        }
        for (const request of txs.finishedSyncing) {
            const publicKey = request.sign.owner;
            const node = NodeList.byPubKey.get(publicKey);
            if (node) {
                record.finishedSyncing.push(request.nodeId);
            }
            else {
                if (logFlags.important_as_error)
                    warn(`join:updateRecord:finishedSyncing: node not found: ${publicKey}`);
            }
        }
        for (const request of txs.standbyRefresh) {
            const publicKey = request.sign.owner;
            const node = getStandbyNodesInfoMap().get(publicKey);
            if (node) {
                record.standbyRefresh.push(request.publicKey);
            }
            else {
                if (logFlags.important_as_error)
                    warn(`join:updateRecord:standbyRefresh: node not found: ${publicKey}`);
            }
        }
        let standbyRemoved_Age = 0;
        let standbyRemoved_App = 0;
        let skipped = 0;
        const standbyListMap = getStandbyNodesInfoMap();
        const standbyList = getLastHashedStandbyList();
        if (config.p2p.standbyAgeScrub) {
            for (const joinRequest of standbyList) {
                const lastRefreshed = joinRequest.nodeInfo.refreshedCounter;
                if (record.counter - lastRefreshed >= config.p2p.standbyListCyclesTTL) {
                    if (standbyListMap.has(joinRequest.nodeInfo.publicKey) === false) {
                        skipped++;
                        continue;
                    }
                    if (record.standbyRefresh.includes(joinRequest.nodeInfo.publicKey)) {
                        skipped++;
                        continue;
                    }
                    record.standbyRemove.push(joinRequest.nodeInfo.publicKey);
                    standbyRemoved_Age++;
                    if (standbyRemoved_Age >= config.p2p.standbyListMaxRemoveTTL) {
                        break;
                    }
                }
            }
        }
        if (config.p2p.standbyVersionScrub) {
            for (const joinRequest of standbyList) {
                const key = joinRequest.nodeInfo.publicKey;
                if (standbyListMap.has(key) === false) {
                    skipped++;
                    continue;
                }
                const { canStay, reason } = shardus.app.canStayOnStandby(joinRequest);
                if (canStay === false) {
                    record.standbyRemove.push(key);
                    standbyRemoved_App++;
                    if (standbyRemoved_App >= config.p2p.standbyListMaxRemoveTTL) {
                        break;
                    }
                }
            }
            if (config.p2p.enableMaxStandbyCount) {
                const effectiveStandbyListSize = standbyList.length - record.standbyRemove.length;
                if (effectiveStandbyListSize > config.p2p.maxStandbyCount) {
                    const nodesToRemoveCount = effectiveStandbyListSize - config.p2p.maxStandbyCount;
                    const standbyRemoveSet = new Set(record.standbyRemove);
                    let removeCount = 0;
                    for (let i = standbyList.length - 1; i >= 0 && removeCount < nodesToRemoveCount; i--) {
                        const node = standbyList[i];
                        if (!standbyRemoveSet.has(node.nodeInfo.publicKey)) {
                            record.standbyRemove.push(node.nodeInfo.publicKey);
                            standbyRemoveSet.add(node.nodeInfo.publicKey);
                            removeCount++;
                        }
                    }
                }
            }
            if (logFlags.p2pNonFatal)
                debugDumpJoinRequestList(standbyList, `join.updateRecord: last-hashed ${record.counter}`);
            if (logFlags.p2pNonFatal)
                debugDumpJoinRequestList(Array.from(getStandbyNodesInfoMap().values()), `join.updateRecord: standby-map ${record.counter}`);
        }
        record.standbyAdd.sort((a, b) => (a.nodeInfo.publicKey > b.nodeInfo.publicKey ? 1 : -1));
        record.standbyRemove.sort();
        record.standbyRefresh.sort();
        record.finishedSyncing.sort();
        const selectedPublicKeys = drainSelectedPublicKeys();
        record.joinedConsensors = record.joinedConsensors || [];
        for (const publicKey of selectedPublicKeys) {
            const standbyInfo = getStandbyNodesInfoMap().get(publicKey);
            if (!standbyInfo)
                continue;
            const { nodeInfo, cycleMarker: cycleJoined } = standbyInfo;
            const id = computeNodeId(nodeInfo.publicKey, standbyInfo.cycleMarker);
            const counterRefreshed = record.counter;
            record.joinedConsensors.push({ ...nodeInfo, cycleJoined, counterRefreshed, id });
        }
        record.joinedConsensors.sort();
        for (const signedUnjoinRequest of txs.standbyRemove) {
            const nodeIfSelectedLastCycle = CycleChain.newest.joinedConsensors.find((node) => node.publicKey === signedUnjoinRequest.publicKey);
            const nodeIfSelectedThisCycle = record.joinedConsensors.find((node) => node.publicKey === signedUnjoinRequest.publicKey);
            if (nodeIfSelectedLastCycle) {
                record.apoptosized.push(nodeIfSelectedLastCycle.id);
            }
            else if (nodeIfSelectedThisCycle) {
                record.apoptosized.push(nodeIfSelectedThisCycle.id);
            }
            else {
                record.standbyRemove.push(signedUnjoinRequest.publicKey);
            }
        }
        if (CycleCreator.currentQuarter === 3) {
            queuedJoinRequestsForGossip = queuedReceivedJoinRequests;
            queuedReceivedJoinRequests = [];
        }
    }
    else {
        record.joinedConsensors = txs.standbyAdd
            .map((joinRequest) => {
            const { nodeInfo, cycleMarker: cycleJoined } = joinRequest;
            const id = computeNodeId(nodeInfo.publicKey, cycleJoined);
            const counterRefreshed = record.counter;
            return { ...nodeInfo, cycleJoined, counterRefreshed, id };
        })
            .sort();
    }
}
export function parseRecord(record: P2P.CycleCreatorTypes.CycleRecord): P2P.CycleParserTypes.Change {
    const added = record.joinedConsensors;
    const removed = [];
    const finishedSyncing = record.finishedSyncing;
    for (const node of added) {
        node.syncingTimestamp = record.start;
        const publicKey = node.publicKey;
        deleteStandbyNode(publicKey);
    }
    if (added.length > 0) {
        if (logFlags.p2pNonFatal)
            debugDumpJoinRequestList(Array.from(getStandbyNodesInfoMap().values()), `join.parseRecord: standby-map ${record.counter} some activated:${record.counter}`);
    }
    const updated: P2P.NodeListTypes.Update[] = [];
    if (record.startedSyncing.includes(Self.id)) {
        Self.updateNodeState(P2P.P2PTypes.NodeStatus.SYNCING);
    }
    for (const nodeId of record.startedSyncing) {
        if (NodeList.selectedById.has(nodeId)) {
            updated.push({
                id: nodeId,
                status: P2P.P2PTypes.NodeStatus.SYNCING,
            });
        }
    }
    if (finishedSyncing.includes(Self.id)) {
        Self.updateNodeState(P2P.P2PTypes.NodeStatus.READY);
    }
    for (const node of finishedSyncing) {
        updated.push({
            id: node,
            status: P2P.P2PTypes.NodeStatus.READY,
            readyTimestamp: record.start,
        });
    }
    const standbyMap = getStandbyNodesInfoMap();
    for (const refreshedPubKey of record.standbyRefresh) {
        if (standbyMap.has(refreshedPubKey) === false)
            continue;
        const refreshedStandbyInfo = standbyMap.get(refreshedPubKey);
        refreshedStandbyInfo.nodeInfo.refreshedCounter = record.counter;
        standbyNodesInfoHashes.set(refreshedPubKey, crypto.hash(refreshedStandbyInfo));
    }
    const addedIds = added.map((node) => node.id);
    if (config.p2p.hardenNewSyncingProtocol) {
        for (const [nodeId, cycleNumber] of NodeList.selectedById) {
            if (addedIds.includes(nodeId)) {
                continue;
            }
            else if (record.counter > cycleNumber + config.p2p.cyclesToWaitForSyncStarted) {
                if (record.startedSyncing.includes(nodeId))
                    continue;
                if (record.finishedSyncing.includes(nodeId))
                    continue;
                lostAfterSelection.push(nodeId);
            }
        }
        for (const nodeId of record.lostAfterSelection) {
            removed.push(nodeId);
        }
        return {
            added,
            removed,
            updated,
        };
    }
    else {
        for (const [nodeId, cycleNumber] of NodeList.selectedById) {
            if (addedIds.includes(nodeId)) {
                continue;
            }
            else if (record.counter > cycleNumber + config.p2p.cyclesToWaitForSyncStarted) {
                lostAfterSelection.push(nodeId);
            }
        }
        return {
            added,
            removed: [...lostAfterSelection],
            updated,
        };
    }
}
export function sendRequests(): void {
    if (queuedStartedSyncingId) {
        const syncStartedTx: P2P.JoinTypes.StartedSyncingRequest = crypto.sign({
            nodeId: queuedStartedSyncingId,
            cycleNumber: CycleChain.newest.counter,
        });
        queuedStartedSyncingId = undefined;
        if (addSyncStarted(syncStartedTx).success === true) {
            Comms.sendGossip('gossip-sync-started', syncStartedTx, '', null, nodeListFromStates([
                P2P.P2PTypes.NodeStatus.ACTIVE,
                P2P.P2PTypes.NodeStatus.READY,
                P2P.P2PTypes.NodeStatus.SYNCING,
            ]), true);
        }
        else {
        }
    }
    if (queuedFinishedSyncingId) {
        const syncFinishedTx: P2P.JoinTypes.FinishedSyncingRequest = crypto.sign({
            nodeId: queuedFinishedSyncingId,
            cycleNumber: CycleChain.newest.counter,
        });
        queuedFinishedSyncingId = undefined;
        if (addFinishedSyncing(syncFinishedTx).success === true) {
            Comms.sendGossip('gossip-sync-finished', syncFinishedTx, '', null, nodeListFromStates([
                P2P.P2PTypes.NodeStatus.ACTIVE,
                P2P.P2PTypes.NodeStatus.READY,
                P2P.P2PTypes.NodeStatus.SYNCING,
            ]), true);
        }
        else {
        }
    }
    if (queuedStandbyRefreshPubKeys.length > 0) {
        for (const standbyRefreshPubKey of queuedStandbyRefreshPubKeys) {
            const standbyRefreshTx: P2P.JoinTypes.StandbyRefreshRequest = crypto.sign({
                publicKey: standbyRefreshPubKey,
                cycleNumber: CycleChain.newest.counter,
            });
            const standbyRefreshResult = addStandbyRefresh(standbyRefreshTx);
            if (standbyRefreshResult.success === true) {
                Comms.sendGossip('gossip-standby-refresh', standbyRefreshTx, '', null, nodeListFromStates([
                    P2P.P2PTypes.NodeStatus.ACTIVE,
                    P2P.P2PTypes.NodeStatus.READY,
                    P2P.P2PTypes.NodeStatus.SYNCING,
                ]), true);
            }
            else {
            }
        }
        queuedStandbyRefreshPubKeys = [];
    }
    if (queuedJoinRequestsForGossip.length > 0) {
        for (const joinRequest of queuedJoinRequestsForGossip) {
            const selectionNumResult = computeSelectionNum(joinRequest);
            if (selectionNumResult.isErr()) {
                if (logFlags.p2pNonFatal)
                    console.error(`join:sendRequests: failed to compute selection number for node ${joinRequest.nodeInfo.publicKey}:`, JSON.stringify(selectionNumResult.error));
                return;
            }
            joinRequest.selectionNum = selectionNumResult.value;
            if (seen.has(joinRequest.nodeInfo.publicKey) === false) {
                seen.add(joinRequest.nodeInfo.publicKey);
                saveJoinRequest(joinRequest);
            }
            const signedObjectWithJoinRequest = crypto.sign({ joinRequest, sign: null });
            Comms.sendGossip('gossip-valid-join-requests', signedObjectWithJoinRequest, '', null, nodeListFromStates([
                P2P.P2PTypes.NodeStatus.ACTIVE,
                P2P.P2PTypes.NodeStatus.READY,
                P2P.P2PTypes.NodeStatus.SYNCING,
            ]), true);
        }
        queuedJoinRequestsForGossip = [];
    }
    if (queuedUnjoinRequestsForThisCycle.length > 0) {
        for (const unjoinRequest of queuedUnjoinRequestsForThisCycle) {
            const processResult = processNewUnjoinRequest(unjoinRequest);
            if (processResult.isErr()) {
                if (logFlags.p2pNonFatal)
                    console.error(`join:sendRequests: will not gossip to network; failed to process unjoin request for node ${unjoinRequest.publicKey}:`, JSON.stringify(processResult.error));
                return;
            }
            Comms.sendGossip('gossip-unjoin', unjoinRequest, '', null, nodeListFromStates([
                P2P.P2PTypes.NodeStatus.ACTIVE,
                P2P.P2PTypes.NodeStatus.READY,
                P2P.P2PTypes.NodeStatus.SYNCING,
            ]), true);
        }
    }
    return;
}
export function queueRequest(): void {
    return;
}
export async function queueStartedSyncingRequest(): Promise<void> {
    if (Self.isFirst === false && config.debug.startedSyncingDelay > 0) {
        await utils.sleep(config.debug.startedSyncingDelay * 1000);
    }
    queuedStartedSyncingId = Self.id;
}
export async function queueFinishedSyncingRequest(): Promise<void> {
    if (neverGoActive)
        return;
    if (Self.isFirst === false && config.debug.finishedSyncingDelay > 0) {
        await utils.sleep(config.debug.finishedSyncingDelay * 1000);
    }
    queuedFinishedSyncingId = Self.id;
    finishedSyncingCycle = CycleCreator.currentCycle;
}
export function queueStandbyRefreshRequest(publicKey: string): void {
    queuedStandbyRefreshPubKeys.push(publicKey);
}
export function queueJoinRequest(joinRequest: JoinRequest): void {
    queuedReceivedJoinRequests.push(joinRequest);
}
export function queueUnjoinRequest(unjoinRequest: P2P.JoinTypes.SignedUnjoinRequest): void {
    queuedUnjoinRequestsForNextCycle.push(unjoinRequest);
}
export async function createJoinRequest(cycleRecord: P2P.CycleCreatorTypes.CycleRecord): Promise<P2P.JoinTypes.JoinRequest & P2P.P2PTypes.SignedObject> {
    const cycleMarker = cycleRecord.previous ?? '0'.repeat(64);
    const nodeInfo = Self.getThisNodeInfo();
    nodeInfo.refreshedCounter = cycleRecord.counter ?? 0;
    const proofOfWork = {
        compute: await crypto.getComputeProofOfWork(cycleMarker, config.p2p.difficulty),
    };
    const joinReq = {
        nodeInfo,
        cycleMarker,
        proofOfWork: Utils.safeStringify(proofOfWork),
        version,
        selectionNum: undefined,
    };
    if (typeof shardus.app.getJoinData === 'function') {
        try {
            const appJoinData = shardus.app.getJoinData();
            if (appJoinData) {
                joinReq['appJoinData'] = appJoinData;
            }
        }
        catch (e) {
            if (logFlags.important_as_fatal)
                warn(`shardus.app.getJoinData failed due to ${utils.formatErrorMessage(e)}`);
            return;
        }
    }
    const signedJoinReq = crypto.sign(joinReq);
    if (logFlags.p2pNonFatal)
        info(`Join request created... Join request: ${Utils.safeStringify(signedJoinReq)}`);
    return signedJoinReq;
}
export interface JoinRequestResponse {
    success: boolean;
    reason: string;
    fatal: boolean;
}
export function addJoinRequest(joinRequest: P2P.JoinTypes.JoinRequest): JoinRequestResponse {
    if (Self.p2pIgnoreJoinRequests === true) {
        if (logFlags.p2pNonFatal)
            info(`Join request ignored. p2pIgnoreJoinRequests === true`);
        return {
            success: false,
            fatal: false,
            reason: `Join request ignored. p2pIgnoreJoinRequests === true`,
        };
    }
    const response = validateJoinRequest(joinRequest);
    if (response) {
        return response;
    }
    if (logFlags.p2pNonFatal)
        info(`Got join request for ${joinRequest.nodeInfo.externalIp}:${joinRequest.nodeInfo.externalPort}`);
    if (!config.p2p.useJoinProtocolV2) {
        return decideNodeSelection(joinRequest);
    }
    else {
        return {
            success: false,
            reason: 'Join Protocol v2 is enabled and selection will happen eventually. Wait your turn!',
            fatal: false,
        };
    }
}
export async function firstJoin(): Promise<string> {
    let marker: string;
    let record: P2P.CycleCreatorTypes.CycleRecord;
    if (CycleChain.newest) {
        marker = CycleChain.newest['previous'];
        record = CycleChain.newest;
    }
    else {
        const zeroMarker = '0'.repeat(64);
        const zeroRecord = {};
        marker = zeroMarker;
        record = zeroRecord as P2P.CycleCreatorTypes.CycleRecord;
    }
    const request = await createJoinRequest(record);
    utils.insertSorted(requests, request);
    if (config.p2p.useJoinProtocolV2) {
        saveJoinRequest(request, true);
        forceSelectSelf();
    }
    return computeNodeId(crypto.keypair.publicKey, marker);
}
export async function submitJoinV2(nodes: P2P.P2PTypes.Node[], joinRequest: P2P.JoinTypes.JoinRequest & P2P.P2PTypes.SignedObject): Promise<void> {
    const selectedNodes = utils.getRandom(nodes, Math.min(nodes.length, 5));
    const promises = [];
    if (logFlags.important_as_fatal)
        info(`submitJoinV2: selectedNodes: Sent join request to ${selectedNodes.map((n) => `${n.ip}:${n.port}`)}`);
    if (config.p2p.dynamicBogonFiltering && config.p2p.forceBogonFilteringOn === false) {
        if (nodes.some((node) => isBogonIP(node.ip))) {
            allowBogon = true;
        }
    }
    if (config.p2p.rejectBogonOutboundJoin || config.p2p.forceBogonFilteringOn) {
        if (allowBogon === false) {
            if (isBogonIP(joinRequest.nodeInfo.externalIp)) {
                throw new Error(`Fatal: Node cannot join with bogon external IP: ${joinRequest.nodeInfo.externalIp}`);
            }
        }
        else {
            if (isInvalidIP(joinRequest.nodeInfo.externalIp)) {
                throw new Error(`Fatal: Node cannot join with invalid external IP: ${joinRequest.nodeInfo.externalIp}`);
            }
        }
    }
    for (const node of selectedNodes) {
        try {
            const postPromise = http.post(`${node.ip}:${node.port}/join`, joinRequest, false, 5000);
            promises.push(postPromise);
        }
        catch (err) {
            if (logFlags.important_as_fatal)
                error(`submitJoin: Error posting join request to ${node.ip}:${node.port}: Error: ${utils.formatErrorMessage(err)}`);
        }
    }
    const responses = await Promise.all(promises);
    const errs = [];
    let goodCount = 0;
    let unreachable = 0;
    for (const res of responses) {
        if (logFlags.important_as_fatal)
            info(`Join Request Response: ${Utils.safeStringify(res)}`);
        if (res && res.fatal) {
            errs.push(res);
            if (res.reason && res.reason.startsWith('IP or Port is not reachable')) {
                unreachable++;
            }
        }
        if (res && res.success === true) {
            goodCount++;
        }
    }
    if (unreachable >= 2) {
        throw new Error(`Fatal: submitJoin: our node was reported to not be reachable by 2 or more nodes ${unreachable}`);
    }
    if (errs.length >= responses.length) {
        throw new Error(`Fatal: submitJoin: All join requests failed: ${errs.map((e) => e.reason).join(', ')}`);
    }
    if (goodCount === 0) {
        if (logFlags.important_as_fatal)
            info(`submitJoin: no join success repsonses: ${responses.map((e) => e.reason).join(', ')}`);
    }
}
export async function fetchJoined(activeNodes: P2P.P2PTypes.Node[]): Promise<string> {
    const queryFn = async (node: P2P.P2PTypes.Node): Promise<{
        node: P2P.NodeListTypes.Node;
    }> => {
        const publicKey = crypto.keypair.publicKey;
        const res: {
            node: P2P.NodeListTypes.Node;
        } = await http.get(`${node.ip}:${node.port}/joined/${publicKey}`);
        return res;
    };
    try {
        const { topResult: response } = await robustQuery<P2P.P2PTypes.Node, {
            node: P2P.NodeListTypes.Node;
        }>(activeNodes, queryFn);
        if (!response)
            return;
        if (!response.node)
            return;
        let err = utils.validateTypes(response, { node: 'o' });
        if (err) {
            if (logFlags.important_as_fatal)
                warn('fetchJoined invalid response response.node' + err);
            return;
        }
        err = validateTypes(response.node, { id: 's' });
        if (err) {
            if (logFlags.important_as_fatal)
                warn('fetchJoined invalid response response.node.id' + err);
            return;
        }
        return response.node.id;
    }
    catch (err) {
        if (logFlags.important_as_fatal)
            warn('Self: fetchNodeId: robustQuery failed: ', err);
    }
}
export async function fetchJoinedV2(activeNodes: P2P.P2PTypes.Node[]): Promise<{
    id: string | undefined;
    isOnStandbyList: boolean;
}> {
    const queryFn = async (node: P2P.P2PTypes.Node): Promise<{
        id: string | undefined;
        isOnStandbyList: boolean;
    }> => {
        const publicKey = crypto.keypair.publicKey;
        const res: {
            id: string | undefined;
            isOnStandbyList: boolean;
        } = await http.get(`${node.ip}:${node.port}/joinedV2/${publicKey}`);
        return res;
    };
    try {
        const { topResult: response } = await robustQuery<P2P.P2PTypes.Node, {
            id: string | undefined;
            isOnStandbyList: boolean;
        }>(activeNodes, queryFn);
        if (!response)
            return;
        if (!response.id) {
            return { id: undefined, isOnStandbyList: response.isOnStandbyList };
        }
        let err = utils.validateTypes(response, { id: 's' });
        if (err) {
            if (logFlags.important_as_fatal)
                warn('fetchJoined invalid response response.id' + err);
            return;
        }
        err = validateTypes(response, { isOnStandbyList: 'b' });
        if (err) {
            if (logFlags.important_as_fatal)
                warn('fetchJoined invalid response response.isOnStandbyList' + err);
            return;
        }
        return { id: response.id, isOnStandbyList: response.isOnStandbyList };
    }
    catch (err) {
        if (logFlags.important_as_fatal)
            warn('Self: fetchNodeId: robustQuery failed: ', utils.formatErrorMessage(err));
    }
}
export function validateJoinRequest(joinRequest: P2P.JoinTypes.JoinRequest): JoinRequestResponse | null {
    return (verifyJoinRequestTypes(joinRequest) ||
        validateVersion(joinRequest.version) ||
        verifyJoinRequestSigner(joinRequest) ||
        verifyNotIPv6(joinRequest) ||
        validateJoinRequestHost(joinRequest) ||
        verifyUnseen(joinRequest.nodeInfo.publicKey) ||
        verifyNodeUnknown(joinRequest.nodeInfo) ||
        validateJoinRequestTimestamp(joinRequest.nodeInfo.joinRequestTimestamp));
}
function validateJoinRequestHost(joinRequest: P2P.JoinTypes.JoinRequest): JoinRequestResponse | null {
    try {
        if (allowBogon === false) {
            if (isBogonIP(joinRequest.nodeInfo.externalIp)) {
                if (logFlags.p2pNonFatal)
                    warn('Got join request from Bogon IP');
                return {
                    success: false,
                    reason: `Bad ip, bogon ip not accepted`,
                    fatal: true,
                };
            }
        }
        else {
            if (isInvalidIP(joinRequest.nodeInfo.externalIp)) {
                if (logFlags.p2pNonFatal)
                    warn('Got join request from invalid reserved IP');
                return {
                    success: false,
                    reason: `Bad ip, reserved ip not accepted`,
                    fatal: true,
                };
            }
        }
    }
    catch (er) {
    }
    return null;
}
export function computeNodeId(publicKey: string, cycleMarker: string): string {
    const obj = { publicKey, cycleMarker };
    const nodeId = crypto.hash(obj);
    if (logFlags.p2pNonFatal) {
        info(`Node ID computation: publicKey: ${publicKey}, cycleMarker: ${cycleMarker}`);
        info(`Node ID is: ${nodeId}`);
    }
    return nodeId;
}
export function verifyJoinRequestTypes(joinRequest: P2P.JoinTypes.JoinRequest): JoinRequestResponse | null {
    let err = utils.validateTypes(joinRequest, {
        cycleMarker: 's',
        nodeInfo: 'o',
        sign: 'o',
        version: 's',
    });
    if (err) {
        if (logFlags.p2pNonFatal)
            warn('join bad joinRequest ' + err);
        return {
            success: false,
            reason: `Bad join request object structure`,
            fatal: true,
        };
    }
    err = utils.validateTypes(joinRequest.nodeInfo, {
        activeTimestamp: 'n',
        address: 's',
        externalIp: 's',
        externalPort: 'n',
        internalIp: 's',
        internalPort: 'n',
        joinRequestTimestamp: 'n',
        publicKey: 's',
    });
    if (err) {
        if (logFlags.p2pNonFatal)
            warn('join bad joinRequest.nodeInfo ' + err);
        return {
            success: false,
            reason: 'Bad nodeInfo object structure within join request',
            fatal: true,
        };
    }
    err = utils.validateTypes(joinRequest.sign, { owner: 's', sig: 's' });
    if (err) {
        if (logFlags.p2pNonFatal)
            warn('join bad joinRequest.sign ' + err);
        return {
            success: false,
            reason: 'Bad signature object structure within join request',
            fatal: true,
        };
    }
    return null;
}
function verifyNodeUnknown(nodeInfo: P2P.P2PTypes.P2PNode): JoinRequestResponse | null {
    if (NodeList.byPubKey.has(nodeInfo.publicKey)) {
        const message = 'Cannot add join request for this node, already a known node (by public key).';
        if (logFlags.p2pNonFatal)
            warn(message);
        return {
            success: false,
            reason: message,
            fatal: false,
        };
    }
    const ipPort = NodeList.ipPort(nodeInfo.internalIp, nodeInfo.internalPort);
    if (NodeList.byIpPort.has(ipPort)) {
        const message = 'Cannot add join request for this node, already a known node (by IP address).';
        if (logFlags.p2pNonFatal)
            info(message, Utils.safeStringify(NodeList.byIpPort.get(ipPort)));
        return {
            success: false,
            reason: message,
            fatal: true,
        };
    }
    return null;
}
function verifyNotIPv6(joinRequest: P2P.JoinTypes.JoinRequest): JoinRequestResponse | null {
    if (isIPv6(joinRequest.nodeInfo.externalIp)) {
        if (logFlags.p2pNonFatal)
            warn('Got join request from IPv6');
        return {
            success: false,
            reason: `Bad ip version, IPv6 are not accepted`,
            fatal: true,
        };
    }
    return null;
}
function validateVersion(joinRequestVersion: string): JoinRequestResponse | null {
    if (config.p2p.checkVersion && !isEqualOrNewerVersion(version, joinRequestVersion)) {
        warn(`version number is old. Our node version is ${version}. Join request node version is ${joinRequestVersion}`);
        return {
            success: false,
            reason: `Old shardus core version, please statisfy at least ${version}`,
            fatal: true,
        };
    }
}
function verifyJoinRequestSigner(joinRequest: P2P.JoinTypes.JoinRequest): JoinRequestResponse | null {
    if (joinRequest.sign.owner != joinRequest.nodeInfo.publicKey) {
        warn(`join-reject owner != publicKey ${{ sign: joinRequest.sign.owner, info: joinRequest.nodeInfo.publicKey }}`);
        return {
            success: false,
            reason: `Bad signature, sign owner and node attempted joining mismatched`,
            fatal: true,
        };
    }
}
function verifyUnseen(publicKey: hexstring): JoinRequestResponse | null {
    if (seen.has(publicKey)) {
        if (logFlags.p2pNonFatal)
            info('Node has already been seen this cycle. Unable to add join request.');
        return {
            success: false,
            reason: 'Node has already been seen this cycle. Unable to add join request.',
            fatal: false,
        };
    }
    seen.add(publicKey);
    return null;
}
function validateJoinRequestTimestamp(joinRequestTimestamp: number): JoinRequestResponse | null {
    const cycleDuration = CycleChain.newest.duration;
    const cycleStarts = CycleChain.newest.start;
    const requestValidUpperBound = cycleStarts + cycleDuration;
    const requestValidLowerBound = cycleStarts - cycleDuration;
    if (joinRequestTimestamp < requestValidLowerBound) {
        if (logFlags.p2pNonFatal)
            warn('Cannot add join request for this node, timestamp is earlier than allowed cycle range');
        return {
            success: false,
            reason: 'Cannot add join request, timestamp is earlier than allowed cycle range',
            fatal: false,
        };
    }
    if (joinRequestTimestamp > requestValidUpperBound) {
        if (logFlags.p2pNonFatal)
            warn('Cannot add join request for this node, its timestamp exceeds allowed cycle range');
        return {
            success: false,
            reason: 'Cannot add join request, timestamp exceeds allowed cycle range',
            fatal: false,
        };
    }
}
function getSelectionKey(joinRequest: JoinRequest): Result<string, JoinRequestResponse> {
    if (typeof shardus.app.validateJoinRequest === 'function') {
        try {
            mode = CycleChain.newest.mode || null;
            const validationResponse = shardus.app.validateJoinRequest(joinRequest, mode, CycleChain.newest, config.p2p.minNodes);
            if (validationResponse.success !== true) {
                if (logFlags.p2pNonFatal)
                    error(`Validation of join request data is failed due to ${validationResponse.reason || 'unknown reason'}`);
                return err({
                    success: validationResponse.success,
                    reason: validationResponse.reason,
                    fatal: validationResponse.fatal,
                });
            }
            if (typeof validationResponse.data === 'string') {
                return ok(validationResponse.data);
            }
        }
        catch (e) {
            if (logFlags.p2pNonFatal)
                warn(`shardus.app.validateJoinRequest failed due to ${utils.formatErrorMessage(e)}`);
            return err({
                success: false,
                reason: `Could not validate join request due to Error`,
                fatal: true,
            });
        }
    }
    return ok(joinRequest.nodeInfo.publicKey);
}
export function verifyJoinRequestSignature(joinRequest: P2P.JoinTypes.JoinRequest): JoinRequestResponse | null {
    if (!crypto.verify(joinRequest, joinRequest.nodeInfo.publicKey)) {
        if (logFlags.p2pNonFatal)
            warn('join bad sign ' + Utils.safeStringify(joinRequest));
        return {
            success: false,
            reason: 'Bad signature',
            fatal: true,
        };
    }
    return null;
}
export function computeSelectionNum(joinRequest: JoinRequest): Result<string, JoinRequestResponse> {
    const selectionKeyResult = getSelectionKey(joinRequest);
    if (selectionKeyResult.isErr()) {
        return err(selectionKeyResult.error);
    }
    const selectionKey = selectionKeyResult.value;
    const obj = {
        cycleNumber: CycleChain.newest.counter,
        selectionKey,
    };
    const selectionNum = crypto.hash(obj);
    return ok(selectionNum);
}
function decideNodeSelection(joinRequest: P2P.JoinTypes.JoinRequest): JoinRequestResponse {
    let toAccept = calculateToAccept();
    const { add, remove } = calculateToAcceptV2(CycleChain.newest);
    if (logFlags && logFlags.verbose) { }
    toAccept = add;
    const last = requests.length > 0 ? requests[requests.length - 1] : undefined;
    const selectionNumResult = computeSelectionNum(joinRequest);
    if (selectionNumResult.isErr())
        return selectionNumResult.error;
    const selectionNum = selectionNumResult.value;
    if (last && requests.length >= toAccept && !crypto.isGreaterHash(selectionNum, last.selectionNum)) {
        if (logFlags.p2pNonFatal)
            info('Join request not better than lowest, not added.');
        return {
            success: false,
            reason: 'Join request not better than lowest, not added',
            fatal: false,
        };
    }
    const validationErr = verifyJoinRequestSignature(joinRequest);
    if (validationErr)
        return validationErr;
    utils.insertSorted(requests, { ...joinRequest, selectionNum }, (a, b) => a.selectionNum < b.selectionNum ? 1 : a.selectionNum > b.selectionNum ? -1 : 0);
    if (logFlags.p2pNonFatal)
        info(`Added join request for ${joinRequest.nodeInfo.externalIp}:${joinRequest.nodeInfo.externalPort}`);
    if (logFlags.p2pNonFatal)
        info(`Requests: ${requests.length}, toAccept: ${toAccept}`);
    if (requests.length > toAccept) {
        const over = requests.length - toAccept;
        requests.splice(-over);
    }
    return {
        success: true,
        reason: 'Join request accepted',
        fatal: false,
    };
}
export function nodeListFromStates(states: P2P.P2PTypes.NodeStatus[]): P2P.NodeListTypes.Node[] {
    if (Self.isRestartNetwork)
        return NodeList.byIdOrder;
    const { NodeStatus } = P2P.P2PTypes;
    const stateMappings: {
        [key in P2P.P2PTypes.NodeStatus]?: P2P.NodeListTypes.Node[];
    } = {
        [NodeStatus.ACTIVE]: NodeList.activeByIdOrder,
        [NodeStatus.READY]: NodeList.readyByTimeAndIdOrder,
        [NodeStatus.SYNCING]: NodeList.syncingByIdOrder,
        [NodeStatus.STANDBY]: NodeList.standbyByIdOrder,
        [NodeStatus.SELECTED]: NodeList.selectedByIdOrder,
    };
    let result: P2P.NodeListTypes.Node[] = [];
    for (const state of states) {
        if (stateMappings[state]) {
            result = result.concat(stateMappings[state]);
        }
    }
    const self = NodeList.byJoinOrder.find((node) => node.id === Self.id);
    if (self && !result.some((node) => node.id === self.id)) {
        result.push(self);
    }
    return result;
}
export function swapUnjoinRequestQueues(): void {
    queuedUnjoinRequestsForThisCycle = queuedUnjoinRequestsForNextCycle;
    queuedUnjoinRequestsForNextCycle = [];
}
function info(...msg: string[]): void {
    const entry = `Join: ${msg.join(' ')}`;
}
export function warn(...msg: string[]): void {
    const entry = `Join: ${msg.join(' ')}`;
    p2pLogger.warn(entry);
}
export function error(...msg: string[]): void {
    const entry = `Join: ${msg.join(' ')}`;
    p2pLogger.error(entry);
}