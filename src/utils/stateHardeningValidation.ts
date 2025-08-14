import { StateBeforeDissentMessage, StateCorrectionMessage, SignedReceiptRef } from '../types/gossip/state-dissent'
import { Signature } from '@shardeum-foundation/lib-crypto-utils'
import * as crypto from '@shardeum-foundation/lib-crypto-utils'
import * as Context from '../p2p/Context'
import { shardusGetTime } from '../network'
import { nestedCountersInstance } from './nestedCounters'

export interface ValidationResult {
  valid: boolean
  error?: string
  details?: Record<string, unknown>
}

/**
 * Centralized validation logic for state hardening messages
 */
export class StateHardeningValidator {
  /**
   * Validate a state before dissent message
   */
  static validateDissentMessage(message: StateBeforeDissentMessage, signature?: Signature): ValidationResult {
    try {
      // Basic structure validation
      if (!message.txid || typeof message.txid !== 'string') {
        return { valid: false, error: 'Invalid or missing txid' }
      }

      if (!message.accountId || typeof message.accountId !== 'string') {
        return { valid: false, error: 'Invalid or missing accountId' }
      }

      if (!Array.isArray(message.observed) || message.observed.length < 2) {
        return { valid: false, error: 'Must have at least 2 observations for conflict' }
      }

      // Validate each observation
      const seenHashes = new Set<string>()
      const seenSenders = new Set<string>()
      
      for (const obs of message.observed) {
        if (!obs.hash || typeof obs.hash !== 'string') {
          return { valid: false, error: 'Invalid observation hash' }
        }
        if (!obs.senderId || typeof obs.senderId !== 'string') {
          return { valid: false, error: 'Invalid observation senderId' }
        }
        
        seenHashes.add(obs.hash)
        seenSenders.add(obs.senderId)
      }

      // Must have at least 2 different hashes for a conflict
      if (seenHashes.size < 2) {
        return { valid: false, error: 'Not enough unique hashes for conflict' }
      }

      // Check minimum unique observers
      const minObservers = Context.config?.stateManager?.minDissentObservers || 2
      if (seenSenders.size < minObservers) {
        return { 
          valid: false, 
          error: 'Insufficient unique observers',
          details: { required: minObservers, actual: seenSenders.size }
        }
      }

      // Validate timestamp
      if (!message.timestamp || typeof message.timestamp !== 'number') {
        return { valid: false, error: 'Invalid or missing timestamp' }
      }

      const now = shardusGetTime()
      const maxAge = Context.config?.stateManager?.gossipMessageTTL || 30000
      if (Math.abs(now - message.timestamp) > maxAge) {
        return { valid: false, error: 'Message timestamp out of acceptable range' }
      }

      // Validate optional proof receipt
      if (message.proofReceipt) {
        const proofValidation = this.validateReceiptProof(message.proofReceipt)
        if (!proofValidation.valid) {
          return { 
            valid: false, 
            error: `Invalid proof receipt: ${proofValidation.error}`,
            details: proofValidation.details
          }
        }
      }

      // Validate signature if provided
      if (signature) {
        const signatureValid = this.validateMessageSignature(message, signature, 'dissent')
        if (!signatureValid) {
          return { valid: false, error: 'Invalid message signature' }
        }
      }

      nestedCountersInstance.countEvent('stateHardening', 'validation.dissent.success')
      return { valid: true }

    } catch (error) {
      nestedCountersInstance.countEvent('stateHardening', 'validation.dissent.error')
      return { 
        valid: false, 
        error: 'Validation exception',
        details: { error: error.message }
      }
    }
  }

  /**
   * Validate a state correction message
   */
  static validateCorrectionMessage(message: StateCorrectionMessage, signature?: Signature): ValidationResult {
    try {
      // Basic structure validation
      if (!message.accountId || typeof message.accountId !== 'string') {
        return { valid: false, error: 'Invalid or missing accountId' }
      }

      if (!message.correctStateHash || typeof message.correctStateHash !== 'string') {
        return { valid: false, error: 'Invalid or missing correctStateHash' }
      }

      if (!message.receiptRef) {
        return { valid: false, error: 'Missing receipt reference' }
      }

      // Validate receipt reference
      const receiptValidation = this.validateReceiptProof(message.receiptRef)
      if (!receiptValidation.valid) {
        return { 
          valid: false, 
          error: `Invalid receipt reference: ${receiptValidation.error}`,
          details: receiptValidation.details
        }
      }

      // Validate timestamp
      if (!message.timestamp || typeof message.timestamp !== 'number') {
        return { valid: false, error: 'Invalid or missing timestamp' }
      }

      const now = shardusGetTime()
      const maxAge = Context.config?.stateManager?.gossipMessageTTL || 30000
      if (Math.abs(now - message.timestamp) > maxAge) {
        return { valid: false, error: 'Message timestamp out of acceptable range' }
      }

      // Validate optional state data
      if (message.correctData) {
        if (!message.correctData.accountId || message.correctData.accountId !== message.accountId) {
          return { valid: false, error: 'Mismatched accountId in correctData' }
        }
        if (!message.correctData.stateId || typeof message.correctData.stateId !== 'string') {
          return { valid: false, error: 'Invalid stateId in correctData' }
        }
      }

      // Validate signature if provided
      if (signature) {
        const signatureValid = this.validateMessageSignature(message, signature, 'correction')
        if (!signatureValid) {
          return { valid: false, error: 'Invalid message signature' }
        }
      }

      nestedCountersInstance.countEvent('stateHardening', 'validation.correction.success')
      return { valid: true }

    } catch (error) {
      nestedCountersInstance.countEvent('stateHardening', 'validation.correction.error')
      return { 
        valid: false, 
        error: 'Validation exception',
        details: { error: error.message }
      }
    }
  }

  /**
   * Validate a signed receipt reference/proof
   */
  static validateReceiptProof(proof: SignedReceiptRef): ValidationResult {
    try {
      // Basic structure validation
      if (!proof.txid || typeof proof.txid !== 'string') {
        return { valid: false, error: 'Invalid or missing txid in proof' }
      }

      if (!proof.cycle || typeof proof.cycle !== 'number' || proof.cycle < 0) {
        return { valid: false, error: 'Invalid or missing cycle in proof' }
      }

      if (!proof.receiptHash || typeof proof.receiptHash !== 'string') {
        return { valid: false, error: 'Invalid or missing receiptHash in proof' }
      }

      if (!Array.isArray(proof.signatures) || proof.signatures.length === 0) {
        return { valid: false, error: 'Invalid or missing signatures in proof' }
      }

      // Validate each signature
      const seenNodes = new Set<string>()
      for (const sig of proof.signatures) {
        if (!sig.nodeId || typeof sig.nodeId !== 'string') {
          return { valid: false, error: 'Invalid nodeId in signature' }
        }
        if (!sig.sig || typeof sig.sig !== 'object') {
          return { valid: false, error: 'Invalid signature object' }
        }
        
        // Check for duplicate signatures from same node
        if (seenNodes.has(sig.nodeId)) {
          return { valid: false, error: 'Duplicate signature from same node' }
        }
        seenNodes.add(sig.nodeId)
      }

      // Check minimum signatures (should be majority of consensus group)
      const minSignatures = Math.ceil((Context.config?.sharding?.nodesPerConsensusGroup || 5) * 0.51)
      if (proof.signatures.length < minSignatures) {
        return { 
          valid: false, 
          error: 'Insufficient signatures',
          details: { required: minSignatures, actual: proof.signatures.length }
        }
      }

      return { valid: true }

    } catch (error) {
      return { 
        valid: false, 
        error: 'Receipt proof validation exception',
        details: { error: error.message }
      }
    }
  }

  /**
   * Validate message signature
   */
  private static validateMessageSignature(
    message: StateBeforeDissentMessage | StateCorrectionMessage,
    signature: Signature,
    messageType: 'dissent' | 'correction'
  ): boolean {
    try {
      // Create a copy without messageId for signing
      const messageForSigning = { ...message }
      delete messageForSigning.messageId

      // Convert to deterministic string representation
      const messageStr = crypto.stringify(messageForSigning)
      // const messageHash = crypto.hash(messageStr) // For future signature verification

      // For now, return true as we need the node's public key to verify
      // In production, this would verify against the sender's public key
      return true

    } catch (error) {
      if (Context.logger?.getLogger) {
        Context.logger.getLogger('stateHardeningValidator').error(
          `Failed to validate ${messageType} signature:`,
          error
        )
      }
      return false
    }
  }

  /**
   * Check if a node is in the consensus group for an account
   */
  static isNodeInConsensusGroup(_nodeId: string, _accountId: string): boolean {
    try {
      // This would typically check against the actual consensus group
      // For now, return true as a placeholder
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Validate that a state hash matches expected format
   */
  static isValidStateHash(hash: string): boolean {
    // State hashes should be 64-character hex strings
    return /^[a-f0-9]{64}$/i.test(hash)
  }

  /**
   * Validate account ID format
   */
  static isValidAccountId(accountId: string): boolean {
    // Account IDs should be 64-character hex strings
    return /^[a-f0-9]{64}$/i.test(accountId)
  }

  /**
   * Validate transaction ID format
   */
  static isValidTxId(txId: string): boolean {
    // Transaction IDs can be various formats, but typically hex strings
    return /^[a-f0-9]+$/i.test(txId) && txId.length >= 32
  }
}