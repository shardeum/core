import * as Shardus from '../shardus/shardus-types';
import * as utils from '../utils';
import { nestedCountersInstance } from '../utils/nestedCounters';
import { logFlags } from '../logger';
import ShardFunctions from './shardFunctions';
import StateManager from '.';
import { potentiallyRemoved } from '../p2p/NodeList';
export default class DataSourceHelper {
    stateManager: StateManager;
    dataSourceNode: Shardus.Node;
    dataSourceNodeList: Shardus.Node[];
    dataSourceNodeIndex: number;
    constructor(stateManager: StateManager) {
        this.stateManager = stateManager;
    }
    initWithList(listOfNdoes: Shardus.Node[]): void {
        this.dataSourceNodeIndex = 0;
        this.dataSourceNode = listOfNdoes[this.dataSourceNodeIndex];
        this.dataSourceNodeList = [...listOfNdoes];
    }
    initByRange(lowAddress: string, highAddress: string): void {
        this.dataSourceNodeIndex = 0;
        this.dataSourceNodeList = [];
        if (this.stateManager.currentCycleShardData == null) {
            if (logFlags.error)
                this.stateManager.mainLogger.error(`getDataSourceNode: initByRange currentCycleShardData == null`);
            return;
        }
        const queryLow = lowAddress;
        const queryHigh = highAddress;
        const centerNode = ShardFunctions.getCenterHomeNode(this.stateManager.currentCycleShardData.shardGlobals, this.stateManager.currentCycleShardData.parititionShardDataMap, lowAddress, highAddress);
        if (centerNode == null) {
            if (logFlags.error)
                this.stateManager.mainLogger.error(`getDataSourceNode: centerNode not found`);
            return;
        }
        let nodes: Shardus.Node[] = ShardFunctions.getNodesByProximity(this.stateManager.currentCycleShardData.shardGlobals, this.stateManager.currentCycleShardData.nodes, centerNode.ourNodeIndex, this.stateManager.p2p.id, 40);
        const nodesInProximity = nodes.length;
        nodes = nodes.filter(this.removePotentiallyRemovedNodes);
        const filteredNodes1 = nodes.length;
        const filteredNodes = [];
        for (const node of nodes) {
            const nodeShardData = this.stateManager.currentCycleShardData.nodeShardDataMap.get(node.id);
            if (nodeShardData != null) {
                if (ShardFunctions.testAddressInRange(queryLow, nodeShardData.consensusPartitions) === false) {
                    if (logFlags.error)
                        this.stateManager.mainLogger.error(`node cant fit range: queryLow:${queryLow}  ${utils.stringifyReduce(nodeShardData.consensusPartitions)}  `);
                    continue;
                }
                if (ShardFunctions.testAddressInRange(queryHigh, nodeShardData.consensusPartitions) === false) {
                    if (logFlags.error)
                        this.stateManager.mainLogger.error(`node cant fit range: queryHigh:${queryHigh}  ${utils.stringifyReduce(nodeShardData.consensusPartitions)}  `);
                    continue;
                }
                filteredNodes.push(node);
            }
        }
        nodes = filteredNodes;
        const filteredNodes2 = nodes.length;
        if (nodes.length > 0) {
            this.dataSourceNodeList = nodes;
            this.dataSourceNode = nodes[Math.floor(Math.random() * nodes.length)];
            if (logFlags.error)
                this.stateManager.mainLogger.error(`data source nodes found: ${nodes.length}  nodesInProximity:${nodesInProximity} filteredNodes1:${filteredNodes1} filteredNodes2:${filteredNodes2} `);
        }
        else {
            if (logFlags.error)
                this.stateManager.mainLogger.error(`no data source nodes found nodesInProximity:${nodesInProximity} filteredNodes1:${filteredNodes1} filteredNodes2:${filteredNodes2} `);
        }
    }
    tryNextDataSourceNode(debugString: string): boolean {
        this.dataSourceNodeIndex++;
        if (logFlags.error)
            this.stateManager.mainLogger.error(`tryNextDataSourceNode ${debugString} try next node: ${this.dataSourceNodeIndex}`);
        if (this.dataSourceNodeIndex >= this.dataSourceNodeList.length) {
            if (logFlags.error)
                this.stateManager.mainLogger.error(`tryNextDataSourceNode ${debugString} ran out of nodes ask for data`);
            this.dataSourceNodeIndex = 0;
            return false;
        }
        this.dataSourceNode = this.dataSourceNodeList[this.dataSourceNodeIndex];
        if (this.dataSourceNode == null) {
            return false;
        }
        if (logFlags.error)
            this.stateManager.mainLogger.error(`tryNextDataSourceNode ${debugString} found: ${this.dataSourceNode.externalIp} ${this.dataSourceNode.externalPort} `);
        return true;
    }
    tryRestartList(debugString: string): boolean {
        this.dataSourceNodeIndex = 0;
        const numNodes = this.dataSourceNodeList.length;
        if (numNodes > 3) {
            return false;
        }
        if (numNodes > 0) {
            this.dataSourceNode = this.dataSourceNodeList[this.dataSourceNodeIndex];
            return true;
        }
        return false;
    }
    getNumNodes(): number {
        return this.dataSourceNodeList.length;
    }
    removePotentiallyRemovedNodes(node: Shardus.Node): boolean {
        return potentiallyRemoved.has(node.id) != true;
    }
}