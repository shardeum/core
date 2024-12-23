import * as express from 'express';
import * as log4js from 'log4js';
import * as http from '../http';
import { logFlags } from '../logger';
import * as Active from '../p2p/Active';
import * as Comms from '../p2p/Comms';
import * as Context from '../p2p/Context';
import * as CycleChain from '../p2p/CycleChain';
import * as NodeList from '../p2p/NodeList';
import * as Self from '../p2p/Self';
import * as ShardusTypes from '../shardus/shardus-types';
import ShardFunctions from '../state-manager/shardFunctions';
import { Cycle, CycleShardData, MainHashResults } from '../state-manager/state-manager-types';
import { P2P, StateManager } from '@shardus/types';
import * as utils from '../utils';
import { profilerInstance } from '../utils/profiler';
import * as partitionGossip from './partition-gossip';
import * as SnapshotFunctions from './snapshotFunctions';
import { getNewestCycle } from '../p2p/Sync';
import { Utils } from '@shardus/types';
let disableSummarySnapshot = true;
export let oldDataPath: string;
let oldDataMap: Map<P2P.SnapshotTypes.PartitionNum, ShardusTypes.AccountsCopy[]> = new Map();
const dataToMigrate: Map<P2P.SnapshotTypes.PartitionNum, ShardusTypes.AccountsCopy[]> = new Map();
const oldPartitionHashMap: Map<P2P.SnapshotTypes.PartitionNum, string> = new Map();
let missingPartitions: P2P.SnapshotTypes.PartitionNum[] = [];
const notNeededRepliedNodes: Map<string, true> = new Map();
const alreadyOfferedNodes = new Map();
let stateHashesByCycle: Map<Cycle['counter'], P2P.SnapshotTypes.StateHashes> = new Map();
let receiptHashesByCycle: Map<Cycle['counter'], P2P.SnapshotTypes.ReceiptHashes> = new Map();
let summaryHashesByCycle: Map<Cycle['counter'], P2P.SnapshotTypes.SummaryHashes> = new Map();
const partitionBlockMapByCycle: Map<Cycle['counter'], StateManager.StateManagerTypes.ReceiptMapResult[]> = new Map();
const statesClumpMapByCycle: Map<Cycle['counter'], StateManager.StateManagerTypes.StatsClump> = new Map();
let safetySyncing = false;
export const safetyModeVals = {
    safetyMode: false,
    safetyNum: 0,
    networkStateHash: '',
};
export let lastSnapshotCycle = 0;
export let snapshotLogger: log4js.Logger;
export function initLogger() {
    snapshotLogger = Context.logger.getLogger('snapshot');
}
export function setOldDataPath(path) {
    oldDataPath = path;
    log('set old-data-path', oldDataPath);
}
export function getStateHashes(start: Cycle['counter'] = 0, end?: Cycle['counter']): P2P.SnapshotTypes.StateHashes[] {
    const collector: P2P.SnapshotTypes.StateHashes[] = [];
    for (const [key] of stateHashesByCycle) {
        if (key >= start) {
            collector.push(stateHashesByCycle.get(key));
        }
    }
    return collector;
}
export function getReceiptHashes(start: Cycle['counter'] = 0, end?: Cycle['counter']): P2P.SnapshotTypes.ReceiptHashes[] {
    const collector: P2P.SnapshotTypes.ReceiptHashes[] = [];
    for (const [key] of receiptHashesByCycle) {
        if (key >= start) {
            collector.push(receiptHashesByCycle.get(key));
        }
    }
    return collector;
}
export function getSummaryHashes(start: Cycle['counter'] = 0, end?: Cycle['counter']): P2P.SnapshotTypes.SummaryHashes[] {
    const collector: P2P.SnapshotTypes.SummaryHashes[] = [];
    for (const [key] of summaryHashesByCycle) {
        if (key >= start) {
            collector.push(summaryHashesByCycle.get(key));
        }
    }
    return collector;
}
export function getReceiptMap(start: Cycle['counter'] = 0, end?: Cycle['counter']): {
    [key: number]: StateManager.StateManagerTypes.ReceiptMapResult[];
} {
    const collector = {};
    for (const [key] of partitionBlockMapByCycle) {
        if (key >= start) {
            collector[key] = partitionBlockMapByCycle.get(key);
        }
    }
    return collector;
}
export function getSummaryBlob(start: Cycle['counter'] = 0, end?: Cycle['counter']): {
    [key: number]: StateManager.StateManagerTypes.StatsClump;
} {
    const collector = {};
    for (const [key] of statesClumpMapByCycle) {
        if (key >= start) {
            collector[key] = statesClumpMapByCycle.get(key);
        }
    }
    return collector;
}
function hashPartitionBlocks(partitionId, partitionBlocks) {
    const partitionBlock = partitionBlocks.find((b) => b.partition === partitionId);
    return Context.crypto.hash(partitionBlock || {});
}
export async function initSafetyModeVals() {
    const oldCycleRecord = await SnapshotFunctions.readOldCycleRecord();
    const oldNetworkHash = await SnapshotFunctions.readOldNetworkHash();
    const oldPartitionHashes = await SnapshotFunctions.readOldPartitionHashes();
    safetyModeVals.safetyMode = true;
    if (oldCycleRecord) {
        safetyModeVals.safetyNum = oldCycleRecord.active;
        lastSnapshotCycle = oldCycleRecord.counter - 1;
    }
    if (oldNetworkHash)
        safetyModeVals.networkStateHash = oldNetworkHash.hash;
    for (const row of oldPartitionHashes) {
        oldPartitionHashMap.set(parseInt(row.partitionId), row.hash);
    }
}
export function startSnapshotting() {
    partitionGossip.initGossip();
    Context.stateManager.eventEmitter.on('cycleTxsFinalized', async (shard: CycleShardData, receiptMapResults: StateManager.StateManagerTypes.ReceiptMapResult[], statsClump: StateManager.StateManagerTypes.StatsClump, mainHashResults: MainHashResults) => {
        try {
            const debugStrs = [];
            partitionBlockMapByCycle.set(shard.cycleNumber, receiptMapResults);
            const statsClumpForThisCycle: StateManager.StateManagerTypes.StatsClump = statsClump;
            statesClumpMapByCycle.set(shard.cycleNumber, statsClumpForThisCycle);
            const partitionRanges = getPartitionRanges(shard);
            const partitionHashes = new Map();
            for (const partition of shard.ourStoredPartitions) {
                const range = partitionRanges.get(partition);
                if (range) {
                    const accountsInPartition = await Context.storage.getAccountCopiesByCycleAndRange(shard.cycleNumber, range.low, range.high);
                    const hash = Context.crypto.hash(accountsInPartition);
                    partitionHashes.set(partition, hash);
                    if (logFlags.debug) {
                        try {
                            const wrappedAccts = await Context.stateManager.app.getAccountData(range.low, range.high, 10000000);
                            debugStrs.push(`  PARTITION ${partition}\n` +
                                wrappedAccts
                                    .map((acct) => {
                                    const id = acct.accountId === null ? 'null' : acct.accountId.substr(0, 8);
                                    const hash = acct.stateId === null ? 'null' : acct.stateId.substr(0, 8);
                                    return `    ID: ${id} HASH: ${hash}`;
                                })
                                    .join('\n'));
                        }
                        catch (e) {
                        }
                    }
                }
            }
            try {
            }
            catch (e) {
            }
            const globalAccounts = await Context.storage.getGlobalAccountCopies(shard.cycleNumber);
            const globalAccountHash = Context.crypto.hash(globalAccounts);
            partitionHashes.set(-1, globalAccountHash);
            const collector = partitionGossip.newCollector(shard);
            collector.once('gotAllHashes', (allHashes) => {
                const { partitionHashes, receiptHashes, summaryHashes } = allHashes;
                const networkStateHash = SnapshotFunctions.createNetworkHash(partitionHashes);
                const networkReceiptMapHash = SnapshotFunctions.createNetworkHash(receiptHashes);
                const networkSummaryHash = SnapshotFunctions.createNetworkHash(summaryHashes);
                safetyModeVals.networkStateHash = networkStateHash;
                SnapshotFunctions.savePartitionAndNetworkHashes(shard, partitionHashes, networkStateHash);
                SnapshotFunctions.saveReceiptAndNetworkHashes(shard, receiptHashes, networkReceiptMapHash);
                SnapshotFunctions.saveSummaryAndNetworkHashes(shard, summaryHashes, networkSummaryHash);
                const newStateHash: P2P.SnapshotTypes.StateHashes = {
                    counter: shard.cycleNumber,
                    partitionHashes,
                    networkHash: networkStateHash,
                };
                stateHashesByCycle = SnapshotFunctions.updateStateHashesByCycleMap(shard.cycleNumber, newStateHash, stateHashesByCycle);
                const newReceiptHash: P2P.SnapshotTypes.ReceiptHashes = {
                    counter: shard.cycleNumber,
                    receiptMapHashes: receiptHashes,
                    networkReceiptHash: networkReceiptMapHash,
                };
                receiptHashesByCycle = SnapshotFunctions.updateReceiptHashesByCycleMap(shard.cycleNumber, newReceiptHash, receiptHashesByCycle);
                const newSummaryHash: P2P.SnapshotTypes.SummaryHashes = {
                    counter: shard.cycleNumber,
                    summaryHashes: summaryHashes,
                    networkSummaryHash: networkSummaryHash,
                };
                summaryHashesByCycle = SnapshotFunctions.updateSummaryHashesByCycleMap(shard.cycleNumber, newSummaryHash, summaryHashesByCycle);
                partitionGossip.clean(shard.cycleNumber);
                log(`Network State Hash for cycle ${shard.cycleNumber}`, networkStateHash);
                log(`Network Receipt Hash for cycle ${shard.cycleNumber}`, networkReceiptMapHash);
                log(`Network Summary Hash for cycle ${shard.cycleNumber}`, networkSummaryHash);
            });
            partitionGossip.processMessagesInGossipQueue(shard, collector);
            const message: partitionGossip.Message = {
                cycle: shard.cycleNumber,
                data: {
                    partitionHash: {},
                    receiptMapHash: {},
                    summaryHash: {},
                },
                sender: Self.id,
            };
            for (const [partitionId, hash] of partitionHashes) {
                message.data.partitionHash[partitionId] = hash;
                message.data.receiptMapHash[partitionId] = hashPartitionBlocks(partitionId, partitionBlockMapByCycle.get(shard.cycleNumber));
            }
            if (disableSummarySnapshot === true) {
            }
            else {
                const summaryDataStatHash = {};
                const summarytxStatsHash = {};
                for (const blob of statsClumpForThisCycle.dataStats) {
                    summaryDataStatHash[blob.partition] = blob.opaqueBlob;
                }
                for (const blob of statsClumpForThisCycle.txStats) {
                    summarytxStatsHash[blob.partition] = blob.opaqueBlob;
                }
                for (const partition of statsClumpForThisCycle.covered) {
                    const summaryObj = {
                        dataStats: summaryDataStatHash[partition] ? summaryDataStatHash[partition] : {},
                        txStats: summarytxStatsHash[partition] ? summarytxStatsHash[partition] : {},
                    };
                    message.data.summaryHash[partition] = Context.crypto.hash(summaryObj);
                    if (summaryObj) {
                    }
                }
            }
            const signedMessage = Context.crypto.sign(message);
            Comms.sendGossip('snapshot_gossip', signedMessage, '', null, NodeList.byIdOrder, true);
            partitionGossip.forwardedGossips.set(message.sender, true);
            collector.process([message]);
            partitionGossip.cleanOld(shard.cycleNumber, 10);
        }
        catch (e) {
        }
        finally {
        }
    });
}
function createOffer() {
    const partitionsToOffer = [];
    for (const [partitionId] of oldDataMap) {
        partitionsToOffer.push(partitionId);
    }
    return {
        networkStateHash: safetyModeVals.networkStateHash,
        partitions: partitionsToOffer,
        downloadUrl: `http://${Self.ip}:${Self.port}/download-snapshot-data`,
    };
}
function getNodesThatCoverPartition(partitionId, shardGlobals: StateManager.shardFunctionTypes.ShardGlobals, nodeShardDataMap: StateManager.shardFunctionTypes.NodeShardDataMap): ShardusTypes.Node[] {
    const nodesInPartition: ShardusTypes.Node[] = [];
    if (partitionId === -1) {
        nodeShardDataMap.forEach((data, nodeId) => {
            if (nodeId === Self.id)
                return;
            const node = data.node;
            nodesInPartition.push(node);
        });
    }
    else {
        nodeShardDataMap.forEach((data, nodeId) => {
            if (nodeId === Self.id)
                return;
            const node = data.node;
            const homePartition = data.homePartition;
            const { partitionStart, partitionEnd } = ShardFunctions.calculateStoredPartitions2(shardGlobals, homePartition);
            if (partitionId >= partitionStart && partitionId <= partitionEnd) {
                nodesInPartition.push(node);
            }
        });
    }
    return nodesInPartition;
}
function getPartitionRanges(shard: CycleShardData): P2P.SnapshotTypes.PartitionRanges {
    const partitionRanges = new Map();
    for (const partition of shard.ourStoredPartitions) {
        partitionRanges.set(partition, ShardFunctions.partitionToAddressRange2(shard.shardGlobals, partition));
    }
    return partitionRanges;
}
async function goActiveIfDataComplete() {
    log('Missing partitions: ', missingPartitions);
    if (missingPartitions.length === 0) {
        log('We have complete data. Ready to go active');
        storeDataToNewDB(dataToMigrate);
        Context.stateManager.accountSync.skipSync();
        Active.requestActive();
        await Context.stateManager.accountSync.initialSyncMain(3);
        await Context.stateManager.waitForShardCalcs();
        Context.stateManager.appFinishedSyncing = true;
        Context.stateManager.appFinishedSyncing = true;
        Context.stateManager.startProcessingCycleSummaries();
        log('Syncing flags are set true after network recovery.');
    }
}
export async function startWitnessMode() {
    log('Starting in witness mode...');
    const archiver = Context.config.p2p.existingArchivers[0];
    const witnessInterval = setInterval(async () => {
        try {
            const fullNodesSigned = await Self.getFullNodesFromArchiver();
            if (!Context.crypto.verify(fullNodesSigned, archiver.publicKey)) {
                throw Error('Fatal: Full Node list was not signed by archiver!');
            }
            const nodeList = fullNodesSigned.nodeList;
            const newestCycle = await getNewestCycle(nodeList);
            const oldNetworkHash = await SnapshotFunctions.readOldNetworkHash();
            if (newestCycle.safetyMode === false || notNeededRepliedNodes.size >= nodeList.length) {
                log('Num of not_needed replied nodes => ', notNeededRepliedNodes.size);
                log('Node will exit witness mode and shutdown.');
                clearInterval(witnessInterval);
                await Context.shardus.shutdown();
                return;
            }
            if (newestCycle.safetyMode && newestCycle.networkStateHash === oldNetworkHash.hash) {
                log('Network is in safety mode and our network state hashes matches with newest cycle record');
                const shardGlobals = ShardFunctions.calculateShardGlobals(newestCycle.safetyNum, Context.config.sharding.nodesPerConsensusGroup, Context.config.sharding.nodesPerConsensusGroup);
                const nodeShardDataMap: StateManager.shardFunctionTypes.NodeShardDataMap = new Map();
                oldDataMap = await SnapshotFunctions.calculateOldDataMap(shardGlobals, nodeShardDataMap, oldPartitionHashMap, lastSnapshotCycle);
                SnapshotFunctions.registerDownloadRoutes(Context.network, oldDataMap, oldPartitionHashMap);
                const offer = createOffer();
                for (let i = 0; i < nodeList.length; i++) {
                    const node = nodeList[i];
                    const ip = 'ip' in node && node.ip || node.externalIp;
                    const port = 'port' in node && node.port || node.externalIp;
                    if (!alreadyOfferedNodes.has(node.id)) {
                        try {
                            log(`Sending witness offer to new node ${ip}:${port}`);
                            sendOfferToNode(node, offer);
                            alreadyOfferedNodes.set(node.id, true);
                        }
                        catch (e) {
                            log('ERROR: ', e);
                        }
                    }
                }
            }
        }
        catch (e) {
            log('ERROR: ', e);
        }
    }, Context.config.p2p.cycleDuration * 1000);
}
async function sendOfferToNode(node, offer, isSuggestedByNetwork = false) {
    let answer;
    let res;
    try {
        res = await http.post(`${node.ip}:${node.port}/snapshot-witness-data`, offer);
        answer = res.answer;
    }
    catch (e) {
        log('ERROR: unable to send offer to node');
        log('ERROR: ', e);
    }
    log(`Offer response from ${node.ip}:${node.port} is => `, answer);
    if (answer === P2P.SnapshotTypes.offerResponse.needed) {
        const requestedPartitions = res.partitions;
        const dataToSend = {};
        for (const partitionId of requestedPartitions) {
            dataToSend[partitionId] = {
                data: oldDataMap.get(partitionId),
                hash: oldPartitionHashMap.get(parseInt(partitionId)),
            };
        }
        await http.post(`${node.ip}:${node.port}/snapshot-data`, dataToSend)
            .catch(e => {
            log('ERROR: unable to send snapshot data to node');
            log('ERROR: ', e);
        });
    }
    else if (answer === P2P.SnapshotTypes.offerResponse.tryLater) {
        const waitTime = res.waitTime || 5 * Context.config.p2p.cycleDuration * 1000;
        setTimeout(() => {
            log(`Trying again to send to ${node.ip}:${node.port} after waiting ${waitTime} ms`);
            sendOfferToNode(node, offer, isSuggestedByNetwork);
        }, waitTime);
    }
    else if (answer === P2P.SnapshotTypes.offerResponse.sendTo) {
        if (isSuggestedByNetwork) {
            return;
        }
        const suggestedNodes = res.nodes;
        if (suggestedNodes && suggestedNodes.length > 0) {
            for (let i = 0; i < suggestedNodes.length; i++) {
                const suggestedNode = suggestedNodes[i];
                if (!alreadyOfferedNodes.has(suggestedNode.id)) {
                    log(`Sending offer to suggested Node ${node.ip}:${node.port}`);
                    sendOfferToNode(suggestedNode, offer, true);
                }
            }
        }
    }
    else if (answer === P2P.SnapshotTypes.offerResponse.notNeeded) {
        increaseNotNeededNodes(node.id);
    }
}
function increaseNotNeededNodes(id) {
    notNeededRepliedNodes.set(id, true);
}
async function storeDataToNewDB(dataMap) {
    const currentCycle = CycleChain.getNewest();
    log('Storing data to new DB');
    const accountCopies: ShardusTypes.AccountsCopy[] = [];
    for (const [, data] of dataMap) {
        if (data && data.length > 0) {
            data.forEach((accountData) => {
                accountCopies.push({
                    ...accountData,
                    cycleNumber: currentCycle.counter,
                });
            });
        }
    }
    await Context.stateManager._commitAccountCopies(accountCopies);
}
function processDownloadedMissingData(missingData) {
    if (missingPartitions.length === 0)
        return;
    log('Processing downloaded data');
    for (const partitionId in missingData) {
        const partitionData = missingData[partitionId];
        const accountsInPartition = partitionData.data.map((acc) => {
            return {
                accountId: acc.accountId,
                data: typeof acc.data === 'object' ? Utils.safeStringify(acc.data) : acc.data,
                timestamp: acc.timestamp,
                hash: acc.hash,
                isGlobal: acc.isGlobal,
            };
        });
        const computedHash = Context.crypto.hash(accountsInPartition);
        log(`Received data for partition ${partitionId} => `, accountsInPartition);
        log(computedHash, partitionData.hash);
        if (computedHash === partitionData.hash) {
            log(`Computed hash and received hash matches for partition ${partitionId}`);
            if (!dataToMigrate.has(parseInt(partitionId))) {
                dataToMigrate.set(parseInt(partitionId), partitionData.data);
                const index = missingPartitions.indexOf(parseInt(partitionId));
                missingPartitions.splice(index, 1);
                goActiveIfDataComplete();
            }
        }
        else {
            log(`Computed hash and received hash are DIFFERENT for ${partitionId}`);
        }
    }
}
function registerSnapshotRoutes() {
    const snapshotWitnessDataOfferRoute: P2P.P2PTypes.Route<express.Handler> = {
        method: 'POST',
        name: 'snapshot-witness-data',
        handler: (req, res) => {
            const err = utils.validateTypes(req, { body: 'o' });
            if (err) {
                log('snapshot-witness-data bad req ' + err);
                res.json([]);
                return;
            }
            if (Self.isActive) {
                res.json({ answer: P2P.SnapshotTypes.offerResponse.notNeeded });
                return;
            }
            const offerRequest = req.body;
            const neededPartitonIds = [];
            const neededHashes = [];
            if (!safetySyncing || !safetyModeVals.networkStateHash) {
                if (!safetySyncing)
                    log('We are not doing data exchange yet. Try agian later');
                if (!safetyModeVals.networkStateHash)
                    log('We have empty network state hash. Try agian later');
                res.json({
                    answer: P2P.SnapshotTypes.offerResponse.tryLater,
                    waitTime: Context.config.p2p.cycleDuration * 1000 * 0.5,
                });
                return;
            }
            if (offerRequest.networkStateHash === safetyModeVals.networkStateHash) {
                for (const partitionId of offerRequest.partitions) {
                    const isNeeded = missingPartitions.includes(partitionId);
                    if (isNeeded) {
                        neededPartitonIds.push(partitionId);
                        const hasHashForPartition = oldPartitionHashMap.has(partitionId);
                        if (!hasHashForPartition)
                            neededHashes.push(partitionId);
                    }
                }
                if (neededPartitonIds.length > 0) {
                    res.json({
                        answer: P2P.SnapshotTypes.offerResponse.needed,
                        partitions: neededPartitonIds,
                        hashes: neededHashes,
                    });
                    return;
                }
            }
            res.json({ answer: P2P.SnapshotTypes.offerResponse.notNeeded });
            return;
        },
    };
    const routes = [snapshotWitnessDataOfferRoute];
    for (const route of routes) {
        Context.network._registerExternal(route.method, route.name, route.handler);
    }
}
function log(...things) {
}