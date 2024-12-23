import Log4js from 'log4js';
import LoadDetection from '../load-detection';
import Logger, { logFlags } from '../logger';
import { ipInfo, shardusGetTime } from '../network';
import { config, crypto } from '../p2p/Context';
import * as Shardus from '../shardus/shardus-types';
import * as Archivers from '../p2p/Archivers';
import * as Context from '../p2p/Context';
import { getDesiredCount, lastScalingType, requestedScalingType } from '../p2p/CycleAutoScale';
import * as CycleChain from '../p2p/CycleChain';
import * as Self from '../p2p/Self';
import * as NodeList from '../p2p/NodeList';
import * as Rotation from '../p2p/Rotation';
import StateManager from '../state-manager';
import Statistics from '../statistics';
import Profiler from '../utils/profiler';
import packageJson from '../../package.json';
import { isDebugModeAnd } from '../debug';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { memoryReportingInstance } from '../utils/memoryReporting';
import { getLinearGossipBurstList } from '../utils';
import { getSocketReport } from '../utils/debugUtils';
import { Utils } from '@shardus/types';
import { finishedSyncingCycle } from '../p2p/Join';
import { currentCycle } from '../p2p/CycleCreator';
import process from 'process';
const http = require('../http');
const allZeroes64 = '0'.repeat(64);
interface StatisticsReport {
    txInjected: number;
    txApplied: number;
    txRejected: number;
    txProcessed: number;
    txExpired: number;
}
interface Reporter {
    config: any;
    mainLogger: Log4js.Logger;
    p2p: any;
    statistics: Statistics;
    stateManager: StateManager;
    profiler: Profiler;
    loadDetection: LoadDetection;
    logger: Logger;
    reportTimer: NodeJS.Timeout;
    reportingInterval: NodeJS.Timeout;
    socketReportInterval: NodeJS.Timeout;
    lastTime: number;
    doConsoleReport: boolean;
    hasRecipient: boolean;
    statisticsReport: StatisticsReport;
    stillNeedsInitialPatchPostActive: boolean;
}
class Reporter {
    constructor(config, logger, statistics, stateManager, profiler, loadDetection) {
        this.config = config;
        this.mainLogger = logger.getLogger('main');
        this.statistics = statistics;
        this.stateManager = stateManager;
        this.profiler = profiler;
        this.loadDetection = loadDetection;
        this.logger = logger;
        this.reportTimer = null;
        this.reportingInterval = null;
        this.socketReportInterval = null;
        this.lastTime = shardusGetTime();
        this.doConsoleReport = isDebugModeAnd((config) => config.profiler);
        this.hasRecipient = this.config.recipient != null;
        this.stillNeedsInitialPatchPostActive = true;
        this.resetStatisticsReport();
    }
    resetStatisticsReport() {
        this.statisticsReport = {
            txInjected: 0,
            txApplied: 0,
            txRejected: 0,
            txProcessed: 0,
            txExpired: 0,
        };
    }
    collectStatisticToReport() {
        this.statisticsReport.txInjected += this.statistics ? this.statistics.getPreviousElement('txInjected') : 0;
        this.statisticsReport.txApplied += this.statistics ? this.statistics.getPreviousElement('txApplied') : 0;
        this.statisticsReport.txRejected += this.statistics ? this.statistics.getPreviousElement('txRejected') : 0;
        this.statisticsReport.txExpired += this.statistics ? this.statistics.getPreviousElement('txExpired') : 0;
        this.statisticsReport.txProcessed += this.statistics
            ? this.statistics.getPreviousElement('txProcessed')
            : 0;
    }
    async reportJoining(publicKey) {
        if (!this.hasRecipient) {
            return;
        }
        try {
            const nodeIpInfo = ipInfo;
            const appData = this.getAppData();
            await http.post(`${this.config.recipient}/joining`, {
                publicKey,
                nodeIpInfo,
                appData,
            });
        }
        catch (e) {
            if (logFlags.error)
                this.mainLogger.error('reportJoining: ' + e.name + ': ' + e.message + ' at ' + e.stack);
            console.error(e);
        }
    }
    async reportJoined(nodeId, publicKey) {
        if (!this.hasRecipient) {
            return;
        }
        try {
            const nodeIpInfo = ipInfo;
            const appData = this.getAppData();
            await http.post(`${this.config.recipient}/joined`, {
                publicKey,
                nodeId,
                nodeIpInfo,
                appData,
            });
        }
        catch (e) {
            if (logFlags.error)
                this.mainLogger.error('reportJoined: ' + e.name + ': ' + e.message + ' at ' + e.stack);
            console.error(e);
        }
    }
    async reportActive(nodeId) {
        if (!this.hasRecipient) {
            return;
        }
        try {
            await http.post(`${this.config.recipient}/active`, { nodeId });
        }
        catch (e) {
            if (logFlags.error)
                this.mainLogger.error('reportActive: ' + e.name + ': ' + e.message + ' at ' + e.stack);
            console.error(e);
        }
    }
    async reportSyncStatement(nodeId, syncStatement) {
        if (!this.hasRecipient) {
            return;
        }
        try {
            await http.post(`${this.config.recipient}/sync-statement`, { nodeId, syncStatement });
        }
        catch (e) {
            if (logFlags.error)
                this.mainLogger.error('reportSyncStatement: ' + e.name + ': ' + e.message + ' at ' + e.stack);
            console.error(e);
        }
    }
    async reportRemoved(nodeId) {
        if (!this.hasRecipient) {
            return;
        }
        try {
            await http.post(`${this.config.recipient}/removed`, { nodeId });
        }
        catch (e) {
            if (logFlags.error)
                this.mainLogger.error('reportRemoved: ' + e.name + ': ' + e.message + ' at ' + e.stack);
            console.error(e);
        }
        this.hasRecipient = false;
    }
    async _sendReport(data) {
        if (!this.hasRecipient) {
            return;
        }
        const nodeId = Self.id;
        if (!nodeId)
            throw new Error('No node ID available to the Reporter module.');
        const report = {
            nodeId,
            data,
        };
        if (logFlags.debug) {
            try {
            }
            catch (error) {
                console.error(`[reporter/index][_sendReport] ERROR while writing report object to log.`, error);
            }
        }
        try {
            await http.post(`${this.config.recipient}/heartbeat`, report);
        }
        catch (e) {
            if (logFlags.error)
                this.mainLogger.error('_sendReport: ' + e.name + ': ' + e.message + ' at ' + e.stack);
            console.error(e);
        }
    }
    getReportInterval(): number {
        if (NodeList.activeByIdOrder.length >= 100) {
            return 10 * 1000;
        }
        else {
            return this.config.interval * 1000;
        }
    }
    getAppData(): unknown {
        if (typeof Context.shardus.app.getNodeInfoAppData === 'function') {
            const appData = Context.shardus.app.getNodeInfoAppData();
            return appData;
        }
        return 'unknown';
    }
    checkIsNodeLost(nodeId) {
        const lostNodeIds = CycleChain.getNewest().lost;
        if (lostNodeIds.length === 0)
            return false;
        const foundId = lostNodeIds.find((lostId) => lostId === nodeId);
        if (foundId)
            return true;
        return false;
    }
    checkIsNodeRefuted(nodeId) {
        const refutedNodeIds = CycleChain.getNewest().refuted;
        if (refutedNodeIds.length === 0)
            return false;
        const foundId = refutedNodeIds.find((refutedId) => refutedId === nodeId);
        if (foundId)
            return true;
        return false;
    }
    async report() {
        if (CycleChain.newest == null) {
            this.restartReportInterval();
            return;
        }
        let appState = allZeroes64;
        const cycleMarker = CycleChain.newest.previous || '';
        const cycleCounter = CycleChain.newest.counter;
        const networkId = CycleChain.newest.networkId;
        const desiredNodes = getDesiredCount();
        const lastScalingTypeRequested = requestedScalingType;
        const lastScalingTypeWinner = lastScalingType;
        const txInjected = this.statisticsReport.txInjected;
        const txApplied = this.statisticsReport.txApplied;
        const txRejected = this.statisticsReport.txRejected;
        const txExpired = this.statisticsReport.txExpired;
        const txProcessed = this.statisticsReport.txProcessed;
        const countedEvents = this.statistics.getAllCountedEvents();
        const reportInterval = this.getReportInterval();
        const nodeIpInfo = ipInfo;
        const appData = this.getAppData();
        let repairsStarted = 0;
        let repairsFinished = 0;
        let partitionReport = null;
        let globalSync = null;
        let txCoverage = {};
        if (this.stateManager != null) {
            if (this.stateManager.partitionObjects != null) {
                partitionReport = this.stateManager.partitionObjects.getPartitionReport(true, true);
            }
            if (config.mode === 'debug' && !config.debug.disableTxCoverageReport) {
                txCoverage = { ...this.stateManager.transactionQueue.txCoverageMap };
            }
            globalSync = this.stateManager.isStateGood();
            repairsStarted = this.stateManager.dataRepairsStarted;
            repairsFinished = this.stateManager.dataRepairsCompleted;
            appState = globalSync ? '00ff00ff' : 'ff0000ff';
        }
        let partitions = 0;
        let partitionsCovered = 0;
        if (this.stateManager != null) {
            const shardData = this.stateManager.currentCycleShardData;
            if (shardData != null) {
                partitions = shardData.shardGlobals.numPartitions;
                partitionsCovered = shardData.nodeShardData.storedPartitions.partitionsCovered;
            }
        }
        const currentNetworkLoad = this.loadDetection.getCurrentLoad();
        const currentNodeLoad = this.loadDetection.getCurrentNodeLoad();
        const queueLengthAll = this.statistics.getPreviousElement('queueLength');
        const executeQueueLength = this.statistics.getPreviousElement('executeQueueLength');
        const queueLength = executeQueueLength;
        const queueLengthBuckets = this.stateManager.transactionQueue.getQueueLengthBuckets();
        const txTimeInQueue = this.statistics.getPreviousElement('txTimeInQueue') / 1000;
        const maxTxTimeInQueue = this.statistics.getMax('txTimeInQueue') / 1000;
        const isNodeLost = this.checkIsNodeLost(Self.id);
        const isNodeRefuted = this.checkIsNodeRefuted(Self.id);
        const isDataSynced = !this.stateManager.accountPatcher.failedLastTrieSync;
        const cycleFinishedSyncing = finishedSyncingCycle;
        if (currentCycle > finishedSyncingCycle && isDataSynced)
            this.stillNeedsInitialPatchPostActive = false;
        const stillNeedsInitialPatchPostActive = this.stillNeedsInitialPatchPostActive;
        let rareCounters = {};
        for (const [key, value] of nestedCountersInstance.rareEventCounters) {
            rareCounters[key] = { ...value };
            rareCounters[key].subCounters = {};
            for (const [subKey, subValue] of value.subCounters) {
                rareCounters[key].subCounters[subKey] = subValue;
            }
        }
        const nodelistHash = NodeList.getNodeListHash();
        const archiverListHash = Archivers.getArchiverListHash();
        const lastInSyncResult = this.stateManager.accountPatcher.lastInSyncResult;
        try {
            await this._sendReport({
                repairsStarted,
                repairsFinished,
                isDataSynced,
                appState,
                cycleMarker,
                cycleCounter,
                nodelistHash,
                desiredNodes,
                lastScalingTypeWinner,
                lastScalingTypeRequested,
                timestamp: shardusGetTime() / 1000,
                txInjected,
                txApplied,
                txRejected,
                txExpired,
                txProcessed,
                reportInterval,
                networkId,
                nodeIpInfo,
                partitionReport,
                globalSync,
                partitions,
                partitionsCovered,
                countedEvents,
                currentLoad: {
                    networkLoad: currentNetworkLoad,
                    nodeLoad: currentNodeLoad,
                },
                queueLengthAll,
                queueLength,
                executeQueueLength,
                queueLengthBuckets,
                txTimeInQueue,
                maxTxTimeInQueue,
                rareCounters,
                txCoverage,
                isLost: isNodeLost,
                isRefuted: isNodeRefuted,
                shardusVersion: packageJson.version,
                appData,
                archiverListHash,
                lastInSyncResult,
                cycleFinishedSyncing,
                stillNeedsInitialPatchPostActive,
                memory: process.memoryUsage()
            });
            if (this.stateManager != null && config.mode === 'debug' && !config.debug.disableTxCoverageReport) {
                this.stateManager.transactionQueue.resetTxCoverageMap();
            }
            this.statistics.resetCountedEvents();
        }
        catch (e) {
            if (logFlags.error)
                this.mainLogger.error('startReporting: ' + e.name + ': ' + e.message + ' at ' + e.stack);
            console.error(e);
        }
        this.resetStatisticsReport();
        this.restartReportInterval();
    }
    private restartReportInterval() {
        if (this.reportTimer) {
            clearTimeout(this.reportTimer);
        }
        const reportInterval = this.getReportInterval();
        this.reportTimer = setTimeout(() => {
            this.report();
        }, reportInterval);
    }
    startReporting() {
        const self = this;
        if (this.reportingInterval) {
            return;
        }
        this.reportingInterval = setInterval(() => {
            self.collectStatisticToReport();
        }, 1000);
        this.socketReportInterval = setInterval(async () => {
            if (this.config.logSocketReports) {
                const report = await getSocketReport();
                const networkReport = memoryReportingInstance.getShardusNetReport();
                if (report.error === true) {
                    clearInterval(self.socketReportInterval);
                }
            }
        }, 300000);
        this.restartReportInterval();
    }
    consoleReport() {
        const time = shardusGetTime();
        let delta = time - this.lastTime;
        delta = delta * 0.001;
        const txInjected = this.statistics ? this.statistics.getPreviousElement('txInjected') : 0;
        const txApplied = this.statistics ? this.statistics.getPreviousElement('txApplied') : 0;
        const report = `Perf inteval ${delta}    ${txInjected} Injected @${txInjected / delta} per second.    ${txApplied} Applied @${txApplied / delta} per second`;
        this.lastTime = time;
        if (this.profiler) {
        }
    }
    stopReporting() {
        clearTimeout(this.reportTimer);
        clearInterval(this.reportingInterval);
        clearInterval(this.socketReportInterval);
        this.reportingInterval = null;
    }
}
export default Reporter;