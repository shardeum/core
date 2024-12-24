import log4js from 'log4js';
import { existsSync, mkdirSync } from 'fs';
import * as utils from '../utils';
import os from 'os';
const fs = require('fs');
import * as http from '../http';
import * as Shardus from '../shardus/shardus-types';
import { profilerInstance } from '../utils/profiler';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { Utils } from '@shardus/types';
const log4jsExtend = require('log4js-extend');
import got from 'got';
import { parse as parseUrl } from 'url';
import { isDebugModeMiddleware, isDebugModeMiddlewareLow, isDebugModeMiddlewareMedium, } from '../network/debugMiddleware';
import { isDebugMode } from '../debug';
import { shardusGetTime } from '../network';
import { config } from '../p2p/Context';
import path from 'path';
interface Logger {
    baseDir: string;
    config: Shardus.StrictLogsConfiguration;
    logDir: string;
    log4Conf: log4js.Configuration;
    _playbackLogger: any;
    _mainLogger: any;
    _seenAddresses: any;
    _shortStrings: any;
    _playbackOwner_host: any;
    _playbackOwner: any;
    _playbackIPInfo: any;
    _nodeInfos: any;
    _playbackNodeID: string;
}
export type LogFlags = {
    verbose: boolean;
    fatal: boolean;
    debug: boolean;
    info: boolean;
    error: boolean;
    console: boolean;
    playback: boolean;
    playback_trace: boolean;
    playback_debug: boolean;
    net_trace: boolean;
    p2pNonFatal: boolean;
    newFilter: boolean;
    important_as_error: boolean;
    important_as_fatal: boolean;
    net_verbose: boolean;
    net_stats: boolean;
    net_rust: boolean;
    dapp_verbose: boolean;
    profiling_verbose: boolean;
    aalg: boolean;
    shardedCache: boolean;
    lost: boolean;
    rotation: boolean;
    seqdiagram: boolean;
    txCancel: boolean;
    getLocalOrRemote: boolean;
    verboseNestedCounters: boolean;
    node_rotation_debug: boolean;
};
export let logFlags: LogFlags = {
    debug: true,
    fatal: true,
    verbose: true,
    info: true,
    console: true,
    error: true,
    playback: false,
    playback_trace: false,
    playback_debug: false,
    net_trace: false,
    p2pNonFatal: true,
    newFilter: false,
    important_as_error: true,
    important_as_fatal: true,
    net_rust: false,
    net_verbose: false,
    net_stats: false,
    dapp_verbose: false,
    profiling_verbose: false,
    aalg: false,
    shardedCache: false,
    lost: false,
    rotation: false,
    seqdiagram: false,
    txCancel: false,
    getLocalOrRemote: false,
    verboseNestedCounters: false,
    node_rotation_debug: false,
};
const filePath1 = path.join(process.cwd(), 'data-logs', 'cycleRecords1.txt');
const filePath2 = path.join(process.cwd(), 'data-logs', 'cycleRecords2.txt');
class Logger {
    backupLogFlags: LogFlags;
    constructor(baseDir: string, config: Shardus.StrictLogsConfiguration, dynamicLogMode: string) {
        this.baseDir = baseDir;
        this.config = config;
        this.logDir = null;
        this.log4Conf = null;
        this._setupLogs(dynamicLogMode);
    }
    _checkValidConfig() {
        const config = this.config;
        if (!config.dir)
            throw Error('Fatal Error: Log directory not defined.');
        if (!config.files || typeof config.files !== 'object')
            throw Error('Fatal Error: Valid log file locations not provided.');
    }
    _addFileNamesToAppenders() {
        const conf = this.log4Conf;
        for (const key in conf.appenders) {
            const appender = conf.appenders[key];
            if (appender.type !== 'file')
                continue;
            appender.filename = `${this.logDir}/${key}.log`;
        }
    }
    _configureLogs() {
        return log4js.configure(this.log4Conf);
    }
    getLogger(logger: string) {
        return log4js.getLogger(logger);
    }
    _setupLogs(dynamicLogMode: string) {
        const baseDir = this.baseDir;
        const config = this.config;
        if (!baseDir)
            throw Error('Fatal Error: Base directory not defined.');
        if (!config)
            throw Error('Fatal Error: No configuration provided.');
        this._checkValidConfig();
        this.logDir = `${baseDir}/${config.dir}`;
        if (!existsSync(this.logDir))
            mkdirSync(this.logDir);
        this.log4Conf = config.options;
        log4jsExtend(log4js);
        this._addFileNamesToAppenders();
        this._configureLogs();
        this._playbackLogger = this.getLogger('playback');
        this._mainLogger = this.getLogger('main');
        this.setupLogControlValues();
        if (dynamicLogMode.toLowerCase() === 'fatal' || dynamicLogMode.toLowerCase() === 'fatals') {
            this.setFatalFlags();
        }
        else if (dynamicLogMode.toLowerCase() === 'error' || dynamicLogMode.toLowerCase() === 'errors') {
            this.setErrorFlags();
        }
        this._seenAddresses = {};
        this._shortStrings = {};
        this._playbackOwner_host = os.hostname();
        this._playbackOwner = 'temp_' + this._playbackOwner_host;
        this._playbackIPInfo = null;
        this._nodeInfos = {};
        http.setLogger(this);
    }
    shutdown() {
        return new Promise((resolve) => {
            log4js.shutdown(() => {
                resolve('done');
            });
        });
    }
    setPlaybackIPInfo(ipInfo) {
        this._playbackIPInfo = ipInfo;
        let newName = 'temp_' + this._playbackOwner_host + ':' + this._playbackIPInfo.externalPort;
        this._playbackOwner = newName;
    }
    setPlaybackID(nodeID) {
        this._playbackNodeID = nodeID;
        let newName = utils.makeShortHash(this._playbackNodeID) + ':' + this._playbackIPInfo.externalPort;
        this._playbackOwner = newName;
    }
    identifyNode(input) {
        if (utils.isString(input)) {
            if (input.length === 64) {
                let seenNode = this._nodeInfos[input];
                if (seenNode) {
                    return seenNode.out;
                }
                return utils.makeShortHash(input);
            }
            else {
                return input;
            }
        }
        if (utils.isObject(input)) {
            if (input.id) {
                let seenNode = this._nodeInfos[input.id];
                if (seenNode) {
                    return seenNode.out;
                }
                let shorthash = utils.makeShortHash(input.id);
                let out = shorthash + ':' + input.externalPort;
                this._nodeInfos[input.id] = { node: input, out, shorthash };
                return out;
            }
            return Utils.safeStringify(input);
        }
    }
    processDesc(desc) {
        if (utils.isObject(desc)) {
            desc = utils.stringifyReduceLimit(desc, 1000);
        }
        return desc;
    }
    playbackLog(from, to, type, endpoint, id, desc) {
        if (!logFlags.playback) {
            return;
        }
        let ts = shardusGetTime();
        from = this.identifyNode(from);
        to = this.identifyNode(to);
        if (utils.isObject(id)) {
            id = Utils.safeStringify(id);
        }
        else {
            id = utils.makeShortHash(id);
        }
        if (logFlags.playback_trace) {
            desc = this.processDesc(desc);
            this._playbackLogger.trace(`\t${ts}\t${this._playbackOwner}\t${from}\t${to}\t${type}\t${endpoint}\t${id}\t${desc}`);
        }
        if (logFlags.playback_debug) {
        }
    }
    playbackLogState(newState, id, desc) {
    }
    playbackLogNote(noteCategory, id, desc = null) {
    }
    setFatalFlags() {
        for (const [key, value] of Object.entries(logFlags)) {
            logFlags[key] = false;
        }
        logFlags.fatal = true;
        logFlags.important_as_fatal = true;
        logFlags.playback = false;
    }
    setDisableAllFlags() {
        for (const [key, value] of Object.entries(logFlags)) {
            logFlags[key] = false;
        }
    }
    setErrorFlags() {
        for (const [key, value] of Object.entries(logFlags)) {
            logFlags[key] = false;
        }
        logFlags.fatal = true;
        logFlags.error = true;
        logFlags.important_as_fatal = true;
        logFlags.important_as_error = true;
        logFlags.playback = false;
    }
    setDefaultFlags() {
        for (const [key, value] of Object.entries(logFlags)) {
            logFlags[key] = this.backupLogFlags[key];
        }
        if (logFlags.playback_trace || logFlags.playback_debug) {
            logFlags.playback = true;
        }
        else {
            logFlags.playback = false;
        }
        logFlags.important_as_fatal = true;
        logFlags.important_as_error = true;
    }
    setFlagByName(name: string, value: boolean) {
        logFlags[name] = value;
    }
    registerEndpoints(Context) {
        Context.network.registerExternalGet('log-fatal', isDebugModeMiddlewareMedium, (req, res) => {
            this.setFatalFlags();
            for (const [key, value] of Object.entries(logFlags)) {
                res.write(`${key}: ${value}\n`);
            }
            res.end();
        });
        Context.network.registerExternalGet('log-disable', isDebugModeMiddlewareMedium, (req, res) => {
            this.setDisableAllFlags();
            for (const [key, value] of Object.entries(logFlags)) {
                res.write(`${key}: ${value}\n`);
            }
            res.end();
        });
        Context.network.registerExternalGet('log-error', isDebugModeMiddlewareMedium, (req, res) => {
            this.setErrorFlags();
            for (const [key, value] of Object.entries(logFlags)) {
                res.write(`${key}: ${value}\n`);
            }
            res.end();
        });
        Context.network.registerExternalGet('log-default', isDebugModeMiddlewareMedium, (req, res) => {
            this.setDefaultFlags();
            for (const [key, value] of Object.entries(logFlags)) {
                res.write(`${key}: ${value}\n`);
            }
            res.end();
        });
        Context.network.registerExternalGet('log-flag', isDebugModeMiddlewareMedium, (req, res) => {
            let flagName = req.query.name;
            let flagValue = req.query.value;
            if (flagName && flagValue) {
                this.setFlagByName(flagName, flagValue);
            }
            for (const [key, value] of Object.entries(logFlags)) {
                res.write(`${key}: ${value}\n`);
            }
            res.end();
        });
        Context.network.registerExternalGet('log-getflags', isDebugModeMiddlewareLow, (req, res) => {
            for (const [key, value] of Object.entries(logFlags)) {
                res.write(`${key}: ${value}\n`);
            }
            res.end();
        });
        Context.network.registerExternalGet('debug-cycle-recording-enable', isDebugModeMiddlewareMedium, (req, res) => {
            const enable = req.query.enable;
            if (enable === 'true') {
                config.debug.localEnableCycleRecordDebugTool = true;
            }
            else if (enable === 'false') {
                config.debug.localEnableCycleRecordDebugTool = false;
            }
            res.write(`localEnableCycleRecordDebugTool = ${config.debug.localEnableCycleRecordDebugTool}`);
            res.end();
        });
        Context.network.registerExternalGet('debug-cycle-recording-clear', isDebugModeMiddlewareMedium, (req, res) => {
            fs.unlink(filePath1, (err) => {
                if (err) {
                    console.error(`Failed to delete ${filePath1}: ${err.message}`);
                }
                else {
                }
                fs.unlink(filePath2, (err) => {
                    if (err) {
                        console.error(`Failed to delete ${filePath2}: ${err.message}`);
                    }
                    else {
                    }
                    res.end('Cycle recording data cleared.');
                });
            });
        });
        Context.network.registerExternalGet('debug-cycle-recording-download', isDebugModeMiddlewareMedium, (req, res) => {
            fs.readFile(filePath1, 'utf8', (err, data) => {
                if (err) {
                    console.error('Error reading file:', err);
                    res.status(500).json({ error: 'Error reading file' });
                    return;
                }
                res.setHeader('Content-Type', 'text/plain');
                res.json({ response: true, data: data });
            });
        });
        Context.network.registerExternalGet('debug-clearlog', isDebugModeMiddlewareMedium, async (req, res) => {
            const requestedFileName = req?.query?.file;
            let filesToClear = [];
            try {
                if (!requestedFileName) {
                    res.status(400).json({ error: 'No log file specified' });
                    return;
                }
                const validFileNames: string[] = [];
                for (const appender of Object.values(this.log4Conf.appenders)) {
                    if (appender.type === 'file') {
                        validFileNames.push(path.basename(appender.filename));
                    }
                }
                if (this.config.saveConsoleOutput) {
                    validFileNames.push('out.log');
                }
                if (requestedFileName.toLowerCase() === 'all') {
                    filesToClear = validFileNames;
                }
                else {
                    const sanitizedFileName = path.basename(requestedFileName);
                    if (!validFileNames.includes(sanitizedFileName)) {
                        res.status(400).json({ error: 'Invalid log file specified' });
                        return;
                    }
                    filesToClear.push(sanitizedFileName);
                }
            }
            catch (error) {
                console.error('Error clearing log files 1:', error);
                res.status(500).json({ error: `Failed to clearing log files with input 1 ${requestedFileName}` });
            }
            try {
                const filesInDir = await fs.promises.readdir(this.logDir);
                const filesToDelete = filesInDir.filter((file) => filesToClear.some((f) => file.startsWith(f + '.') && file !== f));
                const truncatePromises = filesToClear.map((file) => fs.promises.open(path.join(this.logDir, file), 'w+').then((fileHandle) => fileHandle.close()));
                await Promise.all(truncatePromises);
                const deletePromises = filesToDelete.map((file) => fs.promises.unlink(path.join(this.logDir, file)));
                await Promise.all(deletePromises);
                res.status(200).json({ success: true });
            }
            catch (error) {
                console.error('Error clearing log files 2:', error);
                res.status(500).json({ error: `Failed to clearing log files with input 2 ${requestedFileName}` });
            }
        });
    }
    _containsProtocol(url: string) {
        if (!url.match('https?://*'))
            return false;
        return true;
    }
    _normalizeUrl(url: string) {
        let normalized = url;
        if (!this._containsProtocol(url))
            normalized = 'http://' + url;
        return normalized;
    }
    async _internalHackGet(url: string) {
        let normalized = this._normalizeUrl(url);
        let host = parseUrl(normalized, true);
        try {
            await got.get(host.href, {
                timeout: 1000,
                retry: 0,
                throwHttpErrors: false,
            });
        }
        catch (e) { }
    }
    async _internalHackGetWithResp(url: string) {
        let normalized = this._normalizeUrl(url);
        let host = parseUrl(normalized, true);
        try {
            const res = await got.get(host.href, {
                timeout: 7000,
                retry: 0,
                throwHttpErrors: false,
            });
            return res;
        }
        catch (e) {
            return null;
        }
    }
    setupLogControlValues() {
        logFlags.fatal = true;
        let mainLogger = this.getLogger('main');
        // @ts-ignore
        if (mainLogger && ['TRACE', 'trace'].includes(mainLogger.level.levelStr)) {
            logFlags.verbose = true;
            logFlags.debug = true;
            logFlags.info = true;
            logFlags.error = true;
        }
        // @ts-ignore
        else if (mainLogger && ['DEBUG', 'debug'].includes(mainLogger.level.levelStr)) {
            logFlags.verbose = false;
            logFlags.debug = true;
            logFlags.info = true;
            logFlags.error = true;
        }
        // @ts-ignore
        else if (mainLogger && ['INFO', 'info'].includes(mainLogger.level.levelStr)) {
            logFlags.verbose = false;
            logFlags.debug = false;
            logFlags.info = true;
            logFlags.error = true;
        }
        // @ts-ignore
        else if (mainLogger && ['ERROR', 'error', 'WARN', 'warn'].includes(mainLogger.level.levelStr)) {
            logFlags.verbose = false;
            logFlags.debug = false;
            logFlags.info = true;
            logFlags.error = true;
        }
        else {
            logFlags.verbose = false;
            logFlags.debug = false;
            logFlags.info = false;
            logFlags.error = false;
        }
        let playbackLogger = this.getLogger('playback');
        logFlags.playback = false;
        if (playbackLogger) {
            // @ts-ignore
            logFlags.playback_trace = ['TRACE'].includes(playbackLogger.level.levelStr);
            // @ts-ignore
            logFlags.playback_debug = ['DEBUG'].includes(playbackLogger.level.levelStr);
            if (logFlags.playback_trace || logFlags.playback_debug) {
                logFlags.playback = true;
            }
            else {
                logFlags.playback = false;
            }
        }
        let netLogger = this.getLogger('net');
        // @ts-ignore
        if (netLogger && ['TRACE', 'trace'].includes(netLogger.level.levelStr)) {
            logFlags.net_trace = true;
        }
        let p2pLogger = this.getLogger('p2p');
        // @ts-ignore
        if (p2pLogger && ['FATAL', 'fatal'].includes(p2pLogger.level.levelStr)) {
            logFlags.p2pNonFatal = false;
        }
        else {
            logFlags.p2pNonFatal = true;
        }
        this.backupLogFlags = utils.deepCopy(logFlags);
    }
    mainLog(level, key: string, message: string): void {
        this._mainLogger[level](key + ' ' + message);
    }
    mainLog_debug(key: string, message: string): void {
        this.mainLog('debug', 'DBG_' + key, message);
    }
    combine(...args: any[]): string {
        return args
            .map((arg) => {
            if (typeof arg === 'object') {
                return Utils.safeStringify(arg);
            }
            else {
                return String(arg);
            }
        })
            .join(' ');
    }
}
export default Logger;