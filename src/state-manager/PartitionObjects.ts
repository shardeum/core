import { Logger as Log4jsLogger } from 'log4js';
import StateManager from '.';
import Crypto from '../crypto';
import Logger, { logFlags } from '../logger';
import { P2PModuleContext as P2P } from '../p2p/Context';
import * as Shardus from '../shardus/shardus-types';
import Storage from '../storage';
import * as utils from '../utils';
import Profiler from '../utils/profiler';
import ShardFunctions from './shardFunctions';
import { PartitionCycleReport, PartitionObject, PartitionResult, TempTxRecord, TxTallyList, } from './state-manager-types';
class PartitionObjects {
    app: Shardus.App;
    crypto: Crypto;
    config: Shardus.StrictServerConfiguration;
    profiler: Profiler;
    logger: Logger;
    p2p: P2P;
    storage: Storage;
    stateManager: StateManager;
    mainLogger: Log4jsLogger;
    fatalLogger: Log4jsLogger;
    shardLogger: Log4jsLogger;
    statsLogger: Log4jsLogger;
    statemanager_fatal: (key: string, log: string) => void;
    nextCycleReportToSend: PartitionCycleReport;
    lastCycleReported: number;
    partitionReportDirty: boolean;
    partitionObjectsByCycle: {
        [cycleKey: string]: PartitionObject[];
    };
    ourPartitionResultsByCycle: {
        [cycleKey: string]: PartitionResult[];
    };
    recentPartitionObjectsByCycleByHash: {
        [cycleKey: string]: {
            [hash: string]: PartitionObject;
        };
    };
    tempTXRecords: TempTxRecord[];
    txByCycleByPartition: {
        [cycleKey: string]: {
            [partitionKey: string]: TxTallyList;
        };
    };
    allPartitionResponsesByCycleByPartition: {
        [cycleKey: string]: {
            [partitionKey: string]: PartitionResult[];
        };
    };
    resetAndApplyPerPartition: boolean;
    constructor(stateManager: StateManager, profiler: Profiler, app: Shardus.App, logger: Logger, storage: Storage, p2p: P2P, crypto: Crypto, config: Shardus.StrictServerConfiguration) {
        this.crypto = crypto;
        this.app = app;
        this.logger = logger;
        this.config = config;
        this.profiler = profiler;
        this.p2p = p2p;
        this.storage = storage;
        this.stateManager = stateManager;
        this.mainLogger = logger.getLogger('main');
        this.fatalLogger = logger.getLogger('fatal');
        this.shardLogger = logger.getLogger('shardDump');
        this.statsLogger = logger.getLogger('statsDump');
        this.statemanager_fatal = stateManager.statemanager_fatal;
        this.nextCycleReportToSend = null;
        this.lastCycleReported = -1;
        this.partitionReportDirty = false;
        this.partitionObjectsByCycle = {};
        this.ourPartitionResultsByCycle = {};
        this.recentPartitionObjectsByCycleByHash = {};
        this.tempTXRecords = [];
        this.txByCycleByPartition = {};
        this.allPartitionResponsesByCycleByPartition = {};
        this.resetAndApplyPerPartition = false;
    }
    getPartitionReport(consensusOnly: boolean, smallHashes: boolean): PartitionCycleReport {
        let response: PartitionCycleReport = {};
        if (this.nextCycleReportToSend != null) {
            const shardValues = this.stateManager.shardValuesByCycle.get(this.nextCycleReportToSend.cycleNumber);
            const consensusStartPartition = shardValues.nodeShardData.consensusStartPartition;
            const consensusEndPartition = shardValues.nodeShardData.consensusEndPartition;
            response = { res: [], cycleNumber: this.nextCycleReportToSend.cycleNumber };
            if (this.lastCycleReported < this.nextCycleReportToSend.cycleNumber ||
                this.partitionReportDirty === true) {
                if (smallHashes === true) {
                    for (const r of this.nextCycleReportToSend.res) {
                        r.h = utils.makeShortHash(r.h);
                    }
                }
                for (const r of this.nextCycleReportToSend.res) {
                    if (consensusOnly) {
                        if (ShardFunctions.partitionInWrappingRange(r.i, consensusStartPartition, consensusEndPartition)) {
                            response.res.push(r);
                        }
                    }
                    else {
                        response.res.push(r);
                    }
                }
                this.lastCycleReported = this.nextCycleReportToSend.cycleNumber;
                this.nextCycleReportToSend = null;
                this.partitionReportDirty = false;
            }
        }
        return response;
    }
    setupHandlers() { }
}
export default PartitionObjects;