import Statistics from '../statistics';
import { EventEmitter } from 'events';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { profilerInstance, NodeLoad } from '../utils/profiler';
import * as Context from '../p2p/Context';
import { memoryReportingInstance } from '../utils/memoryReporting';
import { isDebugModeMiddleware } from '../network/debugMiddleware';
import { Utils } from '@shardus/types';
interface LoadDetection {
    highThreshold: number;
    lowThreshold: number;
    desiredTxTime: number;
    queueLimit: number;
    executeQueueLimit: number;
    statistics: Statistics;
    load: number;
    nodeLoad: NodeLoad;
    scaledTxTimeInQueue: number;
    scaledQueueLength: number;
    scaledExecuteQueueLength: number;
    dbg: boolean;
    lastEmitCycle: number;
}
let lastMeasuredTimestamp = 0;
class LoadDetection extends EventEmitter {
    constructor(config, statistics) {
        super();
        this.highThreshold = config.highThreshold;
        this.lowThreshold = config.lowThreshold;
        this.desiredTxTime = config.desiredTxTime;
        this.queueLimit = config.queueLimit;
        this.executeQueueLimit = config.executeQueueLimit;
        this.statistics = statistics;
        this.load = 0;
        this.nodeLoad = {
            internal: 0,
            external: 0,
        };
        this.scaledTxTimeInQueue = 0;
        this.scaledQueueLength = 0;
        this.scaledExecuteQueueLength = 0;
        this.dbg = false;
        this.lastEmitCycle = -1;
        Context.network.registerExternalGet('loadset', isDebugModeMiddleware, (req, res) => {
            if (req.query.load == null)
                return;
            this.dbg = true;
            this.load = Number(req.query.load);
            res.json({ success: true, data: `set load to ${this.load}` });
        });
        Context.network.registerExternalGet('loadreset', isDebugModeMiddleware, (req, res) => {
            this.dbg = false;
            res.json({ success: true, data: 'reset load detection to normal behavior' });
        });
        Context.network.registerExternalGet('load', (req, res) => {
            try {
                const load = this.getCurrentLoad();
                const nodeLoad = this.getCurrentNodeLoad();
                res.json({ load, nodeLoad });
            }
            catch (e) {
            }
            return;
        });
    }
    configUpdated() {
        try {
            if (this.desiredTxTime !== Context.config.loadDetection.desiredTxTime) {
                this.desiredTxTime = typeof Context.config.loadDetection.desiredTxTime === 'string' ? Number(Context.config.loadDetection.desiredTxTime) : Context.config.loadDetection.desiredTxTime;
            }
            if (this.executeQueueLimit !== Context.config.loadDetection.executeQueueLimit) {
                this.executeQueueLimit = typeof Context.config.loadDetection.executeQueueLimit === 'string' ? Number(Context.config.loadDetection.executeQueueLimit) : Context.config.loadDetection.executeQueueLimit;
            }
            if (this.queueLimit !== Context.config.loadDetection.queueLimit) {
                this.queueLimit = typeof Context.config.loadDetection.queueLimit === 'string' ? Number(Context.config.loadDetection.queueLimit) : Context.config.loadDetection.queueLimit;
            }
        }
        catch (e) {
        }
    }
    updateLoad() {
        let load;
        if (this.dbg) {
            load = this.load;
            this.scaledTxTimeInQueue = load;
            this.scaledQueueLength = load;
            this.scaledExecuteQueueLength = load;
        }
        else {
            const txTimeInQueue = this.statistics.getAverage('txTimeInQueue') / 1000;
            let scaledTxTimeInQueue = txTimeInQueue >= this.desiredTxTime ? 1 : txTimeInQueue / this.desiredTxTime;
            const queueLength = this.statistics.getWatcherValue('queueLength');
            const scaledQueueLength = queueLength >= this.queueLimit ? 1 : queueLength / this.queueLimit;
            if (queueLength < 20) {
                if (scaledTxTimeInQueue > this.highThreshold) {
                }
                scaledTxTimeInQueue = 0;
            }
            const executeQueueLength = this.statistics.getWatcherValue('executeQueueLength');
            const scaledExecuteQueueLength = executeQueueLength >= this.executeQueueLimit ? 1 : executeQueueLength / this.executeQueueLimit;
            this.scaledTxTimeInQueue = scaledTxTimeInQueue;
            this.scaledQueueLength = scaledQueueLength;
            this.scaledExecuteQueueLength = scaledExecuteQueueLength;
            if (profilerInstance != null) {
                let dutyCycleLoad = profilerInstance.getTotalBusyInternal();
                if (dutyCycleLoad.duty > 0.8) {
                }
                else if (dutyCycleLoad.duty > 0.6) {
                }
                else if (dutyCycleLoad.duty > 0.4) {
                }
                this.statistics.setManualStat('netInternalDuty', dutyCycleLoad.netInternlDuty);
                this.statistics.setManualStat('netExternalDuty', dutyCycleLoad.netInternlDuty);
                let cpuPercent = memoryReportingInstance.cpuPercent();
                this.statistics.setFifoStat('cpuPercent', cpuPercent);
                let internalDutyAvg = this.statistics.getAverage('netInternalDuty');
                let externalDutyAvg = this.statistics.getAverage('netExternalDuty');
                this.nodeLoad = {
                    internal: internalDutyAvg,
                    external: externalDutyAvg,
                };
            }
            let adjustedQueueLoad = Math.max(scaledExecuteQueueLength, scaledQueueLength);
            load = Math.max(scaledTxTimeInQueue, adjustedQueueLoad);
            if (scaledQueueLength > this.highThreshold) {
            }
            if (scaledExecuteQueueLength > this.highThreshold) {
            }
            if (scaledTxTimeInQueue > this.highThreshold) {
            }
        }
        let lastCycle = Context.p2p.state.getLastCycle();
        if (lastCycle == null) {
            return;
        }
        else if (this.lastEmitCycle != lastCycle.counter) {
            this.lastEmitCycle = lastCycle.counter;
            if (load > this.highThreshold) {
                this.emit('highLoad');
            }
            if (load < this.lowThreshold) {
                this.emit('lowLoad');
            }
        }
        this.load = load;
    }
    getCurrentLoad() {
        return this.load;
    }
    getCurrentNodeLoad() {
        return this.nodeLoad;
    }
    getQueueLoad() {
        return {
            txTimeInQueue: this.scaledTxTimeInQueue,
            queueLength: this.scaledQueueLength,
            executeQueueLength: this.scaledExecuteQueueLength,
        };
    }
}
export default LoadDetection;