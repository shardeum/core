import { CycleRecord } from '@shardeum-foundation/lib-types/build/src/p2p/CycleCreatorTypes'
import { P2P as P2PTypes, StateManager as StateManagerTypes } from '@shardeum-foundation/lib-types'
import { Logger as log4jLogger } from 'log4js'
import StateManager from '.'
import Crypto from '../crypto'
import Logger, { logFlags } from '../logger'
import * as Comms from '../p2p/Comms'
import * as Context from '../p2p/Context'
import { P2PModuleContext as P2P } from '../p2p/Context'
import * as CycleChain from '../p2p/CycleChain'
import * as Self from '../p2p/Self'
import * as Shardus from '../shardus/shardus-types'
import { TimestampReceipt } from '../shardus/shardus-types'
import Storage from '../storage'
import * as utils from '../utils'
import { Ordering, pickIndexBasedOnHash } from '../utils'
import { nestedCountersInstance } from '../utils/nestedCounters'
import Profiler, { cUninitializedSize, profilerInstance } from '../utils/profiler'
import ShardFunctions from './shardFunctions'
import * as NodeList from '../p2p/NodeList'
import {
  AppliedReceipt,
  AppliedVote,
  AppliedVoteHash,
  AppliedVoteQuery,
  AppliedVoteQueryResponse,
  ConfirmOrChallengeMessage,
  ConfirmOrChallengeQuery,
  ConfirmOrChallengeQueryResponse,
  GetAccountData3Req,
  GetAccountData3Resp,
  QueueEntry,
  WrappedResponses,
  TimestampRemoveRequest,
  Proposal,
  Vote,
  SignedReceipt,
} from './state-manager-types'
import { ipInfo, shardusGetTime } from '../network'
import { robustQuery } from '../p2p/Utils'
import { SignedObject } from '@shardeum-foundation/lib-crypto-utils'
import { isDebugModeMiddleware } from '../network/debugMiddleware'
import { GetAccountDataReqSerializable, serializeGetAccountDataReq } from '../types/GetAccountDataReq'
import { GetAccountDataRespSerializable, deserializeGetAccountDataResp } from '../types/GetAccountDataResp'
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum'
import { InternalBinaryHandler } from '../types/Handler'
import { Route } from '@shardeum-foundation/lib-types/build/src/p2p/P2PTypes'
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum'
import { getStreamWithTypeCheck, requestErrorHandler } from '../types/Helpers'
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum'
import {
  deserializeGetTxTimestampResp,
  getTxTimestampResp,
  serializeGetTxTimestampResp,
} from '../types/GetTxTimestampResp'
import { deserializeGetTxTimestampReq, getTxTimestampReq, serializeGetTxTimestampReq } from '../types/GetTxTimestampReq'
import { SpreadAppliedVoteHashReq, serializeSpreadAppliedVoteHashReq } from '../types/SpreadAppliedVoteHashReq'
import {
  GetConfirmOrChallengeReq,
  deserializeGetConfirmOrChallengeReq,
  serializeGetConfirmOrChallengeReq,
} from '../types/GetConfirmOrChallengeReq'
import {
  GetConfirmOrChallengeResp,
  deserializeGetConfirmOrChallengeResp,
  serializeGetConfirmOrChallengeResp,
} from '../types/GetConfirmOrChallengeResp'
import { GetAppliedVoteReq, deserializeGetAppliedVoteReq, serializeGetAppliedVoteReq } from '../types/GetAppliedVoteReq'
import {
  GetAppliedVoteResp,
  deserializeGetAppliedVoteResp,
  serializeGetAppliedVoteResp,
} from '../types/GetAppliedVoteResp'
import { BadRequest, InternalError, NotFound, serializeResponseError } from '../types/ResponseError'
import { randomUUID } from 'crypto'
import { Utils } from '@shardeum-foundation/lib-types'
import {
  PoqoSendReceiptReq,
  deserializePoqoSendReceiptReq,
  serializePoqoSendReceiptReq,
} from '../types/PoqoSendReceiptReq'
import { deserializePoqoDataAndReceiptResp } from '../types/PoqoDataAndReceiptReq'
import { deserializePoqoSendVoteReq, serializePoqoSendVoteReq } from '../types/PoqoSendVoteReq'
import { RequestReceiptForTxReqSerialized, serializeRequestReceiptForTxReq } from '../types/RequestReceiptForTxReq'
import { RequestReceiptForTxRespSerialized, deserializeRequestReceiptForTxResp } from '../types/RequestReceiptForTxResp'
import { removeDuplicateSignatures } from '../utils/functions/signs'
import { handlerMethods } from './TransactionConsensus.handlers'

class TransactionConsenus {
  app: Shardus.App
  crypto: Crypto
  config: Shardus.StrictServerConfiguration
  profiler: Profiler

  logger: Logger
  p2p: P2P
  storage: Storage
  stateManager: StateManager

  mainLogger: log4jLogger
  seqLogger: log4jLogger
  fatalLogger: log4jLogger
  shardLogger: log4jLogger
  statsLogger: log4jLogger
  statemanager_fatal: (key: string, log: string) => void

  txTimestampCache: Map<number | string, Map<string, TimestampReceipt>>
  txTimestampCacheByTxId: Map<string, TimestampReceipt>
  seenTimestampRequests: Set<string>

  produceBadVote: boolean
  produceBadChallenge: boolean
  debugFailPOQo: number

  // Methods from split files
  setupHandlers: () => void

  constructor(
    stateManager: StateManager,
    profiler: Profiler,
    app: Shardus.App,
    logger: Logger,
    storage: Storage,
    p2p: P2P,
    crypto: Crypto,
    config: Shardus.StrictServerConfiguration
  ) {
    this.crypto = crypto
    this.app = app
    this.logger = logger
    this.config = config
    this.profiler = profiler
    this.p2p = p2p
    this.storage = storage
    this.stateManager = stateManager

    this.mainLogger = logger.getLogger('main')
    this.seqLogger = logger.getLogger('seq')
    this.fatalLogger = logger.getLogger('fatal')
    this.shardLogger = logger.getLogger('shardDump')
    this.statsLogger = logger.getLogger('statsDump')
    this.statemanager_fatal = stateManager.statemanager_fatal
    this.txTimestampCache = new Map()
    this.txTimestampCacheByTxId = new Map()
    this.seenTimestampRequests = new Set()

    this.produceBadVote = this.config.debug.produceBadVote
    this.produceBadChallenge = this.config.debug.produceBadChallenge
    this.debugFailPOQo = 0

    // Bind methods from split files
    Object.assign(TransactionConsenus.prototype, handlerMethods)
  }

  verifyAppliedReceipt(receipt: SignedReceipt, executionGroupNodes: Set<string>): boolean {
    if (!receipt.sign) {
      // Missing final sign by aggregator
      return false
    }

    if (!executionGroupNodes.has(receipt.sign.owner)) {
      // aggregator not in execution group
      return false
    }

    if (!this.crypto.verify(receipt as SignedObject, receipt.sign.owner)) {
      // Final aggregator sign is invalid
      return false
    }

    // Remove duplicates signatures
    receipt.signaturePack = removeDuplicateSignatures(receipt.signaturePack)

    if (receipt.signaturePack.length !== receipt.voteOffsets.length) {
      // Invalid receipt
      return false
    }

    let validSignatures = 0
    const appliedVoteHash: AppliedVoteHash = {
      txid: receipt.proposal.txid,
      voteHash: receipt.proposalHash,
      voteTime: 0,
    }

    if (receipt.proposalHash !== this.stateManager.transactionConsensus.calculateVoteHash(receipt.proposal)) {
      return false
    }

    for (let i = 0; i < receipt.signaturePack.length; i++) {
      const sign = receipt.signaturePack[i]
      if (!executionGroupNodes.has(sign.owner)) continue
      appliedVoteHash.voteTime = receipt.voteOffsets[i]
      const signedObject = { ...appliedVoteHash, sign }
      if (this.crypto.verify(signedObject, sign.owner)) {
        validSignatures++
      }
    }

    const totalNodes = Math.max(executionGroupNodes.size, this.config.sharding.nodesPerConsensusGroup)
    const requiredMajority = Math.ceil(totalNodes * this.config.p2p.requiredVotesPercentage)
    return validSignatures >= requiredMajority
  }

  async poqoVoteSendLoop(queueEntry: QueueEntry, appliedVoteHash: AppliedVoteHash): Promise<void> {
    queueEntry.poqoNextSendIndex = 0
    const aggregatorList = queueEntry.executionGroup
    while (!queueEntry.signedReceipt) {
      if (queueEntry.poqoNextSendIndex >= aggregatorList.length) {
        // Maybe use modulous to wrap around
        break
      }
      nestedCountersInstance.countEvent('poqo', `At index ${queueEntry.poqoNextSendIndex} in poqoVoteSendLoop`)
      const voteReceivers = aggregatorList.slice(
        queueEntry.poqoNextSendIndex,
        queueEntry.poqoNextSendIndex + this.config.stateManager.poqobatchCount
      )
      queueEntry.poqoNextSendIndex += this.config.stateManager.poqobatchCount

      // Update applyTimestamp with every sending iteration
      const updatedVoteHash: AppliedVoteHash = {
        txid: appliedVoteHash.txid,
        voteHash: appliedVoteHash.voteHash,
        voteTime: Math.ceil((shardusGetTime() - queueEntry.acceptedTx.timestamp) / 1000),
      }
      // Need to sign again with the new voteTime
      const newHash = this.crypto.sign(updatedVoteHash)

      // Send vote to the selected aggregator in the priority list
      Comms.tellBinary<AppliedVoteHash>(
        voteReceivers,
        InternalRouteEnum.binary_poqo_send_vote,
        newHash,
        serializePoqoSendVoteReq,
        {}
      )
      await utils.sleep(this.config.stateManager.poqoloopTime)
    }
  }

  getOrGenerateTimestampReceiptFromCache(
    txId: string,
    cycleMarker: string,
    cycleCounter: CycleRecord['counter']
  ): TimestampReceipt {
    if (this.txTimestampCache.has(cycleCounter) && this.txTimestampCache.get(cycleCounter).has(txId)) {
      const tsReceipt = this.txTimestampCache.get(cycleCounter).get(txId)
      /* prettier-ignore */ this.mainLogger.debug(`get_tx_timestamp handler: Found timestamp cache for txId: ${txId}, timestamp: ${Utils.safeStringify(tsReceipt)}`)
      return tsReceipt
    } else if (Context.config.p2p.timestampCacheFix && this.txTimestampCacheByTxId.has(txId)) {
      const tsReceipt = this.txTimestampCacheByTxId.get(txId)
      /* prettier-ignore */ this.mainLogger.debug(`get_tx_timestamp handler: Found timestamp cache for txId in cacheById: ${txId}, timestamp: ${Utils.safeStringify(tsReceipt)}`)
      nestedCountersInstance.countEvent('consensus', 'get_tx_timestamp found tx timestamp in cacheById')
      return tsReceipt
    }
    // Ensure the cycleCounter is within the acceptable range relative to lastest cycle number. If the absolute difference is greater than 1, return null to indicate an invalid state.
    if (Math.abs(cycleCounter - CycleChain.newest.counter) > 1) {
      return null
    }
    if (this.txTimestampCache.size >= Context.config.p2p.timestampCacheFixSize) {
      const oldestCycleCounter = [...this.txTimestampCache.keys()][0]
      const txMap = this.txTimestampCache.get(oldestCycleCounter)
      if (txMap && txMap.size > 0) {
        const oldestTxId = [...txMap.keys()][0]
        txMap.delete(oldestTxId)
      }
      if (txMap.size === 0) {
        this.txTimestampCache.delete(oldestCycleCounter)
      }
    }
    const tsReceipt: TimestampReceipt = {
      txId,
      cycleMarker,
      cycleCounter,
      // shardusGetTime() was replaced with shardusGetTime() so we can have a more reliable timestamp consensus
      timestamp: shardusGetTime(),
    }
    const signedTsReceipt = this.crypto.sign(tsReceipt)
    /* prettier-ignore */ this.mainLogger.debug(`Timestamp receipt generated for txId ${txId}: ${utils.stringifyReduce(signedTsReceipt)}`)

    // caching ts receipt for later nodes
    if (!this.txTimestampCache.has(signedTsReceipt.cycleCounter)) {
      this.txTimestampCache.set(signedTsReceipt.cycleCounter, new Map())
    }

    // cache to txId map
    this.txTimestampCache.get(signedTsReceipt.cycleCounter).set(txId, signedTsReceipt)
    if (Context.config.p2p.timestampCacheFix) {
      if (this.txTimestampCacheByTxId.size >= Context.config.p2p.timestampCacheFixSize) {
        const oldestTxId = [...this.txTimestampCacheByTxId.keys()][0]
        this.txTimestampCacheByTxId.delete(oldestTxId)
        this.seenTimestampRequests.delete(oldestTxId)
      }
      // eslint-disable-next-line security/detect-object-injection
      this.txTimestampCacheByTxId.set(txId, signedTsReceipt)
      this.seenTimestampRequests.add(txId)
    }
    /* prettier-ignore */ this.mainLogger.debug(`Timestamp receipt cached for txId ${txId} in cycle ${signedTsReceipt.cycleCounter}: ${utils.stringifyReduce(signedTsReceipt)}`)
    return signedTsReceipt
  }

  pruneTxTimestampCache(): void {
    let cycleToKeepCache = 1
    if (Context.config.p2p.timestampCacheFix) {
      cycleToKeepCache = 2
    }

    for (const [cycleCounter, txMap] of this.txTimestampCache.entries()) {
      const cycleCounterInt = parseInt(cycleCounter as string)
      const shouldPruneThisCounter = cycleCounterInt + cycleToKeepCache < CycleChain.newest.counter
      if (shouldPruneThisCounter) {
        for (const txId of txMap.keys()) {
          if (Context.config.p2p.timestampCacheFix) {
            this.txTimestampCacheByTxId.delete(txId)
            this.seenTimestampRequests.delete(txId)
          }
        }
        this.txTimestampCache.delete(cycleCounter)
      }
    }

    if (logFlags.debug) this.mainLogger.debug(`Pruned tx timestamp cache.`)
  }

  async askTxnTimestampFromNode(txId: string): Promise<Shardus.TimestampReceipt | null> {
    const tsReceiptGenerator = this.getTxTimestampGeneratingNode(txId)
    const cycleMarker = CycleChain.getCurrentCycleMarker()
    const cycleCounter = CycleChain.newest.counter
    /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug('Asking timestamp from node', tsReceiptGenerator)
    if (tsReceiptGenerator.id === Self.id) {
      // we generate the tx timestamp by ourselves
      return this.getOrGenerateTimestampReceiptFromCache(txId, cycleMarker, cycleCounter)
    } else {
      let timestampReceipt
      try {
        /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455101 ${shardusGetTime()} tx:${txId} ${NodeList.activeIdToPartition.get(Self.id)}-->>${NodeList.activeIdToPartition.get(tsReceiptGenerator.id)}: ${'get_tx_timestamp'}`)
        const serialized_res = await this.p2p.askBinary<getTxTimestampReq, getTxTimestampResp>(
          tsReceiptGenerator,
          InternalRouteEnum.binary_get_tx_timestamp,
          {
            cycleMarker,
            cycleCounter,
            txId,
          },
          serializeGetTxTimestampReq,
          deserializeGetTxTimestampResp,
          {},
          '',
          false,
          this.config.p2p.getTxTimestampTimeoutOffset ?? 0
        )

        timestampReceipt = serialized_res
      } catch (e) {
        /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`Error asking timestamp from node ${tsReceiptGenerator.publicKey}: ${e.message}`)
        return null
      }

      // this originiates from network/ask level, isResponse might get added at any step to this object
      // This line will remove the isResponse property from timestampReceipt if it exists. If it doesn't exist, nothing happens, and the program continues to run without any issues.
      delete timestampReceipt.isResponse

      const isValid = this.crypto.verify(timestampReceipt, tsReceiptGenerator.publicKey)
      if (isValid) {
        /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`Timestamp receipt received from home node. TxId: ${txId} isValid: ${isValid}, timestampReceipt: ${Utils.safeStringify(timestampReceipt)}`)
        return timestampReceipt
      } else {
        /* prettier-ignore */ if (logFlags.fatal) this.mainLogger.fatal(`Timestamp receipt received from home node ${tsReceiptGenerator.publicKey} is not valid. ${utils.stringifyReduce(timestampReceipt)}`)
        return null
      }
    }
  }

  private getTxTimestampGeneratingNode(txId: string): P2PTypes.NodeListTypes.Node {
    const activeFoundationNodes = Context.stateManager.currentCycleShardData.activeFoundationNodes
    if (
      this.config.p2p.preferFoundationNodesForTimestamp &&
      this.config.p2p.foundationNodeThreshold <= activeFoundationNodes.length
    ) {
      /* prettier-ignore */ nestedCountersInstance.countEvent('consensus', 'get_tx_timestamp: using foundation nodes')
      const pickedIndex = pickIndexBasedOnHash(activeFoundationNodes.length, txId)
      // eslint-disable-next-line security/detect-object-injection
      if (logFlags.debug)
        this.mainLogger.debug(
          `Using foundation nodes for timestamp generation for txId: ${txId} using ${activeFoundationNodes[pickedIndex].publicKey}`
        )
      // eslint-disable-next-line security/detect-object-injection
      return activeFoundationNodes[pickedIndex]
    }
    const homeNode = ShardFunctions.findHomeNode(
      Context.stateManager.currentCycleShardData.shardGlobals,
      txId,
      Context.stateManager.currentCycleShardData.parititionShardDataMap
    )
    /* prettier-ignore */ nestedCountersInstance.countEvent('consensus', 'get_tx_timestamp: using non-foundation nodes')
    return homeNode.node
  }

  /**
   * hasAppliedReceiptMatchingPreApply
   * check if our data matches our vote
   * If the vote was for an appliable, on failed result then check if our local data
   * that is ready to be committed will match the receipt
   *
   * @param queueEntry
   */
  hasAppliedReceiptMatchingPreApply(queueEntry: QueueEntry, signedReceipt: SignedReceipt): boolean {
    if (queueEntry.preApplyTXResult == null || queueEntry.preApplyTXResult.applyResponse == null) {
      /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`hasAppliedReceiptMatchingPreApply  ${queueEntry.logID} preApplyTXResult == null or applyResponse == null`)
      return false
    }
    // This is much easier than the old way
    if (queueEntry.ourVote) {
      const receipt = queueEntry.signedReceipt
      if (receipt != null && queueEntry.ourVoteHash != null) {
        const receiptVoteHash = this.calculateVoteHash(receipt.proposal)
        if (receiptVoteHash === queueEntry.ourVoteHash) {
          return true
        } else {
          /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`hasAppliedReceiptMatchingPreApply  ${queueEntry.logID} voteHashes do not match, ${receiptVoteHash} != ${queueEntry.ourVoteHash} `)
          return false
        }
      }
      return false
    }

    if (signedReceipt == null) {
      return false
    }

    if (queueEntry.ourVote == null) {
      /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`hasAppliedReceiptMatchingPreApply  ${queueEntry.logID} ourVote == null`)
      return false
    }

    if (signedReceipt != null) {
      if (signedReceipt.proposal.applied !== queueEntry.ourProposal.applied) {
        /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`hasAppliedReceiptMatchingPreApply  ${queueEntry.logID} ${signedReceipt.proposal.applied}, ${queueEntry.ourProposal.applied} signedReceipt.result !== queueEntry.ourProposal.applied`)
        return false
      }
      if (signedReceipt.proposal.txid !== queueEntry.ourProposal.txid) {
        /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`hasAppliedReceiptMatchingPreApply  ${queueEntry.logID} signedReceipt.txid !== queueEntry.ourProposal.txid`)
        return false
      }
      if (signedReceipt.signaturePack.length === 0) {
        /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`hasAppliedReceiptMatchingPreApply  ${queueEntry.logID} signedReceipt.signaturePack.length == 0`)
        return false
      }

      if (signedReceipt.proposal.cant_preApply === true) {
        // TODO STATESHARDING4 NEGATIVECASE    need to figure out what to do here
        /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`hasAppliedReceiptMatchingPreApply  ${queueEntry.logID} signedReceipt.proposal.cant_preApply === true`)
        //If the network votes for cant_apply then we wouldn't need to patch.  We return true here
        //but outside logic will have to know to check cant_apply flag and make sure to not commit data
        return true
      }

      //we return true for a false receipt because there is no need to repair our data to match the receipt
      //it is already checked above if we matched the result
      if (signedReceipt.proposal.applied === false) {
        /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`hasAppliedReceiptMatchingPreApply  ${queueEntry.logID} applied===false Good Match`)
        return true
      }

      //test our data against a winning vote in the receipt
      let wrappedStates = this.stateManager.useAccountWritesOnly ? {} : queueEntry.collectedData

      let wrappedStateKeys = Object.keys(queueEntry.collectedData)
      // const vote = appliedReceipt.appliedVotes[0] //all votes are equivalent, so grab the first

      // Iff we have accountWrites, then overwrite the keys and wrapped data
      const appOrderedKeys = []
      const writtenAccountsMap: WrappedResponses = {}
      const applyResponse = queueEntry?.preApplyTXResult?.applyResponse
      if (applyResponse.accountWrites != null && applyResponse.accountWrites.length > 0) {
        for (const wrappedAccount of applyResponse.accountWrites) {
          appOrderedKeys.push(wrappedAccount.accountId)
          writtenAccountsMap[wrappedAccount.accountId] = wrappedAccount.data
        }
        wrappedStateKeys = appOrderedKeys
        //override wrapped states with writtenAccountsMap which should be more complete if it included
        wrappedStates = writtenAccountsMap
      }

      // Not sure if we should keep this.  it may only come up in error cases that would not be using final data in the repair?
      //If we are not in the execution home then use data that was sent to us for the commit
      // if(queueEntry.globalModification === false && this.stateManager.transactionQueue.executeInOneShard && queueEntry.isInExecutionHome === false){
      //   wrappedStates = {}
      //   let timestamp = queueEntry.acceptedTx.timestamp
      //   for(let key of Object.keys(queueEntry.collectedFinalData)){
      //     let finalAccount = queueEntry.collectedFinalData[key]
      //     let accountId = finalAccount.accountId
      //     let prevStateCalc = wrappedStates[accountId] ? wrappedStates[accountId].stateId : ''
      //     /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`hasAppliedReceiptMatchingPreApply collectedFinalData tx:${queueEntry.logID} ts:${timestamp} ${utils.makeShortHash(finalAccount)} preveStateID: ${finalAccount.prevStateId } vs expected: ${prevStateCalc}`)

      //     wrappedStates[key] = finalAccount
      //   }
      //   /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`hasAppliedReceiptMatchingPreApply collectedFinalData tx:${queueEntry.logID} ts:${timestamp} accounts: ${utils.stringifyReduce(Object.keys(wrappedStates))}  `)
      // }

      for (let j = 0; j < signedReceipt.proposal.accountIDs.length; j++) {
        /* eslint-disable security/detect-object-injection */
        const id = signedReceipt.proposal.accountIDs[j]
        const hash = signedReceipt.proposal.afterStateHashes[j]
        let found = false
        for (const key of wrappedStateKeys) {
          const wrappedState = wrappedStates[key]
          if (wrappedState.accountId === id) {
            found = true
            // I don't believe this leaks timing info over the net
            // eslint-disable-next-line security/detect-possible-timing-attacks
            if (wrappedState.stateId !== hash) {
              /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`hasAppliedReceiptMatchingPreApply  ${queueEntry.logID} state does not match id:${utils.stringifyReduce(id)} hash:${utils.stringifyReduce(wrappedState.stateId)} votehash:${utils.stringifyReduce(hash)}`)
              return false
            }
          }
        }
        if (found === false) {
          /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`hasAppliedReceiptMatchingPreApply  ${queueEntry.logID} state does not match missing id:${utils.stringifyReduce(id)} `)
          /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`hasAppliedReceiptMatchingPreApply  ${queueEntry.logID} collectedData:${utils.stringifyReduce(Object.keys(queueEntry.collectedData))} `)

          return false
        }
        /* eslint-enable security/detect-object-injection */
      }

      /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`hasAppliedReceiptMatchingPreApply  ${queueEntry.logID} Good Match`)
      /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('hasAppliedReceiptMatchingPreApply', `${queueEntry.logID}`, `  Good Match`)
    }

    return true
  }

  /**
   * tryProduceReceipt
   * try to produce an AppliedReceipt
   * if we can't do that yet return null
   *
   * @param queueEntry
   */
  async tryProduceReceipt(queueEntry: QueueEntry): Promise<SignedReceipt> {
    this.profiler.profileSectionStart('tryProduceReceipt')
    if (logFlags.profiling_verbose) this.profiler.scopedProfileSectionStart('tryProduceReceipt')
    try {
      if (queueEntry.waitForReceiptOnly === true) {
        if (logFlags.debug) this.mainLogger.debug(`tryProduceReceipt ${queueEntry.logID} waitForReceiptOnly === true`)
        nestedCountersInstance.countEvent(`consensus`, 'tryProduceReceipt waitForReceiptOnly === true')
        return null
      }

      // TEMP hack.. allow any node to try and make a receipt
      // if (this.stateManager.transactionQueue.executeInOneShard && queueEntry.isInExecutionHome === false) {
      //   return null
      // }

      if (queueEntry.signedReceipt != null) {
        nestedCountersInstance.countEvent(`consensus`, 'tryProduceReceipt appliedReceipt != null')
        if (logFlags.debug) this.mainLogger.debug(`tryProduceReceipt ${queueEntry.logID} appliedReceipt != null`)
        return queueEntry.signedReceipt
      }

      if (queueEntry.queryingRobustConfirmOrChallenge === true) {
        nestedCountersInstance.countEvent(
          `consensus`,
          'tryProduceReceipt in the middle of robust query confirm or challenge'
        )
        return null
      }

      // Design TODO:  should this be the full transaction group or just the consensus group?
      let votingGroup: Shardus.NodeWithRank[] | P2PTypes.NodeListTypes.Node[]

      if (this.stateManager.transactionQueue.usePOQo === true) {
        votingGroup = queueEntry.executionGroup
      } else if (
        this.stateManager.transactionQueue.executeInOneShard &&
        this.stateManager.transactionQueue.useNewPOQ === false
      ) {
        //use execuiton group instead of full transaciton group, since only the execution group will run the transaction
        votingGroup = queueEntry.executionGroup
      } else {
        votingGroup = this.stateManager.transactionQueue.queueEntryGetTransactionGroup(queueEntry)
      }

      // if (this.stateManager.transactionQueue.usePOQo === true) {
      if (Math.random() < this.debugFailPOQo) {
        nestedCountersInstance.countEvent('poqo', 'debug fail no receipt produced')
        return null
      }
      if (queueEntry.ourVote === undefined) {
        // Cannot produce receipt just yet. Wait further.
        // In V2 of POQo, we may not have to check this.
        // further versions could ask other nodes for proposal blob
        return null
      }

      const majorityCount = Math.ceil(votingGroup.length * this.config.p2p.requiredVotesPercentage)

      const numVotes = queueEntry.collectedVoteHashes.length

      if (numVotes < majorityCount) {
        // we need more votes
        return null
      }
      // be smart an only recalculate votes when we see a new vote show up.
      if (queueEntry.newVotes === false) {
        return null
      }
      queueEntry.newVotes = false
      let winningVoteHash: string
      const hashCounts: Map<string, number> = new Map()

      for (let i = 0; i < numVotes; i++) {
        // eslint-disable-next-line security/detect-object-injection
        const currentVote = queueEntry.collectedVoteHashes[i]
        const voteCount = hashCounts.get(currentVote.voteHash) || 0
        hashCounts.set(currentVote.voteHash, voteCount + 1)
        if (voteCount + 1 > majorityCount) {
          winningVoteHash = currentVote.voteHash
          break
        }
      }

      if (winningVoteHash != undefined) {
        // For V1 of POQo check if our voteHash matches the winning hash
        // If not, do not generate a receipt and log it
        // In later versions of POQo, we should get the proposal blob from a winning node
        if (queueEntry.ourVoteHash !== winningVoteHash) {
          nestedCountersInstance.countEvent(
            'poqo',
            'My votehash did not match consensed vote hash. Not producing receipt.'
          )
          return
        }

        //make the new receipt.
        const receipt: SignedReceipt = {
          proposal: queueEntry.ourProposal,
          proposalHash: queueEntry.ourVoteHash,
          voteOffsets: [],
          signaturePack: [],
        }

        for (let i = 0; i < numVotes; i++) {
          // eslint-disable-next-line security/detect-object-injection
          const currentVote = queueEntry.collectedVoteHashes[i]
          if (currentVote.voteHash === winningVoteHash) {
            receipt.signaturePack.push(currentVote.sign)
            receipt.voteOffsets.push(currentVote.voteTime)
          }
        }
        const signedReceipt: SignedReceipt = this.crypto.sign(receipt)
        // now send it !!!

        // for (let i = 0; i < queueEntry.ourVote.account_id.length; i++) {
        //   /* eslint-disable security/detect-object-injection */
        //   if (queueEntry.ourVote.account_id[i] === 'app_data_hash') {
        //     appliedReceipt2.app_data_hash = queueEntry.ourVote.account_state_hash_after[i]
        //     break
        //   }
        //   /* eslint-enable security/detect-object-injection */
        // }

        queueEntry.signedReceipt = signedReceipt

        //this is a temporary hack to reduce the ammount of refactor needed.
        // const appliedReceipt: AppliedReceipt = {
        //   txid: queueEntry.acceptedTx.txId,
        //   result: queueEntry.ourVote.transaction_result,
        //   appliedVotes: [queueEntry.ourVote],
        //   confirmOrChallenge: [], // TODO: Do we remove this for POQo??
        //   app_data_hash: appliedReceipt2.app_data_hash,
        // }
        // queueEntry.appliedReceipt = appliedReceipt

        const payload = { ...signedReceipt, txGroupCycle: queueEntry.txGroupCycle }
        // tellx128 the receipt to the entire execution group
        // if (this.config.p2p.useBinarySerializedEndpoints && this.config.p2p.poqoSendReceiptBinary) {

        Comms.tellBinary<PoqoSendReceiptReq>(
          votingGroup,
          InternalRouteEnum.binary_poqo_send_receipt,
          payload,
          serializePoqoSendReceiptReq,
          {}
        )
        // } else {
        //   Comms.tell(votingGroup, 'poqo-send-receipt', payload)
        // }

        // we are checking this here, because factTellCorrespondingNodesFinalData will throw and eror if we have no
        // preApplyTXResult.   The issue is that we may have a TX that has consensed on the idea that we should not apply a change
        // it is still important to gossip this receipt so and move forward so we can remove it from the queue.
        // This means we dont want to panic on a missing preApplyTXResult
        if (queueEntry.preApplyTXResult != null && queueEntry.preApplyTXResult.applyResponse != null) {
          // Corresponding tell of receipt+data to entire transaction group
          this.stateManager.transactionQueue.factTellCorrespondingNodesFinalData(queueEntry)
        } else {
          // however if we have a missing preApplyTXResult but the result is false we should log a count
          // as this may be an error condition to look out for
          // note: appliedReceipt2.result comes from queueEntry.ourVote.transaction_result which comes from PreApplyAcceptedTransactionResult.passed
          // it will be false if the apply funciton throws an error to signal that it was not possible apply

          if (signedReceipt.proposal.applied === true) {
            // if we have a receipt with a positive result we should not have a null preApplyTXResult
            /* prettier-ignore */ nestedCountersInstance.countEvent('poqo', `error: unexpected preApplyTXResult == null while result === true.  preApplyTXResult:${queueEntry.preApplyTXResult != null} applyResponse:${queueEntry.preApplyTXResult?.applyResponse != null}`)
            /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`error: unexpected preApplyTXResult == null while result === true ${queueEntry.logID}   preApplyTXResult:${queueEntry.preApplyTXResult != null}  applyResponse:${queueEntry.preApplyTXResult?.applyResponse != null}`)
          } else {
            /* prettier-ignore */ nestedCountersInstance.countEvent('poqo', `expected skip fact tell preApplyTXResult == null while result === false.  preApplyTXResult:${queueEntry.preApplyTXResult != null}  applyResponse:${queueEntry.preApplyTXResult?.applyResponse != null}`)
          }
        }
        // Kick off receipt-gossip
        queueEntry.hasSentFinalReceipt = true
        Comms.sendGossip(
          'poqo-receipt-gossip',
          payload,
          null,
          null,
          queueEntry.transactionGroup,
          false,
          4,
          queueEntry.acceptedTx.txId,
          '',
          true
        )
        return signedReceipt
      }
      
      return null
    } catch (e) {
      //if (logFlags.error) this.mainLogger.error(`tryProduceReceipt: error ${queueEntry.logID} error: ${e.message}`)
      /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`tryProduceReceipt: error ${queueEntry.logID} error: ${utils.formatErrorMessage(e)}`)
    } finally {
      if (logFlags.profiling_verbose) this.profiler.scopedProfileSectionEnd('tryProduceReceipt')
      this.profiler.profileSectionEnd('tryProduceReceipt')
    }
  }

  async robustQueryBestVote(queueEntry: QueueEntry): Promise<AppliedVote> {
    profilerInstance.profileSectionStart('robustQueryBestVote', true)
    profilerInstance.scopedProfileSectionStart('robustQueryBestVote')
    const txId = queueEntry.acceptedTx.txId
    try {
      queueEntry.queryingRobustVote = true
      if (this.stateManager.consensusLog) this.mainLogger.debug(`robustQueryBestVote: ${queueEntry.logID}`)
      const queryFn = async (node: Shardus.Node): Promise<AppliedVoteQueryResponse> => {
        try {
          const ip = node.externalIp
          const port = node.externalPort
          // the queryFunction must return null if the given node is our own
          if (ip === Self.ip && port === Self.port) return null
          const queryData: AppliedVoteQuery = { txId: queueEntry.acceptedTx.txId }
          // if (this.config.p2p.useBinarySerializedEndpoints && this.config.p2p.getAppliedVoteBinary) {
          const req = queryData as GetAppliedVoteReq
          /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455101 ${shardusGetTime()} tx:${txId} ${NodeList.activeIdToPartition.get(Self.id)}-->>${NodeList.activeIdToPartition.get(node.id)}: ${'get_applied_vote'}`)
          const rBin = await Comms.askBinary<GetAppliedVoteReq, GetAppliedVoteResp>(
            node,
            InternalRouteEnum.binary_get_applied_vote,
            req,
            serializeGetAppliedVoteReq,
            deserializeGetAppliedVoteResp,
            {
              verification_data: `${queryData.txId}`,
            }
          )
          return rBin
          // }
          // return await Comms.ask(node, 'get_applied_vote', queryData)
        } catch (e) {
          this.mainLogger.error(`robustQueryBestVote: Failed query to node ${node.id} error: ${e.message}`)
          return {
            txId: `invalid-${randomUUID()}`,
            appliedVote: null,
            appliedVoteHash: null,
          }
        }
      }
      const eqFn = (item1: AppliedVoteQueryResponse, item2: AppliedVoteQueryResponse): boolean => {
        try {
          if (item1.appliedVoteHash === item2.appliedVoteHash) return true
          return false
        } catch (err) {
          return false
        }
      }
      const redundancy = 3
      const { topResult: response } = await robustQuery(
        this.stateManager.transactionQueue.queueEntryGetTransactionGroup(queueEntry),
        queryFn,
        eqFn,
        redundancy,
        true,
        true,
        false,
        'robustQueryBestVote'
      )
      if (response && response.appliedVote) {
        return response.appliedVote
      } else {
        this.mainLogger.error(`robustQueryBestVote: ${txId} no response from robustQuery`)
      }
    } catch (e) {
      this.mainLogger.error(`robustQueryBestVote: ${queueEntry.logID} error: ${e.message}`)
    } finally {
      queueEntry.queryingRobustVote = false
      profilerInstance.scopedProfileSectionEnd('robustQueryBestVote')
      profilerInstance.profileSectionEnd('robustQueryBestVote', true)
    }
  }

  async robustQueryConfirmOrChallenge(queueEntry: QueueEntry): Promise<ConfirmOrChallengeQueryResponse> {
    profilerInstance.profileSectionStart('robustQueryConfirmOrChallenge', true)
    profilerInstance.scopedProfileSectionStart('robustQueryConfirmOrChallenge')
    try {
      if (this.stateManager.consensusLog) {
        this.mainLogger.debug(`robustQueryConfirmOrChallenge: ${queueEntry.logID}`)
      }
      queueEntry.queryingRobustConfirmOrChallenge = true
      const queryFn = async (node: Shardus.Node): Promise<ConfirmOrChallengeQueryResponse> => {
        if (node.externalIp === Self.ip && node.externalPort === Self.port) return null
        const queryData = { txId: queueEntry.acceptedTx.txId }
        /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455101 ${shardusGetTime()} tx:${queryData.txId} ${NodeList.activeIdToPartition.get(Self.id)}-->>${NodeList.activeIdToPartition.get(node.id)}: ${'get_confirm_or_challenge'}`)
        // return this.config.p2p.useBinarySerializedEndpoints && this.config.p2p.getConfirmOrChallengeBinary
        //   ?
        const response = await Comms.askBinary<GetConfirmOrChallengeReq, GetConfirmOrChallengeResp>(
          node,
          InternalRouteEnum.binary_get_confirm_or_challenge,
          queryData,
          serializeGetConfirmOrChallengeReq,
          deserializeGetConfirmOrChallengeResp,
          {}
        )
        return {
          txId: response.txId,
          appliedVoteHash: response.appliedVoteHash,
          result: response.result ?? null,
          uniqueCount: response.uniqueCount,
        } as ConfirmOrChallengeQueryResponse
        // : await Comms.ask(node, 'get_confirm_or_challenge', queryData)
      }
      const eqFn = (item1: ConfirmOrChallengeQueryResponse, item2: ConfirmOrChallengeQueryResponse): boolean => {
        try {
          if (item1 == null || item2 == null) return false
          if (item1.appliedVoteHash == null || item2.appliedVoteHash == null) return false
          if (item1.result == null || item2.result == null) return false

          const message1 = item1.appliedVoteHash + item1.result.message + item1.result.nodeId + item1.uniqueCount
          const message2 = item2.appliedVoteHash + item2.result.message + item2.result.nodeId + item2.uniqueCount
          if (message1 === message2) return true
          return false
        } catch (err) {
          return false
        } finally {
        }
      }
      // const nodesToAsk = this.stateManager.transactionQueue.queueEntryGetTransactionGroup(queueEntry)
      let nodesToAsk = []

      // for (const key of Object.keys(queueEntry.localKeys)) {
      //   if (queueEntry.localKeys[key] === true) {
      //     const nodeShardData: StateManagerTypes.shardFunctionTypes.NodeShardData =
      //       this.stateManager.currentCycleShardData.nodeShardData
      //
      //     const homeNode = ShardFunctions.findHomeNode(
      //       Context.stateManager.currentCycleShardData.shardGlobals,
      //       key,
      //       Context.stateManager.currentCycleShardData.parititionShardDataMap
      //     )
      //     const storageNodes = homeNode.nodeThatStoreOurParitionFull
      //     const storageNodesIdSet = new Set(storageNodes.map(node => node.id))
      //     for (const node of queueEntry.transactionGroup) {
      //       if (storageNodesIdSet.has(node.id)) {
      //         nodesToAsk.push(node)
      //       }
      //     }
      //   }
      // }

      nestedCountersInstance.countEvent('robustQueryConfirmOrChallenge', `nodesToAsk:${nodesToAsk.length}`)

      if (nodesToAsk.length === 0) {
        nestedCountersInstance.countEvent('robustQueryConfirmOrChallenge', `nodesToAsk is 0`)
        nodesToAsk = this.stateManager.transactionQueue.queueEntryGetTransactionGroup(queueEntry)
      }

      const redundancy = 3
      const maxRetry = 10
      const {
        topResult: response,
        isRobustResult,
        winningNodes,
      } = await robustQuery(
        nodesToAsk,
        queryFn,
        eqFn,
        redundancy,
        true,
        true,
        false,
        'robustQueryConfirmOrChallenge',
        maxRetry
      )
      nestedCountersInstance.countEvent('robustQueryConfirmOrChallenge', `isRobustResult:${isRobustResult}`)
      if (!isRobustResult) {
        return null
      }

      if (response && response.result) {
        nestedCountersInstance.countEvent('robustQueryConfirmOrChallenge', `result is NOT null`)
        return response
      } else {
        nestedCountersInstance.countEvent('robustQueryConfirmOrChallenge', `result is null`)
      }
    } catch (e) {
      this.mainLogger.error(`robustQueryConfirmOrChallenge: ${queueEntry.logID} error: ${e.message}`)
    } finally {
      queueEntry.queryingRobustConfirmOrChallenge = false
      profilerInstance.scopedProfileSectionEnd('robustQueryConfirmOrChallenge')
      profilerInstance.profileSectionEnd('robustQueryConfirmOrChallenge', true)
    }
  }

  async robustQueryAccountData(
    consensNodes: Shardus.Node[],
    accountId: string,
    txId: string
  ): Promise<Shardus.WrappedData> {
    const queryFn = async (node: Shardus.Node): Promise<GetAccountData3Resp> => {
      const ip = node.externalIp
      const port = node.externalPort
      // the queryFunction must return null if the given node is our own
      if (ip === Self.ip && port === Self.port) return null

      const message: GetAccountData3Req = {
        accountStart: accountId,
        accountEnd: accountId,
        tsStart: 0,
        maxRecords: this.config.stateManager.accountBucketSize,
        offset: 0,
        accountOffset: '',
      }
      let result
      try {
        // if (this.config.p2p.useBinarySerializedEndpoints && this.config.p2p.getAccountDataBinary) {
        const req = message as GetAccountDataReqSerializable
        /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455101 ${shardusGetTime()} tx:${txId} ${NodeList.activeIdToPartition.get(Self.id)}-->>${NodeList.activeIdToPartition.get(node.id)}: ${'get_account_data3'}`)
        const rBin = await Comms.askBinary<GetAccountDataReqSerializable, GetAccountDataRespSerializable>(
          node,
          InternalRouteEnum.binary_get_account_data,
          req,
          serializeGetAccountDataReq,
          deserializeGetAccountDataResp,
          {}
        )
        if (((rBin.errors && rBin.errors.length === 0) || !rBin.errors) && rBin.data) {
          result = rBin as GetAccountData3Resp
        }
        // } else {
        //   result = await Comms.ask(node, 'get_account_data3', message)
        // }
      } catch (error) {
        this.mainLogger.error(`robustQueryAccountData: Failed query to node ${node.id}. askBinary ex: ${error.message}`)
        return {
          data: null,
          errors: [`robustQueryAccountData: Failed query to node ${node.id}. askBinary ex: ${error.message}`],
        }
      }
      return result
    }
    const eqFn = (item1: GetAccountData3Resp, item2: GetAccountData3Resp): boolean => {
      try {
        const account1 = item1.data.wrappedAccounts[0]
        const account2 = item1.data.wrappedAccounts[0]
        if (account1.stateId === account2.stateId) return true
        return false
      } catch (err) {
        return false
      }
    }
    const redundancy = 3
    const maxRetry = 5
    const { topResult: response } = await robustQuery(
      consensNodes,
      queryFn,
      eqFn,
      redundancy,
      true,
      true,
      false,
      'robustQueryAccountData',
      maxRetry
    )
    if (response && response.data) {
      const accountData = response.data.wrappedAccounts[0]
      return accountData
    }
  }

  sortByAccountId(first: Shardus.WrappedResponse, second: Shardus.WrappedResponse): Ordering {
    return utils.sortAscProp(first, second, 'accountId')
  }

  async checkAccountIntegrity(queueEntry: QueueEntry): Promise<boolean> {
    this.profiler.scopedProfileSectionStart('checkAccountIntegrity')
    queueEntry.queryingRobustAccountData = true
    let success = true

    for (const key of queueEntry.uniqueKeys) {
      const collectedAccountData = queueEntry.collectedData[key]
      if (collectedAccountData.accountCreated) {
        // we do not need to check this newly created account
        // todo: still possible that node has lost data for this account
        continue
      }
      const consensuGroupForAccount = this.stateManager.transactionQueue.queueEntryGetConsensusGroupForAccount(
        queueEntry,
        key
      )
      const promise = this.stateManager.transactionConsensus.robustQueryAccountData(
        consensuGroupForAccount,
        key,
        queueEntry.acceptedTx.txId
      )
      queueEntry.robustAccountDataPromises[key] = promise
    }

    if (queueEntry.robustAccountDataPromises && Object.keys(queueEntry.robustAccountDataPromises).length > 0) {
      const keys = Object.keys(queueEntry.robustAccountDataPromises)
      const promises = Object.values(queueEntry.robustAccountDataPromises)
      const results: Shardus.WrappedData[] = await Promise.all(promises)
      for (let i = 0; i < results.length; i++) {
        const key = keys[i]
        const collectedAccountData = queueEntry.collectedData[key]
        const robustQueryAccountData = results[i]
        if (
          robustQueryAccountData.stateId === collectedAccountData.stateId &&
          robustQueryAccountData.timestamp === collectedAccountData.timestamp
        ) {
          nestedCountersInstance.countEvent('checkAccountIntegrity', 'collected data and robust data match')
          if (logFlags.debug) this.mainLogger.debug(`checkAccountIntegrity: ${queueEntry.logID} key: ${key} ok`)
        } else {
          success = false
          nestedCountersInstance.countEvent('checkAccountIntegrity', 'collected data and robust data do not match')
          if (logFlags.debug) {
            this.mainLogger.debug(
              `checkAccountIntegrity: ${
                queueEntry.logID
              } key: ${key} failed. collectedAccountData: ${Utils.safeStringify(
                collectedAccountData
              )} robustAccountData: ${Utils.safeStringify(robustQueryAccountData)}`
            )
          }
        }
      }
    } else {
      nestedCountersInstance.countEvent('checkAccountIntegrity', 'robustAccountDataPromises empty')
    }
    this.profiler.scopedProfileSectionEnd('checkAccountIntegrity')
    queueEntry.queryingRobustAccountData = false
    return success
  }
  /**
   * createAndShareVote
   * create an AppliedVote
   * gossip the AppliedVote
   * @param queueEntry
   */
  async createAndShareVote(queueEntry: QueueEntry): Promise<unknown> {
    /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_createAndShareVote', `${queueEntry.acceptedTx.txId}`, `qId: ${queueEntry.entryID} `)

    // TODO STATESHARDING4 CHECK VOTES PER CONSENSUS GROUP

    if (queueEntry.isInExecutionHome === false) {
      //we are not in the execution home, so we can't create or share a vote
      if (logFlags.debug) this.mainLogger.debug(`createAndShareVote: ${queueEntry.logID} not in execution home`)
      return
    }
    if (Context.config.debug.forcedExpiration) {
      // only expired 70% of the execution group
      if (Math.random() < 0.7) {
        // we are in forced expiration mode, so we can't create or share a vote
        nestedCountersInstance.countEvent('transactionConsensus', 'forcedExpiration')
        return
      }
      console.log(`allowing vote creation for ${queueEntry.acceptedTx.txId} in forcedExpiration mode`)
    }
    if (queueEntry.almostExpired) {
      if (logFlags.debug) this.mainLogger.debug(`createAndShareVote: ${queueEntry.logID} almostExpired`)
      nestedCountersInstance.countEvent('transactionConsensus', 'almostExpired')
      return
    }
    this.profiler.profileSectionStart('createAndShareVote', true)

    try {
      const ourNodeId = Self.id
      const isEligibleToShareVote = queueEntry.eligibleNodeIdsToVote.has(ourNodeId)

      // create our vote (for later use) even if we have received a better vote
      const proposal: Proposal = {
        txid: queueEntry.acceptedTx.txId,
        applied: queueEntry.preApplyTXResult.passed,
        accountIDs: [],
        afterStateHashes: [],
        beforeStateHashes: [],
        cant_preApply: queueEntry.preApplyTXResult.applied === false,
        appReceiptDataHash: '',
        executionShardKey: queueEntry.txKeys.allKeys[0],
        // TODO : const fromKey = queueEntry.executionShardKey ? queueEntry.executionShardKey : queueEntry.txKeys.allKeys[0]
      }

      proposal.appReceiptDataHash = queueEntry?.preApplyTXResult?.applyResponse?.appReceiptDataHash || ''

      if (queueEntry.debugFail_voteFlip === true) {
        /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_createAndShareVote_voteFlip', `${queueEntry.acceptedTx.txId}`, `qId: ${queueEntry.entryID} `)

        proposal.applied = !proposal.applied
      }

      let wrappedStates = this.stateManager.useAccountWritesOnly ? {} : queueEntry.collectedData

      const applyResponse = queueEntry?.preApplyTXResult?.applyResponse

      const stats = {
        usedApplyResponse: false,
        wrappedStateSet: 0,
        optimized: false,
      }
      //if we have values for accountWrites, then build a list wrappedStates from it and use this list instead
      //of the collected data list
      if (applyResponse != null) {
        const writtenAccountsMap: WrappedResponses = {}
        if (applyResponse.accountWrites != null && applyResponse.accountWrites.length > 0) {
          for (const writtenAccount of applyResponse.accountWrites) {
            writtenAccountsMap[writtenAccount.accountId] = writtenAccount.data
          }
          //override wrapped states with writtenAccountsMap which should be more complete if it included
          wrappedStates = writtenAccountsMap
        }

        stats.usedApplyResponse = true
        stats.wrappedStateSet = Object.keys(wrappedStates).length
        //Issue that could happen with sharded network:
        //Need to figure out where to put the logic that knows which nodes need final data forwarded to them
        //A receipt aline may not be enough, remote shards will need an updated copy of the data.
      }

      if (wrappedStates != null) {
        //we need to sort this list and doing it in place seems ok
        //applyResponse.stateTableResults.sort(this.sortByAccountId )

        stats.optimized = true
        //need to sort our parallel lists so that they are deterministic!!
        const wrappedStatesList = [...Object.values(wrappedStates)]

        //this sort is critical to a deterministic vote structure.. we need this if taking a hash
        wrappedStatesList.sort(this.sortByAccountId)

        for (const wrappedState of wrappedStatesList) {
          // note this is going to stomp the hash value for the account
          // this used to happen in dapp.updateAccountFull  we now have to save off prevStateId on the wrappedResponse
          //We have to update the hash now! Not sure if this is the greatest place but it needs to be done
          const updatedHash = this.app.calculateAccountHash(wrappedState.data)
          wrappedState.stateId = updatedHash

          // populate accountIds
          proposal.accountIDs.push(wrappedState.accountId)
          // popoulate after state hashes
          proposal.afterStateHashes.push(wrappedState.stateId) // account hash for nonce 100
          const wrappedResponse = queueEntry.collectedData[wrappedState.accountId]
          // populate before state hashes
          if (wrappedResponse != null) proposal.beforeStateHashes.push(wrappedResponse.stateId)
        }
      }

      let appliedVoteHash: AppliedVoteHash
      //let temp = ourVote.node_id
      // ourVote.node_id = '' //exclue this from hash
      // proposal = this.crypto.sign(proposal)
      const voteHash = this.calculateVoteHash(proposal)
      //ourVote.node_id = temp
      appliedVoteHash = {
        txid: proposal.txid,
        voteHash,
        voteTime: Math.ceil((shardusGetTime() - queueEntry.acceptedTx.timestamp) / 1000),
      }
      queueEntry.ourVoteHash = voteHash

      const ourVote: Vote = {
        proposalHash: voteHash,
      }

      if (logFlags.debug || this.stateManager.consensusLog)
        this.mainLogger.debug(
          `createAndShareVote ${queueEntry.logID} created ourVote: ${utils.stringifyReduce(
            ourVote
          )},ourVoteHash: ${voteHash}, isEligibleToShareVote: ${isEligibleToShareVote}`
        )

      //append our vote
      appliedVoteHash = this.crypto.sign(appliedVoteHash)
      // if (this.stateManager.transactionQueue.useNewPOQ === false)
      this.tryAppendVoteHash(queueEntry, appliedVoteHash)

      // save our vote to our queueEntry
      this.crypto.sign(ourVote)
      queueEntry.ourVote = ourVote
      queueEntry.ourProposal = proposal
      if (queueEntry.firstVoteReceivedTimestamp === 0) {
        queueEntry.firstVoteReceivedTimestamp = shardusGetTime()
      }

      // if (this.stateManager.transactionQueue.usePOQo) {
      // Kick off POQo vote sending loop asynchronously in the background and return
      // Can skip over the remaining part of the function because this loop will
      // handle sending the vote to the intended receivers
      if (logFlags.verbose) this.mainLogger.debug(`POQO: Sending vote for ${queueEntry.logID}`)
      if (Math.random() < this.debugFailPOQo) {
        nestedCountersInstance.countEvent('poqo', 'debug fail no vote')
        return
      }
      this.poqoVoteSendLoop(queueEntry, appliedVoteHash)
      return
      
    } catch (e) {
      this.mainLogger.error(`createAndShareVote: error ${e.message}`)
    } finally {
      this.profiler.profileSectionEnd('createAndShareVote', true)
    }
  }

  calculateVoteHash(vote: Proposal): string {
    // if (this.stateManager.transactionQueue.usePOQo && (vote as Proposal).applied !== undefined) {
    const proposal = vote
    const applyStatus = {
      applied: proposal.applied,
      cantApply: proposal.cant_preApply,
    }
    const accountsHash = this.crypto.hash(
      this.crypto.hash(proposal.accountIDs) +
        this.crypto.hash(proposal.beforeStateHashes) +
        this.crypto.hash(proposal.afterStateHashes)
    )
    const proposalHash = this.crypto.hash(
      this.crypto.hash(applyStatus) + accountsHash + proposal.appReceiptDataHash + proposal.executionShardKey
    )
    return proposalHash
    
  }
  addPendingConfirmOrChallenge(queueEntry: QueueEntry, confirmOrChallenge: ConfirmOrChallengeMessage): void {
    if (queueEntry.pendingConfirmOrChallenge.has(confirmOrChallenge.nodeId) === false) {
      queueEntry.pendingConfirmOrChallenge.set(confirmOrChallenge.nodeId, confirmOrChallenge)
    }
  }

  /**
   * tryAppendVote
   * if we have not seen this vote yet search our list of votes and append it in
   * the correct spot sorted by signer's id
   * @param queueEntry
   * @param vote
   */
  tryAppendVote(queueEntry: QueueEntry, vote: AppliedVote): boolean {
    // if (this.stateManager.transactionQueue.useNewPOQ === false) {

    // Check if sender is in execution group
    if (!queueEntry.executionGroup.some((node) => node.publicKey === vote.sign.owner)) {
      nestedCountersInstance.countEvent('tryAppendVote', 'Vote sender not in execution group')
      return false
    }

    //  Check if the signature is valid
    if (vote.sign == null) {
      nestedCountersInstance.countEvent('tryAppendVote', 'Vote signature is null')
      return false
    }
    if (!this.crypto.verify(vote as SignedObject, vote.sign.owner)) {
      nestedCountersInstance.countEvent('tryAppendVote', 'Vote signature is invalid')
      return false
    }

    const numVotes = queueEntry.collectedVotes.length

    /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('tryAppendVote', `${queueEntry.logID}`, `vote: ${utils.stringifyReduce(vote)}`)
    /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`tryAppendVote collectedVotes: ${queueEntry.logID}   vote: ${utils.stringifyReduce(vote)}`)

    // just add the vote if we dont have any yet
    if (numVotes === 0) {
      queueEntry.collectedVotes.push(vote)
      queueEntry.newVotes = true
      if (queueEntry.firstVoteReceivedTimestamp === 0) queueEntry.firstVoteReceivedTimestamp = shardusGetTime()
      queueEntry.lastVoteReceivedTimestamp = shardusGetTime()
      if (this.stateManager.consensusLog) this.mainLogger.debug(`First vote appended for tx ${queueEntry.logID}}`)
      return true
    }

    //compare to existing votes.  keep going until we find that this vote is already in the list or our id is at the right spot to insert sorted
    for (let i = 0; i < numVotes; i++) {
      // eslint-disable-next-line security/detect-object-injection
      const currentVote = queueEntry.collectedVotes[i]

      if (currentVote.sign.owner === vote.sign.owner) {
        // already in our list so do nothing and return
        return false
      }
    }
    queueEntry.lastVoteReceivedTimestamp = shardusGetTime()
    queueEntry.collectedVotes.push(vote)
    queueEntry.newVotes = true

    return true
  }

  tryAppendVoteHash(queueEntry: QueueEntry, voteHash: AppliedVoteHash): boolean {
    // Check if sender is in execution group
    if (!queueEntry.executionGroup.some((node) => node.publicKey === voteHash.sign.owner)) {
      nestedCountersInstance.countEvent('poqo', 'Vote sender not in execution group')
      return false
    }

    //  Check if the signature is valid
    if (voteHash.sign == null) {
      nestedCountersInstance.countEvent('poqo', 'Vote signature is null')
      return false
    }
    if (!this.crypto.verify(voteHash as SignedObject, voteHash.sign.owner)) {
      nestedCountersInstance.countEvent('poqo', 'Vote signature is invalid')
      return false
    }

    const numVotes = queueEntry.collectedVoteHashes.length

    /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('tryAppendVoteHash', `${queueEntry.logID}`, `collectedVotes: ${queueEntry.collectedVoteHashes.length}`)
    /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`tryAppendVoteHash collectedVotes: ${queueEntry.logID}   ${queueEntry.collectedVoteHashes.length} `)

    // just add the vote if we dont have any yet
    if (numVotes === 0) {
      queueEntry.collectedVoteHashes.push(voteHash)
      queueEntry.newVotes = true
      queueEntry.lastVoteReceivedTimestamp = shardusGetTime()
      return true
    }

    //compare to existing votes.  keep going until we find that this vote is already in the list or our id is at the right spot to insert sorted
    for (let i = 0; i < numVotes; i++) {
      // eslint-disable-next-line security/detect-object-injection
      const currentVote = queueEntry.collectedVoteHashes[i]

      if (currentVote.sign.owner === voteHash.sign.owner) {
        if (currentVote.voteTime < voteHash.voteTime) {
          // Replace old vote with new vote
          queueEntry.collectedVoteHashes[i] = voteHash
          queueEntry.newVotes = true
          queueEntry.lastVoteReceivedTimestamp = shardusGetTime()
          return true
        } else {
          // already in our list so do nothing and return
          return false
        }
      }
    }

    queueEntry.collectedVoteHashes.push(voteHash)
    queueEntry.newVotes = true
    queueEntry.lastVoteReceivedTimestamp = shardusGetTime()
    return true
  }
}

export default TransactionConsenus
