import deepmerge from 'deepmerge';
import { Logger } from 'log4js';
import { P2P } from '@shardus/types';
import { propComparator2, reversed, validateTypes } from '../utils';
import * as Archivers from './Archivers';
import { logger } from './Context';
import { cycles, newest } from './CycleChain';
import * as NodeList from './NodeList';
import { totalNodeCount } from './Sync';
import * as Context from './Context';
let p2pLogger: Logger;
export function init() {
    p2pLogger = logger.getLogger('p2p');
    reset();
}
export function reset() { }
export function getTxs(): P2P.RefreshTypes.Txs {
    return {};
}
export function validateRecordTypes(rec: P2P.RefreshTypes.Record): string {
    let err = validateTypes(rec, { refreshedArchivers: 'a', refreshedConsensors: 'a' });
    if (err)
        return err;
    for (const item of rec.refreshedArchivers) {
        err = validateTypes(item, { publicKey: 's', ip: 's', port: 'n', curvePk: 's' });
        if (err)
            return 'in refreshedArchivers array ' + err;
    }
    for (const item of rec.refreshedConsensors) {
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
            curvePublicKey: 's',
            status: 's',
        });
        if (err)
            return 'in joinedConsensors array ' + err;
    }
    return '';
}
export function dropInvalidTxs(txs: P2P.RefreshTypes.Txs): P2P.RefreshTypes.Txs {
    return txs;
}
export function updateRecord(txs: P2P.RefreshTypes.Txs, record: P2P.CycleCreatorTypes.CycleRecord, prev: P2P.CycleCreatorTypes.CycleRecord): void {
    if (Context.config.p2p.useSyncProtocolV2) {
        record.refreshedArchivers = [];
        record.refreshedConsensors = [];
    }
    else {
        record.refreshedArchivers = Archivers.getRefreshedArchivers(record);
        record.refreshedConsensors = refreshConsensors();
    }
}
export function parseRecord(record: P2P.CycleCreatorTypes.CycleRecord): P2P.CycleParserTypes.Change {
    const added: P2P.CycleParserTypes.Change['added'] = [];
    const updated: P2P.CycleParserTypes.Change['updated'] = [];
    if (!Context.config.p2p.useSyncProtocolV2) {
        for (const refreshed of record.refreshedArchivers) {
            if (Archivers.archivers.has(refreshed.publicKey) === false) {
                Archivers.archivers.set(refreshed.publicKey, refreshed);
            }
        }
        for (const refreshed of record.refreshedConsensors) {
            const node = NodeList.nodes.get(refreshed.id);
            if (node) {
                if (record.counter > node.counterRefreshed) {
                    updated.push({ id: refreshed.id, counterRefreshed: record.counter });
                }
            }
            else {
                added.push(refreshed);
                updated.push({
                    id: refreshed.id,
                    status: P2P.P2PTypes.NodeStatus.ACTIVE,
                    counterRefreshed: record.counter,
                });
            }
        }
    }
    return {
        added,
        removed: [],
        updated,
    };
}
export function queueRequest(request) { }
export function sendRequests() { }
function refreshConsensors() {
    const refreshCount = getRefreshCount();
    const nodesToRefresh = [...NodeList.activeByIdOrder]
        .sort(propComparator2('counterRefreshed', 'id'))
        .splice(0, refreshCount)
        .map((node) => deepmerge({}, node));
    return nodesToRefresh;
}
export function getRefreshCount() {
    return Math.floor(Math.sqrt(NodeList.activeByIdOrder.length));
}
export function cyclesToKeep() {
    let count = 1;
    let seen = new Map();
    let removed = [];
    let refuted = [];
    for (const record of reversed(cycles)) {
        if (record.refuted.length > 0) {
            refuted = [...refuted, ...record.refuted];
        }
        if (newest.counter !== record.counter) {
            if (record.lost.length > 0) {
                removed = [...removed, ...record.lost.filter((id) => !refuted.includes(id))];
            }
            if (record.lostSyncing.length > 0) {
                removed = [...removed, ...record.lostSyncing.filter((id) => !refuted.includes(id))];
            }
        }
        if (record.apoptosized.length > 0) {
            removed = [...removed, ...record.apoptosized];
        }
        if (record.removed.length > 0) {
            removed = [...removed, ...record.removed];
        }
        for (const n of record.refreshedConsensors) {
            if (!removed.includes(n.id) && !seen.has(n.id))
                seen.set(n.id, 1);
        }
        for (const n of record.joinedConsensors) {
            if (!removed.includes(n.id) && !seen.has(n.id))
                seen.set(n.id, 1);
        }
        if (seen.size >= totalNodeCount(newest))
            break;
        count++;
    }
    info('cycles to keep is ' + count);
    count = count * Context.config.p2p.extraCyclesToKeepMultiplier;
    return count + Context.config.p2p.extraCyclesToKeep;
}
function info(...msg) {
    const entry = `Refresh: ${msg.join(' ')}`;
}
function warn(...msg) {
    const entry = `Refresh: ${msg.join(' ')}`;
    p2pLogger.warn(entry);
}
function error(...msg) {
    const entry = `Refresh: ${msg.join(' ')}`;
    p2pLogger.error(entry);
}