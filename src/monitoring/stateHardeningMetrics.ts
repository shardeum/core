import { nestedCountersInstance } from '../utils/nestedCounters'
import { shardusGetTime } from '../network'
import { ResolutionSource } from '../types/stateHardening'

/**
 * Metrics summary for state hardening
 */
export interface MetricsSummary {
  phase1: {
    conflictsDetected: number
    spreadMessagesReceived: number
    spreadMessagesSent: number
  }
  phase2: {
    cacheHits: number
    cacheMisses: number
    archiverQueries: number
    archiverSuccesses: number
    resolutionsBySource: Record<ResolutionSource, number>
    transactionsRequeued: number
  }
  phase3: {
    dissentsEmitted: number
    dissentsReceived: number
    dissentsDropped: number
    correctionsEmitted: number
    correctionsReceived: number
    correctionsApplied: number
    rateLimitHits: number
  }
  performance: {
    avgConflictDetectionTime: number
    avgResolutionTime: number
    avgGossipPropagationTime: number
  }
  errors: {
    validationErrors: number
    resolutionErrors: number
    gossipErrors: number
  }
}

/**
 * Centralized metrics collector for state hardening functionality
 */
export class StateHardeningMetrics {
  private metrics: Map<string, number>
  private timings: Map<string, number[]>
  private startTimes: Map<string, number>
  private readonly maxTimingSamples = 1000

  constructor() {
    this.metrics = new Map()
    this.timings = new Map()
    this.startTimes = new Map()
  }

  /**
   * Record that a conflict was detected
   */
  recordConflictDetected(accountId: string, _txId: string): void {
    this.increment('phase1.conflictsDetected')
    this.increment(`phase1.conflicts.${accountId.slice(0, 8)}`)
    
    nestedCountersInstance.countEvent('stateHardening', 'conflict.detected')
  }

  /**
   * Record a conflict resolution attempt
   */
  recordResolution(source: ResolutionSource, success: boolean): void {
    if (success) {
      this.increment(`phase2.resolutions.${source}`)
      this.increment('phase2.resolutions.total')
    } else {
      this.increment(`phase2.resolutions.failed.${source}`)
    }

    nestedCountersInstance.countEvent('stateHardening', `resolution.${source}.${success ? 'success' : 'failed'}`)
  }

  /**
   * Record a gossip message
   */
  recordGossipMessage(type: 'dissent' | 'correction', direction: 'sent' | 'received', size: number): void {
    const metricKey = `phase3.${type}.${direction}`
    this.increment(metricKey)
    this.increment(`phase3.${type}.bytes${direction === 'sent' ? 'Sent' : 'Received'}`, size)

    nestedCountersInstance.countEvent('stateHardening', `gossip.${type}.${direction}`)
  }

  /**
   * Record cache operations
   */
  recordCacheOperation(hit: boolean): void {
    if (hit) {
      this.increment('phase2.cache.hits')
    } else {
      this.increment('phase2.cache.misses')
    }
  }

  /**
   * Record archiver query
   */
  recordArchiverQuery(success: boolean, duration: number): void {
    this.increment('phase2.archiver.queries')
    if (success) {
      this.increment('phase2.archiver.successes')
    }
    this.recordTiming('archiver.query', duration)
  }

  /**
   * Record transaction requeue
   */
  recordTransactionRequeue(txId: string, attempt: number): void {
    this.increment('phase2.transactions.requeued')
    this.increment(`phase2.requeueAttempts.${attempt}`)
    
    nestedCountersInstance.countEvent('stateHardening', `transaction.requeued.attempt${attempt}`)
  }

  /**
   * Record rate limit hit
   */
  recordRateLimitHit(type: 'dissent' | 'correction', reason: string): void {
    this.increment('phase3.rateLimits.total')
    this.increment(`phase3.rateLimits.${type}.${reason}`)
  }

  /**
   * Record validation error
   */
  recordValidationError(type: string): void {
    this.increment('errors.validation.total')
    this.increment(`errors.validation.${type}`)
  }

  /**
   * Record gossip applied
   */
  recordGossipApplied(type: 'dissent' | 'correction'): void {
    this.increment(`phase3.${type}.applied`)
  }

  /**
   * Start timing an operation
   */
  startTimer(operation: string): string {
    const timerId = `${operation}:${Date.now()}:${Math.random()}`
    this.startTimes.set(timerId, shardusGetTime())
    return timerId
  }

  /**
   * End timing an operation
   */
  endTimer(timerId: string): number {
    const startTime = this.startTimes.get(timerId)
    if (!startTime) {
      return 0
    }

    const duration = shardusGetTime() - startTime
    this.startTimes.delete(timerId)

    // Extract operation name from timerId
    const operation = timerId.split(':')[0]
    this.recordTiming(operation, duration)

    return duration
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(): MetricsSummary {
    return {
      phase1: {
        conflictsDetected: this.get('phase1.conflictsDetected'),
        spreadMessagesReceived: this.get('phase1.spread.received'),
        spreadMessagesSent: this.get('phase1.spread.sent')
      },
      phase2: {
        cacheHits: this.get('phase2.cache.hits'),
        cacheMisses: this.get('phase2.cache.misses'),
        archiverQueries: this.get('phase2.archiver.queries'),
        archiverSuccesses: this.get('phase2.archiver.successes'),
        resolutionsBySource: {
          'receipt-cache': this.get('phase2.resolutions.receipt-cache'),
          'archiver': this.get('phase2.resolutions.archiver'),
          'local-consensus': this.get('phase2.resolutions.local-consensus'),
          'gossip': this.get('phase2.resolutions.gossip')
        },
        transactionsRequeued: this.get('phase2.transactions.requeued')
      },
      phase3: {
        dissentsEmitted: this.get('phase3.dissent.sent'),
        dissentsReceived: this.get('phase3.dissent.received'),
        dissentsDropped: this.get('phase3.dissent.dropped'),
        correctionsEmitted: this.get('phase3.correction.sent'),
        correctionsReceived: this.get('phase3.correction.received'),
        correctionsApplied: this.get('phase3.correction.applied'),
        rateLimitHits: this.get('phase3.rateLimits.total')
      },
      performance: {
        avgConflictDetectionTime: this.getAverageTiming('conflict.detection'),
        avgResolutionTime: this.getAverageTiming('conflict.resolution'),
        avgGossipPropagationTime: this.getAverageTiming('gossip.propagation')
      },
      errors: {
        validationErrors: this.get('errors.validation.total'),
        resolutionErrors: this.get('errors.resolution.total'),
        gossipErrors: this.get('errors.gossip.total')
      }
    }
  }

  /**
   * Get detailed metrics for a specific phase
   */
  getPhaseMetrics(phase: 1 | 2 | 3): Record<string, number> {
    const phaseKey = `phase${phase}`
    const phaseMetrics: Record<string, number> = {}

    for (const [key, value] of this.metrics.entries()) {
      if (key.startsWith(phaseKey)) {
        // eslint-disable-next-line security/detect-object-injection
        phaseMetrics[key] = value
      }
    }

    return phaseMetrics
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear()
    this.timings.clear()
    this.startTimes.clear()
  }

  /**
   * Export metrics for external monitoring
   */
  exportMetrics(): Record<string, unknown> {
    const exported: Record<string, unknown> = {
      counters: Object.fromEntries(this.metrics),
      timings: {},
      summary: this.getMetricsSummary()
    }

    // Export timing percentiles
    for (const [operation, samples] of this.timings.entries()) {
      if (samples.length > 0) {
        // eslint-disable-next-line security/detect-object-injection
        (exported.timings as any)[operation] = {
          count: samples.length,
          avg: this.average(samples),
          p50: this.percentile(samples, 50),
          p95: this.percentile(samples, 95),
          p99: this.percentile(samples, 99)
        }
      }
    }

    return exported
  }

  // Private helper methods

  private increment(key: string, amount = 1): void {
    const current = this.metrics.get(key) || 0
    this.metrics.set(key, current + amount)
  }

  private get(key: string): number {
    return this.metrics.get(key) || 0
  }

  private recordTiming(operation: string, duration: number): void {
    let samples = this.timings.get(operation)
    if (!samples) {
      samples = []
      this.timings.set(operation, samples)
    }

    samples.push(duration)

    // Keep only recent samples
    if (samples.length > this.maxTimingSamples) {
      samples.shift()
    }
  }

  private getAverageTiming(operation: string): number {
    const samples = this.timings.get(operation)
    if (!samples || samples.length === 0) {
      return 0
    }
    return this.average(samples)
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0
    return values.reduce((sum, val) => sum + val, 0) / values.length
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const index = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.max(0, index)]
  }
}

// Singleton instance
export const stateHardeningMetrics = new StateHardeningMetrics()