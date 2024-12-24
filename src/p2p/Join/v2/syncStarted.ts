import { logFlags } from '../../../logger';
import * as NodeList from '../../NodeList';
import { StartedSyncingRequest } from '@shardus/types/build/src/p2p/JoinTypes';
import { SignedObject } from '@shardus/types/build/src/p2p/P2PTypes';
import * as CycleChain from '../../CycleChain';
import { crypto } from '../../Context';
import { currentQuarter } from '../../CycleCreator';
export const nodesYetToStartSyncing: Map<string, number> = new Map();
export let lostAfterSelection: string[] = [];
let newSyncStarted: Map<string, StartedSyncingRequest> = new Map();
export interface SyncStartedRequestResponse {
    success: boolean;
    reason: string;
    fatal: boolean;
}
export function addSyncStarted(syncStarted: StartedSyncingRequest): SyncStartedRequestResponse {
    const publicKeysMatch = ((NodeList.byIdOrder.find((node) => node.id === syncStarted.nodeId))?.publicKey) === syncStarted.sign.owner;
    if (!publicKeysMatch) {
        return {
            success: false,
            reason: 'public key in syncStarted request does not match public key of node',
            fatal: false,
        };
    }
    const cycleNumber = CycleChain.getNewest().counter;
    if (cycleNumber !== syncStarted.cycleNumber) {
        return {
            success: false,
            reason: 'cycle number in syncStarted request does not match current cycle number',
            fatal: false,
        };
    }
    if (newSyncStarted.has(syncStarted.nodeId) === true) {
        return {
            success: false,
            reason: 'node has already submitted syncStarted request',
            fatal: false,
        };
    }
    if (!crypto.verify(syncStarted as unknown as SignedObject, syncStarted.sign.owner)) {
        return {
            success: false,
            reason: 'verification of syncStarted request failed',
            fatal: false,
        };
    }
    newSyncStarted.set(syncStarted.nodeId, syncStarted);
    return {
        success: true,
        reason: 'syncStarted passed all checks and verification',
        fatal: false,
    };
}
export function drainSyncStarted(): StartedSyncingRequest[] {
    if (currentQuarter === 3) {
        const tmp = newSyncStarted;
        newSyncStarted = new Map<string, StartedSyncingRequest>();
        return [...tmp.entries()].sort((a, b) => a[0].localeCompare(b[0])).map((entry) => entry[1]);
    }
    else {
        return [];
    }
}
export function drainLostAfterSelectionNodes(): string[] {
    if (currentQuarter === 3) {
        const tmp = lostAfterSelection;
        lostAfterSelection = [];
        return tmp.sort();
    }
    else {
        return [];
    }
}