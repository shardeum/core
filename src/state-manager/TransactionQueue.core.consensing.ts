import { logFlags } from '../logger'
import { shardusGetTime } from '../network'
import { config as configContext } from '../p2p/Context'
import * as utils from '../utils'
import { nestedCountersInstance } from '../utils/nestedCounters'
import {
  QueueEntry,
  SeenAccounts,
  SignedReceipt,
} from './state-manager-types'
import TransactionQueue from './TransactionQueue'

export async function handleConsensingState(
    this: TransactionQueue, 
    queueEntry: QueueEntry, 
    seenAccounts: SeenAccounts, 
    currentTime: number, 
    processStats: any,
    hasReceivedApplyReceipt: boolean,
    currentIndex: number,
    shortID: string,
    hasApplyReceipt: boolean,
    txAge: number,
    timeM5: number
) {
    /////////////////////////////////////////--consensing--//////////////////////////////////////////////////////////////////
    if (this.processQueue_accountSeen(seenAccounts, queueEntry) === false) {
        this.processQueue_markAccountsSeen(seenAccounts, queueEntry)

        let didNotMatchReceipt = false

        let finishedConsensing = false
        let result: SignedReceipt

        // if (this.usePOQo) {
        // Try to produce receipt
        // If receipt made, tellx128 it to execution group
        // that endpoint should then factTellCorrespondingNodesFinalData
        const receipt2 = queueEntry.receivedSignedReceipt ?? queueEntry.signedReceipt
        if (receipt2 != null) {
          if (logFlags.debug)
            this.mainLogger.debug(
              `processAcceptedTxQueue2 consensing : ${queueEntry.logID} receiptRcv:${hasReceivedApplyReceipt}`
            )
          nestedCountersInstance.countEvent(`consensus`, 'tryProduceReceipt receipt2 != null')
          //we have a receipt2, so we can make a receipt
          result = queueEntry.signedReceipt
        } else {
          result = await this.stateManager.transactionConsensus.tryProduceReceipt(queueEntry)
        }              

        /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`processAcceptedTxQueue2 tryProduceReceipt result : ${queueEntry.logID} ${utils.stringifyReduce(result)}`)

        //todo this is false.. and prevents some important stuff.
        //need to look at appliedReceipt2
        const signedReceipt = this.stateManager.getSignedReceipt(queueEntry)
        if (signedReceipt != null) {
          //TODO share receipt with corresponding index

          if (logFlags.debug || this.stateManager.consensusLog) {
            this.mainLogger.debug(
              `processAcceptedTxQueue2 tryProduceReceipt final result : ${
                queueEntry.logID
              } ${utils.stringifyReduce(result)}`
            )
          }

          const isReceiptMatchPreApply = this.stateManager.transactionConsensus.hasAppliedReceiptMatchingPreApply(
            queueEntry,
            result
          )
          if (logFlags.debug || this.stateManager.consensusLog) {
            this.mainLogger.debug(
              `processAcceptedTxQueue2 tryProduceReceipt isReceiptMatchPreApply : ${queueEntry.logID} ${isReceiptMatchPreApply}`
            )
          }                

          // not a challenge receipt but check the tx result
          if (isReceiptMatchPreApply && queueEntry.isInExecutionHome) {
            nestedCountersInstance.countEvent('consensus', 'hasAppliedReceiptMatchingPreApply: true')
            /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_consensingComplete_madeReceipt', `${shortID}`, `qId: ${queueEntry.entryID}  `)

            //todo check cant_apply flag to make sure a vote can form with it!
            //also check if failed votes will work...?
            if (
              this.stateManager.getReceiptProposal(queueEntry).cant_preApply === false &&
              this.stateManager.getReceiptResult(queueEntry) === true
            ) {
              this.updateTxState(queueEntry, 'commiting')
              queueEntry.hasValidFinalData = true
              finishedConsensing = true
            } else {
              /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_consensingComplete_finishedFailReceipt1', `${shortID}`, `qId: ${queueEntry.entryID}  `)
              // we are finished since there is nothing to apply
              if (logFlags.debug || this.stateManager.consensusLog) {
                /* prettier-ignore */ this.mainLogger.debug(`processAcceptedTxQueue2 tryProduceReceipt failed result: false : ${queueEntry.logID} ${utils.stringifyReduce(result)}`)
                /* prettier-ignore */ this.statemanager_fatal(`processAcceptedTxQueue2`, `tryProduceReceipt failed result: false : ${queueEntry.logID} ${utils.stringifyReduce(result)}`)
              }
              nestedCountersInstance.countEvent(
                'consensus',
                'tryProduceReceipt failed result = false or' + ' challenged'
              )
              this.updateTxState(queueEntry, 'fail')
              this.removeFromQueue(queueEntry, currentIndex)
              return
            }

            if (
              queueEntry.globalModification === false &&
              finishedConsensing === true &&
              this.executeInOneShard &&
              queueEntry.isInExecutionHome
            ) {
              //forward all finished data to corresponding nodes
              const awaitStart = shardusGetTime()
              // This is an async function but we do not await it
              if (configContext.stateManager.attachDataToReceipt === false) {
                if (configContext.p2p.useFactCorrespondingTell) {
                  this.factTellCorrespondingNodesFinalData(queueEntry)
                }
                // else {
                //   this.tellCorrespondingNodesFinalData(queueEntry)
                // }
              }
              this.updateSimpleStatsObject(
                processStats.awaitStats,
                'tellCorrespondingNodesFinalData',
                shardusGetTime() - awaitStart
              )
            }
            //continue
          } else {
            nestedCountersInstance.countEvent(
              'consensus',
              `hasAppliedReceiptMatchingPreApply: false, isInExecutionHome: ${queueEntry.isInExecutionHome}`
            )
            /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_consensingComplete_gotReceiptNoMatch1', `${shortID}`, `qId: ${queueEntry.entryID}  `)
            if (this.stateManager.getReceiptResult(queueEntry) === false) {
              // We got a reciept, but the consensus is that this TX was not applied.
              /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_consensingComplete_finishedFailReceipt2', `${shortID}`, `qId: ${queueEntry.entryID}  `)
              // we are finished since there is nothing to apply
              /* prettier-ignore */ if (logFlags.verbose) this.statemanager_fatal(
                `consensing: on a failed receipt`,
                `consensing: got a failed receipt for ` +
                  `txid: ${shortID} state: ${queueEntry.state} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} age:${txAge}`
              )
              if (logFlags.debug || this.stateManager.consensusLog) {
                /* prettier-ignore */ this.mainLogger.debug(`processAcceptedTxQueue2 tryProduceReceipt failed result: false : ${queueEntry.logID} ${utils.stringifyReduce(result)}`)
                /* prettier-ignore */ this.statemanager_fatal(`processAcceptedTxQueue2`, `tryProduceReceipt failed result: false : ${queueEntry.logID} ${utils.stringifyReduce(result)}`)
              }
              nestedCountersInstance.countEvent('consensus', 'consensed on failed result')
              this.updateTxState(queueEntry, 'fail')
              this.removeFromQueue(queueEntry, currentIndex)
              return
            }
            didNotMatchReceipt = true
            queueEntry.signedReceiptForRepair = result

            // queueEntry.appliedReceiptForRepair2 = this.stateManager.getReceipt2(queueEntry)
            if (queueEntry.isInExecutionHome === false && queueEntry.signedReceipt != null) {
              if (this.stateManager.consensusLog)
                this.mainLogger.debug(
                  `processTransactions ${queueEntry.logID} we are not execution home, but we have a receipt2, go to await final data`
                )
              this.updateTxState(queueEntry, 'await final data', 'processTx7')
            }
          }
        }
        if (finishedConsensing === false) {
          // if we got a reciept while waiting see if we should use it (if our own vote matches)
          if (hasReceivedApplyReceipt && queueEntry.receivedSignedReceipt != null) {
            if (
              this.stateManager.transactionConsensus.hasAppliedReceiptMatchingPreApply(
                queueEntry,
                queueEntry.receivedSignedReceipt
              )
            ) {
              /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_consensingComplete_gotReceipt', `${shortID}`, `qId: ${queueEntry.entryID} `)

              //todo check cant_apply flag to make sure a vote can form with it!
              if (
                this.stateManager.getReceiptProposal(queueEntry).cant_preApply === false &&
                this.stateManager.getReceiptResult(queueEntry) === true
              ) {
                this.updateTxState(queueEntry, 'commiting')
                queueEntry.hasValidFinalData = true
                finishedConsensing = true
              } else {
                /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_consensingComplete_finishedFailReceipt2', `${shortID}`, `qId: ${queueEntry.entryID}  `)
                // we are finished since there is nothing to apply
                //this.statemanager_fatal(`consensing: repairToMatchReceipt failed`, `consensing: repairToMatchReceipt failed ` + `txid: ${shortID} state: ${queueEntry.state} applyReceipt:${hasApplyReceipt} recievedAppliedReceipt:${hasReceivedApplyReceipt} age:${txAge}`)
                this.removeFromQueue(queueEntry, currentIndex)
                this.updateTxState(queueEntry, 'fail')
                return
              }

              //continue
            } else {
              /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_consensingComplete_gotReceiptNoMatch2', `${shortID}`, `qId: ${queueEntry.entryID}  `)
              didNotMatchReceipt = true
              queueEntry.signedReceiptForRepair = queueEntry.receivedSignedReceipt

              // queueEntry.appliedReceiptForRepair2 = this.stateManager.getReceipt2(queueEntry)
              queueEntry.signedReceiptForRepair = this.stateManager.getSignedReceipt(queueEntry)
            }
          } else {
            //just keep waiting for a reciept
            if (this.config.p2p.stuckNGTInQueueFix && queueEntry.isNGT && txAge > timeM5) {
              // entry is an NGT so we want to remove it if consensing fails to prevent from getting stuck
              nestedCountersInstance.countEvent(`consensus`, 'removing NGT from queue after failed consensing')
              this.updateTxState(queueEntry, 'fail')
              this.removeFromQueue(queueEntry, currentIndex)
              this.processQueue_clearAccountsSeen(seenAccounts, queueEntry)
              return
            }
          }

          // we got a receipt but did not match it.
          if (didNotMatchReceipt === true && queueEntry.isInExecutionHome) {
            nestedCountersInstance.countEvent('stateManager', 'didNotMatchReceipt')
            if (queueEntry.debugFail_failNoRepair) {
              this.updateTxState(queueEntry, 'fail')
              this.removeFromQueue(queueEntry, currentIndex)
              nestedCountersInstance.countEvent('stateManager', 'debugFail_failNoRepair')
              this.statemanager_fatal(
                `processAcceptedTxQueue_debugFail_failNoRepair2`,
                `processAcceptedTxQueue_debugFail_failNoRepair2 tx: ${shortID} cycle:${
                  queueEntry.cycleToRecordOn
                }  accountkeys: ${utils.stringifyReduce(queueEntry.uniqueWritableKeys)}`
              )
              this.processQueue_clearAccountsSeen(seenAccounts, queueEntry)
              return
            }

            /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_consensingComplete_didNotMatchReceipt', `${shortID}`, `qId: ${queueEntry.entryID} result:${queueEntry.signedReceiptForRepair.proposal.applied} `)
            queueEntry.repairFinished = false
            if (queueEntry.signedReceiptForRepair.proposal.applied === true) {
              // need to start repair process and wait
              //await note: it is best to not await this.  it should be an async operation.
              if (
                configContext.stateManager.noRepairIfDataAttached &&
                configContext.stateManager.attachDataToReceipt
              ) {
                // we have received the final data, so we can just go to "await final data" and commit the accounts
                this.updateTxState(queueEntry, 'await final data')
              } else {
                this.stateManager.getTxRepair().repairToMatchReceipt(queueEntry)
                this.updateTxState(queueEntry, 'await repair')
              }
              return
            } else {
              // We got a reciept, but the consensus is that this TX was not applied.
              /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_consensingComplete_finishedFailReceipt3', `${shortID}`, `qId: ${queueEntry.entryID}  `)
              // we are finished since there is nothing to apply
              this.statemanager_fatal(
                `consensing: repairToMatchReceipt failed`,
                `consensing: repairToMatchReceipt failed ` +
                  `txid: ${shortID} state: ${queueEntry.state} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} age:${txAge}`
              )
              this.removeFromQueue(queueEntry, currentIndex)
              this.updateTxState(queueEntry, 'fail')
              return
            }
          }
        }
      } else {
        nestedCountersInstance.countEvent('consensus', 'busy waiting')
      }
      this.processQueue_markAccountsSeen(seenAccounts, queueEntry)
}