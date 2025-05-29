import { EventEmitter } from 'events'
import { P2P as P2PTypes } from '@shardeum-foundation/lib-types'
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { profilerInstance } from '../utils/profiler'
import {
  RequestReceiptForTxReqSerialized,
  deserializeRequestReceiptForTxReq
} from '../types/RequestReceiptForTxReq'
import {
  RequestReceiptForTxRespSerialized,
  serializeRequestReceiptForTxResp
} from '../types/RequestReceiptForTxResp'
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum'
import { getStreamWithTypeCheck, requestErrorHandler } from '../types/Helpers'
import { InternalBinaryHandler } from '../types/Handler'
// Route type is defined inline with handlers
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum'
import { logFlags } from '../logger'
import * as utils from '../utils'
import { Utils } from '@shardeum-foundation/lib-types'
import * as ShardusTypes from '../shardus/shardus-types'
import { ResponseError } from '../types/ResponseError'
import * as Comms from '../p2p/Comms'
import * as Context from '../p2p/Context'
import { activeByIdOrder } from '../p2p/NodeList'
import { VectorBufferStream } from '../utils/serialization/VectorBufferStream'
import { InternalError, serializeResponseError, BadRequest } from '../types/ResponseError'
import {
  RequestStateForTxPostReq,
  deserializeRequestStateForTxPostReq
} from '../types/RequestStateForTxPostReq'
import {
  RequestStateForTxPostResp,
  serializeRequestStateForTxPostResp
} from '../types/RequestStateForTxPostResp'
import {
  GetTrieHashesRequest,
  serializeGetTrieHashesReq
} from '../types/GetTrieHashesReq'
import {
  GetTrieHashesResponse,
  deserializeGetTrieHashesResp
} from '../types/GetTrieHashesResp'
import {
  GetAccountDataByHashesReq,
  serializeGetAccountDataByHashesReq
} from '../types/GetAccountDataByHashesReq'
import {
  GetAccountDataByHashesResp,
  deserializeGetAccountDataByHashesResp
} from '../types/GetAccountDataByHashesResp'
import {
  RepairOOSAccountsReq,
  serializeRepairOOSAccountsReq,
  deserializeRepairOOSAccountsReq
} from '../types/RepairOOSAccountsReq'
// BinaryRequest and BinaryResponse types are not needed
import { isDebugModeMiddleware, isDebugModeMiddlewareLow } from '../network/debugMiddleware'
import {
  GetAccountDataWithQueueHintsReqSerializable,
  deserializeGetAccountDataWithQueueHintsReq
} from '../types/GetAccountDataWithQueueHintsReq'
import {
  GetAccountDataWithQueueHintsRespSerializable,
  serializeGetAccountDataWithQueueHintsResp
} from '../types/GetAccountDataWithQueueHintsResp'
import {
  RequestTxAndStateReq,
  deserializeRequestTxAndStateReq
} from '../types/RequestTxAndStateReq'
import {
  RequestTxAndStateResp,
  serializeRequestTxAndStateResp
} from '../types/RequestTxAndStateResp'
import {
  GetAccountQueueCountReq,
  deserializeGetAccountQueueCountReq
} from '../types/GetAccountQueueCountReq'
import {
  GetAccountQueueCountResp,
  serializeGetAccountQueueCountResp
} from '../types/GetAccountQueueCountResp'

// Type for the callback
export type Callback = (...args: unknown[]) => void

export const endpointMethods = {
  registerEndpoints() {
    // alternatively we would need to query for accepted tx.

    this.accountGlobals.setupHandlers()

    if (this.partitionObjects != null) {
        this.partitionObjects.setupHandlers()
    }

    this.transactionQueue.setupHandlers()

    this.accountSync.setupHandlers()

    this.transactionConsensus.setupHandlers()

    this.accountPatcher.setupHandlers()

    this.cachedAppDataManager.setupHandlers()

    this.partitionStats.setupHandlers()

    const requestReceiptForTxBinaryHandler: P2PTypes.P2PTypes.Route<InternalBinaryHandler<Buffer>> = {
        name: InternalRouteEnum.binary_request_receipt_for_tx,
        handler: (payload, respond) => {
            const route = InternalRouteEnum.binary_request_receipt_for_tx
            profilerInstance.scopedProfileSectionStart(route, false, payload.length)
            nestedCountersInstance.countEvent('stateManager', route)

            const response: RequestReceiptForTxRespSerialized = { receipt: null, note: '', success: false }
            try {
                const req = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cRequestReceiptForTxReq)
                const deserialized = deserializeRequestReceiptForTxReq(req)
                let queueEntry = this.transactionQueue.getQueueEntrySafe(deserialized.txid)
                if (queueEntry == null) {
                    queueEntry = this.transactionQueue.getQueueEntryArchived(deserialized.txid, route)
                }

                if (queueEntry == null) {
                    response.note = `failed to find queue entry: ${utils.stringifyReduce(deserialized.txid)}  ${deserialized.timestamp
                        } dbg:${this.debugTXHistory[utils.stringifyReduce(deserialized.txid)]}`
                    respond(response, serializeRequestReceiptForTxResp)
                    return
                }

                if (queueEntry.acceptedTx?.timestamp !== deserialized.timestamp) {
                    response.note = `requested timestamp does not match txid: ${utils.stringifyReduce(deserialized.txid)} 
            request: ${deserialized.timestamp} 
            queueuEntry timestamp: ${queueEntry.acceptedTx?.timestamp}
            dbg:${this.debugTXHistory[utils.stringifyReduce(deserialized.txid)]}`
                    respond(response, serializeRequestReceiptForTxResp)
                    return
                }

                response.receipt = this.getSignedReceipt(queueEntry)
                if (response.receipt != null) {
                    response.success = true
                } else {
                    response.note = `found queueEntry but no receipt: ${utils.stringifyReduce(deserialized.txid)} ${deserialized.txid
                        }  ${deserialized.timestamp}`
                }
                respond(response, serializeRequestReceiptForTxResp)
            } catch (e) {
                this.mainLogger.error(`${route} error: ${e.message} stack: ${e.stack}`)
                nestedCountersInstance.countEvent('internal', `${route}-exception`)
                respond(response, serializeRequestReceiptForTxResp)
            } finally {
                profilerInstance.scopedProfileSectionEnd(route)
            }
        },
    }

    this.p2p.registerInternalBinary(requestReceiptForTxBinaryHandler.name, requestReceiptForTxBinaryHandler.handler)

    const requestStateForTxPostBinaryHandler: P2PTypes.P2PTypes.Route<InternalBinaryHandler<Buffer>> = {
        name: InternalRouteEnum.binary_request_state_for_tx_post,
        handler: async (payload, respond, header, sign) => {
            const route = InternalRouteEnum.binary_request_state_for_tx_post
            profilerInstance.scopedProfileSectionStart(route, false, payload.length)
            nestedCountersInstance.countEvent('internal', route)
            const errorHandler = (
                errorType: RequestErrorEnum,
                opts?: { customErrorLog?: string; customCounterSuffix?: string }
            ): void => requestErrorHandler(route, errorType, header, opts)

            try {
                const response: RequestStateForTxPostResp = {
                    stateList: [],
                    beforeHashes: {},
                    note: '',
                    success: false,
                }

                const txId = header.verification_data
                let queueEntry = this.transactionQueue.getQueueEntrySafe(txId)
                if (queueEntry == null) {
                    queueEntry = this.transactionQueue.getQueueEntryArchived(txId, route)
                }
                if (queueEntry == null) {
                    response.note = `failed to find queue entry: ${utils.stringifyReduce(txId)} dbg:${this.debugTXHistory[utils.stringifyReduce(txId)]
                        }`
            /* prettier-ignore */ nestedCountersInstance.countEvent('stateManager', `${route} cant find queue entry`)
                    return respond(response, serializeRequestStateForTxPostResp)
                }

                if (queueEntry.hasValidFinalData === false) {
                    response.note = `has queue entry but not final data: ${utils.stringifyReduce(txId)} dbg:${this.debugTXHistory[utils.stringifyReduce(txId)]
                        }`

                    if (logFlags.error && logFlags.verbose) this.mainLogger.error(response.note)
            /* prettier-ignore */ nestedCountersInstance.countEvent('stateManager', `${route} hasValidFinalData==false, tx state: ${queueEntry.state}`)
                    return respond(response, serializeRequestStateForTxPostResp)
                }

                const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cRequestStateForTxPostReq)
                if (!requestStream) {
                    errorHandler(RequestErrorEnum.InvalidRequest)
                    return respond(response, serializeRequestStateForTxPostResp)
                }

                const req = deserializeRequestStateForTxPostReq(requestStream)
                // app.getRelevantData(accountId, tx) -> wrappedAccountState  for local accounts
                let wrappedStates = this.useAccountWritesOnly ? {} : queueEntry.collectedData
                const applyResponse = queueEntry?.preApplyTXResult.applyResponse
                if (applyResponse != null && applyResponse.accountWrites != null && applyResponse.accountWrites.length > 0) {
                    const writtenAccountsMap: { [id: string]: unknown } = {}
                    for (const writtenAccount of applyResponse.accountWrites) {
                        writtenAccountsMap[writtenAccount.accountId] = writtenAccount.data
                    }
                    wrappedStates = writtenAccountsMap
            /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`request_state_for_tx_post applyResponse.accountWrites tx:${queueEntry.logID} ts:${queueEntry.acceptedTx.timestamp} accounts: ${utils.stringifyReduce(Object.keys(wrappedStates))}`)
                }

                if (wrappedStates != null) {
                    for (const [key, accountData] of Object.entries(wrappedStates)) {
                        const typedAccountData = accountData as any
                        if (req.key !== typedAccountData.accountId) {
                            continue // Not this account.
                        }

                        if (typedAccountData.stateId != req.hash) {
                            response.note = `failed accountData.stateId != req.hash txid: ${utils.makeShortHash(
                                req.txid
                            )} hash:${utils.makeShortHash(typedAccountData.stateId)}`
                /* prettier-ignore */ nestedCountersInstance.countEvent('stateManager', `${route} failed accountData.stateId != req.hash txid`)
                            return respond(response, serializeRequestStateForTxPostResp)
                        }
                        if (typedAccountData) {
                            response.beforeHashes[key] = queueEntry.beforeHashes[key]
                            response.stateList.push(typedAccountData)
                        }
                    }
                }
                nestedCountersInstance.countEvent('stateManager', `${route} success`)
                response.success = true
                return respond(response, serializeRequestStateForTxPostResp)
            } catch (e) {
                if (logFlags.error) this.mainLogger.error(`${route} error: ${utils.errorToStringFull(e)}`)
                nestedCountersInstance.countEvent('internal', `${route}-exception`)
                respond({ stateList: [], beforeHashes: {}, note: '', success: false }, serializeRequestStateForTxPostResp)
            } finally {
                profilerInstance.scopedProfileSectionEnd(route, payload.length)
            }
        },
    }

    this.p2p.registerInternalBinary(requestStateForTxPostBinaryHandler.name, requestStateForTxPostBinaryHandler.handler)

    const requestTxAndStateBinaryHandler: P2PTypes.P2PTypes.Route<InternalBinaryHandler<Buffer>> = {
        name: InternalRouteEnum.binary_request_tx_and_state,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        handler: async (payload, respond, header, sign) => {
            const route = InternalRouteEnum.binary_request_tx_and_state
            nestedCountersInstance.countEvent('internal', route)
            this.profiler.scopedProfileSectionStart(route, false, payload.length)
            const errorHandler = (
                errorType: RequestErrorEnum,
                opts?: { customErrorLog?: string; customCounterSuffix?: string }
            ): void => requestErrorHandler(route, errorType, header, opts)

            let response: RequestTxAndStateResp = {
                stateList: [],
                account_state_hash_before: {},
                account_state_hash_after: {},
                note: '',
                success: false,
                appReceiptData: null,
            }
            try {
                const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cRequestTxAndStateReq)
                if (!requestStream) {
                    errorHandler(RequestErrorEnum.InvalidRequest)
                    respond(response, serializeRequestTxAndStateResp)
                    return
                }

                const req: RequestTxAndStateReq = deserializeRequestTxAndStateReq(requestStream)

                const txid = req.txid
                const requestedAccountIds = req.accountIds

                let queueEntry = this.transactionQueue.getQueueEntrySafe(txid)
                if (queueEntry == null) {
                    queueEntry = this.transactionQueue.getQueueEntryArchived(txid, route)
                }

                if (queueEntry == null) {
                    response.note = `failed to find queue entry: ${utils.stringifyReduce(txid)} dbg:${this.debugTXHistory[utils.stringifyReduce(txid)]
                        }`

                    if (logFlags.error) this.mainLogger.error(`${route} ${response.note}`)
                    respond(response, serializeRequestTxAndStateResp)
                    return
                }

                if (queueEntry.isInExecutionHome === false) {
                    response.note = `${route} not in execution group: ${utils.stringifyReduce(txid)}`
            /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(response.note)
                    respond(response, serializeRequestTxAndStateResp)
                    return
                }

                let receipt2 = this.getSignedReceipt(queueEntry)
                if (receipt2 == null) {
                    response.note = `${route} does not have valid receipt2: ${utils.stringifyReduce(txid)}`
            /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(response.note)
                    respond(response, serializeRequestTxAndStateResp)
                    return
                }

                let wrappedStates = this.useAccountWritesOnly ? {} : queueEntry.collectedData

                // if we have applyResponse then use it.  This is where and advanced apply() will put its transformed data
                const writtenAccountsMap: { [id: string]: unknown } = {}
                const applyResponse = queueEntry?.preApplyTXResult.applyResponse
                if (applyResponse != null && applyResponse.accountWrites != null && applyResponse.accountWrites.length > 0) {
                    for (const writtenAccount of applyResponse.accountWrites) {
                        writtenAccountsMap[writtenAccount.accountId] = writtenAccount.data
                    }
                    wrappedStates = writtenAccountsMap
            /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`request_tx_and_state applyResponse.accountWrites tx:${queueEntry.logID} ts:${queueEntry.acceptedTx.timestamp} accounts: ${utils.stringifyReduce(Object.keys(wrappedStates))}  `)
                }

                //TODO figure out if we need to include collectedFinalData (after refactor/cleanup)

                if (wrappedStates != null) {
                    for (let i = 0; i < receipt2.proposal.accountIDs.length; i++) {
                        let key = receipt2.proposal.accountIDs[i]
                        let accountData = wrappedStates[key]
                        if (accountData && requestedAccountIds.includes(key)) {
                            // eslint-disable-next-line security/detect-object-injection
                            response.account_state_hash_before[key] = receipt2.proposal.beforeStateHashes[i]
                            response.account_state_hash_after[key] = receipt2.proposal.afterStateHashes[i]
                            response.stateList.push(accountData)
                        }
                    }
                    response.appReceiptData = queueEntry.preApplyTXResult?.applyResponse?.appReceiptData
                }
                response.success = true
          /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`request_tx_and_state success: ${queueEntry.logID}  ${response.stateList.length}  ${Utils.safeStringify(response)}`)
                respond(response, serializeRequestTxAndStateResp)
            } catch (e) {
                nestedCountersInstance.countEvent('internal', `${route}-exception`)
          /* prettier-ignore */ if (logFlags.error) Context.logger.getLogger('p2p').error(`${route}: Exception executing request: ${utils.errorToStringFull(e)}`)
                respond(response, serializeRequestTxAndStateResp)
            } finally {
                this.profiler.scopedProfileSectionEnd(route)
            }
        },
    }

    const requestTxAndStateBeforeBinaryHandler: P2PTypes.P2PTypes.Route<InternalBinaryHandler<Buffer>> = {
        name: InternalRouteEnum.binary_request_tx_and_state_before,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        handler: async (payload, respond, header, sign) => {
            const route = InternalRouteEnum.binary_request_tx_and_state_before
            nestedCountersInstance.countEvent('internal', route)
            this.profiler.scopedProfileSectionStart(route, false, payload.length)
            const errorHandler = (
                errorType: RequestErrorEnum,
                opts?: { customErrorLog?: string; customCounterSuffix?: string }
            ): void => requestErrorHandler(route, errorType, header, opts)

            let response: RequestTxAndStateResp = {
                stateList: [],
                account_state_hash_before: {},
                account_state_hash_after: {},
                note: '',
                success: false,
            }
            try {
                const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cRequestTxAndStateReq)
                if (!requestStream) {
                    errorHandler(RequestErrorEnum.InvalidRequest)
                    respond(response, serializeRequestTxAndStateResp)
                    return
                }

                const req: RequestTxAndStateReq = deserializeRequestTxAndStateReq(requestStream)

                const txid = req.txid
                const requestedAccountIds = req.accountIds

                let queueEntry = this.transactionQueue.getQueueEntrySafe(txid)
                if (queueEntry == null) {
                    queueEntry = this.transactionQueue.getQueueEntryArchived(txid, route)
                }

                if (queueEntry == null) {
                    response.note = `failed to find queue entry: ${utils.stringifyReduce(txid)} dbg:${this.debugTXHistory[utils.stringifyReduce(txid)]
                        }`

                    if (logFlags.error) this.mainLogger.error(`${route} ${response.note}`)
                    respond(response, serializeRequestTxAndStateResp)
                    return
                }

                if (queueEntry.isInExecutionHome === false) {
                    response.note = `${route} not in execution group: ${utils.stringifyReduce(txid)}`
            /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(response.note)
                    respond(response, serializeRequestTxAndStateResp)
                    return
                }

                let receipt2 = this.getSignedReceipt(queueEntry)
                if (receipt2 == null) {
                    response.note = `${route} does not have valid receipt2: ${utils.stringifyReduce(txid)}`
            /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(response.note)
                    respond(response, serializeRequestTxAndStateResp)
                    return
                }

                // we just need to send collected state
                for (const accountId of requestedAccountIds) {
                    const beforeState = queueEntry.collectedData[accountId]
                    const index = receipt2.proposal.accountIDs.indexOf(accountId)
                    if (beforeState && beforeState.stateId === receipt2.proposal.beforeStateHashes[index]) {
                        response.stateList.push(queueEntry.collectedData[accountId])
                    } else {
                        response.note = `has bad beforeStateAccount: ${utils.stringifyReduce(txid)} dbg:${this.debugTXHistory[utils.stringifyReduce(txid)]
                            }`
                        if (logFlags.error) this.mainLogger.error(`${route} ${response.note}`)
                        respond(response, serializeRequestTxAndStateResp)
                        return
                    }
                }
                response.success = true
          /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`request_tx_and_state_before success: ${queueEntry.logID}  ${response.stateList.length}  ${Utils.safeStringify(response)}`)
                respond(response, serializeRequestTxAndStateResp)
            } catch (e) {
                nestedCountersInstance.countEvent('internal', `${route}-exception`)
          /* prettier-ignore */ if (logFlags.error) Context.logger.getLogger('p2p').error(`${route}: Exception executing request: ${utils.errorToStringFull(e)}`)
                respond(response, serializeRequestTxAndStateResp)
            } finally {
                this.profiler.scopedProfileSectionEnd(route)
            }
        },
    }

    this.p2p.registerInternalBinary(requestTxAndStateBinaryHandler.name, requestTxAndStateBinaryHandler.handler)

    this.p2p.registerInternalBinary(
        requestTxAndStateBeforeBinaryHandler.name,
        requestTxAndStateBeforeBinaryHandler.handler
    )

    const binaryGetAccDataWithQueueHintsHandler: P2PTypes.P2PTypes.Route<InternalBinaryHandler<Buffer>> = {
        name: InternalRouteEnum.binary_get_account_data_with_queue_hints,
        handler: async (payload, respond, header, sign) => {
            const route = InternalRouteEnum.binary_get_account_data_with_queue_hints
            profilerInstance.scopedProfileSectionStart(route, false, payload.length)
            nestedCountersInstance.countEvent('internal', route)

            try {
                let accountData = null
                const requestStream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cGetAccountDataWithQueueHintsReq)
                if (!requestStream) {
                    // implement error handling
                    nestedCountersInstance.countEvent('internal', `${route}-invalid_request`)
                    return respond(BadRequest(`${route} invalid request`), serializeResponseError)
                }
                const req = deserializeGetAccountDataWithQueueHintsReq(requestStream)
                const MAX_ACCOUNTS = this.config.stateManager.accountBucketSize
                if (req.accountIds.length > MAX_ACCOUNTS) {
                    nestedCountersInstance.countEvent('internal', `${route}-too_many_accounts`)
                    return respond(BadRequest(`${route} too many accounts requested`), serializeResponseError)
                }
                if (utils.isValidShardusAddress(req.accountIds) === false) {
                    nestedCountersInstance.countEvent('internal', `${route}-invalid_account_ids`)
                    return respond(BadRequest(`${route} invalid account_ids`), serializeResponseError)
                }
                let ourLockID = -1
                try {
                    ourLockID = await this.fifoLock('accountModification')
                    accountData = await this.app.getAccountDataByList(req.accountIds)
                } finally {
                    this.fifoUnlock('accountModification', ourLockID)
                }
                if (accountData != null) {
                    for (const wrappedAccount of accountData) {
                        const wrappedAccountInQueueRef = wrappedAccount as ShardusTypes.WrappedDataFromQueue
                        wrappedAccountInQueueRef.seenInQueue = false

                        if (this.lastSeenAccountsMap != null) {
                            const queueEntry = this.lastSeenAccountsMap[wrappedAccountInQueueRef.accountId]
                            if (queueEntry != null) {
                                wrappedAccountInQueueRef.seenInQueue = true
                            }
                        }
                    }
                }

                const resp: GetAccountDataWithQueueHintsRespSerializable = {
                    accountData: accountData as ShardusTypes.WrappedDataFromQueue[] | null,
                    // this can still be null
                }
                respond(resp, serializeGetAccountDataWithQueueHintsResp)
            } catch (e) {
                if (logFlags.error || logFlags.getLocalOrRemote)
                    this.mainLogger.error(`${route} error: ${utils.errorToStringFull(e)}`)
                nestedCountersInstance.countEvent('internal', `${route}-exception`)
                nestedCountersInstance.countEvent('getLocalOrRemoteAccount', `handler: ${e.message} `)
                return respond(InternalError(`${route} exception executing request`), serializeResponseError)
            } finally {
                profilerInstance.scopedProfileSectionEnd(route, payload.length)
            }
        },
    }

    this.p2p.registerInternalBinary(
        binaryGetAccDataWithQueueHintsHandler.name,
        binaryGetAccDataWithQueueHintsHandler.handler
    )

    const binaryGetAccountQueueCountHandler: P2PTypes.P2PTypes.Route<InternalBinaryHandler<Buffer>> = {
        name: InternalRouteEnum.binary_get_account_queue_count,
        handler: async (payload, respond, header, sign) => {
            const route = InternalRouteEnum.binary_get_account_queue_count
            profilerInstance.scopedProfileSectionStart(route, false, payload.length)
            nestedCountersInstance.countEvent('internal', route)
            try {
                const requestStream = VectorBufferStream.fromBuffer(payload)
                const requestType = requestStream.readUInt16()
                if (requestType !== TypeIdentifierEnum.cGetAccountQueueCountReq) {
                    // implement error handling
                    respond(false, serializeGetAccountQueueCountResp)
                    return
                }
                const req = deserializeGetAccountQueueCountReq(requestStream)
                // Limit the number of accounts to prevent abuse
                const MAX_ACCOUNTS = this.config.stateManager.accountBucketSize // default 200
                if (req.accountIds.length > MAX_ACCOUNTS) {
                    nestedCountersInstance.countEvent('internal', `${route}-too_many_accounts`)
                    return respond(BadRequest(`${route} too many accounts requested`), serializeResponseError)
                }
                const result: GetAccountQueueCountResp = {
                    counts: [],
                    committingAppData: [],
                    accounts: [],
                }
                if (utils.isValidShardusAddress(req.accountIds) === false) {
                    nestedCountersInstance.countEvent('internal', `${route}-invalid_account_ids`)
                    respond(false, serializeGetAccountQueueCountResp)
                    return
                }
                for (const address of req.accountIds) {
                    const { count, committingAppData } = this.transactionQueue.getAccountQueueCount(address, true)
                    result.counts.push(count)
                    result.committingAppData.push(committingAppData)
                    if (this.config.stateManager.enableAccountFetchForQueueCounts) {
                        const currentAccountData = await this.getLocalOrRemoteAccount(address)
                        if (currentAccountData && currentAccountData.data) {
                            result.accounts.push(currentAccountData.data)
                        }
                    }
                }
                respond(result, serializeGetAccountQueueCountResp)
            } catch (e) {
                if (logFlags.error) this.mainLogger.error(`${route} error: ${e}`)
                nestedCountersInstance.countEvent('internal', `${route}-exception`)
                respond(false, serializeGetAccountQueueCountResp)
            } finally {
                profilerInstance.scopedProfileSectionEnd(route, payload.length)
            }
        },
    }

    this.p2p.registerInternalBinary(binaryGetAccountQueueCountHandler.name, binaryGetAccountQueueCountHandler.handler)

    Context.network.registerExternalGet('debug_stats', isDebugModeMiddleware, (_req, res) => {
        const cycle = this.currentCycleShardData.cycleNumber - 1

        let cycleShardValues = null
        if (this.shardValuesByCycle.has(cycle)) {
            cycleShardValues = this.shardValuesByCycle.get(cycle)
        }

        const blob = this.partitionStats.dumpLogsForCycle(cycle, false, cycleShardValues)
        res.json({ cycle, blob })
    })

    Context.network.registerExternalGet('debug_stats2', isDebugModeMiddleware, (_req, res) => {
        const cycle = this.currentCycleShardData.cycleNumber - 1

        let blob = {}
        let cycleShardValues = null
        if (this.shardValuesByCycle.has(cycle)) {
            cycleShardValues = this.shardValuesByCycle.get(cycle)
            blob = this.partitionStats.buildStatsReport(cycleShardValues)
        }
        res.json({ cycle, blob })
    })

    Context.network.registerExternalGet('clear_tx_debug', isDebugModeMiddlewareLow, (_req, res) => {
        this.transactionQueue.clearTxDebugStatList()
        res.json({ success: true })
    })

    Context.network.registerExternalGet('print_tx_debug', isDebugModeMiddlewareLow, (_req, res) => {
        const result = this.transactionQueue.printTxDebug()
        res.write(result)
        res.end()
    })

    Context.network.registerExternalGet('print_tx_debug_by_txid', isDebugModeMiddlewareLow, (_req, res) => {
        const txId = _req.query.txId
        if (txId == null) {
            res.write('txId parameter required')
            res.end()
            return
        }
        if (typeof txId !== 'string') {
            res.write('txId parameter must be a string')
            res.end()
            return
        }
        const result = this.transactionQueue.printTxDebugByTxId(txId)
        res.write(result)
        res.end()
    })

    Context.network.registerExternalGet('last_process_stats', isDebugModeMiddlewareLow, (_req, res) => {
        const result = JSON.stringify(this.transactionQueue.lastProcessStats, null, 2)
        res.write(result)
        res.end()
    })

    //a debug nodelist so tools can map nodes to the shortIDs that we use
    Context.network.registerExternalGet('nodelist_debug', isDebugModeMiddleware, (_req, res) => {
        const debugNodeList = []
        for (const node of activeByIdOrder) {
            const nodeEntry = {
                id: utils.makeShortHash(node.id),
                ip: node.externalIp,
                port: node.externalPort,
            }
            debugNodeList.push(nodeEntry)
        }
        res.json(debugNodeList)
    })

    Context.network.registerExternalGet('debug-consensus-log', isDebugModeMiddleware, (req, res) => {
        this.consensusLog = !this.consensusLog
        res.write(`consensusLog: ${this.consensusLog}`)
        res.end()
    })

    Context.network.registerExternalGet('debug-noncequeue-count', isDebugModeMiddleware, (req, res) => {
        let result = this.transactionQueue.getPendingCountInNonceQueue()
        res.json(result)
        res.end()
    })

    Context.network.registerExternalGet('debug-queue-item-by-txid', isDebugModeMiddlewareLow, (_req, res) => {
        const txId = _req.query.txId
        if (txId == null || typeof txId !== 'string' || txId.length !== 64) {
            res.write('invalid txId provided')
            res.end()
            return
        }
        const result = this.transactionQueue.getQueueItemById(txId)
        res.write(Utils.safeStringify(result))
        res.end()
    })

    Context.network.registerExternalGet('debug-queue-items', isDebugModeMiddleware, (req, res) => {
        let result = this.transactionQueue.getQueueItems()
        res.write(Utils.safeStringify(result))
        res.end()
    })

    Context.network.registerExternalGet('debug-queue-clear', isDebugModeMiddleware, (req, res) => {
        let minAge = req.query.minAge ? parseInt(req.query.minAge as string) : -1
        if (isNaN(minAge)) minAge = -1
        let result = this.transactionQueue.clearQueueItems(minAge)
        res.write(Utils.safeStringify(result))
        res.end()
    })

    Context.network.registerExternalGet('debug-stuck-tx', isDebugModeMiddleware, (_req, res) => {
        const opts = {
            minAge: _req.query?.minAge || 0,
            state: _req.query?.state,
            nextStates: _req.query?.nextStates === 'false' ? false : true,
        }
        res.json(this.transactionQueue.getDebugStuckTxs(opts))
    })

    Context.network.registerExternalGet('debug-stuck-processing', isDebugModeMiddleware, (_req, res) => {
        res.json(this.transactionQueue.getDebugProccessingStatus())
    })

    Context.network.registerExternalGet('debug-fix-stuck-processing', isDebugModeMiddleware, (req, res) => {
        let response = 'not stuck'

        //initialize the variable clear with the value of the query parameter clear, the default is false
        const clear = req.query.clear === 'true' || false

        const isStuck = this.transactionQueue.isStuckProcessing
        if (isStuck) {
            response = Utils.safeStringify(this.transactionQueue.getDebugProccessingStatus())
            this.transactionQueue.fixStuckProcessing(clear)
        }
        res.write(response)
        res.end()
    })

    Context.network.registerExternalGet('debug-fifoLocks', isDebugModeMiddleware, (req, res) => {
        const getAll = req.query.all === 'true' || false
        let toPrint = this.fifoLocks
        if (getAll === false) {
            toPrint = this.getLockedFifoAccounts()
        }
        const response = JSON.stringify(toPrint, null, 2)
        res.write(response)
        res.end()
    })
    Context.network.registerExternalGet('debug-fifoLocks-unlock', isDebugModeMiddleware, (_req, res) => {
        const unlockCount = this.forceUnlockAllFifoLocks('debug-fifoLocks-unlock')

        const response = JSON.stringify({ unlockCount }, null, 2)
        res.write(response)
        res.end()
    })
},

  _unregisterEndpoints() {
    // this.p2p.unregisterInternal('get_account_data3')
    // this.p2p.unregisterInternal('get_account_data_by_list')

    // new shard endpoints:
    // this.p2p.unregisterInternal('request_state_for_tx')
    // this.p2p.unregisterInternal('request_state_for_tx_post')
    // this.p2p.unregisterInternal('request_tx_and_state')

    // this.p2p.unregisterInternal('request_receipt_for_tx')
    // this.p2p.unregisterInternal('broadcast_state')
    this.p2p.unregisterGossipHandler('spread_tx_to_group')
    // this.p2p.unregisterInternal('get_account_data_with_queue_hints')
    // this.p2p.unregisterInternal('get_globalaccountreport')
    // this.p2p.unregisterInternal('spread_appliedVote')
    this.p2p.unregisterGossipHandler('spread_appliedReceipt')

    // this.p2p.unregisterInternal('get_trie_hashes')
    // this.p2p.unregisterInternal('sync_trie_hashes')
    // this.p2p.unregisterInternal('get_trie_accountHashes')
    // this.p2p.unregisterInternal('get_account_data_by_hashes')

    for (const binary_endpoint of Object.values(InternalRouteEnum)) {
        this.p2p.unregisterInternal(binary_endpoint)
    }
},

  _registerListener(emitter: EventEmitter, event: string, callback: Callback) {
    // eslint-disable-next-line security/detect-object-injection
    if (this._listeners[event]) {
        this.statemanager_fatal(`_registerListener_dupes`, 'State Manager can only register one listener per event!')
        return
    }
    emitter.on(event, callback)
    // eslint-disable-next-line security/detect-object-injection
    this._listeners[event] = [emitter, callback]
},

  _unregisterListener(event: string) {
    /* eslint-disable security/detect-object-injection */
    if (!this._listeners[event]) {
        this.mainLogger.warn(`This event listener doesn't exist! Event: \`${event}\` in StateManager`)
        return
    }
    const entry = this._listeners[event]
    const [emitter, callback] = entry
    emitter.removeListener(event, callback)
    delete this._listeners[event]
    /* eslint-enable security/detect-object-injection */
},

  _cleanupListeners() {
    for (const event of Object.keys(this._listeners)) {
        this._unregisterListener(event)
    }
  }
}