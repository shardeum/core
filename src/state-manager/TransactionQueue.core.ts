import { nestedCountersInstance } from '../utils/nestedCounters'
import { shardusGetTime, ipInfo } from '../network'
import * as utils from '../utils'
import { withTimeout } from '../utils'
import { logFlags } from '../logger'
import * as NodeList from '../p2p/NodeList'
import * as Self from '../p2p/Self'
import { SeenAccounts, ProcessQueueStats, QueueEntry, PreApplyAcceptedTransactionResult, SignedReceipt } from './state-manager-types'
import * as Shardus from '../shardus/shardus-types'
import { config as configContext } from '../p2p/Context'
import { profilerInstance } from '../utils/profiler'
import ShardFunctions from './shardFunctions'
import { StateManager as StateManagerTypes } from '@shardeum-foundation/lib-types'
import { Utils } from '@shardeum-foundation/lib-types'
import { handleConsensingState } from './TransactionQueue.core.consensing'
import { handleCommitingState } from './TransactionQueue.core.commiting'

enum DebugComplete {
  Incomplete = 0,
  Completed = 1,
}

export const coreMethods = {
  async processTransactions(firstTime = false): Promise<void> {
    const seenAccounts: SeenAccounts = {}
    let pushedProfilerTag = null
    const startTime = shardusGetTime()

    const processStats: ProcessQueueStats = {
      totalTime: 0,
      inserted: 0,
      sameState: 0,
      stateChanged: 0,
      //expired:0,
      sameStateStats: {},
      stateChangedStats: {},
      awaitStats: {},
    }

    //this may help in the case where the queue has halted
    this.lastProcessStats['current'] = processStats

    this.queueReads = new Set()
    this.queueWrites = new Set()
    this.queueReadWritesOld = new Set()

    try {
      nestedCountersInstance.countEvent('processing', 'processing-enter')

      if (this.pendingTransactionQueue.length > 5000) {
        /* prettier-ignore */ nestedCountersInstance.countEvent( 'stateManager', `newAcceptedTxQueueTempInjest>5000 leftRunning:${this.transactionProcessingQueueRunning} noShardCalcs:${ this.stateManager.currentCycleShardData == null } ` )

        //report rare counter once
        if (this.largePendingQueueReported === false) {
          this.largePendingQueueReported = true
          /* prettier-ignore */ nestedCountersInstance.countRareEvent( 'stateManager', `newAcceptedTxQueueTempInjest>5000 leftRunning:${this.transactionProcessingQueueRunning} noShardCalcs:${ this.stateManager.currentCycleShardData == null } ` )
        }
      }

      if (this.transactionProcessingQueueRunning === true) {
        /* prettier-ignore */ nestedCountersInstance.countEvent('stateManager', 'newAcceptedTxQueueRunning === true')
        return
      }
      this.transactionProcessingQueueRunning = true
      this.isStuckProcessing = false
      this.debugLastProcessingQueueStartTime = shardusGetTime()

      // ensure there is some rest between processing loops
      const timeSinceLastRun = startTime - this.processingLastRunTime
      if (timeSinceLastRun < this.processingMinRunBreak) {
        const sleepTime = Math.max(5, this.processingMinRunBreak - timeSinceLastRun)
        await utils.sleep(sleepTime)
        nestedCountersInstance.countEvent('processing', 'resting')
      }

      if (this.transactionQueueHasRemainingWork && timeSinceLastRun > 500) {
        /* prettier-ignore */ if (logFlags.verbose) this.statemanager_fatal(`processAcceptedTxQueue left busy and waited too long to restart`, `processAcceptedTxQueue left busy and waited too long to restart ${timeSinceLastRun / 1000} `)
      }

      this.profiler.profileSectionStart('processQ')

      if (logFlags.seqdiagram)
        this.mainLogger.info(
          `0x10052024 ${ipInfo.externalIp} ${shardusGetTime()} 0x0000 processTransactions _transactionQueue.length ${
            this._transactionQueue.length
          }`
        )

      if (this.stateManager.currentCycleShardData == null) {
        nestedCountersInstance.countEvent('stateManager', 'currentCycleShardData == null early exit')
        return
      }

      if (this._transactionQueue.length === 0 && this.pendingTransactionQueue.length === 0) {
        return
      }

      if (this.queueRestartCounter == null) {
        this.queueRestartCounter = 0
      }
      this.queueRestartCounter++

      const localRestartCounter = this.queueRestartCounter

      const timeM = this.stateManager.queueSitTime
      // const timeM2 = timeM * 2 // 12s
      // const timeM2_5 = timeM * 2.25 // 13.5s
      // const timeM3 = timeM * 2.5 // 15s
      const timeM2 = timeM * 2
      const timeM2_5 = timeM * 2.5
      const timeM3 = timeM * 3
      const timeM5 = timeM * 5
      let currentTime = shardusGetTime()

      const app = this.app

      // process any new queue entries that were added to the temporary list
      if (this.pendingTransactionQueue.length > 0) {
        for (const txQueueEntry of this.pendingTransactionQueue) {
          nestedCountersInstance.countEvent('stateManager', 'processAcceptedTxQueue injest: kept TX')

          const timestamp = txQueueEntry.txKeys.timestamp
          const acceptedTx = txQueueEntry.acceptedTx
          const txId = acceptedTx.txId
          // Find the time sorted spot in our queue to insert this TX into
          // reverse loop because the news (largest timestamp) values are at the end of the array
          // todo faster version (binary search? to find where we need to insert)
          let index = this._transactionQueue.length - 1
          // eslint-disable-next-line security/detect-object-injection
          let lastTx = this._transactionQueue[index]
          while (
            index >= 0 &&
            (timestamp > lastTx.txKeys.timestamp ||
              (timestamp === lastTx.txKeys.timestamp && txId < lastTx.acceptedTx.txId))
          ) {
            index--
            // eslint-disable-next-line security/detect-object-injection
            lastTx = this._transactionQueue[index]
          }

          const age = shardusGetTime() - timestamp
          if (age > timeM * 0.9) {
            // IT turns out the correct thing to check is didSync flag only report errors if we did not wait on this TX while syncing
            if (txQueueEntry.didSync == false) {
              /* prettier-ignore */ if (logFlags.verbose) this.statemanager_fatal(`processAcceptedTxQueue_oldTX.9 fromClient:${txQueueEntry.fromClient}`, `processAcceptedTxQueue cannot accept tx older than 0.9M ${timestamp} age: ${age} fromClient:${txQueueEntry.fromClient}`)
              /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_processAcceptedTxQueueTooOld1', `${utils.makeShortHash(txQueueEntry.acceptedTx.txId)}`, 'processAcceptedTxQueue working on older tx ' + timestamp + ' age: ' + age)
              //txQueueEntry.waitForReceiptOnly = true
            }
          }
          if (age > timeM) {
            /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_processAcceptedTxQueueTooOld2', `${utils.makeShortHash(txQueueEntry.acceptedTx.txId)}`, 'processAcceptedTxQueue working on older tx ' + timestamp + ' age: ' + age)
            nestedCountersInstance.countEvent('processing', 'txExpired1 > M. waitForReceiptOnly')
            txQueueEntry.waitForReceiptOnly = true
            if (this.config.stateManager.txStateMachineChanges) {
              this.updateTxState(txQueueEntry, 'await final data', 'processTx1')
            } else {
              this.updateTxState(txQueueEntry, 'consensing')
            }
          }

          // do not injest tranactions that are long expired. there could be 10k+ of them if we are restarting the processing queue
          if (age > timeM3 * 5 && this.stateManager.config.stateManager.discardVeryOldPendingTX === true) {
            nestedCountersInstance.countEvent('txExpired', 'txExpired3 > M3 * 5. pendingTransactionQueue')

            continue
          }

          txQueueEntry.approximateCycleAge = this.stateManager.currentCycleShardData.cycleNumber
          //insert this tx into the main queue
          this._transactionQueue.splice(index + 1, 0, txQueueEntry)
          this._transactionQueueByID.set(txQueueEntry.acceptedTx.txId, txQueueEntry)

          /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455105 ${shardusGetTime()} tx:${txQueueEntry.acceptedTx.txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: aging`)

          processStats.inserted++

          /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_addToQueue', `${txId}`, `AcceptedTransaction: ${txQueueEntry.logID} ts: ${txQueueEntry.txKeys.timestamp} acc: ${utils.stringifyReduce(txQueueEntry.txKeys.allKeys)} indexInserted: ${index + 1}`)
          this.stateManager.eventEmitter.emit('txQueued', acceptedTx.txId)
        }
        this.pendingTransactionQueue = []
        this.pendingTransactionQueueByID.clear()
      }

      let currentIndex = this._transactionQueue.length - 1

      let lastLog = 0
      currentIndex++ //increment once so we can handle the decrement at the top of the loop and be safe about continue statements

      let lastRest = shardusGetTime()
      while (this._transactionQueue.length > 0) {
        // update current time with each pass through the loop
        currentTime = shardusGetTime()

        if (currentTime - lastRest > 1000) {
          //add a brief sleep if we have been in this loop for a long time
          nestedCountersInstance.countEvent('processing', 'forcedSleep')
          await utils.sleep(5) //5ms sleep
          lastRest = currentTime

          if (
            currentTime - this.stateManager.currentCycleShardData.calculationTime >
            this.config.p2p.cycleDuration * 1000 + 5000
          ) {
            nestedCountersInstance.countEvent('processing', 'old cycle data >5s past due')
          }
          if (
            currentTime - this.stateManager.currentCycleShardData.calculationTime >
            this.config.p2p.cycleDuration * 1000 + 11000
          ) {
            nestedCountersInstance.countEvent('processing', 'very old cycle data >11s past due')
            return //loop will restart.
          }
        }

        //Handle an odd case where the finally did not catch exiting scope.
        if (pushedProfilerTag != null) {
          this.profiler.profileSectionEnd(`process-${pushedProfilerTag}`)
          this.profiler.profileSectionEnd(`process-patched1-${pushedProfilerTag}`)
          pushedProfilerTag = null
        }

        currentIndex--
        if (currentIndex < 0) {
          break
        }

        this.clearDebugAwaitStrings()

        // eslint-disable-next-line security/detect-object-injection
        const queueEntry: QueueEntry | undefined = this._transactionQueue[currentIndex]
        if (queueEntry == null) {
          this.statemanager_fatal(`queueEntry is null`, `currentIndex:${currentIndex}`)
          nestedCountersInstance.countEvent('processing', 'error: null queue entry. skipping to next TX')
          continue
        }
        if (logFlags.seqdiagram)
          this.mainLogger.info(
            `0x10052024 ${ipInfo.externalIp} ${shardusGetTime()} 0x0001 currentIndex:${currentIndex} txId:${
              queueEntry.acceptedTx.txId
            } state:${queueEntry.state}`
          )
        const txTime = queueEntry.txKeys.timestamp
        const txAge = currentTime - txTime

        this.debugRecentQueueEntry = queueEntry

        // current queue entry is younger than timeM, so nothing to do yet.
        if (txAge < timeM) {
          break
        }

        if (localRestartCounter < this.queueRestartCounter && lastLog !== this.queueRestartCounter) {
          lastLog = this.queueRestartCounter
          /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('queueRestart_error', `${queueEntry.acceptedTx.txId}`, `qId: ${queueEntry.entryID} qRst:${localRestartCounter}  qrstGlobal:${this.queueRestartCounter}}`)
        }

        this.stateManager.debugTXHistory[queueEntry.logID] = queueEntry.state
        const hasApplyReceipt = queueEntry.signedReceipt != null
        const hasReceivedApplyReceipt = queueEntry.receivedSignedReceipt != null
        const hasReceivedApplyReceiptForRepair = queueEntry.signedReceiptForRepair != null
        const shortID = queueEntry.logID //`${utils.makeShortHash(queueEntry.acceptedTx.id)}`

        // on the off chance we are here with a pass of fail state remove this from the queue.
        // log fatal because we do not want to get to this situation.
        if (queueEntry.state === 'pass' || queueEntry.state === 'fail') {
          this.statemanager_fatal(
            `pass or fail entry should not be in queue`,
            `txid: ${shortID} state: ${queueEntry.state} receiptEverRequested:${queueEntry.receiptEverRequested} age:${txAge}`
          )
          this.removeFromQueue(queueEntry, currentIndex)
          continue
        }

        //turn off all this logic to futher simplify things
        if (this.queueTimingFixes === false) {
          // TIME OUT / EXPIRATION CHECKS
          // Check if transactions have expired and failed, or if they have timed out and ne need to request receipts.
          if (this.stateManager.accountSync.dataSyncMainPhaseComplete === true) {
            // Everything in here is after we finish our initial sync

            // didSync: refers to the syncing process.  True is for TXs that we were notified of
            //          but had to delay action on because the initial or a runtime thread was busy syncing on.

            // For normal didSync===false TXs we are expiring them after M3*2
            //     This gives a bit of room to attempt a repair.
            //     if a repair or reciept process fails there are cases below to expire the the
            //     tx as early as time > M3
            if (txAge > timeM3 * 2 && queueEntry.didSync == false) {
              //this.statistics.incrementCounter('txExpired')
              //let seenInQueue = this.processQueue_accountSeen(seenAccounts, queueEntry)

              this.statemanager_fatal(
                `txExpired1 > M3 * 2. NormalTX Timed out.`,
                `txExpired txAge > timeM3*2 && queueEntry.didSync == false. ` +
                  `txid: ${shortID} state: ${
                    queueEntry.state
                  } applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} hasReceivedApplyReceiptForRepair:${hasReceivedApplyReceiptForRepair} receiptEverRequested:${
                    queueEntry.receiptEverRequested
                  } age:${txAge} ${utils.stringifyReduce(queueEntry.uniqueWritableKeys)}`
              )
              if (queueEntry.receiptEverRequested && queueEntry.globalModification === false) {
                this.statemanager_fatal(
                  `txExpired1 > M3 * 2 -!receiptEverRequested`,
                  `txExpired txAge > timeM3*2 && queueEntry.didSync == false. !receiptEverRequested ` +
                    `txid: ${shortID} state: ${queueEntry.state} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} hasReceivedApplyReceiptForRepair:${hasReceivedApplyReceiptForRepair} receiptEverRequested:${queueEntry.receiptEverRequested} age:${txAge}`
                )
              }
              if (queueEntry.globalModification) {
                this.statemanager_fatal(
                  `txExpired1 > M3 * 2 -GlobalModification!!`,
                  `txExpired txAge > timeM3*2 && queueEntry.didSync == false. !receiptEverRequested ` +
                    `txid: ${shortID} state: ${queueEntry.state} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} hasReceivedApplyReceiptForRepair:${hasReceivedApplyReceiptForRepair} receiptEverRequested:${queueEntry.receiptEverRequested} age:${txAge}`
                )
              }
              /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('txExpired', `${shortID}`, `${queueEntry.txGroupDebug} txExpired ${utils.stringifyReduce(queueEntry.acceptedTx)}`)
              /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('txExpired', `${shortID}`, `${queueEntry.txGroupDebug} queueEntry.receivedSignedReceipt: ${utils.stringifyReduce(queueEntry.receivedSignedReceipt)}`)

              /* prettier-ignore */ nestedCountersInstance.countEvent('txExpired', `> M3 * 2. NormalTX Timed out. didSync == false. state:${queueEntry.state} globalMod:${queueEntry.globalModification}`)

              if (configContext.stateManager.disableTxExpiration === false) {
                this.setTXExpired(queueEntry, currentIndex, 'old, timeM3 * 2')
                continue
              }
            }

            // lots of logic about when we can repair or not repair/when to wait etc.
            if (this.queueTimingFixes === false) {
              // This is the expiry case where requestingReceiptFailed
              if (txAge > timeM3 && queueEntry.requestingReceiptFailed) {
                //this.statistics.incrementCounter('txExpired')

                this.statemanager_fatal(
                  `txExpired3 > M3. receiptRequestFail after Timed Out`,
                  `txExpired txAge > timeM3 && queueEntry.requestingReceiptFailed ` +
                    `txid: ${shortID} state: ${queueEntry.state} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} age:${txAge}`
                )
                /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('txExpired', `${shortID}`, `${queueEntry.txGroupDebug} txExpired 3 requestingReceiptFailed  ${utils.stringifyReduce(queueEntry.acceptedTx)} ${queueEntry.didWakeup}`)
                /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('txExpired', `${shortID}`, `${queueEntry.txGroupDebug} queueEntry.receivedSignedReceipt 3 requestingReceiptFailed: ${utils.stringifyReduce(queueEntry.receivedSignedReceipt)}`)

                /* prettier-ignore */ nestedCountersInstance.countEvent('txExpired', `> M3. receiptRequestFail after Timed Out. state:${queueEntry.state} globalMod:${queueEntry.globalModification}`)

                if (configContext.stateManager.disableTxExpiration === false) {
                  this.setTXExpired(queueEntry, currentIndex, 'old, timeM3, requestingReceiptFailed')
                  continue
                }
              }

              // This is the expiry case where repairFailed
              //     TODO.  I think as soon as a repair as marked as failed we can expire and remove it from the queue
              //            But I am leaving this optimizaiton out for now since we really don't want to plan on repairs failing
              if (txAge > timeM3 && queueEntry.repairFailed) {
                //this.statistics.incrementCounter('txExpired')

                this.statemanager_fatal(
                  `txExpired3 > M3. repairFailed after Timed Out`,
                  `txExpired txAge > timeM3 && queueEntry.repairFailed ` +
                    `txid: ${shortID} state: ${queueEntry.state} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} age:${txAge}`
                )
                /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('txExpired', `${shortID}`, `${queueEntry.txGroupDebug} txExpired 3 repairFailed  ${utils.stringifyReduce(queueEntry.acceptedTx)} ${queueEntry.didWakeup}`)
                /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('txExpired', `${shortID}`, `${queueEntry.txGroupDebug} queueEntry.receivedSignedReceipt 3 repairFailed: ${utils.stringifyReduce(queueEntry.receivedSignedReceipt)}`)

                /* prettier-ignore */ nestedCountersInstance.countEvent('txExpired', `> M3. repairFailed after Timed Out. state:${queueEntry.state} globalMod:${queueEntry.globalModification}`)

                if (configContext.stateManager.disableTxExpiration === false) {
                  this.setTXExpired(queueEntry, currentIndex, 'old, timeM3, repairFailed')
                  continue
                }
              }

              // a few cases to wait for a receipt or request a receipt
              if (queueEntry.state != 'await repair' && queueEntry.state != 'commiting') {
                //Not yet expired case: getting close to expire so just move to consensing and wait.
                //Just wait for receipt only if we are awaiting data and it is getting late
                if (
                  txAge > timeM2_5 &&
                  queueEntry.m2TimeoutReached === false &&
                  queueEntry.globalModification === false &&
                  queueEntry.requestingReceipt === false
                ) {
                  if (queueEntry.state == 'awaiting data') {
                    // no receipt yet, and state not committing
                    if (queueEntry.receivedSignedReceipt == null && queueEntry.signedReceipt == null) {
                      /* prettier-ignore */ if (logFlags.verbose) if (logFlags.error) this.mainLogger.error(`Wait for reciept only: txAge > timeM2_5 txid:${shortID} `)
                      /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('txMissingReceipt3', `${shortID}`, `processAcceptedTxQueue ` + `txid: ${shortID} state: ${queueEntry.state} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} age:${txAge}`)

                      /* prettier-ignore */ nestedCountersInstance.countEvent('txMissingReceipt', `Wait for reciept only: txAge > timeM2.5. state:${queueEntry.state} globalMod:${queueEntry.globalModification}`)
                      queueEntry.waitForReceiptOnly = true
                      queueEntry.m2TimeoutReached = true

                      if (this.config.stateManager.txStateMachineChanges) {
                        this.updateTxState(queueEntry, 'await final data', 'processTx2')
                      } else {
                        this.updateTxState(queueEntry, 'consensing')
                      }
                      continue
                    }
                  }
                }

                //receipt requesting is not going to work with current timeouts.
                if (queueEntry.requestingReceipt === true) {
                  this.processQueue_markAccountsSeen(seenAccounts, queueEntry)
                  continue
                }

                // The TX technically expired past M3, but we will now request reciept in hope that we can repair the tx
                if (
                  txAge > timeM3 &&
                  queueEntry.requestingReceiptFailed === false &&
                  queueEntry.globalModification === false
                ) {
                  if (this.stateManager.hasReceipt(queueEntry) === false && queueEntry.requestingReceipt === false) {
                    /* prettier-ignore */ if (logFlags.verbose) if (logFlags.error) this.mainLogger.error(`txAge > timeM3 => ask for receipt now ` + `txid: ${shortID} state: ${queueEntry.state} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} age:${txAge}`)
                    /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('txMissingReceipt1', `txAge > timeM3 ${shortID}`, `syncNeedsReceipt ${shortID}`)

                    const seen = this.processQueue_accountSeen(seenAccounts, queueEntry)

                    this.processQueue_markAccountsSeen(seenAccounts, queueEntry)
                    this.queueEntryRequestMissingReceipt(queueEntry)

                    /* prettier-ignore */ nestedCountersInstance.countEvent('txMissingReceipt', `txAge > timeM3 => ask for receipt now. state:${queueEntry.state} globalMod:${queueEntry.globalModification} seen:${seen}`)
                    queueEntry.waitForReceiptOnly = true
                    queueEntry.m2TimeoutReached = true

                    if (this.config.stateManager.txStateMachineChanges) {
                      this.updateTxState(queueEntry, 'await final data', 'processTx3')
                    } else {
                      this.updateTxState(queueEntry, 'consensing')
                    }
                    continue
                  }
                }
              }
            }
          } else {
            //check for TX older than 30x M3 and expire them
            if (txAge > timeM3 * 50) {
              //this.statistics.incrementCounter('txExpired')

              this.statemanager_fatal(
                `txExpired4`,
                `Still on inital syncing.  txExpired txAge > timeM3 * 50. ` +
                  `txid: ${shortID} state: ${queueEntry.state} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} age:${txAge}`
              )
              /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('txExpired', `${shortID}`, `${queueEntry.txGroupDebug} txExpired 4  ${utils.stringifyReduce(queueEntry.acceptedTx)}`)
              /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('txExpired', `${shortID}`, `${queueEntry.txGroupDebug} queueEntry.receivedSignedReceipt 4: ${utils.stringifyReduce(queueEntry.receivedSignedReceipt)}`)

              /* prettier-ignore */ nestedCountersInstance.countEvent('txExpired', `txExpired txAge > timeM3 * 50. still syncing. state:${queueEntry.state} globalMod:${queueEntry.globalModification}`)

              this.setTXExpired(queueEntry, currentIndex, 'old, timeM3 * 50!!')
              continue
            }
          }
        }

        if (this.queueTimingFixes === true) {
          //if we are still waiting on an upstream TX at this stage in the pipeline,
          //then kill the TX because there is not much hope for it
          //This will help make way for other TXs with a better chance
          if (queueEntry.state === 'processing' || queueEntry.state === 'awaiting data') {
            if (this.processQueue_accountSeen(seenAccounts, queueEntry) === true) {
              //adding txSieve time!
              if (txAge > timeM2 + queueEntry.txSieveTime) {
                if (configContext.stateManager.disableTxExpiration === false) {
                  /* prettier-ignore */ nestedCountersInstance.countEvent('txExpired', `> M2 canceled due to upstream TXs. state:${queueEntry.state} hasAll:${queueEntry.hasAll} globalMod:${queueEntry.globalModification}`)
                  //todo only keep on for temporarliy
                  /* prettier-ignore */ nestedCountersInstance.countEvent('txExpired', `> M2 canceled due to upstream TXs. sieveT:${queueEntry.txSieveTime}`)
                  this.setTXExpired(queueEntry, currentIndex, 'm2, processing or awaiting')
                  if (configContext.stateManager.stuckTxQueueFix) continue // we need to skip this TX and move to the next one
                }
                if (configContext.stateManager.stuckTxQueueFix === false) continue
              }
            }
          }
          // check  if we seen a vote or has a vote
          const hasSeenVote = queueEntry.receivedBestVote != null || queueEntry.ourVote != null
          const hasSeenConfirmation = queueEntry.receivedBestConfirmation != null

          // remove TXs that are stuck in the processing queue for 2 min
          if (
            configContext.stateManager.removeStuckTxsFromQueue === true &&
            txAge > configContext.stateManager.stuckTxRemoveTime
          ) {
            nestedCountersInstance.countEvent(
              'txSafelyRemoved',
              `stuck_in_consensus_1 ${configContext.stateManager.stuckTxRemoveTime / 1000}`
            )
            this.statemanager_fatal(
              `txSafelyRemoved_1`,
              `stuck_in_consensus_3 txid: ${shortID} state: ${queueEntry.state} age:${txAge}`
            )
            if (logFlags.txCancel)
              this.statemanager_fatal(`txSafelyRemoved_1_dump`, `${this.getDebugQueueInfo(queueEntry)}`)
            this.removeFromQueue(queueEntry, currentIndex)
            continue
          }

          if (configContext.stateManager.removeStuckTxsFromQueue2 === true) {
            const timeSinceLastVoteMessage =
              queueEntry.lastVoteReceivedTimestamp > 0 ? currentTime - queueEntry.lastVoteReceivedTimestamp : 0
            // see if we have been consensing for more than a long time.
            // follow up code needs to handle this in a better way
            // if there is a broken TX at the end of a chain. this will peel it off.
            // any freshly exposed TXs will have a fair amount of time to be in consensus so
            // this should minimize the risk of OOS.
            if (timeSinceLastVoteMessage > configContext.stateManager.stuckTxRemoveTime2) {
              nestedCountersInstance.countEvent(
                'txSafelyRemoved',
                `stuck_in_consensus_2 tx waiting for votes more than ${
                  configContext.stateManager.stuckTxRemoveTime2 / 1000
                } seconds. state: ${queueEntry.state}`
              )
              this.statemanager_fatal(
                `txSafelyRemoved_2`,
                `stuck_in_consensus_2. waiting for votes. txid: ${shortID} state: ${
                  queueEntry.state
                } age:${txAge} tx first vote seen ${timeSinceLastVoteMessage / 1000} seconds ago`
              )
              if (logFlags.txCancel)
                this.statemanager_fatal(`txSafelyRemoved_2_dump`, `${this.getDebugQueueInfo(queueEntry)}`)
              this.removeFromQueue(queueEntry, currentIndex)
              continue
            }
          }

          if (configContext.stateManager.removeStuckTxsFromQueue3 === true) {
            if (queueEntry.state === 'consensing' && txAge > configContext.stateManager.stuckTxRemoveTime3) {
              const anyVotes = queueEntry.lastVoteReceivedTimestamp > 0
              nestedCountersInstance.countEvent(
                'txSafelyRemoved',
                `stuck_in_consensus_3 tx in consensus more than ${
                  configContext.stateManager.stuckTxRemoveTime3 / 1000
                } seconds. state: ${queueEntry.state} has seen vote: ${anyVotes}`
              )
              this.statemanager_fatal(
                `txSafelyRemoved_3`,
                `stuck_in_consensus_3. txid: ${shortID} state: ${queueEntry.state} age:${txAge}`
              )
              if (logFlags.txCancel)
                this.statemanager_fatal(`txSafelyRemoved_3_dump`, `${this.getDebugQueueInfo(queueEntry)}`)
              this.removeFromQueue(queueEntry, currentIndex)
              continue
            }
          }

          if (txAge > timeM3 + configContext.stateManager.noVoteSeenExpirationTime && !hasSeenVote) {
            // seen no vote but past timeM3 + noVoteSeenExpirationTime
            // nestedCountersInstance.countEvent('txExpired', `> timeM3 + noVoteSeenExpirationTime`)
            // this.mainLogger.error(`${queueEntry.logID} txAge > timeM3 + noVoteSeenExpirationTime general case. no vote seen`)
            if (configContext.stateManager.disableTxExpiration === false) {
              this.setTXExpired(
                queueEntry,
                currentIndex,
                'txAge > timeM3 + noVoteSeenExpirationTime general case. no vote seen'
              )
              continue
            }
          }
          if (
            txAge > timeM3 + configContext.stateManager.voteSeenExpirationTime &&
            hasSeenVote &&
            !hasSeenConfirmation
          ) {
            if (configContext.stateManager.disableTxExpiration === false) {
              nestedCountersInstance.countEvent('txExpired', `> timeM3 + voteSeenExpirationTime`)
              this.mainLogger.error(
                `${queueEntry.logID} txAge > timeM3 + voteSeenExpirationTime general case has vote but fail to generate receipt`
              )
              this.setTXExpired(
                queueEntry,
                currentIndex,
                'txAge > timeM3 + voteSeenExpirationTime general case has vote but fail' + ' to' + ' commit the tx'
              )
              continue
            }
          }
          if (txAge > timeM3 + configContext.stateManager.confirmationSeenExpirationTime) {
            let shouldExpire = true
            if (queueEntry.hasRobustConfirmation && queueEntry.isInExecutionHome) {
              nestedCountersInstance.countEvent(
                'txExpired',
                `> timeM3 + confirmSeenExpirationTime but hasRobustConfirmation = true, not expiring`
              )
              shouldExpire = false
            }
            if (shouldExpire && configContext.stateManager.disableTxExpiration === false) {
              nestedCountersInstance.countEvent(
                'txExpired',
                `> timeM3 + confirmSeenExpirationTime hasRobustConfirmation: ${queueEntry.hasRobustConfirmation}`
              )
              this.setTXExpired(
                queueEntry,
                currentIndex,
                'txAge > timeM3 + confirmSeenExpirationTime general case has' +
                  ' vote and robust confirmation but fail' +
                  ' to' +
                  ' commit the tx'
              )
              continue
            }
          }
          if (txAge > timeM3 + configContext.stateManager.confirmationSeenExpirationTime + 10000) {
            // nestedCountersInstance.countEvent('txExpired', `txAge > timeM3 + confirmSeenExpirationTime + 10s`)
            // maybe we missed the spread_appliedReceipt2 gossip, go to await final data if we have a confirmation
            // we will request the final data (and probably receipt2)
            if (
              configContext.stateManager.disableTxExpiration &&
              hasSeenVote &&
              queueEntry.firstVoteReceivedTimestamp > 0
            ) {
              // nestedCountersInstance.countEvent('txExpired', `> timeM3 + confirmSeenExpirationTime state: ${queueEntry.state} hasSeenVote: ${hasSeenVote} hasSeenConfirmation: ${hasSeenConfirmation} waitForReceiptOnly: ${queueEntry.waitForReceiptOnly}`)
              if (this.config.stateManager.txStateMachineChanges) {
                if (configContext.stateManager.stuckTxQueueFix) {
                  if (configContext.stateManager.singleAccountStuckFix) {
                    const timeSinceVoteSeen = shardusGetTime() - queueEntry.firstVoteReceivedTimestamp
                    // if we has seenVote but still stuck in consensing state, we should go to await final data and ask receipt+data

                    //note: this block below may not be what we want in POQo, but is behind a long time setting for now (in dapp)
                    //need to consider some clean up here
                    if (
                      queueEntry.state === 'consensing' &&
                      timeSinceVoteSeen > configContext.stateManager.stuckTxMoveTime
                    ) {
                      if (logFlags.debug)
                        this.mainLogger.debug(
                          `txId ${queueEntry.logID} move stuck consensing tx to await final data. timeSinceVoteSeen: ${timeSinceVoteSeen} ms`
                        )
                      nestedCountersInstance.countEvent('consensus', `move stuck consensing tx to await final data.`)
                      this.updateTxState(queueEntry, 'await final data')
                    }
                  } else {
                    // make sure we are not resetting the state and causing state start timestamp to be updated repeatedly
                    if (queueEntry.state !== 'await final data' && queueEntry.state !== 'await repair')
                      this.updateTxState(queueEntry, 'await final data')
                  }
                } else {
                  this.updateTxState(queueEntry, 'await final data', 'processTx4')
                }
              } else {
                this.updateTxState(queueEntry, 'consensing')
              }
              if (configContext.stateManager.stuckTxQueueFix === false) continue // we should not skip this TX
            }
            if (configContext.stateManager.disableTxExpiration === false) {
              this.setTXExpired(queueEntry, currentIndex, 'txAge > timeM3 + confirmSeenExpirationTime + 10s')
              continue
            }
          }

          //If we are past time M2 there are few cases where we should give up on a TX right away
          //Handle that here
          if (txAge > timeM2) {
            let expireTx = false
            let reason = ''
            //not sure this path can even happen.  but we addding it for completeness in case it comes back (abilty to requets receipt)
            if (queueEntry.requestingReceiptFailed) {
              expireTx = true
              reason = 'requestingReceiptFailed'
            }
            if (queueEntry.repairFailed) {
              expireTx = true
              reason = 'repairFailed'
            }
            if (expireTx) {
              this.statemanager_fatal(
                `txExpired3 > M2. fail ${reason}`,
                `txExpired txAge > timeM2 fail ${reason} ` +
                  `txid: ${shortID} state: ${queueEntry.state} hasAll:${queueEntry.hasAll} applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} age:${txAge}`
              )
              /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('txExpired', `${shortID}`, `${queueEntry.txGroupDebug} txExpired >m2 fail ${reason}  ${utils.stringifyReduce(queueEntry.acceptedTx)} ${queueEntry.didWakeup}`)
              //if (logFlags.playback) this.logger.playbackLogNote('txExpired', `${shortID}`, `${queueEntry.txGroupDebug} queueEntry.recievedAppliedReceipt 3 requestingReceiptFailed: ${utils.stringifyReduce(queueEntry.recievedAppliedReceipt)}`)

              /* prettier-ignore */ nestedCountersInstance.countEvent('txExpired', `> timeM2 fail ${reason} state:${queueEntry.state} hasAll:${queueEntry.hasAll} globalMod:${queueEntry.globalModification} `)

              if (configContext.stateManager.disableTxExpiration === false) {
                this.setTXExpired(queueEntry, currentIndex, 'm2 ' + reason)
              }
            }
          }

          //if(extendedTimeoutLogic === true){

          //}
          const isConsensing = queueEntry.state === 'consensing'
          //let isCommiting = queueEntry.state === 'commiting'
          const isAwaitingFinalData = queueEntry.state === 'await final data'
          const isInExecutionHome = queueEntry.isInExecutionHome
          //note this wont work with old receipts but we can depricate old receipts soon
          const signedReceipt = this.stateManager.getSignedReceipt(queueEntry)
          const hasReceipt = signedReceipt != null
          const hasCastVote = queueEntry.ourVote != null

          let extraTime = 0
          //let cantExpire = false
          let matchingReceipt = false

          if (isInExecutionHome && isConsensing && hasReceipt === false) {
            //give a bit of extra time to wait for votes to come in
            extraTime = timeM * 0.5
          }

          //this should cover isCommiting
          if (isInExecutionHome && hasReceipt) {
            matchingReceipt = this.stateManager.transactionConsensus.hasAppliedReceiptMatchingPreApply(queueEntry, null)
            //give even more time
            extraTime = timeM
          }

          // if we have not added extra time yet then add time for a vote.
          if (extraTime < timeM && hasCastVote === true) {
            //this would be a way to just statically add to the time
            //extraTime = timeM
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

          //round extraTime to up to nearest 500ms (needed for counter aggregation)
          if (extraTime > 0) {
            extraTime = Math.ceil(extraTime / 500) * 500
            if (extraTime > timeM) {
              extraTime = timeM
            }
          }

          // Have a hard cap where we ALMOST expire but NOT remove TXs from queue after time > M3
          if (
            txAge > timeM3 + extraTime &&
            queueEntry.isInExecutionHome &&
            queueEntry.almostExpired == null &&
            configContext.stateManager.disableTxExpiration === false
          ) {
            const hasVoted = queueEntry.ourVote != null
            const receivedVote = queueEntry.receivedBestVote != null
            if (!receivedVote && !hasVoted && queueEntry.almostExpired == null) {
              this.statemanager_fatal(
                `setTxAlmostExpired > M3. general case`,
                `setTxAlmostExpired txAge > timeM3 general case ` +
                  `txid: ${shortID} state: ${queueEntry.state} hasAll:${
                    queueEntry.hasAll
                  } applyReceipt:${hasApplyReceipt} receivedSignedReceipt:${hasReceivedApplyReceipt} age:${txAge}  hasReceipt:${hasReceipt} matchingReceipt:${matchingReceipt} isInExecutionHome:${isInExecutionHome} hasVote: ${
                    queueEntry.receivedBestVote != null
                  }`
              )
              /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('txExpired', `${shortID}`, `setTxAlmostExpired ${queueEntry.txGroupDebug} txExpired 3 requestingReceiptFailed  ${utils.stringifyReduce(queueEntry.acceptedTx)} ${queueEntry.didWakeup}`)
              //if (logFlags.playback) this.logger.playbackLogNote('txExpired', `${shortID}`, `${queueEntry.txGroupDebug} queueEntry.recievedAppliedReceipt 3 requestingReceiptFailed: ${utils.stringifyReduce(queueEntry.recievedAppliedReceipt)}`)

              /* prettier-ignore */ nestedCountersInstance.countEvent('txExpired', `setTxAlmostExpired > M3. general case state:${queueEntry.state} hasAll:${queueEntry.hasAll} globalMod:${queueEntry.globalModification} hasReceipt:${hasReceipt} matchingReceipt:${matchingReceipt} isInExecutionHome:${isInExecutionHome} hasVote: ${queueEntry.receivedBestVote != null}`)
              /* prettier-ignore */ nestedCountersInstance.countEvent('txExpired', `setTxAlmostExpired > M3. general case sieveT:${queueEntry.txSieveTime} extraTime:${extraTime}`)

              nestedCountersInstance.countEvent(
                'txExpired',
                'set to almostExpired because we have not voted' + ' or received' + ' a' + ' vote'
              )
              this.setTxAlmostExpired(queueEntry, currentIndex, 'm3 general: almostExpired not voted or received vote')
            }
            // continue
          }

          //TODO? could we remove a TX from the queu as soon as a receit was requested?
          //TODO?2 should we allow a TX to use a repair op shortly after being expired? (it would have to be carefull, and maybe use some locking)
        }

        const txStartTime = shardusGetTime()

        // HANDLE TX logic based on state.
        try {
          this.profiler.profileSectionStart(`process-${queueEntry.state}`)
          if (logFlags.profiling_verbose)
            profilerInstance.scopedProfileSectionStart(`scoped-process-${queueEntry.state}`, false)
          pushedProfilerTag = queueEntry.state

          if (queueEntry.state === 'syncing') {
            ///////////////////////////////////////////////--syncing--////////////////////////////////////////////////////////////
            // a queueEntry will be put in syncing state if it is queue up while we are doing initial syncing or if
            // we are syncing a range of new edge partition data.
            // we hold it in limbo until the syncing operation is complete.  When complete all of these TXs are popped
            // and put back into the queue.  If it has been too long they will go into a repair to receipt mode.
            // IMPORTANT thing is that we mark the accounts as seen, because we cant use this account data
            //   in TXs that happen after until this is resolved.

            //the syncing process is not fully reliable when popping synced TX.  this is a backup check to see if we can get out of syncing state
            if (queueEntry.syncCounter <= 0) {
              nestedCountersInstance.countEvent('sync', 'syncing state needs bump')

              queueEntry.waitForReceiptOnly = true

              // old logic changed state here (seen commented out in the new mode)
              if (this.config.stateManager.txStateMachineChanges) {
                // this.updateTxState(queueEntry, 'await final data')
              } else {
                this.updateTxState(queueEntry, 'await final data', 'processTx5')
              }
            }

            this.processQueue_markAccountsSeen(seenAccounts, queueEntry)
          } else if (queueEntry.state === 'aging') {
            queueEntry.executionDebug = { a: 'go' }
            ///////////////////////////////////////////--aging--////////////////////////////////////////////////////////////////
            // We wait in the aging phase, and mark accounts as seen to prevent a TX that is after this from using or changing data
            // on the accounts in this TX
            // note that code much earlier in the loop rejects any queueEntries younger than time M
            this.updateTxState(queueEntry, 'processing')
            this.processQueue_markAccountsSeen(seenAccounts, queueEntry)
          }
          if (queueEntry.state === 'processing') {
            ////////////////////////////////////////--processing--///////////////////////////////////////////////////////////////////
            if (this.processQueue_accountSeen(seenAccounts, queueEntry) === false) {
              // Processing is when we start doing real work.  the task is to read and share the correct account data to the correct
              // corresponding nodes and then move into awaiting data phase

              this.processQueue_markAccountsSeen(seenAccounts, queueEntry)
              const time = shardusGetTime()
              try {
                // TODO re-evaluate if it is correct for us to share info for a global modifing TX.
                //if(queueEntry.globalModification === false) {
                const awaitStart = shardusGetTime()

                if (this.executeInOneShard === true) {
                  /* prettier-ignore */ this.setDebugLastAwaitedCall('this.stateManager.transactionQueue.tellCorrespondingNodes(queueEntry)')
                  profilerInstance.scopedProfileSectionStart(`scoped-tellCorrespondingNodes`)
                  if (configContext.p2p.useFactCorrespondingTell) {
                    await this.factTellCorrespondingNodes(queueEntry)
                  } else {
                    await this.tellCorrespondingNodes(queueEntry)
                  }
                  profilerInstance.scopedProfileSectionEnd(`scoped-tellCorrespondingNodes`)
                  /* prettier-ignore */ this.setDebugLastAwaitedCall('this.stateManager.transactionQueue.tellCorrespondingNodes(queueEntry)', DebugComplete.Completed)
                } else {
                  /* prettier-ignore */ this.setDebugLastAwaitedCall('this.stateManager.transactionQueue.tellCorrespondingNodesOld(queueEntry)')
                  //specific fixes were needed for tellCorrespondingNodes.  tellCorrespondingNodesOld is the old version before fixes
                  if (configContext.p2p.useFactCorrespondingTell) {
                    await this.factTellCorrespondingNodes(queueEntry)
                  } else {
                    await this.tellCorrespondingNodes(queueEntry)
                  }
                  /* prettier-ignore */ this.setDebugLastAwaitedCall('this.stateManager.transactionQueue.tellCorrespondingNodesOld(queueEntry)', DebugComplete.Completed)
                }
                queueEntry.dataSharedTimestamp = shardusGetTime()
                if (logFlags.debug)
                  /* prettier-ignore */ this.mainLogger.debug(`tellCorrespondingNodes: ${queueEntry.logID} dataSharedTimestamp: ${queueEntry.dataSharedTimestamp}`)

                this.updateSimpleStatsObject(
                  processStats.awaitStats,
                  'tellCorrespondingNodes',
                  shardusGetTime() - awaitStart
                )

                /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_processing', `${shortID}`, `qId: ${queueEntry.entryID} qRst:${localRestartCounter}  values: ${this.processQueue_debugAccountData(queueEntry, app)}`)
                //}
              } catch (ex) {
                /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug('processAcceptedTxQueue2 tellCorrespondingNodes:' + ex.name + ': ' + ex.message + ' at ' + ex.stack)
                this.statemanager_fatal(
                  `processAcceptedTxQueue2_ex`,
                  'processAcceptedTxQueue2 tellCorrespondingNodes:' + ex.name + ': ' + ex.message + ' at ' + ex.stack
                )
                queueEntry.dataSharedTimestamp = shardusGetTime()
                nestedCountersInstance.countEvent(`processing`, `tellCorrespondingNodes fail`)

                queueEntry.executionDebug.process1 = 'tell fail'
              } finally {
                this.updateTxState(queueEntry, 'awaiting data', 'mainLoop')

                //if we are not going to execute the TX go strait to consensing
                if (
                  queueEntry.globalModification === false &&
                  this.executeInOneShard &&
                  queueEntry.isInExecutionHome === false
                ) {
                  //is there a way to preemptively forward data without there being tons of repair..
                  /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`processAcceptedTxQueue2 isInExecutionHome === false. set state = 'consensing' tx:${queueEntry.logID} ts:${queueEntry.acceptedTx.timestamp}`)
                  this.updateTxState(queueEntry, 'consensing', 'fromProcessing')
                }
              }
              queueEntry.executionDebug.processElapsed = shardusGetTime() - time
            } else {
              const upstreamTx = this.processQueue_getUpstreamTx(seenAccounts, queueEntry)
              if (upstreamTx == null) {
                /* prettier-ignore */ if (logFlags.seqdiagram && queueEntry?.upStreamBlocker !== 'null') {
                  queueEntry.upStreamBlocker = 'null' // 'dirty'
                  this.seqLogger.info(`0x53455104 ${shardusGetTime()} tx:${queueEntry.acceptedTx.txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: upstream:null`)
                }
                nestedCountersInstance.countEvent('processing', 'busy waiting the upstream tx.' + ' but it is null')
              } else {
                if (upstreamTx.logID === queueEntry.logID) {
                  /* prettier-ignore */ if (logFlags.seqdiagram && queueEntry?.upStreamBlocker !== upstreamTx.logID) {
                    queueEntry.upStreamBlocker = upstreamTx.logID
                    this.seqLogger.info(`0x53455104 ${shardusGetTime()} tx:${queueEntry.acceptedTx.txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: upstream:same`)
                  }
                  //not 100% confident that upstreamTX check works.
                  if (upstreamTx === queueEntry) {
                    //this queue entry could be marked as seen due to aging above
                    nestedCountersInstance.countEvent(
                      'processing',
                      'busy waiting but the upstream tx reference matches our queue entry'
                    )
                  } else {
                    nestedCountersInstance.countEvent('processing', 'busy waiting the upstream tx but it is same txId')
                  }
                } else {
                  /* prettier-ignore */ if (logFlags.seqdiagram && queueEntry?.upStreamBlocker !== upstreamTx.logID) {
                    queueEntry.upStreamBlocker = upstreamTx.logID
                    this.seqLogger.info(`0x53455104 ${shardusGetTime()} tx:${queueEntry.acceptedTx.txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: upstream:${upstreamTx.logID}`)
                  }
                  nestedCountersInstance.countEvent(
                    'processing',
                    `busy waiting the upstream tx to complete. state ${queueEntry.state}`
                  )
                }
              }
            }
            this.processQueue_markAccountsSeen(seenAccounts, queueEntry)
          }
          if (queueEntry.state === 'awaiting data') {
            queueEntry.executionDebug.log = 'entered awaiting data'            

            // TODO review this block below in more detail.
            // check if we have all accounts
            if (queueEntry.hasAll === false && txAge > timeM2) {
              this.processQueue_markAccountsSeen(seenAccounts, queueEntry)

              if (queueEntry.pendingDataRequest === true) {
                //early out after marking seen, because we are already asking for data
                //need to review this in context of sharding
                nestedCountersInstance.countEvent('processing', 'awaiting data. pendingDataRequest')
                continue
              }

              if (this.queueEntryHasAllData(queueEntry) === true) {
                // I think this can't happen
                /* prettier-ignore */ nestedCountersInstance.countEvent('processing', 'data missing at t>M2. but not really. investigate further')
                /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_hadDataAfterall', `${shortID}`, `This is kind of an error, and should not happen`)
                continue
              }

              //TODO check for receipt and move to repair state / await final data

              if (this.config.stateManager.awaitingDataCanBailOnReceipt) {
                const signedReceipt = this.stateManager.getSignedReceipt(queueEntry)
                if (signedReceipt != null) {
                  //we saw a receipt so we can move to await final data
                  nestedCountersInstance.countEvent(
                    'processing',
                    'awaitingDataCanBailOnReceipt: activated.  tx state changed from awaiting data to await final data'
                  )
                  this.updateTxState(queueEntry, 'await final data', 'receipt while waiting for initial data')
                  continue
                }
              }

              if (this.config.stateManager.requestAwaitedDataAllowed) {
                // Before we turn this back on we must set the correct conditions.
                // our node may be unaware of how other nodes have upstream blocking TXs that
                // prevent them from sharing data.  The only safe way to know if we can ask for data
                // is to know another node has voted but this has some issues as well

                // 7.  Manually request missing state
                try {
                  nestedCountersInstance.countEvent('processing', 'data missing at t>M2. request data')
                  // Await note: current thinking is that is is best to not await this call.
                  this.queueEntryRequestMissingData(queueEntry)
                } catch (ex) {
                  /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug('processAcceptedTxQueue2 queueEntryRequestMissingData:' + ex.name + ': ' + ex.message + ' at ' + ex.stack)
                  this.statemanager_fatal(
                    `processAcceptedTxQueue2_missingData`,
                    'processAcceptedTxQueue2 queueEntryRequestMissingData:' +
                      ex.name +
                      ': ' +
                      ex.message +
                      ' at ' +
                      ex.stack
                  )
                }
              }
            } else if (queueEntry.hasAll) {
              queueEntry.executionDebug.log1 = 'has all'

              // we have all the data, but we need to make sure there are no upstream TXs using accounts we need first.
              if (this.processQueue_accountSeen(seenAccounts, queueEntry) === false) {
                this.processQueue_markAccountsSeen(seenAccounts, queueEntry)

                // As soon as we have all the data we preApply it and then send out a vote
                /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_preApplyTx', `${shortID}`, `qId: ${queueEntry.entryID} qRst:${localRestartCounter} values: ${this.processQueue_debugAccountData(queueEntry, app)} AcceptedTransaction: ${utils.stringifyReduce(queueEntry.acceptedTx)}`)

                try {
                  //This is a just in time check to make sure our involved accounts
                  //have not changed after our TX timestamp
                  const accountsValid = this.checkAccountTimestamps(queueEntry)
                  if (accountsValid === false) {
                    this.updateTxState(queueEntry, 'consensing')
                    queueEntry.preApplyTXResult = {
                      applied: false,
                      passed: false,
                      applyResult: 'failed account TS checks',
                      reason: 'apply result',
                      applyResponse: null,
                    }
                    continue
                  }

                  if (queueEntry.transactionGroup.length > 1) {
                    queueEntry.robustAccountDataPromises = {}
                  }

                  queueEntry.executionDebug.log2 = 'call pre apply'
                  const awaitStart = shardusGetTime()
                  /* prettier-ignore */ this.setDebugLastAwaitedCall('this.stateManager.transactionQueue.preApplyTransaction(queueEntry)')
                  let txResult = undefined
                  if (this.config.stateManager.transactionApplyTimeout > 0) {
                    //use the withTimeout from util/promises to call preApplyTransaction with a timeout
                    txResult = await withTimeout<PreApplyAcceptedTransactionResult>(
                      () => this.preApplyTransaction(queueEntry),
                      this.config.stateManager.transactionApplyTimeout
                    )
                    if (txResult === 'timeout') {
                      //if we got a timeout, we need to set the txResult to null
                      txResult = null
                      nestedCountersInstance.countEvent('processing', 'timeout-preApply')
                      this.statemanager_fatal(
                        'timeout-preApply',
                        `preApplyTransaction timed out for txid: ${
                          queueEntry.logID
                        } ${this.getDebugProccessingStatus()}`
                      )
                      //need to clear any stuck fifo locks.  Would be better to solve upstream problems.
                      this.stateManager.forceUnlockAllFifoLocks('timeout-preApply')
                    }
                  } else {
                    txResult = await this.preApplyTransaction(queueEntry)
                  }

                  /* prettier-ignore */ this.setDebugLastAwaitedCall('this.stateManager.transactionQueue.preApplyTransaction(queueEntry)', DebugComplete.Completed)
                  this.updateSimpleStatsObject(
                    processStats.awaitStats,
                    'preApplyTransaction',
                    shardusGetTime() - awaitStart
                  )

                  queueEntry.executionDebug.log3 = 'called pre apply'
                  queueEntry.executionDebug.txResult = txResult

                  if (
                    configContext.stateManager.forceVoteForFailedPreApply ||
                    (txResult && txResult.applied === true)
                  ) {
                    this.updateTxState(queueEntry, 'consensing')

                    queueEntry.preApplyTXResult = txResult

                    // make sure our data wrappers are upt to date with the correct hash and timstamp
                    for (const key of Object.keys(queueEntry.collectedData)) {
                      // eslint-disable-next-line security/detect-object-injection
                      const wrappedAccount = queueEntry.collectedData[key]
                      const { timestamp, hash } = this.app.getTimestampAndHashFromAccount(wrappedAccount.data)
                      if (wrappedAccount.timestamp != timestamp) {
                        wrappedAccount.timestamp = timestamp
                        nestedCountersInstance.countEvent('transactionQueue', 'correctedTimestamp')
                      }
                      // eslint-disable-next-line security/detect-possible-timing-attacks
                      if (wrappedAccount.stateId != hash) {
                        wrappedAccount.stateId = hash
                        nestedCountersInstance.countEvent('transactionQueue', 'correctedHash')
                      }
                    }

                    //Broadcast our vote
                    if (queueEntry.noConsensus === true) {
                      // not sure about how to share or generate an applied receipt though for a no consensus step
                      /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_preApplyTx_noConsensus', `${shortID}`, ``)

                      /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`processAcceptedTxQueue2 noConsensus : ${queueEntry.logID} `)

                      this.updateTxState(queueEntry, 'commiting')

                      queueEntry.hasValidFinalData = true
                      // TODO Global receipts?  do we want them?
                      // if(queueEntry.globalModification === false){
                      //   //Send a special receipt because this is a set command.
                      // }
                    } else {
                      /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_preApplyTx_createAndShareVote', `${shortID}`, ``)
                      /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`processAcceptedTxQueue2 calling createAndShareVote : ${queueEntry.logID} `)
                      const awaitStart = shardusGetTime()

                      queueEntry.voteCastAge = txAge
                      /* prettier-ignore */ this.setDebugLastAwaitedCall( 'this.stateManager.transactionConsensus.createAndShareVote(queueEntry)' )
                      await this.stateManager.transactionConsensus.createAndShareVote(queueEntry)
                      /* prettier-ignore */ this.setDebugLastAwaitedCall( 'this.stateManager.transactionConsensus.createAndShareVote(queueEntry)', DebugComplete.Completed )
                      this.updateSimpleStatsObject(
                        processStats.awaitStats,
                        'createAndShareVote',
                        shardusGetTime() - awaitStart
                      )
                    }
                  } else {
                    //There was some sort of error when we tried to apply the TX
                    //Go directly into 'consensing' state, because we need to wait for a receipt that is good.
                    /* prettier-ignore */ nestedCountersInstance.countEvent('processing', `txResult apply error. applied: ${txResult?.applied}`)
                    /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`processAcceptedTxQueue2 txResult problem txid:${queueEntry.logID} res: ${utils.stringifyReduce(txResult)} `)
                    queueEntry.waitForReceiptOnly = true

                    // if apply failed, we need to go to consensing to get a receipt
                    this.updateTxState(queueEntry, 'consensing')
                    //TODO: need to flag this case so that it does not artificially increase the network load
                  }
                } catch (ex) {
                  /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug('processAcceptedTxQueue2 preApplyAcceptedTransaction:' + ex.name + ': ' + ex.message + ' at ' + ex.stack)
                  this.statemanager_fatal(
                    `processAcceptedTxQueue2b_ex`,
                    'processAcceptedTxQueue2 preApplyAcceptedTransaction:' +
                      ex.name +
                      ': ' +
                      ex.message +
                      ' at ' +
                      ex.stack
                  )
                } finally {
                  /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_preapplyFinish', `${shortID}`, `qId: ${queueEntry.entryID} qRst:${localRestartCounter} values: ${this.processQueue_debugAccountData(queueEntry, app)} AcceptedTransaction: ${utils.stringifyReduce(queueEntry.acceptedTx)}`)
                }
              } else {
                queueEntry.executionDebug.logBusy = 'has all, but busy'
                nestedCountersInstance.countEvent('processing', 'has all, but busy')
              }
              this.processQueue_markAccountsSeen(seenAccounts, queueEntry)
            } else {
              // mark accounts as seen while we are waiting for data
              this.processQueue_markAccountsSeen(seenAccounts, queueEntry)
            }
          } else if (queueEntry.state === 'consensing') {
            await handleConsensingState.call(this, queueEntry, seenAccounts, currentTime, processStats, hasReceivedApplyReceipt, currentIndex, shortID, hasApplyReceipt, txAge, timeM5)
          }
          if (queueEntry.state === 'await repair') {
            ///////////////////////////////////////////--await repair--////////////////////////////////////////////////////////////////
            this.processQueue_markAccountsSeen(seenAccounts, queueEntry)

            // Special state that we are put in if we are waiting for a repair to receipt operation to conclude
            if (queueEntry.repairFinished === true) {
              /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_awaitRepair_repairFinished', `${shortID}`, `qId: ${queueEntry.entryID} result:${queueEntry.signedReceiptForRepair.proposal.applied} txAge:${txAge} `)
              if (queueEntry.signedReceiptForRepair.proposal.applied === true) {
                this.updateTxState(queueEntry, 'pass')
              } else {
                // technically should never get here, because we dont need to repair to a receipt when the network did not apply the TX
                this.updateTxState(queueEntry, 'fail')
              }
              // most remove from queue at the end because it compacts the queue entry
              this.removeFromQueue(queueEntry, currentIndex)

              // console.log('Await Repair Finished', queueEntry.acceptedTx.txId, queueEntry)

              nestedCountersInstance.countEvent('stateManager', 'repairFinished')
              continue
            } else if (queueEntry.repairFailed === true) {
              // if the repair failed, we need to fail the TX. Let the patcher take care of it.
              this.updateTxState(queueEntry, 'fail')
              this.removeFromQueue(queueEntry, currentIndex)
              nestedCountersInstance.countEvent('stateManager', 'repairFailed')
              continue
            }
          }
          if (queueEntry.state === 'await final data') {
            //wait patiently for data to match receipt
            //if we run out of time repair to receipt?

            if (this.processQueue_accountSeen(seenAccounts, queueEntry) === false) {
              this.processQueue_markAccountsSeen(seenAccounts, queueEntry)

              // //temp hack ... hopefully this hack can go away
              // if (queueEntry.recievedAppliedReceipt == null || queueEntry.recievedAppliedReceipt2 == null) {
              //   const result = await this.stateManager.transactionConsensus.tryProduceReceipt(queueEntry)
              //   if (result != null) {
              //     queueEntry.recievedAppliedReceipt = result
              //     /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_awaitFinalData_hackReceipt', `${shortID}`, `qId: ${queueEntry.entryID} result:${utils.stringifyReduce(result)}`)
              //   }
              // }

              // remove from queue if we have commited data for this tx
              if (configContext.stateManager.attachDataToReceipt && queueEntry.accountDataSet === true) {
                if (logFlags.debug)
                  this.mainLogger.debug(
                    `shrd_awaitFinalData_removeFromQueue : ${queueEntry.logID} because accountDataSet is true`
                  )
                this.removeFromQueue(queueEntry, currentIndex)
                //this will possibly skip critical stats or exit steps that invoke a transaction applied event to the dapp
                continue
              }

              //collectedFinalData
              //PURPL-74 todo: get the vote from queueEntry.receivedBestVote or receivedBestConfirmation instead of receipt2
              const signedReceipt = this.stateManager.getSignedReceipt(queueEntry)
              const timeSinceAwaitFinalStart =
                queueEntry.txDebug.startTimestamp['await final data'] > 0
                  ? shardusGetTime() - queueEntry.txDebug.startTimestamp['await final data']
                  : 0

              const accountsNotStored = new Set()
              //if we got a vote above then build a list of accounts that we store but are missing in our
              //collectedFinalData
              if (signedReceipt) {
                let failed = false
                let incomplete = false
                let skipped = 0
                const missingAccounts = []
                const nodeShardData: StateManagerTypes.shardFunctionTypes.NodeShardData =
                  this.stateManager.currentCycleShardData.nodeShardData

                /* eslint-disable security/detect-object-injection */
                for (let i = 0; i < signedReceipt.proposal.accountIDs.length; i++) {
                  const accountID = signedReceipt.proposal.accountIDs[i]
                  const accountHash = signedReceipt.proposal.afterStateHashes[i]

                  //only check for stored keys.
                  if (ShardFunctions.testAddressInRange(accountID, nodeShardData.storedPartitions) === false) {
                    skipped++
                    accountsNotStored.add(accountID)
                    continue
                  }

                  const wrappedAccount = queueEntry.collectedFinalData[accountID]
                  if (wrappedAccount == null) {
                    incomplete = true
                    queueEntry.debug.waitingOn = accountID
                    missingAccounts.push(accountID)
                    // break
                  }
                  if (wrappedAccount && wrappedAccount.stateId != accountHash) {
                    if (logFlags.debug)
                      this.mainLogger.debug(
                        `shrd_awaitFinalData_failed : ${queueEntry.logID} wrappedAccount.stateId != accountHash from the vote`
                      )
                    failed = true
                    //we should be verifying the tate IDS that are pushed into collectedFinal data so this should not happen.  if it does that could cause a stuck TX / local oos
                    nestedCountersInstance.countEvent(
                      'stateManager',
                      `shrd_awaitFinalData failed state check wrappedAccount.stateId != accountHash`
                    )
                    break
                  }
                }

                // if we have missing accounts, we need to request the data
                if (incomplete && missingAccounts.length > 0) {
                  nestedCountersInstance.countEvent(
                    'stateManager',
                    `shrd_awaitFinalData missing accounts ${missingAccounts.length}`
                  )

                  // start request process for missing data if we waited long enough
                  let shouldStartFinalDataRequest = false
                  if (timeSinceAwaitFinalStart > 5000) {
                    shouldStartFinalDataRequest = true
                    if (logFlags.verbose)
                      /* prettier-ignore */ this.mainLogger.debug(`shrd_awaitFinalData_incomplete : ${queueEntry.logID} starting finalDataRequest timeSinceDataShare: ${timeSinceAwaitFinalStart}`)
                  } else if (txAge > timeM3) {
                    // by this time we should have all the data we need
                    shouldStartFinalDataRequest = true
                    if (logFlags.verbose)
                      /* prettier-ignore */ this.mainLogger.debug(`shrd_awaitFinalData_incomplete : ${queueEntry.logID} starting finalDataRequest txAge > timeM3 + confirmationSeenExpirationTime`)
                  }

                  // start request process for missing data
                  const timeSinceLastFinalDataRequest = shardusGetTime() - queueEntry.lastFinalDataRequestTimestamp
                  if (
                    this.config.stateManager.canRequestFinalData &&
                    shouldStartFinalDataRequest &&
                    timeSinceLastFinalDataRequest > 5000
                  ) {
                    nestedCountersInstance.countEvent('stateManager', 'requestFinalData')
                    this.requestFinalData(queueEntry, missingAccounts)
                    queueEntry.lastFinalDataRequestTimestamp = shardusGetTime()
                    continue
                  }
                } else {
                  nestedCountersInstance.countEvent('stateManager', 'shrd_awaitFinalData not missing accounts')
                }

                /* eslint-enable security/detect-object-injection */

                if (failed === true) {
                  nestedCountersInstance.countEvent('stateManager', 'shrd_awaitFinalData failed')
                  this.stateManager.getTxRepair().repairToMatchReceipt(queueEntry)
                  this.updateTxState(queueEntry, 'await repair')
                  /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_awaitFinalData_failed', `${shortID}`, `qId: ${queueEntry.entryID} skipped:${skipped}`)
                  /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`shrd_awaitFinalData_failed : ${queueEntry.logID} `)
                  continue
                }

                // This is the case where awaiting final data has succeeded. Store the final data and remove TX from the queue
                if (failed === false && incomplete === false) {
                  //setting this for completeness, but the TX will be removed from the queue at the end of this section
                  queueEntry.hasValidFinalData = true

                  /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('shrd_awaitFinalData_passed', `${shortID}`, `qId: ${queueEntry.entryID} skipped:${skipped}`)
                  /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`shrd_awaitFinalData_passed : ${queueEntry.logID} skipped:${skipped}`)

                  //TODO vote order should be in apply response order!
                  //This matters for certain daps only.  No longer important to shardeum
                  const rawAccounts = []
                  const accountRecords: Shardus.WrappedData[] = []
                  /* eslint-disable security/detect-object-injection */
                  for (let i = 0; i < signedReceipt.proposal.accountIDs.length; i++) {
                    const accountID = signedReceipt.proposal.accountIDs[i]
                    //skip accounts we don't store
                    if (accountsNotStored.has(accountID)) {
                      continue
                    }
                    const wrappedAccount = queueEntry.collectedFinalData[accountID]
                    rawAccounts.push(wrappedAccount.data)
                    accountRecords.push(wrappedAccount)
                  }

                  nestedCountersInstance.countEvent(
                    'stateManager',
                    `shrd_awaitFinalData got data, time to save it ${accountRecords.length}`
                  )
                  /* eslint-enable security/detect-object-injection */
                  //await this.app.setAccountData(rawAccounts)
                  const awaitStart = shardusGetTime()
                  /* prettier-ignore */ this.setDebugLastAwaitedCall( 'this.stateManager.transactionConsensus.checkAndSetAccountData()' )
                  await this.stateManager.checkAndSetAccountData(
                    accountRecords,
                    `txId: ${queueEntry.logID} awaitFinalData_passed`,
                    false
                  )

                  /* prettier-ignore */ this.setDebugLastAwaitedCall( 'this.stateManager.transactionConsensus.checkAndSetAccountData()', DebugComplete.Completed )
                  queueEntry.accountDataSet = true
                  // endpoint to allow dapp to execute something that depends on a transaction being approved.
                  this.app.transactionReceiptPass(
                    queueEntry.acceptedTx.data,
                    queueEntry.collectedFinalData,
                    queueEntry?.preApplyTXResult?.applyResponse,
                    false
                  )
                  /* prettier-ignore */ if (logFlags.verbose) console.log('transactionReceiptPass 1', queueEntry.acceptedTx.txId, queueEntry)
                  this.updateSimpleStatsObject(
                    processStats.awaitStats,
                    'checkAndSetAccountData',
                    shardusGetTime() - awaitStart
                  )

                  //log tx processed if needed
                  if (
                    queueEntry != null &&
                    queueEntry.transactionGroup != null &&
                    this.p2p.getNodeId() === queueEntry.transactionGroup[0].id
                  ) {
                    if (queueEntry.globalModification === false) {
                      //temp way to make global modifying TXs not over count
                      this.stateManager.eventEmitter.emit('txProcessed')
                    }
                  }

                  if (
                    queueEntry.receivedSignedReceipt?.proposal?.applied === true ||
                    queueEntry.signedReceipt?.proposal?.applied === true
                  ) {
                    this.updateTxState(queueEntry, 'pass')
                  } else {
                    /* prettier-ignore */
                    if (logFlags.debug) this.mainLogger.error(`shrd_awaitFinalData_fail : ${queueEntry.logID} no receivedSignedReceipt. signedReceipt: ${utils.stringifyReduce(queueEntry.signedReceipt)}`);
                    this.updateTxState(queueEntry, 'fail')
                  }
                  this.removeFromQueue(queueEntry, currentIndex)
                }
              } else {
                nestedCountersInstance.countEvent('stateManager', 'shrd_awaitFinalData noVote')
                // todo: what to do if we have no vote? discuss with Omar
              }
            } else {
              const upstreamTx = this.processQueue_getUpstreamTx(seenAccounts, queueEntry)
              if (queueEntry.executionDebug == null) queueEntry.executionDebug = {}
              queueEntry.executionDebug.logFinalData = `has all final data, but busy. upstreamTx: ${upstreamTx?.logID}`
              if (upstreamTx == null) {
                queueEntry.executionDebug.logFinalData = `has all final data, but busy. upstreamTx: null`
                nestedCountersInstance.countEvent('stateManager', 'shrd_awaitFinalData busy. upstreamTx: null')
              } else {
                if (upstreamTx.acceptedTx.txId === queueEntry.acceptedTx.txId) {
                  nestedCountersInstance.countEvent('stateManager', 'shrd_awaitFinalData busy. upstreamTx same tx')
                } else {
                  nestedCountersInstance.countEvent(
                    'stateManager',
                    `shrd_awaitFinalData busy. upstream tx state: ${upstreamTx?.state}`
                  )
                }
              }
            }
          }
          if (queueEntry.state === 'commiting') {
            await handleCommitingState.call(this, queueEntry, currentIndex, seenAccounts, currentTime, processStats, shortID, localRestartCounter, app)
          }
          if (queueEntry.state === 'canceled') {
            ///////////////////////////////////////////////--canceled--////////////////////////////////////////////////////////////
            //need to review this state look unused
            this.processQueue_clearAccountsSeen(seenAccounts, queueEntry)
            this.removeFromQueue(queueEntry, currentIndex)
            /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`processAcceptedTxQueue2 canceled : ${queueEntry.logID} `)
            nestedCountersInstance.countEvent('stateManager', 'canceled')
          }
        } finally {
          this.profiler.profileSectionEnd(`process-${pushedProfilerTag}`)
          if (logFlags.profiling_verbose)
            profilerInstance.scopedProfileSectionEnd(`scoped-process-${pushedProfilerTag}`)

          //let do some more stats work
          const txElapsed = shardusGetTime() - txStartTime
          if (queueEntry.state != pushedProfilerTag) {
            processStats.stateChanged++
            this.updateSimpleStatsObject(processStats.stateChangedStats, pushedProfilerTag, txElapsed)
          } else {
            processStats.sameState++
            this.updateSimpleStatsObject(processStats.sameStateStats, pushedProfilerTag, txElapsed)
          }

          pushedProfilerTag = null // clear the tag
        }
      }
    } finally {
      //Handle an odd case where the finally did not catch exiting scope.
      if (pushedProfilerTag != null) {
        this.profiler.profileSectionEnd(`process-${pushedProfilerTag}`)
        this.profiler.profileSectionEnd(`process-patched1-${pushedProfilerTag}`)
        pushedProfilerTag = null
      }

      const processTime = shardusGetTime() - startTime

      processStats.totalTime = processTime

      this.finalizeSimpleStatsObject(processStats.awaitStats)
      this.finalizeSimpleStatsObject(processStats.sameStateStats)
      this.finalizeSimpleStatsObject(processStats.stateChangedStats)

      this.lastProcessStats['latest'] = processStats
      if (processTime > 10000) {
        nestedCountersInstance.countEvent('stateManager', 'processTime > 10s')
        this.statemanager_fatal(
          `processAcceptedTxQueue excceded time ${processTime / 1000} firstTime:${firstTime}`,
          `processAcceptedTxQueue excceded time ${
            processTime / 1000
          } firstTime:${firstTime} stats:${Utils.safeStringify(processStats)}`
        )
        this.lastProcessStats['10+'] = processStats
      } else if (processTime > 5000) {
        nestedCountersInstance.countEvent('stateManager', 'processTime > 5s')
        /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`processTime > 5s ${processTime / 1000} stats:${Utils.safeStringify(processStats)}`)
        this.lastProcessStats['5+'] = processStats
      } else if (processTime > 2000) {
        nestedCountersInstance.countEvent('stateManager', 'processTime > 2s')
        /* prettier-ignore */ if (logFlags.error && logFlags.verbose) this.mainLogger.error(`processTime > 2s ${processTime / 1000} stats:${Utils.safeStringify(processStats)}`)
        this.lastProcessStats['2+'] = processStats
      } else if (processTime > 1000) {
        nestedCountersInstance.countEvent('stateManager', 'processTime > 1s')
        /* prettier-ignore */ if (logFlags.error && logFlags.verbose) this.mainLogger.error(`processTime > 1s ${processTime / 1000} stats:${Utils.safeStringify(processStats)}`)
        this.lastProcessStats['1+'] = processStats
      }

      // restart loop if there are still elements in it
      if (this._transactionQueue.length > 0 || this.pendingTransactionQueue.length > 0) {
        this.transactionQueueHasRemainingWork = true
        setTimeout(() => {
          this.stateManager.tryStartTransactionProcessingQueue()
        }, 15)
      } else {
        if (logFlags.seqdiagram)
          this.mainLogger.info(
            `0x10052024 ${ipInfo.externalIp} ${shardusGetTime()} 0x0000 processTransactions _transactionQueue.length 0`
          )
        this.transactionQueueHasRemainingWork = false
      }

      this.transactionProcessingQueueRunning = false
      this.processingLastRunTime = shardusGetTime()
      this.stateManager.lastSeenAccountsMap = seenAccounts

      this.profiler.profileSectionEnd('processQ')
    }
  }  
}