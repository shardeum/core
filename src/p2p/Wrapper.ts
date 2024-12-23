import { EventEmitter } from 'events';
import * as Shardus from '../shardus/shardus-types';
import * as utils from '../utils';
import * as Active from './Active';
import { apoptosizeSelf } from './Apoptosis';
import * as Comms from './Comms';
import { config, setConfig } from './Context';
import * as CycleChain from './CycleChain';
import * as CycleCreator from './CycleCreator';
import * as NodeList from './NodeList';
import * as Self from './Self';
import * as Utils from './Utils';
import { logFlags } from '../logger';
import { getNodeRequestingJoin } from './Join';
import { P2P as P2PTypings } from '@shardus/types';
import * as CycleAutoScale from './CycleAutoScale';
import { ShardusTypes } from '../shardus';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { VectorBufferStream } from '../utils/serialization/VectorBufferStream';
import { AppHeader } from '@shardus/net/build/src/types';
import { InternalBinaryHandler } from '../types/Handler';
export class P2P extends EventEmitter {
    registerInternal: (route: any, handler: any) => void;
    registerInternalBinary: (route: string, handler: InternalBinaryHandler) => void;
    registerGossipHandler: (type: any, handler: any) => void;
    unregisterGossipHandler: (type: any) => void;
    unregisterInternal: (route: any) => void;
    ask: (node: ShardusTypes.Node, route: string, message?: {}, logged?: boolean, tracker?: string, extraTime?: number) => Promise<any>;
    askBinary: <TReq, TRes>(node: ShardusTypes.Node, route: string, message: TReq, reqSerializerFunc: (stream: VectorBufferStream, obj: TReq, root?: boolean) => void, respDeserializerFunc: (stream: VectorBufferStream, root?: boolean) => TRes, appHeader: AppHeader, tracker?: string, logged?: boolean, extraTime?: number) => Promise<TRes>;
    tell: (nodes: any, route: any, message: any, logged?: boolean, tracker?: string) => Promise<number>;
    tellBinary: <TReq>(nodes: ShardusTypes.Node[], route: string, message: TReq, serializerFunc: (stream: VectorBufferStream, obj: TReq, root?: boolean) => void, appHeader: AppHeader, logged?: boolean, tracker?: string) => Promise<number>;
    sendGossipIn: (type: any, payload: any, tracker?: string, sender?: any, inpNodes?: Shardus.NodeWithRank[] | Shardus.Node[], isOrigin?: boolean, factor?: number, txId?: string) => Promise<number>;
    sendGossipAll: (type: any, payload: any, tracker?: string, sender?: any, inpNodes?: P2PTypings.NodeListTypes.Node[]) => Promise<number>;
    robustQuery: any;
    state: typeof state;
    constructor() {
        super();
        this.registerInternal = Comms.registerInternal;
        this.registerInternalBinary = Comms.registerInternalBinary;
        this.registerGossipHandler = Comms.registerGossipHandler;
        this.unregisterGossipHandler = Comms.unregisterGossipHandler;
        this.unregisterInternal = Comms.unregisterInternal;
        this.ask = Comms.ask;
        this.askBinary = Comms.askBinary;
        this.tell = Comms.tell;
        this.tellBinary = Comms.tellBinary;
        this.sendGossipIn = Comms.sendGossip;
        this.robustQuery = Utils.robustQuery;
        this.sendGossipAll = Comms.sendGossipAll;
    }
    get isFirstSeed() {
        return Self.isFirst;
    }
    get isActive() {
        return Self.isActive;
    }
    get id() {
        return Self.id;
    }
    getNodeId() {
        return Self.id;
    }
    initApoptosis(message: string) {
        apoptosizeSelf(message);
    }
    allowTransactions() {
        return NodeList.activeByIdOrder.length >= config.p2p.minNodesToAllowTxs;
    }
    allowSet() {
        return NodeList.activeByIdOrder.length === 1;
    }
    setJoinRequestToggle(bool) { }
    getLatestCycles(amount) {
        if (CycleChain.cycles.length < amount) {
            return CycleChain.cycles;
        }
        return CycleChain.cycles.slice(0 - amount);
    }
    shutdown() {
        CycleCreator.shutdown();
    }
    configUpdated() {
        CycleAutoScale.configUpdated();
    }
}
export const p2p = new P2P();
class State extends EventEmitter {
    getNode(id: string): P2PTypings.NodeListTypes.Node | undefined {
        return NodeList.nodes.get(id);
    }
    getNodes() {
        return NodeList.nodes;
    }
    getNodesRequestingJoin(): P2PTypings.P2PTypes.P2PNode[] {
        return getNodeRequestingJoin();
    }
    getNodeByPubKey(pubkey) {
        if (NodeList.byPubKey.has(pubkey) !== true) {
        }
        return NodeList.byPubKey.get(pubkey);
    }
    getActiveNodes_orig(id) {
        return getSubsetOfNodeList(NodeList.activeByIdOrder, id);
    }
    getActiveNodes(id?) {
        if (id) {
            return Object.values(NodeList.activeOthersByIdOrder);
        }
        else {
            return Object.values(NodeList.activeByIdOrder);
        }
    }
    getOrderedSyncingNeighbors(node) {
        const nodes = NodeList.othersByIdOrder.filter((e) => e.status === 'syncing');
        return nodes;
    }
    getLastCycle() {
        return CycleChain.newest;
    }
    getCycleByCounter(counter) {
        const i = utils.binarySearch(CycleChain.cycles, { counter }, utils.propComparator('counter'));
        if (i > -1)
            return CycleChain.cycles[i];
        return null;
    }
    getCycleByTimestamp(timestamp) {
        const secondsTs = Math.floor(timestamp * 0.001);
        const i = utils.binarySearch(CycleChain.cycles, secondsTs, (ts, record) => {
            if (ts > record.start + record.duration) {
                return 1;
            }
            if (ts < record.start) {
                return -1;
            }
            return 0;
        });
        if (i > -1)
            return CycleChain.cycles[i];
        return null;
    }
}
const state = new State();
Self.emitter?.on('cycle_q1_start', () => {
    state.emit('cycle_q1_start');
});
Self.emitter?.on('cycle_q2_start', () => {
    state.emit('cycle_q2_start');
});
Self.emitter?.on('cycle_q3_start', () => {
    state.emit('cycle_q3_start');
});
p2p['state'] = state;
function getSubsetOfNodeList(nodes, self = null) {
    if (!self)
        return Object.values(nodes);
    if (!nodes[self]) {
        this.mainLogger.warn(`Invalid node ID in 'self' field. Given ID: ${self} : ${new Error().stack}`);
        return Object.values(nodes);
    }
    const nodesCopy = utils.deepCopy(nodes);
    delete nodesCopy[self];
    return Object.values(nodesCopy);
}