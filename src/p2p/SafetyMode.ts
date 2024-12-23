import { Logger } from 'log4js';
import { P2P } from '@shardus/types';
import * as Snapshot from '../snapshot';
import * as Comms from './Comms';
import * as Context from './Context';
import * as Self from './Self';
let p2pLogger: Logger;
let cycleNumberForNetworkDataHash: number = 0;
let cycleNumberForNetworkReceiptHash: number = 0;
let cycleNumberForNetworkSummaryHash: number = 0;
export function init() {
    p2pLogger = Context.logger.getLogger('p2p');
    reset();
}
export function reset() { }
export function getTxs(): P2P.SafetyModeTypes.Txs {
    return;
}
export function dropInvalidTxs(txs: P2P.SafetyModeTypes.Txs): P2P.SafetyModeTypes.Txs {
    return;
}
export function updateRecord(txs: P2P.SafetyModeTypes.Txs, record: P2P.CycleCreatorTypes.CycleRecord, prev: P2P.CycleCreatorTypes.CycleRecord) {
    if (Self.isFirst) {
        Object.assign(record, Snapshot.safetyModeVals);
    }
    else {
        if (prev) {
            record.safetyMode = prev.safetyMode;
            record.safetyNum = prev.safetyNum;
            record.networkStateHash = prev.networkStateHash;
        }
    }
    if (record.safetyMode === true && prev) {
        if (prev.active >= prev.safetyNum) {
            record.safetyMode = false;
        }
    }
    const stateHashes = Snapshot.getStateHashes(cycleNumberForNetworkDataHash);
    if (stateHashes && stateHashes.length > 0) {
        record.networkDataHash = stateHashes.map((stateHash) => {
            return {
                cycle: stateHash.counter,
                hash: stateHash.networkHash,
            };
        });
        if (record.networkDataHash.length > 0) {
            cycleNumberForNetworkDataHash = record.networkDataHash[record.networkDataHash.length - 1].cycle + 1;
        }
    }
    else {
        record.networkDataHash = [];
    }
    const receiptHashes = Snapshot.getReceiptHashes(cycleNumberForNetworkReceiptHash);
    if (receiptHashes && receiptHashes.length > 0) {
        record.networkReceiptHash = receiptHashes.map((receiptHash) => {
            return {
                cycle: receiptHash.counter,
                hash: receiptHash.networkReceiptHash,
            };
        });
        if (record.networkReceiptHash.length > 0) {
            cycleNumberForNetworkReceiptHash =
                record.networkReceiptHash[record.networkReceiptHash.length - 1].cycle + 1;
        }
    }
    else {
        record.networkReceiptHash = [];
    }
    const summaryHashes = Snapshot.getSummaryHashes(cycleNumberForNetworkSummaryHash);
    if (summaryHashes && summaryHashes.length > 0) {
        record.networkSummaryHash = summaryHashes.map((stateHash) => {
            return {
                cycle: stateHash.counter,
                hash: stateHash.networkSummaryHash,
            };
        });
        if (record.networkSummaryHash.length > 0) {
            cycleNumberForNetworkSummaryHash =
                record.networkSummaryHash[record.networkSummaryHash.length - 1].cycle + 1;
        }
    }
    else {
        record.networkSummaryHash = [];
    }
}
export function validateRecordTypes(rec: P2P.SafetyModeTypes.Record): string {
    return '';
}
export function parseRecord(record: P2P.CycleCreatorTypes.CycleRecord): P2P.CycleParserTypes.Change {
    return {
        added: [],
        removed: [],
        updated: [],
    };
}
export function queueRequest(request) { }
export function sendRequests() { }