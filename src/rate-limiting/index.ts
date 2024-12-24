import LoadDetection from '../load-detection';
import { NodeLoad } from '../utils/profiler';
import { nestedCountersInstance } from '../utils/nestedCounters';
import Log4js from 'log4js';
import { shardusGetTime } from '../network';
import { activeIdToPartition } from '../p2p/NodeList';
import * as Self from '../p2p/Self';
import * as Context from '../p2p/Context';
import { logFlags } from '../logger';
interface RateLimiting {
    limitRate: boolean;
    loadLimit: NodeLoad;
    seqLogger: Log4js.Logger;
}
class RateLimiting {
    constructor(config, seqLogger) {
        this.limitRate = config.limitRate;
        this.loadLimit = config.loadLimit;
        this.seqLogger = seqLogger;
    }
    calculateThrottlePropotion(load, limit) {
        const throttleRange = 1 - limit;
        const throttleAmount = load - limit;
        const throttleProportion = throttleAmount / throttleRange;
        return throttleProportion;
    }
    getWinningLoad(nodeLoad, queueLoad) {
        let loads = { ...nodeLoad, ...queueLoad };
        let maxThrottle: number = 0;
        let loadType: any;
        for (let key in loads) {
            if (this.loadLimit[key] == null) {
                continue;
            }
            if (loads[key] < this.loadLimit[key])
                continue;
            let throttle = this.calculateThrottlePropotion(loads[key], this.loadLimit[key]);
            if (throttle > maxThrottle) {
                maxThrottle = throttle;
                loadType = key;
            }
        }
        if (loadType) {
        }
        return {
            throttle: maxThrottle,
            loadType,
        };
    }
    isOverloaded(txId: string) {
        if (!this.limitRate)
            return false;
        const nodeLoad = Context.shardus.loadDetection.getCurrentNodeLoad();
        const queueLoad = Context.shardus.loadDetection.getQueueLoad();
        let { throttle, loadType } = this.getWinningLoad(nodeLoad, queueLoad);
        if (throttle > 0) {
        }
        let overloaded = Math.random() < throttle;
        if (overloaded) {
        }
        return overloaded;
    }
    configUpdated() {
        try {
            if (this.limitRate !== Context.config.rateLimiting.limitRate) {
                this.limitRate = Context.config.rateLimiting.limitRate;
            }
            if (JSON.stringify(this.loadLimit) !== JSON.stringify(Context.config.rateLimiting.loadLimit)) {
                this.loadLimit = Context.config.rateLimiting.loadLimit;
            }
        }
        catch (e) {
        }
    }
}
export default RateLimiting;