import { P2P } from '@shardus/types';
import { Handler } from 'express';
import { isDebugMode } from '../debug';
import { logFlags } from '../logger';
import { ApoptosisProposalReq, deserializeApoptosisProposalReq, serializeApoptosisProposalReq, } from '../types/ApoptosisProposalReq';
import { ApoptosisProposalResp, deserializeApoptosisProposalResp, serializeApoptosisProposalResp, } from '../types/ApoptosisProposalResp';
import { InternalBinaryHandler } from '../types/Handler';
import { errorToStringFull, validateTypes } from '../utils';
import getCallstack from '../utils/getCallstack';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { profilerInstance } from '../utils/profiler';
import { VectorBufferStream } from '../utils/serialization/VectorBufferStream';
import * as Comms from './Comms';
import { crypto, logger, network } from './Context';
import { currentCycle, currentQuarter } from './CycleCreator';
import { activeByIdOrder, byIdOrder, byPubKey, nodes } from './NodeList';
import * as Self from './Self';
import { robustQuery } from './Utils';
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum';
import { SQLDataTypes } from '../storage/utils/schemaDefintions';
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum';
import { Utils } from '@shardus/types';
import { BadRequest, serializeResponseError } from '../types/ResponseError';
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum';
import { getStreamWithTypeCheck, requestErrorHandler } from '../types/Helpers';
export const cycleDataName = 'apoptosized';
export const cycleUpdatesName = 'apoptosis';
export const nodeDownString = 'node is down';
export const nodeNotDownString = 'node is not down';
const gossipRouteName = 'apoptosis';
let p2pLogger;
const proposals: {
    [id: string]: P2P.ApoptosisTypes.SignedApoptosisProposal;
} = {};
const stopExternalRoute: P2P.P2PTypes.Route<Handler> = {
    method: 'GET',
    name: 'stop',
    handler: (_req, res) => {
        if (isDebugMode()) {
            res.json({ status: 'goodbye cruel world' });
            apoptosizeSelf('Apoptosis called at stopExternalRoute => src/p2p/Apoptosis.ts');
        }
    },
};
const failExternalRoute: P2P.P2PTypes.Route<Handler> = {
    method: 'GET',
    name: 'fail',
    handler: (_req, res) => {
        if (isDebugMode()) {
            if (logFlags.important_as_fatal)
                warn('fail route invoked in Apoptosis; used to test unclean exit');
            throw Error('fail_endpoint_debug');
        }
    },
};
const apoptosisInternalRoute: P2P.P2PTypes.Route<InternalBinaryHandler<Buffer>> = {
    name: InternalRouteEnum.apoptosize,
    handler: (payload, response, header, sign) => {
        const route = InternalRouteEnum.apoptosize;
        const errorHandler = (errorType: RequestErrorEnum, opts?: {
            customErrorLog?: string;
            customCounterSuffix?: string;
        }): void => requestErrorHandler(route, errorType, header, opts);
        try {
            const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cApoptosisProposalReq);
            if (!requestStream) {
                errorHandler(RequestErrorEnum.InvalidRequest);
                return response(BadRequest('Invalid apoptosisInternalRoute request stream'), serializeResponseError);
            }
            const req = deserializeApoptosisProposalReq(requestStream);
            const apopProposal: P2P.ApoptosisTypes.SignedApoptosisProposal = {
                id: req.id,
                when: req.when,
                sign: sign,
            };
            if (logFlags.p2pNonFatal)
                info(`Got Apoptosis proposal: ${Utils.safeStringify(apopProposal)}`);
            let err = '';
            if (apopProposal.id === 'isDownCheck') {
                let down_msg = nodeNotDownString;
                if (Self.isFailed === true) {
                    down_msg = nodeDownString;
                }
                let resp: ApoptosisProposalResp = { s: down_msg, r: 1 };
                return response(resp, serializeApoptosisProposalResp);
            }
            const when = apopProposal.when;
            if (when > currentCycle + 1 || when < currentCycle - 1) {
                let resp: ApoptosisProposalResp = { s: 'fail', r: 2 };
                return response(resp, serializeApoptosisProposalResp);
            }
            if (header.sender_id === apopProposal.id) {
                if (addProposal(apopProposal)) {
                    if (currentQuarter === 1) {
                        Comms.sendGossip(gossipRouteName, apopProposal);
                    }
                    let resp: ApoptosisProposalResp = { s: 'pass', r: 1 };
                    return response(resp, serializeApoptosisProposalResp);
                }
                else {
                    if (logFlags.error)
                        warn(`addProposal failed for payload: ${Utils.safeStringify(apopProposal)}`);
                    let resp: ApoptosisProposalResp = { s: 'fail', r: 4 };
                    return response(resp, serializeApoptosisProposalResp);
                }
            }
            else {
                if (logFlags.error)
                    warn(`sender is not apop node: sender:${header.sender_id} apop:${apopProposal.id}`);
                let resp: ApoptosisProposalResp = { s: 'fail', r: 3 };
                return response(resp, serializeApoptosisProposalResp);
            }
        }
        catch (e) {
            if (logFlags.error)
                error(`apoptosize: Exception executing request: ${errorToStringFull(e)}`);
        }
        finally {
        }
    },
};
const apoptosisGossipRoute: P2P.P2PTypes.GossipHandler<P2P.ApoptosisTypes.SignedApoptosisProposal> = (payload, sender, tracker) => {
    try {
        if (logFlags.p2pNonFatal)
            info(`Got Apoptosis gossip: ${Utils.safeStringify(payload)}`);
        let err = '';
        err = validateTypes(payload, { when: 'n', id: 's', sign: 'o' });
        if (err) {
            warn('apoptosisGossipRoute bad payload: ' + err);
            return;
        }
        err = validateTypes(payload.sign, { owner: 's', sig: 's' });
        if (err) {
            warn('apoptosisGossipRoute bad payload.sign: ' + err);
            return;
        }
        if ([1, 2].includes(currentQuarter)) {
            if (addProposal(payload)) {
                Comms.sendGossip(gossipRouteName, payload, tracker, Self.id, byIdOrder, false);
            }
        }
    }
    finally {
    }
};
const routes = {
    external: [stopExternalRoute, failExternalRoute],
    internal: [],
    internalBinary: [apoptosisInternalRoute],
    gossip: {
        [gossipRouteName]: apoptosisGossipRoute,
    },
};
export function init() {
    p2pLogger = logger.getLogger('p2p');
    reset();
    for (const route of routes.external) {
        network._registerExternal(route.method, route.name, route.handler);
    }
    for (const route of routes.internal) {
        Comms.registerInternal(route.name, route.handler);
    }
    for (const route of routes.internalBinary) {
        Comms.registerInternalBinary(route.name, route.handler);
    }
    for (const [name, handler] of Object.entries(routes.gossip)) {
        Comms.registerGossipHandler(name, handler);
    }
}
export function reset() {
    for (const id of Object.keys(proposals)) {
        if (!nodes.get(id)) {
            delete proposals[id];
        }
    }
}
export function getTxs(): P2P.ApoptosisTypes.Txs {
    return {
        apoptosis: [...Object.values(proposals)],
    };
}
export function validateRecordTypes(rec: P2P.ApoptosisTypes.Record): string {
    let err = validateTypes(rec, { apoptosized: 'a' });
    if (err)
        return err;
    for (const item of rec.apoptosized) {
        if (typeof item !== 'string')
            return 'items of apoptosized array must be strings';
    }
    return '';
}
export function dropInvalidTxs(txs: P2P.ApoptosisTypes.Txs): P2P.ApoptosisTypes.Txs {
    const valid = txs.apoptosis.filter((request) => validateProposal(request));
    return { apoptosis: valid };
}
export function updateRecord(txs: P2P.ApoptosisTypes.Txs, record: P2P.ApoptosisTypes.Record) {
    const apoptosized = [];
    for (const request of txs.apoptosis) {
        const publicKey = request.sign.owner;
        const node = byPubKey.get(publicKey);
        if (node) {
            apoptosized.push(node.id);
        }
    }
    record.apoptosized = [...record.apoptosized, ...apoptosized].sort();
}
export function parseRecord(record: P2P.ApoptosisTypes.Record): P2P.CycleParserTypes.Change {
    if (record.apoptosized.includes(Self.id)) {
        if (logFlags.important_as_fatal)
            error(`We got marked for apoptosis even though we didn't ask for it. Being nice and leaving.`);
        Self.emitter.emit('invoke-exit', 'node left active state due to un-refuted lost report', getCallstack(), `invoke-exit being called at parseRecord() => src/p2p/Apoptosis.ts: found our id in the apoptosis list`);
    }
    return {
        added: [],
        removed: record.apoptosized,
        updated: [],
    };
}
export function sendRequests() {
    for (const id of Object.keys(proposals)) {
        if (nodes.get(id)) {
            Comms.sendGossip(gossipRouteName, proposals[id], '', null, byIdOrder, true);
        }
    }
}
export async function apoptosizeSelf(message: string) {
    if (logFlags.important_as_fatal)
        warn(`In apoptosizeSelf. ${message}`);
    const activeNodes = activeByIdOrder;
    const proposal = createProposal();
    const apopProposalReq: ApoptosisProposalReq = {
        id: proposal.id,
        when: proposal.when,
    };
    await Comms.tellBinary<ApoptosisProposalReq>(activeNodes, InternalRouteEnum.apoptosize, apopProposalReq, serializeApoptosisProposalReq, {});
    const qF = async (node) => {
        if (node.id === Self.id)
            return null;
        try {
            const res = Comms.askBinary<ApoptosisProposalReq, ApoptosisProposalResp>(node, InternalRouteEnum.apoptosize, apopProposalReq, serializeApoptosisProposalReq, deserializeApoptosisProposalResp, {});
            return res;
        }
        catch (err) {
            if (logFlags.important_as_fatal)
                warn(`qF: In apoptosizeSelf calling robustQuery proposal. ${message}`);
            if (logFlags.important_as_fatal)
                warn(`Error: ${err}`);
            return null;
        }
    };
    const eF = (item1, item2) => {
        if (!item1 || !item2)
            return false;
        if (!item1.s || !item2.s)
            return false;
        if (item1.s === 'pass' && item2.s === 'pass')
            return true;
        return false;
    };
    if (activeNodes.length > 0) {
        if (logFlags.important_as_fatal)
            warn(`In apoptosizeSelf calling robustQuery proposal. ${message}`);
        let redunancy = 1;
        if (activeNodes.length > 5) {
            redunancy = 2;
        }
        if (activeNodes.length > 10) {
            redunancy = 3;
        }
        if (logFlags.important_as_fatal)
            warn(`Redunancy is ${redunancy}   ${message}`);
        await robustQuery(activeNodes, qF, eF, redunancy, true);
        if (logFlags.important_as_fatal)
            warn(`Sent apoptosize-self proposal: ${Utils.safeStringify(proposal)}   ${message}`);
    }
    Self.emitter.emit('invoke-exit', `In apoptosizeSelf. ${message}`, getCallstack(), message);
    if (logFlags.important_as_fatal)
        error(`We have been apoptosized. Exiting with status 1. Will not be restarted. ${message}`);
}
function createProposal(): P2P.ApoptosisTypes.SignedApoptosisProposal {
    const proposal = {
        id: Self.id,
        when: currentCycle,
    };
    return crypto.sign(proposal);
}
function addProposal(proposal: P2P.ApoptosisTypes.SignedApoptosisProposal): boolean {
    if (validateProposal(proposal) === false)
        return false;
    const id = proposal.id;
    if (proposals[id])
        return false;
    proposals[id] = proposal;
    info(`Marked ${proposal.id} for apoptosis`);
    return true;
}
function validateProposal(payload: unknown): boolean {
    if (!payload)
        return false;
    if (!(payload as P2P.P2PTypes.LooseObject).id)
        return false;
    if (!(payload as P2P.P2PTypes.LooseObject).when)
        return false;
    if (!(payload as P2P.ApoptosisTypes.SignedApoptosisProposal).sign)
        return false;
    if (!isValidWhen((payload as P2P.ApoptosisTypes.SignedApoptosisProposal).when))
        return false;
    const proposal = payload as P2P.ApoptosisTypes.SignedApoptosisProposal;
    const id = proposal.id;
    const node = nodes.get(id);
    if (!node)
        return false;
    const valid = crypto.verify(proposal, node.publicKey);
    if (!valid)
        return false;
    return true;
}
function isValidWhen(when: unknown): boolean {
    if (typeof when !== 'number' || !Number.isInteger(when)) {
        return false;
    }
    const minAcceptableCycle = currentCycle - 1;
    const maxAcceptableCycle = currentCycle + 1;
    return when >= minAcceptableCycle && when <= maxAcceptableCycle;
}
export function isApopMarkedNode(id: string): boolean {
    let apopNode = false;
    if (proposals[id]) {
        apopNode = true;
    }
    if (logFlags.p2pNonFatal)
        info('check if the node is apop marked node', id, apopNode);
    return apopNode;
}
function info(...msg) {
    const entry = `Apoptosis: ${msg.join(' ')}`;
}
function warn(...msg) {
    const entry = `Apoptosis: ${msg.join(' ')}`;
    p2pLogger.warn(entry);
}
function error(...msg) {
    const entry = `Apoptosis: ${msg.join(' ')}`;
    p2pLogger.error(entry);
}
export const addCycleFieldQuery = `ALTER TABLE cycles ADD ${cycleDataName} JSON NULL`;
export const sequelizeCycleFieldModel = {
    [cycleDataName]: { type: SQLDataTypes.JSON, allowNull: true },
};