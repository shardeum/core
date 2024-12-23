import { logFlags } from '../logger';
import { P2P } from '@shardus/types';
import ShardFunctions from '../state-manager/shardFunctions';
import * as utils from '../utils';
import * as Comms from './Comms';
import * as Context from './Context';
import * as NodeList from './NodeList';
import * as Self from './Self';
import { profilerInstance } from '../utils/profiler';
import { OpaqueTransaction } from '../shardus/shardus-types';
import { shardusGetTime } from '../network';
import { InternalBinaryHandler } from '../types/Handler';
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum';
import { getStreamWithTypeCheck, requestErrorHandler } from '../types/Helpers';
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum';
import { MakeReceiptReq, deserializeMakeReceiptReq, serializeMakeReceiptReq } from '../types/MakeReceipReq';
import { Utils } from '@shardus/types';
const makeReceiptBinaryHandler: P2P.P2PTypes.Route<InternalBinaryHandler<Buffer>> = {
    name: InternalRouteEnum.binary_make_receipt,
    handler: async (payload, respond, header, sign) => {
        const route = InternalRouteEnum.binary_make_receipt;
        const errorHandler = (errorType: RequestErrorEnum, opts?: {
            customErrorLog?: string;
            customCounterSuffix?: string;
        }): void => requestErrorHandler(route, errorType, header, opts);
        try {
            const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cMakeReceiptReq);
            if (!requestStream) {
                return errorHandler(RequestErrorEnum.InvalidRequest);
            }
            const req: MakeReceiptReq = deserializeMakeReceiptReq(requestStream);
            makeReceipt(req, header.sender_id);
        }
        catch (e) {
            if (logFlags.error)
                Context.logger.getLogger('p2p').error(`${route}: Exception executing request: ${utils.errorToStringFull(e)}`);
        }
        finally {
        }
    },
};
const setGlobalGossipRoute: P2P.P2PTypes.Route<P2P.P2PTypes.GossipHandler<P2P.GlobalAccountsTypes.Receipt>> = {
    name: 'set-global',
    handler: (payload, sender, tracker) => {
        try {
            if (validateReceipt(payload) === false)
                return;
            if (processReceipt(payload) === false)
                return;
            Comms.sendGossip('set-global', payload, tracker, sender, NodeList.byIdOrder, false);
        }
        finally {
        }
    },
};
let lastClean = 0;
const receipts = new Map<P2P.GlobalAccountsTypes.TxHash, P2P.GlobalAccountsTypes.Receipt>();
const trackers = new Map<P2P.GlobalAccountsTypes.TxHash, P2P.GlobalAccountsTypes.Tracker>();
export function init() {
    Comms.registerInternalBinary(makeReceiptBinaryHandler.name, makeReceiptBinaryHandler.handler);
    Comms.registerGossipHandler(setGlobalGossipRoute.name, setGlobalGossipRoute.handler);
}
export function setGlobal(address, addressHash, value, when, source) {
    if (!Self.isActive) {
        return;
    }
    const tx: P2P.GlobalAccountsTypes.SetGlobalTx = { address, addressHash, value, when, source };
    const txHash = Context.shardus.app.calculateTxId(tx.value as OpaqueTransaction);
    const signedTx: P2P.GlobalAccountsTypes.SignedSetGlobalTx = Context.crypto.sign(tx);
    if (Context.stateManager === null) {
    }
    else {
    }
    if (!Context.stateManager.currentCycleShardData) {
        return;
    }
    const homeNode = ShardFunctions.findHomeNode(Context.stateManager.currentCycleShardData.shardGlobals, source, Context.stateManager.currentCycleShardData.parititionShardDataMap);
    const consensusGroup = [...homeNode.consensusNodeForOurNodeFull];
    const ourIdx = consensusGroup.findIndex((node) => node.id === Self.id);
    if (ourIdx === -1)
        return;
    consensusGroup.splice(ourIdx, 1);
    const timeout = 10000;
    const handle = createMakeReceiptHandle(txHash);
    const onTimeout = () => {
        Self.emitter.removeListener(handle, onReceipt);
        attemptCleanup();
    };
    const timer = setTimeout(onTimeout, timeout);
    const onReceipt = (receipt) => {
        clearTimeout(timer);
        if (processReceipt(receipt) === false)
            return;
        Comms.sendGossip('set-global', receipt, '', null, NodeList.byIdOrder, true);
    };
    Self.emitter.on(handle, onReceipt);
    makeReceipt(signedTx, Self.id);
    const request = signedTx as MakeReceiptReq;
    Comms.tellBinary<MakeReceiptReq>(consensusGroup, InternalRouteEnum.binary_make_receipt, request, serializeMakeReceiptReq, {});
}
export function createMakeReceiptHandle(txHash: string) {
    return `receipt-${txHash}`;
}
export function getGlobalTxReceipt(txHash: P2P.GlobalAccountsTypes.TxHash): P2P.GlobalAccountsTypes.GlobalTxReceipt | null {
    const receipt = receipts.get(txHash);
    if (!receipt)
        return null;
    return {
        signs: receipt.signs,
        tx: receipt.tx,
    };
}
export function makeReceipt(signedTx: P2P.GlobalAccountsTypes.SignedSetGlobalTx, sender: P2P.P2PTypes.NodeInfo['id']) {
    if (!Context.stateManager) {
        return;
    }
    const sign = signedTx.sign;
    const tx = { ...signedTx };
    delete tx.sign;
    const txHash = Context.shardus.app.calculateTxId(tx.value as OpaqueTransaction);
    let receipt: P2P.GlobalAccountsTypes.Receipt = receipts.get(txHash);
    if (!receipt) {
        const consensusGroup = new Set(getConsensusGroupIds(tx.source));
        receipt = {
            signs: [],
            tx: null,
            consensusGroup,
        };
        receipts.set(txHash, receipt);
    }
    let tracker: P2P.GlobalAccountsTypes.Tracker = trackers.get(txHash);
    if (!tracker) {
        tracker = createTracker(txHash);
    }
    if (tracker.seen.has(sign.owner))
        return;
    if (!receipt.consensusGroup.has(sender))
        return;
    receipt.signs.push(sign);
    receipt.tx = tx;
    tracker.seen.add(sign.owner);
    tracker.timestamp = tx.when;
    if (isReceiptMajority(receipt, receipt.consensusGroup)) {
        const handle = createMakeReceiptHandle(txHash);
        Self.emitter.emit(handle, receipt);
    }
}
export function processReceipt(receipt: P2P.GlobalAccountsTypes.Receipt) {
    const txHash = Context.crypto.hash(receipt.tx);
    const tracker = trackers.get(txHash) || createTracker(txHash);
    tracker.timestamp = receipt.tx.when;
    if (tracker.gossiped)
        return false;
    Context.shardus.put(receipt.tx.value as OpaqueTransaction, false, true);
    tracker.gossiped = true;
    attemptCleanup();
    return true;
}
export function attemptCleanup() {
    const now = shardusGetTime();
    if (now - lastClean < 60000)
        return;
    lastClean = now;
    for (const [txHash, tracker] of trackers) {
        if (now - tracker.timestamp > 30000) {
            trackers.delete(txHash);
            receipts.delete(txHash);
        }
    }
}
function validateReceipt(receipt: P2P.GlobalAccountsTypes.Receipt) {
    if (Context.stateManager.currentCycleShardData === null) {
        return false;
    }
    const consensusGroup = new Set(getConsensusGroupIds(receipt.tx.source));
    if (isReceiptMajority(receipt, consensusGroup) === false) {
        return false;
    }
    const signsInConsensusGroup: P2P.P2PTypes.Signature[] = [];
    const uniqueSignOwnerMap = {};
    for (const sign of receipt.signs) {
        const owner = sign.owner.toLowerCase();
        if (uniqueSignOwnerMap[owner]) {
            continue;
        }
        uniqueSignOwnerMap[owner] = true;
        const node = NodeList.byPubKey.get(sign.owner);
        if (node === null) {
            continue;
        }
        const id = node.id;
        if (consensusGroup.has(id)) {
            signsInConsensusGroup.push(sign);
        }
        else {
        }
    }
    if ((signsInConsensusGroup.length / consensusGroup.size) * 100 < 60) {
        return false;
    }
    let verified = 0;
    for (const sign of signsInConsensusGroup) {
        const signedTx = { ...receipt.tx, sign };
        if (Context.crypto.verify(signedTx))
            verified++;
    }
    if ((verified / consensusGroup.size) * 100 < 60) {
        return false;
    }
    return true;
}
function createTracker(txHash) {
    const tracker = {
        seen: new Set<P2P.P2PTypes.NodeInfo['id']>(),
        timestamp: 0,
        gossiped: false,
    };
    trackers.set(txHash, tracker);
    return tracker;
}
function getConsensusGroupIds(address) {
    const homeNode = ShardFunctions.findHomeNode(Context.stateManager.currentCycleShardData.shardGlobals, address, Context.stateManager.currentCycleShardData.parititionShardDataMap);
    return homeNode.consensusNodeForOurNodeFull.map((node) => node.id);
}
function isReceiptMajority(receipt, consensusGroup) {
    return (receipt.signs.length / consensusGroup.size) * 100 >= 60;
}
function intersect(a, b) {
    const setB = new Set(b);
    return [...new Set(a)].filter((x) => setB.has(x));
}
function intersectCount(a, b) {
    return intersect(a, b).length;
}
function percentOverlap(a, b) {
    return (a.length / b.length) * 100;
}