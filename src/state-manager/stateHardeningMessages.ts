import { 
  StateBeforeDissentMessage, 
  StateCorrectionMessage, 
  SignedReceiptRef,
  WrappedData 
} from '../types/gossip/state-dissent'
import { SignedReceipt } from './state-manager-types'
import { shardusGetTime } from '../network'
import * as crypto from '@shardeum-foundation/lib-crypto-utils'
import { BeforeStateObservation } from '../types/state-manager'

/**
 * Factory for creating state hardening messages with consistent structure
 */
export class StateHardeningMessageFactory {
  /**
   * Create a state before dissent message
   */
  static createDissentMessage(params: DissentMessageParams): StateBeforeDissentMessage {
    const messageId = this.generateMessageId('dissent', params.txid, params.accountId)
    
    return {
      txid: params.txid,
      accountId: params.accountId,
      observed: params.observations.map(obs => ({
        hash: obs.hash,
        senderId: obs.fromNodeId
      })),
      proofReceipt: params.proofReceipt,
      timestamp: shardusGetTime(),
      messageId
    }
  }

  /**
   * Create a state correction message
   */
  static createCorrectionMessage(params: CorrectionMessageParams): StateCorrectionMessage {
    const messageId = this.generateMessageId('correction', params.receiptRef.txid, params.accountId)
    
    return {
      accountId: params.accountId,
      correctStateHash: params.correctStateHash,
      correctData: params.correctData,
      receiptRef: params.receiptRef,
      timestamp: shardusGetTime(),
      messageId
    }
  }

  /**
   * Create a signed receipt reference from a full receipt
   */
  static createReceiptRef(receipt: SignedReceipt, cycle?: number): SignedReceiptRef | null {
    if (!receipt.proposal || !receipt.signaturePack || receipt.signaturePack.length === 0) {
      return null
    }

    const receiptHash = this.calculateReceiptHash(receipt)
    
    return {
      txid: receipt.proposal.txid,
      cycle: cycle || 0, // Cycle must be provided separately
      receiptHash,
      signatures: receipt.signaturePack.map(sig => ({
        nodeId: sig.owner,
        sig: sig.sig
      }))
    }
  }

  /**
   * Create wrapped data for state corrections
   */
  static createWrappedData(params: WrappedDataParams): WrappedData {
    return {
      accountId: params.accountId,
      stateId: params.stateId,
      data: params.data,
      timestamp: params.timestamp || shardusGetTime()
    }
  }

  /**
   * Create a dissent message from queue entry observations
   */
  static createDissentFromObservations(
    txid: string,
    accountId: string,
    observations: BeforeStateObservation[],
    proofReceipt?: SignedReceipt
  ): StateBeforeDissentMessage | null {
    // Need at least 2 different observations for a conflict
    const uniqueHashes = new Set(observations.map(obs => obs.hash))
    if (uniqueHashes.size < 2) {
      return null
    }

    // Convert receipt to reference if provided
    const receiptRef = proofReceipt ? this.createReceiptRef(proofReceipt, 0) : undefined

    return this.createDissentMessage({
      txid,
      accountId,
      observations,
      proofReceipt: receiptRef
    })
  }

  /**
   * Create a correction message from resolution result
   */
  static createCorrectionFromResolution(
    accountId: string,
    correctStateHash: string,
    receipt: SignedReceipt,
    cycle: number,
    includeData?: unknown
  ): StateCorrectionMessage | null {
    const receiptRef = this.createReceiptRef(receipt, cycle)
    if (!receiptRef) {
      return null
    }

    let wrappedData: WrappedData | undefined
    if (includeData) {
      // Since Proposal doesn't have accountData, we need to pass it separately
      wrappedData = this.createWrappedData({
        accountId,
        stateId: correctStateHash,
        data: includeData,
        timestamp: shardusGetTime()
      })
    }

    return this.createCorrectionMessage({
      accountId,
      correctStateHash,
      receiptRef,
      correctData: wrappedData
    })
  }

  /**
   * Generate a unique message ID
   */
  private static generateMessageId(type: string, txid: string, accountId: string): string {
    const timestamp = shardusGetTime()
    const random = Math.random().toString(36).substring(2, 8)
    return `${type}:${txid}:${accountId}:${timestamp}:${random}`
  }

  /**
   * Calculate receipt hash for verification
   */
  private static calculateReceiptHash(receipt: SignedReceipt): string {
    // Create a copy without signatures for hashing
    const receiptForHashing = {
      proposal: receipt.proposal,
      proposalHash: receipt.proposalHash,
      voteOffsets: receipt.voteOffsets
    }
    
    return crypto.hash(crypto.stringify(receiptForHashing))
  }

  /**
   * Validate message structure before creation
   */
  static validateMessageParams(params: DissentMessageParams | CorrectionMessageParams): boolean {
    if ('observations' in params) {
      // Dissent message validation
      return params.txid.length > 0 &&
             params.accountId.length > 0 &&
             params.observations.length >= 2
    } else {
      // Correction message validation
      return params.accountId.length > 0 &&
             params.correctStateHash.length > 0 &&
             params.receiptRef !== null
    }
  }
}

/**
 * Parameters for creating a dissent message
 */
export interface DissentMessageParams {
  txid: string
  accountId: string
  observations: BeforeStateObservation[]
  proofReceipt?: SignedReceiptRef
}

/**
 * Parameters for creating a correction message
 */
export interface CorrectionMessageParams {
  accountId: string
  correctStateHash: string
  receiptRef: SignedReceiptRef
  correctData?: WrappedData
}

/**
 * Parameters for creating wrapped data
 */
export interface WrappedDataParams {
  accountId: string
  stateId: string
  data: unknown
  timestamp?: number
}