import * as NodeList from './NodeList';
import * as Self from './Self';
import { enterRecovery, enterSafety, enterProcessing, enterShutdown } from './Modes';
import { config, logger } from './Context';
import { targetCount } from './CycleAutoScale';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { P2P } from '@shardus/types';
import { insertSorted, lerp } from '../utils';
import * as CycleCreator from './CycleCreator';
import * as CycleChain from './CycleChain';
import { logFlags } from '../logger';
import { Utils } from '@shardus/types';
interface ToAcceptResult {
    add: number;
    remove: number;
}
export function calculateToAcceptV2(prevRecord: P2P.CycleCreatorTypes.CycleRecord): ToAcceptResult {
    const active = NodeList.activeByIdOrder.length;
    const syncing = NodeList.byJoinOrder.length - NodeList.activeByIdOrder.length;
    const desired = prevRecord?.desired;
    const target = targetCount;
    const mode = prevRecord?.mode;
    const hasPrevRecord = prevRecord != null;
    const counter = prevRecord?.counter;
    const lost_count = prevRecord?.lost?.length;
    if (logFlags?.node_rotation_debug)
        logger.mainLog_debug('CALCULATETOACCEPTV2_1', logger.combine(`calculateToAcceptV2 prevCounter: ${counter}, desired: ${desired}, target: ${target}, active: ${active}, syncing: ${syncing}`, 'calculateToAcceptV2_prevCounter'));
    if (hasPrevRecord === false) {
        return { add: 0, remove: 0 };
    }
    return calculateAddRemove(mode, active, syncing, desired, target, counter, lost_count);
}
function calculateAddRemove(mode: string, active: number, syncing: number, desired: number, target: number, counter: number, lost_count: number): ToAcceptResult {
    let add = 0;
    let remove = 0;
    const desiredSyncingNodeCount = config.p2p.syncingDesiredMinCount;
    const useNewSyncingDesiredCount = config.p2p.syncFloorEnabled;
    const syncingMaxAddPercent = config.p2p.syncingMaxAddPercent;
    const syncingCeilingBase = desiredSyncingNodeCount;
    const syncingCeilingProcessing = syncingCeilingBase * 2;
    const syncingCeilingSafety = syncingCeilingBase * 4;
    const syncingCeilingRecovery = syncingCeilingBase * 4;
    if (mode === 'forming') {
        if (Self.isFirst && active < 1) {
            add = target;
            remove = 0;
            return { add, remove };
        }
        else if (active != desired) {
            let addRem = target - (active + syncing);
            if (logFlags?.node_rotation_debug)
                logger.mainLog_debug('CALCULATEADDREMOVE_FORMING_1', logger.combine(`under forming active != desired; addRem: ${addRem}`, 'forming_active_not_desired'));
            if (addRem > 0) {
                add = Math.ceil(addRem);
                remove = 0;
                return { add, remove };
            }
            if (addRem < 0) {
                addRem = active - target;
                if (addRem > 0) {
                    if (addRem > 0.1 * active) {
                        addRem = 0.1 * active;
                    }
                    if (addRem < 1) {
                        addRem = 1;
                    }
                    add = 0;
                    remove = Math.ceil(addRem);
                    return { add, remove };
                }
            }
        }
    }
    else if (mode === 'restart') {
        if (syncing < desired + config.p2p.extraNodesToAddInRestart) {
            const addRem = target + config.p2p.extraNodesToAddInRestart - syncing;
            if (logFlags?.node_rotation_debug)
                logger.mainLog_debug('CALCULATEADDREMOVE_RESTART_1', logger.combine(`under restart active != desired; addRem: ${addRem}`, 'restart_active_not_desired'));
            if (addRem > 0) {
                add = Math.ceil(addRem);
                remove = 0;
                return { add, remove };
            }
        }
    }
    else if (mode === 'processing') {
        if (enterSafety(active) === false && enterRecovery(active) === false) {
            if (logFlags?.node_rotation_debug)
                logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_1', logger.combine("max rotated per cycle: ", config.p2p.maxRotatedPerCycle, 'max_rotated_per_cycle'));
            if (active !== ~~target) {
                if (logFlags?.node_rotation_debug)
                    logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_2', logger.combine("active not equal target", 'active_not_equal_target'));
                let addRem = target - (active + syncing);
                if (logFlags?.node_rotation_debug)
                    logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_3', logger.combine("addRem ", addRem, 'addRem'));
                if (addRem > 0) {
                    if (addRem > active * config.p2p.rotationMaxAddPercent) {
                        addRem = ~~(active * config.p2p.rotationMaxAddPercent);
                        if (addRem === 0) {
                            addRem = 1;
                        }
                    }
                    add = Math.ceil(addRem);
                    remove = 0;
                    if (useNewSyncingDesiredCount) {
                        add = maintainSyncingFloor(desiredSyncingNodeCount, syncing, add);
                        add = clampMaxNodesToAdd(add, active, syncingMaxAddPercent);
                        add = maintainSyncingCeiling(syncingCeilingProcessing, syncing, add);
                    }
                    const logMsg = 'active !== ~~target addRem > 0';
                    if (logFlags?.node_rotation_debug)
                        logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_4', logger.combine(`calculateAddRemove: cycle:${counter} `, logMsg, `add: ${add} remove:${remove} active:${active} syncing:${syncing}`, 'calculateAddRemove_active_not_equal_target_addRem_greater_than_0'));
                    return { add, remove };
                }
                if (addRem < 0) {
                    let toRemove = active - target;
                    if (logFlags?.node_rotation_debug)
                        logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_5', logger.combine(`addRem in processing: ${toRemove}`, 'addRem_in_processing'));
                    if (toRemove > active * config.p2p.rotationMaxRemovePercent) {
                        if (logFlags?.node_rotation_debug)
                            logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_6', logger.combine('unexpected addRem > 5% of active', toRemove, active, target, desired, 'unexpected_addRem_greater_than_5_percent_of_active'));
                        toRemove = ~~(active * config.p2p.rotationMaxRemovePercent);
                        if (toRemove === 0) {
                            toRemove = 1;
                        }
                    }
                    if (toRemove > 0) {
                        if (toRemove > active * config.p2p.rotationMaxRemovePercent) {
                            toRemove = active * config.p2p.rotationMaxRemovePercent;
                        }
                        if (toRemove < 1) {
                            toRemove = 1;
                        }
                        add = 0;
                        remove = Math.ceil(toRemove);
                        if (useNewSyncingDesiredCount) {
                            add = maintainSyncingFloor(desiredSyncingNodeCount, syncing, add);
                            add = clampMaxNodesToAdd(add, active, syncingMaxAddPercent);
                            add = maintainSyncingCeiling(syncingCeilingProcessing, syncing, add);
                        }
                        const logMsg = 'active !== ~~target addRem < 0 tooremove > 0';
                        if (logFlags?.node_rotation_debug)
                            logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_7', logger.combine(`calculateAddRemove: cycle:${counter} `, logMsg, `add: ${add} remove:${remove} active:${active} syncing:${syncing}`, 'calculateAddRemove_active_not_equal_target_addRem_less_than_0_tooremove_greater_than_0'));
                        return { add, remove };
                    }
                    else {
                        if (useNewSyncingDesiredCount) {
                            add = 0;
                            add = maintainSyncingFloor(desiredSyncingNodeCount, syncing, add);
                            add = clampMaxNodesToAdd(add, active, syncingMaxAddPercent);
                            add = maintainSyncingCeiling(syncingCeilingProcessing, syncing, add);
                            const logMsg = 'active !== ~~target addRem too remove <= 0';
                            if (logFlags?.node_rotation_debug)
                                logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_8', logger.combine(`calculateAddRemove: cycle:${counter} `, logMsg, `add: ${add} remove:${remove} active:${active} syncing:${syncing}`, 'calculateAddRemove_active_not_equal_target_addRem_too_remove_less_than_or_equal_to_0'));
                            return { add, remove };
                        }
                        const desiredRotationPerCycle = 1;
                        const maxSyncing = desiredRotationPerCycle * config.p2p.rotationCountMultiply + config.p2p.rotationCountAdd + 1;
                        if (syncing < maxSyncing) {
                            add = maxSyncing - syncing;
                            return { add, remove };
                        }
                    }
                }
            }
            else if (config.p2p.maxRotatedPerCycle !== 0) {
                if (useNewSyncingDesiredCount) {
                    add = 0;
                    add = maintainSyncingFloor(desiredSyncingNodeCount, syncing, add);
                    add = clampMaxNodesToAdd(add, active, syncingMaxAddPercent);
                    add = maintainSyncingCeiling(syncingCeilingProcessing, syncing, add);
                    const logMsg = 'active == ~~target 0';
                    if (logFlags?.node_rotation_debug)
                        logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_9', logger.combine(`calculateAddRemove: cycle:${counter} `, logMsg, `add: ${add} remove:${remove} active:${active} syncing:${syncing}`, 'calculateAddRemove_active_equal_target_0'));
                    return { add, remove };
                }
                if (logFlags?.node_rotation_debug)
                    logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_10', logger.combine("entered rotation", 'entered_rotation'));
                let rnum = config.p2p.maxRotatedPerCycle;
                if (rnum < 0) {
                    rnum = active * config.p2p.rotationPercentActive;
                }
                if (rnum < 1) {
                    if (counter % (1 / rnum) === 0) {
                        rnum = 1;
                    }
                    else {
                        rnum = 0;
                    }
                }
                if (rnum > 0) {
                    if (rnum > active * config.p2p.rotationPercentActive) {
                        rnum = ~~(active * config.p2p.rotationPercentActive);
                        if (rnum < 1) {
                            rnum = 1;
                        }
                    }
                    rnum = config.p2p.rotationCountMultiply * rnum;
                    rnum = config.p2p.rotationCountAdd + rnum;
                    if (logFlags?.node_rotation_debug)
                        logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_11', logger.combine("rnum: ", rnum, 'rnum'));
                    if (logFlags?.node_rotation_debug)
                        logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_12', logger.combine("setting add to rnum", 'setting_add_to_rnum'));
                    add = Math.ceil(rnum);
                    remove = 0;
                }
                if (logFlags?.node_rotation_debug)
                    logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_13', logger.combine(`add: ${add}, remove: ${remove}`, 'add_remove'));
                return { add, remove };
            }
        }
    }
    else if (mode === 'safety') {
        if (enterProcessing(active) === false && enterRecovery(active) === false) {
            if (useNewSyncingDesiredCount) {
                add = config.p2p.minNodes - (active + syncing);
                add = Math.max(add, 0);
                add = maintainSyncingFloor(desiredSyncingNodeCount, syncing, add);
                add = clampMaxNodesToAdd(add, active, syncingMaxAddPercent);
                add = maintainSyncingCeiling(syncingCeilingSafety, syncing, add);
                const logMsg = 'safety';
                if (logFlags?.node_rotation_debug)
                    logger.mainLog_debug('CALCULATEADDREMOVE_SAFETY_1', logger.combine(`calculateAddRemove: cycle:${counter} `, logMsg, `add: ${add} remove:${remove} active:${active} syncing:${syncing}`, 'calculateAddRemove_safety'));
                return { add, remove };
            }
            let addRem = 1.02 * config.p2p.minNodes - (active + syncing);
            if (addRem > active * 0.05) {
                addRem = ~~(active * 0.05);
                if (addRem === 0) {
                    addRem = 1;
                }
            }
            addRem += lost_count;
            if (addRem > 0) {
                add = Math.ceil(addRem);
                remove = 0;
                return { add, remove };
            }
        }
    }
    else if (mode === 'recovery') {
        if (enterShutdown(active) === false) {
            if (useNewSyncingDesiredCount) {
                add = config.p2p.minNodes - (active + syncing);
                add = Math.max(add, 0);
                add = maintainSyncingFloor(desiredSyncingNodeCount, syncing, add);
                add = clampMaxNodesToAdd(add, active, syncingMaxAddPercent);
                add = maintainSyncingCeiling(syncingCeilingRecovery, syncing, add);
                const logMsg = 'recovery';
                if (logFlags?.node_rotation_debug)
                    logger.mainLog_debug('CALCULATEADDREMOVE_RECOVERY_1', logger.combine(`calculateAddRemove: cycle:${counter} `, logMsg, `add: ${add} remove:${remove} active:${active} syncing:${syncing}`));
                return { add, remove };
            }
            const totalNodeCount = active + syncing;
            let addRem = target - totalNodeCount;
            if (logFlags?.node_rotation_debug)
                logger.mainLog_debug('CALCULATEADDREMOVE_RECOVERY_1', `Recovery mode calculations addRem: ${addRem} active: ${active} syncing: ${syncing} target: ${target}`);
            if (addRem > totalNodeCount * 0.2) {
                addRem = ~~(totalNodeCount * 0.2);
                if (addRem === 0) {
                    addRem = 1;
                }
            }
            if (addRem > 0) {
                add = Math.ceil(addRem);
                remove = 0;
                return { add, remove };
            }
        }
    }
    else if (mode === 'restore') {
        const addRem = target - (active + syncing);
        if (logFlags?.node_rotation_debug)
            logger.mainLog_debug('CALCULATEADDREMOVE_RESTORE_1', `Restore mode calculations addRem: ${addRem} active: ${active} syncing: ${syncing} target: ${target}`);
        if (addRem > 0) {
            add = Math.ceil(addRem);
            return { add, remove };
        }
    }
    if (logFlags.verbose)
        logger.mainLog_debug('CALCULATEADDREMOVE_17', `add remove returned from default. add_remove_returned_from_default mode:${mode} add: ${add} remove:${remove} active:${active} syncing:${syncing}`);
    return { add, remove };
}
function maintainSyncingFloor(desiredSyncingNodeCount: number, syncing: number, add: number): number {
    if (syncing < desiredSyncingNodeCount) {
        const addtionalNodesToAdd = desiredSyncingNodeCount - (syncing - add);
        if (logFlags?.node_rotation_debug)
            logger.mainLog_debug('MAINTAINSYNCINGFLOOR_ADD', `maintainSyncingFloor syncing: ${syncing} desiredSyncingNodeCount: ${desiredSyncingNodeCount} add: ${add} (before) addtionalNodesToAdd: ${addtionalNodesToAdd}`);
        add += addtionalNodesToAdd;
    }
    return add;
}
function maintainSyncingCeiling(syncCeiling: number, syncing: number, add: number): number {
    if (syncing > syncCeiling) {
        if (logFlags?.node_rotation_debug)
            logger.mainLog_debug('MAINTAINSYNCINGCEILING_CLAMP', `maintainSyncingCeiling syncing: ${syncing} syncCeiling: ${syncCeiling} add: ${add} (will be set to 0)`);
        add = 0;
    }
    return add;
}
function clampMaxNodesToAdd(add: number, active: number, syncingMaxAddPercent: number): number {
    const maxAdd = active * syncingMaxAddPercent;
    if (add > maxAdd) {
        if (logFlags?.node_rotation_debug)
            logger.mainLog_debug('CLAMP_MAX_NODES_TO_ADD', `clampMaxNodesToAdd add: ${add} active: ${active} maxAdd: ${maxAdd}`);
        add = ~~(maxAdd);
        if (add === 0) {
            add = 1;
        }
    }
    return add;
}
export function getExpiredRemovedV2(prevRecord: P2P.CycleCreatorTypes.CycleRecord, lastLoggedCycle: number, txs: P2P.RotationTypes.Txs & P2P.ApoptosisTypes.Txs, info: (...msg: string[]) => void): {
    expired: number;
    removed: string[];
} {
    const start = prevRecord.start;
    let expired = 0;
    const removed = [];
    NodeList.potentiallyRemoved.clear();
    if (config.p2p.nodeExpiryAge < 0)
        return { expired, removed };
    const active = NodeList.activeByIdOrder.length;
    let expireTimestamp = start - config.p2p.nodeExpiryAge;
    if (expireTimestamp < 0)
        expireTimestamp = 0;
    const { add, remove } = calculateToAcceptV2(prevRecord);
    const maxRemove = remove;
    const cycle = CycleChain.newest.counter;
    if (cycle > lastLoggedCycle && maxRemove > 0) {
        lastLoggedCycle = cycle;
        info('scale down dump:' +
            Utils.safeStringify({
                cycle,
                scaleFactor: CycleCreator.scaleFactor,
                desired: prevRecord.desired,
                active,
                maxRemove,
                expired,
            }));
    }
    const apoptosizedNodesList = [];
    for (const request of txs.apoptosis) {
        const node = NodeList.nodes.get(request.id);
        if (node) {
            apoptosizedNodesList.push(node.id);
        }
    }
    for (const node of NodeList.byJoinOrder) {
        if (node.status === 'syncing')
            continue;
        if (node.activeTimestamp > expireTimestamp)
            break;
        expired++;
        if (config.p2p.uniqueRemovedIds) {
            if (removed.length + apoptosizedNodesList.length < maxRemove) {
                NodeList.potentiallyRemoved.add(node.id);
                if (!apoptosizedNodesList.includes(node.id)) {
                    insertSorted(removed, node.id);
                }
            }
            else
                break;
        }
        else {
            if (removed.length < maxRemove) {
                NodeList.potentiallyRemoved.add(node.id);
                insertSorted(removed, node.id);
            }
        }
    }
    return { expired, removed };
}