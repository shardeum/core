import { P2P } from '@shardeum-foundation/lib-types'
import { config } from './Context'
import { logFlags } from '../logger'
import { nestedCountersInstance } from '../utils/nestedCounters'
import * as crypto from '@shardeum-foundation/lib-crypto-utils'
import * as CycleChain from './CycleChain'

/**
 * RefuteCycleCache manages a cache of which nodes were refuted in each cycle.
 * This cache is derived from consensed cycle records and is NOT included
 * in the node list hash, avoiding synchronization issues.
 * 
 * Structure: Map<cycleNumber, Set<nodeId>>
 */

/** TYPES */
export interface RefuteCacheState {
  cycleNumber: number
  cacheData: Array<{
    cycle: number
    refutedNodes: string[]
  }>
  checksum: string
}

/** STATE */
const refuteCycleCache = new Map<number, Set<string>>()

/** FUNCTIONS */

/**
 * Updates the cache with refuted nodes from a cycle record
 * NOTE: Cache is always maintained regardless of enableProblematicNodeRemoval setting
 * @param cycle - The cycle record containing refuted node IDs
 */
export function updateRefuteCache(cycle: P2P.CycleCreatorTypes.CycleRecord): void {
  // Always maintain the cache, regardless of enableProblematicNodeRemoval
  // The setting only controls whether we act on the cache data
  
  // Add new cycle data
  if (cycle.refuted && cycle.refuted.length > 0) {
    refuteCycleCache.set(cycle.counter, new Set(cycle.refuted))
    
    if (logFlags.p2pNonFatal) {
      console.log(`RefuteCycleCache: Added ${cycle.refuted.length} refuted nodes for cycle ${cycle.counter}`)
    }
    nestedCountersInstance.countEvent('p2p', 'refuteCache.cycleAdded', 1)
  }
  
  // Prune old entries outside the 33-cycle window
  const maxCycles = config.p2p.cyclesStoredByValidators || 33
  const windowStart = cycle.counter - maxCycles
  const entriesToDelete: number[] = []
  
  for (const [cycleNum] of refuteCycleCache) {
    if (cycleNum < windowStart) {
      entriesToDelete.push(cycleNum)
    }
  }
  
  for (const cycleNum of entriesToDelete) {
    refuteCycleCache.delete(cycleNum)
  }
  
  if (entriesToDelete.length > 0 && logFlags.p2pNonFatal) {
    console.log(`RefuteCycleCache: Pruned ${entriesToDelete.length} old cycles`)
  }
}

/**
 * Gets the list of cycles where a specific node was refuted
 * Uses the 30-cycle analysis window (oldest 30 of 33 stored cycles)
 * @param nodeId - The ID of the node to check
 * @param currentCycle - The current cycle number
 * @returns Array of cycle numbers where the node was refuted
 */
export function getRefuteCyclesForNode(nodeId: string, currentCycle: number): number[] {
  // Return empty if removal is disabled (we still track but don't act)
  if (!config.p2p.enableProblematicNodeRemoval) return []
  
  const refuteCycles: number[] = []
  
  // Get the analysis window cycles from CycleChain
  const analysisCycles = CycleChain.getCyclesForProblematicNodeAnalysis()
  
  // Look through analysis window for cycles where this node was refuted
  for (const cycle of analysisCycles) {
    const refutedSet = refuteCycleCache.get(cycle.counter)
    if (refutedSet && refutedSet.has(nodeId)) {
      refuteCycles.push(cycle.counter)
    }
  }
  
  return refuteCycles.sort((a, b) => a - b)
}

/**
 * Builds the cache from a set of cycle records
 * Used during initial sync to populate cache from historical cycles
 * @param cycles - Array of cycle records to build cache from
 */
export function buildCacheFromCycles(cycles: P2P.CycleCreatorTypes.CycleRecord[]): void {
  // Clear existing cache
  refuteCycleCache.clear()
  
  // Build cache from all provided cycles
  for (const cycle of cycles) {
    if (cycle.refuted && cycle.refuted.length > 0) {
      refuteCycleCache.set(cycle.counter, new Set(cycle.refuted))
    }
  }
  
  if (logFlags.p2pNonFatal) {
    console.log(`RefuteCycleCache: Built cache from ${cycles.length} cycles, cache now has ${refuteCycleCache.size} entries`)
  }
  nestedCountersInstance.countEvent('p2p', 'refuteCache.builtFromCycles', 1)
}

/**
 * Clears the entire cache (useful for testing or reset scenarios)
 */
export function clearRefuteCache(): void {
  refuteCycleCache.clear()
  if (logFlags.p2pNonFatal) {
    console.log('RefuteCycleCache: Cache cleared')
  }
}

/**
 * Gets the current size of the cache (for monitoring/debugging)
 * @returns Object with cache statistics
 */
export function getCacheStats(): { 
  totalCycles: number
  totalRefutedNodes: number
  oldestCycle: number | null
  newestCycle: number | null
} {
  let totalRefutedNodes = 0
  let oldestCycle: number | null = null
  let newestCycle: number | null = null
  
  for (const [cycleNum, refutedSet] of refuteCycleCache) {
    totalRefutedNodes += refutedSet.size
    
    if (oldestCycle === null || cycleNum < oldestCycle) {
      oldestCycle = cycleNum
    }
    if (newestCycle === null || cycleNum > newestCycle) {
      newestCycle = cycleNum
    }
  }
  
  return {
    totalCycles: refuteCycleCache.size,
    totalRefutedNodes,
    oldestCycle,
    newestCycle
  }
}

/**
 * For debugging: get all nodes that have been refuted in the analysis window
 * Uses the 30-cycle analysis window (oldest 30 of 33 stored cycles)
 * @param currentCycle - The current cycle number
 * @returns Map of nodeId to array of cycles where they were refuted
 */
export function getAllRefutedNodes(currentCycle: number): Map<string, number[]> {
  const nodeRefuteMap = new Map<string, number[]>()
  
  // Get the analysis window cycles from CycleChain
  const analysisCycles = CycleChain.getCyclesForProblematicNodeAnalysis()
  
  for (const cycle of analysisCycles) {
    const refutedSet = refuteCycleCache.get(cycle.counter)
    if (refutedSet) {
      for (const nodeId of refutedSet) {
        if (!nodeRefuteMap.has(nodeId)) {
          nodeRefuteMap.set(nodeId, [])
        }
        nodeRefuteMap.get(nodeId)!.push(cycle.counter)
      }
    }
  }
  
  // Sort cycles for each node
  for (const [nodeId, cycles] of nodeRefuteMap) {
    cycles.sort((a, b) => a - b)
  }
  
  return nodeRefuteMap
}

/**
 * Exports the current cache state for synchronization
 * @param currentCycle - The current cycle number
 * @returns The cache state including checksum for validation
 */
export function exportCacheState(currentCycle: number): RefuteCacheState {
  const windowStart = Math.max(1, currentCycle - config.p2p.problematicNodeHistoryLength)
  const cacheData: RefuteCacheState['cacheData'] = []
  
  // Export only data within the history window
  for (const [cycleNum, refutedSet] of refuteCycleCache) {
    if (cycleNum >= windowStart && cycleNum <= currentCycle) {
      cacheData.push({
        cycle: cycleNum,
        refutedNodes: Array.from(refutedSet).sort()
      })
    }
  }
  
  // Sort by cycle number for deterministic output
  cacheData.sort((a, b) => a.cycle - b.cycle)
  
  const state: RefuteCacheState = {
    cycleNumber: currentCycle,
    cacheData,
    checksum: calculateCacheChecksum(cacheData)
  }
  
  if (logFlags.p2pNonFatal) {
    console.log(`RefuteCycleCache: Exported state for cycle ${currentCycle} with ${cacheData.length} entries`)
  }
  
  return state
}

/**
 * Imports cache state from another node during synchronization
 * @param state - The cache state to import
 * @returns True if import was successful, false otherwise
 */
export function importCacheState(state: RefuteCacheState): boolean {
  try {
    // Validate checksum
    const calculatedChecksum = calculateCacheChecksum(state.cacheData)
    if (calculatedChecksum !== state.checksum) {
      nestedCountersInstance.countEvent('p2p', 'refuteCache.importChecksumMismatch', 1)
      if (logFlags.p2pNonFatal) {
        console.log('RefuteCycleCache: Import failed - checksum mismatch')
      }
      return false
    }
    
    // Clear existing cache
    refuteCycleCache.clear()
    
    // Import new data
    for (const entry of state.cacheData) {
      refuteCycleCache.set(entry.cycle, new Set(entry.refutedNodes))
    }
    
    nestedCountersInstance.countEvent('p2p', 'refuteCache.importSuccess', 1)
    if (logFlags.p2pNonFatal) {
      console.log(`RefuteCycleCache: Successfully imported ${state.cacheData.length} entries`)
    }
    
    return true
  } catch (error) {
    nestedCountersInstance.countEvent('p2p', 'refuteCache.importError', 1)
    if (logFlags.p2pNonFatal) {
      console.error('RefuteCycleCache: Import error:', error)
    }
    return false
  }
}

/**
 * Calculates a checksum for the cache data to ensure consistency
 * @param cacheData - The cache data to checksum
 * @returns The checksum string
 */
export function calculateCacheChecksum(cacheData?: RefuteCacheState['cacheData']): string {
  // If no data provided, calculate from current cache
  if (!cacheData) {
    cacheData = []
    for (const [cycle, refutedSet] of refuteCycleCache) {
      cacheData.push({
        cycle,
        refutedNodes: Array.from(refutedSet).sort()
      })
    }
    cacheData.sort((a, b) => a.cycle - b.cycle)
  }
  
  // Create deterministic string representation
  const dataString = JSON.stringify(cacheData)
  return crypto.hash(dataString)
}

/**
 * Gets the completeness percentage of the cache for the current history window
 * @param currentCycle - The current cycle number
 * @returns Percentage of cycles in the window that have data (0-1)
 */
export function getCacheCompleteness(currentCycle: number): number {
  const windowSize = Math.min(config.p2p.problematicNodeHistoryLength, currentCycle)
  const windowStart = Math.max(1, currentCycle - config.p2p.problematicNodeHistoryLength + 1)
  
  let cyclesWithData = 0
  for (let cycle = windowStart; cycle <= currentCycle; cycle++) {
    if (refuteCycleCache.has(cycle)) {
      cyclesWithData++
    }
  }
  
  return cyclesWithData / windowSize
}