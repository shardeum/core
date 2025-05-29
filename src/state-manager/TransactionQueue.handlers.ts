import { P2P as P2PTypes } from '@shardeum-foundation/lib-types'
import { InternalBinaryHandler } from '../types/Handler'
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { profilerInstance, cUninitializedSize } from '../utils/profiler'
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum'
import { requestErrorHandler, getStreamWithTypeCheck, verificationDataSplitter } from '../types/Helpers'
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum'
import { deserializeBroadcastStateReq } from '../types/BroadcastStateReq'
import * as utils from '../utils'
import { logFlags } from '../logger'
import * as Shardus from '../shardus/shardus-types'
import { config as configContext, P2PModuleContext as P2P } from '../p2p/Context'
import * as Self from '../p2p/Self'
import { SpreadTxToGroupSyncingReq, deserializeSpreadTxToGroupSyncingReq } from '../types/SpreadTxToGroupSyncingReq'
import { verifyPayload } from '../types/ajv/Helpers'
import { AJVSchemaEnum } from '../types/enum/AJVSchemaEnum'
import { Node } from '@shardeum-foundation/lib-types/build/src/p2p/NodeListTypes'
import { RequestStateForTxRespSerialized, serializeRequestStateForTxResp } from '../types/RequestStateForTxResp'
import { deserializeRequestStateForTxReq } from '../types/RequestStateForTxReq'
import { errorToStringFull, inRangeOfCurrentTime } from '../utils'
import { QueueEntry, AcceptedTx, ArchiverReceipt, SignedReceipt } from './state-manager-types'
import { isInternalTxAllowed, networkMode } from '../p2p/Modes'
import { shardusGetTime } from '../network'
import * as Archivers from '../p2p/Archivers'
import { network as networkContext } from '../p2p/Context'
import { Utils } from '@shardeum-foundation/lib-types'

interface TransactionQueueContext {
  getQueueEntrySafe: (txId: string) => QueueEntry | null
  getQueueEntryArchived: (txId: string, route: string) => QueueEntry | null
  queueEntryAddData: (queueEntry: QueueEntry, data: any, signatureCheck?: boolean) => void
  logger: any
  mainLogger: any
  stateManager: any
  p2p: P2P
  profiler: any
  crypto: any
  app: Shardus.App
  archivedQueueEntriesByID: Map<string, QueueEntry>
  _transactionQueueByID: Map<string, QueueEntry>
  getArchiverReceiptFromQueueEntry: (queueEntry: QueueEntry) => Promise<ArchiverReceipt>
  factValidateCorrespondingTellSender: (queueEntry: QueueEntry, accountId: string, senderId: string) => boolean
  validateCorrespondingTellSender: (queueEntry: QueueEntry, accountId: string, senderId: string) => boolean
  handleSharedTX: (tx: Shardus.TimestampedTx, appData: unknown, sender: Shardus.Node) => QueueEntry
  queueEntryGetTransactionGroup: (queueEntry: QueueEntry) => Shardus.Node[]
  addOriginalTxDataToForward: (queueEntry: QueueEntry) => void
  routeAndQueueAcceptedTransaction: (acceptedTx: AcceptedTx, sendGossip: boolean, sender: Shardus.Node | null, globalModification: boolean, noConsensus: boolean) => string | boolean
  statemanager_fatal: (key: string, log: string) => void
  config: Shardus.StrictServerConfiguration
}

export const handlers = {
    setupHandlers(this: TransactionQueueContext): void {
        const broadcastStateRoute: P2PTypes.P2PTypes.Route<InternalBinaryHandler<Buffer>> = {
          name: InternalRouteEnum.binary_broadcast_state,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          handler: (payload, respond, header, sign) => {
            const route = InternalRouteEnum.binary_broadcast_state
            nestedCountersInstance.countEvent('internal', route)
            profilerInstance.scopedProfileSectionStart(route, false, payload.length)
            const errorHandler = (
              errorType: RequestErrorEnum,
              opts?: { customErrorLog?: string; customCounterSuffix?: string }
            ): void => requestErrorHandler(route, errorType, header, opts)
    
            try {
              const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cBroadcastStateReq)
              if (!requestStream) {
                return errorHandler(RequestErrorEnum.InvalidRequest)
              }
              // verification data checks
              if (header.verification_data == null) {
                return errorHandler(RequestErrorEnum.MissingVerificationData)
              }
              const verificationDataParts = verificationDataSplitter(header.verification_data)
              if (verificationDataParts.length !== 3) {
                return errorHandler(RequestErrorEnum.InvalidVerificationData)
              }
              const [vTxId, vStateSize, vStateAddress] = verificationDataParts
              const queueEntry = this.getQueueEntrySafe(vTxId)
              //It is okay to ignore this transaction if the txId is not found in the queue.
              if (queueEntry == null) {
                /* prettier-ignore */ if (logFlags.error && logFlags.verbose) this.mainLogger.error(`${route} cant find queueEntry for: ${utils.makeShortHash(vTxId)}`)
                return errorHandler(RequestErrorEnum.InvalidVerificationData, {
                  customCounterSuffix: 'queueEntryNotFound',
                })
              }
    
              const req = deserializeBroadcastStateReq(requestStream)
              if (req.txid !== vTxId) {
                return errorHandler(RequestErrorEnum.InvalidVerificationData)
              }
    
              if (req.stateList.length !== parseInt(vStateSize)) {
                return errorHandler(RequestErrorEnum.InvalidVerificationData)
              }
              /* prettier-ignore */ if (logFlags.verbose && logFlags.console) console.log(`${route}: txId: ${req.txid} stateSize: ${req.stateList.length} stateAddress: ${vStateAddress}`)
    
              const senderNodeId = header.sender_id
              let isSenderOurExeNeighbour = false
              const senderIsInExecutionGroup = queueEntry.executionGroupMap.has(senderNodeId)
              const neighbourNodes = utils.selectNeighbors(
                queueEntry.executionGroup,
                queueEntry.ourExGroupIndex,
                2
              ) as Shardus.Node[]
              const neighbourNodeIds = neighbourNodes.map((node) => node.id)
              isSenderOurExeNeighbour = senderIsInExecutionGroup && neighbourNodeIds.includes(senderNodeId)
    
              // sender verification loop
              for (let i = 0; i < req.stateList.length; i++) {
                // eslint-disable-next-line security/detect-object-injection
                const state = req.stateList[i]
                let isSenderValid = false
                if (configContext.p2p.useFactCorrespondingTell) {
                  // check if it is a neighbour exe node sharing data
                  if (configContext.stateManager.shareCompleteData) {
                    if (isSenderOurExeNeighbour) {
                      nestedCountersInstance.countEvent(
                        'stateManager',
                        'factValidateCorrespondingTellSender: sender is an execution node and a neighbour node'
                      )
                      isSenderValid = true
                    } else {
                      // check if it is a corresponding tell sender
                      isSenderValid = this.factValidateCorrespondingTellSender(queueEntry, state.accountId, senderNodeId)
                    }
                  } else {
                    // check if it is a corresponding tell sender
                    isSenderValid = this.factValidateCorrespondingTellSender(queueEntry, state.accountId, senderNodeId)
                  }
                } else {
                  isSenderValid = this.validateCorrespondingTellSender(queueEntry, state.accountId, senderNodeId)
                }
    
                if (
                  this.stateManager.testFailChance(
                    configContext.debug.ignoreDataTellChance,
                    'ignoreDataTellChance',
                    queueEntry.logID,
                    '',
                    logFlags.verbose
                  ) === true
                ) {
                  isSenderValid = false
                }
    
                if (isSenderValid === false) {
                  this.mainLogger.error(`${route} validateCorrespondingTellSender failed for ${state.accountId}`)
                  nestedCountersInstance.countEvent('processing', 'validateCorrespondingTellSender failed')
                  return errorHandler(RequestErrorEnum.InvalidSender)
                }
              }
              // update loop
              for (let i = 0; i < req.stateList.length; i++) {
                // eslint-disable-next-line security/detect-object-injection
                const state = req.stateList[i]
    
                if (configContext.stateManager.collectedDataFix && configContext.stateManager.rejectSharedDataIfCovered) {
                  const consensusNodes = this.stateManager.transactionQueue.getConsenusGroupForAccount(state.accountId)
                  const coveredByUs = consensusNodes.map((node) => node.id).includes(Self.id)
                  if (coveredByUs) {
                    nestedCountersInstance.countEvent('processing', 'broadcast_state_coveredByUs')
                    /* prettier-ignore */ if (logFlags.verbose) console.log(`broadcast_state: coveredByUs: ${state.accountId} no need to accept this data`)
                    continue
                  } else {
                    this.queueEntryAddData(queueEntry, state)
                  }
                } else {
                  this.queueEntryAddData(queueEntry, state)
                }
                if (queueEntry.state === 'syncing') {
                  /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_sync_gotBroadcastData', `${queueEntry.acceptedTx.txId}`, ` qId: ${queueEntry.entryID} data:${state.accountId}`)
                }
              }
            } catch (e) {
              nestedCountersInstance.countEvent('internal', `${route}-exception`)
              /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`${route}: Exception executing request: ${errorToStringFull(e)}`)
            } finally {
              profilerInstance.scopedProfileSectionEnd(route, payload.length)
            }
          },
        }
    
        this.p2p.registerInternalBinary(broadcastStateRoute.name, broadcastStateRoute.handler)
    
        const spreadTxToGroupSyncingBinaryHandler: P2PTypes.P2PTypes.Route<InternalBinaryHandler<Buffer>> = {
          name: InternalRouteEnum.binary_spread_tx_to_group_syncing,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          handler: async (payload, respond, header, sign) => {
            const route = InternalRouteEnum.binary_spread_tx_to_group_syncing
            nestedCountersInstance.countEvent('internal', route)
            this.profiler.scopedProfileSectionStart(route, false, payload.length)
            const errorHandler = (
              errorType: RequestErrorEnum,
              opts?: { customErrorLog?: string; customCounterSuffix?: string }
            ): void => requestErrorHandler(route, errorType, header, opts)
    
            try {
              const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cSpreadTxToGroupSyncingReq)
              if (!requestStream) {
                return errorHandler(RequestErrorEnum.InvalidRequest)
              }
    
              const req: SpreadTxToGroupSyncingReq = deserializeSpreadTxToGroupSyncingReq(requestStream)
    
              const ajvErrors = verifyPayload(AJVSchemaEnum.SpreadTxToGroupSyncingReq, req)
              if (ajvErrors && ajvErrors.length > 0) {
                this.mainLogger.error(`${route}: request validation errors: ${ajvErrors}`)
                return errorHandler(RequestErrorEnum.InvalidPayload)
              }
    
              const node = this.p2p.state.getNode(header.sender_id)
              this.handleSharedTX(req.data, req.appData, node)
            } catch (e) {
              nestedCountersInstance.countEvent('internal', `${route}-exception`)
              /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`${route}: Exception executing request: ${errorToStringFull(e)}`)
            } finally {
              this.profiler.scopedProfileSectionEnd(route)
            }
          },
        }
    
        this.p2p.registerInternalBinary(
          spreadTxToGroupSyncingBinaryHandler.name,
          spreadTxToGroupSyncingBinaryHandler.handler
        )
    
        this.p2p.registerGossipHandler(
          'spread_tx_to_group',
          async (
            payload: { data: Shardus.TimestampedTx; appData: unknown },
            sender: Node,
            tracker: string,
            msgSize: number
          ) => {
            profilerInstance.scopedProfileSectionStart('spread_tx_to_group', false, msgSize)
            let respondSize = cUninitializedSize
            try {
              // Place tx in queue (if younger than m)
              //  gossip 'spread_tx_to_group' to transaction group
    
              //handleSharedTX will also validate fields.  payload is an AcceptedTX so must pass in the .data as the rawTX
              const queueEntry = this.handleSharedTX(payload.data, payload.appData, sender)
              if (queueEntry == null) {
                return
              }
    
              // get transaction group
              const transactionGroup = this.queueEntryGetTransactionGroup(queueEntry)
              if (queueEntry.ourNodeInTransactionGroup === false) {
                return
              }
              if (transactionGroup.length > 1) {
                this.stateManager.debugNodeGroup(
                  queueEntry.acceptedTx.txId,
                  queueEntry.acceptedTx.timestamp,
                  `spread_tx_to_group transactionGroup:`,
                  transactionGroup
                )
                respondSize = await this.p2p.sendGossipIn(
                  'spread_tx_to_group',
                  payload,
                  tracker,
                  sender,
                  transactionGroup,
                  false,
                  -1,
                  queueEntry.acceptedTx.txId
                )
                /* prettier-ignore */ if (logFlags.verbose) console.log( 'queueEntry.isInExecutionHome', queueEntry.acceptedTx.txId, queueEntry.isInExecutionHome )
                // If our node is in the execution group, forward this raw tx to the subscribed archivers
                if (queueEntry.isInExecutionHome === true) {
                  this.addOriginalTxDataToForward(queueEntry)
                }
              }
            } finally {
              profilerInstance.scopedProfileSectionEnd('spread_tx_to_group', respondSize)
            }
          }
        )
    
        const requestStateForTxRoute: P2PTypes.P2PTypes.Route<InternalBinaryHandler<Buffer>> = {
          name: InternalRouteEnum.binary_request_state_for_tx,
          handler: (payload, respond) => {
            const route = InternalRouteEnum.binary_request_state_for_tx
            profilerInstance.scopedProfileSectionStart(route)
            nestedCountersInstance.countEvent('internal', route)
    
            const response: RequestStateForTxRespSerialized = {
              stateList: [],
              beforeHashes: {},
              note: '',
              success: false,
            }
            try {
              const responseStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cRequestStateForTxReq)
              if (!responseStream) {
                this.mainLogger.error(`${route}: Invalid request`)
                respond(response, serializeRequestStateForTxResp)
                return
              }
              const req = deserializeRequestStateForTxReq(responseStream)
              if (req.txid == null) {
                throw new Error('Txid is null')
              }
              let queueEntry = this.getQueueEntrySafe(req.txid)
              if (queueEntry == null) {
                queueEntry = this.getQueueEntryArchived(req.txid, InternalRouteEnum.binary_request_state_for_tx)
              }
    
              if (queueEntry == null) {
                response.note = `failed to find queue entry: ${utils.stringifyReduce(req.txid)}  ${req.timestamp} dbg:${
                  this.stateManager.debugTXHistory[utils.stringifyReduce(req.txid)]
                }`
                respond(response, serializeRequestStateForTxResp)
                // if a node cant get data it will have to get repaired by the patcher since we can only keep stuff en the archive queue for so long
                // due to memory concerns
                return
              }
    
              for (const key of req.keys) {
                // eslint-disable-next-line security/detect-object-injection
                const data = queueEntry.originalData[key] // collectedData
                if (data) {
                  response.stateList.push(data)
                }
              }
              response.success = true
              respond(response, serializeRequestStateForTxResp)
            } catch (e) {
              /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`${InternalRouteEnum.binary_request_state_for_tx}: Exception executing request: ${errorToStringFull(e)}`)
              nestedCountersInstance.countEvent('internal', `${route}-exception`)
              respond(response, serializeRequestStateForTxResp)
            } finally {
              profilerInstance.scopedProfileSectionEnd(InternalRouteEnum.binary_request_state_for_tx)
            }
          },
        }
    
        this.p2p.registerInternalBinary(requestStateForTxRoute.name, requestStateForTxRoute.handler)
    
        networkContext.registerExternalPost('get-tx-receipt', async (req, res) => {
          let result: { success: boolean; receipt?: ArchiverReceipt | SignedReceipt; reason?: string }
          try {
            let error = utils.validateTypes(req.body, {
              txId: 's',
              timestamp: 'n',
              full_receipt: 'b',
              sign: 'o',
            })
            if (error) {
              res.json((result = { success: false, reason: error }))
              return
            }
            error = utils.validateTypes(req.body.sign, {
              owner: 's',
              sig: 's',
            })
            if (error) {
              res.json((result = { success: false, reason: error }))
              return
            }
    
            const { txId, timestamp, full_receipt, sign } = req.body
            const isReqFromArchiver = Archivers.archivers.has(sign.owner)
            if (!isReqFromArchiver) {
              result = { success: false, reason: 'Request not from Archiver.' }
            } else {
              const isValidSignature = this.crypto.verify(req.body, sign.owner)
              if (isValidSignature) {
                let queueEntry: QueueEntry
                if (
                  this.archivedQueueEntriesByID.has(txId) &&
                  this.archivedQueueEntriesByID.get(txId)?.acceptedTx?.timestamp === timestamp
                ) {
                  if (logFlags.verbose) console.log('get-tx-receipt: ', txId, timestamp, 'archived')
                  queueEntry = this.archivedQueueEntriesByID.get(txId)
                } else if (
                  this._transactionQueueByID.has(txId) &&
                  this._transactionQueueByID.get(txId)?.state === 'commiting' &&
                  this._transactionQueueByID.get(txId)?.acceptedTx?.timestamp === timestamp
                ) {
                  if (logFlags.verbose) console.log('get-tx-receipt: ', txId, timestamp, 'commiting')
                  queueEntry = this._transactionQueueByID.get(txId)
                }
                if (!queueEntry) {
                  res.status(400).json({ success: false, reason: 'Receipt Not Found.' })
                  return
                }
                if (full_receipt) {
                  const fullReceipt: ArchiverReceipt = await this.getArchiverReceiptFromQueueEntry(queueEntry)
                  if (fullReceipt === null) {
                    res.status(400).json({ success: false, reason: 'Receipt Not Found.' })
                    return
                  }
                  result = Utils.safeJsonParse(Utils.safeStringify({ success: true, receipt: fullReceipt }))
                } else {
                  result = { success: true, receipt: this.stateManager.getSignedReceipt(queueEntry) }
                }
              } else {
                result = { success: false, reason: 'Invalid Signature.' }
              }
            }
            res.json(result)
          } catch (e) {
            console.log('Error caught in /get-tx-receipt: ', e)
            res.json((result = { success: false, reason: e }))
          }
        })
      },
      handleSharedTX(this: TransactionQueueContext, tx: Shardus.TimestampedTx, appData: unknown, sender: Shardus.Node): QueueEntry {
        profilerInstance.profileSectionStart('handleSharedTX')
        const internalTx = this.app.isInternalTx(tx)
        if ((internalTx && !isInternalTxAllowed()) || (!internalTx && networkMode !== 'processing')) {
          profilerInstance.profileSectionEnd('handleSharedTX')
          // Block invalid txs in case a node maliciously relays them to other nodes
          return null
        }
        if (!internalTx && !this.config.p2p.allowEndUserTxnInjections) {
          profilerInstance.profileSectionEnd('handleSharedTX')
          /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('tx_non_internal_tx_paused', '', 'execution paused for non-internal tx')
          return null
        }
        // Perform fast validation of the transaction fields
        profilerInstance.scopedProfileSectionStart('handleSharedTX_validateTX')
        const validateResult = this.app.validate(tx, appData)
        profilerInstance.scopedProfileSectionEnd('handleSharedTX_validateTX')
        if (validateResult.success === false) {
          this.statemanager_fatal(
            `spread_tx_to_group_validateTX`,
            `spread_tx_to_group validateTxnFields failed: ${utils.stringifyReduce(validateResult)}`
          )
          profilerInstance.profileSectionEnd('handleSharedTX')
          return null
        }
    
        // Ask App to crack open tx and return timestamp, id (hash), and keys
        const { timestamp, id, keys, shardusMemoryPatterns } = this.app.crack(tx, appData)
    
        // Check if we already have this tx in our queue
        let queueEntry = this.getQueueEntrySafe(id) // , payload.timestamp)
        if (queueEntry) {
          profilerInstance.profileSectionEnd('handleSharedTX')
          return null
        }
    
        // Need to review these timeouts before main net.  what bad things can happen by setting a timestamp too far in the future or past.
        // only a subset of transactions can have timestamp set by the sender while others use independent consensus (askTxnTimestampFromNode)
        // but that is up to the dapp
        const mostOfQueueSitTimeMs = this.stateManager.queueSitTime * 0.9
        const txExpireTimeMs = this.config.transactionExpireTime * 1000
        const age = shardusGetTime() - timestamp
        if (inRangeOfCurrentTime(timestamp, mostOfQueueSitTimeMs, txExpireTimeMs) === false) {
          /* prettier-ignore */ if (logFlags.verbose) this.statemanager_fatal( `spread_tx_to_group_OldTx_or_tooFuture`, 'spread_tx_to_group cannot accept tx with age: ' + age )
          /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_spread_tx_to_groupToOldOrTooFuture', '', 'spread_tx_to_group working on tx with age: ' + age)
          profilerInstance.profileSectionEnd('handleSharedTX')
          return null
        }
    
        // Pack into AcceptedTx for routeAndQueueAcceptedTransaction
        const acceptedTx: AcceptedTx = {
          timestamp,
          txId: id,
          keys,
          data: tx,
          appData,
          shardusMemoryPatterns,
        }
    
        const noConsensus = false // this can only be true for a set command which will never come from an endpoint
        const added = this.routeAndQueueAcceptedTransaction(
          acceptedTx,
          /*sendGossip*/ false,
          sender,
          /*globalModification*/ false,
          noConsensus
        )
        if (added === 'lost') {
          profilerInstance.profileSectionEnd('handleSharedTX')
          return null // we are faking that the message got lost so bail here
        }
        if (added === 'out of range') {
          profilerInstance.profileSectionEnd('handleSharedTX')
          return null
        }
        if (added === 'notReady') {
          profilerInstance.profileSectionEnd('handleSharedTX')
          return null
        }
        queueEntry = this.getQueueEntrySafe(id) //, payload.timestamp) // now that we added it to the queue, it should be possible to get the queueEntry now
    
        if (queueEntry == null) {
          // do not gossip this, we are not involved
          // downgrading, this does not seem to be fatal, but may need further logs/testing
          //this.statemanager_fatal(`spread_tx_to_group_noQE`, `spread_tx_to_group failed: cant find queueEntry for:  ${utils.makeShortHash(payload.id)}`)
          /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('spread_tx_to_group_noQE', '', `spread_tx_to_group failed: cant find queueEntry for:  ${utils.makeShortHash(id)}`)
          profilerInstance.profileSectionEnd('handleSharedTX')
          return null
        }
    
        profilerInstance.profileSectionEnd('handleSharedTX')
        return queueEntry
      }
}