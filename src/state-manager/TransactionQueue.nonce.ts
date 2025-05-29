import { NonceQueueItem } from './state-manager-types'
import { logFlags } from '../logger'
import * as utils from '../utils'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { shardusGetTime, getNetworkTimeOffset } from '../network'
import * as NodeList from '../p2p/NodeList'
import * as Self from '../p2p/Self'
import * as Shardus from '../shardus/shardus-types'

interface TransactionQueueContext {
  nonceQueue: Map<string, NonceQueueItem[]>
  mainLogger: any
  seqLogger: any
  app: Shardus.App
  _timestampAndQueueTransaction: (tx: any, appData: any, txId: string) => Promise<boolean>
  stateManager: any
}

export const nonceMethods = {
     isTxInPendingNonceQueue(this: TransactionQueueContext, accountId: string, txId: string): boolean {
        /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`isTxInPendingNonceQueue ${accountId} ${txId}`, this.nonceQueue)
        const queue = this.nonceQueue.get(accountId)
        if (queue == null) {
          return false
        }
        for (const item of queue) {
          if (item.txId === txId) {
            return true
          }
        }
        return false
      },
    
      getPendingCountInNonceQueue(this: TransactionQueueContext): { totalQueued: number; totalAccounts: number; avgQueueLength: number } {
        let totalQueued = 0
        let totalAccounts = 0
        for (const queue of this.nonceQueue.values()) {
          totalQueued += queue.length
          totalAccounts++
        }
        const avgQueueLength = totalQueued / totalAccounts
        return { totalQueued, totalAccounts, avgQueueLength }
      },
    
      addTransactionToNonceQueue(this: TransactionQueueContext, nonceQueueEntry: NonceQueueItem): {
        success: boolean
        reason?: string
        alreadyAdded?: boolean
      } {
        try {
          let queue = this.nonceQueue.get(nonceQueueEntry.accountId)
          if (queue == null || (Array.isArray(queue) && queue.length === 0)) {
            queue = [nonceQueueEntry]
            this.nonceQueue.set(nonceQueueEntry.accountId, queue)
            if (logFlags.debug)
              this.mainLogger.debug(
                `adding new nonce tx: ${nonceQueueEntry.txId} ${nonceQueueEntry.accountId} with nonce ${nonceQueueEntry.nonce}`
              )
          } else if (queue && queue.length > 0) {
            const index = utils.binarySearch(queue, nonceQueueEntry, (a, b) => Number(a.nonce) - Number(b.nonce))
    
            if (index >= 0) {
              // there is existing item with the same nonce. replace it with the new one
              queue[index] = nonceQueueEntry
              this.nonceQueue.set(nonceQueueEntry.accountId, queue)
              nestedCountersInstance.countEvent('processing', 'replaceExistingNonceTx')
              if (logFlags.debug)
                this.mainLogger.debug(
                  `replace existing nonce tx ${nonceQueueEntry.accountId} with nonce ${nonceQueueEntry.nonce}, txId: ${nonceQueueEntry.txId}`
                )
              return { success: true, reason: 'Replace existing pending nonce tx', alreadyAdded: true }
            }
            // add new item to the queue
            utils.insertSorted(queue, nonceQueueEntry, (a, b) => Number(a.nonce) - Number(b.nonce))
            this.nonceQueue.set(nonceQueueEntry.accountId, queue)
          }
          /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455106 ${shardusGetTime()} tx:${nonceQueueEntry.txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: pause_nonceQ`)
          nestedCountersInstance.countEvent('processing', 'addTransactionToNonceQueue')
          if (logFlags.debug)
            this.mainLogger.debug(
              `Added tx to nonce queue for ${nonceQueueEntry.accountId} with nonce ${nonceQueueEntry.nonce} nonceQueue: ${queue.length}`
            )
          return { success: true, reason: `Nonce queue size for account: ${queue.length}`, alreadyAdded: false }
        } catch (e) {
          nestedCountersInstance.countEvent('processing', 'addTransactionToNonceQueueError')
          this.mainLogger.error(
            `Error adding tx to nonce queue: ${e.message}, tx: ${utils.stringifyReduce(nonceQueueEntry)}`
          )
          return { success: false, reason: e.message, alreadyAdded: false }
        }
      },
      async processNonceQueue(this: TransactionQueueContext, accounts: Shardus.WrappedData[]): Promise<void> {
        for (const account of accounts) {
          const queue = this.nonceQueue.get(account.accountId)
          if (queue == null) {
            continue
          }
          for (const item of queue) {
            const accountNonce = await this.app.getAccountNonce(account.accountId, account)
            if (item.nonce === accountNonce) {
              nestedCountersInstance.countEvent('processing', 'processNonceQueue foundMatchingNonce')
              if (logFlags.debug)
                this.mainLogger.debug(
                  `Found matching nonce in queue or ${account.accountId} with nonce ${item.nonce}`,
                  item
                )
              item.appData.requestNewTimestamp = true
    
              // start of timestamp logging
              if (logFlags.important_as_error) {
                const txTimestamp = this.app.getTimestampFromTransaction(item.tx, item.appData)
                const nowNodeTimestamp = shardusGetTime()
                const delta = nowNodeTimestamp - txTimestamp
                const ntpOffset = getNetworkTimeOffset()
                /* prettier-ignore */ console.log(`TxnTS: pre _timestampAndQueueTransaction txTimestamp=${txTimestamp}, nowNodeTimestamp=${nowNodeTimestamp}, delta=${delta}, ntpOffset=${ntpOffset}, txID=${item.txId}`)
              }
              // end of timestamp logging.
    
              await this.stateManager.shardus._timestampAndQueueTransaction(
                item.tx,
                item.appData,
                item.global,
                item.noConsensus,
                'nonceQueue'
              )
    
              // start of timestamp logging
              if (logFlags.important_as_error) {
                const txTimestamp = this.app.getTimestampFromTransaction(item.tx, item.appData)
                const nowNodeTimestamp = shardusGetTime()
                const delta = nowNodeTimestamp - txTimestamp
                const ntpOffset = getNetworkTimeOffset()
                /* prettier-ignore */ console.log(`TxnTS: post _timestampAndQueueTransaction txTimestamp=${txTimestamp}, nowNodeTimestamp=${nowNodeTimestamp}, delta=${delta}, ntpOffset=${ntpOffset}, txID=${item.txId}`)
              }
              // end of timestamp logging.
    
              // remove the item from the queue
              const index = queue.indexOf(item)
              queue.splice(index, 1)
    
              //we should break here. we keep looking up account values after we go to the step needed.
              //this assumes we will not put two TXs with the same nonce value in the queue.
              break
            }
          }
        }
      }
}