import { P2P as P2PTypes, Utils } from '@shardeum-foundation/lib-types'
import { logFlags } from '../logger'
import { shardusGetTime } from '../network'
import * as Archivers from '../p2p/Archivers'
import { config as configContext } from '../p2p/Context'
import { getGlobalTxReceipt } from '../p2p/GlobalAccounts'
import * as Shardus from '../shardus/shardus-types'
import { nestedCountersInstance } from '../utils/nestedCounters'
import {
  ArchiverReceipt,
  QueueEntry,
  SignedReceipt,
  WrappedResponses,
} from './state-manager-types'

export const archiverMethods = {
    async getArchiverReceiptFromQueueEntry(queueEntry: QueueEntry): Promise<ArchiverReceipt> {
        if (!queueEntry.preApplyTXResult || !queueEntry.preApplyTXResult.applyResponse) {
          /* prettier-ignore */ if (logFlags.verbose) console.log('getArchiverReceiptFromQueueEntry : no preApplyTXResult or applyResponse, returning null receipt')
          /* prettier-ignore */ nestedCountersInstance.countEvent('stateManager', 'getArchiverReceiptFromQueueEntry no preApplyTXResult or applyResponse')
            return null as ArchiverReceipt
        }

        const txId = queueEntry.acceptedTx.txId
        const timestamp = queueEntry.acceptedTx.timestamp
        const globalModification = queueEntry.globalModification

        let signedReceipt = null as SignedReceipt | P2PTypes.GlobalAccountsTypes.GlobalTxReceipt
        if (globalModification) {
            signedReceipt = getGlobalTxReceipt(queueEntry.acceptedTx.txId) as P2PTypes.GlobalAccountsTypes.GlobalTxReceipt
          /* prettier-ignore */ if (logFlags.important_as_error) console.log('getArchiverReceiptFromQueueEntry : globalModification signedReceipt txid', txId)
          /* prettier-ignore */ if (logFlags.important_as_error) console.log('getArchiverReceiptFromQueueEntry : globalModification signedReceipt signs', txId, Utils.safeStringify(signedReceipt.signs))
          /* prettier-ignore */ if (logFlags.important_as_error) console.log('getArchiverReceiptFromQueueEntry : globalModification signedReceipt tx', txId, Utils.safeStringify(signedReceipt.tx))
        } else {
            signedReceipt = this.stateManager.getSignedReceipt(queueEntry) as SignedReceipt
          /* prettier-ignore */ if (logFlags.important_as_error) console.log('getArchiverReceiptFromQueueEntry : nonGlobal signedReceipt txid', txId)
          /* prettier-ignore */ if (logFlags.important_as_error) console.log('getArchiverReceiptFromQueueEntry : nonGlobal signedReceipt proposal', txId, Utils.safeStringify(signedReceipt.proposal))
          /* prettier-ignore */ if (logFlags.important_as_error) console.log('getArchiverReceiptFromQueueEntry : nonGlobal signedReceipt proposalHash', txId, Utils.safeStringify(signedReceipt.proposalHash))
          /* prettier-ignore */ if (logFlags.important_as_error) console.log('getArchiverReceiptFromQueueEntry : nonGlobal signedReceipt signaturePack', txId, Utils.safeStringify(signedReceipt.signaturePack))
          /* prettier-ignore */ if (logFlags.important_as_error) console.log('getArchiverReceiptFromQueueEntry : nonGlobal signedReceipt voteOffsets', txId, Utils.safeStringify(signedReceipt.voteOffsets))
        }
        if (!signedReceipt) {
          /* prettier-ignore */ nestedCountersInstance.countEvent('stateManager', 'getArchiverReceiptFromQueueEntry no signedReceipt')
          /* prettier-ignore */ if (logFlags.important_as_error) console.log(`getArchiverReceiptFromQueueEntry: signedReceipt is null for txId: ${txId} timestamp: ${timestamp} globalModification: ${globalModification}`)
            return null as ArchiverReceipt
        }

        const accountsToAdd: { [accountId: string]: Shardus.AccountsCopy } = {}
        const beforeAccountsToAdd: { [accountId: string]: Shardus.AccountsCopy } = {}

        if (globalModification) {
            signedReceipt = signedReceipt as P2PTypes.GlobalAccountsTypes.GlobalTxReceipt
            if (signedReceipt.tx && signedReceipt.tx.addressHash != '' && !beforeAccountsToAdd[signedReceipt.tx.address]) {
                console.log(queueEntry.collectedData[signedReceipt.tx.address].stateId, signedReceipt.tx.addressHash)
                if (queueEntry.collectedData[signedReceipt.tx.address].stateId === signedReceipt.tx.addressHash) {
                    const isGlobal = this.stateManager.accountGlobals.isGlobalAccount(signedReceipt.tx.addressHash)
                    const account = queueEntry.collectedData[signedReceipt.tx.address]
                    const accountCopy = {
                        accountId: account.accountId,
                        data: account.data,
                        hash: account.stateId,
                        timestamp: account.timestamp,
                        isGlobal,
                    } as Shardus.AccountsCopy
                    beforeAccountsToAdd[account.accountId] = accountCopy
                } else {
                    console.log(
                        `getArchiverReceiptFromQueueEntry: before stateId does not match addressHash for txId: ${txId} timestamp: ${timestamp} globalModification: ${globalModification}`
                    )
                }
            }
        } else if (this.config.stateManager.includeBeforeStatesInReceipts) {
            // simulate debug case
            if (configContext.mode === 'debug' && configContext.debug.beforeStateFailChance > Math.random()) {
                for (const accountId in queueEntry.collectedData) {
                    const account = queueEntry.collectedData[accountId]
                    account.stateId = 'debugFail2'
                }
            }

            const fileredBeforeStateToSend = []
            const badBeforeStateAccounts = []

            for (const account of Object.values(queueEntry.collectedData)) {
                if (typeof this.app.beforeStateAccountFilter !== 'function' || this.app.beforeStateAccountFilter(account)) {
                    fileredBeforeStateToSend.push(account.accountId)
                }
            }

            // prepare before state accounts
            for (const accountId of fileredBeforeStateToSend) {
                signedReceipt = signedReceipt as SignedReceipt
                // check if our beforeState account hash is the same as the vote in the receipt2
                const index = signedReceipt.proposal.accountIDs.indexOf(accountId)
                if (index === -1) continue
                const account = queueEntry.collectedData[accountId]
                if (account == null) {
                    badBeforeStateAccounts.push(accountId)
                    continue
                }
                if (account.stateId !== signedReceipt.proposal.beforeStateHashes[index]) {
                    badBeforeStateAccounts.push(accountId)
                }
            }

            if (badBeforeStateAccounts.length > 0) {
                nestedCountersInstance.countEvent(
                    'stateManager',
                    'badBeforeStateAccounts in getArchiverReceiptFromQueueEntry',
                    badBeforeStateAccounts.length
                )

                // repair bad before state accounts
                const wrappedResponses: WrappedResponses = await this.requestInitialData(queueEntry, badBeforeStateAccounts)
                for (const accountId in wrappedResponses) {
                    queueEntry.collectedData[accountId] = wrappedResponses[accountId]
                }
            }

            // add before state accounts
            for (const accountId of fileredBeforeStateToSend) {
                const account = queueEntry.collectedData[accountId]
                const isGlobal = this.stateManager.accountGlobals.isGlobalAccount(account.accountId)
                const accountCopy = {
                    accountId: account.accountId,
                    data: account.data,
                    hash: account.stateId,
                    timestamp: account.timestamp,
                    isGlobal,
                } as Shardus.AccountsCopy
                beforeAccountsToAdd[account.accountId] = accountCopy
            }
        }

        let isAccountsMatchWithReceipt2 = true
        const accountWrites = queueEntry.preApplyTXResult?.applyResponse?.accountWrites

        if (globalModification) {
            if (accountWrites === null || accountWrites.length === 0) {
                console.log('No account update in global Modification tx', txId, timestamp)
            }
        } else if (
            accountWrites != null &&
            accountWrites.length === (signedReceipt as SignedReceipt).proposal.accountIDs.length
        ) {
            signedReceipt = signedReceipt as SignedReceipt
            for (const account of accountWrites) {
                const indexInVote = signedReceipt.proposal.accountIDs.indexOf(account.accountId)
                if (signedReceipt.proposal.afterStateHashes[indexInVote] !== account.data.stateId) {
                    // console.log('Found afterStateHash mismatch', account.accountId, receipt2.proposal.afterStateHashes[indexInVote], account.data.stateId)
                    isAccountsMatchWithReceipt2 = false
                    break
                }
            }
        } else {
            isAccountsMatchWithReceipt2 = false
        }

        let finalAccounts = []
        let appReceiptData = queueEntry.preApplyTXResult?.applyResponse?.appReceiptData || null
        if (isAccountsMatchWithReceipt2) {
            finalAccounts = accountWrites
        } else {
            signedReceipt = signedReceipt as SignedReceipt
            // request the final accounts and appReceiptData
            let success = false
            let count = 0
            const maxRetry = 3
            const nodesToAskKeys = signedReceipt.signaturePack?.map((signature) => signature.owner)

            // retry 3 times if the request fails
            while (success === false && count < maxRetry) {
                count++
                const requestedData = await this.requestFinalData(
                    queueEntry,
                    signedReceipt.proposal.accountIDs,
                    nodesToAskKeys,
                    true
                )
                if (requestedData && requestedData.wrappedResponses && requestedData.appReceiptData) {
                    success = true
                    for (const accountId in requestedData.wrappedResponses) {
                        finalAccounts.push(requestedData.wrappedResponses[accountId])
                    }
                    appReceiptData = requestedData.appReceiptData
                }
            }
        }

        // override with the accounts in accountWrites
        for (const account of finalAccounts) {
            const isGlobal = this.stateManager.accountGlobals.isGlobalAccount(account.accountId)
            const accountCopy = {
                accountId: account.accountId,
                data: account.data.data,
                timestamp: account.timestamp,
                hash: account.data.stateId,
                isGlobal,
            } as Shardus.AccountsCopy
            accountsToAdd[account.accountId] = accountCopy
        }

        // MIGHT NOT NEED THIS NOW WITH THE POQo RECEIPT REWRITE. NEED TO CONFIRM
        // if (!globalModification && this.useNewPOQ === false) {
        //   appliedReceipt = appliedReceipt as AppliedReceipt2
        //   if (appliedReceipt.appliedVote) {
        //     delete appliedReceipt.appliedVote.node_id
        //     delete appliedReceipt.appliedVote.sign
        //     delete appliedReceipt.confirmOrChallenge
        //     // Update the app_data_hash with the app_data_hash from the appliedVote
        //     appliedReceipt.app_data_hash = appliedReceipt.appliedVote.app_data_hash
        //   }
        // }

        const archiverReceipt: ArchiverReceipt = {
            tx: {
                originalTxData: queueEntry.acceptedTx.data,
                txId: queueEntry.acceptedTx.txId,
                timestamp: queueEntry.acceptedTx.timestamp,
            },
            signedReceipt,
            appReceiptData,
            beforeStates: [...Object.values(beforeAccountsToAdd)],
            afterStates: [...Object.values(accountsToAdd)],
            cycle: queueEntry.txGroupCycle,
            globalModification,
        }
        /* prettier-ignore */ if (logFlags.important_as_error) console.log('getArchiverReceiptFromQueueEntry : archiverReceipt', txId, Utils.safeStringify(archiverReceipt))
        /* prettier-ignore */ if (logFlags.important_as_error) console.log('getArchiverReceiptFromQueueEntry : originalTxData object', txId, Utils.safeStringify(archiverReceipt.tx.originalTxData))

        return archiverReceipt
    },
    addOriginalTxDataToForward(queueEntry: QueueEntry): void {
        if (logFlags.verbose) console.log('originalTxData', queueEntry.acceptedTx.txId, queueEntry.acceptedTx.timestamp)
        const { acceptedTx } = queueEntry
        const originalTxData = {
            txId: acceptedTx.txId,
            originalTxData: acceptedTx.data,
            cycle: queueEntry.cycleToRecordOn,
            timestamp: acceptedTx.timestamp,
        }
        // const signedOriginalTxData: any = this.crypto.sign(originalTxData) // maybe we don't need to send by signing it
        Archivers.instantForwardOriginalTxData(originalTxData)
    },

    async addReceiptToForward(queueEntry: QueueEntry, debugString = ''): Promise<void> {
        if (logFlags.verbose)
            console.log('addReceiptToForward', queueEntry.acceptedTx.txId, queueEntry.acceptedTx.timestamp, debugString)
        const archiverReceipt = await this.getArchiverReceiptFromQueueEntry(queueEntry)
        Archivers.instantForwardReceipts([archiverReceipt])
        this.receiptsForwardedTimestamp = shardusGetTime()
        this.forwardedReceiptsByTimestamp.set(this.receiptsForwardedTimestamp, archiverReceipt)
        // this.receiptsToForward.push(archiverReceipt)
    },

    getReceiptsToForward(): ArchiverReceipt[] {
        return [...this.forwardedReceiptsByTimestamp.values()]
    }
}