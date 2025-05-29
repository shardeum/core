import * as Shardus from '../shardus/shardus-types'
import { StateManager as StateManagerTypes } from '@shardeum-foundation/lib-types'
import * as utils from '../utils'
import Profiler, { profilerInstance } from '../utils/profiler'
import { P2PModuleContext as P2P } from '../p2p/Context'
import Crypto, { HashableObject } from '../crypto'
import Logger, { logFlags } from '../logger'
import log4js from 'log4js'
import ShardFunctions from './shardFunctions'
import StateManager from '.'
import { nestedCountersInstance } from '../utils/nestedCounters'
import * as NodeList from '../p2p/NodeList'
import * as Context from '../p2p/Context'
import * as Self from '../p2p/Self'
import { SignedObject } from '@shardeum-foundation/lib-crypto-utils'
import {
  AccountHashCache,
  AccountHashCacheHistory,
  AccountIDAndHash,
  AccountIdAndHashToRepair,
  AccountPreTest,
  HashTrieAccountDataRequest,
  HashTrieAccountDataResponse,
  HashTrieAccountsResp,
  HashTrieNode,
  HashTrieRadixCoverage,
  HashTrieReq,
  HashTrieResp,
  HashTrieSyncConsensus,
  HashTrieSyncTell,
  HashTrieUpdateStats,
  RadixAndHashWithNodeId,
  RadixAndChildHashesWithNodeId,
  RadixAndHash,
  ShardedHashTrie,
  TrieAccount,
  IsInsyncResult,
  CycleShardData,
  SignedReceipt,
} from './state-manager-types'
import {
  isDebugModeMiddleware,
  isDebugModeMiddlewareLow,
  isDebugModeMiddlewareMedium,
} from '../network/debugMiddleware'
import { appdata_replacer, errorToStringFull, Ordering } from '../utils'
import { Response } from 'express-serve-static-core'
import { shardusGetTime } from '../network'
import { InternalBinaryHandler } from '../types/Handler'
import { Route } from '@shardeum-foundation/lib-types/build/src/p2p/P2PTypes'
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum'
import {
  SyncTrieHashesRequest,
  deserializeSyncTrieHashesReq,
  serializeSyncTrieHashesReq,
} from '../types/SyncTrieHashesReq'
import {
  GetTrieHashesResponse,
  serializeGetTrieHashesResp,
  deserializeGetTrieHashesResp,
} from '../types/GetTrieHashesResp'
import { GetTrieHashesRequest, deserializeGetTrieHashesReq, serializeGetTrieHashesReq } from '../types/GetTrieHashesReq'
import {
  deserializeGetAccountDataByHashesResp,
  GetAccountDataByHashesResp,
  serializeGetAccountDataByHashesResp,
} from '../types/GetAccountDataByHashesResp'
import {
  deserializeGetAccountDataByHashesReq,
  GetAccountDataByHashesReq,
  serializeGetAccountDataByHashesReq,
} from '../types/GetAccountDataByHashesReq'
import { WrappedData } from '../types/WrappedData'
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum'
import { getStreamWithTypeCheck, requestErrorHandler } from '../types/Helpers'
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum'
import {
  GetTrieAccountHashesReq,
  deserializeGetTrieAccountHashesReq,
  serializeGetTrieAccountHashesReq,
} from '../types/GetTrieAccountHashesReq'
import {
  GetTrieAccountHashesResp,
  deserializeGetTrieAccountHashesResp,
  serializeGetTrieAccountHashesResp,
} from '../types/GetTrieAccountHashesResp'
import { BadRequest, InternalError, serializeResponseError } from '../types/ResponseError'
import { Utils } from '@shardeum-foundation/lib-types'
import {
  RepairOOSAccountsReq,
  deserializeRepairOOSAccountsReq,
  serializeRepairOOSAccountsReq,
} from '../types/RepairOOSAccountsReq'
import { robustQuery } from '../p2p/Utils'
import { RequestReceiptForTxReqSerialized, serializeRequestReceiptForTxReq } from '../types/RequestReceiptForTxReq'
import { deserializeRequestReceiptForTxResp, RequestReceiptForTxRespSerialized } from '../types/RequestReceiptForTxResp'
import { Node } from '../shardus/shardus-types'
import { debugMethods } from './AccountPatcher.debug'
import { finderMethods } from './AccountPatcher.finder'
import { handlerMethods } from './AccountPatcher.handlers'
import { trieMethods } from './AccountPatcher.trie'

type Line = {
  raw: string
  file: {
    owner: string
  }
}
type AccountHashStats = {
  matched: number
  visisted: number
  empty: number
  nullResults: number
  numRequests: number
  responses: number
  exceptions: number
  radixToReq: number
  actualRadixRequests: number
}

type AccountStats = {
  skipping: number
  multiRequests: number
  requested: number
}

interface AccountRepairDataResponse {
  nodes: Shardus.Node[]
  wrappedDataList: Shardus.WrappedData[]
}
interface TooOldAccountRecord {
  wrappedData: Shardus.WrappedData
  accountMemData: AccountHashCache
  node: Shardus.Node
}
interface TooOldAccountUpdateRequest {
  accountID: string
  txId: string
  signedReceipt: SignedReceipt
  updatedAccountData: Shardus.WrappedData
}

type RequestEntry = { node: Shardus.Node; request: { cycle: number; accounts: AccountIDAndHash[] } }

class AccountPatcher {
  app: Shardus.App
  crypto: Crypto
  config: Shardus.StrictServerConfiguration
  profiler: Profiler

  p2p: P2P

  logger: Logger

  mainLogger: log4js.Logger
  fatalLogger: log4js.Logger
  shardLogger: log4js.Logger
  statsLogger: log4js.Logger

  statemanager_fatal: (key: string, log: string) => void
  stateManager: StateManager

  treeMaxDepth: number
  treeSyncDepth: number
  shardTrie: ShardedHashTrie

  totalAccounts: number

  accountUpdateQueue: TrieAccount[]
  accountUpdateQueueFuture: TrieAccount[]

  accountRemovalQueue: string[]

  hashTrieSyncConsensusByCycle: Map<number, HashTrieSyncConsensus>

  incompleteNodes: HashTrieNode[]

  debug_ignoreUpdates: boolean

  lastInSyncResult: IsInsyncResult

  failedLastTrieSync: boolean
  failStartCycle: number
  failEndCycle: number
  failRepairsCounter: number
  syncFailHistory: { s: number; e: number; cycles: number; repaired: number }[]

  sendHashesToEdgeNodes: boolean

  lastCycleNonConsensusRanges: { low: string; high: string }[]

  nonStoredRanges: { low: string; high: string }[]
  radixIsStored: Map<string, boolean>
  repairRequestsMadeThisCycle: { cycle: number; numRequests: number } = { cycle: -1, numRequests: 0 }

  lastRepairInfo: unknown

  // Methods from split files
  processShardDump: (stream: Response<unknown, Record<string, unknown>, number>, lines: Line[]) => { allPassed: boolean; allPassed2: boolean }
  findBadAccounts: (cycle: number) => Promise<any>
  setupHandlers: () => void
  upateShardTrie: (cycle: number) => HashTrieUpdateStats
  updateTrieAndBroadCast: (cycle: number) => Promise<void>

  constructor(
    stateManager: StateManager,
    profiler: Profiler,
    app: Shardus.App,
    logger: Logger,
    p2p: P2P,
    crypto: Crypto,
    config: Shardus.StrictServerConfiguration
  ) {
    this.crypto = crypto
    this.app = app
    this.logger = logger
    this.config = config
    this.profiler = profiler
    this.p2p = p2p

    if (logger == null) {
      return // for debug
    }

    this.mainLogger = logger.getLogger('main')
    this.fatalLogger = logger.getLogger('fatal')
    this.shardLogger = logger.getLogger('shardDump')
    this.statsLogger = logger.getLogger('statsDump')
    this.statemanager_fatal = stateManager.statemanager_fatal
    this.stateManager = stateManager

    //todo these need to be dynamic
    this.treeMaxDepth = 4
    this.treeSyncDepth = 1

    this.shardTrie = {
      layerMaps: [],
    }
    //init or update layer maps. (treeMaxDepth doesn't count root so +1 it)
    for (let i = 0; i < this.treeMaxDepth + 1; i++) {
      this.shardTrie.layerMaps.push(new Map())
    }

    this.totalAccounts = 0

    this.hashTrieSyncConsensusByCycle = new Map()

    this.incompleteNodes = []

    this.accountUpdateQueue = []
    this.accountUpdateQueueFuture = []
    this.accountRemovalQueue = []

    this.debug_ignoreUpdates = false

    this.failedLastTrieSync = false
    this.lastInSyncResult = null

    this.sendHashesToEdgeNodes = true

    this.lastCycleNonConsensusRanges = []
    this.nonStoredRanges = []
    this.radixIsStored = new Map()

    this.lastRepairInfo = 'none'

    this.failStartCycle = -1
    this.failEndCycle = -1
    this.failRepairsCounter = 0
    this.syncFailHistory = []

    // Bind methods from split files
    Object.assign(AccountPatcher.prototype, debugMethods)
    Object.assign(AccountPatcher.prototype, finderMethods)
    Object.assign(AccountPatcher.prototype, handlerMethods)
    Object.assign(AccountPatcher.prototype, trieMethods)
  }

  hashObj(value: HashableObject): string {
    //could replace with a different cheaper hash!!
    return this.crypto.hash(value)
  }
  sortByAccountID(a: TrieAccount, b: TrieAccount): Ordering {
    if (a.accountID < b.accountID) {
      return -1
    }
    if (a.accountID > b.accountID) {
      return 1
    }
    return 0
  }
  sortByRadix(a: RadixAndHash, b: RadixAndHash): Ordering {
    if (a.radix < b.radix) {
      return -1
    }
    if (a.radix > b.radix) {
      return 1
    }
    return 0
  }

  getAccountTreeInfo(accountID: string): TrieAccount {
    const radix = accountID.substring(0, this.treeMaxDepth)

    const treeNode = this.shardTrie.layerMaps[this.treeMaxDepth].get(radix)
    if (treeNode == null || treeNode.accountTempMap == null) {
      return null
    }
    return treeNode.accountTempMap.get(accountID)
  }  

  getNonConsensusRanges(cycle: number): { low: string; high: string }[] {
    let incompleteRanges = []

    //get the min and max non covered area
    const shardValues = this.stateManager.shardValuesByCycle.get(cycle)

    const consensusStartPartition = shardValues.nodeShardData.consensusStartPartition
    const consensusEndPartition = shardValues.nodeShardData.consensusEndPartition

    incompleteRanges = this.getNonParitionRanges(
      shardValues,
      consensusStartPartition,
      consensusEndPartition,
      this.treeSyncDepth
    )

    return incompleteRanges
  }

  getConsensusRanges(cycle: number): { low: string; high: string }[] {
    let incompleteRanges = []

    //get the min and max non covered area
    const shardValues = this.stateManager.shardValuesByCycle.get(cycle)

    const consensusStartPartition = shardValues.nodeShardData.consensusStartPartition
    const consensusEndPartition = shardValues.nodeShardData.consensusEndPartition

    incompleteRanges = this.getNonParitionRanges(
      shardValues,
      consensusStartPartition,
      consensusEndPartition,
      this.treeSyncDepth
    )

    return incompleteRanges
  }

  getNonStoredRanges(cycle: number): { low: string; high: string }[] {
    let incompleteRanges = []

    //get the min and max non covered area
    const shardValues = this.stateManager.shardValuesByCycle.get(cycle)
    if (shardValues) {
      const consensusStartPartition = shardValues.nodeShardData.storedPartitions.partitionStart
      const consensusEndPartition = shardValues.nodeShardData.storedPartitions.partitionEnd

      incompleteRanges = this.getNonParitionRanges(
        shardValues,
        consensusStartPartition,
        consensusEndPartition,
        this.treeSyncDepth
      )
    }

    return incompleteRanges
  }

  getSyncTrackerRanges(): { low: string; high: string }[] {
    const incompleteRanges = []

    for (const syncTracker of this.stateManager.accountSync.syncTrackers) {
      if (syncTracker.syncFinished === false && syncTracker.isGlobalSyncTracker === false) {
        incompleteRanges.push({
          low: syncTracker.range.low.substring(0, this.treeSyncDepth),
          high: syncTracker.range.high.substring(0, this.treeSyncDepth),
        })
      }
    }
    return incompleteRanges
  }

  /**
   * Uses a wrappable start and end partition range as input and figures out the array
   *  of ranges that would not be covered by these partitions.
   *
   * TODO!  consider if the offset used in "partition space" should really be happening on the result address instead!
   *        I think that would be more correct.  getConsensusSnapshotPartitions would need adjustments after this since it
   *        is making this compensation on its own.
   *
   * @param shardValues
   * @param startPartition
   * @param endPartition
   * @param depth How many characters long should the high/low return values be? usually treeSyncDepth
   */
  getNonParitionRanges(
    shardValues: CycleShardData,
    startPartition: number,
    endPartition: number,
    depth: number
  ): { low: string; high: string }[] {
    const incompleteRanges = []

    const shardGlobals = shardValues.shardGlobals as StateManagerTypes.shardFunctionTypes.ShardGlobals
    const numPartitions = shardGlobals.numPartitions

    if (startPartition === 0 && endPartition === numPartitions - 1) {
      //nothing to mark incomplete our node covers the whole range with its consensus
      return incompleteRanges
    }

    //let incompeteAddresses = []
    if (startPartition > endPartition) {
      //consensus range like this  <CCCC---------CCC>
      //incompletePartition:            1       2

      //we may have two ranges to mark
      const incompletePartition1 = endPartition + 1 // get the start of this
      const incompletePartition2 = startPartition - 1 //get the end of this

      const partition1 = shardValues.parititionShardDataMap.get(incompletePartition1)
      const partition2 = shardValues.parititionShardDataMap.get(incompletePartition2)

      const incompleteRange = {
        low: partition1.homeRange.low.substring(0, depth),
        high: partition2.homeRange.high.substring(0, depth),
      }
      incompleteRanges.push(incompleteRange)
      return incompleteRanges
    } else if (endPartition > startPartition) {
      //consensus range like this  <-----CCCCC------> or <-----------CCCCC> or <CCCCC----------->
      //incompletePartition:            1     2           2         1                2         1
      //   not needed:                                    x                                    x

      //we may have two ranges to mark
      let incompletePartition1 = startPartition - 1 //get the end of this
      let incompletePartition2 = endPartition + 1 // get the start of this

      //<CCCCC----------->
      //      2         1
      if (startPartition === 0) {
        // = numPartitions - 1 //special case, we stil want the start
        incompletePartition1 = numPartitions - 1

        const partition1 = shardValues.parititionShardDataMap.get(incompletePartition2)
        const partition2 = shardValues.parititionShardDataMap.get(incompletePartition1)

        const incompleteRange = {
          low: partition1.homeRange.low.substring(0, depth),
          high: partition2.homeRange.high.substring(0, depth),
        }
        incompleteRanges.push(incompleteRange)
        return incompleteRanges
      }
      //<-----------CCCCC>
      // 2         1
      if (endPartition === numPartitions - 1) {
        //incompletePartition2 = 0 //special case, we stil want the start
        incompletePartition2 = 0

        const partition1 = shardValues.parititionShardDataMap.get(incompletePartition2)
        const partition2 = shardValues.parititionShardDataMap.get(incompletePartition1)

        const incompleteRange = {
          low: partition1.homeRange.low.substring(0, depth),
          high: partition2.homeRange.high.substring(0, depth),
        }
        incompleteRanges.push(incompleteRange)
        return incompleteRanges
      }

      //<-----CCCCC------>
      // 0   1     2    n-1
      const partition1 = shardValues.parititionShardDataMap.get(0)
      const partition2 = shardValues.parititionShardDataMap.get(incompletePartition1)
      const incompleteRange = {
        low: partition1.homeRange.low.substring(0, depth),
        high: partition2.homeRange.high.substring(0, depth),
      }

      const partition1b = shardValues.parititionShardDataMap.get(incompletePartition2)
      const partition2b = shardValues.parititionShardDataMap.get(numPartitions - 1)
      const incompleteRangeB = {
        low: partition1b.homeRange.low.substring(0, depth),
        high: partition2b.homeRange.high.substring(0, depth),
      }

      incompleteRanges.push(incompleteRange)
      incompleteRanges.push(incompleteRangeB)
      return incompleteRanges
    }
  }

  initStoredRadixValues(cycle: number): void {
    // //mark these here , call this where we first create the vote structure for the cycle (could be two locations)
    // nonStoredRanges: {low:string,high:string}[]
    // radixIsStored: Map<string, boolean>

    this.nonStoredRanges = this.getNonStoredRanges(cycle)
    this.radixIsStored.clear()
  }

  isRadixStored(_cycle: number, radix: string): boolean {
    if (this.radixIsStored.has(radix)) {
      return this.radixIsStored.get(radix)
    }

    let isNotStored = false
    for (const range of this.nonStoredRanges) {
      if (radix >= range.low && radix <= range.high) {
        isNotStored = true
        continue
      }
    }
    const isStored = !isNotStored
    this.radixIsStored.set(radix, isStored)
    return isStored
  }

  /**
   * diffConsenus
   * get a list where localMap does not have entries that match consensusArray.
   * Note this only works one way.  we do not find cases where localMap has an entry that consensusArray does not.
   *  //   (TODO, compute this and at least start logging it.(if in debug mode))
   * @param consensusArray the list of radix and hash values that have been voted on by the majority
   * @param localMap a map of our hashTrie nodes to compare to the consensus
   */
  diffConsenus(consensusArray: RadixAndHash[], localMap: Map<string, HashTrieNode>): { radix: string; hash: string }[] {
    if (consensusArray == null) {
      this.statemanager_fatal('diffConsenus: consensusArray == null', 'diffConsenus: consensusArray == null')
      return []
    }

    //map
    const toFix = []
    for (const value of consensusArray) {
      if (localMap == null) {
        toFix.push(value)
        continue
      }

      const valueB = localMap.get(value.radix)
      if (valueB == null) {
        //missing
        toFix.push(value)
        continue
      }
      if (valueB.hash !== value.hash) {
        //different hash
        toFix.push(value)
      }
    }
    return toFix
  }

  /**
   * findExtraChildren
   * a debug method to figure out if we have keys not covered by other nodes.
   * @param consensusArray
   * @param localLayerMap
   * @returns
   */
  findExtraBadKeys(
    consensusArray: RadixAndHashWithNodeId[],
    localLayerMap: Map<string, HashTrieNode>
  ): RadixAndHashWithNodeId[] {
    const extraBadRadixes: RadixAndHashWithNodeId[] = []
    if (consensusArray == null) {
      this.statemanager_fatal('findExtraBadKeys: consensusArray == null', 'findExtraBadKeys: consensusArray == null')
      return []
    }
    const parentKeys: Set<{ parentKey: string; nodeId: string }> = new Set()
    const goodKeys: Set<string> = new Set()
    //build sets of parents and good keys
    for (const value of consensusArray) {
      const parentKey = value.radix.slice(0, value.radix.length - 1)
      parentKeys.add({ parentKey, nodeId: value.nodeId })
      goodKeys.add(value.radix)
    }

    //iterate all possible children of the parent keys and detect if we have extra keys that are not in the good list
    for (const item of parentKeys) {
      for (let i = 0; i < 16; i++) {
        const childKey = item.parentKey + i.toString(16)
        const weHaveKey = localLayerMap.has(childKey)
        if (weHaveKey) {
          const theyHaveKey = goodKeys.has(childKey)
          if (theyHaveKey === false) {
            extraBadRadixes.push({
              radix: localLayerMap.get(childKey).radix,
              hash: localLayerMap.get(childKey).hash,
              nodeId: item.nodeId,
            })
          }
        }
      }
    }
    let uniqueExtraBadRadixes = []
    for (const item of extraBadRadixes) {
      if (uniqueExtraBadRadixes.find((x) => x.radix === item.radix) == null) {
        uniqueExtraBadRadixes.push(item)
      }
    }

    return uniqueExtraBadRadixes
  }

  /**
   * computeCoverage
   *
   * Take a look at the winning votes and build of lists of which nodes we can ask for information
   * this happens once per cycle then getNodeForQuery() can be used to cleanly figure out what node to ask for a query given
   * a certain radix value.
   *
   * @param cycle
   */
  computeCoverage(cycle: number): void {
    const hashTrieSyncConsensus = this.hashTrieSyncConsensusByCycle.get(cycle)

    const coverageMap: Map<string, HashTrieRadixCoverage> = new Map() //map of sync radix to n

    hashTrieSyncConsensus.coverageMap = coverageMap

    //let nodeUsage = new Map()
    for (const radixHash of hashTrieSyncConsensus.radixHashVotes.keys()) {
      const coverage = coverageMap.get(radixHash)
      if (coverage == null) {
        const votes = hashTrieSyncConsensus.radixHashVotes.get(radixHash)
        const bestVote = votes.allVotes.get(votes.bestHash)
        const potentialNodes = [...bestVote.voters]
        //shuffle array of potential helpers
        utils.shuffleArray(potentialNodes) //leaving non random to catch issues in testing.
        const node = potentialNodes[0]
        coverageMap.set(radixHash, { firstChoice: node, fullList: potentialNodes, refuted: new Set() })
        //let count = nodeUsage.get(node.id)
      }
    }

    //todo a pass to use as few nodes as possible

    //todo this new list can be acced with fn and give bakup nods/
    //  have fallback optoins
  }

  //error handling.. what if we cand find a node or run out?
  /**
   * getNodeForQuery
   * Figure out what node we can ask for a query related to the given radix.
   * this will node that has given us a winning vote for the given radix
   * @param radix
   * @param cycle
   * @param nextNode pass true to start asking the next node in the list for data.
   */
  getNodeForQuery(radix: string, cycle: number, nextNode = false): Shardus.Node | null {
    const hashTrieSyncConsensus = this.hashTrieSyncConsensusByCycle.get(cycle)
    const parentRadix = radix.substring(0, this.treeSyncDepth)

    const coverageEntry = hashTrieSyncConsensus.coverageMap.get(parentRadix)

    if (coverageEntry == null || coverageEntry.firstChoice == null) {
      const numActiveNodes = this.stateManager.currentCycleShardData.nodes.length
      this.statemanager_fatal(
        `getNodeForQuery null ${coverageEntry == null} ${
          coverageEntry?.firstChoice == null
        } numActiveNodes:${numActiveNodes}`,
        `getNodeForQuery null ${coverageEntry == null} ${coverageEntry?.firstChoice == null}`
      )
      return null
    }

    if (nextNode === true) {
      coverageEntry.refuted.add(coverageEntry.firstChoice.id)
      for (let i = 0; i < coverageEntry.fullList.length; i++) {
        const node = coverageEntry.fullList[i] // eslint-disable-line security/detect-object-injection
        if (node == null || coverageEntry.refuted.has(node.id)) {
          continue
        }
        coverageEntry.firstChoice = node
        return coverageEntry.firstChoice
      }
    } else {
      return coverageEntry.firstChoice
    }
    return null
  }

  /**
   * getChildrenOf
   * ask nodes for the child node information of the given list of radix values
   * TODO convert to allSettled?, but support a timeout?
   * @param radixHashEntries
   * @param cycle
   */
  async getChildrenOf(radixHashEntries: RadixAndHash[], cycle: number): Promise<RadixAndHashWithNodeId[]> {
    let results: RadixAndHashWithNodeId[] = []
    const requestMap: Map<Shardus.Node, HashTrieReq> = new Map()
    for (const radixHash of radixHashEntries) {
      const node = this.getNodeForQuery(radixHash.radix, cycle)
      if (node == null) {
        this.statemanager_fatal('getChildrenOf node null', 'getChildrenOf node null')
        continue
      }
      let existingRequest = requestMap.get(node)
      if (existingRequest == null) {
        existingRequest = { radixList: [] }
        requestMap.set(node, existingRequest)
      }
      existingRequest.radixList.push(radixHash.radix)
    }
    // for(let [key, value] of requestMap){
    //   try{
    //     result = await this.p2p.ask(key, 'get_trie_hashes', value)
    //     if(result != null && result.results != null){
    //       results = results.concat(result.results)
    //     } //else retry?
    //   } catch (error) {
    //     this.statemanager_fatal('getChildrenOf failed', `getChildrenOf failed: ` + errorToStringFull(error))
    //   }
    // }

    const promises = []
    for (const [node, value] of requestMap) {
      try {
        let promise
        // if (
        //   this.stateManager.config.p2p.useBinarySerializedEndpoints &&
        //   this.stateManager.config.p2p.getTrieHashesBinary
        // ) {
        promise = this.p2p.askBinary<GetTrieHashesRequest, GetTrieHashesResponse>(
          node,
          InternalRouteEnum.binary_get_trie_hashes,
          value,
          serializeGetTrieHashesReq,
          deserializeGetTrieHashesResp,
          {}
        )
        // } else {
        //   promise = this.p2p.ask(node, 'get_trie_hashes', value)
        // }
        promises.push(promise)
      } catch (error) {
        /* prettier-ignore */ this.statemanager_fatal('getChildrenOf failed', `getChildrenOf ASK-1 failed: node: ${node.id} error: ${errorToStringFull(error)}`)
      }
    }

    try {
      //TODO should we convert to Promise.allSettled?
      const trieHashesResponses: GetTrieHashesResponse[] = await Promise.all(promises)
      for (const response of trieHashesResponses) {
        if (response != null && response.nodeHashes != null) {
          let data: RadixAndHashWithNodeId[] = response.nodeHashes.map((nodeHash) => {
            let item: RadixAndHash = {
              radix: nodeHash.radix,
              hash: nodeHash.hash,
            }
            return {
              radix: item.radix,
              hash: item.hash,
              nodeId: response.nodeId,
            }
          })
          results = results.concat(data)
        } else {
        }
      }
    } catch (error) {
      /* prettier-ignore */ this.statemanager_fatal('getChildrenOf failed', `getChildrenOf ASK-2 failed: ` + errorToStringFull(error))
    }

    if (results.length > 0) {
      nestedCountersInstance.countEvent(`accountPatcher`, `got nodeHashes`, results.length)
    } else {
      nestedCountersInstance.countEvent(`accountPatcher`, `failed to get nodeHashes c:${cycle}`, 1)
    }

    return results
  }

  /**
   * getChildAccountHashes
   * requests account hashes from one or more nodes.
   * TODO convert to allSettled?, but support a timeout?
   * @param radixHashEntries
   * @param cycle
   */
  async getChildAccountHashes(
    radixHashEntries: RadixAndHash[],
    cycle: number
  ): Promise<{ radixAndChildHashes: RadixAndChildHashesWithNodeId[]; getAccountHashStats: AccountHashStats }> {
    let nodeChildHashes: RadixAndChildHashesWithNodeId[] = []
    const requestMap: Map<Shardus.Node, HashTrieReq> = new Map()
    let actualRadixRequests = 0

    const patcherMaxLeafHashesPerRequest = this.config.stateManager.patcherMaxLeafHashesPerRequest
    for (const radixHash of radixHashEntries) {
      const node = this.getNodeForQuery(radixHash.radix, cycle)
      if (node == null) {
        this.statemanager_fatal('getChildAccountHashes node null', 'getChildAccountHashes node null ')
        continue
      }
      let existingRequest = requestMap.get(node)
      if (existingRequest == null) {
        existingRequest = { radixList: [] }
        requestMap.set(node, existingRequest)
      }

      if (existingRequest.radixList.length > patcherMaxLeafHashesPerRequest) {
        //dont request more than patcherMaxLeafHashesPerRequest  nodes to investigate
        continue
      } else {
        actualRadixRequests++
      }

      existingRequest.radixList.push(radixHash.radix)
    }
    // for(let [key, value] of requestMap){
    //   try{
    //     result = await this.p2p.ask(key, 'get_trie_accountHashes', value)
    //     if(result != null && result.nodeChildHashes != null){
    //       nodeChildHashes = nodeChildHashes.concat(result.nodeChildHashes)
    //       // for(let childHashes of result.nodeChildHashes){
    //       //   allHashes = allHashes.concat(childHashes.childAccounts)
    //       // }
    //     } //else retry?
    //   } catch (error) {
    //     this.statemanager_fatal('getChildAccountHashes failed', `getChildAccountHashes failed: ` + errorToStringFull(error))

    //   }
    // }

    const promises = []
    for (const [key, value] of requestMap) {
      try {
        let promise
        // if (
        //   this.stateManager.config.p2p.useBinarySerializedEndpoints &&
        //   this.stateManager.config.p2p.getTrieAccountHashesBinary
        // ) {
        promise = this.p2p.askBinary<GetTrieAccountHashesReq, GetTrieAccountHashesResp>(
          key,
          InternalRouteEnum.binary_get_trie_account_hashes,
          value,
          serializeGetTrieAccountHashesReq,
          deserializeGetTrieAccountHashesResp,
          {}
        )
        // } else {
        // promise = this.p2p.ask(key, 'get_trie_accountHashes', value)
        // }
        promises.push(promise)
      } catch (error) {
        this.statemanager_fatal(
          'getChildAccountHashes failed',
          `getChildAccountHashes failed: ` + errorToStringFull(error)
        )
      }
    }

    const getAccountHashStats: AccountHashStats = {
      matched: 0,
      visisted: 0,
      empty: 0,
      nullResults: 0,
      numRequests: requestMap.size,
      responses: 0,
      exceptions: 0,
      radixToReq: radixHashEntries.length,
      actualRadixRequests,
    }

    //let result = {nodeChildHashes:[], stats:{ matched:0, visisted:0, empty:0}} as HashTrieAccountsResp

    try {
      //TODO should we convert to Promise.allSettled?
      const results = await Promise.all(promises)
      for (const result of results) {
        if (result != null && result.nodeChildHashes != null) {
          nodeChildHashes = nodeChildHashes.concat(result.nodeChildHashes)
          // for(let childHashes of result.nodeChildHashes){
          //   allHashes = allHashes.concat(childHashes.childAccounts)
          // }
          utils.sumObject(getAccountHashStats, result.stats)
          getAccountHashStats.responses++
        } else {
          getAccountHashStats.nullResults++
        }
      }
    } catch (error) {
      this.statemanager_fatal(
        'getChildAccountHashes failed',
        `getChildAccountHashes failed: ` + errorToStringFull(error)
      )
      getAccountHashStats.exceptions++
    }

    if (nodeChildHashes.length > 0) {
      nestedCountersInstance.countEvent(`accountPatcher`, `got nodeChildHashes`, nodeChildHashes.length)
    }

    if (logFlags.debug) {
      this.mainLogger.debug(`getChildAccountHashes ${utils.stringifyReduce(getAccountHashStats)}`)
    }

    return { radixAndChildHashes: nodeChildHashes, getAccountHashStats: getAccountHashStats }
  }

  /**
   * isInSync
   *
   * looks at sync level hashes to figure out if any are out of matching.
   * there are cases where this is false but we dig into accounts an realize we do not
   * or can't yet repair something.
   *
   * @param cycle
   */
  isInSync(cycle: number): IsInsyncResult {
    const hashTrieSyncConsensus = this.hashTrieSyncConsensusByCycle.get(cycle)
    let isInsyncResult: IsInsyncResult = {
      radixes: [],
      insync: true,
      stats: {
        good: 0,
        bad: 0,
        total: 0,
      },
    }

    if (hashTrieSyncConsensus == null) {
      return isInsyncResult
    }

    // let nonStoredRanges = this.getNonStoredRanges(cycle)
    // let hasNonStorageRange = false
    // let oosRadix = []
    // get our list of covered radix values for cycle X!!!
    // let inSync = true

    const minVotes = this.calculateMinVotes()

    for (const radix of hashTrieSyncConsensus.radixHashVotes.keys()) {
      // check the length of the radix
      if (radix.length !== this.treeSyncDepth) {
        if (logFlags.error) this.mainLogger.error(`syncTrieHashesBinaryHandler: radix length mismatch: ${radix}`)
        nestedCountersInstance.countEvent('accountPatcher', `isInsync-radix-length-mismatch`)
        continue
      }
      const votesMap = hashTrieSyncConsensus.radixHashVotes.get(radix)
      const ourTrieNode = this.shardTrie.layerMaps[this.treeSyncDepth].get(radix)
      if (logFlags.debug)
        this.mainLogger.debug(`Checking isInSync ${radix}, cycle: ${cycle}, ${Utils.safeStringify(votesMap)}`)

      const nonConsensusRanges = this.getNonConsensusRanges(cycle)
      const nonStorageRanges = this.getNonStoredRanges(cycle)
      let hasNonConsensusRange = false
      let hasNonStorageRange = false
      let lastCycleNonConsensus = false

      for (const range of this.lastCycleNonConsensusRanges) {
        if (radix >= range.low && radix <= range.high) {
          lastCycleNonConsensus = true
        }
      }

      for (const range of nonConsensusRanges) {
        if (radix >= range.low && radix <= range.high) {
          hasNonConsensusRange = true
          nestedCountersInstance.countEvent(`accountPatcher`, `isInsync hasNonConsensusRange`, 1)
        }
      }
      for (const range of nonStorageRanges) {
        if (radix >= range.low && radix <= range.high) {
          hasNonStorageRange = true
          nestedCountersInstance.countEvent(`accountPatcher`, `isInsync hasNonStorageRange`, 1)
        }
      }
      let inConsensusRange = !hasNonConsensusRange
      let inStorageRange = !hasNonStorageRange
      let inEdgeRange = inStorageRange && !inConsensusRange

      if (hasNonConsensusRange && hasNonStorageRange) continue

      //if we dont have the node we may have missed an account completely!
      if (ourTrieNode == null) {
        /* prettier-ignore */ nestedCountersInstance.countRareEvent(`accountPatcher`, `isInSync ${radix} our trieNode === null`, 1)
        if (logFlags.debug) this.mainLogger.debug(`isInSync ${radix} our trieNode === null, cycle: ${cycle}`)
        isInsyncResult.radixes.push({
          radix,
          insync: false,
          inConsensusRange,
          inEdgeRange,
          recentRuntimeSync: false,
          recentRuntimeSyncCycle: -1,
        })
        isInsyncResult.insync = false
        isInsyncResult.stats.bad++
        isInsyncResult.stats.total++
        continue
      }

      if (votesMap.bestVotes < minVotes) {
        //temporary rare event so we can consider this.
        /* prettier-ignore */ nestedCountersInstance.countRareEvent(`accountPatcher`, `isInSync ${radix} votesMap.bestVotes < minVotes bestVotes: ${votesMap.bestVotes} < ${minVotes} uniqueVotes: ${votesMap.allVotes.size}`, 1)
        /* prettier-ignore */ nestedCountersInstance.countEvent(`accountPatcher`, `isInSync ${radix} votesMap.bestVotes < minVotes bestVotes: ${votesMap.bestVotes} < ${minVotes} uniqueVotes: ${votesMap.allVotes.size}`, 1)
      }

      //TODO should not have to re compute this here!!
      ourTrieNode.hash = this.crypto.hash(ourTrieNode.childHashes)

      if (ourTrieNode.hash != votesMap.bestHash) {
        //inSync = false
        //oosRadix.push()
        if (logFlags.debug) {
          //overkill, need it for now
          const kvp = []
          for (const [key, value] of votesMap.allVotes.entries()) {
            kvp.push({
              id: key,
              count: value.count,
              nodeIDs: [...value.voters].map((node) => utils.makeShortHash(node.id) + ':' + node.externalPort),
            })
          }
          const simpleMap = {
            bestHash: votesMap.bestHash,
            bestVotes: votesMap.bestVotes,
            allVotes: kvp,
          }
          /* prettier-ignore */ nestedCountersInstance.countEvent(`accountPatcher`, `isInSync ${radix} ${utils.makeShortHash(votesMap.bestHash)} ourTrieNode.hash:${utils.makeShortHash(ourTrieNode.hash)} uniqueVotes: ${votesMap.allVotes.size}`, 1)
          this.statemanager_fatal(
            'isInSync',
            `isInSync fail ${cycle}: ${radix}  uniqueVotes: ${votesMap.allVotes.size} ${utils.stringifyReduce(
              simpleMap
            )}`
          )
        }
        isInsyncResult.insync = false
        isInsyncResult.radixes.push({
          radix,
          insync: false,
          inConsensusRange,
          inEdgeRange,
          recentRuntimeSync: false,
          recentRuntimeSyncCycle: -1,
        })
        isInsyncResult.stats.bad++
        isInsyncResult.stats.total++
      } else if (ourTrieNode.hash === votesMap.bestHash) {
        isInsyncResult.radixes.push({
          radix,
          insync: true,
          inConsensusRange,
          inEdgeRange,
          recentRuntimeSync: false,
          recentRuntimeSyncCycle: -1,
        })
        isInsyncResult.stats.good++
        isInsyncResult.stats.total++
      }
    }
    // sort the isInsyncResult.radixes by radix
    isInsyncResult.radixes.sort((a, b) => {
      return a.radix.localeCompare(b.radix)
    })
    //todo what about situation where we do not have enough votes??
    //todo?? more utility / get list of oos radix

    // set recentRuntimeSync to true in the radices that have had recent coverage changes
    for (const coverageChange of this.stateManager.coverageChangesCopy) {
      const startRadix = coverageChange.start.toString().substring(0, this.treeSyncDepth)
      const endRadix = coverageChange.end.toString().substring(0, this.treeSyncDepth)

      // for non-wrapped ranges
      if (startRadix <= endRadix) {
        for (let i = 0; i <= isInsyncResult.radixes.length; i++) {
          const radixEntry = isInsyncResult.radixes[i]
          if (radixEntry.radix >= startRadix && radixEntry.radix <= endRadix) {
            radixEntry.recentRuntimeSync = true
            radixEntry.recentRuntimeSyncCycle = cycle
          }
        }
        // for wrapped ranges because we start at the end and wrap around to the beginning of 32 byte address space
      } else {
        for (let i = 0; i <= isInsyncResult.radixes.length; i++) {
          const radixEntry = isInsyncResult.radixes[i]
          if (radixEntry.radix >= startRadix || radixEntry.radix <= endRadix) {
            radixEntry.recentRuntimeSync = true
            radixEntry.recentRuntimeSyncCycle = cycle
          }
        }
      }
    }

    return isInsyncResult // {inSync, }
  }

  extractLeafNodes(rootNode: HashTrieNode): HashTrieNode[] {
    const leafNodes: HashTrieNode[] = []

    function traverse(node: HashTrieNode) {
      if (node == null) {
        return
      }
      if (node.children && node.children.length === 0) {
        leafNodes.push(node)
        return
      }

      if (node.children && node.children.length > 0) {
        for (const childNode of node.children) {
          if (childNode) {
            traverse(childNode)
          }
        }
      }
    }
    traverse(rootNode)
    return leafNodes
  }
  //big todo .. be able to test changes on a temp tree and validate the hashed before we commit updates
  //also need to actually update the full account data and not just our tree!!

  /**
   * updateAccountHash
   * This is the main function called externally to tell the hash trie what the hash value is for a given accountID
   *
   * @param accountID
   * @param hash
   *
   */
  updateAccountHash(accountID: string, hash: string): void {
    //todo do we need to look at cycle or timestamp and have a future vs. next queue?
    if (this.debug_ignoreUpdates) {
      this.statemanager_fatal(`patcher ignored: tx`, `patcher ignored: ${accountID} hash:${hash}`)
      return
    }

    const accountData = { accountID, hash }
    this.accountUpdateQueue.push(accountData)
  }

  removeAccountHash(accountID: string): void {
    this.accountRemovalQueue.push(accountID)
  }  

  /**
   * broadcastSyncHashes
   * after each tree computation we figure out what radix + hash values we can send out
   * these will be nodes at the treeSyncDepth (which is higher up than our leafs, and is efficient, but also adjusts to support sharding)
   * there are important conditions about when we can send a value for a given radix and who we can send it to.
   *
   * @param cycle
   */
  async broadcastSyncHashes(cycle: number): Promise<void> {
    const syncLayer = this.shardTrie.layerMaps[this.treeSyncDepth]

    const shardGlobals = this.stateManager.currentCycleShardData.shardGlobals

    const messageToNodeMap: Map<string, { node: Shardus.Node; message: HashTrieSyncTell }> = new Map()

    const radixUsed: Map<string, Set<string>> = new Map()

    const nonConsensusRanges = this.getNonConsensusRanges(cycle)
    const nonStoredRanges = this.getNonStoredRanges(cycle)
    const syncTrackerRanges = this.getSyncTrackerRanges()
    let hasNonConsensusRange = false
    let lastCycleNonConsensus = false
    let hasNonStorageRange = false
    let inSyncTrackerRange = false

    const debugSyncSkipSet = new Set<string>()
    const debugRadixSet = new Set<string>()

    const stats = {
      broadcastSkip: 0,
    }
    for (const treeNode of syncLayer.values()) {
      hasNonConsensusRange = false
      lastCycleNonConsensus = false
      hasNonStorageRange = false
      inSyncTrackerRange = false

      //There are several conditions below when we do not qualify to send out a hash for a given radix.
      //In general we send hashes for nodes that are fully covered in our consensus range.
      //Due to network shifting if we were consenus last cycle but still fully stored range we can send a hash.
      //Syncing operation will prevent us from sending a hash (because in theory we dont have complete account data)

      for (const range of this.lastCycleNonConsensusRanges) {
        if (treeNode.radix >= range.low && treeNode.radix <= range.high) {
          lastCycleNonConsensus = true
        }
      }
      for (const range of nonStoredRanges) {
        if (treeNode.radix >= range.low && treeNode.radix <= range.high) {
          hasNonStorageRange = true
        }
      }
      for (const range of nonConsensusRanges) {
        if (treeNode.radix >= range.low && treeNode.radix <= range.high) {
          hasNonConsensusRange = true
        }
      }

      //do we need to adjust what cycle we are looking at for syncing?
      for (const range of syncTrackerRanges) {
        if (treeNode.radix >= range.low && treeNode.radix <= range.high) {
          inSyncTrackerRange = true
        }
      }
      if (inSyncTrackerRange) {
        stats.broadcastSkip++
        if (logFlags.verbose && logFlags.playback) {
          debugSyncSkipSet.add(treeNode.radix)
        }
        continue
      }

      if (hasNonConsensusRange) {
        if (lastCycleNonConsensus === false && hasNonStorageRange === false) {
          // lastCycleConsensus && hasStorageRange
          //we can share this data, may be a pain for nodes to verify..
          //todo include last cycle syncing..
          nestedCountersInstance.countEvent(
            `accountPatcher`,
            `broadcast nonConsensus because lastCycleNonConsensus === false`,
            1
          )
        } else {
          //we cant send this data
          nestedCountersInstance.countEvent('accountPatcher', 'broadcast skip nonConsensus', 1)
          continue
        }
      }

      debugRadixSet.add(`${treeNode.radix}:${utils.stringifyReduce(treeNode.hash)}`)

      //figure out who to send a hash to
      //build up a map of messages
      const partitionRange = ShardFunctions.getPartitionRangeFromRadix(shardGlobals, treeNode.radix)
      for (let i = partitionRange.low; i <= partitionRange.high; i++) {
        const shardInfo = this.stateManager.currentCycleShardData.parititionShardDataMap.get(i)

        let sendToMap = shardInfo.coveredBy
        if (this.sendHashesToEdgeNodes) {
          sendToMap = shardInfo.storedBy
        }

        for (const value of Object.values(sendToMap)) {
          let messagePair = messageToNodeMap.get(value.id)
          if (messagePair == null) {
            messagePair = { node: value, message: { cycle, nodeHashes: [] } }
            messageToNodeMap.set(value.id, messagePair)
          }
          // todo done send duplicate node hashes to the same node?

          let radixSeenSet = radixUsed.get(value.id)
          if (radixSeenSet == null) {
            radixSeenSet = new Set()
            radixUsed.set(value.id, radixSeenSet)
          }
          if (radixSeenSet.has(treeNode.radix) === false) {
            //extra safety step! todo remove for perf.
            treeNode.hash = this.hashObj(treeNode.childHashes)
            messagePair.message.nodeHashes.push({ radix: treeNode.radix, hash: treeNode.hash })
            radixSeenSet.add(treeNode.radix)
          }
        }
      }
    }

    if (stats.broadcastSkip > 0) {
      nestedCountersInstance.countEvent(`accountPatcher`, `broadcast skip syncing`, stats.broadcastSkip)
      /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('accountPatcher', ``, `broadcast skip syncing c:${cycle} set: ${utils.stringifyReduce(debugSyncSkipSet)}`)
    }

    //radixUsed
    /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('accountPatcher', ``, `broadcast radixUsed syncing c:${cycle} set: ${[utils.stringifyReduce([...debugRadixSet.keys()])]}`)

    //send the messages we have built up.  (parallel waiting with promise.all)
    const promises = []
    // if (
    //   this.stateManager.config.p2p.useBinarySerializedEndpoints &&
    //   this.stateManager.config.p2p.syncTrieHashesBinary
    // ) {
    for (const messageEntry of messageToNodeMap.values()) {
      const syncTrieHashesRequest: SyncTrieHashesRequest = {
        cycle,
        nodeHashes: messageEntry.message.nodeHashes,
      }
      const promise = this.p2p.tellBinary<SyncTrieHashesRequest>(
        [messageEntry.node],
        InternalRouteEnum.binary_sync_trie_hashes,
        syncTrieHashesRequest,
        serializeSyncTrieHashesReq,
        {}
      )
      promises.push(promise)
    }
    // } else {
    // for (const messageEntry of messageToNodeMap.values()) {
    //   const promise = this.p2p.tell([messageEntry.node], 'sync_trie_hashes', messageEntry.message)
    //   promises.push(promise)
    // }
    // }
    await Promise.all(promises)
  }
  
  async requestOtherNodesToRepair(accountsToFix: AccountIdAndHashToRepair[]): Promise<void> {
    try {
      const accountIdsToFix = accountsToFix.map((x) => x.accountID)
      const accountDataList = await this.app.getAccountDataByList(accountIdsToFix)
      const accountDataMap = new Map<string, Shardus.WrappedData>()
      const repairInstructionMap = new Map<string, AccountRepairInstruction[]>()
      for (const accountData of accountDataList) {
        accountDataMap.set(accountData.accountId, accountData)
      }
      for (const accountToFix of accountsToFix) {
        let accountData = accountDataMap.get(accountToFix.accountID)
        if (accountData == null) {
          this.mainLogger.debug(`requestOtherNodesToRepair: accountData is null`)
          nestedCountersInstance.countEvent(`accountPatcher`, `requestOtherNodesToRepair accountData == null`, 1)
          continue
        }
        if (accountData.stateId !== accountToFix.hash) {
          this.mainLogger.debug(`requestOtherNodesToRepair: accountData.stateId !== accountToFix.hash`)
          nestedCountersInstance.countEvent(
            `accountPatcher`,
            `requestOtherNodesToRepair accountData.stateId !== accountToFix.hash`,
            1
          )
          continue
        }
        const archivedQueueEntry = this.stateManager.transactionQueue.getArchivedQueueEntryByAccountIdAndHash(
          accountToFix.accountID,
          accountToFix.hash,
          'requestOtherNodesToRepair'
        )
        if (archivedQueueEntry == null) {
          this.mainLogger.debug(`requestOtherNodesToRepair: archivedQueueEntry is null`)
          nestedCountersInstance.countEvent(`accountPatcher`, `requestOtherNodesToRepair archivedQueueEntry == null`, 1)
          continue
        }
        const repairInstruction: AccountRepairInstruction = {
          accountID: accountData.accountId,
          hash: accountData.stateId,
          txId: archivedQueueEntry.acceptedTx.txId,
          accountData,
          targetNodeId: accountToFix.targetNodeId,
          signedReceipt: archivedQueueEntry.signedReceipt,
        }
        if (repairInstructionMap.has(repairInstruction.targetNodeId)) {
          repairInstructionMap.get(repairInstruction.targetNodeId).push(repairInstruction)
        } else {
          repairInstructionMap.set(repairInstruction.targetNodeId, [repairInstruction])
        }
      }
      if (repairInstructionMap.size > 0) {
        for (const [nodeId, repairInstructions] of repairInstructionMap) {
          const node = NodeList.nodes.get(nodeId)
          if (node == null) {
            nestedCountersInstance.countEvent(`accountPatcher`, `requestOtherNodesToRepair node == null`, 1)
            this.mainLogger.debug(`requestOtherNodesToRepair: node == null`)
          }
          const message = {
            repairInstructions,
          }
          nestedCountersInstance.countEvent('accountPatcher', 'sending repairInstruction for missing account')
          // if(this.stateManager.config.p2p.useBinarySerializedEndpoints &&
          //   this.stateManager.config.p2p.repairMissingAccountsBinary
          // ) {
          await this.p2p.tellBinary<RepairOOSAccountsReq>(
            [node],
            InternalRouteEnum.binary_repair_oos_accounts,
            message,
            serializeRepairOOSAccountsReq,
            {}
          )
          // } else {
          //   this.p2p.tell([node], 'repair_oos_accounts', message)
          // }
        }
      }
    } catch (e) {
      nestedCountersInstance.countEvent(`accountPatcher`, `requestOtherNodesToRepair error: ${e.message}`, 1)
      this.statemanager_fatal(`requestOtherNodesToRepair`, `error: ${e}`)
    }
  }

  /**
   * testAndPatchAccounts
   * does a quick check to see if we are isInSync() with the sync level votes we have been given.
   * if we are out of sync it uses findBadAccounts to recursively find what accounts need repair.
   * we then query nodes for the account data we need to do a repair with
   * finally we check the repair data and use it to repair out accounts.
   *
   * @param cycle
   */
  async testAndPatchAccounts(cycle: number): Promise<void> {
    // let updateStats = this.upateShardTrie(cycle)
    // nestedCountersInstance.countEvent(`accountPatcher`, `totalAccountsHashed`, updateStats.totalAccountsHashed)

    const lastFail = this.failedLastTrieSync
    const lastInsyncResult = this.lastInSyncResult

    this.failedLastTrieSync = false

    const trieRepairDump = {
      cycle,
      stats: null,
      z_accountSummary: null,
    }

    if (logFlags.debug) {
      const hashTrieSyncConsensus = this.hashTrieSyncConsensusByCycle.get(cycle)
      const debug = []
      if (hashTrieSyncConsensus && hashTrieSyncConsensus.radixHashVotes) {
        for (const [key, value] of hashTrieSyncConsensus.radixHashVotes) {
          debug.push({ radix: key, hash: value.bestHash, votes: value.bestVotes })
        }
      }
      debug.sort(this.sortByRadix)
      this.statemanager_fatal('debug shardTrie', `temp shardTrie votes c:${cycle}: ${utils.stringifyReduce(debug)}`)
    }

    let isInsyncResult = this.isInSync(cycle)
    this.lastInSyncResult = isInsyncResult
    if (logFlags.debug)
      this.mainLogger.debug(`isInSync: cycle: ${cycle}, isInsyncResult: ${Utils.safeStringify(isInsyncResult)}`)
    if (isInsyncResult == null || isInsyncResult.insync === false) {
      let failHistoryObject: { repaired: number; s: number; e: number; cycles: number }
      if (lastFail === false) {
        this.failStartCycle = cycle
        this.failEndCycle = -1
        this.failRepairsCounter = 0
        failHistoryObject = {
          s: this.failStartCycle,
          e: this.failEndCycle,
          cycles: 1,
          repaired: this.failRepairsCounter,
        }
        this.syncFailHistory.push(failHistoryObject)
      } else {
        failHistoryObject = this.syncFailHistory[this.syncFailHistory.length - 1]
      }

      const results = await this.findBadAccounts(cycle)
      /* prettier-ignore */ nestedCountersInstance.countEvent(`accountPatcher`, `badAccounts c:${cycle} `, results.badAccounts.length)
      /* prettier-ignore */ nestedCountersInstance.countEvent(`accountPatcher`, `accountHashesChecked c:${cycle}`, results.accountHashesChecked)

      if (logFlags.debug) {
        this.mainLogger.debug(
          `badAccounts cycle: ${cycle}, ourBadAccounts: ${
            results.badAccounts.length
          }, ourBadAccounts: ${Utils.safeStringify(results.badAccounts)}`
        )
      }
      if (results.accountsTheyNeedToRepair.length > 0 || results.extraBadAccounts.length > 0) {
        let accountsTheyNeedToRepair = [...results.accountsTheyNeedToRepair]
        if (results.extraBadAccounts.length > 0) {
          accountsTheyNeedToRepair = accountsTheyNeedToRepair.concat(results.extraBadAccounts)
        }
        this.mainLogger.debug(
          `badAccounts cycle: ${cycle}, accountsTheyNeedToRepair: ${
            accountsTheyNeedToRepair.length
          }, accountsTheyNeedToRepair: ${Utils.safeStringify(accountsTheyNeedToRepair)}`
        )
        this.requestOtherNodesToRepair(accountsTheyNeedToRepair)
      }

      if (this.config.mode === 'debug' && this.config.debug.haltOnDataOOS) {
        this.statemanager_fatal(
          'testAndPatchAccounts',
          'Data OOS detected. We are halting the repair process on purpose'
        )
        this.failedLastTrieSync = true
        return
      }

      this.stateManager.cycleDebugNotes.badAccounts = results.badAccounts.length //per cycle debug info
      //TODO figure out if the possible repairs will fully repair a given hash for a radix.
      // This could add some security but my concern is that it could create a situation where something unexpected prevents
      // repairing some of the data.
      // const preTestResults = this.simulateRepairs(cycle, results.badAccounts)

      if (results.extraBadKeys.length > 0) {
        this.statemanager_fatal(
          'checkAndSetAccountData extra bad keys',
          `c:${cycle} extra bad keys: ${Utils.safeStringify(results.extraBadKeys)}  `
        )
      }

      //request data for the list of bad accounts then update.
      const { repairDataResponse, stateTableDataMap, getAccountStats } = await this.getAccountRepairData(
        cycle,
        results.badAccounts
      )

      if (repairDataResponse == null) {
        this.statemanager_fatal('checkAndSetAccountData repairDataResponse', `c:${cycle} repairDataResponse is null`)
      }

      //we need filter our list of possible account data to use for corrections.
      //it is possible the majority voters could send us account data that is older than what we have.
      //todo must sort out if we can go backwards...  (I had dropped some pre validation earlier, but need to rethink that)
      const wrappedDataListFiltered: Shardus.WrappedData[] = []
      const noChange = new Set()
      const updateTooOld = new Set()
      const filterStats = {
        accepted: 0,
        tooOld: 0,
        sameTS: 0,
        sameTSFix: 0,
        tsFix2: 0,
        tsFix3: 0,
      }

      let tooOldAccountsMap: Map<string, TooOldAccountRecord> = new Map()
      let wrappedDataList = repairDataResponse.wrappedDataList

      // build a list of data that is good to use in this repair operation
      // Also, there is a section where cache accountHashCacheHistory.lastSeenCycle may get repaired.
      for (let i = 0; i < wrappedDataList.length; i++) {
        let wrappedData: Shardus.WrappedData = wrappedDataList[i]
        let nodeWeAsked = repairDataResponse.nodes[i]
        if (this.stateManager.accountCache.hasAccount(wrappedData.accountId)) {
          const accountMemData: AccountHashCache = this.stateManager.accountCache.getAccountHash(wrappedData.accountId)
          // dont allow an older timestamp to overwrite a newer copy of data we have.
          // we may need to do more work to make sure this can not cause an un repairable situation
          if (wrappedData.timestamp < accountMemData.t) {
            updateTooOld.add(wrappedData.accountId)
            // nestedCountersInstance.countEvent('accountPatcher', `checkAndSetAccountData updateTooOld c:${cycle}`)
            this.statemanager_fatal(
              'checkAndSetAccountData updateTooOld',
              `checkAndSetAccountData updateTooOld ${cycle}: acc:${utils.stringifyReduce(
                wrappedData.accountId
              )} updateTS:${wrappedData.timestamp} updateHash:${utils.stringifyReduce(wrappedData.stateId)}  cacheTS:${
                accountMemData.t
              } cacheHash:${utils.stringifyReduce(accountMemData.h)}`
            )
            filterStats.tooOld++
            tooOldAccountsMap.set(wrappedData.accountId, {
              wrappedData,
              accountMemData,
              node: nodeWeAsked,
            })
            continue
          }
          //This is less likely to be hit here now that similar logic checking the hash happens upstream in findBadAccounts()
          if (wrappedData.timestamp === accountMemData.t) {
            let allowPatch = false
            // if we got here make sure to update the last seen cycle in case the cache needs to know it has current enough data
            const accountHashCacheHistory: AccountHashCacheHistory =
              this.stateManager.accountCache.getAccountHashHistoryItem(wrappedData.accountId)
            if (
              accountHashCacheHistory != null &&
              accountHashCacheHistory.lastStaleCycle >= accountHashCacheHistory.lastSeenCycle
            ) {
              // /* prettier-ignore */ nestedCountersInstance.countEvent('accountPatcher', `checkAndSetAccountData updateSameTS update lastSeenCycle c:${cycle}`)
              filterStats.sameTSFix++
              accountHashCacheHistory.lastSeenCycle = cycle
            } else if (
              accountHashCacheHistory != null &&
              accountHashCacheHistory.accountHashList.length > 0 &&
              wrappedData.stateId != accountHashCacheHistory.accountHashList[0].h
            ) {
              // not sure if this is the correct fix but testing will let us know more
              nestedCountersInstance.countRareEvent('accountPatcher', `tsFix2`)
              nestedCountersInstance.countEvent('accountPatcher', `tsFix2 c:${cycle}`)
              //not really fatal. but want to validate info
              this.statemanager_fatal(
                'accountPatcher_tsFix2',
                `tsFix2 c:${cycle} wrappedData:${utils.stringifyReduce(
                  wrappedData
                )} accountHashCacheHistory:${utils.stringifyReduce(accountHashCacheHistory)}`
              )
              filterStats.tsFix2++
              accountHashCacheHistory.lastSeenCycle = cycle
              allowPatch = true

              //this.stateManager.accountCache.updateAccountHash()

              //We need to patch the hash value to what it will be..  TODO think more if there is a better way to do this.
              accountMemData.h = wrappedData.stateId
            } else {
              //just dont even care and bump the last seen cycle up.. this might do nothing
              nestedCountersInstance.countRareEvent('accountPatcher', `tsFix3`)
              //not really fatal. but want to validate info
              this.statemanager_fatal(
                'accountPatcher_tsFix3',
                `tsFix3 c:${cycle} wrappedData:${utils.stringifyReduce(
                  wrappedData
                )} accountHashCacheHistory:${utils.stringifyReduce(accountHashCacheHistory)}`
              )
              filterStats.tsFix3++
              accountHashCacheHistory.lastSeenCycle = cycle
            }

            if (allowPatch === false) {
              noChange.add(wrappedData.accountId)
              // nestedCountersInstance.countEvent('accountPatcher', `checkAndSetAccountData updateSameTS c:${cycle}`)
              continue
            }
            filterStats.sameTS++
          }
          filterStats.accepted++
          //we can proceed with the update
          wrappedDataListFiltered.push(wrappedData)
        } else {
          filterStats.accepted++
          //this good account data to repair with
          wrappedDataListFiltered.push(wrappedData)
        }
      }

      if (tooOldAccountsMap.size > 0) {
        if (logFlags.debug)
          this.mainLogger.debug(
            `too_old_account detected: ${tooOldAccountsMap.size}, ${utils.stringifyReduce(tooOldAccountsMap)}`
          )
        nestedCountersInstance.countEvent('accountPatcher', `too_old_account detected c:${cycle}`)
        // ask the remote node to repair their data
        for (let [accountId, tooOldRecord] of tooOldAccountsMap) {
          // const archivedQueueEntry = this.stateManager.transactionQueue.getQueueEntryArchivedByTimestamp(tooOldRecord.accountMemData.t, 'too_old_account repair')
          const archivedQueueEntry = this.stateManager.transactionQueue.getArchivedQueueEntryByAccountIdAndHash(
            accountId,
            tooOldRecord.accountMemData.h,
            'too_old_account repair'
          )
          if (archivedQueueEntry == null) {
            nestedCountersInstance.countEvent(
              'accountPatcher',
              `too_old_account repair archivedQueueEntry null c:${cycle}`
            )
            continue
          }

          const accountDataList = await this.app.getAccountDataByList([accountId])
          const skippedAccounts: AccountIDAndHash[] = []

          const accountDataFinal: Shardus.WrappedData[] = []
          if (accountDataList != null) {
            for (const wrappedAccount of accountDataList) {
              if (wrappedAccount == null || wrappedAccount.stateId == null || wrappedAccount.data == null) {
                continue
              }
              const { accountId, stateId, data: recordData } = wrappedAccount
              const accountHash = this.app.calculateAccountHash(recordData)
              if (tooOldRecord.accountMemData.h !== accountHash) {
                skippedAccounts.push({ accountID: accountId, hash: stateId })
                nestedCountersInstance.countEvent(
                  `accountPatcher`,
                  `too_old_account repair account hash mismatch skipped c:${cycle}`
                )
                continue
              }
              accountDataFinal.push(wrappedAccount)
            }
          }
          if (accountDataFinal.length === 0) {
            nestedCountersInstance.countEvent(
              'accountPatcher',
              `too_old_account repair accountDataFinal empty c:${cycle}`
            )
            continue
          }
          let updatedAccountData = accountDataFinal[0]
          if (updatedAccountData == null || updatedAccountData.timestamp != tooOldRecord.accountMemData.t) {
            nestedCountersInstance.countEvent(
              'accountPatcher',
              `too_old_account repair archivedQueueEntry account data not found or timestamp mismatch c:${cycle}`
            )
            continue
          }
          const accountDataRequest: TooOldAccountUpdateRequest = {
            accountID: accountId,
            txId: archivedQueueEntry.acceptedTx.txId,
            signedReceipt: this.stateManager.getSignedReceipt(archivedQueueEntry),
            updatedAccountData: updatedAccountData,
          }
          const message: RepairOOSAccountsReq = {
            repairInstructions: [
              {
                accountID: accountId,
                hash: updatedAccountData.stateId,
                txId: archivedQueueEntry.acceptedTx.txId,
                accountData: updatedAccountData,
                targetNodeId: tooOldRecord.node.id,
                signedReceipt: this.stateManager.getSignedReceipt(archivedQueueEntry),
              },
            ],
          }
          nestedCountersInstance.countEvent('accountPatcher', 'sending too_old_account repair request')
          // if (this.stateManager.config.p2p.useBinarySerializedEndpoints &&
          //   this.stateManager.config.p2p.repairMissingAccountsBinary
          // ) {
          await this.p2p.tellBinary<RepairOOSAccountsReq>(
            [tooOldRecord.node],
            InternalRouteEnum.binary_repair_oos_accounts,
            message,
            serializeRepairOOSAccountsReq,
            {}
          )
          // } else {
          //   await this.p2p.tell([tooOldRecord.node], 'repair_oos_accounts', message)
          // }
          let shortAccountId = utils.makeShortHash(accountId)
          let shortNodeId = utils.makeShortHash(tooOldRecord.node.id)
          nestedCountersInstance.countEvent(
            'accountPatcher',
            `too_old_account repair requested. account: ${shortAccountId}, node: ${shortNodeId} c:${cycle}:`
          )
          if (logFlags.debug)
            this.mainLogger.debug(
              `too_old_account repair requested: account: ${shortAccountId}, node: ${shortNodeId}, cycle: ${cycle}`
            )
        }
      }

      const updatedAccounts: string[] = []
      //save the account data.  note this will make sure account hashes match the wrappers and return failed hashes  that dont match
      const failedHashes = await this.stateManager.checkAndSetAccountData(
        wrappedDataListFiltered,
        `testAndPatchAccounts`,
        true,
        updatedAccounts
      )

      if (failedHashes.length != 0) {
        /* prettier-ignore */ nestedCountersInstance.countEvent('accountPatcher', 'checkAndSetAccountData failed hashes', failedHashes.length)
        this.statemanager_fatal(
          'isInSync = false, failed hashes',
          `isInSync = false cycle:${cycle}:  failed hashes:${failedHashes.length}`
        )
      }
      const appliedFixes = Math.max(0, wrappedDataListFiltered.length - failedHashes.length)
      /* prettier-ignore */ nestedCountersInstance.countEvent('accountPatcher', 'writeCombinedAccountDataToBackups', Math.max(0,wrappedDataListFiltered.length - failedHashes.length))
      /* prettier-ignore */ nestedCountersInstance.countEvent('accountPatcher', `p.repair applied c:${cycle} bad:${results.badAccounts.length} received:${wrappedDataList.length} failedH: ${failedHashes.length} filtered:${utils.stringifyReduce(filterStats)} stats:${utils.stringifyReduce(results.stats)} getAccountStats: ${utils.stringifyReduce(getAccountStats)} extraBadKeys:${results.extraBadKeys.length}`, appliedFixes)

      this.stateManager.cycleDebugNotes.patchedAccounts = appliedFixes //per cycle debug info

      let logLimit = 3000000
      if (logFlags.verbose === false) {
        logLimit = 2000
      }

      const repairedAccountSummary = utils.stringifyReduceLimit(
        wrappedDataListFiltered.map((account) => {
          return { a: account.accountId, h: account.stateId }
        }),
        logLimit
      )
      this.statemanager_fatal(
        'isInSync = false',
        `bad accounts cycle:${cycle} bad:${results.badAccounts.length} received:${wrappedDataList.length} failedH: ${
          failedHashes.length
        } filtered:${utils.stringifyReduce(filterStats)} stats:${utils.stringifyReduce(
          results.stats
        )} getAccountStats: ${utils.stringifyReduce(getAccountStats)} details: ${utils.stringifyReduceLimit(
          results.badAccounts,
          logLimit
        )}`
      )
      this.statemanager_fatal(
        'isInSync = false',
        `isInSync = false ${cycle}: fixed:${appliedFixes}  repaired: ${repairedAccountSummary}`
      )

      trieRepairDump.stats = {
        badAcc: results.badAccounts.length,
        received: wrappedDataList.length,
        filterStats,
        getAccountStats,
        findBadAccountStats: results.stats,
      }

      trieRepairDump.z_accountSummary = repairedAccountSummary
      //This extracts accounts that have failed hashes but I forgot writeCombinedAccountDataToBackups does that already
      //let failedHashesSet = new Set(failedHashes)
      // let wrappedDataUpdated = []
      // for(let wrappedData of wrappedDataListFiltered){
      //   if(failedHashesSet.has(wrappedData.accountId )){
      //     continue
      //   }
      //   wrappedDataUpdated.push(wrappedData)
      // }

      const combinedAccountStateData: Shardus.StateTableObject[] = []
      const updatedSet = new Set()
      for (const updated of updatedAccounts) {
        updatedSet.add(updated)
      }
      for (const wrappedData of wrappedDataListFiltered) {
        if (updatedSet.has(wrappedData.accountId)) {
          const stateTableData = stateTableDataMap.get(wrappedData.stateId)
          if (stateTableData != null) {
            combinedAccountStateData.push(stateTableData)
          }
        }
      }
      if (combinedAccountStateData.length > 0) {
        await this.stateManager.storage.addAccountStates(combinedAccountStateData)
        /* prettier-ignore */ nestedCountersInstance.countEvent('accountPatcher', `p.repair stateTable c:${cycle} acc:#${updatedAccounts.length} st#:${combinedAccountStateData.length} missed#${combinedAccountStateData.length-updatedAccounts.length}`, combinedAccountStateData.length)
      }

      if (wrappedDataListFiltered.length > 0) {
        await this.stateManager.writeCombinedAccountDataToBackups(wrappedDataListFiltered, failedHashes)
      }

      //apply repair account data and update shard trie

      // get list of accounts that were fixed. (should happen for free by account cache system)
      // for(let wrappedData of wrappedDataList){
      //   if(failedHashesSet.has(wrappedData.accountId) === false){

      //     //need good way to update trie..  just insert and let it happen next round!
      //     this.updateAccountHash(wrappedData.accountId, wrappedData.stateId)
      //   }
      // }
      //check again if we are in sync

      this.lastRepairInfo = trieRepairDump

      //update the repair count
      failHistoryObject.repaired += appliedFixes

      //This is something that can be checked with debug endpoints get-tree-last-insync-all / get-tree-last-insync
      this.failedLastTrieSync = true
    } else {
      nestedCountersInstance.countEvent(`accountPatcher`, `inSync`)

      if (lastFail === true) {
        const failHistoryObject = this.syncFailHistory[this.syncFailHistory.length - 1]
        this.failEndCycle = cycle
        failHistoryObject.e = this.failEndCycle
        failHistoryObject.cycles = this.failEndCycle - this.failStartCycle

        /* prettier-ignore */ nestedCountersInstance.countEvent(`accountPatcher`, `inSync again. ${Utils.safeStringify(this.syncFailHistory[this.syncFailHistory.length -1])}`)

        //this is not really a fatal log so should be removed eventually. is is somewhat usefull context though when debugging.
        this.statemanager_fatal(`inSync again`, Utils.safeStringify(this.syncFailHistory))
      }
    }
  }

  /**
   * simulateRepairs
   * incomplete.  the idea was to see if potential repairs can even solve our current sync issue.
   * not sure this is worth the perf/complexity/effort.
   *
   * if we miss something, the patcher can just try again next cycle.
   *
   * @param cycle
   * @param badAccounts
   */
  simulateRepairs(_cycle: number, badAccounts: AccountIDAndHash[]): AccountPreTest[] {
    const results = []

    for (const badAccount of badAccounts) {
      const preTestResult = {
        accountID: badAccount.accountID,
        hash: badAccount.hash,
        preTestStatus: 1 /*PreTestStatus.Valid*/,
      }
      results.push(preTestResult)

      //todo run test that can change the pretestStatus value!
    }
    return results
  }

  //todo test the tree to see if repairs will work.   not simple to do efficiently
  //todo robust query the hashes?  technically if we repair to bad data it will just get detected and fixed again!!!

  /**
   * getAccountRepairData
   * take a list of bad accounts and figures out which nodes we can ask to get the data.
   * makes one or more data requests in parallel
   * organizes and returns the results.
   * @param cycle
   * @param badAccounts
   */
  async getAccountRepairData(
    cycle: number,
    badAccounts: AccountIDAndHash[]
  ): Promise<{
    repairDataResponse: AccountRepairDataResponse
    stateTableDataMap: Map<string, Shardus.StateTableObject>
    getAccountStats: AccountStats
  }> {
    //pick which nodes to ask! /    //build up requests
    const nodesBySyncRadix: Map<string, RequestEntry> = new Map()
    const accountHashMap = new Map()

    const wrappedDataList: Shardus.WrappedData[] = []
    const stateTableDataMap: Map<string, Shardus.StateTableObject> = new Map()

    const getAccountStats: AccountStats = {
      skipping: 0,
      multiRequests: 0,
      requested: 0,
      //alreadyOKHash:0
    }
    let repairDataResponse: AccountRepairDataResponse
    let allRequestEntries: Map<string, RequestEntry> = new Map()

    try {
      for (const accountEntry of badAccounts) {
        const syncRadix = accountEntry.accountID.substring(0, this.treeSyncDepth)
        let requestEntry = nodesBySyncRadix.get(syncRadix)

        // let accountMemData: AccountHashCache = this.stateManager.accountCache.getAccountHash(accountEntry.accountID)
        // if(accountMemData != null && accountMemData.h === accountEntry.hash){
        //   stats.alreadyOKHash++
        //   continue
        // }

        accountHashMap.set(accountEntry.accountID, accountEntry.hash)
        if (requestEntry == null) {
          //minor layer of security, we will ask a different node for the account than the one that gave us the hash
          const nodeToAsk = this.getNodeForQuery(accountEntry.accountID, cycle, true)
          if (nodeToAsk == null) {
            this.statemanager_fatal('getAccountRepairData no node avail', `getAccountRepairData no node avail ${cycle}`)
            continue
          }
          requestEntry = { node: nodeToAsk, request: { cycle, accounts: [] } }
          nodesBySyncRadix.set(syncRadix, requestEntry)
        }
        requestEntry.request.accounts.push(accountEntry)
        allRequestEntries.set(accountEntry.accountID, requestEntry)
      }

      const promises = []
      const accountPerRequest = this.config.stateManager.patcherAccountsPerRequest
      const maxAskCount = this.config.stateManager.patcherAccountsPerUpdate
      for (const requestEntry of nodesBySyncRadix.values()) {
        if (requestEntry.request.accounts.length > accountPerRequest) {
          let offset = 0
          const allAccounts = requestEntry.request.accounts
          let thisAskCount = 0
          while (
            offset < allAccounts.length &&
            Math.min(offset + accountPerRequest, allAccounts.length) < maxAskCount
          ) {
            requestEntry.request.accounts = allAccounts.slice(offset, offset + accountPerRequest)
            let promise = null
            // if (
            //   this.stateManager.config.p2p.useBinarySerializedEndpoints &&
            //   this.stateManager.config.p2p.getAccountDataByHashBinary
            // ) {
            promise = this.p2p.askBinary<GetAccountDataByHashesReq, GetAccountDataByHashesResp>(
              requestEntry.node,
              InternalRouteEnum.binary_get_account_data_by_hashes,
              requestEntry.request,
              serializeGetAccountDataByHashesReq,
              deserializeGetAccountDataByHashesResp,
              {}
            )
            // } else {
            // promise = this.p2p.ask(requestEntry.node, 'get_account_data_by_hashes', requestEntry.request)
            // }
            promises.push(promise)
            offset = offset + accountPerRequest
            getAccountStats.multiRequests++
            thisAskCount = requestEntry.request.accounts.length
          }

          getAccountStats.skipping += Math.max(0, allAccounts.length - thisAskCount)
          getAccountStats.requested += thisAskCount

          //would it be better to resync if we have a high number of errors?  not easy to answer this.
        } else {
          let promise = null
          // if (
          //   this.stateManager.config.p2p.useBinarySerializedEndpoints &&
          //   this.stateManager.config.p2p.getAccountDataByHashBinary
          // ) {
          promise = this.p2p.askBinary<GetAccountDataByHashesReq, GetAccountDataByHashesResp>(
            requestEntry.node,
            InternalRouteEnum.binary_get_account_data_by_hashes,
            requestEntry.request,
            serializeGetAccountDataByHashesReq,
            deserializeGetAccountDataByHashesResp,
            {}
          )
          // } else {
          // promise = this.p2p.ask(requestEntry.node, 'get_account_data_by_hashes', requestEntry.request)
          // }
          promises.push(promise)
          getAccountStats.requested = requestEntry.request.accounts.length
        }
      }

      const promiseResults = await Promise.allSettled(promises) //as HashTrieAccountDataResponse[]
      for (const promiseResult of promiseResults) {
        if (promiseResult.status === 'rejected') {
          continue
        }
        const result = promiseResult.value as HashTrieAccountDataResponse
        //HashTrieAccountDataResponse
        if (result != null && result.accounts != null && result.accounts.length > 0) {
          if (result.stateTableData != null && result.stateTableData.length > 0) {
            for (const stateTableData of result.stateTableData) {
              stateTableDataMap.set(stateTableData.stateAfter, stateTableData)
            }
          }

          //wrappedDataList = wrappedDataList.concat(result.accounts)
          for (const wrappedAccount of result.accounts) {
            const desiredHash = accountHashMap.get(wrappedAccount.accountId)
            if (desiredHash != wrappedAccount.stateId) {
              //got account back but has the wrong stateID
              //nestedCountersInstance.countEvent('accountPatcher', 'getAccountRepairData wrong hash')
              this.statemanager_fatal(
                'getAccountRepairData wrong hash',
                `getAccountRepairData wrong hash ${utils.stringifyReduce(wrappedAccount.accountId)}`
              )
              continue
            }
            wrappedDataList.push(wrappedAccount)

            // let stateDataFound = stateTableDataMap.get(wrappedAccount.accountId)
            // if(stateDataFound != null){
            //   //todo filtering
            //   if(stateDataFound.stateAfter === desiredHash){
            //     stateTableDataList.push(stateDataFound)
            //   }
            // }
          }
        }
      }
      let nodesWeAsked = []
      for (const wrappedData of wrappedDataList) {
        let requestEntry = allRequestEntries.get(wrappedData.accountId)
        if (requestEntry != null) {
          nodesWeAsked.push(requestEntry.node)
        } else {
          nodesWeAsked.push(null)
        }
      }
      repairDataResponse = { wrappedDataList, nodes: nodesWeAsked }
    } catch (error) {
      this.statemanager_fatal(
        'getAccountRepairData fatal ' + wrappedDataList.length,
        'getAccountRepairData fatal ' + wrappedDataList.length + ' ' + errorToStringFull(error)
      )
    }

    return { repairDataResponse, stateTableDataMap, getAccountStats }
  }

  calculateMinVotes(): number {
    let minVotes = Math.ceil(this.stateManager.currentCycleShardData.shardGlobals.nodesPerConsenusGroup * 0.51)
    const majorityOfActiveNodes = Math.ceil(this.stateManager.currentCycleShardData.nodes.length * 0.51)
    minVotes = Math.min(minVotes, majorityOfActiveNodes)
    minVotes = Math.max(1, minVotes)
    return minVotes
  }
}

type BadAccountStats = {
  testedSyncRadix: number
  skippedSyncRadix: number
  badSyncRadix: number
  ok_noTrieAcc: number
  ok_trieHashBad: number
  fix_butHashMatch: number
  fixLastSeen: number
  needsVotes: number
  subHashesTested: number
  trailColdLevel: number
  checkedLevel: number
  leafsChecked: number
  leafResponses: number
  getAccountHashStats: Record<string, never>
}

type BadAccountsInfo = {
  badAccounts: AccountIDAndHash[]
  hashesPerLevel: number[]
  checkedKeysPerLevel: number[]
  requestedKeysPerLevel: number[]
  badHashesPerLevel: number[]
  accountHashesChecked: number
  stats: BadAccountStats
  extraBadAccounts: AccountIdAndHashToRepair[]
  extraBadKeys: RadixAndHash[]
  accountsTheyNeedToRepair: AccountIdAndHashToRepair[]
}

export type AccountRepairInstruction = {
  accountID: string
  hash: string
  txId: string
  accountData: Shardus.WrappedData
  targetNodeId: string
  signedReceipt: SignedReceipt
}

export default AccountPatcher
