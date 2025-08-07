import { P2P } from '@shardeum-foundation/lib-types'
import * as NodeList from './NodeList'
import { config, logger } from './Context'
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
    const cycles = CycleChain.newest
      ? CycleChain.getCycleChain(
          Math.max(0, CycleChain.newest.counter - config.p2p.problematicNodeHistoryLength + 1),
          CycleChain.newest.counter
        )
      : []

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

// Rebuild cache from all cycles in CycleChain
export function rebuildCacheFromCycleChain(): void {
  if (!problematicNodeCache || !config.p2p.enableProblematicNodeCacheBuilding) {
    return
  }

  try {
    const cycles = CycleChain.cycles || []
    if (cycles.length > 0) {
      problematicNodeCache.buildFromCycles(cycles)
      /* prettier-ignore */ if (logFlags.p2pNonFatal) info(`ProblematicNodeCache rebuilt with ${cycles.length} cycles`)
    }
  } catch (err) {
    error('Failed to rebuild ProblematicNodeCache from CycleChain:', err)
  }
}

// Prune cache for nodes that are no longer active
export function pruneInactiveNodesFromCache(): void {
  if (!problematicNodeCache || !config.p2p.enableProblematicNodeCacheBuilding) {
    return
  }

  try {
    const activeNodeIds = new Set(NodeList.activeByIdOrder.map((node) => node.id))
    problematicNodeCache.pruneInactiveNodes(activeNodeIds)
    /* prettier-ignore */ if (logFlags.verbose) info(`Pruned inactive nodes from ProblematicNodeCache`)
  } catch (err) {
    error('Failed to prune inactive nodes from ProblematicNodeCache:', err)
  }
}

// Export the problematic node cache as compressed JSON
export function exportProblematicNodeCache(): string | null {
  if (!problematicNodeCache || !config.p2p.enableProblematicNodeCacheBuilding) {
    return null
  }

  try {
    return problematicNodeCache.toJSON()
  } catch (err) {
    error('Failed to export ProblematicNodeCache:', err)
    return null
  }
}

export function getProblematicNodes(prevRecord: P2P.CycleCreatorTypes.CycleRecord): string[] {
  // Use cache-based implementation if enabled
  if (config.p2p.useProblematicNodeCacheV2 && problematicNodeCache) {
    const activeNodeIds = new Set(NodeList.activeByIdOrder.map((node) => node.id))
    return problematicNodeCache.getProblematicNodes(prevRecord.counter, activeNodeIds)
  }
}

// Get problematic node info for reporting to monitor - info about self node only
export function getProblematicNodeInfoForSelf(nodeId: string): any | null {
  if (!problematicNodeCache || !config.p2p.enableProblematicNodeCacheBuilding) {
    return null
  }

  try {
    const currentCycle = CycleChain.newest?.counter || 0

    const metrics = problematicNodeCache.calculateNodeMetrics(nodeId, currentCycle)
    const refuteHistory = problematicNodeCache.refuteHistory.get(nodeId) || []

    // Build cycle history for last 30 cycles
    const cycleHistoryLength = 30
    const startCycle = Math.max(1, currentCycle - cycleHistoryLength + 1)
    const cycleRefuteHistory: boolean[] = []

    for (let cycle = startCycle; cycle <= currentCycle; cycle++) {
      cycleRefuteHistory.push(refuteHistory.includes(cycle))
    }

    // Calculate total refutes in the history window
    const totalRefutes = refuteHistory.filter((cycle) => cycle >= startCycle && cycle <= currentCycle).length

    const problematicNodeInfo = {
      isProblematic:
        metrics.consecutiveRefutes >= config.p2p.problematicNodeConsecutiveRefuteThreshold ||
        metrics.refutePercentage >= config.p2p.problematicNodeRefutePercentageThreshold,
      totalRefutes: totalRefutes,
      maxConsecutiveRefutes: metrics.consecutiveRefutes,
      refutePercentage: metrics.refutePercentage,
      cycleRefuteHistory: cycleRefuteHistory,
    }

    return problematicNodeInfo
  } catch (err) {
    error('Failed to get problematic node info for self:', err)
    return null
  }
}

export function getRefutePercentage(refuteCycles: number[], currentCycle: number): number {
  if (config.p2p.useProblematicNodeCacheV2 && problematicNodeCache) {
    return problematicNodeCache.getRefutePercentage(refuteCycles, currentCycle)
  }
  return 0
}

export function getMaxConsecutiveRefutes(refuteCycles: number[], currentCycle: number): number {
  if (config.p2p.useProblematicNodeCacheV2 && problematicNodeCache) {
    return problematicNodeCache.getMaxConsecutiveRefutes(refuteCycles, currentCycle)
  }
  return 0
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
