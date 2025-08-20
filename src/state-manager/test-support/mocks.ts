/**
 * Minimal mock infrastructure for FACT protocol testing
 * No third-party libraries, minimal disruption to production code
 */

import ShardFunctions from '../shardFunctions'
import { getLogger } from './testLogger'

/**
 * Minimal P2P mock that captures tellBinary calls
 */
export class MockP2P {
  private messageCollector: MessageCollector
  
  constructor(messageCollector: MessageCollector) {
    this.messageCollector = messageCollector
  }
  
  tellBinary<T>(
    nodes: any[],
    route: string,
    data: T,
    serializeFunc?: any,
    extraData?: any
  ): void {
    const logger = getLogger()
    logger.detail(`MockP2P.tellBinary called:`)
    logger.detail(`  - Route: ${route}`)
    logger.detail(`  - Nodes count: ${nodes.length}`)
    logger.detail(`  - Node IDs: ${nodes.map(n => n.id).join(', ')}`)
    
    // Capture the message
    this.messageCollector.collectMessage({
      nodes,
      route,
      data,
      serializeFunc,
      extraData,
      timestamp: Date.now()
    })
  }
  
  tell(nodes: any[], route: string, data: any): void {
    const logger = getLogger()
    logger.detail(`MockP2P.tell called:`)
    logger.detail(`  - Route: ${route}`)
    logger.detail(`  - Nodes count: ${nodes.length}`)
    
    this.messageCollector.collectMessage({
      nodes,
      route,
      data,
      timestamp: Date.now()
    })
  }
}

/**
 * Message collector to track sent messages
 */
export class MessageCollector {
  public sentMessages: SentMessage[] = []
  
  collectMessage(message: SentMessage): void {
    this.sentMessages.push(message)
  }
  
  getMessagesByRoute(route: string): SentMessage[] {
    return this.sentMessages.filter(m => m.route === route)
  }
  
  getMessagesForNode(nodeId: string): SentMessage[] {
    return this.sentMessages.filter(m => 
      m.nodes.some(n => n.id === nodeId)
    )
  }
  
  clear(): void {
    this.sentMessages = []
  }
  
  printSummary(): void {
    const logger = getLogger()
    logger.summary('\n=== Message Collection Summary ===')
    logger.summary(`Total messages sent: ${this.sentMessages.length}`)
    
    const byRoute = new Map<string, number>()
    const nodesCovered = new Set<string>()
    
    for (const msg of this.sentMessages) {
      byRoute.set(msg.route, (byRoute.get(msg.route) || 0) + 1)
      msg.nodes.forEach(n => nodesCovered.add(n.id))
    }
    
    logger.summary('\nMessages by route:')
    for (const [route, count] of byRoute) {
      logger.summary(`  ${route}: ${count}`)
    }
    
    logger.summary(`\nTotal unique nodes covered: ${nodesCovered.size}`)
  }
}

/**
 * Minimal StateManager mock
 */
export class MockStateManager {
  public currentCycleShardData: any
  public shardValuesByCycle: Map<number, any>
  
  constructor(cycleShardData: any) {
    this.currentCycleShardData = cycleShardData
    this.shardValuesByCycle = new Map([[cycleShardData.cycleNumber, cycleShardData]])
    const logger = getLogger()
    logger.detail(`MockStateManager initialized for cycle ${cycleShardData.cycleNumber}`)
  }
  
  filterValidNodesForInternalMessage(
    nodes: any[],
    route: string,
    skipFailedNodes: boolean,
    skipNodeJoin: boolean
  ): any[] {
    // For testing, just return all nodes as valid
    const logger = getLogger()
    logger.detail(`filterValidNodesForInternalMessage: returning all ${nodes.length} nodes as valid`)
    return nodes
  }
}

/**
 * Shard calculator using existing ShardFunctions
 */
export class MockShardCalculator {
  static generateCycleShardData(
    activeNodes: any[],
    cycleNumber: number,
    config: ShardConfig,
    ourNodeId?: string
  ): any {
    const logger = getLogger()
    logger.detail(`\nGenerating CycleShardData for cycle ${cycleNumber}`)
    logger.detail(`  Active nodes: ${activeNodes.length}`)
    logger.detail(`  Nodes per consensus group: ${config.nodesPerConsensusGroup}`)
    logger.detail(`  Nodes per edge: ${config.nodesPerEdge}`)
    
    // Calculate shard globals using actual ShardFunctions
    const shardGlobals = ShardFunctions.calculateShardGlobals(
      activeNodes.length,
      config.nodesPerConsensusGroup,
      config.nodesPerEdge
    )
    
    logger.detail(`  Calculated shard globals:`)
    logger.detail(`    - numPartitions: ${shardGlobals.numPartitions}`)
    logger.detail(`    - consensusRadius: ${shardGlobals.consensusRadius}`)
    logger.detail(`    - nodesPerConsenusGroup: ${shardGlobals.nodesPerConsenusGroup}`)
    
    // Create partition shard data map
    const parititionShardDataMap = new Map()
    ShardFunctions.computePartitionShardDataMap(
      shardGlobals,
      parititionShardDataMap,
      0,
      shardGlobals.numPartitions
    )
    
    // Create node shard data map
    const nodeShardDataMap = new Map()
    ShardFunctions.computeNodePartitionDataMap(
      shardGlobals,
      nodeShardDataMap,
      activeNodes,
      parititionShardDataMap,
      activeNodes,
      true // Generate full data
    )
    
    // Find our node if specified
    let ourNode = null
    let nodeShardData = null
    if (ourNodeId) {
      ourNode = activeNodes.find(n => n.id === ourNodeId)
      if (ourNode) {
        nodeShardData = nodeShardDataMap.get(ourNodeId)
      }
    }
    
    // Create CycleShardData object
    const cycleShardData: any = {
      nodeShardDataMap,
      parititionShardDataMap,
      nodes: activeNodes,
      activeFoundationNodes: [], // Empty for testing
      cycleNumber,
      partitionsToSkip: new Map(),
      hasCompleteData: true,
      ourNode,
      nodeShardData,
      shardGlobals,
      timestamp: Date.now(),
      timestampEndCycle: Date.now() + 60000, // 60 seconds later
      calculationTime: Date.now(),
      syncingNeighbors: []
    }
    
    return cycleShardData
  }
}

/**
 * Helper to create mock nodes
 */
export function createMockNode(id: string, index: number): any {
  return {
    id,
    publicKey: id, // For testing, use same as id
    externalIp: `10.0.0.${index}`,
    externalPort: 9000 + index,
    internalIp: `10.0.0.${index}`,
    internalPort: 10000 + index,
    address: id.substring(0, 40),
    joinRequestTimestamp: Date.now(),
    activeTimestamp: Date.now(),
    syncingTimestamp: Date.now(),
    readyTimestamp: Date.now(),
    status: 'active'
  }
}

/**
 * Helper to create nodes from validator list
 */
export function createNodesFromValidatorList(validatorIds: string[]): any[] {
  return validatorIds.map((id, index) => createMockNode(id, index))
}

// Type definitions
export interface SentMessage {
  nodes: any[]
  route: string
  data: any
  serializeFunc?: any
  extraData?: any
  timestamp: number
}

export interface ShardConfig {
  nodesPerConsensusGroup: number
  nodesPerEdge: number
}

export interface TestScenario {
  receipt: any
  activeValidators: string[]
  transactionGroup?: string[]
  executionGroup?: string[]
  cycleNumber: number
  shardConfig: ShardConfig
}