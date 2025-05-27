import { logFlags } from '../logger'
import { shardusGetTime } from '../network'
import { nestedCountersInstance } from '../utils/nestedCounters'
import * as utils from '../utils'
import { FifoLockObjectMap } from './state-manager-types'
// StringBoolObjectMap type defined inline
type StringBoolObjectMap = { [key: string]: boolean }

export const fifoMethods = {
  async fifoLock(fifoName: string): Promise<number> {
    if (this.config.stateManager.fifoUnlockFix3 === true) {
      return
    }

    const stack = '' // new Error().stack
    if (logFlags.debug) this.mainLogger.debug(`fifoLock: ${fifoName} ${stack}`)

    // eslint-disable-next-line security/detect-object-injection
    let thisFifo = this.fifoLocks[fifoName]
    if (thisFifo == null) {
      thisFifo = {
        fifoName,
        queueCounter: 0,
        waitingList: [],
        lastServed: 0,
        queueLocked: false,
        lockOwner: 1,
        lastLock: shardusGetTime(),
      }
      // eslint-disable-next-line security/detect-object-injection
      this.fifoLocks[fifoName] = thisFifo
    }
    thisFifo.queueCounter++
    const ourID = thisFifo.queueCounter
    const entry = { id: ourID }

    if (fifoName === 'accountModification') {
      nestedCountersInstance.countEvent('fifo-backup', `accountModification ${thisFifo.waitingList.length}`)
    }

    if (thisFifo.waitingList.length > 0 || thisFifo.queueLocked) {
      thisFifo.waitingList.push(entry)
      // wait till we are at the front of the queue, and the queue is not locked
      while ((thisFifo.waitingList.length > 0 && thisFifo.waitingList[0]?.id !== ourID) || thisFifo.queueLocked) {
        // todo perf optimization to reduce the amount of times we have to sleep (attempt to come out of sleep at close to the right time)
        let sleepEstimate = ourID - thisFifo.lastServed
        if (sleepEstimate < 1) {
          sleepEstimate = 1
        }
        await utils.sleep(1 * sleepEstimate)
        // await utils.sleep(2)
      }
      // remove our entry from the array
      thisFifo.waitingList.shift()
    }

    // lock things so that only our calling function can do work
    thisFifo.queueLocked = true
    thisFifo.lockOwner = ourID
    thisFifo.lastServed = ourID
    //this can be used to cleanup old fifo locks
    thisFifo.lastLock = shardusGetTime()
    return ourID
  },

  fifoUnlock(fifoName: string, id: number) {
    if (this.config.stateManager.fifoUnlockFix3 === true) {
      return
    }

    const stack = '' // new Error().stack
    if (logFlags.debug) this.mainLogger.debug(`fifoUnlock: ${fifoName} ${stack}`)

    // eslint-disable-next-line security/detect-object-injection
    const thisFifo = this.fifoLocks[fifoName]
    if (id === -1 || !thisFifo) {
      return // nothing to do
    }
    if (thisFifo.lockOwner === id) {
      thisFifo.queueLocked = false
    } else if (id !== -1) {
      // this should never happen as long as we are careful to use try/finally blocks
      this.statemanager_fatal(`fifoUnlock`, `Failed to unlock the fifo ${thisFifo.fifoName}: ${id}`)
    }
  },

  /**
   * bulkFifoLockAccounts
   * @param {string[]} accountIDs
   */
  async bulkFifoLockAccounts(accountIDs: string[]) {
    if (this.config.stateManager.fifoUnlockFix3 === true) {
      return []
    }
    // lock all the accounts we will modify
    const wrapperLockId = await this.fifoLock('atomicWrapper')
    const ourLocks = []
    const seen: StringBoolObjectMap = {}
    for (const accountKey of accountIDs) {
      // eslint-disable-next-line security/detect-object-injection
      if (seen[accountKey] === true) {
        ourLocks.push(-1) //lock skipped, so add a placeholder
        continue
      }
      // eslint-disable-next-line security/detect-object-injection
      seen[accountKey] = true
      const ourLockID = await this.fifoLock(accountKey)
      ourLocks.push(ourLockID)
    }
    this.fifoUnlock('atomicWrapper', wrapperLockId)
    return ourLocks
  },

  /**
   * bulkFifoUnlockAccounts
   * @param {string[]} accountIDs
   * @param {number[]} ourLocks
   */
  bulkFifoUnlockAccounts(accountIDs: string[], ourLocks: number[]) {
    if (this.config.stateManager.fifoUnlockFix3 === true) {
      return
    }
    const seen: StringBoolObjectMap = {}

    // unlock the accounts we locked
    /* eslint-disable security/detect-object-injection */
    for (let i = 0; i < ourLocks.length; i++) {
      const accountID = accountIDs[i]
      if (seen[accountID] === true) {
        continue
      }
      seen[accountID] = true
      const ourLockID = ourLocks[i]
      if (ourLockID == -1) {
        this.statemanager_fatal(
          `bulkFifoUnlockAccounts_fail`,
          `bulkFifoUnlockAccounts hit placeholder i:${i} ${utils.stringifyReduce({ accountIDs, ourLocks })} `
        )
      }

      this.fifoUnlock(accountID, ourLockID)
    }
    /* eslint-enable security/detect-object-injection */
  },

  getLockedFifoAccounts(): FifoLockObjectMap {
    const results = {}
    if (this.fifoLocks != null) {
      for (const [key, value] of Object.entries(this.fifoLocks)) {
        const fifoLock = value as any
        if (fifoLock.queueLocked) {
          // eslint-disable-next-line security/detect-object-injection
          results[key] = fifoLock
        }
      }
    }
    return results
  },

  /**
   * this funtion will unlock all fifo locks that are currently locked
   * ideally we should not be calling this, but it is currently needed
   * as we try to transition to more stable fifo locks.
   * @param tag
   * @returns
   */
  forceUnlockAllFifoLocks(tag: string): number {
    nestedCountersInstance.countEvent('processing', 'forceUnlockAllFifoLocks ' + tag)

    const locked = this.getLockedFifoAccounts()
    let clearCount = 0
    for (const value of Object.values(locked)) {
      const fifoLock = value as any
      fifoLock.queueLocked = false
      fifoLock.waitingList = []
      //set this so we don't clean it up too soon.
      fifoLock.lastLock = shardusGetTime()
      //value.queueCounter
      //do we need to fix up counters
      clearCount++
    }
    return clearCount
  },

  /**
   * now that we have fixes a but that was stomping fifo locks we could have a problem
   * where the memory grows forever.  This function will clean up old locks that are no longer needed.
   */
  clearStaleFifoLocks() {
    try {
      const time = shardusGetTime() - 1000 * 60 * 10 //10 minutes ago
      const keysToDelete = []
      for (const [key, value] of Object.entries(this.fifoLocks)) {
        const fifoLock = value as any
        if (fifoLock.lastLock < time && fifoLock.queueLocked === false) {
          keysToDelete.push(key)
        }
      }

      for (const key of keysToDelete) {
        // eslint-disable-next-line security/detect-object-injection
        delete this.fifoLocks[key]
      }
      nestedCountersInstance.countEvent('stateManager', 'clearStaleFifoLocks', keysToDelete.length)
    } catch (err) {
      this.mainLogger.error(`clearStaleFifoLocks: ${err}`)
    }
  }
}