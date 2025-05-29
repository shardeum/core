import * as Context from '../p2p/Context'
import * as Comms from '../p2p/Comms'
import * as NodeList from '../p2p/NodeList'
import * as Self from '../p2p/Self'
import * as CycleChain from '../p2p/CycleChain'
import { isDebugModeMiddleware, isDebugModeMiddlewareLow } from '../network/debugMiddleware'
import { randomUUID } from 'crypto'
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum'
import { getTxTimestampReq, deserializeGetTxTimestampReq, serializeGetTxTimestampReq } from '../types/GetTxTimestampReq'
import { getTxTimestampResp, deserializeGetTxTimestampResp, serializeGetTxTimestampResp } from '../types/GetTxTimestampResp'
import { getStreamWithTypeCheck, requestErrorHandler } from '../types/Helpers'
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum'
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum'
import { InternalBinaryHandler } from '../types/Handler'
import { Route } from '@shardeum-foundation/lib-types/build/src/p2p/P2PTypes'
import { BadRequest, InternalError, serializeResponseError } from '../types/ResponseError'
import { deserializeGetConfirmOrChallengeReq, GetConfirmOrChallengeReq, serializeGetConfirmOrChallengeReq } from '../types/GetConfirmOrChallengeReq'
import { deserializeGetConfirmOrChallengeResp, GetConfirmOrChallengeResp, serializeGetConfirmOrChallengeResp } from '../types/GetConfirmOrChallengeResp'
import { SignedReceipt } from './state-manager-types'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { Utils } from '@shardeum-foundation/lib-types'
import { logFlags } from '../logger'
import { Request, Response } from 'express-serve-static-core'
import { errorToStringFull } from '../utils'
import * as utils from '../utils'
import { Node } from '../shardus/shardus-types'
import { profilerInstance } from '../utils/profiler'
import * as Shardus from '../shardus/shardus-types'
import { AppliedVoteHash } from './state-manager-types'
import {
  PoqoDataAndReceiptReq,
  serializePoqoDataAndReceiptReq,
  deserializePoqoDataAndReceiptResp,
} from '../types/PoqoDataAndReceiptReq'
import {
  deserializePoqoSendReceiptReq,
  PoqoSendReceiptReq,
  serializePoqoSendReceiptReq,
} from '../types/PoqoSendReceiptReq'
import {
  deserializePoqoSendVoteReq,
  serializePoqoSendVoteReq,
} from '../types/PoqoSendVoteReq'

export const handlerMethods = {
  setupHandlers(): void {
    Context.network.registerExternalGet('debug-poqo-fail', isDebugModeMiddleware, (req, res) => {
      try {
        const newChance = req.query.newChance
        if (typeof newChance !== 'string' || !newChance) {
          res.write(`debug-poqo-fail: missing param newChance ${this.debugFailPOQo}\n`)
          res.end()
          return
        }
        const newChanceInt = parseFloat(newChance)
        if (newChanceInt >= 1) {
          res.write(`debug-poqo-fail: newChance not a float: ${this.debugFailPOQo}\n`)
          res.end()
          return
        }
        this.debugFailPOQo = newChanceInt
        res.write(`debug-poqo-fail: set: ${this.debugFailPOQo}\n`)
      } catch (e) {
        res.write(`debug-poqo-fail: error: ${this.debugFailPOQo}\n`)
      }
      res.end()
    })

    Context.network.registerExternalGet('debug-poq-switch', isDebugModeMiddleware, (_req, res) => {
      try {
        this.stateManager.transactionQueue.useNewPOQ = !this.stateManager.transactionQueue.useNewPOQ
        res.write(`this.useNewPOQ: ${this.stateManager.transactionQueue.useNewPOQ}\n`)
      } catch (e) {
        res.write(`${e}\n`)
      }
      res.end()
    })

    Context.network.registerExternalGet('debug-poq-wait-before-confirm', isDebugModeMiddleware, (_req, res) => {
      try {
        const waitTimeBeforeConfirm = _req.query.waitTimeBeforeConfirm as string
        if (waitTimeBeforeConfirm && !isNaN(parseInt(waitTimeBeforeConfirm)))
          this.config.stateManager.waitTimeBeforeConfirm = parseInt(waitTimeBeforeConfirm)
        res.write(`stateManager.waitTimeBeforeConfirm: ${this.config.stateManager.waitTimeBeforeConfirm}\n`)
      } catch (e) {
        res.write(`${e}\n`)
      }
      res.end()
    })

    Context.network.registerExternalGet('debug-poq-wait-limit-confirm', isDebugModeMiddleware, (_req, res) => {
      try {
        const waitLimitAfterFirstVote = _req.query.waitLimitAfterFirstVote as string
        if (waitLimitAfterFirstVote && !isNaN(parseInt(waitLimitAfterFirstVote)))
          this.config.stateManager.waitLimitAfterFirstVote = parseInt(waitLimitAfterFirstVote)
        res.write(`stateManager.waitLimitAfterFirstVote: ${this.config.stateManager.waitLimitAfterFirstVote}\n`)
      } catch (e) {
        res.write(`${e}\n`)
      }
      res.end()
    })

    Context.network.registerExternalGet('debug-poq-wait-before-receipt', isDebugModeMiddleware, (_req, res) => {
      try {
        const waitTimeBeforeReceipt = _req.query.waitTimeBeforeReceipt as string
        if (waitTimeBeforeReceipt && !isNaN(parseInt(waitTimeBeforeReceipt)))
          this.config.stateManager.waitTimeBeforeReceipt = parseInt(waitTimeBeforeReceipt)
        res.write(`stateManager.waitTimeBeforeReceipt: ${this.config.stateManager.waitTimeBeforeReceipt}\n`)
      } catch (e) {
        res.write(`${e}\n`)
      }
      res.end()
    })

    Context.network.registerExternalGet('debug-poq-wait-limit-receipt', isDebugModeMiddleware, (_req, res) => {
      try {
        const waitLimitAfterFirstMessage = _req.query.waitLimitAfterFirstMessage as string
        if (waitLimitAfterFirstMessage && !isNaN(parseInt(waitLimitAfterFirstMessage)))
          this.config.stateManager.waitLimitAfterFirstMessage = parseInt(waitLimitAfterFirstMessage)
        res.write(`stateManager.waitLimitAfterFirstVote: ${this.config.stateManager.waitLimitAfterFirstMessage}\n`)
      } catch (e) {
        res.write(`${e}\n`)
      }
      res.end()
    })

    Context.network.registerExternalGet('debug-produceBadVote', isDebugModeMiddleware, (req, res) => {
      this.produceBadVote = !this.produceBadVote
      res.json({ status: 'ok', produceBadVote: this.produceBadVote })
    })

    Context.network.registerExternalGet('debug-produceBadChallenge', isDebugModeMiddleware, (req, res) => {
      this.produceBadChallenge = !this.produceBadChallenge
      res.json({ status: 'ok', produceBadChallenge: this.produceBadChallenge })
    })

    Context.network.registerExternalGet(
      'debug-profile-tx-timestamp-endpoint',
      isDebugModeMiddleware,
      async (req, res) => {
        try {
          const { offset } = req.query

          res.write('Profiling tx timestamp endpoint of all network nodes\n')

          const randomTxId = Context.crypto.hash(randomUUID())
          const cycleMarker = CycleChain.getCurrentCycleMarker()
          const cycleCounter = CycleChain.newest.counter

          const stats = new Map<string, number>()
          const failed = new Map<string, number>()

          const p2pPromises = Array.from(NodeList.nodes.values())
            .filter((node) => node.id !== Self.id)
            .map((node) => {
              const start = Date.now()
              return (this.p2p as any)
                .askBinary(
                  node,
                  InternalRouteEnum.binary_get_tx_timestamp,
                  {
                    cycleMarker,
                    cycleCounter,
                    txId: randomTxId,
                  },
                  serializeGetTxTimestampReq,
                  deserializeGetTxTimestampResp,
                  {},
                  '',
                  false,
                  offset ? parseInt(`${offset}`) : 30 * 1000
                )
                .then(() => {
                  const end = Date.now()
                  stats.set(`${node.externalIp}:${node.externalPort}`, end - start)
                })
                .catch(() => {
                  const end = Date.now()
                  failed.set(`${node.externalIp}:${node.externalPort}`, end - start)
                })
            })

          // Wait for all requests to finish
          await Promise.allSettled(p2pPromises)

          // Compute statistics
          const responseTimes = Array.from(stats.values()).sort((a, b) => a - b)
          const medianResponseTime = responseTimes[Math.floor(responseTimes.length / 2)] || 0
          const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / (responseTimes.length || 1)
          const failedNodes = Array.from(failed.keys())

          console.log('Profiling results:', {
            medianResponseTime,
            averageResponseTime,
            failedNodes,
            stats,
          })
          res.write('Profiling results:\n')
          res.write(`Median response time: ${medianResponseTime}ms\n`)
          res.write(`Average response time: ${averageResponseTime}ms\n`)
          res.write(`Failed nodes: ${failedNodes.join(', ')}\n`)
          res.write('Detailed stats:\n')
          res.write(`Node,Response Time\n`)
          stats.forEach((responseTime, node) => {
            res.write(`${node},${responseTime}\n`)
          })
          res.end()
        } catch (error) {
          console.error('Unexpected error:', error)
          res.write(`\n{"error":"Internal Server Error","details":"${error.message}"}`)
          res.end()
        }
      }
    )

    const getTxTimestampBinary: Route<InternalBinaryHandler<Buffer>> = {
      name: InternalRouteEnum.binary_get_tx_timestamp,
      handler: async (payload, respond, header) => {
        const route = InternalRouteEnum.binary_get_tx_timestamp
        this.profiler.scopedProfileSectionStart(route)
        nestedCountersInstance.countEvent('internal', route)
        profilerInstance.scopedProfileSectionStart(route, true, payload.length)

        const errorHandler = (
          errorType: RequestErrorEnum,
          opts?: { customErrorLog?: string; customCounterSuffix?: string }
        ): void => requestErrorHandler(route, errorType, header, opts)

        let tsReceipt: Shardus.TimestampReceipt
        try {
          const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cGetTxTimestampReq)
          if (!requestStream) {
            errorHandler(RequestErrorEnum.InvalidRequest)
            return respond(tsReceipt, serializeGetTxTimestampResp)
          }

          const readableReq = deserializeGetTxTimestampReq(requestStream)
          // handle rare race condition where we have seen the txId but not the timestamp
          if (
            Context.config.p2p.timestampCacheFix &&
            this.seenTimestampRequests.has(readableReq.txId) &&
            !this.txTimestampCacheByTxId.has(readableReq.txId)
          ) {
            nestedCountersInstance.countEvent('consensus', 'get_tx_timestamp seen txId but found no timestamp')
            return respond(BadRequest('get_tx_timestamp seen txId but found no timestamp'), serializeResponseError)
          }
          this.seenTimestampRequests.add(readableReq.txId)
          tsReceipt = this.getOrGenerateTimestampReceiptFromCache(
            readableReq.txId,
            readableReq.cycleMarker,
            readableReq.cycleCounter
          )
          return respond(tsReceipt, serializeGetTxTimestampResp)
        } catch (e) {
          nestedCountersInstance.countEvent('internal', `${route}-exception`)
          /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`${route}: Exception executing request: ${utils.errorToStringFull(e)}`)
          respond(tsReceipt, serializeGetTxTimestampResp)
        } finally {
          profilerInstance.scopedProfileSectionEnd(route, payload.length)
        }
      },
    }

    this.p2p.registerInternalBinary(getTxTimestampBinary.name, getTxTimestampBinary.handler)

    const getConfirmOrChallengeBinaryHandler: Route<InternalBinaryHandler<Buffer>> = {
      name: InternalRouteEnum.binary_get_confirm_or_challenge,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      handler: async (payload, respond, header, sign) => {
        const route = InternalRouteEnum.binary_get_confirm_or_challenge
        nestedCountersInstance.countEvent('internal', route)
        this.profiler.scopedProfileSectionStart(route, true, payload.length)
        const confirmOrChallengeResult: GetConfirmOrChallengeResp = {
          txId: '',
          appliedVoteHash: '',
          result: null,
          uniqueCount: 0,
        }
        try {
          const reqStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cGetConfirmOrChallengeReq)
          if (!reqStream) {
            nestedCountersInstance.countEvent('internal', `${route}-invalid_request`)
            respond(confirmOrChallengeResult, serializeGetConfirmOrChallengeResp)
            return
          }
          const request = deserializeGetConfirmOrChallengeReq(reqStream)
          const { txId } = request
          let queueEntry = this.stateManager.transactionQueue.getQueueEntrySafe(txId)
          if (queueEntry == null) {
            // It is ok to search the archive for this.  Not checking this was possibly breaking the gossip chain before
            queueEntry = this.stateManager.transactionQueue.getQueueEntryArchived(txId, route)
          }
          if (queueEntry == null) {
            /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`get_confirm_or_challenge no queue entry for ${txId} dbg:${this.stateManager.debugTXHistory[utils.stringifyReduce(txId)]}`)
            respond(confirmOrChallengeResult, serializeGetConfirmOrChallengeResp)
            return
          }
          if (queueEntry.receivedBestConfirmation == null && queueEntry.receivedBestChallenge == null) {
            nestedCountersInstance.countEvent('consensus', 'get_confirm_or_challenge no confirmation or challenge')
            /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`get_confirm_or_challenge no confirmation or challenge for ${queueEntry.logID}, bestVote: ${Utils.safeStringify(queueEntry.receivedBestVote)},  bestConfirmation: ${Utils.safeStringify(queueEntry.receivedBestConfirmation)}`)
            respond(confirmOrChallengeResult, serializeGetConfirmOrChallengeResp)
            return
          }

          // refine the result and unique count
          const { receivedBestChallenge, receivedBestConfirmation, uniqueChallengesCount } = queueEntry
          if (receivedBestChallenge && uniqueChallengesCount >= this.config.stateManager.minRequiredChallenges) {
            confirmOrChallengeResult.result = receivedBestChallenge
            confirmOrChallengeResult.uniqueCount = uniqueChallengesCount
          } else {
            confirmOrChallengeResult.result = receivedBestConfirmation
            confirmOrChallengeResult.uniqueCount = 1
          }
          respond(confirmOrChallengeResult, serializeGetConfirmOrChallengeResp)
        } catch (e) {
          // Error handling
          if (logFlags.error) this.mainLogger.error(`get_confirm_or_challenge error ${e.message}`)
          respond(confirmOrChallengeResult, serializeGetConfirmOrChallengeResp)
        } finally {
          this.profiler.scopedProfileSectionEnd(route)
        }
      },
    }

    this.p2p.registerInternalBinary(getConfirmOrChallengeBinaryHandler.name, getConfirmOrChallengeBinaryHandler.handler)

    Comms.registerGossipHandler('poqo-receipt-gossip', (payload: SignedReceipt & { txGroupCycle: number }) => {
      profilerInstance.scopedProfileSectionStart('poqo-receipt-gossip')
      try {
        const queueEntry = this.stateManager.transactionQueue.getQueueEntrySafe(payload.proposal.txid)
        if (queueEntry == null) {
          nestedCountersInstance.countEvent('poqo', 'error: gossip skipped: no queue entry')
          /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`poqo-receipt-gossip no queue entry for ${payload.proposal.txid}`)
          return
        }
        if (payload.txGroupCycle) {
          if (queueEntry.txGroupCycle !== payload.txGroupCycle) {
            /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`poqo-receipt-gossip mismatch txGroupCycle for txid: ${payload.proposal.txid}, sender's txGroupCycle: ${payload.txGroupCycle}, our txGroupCycle: ${queueEntry.txGroupCycle}`)
            nestedCountersInstance.countEvent(
              'poqo',
              'poqo-receipt-gossip: mismatch txGroupCycle for txid ' + payload.proposal.txid
            )
          }
          delete payload.txGroupCycle
        }

        if (queueEntry.hasSentFinalReceipt === true) {
          // We've already send this receipt, no need to send it again
          return
        }

        if (logFlags.verbose)
          this.mainLogger.debug(`POQo: received receipt from gossip for ${queueEntry.logID} forwarding gossip`)

        const executionGroupNodes = new Set(queueEntry.executionGroup.map((node) => node.publicKey))
        const hasTwoThirdsMajority = this.verifyAppliedReceipt(payload, executionGroupNodes)
        if (!hasTwoThirdsMajority) {
          /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`Receipt does not have the required majority for txid: ${payload.proposal.txid}`)
          nestedCountersInstance.countEvent('poqo', 'poqo-receipt-gossip: Rejecting receipt because no majority')
          return
        }

        queueEntry.signedReceipt = { ...payload }
        payload.txGroupCycle = queueEntry.txGroupCycle
        Comms.sendGossip(
          'poqo-receipt-gossip',
          payload,
          null,
          null,
          queueEntry.transactionGroup,
          false,
          4,
          payload.proposal.txid,
          '',
          true
        )

        queueEntry.hasSentFinalReceipt = true

        // If the queue entry does not have the valid final data then request that
        if (!queueEntry.hasValidFinalData) {
          setTimeout(async () => {
            // Check if we have final data
            if (queueEntry.hasValidFinalData) {
              return
            }
            if (logFlags.verbose)
              this.mainLogger.debug(`poqo-receipt-gossip: requesting final data for ${queueEntry.logID}`)
            nestedCountersInstance.countEvent('request-final-data', 'final data timeout, making explicit request')

            const nodesToAskKeys = payload.signaturePack?.map((signature) => signature.owner)

            await this.stateManager.transactionQueue.requestFinalData(
              queueEntry,
              payload.proposal.accountIDs,
              nodesToAskKeys
            )

            nestedCountersInstance.countEvent('request-final-data', 'final data received')
          }, this.config.stateManager.nonExWaitForData)
        }
      } finally {
        profilerInstance.scopedProfileSectionEnd('poqo-receipt-gossip')
      }
    })

    const poqoDataAndReceiptBinaryHandler: Route<InternalBinaryHandler<Buffer>> = {
      name: InternalRouteEnum.binary_poqo_data_and_receipt,
      handler: async (payload, respond, header, sign) => {
        const route = InternalRouteEnum.binary_poqo_data_and_receipt
        this.profiler.scopedProfileSectionStart(route, false)
        try {
          const _sender = header.sender_id
          const reqStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cPoqoDataAndReceiptReq)
          if (!reqStream) {
            nestedCountersInstance.countEvent('internal', `${route}-invalid_request`)
            return
          }
          const readableReq = deserializePoqoDataAndReceiptResp(reqStream)
          // make sure we have it
          const queueEntry = this.stateManager.transactionQueue.getQueueEntrySafe(readableReq.finalState.txid) // , payload.timestamp)
          //It is okay to ignore this transaction if the txId is not found in the queue.
          if (queueEntry == null) {
            //In the past we would enqueue the TX, expecially if syncing but that has been removed.
            //The normal mechanism of sharing TXs is good enough.
            nestedCountersInstance.countEvent('processing', 'broadcast_finalstate_noQueueEntry')
            return
          }

          // validate corresponding tell sender
          if (_sender == null) {
            /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`poqo-data-and-receipt invalid sender for txid: ${readableReq.finalState.txid}, sender: ${_sender}`)
            return
          }

          if (readableReq.txGroupCycle) {
            if (queueEntry.txGroupCycle !== readableReq.txGroupCycle) {
              /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`binary_poqo_data_and_receipt mismatch txGroupCycle for txid: ${readableReq.finalState.txid}, sender's txGroupCycle: ${readableReq.txGroupCycle}, our txGroupCycle: ${queueEntry.txGroupCycle}`)
              nestedCountersInstance.countEvent(
                'poqo',
                'binary_poqo_data_and_receipt: mismatch txGroupCycle for txid ' + readableReq.finalState.txid
              )
            }
            delete readableReq.txGroupCycle
          }

          const isValidFinalDataSender =
            this.stateManager.transactionQueue.factValidateCorrespondingTellFinalDataSender(queueEntry, _sender)
          if (isValidFinalDataSender === false) {
            nestedCountersInstance.countEvent(
              'poqo',
              'poqo-data-and-receipt: Rejecting receipt: isValidFinalDataSender === false'
            )
            /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`poqo-data-and-receipt invalid: sender ${_sender} for data: ${queueEntry.acceptedTx.txId}`)
            return
          }

          if (readableReq.receipt == null) {
            nestedCountersInstance.countEvent(
              'poqo',
              'poqo-data-and-receipt: Rejecting receipt: readableReq.receipt == null'
            )
            /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`poqo-data-and-receipt invalid: readableReq.receipt == null sender ${_sender}`)
            return
          }
          if (readableReq.finalState.txid != readableReq.receipt.proposal.txid) {
            nestedCountersInstance.countEvent(
              'poqo',
              'poqo-data-and-receipt: Rejecting receipt: readableReq.finalState.txid != readableReq.receipt.txid'
            )
            /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`poqo-data-and-receipt invalid: readableReq.finalState.txid != readableReq.receipt.txid sender ${_sender}  ${readableReq.finalState.txid} != ${readableReq.receipt.proposal.txid}`)
            return
          }

          if (!queueEntry.hasSentFinalReceipt) {
            const executionGroupNodes = new Set(queueEntry.executionGroup.map((node) => node.publicKey))
            const hasTwoThirdsMajority = this.verifyAppliedReceipt(readableReq.receipt, executionGroupNodes)
            if (!hasTwoThirdsMajority) {
              /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`Receipt does not have the required majority for txid: ${readableReq.receipt.proposal.txid}`)
              nestedCountersInstance.countEvent('poqo', 'poqo-data-and-receipt: Rejecting receipt because no majority')
              return
            }
            if (logFlags.verbose)
              this.mainLogger.debug(`POQo: received data & receipt for ${queueEntry.logID} starting receipt gossip`)
            queueEntry.signedReceipt = readableReq.receipt
            const receiptToGossip = { ...readableReq.receipt, txGroupCycle: queueEntry.txGroupCycle }
            Comms.sendGossip(
              'poqo-receipt-gossip',
              receiptToGossip,
              null,
              null,
              queueEntry.transactionGroup,
              false,
              4,
              readableReq.finalState.txid,
              '',
              true
            )
            queueEntry.hasSentFinalReceipt = true
          }

          if (logFlags.debug)
            this.mainLogger.debug(
              `poqo-data-and-receipt ${queueEntry.logID}, ${Utils.safeStringify(readableReq.finalState.stateList)}`
            )
          // add the data in
          const savedAccountIds: Set<string> = new Set()
          for (const data of readableReq.finalState.stateList) {
            //let wrappedResponse = data as Shardus.WrappedResponse
            //this.queueEntryAddData(queueEntry, data)
            if (data == null) {
              /* prettier-ignore */ if (logFlags.error && logFlags.verbose) this.mainLogger.error(`poqo-data-and-receipt data == null`)
              continue
            }

            if (queueEntry.collectedFinalData[data.accountId] == null) {
              queueEntry.collectedFinalData[data.accountId] = data
              savedAccountIds.add(data.accountId)
              /* prettier-ignore */ if (logFlags.playback && logFlags.verbose) this.logger.playbackLogNote('poqo-data-and-receipt', `${queueEntry.logID}`, `poqo-data-and-receipt addFinalData qId: ${queueEntry.entryID} data:${utils.makeShortHash(data.accountId)} collected keys: ${utils.stringifyReduce(Object.keys(queueEntry.collectedFinalData))}`)
            }

            // if (queueEntry.state === 'syncing') {
            //   /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_sync_gotBroadcastfinalstate', `${queueEntry.acceptedTx.txId}`, ` qId: ${queueEntry.entryID} data:${data.accountId}`)
            // }
          }
          
        } catch (e) {
          /* prettier-ignore */ if (logFlags.error) console.error(`Error processing poqoDataAndReceipt Binary handler: ${e}`)
          nestedCountersInstance.countEvent('internal', `${route}-exception`)
          /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`${route}: Exception executing request: ${utils.errorToStringFull(e)}`)
        } finally {
          profilerInstance.scopedProfileSectionEnd(route)
        }
      },
    }
    Comms.registerInternalBinary(poqoDataAndReceiptBinaryHandler.name, poqoDataAndReceiptBinaryHandler.handler)

    const poqoSendReceiptBinary: Route<InternalBinaryHandler<Buffer>> = {
      name: InternalRouteEnum.binary_poqo_send_receipt,
      handler: async (payload, respond, header) => {
        const route = InternalRouteEnum.binary_poqo_send_receipt
        this.profiler.scopedProfileSectionStart(route)
        nestedCountersInstance.countEvent('internal', route)
        profilerInstance.scopedProfileSectionStart(route, false, payload.length)

        const errorHandler = (
          errorType: RequestErrorEnum,
          opts?: { customErrorLog?: string; customCounterSuffix?: string }
        ): void => requestErrorHandler(route, errorType, header, opts)

        try {
          const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cPoqoSendReceiptReq)
          if (!requestStream) {
            return errorHandler(RequestErrorEnum.InvalidRequest)
          }

          const readableReq = deserializePoqoSendReceiptReq(requestStream)

          const queueEntry = this.stateManager.transactionQueue.getQueueEntrySafe(readableReq.proposal.txid)
          if (queueEntry == null) {
            /* prettier-ignore */ nestedCountersInstance.countEvent('poqo', 'binary/poqo_send_receipt: no queue entry found')
            return
          }
          if (readableReq.txGroupCycle) {
            if (queueEntry.txGroupCycle !== readableReq.txGroupCycle) {
              /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`binary_poqo_send_receipt mismatch txGroupCycle for txid: ${readableReq.proposal.txid}, sender's txGroupCycle: ${readableReq.txGroupCycle}, our txGroupCycle: ${queueEntry.txGroupCycle}`)
              nestedCountersInstance.countEvent(
                'poqo',
                'binary_poqo_send_receipt: mismatch txGroupCycle for tx ' + readableReq.proposal.txid
              )
            }
            delete readableReq.txGroupCycle
          }

          if (queueEntry.signedReceipt) {
            // We've already handled this
            return
          }

          const executionGroupNodes = new Set(queueEntry.executionGroup.map((node) => node.publicKey))
          const hasTwoThirdsMajority = this.verifyAppliedReceipt(readableReq, executionGroupNodes)
          if (!hasTwoThirdsMajority) {
            /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`Receipt does not have the required majority for txid: ${readableReq.proposal.txid}`)
            nestedCountersInstance.countEvent('poqo', 'poqo-send-receipt: Rejecting receipt because no majority')
            return
          }

          if (logFlags.verbose)
            this.mainLogger.debug(
              `POQo: Received receipt from aggregator for ${queueEntry.logID} starting CT2 for data & receipt`
            )
          const receivedReceipt = readableReq as SignedReceipt
          queueEntry.signedReceipt = receivedReceipt
          queueEntry.hasSentFinalReceipt = true
          const receiptToGossip = { ...readableReq, txGroupCycle: queueEntry.txGroupCycle }
          Comms.sendGossip(
            'poqo-receipt-gossip',
            receiptToGossip,
            null,
            null,
            queueEntry.transactionGroup,
            false,
            4,
            readableReq.proposal.txid,
            '',
            true
          )

          // Only forward data if we have a valid matching preApply
          if (queueEntry.ourVoteHash === readableReq.proposalHash) {
            // We are a winning node
            nestedCountersInstance.countEvent('poqo', 'poqo-send-receipt: forwarding data')
            this.stateManager.transactionQueue.factTellCorrespondingNodesFinalData(queueEntry)
          } else {
            nestedCountersInstance.countEvent('poqo', "poqo-send-receipt: no matching data. Can't forward")
          }
        } catch (e) {
          /* prettier-ignore */ if (logFlags.error) console.error(`Error processing poqoSendReceiptBinary handler: ${e}`)
          nestedCountersInstance.countEvent('internal', `${route}-exception`)
          /* prettier-ignore */ if (logFlags.error)this.mainLogger.error(`${route}: Exception executing request: ${utils.errorToStringFull(e)}`)
        } finally {
          profilerInstance.scopedProfileSectionEnd(route)
        }
      },
    }

    Comms.registerInternalBinary(poqoSendReceiptBinary.name, poqoSendReceiptBinary.handler)

    const poqoSendVoteBinaryHandler: Route<InternalBinaryHandler<Buffer>> = {
      name: InternalRouteEnum.binary_poqo_send_vote,
      handler: (payload, respond, header, sign) => {
        const route = InternalRouteEnum.binary_poqo_send_vote
        profilerInstance.scopedProfileSectionStart(route, false)
        try {
          const stream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cPoqoSendVoteReq)
          if (!payload) {
            nestedCountersInstance.countEvent('internal', `${route}-invalid_request`)
            return
          }
          const readableReq = deserializePoqoSendVoteReq(stream)
          const queueEntry = this.stateManager.transactionQueue.getQueueEntrySafe(readableReq.txid)
          if (queueEntry == null) {
            /* prettier-ignore */ nestedCountersInstance.countEvent('poqo', 'poqo-send-vote: no queue entry found')
            return
          }
          // if (readableReq.txGroupCycle) {
          //   if (queueEntry.txGroupCycle !== readableReq.txGroupCycle) {
          //     /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`binary_poqo_send_vote mismatch txGroupCycle for txid: ${readableReq.txid}, sender's txGroupCycle: ${readableReq.txGroupCycle}, our txGroupCycle: ${queueEntry.txGroupCycle}`)
          //     nestedCountersInstance.countEvent(
          //       'poqo',
          //       'binary_poqo_send_vote: mismatch txGroupCycle for tx ' + readableReq.txid
          //     )
          //   }
          //   delete readableReq.txGroupCycle
          // }
          const collectedVoteHash = readableReq as AppliedVoteHash

          // Check if vote hash has a sign
          if (!collectedVoteHash.sign) {
            /* prettier-ignore */ nestedCountersInstance.countEvent('poqo', 'poqo-send-vote: no sign found')
            return
          }
          // We can reuse the same function for POQo
          this.tryAppendVoteHash(queueEntry, collectedVoteHash)
        } catch (e) {
          /* prettier-ignore */ if (logFlags.error) console.error(`Error processing poqoSendVoteBinary handler: ${e}`)
          nestedCountersInstance.countEvent('internal', `${route}-exception`)
          /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`${route}: Exception executing request: ${utils.errorToStringFull(e)}`)
        } finally {
          profilerInstance.scopedProfileSectionEnd(route)
        }
      },
    }
    Comms.registerInternalBinary(poqoSendVoteBinaryHandler.name, poqoSendVoteBinaryHandler.handler)
  }
}