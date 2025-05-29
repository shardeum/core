import { P2P as P2PTypes } from '@shardeum-foundation/lib-types'
import { logFlags } from '../logger'
import * as utils from '../utils'
import * as ShardusTypes from '../shardus/shardus-types'
import ShardFunctions from './shardFunctions'
import { GetAccountDataByRangeSmart } from './state-manager-types'
import { nestedCountersInstance } from '../utils/nestedCounters'
import * as Comms from '../p2p/Comms'
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum'
// GetAccountDataByRange types are not used in this file
import * as NodeList from '../p2p/NodeList'
import { shardusGetTime } from '../network'
import { AccountCopy, WrappedStateArray, AccountHashCache } from './state-manager-types'
import { timingSafeEqual } from 'crypto'
import * as CycleChain from '../p2p/CycleChain'
import { DebugComplete } from '../state-manager/TransactionQueue'
import * as Utils from '../utils'

/***
   *    ##     ## ######## #### ##        ######
   *    ##     ##    ##     ##  ##       ##    ##
   *    ##     ##    ##     ##  ##       ##
   *    ##     ##    ##     ##  ##        ######
   *    ##     ##    ##     ##  ##             ##
   *    ##     ##    ##     ##  ##       ##    ##
   *     #######     ##    #### ########  ######
   */

export const utilsMethods = {
  debugNodeGroup(key: string, key2: number, msg: string, nodes: P2PTypes.P2PTypes.NodeInfo[]) {
    if (logFlags.playback)
      this.logger.playbackLogNote(
        'debugNodeGroup',
        `${utils.stringifyReduce(key)}_${key2}`,
        `${msg} ${utils.stringifyReduce(
          nodes.map((node) => {
            return { id: node.id, port: node.externalPort }
          })
        )}`
      )
  },

  getRandomInt(max: number): number {
    return Math.floor(Math.random() * Math.floor(max))
  },

  tryGetBoolProperty(parent: Record<string, unknown>, propertyName: string, defaultValue: boolean) {
    if (parent == null) {
      return defaultValue
    }
    // eslint-disable-next-line security/detect-object-injection
    const tempValue = parent[propertyName]
    if (typeof tempValue === 'boolean') {
      return tempValue
    }
    return defaultValue
  },

  /**
   * test once at the given probability to fail.  If it fails, log the message and return true.  If it doesnt fail, return false.
   * @param failChance
   * @param debugName
   * @param key
   * @param message
   * @param verboseRequired
   * @returns
   */
  testFailChance(
    failChance: number,
    debugName: string,
    key: string,
    message: string,
    verboseRequired: boolean
  ): boolean {
    if (failChance == null) {
      return false
    }

    const rand = Math.random()
    if (failChance > rand) {
      if (debugName != null) {
        if (verboseRequired === false || logFlags.verbose) {
          this.logger.playbackLogNote(`dbg_fail_${debugName}`, key, message)
        }
        nestedCountersInstance.countEvent('dbg_fail_', debugName ?? 'unknown')
      }
      return true
    }
    return false
  },

  async startCatchUpQueue() {
    //make sure we have cycle shard data.
    await this.waitForShardData('startCatchUpQueue')

    await this._firstTimeQueueAwait()

    if (logFlags.console) console.log('syncStateData startCatchUpQueue ' + '   time:' + shardusGetTime())

    // all complete!
    this.mainLogger.info(`DATASYNC: complete`)
    this.logger.playbackLogState('datasyncComplete', '', '')

    // update the debug tag and restart the queue
    this.dataPhaseTag = 'ACTIVE: '
    this.accountSync.dataSyncMainPhaseComplete = true
    //update sync statement
    this.accountSync.syncStatement.syncComplete = true
    this.accountSync.syncStatement.cycleEnded = this.currentCycleShardData.cycleNumber
    this.accountSync.syncStatement.numCycles =
      this.accountSync.syncStatement.cycleEnded - this.accountSync.syncStatement.cycleStarted

    this.accountSync.syncStatement.syncEndTime = shardusGetTime()
    this.accountSync.syncStatement.syncSeconds =
      (this.accountSync.syncStatement.syncEndTime - this.accountSync.syncStatement.syncStartTime) / 1000

    /* prettier-ignore */ nestedCountersInstance.countEvent('sync', `sync comlete numCycles: ${this.accountSync.syncStatement.numCycles} start:${this.accountSync.syncStatement.cycleStarted} end:${this.accountSync.syncStatement.cycleEnded} numAccounts: ${this.accountSync.syncStatement.numAccounts}`)
    if (this.accountSync.syncStatement.internalFlag === true) {
      /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_sync_syncStatement', ` `, `${utils.stringifyReduce(this.accountSync.syncStatement)}`)
      this.accountSync.syncStatmentIsComplete()
      /* prettier-ignore */ this.statemanager_fatal( 'shrd_sync_syncStatement-startCatchUpQueue', `${utils.stringifyReduce(this.accountSync.syncStatement)}` )
      /* prettier-ignore */ this.mainLogger.debug(`DATASYNC: syncStatement-startCatchUpQueue c:${this.currentCycleShardData.cycleNumber} ${utils.stringifyReduce(this.accountSync.syncStatement)}`)
    } else {
      this.accountSync.syncStatement.internalFlag = true
    }

    this.tryStartTransactionProcessingQueue()

    if (logFlags.playback) this.logger.playbackLogNote('shrd_sync_mainphaseComplete', ` `, `  `)
  },

  // just a placeholder for later
  recordPotentialBadnode() {
    // The may need to live on the p2p class, or call into it
    // record the evidence.
    // potentially report it
  },

  /**
   * writeCombinedAccountDataToBackups
   * @param failedHashes This is a list of hashes that failed and should be ignored in the write operation.
   */
  async writeCombinedAccountDataToBackups(
    goodAccounts: ShardusTypes.WrappedData[],
    failedHashes: string[]
  ): Promise<number> {
    // ?:{[id:string]: boolean}
    if (failedHashes.length === 0 && goodAccounts.length === 0) {
      return 0 // nothing to do yet
    }

    const failedAccountsById: { [id: string]: boolean } = {}
    for (const hash of failedHashes) {
      // eslint-disable-next-line security/detect-object-injection
      failedAccountsById[hash] = true
    }

    const lastCycle = this.p2p.state.getLastCycle()
    const cycleNumber = lastCycle.counter
    const accountCopies: AccountCopy[] = []
    for (const accountEntry of goodAccounts) {
      // check failed hashes
      if (failedAccountsById[accountEntry.stateId]) {
        continue
      }
      // wrappedAccounts.push({ accountId: account.address, stateId: account.hash, data: account, timestamp: account.timestamp })
      const isGlobal = this.accountGlobals.isGlobalAccount(accountEntry.accountId)
      const accountCopy: AccountCopy = {
        accountId: accountEntry.accountId,
        data: accountEntry.data,
        timestamp: accountEntry.timestamp,
        hash: accountEntry.stateId,
        cycleNumber,
        isGlobal: isGlobal || false,
      }
      accountCopies.push(accountCopy)
    }
    /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug('writeCombinedAccountDataToBackups ' + accountCopies.length + ' ' + utils.stringifyReduce(accountCopies))

    if (logFlags.verbose) console.log('DBG accountCopies.  (in main log)')

    // await this.storage.createAccountCopies(accountCopies)
    await this.storage.createOrReplaceAccountCopy(accountCopies)

    return accountCopies.length
  },

  // let this learn offset..
  // if we get the same range request from the same client..... nope!

  // This will make calls to app.getAccountDataByRange but if we are close enough to real time it will query any newer data and return lastUpdateNeeded = true
  async getAccountDataByRangeSmart(
    accountStart: string,
    accountEnd: string,
    tsStart: number,
    maxRecords: number,
    offset: number,
    accountOffset: string
  ): Promise<GetAccountDataByRangeSmart> {
    const tsEnd = shardusGetTime()

    // todo convert this to use account backup data, then compare perf vs app as num accounts grows past 10k

    // alternate todo: query it all from the app then create a smart streaming wrapper that persists between calls and even
    // handles updates to day by putting updated data at the end of the list with updated data wrappers.

    const wrappedAccounts = await this.app.getAccountDataByRange(
      accountStart,
      accountEnd,
      tsStart,
      tsEnd,
      maxRecords,
      offset,
      accountOffset
    )
    let lastUpdateNeeded = false
    let wrappedAccounts2: WrappedStateArray = []
    let highestTs = 0
    let delta = 0
    // do we need more updates
    if (wrappedAccounts.length === 0) {
      lastUpdateNeeded = true
    } else {
      // see if our newest record is new enough
      highestTs = 0
      for (const account of wrappedAccounts) {
        if (account.timestamp > highestTs) {
          highestTs = account.timestamp
        }
      }
      delta = tsEnd - highestTs
      // if the data we go was close enough to current time then we are done
      // may have to be carefull about how we tune this value relative to the rate that we make this query
      // we should try to make this query more often then the delta.
      if (logFlags.verbose) console.log('delta ' + delta)
      // increased allowed delta to allow for a better chance to catch up

      if (delta < this.queueSitTime * 2) {
        const tsStart2 = highestTs
        wrappedAccounts2 = await this.app.getAccountDataByRange(
          accountStart,
          accountEnd,
          tsStart2,
          shardusGetTime(),
          maxRecords,
          0,
          ''
        )
        lastUpdateNeeded = true //?? not sure .. this could cause us to skip some, but that is ok!
      }
    }
    return { wrappedAccounts, lastUpdateNeeded, wrappedAccounts2, highestTs, delta }
  },

  testAccountDataWrapped(accountDataList: ShardusTypes.WrappedData[]) {
    if (accountDataList == null) {
      return
    }
    for (const wrappedData of accountDataList) {
      const { accountId, stateId, data: recordData } = wrappedData
      if (stateId != wrappedData.stateId) {
        /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`testAccountDataWrapped what is going on!!:  ${utils.makeShortHash(wrappedData.stateId)}  stateId: ${utils.makeShortHash(stateId)} `)
      }
      const hash = this.app.calculateAccountHash(recordData)

      // comparison safe against timing attacks
      if (stateId.length !== hash.length || !timingSafeEqual(Buffer.from(stateId), Buffer.from(hash))) {
        /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`testAccountDataWrapped hash test failed: setAccountData for account ${utils.makeShortHash(accountId)} expected account hash: ${utils.makeShortHash(stateId)} got ${utils.makeShortHash(hash)} `)
        /* prettier-ignore */ if (logFlags.error) this.mainLogger.error('testAccountDataWrapped hash test failed: details: ' + utils.stringifyReduce(recordData))
        /* prettier-ignore */ if (logFlags.error) this.mainLogger.error('testAccountDataWrapped hash test failed: wrappedData.stateId: ' + utils.makeShortHash(wrappedData.stateId))
        const stack = new Error().stack
        if (logFlags.error) this.mainLogger.error(`stack: ${stack}`)
      }
    }
  },

  async checkAndSetAccountData(
    accountRecords: ShardusTypes.WrappedData[],
    note: string,
    processStats: boolean,
    updatedAccounts: string[] = null
  ): Promise<string[]> {
    const accountsToAdd: unknown[] = []
    const wrappedAccountsToAdd: ShardusTypes.WrappedData[] = []
    const failedHashes: string[] = []
    for (const wrappedAccount of accountRecords) {
      const { accountId, stateId, data: recordData, timestamp } = wrappedAccount
      const hash = this.app.calculateAccountHash(recordData)
      const cycleToRecordOn = CycleChain.getCycleNumberFromTimestamp(wrappedAccount.timestamp)
      if (cycleToRecordOn <= -1) {
        this.statemanager_fatal(
          `checkAndSetAccountData cycleToRecordOn==-1`,
          `checkAndSetAccountData cycleToRecordOn==-1 ${wrappedAccount.timestamp}`
        )
        failedHashes.push(accountId)
        return failedHashes
      }
      //TODO perf remove this when we are satisfied with the situation
      //Additional testing to cache if we try to overrite with older data
      if (this.accountCache.hasAccount(accountId)) {
        const accountMemData: AccountHashCache = this.accountCache.getAccountHash(accountId)
        if (timestamp < accountMemData.t) {
          //should update cache anyway (older value may be needed)

          // I have doubts that cache should be able to roll a value back..
          this.accountCache.updateAccountHash(
            wrappedAccount.accountId,
            wrappedAccount.stateId,
            wrappedAccount.timestamp,
            cycleToRecordOn
          )

          /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`setAccountData: abort. checkAndSetAccountData older timestamp note:${note} acc: ${utils.makeShortHash(accountId)} timestamp:${timestamp} accountMemData.t:${accountMemData.t} hash: ${utils.makeShortHash(hash)} cache:${utils.stringifyReduce(accountMemData)}`)
          continue //this is a major error need to skip the writing.
        }
      }

      if (stateId.length === hash.length && timingSafeEqual(Buffer.from(stateId), Buffer.from(hash))) {
        accountsToAdd.push(recordData)
        wrappedAccountsToAdd.push(wrappedAccount)

        if (updatedAccounts != null) {
          updatedAccounts.push(accountId)
        }

        const debugString = `setAccountData: note:${note} acc: ${utils.makeShortHash(
          accountId
        )} hash: ${utils.makeShortHash(hash)} ts:${wrappedAccount.timestamp}`
        if (logFlags.debug) this.mainLogger.debug(debugString)
        if (logFlags.verbose) console.log(debugString)

        if (wrappedAccount.timestamp === 0) {
          const stack = new Error().stack

          this.statemanager_fatal(
            `checkAndSetAccountData ts=0`,
            `checkAndSetAccountData ts=0 ${debugString}    ${stack}`
          )
        }

        if (processStats) {
          if (this.accountCache.hasAccount(accountId)) {
            //TODO STATS BUG..  this is what can cause one form of stats bug.
            //we may have covered this account in the past, then not covered it, and now we cover it again.  Stats doesn't know how to repair
            // this situation.
            //TODO, need a way to re-init.. dang idk how to do that!
            //this.partitionStats.statsDataSummaryUpdate2(cycleToRecordOn, null, wrapedAccount)

            const tryToCorrectStats = true
            if (tryToCorrectStats) {
              /* prettier-ignore */ this.transactionQueue.setDebugLastAwaitedCallInner('ths.app.getAccountDataByList')
              const accounts = await this.app.getAccountDataByList([wrappedAccount.accountId])
              /* prettier-ignore */ this.transactionQueue.setDebugLastAwaitedCallInner('ths.app.getAccountDataByList', DebugComplete.Completed)
              if (accounts != null && accounts.length === 1) {
                this.partitionStats.statsDataSummaryUpdate(
                  cycleToRecordOn,
                  accounts[0].data,
                  wrappedAccount,
                  'checkAndSetAccountData-' + note
                )
              }
            } else {
              //old way
              this.accountCache.updateAccountHash(
                wrappedAccount.accountId,
                wrappedAccount.stateId,
                wrappedAccount.timestamp,
                cycleToRecordOn
              )
            }
          } else {
            //I think some work was done to fix diverging stats, but how did it turn out?
            this.partitionStats.statsDataSummaryInit(
              cycleToRecordOn,
              wrappedAccount.accountId,
              wrappedAccount.data,
              'checkAndSetAccountData-' + note
            )
          }
        } else {
          //even if we do not process stats still need to update cache
          //todo maybe even take the stats out of the pipeline for updating cache? (but that is kinda tricky)
          this.accountCache.updateAccountHash(
            wrappedAccount.accountId,
            wrappedAccount.stateId,
            wrappedAccount.timestamp,
            cycleToRecordOn
          )
        }
      } else {
        /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`setAccountData hash test failed: setAccountData for account ${utils.makeShortHash(accountId)} expected account hash: ${utils.makeShortHash(stateId)} got ${utils.makeShortHash(hash)} `)
        /* prettier-ignore */ if (logFlags.error) this.mainLogger.error('setAccountData hash test failed: details: ' + utils.stringifyReduce(recordData))
        /* prettier-ignore */ if (logFlags.verbose) console.log(`setAccountData hash test failed: setAccountData for account ${utils.makeShortHash(accountId)} expected account hash: ${utils.makeShortHash(stateId)} got ${utils.makeShortHash(hash)} `)
        /* prettier-ignore */ if (logFlags.verbose) console.log('setAccountData hash test failed: details: ' + utils.stringifyReduce(recordData))
        failedHashes.push(accountId)
      }
    }
    /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`setAccountData toAdd:${accountsToAdd.length}  failed:${failedHashes.length}`)
    /* prettier-ignore */ if (logFlags.verbose) console.log(`setAccountData toAdd:${accountsToAdd.length}  failed:${failedHashes.length}`)
    /* prettier-ignore */ this.transactionQueue.setDebugLastAwaitedCallInner('ths.app.setAccountData')
    await this.app.setAccountData(accountsToAdd)
    /* prettier-ignore */ this.transactionQueue.setDebugLastAwaitedCallInner('ths.app.setAccountData', DebugComplete.Completed)
    this.transactionQueue.processNonceQueue(wrappedAccountsToAdd)
    return failedHashes
  }
}