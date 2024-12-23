import * as Shardus from '../shardus/shardus-types';
import Profiler from '../utils/profiler';
import { P2PModuleContext as P2P } from '../p2p/Context';
import Storage from '../storage';
import Crypto from '../crypto';
import Logger from '../logger';
import StateManager from '.';
import { Logger as log4jsLogger } from 'log4js';
class Deprecated {
    app: Shardus.App;
    crypto: Crypto;
    config: Shardus.ServerConfiguration;
    profiler: Profiler;
    logger: Logger;
    p2p: P2P;
    storage: Storage;
    stateManager: StateManager;
    mainLogger: log4jsLogger;
    fatalLogger: log4jsLogger;
    shardLogger: log4jsLogger;
    statsLogger: log4jsLogger;
    statemanager_fatal: (key: string, log: string) => void;
    constructor(stateManager: StateManager, profiler: Profiler, app: Shardus.App, logger: Logger, storage: Storage, p2p: P2P, crypto: Crypto, config: Shardus.ServerConfiguration) {
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
    }
    purgeTransactionData(): void {
        const tsStart = 0;
        const tsEnd = 0;
        this.storage.clearAcceptedTX(tsStart, tsEnd);
    }
    purgeStateTableData(): void {
        const tsEnd = 0;
        this.storage.clearAccountStateTableOlderThan(tsEnd);
    }
    setupHandlers(): void {
    }
}
export default Deprecated;