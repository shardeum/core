import { config } from './Context'
import { logFlags } from '../logger'
import { nestedCountersInstance } from '../utils/nestedCounters'
import * as CycleChain from './CycleChain'
import { Node } from '@shardeum-foundation/lib-types/build/src/p2p/NodeListTypes'

/** STATE */
let ourReadiness = {
  isReady: false,
  firstCycleWithFullHistory: -1,
  cycleCount: 0,
  lastUpdated: 0
}

/** FUNCTIONS */

/**
 * Initializes the removal readiness module
 */
export function init(): void {
  if (logFlags.p2pNonFatal) {
    console.log('RemovalReadiness: Module initialized')
  }
}

/**
 * Updates our readiness based on cycle history completeness
 * @param currentCycle - Current cycle number
 */
function updateOurReadiness(currentCycle: number): void {
  const cycleWindowManager = CycleChain.getCycleWindowManager()
  if (!cycleWindowManager) {
    ourReadiness.isReady = false
    ourReadiness.cycleCount = 0
    return
  }
  
  const cycleCount = cycleWindowManager.getCycleCount()
  const requiredCycles = config.p2p.problematicNodeAnalysisWindow || 30
  const hasCompleteHistory = CycleChain.hasCompleteAnalysisWindow()
  
  ourReadiness.cycleCount = cycleCount
  ourReadiness.isReady = hasCompleteHistory && cycleCount >= requiredCycles
  ourReadiness.lastUpdated = currentCycle
  
  if (ourReadiness.isReady && ourReadiness.firstCycleWithFullHistory === -1) {
    ourReadiness.firstCycleWithFullHistory = currentCycle
  }
  
  if (logFlags.p2pNonFatal && currentCycle % 10 === 0) {
    console.log(`RemovalReadiness: Cycle count: ${cycleCount}/${requiredCycles}, ready: ${ourReadiness.isReady}`)
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
  return ourReadiness.isReady
}

/**
 * Gets the list of nodes that are ready to participate in removal decisions
 * Currently assumes all active nodes after bootstrap period can participate
 * @param activeNodes - List of active nodes
 * @param currentCycle - Current cycle number
 * @returns List of node IDs that can participate
 */
export function getParticipatingNodes(activeNodes: Node[], currentCycle: number): string[] {
  // Check if we're still in bootstrap period
  if (currentCycle < config.p2p.bootstrapCyclesBeforeRemoval) {
    return []
  }
  
  // For now, assume all active nodes after bootstrap can participate
  // In a more sophisticated implementation, we would track readiness of other nodes
  return activeNodes.map(node => node.id)
}

/**
 * Updates readiness tracking - called during sync
 * @param currentCycle - Current cycle number
 * @returns True if we have sufficient cycle history
 */
export function updateReadiness(currentCycle: number): boolean {
  nestedCountersInstance.countEvent('p2p', 'removalReadiness.update', 1)
  
  try {
    updateOurReadiness(currentCycle)
    
    if (ourReadiness.isReady) {
      nestedCountersInstance.countEvent('p2p', 'removalReadiness.ready', 1)
      if (logFlags.p2pNonFatal) {
        console.log('RemovalReadiness: Node is ready to participate in removal decisions')
      }
    } else {
      nestedCountersInstance.countEvent('p2p', 'removalReadiness.notReady', 1)
      if (logFlags.p2pNonFatal) {
        console.log(`RemovalReadiness: Not ready (${ourReadiness.cycleCount}/${config.p2p.problematicNodeAnalysisWindow || 30} cycles)`)
      }
    }
    
    return ourReadiness.isReady
    
  } catch (error) {
    nestedCountersInstance.countEvent('p2p', 'removalReadiness.error', 1)
    if (logFlags.p2pNonFatal) {
      console.error('RemovalReadiness: Update error:', error)
    }
    return false
  }
}

/**
 * Gets current readiness status
 * @returns Current readiness information
 */
export function getReadinessInfo(): {
  isReady: boolean
  cycleCount: number
  requiredCycles: number
  firstCycleWithFullHistory: number
} {
  return {
    isReady: ourReadiness.isReady,
    cycleCount: ourReadiness.cycleCount,
    requiredCycles: config.p2p.problematicNodeAnalysisWindow || 30,
    firstCycleWithFullHistory: ourReadiness.firstCycleWithFullHistory
  }
}