/**
 * SyncV2 a p2p module that contains all of the functionality for the new
 * Node List Sync v2.
 */

import { errAsync, okAsync, ResultAsync } from 'neverthrow'
import { hexstring, P2P, Utils } from '@shardeum-foundation/lib-types'
import * as ProblemNodeHandler from '../ProblemNodeHandler'
import {
  getCycleDataFromNode,
  initLogger,
  robustQueryForCycleRecordHash,
  robustQueryForValidatorListHash,
  getValidatorListFromNode,
  getArchiverListFromNode,
  robustQueryForArchiverListHash,
  robustQueryForStandbyNodeListHash,
  getStandbyNodeListFromNode,
  robustQueryForTxListHash,
  getTxListFromNode,
  robustQueryForRecentCycleMarkers,
  getCyclesBatchFromNode,
} from './queries'
import { verifyArchiverList, verifyCycleRecord, verifyTxList, verifyValidatorList } from './verify'
import * as Archivers from '../Archivers'
import * as NodeList from '../NodeList'
import * as CycleChain from '../CycleChain'
import * as ServiceQueue from '../ServiceQueue'
import { initRoutes } from './routes'
import { digestCycle } from '../Sync'
import { JoinRequest } from '@shardeum-foundation/lib-types/build/src/p2p/JoinTypes'
import { addStandbyJoinRequests } from '../Join/v2'
import { logFlags } from '../../logger'
import { makeCycleMarker } from '../CycleCreator'
import { p2pLogger } from './queries'
import { sleep } from '../../utils'
import Shardus from '../../shardus'
import { config } from '../Context'

/** Initializes logging and endpoints for Sync V2. */
export function init(): void {
  initLogger()
  initRoutes()
}

/**
 * This function synchronizes nodes, archivers and cycle records.
 *
 * @export
 * @param {P2P.SyncTypes.ActiveNode[]} activeNodes - An array of active nodes that can be queried for synchronization. The function first synchronizes the validator list, the archiver list, and then the latest cycle record respectively.
 *
 * Only active nodes are added to the NodeList, and all the archivers are added to the Archivers list.
 * The cycle record is then appended to the CycleChain.
 *
 * @returns {ResultAsync<void, Error>} - A ResultAsync object. On success, it will contain void and on
 * error, it will contain an Error object. The function is asynchronous and can be awaited.
 */
export function syncV2(activeNodes: P2P.SyncTypes.ActiveNode[], shardus: Shardus): ResultAsync<void, Error> {
  return syncValidValidatorList(activeNodes).andThen(([validatorList, validatorListHash]) =>
    syncArchiverList(activeNodes).andThen(([archiverList, archiverListHash]) =>
      syncStandbyNodeList(activeNodes).andThen((standbyNodeList) =>
        syncTxList(activeNodes).andThen((txList) =>
          syncLatestCycleRecord(activeNodes).andThen((cycle) => {
            if (cycle.nodeListHash !== validatorListHash) {
              return errAsync(
                new Error(
                  `validator list hash from received cycle (${cycle.nodeListHash}) does not match the hash received from robust query (${validatorListHash})`
                )
              )
            } else if (cycle.archiverListHash !== archiverListHash) {
              return errAsync(
                new Error(
                  `archiver list hash from received cycle (${cycle.archiverListHash}) does not match the hash received from robust query (${archiverListHash})`
                )
              )
            }

            // Log config value before patching (for comparison)
            info(`syncV2: syncV2HistoricalCyclesCount before patch: ${config.p2p.syncV2HistoricalCyclesCount}`)
            
            return ResultAsync.fromPromise(
              shardus.earlyConfigFetchAndPatch(cycle.counter),
              (error) => new Error(`Failed to fetch and patch config: ${error}`)
            ).andThen(() => {
              // Log config value after patching
              info(`syncV2: syncV2HistoricalCyclesCount after patch: ${config.p2p.syncV2HistoricalCyclesCount}`)
              NodeList.reset('syncV2')

              // log the counts of the nodes, archivers, and standby nodes
              /* prettier-ignore */ if (logFlags.important_as_fatal) console.log( `syncV2: nodes: ${validatorList.length}, archivers: ${archiverList.length}, standby nodes: ${standbyNodeList.length}` )

              // add validators
              NodeList.addNodes(validatorList, 'syncV2', cycle)

              // add archivers
              for (const archiver of archiverList) {
                Archivers.archivers.set(archiver.publicKey, archiver)
              }

              // add standby nodes
              addStandbyJoinRequests(standbyNodeList, true)

              // add txList
              ServiceQueue.setTxList(txList)

              // add latest cycle
              CycleChain.reset()

              // earlyConfigFetchAndPatch() is an async call so we have to do some
              // funky stuff to call it in this neverthow style code:

              info('syncV2: cycle.counter ', cycle.counter)
              info('syncV2: cycle.marker ', makeCycleMarker(cycle))
              info('syncV2: nodelist hash ', cycle.nodeListHash)
              info('syncV2: archiverList hash ', cycle.archiverListHash)
              info('syncV2: standbyNodeList hash ', cycle.standbyNodeListHash)
              info('syncV2: cycle ', Utils.safeStringify(cycle))

              digestCycle(cycle, 'syncV2')

              info('syncV2: CycleChain.newest.counter ', CycleChain.newest.counter)
              info('syncV2: CycleChain.newest.marker ', makeCycleMarker(CycleChain.newest))
              info('syncV2: nodelist hash ', CycleChain.newest.nodeListHash)
              info('syncV2: archiverList hash ', CycleChain.newest.archiverListHash)
              info('syncV2: standbyNodeList hash ', CycleChain.newest.standbyNodeListHash)
              info('syncV2: CycleChain.newest ', Utils.safeStringify(CycleChain.newest))

              // Sync historical cycles after the latest cycle
              return syncHistoricalCycles(activeNodes, cycle).andThen((historicalCycles) => {
                if (historicalCycles.length > 0) {
                  info(`syncV2: Adding ${historicalCycles.length} historical cycles to CycleChain`)
                  
                  // Use batch prepend for efficiency
                  CycleChain.prependMultiple(historicalCycles)
                  
                  info(`syncV2: CycleChain now has ${CycleChain.cycles.length} cycles`)
                  info(`syncV2: Oldest cycle counter: ${CycleChain.oldest.counter}`)
                  info(`syncV2: Newest cycle counter: ${CycleChain.newest.counter}`)
                  info(`syncV2: Historical sync complete - using network config value of ${config.p2p.syncV2HistoricalCyclesCount}`)
                  
                  // Rebuild problematic node cache with all available cycles
                  if (config.p2p.enableProblematicNodeCacheBuilding) {
                    ProblemNodeHandler.rebuildCacheFromCycleChain()
                    info(`syncV2: Rebuilt ProblematicNodeCache with ${CycleChain.cycles.length} cycles`)
                    
                    // Validate we have sufficient history for problematic node detection
                    const availableHistory = CycleChain.cycles.length
                    const requiredHistory = config.p2p.problematicNodeHistoryLength
                    if (availableHistory < requiredHistory) {
                      warn(`syncV2: Insufficient cycle history for problematic node detection. Have ${availableHistory}, need ${requiredHistory}`)
                    }
                  }
                } else {
                  info(`syncV2: No historical cycles synced (network config: ${config.p2p.syncV2HistoricalCyclesCount})`)
                }
                
                return okAsync(void 0)
              })
            })
          })
        )
      )
    )
  )
}

/**
 * This function queries for a validator list from other active nodes.
 *
 * @param {P2P.SyncTypes.ActiveNode[]} activeNodes - An array of active nodes to be queried.
 * The function first performs a robust query for the latest node list hash.
 * Then, it requests a full list from one of the winning nodes using the hash
 * retrieved. The node receiving the request may or may not have the list whose
 * hash matches the one requested.
 *
 * @returns {ResultAsync<[P2P.NodeListTypes.Node[], hexstring], Error>} - A
 * ResultAsync object. On success, it will contain an array of Node objects and
 * the validator list hash, and on error, it will contain an Error object. The
 * function is asynchronous and can be awaited.
 */
function syncValidValidatorList(
  activeNodes: P2P.SyncTypes.ActiveNode[]
): ResultAsync<[P2P.NodeListTypes.Node[], hexstring], Error> {
  // run a robust query for the lastest node list hash
  return robustQueryForValidatorListHash(activeNodes).andThen(({ value, winningNodes }) =>
    // get full node list from one of the winning nodes
    getValidatorListFromNode(winningNodes[0], value.nodeListHash).andThen((nodeList) =>
      // verify a hash of the retrieved node list matches the hash from before.
      // if it does, return the node list
      verifyValidatorList(nodeList, value.nodeListHash).map(
        () => [nodeList, value.nodeListHash] as [P2P.NodeListTypes.Node[], hexstring]
      )
    )
  )
}

/**
 * This function queries for an archiver list from other active nodes.
 *
 * @param {P2P.SyncTypes.ActiveNode[]} activeNodes - An array of active nodes to be queried.
 * The function first performs a robust query for the latest archiver list hash.
 * Then, it requests a full list from one of the winning nodes using the hash
 * retrieved. The node receiving the request may or may not have the list whose
 * hash matches the one requested.
 *
 * @returns {ResultAsync<[P2P.ArchiversTypes.JoinedArchiver[], hexstring], Error>} - A ResultAsync object. On success, it will contain an array of
 * JoinedArchiver objects and the archiver list hash, and on error, it will contain an Error object. The function is asynchronous and can be awaited.
 */
function syncArchiverList(
  activeNodes: P2P.SyncTypes.ActiveNode[]
): ResultAsync<[P2P.ArchiversTypes.JoinedArchiver[], hexstring], Error> {
  // run a robust query for the lastest archiver list hash
  return robustQueryForArchiverListHash(activeNodes).andThen(({ value, winningNodes }) =>
    // get full archiver list from one of the winning nodes
    getArchiverListFromNode(winningNodes[0], value.archiverListHash).andThen((archiverList) =>
      // verify a hash of the retrieved archiver list matches the hash from before.
      // if it does, return the archiver list
      verifyArchiverList(archiverList, value.archiverListHash).map(
        () => [archiverList, value.archiverListHash] as [P2P.ArchiversTypes.JoinedArchiver[], hexstring]
      )
    )
  )
}

/**
 * This function queries for a valid standby node list.
 *
 * @param {P2P.SyncTypes.ActiveNode[]} activeNodes - An array of active nodes to be queried.
 * The function first performs a robust query for the latest standby node list hash.
 * Then, it requests a full list from one of the winning nodes using the hash
 * retrieved. The node receiving the request may or may not have the list whose
 * hash matches the one requested.
 *
 * @returns {ResultAsync<P2P.ArchiversTypes.JoinedArchiver[], Error>} - A ResultAsync object. On success, it will contain
 * an array of JoinRequest objects, and on error, it will contain an Error object. The function is asynchronous
 * and can be awaited.
 */
function syncStandbyNodeList(activeNodes: P2P.SyncTypes.ActiveNode[]): ResultAsync<JoinRequest[], Error> {
  // run a robust query for the lastest archiver list hash
  return robustQueryForStandbyNodeListHash(activeNodes).andThen(({ value, winningNodes }) => {
    // get full archiver list from one of the winning nodes
    return getStandbyNodeListFromNode(winningNodes[0], value.standbyNodeListHash)
  })
}

function syncTxList(
  activeNodes: P2P.SyncTypes.ActiveNode[]
): ResultAsync<{ hash: string; tx: P2P.ServiceQueueTypes.AddNetworkTx }[], Error> {
  return robustQueryForTxListHash(activeNodes).andThen(({ value, winningNodes }) =>
    getTxListFromNode(winningNodes[0], value.txListHash).andThen((txList) =>
      verifyTxList(txList, value.txListHash).map(() => txList)
    )
  )
}

/**
 * Synchronizes the latest cycle record from a list of active nodes.
 *
 * @param {P2P.SyncTypes.ActiveNode[]} activeNodes - An array of active nodes to be queried.
 * The function first performs a robust query for the latest cycle record hash.
 * After obtaining the hash, it retrieves the current cycle data from one of the winning nodes.
 * It then verifies whether the cycle record marker matches the previously obtained hash.
 * If it matches, the cycle record is returned.
 *
 * @returns {ResultAsync<P2P.CycleCreatorTypes.CycleRecord, Error>} - A ResultAsync object.
 * On success, it will contain a CycleRecord object, and on error, it will contain an Error object.
 * The function is asynchronous and can be awaited.
 */
function syncLatestCycleRecord(
  activeNodes: P2P.SyncTypes.ActiveNode[]
): ResultAsync<P2P.CycleCreatorTypes.CycleRecord, Error> {
  // run a robust query for the latest cycle record hash
  return robustQueryForCycleRecordHash(activeNodes).andThen(({ value, winningNodes }) =>
    // get current cycle record from node
    getCycleDataFromNode(winningNodes[0], value.currentCycleHash).andThen((cycle) =>
      // verify the cycle record marker matches the hash from before. if it
      // does, return the cycle
      verifyCycleRecord(cycle, value.currentCycleHash).map(() => cycle)
    )
  )
}

/**
 * Synchronizes historical cycles from the network.
 * 
 * @param {P2P.SyncTypes.ActiveNode[]} activeNodes - Active nodes to query
 * @param {P2P.CycleCreatorTypes.CycleRecord} latestCycle - The latest cycle already synced
 * @returns {ResultAsync<P2P.CycleCreatorTypes.CycleRecord[], Error>} Array of historical cycles
 */
function syncHistoricalCycles(
  activeNodes: P2P.SyncTypes.ActiveNode[],
  latestCycle: P2P.CycleCreatorTypes.CycleRecord
): ResultAsync<P2P.CycleCreatorTypes.CycleRecord[], Error> {
  // Get the value from config (which should be patched by earlyConfigFetchAndPatch)
  // Note: The config object from Context is the same reference that gets patched,
  // so this will automatically use the network's value after earlyConfigFetchAndPatch runs
  const rawHistoricalCount = config.p2p.syncV2HistoricalCyclesCount || 0
  
  // Log the config value being used (helps verify network vs local config)
  info(`syncV2HistoricalCyclesCount from config: ${rawHistoricalCount}`)
  
  // Validate the count is within reasonable bounds (0-100)
  const MAX_HISTORICAL_CYCLES = 100
  const historicalCount = Math.min(Math.max(0, rawHistoricalCount), MAX_HISTORICAL_CYCLES)
  
  if (rawHistoricalCount !== historicalCount) {
    info(`Historical cycles count adjusted from ${rawHistoricalCount} to ${historicalCount} (max: ${MAX_HISTORICAL_CYCLES})`)
  }
  
  if (historicalCount <= 0) {
    info('Historical cycles sync disabled (count = 0)')
    return okAsync([])
  }
  
  info(`Starting historical cycles sync with network config value: ${historicalCount} cycles`)
  
  // Run robust query for recent cycle markers with error handling for backward compatibility
  return robustQueryForRecentCycleMarkers(activeNodes)
    .andThen(({ value, winningNodes }) => {
    const { cycleMarkers, oldestCounter } = value
    
    if (cycleMarkers.length === 0) {
      info('No historical cycles available from network')
      return okAsync([])
    }
    
    info(`Found ${cycleMarkers.length} cycle markers available, oldest counter: ${oldestCounter}`)
    
    // Filter out the latest cycle we already have
    const latestMarker = makeCycleMarker(latestCycle)
    const historicalMarkers = cycleMarkers.filter(marker => marker !== latestMarker)
    
    // Limit to configured count
    const markersToFetch = historicalMarkers.slice(-historicalCount)
    
    if (markersToFetch.length === 0) {
      info('No additional historical cycles to fetch')
      return okAsync([])
    }
    
    info(`Fetching ${markersToFetch.length} historical cycles`)
    
    // Fetch cycles in batches
    const batchSize = 10
    const batches: string[][] = []
    for (let i = 0; i < markersToFetch.length; i += batchSize) {
      batches.push(markersToFetch.slice(i, i + batchSize))
    }
    
    // Fetch all batches
    const batchPromises = batches.map(batch => 
      getCyclesBatchFromNode(winningNodes[0], batch)
    )
    
    return ResultAsync.combine(batchPromises).andThen(results => {
      const allCycles: P2P.CycleCreatorTypes.CycleRecord[] = []
      for (const result of results) {
        allCycles.push(...result.cycles)
      }
      
      // Sort cycles by counter (oldest to newest)
      allCycles.sort((a, b) => a.counter - b.counter)
      
      // Validate cycle chain continuity
      for (let i = 1; i < allCycles.length; i++) {
        const prev = allCycles[i - 1]
        const curr = allCycles[i]
        if (!CycleChain.validate(prev, curr)) {
          return errAsync(new Error(`Invalid cycle chain: cycle ${curr.counter} does not follow ${prev.counter}`))
        }
      }
      
      // Validate connection to latest cycle
      if (allCycles.length > 0) {
        const lastHistorical = allCycles[allCycles.length - 1]
        if (lastHistorical.counter !== latestCycle.counter - 1) {
          // Check if we can still validate the chain
          const expectedPrevMarker = makeCycleMarker(lastHistorical)
          if (latestCycle.previous !== expectedPrevMarker) {
            return errAsync(new Error(`Historical cycles do not connect to latest cycle`))
          }
        }
      }
      
      info(`Successfully fetched and validated ${allCycles.length} historical cycles`)
      return okAsync(allCycles)
    })
  })
  .orElse((error) => {
    // Handle backward compatibility - older nodes won't have the endpoint
    if (error.message.includes('404') || error.message.includes('not found')) {
      info('Historical cycles sync not supported by network (backward compatibility)')
      return okAsync([])
    }
    // Re-throw other errors
    return errAsync(error)
  })
}

function info(...msg: any[]) {
  const entry = `SyncV2: ${msg.join(' ')}`
  p2pLogger.info(entry)
}

function warn(...msg: any[]) {
  const entry = `SyncV2: ${msg.join(' ')}`
  p2pLogger.warn(entry)
}
