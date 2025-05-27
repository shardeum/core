import { NodeStatus, Route } from '@shardeum-foundation/lib-types/build/src/p2p/P2PTypes'
import { RemoveCertificate } from '@shardeum-foundation/lib-types/build/src/p2p/LostTypes'
import { EventEmitter } from 'events'
import { Handler } from 'express'
import Log4js from 'log4js'
import path from 'path'
import { inspect } from 'util'
import SHARDUS_CONFIG from '../config'
import Crypto from '../crypto'
import Debug, {
  getDevPublicKeys,
  getDevPublicKey,
  getDevPublicKeyMaxLevel,
  ensureKeySecurity,
  getMultisigPublicKeys,
  getMultisigPublicKey,
  ensureMultisigKeySecurity,
} from '../debug'
import ExitHandler from '../exit-handler'
import LoadDetection from '../load-detection'
import Logger, { logFlags, LogFlags } from '../logger'
import * as Network from '../network'
import {
  isDebugModeMiddleware,
  isDebugModeMiddlewareHigh,
  isDebugModeMiddlewareLow,
  isDebugModeMiddlewareMedium,
  isDebugModeMiddlewareMultiSig,
} from '../network/debugMiddleware'
import { apoptosizeSelf, isApopMarkedNode } from '../p2p/Apoptosis'
import * as Archivers from '../p2p/Archivers'
import * as Context from '../p2p/Context'
import { config } from '../p2p/Context'
import * as AutoScaling from '../p2p/CycleAutoScale'
import * as CycleChain from '../p2p/CycleChain'
import * as CycleCreator from '../p2p/CycleCreator'
import { netConfig } from '../p2p/CycleCreator'
import * as GlobalAccounts from '../p2p/GlobalAccounts'
import * as ServiceQueue from '../p2p/ServiceQueue'
import { scheduleLostReport, removeNodeWithCertificiate } from '../p2p/Lost'
import { activeIdToPartition, activeByIdOrder, getAgeIndexForNodeId, nodes } from '../p2p/NodeList'
import * as Self from '../p2p/Self'
import * as Wrapper from '../p2p/Wrapper'
import RateLimiting from '../rate-limiting'
import Reporter from '../reporter'
import * as ShardusTypes from '../shardus/shardus-types'
import { AppObjEnum, DevSecurityLevel, OpaqueTransaction, WrappedData } from '../shardus/shardus-types'
import * as Snapshot from '../snapshot'
import StateManager from '../state-manager'
import { CachedAppData, NonceQueueItem, QueueCountsResult } from '../state-manager/state-manager-types'
import { DebugComplete } from '../state-manager/TransactionQueue'
import Statistics from '../statistics'
import Storage from '../storage'
import { initAjvSchemas, verifyPayload } from '../types/ajv/Helpers'
import * as utils from '../utils'
import { fastIsPicked, groupResolvePromises, inRangeOfCurrentTime, isValidShardusAddress } from '../utils'
import { getSocketReport } from '../utils/debugUtils'
import MemoryReporting from '../utils/memoryReporting'
import NestedCounters, { nestedCountersInstance } from '../utils/nestedCounters'
import { routesMethods } from './routes'
import { startMethods } from './launch'
import { syncMethods } from './sync'
import { transactionMethods } from './transaction'
import Profiler, { profilerInstance } from '../utils/profiler'
import { startSaving } from './saveConsoleOutput'
import { isDebugMode, isServiceMode } from '../debug'
import * as JoinV2 from '../p2p/Join/v2'
import { getNetworkTimeOffset, shardusGetTime, calculateFakeTimeOffset, clearFakeTimeOffset } from '../network'
import { JoinRequest } from '@shardeum-foundation/lib-types/build/src/p2p/JoinTypes'
import { networkMode, isInternalTxAllowed } from '../p2p/Modes'
import { lostArchiversMap } from '../p2p/LostArchivers/state'
import getCallstack from '../utils/getCallstack'
import * as crypto from '@shardeum-foundation/lib-crypto-utils'
import * as Comms from './../p2p/Comms'
import { isFirst, waitForQ1SendRequests } from '../p2p/Self'
import { currentQuarter } from '../p2p/CycleCreator'
import { InternalBinaryHandler } from '../types/Handler'
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum'
import { RequestErrorEnum } from '../types/enum/RequestErrorEnum'
import { getStreamWithTypeCheck, requestErrorHandler } from '../types/Helpers'
import { TypeIdentifierEnum } from '../types/enum/TypeIdentifierEnum'
import { SignAppDataReq, deserializeSignAppDataReq, serializeSignAppDataReq } from '../types/SignAppDataReq'
import { SignAppDataResp, deserializeSignAppDataResp, serializeSignAppDataResp } from '../types/SignAppDataResp'
import { Utils } from '@shardeum-foundation/lib-types'
import { getOurNodeIndex, isNodeInRotationBounds } from '../p2p/Utils'
import ShardFunctions from '../state-manager/shardFunctions'
import SocketIO from 'socket.io'
import { nodeListFromStates, queueFinishedSyncingRequest } from '../p2p/Join'
import * as NodeList from '../p2p/NodeList'
import { P2P } from '@shardeum-foundation/lib-types'
import * as csvPerfEvents from './../logger/csvPerfEvents'
import { AJVSchemaEnum } from '../types/enum/AJVSchemaEnum'

// the following can be removed now since we are not using the old p2p code
//const P2P = require('../p2p')
const allZeroes64 = '0'.repeat(64)

const defaultConfigs: ShardusTypes.StrictShardusConfiguration = SHARDUS_CONFIG

export let logDir_global

Context.setDefaultConfigs(defaultConfigs)

type RouteHandlerRegister = (route: string, authHandler: Handler, responseHandler?: Handler) => void

//todo make this a config parameter set by the dapp
const changeListGlobalAccount = defaultConfigs.server.globalAccount

interface Shardus {
  io: SocketIO.Server
  profiler: Profiler
  nestedCounters: NestedCounters
  memoryReporting: MemoryReporting
  config: ShardusTypes.StrictServerConfiguration

  logger: Logger
  mainLogger: Log4js.Logger
  seqLogger: Log4js.Logger
  fatalLogger: Log4js.Logger
  appLogger: Log4js.Logger
  exitHandler: any
  storage: Storage
  crypto: Crypto
  network: Network.NetworkClass
  p2p: Wrapper.P2P
  debug: Debug
  appProvided: boolean
  app: ShardusTypes.App
  reporter: Reporter
  stateManager: StateManager
  statistics: Statistics
  loadDetection: LoadDetection
  rateLimiting: RateLimiting
  heartbeatInterval: number
  heartbeatTimer: NodeJS.Timeout
  registerExternalGet: RouteHandlerRegister
  registerExternalPost: RouteHandlerRegister
  registerExternalPut: RouteHandlerRegister
  registerExternalDelete: RouteHandlerRegister
  registerExternalPatch: RouteHandlerRegister
  serviceQueue: {
    registerBeforeAddVerifier: typeof ServiceQueue.registerBeforeAddVerifier
    registerApplyVerifier: typeof ServiceQueue.registerApplyVerifier
    registerShutdownHandler: typeof ServiceQueue.registerShutdownHandler
    containsTxData: typeof ServiceQueue.containsTxData
    containsTx: typeof ServiceQueue.containsTx
    addNetworkTx: typeof ServiceQueue.addNetworkTx
    getLatestNetworkTxEntryForSubqueueKey: typeof ServiceQueue.getLatestNetworkTxEntryForSubqueueKey
  }
  _listeners: any
  appliedConfigChanges: Set<string>

  debugForeverLoopCounter: number
  debugForeverLoopsEnabled: boolean
}

/**
 * The main module that is used by the app developer to interact with the shardus api
 */
class Shardus extends EventEmitter {
  // Methods from split files
  _registerRoutes: () => void
  start: () => Promise<void>
  syncAppData: () => Promise<void>
  put: (tx: ShardusTypes.OpaqueTransaction | ShardusTypes.ReinjectedOpaqueTransaction, set?: boolean, global?: boolean, inputAppData?: any) => Promise<{ success: boolean; reason: string; status: number; txId?: string }>
  forwardTransactionToLuckyNodes: (senderAddress: string, tx: ShardusTypes.OpaqueTransaction, txId: string, message?: string, context?: string) => Promise<unknown>
  _timestampAndQueueTransaction: (tx: ShardusTypes.OpaqueTransaction, appData: any, global?: boolean, noConsensus?: boolean, loggingContext?: string) => Promise<{ success: boolean; reason: string; status: number; txId?: string }>

  constructor({ server: config, logs: logsConfig, storage: storageConfig }: ShardusTypes.StrictShardusConfiguration) {
    super()
    this.debugForeverLoopsEnabled = true
    this.debugForeverLoopCounter = 0
    this.nestedCounters = nestedCountersInstance
    this.memoryReporting = new MemoryReporting(this)
    this.config = config
    Context.setConfig(this.config)
    this.profiler = new Profiler()
    logFlags.verbose = false

    let startInFatalsLogMode = config && config.debug && config.debug.startInFatalsLogMode ? true : false
    let startInErrorsLogMode = config && config.debug && config.debug.startInErrorLogMode ? true : false

    let dynamicLogMode = ''
    if (startInFatalsLogMode === true) {
      dynamicLogMode = 'fatal'
    } else if (startInErrorsLogMode === true) {
      dynamicLogMode = 'error'
    }

    initAjvSchemas()
    this.logger = new Logger(config.baseDir, logsConfig, dynamicLogMode)
    Context.setLoggerContext(this.logger)
    Snapshot.initLogger()

    const logDir = path.join(config.baseDir, logsConfig.dir)
    logDir_global = logDir
    if (logsConfig.saveConsoleOutput) {
      startSaving(logDir)
    }

    this.mainLogger = this.logger.getLogger('main')
    this.seqLogger = this.logger.getLogger('seq')
    this.fatalLogger = this.logger.getLogger('fatal')
    this.appLogger = this.logger.getLogger('app')
    this.exitHandler = new ExitHandler(logDir, this.memoryReporting, this.nestedCounters)
    this.storage = new Storage(config.baseDir, storageConfig, config, this.logger, this.profiler)
    Context.setStorageContext(this.storage)
    this.crypto = new Crypto(config.baseDir, this.config, this.logger, this.storage)
    Context.setCryptoContext(this.crypto)
    this.network = new Network.NetworkClass(config, this.logger)
    Context.setNetworkContext(this.network)

    // Set the old P2P to a Wrapper into the new P2P
    // [TODO] Remove this once everything calls p2p/* modules directly
    this.p2p = Wrapper.p2p
    Context.setP2pContext(this.p2p)

    this.debug = null
    this.appProvided = null
    this.app = null
    this.reporter = null
    this.stateManager = null
    this.statistics = null
    this.loadDetection = null
    this.rateLimiting = null

    this.appliedConfigChanges = new Set()

    if (logFlags.info) {
      this.mainLogger.info(`Server started with pid: ${process.pid}`)
      this.mainLogger.info('===== Server config: =====')
      this.mainLogger.info(JSON.stringify(config, null, 2))
    }

    // error log and console log on unacceptable minNodesToAllowTxs value
    // if (this.config.p2p.minNodesToAllowTxs < 20) {
    //   const minNodesToAllowTxs = this.config.p2p.minNodesToAllowTxs
    //   // debug mode and detected non-ideal value
    //   console.log(
    //     '[X] Minimum node required to allow transaction is set to a number less than 20 which is not ideal and secure for production'
    //   )
    //   if (this.config.mode === 'debug' && logFlags.error) {
    //     this.mainLogger.error(
    //       `Unacceptable \`minNodesToAllowTxs\` value detected: ${minNodesToAllowTxs} (< 20)`
    //     )
    //   }
    //   // production mode and detected non-ideal value
    //   else if (this.config.mode !== 'debug' && logFlags.error) {
    //     this.mainLogger.error(
    //       `Unacceptable \`minNodesToAllowTxs\` value detected: ${minNodesToAllowTxs} (< 20)`
    //     )
    //   }
    //   // for now they'd have the same error log
    //   // this is not as error per technical definition rather logical error
    // }

    this._listeners = {}

    this.heartbeatInterval = config.heartbeatInterval
    this.heartbeatTimer = null

    // alias the network register calls so that an app can get to them
    this.registerExternalGet = (route, authHandler, handler) =>
      this.network.registerExternalGet(route, authHandler, handler)
    this.registerExternalPost = (route, authHandler, handler) =>
      this.network.registerExternalPost(route, authHandler, handler)
    this.registerExternalPut = (route, authHandler, handler) =>
      this.network.registerExternalPut(route, authHandler, handler)
    this.registerExternalDelete = (route, authHandler, handler) =>
      this.network.registerExternalDelete(route, authHandler, handler)
    this.registerExternalPatch = (route, authHandler, handler) =>
      this.network.registerExternalPatch(route, authHandler, handler)

    // serviceQueue module
    this.serviceQueue = {
      registerBeforeAddVerifier: ServiceQueue.registerBeforeAddVerifier,
      registerApplyVerifier: ServiceQueue.registerApplyVerifier,
      registerShutdownHandler: ServiceQueue.registerShutdownHandler,
      containsTxData: ServiceQueue.containsTxData,
      containsTx: ServiceQueue.containsTx,
      addNetworkTx: ServiceQueue.addNetworkTx,
      getLatestNetworkTxEntryForSubqueueKey: ServiceQueue.getLatestNetworkTxEntryForSubqueueKey,
    }

    // Bind methods from split files
    Object.assign(Shardus.prototype, routesMethods)
    Object.assign(Shardus.prototype, startMethods)
    Object.assign(Shardus.prototype, syncMethods)
    Object.assign(Shardus.prototype, transactionMethods)

    this.exitHandler.addSigListeners()
    this.exitHandler.registerSync('reporter', () => {
      if (this.reporter) {
        this.mainLogger.info('Stopping reporter...')
        this.reporter.stopReporting()
      }
    })
    this.exitHandler.registerAsync('application', async () => {
      if (this.app && this.app.close) {
        this.mainLogger.info('Shutting down the application...')
        await this.app.close() // this needs to be awaited since it is async
      }
    })
    this.exitHandler.registerSync('crypto', () => {
      this.mainLogger.info('Stopping POW generators...')
      this.crypto.stopAllGenerators()
    })
    this.exitHandler.registerSync('cycleCreator', () => {
      // [TODO] - need to make an exitHandler for P2P; otherwise CycleCreator is continuing even after rest of the system cleans up and is ready to exit
      this.mainLogger.info('Shutting down p2p...')
      this.p2p.shutdown()
    })
    this.exitHandler.registerAsync('network', async () => {
      this.mainLogger.info('Shutting down networking...')
      await this.network.shutdown() // this is taking a long time
    })
    this.exitHandler.registerAsync('storage', async () => {
      this.mainLogger.info('Closing Database connections...')
      await this.storage.close()
    })
    this.exitHandler.registerAsync('unjoin', async () => {
      if (networkMode !== 'shutdown') {
        this.mainLogger.info('Submitting unjoin request...')
        await JoinV2.shutdown()
      }
    })
    /* moved stopping the application to earlier
    this.exitHandler.registerAsync('application', async () => {
      if (this.app && this.app.close) {
        this.mainLogger.info('Shutting down the application...')
        await this.app.close()  // this needs to be awaited since it is async
      }
    })
    */
    this.exitHandler.registerAsync('logger', async () => {
      this.mainLogger.info('Shutting down logs...')
      await this.logger.shutdown()
      csvPerfEvents.writeBufferToCSV()
    })

    this.profiler.registerEndpoints()
    this.nestedCounters.registerEndpoints()
    this.memoryReporting.registerEndpoints()
    this.logger.registerEndpoints(Context)

    this.logger.playbackLogState('constructed', '', '')
  }

  /**
   * This function is what the app developer uses to setup all the SDK functions used by shardus
   * @typedef {import('./index').App} App
   */
  setup(app: ShardusTypes.App) {
    if (app === null) {
      this.appProvided = false
    } else if (app === Object(app)) {
      this.app = this._getApplicationInterface(app)
      this.appProvided = true
      this.logger.playbackLogState('appProvided', '', '')
    } else {
      throw new Error('Please provide an App object or null to Shardus.setup.')
    }
    return this
  }


  /**
   * This function designed to help fetch the network account and
   * call updateConfigChangeQueue before our node has finished syncing
   * This is needed as a node will be sensitive to config changes
   * happening around the time it is syncing
   * @param {*} account
   * @param {*} lastCycle
   */
  async earlyConfigFetchAndPatch(lastCycle_counter: number) {
    if (this.config.p2p.patchNetworkAccountSyncFixes === false) {
      return
    }

    try {
      //this funciton is for getting the network account early (i.e. from archivers)
      const account = await this.app.getNetworkAccountFromArchiver()
      if (account == null) {
        nestedCountersInstance.countEvent('sync', 'earlyConfigFetchAndPatch is null')
        return
      } else {
        nestedCountersInstance.countEvent('sync', 'earlyConfigFetchAndPatch')
      }

      this.updateConfigChangeQueue(account, lastCycle_counter, false)
    } catch (e) {
      nestedCountersInstance.countEvent('sync', 'earlyConfigFetchAndPatch failed: ' + e?.message)
    }
  }

  /**
   * Function used to register event listeners
   * @param {*} emitter Socket emitter to be called
   * @param {*} event Event name to be registered
   * @param {*} callback Callback function to be executed on event
   */
  _registerListener(emitter, event, callback) {
    if (this._listeners[event]) {
      this.shardus_fatal(`_registerListener_dupe`, 'Shardus can only register one listener per event! EVENT: ', event)
      return
    }
    emitter.on(event, callback)
    this._listeners[event] = [emitter, callback]
  }

  /**
   * Function used to register event listeners
   * @param {*} event Name of the event to be unregistered
   */
  _unregisterListener(event) {
    if (!this._listeners[event]) {
      this.mainLogger.warn(`This event listener doesn't exist! Event: \`${event}\` in Shardus`)
      return
    }
    const entry = this._listeners[event]
    const [emitter, callback] = entry
    emitter.removeListener(event, callback)
    delete this._listeners[event]
  }

  /**
   * Function to unregister all event listeners
   */
  _cleanupListeners() {
    for (const event of Object.keys(this._listeners)) {
      this._unregisterListener(event)
    }
  }



  /**
   * Function used to register listeners for transaction related events
   */
  _attemptCreateAppliedListener() {
    if (!this.statistics || !this.stateManager) return
    this._registerListener(this.stateManager.eventEmitter, 'txQueued', (txId) =>
      this.statistics.startTimer('txTimeInQueue', txId)
    )
    this._registerListener(this.stateManager.eventEmitter, 'txPopped', (txId) =>
      this.statistics.stopTimer('txTimeInQueue', txId)
    )
    this._registerListener(this.stateManager.eventEmitter, 'txApplied', () =>
      this.statistics.incrementCounter('txApplied')
    )
    this._registerListener(this.stateManager.eventEmitter, 'txProcessed', () =>
      this.statistics.incrementCounter('txProcessed')
    )
    this._registerListener(this.stateManager.eventEmitter, 'txExpired', () =>
      this.statistics.incrementCounter('txExpired')
    )
  }

  /**
   * Function to unregister all transaction related events
   */
  _attemptRemoveAppliedListener() {
    if (!this.statistics || !this.stateManager) return
    this._unregisterListener('txQueued')
    this._unregisterListener('txPopped')
    this._unregisterListener('txApplied')
    this._unregisterListener('txProcessed')
  }

  /**
   * function to unregister listener for the "accepted" event
   */
  _unlinkStateManager() {
    this._unregisterListener('accepted')
  }

  /**
   * Creates an instance of the StateManager module and registers the "accepted" event listener for queueing transactions
   */
  _createAndLinkStateManager() {
    this.stateManager = new StateManager(
      this.profiler,
      this.app,
      this.logger,
      this.storage,
      this.p2p,
      this.crypto,
      this.config,
      this
    )

    this.storage.stateManager = this.stateManager
    Context.setStateManagerContext(this.stateManager)
  }

  /**
   * Calls the "put" function with the "set" boolean parameter set to true
   * @param {*} tx The transaction data
   */
  set(tx: any) {
    return this.put(tx, true, false)
  }

  /**
   * Allows the application to log specific data to an app.log file
   * @param  {...any} data The data to be logged in app.log file
   */
  log(...data: any[]) {
    if (logFlags.debug) {
      this.appLogger.debug(new Date(), ...data)
    }
  }

  /**
   * Gets log flags.
   * use these for to cull out slow log lines with stringify
   * if you pass comma separated objects to dapp.log you do not need this.
   * Also good for controlling console logging
   */
  getLogFlags(): LogFlags {
    return logFlags
  }  

  /**
   * Returns the nodeId for this node
   */
  getNodeId() {
    return this.p2p.getNodeId()
  }

  /**
   * Returns node info given a node id
   * @param {*} id The nodeId of this node
   */
  getNode(id: string): ShardusTypes.Node | undefined {
    return this.p2p.state.getNode(id)
  }

  getRemovedNodePubKeyFromCache(id: string): ShardusTypes.Node['publicKey'] | undefined {
    return this.p2p.state.getRemovedNodePubKeyFromCache(id)
  }

  getNodeByPubKey(id: string): ShardusTypes.Node {
    return this.p2p.state.getNodeByPubKey(id)
  }

  getNodeRotationIndex(id: string): { idx: number; total: number } {
    return getAgeIndexForNodeId(id)
  }

  isNodeInRotationBounds(nodeId: string) {
    return isNodeInRotationBounds(nodeId)
  }

  isNodeActiveByPubKey(pubKey: string): boolean {
    const node = this.p2p.state.getNodeByPubKey(pubKey)
    if (node == null) {
      return false
    }
    if (node.status !== NodeStatus.ACTIVE) {
      return false
    }
    return true
  }

  isNodeReadyByPubKey(pubKey: string): boolean {
    const node = this.p2p.state.getNodeByPubKey(pubKey)
    if (node == null) {
      return false
    }
    if (node.status !== NodeStatus.READY) {
      return false
    }
    return true
  }

  isNodeSyncingByPubKey(pubKey: string): boolean {
    const node = this.p2p.state.getNodeByPubKey(pubKey)
    if (node == null) {
      return false
    }
    if (node.status !== NodeStatus.SYNCING) {
      return false
    }
    return true
  }

  isNodeSelectedByPubKey(pubKey: string): boolean {
    const node = this.p2p.state.getNodeByPubKey(pubKey)
    if (node == null) {
      return false
    }
    if (node.status !== NodeStatus.SELECTED) {
      return false
    }
    return true
  }

  isNodeActive(id: string): boolean {
    const node = this.p2p.state.getNode(id)
    if (node == null) {
      return false
    }
    if (node.status !== NodeStatus.ACTIVE) {
      return false
    }
    return true
  }

  /**
   * Returns an array of cycles in the cycleChain history starting from the current cycle
   * @param {*} amount The number cycles to fetch from the recent cycle history
   */
  getLatestCycles(amount = 1) {
    return this.p2p.getLatestCycles(amount)
  }

  /**
   * This function return number of active in the latest cycle.
   */
  getNumActiveNodes() {
    let lastCycle = CycleChain.getNewest()
    if (lastCycle == null) {
      nestedCountersInstance.countEvent('debug', 'getNumActiveNodes lastCycle == null')
      return 0
    }
    nestedCountersInstance.countEvent('debug', `getNumActiveNodes lastCycle.active: ${lastCycle.active}`)

    const latestCycle = this.p2p.getLatestCycles(1)[0]

    if (latestCycle == null) {
      nestedCountersInstance.countEvent('debug', 'getNumActiveNodes latestCycle == null')
      return 0
    }
    nestedCountersInstance.countEvent('debug', `getNumActiveNodes latestCycle.active: ${latestCycle.active}`)

    return latestCycle ? latestCycle.active : 0
  }

  fastIsPicked(numberToPick: number) {
    let numActiveNodes = NodeList.activeByIdOrder.length

    if (numActiveNodes < config.p2p.scaleGroupLimit) {
      return true
    }
    let offset = CycleChain.newest.counter //todo something more random
    const ourIndex = getOurNodeIndex()
    if (ourIndex == null) return false

    return fastIsPicked(ourIndex, numActiveNodes, numberToPick, offset)
  }

  /**
   *
   * @returns {ShardusTypes.Cycle['mode']} returns the current network mode
   */
  getNetworkMode(): ShardusTypes.Cycle['mode'] {
    return networkMode
  }

  /**
   * @typedef {import('../shardus/index.js').Node} Node
   */
  /**
   * getClosestNodes finds the closes nodes to a certain hash value
   * @param {string} hash any hash address (256bit 64 characters)
   * @param {number} count how many nodes to return
   * @param {boolean} selfExclude
   * @returns {string[]} returns a list of nodes ids that are closest. roughly in order of closeness
   */
  getClosestNodes(hash: string, count: number = 1, selfExclude: boolean = false): string[] {
    return this.stateManager.getClosestNodes(hash, count, selfExclude).map((node) => node.id)
  }

  checkCycleShardData(tag: string): boolean {
    return this.stateManager.checkCycleShardData(tag)
  }

  getClosestNodesGlobal(hash, count) {
    return this.stateManager.getClosestNodesGlobal(hash, count)
  }

  removeNodeWithCertificiate(cert: RemoveCertificate) {
    return removeNodeWithCertificiate(cert)
  }

  computeNodeRank(nodeId: string, txId: string, timestamp: number): bigint {
    return this.stateManager.transactionQueue.computeNodeRank(nodeId, txId, timestamp)
  }

  getShardusProfiler() {
    return profilerInstance
  }

  /** Get the time in MS a replacement for Date.Now().  If p2p.useNTPOffsets===true then adds the NPT offset  */
  shardusGetTime(): number {
    return shardusGetTime()
  }

  setDebugSetLastAppAwait(label: string, complete = DebugComplete.Incomplete) {
    this.stateManager?.transactionQueue.setDebugSetLastAppAwait(label, complete)
  }

  addNetworkTx = ServiceQueue.addNetworkTx
  getLatestNetworkTxEntryForSubqueueKey = ServiceQueue.getLatestNetworkTxEntryForSubqueueKey

  validateClosestActiveNodeSignatures(
    signedAppData: any,
    signs: ShardusTypes.Sign[],
    minRequired: number,
    nodesToSign: number,
    allowedBackupNodes: number
  ): { success: boolean; reason: string } {
    let appData = { ...signedAppData }
    if (appData.signs) delete appData.signs
    if (appData.sign) delete appData.sign
    const hash = crypto.hashObj(appData)
    const closestNodes = this.getClosestNodes(hash, nodesToSign + allowedBackupNodes)
    const closestNodesByPubKey = new Map()
    for (let i = 0; i < closestNodes.length; i++) {
      const node = this.p2p.state.getNode(closestNodes[i])
      if (node) {
        closestNodesByPubKey.set(node.publicKey, node)
      }
    }
    const validSigners = new Set<string>()
    for (let i = 0; i < signs.length; i++) {
      const sign = signs[i]
      const nodePublicKey = sign.owner
      appData.sign = sign // attach the node's sig for verification
      if (!closestNodesByPubKey.has(nodePublicKey)) {
        this.mainLogger.warn(`Node ${nodePublicKey} is not in the closest nodes list. Skipping`)
        continue
      }
      const node = closestNodesByPubKey.get(nodePublicKey)
      const isValid = this.crypto.verify(appData, nodePublicKey)
      if (node && isValid) {
        validSigners.add(nodePublicKey.toLowerCase())
      }
      // early break loop
      if (validSigners.size >= minRequired) {
        return {
          success: true,
          reason: `Validated by ${minRequired} valid nodes!`,
        }
      }
    }
    return {
      success: false,
      reason: `Fail to verify enough valid nodes signatures`,
    }
  }

  /**
   * isNodeInDistance
   * @param {string} hash any hash address (256bit 64 characters)
   * @param {string} nodeId id of a node
   * @param {number} distance how far away can this node be to the home node of the hash
   * @returns {boolean} is the node in the distance to the target
   */
  isNodeInDistance(hash: string, nodeId: string, distance: number) {
    //@ts-ignore
    return this.stateManager.isNodeInDistance(hash, nodeId, distance)
  }

  // USED BY SIMPLECOINAPP
  createApplyResponse(txId, txTimestamp) {
    const replyObject = {
      stateTableResults: [],
      txId,
      txTimestamp,
      accountData: [],
      accountWrites: [],
      appDefinedData: {},
      failed: false,
      failMessage: null,
      appReceiptData: null,
      appReceiptDataHash: null,
    }
    return replyObject
  }

  async shutdownFromDapp(tag: string, message: string, restart: boolean) {
    const exitType = restart ? 'exitCleanly' : 'exitUncleanly'
    nestedCountersInstance.countRareEvent('fatal', `invoke-exit: ${exitType}: ${tag}`)
    this.mainLogger.error(`invoke-exit: ${exitType}: ${tag}`)
    this.mainLogger.error(message)
    this.mainLogger.error(getCallstack())
    if (this.reporter) {
      this.reporter.stopReporting()
      await this.reporter.reportRemoved(Self.id)
    }
    if (restart)
      // exits with status 0 so that PM2 can restart the process
      this.exitHandler.exitCleanly(`invoke-exit: ${tag}`, `invoke-exit: ${tag}. but exiting cleanly for a restart`)
    // exits with status 1 so that PM2 CANNOT restart the process
    else this.exitHandler.exitUncleanly(`invoke-exit: ${tag}`, `invoke-exit: ${exitType}: ${tag}`)
  }

  applyResponseAddReceiptData(
    resultObject: ShardusTypes.ApplyResponse,
    appReceiptData: any,
    appReceiptDataHash: string
  ) {
    resultObject.appReceiptData = appReceiptData
    resultObject.appReceiptDataHash = appReceiptDataHash
  }

  applyResponseSetFailed(resultObject: ShardusTypes.ApplyResponse, failMessage: string) {
    resultObject.failed = true
    resultObject.failMessage = failMessage
  }

  // USED BY SIMPLECOINAPP
  applyResponseAddState(
    resultObject: ShardusTypes.ApplyResponse, //TODO define type! :{stateTableResults: ShardusTypes.StateTableObject[], accountData:ShardusTypes.WrappedResponse[] },
    accountData: any,
    localCache: any,
    accountId: string,
    txId: string,
    txTimestamp: number,
    stateBefore: string,
    stateAfter: string,
    accountCreated: boolean
  ) {
    const state = { accountId, txId, txTimestamp, stateBefore, stateAfter }
    if (accountCreated) {
      state.stateBefore = allZeroes64
    }
    //@ts-ignore
    resultObject.stateTableResults.push(state)
    let foundAccountData = resultObject.accountData.find((a) => a.accountId === accountId)
    if (foundAccountData) {
      foundAccountData = {
        ...foundAccountData,
        accountId,
        data: accountData,
        //@ts-ignore
        txId,
        timestamp: txTimestamp,
        hash: stateAfter,
        stateId: stateAfter, // duplicate of hash.., really need to go back and add types to this
        localCache,
      }
    } else {
      resultObject.accountData.push({
        accountId,
        data: accountData,
        //@ts-ignore
        txId,
        timestamp: txTimestamp,
        hash: stateAfter,
        stateId: stateAfter, // duplicate of hash.., really need to go back and add types to this
        localCache,
      })
    }
  }
  // USED BY SIMPLECOINAPP
  applyResponseAddChangedAccount(
    resultObject: ShardusTypes.ApplyResponse, //TODO define this type!
    accountId: string,
    account: ShardusTypes.WrappedResponse,
    txId: string,
    txTimestamp: number
  ) {
    resultObject.accountWrites.push({
      accountId,
      data: account,
      txId,
      timestamp: txTimestamp,
    })
  }

  useAccountWrites() {
    console.log('Using accountWrites only')
    this.stateManager.useAccountWritesOnly = true
  }

  tryInvolveAccount(txId: string, address: string, isRead: boolean): boolean {
    try {
      const result = this.stateManager.transactionQueue.tryInvloveAccount(txId, address, isRead)
      return result
    } catch (err) {
      this.fatalLogger.fatal(
        'Error while checking tryInvolveAccount ' + err.name + ': ' + err.message + ' at ' + err.stack
      )
      return false
    }
  }
  signAsNode(obj) {
    return this.crypto.sign(obj)
  }
  // USED BY SIMPLECOINAPP
  async resetAppRelatedState() {
    await this.storage.clearAppRelatedState()
  }

  // USED BY SIMPLECOINAPP
  async getLocalOrRemoteAccount(
    address,
    opts: {
      useRICache: boolean // enables the RI cache. enable only for immutable data
      canThrowException?: boolean
    } = { useRICache: false, canThrowException: false }
  ) {
    if (this.p2p.allowTransactions() || isServiceMode()) {
      return this.stateManager.getLocalOrRemoteAccount(address, opts)
    } else {
      return null
    }
  }

  async getLocalOrRemoteCachedAppData(topic, dataId): Promise<CachedAppData | null> {
    if (this.p2p.allowTransactions()) {
      return this.stateManager.cachedAppDataManager.getLocalOrRemoteCachedAppData(topic, dataId)
    } else {
      return null
    }
  }

  async getLocalOrRemoteAccountQueueCount(address): Promise<QueueCountsResult> {
    if (this.p2p.allowTransactions()) {
      return this.stateManager.getLocalOrRemoteAccountQueueCount(address)
    } else {
      return { count: 0, committingAppData: [] }
    }
  }

  async registerCacheTopic(topic: string, maxCycleAge: number, maxCacheElements: number) {
    try {
      return this.stateManager.cachedAppDataManager.registerTopic(topic, maxCycleAge, maxCacheElements)
    } catch (e) {
      this.mainLogger.error(`Error while registerCacheTopic`, e)
    }
  }

  async sendCorrespondingCachedAppData(
    topic: string,
    dataID: string,
    appData: any,
    cycle: number,
    fromId: string,
    txId: string
  ) {
    try {
      if (this.config.p2p.useFactCorrespondingTell) {
        await this.stateManager.cachedAppDataManager.factSendCorrespondingCachedAppData(
          topic,
          dataID,
          appData,
          cycle,
          fromId,
          txId
        )
      } else {
        await this.stateManager.cachedAppDataManager.sendCorrespondingCachedAppData(
          topic,
          dataID,
          appData,
          cycle,
          fromId,
          txId
        )
      }
    } catch (e) {
      this.mainLogger.error(`Error while sendCorrespondingCachedAppData`, e)
    }
  }

  /**
   * This function is used to query data from an account that is guaranteed to be in a remote shard
   * @param {*} address The address / publicKey of the account in which to query
   */
  async getRemoteAccount(address) {
    return this.stateManager.getRemoteAccount(address)
  }

  getConsenusGroupForAccount(address: string): ShardusTypes.Node[] {
    return this.stateManager.transactionQueue.getConsenusGroupForAccount(address)
  }

  getRandomConsensusNodeForAccount(address: string): ShardusTypes.Node {
    return this.stateManager.transactionQueue.getRandomConsensusNodeForAccount(address)
  }

  isAccountRemote(address: string): boolean {
    return this.stateManager.transactionQueue.isAccountRemote(address)
  }

  /**
   * test once at the given probability to fail.  If it fails, log the message and return true.  If it doesnt fail, return false.
   * @param failChance 0-1
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
    //MAIN-NET disable this.
    if (this.stateManager.testFailChance(failChance, debugName, key, message, verboseRequired)) {
      return true
    } else {
      return false
    }
  }

  async debugForeverLoop(tag: string) {
    this.debugForeverLoopCounter++
    /* prettier-ignore */ this.stateManager.transactionQueue.setDebugSetLastAppAwait('debugForeverLoop'+tag)
    while (this.debugForeverLoopsEnabled) {
      await utils.sleep(1000)
    }
    /* prettier-ignore */ this.stateManager.transactionQueue.setDebugSetLastAppAwait('debugForeverLoop'+tag, DebugComplete.Completed)
  }

  setupDebugEndpoints() {
    Context.network.registerExternalGet('debug-toggle-foreverloop', isDebugModeMiddleware, (req, res) => {
      this.debugForeverLoopsEnabled = !this.debugForeverLoopsEnabled
      //optionally check the query param set and use that instead
      if (req.query.set) {
        this.debugForeverLoopsEnabled = req.query.set === 'true'
      }
      res.json({ debugForeverLoopsEnabled: this.debugForeverLoopsEnabled })
    })
  }

  /**
   * Creates a wrapped response for formatting required by shardus
   * @param {*} accountId
   * @param {*} accountCreated
   * @param {*} hash
   * @param {*} timestamp
   * @param {*} fullData
   */
  createWrappedResponse(accountId, accountCreated, hash, timestamp, fullData) {
    // create and return the response object, it will default to full data.
    return {
      accountId,
      accountCreated,
      isPartial: false,
      stateId: hash,
      timestamp,
      data: fullData,
    }
  }

  /**
   * setPartialData
   * @param {Shardus.WrappedResponse} response
   * @param {any} partialData
   * @param {any} userTag
   */
  setPartialData(response, partialData, userTag) {
    // if the account was just created we have to do something special and ignore partial data
    if (response.accountCreated) {
      response.localCache = response.data
      return
    }
    response.isPartial = true
    // otherwise we will convert this response to be using partial data
    response.localCache = response.data
    response.data = partialData
    response.userTag = userTag
  }

  genericApplyPartialUpate(fullObject, updatedPartialObject) {
    const dataKeys = Object.keys(updatedPartialObject)
    for (const key of dataKeys) {
      fullObject[key] = updatedPartialObject[key]
    }
  }

  // ended up not using this yet:
  // async debugSetAccountState(wrappedResponse:ShardusTypes.WrappedResponse) {
  //   //set data. this will invoke the app to set data also
  //   await this.stateManager.checkAndSetAccountData([wrappedResponse], 'debugSetAccountState', false)
  // }

  /**
   * This is for a dapp to restore a bunch of account data in a debug situation.
   * This will call back into the dapp and instruct it to commit each account
   * This will also update shardus values.
   * There is a bug with re-updating the accounts copy db though.
   * @param accountCopies
   */
  async debugCommitAccountCopies(accountCopies: ShardusTypes.AccountsCopy[]) {
    await this.stateManager._commitAccountCopies(accountCopies)
  }

  async forwardAccounts(data: Archivers.InitialAccountsData) {
    await Archivers.forwardAccounts(data)
  }

  // Expose dev public key to verify things on the app
  getDevPublicKeys() {
    return getDevPublicKeys()
  }

  // Expose dev public key to verify things on the app
  getDevPublicKey(keyName?: string) {
    return getDevPublicKey(keyName)
  }

  // Expose dev key with highest security level
  getDevPublicKeyMaxLevel(clearance?: DevSecurityLevel) {
    return getDevPublicKeyMaxLevel(clearance)
  }

  // Verify that the key is the dev key and has the required security level
  ensureKeySecurity(keyName: string, clearance: DevSecurityLevel) {
    return ensureKeySecurity(keyName, clearance)
  }

  getMultisigPublicKeys() {
    return getMultisigPublicKeys()
  }

  getMultisigPublicKey(key: string) {
    return getMultisigPublicKey(key)
  }

  ensureMultisigKeySecurity(pubKey: string, level: DevSecurityLevel) {
    return ensureMultisigKeySecurity(pubKey, level)
  }

  /**
   * Shutdown this node in the network
   * @param {boolean} exitProcess Exit the process when shutting down
   */
  async shutdown(exitProcess = true) {
    try {
      this.mainLogger.info('exitCleanly: shutdown')
      await this.exitHandler.exitCleanly(exitProcess)
      // consider if we want this.  it can help for debugging:
      // await this.exitHandler.exitUncleanly()
    } catch (e) {
      throw e
    }
  }

  /**
   * Grab the SDK interface provided by the application for shardus
   * @param {App} application
   * @returns {App}
   */
  _getApplicationInterface(application: ShardusTypes.App): ShardusTypes.App {
    if (logFlags.debug) this.mainLogger.debug('Start of _getApplicationInterfaces()')
    const applicationInterfaceImpl: Partial<ShardusTypes.App> = {}
    try {
      if (application == null) {
        // throw new Error('Invalid Application Instance')
        return null
      }

      if (typeof application.isDestLimitTx === 'function') {
        applicationInterfaceImpl.isDestLimitTx = (appData) => application.isDestLimitTx(appData)
      } else {
        applicationInterfaceImpl.isDestLimitTx = (appData) => false
      }

      if (typeof application.isInternalTx === 'function') {
        applicationInterfaceImpl.isInternalTx = (tx) => application.isInternalTx(tx)
      }

      if (typeof application.isMultiSigFoundationTx === 'function') {
        applicationInterfaceImpl.isMultiSigFoundationTx = (tx) => application.isMultiSigFoundationTx(tx)
      } else {
        applicationInterfaceImpl.isMultiSigFoundationTx = (tx) => false
      }

      if (typeof application.validate === 'function') {
        applicationInterfaceImpl.validate = (inTx, appData) => application.validate(inTx, appData)
      } else if (typeof application.validateTxnFields === 'function') {
        /**
         * Compatibility layer for Apps that use the old validateTxnFields fn
         * instead of the new validate fn
         */
        applicationInterfaceImpl.validate = (inTx, appData) => {
          const oldResult: ShardusTypes.IncomingTransactionResult = application.validateTxnFields(inTx, appData)
          const newResult = {
            success: oldResult.success,
            reason: oldResult.reason,
            status: oldResult.status,
          }
          return newResult
        }
      } else {
        throw new Error('Missing required interface function. validate()')
      }

      if (typeof application.crack === 'function') {
        applicationInterfaceImpl.crack = (inTx, appData) => application.crack(inTx, appData)
      } else if (
        typeof application.getKeyFromTransaction === 'function' &&
        typeof application.validateTxnFields === 'function'
      ) {
        /**
         * Compatibility layer for Apps that use the old getKeyFromTransaction
         * fn instead of the new crack fn
         */
        applicationInterfaceImpl.crack = (inTx) => {
          const oldGetKeyFromTransactionResult: ShardusTypes.TransactionKeys = application.getKeyFromTransaction(inTx)
          const oldValidateTxnFieldsResult: ShardusTypes.IncomingTransactionResult = application.validateTxnFields(
            inTx,
            null
          )
          const newResult = {
            timestamp: oldValidateTxnFieldsResult.txnTimestamp,
            id: this.crypto.hash(inTx), // [TODO] [URGENT] We really shouldn't be doing this and should change all apps to use the new way and do their own hash
            keys: oldGetKeyFromTransactionResult,
            shardusMemoryPatterns: null,
          }
          return newResult
        }
      } else {
        throw new Error('Missing required interface function. validate()')
      }

      if (typeof application.txPreCrackData === 'function') {
        applicationInterfaceImpl.txPreCrackData = async (tx, appData): Promise<{ status: boolean; reason: string }> => {
          this.profiler.scopedProfileSectionStart('process-dapp.txPreCrackData', false)
          let { status: success, reason } = await application.txPreCrackData(tx, appData)
          this.profiler.scopedProfileSectionEnd('process-dapp.txPreCrackData')
          return { status: success, reason }
        }
      } else {
        applicationInterfaceImpl.txPreCrackData = async function () {
          return { status: true, reason: '' }
        }
      }

      if (typeof application.getTimestampFromTransaction === 'function') {
        applicationInterfaceImpl.getTimestampFromTransaction = (inTx, appData) =>
          application.getTimestampFromTransaction(inTx, appData)
      } else {
        throw new Error('Missing requried interface function.getTimestampFromTransaction()')
      }

      if (typeof application.calculateTxId === 'function') {
        applicationInterfaceImpl.calculateTxId = (inTx) => application.calculateTxId(inTx)
      } else {
        throw new Error('Missing requried interface function.calculateTxId()')
      }

      if (typeof application.apply === 'function') {
        applicationInterfaceImpl.apply = (inTx, wrappedStates, appData) =>
          application.apply(inTx, wrappedStates, appData)
      } else {
        throw new Error('Missing required interface function. apply()')
      }

      if (typeof application.transactionReceiptPass === 'function') {
        applicationInterfaceImpl.transactionReceiptPass = async (tx, wrappedStates, applyResponse, isExecutionGroup) =>
          application.transactionReceiptPass(tx, wrappedStates, applyResponse, isExecutionGroup)
      } else {
        applicationInterfaceImpl.transactionReceiptPass = async function (
          _tx,
          _wrappedStates,
          _applyResponse,
          _isExecutionGroup
        ) {}
      }

      if (typeof application.transactionReceiptFail === 'function') {
        applicationInterfaceImpl.transactionReceiptFail = async (tx, wrappedStates, applyResponse) =>
          application.transactionReceiptFail(tx, wrappedStates, applyResponse)
      } else {
        applicationInterfaceImpl.transactionReceiptFail = async function (_tx, _wrappedStates, _applyResponse) {}
      }

      if (typeof application.updateAccountFull === 'function') {
        applicationInterfaceImpl.updateAccountFull = async (wrappedStates, localCache, applyResponse) => {
          this.profiler.scopedProfileSectionStart('process-dapp.updateAccountFull', false)
          await application.updateAccountFull(wrappedStates, localCache, applyResponse)
          this.profiler.scopedProfileSectionEnd('process-dapp.updateAccountFull')
        }
      } else {
        throw new Error('Missing required interface function. updateAccountFull()')
      }

      if (typeof application.updateAccountPartial === 'function') {
        applicationInterfaceImpl.updateAccountPartial = async (wrappedStates, localCache, applyResponse) =>
          application.updateAccountPartial(wrappedStates, localCache, applyResponse)
      } else {
        throw new Error('Missing required interface function. updateAccountPartial()')
      }

      if (typeof application.getRelevantData === 'function') {
        applicationInterfaceImpl.getRelevantData = async (accountId, tx, appData: any) =>
          application.getRelevantData(accountId, tx, appData)
      } else {
        throw new Error('Missing required interface function. getRelevantData()')
      }

      if (typeof application.getStateId === 'function') {
        applicationInterfaceImpl.getStateId = async (accountAddress, mustExist) =>
          application.getStateId(accountAddress, mustExist)
      } else {
        if (logFlags.debug) this.mainLogger.debug('getStateId not used by global server')
      }

      if (typeof application.close === 'function') {
        applicationInterfaceImpl.close = async () => application.close()
      } else {
        throw new Error('Missing required interface function. close()')
      }

      // App.get_account_data (Acc_start, Acc_end, Max_records)
      // Provides the functionality defined for /get_accounts API
      // Max_records - limits the number of records returned
      if (typeof application.getAccountData === 'function') {
        applicationInterfaceImpl.getAccountData = async (accountStart, accountEnd, maxRecords) => {
          this.profiler.scopedProfileSectionStart('process-dapp.getAccountData', false)
          const res = await application.getAccountData(accountStart, accountEnd, maxRecords)
          this.profiler.scopedProfileSectionEnd('process-dapp.getAccountData')
          return res
        }
      } else {
        throw new Error('Missing required interface function. getAccountData()')
      }

      if (typeof application.getCachedRIAccountData === 'function') {
        applicationInterfaceImpl.getCachedRIAccountData = async (addressList: string[]) => {
          this.profiler.scopedProfileSectionStart('process-dapp.getCachedRIAccountData', false)
          const res = await application.getCachedRIAccountData(addressList)
          this.profiler.scopedProfileSectionEnd('process-dapp.getCachedRIAccountData')
          return res
        }
      } else {
        applicationInterfaceImpl.getCachedRIAccountData = async (_addressList: string[]) => {
          return []
        }
      }

      if (typeof application.setCachedRIAccountData === 'function') {
        applicationInterfaceImpl.setCachedRIAccountData = async (accountRecords: any[]) => {
          this.profiler.scopedProfileSectionStart('process-dapp.setCachedRIAccountData', false)
          await application.setCachedRIAccountData(accountRecords)
          this.profiler.scopedProfileSectionEnd('process-dapp.setCachedRIAccountData')
        }
      } else {
        applicationInterfaceImpl.setCachedRIAccountData = async (_accountRecords: any[]) => {}
      }

      if (typeof application.getAccountDataByRange === 'function') {
        applicationInterfaceImpl.getAccountDataByRange = async (
          accountStart,
          accountEnd,
          tsStart,
          tsEnd,
          maxRecords,
          offset,
          accountOffset
        ) => {
          this.profiler.scopedProfileSectionStart('process-dapp.getAccountDataByRange', false)
          const res = await application.getAccountDataByRange(
            accountStart,
            accountEnd,
            tsStart,
            tsEnd,
            maxRecords,
            offset,
            accountOffset
          )
          this.profiler.scopedProfileSectionEnd('process-dapp.getAccountDataByRange')
          return res
        }
      } else {
        throw new Error('Missing required interface function. getAccountDataByRange()')
      }

      if (typeof application.calculateAccountHash === 'function') {
        applicationInterfaceImpl.calculateAccountHash = (account) => application.calculateAccountHash(account)
      } else {
        throw new Error('Missing required interface function. calculateAccountHash()')
      }

      // App.set_account_data (Acc_records)
      // Acc_records - as provided by App.get_accounts
      // Stores the records into the Accounts table if the hash of the Acc_data matches State_id
      // Returns a list of failed Acc_id
      if (typeof application.setAccountData === 'function') {
        applicationInterfaceImpl.setAccountData = async (accountRecords) => {
          this.profiler.scopedProfileSectionStart('process-dapp.setAccountData', false)
          application.setAccountData(accountRecords)
          this.profiler.scopedProfileSectionEnd('process-dapp.setAccountData')
        }
      } else {
        throw new Error('Missing required interface function. setAccountData()')
      }

      // pass array of account ids to this and it will delete the accounts
      if (typeof application.deleteAccountData === 'function') {
        applicationInterfaceImpl.deleteAccountData = async (addressList) => application.deleteAccountData(addressList)
      } else {
        throw new Error('Missing required interface function. deleteAccountData()')
      }

      if (typeof application.getAccountDataByList === 'function') {
        applicationInterfaceImpl.getAccountDataByList = async (addressList) => {
          this.profiler.scopedProfileSectionStart('process-dapp.getAccountDataByList', false)
          const accData = await application.getAccountDataByList(addressList)
          this.profiler.scopedProfileSectionEnd('process-dapp.getAccountDataByList')
          return accData
        }
      } else {
        throw new Error('Missing required interface function. getAccountDataByList()')
      }

      if (typeof application.getNetworkAccount === 'function') {
        applicationInterfaceImpl.getNetworkAccount = () => application.getNetworkAccount()
      } else {
        applicationInterfaceImpl.getNetworkAccount = () => null
      }

      if (typeof application.deleteLocalAccountData === 'function') {
        applicationInterfaceImpl.deleteLocalAccountData = async () => {
          this.profiler.scopedProfileSectionStart('process-dapp.deleteLocalAccountData', false)
          await application.deleteLocalAccountData()
          this.profiler.scopedProfileSectionEnd('process-dapp.deleteLocalAccountData')
        }
      } else {
        throw new Error('Missing required interface function. deleteLocalAccountData()')
      }
      if (typeof application.getAccountDebugValue === 'function') {
        applicationInterfaceImpl.getAccountDebugValue = (wrappedAccount) =>
          application.getAccountDebugValue(wrappedAccount)
      } else {
        applicationInterfaceImpl.getAccountDebugValue = (_wrappedAccount) => 'getAccountDebugValue() missing on app'
      }

      //getSimpleTxDebugValue(tx)
      if (typeof application.getSimpleTxDebugValue === 'function') {
        applicationInterfaceImpl.getSimpleTxDebugValue = (tx) => application.getSimpleTxDebugValue(tx)
      } else {
        applicationInterfaceImpl.getSimpleTxDebugValue = (_tx) => ''
      }

      if (typeof application.canDebugDropTx === 'function') {
        applicationInterfaceImpl.canDebugDropTx = (tx) => application.canDebugDropTx(tx)
      } else {
        applicationInterfaceImpl.canDebugDropTx = (_tx) => true
      }

      if (typeof application.sync === 'function') {
        applicationInterfaceImpl.sync = async () => {
          this.profiler.scopedProfileSectionStart('process-dapp.sync', false)
          const res = await application.sync()
          this.profiler.scopedProfileSectionEnd('process-dapp.sync')
          return res
        }
      } else {
        const thisPtr = this
        applicationInterfaceImpl.sync = async function () {
          thisPtr.mainLogger.debug('no app.sync() function defined')
        }
      }

      if (typeof application.dataSummaryInit === 'function') {
        applicationInterfaceImpl.dataSummaryInit = async (blob, accountData) =>
          application.dataSummaryInit(blob, accountData)
      } else {
        applicationInterfaceImpl.dataSummaryInit = async function (_blob, _accountData) {}
      }
      if (typeof application.dataSummaryUpdate === 'function') {
        applicationInterfaceImpl.dataSummaryUpdate = async (blob, accountDataBefore, accountDataAfter) =>
          application.dataSummaryUpdate(blob, accountDataBefore, accountDataAfter)
      } else {
        applicationInterfaceImpl.dataSummaryUpdate = async function (_blob, _accountDataBefore, _accountDataAfter) {}
      }
      if (typeof application.txSummaryUpdate === 'function') {
        applicationInterfaceImpl.txSummaryUpdate = async (blob, tx, wrappedStates) =>
          application.txSummaryUpdate(blob, tx, wrappedStates)
      } else {
        applicationInterfaceImpl.txSummaryUpdate = async function (_blob, _tx, _wrappedStates) {}
      }

      if (typeof application.getAccountTimestamp === 'function') {
        applicationInterfaceImpl.getAccountTimestamp = async (accountAddress, mustExist) =>
          application.getAccountTimestamp(accountAddress, mustExist)
      } else {
        applicationInterfaceImpl.getAccountTimestamp = async function (_accountAddress, _mustExist) {
          return 0
        }
      }

      if (typeof application.getTimestampAndHashFromAccount === 'function') {
        applicationInterfaceImpl.getTimestampAndHashFromAccount = (account) =>
          application.getTimestampAndHashFromAccount(account)
      } else {
        applicationInterfaceImpl.getTimestampAndHashFromAccount = function (_account) {
          return {
            timestamp: 0,
            hash: 'getTimestampAndHashFromAccount not impl',
          }
        }
      }
      if (typeof application.validateJoinRequest === 'function') {
        applicationInterfaceImpl.validateJoinRequest = (data, mode, latestCycle, minNodes) =>
          application.validateJoinRequest(data, mode, latestCycle, minNodes)
      }
      if (typeof application.validateArchiverJoinRequest === 'function') {
        applicationInterfaceImpl.validateArchiverJoinRequest = (data) => application.validateArchiverJoinRequest(data)
      }
      if (typeof application.getJoinData === 'function') {
        applicationInterfaceImpl.getJoinData = () => application.getJoinData()
      }
      if (typeof application.eventNotify === 'function') {
        applicationInterfaceImpl.eventNotify = application.eventNotify
      }
      if (typeof application.isReadyToJoin === 'function') {
        applicationInterfaceImpl.isReadyToJoin = async (latestCycle, publicKey, activeNodes, mode) =>
          application.isReadyToJoin(latestCycle, publicKey, activeNodes, mode)
      } else {
        // If the app doesn't provide isReadyToJoin, assume it is always ready to join
        applicationInterfaceImpl.isReadyToJoin = async (_latestCycle, _publicKey, _activeNodes, _mode) => true
      }
      if (typeof application.getNodeInfoAppData === 'function') {
        applicationInterfaceImpl.getNodeInfoAppData = () => application.getNodeInfoAppData()
      } else {
        // If the app doesn't provide getNodeInfoAppData, assume it returns empty obj
        applicationInterfaceImpl.getNodeInfoAppData = () => {}
      }
      if (typeof application.updateNetworkChangeQueue === 'function') {
        applicationInterfaceImpl.updateNetworkChangeQueue = async (account: ShardusTypes.WrappedData, appData: any) =>
          application.updateNetworkChangeQueue(account, appData)
      } else {
        // If the app doesn't provide updateNetworkChangeQueue, just return empty arr
        applicationInterfaceImpl.updateNetworkChangeQueue = async (_account, _appData) => []
      }
      if (typeof application.pruneNetworkChangeQueue === 'function') {
        applicationInterfaceImpl.pruneNetworkChangeQueue = async (account: ShardusTypes.WrappedData, cycle: number) =>
          application.pruneNetworkChangeQueue(account, cycle)
      } else {
        // If the app doesn't provide pruneNetworkChangeQueue, just return empty arr
        applicationInterfaceImpl.pruneNetworkChangeQueue = async (_account, _cycle) => []
      }
      if (typeof application.canStayOnStandby === 'function') {
        applicationInterfaceImpl.canStayOnStandby = (joinInfo: JoinRequest) => application.canStayOnStandby(joinInfo)
      }

      if (typeof application.signAppData === 'function') {
        applicationInterfaceImpl.signAppData = async (
          type,
          hash,
          nodesToSign,
          appData
        ): Promise<ShardusTypes.SignAppDataResult> => {
          this.profiler.scopedProfileSectionStart('process-dapp.signAppData', false)
          const res = await application.signAppData(type, hash, nodesToSign, appData)
          this.profiler.scopedProfileSectionEnd('process-dapp.signAppData')
          return res
        }
      }
      if (typeof application.beforeStateAccountFilter === 'function') {
        applicationInterfaceImpl.beforeStateAccountFilter = application.beforeStateAccountFilter
      }
      if (typeof application.binarySerializeObject === 'function') {
        applicationInterfaceImpl.binarySerializeObject = (identifier: AppObjEnum, obj: any): Buffer => {
          this.profiler.scopedProfileSectionStart('process-dapp.binarySerializeObject', false)
          const res = application.binarySerializeObject(identifier, obj)
          this.profiler.scopedProfileSectionEnd('process-dapp.binarySerializeObject')
          return res
        }
      } else {
        console.log('binarySerializeObject not implemented')
        applicationInterfaceImpl.binarySerializeObject = (_identifier: string, obj: any): Buffer => {
          return Buffer.from(Utils.safeStringify(obj), 'utf8')
        }
      }
      if (typeof application.binaryDeserializeObject === 'function') {
        applicationInterfaceImpl.binaryDeserializeObject = (identifier: AppObjEnum, buffer: Buffer): any => {
          this.profiler.scopedProfileSectionStart('process-dapp.binaryDeserializeObject', false)
          const res = application.binaryDeserializeObject(identifier, buffer)
          this.profiler.scopedProfileSectionEnd('process-dapp.binaryDeserializeObject')
          return res
        }
      } else {
        console.log('binaryDeserializeObject not implemented')
        applicationInterfaceImpl.binaryDeserializeObject = (_identifier: string, buffer: Buffer): any => {
          return Utils.safeJsonParse(buffer.toString('utf8'))
        }
      }
      if (typeof application.getTxSenderAddress === 'function') {
        applicationInterfaceImpl.getTxSenderAddress = (tx) => application.getTxSenderAddress(tx)
      }
      if (typeof application.injectTxToConsensor === 'function') {
        applicationInterfaceImpl.injectTxToConsensor = (consensor, tx) => application.injectTxToConsensor(consensor, tx)
      }
      if (typeof application.getNonceFromTx === 'function') {
        applicationInterfaceImpl.getNonceFromTx = (tx) => application.getNonceFromTx(tx)
      }
      if (typeof application.getAccountNonce === 'function') {
        applicationInterfaceImpl.getAccountNonce = (accountId) => application.getAccountNonce(accountId)
      }
      if (typeof application.verifyMultiSigs === 'function') {
        applicationInterfaceImpl.verifyMultiSigs = (
          rawPayload,
          sigs,
          allowedPubkeys,
          minSigRequired,
          requiredSecurityLevel
        ) => application.verifyMultiSigs(rawPayload, sigs, allowedPubkeys, minSigRequired, requiredSecurityLevel)
      } else {
        applicationInterfaceImpl.verifyMultiSigs = (
          _rawPayload,
          _sigs,
          _allowedPubkeys,
          _minSigRequired,
          _requiredSecurityLevel
        ) => {
          return true
        }
      }

      if (typeof application.isNGT === 'function') {
        applicationInterfaceImpl.isNGT = (tx) => application.isNGT(tx)
      }

      if (typeof application.getUniqueAppTags === 'function') {
        applicationInterfaceImpl.getUniqueAppTags = (tx) => application.getUniqueAppTags(tx)
      }

      if (typeof application.verifyAppJoinData === 'function') {
        applicationInterfaceImpl.verifyAppJoinData = (data) => application.verifyAppJoinData(data)
      }

      if (typeof application.getNetworkAccountFromArchiver === 'function') {
        applicationInterfaceImpl.getNetworkAccountFromArchiver = async () => application.getNetworkAccountFromArchiver()
      } else {
        // If the app doesn't provide getNetworkAccountFromArchiver, assume it returns empty obj
        applicationInterfaceImpl.getNetworkAccountFromArchiver = async () => {
          return null
        }
      }
    } catch (ex) {
      this.shardus_fatal(`getAppInterface_ex`, `Required application interface not implemented. Exception: ${ex}`)
      this.fatalLogger.fatal('_getApplicationInterface: ' + ex.name + ': ' + ex.message + ' at ' + ex.stack)
      throw new Error(ex)
    }
    if (logFlags.debug) this.mainLogger.debug('End of _getApplicationInterfaces()')

    // At this point, we have validated all the fields so a cast is appropriate
    return applicationInterfaceImpl as ShardusTypes.App
  }

  /**
   * Register the exit and config routes
   */
  

  /**
   * Registers exception handlers for "uncaughtException" and "unhandledRejection"
   */
  registerExceptionHandler() {
    const logFatalAndExit = (err) => {
      console.log('Encountered a fatal error. Check fatal log for details.')
      this.shardus_fatal(`unhandledRejection_ex_` + err.stack.substring(0, 100), 'unhandledRejection: ' + err.stack)
      // this.exitHandler.exitCleanly()

      // If the networks active node count is < some percentage of minNodes, don't exit on exceptions and log a counter instead
      if (config.p2p.continueOnException === true) {
        const activeNodes = activeByIdOrder
        const minNodesToExit = config.p2p.baselineNodes * config.p2p.minNodesPerctToAllowExitOnException
        if (activeNodes.length < minNodesToExit) {
          // Log a counter to say node is not going to apoptosize
          const msg = `Not enough active nodes to exit on exception. Active nodes: ${activeNodes.length}, minNodesToExit: ${minNodesToExit}, baselineNodes: ${config.p2p.baselineNodes}, minNodesPerctToAllowExitOnException: ${config.p2p.minNodesPerctToAllowExitOnException}`
          this.mainLogger.warn(msg)
          nestedCountersInstance.countEvent('continueOnException', msg)
          return
        }
      }

      this.mainLogger.info(`exitUncleanly: logFatalAndExit`)
      this.exitHandler.exitUncleanly('Unhandled Exception', err.message)
    }
    process.on('uncaughtException', (err) => {
      logFatalAndExit(err)
    })
    process.on('unhandledRejection', (err) => {
      logFatalAndExit(err)
    })
  }

  async updateConfigChangeQueue(
    account: ShardusTypes.WrappedData,
    lastCycle_counter: number,
    updateNetworkAccount: boolean
  ) {
    if (account == null) return

    // @ts-ignore // TODO where is listOfChanges coming from here? I don't think it should exist on data
    let changes = account.data.listOfChanges as {
      cycle: number
      change: any
      appData: any
    }[]
    if (!changes || !Array.isArray(changes)) {
      //this may get logged if we have a changeListGlobalAccount that does not have config settings on it.
      //The fix is to let the dapp set the global account to use for this
      // this.mainLogger.error(
      //   `Invalid changes in global account ${changeListGlobalAccount}`
      // )
      return
    }
    const activeConfigChanges = new Set<string>()
    for (let change of changes) {
      //skip future changes
      if (change.cycle > lastCycle_counter) {
        continue
      }
      const changeHash = this.crypto.hash(change)
      //skip handled changes
      if (this.appliedConfigChanges.has(changeHash)) {
        activeConfigChanges.add(changeHash)
        continue
      }
      //apply this change
      this.appliedConfigChanges.add(changeHash)
      activeConfigChanges.add(changeHash)
      let changeObj = change.change
      let appData = change.appData

      // If there is initShutdown change, if the latest cycle is greater than the cycle of the change, then skip it
      if (changeObj['p2p'] && changeObj['p2p']['initShutdown'] && change.cycle !== lastCycle_counter) continue

      //safe for early path
      this.patchObject(this.config, changeObj, appData)

      // should avoid using this early if we dont want to commit archiver state
      if (updateNetworkAccount) {
        const prunedData: WrappedData[] = await this.app.pruneNetworkChangeQueue(account, lastCycle_counter)
        await this.stateManager.checkAndSetAccountData(prunedData, 'global network account update', true)
      }

      if (appData) {
        const data: WrappedData[] = await this.app.updateNetworkChangeQueue(account, appData)
        // should avoid using this early if we dont want to commit archiver state
        if (updateNetworkAccount) {
          await this.stateManager.checkAndSetAccountData(data, 'global network account update', true)
        }
      }

      //safe for early path
      this.p2p.configUpdated()
      //safe for early path
      this.loadDetection.configUpdated()
      //safe for early path
      this.rateLimiting.configUpdated()
    }
    if (activeConfigChanges.size > 0) {
      // clear the entries from appliedConfigChanges that are no longer in the changes list
      for (let changeHash of this.appliedConfigChanges) {
        if (!activeConfigChanges.has(changeHash)) {
          this.appliedConfigChanges.delete(changeHash)
        }
      }
    }
  }

  patchObject(existingObject: any, changeObj: any, appData: any) {
    for (const [key, value] of Object.entries(changeObj)) {
      if (existingObject[key] != null) {
        /* handle dev key rotation where both keys and values are required */
        if (key === 'devPublicKeys' || key === 'multisigKeys') {
          existingObject[key] = value
          this.mainLogger.info(`patched ${key} to ${value}`)
        } else if (typeof value === 'object') {
          this.patchObject(existingObject[key], value, appData)
        } else {
          existingObject[key] = value
          this.mainLogger.info(`patched ${key} to ${value}`)
          nestedCountersInstance.countEvent('config', `patched ${key} to ${value}`)
        }
      }
    }
  }

  /**
   * Do some periodic debug logic work
   * @param lastCycle
   */
  updateDebug(lastCycle: ShardusTypes.Cycle) {
    if (lastCycle == null) return
    let countEndpointStart = this.config?.debug?.countEndpointStart
    let countEndpointStop = this.config?.debug?.countEndpointStop

    if (countEndpointStart == null || countEndpointStart < 0) {
      return
    }

    //reset counters
    if (countEndpointStart === lastCycle.counter) {
      //nestedCountersInstance.resetCounters()
      //nestedCountersInstance.resetRareCounters()
      profilerInstance.clearScopedTimes()

      if (countEndpointStop === -1 || countEndpointStop <= countEndpointStart || countEndpointStop == null) {
        this.config.debug.countEndpointStop = countEndpointStart + 2
      }
    }

    if (countEndpointStop === lastCycle.counter && countEndpointStop != null) {
      //nestedCountersInstance.resetRareCounters()
      //convert a scoped report into rare counter report blob
      let scopedReport = profilerInstance.scopedTimesDataReport()
      scopedReport.cycle = lastCycle.counter
      scopedReport.node = `${Self.ip}:${Self.port}`
      scopedReport.id = utils.makeShortHash(Self.id)
      nestedCountersInstance.countRareEvent('scopedTimeReport', Utils.safeStringify(scopedReport))
    }
  }

  /**
   * Sets a global account value using the GlobalAccont Class' setGlobal function.
   *
   * @param address - The address of the account.
   * @param addressHash - The hash of the address.
   * @param value - The value to set for the account.
   * @param when - The timestamp or condition when the value should be set.
   * @param source - The source of the value.
   * @param afterStateHash - The state hash after setting the value.
   */
  setGlobal(address, addressHash, value, when, source, afterStateHash) {
    GlobalAccounts.setGlobal(address, addressHash, value, when, source, afterStateHash)
  }

  getDebugModeMiddleware() {
    return isDebugModeMiddleware
  }
  getDebugModeMiddlewareLow() {
    return isDebugModeMiddlewareLow
  }
  getDebugModeMiddlewareMedium() {
    return isDebugModeMiddlewareMedium
  }
  getDebugModeMiddlewareHigh() {
    return isDebugModeMiddlewareHigh
  }

  getDebugModeMiddlewareMultiSig() {
    return isDebugModeMiddlewareMultiSig
  }

  shardus_fatal(key, log, log2 = null) {
    nestedCountersInstance.countEvent('fatal-log', key)

    if (log2 != null) {
      this.fatalLogger.fatal(log, log2)
    } else {
      this.fatalLogger.fatal(log)
    }
  }

  monitorEvent(category: string, name: string, count: number, message: string) {
    nestedCountersInstance.countEvent(category, name, count)

    if (logFlags.verbose) {
      this.mainLogger.info(`Event received with info: {
        eventCategory: ${category},
        eventName: ${name},
        eventMessage: ${count},
      }`)
    }

    this.statistics.countEvent(category, name, count, message)
  }

  setMemoryLimit(topic: string, cacheCountLimit: number) {
    this.stateManager.cachedAppDataManager.setMemoryLimit(topic, cacheCountLimit)
  }

  async getAppDataSignatures(
    type: string,
    hash: string,
    nodesToSign: number,
    appData: any,
    allowedBackupNodes: number = 0
  ): Promise<ShardusTypes.GetAppDataSignaturesResult> {
    const closestNodesIds = this.getClosestNodes(hash, nodesToSign + allowedBackupNodes)

    const filterNodeIds = closestNodesIds.filter((id) => id !== Self.id)

    const closestNodes = filterNodeIds.map((nodeId) => this.p2p.state.getNode(nodeId))

    let responses = []
    if (filterNodeIds.length > 0) {
      const groupPromiseResp = await groupResolvePromises(
        closestNodes.map((node) => {
          // if (this.config.p2p.useBinarySerializedEndpoints && this.config.p2p.signAppDataBinary) {
          const request: SignAppDataReq = {
            type,
            hash,
            nodesToSign,
            appData,
          }
          return this.p2p.askBinary<SignAppDataReq, SignAppDataResp>(
            node,
            InternalRouteEnum.binary_sign_app_data,
            request,
            serializeSignAppDataReq,
            deserializeSignAppDataResp,
            {}
          )
          // } else
          // return this.p2p.ask(node, 'sign-app-data', {
          //   type,
          //   hash,
          //   nodesToSign,
          //   appData,
          // })
        }),
        (res) => {
          if (res.success) return true
          return false
        },
        allowedBackupNodes,
        Math.min(nodesToSign, filterNodeIds.length)
      )

      if (groupPromiseResp.success) responses = groupPromiseResp.wins
      else
        return {
          success: groupPromiseResp.success,
          signatures: [],
        }
    }

    if (closestNodesIds.includes(Self.id)) {
      const { success, signature } = await this.app.signAppData?.(type, hash, Number(nodesToSign), appData)
      /* prettier-ignore */ if (logFlags.p2pNonFatal && logFlags.console) console.log(success, signature)
      responses = [...responses, ...[{ success, signature }]]
    }

    const signatures = responses.map(({ signature }) => signature)
    if (logFlags.verbose) this.mainLogger.debug('Signatures for get signed app data request', signatures)

    return {
      success: true,
      signatures: signatures,
    }
  }

  isOnStandbyList(publicKey: string): boolean {
    return JoinV2.isOnStandbyList(publicKey)
  }

  isTxInQueue(txId: string): boolean {
    if (!txId) {
      nestedCountersInstance.countEvent('txQueue', 'checkTxEmpty')
      return false
    }

    const queueEntry = this.stateManager?.transactionQueue.getQueueEntry(txId)
    const exists = queueEntry !== null

    if (logFlags.debug) {
      this.mainLogger.debug(`isTxInQueue check for tx:${txId} exists:${exists}`)
    }

    nestedCountersInstance.countEvent('txQueue', exists ? 'txFound' : 'txNotFound')
    return exists
  }
}

function deepReplace(obj: object | ArrayLike<any>, find: any, replace: any): any {
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (obj[i] === find) {
        obj[i] = replace
      } else if (typeof obj[i] === 'object' && obj[i] !== null) {
        deepReplace(obj[i], find, replace)
      }
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const key in obj) {
      if (obj[key] === find) {
        obj[key] = replace
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        deepReplace(obj[key], find, replace)
      }
    }
  }
  return obj
}

// tslint:disable-next-line: no-default-export
export default Shardus
export * as ShardusTypes from '../shardus/shardus-types'

