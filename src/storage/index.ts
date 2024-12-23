import Log4js from 'log4js';
import Logger, { logFlags } from '../logger';
import * as Snapshot from '../snapshot';
import StateManager from '../state-manager';
import Profiler from '../utils/profiler';
import * as ShardusTypes from './../shardus/shardus-types';
import models from './models';
import Sqlite3Storage from './sqlite3storage';
import P2PApoptosis = require('../p2p/Apoptosis');
import { config } from '../p2p/Context';
import { ColumnDescription } from './utils/schemaDefintions';
import { Op } from './utils/sqlOpertors';
import { nestedCountersInstance } from "../utils/nestedCounters";
import { shardusGetTime } from "../network";
import { Utils } from '@shardus/types';
export type GenericObject = {
    [key: symbol]: unknown;
};
export type ModelAttributes = {
    [column: string]: ColumnDescription;
};
export interface ModelData {
    tableName: string;
    columns: string[];
    columnsString: string;
    substitutionString: string;
    isColumnJSON: {
        [key: string]: boolean;
    };
    JSONkeys: string[];
    insertOrReplaceString?: string;
    insertString?: string;
    selectString?: string;
    updateString?: string;
    deleteString?: string;
}
export type OperationOptions = {
    createOrReplace?: boolean;
    raw?: boolean;
    order?: {
        length: number;
    };
    limit?: number;
};
export interface ParamEntry {
    name: string;
    type?: string;
    v1?: string;
    v2?: string;
    sql?: string;
    vals?: string[];
}
interface Storage {
    serverConfig: ShardusTypes.StrictServerConfiguration;
    profiler: Profiler;
    mainLogger: Log4js.Logger;
    fatalLogger: Log4js.Logger;
    storage: Sqlite3Storage;
    stateManager: StateManager;
    storageModels: any;
    initialized: boolean;
    _create: any;
    _read: any;
    _readOld: any;
    _update: any;
    _delete: any;
    _query: any;
    _queryOld: any;
}
class Storage {
    constructor(baseDir: string, config: ShardusTypes.StrictStorageConfiguration, serverConfig: ShardusTypes.StrictServerConfiguration, logger: Logger, profiler: Profiler) {
        this.profiler = profiler;
        this.mainLogger = logger.getLogger('main');
        this.fatalLogger = logger.getLogger('fatal');
        this.storage = new Sqlite3Storage(models as [
            string,
            ModelAttributes
        ][], config, logger, baseDir, this.profiler);
        this.serverConfig = serverConfig;
        this.stateManager = null;
    }
    async init() {
        await this.storage.init();
        await this.storage.runCreate('CREATE TABLE if not exists `acceptedTxs` (`txId` VARCHAR(255) NOT NULL PRIMARY KEY, `timestamp` BIGINT NOT NULL, `data` JSON NOT NULL, `keys` JSON NOT NULL)');
        await this.storage.runCreate('CREATE TABLE if not exists `accountStates` ( `accountId` VARCHAR(255) NOT NULL, `txId` VARCHAR(255) NOT NULL, `txTimestamp` BIGINT NOT NULL, `stateBefore` VARCHAR(255) NOT NULL, `stateAfter` VARCHAR(255) NOT NULL,  PRIMARY KEY (`accountId`, `txTimestamp`))');
        await this.storage.runCreate('CREATE TABLE if not exists `cycles` (' +
            [
                '`networkId` TEXT NOT NULL',
                '`counter` BIGINT NOT NULL UNIQUE PRIMARY KEY',
                '`target` BIGINT',
                '`mode` TEXT',
                '`safetyMode` BOOLEAN',
                '`safetyNum` BIGINT',
                '`maxSyncTime` BIGINT',
                '`networkStateHash` BIGINT',
                '`networkDataHash` JSON',
                '`networkConfigHash` TEXT NOT NULL',
                '`networkReceiptHash` JSON',
                '`networkSummaryHash` JSON',
                '`certificate` JSON NOT NULL',
                '`previous` TEXT NOT NULL',
                '`marker` TEXT NOT NULL',
                '`start` BIGINT NOT NULL',
                '`duration` BIGINT NOT NULL',
                '`active` BIGINT NOT NULL',
                '`syncing` BIGINT NOT NULL',
                '`standby` BIGINT NOT NULL',
                '`desired` BIGINT NOT NULL',
                '`expired` BIGINT NOT NULL',
                '`joined` JSON NOT NULL',
                '`joinedArchivers` JSON NOT NULL',
                '`leavingArchivers` JSON NOT NULL',
                '`joinedConsensors` JSON NOT NULL',
                '`refreshedArchivers` JSON NOT NULL',
                '`refreshedConsensors` JSON NOT NULL',
                '`activated` JSON NOT NULL',
                '`activatedPublicKeys` JSON NOT NULL',
                '`removed` JSON NOT NULL',
                '`appRemoved` JSON NOT NULL',
                '`returned` JSON NOT NULL',
                '`lost` JSON NOT NULL',
                '`lostSyncing` JSON NOT NULL',
                '`refuted` JSON NOT NULL',
                '`nodeListHash` TEXT NOT NULL',
                '`archiverListHash` TEXT NOT NULL',
                '`standbyAdd` JSON NOT NULL',
                '`standbyNodeListHash` TEXT NOT NULL',
                '`standbyRemove` JSON NOT NULL',
                '`lostArchivers` TEXT NOT NULL',
                '`refutedArchivers` TEXT NOT NULL',
                '`removedArchivers` TEXT NOT NULL',
                '`startedSyncing` TEXT NOT NULL',
                '`lostAfterSelection` TEXT NOT NULL',
                '`finishedSyncing` TEXT NOT NULL',
                '`standbyRefresh` TEXT NOT NULL',
                '`random` BIGINT NOT NULL',
                '`txadd` JSON NOT NULL',
                '`txremove` JSON NOT NULL',
                '`txlisthash` TEXT NOT NULL',
                '`archiversAtShutdown` JSON',
            ].join(', ') +
            ')');
        await this.storage.runCreate('CREATE TABLE if not exists `nodes` (`id` TEXT NOT NULL PRIMARY KEY, `publicKey` TEXT NOT NULL, `curvePublicKey` TEXT NOT NULL, `cycleJoined` TEXT NOT NULL, `internalIp` VARCHAR(255) NOT NULL, `externalIp` VARCHAR(255) NOT NULL, `internalPort` SMALLINT NOT NULL, `externalPort` SMALLINT NOT NULL, `joinRequestTimestamp` BIGINT NOT NULL, `activeTimestamp` BIGINT NOT NULL, `address` VARCHAR(255) NOT NULL, `status` VARCHAR(255) NOT NULL, `readyTimestamp` BIGINT NOT NULL )');
        await this.storage.runCreate('CREATE TABLE if not exists `properties` (`key` VARCHAR(255) NOT NULL PRIMARY KEY, `value` JSON)');
        await this.storage.runCreate('CREATE TABLE if not exists `accountsCopy` (`accountId` VARCHAR(255) NOT NULL, `cycleNumber` BIGINT NOT NULL, `data` JSON NOT NULL, `timestamp` BIGINT NOT NULL, `hash` VARCHAR(255) NOT NULL, `isGlobal` BOOLEAN NOT NULL, PRIMARY KEY (`accountId`, `cycleNumber`))');
        await this.storage.runCreate('CREATE TABLE if not exists `globalAccounts` (`accountId` VARCHAR(255) NOT NULL, `cycleNumber` BIGINT NOT NULL, `data` JSON NOT NULL, `timestamp` BIGINT NOT NULL, `hash` VARCHAR(255) NOT NULL, PRIMARY KEY (`accountId`, `cycleNumber`))');
        await this.storage.runCreate('CREATE TABLE if not exists `partitions` (`partitionId` VARCHAR(255) NOT NULL, `cycleNumber` BIGINT NOT NULL, `hash` VARCHAR(255) NOT NULL, PRIMARY KEY (`partitionId`, `cycleNumber`))');
        await this.storage.runCreate('CREATE TABLE if not exists `receipt` (`partitionId` VARCHAR(255) NOT NULL, `cycleNumber` BIGINT NOT NULL, `hash` VARCHAR(255) NOT NULL, PRIMARY KEY (`partitionId`, `cycleNumber`))');
        await this.storage.runCreate('CREATE TABLE if not exists `summary` (`partitionId` VARCHAR(255) NOT NULL, `cycleNumber` BIGINT NOT NULL, `hash` VARCHAR(255) NOT NULL, PRIMARY KEY (`partitionId`, `cycleNumber`))');
        await this.storage.runCreate('CREATE TABLE if not exists `network` (`cycleNumber` BIGINT NOT NULL, `hash` VARCHAR(255) NOT NULL, PRIMARY KEY (`cycleNumber`))');
        await this.storage.runCreate('CREATE TABLE if not exists `networkReceipt` (`cycleNumber` BIGINT NOT NULL, `hash` VARCHAR(255) NOT NULL, PRIMARY KEY (`cycleNumber`))');
        await this.storage.runCreate('CREATE TABLE if not exists `networkSummary` (`cycleNumber` BIGINT NOT NULL, `hash` VARCHAR(255) NOT NULL, PRIMARY KEY (`cycleNumber`))');
        await this.storage.run(P2PApoptosis.addCycleFieldQuery);
        this.storageModels = this.storage.storageModels;
        this._create = async (table, values, opts) => this.storage._create(table, values, opts);
        this._read = async (table, where, opts) => this.storage._read(table, where, opts);
        this._readOld = async (table, where, opts) => this.storage._readOld(table, where, opts);
        this._update = async (table, values, where, opts) => this.storage._update(table, values, where, opts);
        this._delete = async (table, where, opts) => this.storage._delete(table, where, opts);
        this._query = async (query, tableModel) => this.storage._rawQuery(query, tableModel);
        this._queryOld = async (query, tableModel) => this.storage._rawQueryOld(query, tableModel);
        this.initialized = true;
        if (Snapshot.oldDataPath) {
        }
    }
    async close() {
        await this.storage.close();
    }
    async deleteOldDBPath() {
        await this.storage.deleteOldDBPath();
    }
    _checkInit() {
        if (!this.initialized)
            throw new Error('Storage not initialized.');
    }
    async addCycles(cycles) {
        this._checkInit();
        try {
            await this._create(this.storageModels.cycles, cycles);
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async updateCycle(record, newRecord) {
        this._checkInit();
        try {
            await this._update(this.storageModels.cycles, newRecord, record);
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async getCycleByCounter(counter) {
        this._checkInit();
        let cycle;
        try {
            ;
            [cycle] = await this._read(this.storageModels.cycles, { counter }, { attributes: { exclude: ['createdAt', 'updatedAt'] } });
        }
        catch (e) {
            throw new Error(e);
        }
        if (cycle && cycle.dataValues) {
            return cycle.dataValues;
        }
        return null;
    }
    async getCycleByMarker(marker) {
        this._checkInit();
        let cycle;
        try {
            ;
            [cycle] = await this._read(this.storageModels.cycles, { marker }, { attributes: { exclude: ['createdAt', 'updatedAt'] } });
        }
        catch (e) {
            throw new Error(e);
        }
        if (cycle && cycle.dataValues) {
            return cycle.dataValues;
        }
        return null;
    }
    async deleteCycleByCounter(counter) {
        this._checkInit();
        try {
            await this._delete(this.storageModels.cycles, { counter });
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async deleteCycleByMarker(marker) {
        this._checkInit();
        try {
            await this._delete(this.storageModels.cycles, { marker });
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async listCycles() {
        this._checkInit();
        let cycles;
        try {
            cycles = await this._read(this.storageModels.cycles, null, {
                attributes: { exclude: ['createdAt', 'updatedAt'] },
            });
        }
        catch (e) {
            throw new Error(e);
        }
        return cycles.map((c) => c.dataValues);
    }
    async listOldCycles() {
        this._checkInit();
        let cycles;
        try {
            cycles = await this._readOld(this.storageModels.cycles, null, {
                attributes: { exclude: ['createdAt', 'updatedAt'] },
            });
        }
        catch (e) {
            throw new Error(e);
        }
        return cycles;
    }
    async getLastOldNetworkHash() {
        this._checkInit();
        let networkStateHash;
        try {
            networkStateHash = await this._readOld(this.storageModels.network, null, {
                limit: 1,
                order: [['cycleNumber', 'DESC']],
                attributes: { exclude: ['createdAt', 'updatedAt', 'id'] },
                raw: true,
            });
        }
        catch (e) {
            throw new Error(e);
        }
        return networkStateHash;
    }
    async getLastOldPartitionHashes() {
        this._checkInit();
        let partitionHashes = [];
        try {
            const query = 'SELECT partitionId, hash FROM partitions WHERE (partitionId,cycleNumber) IN ( SELECT partitionId, MAX(cycleNumber) FROM partitions GROUP BY partitionId)';
            partitionHashes = await this._queryOld(query, []);
        }
        catch (e) {
            throw new Error(e);
        }
        return partitionHashes;
    }
    async addNodes(nodes) {
        this._checkInit();
        try {
            await this._create(this.storageModels.nodes, nodes);
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async getNodes(node) {
        this._checkInit();
        let nodes;
        try {
            nodes = await this._read(this.storageModels.nodes, node, {
                attributes: { exclude: ['createdAt', 'updatedAt'] },
                raw: true,
            });
        }
        catch (e) {
            throw new Error(e);
        }
        return nodes;
    }
    async updateNodes(node, newNode) {
        this._checkInit();
        try {
            await this._update(this.storageModels.nodes, newNode, node);
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async deleteNodes(nodes) {
        this._checkInit();
        const nodeIds = [];
        const addNodeToList = (node) => {
            if (!node.id) {
                if (logFlags.error)
                    this.mainLogger.error(`Node attempted to be deleted without ID: ${Utils.safeStringify(node)}`);
                return;
            }
            nodeIds.push(node.id);
        };
        if (nodes.length) {
            for (const node of nodes) {
                addNodeToList(node);
            }
        }
        else {
            addNodeToList(nodes);
        }
        try {
            await this._delete(this.storageModels.nodes, { id: { [Op.in]: nodeIds } });
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async listNodes() {
        this._checkInit();
        let nodes;
        try {
            nodes = await this._read(this.storageModels.nodes, null, {
                attributes: { exclude: ['createdAt', 'updatedAt'] },
                raw: true,
            });
        }
        catch (e) {
            throw new Error(e);
        }
        return nodes;
    }
    async setProperty(key, value) {
        this._checkInit();
        try {
            const [prop] = await this._read(this.storageModels.properties, { key });
            if (!prop) {
                await this._create(this.storageModels.properties, {
                    key,
                    value,
                });
            }
            else {
                await this._update(this.storageModels.properties, {
                    key,
                    value,
                }, { key });
            }
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async getProperty(key) {
        this._checkInit();
        let prop;
        try {
            ;
            [prop] = await this._read(this.storageModels.properties, { key });
        }
        catch (e) {
            throw new Error(e);
        }
        if (prop && prop.value) {
            return Utils.safeJsonParse(prop.value);
        }
        return null;
    }
    async deleteProperty(key) {
        this._checkInit();
        try {
            await this._delete(this.storageModels.properties, { key });
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async listProperties() {
        this._checkInit();
        let keys;
        try {
            keys = await this._read(this.storageModels.properties, null, {
                attributes: ['key'],
                raw: true,
            });
        }
        catch (e) {
            throw new Error(e);
        }
        return keys.map((k) => k.key);
    }
    async clearP2pState() {
        this._checkInit();
        try {
            await this._delete(this.storageModels.cycles, null, { truncate: true });
            await this._delete(this.storageModels.nodes, null, { truncate: true });
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async clearAppRelatedState() {
        this._checkInit();
        try {
            await this._delete(this.storageModels.accountStates, null, {
                truncate: true,
            });
            await this._delete(this.storageModels.acceptedTxs, null, {
                truncate: true,
            });
            await this._delete(this.storageModels.accountsCopy, null, {
                truncate: true,
            });
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async addAcceptedTransactions(acceptedTransactions) {
        if (this.serverConfig.debug.recordAcceptedTx != true)
            return;
        this._checkInit();
        try {
            await this._create(this.storageModels.acceptedTxs, acceptedTransactions, {
                createOrReplace: true,
            });
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async addPartitionHash(partition) {
        this._checkInit();
        try {
            await this._create(this.storageModels.partitions, partition, {
                createOrReplace: true,
            });
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async addReceiptMapHash(receiptMap) {
        this._checkInit();
        try {
            await this._create(this.storageModels.receipt, receiptMap, {
                createOrReplace: true,
            });
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async addSummaryHash(summaryHash) {
        this._checkInit();
        try {
            await this._create(this.storageModels.summary, summaryHash, {
                createOrReplace: true,
            });
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async addNetworkState(networkState) {
        this._checkInit();
        try {
            await this._create(this.storageModels.network, networkState, {
                createOrReplace: true,
            });
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async addNetworkReceipt(networkReceipt) {
        this._checkInit();
        try {
            await this._create(this.storageModels.networkReceipt, networkReceipt, {
                createOrReplace: true,
            });
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async addNetworkSummary(networkSummary) {
        this._checkInit();
        try {
            await this._create(this.storageModels.networkSummary, networkSummary, {
                createOrReplace: true,
            });
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async addAccountStates(accountStates) {
        if (this.serverConfig.debug.recordAccountStates != true)
            return;
        this._checkInit();
        try {
            await this._create(this.storageModels.accountStates, accountStates, {
                createOrReplace: true,
            });
        }
        catch (e) {
            this.fatalLogger.fatal('addAccountStates db failure.  start apoptosis ' +
                Utils.safeStringify(e.message) +
                ' ' +
                Utils.safeStringify(accountStates));
            this.stateManager.initApoptosisAndQuitSyncing('addAccountStates');
        }
    }
    async queryAcceptedTransactions(tsStart, tsEnd, limit) {
        this._checkInit();
        try {
            const result = await this._read(this.storageModels.acceptedTxs, { timestamp: { [Op.between]: [tsStart, tsEnd] } }, {
                limit: limit,
                order: [['timestamp', 'ASC']],
                attributes: { exclude: ['createdAt', 'updatedAt', 'id'] },
                raw: true,
            });
            return result;
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async queryAcceptedTransactionsByIds(ids) {
        this._checkInit();
        try {
            const result = await this._read(this.storageModels.acceptedTxs, { id: { [Op.in]: ids } }, {
                order: [['timestamp', 'ASC']],
                attributes: { exclude: ['createdAt', 'updatedAt', 'id'] },
                raw: true,
            });
            return result;
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async queryAccountStateTable(accountStart, accountEnd, tsStart, tsEnd, limit) {
        this._checkInit();
        try {
            const result = await this._read(this.storageModels.accountStates, {
                accountId: { [Op.between]: [accountStart, accountEnd] },
                txTimestamp: { [Op.between]: [tsStart, tsEnd] },
            }, {
                limit: limit,
                order: [
                    ['txTimestamp', 'ASC'],
                    ['accountId', 'ASC'],
                ],
                attributes: { exclude: ['createdAt', 'updatedAt', 'id'] },
                raw: true,
            });
            return result;
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async queryAccountStateTableByList(addressList, tsStart, tsEnd) {
        this._checkInit();
        try {
            const result = await this._read(this.storageModels.accountStates, {
                txTimestamp: { [Op.between]: [tsStart, tsEnd] },
                accountId: { [Op.in]: addressList },
            }, {
                order: [['address', 'ASC']],
                attributes: { exclude: ['createdAt', 'updatedAt', 'id'] },
                raw: true,
            });
            return result;
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async queryAccountStateTableByListNewest(accountIDs) {
        this._checkInit();
        try {
            let expandQ = '';
            for (let i = 0; i < accountIDs.length; i++) {
                expandQ += '?';
                if (i < accountIDs.length - 1) {
                    expandQ += ', ';
                }
            }
            const query = `select accountId, txId, max(txTimestamp) txTimestamp, stateBefore, stateAfter from accountStates WHERE accountId IN (${expandQ}) group by accountId `;
            const result = await this._query(query, [...accountIDs]);
            return result;
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async clearAccountStateTableByList(addressList, tsStart, tsEnd) {
        this._checkInit();
        try {
            await this._delete(this.storageModels.accountStates, {
                txTimestamp: { [Op.between]: [tsStart, tsEnd] },
                accountId: { [Op.in]: addressList },
            }, {
                attributes: { exclude: ['createdAt', 'updatedAt', 'id'] },
                raw: true,
            });
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async clearAccountStateTableOlderThan(tsEnd) {
        this._checkInit();
        try {
            await this._query('Delete from accountStates where txTimestamp < ? and txTimestamp not in (SELECT min(txTimestamp)  from accountStates group by accountId)', `${tsEnd}`);
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async clearAcceptedTX(tsStart, tsEnd) {
        this._checkInit();
        try {
            await this._delete(this.storageModels.acceptedTxs, { timestamp: { [Op.between]: [tsStart, tsEnd] } }, {
                attributes: { exclude: ['createdAt', 'updatedAt', 'id'] },
                raw: true,
            });
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async searchAccountStateTable(accountId, txTimestamp) {
        this._checkInit();
        try {
            const result = await this._read(this.storageModels.accountStates, { accountId, txTimestamp }, {
                attributes: { exclude: ['createdAt', 'updatedAt', 'id'] },
                raw: true,
            });
            return result;
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async createAccountCopies(accountCopies) {
        if (config.stateManager.useAccountCopiesTable === false) {
            return;
        }
        this._checkInit();
        try {
            await this._create(this.storageModels.accountsCopy, accountCopies);
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async createOrReplaceAccountCopy(accountCopy) {
        if (config.stateManager.useAccountCopiesTable === false) {
            return;
        }
        this._checkInit();
        try {
            await this._create(this.storageModels.accountsCopy, accountCopy, {
                createOrReplace: true,
            });
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async getAccountReplacmentCopies1(accountIDs, cycleNumber) {
        if (config.stateManager.useAccountCopiesTable === false) {
            return [];
        }
        this._checkInit();
        try {
            const result = await this._read(this.storageModels.accountsCopy, {
                cycleNumber: { [Op.lte]: cycleNumber },
                accountId: { [Op.in]: accountIDs },
            }, {
                attributes: { exclude: ['createdAt', 'updatedAt'] },
                raw: true,
            });
            return result;
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async getAccountReplacmentCopies(accountIDs, cycleNumber) {
        if (config.stateManager.useAccountCopiesTable === false) {
            return [];
        }
        this._checkInit();
        try {
            let expandQ = '';
            for (let i = 0; i < accountIDs.length; i++) {
                expandQ += '?';
                if (i < accountIDs.length - 1) {
                    expandQ += ', ';
                }
            }
            const query = `select accountId, max(cycleNumber) cycleNumber, data, timestamp, hash from accountsCopy WHERE cycleNumber <= ? and accountId IN (${expandQ}) group by accountId `;
            const result = await this._query(query, [cycleNumber, ...accountIDs]);
            return result;
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async clearAccountReplacmentCopies(accountIDs, cycleNumber) {
        if (config.stateManager.useAccountCopiesTable === false) {
            return [];
        }
        this._checkInit();
        try {
            await this._delete(this.storageModels.accountsCopy, {
                cycleNumber: { [Op.gte]: cycleNumber },
                accountId: { [Op.in]: accountIDs },
            }, {
                attributes: { exclude: ['createdAt', 'updatedAt'] },
                raw: true,
            });
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async getAccountCopiesByCycle(cycleNumber) {
        if (config.stateManager.useAccountCopiesTable === false) {
            return [];
        }
        this._checkInit();
        try {
            const query = `SELECT a.accountId,a.data,a.timestamp,a.hash,a.isGlobal FROM accountsCopy a INNER JOIN (SELECT accountId, MAX(cycleNumber) cycleNumber FROM accountsCopy GROUP BY accountId) b ON a.accountId = b.accountId AND a.cycleNumber = b.cycleNumber WHERE a.cycleNumber<=${cycleNumber} and a.isGlobal=false order by a.accountId asc`;
            const result = await this._query(query, [cycleNumber]);
            return result;
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async getAccountCopiesByCycleAndRange(cycleNumber, lowAddress, highAddress) {
        if (config.stateManager.useAccountCopiesTable === false) {
            return [];
        }
        this._checkInit();
        try {
            const query = `SELECT a.accountId,a.data,a.timestamp,a.hash,a.isGlobal FROM accountsCopy a INNER JOIN (SELECT accountId, MAX(cycleNumber) cycleNumber FROM accountsCopy WHERE cycleNumber<=${cycleNumber} GROUP BY accountId) b ON a.accountId = b.accountId AND a.cycleNumber = b.cycleNumber WHERE a.cycleNumber<=${cycleNumber} and a.accountId>="${lowAddress}" and a.accountId<="${highAddress}" and a.isGlobal=false order by a.accountId asc`;
            const result = await this._query(query, []);
            return result;
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async getGlobalAccountCopies(cycleNumber) {
        if (config.stateManager.useAccountCopiesTable === false) {
            return [];
        }
        this._checkInit();
        try {
            const query = `SELECT a.accountId,a.data,a.timestamp,a.hash,a.isGlobal FROM accountsCopy a INNER JOIN (SELECT accountId, MAX(cycleNumber) cycleNumber FROM accountsCopy WHERE cycleNumber<=${cycleNumber} GROUP BY accountId) b ON a.accountId = b.accountId AND a.cycleNumber = b.cycleNumber WHERE a.cycleNumber<=${cycleNumber} and a.isGlobal=true order by a.accountId asc`;
            const result = await this._query(query, []);
            return result;
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async getOldAccountCopiesByCycleAndRange(cycleNumber, lowAddress, highAddress) {
        if (config.stateManager.useAccountCopiesTable === false) {
            return [];
        }
        this._checkInit();
        try {
            const query = `SELECT a.* FROM accountsCopy a INNER JOIN (SELECT accountId, MAX(cycleNumber) cycleNumber FROM accountsCopy where cycleNumber<=${cycleNumber} GROUP BY accountId) b ON a.accountId = b.accountId AND a.cycleNumber = b.cycleNumber WHERE a.accountId>="${lowAddress}" and a.accountId<="${highAddress}" and a.isGlobal=false order by a.accountId asc`;
            const result = await this._queryOld(query, []);
            return result;
        }
        catch (e) {
            throw new Error(e);
        }
    }
    async getOldGlobalAccountCopies(cycleNumber) {
        if (config.stateManager.useAccountCopiesTable === false) {
            return [];
        }
        this._checkInit();
        try {
            const query = `SELECT a.* FROM accountsCopy a INNER JOIN (SELECT accountId, MAX(cycleNumber) cycleNumber FROM accountsCopy where cycleNumber<=${cycleNumber} GROUP BY accountId) b ON a.accountId = b.accountId AND a.cycleNumber = b.cycleNumber WHERE a.isGlobal=true order by a.accountId asc`;
            const result = await this._queryOld(query, []);
            return result;
        }
        catch (e) {
            throw new Error(e);
        }
    }
}
export default Storage;