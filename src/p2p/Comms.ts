import { AppHeader } from '@shardus/net/build/src/types';
import { P2P } from '@shardus/types';
import { Logger } from 'log4js';
import { logFlags } from '../logger';
import { ipInfo, shardusGetTime } from '../network';
import { isNodeDown, isNodeLost, isNodeUpRecent, setIsUpTs } from '../p2p/Lost';
import { ShardusTypes } from '../shardus';
import { Sign } from '../shardus/shardus-types';
import { InternalBinaryHandler } from '../types/Handler';
import { requestSerializer, responseDeserializer, responseSerializer } from '../types/Helpers';
import { deserializeWrappedReq } from '../types/WrappedReq';
import * as utils from '../utils';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { cNoSizeTrack, cUninitializedSize, profilerInstance } from '../utils/profiler';
import { VectorBufferStream } from '../utils/serialization/VectorBufferStream';
import { config, crypto, logger, network } from './Context';
import * as NodeList from './NodeList';
import * as Self from './Self';
import * as CycleChain from './CycleChain';
import * as Shardus from '../shardus/shardus-types';
import { isNodeInRotationBounds } from './Utils';
import { deserializeGossipReq, GossipReqBinary, serializeGossipReq } from '../types/GossipReq';
import { InternalRouteEnum, isAskRoute } from '../types/enum/InternalRouteEnum';
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum';
import { getStreamWithTypeCheck, requestErrorHandler } from '../types/Helpers';
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum';
import { InternalError, ResponseError, serializeResponseError } from '../types/ResponseError';
import { Utils } from '@shardus/types';
import { nodeListFromStates } from './Join';
type GossipReq = P2P.P2PTypes.LooseObject;
const gossipInternalBinaryRoute: P2P.P2PTypes.Route<InternalBinaryHandler<Buffer>> = {
    name: InternalRouteEnum.binary_gossip,
    handler: async (payload, response, header, sign) => {
        const route = InternalRouteEnum.binary_gossip;
        const errorHandler = (errorType: RequestErrorEnum, opts?: {
            customErrorLog?: string;
            customCounterSuffix?: string;
        }): void => requestErrorHandler(route, errorType, header, opts);
        let gossipType = 'unknown';
        try {
            const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cGossipReq);
            if (!requestStream) {
                return errorHandler(RequestErrorEnum.InvalidRequest);
            }
            const req: GossipReqBinary = deserializeGossipReq(requestStream);
            gossipType = req.type;
            await handleGossip(req, header.sender_id, header.tracker_id, payload.length);
        }
        catch (e) {
            logger
                .getLogger('comms-route')
                .error(`${route}: Exception executing gossip type: ${gossipType}, request: ${utils.errorToStringFull(e)}`);
        }
        finally {
        }
    },
};
const routes = {
    internal: {},
    internalBinary: {
        gossip: gossipInternalBinaryRoute,
    },
};
let p2pLogger: Logger;
let seqLogger: Logger;
let acceptInternal = false;
let keyCounter = 0;
let internalRecvCounter = 0;
const gossipHandlers = {};
let gossipSent = 0;
let gossipRecv = 0;
const gossipTypeSent = {};
const gossipTypeRecv = {};
let commsCounters = true;
export function setAcceptInternal(enabled: boolean) {
    acceptInternal = enabled;
}
export function init() {
    p2pLogger = logger.getLogger('p2p');
    seqLogger = logger.getLogger('seq');
    for (const [name, handler] of Object.entries(routes.internal)) {
        registerInternal(name, handler);
    }
    for (const route of Object.values(routes.internalBinary)) {
        registerInternalBinary(route.name, route.handler);
    }
    Self.emitter.on('cycle_q1_start', pruneGossipHashes);
}
function _findNodeInGroup(nodeId, group) {
    if (!group) {
        const errMsg = 'No group given for _findNodeInGroup()';
        warn(errMsg);
        throw new Error(errMsg);
    }
    for (const node of group) {
        if (node.id === nodeId)
            return node;
    }
    warn(`Node ID not found in group: ${nodeId}`);
    return false;
}
function _authenticateByNode(message, node) {
    let result;
    try {
        if (!node.curvePublicKey) {
            error('Node object did not contain curve public key for authenticateByNode()!');
            return false;
        }
        result = config.p2p.useSignaturesForAuth
            ? crypto.verify(message, node.publicKey)
            : crypto.authenticate(message, node.curvePublicKey);
    }
    catch (e) {
        if (logFlags.verbose)
            error(`Invalid or missing authentication/signature tag on message: ${Utils.safeStringify(message)}`);
        return false;
    }
    return result;
}
function _extractPayloadBinary(wrappedPayload): Buffer {
    let buffer = null;
    if (wrappedPayload instanceof Buffer) {
        if (logFlags.verbose)
            info(`_extractPayloadBinary: wrappedPayload is a buffer: ${wrappedPayload}`);
        buffer = wrappedPayload;
    }
    else if (wrappedPayload.type === 'Buffer' && Array.isArray(wrappedPayload.data)) {
        if (logFlags.verbose)
            info(`_extractPayloadBinary: wrappedPayload is a buffer struct: ${wrappedPayload}`);
        buffer = Buffer.from(wrappedPayload.data);
    }
    else {
        throw new Error(`Unsupported wrappedPayload type: ${wrappedPayload.type}`);
    }
    const stream = VectorBufferStream.fromBuffer(buffer);
    const payloadType = stream.readUInt16();
    switch (payloadType) {
        case 3:
            const wrappedReq = deserializeWrappedReq(stream);
            return wrappedReq.payload;
        default:
            throw new Error(`Unsupported payload type: ${payloadType}`);
    }
}
function _extractPayload(wrappedPayload, nodeGroup) {
    let err = utils.validateTypes(wrappedPayload, { error: 's?' });
    if (err) {
        warn('extractPayload: bad wrappedPayload: ' + err + ' ' + Utils.safeStringify(wrappedPayload));
        return [null];
    }
    if (wrappedPayload.error) {
        const error = wrappedPayload.error;
        warn(`_extractPayload Failed to extract payload. Error: ${error}`);
        return [null];
    }
    err = utils.validateTypes(wrappedPayload, config.p2p.useSignaturesForAuth
        ? {
            sender: 's',
            payload: 'o',
            sign: 'o',
            tracker: 's?',
        }
        : {
            sender: 's',
            payload: 'o',
            tag: 's',
            tracker: 's?',
        });
    if (err) {
        warn('extractPayload: bad wrappedPayload: ' + err + ' ' + Utils.safeStringify(wrappedPayload));
        return [null];
    }
    const node = _findNodeInGroup(wrappedPayload.sender, nodeGroup);
    if (!node) {
        warn(`_extractPayload Invalid sender on internal payload. sender: ${wrappedPayload.sender} payload: ${utils.stringifyReduceLimit(wrappedPayload)}`);
        return [null];
    }
    const authenticatedByNode = _authenticateByNode(wrappedPayload, node);
    if (!authenticatedByNode) {
        warn('_extractPayload Internal payload not authenticated by an expected node.');
        return [null];
    }
    const payload = wrappedPayload.payload;
    const sender = wrappedPayload.sender;
    const tracker = wrappedPayload.tracker;
    const msgSize = wrappedPayload.msgSize;
    return [payload, sender, tracker, msgSize];
}
function _wrapMessage(msg, tracker = '') {
    if (!msg)
        throw new Error('No message given to wrap and tag!');
    if (logFlags.verbose) {
        warn(`Attaching sender ${Self.id} to the message: ${utils.stringifyReduceLimit(msg)}`);
    }
    return {
        payload: msg,
        sender: Self.id,
        tracker,
        msgSize: 0,
    };
}
function _wrapAndTagMessage(msg, tracker = '', recipientNode) {
    const wrapped = _wrapMessage(msg, tracker);
    return crypto.tagWithSize(wrapped, recipientNode.curvePublicKey);
}
function _wrapAndSignMessage(msg, tracker = '') {
    const wrapped = _wrapMessage(msg, tracker);
    return crypto.signWithSize(wrapped);
}
function createMsgTracker(route = '') {
    return 'key_' + route + '_' + utils.makeShortHash(Self.id) + '_' + shardusGetTime() + '_' + keyCounter++;
}
function createGossipTracker() {
    return 'gkey_' + utils.makeShortHash(Self.id) + '_' + shardusGetTime() + '_' + keyCounter++;
}
export async function tell(nodes: ShardusTypes.Node[] | ShardusTypes.NodeWithRank[], route, message, logged = false, tracker = '', subRoute = '') {
    let msgSize = cUninitializedSize;
    if (tracker === '') {
        tracker = createMsgTracker(route);
    }
    if (commsCounters) {
    }
    msgSize = config.p2p.useSignaturesForAuth
        ? await signedMultiTell(nodes, message, tracker, msgSize, route, logged, subRoute)
        : await taggedMultiTell(nodes, message, tracker, msgSize, route, logged, subRoute);
    return msgSize;
}
export async function tellBinary<TReq>(nodes: ShardusTypes.Node[] | ShardusTypes.NodeWithRank[], route: string, message: TReq, serializerFunc: (stream: VectorBufferStream, obj: TReq, root?: boolean) => void, appHeader: AppHeader, logged = false, tracker = '') {
    let msgSize = cUninitializedSize;
    if (tracker === '' || !appHeader.tracker_id) {
        tracker = createMsgTracker(route);
        appHeader.tracker_id = tracker;
    }
    appHeader.sender_id = Self.id;
    if (commsCounters) {
    }
    const typecasted_nodes = nodes as ShardusTypes.Node[];
    const nonSelfNodes = typecasted_nodes.filter((node) => node.id !== Self.id);
    try {
        const wrappedReq = requestSerializer(message, serializerFunc);
        await network.tellBinary(nonSelfNodes, route, wrappedReq.getBuffer(), appHeader, tracker, logged);
    }
    catch (err) {
        warn(`tellBinary: network.tellBinary: P2P TELL_BINARY: failed. route: ${route}, error: ${err}`);
    }
    return msgSize;
}
async function taggedMultiTell(nodes: any[], message: any, tracker: string, msgSize: number, route: any, logged: boolean, subRoute = '') {
    const promises = [];
    for (const node of nodes) {
        if (node.id === Self.id) {
            if (logFlags.p2pNonFatal)
                info('p2p/Comms:tell: Not telling self');
            continue;
        }
        const signedMessage = _wrapAndTagMessage(message, tracker, node);
        msgSize = signedMessage.msgSize;
        if (logFlags.p2pNonFatal)
            info(`taggedMultiTell: signed and tagged gossip`, utils.stringifyReduceLimit(signedMessage));
        promises.push(network.tell([node], route, signedMessage, logged, subRoute));
    }
    try {
        await Promise.all(promises);
    }
    catch (err) {
        warn('taggedMultiTell: P2P TELL: failed', err);
    }
    return msgSize;
}
async function signedMultiTell(nodes: any[], message: any, tracker: string, msgSize: number, route: any, logged: boolean, subRoute = '') {
    const signedMessage = _wrapAndSignMessage(message, tracker);
    msgSize = signedMessage.msgSize;
    const nonSelfNodes = nodes.filter((node) => node.id !== Self.id);
    if (logFlags.p2pNonFatal)
        info(`signedMultiTell: signed and tagged gossip`, utils.stringifyReduceLimit(signedMessage));
    try {
        await network.tell(nonSelfNodes, route, signedMessage, logged, subRoute);
    }
    catch (err) {
        warn('signedMultiTell: P2P TELL: failed', err);
    }
    return msgSize;
}
export async function ask(node: ShardusTypes.Node, route: string, message = {}, logged = false, tracker = '', extraTime = 0) {
    if (tracker === '') {
        tracker = createMsgTracker(route);
    }
    if (node.id === Self.id) {
        if (logFlags.p2pNonFatal)
            info('p2p/Comms:ask: Not asking self');
        return false;
    }
    if (commsCounters) {
    }
    const msgWithAuth = config.p2p.useSignaturesForAuth
        ? await _wrapAndSignMessage(message, tracker)
        : await _wrapAndTagMessage(message, tracker, node);
    let respWithAuth;
    try {
        respWithAuth = await network.ask(node, route, msgWithAuth, logged, extraTime);
    }
    catch (err) {
        error('P2P: ask: network.ask: ' + err);
        return false;
    }
    try {
        const [response] = _extractPayload(respWithAuth, [node]);
        if (!response) {
            throw new Error(`Unable to verify response to ask request: ${route} -- ${Utils.safeStringify(message)} from node: ${node.id}`);
        }
        return response;
    }
    catch (err) {
        error('P2P: ask: _extractPayload: ' + err);
        return false;
    }
}
export async function askBinary<TReq, TResp>(node: ShardusTypes.Node, route: string, message: TReq, reqSerializerFunc: (stream: VectorBufferStream, obj: TReq, root?: boolean) => void, respDeserializerFunc: (stream: VectorBufferStream, root?: boolean) => TResp, appHeader: AppHeader, tracker = '', logged = false, extraTime = 0): Promise<TResp> {
    if (tracker === '') {
        tracker = createMsgTracker(route);
        appHeader.tracker_id = tracker;
    }
    if (!appHeader.sender_id)
        appHeader.sender_id = Self.id;
    if (node.id === Self.id) {
        if (logFlags.p2pNonFatal)
            info('p2p/Comms: askBinary: Not asking self');
        throw new Error('Not asking self');
    }
    if (commsCounters) {
    }
    let res, header: AppHeader, sign: Sign;
    try {
        const wrappedReq = requestSerializer(message, reqSerializerFunc);
        ({ res, header, sign } = await network.askBinary(node, route, wrappedReq.getBuffer(), appHeader, tracker, logged, extraTime));
    }
    catch (err) {
        error(`P2P: askBinary: network.askBinary: route: ${route} request: ${Utils.safeStringify(message)} error: ${err}`);
        throw err;
    }
    try {
        if (!res)
            throw new Error(`Empty response to askBinary request: ${route} -- ${Utils.safeStringify(message)} from node: ${node.id}`);
        if (header && sign)
            if (header.sender_id !== node.id || sign.owner !== node.publicKey) {
                warn('askBinary: response did not come from the expected node.');
                throw new Error('askBinary: response did not come from the expected node.');
            }
        const respStream = VectorBufferStream.fromBuffer(res);
        const deserializedResp = responseDeserializer(respStream, respDeserializerFunc);
        return deserializedResp;
    }
    catch (err) {
        if (err instanceof ResponseError) {
        }
        else {
            error(`P2P: askBinary: response extraction route: ${route} res: ${Utils.safeStringify(res)} error: ${err}`);
        }
        throw err;
    }
}
export function evictCachedSockets(nodes: ShardusTypes.Node[]) {
    network.evictCachedSockets(nodes);
}
export function registerInternal(route, handler) {
    const wrappedHandler = async (wrappedPayload, respond) => {
        if (logFlags.p2pNonFatal)
            info("registerInternal wrappedPayload", utils.stringifyReduceLimit(wrappedPayload));
        internalRecvCounter++;
        if (!acceptInternal) {
            if (logFlags.p2pNonFatal)
                info(`${route} We are not currently accepting internal requests...`);
            await respond({ error: `${route} error: Not accepting internal requests` });
            return;
        }
        let msgSize = 0;
        let tracker = '';
        let hasHandlerResponded = false;
        const respondWrapped = async (response) => {
            const node = NodeList.nodes.get(sender);
            const message = { ...response, isResponse: true };
            const respWithAuth = config.p2p.useSignaturesForAuth
                ? await _wrapAndSignMessage(message, tracker)
                : await _wrapAndTagMessage(message, tracker, node);
            if (logFlags.verbose && logFlags.p2pNonFatal) {
                info(`The signed wrapped response to send back: ${utils.stringifyReduceLimit(respWithAuth)} size:${respWithAuth.msgSize}`);
            }
            if (route !== 'gossip') {
            }
            await respond(respWithAuth);
            hasHandlerResponded = true;
            return respWithAuth.msgSize;
        };
        const payloadArray = _extractPayload(wrappedPayload, NodeList.byIdOrder);
        const [payload, sender] = payloadArray;
        tracker = payloadArray[2] || '';
        msgSize = payloadArray[3] || cNoSizeTrack;
        if (!payload) {
            warn(`${route} Payload unable to be extracted, possible missing signature...`);
            await respond({ error: `${route} error: Payload unable to be extracted` });
            return;
        }
        if (!NodeList.nodes.has(sender)) {
            warn(`${route} Internal routes can only be used by nodes in the network...`);
            await respond({ error: `${route} error: Sender not in node list` });
            return;
        }
        if (route !== 'gossip') {
        }
        setIsUpTs(sender);
        await handler(payload, respondWrapped, sender, tracker, msgSize);
        if (!hasHandlerResponded && route !== 'gossip') {
            await respond({ error: `${route} error: No response from handler` });
        }
    };
    network.registerInternal(route, wrappedHandler);
    if (logFlags.p2pNonFatal)
        info(`registerInternal wrappedPayload, ${route} endpoint registeration complete`);
}
export function registerInternalBinary(route: string, handler: InternalBinaryHandler) {
    const wrappedHandler = async (wrappedPayload, respond, header: AppHeader, sign: Sign) => {
        if (logFlags.p2pNonFatal)
            info('registerInternalBinary: wrappedPayload', utils.stringifyReduceLimit(wrappedPayload));
        internalRecvCounter++;
        if (!acceptInternal) {
            if (logFlags.p2pNonFatal)
                info('registerInternalBinary: we are not currently accepting internal requests...');
            return;
        }
        let hasHandlerResponded = false;
        const respondWrapped = async (response, serializerFunc: (stream: VectorBufferStream, obj, root?: boolean) => void, responseHeaders: AppHeader = {}) => {
            try {
                const wrappedRespStream = responseSerializer(response, serializerFunc);
                responseHeaders.sender_id = Self.id;
                responseHeaders.tracker_id = header.tracker_id;
                if (logFlags.verbose && logFlags.p2pNonFatal)
                    info(`registerInternalBinary: wrapped response to send back: ${wrappedRespStream.getBuffer()} size: ${wrappedRespStream.getBufferLength()}`);
                if (route !== 'gossip') {
                }
                hasHandlerResponded = true;
                await respond(wrappedRespStream.getBuffer(), responseHeaders);
                return wrappedRespStream.getBufferLength();
            }
            catch (err: unknown) {
                error(`registerInternalBinary: route: ${route} responseHeaders: ${Utils.safeStringify(responseHeaders)}, Response: ${Utils.safeStringify(response)}, Error: ${utils.formatErrorMessage(err)}`);
                return 0;
            }
        };
        if (logFlags.verbose && logFlags.p2pNonFatal)
            info(`registerInternalBinary: request info: route: ${route} header: ${Utils.safeStringify(header)} sign: ${Utils.safeStringify(sign)}`);
        const isSignerKnown = NodeList.byPubKey.has(sign.owner);
        const isSenderKnown = NodeList.nodes.has(header.sender_id);
        const bothKnown = isSignerKnown && isSenderKnown;
        const isTestMode = config.debug.enableTestMode;
        if (bothKnown === false && !isTestMode) {
            if (logFlags.p2pNonFatal)
                warn('registerInternalBinary: internal route missing signer or sender...');
            return;
        }
        const isSignerSenderMismatch = NodeList.byPubKey.get(sign.owner).id !== header.sender_id;
        if (isSignerSenderMismatch && !isTestMode) {
            if (logFlags.p2pNonFatal)
                warn('registerInternalBinary: internal routes can only be used by nodes in the network...');
            return;
        }
        const requestPayload = _extractPayloadBinary(wrappedPayload);
        if (!requestPayload) {
            if (logFlags.p2pNonFatal)
                warn('registerInternalBinary: payload unable to be extracted, possible missing signature...');
            return;
        }
        if (route !== 'gossip') {
        }
        setIsUpTs(header.sender_id);
        await handler(requestPayload, respondWrapped, header, sign);
        if (!hasHandlerResponded && isAskRoute(route)) {
            const wrappedError = responseSerializer(InternalError('Handler failed to respond'), serializeResponseError);
            const responseHeaders: AppHeader = {};
            responseHeaders.sender_id = Self.id;
            responseHeaders.tracker_id = header.tracker_id;
            await respond(wrappedError.getBuffer(), responseHeaders);
        }
    };
    network.registerInternal(route, wrappedHandler);
}
export function unregisterInternal(route) {
    network.unregisterInternal(route);
}
function sortByID(first, second) {
    return utils.sortAscProp(first, second, 'id');
}
export function isNodeValidForInternalMessage(node: P2P.NodeListTypes.Node, debugMsg: string, checkForNodeDown = true, checkForNodeLost = true, checkIsUpRecent = true, checkNodesRotationBounds = false, txId: string = 'N/A'): boolean {
    const logErrors = logFlags.debug;
    if (node == null) {
        if (logErrors)
            if (logFlags.error)
                error(`isNodeValidForInternalMessage node == null ${utils.stringifyReduce(node.id)} ${debugMsg}`);
        return false;
    }
    if (modeAllowsValidNodeChecks() === false) {
        return true;
    }
    const nodeStatus = node.status;
    if (nodeStatus != 'active') {
    }
    if (NodeList.potentiallyRemoved.has(node.id)) {
    }
    if (checkIsUpRecent) {
        const { upRecent, age } = isNodeUpRecent(node.id, 5000);
        if (upRecent === true) {
            if (checkForNodeDown) {
                const { down, state } = isNodeDown(node.id);
                if (down === true) {
                    if (logErrors)
                        info(`isNodeUpRecentOverride: ${age} isNodeValidForInternalMessage isNodeDown == true state:${state} ${utils.stringifyReduce(node.id)} ${debugMsg}`);
                }
            }
            if (checkForNodeLost) {
                if (isNodeLost(node.id) === true) {
                    if (logErrors)
                        info(`isNodeUpRecentOverride: ${age} isNodeValidForInternalMessage isNodeLost == true ${utils.stringifyReduce(node.id)} ${debugMsg}`);
                }
            }
            return true;
        }
        else {
            if (logErrors)
                warn(`isNodeUpRecentOverride: ${age} upRecent = false. no recent TX, but this is not a fail conditions`);
        }
    }
    if (config.p2p.downNodeFilteringEnabled && checkForNodeDown) {
        const { down, state } = isNodeDown(node.id);
        if (down === true) {
            if (logErrors)
                if (logFlags.error)
                    error(`isNodeValidForInternalMessage isNodeDown == true state:${state} ${utils.stringifyReduce(node.id)} ${debugMsg}`);
            return false;
        }
    }
    if (checkForNodeLost) {
        if (isNodeLost(node.id) === true) {
            if (logErrors)
                if (logFlags.error)
                    error(`isNodeValidForInternalMessage isNodeLost == true ${utils.stringifyReduce(node.id)} ${debugMsg}`);
            return false;
        }
    }
    return true;
}
export function modeAllowsValidNodeChecks() {
    const newestCycle = CycleChain.newest;
    if (newestCycle) {
        if (newestCycle.mode === 'processing') {
            return true;
        }
        if (newestCycle.mode === 'forming') {
            return true;
        }
        if (Self.isRestartNetwork ||
            newestCycle.mode === 'recovery' ||
            newestCycle.mode === 'restart' ||
            newestCycle.mode === 'restore') {
            return false;
        }
    }
    return true;
}
function calculateGossipFactor(numberOfNodes: number): number {
    if (numberOfNodes === 0)
        return config.p2p.gossipFactor;
    function getBaseLog(x: number, y: number) {
        return Math.log(y) / Math.log(x);
    }
    const gossipFactor = Math.ceil(getBaseLog(3, numberOfNodes));
    return gossipFactor;
}
export async function sendGossip(type: string, payload, tracker = '', sender = null, inpNodes: Shardus.Node[] | Shardus.NodeWithRank[] = NodeList.byIdOrder, isOrigin = false, factor = -1, txId = '', context = '', commonOrigin = false) {
    let msgSize = cUninitializedSize;
    const nodes = [...inpNodes];
    if (nodes.length === 0) {
        return;
    }
    if (tracker === '') {
        tracker = createGossipTracker();
    }
    if (logFlags.verbose && logFlags.p2pNonFatal) {
        info(`Start of sendGossipIn(${utils.stringifyReduce(payload)})`);
    }
    const gossipPayload = { type, data: payload };
    nodes.sort(sortByID);
    const nodeIdxs = new Array(nodes.length).fill(0).map((curr, idx) => idx);
    const myIdx = nodes.findIndex((node) => node.id === Self.id);
    if (myIdx < 0) {
        error(`Failed to sendGossip. Could not find self in nodes array ${type}`);
        return msgSize;
    }
    let gossipFactor = config.p2p.gossipFactor;
    if (config.p2p.dynamicGossipFactor) {
        gossipFactor = calculateGossipFactor(nodes.length);
    }
    if (factor > 0) {
        gossipFactor = factor;
    }
    let recipientIdxs;
    let originNode;
    let originIdx;
    if (payload.sign) {
        originNode = NodeList.byPubKey.get(payload.sign.owner);
        if (originNode)
            originIdx = nodes.findIndex((node) => node.id === originNode.id);
    }
    if (originIdx !== undefined && originIdx >= 0 && !commonOrigin) {
        recipientIdxs = utils.getLinearGossipBurstList(nodeIdxs.length, gossipFactor, myIdx, originIdx);
        if (logFlags.seqdiagram && txId != '') {
        }
    }
    else {
        recipientIdxs = utils.getLinearGossipList(nodeIdxs.length, gossipFactor, myIdx, isOrigin);
        if (logFlags.seqdiagram && txId != '') {
        }
    }
    let recipients: P2P.NodeListTypes.Node[] = recipientIdxs.map((idx) => nodes[idx]);
    if (sender != null) {
        recipients = utils.removeNodesByID(recipients, [sender]);
    }
    try {
        if (logFlags.verbose && logFlags.p2pNonFatal) {
            info(`GossipingIn ${type} request to these nodes: ${utils.stringifyReduce(recipients.map((node) => utils.makeShortHash(node.id) + ':' + node.externalPort))}`);
        }
        for (const node of recipients) {
            gossipSent++;
            gossipTypeSent[type] = gossipTypeSent[type] ? gossipTypeSent[type] + 1 : 1;
        }
        if (commsCounters) {
        }
        if (config.p2p.preGossipNodeCheck) {
            const oldCount = recipients.length;
            recipients = recipients.filter((node) => {
                if (isNodeValidForInternalMessage(node, 'sendGossip', config.p2p.preGossipDownCheck, config.p2p.preGossipLostCheck, config.p2p.preGossipRecentCheck, false, txId)) {
                    return true;
                }
                else {
                }
            });
            const newCount = recipients.length;
            if (oldCount != newCount) {
            }
            if (oldCount > 0 && newCount === 0) {
            }
        }
        if (logFlags.seqdiagram && txId != '') {
            let prefix = '';
            let suffix = '';
            if (isOrigin)
                prefix = 'orig:';
            if (context != '')
                suffix = `:${suffix}`;
            for (const node of recipients) {
            }
        }
        msgSize = await tellBinary<GossipReqBinary>(recipients, InternalRouteEnum.binary_gossip, gossipPayload, serializeGossipReq, {
            tracker_id: tracker,
        }, true, tracker);
    }
    catch (ex) {
        if (logFlags.verbose) {
            error(`Failed to sendGossip(${type}, ${utils.stringifyReduce(payload)}) Exception => ${ex}`);
        }
        fatal(`sendGossipIn: ${type}: ` + ex.name + ': ' + ex.message + ' at ' + ex.stack);
    }
    if (logFlags.verbose && logFlags.p2pNonFatal) {
        info(`End of sendGossipIn(${utils.stringifyReduce(payload)})`);
    }
    return msgSize;
}
export async function sendGossipAll(type: string, payload, tracker = '', sender = null, inpNodes = NodeList.byIdOrder) {
    let msgSize = cUninitializedSize;
    const nodes = [...inpNodes];
    if (nodes.length === 0)
        return;
    if (tracker === '') {
        tracker = createGossipTracker();
    }
    if (logFlags.verbose) {
    }
    const gossipPayload = { type, data: payload };
    const gossipHash = crypto.hash(gossipPayload);
    nodes.sort(sortByID);
    const nodeIdxs = new Array(nodes.length).fill(0).map((curr, idx) => idx);
    const myIdx = nodes.findIndex((node) => node.id === Self.id);
    if (myIdx < 0) {
        error(`Failed to sendGossip. Could not find self in nodes array ${type}`);
        return msgSize;
    }
    let recipients = nodes;
    if (sender != null) {
        recipients = utils.removeNodesByID(recipients, [sender]);
    }
    try {
        if (logFlags.verbose) {
        }
        for (const node of recipients) {
        }
        if (commsCounters) {
        }
        if (config.p2p.preGossipNodeCheck) {
            recipients = recipients.filter((node) => {
                if (isNodeValidForInternalMessage(node, 'sendGossip', config.p2p.preGossipDownCheck, config.p2p.preGossipLostCheck, config.p2p.preGossipRecentCheck)) {
                    return true;
                }
                else {
                }
            });
        }
        msgSize = await tellBinary<GossipReqBinary>(recipients, InternalRouteEnum.binary_gossip, gossipPayload, serializeGossipReq, {
            tracker_id: tracker,
        }, true, tracker);
    }
    catch (ex) {
        if (logFlags.verbose) {
            p2pLogger.error(`Failed to sendGossip(${type} ${utils.stringifyReduce(payload)}) Exception => ${ex}`);
        }
        p2pLogger.fatal(`sendGossipIn: ${type}:` + ex.name + ': ' + ex.message + ' at ' + ex.stack);
    }
    if (logFlags.verbose) {
    }
    return msgSize;
}
export async function handleGossip(payload, sender, tracker = '', msgSize = cNoSizeTrack) {
    if (logFlags.verbose && logFlags.p2pNonFatal) {
        info(`Start of handleGossip(${utils.stringifyReduce(payload)})`);
    }
    const err = utils.validateTypes(payload, { type: 's', data: 'o' });
    if (err) {
        warn('handleGossip: bad payload: ' + err);
        return;
    }
    const type = payload.type;
    const data = payload.data;
    const gossipHandler = gossipHandlers[type];
    if (!gossipHandler) {
        warn(`Gossip Handler not found: type ${type}, data: ${Utils.safeStringify(data)}`);
        return;
    }
    setIsUpTs(sender);
    gossipRecv++;
    gossipTypeRecv[type] = gossipTypeRecv[type] ? gossipTypeRecv[type] + 1 : 1;
    await gossipHandler(data, sender, tracker, msgSize);
    if (logFlags.verbose && logFlags.p2pNonFatal) {
        info(`End of handleGossip(${utils.stringifyReduce(payload)})`);
    }
}
export function registerGossipHandler(type, handler) {
    gossipHandlers[type] = handler;
}
export function unregisterGossipHandler(type) {
    if (gossipHandlers[type]) {
        delete gossipHandlers[type];
    }
}
function pruneGossipHashes() {
    if (logFlags.p2pNonFatal) {
        info(`Total  gossipSent:${gossipSent} gossipRecv:${gossipRecv}`);
        info(`Sent gossip by type: ${Utils.safeStringify(gossipTypeSent)}`);
        info(`Recv gossip by type: ${Utils.safeStringify(gossipTypeRecv)}`);
    }
}
function info(...msg) {
    const entry = `Comms: ${msg.join(' ')}`;
}
function warn(...msg) {
    const entry = `Comms: ${msg.join(' ')}`;
    p2pLogger.warn(entry);
}
function error(...msg) {
    const entry = `Comms: ${msg.join(' ')}`;
    p2pLogger.error(entry);
}
function fatal(...msg) {
    const entry = `Comms: ${msg.join(' ')}`;
    p2pLogger.fatal(entry);
}