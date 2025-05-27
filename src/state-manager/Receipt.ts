import {
  QueueEntry,
  SignedReceipt,
  Proposal,
  AppliedReceipt,
} from './state-manager-types'
import { ReceiptMapResult } from '@shardeum-foundation/lib-types/build/src/state-manager/StateManagerTypes'
import { logFlags } from '../logger'
import * as utils from '../utils'
import { nestedCountersInstance } from '../utils/nestedCounters'
import * as ShardusTypes from '../shardus/shardus-types'
import * as StateManagerTypes from './state-manager-types'

/***
   *    ########  ########  ######  ######## #### ########  ########  ######
   *    ##     ## ##       ##    ## ##        ##  ##     ##    ##    ##    ##
   *    ##     ## ##       ##       ##        ##  ##     ##    ##    ##
   *    ########  ######   ##       ######    ##  ########     ##     ######
   *    ##   ##   ##       ##       ##        ##  ##           ##          ##
   *    ##    ##  ##       ##    ## ##        ##  ##           ##    ##    ##
   *    ##     ## ########  ######  ######## #### ##           ##     ######
   */

export const receiptMethods = {
  getSignedReceipt(queueEntry: QueueEntry): SignedReceipt {
    if (queueEntry.signedReceiptFinal != null) {
      return queueEntry.signedReceiptFinal
    }
    let finalReceipt: SignedReceipt
    if (queueEntry.signedReceipt && queueEntry.receivedSignedReceipt == null) {
      finalReceipt = queueEntry.signedReceipt
    }
    if (queueEntry.signedReceipt == null && queueEntry.receivedSignedReceipt) {
      // or see if we got one
      finalReceipt = queueEntry.receivedSignedReceipt
    }
    // if we had to repair use that instead. this stomps the other ones
    if (queueEntry.signedReceiptForRepair != null) {
      finalReceipt = queueEntry.signedReceiptForRepair
    }
    queueEntry.signedReceiptFinal = finalReceipt
    return finalReceipt
  },

  hasReceipt(queueEntry: QueueEntry) {
    return this.getSignedReceipt(queueEntry) != null
  },
  getReceiptResult(queueEntry: QueueEntry) {
    const receipt = this.getSignedReceipt(queueEntry)
    if (receipt) {
      return receipt.proposal.applied
    }
    return false
  },

  getReceiptProposal(queueEntry: QueueEntry): Proposal {
    const receipt = this.getSignedReceipt(queueEntry)
    if (receipt) {
      return receipt.proposal
    }
  },

  generateReceiptMapResults(lastCycle: ShardusTypes.Cycle): ReceiptMapResult[] {
    const results: ReceiptMapResult[] = []

    const cycleToSave = lastCycle.counter

    //init results per partition
    const receiptMapByPartition: Map<number, ReceiptMapResult> = new Map()
    for (let i = 0; i < this.currentCycleShardData.shardGlobals.numPartitions; i++) {
      const mapResult: ReceiptMapResult = {
        cycle: cycleToSave,
        partition: i,
        receiptMap: {},
        txCount: 0,
        txsMap: {},
        txsMapEVMReceipt: {},
      }
      receiptMapByPartition.set(i, mapResult)
      // add to the list we will return
      results.push(mapResult)
    }

    // todo add to ReceiptMapResult in shardus types
    // txsMap: {[id:string]:WrappedResponse[]};
    // txsMapEVMReceipt: {[id:string]:unknown[]};

    const queueEntriesToSave: QueueEntry[] = []
    for (const queueEntry of this.transactionQueue._transactionQueue) {
      if (queueEntry.cycleToRecordOn === cycleToSave) {
        // make sure we have a receipt
        const receipt: SignedReceipt = this.getSignedReceipt(queueEntry)

        if (receipt == null) {
          //check  && queueEntry.globalModification === false because global accounts will not get a receipt, should this change?
          /* prettier-ignore */ if(logFlags.error && queueEntry.globalModification === false) this.mainLogger.error(`generateReceiptMapResults found entry in with no receipt in newAcceptedTxQueue. ${utils.stringifyReduce(queueEntry.acceptedTx)}`)
        } else {
          queueEntriesToSave.push(queueEntry)
        }
      }
    }

    // I am worried that archiveQueueEntries being capped to 5k could cause a reciept breakdown
    // if cycle times are long enough to have more than 5000 txs on a node.
    // I think we should maybe be working on these as we go rather than processing them in a batch.

    for (const queueEntry of this.transactionQueue.archivedQueueEntries) {
      if (queueEntry.cycleToRecordOn === cycleToSave) {
        // make sure we have a receipt
        const receipt: SignedReceipt = this.getSignedReceipt(queueEntry)

        if (receipt == null) {
          //check  && queueEntry.globalModification === false
          //we dont expect expired TXs to have a receipt.  this should reduce log spam
          if (queueEntry.state != 'expired') {
            /* prettier-ignore */ if(logFlags.error && queueEntry.globalModification === false) this.mainLogger.error(`generateReceiptMapResults found entry in with no receipt in archivedQueueEntries. ${utils.stringifyReduce(queueEntry.acceptedTx)} state:${queueEntry.state}`)
          }
        } else {
          queueEntriesToSave.push(queueEntry)
        }
      }
    }

    const netId = '123abc'
    //go over the save list..
    for (const queueEntry of queueEntriesToSave) {
      const accountData: ShardusTypes.WrappedResponse[] = queueEntry?.preApplyTXResult?.applyResponse?.accountData
      if (accountData == null) {
        /* prettier-ignore */ nestedCountersInstance.countRareEvent('generateReceiptMapResults' , `accountData==null tests: ${queueEntry?.preApplyTXResult == null} ${queueEntry?.preApplyTXResult?.applyResponse == null} ${queueEntry?.preApplyTXResult?.applyResponse?.accountData == null}` )
      }
      // delete the localCache
      if (accountData != null) {
        for (const account of accountData) {
          delete account.localCache
        }
      }
      // console.log('accountData accountData', accountData)
      for (const partition of queueEntry.involvedPartitions) {
        const receipt: SignedReceipt = this.getSignedReceipt(queueEntry)

        const status = receipt.proposal.applied === true ? 'applied' : 'rejected'
        const txHash = queueEntry.acceptedTx.txId
        const obj = { tx: queueEntry.acceptedTx.data, status, netId }
        const txResultFullHash = this.crypto.hash(obj)
        const txIdShort = utils.short(txHash)
        const txResult = utils.short(txResultFullHash)

        /* eslint-disable security/detect-object-injection */
        if (receiptMapByPartition.has(partition)) {
          const mapResult: ReceiptMapResult = receiptMapByPartition.get(partition)
          //create an array if we have not seen this index yet
          if (mapResult.receiptMap[txIdShort] == null) {
            mapResult.receiptMap[txIdShort] = []
          }

          // TODO: too much data duplication to put accounts and receitps in mapResult
          // They get duplicated per involved partition currently.
          // They should be in a separate list I think..

          let gotAppReceipt = false
          //set receipt data.  todo get evmReceiptForTX from receipt.
          if (receipt.proposal.appReceiptDataHash != null && receipt.proposal.appReceiptDataHash != '') {
            const applyResponse = queueEntry?.preApplyTXResult?.applyResponse
            // we may not always have appReceiptData... especially in execute in local shard
            if (applyResponse && applyResponse.appReceiptDataHash === receipt.proposal.appReceiptDataHash) {
              mapResult.txsMapEVMReceipt[txIdShort] = applyResponse.appReceiptData
              gotAppReceipt = true
            }
          }

          nestedCountersInstance.countEvent('stateManager', `gotAppReceipt:${gotAppReceipt}`)

          mapResult.txsMap[txIdShort] = accountData // For tx data to save in Explorer

          //push the result.  note the order is not deterministic unless we were to sort at the end.
          mapResult.receiptMap[txIdShort].push(txResult)
          mapResult.txCount++
        }
        /* eslint-enable security/detect-object-injection */
      }
    }

    return results
  }
}
