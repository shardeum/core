import * as Shardus from '../shardus/shardus-types';
import * as utils from '../utils';
import Profiler from '../utils/profiler';
import Crypto from '../crypto';
import Logger, { logFlags } from '../logger';
import StateManager from '.';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { AccountHashCache, AccountHashCacheMain3, CycleShardData, AccountHashCacheHistory, AccountHashCacheList, } from './state-manager-types';
import { Logger as Log4jsLogger } from 'log4js';
class AccountCache {
    app: Shardus.App;
    crypto: Crypto;
    config: Shardus.StrictServerConfiguration;
    profiler: Profiler;
    logger: Logger;
    mainLogger: Log4jsLogger;
    fatalLogger: Log4jsLogger;
    shardLogger: Log4jsLogger;
    statsLogger: Log4jsLogger;
    accountsHashCache3: AccountHashCacheMain3;
    cacheUpdateQueue: AccountHashCacheList;
    statemanager_fatal: (key: string, log: string) => void;
    stateManager: StateManager;
    constructor(stateManager: StateManager, profiler: Profiler, app: Shardus.App, logger: Logger, crypto: Crypto, config: Shardus.StrictServerConfiguration) {
        this.crypto = crypto;
        this.app = app;
        this.logger = logger;
        this.config = config;
        this.profiler = profiler;
        if (logger == null) {
            return;
        }
        this.mainLogger = logger.getLogger('main');
        this.fatalLogger = logger.getLogger('fatal');
        this.shardLogger = logger.getLogger('shardDump');
        this.statsLogger = logger.getLogger('statsDump');
        this.statemanager_fatal = stateManager.statemanager_fatal;
        this.stateManager = stateManager;
        this.accountsHashCache3 = {
            currentCalculationCycle: -1,
            workingHistoryList: { accountIDs: [], accountHashesSorted: [] },
            accountHashMap: new Map(),
            futureHistoryList: { accountIDs: [], accountHashesSorted: [] },
        };
        this.cacheUpdateQueue = { accountIDs: [], accountHashesSorted: [] };
    }
    resetAccountCache(): void {
        this.accountsHashCache3 = {
            currentCalculationCycle: -1,
            workingHistoryList: { accountIDs: [], accountHashesSorted: [] },
            accountHashMap: new Map(),
            futureHistoryList: { accountIDs: [], accountHashesSorted: [] },
        };
        this.cacheUpdateQueue = { accountIDs: [], accountHashesSorted: [] };
    }
    updateAccountHash(accountId: string, accountHash: string, timestamp: number, cycle: number): void {
        if (accountHash == null) {
            const stack = new Error().stack;
            this.statemanager_fatal('updateAccountHash hash=null', 'updateAccountHash hash=null' + stack);
        }
        if (cycle < 0 || cycle == null) {
            const stack = new Error().stack;
            this.statemanager_fatal(`updateAccountHash cycle == ${cycle}`, `updateAccountHash cycle == ${cycle} ${stack}`);
        }
        let accountHashCacheHistory: AccountHashCacheHistory;
        if (this.accountsHashCache3.accountHashMap.has(accountId) === false) {
            accountHashCacheHistory = {
                lastSeenCycle: -1,
                lastSeenSortIndex: -1,
                queueIndex: { id: -1, idx: -1 },
                accountHashList: [],
                lastStaleCycle: -1,
                lastUpdateCycle: -1,
            };
            this.accountsHashCache3.accountHashMap.set(accountId, accountHashCacheHistory);
        }
        else {
            accountHashCacheHistory = this.accountsHashCache3.accountHashMap.get(accountId);
        }
        if (this.accountsHashCache3.currentCalculationCycle === -1) {
            if (this.stateManager?.currentCycleShardData != null) {
                this.accountsHashCache3.currentCalculationCycle =
                    this.stateManager.currentCycleShardData.cycleNumber - 1;
                if (this.accountsHashCache3.currentCalculationCycle < 0) {
                    this.accountsHashCache3.currentCalculationCycle = 0;
                }
            }
            else {
                this.statemanager_fatal(`updateAccountHash: error getting cycle number ${this.stateManager.currentCycleShardData.cycleNumber}`, `updateAccountHash: error getting cycle number c:${this.stateManager.currentCycleShardData.cycleNumber} `);
            }
        }
        let updateIsNewerHash = false;
        if (accountHashCacheHistory.lastStaleCycle > 0 &&
            accountHashCacheHistory.lastStaleCycle > accountHashCacheHistory.lastSeenCycle) {
        }
        accountHashCacheHistory.lastSeenCycle = this.accountsHashCache3.currentCalculationCycle;
        if (cycle > accountHashCacheHistory.lastUpdateCycle) {
            accountHashCacheHistory.lastUpdateCycle = cycle;
        }
        const accountHashList: AccountHashCache[] = accountHashCacheHistory.accountHashList;
        const accountHashData: AccountHashCache = { t: timestamp, h: accountHash, c: cycle };
        if (accountHashList.length === 0) {
            accountHashList.push(accountHashData);
            updateIsNewerHash = true;
        }
        else {
            if (accountHashList.length > 0) {
                const current = accountHashList[0];
                if (current.c === cycle) {
                    if (timestamp > current.t) {
                        current.h = accountHash;
                        current.t = timestamp;
                        updateIsNewerHash = true;
                    }
                    else {
                    }
                }
                else if (cycle > current.c || timestamp > current.t) {
                    accountHashList.unshift(accountHashData);
                    while (accountHashList.length > 3 &&
                        accountHashList[accountHashList.length - 1].c < this.accountsHashCache3.currentCalculationCycle) {
                        accountHashList.pop();
                    }
                    if (cycle < current.c && timestamp > current.t) {
                        this.statemanager_fatal('updateAccountHash: cycleCalcOff', `updateAccountHash: older cycle but newer timestamp :${cycle} < ${current.c} && ${timestamp} > ${current.t} `);
                    }
                    updateIsNewerHash = true;
                }
                else {
                    let idx = 0;
                    let doInsert = true;
                    for (let i = 0; i < accountHashList.length; i++) {
                        const hashCacheEntry = accountHashList[i];
                        if (hashCacheEntry.c === cycle) {
                            hashCacheEntry.h = accountHash;
                            hashCacheEntry.t = timestamp;
                            doInsert = false;
                            break;
                        }
                        idx++;
                        if (cycle > hashCacheEntry.c) {
                            idx = i;
                            break;
                        }
                    }
                    if (doInsert) {
                        accountHashList.splice(idx, 0, accountHashData);
                    }
                    else {
                    }
                }
            }
        }
        if (updateIsNewerHash) {
            this.cacheUpdateQueue.accountHashesSorted.push(accountHashData);
            this.cacheUpdateQueue.accountIDs.push(accountId);
        }
    }
    hasAccount(accountId: string): boolean {
        return this.accountsHashCache3.accountHashMap.has(accountId);
    }
    getAccountHash(accountId: string): AccountHashCache {
        if (this.accountsHashCache3.accountHashMap.has(accountId) === false) {
            return null;
        }
        const accountHashCacheHistory: AccountHashCacheHistory = this.accountsHashCache3.accountHashMap.get(accountId);
        if (accountHashCacheHistory.accountHashList.length > 0) {
            return accountHashCacheHistory.accountHashList[0];
        }
    }
    sortByTimestampIdAsc(first, second): number {
        if (first.t < second.t) {
            return -1;
        }
        if (first.t > second.t) {
            return 1;
        }
        if (first.id < second.id) {
            return -1;
        }
        if (first.id > second.id) {
            return 1;
        }
        return 0;
    }
    processCacheUpdates(cycleShardData: CycleShardData): void {
        const cycleToProcess = cycleShardData.cycleNumber;
        const nextCycleToProcess = cycleToProcess + 1;
        const nextCacheUpdateQueue: AccountHashCacheList = {
            accountHashesSorted: [],
            accountIDs: [],
        };
        this.accountsHashCache3.workingHistoryList.accountHashesSorted = [];
        this.accountsHashCache3.workingHistoryList.accountIDs = [];
        for (let index = 0; index < this.cacheUpdateQueue.accountIDs.length; index++) {
            const accountHashData: AccountHashCache = this.cacheUpdateQueue.accountHashesSorted[index];
            if (accountHashData == null) {
                continue;
            }
            const accountID = this.cacheUpdateQueue.accountIDs[index];
            if (accountID == null) {
                this.statemanager_fatal('buildPartitionHashesForNode: accountID==null unexpected', `buildPartitionHashesForNode: accountID==null unexpected:${utils.stringifyReduce(accountHashData)} `);
                continue;
            }
            if (accountHashData.c > cycleToProcess) {
                nextCacheUpdateQueue.accountHashesSorted.push(accountHashData);
                nextCacheUpdateQueue.accountIDs.push(accountID);
                continue;
            }
            this.stateManager.accountPatcher.updateAccountHash(accountID, accountHashData.h);
        }
        this.cacheUpdateQueue = nextCacheUpdateQueue;
        this.accountsHashCache3.currentCalculationCycle = nextCycleToProcess;
    }
    getAccountDebugObject(id: string): AccountHashCacheHistory {
        const accountHashFull = this.stateManager.accountCache.accountsHashCache3.accountHashMap.get(id);
        return accountHashFull;
    }
    getDebugStats(): [
        number,
        number
    ] {
        const workingAccounts = this.accountsHashCache3.workingHistoryList.accountIDs.length;
        const mainMap = this.accountsHashCache3.accountHashMap.size;
        return [workingAccounts, mainMap];
    }
    getAccountHashHistoryItem(accountID: string): AccountHashCacheHistory {
        const accountHashCacheHistory: AccountHashCacheHistory = this.stateManager.accountCache.accountsHashCache3.accountHashMap.get(accountID);
        return accountHashCacheHistory;
    }
}
export default AccountCache;