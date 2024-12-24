import Log4js from 'log4js';
import * as Context from '../p2p/Context';
import { profilerInstance } from '../utils/profiler';
import { getPublicNodeInfo, NodeInfo } from '../p2p/Self';
import path from 'path';
import fs from 'fs';
import * as NodeList from '../p2p/NodeList';
import * as Self from '../p2p/Self';
interface ExitSummary {
    status: string;
    message: string;
    exitTime: number;
    totalActiveTime: number;
    nodeInfo: NodeInfo;
    lastRotationIndex: {
        idx: number;
        total: number;
    };
    activeNodes: number;
    lastActiveTime: number;
}
interface ExitHandler {
    exited: boolean;
    syncFuncs: Map<string, Function>;
    asyncFuncs: Map<string, Function>;
    exitLogger: Log4js.Logger;
    memStats: any;
    counters: any;
    logDir: string;
    activeStartTime: number;
    lastActiveTime: number;
    lastRotationIndex: {
        idx: number;
        total: number;
    };
}
class ExitHandler {
    constructor(logDir: string, _memoryReporting: any, _nestedCounters: any) {
        this.exited = false;
        this.syncFuncs = new Map();
        this.asyncFuncs = new Map();
        this.memStats = _memoryReporting;
        this.counters = _nestedCounters;
        this.exitLogger = Context.logger.getLogger('exit');
        this.logDir = logDir;
        Self.emitter.once('active', () => {
            let cycles = Context.p2p.getLatestCycles(1);
            if (cycles.length > 0) {
                this.activeStartTime = cycles[0].start * 1000;
            }
        });
        Self.emitter.on('cycle_q1_start', () => {
            if (Self.isActive) {
                let rotatationIndex = NodeList.getAgeIndex();
                if (rotatationIndex.idx >= 0) {
                    this.lastRotationIndex = rotatationIndex;
                }
                let cycles = Context.p2p.getLatestCycles(1);
                if (cycles.length > 0) {
                    this.lastActiveTime = cycles[0].start * 1000;
                }
            }
            this.writeNodeProgress();
        });
        this.writeStartSummary();
    }
    registerSync(who, func) {
        this.syncFuncs.set(who, func);
    }
    registerAsync(who, func) {
        this.asyncFuncs.set(who, func);
    }
    async _cleanupAsync() {
        for (const [, func] of this.asyncFuncs) {
            await func();
        }
    }
    _cleanupSync() {
        for (const [, func] of this.syncFuncs) {
            func();
        }
    }
    async exitCleanly(exitType: string, message: string, exitProcess = true) {
        if (this.exited)
            return;
        this.exited = true;
        this._cleanupSync();
        try {
            this.runExitLog(true, exitType, message);
            await this._cleanupAsync();
        }
        catch (e) {
            console.error(e);
        }
        if (exitProcess)
            process.exit();
    }
    async exitUncleanly(exitType: string, message: string) {
        if (this.exited)
            return;
        this.exited = true;
        this._cleanupSync();
        try {
            this.runExitLog(false, exitType, message);
            await this._cleanupAsync();
        }
        catch (e) {
            console.error(e);
        }
        process.exit(1);
    }
    runExitLog(isCleanExit: boolean, exitType: string, msg: string) {
        this.exitLogger.fatal(`isCleanExit: ${isCleanExit}  exitType: ${exitType}  msg: ${msg}`);
        let log: string[] = [];
        const fakeStream = {
            write: (data: string) => {
                log.push(data);
            },
        };
        const toMB = 1 / 1000000;
        const report = process.memoryUsage();
        log.push(`System Memory Report.  Timestamp: ${Date.now()}\n`);
        log.push(`rss: ${(report.rss * toMB).toFixed(2)} MB\n`);
        log.push(`heapTotal: ${(report.heapTotal * toMB).toFixed(2)} MB\n`);
        log.push(`heapUsed: ${(report.heapUsed * toMB).toFixed(2)} MB\n`);
        log.push(`external: ${(report.external * toMB).toFixed(2)} MB\n`);
        log.push(`arrayBuffers: ${(report.arrayBuffers * toMB).toFixed(2)} MB\n\n\n`);
        this.memStats.gatherReport();
        this.memStats.reportToStream(this.memStats.report, fakeStream, 0);
        this.exitLogger.fatal(log.join(''));
        log = [];
        const arrayReport = this.counters.arrayitizeAndSort(this.counters.eventCounters);
        this.counters.printArrayReport(arrayReport, fakeStream, 0);
        this.exitLogger.fatal(log.join(''));
        this.writeExitSummary(isCleanExit, exitType, msg);
    }
    writeNodeProgress() {
        let nodeProgress = {
            nodeInfo: null,
            lastRotationIndex: this.lastRotationIndex,
            activeNodes: NodeList.activeByIdOrder.length,
            lastActiveTime: this.lastActiveTime,
            totalActiveTime: 0,
        };
        if (this.activeStartTime > 0 && this.lastActiveTime > 0) {
            nodeProgress.totalActiveTime = this.lastActiveTime - this.activeStartTime;
        }
        try {
            nodeProgress.nodeInfo = getPublicNodeInfo();
        }
        catch (er) { }
        try {
            let filePath = path.join(this.logDir, 'node-progress.json');
            let content = JSON.stringify(nodeProgress, null, 2);
            fs.writeFileSync(filePath, content, { encoding: 'utf8', flag: 'w' });
        }
        catch (er) { }
    }
    writeExitSummary(isCleanExit: boolean, exitType: string, msg: string) {
        let exitSummary: ExitSummary = {
            status: '',
            message: msg,
            exitTime: Date.now(),
            totalActiveTime: 0,
            nodeInfo: null,
            lastRotationIndex: this.lastRotationIndex,
            activeNodes: NodeList.activeByIdOrder.length,
            lastActiveTime: this.lastActiveTime,
        };
        if (isCleanExit) {
            if (exitType === `Apoptosized`) {
                exitSummary.status = 'Exit with warning';
            }
            else {
                exitSummary.status = 'Exited cleanly';
            }
        }
        else {
            if (exitType === 'SIGINT') {
                exitSummary.status = 'Exit with warning';
            }
            else if (exitType === 'SIGTERM' || exitType === 'message:shutdown') {
                exitSummary.status = 'Exit with error';
            }
            else
                exitSummary.status = 'Exit with error';
        }
        if (this.activeStartTime > 0 && this.lastActiveTime > 0) {
            exitSummary.totalActiveTime = this.lastActiveTime - this.activeStartTime;
        }
        try {
            exitSummary.nodeInfo = getPublicNodeInfo();
        }
        catch (er) { }
        try {
            exitSummary.nodeInfo = getPublicNodeInfo();
        }
        catch (er) { }
        try {
            let filePath = path.join(this.logDir, 'exit-summary.json');
            let content = JSON.stringify(exitSummary, null, 2);
            fs.writeFileSync(filePath, content, { encoding: 'utf8', flag: 'w' });
        }
        catch (er) { }
    }
    writeStartSummary() {
        let startSummary = {
            startTime: Date.now(),
        };
        try {
            let filePath = path.join(this.logDir, 'start-summary.json');
            let content = JSON.stringify(startSummary, null, 2);
            fs.writeFileSync(filePath, content, { encoding: 'utf8', flag: 'w' });
        }
        catch (er) { }
    }
    addSigListeners(sigint = true, sigterm = true) {
        if (sigint) {
            process.on('SIGINT', async () => {
                await this.exitUncleanly('SIGINT', 'Process exited with SIGINT');
            });
            process.on('message', async (msg) => {
                if (msg == 'shutdown') {
                    await this.exitUncleanly('message:shutdown', 'Process exited with shutdown message');
                }
            });
        }
        if (sigterm) {
            process.on('SIGTERM', async () => {
                await this.exitUncleanly('SIGTERM', 'Process exited with SIGTERM');
            });
        }
    }
}
export default ExitHandler;