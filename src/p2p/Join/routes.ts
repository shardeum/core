import * as Comms from '../Comms';
import * as CycleChain from '../CycleChain';
import * as CycleCreator from '../CycleCreator';
import * as NodeList from '../NodeList';
import * as Self from '../Self';
import * as utils from '../../utils';
import { Handler } from 'express';
import { P2P } from '@shardus/types';
import { addJoinRequest, computeSelectionNum, getAllowBogon, setAllowBogon, validateJoinRequest, verifyJoinRequestSignature, warn, queueStandbyRefreshRequest, queueJoinRequest, queueUnjoinRequest, verifyJoinRequestTypes, nodeListFromStates } from '.';
import { config } from '../Context';
import { isBogonIP } from '../../utils/functions/checkIP';
import { isPortReachable } from '../../utils/isPortReachable';
import { nestedCountersInstance } from '../../utils/nestedCounters';
import { profilerInstance } from '../../utils/profiler';
import { checkGossipPayload } from '../../utils/GossipValidation';
import * as acceptance from './v2/acceptance';
import { getStandbyNodesInfoMap, saveJoinRequest, isOnStandbyList } from './v2';
import { addFinishedSyncing } from './v2/syncFinished';
import { processNewUnjoinRequest, removeUnjoinRequest } from './v2/unjoin';
import { isActive } from '../Self';
import { logFlags } from '../../logger';
import { JoinRequest, SignedUnjoinRequest, StartedSyncingRequest, } from '@shardus/types/build/src/p2p/JoinTypes';
import { addSyncStarted } from './v2/syncStarted';
import { addStandbyRefresh } from './v2/standbyRefresh';
import { Utils } from '@shardus/types';
import { testFailChance } from '../../utils';
import { shardusGetTime } from '../../network';
import { verifyPayload } from '../../types/ajv/Helpers';
import { AJVSchemaEnum } from '../../types/enum/AJVSchemaEnum';
const cycleMarkerRoute: P2P.P2PTypes.Route<Handler> = {
    method: 'GET',
    name: 'cyclemarker',
    handler: (_req, res) => {
        const marker = CycleChain.newest ? CycleChain.newest.previous : '0'.repeat(64);
        res.json({ marker });
    },
};
const joinRoute: P2P.P2PTypes.Route<Handler> = {
    method: 'POST',
    name: 'join',
    handler: async (req, res) => {
        try {
            const joinRequest: JoinRequest = Utils.safeJsonParse(Utils.safeStringify(req.body));
            const errors = verifyPayload(AJVSchemaEnum.JoinReq, joinRequest);
            if (errors) {
                res.status(400).json({
                    success: false,
                    fatal: true,
                    reason: 'Validation error: ' + errors.join('; ')
                });
                return;
            }
            if (!isActive && !Self.isRestartNetwork) {
                if (logFlags.p2pNonFatal)
                    console.error(`join-reject: not-active`);
                res.status(400).json({
                    success: false,
                    fatal: false,
                    reason: `this node is not active yet`,
                });
                return;
            }
            if (CycleCreator.currentQuarter < 1) {
                if (logFlags.p2pNonFatal)
                    console.error(`join-reject: CycleCreator.currentQuarter < 1 ${CycleCreator.currentQuarter} ${joinRequest.nodeInfo.publicKey}`);
                res.status(400).json({
                    success: false,
                    fatal: false,
                    reason: `Can't join before quarter 1`,
                });
                return;
            }
            if ((NodeList.activeByIdOrder.length === 1 || Self.isRestartNetwork) &&
                Self.isFirst &&
                isBogonIP(joinRequest.nodeInfo.externalIp) &&
                config.p2p.forceBogonFilteringOn === false) {
                setAllowBogon(true);
            }
            const { externalIp, externalPort, internalIp, internalPort } = joinRequest.nodeInfo || {};
            const externalPortReachable = await isPortReachable({ host: externalIp, port: externalPort });
            const internalPortReachable = await isPortReachable({ host: internalIp, port: internalPort });
            if (!externalPortReachable || !internalPortReachable) {
                if (logFlags.p2pNonFatal)
                    console.error(`join-reject: !externalPortReachable || !internalPortReachable ${joinRequest.nodeInfo.publicKey} ${Utils.safeStringify({ host: externalIp, port: externalPort })}`);
                res.json({
                    success: false,
                    fatal: true,
                    reason: `IP or Port is not reachable. ext:${externalIp}:${externalPort} int:${internalIp}:${internalPort}}`,
                });
                return;
            }
            if (config.p2p.useJoinProtocolV2) {
                if (getStandbyNodesInfoMap().has(joinRequest.nodeInfo.publicKey)) {
                    if (logFlags.p2pNonFatal)
                        console.error(`join-reject: already standby ${joinRequest.nodeInfo.publicKey}:`);
                    res.status(400).json({
                        success: false,
                        fatal: false,
                        reason: `Join request for pubkey ${joinRequest.nodeInfo.publicKey} already exists as a standby node`,
                    });
                    return;
                }
                const validationError = validateJoinRequest(joinRequest);
                if (validationError) {
                    if (logFlags.p2pNonFatal)
                        console.error(`join-reject: validateJoinRequest ${validationError.reason} ${joinRequest.nodeInfo.publicKey}:`);
                    res.status(400).json(validationError);
                    return;
                }
                const signatureError = verifyJoinRequestSignature(joinRequest);
                if (signatureError) {
                    if (logFlags.p2pNonFatal)
                        console.error(`join-reject: signature error ${joinRequest.nodeInfo.publicKey}:`);
                    res.status(400).json(signatureError);
                    return;
                }
                const selectionNumResult = computeSelectionNum(joinRequest);
                if (selectionNumResult.isErr()) {
                    if (logFlags.p2pNonFatal)
                        console.error(`failed to compute selection number for node ${joinRequest.nodeInfo.publicKey}:`, Utils.safeStringify(selectionNumResult.error));
                    res.status(500).json(selectionNumResult.error);
                    return;
                }
                joinRequest.selectionNum = selectionNumResult.value;
                if (CycleCreator.currentQuarter > 1) {
                    res.status(400).json({
                        success: false,
                        fatal: false,
                        reason: `Can't join after quarter 1`,
                    });
                    return;
                }
                queueJoinRequest(joinRequest);
                res.status(200).json({ success: true, numStandbyNodes: getStandbyNodesInfoMap().size });
                return;
            }
            else {
                const joinRequestResponse = addJoinRequest(joinRequest);
                if (joinRequestResponse.success) {
                    Comms.sendGossip('gossip-join', joinRequest, '', null, nodeListFromStates([
                        P2P.P2PTypes.NodeStatus.ACTIVE,
                        P2P.P2PTypes.NodeStatus.READY,
                        P2P.P2PTypes.NodeStatus.SYNCING,
                    ]), true);
                }
                res.json(joinRequestResponse);
                return;
            }
        }
        catch (error) {
            console.error('Error handling join request:', error);
            res.status(500).json({
                success: false,
                fatal: true,
                reason: 'An error occurred while processing the join request'
            });
            return;
        }
    },
};
const unjoinRoute: P2P.P2PTypes.Route<Handler> = {
    method: 'POST',
    name: 'unjoin',
    handler: (req, res) => {
        const unjoinRequest = req.body;
        const processResult = processNewUnjoinRequest(unjoinRequest);
        if (processResult.isErr()) {
            res.status(500).json({ error: processResult.error });
            return;
        }
        removeUnjoinRequest(unjoinRequest.publicKey);
        queueUnjoinRequest(unjoinRequest);
        res.status(200).json();
        return;
    },
};
const standbyRefreshRoute: P2P.P2PTypes.Route<Handler> = {
    method: 'POST',
    name: 'standby-refresh',
    handler: async (req, res) => {
        if (config.debug.ignoreStandbyRefreshChance < 0 || config.debug.ignoreStandbyRefreshChance > 1) {
            warn('invalid config.debug.ignoreStandbyRefreshChance value: ' + config.debug.ignoreStandbyRefreshChance);
            res.status(500).json({ error: 'invalid config.debug.ignoreStandbyRefreshChance value' });
        }
        else if (config.debug.ignoreStandbyRefreshChance > 0) {
            if (testFailChance(config.debug.ignoreStandbyRefreshChance, 'standby-refresh', '', '', false)) {
                await utils.sleep(3000);
                res.status(500).json({ error: 'simulated timeout' });
            }
        }
        const standbyRefreshPubKey = req.body.publicKey;
        let err = utils.validateTypes(req, { body: 'o' });
        if (err) {
            warn('/standby-refresh bad req ' + err);
            res.status(400).json();
        }
        err = typeof standbyRefreshPubKey === 'string' ? '' : 'standbyRefreshPubKey is not a string';
        if (err) {
            warn('/standby-refresh bad standby refresh public key ' + err);
            res.status(400).json();
        }
        queueStandbyRefreshRequest(standbyRefreshPubKey);
        res.status(200).json();
        return;
    },
};
const joinedV2Route: P2P.P2PTypes.Route<Handler> = {
    method: 'GET',
    name: 'joinedV2/:publicKey',
    handler: (req, res) => {
        let err = utils.validateTypes(req, { params: 'o' });
        if (err) {
            warn('joined/:publicKey bad req ' + err);
            res.json();
        }
        err = utils.validateTypes(req.params, { publicKey: 's' });
        if (err) {
            warn('joined/:publicKey bad req.params ' + err);
            res.json();
        }
        const publicKey = req.params.publicKey;
        const id = NodeList.byPubKey.get(publicKey)?.id || null;
        res.json({ id, isOnStandbyList: isOnStandbyList(publicKey) });
    },
};
const joinedRoute: P2P.P2PTypes.Route<Handler> = {
    method: 'GET',
    name: 'joined/:publicKey',
    handler: (req, res) => {
        let err = utils.validateTypes(req, { params: 'o' });
        if (err) {
            warn('joined/:publicKey bad req ' + err);
            res.json();
        }
        err = utils.validateTypes(req.params, { publicKey: 's' });
        if (err) {
            warn('joined/:publicKey bad req.params ' + err);
            res.json();
        }
        const publicKey = req.params.publicKey;
        const node = NodeList.byPubKey.get(publicKey);
        res.json({ node });
    },
};
const acceptedRoute: P2P.P2PTypes.Route<Handler> = {
    method: 'POST',
    name: 'accepted',
    handler: async (req, res) => {
        acceptance.getEventEmitter().emit('accepted');
    },
};
const gossipJoinRoute: P2P.P2PTypes.GossipHandler<P2P.JoinTypes.JoinRequest, P2P.NodeListTypes.Node['id']> = (payload, sender, tracker) => {
    if (!config.p2p.useJoinProtocolV2) {
        try {
            if (!checkGossipPayload(payload, {
                nodeInfo: 'o',
                selectionNum: 's',
                cycleMarker: 's',
                proofOfWork: 's',
                version: 's',
                sign: 'o',
                appJoinData: 'o',
            }, 'gossip-join', sender)) {
                return;
            }
            if (addJoinRequest(payload).success)
                Comms.sendGossip('gossip-join', payload, tracker, sender, nodeListFromStates([
                    P2P.P2PTypes.NodeStatus.ACTIVE,
                    P2P.P2PTypes.NodeStatus.READY,
                    P2P.P2PTypes.NodeStatus.SYNCING,
                ]), false);
        }
        finally {
        }
    }
    else
        warn('gossip-join received but ignored for join protocol v2');
};
const gossipValidJoinRequests: P2P.P2PTypes.GossipHandler<{
    joinRequest: P2P.JoinTypes.JoinRequest;
    sign: P2P.P2PTypes.Signature;
}, P2P.NodeListTypes.Node['id']> = (payload: {
    joinRequest: P2P.JoinTypes.JoinRequest;
    sign: P2P.P2PTypes.Signature;
}, sender: P2P.NodeListTypes.Node['id'], tracker: string) => {
    if (!checkGossipPayload(payload, {
        joinRequest: 'o',
        sign: 'o',
    }, 'gossip-ValidJoinRequest', sender)) {
        return;
    }
    const joinRequest = payload.joinRequest;
    const err = utils.validateTypes(joinRequest, {
        nodeInfo: 'o',
        selectionNum: 's',
        cycleMarker: 's',
        proofOfWork: 's',
        version: 's',
        sign: 'o',
        appJoinData: 'o',
    });
    if (err) {
        warn(`gossipValidJoinRequests: invalid payload.joinRequest: ${err}`);
        return;
    }
    if (getStandbyNodesInfoMap().has(joinRequest.nodeInfo.publicKey)) {
        if (logFlags.p2pNonFatal)
            console.error(`join request for pubkey ${joinRequest.nodeInfo.publicKey} already exists as a standby node`);
        return;
    }
    const validationError = validateJoinRequest(joinRequest);
    if (validationError) {
        if (logFlags.p2pNonFatal)
            console.error(`failed to validate join request when gossiping: ${validationError}`);
        return;
    }
    joinRequest.selectionNum = undefined;
    const signatureError = verifyJoinRequestSignature(joinRequest);
    if (signatureError) {
        if (logFlags.p2pNonFatal)
            console.error(`join-gossip-reject: signature error ${joinRequest.nodeInfo.publicKey}:`);
        return;
    }
    const selectionNumResult = computeSelectionNum(joinRequest);
    if (selectionNumResult.isErr()) {
        if (logFlags.p2pNonFatal)
            console.error(`failed to compute selection number for node ${joinRequest.nodeInfo.publicKey}:`, JSON.stringify(selectionNumResult.error));
        return;
    }
    joinRequest.selectionNum = selectionNumResult.value;
    saveJoinRequest(joinRequest);
    Comms.sendGossip('gossip-valid-join-requests', payload, tracker, sender, nodeListFromStates([
        P2P.P2PTypes.NodeStatus.ACTIVE,
        P2P.P2PTypes.NodeStatus.READY,
        P2P.P2PTypes.NodeStatus.SYNCING,
    ]), false);
};
const gossipUnjoinRequests: P2P.P2PTypes.GossipHandler<SignedUnjoinRequest, P2P.NodeListTypes.Node['id']> = (payload: SignedUnjoinRequest, sender: P2P.NodeListTypes.Node['id'], tracker: string) => {
    if (!checkGossipPayload(payload, {
        publicKey: 's',
        sign: 'o',
    }, 'gossip-unjoin', sender)) {
        return;
    }
    const processResult = processNewUnjoinRequest(payload);
    if (processResult.isErr()) {
        warn(`gossip-unjoin failed to process unjoin request: ${processResult.error}`);
        return;
    }
    Comms.sendGossip('gossip-unjoin', payload, tracker, sender, nodeListFromStates([
        P2P.P2PTypes.NodeStatus.ACTIVE,
        P2P.P2PTypes.NodeStatus.READY,
        P2P.P2PTypes.NodeStatus.SYNCING,
    ]), false);
};
const gossipSyncStartedRoute: P2P.P2PTypes.GossipHandler<StartedSyncingRequest, P2P.NodeListTypes.Node['id']> = (payload, sender, tracker) => {
    try {
        if (!checkGossipPayload(payload, {
            nodeId: 's',
            cycleNumber: 'n',
            sign: 'o',
        }, 'gossip-sync-started', sender)) {
            return;
        }
        const addSyncStartedResult = addSyncStarted(payload);
        if (addSyncStartedResult.success)
            Comms.sendGossip('gossip-sync-started', payload, tracker, sender, nodeListFromStates([
                P2P.P2PTypes.NodeStatus.ACTIVE,
                P2P.P2PTypes.NodeStatus.READY,
                P2P.P2PTypes.NodeStatus.SYNCING,
            ]), false);
    }
    finally {
    }
};
const gossipSyncFinishedRoute: P2P.P2PTypes.GossipHandler<P2P.JoinTypes.FinishedSyncingRequest, P2P.NodeListTypes.Node['id']> = (payload: P2P.JoinTypes.FinishedSyncingRequest, sender: P2P.NodeListTypes.Node['id'], tracker: string) => {
    try {
        if (!checkGossipPayload(payload, {
            nodeId: 's',
            cycleNumber: 'n',
            sign: 'o',
        }, 'gossip-sync-finished', sender)) {
            return;
        }
        const addFinishedSyncingResult = addFinishedSyncing(payload);
        if (!addFinishedSyncingResult.success) {
        }
        if (addFinishedSyncingResult.success) {
            Comms.sendGossip('gossip-sync-finished', payload, tracker, sender, nodeListFromStates([
                P2P.P2PTypes.NodeStatus.ACTIVE,
                P2P.P2PTypes.NodeStatus.READY,
                P2P.P2PTypes.NodeStatus.SYNCING,
            ]), false);
        }
        else {
        }
    }
    finally {
    }
};
const gossipStandbyRefresh: P2P.P2PTypes.GossipHandler<P2P.JoinTypes.StandbyRefreshRequest, P2P.NodeListTypes.Node['id']> = async (payload, sender, tracker) => {
    try {
        if (!checkGossipPayload(payload, {
            publicKey: 's',
            cycleNumber: 'n',
            sign: 'o',
        }, 'gossip-standby-refresh', sender)) {
            return;
        }
        const added = addStandbyRefresh(payload);
        if (added.success)
            Comms.sendGossip('gossip-standby-refresh', payload, tracker, sender, nodeListFromStates([
                P2P.P2PTypes.NodeStatus.ACTIVE,
                P2P.P2PTypes.NodeStatus.READY,
                P2P.P2PTypes.NodeStatus.SYNCING,
            ]), false);
    }
    finally {
    }
};
export const routes = {
    external: [cycleMarkerRoute, joinRoute, joinedRoute, joinedV2Route, acceptedRoute, unjoinRoute, standbyRefreshRoute],
    gossip: {
        'gossip-join': gossipJoinRoute,
        'gossip-valid-join-requests': gossipValidJoinRequests,
        'gossip-unjoin': gossipUnjoinRequests,
        'gossip-sync-started': gossipSyncStartedRoute,
        'gossip-sync-finished': gossipSyncFinishedRoute,
        'gossip-standby-refresh': gossipStandbyRefresh,
    },
};