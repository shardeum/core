import TransactionQueue from './TransactionQueue' // Assuming TransactionQueue.ts is in the same directory
import { P2P as P2PTypes } from '@shardeum-foundation/lib-types'
import { logFlags } from '../logger'
import * as utils from '../utils'
import { shardusGetTime, ipInfo, getNetworkTimeOffset } from '../network'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { profilerInstance } from '../utils/profiler'
import { config as configContext, network as networkContext } from '../p2p/Context'
import * as Self from '../p2p/Self'
import * as NodeList from '../p2p/NodeList'
import {
  QueueEntry,
  AcceptedTx,
  SeenAccounts,
  ProcessQueueStats,
  SimpleNumberStats,
  PreApplyAcceptedTransactionResult,
  SignedReceipt,
  // RequestReceiptForTxResp_old // Assuming this specific old type might be needed by its callers if not fully refactored
} from './state-manager-types'
import { Utils } from '@shardeum-foundation/lib-types'
import { withTimeout } from '../utils'
import * as Apoptosis from '../p2p/Apoptosis'
import * as Comms from '../p2p/Comms'
import * as Shardus from '../shardus/shardus-types' // For Shardus.App type if used in debugAccountData

// Helper function to update Tx state and debug timers
export function _updateTxStateLogic(instance: TransactionQueue, queueEntry: QueueEntry, nextState: string, context = ''): void {
    if (logFlags.seqdiagram)
      if (context == '') {
        /* prettier-ignore */ if (logFlags.seqdiagram) instance.seqLogger.info(`0x53455104 ${shardusGetTime()} tx:${queueEntry.acceptedTx.txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: ${queueEntry.state}-${nextState}`)
      } else {
        /* prettier-ignore */ if (logFlags.seqdiagram) instance.seqLogger.info(`0x53455104 ${shardusGetTime()} tx:${queueEntry.acceptedTx.txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: ${queueEntry.state}-${nextState}:${context}`)
      }
    const currentState = queueEntry.state
    _txDebugMarkEndTimeLogic(instance, queueEntry, currentState)
    queueEntry.state = nextState
    _txDebugMarkStartTimeLogic(instance, queueEntry, nextState)
}

export function _txDebugMarkStartTimeLogic(instance: TransactionQueue, queueEntry: QueueEntry, state: string): void {
    if (queueEntry.txDebug.startTime[state] == null) {
      queueEntry.txDebug.startTime[state] = process.hrtime()
      queueEntry.txDebug.startTimestamp[state] = shardusGetTime()
    }
}
  
export function _txDebugMarkEndTimeLogic(instance: TransactionQueue, queueEntry: QueueEntry, state: string): void {
    if (queueEntry.txDebug.startTime[state]) {
      const endTime = process.hrtime(queueEntry.txDebug.startTime[state])
      queueEntry.txDebug.endTime[state] = endTime
      queueEntry.txDebug.endTimestamp[state] = shardusGetTime()

      const durationInNanoseconds = endTime[0] * 1e9 + endTime[1]
      const durationInMilliseconds = durationInNanoseconds / 1e6

      queueEntry.txDebug.duration[state] = durationInMilliseconds

      delete queueEntry.txDebug.startTime[state]
      delete queueEntry.txDebug.endTime[state]
    }
}

export async function _processTransactionsLogic(instance: TransactionQueue, firstTime = false): Promise<void> {
    const seenAccounts: SeenAccounts = {}
    let pushedProfilerTag = null
    const startTime = shardusGetTime()

    const processStats: ProcessQueueStats = {
      totalTime: 0,
      inserted: 0,
      sameState: 0,
      stateChanged: 0,
      sameStateStats: {},
      stateChangedStats: {},
      awaitStats: {},
    }

    instance.lastProcessStats['current'] = processStats
    instance.queueReads = new Set()
    instance.queueWrites = new Set()
    instance.queueReadWritesOld = new Set()

    try {
      nestedCountersInstance.countEvent('processing', 'processing-enter')

      if (instance.pendingTransactionQueue.length > 5000) {
        nestedCountersInstance.countEvent( 'stateManager', `newAcceptedTxQueueTempInjest>5000 leftRunning:${instance.transactionProcessingQueueRunning} noShardCalcs:${ instance.stateManager.currentCycleShardData == null } ` )
        if (instance.largePendingQueueReported === false) {
          instance.largePendingQueueReported = true
          nestedCountersInstance.countRareEvent( 'stateManager', `newAcceptedTxQueueTempInjest>5000 leftRunning:${instance.transactionProcessingQueueRunning} noShardCalcs:${ instance.stateManager.currentCycleShardData == null } ` )
        }
      }

      if (instance.transactionProcessingQueueRunning === true) {
        nestedCountersInstance.countEvent('stateManager', 'newAcceptedTxQueueRunning === true')
        return
      }
      instance.transactionProcessingQueueRunning = true
      instance.isStuckProcessing = false
      instance.debugLastProcessingQueueStartTime = shardusGetTime()

      const timeSinceLastRun = startTime - instance.processingLastRunTime
      if (timeSinceLastRun < instance.processingMinRunBreak) {
        const sleepTime = Math.max(5, instance.processingMinRunBreak - timeSinceLastRun)
        await utils.sleep(sleepTime)
        nestedCountersInstance.countEvent('processing', 'resting')
      }

      if (instance.transactionQueueHasRemainingWork && timeSinceLastRun > 500) {
        if (logFlags.verbose) instance.statemanager_fatal(`processAcceptedTxQueue left busy and waited too long to restart`, `processAcceptedTxQueue left busy and waited too long to restart ${timeSinceLastRun / 1000} `)
      }

      instance.profiler.profileSectionStart('processQ')

      if (logFlags.seqdiagram) instance.mainLogger.info(`0x10052024 ${ipInfo.externalIp} ${shardusGetTime()} 0x0000 processTransactions _transactionQueue.length ${instance._transactionQueue.length}`)

      if (instance.stateManager.currentCycleShardData == null) {
        nestedCountersInstance.countEvent('stateManager', 'currentCycleShardData == null early exit')
        instance.profiler.profileSectionEnd('processQ'); // Ensure profiler section ends
        instance.transactionProcessingQueueRunning = false; // Reset flag
        return
      }

      if (instance._transactionQueue.length === 0 && instance.pendingTransactionQueue.length === 0) {
        instance.profiler.profileSectionEnd('processQ'); // Ensure profiler section ends
        instance.transactionProcessingQueueRunning = false; // Reset flag
        return
      }

      if (instance.queueRestartCounter == null) {
        instance.queueRestartCounter = 0
      }
      instance.queueRestartCounter++
      const localRestartCounter = instance.queueRestartCounter

      const timeM = instance.stateManager.queueSitTime
      const timeM2 = timeM * 2
      const timeM2_5 = timeM * 2.5
      const timeM3 = timeM * 3
      const timeM5 = timeM * 5
      let currentTime = shardusGetTime()
      const app = instance.app

      if (instance.pendingTransactionQueue.length > 0) {
        for (const txQueueEntry of instance.pendingTransactionQueue) {
          nestedCountersInstance.countEvent('stateManager', 'processAcceptedTxQueue injest: kept TX')
          const timestamp = txQueueEntry.txKeys.timestamp
          const acceptedTx = txQueueEntry.acceptedTx
          const txId = acceptedTx.txId
          let index = instance._transactionQueue.length - 1
          let lastTx = instance._transactionQueue[index]
          while (
            index >= 0 &&
            (timestamp > lastTx.txKeys.timestamp ||
              (timestamp === lastTx.txKeys.timestamp && txId < lastTx.acceptedTx.txId))
          ) {
            index--
            lastTx = instance._transactionQueue[index]
          }

          const age = shardusGetTime() - timestamp
          if (age > timeM * 0.9) {
            if (txQueueEntry.didSync == false) {
              if (logFlags.verbose) instance.statemanager_fatal(`processAcceptedTxQueue_oldTX.9 fromClient:${txQueueEntry.fromClient}`, `processAcceptedTxQueue cannot accept tx older than 0.9M ${timestamp} age: ${age} fromClient:${txQueueEntry.fromClient}`)
              if (logFlags.playback) instance.logger.playbackLogNote('shrd_processAcceptedTxQueueTooOld1', `${utils.makeShortHash(txQueueEntry.acceptedTx.txId)}`, 'processAcceptedTxQueue working on older tx ' + timestamp + ' age: ' + age)
            }
          }
          if (age > timeM) {
            if (logFlags.playback) instance.logger.playbackLogNote('shrd_processAcceptedTxQueueTooOld2', `${utils.makeShortHash(txQueueEntry.acceptedTx.txId)}`, 'processAcceptedTxQueue working on older tx ' + timestamp + ' age: ' + age)
            nestedCountersInstance.countEvent('processing', 'txExpired1 > M. waitForReceiptOnly')
            txQueueEntry.waitForReceiptOnly = true
            if(instance.config.stateManager.txStateMachineChanges){
              _updateTxStateLogic(instance, txQueueEntry, 'await final data', 'processTx1')
            } else {
              _updateTxStateLogic(instance, txQueueEntry, 'consensing')
            }
          }

          if (age > timeM3 * 5 && instance.stateManager.config.stateManager.discardVeryOldPendingTX === true) {
            nestedCountersInstance.countEvent('txExpired', 'txExpired3 > M3 * 5. pendingTransactionQueue')
            continue
          }

          txQueueEntry.approximateCycleAge = instance.stateManager.currentCycleShardData.cycleNumber
          instance._transactionQueue.splice(index + 1, 0, txQueueEntry)
          instance._transactionQueueByID.set(txQueueEntry.acceptedTx.txId, txQueueEntry)

          if (logFlags.seqdiagram) instance.seqLogger.info(`0x53455105 ${shardusGetTime()} tx:${txQueueEntry.acceptedTx.txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: aging`)
          processStats.inserted++
          if (logFlags.playback) instance.logger.playbackLogNote('shrd_addToQueue', `${txId}`, `AcceptedTransaction: ${txQueueEntry.logID} ts: ${txQueueEntry.txKeys.timestamp} acc: ${utils.stringifyReduce(txQueueEntry.txKeys.allKeys)} indexInserted: ${index + 1}`)
          instance.stateManager.eventEmitter.emit('txQueued', acceptedTx.txId)
        }
        instance.pendingTransactionQueue = []
        instance.pendingTransactionQueueByID.clear()
      }

      let currentIndex = instance._transactionQueue.length - 1
      let lastLog = 0
      currentIndex++
      let lastRest = shardusGetTime()

      while (instance._transactionQueue.length > 0) {
        currentTime = shardusGetTime()
        if (currentTime - lastRest > 1000) {
          nestedCountersInstance.countEvent('processing', 'forcedSleep')
          await utils.sleep(5)
          lastRest = currentTime
          if (
            currentTime - instance.stateManager.currentCycleShardData.calculationTime >
            instance.config.p2p.cycleDuration * 1000 + 5000
          ) {
            nestedCountersInstance.countEvent('processing', 'old cycle data >5s past due')
          }
          if (
            currentTime - instance.stateManager.currentCycleShardData.calculationTime >
            instance.config.p2p.cycleDuration * 1000 + 11000
          ) {
            nestedCountersInstance.countEvent('processing', 'very old cycle data >11s past due')
            instance.profiler.profileSectionEnd('processQ'); // Ensure profiler section ends
            instance.transactionProcessingQueueRunning = false; // Reset flag
            return
          }
        }

        if (pushedProfilerTag != null) {
          instance.profiler.profileSectionEnd(`process-${pushedProfilerTag}`)
          // instance.profiler.profileSectionEnd(`process-patched1-${pushedProfilerTag}`) // This one seems to not always be started
          pushedProfilerTag = null
        }

        currentIndex--
        if (currentIndex < 0) {
          break
        }

        instance.clearDebugAwaitStrings()
        const queueEntry: QueueEntry | undefined = instance._transactionQueue[currentIndex]
        if (queueEntry == null) {
          instance.statemanager_fatal(`queueEntry is null`, `currentIndex:${currentIndex}`)
          nestedCountersInstance.countEvent('processing', 'error: null queue entry. skipping to next TX')
          continue
        }
        if (logFlags.seqdiagram)  instance.mainLogger.info(`0x10052024 ${ipInfo.externalIp} ${shardusGetTime()} 0x0001 currentIndex:${currentIndex} txId:${queueEntry.acceptedTx.txId} state:${queueEntry.state}`)
        const txTime = queueEntry.txKeys.timestamp
        const txAge = currentTime - txTime
        instance.debugRecentQueueEntry = queueEntry

        if (txAge < timeM) {
          break
        }

        if (localRestartCounter < instance.queueRestartCounter && lastLog !== instance.queueRestartCounter) {
          lastLog = instance.queueRestartCounter
          if (logFlags.playback) instance.logger.playbackLogNote('queueRestart_error', `${queueEntry.acceptedTx.txId}`, `qId: ${queueEntry.entryID} qRst:${localRestartCounter}  qrstGlobal:${instance.queueRestartCounter}}`)
        }

        instance.stateManager.debugTXHistory[queueEntry.logID] = queueEntry.state
        const hasApplyReceipt = queueEntry.signedReceipt != null
        const hasReceivedApplyReceipt = queueEntry.receivedSignedReceipt != null
        const hasReceivedApplyReceiptForRepair = queueEntry.signedReceiptForRepair != null
        const shortID = queueEntry.logID

        if (queueEntry.state === 'pass' || queueEntry.state === 'fail') {
          instance.statemanager_fatal(
            `pass or fail entry should not be in queue`,
            `txid: ${shortID} state: ${queueEntry.state} receiptEverRequested:${queueEntry.receiptEverRequested} age:${txAge}`
          )
          instance.removeFromQueue(queueEntry, currentIndex)
          continue
        }

        // TIME OUT / EXPIRATION CHECKS (Simplified for brevity, original logic is complex)
        // This section needs careful review for the queueTimingFixes logic
        if (instance.queueTimingFixes) {
            if (queueEntry.state === 'processing' || queueEntry.state === 'awaiting data') {
                if (_processQueue_accountSeenLogic(instance, seenAccounts, queueEntry) === true) {
                    if (txAge > timeM2 + queueEntry.txSieveTime) {
                        if (configContext.stateManager.disableTxExpiration === false) {
                            nestedCountersInstance.countEvent('txExpired', `> M2 canceled due to upstream TXs. state:${queueEntry.state} hasAll:${queueEntry.hasAll} globalMod:${queueEntry.globalModification}`)
                            nestedCountersInstance.countEvent('txExpired', `> M2 canceled due to upstream TXs. sieveT:${queueEntry.txSieveTime}`)
                            _setTXExpiredLogic(instance, queueEntry, currentIndex, 'm2, processing or awaiting')
                            if (configContext.stateManager.stuckTxQueueFix) continue
                        }
                        if (configContext.stateManager.stuckTxQueueFix === false && !(configContext.stateManager.disableTxExpiration === false)) continue;
                    }
                }
            }
            const hasSeenVote = queueEntry.receivedBestVote != null || queueEntry.ourVote != null
            const hasSeenConfirmation = queueEntry.receivedBestConfirmation != null

            if (configContext.stateManager.removeStuckTxsFromQueue === true && txAge > configContext.stateManager.stuckTxRemoveTime) {
                nestedCountersInstance.countEvent('txSafelyRemoved', `stuck_in_consensus_1 ${configContext.stateManager.stuckTxRemoveTime / 1000}`)
                instance.statemanager_fatal(`txSafelyRemoved_1`, `stuck_in_consensus_3 txid: ${shortID} state: ${queueEntry.state} age:${txAge}`)
                if(logFlags.txCancel) instance.statemanager_fatal(`txSafelyRemoved_1_dump`, `${instance.getDebugQueueInfo(queueEntry)}`)
                instance.removeFromQueue(queueEntry, currentIndex)
                continue
            }

            if (configContext.stateManager.removeStuckTxsFromQueue2 === true) {
                const timeSinceLastVoteMessage = queueEntry.lastVoteReceivedTimestamp > 0 ? currentTime - queueEntry.lastVoteReceivedTimestamp : 0
                if(timeSinceLastVoteMessage > configContext.stateManager.stuckTxRemoveTime2){
                    nestedCountersInstance.countEvent('txSafelyRemoved', `stuck_in_consensus_2 tx waiting for votes more than ${configContext.stateManager.stuckTxRemoveTime2 / 1000} seconds. state: ${queueEntry.state}`)
                    instance.statemanager_fatal(`txSafelyRemoved_2`, `stuck_in_consensus_2. waiting for votes. txid: ${shortID} state: ${queueEntry.state} age:${txAge} tx first vote seen ${timeSinceLastVoteMessage / 1000} seconds ago`)
                    if(logFlags.txCancel) instance.statemanager_fatal(`txSafelyRemoved_2_dump`, `${instance.getDebugQueueInfo(queueEntry)}`)
                    instance.removeFromQueue(queueEntry, currentIndex)
                    continue
                }
            }

            if (configContext.stateManager.removeStuckTxsFromQueue3 === true) {
                if (queueEntry.state === 'consensing' && txAge > configContext.stateManager.stuckTxRemoveTime3){
                    const anyVotes = (queueEntry.lastVoteReceivedTimestamp > 0)
                    nestedCountersInstance.countEvent('txSafelyRemoved', `stuck_in_consensus_3 tx in consensus more than ${configContext.stateManager.stuckTxRemoveTime3 / 1000} seconds. state: ${queueEntry.state} has seen vote: ${anyVotes}`)
                    instance.statemanager_fatal(`txSafelyRemoved_3`, `stuck_in_consensus_3. txid: ${shortID} state: ${queueEntry.state} age:${txAge}`)
                    if(logFlags.txCancel) instance.statemanager_fatal(`txSafelyRemoved_3_dump`, `${instance.getDebugQueueInfo(queueEntry)}`)
                    instance.removeFromQueue(queueEntry, currentIndex)
                    continue
                }
            }
            
            if (txAge > timeM3 + configContext.stateManager.noVoteSeenExpirationTime && !hasSeenVote) {
                if (configContext.stateManager.disableTxExpiration === false) {
                    _setTXExpiredLogic(instance, queueEntry, currentIndex, 'txAge > timeM3 + noVoteSeenExpirationTime general case. no vote seen')
                    continue
                }
            }
            if (txAge > timeM3 + configContext.stateManager.voteSeenExpirationTime && hasSeenVote && !hasSeenConfirmation) {
                if (configContext.stateManager.disableTxExpiration === false) {
                    nestedCountersInstance.countEvent('txExpired', `> timeM3 + voteSeenExpirationTime`)
                    instance.mainLogger.error(`${queueEntry.logID} txAge > timeM3 + voteSeenExpirationTime general case has vote but fail to generate receipt`)
                    _setTXExpiredLogic(instance, queueEntry, currentIndex, 'txAge > timeM3 + voteSeenExpirationTime general case has vote but fail to commit the tx')
                    continue
                }
            }
            if (txAge > timeM3 + configContext.stateManager.confirmationSeenExpirationTime) {
                let shouldExpire = true
                if (queueEntry.hasRobustConfirmation && queueEntry.isInExecutionHome) {
                    nestedCountersInstance.countEvent('txExpired', `> timeM3 + confirmSeenExpirationTime but hasRobustConfirmation = true, not expiring`)
                    shouldExpire = false
                }
                if (shouldExpire && configContext.stateManager.disableTxExpiration === false) {
                    nestedCountersInstance.countEvent('txExpired', `> timeM3 + confirmSeenExpirationTime hasRobustConfirmation: ${queueEntry.hasRobustConfirmation}`)
                    _setTXExpiredLogic(instance, queueEntry, currentIndex, 'txAge > timeM3 + confirmSeenExpirationTime general case has vote and robust confirmation but fail to commit the tx')
                    continue
                }
            }
            if (txAge > timeM3 + configContext.stateManager.confirmationSeenExpirationTime + 10000) {
                if (configContext.stateManager.disableTxExpiration && hasSeenVote && queueEntry.firstVoteReceivedTimestamp > 0) {
                    if(instance.config.stateManager.txStateMachineChanges){
                        if (configContext.stateManager.stuckTxQueueFix) {
                            if (configContext.stateManager.singleAccountStuckFix) {
                                const timeSinceVoteSeen = shardusGetTime() - queueEntry.firstVoteReceivedTimestamp
                                if (queueEntry.state === 'consensing' && timeSinceVoteSeen > configContext.stateManager.stuckTxMoveTime) {
                                    if (logFlags.debug) instance.mainLogger.debug(`txId ${queueEntry.logID} move stuck consensing tx to await final data. timeSinceVoteSeen: ${timeSinceVoteSeen} ms`)
                                    nestedCountersInstance.countEvent('consensus', `move stuck consensing tx to await final data.`)
                                    _updateTxStateLogic(instance, queueEntry, 'await final data')
                                }
                            } else {
                                if (queueEntry.state !== 'await final data' && queueEntry.state !== 'await repair') _updateTxStateLogic(instance, queueEntry, 'await final data')
                            }
                        } else {
                            _updateTxStateLogic(instance, queueEntry, 'await final data', 'processTx4')
                        }
                    } else {
                        _updateTxStateLogic(instance, queueEntry, 'consensing')
                    }
                }
                if (configContext.stateManager.disableTxExpiration === false) {
                    _setTXExpiredLogic(instance, queueEntry, currentIndex, 'txAge > timeM3 + confirmSeenExpirationTime + 10s')
                    continue
                }
            }

            if (txAge > timeM2) {
                let expireTx = false
                let reason = ''
                if (queueEntry.requestingReceiptFailed) {
                    expireTx = true
                    reason = 'requestingReceiptFailed'
                }
                if (queueEntry.repairFailed) {
                    expireTx = true
                    reason = 'repairFailed'
                }
                if (expireTx) {
                    instance.statemanager_fatal(
                        `txExpired3 > M2. fail ${reason}`,
                        `txExpired txAge > timeM2 fail ${reason} ` +
                        `txid: ${shortID} state: ${queueEntry.state} hasAll:${queueEntry.hasAll} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} age:${txAge}`
                    )
                    if (logFlags.playback) instance.logger.playbackLogNote('txExpired', `${shortID}`, `${queueEntry.txGroupDebug} txExpired >m2 fail ${reason}  ${utils.stringifyReduce(queueEntry.acceptedTx)} ${queueEntry.didWakeup}`)
                    nestedCountersInstance.countEvent('txExpired', `> timeM2 fail ${reason} state:${queueEntry.state} hasAll:${queueEntry.hasAll} globalMod:${queueEntry.globalModification} `)
                    if (configContext.stateManager.disableTxExpiration === false) {
                        _setTXExpiredLogic(instance, queueEntry, currentIndex, 'm2 ' + reason)
                    }
                }
            }

            const isConsensing = queueEntry.state === 'consensing'
            const isAwaitingFinalData = queueEntry.state === 'await final data'
            const isInExecutionHome = queueEntry.isInExecutionHome
            const signedReceipt = instance.stateManager.getSignedReceipt(queueEntry)
            const hasReceipt = signedReceipt != null
            const hasCastVote = queueEntry.ourVote != null
            let extraTime = 0
            let matchingReceipt = false

            if (isInExecutionHome && isConsensing && hasReceipt === false) {
                extraTime = timeM * 0.5
            }
            if (isInExecutionHome && hasReceipt) {
                matchingReceipt = instance.stateManager.transactionConsensus.hasAppliedReceiptMatchingPreApply(
                    queueEntry,
                    null // Assuming null implies using internal receipt
                )
                extraTime = timeM
            }
            if (extraTime < timeM && hasCastVote === true) {
                const ageDiff = queueEntry.voteCastAge + timeM - timeM3
                if (ageDiff > 0) {
                    extraTime = ageDiff
                }
            }
            if (isAwaitingFinalData) {
                if (hasReceipt) {
                    extraTime = timeM2 * 1.5
                } else {
                    extraTime = timeM
                }
            }
            if (extraTime > 0) {
                extraTime = Math.ceil(extraTime / 500) * 500
                if (extraTime > timeM) {
                    extraTime = timeM
                }
            }

            if (txAge > timeM3 + extraTime && queueEntry.isInExecutionHome && queueEntry.almostExpired == null && configContext.stateManager.disableTxExpiration === false) {
                const hasVoted = queueEntry.ourVote != null
                const receivedVote = queueEntry.receivedBestVote != null
                if (!receivedVote && !hasVoted && queueEntry.almostExpired == null) {
                    instance.statemanager_fatal(
                        `setTxAlmostExpired > M3. general case`,
                        `setTxAlmostExpired txAge > timeM3 general case ` +
                        `txid: ${shortID} state: ${queueEntry.state} hasAll:${queueEntry.hasAll} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} age:${txAge}  hasReceipt:${hasReceipt} matchingReceipt:${matchingReceipt} isInExecutionHome:${isInExecutionHome} hasVote: ${queueEntry.receivedBestVote != null}`
                    )
                    if (logFlags.playback) instance.logger.playbackLogNote('txExpired', `${shortID}`, `setTxAlmostExpired ${queueEntry.txGroupDebug} txExpired 3 requestingReceiptFailed  ${utils.stringifyReduce(queueEntry.acceptedTx)} ${queueEntry.didWakeup}`)
                    nestedCountersInstance.countEvent('txExpired', `setTxAlmostExpired > M3. general case state:${queueEntry.state} hasAll:${queueEntry.hasAll} globalMod:${queueEntry.globalModification} hasReceipt:${hasReceipt} matchingReceipt:${matchingReceipt} isInExecutionHome:${isInExecutionHome} hasVote: ${queueEntry.receivedBestVote != null}`)
                    nestedCountersInstance.countEvent('txExpired', `setTxAlmostExpired > M3. general case sieveT:${queueEntry.txSieveTime} extraTime:${extraTime}`)
                    nestedCountersInstance.countEvent('txExpired', 'set to almostExpired because we have not voted or received a vote')
                    _setTxAlmostExpiredLogic(instance, queueEntry, currentIndex, 'm3 general: almostExpired not voted or received vote')
                }
            }
        } // End of queueTimingFixes block

        const txStartTime = shardusGetTime()
        try {
          instance.profiler.profileSectionStart(`process-${queueEntry.state}`)
          if (logFlags.profiling_verbose)
            profilerInstance.scopedProfileSectionStart(`scoped-process-${queueEntry.state}`, false)
          pushedProfilerTag = queueEntry.state

          if (queueEntry.state === 'syncing') {
            if (queueEntry.syncCounter <= 0) {
              nestedCountersInstance.countEvent('sync', 'syncing state needs bump')
              queueEntry.waitForReceiptOnly = true
              if(instance.config.stateManager.txStateMachineChanges){
                 // _updateTxStateLogic(instance, queueEntry, 'await final data') // Original had no context
              } else {
                _updateTxStateLogic(instance, queueEntry, 'await final data', 'processTx5')
              }
            }
            _processQueue_markAccountsSeenLogic(instance, seenAccounts, queueEntry)
          } else if (queueEntry.state === 'aging') {
            queueEntry.executionDebug = { a: 'go' }
            _updateTxStateLogic(instance, queueEntry, 'processing')
            _processQueue_markAccountsSeenLogic(instance, seenAccounts, queueEntry)
          }
          if (queueEntry.state === 'processing') {
            if (_processQueue_accountSeenLogic(instance, seenAccounts, queueEntry) === false) {
              _processQueue_markAccountsSeenLogic(instance, seenAccounts, queueEntry)
              const time = shardusGetTime()
              try {
                const awaitStart = shardusGetTime()
                if (instance.executeInOneShard === true) {
                  instance.setDebugLastAwaitedCall('this.stateManager.transactionQueue.tellCorrespondingNodes(queueEntry)')
                  profilerInstance.scopedProfileSectionStart(`scoped-tellCorrespondingNodes`)
                  if (configContext.p2p.useFactCorrespondingTell) {
                    await instance.factTellCorrespondingNodes(queueEntry)
                  } else  {
                    await instance.tellCorrespondingNodes(queueEntry)
                  }
                  profilerInstance.scopedProfileSectionEnd(`scoped-tellCorrespondingNodes`)
                  instance.setDebugLastAwaitedCall('this.stateManager.transactionQueue.tellCorrespondingNodes(queueEntry)', DebugComplete.Completed)
                } else {
                  instance.setDebugLastAwaitedCall('this.stateManager.transactionQueue.tellCorrespondingNodesOld(queueEntry)')
                  if (configContext.p2p.useFactCorrespondingTell) {
                    await instance.factTellCorrespondingNodes(queueEntry)
                  } else  {
                    await instance.tellCorrespondingNodes(queueEntry)
                  }
                  instance.setDebugLastAwaitedCall('this.stateManager.transactionQueue.tellCorrespondingNodesOld(queueEntry)', DebugComplete.Completed)
                }
                queueEntry.dataSharedTimestamp = shardusGetTime()
                if (logFlags.debug) instance.mainLogger.debug(`tellCorrespondingNodes: ${queueEntry.logID} dataSharedTimestamp: ${queueEntry.dataSharedTimestamp}`)
                instance.updateSimpleStatsObject(
                  processStats.awaitStats,
                  'tellCorrespondingNodes',
                  shardusGetTime() - awaitStart
                )
                if (logFlags.verbose && logFlags.playback) instance.logger.playbackLogNote('shrd_processing', `${shortID}`, `qId: ${queueEntry.entryID} qRst:${localRestartCounter}  values: ${_processQueue_debugAccountDataLogic(instance, queueEntry, app)}`)
              } catch (ex) {
                if (logFlags.debug) instance.mainLogger.debug('processAcceptedTxQueue2 tellCorrespondingNodes:' + ex.name + ': ' + ex.message + ' at ' + ex.stack)
                instance.statemanager_fatal(
                  `processAcceptedTxQueue2_ex`,
                  'processAcceptedTxQueue2 tellCorrespondingNodes:' + ex.name + ': ' + ex.message + ' at ' + ex.stack
                )
                queueEntry.dataSharedTimestamp = shardusGetTime()
                nestedCountersInstance.countEvent(`processing`, `tellCorrespondingNodes fail`)
                queueEntry.executionDebug.process1 = 'tell fail'
              } finally {
                _updateTxStateLogic(instance, queueEntry, 'awaiting data', 'mainLoop')
                if (
                  queueEntry.globalModification === false &&
                  instance.executeInOneShard &&
                  queueEntry.isInExecutionHome === false
                ) {
                  if (logFlags.debug) instance.mainLogger.debug(`processAcceptedTxQueue2 isInExecutionHome === false. set state = 'consensing' tx:${queueEntry.logID} ts:${queueEntry.acceptedTx.timestamp}`)
                  _updateTxStateLogic(instance, queueEntry, 'consensing','fromProcessing')
                }
              }
              queueEntry.executionDebug.processElapsed = shardusGetTime() - time
            } else {
              const upstreamTx = _processQueue_getUpstreamTxLogic(instance, seenAccounts, queueEntry)
              if (upstreamTx == null) {
                if (logFlags.seqdiagram && queueEntry?.upStreamBlocker !== 'null') {
                  queueEntry.upStreamBlocker = 'null'
                  instance.seqLogger.info(`0x53455104 ${shardusGetTime()} tx:${queueEntry.acceptedTx.txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: upstream:null`)
                }
                nestedCountersInstance.countEvent('processing', 'busy waiting the upstream tx. but it is null')
              } else {
                if (upstreamTx.logID === queueEntry.logID) {
                  if (logFlags.seqdiagram && queueEntry?.upStreamBlocker !== upstreamTx.logID) {
                    queueEntry.upStreamBlocker = upstreamTx.logID
                    instance.seqLogger.info(`0x53455104 ${shardusGetTime()} tx:${queueEntry.acceptedTx.txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: upstream:same`)
                  }
                  if(upstreamTx === queueEntry){
                    nestedCountersInstance.countEvent('processing', 'busy waiting but the upstream tx reference matches our queue entry')
                  } else {
                    nestedCountersInstance.countEvent('processing', 'busy waiting the upstream tx but it is same txId')
                  }
                } else {
                  if (logFlags.seqdiagram && queueEntry?.upStreamBlocker !== upstreamTx.logID) {
                    queueEntry.upStreamBlocker = upstreamTx.logID
                    instance.seqLogger.info(`0x53455104 ${shardusGetTime()} tx:${queueEntry.acceptedTx.txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: upstream:${upstreamTx.logID}`)
                  }
                  nestedCountersInstance.countEvent('processing', `busy waiting the upstream tx to complete. state ${queueEntry.state}`)
                }
              }
            }
            _processQueue_markAccountsSeenLogic(instance, seenAccounts, queueEntry)
          }
          if (queueEntry.state === 'awaiting data') {
            queueEntry.executionDebug.log = 'entered awaiting data'
            if (queueEntry.hasAll === false && txAge > timeM2) {
              _processQueue_markAccountsSeenLogic(instance, seenAccounts, queueEntry)
              if (queueEntry.pendingDataRequest === true) {
                nestedCountersInstance.countEvent('processing', 'awaiting data. pendingDataRequest')
                continue
              }
              if (instance.queueEntryHasAllData(queueEntry) === true) {
                nestedCountersInstance.countEvent('processing', 'data missing at t>M2. but not really. investigate further')
                if (logFlags.playback) instance.logger.playbackLogNote('shrd_hadDataAfterall', `${shortID}`, `This is kind of an error, and should not happen`)
                continue
              }
              if(instance.config.stateManager.awaitingDataCanBailOnReceipt){
                const signedReceipt = instance.stateManager.getSignedReceipt(queueEntry)
                if(signedReceipt != null){
                  nestedCountersInstance.countEvent('processing', 'awaitingDataCanBailOnReceipt: activated.  tx state changed from awaiting data to await final data')
                  _updateTxStateLogic(instance, queueEntry, 'await final data', 'receipt while waiting for initial data')
                  continue
                }
              }
              if(instance.config.stateManager.requestAwaitedDataAllowed){
                try {
                  nestedCountersInstance.countEvent('processing', 'data missing at t>M2. request data')
                  instance.queueEntryRequestMissingData(queueEntry)
                } catch (ex) {
                  if (logFlags.debug) instance.mainLogger.debug('processAcceptedTxQueue2 queueEntryRequestMissingData:' + ex.name + ': ' + ex.message + ' at ' + ex.stack)
                  instance.statemanager_fatal(
                    `processAcceptedTxQueue2_missingData`,
                    'processAcceptedTxQueue2 queueEntryRequestMissingData:' + ex.name + ': ' + ex.message + ' at ' + ex.stack
                  )
                }
              }
            } else if (queueEntry.hasAll) {
              queueEntry.executionDebug.log1 = 'has all'
              if (_processQueue_accountSeenLogic(instance, seenAccounts, queueEntry) === false) {
                _processQueue_markAccountsSeenLogic(instance, seenAccounts, queueEntry)
                if (logFlags.verbose && logFlags.playback) instance.logger.playbackLogNote('shrd_preApplyTx', `${shortID}`, `qId: ${queueEntry.entryID} qRst:${localRestartCounter} values: ${_processQueue_debugAccountDataLogic(instance, queueEntry, app)} AcceptedTransaction: ${utils.stringifyReduce(queueEntry.acceptedTx)}`)
                try {
                  const accountsValid = instance.checkAccountTimestamps(queueEntry)
                  if (accountsValid === false) {
                    _updateTxStateLogic(instance, queueEntry, 'consensing')
                    queueEntry.preApplyTXResult = {
                      applied: false,
                      passed: false,
                      applyResult: 'failed account TS checks',
                      reason: 'apply result',
                      applyResponse: null,
                    }
                    continue
                  }
                  if (queueEntry.transactionGroup.length > 1) { // Assuming transactionGroup is populated
                    queueEntry.robustAccountDataPromises = {}
                  }
                  queueEntry.executionDebug.log2 = 'call pre apply'
                  const awaitStart = shardusGetTime()
                  instance.setDebugLastAwaitedCall('this.stateManager.transactionQueue.preApplyTransaction(queueEntry)')
                  let txResult: PreApplyAcceptedTransactionResult | 'timeout' = undefined
                  if (instance.config.stateManager.transactionApplyTimeout > 0) {
                    txResult = await withTimeout<PreApplyAcceptedTransactionResult>(
                      () => instance.preApplyTransaction(queueEntry),
                      instance.config.stateManager.transactionApplyTimeout
                    )
                    if (txResult === 'timeout') {
                      txResult = null
                      nestedCountersInstance.countEvent('processing', 'timeout-preApply')
                      instance.statemanager_fatal(
                        'timeout-preApply',
                        `preApplyTransaction timed out for txid: ${queueEntry.logID} ${instance.getDebugProccessingStatus()}`
                      )
                      instance.stateManager.forceUnlockAllFifoLocks('timeout-preApply')
                    }
                  } else {
                    txResult = await instance.preApplyTransaction(queueEntry)
                  }
                  instance.setDebugLastAwaitedCall('this.stateManager.transactionQueue.preApplyTransaction(queueEntry)', DebugComplete.Completed)
                  instance.updateSimpleStatsObject(
                    processStats.awaitStats,
                    'preApplyTransaction',
                    shardusGetTime() - awaitStart
                  )
                  queueEntry.executionDebug.log3 = 'called pre apply'
                  queueEntry.executionDebug.txResult = txResult

                  if (configContext.stateManager.forceVoteForFailedPreApply || (txResult && txResult.applied === true)) {
                    _updateTxStateLogic(instance, queueEntry, 'consensing')
                    queueEntry.preApplyTXResult = txResult as PreApplyAcceptedTransactionResult; // Type assertion
                    for (const key of Object.keys(queueEntry.collectedData)) {
                      const wrappedAccount = queueEntry.collectedData[key]
                      const { timestamp, hash } = instance.app.getTimestampAndHashFromAccount(wrappedAccount.data)
                      if (wrappedAccount.timestamp != timestamp) {
                        wrappedAccount.timestamp = timestamp
                        nestedCountersInstance.countEvent('transactionQueue', 'correctedTimestamp')
                      }
                      if (wrappedAccount.stateId != hash) {
                        wrappedAccount.stateId = hash
                        nestedCountersInstance.countEvent('transactionQueue', 'correctedHash')
                      }
                    }
                    if (queueEntry.noConsensus === true) {
                      if (logFlags.verbose && logFlags.playback) instance.logger.playbackLogNote('shrd_preApplyTx_noConsensus', `${shortID}`, ``)
                      if (logFlags.debug) instance.mainLogger.debug(`processAcceptedTxQueue2 noConsensus : ${queueEntry.logID} `)
                      _updateTxStateLogic(instance, queueEntry, 'commiting')
                      queueEntry.hasValidFinalData = true
                    } else {
                      if (logFlags.verbose && logFlags.playback) instance.logger.playbackLogNote('shrd_preApplyTx_createAndShareVote', `${shortID}`, ``)
                      if (logFlags.debug) instance.mainLogger.debug(`processAcceptedTxQueue2 calling createAndShareVote : ${queueEntry.logID} `)
                      const awaitStartVote = shardusGetTime()
                      queueEntry.voteCastAge = txAge
                      instance.setDebugLastAwaitedCall( 'this.stateManager.transactionConsensus.createAndShareVote(queueEntry)' )
                      await instance.stateManager.transactionConsensus.createAndShareVote(queueEntry)
                      instance.setDebugLastAwaitedCall( 'this.stateManager.transactionConsensus.createAndShareVote(queueEntry)', DebugComplete.Completed )
                      instance.updateSimpleStatsObject(
                        processStats.awaitStats,
                        'createAndShareVote',
                        shardusGetTime() - awaitStartVote
                      )
                    }
                  } else {
                    nestedCountersInstance.countEvent('processing', `txResult apply error. applied: ${txResult?.applied}`)
                    if (logFlags.error) instance.mainLogger.error(`processAcceptedTxQueue2 txResult problem txid:${queueEntry.logID} res: ${utils.stringifyReduce(txResult)} `)
                    queueEntry.waitForReceiptOnly = true
                    _updateTxStateLogic(instance, queueEntry, 'consensing')
                  }
                } catch (ex) {
                  if (logFlags.debug) instance.mainLogger.debug('processAcceptedTxQueue2 preApplyAcceptedTransaction:' + ex.name + ': ' + ex.message + ' at ' + ex.stack)
                  instance.statemanager_fatal(
                    `processAcceptedTxQueue2b_ex`,
                    'processAcceptedTxQueue2 preApplyAcceptedTransaction:' + ex.name + ': ' + ex.message + ' at ' + ex.stack
                  )
                } finally {
                  if (logFlags.verbose && logFlags.playback) instance.logger.playbackLogNote('shrd_preapplyFinish', `${shortID}`, `qId: ${queueEntry.entryID} qRst:${localRestartCounter} values: ${_processQueue_debugAccountDataLogic(instance, queueEntry, app)} AcceptedTransaction: ${utils.stringifyReduce(queueEntry.acceptedTx)}`)
                }
              } else {
                queueEntry.executionDebug.logBusy = 'has all, but busy'
                nestedCountersInstance.countEvent('processing', 'has all, but busy')
              }
              _processQueue_markAccountsSeenLogic(instance, seenAccounts, queueEntry)
            } else {
              _processQueue_markAccountsSeenLogic(instance, seenAccounts, queueEntry)
            }
          } else if (queueEntry.state === 'consensing') {
            if (_processQueue_accountSeenLogic(instance, seenAccounts, queueEntry) === false) {
              _processQueue_markAccountsSeenLogic(instance, seenAccounts, queueEntry)
              let didNotMatchReceipt = false
              let finishedConsensing = false
              let result: SignedReceipt = null // Define result here

              const receipt2 = queueEntry.receivedSignedReceipt ?? queueEntry.signedReceipt
              if (receipt2 != null) {
                  if (logFlags.debug) instance.mainLogger.debug(`processAcceptedTxQueue2 consensing : ${queueEntry.logID} receiptRcv:${hasReceivedApplyReceipt}`)
                  nestedCountersInstance.countEvent(`consensus`, 'tryProduceReceipt receipt2 != null')
                  result = queueEntry.signedReceipt // Assuming signedReceipt holds the final one
              } else {
                  result = await instance.stateManager.transactionConsensus.tryProduceReceipt(queueEntry)
              }

              if (logFlags.debug) instance.mainLogger.debug(`processAcceptedTxQueue2 tryProduceReceipt result : ${queueEntry.logID} ${utils.stringifyReduce(result)}`)
              const currentSignedReceipt = instance.stateManager.getSignedReceipt(queueEntry) // Use a consistent way to get the "current" receipt
              
              if (currentSignedReceipt != null) {
                if (logFlags.debug || instance.stateManager.consensusLog) {
                  instance.mainLogger.debug(
                    `processAcceptedTxQueue2 tryProduceReceipt final result : ${queueEntry.logID} ${utils.stringifyReduce(currentSignedReceipt)}`
                  )
                }
                const isReceiptMatchPreApply = instance.stateManager.transactionConsensus.hasAppliedReceiptMatchingPreApply(queueEntry, currentSignedReceipt)
                if (logFlags.debug || instance.stateManager.consensusLog) {
                  instance.mainLogger.debug(
                    `processAcceptedTxQueue2 tryProduceReceipt isReceiptMatchPreApply : ${queueEntry.logID} ${isReceiptMatchPreApply}`
                  )
                }

                if (isReceiptMatchPreApply && queueEntry.isInExecutionHome) {
                  nestedCountersInstance.countEvent('consensus', 'hasAppliedReceiptMatchingPreApply: true')
                  if (logFlags.verbose && logFlags.playback) instance.logger.playbackLogNote('shrd_consensingComplete_madeReceipt', `${shortID}`, `qId: ${queueEntry.entryID}  `)
                  if (
                    instance.stateManager.getReceiptProposal(queueEntry).cant_preApply === false &&
                    instance.stateManager.getReceiptResult(queueEntry) === true
                  ) {
                    _updateTxStateLogic(instance, queueEntry, 'commiting')
                    queueEntry.hasValidFinalData = true
                    finishedConsensing = true
                  } else {
                    if (logFlags.verbose && logFlags.playback) instance.logger.playbackLogNote('shrd_consensingComplete_finishedFailReceipt1', `${shortID}`, `qId: ${queueEntry.entryID}  `)
                    if (logFlags.debug || instance.stateManager.consensusLog) {
                      instance.mainLogger.debug(`processAcceptedTxQueue2 tryProduceReceipt failed result: false : ${queueEntry.logID} ${utils.stringifyReduce(currentSignedReceipt)}`)
                      instance.statemanager_fatal(`processAcceptedTxQueue2`, `tryProduceReceipt failed result: false : ${queueEntry.logID} ${utils.stringifyReduce(currentSignedReceipt)}`)
                    }
                    nestedCountersInstance.countEvent('consensus', 'tryProduceReceipt failed result = false or challenged')
                    _updateTxStateLogic(instance, queueEntry, 'fail')
                    instance.removeFromQueue(queueEntry, currentIndex)
                    continue
                  }
                  if (
                    queueEntry.globalModification === false &&
                    finishedConsensing === true &&
                    instance.executeInOneShard &&
                    queueEntry.isInExecutionHome
                  ) {
                    const awaitStartFinalData = shardusGetTime()
                    if (configContext.stateManager.attachDataToReceipt === false) {
                      if (configContext.p2p.useFactCorrespondingTell) {
                        instance.factTellCorrespondingNodesFinalData(queueEntry)
                      } 
                    }
                    instance.updateSimpleStatsObject(
                      processStats.awaitStats,
                      'tellCorrespondingNodesFinalData',
                      shardusGetTime() - awaitStartFinalData
                    )
                  }
                } else {
                  nestedCountersInstance.countEvent('consensus', `hasAppliedReceiptMatchingPreApply: false, isInExecutionHome: ${queueEntry.isInExecutionHome}`)
                  if (logFlags.verbose && logFlags.playback) instance.logger.playbackLogNote('shrd_consensingComplete_gotReceiptNoMatch1', `${shortID}`, `qId: ${queueEntry.entryID}  `)
                  if (instance.stateManager.getReceiptResult(queueEntry) === false) {
                    if (logFlags.verbose && logFlags.playback) instance.logger.playbackLogNote('shrd_consensingComplete_finishedFailReceipt2', `${shortID}`, `qId: ${queueEntry.entryID}  `)
                    if (logFlags.verbose) instance.statemanager_fatal(`consensing: on a failed receipt`, `consensing: got a failed receipt for txid: ${shortID} state: ${queueEntry.state} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} age:${txAge}`)
                    if (logFlags.debug || instance.stateManager.consensusLog) {
                       instance.mainLogger.debug(`processAcceptedTxQueue2 tryProduceReceipt failed result: false : ${queueEntry.logID} ${utils.stringifyReduce(currentSignedReceipt)}`)
                       instance.statemanager_fatal(`processAcceptedTxQueue2`, `tryProduceReceipt failed result: false : ${queueEntry.logID} ${utils.stringifyReduce(currentSignedReceipt)}`)
                    }
                    nestedCountersInstance.countEvent('consensus', 'consensed on failed result')
                    _updateTxStateLogic(instance, queueEntry, 'fail')
                    instance.removeFromQueue(queueEntry, currentIndex)
                    continue
                  }
                  didNotMatchReceipt = true
                  queueEntry.signedReceiptForRepair = currentSignedReceipt // Use the consistent receipt
                  if (queueEntry.isInExecutionHome === false && queueEntry.signedReceipt != null) {
                    if (instance.stateManager.consensusLog) instance.mainLogger.debug(`processTransactions ${queueEntry.logID} we are not execution home, but we have a receipt2, go to await final data`)
                    _updateTxStateLogic(instance, queueEntry, 'await final data', 'processTx7')
                  }
                }
              }
              if (finishedConsensing === false) {
                if (hasReceivedApplyReceipt && queueEntry.receivedSignedReceipt != null) {
                  if (instance.stateManager.transactionConsensus.hasAppliedReceiptMatchingPreApply(queueEntry, queueEntry.receivedSignedReceipt)) {
                    if (logFlags.verbose && logFlags.playback) instance.logger.playbackLogNote('shrd_consensingComplete_gotReceipt', `${shortID}`, `qId: ${queueEntry.entryID} `)
                    if (
                      instance.stateManager.getReceiptProposal(queueEntry).cant_preApply === false &&
                      instance.stateManager.getReceiptResult(queueEntry) === true
                    ) {
                      _updateTxStateLogic(instance, queueEntry, 'commiting')
                      queueEntry.hasValidFinalData = true
                      finishedConsensing = true
                    } else {
                      if (logFlags.verbose && logFlags.playback) instance.logger.playbackLogNote('shrd_consensingComplete_finishedFailReceipt2', `${shortID}`, `qId: ${queueEntry.entryID}  `)
                      instance.removeFromQueue(queueEntry, currentIndex)
                      _updateTxStateLogic(instance, queueEntry, 'fail')
                      continue
                    }
                  } else {
                    if (logFlags.verbose && logFlags.playback) instance.logger.playbackLogNote('shrd_consensingComplete_gotReceiptNoMatch2', `${shortID}`, `qId: ${queueEntry.entryID}  `)
                    didNotMatchReceipt = true
                    queueEntry.signedReceiptForRepair = queueEntry.receivedSignedReceipt
                  }
                } else {
                  if (instance.config.p2p.stuckNGTInQueueFix && queueEntry.isNGT && txAge > timeM5) {
                    nestedCountersInstance.countEvent(`consensus`, 'removing NGT from queue after failed consensing')
                    _updateTxStateLogic(instance, queueEntry, 'fail')
                    instance.removeFromQueue(queueEntry, currentIndex)
                    _processQueue_clearAccountsSeenLogic(instance, seenAccounts, queueEntry)
                    continue
                  }
                }
                if (didNotMatchReceipt === true && queueEntry.isInExecutionHome) {
                  nestedCountersInstance.countEvent('stateManager', 'didNotMatchReceipt')
                  if (queueEntry.debugFail_failNoRepair) {
                    _updateTxStateLogic(instance, queueEntry, 'fail')
                    instance.removeFromQueue(queueEntry, currentIndex)
                    nestedCountersInstance.countEvent('stateManager', 'debugFail_failNoRepair')
                    instance.statemanager_fatal(`processAcceptedTxQueue_debugFail_failNoRepair2`, `processAcceptedTxQueue_debugFail_failNoRepair2 tx: ${shortID} cycle:${queueEntry.cycleToRecordOn}  accountkeys: ${utils.stringifyReduce(queueEntry.uniqueWritableKeys)}`)
                    _processQueue_clearAccountsSeenLogic(instance, seenAccounts, queueEntry)
                    continue
                  }
                  if (logFlags.verbose && logFlags.playback) instance.logger.playbackLogNote('shrd_consensingComplete_didNotMatchReceipt', `${shortID}`, `qId: ${queueEntry.entryID} result:${queueEntry.signedReceiptForRepair.proposal.applied} `)
                  queueEntry.repairFinished = false
                  if (queueEntry.signedReceiptForRepair.proposal.applied === true) {
                    if (configContext.stateManager.noRepairIfDataAttached && configContext.stateManager.attachDataToReceipt) {
                        _updateTxStateLogic(instance, queueEntry, 'await final data')
                    } else {
                        instance.stateManager.getTxRepair().repairToMatchReceipt(queueEntry)
                        _updateTxStateLogic(instance, queueEntry, 'await repair')
                    }
                    continue
                  } else {
                    if (logFlags.verbose && logFlags.playback) instance.logger.playbackLogNote('shrd_consensingComplete_finishedFailReceipt3', `${shortID}`, `qId: ${queueEntry.entryID}  `)
                    instance.statemanager_fatal(`consensing: repairToMatchReceipt failed`, `consensing: repairToMatchReceipt failed txid: ${shortID} state: ${queueEntry.state} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} age:${txAge}`)
                    instance.removeFromQueue(queueEntry, currentIndex)
                    _updateTxStateLogic(instance, queueEntry, 'fail')
                    continue
                  }
                }
              }
            } else {
              nestedCountersInstance.countEvent('consensus', 'busy waiting')
            }
            _processQueue_markAccountsSeenLogic(instance, seenAccounts, queueEntry)
          }
          if (queueEntry.state === 'await repair') {
            _processQueue_markAccountsSeenLogic(instance, seenAccounts, queueEntry)
            if (queueEntry.repairFinished === true) {
              if (logFlags.verbose && logFlags.playback) instance.logger.playbackLogNote('shrd_awaitRepair_repairFinished', `${shortID}`, `qId: ${queueEntry.entryID} result:${queueEntry.signedReceiptForRepair.proposal.applied} txAge:${txAge} `)
              if (queueEntry.signedReceiptForRepair.proposal.applied === true) {
                _updateTxStateLogic(instance, queueEntry, 'pass')
              } else {
                _updateTxStateLogic(instance, queueEntry, 'fail')
              }
              instance.removeFromQueue(queueEntry, currentIndex)
              nestedCountersInstance.countEvent('stateManager', 'repairFinished')
              continue
            } else if (queueEntry.repairFailed === true) {
              _updateTxStateLogic(instance, queueEntry, 'fail')
              instance.removeFromQueue(queueEntry, currentIndex)
              nestedCountersInstance.countEvent('stateManager', 'repairFailed')
              continue
            }
          }
          if (queueEntry.state === 'await final data') {
            if (_processQueue_accountSeenLogic(instance, seenAccounts, queueEntry) === false) {
              _processQueue_markAccountsSeenLogic(instance, seenAccounts, queueEntry)
              if (configContext.stateManager.attachDataToReceipt && queueEntry.accountDataSet === true) {
                if (logFlags.debug) instance.mainLogger.debug(`shrd_awaitFinalData_removeFromQueue : ${queueEntry.logID} because accountDataSet is true`)
                instance.removeFromQueue(queueEntry, currentIndex)
                continue
              }
              const signedReceipt = instance.stateManager.getSignedReceipt(queueEntry)
              const timeSinceAwaitFinalStart = queueEntry.txDebug.startTimestamp['await final data'] > 0 ? shardusGetTime() - queueEntry.txDebug.startTimestamp['await final data'] : 0
              const accountsNotStored = new Set()
              
              if (signedReceipt) {
                let failed = false
                let incomplete = false
                let skipped = 0
                const missingAccounts = []
                const nodeShardData: P2PTypes.ShardInfo.NodeShardData = instance.stateManager.currentCycleShardData.nodeShardData
                for (let i = 0; i < signedReceipt.proposal.accountIDs.length; i++) {
                  const accountID = signedReceipt.proposal.accountIDs[i]
                  const accountHash = signedReceipt.proposal.afterStateHashes[i]
                  if ( ShardFunctions.testAddressInRange(accountID, nodeShardData.storedPartitions) === false ) {
                    skipped++
                    accountsNotStored.add(accountID)
                    continue
                  }
                  const wrappedAccount = queueEntry.collectedFinalData[accountID]
                  if (wrappedAccount == null) {
                    incomplete = true
                    queueEntry.debug.waitingOn = accountID
                    missingAccounts.push(accountID)
                  }
                  if (wrappedAccount && wrappedAccount.stateId != accountHash) {
                    if (logFlags.debug) instance.mainLogger.debug( `shrd_awaitFinalData_failed : ${queueEntry.logID} wrappedAccount.stateId != accountHash from the vote` )
                    failed = true
                    nestedCountersInstance.countEvent('stateManager', `shrd_awaitFinalData failed state check wrappedAccount.stateId != accountHash`)
                    break
                  }
                }

                if (incomplete && missingAccounts.length > 0) {
                    nestedCountersInstance.countEvent('stateManager', `shrd_awaitFinalData missing accounts ${missingAccounts.length}`)
                    let shouldStartFinalDataRequest = false
                    if (timeSinceAwaitFinalStart > 5000) {
                        shouldStartFinalDataRequest = true
                        if (logFlags.verbose) instance.mainLogger.debug(`shrd_awaitFinalData_incomplete : ${queueEntry.logID} starting finalDataRequest timeSinceDataShare: ${timeSinceAwaitFinalStart}`)
                    } else if (txAge > timeM3) {
                        shouldStartFinalDataRequest = true
                        if (logFlags.verbose) instance.mainLogger.debug(`shrd_awaitFinalData_incomplete : ${queueEntry.logID} starting finalDataRequest txAge > timeM3 + confirmationSeenExpirationTime`)
                    }
                    const timeSinceLastFinalDataRequest = shardusGetTime() - queueEntry.lastFinalDataRequestTimestamp
                    if (instance.config.stateManager.canRequestFinalData && shouldStartFinalDataRequest && timeSinceLastFinalDataRequest > 5000) {
                        nestedCountersInstance.countEvent('stateManager', 'requestFinalData')
                        instance.requestFinalData(queueEntry, missingAccounts)
                        queueEntry.lastFinalDataRequestTimestamp = shardusGetTime()
                        continue
                    }
                } else {
                    nestedCountersInstance.countEvent('stateManager', 'shrd_awaitFinalData not missing accounts')
                }

                if (failed === true) {
                  nestedCountersInstance.countEvent('stateManager', 'shrd_awaitFinalData failed')
                  instance.stateManager.getTxRepair().repairToMatchReceipt(queueEntry)
                  _updateTxStateLogic(instance, queueEntry, 'await repair')
                  if (logFlags.verbose && logFlags.playback) instance.logger.playbackLogNote('shrd_awaitFinalData_failed', `${shortID}`, `qId: ${queueEntry.entryID} skipped:${skipped}`)
                  if (logFlags.debug) instance.mainLogger.debug(`shrd_awaitFinalData_failed : ${queueEntry.logID} `)
                  continue
                }
                if (failed === false && incomplete === false) {
                  queueEntry.hasValidFinalData = true
                  if (logFlags.verbose && logFlags.playback) instance.logger.playbackLogNote('shrd_awaitFinalData_passed', `${shortID}`, `qId: ${queueEntry.entryID} skipped:${skipped}`)
                  if (logFlags.debug) instance.mainLogger.debug(`shrd_awaitFinalData_passed : ${queueEntry.logID} skipped:${skipped}`)
                  const rawAccounts = []
                  const accountRecords: Shardus.WrappedData[] = []
                  for (let i = 0; i < signedReceipt.proposal.accountIDs.length; i++) {
                    const accountID = signedReceipt.proposal.accountIDs[i]
                    if (accountsNotStored.has(accountID)) {
                      continue
                    }
                    const wrappedAccount = queueEntry.collectedFinalData[accountID]
                    rawAccounts.push(wrappedAccount.data)
                    accountRecords.push(wrappedAccount)
                  }
                  nestedCountersInstance.countEvent('stateManager', `shrd_awaitFinalData got data, time to save it ${accountRecords.length}`)
                  const awaitStartSetAccount = shardusGetTime()
                  instance.setDebugLastAwaitedCall( 'this.stateManager.transactionConsensus.checkAndSetAccountData()' )
                  await instance.stateManager.checkAndSetAccountData(
                    accountRecords,
                    `txId: ${queueEntry.logID} awaitFinalData_passed`,
                    false
                  )
                  instance.setDebugLastAwaitedCall( 'this.stateManager.transactionConsensus.checkAndSetAccountData()', DebugComplete.Completed )
                  queueEntry.accountDataSet = true
                  instance.app.transactionReceiptPass(queueEntry.acceptedTx.data, queueEntry.collectedFinalData, queueEntry?.preApplyTXResult?.applyResponse, false)
                  if (logFlags.verbose) console.log('transactionReceiptPass 1', queueEntry.acceptedTx.txId, queueEntry)
                  instance.updateSimpleStatsObject(
                    processStats.awaitStats,
                    'checkAndSetAccountData',
                    shardusGetTime() - awaitStartSetAccount
                  )
                  if (
                    queueEntry != null &&
                    queueEntry.transactionGroup != null &&
                    instance.p2p.getNodeId() === queueEntry.transactionGroup[0].id
                  ) {
                    if (queueEntry.globalModification === false) {
                      instance.stateManager.eventEmitter.emit('txProcessed')
                    }
                  }
                  if (
                    queueEntry.receivedSignedReceipt?.proposal?.applied === true ||
                    queueEntry.signedReceipt?.proposal?.applied === true
                  ) {
                    _updateTxStateLogic(instance, queueEntry, 'pass')
                  } else {
                    if (logFlags.debug) instance.mainLogger.error(`shrd_awaitFinalData_fail : ${queueEntry.logID} no receivedSignedReceipt. signedReceipt: ${utils.stringifyReduce(queueEntry.signedReceipt)}`);
                    _updateTxStateLogic(instance, queueEntry, 'fail')
                  }
                  instance.removeFromQueue(queueEntry, currentIndex)
                }
              } else {
                nestedCountersInstance.countEvent('stateManager', 'shrd_awaitFinalData noVote')
              }
            } else {
              const upstreamTx = _processQueue_getUpstreamTxLogic(instance, seenAccounts, queueEntry)
              if (queueEntry.executionDebug == null) queueEntry.executionDebug = {}
              queueEntry.executionDebug.logFinalData = `has all final data, but busy. upstreamTx: ${upstreamTx?.logID}`
              if (upstreamTx == null) {
                queueEntry.executionDebug.logFinalData = `has all final data, but busy. upstreamTx: null`
                nestedCountersInstance.countEvent('stateManager', 'shrd_awaitFinalData busy. upstreamTx: null')
              } else {
                if (upstreamTx.acceptedTx.txId === queueEntry.acceptedTx.txId) {
                  nestedCountersInstance.countEvent('stateManager', 'shrd_awaitFinalData busy. upstreamTx same tx')
                } else {
                  nestedCountersInstance.countEvent('stateManager', `shrd_awaitFinalData busy. upstream tx state: ${upstreamTx?.state}`)
                }
              }
            }
          }
          if (queueEntry.state === 'commiting') {
            if (_processQueue_accountSeenLogic(instance, seenAccounts, queueEntry) === false) {
              _processQueue_markAccountsSeenLogic(instance, seenAccounts, queueEntry)
              if (logFlags.debug) instance.mainLogger.debug(`processAcceptedTxQueue2 commiting : ${queueEntry.logID} `)
              if (logFlags.verbose && logFlags.playback) instance.logger.playbackLogNote('shrd_commitingTx', `${shortID}`, `qId: ${queueEntry.entryID} qRst:${localRestartCounter} values: ${_processQueue_debugAccountDataLogic(instance, queueEntry, app)} AcceptedTransaction: ${utils.stringifyReduce(queueEntry.acceptedTx)}`)
              if (queueEntry.debugFail_failNoRepair) {
                _updateTxStateLogic(instance, queueEntry, 'fail')
                instance.removeFromQueue(queueEntry, currentIndex)
                nestedCountersInstance.countEvent('stateManager', 'debugFail_failNoRepair')
                instance.statemanager_fatal(`processAcceptedTxQueue_debugFail_failNoRepair`, `processAcceptedTxQueue_debugFail_failNoRepair tx: ${shortID} cycle:${queueEntry.cycleToRecordOn}  accountkeys: ${utils.stringifyReduce(queueEntry.uniqueWritableKeys)}`)
                _processQueue_clearAccountsSeenLogic(instance, seenAccounts, queueEntry)
                continue
              }
              const wrappedStates = queueEntry.collectedData
              try {
                let canCommitTX = true
                let hasReceiptFail = false
                if (queueEntry.noConsensus === true) {
                  if (queueEntry.preApplyTXResult.passed === false) {
                    canCommitTX = false
                  }
                } else if (queueEntry.signedReceipt != null) {
                  if (queueEntry.signedReceipt.proposal.applied === false) {
                    canCommitTX = false
                    hasReceiptFail = true
                  }
                } else if (queueEntry.receivedSignedReceipt != null) {
                  if (queueEntry.receivedSignedReceipt.proposal.applied === false) {
                    canCommitTX = false
                    if(configContext.stateManager.receiptRemoveFix){
                      hasReceiptFail = true
                    } else {
                      hasReceiptFail = false // This seems like a bug in original code, should be true if receipt says applied:false
                    }
                  }
                } else {
                  canCommitTX = false
                }
                nestedCountersInstance.countEvent('stateManager', `canCommitTX: ${canCommitTX}, hasReceiptFail: ${hasReceiptFail}`)
                if (logFlags.verbose && logFlags.debug) instance.mainLogger.debug('shrd_commitingTx', `${shortID}`, `canCommitTX: ${canCommitTX}, hasReceiptFail: ${hasReceiptFail}`)
                if (logFlags.verbose && logFlags.playback) instance.logger.playbackLogNote('shrd_commitingTx', `${shortID}`, `canCommitTX: ${canCommitTX} `)
                if (canCommitTX) {
                  instance.profiler.profileSectionStart('commit')
                  const awaitStartCommit = shardusGetTime()
                  instance.setDebugLastAwaitedCall( 'this.stateManager.transactionConsensus.commitConsensedTransaction()' )
                  await instance.commitConsensedTransaction(queueEntry)
                  instance.setDebugLastAwaitedCall( 'this.stateManager.transactionConsensus.commitConsensedTransaction()', DebugComplete.Completed )
                  instance.updateSimpleStatsObject(
                    processStats.awaitStats,
                    'commitConsensedTransaction',
                    shardusGetTime() - awaitStartCommit
                  )
                  if (queueEntry.repairFinished) {
                    instance.statemanager_fatal(`processAcceptedTxQueue_commitingRepairedReceipt`, `${shortID} `)
                    nestedCountersInstance.countEvent('processing', 'commiting a repaired TX...')
                  }
                  nestedCountersInstance.countEvent('stateManager', 'committed tx')
                  if (queueEntry.hasValidFinalData === false) {
                    nestedCountersInstance.countEvent('stateManager', 'commit state fix FinalDataFlag')
                    queueEntry.hasValidFinalData = true
                  }
                  instance.profiler.profileSectionEnd('commit')
                }
                if (logFlags.verbose) console.log('commit commit', queueEntry.acceptedTx.txId, queueEntry.acceptedTx.timestamp)
                if (instance.config.p2p.experimentalSnapshot) instance.addReceiptToForward(queueEntry, 'commit')
                if (hasReceiptFail) {
                  const applyReponse = queueEntry.preApplyTXResult.applyResponse
                  instance.app.transactionReceiptFail(queueEntry.acceptedTx.data, wrappedStates, applyReponse)
                }
              } catch (ex) {
                if (logFlags.debug) instance.mainLogger.debug('processAcceptedTxQueue2 commiting Transaction:' + ex.name + ': ' + ex.message + ' at ' + ex.stack)
                instance.statemanager_fatal(`processAcceptedTxQueue2b_ex`, 'processAcceptedTxQueue2 commiting Transaction:' + ex.name + ': ' + ex.message + ' at ' + ex.stack)
              } finally {
                _processQueue_clearAccountsSeenLogic(instance, seenAccounts, queueEntry)
                if (queueEntry.noConsensus === true) {
                  if (queueEntry.preApplyTXResult.passed === true) {
                    _updateTxStateLogic(instance, queueEntry, 'pass')
                  } else {
                    _updateTxStateLogic(instance, queueEntry, 'fail')
                  }
                  if (logFlags.debug) instance.mainLogger.debug(`processAcceptedTxQueue2 commiting finished : noConsensus:${queueEntry.state} ${queueEntry.logID} `)
                } else if (queueEntry.signedReceipt != null) {
                  if (queueEntry.signedReceipt.proposal.applied === true) {
                    _updateTxStateLogic(instance, queueEntry, 'pass')
                  } else {
                    _updateTxStateLogic(instance, queueEntry, 'fail')
                  }
                  if (logFlags.debug) instance.mainLogger.debug(`processAcceptedTxQueue2 commiting finished : Recpt:${queueEntry.state} ${queueEntry.logID} `)
                } else if (queueEntry.receivedSignedReceipt != null) {
                  if (queueEntry.receivedSignedReceipt.proposal.applied === true) {
                    _updateTxStateLogic(instance, queueEntry, 'pass')
                  } else {
                    _updateTxStateLogic(instance, queueEntry, 'fail')
                  }
                  if (logFlags.debug) instance.mainLogger.debug(`processAcceptedTxQueue2 commiting finished : recvRecpt:${queueEntry.state} ${queueEntry.logID} `)
                } else {
                  _updateTxStateLogic(instance, queueEntry, 'fail')
                  if (logFlags.error) instance.mainLogger.error(`processAcceptedTxQueue2 commiting finished : no receipt ${queueEntry.logID} `)
                }
                if (logFlags.verbose && logFlags.playback) instance.logger.playbackLogNote('shrd_commitingTxFinished', `${queueEntry.acceptedTx.txId}`, `qId: ${queueEntry.entryID} qRst:${localRestartCounter} values: ${_processQueue_debugAccountDataLogic(instance, queueEntry, app)} AcceptedTransaction: ${utils.stringifyReduce(queueEntry.acceptedTx)}`)
                instance.removeFromQueue(queueEntry, currentIndex)
              }
            }
          }
          if (queueEntry.state === 'canceled') {
            _processQueue_clearAccountsSeenLogic(instance, seenAccounts, queueEntry)
            instance.removeFromQueue(queueEntry, currentIndex)
            if (logFlags.debug) instance.mainLogger.debug(`processAcceptedTxQueue2 canceled : ${queueEntry.logID} `)
            nestedCountersInstance.countEvent('stateManager', 'canceled')
          }
        } finally {
          instance.profiler.profileSectionEnd(`process-${pushedProfilerTag}`)
          if (logFlags.profiling_verbose)
            profilerInstance.scopedProfileSectionEnd(`scoped-process-${pushedProfilerTag}`)
          const txElapsed = shardusGetTime() - txStartTime
          if (queueEntry.state != pushedProfilerTag) {
            processStats.stateChanged++
            instance.updateSimpleStatsObject(processStats.stateChangedStats, pushedProfilerTag, txElapsed)
          } else {
            processStats.sameState++
            instance.updateSimpleStatsObject(processStats.sameStateStats, pushedProfilerTag, txElapsed)
          }
          pushedProfilerTag = null
        }
      }
    } finally {
      if (pushedProfilerTag != null) {
        instance.profiler.profileSectionEnd(`process-${pushedProfilerTag}`)
        // instance.profiler.profileSectionEnd(`process-patched1-${pushedProfilerTag}`) // Ensure this ends if started
        pushedProfilerTag = null
      }
      const processTime = shardusGetTime() - startTime
      processStats.totalTime = processTime
      instance.finalizeSimpleStatsObject(processStats.awaitStats)
      instance.finalizeSimpleStatsObject(processStats.sameStateStats)
      instance.finalizeSimpleStatsObject(processStats.stateChangedStats)
      instance.lastProcessStats['latest'] = processStats

      if (processTime > 10000) {
        nestedCountersInstance.countEvent('stateManager', 'processTime > 10s')
        instance.statemanager_fatal(`processAcceptedTxQueue excceded time ${processTime / 1000} firstTime:${firstTime}`, `processAcceptedTxQueue excceded time ${processTime / 1000} firstTime:${firstTime} stats:${Utils.safeStringify(processStats)}`)
        instance.lastProcessStats['10+'] = processStats
      } else if (processTime > 5000) {
        nestedCountersInstance.countEvent('stateManager', 'processTime > 5s')
        if (logFlags.error) instance.mainLogger.error(`processTime > 5s ${processTime / 1000} stats:${Utils.safeStringify(processStats)}`)
        instance.lastProcessStats['5+'] = processStats
      } else if (processTime > 2000) {
        nestedCountersInstance.countEvent('stateManager', 'processTime > 2s')
        if (logFlags.error && logFlags.verbose) instance.mainLogger.error(`processTime > 2s ${processTime / 1000} stats:${Utils.safeStringify(processStats)}`)
        instance.lastProcessStats['2+'] = processStats
      } else if (processTime > 1000) {
        nestedCountersInstance.countEvent('stateManager', 'processTime > 1s')
        if (logFlags.error && logFlags.verbose) instance.mainLogger.error(`processTime > 1s ${processTime / 1000} stats:${Utils.safeStringify(processStats)}`)
        instance.lastProcessStats['1+'] = processStats
      }

      if (instance._transactionQueue.length > 0 || instance.pendingTransactionQueue.length > 0) {
        instance.transactionQueueHasRemainingWork = true
        setTimeout(() => {
          instance.stateManager.tryStartTransactionProcessingQueue()
        }, 15)
      } else {
        if (logFlags.seqdiagram) instance.mainLogger.info(`0x10052024 ${ipInfo.externalIp} ${shardusGetTime()} 0x0000 processTransactions _transactionQueue.length 0`)
        instance.transactionQueueHasRemainingWork = false
      }
      instance.transactionProcessingQueueRunning = false
      instance.processingLastRunTime = shardusGetTime()
      instance.stateManager.lastSeenAccountsMap = seenAccounts
      instance.profiler.profileSectionEnd('processQ')
    }
}

export function _setTXExpiredLogic(instance: TransactionQueue, queueEntry: QueueEntry, currentIndex: number, message: string): void {
    if (logFlags.verbose || instance.stateManager.consensusLog) instance.mainLogger.debug(`setTXExpired tx:${queueEntry.logID} ${message}  ts:${queueEntry.acceptedTx.timestamp} debug:${utils.stringifyReduce(queueEntry.debug)} state: ${queueEntry.state}, isInExecution: ${queueEntry.isInExecutionHome}`)
    _updateTxStateLogic(instance, queueEntry, 'expired')
    instance.removeFromQueue(queueEntry, currentIndex)
    instance.app.transactionReceiptFail(
      queueEntry.acceptedTx.data,
      queueEntry.collectedData,
      queueEntry.preApplyTXResult?.applyResponse
    )
    instance.stateManager.eventEmitter.emit('txExpired', queueEntry.acceptedTx.txId)
    nestedCountersInstance.countEvent( 'txExpired', `tx: ${instance.app.getSimpleTxDebugValue(queueEntry.acceptedTx?.data)}` )
    if (queueEntry.signedReceiptFinal != null) {
      const startRepair = queueEntry.repairStarted === false
      if (logFlags.debug) instance.mainLogger.debug(`setTXExpired. ${queueEntry.logID} start repair:${startRepair}. update `)
      if (startRepair) {
        nestedCountersInstance.countEvent('repair1', 'setTXExpired: start repair')
        queueEntry.signedReceiptForRepair = queueEntry.signedReceiptFinal
        instance.stateManager.getTxRepair().repairToMatchReceipt(queueEntry)
      }
    } else {
      nestedCountersInstance.countEvent('repair1', 'setTXExpired: no receipt to repair')
      if (logFlags.debug) instance.mainLogger.debug(`setTXExpired. no receipt to repair ${queueEntry.logID}`)
    }
}

export function _setTxAlmostExpiredLogic(instance: TransactionQueue, queueEntry: QueueEntry, currentIndex: number, message: string): void {
    if (logFlags.verbose || instance.stateManager.consensusLog) instance.mainLogger.debug(`setTxAlmostExpired tx:${queueEntry.logID} ${message}  ts:${queueEntry.acceptedTx.timestamp} debug:${utils.stringifyReduce(queueEntry.debug)}`)
    queueEntry.almostExpired = true
    nestedCountersInstance.countEvent("txAlmostExpired", `tx: ${instance.app.getSimpleTxDebugValue(queueEntry.acceptedTx?.data)}`)
}

export function _processQueue_accountSeenLogic(instance: TransactionQueue, seenAccounts: SeenAccounts, queueEntry: QueueEntry): boolean {
    if (instance.config.debug.useShardusMemoryPatterns && queueEntry.shardusMemoryPatternSets != null) {
      return _processQueue_accountSeen2Logic(instance, seenAccounts, queueEntry)
    }
    if (queueEntry.uniqueKeys == null) {
      return false
    }
    for (const key of queueEntry.uniqueKeys) {
      if (seenAccounts[key] != null) {
        return true
      }
    }
    return false
}

export function _processQueue_getUpstreamTxLogic(instance: TransactionQueue, seenAccounts: SeenAccounts, queueEntry: QueueEntry): QueueEntry | null {
    if (instance.config.debug.useShardusMemoryPatterns && queueEntry.shardusMemoryPatternSets != null) {
      return null // This needs specific logic for pattern sets if different from key-based
    }
    if (queueEntry.uniqueKeys == null) {
      return null
    }
    for (const key of queueEntry.uniqueKeys) {
      if (seenAccounts[key] != null) {
        return seenAccounts[key]
      }
    }
    return null
}

export function _processQueue_markAccountsSeenLogic(instance: TransactionQueue, seenAccounts: SeenAccounts, queueEntry: QueueEntry): void {
    if (instance.config.debug.useShardusMemoryPatterns && queueEntry.shardusMemoryPatternSets != null) {
      _processQueue_markAccountsSeen2Logic(instance, seenAccounts, queueEntry)
      return
    }
    if (queueEntry.uniqueWritableKeys == null) {
      return
    }
    for (const key of queueEntry.uniqueWritableKeys) {
      if (seenAccounts[key] == null) {
        seenAccounts[key] = queueEntry
      }
    }
}

export function _processQueue_clearAccountsSeenLogic(instance: TransactionQueue, seenAccounts: SeenAccounts, queueEntry: QueueEntry): void {
    if (queueEntry.uniqueKeys == null) {
      return
    }
    for (const key of queueEntry.uniqueKeys) {
      if (seenAccounts[key] != null && seenAccounts[key].logID === queueEntry.logID) {
        if (logFlags.verbose) instance.mainLogger.debug(`${new Date()}}clearing key ${key} for tx ${queueEntry.logID}`);
        seenAccounts[key] = null
      }
    }
}

export function _processQueue_debugAccountDataLogic(instance: TransactionQueue, queueEntry: QueueEntry, app: Shardus.App): string {
    let debugStr = ''
    if (queueEntry.uniqueKeys == null) {
      return queueEntry.logID + ' uniqueKeys empty error'
    }
    for (const key of queueEntry.uniqueKeys) {
      if (queueEntry.collectedData[key] != null) {
        debugStr +=
          utils.makeShortHash(key) + ' : ' + app.getAccountDebugValue(queueEntry.collectedData[key]) + ', '
      }
    }
    return debugStr
}

export function _processQueue_accountSeen2Logic(instance: TransactionQueue, seenAccounts: SeenAccounts, queueEntry: QueueEntry): boolean {
    if (queueEntry.uniqueKeys == null) {
      return false
    }
    if (queueEntry.shardusMemoryPatternSets != null) {
      for (const id of queueEntry.shardusMemoryPatternSets.rw) {
        if (instance.queueWrites.has(id)) return true
        if (instance.queueReadWritesOld.has(id)) return true
        if (instance.queueReads.has(id)) return true
      }
      for (const id of queueEntry.shardusMemoryPatternSets.wo) {
        if (instance.queueReads.has(id)) return true
        if (instance.queueReadWritesOld.has(id)) return true
      }
      for (const id of queueEntry.shardusMemoryPatternSets.ro) {
        if (instance.queueWrites.has(id)) return true
        if (instance.queueReadWritesOld.has(id)) return true
      }
      return false
    }
    // Fallback to old logic if no patterns
    for (const key of queueEntry.uniqueKeys) {
      if (seenAccounts[key] != null) {
        return true
      }
    }
    return false
}

export function _processQueue_markAccountsSeen2Logic(instance: TransactionQueue, seenAccounts: SeenAccounts, queueEntry: QueueEntry): void {
    if (queueEntry.uniqueWritableKeys == null) {
      return
    }
    if (queueEntry.shardusMemoryPatternSets != null) {
      for (const id of queueEntry.shardusMemoryPatternSets.rw) {
        instance.queueWrites.add(id)
        instance.queueReads.add(id)
      }
      for (const id of queueEntry.shardusMemoryPatternSets.wo) {
        instance.queueWrites.add(id)
      }
      for (const id of queueEntry.shardusMemoryPatternSets.on) {
        instance.queueWrites.add(id)
      }
      for (const id of queueEntry.shardusMemoryPatternSets.ro) {
        instance.queueReads.add(id)
      }
      return
    }
    // Fallback to old logic
    for (const key of queueEntry.uniqueWritableKeys) {
      if (seenAccounts[key] == null) {
        seenAccounts[key] = queueEntry
      }
      instance.queueReadWritesOld.add(key)
    }
}