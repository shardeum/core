import { P2P } from '@shardus/types'

interface NodeHistory {
  consecutiveRefutes: number
  refuteCycles: Set<number> // Set of cycle numbers where node was refuted
  lastRefuteCycle?: number  // Track the last cycle where node was refuted
}

export class ProblemNodeTracker {
  private static instance: ProblemNodeTracker
  private nodeHistories: Map<string, NodeHistory> = new Map()
  private readonly HISTORY_LENGTH = 100 // Number of cycles to track
  private readonly CONSECUTIVE_REFUTE_THRESHOLD = 3
  private readonly REFUTE_PERCENTAGE_THRESHOLD = 0.1 // 10%

  private constructor() {}

  static getInstance(): ProblemNodeTracker {
    if (!ProblemNodeTracker.instance) {
      ProblemNodeTracker.instance = new ProblemNodeTracker()
    }
    return ProblemNodeTracker.instance
  }

  static resetInstance(): void {
    if (ProblemNodeTracker.instance) {
      ProblemNodeTracker.instance.nodeHistories.clear()
    }
    ProblemNodeTracker.instance = undefined
  }

  updateNodeHistory(nodeId: string, cycleNumber: number, wasRefuted: boolean): void {
    let history = this.nodeHistories.get(nodeId)
    if (!history) {
      history = {
        consecutiveRefutes: 0,
        refuteCycles: new Set(),
        lastRefuteCycle: undefined
      }
      this.nodeHistories.set(nodeId, history)
    }

    console.log(`[${nodeId}] Cycle ${cycleNumber}, wasRefuted: ${wasRefuted}, before update:`, {
      consecutiveRefutes: history.consecutiveRefutes,
      lastRefuteCycle: history.lastRefuteCycle,
      refuteCycles: Array.from(history.refuteCycles)
    })

    if (wasRefuted) {
      // Only increment if this refute is consecutive with the last one
      if (history.lastRefuteCycle === cycleNumber - 1) {
        history.consecutiveRefutes++
      } else {
        // If there was a gap, start a new sequence
        history.consecutiveRefutes = 1
      }
      history.lastRefuteCycle = cycleNumber
      history.refuteCycles.add(cycleNumber)
    } else {
      // Always reset consecutive count on non-refute cycles
      history.consecutiveRefutes = 0
    }

    console.log(`[${nodeId}] After update:`, {
      consecutiveRefutes: history.consecutiveRefutes,
      lastRefuteCycle: history.lastRefuteCycle,
      refuteCycles: Array.from(history.refuteCycles)
    })

    // Remove cycles older than HISTORY_LENGTH
    const oldestCycleToKeep = cycleNumber - this.HISTORY_LENGTH
    history.refuteCycles.forEach(cycle => {
      if (cycle < oldestCycleToKeep) {
        history.refuteCycles.delete(cycle)
      }
    })
  }

  getRefutePercentage(nodeId: string, currentCycle: number): number {
    const history = this.nodeHistories.get(nodeId)
    if (!history) return 0

    // Calculate the window start
    const windowStart = Math.max(1, currentCycle - this.HISTORY_LENGTH + 1)

    // Count refutes only within the window
    const recentRefutes = Array.from(history.refuteCycles).filter(cycle => cycle >= windowStart).length

    // Calculate percentage based on window size
    return recentRefutes / this.HISTORY_LENGTH
  }

  isNodeProblematic(nodeId: string, currentCycle: number): boolean {
    const history = this.nodeHistories.get(nodeId)
    if (!history) return false

    console.log(`[${nodeId}] Checking problematic status:`, {
      consecutiveRefutes: history.consecutiveRefutes,
      refuteCycles: Array.from(history.refuteCycles),
      percentage: this.getRefutePercentage(nodeId, currentCycle)
    })

    // Check consecutive refutes
    if (history.consecutiveRefutes >= this.CONSECUTIVE_REFUTE_THRESHOLD) {
      return true
    }

    // Check refute percentage in recent history
    const refutePercentage = this.getRefutePercentage(nodeId, currentCycle)
    if (refutePercentage >= this.REFUTE_PERCENTAGE_THRESHOLD) {
      return true
    }

    return false
  }

  clearHistory(nodeId: string): void {
    this.nodeHistories.delete(nodeId)
  }
}

/**
 * Identifies nodes that have been marked as problematic based on their refute history
 * and lost status in the previous cycle. Returns array sorted by severity (highest refute percentage first).
 * @param prevRecord Previous cycle record containing lost and refuted nodes
 * @returns Array of problematic node IDs, sorted by severity
 */
export function getProblematicNodes(
  prevRecord: P2P.CycleCreatorTypes.CycleRecord
): string[] {
  const tracker = ProblemNodeTracker.getInstance()
  const currentCycle = prevRecord.counter

  // First update all histories
  const refutedNodes = prevRecord.refuted || []
  for (const nodeId of refutedNodes) {
    tracker.updateNodeHistory(nodeId, currentCycle, true)
  }

  const activeNodes = Array.isArray(prevRecord.active) ? prevRecord.active : []
  for (const nodeId of activeNodes) {
    if (!refutedNodes.includes(nodeId)) {
      tracker.updateNodeHistory(nodeId, currentCycle, false)
    }
  }

  // Then identify problematic nodes
  const problematicNodes = new Set<string>()
  
  // Check all active nodes for problematic status
  for (const nodeId of activeNodes) {
    if (tracker.isNodeProblematic(nodeId, currentCycle)) {
      problematicNodes.add(nodeId)
    }
  }

  // Add currently lost nodes
  for (const nodeId of prevRecord.lost || []) {
    problematicNodes.add(nodeId)
  }

  // Sort problematic nodes by refute percentage
  return Array.from(problematicNodes).sort((a, b) => {
    const aPercentage = tracker.getRefutePercentage(a, currentCycle)
    const bPercentage = tracker.getRefutePercentage(b, currentCycle)
    return bPercentage - aPercentage // Higher percentage first
  })
} 