import * as NodeList from '../../NodeList';
import { FinishedSyncingRequest, JoinRequest } from '@shardus/types/build/src/p2p/JoinTypes';
import { SignedObject } from '@shardus/crypto-utils';
import * as CycleChain from '../../CycleChain';
import { crypto } from '../../Context';
import { nestedCountersInstance } from '../../../utils/nestedCounters';
import { config } from '../../Context';
import { P2P } from '@shardus/types';
import { logFlags } from '../../../logger';
import { isFirst } from '../../Self';
export let newSyncFinishedNodes: Map<string, FinishedSyncingRequest> = new Map();
export interface FinishedSyncingRequestResponse {
    success: boolean;
    reason: string;
    fatal: boolean;
}
export function addFinishedSyncing(finishedSyncRequest: FinishedSyncingRequest): FinishedSyncingRequestResponse {
    const node = NodeList.byIdOrder.find((node) => node.id === finishedSyncRequest.nodeId);
    const publicKeysMatch = (node?.publicKey || crypto.keypair.publicKey) === finishedSyncRequest.sign.owner;
    if (!publicKeysMatch) {
        return {
            success: false,
            reason: 'public key in addFinishedSyncing does not match public key of node',
            fatal: false,
        };
    }
    const cycleNumber = CycleChain.getNewest().counter;
    if (cycleNumber !== finishedSyncRequest.cycleNumber) {
        return {
            success: false,
            reason: `cycleNumber in request does not match cycleNumber of node`,
            fatal: false,
        };
    }
    if (newSyncFinishedNodes.has(finishedSyncRequest.nodeId) === true) {
        return {
            success: false,
            reason: `node has already submitted syncFinished request`,
            fatal: false,
        };
    }
    if (!crypto.verify(finishedSyncRequest as SignedObject, finishedSyncRequest.sign.owner)) {
        return {
            success: false,
            reason: 'verification of syncFinished request failed',
            fatal: false,
        };
    }
    newSyncFinishedNodes.set(finishedSyncRequest.nodeId, finishedSyncRequest);
    return {
        success: true,
        reason: `Node ${finishedSyncRequest.nodeId} added to syncFinishedNodesInfo map`,
        fatal: false,
    };
}
export function drainFinishedSyncingRequest(): FinishedSyncingRequest[] {
    const tmp = Array.from(newSyncFinishedNodes.values());
    newSyncFinishedNodes = new Map<string, FinishedSyncingRequest>();
    return tmp;
}
export function isNodeSelectedReadyList(nodeId: string): boolean {
    const mode = CycleChain.getNewest().mode;
    const listToCheck = mode === 'processing'
        ? NodeList.readyByTimeAndIdOrder.slice(0, config.p2p.allowActivePerCycle)
        : NodeList.readyByTimeAndIdOrder;
    return listToCheck.some((readyNode) => readyNode.id === nodeId);
}
export function selectNodesFromReadyList(mode: string): P2P.NodeListTypes.Node[] {
    if (mode === 'processing') {
        let nodesToAllowActive = config.p2p.allowActivePerCycle;
        if (config.p2p.activeRecoveryEnabled) {
            if (CycleChain.newest != null) {
                const active = CycleChain.newest.active;
                const desired = CycleChain.newest.desired;
                const deficit = desired - active;
                if (deficit > 0) {
                    const boost = Math.min(config.p2p.allowActivePerCycleRecover, deficit);
                    nodesToAllowActive = Math.max(nodesToAllowActive, boost);
                }
            }
        }
        if (config.debug.readyNodeDelay > 0) {
            return NodeList.readyByTimeAndIdOrder.slice(0, nodesToAllowActive).filter((node) => CycleChain.newest.start >= node.readyTimestamp + config.debug.readyNodeDelay);
        }
        return NodeList.readyByTimeAndIdOrder.slice(0, nodesToAllowActive);
    }
    else {
        if (mode === 'forming' && isFirst && NodeList.activeByIdOrder.length === 0)
            return NodeList.readyByTimeAndIdOrder;
        if (config.debug.readyNodeDelay > 0) {
            return NodeList.readyByTimeAndIdOrder.filter((node) => CycleChain.newest.start >= node.readyTimestamp + config.debug.readyNodeDelay);
        }
        return NodeList.readyByTimeAndIdOrder;
    }
}