import { Logger } from 'log4js';
import { P2P } from '@shardus/types';
import * as Comms from './Comms';
import * as Context from './Context';
import * as Self from './Self';
import { validateTypes } from '../utils';
import { hasAlreadyEnteredProcessing } from './CycleCreator';
import * as NodeList from './NodeList';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { logFlags } from '../logger';
let p2pLogger: Logger;
export let networkMode: P2P.ModesTypes.Record['mode'] = 'forming';
export function init(): void {
    p2pLogger = Context.logger.getLogger('p2p');
    reset();
}
export function reset(): void {
    return;
}
export function getTxs(): P2P.ModesTypes.Txs {
    return;
}
export function dropInvalidTxs(txs: P2P.ModesTypes.Txs): P2P.ModesTypes.Txs {
    return;
}
export function updateRecord(txs: P2P.ModesTypes.Txs, record: P2P.CycleCreatorTypes.CycleRecord, prev: P2P.CycleCreatorTypes.CycleRecord): void {
    const active = NodeList.activeByIdOrder.length;
    const { initShutdown, forcedMode } = Context.config.p2p;
    const validModes: P2P.ModesTypes.Record['mode'][] = [
        'safety',
    ];
    if (forcedMode && forcedMode !== '') {
        if (validModes.includes(forcedMode as P2P.ModesTypes.Record['mode'])) {
            record.mode = forcedMode as P2P.ModesTypes.Record['mode'];
        }
        else {
        }
        return;
    }
    if (initShutdown) {
        record.mode = 'shutdown';
        return;
    }
    if (prev) {
        if (prev.mode === undefined && prev.safetyMode !== undefined) {
            if (hasAlreadyEnteredProcessing === false) {
                record.mode = 'forming';
            }
            else if (enterProcessing(active)) {
                record.mode = 'processing';
            }
            else if (enterSafety(active)) {
                record.mode = 'safety';
            }
            else if (enterRecovery(active)) {
                record.mode = 'recovery';
            }
        }
        else {
            record.mode = prev.mode;
            if (prev.mode === 'forming') {
                if (enterProcessing(active)) {
                    record.mode = 'processing';
                }
            }
            else if (prev.mode === 'processing') {
                if (enterShutdown(active)) {
                    record.mode = 'shutdown';
                }
                else if (enterRecovery(active)) {
                    record.mode = 'recovery';
                }
                else if (enterSafety(active)) {
                    record.mode = 'safety';
                }
            }
            else if (prev.mode === 'safety') {
                if (enterShutdown(active)) {
                    record.mode = 'shutdown';
                }
                else if (enterRecovery(active)) {
                    record.mode = 'recovery';
                }
                else if (enterProcessing(active)) {
                    record.mode = 'processing';
                }
            }
            else if (prev.mode === 'recovery') {
                if (enterShutdown(active)) {
                    record.mode = 'shutdown';
                }
                else if (enterRestore(active + prev.syncing)) {
                    record.mode = 'restore';
                }
            }
            else if (prev.mode === 'shutdown' && Self.isFirst) {
                record.mode = 'restart';
            }
            else if (prev.mode === 'restart') {
                if (enterRestore(prev.syncing)) {
                    record.mode = 'restore';
                }
            }
            else if (prev.mode === 'restore') {
                if (enterProcessing(active)) {
                    record.mode = 'processing';
                }
            }
        }
    }
    else if (Self.isFirst) {
        record.mode = 'forming';
    }
}
export function validateRecordTypes(rec: P2P.ModesTypes.Record): string {
    const err = validateTypes(rec, { mode: 's' });
    if (err)
        return err;
    return '';
}
export function parseRecord(record: P2P.CycleCreatorTypes.CycleRecord): P2P.CycleParserTypes.Change {
    if ((networkMode === 'restart' || networkMode === 'recovery') && record.mode === 'restore') {
        Self.emitter.emit('restore', record.counter);
    }
    if (networkMode === 'restore' && record.mode === 'processing') {
        Self.setRestartNetwork(false);
    }
    networkMode = record.mode;
    if (networkMode === 'restart' && !Self.isRestartNetwork)
        Self.setRestartNetwork(true);
    return {
        added: [],
        removed: [],
        updated: [],
    };
}
export function queueRequest(): void {
    return;
}
export function sendRequests(): void {
    return;
}
export function enterRecovery(activeCount: number): boolean {
    const threshold = Context.config.p2p.networkBaselineEnabled
        ? Context.config.p2p.baselineNodes
        : Context.config.p2p.minNodes;
    return activeCount < 0.75 * threshold;
}
export function enterShutdown(activeCount: number): boolean {
    const threshold = Context.config.p2p.networkBaselineEnabled
        ? Context.config.p2p.baselineNodes
        : Context.config.p2p.minNodes;
    return activeCount <= 0.3 * threshold;
}
export function enterSafety(activeCount: number): boolean {
    const threshold = Context.config.p2p.networkBaselineEnabled
        ? Context.config.p2p.baselineNodes
        : Context.config.p2p.minNodes;
    return activeCount >= 0.75 * threshold && activeCount < 0.9 * threshold;
}
export function enterProcessing(activeCount: number): boolean {
    return activeCount >= Context.config.p2p.minNodes;
}
export function isInternalTxAllowed(): boolean {
    return ['processing', 'safety', 'forming'].includes(networkMode);
}
export function enterRestore(totalNodeCount: number): boolean {
    const threshold = Context.config.p2p.networkBaselineEnabled
        ? Context.config.p2p.baselineNodes
        : Context.config.p2p.minNodes;
    return totalNodeCount >= threshold + Context.config.p2p.extraNodesToAddInRestart;
}