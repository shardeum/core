import { P2P } from '@shardeum-foundation/lib-types'
import * as Self from './Self'
import { logFlags } from '../logger'

/**
 * CycleWindowManager maintains a sliding window of exactly 33 cycles.
 * It provides the oldest 30 cycles for problematic node analysis while
 * keeping the newest 3 cycles as a buffer.
 */
export class CycleWindowManager {
  private cycles: P2P.CycleCreatorTypes.CycleRecord[] = []
  private maxCycles: number = 33
  private analysisWindowSize: number = 30
  private verbose: boolean = false

  constructor(maxCycles: number = 33, analysisWindowSize: number = 30) {
    this.maxCycles = maxCycles
    this.analysisWindowSize = analysisWindowSize
    
    if (this.analysisWindowSize > this.maxCycles) {
      throw new Error(`Analysis window size (${this.analysisWindowSize}) cannot be larger than max cycles (${this.maxCycles})`)
    }
  }

  /**
   * Add a new cycle and prune old ones if needed
   */
  addCycle(cycle: P2P.CycleCreatorTypes.CycleRecord): void {
    if (!cycle || typeof cycle.counter !== 'number') {
      if (logFlags.p2pNonFatal) console.error('CycleWindowManager: Invalid cycle provided')
      return
    }

    // Check if this cycle already exists
    const existingIndex = this.cycles.findIndex(c => c.counter === cycle.counter)
    if (existingIndex !== -1) {
      // Replace existing cycle with same counter
      this.cycles[existingIndex] = cycle
      if (this.verbose && logFlags.p2pNonFatal) {
        console.log(`CycleWindowManager: Replaced existing cycle ${cycle.counter}`)
      }
      return
    }

    // Insert cycle in the correct position to maintain order
    let insertIndex = this.cycles.length
    for (let i = 0; i < this.cycles.length; i++) {
      if (cycle.counter < this.cycles[i].counter) {
        insertIndex = i
        break
      }
    }

    this.cycles.splice(insertIndex, 0, cycle)

    // Prune old cycles if we exceed the limit
    while (this.cycles.length > this.maxCycles) {
      const removed = this.cycles.shift() // Remove oldest (first in array)
      if (this.verbose && logFlags.p2pNonFatal) {
        console.log(`CycleWindowManager: Pruned old cycle ${removed?.counter}, now have ${this.cycles.length} cycles`)
      }
    }

    if (this.verbose && logFlags.p2pNonFatal) {
      console.log(`CycleWindowManager: Added cycle ${cycle.counter}, now have ${this.cycles.length} cycles`)
    }
  }

  /**
   * Get the analysis window (oldest 30 cycles)
   */
  getAnalysisWindow(): P2P.CycleCreatorTypes.CycleRecord[] {
    if (this.cycles.length <= this.analysisWindowSize) {
      return [...this.cycles] // Return copy of all cycles
    }
    
    // Return the oldest 30 cycles
    return this.cycles.slice(0, this.analysisWindowSize)
  }

  /**
   * Get all cycles in the window
   */
  getAllCycles(): P2P.CycleCreatorTypes.CycleRecord[] {
    return [...this.cycles]
  }

  /**
   * Get a specific cycle by counter
   */
  getCycle(counter: number): P2P.CycleCreatorTypes.CycleRecord | undefined {
    return this.cycles.find(c => c.counter === counter)
  }

  /**
   * Check if we have a complete analysis window
   */
  hasCompleteAnalysisWindow(): boolean {
    return this.cycles.length >= this.analysisWindowSize
  }

  /**
   * Get the buffer cycles (newest 3 cycles not used for analysis)
   */
  getBufferCycles(): P2P.CycleCreatorTypes.CycleRecord[] {
    if (this.cycles.length <= this.analysisWindowSize) {
      return []
    }
    
    // Return cycles beyond the analysis window
    return this.cycles.slice(this.analysisWindowSize)
  }

  /**
   * Get the oldest cycle in the window
   */
  getOldestCycle(): P2P.CycleCreatorTypes.CycleRecord | undefined {
    return this.cycles[0]
  }

  /**
   * Get the newest cycle in the window
   */
  getNewestCycle(): P2P.CycleCreatorTypes.CycleRecord | undefined {
    return this.cycles[this.cycles.length - 1]
  }

  /**
   * Get the number of cycles currently stored
   */
  getCycleCount(): number {
    return this.cycles.length
  }

  /**
   * Clear all cycles
   */
  clear(): void {
    this.cycles = []
  }

  /**
   * Set verbose logging
   */
  setVerbose(verbose: boolean): void {
    this.verbose = verbose
  }

  /**
   * Get diagnostic information about the window state
   */
  getDiagnostics(): {
    maxCycles: number
    analysisWindowSize: number
    currentCycleCount: number
    oldestCycleCounter: number | undefined
    newestCycleCounter: number | undefined
    analysisWindowCount: number
    bufferCycleCount: number
    hasCompleteAnalysisWindow: boolean
  } {
    const analysisWindow = this.getAnalysisWindow()
    const bufferCycles = this.getBufferCycles()
    
    return {
      maxCycles: this.maxCycles,
      analysisWindowSize: this.analysisWindowSize,
      currentCycleCount: this.cycles.length,
      oldestCycleCounter: this.getOldestCycle()?.counter,
      newestCycleCounter: this.getNewestCycle()?.counter,
      analysisWindowCount: analysisWindow.length,
      bufferCycleCount: bufferCycles.length,
      hasCompleteAnalysisWindow: this.hasCompleteAnalysisWindow()
    }
  }

  /**
   * Initialize from an array of cycles
   */
  initializeFromCycles(cycles: P2P.CycleCreatorTypes.CycleRecord[]): void {
    this.clear()
    
    // Sort cycles by counter and add them
    const sortedCycles = [...cycles].sort((a, b) => a.counter - b.counter)
    for (const cycle of sortedCycles) {
      this.addCycle(cycle)
    }
  }

  /**
   * Check if the window contains a specific cycle
   */
  hasCycle(counter: number): boolean {
    return this.cycles.some(c => c.counter === counter)
  }

  /**
   * Get cycle counters in the analysis window
   */
  getAnalysisWindowCounters(): number[] {
    return this.getAnalysisWindow().map(c => c.counter)
  }

  /**
   * Verify the integrity of the cycle chain
   */
  verifyCycleChainIntegrity(): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    
    if (this.cycles.length === 0) {
      return { valid: true, errors }
    }

    // Check that cycles are in order
    for (let i = 1; i < this.cycles.length; i++) {
      const prevCycle = this.cycles[i - 1]
      const currCycle = this.cycles[i]
      
      if (currCycle.counter !== prevCycle.counter + 1) {
        errors.push(`Gap in cycle sequence: ${prevCycle.counter} -> ${currCycle.counter}`)
      }
      
      // Note: We can't verify the previous hash without access to makeCycleMarker function
      // This check would require storing the computed marker with each cycle
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }
}