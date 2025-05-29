import { shardusGetTime } from '../network'
import * as Self from '../p2p/Self'
import * as utils from '../utils'
import { QueueEntry } from './state-manager-types'
import { DebugComplete } from './TransactionQueue'

const txStatBucketSize = {
  default: [1, 2, 4, 8, 16, 30, 60, 125, 250, 500, 1000, 2000, 4000, 8000, 10000, 20000, 30000, 60000, 100000],
}

export const debugMethods = {
    dumpTxDebugToStatList(queueEntry: QueueEntry): void {
        this.txDebugStatList.set(queueEntry.acceptedTx.txId, { ...queueEntry.txDebug })
    },

    clearTxDebugStatList(): void {
        this.txDebugStatList.clear()
    },

    printTxDebugByTxId(txId: string): string {
        // get the txStat from the txDebugStatList
        const txStat = this.txDebugStatList.get(txId)
        if (txStat == null) {
            return 'No txStat found'
        }
        let resultStr = ''
        for (const key in txStat.duration) {
            resultStr += `${key}: start:${txStat.startTimestamp[key]} end:${txStat.endTimestamp[key]} ${txStat.duration[key]} ms\n`
        }
        return resultStr
    },

    printTxDebug(): string {
        const collector = {}
        const totalTxCount = this.txDebugStatList.size()

        const indexes = [
            'aging',
            'processing',
            'awaiting data',
            'preApplyTransaction',
            'consensing',
            'commiting',
            'await final data',
            'expired',
            'total_queue_time',
            'pass',
            'fail',
        ]

        /* eslint-disable security/detect-object-injection */
        for (const [txId, txStat] of this.txDebugStatList.entries()) {
            for (const key in txStat.duration) {
                if (!collector[key]) {
                    collector[key] = {}
                    for (const bucket of txStatBucketSize.default) {
                        collector[key][bucket] = []
                    }
                }
                const duration = txStat.duration[key]
                for (const bucket of txStatBucketSize.default) {
                    if (duration < bucket) {
                        collector[key][bucket].push(duration)
                        break
                    }
                }
            }
        }
        const sortedCollector = {}
        for (const key of indexes) {
            sortedCollector[key] = { ...collector[key] }
        }
        /* eslint-enable security/detect-object-injection */
        const lines = []
        lines.push(`=> Total Transactions: ${totalTxCount}`)
        for (const [key, collectorForThisKey] of Object.entries(sortedCollector)) {
            lines.push(`\n => Tx ${key}: \n`)
            for (let i = 0; i < Object.keys(collectorForThisKey).length; i++) {
                // eslint-disable-next-line security/detect-object-injection
                const time = Object.keys(collectorForThisKey)[i]
                // eslint-disable-next-line security/detect-object-injection
                const arr = collectorForThisKey[time]
                if (!arr) continue
                const percentage = (arr.length / totalTxCount) * 100
                const blockCount = Math.round(percentage / 2)
                const blockStr = '|'.repeat(blockCount)
                const lowerLimit = i === 0 ? 0 : Object.keys(collectorForThisKey)[i - 1]
                const upperLimit = time
                const bucketDescription = `${lowerLimit} ms - ${upperLimit} ms:`.padEnd(19, ' ')
                lines.push(`${bucketDescription}  ${arr.length} ${percentage.toFixed(1).padEnd(5, ' ')}%  ${blockStr} `)
            }
        }

        const strToPrint = lines.join('\n')
        return strToPrint
    },
    txDebugMarkStartTime(queueEntry: QueueEntry, state: string): void {
        if (queueEntry.txDebug.startTime[state] == null) {
            queueEntry.txDebug.startTime[state] = process.hrtime()
            queueEntry.txDebug.startTimestamp[state] = shardusGetTime()
        }
    },
    txDebugMarkEndTime(queueEntry: QueueEntry, state: string): void {
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
    },
    clearDebugAwaitStrings(): void {
        this.debugLastAwaitedCall = ''
        this.debugLastAwaitedCallInner = ''
        this.debugLastAwaitedAppCall = ''
        this.debugLastAwaitedCallInnerStack = {}
        this.debugLastAwaitedAppCallStack = {}
    },
    getDebugProccessingStatus(): unknown {
        let txDebug = ''
        if (this.debugRecentQueueEntry != null) {
            const app = this.app
            const queueEntry = this.debugRecentQueueEntry
            txDebug = `logID:${queueEntry.logID} state:${queueEntry.state} hasAll:${queueEntry.hasAll} globalMod:${queueEntry.globalModification}`
            txDebug += ` qId: ${queueEntry.entryID} values: ${this.processQueue_debugAccountData(
                queueEntry,
                app
            )} AcceptedTransaction: ${utils.stringifyReduce(queueEntry.acceptedTx)}`
        }
        return {
            isStuckProcessing: this.isStuckProcessing,
            transactionProcessingQueueRunning: this.transactionProcessingQueueRunning,
            stuckProcessingCount: this.stuckProcessingCount,
            stuckProcessingCyclesCount: this.stuckProcessingCyclesCount,
            stuckProcessingQueueLockedCyclesCount: this.stuckProcessingQueueLockedCyclesCount,
            processingLastRunTime: this.processingLastRunTime,
            debugLastProcessingQueueStartTime: this.debugLastProcessingQueueStartTime,
            debugLastAwaitedCall: this.debugLastAwaitedCall,
            debugLastAwaitedCallInner: this.debugLastAwaitedCallInner,
            debugLastAwaitedAppCall: this.debugLastAwaitedAppCall,
            debugLastAwaitedCallInnerStack: this.debugLastAwaitedCallInnerStack,
            debugLastAwaitedAppCallStack: this.debugLastAwaitedAppCallStack,
            txDebug,
            //todo get the transaction we are stuck on. what type is it? id etc.
        }
    },

    clearStuckProcessingDebugVars(): void {
        this.isStuckProcessing = false
        this.debugLastAwaitedCall = ''
        this.debugLastAwaitedCallInner = ''
        this.debugLastAwaitedAppCall = ''
        this.debugLastAwaitedCallInnerStack = {}
        this.debugLastAwaitedAppCallStack = {}

        this.debugRecentQueueEntry = null
        this.debugLastProcessingQueueStartTime = 0

        this.stuckProcessingCount = 0
        this.stuckProcessingCyclesCount = 0
        this.stuckProcessingQueueLockedCyclesCount = 0
    },
    setDebugLastAwaitedCall(label: string, complete = DebugComplete.Incomplete): void {
        this.debugLastAwaitedCall = label + (complete === DebugComplete.Completed ? ' complete' : '')
        this.debugLastAwaitedCallInner = ''
        this.debugLastAwaitedAppCall = ''
    },

    setDebugLastAwaitedCallInner(label: string, complete = DebugComplete.Incomplete): void {
        this.debugLastAwaitedCallInner = label + (complete === DebugComplete.Completed ? ' complete' : '')
        this.debugLastAwaitedAppCall = ''

        if (complete === DebugComplete.Incomplete) {
            // eslint-disable-next-line security/detect-object-injection
            if (this.debugLastAwaitedCallInnerStack[label] == null) {
                // eslint-disable-next-line security/detect-object-injection
                this.debugLastAwaitedCallInnerStack[label] = 1
            } else {
                // eslint-disable-next-line security/detect-object-injection
                this.debugLastAwaitedCallInnerStack[label]++
            }
        } else {
            //decrement the count if it is greater than 1, delete the key if the count is 1
            // eslint-disable-next-line security/detect-object-injection
            if (this.debugLastAwaitedCallInnerStack[label] != null) {
                // eslint-disable-next-line security/detect-object-injection
                if (this.debugLastAwaitedCallInnerStack[label] > 1) {
                    // eslint-disable-next-line security/detect-object-injection
                    this.debugLastAwaitedCallInnerStack[label]--
                } else {
                    // eslint-disable-next-line security/detect-object-injection
                    delete this.debugLastAwaitedCallInnerStack[label]
                }
            }
        }
    },
    setDebugSetLastAppAwait(label: string, complete = DebugComplete.Incomplete): void {
        this.debugLastAwaitedAppCall = label + (complete === DebugComplete.Completed ? ' complete' : '')

        if (complete === DebugComplete.Incomplete) {
            // eslint-disable-next-line security/detect-object-injection
            if (this.debugLastAwaitedAppCallStack[label] == null) {
                // eslint-disable-next-line security/detect-object-injection
                this.debugLastAwaitedAppCallStack[label] = 1
            } else {
                // eslint-disable-next-line security/detect-object-injection
                this.debugLastAwaitedAppCallStack[label]++
            }
        } else {
            //decrement the count if it is greater than 1, delete the key if the count is 1
            // eslint-disable-next-line security/detect-object-injection
            if (this.debugLastAwaitedAppCallStack[label] != null) {
                // eslint-disable-next-line security/detect-object-injection
                if (this.debugLastAwaitedAppCallStack[label] > 1) {
                    // eslint-disable-next-line security/detect-object-injection
                    this.debugLastAwaitedAppCallStack[label]--
                } else {
                    // eslint-disable-next-line security/detect-object-injection
                    delete this.debugLastAwaitedAppCallStack[label]
                }
            }
        }
    },
    getDebugQueueInfo(queueEntry: QueueEntry): any {
        return {
            txId: queueEntry.acceptedTx.txId,
            tx: queueEntry.acceptedTx,
            logID: queueEntry.logID,
            nodeId: Self.id,
            state: queueEntry.state,
            hasAll: queueEntry.hasAll,
            hasShardInfo: queueEntry.hasShardInfo,
            isExecutionNode: queueEntry.isInExecutionHome,
            globalModification: queueEntry.globalModification,
            entryID: queueEntry.entryID,
            txGroupCyle: queueEntry.txGroupCycle,
            uniqueKeys: queueEntry.uniqueKeys,
            collectedData: queueEntry.collectedData,
            finalData: queueEntry.collectedFinalData,
            preApplyResult: queueEntry.preApplyTXResult,
            txAge: shardusGetTime() - queueEntry.acceptedTx.timestamp,
            lastFinalDataRequestTimestamp: queueEntry.lastFinalDataRequestTimestamp,
            dataSharedTimestamp: queueEntry.dataSharedTimestamp,
            firstVoteTimestamp: queueEntry.firstVoteReceivedTimestamp,
            lastVoteTimestamp: queueEntry.lastVoteReceivedTimestamp,
            // firstConfirmationsTimestamp: queueEntry.firstConfirmOrChallengeTimestamp,
            // robustBestConfirmation: queueEntry.receivedBestConfirmation,
            // robustBestVote: queueEntry.receivedBestVote,
            // robustBestChallenge: queueEntry.receivedBestChallenge,
            // completedRobustVote: queueEntry.robustQueryVoteCompleted,
            // completedRobustChallenge: queueEntry.robustQueryConfirmOrChallengeCompleted,
            txDebug: queueEntry.txDebug,
            executionDebug: queueEntry.executionDebug,
            waitForReceiptOnly: queueEntry.waitForReceiptOnly,
            ourVote: queueEntry.ourVote || null,
            signedReceipt: this.stateManager.getSignedReceipt(queueEntry) || null,
            // uniqueChallenges: queueEntry.uniqueChallengesCount,
            collectedVoteCount: queueEntry.collectedVoteHashes.length,
            simpleDebugStr: this.app.getSimpleTxDebugValue ? this.app.getSimpleTxDebugValue(queueEntry.acceptedTx?.data) : '',
        }
    }

}