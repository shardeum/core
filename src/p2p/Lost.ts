import * as shardusCrypto from '@shardus/crypto-utils';
import { P2P } from '@shardus/types';
import { Route, SignedObject } from '@shardus/types/build/src/p2p/P2PTypes';
import { Handler } from 'express';
import * as http from '../http';
import { logFlags } from '../logger';
import * as utils from '../utils';
import { binarySearch, logNode, validateTypes } from '../utils';
import getCallstack from '../utils/getCallstack';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { profilerInstance } from '../utils/profiler';
import { isApopMarkedNode, nodeDownString } from './Apoptosis';
import * as Comms from './Comms';
import { config, p2p, crypto, logger, network, stateManager, shardus } from './Context';
import { currentCycle, currentQuarter } from './CycleCreator';
import { cycles } from './CycleChain';
import * as NodeList from './NodeList';
import { activeByIdOrder, byIdOrder, byPubKey, nodes } from './NodeList';
import * as Self from './Self';
import { generateUUID } from './Utils';
import { CycleData } from '@shardus/types/build/src/p2p/CycleCreatorTypes';
import { shardusGetTime } from '../network';
import { ApoptosisProposalResp, deserializeApoptosisProposalResp } from '../types/ApoptosisProposalResp';
import { ApoptosisProposalReq, serializeApoptosisProposalReq } from '../types/ApoptosisProposalReq';
import { ShardusEvent, Node } from '../shardus/shardus-types';
import { HashTrieReq, ProxyRequest, ProxyResponse } from '../state-manager/state-manager-types';
import { GetTrieHashesRequest, serializeGetTrieHashesReq } from '../types/GetTrieHashesReq';
import { GetTrieHashesResponse, deserializeGetTrieHashesResp } from '../types/GetTrieHashesResp';
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum';
import { Utils } from '@shardus/types';
import { InternalBinaryHandler } from '../types/Handler';
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum';
import { getStreamWithTypeCheck, requestErrorHandler } from '../types/Helpers';
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum';
import { LostReportReq, deserializeLostReportReq, serializeLostReportReq } from '../types/LostReportReq';
import { isDebugModeMiddlewareHigh } from '../network/debugMiddleware';
export type ScheduledLostReport<Target> = {
    targetNode: Target;
    reason: string;
    timestamp: number;
    scheduledInCycle: number;
    requestId: string;
};
export type ScheduledRemoveByApp<Target> = {
    target: Target;
    reason: string;
    timestamp: number;
    certificate: P2P.LostTypes.RemoveCertificate;
};
type ScheduledLostNodeReport = ScheduledLostReport<P2P.NodeListTypes.Node>;
type ScheduledRemoveNodeByApp = ScheduledRemoveByApp<P2P.NodeListTypes.Node>;
let p2pLogger;
let lostReported = new Map<string, P2P.LostTypes.LostReport>();
let receivedLostRecordMap = new Map<string, Map<string, P2P.LostTypes.LostRecord>>();
let checkedLostRecordMap = new Map<string, P2P.LostTypes.LostRecord>();
let upGossipMap = new Map<string, P2P.LostTypes.SignedUpGossipMessage>();
let appRemoved = new Map<string, P2P.LostTypes.RemoveByAppMessage>();
export let isDown = {};
let isUp = {};
let isUpTs = {};
let stopReporting = {};
let sendRefute = -1;
let scheduledForLostReport: Map<string, ScheduledLostNodeReport> = new Map<string, ScheduledLostNodeReport>();
let scheduledRemoveApp: Map<string, ScheduledRemoveNodeByApp> = new Map<string, ScheduledRemoveNodeByApp>();
interface PingMessage {
    m: string;
}
export declare type SignedPingMessage = PingMessage & SignedObject;
interface RouteWithAuthHandler {
    authHandler: Handler;
}
type RouteHandlerWithAuthHandler<T> = P2P.P2PTypes.Route<T> & RouteWithAuthHandler;
const killExternalRoute: RouteHandlerWithAuthHandler<Handler> = {
    method: 'GET',
    name: 'kill',
    authHandler: isDebugModeMiddlewareHigh,
    handler: (_req, res) => {
        res.json({ status: 'left the network without telling any peers' });
        killSelf('Apoptosis being called killExternalRoute()->killSelf()->emitter.emit(`apoptosized`) at src/p2p/Lost.ts');
    },
};
const killOtherExternalRoute: RouteHandlerWithAuthHandler<Handler> = {
    method: 'GET',
    name: 'killother',
    authHandler: isDebugModeMiddlewareHigh,
    handler: (_req, res) => {
        res.json({ status: 'killing another node' });
        killOther();
    },
};
const isDownCheckRoute: P2P.P2PTypes.Route<Handler> = {
    method: 'GET',
    name: 'down-check',
    handler: async (_req, res) => {
        const nodeId = _req.query.nodeId;
        const node = nodes.get(nodeId.toString());
        const result = await isDownCheck(node);
        res.json({ status: result });
    },
};
const lostDownRoute: P2P.P2PTypes.GossipHandler = (payload: P2P.LostTypes.SignedDownGossipMessage, sender, tracker) => {
    try {
        downGossipHandler(payload, sender, tracker);
    }
    finally {
    }
};
const lostUpRoute: P2P.P2PTypes.GossipHandler = (payload: P2P.LostTypes.SignedUpGossipMessage, sender, tracker) => {
    try {
        upGossipHandler(payload, sender, tracker);
    }
    finally {
    }
};
const removeByAppRoute: P2P.P2PTypes.GossipHandler = (payload: P2P.LostTypes.RemoveCertificate, sender, tracker) => {
    try {
        removeByAppHandler(payload, sender, tracker);
    }
    finally {
    }
};
const routes = {
    external: [killExternalRoute, killOtherExternalRoute],
    internal: [],
    gossip: {
        'lost-down': lostDownRoute,
        'lost-up': lostUpRoute,
        'remove-by-app': removeByAppRoute,
    },
};
export function init() {
    p2pLogger = logger.getLogger('p2p');
    reset();
    for (const route of routes.external) {
        network._registerExternal(route.method, route.name, route.authHandler, route.handler);
    }
    for (const route of routes.internal) {
        Comms.registerInternal(route.name, route.handler);
    }
    for (const [name, handler] of Object.entries(routes.gossip)) {
        Comms.registerGossipHandler(name, handler);
    }
    Comms.registerInternalBinary(LostReportBinaryHandler.name, LostReportBinaryHandler.handler);
    p2p.registerInternal('proxy', async (payload: ProxyRequest, respond: (arg0: ProxyResponse) => Promise<number>, _sender: string, _tracker: string, msgSize: number) => {
        let proxyRes: ProxyResponse = {
            success: false,
            response: null,
        };
        try {
            let targetNode = nodes.get(payload.nodeId);
            if (targetNode == null) {
                error(`proxy handler targetNode is null`);
                await respond(proxyRes);
                return;
            }
            let res = null;
            if (payload.route === 'get_trie_hashes') {
                res = await Comms.askBinary<GetTrieHashesRequest, GetTrieHashesResponse>(targetNode, InternalRouteEnum.binary_get_trie_hashes, payload.message, serializeGetTrieHashesReq, deserializeGetTrieHashesResp, {});
            }
            else {
                error(`proxy handler route is not get_trie_hashes: ${payload.route}`);
                await respond(proxyRes);
                return;
            }
            proxyRes = {
                success: true,
                response: res,
            };
            await respond(proxyRes);
        }
        catch (e) {
            error(`proxy handler error: ${e.message}`);
            await respond(proxyRes);
        }
        finally {
        }
    });
}
export function reset() {
    const lostCacheCycles = config.p2p.lostMapPruneCycles;
    for (let [key, lostRecordItems] of receivedLostRecordMap) {
        let shouldRemove = false;
        for (let [checker, report] of lostRecordItems) {
            if (report.cycle < currentCycle - lostCacheCycles) {
                shouldRemove = true;
                break;
            }
            if (nodes.get(report.target) == null) {
                shouldRemove = true;
                break;
            }
        }
        if (shouldRemove) {
            lostReported.delete(key);
            checkedLostRecordMap.delete(key);
            receivedLostRecordMap.delete(key);
            upGossipMap.delete(key);
        }
    }
    appRemoved.clear();
    pruneIsDown();
    pruneStopReporting();
}
export function getTxs(): P2P.LostTypes.Txs {
    let lostTxs = [];
    let refutedTxs = [];
    let removedByAppTxs = [];
    for (const [key, lostRecordItems] of receivedLostRecordMap) {
        if (lostRecordItems == null || lostRecordItems.size === 0)
            continue;
        let target: string;
        for (const [checker, record] of lostRecordItems) {
            if (record.target != null) {
                target = record.target;
                break;
            }
        }
        if (target && isApopMarkedNode(target)) {
            receivedLostRecordMap.delete(key);
        }
    }
    let seen = {};
    for (const [key, lostRecordItems] of receivedLostRecordMap) {
        if (lostRecordItems == null || lostRecordItems.size === 0)
            continue;
        let downMsgCount = 0;
        let upMsgCount = 0;
        let downRecord: P2P.LostTypes.LostRecord;
        let upRecord: P2P.LostTypes.LostRecord;
        for (const [checker, record] of lostRecordItems) {
            if (seen[record.target])
                continue;
            if (record.status === 'down') {
                downMsgCount++;
                downRecord = record;
            }
            else if (record.status === 'up') {
                upMsgCount++;
                upRecord = record;
            }
        }
        if (upMsgCount >= config.p2p.minChecksForUp) {
            seen[upRecord.target] = true;
            if (logFlags.verbose)
                info(`Saw at least ${config.p2p.minChecksForUp} up messages: ${Utils.safeStringify(upRecord)}`);
        }
        else if (downMsgCount >= config.p2p.minChecksForDown) {
            lostTxs.push(downRecord.message);
            seen[downRecord.target] = true;
            if (logFlags.lost)
                if (logFlags.verbose)
                    info(`Adding lost record for ${downRecord.target} to lostTxs`);
        }
        else {
            if (logFlags.lost)
                info(`Not enough down messages to be considered lost: ${Utils.safeStringify(downRecord)}`);
        }
    }
    for (const [key, upGossipMsg] of upGossipMap) {
        let { target, cycle, status } = upGossipMsg;
        if (cycle == currentCycle) {
            refutedTxs.push(upGossipMsg);
            if (logFlags.verbose)
                info(`Adding up gossip message for ${target} to refutedTxs`);
        }
    }
    seen = {};
    for (const [key, obj] of appRemoved) {
        if (seen[obj.target])
            continue;
        removedByAppTxs.push(obj);
        seen[obj.target] = true;
    }
    return {
        lost: [...lostTxs],
        refuted: [...refutedTxs],
        removedByApp: [...removedByAppTxs],
    };
}
export function validateRecordTypes(rec: P2P.LostTypes.Record): string {
    let err = validateTypes(rec, { lost: 'a', refuted: 'a', appRemoved: 'a' });
    if (err)
        return err;
    for (const item of rec.lost) {
        if (typeof item !== 'string')
            return 'items of lost array must be strings';
    }
    for (const item of rec.refuted) {
        if (typeof item !== 'string')
            return 'items of refuted array must be strings';
    }
    for (const item of rec.appRemoved) {
        if (typeof item !== 'string')
            return 'items of appRemoved array must be strings';
    }
    return '';
}
export function dropInvalidTxs(txs: P2P.LostTypes.Txs): P2P.LostTypes.Txs {
    const validLost = txs.lost.filter((request) => checkDownMsg(request, currentCycle)[0]);
    const validRefuted = txs.refuted.filter((request) => checkUpMsg(request, currentCycle)[0]);
    const validRemovedByApp = txs.removedByApp.filter((request) => checkRemoveByAppMsg(request, currentCycle)[0]);
    return { lost: validLost, refuted: validRefuted, removedByApp: validRemovedByApp };
}
export function updateRecord(txs: P2P.LostTypes.Txs, record: P2P.CycleCreatorTypes.CycleRecord, prev: P2P.CycleCreatorTypes.CycleRecord) {
    const lostNodeIds = [];
    const lostSyncingNodeIds = [];
    const refutedNodeIds = [];
    const removedByAppNodeIds = [];
    let seen = {};
    for (const request of txs.lost) {
        if (seen[request.report.target])
            continue;
        lostNodeIds.push(request.report.target);
        seen[request.report.target] = true;
    }
    seen = {};
    for (const request of txs.refuted) {
        if (seen[request.target])
            continue;
        refutedNodeIds.push(request.target);
        seen[request.target] = true;
    }
    seen = {};
    for (const request of txs.removedByApp) {
        if (seen[request.target])
            continue;
        removedByAppNodeIds.push(request.target);
        seen[request.target] = true;
    }
    if (config.p2p.detectLostSyncing) {
        const syncingNodes = NodeList.syncingByIdOrder;
        const now = Math.floor(shardusGetTime() / 1000);
        for (const syncingNode of syncingNodes) {
            const syncTime = now - syncingNode.syncingTimestamp;
            if (record.maxSyncTime && syncTime > record.maxSyncTime) {
                if (logFlags.lost) {
                    info(`Syncing time for node ${syncingNode.id}`, syncTime);
                    info(`Max sync time from record`, record.maxSyncTime);
                    info(`Sync time is longer than max sync time. Reporting as lost`);
                    info('adding node to lost syncing list', syncingNode.id, `${syncTime} > ${record.maxSyncTime}`);
                }
                lostSyncingNodeIds.push(syncingNode.id);
            }
        }
    }
    record.lost = lostNodeIds.sort();
    record.lostSyncing = lostSyncingNodeIds.sort();
    record.refuted = refutedNodeIds.sort();
    record.appRemoved = removedByAppNodeIds.sort();
    if (prev) {
        let apop = prev.lost.filter((id) => nodes.has(id));
        apop = apop.filter((id) => !prev.appRemoved.includes(id));
        let apopSyncing = [];
        if (config.p2p.detectLostSyncing) {
            apopSyncing = prev.lostSyncing.filter((id) => nodes.has(id));
        }
        apop = apop.filter((id) => !refutedNodeIds.includes(id));
        if (config.p2p.uniqueRemovedIds) {
            apop = apop.filter((id) => !record.apoptosized.includes(id));
            apopSyncing = apopSyncing.filter((id) => !record.apoptosized.includes(id));
        }
        if (config.p2p.uniqueRemovedIdsUpdate) {
            const nodesInRemoved = apop.filter((id) => record.removed.includes(id));
            record.removed = record.removed.filter((id) => !nodesInRemoved.includes(id));
        }
        if (config.p2p.uniqueLostIdsUpdate) {
            const nodesInLost = apop.filter((id) => record.lost.includes(id));
            record.lost = record.lost.filter((id) => !nodesInLost.includes(id));
        }
        record.apoptosized = [...apop, ...apopSyncing, ...record.apoptosized].sort();
    }
}
export function parseRecord(record: P2P.CycleCreatorTypes.CycleRecord): P2P.CycleParserTypes.Change {
    for (const id of record.refuted) {
        const node = NodeList.nodes.get(id);
        if (node == null) {
            error(`Refuted node ${id} is not in the network`);
            continue;
        }
        const emitParams: Omit<ShardusEvent, 'type'> = {
            nodeId: node.id,
            reason: 'Node refuted',
            time: record.start,
            publicKey: node.publicKey,
            cycleNumber: record.counter,
        };
        Self.emitter.emit('node-refuted', emitParams);
        if (id === Self.id)
            sendRefute = -1;
    }
    for (const id of record.lost) {
        stopReporting[id] = record.counter;
        if (id === Self.id) {
            sendRefute = record.counter + 1;
            warn(`self-schedule refute currentC:${currentCycle} inCycle:${record.counter} refuteat:${sendRefute}`);
        }
    }
    for (const id of record.lostSyncing) {
        const node = NodeList.nodes.get(id);
        if (node == null) {
            error(`Lost syncing node ${id} is not in the network`);
            continue;
        }
        NodeList.emitSyncTimeoutEvent(node, record);
        if (config.p2p.removeLostSyncingNodeFromList)
            NodeList.removeSyncingNode(id);
    }
    if (record.lostSyncing.includes(Self.id)) {
        error(`We got marked as lostSyncing. Being nice and leaving.`);
        Self.emitter.emit('invoke-exit', 'lostSyncing', getCallstack(), 'invoke-exit being called at parseRecord() => src/p2p/Lost.ts');
    }
    if (record.appRemoved.includes(Self.id)) {
        Self.emitter.emit('app-removed', Self.id);
    }
    return {
        added: [],
        removed: [...record.appRemoved],
        updated: [],
    };
}
export function sendRequests() {
    if (config.p2p.aggregateLostReportsTillQ1) {
        scheduledForLostReport.forEach((value: ScheduledLostNodeReport, key: string) => {
            if (value.scheduledInCycle < currentCycle - config.p2p.delayLostReportByNumOfCycles) {
                if (logFlags.lost)
                    info(`Reporting lost: requestId: ${value.requestId}, scheduled in cycle: ${value.scheduledInCycle}, reporting in cycle ${currentCycle}, originally reported at ${value.timestamp}`);
                reportLost(value.targetNode, value.reason, value.requestId);
                scheduledForLostReport.delete(key);
            }
        });
    }
    for (const [key, obj] of scheduledRemoveApp) {
        removeByApp(obj.target, obj.certificate);
        scheduledRemoveApp.delete(key);
    }
    for (const [key, record] of checkedLostRecordMap) {
        if (record.status !== 'down')
            continue;
        if (record.message && record.checker && record.checker === Self.id) {
            if (record.gossiped)
                continue;
            if (record.status !== 'down')
                continue;
            if (stopReporting[record.message.target])
                continue;
            let msg = { report: record.message, cycle: currentCycle, status: 'down' };
            msg = crypto.sign(msg);
            record.message = msg;
            record.gossiped = true;
            if (logFlags.verbose)
                info(`Gossiping node down message for node: ${record.target} payload.cycle ${record.cycle}: ${Utils.safeStringify(msg)}`);
            Comms.sendGossip('lost-down', msg, '', null, byIdOrder, true);
            if (!receivedLostRecordMap.has(key)) {
                receivedLostRecordMap.set(key, new Map<string, P2P.LostTypes.LostRecord>());
                receivedLostRecordMap.get(key).set(record.checker, record);
            }
        }
    }
    if (sendRefute > 0) {
        warn(`pending sendRefute:${sendRefute} currentCycle:${currentCycle}`);
    }
    if (sendRefute === currentCycle) {
        let upGossipMsg = { target: Self.id, status: 'up', cycle: currentCycle };
        warn(`Gossiping node up message: ${Utils.safeStringify(upGossipMsg)}`);
        let signedUpGossipMsg: P2P.LostTypes.SignedUpGossipMessage = crypto.sign(upGossipMsg);
        Comms.sendGossip('lost-up', signedUpGossipMsg, '', null, byIdOrder, true);
        upGossipMap.set(`${Self.id}-${currentCycle}`, signedUpGossipMsg);
    }
}
async function killSelf(message: string) {
    error(`In killSelf`);
    Self.emitter.emit('invoke-exit', 'killSelf', getCallstack(), message);
    error(`I have been killed, will not restart.`);
}
async function killOther() {
    const requestId = generateUUID();
    if (logFlags.verbose)
        info(`Explicitly injecting reportLost, requestId: ${requestId}`);
    let target = activeByIdOrder[0];
    if (target.id === Self.id)
        target = activeByIdOrder[1];
    scheduleLostReport(target, 'killother', requestId);
}
export function scheduleLostReport(target: P2P.NodeListTypes.Node, reason: string, requestId: string) {
    if (!config.p2p.aggregateLostReportsTillQ1)
        return reportLost(target, reason, requestId);
    if (requestId.length == 0)
        requestId = generateUUID();
    if (logFlags.lost) {
        info(`Scheduling lost report for ${target.id}, requestId: ${requestId}.`);
        info(`Target node details for requestId: ${requestId}: ${logNode(target)}`);
        info(`Scheduled lost report in ${currentCycle} for requestId: ${requestId}.`);
    }
    const key = `${target.id}-${currentCycle}`;
    if (scheduledForLostReport.has(key)) {
        const previousScheduleValue = scheduledForLostReport.get(key);
        if (logFlags.verbose) {
            info(`Target node ${target.id} already scheduled for lost report. requestId: ${previousScheduleValue.requestId}.`);
            info(`Previous scheduled lost report details for ${target.id}: ${Utils.safeStringify(previousScheduleValue)}`);
        }
    }
    scheduledForLostReport.set(key, {
        reason: reason,
        targetNode: target,
        timestamp: shardusGetTime(),
        scheduledInCycle: currentCycle,
        requestId: requestId,
    });
}
function reportLost(target, reason: string, requestId: string) {
    try {
        if (logFlags.lost)
            info(`Reporting lost for ${target.id}, requestId: ${requestId}.`);
        if (logFlags.lost)
            info(`Target node details for requestId: ${requestId}: ${logNode(target)}`);
        if (target.id === Self.id) {
            return;
        }
        if (stopReporting[target.id]) {
            return;
        }
        if (nodes.get(target.id)?.status === 'syncing') {
            return;
        }
        if (nodes.get(target.id)?.status === 'selected') {
            return;
        }
        isDown[target.id] = currentCycle;
        const key = `${target.id}-${currentCycle}`;
        const lostRec = lostReported.get(key);
        if (lostRec) {
            return;
        }
        let obj = { target: target.id, status: 'reported', cycle: currentCycle };
        let lostCycle = currentCycle;
        let checkerNodes = getMultipleCheckerNodes(target.id, lostCycle, Self.id);
        for (let checker of checkerNodes) {
            if (checker.id === Self.id && activeByIdOrder.length >= 3)
                return;
            let report: P2P.LostTypes.LostReport = {
                target: target.id,
                checker: checker.id,
                reporter: Self.id,
                cycle: currentCycle,
            };
            if (reason === 'killother')
                report.killother = true;
            if (logFlags.lost) {
                info(`Sending investigate request. requestId: ${requestId}, reporter: ${Self.ip}:${Self.port} id: ${Self.id}`);
                info(`Sending investigate request. requestId: ${requestId}, checker: ${checker.internalIp}:${checker.internalPort} node details: ${logNode(checker)}`);
                info(`Sending investigate request. requestId: ${requestId}, target: ${target.internalIp}:${target.internalPort} cycle: ${report.cycle} node details: ${logNode(target)}`);
                info(`Sending investigate request. requestId: ${requestId}, msg: ${Utils.safeStringify(report)}`);
            }
            const msgCopy = Utils.safeJsonParse(Utils.safeStringify(report));
            msgCopy.timestamp = shardusGetTime();
            msgCopy.requestId = requestId;
            report = crypto.sign(msgCopy);
            const request = report as LostReportReq;
            Comms.tellBinary<LostReportReq>([checker], InternalRouteEnum.binary_lost_report, request, serializeLostReportReq, {});
            lostReported.set(key, report);
        }
    }
    catch (ex) {
        error('reportLost: ' + utils.formatErrorMessage(ex));
    }
}
function getMultipleCheckerNodes(target: string, lostCycle: number, reporter: string): P2P.NodeListTypes.Node[] {
    let checkerNodes: Map<string, P2P.NodeListTypes.Node> = new Map();
    let obj = { target, cycle: lostCycle };
    let key = crypto.hash(obj);
    const firstFourBytesOfMarker = key.slice(0, 8);
    const offset = parseInt(firstFourBytesOfMarker, 16);
    let pickedIndexes = utils.getIndexesPicked(activeByIdOrder.length, config.p2p.numCheckerNodes, offset);
    let attemptLimit = activeByIdOrder.length;
    for (let i = 0; i < pickedIndexes.length; i++) {
        let pickedIndex = pickedIndexes[i];
        let currentNode = activeByIdOrder[pickedIndex];
        let attempts = 0;
        while ((currentNode.id === reporter || currentNode.id === target || checkerNodes.has(currentNode.id)) && attempts < attemptLimit) {
            pickedIndex = (pickedIndex + 1) % activeByIdOrder.length;
            currentNode = activeByIdOrder[pickedIndex];
            attempts++;
        }
        if (attempts >= attemptLimit) {
            error('Failed to find suitable nodes; most nodes are either reporters or targets.');
            return [];
        }
        checkerNodes.set(currentNode.id, currentNode);
    }
    let selectedNodes = [...checkerNodes.values()];
    if (logFlags.lost)
        info(`in getMultipleCheckerNodes checkerNodes for target: ${target}, reporter: ${reporter}, cycle: ${lostCycle}: ${Utils.safeStringify(selectedNodes)}`);
    return selectedNodes;
}
function removeByApp(target: P2P.NodeListTypes.Node, certificate: P2P.LostTypes.RemoveCertificate) {
    if (logFlags.lost)
        info(`Gossip remove for ${target}`);
    if (target.id === Self.id) {
        return;
    }
    isDown[target.id] = currentCycle;
    const removedRec = appRemoved.get(target.id);
    if (removedRec)
        return;
    appRemoved.set(target.id, { certificate, target: target.id });
    Comms.sendGossip('remove-by-app', certificate, '', Self.id, byIdOrder, true);
}
function getCheckerNode(id, cycle) {
    const obj = { id, cycle };
    const near = crypto.hash(obj);
    function compareNodes(i, r) {
        return i > r.id ? 1 : i < r.id ? -1 : 0;
    }
    let idx = binarySearch(activeByIdOrder, near, compareNodes);
    const oidx = idx;
    if (idx < 0)
        idx = (-1 - idx) % activeByIdOrder.length;
    const foundNode = activeByIdOrder[idx];
    if (foundNode == null) {
        throw new Error(`activeByIdOrder idx:${idx} length: ${activeByIdOrder.length}`);
    }
    if (foundNode.id === id)
        idx = (idx + 1) % activeByIdOrder.length;
    if (logFlags.lost) {
        info(`in getCheckerNode oidx:${oidx} idx:${idx} near:${near}  cycle:${cycle}  id:${id}`);
        info(`${Utils.safeStringify(activeByIdOrder.map((n) => n.id))}`);
    }
    return activeByIdOrder[idx];
}
const LostReportBinaryHandler: Route<InternalBinaryHandler<Buffer>> = {
    name: InternalRouteEnum.binary_lost_report,
    handler: async (payload, respond, header, sign) => {
        const route = InternalRouteEnum.binary_lost_report;
        const errorHandler = (errorType: RequestErrorEnum, opts?: {
            customErrorLog?: string;
            customCounterSuffix?: string;
        }): void => requestErrorHandler(route, errorType, header, opts);
        try {
            const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cLostReportReq);
            if (!requestStream) {
                return errorHandler(RequestErrorEnum.InvalidRequestType);
            }
            const req: LostReportReq = deserializeLostReportReq(requestStream);
            let requestId = generateUUID();
            const sender = NodeList.nodes.get(header.sender_id);
            if (logFlags.verbose)
                info(`Got investigate request requestId: ${req.requestId}, req: ${Utils.safeStringify(req)} from ${logNode(sender)}`);
            if (stopReporting[req.target])
                return;
            const key = `${req.target}-${req.cycle}`;
            if (checkedLostRecordMap.get(key))
                return;
            if (sign.owner !== sender.publicKey) {
                errorHandler(RequestErrorEnum.InvalidRequest, {
                    customCounterSuffix: 'bad_sign_owner',
                    customErrorLog: 'bad sign owner',
                });
                return;
            }
            const [valid, reason] = checkReport(req, currentCycle + 1);
            if (!valid) {
                warn(`Got bad investigate request. requestId: ${requestId}, reason: ${reason}`);
                errorHandler(RequestErrorEnum.InvalidRequest);
                return;
            }
            if (header.sender_id !== req.reporter) {
                errorHandler(RequestErrorEnum.InvalidSender);
                return;
            }
            if (req.checker !== Self.id) {
                errorHandler(RequestErrorEnum.InvalidRequest, {
                    customCounterSuffix: 'bad_checker',
                    customErrorLog: 'the checker should be our node id',
                });
                return;
            }
            let record: P2P.LostTypes.LostRecord = {
                target: req.target,
                cycle: req.cycle,
                status: 'checking',
                message: req,
                reporter: req.reporter,
                checker: req.checker,
            };
            if (isDown[req.target]) {
                record.status = 'down';
                return;
            }
            let result = await isDownCache(nodes.get(req.target), requestId);
            if (logFlags.verbose)
                info(`isDownCache for requestId: ${requestId}, result ${result}`);
            if (req.killother)
                result = 'down';
            if (record.status === 'checking')
                record.status = result;
            if (logFlags.verbose)
                info(`Status after checking for node ${req.target} payload cycle: ${req.cycle}, currentCycle: ${currentCycle} is ` + record.status);
            if (!checkedLostRecordMap.has(key)) {
                checkedLostRecordMap.set(key, record);
            }
        }
        catch (e) {
            if (logFlags.error)
                p2pLogger.error(`${route}: Exception executing request: ${utils.errorToStringFull(e)}`);
        }
        finally {
        }
    },
};
function checkReport(report, expectCycle) {
    if (!report || typeof report !== 'object')
        return [false, 'no report given'];
    if (!report.reporter || typeof report.reporter !== 'string')
        return [false, 'no reporter field'];
    if (!report.checker || typeof report.checker !== 'string')
        return [false, 'no checker field'];
    if (!report.target || typeof report.target !== 'string')
        return [false, 'no target field'];
    if (!report.cycle || typeof report.cycle !== 'number')
        return [false, 'no cycle field'];
    if (!report.sign || typeof report.sign !== 'object')
        return [false, 'no sign field'];
    if (report.target == Self.id)
        return [false, 'target is self'];
    const cyclediff = expectCycle - report.cycle;
    if (cyclediff < 0)
        return [false, 'reporter cycle is not as expected; too new'];
    if (cyclediff >= 2)
        return [false, 'reporter cycle is not as expected; too old'];
    if (report.target === report.reporter)
        return [false, 'target cannot be reporter'];
    if (report.checker === report.target)
        return [false, 'target cannot be checker'];
    if (report.checker === report.reporter) {
        if (activeByIdOrder.length >= 3)
            return [false, 'checker cannot be reporter'];
    }
    if (!nodes.has(report.target))
        return [false, 'target not in network'];
    if (!nodes.has(report.reporter))
        return [false, 'reporter not in network'];
    if (!nodes.has(report.checker))
        return [false, 'checker not in network'];
    try {
        let checkerNodes = getMultipleCheckerNodes(report.target, report.cycle, report.reporter);
        let checkNodeIds = checkerNodes.map((node) => node.id);
        if (!checkNodeIds.includes(report.checker)) {
            error(`checkReport: report.checker ${report.checker} is not one of the valid checkers ${checkNodeIds}`);
            return [
                false,
                `report.checker ${report.checker} is not part of eligible checkers: ${utils.stringifyReduce(checkNodeIds)}`,
            ];
        }
    }
    catch (ex) {
        error('checkReport: ' + utils.formatErrorMessage(ex));
        return [false, `checker node look up fail ${report.checker}`];
    }
    if (!crypto.verify(report, nodes.get(report.reporter).publicKey))
        return [false, 'bad sign from reporter'];
    return [true, ''];
}
async function isDownCache(node, requestId: string) {
    const id = node.id;
    if (config.p2p.isDownCacheEnabled) {
        if (isDown[id]) {
            if (logFlags.lost)
                info(`node with id ${node.id} found in isDown for requestId: ${requestId}`);
            return 'down';
        }
        if (isUp[id]) {
            if (logFlags.lost)
                info(`node with id ${node.id} found in isUp for requestId: ${requestId}`);
            return 'up';
        }
    }
    const status = await isDownCheck(node);
    if (logFlags.lost)
        info(`isDownCheck for requestId: ${requestId} on node with id ${node.id} is ${status}`);
    if (status === 'down') {
        isDown[id] = currentCycle;
    }
    else {
        isUp[id] = currentCycle;
    }
    return status;
}
export function setIsUpTs(nodeId: string) {
    let timestamp = shardusGetTime();
    isUpTs[nodeId] = timestamp;
}
export function isNodeUpRecent(nodeId: string, maxAge: number): {
    upRecent: boolean;
    state: string;
    age: number;
} {
    let lastCheck = isUpTs[nodeId];
    let age = shardusGetTime() - lastCheck;
    if (isNaN(age)) {
        return { upRecent: false, state: 'noLastState', age };
    }
    if (age < maxAge)
        return { upRecent: true, state: 'up', age };
    return { upRecent: false, state: 'noLastState', age };
}
export function isNodeDown(nodeId: string): {
    down: boolean;
    state: string;
} {
    if (isDown[nodeId])
        return { down: true, state: 'down' };
    if (isUp[nodeId])
        return { down: false, state: 'up' };
    return { down: false, state: 'noLastState' };
}
export function isNodeLost(nodeId: string): boolean {
    const key = `${nodeId}-${currentCycle}`;
    const lostRec = receivedLostRecordMap.get(key);
    if (lostRec != null) {
        return true;
    }
    return false;
}
export function removeNodeWithCertificiate(certificate: P2P.LostTypes.RemoveCertificate): void {
    const [success, message] = verifyRemoveCertificate(certificate, currentCycle - 1);
    if (!success) {
        error(`Bad certificate. reason:${message}`);
        return;
    }
    const node = byPubKey.get(certificate.nodePublicKey);
    if (node == null) {
        error(`Target remove node ${certificate.nodePublicKey} is not found in the activeList`);
        return;
    }
    if (scheduledRemoveApp.has(certificate.nodePublicKey)) {
        const previousScheduleValue = scheduledRemoveApp.get(certificate.nodePublicKey);
        if (logFlags.verbose) {
            info(`Target node ${certificate.nodePublicKey} already scheduled for removing.`);
            info(`Previous scheduled lost report details for ${certificate.nodePublicKey}: ${Utils.safeStringify(previousScheduleValue)}`);
        }
        return;
    }
    scheduledRemoveApp.set(certificate.nodePublicKey, {
        target: node,
        reason: 'remove-by-app',
        certificate,
        timestamp: shardusGetTime(),
    });
}
function pruneIsDown() {
    const cachePruneAge = config.p2p.isDownCachePruneCycles;
    for (const [key, value] of Object.entries(isDown)) {
        if (typeof value === 'number' && value < currentCycle - cachePruneAge)
            delete isDown[key];
    }
    for (const [key, value] of Object.entries(isUp)) {
        if (typeof value === 'number' && value < currentCycle - cachePruneAge)
            delete isUp[key];
    }
}
function pruneStopReporting() {
    const stopReportingPruneCycles = config.p2p.stopReportingLostPruneCycles;
    for (const [key, value] of Object.entries(stopReporting)) {
        if ((value as number) < currentCycle - stopReportingPruneCycles)
            delete stopReporting[key];
    }
}
async function isDownCheck(node) {
    if (logFlags.lost)
        info(`Checking internal connection for ${node.id}, cycle: ${currentCycle}`);
    try {
        if (config.p2p.useProxyForDownCheck) {
            let obj = { counter: currentCycle, checker: Self.id, target: node.id, timestamp: shardusGetTime() };
            let hash = crypto.hash(obj);
            let closestNodes = stateManager.getClosestNodes(hash, 5, true);
            let proxyNode: P2P.NodeListTypes.Node;
            for (let closetNode of closestNodes) {
                if (closetNode.id !== node.id) {
                    proxyNode = closetNode;
                    break;
                }
            }
            if (proxyNode == null) {
                throw new Error(`isDownCheck unable to get proxy node to check the target node`);
            }
            let hashTrieReq: HashTrieReq = {
                radixList: ['0'],
            };
            let proxyRequest: ProxyRequest = {
                nodeId: node.id,
                route: 'get_trie_hashes',
                message: hashTrieReq,
            };
            const res = await Comms.ask(proxyNode, 'proxy', proxyRequest, true, '', 3000);
            if (logFlags.verbose)
                info(`lost check result for node ${node.id} cycle ${currentCycle} is ${utils.stringifyReduce(res)}`);
            if (res == null || res.success === false || res.response == null || res.response.isResponse == null) {
                return 'down';
            }
            let nodeHashes = res.response.nodeHashes;
            if (nodeHashes == null || nodeHashes.length === 0) {
                return 'down';
            }
        }
        else {
            const res = await Comms.askBinary<ApoptosisProposalReq, ApoptosisProposalResp>(node, 'apoptosize', {
                id: 'isDownCheck',
                when: 1,
            }, serializeApoptosisProposalReq, deserializeApoptosisProposalResp, {});
            if (res == null) {
                return 'down';
            }
            if (typeof res.s !== 'string') {
                return 'down';
            }
            if (res.s === nodeDownString) {
                return 'down';
            }
        }
    }
    catch (e) {
        return 'down';
    }
    if (node.externalIp === node.internalIp)
        return 'up';
    if (logFlags.lost)
        info(`Checking external connection for ${node.id}`);
    const queryExt = async (node) => {
        const ip = node.ip ? node.ip : node.externalIp;
        const port = node.port ? node.port : node.externalPort;
        if (ip === Self.ip && port === Self.port)
            return null;
        const resp: {
            newestCycle: CycleData;
        } = await http.get(`${ip}:${port}/sync-newest-cycle`);
        return resp;
    };
    try {
        const resp = await queryExt(node);
        if (typeof resp.newestCycle.counter !== 'number')
            return 'down';
    }
    catch {
        return 'down';
    }
    return 'up';
}
function downGossipHandler(payload: P2P.LostTypes.SignedDownGossipMessage, sender, tracker) {
    if (logFlags.lost)
        info(`Got downGossip: ${Utils.safeStringify(payload)}`);
    let err = '';
    err = validateTypes(payload, { cycle: 'n', report: 'o', status: 's', sign: 'o' });
    if (err) {
        warn('bad input ' + err);
        return;
    }
    err = validateTypes(payload.report, { target: 's', reporter: 's', checker: 's', cycle: 'n', sign: 'o' });
    if (err) {
        warn('bad input report ' + err);
        return;
    }
    err = validateTypes(payload.report.sign, { owner: 's', sig: 's' });
    if (err) {
        warn('bad input report sign ' + err);
        return;
    }
    err = validateTypes(payload.sign, { owner: 's', sig: 's' });
    if (err) {
        warn('bad input sign ' + err);
        return;
    }
    const key = `${payload.report.target}-${payload.report.cycle}`;
    const checkedRecord = checkedLostRecordMap.get(key);
    if (checkedRecord && ['up', 'down'].includes(checkedRecord.status)) {
        return;
    }
    const alreadyProcessedLostRecord = receivedLostRecordMap.get(key)
        ? receivedLostRecordMap.get(key).get(payload.report.checker)
        : null;
    if (alreadyProcessedLostRecord && ['up', 'down'].includes(alreadyProcessedLostRecord.status)) {
        return;
    }
    let [valid, reason] = checkQuarter(payload.report.checker, sender);
    if (!valid) {
        warn(`Bad downGossip message. reason:${reason} message:${Utils.safeStringify(payload)}`);
        warn(`cycle:${currentCycle} quarter:${currentQuarter} sender:${sender}`);
        return;
    }
    ;
    [valid, reason] = checkDownMsg(payload, currentCycle);
    if (!valid) {
        warn(`Bad downGossip message. reason:${reason}. message:${Utils.safeStringify(payload)}`);
        warn(`cycle:${currentCycle} quarter:${currentQuarter} sender:${sender}`);
        return;
    }
    let receivedRecord: P2P.LostTypes.LostRecord = {
        target: payload.report.target,
        cycle: payload.report.cycle,
        status: 'down',
        message: payload,
        checker: payload.report.checker,
        reporter: payload.report.reporter,
    };
    if (receivedLostRecordMap.has(key) && receivedLostRecordMap.get(key).has(payload.report.checker)) {
        if (logFlags.verbose)
            info(`downGossip already seen and processed. report ${Utils.safeStringify(payload.report)}`);
        return;
    }
    if (receivedLostRecordMap.has(key)) {
        receivedLostRecordMap.get(key).set(payload.report.checker, receivedRecord);
    }
    else {
        receivedLostRecordMap.set(key, new Map());
        receivedLostRecordMap.get(key).set(payload.report.checker, receivedRecord);
    }
    if (logFlags.verbose)
        info(`downGossip for target ${payload.report.target} at cycle ${payload.report.cycle} is processed. Total received: ${receivedLostRecordMap.get(key).size}`);
    Comms.sendGossip('lost-down', payload, tracker, Self.id, byIdOrder, false);
}
function checkQuarter(source, sender) {
    if (![1, 2].includes(currentQuarter))
        return [false, 'not in Q1 or Q2'];
    if (sender === source && currentQuarter === 2)
        return [false, 'originator cannot gossip in Q2'];
    return [true, ''];
}
function checkDownMsg(payload: P2P.LostTypes.SignedDownGossipMessage, expectedCycle: number) {
    if (payload.cycle !== expectedCycle)
        return [false, 'checker cycle is not as expected'];
    const [valid, reason] = checkReport(payload.report, expectedCycle - 1);
    if (!valid)
        return [valid, reason];
    if (!crypto.verify(payload, nodes.get(payload.report.checker).publicKey))
        return [false, `bad sign from checker.`];
    return [true, ''];
}
function upGossipHandler(payload, sender, tracker) {
    if (logFlags.lost)
        info(`Got upGossip: ${Utils.safeStringify(payload)}`);
    let err = '';
    err = validateTypes(payload, { cycle: 'n', target: 's', status: 's', sign: 'o' });
    if (err) {
        warn('bad input ' + err);
        return;
    }
    err = validateTypes(payload.sign, { owner: 's', sig: 's' });
    if (err) {
        warn('bad input sign ' + err);
        return;
    }
    if (!stopReporting[payload.target]) {
        warn('Bad upGossip. We did not see this node in the lost field, but got a up msg from it; ignoring it');
        return;
    }
    let [valid, reason] = checkQuarter(payload.target, sender);
    if (!valid) {
        warn(`Bad upGossip message. reason:${reason} message:${Utils.safeStringify(payload)}`);
        return;
    }
    const key = `${payload.target}-${payload.cycle}`;
    const rec = upGossipMap.get(key);
    if (rec && rec.status === 'up')
        return;
    [valid, reason] = checkUpMsg(payload, currentCycle);
    if (!valid) {
        warn(`Bad upGossip message. reason:${reason} message:${Utils.safeStringify(payload)}`);
        return;
    }
    upGossipMap.set(key, payload);
    Comms.sendGossip('lost-up', payload, tracker, Self.id, byIdOrder, false);
}
function removeByAppHandler(payload: P2P.LostTypes.RemoveCertificate, sender, tracker) {
    const [success, message] = verifyRemoveCertificate(payload, currentCycle - 2);
    if (!success) {
        error(`Bad certificate. reason:${message}`);
        return;
    }
    const target = byPubKey.get(payload.nodePublicKey).id;
    const rec = appRemoved.get(target);
    if (rec)
        return;
    let [valid, reason] = checkQuarter(target, sender);
    if (!valid) {
        warn(`Bad downGossip message. reason:${reason} message:${Utils.safeStringify(payload)}`);
        warn(`cycle:${currentCycle} quarter:${currentQuarter} sender:${sender}`);
        return;
    }
    appRemoved.set(target, { target: target, certificate: payload });
    Comms.sendGossip('remove-by-app', payload, tracker, Self.id, byIdOrder, false);
}
function checkUpMsg(payload: P2P.LostTypes.SignedUpGossipMessage, expectedCycle) {
    if (!nodes.has(payload.target))
        return [false, `target is not an active node  ${payload.target}  ${Utils.safeStringify(activeByIdOrder)}`];
    if (!crypto.verify(payload, nodes.get(payload.target).publicKey))
        return [false, 'bad sign from target'];
    return [true, ''];
}
function checkRemoveByAppMsg(payload: P2P.LostTypes.RemoveByAppMessage, expectedCycle) {
    if (!nodes.has(payload.target))
        return [false, `target is not an active node  ${payload.target}  ${Utils.safeStringify(activeByIdOrder)}`];
    return [true, ''];
}
function verifyRemoveCertificate(certificate: P2P.LostTypes.RemoveCertificate, cycle: number) {
    if (!certificate)
        return [false, 'no certificate given'];
    if (!certificate.nodePublicKey || typeof certificate.nodePublicKey !== 'string')
        return [false, 'no nodePublicKey field'];
    const node = byPubKey.get(certificate.nodePublicKey);
    if (!node)
        return [false, 'nodePublicKey not in network'];
    if (node.publicKey !== certificate.nodePublicKey)
        return [false, 'nodePublicKey does not match node'];
    if (certificate.cycle !== cycle)
        return [false, `cycle is not as expected. certificate.cycle: ${certificate.cycle} expected: ${cycle}`];
    const { success, reason } = shardus.validateClosestActiveNodeSignatures(certificate, certificate.signs, 4, 5, 2);
    if (!success)
        return [false, reason];
    return [true, ''];
}
function info(...msg) {
    const entry = `Lost: ${msg.join(' ')}`;
}
function warn(...msg) {
    const entry = `Lost: ${msg.join(' ')}`;
    p2pLogger.warn(entry);
}
function error(...msg) {
    const entry = `Lost: ${msg.join(' ')}`;
    p2pLogger.error(entry);
}