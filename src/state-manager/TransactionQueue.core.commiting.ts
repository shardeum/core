import { logFlags } from '../logger'
import { shardusGetTime } from '../network'
import { config as configContext } from '../p2p/Context'
import * as utils from '../utils'
import { nestedCountersInstance } from '../utils/nestedCounters'
import {
  QueueEntry,
  SeenAccounts,
} from './state-manager-types'
import TransactionQueue, { DebugComplete } from './TransactionQueue'

export async function handleCommitingState(
    this: TransactionQueue, 
    queueEntry: QueueEntry, 
    currentIndex: number, 
    seenAccounts: SeenAccounts, 
    currentTime: number, 
    processStats: any,
    shortID: string,
    localRestartCounter: number,
    app: any
) {
///////////////////////////////////////////--commiting--////////////////////////////////////////////////////////////////
if (this.processQueue_accountSeen(seenAccounts, queueEntry) === false) {
    this.processQueue_markAccountsSeen(seenAccounts, queueEntry)

    // TODO STATESHARDING4 Check if we have already commited the data from a receipt we saw earlier
    /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`processAcceptedTxQueue2 commiting : ${queueEntry.logID} `)
    /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_commitingTx', `${shortID}`, `qId: ${queueEntry.entryID} qRst:${localRestartCounter} values: ${this.processQueue_debugAccountData(queueEntry, app)} AcceptedTransaction: ${utils.stringifyReduce(queueEntry.acceptedTx)}`)

    // /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug( ` processAcceptedTxQueue2. ${queueEntry.entryID} timestamp: ${queueEntry.txKeys.timestamp}`)              

    if (queueEntry.debugFail_failNoRepair) {
      this.updateTxState(queueEntry, 'fail')
      this.removeFromQueue(queueEntry, currentIndex)
      nestedCountersInstance.countEvent('stateManager', 'debugFail_failNoRepair')
      this.statemanager_fatal(
        `processAcceptedTxQueue_debugFail_failNoRepair`,
        `processAcceptedTxQueue_debugFail_failNoRepair tx: ${shortID} cycle:${
          queueEntry.cycleToRecordOn
        }  accountkeys: ${utils.stringifyReduce(queueEntry.uniqueWritableKeys)}`
      )
      this.processQueue_clearAccountsSeen(seenAccounts, queueEntry)
      return
    }

    const wrappedStates = queueEntry.collectedData // Object.values(queueEntry.collectedData)

    try {
      let canCommitTX = true
      let hasReceiptFail = false
      if (queueEntry.noConsensus === true) {
        // dont have a receipt for a non consensus TX. not even sure if we want to keep that!
        if (queueEntry.preApplyTXResult.passed === false) {
          canCommitTX = false
        }
      } else if (queueEntry.signedReceipt != null) {
        // the final state of the queue entry will be pass or fail based on the receipt
        if (queueEntry.signedReceipt.proposal.applied === false) {
          canCommitTX = false
          hasReceiptFail = true
        }
      } else if (queueEntry.receivedSignedReceipt != null) {
        // the final state of the queue entry will be pass or fail based on the receipt
        if (queueEntry.receivedSignedReceipt.proposal.applied === false) {
          canCommitTX = false
          if (configContext.stateManager.receiptRemoveFix) {
            hasReceiptFail = true
          } else {
            hasReceiptFail = false
          }
        }
      } else {
        canCommitTX = false
      }

      nestedCountersInstance.countEvent(
        'stateManager',
        `canCommitTX: ${canCommitTX}, hasReceiptFail: ${hasReceiptFail}`
      )

      /* prettier-ignore */ if (logFlags.verbose) if (logFlags.debug) this.mainLogger.debug('shrd_commitingTx', `${shortID}`, `canCommitTX: ${canCommitTX}, hasReceiptFail: ${hasReceiptFail}`)
      /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_commitingTx', `${shortID}`, `canCommitTX: ${canCommitTX} `)
      if (canCommitTX) {
        // this.mainLogger.debug(` processAcceptedTxQueue2. applyAcceptedTransaction ${queueEntry.entryID} timestamp: ${queueEntry.txKeys.timestamp} queuerestarts: ${localRestartCounter} queueLen: ${this.newAcceptedTxQueue.length}`)

        // Need to go back and thing on how this was supposed to work:
        //queueEntry.acceptedTx.transactionGroup = queueEntry.transactionGroup // Used to not double count txProcessed

        //try {
        this.profiler.profileSectionStart('commit')

        const awaitStart = shardusGetTime()
        /* prettier-ignore */ this.setDebugLastAwaitedCall( 'this.stateManager.transactionConsensus.commitConsensedTransaction()' )
        await this.commitConsensedTransaction(queueEntry)
        /* prettier-ignore */ this.setDebugLastAwaitedCall( 'this.stateManager.transactionConsensus.commitConsensedTransaction()', DebugComplete.Completed )
        this.updateSimpleStatsObject(
          processStats.awaitStats,
          'commitConsensedTransaction',
          shardusGetTime() - awaitStart
        )

        if (queueEntry.repairFinished) {
          // saw a TODO comment above and befor I axe it want to confirm what is happening after we repair a receipt.
          // shouldn't get here putting this in to catch if we do
          this.statemanager_fatal(`processAcceptedTxQueue_commitingRepairedReceipt`, `${shortID} `)
          nestedCountersInstance.countEvent('processing', 'commiting a repaired TX...')
        }

        nestedCountersInstance.countEvent('stateManager', 'committed tx')
        if (queueEntry.hasValidFinalData === false) {
          nestedCountersInstance.countEvent('stateManager', 'commit state fix FinalDataFlag')
          queueEntry.hasValidFinalData = true
        }

        //} finally {
        this.profiler.profileSectionEnd('commit')
        //}
      }
      if (logFlags.verbose)
        console.log('commit commit', queueEntry.acceptedTx.txId, queueEntry.acceptedTx.timestamp)
      if (this.config.p2p.experimentalSnapshot) this.addReceiptToForward(queueEntry, 'commit')

      if (hasReceiptFail) {
        // endpoint to allow dapp to execute something that depends on a transaction failing

        const applyReponse = queueEntry.preApplyTXResult.applyResponse // TODO STATESHARDING4 ... if we get here from a non standard path may need to get this data from somewhere else

        this.app.transactionReceiptFail(queueEntry.acceptedTx.data, wrappedStates, applyReponse)
      }
    } catch (ex) {
      /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug('processAcceptedTxQueue2 commiting Transaction:' + ex.name + ': ' + ex.message + ' at ' + ex.stack)
      this.statemanager_fatal(
        `processAcceptedTxQueue2b_ex`,
        'processAcceptedTxQueue2 commiting Transaction:' + ex.name + ': ' + ex.message + ' at ' + ex.stack
      )
    } finally {
      this.processQueue_clearAccountsSeen(seenAccounts, queueEntry)

      if (queueEntry.noConsensus === true) {
        // dont have a receipt for a non consensus TX. not even sure if we want to keep that!
        if (queueEntry.preApplyTXResult.passed === true) {
          this.updateTxState(queueEntry, 'pass')
        } else {
          this.updateTxState(queueEntry, 'fail')
        }
        /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`processAcceptedTxQueue2 commiting finished : noConsensus:${queueEntry.state} ${queueEntry.logID} `)
      } else if (queueEntry.signedReceipt != null) {
        // the final state of the queue entry will be pass or fail based on the receipt
        if (queueEntry.signedReceipt.proposal.applied === true) {
          this.updateTxState(queueEntry, 'pass')
        } else {
          this.updateTxState(queueEntry, 'fail')
        }
        /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`processAcceptedTxQueue2 commiting finished : Recpt:${queueEntry.state} ${queueEntry.logID} `)
      } else if (queueEntry.receivedSignedReceipt != null) {
        // the final state of the queue entry will be pass or fail based on the receipt
        if (queueEntry.receivedSignedReceipt.proposal.applied === true) {
          this.updateTxState(queueEntry, 'pass')
        } else {
          this.updateTxState(queueEntry, 'fail')
        }
        /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`processAcceptedTxQueue2 commiting finished : recvRecpt:${queueEntry.state} ${queueEntry.logID} `)
      } else {
        this.updateTxState(queueEntry, 'fail')
        /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`processAcceptedTxQueue2 commiting finished : no receipt ${queueEntry.logID} `)
      }

      /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_commitingTxFinished', `${queueEntry.acceptedTx.txId}`, `qId: ${queueEntry.entryID} qRst:${localRestartCounter} values: ${this.processQueue_debugAccountData(queueEntry, app)} AcceptedTransaction: ${utils.stringifyReduce(queueEntry.acceptedTx)}`)

      //moved to end of finally because this does some compacting on the queue entry
      this.removeFromQueue(queueEntry, currentIndex)
    }
  }
}