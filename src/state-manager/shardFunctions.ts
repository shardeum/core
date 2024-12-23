import Logger, { logFlags } from '../logger';
import * as Shardus from '../shardus/shardus-types';
import { StateManager, P2P } from '@shardus/types';
import log4js from 'log4js';
import { Ordering } from '../utils';
import { Utils } from '@shardus/types';
type ShardGlobals = StateManager.shardFunctionTypes.ShardGlobals;
type ShardInfo = StateManager.shardFunctionTypes.ShardInfo;
type NodeShardData = StateManager.shardFunctionTypes.NodeShardData;
type NodeShardDataMap = StateManager.shardFunctionTypes.NodeShardDataMap;
type PartitionShardDataMap = StateManager.shardFunctionTypes.ParititionShardDataMap;
type WrappablePartitionRange = StateManager.shardFunctionTypes.WrappableParitionRange;
type HomeNodeSummary = StateManager.shardFunctionTypes.HomeNodeSummary;
type AddressRange = StateManager.shardFunctionTypes.AddressRange;
class ShardFunctions {
    static logger: Logger = null;
    static mainLogger: log4js.Logger = null;
    static fatalLogger: log4js.Logger = null;
    static calculateShardGlobals(numNodes: number, nodesPerConsenusGroup: number, nodesPerEdge: number): ShardGlobals {
        const shardGlobals = {} as ShardGlobals;
        if (nodesPerConsenusGroup % 2 === 0) {
            nodesPerConsenusGroup++;
        }
        shardGlobals.numActiveNodes = numNodes;
        shardGlobals.nodesPerConsenusGroup = nodesPerConsenusGroup;
        shardGlobals.numPartitions = shardGlobals.numActiveNodes;
        if (nodesPerConsenusGroup % 2 === 0 || nodesPerConsenusGroup < 3) {
            throw new Error(`nodesPerConsenusGroup:${nodesPerConsenusGroup} must be odd and >= 3`);
        }
        shardGlobals.consensusRadius = Math.floor((nodesPerConsenusGroup - 1) / 2);
        if (nodesPerEdge == null) {
            nodesPerEdge = shardGlobals.consensusRadius;
        }
        shardGlobals.nodesPerEdge = nodesPerEdge;
        const partitionStoreRadius = shardGlobals.consensusRadius + shardGlobals.nodesPerEdge;
        shardGlobals.numVisiblePartitions = shardGlobals.nodesPerConsenusGroup + nodesPerEdge * 2;
        shardGlobals.nodeLookRange = Math.floor((partitionStoreRadius / shardGlobals.numPartitions) * 0xffffffff);
        return shardGlobals;
    }
    static leadZeros8(input: string): string {
        return ('00000000' + input).slice(-8);
    }
    static calculateShardValues(shardGlobals: ShardGlobals, address: string): ShardInfo {
        const shardinfo = {} as ShardInfo;
        shardinfo.address = address;
        shardinfo.homeNodes = [];
        shardinfo.addressPrefix = parseInt(address.slice(0, 8), 16);
        shardinfo.addressPrefixHex = ShardFunctions.leadZeros8(shardinfo.addressPrefix.toString(16));
        shardinfo.homePartition = ShardFunctions.addressNumberToPartition(shardGlobals, shardinfo.addressPrefix);
        shardinfo.homeRange = ShardFunctions.partitionToAddressRange2(shardGlobals, shardinfo.homePartition);
        shardinfo.coveredBy = {};
        shardinfo.storedBy = {};
        return shardinfo;
    }
    static calculateStoredPartitions2(shardGlobals: ShardGlobals, homePartition: number): WrappablePartitionRange {
        const storedPartitionRadius = shardGlobals.consensusRadius + shardGlobals.nodesPerEdge;
        return ShardFunctions.calculateParitionRange(shardGlobals, homePartition, storedPartitionRadius);
    }
    static calculateConsensusPartitions(shardGlobals: ShardGlobals, homePartition: number): WrappablePartitionRange {
        return ShardFunctions.calculateParitionRange(shardGlobals, homePartition, shardGlobals.consensusRadius);
    }
    static calculateParitionRange(shardGlobals: ShardGlobals, homePartition: number, partitionRadius: number): WrappablePartitionRange {
        const wrappableParitionRange = {} as WrappablePartitionRange;
        wrappableParitionRange.homeRange = ShardFunctions.partitionToAddressRange2(shardGlobals, homePartition);
        if (shardGlobals.numPartitions / 2 <= partitionRadius) {
            wrappableParitionRange.rangeIsSplit = false;
            wrappableParitionRange.partitionStart = 0;
            wrappableParitionRange.partitionEnd = shardGlobals.numPartitions - 1;
            ShardFunctions.calculatePartitionRangeInternal(shardGlobals, wrappableParitionRange, partitionRadius);
            return wrappableParitionRange;
        }
        const x = partitionRadius;
        const n = homePartition;
        wrappableParitionRange.x = x;
        wrappableParitionRange.n = n;
        wrappableParitionRange.partitionStart = n - x;
        wrappableParitionRange.partitionEnd = n + x;
        ShardFunctions.calculatePartitionRangeInternal(shardGlobals, wrappableParitionRange, partitionRadius);
        return wrappableParitionRange;
    }
    static calculatePartitionRangeInternal(shardGlobals: ShardGlobals, wrappablePartitionRange: WrappablePartitionRange, partitionRadius: number): void {
        wrappablePartitionRange.partitionRangeVector = {
            start: wrappablePartitionRange.partitionStart,
            dist: 1 + 2 * shardGlobals.nodesPerConsenusGroup,
            end: wrappablePartitionRange.partitionEnd,
        };
        wrappablePartitionRange.rangeIsSplit = false;
        wrappablePartitionRange.partitionsCovered = 0;
        if (wrappablePartitionRange.partitionStart < 0) {
            wrappablePartitionRange.rangeIsSplit = true;
            wrappablePartitionRange.partitionStart2 =
                wrappablePartitionRange.partitionStart + shardGlobals.numPartitions;
            wrappablePartitionRange.partitionEnd2 = shardGlobals.numPartitions - 1;
            wrappablePartitionRange.partitionStart1 = 0;
            wrappablePartitionRange.partitionEnd1 = wrappablePartitionRange.partitionEnd;
            wrappablePartitionRange.partitionRangeVector.start = wrappablePartitionRange.partitionStart2;
            wrappablePartitionRange.partitionStart = wrappablePartitionRange.partitionRangeVector.start;
        }
        if (wrappablePartitionRange.partitionEnd >= shardGlobals.numPartitions) {
            wrappablePartitionRange.rangeIsSplit = true;
            wrappablePartitionRange.partitionEnd1 =
                wrappablePartitionRange.partitionEnd - shardGlobals.numPartitions;
            wrappablePartitionRange.partitionStart1 = 0;
            wrappablePartitionRange.partitionStart2 = wrappablePartitionRange.partitionStart;
            wrappablePartitionRange.partitionEnd2 = shardGlobals.numPartitions - 1;
            wrappablePartitionRange.partitionRangeVector.end = wrappablePartitionRange.partitionEnd1;
            wrappablePartitionRange.partitionEnd = wrappablePartitionRange.partitionRangeVector.end;
        }
        if (wrappablePartitionRange.partitionEnd < wrappablePartitionRange.partitionStart) {
            wrappablePartitionRange.rangeIsSplit = true;
            wrappablePartitionRange.partitionEnd1 = wrappablePartitionRange.partitionEnd;
            wrappablePartitionRange.partitionStart1 = 0;
            wrappablePartitionRange.partitionStart2 = wrappablePartitionRange.partitionStart;
            wrappablePartitionRange.partitionEnd2 = shardGlobals.numPartitions - 1;
            wrappablePartitionRange.partitionRangeVector.end = wrappablePartitionRange.partitionEnd1;
            wrappablePartitionRange.partitionEnd = wrappablePartitionRange.partitionRangeVector.end;
        }
        if (wrappablePartitionRange.rangeIsSplit === true &&
            wrappablePartitionRange.partitionEnd1 + 1 === wrappablePartitionRange.partitionStart2) {
            wrappablePartitionRange.rangeIsSplit = false;
            wrappablePartitionRange.partitionStart = 0;
            wrappablePartitionRange.partitionEnd = shardGlobals.numPartitions - 1;
            wrappablePartitionRange.partitionRangeVector = {
                start: wrappablePartitionRange.partitionStart,
                dist: 1 + 2 * partitionRadius,
                end: wrappablePartitionRange.partitionEnd,
            };
        }
        if (wrappablePartitionRange.rangeIsSplit === false) {
            wrappablePartitionRange.partitionStart1 = wrappablePartitionRange.partitionStart;
            wrappablePartitionRange.partitionEnd1 = wrappablePartitionRange.partitionEnd;
        }
        if (wrappablePartitionRange.rangeIsSplit === true &&
            (wrappablePartitionRange.partitionStart1 === wrappablePartitionRange.partitionEnd2 ||
                wrappablePartitionRange.partitionStart2 === wrappablePartitionRange.partitionEnd1)) {
            throw new Error('this should never happen: ' +
                Utils.safeStringify(wrappablePartitionRange) +
                'globals: ' +
                Utils.safeStringify(shardGlobals));
        }
        if (wrappablePartitionRange.rangeIsSplit) {
            if (wrappablePartitionRange.partitionStart2 >= 0 && wrappablePartitionRange.partitionEnd2 >= 0) {
                wrappablePartitionRange.partitionRange = ShardFunctions.partitionToAddressRange2(shardGlobals, wrappablePartitionRange.partitionStart1, wrappablePartitionRange.partitionEnd1);
                wrappablePartitionRange.partitionRange2 = ShardFunctions.partitionToAddressRange2(shardGlobals, wrappablePartitionRange.partitionStart2, wrappablePartitionRange.partitionEnd2);
                wrappablePartitionRange.partitionsCovered =
                    2 +
                        (wrappablePartitionRange.partitionEnd1 - wrappablePartitionRange.partitionStart1) +
                        (wrappablePartitionRange.partitionEnd2 - wrappablePartitionRange.partitionStart2);
            }
            else {
                throw new Error('missing ranges in partitionRange 1');
            }
        }
        else {
            wrappablePartitionRange.partitionRange = ShardFunctions.partitionToAddressRange2(shardGlobals, wrappablePartitionRange.partitionStart, wrappablePartitionRange.partitionEnd);
            if (wrappablePartitionRange.partitionStart1 >= 0 && wrappablePartitionRange.partitionEnd1 >= 0) {
                wrappablePartitionRange.partitionsCovered =
                    1 + (wrappablePartitionRange.partitionEnd1 - wrappablePartitionRange.partitionStart1);
            }
            else {
                throw new Error(`missing ranges in partitionRange 2b  ${wrappablePartitionRange.partitionStart1} ${wrappablePartitionRange.partitionEnd1} ${Utils.safeStringify(wrappablePartitionRange)}`);
            }
        }
    }
    static testAddressInRange(address: string, wrappableParitionRange: WrappablePartitionRange): boolean {
        if (wrappableParitionRange.rangeIsSplit) {
            if ((address >= wrappableParitionRange.partitionRange.low &&
                address <= wrappableParitionRange.partitionRange.high) ||
                (address >= wrappableParitionRange.partitionRange2.low &&
                    address <= wrappableParitionRange.partitionRange2.high)) {
                return true;
            }
        }
        else {
            if (address >= wrappableParitionRange.partitionRange.low &&
                address <= wrappableParitionRange.partitionRange.high) {
                return true;
            }
        }
        return false;
    }
    static testAddressNumberInRange(address: number, wrappableParitionRange: WrappablePartitionRange): boolean {
        if (wrappableParitionRange.rangeIsSplit) {
            if ((address >= wrappableParitionRange.partitionRange.startAddr &&
                address <= wrappableParitionRange.partitionRange.endAddr) ||
                (address >= wrappableParitionRange.partitionRange2.startAddr &&
                    address <= wrappableParitionRange.partitionRange2.endAddr)) {
                return true;
            }
        }
        else {
            if (address >= wrappableParitionRange.partitionRange.startAddr &&
                address <= wrappableParitionRange.partitionRange.endAddr) {
                return true;
            }
        }
        return false;
    }
    static testInRange(partition: number, wrappableParitionRange: WrappablePartitionRange): boolean {
        if (wrappableParitionRange.rangeIsSplit) {
            if ((partition >= wrappableParitionRange.partitionStart1 &&
                partition <= wrappableParitionRange.partitionEnd1) ||
                (partition >= wrappableParitionRange.partitionStart2 &&
                    partition <= wrappableParitionRange.partitionEnd2)) {
                return true;
            }
        }
        else {
            if (partition >= wrappableParitionRange.partitionStart &&
                partition <= wrappableParitionRange.partitionEnd) {
                return true;
            }
        }
        return false;
    }
    static getPartitionsCovered(wrappableParitionRange: WrappablePartitionRange): number {
        let covered = 0;
        if (wrappableParitionRange.rangeIsSplit === true) {
            covered =
                2 +
                    (wrappableParitionRange.partitionEnd2 - wrappableParitionRange.partitionStart2) +
                    (wrappableParitionRange.partitionEnd1 - wrappableParitionRange.partitionStart1);
        }
        else {
            covered = 1 + wrappableParitionRange.partitionEnd - wrappableParitionRange.partitionStart;
        }
        if (covered < 20) {
            covered += 0;
        }
        return covered;
    }
    static computePartitionShardDataMap(shardGlobals: ShardGlobals, partitionShardDataMap: PartitionShardDataMap, partitionStart: number, partitionsToScan: number): void {
        let partitionIndex = partitionStart;
        const numPartitions = shardGlobals.numPartitions;
        for (let i = 0; i < partitionsToScan; ++i) {
            if (partitionIndex >= numPartitions) {
                partitionIndex = 0;
            }
            const fpAdressCenter = (i + 0.5) / numPartitions;
            const addressPrefix = Math.floor(fpAdressCenter * 0xffffffff);
            const addressPrefixHex = ShardFunctions.leadZeros8(addressPrefix.toString(16));
            const address = addressPrefixHex + '7' + 'f'.repeat(55);
            const shardinfo = ShardFunctions.calculateShardValues(shardGlobals, address);
            partitionShardDataMap.set(i, shardinfo);
            partitionIndex++;
            if (partitionIndex === partitionStart) {
                break;
            }
        }
    }
    static computeNodePartitionDataMap(shardGlobals: ShardGlobals, nodeShardDataMap: NodeShardDataMap, nodesToGenerate: P2P.NodeListTypes.Node[], partitionShardDataMap: PartitionShardDataMap, activeNodes: Shardus.Node[], extendedData: boolean, isActiveNodeList = true): void {
        let index = 0;
        for (const node of nodesToGenerate) {
            let nodeShardData = nodeShardDataMap.get(node.id);
            if (!nodeShardData) {
                let thisNodeIndex = undefined;
                if (isActiveNodeList) {
                    thisNodeIndex = index;
                }
                nodeShardData = ShardFunctions.computeNodePartitionData(shardGlobals, node, nodeShardDataMap, partitionShardDataMap, activeNodes, false, thisNodeIndex);
            }
            index++;
        }
        if (extendedData) {
            index = 0;
            for (const node of nodesToGenerate) {
                const nodeShardData = nodeShardDataMap.get(node.id);
                if (nodeShardData == null) {
                    continue;
                }
                ShardFunctions.computeExtendedNodePartitionData(shardGlobals, nodeShardDataMap, partitionShardDataMap, nodeShardData, activeNodes);
            }
        }
    }
    static computeNodePartitionData(shardGlobals: ShardGlobals, node: Shardus.Node, nodeShardDataMap: NodeShardDataMap, partitionShardDataMap: PartitionShardDataMap, activeNodes: Shardus.Node[], extendedData?: boolean, thisNodeIndex?: number): NodeShardData {
        const numPartitions = shardGlobals.numPartitions;
        const nodeShardData = {} as NodeShardData;
        if (thisNodeIndex != undefined) {
            nodeShardData.ourNodeIndex = thisNodeIndex;
        }
        else {
            nodeShardData.ourNodeIndex = activeNodes.findIndex((_node) => {
                return _node.id === node.id;
            });
            if (nodeShardData.ourNodeIndex === -1) {
                for (let i = 0; i < activeNodes.length; i++) {
                    nodeShardData.ourNodeIndex = i;
                    if (activeNodes[i].id >= node.id) {
                        break;
                    }
                }
            }
        }
        const homePartition = nodeShardData.ourNodeIndex;
        const centeredAddress = Math.floor(((homePartition + 0.5) * 0xffffffff) / numPartitions);
        const nodeAddressNum = centeredAddress;
        nodeShardData.node = node;
        nodeShardData.nodeAddressNum = nodeAddressNum;
        nodeShardData.homePartition = homePartition;
        nodeShardData.centeredAddress = centeredAddress;
        nodeShardData.consensusStartPartition = homePartition;
        nodeShardData.consensusEndPartition = homePartition;
        nodeShardData.patchedOnNodes = [];
        let partitionShard = partitionShardDataMap.get(homePartition);
        if (partitionShard == null) {
            partitionShard = partitionShardDataMap.get(homePartition);
        }
        if (partitionShard == null) {
            throw new Error(`computeNodePartitionData: cant find partitionShard for index:${nodeShardData.ourNodeIndex} size:${partitionShardDataMap.size} activeNodes:${activeNodes.length}  `);
        }
        if (nodeShardData.ourNodeIndex !== -1) {
            partitionShard.homeNodes = [];
            partitionShard.homeNodes.push(nodeShardData);
        }
        nodeShardData.extendedData = false;
        if (extendedData) {
            ShardFunctions.computeExtendedNodePartitionData(shardGlobals, nodeShardDataMap, partitionShardDataMap, nodeShardData, activeNodes);
        }
        nodeShardDataMap.set(node.id, nodeShardData);
        nodeShardData.needsUpdateToFullConsensusGroup = true;
        return nodeShardData;
    }
    static computeExtendedNodePartitionData(shardGlobals: ShardGlobals, nodeShardDataMap: NodeShardDataMap, partitionShardDataMap: PartitionShardDataMap, nodeShardData: NodeShardData, activeNodes: Shardus.Node[]): void {
        if (nodeShardData.extendedData) {
            return;
        }
        const useCombinedCalculation = true;
        const checkNewCalculation = false;
        nodeShardData.extendedData = true;
        if (nodeShardData.storedPartitions == null) {
            nodeShardData.storedPartitions = ShardFunctions.calculateStoredPartitions2(shardGlobals, nodeShardData.homePartition);
        }
        if (nodeShardData.consensusPartitions == null) {
            nodeShardData.consensusPartitions = ShardFunctions.calculateConsensusPartitions(shardGlobals, nodeShardData.homePartition);
        }
        const nodeIsActive = nodeShardData.ourNodeIndex !== -1;
        const exclude = [nodeShardData.node.id];
        const excludeNodeArray = [nodeShardData.node];
        if (nodeIsActive) {
            if (useCombinedCalculation) {
                const combinedNodes = ShardFunctions.getCombinedNodeLists(shardGlobals, nodeShardData, nodeShardDataMap, activeNodes);
                nodeShardData.consensusNodeForOurNode = combinedNodes.consensusNodeForOurNode;
                nodeShardData.consensusNodeForOurNodeFull = combinedNodes.consensusNodeForOurNodeFull;
                nodeShardData.nodeThatStoreOurParition = combinedNodes.nodeThatStoreOurPartition;
                nodeShardData.nodeThatStoreOurParitionFull = combinedNodes.nodeThatStoreOurPartitionFull;
                nodeShardData.edgeNodes = combinedNodes.edgeNodes;
            }
            else {
                nodeShardData.nodeThatStoreOurParition = ShardFunctions.getNodesThatCoverHomePartition(shardGlobals, nodeShardData, nodeShardDataMap, activeNodes);
                nodeShardData.consensusNodeForOurNode = ShardFunctions.getNeigborNodesInRange(nodeShardData.ourNodeIndex, shardGlobals.consensusRadius, exclude, activeNodes);
                nodeShardData.consensusNodeForOurNodeFull = ShardFunctions.getNeigborNodesInRange(nodeShardData.ourNodeIndex, shardGlobals.consensusRadius, [], activeNodes);
            }
            if (nodeShardData.consensusNodeForOurNodeFull.length >= 2) {
                const startNode = nodeShardData.consensusNodeForOurNodeFull[0];
                const endNode = nodeShardData.consensusNodeForOurNodeFull[nodeShardData.consensusNodeForOurNodeFull.length - 1];
                let startPartition = nodeShardDataMap.get(startNode.id).homePartition;
                let endPartition = nodeShardDataMap.get(endNode.id).homePartition;
                if (startPartition === endPartition && startNode.id > endNode.id) {
                    startPartition = 0;
                    endPartition = shardGlobals.numPartitions - 1;
                }
                nodeShardData.consensusStartPartition = startPartition;
                nodeShardData.consensusEndPartition = endPartition;
            }
            if (nodeShardData.consensusStartPartition <= nodeShardData.consensusEndPartition) {
                for (let i = nodeShardData.consensusStartPartition; i <= nodeShardData.consensusEndPartition; i++) {
                    const shardPartitionData = partitionShardDataMap.get(i);
                    if (shardPartitionData == null) {
                        throw new Error('computeExtendedNodePartitionData: shardPartitionData==null 1');
                    }
                    shardPartitionData.coveredBy[nodeShardData.node.id] = nodeShardData.node;
                }
            }
            else {
                for (let i = 0; i <= nodeShardData.consensusEndPartition; i++) {
                    const shardPartitionData = partitionShardDataMap.get(i);
                    if (shardPartitionData == null) {
                        throw new Error('computeExtendedNodePartitionData: shardPartitionData==null 2');
                    }
                    shardPartitionData.coveredBy[nodeShardData.node.id] = nodeShardData.node;
                }
                for (let i = nodeShardData.consensusStartPartition; i < shardGlobals.numPartitions; i++) {
                    const shardPartitionData = partitionShardDataMap.get(i);
                    if (shardPartitionData == null) {
                        throw new Error('computeExtendedNodePartitionData: shardPartitionData==null 3');
                    }
                    shardPartitionData.coveredBy[nodeShardData.node.id] = nodeShardData.node;
                }
            }
            if (!useCombinedCalculation) {
                nodeShardData.c2NodeForOurNode = ShardFunctions.getNeigborNodesInRange(nodeShardData.ourNodeIndex, 2 * shardGlobals.consensusRadius, exclude, activeNodes);
                const [results, extras] = ShardFunctions.mergeNodeLists(nodeShardData.nodeThatStoreOurParition, nodeShardData.c2NodeForOurNode);
                nodeShardData.nodeThatStoreOurParitionFull = results;
                nodeShardData.outOfDefaultRangeNodes = extras;
                nodeShardData.edgeNodes = ShardFunctions.subtractNodeLists(nodeShardData.nodeThatStoreOurParitionFull, nodeShardData.consensusNodeForOurNode);
                nodeShardData.edgeNodes = ShardFunctions.subtractNodeLists(nodeShardData.edgeNodes, excludeNodeArray);
            }
            if (checkNewCalculation) {
                const combinedNodes = ShardFunctions.getCombinedNodeLists(shardGlobals, nodeShardData, nodeShardDataMap, activeNodes);
                const diffA1 = ShardFunctions.subtractNodeLists(nodeShardData.nodeThatStoreOurParition, combinedNodes.nodeThatStoreOurPartition);
                const diffA2 = ShardFunctions.subtractNodeLists(combinedNodes.nodeThatStoreOurPartition, nodeShardData.nodeThatStoreOurParition);
                const diffB1 = ShardFunctions.subtractNodeLists(combinedNodes.consensusNodeForOurNode, nodeShardData.consensusNodeForOurNode);
                const diffB2 = ShardFunctions.subtractNodeLists(nodeShardData.consensusNodeForOurNode, combinedNodes.consensusNodeForOurNode);
                const diffC1 = ShardFunctions.subtractNodeLists(combinedNodes.consensusNodeForOurNodeFull, nodeShardData.consensusNodeForOurNodeFull);
                const diffC2 = ShardFunctions.subtractNodeLists(nodeShardData.consensusNodeForOurNodeFull, combinedNodes.consensusNodeForOurNodeFull);
                const diffD1 = ShardFunctions.subtractNodeLists(combinedNodes.edgeNodes, nodeShardData.edgeNodes);
                const diffD2 = ShardFunctions.subtractNodeLists(nodeShardData.edgeNodes, combinedNodes.edgeNodes);
                if (diffA1.length > 0)
                    throw new Error('Different calculation');
                if (diffA2.length > 0)
                    throw new Error('Different calculation');
                if (diffB1.length > 0)
                    throw new Error('Different calculation');
                if (diffB2.length > 0)
                    throw new Error('Different calculation');
                if (diffC1.length > 0)
                    throw new Error('Different calculation');
                if (diffC2.length > 0)
                    throw new Error('Different calculation');
                if (diffD1.length > 0)
                    throw new Error('Different calculation');
                if (diffD2.length > 0)
                    throw new Error('Different calculation');
            }
            const extras = [];
            if (extras.length > 0) {
                let message = 'computeExtendedNodePartitionData: failed';
                try {
                    const list1 = nodeShardData.nodeThatStoreOurParition.map((n) => n.id.substring(0, 5));
                    const list2 = nodeShardData.nodeThatStoreOurParition.map((n) => n.id.substring(0, 5));
                    const extraLists = extras.map((n) => n.id.substring(0, 5));
                    message = `computeExtendedNodePartitionData: should never have extras. node:${nodeShardData.node.id.substring(0, 5)} ${Utils.safeStringify({
                        list1,
                        list2,
                        extraLists,
                    })}`;
                }
                catch (ex) {
                    this.fatalLogger.fatal('computeExtendedNodePartitionData: ' + ex.name + ': ' + ex.message + ' at ' + ex.stack);
                }
                if (ShardFunctions.fatalLogger) {
                    ShardFunctions.fatalLogger.fatal(message);
                }
            }
            nodeShardData.edgeNodes.sort(ShardFunctions.nodeSortAsc);
            nodeShardData.consensusNodeForOurNodeFull.sort(ShardFunctions.nodeSortAsc);
            nodeShardData.nodeThatStoreOurParitionFull.sort(ShardFunctions.nodeSortAsc);
        }
        else {
            nodeShardData.consensusNodeForOurNode = [];
            nodeShardData.consensusNodeForOurNodeFull = [];
            nodeShardData.c2NodeForOurNode = [];
            nodeShardData.nodeThatStoreOurParitionFull = nodeShardData.nodeThatStoreOurParition.slice(0);
            nodeShardData.outOfDefaultRangeNodes = [];
            nodeShardData.edgeNodes = nodeShardData.nodeThatStoreOurParitionFull.slice(0);
            nodeShardData.edgeNodes = ShardFunctions.subtractNodeLists(nodeShardData.edgeNodes, excludeNodeArray);
            nodeShardData.edgeNodes.sort(ShardFunctions.nodeSortAsc);
            nodeShardData.consensusNodeForOurNodeFull.sort(ShardFunctions.nodeSortAsc);
            nodeShardData.nodeThatStoreOurParitionFull.sort(ShardFunctions.nodeSortAsc);
        }
        if (nodeShardData.storedPartitions.rangeIsSplit === false) {
            for (let i = nodeShardData.storedPartitions.partitionStart; i <= nodeShardData.storedPartitions.partitionEnd; i++) {
                const shardPartitionData = partitionShardDataMap.get(i);
                if (shardPartitionData == null) {
                    throw new Error('computeExtendedNodePartitionData: shardPartitionData==null 4');
                }
                shardPartitionData.storedBy[nodeShardData.node.id] = nodeShardData.node;
            }
        }
        else {
            for (let i = 0; i <= nodeShardData.storedPartitions.partitionEnd; i++) {
                const shardPartitionData = partitionShardDataMap.get(i);
                if (shardPartitionData == null) {
                    throw new Error('computeExtendedNodePartitionData: shardPartitionData==null 5');
                }
                shardPartitionData.storedBy[nodeShardData.node.id] = nodeShardData.node;
            }
            for (let i = nodeShardData.storedPartitions.partitionStart; i < shardGlobals.numPartitions; i++) {
                const shardPartitionData = partitionShardDataMap.get(i);
                if (shardPartitionData == null) {
                    throw new Error('computeExtendedNodePartitionData: shardPartitionData==null 6');
                }
                shardPartitionData.storedBy[nodeShardData.node.id] = nodeShardData.node;
            }
        }
    }
    static nodeSortAsc(a: Shardus.Node, b: Shardus.Node): Ordering {
        return a.id === b.id ? 0 : a.id < b.id ? -1 : 1;
    }
    static getConsenusPartitionList(shardGlobals: ShardGlobals, nodeShardData: NodeShardData): number[] {
        const consensusPartitions = [] as number[];
        if (nodeShardData.consensusStartPartition <= nodeShardData.consensusEndPartition) {
            for (let i = nodeShardData.consensusStartPartition; i <= nodeShardData.consensusEndPartition; i++) {
                consensusPartitions.push(i);
            }
        }
        else {
            for (let i = 0; i <= nodeShardData.consensusEndPartition; i++) {
                consensusPartitions.push(i);
            }
            for (let i = nodeShardData.consensusStartPartition; i < shardGlobals.numPartitions; i++) {
                consensusPartitions.push(i);
            }
        }
        return consensusPartitions;
    }
    static getStoredPartitionList(shardGlobals: ShardGlobals, nodeShardData: NodeShardData): number[] {
        const storedPartitionList = [] as number[];
        if (nodeShardData.storedPartitions.partitionStart <= nodeShardData.storedPartitions.partitionEnd) {
            for (let i = nodeShardData.storedPartitions.partitionStart; i <= nodeShardData.storedPartitions.partitionEnd; i++) {
                storedPartitionList.push(i);
            }
        }
        else {
            for (let i = 0; i <= nodeShardData.storedPartitions.partitionEnd; i++) {
                storedPartitionList.push(i);
            }
            for (let i = nodeShardData.storedPartitions.partitionStart; i < shardGlobals.numPartitions; i++) {
                storedPartitionList.push(i);
            }
        }
        return storedPartitionList;
    }
    static setOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
        return !(bStart >= aEnd || bEnd <= aStart);
    }
    static setEpanded(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
        return bStart < aStart || bEnd > aEnd;
    }
    static setEpandedLeft(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
        return bStart < aStart;
    }
    static setEpandedRight(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
        return bEnd > aEnd;
    }
    static setShrink(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
        return (bStart > aStart && bStart < aEnd) || (bEnd > aStart && bEnd < aEnd);
    }
    static computeCoverageChanges(oldShardDataNodeShardData: NodeShardData, newSharddataNodeShardData: NodeShardData): {
        start: number;
        end: number;
    }[] {
        const coverageChanges = [] as {
            start: number;
            end: number;
        }[];
        const oldStoredPartitions = oldShardDataNodeShardData.storedPartitions;
        const newStoredPartitions = newSharddataNodeShardData.storedPartitions;
        if (oldStoredPartitions.rangeIsSplit) {
            if (newStoredPartitions.rangeIsSplit) {
                const oldStart1 = oldStoredPartitions.partitionRange.startAddr;
                const oldEnd1 = oldStoredPartitions.partitionRange.endAddr;
                const newStart1 = newStoredPartitions.partitionRange.startAddr;
                const newEnd1 = newStoredPartitions.partitionRange.endAddr;
                const oldStart2 = oldStoredPartitions.partitionRange2.startAddr;
                const oldEnd2 = oldStoredPartitions.partitionRange2.endAddr;
                const newStart2 = newStoredPartitions.partitionRange2.startAddr;
                const newEnd2 = newStoredPartitions.partitionRange2.endAddr;
                if (oldStart1 >= oldEnd1 || oldStart2 >= oldEnd2 || newStart1 >= newEnd1 || newStart2 >= newEnd2) {
                    throw new Error('invalid ranges');
                }
                if (ShardFunctions.setOverlap(oldStart1, oldEnd1, newStart1, newEnd1)) {
                    if (ShardFunctions.setEpandedLeft(oldStart1, oldEnd1, newStart1, newEnd1)) {
                        coverageChanges.push({ start: newStart1, end: oldStart1 });
                    }
                    if (ShardFunctions.setEpandedRight(oldStart1, oldEnd1, newStart1, newEnd1)) {
                        coverageChanges.push({ start: oldEnd1, end: newEnd1 });
                    }
                }
                if (ShardFunctions.setOverlap(oldStart2, oldEnd2, newStart2, newEnd2)) {
                    if (ShardFunctions.setEpandedLeft(oldStart2, oldEnd2, newStart2, newEnd2)) {
                        coverageChanges.push({ start: newStart2, end: oldStart2 });
                    }
                    if (ShardFunctions.setEpandedRight(oldStart2, oldEnd2, newStart2, newEnd2)) {
                        coverageChanges.push({ start: oldEnd2, end: newEnd2 });
                    }
                }
            }
            else {
                const oldStart1 = oldStoredPartitions.partitionRange.startAddr;
                const oldEnd1 = oldStoredPartitions.partitionRange.endAddr;
                const oldStart2 = oldStoredPartitions.partitionRange2.startAddr;
                const oldEnd2 = oldStoredPartitions.partitionRange2.endAddr;
                const newStart1 = newStoredPartitions.partitionRange.startAddr;
                const newEnd1 = newStoredPartitions.partitionRange.endAddr;
                if (oldStart1 >= oldEnd1 || oldStart2 >= oldEnd2 || newStart1 >= newEnd1) {
                    throw new Error('invalid ranges');
                }
                if (ShardFunctions.setOverlap(oldStart1, oldEnd1, newStart1, newEnd1)) {
                    if (ShardFunctions.setEpandedLeft(oldStart1, oldEnd1, newStart1, newEnd1)) {
                        coverageChanges.push({ start: newStart1, end: oldStart1 });
                    }
                    if (ShardFunctions.setEpandedRight(oldStart1, oldEnd1, newStart1, newEnd1)) {
                        coverageChanges.push({ start: oldEnd1, end: newEnd1 });
                    }
                }
                else if (ShardFunctions.setOverlap(oldStart2, oldEnd2, newStart1, newEnd1)) {
                    if (ShardFunctions.setEpandedLeft(oldStart2, oldEnd2, newStart1, newEnd1)) {
                        coverageChanges.push({ start: newStart1, end: oldStart2 });
                    }
                    if (ShardFunctions.setEpandedRight(oldStart2, oldEnd2, newStart1, newEnd1)) {
                        coverageChanges.push({ start: oldEnd2, end: newEnd1 });
                    }
                }
            }
        }
        else {
            if (newStoredPartitions.rangeIsSplit) {
                const oldStart1 = oldStoredPartitions.partitionRange.startAddr;
                const oldEnd1 = oldStoredPartitions.partitionRange.endAddr;
                const newStart1 = newStoredPartitions.partitionRange.startAddr;
                const newEnd1 = newStoredPartitions.partitionRange.endAddr;
                const newStart2 = newStoredPartitions.partitionRange2.startAddr;
                const newEnd2 = newStoredPartitions.partitionRange2.endAddr;
                if (oldStart1 >= oldEnd1 || newStart1 >= newEnd1 || newStart2 >= newEnd2) {
                    throw new Error('invalid ranges');
                }
                if (ShardFunctions.setOverlap(oldStart1, oldEnd1, newStart1, newEnd1)) {
                    if (ShardFunctions.setEpandedLeft(oldStart1, oldEnd1, newStart1, newEnd1)) {
                        coverageChanges.push({ start: newStart1, end: oldStart1 });
                    }
                    if (ShardFunctions.setEpandedRight(oldStart1, oldEnd1, newStart1, newEnd1)) {
                        coverageChanges.push({ start: oldEnd1, end: newEnd1 });
                    }
                }
                if (ShardFunctions.setOverlap(oldStart1, oldEnd1, newStart2, newEnd2)) {
                    if (ShardFunctions.setEpandedLeft(oldStart1, oldEnd1, newStart2, newEnd2)) {
                        coverageChanges.push({ start: newStart2, end: oldStart1 });
                    }
                    if (ShardFunctions.setEpandedRight(oldStart1, oldEnd1, newStart2, newEnd2)) {
                        coverageChanges.push({ start: oldEnd1, end: newEnd2 });
                    }
                }
            }
            else {
                const oldStart1 = oldStoredPartitions.partitionRange.startAddr;
                const oldEnd1 = oldStoredPartitions.partitionRange.endAddr;
                const newStart1 = newStoredPartitions.partitionRange.startAddr;
                const newEnd1 = newStoredPartitions.partitionRange.endAddr;
                if (oldStart1 >= oldEnd1 || newStart1 >= newEnd1) {
                    throw new Error('invalid ranges');
                }
                if (ShardFunctions.setOverlap(oldStart1, oldEnd1, newStart1, newEnd1)) {
                    if (ShardFunctions.setEpandedLeft(oldStart1, oldEnd1, newStart1, newEnd1)) {
                        coverageChanges.push({ start: newStart1, end: oldStart1 });
                    }
                    if (ShardFunctions.setEpandedRight(oldStart1, oldEnd1, newStart1, newEnd1)) {
                        coverageChanges.push({ start: oldEnd1, end: newEnd1 });
                    }
                }
            }
        }
        if (coverageChanges.length === 0) {
            return coverageChanges;
        }
        const oldStart1 = oldStoredPartitions.partitionRange.startAddr;
        const oldEnd1 = oldStoredPartitions.partitionRange.endAddr;
        const oldStart2 = oldStoredPartitions.partitionRange2?.startAddr;
        const oldEnd2 = oldStoredPartitions.partitionRange2?.endAddr;
        const finalChanges = [];
        for (const coverageChange of coverageChanges) {
            if (ShardFunctions.setOverlap(oldStart1, oldEnd1, coverageChange.start, coverageChange.end)) {
                if (oldStart1 <= coverageChange.start) {
                    coverageChange.start = oldEnd1;
                }
                if (oldEnd1 >= coverageChange.end) {
                    coverageChange.end = oldStart1;
                }
                if (coverageChange.start >= coverageChange.end) {
                    continue;
                }
            }
            if (oldStoredPartitions.rangeIsSplit) {
                if (ShardFunctions.setOverlap(oldStart2, oldEnd2, coverageChange.start, coverageChange.end)) {
                    if (oldStart2 <= coverageChange.start) {
                        coverageChange.start = oldEnd2;
                    }
                    if (oldEnd2 >= coverageChange.end) {
                        coverageChange.end = oldStart2;
                    }
                    if (coverageChange.start >= coverageChange.end) {
                        continue;
                    }
                }
            }
            finalChanges.push(coverageChange);
        }
        return finalChanges;
    }
    static getHomeNodeSummaryObject(nodeShardData: NodeShardData): HomeNodeSummary {
        if (nodeShardData.extendedData === false) {
            return { noExtendedData: true, edge: [], consensus: [], storedFull: [] } as HomeNodeSummary;
        }
        const result = { edge: [], consensus: [], storedFull: [] } as HomeNodeSummary;
        for (const node of nodeShardData.edgeNodes) {
            result.edge.push(node.id);
        }
        for (const node of nodeShardData.consensusNodeForOurNodeFull) {
            result.consensus.push(node.id);
        }
        for (const node of nodeShardData.nodeThatStoreOurParitionFull) {
            result.storedFull.push(node.id);
        }
        result.edge.sort((a, b) => {
            return a === b ? 0 : a < b ? -1 : 1;
        });
        result.consensus.sort((a, b) => {
            return a === b ? 0 : a < b ? -1 : 1;
        });
        result.storedFull.sort((a, b) => {
            return a === b ? 0 : a < b ? -1 : 1;
        });
        return result;
    }
    static getNodeRelation(nodeShardData: NodeShardData, nodeId: string): string {
        if (nodeShardData.extendedData === false) {
            return 'failed, no extended data';
        }
        let result = '';
        if (nodeShardData.node.id === nodeId) {
            result = 'home, ';
        }
        for (const node of nodeShardData.nodeThatStoreOurParitionFull) {
            if (node.id === nodeId) {
                result += 'stored,';
            }
        }
        for (const node of nodeShardData.edgeNodes) {
            if (node.id === nodeId) {
                result += 'edge,';
            }
        }
        for (const node of nodeShardData.consensusNodeForOurNodeFull) {
            if (node.id === nodeId) {
                result += 'consensus,';
            }
        }
        return result;
    }
    static getPartitionRangeFromRadix(shardGlobals: ShardGlobals, radix: string): {
        low: number;
        high: number;
    } {
        const filledAddress = radix + '0'.repeat(64 - radix.length);
        const partition = ShardFunctions.addressToPartition(shardGlobals, filledAddress);
        const filledAddress2 = radix + 'f'.repeat(64 - radix.length);
        const partition2 = ShardFunctions.addressToPartition(shardGlobals, filledAddress2);
        return { low: partition.homePartition, high: partition2.homePartition };
    }
    static addressToPartition(shardGlobals: ShardGlobals, address: string): {
        homePartition: number;
        addressNum: number;
    } {
        const numPartitions = shardGlobals.numPartitions;
        const addressNum = parseInt(address.slice(0, 8), 16);
        const size = Math.round((0xffffffff + 1) / numPartitions);
        let homePartition = Math.floor(addressNum / size);
        if (homePartition === numPartitions) {
            homePartition = homePartition - 1;
        }
        return { homePartition, addressNum };
    }
    static addressNumberToPartition(shardGlobals: ShardGlobals, addressNum: number): number {
        const numPartitions = shardGlobals.numPartitions;
        const size = Math.round((0xffffffff + 1) / numPartitions);
        let homePartition = Math.floor(addressNum / size);
        if (homePartition === numPartitions) {
            homePartition = homePartition - 1;
        }
        return homePartition;
    }
    static findHomeNode(shardGlobals: ShardGlobals, address: string, partitionShardDataMap: Map<number, ShardInfo>): NodeShardData | null {
        const { homePartition } = ShardFunctions.addressToPartition(shardGlobals, address);
        const partitionShard = partitionShardDataMap.get(homePartition);
        if (partitionShard == null) {
            return null;
        }
        if (partitionShard.homeNodes.length === 0) {
            return null;
        }
        return partitionShard.homeNodes[0];
    }
    static circularDistance(a: number, b: number, max: number): number {
        const directDist = Math.abs(a - b);
        let wrapDist = directDist;
        const wrapDist1 = Math.abs(a + (max - b));
        const wrapDist2 = Math.abs(b + (max - a));
        wrapDist = Math.min(wrapDist1, wrapDist2);
        return Math.min(directDist, wrapDist);
    }
    static mergeNodeLists(listA: Shardus.Node[], listB: Shardus.Node[]): Shardus.Node[][] {
        const results = [] as Shardus.Node[];
        const extras = [] as Shardus.Node[];
        const nodeSet = new Set();
        for (const node of listA) {
            nodeSet.add(node);
            results.push(node);
        }
        for (const node of listB) {
            if (!nodeSet.has(node)) {
                results.push(node);
                extras.push(node);
            }
        }
        return [results, extras];
    }
    static subtractNodeLists(listA: Shardus.Node[], listB: Shardus.Node[]): Shardus.Node[] {
        const results = [] as Shardus.Node[];
        const nodeSet = new Set();
        for (const node of listB) {
            nodeSet.add(node);
        }
        for (const node of listA) {
            if (!nodeSet.has(node)) {
                results.push(node);
            }
        }
        return results;
    }
    static partitionToAddressRange2(shardGlobals: ShardGlobals, partition: number, partitionMax?: number): AddressRange {
        const result = {} as AddressRange;
        result.partition = partition;
        const size = Math.round((0xffffffff + 1) / shardGlobals.numPartitions);
        const startAddr = partition * size;
        result.p_low = partition;
        let endPartition = partition + 1;
        if (partitionMax) {
            result.p_high = partitionMax;
            endPartition = partitionMax + 1;
        }
        else {
        }
        result.partitionEnd = endPartition;
        let endAddr = endPartition * size;
        const roundingErrorSupport = shardGlobals.numPartitions;
        if (endAddr >= 4294967295 - roundingErrorSupport) {
            endAddr = 4294967295;
        }
        else {
            endAddr = endAddr - 1;
        }
        if (endPartition === shardGlobals.numPartitions) {
            endPartition = shardGlobals.numPartitions - 1;
            result.partitionEnd = endPartition;
        }
        result.startAddr = startAddr;
        result.endAddr = endAddr;
        result.low = ('00000000' + startAddr.toString(16)).slice(-8) + '0'.repeat(56);
        result.high = ('00000000' + endAddr.toString(16)).slice(-8) + 'f'.repeat(56);
        return result;
    }
    static getNodesThatCoverPartitionRaw(shardGlobals: ShardGlobals, nodeShardDataMap: Map<string, NodeShardData>, partition: number, exclude: string[], activeNodes: Shardus.Node[]): Shardus.Node[] {
        const results = [] as Shardus.Node[];
        for (let i = 0; i < activeNodes.length; i++) {
            const node = activeNodes[i];
            if (exclude.includes(node.id)) {
                continue;
            }
            const nodeShardData = nodeShardDataMap.get(node.id);
            if (nodeShardData == null) {
                continue;
            }
            if (nodeShardData.storedPartitions == null) {
                nodeShardData.storedPartitions = ShardFunctions.calculateStoredPartitions2(shardGlobals, nodeShardData.homePartition);
            }
            if (ShardFunctions.testInRange(partition, nodeShardData.storedPartitions) !== true) {
                continue;
            }
            results.push(node);
        }
        return results;
    }
    static getCombinedNodeLists(shardGlobals: ShardGlobals, thisNode: NodeShardData, nodeShardDataMap: NodeShardDataMap, activeNodes: Shardus.Node[]): Record<string, P2P.NodeListTypes.Node[]> {
        const consensusNodeForOurNode = [] as Shardus.Node[];
        const consensusNodeForOurNodeFull = [] as Shardus.Node[];
        const nodeThatStoreOurPartition = [] as Shardus.Node[];
        const nodeThatStoreOurPartitionFull = [] as Shardus.Node[];
        const edgeNodes = [] as Shardus.Node[];
        const homePartition = thisNode.homePartition;
        let partition = this.modulo(homePartition - (shardGlobals.consensusRadius + shardGlobals.nodesPerEdge), shardGlobals.numPartitions) - 1;
        let maxScanNeeded = 2 * shardGlobals.consensusRadius + 2 * shardGlobals.nodesPerEdge + 1;
        if (maxScanNeeded > activeNodes.length)
            maxScanNeeded = activeNodes.length;
        for (let i = 0; i < maxScanNeeded; i++) {
            let isInConsensusRange = false;
            let isInPartitionRange = false;
            partition = this.modulo(partition + 1, shardGlobals.numPartitions);
            if (partition >= activeNodes.length) {
                partition = 0;
            }
            const node = activeNodes[partition];
            if (node == thisNode.node) {
                nodeThatStoreOurPartitionFull.push(node);
                consensusNodeForOurNodeFull.push(node);
                continue;
            }
            if (ShardFunctions.testInRange(partition, thisNode.storedPartitions)) {
                nodeThatStoreOurPartition.push(node);
                nodeThatStoreOurPartitionFull.push(node);
                isInPartitionRange = true;
            }
            if (ShardFunctions.testInRange(partition, thisNode.consensusPartitions)) {
                consensusNodeForOurNode.push(node);
                consensusNodeForOurNodeFull.push(node);
                isInConsensusRange = true;
            }
            if (isInPartitionRange && !isInConsensusRange) {
                edgeNodes.push(node);
            }
        }
        return {
            nodeThatStoreOurPartition,
            nodeThatStoreOurPartitionFull,
            consensusNodeForOurNode,
            consensusNodeForOurNodeFull,
            edgeNodes,
        };
    }
    static getNodesThatCoverHomePartition(shardGlobals: ShardGlobals, thisNode: NodeShardData, nodeShardDataMap: Map<string, NodeShardData>, activeNodes: Shardus.Node[]): Shardus.Node[] {
        const results = [] as Shardus.Node[];
        const homePartition = thisNode.homePartition;
        const searchRight = true;
        let index = homePartition;
        const startIndex = index;
        let once = false;
        while (searchRight) {
            if (index >= activeNodes.length) {
                index = 0;
            }
            if (startIndex === index && once) {
                return results;
            }
            once = true;
            const node = activeNodes[index];
            index++;
            if (node == thisNode.node)
                continue;
            const nodeShardData = nodeShardDataMap.get(node.id);
            if (nodeShardData == null) {
                continue;
            }
            if (nodeShardData.storedPartitions == null) {
                nodeShardData.storedPartitions = ShardFunctions.calculateStoredPartitions2(shardGlobals, nodeShardData.homePartition);
            }
            if (ShardFunctions.testInRange(homePartition, nodeShardData.storedPartitions) !== true) {
                break;
            }
            results.push(node);
        }
        const searchLeft = true;
        index = homePartition;
        while (searchLeft) {
            if (index < 0) {
                index = activeNodes.length - 1;
            }
            const node = activeNodes[index];
            index--;
            if (node == thisNode.node)
                continue;
            const nodeShardData = nodeShardDataMap.get(node.id);
            if (nodeShardData == null) {
                continue;
            }
            if (nodeShardData.storedPartitions == null) {
                nodeShardData.storedPartitions = ShardFunctions.calculateStoredPartitions2(shardGlobals, nodeShardData.homePartition);
            }
            if (ShardFunctions.testInRange(homePartition, nodeShardData.storedPartitions) !== true) {
                break;
            }
            results.push(node);
        }
        return results;
    }
    static getEdgeNodes(shardGlobals: ShardGlobals, thisNode: NodeShardData, nodeShardDataMap: Map<string, NodeShardData>, activeNodes: Shardus.Node[]): Shardus.Node[] {
        const results = [];
        const homePartition = thisNode.homePartition;
        let rightIndex = homePartition - shardGlobals.consensusRadius;
        const startIndex = rightIndex;
        let once = false;
        let edgeRadius = shardGlobals.nodesPerConsenusGroup - shardGlobals.consensusRadius;
        if (activeNodes.length <= shardGlobals.nodesPerConsenusGroup)
            return [];
        if (edgeRadius > activeNodes.length) {
            edgeRadius = activeNodes.length;
        }
        for (let i = 0; i < edgeRadius; i++) {
            rightIndex -= 1;
            if (rightIndex < 0) {
                if (activeNodes.length + rightIndex < 0) {
                    rightIndex = 0;
                }
                else {
                    rightIndex = activeNodes.length + rightIndex;
                }
            }
            if (this.testInRange(rightIndex, thisNode.consensusPartitions)) {
                break;
            }
            if (startIndex === homePartition && once) {
                return Object.values(results);
            }
            once = true;
            const node = activeNodes[rightIndex];
            if (!node) {
                throw new Error(`Unable to get node for right index ${rightIndex}`);
            }
            if (node == thisNode.node)
                continue;
            results.push(node);
        }
        let leftIndex = homePartition + shardGlobals.consensusRadius;
        for (let i = 0; i < edgeRadius; i++) {
            leftIndex += 1;
            if (leftIndex >= activeNodes.length) {
                if (leftIndex - activeNodes.length >= activeNodes.length) {
                    leftIndex = activeNodes.length - 1;
                }
                else {
                    leftIndex = leftIndex - activeNodes.length;
                }
            }
            if (this.testInRange(leftIndex, thisNode.consensusPartitions)) {
                break;
            }
            if (startIndex === leftIndex && once) {
                return Object.values(results);
            }
            once = true;
            const node = activeNodes[leftIndex];
            if (!node) {
                throw new Error(`Unable to get node for left leftIndex ${leftIndex}`);
            }
            if (node == thisNode.node)
                continue;
            results.push(node);
        }
        return results;
    }
    static getNeigborNodesInRange(position: number, radius: number, exclude: string[], allNodes: P2P.NodeListTypes.Node[]): Shardus.Node[] {
        const results = [] as Shardus.Node[];
        let scanStart = position - radius;
        if (scanStart < 0) {
            scanStart = allNodes.length + scanStart;
            if (scanStart < 0) {
                scanStart = 0;
            }
        }
        const scanAmount = radius * 2 + 1;
        let scanCount = 0;
        const expectedNodes = Math.min(allNodes.length - exclude.length, scanAmount - exclude.length);
        if (scanAmount >= allNodes.length) {
            for (let i = 0; i < allNodes.length; i++) {
                const node = allNodes[i];
                if (exclude.includes(node.id)) {
                    continue;
                }
                if (node.status === 'active') {
                    results.push(node);
                }
            }
            return results;
        }
        let scanIndex = scanStart;
        for (let i = 0; i < scanAmount; i++) {
            scanCount++;
            if (scanCount >= allNodes.length) {
                break;
            }
            if (scanIndex >= allNodes.length) {
                scanIndex = 0;
            }
            const node = allNodes[scanIndex];
            if (exclude.includes(node.id)) {
                scanIndex++;
                continue;
            }
            if (node.status === 'active') {
                results.push(node);
            }
            scanIndex++;
            if (scanIndex === scanStart) {
                break;
            }
            if (results.length >= expectedNodes) {
                break;
            }
        }
        return results;
    }
    static getNodesByProximity(shardGlobals: ShardGlobals, activeNodes: Shardus.Node[], position: number, excludeID: string, count = 10, centeredScan = false): Shardus.Node[] {
        const allNodes = activeNodes;
        const results = [] as Shardus.Node[];
        let leftScanIndex = position;
        let rightScanIndex = position - 1;
        let maxIterations = Math.ceil(count / 2);
        if (centeredScan) {
            maxIterations++;
        }
        for (let i = 0; i < maxIterations; i++) {
            leftScanIndex--;
            rightScanIndex++;
            if (rightScanIndex >= allNodes.length) {
                rightScanIndex = 0;
            }
            if (leftScanIndex < 0) {
                leftScanIndex = allNodes.length - 1;
            }
            let node = allNodes[rightScanIndex];
            if (node != null && node.id !== excludeID) {
                if (node.status === 'active') {
                    results.push(node);
                    if (results.length === count) {
                        return results;
                    }
                }
            }
            if (centeredScan && i === maxIterations - 1) {
                break;
            }
            node = allNodes[leftScanIndex];
            if (node != null && node.id !== excludeID) {
                if (node.status === 'active') {
                    results.push(node);
                    if (results.length === count) {
                        return results;
                    }
                }
            }
            if (rightScanIndex === leftScanIndex) {
                break;
            }
            if ((rightScanIndex - leftScanIndex) * (rightScanIndex - leftScanIndex) === 1) {
                if (i > 0 || maxIterations <= 1) {
                    break;
                }
            }
        }
        return results;
    }
    static findCenterAddressPair(lowAddress: string, highAddress: string): string[] {
        const leftAddressNum = parseInt(lowAddress.slice(0, 8), 16);
        const nodeAddressNum = parseInt(highAddress.slice(0, 8), 16);
        const centerNum = Math.round((leftAddressNum + nodeAddressNum) * 0.5);
        const addressPrefixHex = ShardFunctions.leadZeros8(centerNum.toString(16));
        const addressPrefixHex2 = ShardFunctions.leadZeros8((centerNum + 1).toString(16));
        const centerAddr = addressPrefixHex + 'f'.repeat(56);
        const centerAddrPlusOne = addressPrefixHex2 + '0'.repeat(56);
        return [centerAddr, centerAddrPlusOne];
    }
    static getNextAdjacentAddresses(address: string): {
        address1: string;
        address2: string;
    } {
        const addressNum = parseInt(address.slice(0, 8), 16);
        const addressPrefixHex = ShardFunctions.leadZeros8(addressNum.toString(16));
        const addressPrefixHex2 = ShardFunctions.leadZeros8((addressNum + 1).toString(16));
        const address1 = addressPrefixHex + 'f'.repeat(56);
        const address2 = addressPrefixHex2 + '0'.repeat(56);
        return { address1, address2 };
    }
    static getCenterHomeNode(shardGlobals: ShardGlobals, partitionShardDataMap: PartitionShardDataMap, lowAddress: string, highAddress: string): NodeShardData | null {
        const [centerAddr] = ShardFunctions.findCenterAddressPair(lowAddress, highAddress);
        return ShardFunctions.findHomeNode(shardGlobals, centerAddr, partitionShardDataMap);
    }
    static debugFastStableCorrespondingIndicies(fromListSize: number, toListSize: number, fromListIndex: number): number[] {
        let results = [] as number[];
        try {
            results = ShardFunctions.fastStableCorrespondingIndicies(fromListSize, toListSize, fromListIndex);
        }
        catch (ex) {
            throw new Error(`stack overflow fastStableCorrespondingIndicies( ${fromListSize},  ${toListSize}, ${fromListIndex} )`);
        }
        return results;
    }
    static fastStableCorrespondingIndicies(fromListSize: number, toListSize: number, fromListIndex: number): number[] {
        const results = [] as number[];
        if (fromListSize >= toListSize) {
            let value = Math.round((fromListIndex / fromListSize) * toListSize);
            if (value === 0) {
                value = 1;
            }
            results.push(value);
        }
        else {
            const targetIndex = Math.round(fromListIndex * (toListSize / fromListSize));
            const range = Math.round(toListSize / fromListSize);
            const start = Math.max(1, targetIndex - range);
            const stop = Math.min(toListSize, targetIndex + range);
            for (let i = start; i <= stop; i++) {
                const res = ShardFunctions.fastStableCorrespondingIndicies(toListSize, fromListSize, i);
                if (res[0] === fromListIndex) {
                    results.push(i);
                }
            }
        }
        return results;
    }
    static partitionInWrappingRange(i: number, minP: number, maxP: number): boolean {
        const key = i;
        if (minP === maxP) {
            if (i !== minP) {
                return false;
            }
        }
        else if (maxP > minP) {
            if (key < minP || key > maxP) {
                return false;
            }
        }
        else {
            if (key > maxP && key < minP) {
                return false;
            }
        }
        return true;
    }
    private static modulo(number: number, base: number): number {
        return ((number % base) + base) % base;
    }
}
export default ShardFunctions;
export function addressToPartition(shardGlobals: ShardGlobals, address: string): {
    homePartition: number;
    addressNum: number;
} {
    return ShardFunctions.addressToPartition(shardGlobals, address);
}
export function partitionInWrappingRange(i: number, minP: number, maxP: number): boolean {
    return ShardFunctions.partitionInWrappingRange(i, minP, maxP);
}
export function findHomeNode(shardGlobals: ShardGlobals, address: string, partitionShardDataMap: Map<number, ShardInfo>): NodeShardData | null {
    return ShardFunctions.findHomeNode(shardGlobals, address, partitionShardDataMap);
}