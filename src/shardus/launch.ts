import * as Network from '../network'
import { isServiceMode } from '../debug'
import * as Context from '../p2p/Context'
import * as Self from '../p2p/Self'
import * as Archivers from '../p2p/Archivers'
import Crypto from '../crypto'
import * as Log4js from 'log4js'
import * as SocketIO from 'socket.io'
import * as NodeList from '../p2p/NodeList'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { logFlags } from '../logger'
import * as CycleCreator from '../p2p/CycleCreator'
import * as CycleChain from '../p2p/CycleChain'
import * as Join from '../p2p/Join'
import * as Active from '../p2p/Active'
import * as Lost from '../p2p/Lost'
import * as Rotation from '../p2p/Rotation'
import * as SyncModule from '../p2p/Sync'
import * as GlobalAccounts from '../p2p/GlobalAccounts'
import * as Comms from '../p2p/Comms'
import * as CycleAutoScale from '../p2p/CycleAutoScale'
import { ipInfo } from '../network'
import { P2P as P2PNamespace } from '@shardeum-foundation/lib-types'
import { nodeListFromStates } from '../p2p/Join'
import { queueFinishedSyncingRequest } from '../p2p/Join'
import { isFirst, waitForQ1SendRequests } from '../p2p/Self'
import { P2P } from '@shardeum-foundation/lib-types'
import { shardusGetTime } from '../network'
import * as ShardusTypes from '../shardus/shardus-types'
import { config } from '../p2p/Context'
import { profilerInstance } from '../utils/profiler'
import * as utils from '../utils'
import { isApopMarkedNode, apoptosizeSelf } from '../p2p/Apoptosis'
import { scheduleLostReport } from '../p2p/Lost'
import Debug from '../debug'
import * as path from 'path'
import Statistics from '../statistics'
import LoadDetection from '../load-detection'
import * as AutoScaling from '../p2p/CycleAutoScale'
import RateLimiting from '../rate-limiting'
import * as Snapshot from '../snapshot'
import Reporter from '../reporter'
import { networkMode } from '../p2p/Modes'

export const startMethods = {
  /**
   * Calling this function will start the network
   * @param {*} exitProcOnFail Exit the process if an error occurs
   */  
  async start() {
    // Check network up & time synced
    await Network.init()

    const isInTimeLimit = await Network.checkAndUpdateTimeSyncedOffset(this.config.p2p.timeServers)

    if (isInTimeLimit === false) {
      this.mainLogger.error(`Time is not in sync with the network from checkAndUpdateTimeSyncedOffset process`)
      throw new Error(`Time is not in sync with the network during ntpOffsetMs generation`)
    }

    if (!isServiceMode()) {
      // Setup storage
      await this.storage.init()
    }

    // Setup crypto
    await this.crypto.init()

    try {
      const sk: string = this.crypto.keypair.secretKey
      this.io = (await this.network.setup(Network.ipInfo, sk)) as SocketIO.Server
      Context.setIOContext(this.io)

      /*
       * The old middleware is deleted and repurpose into a function
       * It was causing problem because as nature of middlewares are expected to run in each events.
       *   But the authentication payload is only needed to be checked and only supplied once at the socket.io handshake
       *   This caused the archiver to be able to connect on the first handshake stuck.
       *   redundant crypto.verify calls were made.
       */
      function validateSocketHandshake(socket: SocketIO.Socket, crypto: Crypto, mainLogger: Log4js.Logger): boolean {
        // `this` is not binded
        // calling `this` in the function will not be the same `this` as the outer LOC were referencing to
        try {
          if (!Self || !Self.isActive) {
            if (!Self.allowConnectionToFirstNode) {
              mainLogger.error(`❌ This node is not active yet and kill the socket connection!`)
              return false
            }
          }
          // Check if the archiver module is initialized; this is unlikely to happen because of the above Self.isActive check
          if (!Archivers.recipients || !Archivers.connectedSockets) {
            mainLogger.error(`❌ Seems Archiver module isn't initialized yet, dropping the Socket connection!`)
            return false
          }

          nestedCountersInstance.countEvent('debug-archiverConnections', `ourIP: ${Self.ip}`)
          nestedCountersInstance.countEvent(
            'debug-archiverConnections',
            `socket.handshake.address: ${socket.handshake.address.split('::ffff:').pop()}`
          )
          nestedCountersInstance.countEvent(
            'debug-archiverConnections',
            `socket.handshake.headers.host: ${socket.handshake.headers.host.split(':')[0]}`
          )

          // And we've encountered issues with it in the earthnet
          // Plus the archiver is already authenticated by the signature.
          // Singature valid and ip are not in sync? then we got a bigger problem to worry about.
          // const archiverIP = socket.handshake.address.split('::ffff:').pop();
          // if (!utils.isValidIPv4(archiverIP)) {
          //   mainLogger.error(`❌ Invalid IP-Address of Archiver: ${archiverIP}`)
          //   return false
          // }

          const archiverCreds = JSON.parse(socket.handshake.query.data) as {
            publicKey: string
            timestamp: number
            intendedConsensor: string
            sign: ShardusTypes.Sign
          }
          // +/- 5sec tolerance
          if (Math.abs(archiverCreds.timestamp - shardusGetTime()) > 5000) {
            mainLogger.error(`❌ Old signature from Archiver @ ${archiverCreds.publicKey}`)
            return false
          }

          if (archiverCreds.intendedConsensor !== Self.getThisNodeInfo().publicKey) {
            mainLogger.error(
              `❌ The signature is targeted for consensor @ ${archiverCreds.intendedConsensor} but this node is ${
                Self.getThisNodeInfo().publicKey
              }`
            )
            return false
          }

          const isValidSig = crypto.verify(archiverCreds, archiverCreds.publicKey)

          if (!isValidSig) {
            mainLogger.error(`❌ Invalid Signature from Archiver @ ${archiverCreds.publicKey}`)
            return false
          }

          if (Object.keys(Archivers.connectedSockets).length >= config.p2p.maxArchiversSubscriptionPerNode) {
            /* prettier-ignore */ console.log( `There are already ${config.p2p.maxArchiversSubscriptionPerNode} archivers connected for data transfer!` )
            return false
          }

          // we're the genesis node, this mean cycle is empty, archiver list is empty
          // nothing to check against.
          // In practice genesis node is accompanied with a genesis archiver by the same party at launch
          // so this is ok.
          if (Self && Self.isFirst) return true

          // specifically this map here to get archiver list is chose because the map is populated by cycle parsing.
          // The one like `recipients` map is weaker because they're populated at joinReq
          const archiver = Archivers.archivers.get(archiverCreds.publicKey)

          // bypass this check when this is genesis node
          if (!archiver) {
            mainLogger.error(`❌ Remote Archiver @ ${archiver.publicKey} is NOT recognized!`)
            return false
          }

          // The ip check is known to have issues with NATs and other network setups.
          // And we've encountered issues with it in the earthnet
          // Plus the archiver is already authenticated by the signature.
          // Singature valid and ip are not in sync? then we got a bigger problem to worry about.
          // if (archiverIP !== archiver.ip) {
          //   mainLogger.error(`❌ PubKey & IP mismatch for Archiver @ ${archiverIP} !`)
          //   mainLogger.error('Recipient: ', archiver.ip)
          //   mainLogger.error('Remote Archiver: ', socket.handshake.address)
          //   return false
          // }

          return true
        } catch (error) {
          mainLogger.error('❌ Error in Archiver Socket-Connection Auth!')
          mainLogger.error(error)
          return false
        }
      }

      this.io.on('connection', (socket: any) => {
        if (!validateSocketHandshake(socket, this.crypto, this.mainLogger)) {
          socket.disconnect()
          return
        }

        const { publicKey: archiverPublicKey } = JSON.parse(socket.handshake.query.data)

        console.log(`✅ Archive server has subscribed to this node with Socket-ID ${socket.id}!`)
        console.log('Archiver has registered its public key', archiverPublicKey)

        // prototype pollution mitigation
        // best case is to use the Map<>
        // going with local fix atm. Deep copy, freeze. read-only.
        let freezedList = Object.freeze(JSON.parse(JSON.stringify(Archivers.connectedSockets)))

        // The same archiver is connected with different stream, let's disconnect old and accept the current one.
        if (freezedList[archiverPublicKey]) {
          Archivers.removeArchiverConnection(archiverPublicKey)
        }

        Archivers.addArchiverConnection(archiverPublicKey, socket.id)
        socket.on('UNSUBSCRIBE', function (ARCHIVER_PUBLIC_KEY) {
          if (freezedList[ARCHIVER_PUBLIC_KEY] === socket.id) {
            console.log(`Archive server with public key ${ARCHIVER_PUBLIC_KEY} has requested to Un-subscribe`)
            Archivers.removeArchiverConnection(ARCHIVER_PUBLIC_KEY)
          }
        })
      })
    } catch (e) {
      this.mainLogger.error('Socket connection break', e)
    }
    this.network.on('timeout', (node, requestId: string, context: string, route: string) => {
      const ipPort = `${node.internalIp}:${node.internalPort}`
      //this console log is probably redundant but are disabled most of the time anyhow.
      //They may help slighly in the case of adding some context to the out.log file when full debugging is on.
      /* prettier-ignore */ if (logFlags.p2pNonFatal) console.log(`In Shardus got network timeout-${context}-${route} for request ID - ${requestId} from node: ${utils.logNode(node)} ${ipPort}` )
      const result = isApopMarkedNode(node.id)
      if (result) {
        /* prettier-ignore */ nestedCountersInstance.countEvent('lostNodes', `timeout-apop-${context}-${route}`)
        return
      }
      if (!config.debug.disableLostNodeReports) scheduleLostReport(node, 'timeout', requestId)
      /** [TODO] Report lost */
      /* prettier-ignore */ if (logFlags.p2pNonFatal) nestedCountersInstance.countEvent('lostNodes', `timeout-${context}`)
      // context has been added to provide info on the type of timeout and where it happened
      /* prettier-ignore */ if (logFlags.p2pNonFatal) nestedCountersInstance.countRareEvent( 'lostNodes', `timeout-${context}  ${ipPort}` )
      if (this.network.statisticsInstance) this.network.statisticsInstance.incrementCounter('lostNodeTimeout')
    })
    this.network.on(
      'error',
      (node, requestId: string, context: string, errorGroup: string, route: string, subRoute = '') => {
        const ipPort = `${node.internalIp}:${node.internalPort}`
        //this console log is probably redundant but are disabled most of the time anyhow.
        //They may help slighly in the case of adding some context to the out.log file when full debugging is on.
        /* prettier-ignore */ if (logFlags.p2pNonFatal) console.log(`In Shardus got network error-${context} ${route}-${subRoute} for request ID ${requestId} from node: ${utils.logNode(node)} ${ipPort} error:${errorGroup}` )
        /* prettier-ignore */ if (logFlags.p2pNonFatal) console.log(`node:`, node)
        /* prettier-ignore */ if (logFlags.p2pNonFatal) console.log(`requestId: ${requestId}, context: ${context}, route: ${route}, subRoute: ${subRoute}, errorGroup: ${errorGroup}`)
        if (!config.debug.disableLostNodeReports) scheduleLostReport(node, 'error', requestId)
        /** [TODO] Report lost */
        /* prettier-ignore */ nestedCountersInstance.countEvent('lostNodes', `error-${context}-${route}-${subRoute}`)
        /* prettier-ignore */ nestedCountersInstance.countRareEvent( 'lostNodes', `error-${context}  ${ipPort}` )
      }
    )

    // Setup other modules
    this.debug = new Debug(this.config.baseDir, this.network)
    this.debug.addToArchive(this.logger.logDir, './logs')
    this.debug.addToArchive(path.parse(this.storage.storage.storageConfig.options.storage).dir, './db')

    if (!isServiceMode()) {
      this.statistics = new Statistics(
        this.config.baseDir,
        this.config.statistics,
        {
          counters: [
            'txInjected',
            'txApplied',
            'txRejected',
            'txExpired',
            'txProcessed',
            'networkTimeout',
            'lostNodeTimeout',
          ],
          watchers: {
            queueLength: () => (this.stateManager ? this.stateManager.transactionQueue._transactionQueue.length : 0),
            executeQueueLength: () =>
              this.stateManager ? this.stateManager.transactionQueue.getExecuteQueueLength() : 0,
            serverLoad: () => (this.loadDetection ? this.loadDetection.getCurrentLoad() : 0),
          },
          timers: ['txTimeInQueue'],
          manualStats: ['netInternalDuty', 'netExternalDuty'],
          fifoStats: ['cpuPercent'],
          ringOverrides: {},
          fifoOverrides: { cpuPercent: 240 },
        },
        this
      )
    }
    this.debug.addToArchive('./statistics.tsv', './statistics.tsv')

    this.profiler.setStatisticsInstance(this.statistics)
    this.network.setStatisticsInstance(this.statistics)

    this.statistics

    this.loadDetection = new LoadDetection(this.config.loadDetection, this.statistics)
    this.loadDetection.on('highLoad', () => {
      // console.log(`High load detected Cycle ${currentCycle}, Quarter: ${currentQuarter}`)
      nestedCountersInstance.countEvent('loadRelated', 'highLoad')
      AutoScaling.requestNetworkUpsize()
    })
    this.loadDetection.on('lowLoad', () => {
      // console.log(`Low load detected Cycle ${currentCycle}, Quarter: ${currentQuarter}`)
      nestedCountersInstance.countEvent('loadRelated', 'lowLoad')
      AutoScaling.requestNetworkDownsize()
    })

    if (!isServiceMode()) this.statistics.on('snapshot', () => this.loadDetection.updateLoad())

    this.rateLimiting = new RateLimiting(this.config.rateLimiting, this.seqLogger)

    Context.setShardusContext(this)

    // Init new P2P
    Self.init()

    if (this.app) {
      this._createAndLinkStateManager()
      this._attemptCreateAppliedListener()

      let disableSnapshots = !!(this.config && this.config.debug && this.config.debug.disableSnapshots === true)
      if (disableSnapshots != true) {
        // Start state snapshotting once you go active with an app
        this.once('active', Snapshot.startSnapshotting)
      }
    }

    this.reporter =
      this.config.reporting.report && !isServiceMode()
        ? new Reporter(
            this.config.reporting,
            this.logger,
            this.statistics,
            this.stateManager,
            this.profiler,
            this.loadDetection
          )
        : null
    Context.setReporterContext(this.reporter)

    this._registerRoutes()

    // this.io.on('disconnect')

    // Register listeners for P2P events
    Self.emitter.on('witnessing', async (publicKey) => {
      this.logger.playbackLogState('witnessing', '', publicKey)
      await Snapshot.startWitnessMode()
    })
    Self.emitter.on('joining', (publicKey) => {
      // this.io.emit('DATA', `NODE JOINING ${publicKey}`)
      this.logger.playbackLogState('joining', '', publicKey)
      if (this.reporter) this.reporter.reportJoining(publicKey)
    })
    Self.emitter.on('joined', (nodeId, publicKey) => {
      // this.io.emit('DATA', `NODE JOINED ${nodeId}`)
      this.logger.playbackLogState('joined', nodeId, publicKey)
      this.logger.setPlaybackID(nodeId)
      if (this.reporter) this.reporter.reportJoined(nodeId, publicKey)
    })
    Self.emitter.on('initialized', async () => {
      // If network is in safety mode
      const newest = CycleChain.getNewest()
      // changed from using safetyMode to mode
      if (newest && (newest.mode === 'restart' || newest.mode === 'recovery')) {
        // Stay in syncing mode and let other nodes join
        Self.setp2pIgnoreJoinRequests(false)
        console.log('p2pIgnoreJoinRequests = false')
        nestedCountersInstance.countEvent('restore', `intialized: ${newest.mode}. ${shardusGetTime()}`)
      } else {
        // not doing a safety sync
        // todo hook this up later cant deal with it now.
        // await this.storage.deleteOldDBPath()

        /* // LOCAL_OOS_TEST_SUPPORT  not for production
          this.mainLogger.info('sync-p2p synced waiting 4 min')
          await utils.sleep(240000) //do not release this helps us have a chance
          //to query /config before the node syncs data
        */
        this.mainLogger.info('sync-syncAppData')
        await this.syncAppData()
      }
    })
    Self.emitter.on('restore', async (cycleNumber: number) => {
      console.log('restore mode triggered on cycle', cycleNumber)
      this.logger.playbackLogState('restore', '', `Restore mode triggered on cycle ${cycleNumber}`)

      nestedCountersInstance.countEvent(
        'restore',
        `restore event: entered. seen on cycle:${cycleNumber} ${shardusGetTime()}`
      )
      await this.stateManager.waitForShardCalcs()
      nestedCountersInstance.countEvent('restore', `restore event: got shard calcs. ${shardusGetTime()}`)
      // Start restoring state data
      try {
        this.stateManager.renewState()
        await this.stateManager.accountSync.initialSyncMain(3)
        console.log('restore - initialSyncMain finished')
        nestedCountersInstance.countEvent('restore', `restore event: syncAppData finished. ${shardusGetTime()}`)
      } catch (err) {
        console.log()
        this.fatalLogger.fatal('restore-failed with Error: ' + utils.formatErrorMessage(err))
        nestedCountersInstance.countEvent('restore', `restore event: fail and apop self. ${shardusGetTime()}`)
        apoptosizeSelf(`restore-failed: ${err?.message}`, 'Node stopped due to network restore failure.')
        return
      }

      // After restoring state data, set syncing flags to true and go active
      await this.stateManager.startCatchUpQueue()
      console.log('restore - startCatchUpQueue')
      nestedCountersInstance.countEvent('restore', `restore event: finished startCatchUpQueue. ${shardusGetTime()}`)
      await this.app.sync()
      console.log('syncAppData - sync')

      await queueFinishedSyncingRequest()
      console.log('syncAppData - queueFinishedSyncingRequest')
      nestedCountersInstance.countEvent('restore', `restore event: queue finished-syncing-request ${shardusGetTime()}`)

      this.stateManager.appFinishedSyncing = true
      this.stateManager.startProcessingCycleSummaries()
    })
    Self.emitter.on('active', (nodeId) => {
      // this.io.emit('DATA', `NODE ACTIVE ${nodeId}`)
      this.logger.playbackLogState('active', nodeId, '')
      if (this.reporter) {
        this.reporter.reportActive(nodeId)
        this.reporter.startReporting()
      }
      if (this.statistics) this.statistics.startSnapshots()
      this.emit('active', nodeId)
    })
    Self.emitter.on('failed', () => {
      this.mainLogger.info('shutdown: on failed event')
      this.shutdown(true)
    })
    Self.emitter.on('error', (e) => {
      console.log(e.message + ' at ' + e.stack)
      if (logFlags.debug) this.mainLogger.debug('shardus.start() ' + e.message + ' at ' + e.stack)
      // normally fatal error keys should not be variable ut this seems like an ok exception for now
      this.shardus_fatal(`onError_ex` + e.message + ' at ' + e.stack, 'shardus.start() ' + e.message + ' at ' + e.stack)
      throw new Error(e)
    })
    Self.emitter.on('removed', async () => {
      // Omar - Why are we trying to call the functions in modules directly before exiting.
      //        The modules have already registered shutdown functions with the exitHandler.
      //        We should let exitHandler handle the shutdown process.
      /*
      if (this.statistics) {
        this.statistics.stopSnapshots()
        this.statistics.initialize()
      }
      if (this.reporter) {
        this.reporter.stopReporting()
        await this.reporter.reportRemoved(Self.id)
      }
      if (this.app) {
        this.app.deleteLocalAccountData()
        this._attemptRemoveAppliedListener()
        this._unlinkStateManager()
        await this.stateManager.cleanup()
      }

      // Shutdown cleanly
      process.exit()
*/
      this.mainLogger.info(`exitCleanly: removed`)
      if (this.reporter) {
        this.reporter.stopReporting()
        await this.reporter.reportRemoved(Self.id)
      }
      this.exitHandler.exitCleanly(`removed`, `removed from network in normal conditions`) // exits with status 0 so that PM2 can restart the process
    })
    Self.emitter.on('app-removed', async () => {
      this.mainLogger.info(`exitCleanly: app removed`)
      if (this.reporter) {
        this.reporter.stopReporting()
        await this.reporter.reportRemoved(Self.id)
      }
      this.exitHandler.exitCleanly(`removed`, `removed from network requested by app`) // exits with status 0 so that
    })
    Self.emitter.on('invoke-exit', async (tag: string, callstack: string, message: string, restart: boolean) => {
      // Omar - Why are we trying to call the functions in modules directly before exiting.
      //        The modules have already registered shutdown functions with the exitHandler.
      //        We should let exitHandler handle the shutdown process.
      /*
      this.fatalLogger.fatal('Shardus: caught apoptosized event; cleaning up')
      if (this.statistics) {
        this.statistics.stopSnapshots()
        this.statistics.initialize()
      }
      if (this.reporter) {
        this.reporter.stopReporting()
        await this.reporter.reportRemoved(Self.id)
      }
      if (this.app) {
        this.app.deleteLocalAccountData()
        this._attemptRemoveAppliedListener()
        this._unlinkStateManager()
        await this.stateManager.cleanup()
      }
      this.fatalLogger.fatal(
        'Shardus: caught apoptosized event; finished clean up'
      )
*/
      const exitType = restart ? 'exitCleanly' : 'exitUncleanly'
      nestedCountersInstance.countRareEvent('fatal', `invoke-exit: ${tag} ${exitType}`)
      this.mainLogger.error(`invoke-exit: ${tag} ${exitType}`)
      this.mainLogger.error(message)
      this.mainLogger.error(callstack)
      if (this.reporter) {
        this.reporter.stopReporting()
        await this.reporter.reportRemoved(Self.id)
      }
      if (restart)
        this.exitHandler.exitCleanly(`invoke-exit: ${tag}`, `invoke-exit: ${tag}. but exiting cleanly for a restart`)
      // exits with status 0 so that PM2 can restart the process
      else this.exitHandler.exitUncleanly(`invoke-exit: ${tag}`, `invoke-exit: ${tag} ${exitType}`) // exits with status 1 so that PM2 CANNOT restart the process
    })
    Self.emitter.on('node-activated', async ({ ...params }) => {
      if (networkMode === 'shutdown') return
      try {
        const result: any = this.app.eventNotify?.({ type: 'node-activated', ...params })
        if (result instanceof Promise) {
          await result
        }
      } catch (e) {
        this.mainLogger.error(`Error: while processing node-activated event stack: ${utils.formatErrorMessage(e)}`)
      }
    })
    Self.emitter.on('node-deactivated', async ({ ...params }) => {
      if (networkMode === 'shutdown') return
      try {
        const result: any = this.app.eventNotify?.({ type: 'node-deactivated', ...params })
        if (result instanceof Promise) {
          await result
        }
      } catch (e) {
        this.mainLogger.error(`Error: while processing node-deactivated event stack: ${utils.formatErrorMessage(e)}`)
      }
    })
    Self.emitter.on('node-refuted', async ({ ...params }) => {
      try {
        if (!this.stateManager.currentCycleShardData) throw new Error('No current cycle data')
        if (params.publicKey == null) throw new Error('No node publicKey provided for node-refuted event')
        const consensusNodes = this.getConsenusGroupForAccount(params.publicKey)
        for (let node of consensusNodes) {
          if (node.id === Self.id) {
            const result: any = this.app.eventNotify?.({ type: 'node-refuted', ...params })
            if (result instanceof Promise) {
              await result
            }
          }
        }
      } catch (e) {
        this.mainLogger.error(`Error: while processing node-refuted event stack: ${utils.formatErrorMessage(e)}`)
      }
    })
    Self.emitter.on('node-left-early', async ({ ...params }) => {
      try {
        if (!this.stateManager.currentCycleShardData) throw new Error('No current cycle data')
        if (params.publicKey == null) throw new Error('No node publicKey provided for node-left-early event')
        const consensusNodes = this.getConsenusGroupForAccount(params.publicKey)
        for (let node of consensusNodes) {
          if (node.id === Self.id) {
            const result: any = this.app.eventNotify?.({ type: 'node-left-early', ...params })
            if (result instanceof Promise) {
              await result
            }
          }
        }
      } catch (e) {
        this.mainLogger.error(`Error: while processing node-left-early event stack: ${utils.formatErrorMessage(e)}`)
      }
    })
    Self.emitter.on('node-sync-timeout', async ({ ...params }) => {
      try {
        if (!this.stateManager.currentCycleShardData) throw new Error('No current cycle data')
        if (params.publicKey == null) throw new Error('No node publicKey provided for node-sync-timeout event')
        const consensusNodes = this.getConsenusGroupForAccount(params.publicKey)
        for (let node of consensusNodes) {
          if (node.id === Self.id) {
            const result: any = this.app.eventNotify?.({ type: 'node-sync-timeout', ...params })
            if (result instanceof Promise) {
              await result
            }
            break
          }
        }
      } catch (e) {
        this.mainLogger.error(`Error: while processing node-sync-timeout event stack: ${utils.formatErrorMessage(e)}`)
      }
    })
    Self.emitter.on('try-network-transaction', async ({ ...params }) => {
      try {
        const result: any = this.app.eventNotify?.({ type: 'try-network-transaction', ...params })
        if (result instanceof Promise) {
          await result
        }
      } catch (e) {
        this.mainLogger.error(
          `Error: while processing try-network-transaction event stack: ${utils.formatErrorMessage(e)}`
        )
      }
    })

    // Start P2P
    await Self.startupV2(this)

    // handle config queue changes and debug logic updates
    this._registerListener(this.p2p.state, 'cycle_q1_start', async () => {
      let lastCycle = CycleChain.getNewest()

      if (lastCycle === null) {
        return
      }

      // need to make sure sync is finish or we may not have the global account
      // even worse, the dapp may not have initialized storage yet
      if (this.stateManager.appFinishedSyncing === true) {
        //query network account from the app for changes
        const account = await this.app.getNetworkAccount()

        this.updateConfigChangeQueue(account, lastCycle.counter, true)
      }

      this.updateDebug(lastCycle)
    })

    //setup debug endpoints
    this.setupDebugEndpoints()
  }
}
