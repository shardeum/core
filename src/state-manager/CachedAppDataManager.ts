import { StateManager as StateManagerTypes, P2P as P2PTypes } from '@shardus/types';
import { Route } from '@shardus/types/build/src/p2p/P2PTypes';
import { Logger as Log4jsLogger } from 'log4js';
import StateManager from '.';
import Crypto from '../crypto';
import Logger, { logFlags } from '../logger';
import { P2PModuleContext as P2P } from '../p2p/Context';
import * as Shardus from '../shardus/shardus-types';
import { AppObjEnum } from '../shardus/shardus-types';
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum';
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum';
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum';
import { InternalBinaryHandler } from '../types/Handler';
import { estimateBinarySizeOfObject, getStreamWithTypeCheck, requestErrorHandler, verificationDataCombiner, } from '../types/Helpers';
import { deserializeSendCachedAppDataReq, SendCachedAppDataReq, serializeSendCachedAppDataReq, } from '../types/SendCachedAppDataReq';
import * as utils from '../utils';
import { reversed } from '../utils';
import Profiler, { profilerInstance } from '../utils/profiler';
import ShardFunctions from './shardFunctions';
import { CacheAppDataRequest, CacheAppDataResponse, CachedAppData, CacheTopic, QueueEntry, StringNodeObjectMap, } from './state-manager-types';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { CachedAppDataSerializable } from '../types/CachedAppData';
import { GetCachedAppDataReq, deserializeGetCachedAppDataReq, serializeGetCachedAppDataReq, } from '../types/GetCachedAppDataReq';
import { GetCachedAppDataResp, deserializeGetCachedAppDataResp, serializeGetCachedAppDataResp, } from '../types/GetCachedAppDataResp';
import { Utils } from '@shardus/types';
import { getCorrespondingNodes, verifyCorrespondingSender } from '../utils/fastAggregatedCorrespondingTell';
import * as NodeList from '../p2p/NodeList';
class CachedAppDataManager {
    app: Shardus.App;
    crypto: Crypto;
    config: Shardus.StrictServerConfiguration;
    profiler: Profiler;
    p2p: P2P;
    logger: Logger;
    mainLogger: Log4jsLogger;
    fatalLogger: Log4jsLogger;
    shardLogger: Log4jsLogger;
    statsLogger: Log4jsLogger;
    statemanager_fatal: (key: string, log: string) => void;
    stateManager: StateManager;
    cacheTopicMap: Map<string, CacheTopic>;
    constructor(stateManager: StateManager, profiler: Profiler, app: Shardus.App, logger: Logger, crypto: Crypto, p2p: P2P, config: Shardus.StrictServerConfiguration) {
        this.crypto = crypto;
        this.app = app;
        this.logger = logger;
        this.config = config;
        this.profiler = profiler;
        this.p2p = p2p;
        if (logger == null) {
            return;
        }
        this.mainLogger = logger.getLogger('main');
        this.fatalLogger = logger.getLogger('fatal');
        this.shardLogger = logger.getLogger('shardDump');
        this.statsLogger = logger.getLogger('statsDump');
        this.statemanager_fatal = stateManager.statemanager_fatal;
        this.stateManager = stateManager;
        this.cacheTopicMap = new Map();
        setInterval(this.pruneCachedItems.bind(this), 1000 * config.p2p.cycleDuration);
    }
    setupHandlers(): void {
        const send_cacheAppDataBinarySerializedHandler: Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_send_cachedAppData,
            handler: (payload, respond, header, sign) => {
                const route = InternalRouteEnum.binary_send_cachedAppData;
                const errorHandler = (errorType: RequestErrorEnum, opts?: {
                    customErrorLog?: string;
                    customCounterSuffix?: string;
                }): void => requestErrorHandler(route, errorType, header, opts);
                try {
                    const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cSendCachedAppDataReq);
                    if (!requestStream)
                        return errorHandler(RequestErrorEnum.InvalidRequest);
                    const req = deserializeSendCachedAppDataReq(requestStream);
                    const cachedAppData: CachedAppDataSerializable = req.cachedAppData;
                    if (cachedAppData == null) {
                        return errorHandler(RequestErrorEnum.InvalidRequest);
                    }
                    if (this.config.p2p.useFactCorrespondingTell) {
                        const isValidSender = this.factValidateCorrespondingCachedAppDataSender(cachedAppData.dataID, header.sender_id, req.executionShardKey, req.txId);
                        if (isValidSender === false) {
                            if (logFlags.error)
                                this.mainLogger.error(`send_cachedAppData invalid sender ${header.sender_id} for data: ${cachedAppData.dataID}`);
                            return;
                        }
                    }
                    const existingCachedAppData = this.getCachedItem(req.topic, cachedAppData.dataID);
                    if (existingCachedAppData) {
                        return;
                    }
                    this.insertCachedItem(req.topic, cachedAppData.dataID, cachedAppData.appData, cachedAppData.cycle);
                }
                catch (e) {
                    if (logFlags.error)
                        this.mainLogger.error(`${route}: Exception executing request: ${utils.errorToStringFull(e)}`);
                }
                finally {
                }
            },
        };
        this.p2p.registerInternalBinary(send_cacheAppDataBinarySerializedHandler.name, send_cacheAppDataBinarySerializedHandler.handler);
        const getCachedAppDataBinaryHandler: Route<InternalBinaryHandler<Buffer>> = {
            name: InternalRouteEnum.binary_get_cached_app_data,
            handler: async (payloadBuffer, respond, header, sign) => {
                const route = InternalRouteEnum.binary_get_cached_app_data;
                const response = {
                    cachedAppData: null,
                } as GetCachedAppDataResp;
                try {
                    const requestStream = getStreamWithTypeCheck(payloadBuffer, TypeIdentifierEnum.cGetCachedAppDataReq);
                    if (!requestStream) {
                        this.mainLogger.error(`Invalid input stream for ${route}`);
                        respond(response, serializeGetCachedAppDataResp);
                        return;
                    }
                    const readableReq = deserializeGetCachedAppDataReq(requestStream);
                    const foundCachedAppData = this.getCachedItem(readableReq.topic, readableReq.dataId);
                    response.cachedAppData = foundCachedAppData;
                    if (foundCachedAppData == null) {
                        if (logFlags.error)
                            this.mainLogger.error(`Cannot find cached data for topic: ${readableReq.topic}, dataId: ${readableReq.dataId}`);
                    }
                    respond(response, serializeGetCachedAppDataResp);
                }
                catch (e) {
                    this.mainLogger.error(`Error in getCachedAppDataBinray Handler ${e.message}`);
                    respond(response, serializeGetCachedAppDataResp);
                }
                finally {
                }
            },
        };
        this.p2p.registerInternalBinary(getCachedAppDataBinaryHandler.name, getCachedAppDataBinaryHandler.handler);
    }
    registerTopic(topic: string, maxCycleAge: number, maxCacheElements: number): boolean {
        const cacheTopic: CacheTopic = {
            topic,
            maxCycleAge,
            maxCacheElements,
            cacheAppDataMap: new Map(),
            cachedAppDataArray: [],
            maxItemSize: Number.MAX_VALUE,
        };
        if (this.cacheTopicMap.has(topic))
            return false;
        this.cacheTopicMap.set(topic, cacheTopic);
        return true;
    }
    getCachedItem(topic: string, dataID: string): CachedAppData {
        const cacheTopic = this.cacheTopicMap.get(topic);
        if (!cacheTopic)
            return;
        const cachedAppData = cacheTopic.cacheAppDataMap.get(dataID);
        return cachedAppData;
    }
    pruneCachedItems(): void {
        for (const [, cacheTopic] of this.cacheTopicMap.entries()) {
            let count = 0;
            const { maxCycleAge, maxCacheElements } = cacheTopic;
            const prunedCachedAppDataArray = [];
            for (const cachedAppData of reversed(cacheTopic.cachedAppDataArray)) {
                count += 1;
                const cycleAge = this.stateManager.currentCycleShardData.cycleNumber - cachedAppData.cycle;
                if (cycleAge > maxCycleAge || count > maxCacheElements) {
                    cacheTopic.cacheAppDataMap.delete(cachedAppData.dataID);
                }
                else {
                    prunedCachedAppDataArray.push(cachedAppData);
                }
            }
            cacheTopic.cachedAppDataArray = prunedCachedAppDataArray.reverse();
        }
    }
    insertCachedItem(topic: string, dataID: string, appData: unknown, cycle: number): void {
        const cachedAppData: CachedAppData = {
            dataID,
            appData,
            cycle,
        };
        const cacheTopic: CacheTopic = this.cacheTopicMap.get(topic);
        if (!cacheTopic) {
            if (logFlags.shardedCache)
                this.statemanager_fatal('insertCachedItem', `Topic ${topic} is not registered yet.`);
            return;
        }
        if (!cacheTopic.cacheAppDataMap.has(dataID)) {
            if (cacheTopic.maxCacheElements < cacheTopic.cachedAppDataArray.length + 1) {
                if (logFlags.shardedCache)
                    this.statemanager_fatal('insertCachedItem', `Topic ${topic} is at max cache count limit`);
                return;
            }
            const dataSize = estimateBinarySizeOfObject(cachedAppData);
            if (dataSize > cacheTopic.maxItemSize) {
                if (logFlags.shardedCache)
                    this.statemanager_fatal('insertCachedItem', `Topic ${topic} is at max size limit`);
                return;
            }
            cacheTopic.cacheAppDataMap.set(dataID, cachedAppData);
            cacheTopic.cachedAppDataArray.push(cachedAppData);
        }
    }
    setMemoryLimit(topic: string, maxItemSize: number) {
        const cacheTopic: CacheTopic = this.cacheTopicMap.get(topic);
        if (!cacheTopic) {
            if (logFlags.shardedCache)
                this.statemanager_fatal('setMemoryLimit', `Topic ${topic} is not registered yet.`);
            return;
        }
        cacheTopic.maxItemSize = maxItemSize;
    }
    factValidateCorrespondingCachedAppDataSender(dataID: string, senderNodeId: string, executionShardKey: string, txId: string) {
        const senderGroup = this.stateManager.transactionQueue.getConsenusGroupForAccount(executionShardKey);
        const senderNode = NodeList.nodes.get(senderNodeId);
        const logID = utils.stringifyReduce(txId);
        if (senderNode === null) {
            if (logFlags.error)
                this.mainLogger.error(`factValidateCorrespondingCachedAppDataSender: logId: ${logID} sender node is null`);
            return false;
        }
        const senderIsInExecutionGroup = senderGroup.some((node) => node.id === senderNodeId);
        if (senderIsInExecutionGroup === false) {
            if (logFlags.error)
                this.mainLogger.error(`factValidateCorrespondingCachedAppDataSender: logId: ${logID} sender is not in the execution group sender:${senderNodeId}`);
            return false;
        }
        const targetGroup = this.stateManager.transactionQueue.getConsenusGroupForAccount(dataID);
        const allNodes = Array.from(new Set([...senderGroup, ...targetGroup])).sort((a, b) => a.id.localeCompare(b.id));
        const senderIndexInTxGroup = allNodes.findIndex((node) => node.id === senderNodeId);
        const ourIndexInTxGroup = allNodes.findIndex((node) => node.id === this.stateManager.currentCycleShardData.nodeShardData.node.id);
        const senderGroupSize = senderGroup.length;
        const targetGroupSize = targetGroup.length;
        const { startIndex: targetStartIndex, endIndex: targetEndIndex } = this.stateManager.transactionQueue.getStartAndEndIndexOfTargetGroup(targetGroup.map(node => node.id), allNodes);
        const globalOffset = parseInt(txId.slice(-4), 16);
        const isValidFactSender = verifyCorrespondingSender(ourIndexInTxGroup, senderIndexInTxGroup, globalOffset, targetGroupSize, senderGroupSize, targetStartIndex, targetEndIndex, allNodes.length);
        if (isValidFactSender === false) {
            if (logFlags.error)
                this.mainLogger.error(`factValidateCorrespondingCachedAppDataSender: logId: logId: ${logID} sender is not a valid sender isValidSender:  ${isValidFactSender}`);
            return false;
        }
        return true;
    }
    factSendCorrespondingCachedAppData(topic: string, dataID: string, appData: unknown, cycle: number, _formId: string, txId: string): void {
        if (this.stateManager.currentCycleShardData == null) {
            throw new Error('factSendCorrespondingCachedAppData: currentCycleShardData == null');
        }
        if (dataID == null) {
            throw new Error('factSendCorrespondingCachedAppData: dataId == null');
        }
        const queueEntry: QueueEntry = this.stateManager.transactionQueue.getQueueEntry(txId);
        if (!queueEntry.executionGroup) {
            return;
        }
        const ourNodeData = this.stateManager.currentCycleShardData.nodeShardData;
        const senderGroup = this.stateManager.transactionQueue.getConsenusGroupForAccount(queueEntry.executionShardKey);
        const targetGroup = this.stateManager.transactionQueue.getConsenusGroupForAccount(dataID);
        const allNodes = Array.from(new Set([...senderGroup, ...targetGroup])).sort((a, b) => a.id.localeCompare(b.id));
        const senderIndexInTxGroup = allNodes.findIndex((node) => node.id === ourNodeData.node.id);
        const senderGroupSize = senderGroup.length;
        const targetGroupSize = targetGroup.length;
        const { startIndex: targetStartIndex, endIndex: targetEndIndex } = this.stateManager.transactionQueue.getStartAndEndIndexOfTargetGroup(targetGroup.map(node => node.id), allNodes);
        const globalOffset = parseInt(txId.slice(-4), 16);
        const correspondingIndices = getCorrespondingNodes(senderIndexInTxGroup, targetStartIndex, targetEndIndex, globalOffset, targetGroupSize, senderGroupSize, allNodes.length);
        const correspondingNodes: P2PTypes.NodeListTypes.Node[] = [];
        for (const index of correspondingIndices) {
            const node = allNodes[index];
            if (targetGroup.includes(node as P2PTypes.NodeListTypes.Node)) {
                correspondingNodes.push(node as P2PTypes.NodeListTypes.Node);
            }
        }
        const cacheAppDataToSend: CachedAppData = {
            dataID,
            appData,
            cycle,
        };
        const message: CacheAppDataResponse = { topic, cachedAppData: cacheAppDataToSend };
        if (correspondingNodes.length > 0) {
            if (correspondingNodes.length === 1 && correspondingNodes[0].id === ourNodeData.node.id) {
                const existingCachedAppData = this.getCachedItem(topic, dataID);
                if (existingCachedAppData) {
                    return;
                }
                this.insertCachedItem(topic, dataID, appData, cycle);
                return;
            }
            const filteredNodes = this.stateManager.filterValidNodesForInternalMessage(correspondingNodes, 'factSendCorrespondingCachedAppData', true, true);
            if (filteredNodes.length === 0) {
                if (logFlags.error)
                    this.mainLogger.error("cachedAppData: factSendCorrespondingCachedAppData: filterValidNodesForInternalMessage no valid nodes left to try");
                return null;
            }
            const filteredCorrespondingAccNodes = filteredNodes;
            const sendCacheAppDataReq: SendCachedAppDataReq = {
                topic,
                txId,
                executionShardKey: queueEntry.executionShardKey,
                cachedAppData: {
                    dataID: message.cachedAppData.dataID,
                    appData: message.cachedAppData.appData,
                    cycle: message.cachedAppData.cycle,
                },
            };
            this.p2p.tellBinary<SendCachedAppDataReq>(filteredCorrespondingAccNodes, InternalRouteEnum.binary_send_cachedAppData, sendCacheAppDataReq, serializeSendCachedAppDataReq, {});
        }
    }
    async sendCorrespondingCachedAppData(topic: string, dataID: string, appData: unknown, cycle: number, _formId: string, txId: string): Promise<unknown> {
        if (this.stateManager.currentCycleShardData == null) {
            throw new Error('sendCorrespondingCachedAppData: currentCycleShardData == null');
        }
        if (dataID == null) {
            throw new Error('sendCorrespondingCachedAppData: dataId == null');
        }
        const queueEntry: QueueEntry = this.stateManager.transactionQueue.getQueueEntry(txId);
        const fromKey = queueEntry.executionShardKey ? queueEntry.executionShardKey : queueEntry.txKeys.allKeys[0];
        const uniqueKeys = [fromKey, dataID];
        const ourNodeData = this.stateManager.currentCycleShardData.nodeShardData;
        let correspondingAccNodes: Shardus.Node[] = [];
        const dataKeysWeHave = [];
        const dataValuesWeHave = [];
        const dataMap: {
            [accountID: string]: any;
        } = {};
        const remoteShardsByKey: {
            [accountID: string]: StateManagerTypes.shardFunctionTypes.NodeShardData;
        } = {};
        let loggedPartition = false;
        const localHomeNode = ShardFunctions.findHomeNode(this.stateManager.currentCycleShardData.shardGlobals, fromKey, this.stateManager.currentCycleShardData.parititionShardDataMap);
        const remoteHomeNode = ShardFunctions.findHomeNode(this.stateManager.currentCycleShardData.shardGlobals, dataID, this.stateManager.currentCycleShardData.parititionShardDataMap);
        for (const key of uniqueKeys) {
            let hasKey = false;
            if (remoteHomeNode.node.id === ourNodeData.node.id) {
                hasKey = true;
            }
            else {
                for (const node of remoteHomeNode.nodeThatStoreOurParitionFull) {
                    if (node.id === ourNodeData.node.id) {
                        hasKey = true;
                        break;
                    }
                }
            }
            const isGlobalKey = false;
            if (hasKey === false) {
                if (loggedPartition === false) {
                    loggedPartition = true;
                }
            }
            if (hasKey) {
                const data = appData;
                if (isGlobalKey === false) {
                    dataMap[key] = data;
                    dataKeysWeHave.push(key);
                    dataValuesWeHave.push(data);
                }
                this.insertCachedItem(topic, dataID, data, cycle);
            }
            else {
                remoteShardsByKey[key] = remoteHomeNode;
            }
        }
        let edgeNodeIds = [];
        let consensusNodeIds = [];
        const nodesToSendTo: StringNodeObjectMap = {};
        const doOnceNodeAccPair = new Set<string>();
        for (const key of uniqueKeys) {
            for (const key2 of uniqueKeys) {
                if (key !== key2) {
                    const ourLocalConsensusIndex = localHomeNode.consensusNodeForOurNodeFull.findIndex((a) => a.id === ourNodeData.node.id);
                    if (ourLocalConsensusIndex === -1) {
                        continue;
                    }
                    edgeNodeIds = [];
                    consensusNodeIds = [];
                    correspondingAccNodes = [];
                    const ourSendingGroupSize = localHomeNode.consensusNodeForOurNodeFull.length;
                    const targetConsensusGroupSize = remoteHomeNode.consensusNodeForOurNodeFull.length;
                    const targetEdgeGroupSize = remoteHomeNode.edgeNodes.length;
                    const patchedListSize = remoteHomeNode.patchedOnNodes.length;
                    const indices = ShardFunctions.debugFastStableCorrespondingIndicies(ourSendingGroupSize, targetConsensusGroupSize, ourLocalConsensusIndex + 1);
                    const edgeIndices = ShardFunctions.debugFastStableCorrespondingIndicies(ourSendingGroupSize, targetEdgeGroupSize, ourLocalConsensusIndex + 1);
                    let patchIndices = [];
                    if (remoteHomeNode.patchedOnNodes.length > 0) {
                        patchIndices = ShardFunctions.debugFastStableCorrespondingIndicies(ourSendingGroupSize, remoteHomeNode.patchedOnNodes.length, ourLocalConsensusIndex + 1);
                    }
                    for (const index of indices) {
                        const node = remoteHomeNode.consensusNodeForOurNodeFull[index - 1];
                        if (node != null && node.id !== ourNodeData.node.id) {
                            nodesToSendTo[node.id] = node;
                            consensusNodeIds.push(node.id);
                        }
                    }
                    for (const index of edgeIndices) {
                        const node = remoteHomeNode.edgeNodes[index - 1];
                        if (node != null && node.id !== ourNodeData.node.id) {
                            nodesToSendTo[node.id] = node;
                            edgeNodeIds.push(node.id);
                        }
                    }
                    for (const index of patchIndices) {
                        const node = remoteHomeNode.edgeNodes[index - 1];
                        if (node != null && node.id !== ourNodeData.node.id) {
                            nodesToSendTo[node.id] = node;
                        }
                    }
                    const cacheAppDataToSend: CachedAppData = {
                        dataID,
                        appData,
                        cycle,
                    };
                    const message: CacheAppDataResponse = { topic, cachedAppData: cacheAppDataToSend };
                    for (const [accountID, node] of Object.entries(nodesToSendTo)) {
                        const keyPair = accountID + key;
                        if (node != null && doOnceNodeAccPair.has(keyPair) === false) {
                            doOnceNodeAccPair.add(keyPair);
                            correspondingAccNodes.push(node);
                        }
                    }
                    if (correspondingAccNodes.length > 0) {
                        const remoteRelation = ShardFunctions.getNodeRelation(remoteHomeNode, this.stateManager.currentCycleShardData.ourNode.id);
                        const localRelation = ShardFunctions.getNodeRelation(localHomeNode, this.stateManager.currentCycleShardData.ourNode.id);
                        const filteredNodes = this.stateManager.filterValidNodesForInternalMessage(correspondingAccNodes, 'tellCorrespondingNodes', true, true);
                        if (filteredNodes.length === 0) {
                            if (logFlags.error)
                                this.mainLogger.error("cachedAppData: tellCorrespondingNodes: filterValidNodesForInternalMessage no valid nodes left to try");
                            return null;
                        }
                        const filteredCorrespondingAccNodes = filteredNodes;
                        const sendCacheAppDataReq: SendCachedAppDataReq = {
                            topic,
                            txId,
                            executionShardKey: queueEntry.executionShardKey,
                            cachedAppData: {
                                dataID: message.cachedAppData.dataID,
                                appData: message.cachedAppData.appData,
                                cycle: message.cachedAppData.cycle,
                            },
                        };
                        this.p2p.tellBinary<SendCachedAppDataReq>(filteredCorrespondingAccNodes, InternalRouteEnum.binary_send_cachedAppData, sendCacheAppDataReq, serializeSendCachedAppDataReq, {});
                    }
                }
            }
        }
    }
    async getLocalOrRemoteCachedAppData(topic: string, dataId: string): Promise<CachedAppData | null> {
        let cachedAppData: CachedAppData | null = null;
        if (this.stateManager.currentCycleShardData == null) {
            await this.stateManager.waitForShardData();
        }
        if (this.stateManager.currentCycleShardData == null) {
            throw new Error('getLocalOrRemoteCachedAppData: network not ready');
        }
        const address = dataId;
        let forceLocalGlobalLookup = false;
        if (this.stateManager.accountGlobals.isGlobalAccount(address)) {
            forceLocalGlobalLookup = true;
        }
        let accountIsRemote = this.stateManager.transactionQueue.isAccountRemote(address);
        if (this.stateManager.currentCycleShardData.nodes.length <=
            this.stateManager.currentCycleShardData.shardGlobals.consensusRadius) {
            accountIsRemote = false;
        }
        if (forceLocalGlobalLookup) {
            accountIsRemote = false;
        }
        if (accountIsRemote) {
            const validNodeRetries = 5;
            let randomConsensusNode = null;
            for (let i = 0; i < validNodeRetries; i++) {
                const nodeCheck = this.stateManager.transactionQueue.getRandomConsensusNodeForAccount(address);
                if (nodeCheck == null) {
                    throw new Error('getLocalOrRemoteAccount: no consensus node found');
                }
                if (this.stateManager.isNodeValidForInternalMessage(nodeCheck.id, 'getLocalOrRemoteCachedAppData', true, true, true) === true) {
                    randomConsensusNode = nodeCheck;
                    break;
                }
            }
            if (randomConsensusNode == null) {
                if (logFlags.verbose)
                    this.stateManager.getAccountFailDump(address, "getLocalOrRemoteCachedAppData: isNodeValidForInternalMessage failed, no retry");
                return null;
            }
            const message = { topic, dataId };
            let r: CachedAppData | boolean;
            try {
                const resp = await this.p2p.askBinary<GetCachedAppDataReq, GetCachedAppDataResp>(randomConsensusNode, InternalRouteEnum.binary_get_cached_app_data, message, serializeGetCachedAppDataReq, deserializeGetCachedAppDataResp, {});
                r = resp?.cachedAppData ?? false;
            }
            catch (e) {
                if (logFlags.error)
                    this.mainLogger.error(`cachedAppData: ASK exception getLocalOrRemoteCachedAppData`, e);
                return null;
            }
            if (r === false) {
                if (logFlags.error)
                    this.mainLogger.error(`cachedAppData: ASK FAIL getLocalOrRemoteCachedAppData r === false`);
                return null;
            }
            const result = r as CachedAppData;
            if (result != null && result.appData != null) {
                return result;
            }
            else {
                if (logFlags.verbose)
                    this.stateManager.getAccountFailDump(address, 'remote request missing data: result == null');
            }
        }
        else {
            cachedAppData = this.getCachedItem(topic, dataId);
            if (cachedAppData != null) {
                return cachedAppData;
            }
            else {
            }
        }
        return null;
    }
}
export default CachedAppDataManager;