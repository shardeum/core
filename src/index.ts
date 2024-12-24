import merge from 'deepmerge';
import Shardus from './shardus';
import * as ShardusTypes from './shardus/shardus-types';
import { compareObjectShape } from './utils';
export { default as Shardus } from './shardus';
export { ShardusTypes };
export { CachedAppData } from './state-manager/state-manager-types';
export { nestedCountersInstance } from './utils/nestedCounters';
export { DevSecurityLevel } from './shardus/shardus-types';
export { VectorBufferStream } from './utils/serialization/VectorBufferStream';
import { addressToPartition, partitionInWrappingRange, findHomeNode } from './state-manager/shardFunctions';
import SHARDUS_CONFIG from './config';
export const __ShardFunctions = {
    addressToPartition,
    partitionInWrappingRange,
    findHomeNode,
};
export { LogFlags } from './logger';
export { DebugComplete } from './state-manager/TransactionQueue';
const defaultConfigs: ShardusTypes.StrictShardusConfiguration = SHARDUS_CONFIG;
const overwriteMerge = (target, source, options) => source;
export function shardusFactory(configs = {}) {
    const mergedConfigs = merge(defaultConfigs, configs, {
        arrayMerge: overwriteMerge,
    });
    const { isValid, error } = compareObjectShape(defaultConfigs, mergedConfigs);
    if (error) {
        const fRed = '\x1b[31m';
        const bYellow = '\x1b[43m';
        const defectiveObjectPath = error.defectiveChain.join('.');
        const defectiveObjectPathColored = `${fRed}${bYellow}${defectiveObjectPath}\x1b[0m`;
        const msg = `Unacceptable config object shape, defective settings detected: ${defectiveObjectPath}`;
        throw new Error(msg);
    }
    return new Shardus(mergedConfigs);
}