/**
 * Custom error types for state hardening functionality
 * These provide specific error context for different failure scenarios
 */

/**
 * Base error class for all state hardening errors
 */
export class StateHardeningError extends Error {
  constructor(message: string, public readonly context?: Record<string, unknown>) {
    super(message)
    this.name = 'StateHardeningError'
    Object.setPrototypeOf(this, StateHardeningError.prototype)
  }
}

/**
 * Error thrown when a state conflict is detected
 */
export class StateConflictError extends StateHardeningError {
  constructor(
    public readonly txid: string,
    public readonly accountId: string,
    public readonly observedHashes: string[],
    message?: string
  ) {
    super(
      message || `State conflict detected for account ${accountId} in transaction ${txid}`,
      { txid, accountId, observedHashes }
    )
    this.name = 'StateConflictError'
    Object.setPrototypeOf(this, StateConflictError.prototype)
  }
}

/**
 * Error thrown when dissent message validation fails
 */
export class DissentValidationError extends StateHardeningError {
  constructor(
    public readonly reason: string,
    public readonly messageType: 'dissent' | 'correction',
    context?: Record<string, unknown>
  ) {
    super(
      `${messageType} message validation failed: ${reason}`,
      { ...context, messageType, reason }
    )
    this.name = 'DissentValidationError'
    Object.setPrototypeOf(this, DissentValidationError.prototype)
  }
}

/**
 * Error thrown when receipt resolution fails
 */
export class ReceiptResolutionError extends StateHardeningError {
  constructor(
    public readonly txid: string,
    public readonly source: 'cache' | 'archiver' | 'local',
    public readonly reason: string
  ) {
    super(
      `Failed to resolve receipt for ${txid} from ${source}: ${reason}`,
      { txid, source, reason }
    )
    this.name = 'ReceiptResolutionError'
    Object.setPrototypeOf(this, ReceiptResolutionError.prototype)
  }
}

/**
 * Error thrown when archiver query fails
 */
export class ArchiverQueryError extends StateHardeningError {
  constructor(
    public readonly archiverId: string,
    public readonly queryType: string,
    public readonly reason: string
  ) {
    super(
      `Archiver query failed on ${archiverId}: ${reason}`,
      { archiverId, queryType, reason }
    )
    this.name = 'ArchiverQueryError'
    Object.setPrototypeOf(this, ArchiverQueryError.prototype)
  }
}

/**
 * Error thrown when gossip rate limit is exceeded
 */
export class GossipRateLimitError extends StateHardeningError {
  constructor(
    public readonly limitType: 'per-tx' | 'global' | 'per-account',
    public readonly identifier: string,
    public readonly limit: number
  ) {
    super(
      `Gossip rate limit exceeded for ${limitType}: ${identifier} (limit: ${limit})`,
      { limitType, identifier, limit }
    )
    this.name = 'GossipRateLimitError'
    Object.setPrototypeOf(this, GossipRateLimitError.prototype)
  }
}

/**
 * Error thrown when transaction requeue fails
 */
export class TransactionRequeueError extends StateHardeningError {
  constructor(
    public readonly txid: string,
    public readonly attemptNumber: number,
    public readonly maxAttempts: number,
    public readonly reason: string
  ) {
    super(
      `Failed to requeue transaction ${txid} (attempt ${attemptNumber}/${maxAttempts}): ${reason}`,
      { txid, attemptNumber, maxAttempts, reason }
    )
    this.name = 'TransactionRequeueError'
    Object.setPrototypeOf(this, TransactionRequeueError.prototype)
  }
}

/**
 * Error thrown when state validation fails
 */
export class StateValidationError extends StateHardeningError {
  constructor(
    public readonly accountId: string,
    public readonly expectedHash: string,
    public readonly actualHash: string,
    public readonly validationStage: 'before' | 'after' | 'receipt'
  ) {
    super(
      `State validation failed for ${accountId} at ${validationStage} stage`,
      { accountId, expectedHash, actualHash, validationStage }
    )
    this.name = 'StateValidationError'
    Object.setPrototypeOf(this, StateValidationError.prototype)
  }
}

/**
 * Error thrown when consensus cannot be reached
 */
export class ConsensusFailureError extends StateHardeningError {
  constructor(
    public readonly txid: string,
    public readonly reason: string,
    public readonly voteCounts?: Record<string, number>
  ) {
    super(
      `Consensus failure for transaction ${txid}: ${reason}`,
      { txid, reason, voteCounts }
    )
    this.name = 'ConsensusFailureError'
    Object.setPrototypeOf(this, ConsensusFailureError.prototype)
  }
}

/**
 * Error thrown when spread factor calculation fails
 */
export class SpreadFactorError extends StateHardeningError {
  constructor(
    public readonly ourIndex: number,
    public readonly groupSize: number,
    public readonly spreadFactor: number,
    public readonly reason: string
  ) {
    super(
      `Spread factor calculation failed: ${reason}`,
      { ourIndex, groupSize, spreadFactor, reason }
    )
    this.name = 'SpreadFactorError'
    Object.setPrototypeOf(this, SpreadFactorError.prototype)
  }
}

/**
 * Error thrown when message factory fails to create a message
 */
export class MessageCreationError extends StateHardeningError {
  constructor(
    public readonly messageType: 'dissent' | 'correction' | 'receipt-ref',
    public readonly reason: string,
    context?: Record<string, unknown>
  ) {
    super(
      `Failed to create ${messageType} message: ${reason}`,
      { ...context, messageType, reason }
    )
    this.name = 'MessageCreationError'
    Object.setPrototypeOf(this, MessageCreationError.prototype)
  }
}

/**
 * Helper function to determine if an error is a state hardening error
 */
export function isStateHardeningError(error: unknown): error is StateHardeningError {
  return error instanceof StateHardeningError
}

/**
 * Helper function to extract error context safely
 */
export function getErrorContext(error: unknown): Record<string, unknown> {
  if (isStateHardeningError(error)) {
    return error.context || {}
  }
  return {}
}