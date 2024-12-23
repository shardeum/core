import { P2P, hexstring } from '@shardus/types';
import { JoinRequest } from '@shardus/types/build/src/p2p/JoinTypes';
import { config, crypto, shardus } from '../../Context';
import * as CycleChain from '../../CycleChain';
import * as Self from '../../Self';
import rfdc from 'rfdc';
import { executeNodeSelection, notifyNewestJoinedConsensors } from './select';
import { attempt } from '../../Utils';
import { submitUnjoin } from './unjoin';
import { ResultAsync } from 'neverthrow';
import { reset as resetAcceptance } from './acceptance';
import { stringifyReduce } from '../../../utils/functions/stringifyReduce';
import { logFlags } from '../../../logger';
import { Utils } from '@shardus/types';
const clone = rfdc();
type publickey = JoinRequest['nodeInfo']['publicKey'];
export const standbyNodesInfo: Map<publickey, JoinRequest> = new Map();
export const standbyNodesInfoHashes: Map<publickey, string> = new Map();
export const standbyNodesRefresh: Map<publickey, number> = new Map();
let newJoinRequests: JoinRequest[] = [];
export function init(): void {
    Self.emitter.on('cycle_q1_start', () => {
        if (config.p2p.useJoinProtocolV2) {
        }
    });
    Self.emitter.on('cycle_q2_start', () => {
        if (config.p2p.useJoinProtocolV2)
            executeNodeSelection();
    });
}
function addJoinRequestToStandbyMap(joinRequest: JoinRequest): void {
    standbyNodesInfo.set(joinRequest.nodeInfo.publicKey, joinRequest);
    standbyNodesInfoHashes.set(joinRequest.nodeInfo.publicKey, crypto.hash(joinRequest));
}
export function deleteStandbyNodeFromMap(key: publickey): boolean {
    if (standbyNodesInfo.has(key)) {
        standbyNodesInfo.delete(key);
        standbyNodesInfoHashes.delete(key);
        return true;
    }
    return false;
}
export function saveJoinRequest(joinRequest: JoinRequest, persistImmediately = false): void {
    if (persistImmediately) {
        addJoinRequestToStandbyMap(joinRequest);
        return;
    }
    newJoinRequests.push(joinRequest);
}
export function drainNewJoinRequests(): JoinRequest[] {
    const tmp = newJoinRequests;
    newJoinRequests = [];
    return tmp;
}
export function addStandbyJoinRequests(nodes: JoinRequest[], logErrors = false): void {
    for (const joinRequest of nodes) {
        if (getStandbyNodesInfoMap().size >= config.p2p.maxStandbyCount) {
            if (logErrors && logFlags.important_as_fatal)
                console.error('standby nodes list is max capacity reached. Cannot add more nodes.');
            return;
        }
        if (joinRequest == null) {
            if (logErrors && logFlags.important_as_fatal)
                console.error('null node in standby list');
            continue;
        }
        if (joinRequest.nodeInfo == null) {
            if (logErrors && logFlags.important_as_fatal)
                console.error('null node.nodeInfo in standby list: ' + Utils.safeStringify(joinRequest));
            continue;
        }
        addJoinRequestToStandbyMap(joinRequest);
    }
}
let lastHashedList: JoinRequest[] = [];
export function getSortedStandbyJoinRequests(): JoinRequest[] {
    return [...standbyNodesInfo.values()].sort((a, b) => a.nodeInfo.publicKey > b.nodeInfo.publicKey ? 1 : -1);
}
export function computeNewStandbyListHash(): hexstring {
    if (config.p2p.standbyListFastHash) {
        lastHashedList = Array.from(getSortedStandbyJoinRequests());
        const hashes = Array.from(standbyNodesInfoHashes.values());
        hashes.sort();
        const hash = crypto.hash(hashes);
        return hash;
    }
    lastHashedList = Array.from(getSortedStandbyJoinRequests());
    const hash = crypto.hash(lastHashedList);
    if (logFlags.verbose) {
        const publicKeyList = lastHashedList.map((node) => node.nodeInfo.publicKey);
    }
    return hash;
}
export function getStandbyListHash(): hexstring | undefined {
    return CycleChain.newest?.standbyNodeListHash;
}
export function getTxListHash(): hexstring | undefined {
    return CycleChain.newest?.txlisthash;
}
export function getLastHashedStandbyList(): JoinRequest[] {
    return lastHashedList;
}
export function getStandbyNodesInfoMap(): Map<publickey, JoinRequest> {
    return standbyNodesInfo;
}
export function updateStandbyRefreshCounter(updatedJoinRequest: JoinRequest): void {
    const originalJoinRequest = standbyNodesInfo.get(updatedJoinRequest.nodeInfo.publicKey);
    if (areJoinRequestsIdenticalExceptRefreshCounter(originalJoinRequest, updatedJoinRequest)) {
        if (standbyNodesRefresh.has(updatedJoinRequest.nodeInfo.publicKey))
            standbyNodesInfo.set(updatedJoinRequest.nodeInfo.publicKey, updatedJoinRequest);
        if (standbyNodesInfoHashes.has(updatedJoinRequest.nodeInfo.publicKey))
            standbyNodesInfoHashes.set(updatedJoinRequest.nodeInfo.publicKey, crypto.hash(updatedJoinRequest));
    }
    else {
        console.error('Trying to update Join request fields other than refreshedCounter. Ignoring the update.');
    }
}
function areJoinRequestsIdenticalExceptRefreshCounter(original: JoinRequest, updated: JoinRequest): boolean {
    const originalCopy = Utils.safeJsonParse(Utils.safeStringify(original));
    const updatedCopy = Utils.safeJsonParse(Utils.safeStringify(updated));
    delete originalCopy.refreshedCounter;
    delete updatedCopy.refreshedCounter;
    return deepEqual(originalCopy, updatedCopy);
}
function deepEqual(obj1, obj2): boolean {
    if (obj1 === obj2) {
        return true;
    }
    if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
        return false;
    }
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    if (keys1.length !== keys2.length) {
        return false;
    }
    for (const key of keys1) {
        if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
            return false;
        }
    }
    return true;
}
export function isOnStandbyList(publicKey: string): boolean {
    if (standbyNodesInfo.has(publicKey)) {
        return true;
    }
    else {
        return false;
    }
}
export function debugDumpJoinRequestList(list: JoinRequest[], message: string): void {
    list.sort((a, b) => (a.nodeInfo.publicKey > b.nodeInfo.publicKey ? 1 : -1));
    const result = list.map((node) => ({
        pubKey: node.nodeInfo.publicKey,
        port: node.nodeInfo.externalPort,
    }));
}
export async function shutdown(): Promise<void> {
    if (!config.p2p.useJoinProtocolV2)
        return;
    const unjoinResult = await ResultAsync.fromPromise(attempt(async () => submitUnjoin(), {
        delay: 1000,
        maxRetries: 5,
    }), (err) => err as Error).andThen((result) => result);
    resetAcceptance();
    if (unjoinResult.isErr()) {
        console.error('Failed send unjoin request:', unjoinResult.error);
    }
    else {
    }
}