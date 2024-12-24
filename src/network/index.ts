import Sntp from '@hapi/sntp';
import { Sn } from '@shardus/net';
import { AppHeader } from '@shardus/net/build/src/types';
import bodyParser from 'body-parser';
import cors from 'cors';
import { EventEmitter } from 'events';
import express, { Application, Handler } from 'express';
import Log4js from 'log4js';
import * as net from 'net';
import { promisify } from 'util';
import { isDebugMode } from '../debug';
import * as httpModule from '../http';
import Logger, { logFlags } from '../logger';
import { config, defaultConfigs, logger } from '../p2p/Context';
import { generateUUID } from '../p2p/Utils';
import * as Shardus from '../shardus/shardus-types';
import * as utils from '../utils';
import { formatErrorMessage } from '../utils';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { profilerInstance } from '../utils/profiler';
import NatAPI = require('nat-api');
import { Utils } from '@shardus/types';
export interface IPInfo {
    internalPort: number;
    internalIp: string;
    externalPort: number;
    externalIp: string;
}
let mainLogger: Log4js.Logger;
let natClient: any;
export let ipInfo: IPInfo;
let ntpOffsetMs: number = 0;
let fakeTimeOffsetMs: number = 0;
let lastNTPTimeObj = {};
export class NetworkClass extends EventEmitter {
    app: Application;
    io: SocketIO.Server;
    sn: any;
    logger: Logger;
    mainLogger: Log4js.Logger;
    netLogger: Log4js.Logger;
    timeout: number;
    internalRoutes: {};
    externalRoutes: Array<(app: Application) => void>;
    extServer: any;
    intServer: any;
    verboseLogsNet: boolean;
    InternalTellCounter: number;
    InternalAskCounter: number;
    ipInfo: any;
    signingSecretKeyHex: string;
    shardusCryptoHashKey: string;
    externalCatchAll: any;
    debugNetworkDelay: number;
    statisticsInstance: any;
    useLruCacheForSocketMgmt: boolean;
    lruCacheSizeForSocketMgmt: number;
    payloadSizeLimitInBytes: number;
    headerSizeLimitInBytes: number;
    constructor(config: Shardus.StrictServerConfiguration, logger: Logger) {
        super();
        this.app = express();
        this.sn = null;
        this.logger = logger;
        this.mainLogger = logger.getLogger('main');
        this.netLogger = logger.getLogger('net');
        this.timeout = config.network.timeout * 1000;
        this.internalRoutes = {};
        this.externalRoutes = [];
        this.extServer = null;
        this.intServer = null;
        this.InternalTellCounter = 1;
        this.InternalAskCounter = 1;
        this.debugNetworkDelay = 0;
        this.statisticsInstance = null;
        ntpOffsetMs = 0;
        fakeTimeOffsetMs = 0;
        if (config && config.debug && config.debug.fakeNetworkDelay) {
            this.debugNetworkDelay = config.debug.fakeNetworkDelay;
        }
        this.useLruCacheForSocketMgmt = config.p2p.useLruCacheForSocketMgmt;
        this.lruCacheSizeForSocketMgmt = config.p2p.lruCacheSizeForSocketMgmt;
        this.shardusCryptoHashKey = config.crypto.hashKey;
        this.payloadSizeLimitInBytes = config.p2p.payloadSizeLimitInBytes;
        this.headerSizeLimitInBytes = config.p2p.headerSizeLimitInBytes;
    }
    setDebugNetworkDelay(delay: number) {
        this.debugNetworkDelay = delay;
    }
    setStatisticsInstance(statistics) {
        this.statisticsInstance = statistics;
    }
    customSendJsonMiddleware(req, res, next) {
        const originalSend = res.send;
        res.send = function (data) {
            if (typeof data === 'object' && data !== null) {
                const jsonString = Utils.safeStringify(data);
                res.setHeader('Content-Type', 'application/json');
                return originalSend.call(this, jsonString);
            }
            return originalSend.call(this, data);
        };
        res.json = function (data) {
            const jsonString = Utils.safeStringify(data);
            res.setHeader('Content-Type', 'application/json');
            return originalSend.call(this, jsonString);
        };
        next();
    }
    _setupExternal() {
        return new Promise((resolve, reject) => {
            const self = this;
            const storeRequests = function (req, res, next) {
                if (req.url !== '/test') {
                    if (self.verboseLogsNet) {
                    }
                }
                next();
            };
            this.app.use(bodyParser.json({ limit: '50mb', reviver: Utils.typeReviver }));
            this.app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
            this.app.use(cors());
            this.app.use(this.customSendJsonMiddleware);
            this.app.use(storeRequests);
            this._applyExternal();
            this.app.use((err, req, res, next) => {
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: isDebugMode() ? err.message : 'An unexpected error occurred',
                });
            });
            this.extServer = this.app.listen(this.ipInfo.externalPort, () => {
                const msg = `External server running on port ${this.ipInfo.externalPort}...`;
            });
            this.extServer.setTimeout(config.network.timeout * 1000);
            this.io = require('socket.io')(this.extServer);
            resolve(this.io);
        });
    }
    async _setupInternal() {
        this.sn = Sn({
            port: this.ipInfo.internalPort,
            senderOpts: {
                useLruCache: this.useLruCacheForSocketMgmt,
                lruSize: this.lruCacheSizeForSocketMgmt,
            },
            headerOpts: {
                sendHeaderVersion: 1,
            },
            customStringifier: Utils.safeStringify,
            customJsonParser: Utils.safeJsonParse,
            crypto: {
                hashKey: this.shardusCryptoHashKey,
                signingSecretKeyHex: this.signingSecretKeyHex,
            },
            payloadOpts: {
                payloadSizeLimitInBytes: this.payloadSizeLimitInBytes,
                headerSizeLimitInBytes: this.headerSizeLimitInBytes,
            },
        });
        this.intServer = await this.sn.listen(async (data, remote, respond, header, sign) => {
            let routeName;
            try {
                if (!data)
                    throw new Error('No data provided in request...');
                const { route, payload } = data;
                routeName = route;
                if (!route && payload) {
                    return;
                }
                if (!route && data.error) {
                    return;
                }
                if (!route) {
                    throw new Error('Unable to read request, no route specified.');
                }
                if (!this.internalRoutes[route])
                    throw new Error('Unable to handle request, invalid route.');
                if (this.debugNetworkDelay > 0) {
                    await utils.sleep(this.debugNetworkDelay);
                }
                const handler = this.internalRoutes[route];
                if (!payload) {
                    await handler(null, respond, header, sign);
                    return;
                }
                await handler(payload, respond, header, sign);
                if (logFlags.net_trace) {
                }
            }
            catch (err) {
                if (logFlags.error)
                    this.mainLogger.error('Network: _setupInternal: ', err);
                if (logFlags.error)
                    this.mainLogger.error('DBG', 'Network: _setupInternal > sn.listen > callback > data', data);
                if (logFlags.error)
                    this.mainLogger.error('DBG', 'Network: _setupInternal > sn.listen > callback > remote', remote);
            }
            finally {
            }
        });
        this.sn.setLogFlags(logFlags);
    }
    async tell(nodes: Shardus.Node[], route: string, message, alreadyLogged = false, subRoute = '') {
        const data = { route, payload: message };
        const promises = [];
        let id = '';
        if (message.tracker) {
            id = message.tracker;
        }
        if (!nodes || nodes.length == 0) {
            return;
        }
        for (const node of nodes) {
            const requestId = generateUUID();
            this.InternalTellCounter++;
            const promise = this.sn.send(node.internalPort, node.internalIp, data);
            promise.catch((err) => {
                if (logFlags.error)
                    this.mainLogger.error(`Network error (tell) on ${route} ${subRoute}: ${formatErrorMessage(err)}`);
                let errorGroup = ('' + err).slice(0, 20);
                this.emit('error', node, requestId, 'tell', errorGroup, route, subRoute);
            });
            promises.push(promise);
        }
        try {
            await Promise.all(promises);
        }
        catch (err) {
            if (logFlags.error)
                this.mainLogger.error(`Network error (tell-err) on ${route} ${subRoute}: ${formatErrorMessage(err)}`);
        }
    }
    async tellBinary(nodes: Shardus.Node[] | Shardus.NodeWithRank[], route: string, message: Buffer, appHeader: AppHeader, trackerId: string, alreadyLogged = false) {
        const data = { route, payload: message };
        const promises = [];
        if (!nodes || nodes.length == 0) {
            return;
        }
        if (config.p2p.useCombinedTellBinary) {
            const ports = [];
            const addresses = [];
            const requestId = generateUUID();
            for (const node of nodes) {
                this.InternalTellCounter++;
                ports.push(node.internalPort);
                addresses.push(node.internalIp);
            }
            try {
                await this.sn.multiSendWithHeader(ports, addresses, data, appHeader);
            }
            catch (err) {
                let errorGroup = ('' + err).slice(0, 20);
                if (logFlags.error)
                    this.mainLogger.error(`Network error (tellBinary) on ${route}: ${formatErrorMessage(err)}`);
            }
        }
        else {
            for (const node of nodes) {
                const requestId = generateUUID();
                this.InternalTellCounter++;
                const promise = this.sn.sendWithHeader(node.internalPort, node.internalIp, data, appHeader);
                promise.catch((err) => {
                    if (logFlags.error)
                        this.mainLogger.error(`Network error (tellBinary) on ${route}: ${formatErrorMessage(err)}`);
                    let errorGroup = ('' + err).slice(0, 20);
                    this.emit('error', node, requestId, 'tellBinary', errorGroup, route);
                });
                promises.push(promise);
            }
            try {
                await Promise.all(promises);
            }
            catch (err) {
                if (logFlags.error)
                    this.mainLogger.error(`Network error (tellBinary-promise) on ${route}: ${formatErrorMessage(err)}`);
            }
        }
    }
    ask(node, route, message, alreadyLogged = false, extraTime = 0) {
        return new Promise(async (resolve, reject) => {
            this.InternalAskCounter++;
            let id = '';
            if (message.tracker) {
                id = message.tracker;
            }
            const requestId = generateUUID();
            try {
                if (this.debugNetworkDelay > 0) {
                    await utils.sleep(this.debugNetworkDelay);
                }
                const data = { route, payload: message };
                const onRes = (res) => {
                    resolve(res);
                };
                const onTimeout = () => {
                    if (this.statisticsInstance)
                        this.statisticsInstance.incrementCounter('networkTimeout');
                    const err = new Error(`Request timed out. ${utils.stringifyReduce(id)}`);
                    if (logFlags.error)
                        this.mainLogger.error(`Network timeout (ask) on ${route}: ${formatErrorMessage(err)}`);
                    this.emit('timeout', node, requestId, 'ask');
                    reject(err);
                };
                try {
                    await this.sn.send(node.internalPort, node.internalIp, data, this.timeout + extraTime, onRes, onTimeout);
                }
                catch (err) {
                    if (logFlags.error)
                        this.mainLogger.error(`Network error (ask-err) on ${route}: ${formatErrorMessage(err)}`);
                    let errorGroup = ('' + err).slice(0, 20);
                    this.emit('error', node, requestId, 'ask', errorGroup, route, '');
                }
            }
            finally {
            }
        });
    }
    askBinary(node, route: string, message: Buffer, appHeader: AppHeader, trackerId: string, alreadyLogged = false, extraTime = 0) {
        return new Promise<{
            res: Buffer;
            header?: AppHeader;
            sign?: Shardus.Sign;
        }>(async (resolve, reject) => {
            this.InternalAskCounter++;
            const requestId = generateUUID();
            try {
                if (this.debugNetworkDelay > 0) {
                    await utils.sleep(this.debugNetworkDelay);
                }
                const data = { route, payload: message };
                const onRes = (res, header, sign) => {
                    resolve({ res, header, sign });
                };
                const onTimeout = () => {
                    if (this.statisticsInstance)
                        this.statisticsInstance.incrementCounter('networkTimeout');
                    const err = new Error(`askBinary: request timed out. ${utils.stringifyReduce(trackerId)}`);
                    if (logFlags.error)
                        this.mainLogger.error(`Network timeout (askBinary) on ${route}: ${formatErrorMessage(err)} node: ${utils.logNode(node)}`);
                    this.emit('timeout', node, requestId, 'askBinary');
                    reject(err);
                };
                try {
                    await this.sn.sendWithHeader(node.internalPort, node.internalIp, data, appHeader, this.timeout + extraTime, onRes, onTimeout);
                }
                catch (err) {
                    if (logFlags.error)
                        this.mainLogger.error(`Network error (askBinary) on ${route}: ${formatErrorMessage(err)}`);
                    let errorGroup = ('' + err).slice(0, 20);
                    this.emit('error', node, requestId, 'ask', errorGroup, route, '');
                }
            }
            finally {
            }
        });
    }
    evictCachedSockets(nodes: Shardus.Node[]) {
        if (!this.sn)
            return;
        for (const node of nodes) {
            try {
                this.sn.evictSocket(node.internalPort, node.internalIp);
            }
            catch (err) {
                if (logFlags.error)
                    this.mainLogger.error(`Error evicting socket for node ${node.id}: ${err}, (ip: ${node.internalIp}, port: ${node.internalPort})`);
            }
            finally {
            }
        }
    }
    async setup(ipInfo: IPInfo, signingSecretKeyHex: string) {
        if (!ipInfo.externalIp)
            throw new Error('Fatal: network module requires externalIp');
        if (!ipInfo.externalPort)
            throw new Error('Fatal: network module requires externalPort');
        if (!ipInfo.internalIp)
            throw new Error('Fatal: network module requires internalIp');
        if (!ipInfo.internalPort)
            throw new Error('Fatal: network module requires internalPort');
        this.ipInfo = ipInfo;
        this.signingSecretKeyHex = signingSecretKeyHex;
        this.logger.setPlaybackIPInfo(ipInfo);
        this._setupInternal();
        return await this._setupExternal();
    }
    async shutdown() {
        try {
            const promises = [];
            if (this.extServer)
                promises.push(closeServer(this.extServer));
            if (natClient)
                promises.push(natClient.es6.destroy());
            await Promise.all(promises);
        }
        catch (e) {
            if (e.code !== 'ERR_SERVER_NOT_RUNNING')
                throw e;
        }
    }
    _registerExternal(method: string, route: string, responseHandler: Handler);
    _registerExternal(method: string, route: string, authHandler: Handler, responseHandler: Handler);
    _registerExternal(method: string, route: string, authHandler: Handler, responseHandler?: Handler) {
        const formattedRoute = `/${route}`;
        const handlers = [];
        if (!responseHandler) {
            responseHandler = authHandler;
            authHandler = null;
        }
        if (logFlags.playback) {
            const playbackHandler = (req, res, next) => {
                next();
            };
            handlers.push(playbackHandler);
        }
        if (authHandler) {
            handlers.push(authHandler);
        }
        const wrappedHandler = async (req, res, next) => {
            let result;
            try {
                if (isDebugMode() && ['GET', 'POST'].includes(method)) {
                }
                result = await responseHandler(req, res, next);
            }
            catch (error) {
                if (logFlags.error)
                    this.mainLogger.error(`Error in route ${route}: ${error.message}`);
                next(error);
            }
            finally {
                if (isDebugMode() && ['GET', 'POST'].includes(method)) {
                }
            }
            return result;
        };
        handlers.push(wrappedHandler);
        let expressMethod = {
            GET: 'get',
            POST: 'post',
            PUT: 'put',
            DELETE: 'delete',
            PATCH: 'patch',
        }[method];
        if (!expressMethod) {
            throw new Error(`Fatal: Invalid HTTP method for handler ${method}.`);
        }
        this.externalRoutes.push((app) => {
            app[expressMethod](formattedRoute, handlers);
        });
        if (this.extServer && this.extServer.listening) {
            this._applyExternal();
        }
    }
    _applyExternal() {
        while (this.externalRoutes.length > 0) {
            const routeFn = this.externalRoutes.pop();
            routeFn(this.app);
        }
    }
    setExternalCatchAll(handler) {
        this.externalCatchAll = handler;
    }
    registerExternalGet(route: string, responseHandler: Handler);
    registerExternalGet(route: string, authHandler: Handler, responseHandler: Handler);
    registerExternalGet(route: string, authHandler: Handler, responseHandler?: Handler) {
        this._registerExternal('GET', route, authHandler, responseHandler);
    }
    registerExternalPost(route: string, responseHandler: Handler);
    registerExternalPost(route: string, authHandler: Handler, responseHandler: Handler);
    registerExternalPost(route: string, authHandler: Handler, responseHandler?: Handler) {
        this._registerExternal('POST', route, authHandler, responseHandler);
    }
    registerExternalPut(route: string, responseHandler: Handler);
    registerExternalPut(route: string, authHandler: Handler, responseHandler: Handler);
    registerExternalPut(route: string, authHandler: Handler, responseHandler?: Handler) {
        this._registerExternal('PUT', route, authHandler, responseHandler);
    }
    registerExternalDelete(route: string, responseHandler: Handler);
    registerExternalDelete(route: string, authHandler: Handler, responseHandler: Handler);
    registerExternalDelete(route: string, authHandler: Handler, responseHandler?: Handler) {
        this._registerExternal('DELETE', route, authHandler, responseHandler);
    }
    registerExternalPatch(route: string, responseHandler: Handler);
    registerExternalPatch(route: string, authHandler: Handler, responseHandler: Handler);
    registerExternalPatch(route: string, authHandler: Handler, responseHandler?: Handler) {
        this._registerExternal('PATCH', route, authHandler, responseHandler);
    }
    registerInternal(route: string, handler) {
        if (this.internalRoutes[route])
            throw Error('Handler already exists for specified internal route.');
        this.internalRoutes[route] = handler;
    }
    unregisterInternal(route) {
        if (this.internalRoutes[route]) {
            delete this.internalRoutes[route];
        }
    }
}
export async function init() {
    mainLogger = logger.getLogger('main');
    const defaults = defaultConfigs['server']['ip'] as IPInfo;
    const externalIp = (config.ip.externalIp === 'auto' ? await getExternalIp() : config.ip.externalIp) || defaults['externalIp'];
    const externalPort = (config.ip.externalPort === 'auto' ? await getNextExternalPort(externalIp) : config.ip.externalPort) ||
        defaults['externalPort'];
    const internalIp = (config.ip.internalIp === 'auto' ? externalIp : config.ip.internalIp) || defaults['internalIp'];
    const internalPort = (config.ip.internalPort === 'auto' ? await getNextExternalPort(internalIp) : config.ip.internalPort) ||
        defaults['internalPort'];
    ipInfo = {
        externalIp,
        externalPort,
        internalIp,
        internalPort,
    };
    if (logFlags.info) {
    }
}
function initNatClient() {
    if (!natClient) {
        natClient = new NatAPI();
        natClient['es6'] = {};
        natClient['es6']['externalIp'] = promisify(natClient.externalIp.bind(natClient));
        natClient['es6']['map'] = promisify(natClient.map.bind(natClient));
        natClient['es6']['destroy'] = promisify(natClient.destroy.bind(natClient));
    }
}
async function getExternalIp() {
    initNatClient();
    try {
        const ip = await natClient.es6.externalIp();
        return ip;
    }
    catch (err) {
        mainLogger.warn('Failed to get external IP from gateway:', err.message ? err.message : err);
        try {
            const ip = await discoverExternalIp(config.p2p.ipServers);
            return ip;
        }
        catch (err) {
            mainLogger.warn('Failed to get external IP from IP server:', err.message ? err.message : err);
        }
    }
}
async function getNextExternalPort(ip: string) {
    initNatClient();
    let [reachable, port] = await wrapTest(new ConnectTest(ip));
    if (reachable === false) {
        const attempts = [{ enablePMP: false }, { enablePMP: true }];
        for (const opts of attempts) {
            try {
                await natClient.es6.map(Object.assign({ publicPort: port, privatePort: port, protocol: 'TCP' }, opts));
                break;
            }
            catch (err) {
            }
        }
    }
    ;
    [reachable] = await wrapTest(new ConnectTest(ip, port));
    if (reachable) {
        return port;
    }
    else {
        mainLogger.warn('Failed to get next external port');
    }
}
async function wrapTest(test: ConnectTest) {
    test.once('port', (port) => {
    });
    let result: [
        boolean,
        number
    ];
    try {
        const success = await test.start();
        result = [success, test.port];
    }
    catch (err) {
        result = [false, test.port];
    }
    return result;
}
class ConnectTest extends EventEmitter {
    ip: string;
    port: number;
    constructor(ip: string, port?: number) {
        super();
        this.ip = ip;
        this.port = port || -1;
    }
    start() {
        return new Promise<true>((resolve, reject) => {
            const server = net.createServer(() => { });
            server.unref();
            server.on('error', reject);
            const listenPort = this.port > -1 ? this.port : 0;
            server.listen(listenPort, () => {
                const address = server.address() as net.AddressInfo;
                this.port = address.port;
                this.emit('port', this.port);
                const socket = net.createConnection(this.port, this.ip, () => {
                    socket.destroy();
                    server.close(() => resolve(true));
                });
                socket.unref();
                socket.setTimeout(2000);
                socket.on('error', (err) => {
                    socket.destroy();
                    server.close();
                    reject(err);
                });
                socket.on('timeout', () => {
                    socket.destroy();
                    server.close();
                    reject('Connection timed out');
                });
            });
        });
    }
}
export async function checkAndUpdateTimeSyncedOffset(timeServers) {
    if (config.debug.ignoreTimeCheck === true)
        return true;
    const syncLimitMs = config.p2p.syncLimit * 1000;
    for (const host of timeServers) {
        try {
            const time = await Sntp.time({
                host,
                timeout: 10000,
            });
            ntpOffsetMs = Math.floor(time.t);
            if (config.debug.debugNTPBogusDecrements)
                ntpOffsetMs -= 3 * syncLimitMs;
            const isInRange = Math.abs(ntpOffsetMs) <= syncLimitMs;
            lastNTPTimeObj = time;
            if (isNaN(ntpOffsetMs)) {
                mainLogger.warn(`NTP Error time.t is NaN ${ntpOffsetMs}`);
                ntpOffsetMs = 0;
            }
            return isInRange;
        }
        catch (e) {
            mainLogger.warn(`Couldn't fetch ntp time from server at ${host}`);
            ntpOffsetMs = 0;
        }
    }
    throw Error('Unable to check local time against time servers.');
}
export function shardusGetTime(): number {
    let time = Date.now();
    if (config.p2p.useNTPOffsets === true) {
        time += ntpOffsetMs;
    }
    if (config.p2p.useFakeTimeOffsets === true) {
        time += fakeTimeOffsetMs;
    }
    return time;
}
export function getNetworkTimeOffset(): number {
    if (config.p2p.useNTPOffsets === true) {
        return ntpOffsetMs;
    }
    return ntpOffsetMs;
}
export function calculateFakeTimeOffset(shift: number, spread: number): number {
    shift = isNaN(shift) ? 0 : shift;
    spread = isNaN(spread) ? 0 : spread;
    const minShift = -5000;
    const maxShift = 5000;
    const minSpread = 0;
    const maxSpread = 5000;
    shift = Math.min(Math.max(shift, minShift), maxShift);
    spread = Math.min(Math.max(spread, minSpread), maxSpread);
    const begin = shift - spread / 2;
    const end = shift + spread / 2;
    fakeTimeOffsetMs = Math.round(begin + (end - begin) * Math.random());
    return fakeTimeOffsetMs;
}
export function clearFakeTimeOffset(): number {
    fakeTimeOffsetMs = 0;
    return fakeTimeOffsetMs;
}
export function getFakeTimeOffset(): number {
    if (config.p2p.useFakeTimeOffsets === true) {
        return fakeTimeOffsetMs;
    }
    return 0;
}
export function getLastNTPObject(): any {
    return lastNTPTimeObj;
}
async function discoverExternalIp(servers: string[]) {
    for (const server of servers) {
        try {
            const { ip }: {
                ip: string;
            } = await httpModule.get(server);
            return ip;
        }
        catch (err) {
            mainLogger.warn(`p2p/Self:discoverExternalIp: Could not discover IP from external IP server ${server}: ` + err.message);
        }
    }
}
function closeServer(server) {
    return new Promise<void>((resolve) => {
        server.close();
        server.unref();
        resolve();
    });
}