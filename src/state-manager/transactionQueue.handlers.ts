import TransactionQueue from './TransactionQueue'
import { P2P as P2PTypes } from '@shardeum-foundation/lib-types'
import { logFlags } from '../logger'
import * as utils from '../utils'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { profilerInstance, cUninitializedSize } from '../utils/profiler'
import { config as configContext, network as networkContext } from '../p2p/Context'
import * as Self from '../p2p/Self'
import * as Archivers from '../p2p/Archivers'
import * as Comms from '../p2p/Comms'
import {
  QueueEntry,
  AcceptedTx,
  RequestStateForTxReq,
  RequestStateForTxResp,
  ArchiverReceipt,
  SignedReceipt,
  // RequestReceiptForTxResp_old, // If needed by its callers
} from './state-manager-types'
import { Node } from '@shardeum-foundation/lib-types/build/src/p2p/NodeListTypes'
import { Utils } from '@shardeum-foundation/lib-types' // For Utils.safeJsonParse, Utils.safeStringify
import { InternalBinaryHandler } from '../types/Handler'
import {
  BroadcastStateReq,
  deserializeBroadcastStateReq,
  serializeBroadcastStateReq,
} from '../types/BroadcastStateReq'
import {
  getStreamWithTypeCheck,
  requestErrorHandler,
  verificationDataCombiner,
  verificationDataSplitter,
} from '../types/Helpers'
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum'
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum'
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum'
import {
  BroadcastFinalStateReq,
  deserializeBroadcastFinalStateReq,
  serializeBroadcastFinalStateReq,
} from '../types/BroadcastFinalStateReq'
import { verifyPayload } from '../types/ajv/Helpers'
import {
  SpreadTxToGroupSyncingReq,
  deserializeSpreadTxToGroupSyncingReq,
  serializeSpreadTxToGroupSyncingReq,
} from '../types/SpreadTxToGroupSyncingReq'
// import { RequestTxAndStateReq, serializeRequestTxAndStateReq } from '../types/RequestTxAndStateReq' // Not used here
// import { RequestTxAndStateResp, deserializeRequestTxAndStateResp } from '../types/RequestTxAndStateResp' // Not used here
import { deserializeRequestStateForTxReq, serializeRequestStateForTxReq } from '../types/RequestStateForTxReq'
import {
  deserializeRequestStateForTxResp,
  RequestStateForTxRespSerialized,
  serializeRequestStateForTxResp,
} from '../types/RequestStateForTxResp'
import {
  deserializeRequestReceiptForTxResp,
  RequestReceiptForTxRespSerialized,
} from '../types/RequestReceiptForTxResp'
import {
  RequestReceiptForTxReqSerialized,
  serializeRequestReceiptForTxReq,
} from '../types/RequestReceiptForTxReq'
import { errorToStringFull } from '../utils'
import { PoqoDataAndReceiptReq, serializePoqoDataAndReceiptReq } from '../types/PoqoDataAndReceiptReq'
import { AJVSchemaEnum } from '../types/enum/AJVSchemaEnum'
import * as Shardus from '../shardus/shardus-types' // For Shardus.Node, Shardus.TimestampedTx, Shardus.WrappedResponse etc.


export function _setupHandlersLogic(instance: TransactionQueue): void {
    const broadcastStateRoute: P2PTypes.P2PTypes.Route<InternalBinaryHandler<Buffer>> = {
      name: InternalRouteEnum.binary_broadcast_state,
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
          if (header.verification_data == null) {
            return errorHandler(RequestErrorEnum.MissingVerificationData)
          }
          const verificationDataParts = verificationDataSplitter(header.verification_data)
          if (verificationDataParts.length !== 3) {
            return errorHandler(RequestErrorEnum.InvalidVerificationData)
          }
          const [vTxId, vStateSize, vStateAddress] = verificationDataParts
          const queueEntry = instance.getQueueEntrySafe(vTxId)
          if (queueEntry == null) {
            if (logFlags.error && logFlags.verbose) instance.mainLogger.error(`${route} cant find queueEntry for: ${utils.makeShortHash(vTxId)}`)
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
          if (logFlags.verbose && logFlags.console) console.log(`${route}: txId: ${req.txid} stateSize: ${req.stateList.length} stateAddress: ${vStateAddress}`)

          const senderNodeId = header.sender_id
          let isSenderOurExeNeighbour = false
          const senderIsInExecutionGroup = queueEntry.executionGroupMap.has(senderNodeId)
          const neighbourNodes = utils.selectNeighbors(queueEntry.executionGroup, queueEntry.ourExGroupIndex, 2) as Shardus.Node[]
          const neighbourNodeIds = neighbourNodes.map((node) => node.id)
          isSenderOurExeNeighbour = senderIsInExecutionGroup && neighbourNodeIds.includes(senderNodeId)

          for (let i = 0; i < req.stateList.length; i++) {
            const state = req.stateList[i];
            let isSenderValid = false
            if (configContext.p2p.useFactCorrespondingTell) {
              if (configContext.stateManager.shareCompleteData) {
                if (isSenderOurExeNeighbour) {
                  nestedCountersInstance.countEvent('stateManager', 'factValidateCorrespondingTellSender: sender is an execution node and a neighbour node')
                  isSenderValid = true
                } else {
                  isSenderValid = instance.factValidateCorrespondingTellSender(
                    queueEntry,
                    state.accountId,
                    senderNodeId
                  )
                }
              } else {
                isSenderValid = instance.factValidateCorrespondingTellSender(
                  queueEntry,
                  state.accountId,
                  senderNodeId
                )
              }
            } else {
              isSenderValid = instance.validateCorrespondingTellSender(queueEntry, state.accountId, senderNodeId)
            }
            if (instance.stateManager.testFailChance(configContext.debug.ignoreDataTellChance,
            'ignoreDataTellChance', queueEntry.logID, '', logFlags.verbose ) === true ) {
              isSenderValid = false
            }
            if (isSenderValid === false) {
              instance.mainLogger.error(`${route} validateCorrespondingTellSender failed for ${state.accountId}`);
              nestedCountersInstance.countEvent('processing', 'validateCorrespondingTellSender failed')
              return errorHandler(RequestErrorEnum.InvalidSender);
            }
          }
          for (let i = 0; i < req.stateList.length; i++) {
            const state = req.stateList[i];
            if (configContext.stateManager.collectedDataFix && configContext.stateManager.rejectSharedDataIfCovered) {
              const consensusNodes = instance.stateManager.transactionQueue.getConsenusGroupForAccount(state.accountId)
              const coveredByUs = consensusNodes.map((node) => node.id).includes(Self.id)
              if (coveredByUs) {
                nestedCountersInstance.countEvent('processing', 'broadcast_state_coveredByUs')
                if (logFlags.verbose) console.log(`broadcast_state: coveredByUs: ${state.accountId} no need to accept this data`)
                continue
              } else {
                instance.queueEntryAddData(queueEntry, state)
              }
            } else {
              instance.queueEntryAddData(queueEntry, state)
            }
            if (queueEntry.state === 'syncing') {
              if (logFlags.playback) instance.logger.playbackLogNote('shrd_sync_gotBroadcastData', `${queueEntry.acceptedTx.txId}`, ` qId: ${queueEntry.entryID} data:${state.accountId}`)
            }
          }
        } catch (e) {
          nestedCountersInstance.countEvent('internal', `${route}-exception`)
          if (logFlags.error) instance.mainLogger.error(`${route}: Exception executing request: ${errorToStringFull(e)}`)
        } finally {
          profilerInstance.scopedProfileSectionEnd(route, payload.length)
        }
      },
    }
    instance.p2p.registerInternalBinary(broadcastStateRoute.name, broadcastStateRoute.handler)

    const spreadTxToGroupSyncingBinaryHandler: P2PTypes.P2PTypes.Route<InternalBinaryHandler<Buffer>> = {
      name: InternalRouteEnum.binary_spread_tx_to_group_syncing,
      handler: async (payload, respond, header, sign) => {
        const route = InternalRouteEnum.binary_spread_tx_to_group_syncing
        nestedCountersInstance.countEvent('internal', route)
        instance.profiler.scopedProfileSectionStart(route, false, payload.length)
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
            instance.mainLogger.error(`${route}: request validation errors: ${ajvErrors}`)
            return errorHandler(RequestErrorEnum.InvalidPayload)
          }
          const node = instance.p2p.state.getNode(header.sender_id)
          instance.handleSharedTX(req.data, req.appData, node)
        } catch (e) {
          nestedCountersInstance.countEvent('internal', `${route}-exception`)
          if (logFlags.error) instance.mainLogger.error(`${route}: Exception executing request: ${errorToStringFull(e)}`)
        } finally {
          instance.profiler.scopedProfileSectionEnd(route)
        }
      },
    }
    instance.p2p.registerInternalBinary(
      spreadTxToGroupSyncingBinaryHandler.name,
      spreadTxToGroupSyncingBinaryHandler.handler
    )

    instance.p2p.registerGossipHandler(
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
          const queueEntry = instance.handleSharedTX(payload.data, payload.appData, sender)
          if (queueEntry == null) {
            return
          }
          const transactionGroup = instance.queueEntryGetTransactionGroup(queueEntry)
          if (queueEntry.ourNodeInTransactionGroup === false) {
            return
          }
          if (transactionGroup.length > 1) {
            instance.stateManager.debugNodeGroup(
              queueEntry.acceptedTx.txId,
              queueEntry.acceptedTx.timestamp,
              `spread_tx_to_group transactionGroup:`,
              transactionGroup
            )
            respondSize = await instance.p2p.sendGossipIn(
              'spread_tx_to_group',
              payload,
              tracker,
              sender,
              transactionGroup,
              false,
              -1,
              queueEntry.acceptedTx.txId
            )
            if (logFlags.verbose) console.log( 'queueEntry.isInExecutionHome', queueEntry.acceptedTx.txId, queueEntry.isInExecutionHome )
            if (queueEntry.isInExecutionHome === true) {
              instance.addOriginalTxDataToForward(queueEntry)
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
            instance.mainLogger.error(`${route}: Invalid request`)
            respond(response, serializeRequestStateForTxResp)
            return
          }
          const req = deserializeRequestStateForTxReq(responseStream)
          if (req.txid == null) {
            throw new Error('Txid is null')
          }
          let queueEntry = instance.getQueueEntrySafe(req.txid)
          if (queueEntry == null) {
            queueEntry = instance.getQueueEntryArchived(req.txid, InternalRouteEnum.binary_request_state_for_tx)
          }
          if (queueEntry == null) {
            response.note = `failed to find queue entry: ${utils.stringifyReduce(req.txid)}  ${
              req.timestamp
            } dbg:${instance.stateManager.debugTXHistory[utils.stringifyReduce(req.txid)]}`
            respond(response, serializeRequestStateForTxResp)
            return
          }
          for (const key of req.keys) {
            const data = queueEntry.originalData[key]
            if (data) {
              response.stateList.push(data)
            }
          }
          response.success = true
          respond(response, serializeRequestStateForTxResp)
        } catch (e) {
          if (logFlags.error) instance.mainLogger.error(`${InternalRouteEnum.binary_request_state_for_tx}: Exception executing request: ${errorToStringFull(e)}`)
          nestedCountersInstance.countEvent('internal', `${route}-exception`)
          respond(response, serializeRequestStateForTxResp)
        } finally {
          profilerInstance.scopedProfileSectionEnd(InternalRouteEnum.binary_request_state_for_tx)
        }
      },
    }
    instance.p2p.registerInternalBinary(requestStateForTxRoute.name, requestStateForTxRoute.handler)

    networkContext.registerExternalPost('get-tx-receipt', async (req, res) => {
      let result: { success: boolean; receipt?: ArchiverReceipt | SignedReceipt; reason?: string }
      try {
        let err = utils.validateTypes(req.body, { // Renamed to avoid conflict
          txId: 's',
          timestamp: 'n',
          full_receipt: 'b',
          sign: 'o',
        })
        if (err) {
          res.json((result = { success: false, reason: err }))
          return
        }
        err = utils.validateTypes(req.body.sign, {
          owner: 's',
          sig: 's',
        })
        if (err) {
          res.json((result = { success: false, reason: err }))
          return
        }

        const { txId, timestamp, full_receipt, sign } = req.body
        const isReqFromArchiver = Archivers.archivers.has(sign.owner)
        if (!isReqFromArchiver) {
          result = { success: false, reason: 'Request not from Archiver.' }
        } else {
          const isValidSignature = instance.crypto.verify(req.body, sign.owner)
          if (isValidSignature) {
            let queueEntry: QueueEntry
            if (
              instance.archivedQueueEntriesByID.has(txId) &&
              instance.archivedQueueEntriesByID.get(txId)?.acceptedTx?.timestamp === timestamp
            ) {
              if (logFlags.verbose) console.log('get-tx-receipt: ', txId, timestamp, 'archived')
              queueEntry = instance.archivedQueueEntriesByID.get(txId)
            } else if (
              instance._transactionQueueByID.has(txId) &&
              instance._transactionQueueByID.get(txId)?.state === 'commiting' &&
              instance._transactionQueueByID.get(txId)?.acceptedTx?.timestamp === timestamp
            ) {
              if (logFlags.verbose) console.log('get-tx-receipt: ', txId, timestamp, 'commiting')
              queueEntry = instance._transactionQueueByID.get(txId)
            }
            if (!queueEntry) {
              res.status(400).json({ success: false, reason: 'Receipt Not Found.' })
              return
            }
            if (full_receipt) {
              const fullReceipt: ArchiverReceipt = await instance.getArchiverReceiptFromQueueEntry(queueEntry)
              if (fullReceipt === null) {
                res.status(400).json({ success: false, reason: 'Receipt Not Found.' })
                return
              }
              result = Utils.safeJsonParse(Utils.safeStringify({ success: true, receipt: fullReceipt }))
            } else {
              result = { success: true, receipt: instance.stateManager.getSignedReceipt(queueEntry) }
            }
          } else {
            result = { success: false, reason: 'Invalid Signature.' }
          }
        }
        res.json(result)
      } catch (e) {
        console.log('Error caught in /get-tx-receipt: ', e)
        res.json((result = { success: false, reason: e.toString() })) // Ensure reason is string
      }
    })
}