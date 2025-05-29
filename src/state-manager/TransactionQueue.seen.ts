import { SeenAccounts, QueueEntry } from './state-manager-types'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { logFlags } from '../logger'

interface TransactionQueueContext {
  config: any
  queueReads: Set<string>
  queueWrites: Set<string>
  queueReadWritesOld: Set<string>
  mainLogger: any
  processQueue_accountSeen2: (seenAccounts: SeenAccounts, queueEntry: QueueEntry) => boolean
  processQueue_markAccountsSeen2: (seenAccounts: SeenAccounts, queueEntry: QueueEntry) => void
}

export const seenMethods = {
    /**
   * processQueue_accountSeen
   * Helper for processQueue to detect if this queueEntry has any accounts that are already blocked because they were seen upstream
   * a seen account is a an account that is involved in a TX that is upstream(older) in the queue
   * @param seenAccounts
   * @param queueEntry
   */
  processQueue_accountSeen(this: TransactionQueueContext, seenAccounts: SeenAccounts, queueEntry: QueueEntry): boolean {
    if (this.config.debug.useShardusMemoryPatterns && queueEntry.shardusMemoryPatternSets != null) {
      return this.processQueue_accountSeen2(seenAccounts, queueEntry)
    }

    if (queueEntry.uniqueKeys == null) {
      //TSConversion double check if this needs extra logging
      return false
    }
    for (const key of queueEntry.uniqueKeys) {
      // eslint-disable-next-line security/detect-object-injection
      if (seenAccounts[key] != null) {
        return true
      }
    }
    return false
  },

  processQueue_getUpstreamTx(this: TransactionQueueContext, seenAccounts: SeenAccounts, queueEntry: QueueEntry): QueueEntry | null {
    if (this.config.debug.useShardusMemoryPatterns && queueEntry.shardusMemoryPatternSets != null) {
      return null
    }
    if (queueEntry.uniqueKeys == null) {
      //TSConversion double check if this needs extra logging
      return null
    }
    for (const key of queueEntry.uniqueKeys) {
      // eslint-disable-next-line security/detect-object-injection
      if (seenAccounts[key] != null) {
        return seenAccounts[key]
      }
    }
    return null
  },

  /**
   * processQueue_markAccountsSeen
   * Helper for processQueue to mark accounts as seen.
   *    note only operates on writeable accounts.  a read only account should not block downstream operations
   * a seen account is a an account that is involved in a TX that is upstream(older) in the queue
   * @param seenAccounts
   * @param queueEntry
   */
  processQueue_markAccountsSeen(this: TransactionQueueContext, seenAccounts: SeenAccounts, queueEntry: QueueEntry): void {
    if (this.config.debug.useShardusMemoryPatterns && queueEntry.shardusMemoryPatternSets != null) {
      this.processQueue_markAccountsSeen2(seenAccounts, queueEntry)
      return
    }

    if (queueEntry.uniqueWritableKeys == null) {
      //TSConversion double check if this needs extra logging
      return
    }
    // only mark writeable keys as seen but we will check/clear against all keys
    /* eslint-disable security/detect-object-injection */
    for (const key of queueEntry.uniqueWritableKeys) {
      if (seenAccounts[key] == null) {
        seenAccounts[key] = queueEntry
      }
    }
    /* eslint-enable security/detect-object-injection */
  },

  // this.queueReads = new Set()
  // this.queueWrites = new Set()
  processQueue_accountSeen2(this: TransactionQueueContext, seenAccounts: SeenAccounts, queueEntry: QueueEntry): boolean {
    if (queueEntry.uniqueKeys == null) {
      //TSConversion double check if this needs extra logging
      return false
    }

    if (queueEntry.shardusMemoryPatternSets != null) {
      //normal blocking for read write
      for (const id of queueEntry.shardusMemoryPatternSets.rw) {
        if (this.queueWrites.has(id)) {
          // nestedCountersInstance.countEvent('stateManager', 'shrd_accountSeen rw queue_write')
          // nestedCountersInstance.countEvent('stateManager', `shrd_accountSeen rw queue_write ${id}`)
          return true
        }
        if (this.queueReadWritesOld.has(id)) {
          // nestedCountersInstance.countEvent('stateManager', 'shrd_accountSeen rw old queue_write')
          // nestedCountersInstance.countEvent('stateManager', `shrd_accountSeen rw old queue_write ${id}`)
          return true
        }
        //also blocked by upstream reads
        if (this.queueReads.has(id)) {
          // nestedCountersInstance.countEvent('stateManager', 'shrd_accountSeen rw queue_read')
          // nestedCountersInstance.countEvent('stateManager', `shrd_accountSeen rw queue_read ${id}`)
          return true
        }
      }
      // in theory write only is not blocked by upstream writes
      // but has to wait its turn if there is an uptream read
      for (const id of queueEntry.shardusMemoryPatternSets.wo) {
        //also blocked by upstream reads
        if (this.queueReads.has(id)) {
          // nestedCountersInstance.countEvent('stateManager', 'shrd_accountSeen wo queue_read')
          // nestedCountersInstance.countEvent('stateManager', `shrd_accountSeen wo queue_read ${id}`)
          return true
        }
        if (this.queueReadWritesOld.has(id)) {
          // nestedCountersInstance.countEvent('stateManager', 'shrd_accountSeen wo queue_read_write_old')
          // nestedCountersInstance.countEvent('stateManager', `shrd_accountSeen wo queue_read_write_old ${id}`)
          return true
        }
      }

      // write once...  also not blocked in theory, because the first op is a write
      // this is a special case for something like code bytes that are written once
      // and then immutable
      // for (const id of queueEntry.shardusMemoryPatternSets.on) {
      //   if(this.queueWrites.has(id)){
      //     return true
      //   }
      //   if(this.queueWritesOld.has(id)){
      //     return true
      //   }
      // }

      //read only blocks for upstream writes
      for (const id of queueEntry.shardusMemoryPatternSets.ro) {
        if (this.queueWrites.has(id)) {
          nestedCountersInstance.countEvent('stateManager', 'shrd_accountSeen ro queue_write')
          return true
        }
        if (this.queueReadWritesOld.has(id)) {
          nestedCountersInstance.countEvent('stateManager', 'shrd_accountSeen ro queue_read_write_old')
          return true
        }
        //note blocked by upstream reads, because this read only operation
        //will not impact the upstream read
      }

      //we made it, not blocked
      return false
    }

    for (const key of queueEntry.uniqueKeys) {
      // eslint-disable-next-line security/detect-object-injection
      if (seenAccounts[key] != null) {
        return true
      }
    }

    return false
  },

  processQueue_markAccountsSeen2(this: TransactionQueueContext, seenAccounts: SeenAccounts, queueEntry: QueueEntry): void {
    if (queueEntry.uniqueWritableKeys == null) {
      //TSConversion double check if this needs extra logging
      return
    }

    if (queueEntry.shardusMemoryPatternSets != null) {
      for (const id of queueEntry.shardusMemoryPatternSets.rw) {
        this.queueWrites.add(id)
        this.queueReads.add(id)
      }
      for (const id of queueEntry.shardusMemoryPatternSets.wo) {
        this.queueWrites.add(id)
      }
      for (const id of queueEntry.shardusMemoryPatternSets.on) {
        this.queueWrites.add(id)
      }
      for (const id of queueEntry.shardusMemoryPatternSets.ro) {
        this.queueReads.add(id)
      }
      return
    }

    // only mark writeable keys as seen but we will check/clear against all keys
    /* eslint-disable security/detect-object-injection */
    for (const key of queueEntry.uniqueWritableKeys) {
      if (seenAccounts[key] == null) {
        seenAccounts[key] = queueEntry
      }
      //old style memory access is treated as RW:
      this.queueReadWritesOld.add(key)
    }
    /* eslint-enable security/detect-object-injection */
  },

  /**
   * processQueue_clearAccountsSeen
   * Helper for processQueue to clear accounts that were marked as seen.
   * a seen account is a an account that is involved in a TX that is upstream(older) in the queue
   * @param seenAccounts
   * @param queueEntry
   */
  processQueue_clearAccountsSeen(this: TransactionQueueContext, seenAccounts: SeenAccounts, queueEntry: QueueEntry): void {
    if (queueEntry.uniqueKeys == null) {
      //TSConversion double check if this needs extra logging
      return
    }
    /* eslint-disable security/detect-object-injection */
    for (const key of queueEntry.uniqueKeys) {
      if (seenAccounts[key] != null && seenAccounts[key].logID === queueEntry.logID) {
        if (logFlags.verbose) this.mainLogger.debug(`${new Date()}}clearing key ${key} for tx ${queueEntry.logID}`)
        seenAccounts[key] = null
      }
    }
    /* eslint-enable security/detect-object-injection */
  }
}