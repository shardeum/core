import { Logger } from 'log4js';
import { logger, config, crypto, network, shardus } from './Context';
import * as CycleChain from './CycleChain';
import { P2P, Utils } from '@shardus/types';
import { OpaqueTransaction, ShardusEvent } from '../shardus/shardus-types';
import { stringifyReduce, validateTypes } from '../utils';
import * as Comms from './Comms';
import { profilerInstance } from '../utils/profiler';
import * as Self from './Self';
import { currentCycle, currentQuarter } from './CycleCreator';
import { logFlags } from '../logger';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { getFromArchiver } from './Archivers';
import { Result } from 'neverthrow';
import { getRandomAvailableArchiver } from './Utils';
import { isDebugModeMiddleware } from '../network/debugMiddleware';
import { nodeListFromStates } from './Join';
import * as Nodelist from './NodeList';
let p2pLogger: Logger;
let txList: P2P.ServiceQueueTypes.NetworkTxEntry[] = [];
let txAdd: P2P.ServiceQueueTypes.AddNetworkTx[] = [];
let txRemove: P2P.ServiceQueueTypes.RemoveNetworkTx[] = [];
const shutdownHandlers = new Map<string, (activeNode: P2P.NodeListTypes.Node, record: P2P.CycleCreatorTypes.CycleRecord) => Omit<P2P.ServiceQueueTypes.AddNetworkTx, 'cycle' | 'hash'> | null | undefined>();
const addProposals: P2P.ServiceQueueTypes.SignedAddNetworkTx[] = [];
const removeProposals: P2P.ServiceQueueTypes.SignedRemoveNetworkTx[] = [];
const beforeAddVerifier = new Map<string, (txEntry: P2P.ServiceQueueTypes.AddNetworkTx) => Promise<boolean>>();
const applyVerifier = new Map<string, (txEntry: P2P.ServiceQueueTypes.AddNetworkTx) => Promise<boolean>>();
const tryCounts = new Map<string, number>();
const addTxGossipRoute: P2P.P2PTypes.GossipHandler<P2P.ServiceQueueTypes.SignedAddNetworkTx> = async (payload, sender, tracker) => {
    if ([1, 2].includes(currentQuarter) === false) {
        if (logFlags.error)
            info('gossip-addtx: Got request after quarter 2');
        return;
    }
    try {
        if (logFlags.p2pNonFatal)
            info(`Got addTx gossip: ${Utils.safeStringify(payload)}`);
        let err = '';
        err = validateTypes(payload, { type: 's', txData: 'o', cycle: 'n', sign: 'o' });
        if (err) {
            warn('addTxGossipRoute bad payload: ' + err);
            return;
        }
        err = validateTypes(payload.sign, { owner: 's', sig: 's' });
        if (err) {
            if (logFlags.error)
                warn('gossip-addtx: bad input sign ' + err);
            return;
        }
        const signer = Nodelist.byPubKey.get(payload.sign.owner);
        if (!signer) {
            if (logFlags.error)
                warn('gossip-addtx: Got request from unknown node');
            return;
        }
        if (txAdd.some((entry) => entry.hash === payload.hash)) {
            return;
        }
        if (!crypto.verify(payload, payload.sign.owner)) {
            return;
        }
        const { sign, ...unsignedAddNetworkTx } = payload;
        if (await _addNetworkTx(unsignedAddNetworkTx)) {
            if (!txAdd.some((entry) => entry.hash === payload.hash)) {
                const addTxCopy = structuredClone(unsignedAddNetworkTx);
                const { sign, ...txDataWithoutSign } = addTxCopy.txData;
                addTxCopy.txData = txDataWithoutSign;
                txAdd.push(addTxCopy);
                Comms.sendGossip('gossip-addtx', payload, tracker, Self.id, nodeListFromStates([
                    P2P.P2PTypes.NodeStatus.ACTIVE,
                    P2P.P2PTypes.NodeStatus.READY,
                    P2P.P2PTypes.NodeStatus.SYNCING,
                ]), false);
            }
        }
    }
    finally {
    }
};
const removeTxGossipRoute: P2P.P2PTypes.GossipHandler<P2P.ServiceQueueTypes.SignedRemoveNetworkTx> = async (payload, sender, tracker) => {
    if ([1, 2].includes(currentQuarter) === false) {
        if (logFlags.error)
            info('gossip-removetx: Got request after quarter 2');
        return;
    }
    try {
        const index = txList.findIndex((entry) => entry.hash === payload.txHash);
        if (index === -1) {
            if (logFlags.p2pNonFatal)
                warn(`TxHash ${payload.txHash} does not exist in txList`);
            return false;
        }
        if (logFlags.p2pNonFatal)
            info(`Got removeTx gossip: ${Utils.safeStringify(payload)}`);
        let err = validateTypes(payload, { txHash: 's', cycle: 'n', sign: 'o' });
        if (err) {
            warn('removeTxGossipRoute bad payload: ' + err);
            return;
        }
        err = validateTypes(payload.sign, { owner: 's', sig: 's' });
        if (err) {
            if (logFlags.error)
                warn('gossip-removetx: bad input sign ' + err);
            return;
        }
        const signer = Nodelist.byPubKey.get(payload.sign.owner);
        if (!signer) {
            if (logFlags.error)
                warn('gossip-removetx: Got request from unknown node');
            return;
        }
        if (txRemove.some((entry) => entry.txHash === payload.txHash)) {
            return;
        }
        if (!crypto.verify(payload, payload.sign.owner)) {
            return;
        }
        const { sign, ...unsignedRemoveNetworkTx } = payload;
        if (await _removeNetworkTx(unsignedRemoveNetworkTx)) {
            if (!txRemove.some((entry) => entry.txHash === payload.txHash)) {
                txRemove.push(unsignedRemoveNetworkTx);
                Comms.sendGossip('gossip-removetx', payload, tracker, Self.id, nodeListFromStates([
                    P2P.P2PTypes.NodeStatus.ACTIVE,
                    P2P.P2PTypes.NodeStatus.READY,
                    P2P.P2PTypes.NodeStatus.SYNCING,
                ]), false);
            }
        }
    }
    finally {
    }
};
const routes = {
    external: [],
    internal: [],
    internalBinary: [],
    gossip: {
        ['gossip-addtx']: addTxGossipRoute,
        ['gossip-removetx']: removeTxGossipRoute,
    },
};
export function init(): void {
    p2pLogger = logger.getLogger('p2p');
    reset();
    for (const [name, handler] of Object.entries(routes.gossip)) {
        Comms.registerGossipHandler(name, handler);
    }
    network.registerExternalGet('debug-network-txlist', isDebugModeMiddleware, (req, res) => {
        res.send({ status: 'ok', txList });
    });
    network.registerExternalGet('debug-network-txlisthash', isDebugModeMiddleware, (req, res) => {
        res.send({ status: 'ok', txListHash: crypto.hash(txList) });
    });
    network.registerExternalGet('debug-drop-network-txhash', isDebugModeMiddleware, (req, res) => {
        const txHash = req?.query?.txHash;
        if (txHash == null) {
            res.send({ status: 'fail', error: 'txHash not provided' });
            return;
        }
        const index = txList.findIndex((entry) => entry.hash === txHash);
        if (index === -1) {
            res.send({ status: 'fail', error: 'txHash not found' });
            return;
        }
        txList.splice(index, 1);
        res.send({ status: 'ok' });
    });
    network.registerExternalGet('debug-clear-network-txlist', isDebugModeMiddleware, (req, res) => {
        txList = [];
        res.send({ status: 'ok' });
    });
    network.registerExternalGet('debug-network-txcount', isDebugModeMiddleware, (req, res) => {
        const copy = txList.map(entry => ({
            ...entry,
            count: tryCounts.get(entry.hash) || 0
        }));
        res.send({ status: 'ok', tryCounts: copy });
    });
}
export function reset(): void {
    txAdd = [];
    txRemove = [];
}
export function getTxs(): P2P.ServiceQueueTypes.Txs {
    return {
        txadd: [...txAdd],
        txremove: [...txRemove],
    };
}
export function validateRecordTypes(): string {
    return '';
}
export function updateRecord(txs: P2P.ServiceQueueTypes.Txs, record: P2P.CycleCreatorTypes.CycleRecord, prev: P2P.CycleCreatorTypes.CycleRecord): void {
    record.txadd = txAdd.sort((a, b) => a.hash.localeCompare(b.hash));
    record.txremove = txRemove.sort((a, b) => a.txHash.localeCompare(b.txHash));
    const txListCopy = structuredClone(txList);
    function applyTxAdd(txAddList: typeof record.txadd) {
        for (const txadd of txAddList) {
            const { sign, ...txDataWithoutSign } = txadd.txData;
            sortedInsert(txListCopy, {
                hash: txadd.hash,
                tx: {
                    hash: txadd.hash,
                    txData: txDataWithoutSign,
                    type: txadd.type,
                    cycle: txadd.cycle,
                    priority: txadd.priority,
                    ...(txadd.subQueueKey && { subQueueKey: txadd.subQueueKey }),
                },
            });
        }
    }
    applyTxAdd(record.txadd);
    for (const txremove of record.txremove) {
        const index = txListCopy.findIndex((entry) => entry.hash === txremove.txHash);
        if (index === -1) {
            error(`updateRecord: TxHash ${txremove.txHash} does not exist in txListCopy`);
        }
        else {
            txListCopy.splice(index, 1);
        }
    }
    function processShutdownHandlers(cycleRecord: P2P.CycleCreatorTypes.CycleRecord) {
        Nodelist.activeByIdOrder.forEach((node) => {
            for (let [key, handler] of shutdownHandlers) {
                try {
                    const txAddData = handler(node, cycleRecord);
                    if (txAddData?.txData == null)
                        continue;
                    const hash = crypto.hash(txAddData.txData);
                    if (txListCopy.some((listEntry) => listEntry.hash === hash)) {
                        warn(`shutdown - TxHash ${hash} already exists in txListCopy`);
                        continue;
                    }
                    const addTx = {
                        ...txAddData,
                        hash,
                        cycle: currentCycle,
                    };
                    const entry = {
                        hash,
                        tx: addTx,
                    };
                    sortedInsert(txListCopy, entry);
                    record.txadd.push(addTx);
                }
                catch (e) {
                    error(`Failed to call shutdownHandler (${key}): ${e instanceof Error ? e.stack : e}`);
                }
            }
        });
    }
    if (record.mode === 'shutdown') {
        processShutdownHandlers(prev);
        processShutdownHandlers(record);
        record.txadd = txAdd.sort((a, b) => a.hash.localeCompare(b.hash));
    }
    record.txlisthash = crypto.hash(txListCopy);
}
export function parseRecord(record: P2P.CycleCreatorTypes.CycleRecord): P2P.CycleParserTypes.Change {
    if (record.joinedConsensors.some((entry) => entry.id === Self.id) && hasCycleBeenParsed(record)) {
        info('txList received from syncing has already applied the changes from parsing');
        return {
            added: [],
            removed: [],
            updated: [],
        };
    }
    for (const txadd of record.txadd) {
        if (txList.some((entry) => entry.hash === txadd.hash)) {
            error(`TxHash ${txadd.hash} already exists in txList`);
        }
        else {
            info(`Adding network tx of type ${txadd.type} and payload ${stringifyReduce(txadd.txData)}`);
            const { sign, ...txDataWithoutSign } = txadd.txData;
            sortedInsert(txList, {
                hash: txadd.hash,
                tx: {
                    hash: txadd.hash,
                    txData: txDataWithoutSign,
                    type: txadd.type,
                    cycle: txadd.cycle,
                    priority: txadd.priority,
                    ...(txadd.subQueueKey && { subQueueKey: txadd.subQueueKey }),
                },
            });
        }
    }
    for (const txremove of record.txremove) {
        const index = txList.findIndex((entry) => entry.hash === txremove.txHash);
        if (index === -1) {
            error(`TxHash ${txremove.txHash} does not exist in txList`);
        }
        else {
            txList.splice(index, 1);
        }
    }
    return {
        added: [],
        removed: [],
        updated: [],
    };
}
export function sendRequests(): void {
    for (const add of addProposals) {
        if (!txAdd.some((entry) => entry.hash === add.hash)) {
            const { sign: sign1, ...unsignedAddNetworkTx } = add;
            const addTxCopy = structuredClone(unsignedAddNetworkTx);
            const { sign: sign2, ...txDataWithoutSign } = addTxCopy.txData;
            addTxCopy.txData = txDataWithoutSign;
            txAdd.push(addTxCopy);
        }
        Comms.sendGossip('gossip-addtx', add, '', Self.id, nodeListFromStates([
            P2P.P2PTypes.NodeStatus.ACTIVE,
            P2P.P2PTypes.NodeStatus.READY,
            P2P.P2PTypes.NodeStatus.SYNCING,
        ]), true);
    }
    for (const remove of removeProposals) {
        const notInTxRemove = !txRemove.some((entry) => entry.txHash === remove.txHash);
        const inTxList = txList.some((entry) => entry.hash === remove.txHash);
        if (inTxList) {
            if (notInTxRemove) {
                const { sign, ...unsignedRemoveNetworkTx } = remove;
                txRemove.push(unsignedRemoveNetworkTx);
            }
            Comms.sendGossip('gossip-removetx', remove, '', Self.id, nodeListFromStates([
                P2P.P2PTypes.NodeStatus.ACTIVE,
                P2P.P2PTypes.NodeStatus.READY,
                P2P.P2PTypes.NodeStatus.SYNCING,
            ]), true);
        }
    }
    addProposals.length = 0;
    removeProposals.length = 0;
}
export function registerShutdownHandler(type: string, handler: (activeNode: P2P.NodeListTypes.Node, record: P2P.CycleCreatorTypes.CycleRecord) => Omit<P2P.ServiceQueueTypes.AddNetworkTx, 'cycle' | 'hash'> | null | undefined): void {
    shutdownHandlers.set(type, handler);
}
export function registerBeforeAddVerifier(type: string, verifier: (txEntry: P2P.ServiceQueueTypes.AddNetworkTx) => Promise<boolean>): void {
    beforeAddVerifier.set(type, verifier);
}
export function registerApplyVerifier(type: string, verifier: (txEntry: P2P.ServiceQueueTypes.AddNetworkTx) => Promise<boolean>): void {
    applyVerifier.set(type, verifier);
}
export async function addNetworkTx(type: string, tx: OpaqueTransaction, subQueueKey?: string, priority: number = 0): Promise<void> {
    const hash = crypto.hash(tx);
    const networkTx = {
        hash,
        type,
        txData: tx,
        cycle: currentCycle,
        priority,
        subQueueKey,
    } as P2P.ServiceQueueTypes.AddNetworkTx;
    if (await _addNetworkTx(networkTx)) {
        makeAddNetworkTxProposals(networkTx);
    }
}
export function getLatestNetworkTxEntryForSubqueueKey(subqueueKey: string): P2P.ServiceQueueTypes.NetworkTxEntry {
    for (let i = txList.length - 1; i >= 0; i--) {
        if (txList[i].tx.subQueueKey === subqueueKey) {
            return txList[i];
        }
    }
    return undefined;
}
function makeAddNetworkTxProposals(networkTx: P2P.ServiceQueueTypes.AddNetworkTx): void {
    addProposals.push(crypto.sign(networkTx));
}
function makeRemoveNetworkTxProposals(networkTx: P2P.ServiceQueueTypes.RemoveNetworkTx): void {
    removeProposals.push(crypto.sign(networkTx));
}
async function _addNetworkTx(addTx: P2P.ServiceQueueTypes.AddNetworkTx): Promise<boolean> {
    try {
        if (!addTx || !addTx.txData) {
            if (logFlags.p2pNonFatal)
                warn('Invalid addTx or missing addTx.txData', addTx);
            return false;
        }
        if (addTx.cycle < currentCycle - 1 || addTx.cycle > currentCycle) {
            if (logFlags.p2pNonFatal)
                warn(`Invalid cycle ${addTx.cycle} for current cycle ${currentCycle}`);
            return false;
        }
        if (txList.some((entry) => entry.hash === addTx.hash)) {
            if (logFlags.p2pNonFatal) {
                if (logFlags.p2pNonFatal)
                    info('Transaction already exists in txList', addTx.hash);
            }
            return false;
        }
        if (!beforeAddVerifier.has(addTx.type)) {
            if (logFlags.p2pNonFatal)
                warn('Adding network tx without a verify function!');
            return false;
        }
        const verifyFunction = beforeAddVerifier.get(addTx.type);
        if (!verifyFunction) {
            if (logFlags.p2pNonFatal)
                error('Verify function is undefined');
            return false;
        }
        if (!(await verifyFunction(addTx))) {
            if (logFlags.p2pNonFatal)
                error(`Failed add network tx verification of type ${addTx.type} \n tx: ${stringifyReduce(addTx.txData)}`);
            return false;
        }
        return true;
    }
    catch (e) {
        if (logFlags.p2pNonFatal)
            error(`Failed add network tx verification of type ${addTx.type} \n tx: ${stringifyReduce(addTx.txData)}\n error: ${e instanceof Error ? e.stack : e}`);
        return false;
    }
}
export async function _removeNetworkTx(removeTx: P2P.ServiceQueueTypes.RemoveNetworkTx): Promise<boolean> {
    const index = txList.findIndex((entry) => entry.hash === removeTx.txHash);
    if (index === -1) {
        if (logFlags.p2pNonFatal)
            warn(`TxHash ${removeTx.txHash} does not exist in txList`);
        return false;
    }
    if (removeProposals.some((entry) => entry.txHash === removeTx.txHash)) {
        if (logFlags.p2pNonFatal)
            warn(`Remove proposal already exists for ${removeTx.txHash}`);
        return false;
    }
    const listEntry = txList[index];
    try {
        if (!applyVerifier.has(listEntry.tx.type)) {
            if (logFlags.p2pNonFatal)
                warn('Remove network tx without a verify function!');
        }
        else if (!(await applyVerifier.get(listEntry.tx.type)(listEntry.tx))) {
            if (logFlags.p2pNonFatal)
                error(`Failed remove network tx verification of type ${listEntry.tx.type} \n
                     tx: ${stringifyReduce(listEntry.tx.txData)}`);
            return false;
        }
    }
    catch (e) {
        if (logFlags.p2pNonFatal)
            error(`Failed remove network tx verification of type ${listEntry.tx.type} \n
                   tx: ${stringifyReduce(listEntry.tx.txData)}\n 
                   error: ${e instanceof Error ? e.stack : e}`);
        return false;
    }
    return true;
}
export async function processNetworkTransactions(record: P2P.CycleCreatorTypes.CycleRecord): Promise<void> {
    info('Process Network Transactions');
    if (record.mode !== 'processing') {
        return;
    }
    const processedSubQueueKeys = new Set<string>();
    let length = Math.min(txList.length, config.p2p.networkTransactionsToProcessPerCycle);
    for (let i = 0; i < length && currentQuarter === 3; i++) {
        if (!txList[i]) {
            warn(`txList[${i}] is undefined`);
            continue;
        }
        const record = txList[i].tx;
        try {
            if (record.subQueueKey != null && processedSubQueueKeys.has(record.subQueueKey)) {
                if (length < txList.length) {
                    length += 1;
                }
                continue;
            }
            if (applyVerifier.has(record.type) && !(await applyVerifier.get(record.type)(record))) {
                const emitParams: Omit<ShardusEvent, 'type'> = {
                    nodeId: record.txData.nodeId,
                    reason: 'Try Network Transaction',
                    time: CycleChain.newest.start,
                    publicKey: record.txData.publicKey,
                    cycleNumber: record.cycle,
                    additionalData: record,
                };
                if (logFlags.p2pNonFatal)
                    info('emit network transaction event', Utils.safeStringify(emitParams));
                Self.emitter.emit('try-network-transaction', emitParams);
                countTry(txList[i].hash);
                if (record.subQueueKey != null) {
                    processedSubQueueKeys.add(record.subQueueKey);
                }
            }
            else {
                if (logFlags.p2pNonFatal)
                    info('removeNetworkTx', txList[i].hash);
                const removeTx = { txHash: txList[i].hash, cycle: currentCycle };
                if (await _removeNetworkTx(removeTx)) {
                    makeRemoveNetworkTxProposals(removeTx);
                }
            }
        }
        catch (e) {
            countTry(txList[i].hash);
            if (record.subQueueKey != null) {
                processedSubQueueKeys.add(record.subQueueKey);
            }
            error(`Failed to process network transaction ${txList[i]?.hash}: ${e instanceof Error ? e.stack : e}`);
        }
    }
}
export async function syncTxListFromArchiver(): Promise<void> {
    const archiver: P2P.SyncTypes.ActiveNode = getRandomAvailableArchiver();
    if (!archiver) {
        throw Error('Fatal: Could not get random archiver');
    }
    const txListResult: Result<P2P.ServiceQueueTypes.NetworkTxEntry[], Error> = await getFromArchiver(archiver, 'network-txs-list', undefined, 10000);
    if (txListResult.isErr()) {
        const nodeListUrl = `http://${archiver.ip}:${archiver.port}/network-txs-list`;
        throw Error(`Fatal: Could not get tx list from archiver ${nodeListUrl}: ` + txListResult.error.message);
    }
    const latestTxListHash = CycleChain?.newest?.txlisthash;
    if (!latestTxListHash) {
        warn('failed to get hash of latest tx list from cycle record');
        return;
    }
    if (latestTxListHash === crypto.hash(txListResult.value)) {
        txList = txListResult.value;
        info('first nodes successfully synced tx list from archiver in restart mode');
    }
    else {
        throw Error('Fatal: Hash of tx list from archiver does not match hash of latest tx list from cycle record');
    }
}
function hasCycleBeenParsed(record: P2P.CycleCreatorTypes.CycleRecord): boolean {
    for (const txAdd of record.txadd) {
        if (!txList.some((entry) => entry.hash === txAdd.hash)) {
            return false;
        }
    }
    for (const txRemove of record.txremove) {
        if (txList.some((entry) => entry.hash === txRemove.txHash)) {
            return false;
        }
    }
    return true;
}
function countTry(txHash: string): void {
    if (tryCounts.has(txHash)) {
        tryCounts.set(txHash, tryCounts.get(txHash) + 1);
    }
    else {
        tryCounts.set(txHash, 1);
    }
}
export function getTxListHash(): string {
    return crypto.hash(txList);
}
export function getTxList(): Array<P2P.ServiceQueueTypes.NetworkTxEntry> {
    return txList;
}
export function setTxList(_txList: P2P.ServiceQueueTypes.NetworkTxEntry[]): void {
    txList = _txList;
}
function sortedInsert(list: {
    hash: string;
    tx: P2P.ServiceQueueTypes.AddNetworkTx;
}[], entry: {
    hash: string;
    tx: P2P.ServiceQueueTypes.AddNetworkTx;
}): void {
    const index = list.findIndex((item) => item.tx.cycle > entry.tx.cycle ||
        (item.tx.cycle === entry.tx.cycle && item.tx.priority < entry.tx.priority) ||
        (item.tx.cycle === entry.tx.cycle && item.tx.priority === entry.tx.priority && item.hash > entry.hash));
    if (index === -1) {
        list.push(entry);
    }
    else {
        list.splice(index, 0, entry);
    }
}
function info(...msg: unknown[]): void {
    const entry = `ServiceQueue: ${msg.join(' ')}`;
}
function warn(...msg: unknown[]): void {
    const entry = `ServiceQueue: ${msg.join(' ')}`;
    p2pLogger.warn(entry);
}
function error(...msg: unknown[]): void {
    const entry = `ServiceQueue: ${msg.join(' ')}`;
    p2pLogger.error(entry);
}
function omitKey(obj: any, keyToOmit: string) {
    const newObj = { ...obj };
    for (const key in newObj) {
        if (key === keyToOmit) {
            delete newObj[key];
        }
        else if (typeof newObj[key] === 'object') {
            newObj[key] = omitKey(newObj[key], keyToOmit);
        }
    }
}