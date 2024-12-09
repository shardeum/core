import { P2P } from '@shardus/types'

interface NodeHistory {
  refuteCycles: Set<number> // Set of cycle numbers where node was refuted
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
        refuteCycles: new Set(),
      }
      this.nodeHistories.set(nodeId, history)
    }

    const before = {    
      consecutiveRefutes: this.getConsecutiveRefutes(history.refuteCycles, cycleNumber - 1),
      refutePercentage: this.getRefutePercentage(nodeId, cycleNumber - 1),
      refuteCycles: Array.from(history.refuteCycles)
    }

    // Calculate window start
    const windowStart = Math.max(1, cycleNumber - this.HISTORY_LENGTH)

    // Clean up old refutes
    const oldRefutes = Array.from(history.refuteCycles).filter(cycle => cycle < windowStart)
    oldRefutes.forEach(cycle => history.refuteCycles.delete(cycle))

    if (wasRefuted) {
      history.refuteCycles.add(cycleNumber)
    }

    console.log(`Updated:`, {
      nodeId,
      cycleNumber,
      wasRefuted,
      before,
      after: {
        consecutiveRefutes: this.getConsecutiveRefutes(history.refuteCycles, cycleNumber),
        refutePercentage: this.getRefutePercentage(nodeId, cycleNumber),
        refuteCycles: Array.from(history.refuteCycles)
      }
    })
  }

  getRefutePercentage(nodeId: string, currentCycle: number): number {
    const history = this.nodeHistories.get(nodeId)
    if (!history) return 0

    // Calculate the window start
    const windowStart = Math.max(1, currentCycle - this.HISTORY_LENGTH + 1)
    
    // Use the minimum of HISTORY_LENGTH and currentCycle for window size
    const windowSize = Math.min(this.HISTORY_LENGTH, currentCycle)

    // Count refutes only within the window
    const recentRefutes = Array.from(history.refuteCycles).filter(cycle => cycle >= windowStart && cycle <= currentCycle).length

    // Calculate percentage based on window size
    return recentRefutes / windowSize
  }

  getConsecutiveRefutes(refuteCycles: Set<number>, currentCycle: number): number {
    const refuteCyclesArray = Array.from(refuteCycles)
    return refuteCyclesArray[refuteCyclesArray.length - 1] !== currentCycle ? 0 : refuteCyclesArray.filter((cycle, index) => {
      return index === 0 || cycle === refuteCyclesArray[index - 1] + 1
    }).length
  }

  isNodeProblematic(nodeId: string, currentCycle: number): boolean {
    const history = this.nodeHistories.get(nodeId)
    if (!history) return false

    // Check consecutive refutes
    if (this.getConsecutiveRefutes(history.refuteCycles, currentCycle) >= this.CONSECUTIVE_REFUTE_THRESHOLD) {
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
  const activeNodes = Array.isArray(prevRecord.active) ? prevRecord.active : []

  // Update histories for all nodes
  const allNodes = new Set([...refutedNodes, ...activeNodes])
  for (const nodeId of allNodes) {
    tracker.updateNodeHistory(nodeId, currentCycle, refutedNodes.includes(nodeId))
  }

  // Then identify problematic nodes
  const problematicNodes = new Set<string>()

  // Check all nodes for problematic status
  for (const nodeId of allNodes) {
    if (tracker.isNodeProblematic(nodeId, currentCycle)) {
      problematicNodes.add(nodeId)
    }
  }

  // Convert to array and sort by refute percentage
  return Array.from(problematicNodes).sort((a, b) => {
    const aPercentage = tracker.getRefutePercentage(a, currentCycle)
    const bPercentage = tracker.getRefutePercentage(b, currentCycle)
    return bPercentage - aPercentage
  })
} 