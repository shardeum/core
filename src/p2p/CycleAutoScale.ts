import deepmerge from 'deepmerge';
import { Logger } from 'log4js';
import { logFlags } from '../logger';
import { P2P } from '@shardus/types';
import { sleep, validateTypes, fastIsPicked } from '../utils';
import * as Comms from './Comms';
import { config, crypto, logger, stateManager } from './Context';
import * as CycleChain from './CycleChain';
import * as CycleCreator from './CycleCreator';
import * as NodeList from './NodeList';
import * as Self from './Self';
import { profilerInstance } from '../utils/profiler';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { enterRecovery, enterSafety } from './Modes';
import { getOurNodeIndex } from './Utils';
import { shardusGetTime } from '../network';
import { Utils } from '@shardus/types';
let p2pLogger: Logger;
export let scalingRequested: boolean;
export let requestedScalingType: string;
export let approvedScalingType: string;
export let lastScalingType: string;
export let scalingRequestsCollector: Map<P2P.CycleAutoScaleTypes.ScaleRequest['nodeId'], P2P.CycleAutoScaleTypes.SignedScaleRequest>;
export let desiredCount: number;
export let targetCount: number;
reset();
const gossipScaleRoute: P2P.P2PTypes.GossipHandler<P2P.CycleAutoScaleTypes.SignedScaleRequest> = async (payload, sender, tracker) => {
    try {
        if (logFlags.p2pNonFatal)
            info(`Got scale request: ${Utils.safeStringify(payload)}`);
        if (!payload) {
            warn('No payload provided for the `scaling` request.');
            return;
        }
        const id = payload.nodeId;
        if (_canThisNodeSendScaleRequests(id) !== true) {
            return;
        }
        const added = addExtScalingRequest(payload);
        if (!added)
            return;
        Comms.sendGossip('scaling', payload, tracker, sender, NodeList.byIdOrder, false, 2);
    }
    finally {
    }
};
const routes = {
    internal: {},
    gossip: {
        scaling: gossipScaleRoute,
    },
};
export function init() {
    p2pLogger = logger.getLogger('p2p');
    desiredCount = config.p2p.minNodes;
    for (const [name, handler] of Object.entries(routes.gossip)) {
        Comms.registerGossipHandler(name, handler);
    }
}
export function reset() {
    if (logFlags?.verbose)
        logger.mainLog_debug('RESET_1', logger.combine('Resetting auto-scale module', `Cycle ${CycleCreator.currentCycle}, Quarter: ${CycleCreator.currentQuarter}`));
    scalingRequested = false;
    scalingRequestsCollector = new Map();
    requestedScalingType = null;
    approvedScalingType = null;
}
export function getDesiredCount(): number {
    if (desiredCount < config.p2p.minNodes) {
        return (desiredCount = config.p2p.minNodes);
    }
    else {
        return desiredCount;
    }
}
function createScaleRequest(scaleType): P2P.CycleAutoScaleTypes.SignedScaleRequest {
    const request: P2P.CycleAutoScaleTypes.ScaleRequest = {
        nodeId: Self.id,
        timestamp: shardusGetTime(),
        counter: CycleCreator.currentCycle,
        scale: undefined,
    };
    switch (scaleType) {
        case P2P.CycleAutoScaleTypes.ScaleType.UP:
            request.scale = P2P.CycleAutoScaleTypes.ScaleType.UP;
            break;
        case P2P.CycleAutoScaleTypes.ScaleType.DOWN:
            request.scale = P2P.CycleAutoScaleTypes.ScaleType.DOWN;
            break;
        default:
            const err = new Error(`Invalid scaling request type: ${scaleType}`);
            error(err);
            throw err;
    }
    const signedReq = crypto.sign(request);
    return signedReq;
}
function _requestNetworkScaling(upOrDown) {
    if (!Self.isActive || scalingRequested)
        return;
    const signedRequest: P2P.CycleAutoScaleTypes.SignedScaleRequest = createScaleRequest(upOrDown);
    const isRequestAdded = addExtScalingRequest(signedRequest);
    if (isRequestAdded) {
        info(`Our scale request is added. Gossiping our scale request to other nodes. ${Utils.safeStringify(signedRequest)}`);
        Comms.sendGossip('scaling', signedRequest, '', null, NodeList.byIdOrder, true, 2);
        scalingRequested = true;
        requestedScalingType = signedRequest.scale;
    }
}
export function requestNetworkUpsize() {
    if (getDesiredCount() >= config.p2p.maxNodes) {
        return;
    }
    if (_canThisNodeSendScaleRequests(Self.id) === false && config.debug.ignoreScaleGossipSelfCheck === false) {
        return;
    }
    if (logFlags?.verbose)
        logger.mainLog_debug('REQUESTNETWORKUPSIZE_1', 'CycleAutoScale: UPSIZE!');
    _requestNetworkScaling(P2P.CycleAutoScaleTypes.ScaleType.UP);
}
export function requestNetworkDownsize() {
    if (getDesiredCount() <= config.p2p.minNodes) {
        return;
    }
    if (_canThisNodeSendScaleRequests(Self.id) === false && config.debug.ignoreScaleGossipSelfCheck === false) {
        return;
    }
    if (logFlags?.verbose)
        logger.mainLog_debug('REQUESTNETWORKDOWNSIZE_1', 'CycleAutoScale: DOWNSIZE!');
    _requestNetworkScaling(P2P.CycleAutoScaleTypes.ScaleType.DOWN);
}
function addExtScalingRequest(scalingRequest: P2P.CycleAutoScaleTypes.SignedScaleRequest): boolean {
    const added = _addScalingRequest(scalingRequest);
    return added;
}
function validateScalingRequest(scalingRequest: P2P.CycleAutoScaleTypes.SignedScaleRequest): boolean {
    if (!scalingRequest.nodeId ||
        !scalingRequest.timestamp ||
        !scalingRequest.counter ||
        !scalingRequest.scale ||
        !scalingRequest.sign) {
        warn(`Invalid scaling request, missing fields. Request: ${Utils.safeStringify(scalingRequest)}`);
        return false;
    }
    if (scalingRequest.counter !== CycleCreator.currentCycle) {
        warn(`Invalid scaling request, not for this cycle. Current cycle:${CycleCreator.currentCycle}, cycleInScaleRequest: ${scalingRequest.counter} Request: ${Utils.safeStringify(scalingRequest)}`);
        return false;
    }
    if (scalingRequest.scale !== P2P.CycleAutoScaleTypes.ScaleType.UP &&
        scalingRequest.scale !== P2P.CycleAutoScaleTypes.ScaleType.DOWN) {
        warn(`Invalid scaling request, not a valid scaling type. Request: ${Utils.safeStringify(scalingRequest)}`);
        return false;
    }
    let node;
    try {
        node = NodeList.nodes.get(scalingRequest.nodeId);
    }
    catch (e) {
        warn(e);
        warn(`Invalid scaling request, not a known node. Request: ${Utils.safeStringify(scalingRequest)}`);
        return false;
    }
    if (node == null) {
        warn(`Invalid scaling request, not a known node. Request: ${Utils.safeStringify(scalingRequest)}`);
        return false;
    }
    if (!crypto.verify(scalingRequest, node.publicKey)) {
        warn(`Invalid scaling request, signature is not valid. Request: ${Utils.safeStringify(scalingRequest)}`);
        return false;
    }
    return true;
}
function _canThisNodeSendScaleRequests(_nodeId: string) {
    let scaleVoteLimits = config.p2p.scaleGroupLimit > 0;
    if (scaleVoteLimits === false) {
        return true;
    }
    if (stateManager.currentCycleShardData == null) {
        return false;
    }
    let numActiveNodes = NodeList.activeByIdOrder.length;
    if (numActiveNodes < config.p2p.scaleGroupLimit) {
        return true;
    }
    let canSendGossip = false;
    let offset = CycleChain.newest.counter;
    const ourIndex = getOurNodeIndex();
    if (ourIndex == null)
        return false;
    canSendGossip = fastIsPicked(ourIndex, numActiveNodes, config.p2p.scaleGroupLimit, offset);
    return canSendGossip;
}
function _checkScaling() {
    let changed = false;
    lastScalingType = approvedScalingType;
    if (approvedScalingType === P2P.CycleAutoScaleTypes.ScaleType.UP) {
        warn('Already set to scale up this cycle. No need to scale up anymore.');
        return;
    }
    if (approvedScalingType === P2P.CycleAutoScaleTypes.ScaleType.DOWN) {
        warn('Already set to scale down this cycle. No need to scale down anymore.');
        return;
    }
    if (CycleChain.newest != null && CycleChain.newest.desired != null) {
        desiredCount = CycleChain.newest.desired;
    }
    let numActiveNodes = NodeList.activeByIdOrder.length;
    let requiredVotes = Math.max(config.p2p.minScaleReqsNeeded, config.p2p.scaleConsensusRequired * numActiveNodes);
    let scaleUpRequests = getScaleUpRequests();
    let scaleDownRequests = getScaleDownRequests();
    let scaleVoteLimits = config.p2p.scaleGroupLimit > 0 && numActiveNodes > config.p2p.scaleGroupLimit;
    if (scaleVoteLimits) {
        requiredVotes = Math.min(requiredVotes, config.p2p.scaleGroupLimit * config.p2p.scaleConsensusRequired);
    }
    if (scaleUpRequests.length >= requiredVotes && scaleUpRequests.length >= scaleDownRequests.length) {
        approvedScalingType = P2P.CycleAutoScaleTypes.ScaleType.UP;
        changed = true;
    }
    if (!changed) {
        if (logFlags?.verbose)
            logger.mainLog_debug('CHECKSCALING_1', 'CycleAutoScale: scale up not approved');
        if (scaleDownRequests.length >= requiredVotes) {
            approvedScalingType = P2P.CycleAutoScaleTypes.ScaleType.DOWN;
            changed = true;
        }
        else {
            return;
        }
    }
    lastScalingType = approvedScalingType;
    let newDesired;
    switch (approvedScalingType) {
        case P2P.CycleAutoScaleTypes.ScaleType.UP:
            newDesired = CycleChain.newest.desired + config.p2p.amountToGrow;
            if (newDesired > config.p2p.maxNodes)
                newDesired = config.p2p.maxNodes;
            let moreThanActiveMax = Math.floor(numActiveNodes * config.p2p.maxDesiredMultiplier);
            if (newDesired > moreThanActiveMax)
                newDesired = moreThanActiveMax;
            setDesiredCount(newDesired);
            break;
        case P2P.CycleAutoScaleTypes.ScaleType.DOWN:
            newDesired = CycleChain.newest.desired - config.p2p.amountToGrow;
            if (newDesired < config.p2p.minNodes)
                newDesired = config.p2p.minNodes;
            setDesiredCount(newDesired);
            break;
        default:
            error(new Error(`Invalid scaling flag after changing flag. Flag: ${approvedScalingType}`));
            return;
    }
    if (logFlags?.verbose)
        logger.mainLog_debug('CHECKSCALING_2', logger.combine('newDesired', newDesired));
}
function setDesiredCount(count: number) {
    const lowerLimit = config.p2p.minNodes;
    if (count >= lowerLimit && count <= config.p2p.maxNodes) {
        desiredCount = count;
    }
}
function setAndGetTargetCount(prevRecord: P2P.CycleCreatorTypes.CycleRecord): number {
    const active = NodeList.activeByIdOrder.length;
    const syncing = NodeList.syncingByIdOrder.length;
    if (prevRecord && prevRecord.mode !== undefined) {
        const desired = prevRecord.desired;
        if (prevRecord.mode === 'forming') {
            if (active != desired) {
                if (active < desired) {
                    let add = ~~(0.5 * active);
                    if (add < config.p2p.formingNodesPerCycle) {
                        add = config.p2p.formingNodesPerCycle;
                    }
                    targetCount = active + add;
                    if (targetCount > desired) {
                        targetCount = desired;
                    }
                }
                if (active > desired) {
                    let sub = ~~(0.3 * active);
                    if (sub < 1) {
                        sub = 1;
                    }
                    targetCount = active - sub;
                    if (targetCount < desired) {
                        targetCount = desired;
                    }
                }
            }
        }
        else if (prevRecord.mode === 'processing') {
            if (logFlags?.verbose)
                logger.mainLog_debug('SETANDGETTARGETCOUNT_PROCESSING_1', "CycleAutoScale: in processing");
            if (enterSafety(active) === false && enterRecovery(active) === false) {
                if (logFlags?.verbose)
                    logger.mainLog_debug('SETANDGETTARGETCOUNT_PROCESSING_2', "CycleAutoScale: not in safety");
                let addRem = (desired - prevRecord.target) * 0.1;
                if (logFlags?.verbose)
                    logger.mainLog_debug('SETANDGETTARGETCOUNT_PROCESSING_3', `addRem: ${addRem}, desired: ${desired}, prevTarget: ${prevRecord.target}`);
                if (addRem > active * 0.01) {
                    addRem = active * 0.01;
                }
                if (addRem < 0 - active * 0.005) {
                    addRem = 0 - active * 0.005;
                }
                if (logFlags?.verbose)
                    logger.mainLog_debug('SETANDGETTARGETCOUNT_PROCESSING_4', `CycleAutoScale: prev target is ${prevRecord.target} and addRem is ${addRem}`);
                targetCount = prevRecord.target + addRem;
                if (targetCount < config.p2p.minNodes) {
                    targetCount = config.p2p.minNodes;
                }
                else if (targetCount > config.p2p.maxNodes) {
                    targetCount = config.p2p.maxNodes;
                }
            }
        }
        else if (prevRecord.mode === 'safety' ||
            prevRecord.mode === 'restore') {
            targetCount = config.p2p.minNodes;
        }
        else if (prevRecord.mode === 'recovery') {
            targetCount = config.p2p.minNodes + config.p2p.extraNodesToAddInRestart;
        }
        else if (prevRecord.mode === 'restart') {
            if (logFlags?.verbose)
                logger.mainLog_debug('SETANDGETTARGETCOUNT_RESTART_1', "CycleAutoScale: in restart");
            if (syncing < desired + config.p2p.extraNodesToAddInRestart) {
                let add = ~~(0.5 * syncing);
                if (add < config.p2p.formingNodesPerCycle) {
                    add = config.p2p.formingNodesPerCycle;
                }
                targetCount = syncing + add;
                if (targetCount > desired + config.p2p.extraNodesToAddInRestart) {
                    targetCount = desired + config.p2p.extraNodesToAddInRestart;
                }
            }
        }
        else if (prevRecord.mode === 'shutdown')
            targetCount = config.p2p.formingNodesPerCycle;
    }
    else if (Self.isFirst && active < 1) {
        targetCount = config.p2p.formingNodesPerCycle;
    }
    if (logFlags?.verbose)
        logger.mainLog_debug('SETANDGETTARGETCOUNT_1', logger.combine('CycleAutoScale: target count is', targetCount));
    return targetCount;
}
export function configUpdated() {
    if (desiredCount < config.p2p.minNodes) {
        desiredCount = config.p2p.minNodes;
    }
}
export function queueRequest(request) { }
export function sendRequests() { }
export function getTxs(): P2P.CycleAutoScaleTypes.Txs {
    const requestsCopy = deepmerge({}, [...Object.values(scalingRequestsCollector)]);
    return {
        autoscaling: requestsCopy,
    };
}
export function validateRecordTypes(rec: P2P.CycleAutoScaleTypes.Record): string {
    let err = validateTypes(rec, { desired: 'n' });
    if (err)
        return err;
    return '';
}
export function updateRecord(txs: P2P.CycleAutoScaleTypes.Txs, record: P2P.CycleCreatorTypes.CycleRecord, prevRecord: P2P.CycleCreatorTypes.CycleRecord) {
    _checkScaling();
    record.desired = getDesiredCount();
    record.target = setAndGetTargetCount(prevRecord);
    reset();
}
export function parseRecord(record: P2P.CycleCreatorTypes.CycleRecord): P2P.CycleParserTypes.Change {
    return {
        added: [],
        removed: [],
        updated: [],
    };
}
function getScaleUpRequests(): P2P.CycleAutoScaleTypes.SignedScaleRequest[] {
    let requests = [];
    for (let [nodeId, request] of scalingRequestsCollector) {
        if (request.scale === P2P.CycleAutoScaleTypes.ScaleType.UP)
            requests.push(request);
    }
    return requests;
}
function getScaleDownRequests(): P2P.CycleAutoScaleTypes.SignedScaleRequest[] {
    let requests = [];
    for (let [nodeId, request] of scalingRequestsCollector) {
        if (request.scale === P2P.CycleAutoScaleTypes.ScaleType.DOWN)
            requests.push(request);
    }
    return requests;
}
function _addToScalingRequests(scalingRequest): boolean {
    switch (scalingRequest.scale) {
        case P2P.CycleAutoScaleTypes.ScaleType.UP:
            if (scalingRequestsCollector.size >= config.p2p.maxScaleReqs) {
                warn('Max scale up requests already exceeded. Cannot add request.');
                return true;
            }
            scalingRequestsCollector.set(scalingRequest.nodeId, scalingRequest);
            return true;
        case P2P.CycleAutoScaleTypes.ScaleType.DOWN:
            if (scalingRequestsCollector.size >= config.p2p.maxScaleReqs) {
                warn('Max scale down requests already exceeded. Cannot add request.');
                return true;
            }
            scalingRequestsCollector.set(scalingRequest.nodeId, scalingRequest);
            return true;
        default:
            warn(`Invalid scaling type in _addToScalingRequests(). Request: ${Utils.safeStringify(scalingRequest)}`);
            return false;
    }
}
function _addScalingRequest(scalingRequest: P2P.CycleAutoScaleTypes.SignedScaleRequest): boolean {
    if (!scalingRequest.nodeId)
        return false;
    if (scalingRequestsCollector.has(scalingRequest.nodeId))
        return false;
    const valid = validateScalingRequest(scalingRequest);
    if (!valid)
        return false;
    const added = _addToScalingRequests(scalingRequest);
    return added;
}
async function _waitUntilEndOfCycle() {
    const currentTime = shardusGetTime();
    const nextQ1Start = CycleCreator.nextQ1Start;
    if (logFlags.p2pNonFatal)
        info(`Current time is: ${currentTime}`);
    if (logFlags.p2pNonFatal)
        info(`Next cycle will start at: ${nextQ1Start}`);
    let timeToWait;
    if (currentTime < nextQ1Start) {
        timeToWait = nextQ1Start - currentTime + config.p2p.queryDelay * 1000;
    }
    else {
        timeToWait = 0;
    }
    if (logFlags.p2pNonFatal)
        info(`Waiting for ${timeToWait} ms before next cycle marker creation...`);
    await sleep(timeToWait);
}
function info(...msg) {
    const entry = `CycleAutoScale: ${msg.join(' ')}`;
}
function warn(...msg) {
    const entry = `CycleAutoScale: ${msg.join(' ')}`;
    p2pLogger.warn(entry);
}
function error(...msg) {
    const entry = `CycleAutoScale: ${msg.join(' ')}`;
    p2pLogger.error(entry);
}