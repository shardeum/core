import { P2P } from '@shardeum-foundation/lib-types'
import * as NodeList from './NodeList'
import { config, logger } from './Context'
import { Node } from '@shardeum-foundation/lib-types/build/src/p2p/NodeListTypes'
import { ProblematicNodeCache } from './ProblematicNodeCache'
import * as CycleChain from './CycleChain'
import { Logger } from 'log4js'
import { logFlags } from '../logger'

// Cache instance for shadow mode
let problematicNodeCache: ProblematicNodeCache | null = null
let p2pLogger: Logger

// Initialize the cache
export function initProblematicNodeCache(): void {
  p2pLogger = logger.getLogger('p2p')
  
  if (config.p2p.enableProblematicNodeCacheBuilding) {
    problematicNodeCache = new ProblematicNodeCache(config)
    
    // Build initial cache from existing cycle records
    const cycles = CycleChain.newest ? 
      CycleChain.getCycleChain(
        Math.max(0, CycleChain.newest.counter - config.p2p.problematicNodeHistoryLength + 1),
        CycleChain.newest.counter
      ) : []
    
    if (cycles.length > 0) {
      problematicNodeCache.buildFromCycles(cycles)
      /* prettier-ignore */ if (logFlags.p2pNonFatal) info(`ProblematicNodeCache initialized with ${cycles.length} cycles`)
    }
  }
}

// Update cache when new cycle is created
export function updateProblematicNodeCache(cycle: P2P.CycleCreatorTypes.CycleRecord): void {
  if (problematicNodeCache && config.p2p.enableProblematicNodeCacheBuilding) {
    try {
      problematicNodeCache.addCycle(cycle, true) // Enable auto-prune
    } catch (err) {
      error('Failed to update ProblematicNodeCache:', err)
    }
  }
}

export function isNodeProblematic(node: Node, currentCycle: number): boolean {
  if (!node.refuteCycles) return false

  // Check consecutive refutes
  const consecutiveRefutes = getConsecutiveRefutes(node.refuteCycles, currentCycle)

  if (consecutiveRefutes >= config.p2p.problematicNodeConsecutiveRefuteThreshold) {
    return true
  }

  // Check refute percentage in recent history
  const refutePercentage = getRefutePercentage(node.refuteCycles, currentCycle)
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
  // Use cache-based implementation if enabled
  if (config.p2p.useProblematicNodeCacheV2 && problematicNodeCache) {
    const activeNodeIds = new Set(NodeList.activeByIdOrder.map(node => node.id))
    return problematicNodeCache.getProblematicNodes(prevRecord.counter, activeNodeIds)
  }

  // Original implementation
  const problematicNodes = NodeList.activeByIdOrder.filter((node) =>
    isNodeProblematic(node as Node, prevRecord.counter)
  )

  // Sort by refute percentage
  const result = problematicNodes
    .sort((a, b) => {
      const percentageA = getRefutePercentage(a.refuteCycles, prevRecord.counter)
      const percentageB = getRefutePercentage(b.refuteCycles, prevRecord.counter)
      return percentageB - percentageA
    })
    .map((node) => node.id)

  // Shadow mode: compare results if cache is enabled
  if (config.p2p.enableProblematicNodeCacheBuilding && problematicNodeCache) {
    const activeNodeIds = new Set(NodeList.activeByIdOrder.map(node => node.id))
    const cacheResults = problematicNodeCache.getProblematicNodes(prevRecord.counter, activeNodeIds)
    
    // Compare and log differences
    compareAndLogResults(result, cacheResults, prevRecord.counter)
  }

  return result
}

function compareAndLogResults(currentResults: string[], cacheResults: string[], cycle: number): void {
  const currentSet = new Set(currentResults)
  const cacheSet = new Set(cacheResults)
  
  const onlyInCurrent = currentResults.filter(id => !cacheSet.has(id))
  const onlyInCache = cacheResults.filter(id => !currentSet.has(id))
  
  if (onlyInCurrent.length > 0 || onlyInCache.length > 0) {
    warn(`ProblematicNodeCache mismatch at cycle ${cycle}:`, {
      onlyInCurrent,
      onlyInCache,
      currentResults,
      cacheResults
    })
  } else if (JSON.stringify(currentResults) !== JSON.stringify(cacheResults)) {
    // Different order but same nodes
    info(`ProblematicNodeCache order mismatch at cycle ${cycle}:`, {
      currentResults,
      cacheResults
    })
  } else {
    // Perfect match
    /* prettier-ignore */ if (logFlags.verbose) info(`ProblematicNodeCache match at cycle ${cycle}`)
  }
}

function info(...msg: unknown[]) {
  const entry = `ProblemNodeHandler: ${msg.join(' ')}`
  p2pLogger.info(entry)
}

function warn(...msg: unknown[]) {
  const entry = `ProblemNodeHandler: ${msg.join(' ')}`
  p2pLogger.warn(entry)
}

function error(...msg: unknown[]) {
  const entry = `ProblemNodeHandler: ${msg.join(' ')}`
  p2pLogger.error(entry)
}
