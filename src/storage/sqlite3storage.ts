import { Utils } from '@shardus/types';
import fs from 'fs';
import Log4js from 'log4js';
import path from 'path';
import * as Shardus from '../shardus/shardus-types';
import * as Snapshot from '../snapshot';
import * as utils from '../utils';
import Profiler from '../utils/profiler';
import { config } from '../p2p/Context';
import Logger, { logFlags } from '../logger';
const sqlite3 = require('sqlite3').verbose();
import { Database } from 'sqlite3';
import { GenericObject, ModelAttributes, ModelData, OperationOptions, ParamEntry } from '.';
import { ColumnDescription, SQLDataTypes } from './utils/schemaDefintions';
import { Op } from './utils/sqlOpertors';
interface Sqlite3Storage {
    baseDir: string;
    storageConfig: Shardus.StrictStorageConfiguration;
    profiler: Profiler;
    mainLogger: Log4js.Logger;
    initialized: boolean;
    storageModels: {
        [tableName: string]: ModelData;
    };
    db: Database;
    oldDb: Database;
}
class Sqlite3Storage {
    oldDBPath: string;
    constructor(models: [
        string,
        ModelAttributes
    ][], storageConfig: Shardus.StrictStorageConfiguration, logger: Logger, baseDir: string, profiler: Profiler) {
        this.baseDir = baseDir;
        this.storageConfig = storageConfig;
        this.storageConfig.options.storage = path.join(this.baseDir, this.storageConfig.options.storage);
        this.profiler = profiler;
        this.mainLogger = logger.getLogger('default');
        this.initialized = false;
        this.storageModels = {};
        for (const [modelName, modelAttributes] of models) {
            this.sqlite3Define(modelName, modelAttributes);
        }
    }
    sqlite3Define(modelName: string, modelAttributes: ModelAttributes): void {
        const tableName = modelName;
        const modelData: ModelData = {
            tableName,
            columns: [],
            columnsString: '',
            substitutionString: '',
            isColumnJSON: {},
            JSONkeys: [],
        };
        for (const key in modelAttributes) {
            if (modelAttributes.hasOwnProperty(key)) {
                modelData.columns.push(key);
                const value = modelAttributes[key];
                let type: string | ColumnDescription = value.type;
                if (!type) {
                    type = value;
                }
                if (type.toString() === SQLDataTypes.JSON.toString()) {
                    modelData.isColumnJSON[key] = true;
                    modelData.JSONkeys.push(key);
                }
                else {
                    modelData.isColumnJSON[key] = false;
                }
            }
        }
        for (let i = 0; i < modelData.columns.length; i++) {
            const key = modelData.columns[i];
            modelData.columnsString += key;
            modelData.substitutionString += '?';
            if (i < modelData.columns.length - 1) {
                modelData.columnsString += ', ';
                modelData.substitutionString += ', ';
            }
        }
        modelData.insertOrReplaceString = `INSERT OR REPLACE INTO ${modelData.tableName} (${modelData.columnsString} ) VALUES (${modelData.substitutionString})`;
        modelData.insertString = `INSERT INTO ${modelData.tableName} (${modelData.columnsString} ) VALUES (${modelData.substitutionString})`;
        modelData.selectString = `SELECT * FROM ${modelData.tableName} `;
        modelData.updateString = `UPDATE ${modelData.tableName} SET `;
        modelData.deleteString = `DELETE FROM ${modelData.tableName} `;
        this.storageModels[tableName] = modelData;
    }
    async deleteFolder(path: string): Promise<void> {
        try {
            fs.rmdirSync(path, { recursive: true, maxRetries: 5 });
        }
        catch (e) {
            this.mainLogger.error('error removing directory db..' + e.name + ': ' + e.message + ' at ' + e.stack);
        }
    }
    async deleteOldDBPath(): Promise<void> {
        if (this.storageConfig.options.saveOldDBFiles != true) {
            await this.deleteFolder(this.oldDBPath);
        }
    }
    async init(): Promise<void> {
        const dbDir = path.parse(this.storageConfig.options.storage).dir;
        let oldDirPath: fs.PathLike;
        try {
            oldDirPath = dbDir + '-old-' + Date.now();
            this.oldDBPath = oldDirPath;
            if (this.storageConfig.options.saveOldDBFiles) {
                fs.renameSync(dbDir, oldDirPath);
                if (oldDirPath) {
                    Snapshot.setOldDataPath(oldDirPath);
                    this.oldDb = new sqlite3.Database(`${oldDirPath}/db.sqlite`);
                }
            }
            else {
                fs.renameSync(dbDir, oldDirPath);
                if (oldDirPath) {
                }
                await utils.sleep(5000);
                await this.deleteOldDBPath();
            }
        }
        catch (e) {
            if (config.p2p.startInWitnessMode) {
                throw new Error('Unable to start in witness mode: no old data');
            }
            else {
                this.mainLogger.error('error moving/removing directory db.. ' + e.name + ': ' + e.message + ' at ' + e.stack);
            }
        }
        try {
            await _ensureExists(dbDir);
            if (this.storageConfig.options.memoryFile) {
                this.db = new sqlite3.Database(':memory:');
            }
            else {
                this.db = new sqlite3.Database(this.storageConfig.options.storage);
            }
            await this.run('PRAGMA synchronous = OFF');
            if (this.storageConfig.options.walMode === true) {
                await this.run('PRAGMA journal_mode = WAL');
            }
            else {
                await this.run('PRAGMA journal_mode = MEMORY');
            }
            if (this.storageConfig.options.exclusiveLockMode === true) {
                await this.run('PRAGMA locking_mode = EXCLUSIVE');
            }
            this.initialized = true;
        }
        catch (e) {
            this.mainLogger.error('storage init error ' + e.name + ': ' + e.message + ' at ' + e.stack);
            throw new Error('storage init error ' + e.name + ': ' + e.message + ' at ' + e.stack);
        }
    }
    async close(): Promise<void> {
        await this.db.close();
        if (this.oldDb)
            await this.oldDb.close();
    }
    async runCreate(createStatement: string): Promise<void> {
        await this.run(createStatement);
    }
    _create(table: ModelData, object: unknown, opts: OperationOptions): Promise<unknown> {
        try {
            if (Array.isArray(object)) {
                for (const subObj of object) {
                    this._create(table, subObj, opts);
                }
                return;
            }
            let queryString = table.insertString;
            if (opts && opts.createOrReplace) {
                queryString = table.insertOrReplaceString;
            }
            const inputs = [];
            for (const column of table.columns) {
                let value = object[column];
                if (table.isColumnJSON[column]) {
                    value = Utils.safeStringify(value);
                }
                inputs.push(value);
            }
            queryString += this.options2string(opts);
            return this.run(queryString, inputs);
        }
        finally {
        }
    }
    async _read(table: ModelData, params: GenericObject, opts: OperationOptions): Promise<unknown> {
        try {
            let queryString = table.selectString;
            const paramsArray = this.params2Array(params, table);
            const { whereString, whereValueArray } = this.paramsToWhereStringAndValues(paramsArray);
            const valueArray = whereValueArray;
            queryString += whereString;
            queryString += this.options2string(opts);
            const results = await this.all(queryString, valueArray);
            if (!opts || !opts.raw) {
                if (table.JSONkeys.length > 0) {
                }
            }
            return results;
        }
        finally {
        }
    }
    async _readOld(table: ModelData, params: GenericObject, opts: OperationOptions): Promise<unknown> {
        try {
            let queryString = table.selectString;
            const paramsArray = this.params2Array(params, table);
            const { whereString, whereValueArray } = this.paramsToWhereStringAndValues(paramsArray);
            const valueArray = whereValueArray;
            queryString += whereString;
            queryString += this.options2string(opts);
            const results = await this.allOld(queryString, valueArray);
            if (!opts || !opts.raw) {
                if (table.JSONkeys.length > 0) {
                }
            }
            return results;
        }
        finally {
        }
    }
    _update(table: ModelData, values: GenericObject, where: GenericObject, opts: OperationOptions): Promise<unknown> {
        try {
            let queryString = table.updateString;
            const valueParams = this.params2Array(values, table);
            let { resultString, valueArray } = this.paramsToAssignmentStringAndValues(valueParams);
            queryString += resultString;
            const whereParams = this.params2Array(where, table);
            const { whereString, whereValueArray } = this.paramsToWhereStringAndValues(whereParams);
            queryString += whereString;
            valueArray = valueArray.concat(whereValueArray);
            queryString += this.options2string(opts);
            return this.run(queryString, valueArray);
        }
        finally {
        }
    }
    _delete(table: ModelData, where: GenericObject, opts: OperationOptions): Promise<unknown> {
        try {
            let queryString = table.deleteString;
            const whereParams = this.params2Array(where, table);
            const { whereString, whereValueArray } = this.paramsToWhereStringAndValues(whereParams);
            const valueArray = whereValueArray;
            queryString += whereString;
            queryString += this.options2string(opts);
            return this.run(queryString, valueArray);
        }
        finally {
        }
    }
    _rawQuery(queryString: string, valueArray: unknown[]): Promise<unknown> {
        try {
            return this.all(queryString, valueArray);
        }
        finally {
        }
    }
    _rawQueryOld(queryString: string, valueArray: unknown[]): Promise<unknown> {
        try {
            return this.allOld(queryString, valueArray);
        }
        finally {
        }
    }
    params2Array(paramsObj: GenericObject, table: ModelData): ParamEntry[] {
        if (paramsObj === null || paramsObj === undefined) {
            return [];
        }
        const paramsArray = [];
        for (const key in paramsObj) {
            if (Object.prototype.hasOwnProperty.call(paramsObj, key)) {
                const paramEntry: ParamEntry = { name: key };
                const value = paramsObj[key];
                if (utils.isObject(value) && table.isColumnJSON[paramEntry.name] === false) {
                    if (value[Op.between]) {
                        const between = value[Op.between];
                        paramEntry.type = 'BETWEEN';
                        paramEntry.v1 = between[0];
                        paramEntry.v2 = between[1];
                        paramEntry.sql = `${paramEntry.name} ${paramEntry.type} ? AND ? `;
                        paramEntry.vals = [paramEntry.v1, paramEntry.v2];
                    }
                    if (value[Op.in]) {
                        const inValues = value[Op.in];
                        paramEntry.type = 'IN';
                        let questionMarks = '';
                        for (let i = 0; i < inValues.length; i++) {
                            questionMarks += '?';
                            if (i < inValues.length - 1) {
                                questionMarks += ' , ';
                            }
                        }
                        paramEntry.sql = `${paramEntry.name} ${paramEntry.type} (${questionMarks})`;
                        paramEntry.vals = [];
                        paramEntry.vals = paramEntry.vals.concat(inValues);
                    }
                    if (value[Op.lte]) {
                        const rightHandValue = value[Op.lte];
                        paramEntry.type = 'LTE';
                        paramEntry.v1 = rightHandValue;
                        paramEntry.sql = `${paramEntry.name} <= ?`;
                        paramEntry.vals = [paramEntry.v1];
                    }
                    if (value[Op.gte]) {
                        const rightHandValue = value[Op.gte];
                        paramEntry.type = 'GTE';
                        paramEntry.v1 = rightHandValue;
                        paramEntry.sql = `${paramEntry.name} >= ?`;
                        paramEntry.vals = [paramEntry.v1];
                    }
                }
                else {
                    paramEntry.type = '=';
                    paramEntry.v1 = value;
                    paramEntry.sql = `${paramEntry.name} ${paramEntry.type} ?`;
                    if (table.isColumnJSON[paramEntry.name]) {
                        paramEntry.v1 = Utils.safeStringify(paramEntry.v1);
                    }
                    paramEntry.vals = [paramEntry.v1];
                }
                paramsArray.push(paramEntry);
            }
        }
        return paramsArray;
    }
    paramsToWhereStringAndValues(paramsArray: ParamEntry[]): {
        whereString: string;
        whereValueArray: unknown[];
    } {
        let whereValueArray = [];
        let whereString = '';
        for (let i = 0; i < paramsArray.length; i++) {
            if (i === 0) {
                whereString += ' WHERE ';
            }
            const paramEntry = paramsArray[i];
            whereString += '(' + paramEntry.sql + ')';
            if (i < paramsArray.length - 1) {
                whereString += ' AND ';
            }
            whereValueArray = whereValueArray.concat(paramEntry.vals);
        }
        return { whereString, whereValueArray };
    }
    paramsToAssignmentStringAndValues(paramsArray: ParamEntry[]): {
        resultString: string;
        valueArray: unknown[];
    } {
        let valueArray = [];
        let resultString = '';
        for (let i = 0; i < paramsArray.length; i++) {
            const paramEntry = paramsArray[i];
            resultString += paramEntry.sql;
            if (i < paramsArray.length - 1) {
                resultString += ' , ';
            }
            valueArray = valueArray.concat(paramEntry.vals);
        }
        return { resultString, valueArray };
    }
    options2string(optionsObj: OperationOptions): string {
        if (optionsObj === null || optionsObj === undefined) {
            return '';
        }
        let optionsString = '';
        if (optionsObj.order) {
            optionsString += ' ORDER BY ';
            for (let i = 0; i < optionsObj.order.length; i++) {
                const orderEntry = optionsObj.order[i];
                optionsString += ` ${orderEntry[0]} ${orderEntry[1]} `;
                if (i < optionsObj.order.length - 1) {
                    optionsString += ',';
                }
            }
        }
        if (optionsObj.limit) {
            optionsString += ` LIMIT ${optionsObj.limit}`;
        }
        return optionsString;
    }
    run(sql: string, params = []): Promise<unknown> {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err: Error) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve({ id: this.lastID });
                }
            });
        });
    }
    get(sql: string, params = []): Promise<unknown> {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err: Error, result: unknown) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(result);
                }
            });
        });
    }
    all(sql: string, params = []): Promise<unknown> {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err: Error, rows: unknown[]) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(rows);
                }
            });
        });
    }
    allOld(sql: string, params = []): Promise<unknown> {
        return new Promise((resolve, reject) => {
            this.oldDb.all(sql, params, (err: Error, rows: unknown[]) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(rows);
                }
            });
        });
    }
}
async function _ensureExists(dir: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        fs.mkdir(dir, { recursive: true }, (err) => {
            if (err) {
                if (err.code === 'EEXIST')
                    resolve();
                else
                    reject(err);
            }
            else {
                resolve();
            }
        });
    });
}
export default Sqlite3Storage;