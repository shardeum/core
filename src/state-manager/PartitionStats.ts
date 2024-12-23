import * as Shardus from '../shardus/shardus-types';
import * as utils from '../utils';
import { Utils } from '@shardus/types';
import Profiler from '../utils/profiler';
import Crypto from '../crypto';
import Logger, { logFlags } from '../logger';
import AccountCache from './AccountCache';
import StateManager from '.';
import { AccountHashCache, QueueEntry, CycleShardData } from './state-manager-types';
import { StateManager as StateManagerTypes } from '@shardus/types';
import * as Context from '../p2p/Context';
import * as Wrapper from '../p2p/Wrapper';
import { isDebugModeMiddleware } from '../network/debugMiddleware';
import Log4js from 'log4js';
import { Response } from 'express-serve-static-core';
type RawAccountData = {
    data: {
        data: {
            balance: string;
        };
    } | {
        balance: string;
    };
} | {
    balance: string;
};
type Line = {
    raw: string;
    file: {
        owner: string;
    };
};
class PartitionStats {
    app: Shardus.App;
    crypto: Crypto;
    config: Shardus.StrictServerConfiguration;
    profiler: Profiler;
    logger: Logger;
    stateManager: StateManager;
    mainLogger: Log4js.Logger;
    fatalLogger: Log4js.Logger;
    shardLogger: Log4js.Logger;
    statsLogger: Log4js.Logger;
    summaryBlobByPartition: Map<number, StateManagerTypes.StateManagerTypes.SummaryBlob>;
    summaryPartitionCount: number;
    txSummaryBlobCollections: StateManagerTypes.StateManagerTypes.SummaryBlobCollection[];
    extensiveRangeChecking: boolean;
    accountCache: AccountCache;
    invasiveDebugInfo: boolean;
    statsProcessCounter: number;
    maxCyclesToStoreBlob: number;
    statemanager_fatal: (key: string, log: string) => void;
    workQueue: {
        cycle: number;
        fn: (...args: unknown[]) => unknown;
        args: unknown[];
    }[];
    constructor(stateManager: StateManager, profiler: Profiler, app: Shardus.App, logger: Logger, crypto: Crypto, config: Shardus.StrictServerConfiguration, accountCache: AccountCache) {
        if (stateManager == null)
            return;
        this.crypto = crypto;
        this.app = app;
        this.logger = logger;
        this.config = config;
        this.profiler = profiler;
        this.mainLogger = logger.getLogger('main');
        this.fatalLogger = logger.getLogger('fatal');
        this.shardLogger = logger.getLogger('shardDump');
        this.statsLogger = logger.getLogger('statsDump');
        this.statemanager_fatal = stateManager.statemanager_fatal;
        this.stateManager = stateManager;
        this.accountCache = accountCache;
        this.summaryPartitionCount = 4096;
        this.extensiveRangeChecking = true;
        this.summaryBlobByPartition = new Map();
        this.txSummaryBlobCollections = [];
        this.invasiveDebugInfo = false;
        this.statsProcessCounter = 0;
        this.workQueue = [];
        this.maxCyclesToStoreBlob = 10;
        this.initSummaryBlobs();
    }
    setupHandlers(): void {
        Context.network.registerExternalGet('get-stats-dump', isDebugModeMiddleware, (req, res) => {
            let cycle = this.stateManager.currentCycleShardData.cycleNumber - 2;
            if (req.query.cycle != null) {
                cycle = Number(req.query.cycle);
            }
            let cycleShardValues = null;
            if (this.stateManager.shardValuesByCycle.has(cycle)) {
                cycleShardValues = this.stateManager.shardValuesByCycle.get(cycle);
            }
            const blob = this.dumpLogsForCycle(cycle, false, cycleShardValues);
            res.write(Utils.safeStringify(blob) + '\n');
            res.end();
        });
        Context.network.registerExternalGet('get-stats-report-all', isDebugModeMiddleware, async (req, res) => {
            try {
                const raw = req.query.raw;
                const cycleNumber = this.stateManager.currentCycleShardData.cycleNumber - 2;
                res.write(`building shard report c:${cycleNumber} \n`);
                const activeNodes = Wrapper.p2p.state.getNodes();
                const lines = [];
                if (activeNodes) {
                    for (const node of activeNodes.values()) {
                        const getResp = await this.logger._internalHackGetWithResp(`${node.externalIp}:${node.externalPort}/get-stats-dump?cycle=${cycleNumber}`);
                        if (getResp.body != null && getResp.body != '') {
                            lines.push({ raw: getResp.body, file: { owner: `${node.externalIp}:${node.externalPort}` } });
                        }
                    }
                    if (raw === 'true') {
                        res.write(Utils.safeStringify(lines));
                    }
                    else {
                        {
                            const { allPassed, allPassedMetric2, singleVotePartitions, multiVotePartitions, badPartitions, totalTx, } = this.processTxStatsDump(res, this.txStatsTallyFunction, lines);
                            res.write(`TX statsReport${cycleNumber}  : ${allPassed} pass2: ${allPassedMetric2}  single:${singleVotePartitions} multi:${multiVotePartitions} badPartitions:${badPartitions} totalTx:${totalTx}\n`);
                        }
                        {
                            const { allPassed, allPassedMetric2, singleVotePartitions, multiVotePartitions, badPartitions, } = this.processDataStatsDump(res, this.dataStatsTallyFunction, lines);
                            res.write(`DATA statsReport${cycleNumber}  : ${allPassed} pass2: ${allPassedMetric2}  single:${singleVotePartitions} multi:${multiVotePartitions} badPartitions:${badPartitions}\n`);
                        }
                    }
                }
            }
            catch (e) {
                res.write(`${e}\n`);
            }
            res.end();
        });
    }
    getNewSummaryBlob(partition: number): StateManagerTypes.StateManagerTypes.SummaryBlob {
        return { counter: 0, latestCycle: 0, errorNull: 0, partition, opaqueBlob: {} };
    }
    initSummaryBlobs(): void {
    }
    initTXSummaryBlobsForCycle(cycleNumber: number): StateManagerTypes.StateManagerTypes.SummaryBlobCollection {
        const summaryBlobCollection = { cycle: cycleNumber, blobsByPartition: new Map() };
        for (let i = 0; i < this.summaryPartitionCount; i++) {
            summaryBlobCollection.blobsByPartition.set(i, this.getNewSummaryBlob(i));
        }
        this.txSummaryBlobCollections.push(summaryBlobCollection);
        if (this.txSummaryBlobCollections.length > this.maxCyclesToStoreBlob) {
            this.txSummaryBlobCollections = this.txSummaryBlobCollections.slice(this.txSummaryBlobCollections.length - this.maxCyclesToStoreBlob);
        }
        return summaryBlobCollection;
    }
    getOrCreateTXSummaryBlobCollectionByCycle(cycle: number): StateManagerTypes.StateManagerTypes.SummaryBlobCollection {
        let summaryBlobCollectionToUse = null;
        if (cycle < 0) {
            return null;
        }
        for (let i = this.txSummaryBlobCollections.length - 1; i >= 0; i--) {
            const summaryBlobCollection = this.txSummaryBlobCollections[i];
            if (summaryBlobCollection.cycle === cycle) {
                summaryBlobCollectionToUse = summaryBlobCollection;
                break;
            }
        }
        if (summaryBlobCollectionToUse === null) {
            summaryBlobCollectionToUse = this.initTXSummaryBlobsForCycle(cycle);
        }
        return summaryBlobCollectionToUse;
    }
    getSummaryBlobPartition(address: string): number {
        const threebyteHex = address.slice(0, 3);
        const summaryPartition = Number.parseInt(threebyteHex, 16);
        return summaryPartition;
    }
    getSummaryBlob(address: string): StateManagerTypes.StateManagerTypes.SummaryBlob {
        const partition = this.getSummaryBlobPartition(address);
        if (this.summaryBlobByPartition.has(partition) === false) {
            this.summaryBlobByPartition.set(partition, this.getNewSummaryBlob(partition));
        }
        const blob: StateManagerTypes.StateManagerTypes.SummaryBlob = this.summaryBlobByPartition.get(partition);
        return blob;
    }
    hasAccountBeenSeenByStats(accountId: string): boolean {
        return this.accountCache.hasAccount(accountId);
    }
    getConsensusSnapshotPartitions(cycleShardData: CycleShardData): {
        list: number[];
        map: Map<number, boolean>;
    } {
        const result = { list: [], map: new Map() };
        const consensusStartPartition = cycleShardData.nodeShardData.consensusStartPartition;
        const consensusEndPartition = cycleShardData.nodeShardData.consensusEndPartition;
        const outOfRange = this.stateManager.accountPatcher.getNonParitionRanges(cycleShardData, consensusStartPartition, consensusEndPartition, 3);
        if (outOfRange.length === 0) {
            return result;
        }
        let lowN: number, highN: number, lowN2: number, highN2: number;
        let twoRanges = false;
        if (outOfRange.length >= 1) {
            lowN = Number.parseInt(outOfRange[0].low.slice(0, 3), 16) - 1;
            highN = Number.parseInt(outOfRange[0].high.slice(0, 3), 16) + 1;
        }
        if (outOfRange.length >= 2) {
            lowN2 = Number.parseInt(outOfRange[1].low.slice(0, 3), 16) - 1;
            highN2 = Number.parseInt(outOfRange[1].high.slice(0, 3), 16) + 1;
            twoRanges = true;
        }
        for (let i = 0; i < this.summaryPartitionCount; i++) {
            if (i <= highN && i >= lowN) {
                continue;
            }
            if (twoRanges && i <= highN2 && i >= lowN2) {
                continue;
            }
            result.list.push(i);
            result.map.set(i, true);
        }
        return result;
    }
    statsDataSummaryInit(cycle: number, accountId: string, accountDataRaw: unknown, debugMsg: string): void {
        const opCounter = this.statsProcessCounter++;
        const blob: StateManagerTypes.StateManagerTypes.SummaryBlob = this.getSummaryBlob(accountId);
        blob.counter++;
        if (this.accountCache.hasAccount(accountId)) {
            return;
        }
        const accountInfo = this.app.getTimestampAndHashFromAccount(accountDataRaw);
        this.accountCache.updateAccountHash(accountId, accountInfo.hash, accountInfo.timestamp, cycle);
        if (accountDataRaw == null) {
            blob.errorNull++;
            if (logFlags.error)
                this.mainLogger.error(`statsDataSummaryInit errorNull`);
            return;
        }
        if (this.stateManager.feature_generateStats === true) {
            this.workQueue.push({
                cycle,
                fn: this.internalDoInit,
                args: [cycle, blob, accountDataRaw, accountId, opCounter],
            });
        }
    }
    private internalDoInit(cycle: number, blob: StateManagerTypes.StateManagerTypes.SummaryBlob, accountDataRaw: RawAccountData, accountId: string, opCounter: number): void {
        if (cycle > blob.latestCycle) {
            blob.latestCycle = cycle;
        }
        this.app.dataSummaryInit(blob.opaqueBlob, accountDataRaw);
        if (this.invasiveDebugInfo)
            this.addDebugToBlob(blob, accountId);
    }
    statsDataSummaryUpdate(cycle: number, accountDataBefore: unknown, accountDataAfter: Shardus.WrappedData, debugMsg: string): void {
        const opCounter = this.statsProcessCounter++;
        const blob: StateManagerTypes.StateManagerTypes.SummaryBlob = this.getSummaryBlob(accountDataAfter.accountId);
        blob.counter++;
        if (accountDataAfter.data == null) {
            blob.errorNull += 100000000;
            if (logFlags.error)
                this.mainLogger.error(`statsDataSummaryUpdate errorNull 1`);
            return;
        }
        if (accountDataBefore == null) {
            blob.errorNull += 10000000000;
            if (logFlags.error)
                this.mainLogger.error(`statsDataSummaryUpdate errorNull 2`);
            return;
        }
        const accountId = accountDataAfter.accountId;
        const timestamp = accountDataAfter.timestamp;
        const hash = accountDataAfter.stateId;
        if (this.accountCache.hasAccount(accountId)) {
            const accountMemData: AccountHashCache = this.accountCache.getAccountHash(accountId);
            if (accountMemData.t > timestamp) {
                if (logFlags.error)
                    this.mainLogger.error(`statsDataSummaryUpdate: good error?: 2: dont update stats with older data skipping update ${utils.makeShortHash(accountId)}  ${debugMsg}  ${accountMemData.t} > ${timestamp}  afterHash:${utils.makeShortHash(accountDataAfter.stateId)}`);
                return;
            }
        }
        else {
        }
        this.accountCache.updateAccountHash(accountId, hash, timestamp, cycle);
        if (this.stateManager.feature_generateStats === true) {
            this.workQueue.push({
                cycle,
                fn: this.internalDoUpdate,
                args: [cycle, blob, accountDataBefore, accountDataAfter, opCounter],
            });
        }
    }
    private internalDoUpdate(cycle: number, blob: StateManagerTypes.StateManagerTypes.SummaryBlob, accountDataBefore: unknown, accountDataAfter: Shardus.WrappedData, opCounter: number): void {
        if (cycle > blob.latestCycle) {
            blob.latestCycle = cycle;
        }
        this.app.dataSummaryUpdate(blob.opaqueBlob, accountDataBefore, accountDataAfter.data);
        if (this.invasiveDebugInfo)
            this.addDebugToBlob(blob, accountDataAfter.accountId);
    }
    statsTxSummaryUpdate(cycle: number, queueEntry: QueueEntry): void {
        let accountToUseForTXStatBinning = null;
        for (const key of queueEntry.uniqueWritableKeys) {
            accountToUseForTXStatBinning = key;
            break;
        }
        if (accountToUseForTXStatBinning == null) {
            return;
        }
        const partition = this.getSummaryBlobPartition(accountToUseForTXStatBinning);
        const summaryBlobCollection = this.getOrCreateTXSummaryBlobCollectionByCycle(queueEntry.cycleToRecordOn);
        if (summaryBlobCollection != null) {
            const blob: StateManagerTypes.StateManagerTypes.SummaryBlob = summaryBlobCollection.blobsByPartition.get(partition);
            if (cycle > blob.latestCycle) {
                blob.latestCycle = cycle;
            }
            this.app.txSummaryUpdate(blob.opaqueBlob, queueEntry.acceptedTx.data, null);
            blob.counter++;
            if (this.invasiveDebugInfo) {
                if (blob.opaqueBlob.dbg == null) {
                    blob.opaqueBlob.dbg = [];
                }
                blob.opaqueBlob.dbg.push(queueEntry.logID);
                blob.opaqueBlob.dbg.sort();
            }
        }
        else {
            if (logFlags.error || this.invasiveDebugInfo)
                this.mainLogger.error(`statsTxSummaryUpdate no collection for c:${cycle}  tx: ${queueEntry.logID} accForBin:${utils.makeShortHash(accountToUseForTXStatBinning)}`);
        }
    }
    buildStatsReport(cycleShardData: CycleShardData, excludeEmpty = true): StateManagerTypes.StateManagerTypes.StatsClump {
        const cycle = cycleShardData.cycleNumber;
        const nextQueue = [];
        for (const item of this.workQueue) {
            if (item.cycle <= cycle) {
                item.fn.apply(this, item.args);
            }
            else {
                nextQueue.push(item);
            }
        }
        this.workQueue = nextQueue;
        const statsDump: StateManagerTypes.StateManagerTypes.StatsClump = {
            error: false,
            cycle,
            dataStats: [],
            txStats: [],
            covered: [],
            coveredParititionCount: 0,
            skippedParitionCount: 0,
        };
        let coveredParitionCount = 0;
        let skippedParitionCount = 0;
        if (cycleShardData == null) {
            if (logFlags.error)
                this.mainLogger.error(`getCoveredStatsPartitions missing cycleShardData`);
            statsDump.error = true;
            return statsDump;
        }
        let covered: {
            list: number[];
            map: Map<number, boolean>;
        } = null;
        covered = this.getConsensusSnapshotPartitions(cycleShardData);
        statsDump.covered = covered.list;
        for (const key of this.summaryBlobByPartition.keys()) {
            const summaryBlob = this.summaryBlobByPartition.get(key);
            if (covered.map.has(key) === false) {
                skippedParitionCount++;
                continue;
            }
            if (excludeEmpty === false || summaryBlob.counter > 0) {
                const cloneSummaryBlob = Utils.safeJsonParse(Utils.safeStringify(summaryBlob));
                statsDump.dataStats.push(cloneSummaryBlob);
            }
            coveredParitionCount++;
            continue;
        }
        const summaryBlobCollection = this.getOrCreateTXSummaryBlobCollectionByCycle(cycle);
        if (summaryBlobCollection != null) {
            for (const key of summaryBlobCollection.blobsByPartition.keys()) {
                const summaryBlob = summaryBlobCollection.blobsByPartition.get(key);
                if (covered.map.has(key) === false) {
                    continue;
                }
                if (excludeEmpty === false || summaryBlob.counter > 0) {
                    statsDump.txStats.push(summaryBlob);
                }
            }
        }
        statsDump.coveredParititionCount = coveredParitionCount;
        statsDump.skippedParitionCount = skippedParitionCount;
        return statsDump;
    }
    dumpLogsForCycle(cycle: number, writeTofile = true, cycleShardData: CycleShardData = null): {
        cycle: number;
        dataStats: any[];
        txStats: any[];
        covered: any[];
        cycleDebugNotes: Record<string, never>;
    } {
        const statsDump = { cycle, dataStats: [], txStats: [], covered: [], cycleDebugNotes: {} };
        statsDump.cycleDebugNotes = this.stateManager.cycleDebugNotes;
        let covered = null;
        if (cycleShardData != null) {
            covered = this.getConsensusSnapshotPartitions(cycleShardData);
            statsDump.covered = covered.list;
        }
        for (const key of this.summaryBlobByPartition.keys()) {
            const summaryBlob = this.summaryBlobByPartition.get(key);
            if (summaryBlob.counter > 0) {
                statsDump.dataStats.push(summaryBlob);
            }
        }
        const summaryBlobCollection = this.getOrCreateTXSummaryBlobCollectionByCycle(cycle);
        if (summaryBlobCollection != null) {
            for (const key of summaryBlobCollection.blobsByPartition.keys()) {
                const summaryBlob = summaryBlobCollection.blobsByPartition.get(key);
                if (summaryBlob.counter > 0) {
                    statsDump.txStats.push(summaryBlob);
                }
            }
        }
        if (writeTofile) {
        }
        return statsDump;
    }
    processDataStatsDump(stream: Response<unknown, Record<string, unknown>, number>, tallyFunction: {
        (opaqueBlob: unknown): unknown;
        (arg0: unknown): unknown;
    }, lines: Line[]): {
        allPassed: boolean;
        allPassedMetric2: boolean;
        singleVotePartitions: number;
        multiVotePartitions: number;
        badPartitions: any[];
        dataByParition: Map<any, any>;
    } {
        const dataByParition = new Map();
        let newestCycle = -1;
        const statsBlobs = [];
        for (const line of lines) {
            const index = line.raw.indexOf('{"covered');
            if (index >= 0) {
                const statsStr = line.raw.slice(index);
                let statsObj: {
                    cycle: number;
                    owner: string;
                };
                try {
                    statsObj = Utils.safeJsonParse(statsStr);
                }
                catch (err) {
                    if (logFlags.error)
                        this.mainLogger.error(`Fail to parse statsObj: ${statsStr}`, err);
                    continue;
                }
                if (newestCycle > 0 && statsObj.cycle != newestCycle) {
                    stream.write(`wrong cycle for node: ${line.file.owner} reportCycle:${newestCycle} thisNode:${statsObj.cycle} \n`);
                    continue;
                }
                statsBlobs.push(statsObj);
                if (statsObj.cycle > newestCycle) {
                    newestCycle = statsObj.cycle;
                }
                statsObj.owner = line.file.owner;
            }
        }
        for (const statsObj of statsBlobs) {
            const coveredMap = new Map();
            for (const partition of statsObj.covered) {
                coveredMap.set(partition, true);
            }
            if (statsObj.cycle === newestCycle) {
                for (const dataStatsObj of statsObj.dataStats) {
                    const partition = dataStatsObj.partition;
                    if (coveredMap.has(partition) === false) {
                        continue;
                    }
                    let dataTally: {
                        data: object[];
                        dataStrings: Record<string, number>;
                        differentVotes: number;
                        voters: number;
                        bestVote: unknown;
                        tallyList: unknown[];
                        partition?: unknown;
                    };
                    if (dataByParition.has(partition) === false) {
                        dataTally = {
                            partition,
                            data: [],
                            dataStrings: {},
                            differentVotes: 0,
                            voters: 0,
                            bestVote: 0,
                            tallyList: [],
                        };
                        dataByParition.set(partition, dataTally);
                    }
                    const dataString = Utils.safeStringify(dataStatsObj.opaqueBlob);
                    dataTally = dataByParition.get(partition);
                    dataTally.data.push(dataStatsObj);
                    if (dataTally.dataStrings[dataString] == null) {
                        dataTally.dataStrings[dataString] = 0;
                        dataTally.differentVotes++;
                    }
                    dataTally.voters++;
                    dataTally.dataStrings[dataString]++;
                    const votes = dataTally.dataStrings[dataString];
                    if (votes > dataTally.bestVote) {
                        dataTally.bestVote = votes;
                    }
                    if (tallyFunction != null) {
                        dataTally.tallyList.push(tallyFunction(dataStatsObj.opaqueBlob));
                    }
                }
            }
        }
        let allPassed = true;
        let allPassedMetric2 = true;
        let singleVotePartitions = 0;
        let multiVotePartitions = 0;
        const badPartitions = [];
        for (const dataTally of dataByParition.values()) {
            if (dataTally.differentVotes === 1) {
                singleVotePartitions++;
            }
            if (dataTally.differentVotes > 1) {
                multiVotePartitions++;
                allPassed = false;
                badPartitions.push(dataTally.partition);
                if (dataTally.bestVote < Math.ceil(dataTally.voters / 3)) {
                    allPassedMetric2 = false;
                }
            }
        }
        return {
            allPassed,
            allPassedMetric2,
            singleVotePartitions,
            multiVotePartitions,
            badPartitions,
            dataByParition,
        };
    }
    processTxStatsDump(stream: Response<unknown, Record<string, unknown>, number>, tallyFunction: {
        (opaqueBlob: {
            totalTx?: number;
        }): number;
        (arg0: unknown): unknown;
    }, lines: Line[]): {
        allPassed: boolean;
        allPassedMetric2: boolean;
        singleVotePartitions: number;
        multiVotePartitions: number;
        badPartitions: unknown[];
        totalTx: number;
    } {
        const dataByParition = new Map();
        let newestCycle = -1;
        const statsBlobs = [];
        for (const line of lines) {
            const index = line.raw.indexOf('{"covered');
            if (index >= 0) {
                const statsStr = line.raw.slice(index);
                let statsObj: {
                    cycle: number;
                    owner: string;
                };
                try {
                    statsObj = Utils.safeJsonParse(statsStr);
                }
                catch (err) {
                    if (logFlags.error)
                        this.mainLogger.error(`Fail to parse statsObj: ${statsStr}`, err);
                    continue;
                }
                if (newestCycle > 0 && statsObj.cycle != newestCycle) {
                    stream.write(`wrong cycle for node: ${line.file.owner} reportCycle:${newestCycle} thisNode:${statsObj.cycle} \n`);
                    continue;
                }
                statsBlobs.push(statsObj);
                if (statsObj.cycle > newestCycle) {
                    newestCycle = statsObj.cycle;
                }
                statsObj.owner = line.file.owner;
            }
        }
        const txCountMap = new Map();
        for (const statsObj of statsBlobs) {
            if (!txCountMap.has(statsObj.owner)) {
                txCountMap.set(statsObj.owner, []);
            }
            const coveredMap = new Map();
            for (const partition of statsObj.covered) {
                coveredMap.set(partition, true);
            }
            const dataTallyListForThisOwner = [];
            for (const txStatsObj of statsObj.txStats) {
                const partition = txStatsObj.partition;
                if (coveredMap.has(partition) === false) {
                    continue;
                }
                let dataTally: {
                    data: unknown[];
                    dataStrings: Record<string, number>;
                    differentVotes: number;
                    voters: number;
                    bestVote: number;
                    bestVoteValue: number;
                    tallyList: unknown[];
                    partition?: number;
                };
                if (dataByParition.has(partition) === false) {
                    dataTally = {
                        partition,
                        data: [],
                        dataStrings: {},
                        differentVotes: 0,
                        voters: 0,
                        bestVote: 0,
                        bestVoteValue: null,
                        tallyList: [],
                    };
                    dataByParition.set(partition, dataTally);
                }
                const dataString = Utils.safeStringify(txStatsObj.opaqueBlob);
                dataTally = dataByParition.get(partition);
                dataTally.data.push(txStatsObj);
                if (dataTally.dataStrings[dataString] == null) {
                    dataTally.dataStrings[dataString] = 0;
                    dataTally.differentVotes++;
                }
                dataTally.voters++;
                dataTally.dataStrings[dataString]++;
                const votes = dataTally.dataStrings[dataString];
                if (votes > dataTally.bestVote) {
                    dataTally.bestVote = votes;
                    dataTally.bestVoteValue = txStatsObj.opaqueBlob;
                }
                if (tallyFunction != null) {
                    dataTally.tallyList.push(tallyFunction(txStatsObj.opaqueBlob));
                    if (dataTally.differentVotes > 1) {
                    }
                    dataTallyListForThisOwner.push(dataTally);
                }
            }
            let totalTx = 0;
            for (const dataTally of dataTallyListForThisOwner) {
                if (dataTally.bestVoteValue) {
                    totalTx += dataTally.bestVoteValue.totalTx;
                }
            }
            txCountMap.set(statsObj.owner, txCountMap.get(statsObj.owner) + totalTx);
        }
        let allPassed = true;
        let allPassedMetric2 = true;
        let singleVotePartitions = 0;
        let multiVotePartitions = 0;
        const badPartitions = [];
        let sum = 0;
        for (const dataTally of dataByParition.values()) {
            sum += dataTally.bestVoteValue.totalTx || 0;
            if (dataTally.differentVotes === 1) {
                singleVotePartitions++;
            }
            if (dataTally.differentVotes > 1) {
                multiVotePartitions++;
                allPassed = false;
                badPartitions.push(dataTally.partition);
                if (dataTally.bestVote < Math.ceil(dataTally.voters / 3)) {
                    allPassedMetric2 = false;
                }
            }
        }
        for (const statsObj of statsBlobs) {
            if (statsObj.cycleDebugNotes != null) {
                for (const [, value] of Object.entries(statsObj.cycleDebugNotes)) {
                    const valueNum = value as number;
                    if (valueNum >= 1) {
                        stream.write(`${statsObj.owner} : ${Utils.safeStringify(statsObj.cycleDebugNotes)}`);
                        break;
                    }
                }
            }
        }
        return {
            allPassed,
            allPassedMetric2,
            singleVotePartitions,
            multiVotePartitions,
            badPartitions,
            totalTx: sum,
        };
    }
    dataStatsTallyFunction(opaqueBlob: {
        totalBalance?: number;
    }): number {
        if (opaqueBlob.totalBalance == null) {
            return 0;
        }
        return opaqueBlob.totalBalance;
    }
    txStatsTallyFunction(opaqueBlob: {
        totalTx?: number;
    }): number {
        if (opaqueBlob.totalTx == null) {
            return 0;
        }
        return opaqueBlob.totalTx;
    }
    debugAccountData(accountData: RawAccountData): string {
        if ('data' in accountData &&
            'data' in accountData.data &&
            'balance' in accountData.data.data &&
            accountData?.data?.data?.balance) {
            return accountData.data.data.balance;
        }
        if ('data' in accountData && 'balance' in accountData.data && accountData.data.balance) {
            return accountData.data.balance;
        }
        if (typeof accountData === 'object' && 'balance' in accountData) {
            return accountData.balance;
        }
        return 'X';
    }
    addDebugToBlob(blob: StateManagerTypes.StateManagerTypes.SummaryBlob, accountID: string): void {
        if (this.invasiveDebugInfo) {
            if (blob.opaqueBlob.dbgData == null) {
                blob.opaqueBlob.dbgData = [];
            }
            const shortID = utils.makeShortHash(accountID);
            if (blob.opaqueBlob.dbgData.indexOf(shortID) === -1) {
                blob.opaqueBlob.dbgData.push(shortID);
                blob.opaqueBlob.dbgData.sort();
            }
        }
    }
}
export default PartitionStats;