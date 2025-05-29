import * as Self from '../p2p/Self'
import * as Context from '../p2p/Context'
import * as NodeList from '../p2p/NodeList'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { profilerInstance } from '../utils/profiler'
import { isDebugModeMiddleware, isDebugModeMiddlewareLow, isDebugModeMiddlewareMedium } from '../network/debugMiddleware'
import { logFlags } from '../logger'
import * as utils from '../utils'
import { Utils } from '@shardeum-foundation/lib-types'
import { shardusGetTime } from '../network'
import {
  AccountHashCache,
  AccountHashCacheHistory,
  AccountIDAndHash,
  AccountIdAndHashToRepair,
  HashTrieAccountDataRequest,
  HashTrieAccountDataResponse,
  HashTrieAccountsResp,
  HashTrieNode,
  HashTrieRadixCoverage,
  HashTrieReq,
  HashTrieResp,
  HashTrieSyncConsensus,
  HashTrieSyncTell,
  HashTrieUpdateStats,
  RadixAndHashWithNodeId,
  RadixAndChildHashesWithNodeId,
  RadixAndHash,
  TrieAccount,
} from './state-manager-types'
import { InternalBinaryHandler } from '../types/Handler'
import { Route } from '@shardeum-foundation/lib-types/build/src/p2p/P2PTypes'
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum'
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum'
import { Request, Response } from 'express-serve-static-core'
import { P2P } from '@shardeum-foundation/lib-types'
import { appdata_replacer } from '../utils'
import { WrappedData } from '../types/WrappedData'
import {
  deserializeGetAccountDataByHashesResp,
  GetAccountDataByHashesResp,
  serializeGetAccountDataByHashesResp,
} from '../types/GetAccountDataByHashesResp'
import {
  deserializeGetAccountDataByHashesReq,
  GetAccountDataByHashesReq,
  serializeGetAccountDataByHashesReq,
} from '../types/GetAccountDataByHashesReq'
import {
  GetTrieHashesResponse,
  serializeGetTrieHashesResp,
  deserializeGetTrieHashesResp,
} from '../types/GetTrieHashesResp'
import { GetTrieHashesRequest, deserializeGetTrieHashesReq, serializeGetTrieHashesReq } from '../types/GetTrieHashesReq'
import {
  GetTrieAccountHashesReq,
  deserializeGetTrieAccountHashesReq,
  serializeGetTrieAccountHashesReq,
} from '../types/GetTrieAccountHashesReq'
import {
  GetTrieAccountHashesResp,
  deserializeGetTrieAccountHashesResp,
  serializeGetTrieAccountHashesResp,
} from '../types/GetTrieAccountHashesResp'
import { BadRequest, InternalError, serializeResponseError } from '../types/ResponseError'
import {
  RepairOOSAccountsReq,
  deserializeRepairOOSAccountsReq,
  serializeRepairOOSAccountsReq,
} from '../types/RepairOOSAccountsReq'
import { getStreamWithTypeCheck, requestErrorHandler } from '../types/Helpers'
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum'
import { robustQuery } from '../p2p/Utils'
import { RequestReceiptForTxReqSerialized, serializeRequestReceiptForTxReq } from '../types/RequestReceiptForTxReq'
import { deserializeRequestReceiptForTxResp, RequestReceiptForTxRespSerialized } from '../types/RequestReceiptForTxResp'
import {
  SyncTrieHashesRequest,
  deserializeSyncTrieHashesReq,
  serializeSyncTrieHashesReq,
} from '../types/SyncTrieHashesReq'
import { errorToStringFull } from '../utils'
import { Node } from '../shardus/shardus-types'

export const handlerMethods = {
  setupHandlers(): void {
    // this.p2p.registerInternal(
    //   'get_trie_hashes',
    //   async (
    //     payload: HashTrieReq,
    //     respond: (arg0: HashTrieResp) => Promise<number>,
    //     _sender: unknown,
    //     _tracker: string,
    //     msgSize: number
    //   ) => {
    //     profilerInstance.scopedProfileSectionStart('get_trie_hashes', false, msgSize)
    //     const result = { nodeHashes: [], nodeId: Self.id } as HashTrieResp
    //     let responseCount = 0
    //     let respondSize

    //     if (Self.isFailed) {
    //       respondSize = await respond(result)
    //     } else {
    //       for (const radix of payload.radixList) {
    //         const level = radix.length
    //         const layerMap = this.shardTrie.layerMaps[level] // eslint-disable-line security/detect-object-injection
    //         if (layerMap == null) {
    //           /* prettier-ignore */ nestedCountersInstance.countEvent('accountPatcher', `get_trie_hashes badrange:${level}`)
    //           break
    //         }

    //         const hashTrieNode = layerMap.get(radix)
    //         if (hashTrieNode != null) {
    //           for (const childTreeNode of hashTrieNode.children) {
    //             if (childTreeNode != null) {
    //               result.nodeHashes.push({ radix: childTreeNode.radix, hash: childTreeNode.hash })
    //               responseCount++
    //             }
    //           }
    //         }
    //       }

    //       /* prettier-ignore */ nestedCountersInstance.countEvent('accountPatcher', `get_trie_hashes c:${this.stateManager.currentCycleShardData.cycleNumber}`, responseCount)

    //       // todo could recored a split time here.. so we know time spend on handling the request vs sending the response?
    //       // that would not be completely accurate because the time to get the data is outide of this handler...
    //       respondSize = await respond(result)
    //     }
    //     profilerInstance.scopedProfileSectionEnd('get_trie_hashes', respondSize)
    //   }
    // )

    // this.p2p.registerInternal(
    //   'repair_oos_accounts',
    //   async (
    //     payload: {repairInstructions: AccountRepairInstruction[]},
    //     respond: (arg0: boolean) => Promise<boolean>,
    //     _sender: unknown,
    //     _tracker: string,
    //     msgSize: number
    //   ) => {
    //     profilerInstance.scopedProfileSectionStart('repair_oos_accounts', false, msgSize)

    //     try {
    //       for (const repairInstruction of payload?.repairInstructions) {
    //         const { accountID, txId, hash, accountData, targetNodeId, receipt2 } = repairInstruction

    //         // check if we are the target node
    //         if (targetNodeId !== Self.id) {
    //           nestedCountersInstance.countEvent('accountPatcher', `repair_oos_accounts: not target node for txId: ${txId}`)
    //           continue
    //         }

    //         // check if we cover this accountId
    //         const storageNodes = this.stateManager.transactionQueue.getStorageGroupForAccount(accountID)
    //         const isInStorageGroup = storageNodes.map((node) => node.id).includes(Self.id)
    //         if (!isInStorageGroup) {
    //           nestedCountersInstance.countEvent('accountPatcher', `repair_oos_accounts: not in storage group for account: ${accountID}`)
    //           continue
    //         }
    //         // check if we have already repaired this account
    //         const accountHashCache = this.stateManager.accountCache.getAccountHash(accountID)
    //         if (accountHashCache != null && accountHashCache.h === hash) {
    //           nestedCountersInstance.countEvent('accountPatcher', `repair_oos_accounts: already repaired account: ${accountID}`)
    //           continue
    //         }
    //         if (accountHashCache != null && accountHashCache.t > accountData.timestamp) {
    //           nestedCountersInstance.countEvent('accountPatcher', `repair_oos_accounts: we have newer account: ${accountID}`)
    //           continue
    //         }

    //         const archivedQueueEntry = this.stateManager.transactionQueue.getQueueEntryArchived(txId, 'repair_oos_accounts')

    //         if (archivedQueueEntry == null) {
    //           nestedCountersInstance.countEvent('accountPatcher', `repair_oos_accounts: no archivedQueueEntry for txId: ${txId}`)
    //           this.mainLogger.debug(`repair_oos_accounts: no archivedQueueEntry for txId: ${txId}`)
    //           continue
    //         }

    //         // check the vote and confirmation status of the tx
    //         const bestMessage = receipt2.confirmOrChallenge
    //         const receivedBestVote = receipt2.appliedVote

    //         if (receivedBestVote != null) {
    //           // Check if vote is from eligible list of voters for this TX
    //           if(this.stateManager.transactionQueue.useNewPOQ && !archivedQueueEntry.eligibleNodeIdsToVote.has(receivedBestVote.node_id)) {
    //             nestedCountersInstance.countEvent('accountPatcher', `repair_oos_accounts: vote from ineligible node for txId: ${txId}`)
    //             continue
    //           }

    //           // Check signature of the vote
    //           if (!this.crypto.verify(
    //             receivedBestVote as SignedObject,
    //             archivedQueueEntry.executionGroupMap.get(receivedBestVote.node_id).publicKey
    //           )) {
    //             nestedCountersInstance.countEvent('accountPatcher', `repair_oos_accounts: vote signature invalid for txId: ${txId}`)
    //             continue
    //           }

    //           // Check transaction result from vote
    //           if (!receivedBestVote.transaction_result) {
    //             nestedCountersInstance.countEvent('accountPatcher', `repair_oos_accounts: vote result not true for txId ${txId}`)
    //             continue
    //           }

    //           // Check account hash. Calculate account hash of account given in instruction
    //           // and compare it with the account hash in the vote.
    //           const calculatedAccountHash = this.app.calculateAccountHash(accountData.data)
    //           let accountHashMatch = false
    //           for (let i = 0; i < receivedBestVote.account_id.length; i++) {
    //             if (receivedBestVote.account_id[i] === accountID) {
    //               if (receivedBestVote.account_state_hash_after[i] !== calculatedAccountHash) {
    //                 nestedCountersInstance.countEvent('accountPatcher', `repair_oos_accounts: account hash mismatch for txId: ${txId}`)
    //                 accountHashMatch = false
    //               } else {
    //                 accountHashMatch = true
    //               }
    //               break
    //             }
    //           }
    //           if (accountHashMatch === false) {
    //             nestedCountersInstance.countEvent('accountPatcher', `repair_oos_accounts: vote account hash mismatch for txId: ${txId}`)
    //             continue
    //           }
    //         } else {
    //           // Skip this account apply as we were not able to get the best vote for this tx
    //           nestedCountersInstance.countEvent('accountPatcher', `repair_oos_accounts: no vote for txId: ${txId}`)
    //           continue
    //         }

    //         if (this.stateManager.transactionQueue.useNewPOQ) {
    //           if (bestMessage != null) {
    //             // Skip if challenge receipt
    //             if (bestMessage.message === 'challenge') {
    //               nestedCountersInstance.countEvent('accountPatcher', `repair_oos_accounts: challenge for txId: ${txId}`)
    //               continue
    //             }

    //             // Check if mesasge is from eligible list of responders for this TX
    //             if(!archivedQueueEntry.eligibleNodeIdsToConfirm.has(bestMessage.nodeId)) {
    //               nestedCountersInstance.countEvent('accountPatcher', `repair_oos_accounts: confirmation from ineligible node for txId: ${txId}`)
    //               continue
    //             }

    //             // Check signature of the message
    //             if(!this.crypto.verify(
    //               bestMessage as SignedObject,
    //               archivedQueueEntry.executionGroupMap.get(bestMessage.nodeId).publicKey
    //             )) {
    //               nestedCountersInstance.countEvent('accountPatcher', `repair_oos_accounts: confirmation signature invalid for txId: ${txId}`)
    //               continue
    //             }
    //           } else {
    //             // Skip this account apply as we were not able to get the best confirmation for this tx
    //             nestedCountersInstance.countEvent('accountPatcher', `repair_oos_accounts: no confirmation for txId: ${txId}`)
    //             continue
    //           }
    //         }

    //         // update the account data (and cache?)
    //         const updatedAccounts: string[] = []
    //         //save the account data.  note this will make sure account hashes match the wrappers and return failed
    //         // hashes  that don't match
    //         const failedHashes = await this.stateManager.checkAndSetAccountData(
    //           [accountData],
    //           `repair_oos_accounts:${txId}`,
    //           true,
    //           updatedAccounts
    //         )
    //         if (logFlags.debug) this.mainLogger.debug(`repair_oos_accounts: ${updatedAccounts.length} updated, ${failedHashes.length} failed`)
    //         nestedCountersInstance.countEvent('accountPatcher', `repair_oos_accounts:${updatedAccounts.length} updated, accountId: ${utils.makeShortHash(accountID)}, cycle: ${this.stateManager.currentCycleShardData.cycleNumber}`)
    //         if (failedHashes.length > 0) nestedCountersInstance.countEvent('accountPatcher', `repair_oos_accounts:${failedHashes.length} failed`)
    //         let success = false
    //         if (updatedAccounts.length > 0 && failedHashes.length === 0) {
    //           success = true
    //         }
    //       }
    //       await respond(true)
    //     } catch (e) {
    //     }

    //     profilerInstance.scopedProfileSectionEnd('repair_oos_accounts')
    //   }
    // )

    const repairMissingAccountsBinary: Route<InternalBinaryHandler<Buffer>> = {
      name: InternalRouteEnum.binary_repair_oos_accounts,
      handler: async (payloadBuffer, respond, header, sign) => {
        const route = InternalRouteEnum.binary_repair_oos_accounts
        nestedCountersInstance.countEvent('internal', route)
        this.profiler.scopedProfileSectionStart(route, false, payloadBuffer.length)
        try {
          const requestStream = getStreamWithTypeCheck(payloadBuffer, TypeIdentifierEnum.cRepairOOSAccountsReq)
          if (!requestStream) {
            return
          }
          // (Optional) Check verification data in the header
          const payload = deserializeRepairOOSAccountsReq(requestStream)
          if (!payload?.repairInstructions) {
            return
          }

          let [latestCycle] = Context.p2p.getLatestCycles(1)
          if (!latestCycle) {
            this.mainLogger.error('repair_oos_accounts: no latest cycle')
            return
          }

          if (this.repairRequestsMadeThisCycle.cycle !== latestCycle.counter) {
            this.repairRequestsMadeThisCycle.cycle = latestCycle.counter
            this.repairRequestsMadeThisCycle.numRequests = 0
          }

          // verifyPayload(AJVSchemaEnum.RepairOOSAccountsReq', payload)
          for (const repairInstruction of payload.repairInstructions) {
            const { accountID, txId, hash, accountData, targetNodeId, signedReceipt } = repairInstruction

            // check if we are the target node
            if (targetNodeId !== Self.id) {
              nestedCountersInstance.countEvent(
                'accountPatcher',
                `binary/repair_oos_accounts: not target node for txId: ${txId}`
              )
              continue
            }

            // check if we cover this accountId
            const storageNodes = this.stateManager.transactionQueue.getStorageGroupForAccount(accountID)
            const isInStorageGroup = storageNodes.map((node) => node.id).includes(Self.id)
            if (!isInStorageGroup) {
              nestedCountersInstance.countEvent(
                'accountPatcher',
                `binary/repair_oos_accounts: not in storage group for account: ${accountID}`
              )
              continue
            }
            // check if we have already repaired this account
            const accountHashCache = this.stateManager.accountCache.getAccountHash(accountID)
            if (accountHashCache != null && accountHashCache.h === hash) {
              nestedCountersInstance.countEvent(
                'accountPatcher',
                `binary/repair_oos_accounts: already repaired account: ${accountID}`
              )
              continue
            }
            if (accountHashCache != null && accountHashCache.t > accountData.timestamp) {
              nestedCountersInstance.countEvent(
                'accountPatcher',
                `binary/repair_oos_accounts: we have newer account: ${accountID}`
              )
              continue
            }

            const archivedQueueEntry = this.stateManager.transactionQueue.getQueueEntryArchived(
              txId,
              'repair_oos_accounts'
            )

            if (archivedQueueEntry == null) {
              nestedCountersInstance.countEvent(
                'accountPatcher',
                `binary/repair_oos_accounts: no archivedQueueEntry for txId: ${txId}`
              )
              this.mainLogger.debug(`repair_oos_accounts: no archivedQueueEntry for txId: ${txId}`)
              continue
            }

            const proposal = signedReceipt.proposal
            if (signedReceipt.proposalHash !== this.stateManager.transactionConsensus.calculateVoteHash(proposal)) {
              nestedCountersInstance.countEvent(
                'accountPatcher',
                `binary/repair_oos_accounts: proposal hash mismatch for txId: ${txId}`
              )
              continue
            }

            const queryFn = async (node: Node) => {
              const message = { txid: txId, timestamp: accountData.timestamp }
              return await (this.p2p as any).askBinary(
                node,
                InternalRouteEnum.binary_request_receipt_for_tx,
                message,
                serializeRequestReceiptForTxReq,
                deserializeRequestReceiptForTxResp,
                {}
              )
            }

            if (
              this.repairRequestsMadeThisCycle.numRequests + 1 >
              this.config.stateManager.patcherRepairByReceiptPerUpdate
            ) {
              nestedCountersInstance.countEvent(
                'accountPatcher',
                `binary/repair_oos_accounts: too many repair requests this cycle`
              )
              this.mainLogger.warn(
                `binary/repair_oos_accounts: too many repair requests this cycle (${latestCycle.counter})`
              )
              return
            }

            // make sure tx hasn't been altered by robust querying for the proposal using request txid and timestamp
            const txReceipt = await robustQuery(storageNodes, queryFn)
            if (txReceipt.isRobustResult === false) {
              nestedCountersInstance.countEvent(
                'accountPatcher',
                `binary/repair_oos_accounts: robust query failed for txId: ${txId}`
              )
              continue
            }
            this.repairRequestsMadeThisCycle.numRequests++

            if (
              txReceipt.topResult.success !== true ||
              txReceipt.topResult.receipt == null ||
              txReceipt.topResult.receipt.proposalHash == null
            ) {
              nestedCountersInstance.countEvent(
                'accountPatcher',
                `binary/repair_oos_accounts: robust query couldn't find queueEntry for txId: ${txId}`
              )
              continue
            }

            if (signedReceipt.proposalHash !== txReceipt.topResult.receipt.proposalHash) {
              nestedCountersInstance.countEvent(
                'accountPatcher',
                `binary/repair_oos_accounts: proposal hash mismatch for txId: ${txId}`
              )
              continue
            }

            // if (receivedBestVote != null) {
            // Check if vote is from eligible list of voters for this TX
            // if (
            //   this.stateManager.transactionQueue.useNewPOQ &&
            //   !archivedQueueEntry.eligibleNodeIdsToVote.has(receivedBestVote.node_id)
            // ) {
            //   nestedCountersInstance.countEvent(
            //     'accountPatcher',
            //     `binary/repair_oos_accounts: vote from ineligible node for txId: ${txId}`
            //   )
            //   continue
            // }

            // Check signature of the vote
            // if (
            //   !this.crypto.verify(
            //     receivedBestVote as SignedObject,
            //     archivedQueueEntry.executionGroupMap.get(receivedBestVote.node_id).publicKey
            //   )
            // ) {
            //   nestedCountersInstance.countEvent(
            //     'accountPatcher',
            //     `binary/repair_oos_accounts: vote signature invalid for txId: ${txId}`
            //   )
            //   continue
            // }

            // Verify signed receipt
            const executionGroupNodes = new Set(archivedQueueEntry.executionGroup.map((node) => node.publicKey))
            const receiptVerification = this.stateManager.transactionConsensus.verifyAppliedReceipt(
              signedReceipt,
              executionGroupNodes
            )
            if (receiptVerification !== true) {
              nestedCountersInstance.countEvent(
                'accountPatcher',
                `repair_oos_accounts: receipt verification failed for txId: ${txId}`
              )
              continue
            }

            // Check transaction result from vote
            if (!proposal.applied) {
              nestedCountersInstance.countEvent(
                'accountPatcher',
                `binary/repair_oos_accounts: proposal result not true for txId ${txId}`
              )
              continue
            }

            // Check account hash. Calculate account hash of account given in instruction
            // and compare it with the account hash in the vote.
            const calculatedAccountHash = this.app.calculateAccountHash(accountData.data)
            let accountHashMatch = false
            for (let i = 0; i < proposal.accountIDs.length; i++) {
              if (proposal.accountIDs[i] === accountID) {
                if (proposal.afterStateHashes[i] !== calculatedAccountHash) {
                  nestedCountersInstance.countEvent(
                    'accountPatcher',
                    `binary/repair_oos_accounts: account hash mismatch for txId: ${txId}`
                  )
                  accountHashMatch = false
                } else {
                  accountHashMatch = true
                }
                break
              }
            }
            if (accountHashMatch === false) {
              nestedCountersInstance.countEvent(
                'accountPatcher',
                `binary/repair_oos_accounts: vote account hash mismatch for txId: ${txId}`
              )
              continue
            }
            // } else {
            //   // Skip this account apply as we were not able to get the best vote for this tx
            //   nestedCountersInstance.countEvent(
            //     'accountPatcher',
            //     `binary/repair_oos_accounts: no vote for txId: ${txId}`
            //   )
            //   continue
            // }

            // if (this.stateManager.transactionQueue.useNewPOQ) {
            //   if (bestMessage != null) {
            //     // Skip if challenge receipt
            //     if (bestMessage.message === 'challenge') {
            //       nestedCountersInstance.countEvent(
            //         'accountPatcher',
            //         `binary/repair_oos_accounts: challenge for txId: ${txId}`
            //       )
            //       continue
            //     }

            //     // Check if mesasge is from eligible list of responders for this TX
            //     if (!archivedQueueEntry.eligibleNodeIdsToConfirm.has(bestMessage.nodeId)) {
            //       nestedCountersInstance.countEvent(
            //         'accountPatcher',
            //         `binary/repair_oos_accounts: confirmation from ineligible node for txId: ${txId}`
            //       )
            //       continue
            //     }

            //     // Check signature of the message
            //     if (
            //       !this.crypto.verify(
            //         bestMessage as SignedObject,
            //         archivedQueueEntry.executionGroupMap.get(bestMessage.nodeId).publicKey
            //       )
            //     ) {
            //       nestedCountersInstance.countEvent(
            //         'accountPatcher',
            //         `binary/repair_oos_accounts: confirmation signature invalid for txId: ${txId}`
            //       )
            //       continue
            //     }
            //   } else {
            //     // Skip this account apply as we were not able to get the best confirmation for this tx
            //     nestedCountersInstance.countEvent(
            //       'accountPatcher',
            //       `binary/repair_oos_accounts: no confirmation for txId: ${txId}`
            //     )
            //     continue
            //   }
            // }

            // update the account data (and cache?)
            const updatedAccounts: string[] = []
            //save the account data.  note this will make sure account hashes match the wrappers and return failed
            // hashes  that don't match
            const failedHashes = await this.stateManager.checkAndSetAccountData(
              [accountData],
              `binary/repair_oos_accounts:${txId}`,
              true,
              updatedAccounts
            )
            if (logFlags.debug)
              this.mainLogger.debug(
                `binary/repair_oos_accounts: ${updatedAccounts.length} updated, ${failedHashes.length} failed`
              )
            nestedCountersInstance.countEvent(
              'accountPatcher',
              `binary/repair_oos_accounts:${updatedAccounts.length} updated, accountId: ${utils.makeShortHash(
                accountID
              )}, cycle: ${this.stateManager.currentCycleShardData.cycleNumber}`
            )
            if (failedHashes.length > 0)
              nestedCountersInstance.countEvent(
                'accountPatcher',
                `binary/repair_oos_accounts:${failedHashes.length} failed`
              )
            let success = false
            if (updatedAccounts.length > 0 && failedHashes.length === 0) {
              success = true
            }
          }
        } catch (e) {
          // Error handling
          console.error(`Error in repairMissingAccountsBinary handler: ${e.message}`)
        } finally {
          this.profiler.scopedProfileSectionEnd(route)
        }
      },
    }

    const getTrieHashesBinary: Route<InternalBinaryHandler<Buffer>> = {
      name: InternalRouteEnum.binary_get_trie_hashes,
      handler: async (payloadBuffer, respond, header, sign) => {
        const route = InternalRouteEnum.binary_get_trie_hashes
        nestedCountersInstance.countEvent('internal', route)
        this.profiler.scopedProfileSectionStart(route, false, payloadBuffer.length)
        const result = { nodeHashes: [], nodeId: Self.id } as GetTrieHashesResponse
        try {
          const requestStream = getStreamWithTypeCheck(payloadBuffer, TypeIdentifierEnum.cGetTrieHashesReq)
          if (!requestStream) {
            respond(result, serializeGetTrieHashesResp)
            return
          }
          const readableReq = deserializeGetTrieHashesReq(requestStream)
          let responseCount = 0
          if (!Self.isFailed) {
            for (const radix of readableReq.radixList) {
              const level = radix.length
              const layerMap = this.shardTrie.layerMaps[level]
              if (layerMap == null) {
                /* prettier-ignore */ if (this.config.debug.verboseNestedCounters) nestedCountersInstance.countEvent('accountPatcher', `get_trie_hashes badrange:${level}`)
                break
              }
              const hashTrieNode = layerMap.get(radix)
              if (hashTrieNode != null) {
                for (const childTreeNode of hashTrieNode.children) {
                  if (childTreeNode != null) {
                    result.nodeHashes.push({ radix: childTreeNode.radix, hash: childTreeNode.hash })
                    responseCount++
                  }
                }
              }
            }
            if (responseCount > 0) {
              /* prettier-ignore */ nestedCountersInstance.countEvent('accountPatcher', `get_trie_hashes c:${this.stateManager.currentCycleShardData.cycleNumber}`, responseCount)
            }
          }
          respond(result, serializeGetTrieHashesResp)
        } catch (e) {
          // Error handling
          console.error(`Error in getTrieHashesBinary handler: ${e.message}`)
          respond({ nodeHashes: null }, serializeGetTrieHashesResp)
        } finally {
          this.profiler.scopedProfileSectionEnd(route)
        }
      },
    }

    this.p2p.registerInternalBinary(getTrieHashesBinary.name, getTrieHashesBinary.handler)
    this.p2p.registerInternalBinary(repairMissingAccountsBinary.name, repairMissingAccountsBinary.handler)

    // this.p2p.registerInternal(
    //   'sync_trie_hashes',
    //   async (
    //     payload: HashTrieSyncTell,
    //     _respondWrapped: unknown,
    //     sender: string,
    //     _tracker: string,
    //     msgSize: number
    //   ) => {
    //     profilerInstance.scopedProfileSectionStart('sync_trie_hashes', false, msgSize)
    //     try {
    //       //TODO use our own definition of current cycle.
    //       //use playlod cycle to filter out TXs..
    //       const cycle = payload.cycle

    //       let hashTrieSyncConsensus = this.hashTrieSyncConsensusByCycle.get(payload.cycle)
    //       if (hashTrieSyncConsensus == null) {
    //         hashTrieSyncConsensus = {
    //           cycle: payload.cycle,
    //           radixHashVotes: new Map(),
    //           coverageMap: new Map(),
    //         }
    //         this.hashTrieSyncConsensusByCycle.set(payload.cycle, hashTrieSyncConsensus)

    //         const shardValues = this.stateManager.shardValuesByCycle.get(payload.cycle)
    //         if (shardValues == null) {
    //           /* prettier-ignore */ nestedCountersInstance.countEvent('accountPatcher', `sync_trie_hashes not ready c:${payload.cycle}`)
    //           return
    //         }

    //         //mark syncing radixes..
    //         //todo compare to cycle!! only init if from current cycle.
    //         this.initStoredRadixValues(payload.cycle)
    //       }

    //       const node = NodeList.nodes.get(sender)

    //       for (const nodeHashes of payload.nodeHashes) {
    //         //don't record the vote if we cant use it!
    //         // easier than filtering it out later on in the stream.
    //         if (this.isRadixStored(cycle, nodeHashes.radix) === false) {
    //           continue
    //         }

    //         //todo: secure that the voter is allowed to vote.
    //         let hashVote = hashTrieSyncConsensus.radixHashVotes.get(nodeHashes.radix)
    //         if (hashVote == null) {
    //           hashVote = { allVotes: new Map(), bestHash: nodeHashes.hash, bestVotes: 1 }
    //           hashTrieSyncConsensus.radixHashVotes.set(nodeHashes.radix, hashVote)
    //           hashVote.allVotes.set(nodeHashes.hash, { count: 1, voters: [node] })
    //         } else {
    //           const voteEntry = hashVote.allVotes.get(nodeHashes.hash)
    //           if (voteEntry == null) {
    //             hashVote.allVotes.set(nodeHashes.hash, { count: 1, voters: [node] })
    //           } else {
    //             const voteCount = voteEntry.count + 1
    //             voteEntry.count = voteCount
    //             voteEntry.voters.push(node)
    //             //hashVote.allVotes.set(nodeHashes.hash, votes + 1)
    //             //will ties be a problem? (not if we need a majority!)
    //             if (voteCount > hashVote.bestVotes) {
    //               hashVote.bestVotes = voteCount
    //               hashVote.bestHash = nodeHashes.hash
    //             }
    //           }
    //         }
    //       }
    //     } finally {
    //       profilerInstance.scopedProfileSectionEnd('sync_trie_hashes')
    //     }
    //   }
    // )

    const syncTrieHashesBinaryHandler: Route<InternalBinaryHandler<Buffer>> = {
      name: InternalRouteEnum.binary_sync_trie_hashes,
      handler: async (payload, respond, header, sign) => {
        const route = InternalRouteEnum.binary_sync_trie_hashes
        nestedCountersInstance.countEvent('internal', route)
        this.profiler.scopedProfileSectionStart(route, false, payload.length)

        const errorHandler = (
          errorType: RequestErrorEnum,
          opts?: { customErrorLog?: string; customCounterSuffix?: string }
        ): void => requestErrorHandler(route, errorType, header, opts)

        try {
          const stream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cSyncTrieHashesReq)
          if (!stream) {
            return errorHandler(RequestErrorEnum.InvalidRequest)
          }
          const request = deserializeSyncTrieHashesReq(stream)
          const cycle = request.cycle

          let hashTrieSyncConsensus = this.hashTrieSyncConsensusByCycle.get(cycle)
          if (hashTrieSyncConsensus == null) {
            hashTrieSyncConsensus = {
              cycle,
              radixHashVotes: new Map(),
              coverageMap: new Map(),
            }
            this.hashTrieSyncConsensusByCycle.set(cycle, hashTrieSyncConsensus)

            const shardValues = this.stateManager.shardValuesByCycle.get(cycle)
            if (shardValues == null) {
              nestedCountersInstance.countEvent('accountPatcher', `sync_trie_hashes not ready c:${cycle}`)
              if (logFlags.debug) console.error(`Shard values not ready for cycle: ${cycle}`)
              return
            }

            //mark syncing radixes..
            //todo compare to cycle!! only init if from current cycle.
            this.initStoredRadixValues(cycle)
          }

          const node = NodeList.nodes.get(header.sender_id)

          for (const nodeHashes of request.nodeHashes) {
            if (this.isRadixStored(cycle, nodeHashes.radix) === false) {
              continue
            }

            // check the length of the radix
            if (nodeHashes.radix.length !== this.treeSyncDepth) {
              if (logFlags.error)
                this.mainLogger.error(`syncTrieHashesBinaryHandler: radix length mismatch: ${nodeHashes.radix}`)
              nestedCountersInstance.countEvent('accountPatcher', `${route}-radix-length-mismatch`)
              continue
            }

            // todo: secure that the voter is allowed to vote.
            let hashVote = hashTrieSyncConsensus.radixHashVotes.get(nodeHashes.radix)
            if (hashVote == null) {
              hashVote = { allVotes: new Map(), bestHash: nodeHashes.hash, bestVotes: 1 }
              hashTrieSyncConsensus.radixHashVotes.set(nodeHashes.radix, hashVote)
              hashVote.allVotes.set(nodeHashes.hash, { count: 1, voters: new Set([node]) })
            } else {
              const voteEntry = hashVote.allVotes.get(nodeHashes.hash)
              if (voteEntry == null) {
                hashVote.allVotes.set(nodeHashes.hash, { count: 1, voters: new Set([node]) })
              } else {
                voteEntry.voters.add(node)
                const voteCount = voteEntry.voters.size
                voteEntry.count = voteCount
                if (voteCount > hashVote.bestVotes) {
                  hashVote.bestVotes = voteCount
                  hashVote.bestHash = nodeHashes.hash
                }
              }
            }
          }
        } catch (e) {
          /* prettier-ignore */ if (logFlags.error) console.error(`Error processing syncTrieHashesBinaryHandler: ${e}`)
          nestedCountersInstance.countEvent('internal', `${route}-exception`)
          /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`${route}: Exception executing request: ${errorToStringFull(e)}`)
        } finally {
          profilerInstance.scopedProfileSectionEnd(route)
        }
      },
    }

    this.p2p.registerInternalBinary(syncTrieHashesBinaryHandler.name, syncTrieHashesBinaryHandler.handler)

    // //get child accountHashes for radix.  //get the hashes and ids so we know what to fix.
    // this.p2p.registerInternal(
    //   'get_trie_accountHashes',
    //   async (
    //     payload: HashTrieReq,
    //     respond: (arg0: HashTrieAccountsResp) => Promise<number>,
    //     _sender: string,
    //     _tracker: string,
    //     msgSize: number
    //   ) => {
    //     profilerInstance.scopedProfileSectionStart('get_trie_accountHashes', false, msgSize)
    //     //nodeChildHashes: {radix:string, childAccounts:{accountID:string, hash:string}[]}[]
    //     const result = {
    //       nodeChildHashes: [],
    //       stats: { matched: 0, visisted: 0, empty: 0, childCount: 0 },
    //       nodeId: Self.id
    //     } as HashTrieAccountsResp

    //     const patcherMaxChildHashResponses = this.config.stateManager.patcherMaxChildHashResponses

    //     for (const radix of payload.radixList) {
    //       result.stats.visisted++
    //       const level = radix.length
    //       const layerMap = this.shardTrie.layerMaps[level] // eslint-disable-line security/detect-object-injection
    //       if (layerMap == null) {
    //         /* prettier-ignore */ nestedCountersInstance.countEvent('accountPatcher', `get_trie_accountHashes badrange:${level}`)
    //         break
    //       }

    //       const hashTrieNode = layerMap.get(radix)
    //       if (hashTrieNode != null && hashTrieNode.accounts != null) {
    //         result.stats.matched++
    //         const childAccounts = []
    //         result.nodeChildHashes.push({ radix, childAccounts })
    //         for (const account of hashTrieNode.accounts) {
    //           childAccounts.push({ accountID: account.accountID, hash: account.hash })
    //           result.stats.childCount++
    //         }
    //         if (hashTrieNode.accounts.length === 0) {
    //           result.stats.empty++
    //         }
    //       }

    //       //some protection on how many responses we can send
    //       if (result.stats.childCount > patcherMaxChildHashResponses) {
    //         break
    //       }
    //     }

    //     /* prettier-ignore */ nestedCountersInstance.countEvent('accountPatcher', `get_trie_accountHashes c:${this.stateManager.currentCycleShardData.cycleNumber}`, result.stats.childCount)

    //     const respondSize = await respond(result)
    //     profilerInstance.scopedProfileSectionEnd('get_trie_accountHashes', respondSize)
    //   }
    // )

    const getTrieAccountHashesBinaryHandler: Route<InternalBinaryHandler<Buffer>> = {
      name: InternalRouteEnum.binary_get_trie_account_hashes,
      handler: (payload, respond, header, sign) => {
        const route = InternalRouteEnum.binary_get_trie_account_hashes
        profilerInstance.scopedProfileSectionStart(route, false, payload.length)
        const result = {
          nodeChildHashes: [],
          stats: { matched: 0, visisted: 0, empty: 0, childCount: 0 },
          nodeId: Self.id,
        } as HashTrieAccountsResp
        try {
          const stream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cGetAccountTrieHashesReq)
          if (!stream) {
            requestErrorHandler(route, RequestErrorEnum.InvalidRequest, header)
            return respond(BadRequest('invalid request stream'), serializeResponseError)
          }
          const req = deserializeGetTrieAccountHashesReq(stream)
          const radixList = req.radixList
          const patcherMaxChildHashResponses = this.config.stateManager.patcherMaxChildHashResponses
          for (const radix of radixList) {
            result.stats.visisted++
            const level = radix.length
            const layerMap = this.shardTrie.layerMaps[level] // eslint-disable-line security/detect-object-injection
            if (layerMap == null) {
              /* prettier-ignore */ nestedCountersInstance.countEvent('accountPatcher', `get_trie_accountHashes badrange:${level}`)
              break
            }

            const hashTrieNode = layerMap.get(radix)
            if (hashTrieNode != null && hashTrieNode.accounts != null) {
              result.stats.matched++
              const childAccounts = []
              result.nodeChildHashes.push({ radix, childAccounts })
              for (const account of hashTrieNode.accounts) {
                childAccounts.push({ accountID: account.accountID, hash: account.hash })
                result.stats.childCount++
              }
              if (hashTrieNode.accounts.length === 0) {
                result.stats.empty++
              }
            }

            //some protection on how many responses we can send
            if (result.stats.childCount > patcherMaxChildHashResponses) {
              break
            }
          }

          /* prettier-ignore */ if (this.config.debug.verboseNestedCounters) nestedCountersInstance.countEvent('accountPatcher', `binary_get_trie_accountHashes c:${this.stateManager.currentCycleShardData.cycleNumber}`, result.stats.childCount)
          respond(result, serializeGetTrieAccountHashesResp)
        } catch (e) {
          this.statemanager_fatal(
            'binary_get_trie_accountHashes-failed',
            'binary_get_trie_accountHashes:' + e.name + ': ' + e.message + ' at ' + e.stack
          )
          nestedCountersInstance.countEvent('internal', `${route}-exception`)
          respond(InternalError('exception executing request'), serializeResponseError)
        } finally {
          profilerInstance.scopedProfileSectionEnd(route)
        }
      },
    }

    this.p2p.registerInternalBinary(getTrieAccountHashesBinaryHandler.name, getTrieAccountHashesBinaryHandler.handler)

    // this.p2p.registerInternal(
    //   'get_account_data_by_hashes',
    //   async (
    //     payload: HashTrieAccountDataRequest,
    //     respond: (arg0: HashTrieAccountDataResponse) => Promise<number>,
    //     _sender: string,
    //     _tracker: string,
    //     msgSize: number
    //   ) => {
    //     profilerInstance.scopedProfileSectionStart('get_account_data_by_hashes', false, msgSize)
    //     nestedCountersInstance.countEvent('accountPatcher', `get_account_data_by_hashes`)
    //     const result: HashTrieAccountDataResponse = { accounts: [], stateTableData: [] }
    //     try {
    //       //nodeChildHashes: {radix:string, childAccounts:{accountID:string, hash:string}[]}[]
    //       const queryStats = {
    //         fix1: 0,
    //         fix2: 0,
    //         skip_localHashMismatch: 0,
    //         skip_requestHashMismatch: 0,
    //         returned: 0,
    //         missingResp: false,
    //         noResp: false,
    //       }

    //       const hashMap = new Map()
    //       const accountIDs = []

    //       //should limit on asking side, this is just a precaution
    //       if (payload.accounts.length > 900) {
    //         payload.accounts = payload.accounts.slice(0, 900)
    //       }

    //       for (const accountHashEntry of payload.accounts) {
    //         // let radix = accountHashEntry.accountID.substr(0, this.treeMaxDepth)
    //         // let layerMap = this.shardTrie.layerMaps[this.treeMaxDepth]
    //         // let hashTrieNode = layerMap.get(radix)
    //         if (
    //           accountHashEntry == null ||
    //           accountHashEntry.hash == null ||
    //           accountHashEntry.accountID == null
    //         ) {
    //           queryStats.fix1++
    //           continue
    //         }
    //         hashMap.set(accountHashEntry.accountID, accountHashEntry.hash)
    //         accountIDs.push(accountHashEntry.accountID)
    //       }

    //       const accountData = await this.app.getAccountDataByList(accountIDs)

    //       const skippedAccounts: AccountIDAndHash[] = []
    //       const returnedAccounts: AccountIDAndHash[] = []

    //       const accountsToGetStateTableDataFor = []
    //       //only return results that match the requested hash!
    //       const accountDataFinal: Shardus.WrappedData[] = []
    //       if (accountData != null) {
    //         for (const wrappedAccount of accountData) {
    //           if (wrappedAccount == null || wrappedAccount.stateId == null || wrappedAccount.data == null) {
    //             queryStats.fix2++
    //             continue
    //           }

    //           const { accountId, stateId, data: recordData } = wrappedAccount
    //           const accountHash = this.app.calculateAccountHash(recordData)
    //           if (stateId !== accountHash) {
    //             skippedAccounts.push({ accountID: accountId, hash: stateId })
    //             queryStats.skip_localHashMismatch++
    //             continue
    //           }

    //           if (hashMap.get(accountId) === wrappedAccount.stateId) {
    //             accountDataFinal.push(wrappedAccount)
    //             returnedAccounts.push({ accountID: accountId, hash: stateId })
    //             accountsToGetStateTableDataFor.push(accountId)
    //             queryStats.returned++
    //           } else {
    //             queryStats.skip_requestHashMismatch++
    //             skippedAccounts.push({ accountID: accountId, hash: stateId })
    //           }

    //           // let wrappedAccountInQueueRef = wrappedAccount as Shardus.WrappedDataFromQueue
    //           // wrappedAccountInQueueRef.seenInQueue = false

    //           // if (this.stateManager.lastSeenAccountsMap != null) {
    //           //   let queueEntry = this.stateManager.lastSeenAccountsMap[wrappedAccountInQueueRef.accountId]
    //           //   if (queueEntry != null) {
    //           //     wrappedAccountInQueueRef.seenInQueue = true
    //           //   }
    //           // }
    //         }
    //       }
    //       //PERF could disable this for more perf?
    //       //this.stateManager.testAccountDataWrapped(accountDataFinal)

    //       if (queryStats.returned < payload.accounts.length) {
    //         nestedCountersInstance.countEvent('accountPatcher', `get_account_data_by_hashes incomplete`)
    //         queryStats.missingResp = true
    //         if (queryStats.returned === 0) {
    //           nestedCountersInstance.countEvent('accountPatcher', `get_account_data_by_hashes no results`)
    //           queryStats.noResp = true
    //         }
    //       }

    //       this.mainLogger.debug(
    //         `get_account_data_by_hashes1 requests[${payload.accounts.length}] :${utils.stringifyReduce(
    //           payload.accounts
    //         )} `
    //       )
    //       this.mainLogger.debug(
    //         `get_account_data_by_hashes2 skippedAccounts:${utils.stringifyReduce(skippedAccounts)} `
    //       )
    //       this.mainLogger.debug(
    //         `get_account_data_by_hashes3 returnedAccounts:${utils.stringifyReduce(returnedAccounts)} `
    //       )
    //       this.mainLogger.debug(
    //         `get_account_data_by_hashes4 queryStats:${utils.stringifyReduce(queryStats)} `
    //       )
    //       this.mainLogger.debug(
    //         `get_account_data_by_hashes4 stateTabledata:${utils.stringifyReduce(result.stateTableData)} `
    //       )
    //       result.accounts = accountDataFinal
    //     } catch (ex) {
    //       this.statemanager_fatal(
    //         `get_account_data_by_hashes-failed`,
    //         'get_account_data_by_hashes:' + ex.name + ': ' + ex.message + ' at ' + ex.stack
    //       )
    //     }
    //     const respondSize = await respond(result)
    //     profilerInstance.scopedProfileSectionEnd('get_account_data_by_hashes', respondSize)
    //   }
    // )

    const getAccountDataByHashesBinaryHandler: Route<InternalBinaryHandler<Buffer>> = {
      name: InternalRouteEnum.binary_get_account_data_by_hashes,
      handler: async (payload, respond) => {
        const route = InternalRouteEnum.binary_get_account_data_by_hashes
        profilerInstance.scopedProfileSectionStart(route)
        nestedCountersInstance.countEvent('internal', route)
        const result = { accounts: [], stateTableData: [] } as GetAccountDataByHashesResp
        try {
          const stream = getStreamWithTypeCheck(payload, TypeIdentifierEnum.cGetAccountDataByHashesReq)
          if (!stream) {
            return respond(result, serializeGetAccountDataByHashesResp)
          }

          const req = deserializeGetAccountDataByHashesReq(stream)

          const queryStats = {
            fix1: 0,
            fix2: 0,
            skip_localHashMismatch: 0,
            skip_requestHashMismatch: 0,
            returned: 0,
            missingResp: false,
            noResp: false,
          }

          const hashMap = new Map()
          const accountIDs = []

          if (req.accounts.length > 900) {
            req.accounts = req.accounts.slice(0, 900)
          }

          for (const accountHashEntry of req.accounts) {
            if (accountHashEntry == null || accountHashEntry.hash == null || accountHashEntry.accountID == null) {
              queryStats.fix1++
              continue
            }
            hashMap.set(accountHashEntry.accountID, accountHashEntry.hash)
            accountIDs.push(accountHashEntry.accountID)
          }

          const accountData = await this.app.getAccountDataByList(accountIDs)
          const skippedAccounts: AccountIDAndHash[] = []
          const returnedAccounts: AccountIDAndHash[] = []

          const accountsToGetStateTableDataFor = []
          const accountDataFinal: WrappedData[] = []

          if (accountData != null) {
            for (const wrappedAccount of accountData) {
              if (wrappedAccount == null || wrappedAccount.stateId == null || wrappedAccount.data == null) {
                queryStats.fix2++
                continue
              }
              const { accountId, stateId, data: recordData } = wrappedAccount
              const accountHash = this.app.calculateAccountHash(recordData)
              if (stateId !== accountHash) {
                skippedAccounts.push({ accountID: accountId, hash: stateId })
                queryStats.skip_localHashMismatch++
                continue
              }

              if (hashMap.get(accountId) === wrappedAccount.stateId) {
                accountDataFinal.push(wrappedAccount)
                returnedAccounts.push({ accountID: accountId, hash: stateId })
                accountsToGetStateTableDataFor.push(accountId)
                queryStats.returned++
              } else {
                queryStats.skip_requestHashMismatch++
                skippedAccounts.push({ accountID: accountId, hash: stateId })
              }
            }
          }

          if (queryStats.returned < req.accounts.length) {
            nestedCountersInstance.countEvent('internal', `${route} incomplete`)
            queryStats.missingResp = true
            if (queryStats.returned === 0) {
              nestedCountersInstance.countEvent('internal', `${route} no results`)
              queryStats.noResp = true
            }
          }

          this.mainLogger.debug(`${route} 1 requests[${req.accounts.length}] :${utils.stringifyReduce(req.accounts)} `)
          this.mainLogger.debug(`${route} 2 skippedAccounts:${utils.stringifyReduce(skippedAccounts)} `)
          this.mainLogger.debug(`${route} 3 returnedAccounts:${utils.stringifyReduce(returnedAccounts)} `)
          this.mainLogger.debug(`${route} 4 queryStats:${utils.stringifyReduce(queryStats)} `)
          this.mainLogger.debug(`${route}  stateTabledata:${utils.stringifyReduce(result.stateTableData)} `)
          result.accounts = accountDataFinal
          respond(result, serializeGetAccountDataByHashesResp)
        } catch (ex) {
          this.statemanager_fatal(
            `get_account_data_by_hashes-failed`,
            'get_account_data_by_hashes:' + ex.name + ': ' + ex.message + ' at ' + ex.stack
          )
          respond(result, serializeGetAccountDataByHashesResp)
        } finally {
          profilerInstance.scopedProfileSectionEnd(route)
        }
      },
    }

    this.p2p.registerInternalBinary(
      getAccountDataByHashesBinaryHandler.name,
      getAccountDataByHashesBinaryHandler.handler
    )

    Context.network.registerExternalGet('debug-patcher-ignore-hash-updates', isDebugModeMiddleware, (_req, res) => {
      try {
        this.debug_ignoreUpdates = !this.debug_ignoreUpdates
        res.write(`this.debug_ignoreUpdates: ${this.debug_ignoreUpdates}\n`)
      } catch (e) {
        res.write(`${e}\n`)
      }
      res.end()
    })
    Context.network.registerExternalGet('debug-patcher-fail-tx', isDebugModeMiddleware, (_req, res) => {
      try {
        //toggle chance to fail TXs in a way that they do not get fixed by the first tier of repair.

        if (this.stateManager.failNoRepairTxChance === 0) {
          this.stateManager.failNoRepairTxChance = 1
        } else {
          this.stateManager.failNoRepairTxChance = 0
        }

        res.write(`this.failNoRepairTxChance: ${this.stateManager.failNoRepairTxChance}\n`)
      } catch (e) {
        res.write(`${e}\n`)
      }
      res.end()
    })
    Context.network.registerExternalGet('debug-patcher-voteflip', isDebugModeMiddleware, (_req, res) => {
      try {
        if (this.stateManager.voteFlipChance === 0) {
          this.stateManager.voteFlipChance = 1
        } else {
          this.stateManager.voteFlipChance = 0
        }

        res.write(`this.voteFlipChance: ${this.stateManager.voteFlipChance}\n`)
      } catch (e) {
        res.write(`${e}\n`)
      }
      res.end()
    })
    Context.network.registerExternalGet('debug-patcher-toggle-skip', isDebugModeMiddleware, (_req, res) => {
      try {
        if (this.stateManager.debugSkipPatcherRepair === false) {
          this.stateManager.debugSkipPatcherRepair = true
        } else {
          this.stateManager.debugSkipPatcherRepair = false
        }

        res.write(`this.debugSkipPatcherRepair: ${this.stateManager.debugSkipPatcherRepair}\n`)
      } catch (e) {
        res.write(`${e}\n`)
      }
      res.end()
    })
    Context.network.registerExternalGet('debug-patcher-dumpTree', isDebugModeMiddlewareMedium, (_req, res) => {
      try {
        // this.statemanager_fatal('debug shardTrie',`temp shardTrie ${utils.stringifyReduce(this.shardTrie.layerMaps[0].values().next().value)}`)
        // res.write(`${utils.stringifyReduce(this.shardTrie.layerMaps[0].values().next().value)}\n`)

        const trieRoot = this.shardTrie.layerMaps[0].values().next().value

        //strip noisy fields
        const tempString = JSON.stringify(trieRoot, utils.debugReplacer)
        const processedObject = Utils.safeJsonParse(tempString)

        // use stringify to put a stable sort on the object keys (important for comparisons)
        const finalStr = utils.stringifyReduce(processedObject)

        this.statemanager_fatal('debug shardTrie', `temp shardTrie ${finalStr}`)
        res.write(`${finalStr}\n`)
      } catch (e) {
        res.write(`${e}\n`)
      }
      res.end()
    })

    Context.network.registerExternalGet('debug-patcher-dumpTree-partial', isDebugModeMiddlewareMedium, (req, res) => {
      try {
        const subTree: boolean = req.query.subtree === 'true'
        let radix: string = req.query.radix as string
        if (radix.length > this.treeMaxDepth) radix = radix.slice(0, this.treeMaxDepth)
        const level = radix.length
        const layerMap = this.shardTrie.layerMaps[level] // eslint-disable-line security/detect-object-injection

        let hashTrieNode = layerMap.get(radix.toLowerCase())
        if (!subTree) {
          // deep clone the trie node before removing children property
          hashTrieNode = Utils.safeJsonParse(Utils.safeStringify(hashTrieNode))
          delete hashTrieNode.children
        }
        if (!hashTrieNode) {
          /* prettier-ignore */ if (logFlags.error) console.error('debug-patcher-dumpTree-partial - Radix not found. Returning 404')
          res.status(404).json({ error: 'Radix not found' })
          return
        }
        //strip noisy fields
        const tempString = JSON.stringify(hashTrieNode, utils.debugReplacer)
        const processedObject = Utils.safeJsonParse(tempString)

        // use stringify to put a stable sort on the object keys (important for comparisons)
        const finalStr = utils.stringifyReduce(processedObject)

        this.statemanager_fatal('debug shardTrie', `temp shardTrie ${finalStr}`)
        res.write(`${finalStr}\n`)
      } catch (e) {
        console.log('Error', e)
        res.write(`${e}\n`)
      }
      res.end()
    })

    Context.network.registerExternalGet('debug-patcher-fail-hashes', isDebugModeMiddlewareLow, (_req, res) => {
      try {
        const lastCycle = this.p2p.state.getLastCycle()
        const cycle = lastCycle.counter
        const minVotes = this.calculateMinVotes()
        const notEnoughVotesRadix = {}
        const outOfSyncRadix = {}

        const hashTrieSyncConsensus = this.hashTrieSyncConsensusByCycle.get(cycle)

        if (!hashTrieSyncConsensus) {
          res.json({ error: `Unable to find hashTrieSyncConsensus for last cycle ${lastCycle}` })
          return
        }

        for (const radix of hashTrieSyncConsensus.radixHashVotes.keys()) {
          const votesMap = hashTrieSyncConsensus.radixHashVotes.get(radix)
          const ourTrieNode = this.shardTrie.layerMaps[this.treeSyncDepth].get(radix)

          const hasEnoughVotes = votesMap.bestVotes >= minVotes
          const isRadixInSync = ourTrieNode ? ourTrieNode.hash === votesMap.bestHash : false

          if (!hasEnoughVotes || !isRadixInSync) {
            const kvp = []
            for (const [key, value] of votesMap.allVotes.entries()) {
              kvp.push({
                id: key,
                count: value.count,
                nodeIDs: [...value.voters].map((node) => utils.makeShortHash(node.id) + ':' + node.externalPort),
              })
            }
            const simpleMap = {
              bestHash: votesMap.bestHash,
              ourHash: ourTrieNode ? ourTrieNode.hash : '',
              bestVotes: votesMap.bestVotes,
              minVotes,
              allVotes: kvp,
            }
            if (!hasEnoughVotes) notEnoughVotesRadix[radix] = simpleMap // eslint-disable-line security/detect-object-injection
            if (!isRadixInSync) outOfSyncRadix[radix] = simpleMap // eslint-disable-line security/detect-object-injection
          }
        }
        res.json({
          cycle,
          notEnoughVotesRadix,
          outOfSyncRadix,
        })
        return
      } catch (e) {
        console.log('Error', e)
        res.write(`${e}\n`)
      }
      res.end()
    })

    Context.network.registerExternalGet('get-tree-last-insync', isDebugModeMiddlewareLow, (_req, res) => {
      res.write(`${this.failedLastTrieSync === false}\n`)
      res.end()
    })

    Context.network.registerExternalGet('get-tree-last-insync-detail', isDebugModeMiddlewareLow, (_req, res) => {
      let prettyJSON = JSON.stringify(this.lastInSyncResult, null, 2)
      res.write(`${prettyJSON}\n`)
      res.end()
    })

    Context.network.registerExternalGet('trie-repair-dump', isDebugModeMiddleware, (_req, res) => {
      res.write(`${utils.stringifyReduce(this.lastRepairInfo)}\n`)
      res.end()
    })

    //
    Context.network.registerExternalGet('get-shard-dump', isDebugModeMiddleware, (_req, res) => {
      res.write(`${this.stateManager.lastShardReport}\n`)
      res.end()
    })

    /**
     *
     *
     * Usage: http://<NODE_IP>:<NODE_EXT_PORT>/account-report?id=<accountID>
     */
    Context.network.registerExternalGet('account-report', isDebugModeMiddleware, async (req, res) => {
      if (req.query.id == null) return
      let id = req.query.id as string
      res.write(`report for: ${id} \n`)
      try {
        if (id.length === 10) {
          //short form..
          let found = false
          const prefix = id.substring(0, 4)
          const low = prefix + '0'.repeat(60)
          const high = prefix + 'f'.repeat(60)

          const suffix = id.substring(5, 10)
          const possibleAccounts = await this.app.getAccountDataByRange(low, high, 0, shardusGetTime(), 100, 0, '')

          res.write(`searching ${possibleAccounts.length} accounts \n`)

          for (const account of possibleAccounts) {
            if (account.accountId.endsWith(suffix)) {
              res.write(`found full account ${id} => ${account.accountId} \n`)
              id = account.accountId
              found = true

              break
            }
          }

          if (found == false) {
            res.write(`could not find account\n`)
            res.end()
            return
          }
        }

        const trieAccount = this.getAccountTreeInfo(id)
        const accountHash = this.stateManager.accountCache.getAccountHash(id)
        const accountHashFull = this.stateManager.accountCache.getAccountDebugObject(id) //this.stateManager.accountCache.accountsHashCache3.accountHashMap.get(id)
        const accountData = await this.app.getAccountDataByList([id])
        res.write(`trieAccount: ${Utils.safeStringify(trieAccount)} \n`)
        res.write(`accountHash: ${Utils.safeStringify(accountHash)} \n`)
        res.write(`accountHashFull: ${Utils.safeStringify(accountHashFull)} \n`)
        res.write(`accountData: ${JSON.stringify(accountData, appdata_replacer)} \n\n`)
        res.write(`tests: \n`)
        if (accountData != null && accountData.length === 1 && accountHash != null) {
          res.write(`accountData hash matches cache ${accountData[0].stateId === accountHash.h} \n`)
        }
        if (accountData != null && accountData.length === 1 && trieAccount != null) {
          res.write(`accountData matches trieAccount ${accountData[0].stateId === trieAccount.hash} \n`)
        }
      } catch (e) {
        res.write(`${e}\n`)
      }
      res.end()
    })

    /**
     *
     *
     * Usage: http://<NODE_IP>:<NODE_EXT_PORT>/account-coverage?id=<accountID>
     */
    Context.network.registerExternalGet('account-coverage', isDebugModeMiddleware, async (req, res) => {
      if (req.query.id === null) return
      const id = req.query.id as string

      const possibleAccountsIds: string[] = []
      try {
        if (id.length === 10) {
          //short form..
          const prefix = id.substring(0, 4)
          const low = prefix + '0'.repeat(60)
          const high = prefix + 'f'.repeat(60)

          const suffix = id.substring(5, 10)
          const possibleAccounts = await this.app.getAccountDataByRange(low, high, 0, shardusGetTime(), 100, 0, '')

          for (const account of possibleAccounts) {
            if (account.accountId.endsWith(suffix)) {
              possibleAccountsIds.push(account.accountId)
            }
          }
        } else {
          possibleAccountsIds.push(id)
        }

        if (possibleAccountsIds.length === 0) {
          res.write(
            Utils.safeStringify({
              success: false,
              error: 'could not find account',
            })
          )
        } else {
          const resObj = {}
          for (const accountId of possibleAccountsIds) {
            const consensusNodes = this.stateManager.transactionQueue.getConsenusGroupForAccount(accountId)
            const storedNodes = this.stateManager.transactionQueue.getStorageGroupForAccount(accountId)

            // eslint-disable-next-line security/detect-object-injection
            resObj[accountId] = {
              consensusNodes: consensusNodes.map((node) => {
                return {
                  id: node.id,
                  externalIp: node.externalIp,
                  externalPort: node.externalPort,
                  internalIp: node.internalIp,
                  internalPort: node.internalPort,
                }
              }),
              storedNodes: storedNodes.map((node) => {
                return {
                  id: node.id,
                  externalIp: node.externalIp,
                  externalPort: node.externalPort,
                  internalIp: node.internalIp,
                  internalPort: node.internalPort,
                }
              }),
            }
          }
          res.write(
            Utils.safeStringify({
              success: true,
              result: resObj,
            })
          )
        }
      } catch (e) {
        res.write(
          Utils.safeStringify({
            success: false,
            error: e,
          })
        )
      }
      res.end()
    })

    Context.network.registerExternalGet('hack-version', isDebugModeMiddleware, (_req, res) => {
      res.write(`1.0.1\n`)
      res.end()
    })
  }
}