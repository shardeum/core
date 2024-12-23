import { P2P } from '@shardus/types';
import { NodeStatus, SignedObject } from '@shardus/types/build/src/p2p/P2PTypes';
import * as events from 'events';
import * as log4js from 'log4js';
import { logFlags } from '../logger';
import * as network from '../network';
import * as utils from '../utils';
import { isInvalidIP } from '../utils/functions/checkIP';
import { nestedCountersInstance } from '../utils/nestedCounters';
import * as Archivers from './Archivers';
import * as Comms from './Comms';
import * as Context from './Context';
import * as CycleCreator from './CycleCreator';
import { calcIncomingTimes, q1SendRequests } from './CycleCreator';
import * as GlobalAccounts from './GlobalAccounts';
import * as Join from './Join';
import * as JoinV2 from './Join/v2';
import * as Acceptance from './Join/v2/acceptance';
import * as NodeList from './NodeList';
import * as Sync from './Sync';
import * as SyncV2 from './SyncV2/';
import { getRandomAvailableArchiver, SeedNodesList } from './Utils';
import * as CycleChain from './CycleChain';
import rfdc from 'rfdc';
import { shardusGetTime } from '../network';
import getCallstack from '../utils/getCallstack';
import { ActiveNode } from '@shardus/types/build/src/p2p/SyncTypes';
import { Result } from 'neverthrow';
const deepCopy = rfdc();
import { isServiceMode } from '../debug';
import { submitStandbyRefresh } from './Join/v2/standbyRefresh';
import { getNumArchivers } from './Archivers';
import { currentQuarter } from './CycleCreator';
import { Utils } from '@shardus/types';
import * as ServiceQueue from './ServiceQueue';
const startTimestamp = Date.now();
export const emitter = new events.EventEmitter();
let p2pLogger: log4js.Logger;
export let id: string;
export let isFirst: boolean;
export let isActive = false;
export let isFailed = false;
export let allowConnectionToFirstNode = false;
export let ip: string;
export let port: number;
export let isRestartNetwork = false;
export let p2pJoinTime = 0;
export let p2pSyncStart = 0;
export let p2pSyncEnd = 0;
export let p2pIgnoreJoinRequests = true;
let joinRequestCounter;
let mode = null;
let state = P2P.P2PTypes.NodeStatus.INITIALIZING;
let firstTimeJoiningLoop = true;
let isFirstRefresh = true;
let cyclesElapsedSinceRefresh = 0;
const idErrorMessage = `id did not match the cycle record info`;
const nodeMatch = (node) => node.externalIp === network.ipInfo.externalIp && node.externalPort === network.ipInfo.externalPort;
export function init(): void {
    ip = network.ipInfo.externalIp;
    port = network.ipInfo.externalPort;
    p2pLogger = Context.logger.getLogger('p2p');
    if (isServiceMode()) {
        info('p2p/Self/init disabled: Starting in service mode.');
        return;
    }
    Comms.init();
    Archivers.init();
    CycleCreator.init();
    GlobalAccounts.init();
    NodeList.init();
    Sync.init();
    CycleChain.init();
    if (Context.config.p2p.useSyncProtocolV2) {
        SyncV2.init();
    }
    if (Context.config.p2p.useJoinProtocolV2) {
        JoinV2.init();
    }
    p2pLogger = Context.logger.getLogger('p2p');
    updateNodeState(P2P.P2PTypes.NodeStatus.INITIALIZING);
}
export function startupV2(): Promise<boolean> {
    const promise = new Promise<boolean>((resolve, reject) => {
        if (isServiceMode()) {
            info('p2p/Self/startup disabled: Starting in service mode.');
            return true;
        }
        const publicKey = Context.crypto.getPublicKey();
        let attemptJoiningTimer = null;
        let attemptJoiningRunning = false;
        let cycleDuration = Context.config.p2p.cycleDuration;
        const enterSyncingState = async (): Promise<void> => {
            try {
                updateNodeState(P2P.P2PTypes.NodeStatus.SELECTED);
                p2pSyncStart = shardusGetTime();
                if (logFlags.p2pNonFatal)
                    info('Emitting `joined` event.');
                emitter.emit('joined', id, publicKey);
                await syncCycleChain(id);
                await Join.queueStartedSyncingRequest();
                Comms.setAcceptInternal(true);
                await CycleCreator.startCycles();
                p2pSyncEnd = shardusGetTime();
                p2pJoinTime = (p2pSyncEnd - p2pSyncStart) / 1000;
                if (logFlags.p2pNonFatal)
                    info('Emitting `initialized` event.' + p2pJoinTime);
                emitter.emit('initialized');
                return resolve(true);
            }
            catch (err) {
                if (err.message === idErrorMessage) {
                    emitter.emit('invoke-exit', `id did not match`, getCallstack(), idErrorMessage, true);
                }
                if (logFlags.important_as_fatal)
                    warn('Error while syncing to network:');
                if (logFlags.important_as_fatal)
                    warn(utils.formatErrorMessage(err));
                throw new Error('Fatal: Error while syncing to network:' + err.message);
            }
        };
        const attemptJoining = async (): Promise<void> => {
            if (attemptJoiningRunning) {
                return;
            }
            attemptJoiningRunning = true;
            if (attemptJoiningTimer) {
                clearTimeout(attemptJoiningTimer);
            }
            try {
                info(`startupV2: attemptJoining enter`);
                const activeNodes = await contactArchiver('startupV2:attemptJoining');
                info(`startupV2: got active nodes: ${activeNodes.length}`);
                if (utils.isUndefined(isFirst)) {
                    isFirst = discoverNetwork(activeNodes);
                    if (isFirst) {
                        id = await Join.firstJoin();
                        await enterSyncingState();
                        attemptJoiningRunning = false;
                        return;
                    }
                }
                const ourIdx = activeNodes.findIndex((node) => node.ip === network.ipInfo.externalIp && node.port === network.ipInfo.externalPort);
                if (ourIdx > -1) {
                    if (activeNodes.length === 1)
                        isFirst = undefined;
                    activeNodes.splice(ourIdx, 1);
                }
                const latestCycle = await Sync.getNewestCycle(activeNodes);
                cycleDuration = latestCycle.duration;
                mode = latestCycle.mode || null;
                const resp = await Join.fetchJoinedV2(activeNodes);
                info(`startupV2: resp ${Utils.safeStringify(resp)}`);
                if (resp?.id) {
                    if (firstTimeJoiningLoop === true) {
                        isFailed = true;
                        utils.sleep(Context.config.p2p.delayZombieRestartSec * 1000).then(() => {
                            const message = `node detected as zombie node, waited ${Context.config.p2p.delayZombieRestartSec} seconds before restart`;
                            emitter.emit('invoke-exit', `node restarted ungracefully, needs to restart`, getCallstack(), message, false);
                        });
                        attemptJoiningRunning = false;
                        return;
                    }
                    id = resp.id;
                    await enterSyncingState();
                    attemptJoiningRunning = false;
                    return;
                }
                firstTimeJoiningLoop = false;
                if (resp?.isOnStandbyList === true) {
                    if (state !== P2P.P2PTypes.NodeStatus.STANDBY) {
                        updateNodeState(P2P.P2PTypes.NodeStatus.STANDBY);
                    }
                    if (isFirstRefresh) {
                        if (latestCycle.counter >=
                            joinRequestCounter +
                                Context.config.p2p.standbyListCyclesTTL -
                                Context.config.p2p.cyclesToRefreshEarly) {
                            isFirstRefresh = false;
                            submitStandbyRefresh(publicKey);
                            cyclesElapsedSinceRefresh = 0;
                        }
                    }
                    else if (cyclesElapsedSinceRefresh >= Context.config.p2p.standbyListCyclesTTL) {
                        submitStandbyRefresh(publicKey);
                        cyclesElapsedSinceRefresh = 0;
                    }
                    cyclesElapsedSinceRefresh += Context.config.p2p.attemptJoiningWaitMultiplier;
                    attemptJoiningTimer = setTimeout(() => {
                        attemptJoining();
                    }, Context.config.p2p.attemptJoiningWaitMultiplier * cycleDuration * 1000);
                    attemptJoiningRunning = false;
                    return;
                }
                if (state === P2P.P2PTypes.NodeStatus.STANDBY) {
                    if (resp?.isOnStandbyList === false) {
                        const message = `validator removed from standby list`;
                        emitter.emit('invoke-exit', `removed from standby list`, getCallstack(), message, true);
                        attemptJoiningRunning = false;
                        return;
                    }
                }
                if (resp?.isOnStandbyList === false) {
                    await joinNetworkV2(activeNodes);
                    attemptJoiningTimer = setTimeout(() => {
                        attemptJoining();
                    }, 2 * cycleDuration * 1000);
                    attemptJoiningRunning = false;
                    return;
                }
                throw new Error('Should not reach this point. Throwing non-fatal error which will restart attemptJoining');
            }
            catch (err) {
                if (logFlags.important_as_fatal)
                    warn(`Error while joining network:`);
                if (logFlags.important_as_fatal)
                    warn(utils.formatErrorMessage(err));
                if (err.message.startsWith('Fatal:')) {
                    attemptJoiningRunning = false;
                    if (logFlags.fatal)
                        warn(`Fatal error while joining network. re-throw to cause shutdown`);
                    throw err;
                }
                if (logFlags.important_as_fatal)
                    info(`Trying to join again in ${cycleDuration} seconds...`);
                attemptJoiningTimer = setTimeout(() => {
                    attemptJoining();
                }, cycleDuration * 1000);
            }
            finally {
                attemptJoiningRunning = false;
            }
        };
        if (Context.config.p2p.startInWitnessMode) {
            if (logFlags.p2pNonFatal)
                info('Emitting `witnessing` event.');
            emitter.emit('witnessing', publicKey);
            return resolve(true);
        }
        if (logFlags.p2pNonFatal)
            info('Emitting `joining` event.');
        emitter.emit('joining', publicKey);
        attemptJoining();
    });
    return promise;
}
export interface StatusHistoryEntry {
    moduleStatus: P2P.P2PTypes.NodeStatus;
    nodeListStatus: P2P.P2PTypes.NodeStatus;
    timestamp: number;
    isoDateTime: string;
    newestCycleCounter: number;
    quarter: number;
    uptime: string;
    because: string;
}
const statusHistory: StatusHistoryEntry[] = [];
export function getStatusHistoryCopy(): StatusHistoryEntry[] {
    return deepCopy(statusHistory);
}
export function updateNodeState(updatedState: NodeStatus, because = ''): void {
    state = updatedState;
    const pubKey = (Context.crypto && Context.crypto.getPublicKey()) || null;
    const entry: StatusHistoryEntry = {
        moduleStatus: state,
        nodeListStatus: (pubKey &&
            NodeList.byPubKey &&
            NodeList.byPubKey.get(pubKey) &&
            NodeList.byPubKey.get(pubKey).status) ||
            null,
        timestamp: shardusGetTime(),
        isoDateTime: new Date().toISOString(),
        uptime: utils.readableDuration(startTimestamp),
        newestCycleCounter: (CycleChain.getNewest() && CycleChain.getNewest().counter) || null,
        quarter: CycleCreator.currentQuarter,
        because: because,
    };
    if (logFlags.important_as_fatal)
        warn(`Node status changed to ${updatedState}:\n${JSON.stringify(entry, null, 2)}`);
    statusHistory.push(entry);
}
async function joinNetworkV2(activeNodes): Promise<void> {
    info(`joinNetworkV2: enter`);
    const latestCycle = await Sync.getNewestCycle(activeNodes);
    mode = latestCycle.mode || null;
    info(`joinNetworkV2: got latest cycle :${mode}`);
    const publicKey = Context.crypto.getPublicKey();
    try {
        const isReadyToJoin = await Context.shardus.app.isReadyToJoin(latestCycle, publicKey, activeNodes, mode);
        if (!isReadyToJoin) {
            throw new Error('Node not ready to join');
        }
        else {
        }
    }
    catch (ex) {
        warn(`joinNetworkV2: isReadyToJoin crashed :${utils.formatErrorMessage(ex)}`);
        return;
    }
    const request = await Join.createJoinRequest(latestCycle);
    joinRequestCounter = request.nodeInfo.refreshedCounter;
    if (Context.config.p2p.rejectBogonOutboundJoin || Context.config.p2p.forceBogonFilteringOn) {
        if (isInvalidIP(request.nodeInfo.externalIp)) {
            throw new Error(`Fatal: Node cannot join with invalid external IP: ${request.nodeInfo.externalIp}`);
        }
    }
    const { startQ1 } = calcIncomingTimes(latestCycle);
    if (logFlags.important_as_fatal)
        info(`Next cycles Q1 start ${startQ1}; Currently ${shardusGetTime()}`);
    let untilQ1 = startQ1 - shardusGetTime();
    while (untilQ1 < 0) {
        untilQ1 += latestCycle.duration * 1000;
    }
    let offsetTime = 500;
    offsetTime = Math.floor(Math.random() * Context.config.p2p.randomJoinRequestWait);
    if (logFlags.important_as_fatal)
        info(`Waiting ${untilQ1} + ${offsetTime} ms for Q1 before sending join...`);
    await utils.sleep(untilQ1 + offsetTime);
    info(`joinNetworkV2: submitJoinV2`);
    await Join.submitJoinV2(activeNodes, request);
}
async function syncCycleChain(selfId: string): Promise<void> {
    if (isFirst) {
        if (isRestartNetwork) {
            await ServiceQueue.syncTxListFromArchiver();
        }
        return;
    }
    let synced = false;
    while (!synced) {
        try {
            if (logFlags.p2pNonFatal)
                info('Getting activeNodes from archiver to sync to network...');
            const activeNodes = await contactArchiver('syncCycleChain');
            const ourIdx = activeNodes.findIndex(nodeMatch);
            if (ourIdx > -1) {
                activeNodes.splice(ourIdx, 1);
            }
            if (logFlags.p2pNonFatal)
                info('Attempting to sync to network...');
            if (Context.config.p2p.useSyncProtocolV2) {
                await SyncV2.syncV2(activeNodes).match(() => (synced = true), (err) => {
                    throw err;
                });
            }
            else {
                synced = await Sync.sync(activeNodes);
            }
        }
        catch (err) {
            synced = false;
            if (logFlags.important_as_fatal)
                warn('syncCycleChain:', utils.formatErrorMessage(err));
            if (logFlags.p2pNonFatal)
                info('Trying again in 2 sec...');
            await utils.sleep(2000);
        }
    }
    await checkNodeId(nodeMatch, selfId);
}
async function checkNodeId(nodeMatch: (node: any) => boolean, selfId: string): Promise<void> {
    const newestCycle = CycleChain.getNewest();
    let node = newestCycle.joinedConsensors.find(nodeMatch);
    if (!node) {
        if (logFlags.p2pNonFatal)
            info('Getting latest cycles from archiver check node id');
        const latestCycles = await getLatestCyclesFromArchiver(4);
        for (const cycle of latestCycles) {
            node = cycle.joinedConsensors.find(nodeMatch);
            if (node) {
                break;
            }
        }
    }
    if (!node || node.id !== selfId) {
        throw new Error(idErrorMessage);
    }
    if (logFlags.p2pNonFatal)
        info('Node passed id check');
}
export async function contactArchiver(dbgContex: string): Promise<P2P.P2PTypes.Node[]> {
    const maxRetries = 10;
    let retry = maxRetries;
    const failArchivers: string[] = [];
    let archiver: P2P.SyncTypes.ActiveNode;
    let activeNodesSigned: P2P.P2PTypes.SignedObject<SeedNodesList>;
    info(`contactArchiver: enter archivers:${getNumArchivers()}`);
    while (retry > 0) {
        try {
            retry--;
            archiver = getRandomAvailableArchiver();
            info(`contactArchiver: communicate with:${archiver?.ip}`);
            if (!failArchivers.includes(archiver.ip + ':' + archiver.port)) {
                failArchivers.push(archiver.ip + ':' + archiver.port);
            }
            activeNodesSigned = await getActiveNodesFromArchiver(archiver);
            if (activeNodesSigned == null ||
                activeNodesSigned.nodeList == null ||
                activeNodesSigned.nodeList.length === 0) {
                info(`contactArchiver: no nodes in nodelist yet, or seedlist null ${Utils.safeStringify(activeNodesSigned)}`);
                await utils.sleep(1000);
                if (retry === 1) {
                    throw Error(`contactArchiver: nodelist null or empty after ${maxRetries} retries:`);
                }
                continue;
            }
            if (!Context.crypto.verify(activeNodesSigned, archiver.publicKey)) {
                info(`contactArchiver:  seedlist failed verification ${Utils.safeStringify(activeNodesSigned)}`);
                throw Error(`Fatal: _getSeedNodes seed list was not signed by archiver!. Archiver: ${archiver.ip}:${archiver.port}, signature: ${activeNodesSigned.sign}`);
            }
            break;
        }
        catch (e) {
            info(`contactArchiver: failed ${archiver.ip} ${utils.formatErrorMessage(e)} retry:${retry}`);
            if (retry === 1) {
                throw Error(`Could not get seed list from seed node server ${failArchivers} after ${maxRetries} retries:`);
            }
        }
    }
    info(`contactArchiver: passed ${archiver.ip} retry:${retry}`);
    info(`contactArchiver: activeNodesSigned:${Utils.safeStringify(activeNodesSigned?.joinRequest)} restartCycleRecord:${Utils.safeStringify(activeNodesSigned?.restartCycleRecord)}`);
    const joinRequest: P2P.ArchiversTypes.Request | undefined = activeNodesSigned.joinRequest as P2P.ArchiversTypes.Request | undefined;
    if (joinRequest) {
        const accepted = Archivers.addArchiverJoinRequest(joinRequest);
        if (accepted.success === false) {
            throw Error('Fatal: _getSeedNodes archivers join request not accepted by us!');
        }
        if (Context.config.p2p.experimentalSnapshot && Context.config.features.archiverDataSubscriptionsUpdate) {
            const firstNodeDataRequest = {
                dataRequestCycle: activeNodesSigned.dataRequestCycle as number,
            };
            Archivers.addDataRecipient(joinRequest.nodeInfo, firstNodeDataRequest);
            allowConnectionToFirstNode = true;
            return activeNodesSigned.nodeList;
        }
    }
    const restartCycleRecord = activeNodesSigned.restartCycleRecord as P2P.ArchiversTypes.RestartCycleRecord;
    if (restartCycleRecord) {
        restartCycleRecord.desired = Context.config.p2p.minNodes;
        restartCycleRecord.duration = Context.config.p2p.cycleDuration;
        CycleChain.prepend(restartCycleRecord);
        setRestartNetwork(true);
        if (Context.config.p2p.experimentalSnapshot && Context.config.features.archiverDataSubscriptionsUpdate) {
            const firstNodeDataRequest = {
                dataRequestCycle: activeNodesSigned.dataRequestCycle as number,
            };
            Archivers.addDataRecipient(archiver as P2P.ArchiversTypes.JoinedArchiver, firstNodeDataRequest, firstNodeDataRequest.dataRequestCycle);
            for (const archiverInfo of restartCycleRecord.archiversAtShutdown) {
                Archivers.archivers.set(archiverInfo.publicKey, archiverInfo);
            }
            allowConnectionToFirstNode = true;
            return activeNodesSigned.nodeList;
        }
    }
    const dataRequestCycle = activeNodesSigned.dataRequestCycle;
    const dataRequestStateMetaData = activeNodesSigned.dataRequestStateMetaData;
    const dataRequest = [];
    if (dataRequestCycle) {
        dataRequest.push(dataRequestCycle);
    }
    if (dataRequestStateMetaData) {
        dataRequest.push(dataRequestStateMetaData);
    }
    if (joinRequest && dataRequest.length > 0) {
        Archivers.addDataRecipient(joinRequest.nodeInfo, dataRequest);
    }
    return activeNodesSigned.nodeList;
}
function discoverNetwork(seedNodes: P2P.P2PTypes.Node[]): boolean {
    const isFirstSeed = checkIfFirstSeedNode(seedNodes);
    if (!isFirstSeed) {
        if (logFlags.p2pNonFatal)
            info('You are not the first seed node...');
        return false;
    }
    if (logFlags.p2pNonFatal)
        info('You are the first seed node!');
    return true;
}
function checkIfFirstSeedNode(seedNodes: P2P.P2PTypes.Node[]): boolean {
    if (!seedNodes.length)
        throw new Error('Fatal: No seed nodes in seed list!');
    if (seedNodes.length > 1)
        return false;
    const seed = seedNodes[0];
    if (network.ipInfo.externalIp === seed.ip && network.ipInfo.externalPort === seed.port) {
        return true;
    }
    return false;
}
async function getActiveNodesFromArchiver(archiver: ActiveNode): Promise<P2P.P2PTypes.SignedObject<SeedNodesList>> {
    const nodeInfo = getPublicNodeInfo();
    const seedListResult: Result<P2P.P2PTypes.SignedObject<SeedNodesList>, Error> = await Archivers.postToArchiver(archiver, 'nodelist', Context.crypto.sign({
        nodeInfo,
    }), 10000);
    if (seedListResult.isErr()) {
        const e = seedListResult.error;
        const nodeListUrl = `http://${archiver.ip}:${archiver.port}/nodelist`;
        if (logFlags.important_as_fatal)
            warn(`Could not get seed list from seed node server 1 ${nodeListUrl}: ` + e.message);
        throw Error(e.message);
    }
    const seedListSigned = seedListResult.value;
    if (logFlags.p2pNonFatal)
        info(`Got signed seed list: ${Utils.safeStringify(seedListSigned)}`);
    return seedListSigned;
}
export async function getFullNodesFromArchiver(archiver: P2P.SyncTypes.ActiveNode = Context.config.p2p.existingArchivers[0]): Promise<SignedObject<{
    nodeList: P2P.NodeListTypes.Node[];
}>> {
    const fullNodeListResult: Result<SignedObject<{
        nodeList: P2P.NodeListTypes.Node[];
    }>, Error> = await Archivers.getFromArchiver(archiver, 'full-nodelist');
    if (fullNodeListResult.isErr()) {
        const nodeListUrl = `http://${archiver.ip}:${archiver.port}/full-nodelist`;
        throw Error(`Fatal: Could not get seed list from seed node server ${nodeListUrl}: ` +
            fullNodeListResult.error.message);
    }
    const fullNodeList = fullNodeListResult.value;
    if (logFlags.p2pNonFatal)
        info(`Got signed full node list: ${Utils.safeStringify(fullNodeList)}`);
    return fullNodeList;
}
export async function getLatestCyclesFromArchiver(cycleCounter: number, archiver: P2P.SyncTypes.ActiveNode = Context.config.p2p.existingArchivers[0]): Promise<P2P.CycleCreatorTypes.CycleData[]> {
    const endpoint = `cycleinfo/${cycleCounter}`;
    const cyclesListResult: Result<SignedObject<{
        cycleInfo: P2P.CycleCreatorTypes.CycleData[];
    }>, Error> = await Archivers.getFromArchiver(archiver, endpoint, undefined, 10000);
    if (cyclesListResult.isErr()) {
        const nodeListUrl = `http://${archiver.ip}:${archiver.port}/${endpoint}`;
        throw Error(`Fatal: Could not get latest cycles from ${nodeListUrl}: ` + cyclesListResult.error.message);
    }
    return cyclesListResult.value.cycleInfo;
}
export type NodeInfo = {
    id: string;
    publicKey: string;
    curvePublicKey: string;
} & network.IPInfo & {
    status: P2P.P2PTypes.NodeStatus;
};
export function getPublicNodeInfo(reportIntermediateStatus = false): NodeInfo {
    const publicKey = Context.crypto.getPublicKey();
    const curvePublicKey = Context.crypto.convertPublicKeyToCurve(publicKey);
    const status = { status: getNodeStatus(publicKey, reportIntermediateStatus) };
    const nodeInfo = Object.assign({ id, publicKey, curvePublicKey }, network.ipInfo, status);
    return nodeInfo;
}
function getNodeStatus(pubKey: string, reportIntermediateStatus = false): P2P.P2PTypes.NodeStatus {
    const current = NodeList.byPubKey;
    if (current.get(pubKey))
        return current.get(pubKey).status;
    return reportIntermediateStatus ? state : null;
}
export function getThisNodeInfo(): P2P.P2PTypes.P2PNode {
    const { externalIp, externalPort, internalIp, internalPort } = network.ipInfo;
    const publicKey = Context.crypto.getPublicKey();
    const address = publicKey;
    const joinRequestTimestamp = utils.getTime('s');
    const activeTimestamp = 0;
    const activeCycle = 0;
    const syncingTimestamp = 0;
    const readyTimestamp = 0;
    const nodeInfo = {
        publicKey,
        externalIp,
        externalPort,
        internalIp,
        internalPort,
        address,
        joinRequestTimestamp,
        activeTimestamp,
        activeCycle,
        syncingTimestamp,
        readyTimestamp,
    };
    if (logFlags.p2pNonFatal)
        info(`Node info of this node: ${Utils.safeStringify(nodeInfo)}`);
    return nodeInfo;
}
export function setActive(): void {
    isActive = true;
}
export function setp2pIgnoreJoinRequests(value: boolean): void {
    p2pIgnoreJoinRequests = value;
}
function info(...msg: string[]): void {
    const entry = `Self: ${msg.join(' ')}`;
}
function warn(...msg: string[]): void {
    const entry = `Self: ${msg.join(' ')}`;
    p2pLogger.warn(entry);
}
export function setIsFirst(val: boolean): void {
    isFirst = val;
}
export function getIsFirst(): boolean {
    return isFirst;
}
export function setRestartNetwork(val: boolean): void {
    info(`setRestartNetwork: ${val}`);
    isRestartNetwork = val;
}
function acceptedTrigger(): Promise<void> {
    return new Promise((resolve) => {
        Acceptance.getEventEmitter().once('accepted', () => {
            resolve();
        });
    });
}
export function waitForQ1SendRequests(): Promise<void> {
    return new Promise(resolve => {
        const intervalId = setInterval(() => {
            if (currentQuarter === 1 && q1SendRequests === true) {
                clearInterval(intervalId);
                resolve();
            }
        }, Context.config.p2p.secondsToCheckForQ1);
    });
}