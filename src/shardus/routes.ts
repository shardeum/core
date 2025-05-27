import { isDebugModeMiddlewareHigh, isDebugModeMiddlewareLow, isDebugModeMiddlewareMedium, isDebugMode } from '../network/debugMiddleware'
import { apoptosizeSelf } from '../p2p/Apoptosis'
import * as Self from '../p2p/Self'
import * as CycleCreator from '../p2p/CycleCreator'
import * as CycleChain from '../p2p/CycleChain'
// netConfig import removed - will use config.server instead
import * as Lost from '../p2p/Lost'
import * as NodeList from '../p2p/NodeList'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { logFlags } from '../logger'
import { Utils } from '@shardeum-foundation/lib-types'
import * as Comms from '../p2p/Comms'
import { Node } from '@shardeum-foundation/lib-types/build/src/p2p/NodeListTypes'
import * as ServiceQueue from '../p2p/ServiceQueue'
import { shardusGetTime } from '../network'
import { profilerInstance } from '../utils/profiler'
import * as utils from '../utils'
import * as JoinV2 from '../p2p/Join/v2'
import { config } from '../p2p/Context'
// Binary route types not available, will use any for now

// Local deepReplace function
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

export const routesMethods = {
  _registerRoutes() {
    // DEBUG routes
    this.network.registerExternalPost('exit', isDebugModeMiddlewareHigh, async (_req, res) => {
      res.json({ success: true })
      await this.shutdown()
    })
    // TODO elevate security beyond high when we get multi sig.  or is that too slow when needed?
    this.network.registerExternalPost('exit-apop', isDebugModeMiddlewareHigh, async (_req, res) => {
      apoptosizeSelf('Apoptosis called at exit-apop route', 'Node stopped by call to exit-apop route.')
      res.json({ success: true })
    })

    this.network.registerExternalGet('config', isDebugModeMiddlewareLow, async (_req, res) => {
      res.json({ config: this.config })
    })
    this.network.registerExternalGet('netconfig', async (_req, res) => {
      res.json({ config: this.config.server })
    })

    this.network.registerExternalGet('nodeInfo', async (req, res) => {
      let reportIntermediateStatus = req.query.reportIntermediateStatus === 'true'
      const nodeInfo = Self.getPublicNodeInfo(reportIntermediateStatus)
      const appData = this.app.getNodeInfoAppData()
      let result = { nodeInfo: { ...nodeInfo, appData } } as any
      if (isDebugMode() && req.query.debug === 'true') {
        result.debug = {
          queriedWhen: new Date().toISOString(),
          //Note we can't convert to shardusGetTime because process.uptime() uses Date.now() internally
          startedWhen: new Date(Date.now() - process.uptime() * 1000).toISOString(),
          uptimeMins: Math.round((100 * process.uptime()) / 60) / 100,
          pid: process.pid,
          currentQuarter: CycleCreator.currentQuarter,
          currentCycleMarker: CycleChain.getCurrentCycleMarker() ?? null,
          newestCycle: CycleChain.getNewest() ?? null,
          lostArchiversMap: {},
        }
      }
      res.json(result)
    })

    this.network.registerExternalGet('joinInfo', isDebugModeMiddlewareMedium, async (_req, res) => {
      const nodeInfo = Self.getPublicNodeInfo(true)
      let result = {
        respondedWhen: new Date().toISOString(),
        //Note we can't convert to shardusGetTime because process.uptime() uses Date.now() internally
        startedWhen: new Date(Date.now() - process.uptime() * 1000).toISOString(),
        uptimeMins: Math.round((100 * process.uptime()) / 60) / 100,
        pid: process.pid,
        publicKey: nodeInfo.publicKey,
        id: nodeInfo.id,
        status: nodeInfo.status,
        currentQuarter: CycleCreator.currentQuarter,
        currentCycleMarker: CycleChain.getCurrentCycleMarker() ?? null,
        previousCycleMarker: CycleChain.getNewest()?.previous,
        getStandbyListHash: JoinV2.getStandbyListHash(),
        getLastHashedStandbyList: JoinV2.getLastHashedStandbyList(),
        getSortedStandbyNodeList: JoinV2.getSortedStandbyJoinRequests(),
      }
      res.json(deepReplace(result, undefined, '__undefined__'))
    })

    this.network.registerExternalGet('standby-list-debug', isDebugModeMiddlewareLow, async (_req, res) => {
      let getSortedStandbyNodeList = JoinV2.getSortedStandbyJoinRequests()
      let result = getSortedStandbyNodeList.map((node) => ({
        pubKey: node.nodeInfo.publicKey,
        ip: node.nodeInfo.externalIp,
        port: node.nodeInfo.externalPort,
      }))
      res.json(result)
    })

    this.network.registerExternalGet('status-history', isDebugModeMiddlewareLow, async (_req, res) => {
      let result = Self.getStatusHistoryCopy()
      res.json(deepReplace(result, undefined, '__undefined__'))
    })

    this.network.registerExternalGet('socketReport', isDebugModeMiddlewareLow, async (_req, res) => {
      res.json({}) // getSocketReport not available
    })
    this.network.registerExternalGet('forceCycleSync', isDebugModeMiddlewareLow, async (req, res) => {
      let enable = req.query.enable === 'true' || false
      this.config.p2p.hackForceCycleSyncComplete = enable
      res.json({success: true})
    })

    this.network.registerExternalGet('calculate-fake-time-offset', isDebugModeMiddlewareHigh, async (req, res) => {
      const shift = req.query.shift ? parseInt(req.query.shift as string) : 0
      const spread = req.query.spread ? parseInt(req.query.spread as string) : 0
      // calculateFakeTimeOffset not available
      const offset = 0
      /* prettier-ignore */ this.mainLogger.debug({ message: "Calculated fakeTimeOffset", data: { shift, spread, offset } });
      res.json({ success: true })
    })

    this.network.registerExternalGet('clear-fake-time-offset', isDebugModeMiddlewareHigh, async (_req, res) => {
      // clearFakeTimeOffset not available  
      const offset = 0
      /* prettier-ignore */ this.mainLogger.debug({ message: "Cleared fakeTimeOffset", data: { offset } });
      res.json({ success: true })
    })

    // this.p2p.registerInternal(
    //   'sign-app-data',
    //   async (
    //     payload: {
    //       type: string
    //       nodesToSign: string
    //       hash: string
    //       appData: any
    //     },
    //     respond: (arg0: any) => any
    //   ) => {
    //     const { type, nodesToSign, hash, appData } = payload
    //     const { success, signature } = await this.app.signAppData?.(type, hash, Number(nodesToSign), appData)

    //     await respond({ success, signature })
    //   }
    // )

    // Binary handler removed - types not available
    // const signAppDataBinaryHandler: Route<InternalBinaryHandler<Buffer>> = {...}
    // this.p2p.registerInternalBinary(signAppDataBinaryHandler.name, signAppDataBinaryHandler.handler)

    // FOR internal testing. NEEDS to be removed for security purposes
    this.network.registerExternalPost('testGlobalAccountTX', isDebugModeMiddlewareMedium, async (req, res) => {
      try {
        this.mainLogger.debug(`testGlobalAccountTX: req:${utils.stringifyReduce(req.body)}`)
        const tx = req.body.tx
        this.put(tx, false, true)
        res.json({ success: true })
      } catch (ex) {
        this.mainLogger.debug('testGlobalAccountTX:' + ex.name + ': ' + ex.message + ' at ' + ex.stack)
        this.shardus_fatal(
          `registerExternalPost_ex`,
          'testGlobalAccountTX:' + ex.name + ': ' + ex.message + ' at ' + ex.stack
        )
      }
    })

    this.network.registerExternalPost('testGlobalAccountTXSet', isDebugModeMiddlewareMedium, async (req, res) => {
      try {
        this.mainLogger.debug(`testGlobalAccountTXSet: req:${utils.stringifyReduce(req.body)}`)
        const tx = req.body.tx
        this.put(tx, true, true)
        res.json({ success: true })
      } catch (ex) {
        this.mainLogger.debug('testGlobalAccountTXSet:' + ex.name + ': ' + ex.message + ' at ' + ex.stack)
        this.shardus_fatal(
          `registerExternalPost2_ex`,
          'testGlobalAccountTXSet:' + ex.name + ': ' + ex.message + ' at ' + ex.stack
        )
      }
    })
  }
}
