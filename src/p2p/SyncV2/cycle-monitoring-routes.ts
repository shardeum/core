/**
 * Cycle Monitoring Routes for SyncV2
 * These endpoints enable monitoring of cycle consistency across the network
 */

import * as CycleChain from '../CycleChain'
import { MAX_CYCLES_TO_KEEP } from '../CycleCreator'
import * as crypto from '@shardeum-foundation/lib-crypto-utils'
import { nestedCountersInstance } from '../../utils/nestedCounters'
import { isDebugModeMiddlewareHigh } from '../../network/debugMiddleware'
import { Request, Response } from 'express'

/**
 * Find missing cycles in the current cycle chain
 */
function findMissingCycles(): number[] {
  const missing: number[] = []
  if (!CycleChain.oldest || !CycleChain.newest) return missing

  const expectedStart = Math.max(1, CycleChain.newest.counter - MAX_CYCLES_TO_KEEP + 1)
  const start = Math.max(expectedStart, CycleChain.oldest.counter)

  for (let i = start; i <= CycleChain.newest.counter; i++) {
    if (!CycleChain.cycles.find((c) => c.counter === i)) {
      missing.push(i)
    }
  }

  return missing
}

/**
 * Calculate hash of the entire cycle chain for quick comparison
 */
function calculateCycleChainHash(): string {
  if (CycleChain.cycles.length === 0) return ''

  // Concatenate all cycle markers in order
  const markers = CycleChain.cycles.map((c) => CycleChain.computeCycleMarker(c)).join('')
  return crypto.hash(markers)
}

/**
 * Check if cycle storage is healthy
 */
function checkCycleStorageHealth(): {
  isHealthy: boolean
  hasRequiredHistory: boolean
  consecutiveCycles: number
  gaps: Array<{ start: number; end: number }>
} {
  const missing = findMissingCycles()
  const gaps: Array<{ start: number; end: number }> = []

  // Convert missing array to gap ranges
  if (missing.length > 0) {
    let gapStart = missing[0]
    let gapEnd = missing[0]

    for (let i = 1; i < missing.length; i++) {
      if (missing[i] === gapEnd + 1) {
        gapEnd = missing[i]
      } else {
        gaps.push({ start: gapStart, end: gapEnd })
        gapStart = missing[i]
        gapEnd = missing[i]
      }
    }
    gaps.push({ start: gapStart, end: gapEnd })
  }

  const hasRequiredHistory = CycleChain.cycles.length >= Math.min(MAX_CYCLES_TO_KEEP, CycleChain.newest?.counter || 0)
  const isHealthy = gaps.length === 0 && hasRequiredHistory

  return {
    isHealthy,
    hasRequiredHistory,
    consecutiveCycles: CycleChain.cycles.length - gaps.length,
    gaps,
  }
}

/**
 * Register cycle monitoring routes with debug middleware
 * All routes require high security level (DevSecurityLevel.High)
 */
export function registerCycleMonitoringRoutes(network: any): void {
  /**
   * Get comprehensive cycle inventory
   */
  network.registerExternalGet('cycle-inventory', isDebugModeMiddlewareHigh, (_req, res) => {
    nestedCountersInstance.countEvent('sync2', 'cycle-inventory')

    try {
      const missing = findMissingCycles()
      const inventory = {
        currentCycle: CycleChain.newest?.counter || 0,
        oldestStoredCycle: CycleChain.oldest?.counter || 0,
        newestStoredCycle: CycleChain.newest?.counter || 0,
        totalCyclesStored: CycleChain.cycles.length,
        maxCyclesToKeep: MAX_CYCLES_TO_KEEP,
        cycleMarkers: CycleChain.cycles.map((c) => CycleChain.computeCycleMarker(c)),
        missingCycles: missing,
        pruneHistory: {
          // These would need to be tracked in CycleChain module
          lastPruneTime: null,
          lastPrunedCycle: null,
        },
      }

      res.json(inventory)
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to get cycle inventory',
        message: error.message,
      })
    }
  })

  /**
   * Get hash of cycle chain for quick comparison
   */
  network.registerExternalGet('cycle-chain-hash', isDebugModeMiddlewareHigh, (_req, res) => {
    nestedCountersInstance.countEvent('sync2', 'cycle-chain-hash')

    try {
      const chainHash = calculateCycleChainHash()
      const response = {
        chainHash,
        cycleRange: {
          start: CycleChain.oldest?.counter || 0,
          end: CycleChain.newest?.counter || 0,
        },
        cycleCount: CycleChain.cycles.length,
        timestamp: Date.now(),
      }

      res.json(response)
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to calculate chain hash',
        message: error.message,
      })
    }
  })

  /**
   * Get cycle storage health status
   */
  network.registerExternalGet('cycle-storage-health', isDebugModeMiddlewareHigh, (_req, res) => {
    nestedCountersInstance.countEvent('sync2', 'cycle-storage-health')

    try {
      const health = checkCycleStorageHealth()
      const validationStatus = {
        allCyclesValid: true, // Would need actual validation
        invalidCycles: [] as number[],
        chainIntegrity: 'intact' as 'intact' | 'broken',
      }

      // Validate chain integrity
      for (let i = 1; i < CycleChain.cycles.length; i++) {
        const current = CycleChain.cycles[i]
        const previous = CycleChain.cycles[i - 1]

        const previousMarker = CycleChain.computeCycleMarker(previous)
        if (current.previous !== previousMarker) {
          validationStatus.allCyclesValid = false
          validationStatus.invalidCycles.push(current.counter)
          validationStatus.chainIntegrity = 'broken'
        }
      }

      const response = {
        isHealthy: health.isHealthy,
        hasRequiredHistory: health.hasRequiredHistory,
        consecutiveCycles: health.consecutiveCycles,
        gaps: health.gaps,
        validationStatus,
        storageStats: {
          cyclesInMemory: CycleChain.cycles.length,
          oldestCycle: CycleChain.oldest?.counter || 0,
          newestCycle: CycleChain.newest?.counter || 0,
          memoryUsageBytes: null, // Would need to calculate actual memory usage
        },
      }

      res.json(response)
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to check storage health',
        message: error.message,
      })
    }
  })

  /**
   * Get multiple cycle markers in batch
   */
  network.registerExternalGet('cycle-markers-batch', isDebugModeMiddlewareHigh, (req: Request, res: Response) => {
    nestedCountersInstance.countEvent('sync2', 'cycle-markers-batch')

    try {
      const start = parseInt(req.query.start as string) || 1
      const end = parseInt(req.query.end as string) || start + 10
      const maxRange = 100

      // Validate range
      if (end < start) {
        return res.status(400).json({ error: 'Invalid range: end must be >= start' })
      }

      if (end - start > maxRange) {
        return res.status(400).json({
          error: `Range too large. Maximum ${maxRange} cycles allowed`,
        })
      }

      const markers: { [key: string]: string } = {}
      const missing: number[] = []

      for (let i = start; i <= end; i++) {
        const cycle = CycleChain.cycles.find((c) => c.counter === i)
        if (cycle) {
          markers[i.toString()] = CycleChain.computeCycleMarker(cycle)
        } else {
          missing.push(i)
        }
      }

      res.json({ markers, missing })
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to get cycle markers',
        message: error.message,
      })
    }
  })
}
