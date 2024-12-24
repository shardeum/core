import { P2P } from '@shardus/types';
import { ArchiverDownMsg, ArchiverRefutesLostMsg, ArchiverUpMsg, InvestigateArchiverMsg, } from '@shardus/types/build/src/p2p/LostArchiverTypes';
import { Node } from '@shardus/types/build/src/p2p/NodeListTypes';
import { GossipHandler, InternalHandler, Route, SignedObject } from '@shardus/types/build/src/p2p/P2PTypes';
import { Handler } from 'express';
import * as Comms from '../Comms';
import { config, crypto, network } from '../Context';
import { getRandomAvailableArchiver } from '../Utils';
import * as funcs from './functions';
import * as logging from './logging';
import { lostArchiversMap } from './state';
import { currentQuarter } from '../CycleCreator';
import { id } from '../Self';
import { inspect } from 'util';
import { byIdOrder } from '../NodeList';
import { isDebugModeMiddleware } from '../../network/debugMiddleware';
import { getArchiverWithPublicKey } from '../Archivers';
import { InternalRouteEnum } from '../../types/enum/InternalRouteEnum';
import { InternalBinaryHandler } from '../../types/Handler';
import { nestedCountersInstance } from '../../utils/nestedCounters';
import { profilerInstance } from '../../utils/profiler';
import { deserializeLostArchiverInvestigateReq } from '../../types/LostArchiverInvestigateReq';
import { getStreamWithTypeCheck } from '../../types/Helpers';
import { TypeIdentifierEnum } from '../../types/enum/TypeIdentifierEnum';
import { checkGossipPayload } from '../../utils/GossipValidation';
import { Utils } from '@shardus/types';
const lostArchiverUpGossip: GossipHandler<SignedObject<ArchiverUpMsg>, Node['id']> = (payload, sender, tracker) => {
    if (config.p2p.enableLostArchiversCycles === false) {
        return;
    }
    if (!checkGossipPayload(payload, { type: 's', downMsg: 'o', refuteMsg: 'o', cycle: 's', sign: 'o' }, 'lostArchiverUpGossip', sender)) {
        return;
    }
    if (!sender) {
        logging.warn(`lostArchiverUpGossip: missing sender`);
        return;
    }
    if (!tracker) {
        logging.warn(`lostArchiverUpGossip: missing tracker`);
        return;
    }
    const error = funcs.errorForArchiverUpMsg(payload);
    if (error) {
        logging.warn(`lostArchiverUpGossip: invalid payload error: ${error}, payload: ${inspect(payload)}`);
        return;
    }
    const upMsg = payload as SignedObject<ArchiverUpMsg>;
    const target = upMsg.downMsg.investigateMsg.target;
    const record = lostArchiversMap.get(target);
    if (!record) {
        return;
    }
    if (record && ['up'].includes(record.status))
        return;
    record.status = 'up';
    record.archiverUpMsg = upMsg;
    Comms.sendGossip('lost-archiver-up', payload, tracker, id, byIdOrder, false);
    record.gossippedUpMsg = true;
};
const lostArchiverDownGossip: GossipHandler<SignedObject<ArchiverDownMsg>, Node['id']> = (payload, sender, tracker) => {
    if (config.p2p.enableLostArchiversCycles === false) {
        return;
    }
    if (!checkGossipPayload(payload, { type: 's', investigateMsg: 'o', cycle: 's', sign: 'o' }, 'lostArchiverDownGossip', sender)) {
        return;
    }
    if (!sender) {
        logging.warn(`lostArchiverDownGossip: missing sender`);
        return;
    }
    if (!tracker) {
        logging.warn(`lostArchiverDownGossip: missing tracker`);
        return;
    }
    const error = funcs.errorForArchiverDownMsg(payload);
    if (error) {
        logging.warn(`lostArchiverDownGossip: invalid payload error: ${error}, payload: ${inspect(payload)}`);
        return;
    }
    const downMsg = payload as SignedObject<ArchiverDownMsg>;
    const target = downMsg.investigateMsg.target;
    let record = lostArchiversMap.get(target);
    if (record && ['up', 'down'].includes(record.status))
        return;
    if (!record) {
        record = funcs.createLostArchiverRecord({
            target,
            status: 'down',
            archiverDownMsg: downMsg,
        });
        lostArchiversMap.set(target, record);
    }
    else {
        record.status = 'down';
        record.archiverDownMsg = downMsg;
    }
    Comms.sendGossip('lost-archiver-down', payload, tracker, id, byIdOrder, false);
    record.gossippedDownMsg = true;
};
const investigateLostArchiverRouteBinary: Route<InternalBinaryHandler<Buffer>> = {
    name: InternalRouteEnum.binary_lost_archiver_investigate,
    handler: (payload, respond, header) => {
        if (config.p2p.enableLostArchiversCycles === false) {
            return;
        }
        const route = InternalRouteEnum.binary_lost_archiver_investigate;
        try {
            const reqStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cGetAccountDataReq);
            if (!reqStream) {
                logging.warn(`${route}: Invalid request stream`);
                return;
            }
            const deserializedPayload = deserializeLostArchiverInvestigateReq(reqStream);
            if (!deserializedPayload) {
                logging.warn(`${route}: Missing payload`);
                return;
            }
            if (!respond) {
                logging.warn(`${route}: Missing response method`);
                return;
            }
            if (!header.sender_id) {
                logging.warn(`${route}: Missing sender ID`);
                return;
            }
            const error = funcs.errorForInvestigateArchiverMsg(deserializedPayload);
            if (error) {
                logging.warn(`${route}: Invalid payload error: ${error}, payload: ${inspect(payload)}`);
                return;
            }
            if (id !== deserializedPayload.investigator) {
                return;
            }
            funcs.investigateArchiver(deserializedPayload);
        }
        catch (error) {
            logging.error(`${route}: Error processing request - ${error.message}`);
        }
        finally {
        }
    },
};
const refuteLostArchiverRoute: P2P.P2PTypes.Route<Handler> = {
    method: 'POST',
    name: 'lost-archiver-refute',
    handler: (req, res) => {
        if (config.p2p.enableLostArchiversCycles === false) {
            return;
        }
        const error = funcs.errorForArchiverRefutesLostMsg(req.body);
        if (error) {
            logging.warn(`refuteLostArchiverRoute: invalid archiver up message error: ${error}, payload: ${inspect(req.body)}`);
            res.json({ status: 'failure', message: error });
            return;
        }
        const refuteMsg = req.body as SignedObject<ArchiverRefutesLostMsg>;
        const target = refuteMsg.archiver;
        let record = lostArchiversMap.get(target);
        if (!record) {
            record = funcs.createLostArchiverRecord({ target, status: 'up', archiverRefuteMsg: refuteMsg });
            lostArchiversMap.set(target, record);
        }
        if (record.status !== 'up')
            record.status = 'up';
        if (!record.archiverRefuteMsg)
            record.archiverRefuteMsg = refuteMsg;
        res.json({ status: 'success' });
    },
};
const reportFakeLostArchiverRoute: P2P.P2PTypes.Route<Handler> = {
    method: 'GET',
    name: 'report-fake-lost-archiver',
    handler: (req, res) => {
        if (config.p2p.enableLostArchiversCycles === false) {
            return;
        }
        logging.warn('/report-fake-lost-archiver: reporting fake lost archiver');
        let publicKey: string | null = typeof req.query.publicKey === 'string' ? req.query.publicKey : null;
        if (publicKey == null)
            publicKey = req.body.publickey;
        const pick = publicKey ? 'specified' : 'random';
        const archiver = publicKey ? getArchiverWithPublicKey(publicKey) : getRandomAvailableArchiver();
        if (archiver) {
            funcs.reportLostArchiver(archiver.publicKey, 'fake lost archiver report');
            res.json(crypto.sign({
                status: 'accepted',
                pick,
                archiver,
                message: 'will report fake lost archiver',
            }));
        }
        else {
            res.json(crypto.sign({
                status: 'failed',
                pick,
                archiver,
                message: 'archiver not found',
            }));
        }
    },
};
const routes = {
    debugExternal: [reportFakeLostArchiverRoute],
    external: [refuteLostArchiverRoute],
    internal: [],
    internalBinary: [investigateLostArchiverRouteBinary],
    gossip: {
        'lost-archiver-up': lostArchiverUpGossip,
        'lost-archiver-down': lostArchiverDownGossip,
    },
};
export function registerRoutes(): void {
    for (const route of routes.debugExternal) {
        network._registerExternal(route.method, route.name, isDebugModeMiddleware, route.handler);
    }
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