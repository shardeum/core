import * as Shardus from '../shardus/shardus-types';
import * as utils from '../utils';
import Profiler, { cUninitializedSize } from '../utils/profiler';
import { P2PModuleContext as P2P } from '../p2p/Context';
import Storage from '../storage';
import Crypto from '../crypto';
import Logger, { logFlags } from '../logger';
import StateManager from '.';
import { GlobalAccountReportResp } from './state-manager-types';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { Logger as Log4jsLogger } from 'log4js';
import { Route } from '@shardus/types/build/src/p2p/P2PTypes';
import { InternalBinaryHandler } from '../types/Handler';
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum';
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum';
import { GlobalAccountReportRespSerializable, serializeGlobalAccountReportResp, } from '../types/GlobalAccountReportResp';
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum';
import { getStreamWithTypeCheck, requestErrorHandler } from '../types/Helpers';
import { BadRequest, InternalError, serializeResponseError } from '../types/ResponseError';
class AccountGlobals {
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
    globalAccountSet: Set<string>;
    hasknownGlobals: boolean;
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
        this.globalAccountSet = new Set();
        this.hasknownGlobals = false;
    }
    setupHandlers(): void {
        const globalAccountReportBinaryHandler: Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_get_globalaccountreport,
            handler: async (payload, respond, header, sign) => {
                const route = InternalRouteEnum.binary_get_globalaccountreport;
                const errorHandler = (errorType: RequestErrorEnum, opts?: {
                    customErrorLog?: string;
                    customCounterSuffix?: string;
                }): void => requestErrorHandler(route, errorType, header, opts);
                try {
                    const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cGlobalAccountReportReq);
                    if (!requestStream) {
                        errorHandler(RequestErrorEnum.InvalidRequest);
                        return respond(BadRequest('invalid request stream'), serializeResponseError);
                    }
                    const result: GlobalAccountReportRespSerializable = {
                        combinedHash: '',
                        accounts: [],
                        ready: this.stateManager.appFinishedSyncing,
                    };
                    const globalAccountKeys = this.globalAccountSet.keys();
                    const toQuery: string[] = [];
                    if (this.stateManager.accountSync.globalAccountsSynced === false ||
                        this.stateManager.appFinishedSyncing === false) {
                        result.ready = false;
                        return respond(result, serializeGlobalAccountReportResp);
                    }
                    for (const key of globalAccountKeys) {
                        toQuery.push(key);
                    }
                    if (result.ready === false) {
                        return respond(BadRequest('Result not ready'), serializeResponseError);
                    }
                    let accountData: Shardus.WrappedData[];
                    let ourLockID = -1;
                    try {
                        ourLockID = await this.stateManager.fifoLock('accountModification');
                        accountData = await this.app.getAccountDataByList(toQuery);
                    }
                    finally {
                        this.stateManager.fifoUnlock('accountModification', ourLockID);
                    }
                    if (accountData != null) {
                        for (const wrappedAccount of accountData) {
                            const report = {
                                id: wrappedAccount.accountId,
                                hash: wrappedAccount.stateId,
                                timestamp: wrappedAccount.timestamp,
                            };
                            result.accounts.push(report);
                        }
                    }
                    this.stateManager.testAccountDataWrapped(accountData);
                    result.accounts.sort(utils.sort_id_Asc);
                    result.combinedHash = this.crypto.hash(result);
                    respond(result, serializeGlobalAccountReportResp);
                }
                catch (e) {
                    if (logFlags.error)
                        this.mainLogger.error(`${route}: Exception executing request: ${utils.errorToStringFull(e)}`);
                    return respond(InternalError('Exception executing request'), serializeResponseError);
                }
                finally {
                }
            },
        };
        this.p2p.registerInternalBinary(globalAccountReportBinaryHandler.name, globalAccountReportBinaryHandler.handler);
    }
    isGlobalAccount(accountID: string): boolean {
        return this.globalAccountSet.has(accountID);
    }
    setGlobalAccount(accountID: string): void {
        this.globalAccountSet.add(accountID);
    }
    async getGlobalListEarly(syncFromArchiver: boolean = false): Promise<void> {
        let retriesLeft = 10;
        while (this.hasknownGlobals === false) {
            if (retriesLeft === 0) {
                this.fatalLogger.fatal(`DATASYNC: getGlobalListEarly: failed to get global list after 10 retries`);
                throw new Error(`DATASYNC: getGlobalListEarly: failed to get global list after 10 retries`);
            }
            try {
                const globalReport: GlobalAccountReportResp = await this.stateManager.accountSync.getRobustGlobalReport('getGlobalListEarly', syncFromArchiver);
                const temp = [];
                for (const report of globalReport.accounts) {
                    temp.push(report.id);
                    this.globalAccountSet.add(report.id);
                }
                this.hasknownGlobals = true;
            }
            catch (err) {
                await utils.sleep(10000);
            }
            finally {
                retriesLeft--;
            }
        }
    }
    getGlobalDebugReport(): {
        globalAccountSummary: {
            id: string;
            state: string;
            ts: number;
        }[];
        globalStateHash: string;
    } {
        const globalAccountSummary = [];
        for (const globalID in this.globalAccountSet.keys()) {
            const accountHash = this.stateManager.accountCache.getAccountHash(globalID);
            const summaryObj = { id: globalID, state: accountHash.h, ts: accountHash.t };
            globalAccountSummary.push(summaryObj);
        }
        const globalStateHash = this.crypto.hash(globalAccountSummary);
        return { globalAccountSummary, globalStateHash };
    }
}
export default AccountGlobals;