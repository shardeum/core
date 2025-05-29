
import { P2P as P2PTypes } from '@shardeum-foundation/lib-types'
import { logFlags } from '../logger'
import { shardusGetTime } from '../network'
import { nestedCountersInstance } from '../utils/nestedCounters'
import * as utils from '../utils'
import * as NodeList from '../p2p/NodeList'
import * as CycleChain from '../p2p/CycleChain'
import ShardFunctions from './shardFunctions'
import { CycleShardData } from './state-manager-types'
import * as ShardusTypes from '../shardus/shardus-types'
import * as StateManagerTypes from './state-manager-types'

export const shardMethods = {
  updateShardValues(cycleNumber: number, mode: P2PTypes.ModesTypes.Record['mode']) {
    if (this.currentCycleShardData == null) {
      /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_sync_firstCycle', `${cycleNumber}`, ` first init `)
    }

    const cycleShardData = {} as CycleShardData

    // lets make sure shard calculation are happening at a consistent interval
    const calculationTime = shardusGetTime()
    if (this.lastShardCalculationTS > 0) {
        const delay = calculationTime - this.lastShardCalculationTS - this.config.p2p.cycleDuration * 1000

        if (delay > 5000) {
            this.statemanager_fatal(
                `updateShardValues-delay > 5s ${delay / 1000}`,
                `updateShardValues-delay ${delay / 1000}`
            )
        } else if (delay > 4000) {
            nestedCountersInstance.countEvent('stateManager', 'updateShardValues delay > 4s')
        } else if (delay > 3000) {
            nestedCountersInstance.countEvent('stateManager', 'updateShardValues delay > 3s')
        } else if (delay > 2000) {
            nestedCountersInstance.countEvent('stateManager', 'updateShardValues delay > 2s')
        }

        cycleShardData.calculationTime = calculationTime
    }
    this.lastShardCalculationTS = calculationTime

    // todo get current cycle..  store this by cycle?
    cycleShardData.nodeShardDataMap = new Map()
    cycleShardData.parititionShardDataMap = new Map()
    cycleShardData.nodes = this.getNodesForCycleShard(mode)
    cycleShardData.activeFoundationNodes = cycleShardData.nodes.filter((node) => node.foundationNode)
    cycleShardData.cycleNumber = cycleNumber
    cycleShardData.partitionsToSkip = new Map()
    cycleShardData.hasCompleteData = false

    if (this.lastActiveCount === -1) {
        this.lastActiveCount = cycleShardData.nodes.length
    } else {
        const change = cycleShardData.nodes.length - this.lastActiveCount
        if (change != 0) {
        /* prettier-ignore */ nestedCountersInstance.countEvent('networkSize', `cyc:${cycleNumber} active:${cycleShardData.nodes.length} change:${change}`)
        }
        this.lastActiveCount = cycleShardData.nodes.length
    }

    try {
        // cycleShardData.ourNode = NodeList.nodes.get(Self.id)
        cycleShardData.ourNode = NodeList.nodes.get(this.p2p.getNodeId())
    } catch (ex) {
        if (logFlags.playback) this.logger.playbackLogNote('shrd_sync_notactive', `${cycleNumber}`, `  `)
        return
    }

    if (cycleShardData.nodes.length === 0) {
      /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_sync_noNodeListAvailable', `${cycleNumber}`, `  `)
        return // no active nodes so stop calculating values
    }

    if (this.config === null || this.config.sharding === null) {
        throw new Error('this.config.sharding === null')
    }

    const cycle = this.p2p.state.getLastCycle()
    if (cycle !== null && cycle !== undefined) {
        cycleShardData.timestamp = cycle.start * 1000
        cycleShardData.timestampEndCycle = (cycle.start + cycle.duration) * 1000
    }

    const edgeNodes = this.config.sharding.nodesPerEdge as number

    // save this per cycle?
    cycleShardData.shardGlobals = ShardFunctions.calculateShardGlobals(
        cycleShardData.nodes.length,
        this.config.sharding.nodesPerConsensusGroup as number,
        edgeNodes
    )

    this.profiler.profileSectionStart('updateShardValues_computePartitionShardDataMap1') //13ms, #:60
    // partition shard data
    ShardFunctions.computePartitionShardDataMap(
        cycleShardData.shardGlobals,
        cycleShardData.parititionShardDataMap,
        0,
        cycleShardData.shardGlobals.numPartitions
    )
    this.profiler.profileSectionEnd('updateShardValues_computePartitionShardDataMap1')

    this.profiler.profileSectionStart('updateShardValues_computePartitionShardDataMap2') //37ms, #:60
    // generate limited data for all nodes data for all nodes.
    ShardFunctions.computeNodePartitionDataMap(
        cycleShardData.shardGlobals,
        cycleShardData.nodeShardDataMap,
        cycleShardData.nodes,
        cycleShardData.parititionShardDataMap,
        cycleShardData.nodes,
        false
    )
    this.profiler.profileSectionEnd('updateShardValues_computePartitionShardDataMap2')

    this.profiler.profileSectionStart('updateShardValues_computeNodePartitionData') //22ms, #:60
    // get extended data for our node
    cycleShardData.nodeShardData = ShardFunctions.computeNodePartitionData(
        cycleShardData.shardGlobals,
        cycleShardData.ourNode,
        cycleShardData.nodeShardDataMap,
        cycleShardData.parititionShardDataMap,
        cycleShardData.nodes,
        true
    )
    this.profiler.profileSectionEnd('updateShardValues_computeNodePartitionData')

    // This is currently redudnant if we move to lazy init of extended data we should turn it back on
    // this.profiler.profileSectionStart('updateShardValues_computeNodePartitionDataMap1') // 4ms, #:60
    // TODO perf scalability  need to generate this as needed in very large networks with millions of nodes.
    // generate full data for nodes that store our home partition
    //
    // ShardFunctions.computeNodePartitionDataMap(cycleShardData.shardGlobals, cycleShardData.nodeShardDataMap, cycleShardData.nodeShardData.nodeThatStoreOurParitionFull, cycleShardData.parititionShardDataMap, cycleShardData.nodes, true, false)
    // this.profiler.profileSectionEnd('updateShardValues_computeNodePartitionDataMap1')

    // cycleShardData.nodeShardData = cycleShardData.nodeShardDataMap.get(cycleShardData.ourNode.id)

    this.profiler.profileSectionStart('updateShardValues_computeNodePartitionDataMap2') //232ms, #:60
    // generate lightweight data for all active nodes  (note that last parameter is false to specify the lightweight data)
    const fullDataForDebug = true // Set this to false for performance reasons!!! setting it to true saves us from having to recalculate stuff when we dump logs.
    ShardFunctions.computeNodePartitionDataMap(
        cycleShardData.shardGlobals,
        cycleShardData.nodeShardDataMap,
        cycleShardData.nodes,
        cycleShardData.parititionShardDataMap,
        cycleShardData.nodes,
        fullDataForDebug
    )
    this.profiler.profileSectionEnd('updateShardValues_computeNodePartitionDataMap2')

    // TODO if fullDataForDebug gets turned false we will update the guts of this calculation
    // ShardFunctions.computeNodePartitionDataMapExt(cycleShardData.shardGlobals, cycleShardData.nodeShardDataMap, cycleShardData.nodes, cycleShardData.parititionShardDataMap, cycleShardData.nodes)

    this.currentCycleShardData = cycleShardData
    this.shardValuesByCycle.set(cycleNumber, cycleShardData)

    // calculate nodes that would just now start syncing edge data because the network shrank.
    if (cycleShardData.ourNode.status === 'active') {
        this.profiler.profileSectionStart('updateShardValues_getOrderedSyncingNeighbors') //0
        // calculate if there are any nearby nodes that are syncing right now.
        if (logFlags.verbose) this.mainLogger.debug(`updateShardValues: getOrderedSyncingNeighbors`)
        cycleShardData.syncingNeighbors = this.p2p.state.getOrderedSyncingNeighbors(cycleShardData.ourNode)
        this.profiler.profileSectionEnd('updateShardValues_getOrderedSyncingNeighbors')

        if (cycleShardData.syncingNeighbors.length > 0) {
            //old: add all syncing nodes
            cycleShardData.syncingNeighborsTxGroup = [...cycleShardData.syncingNeighbors]
            //TODO filter syncingNeighborsTxGroup to nodes that would care..(cover our data)
            // for(let node in cycleShardData.syncingNeighbors){

            //   ShardFunctions.
            // }
            cycleShardData.syncingNeighborsTxGroup.push(cycleShardData.ourNode)
            cycleShardData.hasSyncingNeighbors = true

        /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_sync_neighbors', `${cycleShardData.cycleNumber}`, ` neighbors: ${utils.stringifyReduce(cycleShardData.syncingNeighbors.map((node) => utils.makeShortHash(node.id) + ':' + node.externalPort))}`)
        } else {
            cycleShardData.hasSyncingNeighbors = false
        }

        if (logFlags.console) console.log(`updateShardValues  cycle:${cycleShardData.cycleNumber} `)

        // if (this.preTXQueue.length > 0) {
        //   for (let tx of this.preTXQueue) {
        //     /* prettier-ignore */ if (logFlags.playback ) this.logger.playbackLogNote('shrd_sync_preTX', ` `, ` ${utils.stringifyReduce(tx)} `)
        //     this.transactionQueue.routeAndQueueAcceptedTransaction(tx, false, null)
        //   }
        //   this.preTXQueue = []
        // }
        this.profiler.profileSectionStart('updateShardValues_updateRuntimeSyncTrackers') //0
        this.accountSync.updateRuntimeSyncTrackers()
        this.profiler.profileSectionEnd('updateShardValues_updateRuntimeSyncTrackers')
        // this.calculateChangeInCoverage()
    }

    this.profiler.profileSectionStart('updateShardValues_getPartitionLists') // 0
    // calculate our consensus partitions for use by data repair:
    // cycleShardData.ourConsensusPartitions = []
    const partitions = ShardFunctions.getConsenusPartitionList(
        cycleShardData.shardGlobals,
        cycleShardData.nodeShardData
    )
    cycleShardData.ourConsensusPartitions = partitions

    const partitions2 = ShardFunctions.getStoredPartitionList(cycleShardData.shardGlobals, cycleShardData.nodeShardData)
    cycleShardData.ourStoredPartitions = partitions2

    this.profiler.profileSectionEnd('updateShardValues_getPartitionLists')

    // this will be a huge log.
    // Temp disable for log size
    // /* prettier-ignore */ if (logFlags.playback ) this.logger.playbackLogNote('shrd_sync_cycleData', `${cycleNumber}`, ` cycleShardData: cycle:${cycleNumber} data: ${utils.stringifyReduce(cycleShardData)}`)
    /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_sync_cycleData', `${cycleNumber}`, ` cycleShardData: cycle:${this.currentCycleShardData.cycleNumber} `)

    this.lastActiveNodeCount = cycleShardData.nodes.length

    cycleShardData.hasCompleteData = true
  },

  calculateChangeInCoverage(): void {
    // maybe this should be a shard function so we can run unit tests on it for expanding or shrinking networks!
    const newSharddata = this.currentCycleShardData

    if (newSharddata == null || this.currentCycleShardData == null) {
        return
    }

    let cycleToCompareTo = newSharddata.cycleNumber - 1

    //if this is our first time to sync we should attempt to compare to an older cycle
    if (this.firstTimeToRuntimeSync === true) {
        this.firstTimeToRuntimeSync = false

        //make sure the cycle started is an older one
        if (this.accountSync.syncStatement.cycleStarted < cycleToCompareTo) {
            cycleToCompareTo = this.accountSync.syncStatement.cycleStarted
        } else {
            //in theory we could just return but I dont want to change that side of the branch yet.
        }
    }

    const oldShardData = this.shardValuesByCycle.get(cycleToCompareTo)

    if (oldShardData == null) {
        // log ?
        return
    }
    const cycle = this.currentCycleShardData.cycleNumber
    // oldShardData.shardGlobals, newSharddata.shardGlobals
    const coverageChanges = ShardFunctions.computeCoverageChanges(
        oldShardData.nodeShardData,
        newSharddata.nodeShardData
    )

    this.coverageChangesCopy = coverageChanges

    for (const change of coverageChanges) {
      // log info about the change.
      // ${utils.stringifyReduce(change)}
      /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_sync_change', `${oldShardData.cycleNumber}->${newSharddata.cycleNumber}`, ` ${ShardFunctions.leadZeros8(change.start.toString(16))}->${ShardFunctions.leadZeros8(change.end.toString(16))} `)

        // create a range object from our coverage change.

        const range = {
            startAddr: 0,
            endAddr: 0,
            low: '',
            high: '',
        } as any // BasicAddressRange type
        range.startAddr = change.start
        range.endAddr = change.end
        range.low = ShardFunctions.leadZeros8(range.startAddr.toString(16)) + '0'.repeat(56)
        range.high = ShardFunctions.leadZeros8(range.endAddr.toString(16)) + 'f'.repeat(56)
        // create sync trackers
        this.accountSync.createSyncTrackerByRange(range, cycle)
    }

    if (coverageChanges.length > 0) {
        this.accountSync.syncRuntimeTrackers()
    }
    // launch sync trackers
    // coverage changes... should have a list of changes
    // should note if the changes are an increase or reduction in covered area.
    // log the changes.
    // next would be to create some syncTrackers based to cover increases
  },

  getCurrentCycleShardData(): CycleShardData | null {
    if (this.currentCycleShardData === null) {
        const cycle = this.p2p.state.getLastCycle()
        if (cycle === null || cycle === undefined) {
            return null
        }
        this.updateShardValues(cycle.counter, cycle.mode)
    }

    return this.currentCycleShardData
  },

  hasCycleShardData() {
    return this.currentCycleShardData != null
  },

  async waitForShardCalcs() {
    while (this.currentCycleShardData == null) {
        this.getCurrentCycleShardData()
        await utils.sleep(1000)
      /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_sync_waitForShardData_firstNode', ``, ` ${utils.stringifyReduce(this.currentCycleShardData)} `)
    }
  }
}
