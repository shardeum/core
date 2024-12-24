import { Logger } from 'log4js';
import { P2P } from '@shardus/types';
import { insertSorted, lerp, validateTypes } from '../utils';
import * as Comms from './Comms';
import { config, logger } from './Context';
import * as NodeList from './NodeList';
import * as Self from './Self';
import * as CycleCreator from './CycleCreator';
import * as CycleChain from './CycleChain';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { currentCycle } from './CycleCreator';
import { getExpiredRemovedV2 } from './ModeSystemFuncs';
import { logFlags } from '../logger';
import { Utils } from '@shardus/types';
let p2pLogger: Logger;
let lastLoggedCycle: number;
export function init(): void {
    p2pLogger = logger.getLogger('p2p');
    reset();
    lastLoggedCycle = 0;
}
export function reset(): void {
    return;
}
export function getTxs(): P2P.RotationTypes.Txs {
    return {};
}
export function validateRecordTypes(rec: P2P.RotationTypes.Record): string {
    const err = validateTypes(rec, { expired: 'n', removed: 'a' });
    if (err)
        return err;
    for (const item of rec.removed) {
        if (typeof item !== 'string')
            return 'items of removed array must be strings';
    }
    return '';
}
export function dropInvalidTxs(txs: P2P.RotationTypes.Txs): P2P.RotationTypes.Txs {
    return txs;
}
export function updateRecord(txs: P2P.RotationTypes.Txs & P2P.ApoptosisTypes.Txs, record: P2P.CycleCreatorTypes.CycleRecord, prev: P2P.CycleCreatorTypes.CycleRecord): void {
    if (!prev) {
        record.expired = 0;
        record.removed = [];
        return;
    }
    {
        const { expired, removed } = getExpiredRemoved(prev.start, prev.desired, txs);
    }
    const { expired, removed } = getExpiredRemovedV2(prev, lastLoggedCycle, txs, info);
    record.expired = expired;
    record.removed = removed;
}
export function parseRecord(record: P2P.CycleCreatorTypes.CycleRecord): P2P.CycleParserTypes.Change {
    if (record.removed.includes(Self.id)) {
        Self.emitter.emit('removed', Self.id);
    }
    return {
        added: [],
        removed: record.removed,
        updated: [],
    };
}
export function queueRequest(): void {
    return;
}
export function sendRequests(): void {
    return;
}
export function getExpiredRemoved(start: P2P.CycleCreatorTypes.CycleRecord['start'], desired: P2P.CycleCreatorTypes.CycleRecord['desired'], txs: P2P.RotationTypes.Txs & P2P.ApoptosisTypes.Txs): {
    expired: number;
    removed: string[];
} {
    let expired = 0;
    const removed = [];
    NodeList.potentiallyRemoved.clear();
    if (config.p2p.nodeExpiryAge < 0)
        return { expired, removed };
    const active = NodeList.activeByIdOrder.length;
    let expireTimestamp = (start - config.p2p.nodeExpiryAge) * 1000;
    if (expireTimestamp < 0)
        expireTimestamp = 0;
    let maxRemove = config.p2p.maxRotatedPerCycle;
    let scaleDownRemove = Math.max(active - desired, 0);
    const scaledAmountToShrink = getScaledAmountToShrink();
    if (scaleDownRemove > scaledAmountToShrink) {
        scaleDownRemove = scaledAmountToShrink;
    }
    const maxActiveNodesToRemove = Math.max(Math.floor(config.p2p.maxShrinkMultiplier * active), 1);
    const cycle = CycleChain.newest.counter;
    if (cycle > lastLoggedCycle && scaleDownRemove > 0) {
        lastLoggedCycle = cycle;
        if (logFlags?.node_rotation_debug)
            logger.mainLog_debug('GETEXPIREDREMOVED_DUMPNODES', 'scale down dump:' + Utils.safeStringify({ cycle, scaleFactor: CycleCreator.scaleFactor, scaleDownRemove, maxActiveNodesToRemove, desired, active, scaledAmountToShrink, maxRemove, expired, }));
    }
    if (maxRemove < 1) {
        maxRemove = scaleDownRemove;
    }
    else {
        maxRemove = Math.max(maxRemove, scaleDownRemove);
    }
    if (maxRemove > active - desired)
        maxRemove = active - desired;
    if (maxRemove > config.p2p.amountToShrink && maxRemove > maxActiveNodesToRemove) {
        maxRemove = Math.max(config.p2p.amountToShrink, maxActiveNodesToRemove);
    }
    const apoptosizedNodesList = [];
    for (const request of txs.apoptosis) {
        const node = NodeList.nodes.get(request.id);
        if (node) {
            apoptosizedNodesList.push(node.id);
        }
    }
    for (const node of NodeList.byJoinOrder) {
        if (node.status === 'syncing')
            continue;
        if (node.joinRequestTimestamp > expireTimestamp)
            break;
        expired++;
        if (config.p2p.uniqueRemovedIds) {
            if (removed.length + apoptosizedNodesList.length < maxRemove) {
                NodeList.potentiallyRemoved.add(node.id);
                if (!apoptosizedNodesList.includes(node.id)) {
                    insertSorted(removed, node.id);
                }
            }
            else
                break;
        }
        else {
            if (removed.length < maxRemove) {
                NodeList.potentiallyRemoved.add(node.id);
                insertSorted(removed, node.id);
            }
        }
    }
    return { expired, removed };
}
function info(...msg: string[]): void {
    const entry = `Rotation: ${msg.join(' ')}`;
}
function warn(...msg: string[]): void {
    const entry = `Rotation: ${msg.join(' ')}`;
    p2pLogger.warn(entry);
}
function error(...msg: string[]): void {
    const entry = `Rotation: ${msg.join(' ')}`;
    p2pLogger.error(entry);
}
function getScaledAmountToShrink(): number {
    const nonScaledAmount = config.p2p.amountToShrink;
    const scaledAmount = config.p2p.amountToShrink * CycleCreator.scaleFactor;
    const scaleInfluence = config.p2p.scaleInfluenceForShrink;
    return Math.floor(lerp(nonScaledAmount, scaledAmount, scaleInfluence));
}