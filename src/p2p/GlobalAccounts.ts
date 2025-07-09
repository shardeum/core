/**
 * [NOTE] [AS] To break this modules dependency on Wrapper, search for
 * all references to 'p2p' imported from Wrapper and replace them with
 * a direct call to whatever Wrapper.p2p was calling
 */

import { logFlags } from '../logger'
import { P2P } from '@shardeum-foundation/lib-types'
import ShardFunctions from '../state-manager/shardFunctions'
import * as utils from '../utils'
import * as Comms from './Comms'
import * as Context from './Context'
import * as NodeList from './NodeList'
import * as Self from './Self'
import { profilerInstance } from '../utils/profiler'
import { OpaqueTransaction } from '../shardus/shardus-types'
import { shardusGetTime } from '../network'
import { InternalBinaryHandler } from '../types/Handler'
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum'
import { getStreamWithTypeCheck, requestErrorHandler } from '../types/Helpers'
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum'
import { MakeReceiptReq, deserializeMakeReceiptReq, serializeMakeReceiptReq } from '../types/MakeReceipReq'
import { Utils } from '@shardeum-foundation/lib-types'
import { fireAndForget } from '../utils/functions/promises'

/** ROUTES */
// [TODO] - need to add validattion of types to the routes

// const makeReceiptRoute: P2P.P2PTypes.Route<
//   P2P.P2PTypes.InternalHandler<P2P.GlobalAccountsTypes.SignedSetGlobalTx, unknown, string>
// > = {
//   name: 'make-receipt',
//   handler: (payload, respond, sender) => {
//     profilerInstance.scopedProfileSectionStart('make-receipt')
//     try {
//       makeReceipt(payload, sender)
//     } finally {
//       profilerInstance.scopedProfileSectionEnd('make-receipt')
//     }
//   },
// }

const makeReceiptBinaryHandler: P2P.P2PTypes.Route<InternalBinaryHandler<Buffer>> = {
  name: InternalRouteEnum.binary_make_receipt,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  handler: async (payload, respond, header, sign) => {
    const route = InternalRouteEnum.binary_make_receipt
    nestedCountersInstance.countEvent('internal', route)
    profilerInstance.scopedProfileSectionStart(route)
    const errorHandler = (
      errorType: RequestErrorEnum,
      opts?: { customErrorLog?: string; customCounterSuffix?: string }
    ): void => requestErrorHandler(route, errorType, header, opts)
    try {
      const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cMakeReceiptReq)
      if (!requestStream) {
        return errorHandler(RequestErrorEnum.InvalidRequest)
      }
      const req: MakeReceiptReq = deserializeMakeReceiptReq(requestStream)
      makeReceipt(req, header.sender_id)
    } catch (e) {
      nestedCountersInstance.countEvent('internal', `${route}-exception`)
      /* prettier-ignore */ if (logFlags.error) Context.logger.getLogger('p2p').error(`${route}: Exception executing request: ${utils.errorToStringFull(e)}`)
    } finally {
      profilerInstance.scopedProfileSectionEnd(route)
    }
  },
}

const setGlobalGossipRoute: P2P.P2PTypes.Route<P2P.P2PTypes.GossipHandler<P2P.GlobalAccountsTypes.Receipt>> = {
  name: 'set-global',
  handler: (payload, sender, tracker) => {
    profilerInstance.scopedProfileSectionStart('set-global')
    try {
      if (validateReceipt(payload) === false) return
      if (processReceipt(payload) === false) return
      /** [TODO] [AS] Replace with Comms.sendGossip() */
      // p2p.sendGossipIn('set-global', payload)
      Comms.sendGossip('set-global', payload, tracker, sender, NodeList.byIdOrder, false)
    } finally {
      profilerInstance.scopedProfileSectionEnd('set-global')
    }
  },
}

/** STATE */

let lastClean = 0

const receipts = new Map<P2P.GlobalAccountsTypes.TxHash, P2P.GlobalAccountsTypes.Receipt>()
const trackers = new Map<P2P.GlobalAccountsTypes.TxHash, P2P.GlobalAccountsTypes.Tracker>()
const localReceiptInitiationPromises = new Map<P2P.GlobalAccountsTypes.TxHash, Promise<void>>()
const localReceiptResolvers = new Map<P2P.GlobalAccountsTypes.TxHash, { resolve: () => void; reject: (reason?: any) => void }>()

/** FUNCTIONS */

export function init() {
  // Register routes
  // Comms.registerInternal(makeReceiptRoute.name, makeReceiptRoute.handler)
  Comms.registerInternalBinary(makeReceiptBinaryHandler.name, makeReceiptBinaryHandler.handler)
  Comms.registerGossipHandler(setGlobalGossipRoute.name, setGlobalGossipRoute.handler)
}

/**
 * Sets a global account by creating and broadcasting a transaction.
 *
 * This function performs the following steps:
 * 1. Logs the initiation of the setGlobal process if console logging is enabled.
 * 2. Checks if the current node is active. If not, logs a message and returns.
 * 3. Creates a transaction (`tx`) for setting a global account with the provided parameters.
 * 4. Signs the transaction (`signedTx`).
 * 5. Checks if the state manager is available and logs the state.
 * 6. Determines the nodes to which the transaction will be broadcasted.
 * 7. Finds the home node and consensus group for the current node.
 * 8. Removes the current node from the consensus group.
 * 9. Sets up a timeout and receipt handling mechanism to process receipts or handle timeouts.
 * 10. Broadcasts the transaction to the consensus group to trigger the creation of a receipt collection.
 *
 * @param address - The address of the global account to set.
 * @param addressHash - The hash of the address.
 * @param value - The value to set for the global account.
 * @param when - The timestamp or condition when the value should be set.
 * @param source - The source node initiating the transaction.
 * @param afterStateHash - The state hash after the transaction is applied.
 */
export function setGlobal(address, addressHash, value, when, source, afterStateHash) {
  if (logFlags.console) console.log(`SETGLOBAL: WE ARE: ${Self.id.substring(0, 5)}`)

  // Only do this if you're active
  if (!Self.isActive) {
    if (logFlags.console) console.log('setGlobal: Not active yet')
    return
  }

  // Create a tx for setting a global account
  const txHash = Context.shardus.app.calculateTxId(value as OpaqueTransaction)
  const tx: P2P.GlobalAccountsTypes.SetGlobalTx = {
    address,
    addressHash,
    value,
    when,
    source,
    txId: txHash,
    afterStateHash,
  }

  // Sign tx
  const signedTx: P2P.GlobalAccountsTypes.SignedSetGlobalTx = Context.crypto.sign(tx)

  if (Context.stateManager === null) {
    if (logFlags.console) console.log('setGlobal: stateManager == null')
  } else {
    if (logFlags.console) console.log('setGlobal: stateManager != null')
  }

  // Get the nodes that tx will be broadcasted to
  if (!Context.stateManager.currentCycleShardData) {
    if (logFlags.console) console.log('stateManager.currentCycleShardData == null')

    return
  }
  const homeNode = ShardFunctions.findHomeNode(
    Context.stateManager.currentCycleShardData.shardGlobals,
    source,
    Context.stateManager.currentCycleShardData.parititionShardDataMap
  )
  const consensusGroup = [...homeNode.consensusNodeForOurNodeFull]
  if (logFlags.console) console.log(`SETGLOBAL: CONSENSUS_GROUP: ${consensusGroup.map((n) => n.id.substring(0, 5))}`)
  /** [TODO] [AS] Replace p2p.id with Self.id */
  // const ourIdx = consensusGroup.findIndex(node => node.id === p2p.id)
  const ourIdx = consensusGroup.findIndex((node) => node.id === Self.id)
  if (ourIdx === -1) return // Return if we're not in the consensusGroup
  consensusGroup.splice(ourIdx, 1) // Remove ourself from consensusGroup

  // Using makeReceipt API

  // Get ready to process receipts into a receiptCollection, or to timeout
  const timeout = 10000 // [TODO] adjust this to stop early timeouts
  const handle = createMakeReceiptHandle(txHash)

  const onTimeout = () => {
    if (logFlags.console) console.log(`SETGLOBAL: TIMED OUT: ${txHash}`)
    /** [TODO] [AS] Replace with Self.emitter.removeListener */
    // p2p.removeListener(handle, onReceipt)
    Self.emitter.removeListener(handle, onReceipt)
    attemptCleanup()
  }
  const timer = setTimeout(onTimeout, timeout)

  const onReceipt = (receipt) => {
    if (logFlags.console) console.log(`SETGLOBAL: GOT RECEIPT: ${txHash} ${Utils.safeStringify(receipt)}`)
    clearTimeout(timer)
    // Gossip receipt to every node in network to apply to global account
    if (processReceipt(receipt) === false) return
    /** [TODO] [AS] Replace with Comms.sendGossip */
    // p2p.sendGossipIn('set-global', receipt)
    fireAndForget(() => Comms.sendGossip('set-global', receipt, '', null, NodeList.byIdOrder, true))
  }
  /** [TODO] [AS] Replace with Self.emitter.on() */
  // p2p.on(handle, onReceipt)
  Self.emitter.on(handle, onReceipt)

  // Broadcast tx to /makeReceipt of all nodes in source consensus group to trigger creation of receiptCollection
  /** [TODO] [AS] Replace with Self.id */
  // makeReceipt(signedTx, p2p.id) // Need this because internalRoute handler ignores messages from ourselves
  makeReceipt(signedTx, Self.id) // Need this because internalRoute handler ignores messages from ourselves
  /** [TODO] [AS] Replace with Comms.tell */
  // p2p.tell(consensusGroup, 'make-receipt', signedTx)
  // if (Context.config.p2p.useBinarySerializedEndpoints && Context.config.p2p.makeReceiptBinary) {
  const request = signedTx as MakeReceiptReq
  fireAndForget(() => Comms.tellBinary<MakeReceiptReq>(
    consensusGroup,
    InternalRouteEnum.binary_make_receipt,
    request,
    serializeMakeReceiptReq,
    {}
  ))
  // } else {
  // Comms.tell(consensusGroup, 'make-receipt', signedTx)
  // }
}

export function createMakeReceiptHandle(txHash: string) {
  return `receipt-${txHash}`
}

/**
 * Waits for local receipt initiation to complete before attempting to access the receipt.
 * This function ensures that makeReceipt has completed its critical local setup.
 * 
 * @param txHash - The transaction hash to wait for
 * @returns Promise that resolves when the receipt is ready or rejects on timeout/error
 */
export async function awaitLocalReceiptInitiation(txHash: P2P.GlobalAccountsTypes.TxHash): Promise<void> {
  const pendingPromise = localReceiptInitiationPromises.get(txHash)
  if (pendingPromise) {
    // Use configurable timeout, with fallback to 15 seconds if not configured
    const timeout = Context.config?.stateManager?.globalAccountsReceiptInitiationTimeout || 15000
    if (logFlags.verbose) console.log(`GlobalAccounts: Awaiting local receipt initiation for ${txHash} with timeout: ${timeout}ms`)
    try {
      await Promise.race([
        pendingPromise,
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error(`Receipt initiation timeout for ${txHash} after ${timeout}ms`)), timeout)
        )
      ])
      if (logFlags.verbose) console.log(`GlobalAccounts: Local receipt initiation completed for ${txHash}`)
    } catch (error) {
      if (logFlags.error) console.error(`GlobalAccounts: Error awaiting receipt initiation for ${txHash}:`, error)
      throw error
    } finally {
      // Clean up the promise after use
      localReceiptInitiationPromises.delete(txHash)
    }
  } else {
    if (logFlags.verbose) console.log(`GlobalAccounts: No pending promise for ${txHash}, receipt might already exist`)
  }
}

export async function getGlobalTxReceipt(
  txHash: P2P.GlobalAccountsTypes.TxHash
): Promise<P2P.GlobalAccountsTypes.GlobalTxReceipt | null> {
  // For backward compatibility, still check for pending promises
  await awaitLocalReceiptInitiation(txHash)

  const receipt = receipts.get(txHash)
  if (!receipt) return null
  return {
    signs: receipt.signs,
    tx: receipt.tx,
  }
}

export function makeReceipt(signedTx: P2P.GlobalAccountsTypes.SignedSetGlobalTx, sender: P2P.P2PTypes.NodeInfo['id']) {
  const txForHash = { ...signedTx }
  delete txForHash.sign
  const txHash = Context.shardus.app.calculateTxId(txForHash.value as OpaqueTransaction)

  // Early exit and promise rejection if stateManager not ready
  if (!Context.stateManager) {
    if (logFlags.console) console.log('GlobalAccounts: makeReceipt: stateManager not ready for tx', txHash)
    const promiseEntry = localReceiptResolvers.get(txHash)
    if (promiseEntry && sender === Self.id) {
      promiseEntry.reject(new Error('StateManager not ready in makeReceipt for tx ' + txHash))
      localReceiptInitiationPromises.delete(txHash)
      localReceiptResolvers.delete(txHash)
    }
    return
  }

  const sign = signedTx.sign

  const tx = { ...signedTx }
  delete tx.sign

  console.log('makeReceipt', txHash)

  // Check if this is a new receipt and local initiation
  let isNewReceiptAndLocalInitiation = false
  let currentPromiseResolvers: { resolve: () => void; reject: (reason?: any) => void } | null = null

  if (sender === Self.id && !receipts.has(txHash) && !localReceiptInitiationPromises.has(txHash)) {
    isNewReceiptAndLocalInitiation = true
    // Create promise BEFORE creating receipt for atomic operation
    const promise = new Promise<void>((resolve, reject) => {
      currentPromiseResolvers = { resolve, reject }
      localReceiptResolvers.set(txHash, currentPromiseResolvers)
    })
    localReceiptInitiationPromises.set(txHash, promise)
    if (logFlags.verbose) console.log(`GlobalAccounts: Created promise for local receipt initiation ${txHash}`)
  }

  // Put into correct Receipt and Tracker
  let receipt: P2P.GlobalAccountsTypes.Receipt = receipts.get(txHash)

  if (!receipt) {
    try {
      const consensusGroup = new Set(getConsensusGroupIds(tx.source))
      receipt = {
        signs: [],
        tx: null,
        consensusGroup,
      }
      receipts.set(txHash, receipt) // CRITICAL: Receipt is added to the map HERE
      if (logFlags.verbose) console.log(`GlobalAccounts: receipts.set() called for ${txHash}`)

      if (isNewReceiptAndLocalInitiation && currentPromiseResolvers) {
        // Receipt successfully created, but don't resolve yet - wait for majority
        if (logFlags.verbose) console.log(`GlobalAccounts: Receipt created successfully for ${txHash}, waiting for majority`)
      }
    } catch (err) {
      if (logFlags.error) console.error(`GlobalAccounts: Error during receipt creation for ${txHash}:`, err)
      if (isNewReceiptAndLocalInitiation && currentPromiseResolvers) {
        currentPromiseResolvers.reject(err) // Reject the promise
        localReceiptInitiationPromises.delete(txHash)
        localReceiptResolvers.delete(txHash)
      }
      throw err
    }

    if (logFlags.console)
      console.log(
        `SETGLOBAL: MAKERECEIPT CONSENSUS GROUP FOR ${txHash.substring(0, 5)}: ${Utils.safeStringify(
          [...receipt.consensusGroup].map((id) => id.substring(0, 5))
        )}`
      )
  }

  let tracker: P2P.GlobalAccountsTypes.Tracker = trackers.get(txHash)
  if (!tracker) {
    tracker = createTracker(txHash)
  }

  // Ignore duplicate txs
  if (tracker.seen.has(sign.owner)) {
    if (logFlags.verbose) console.log(`GlobalAccounts: Ignoring duplicate tx from ${sign.owner} for ${txHash}`)
    // Note: We don't reject the promise here as this is normal behavior
    return
  }
  // Ignore if sender is not in consensus group
  if (!receipt.consensusGroup.has(sender)) {
    if (logFlags.verbose) console.log(`GlobalAccounts: Sender ${sender} not in consensus group for ${txHash}`)
    // Note: We don't reject the promise here as this is normal behavior
    return
  }

  receipt.signs.push(sign)
  receipt.tx = tx

  tracker.seen.add(sign.owner)
  tracker.timestamp = tx.when

  // When a majority (%60) is reached, emit the completion event for this txHash
  if (logFlags.console)
    console.log(
      `SETGLOBAL: GOT SIGNED_SET_GLOBAL_TX FROM ${sender.substring(0, 5)}: ${txHash} ${Utils.safeStringify(signedTx)}`
    )
  if (logFlags.console)
    console.log(`SETGLOBAL: ${receipt.signs.length} RECEIPTS / ${receipt.consensusGroup.size} CONSENSUS_GROUP`)
  if (isReceiptMajority(receipt, receipt.consensusGroup)) {
    const handle = createMakeReceiptHandle(txHash)
    /** [TODO] [AS] Replace with Self.emitter.emit() */
    // p2p.emit(handle, receipt)
    Self.emitter.emit(handle, receipt)

    // Resolve the promise if we have majority
    const resolverEntry = localReceiptResolvers.get(txHash)
    if (resolverEntry) {
      resolverEntry.resolve()
      localReceiptResolvers.delete(txHash)
      // Promise will be cleaned up later in attemptCleanup
      if (logFlags.verbose) console.log(`GlobalAccounts: Receipt reached majority, resolved promise for ${txHash}`)
    }
  }
}

export function processReceipt(receipt: P2P.GlobalAccountsTypes.Receipt) {
  const txHash = Context.crypto.hash(receipt.tx)
  const tracker = trackers.get(txHash) || createTracker(txHash)
  tracker.timestamp = receipt.tx.when
  if (tracker.gossiped) return false
  fireAndForget(() => Context.shardus.put(receipt.tx.value as OpaqueTransaction, false, true))
  /* prettier-ignore */ if (logFlags.console) console.log(`Processed set-global receipt: ${Utils.safeStringify(receipt)} now:${shardusGetTime()}`)
  tracker.gossiped = true
  attemptCleanup()
  return true
}

export function attemptCleanup() {
  const now = shardusGetTime()
  if (now - lastClean < 60000) return
  lastClean = now

  for (const [txHash, tracker] of trackers) {
    if (now - tracker.timestamp > 30000) {
      trackers.delete(txHash)
      receipts.delete(txHash)
      // Clean up any associated promises
      localReceiptInitiationPromises.delete(txHash)
      localReceiptResolvers.delete(txHash)
    }
  }
}

function validateReceipt(receipt: P2P.GlobalAccountsTypes.Receipt) {
  if (Context.stateManager.currentCycleShardData === null) {
    // we may get this endpoint way before we are ready, so just log it can exit out
    if (logFlags.console) console.log('validateReceipt: unable to validate receipt currentCycleShardData not ready')
    return false
  }

  const consensusGroup = new Set(getConsensusGroupIds(receipt.tx.source))
  // Make sure receipt has enough signs
  if (isReceiptMajority(receipt, consensusGroup) === false) {
    if (logFlags.console) console.log('validateReceipt: Receipt did not have majority')
    return false
  }
  // Make a map of signs that overlap with consensusGroup
  const signsInConsensusGroup: P2P.P2PTypes.Signature[] = []
  const uniqueSignOwnerMap = {}

  for (const sign of receipt.signs) {
    const owner = sign.owner.toLowerCase()
    if (uniqueSignOwnerMap[owner]) {
      if (logFlags.console)
        console.log(`validateReceipt: duplicate signatures for owner ${utils.stringifyReduce(sign.owner)}`)
      continue
    }
    uniqueSignOwnerMap[owner] = true

    /** [TODO] [AS] Replace with NodeList.byPubKey.get() */
    // const node = p2p.state.getNodeByPubKey(sign.owner)
    const node = NodeList.byPubKey.get(sign.owner)

    if (node === null) {
      if (logFlags.console)
        console.log(`validateReceipt: node was null or not found ${utils.stringifyReduce(sign.owner)}`)
      /** [TODO] [AS] Replace with NodeList.nodes */
      if (logFlags.console)
        console.log(
          // `validateReceipt: nodes: ${utils.stringifyReduce(p2p.state.getNodes())}`
          `validateReceipt: nodes: ${utils.stringifyReduce(NodeList.nodes)}`
        )
      continue
    }

    const id = node.id
    if (consensusGroup.has(id)) {
      signsInConsensusGroup.push(sign)
    } else {
      if (logFlags.console)
        console.log(`validateReceipt: consensusGroup does not have id: ${id} ${utils.stringifyReduce(consensusGroup)}`)
    }
  }
  // Make sure signs and consensusGroup overlap >= %60
  if ((signsInConsensusGroup.length / consensusGroup.size) * 100 < 60) {
    if (logFlags.console)
      console.log('validateReceipt: Receipt signature owners and consensus group did not overlap enough')
    return false
  }
  // Verify the signs that overlap with consensusGroup are a majority
  let verified = 0
  for (const sign of signsInConsensusGroup) {
    const signedTx = { ...receipt.tx, sign }
    if (Context.crypto.verify(signedTx)) verified++
  }
  if ((verified / consensusGroup.size) * 100 < 60) {
    if (logFlags.console) console.log('validateReceipt: Receipt does not have enough valid signatures')
    return false
  }
  if (logFlags.console) console.log(`validateReceipt: success! ${utils.stringifyReduce(receipt)}`)
  return true
}

function createTracker(txHash) {
  const tracker = {
    seen: new Set<P2P.P2PTypes.NodeInfo['id']>(),
    timestamp: 0,
    gossiped: false,
  }
  trackers.set(txHash, tracker)
  return tracker
}

function getConsensusGroupIds(address) {
  const homeNode = ShardFunctions.findHomeNode(
    Context.stateManager.currentCycleShardData.shardGlobals,
    address,
    Context.stateManager.currentCycleShardData.parititionShardDataMap
  )
  return homeNode.consensusNodeForOurNodeFull.map((node) => node.id)
}

function isReceiptMajority(receipt, consensusGroup) {
  return (receipt.signs.length / consensusGroup.size) * 100 >= 60
}

function intersect(a, b) {
  const setB = new Set(b)
  return [...new Set(a)].filter((x) => setB.has(x))
}

function intersectCount(a, b) {
  return intersect(a, b).length
}

function percentOverlap(a, b) {
  return (a.length / b.length) * 100
}

// Export for testing purposes
export function __clearForTest() {
  receipts.clear()
  trackers.clear()
}
