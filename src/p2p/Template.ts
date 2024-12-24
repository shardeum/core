import { Logger } from 'log4js';
import { P2P } from '@shardus/types';
import * as Comms from './Comms';
import { logger } from './Context';
let p2pLogger: Logger;
export function init() {
    p2pLogger = logger.getLogger('p2p');
    reset();
}
export function reset() { }
export function getTxs(): P2P.TemplateTypes.Txs {
    return;
}
export function dropInvalidTxs(txs: P2P.TemplateTypes.Txs): P2P.TemplateTypes.Txs {
    return;
}
export function updateRecord(txs: P2P.TemplateTypes.Txs, record: P2P.CycleCreatorTypes.CycleRecord, prev: P2P.CycleCreatorTypes.CycleRecord) { }
export function parseRecord(record: P2P.CycleCreatorTypes.CycleRecord): P2P.CycleParserTypes.Change {
    return;
}
export function queueRequest(request) { }
export function sendRequests() { }
function info(...msg) {
    const entry = `[CHANGE ME]: ${msg.join(' ')}`;
}
function warn(...msg) {
    const entry = `[CHANGE ME]: ${msg.join(' ')}`;
    p2pLogger.warn(entry);
}
function error(...msg) {
    const entry = `[CHANGE ME]: ${msg.join(' ')}`;
    p2pLogger.error(entry);
}