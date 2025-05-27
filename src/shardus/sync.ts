import * as Self from '../p2p/Self'
import * as CycleChain from '../p2p/CycleChain'
import * as Context from '../p2p/Context'
import * as Comms from '../p2p/Comms'
import * as NodeList from '../p2p/NodeList'
import { nodeListFromStates, queueFinishedSyncingRequest } from '../p2p/Join'
import { P2P } from '@shardeum-foundation/lib-types'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { shardusGetTime } from '../network'
import { apoptosizeSelf } from '../p2p/Apoptosis'
import * as utils from '../utils'
import { logFlags } from '../logger'

export const syncMethods = {
  /**
   * Function used to allow shardus to sync data specific to an app if it should be required
   */
  async syncAppData() {
    if (!this.app) {
      //await this.p2p.
      let readyPayload = {
        nodeId: Self.id,
        cycleNumber: CycleChain.getNewest()?.counter,
      }
      readyPayload = Context.crypto.sign(readyPayload)
      Comms.sendGossip(
        'gossip-sync-finished',
        readyPayload,
        undefined,
        undefined,
        nodeListFromStates([
          P2P.P2PTypes.NodeStatus.ACTIVE,
          P2P.P2PTypes.NodeStatus.READY,
          P2P.P2PTypes.NodeStatus.SYNCING,
        ])
      )
      if (this.stateManager) {
        this.stateManager.appFinishedSyncing = true
      }
      return
    }
    console.log('syncAppData')
    if (this.stateManager) {
      try {
        await this.stateManager.accountSync.initialSyncMain(3)
        console.log('syncAppData - initialSyncMain finished')
      } catch (err) {
        this.fatalLogger.fatal('initialSyncMain-failed with Error: ' + utils.formatErrorMessage(err))
        nestedCountersInstance.countEvent(
          'syncAppData',
          `initialSyncMain event: fail and apop self. ${shardusGetTime()}`
        )
        apoptosizeSelf(
          `initialSyncMain-failed: ${err?.message}`,
          'Node stopped due to node performance or network issues during initial app data sync.'
        )
        return
      }
    }
    // if (this.stateManager) await this.stateManager.accountSync.syncStateDataFast(3) // fast mode
    if (this.p2p.isFirstSeed) {
      console.log('syncAppData - isFirstSeed')
      // the following comment of delay is probably not relavent now as we are using cycle txs
      // we don't have a delay here as there's practically no time between sync-started and sync-finished for the first node
      // since we already wait fro sync-finished, its very unlikely we'll be in the wrong quarter
      await queueFinishedSyncingRequest()
      console.log('syncAppData - queueFinishedSyncingRequest')
      nestedCountersInstance.countEvent('p2p', `queue finished-syncing-request ${shardusGetTime()}`)
      await this.stateManager.waitForShardCalcs()
      await this.app.sync()
      console.log('syncAppData - sync')
      this.stateManager.appFinishedSyncing = true
      this.p2p.setIgnoreJoinRequests(false)
      console.log('p2pIgnoreJoinRequests = false')
    } else {
      await this.stateManager.startCatchUpQueue()
      console.log('syncAppData - startCatchUpQueue')
      await this.app.sync()
      console.log('syncAppData - sync')
      this.p2p.setIgnoreJoinRequests(false)
      console.log('p2pIgnoreJoinRequests = false')

      await queueFinishedSyncingRequest()
      console.log('syncAppData - queueFinishedSyncingRequest')
      nestedCountersInstance.countEvent('p2p', `queue finished-syncing-request ${shardusGetTime()}`)
      this.stateManager.appFinishedSyncing = true
    }
    // Set network joinable to true
    this.p2p.setJoinRequestToggle(true)
    console.log('Server ready!')
    if (this.stateManager) {
      await utils.sleep(3000)
      // Original sync check
      // this.stateManager.enableSyncCheck()

      // Partition check and data repair (new)
      // disable and compare this.stateManager.startSyncPartitions()

      //this.stateManager.partitionObjects.startSyncPartitions()
      this.stateManager.startProcessingCycleSummaries()
    }
  }
}
