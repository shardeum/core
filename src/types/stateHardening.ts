/**
 * Improved type safety for state hardening with discriminated unions
 */

import { SignedReceipt } from '../state-manager/state-manager-types'

/**
 * Conflict detection result with discriminated union
 */
export type ConflictDetectionResult = 
  | { type: 'no-conflict'; accountId: string }
  | { type: 'conflict-detected'; accountId: string; observedHashes: string[]; observerCount: number }
  | { type: 'insufficient-data'; accountId: string; reason: string }

/**
 * Conflict resolution result with discriminated union
 */
export type ConflictResolutionResult = 
  | { type: 'resolved'; receipt: SignedReceipt; source: ResolutionSource; correctHash: string }
  | { type: 'unresolved'; attempts: number; lastError?: string }
  | { type: 'error'; error: Error }

/**
 * Resolution sources
 */
export type ResolutionSource = 'receipt-cache' | 'archiver' | 'local-consensus' | 'gossip'

/**
 * Gossip emission result
 */
export type GossipEmissionResult =
  | { type: 'emitted'; messageId: string; recipients: number }
  | { type: 'rate-limited'; reason: 'per-tx' | 'global' | 'per-account' }
  | { type: 'skipped'; reason: string }
  | { type: 'error'; error: Error }

/**
 * State validation result
 */
export type StateValidationResult =
  | { type: 'valid'; hash: string }
  | { type: 'mismatch'; expected: string; actual: string; stage: ValidationStage }
  | { type: 'missing'; accountId: string }
  | { type: 'error'; error: Error }

export type ValidationStage = 'before-state' | 'after-state' | 'receipt-validation'

/**
 * Transaction requeue result
 */
export type TransactionRequeueResult =
  | { type: 'requeued'; attempt: number; delayMs: number }
  | { type: 'max-attempts-reached'; attempts: number }
  | { type: 'skipped'; reason: string }
  | { type: 'error'; error: Error }

/**
 * Archiver query result
 */
export type ArchiverQueryResult =
  | { type: 'success'; receipt: SignedReceipt; archiverId: string }
  | { type: 'not-found'; queriedArchivers: number }
  | { type: 'no-archivers'; }
  | { type: 'error'; error: Error; failedArchivers: string[] }

/**
 * State correction application result
 */
export type StateCorrectionResult =
  | { type: 'applied'; accountId: string; newHash: string; source: 'gossip' | 'local' }
  | { type: 'already-correct'; accountId: string; hash: string }
  | { type: 'validation-failed'; reason: string }
  | { type: 'error'; error: Error }

/**
 * Before-state consensus status
 */
export type BeforeStateConsensusStatus =
  | { type: 'unanimous'; hash: string; observerCount: number }
  | { type: 'majority'; majorityHash: string; distribution: Record<string, number> }
  | { type: 'split'; hashes: string[]; distribution: Record<string, number> }
  | { type: 'insufficient-observers'; observerCount: number; required: number }

/**
 * Rate limiter decision
 */
export type RateLimiterDecision =
  | { type: 'allowed'; tokensRemaining: number }
  | { type: 'denied'; reason: 'global-limit' | 'per-tx-limit' | 'per-account-limit'; retryAfter: number }
  | { type: 'disabled' }

/**
 * Message validation result with specific errors
 */
export type MessageValidationResult =
  | { type: 'valid' }
  | { type: 'invalid-structure'; missingFields: string[] }
  | { type: 'invalid-signature'; reason: string }
  | { type: 'invalid-proof'; proofErrors: string[] }
  | { type: 'expired'; messageAge: number; maxAge: number }
  | { type: 'insufficient-observers'; actual: number; required: number }

/**
 * Spread factor calculation result
 */
export type SpreadFactorResult =
  | { type: 'targets-calculated'; nodeIndices: number[]; spreadFactor: number }
  | { type: 'invalid-params'; reason: string }
  | { type: 'error'; error: Error }

/**
 * State hardening phase status
 */
export interface StateHardeningPhaseStatus {
  phase1: {
    enabled: boolean
    conflictsDetected: number
    spreadFactor: number
  }
  phase2: {
    enabled: boolean
    receiptsBuffered: number
    archiversQueried: number
    conflictsResolved: number
  }
  phase3: {
    enabled: boolean
    dissentsEmitted: number
    correctionsEmitted: number
    rateLimitingActive: boolean
  }
}

/**
 * Helper functions for working with discriminated unions
 */
export const StateHardeningHelpers = {
  isConflictDetected(result: ConflictDetectionResult): result is Extract<ConflictDetectionResult, { type: 'conflict-detected' }> {
    return result.type === 'conflict-detected'
  },

  isResolved(result: ConflictResolutionResult): result is Extract<ConflictResolutionResult, { type: 'resolved' }> {
    return result.type === 'resolved'
  },

  isRateLimited(result: GossipEmissionResult): result is Extract<GossipEmissionResult, { type: 'rate-limited' }> {
    return result.type === 'rate-limited'
  },

  isValidState(result: StateValidationResult): result is Extract<StateValidationResult, { type: 'valid' }> {
    return result.type === 'valid'
  },

  canRequeue(result: TransactionRequeueResult): boolean {
    return result.type === 'requeued' || result.type === 'skipped'
  },

  hasConsensus(status: BeforeStateConsensusStatus): boolean {
    return status.type === 'unanimous' || status.type === 'majority'
  },

  extractError(result: { type: string; error?: Error }): Error | undefined {
    return result.type === 'error' ? result.error : undefined
  }
}