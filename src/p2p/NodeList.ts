import { hexstring } from '@shardus/crypto-utils';
import { P2P } from '@shardus/types';
import { Logger } from 'log4js';
import { isDebugModeMiddleware, isDebugModeMiddlewareLow } from '../network/debugMiddleware';
import { ShardusEvent } from '../shardus/shardus-types';
import { binarySearch, getTime, insertSorted, linearInsertSorted, propComparator, propComparator2 } from '../utils';
import * as Comms from './Comms';
import { config, crypto, logger, network } from './Context';
import * as CycleChain from './CycleChain';
import * as Join from './Join';
import { emitter, id } from './Self';
import rfdc from 'rfdc';
import { logFlags } from '../logger';
import { nestedCountersInstance } from '..';
import { shardusGetTime } from '../network';
import { getStandbyNodesInfoMap, standbyNodesInfo } from "./Join/v2";
import { getDesiredCount } from "./CycleAutoScale";
import { Utils } from '@shardus/types';
import { networkMode } from './Modes';
import { getNewestCycle } from './Sync';
const clone = rfdc();
let p2pLogger: Logger;
let mainLogger: Logger;
export let nodes: Map<P2P.NodeListTypes.Node['id'], P2P.NodeListTypes.Node>;
export let byPubKey: Map<P2P.NodeListTypes.Node['publicKey'], P2P.NodeListTypes.Node>;
export let byIpPort: Map<string, P2P.NodeListTypes.Node>;
export let byJoinOrder: P2P.NodeListTypes.Node[];
export let byIdOrder: P2P.NodeListTypes.Node[];
export let othersByIdOrder: P2P.NodeListTypes.Node[];
export let activeByIdOrder: P2P.NodeListTypes.Node[];
export let activeIdToPartition: Map<string, number>;
export let syncingByIdOrder: P2P.NodeListTypes.Node[];
export let selectedByIdOrder: P2P.NodeListTypes.Node[];
export let standbyByIdOrder: P2P.NodeListTypes.Node[];
export let readyByTimeAndIdOrder: P2P.NodeListTypes.Node[];
export let activeOthersByIdOrder: P2P.NodeListTypes.Node[];
export let potentiallyRemoved: Set<P2P.NodeListTypes.Node['id']>;
export let selectedById: Map<P2P.NodeListTypes.Node['id'], number>;
const VERBOSE = false;
reset('init');
export function init() {
    p2pLogger = logger.getLogger('p2p');
    mainLogger = logger.getLogger('main');
    network.registerExternalGet('network-stats', (req, res) => {
        try {
            const networkStats = {
                active: activeByIdOrder.length,
                syncing: syncingByIdOrder.length,
                ready: readyByTimeAndIdOrder.length,
                standby: getStandbyNodesInfoMap().size,
                desired: getDesiredCount(),
            };
            res.json(networkStats);
        }
        catch (e) {
        }
        return;
    });
    network.registerExternalGet('age-index', isDebugModeMiddlewareLow, (req, res) => {
        try {
            res.json(getAgeIndex());
        }
        catch (e) {
        }
        return;
    });
}
export function reset(caller: string) {
    nodes = new Map();
    byPubKey = new Map();
    byIpPort = new Map();
    byJoinOrder = [];
    byIdOrder = [];
    othersByIdOrder = [];
    activeByIdOrder = [];
    activeIdToPartition = new Map();
    syncingByIdOrder = [];
    selectedByIdOrder = [];
    standbyByIdOrder = [];
    readyByTimeAndIdOrder = [];
    activeOthersByIdOrder = [];
    potentiallyRemoved = new Set();
    selectedById = new Map();
}
export function addNode(node: P2P.NodeListTypes.Node, caller: string) {
    if (node == null) {
        return;
    }
    if (nodes.has(node.id)) {
        warn(`NodeList.addNode: tried to add duplicate ${node.externalPort}: ${Utils.safeStringify(node)}\n` + `${caller}`);
        return;
    }
    nodes.set(node.id, node);
    byPubKey.set(node.publicKey, node);
    byIpPort.set(ipPort(node.internalIp, node.internalPort), node);
    linearInsertSorted(byJoinOrder, node, propComparator2('syncingTimestamp', 'id'));
    insertSorted(byIdOrder, node, propComparator('id'));
    if (node.id !== id) {
        insertSorted(othersByIdOrder, node, propComparator('id'));
    }
    if (node.status === P2P.P2PTypes.NodeStatus.STANDBY) {
        insertSorted(standbyByIdOrder, node, propComparator('id'));
    }
    if (node.status === P2P.P2PTypes.NodeStatus.SELECTED) {
        insertSorted(selectedByIdOrder, node, propComparator('id'));
        selectedById.set(node.id, node.counterRefreshed);
    }
    if (node.status === P2P.P2PTypes.NodeStatus.SYNCING) {
        insertSorted(syncingByIdOrder, node, propComparator('id'));
    }
    if (node.status === P2P.P2PTypes.NodeStatus.READY) {
        linearInsertSorted(readyByTimeAndIdOrder, node, propComparator2('readyTimestamp', 'id'));
    }
    if (node.status === P2P.P2PTypes.NodeStatus.ACTIVE) {
        insertSorted(activeByIdOrder, node, propComparator('id'));
        for (let i = 0; i < activeByIdOrder.length; i++) {
            activeIdToPartition.set(activeByIdOrder[i].id, i);
        }
        if (node.id !== id) {
            insertSorted(activeOthersByIdOrder, node, propComparator('id'));
        }
        removeSyncingNode(node.id);
        removeReadyNode(node.id);
    }
}
export function addNodes(newNodes: P2P.NodeListTypes.Node[], caller: string) {
    for (const node of newNodes) {
        addNode(node, caller);
    }
}
export function removeSelectedNode(id: string) {
    selectedById.delete(id);
    const idx = binarySearch(selectedByIdOrder, { id }, propComparator('id'));
    if (idx >= 0)
        selectedByIdOrder.splice(idx, 1);
}
export function removeSyncingNode(id: string) {
    const idx = binarySearch(syncingByIdOrder, { id }, propComparator('id'));
    if (idx >= 0)
        syncingByIdOrder.splice(idx, 1);
}
export function removeReadyNode(id: string) {
    let idx = -1;
    for (let i = 0; i < readyByTimeAndIdOrder.length; i++) {
        if (readyByTimeAndIdOrder[i].id === id) {
            idx = i;
            break;
        }
    }
    if (idx >= 0)
        readyByTimeAndIdOrder.splice(idx, 1);
}
export function removeNode(id: string, raiseEvents: boolean, cycle: P2P.CycleCreatorTypes.CycleRecord | null) {
    let idx: number;
    if (!nodes.has(id)) {
        console.trace();
        return;
    }
    idx = binarySearch(selectedByIdOrder, { id }, propComparator('id'));
    if (idx >= 0)
        selectedByIdOrder.splice(idx, 1);
    idx = binarySearch(standbyByIdOrder, { id }, propComparator('id'));
    if (idx >= 0)
        standbyByIdOrder.splice(idx, 1);
    idx = binarySearch(activeOthersByIdOrder, { id }, propComparator('id'));
    if (idx >= 0)
        activeOthersByIdOrder.splice(idx, 1);
    idx = binarySearch(activeByIdOrder, { id }, propComparator('id'));
    if (idx >= 0) {
        activeByIdOrder.splice(idx, 1);
        activeIdToPartition.delete(id);
    }
    idx = binarySearch(othersByIdOrder, { id }, propComparator('id'));
    if (idx >= 0)
        othersByIdOrder.splice(idx, 1);
    idx = binarySearch(byIdOrder, { id }, propComparator('id'));
    if (idx >= 0)
        byIdOrder.splice(idx, 1);
    idx = binarySearch(syncingByIdOrder, { id }, propComparator('id'));
    if (idx >= 0)
        syncingByIdOrder.splice(idx, 1);
    if (config.p2p.hardenNewSyncingProtocol) {
        removeReadyNode(id);
    }
    else {
        idx = binarySearch(readyByTimeAndIdOrder, { id }, propComparator('id'));
        if (idx >= 0)
            readyByTimeAndIdOrder.splice(idx, 1);
    }
    const syncingTimestamp = nodes.get(id).syncingTimestamp;
    idx = binarySearch(byJoinOrder, { syncingTimestamp, id }, propComparator2('syncingTimestamp', 'id'));
    if (idx >= 0) {
        byJoinOrder.splice(idx, 1);
    }
    const node = nodes.get(id);
    byIpPort.delete(ipPort(node.internalIp, node.internalPort));
    byPubKey.delete(node.publicKey);
    nodes.delete(id);
    selectedById.delete(id);
    Comms.evictCachedSockets([node]);
    if (raiseEvents) {
        if (isNodeLeftNetworkEarly(node)) {
            const emitParams: Omit<ShardusEvent, 'type'> = {
                nodeId: node.id,
                reason: 'Node left early',
                time: cycle.start,
                publicKey: node.publicKey,
                cycleNumber: cycle.counter,
            };
            emitter.emit('node-left-early', emitParams);
        }
        const emitParams: Omit<ShardusEvent, 'type'> = {
            nodeId: node.id,
            reason: 'Node deactivated',
            time: cycle.start,
            publicKey: node.publicKey,
            cycleNumber: cycle.counter,
            activeCycle: node.activeCycle,
        };
        if (cycle.mode === 'shutdown' || networkMode === 'shutdown') {
            return;
        }
        emitter.emit('node-deactivated', emitParams);
    }
}
export function emitSyncTimeoutEvent(node: P2P.NodeListTypes.Node, cycle: P2P.CycleCreatorTypes.CycleRecord) {
    const emitParams: Omit<ShardusEvent, 'type'> = {
        nodeId: node.id,
        reason: 'Node sync timeout',
        time: cycle.start,
        publicKey: node.publicKey,
        cycleNumber: cycle.counter,
    };
    emitter.emit('node-sync-timeout', emitParams);
}
export function removeNodes(ids: string[], raiseEvents: boolean, cycle: P2P.CycleCreatorTypes.CycleRecord | null) {
    for (const id of ids)
        removeNode(id, raiseEvents, cycle);
}
export function updateNode(update: P2P.NodeListTypes.Update, raiseEvents: boolean, cycle: P2P.CycleCreatorTypes.CycleRecord | null) {
    const node = nodes.get(update.id);
    if (node) {
        for (const key of Object.keys(update)) {
            node[key] = update[key];
        }
        if (update.status === P2P.P2PTypes.NodeStatus.SYNCING) {
            insertSorted(syncingByIdOrder, node, propComparator('id'));
            removeSelectedNode(node.id);
        }
        else if (update.status === P2P.P2PTypes.NodeStatus.READY) {
            linearInsertSorted(readyByTimeAndIdOrder, node, propComparator2('readyTimestamp', 'id'));
            if (config.p2p.hardenNewSyncingProtocol) {
                if (selectedById.has(node.id))
                    removeSelectedNode(node.id);
            }
            removeSyncingNode(node.id);
        }
        else if (update.status === P2P.P2PTypes.NodeStatus.ACTIVE) {
            let idx = binarySearch(activeByIdOrder, { id: node.id }, propComparator('id'));
            if (idx < 0) {
                insertSorted(activeByIdOrder, node, propComparator('id'));
                for (let i = 0; i < activeByIdOrder.length; i++) {
                    activeIdToPartition.set(activeByIdOrder[i].id, i);
                }
                if (node.id !== id) {
                    insertSorted(activeOthersByIdOrder, node, propComparator('id'));
                }
                removeReadyNode(node.id);
                if (raiseEvents) {
                    const emitParams: Omit<ShardusEvent, 'type'> = {
                        nodeId: node.id,
                        reason: 'Node activated',
                        time: cycle.start,
                        publicKey: node.publicKey,
                        cycleNumber: cycle.counter,
                    };
                    if (cycle.mode === 'shutdown' || networkMode === 'shutdown') {
                        return;
                    }
                    emitter.emit('node-activated', emitParams);
                }
            }
        }
    }
}
export function updateNodes(updates: P2P.NodeListTypes.Update[], raiseEvents: boolean, cycle: P2P.CycleCreatorTypes.CycleRecord | null) {
    for (const update of updates)
        updateNode(update, raiseEvents, cycle);
}
export function isNodeLeftNetworkEarly(node: P2P.NodeListTypes.Node) {
    return CycleChain.newest && CycleChain.newest.lost.includes(node.id);
}
export function isNodeRefuted(node: P2P.NodeListTypes.Node) {
    return CycleChain.newest && CycleChain.newest.refuted.includes(node.id);
}
export function createNode(joined: P2P.JoinTypes.JoinedConsensor) {
    const node: P2P.NodeListTypes.Node = {
        ...joined,
        curvePublicKey: crypto.convertPublicKeyToCurve(joined.publicKey),
        status: P2P.P2PTypes.NodeStatus.SELECTED,
    };
    return node;
}
export function ipPort(ip: string, port: number) {
    return ip + ':' + port;
}
function idTrim(id: string) {
    return id.substr(0, 4);
}
export function getDebug() {
    let output = `
    NODES:
      hash:                  ${crypto.hash(byJoinOrder).slice(0, 5)}
      byJoinOrder:           [${byJoinOrder
        .map((node) => `${node.externalIp}:${node.externalPort}-${node.counterRefreshed}`)
        .join()}]
      byIdOrder:             [${byIdOrder
        .map((node) => `${node.externalIp}:${node.externalPort}` + '-x' + idTrim(node.id))
        .join()}]
      othersByIdOrder:       [${othersByIdOrder.map((node) => `${node.externalIp}:${node.externalPort}`)}]
      activeByIdOrder:       [${activeByIdOrder.map((node) => `${node.externalIp}:${node.externalPort}`)}]
      activeOthersByIdOrder: [${activeOthersByIdOrder.map((node) => `${node.externalIp}:${node.externalPort}`)}]
      `;
    if (VERBOSE)
        output += `
    NODELIST:   ${Utils.safeStringify(byJoinOrder)}
    CYCLECHAIN: ${Utils.safeStringify(CycleChain.cycles)}
  `;
    return output;
}
export function getAgeIndex(): {
    idx: number;
    total: number;
} {
    return getAgeIndexForNodeId(id);
}
export function getAgeIndexForNodeId(nodeId: string): {
    idx: number;
    total: number;
} {
    const totalNodes = activeByIdOrder.length;
    let index = 1;
    for (let i = byJoinOrder.length - 1; i >= 0; i--) {
        if (byJoinOrder[i].id === nodeId && byJoinOrder[i].status === P2P.P2PTypes.NodeStatus.ACTIVE) {
            return { idx: index, total: totalNodes };
        }
        else if (byJoinOrder[i].status === P2P.P2PTypes.NodeStatus.ACTIVE) {
            index++;
        }
    }
    return { idx: -1, total: totalNodes };
}
export function computeNewNodeListHash(): hexstring {
    lastHashedList = clone(byJoinOrder);
    if (logFlags.verbose)
        info('hashing validator list:', Utils.safeStringify(lastHashedList));
    let hash = crypto.hash(lastHashedList);
    if (logFlags.verbose)
        info('the new validator list hash is', hash);
    return hash;
}
export function getNodeListHash(): hexstring | undefined {
    if (config.p2p.writeSyncProtocolV2 || config.p2p.useSyncProtocolV2) {
        if (logFlags.verbose)
            info('returning validator list hash:', CycleChain.newest?.nodeListHash);
        return CycleChain.newest?.nodeListHash;
    }
    else {
        const nodelistIDs = activeByIdOrder.map((node) => node.id);
        return crypto.hash(nodelistIDs);
    }
}
let lastHashedList: P2P.NodeListTypes.Node[] = [];
export function getLastHashedNodeList(): P2P.NodeListTypes.Node[] {
    if (logFlags.verbose)
        info('returning last hashed validator list:', Utils.safeStringify(lastHashedList));
    return lastHashedList;
}
export function changeNodeListInRestore(cycleStartTimestamp: number) {
    info(`changeNodeListInRestore: ${cycleStartTimestamp}`);
    if (activeByIdOrder.length === 0)
        return;
    for (const node of activeByIdOrder) {
        node.syncingTimestamp = cycleStartTimestamp;
        insertSorted(syncingByIdOrder, node, propComparator('id'));
    }
    activeByIdOrder = [];
    activeOthersByIdOrder = [];
    for (const [, node] of nodes) {
        if (node.status === P2P.P2PTypes.NodeStatus.ACTIVE) {
            node.status = P2P.P2PTypes.NodeStatus.SYNCING;
            node.syncingTimestamp = cycleStartTimestamp;
        }
    }
    for (const [, node] of byPubKey) {
        if (node.status === P2P.P2PTypes.NodeStatus.ACTIVE) {
            node.status = P2P.P2PTypes.NodeStatus.SYNCING;
            node.syncingTimestamp = cycleStartTimestamp;
        }
    }
    for (const [, node] of byIpPort) {
        if (node.status === P2P.P2PTypes.NodeStatus.ACTIVE) {
            node.status = P2P.P2PTypes.NodeStatus.SYNCING;
            node.syncingTimestamp = cycleStartTimestamp;
        }
    }
    for (const node of byJoinOrder) {
        if (node.status === P2P.P2PTypes.NodeStatus.ACTIVE) {
            node.status = P2P.P2PTypes.NodeStatus.SYNCING;
            node.syncingTimestamp = cycleStartTimestamp;
        }
    }
    for (const node of byIdOrder) {
        if (node.status === P2P.P2PTypes.NodeStatus.ACTIVE) {
            node.status = P2P.P2PTypes.NodeStatus.SYNCING;
            node.syncingTimestamp = cycleStartTimestamp;
        }
    }
    for (const node of othersByIdOrder) {
        if (node.status === P2P.P2PTypes.NodeStatus.ACTIVE) {
            node.status = P2P.P2PTypes.NodeStatus.SYNCING;
            node.syncingTimestamp = cycleStartTimestamp;
        }
    }
}
function info(...msg: string[]) {
    const entry = `NodeList: ${msg.join(' ')}`;
}
function warn(...msg: string[]) {
    const entry = `NodeList: ${msg.join(' ')}`;
    p2pLogger.warn(entry);
}
function error(...msg: any[]) {
    const entry = `NodeList: ${msg.join(' ')}`;
    p2pLogger.error(entry);
}