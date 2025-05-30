/**
 * SyncV2 a p2p module that contains all of the functionality for the new
 * Node List Sync v2.
 */

import { errAsync, okAsync, ResultAsync } from 'neverthrow'
import { hexstring, P2P, Utils } from '@shardeum-foundation/lib-types'
import './types'
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
import { p2pLogger, robustQueryForCycleHistory, getCycleByMarkerFromNode } from './queries'
import { sleep } from '../../utils'
import Shardus from '../../shardus'
import * as RefuteCacheSync from '../RefuteCacheSync'
import { CycleHistoryTracker } from '../CycleHistoryTracker'
import { config } from '../Context'
import * as RefuteCycleCache from '../RefuteCycleCache'

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

            return ResultAsync.fromPromise(
              shardus.earlyConfigFetchAndPatch(cycle.counter),
              (error) => new Error(`Failed to fetch and patch config: ${error}`)
            ).andThen(() => {
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

              // Sync cycle history for problematic node detection
              syncCycleHistory(activeNodes, cycle.counter).then((success) => {
                if (success) {
                  info('Cycle history sync successful')
                  
                  // Build RefuteCache from the synced cycles
                  const allCycles = CycleChain.cycles
                  RefuteCycleCache.buildCacheFromCycles(allCycles)
                  info('RefuteCache built from cycle history')
                } else {
                  warn('Cycle history sync failed, will collect cycles gradually')
                }
              }).catch((error) => {
                warn('Cycle history sync error:', error)
              })

              return okAsync(void 0)
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
 * Sync cycle history from active nodes with fallback to legacy method
 * @param activeNodes - Array of active nodes to query
 * @param currentCycleCounter - Current cycle counter
 * @returns Promise indicating success or failure
 */
async function syncCycleHistory(activeNodes: P2P.SyncTypes.ActiveNode[], currentCycleCounter: number): Promise<boolean> {
  try {
    const requestedHistoryLength = config.p2p.problematicNodeHistoryLength || 33
    
    // Try atomic cycle history sync first
    const atomicResult = await robustQueryForCycleHistory(activeNodes, requestedHistoryLength)
    
    if (atomicResult.isOk()) {
      const { value, winningNodes } = atomicResult.value
      const { currentCycle, historicalCycles } = value
      
      // Verify the current cycle matches what we expected
      if (currentCycle.counter !== currentCycleCounter) {
        warn(`Cycle counter mismatch: expected ${currentCycleCounter}, got ${currentCycle.counter}`)
        return false
      }
      
      // Add all historical cycles to CycleChain
      for (const cycle of historicalCycles) {
        // Validate cycle chain integrity
        if (historicalCycles.indexOf(cycle) > 0) {
          const prevCycle = historicalCycles[historicalCycles.indexOf(cycle) - 1]
          if (!CycleChain.validate(prevCycle, cycle)) {
            warn(`Cycle validation failed at cycle ${cycle.counter}`)
            return false
          }
        }
        
        // Prepend historical cycles (they're older than current)
        CycleChain.prepend(cycle)
      }
      
      info(`Successfully synced ${historicalCycles.length} historical cycles atomically`)
      return true
    } else {
      // Fallback to legacy sync method
      info('Atomic cycle history sync failed, falling back to legacy method')
      return await syncCycleHistoryLegacy(activeNodes, currentCycleCounter, requestedHistoryLength)
    }
  } catch (error) {
    warn('Error in syncCycleHistory:', error)
    return false
  }
}

/**
 * Legacy fallback method for syncing cycle history
 * @param activeNodes - Array of active nodes to query
 * @param currentCycleCounter - Current cycle counter
 * @param requestedHistoryLength - Number of cycles to request
 * @returns Promise indicating success or failure
 */
async function syncCycleHistoryLegacy(
  activeNodes: P2P.SyncTypes.ActiveNode[], 
  currentCycleCounter: number,
  requestedHistoryLength: number
): Promise<boolean> {
  try {
    const cycleTracker = new CycleHistoryTracker(requestedHistoryLength)
    
    // Calculate which cycles we need
    const startCycle = Math.max(0, currentCycleCounter - requestedHistoryLength + 1)
    const endCycle = currentCycleCounter - 1 // Don't include current cycle, we already have it
    
    // Request missing cycles
    let successCount = 0
    for (let cycleNum = startCycle; cycleNum <= endCycle; cycleNum++) {
      // Get the cycle from CycleChain if we already have it
      const existingCycles = CycleChain.getCycleChain(cycleNum, cycleNum)
      if (existingCycles.length > 0) {
        cycleTracker.addCycle(existingCycles[0])
        successCount++
        continue
      }
      
      // Otherwise, request it from a node
      // We need to get the marker for this cycle first
      // For now, we'll skip cycles we don't have markers for
      warn(`Legacy sync: Unable to request cycle ${cycleNum} - marker unknown`)
    }
    
    info(`Legacy sync: Retrieved ${successCount} cycles out of ${endCycle - startCycle + 1} requested`)
    return successCount > 0
  } catch (error) {
    warn('Error in syncCycleHistoryLegacy:', error)
    return false
  }
}

function info(...msg) {
  const entry = `SyncV2: ${msg.join(' ')}`
  p2pLogger.info(entry)
}

function warn(...msg) {
  const entry = `SyncV2: ${msg.join(' ')}`
  p2pLogger.warn(entry)
}
