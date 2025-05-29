import * as ShardusTypes from './shardus-types'
import { logFlags } from '../logger'
import { shardusGetTime } from '../network'
import * as CycleCreator from '../p2p/CycleCreator'
import * as Self from '../p2p/Self'
import { Utils } from '@shardeum-foundation/lib-types'
import { nestedCountersInstance } from '../utils/nestedCounters'
import * as utils from '../utils'
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum'
// apoptosizeSelf and getOurNodeIndex imported from Self already
import * as NodeList from '../p2p/NodeList'
import { SignedObject } from '@shardeum-foundation/lib-crypto-utils'
import * as Comms from '../p2p/Comms'
import * as ServiceQueue from '../p2p/ServiceQueue'
import * as CycleChain from '../p2p/CycleChain'
import * as Context from '../p2p/Context'
import { profilerInstance } from '../utils/profiler'
import { Node } from '@shardeum-foundation/lib-types/build/src/p2p/NodeListTypes'
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum'
// serializeInjectTxReq and deserializeInjectTxResp imports removed
// shardusFactory import removed
// InjectTxReqSerialized, InjectTxRespSerialized imports removed
import { inspect } from 'util'
import ShardFunctions from '../state-manager/shardFunctions'
import { nodes } from '../p2p/NodeList'
import { isNodeInRotationBounds } from '../p2p/Utils'
import { isValidShardusAddress, inRangeOfCurrentTime } from '../utils'
import { getNetworkTimeOffset } from '../network'
import { ServerMode } from './shardus-types'
import { NonceQueueItem } from '../state-manager/state-manager-types'

export const transactionMethods = {
  /**
   * Submits a transaction to the network
   * Returns an object that tells whether a tx was successful or not and the reason why via the
   * validateTxnFields application SDK function.
   * Throws an error if an application was not provided to shardus.
   *
   * @param tx the TX format is not known to shardus core and can be any object
   * @param set this is an old feaure that can be used by the first node in the network to inject TXs early. candidate for deprecation
   * @param global this is used for injecting a tx that changes a global account completely different consensus is used for these.  see src/p2p/GlobalAccounts.ts
   * @param inputAppData optional opaque app data that can be passed in.  this is forwared to the dapp when precrack is called.
   * @returns
   * {
   *   success: boolean,
   *   reason: string,
   *   staus: number
   * }
   */
  async put(
    tx: ShardusTypes.OpaqueTransaction | ShardusTypes.ReinjectedOpaqueTransaction,
    set = false,
    global = false,
    inputAppData = null
  ): Promise<{ success: boolean; reason: string; status: number; txId?: string }> {
    const noConsensus = set || global
    const txId = this.app.calculateTxId(tx)
    /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455106 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: inject:${shardusGetTime()}`)

    // Check if Consensor is ready to receive txs before processing it further
    if (!this.appProvided) throw new Error('Please provide an App object to Shardus.setup before calling Shardus.put')
    if (logFlags.verbose)
      this.mainLogger.debug(`Start of injectTransaction ${Utils.safeStringify(tx)} set:${set} global:${global}`) // not reducing tx here so we can get the long hashes
    if (!this.stateManager.accountSync.dataSyncMainPhaseComplete) {
      this.statistics.incrementCounter('txRejected')
      nestedCountersInstance.countEvent('rejected', '!dataSyncMainPhaseComplete')
      return { success: false, reason: 'Node is still syncing.', status: 500 }
    }
    if (!this.stateManager.hasCycleShardData()) {
      this.statistics.incrementCounter('txRejected')
      nestedCountersInstance.countEvent('rejected', '!hasCycleShardData')
      return {
        success: false,
        reason: 'Not ready to accept transactions, shard calculations pending',
        status: 500,
      }
    }
    // set === true (which is handled in the else case here) is a special kind of TX that is allowed only be the first node in the network
    // this is used to create global network settings and other dawn of time accounts
    if (set === false) {
      if (!this.p2p.allowTransactions()) {
        if (global === true && this.p2p.allowSet()) {
          // This ok because we are initializing a global at the set time period
        } else {
          if (logFlags.verbose)
            this.mainLogger.debug(`txRejected ${Utils.safeStringify(tx)} set:${set} global:${global}`)

          this.statistics.incrementCounter('txRejected')
          nestedCountersInstance.countEvent('rejected', '!allowTransactions')
          return {
            success: false,
            reason: 'Network conditions to allow transactions are not met.',
            status: 500,
          }
        }
      }
    } else {
      // this is where set is true.  check if we allow it (i.e. only one node active). if not, reject early
      if (!this.p2p.allowSet()) {
        this.statistics.incrementCounter('txRejected')
        nestedCountersInstance.countEvent('rejected', '!allowTransactions2')
        return {
          success: false,
          reason: 'Network conditions to allow app init via set',
          status: 500,
        }
      }
    }

    // Now it is time to check rate limiting to see if our node can accept more transactions
    if (this.rateLimiting.isOverloaded(txId)) {
      //Skip load rejection according to the app
      const isMultiSigFoundationTx = this.app.isMultiSigFoundationTx(tx)
      if (isMultiSigFoundationTx) {
        //dont rate limit multisig txs
        nestedCountersInstance.countEvent('loadRelated', 'permitting foundation tx')
      } else {
        /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455106 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: reject_overload`)
        this.statistics.incrementCounter('txRejected')
        nestedCountersInstance.countEvent('rejected', 'isOverloaded')
        return { success: false, reason: 'Maximum load exceeded.', status: 500 }
      }
    }

    try {
      // Perform basic validation of the transaction fields
      if (logFlags.verbose) this.mainLogger.debug('Performing initial validation of the transaction')

      // inputAppData is a new concept that allows the JSON RPC Server to pass in a TX as well as additional
      // metadata for the dapp.  This data is then passed into precrack to be used for whatever calculations are needed
      let appData: any = inputAppData ?? {}

      const internalTx = this.app.isInternalTx(tx)
      if (internalTx && !this.isInternalTxAllowed()) {
        return {
          success: false,
          reason: `Internal transactions are not allowed in ${this.p2p.networkMode} Mode.`,
          status: 500,
        }
      }
      if (!internalTx && this.p2p.networkMode !== 'processing') {
        return {
          success: false,
          reason: `Application transactions are only allowed in processing Mode.`,
          status: 500,
        }
      }
      if (!internalTx && !this.config.p2p.allowEndUserTxnInjections) {
        return {
          success: false,
          reason: `Application transactions are turned off.`,
          status: 500,
        }
      }

      const senderAddress = this.app.getTxSenderAddress(tx)
      /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455106 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: sender:${senderAddress}`)
      // Forward transaction to a node that has the account data locally if we don't have it
      if (global === false) {
        if (senderAddress == null) {
          return {
            success: false,
            reason: `Sender address is not available.`,
            status: 500,
          }
        }
        const consensusGroup = this.getConsenusGroupForAccount(senderAddress)
        const isConsensusNode = consensusGroup.some((node) => node.id === Self.id)

        if (Context.config.stateManager.forwardToLuckyNodes) {
          if (isConsensusNode === false) {
            // send transaction to lucky consensus group node
            const result = await this.forwardTransactionToLuckyNodes(
              senderAddress,
              tx,
              'non-consensus to consensus',
              '1'
            )
            return result as Promise<{ success: boolean; reason: string; status: number; txId?: string }>
          }
          // careful we may be consensus node but if we are not lucky we should forward to lucky nodes
          let luckyNodeIds = this.getClosestNodes(
            senderAddress,
            Context.config.stateManager.numberOfReInjectNodes,
            false
          )
          let isLuckyNode = luckyNodeIds.some((nodeId) => nodeId === Self.id)
          if (isLuckyNode === false) {
            const result = await this.forwardTransactionToLuckyNodes(
              senderAddress,
              tx,
              'non-lucky consensus to lucky' + ' consensus',
              '2'
            )
            return result as Promise<{ success: boolean; reason: string; status: number; txId?: string }>
          }
        }
      }

      // we are consensus lucky node for this tx
      let shouldAddToNonceQueue = false
      let txNonce
      if (internalTx === false) {
        let senderAccountNonce = await this.app.getAccountNonce(senderAddress)
        txNonce = await this.app.getNonceFromTx(tx)
        /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455106 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: sNonce:${senderAccountNonce}`)
        /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455106 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: txNonce:${txNonce}`)

        if (senderAccountNonce == null) {
          if (this.config.mode === ShardusTypes.ServerMode.Release) {
            return {
              success: false,
              reason: `Sender account nonce is not available. ${utils.stringifyReduce(tx)}`,
              status: 500,
            }
          }
          senderAccountNonce = BigInt(0)
        }

        // app layer should return -1 if the account or tx does not have a nonce field
        if (txNonce >= 0 && senderAccountNonce >= 0) {
          if (txNonce < senderAccountNonce) {
            if (logFlags.debug) this.mainLogger.debug(`txNonce < senderAccountNonce ${txNonce} < ${senderAccountNonce}`)
            nestedCountersInstance.countEvent('rejected', 'txNonce < senderAccountNonce')
            return {
              success: false,
              reason: `Transaction nonce is less than the account nonce. ${txNonce} < ${senderAccountNonce} ${utils.stringifyReduce(
                tx
              )}  `,
              status: 500,
            }
          } else if (txNonce > senderAccountNonce) {
            // if the tx is already in the nonceQueue (based on txid not nonce), return an accepted response
            const txInNonceQueue = this.stateManager.transactionQueue.isTxInPendingNonceQueue(senderAddress, txId)
            if (txInNonceQueue) {
              return {
                success: true,
                reason: `Transaction is already in pending nonce queue.`,
                status: 200,
              }
            }
            if (logFlags.debug)
              this.mainLogger.debug(
                `txNonce > senderAccountNonce ${txNonce} > ${senderAccountNonce} but txId is not in nonce queue yet`
              )

            // decide whether to put it in the nonce queue or not
            const maxAllowedPendingNonce = senderAccountNonce + BigInt(Context.config.stateManager.maxPendingNonceTxs)
            if (txNonce <= maxAllowedPendingNonce) {
              shouldAddToNonceQueue = true
              if (logFlags.debug)
                this.mainLogger.debug(`txNonce > senderAccountNonce ${txNonce} > ${senderAccountNonce}`)
            } else {
              if (logFlags.debug)
                this.mainLogger.debug(
                  `txNonce > senderAccountNonce ${txNonce} > ${senderAccountNonce} + ${Context.config.stateManager.maxPendingNonceTxs}`
                )
              nestedCountersInstance.countEvent('rejected', 'txNonce > senderAccountNonce + maxPendingNonceTxs')
              return {
                success: false,
                reason: `Transaction nonce ${txNonce.toString()} is greater than max allowed pending nonce of ${maxAllowedPendingNonce.toString()}`,
                status: 500,
              }
            }
          }
        }
      }

      const shouldQueueNonceButPoolIsFull =
        shouldAddToNonceQueue &&
        this.config.stateManager.maxNonceQueueSize <= this.stateManager.transactionQueue.nonceQueue.size

      //ITN fix. There will be separate effort to protect the pool more intelligently for mainnet.
      if (shouldQueueNonceButPoolIsFull) {
        /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455106 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: reject_nonce_full`)
        nestedCountersInstance.countEvent('rejected', `Nonce pool is full, try again later`)
        return {
          success: false,
          reason: `Nonce pool is full, try again later`,
          status: 500,
        }
      }
      if (shouldAddToNonceQueue) {
        const nonceQueueEntry: NonceQueueItem = {
          tx,
          txId,
          accountId: senderAddress,
          nonce: txNonce,
          appData,
          global,
          noConsensus,
        }
        let nonceQueueAddResult = this.stateManager.transactionQueue.addTransactionToNonceQueue(nonceQueueEntry)

        if (Context.config.stateManager.forwardToLuckyNodesNonceQueue) {
          // if we ever support cancellation by using replacment for a TX that will change how we
          // need to handle this run-away protection.  may need to re-evaluate later
          if (
            nonceQueueAddResult?.alreadyAdded === true &&
            Context.config.stateManager.forwardToLuckyNodesNonceQueueLimitFix
          ) {
            nestedCountersInstance.countEvent(
              'statistics',
              `forwardTxToConsensusGroup: nonce queue skipped. we already have it`
            )
            return {
              success: true,
              reason: `Transaction already added to pending nonce queue.`,
              status: 200,
            }
          }
          let result = this.forwardTransactionToLuckyNodes(senderAddress, tx, txId, 'consensus to consensus', '3') // don't wait here
          return result as Promise<{ success: boolean; reason: string; status: number; txId?: string }>
        } else {
          return {
            success: true,
            reason: `Transaction added to pending nonce queue.`,
            status: 200,
          }
        }
      } else {
        // tx nonce is equal to account nonce
        let result = await this._timestampAndQueueTransaction(tx, appData, global, noConsensus, 'immediateQueue')

        // start of timestamp logging
        if (logFlags.important_as_error) {
          const txTimestamp = this.app.getTimestampFromTransaction(tx, appData)
          const nowNodeTimestamp = shardusGetTime()
          const ntpOffset = getNetworkTimeOffset()
          /* prettier-ignore */ console.log(`TxnTS: shardus.put() txTimestamp=${txTimestamp}, nowNodeTimestamp=${nowNodeTimestamp}, ntpOffset=${ntpOffset}, txID=${txId}`)
        }
        // end of timestamp logging.

        return result
      }
      // Pass received txs to any subscribed 'DATA' receivers
      // this.io.emit('DATA', tx)
    } catch (err) {
      this.shardus_fatal(`put_ex_` + err.message, `Put: Failed to process transaction. Exception: ${err}`)
      this.fatalLogger.fatal('Put: ' + err.name + ': ' + err.message + ' at ' + err.stack)
      return {
        success: false,
        reason: `Failed to process transaction: ${utils.stringifyReduce(tx)} ${inspect(err)}`,
        status: 500, // 500 status code means transaction is generally failed
      }
    } finally {
      this.profiler.profileSectionEnd('put')
    }
  },

  async forwardTransactionToLuckyNodes(
    senderAddress: string,
    tx: ShardusTypes.OpaqueTransaction,
    txId: string,
    message = '',
    context = ''
  ): Promise<unknown> {
    let closetNodeIds = this.getClosestNodes(senderAddress, Context.config.stateManager.numberOfReInjectNodes, false)
    const cycleShardData = this.stateManager.currentCycleShardData
    const homeNode = ShardFunctions.findHomeNode(
      cycleShardData.shardGlobals,
      senderAddress,
      cycleShardData.parititionShardDataMap
    )
    if (homeNode == null) {
      return { success: false, reason: `Home node not found for account ${senderAddress}`, status: 500 }
    }
    /* prettier-ignore */ if (logFlags.debug || logFlags.rotation) this.mainLogger.debug( `forwardTransactionToLuckyNodes: homeNode: ${homeNode.node.id} closetNodeIds: ${Utils.safeStringify( closetNodeIds.sort() )}` )

    let selectedValidators = []
    if (Self.id != homeNode.node.id)
      selectedValidators.push({
        id: homeNode.node.id,
        ip: homeNode.node.externalIp,
        port: homeNode.node.externalPort,
        publicKey: homeNode.node.publicKey,
      })
    /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455106 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: lucky_forward_homenode_${context} ${NodeList.activeIdToPartition.get(homeNode.node.id)}`)

    let stats = {
      skippedSelf: 0,
      skippedRotation: 0,
      skippedHome: 0,
      ok_inQ: 0,
      ok_inQ2: 0,
      ok_addQ: 0,
    }

    for (const id of closetNodeIds) {
      /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455106 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: lucky_forward_closetnode_${context} ${NodeList.activeIdToPartition.get(id)}`)
      if (id === Self.id) {
        stats.skippedSelf++
        continue
      }
      if (id === homeNode.node.id) {
        stats.skippedHome++
        continue // we already added the home node
      }
      let node = nodes.get(id)

      //is this node safe in terms of rotation
      let rotationCheckPassed = true
      if (Context.config.stateManager.forwardToLuckyNodesCheckRotation) {
        //is in rotation means it in the edge
        rotationCheckPassed = isNodeInRotationBounds(id) === false
      }

      // if the node is not active or not in rotation bounds, skip it
      if (node.status !== 'active' || rotationCheckPassed === false) {
        /* prettier-ignore */ if (logFlags.debug || logFlags.rotation) this.mainLogger.debug( `forwardTransactionToLuckyNodes: node ${id} is not active or in rotation bounds. node.status: ${ node.status } isNodeInRotationBounds: ${isNodeInRotationBounds(id)}` )
        stats.skippedRotation++
        continue
      }
      const validatorDetails = {
        id: node.id,
        ip: node.externalIp,
        port: node.externalPort,
        publicKey: node.publicKey,
      }
      selectedValidators.push(validatorDetails)
    }

    let successCount = 0
    let failedCount = 0
    for (const validator of selectedValidators) {
      try {
        /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455106 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: lucky_forward_req_${context} ${NodeList.activeIdToPartition.get(validator.id)}`)

        if (validator.id === homeNode.node.id) {
          /* prettier-ignore */ if (logFlags.debug || logFlags.rotation) this.mainLogger.debug( `Forwarding injected tx ${txId} to home node ${validator.id} reason: ${message} ${Utils.safeStringify(tx)}` )
          nestedCountersInstance.countEvent('statistics', `forwardTxToHomeNode: ${message}`)
        } else {
          /* prettier-ignore */ if (logFlags.debug || logFlags.rotation) this.mainLogger.debug( `Forwarding injected tx ${txId} to consensus group. reason: ${message} ${Utils.safeStringify(tx)}` )
          nestedCountersInstance.countEvent('statistics', `forwardTxToConsensusGroup: ${message}`)
        }

        const result: ShardusTypes.InjectTxResponse = await this.app.injectTxToConsensor([validator], tx)

        if (result == null) {
          /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455106 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: lucky_forward_null_${context} ${NodeList.activeIdToPartition.get(validator.id)}`)
          /* prettier-ignore */ if (logFlags.debug || logFlags.rotation) this.mainLogger.debug( `Got null/undefined response upon forwarding injected tx: ${txId} to node ${validator.id}` )
          failedCount++
          continue
        }
        if (result && result.success === false) {
          /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455106 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: lucky_forward_false_${context} ${NodeList.activeIdToPartition.get(validator.id)}`)
          /* prettier-ignore */ if (logFlags.debug || logFlags.rotation) this.mainLogger.debug( `Got unsuccessful response upon forwarding injected tx: ${validator.id}. ${message} ${Utils.safeStringify(tx)}` )
          failedCount++
          continue
        }
        if (result && result.success === true) {
          /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455106 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: lucky_forward_success_${context} ${NodeList.activeIdToPartition.get(validator.id)}`)
          /* prettier-ignore */ if (logFlags.debug || logFlags.rotation) this.mainLogger.debug( `Got successful response upon forwarding injected tx: ${validator.id}. ${message} ${Utils.safeStringify(tx)}` )

          if (result.reason === 'Transaction is already in pending nonce queue.') {
            stats.ok_inQ++
          }
          if (result.reason === `Transaction already added to pending nonce queue.`) {
            stats.ok_inQ2++
          }
          if (result.reason === `Transaction added to pending nonce queue.`) {
            stats.ok_addQ++
          }

          nestedCountersInstance.countEvent(
            'statistics',
            `forward to lucky node success ${message} ${Utils.safeStringify(stats)}`
          )
          if (Context.config.stateManager.forwardToLuckyMulti) {
            successCount++
            continue
          }
          return { success: true, reason: 'Transaction forwarded to validators', status: 200 }
        }
      } catch (e) {
        /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455106 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: lucky_forward_ex_${context} ${NodeList.activeIdToPartition.get(validator.id)}`)
        /* prettier-ignore */ if (logFlags.debug || logFlags.rotation) this.mainLogger.error( `Forwarding injected tx to ${validator.id} failed. ${message} ${Utils.safeStringify(tx)} error: ${ e.stack }` )
      }
    }

    if (successCount > 0) {
      /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455106 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: lucky_forward_success_${context}`)
      /* prettier-ignore */ if (logFlags.debug || logFlags.rotation) this.mainLogger.debug( `Got successful response upon forwarding injected tx: ${message} ${Utils.safeStringify(tx)}` )
      nestedCountersInstance.countEvent(
        'statistics',
        `forward to luck success ${message} failed/success/total: ${failedCount}/${successCount}/${selectedValidators.length}`
      )
      return { success: true, reason: 'Transaction forwarded to validators', status: 200 }
    }

    nestedCountersInstance.countEvent('statistics', `forward failed: ${message} ${Utils.safeStringify(stats)}`)
    /* prettier-ignore */ if (logFlags.debug || logFlags.rotation) this.mainLogger.error( `Forwarding injected tx out of tries. ${Utils.safeStringify(stats)} ${Utils.safeStringify(tx)} ` )
    return { success: false, reason: 'No validators found to forward the transaction', status: 500 }
  },

  async _timestampAndQueueTransaction(
    tx: ShardusTypes.OpaqueTransaction,
    appData: any,
    global = false,
    noConsensus = false,
    loggingContext = ''
  ) {
    // Give the dapp an opportunity to do some up front work and generate
    // appData metadata for the applied TX
    const { status: preCrackSuccess, reason } = await this.app.txPreCrackData(tx, appData)
    if (this.config.stateManager.checkPrecrackStatus === true && preCrackSuccess === false) {
      return {
        success: false,
        reason: `PreCrack has failed. ${reason}`,
        status: 500,
      }
    }

    const injectedTimestamp = this.app.getTimestampFromTransaction(tx, appData)

    const txId = this.app.calculateTxId(tx)
    let timestampReceipt: ShardusTypes.TimestampReceipt
    let isMissingInjectedTimestamp = !injectedTimestamp || injectedTimestamp === -1
    if (isMissingInjectedTimestamp) {
      if (injectedTimestamp === -1) {
        /* prettier-ignore */
        if (logFlags.p2pNonFatal && logFlags.console) console.log("Dapp request to generate a new timestmap for the tx");
      }
      timestampReceipt = await this.stateManager.transactionConsensus.askTxnTimestampFromNode(txId)
      /* prettier-ignore */
      if (logFlags.p2pNonFatal && logFlags.console) console.log("Network generated a" +
        " timestamp", txId, timestampReceipt);
    }
    if (isMissingInjectedTimestamp && !timestampReceipt) {
      this.shardus_fatal('put_noTimestamp', `Transaction timestamp cannot be determined ${utils.stringifyReduce(tx)} `)
      this.statistics.incrementCounter('txRejected')
      nestedCountersInstance.countEvent('rejected', `_timestampNotDetermined-${loggingContext}`)
      return {
        success: false,
        reason: 'Transaction timestamp cannot be determined.',
        status: 500,
      }
    }
    let timestampedTx: ShardusTypes.TimestampedTx
    if (timestampReceipt && timestampReceipt.timestamp) {
      timestampedTx = {
        tx,
        timestampReceipt,
      }
    } else {
      timestampedTx = { tx }
    }

    // Perform fast validation of the transaction fields
    const validateResult = this.app.validate(timestampedTx, appData)
    if (validateResult.success === false) {
      // 400 is a code for bad tx or client faulty
      validateResult.status = validateResult.status ? validateResult.status : 400
      return validateResult
    }

    // Ask App to crack open tx and return timestamp, id (hash), and keys
    const { timestamp, id, keys, shardusMemoryPatterns } = this.app.crack(timestampedTx, appData)

    const uniqueTags = this.app.getUniqueAppTags?.(tx)
    if (uniqueTags && Object.keys(uniqueTags).length > 0) {
      const result = this.stateManager.transactionQueue.findEntryWithAnyTag(uniqueTags)
      if (result) {
        const { entry: existingEntry, matchedKey, matchedValue } = result

        if (logFlags.important_as_error) {
          this.mainLogger.debug(
            `Transaction rejected - unique app tag key ${matchedKey} with value ${matchedValue} already in use by tx: ${existingEntry.acceptedTx.txId}`
          )
        }

        nestedCountersInstance.countEvent('rejected', 'duplicateUniqueAppTag')
        return {
          success: false,
          reason: `Transaction contains a unique app tag key ${matchedKey} with value ${matchedValue} that is already in use`,
          status: 400,
        }
      }
    }

    // console.log('app.crack results', timestamp, id, keys)

    if (this.config.stateManager.checkDestLimits) {
      try {
        // does this TX need to be gated for potential infulencer-mode effects
        const isDestLimitTx = this.app.isDestLimitTx(appData)
        // this code must be upgraded before we turn the EVM on
        if (isDestLimitTx && keys.targetKeys?.length > 0) {
          const addressToCheck = keys.targetKeys[0]
          const addressHitLimit = this.config.stateManager.checkDestLimitCount
          // Add comprehensive check for addressToCheck validness
          if (addressToCheck && typeof addressToCheck === 'string' && addressToCheck.trim() !== '') {
            const addressSeenCount = this.stateManager.transactionQueue.addressCountInQueue(
              addressToCheck,
              addressHitLimit
            )
            if (addressSeenCount >= addressHitLimit) {
              /* prettier-ignore */ if(logFlags.error) this.shardus_fatal( `put_destLimitExceeded`, `Transaction has too many addresses in the queue: ${addressToCheck} ${utils.stringifyReduce(tx)}` )
              this.statistics.incrementCounter('txRejected')
              nestedCountersInstance.countEvent('rejected', `addressSeenCount > ${addressHitLimit}`)
              nestedCountersInstance.countEvent('destLimitCheck', `rejected addressSeenCount > ${addressHitLimit}`)
              return { success: false, reason: 'Same destination load limit', status: 400 }
            } else {
              nestedCountersInstance.countEvent('destLimitCheck', `admitted: ${addressSeenCount}`)
            }
          }
        }
      } catch (err) {
        // Log the error but continue processing the transaction
        this.mainLogger.error(`Error in destination limit check: ${utils.formatErrorMessage(err)}`)
        nestedCountersInstance.countEvent('destLimitCheck', 'error in check, error: ' + err?.message)
        // if our dest check fails we must reject this tx
        return { success: false, reason: 'Same destination load limit error', status: 400 }
      }
    }

    // Validate the transaction's sourceKeys & targetKeys
    if (this.config.debug.checkAddressFormat && !isValidShardusAddress(keys.allKeys)) {
      this.shardus_fatal(
        `put_invalidAddress`,
        `Invalid Shardus Address found: allKeys:${keys.allKeys} ${utils.stringifyReduce(tx)}`
      )
      this.statistics.incrementCounter('txRejected')
      nestedCountersInstance.countEvent('rejected', '_hasInvalidShardusAddresses')
      return { success: false, reason: 'Invalid Shardus Addresses', status: 400 }
    }
    // Validate the transaction timestamp
    let txExpireTimeMs = this.config.transactionExpireTime * 1000

    if (global) {
      txExpireTimeMs = 2 * 10 * 1000 //todo consider if this should be a config.
    }

    if (inRangeOfCurrentTime(timestamp, txExpireTimeMs, txExpireTimeMs) === false) {
      /* prettier-ignore */
      this.shardus_fatal(`tx_outofrange`, `Transaction timestamp out of range: timestamp:${timestamp} now:${shardusGetTime()} diff(now-ts):${shardusGetTime() - timestamp}  ${utils.stringifyReduce(tx)} our offset: ${getNetworkTimeOffset()} loggingContext: ${loggingContext}`);
      this.statistics.incrementCounter('txRejected')
      nestedCountersInstance.countEvent('rejected', 'transaction timestamp out of range')
      return { success: false, reason: 'Transaction timestamp out of range', status: 400 }
    }

    this.profiler.profileSectionStart('put')

    //as ShardusMemoryPatternsInput
    // Pack into acceptedTx, and pass to StateManager
    const acceptedTX: ShardusTypes.AcceptedTx = {
      timestamp,
      txId: id,
      keys,
      data: timestampedTx,
      appData,
      shardusMemoryPatterns: shardusMemoryPatterns,
    }
    if (logFlags.verbose) this.mainLogger.debug('Transaction validated')
    if (global === false) {
      //temp way to make global modifying TXs not over count
      this.statistics.incrementCounter('txInjected')
    }
    this.logger.playbackLogNote('tx_injected', `${txId}`, `Transaction: ${utils.stringifyReduce(timestampedTx)}`)
    let added = this.stateManager.transactionQueue.routeAndQueueAcceptedTransaction(
      acceptedTX,
      /*send gossip*/ true,
      null,
      global,
      noConsensus
    )
    if (logFlags.verbose) {
      this.mainLogger.debug(`End of injectTransaction ${utils.stringifyReduce(tx)}, added: ${added}`)
    }

    return {
      success: true,
      reason: 'Transaction queued, poll for results.',
      status: 200, // 200 status code means transaction is generally successful
      txId,
    }
  }
}

