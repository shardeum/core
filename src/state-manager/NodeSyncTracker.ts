import * as Shardus from '../shardus/shardus-types';
import { StateManager as StateManagerTypes } from '@shardus/types';
import * as utils from '../utils';
import { SimpleRange, GlobalAccountReportResp, GetAccountData3Resp, QueueEntry, GetAccountData3Req, } from './state-manager-types';
import { nestedCountersInstance } from '../utils/nestedCounters';
import AccountSync from './AccountSync';
import { logFlags } from '../logger';
import { errorToStringFull } from '../utils';
import { P2PModuleContext as P2P, stateManager } from '../p2p/Context';
import DataSourceHelper from './DataSourceHelper';
import { shardusGetTime } from '../network';
import { GetAccountDataByListReq, serializeGetAccountDataByListReq } from '../types/GetAccountDataByListReq';
import { deserializeGetAccountDataByListResp, GetAccountDataByListResp, } from '../types/GetAccountDataByListResp';
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum';
import { AppObjEnum } from '../shardus/shardus-types';
import { GetAccountDataReqSerializable, serializeGetAccountDataReq } from '../types/GetAccountDataReq';
import { deserializeGetAccountDataResp, GetAccountDataRespSerializable } from '../types/GetAccountDataResp';
import { ResponseError } from '../types/ResponseError';
export interface SyncTrackerInterface {
    syncStarted: boolean;
    syncFinished: boolean;
    range: StateManagerTypes.shardFunctionTypes.BasicAddressRange;
    queueEntries: QueueEntry[];
    isGlobalSyncTracker: boolean;
    globalAddressMap: {
        [address: string]: boolean;
    };
    isPartOfInitialSync: boolean;
    keys: {
        [address: string]: boolean;
    };
    initByRange(accountSync: AccountSync, p2p: P2P, index: number, range: StateManagerTypes.shardFunctionTypes.BasicAddressRange, cycle: number, initalSync?: boolean): void;
    initGlobal(accountSync: AccountSync, p2p: P2P, index: number, cycle: number, initalSync?: boolean): void;
    syncStateDataForRange2(): Promise<void>;
    syncStateDataGlobals(): Promise<void>;
}
export default class NodeSyncTracker implements SyncTrackerInterface {
    accountSync: AccountSync;
    p2p: P2P;
    syncStarted: boolean;
    syncFinished: boolean;
    range: StateManagerTypes.shardFunctionTypes.BasicAddressRange;
    cycle: number;
    index: number;
    queueEntries: QueueEntry[];
    isGlobalSyncTracker: boolean;
    globalAddressMap: {
        [address: string]: boolean;
    };
    isPartOfInitialSync: boolean;
    keys: {
        [address: string]: boolean;
    };
    dataSourceHelper: DataSourceHelper;
    currentRange: SimpleRange;
    addressRange: SimpleRange;
    combinedAccountData: Shardus.WrappedData[];
    accountsWithStateConflict: Shardus.WrappedData[];
    failedAccounts: string[];
    missingAccountData: string[];
    mapAccountData: {
        [accountID: string]: Shardus.WrappedData;
    };
    combinedAccountStateData: Shardus.StateTableObject[];
    partitionStartTimeStamp: number;
    restartCount: number;
    reset(): void {
        this.addressRange = null;
        this.mapAccountData = {};
        this.accountsWithStateConflict = [];
        this.combinedAccountData = [];
        this.failedAccounts = [];
        this.syncStarted = false;
        this.syncFinished = false;
        this.restartCount = 0;
    }
    initByRange(accountSync: AccountSync, p2p: P2P, index: number, range: StateManagerTypes.shardFunctionTypes.BasicAddressRange, cycle: number, initalSync = false): void {
        this.reset();
        this.accountSync = accountSync;
        this.p2p = p2p;
        this.range = range;
        this.queueEntries = [];
        this.cycle = cycle;
        this.index = index;
        this.isGlobalSyncTracker = false;
        this.globalAddressMap = {};
        this.isPartOfInitialSync = initalSync;
        this.keys = {};
        this.dataSourceHelper = new DataSourceHelper(this.accountSync.stateManager);
    }
    initGlobal(accountSync: AccountSync, p2p: P2P, index: number, cycle: number, initalSync = false): void {
        this.reset();
        this.accountSync = accountSync;
        this.p2p = p2p;
        this.range = undefined;
        this.queueEntries = [];
        this.cycle = cycle;
        this.index = index;
        this.isGlobalSyncTracker = true;
        this.globalAddressMap = {};
        this.isPartOfInitialSync = initalSync;
        this.keys = {};
        this.dataSourceHelper = new DataSourceHelper(this.accountSync.stateManager);
    }
    async syncStateDataForRange2(): Promise<void> {
        let retry = true;
        while (retry) {
            retry = false;
            try {
                if (this.accountSync.debugFail3) {
                    await utils.sleep(3000);
                    throw new Error('debugFail3 syncStateDataForRange2');
                }
                let partition = 'notUsed';
                this.currentRange = this.range;
                this.addressRange = this.range;
                this.partitionStartTimeStamp = shardusGetTime();
                const lowAddress = this.addressRange.low;
                const highAddress = this.addressRange.high;
                partition = `${utils.stringifyReduce(lowAddress)} - ${utils.stringifyReduce(highAddress)}`;
                const accountsSaved = await this.syncAccountData2(lowAddress, highAddress);
                this.failedAccounts = [];
            }
            catch (error) {
                if (error.message.includes('reset-sync-ranges')) {
                    this.accountSync.statemanager_fatal(`syncStateDataForRange_reset-sync-ranges`, 'DATASYNC: reset-sync-ranges: ' + errorToStringFull(error));
                    throw new Error('reset-sync-ranges');
                }
                else if (error.message.includes('FailAndRestartPartition')) {
                    this.accountSync.statemanager_fatal(`syncStateDataForRange_ex_failandrestart`, 'DATASYNC: FailAndRestartPartition: ' + errorToStringFull(error));
                    retry = await this.tryRetry('syncStateDataForRange 1');
                }
                else {
                    this.accountSync.statemanager_fatal(`syncStateDataForRange_ex`, 'syncStateDataForPartition failed: ' + errorToStringFull(error));
                    retry = await this.tryRetry('syncStateDataForRange 2');
                }
            }
        }
    }
    async syncStateDataGlobals(): Promise<void> {
        let retry = true;
        while (retry) {
            retry = false;
            try {
                const partition = 'globals!';
                let remainingAccountsToSync = [];
                this.partitionStartTimeStamp = shardusGetTime();
                if (this.accountSync.debugFail3) {
                    await utils.sleep(3000);
                    throw new Error('debugFail3 syncStateDataGlobals');
                }
                const globalReport: GlobalAccountReportResp = await this.accountSync.getRobustGlobalReport('syncTrackerGlobal');
                this.dataSourceHelper.initWithList(this.accountSync.lastWinningGlobalReportNodes);
                let hasAllGlobalData = false;
                if (globalReport.accounts.length === 0) {
                    this.accountSync.setGlobalSyncFinished();
                    return;
                }
                let accountReportsByID: {
                    [id: string]: {
                        id: string;
                        hash: string;
                        timestamp: number;
                    };
                } = {};
                for (const report of globalReport.accounts) {
                    remainingAccountsToSync.push(report.id);
                    accountReportsByID[report.id] = report;
                }
                let accountData: Shardus.WrappedData[] = [];
                const accountDataById: {
                    [id: string]: Shardus.WrappedData;
                } = {};
                let globalReport2: GlobalAccountReportResp = { ready: false, combinedHash: '', accounts: [] };
                let maxTries = 20;
                if (this.accountSync.dataSourceTest === true) {
                    if (this.dataSourceHelper.tryNextDataSourceNode('syncAccountData1') == false) {
                        throw new Error('out of account nodes to ask: dataSourceTest');
                    }
                    while (this.accountSync.debugFail4) {
                        await utils.sleep(1000);
                        if (this.dataSourceHelper.tryNextDataSourceNode('syncAccountData1 debugFail4') == false) {
                            throw new Error('out of account nodes to ask: dataSourceTest debugFail4');
                        }
                    }
                }
                while (hasAllGlobalData === false) {
                    maxTries--;
                    if (maxTries <= 0) {
                        if (logFlags.error)
                            this.accountSync.mainLogger.error(`DATASYNC: syncStateDataGlobals max tries excceded `);
                        return;
                    }
                    if (this.accountSync.stateManager.isNodeValidForInternalMessage(this.dataSourceHelper.dataSourceNode.id, 'syncStateDataGlobals', true, true) === false) {
                        if (this.dataSourceHelper.tryNextDataSourceNode('syncStateDataGlobals1') == false) {
                            throw new Error('out of account nodes to ask: syncStateDataGlobals1');
                        }
                        continue;
                    }
                    const message = { accountIds: remainingAccountsToSync };
                    let result;
                    result = await this.p2p.askBinary<GetAccountDataByListReq, GetAccountDataByListResp>(this.dataSourceHelper.dataSourceNode, InternalRouteEnum.binary_get_account_data_by_list, message, serializeGetAccountDataByListReq, deserializeGetAccountDataByListResp, {});
                    if (result == null) {
                        if (logFlags.verbose)
                            if (logFlags.error)
                                this.accountSync.mainLogger.error('ASK FAIL syncStateTableData result == null');
                        if (this.dataSourceHelper.tryNextDataSourceNode('syncStateDataGlobals2') == false) {
                            throw new Error('out of account nodes to ask: syncStateDataGlobals2');
                        }
                        continue;
                    }
                    if (result.accountData == null) {
                        if (logFlags.verbose)
                            if (logFlags.error)
                                this.accountSync.mainLogger.error('ASK FAIL syncStateTableData result.accountData == null');
                        if (this.dataSourceHelper.tryNextDataSourceNode('syncStateDataGlobals3') == false) {
                            throw new Error('out of account nodes to ask: syncStateDataGlobals3');
                        }
                        continue;
                    }
                    accountData = accountData.concat(result.accountData);
                    globalReport2 = await this.accountSync.getRobustGlobalReport('syncTrackerGlobal2');
                    this.dataSourceHelper.initWithList(this.accountSync.lastWinningGlobalReportNodes);
                    const accountReportsByID2: {
                        [id: string]: {
                            id: string;
                            hash: string;
                            timestamp: number;
                        };
                    } = {};
                    for (const report of globalReport2.accounts) {
                        accountReportsByID2[report.id] = report;
                    }
                    hasAllGlobalData = true;
                    remainingAccountsToSync = [];
                    for (const account of accountData) {
                        accountDataById[account.accountId] = account;
                    }
                    for (const report of globalReport2.accounts) {
                        const data = accountDataById[report.id];
                        if (data == null) {
                            hasAllGlobalData = false;
                            remainingAccountsToSync.push(report.id);
                        }
                        else if (data.stateId !== report.hash) {
                            hasAllGlobalData = false;
                            remainingAccountsToSync.push(report.id);
                        }
                    }
                    accountReportsByID = accountReportsByID2;
                }
                const dataToSet = [];
                const goodAccounts: Shardus.WrappedData[] = [];
                for (const report of globalReport2.accounts) {
                    const accountData = accountDataById[report.id];
                    if (accountData != null) {
                        dataToSet.push(accountData);
                        goodAccounts.push(accountData);
                    }
                }
                const failedHashes = await this.accountSync.stateManager.checkAndSetAccountData(dataToSet, 'syncStateDataGlobals', true);
                this.accountSync.syncStatement.numGlobalAccounts += dataToSet.length;
                await this.accountSync.stateManager.writeCombinedAccountDataToBackups(goodAccounts, failedHashes);
                if (failedHashes && failedHashes.length > 0) {
                    throw new Error('setting global data falied');
                }
            }
            catch (error) {
                if (error.message.includes('FailAndRestartPartition')) {
                    this.accountSync.statemanager_fatal(`syncStateDataGlobals_ex_failandrestart`, 'DATASYNC: syncStateDataGlobals FailAndRestartPartition: ' + errorToStringFull(error));
                    retry = await this.tryRetry('syncStateDataGlobals 1 ');
                }
                else {
                    if (error instanceof ResponseError && logFlags.error) {
                        this.accountSync.mainLogger.error(`syncStateDataGlobals_ex: ResponseError encountered. Code: ${error.Code}, AppCode: ${error.AppCode}, Message: ${error.Message}`);
                    }
                    this.accountSync.statemanager_fatal(`syncStateDataGlobals_ex`, 'syncStateDataGlobals failed: ' + errorToStringFull(error));
                    retry = await this.tryRetry('syncStateDataGlobals 2');
                }
            }
        }
        this.accountSync.setGlobalSyncFinished();
    }
    async syncAccountData2(lowAddress: string, highAddress: string): Promise<number> {
        if (this.accountSync.config.stateManager == null) {
            throw new Error('this.config.stateManager == null');
        }
        let totalAccountsSaved = 0;
        const queryLow = lowAddress;
        const queryHigh = highAddress;
        let moreDataRemaining = true;
        this.combinedAccountData = [];
        let loopCount = 0;
        let startTime = 0;
        let lowTimeQuery = startTime;
        this.dataSourceHelper.initByRange(lowAddress, highAddress);
        if (this.dataSourceHelper.dataSourceNode == null) {
            if (logFlags.error)
                this.accountSync.mainLogger.error(`syncAccountData: dataSourceNode == null ${lowAddress} - ${highAddress}`);
            throw new Error('reset-sync-ranges syncAccountData2: dataSourceNode == null');
        }
        let stopIfNextLoopHasNoResults = false;
        let offset = 0;
        let accountOffset = '';
        let askRetriesLeft = 20;
        if (this.accountSync.dataSourceTest === true) {
            if (this.dataSourceHelper.tryNextDataSourceNode('syncAccountData1') == false) {
                throw new Error('out of account nodes to ask: dataSourceTest');
            }
            while (this.accountSync.debugFail4) {
                await utils.sleep(1000);
                if (this.dataSourceHelper.tryNextDataSourceNode('syncAccountData1 debugFail4') == false) {
                    throw new Error('out of account nodes to ask: dataSourceTest debugFail4');
                }
            }
        }
        let restartListRetriesLeft = 5;
        let totalRestartList = 0;
        while (moreDataRemaining) {
            let moreAskTime = 0;
            if (this.accountSync.stateManager.isNodeValidForInternalMessage(this.dataSourceHelper.dataSourceNode.id, 'syncAccountData', true, true) === false) {
                if (this.dataSourceHelper.tryNextDataSourceNode('syncAccountData1') == false) {
                    if (restartListRetriesLeft <= 0) {
                        throw new Error(`out of account nodes to ask: syncAccountData1 + restartList`);
                    }
                    if (this.dataSourceHelper.tryRestartList('syncAccountData1') === true) {
                        await utils.sleep(2000);
                        moreAskTime = 5000;
                        restartListRetriesLeft--;
                        totalRestartList++;
                    }
                    else {
                        throw new Error('out of account nodes to ask: syncAccountData1');
                    }
                }
                continue;
            }
            const message = {
                accountStart: queryLow,
                accountEnd: queryHigh,
                tsStart: startTime,
                maxRecords: this.accountSync.config.stateManager.accountBucketSize,
                offset,
                accountOffset,
            };
            let r: GetAccountData3Resp | boolean;
            try {
                const rBin = await this.p2p.askBinary<GetAccountDataReqSerializable, GetAccountDataRespSerializable>(this.dataSourceHelper.dataSourceNode, InternalRouteEnum.binary_get_account_data, message, serializeGetAccountDataReq, deserializeGetAccountDataResp, {}, '', false, 5000 + moreAskTime);
                if (((rBin.errors && rBin.errors.length === 0) || !rBin.errors) && rBin.data) {
                    r = rBin as GetAccountData3Resp;
                }
            }
            catch (ex) {
                this.accountSync.statemanager_fatal(`syncAccountData2`, `syncAccountData2 retries:${askRetriesLeft} ask: ` + errorToStringFull(ex));
                await utils.sleep(5000);
                if (askRetriesLeft > 0) {
                    askRetriesLeft--;
                    continue;
                }
                else {
                    throw new Error('out of account sync retries');
                }
            }
            const result: GetAccountData3Resp = r as GetAccountData3Resp;
            if (result == null) {
                if (logFlags.verbose)
                    if (logFlags.error)
                        this.accountSync.mainLogger.error(`ASK FAIL syncAccountData result == null node:${this.dataSourceHelper.dataSourceNode.id}`);
                if (this.dataSourceHelper.tryNextDataSourceNode('syncAccountData2') == false) {
                    throw new Error('out of account nodes to ask: syncAccountData2');
                }
                continue;
            }
            restartListRetriesLeft = 5;
            if (result.data == null) {
                if (logFlags.verbose)
                    if (logFlags.error)
                        this.accountSync.mainLogger.error(`ASK FAIL syncAccountData result.data == null node:${this.dataSourceHelper.dataSourceNode.id}`);
                if (this.dataSourceHelper.tryNextDataSourceNode('syncAccountData3') == false) {
                    throw new Error('out of account nodes to ask: syncAccountData3');
                }
                continue;
            }
            const accountData = result.data.wrappedAccounts;
            const lastUpdateNeeded = result.data.lastUpdateNeeded;
            const lastLowQuery = lowTimeQuery;
            if (accountData.length > 0) {
                const lastAccount = accountData[accountData.length - 1];
                if (lastAccount.timestamp > lowTimeQuery) {
                    lowTimeQuery = lastAccount.timestamp;
                    startTime = lowTimeQuery;
                }
            }
            let sameAsStartTS = 0;
            let sameAsLastTS = 0;
            let lastLoopTS = -1;
            for (const account of accountData) {
                if (account.timestamp === lastLowQuery) {
                    sameAsStartTS++;
                }
                if (account.timestamp === lastLoopTS) {
                    sameAsLastTS++;
                }
                else {
                    sameAsLastTS = 0;
                    lastLoopTS = account.timestamp;
                }
            }
            let dataDuplicated = true;
            if (loopCount > 0) {
                while (accountData.length > 0 && dataDuplicated) {
                    const stateData = accountData[0];
                    dataDuplicated = false;
                    for (let i = this.combinedAccountData.length - 1; i >= 0; i--) {
                        const existingStateData = this.combinedAccountData[i];
                        if (existingStateData.timestamp === stateData.timestamp &&
                            existingStateData.accountId === stateData.accountId) {
                            dataDuplicated = true;
                            break;
                        }
                        if (existingStateData.timestamp < stateData.timestamp) {
                            break;
                        }
                    }
                    if (dataDuplicated) {
                        accountData.shift();
                    }
                }
            }
            if (lastLowQuery === lowTimeQuery) {
                offset += sameAsLastTS;
            }
            else {
                offset = 0;
            }
            if (accountData.length < message.maxRecords) {
                startTime++;
                offset = 0;
            }
            accountOffset = '';
            if (this.accountSync.config.stateManager.syncWithAccountOffset === true) {
                if (offset > 0) {
                    accountOffset = accountData[accountData.length - 1].accountId;
                }
            }
            const accountData2 = result.data.wrappedAccounts2;
            if (accountData2.length > 0) {
                while (accountData.length > 0 && dataDuplicated) {
                    const stateData = accountData2[0];
                    dataDuplicated = false;
                    for (let i = this.combinedAccountData.length - 1; i >= 0; i--) {
                        const existingStateData = this.combinedAccountData[i];
                        if (existingStateData.timestamp === stateData.timestamp &&
                            existingStateData.accountId === stateData.accountId) {
                            dataDuplicated = true;
                            break;
                        }
                        if (existingStateData.timestamp < stateData.timestamp) {
                            break;
                        }
                    }
                    if (dataDuplicated) {
                        accountData2.shift();
                    }
                }
            }
            if (lastUpdateNeeded || (accountData2.length === 0 && accountData.length === 0)) {
                if (lastUpdateNeeded) {
                    moreDataRemaining = false;
                }
                else {
                    if (stopIfNextLoopHasNoResults === true) {
                        moreDataRemaining = false;
                    }
                    else {
                        startTime++;
                        loopCount++;
                        stopIfNextLoopHasNoResults = true;
                    }
                }
                if (accountData.length > 0) {
                    this.combinedAccountData = this.combinedAccountData.concat(accountData);
                }
                if (accountData2.length > 0) {
                    this.combinedAccountData = this.combinedAccountData.concat(accountData2);
                }
            }
            else {
                stopIfNextLoopHasNoResults = false;
                this.combinedAccountData = this.combinedAccountData.concat(accountData);
                loopCount++;
            }
            if (this.combinedAccountData.length > 0) {
                const accountToSave = this.combinedAccountData.length;
                const accountsSaved = await this.processAccountDataNoStateTable2();
                totalAccountsSaved += accountsSaved;
                this.combinedAccountData = [];
            }
            await utils.sleep(200);
        }
        return totalAccountsSaved;
    }
    async processAccountDataNoStateTable2(): Promise<number> {
        this.missingAccountData = [];
        this.mapAccountData = {};
        let account: Shardus.WrappedData;
        for (let i = 0; i < this.combinedAccountData.length; i++) {
            account = this.combinedAccountData[i];
            this.mapAccountData[account.accountId] = account;
        }
        const accountKeys = Object.keys(this.mapAccountData);
        const uniqueAccounts = accountKeys.length;
        const initialCombinedAccountLength = this.combinedAccountData.length;
        if (uniqueAccounts < initialCombinedAccountLength) {
            this.combinedAccountData = [];
            for (const accountID of accountKeys) {
                this.combinedAccountData.push(this.mapAccountData[accountID]);
            }
        }
        const missingTXs = 0;
        const handledButOk = 0;
        const otherMissingCase = 0;
        const futureStateTableEntry = 0;
        this.accountsWithStateConflict = [];
        const goodAccounts: Shardus.WrappedData[] = [];
        const noSyncData = 0;
        const noMatches = 0;
        const outOfDateNoTxs = 0;
        const unhandledCase = 0;
        const fix1Worked = 0;
        for (const account of this.combinedAccountData) {
            goodAccounts.push(account);
        }
        const failedHashes = await this.accountSync.stateManager.checkAndSetAccountData(goodAccounts, 'syncNonGlobals:processAccountDataNoStateTable', true);
        this.accountSync.syncStatement.numAccounts += goodAccounts.length;
        if (failedHashes.length > 1000) {
            if (logFlags.error)
                this.accountSync.mainLogger.error(`DATASYNC: processAccountData failed hashes over 1000:  ${failedHashes.length} restarting sync process`);
            this.accountSync.stateManager.recordPotentialBadnode();
            throw new Error('FailAndRestartPartition_processAccountData_A');
        }
        if (failedHashes.length > 0) {
            if (logFlags.error)
                this.accountSync.mainLogger.error(`DATASYNC: processAccountData failed hashes:  ${failedHashes.length} will have to download them again`);
            this.accountSync.stateManager.recordPotentialBadnode();
            this.failedAccounts = this.failedAccounts.concat(failedHashes);
        }
        const accountsSaved = await this.accountSync.stateManager.writeCombinedAccountDataToBackups(goodAccounts, failedHashes);
        this.combinedAccountData = [];
        return accountsSaved;
    }
    async tryRetry(message: string): Promise<boolean> {
        this.accountSync.logger.playbackLogState('datasyncFail', '', '');
        this.restartCount++;
        if (this.restartCount > this.accountSync.config.stateManager.maxTrackerRestarts) {
            if (logFlags.error)
                this.accountSync.mainLogger.error(`DATASYNC: tryRetry: max tries excceded  ${this.restartCount} ${message} `);
            throw new Error('reset-sync-ranges tryRetry out of tries');
        }
        await utils.sleep(1000);
        if (this.accountSync.forceSyncComplete) {
            this.accountSync.syncStatmentIsComplete();
            this.accountSync.clearSyncData();
            this.accountSync.skipSync();
            for (const syncTracker of this.accountSync.syncTrackers) {
                syncTracker.syncFinished = true;
            }
            if (logFlags.error)
                this.accountSync.mainLogger.error(`DATASYNC: tryRetry: forceSyncComplete ${this.restartCount} ${message} `);
            return false;
        }
        if (logFlags.error)
            this.accountSync.mainLogger.error(`DATASYNC: tryRetry: ${this.restartCount} ${message} `);
        this.accountSync.syncStatement.failAndRestart++;
        return true;
    }
}