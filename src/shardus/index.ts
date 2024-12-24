import { NodeStatus, Route } from '@shardus/types/build/src/p2p/P2PTypes';
import { RemoveCertificate } from '@shardus/types/build/src/p2p/LostTypes';
import { EventEmitter } from 'events';
import { Handler } from 'express';
import Log4js from 'log4js';
import path from 'path';
import { inspect } from 'util';
import SHARDUS_CONFIG from '../config';
import Crypto from '../crypto';
import Debug, { getDevPublicKeys, getDevPublicKey, getDevPublicKeyMaxLevel, ensureKeySecurity, getMultisigPublicKeys, getMultisigPublicKey, ensureMultisigKeySecurity, } from '../debug';
import ExitHandler from '../exit-handler';
import LoadDetection from '../load-detection';
import Logger, { logFlags, LogFlags } from '../logger';
import * as Network from '../network';
import { isDebugModeMiddleware, isDebugModeMiddlewareHigh, isDebugModeMiddlewareLow, isDebugModeMiddlewareMedium, isDebugModeMiddlewareMultiSig, } from '../network/debugMiddleware';
import { apoptosizeSelf, isApopMarkedNode } from '../p2p/Apoptosis';
import * as Archivers from '../p2p/Archivers';
import * as Context from '../p2p/Context';
import { config } from '../p2p/Context';
import * as AutoScaling from '../p2p/CycleAutoScale';
import * as CycleChain from '../p2p/CycleChain';
import * as CycleCreator from '../p2p/CycleCreator';
import { netConfig } from '../p2p/CycleCreator';
import * as GlobalAccounts from '../p2p/GlobalAccounts';
import * as ServiceQueue from '../p2p/ServiceQueue';
import { scheduleLostReport, removeNodeWithCertificiate } from '../p2p/Lost';
import { activeIdToPartition, activeByIdOrder, getAgeIndexForNodeId, nodes } from '../p2p/NodeList';
import * as Self from '../p2p/Self';
import * as Wrapper from '../p2p/Wrapper';
import RateLimiting from '../rate-limiting';
import Reporter from '../reporter';
import * as ShardusTypes from '../shardus/shardus-types';
import { AppObjEnum, DevSecurityLevel, OpaqueTransaction, WrappedData } from "../shardus/shardus-types";
import * as Snapshot from '../snapshot';
import StateManager from '../state-manager';
import { CachedAppData, NonceQueueItem, QueueCountsResult } from '../state-manager/state-manager-types';
import { DebugComplete } from '../state-manager/TransactionQueue';
import Statistics from '../statistics';
import Storage from '../storage';
import { initAjvSchemas } from '../types/ajv/Helpers';
import * as utils from '../utils';
import { fastIsPicked, groupResolvePromises, inRangeOfCurrentTime, isValidShardusAddress, } from '../utils';
import { getSocketReport } from '../utils/debugUtils';
import MemoryReporting from '../utils/memoryReporting';
import NestedCounters, { nestedCountersInstance } from '../utils/nestedCounters';
import Profiler, { profilerInstance } from '../utils/profiler';
import { startSaving } from './saveConsoleOutput';
import { isDebugMode, isServiceMode } from '../debug';
import * as JoinV2 from '../p2p/Join/v2';
import { getNetworkTimeOffset, shardusGetTime, calculateFakeTimeOffset, clearFakeTimeOffset } from '../network';
import { JoinRequest } from '@shardus/types/build/src/p2p/JoinTypes';
import { networkMode, isInternalTxAllowed } from '../p2p/Modes';
import { lostArchiversMap } from '../p2p/LostArchivers/state';
import getCallstack from '../utils/getCallstack';
import * as crypto from '@shardus/crypto-utils';
import * as Comms from './../p2p/Comms';
import { isFirst, waitForQ1SendRequests } from '../p2p/Self';
import { currentQuarter } from '../p2p/CycleCreator';
import { InternalBinaryHandler } from '../types/Handler';
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum';
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum';
import { getStreamWithTypeCheck, requestErrorHandler } from '../types/Helpers';
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum';
import { SignAppDataReq, deserializeSignAppDataReq, serializeSignAppDataReq } from '../types/SignAppDataReq';
import { SignAppDataResp, deserializeSignAppDataResp, serializeSignAppDataResp, } from '../types/SignAppDataResp';
import { Utils } from '@shardus/types';
import { getOurNodeIndex, isNodeInRotationBounds } from '../p2p/Utils';
import ShardFunctions from '../state-manager/shardFunctions';
import SocketIO from 'socket.io';
import { nodeListFromStates, queueFinishedSyncingRequest } from '../p2p/Join';
import * as NodeList from '../p2p/NodeList';
import { P2P } from '@shardus/types';
const allZeroes64 = '0'.repeat(64);
const defaultConfigs: ShardusTypes.StrictShardusConfiguration = SHARDUS_CONFIG;
Context.setDefaultConfigs(defaultConfigs);
type RouteHandlerRegister = (route: string, authHandler: Handler, responseHandler?: Handler) => void;
const changeListGlobalAccount = defaultConfigs.server.globalAccount;
interface Shardus {
    io: SocketIO.Server;
    profiler: Profiler;
    nestedCounters: NestedCounters;
    memoryReporting: MemoryReporting;
    config: ShardusTypes.StrictServerConfiguration;
    logger: Logger;
    mainLogger: Log4js.Logger;
    seqLogger: Log4js.Logger;
    fatalLogger: Log4js.Logger;
    appLogger: Log4js.Logger;
    exitHandler: any;
    storage: Storage;
    crypto: Crypto;
    network: Network.NetworkClass;
    p2p: Wrapper.P2P;
    debug: Debug;
    appProvided: boolean;
    app: ShardusTypes.App;
    reporter: Reporter;
    stateManager: StateManager;
    statistics: Statistics;
    loadDetection: LoadDetection;
    rateLimiting: RateLimiting;
    heartbeatInterval: number;
    heartbeatTimer: NodeJS.Timeout;
    registerExternalGet: RouteHandlerRegister;
    registerExternalPost: RouteHandlerRegister;
    registerExternalPut: RouteHandlerRegister;
    registerExternalDelete: RouteHandlerRegister;
    registerExternalPatch: RouteHandlerRegister;
    registerBeforeAddVerifier: (type: string, verifier: (tx: OpaqueTransaction) => Promise<boolean>) => void;
    registerApplyVerifier: (type: string, verifier: (tx: OpaqueTransaction) => Promise<boolean>) => void;
    registerShutdownHandler: (type: string, handler: (activeNode: P2P.NodeListTypes.Node, record: P2P.CycleCreatorTypes.CycleRecord) => Omit<P2P.ServiceQueueTypes.AddNetworkTx, 'cycle' | 'hash'> | null | undefined) => void;
    _listeners: any;
    appliedConfigChanges: Set<string>;
    debugForeverLoopCounter: number;
    debugForeverLoopsEnabled: boolean;
}
class Shardus extends EventEmitter {
    constructor({ server: config, logs: logsConfig, storage: storageConfig }: ShardusTypes.StrictShardusConfiguration) {
        super();
        this.debugForeverLoopsEnabled = true;
        this.debugForeverLoopCounter = 0;
        this.nestedCounters = nestedCountersInstance;
        this.memoryReporting = new MemoryReporting(this);
        this.config = config;
        Context.setConfig(this.config);
        this.profiler = new Profiler();
        logFlags.verbose = false;
        let startInFatalsLogMode = config && config.debug && config.debug.startInFatalsLogMode ? true : false;
        let startInErrorsLogMode = config && config.debug && config.debug.startInErrorLogMode ? true : false;
        let dynamicLogMode = '';
        if (startInFatalsLogMode === true) {
            dynamicLogMode = 'fatal';
        }
        else if (startInErrorsLogMode === true) {
            dynamicLogMode = 'error';
        }
        initAjvSchemas();
        this.logger = new Logger(config.baseDir, logsConfig, dynamicLogMode);
        Context.setLoggerContext(this.logger);
        Snapshot.initLogger();
        const logDir = path.join(config.baseDir, logsConfig.dir);
        if (logsConfig.saveConsoleOutput) {
            startSaving(logDir);
        }
        this.mainLogger = this.logger.getLogger('main');
        this.seqLogger = this.logger.getLogger('seq');
        this.fatalLogger = this.logger.getLogger('fatal');
        this.appLogger = this.logger.getLogger('app');
        this.exitHandler = new ExitHandler(logDir, this.memoryReporting, this.nestedCounters);
        this.storage = new Storage(config.baseDir, storageConfig, config, this.logger, this.profiler);
        Context.setStorageContext(this.storage);
        this.crypto = new Crypto(config.baseDir, this.config, this.logger, this.storage);
        Context.setCryptoContext(this.crypto);
        this.network = new Network.NetworkClass(config, this.logger);
        Context.setNetworkContext(this.network);
        this.p2p = Wrapper.p2p;
        Context.setP2pContext(this.p2p);
        this.debug = null;
        this.appProvided = null;
        this.app = null;
        this.reporter = null;
        this.stateManager = null;
        this.statistics = null;
        this.loadDetection = null;
        this.rateLimiting = null;
        this.appliedConfigChanges = new Set();
        if (logFlags.info) {
        }
        this._listeners = {};
        this.heartbeatInterval = config.heartbeatInterval;
        this.heartbeatTimer = null;
        this.registerExternalGet = (route, authHandler, handler) => this.network.registerExternalGet(route, authHandler, handler);
        this.registerExternalPost = (route, authHandler, handler) => this.network.registerExternalPost(route, authHandler, handler);
        this.registerExternalPut = (route, authHandler, handler) => this.network.registerExternalPut(route, authHandler, handler);
        this.registerExternalDelete = (route, authHandler, handler) => this.network.registerExternalDelete(route, authHandler, handler);
        this.registerExternalPatch = (route, authHandler, handler) => this.network.registerExternalPatch(route, authHandler, handler);
        this.registerBeforeAddVerifier = ServiceQueue.registerBeforeAddVerifier;
        this.registerApplyVerifier = ServiceQueue.registerApplyVerifier;
        this.registerApplyVerifier = ServiceQueue.registerApplyVerifier;
        this.registerShutdownHandler = ServiceQueue.registerShutdownHandler;
        this.exitHandler.addSigListeners();
        this.exitHandler.registerSync('reporter', () => {
            if (this.reporter) {
                this.reporter.stopReporting();
            }
        });
        this.exitHandler.registerAsync('application', async () => {
            if (this.app && this.app.close) {
                await this.app.close();
            }
        });
        this.exitHandler.registerSync('crypto', () => {
            this.crypto.stopAllGenerators();
        });
        this.exitHandler.registerSync('cycleCreator', () => {
            this.p2p.shutdown();
        });
        this.exitHandler.registerAsync('network', async () => {
            await this.network.shutdown();
        });
        this.exitHandler.registerAsync('storage', async () => {
            await this.storage.close();
        });
        this.exitHandler.registerAsync('unjoin', async () => {
            if (networkMode !== 'shutdown') {
                await JoinV2.shutdown();
            }
        });
        this.exitHandler.registerAsync('logger', async () => {
            await this.logger.shutdown();
        });
        this.profiler.registerEndpoints();
        this.nestedCounters.registerEndpoints();
        this.memoryReporting.registerEndpoints();
        this.logger.registerEndpoints(Context);
        this.logger.playbackLogState('constructed', '', '');
    }
    setup(app: ShardusTypes.App) {
        if (app === null) {
            this.appProvided = false;
        }
        else if (app === Object(app)) {
            this.app = this._getApplicationInterface(app);
            this.appProvided = true;
            this.logger.playbackLogState('appProvided', '', '');
        }
        else {
            throw new Error('Please provide an App object or null to Shardus.setup.');
        }
        return this;
    }
    async start() {
        await Network.init();
        const isInTimeLimit = await Network.checkAndUpdateTimeSyncedOffset(this.config.p2p.timeServers);
        if (isInTimeLimit === false) {
            this.mainLogger.error(`Time is not in sync with the network from checkAndUpdateTimeSyncedOffset process`);
            throw new Error(`Time is not in sync with the network during ntpOffsetMs generation`);
        }
        if (!isServiceMode()) {
            await this.storage.init();
        }
        await this.crypto.init();
        try {
            const sk: string = this.crypto.keypair.secretKey;
            this.io = (await this.network.setup(Network.ipInfo, sk)) as SocketIO.Server;
            Context.setIOContext(this.io);
            function validateSocketHandshake(socket: SocketIO.Socket, crypto: Crypto, mainLogger: Log4js.Logger): boolean {
                try {
                    if (!Self || !Self.isActive) {
                        if (!Self.allowConnectionToFirstNode) {
                            mainLogger.error(`❌ This node is not active yet and kill the socket connection!`);
                            return false;
                        }
                    }
                    if (!Archivers.recipients || !Archivers.connectedSockets) {
                        mainLogger.error(`❌ Seems Archiver module isn't initialized yet, dropping the Socket connection!`);
                        return false;
                    }
                    const archiverCreds = JSON.parse(socket.handshake.query.data) as {
                        publicKey: string;
                        timestamp: number;
                        intendedConsensor: string;
                        sign: ShardusTypes.Sign;
                    };
                    if (Math.abs(archiverCreds.timestamp - shardusGetTime()) > 5000) {
                        mainLogger.error(`❌ Old signature from Archiver @ ${archiverCreds.publicKey}`);
                        return false;
                    }
                    if (archiverCreds.intendedConsensor !== Self.getThisNodeInfo().publicKey) {
                        mainLogger.error(`❌ The signature is targeted for consensor @ ${archiverCreds.intendedConsensor} but this node is ${Self.getThisNodeInfo().publicKey}`);
                        return false;
                    }
                    const isValidSig = crypto.verify(archiverCreds, archiverCreds.publicKey);
                    if (!isValidSig) {
                        mainLogger.error(`❌ Invalid Signature from Archiver @ ${archiverCreds.publicKey}`);
                        return false;
                    }
                    if (Object.keys(Archivers.connectedSockets).length >= config.p2p.maxArchiversSubscriptionPerNode) {
                        return false;
                    }
                    if (Self && Self.isFirst)
                        return true;
                    const archiver = Archivers.archivers.get(archiverCreds.publicKey);
                    if (!archiver) {
                        mainLogger.error(`❌ Remote Archiver @ ${archiver.publicKey} is NOT recognized!`);
                        return false;
                    }
                    return true;
                }
                catch (error) {
                    mainLogger.error('❌ Error in Archiver Socket-Connection Auth!');
                    mainLogger.error(error);
                    return false;
                }
            }
            this.io.on('connection', (socket: any) => {
                if (!validateSocketHandshake(socket, this.crypto, this.mainLogger)) {
                    socket.disconnect();
                    return;
                }
                const { publicKey: archiverPublicKey } = JSON.parse(socket.handshake.query.data);
                let freezedList = Object.freeze(JSON.parse(JSON.stringify(Archivers.connectedSockets)));
                if (freezedList[archiverPublicKey]) {
                    Archivers.removeArchiverConnection(archiverPublicKey);
                }
                Archivers.addArchiverConnection(archiverPublicKey, socket.id);
                socket.on('UNSUBSCRIBE', function (ARCHIVER_PUBLIC_KEY) {
                    if (freezedList[ARCHIVER_PUBLIC_KEY] === socket.id) {
                        Archivers.removeArchiverConnection(ARCHIVER_PUBLIC_KEY);
                    }
                });
            });
        }
        catch (e) {
            this.mainLogger.error('Socket connection break', e);
        }
        this.network.on('timeout', (node, requestId: string, context: string, route: string) => {
            const ipPort = `${node.internalIp}:${node.internalPort}`;
            const result = isApopMarkedNode(node.id);
            if (result) {
                return;
            }
            if (!config.debug.disableLostNodeReports)
                scheduleLostReport(node, 'timeout', requestId);
            if (this.network.statisticsInstance)
                this.network.statisticsInstance.incrementCounter('lostNodeTimeout');
        });
        this.network.on('error', (node, requestId: string, context: string, errorGroup: string, route: string, subRoute = '') => {
            const ipPort = `${node.internalIp}:${node.internalPort}`;
            if (!config.debug.disableLostNodeReports)
                scheduleLostReport(node, 'error', requestId);
        });
        this.debug = new Debug(this.config.baseDir, this.network);
        this.debug.addToArchive(this.logger.logDir, './logs');
        this.debug.addToArchive(path.parse(this.storage.storage.storageConfig.options.storage).dir, './db');
        if (!isServiceMode()) {
            this.statistics = new Statistics(this.config.baseDir, this.config.statistics, {
                counters: [
                    'txInjected',
                    'txApplied',
                    'txRejected',
                    'txExpired',
                    'txProcessed',
                    'networkTimeout',
                    'lostNodeTimeout',
                ],
                watchers: {
                    queueLength: () => this.stateManager ? this.stateManager.transactionQueue._transactionQueue.length : 0,
                    executeQueueLength: () => this.stateManager ? this.stateManager.transactionQueue.getExecuteQueueLength() : 0,
                    serverLoad: () => (this.loadDetection ? this.loadDetection.getCurrentLoad() : 0),
                },
                timers: ['txTimeInQueue'],
                manualStats: ['netInternalDuty', 'netExternalDuty'],
                fifoStats: ['cpuPercent'],
                ringOverrides: {},
                fifoOverrides: { cpuPercent: 240 },
            }, this);
        }
        this.debug.addToArchive('./statistics.tsv', './statistics.tsv');
        this.profiler.setStatisticsInstance(this.statistics);
        this.network.setStatisticsInstance(this.statistics);
        this.statistics;
        this.loadDetection = new LoadDetection(this.config.loadDetection, this.statistics);
        this.loadDetection.on('highLoad', () => {
            AutoScaling.requestNetworkUpsize();
        });
        this.loadDetection.on('lowLoad', () => {
            AutoScaling.requestNetworkDownsize();
        });
        if (!isServiceMode())
            this.statistics.on('snapshot', () => this.loadDetection.updateLoad());
        this.rateLimiting = new RateLimiting(this.config.rateLimiting, this.seqLogger);
        Context.setShardusContext(this);
        Self.init();
        if (this.app) {
            this._createAndLinkStateManager();
            this._attemptCreateAppliedListener();
            let disableSnapshots = !!(this.config &&
                this.config.debug &&
                this.config.debug.disableSnapshots === true);
            if (disableSnapshots != true) {
                this.once('active', Snapshot.startSnapshotting);
            }
        }
        this.reporter =
            this.config.reporting.report && !isServiceMode()
                ? new Reporter(this.config.reporting, this.logger, this.statistics, this.stateManager, this.profiler, this.loadDetection)
                : null;
        Context.setReporterContext(this.reporter);
        this._registerRoutes();
        Self.emitter.on('witnessing', async (publicKey) => {
            this.logger.playbackLogState('witnessing', '', publicKey);
            await Snapshot.startWitnessMode();
        });
        Self.emitter.on('joining', (publicKey) => {
            this.logger.playbackLogState('joining', '', publicKey);
            if (this.reporter)
                this.reporter.reportJoining(publicKey);
        });
        Self.emitter.on('joined', (nodeId, publicKey) => {
            this.logger.playbackLogState('joined', nodeId, publicKey);
            this.logger.setPlaybackID(nodeId);
            if (this.reporter)
                this.reporter.reportJoined(nodeId, publicKey);
        });
        Self.emitter.on('initialized', async () => {
            const newest = CycleChain.getNewest();
            if (newest && (newest.mode === 'restart' || newest.mode === 'recovery')) {
                Self.setp2pIgnoreJoinRequests(false);
            }
            else {
                await this.syncAppData();
            }
        });
        Self.emitter.on('restore', async (cycleNumber: number) => {
            this.logger.playbackLogState('restore', '', `Restore mode triggered on cycle ${cycleNumber}`);
            await this.stateManager.waitForShardCalcs();
            try {
                this.stateManager.renewState();
                await this.stateManager.accountSync.initialSyncMain(3);
            }
            catch (err) {
                this.fatalLogger.fatal('restore-failed with Error: ' +
                    utils.formatErrorMessage(err));
                apoptosizeSelf(`restore-failed: ${err?.message}`);
                return;
            }
            await this.stateManager.startCatchUpQueue();
            await this.app.sync();
            await queueFinishedSyncingRequest();
            this.stateManager.appFinishedSyncing = true;
            this.stateManager.startProcessingCycleSummaries();
        });
        Self.emitter.on('active', (nodeId) => {
            this.logger.playbackLogState('active', nodeId, '');
            if (this.reporter) {
                this.reporter.reportActive(nodeId);
                this.reporter.startReporting();
            }
            if (this.statistics)
                this.statistics.startSnapshots();
            this.emit('active', nodeId);
        });
        Self.emitter.on('failed', () => {
            this.shutdown(true);
        });
        Self.emitter.on('error', (e) => {
            this.shardus_fatal(`onError_ex` + e.message + ' at ' + e.stack, 'shardus.start() ' + e.message + ' at ' + e.stack);
            throw new Error(e);
        });
        Self.emitter.on('removed', async () => {
            if (this.reporter) {
                this.reporter.stopReporting();
                await this.reporter.reportRemoved(Self.id);
            }
            this.exitHandler.exitCleanly(`removed`, `removed from network in normal conditions`);
        });
        Self.emitter.on('app-removed', async () => {
            if (this.reporter) {
                this.reporter.stopReporting();
                await this.reporter.reportRemoved(Self.id);
            }
            this.exitHandler.exitCleanly(`removed`, `removed from network requested by app`);
        });
        Self.emitter.on('invoke-exit', async (tag: string, callstack: string, message: string, restart: boolean) => {
            const exitType = restart ? 'exitCleanly' : 'exitUncleanly';
            this.mainLogger.error(`invoke-exit: ${tag} ${exitType}`);
            this.mainLogger.error(message);
            this.mainLogger.error(callstack);
            if (this.reporter) {
                this.reporter.stopReporting();
                await this.reporter.reportRemoved(Self.id);
            }
            if (restart)
                this.exitHandler.exitCleanly(`invoke-exit: ${tag}`, `invoke-exit: ${tag}. but exiting cleanly for a restart`);
            else
                this.exitHandler.exitUncleanly(`invoke-exit: ${tag}`, `invoke-exit: ${tag} ${exitType}`);
        });
        Self.emitter.on('node-activated', ({ ...params }) => {
            if (networkMode === 'shutdown')
                return;
            try {
                this.app.eventNotify?.({ type: 'node-activated', ...params });
            }
            catch (e) {
                this.mainLogger.error(`Error: while processing node-activated event stack: ${e.stack}`);
            }
        });
        Self.emitter.on('node-deactivated', ({ ...params }) => {
            if (networkMode === 'shutdown')
                return;
            try {
                this.app.eventNotify?.({ type: 'node-deactivated', ...params });
            }
            catch (e) {
                this.mainLogger.error(`Error: while processing node-deactivated event stack: ${e.stack}`);
            }
        });
        Self.emitter.on('node-refuted', ({ ...params }) => {
            try {
                if (!this.stateManager.currentCycleShardData)
                    throw new Error('No current cycle data');
                if (params.publicKey == null)
                    throw new Error('No node publicKey provided for node-refuted event');
                const consensusNodes = this.getConsenusGroupForAccount(params.publicKey);
                for (let node of consensusNodes) {
                    if (node.id === Self.id) {
                        this.app.eventNotify?.({ type: 'node-refuted', ...params });
                    }
                }
            }
            catch (e) {
                this.mainLogger.error(`Error: while processing node-refuted event stack: ${e.stack}`);
            }
        });
        Self.emitter.on('node-left-early', ({ ...params }) => {
            try {
                if (!this.stateManager.currentCycleShardData)
                    throw new Error('No current cycle data');
                if (params.publicKey == null)
                    throw new Error('No node publicKey provided for node-left-early event');
                const consensusNodes = this.getConsenusGroupForAccount(params.publicKey);
                for (let node of consensusNodes) {
                    if (node.id === Self.id) {
                        this.app.eventNotify?.({ type: 'node-left-early', ...params });
                    }
                }
            }
            catch (e) {
                this.mainLogger.error(`Error: while processing node-left-early event stack: ${e.stack}`);
            }
        });
        Self.emitter.on('node-sync-timeout', ({ ...params }) => {
            try {
                if (!this.stateManager.currentCycleShardData)
                    throw new Error('No current cycle data');
                if (params.publicKey == null)
                    throw new Error('No node publicKey provided for node-sync-timeout event');
                const consensusNodes = this.getConsenusGroupForAccount(params.publicKey);
                for (let node of consensusNodes) {
                    if (node.id === Self.id) {
                        this.app.eventNotify?.({ type: 'node-sync-timeout', ...params });
                        break;
                    }
                }
            }
            catch (e) {
                this.mainLogger.error(`Error: while processing node-sync-timeout event stack: ${e.stack}`);
            }
        });
        Self.emitter.on('try-network-transaction', ({ ...params }) => {
            try {
                this.app.eventNotify?.({ type: 'try-network-transaction', ...params });
            }
            catch (e) {
                this.mainLogger.error(`Error: while processing try-network-transaction event stack: ${e.stack}`);
            }
        });
        await Self.startupV2();
        this._registerListener(this.p2p.state, 'cycle_q1_start', async () => {
            let lastCycle = CycleChain.getNewest();
            if (this.stateManager.appFinishedSyncing === true) {
                const account = await this.app.getNetworkAccount();
                this.updateConfigChangeQueue(account, lastCycle);
            }
            this.updateDebug(lastCycle);
        });
        this.setupDebugEndpoints();
    }
    _registerListener(emitter, event, callback) {
        if (this._listeners[event]) {
            this.shardus_fatal(`_registerListener_dupe`, 'Shardus can only register one listener per event! EVENT: ', event);
            return;
        }
        emitter.on(event, callback);
        this._listeners[event] = [emitter, callback];
    }
    _unregisterListener(event) {
        if (!this._listeners[event]) {
            this.mainLogger.warn(`This event listener doesn't exist! Event: \`${event}\` in Shardus`);
            return;
        }
        const entry = this._listeners[event];
        const [emitter, callback] = entry;
        emitter.removeListener(event, callback);
        delete this._listeners[event];
    }
    _cleanupListeners() {
        for (const event of Object.keys(this._listeners)) {
            this._unregisterListener(event);
        }
    }
    async _timestampAndQueueTransaction(tx: ShardusTypes.OpaqueTransaction, appData: any, global = false, noConsensus = false, loggingContext = '') {
        const { status: preCrackSuccess, reason } = await this.app.txPreCrackData(tx, appData);
        if (this.config.stateManager.checkPrecrackStatus === true && preCrackSuccess === false) {
            return {
                success: false,
                reason: `PreCrack has failed. ${reason}`,
                status: 500,
            };
        }
        const injectedTimestamp = this.app.getTimestampFromTransaction(tx, appData);
        const txId = this.app.calculateTxId(tx);
        let timestampReceipt: ShardusTypes.TimestampReceipt;
        let isMissingInjectedTimestamp = !injectedTimestamp || injectedTimestamp === -1;
        if (isMissingInjectedTimestamp) {
            if (injectedTimestamp === -1) {
            }
            timestampReceipt = await this.stateManager.transactionConsensus.askTxnTimestampFromNode(txId);
        }
        if (isMissingInjectedTimestamp && !timestampReceipt) {
            this.shardus_fatal("put_noTimestamp", `Transaction timestamp cannot be determined ${utils.stringifyReduce(tx)} `);
            this.statistics.incrementCounter("txRejected");
            return {
                success: false,
                reason: "Transaction timestamp cannot be determined.",
                status: 500
            };
        }
        let timestampedTx: ShardusTypes.TimestampedTx;
        if (timestampReceipt && timestampReceipt.timestamp) {
            timestampedTx = {
                tx,
                timestampReceipt
            };
        }
        else {
            timestampedTx = { tx };
        }
        const validateResult = this.app.validate(timestampedTx, appData);
        if (validateResult.success === false) {
            validateResult.status = validateResult.status ? validateResult.status : 400;
            return validateResult;
        }
        const { timestamp, id, keys, shardusMemoryPatterns } = this.app.crack(timestampedTx, appData);
        if (this.config.debug.checkAddressFormat && !isValidShardusAddress(keys.allKeys)) {
            this.shardus_fatal(`put_invalidAddress`, `Invalid Shardus Address found: allKeys:${keys.allKeys} ${utils.stringifyReduce(tx)}`);
            this.statistics.incrementCounter("txRejected");
            return { success: false, reason: "Invalid Shardus Addresses", status: 400 };
        }
        let txExpireTimeMs = this.config.transactionExpireTime * 1000;
        if (global) {
            txExpireTimeMs = 2 * 10 * 1000;
        }
        if (inRangeOfCurrentTime(timestamp, txExpireTimeMs, txExpireTimeMs) === false) {
            this.shardus_fatal(`tx_outofrange`, `Transaction timestamp out of range: timestamp:${timestamp} now:${shardusGetTime()} diff(now-ts):${shardusGetTime() - timestamp}  ${utils.stringifyReduce(tx)} our offset: ${getNetworkTimeOffset()} loggingContext: ${loggingContext}`);
            this.statistics.incrementCounter("txRejected");
            return { success: false, reason: "Transaction timestamp out of range", status: 400 };
        }
        const acceptedTX: ShardusTypes.AcceptedTx = {
            timestamp,
            txId: id,
            keys,
            data: timestampedTx,
            appData,
            shardusMemoryPatterns: shardusMemoryPatterns
        };
        if (global === false) {
            this.statistics.incrementCounter("txInjected");
        }
        let added = this.stateManager.transactionQueue.routeAndQueueAcceptedTransaction(acceptedTX, true, null, global, noConsensus);
        if (logFlags.verbose) {
        }
        return {
            success: true,
            reason: "Transaction queued, poll for results.",
            status: 200,
            txId
        };
    }
    _attemptCreateAppliedListener() {
        if (!this.statistics || !this.stateManager)
            return;
        this._registerListener(this.stateManager.eventEmitter, 'txQueued', (txId) => this.statistics.startTimer('txTimeInQueue', txId));
        this._registerListener(this.stateManager.eventEmitter, 'txPopped', (txId) => this.statistics.stopTimer('txTimeInQueue', txId));
        this._registerListener(this.stateManager.eventEmitter, 'txApplied', () => this.statistics.incrementCounter('txApplied'));
        this._registerListener(this.stateManager.eventEmitter, 'txProcessed', () => this.statistics.incrementCounter('txProcessed'));
        this._registerListener(this.stateManager.eventEmitter, 'txExpired', () => this.statistics.incrementCounter('txExpired'));
    }
    _attemptRemoveAppliedListener() {
        if (!this.statistics || !this.stateManager)
            return;
        this._unregisterListener('txQueued');
        this._unregisterListener('txPopped');
        this._unregisterListener('txApplied');
        this._unregisterListener('txProcessed');
    }
    _unlinkStateManager() {
        this._unregisterListener('accepted');
    }
    _createAndLinkStateManager() {
        this.stateManager = new StateManager(this.profiler, this.app, this.logger, this.storage, this.p2p, this.crypto, this.config, this);
        this.storage.stateManager = this.stateManager;
        Context.setStateManagerContext(this.stateManager);
    }
    async syncAppData() {
        if (!this.app) {
            let readyPayload = {
                nodeId: Self.id,
                cycleNumber: CycleChain.getNewest()?.counter,
            };
            readyPayload = Context.crypto.sign(readyPayload);
            Comms.sendGossip('gossip-sync-finished', readyPayload, undefined, undefined, nodeListFromStates([
                P2P.P2PTypes.NodeStatus.ACTIVE,
                P2P.P2PTypes.NodeStatus.READY,
                P2P.P2PTypes.NodeStatus.SYNCING,
            ]));
            if (this.stateManager) {
                this.stateManager.appFinishedSyncing = true;
            }
            return;
        }
        if (this.stateManager) {
            try {
                await this.stateManager.accountSync.initialSyncMain(3);
            }
            catch (err) {
                this.fatalLogger.fatal('initialSyncMain-failed with Error: ' +
                    utils.formatErrorMessage(err));
                apoptosizeSelf(`initialSyncMain-failed: ${err?.message}`);
                return;
            }
        }
        if (this.p2p.isFirstSeed) {
            await queueFinishedSyncingRequest();
            await this.stateManager.waitForShardCalcs();
            await this.app.sync();
            this.stateManager.appFinishedSyncing = true;
            Self.setp2pIgnoreJoinRequests(false);
        }
        else {
            await this.stateManager.startCatchUpQueue();
            await this.app.sync();
            Self.setp2pIgnoreJoinRequests(false);
            await queueFinishedSyncingRequest();
            this.stateManager.appFinishedSyncing = true;
        }
        this.p2p.setJoinRequestToggle(true);
        if (this.stateManager) {
            await utils.sleep(3000);
            this.stateManager.startProcessingCycleSummaries();
        }
    }
    set(tx: any) {
        return this.put(tx, true, false);
    }
    log(...data: any[]) {
        if (logFlags.debug) {
        }
    }
    getLogFlags(): LogFlags {
        return logFlags;
    }
    async put(tx: ShardusTypes.OpaqueTransaction | ShardusTypes.ReinjectedOpaqueTransaction, set = false, global = false, inputAppData = null): Promise<{
        success: boolean;
        reason: string;
        status: number;
        txId?: string;
    }> {
        const noConsensus = set || global;
        const txId = this.app.calculateTxId(tx);
        if (!this.appProvided)
            throw new Error('Please provide an App object to Shardus.setup before calling Shardus.put');
        if (!this.stateManager.accountSync.dataSyncMainPhaseComplete) {
            this.statistics.incrementCounter('txRejected');
            return { success: false, reason: 'Node is still syncing.', status: 500 };
        }
        if (!this.stateManager.hasCycleShardData()) {
            this.statistics.incrementCounter('txRejected');
            return {
                success: false,
                reason: 'Not ready to accept transactions, shard calculations pending',
                status: 500,
            };
        }
        if (set === false) {
            if (!this.p2p.allowTransactions()) {
                if (global === true && this.p2p.allowSet()) {
                }
                else {
                    this.statistics.incrementCounter('txRejected');
                    return {
                        success: false,
                        reason: 'Network conditions to allow transactions are not met.',
                        status: 500,
                    };
                }
            }
        }
        else {
            if (!this.p2p.allowSet()) {
                this.statistics.incrementCounter('txRejected');
                return {
                    success: false,
                    reason: 'Network conditions to allow app init via set',
                    status: 500,
                };
            }
        }
        if (this.rateLimiting.isOverloaded(txId)) {
            this.statistics.incrementCounter('txRejected');
            return { success: false, reason: 'Maximum load exceeded.', status: 500 };
        }
        try {
            let appData: any = inputAppData ?? {};
            const internalTx = this.app.isInternalTx(tx);
            if (internalTx && !isInternalTxAllowed()) {
                return {
                    success: false,
                    reason: `Internal transactions are not allowed in ${networkMode} Mode.`,
                    status: 500,
                };
            }
            if (!internalTx && networkMode !== 'processing') {
                return {
                    success: false,
                    reason: `Application transactions are only allowed in processing Mode.`,
                    status: 500,
                };
            }
            const senderAddress = this.app.getTxSenderAddress(tx);
            if (global === false) {
                if (senderAddress == null) {
                    return {
                        success: false,
                        reason: `Sender address is not available.`,
                        status: 500
                    };
                }
                const consensusGroup = this.getConsenusGroupForAccount(senderAddress);
                const isConsensusNode = consensusGroup.some((node) => node.id === Self.id);
                if (Context.config.stateManager.forwardToLuckyNodes) {
                    if (isConsensusNode === false) {
                        const result = await this.forwardTransactionToLuckyNodes(senderAddress, tx, 'non-consensus to consensus', '1');
                        return result as Promise<{
                            success: boolean;
                            reason: string;
                            status: number;
                            txId?: string;
                        }>;
                    }
                    let luckyNodeIds = this.getClosestNodes(senderAddress, Context.config.stateManager.numberOfReInjectNodes, false);
                    let isLuckyNode = luckyNodeIds.some((nodeId) => nodeId === Self.id);
                    if (isLuckyNode === false) {
                        const result = await this.forwardTransactionToLuckyNodes(senderAddress, tx, 'non-lucky consensus to lucky' +
                            ' consensus', '2');
                        return result as Promise<{
                            success: boolean;
                            reason: string;
                            status: number;
                            txId?: string;
                        }>;
                    }
                }
            }
            let shouldAddToNonceQueue = false;
            let txNonce;
            if (internalTx === false) {
                let senderAccountNonce = await this.app.getAccountNonce(senderAddress);
                txNonce = await this.app.getNonceFromTx(tx);
                if (senderAccountNonce == null) {
                    if (this.config.mode === ShardusTypes.ServerMode.Release) {
                        return {
                            success: false,
                            reason: `Sender account nonce is not available. ${utils.stringifyReduce(tx)}`,
                            status: 500
                        };
                    }
                    senderAccountNonce = BigInt(0);
                }
                if (txNonce >= 0 && senderAccountNonce >= 0) {
                    if (txNonce < senderAccountNonce) {
                        return {
                            success: false,
                            reason: `Transaction nonce is less than the account nonce. ${txNonce} < ${senderAccountNonce} ${utils.stringifyReduce(tx)}  `,
                            status: 500
                        };
                    }
                    else if (txNonce > senderAccountNonce) {
                        const txInNonceQueue = this.stateManager.transactionQueue.isTxInPendingNonceQueue(senderAddress, txId);
                        if (txInNonceQueue) {
                            return {
                                success: true,
                                reason: `Transaction is already in pending nonce queue.`,
                                status: 200
                            };
                        }
                        const maxAllowedPendingNonce = senderAccountNonce + BigInt(Context.config.stateManager.maxPendingNonceTxs);
                        if (txNonce <= maxAllowedPendingNonce) {
                            shouldAddToNonceQueue = true;
                        }
                        else {
                            return {
                                success: false,
                                reason: `Transaction nonce ${txNonce.toString()} is greater than max allowed pending nonce of ${maxAllowedPendingNonce.toString()}`,
                                status: 500
                            };
                        }
                    }
                }
            }
            const shouldQueueNonceButPoolIsFull = shouldAddToNonceQueue &&
                this.config.stateManager.maxNonceQueueSize <= this.stateManager.transactionQueue.nonceQueue.size;
            if (shouldQueueNonceButPoolIsFull) {
                return {
                    success: false,
                    reason: `Nonce pool is full, try again later`,
                    status: 500,
                };
            }
            if (shouldAddToNonceQueue) {
                const nonceQueueEntry: NonceQueueItem = {
                    tx,
                    txId,
                    accountId: senderAddress,
                    nonce: txNonce,
                    appData,
                    global,
                    noConsensus,
                };
                let nonceQueueAddResult = this.stateManager.transactionQueue.addTransactionToNonceQueue(nonceQueueEntry);
                if (Context.config.stateManager.forwardToLuckyNodesNonceQueue) {
                    if (nonceQueueAddResult?.alreadyAdded === true && Context.config.stateManager.forwardToLuckyNodesNonceQueueLimitFix) {
                        return {
                            success: true,
                            reason: `Transaction already added to pending nonce queue.`,
                            status: 200
                        };
                    }
                    let result = this.forwardTransactionToLuckyNodes(senderAddress, tx, txId, 'consensus to consensus', '3');
                    return result as Promise<{
                        success: boolean;
                        reason: string;
                        status: number;
                        txId?: string;
                    }>;
                }
                else {
                    return {
                        success: true,
                        reason: `Transaction added to pending nonce queue.`,
                        status: 200
                    };
                }
            }
            else {
                let result = await this._timestampAndQueueTransaction(tx, appData, global, noConsensus, 'immediateQueue');
                if (logFlags.important_as_error) {
                    const txTimestamp = this.app.getTimestampFromTransaction(tx, appData);
                    const nowNodeTimestamp = shardusGetTime();
                    const ntpOffset = getNetworkTimeOffset();
                }
                return result;
            }
        }
        catch (err) {
            this.shardus_fatal(`put_ex_` + err.message, `Put: Failed to process transaction. Exception: ${err}`);
            this.fatalLogger.fatal('Put: ' + err.name + ': ' + err.message + ' at ' + err.stack);
            return {
                success: false,
                reason: `Failed to process transaction: ${utils.stringifyReduce(tx)} ${inspect(err)}`,
                status: 500,
            };
        }
        finally {
        }
    }
    async forwardTransactionToLuckyNodes(senderAddress: string, tx: ShardusTypes.OpaqueTransaction, txId: string, message = '', context = ''): Promise<unknown> {
        let closetNodeIds = this.getClosestNodes(senderAddress, Context.config.stateManager.numberOfReInjectNodes, false);
        const cycleShardData = this.stateManager.currentCycleShardData;
        const homeNode = ShardFunctions.findHomeNode(cycleShardData.shardGlobals, senderAddress, cycleShardData.parititionShardDataMap);
        if (homeNode == null) {
            return { success: false, reason: `Home node not found for account ${senderAddress}`, status: 500 };
        }
        let selectedValidators = [];
        if (Self.id != homeNode.node.id)
            selectedValidators.push({
                id: homeNode.node.id,
                ip: homeNode.node.externalIp,
                port: homeNode.node.externalPort,
                publicKey: homeNode.node.publicKey,
            });
        let stats = {
            skippedSelf: 0,
            skippedRotation: 0,
            skippedHome: 0,
            ok_inQ: 0,
            ok_inQ2: 0,
            ok_addQ: 0
        };
        for (const id of closetNodeIds) {
            if (id === Self.id) {
                stats.skippedSelf++;
                continue;
            }
            if (id === homeNode.node.id) {
                stats.skippedHome++;
                continue;
            }
            let node = nodes.get(id);
            let rotationCheckPassed = true;
            if (Context.config.stateManager.forwardToLuckyNodesCheckRotation) {
                rotationCheckPassed = isNodeInRotationBounds(id) === false;
            }
            if (node.status !== 'active' || (rotationCheckPassed === false)) {
                stats.skippedRotation++;
                continue;
            }
            const validatorDetails = {
                id: node.id,
                ip: node.externalIp,
                port: node.externalPort,
                publicKey: node.publicKey,
            };
            selectedValidators.push(validatorDetails);
        }
        let successCount = 0;
        let failedCount = 0;
        for (const validator of selectedValidators) {
            try {
                if (validator.id === homeNode.node.id) {
                }
                else {
                }
                const result: ShardusTypes.InjectTxResponse = await this.app.injectTxToConsensor([validator], tx);
                if (result == null) {
                    failedCount++;
                    continue;
                }
                if (result && result.success === false) {
                    failedCount++;
                    continue;
                }
                if (result && result.success === true) {
                    if (result.reason === 'Transaction is already in pending nonce queue.') {
                        stats.ok_inQ++;
                    }
                    if (result.reason === `Transaction already added to pending nonce queue.`) {
                        stats.ok_inQ2++;
                    }
                    if (result.reason === `Transaction added to pending nonce queue.`) {
                        stats.ok_addQ++;
                    }
                    if (Context.config.stateManager.forwardToLuckyMulti) {
                        successCount++;
                        continue;
                    }
                    return { success: true, reason: 'Transaction forwarded to validators', status: 200 };
                }
            }
            catch (e) {
                if (logFlags.debug || logFlags.rotation)
                    this.mainLogger.error(`Forwarding injected tx to ${validator.id} failed. ${message} ${Utils.safeStringify(tx)} error: ${e.stack}`);
            }
        }
        if (successCount > 0) {
            return { success: true, reason: 'Transaction forwarded to validators', status: 200 };
        }
        if (logFlags.debug || logFlags.rotation)
            this.mainLogger.error(`Forwarding injected tx out of tries. ${Utils.safeStringify(stats)} ${Utils.safeStringify(tx)} `);
        return { success: false, reason: 'No validators found to forward the transaction', status: 500 };
    }
    getNodeId() {
        return this.p2p.getNodeId();
    }
    getNode(id: string): ShardusTypes.Node | undefined {
        return this.p2p.state.getNode(id);
    }
    getNodeByPubKey(id: string): ShardusTypes.Node {
        return this.p2p.state.getNodeByPubKey(id);
    }
    getNodeRotationIndex(id: string): {
        idx: number;
        total: number;
    } {
        return getAgeIndexForNodeId(id);
    }
    isNodeInRotationBounds(nodeId: string) {
        return isNodeInRotationBounds(nodeId);
    }
    isNodeActiveByPubKey(pubKey: string): boolean {
        const node = this.p2p.state.getNodeByPubKey(pubKey);
        if (node == null) {
            return false;
        }
        if (node.status !== NodeStatus.ACTIVE) {
            return false;
        }
        return true;
    }
    isNodeReadyByPubKey(pubKey: string): boolean {
        const node = this.p2p.state.getNodeByPubKey(pubKey);
        if (node == null) {
            return false;
        }
        if (node.status !== NodeStatus.READY) {
            return false;
        }
        return true;
    }
    isNodeSyncingByPubKey(pubKey: string): boolean {
        const node = this.p2p.state.getNodeByPubKey(pubKey);
        if (node == null) {
            return false;
        }
        if (node.status !== NodeStatus.SYNCING) {
            return false;
        }
        return true;
    }
    isNodeSelectedByPubKey(pubKey: string): boolean {
        const node = this.p2p.state.getNodeByPubKey(pubKey);
        if (node == null) {
            return false;
        }
        if (node.status !== NodeStatus.SELECTED) {
            return false;
        }
        return true;
    }
    isNodeActive(id: string): boolean {
        const node = this.p2p.state.getNode(id);
        if (node == null) {
            return false;
        }
        if (node.status !== NodeStatus.ACTIVE) {
            return false;
        }
        return true;
    }
    getLatestCycles(amount = 1) {
        return this.p2p.getLatestCycles(amount);
    }
    getNumActiveNodes() {
        let lastCycle = CycleChain.getNewest();
        if (lastCycle == null) {
            return 0;
        }
        const latestCycle = this.p2p.getLatestCycles(1)[0];
        if (latestCycle == null) {
            return 0;
        }
        return latestCycle ? latestCycle.active : 0;
    }
    fastIsPicked(numberToPick: number) {
        let numActiveNodes = NodeList.activeByIdOrder.length;
        if (numActiveNodes < config.p2p.scaleGroupLimit) {
            return true;
        }
        let offset = CycleChain.newest.counter;
        const ourIndex = getOurNodeIndex();
        if (ourIndex == null)
            return false;
        return fastIsPicked(ourIndex, numActiveNodes, numberToPick, offset);
    }
    getNetworkMode(): ShardusTypes.Cycle['mode'] {
        return networkMode;
    }
    getClosestNodes(hash: string, count: number = 1, selfExclude: boolean = false): string[] {
        return this.stateManager.getClosestNodes(hash, count, selfExclude).map((node) => node.id);
    }
    checkCycleShardData(tag: string): boolean {
        return this.stateManager.checkCycleShardData(tag);
    }
    getClosestNodesGlobal(hash, count) {
        return this.stateManager.getClosestNodesGlobal(hash, count);
    }
    removeNodeWithCertificiate(cert: RemoveCertificate) {
        return removeNodeWithCertificiate(cert);
    }
    computeNodeRank(nodeId: string, txId: string, timestamp: number): bigint {
        return this.stateManager.transactionQueue.computeNodeRank(nodeId, txId, timestamp);
    }
    getShardusProfiler() {
        return profilerInstance;
    }
    shardusGetTime(): number {
        return shardusGetTime();
    }
    setDebugSetLastAppAwait(label: string, complete = DebugComplete.Incomplete) {
        this.stateManager?.transactionQueue.setDebugSetLastAppAwait(label, complete);
    }
    addNetworkTx = ServiceQueue.addNetworkTx;
    getLatestNetworkTxEntryForSubqueueKey = ServiceQueue.getLatestNetworkTxEntryForSubqueueKey;
    validateClosestActiveNodeSignatures(signedAppData: any, signs: ShardusTypes.Sign[], minRequired: number, nodesToSign: number, allowedBackupNodes: number): {
        success: boolean;
        reason: string;
    } {
        let appData = { ...signedAppData };
        if (appData.signs)
            delete appData.signs;
        if (appData.sign)
            delete appData.sign;
        const hash = crypto.hashObj(appData);
        const closestNodes = this.getClosestNodes(hash, nodesToSign + allowedBackupNodes);
        const closestNodesByPubKey = new Map();
        for (let i = 0; i < closestNodes.length; i++) {
            const node = this.p2p.state.getNode(closestNodes[i]);
            if (node) {
                closestNodesByPubKey.set(node.publicKey, node);
            }
        }
        const validSigns = new Set<string>();
        for (let i = 0; i < signs.length; i++) {
            const sign = signs[i];
            const nodePublicKey = sign.owner;
            appData.sign = sign;
            if (!closestNodesByPubKey.has(nodePublicKey)) {
                this.mainLogger.warn(`Node ${nodePublicKey} is not in the closest nodes list. Skipping`);
                continue;
            }
            const node = closestNodesByPubKey.get(nodePublicKey);
            const isValid = this.crypto.verify(appData, nodePublicKey);
            if (node && isValid) {
                validSigns.add(sign.sig);
            }
            if (validSigns.size >= minRequired) {
                return {
                    success: true,
                    reason: `Validated by ${minRequired} valid nodes!`,
                };
            }
        }
        return {
            success: false,
            reason: `Fail to verify enough valid nodes signatures`,
        };
    }
    isNodeInDistance(hash: string, nodeId: string, distance: number) {
        // @ts-ignore
        return this.stateManager.isNodeInDistance(hash, nodeId, distance);
    }
    createApplyResponse(txId, txTimestamp) {
        const replyObject = {
            stateTableResults: [],
            txId,
            txTimestamp,
            accountData: [],
            accountWrites: [],
            appDefinedData: {},
            failed: false,
            failMessage: null,
            appReceiptData: null,
            appReceiptDataHash: null,
        };
        return replyObject;
    }
    async shutdownFromDapp(tag: string, message: string, restart: boolean) {
        const exitType = restart ? 'exitCleanly' : 'exitUncleanly';
        this.mainLogger.error(`invoke-exit: ${exitType}: ${tag}`);
        this.mainLogger.error(message);
        this.mainLogger.error(getCallstack());
        if (this.reporter) {
            this.reporter.stopReporting();
            await this.reporter.reportRemoved(Self.id);
        }
        if (restart)
            this.exitHandler.exitCleanly(`invoke-exit: ${tag}`, `invoke-exit: ${tag}. but exiting cleanly for a restart`);
        else
            this.exitHandler.exitUncleanly(`invoke-exit: ${tag}`, `invoke-exit: ${exitType}: ${tag}`);
    }
    applyResponseAddReceiptData(resultObject: ShardusTypes.ApplyResponse, appReceiptData: any, appReceiptDataHash: string) {
        resultObject.appReceiptData = appReceiptData;
        resultObject.appReceiptDataHash = appReceiptDataHash;
    }
    applyResponseSetFailed(resultObject: ShardusTypes.ApplyResponse, failMessage: string) {
        resultObject.failed = true;
        resultObject.failMessage = failMessage;
    }
    applyResponseAddState(resultObject: ShardusTypes.ApplyResponse, accountData: any, localCache: any, accountId: string, txId: string, txTimestamp: number, stateBefore: string, stateAfter: string, accountCreated: boolean) {
        const state = { accountId, txId, txTimestamp, stateBefore, stateAfter };
        if (accountCreated) {
            state.stateBefore = allZeroes64;
        }
        // @ts-ignore
        resultObject.stateTableResults.push(state);
        let foundAccountData = resultObject.accountData.find((a) => a.accountId === accountId);
        if (foundAccountData) {
            foundAccountData = {
                ...foundAccountData,
                accountId,
                data: accountData,
                // @ts-ignore
                txId,
                timestamp: txTimestamp,
                hash: stateAfter,
                stateId: stateAfter,
                localCache,
            };
        }
        else {
            resultObject.accountData.push({
                accountId,
                data: accountData,
                // @ts-ignore
                txId,
                timestamp: txTimestamp,
                hash: stateAfter,
                stateId: stateAfter,
                localCache,
            });
        }
    }
    applyResponseAddChangedAccount(resultObject: ShardusTypes.ApplyResponse, accountId: string, account: ShardusTypes.WrappedResponse, txId: string, txTimestamp: number) {
        resultObject.accountWrites.push({
            accountId,
            data: account,
            txId,
            timestamp: txTimestamp,
        });
    }
    useAccountWrites() {
        this.stateManager.useAccountWritesOnly = true;
    }
    tryInvolveAccount(txId: string, address: string, isRead: boolean): boolean {
        try {
            const result = this.stateManager.transactionQueue.tryInvloveAccount(txId, address, isRead);
            return result;
        }
        catch (err) {
            this.fatalLogger.fatal('Error while checking tryInvolveAccount ' + err.name + ': ' + err.message + ' at ' + err.stack);
            return false;
        }
    }
    signAsNode(obj) {
        return this.crypto.sign(obj);
    }
    async resetAppRelatedState() {
        await this.storage.clearAppRelatedState();
    }
    async getLocalOrRemoteAccount(address, opts: {
        useRICache: boolean;
        canThrowException?: boolean;
    } = { useRICache: false, canThrowException: false }) {
        if (this.p2p.allowTransactions() || isServiceMode()) {
            return this.stateManager.getLocalOrRemoteAccount(address, opts);
        }
        else {
            return null;
        }
    }
    async getLocalOrRemoteCachedAppData(topic, dataId): Promise<CachedAppData | null> {
        if (this.p2p.allowTransactions()) {
            return this.stateManager.cachedAppDataManager.getLocalOrRemoteCachedAppData(topic, dataId);
        }
        else {
            return null;
        }
    }
    async getLocalOrRemoteAccountQueueCount(address): Promise<QueueCountsResult> {
        if (this.p2p.allowTransactions()) {
            return this.stateManager.getLocalOrRemoteAccountQueueCount(address);
        }
        else {
            return { count: 0, committingAppData: [] };
        }
    }
    async registerCacheTopic(topic: string, maxCycleAge: number, maxCacheElements: number) {
        try {
            return this.stateManager.cachedAppDataManager.registerTopic(topic, maxCycleAge, maxCacheElements);
        }
        catch (e) {
            this.mainLogger.error(`Error while registerCacheTopic`, e);
        }
    }
    async sendCorrespondingCachedAppData(topic: string, dataID: string, appData: any, cycle: number, fromId: string, txId: string) {
        try {
            if (this.config.p2p.useFactCorrespondingTell) {
                await this.stateManager.cachedAppDataManager.factSendCorrespondingCachedAppData(topic, dataID, appData, cycle, fromId, txId);
            }
            else {
                await this.stateManager.cachedAppDataManager.sendCorrespondingCachedAppData(topic, dataID, appData, cycle, fromId, txId);
            }
        }
        catch (e) {
            this.mainLogger.error(`Error while sendCorrespondingCachedAppData`, e);
        }
    }
    async getRemoteAccount(address) {
        return this.stateManager.getRemoteAccount(address);
    }
    getConsenusGroupForAccount(address: string): ShardusTypes.Node[] {
        return this.stateManager.transactionQueue.getConsenusGroupForAccount(address);
    }
    getRandomConsensusNodeForAccount(address: string): ShardusTypes.Node {
        return this.stateManager.transactionQueue.getRandomConsensusNodeForAccount(address);
    }
    isAccountRemote(address: string): boolean {
        return this.stateManager.transactionQueue.isAccountRemote(address);
    }
    testFailChance(failChance: number, debugName: string, key: string, message: string, verboseRequired: boolean): boolean {
        if (this.stateManager.testFailChance(failChance, debugName, key, message, verboseRequired)) {
            return true;
        }
        else {
            return false;
        }
    }
    async debugForeverLoop(tag: string) {
        this.debugForeverLoopCounter++;
        this.stateManager.transactionQueue.setDebugSetLastAppAwait('debugForeverLoop' + tag);
        while (this.debugForeverLoopsEnabled) {
            await utils.sleep(1000);
        }
        this.stateManager.transactionQueue.setDebugSetLastAppAwait('debugForeverLoop' + tag, DebugComplete.Completed);
    }
    setupDebugEndpoints() {
        Context.network.registerExternalGet('debug-toggle-foreverloop', isDebugModeMiddleware, (req, res) => {
            this.debugForeverLoopsEnabled = !this.debugForeverLoopsEnabled;
            if (req.query.set) {
                this.debugForeverLoopsEnabled = req.query.set === 'true';
            }
            res.json({ debugForeverLoopsEnabled: this.debugForeverLoopsEnabled });
        });
    }
    createWrappedResponse(accountId, accountCreated, hash, timestamp, fullData) {
        return {
            accountId,
            accountCreated,
            isPartial: false,
            stateId: hash,
            timestamp,
            data: fullData,
        };
    }
    setPartialData(response, partialData, userTag) {
        if (response.accountCreated) {
            response.localCache = response.data;
            return;
        }
        response.isPartial = true;
        response.localCache = response.data;
        response.data = partialData;
        response.userTag = userTag;
    }
    genericApplyPartialUpate(fullObject, updatedPartialObject) {
        const dataKeys = Object.keys(updatedPartialObject);
        for (const key of dataKeys) {
            fullObject[key] = updatedPartialObject[key];
        }
    }
    async debugCommitAccountCopies(accountCopies: ShardusTypes.AccountsCopy[]) {
        await this.stateManager._commitAccountCopies(accountCopies);
    }
    async forwardAccounts(data: Archivers.InitialAccountsData) {
        await Archivers.forwardAccounts(data);
    }
    getDevPublicKeys() {
        return getDevPublicKeys();
    }
    getDevPublicKey(keyName?: string) {
        return getDevPublicKey(keyName);
    }
    getDevPublicKeyMaxLevel(clearance?: DevSecurityLevel) {
        return getDevPublicKeyMaxLevel(clearance);
    }
    ensureKeySecurity(keyName: string, clearance: DevSecurityLevel) {
        return ensureKeySecurity(keyName, clearance);
    }
    getMultisigPublicKeys() {
        return getMultisigPublicKeys();
    }
    getMultisigPublicKey(key: string) {
        return getMultisigPublicKey(key);
    }
    ensureMultisigKeySecurity(pubKey: string, level: DevSecurityLevel) {
        return ensureMultisigKeySecurity(pubKey, level);
    }
    async shutdown(exitProcess = true) {
        try {
            await this.exitHandler.exitCleanly(exitProcess);
        }
        catch (e) {
            throw e;
        }
    }
    _getApplicationInterface(application: ShardusTypes.App): ShardusTypes.App {
        const applicationInterfaceImpl: Partial<ShardusTypes.App> = {};
        try {
            if (application == null) {
                return null;
            }
            if (typeof application.isInternalTx === 'function') {
                applicationInterfaceImpl.isInternalTx = (tx) => application.isInternalTx(tx);
            }
            if (typeof application.validate === 'function') {
                applicationInterfaceImpl.validate = (inTx, appData) => application.validate(inTx, appData);
            }
            else if (typeof application.validateTxnFields === 'function') {
                applicationInterfaceImpl.validate = (inTx, appData) => {
                    const oldResult: ShardusTypes.IncomingTransactionResult = application.validateTxnFields(inTx, appData);
                    const newResult = {
                        success: oldResult.success,
                        reason: oldResult.reason,
                        status: oldResult.status,
                    };
                    return newResult;
                };
            }
            else {
                throw new Error('Missing required interface function. validate()');
            }
            if (typeof application.crack === 'function') {
                applicationInterfaceImpl.crack = (inTx, appData) => application.crack(inTx, appData);
            }
            else if (typeof application.getKeyFromTransaction === 'function' &&
                typeof application.validateTxnFields === 'function') {
                applicationInterfaceImpl.crack = (inTx) => {
                    const oldGetKeyFromTransactionResult: ShardusTypes.TransactionKeys = application.getKeyFromTransaction(inTx);
                    const oldValidateTxnFieldsResult: ShardusTypes.IncomingTransactionResult = application.validateTxnFields(inTx, null);
                    const newResult = {
                        timestamp: oldValidateTxnFieldsResult.txnTimestamp,
                        id: this.crypto.hash(inTx),
                        keys: oldGetKeyFromTransactionResult,
                        shardusMemoryPatterns: null,
                    };
                    return newResult;
                };
            }
            else {
                throw new Error('Missing required interface function. validate()');
            }
            if (typeof application.txPreCrackData === 'function') {
                applicationInterfaceImpl.txPreCrackData = async (tx, appData): Promise<{
                    status: boolean;
                    reason: string;
                }> => {
                    let { status: success, reason } = await application.txPreCrackData(tx, appData);
                    return { status: success, reason };
                };
            }
            else {
                applicationInterfaceImpl.txPreCrackData = async function () {
                    return { status: true, reason: '' };
                };
            }
            if (typeof application.getTimestampFromTransaction === 'function') {
                applicationInterfaceImpl.getTimestampFromTransaction = (inTx, appData) => application.getTimestampFromTransaction(inTx, appData);
            }
            else {
                throw new Error('Missing requried interface function.getTimestampFromTransaction()');
            }
            if (typeof application.calculateTxId === 'function') {
                applicationInterfaceImpl.calculateTxId = (inTx) => application.calculateTxId(inTx);
            }
            else {
                throw new Error('Missing requried interface function.calculateTxId()');
            }
            if (typeof application.apply === 'function') {
                applicationInterfaceImpl.apply = (inTx, wrappedStates, appData) => application.apply(inTx, wrappedStates, appData);
            }
            else {
                throw new Error('Missing required interface function. apply()');
            }
            if (typeof application.transactionReceiptPass === 'function') {
                applicationInterfaceImpl.transactionReceiptPass = async (tx, wrappedStates, applyResponse, isExecutionGroup) => application.transactionReceiptPass(tx, wrappedStates, applyResponse, isExecutionGroup);
            }
            else {
                applicationInterfaceImpl.transactionReceiptPass = async function (_tx, _wrappedStates, _applyResponse, _isExecutionGroup) { };
            }
            if (typeof application.transactionReceiptFail === 'function') {
                applicationInterfaceImpl.transactionReceiptFail = async (tx, wrappedStates, applyResponse) => application.transactionReceiptFail(tx, wrappedStates, applyResponse);
            }
            else {
                applicationInterfaceImpl.transactionReceiptFail = async function (_tx, _wrappedStates, _applyResponse) { };
            }
            if (typeof application.updateAccountFull === 'function') {
                applicationInterfaceImpl.updateAccountFull = async (wrappedStates, localCache, applyResponse) => {
                    await application.updateAccountFull(wrappedStates, localCache, applyResponse);
                };
            }
            else {
                throw new Error('Missing required interface function. updateAccountFull()');
            }
            if (typeof application.updateAccountPartial === 'function') {
                applicationInterfaceImpl.updateAccountPartial = async (wrappedStates, localCache, applyResponse) => application.updateAccountPartial(wrappedStates, localCache, applyResponse);
            }
            else {
                throw new Error('Missing required interface function. updateAccountPartial()');
            }
            if (typeof application.getRelevantData === 'function') {
                applicationInterfaceImpl.getRelevantData = async (accountId, tx, appData: any) => application.getRelevantData(accountId, tx, appData);
            }
            else {
                throw new Error('Missing required interface function. getRelevantData()');
            }
            if (typeof application.getStateId === 'function') {
                applicationInterfaceImpl.getStateId = async (accountAddress, mustExist) => application.getStateId(accountAddress, mustExist);
            }
            else {
            }
            if (typeof application.close === 'function') {
                applicationInterfaceImpl.close = async () => application.close();
            }
            else {
                throw new Error('Missing required interface function. close()');
            }
            if (typeof application.getAccountData === 'function') {
                applicationInterfaceImpl.getAccountData = async (accountStart, accountEnd, maxRecords) => {
                    const res = await application.getAccountData(accountStart, accountEnd, maxRecords);
                    return res;
                };
            }
            else {
                throw new Error('Missing required interface function. getAccountData()');
            }
            if (typeof application.getCachedRIAccountData === 'function') {
                applicationInterfaceImpl.getCachedRIAccountData = async (addressList: string[]) => {
                    const res = await application.getCachedRIAccountData(addressList);
                    return res;
                };
            }
            else {
                applicationInterfaceImpl.getCachedRIAccountData = async (_addressList: string[]) => {
                    return [];
                };
            }
            if (typeof application.setCachedRIAccountData === 'function') {
                applicationInterfaceImpl.setCachedRIAccountData = async (accountRecords: any[]) => {
                    await application.setCachedRIAccountData(accountRecords);
                };
            }
            else {
                applicationInterfaceImpl.setCachedRIAccountData = async (_accountRecords: any[]) => { };
            }
            if (typeof application.getAccountDataByRange === 'function') {
                applicationInterfaceImpl.getAccountDataByRange = async (accountStart, accountEnd, tsStart, tsEnd, maxRecords, offset, accountOffset) => {
                    const res = await application.getAccountDataByRange(accountStart, accountEnd, tsStart, tsEnd, maxRecords, offset, accountOffset);
                    return res;
                };
            }
            else {
                throw new Error('Missing required interface function. getAccountDataByRange()');
            }
            if (typeof application.calculateAccountHash === 'function') {
                applicationInterfaceImpl.calculateAccountHash = (account) => application.calculateAccountHash(account);
            }
            else {
                throw new Error('Missing required interface function. calculateAccountHash()');
            }
            if (typeof application.setAccountData === 'function') {
                applicationInterfaceImpl.setAccountData = async (accountRecords) => {
                    application.setAccountData(accountRecords);
                };
            }
            else {
                throw new Error('Missing required interface function. setAccountData()');
            }
            if (typeof application.deleteAccountData === 'function') {
                applicationInterfaceImpl.deleteAccountData = async (addressList) => application.deleteAccountData(addressList);
            }
            else {
                throw new Error('Missing required interface function. deleteAccountData()');
            }
            if (typeof application.getAccountDataByList === 'function') {
                applicationInterfaceImpl.getAccountDataByList = async (addressList) => {
                    const accData = await application.getAccountDataByList(addressList);
                    return accData;
                };
            }
            else {
                throw new Error('Missing required interface function. getAccountDataByList()');
            }
            if (typeof application.getNetworkAccount === 'function') {
                applicationInterfaceImpl.getNetworkAccount = () => application.getNetworkAccount();
            }
            else {
                applicationInterfaceImpl.getNetworkAccount = () => null;
            }
            if (typeof application.deleteLocalAccountData === 'function') {
                applicationInterfaceImpl.deleteLocalAccountData = async () => {
                    await application.deleteLocalAccountData();
                };
            }
            else {
                throw new Error('Missing required interface function. deleteLocalAccountData()');
            }
            if (typeof application.getAccountDebugValue === 'function') {
                applicationInterfaceImpl.getAccountDebugValue = (wrappedAccount) => application.getAccountDebugValue(wrappedAccount);
            }
            else {
                applicationInterfaceImpl.getAccountDebugValue = (_wrappedAccount) => 'getAccountDebugValue() missing on app';
            }
            if (typeof application.getSimpleTxDebugValue === 'function') {
                applicationInterfaceImpl.getSimpleTxDebugValue = (tx) => application.getSimpleTxDebugValue(tx);
            }
            else {
                applicationInterfaceImpl.getSimpleTxDebugValue = (_tx) => '';
            }
            if (typeof application.canDebugDropTx === 'function') {
                applicationInterfaceImpl.canDebugDropTx = (tx) => application.canDebugDropTx(tx);
            }
            else {
                applicationInterfaceImpl.canDebugDropTx = (_tx) => true;
            }
            if (typeof application.sync === 'function') {
                applicationInterfaceImpl.sync = async () => {
                    const res = await application.sync();
                    return res;
                };
            }
            else {
                const thisPtr = this;
                applicationInterfaceImpl.sync = async function () {
                };
            }
            if (typeof application.dataSummaryInit === 'function') {
                applicationInterfaceImpl.dataSummaryInit = async (blob, accountData) => application.dataSummaryInit(blob, accountData);
            }
            else {
                applicationInterfaceImpl.dataSummaryInit = async function (_blob, _accountData) { };
            }
            if (typeof application.dataSummaryUpdate === 'function') {
                applicationInterfaceImpl.dataSummaryUpdate = async (blob, accountDataBefore, accountDataAfter) => application.dataSummaryUpdate(blob, accountDataBefore, accountDataAfter);
            }
            else {
                applicationInterfaceImpl.dataSummaryUpdate = async function (_blob, _accountDataBefore, _accountDataAfter) { };
            }
            if (typeof application.txSummaryUpdate === 'function') {
                applicationInterfaceImpl.txSummaryUpdate = async (blob, tx, wrappedStates) => application.txSummaryUpdate(blob, tx, wrappedStates);
            }
            else {
                applicationInterfaceImpl.txSummaryUpdate = async function (_blob, _tx, _wrappedStates) { };
            }
            if (typeof application.getAccountTimestamp === 'function') {
                applicationInterfaceImpl.getAccountTimestamp = async (accountAddress, mustExist) => application.getAccountTimestamp(accountAddress, mustExist);
            }
            else {
                applicationInterfaceImpl.getAccountTimestamp = async function (_accountAddress, _mustExist) {
                    return 0;
                };
            }
            if (typeof application.getTimestampAndHashFromAccount === 'function') {
                applicationInterfaceImpl.getTimestampAndHashFromAccount = (account) => application.getTimestampAndHashFromAccount(account);
            }
            else {
                applicationInterfaceImpl.getTimestampAndHashFromAccount = function (_account) {
                    return {
                        timestamp: 0,
                        hash: 'getTimestampAndHashFromAccount not impl',
                    };
                };
            }
            if (typeof application.validateJoinRequest === 'function') {
                applicationInterfaceImpl.validateJoinRequest = (data, mode, latestCycle, minNodes) => application.validateJoinRequest(data, mode, latestCycle, minNodes);
            }
            if (typeof application.validateArchiverJoinRequest === 'function') {
                applicationInterfaceImpl.validateArchiverJoinRequest = (data) => application.validateArchiverJoinRequest(data);
            }
            if (typeof application.getJoinData === 'function') {
                applicationInterfaceImpl.getJoinData = () => application.getJoinData();
            }
            if (typeof application.eventNotify === 'function') {
                applicationInterfaceImpl.eventNotify = application.eventNotify;
            }
            if (typeof application.isReadyToJoin === 'function') {
                applicationInterfaceImpl.isReadyToJoin = async (latestCycle, publicKey, activeNodes, mode) => application.isReadyToJoin(latestCycle, publicKey, activeNodes, mode);
            }
            else {
                applicationInterfaceImpl.isReadyToJoin = async (_latestCycle, _publicKey, _activeNodes, _mode) => true;
            }
            if (typeof application.getNodeInfoAppData === 'function') {
                applicationInterfaceImpl.getNodeInfoAppData = () => application.getNodeInfoAppData();
            }
            else {
                applicationInterfaceImpl.getNodeInfoAppData = () => { };
            }
            if (typeof application.updateNetworkChangeQueue === 'function') {
                applicationInterfaceImpl.updateNetworkChangeQueue = async (account: ShardusTypes.WrappedData, appData: any) => application.updateNetworkChangeQueue(account, appData);
            }
            else {
                applicationInterfaceImpl.updateNetworkChangeQueue = async (_account, _appData) => [];
            }
            if (typeof application.pruneNetworkChangeQueue === 'function') {
                applicationInterfaceImpl.pruneNetworkChangeQueue = async (account: ShardusTypes.WrappedData, cycle: number) => application.pruneNetworkChangeQueue(account, cycle);
            }
            else {
                applicationInterfaceImpl.pruneNetworkChangeQueue = async (_account, _cycle) => [];
            }
            if (typeof application.canStayOnStandby === 'function') {
                applicationInterfaceImpl.canStayOnStandby = (joinInfo: JoinRequest) => application.canStayOnStandby(joinInfo);
            }
            if (typeof application.signAppData === 'function') {
                applicationInterfaceImpl.signAppData = async (type, hash, nodesToSign, appData): Promise<ShardusTypes.SignAppDataResult> => {
                    const res = await application.signAppData(type, hash, nodesToSign, appData);
                    return res;
                };
            }
            if (typeof application.beforeStateAccountFilter === 'function') {
                applicationInterfaceImpl.beforeStateAccountFilter = application.beforeStateAccountFilter;
            }
            if (typeof application.binarySerializeObject === 'function') {
                applicationInterfaceImpl.binarySerializeObject = (identifier: AppObjEnum, obj: any): Buffer => {
                    const res = application.binarySerializeObject(identifier, obj);
                    return res;
                };
            }
            else {
                applicationInterfaceImpl.binarySerializeObject = (_identifier: string, obj: any): Buffer => {
                    return Buffer.from(Utils.safeStringify(obj), 'utf8');
                };
            }
            if (typeof application.binaryDeserializeObject === 'function') {
                applicationInterfaceImpl.binaryDeserializeObject = (identifier: AppObjEnum, buffer: Buffer): any => {
                    const res = application.binaryDeserializeObject(identifier, buffer);
                    return res;
                };
            }
            else {
                applicationInterfaceImpl.binaryDeserializeObject = (_identifier: string, buffer: Buffer): any => {
                    return Utils.safeJsonParse(buffer.toString('utf8'));
                };
            }
            if (typeof application.getTxSenderAddress === 'function') {
                applicationInterfaceImpl.getTxSenderAddress = (tx) => application.getTxSenderAddress(tx);
            }
            if (typeof application.injectTxToConsensor === 'function') {
                applicationInterfaceImpl.injectTxToConsensor = (consensor, tx) => application.injectTxToConsensor(consensor, tx);
            }
            if (typeof application.getNonceFromTx === "function") {
                applicationInterfaceImpl.getNonceFromTx = (tx) => application.getNonceFromTx(tx);
            }
            if (typeof application.getAccountNonce === "function") {
                applicationInterfaceImpl.getAccountNonce = (accountId) => application.getAccountNonce(accountId);
            }
            if (typeof application.verifyMultiSigs === 'function') {
                applicationInterfaceImpl.verifyMultiSigs = (rawPayload, sigs, allowedPubkeys, minSigRequired, requiredSecurityLevel) => application.verifyMultiSigs(rawPayload, sigs, allowedPubkeys, minSigRequired, requiredSecurityLevel);
            }
            else {
                applicationInterfaceImpl.verifyMultiSigs = (_rawPayload, _sigs, _allowedPubkeys, _minSigRequired, _requiredSecurityLevel) => {
                    return true;
                };
            }
        }
        catch (ex) {
            this.shardus_fatal(`getAppInterface_ex`, `Required application interface not implemented. Exception: ${ex}`);
            this.fatalLogger.fatal('_getApplicationInterface: ' + ex.name + ': ' + ex.message + ' at ' + ex.stack);
            throw new Error(ex);
        }
        return applicationInterfaceImpl as ShardusTypes.App;
    }
    _registerRoutes() {
        this.network.registerExternalPost('exit', isDebugModeMiddlewareHigh, async (_req, res) => {
            res.json({ success: true });
            await this.shutdown();
        });
        this.network.registerExternalPost('exit-apop', isDebugModeMiddlewareHigh, async (_req, res) => {
            apoptosizeSelf('Apoptosis called at exit-apop route');
            res.json({ success: true });
        });
        this.network.registerExternalGet('config', isDebugModeMiddlewareLow, async (_req, res) => {
            res.json({ config: this.config });
        });
        this.network.registerExternalGet('netconfig', async (_req, res) => {
            res.json({ config: netConfig });
        });
        this.network.registerExternalGet('nodeInfo', async (req, res) => {
            let reportIntermediateStatus = req.query.reportIntermediateStatus === 'true';
            const nodeInfo = Self.getPublicNodeInfo(reportIntermediateStatus);
            const appData = this.app.getNodeInfoAppData();
            let result = { nodeInfo: { ...nodeInfo, appData } } as any;
            if (isDebugMode() && req.query.debug === 'true') {
                result.debug = {
                    queriedWhen: new Date().toISOString(),
                    startedWhen: new Date(Date.now() - process.uptime() * 1000).toISOString(),
                    uptimeMins: Math.round((100 * process.uptime()) / 60) / 100,
                    pid: process.pid,
                    currentQuarter: CycleCreator.currentQuarter,
                    currentCycleMarker: CycleChain.getCurrentCycleMarker() ?? null,
                    newestCycle: CycleChain.getNewest() ?? null,
                    lostArchiversMap: lostArchiversMap,
                };
            }
            res.json(result);
        });
        this.network.registerExternalGet('joinInfo', isDebugModeMiddlewareMedium, async (_req, res) => {
            const nodeInfo = Self.getPublicNodeInfo(true);
            let result = {
                respondedWhen: new Date().toISOString(),
                startedWhen: new Date(Date.now() - process.uptime() * 1000).toISOString(),
                uptimeMins: Math.round((100 * process.uptime()) / 60) / 100,
                pid: process.pid,
                publicKey: nodeInfo.publicKey,
                id: nodeInfo.id,
                status: nodeInfo.status,
                currentQuarter: CycleCreator.currentQuarter,
                currentCycleMarker: CycleChain.getCurrentCycleMarker() ?? null,
                previousCycleMarker: CycleChain.getNewest()?.previous,
                getStandbyListHash: JoinV2.getStandbyListHash(),
                getLastHashedStandbyList: JoinV2.getLastHashedStandbyList(),
                getSortedStandbyNodeList: JoinV2.getSortedStandbyJoinRequests(),
            };
            res.json(deepReplace(result, undefined, '__undefined__'));
        });
        this.network.registerExternalGet('standby-list-debug', isDebugModeMiddlewareLow, async (_req, res) => {
            let getSortedStandbyNodeList = JoinV2.getSortedStandbyJoinRequests();
            let result = getSortedStandbyNodeList.map((node) => ({
                pubKey: node.nodeInfo.publicKey,
                ip: node.nodeInfo.externalIp,
                port: node.nodeInfo.externalPort,
            }));
            res.json(result);
        });
        this.network.registerExternalGet('status-history', isDebugModeMiddlewareLow, async (_req, res) => {
            let result = Self.getStatusHistoryCopy();
            res.json(deepReplace(result, undefined, '__undefined__'));
        });
        this.network.registerExternalGet('socketReport', isDebugModeMiddlewareLow, async (_req, res) => {
            res.json(await getSocketReport());
        });
        this.network.registerExternalGet('forceCycleSync', isDebugModeMiddleware, async (req, res) => {
            let enable = req.query.enable === 'true' || false;
            config.p2p.hackForceCycleSyncComplete = enable;
            res.json(await getSocketReport());
        });
        this.network.registerExternalGet('calculate-fake-time-offset', isDebugModeMiddlewareHigh, async (req, res) => {
            const shift = req.query.shift ? parseInt(req.query.shift as string) : 0;
            const spread = req.query.spread ? parseInt(req.query.spread as string) : 0;
            const offset = calculateFakeTimeOffset(shift, spread);
            res.json({ success: true });
        });
        this.network.registerExternalGet('clear-fake-time-offset', isDebugModeMiddlewareHigh, async (_req, res) => {
            const offset = clearFakeTimeOffset();
            res.json({ success: true });
        });
        const signAppDataBinaryHandler: Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_sign_app_data,
            handler: async (payload, respond, header, _sign) => {
                const route = InternalRouteEnum.binary_sign_app_data;
                const errorHandler = (errorType: RequestErrorEnum, opts?: {
                    customErrorLog?: string;
                    customCounterSuffix?: string;
                }): void => requestErrorHandler(route, errorType, header, opts);
                try {
                    const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cSignAppDataReq);
                    if (!requestStream) {
                        errorHandler(RequestErrorEnum.InvalidRequest);
                        respond({ success: false, signature: { owner: '', sig: '' } }, serializeSignAppDataResp);
                        return;
                    }
                    const request: SignAppDataReq = deserializeSignAppDataReq(requestStream);
                    const { type, nodesToSign, hash, appData } = request;
                    const { success, signature } = await this.app.signAppData?.(type, hash, Number(nodesToSign), appData);
                    const response = { success: success, signature: signature } as SignAppDataResp;
                    respond(response, serializeSignAppDataResp);
                }
                catch (err) {
                    if (logFlags.error)
                        this.mainLogger.error(`${route}: Exception executing request: ${utils.errorToStringFull(err)}`);
                    respond({ success: false, signature: { owner: '', sig: '' } }, serializeSignAppDataResp);
                }
                finally {
                }
            },
        };
        this.p2p.registerInternalBinary(signAppDataBinaryHandler.name, signAppDataBinaryHandler.handler);
        this.network.registerExternalPost('testGlobalAccountTX', isDebugModeMiddleware, async (req, res) => {
            try {
                const tx = req.body.tx;
                this.put(tx, false, true);
                res.json({ success: true });
            }
            catch (ex) {
                this.shardus_fatal(`registerExternalPost_ex`, 'testGlobalAccountTX:' + ex.name + ': ' + ex.message + ' at ' + ex.stack);
            }
        });
        this.network.registerExternalPost('testGlobalAccountTXSet', isDebugModeMiddleware, async (req, res) => {
            try {
                const tx = req.body.tx;
                this.put(tx, true, true);
                res.json({ success: true });
            }
            catch (ex) {
                this.shardus_fatal(`registerExternalPost2_ex`, 'testGlobalAccountTXSet:' + ex.name + ': ' + ex.message + ' at ' + ex.stack);
            }
        });
    }
    registerExceptionHandler() {
        const logFatalAndExit = (err) => {
            this.shardus_fatal(`unhandledRejection_ex_` + err.stack.substring(0, 100), 'unhandledRejection: ' + err.stack);
            if (config.p2p.continueOnException === true) {
                const activeNodes = activeByIdOrder;
                const minNodesToExit = config.p2p.baselineNodes * config.p2p.minNodesPerctToAllowExitOnException;
                if (activeNodes.length < minNodesToExit) {
                    const msg = `Not enough active nodes to exit on exception. Active nodes: ${activeNodes.length}, minNodesToExit: ${minNodesToExit}, baselineNodes: ${config.p2p.baselineNodes}, minNodesPerctToAllowExitOnException: ${config.p2p.minNodesPerctToAllowExitOnException}`;
                    this.mainLogger.warn(msg);
                    return;
                }
            }
            this.exitHandler.exitUncleanly('Unhandled Exception', err.message);
        };
        process.on('uncaughtException', (err) => {
            logFatalAndExit(err);
        });
        process.on('unhandledRejection', (err) => {
            logFatalAndExit(err);
        });
    }
    async updateConfigChangeQueue(account: ShardusTypes.WrappedData, lastCycle: ShardusTypes.Cycle) {
        if (account == null || lastCycle == null)
            return;
        // @ts-ignore
        let changes = account.data.listOfChanges as {
            cycle: number;
            change: any;
            appData: any;
        }[];
        if (!changes || !Array.isArray(changes)) {
            return;
        }
        const activeConfigChanges = new Set<string>();
        for (let change of changes) {
            if (change.cycle > lastCycle.counter) {
                continue;
            }
            const changeHash = this.crypto.hash(change);
            if (this.appliedConfigChanges.has(changeHash)) {
                activeConfigChanges.add(changeHash);
                continue;
            }
            this.appliedConfigChanges.add(changeHash);
            activeConfigChanges.add(changeHash);
            let changeObj = change.change;
            let appData = change.appData;
            if (changeObj['p2p'] && changeObj['p2p']['initShutdown'] && change.cycle !== lastCycle.counter)
                continue;
            this.patchObject(this.config, changeObj, appData);
            const prunedData: WrappedData[] = await this.app.pruneNetworkChangeQueue(account, lastCycle.counter);
            await this.stateManager.checkAndSetAccountData(prunedData, 'global network account update', true);
            if (appData) {
                const data: WrappedData[] = await this.app.updateNetworkChangeQueue(account, appData);
                await this.stateManager.checkAndSetAccountData(data, 'global network account update', true);
            }
            this.p2p.configUpdated();
            this.loadDetection.configUpdated();
            this.rateLimiting.configUpdated();
        }
        if (activeConfigChanges.size > 0) {
            for (let changeHash of this.appliedConfigChanges) {
                if (!activeConfigChanges.has(changeHash)) {
                    this.appliedConfigChanges.delete(changeHash);
                }
            }
        }
    }
    patchObject(existingObject: any, changeObj: any, appData: any) {
        for (const [key, value] of Object.entries(changeObj)) {
            if (existingObject[key] != null) {
                if (key === 'devPublicKeys' || key === 'multisigKeys') {
                    existingObject[key] = value;
                }
                else if (typeof value === 'object') {
                    this.patchObject(existingObject[key], value, appData);
                }
                else {
                    existingObject[key] = value;
                }
            }
        }
    }
    updateDebug(lastCycle: ShardusTypes.Cycle) {
        if (lastCycle == null)
            return;
        let countEndpointStart = this.config?.debug?.countEndpointStart;
        let countEndpointStop = this.config?.debug?.countEndpointStop;
        if (countEndpointStart == null || countEndpointStart < 0) {
            return;
        }
        if (countEndpointStart === lastCycle.counter) {
            profilerInstance.clearScopedTimes();
            if (countEndpointStop === -1 || countEndpointStop <= countEndpointStart || countEndpointStop == null) {
                this.config.debug.countEndpointStop = countEndpointStart + 2;
            }
        }
        if (countEndpointStop === lastCycle.counter && countEndpointStop != null) {
            let scopedReport = profilerInstance.scopedTimesDataReport();
            scopedReport.cycle = lastCycle.counter;
            scopedReport.node = `${Self.ip}:${Self.port}`;
            scopedReport.id = utils.makeShortHash(Self.id);
        }
    }
    setGlobal(address, addressHash, value, when, source) {
        GlobalAccounts.setGlobal(address, addressHash, value, when, source);
    }
    getDebugModeMiddleware() {
        return isDebugModeMiddleware;
    }
    getDebugModeMiddlewareLow() {
        return isDebugModeMiddlewareLow;
    }
    getDebugModeMiddlewareMedium() {
        return isDebugModeMiddlewareMedium;
    }
    getDebugModeMiddlewareHigh() {
        return isDebugModeMiddlewareHigh;
    }
    getDebugModeMiddlewareMultiSig() {
        return isDebugModeMiddlewareMultiSig;
    }
    shardus_fatal(key, log, log2 = null) {
        if (log2 != null) {
            this.fatalLogger.fatal(log, log2);
        }
        else {
            this.fatalLogger.fatal(log);
        }
    }
    monitorEvent(category: string, name: string, count: number, message: string) {
        if (logFlags.verbose) {
        }
    }
    setMemoryLimit(topic: string, cacheCountLimit: number) {
        this.stateManager.cachedAppDataManager.setMemoryLimit(topic, cacheCountLimit);
    }
    async getAppDataSignatures(type: string, hash: string, nodesToSign: number, appData: any, allowedBackupNodes: number = 0): Promise<ShardusTypes.GetAppDataSignaturesResult> {
        const closestNodesIds = this.getClosestNodes(hash, nodesToSign + allowedBackupNodes);
        const filterNodeIds = closestNodesIds.filter((id) => id !== Self.id);
        const closestNodes = filterNodeIds.map((nodeId) => this.p2p.state.getNode(nodeId));
        let responses = [];
        if (filterNodeIds.length > 0) {
            const groupPromiseResp = await groupResolvePromises(closestNodes.map((node) => {
                const request: SignAppDataReq = {
                    type,
                    hash,
                    nodesToSign,
                    appData,
                };
                return this.p2p.askBinary<SignAppDataReq, SignAppDataResp>(node, InternalRouteEnum.binary_sign_app_data, request, serializeSignAppDataReq, deserializeSignAppDataResp, {});
            }), (res) => {
                if (res.success)
                    return true;
                return false;
            }, allowedBackupNodes, Math.min(nodesToSign, filterNodeIds.length));
            if (groupPromiseResp.success)
                responses = groupPromiseResp.wins;
            else
                return {
                    success: groupPromiseResp.success,
                    signatures: [],
                };
        }
        if (closestNodesIds.includes(Self.id)) {
            const { success, signature } = await this.app.signAppData?.(type, hash, Number(nodesToSign), appData);
            responses = [...responses, ...[{ success, signature }]];
        }
        const signatures = responses.map(({ signature }) => signature);
        return {
            success: true,
            signatures: signatures,
        };
    }
    isOnStandbyList(publicKey: string): boolean {
        return JoinV2.isOnStandbyList(publicKey);
    }
}
function deepReplace(obj: object | ArrayLike<any>, find: any, replace: any): any {
    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            if (obj[i] === find) {
                obj[i] = replace;
            }
            else if (typeof obj[i] === 'object' && obj[i] !== null) {
                deepReplace(obj[i], find, replace);
            }
        }
    }
    else if (typeof obj === 'object' && obj !== null) {
        for (const key in obj) {
            if (obj[key] === find) {
                obj[key] = replace;
            }
            else if (typeof obj[key] === 'object' && obj[key] !== null) {
                deepReplace(obj[key], find, replace);
            }
        }
    }
    return obj;
}
export default Shardus;
export * as ShardusTypes from '../shardus/shardus-types';