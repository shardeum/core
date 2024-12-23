import deepmerge from 'deepmerge';
import { Logger } from 'log4js';
import { logFlags } from '../logger';
import { P2P } from '@shardus/types';
import * as utils from '../utils';
import * as Active from './Active';
import * as Apoptosis from './Apoptosis';
import * as Archivers from './Archivers';
import * as Comms from './Comms';
import { config, crypto, logger, stateManager, storage } from './Context';
import * as CycleAutoScale from './CycleAutoScale';
import * as CycleChain from './CycleChain';
import * as Join from './Join';
import * as Lost from './Lost';
import * as NodeList from './NodeList';
import { profilerInstance } from '../utils/profiler';
import * as Refresh from './Refresh';
import * as Rotation from './Rotation';
import * as SafetyMode from './SafetyMode';
import * as Modes from './Modes';
import * as Self from './Self';
import * as ServiceQueue from './ServiceQueue';
import * as LostArchivers from './LostArchivers';
import { compareQuery, Comparison } from './Utils';
import { errorToStringFull, formatErrorMessage } from '../utils';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { randomBytes } from '@shardus/crypto-utils';
import { digestCycle, syncNewCycles } from './Sync';
import { shardusGetTime } from '../network';
import { InternalBinaryHandler } from '../types/Handler';
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum';
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum';
import { CompareCertRespSerializable, deserializeCompareCertResp, serializeCompareCertResp, } from '../types/CompareCertResp';
import { CompareCertReqSerializable, deserializeCompareCertReq, serializeCompareCertReq, } from '../types/CompareCertReq';
import { verifyPayload } from '../types/ajv/Helpers';
import fs from 'fs';
import path from 'path';
import { getStreamWithTypeCheck, requestErrorHandler } from '../types/Helpers';
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum';
import { BadRequest, InternalError, NotFound, serializeResponseError } from '../types/ResponseError';
import { Utils } from '@shardus/types';
import { nodeListFromStates } from './Join';
import { AJVSchemaEnum } from '../types/enum/AJVSchemaEnum';
const SECOND = 1000;
const BEST_CERTS_WANTED = 3;
const DESIRED_CERT_MATCHES = 3;
const MAX_CYCLES_TO_KEEP = 20;
type submoduleTypes = typeof Archivers | typeof Join | typeof Active | typeof Rotation | typeof Refresh | typeof Apoptosis | typeof Lost | typeof SafetyMode | typeof Modes | typeof CycleAutoScale | typeof LostArchivers | typeof ServiceQueue;
const filePath = path.join(process.cwd(), 'data-logs', 'cycleRecords1.txt');
let modeModuleMigrationApplied = false;
export let hasAlreadyEnteredProcessing = false;
let p2pLogger: Logger;
let cycleLogger: Logger;
export let submodules: submoduleTypes[] = [
    Archivers,
    Join,
    Active,
    Rotation,
    Refresh,
    Apoptosis,
    Lost,
    Modes,
    CycleAutoScale,
    LostArchivers,
    ServiceQueue,
];
export let currentQuarter = -1;
export let currentCycle = 0;
export let currentStart = 0;
export let nextQ1Start = 0;
export let q1SendRequests = false;
export let scaleFactor: number = 1;
export let scaleFactorSyncBoost: number = 1;
export let netConfig: any = {};
let createCycleTag = 0;
let madeCycle = false;
let txs: P2P.CycleCreatorTypes.CycleTxs;
let record: P2P.CycleCreatorTypes.CycleRecord;
let marker: P2P.CycleCreatorTypes.CycleMarker;
let cert: P2P.CycleCreatorTypes.CycleCert;
let bestRecord: P2P.CycleCreatorTypes.CycleRecord;
let bestMarker: P2P.CycleCreatorTypes.CycleMarker;
let bestCycleCert: Map<P2P.CycleCreatorTypes.CycleMarker, P2P.CycleCreatorTypes.CycleCert[]>;
let bestCertScore: Map<P2P.CycleCreatorTypes.CycleMarker, number>;
const timers = {};
let lastSavedData: P2P.CycleCreatorTypes.CycleRecord;
let fetchLatestRecordFails = 0;
const maxFetchLatestRecordFails = 5;
interface CompareMarkerReq {
    marker: P2P.CycleCreatorTypes.CycleMarker;
    txs: P2P.CycleCreatorTypes.CycleTxs;
}
interface CompareMarkerRes {
    marker: P2P.CycleCreatorTypes.CycleMarker;
    txs?: P2P.CycleCreatorTypes.CycleTxs;
}
interface CompareCertReq {
    certs: P2P.CycleCreatorTypes.CycleCert[];
    record: P2P.CycleCreatorTypes.CycleRecord;
}
interface CompareCertRes {
    certs: P2P.CycleCreatorTypes.CycleCert[];
    record: P2P.CycleCreatorTypes.CycleRecord;
}
const gossipCertRoute: P2P.P2PTypes.GossipHandler<CompareCertReq, P2P.NodeListTypes.Node['id']> = (payload, sender, tracker) => {
    gossipHandlerCycleCert(payload, sender, tracker);
};
const compareCertBinaryHandler: P2P.P2PTypes.Route<InternalBinaryHandler<Buffer>> = {
    name: InternalRouteEnum.binary_compare_cert,
    handler: async (payload, respond, header, sign) => {
        const route = InternalRouteEnum.binary_compare_cert;
        const errorHandler = (errorType: RequestErrorEnum, opts?: {
            customErrorLog?: string;
            customCounterSuffix?: string;
        }): void => requestErrorHandler(route, errorType, header, opts);
        try {
            let resp: CompareCertRespSerializable = { certs: [], record: null };
            const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cCompareCertReq);
            if (!requestStream) {
                errorHandler(RequestErrorEnum.InvalidRequest);
                return respond(BadRequest('Invalid CompareCert request stream'), serializeResponseError);
            }
            const req: CompareCertReq = deserializeCompareCertReq(requestStream);
            const errors = verifyPayload(AJVSchemaEnum.CompareCertReq, req);
            if (errors && errors.length > 0) {
                p2pLogger.error(`compareCert request validation errors: ${errors}`);
                return respond(BadRequest('Request validation errors'), serializeResponseError);
            }
            const compareCertReq: CompareCertReq = {
                certs: req.certs,
                record: req.record,
            };
            resp = compareCycleCertEndpoint(compareCertReq, header.sender_id, 'compareCycleCertBinaryEndpoint');
            respond(resp, serializeCompareCertResp);
        }
        catch (errors) {
            if (logFlags.error)
                p2pLogger.error(`${route} exception executing request: ${errorToStringFull(errors)}`);
            return respond(InternalError('Exception executing request'), serializeResponseError);
        }
        finally {
        }
    },
};
const routes = {
    internal: {},
    gossip: {
        'gossip-cert': gossipCertRoute,
    },
    internal2: {
        [compareCertBinaryHandler.name]: compareCertBinaryHandler,
    },
};
export function init() {
    p2pLogger = logger.getLogger('p2p');
    cycleLogger = logger.getLogger('cycle');
    for (const submodule of submodules) {
        if (submodule.init)
            submodule.init();
    }
    reset();
    for (const [name, handler] of Object.entries(routes.internal)) {
        Comms.registerInternal(name, handler);
    }
    for (const [name, handler] of Object.entries(routes.gossip)) {
        Comms.registerGossipHandler(name, handler);
    }
    for (const [name, handler] of Object.entries(routes.internal2)) {
        Comms.registerInternalBinary(name, handler.handler);
    }
}
function moduleMigration() {
    submodules = submodules.filter((submodule) => submodule !== SafetyMode);
    if (!submodules.includes(Modes)) {
        submodules.push(Modes);
        submodules[submodules.length - 1].init();
    }
}
function updateScaleFactor() {
    let activeNodeCount = NodeList.activeByIdOrder.length;
    let consensusRange = Math.min(config.sharding.nodesPerConsensusGroup, activeNodeCount);
    let networkParSize = 100;
    let consenusParSize = 5;
    if (config.p2p.syncBoostEnabled) {
        if (activeNodeCount < 10) {
            scaleFactorSyncBoost = 1;
        }
        else if (activeNodeCount < 200) {
            scaleFactorSyncBoost = 2;
        }
        else if (activeNodeCount < 400) {
            scaleFactorSyncBoost = 1.5;
        }
        else {
            scaleFactorSyncBoost = 1.5;
        }
    }
    else {
        scaleFactorSyncBoost = 1;
    }
    scaleFactor = Math.max((consensusRange / consenusParSize) * (activeNodeCount / networkParSize), 1);
}
function reset() {
    updateScaleFactor();
    for (const module of submodules)
        module.reset();
    txs = collectCycleTxs();
    ({ record, marker, cert } = makeCycleData(txs, CycleChain.newest || undefined));
    bestRecord = undefined;
    bestMarker = undefined;
    bestCycleCert = new Map();
    bestCertScore = new Map();
}
export async function startCycles() {
    if (Self.isFirst) {
        const recordZero = makeRecordZero();
        bestRecord = recordZero;
        madeCycle = true;
        const { startQ1 } = calcIncomingTimes(recordZero);
        await schedule(cycleCreator, startQ1);
        return;
    }
    bestRecord = CycleChain.newest;
    madeCycle = true;
    await cycleCreator();
}
async function cycleCreator() {
    currentQuarter = 0;
    createCycleTag++;
    let callTag = `cct${createCycleTag}`;
    if (logFlags.verbose)
        info(`cc: start C${currentCycle} Q${currentQuarter} madeCycle: ${madeCycle} bestMarker: ${bestMarker} ${callTag}`);
    try {
        let prevRecord = bestRecord;
        if (!prevRecord) {
            if (logFlags.p2pNonFatal)
                warn(`cc: !prevRecord. Fetech now. ${callTag}`);
            prevRecord = await fetchLatestRecord();
        }
        while (!prevRecord) {
            if (logFlags.p2pNonFatal)
                warn(`cc: cycleCreator: Could not get fetch prevRecord. Trying again in 1 sec...  ${callTag}`);
            await utils.sleep(1 * SECOND);
            prevRecord = await fetchLatestRecord();
        }
        if (logFlags.verbose)
            info(`cc: prevRecord.counter: ${prevRecord.counter} ${callTag}`);
        if (logFlags.p2pNonFatal)
            info(`cc: prevRecord.counter: ${prevRecord.counter} ${callTag}`);
        const networkModeBefore = Modes.networkMode;
        if (!CycleChain.newest || CycleChain.newest.counter < prevRecord.counter) {
            if (logFlags.p2pNonFatal)
                warn(`cc: digest cycle ${prevRecord.counter} ${callTag}`);
            digestCycle(prevRecord, 'cycleCreator');
        }
        let data: P2P.CycleCreatorTypes.CycleData = undefined;
        try {
            const marker = makeCycleMarker(prevRecord);
            const certificate = makeCycleCert(marker);
            const data: P2P.CycleCreatorTypes.CycleData = { ...prevRecord, marker, certificate };
            if (lastSavedData) {
                await storage.updateCycle({ networkId: lastSavedData.networkId }, data);
            }
            else {
                data.nodeListHash = data.nodeListHash || '';
                data.archiverListHash = data.archiverListHash || '';
                data.standbyNodeListHash = data.standbyNodeListHash || '';
                await storage.addCycles(data);
            }
            lastSavedData = data;
            if (logFlags.verbose)
                info(`cc: cycle data created and stored. data.counter:${data.counter} ${callTag}`);
            Self.emitter.emit('new_cycle_data', data);
        }
        catch (er) {
            warn(`cc: Could not save prevRecord to DB. C${currentCycle} ${formatErrorMessage(er)}`);
        }
        if (logFlags.verbose)
            info(`cc: recorded to cycle.log ${callTag}`);
        pruneCycleChain();
        if (logFlags.verbose)
            info(`cc: pruned ${callTag}`);
        Archivers.sendData();
        if (logFlags.verbose)
            info(`cc: acrhiver data sent ${callTag}`);
        let expectedCycle = currentCycle + 1;
        ({ cycle: currentCycle, quarter: currentQuarter } = currentCycleQuarterByTime(prevRecord));
        if (expectedCycle !== currentCycle) {
            if (logFlags.p2pNonFatal)
                warn(`cc: expectedCycle: ${expectedCycle} currentCycle: ${currentCycle} ${callTag}`);
        }
        if (logFlags.verbose)
            info(`cc: current cycle and quarter updated C${currentCycle} Q${currentQuarter} ${callTag}`);
        Join.swapUnjoinRequestQueues();
        const { quarterDuration, startQ1, startQ2, startQ3, startQ4, end } = calcIncomingTimes(prevRecord);
        nextQ1Start = end;
        if (logFlags.verbose)
            info(`cc: inc times ${Utils.safeStringify({ quarterDuration, startQ1, startQ2, startQ3, startQ4, end })}  ${callTag}`);
        reset();
        if (logFlags.verbose)
            info(`cc: cycle data was reset record.counter: ${record.counter}  ${callTag}`);
        madeCycle = false;
        if (config.p2p.useNetworkModes === true && modeModuleMigrationApplied === false) {
            modeModuleMigrationApplied = true;
            moduleMigration();
        }
        if (prevRecord.active >= config.p2p.minNodes && hasAlreadyEnteredProcessing === false) {
            hasAlreadyEnteredProcessing = true;
        }
        const networkModeAfter = Modes.networkMode;
        if (networkModeBefore === 'recovery' && networkModeAfter === 'restore') {
            NodeList.changeNodeListInRestore(prevRecord.start);
        }
        if (prevRecord.mode === 'shutdown') {
            await utils.sleep(prevRecord.duration * SECOND);
            Self.emitter.emit('invoke-exit', 'Shutdown-Mode');
        }
        if (logFlags.verbose)
            info(`cc: scheduling currentCycle:${currentCycle} ${callTag} ${startQ1}`);
        schedule(runQ1, startQ1, { runEvenIfLateBy: quarterDuration - 1 * SECOND });
        schedule(runQ2, startQ2);
        schedule(runQ3, startQ3);
        schedule(runQ4, startQ4);
        schedule(cycleCreator, end, { runEvenIfLateBy: Infinity });
    }
    finally {
        if (logFlags.verbose)
            info(`cc: end C${currentCycle} Q${currentQuarter} madeCycle: ${madeCycle} bestMarker: ${bestMarker} ${callTag}`);
    }
}
async function runQ1() {
    q1SendRequests = false;
    currentQuarter = 1;
    Self.emitter.emit('cycle_q1_start');
    if (logFlags.p2pNonFatal)
        info(`C${currentCycle} Q${currentQuarter}`);
    const SECOND = 1000;
    const cycleDuration = record.duration * SECOND;
    const quarterDuration = cycleDuration / 4;
    await utils.sleep(quarterDuration * config.p2p.q1DelayPercent);
    q1SendRequests = true;
    if (logFlags.p2pNonFatal)
        info('Triggering submodules to send requests...');
    for (const submodule of submodules)
        submodule.sendRequests();
}
function runQ2() {
    currentQuarter = 2;
    Self.emitter.emit('cycle_q2_start');
    if (logFlags.p2pNonFatal)
        info(`C${currentCycle} Q${currentQuarter}`);
}
async function runQ3() {
    currentQuarter = 3;
    Self.emitter.emit('cycle_q3_start');
    if (logFlags.p2pNonFatal)
        info(`C${currentCycle} Q${currentQuarter}`);
    txs = collectCycleTxs();
    ({ record, marker, cert } = makeCycleData(txs, CycleChain.newest));
    if (config.debug.enableCycleRecordDebugTool || config.debug.localEnableCycleRecordDebugTool) {
        if (currentQuarter === 3 && Self.isActive) {
            const cycleData = Utils.safeStringify({
                port: Self.port,
                cycleNumber: record.counter,
                cycleRecord: record,
            }) + '\n';
            fs.appendFile(filePath, cycleData, (err) => {
                if (err) {
                    console.error('Error appending to file:', err);
                }
            });
        }
    }
    const myC = currentCycle;
    const myQ = currentQuarter;
    madeCycle = true;
    gossipMyCycleCert();
    ServiceQueue.processNetworkTransactions(record);
}
async function runQ4() {
    currentQuarter = 4;
    if (logFlags.p2pNonFatal)
        info(`C${currentCycle} Q${currentQuarter}`);
    if (logFlags.p2pNonFatal)
        info(`Q4: start: C${currentCycle} Q${currentQuarter}`);
    if (madeCycle === false) {
        if (logFlags.p2pNonFatal)
            warn('In Q4 nothing to do since we madeCycle is false.');
        return;
    }
    const myC = currentCycle;
    const myQ = currentQuarter;
    const enterTime = shardusGetTime();
    const cycleDuration = config.p2p.cycleDuration * SECOND;
    try {
        let matched;
        do {
            matched = await compareCycleCert(myC, myQ, DESIRED_CERT_MATCHES);
            if (!matched) {
                if (cycleQuarterChanged(myC, myQ)) {
                    if (logFlags.p2pNonFatal)
                        warn(`In Q4 ran out of time waiting for compareCycleCert with DESIRED_CERT_MATCHES of ${DESIRED_CERT_MATCHES}`);
                    return;
                }
                await utils.sleep(100);
                if (enterTime + cycleDuration < shardusGetTime()) {
                    if (logFlags.p2pNonFatal)
                        warn(`In Q4 waited ${config.p2p.cycleDuration} seconds for compareCycleCert with DESIRED_CERT_MATCHES of ${DESIRED_CERT_MATCHES}`);
                    await utils.sleep(1000);
                }
            }
        } while (!matched);
        if (logFlags.p2pNonFatal)
            info(`
    Certified cycle record: ${Utils.safeStringify(record)}
    Certified cycle marker: ${Utils.safeStringify(marker)}
    Certified cycle cert: ${Utils.safeStringify(cert)}
  `);
    }
    finally {
        if (logFlags.p2pNonFatal)
            info(`Q4: END: myC:${myC}  C${currentCycle} Q${currentQuarter} Certified cycle record: ${Utils.safeStringify(record.counter)}`);
    }
}
export function makeRecordZero(): P2P.CycleCreatorTypes.CycleRecord {
    const txs = collectCycleTxs();
    return makeCycleRecord(txs, CycleChain.newest);
}
function makeCycleData(txs: P2P.CycleCreatorTypes.CycleTxs, prevRecord?: P2P.CycleCreatorTypes.CycleRecord) {
    const record = makeCycleRecord(txs, prevRecord);
    const marker = makeCycleMarker(record);
    const cert = makeCycleCert(marker);
    return { record, marker, cert };
}
function collectCycleTxs(): P2P.CycleCreatorTypes.CycleTxs {
    const txs = submodules.map((submodule) => submodule.getTxs());
    return Object.assign({}, ...txs);
}
function makeCycleRecord(cycleTxs: P2P.CycleCreatorTypes.CycleTxs, prevRecord?: P2P.CycleCreatorTypes.CycleRecord): P2P.CycleCreatorTypes.CycleRecord {
    const baseRecord: P2P.CycleCreatorTypes.BaseRecord = {
        networkId: prevRecord ? prevRecord.networkId : randomBytes(32),
        counter: prevRecord ? prevRecord.counter + 1 : 0,
        previous: prevRecord ? makeCycleMarker(prevRecord) : '0'.repeat(64),
        start: prevRecord && prevRecord.mode !== 'shutdown'
            ? prevRecord.start + prevRecord.duration
            : utils.getTime('s'),
        duration: prevRecord ? prevRecord.duration : config.p2p.cycleDuration,
        networkConfigHash: makeNetworkConfigHash(),
    };
    currentStart = baseRecord.start;
    const cycleRecord = Object.assign(baseRecord, {
        joined: [],
        returned: [],
        lost: [],
        lostSyncing: [],
        refuted: [],
        apoptosized: [],
        nodeListHash: '',
        archiverListHash: '',
        standbyNodeListHash: '',
        random: config.debug.randomCycleData ? Math.floor(Math.random() * 1000) + 1 : 0,
        txadd: [],
        txremove: [],
        txlisthash: '',
    }) as P2P.CycleCreatorTypes.CycleRecord;
    submodules.map((submodule) => submodule.updateRecord(cycleTxs, cycleRecord, prevRecord));
    if (config.p2p.initShutdown || cycleRecord.mode === 'shutdown') {
        cycleRecord.removed = ['all'];
        cycleRecord.archiversAtShutdown = Array.from(Archivers.archivers.values());
    }
    return cycleRecord;
}
export function makeCycleMarker(record: P2P.CycleCreatorTypes.CycleRecord) {
    return crypto.hash(record);
}
function makeCycleCert(marker: P2P.CycleCreatorTypes.CycleMarker): P2P.CycleCreatorTypes.CycleCert {
    return crypto.sign({ marker });
}
function makeNetworkConfigHash() {
    netConfig = {
        crypto: config.crypto,
        heartbeatInterval: config.heartbeatInterval,
        loadDetection: config.loadDetection,
        network: config.network,
        rateLimiting: config.rateLimiting,
        sharding: config.sharding,
        transactionExpireTime: config.transactionExpireTime,
        p2p: { ...config.p2p },
        stateManager: config.stateManager,
        debug: config.debug,
    };
    delete netConfig.p2p.existingArchivers;
    return crypto.hash(netConfig);
}
function unseenTxs(ours: P2P.CycleCreatorTypes.CycleTxs, theirs: P2P.CycleCreatorTypes.CycleTxs) {
    const unseen: Partial<P2P.CycleCreatorTypes.CycleTxs> = {};
    for (const field in theirs) {
        if (theirs[field] && ours[field]) {
            if (crypto.hash(theirs[field]) !== crypto.hash(ours[field])) {
                const ourTxHashes = new Set(ours[field].map((tx) => crypto.hash(tx)));
                for (const tx of theirs[field]) {
                    if (!ourTxHashes.has(crypto.hash(tx))) {
                        if (!unseen[field])
                            unseen[field] = [];
                        unseen[field].push(tx);
                    }
                }
            }
        }
        else {
            unseen[field] = theirs[field];
        }
    }
    return unseen;
}
function dropInvalidTxs(txs: Partial<P2P.CycleCreatorTypes.CycleTxs>) {
    return txs;
}
async function fetchLatestRecord(): Promise<P2P.CycleCreatorTypes.CycleRecord> {
    try {
        const oldCounter = CycleChain.newest.counter;
        await syncNewCycles(NodeList.activeOthersByIdOrder);
        if (CycleChain.newest.counter <= oldCounter) {
            if (logFlags.p2pNonFatal)
                warn(`CycleCreator: fetchLatestRecord: synced record not newer CycleChain.newest.counter: ${CycleChain.newest.counter} oldCounter: ${oldCounter}`);
            fetchLatestRecordFails++;
            if (fetchLatestRecordFails > maxFetchLatestRecordFails) {
                if (logFlags.p2pNonFatal)
                    error('CycleCreator: fetchLatestRecord_A: fetchLatestRecordFails > maxFetchLatestRecordFails. apoptosizeSelf ');
                Apoptosis.apoptosizeSelf('Apoptosized within fetchLatestRecord() => src/p2p/CycleCreator.ts');
            }
            return null;
        }
    }
    catch (err) {
        if (logFlags.p2pNonFatal)
            warn('CycleCreator: fetchLatestRecord: syncNewCycles failed:', errorToStringFull(err));
        fetchLatestRecordFails++;
        if (fetchLatestRecordFails > maxFetchLatestRecordFails) {
            if (logFlags.p2pNonFatal)
                error('CycleCreator: fetchLatestRecord_B: fetchLatestRecordFails > maxFetchLatestRecordFails. apoptosizeSelf ');
            Apoptosis.apoptosizeSelf('Apoptosized within fetchLatestRecord() => src/p2p/CycleCreator.ts');
        }
        return null;
    }
    fetchLatestRecordFails = 0;
    return CycleChain.newest;
}
function currentCycleQuarterByTime(record: P2P.CycleCreatorTypes.CycleRecord) {
    const SECOND = 1000;
    const cycleDuration = record.duration * SECOND;
    const quarterDuration = cycleDuration / 4;
    const start = record.start * SECOND + cycleDuration;
    const now = shardusGetTime();
    const elapsed = now - start;
    const elapsedQuarters = elapsed / quarterDuration;
    const cycle = record.counter + 1 + Math.trunc(elapsedQuarters / 4);
    const quarter = Math.abs(Math.ceil(elapsedQuarters % 4));
    return { cycle, quarter };
}
export function calcIncomingTimes(record: P2P.CycleCreatorTypes.CycleRecord) {
    const cycleDuration = record.duration * SECOND;
    const quarterDuration = cycleDuration / 4;
    const start = record.start * SECOND + cycleDuration;
    const startQ1 = start;
    const startQ2 = start + 1 * quarterDuration;
    const startQ3 = start + 2 * quarterDuration;
    const startQ4 = start + 3 * quarterDuration;
    const end = start + cycleDuration;
    return { quarterDuration, startQ1, startQ2, startQ3, startQ4, end };
}
export function schedule<T, U extends unknown[]>(callback: (...args: U) => T | Promise<T>, time: number, { runEvenIfLateBy = 0 } = {}, ...args: U) {
    return new Promise<void>((resolve) => {
        const now = shardusGetTime();
        if (now >= time) {
            if (now - time <= runEvenIfLateBy) {
                setImmediate(async () => {
                    await callback(...args);
                    resolve();
                });
            }
            return;
        }
        const toWait = time - now;
        if (timers[callback.name])
            clearTimeout(timers[callback.name]);
        timers[callback.name] = setTimeout(async () => {
            await callback(...args);
            resolve();
        }, toWait);
    });
}
export function shutdown() {
    warn('Cycle creator shutdown');
    for (const timer of Object.keys(timers)) {
        warn(`clearing timer ${timer}`);
        clearTimeout(timers[timer]);
    }
    warn(`current cycle and quarter is: C${currentCycle} Q${currentQuarter}`);
    currentCycle += 1;
    currentQuarter = 0;
    warn(`changed cycle and quarter to: C${currentCycle} Q${currentQuarter}`);
}
function cycleQuarterChanged(cycle: number, quarter: number) {
    return cycle !== currentCycle || quarter !== currentQuarter;
}
function scoreCert(cert: P2P.CycleCreatorTypes.CycleCert): number {
    try {
        const id = NodeList.byPubKey.get(cert.sign.owner).id;
        const obj = { id };
        const hid = crypto.hash(obj);
        const out = utils.XOR(cert.marker, hid);
        return out;
    }
    catch (err) {
        error('scoreCert ERR:', err);
        return 0;
    }
}
function validateCertSign(certs: P2P.CycleCreatorTypes.CycleCert[], sender: P2P.NodeListTypes.Node['id']) {
    for (const cert of certs) {
        const cleanCert: P2P.CycleCreatorTypes.CycleCert = {
            marker: cert.marker,
            sign: cert.sign,
        };
        if (NodeList.byPubKey.has(cleanCert.sign.owner) === false) {
            if (logFlags.p2pNonFatal)
                warn('validateCertSign: bad owner');
            return false;
        }
        if (!crypto.verify(cleanCert)) {
            if (logFlags.p2pNonFatal)
                warn('validateCertSign: bad sig');
            return false;
        }
    }
    return true;
}
function validateCerts(certs: P2P.CycleCreatorTypes.CycleCert[], record, sender, callerTag) {
    if (!certs || !Array.isArray(certs) || certs.length <= 0) {
        warn(`validateCerts: bad certificate format;  ${callerTag}`);
        warn(`validateCerts:   sent by: port:${NodeList.nodes.get(sender).externalPort} id:${Utils.safeStringify(sender)}`);
        return false;
    }
    if (!record || record === null || typeof record !== 'object')
        return false;
    if (record.counter !== CycleChain.newest.counter + 1) {
        warn(`validateCerts: bad cycle record counter; ${callerTag} expected ${CycleChain.newest.counter + 1} but got ${record.counter} `);
        warn(`validateCerts:   sent by: port:${NodeList.nodes.get(sender).externalPort} id:${Utils.safeStringify(sender)}`);
        return false;
    }
    const inpMarker = crypto.hash(record);
    for (let i = 1; i < certs.length; i++) {
        if (inpMarker !== certs[i].marker) {
            warn(`validateCerts: certificates marker does not match hash of record;  ${callerTag}`);
            warn(`validateCerts:   sent by: port:${NodeList.nodes.get(sender).externalPort} id:${Utils.safeStringify(sender)}`);
            return false;
        }
    }
    const seen = {};
    for (let i = 0; i < certs.length; i++) {
        if (seen[certs[i].sign.owner]) {
            warn(`validateCerts: multiple certificate from same owner; ${callerTag} certs: ${Utils.safeStringify(certs)}`);
            warn(`validateCerts:   sent by: port:${NodeList.nodes.get(sender).externalPort} id:${Utils.safeStringify(sender)}`);
            return false;
        }
        seen[certs[i].sign.owner] = true;
    }
    if (!validateCertSign(certs, sender)) {
        warn(`validateCerts: certificate has bad sign;  ${callerTag} certs:${Utils.safeStringify(certs)}`);
        warn(`validateCerts:   sent by: port:${NodeList.nodes.get(sender).externalPort} id:${Utils.safeStringify(sender)}`);
        return false;
    }
    return true;
}
function validateCertsRecordTypes(inp, caller) {
    let err = utils.validateTypes(inp, { certs: 'a', record: 'o' });
    if (err) {
        warn(caller + ' bad input: ' + err + ' ' + Utils.safeStringify(inp));
        return false;
    }
    for (const cert of inp.certs) {
        err = utils.validateTypes(cert, { marker: 's', score: 'n', sign: 'o' });
        if (err) {
            warn(caller + ' bad input.certs: ' + err);
            return false;
        }
        err = utils.validateTypes(cert.sign, { owner: 's', sig: 's' });
        if (err) {
            warn(caller + ' bad input.sign: ' + err);
            return false;
        }
    }
    err = utils.validateTypes(inp.record, {
        activated: 'a',
        activatedPublicKeys: 'a',
        active: 'n',
        apoptosized: 'a',
        counter: 'n',
        desired: 'n',
        duration: 'n',
        expired: 'n',
        joined: 'a',
        joinedArchivers: 'a',
        joinedConsensors: 'a',
        lost: 'a',
        previous: 's',
        refreshedArchivers: 'a',
        refreshedConsensors: 'a',
        refuted: 'a',
        removed: 'a',
        start: 'n',
        syncing: 'n',
    });
    if (err) {
        warn(caller + ' bad input.record: ' + err);
        return false;
    }
    for (const submodule of submodules) {
        err = submodule.validateRecordTypes(inp.record);
        if (err) {
            warn(caller + ' bad input.record.* ' + err);
            return false;
        }
    }
    return true;
}
function improveBestCert(inpCerts: P2P.CycleCreatorTypes.CycleCert[], inpRecord) {
    let improved = false;
    if (inpCerts.length <= 0) {
        return false;
    }
    let bscore = 0;
    if (bestMarker) {
        if (bestCertScore.get(bestMarker)) {
            bscore = bestCertScore.get(bestMarker);
        }
    }
    const bcerts = bestCycleCert.get(inpCerts[0].marker);
    const have = {};
    if (bcerts) {
        for (const cert of bcerts) {
            have[cert.sign.owner] = true;
        }
    }
    for (const cert of inpCerts) {
        if (have[cert.sign.owner])
            continue;
        cert.score = scoreCert(cert);
        if (!bestCycleCert.get(cert.marker)) {
            bestCycleCert.set(cert.marker, [cert]);
        }
        else {
            let added = false;
            const bcerts = bestCycleCert.get(cert.marker);
            let i = 0;
            for (; i < bcerts.length; i++) {
                if (bcerts[i].score < cert.score) {
                    bcerts.splice(i, 0, cert);
                    bcerts.splice(BEST_CERTS_WANTED);
                    added = true;
                    break;
                }
            }
            if (!added && i < BEST_CERTS_WANTED) {
                bcerts.splice(i, 0, cert);
            }
        }
    }
    for (const cert of inpCerts) {
        let score = 0;
        const bcerts = bestCycleCert.get(cert.marker);
        for (const bcert of bcerts) {
            score += bcert.score;
        }
        bestCertScore.set(cert.marker, score);
        if (score > bscore) {
            bestMarker = cert.marker;
            bestRecord = inpRecord;
            improved = true;
        }
    }
    return improved;
}
function compareCycleCertEndpoint(inp: CompareCertReq, sender, endpoint_tag: string) {
    if (bestMarker === undefined) {
        warn(`${endpoint_tag} - bestMarker is undefined`);
        return { certs: [], record: record };
    }
    if (!validateCertsRecordTypes(inp, endpoint_tag)) {
        return { certs: bestCycleCert.get(bestMarker), record: bestRecord };
    }
    const { certs: inpCerts, record: inpRecord } = inp;
    if (!validateCerts(inpCerts, inpRecord, sender, endpoint_tag)) {
        return { certs: bestCycleCert.get(bestMarker), record: bestRecord };
    }
    const inpMarker = inpCerts[0].marker;
    if (inpMarker !== makeCycleMarker(inpRecord)) {
        return { certs: bestCycleCert.get(bestMarker), record: bestRecord };
    }
    improveBestCert(inpCerts, inpRecord);
    return { certs: bestCycleCert.get(bestMarker), record: bestRecord };
}
async function compareCycleCert(myC: number, myQ: number, matches: number) {
    const queryFn = async (node: P2P.NodeListTypes.Node): Promise<[
        CompareCertRes,
        P2P.NodeListTypes.Node
    ]> => {
        const req: CompareCertReq = {
            certs: bestCycleCert.get(bestMarker),
            record: bestRecord,
        };
        if (!req.certs || !req.record) {
            return [null, node];
        }
        let resp: CompareCertRes;
        let reqSerialized = req as CompareCertReqSerializable;
        resp = await Comms.askBinary<CompareCertReqSerializable, CompareCertRespSerializable>(node, InternalRouteEnum.binary_compare_cert, reqSerialized, serializeCompareCertReq, deserializeCompareCertResp, {});
        if (!validateCertsRecordTypes(resp, 'compareCycleCert'))
            return [null, node];
        if (!(resp && resp.certs && resp.certs[0].marker && resp.record)) {
            throw new Error('compareCycleCert: Invalid query response');
        }
        return [resp, node];
    };
    const compareFn = (respArr) => {
        if (cycleQuarterChanged(myC, myQ))
            return Comparison.ABORT;
        const [resp, node] = respArr;
        if (resp === null)
            return Comparison.WORSE;
        if (resp.certs[0].marker === bestMarker) {
            return Comparison.EQUAL;
        }
        else if (!validateCerts(resp.certs, resp.record, node.id, 'compareCycleCert')) {
            return Comparison.WORSE;
        }
        else if (improveBestCert(resp.certs, resp.record)) {
            return Comparison.BETTER;
        }
        else {
            return Comparison.WORSE;
        }
    };
    if (matches > NodeList.activeOthersByIdOrder.length) {
        matches = NodeList.activeOthersByIdOrder.length;
    }
    const nodesToAsk = [...NodeList.activeOthersByIdOrder];
    utils.shuffleArray(nodesToAsk);
    const errors = await compareQuery<P2P.NodeListTypes.Node, [
        CompareCertRes,
        P2P.NodeListTypes.Node
    ]>(nodesToAsk, queryFn, compareFn, matches);
    if (errors.length > 0) {
        warn(`compareCycleCertEndpoint: errors: ${Utils.safeStringify(errors)}`);
    }
    return NodeList.activeOthersByIdOrder.length - errors.length >= matches;
}
async function gossipMyCycleCert() {
    if (!Self.isActive && !Self.isFirst)
        return;
    if (logFlags.p2pNonFatal)
        info('About to improveBestCert with our cert...');
    if (improveBestCert([cert], record)) {
        if (logFlags.p2pNonFatal)
            info('bestRecord was set to our record');
        await gossipCycleCert(Self.id);
    }
}
function gossipHandlerCycleCert(inp: CompareCertReq, sender: P2P.NodeListTypes.Node['id'], tracker: string) {
    if (!validateCertsRecordTypes(inp, 'gossipHandlerCycleCert'))
        return;
    const { certs: inpCerts, record: inpRecord } = inp;
    if (!validateCerts(inpCerts, inpRecord, sender, 'gossipHandlerCycleCert')) {
        return;
    }
    if (improveBestCert(inpCerts, inpRecord)) {
        gossipCycleCert(sender, tracker);
    }
}
async function gossipCycleCert(sender: P2P.NodeListTypes.Node['id'], tracker?: string) {
    const certGossip: CompareCertReq = {
        certs: bestCycleCert.get(bestMarker),
        record: bestRecord,
    };
    const signedCertGossip = crypto.sign(certGossip);
    Comms.sendGossip('gossip-cert', signedCertGossip, tracker, sender, Join.nodeListFromStates([
        P2P.P2PTypes.NodeStatus.ACTIVE,
        P2P.P2PTypes.NodeStatus.READY,
        P2P.P2PTypes.NodeStatus.SYNCING,
    ]), true);
}
function pruneCycleChain() {
    if (config.p2p.useSyncProtocolV2) {
        CycleChain.prune(MAX_CYCLES_TO_KEEP);
    }
    else {
        const keep = Refresh.cyclesToKeep();
        CycleChain.prune(keep);
    }
}
function info(...msg) {
    const entry = `CycleCreator: ${msg.join(' ')}`;
}
function warn(...msg) {
    const entry = `CycleCreator: ${msg.join(' ')}`;
    p2pLogger.warn(entry);
}
function error(...msg) {
    const entry = `CycleCreator: ${msg.join(' ')}`;
    p2pLogger.error(entry);
}
function fatal(...msg) {
    const entry = `CycleCreator: ${msg.join(' ')}`;
    p2pLogger.fatal(entry);
}