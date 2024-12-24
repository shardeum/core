import { P2P } from '@shardus/types';
import { insertSorted } from '../../utils';
import { removeArchiverByPublicKey } from '../Archivers';
import { errorForArchiverDownMsg, errorForArchiverUpMsg, informInvestigator, tellNetworkArchiverIsDown, tellNetworkArchiverIsUp, } from './functions';
import { info, initLogging } from './logging';
import { registerRoutes } from './routes';
import { lostArchiversMap } from './state';
import { ArchiverDownMsg, ArchiverUpMsg } from '@shardus/types/build/src/p2p/LostArchiverTypes';
import { SignedObject } from '@shardus/types/build/src/p2p/P2PTypes';
import { inspect } from 'util';
import { logFlags } from '../../logger';
import { Utils } from '@shardus/types';
export function init(): void {
    initLogging();
    info('init() called');
    reset();
    registerRoutes();
}
export function reset(): void {
    info('reset() called');
}
export function getTxs(): P2P.LostArchiverTypes.Txs {
    if (logFlags.p2pNonFatal)
        info('getTxs() called');
    const lostArchivers: SignedObject<ArchiverDownMsg>[] = [];
    const refutedArchivers: SignedObject<ArchiverUpMsg>[] = [];
    if (logFlags.p2pNonFatal)
        info('  looping through lostArchiversMap');
    for (const entry of lostArchiversMap.values()) {
        if (logFlags.p2pNonFatal)
            info(`    record: ${inspect(entry)}`);
        if (entry.isInvestigator && !entry.gossippedDownMsg)
            continue;
        if (entry.status === 'down' && entry.archiverDownMsg) {
            insertSorted(lostArchivers, entry.archiverDownMsg);
        }
        if (entry.status === 'up' && entry.archiverUpMsg) {
            insertSorted(refutedArchivers, entry.archiverUpMsg);
        }
    }
    if (logFlags.p2pNonFatal)
        info('===Lost Archivers Txs===');
    if (logFlags.p2pNonFatal)
        info(`lostArchivers: ${inspect(lostArchivers)}`);
    if (logFlags.p2pNonFatal)
        info(`refutedArchivers: ${inspect(refutedArchivers)}`);
    if (logFlags.p2pNonFatal)
        info('===Lost Archivers Txs===');
    return {
        lostArchivers,
        refutedArchivers,
    };
}
export function dropInvalidTxs(txs: P2P.LostArchiverTypes.Txs): P2P.LostArchiverTypes.Txs {
    if (logFlags.p2pNonFatal)
        info('dropInvalidTxs() called');
    const lostArchivers = txs.lostArchivers.filter((tx) => errorForArchiverDownMsg(tx) === null);
    const refutedArchivers = txs.refutedArchivers.filter((tx) => errorForArchiverUpMsg(tx) === null);
    return {
        lostArchivers,
        refutedArchivers,
    };
}
export function updateRecord(txs: P2P.LostArchiverTypes.Txs, record: P2P.CycleCreatorTypes.CycleRecord, prev: P2P.CycleCreatorTypes.CycleRecord): void {
    if (logFlags.p2pNonFatal)
        info('updateRecord function called');
    const lostArchivers = [];
    const refutedArchivers = [];
    const removedArchivers = [];
    for (const tx of txs.lostArchivers) {
        const target = tx.investigateMsg?.target;
        if (target) {
            insertSorted(lostArchivers, target);
        }
        else {
        }
    }
    for (const tx of txs.refutedArchivers) {
        const target = tx.downMsg?.investigateMsg?.target;
        if (target) {
            insertSorted(refutedArchivers, target);
        }
        else {
        }
    }
    if (prev) {
        for (const publicKey of prev.lostArchivers) {
            const record = lostArchiversMap.get(publicKey);
            if (!record)
                continue;
            if (record.cyclesToWait > 0) {
                record.cyclesToWait--;
            }
            else {
                insertSorted(removedArchivers, publicKey);
            }
        }
    }
    record.lostArchivers = lostArchivers;
    record.refutedArchivers = refutedArchivers;
    record.removedArchivers = removedArchivers;
}
export function parseRecord(record: P2P.CycleCreatorTypes.CycleRecord): P2P.CycleParserTypes.Change {
    if (logFlags.p2pNonFatal)
        info('parseRecord function called');
    for (const publicKey of record.removedArchivers) {
        removeArchiverByPublicKey(publicKey);
        lostArchiversMap.delete(publicKey);
    }
    for (const publicKey of record.refutedArchivers) {
        lostArchiversMap.delete(publicKey);
    }
    return {
        added: [],
        removed: [],
        updated: [],
    };
}
export function queueRequest(request: any): void {
}
export function sendRequests(): void {
    if (logFlags.p2pNonFatal)
        info('sendRequests function called');
    if (logFlags.p2pNonFatal)
        info('=== lostArchiversMap ===');
    if (logFlags.p2pNonFatal)
        info(`${inspect(lostArchiversMap)}`);
    if (logFlags.p2pNonFatal)
        info('=== lostArchiversMap ===');
    for (const [publicKey, record] of lostArchiversMap) {
        if (logFlags.p2pNonFatal)
            info(`  record: ${inspect(record)}`);
        if (record.status === 'reported') {
            informInvestigator(publicKey);
            lostArchiversMap.delete(publicKey);
            continue;
        }
        if (record.isInvestigator) {
            if (record.status === 'down' && !record.gossippedDownMsg) {
                tellNetworkArchiverIsDown(record);
                record.gossippedDownMsg = true;
            }
            continue;
        }
        if (record.status === 'up' && !record.gossippedUpMsg) {
            tellNetworkArchiverIsUp(record);
            record.gossippedUpMsg = true;
            continue;
        }
    }
    return;
}
export function validateRecordTypes(rec: P2P.ActiveTypes.Record): string {
    return '';
}