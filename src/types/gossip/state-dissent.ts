// State hardening Phase 3 gossip message types

import { Signature } from '@shardeum-foundation/lib-crypto-utils'

/**
 * Message sent when multiple before-state hashes are observed for the same account in a transaction
 */
export interface StateBeforeDissentMessage {
  /** Transaction ID that has the conflicting before-states */
  txid: string
  /** Account ID with conflicting before-states */
  accountId: string
  /** Observed different hashes for the account before-state */
  observed: Array<{
    hash: string
    senderId: string
  }>
  /** Optional proof receipt if available */
  proofReceipt?: SignedReceiptRef
  /** Timestamp when conflict was detected */
  timestamp: number
  /** Message ID for deduplication */
  messageId?: string
}

/**
 * Message to propagate verified correct state with proof after resolution
 */
export interface StateCorrectionMessage {
  /** Account ID being corrected */
  accountId: string
  /** The correct state hash */
  correctStateHash: string
  /** The correct state data (optional for bandwidth) */
  correctData?: WrappedData
  /** Receipt reference proving the correct state */
  receiptRef: SignedReceiptRef
  /** Timestamp of correction */
  timestamp: number
  /** Message ID for deduplication */
  messageId?: string
}

/**
 * Reference to a signed receipt (minimal data for gossip)
 */
export interface SignedReceiptRef {
  /** Transaction ID */
  txid: string
  /** Cycle number */
  cycle: number
  /** Receipt hash */
  receiptHash: string
  /** Signatures from consensus nodes */
  signatures: Array<{
    nodeId: string
    sig: string | Signature
  }>
}

/**
 * Minimal wrapped data for state corrections
 */
export interface WrappedData {
  accountId: string
  stateId: string
  data: unknown
  timestamp: number
}

/**
 * Gossip payload wrapper for state dissent messages
 */
export interface StateDissentGossipPayload {
  type: 'state-before-dissent' | 'state-correction'
  data: StateBeforeDissentMessage | StateCorrectionMessage
  sign?: Signature
}

/**
 * Rate limiter state for dissent gossip
 */
export interface DissentGossipRateLimiterState {
  /** Per-transaction emission budget */
  perTxBudget: Map<string, number>
  /** Global rate limit bucket */
  globalBucket: {
    tokens: number
    lastRefill: number
  }
  /** LRU cache of seen message IDs */
  seenMessages: Set<string>
  /** Timestamps for cache expiration */
  messageTimestamps: Map<string, number>
}

/**
 * Configuration for dissent gossip rate limiting
 */
export interface DissentGossipRateLimiterConfig {
  /** Max dissent messages per transaction */
  maxPerTx: number
  /** Max global dissent messages per second */
  globalRatePerSecond: number
  /** Max corrections per account per time window */  
  maxCorrectionsPerAccount: number
  /** Time window for corrections (ms) */
  correctionTimeWindow: number
  /** Message TTL in cache (ms) */
  messageTTL: number
  /** Max cache size */
  maxCacheSize: number
}