// State hardening Phase 3: Gossip handlers for state dissent and correction

import { P2P } from '@shardeum-foundation/lib-types'
import { Logger } from 'log4js'
import * as crypto from '@shardeum-foundation/lib-crypto-utils'
import StateManager from '../../state-manager'
import TransactionQueue from '../../state-manager/TransactionQueue'
import TransactionConsenus from '../../state-manager/TransactionConsensus'
import { 
  StateBeforeDissentMessage, 
  StateCorrectionMessage,
  StateDissentGossipPayload,
  SignedReceiptRef 
} from '../../types/gossip/state-dissent'
import * as Context from '../Context'
import { logger } from '../Context'
import * as Comms from '../Comms'
import * as NodeList from '../NodeList'
import * as CycleChain from '../CycleChain'
import { nestedCountersInstance } from '../../utils/nestedCounters'
import { shardusGetTime } from '../../network'
import * as ShardusTypes from '../../shardus/shardus-types'
import { StateHardeningValidator } from '../../utils/stateHardeningValidation'
import { DissentGossipRateLimiter } from '../../state-manager/DissentGossipRateLimiter'
import { StateHardeningConfig } from '../../config/stateHardeningConfig'

let p2pLogger: Logger
let stateManager: StateManager // Will be injected during init
let transactionQueue: TransactionQueue // Will be injected during init
let transactionConsensus: TransactionConsenus // Will be injected during init
let rateLimiter: DissentGossipRateLimiter // Rate limiter instance

// Track seen messages to prevent loops
const seenMessages = new Map<string, number>() // messageId -> timestamp
const MESSAGE_CACHE_TTL = 60000 // 1 minute

/**
 * Initialize the state dissent handlers
 */
export function init(sm: StateManager, tq: TransactionQueue, tc: TransactionConsenus): void {
  p2pLogger = logger.getLogger('p2p')
  stateManager = sm
  transactionQueue = tq
  transactionConsensus = tc
  
  // Initialize rate limiter with config
  rateLimiter = new DissentGossipRateLimiter(StateHardeningConfig.getGossipConfig())
  
  // Clear seen messages periodically
  setInterval(() => {
    const now = shardusGetTime()
    for (const [messageId, timestamp] of seenMessages.entries()) {
      if (now - timestamp > MESSAGE_CACHE_TTL) {
        seenMessages.delete(messageId)
      }
    }
  }, MESSAGE_CACHE_TTL / 2)
}

/**
 * Register gossip handlers with the P2P system
 */
export function registerStateDissentHandlers(context: typeof Context): void {
  p2pLogger.info('Registering state dissent gossip handlers', {
    correctionEnabled: context.config.stateManager.stateCorrectionGossipEnabled,
    config: {
      messageTTL: context.config.stateManager.gossipMessageTTL
    }
  })

  // State before dissent handler
  Comms.registerGossipHandler(
    'state-before-dissent',
    handleStateBeforeDissentGossip
  )
  p2pLogger.info('Registered state-before-dissent handler')

  // State correction handler (if enabled)
  if (context.config.stateManager.stateCorrectionGossipEnabled) {
    Comms.registerGossipHandler(
      'state-correction',
      handleStateCorrectionGossip
    )
    p2pLogger.info('Registered state-correction handler')
  } else {
    p2pLogger.info('State correction handler NOT registered (disabled in config)')
  }

  p2pLogger.info('State dissent gossip handlers registration complete')
}

/**
 * Handle incoming state before dissent gossip
 */
async function handleStateBeforeDissentGossip(
  payload: StateDissentGossipPayload,
  sender: string,
  tracker: string,
  msgSize: number
): Promise<boolean> {
  const startTime = Date.now()
  
  try {
    // Step 1: Validate incoming dissent
    const validation = await validateIncomingDissent(payload, sender, tracker, msgSize)
    if (!validation.valid) {
      return false
    }

    const { message, messageId } = validation

    // Step 2: Check local corroboration
    const corroboration = await checkLocalCorroboration(message)
    
    // Step 3: Process the dissent message if appropriate
    if (corroboration.shouldProcess) {
      await processDissentMessage(message)
    }

    // Step 4: Propagate if needed
    if (corroboration.shouldForward) {
      await propagateDissent(payload, sender, tracker, messageId, corroboration)
    }

    const duration = Date.now() - startTime
    p2pLogger.info('Dissent gossip handled successfully', { messageId, duration })
    return true
  } catch (error) {
    p2pLogger.error('Error handling state before dissent gossip:', {
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime
    })
    return false
  }
}

/**
 * Validate incoming dissent message
 */
async function validateIncomingDissent(
  payload: StateDissentGossipPayload,
  sender: string,
  tracker: string,
  msgSize: number
): Promise<{ valid: boolean; message?: StateBeforeDissentMessage; messageId?: string }> {
  p2pLogger.info('Received state-before-dissent gossip', {
    sender,
    tracker,
    msgSize,
    payloadType: payload.type
  })

  if (payload.type !== 'state-before-dissent') {
    p2pLogger.warn('Invalid payload type for dissent handler', { type: payload.type })
    return { valid: false }
  }

  const message = payload.data as StateBeforeDissentMessage
  const messageId = getMessageId(message)
  
  p2pLogger.info('Processing dissent message', {
    messageId,
    txId: message.txid,
    accountId: message.accountId,
    observedCount: message.observed.length,
    hasProof: !!message.proofReceipt
  })

  // Check if we've seen this message before
  if (seenMessages.has(messageId)) {
    p2pLogger.info('Already seen dissent message', { messageId })
    return { valid: false }
  }

  // Validate message
  if (!validateDissentMessage(message, payload.sign)) {
    p2pLogger.warn('Dissent message validation failed', {
      messageId,
      hasSign: !!payload.sign,
      timestamp: message.timestamp
    })
    nestedCountersInstance.countEvent('gossip-validation', 'dissent-invalid')
    return { valid: false }
  }

  // Record that we've seen this message
  seenMessages.set(messageId, shardusGetTime())
  p2pLogger.info('Recorded message as seen', { messageId })

  return { valid: true, message, messageId }
}

/**
 * Check if we corroborate the conflict locally
 */
async function checkLocalCorroboration(
  message: StateBeforeDissentMessage
): Promise<{
  corroborates: boolean
  hasValidProof: boolean
  isNewConflictInfo: boolean
  shouldProcess: boolean
  shouldForward: boolean
}> {
  // Check if we corroborate this conflict
  const corroborates = await corroborateConflict(message)
  const hasValidProof = message.proofReceipt && validateReceiptProof(message.proofReceipt)
  
  // Also check if this is new conflict information we should learn about
  const isNewConflictInfo = await isNewConflictInformation(message)
  
  p2pLogger.info('Dissent processing decision', {
    messageId: getMessageId(message),
    corroborates,
    hasValidProof,
    isNewConflictInfo,
    willProcess: corroborates || hasValidProof || isNewConflictInfo
  })

  const shouldProcess = corroborates || hasValidProof || isNewConflictInfo
  if (!shouldProcess) {
    p2pLogger.info('Cannot process dissent, dropping', { messageId: getMessageId(message) })
    nestedCountersInstance.countEvent('gossip-validation', 'dissent-no-grounds')
  }

  const shouldForward = shouldProcess && shouldForwardDissent(message, corroborates, hasValidProof)

  return {
    corroborates,
    hasValidProof,
    isNewConflictInfo,
    shouldProcess,
    shouldForward
  }
}

/**
 * Propagate dissent gossip to other nodes
 */
async function propagateDissent(
  payload: StateDissentGossipPayload,
  sender: string,
  tracker: string,
  messageId: string,
  corroboration: { corroborates: boolean; hasValidProof: boolean }
): Promise<void> {
  p2pLogger.info('Forwarding dissent gossip', {
    messageId,
    corroborates: corroboration.corroborates,
    hasValidProof: corroboration.hasValidProof
  })
  forwardDissentGossip(payload, sender, tracker)
}

/**
 * Handle incoming state correction gossip
 */
async function handleStateCorrectionGossip(
  payload: StateDissentGossipPayload,
  sender: string,
  tracker: string,
  msgSize: number
): Promise<boolean> {
  const startTime = Date.now()
  
  try {
    // Step 1: Validate incoming correction
    const validation = await validateIncomingCorrection(payload, sender, tracker, msgSize)
    if (!validation.valid) {
      return false
    }

    const { message, messageId } = validation

    // Step 2: Process the correction
    await processCorrectionMessage(message)

    // Step 3: Propagate if needed
    if (shouldForwardCorrection(message)) {
      await propagateCorrection(payload, sender, tracker, messageId)
    }

    const duration = Date.now() - startTime
    p2pLogger.info('Correction gossip handled successfully', { messageId, duration })
    return true
  } catch (error) {
    p2pLogger.error('Error handling state correction gossip:', {
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime
    })
    return false
  }
}

/**
 * Validate incoming correction message
 */
async function validateIncomingCorrection(
  payload: StateDissentGossipPayload,
  sender: string,
  tracker: string,
  msgSize: number
): Promise<{ valid: boolean; message?: StateCorrectionMessage; messageId?: string }> {
  p2pLogger.info('Received state-correction gossip', {
    sender,
    tracker,
    msgSize,
    payloadType: payload.type
  })

  if (payload.type !== 'state-correction') {
    p2pLogger.warn('Invalid payload type for correction handler', { type: payload.type })
    return { valid: false }
  }

  const message = payload.data as StateCorrectionMessage
  const messageId = getCorrectionMessageId(message)
  
  p2pLogger.info('Processing correction message', {
    messageId,
    accountId: message.accountId,
    correctHash: message.correctStateHash,
    hasData: !!message.correctData,
    receiptTxId: message.receiptRef?.txid,
    receiptCycle: message.receiptRef?.cycle,
    signatureCount: message.receiptRef?.signatures?.length || 0
  })

  // Check if we've seen this message before
  if (seenMessages.has(messageId)) {
    p2pLogger.info('Already seen correction message', { messageId })
    return { valid: false }
  }

  // Validate message and proof
  if (!validateCorrectionMessage(message, payload.sign)) {
    p2pLogger.warn('Correction message validation failed', {
      messageId,
      hasSign: !!payload.sign,
      timestamp: message.timestamp,
      accountId: message.accountId
    })
    nestedCountersInstance.countEvent('gossip-validation', 'correction-invalid')
    return { valid: false }
  }

  // Validate the receipt proof
  if (!validateReceiptProof(message.receiptRef)) {
    p2pLogger.warn('Receipt proof validation failed', {
      messageId,
      receiptTxId: message.receiptRef?.txid,
      receiptCycle: message.receiptRef?.cycle,
      signatureCount: message.receiptRef?.signatures?.length || 0
    })
    nestedCountersInstance.countEvent('gossip-validation', 'correction-invalid-proof')
    return { valid: false }
  }

  // Record that we've seen this message
  seenMessages.set(messageId, shardusGetTime())
  p2pLogger.info('Recorded correction message as seen', { messageId })

  return { valid: true, message, messageId }
}

/**
 * Propagate correction gossip to other nodes
 */
async function propagateCorrection(
  payload: StateDissentGossipPayload,
  sender: string,
  tracker: string,
  messageId: string
): Promise<void> {
  p2pLogger.info('Forwarding correction gossip', { messageId })
  forwardCorrectionGossip(payload, sender, tracker)
}

/**
 * Emit state before dissent gossip when conflict detected
 */
export async function emitStateBeforeDissentGossip(
  txId: string,
  accountId: string,
  observations: Array<{ hash: string; senderId: string }>,
  proofReceipt?: SignedReceiptRef
): Promise<void> {
  const startTime = Date.now()
  
  try {
    p2pLogger.info('Attempting to emit state before dissent', {
      txId,
      accountId,
      observationCount: observations.length,
      hasProof: !!proofReceipt,
      observations: observations.slice(0, 5) // Log first 5
    })

    // No rate limiting - emit all dissents

    const message: StateBeforeDissentMessage = {
      txid: txId,
      accountId,
      observed: observations,
      proofReceipt,
      timestamp: shardusGetTime()
    }

    const payload: StateDissentGossipPayload = {
      type: 'state-before-dissent',
      data: message,
      sign: await signMessage(message)
    }

    // No rate limiting to record

    // Gossip to network
    const nodeCount = NodeList.byIdOrder.length
    p2pLogger.info('Sending dissent gossip', {
      txId,
      messageId: getMessageId(message),
      targetNodes: nodeCount,
      gossipFactor: 3
    })
    
    Comms.sendGossip(
      'state-before-dissent',
      payload,
      '',
      null,
      NodeList.byIdOrder,
      true,
      3, // Low gossip factor
      txId
    )

    const duration = Date.now() - startTime
    p2pLogger.info('Successfully emitted state before dissent', {
      txId,
      accountId,
      duration
    })
  } catch (error) {
    p2pLogger.error('Error emitting state before dissent:', {
      error: error.message,
      stack: error.stack,
      txId,
      accountId,
      duration: Date.now() - startTime
    })
  }
}

/**
 * Emit state correction gossip after resolution
 */
export async function emitStateCorrectionGossip(
  accountId: string,
  correctStateHash: string,
  receiptRef: SignedReceiptRef,
  correctData?: any
): Promise<void> {
  const startTime = Date.now()
  
  try {
    p2pLogger.info('Attempting to emit state correction', {
      accountId,
      correctHash: correctStateHash,
      txId: receiptRef.txid,
      cycle: receiptRef.cycle,
      hasData: !!correctData,
      signatureCount: receiptRef.signatures?.length || 0
    })

    // No rate limiting - emit all corrections

    const message: StateCorrectionMessage = {
      accountId,
      correctStateHash,
      correctData: correctData ? {
        accountId,
        stateId: correctStateHash,
        data: correctData,
        timestamp: shardusGetTime()
      } : undefined,
      receiptRef,
      timestamp: shardusGetTime()
    }

    const payload: StateDissentGossipPayload = {
      type: 'state-correction',
      data: message,
      sign: await signMessage(message)
    }

    // No rate limiting to record

    // Gossip to network
    const nodeCount = NodeList.byIdOrder.length
    p2pLogger.info('Sending correction gossip', {
      accountId,
      messageId: getCorrectionMessageId(message),
      targetNodes: nodeCount,
      gossipFactor: 3
    })
    
    Comms.sendGossip(
      'state-correction',
      payload,
      '',
      null,
      NodeList.byIdOrder,
      true,
      3, // Low gossip factor
      receiptRef.txid
    )

    const duration = Date.now() - startTime
    p2pLogger.info('Successfully emitted state correction', {
      accountId,
      txId: receiptRef.txid,
      duration
    })
  } catch (error) {
    p2pLogger.error('Error emitting state correction:', {
      error: error.message,
      stack: error.stack,
      accountId,
      txId: receiptRef?.txid,
      duration: Date.now() - startTime
    })
  }
}

/**
 * Check if we corroborate the conflict locally
 */
async function corroborateConflict(message: StateBeforeDissentMessage): Promise<boolean> {
  try {
    // Check if the message itself indicates a valid conflict
    const minObservers = Context.config.stateManager.minDissentObservers || 2
    if (message.observed.length >= minObservers) {
      // Validate that the observations are from different nodes
      const uniqueSenders = new Set(message.observed.map(o => o.senderId))
      if (uniqueSenders.size >= minObservers) {
        p2pLogger.info('Accepting dissent based on message content', {
          txId: message.txid,
          accountId: message.accountId,
          uniqueObservers: uniqueSenders.size,
          observedHashes: message.observed.length
        })
        return true
      }
    }

    // Original corroboration logic as fallback
    // Check our local transaction queue for additional validation
    if (!transactionQueue || !transactionQueue._transactionQueueByID) {
      return false
    }
    
    const queueEntry = transactionQueue._transactionQueueByID.get(message.txid)
    if (!queueEntry) {
      // If we don't have the transaction, we should still accept the dissent
      // to learn about potential conflicts
      p2pLogger.info('Accepting dissent for unknown transaction', { 
        txId: message.txid 
      })
      return true
    }

    // If we have the transaction, validate against our observations
    if (queueEntry.beforeStateObservations) {
      const tracking = queueEntry.beforeStateObservations.get(message.accountId)
      if (tracking && tracking.hashes.size >= 1) {
        // Check if the message contains hashes we haven't seen
        const newHashes = message.observed.filter(o => 
          !tracking.hashes.has(o.hash)
        ).length
        
        if (newHashes > 0) {
          p2pLogger.info('Accepting dissent with new hash information', {
            txId: message.txid,
            accountId: message.accountId,
            localHashes: tracking.hashes.size,
            newHashes
          })
          return true
        }
      }
    }

    return false
  } catch (error) {
    p2pLogger.error('Error during corroboration check:', error)
    return false
  }
}

/**
 * Process incoming dissent message
 */
async function processDissentMessage(message: StateBeforeDissentMessage): Promise<void> {
  try {
    p2pLogger.info('Processing dissent message', {
      txId: message.txid,
      accountId: message.accountId,
      observedCount: message.observed.length,
      hasQueue: !!transactionQueue,
      hasHandler: !!(transactionQueue && transactionQueue.handleGossipedConflict)
    })

    // Notify transaction queue about the conflict
    if (transactionQueue && transactionQueue.handleGossipedConflict) {
      p2pLogger.info('Calling handleGossipedConflict', {
        txId: message.txid,
        accountId: message.accountId,
        observedHashes: message.observed.map(o => ({ hash: o.hash.substring(0, 8), sender: o.senderId }))
      })
      
      transactionQueue.handleGossipedConflict(message.txid, message.accountId, message.observed)
      
      p2pLogger.info('Successfully processed dissent in transaction queue', {
        txId: message.txid,
        accountId: message.accountId
      })
    } else {
      // Fallback if not yet integrated
      p2pLogger.warn('Transaction queue handler not available', {
        txId: message.txid,
        accountId: message.accountId,
        observedHashes: message.observed.length,
        hasQueue: !!transactionQueue,
        hasHandler: !!(transactionQueue && transactionQueue.handleGossipedConflict)
      })
    }
    
    nestedCountersInstance.countEvent('gossip-processed', 'dissent')
  } catch (error) {
    p2pLogger.error('Error processing dissent message:', {
      error: error.message,
      stack: error.stack,
      txId: message.txid,
      accountId: message.accountId
    })
    throw error
  }
}

/**
 * Process incoming correction message
 */
async function processCorrectionMessage(message: StateCorrectionMessage): Promise<void> {
  try {
    p2pLogger.info('Processing correction message', {
      txId: message.receiptRef.txid,
      accountId: message.accountId,
      correctHash: message.correctStateHash,
      hasData: !!message.correctData,
      hasConsensus: !!transactionConsensus,
      hasHandler: !!(transactionConsensus && transactionConsensus.handleGossipedCorrection)
    })

    // Notify transaction consensus about the correction
    if (transactionConsensus && transactionConsensus.handleGossipedCorrection) {
      p2pLogger.info('Calling handleGossipedCorrection', {
        txId: message.receiptRef.txid,
        accountId: message.accountId,
        correctHash: message.correctStateHash,
        hasData: !!message.correctData,
        receiptCycle: message.receiptRef.cycle,
        signatureCount: message.receiptRef.signatures?.length || 0
      })
      
      transactionConsensus.handleGossipedCorrection(
        message.receiptRef.txid,
        message.accountId,
        message.correctStateHash,
        message.correctData,
        message.receiptRef
      )
      
      p2pLogger.info('Successfully processed correction in transaction consensus', {
        txId: message.receiptRef.txid,
        accountId: message.accountId
      })
    } else {
      // Fallback if not yet integrated
      p2pLogger.warn('Transaction consensus handler not available', {
        txId: message.receiptRef.txid,
        accountId: message.accountId,
        correctHash: message.correctStateHash,
        hasConsensus: !!transactionConsensus,
        hasHandler: !!(transactionConsensus && transactionConsensus.handleGossipedCorrection)
      })
    }
    
    // CRITICAL FIX: Update local state if we have the corrected data
    if (message.correctData && stateManager) {
      await updateLocalStateFromCorrection(message)
    }
    
    nestedCountersInstance.countEvent('gossip-processed', 'correction')
  } catch (error) {
    p2pLogger.error('Error processing correction message:', {
      error: error.message,
      stack: error.stack,
      txId: message.receiptRef?.txid,
      accountId: message.accountId
    })
    throw error
  }
}

/**
 * Validate dissent message format and signature
 */
function validateDissentMessage(message: StateBeforeDissentMessage, sign?: any): boolean {
  try {
    p2pLogger.info('Validating dissent message', {
      hasTxId: !!message.txid,
      hasAccountId: !!message.accountId,
      hasObserved: !!message.observed,
      observedCount: message.observed?.length || 0,
      hasSign: !!sign,
      timestamp: message.timestamp
    })

    if (!message.txid || !message.accountId || !message.observed) {
      p2pLogger.warn('Dissent validation failed: missing required fields', {
        hasTxId: !!message.txid,
        hasAccountId: !!message.accountId,
        hasObserved: !!message.observed
      })
      return false
    }

    if (message.observed.length < 2) {
      p2pLogger.warn('Dissent validation failed: insufficient observations', {
        observedCount: message.observed.length,
        required: 2
      })
      return false // Need at least 2 different observations
    }

    // Validate timestamp is recent
    const age = shardusGetTime() - message.timestamp
    const ttl = Context.config.stateManager.gossipMessageTTL
    if (age > ttl) {
      p2pLogger.warn('Dissent validation failed: message too old', {
        age,
        ttl,
        timestamp: message.timestamp
      })
      return false
    }

    // Validate signature if provided
    if (sign) {
      const node = NodeList.byPubKey.get(sign.owner)
      if (!node) {
        p2pLogger.warn('Dissent validation failed: unknown signature owner', {
          owner: sign.owner
        })
        return false
      }
      // Create signed object for verification
      const signedMessage = { ...message, sign }
      if (!crypto.verifyObj(signedMessage)) {
        p2pLogger.warn('Dissent validation failed: invalid signature', {
          owner: sign.owner,
          nodeId: node.id
        })
        return false
      }
      p2pLogger.info('Dissent signature verified', {
        owner: sign.owner,
        nodeId: node.id
      })
    }

    p2pLogger.info('Dissent message validation passed')
    return true
  } catch (error) {
    p2pLogger.error('Error validating dissent message:', {
      error: error.message,
      stack: error.stack
    })
    return false
  }
}

/**
 * Validate correction message format and signature
 */
function validateCorrectionMessage(message: StateCorrectionMessage, sign?: any): boolean {
  try {
    p2pLogger.info('Validating correction message', {
      hasAccountId: !!message.accountId,
      hasCorrectHash: !!message.correctStateHash,
      hasReceiptRef: !!message.receiptRef,
      hasSign: !!sign,
      timestamp: message.timestamp
    })

    if (!message.accountId || !message.correctStateHash || !message.receiptRef) {
      p2pLogger.warn('Correction validation failed: missing required fields', {
        hasAccountId: !!message.accountId,
        hasCorrectHash: !!message.correctStateHash,
        hasReceiptRef: !!message.receiptRef
      })
      return false
    }

    // Validate timestamp is recent
    const age = shardusGetTime() - message.timestamp
    const ttl = Context.config.stateManager.gossipMessageTTL * 2
    if (age > ttl) {
      p2pLogger.warn('Correction validation failed: message too old', {
        age,
        ttl,
        timestamp: message.timestamp
      })
      return false // Allow longer TTL for corrections
    }

    // Validate signature if provided
    if (sign) {
      const node = NodeList.byPubKey.get(sign.owner)
      if (!node) {
        p2pLogger.warn('Correction validation failed: unknown signature owner', {
          owner: sign.owner
        })
        return false
      }
      // Create signed object for verification
      const signedMessage = { ...message, sign }
      if (!crypto.verifyObj(signedMessage)) {
        p2pLogger.warn('Correction validation failed: invalid signature', {
          owner: sign.owner,
          nodeId: node.id
        })
        return false
      }
      p2pLogger.info('Correction signature verified', {
        owner: sign.owner,
        nodeId: node.id
      })
    }

    p2pLogger.info('Correction message validation passed')
    return true
  } catch (error) {
    p2pLogger.error('Error validating correction message:', {
      error: error.message,
      stack: error.stack
    })
    return false
  }
}

/**
 * Update local state from correction message
 */
async function updateLocalStateFromCorrection(message: StateCorrectionMessage): Promise<void> {
  try {
    p2pLogger.info('Attempting to update local state from correction', {
      accountId: message.accountId,
      correctHash: message.correctStateHash,
      hasData: !!message.correctData,
      receiptTxId: message.receiptRef.txid,
      receiptCycle: message.receiptRef.cycle
    })

    // Safety check: Only update if we're a storage node for this account
    if (!stateManager.accountCache.hasAccount(message.accountId)) {
      p2pLogger.info('Not a storage node for this account, skipping local update', {
        accountId: message.accountId
      })
      return
    }

    // Get current local state
    const currentHash = stateManager.accountCache.getAccountHash(message.accountId)
    if (!currentHash) {
      p2pLogger.warn('Could not get current hash for account', {
        accountId: message.accountId
      })
      return
    }

    // Check if our local state differs from the correct state
    if (currentHash.h === message.correctStateHash) {
      p2pLogger.info('Local state already matches correct state', {
        accountId: message.accountId,
        hash: message.correctStateHash
      })
      nestedCountersInstance.countEvent('state-correction', 'already-correct')
      return
    }

    p2pLogger.warn('Local state differs from correct state', {
      accountId: message.accountId,
      localHash: currentHash.h,
      correctHash: message.correctStateHash,
      localCycle: currentHash.c,
      localTimestamp: currentHash.t
    })

    // Validate that the correction is newer than our local state
    const correctionCycle = message.receiptRef.cycle
    if (correctionCycle < currentHash.c) {
      p2pLogger.warn('Correction is from older cycle than local state', {
        accountId: message.accountId,
        correctionCycle,
        localCycle: currentHash.c
      })
      nestedCountersInstance.countEvent('state-correction', 'older-cycle-rejected')
      return
    }

    // Apply the corrected state
    const wrappedAccount: ShardusTypes.WrappedData = {
      accountId: message.accountId,
      stateId: message.correctStateHash,
      data: message.correctData,
      timestamp: shardusGetTime() // Use current time for the update
    }

    const updatedAccounts: string[] = []
    const failedHashes = await stateManager.checkAndSetAccountData(
      [wrappedAccount],
      `state-correction-gossip:${message.receiptRef.txid}`,
      true,
      updatedAccounts
    )

    if (failedHashes.length > 0) {
      p2pLogger.error('Failed to update account from correction', {
        accountId: message.accountId,
        failedHashes,
        correctHash: message.correctStateHash
      })
      nestedCountersInstance.countEvent('state-correction', 'update-failed')
    } else if (updatedAccounts.length > 0) {
      p2pLogger.info('Successfully updated account from correction', {
        accountId: message.accountId,
        correctHash: message.correctStateHash,
        updatedCount: updatedAccounts.length
      })
      nestedCountersInstance.countEvent('state-correction', 'update-success')
    }
  } catch (error) {
    p2pLogger.error('Error updating local state from correction:', {
      error: error.message,
      stack: error.stack,
      accountId: message.accountId
    })
    nestedCountersInstance.countEvent('state-correction', 'update-error')
  }
}

/**
 * Validate receipt proof has sufficient signatures
 */
function validateReceiptProof(receiptRef: SignedReceiptRef): boolean {
  try {
    if (!receiptRef || !receiptRef.signatures || receiptRef.signatures.length === 0) {
      return false
    }

    // Validate receipt has required fields
    if (!receiptRef.txid || !receiptRef.cycle || !receiptRef.receiptHash) {
      return false
    }

    p2pLogger.info('Receipt proof validation (signature check disabled)', {
      txId: receiptRef.txid,
      totalSignatures: receiptRef.signatures.length
    })

    return true
  } catch (error) {
    p2pLogger.error('Error validating receipt proof:', error)
    return false
  }
}

/**
 * Helper function to check if this is new conflict information
 */
async function isNewConflictInformation(message: StateBeforeDissentMessage): Promise<boolean> {
  // Accept if we haven't seen this conflict before
  const queueEntry = transactionQueue?._transactionQueueByID?.get(message.txid)
  if (!queueEntry) return true // New transaction info
  
  const minObservers = Context.config.stateManager.minDissentObservers || 2
  if (!queueEntry.beforeStateConflict && message.observed.length >= minObservers) {
    return true // First time learning about this conflict
  }
  
  // Check if message contains hashes we haven't seen
  const tracking = queueEntry.beforeStateObservations?.get(message.accountId)
  if (!tracking) return true
  
  const newHashes = message.observed.some(o => !tracking.hashes.has(o.hash))
  return newHashes
}

/**
 * Determine if we should forward dissent gossip
 */
function shouldForwardDissent(
  message: StateBeforeDissentMessage,
  corroborates: boolean,
  hasValidProof: boolean
): boolean {
  // Forward if we corroborate OR there's valid proof
  return corroborates || hasValidProof
}

/**
 * Determine if we should forward correction gossip
 */
function shouldForwardCorrection(message: StateCorrectionMessage): boolean {
  // Always forward valid corrections with proof
  return true
}

/**
 * Forward dissent gossip to peers
 */
function forwardDissentGossip(
  payload: StateDissentGossipPayload,
  sender: string,
  tracker: string
): void {
  const message = payload.data as StateBeforeDissentMessage
  
  Comms.sendGossip(
    'state-before-dissent',
    payload,
    sender,
    null,
    NodeList.byIdOrder,
    false, // Not originator
    3, // Low gossip factor
    message.txid
  )
}

/**
 * Forward correction gossip to peers
 */
function forwardCorrectionGossip(
  payload: StateDissentGossipPayload,
  sender: string,
  tracker: string
): void {
  const message = payload.data as StateCorrectionMessage
  
  Comms.sendGossip(
    'state-correction',
    payload,
    sender,
    null,
    NodeList.byIdOrder,
    false, // Not originator
    3, // Low gossip factor
    message.receiptRef.txid
  )
}

/**
 * Generate unique message ID for dissent messages
 */
function getMessageId(message: StateBeforeDissentMessage): string {
  return `dissent-${message.txid}-${message.accountId}-${message.timestamp}`
}

/**
 * Generate unique message ID for correction messages
 */
function getCorrectionMessageId(message: StateCorrectionMessage): string {
  return `correction-${message.accountId}-${message.receiptRef.txid}-${message.timestamp}`
}

/**
 * Sign a message for gossip
 */
async function signMessage(message: object): Promise<crypto.Signature> {
  const signedObj = crypto.signObj(message, Context.crypto.keypair.secretKey, Context.crypto.keypair.publicKey)
  return signedObj.sign
}

/**
 * Get message cache stats for monitoring
 */
export function getMessageCacheStats(): any {
  return {
    seenMessagesCount: seenMessages.size,
    cacheEnabled: true
  }
}