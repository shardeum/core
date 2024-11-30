import { P2P } from '@shardus/types'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { logger } from './Context'
import { Utils } from '@shardus/types'

const p2pLogger = logger.getLogger('p2p')

export interface NodeAgeModifier {
  // Allow apps to provide custom age calculation logic
  getEffectiveAge(nodeId: string, actualAge: number): number;
}

export interface NodeRotationConfig {
  ageModifier?: NodeAgeModifier;  // Optional to maintain backward compatibility
}

// Global instance of the rotation config
let rotationConfig: NodeRotationConfig = {}
let lastAgeCalculationTime: { [nodeId: string]: number } = {}
let lastEffectiveAge: { [nodeId: string]: number } = {}

export function setRotationConfig(config: NodeRotationConfig) {
  p2pLogger.info('Setting new rotation config:', Utils.safeStringify(config))
  rotationConfig = config
}

export function getEffectiveAge(nodeId: string, actualAge: number): number {
  const now = Date.now()
  
  // Track frequency of age calculations per node
  const lastCalc = lastAgeCalculationTime[nodeId] || 0
  const timeSinceLastCalc = now - lastCalc
  if (timeSinceLastCalc < 1000) { // If called more than once per second
    p2pLogger.debug(`Frequent age calculations for node ${nodeId}: ${timeSinceLastCalc}ms since last call`)
    nestedCountersInstance.countEvent('p2p', 'frequent-age-calculations')
  }
  lastAgeCalculationTime[nodeId] = now

  if (rotationConfig.ageModifier) {
    try {
      const start = now
      const effectiveAge = rotationConfig.ageModifier.getEffectiveAge(nodeId, actualAge)
      const duration = Date.now() - start
      
      // Log significant age modifications
      if (Math.abs(effectiveAge - actualAge) > actualAge * 0.5) {
        p2pLogger.info(`Large age modification for node ${nodeId}: actual=${actualAge}, effective=${effectiveAge}`)
        nestedCountersInstance.countEvent('p2p', 'large-age-modification')
      }

      // Track sudden changes in effective age
      const lastAge = lastEffectiveAge[nodeId]
      if (lastAge !== undefined) {
        const ageDiff = Math.abs(effectiveAge - lastAge)
        if (ageDiff > lastAge * 0.2) { // >20% change since last calculation
          p2pLogger.warn(`Sudden effective age change for node ${nodeId}: was=${lastAge}, now=${effectiveAge}`)
          nestedCountersInstance.countEvent('p2p', 'sudden-age-change')
        }
      }
      lastEffectiveAge[nodeId] = effectiveAge

      // Performance tracking
      if (duration > 100) {
        p2pLogger.warn(`Slow age calculation for node ${nodeId}: ${duration}ms`)
        nestedCountersInstance.countEvent('p2p', 'slow-age-calculation')
      }

      // Log all calculations at debug level for analysis
      p2pLogger.debug('Age calculation:', {
        nodeId,
        actualAge,
        effectiveAge,
        duration,
        timeSinceLastCalc
      })

      return effectiveAge
    } catch (err) {
      p2pLogger.error(`Error calculating effective age for node ${nodeId}:`, err)
      nestedCountersInstance.countEvent('p2p', 'age-calculation-error')
      
      // Log error details for debugging
      if (err instanceof Error) {
        p2pLogger.error('Error stack:', err.stack)
      }
      
      return actualAge
    }
  }
  return actualAge
}

// Helper function to sort nodes by effective age
export function compareNodesByEffectiveAge(a: P2P.NodeListTypes.Node, b: P2P.NodeListTypes.Node): number {
  const now = Date.now() / 1000 // Convert to seconds to match timestamps
  const aAge = now - a.activeTimestamp
  const bAge = now - b.activeTimestamp
  
  const aEffectiveAge = getEffectiveAge(a.id, aAge)
  const bEffectiveAge = getEffectiveAge(b.id, bAge)

  // Log all comparisons at debug level
  p2pLogger.debug('Age comparison:', {
    nodeA: { id: a.id, actualAge: aAge, effectiveAge: aEffectiveAge },
    nodeB: { id: b.id, actualAge: bAge, effectiveAge: bEffectiveAge }
  })

  // Log potential sorting inconsistencies
  if (Math.abs(aEffectiveAge - bEffectiveAge) < 0.001) {
    p2pLogger.debug(`Near-equal effective ages for nodes ${a.id} and ${b.id}: ${aEffectiveAge} vs ${bEffectiveAge}`)
    nestedCountersInstance.countEvent('p2p', 'near-equal-effective-ages')
  }

  // Log age inversions (where effective age order differs from actual age order)
  if ((aAge > bAge && aEffectiveAge < bEffectiveAge) || 
      (aAge < bAge && aEffectiveAge > bEffectiveAge)) {
    p2pLogger.info('Age inversion detected:', {
      nodeA: { id: a.id, actualAge: aAge, effectiveAge: aEffectiveAge },
      nodeB: { id: b.id, actualAge: bAge, effectiveAge: bEffectiveAge }
    })
    nestedCountersInstance.countEvent('p2p', 'age-inversion')
  }

  // Primary sort by effective age
  if (aEffectiveAge !== bEffectiveAge) {
    return aEffectiveAge - bEffectiveAge
  }
  
  // Secondary sort by ID for deterministic ordering when ages are equal
  return a.id.localeCompare(b.id)
} 