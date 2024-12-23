import { nestedCountersInstance } from '../utils/nestedCounters';
import { logFlags } from '../logger';
import StateManager from '.';
import { P2P } from '@shardus/types';
import * as utils from '../utils';
export default class ArchiverDataSourceHelper {
    stateManager: StateManager;
    dataSourceArchiver: P2P.ArchiversTypes.JoinedArchiver;
    dataSourceArchiverList: P2P.ArchiversTypes.JoinedArchiver[];
    dataSourceArchiverIndex: number;
    constructor(stateManager: StateManager) {
        this.stateManager = stateManager;
    }
    initWithList(listOfArchivers: P2P.ArchiversTypes.JoinedArchiver[]): void {
        utils.shuffleArray(listOfArchivers);
        this.dataSourceArchiverIndex = 0;
        this.dataSourceArchiver = listOfArchivers[this.dataSourceArchiverIndex];
        this.dataSourceArchiverList = [...listOfArchivers];
    }
    tryNextDataSourceArchiver(debugString: string): boolean {
        this.dataSourceArchiverIndex++;
        if (logFlags.error)
            this.stateManager.mainLogger.error(`tryNextDataSourceArchiver ${debugString} try next archiver: ${this.dataSourceArchiverIndex}`);
        if (this.dataSourceArchiverIndex >= this.dataSourceArchiverList.length) {
            if (logFlags.error)
                this.stateManager.mainLogger.error(`tryNextDataSourceArchiver ${debugString} ran out of archivers ask for data`);
            this.dataSourceArchiverIndex = 0;
            return false;
        }
        this.dataSourceArchiver = this.dataSourceArchiverList[this.dataSourceArchiverIndex];
        if (this.dataSourceArchiver == null) {
            return false;
        }
        if (logFlags.error)
            this.stateManager.mainLogger.error(`tryNextDataSourceArchiver ${debugString} found: ${this.dataSourceArchiver.ip} ${this.dataSourceArchiver.port} `);
        return true;
    }
    tryRestartList(debugString: string): boolean {
        this.dataSourceArchiverIndex = 0;
        const numberArchivers = this.dataSourceArchiverList.length;
        if (numberArchivers > 3) {
            return false;
        }
        if (numberArchivers > 0) {
            this.dataSourceArchiver = this.dataSourceArchiverList[this.dataSourceArchiverIndex];
            return true;
        }
        return false;
    }
    getNumberArchivers(): number {
        return this.dataSourceArchiverList.length;
    }
}