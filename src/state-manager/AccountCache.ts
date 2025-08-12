import * as Shardus from '../shardus/shardus-types'

import Profiler from '../utils/profiler'
import Crypto from '../crypto'
import Logger from '../logger'
import StateManager from '.'
import {
  AccountHashCache,
  AccountHashCacheMain3,
  CycleShardData,
  AccountHashCacheList,
} from './state-manager-types'
import { Logger as Log4jsLogger } from 'log4js'

class AccountCache {
  app: Shardus.App
  crypto: Crypto
  config: Shardus.StrictServerConfiguration
  profiler: Profiler

  logger: Logger

  mainLogger: Log4jsLogger
  fatalLogger: Log4jsLogger
  shardLogger: Log4jsLogger
  statsLogger: Log4jsLogger

  accountsHashCache3: AccountHashCacheMain3 //This is the main storage

  cacheUpdateQueue: AccountHashCacheList

  statemanager_fatal: (key: string, log: string) => void
  stateManager: StateManager

  constructor(
    stateManager: StateManager,
    profiler: Profiler,
    app: Shardus.App,
    logger: Logger,
    crypto: Crypto,
    config: Shardus.StrictServerConfiguration
  ) {
    this.crypto = crypto
    this.app = app
    this.logger = logger
    this.config = config
    this.profiler = profiler

    if (logger == null) {
      return // for debug
    }

    this.mainLogger = logger.getLogger('main')
    this.fatalLogger = logger.getLogger('fatal')
    this.shardLogger = logger.getLogger('shardDump')
    this.statsLogger = logger.getLogger('statsDump')
    this.statemanager_fatal = stateManager.statemanager_fatal
    this.stateManager = stateManager

    this.accountsHashCache3 = {
      currentCalculationCycle: -1,
      workingHistoryList: { accountIDs: [], accountHashesSorted: [] },
      accountHashMap: new Map(),
      futureHistoryList: { accountIDs: [], accountHashesSorted: [] },
    }

    this.cacheUpdateQueue = { accountIDs: [], accountHashesSorted: [] }
  }

  resetAccountCache(): void {
    this.accountsHashCache3 = {
      currentCalculationCycle: -1,
      workingHistoryList: { accountIDs: [], accountHashesSorted: [] },
      accountHashMap: new Map(),
      futureHistoryList: { accountIDs: [], accountHashesSorted: [] },
    }
    this.cacheUpdateQueue = { accountIDs: [], accountHashesSorted: [] }
  }

  ////////////////////////////////
  /**
     * updateAccountHash
     * This takes an accountID, hash, timestamp and cycle and updates the cache.
     *   if this is for a future cycle then the data goes into queue to get processed later in buildPartitionHashesForNode
        METHOD 3
        More simple than method 2, but higher perf and some critical feature advantages over method 1 like the history working list and queue
     */
  ///////////////

  updateAccountHash(accountId: string, accountHash: string, timestamp: number, cycle: number): void {
    return // no-op
  }

  //question: when how does the future list avoid immediate data update?  the map seems to get updated right away?
  //answer: because a list is used, the hash for the correct cycle can be found
  //question2: queueIndex does not get cleared is that ok? what about when future becomes current should we set lastSeenSortIndex
  // fixes applied.  it ok that it is not clear because we check the cycle the index was set on before using it
  //question3: what is up with currentCalculationCycle, and is it updated in the right spot?
  // yes this is correct.  buildPartitionHashesForNode gets called with the last cycle data not the active cycle
  // at the end of buildPartitionHashesForNode gets set to the working/current cycle.
  // if TXs come in that are newer they get put in the future list and are not part of the parition hash report yet

  async hasAccount(accountId: string): Promise<boolean> {
    const accountDataList = await this.app.getAccountDataByList([accountId])
    const storageResult = !!(accountDataList && accountDataList.length > 0 && accountDataList[0] != null)
    return storageResult
  }

  //just gets the newest seen hash.  does that cause issues?
  async getAccountHash(accountId: string): Promise<AccountHashCache> {
    const accountDataList = await this.app.getAccountDataByList([accountId])
    let storageResult: AccountHashCache = null
    if (accountDataList && accountDataList.length > 0 && accountDataList[0] != null) {
      const accountData = accountDataList[0]
      storageResult = {
        h: accountData.stateId,
        t: accountData.timestamp || Date.now(),
        c: this.stateManager?.currentCycleShardData?.cycleNumber || 0
      }
    }
    return storageResult
  }


  // The IMPORTANT part of the old processCacheUpdates which updates the trie.
  //if we cycle is too new then put in next list:
  //if (accountHashData.c > cycleToProcess) {
  //  nextCacheUpdateQueue.accountHashesSorted.push(accountHashData)
  //  nextCacheUpdateQueue.accountIDs.push(accountID)
  //  continue
  //}
  //this.stateManager.accountPatcher.updateAccountHash(accountID, accountHashData.h)  //very important call in the data pipeline.
  //this.cacheUpdateQueue = nextCacheUpdateQueue
  // END of IMPORTANT part of old processCacheUpdates.

  // currently a sync function, dont have correct buffers for async
  processCacheUpdates(cycleShardData: CycleShardData): void {

    //todo maybe need to bring back this current cycle to process number?

    return // no-op
  }
}

export default AccountCache
