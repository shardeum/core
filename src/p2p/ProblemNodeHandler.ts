import { P2P } from '@shardeum-foundation/lib-types'
import * as NodeList from './NodeList'
import { config } from './Context'
import { Node } from '@shardeum-foundation/lib-types/build/src/p2p/NodeListTypes'
import { getRefuteCyclesForNode } from './RefuteCycleCache'
import * as RefuteCacheSync from './RefuteCacheSync'
import { logFlags } from '../logger'

export function isNodeProblematic(node: Node, currentCycle: number): boolean {
  if (!config.p2p.enableProblematicNodeRemoval) return false

  // Get refute cycles from cache instead of node property
  const refuteCycles = getRefuteCyclesForNode(node.id, currentCycle)
  if (refuteCycles.length === 0) return false

  // Check consecutive refutes
  const consecutiveRefutes = getConsecutiveRefutes(refuteCycles, currentCycle)

  if (consecutiveRefutes >= config.p2p.problematicNodeConsecutiveRefuteThreshold) {
    return true
  }

  // Check refute percentage in recent history
  const refutePercentage = getRefutePercentage(refuteCycles, currentCycle)
  if (refutePercentage >= config.p2p.problematicNodeRefutePercentageThreshold) {
    return true
  }

  return false
}

export function getConsecutiveRefutes(refuteCycles: number[], currentCycle: number): number {
  if (refuteCycles.length === 0) return 0

  // Filter to only include refutes up to current cycle
  const relevantRefutes = refuteCycles.filter((cycle) => cycle <= currentCycle)
  if (relevantRefutes.length === 0) return 0

  // Find the longest consecutive sequence that ends at current cycle or one before
  let maxCount = 0
  let currentCount = 1
  let lastCycle = relevantRefutes[0]

  for (let i = 1; i < relevantRefutes.length; i++) {
    const cycle = relevantRefutes[i]

    if (cycle === lastCycle + 1) {
      currentCount++
    } else {
      // If sequence breaks, check if previous sequence ended at current cycle or one before
      if (lastCycle === currentCycle || lastCycle === currentCycle - 1) {
        maxCount = Math.max(maxCount, currentCount)
      }
      currentCount = 1
    }

    lastCycle = cycle
  }

  // Check the last sequence
  if (lastCycle === currentCycle || lastCycle === currentCycle - 1) {
    maxCount = Math.max(maxCount, currentCount)
  }

  return maxCount
}

export function getRefutePercentage(refuteCycles: number[], currentCycle: number): number {
  const windowStart = Math.max(1, currentCycle - config.p2p.problematicNodeHistoryLength)
  const windowSize = Math.min(config.p2p.problematicNodeHistoryLength, currentCycle)
  const recentRefutes = refuteCycles.filter((cycle) => cycle >= windowStart && cycle <= currentCycle).length

  return recentRefutes / windowSize
}

export function getProblematicNodes(prevRecord: P2P.CycleCreatorTypes.CycleRecord): string[] {
  const problematicNodes = NodeList.activeByIdOrder.filter((node) =>
    isNodeProblematic(node as Node, prevRecord.counter)
  )

  // Sort by refute percentage
  return problematicNodes
    .sort((a, b) => {
      const refuteCyclesA = getRefuteCyclesForNode(a.id, prevRecord.counter)
      const refuteCyclesB = getRefuteCyclesForNode(b.id, prevRecord.counter)
      const percentageA = getRefutePercentage(refuteCyclesA, prevRecord.counter)
      const percentageB = getRefutePercentage(refuteCyclesB, prevRecord.counter)
      return percentageB - percentageA
    })
    .map((node) => node.id)
}

/**
 * Gets problematic nodes with readiness checking
 * Only nodes that are ready to participate in removal decisions are considered
 * @param prevRecord - The previous cycle record
 * @returns Array of problematic node IDs from participating nodes
 */
export function getProblematicNodesWithReadiness(prevRecord: P2P.CycleCreatorTypes.CycleRecord): string[] {
  // Check if we can participate in removal decisions
  if (!RefuteCacheSync.canParticipateInRemovalDecisions(prevRecord.counter)) {
    if (logFlags.p2pNonFatal) {
      console.log(`ProblemNodeHandler: Node not ready to participate in removal decisions at cycle ${prevRecord.counter}`)
    }
    return []
  }
  
  // Check if it's too early in the network lifecycle
  if (prevRecord.counter < config.p2p.bootstrapCyclesBeforeRemoval) {
    if (logFlags.p2pNonFatal) {
      console.log(`ProblemNodeHandler: Network still in bootstrap period (cycle ${prevRecord.counter}/${config.p2p.bootstrapCyclesBeforeRemoval})`)
    }
    return []
  }
  
  // Get participating nodes
  const participatingNodes = RefuteCacheSync.getParticipatingNodes(
    NodeList.activeByIdOrder as Node[],
    prevRecord.counter
  )
  
  if (participatingNodes.length === 0) {
    return []
  }
  
  // Filter problematic nodes to only those in the participating set
  const problematicNodes = NodeList.activeByIdOrder
    .filter((node) => 
      participatingNodes.includes(node.id) && 
      isNodeProblematic(node as Node, prevRecord.counter)
    )

  // Sort by refute percentage
  return problematicNodes
    .sort((a, b) => {
      const refuteCyclesA = getRefuteCyclesForNode(a.id, prevRecord.counter)
      const refuteCyclesB = getRefuteCyclesForNode(b.id, prevRecord.counter)
      const percentageA = getRefutePercentage(refuteCyclesA, prevRecord.counter)
      const percentageB = getRefutePercentage(refuteCyclesB, prevRecord.counter)
      return percentageB - percentageA
    })
    .map((node) => node.id)
}
