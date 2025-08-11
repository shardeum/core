import { nestedCountersInstance } from '../utils/nestedCounters'

export interface StateHardeningMetrics {
  // Conflict detection metrics
  beforeStateConflictsDetected: number
  beforeStateConflictsDetectedInVotes: number
  beforeStateConflictsResolved: number
  beforeStateConflictsDeferred: number
  
  // FACT spread metrics
  factSecondarySpreadAttempts: number
  factSecondarySpreadSuccess: number
  factSecondaryValidationSuccess: number
  
  // Dissent gossip metrics
  dissentGossipSent: number
  dissentGossipReceived: number
  dissentGossipCorroborated: number
  dissentGossipForwarded: number
  stateCorrectionSent: number
  stateCorrectionReceived: number
  
  // Resolution metrics
  resolutionFromCache: number
  resolutionFromArchiver: number
  resolutionFailed: number
  resolutionTimeTotal: number
  resolutionTimeAverage: number
  
  // Archiver query metrics
  archiverQueriesAttempted: number
  archiverQueriesSucceeded: number
  archiverQueriesFailed: number
  archiverQueryTimeTotal: number
  
  // Delay metrics
  txsDelayedForResolution: number
  txsDeferredAfterTimeout: number
  totalDelayTime: number
  averageDelayTime: number
  
  // Abstention metrics
  votesAbstainedDueToConflict: number
  receiptsNotProducedDueToConflict: number
}

export class StateHardeningTelemetry {
  private metrics: StateHardeningMetrics
  private startTime: number
  private resolutionCount: number
  private delayCount: number
  
  constructor() {
    this.metrics = {
      beforeStateConflictsDetected: 0,
      beforeStateConflictsDetectedInVotes: 0,
      beforeStateConflictsResolved: 0,
      beforeStateConflictsDeferred: 0,
      factSecondarySpreadAttempts: 0,
      factSecondarySpreadSuccess: 0,
      factSecondaryValidationSuccess: 0,
      dissentGossipSent: 0,
      dissentGossipReceived: 0,
      dissentGossipCorroborated: 0,
      dissentGossipForwarded: 0,
      stateCorrectionSent: 0,
      stateCorrectionReceived: 0,
      resolutionFromCache: 0,
      resolutionFromArchiver: 0,
      resolutionFailed: 0,
      resolutionTimeTotal: 0,
      resolutionTimeAverage: 0,
      archiverQueriesAttempted: 0,
      archiverQueriesSucceeded: 0,
      archiverQueriesFailed: 0,
      archiverQueryTimeTotal: 0,
      txsDelayedForResolution: 0,
      txsDeferredAfterTimeout: 0,
      totalDelayTime: 0,
      averageDelayTime: 0,
      votesAbstainedDueToConflict: 0,
      receiptsNotProducedDueToConflict: 0
    }
    this.startTime = Date.now()
    this.resolutionCount = 0
    this.delayCount = 0
  }
  
  recordConflictDetected(source: 'data-receipt' | 'votes'): void {
    if (source === 'data-receipt') {
      this.metrics.beforeStateConflictsDetected++
      nestedCountersInstance.countEvent('stateHardening', 'conflictDetectedDataReceipt')
    } else {
      this.metrics.beforeStateConflictsDetectedInVotes++
      nestedCountersInstance.countEvent('stateHardening', 'conflictDetectedInVotes')
    }
  }
  
  recordConflictResolved(source: 'cache' | 'archiver'): void {
    this.metrics.beforeStateConflictsResolved++
    if (source === 'cache') {
      this.metrics.resolutionFromCache++
      nestedCountersInstance.countEvent('stateHardening', 'resolvedFromCache')
    } else {
      this.metrics.resolutionFromArchiver++
      nestedCountersInstance.countEvent('stateHardening', 'resolvedFromArchiver')
    }
  }
  
  recordConflictDeferred(): void {
    this.metrics.beforeStateConflictsDeferred++
    this.metrics.txsDeferredAfterTimeout++
    nestedCountersInstance.countEvent('stateHardening', 'conflictDeferred')
  }
  
  recordFactSecondarySpread(success: boolean): void {
    this.metrics.factSecondarySpreadAttempts++
    if (success) {
      this.metrics.factSecondarySpreadSuccess++
      nestedCountersInstance.countEvent('stateHardening', 'factSecondarySpreadSuccess')
    }
  }
  
  recordFactSecondaryValidation(): void {
    this.metrics.factSecondaryValidationSuccess++
    nestedCountersInstance.countEvent('stateHardening', 'factSecondaryValidation')
  }
  
  recordDissentGossip(type: 'sent' | 'received' | 'corroborated' | 'forwarded'): void {
    switch (type) {
      case 'sent':
        this.metrics.dissentGossipSent++
        nestedCountersInstance.countEvent('stateHardening', 'dissentSent')
        break
      case 'received':
        this.metrics.dissentGossipReceived++
        nestedCountersInstance.countEvent('stateHardening', 'dissentReceived')
        break
      case 'corroborated':
        this.metrics.dissentGossipCorroborated++
        nestedCountersInstance.countEvent('stateHardening', 'dissentCorroborated')
        break
      case 'forwarded':
        this.metrics.dissentGossipForwarded++
        nestedCountersInstance.countEvent('stateHardening', 'dissentForwarded')
        break
    }
  }
  
  recordStateCorrection(type: 'sent' | 'received'): void {
    if (type === 'sent') {
      this.metrics.stateCorrectionSent++
      nestedCountersInstance.countEvent('stateHardening', 'correctionSent')
    } else {
      this.metrics.stateCorrectionReceived++
      nestedCountersInstance.countEvent('stateHardening', 'correctionReceived')
    }
  }
  
  recordResolutionTime(timeMs: number): void {
    this.metrics.resolutionTimeTotal += timeMs
    this.resolutionCount++
    this.metrics.resolutionTimeAverage = this.metrics.resolutionTimeTotal / this.resolutionCount
    nestedCountersInstance.countEvent('stateHardening', 'resolutionTime', timeMs)
  }
  
  recordArchiverQuery(success: boolean, timeMs: number): void {
    this.metrics.archiverQueriesAttempted++
    this.metrics.archiverQueryTimeTotal += timeMs
    if (success) {
      this.metrics.archiverQueriesSucceeded++
      nestedCountersInstance.countEvent('stateHardening', 'archiverQuerySuccess')
    } else {
      this.metrics.archiverQueriesFailed++
      nestedCountersInstance.countEvent('stateHardening', 'archiverQueryFailed')
    }
  }
  
  recordDelay(timeMs: number): void {
    this.metrics.txsDelayedForResolution++
    this.metrics.totalDelayTime += timeMs
    this.delayCount++
    this.metrics.averageDelayTime = this.metrics.totalDelayTime / this.delayCount
    nestedCountersInstance.countEvent('stateHardening', 'delayTime', timeMs)
  }
  
  recordAbstention(type: 'vote' | 'receipt'): void {
    if (type === 'vote') {
      this.metrics.votesAbstainedDueToConflict++
      nestedCountersInstance.countEvent('stateHardening', 'voteAbstained')
    } else {
      this.metrics.receiptsNotProducedDueToConflict++
      nestedCountersInstance.countEvent('stateHardening', 'receiptNotProduced')
    }
  }
  
  getMetrics(): StateHardeningMetrics {
    return { ...this.metrics }
  }
  
  getSummary(): string {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000)
    const hours = Math.floor(uptime / 3600)
    const minutes = Math.floor((uptime % 3600) / 60)
    
    return `State Hardening Metrics (${hours}h ${minutes}m):
    Conflicts: ${this.metrics.beforeStateConflictsDetected} detected, ${this.metrics.beforeStateConflictsResolved} resolved, ${this.metrics.beforeStateConflictsDeferred} deferred
    Resolution: ${this.metrics.resolutionFromCache} from cache, ${this.metrics.resolutionFromArchiver} from archiver
    FACT 2x: ${this.metrics.factSecondarySpreadSuccess}/${this.metrics.factSecondarySpreadAttempts} successful spreads
    Dissent: ${this.metrics.dissentGossipSent} sent, ${this.metrics.dissentGossipReceived} received, ${this.metrics.dissentGossipCorroborated} corroborated
    Delays: ${this.metrics.txsDelayedForResolution} txs delayed, avg ${Math.round(this.metrics.averageDelayTime)}ms
    Archiver: ${this.metrics.archiverQueriesSucceeded}/${this.metrics.archiverQueriesAttempted} successful queries
    Abstentions: ${this.metrics.votesAbstainedDueToConflict} votes, ${this.metrics.receiptsNotProducedDueToConflict} receipts`
  }
  
  reset(): void {
    this.metrics = {
      beforeStateConflictsDetected: 0,
      beforeStateConflictsDetectedInVotes: 0,
      beforeStateConflictsResolved: 0,
      beforeStateConflictsDeferred: 0,
      factSecondarySpreadAttempts: 0,
      factSecondarySpreadSuccess: 0,
      factSecondaryValidationSuccess: 0,
      dissentGossipSent: 0,
      dissentGossipReceived: 0,
      dissentGossipCorroborated: 0,
      dissentGossipForwarded: 0,
      stateCorrectionSent: 0,
      stateCorrectionReceived: 0,
      resolutionFromCache: 0,
      resolutionFromArchiver: 0,
      resolutionFailed: 0,
      resolutionTimeTotal: 0,
      resolutionTimeAverage: 0,
      archiverQueriesAttempted: 0,
      archiverQueriesSucceeded: 0,
      archiverQueriesFailed: 0,
      archiverQueryTimeTotal: 0,
      txsDelayedForResolution: 0,
      txsDeferredAfterTimeout: 0,
      totalDelayTime: 0,
      averageDelayTime: 0,
      votesAbstainedDueToConflict: 0,
      receiptsNotProducedDueToConflict: 0
    }
    this.startTime = Date.now()
    this.resolutionCount = 0
    this.delayCount = 0
  }
}

export const stateHardeningTelemetry = new StateHardeningTelemetry()