import { Logger } from 'log4js';
import { crypto, logger, stateManager } from './Context';
import { hexstring, P2P } from '@shardus/types';
import { nodes } from './NodeList';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { logFlags } from '../logger';
import { shardusGetTime } from '../network';
let p2pLogger: Logger;
export let cycles: P2P.CycleCreatorTypes.CycleRecord[];
export let cyclesByMarker: {
    [marker: string]: P2P.CycleCreatorTypes.CycleRecord;
};
export let oldest: P2P.CycleCreatorTypes.CycleRecord;
export let newest: P2P.CycleCreatorTypes.CycleRecord;
let currentCycleMarker: hexstring;
reset();
export function init() {
    p2pLogger = logger.getLogger('p2p');
}
export function reset() {
    cycles = [];
    cyclesByMarker = {};
    oldest = null;
    newest = null;
    currentCycleMarker = null;
}
export function getNewest() {
    return newest;
}
export function append(cycle: P2P.CycleCreatorTypes.CycleRecord) {
    const marker = computeCycleMarker(cycle);
    if (!cyclesByMarker[marker]) {
        cycles.push(cycle);
        cyclesByMarker[marker] = cycle;
        newest = cycle;
        currentCycleMarker = marker;
        if (!oldest)
            oldest = cycle;
    }
}
export function prepend(cycle: P2P.CycleCreatorTypes.CycleRecord) {
    const marker = computeCycleMarker(cycle);
    if (!cyclesByMarker[marker]) {
        cycles.unshift(cycle);
        cyclesByMarker[marker] = cycle;
        oldest = cycle;
        if (newest == null) {
            newest = cycle;
        }
        if (cycle.counter > newest.counter) {
            newest = cycle;
            currentCycleMarker = marker;
        }
    }
}
export function validate(prev: P2P.CycleCreatorTypes.CycleRecord, next: P2P.CycleCreatorTypes.CycleRecord): boolean {
    const prevMarker = computeCycleMarker(prev);
    info('validate: prevMarker', prevMarker);
    info('validate: next.previous', next.previous);
    info('validate: prev.standbylist', prev.standbyNodeListHash);
    info('validate: next.standbylist', next.standbyNodeListHash);
    if (next.previous !== prevMarker) {
        info('validate: ERROR: next.previous !== prevMarker');
        return false;
    }
    return true;
}
export function getCycleChain(start, end = start + 100) {
    if (end - start > 100)
        end = start + 100;
    if (!oldest)
        return [];
    if (end < oldest.counter)
        return [];
    if (start < oldest.counter)
        start = oldest.counter;
    if (start > end)
        return [];
    const offset = oldest.counter;
    const relStart = start - offset;
    const relEnd = end - offset;
    return cycles.slice(relStart, relEnd + 1);
}
export function getStoredCycleByTimestamp(timestamp) {
    let secondsTs = Math.floor(timestamp * 0.001);
    for (let i = cycles.length - 1; i >= 0; i--) {
        let cycle = cycles[i];
        if (cycle.start < secondsTs && cycle.start + cycle.duration >= secondsTs) {
            return cycle;
        }
    }
    if (cycles.length > 0 && timestamp === cycles[0].start) {
        return cycles[0];
    }
    return null;
}
export function getCycleNumberFromTimestamp(timestamp: number, allowOlder: boolean = true, addSyncSettleTime: boolean = true) {
    let currentCycleShardData = stateManager.getCurrentCycleShardData();
    let offsetTimestamp = timestamp;
    if (addSyncSettleTime) {
        offsetTimestamp = timestamp + stateManager.syncSettleTime;
    }
    if (timestamp < 1 || timestamp == null) {
        let stack = new Error().stack;
        stateManager.statemanager_fatal(`getCycleNumberFromTimestamp ${timestamp}`, `getCycleNumberFromTimestamp ${timestamp} ,  ${stack}`);
    }
    if (currentCycleShardData.timestamp < offsetTimestamp &&
        offsetTimestamp <= currentCycleShardData.timestampEndCycle) {
        if (currentCycleShardData.cycleNumber == null) {
            stateManager.statemanager_fatal('getCycleNumberFromTimestamp failed. cycleNumber == null', 'currentCycleShardData.cycleNumber == null');
            const cycle = getStoredCycleByTimestamp(offsetTimestamp);
            if (cycle != null) {
                stateManager.statemanager_fatal('getCycleNumberFromTimestamp failed fatal redeemed', 'currentCycleShardData.cycleNumber == null, fatal redeemed');
                return cycle.counter;
            }
            else {
                let cycle2 = getStoredCycleByTimestamp(offsetTimestamp);
                stateManager.statemanager_fatal('getCycleNumberFromTimestamp failed fatal not redeemed', 'getStoredCycleByTimestamp cycleNumber == null not redeemed');
            }
        }
        else {
            if (currentCycleShardData.timestamp === offsetTimestamp) {
            }
            return currentCycleShardData.cycleNumber;
        }
    }
    if (currentCycleShardData.cycleNumber == null) {
        stateManager.statemanager_fatal('getCycleNumberFromTimestamp: currentCycleShardData.cycleNumber == null', `getCycleNumberFromTimestamp: currentCycleShardData.cycleNumber == null ${currentCycleShardData.cycleNumber} timestamp:${timestamp}`);
    }
    if (offsetTimestamp > currentCycleShardData.timestampEndCycle) {
        let cycle: P2P.CycleCreatorTypes.CycleRecord = getNewest();
        let timePastCurrentCycle = offsetTimestamp - currentCycleShardData.timestampEndCycle;
        const cyclesAheadNotAdjusted = timePastCurrentCycle / (cycle.duration * 1000);
        let cyclesAhead = Math.ceil(cyclesAheadNotAdjusted);
        if (cyclesAhead === cyclesAheadNotAdjusted) {
        }
        return currentCycleShardData.cycleNumber + cyclesAhead;
    }
    if (allowOlder === true) {
        const cycle = getStoredCycleByTimestamp(offsetTimestamp);
        if (cycle != null) {
            if (cycle.counter == null) {
                stateManager.statemanager_fatal('getCycleNumberFromTimestamp  unexpected cycle.cycleNumber == null', 'getCycleNumberFromTimestamp unexpected cycle.cycleNumber == null');
            }
            const cyclesBehind = currentCycleShardData.cycleNumber - cycle.counter;
            return cycle.counter;
        }
        else {
            let cycle: P2P.CycleCreatorTypes.CycleRecord = getNewest();
            let cycleEstimate = currentCycleShardData.cycleNumber -
                Math.ceil((currentCycleShardData.timestampEndCycle - offsetTimestamp) / (cycle.duration * 1000));
            if (cycleEstimate < 1) {
                cycleEstimate = 1;
            }
            return cycleEstimate;
        }
    }
    stateManager.statemanager_fatal('getCycleNumberFromTimestamp failed final', `getCycleNumberFromTimestamp failed final ${timestamp}`);
    return -1;
}
export function prune(keep: number) {
    const drop = cycles.length - keep;
    if (drop <= 0)
        return;
    cycles.splice(0, drop);
    oldest = cycles[0];
}
export function computeCycleMarker(fields) {
    const cycleMarker = crypto.hash(fields);
    return cycleMarker;
}
const idToIpPort: {
    [id: string]: string;
} = {};
export function getDebug() {
    const chain = cycles.map((record) => {
        const ctr = record.counter;
        const prev = record.previous.slice(0, 4);
        const rhash = crypto.hash(record).slice(0, 4);
        const actv = record.active;
        const exp = record.expired;
        const desr = record.desired;
        const joind = record.joinedConsensors.map((c) => `${c.externalIp}:${c.externalPort}`);
        const actvd = record.activated.map((id) => {
            if (idToIpPort[id])
                return idToIpPort[id];
            const node = nodes.get(id);
            if (node && node.externalIp && node.externalPort) {
                idToIpPort[id] = `${node.externalIp}:${node.externalPort}`;
                return idToIpPort[id];
            }
            else {
                return `missing-${id.substring(0, 5)}`;
            }
        });
        const rmvd = record.removed[0] !== 'all'
            ? record.removed.map((id) => (idToIpPort[id] ? idToIpPort[id] : 'x' + id.slice(0, 3)))
            : record.removed;
        const lost = record.lost.map((id) => (idToIpPort[id] ? idToIpPort[id] : 'x' + id.slice(0, 3)));
        const refu = record.refuted.map((id) => (idToIpPort[id] ? idToIpPort[id] : 'x' + id.slice(0, 3)));
        const apopd = record.apoptosized.map((id) => (idToIpPort[id] ? idToIpPort[id] : 'x' + id.slice(0, 3)));
        const rfshd = record.refreshedConsensors.map((c) => `${c.externalIp}:${c.externalPort}-${c.counterRefreshed}`);
        const str = `      ${ctr}:${prev}:${rhash} { actv:${actv}, exp:${exp}, desr:${desr}, joind:[${joind.join()}], actvd:[${actvd.join()}], lost:[${lost.join()}] refu:[${refu.join()}] apop:[${apopd.join()}] rmvd:[${record.removed[0] !== 'all' ? rmvd.join() : rmvd}], rfshd:[${rfshd.join()}] }`;
        return str;
    });
    const output = `
    DIGESTED:   ${newest ? newest.counter : newest}
    CHAIN:
  ${chain.join('\n')}`;
    return output;
}
export function getCurrentCycleMarker(): hexstring {
    return currentCycleMarker;
}
export function getNewestCycleInfoLogStr(msg: string): string {
    let cycleNumber = newest ? newest.counter : -1;
    const res = `Cycle: ${cycleNumber} Time:${shardusGetTime()} ${msg}`;
    return res;
}
function info(...msg) {
    const entry = `CycleChain: ${msg.join(' ')}`;
}