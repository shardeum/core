import { P2P } from '@shardeum-foundation/lib-types'
import { Node } from '@shardeum-foundation/lib-types/build/src/p2p/NodeListTypes'
import { config } from './Context'
import { logFlags } from '../logger'
import { nestedCountersInstance } from '../utils/nestedCounters'
import * as RefuteCycleCache from './RefuteCycleCache'
import { RefuteCacheState } from './RefuteCycleCache'
import * as Network from '../network'
import * as Context from './Context'
import * as crypto from '../crypto'
import * as CycleChain from './CycleChain'

/** TYPES */
export interface RefuteCacheSyncRequest {
  currentCycle: number
  requesterNodeId: string
  timestamp: number
}

export interface RefuteCacheSyncResponse {
  success: boolean
  cacheState?: RefuteCacheState
  error?: string
  responderNodeId: string
  timestamp: number
}

interface NodeRefuteReadiness {
  nodeId: string
  firstCycleWithFullCache: number
  cacheCompleteness: number
  isReadyForRemovalDecisions: boolean
  lastUpdated: number
}

/** STATE */
const nodeReadinessMap = new Map<string, NodeRefuteReadiness>()
let ourReadiness: NodeRefuteReadiness | null = null

/** FUNCTIONS */

/**
 * Initializes the refute cache sync module
 */
export function init(): void {
  // Register network routes for sync
  Network.registerExternalGet('refute-cache-state', externalGetRefuteCacheState)
  
  if (logFlags.p2pNonFatal) {
    console.log('RefuteCacheSync: Module initialized')
  }
}

/**
 * Updates readiness based on cycle history completeness
 * No longer syncs cache directly - cache is built from cycle history
 * @param syncNodes - List of nodes (unused but kept for compatibility)
 * @param currentCycle - Current cycle number
 * @returns True if we have sufficient cycle history
 */
export async function syncRefuteCache(syncNodes: Node[], currentCycle: number): Promise<boolean> {
  nestedCountersInstance.countEvent('p2p', 'refuteCacheSync.attempt', 1)
  
  try {
    // Update our readiness based on cycle history completeness
    updateOurReadiness(currentCycle)
    
    // Check if we have complete cycle history
    const hasCompleteHistory = CycleChain.hasCompleteAnalysisWindow()
    
    if (hasCompleteHistory) {
      nestedCountersInstance.countEvent('p2p', 'refuteCacheSync.cycleHistoryComplete', 1)
      if (logFlags.p2pNonFatal) {
        console.log('RefuteCacheSync: Cycle history is complete, cache built from cycles')
      }
    } else {
      nestedCountersInstance.countEvent('p2p', 'refuteCacheSync.cycleHistoryIncomplete', 1)
      if (logFlags.p2pNonFatal) {
        const cycleWindowManager = CycleChain.getCycleWindowManager()
        const cycleCount = cycleWindowManager ? cycleWindowManager.getCycleCount() : 0
        console.log(`RefuteCacheSync: Cycle history incomplete (${cycleCount}/${config.p2p.problematicNodeAnalysisWindow || 30} cycles)`)
      }
    }
    
    return hasCompleteHistory
    
  } catch (error) {
    nestedCountersInstance.countEvent('p2p', 'refuteCacheSync.error', 1)
    if (logFlags.p2pNonFatal) {
      console.error('RefuteCacheSync: Update error:', error)
    }
    return false
  }
}

/**
 * Requests cache state from a specific node
 * @param node - Node to request from
 * @param currentCycle - Current cycle number
 * @returns The sync response
 */
async function requestCacheStateFromNode(node: Node, currentCycle: number): Promise<RefuteCacheSyncResponse> {
  try {
    const request: RefuteCacheSyncRequest = {
      currentCycle,
      requesterNodeId: Context.config.nodelistHash,
      timestamp: Date.now()
    }
    
    const response = await Network.askBinary<RefuteCacheSyncRequest, RefuteCacheSyncResponse>(
      node,
      'refute-cache-state',
      request,
      serializeRefuteCacheSyncRequest,
      deserializeRefuteCacheSyncResponse,
      config.p2p.refuteCacheSyncTimeoutMs
    )
    
    return response
  } catch (error) {
    return {
      success: false,
      error: error.message,
      responderNodeId: node.id,
      timestamp: Date.now()
    }
  }
}

/**
 * Updates our node's readiness status based on cycle history completeness
 * @param currentCycle - Current cycle number
 */
export function updateOurReadiness(currentCycle: number): void {
  // Check if we have a complete analysis window (30 cycles)
  const hasCompleteHistory = CycleChain.hasCompleteAnalysisWindow()
  const cycleWindowManager = CycleChain.getCycleWindowManager()
  const completeness = cycleWindowManager ? 
    cycleWindowManager.getCycleCount() / (config.p2p.problematicNodeAnalysisWindow || 30) :
    0
  
  const isReady = hasCompleteHistory && 
    currentCycle >= config.p2p.minCyclesBeforeRemovalParticipation
  
  if (!ourReadiness) {
    ourReadiness = {
      nodeId: Context.config.nodelistHash,
      firstCycleWithFullCache: isReady ? currentCycle : -1,
      cacheCompleteness: completeness,
      isReadyForRemovalDecisions: isReady,
      lastUpdated: currentCycle
    }
  } else {
    ourReadiness.cacheCompleteness = completeness
    ourReadiness.isReadyForRemovalDecisions = isReady
    ourReadiness.lastUpdated = currentCycle
    if (isReady && ourReadiness.firstCycleWithFullCache === -1) {
      ourReadiness.firstCycleWithFullCache = currentCycle
    }
  }
  
  if (logFlags.p2pNonFatal && currentCycle % 10 === 0) {
    console.log(`RefuteCacheSync: Readiness update - completeness: ${(completeness * 100).toFixed(1)}%, ready: ${isReady}`)
  }
}

/**
 * Checks if our node can participate in removal decisions
 * @param currentCycle - Current cycle number
 * @returns True if we can participate, false otherwise
 */
export function canParticipateInRemovalDecisions(currentCycle: number): boolean {
  if (!config.p2p.enableProblematicNodeRemoval) return false
  
  updateOurReadiness(currentCycle)
  return ourReadiness?.isReadyForRemovalDecisions ?? false
}

/**
 * Gets the list of nodes that are ready to participate in removal decisions
 * @param activeNodes - List of active nodes
 * @param currentCycle - Current cycle number
 * @returns List of node IDs that can participate
 */
export function getParticipatingNodes(activeNodes: Node[], currentCycle: number): string[] {
  // For now, assume all active nodes after bootstrap period can participate
  // In a full implementation, this would track readiness of other nodes
  if (currentCycle < config.p2p.bootstrapCyclesBeforeRemoval) {
    return []
  }
  
  return activeNodes.map(node => node.id)
}

/** NETWORK HANDLERS */

/**
 * Handles external requests for our refute cache state
 */
async function externalGetRefuteCacheState(
  req: RefuteCacheSyncRequest,
  respond: (response: RefuteCacheSyncResponse) => void
): Promise<void> {
  try {
    if (!config.p2p.enableRefuteCacheSync || !config.p2p.enableProblematicNodeRemoval) {
      respond({
        success: false,
        error: 'RefuteCache sync disabled',
        responderNodeId: Context.config.nodelistHash,
        timestamp: Date.now()
      })
      return
    }
    
    const cacheState = RefuteCycleCache.exportCacheState(req.currentCycle)
    
    respond({
      success: true,
      cacheState,
      responderNodeId: Context.config.nodelistHash,
      timestamp: Date.now()
    })
    
    nestedCountersInstance.countEvent('p2p', 'refuteCacheSync.stateProvided', 1)
    
  } catch (error) {
    respond({
      success: false,
      error: error.message,
      responderNodeId: Context.config.nodelistHash,
      timestamp: Date.now()
    })
    
    nestedCountersInstance.countEvent('p2p', 'refuteCacheSync.stateProvideError', 1)
  }
}

/** SERIALIZATION */

function serializeRefuteCacheSyncRequest(req: RefuteCacheSyncRequest): Buffer {
  return Buffer.from(JSON.stringify(req))
}

function deserializeRefuteCacheSyncResponse(buffer: Buffer): RefuteCacheSyncResponse {
  return JSON.parse(buffer.toString()) as RefuteCacheSyncResponse
}