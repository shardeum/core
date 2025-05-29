import { logFlags } from '../logger'
import * as utils from '../utils'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { QueueEntry } from './state-manager-types'
import { TransactionQueueContext } from './TransactionQueue.context'

export const expiredMethods = {
    setTXExpired(this: TransactionQueueContext, queueEntry: QueueEntry, currentIndex: number, message: string): void {
        /* prettier-ignore */ if (logFlags.verbose || this.stateManager.consensusLog) this.mainLogger.debug(`setTXExpired tx:${queueEntry.logID} ${message}  ts:${queueEntry.acceptedTx.timestamp} debug:${utils.stringifyReduce(queueEntry.debug)} state: ${queueEntry.state}, isInExecution: ${queueEntry.isInExecutionHome}`)
        this.updateTxState(queueEntry, 'expired')
        this.removeFromQueue(queueEntry, currentIndex)
        this.app.transactionReceiptFail(
          queueEntry.acceptedTx.data,
          queueEntry.collectedData,
          queueEntry.preApplyTXResult?.applyResponse
        )
        this.stateManager.eventEmitter.emit('txExpired', queueEntry.acceptedTx.txId)
    
        /* prettier-ignore */ nestedCountersInstance.countEvent( 'txExpired', `tx: ${this.app.getSimpleTxDebugValue(queueEntry.acceptedTx?.data)}` )
    
        //This is really important.  If we are going to expire a TX, then look to see if we already have a receipt for it.
        //If so, then just go into async receipt repair mode for the TX AFTER it has been expired and removed from the queue
        if (queueEntry.signedReceiptFinal != null) {
          const startRepair = queueEntry.repairStarted === false
          /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`setTXExpired. ${queueEntry.logID} start repair:${startRepair}. update `)
          if (startRepair) {
            nestedCountersInstance.countEvent('repair1', 'setTXExpired: start repair')
            queueEntry.signedReceiptForRepair = queueEntry.signedReceiptFinal
            //todo any limits to how many repairs at once to allow?
            this.stateManager.getTxRepair().repairToMatchReceipt(queueEntry)
          }
        } else {
          nestedCountersInstance.countEvent('repair1', 'setTXExpired: no receipt to repair')
          /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`setTXExpired. no receipt to repair ${queueEntry.logID}`)
        }
      },
      
      setTxAlmostExpired(this: TransactionQueueContext, queueEntry: QueueEntry, currentIndex: number, message: string): void {
        /* prettier-ignore */ if (logFlags.verbose || this.stateManager.consensusLog) this.mainLogger.debug(`setTxAlmostExpired tx:${queueEntry.logID} ${message}  ts:${queueEntry.acceptedTx.timestamp} debug:${utils.stringifyReduce(queueEntry.debug)}`)
        // this.updateTxState(queueEntry, 'almostExpired')
        queueEntry.almostExpired = true
    
        /* prettier-ignore */ nestedCountersInstance.countEvent("txAlmostExpired", `tx: ${this.app.getSimpleTxDebugValue(queueEntry.acceptedTx?.data)}`)
      }
}