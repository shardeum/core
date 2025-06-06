import { P2P } from '@shardeum-foundation/lib-types'
import * as zlib from 'zlib'

export interface NodeMetrics {
  consecutiveRefutes: number
  refutePercentage: number
  lastCalculatedCycle: number
}

export class ProblematicNodeCache {
  refuteHistory: Map<string, number[]>
  nodeMetrics: Map<string, NodeMetrics>
  lastProcessedCycle: number
  private config: any

  constructor(config: any) {
    this.config = config
    this.refuteHistory = new Map()
    this.nodeMetrics = new Map()
    this.lastProcessedCycle = 0
  }

  buildFromCycles(cycles: P2P.CycleCreatorTypes.CycleRecord[]): void {
    // Validate cycle order
    for (let i = 1; i < cycles.length; i++) {
      if (cycles[i].counter < cycles[i - 1].counter) {
        throw new Error('Cycles must be in ascending order')
      }
    }

    // Clear existing data
    this.refuteHistory.clear()
    this.nodeMetrics.clear()
    this.lastProcessedCycle = 0

    // Track processed cycles to handle duplicates
    const processedCycles = new Set<number>()

    for (const cycle of cycles) {
      // Skip duplicate cycle numbers
      if (processedCycles.has(cycle.counter)) {
        continue
      }
      processedCycles.add(cycle.counter)

      if (cycle.refuted && cycle.refuted.length > 0) {
        // Handle duplicate entries within a cycle
        const uniqueRefuted = [...new Set(cycle.refuted)]
        
        for (const nodeId of uniqueRefuted) {
          if (!this.refuteHistory.has(nodeId)) {
            this.refuteHistory.set(nodeId, [])
          }
          this.refuteHistory.get(nodeId)!.push(cycle.counter)
        }
      }

      this.lastProcessedCycle = cycle.counter
    }

    // Prune if needed based on history length
    if (cycles.length > 0) {
      this.prune(this.lastProcessedCycle)
    }
  }

  addCycle(cycle: P2P.CycleCreatorTypes.CycleRecord, autoPrune: boolean = false): void {
    // Validate cycle number
    if (cycle.counter <= this.lastProcessedCycle) {
      throw new Error(`Cannot add cycle ${cycle.counter}, last processed cycle is ${this.lastProcessedCycle}`)
    }

    // Add refuted nodes
    if (cycle.refuted && cycle.refuted.length > 0) {
      const uniqueRefuted = [...new Set(cycle.refuted)]
      
      for (const nodeId of uniqueRefuted) {
        if (!this.refuteHistory.has(nodeId)) {
          this.refuteHistory.set(nodeId, [])
        }
        this.refuteHistory.get(nodeId)!.push(cycle.counter)
      }

      // Clear all metrics when new data is added
      this.nodeMetrics.clear()
    }

    this.lastProcessedCycle = cycle.counter

    // Auto-prune if requested
    if (autoPrune) {
      this.prune(cycle.counter)
    }
  }

  prune(currentCycle: number): void {
    const historyLength = this.config.p2p.problematicNodeHistoryLength
    if (historyLength <= 0) {
      this.refuteHistory.clear()
      this.nodeMetrics.clear()
      return
    }

    const cutoffCycle = currentCycle - historyLength

    // Prune refute history
    const nodesToRemove: string[] = []
    
    for (const [nodeId, cycles] of this.refuteHistory) {
      const prunedCycles = cycles.filter(cycle => cycle > cutoffCycle)
      
      if (prunedCycles.length === 0) {
        nodesToRemove.push(nodeId)
      } else {
        this.refuteHistory.set(nodeId, prunedCycles)
      }
    }

    // Remove nodes with no refutes
    for (const nodeId of nodesToRemove) {
      this.refuteHistory.delete(nodeId)
      this.nodeMetrics.delete(nodeId)
    }
  }

  pruneInactiveNodes(activeNodes: Set<string>): void {
    const nodesToRemove: string[] = []
    
    for (const nodeId of this.refuteHistory.keys()) {
      if (!activeNodes.has(nodeId)) {
        nodesToRemove.push(nodeId)
      }
    }

    for (const nodeId of nodesToRemove) {
      this.refuteHistory.delete(nodeId)
      this.nodeMetrics.delete(nodeId)
    }
  }

  calculateNodeMetrics(nodeId: string, currentCycle: number): NodeMetrics {
    // Check if we have cached metrics that are still valid
    const cached = this.nodeMetrics.get(nodeId)
    if (cached && cached.lastCalculatedCycle === currentCycle) {
      return cached
    }

    const refuteCycles = this.refuteHistory.get(nodeId) || []
    
    // Calculate consecutive refutes
    const consecutiveRefutes = this.getConsecutiveRefutes(refuteCycles, currentCycle)
    
    // Calculate refute percentage
    const refutePercentage = this.getRefutePercentage(refuteCycles, currentCycle)

    const metrics: NodeMetrics = {
      consecutiveRefutes,
      refutePercentage,
      lastCalculatedCycle: currentCycle
    }

    // Cache the metrics
    this.nodeMetrics.set(nodeId, metrics)

    return metrics
  }

  private getConsecutiveRefutes(refuteCycles: number[], currentCycle: number): number {
    if (refuteCycles.length === 0) return 0

    // Filter to only include refutes up to current cycle
    const relevantRefutes = refuteCycles.filter(cycle => cycle <= currentCycle)
    if (relevantRefutes.length === 0) return 0

    // Count consecutive refutes ending at current cycle or one before
    let count = 0
    const sortedRefutes = [...relevantRefutes].sort((a, b) => a - b)
    
    // Start from the end and count backwards
    for (let i = sortedRefutes.length - 1; i >= 0; i--) {
      const cycle = sortedRefutes[i]
      
      if (i === sortedRefutes.length - 1) {
        // Last refute must be at current cycle or one before
        if (cycle === currentCycle || cycle === currentCycle - 1) {
          count = 1
        } else {
          break
        }
      } else {
        // Check if consecutive with next cycle
        const nextCycle = sortedRefutes[i + 1]
        if (cycle === nextCycle - 1) {
          count++
        } else {
          break
        }
      }
    }

    return count
  }

  private getRefutePercentage(refuteCycles: number[], currentCycle: number): number {
    const historyLength = this.config.p2p.problematicNodeHistoryLength
    const windowStart = Math.max(1, currentCycle - historyLength + 1)
    const windowSize = Math.min(historyLength, currentCycle)
    
    const recentRefutes = refuteCycles.filter(cycle => cycle >= windowStart && cycle <= currentCycle).length

    return windowSize > 0 ? recentRefutes / windowSize : 0
  }

  getProblematicNodes(currentCycle: number, activeNodes: Set<string>): string[] {
    const problematicNodes: Array<{ id: string; score: number }> = []

    for (const nodeId of activeNodes) {
      const metrics = this.calculateNodeMetrics(nodeId, currentCycle)
      
      if (this.isProblematic(metrics)) {
        problematicNodes.push({
          id: nodeId,
          score: metrics.refutePercentage
        })
      }
    }

    // Sort by score and return top N based on maxProblematicNodeRemovalsPerCycle
    const maxRemovals = this.config.p2p.maxProblematicNodeRemovalsPerCycle || 1
    
    return problematicNodes
      .sort((a, b) => b.score - a.score)
      .slice(0, maxRemovals)
      .map(n => n.id)
  }

  private isProblematic(metrics: NodeMetrics): boolean {
    const consecutiveThreshold = this.config.p2p.problematicNodeConsecutiveRefuteThreshold
    const percentageThreshold = this.config.p2p.problematicNodeRefutePercentageThreshold

    return (
      metrics.consecutiveRefutes >= consecutiveThreshold ||
      metrics.refutePercentage >= percentageThreshold
    )
  }

  clearNodeMetrics(nodeId: string): void {
    this.nodeMetrics.delete(nodeId)
  }

  getMemoryUsage(): number {
    // Estimate memory usage
    let size = 0
    
    // Refute history
    for (const [nodeId, cycles] of this.refuteHistory) {
      size += nodeId.length * 2 // String characters
      size += cycles.length * 8 // Numbers
    }
    
    // Node metrics
    size += this.nodeMetrics.size * 32 // Rough estimate per metrics object
    
    return size
  }

  toJSON(): string {
    const data = {
      version: 1,
      lastProcessedCycle: this.lastProcessedCycle,
      refuteHistory: Object.fromEntries(this.refuteHistory)
    }
    
    return JSON.stringify(data)
  }

  toCompressedJSON(): string {
    const json = this.toJSON()
    return zlib.gzipSync(json).toString('base64')
  }

  static fromJSON(json: string, config: any): ProblematicNodeCache {
    if (!json) {
      throw new Error('Invalid cache data')
    }

    let data: any
    try {
      data = JSON.parse(json)
    } catch (e) {
      throw new Error('Invalid JSON format')
    }

    if (!data.version || data.version !== 1) {
      throw new Error(`Unsupported cache version: ${data.version}`)
    }

    if (typeof data.lastProcessedCycle !== 'number') {
      throw new Error('Invalid cache data: missing or invalid lastProcessedCycle')
    }

    const cache = new ProblematicNodeCache(config)
    cache.lastProcessedCycle = data.lastProcessedCycle

    if (data.refuteHistory) {
      for (const [nodeId, cycles] of Object.entries(data.refuteHistory)) {
        if (Array.isArray(cycles)) {
          cache.refuteHistory.set(nodeId, cycles)
        }
      }
    }

    return cache
  }
}