import { P2P } from '@shardus/types'
import * as Self from './Self'
import { logFlags } from '../logger'

/**
 * CycleHistoryTracker tracks cycle coverage during the joining phase.
 * It monitors which cycles we have received and identifies gaps in the sequence.
 */
export class CycleHistoryTracker {
  private targetCycleCount: number
  private oldestCycle: number = -1
  private newestCycle: number = -1
  private cycles: Map<number, P2P.CycleCreatorTypes.CycleRecord> = new Map()
  private missingCycles: Set<number> = new Set()
  private verbose: boolean = false

  constructor(targetCycleCount: number) {
    this.targetCycleCount = targetCycleCount
  }

  /**
   * Add a cycle to our collection and update tracking
   */
  addCycle(cycle: P2P.CycleCreatorTypes.CycleRecord): void {
    if (!cycle || typeof cycle.counter !== 'number') {
      if (logFlags.p2pNonFatal) Self.logger.error('CycleHistoryTracker: Invalid cycle provided')
      return
    }

    const cycleNumber = cycle.counter

    // Add the cycle to our collection
    this.cycles.set(cycleNumber, cycle)
    this.missingCycles.delete(cycleNumber)

    // Update oldest and newest
    if (this.oldestCycle === -1 || cycleNumber < this.oldestCycle) {
      this.oldestCycle = cycleNumber
    }
    if (this.newestCycle === -1 || cycleNumber > this.newestCycle) {
      this.newestCycle = cycleNumber
    }

    // Check for gaps in the sequence
    this.updateMissingCycles()

    if (this.verbose && logFlags.p2pNonFatal) {
      Self.logger.info(`CycleHistoryTracker: Added cycle ${cycleNumber}, have ${this.cycles.size}/${this.targetCycleCount} cycles`)
    }
  }

  /**
   * Check if we have sufficient cycle history
   */
  hasCompleteHistory(currentCycle: number): boolean {
    if (this.cycles.size === 0) return false

    // For young networks, we may have fewer cycles than target
    const expectedCycles = Math.min(this.targetCycleCount, currentCycle + 1)
    
    // We need cycles from (currentCycle - expectedCycles + 1) to currentCycle
    const requiredStartCycle = Math.max(0, currentCycle - expectedCycles + 1)
    
    // Check if we have all required cycles
    for (let i = requiredStartCycle; i <= currentCycle; i++) {
      if (!this.cycles.has(i)) {
        return false
      }
    }

    return true
  }

  /**
   * Get the percentage of cycle history completeness
   */
  getCompleteness(currentCycle: number): number {
    if (currentCycle < 0) return 0

    const expectedCycles = Math.min(this.targetCycleCount, currentCycle + 1)
    const requiredStartCycle = Math.max(0, currentCycle - expectedCycles + 1)
    
    let haveCycles = 0
    for (let i = requiredStartCycle; i <= currentCycle; i++) {
      if (this.cycles.has(i)) {
        haveCycles++
      }
    }

    return haveCycles / expectedCycles
  }

  /**
   * Get list of missing cycles to request
   */
  getMissingCycles(): number[] {
    return Array.from(this.missingCycles).sort((a, b) => a - b)
  }

  /**
   * Get a specific cycle if we have it
   */
  getCycle(cycleNumber: number): P2P.CycleCreatorTypes.CycleRecord | undefined {
    return this.cycles.get(cycleNumber)
  }

  /**
   * Get all cycles we have collected
   */
  getAllCycles(): P2P.CycleCreatorTypes.CycleRecord[] {
    return Array.from(this.cycles.values()).sort((a, b) => a.counter - b.counter)
  }

  /**
   * Get the range of cycles we have
   */
  getCycleRange(): { oldest: number; newest: number; count: number } {
    return {
      oldest: this.oldestCycle,
      newest: this.newestCycle,
      count: this.cycles.size
    }
  }

  /**
   * Clear all tracked data
   */
  clear(): void {
    this.cycles.clear()
    this.missingCycles.clear()
    this.oldestCycle = -1
    this.newestCycle = -1
  }

  /**
   * Update the set of missing cycles based on current state
   */
  private updateMissingCycles(): void {
    this.missingCycles.clear()
    
    if (this.oldestCycle === -1 || this.newestCycle === -1) return

    // Check for gaps between oldest and newest
    for (let i = this.oldestCycle; i <= this.newestCycle; i++) {
      if (!this.cycles.has(i)) {
        this.missingCycles.add(i)
      }
    }
  }

  /**
   * Set verbose logging
   */
  setVerbose(verbose: boolean): void {
    this.verbose = verbose
  }

  /**
   * Get diagnostic information about the tracker state
   */
  getDiagnostics(): {
    targetCycleCount: number
    cycleCount: number
    oldestCycle: number
    newestCycle: number
    missingCyclesCount: number
    missingCycles: number[]
    completenessPercentage: number
  } {
    const currentCycle = this.newestCycle
    return {
      targetCycleCount: this.targetCycleCount,
      cycleCount: this.cycles.size,
      oldestCycle: this.oldestCycle,
      newestCycle: this.newestCycle,
      missingCyclesCount: this.missingCycles.size,
      missingCycles: this.getMissingCycles(),
      completenessPercentage: currentCycle >= 0 ? this.getCompleteness(currentCycle) * 100 : 0
    }
  }
}