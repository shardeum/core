import path from 'path'
import { NetworkClass } from '../network'
import * as Context from '../p2p/Context'
import zlib from 'zlib'
import Trie from 'trie-prefix-tree'
import { isDebugModeMiddleware, isDebugModeMiddlewareMedium } from '../network/debugMiddleware'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { logFlags } from '../logger'
import * as ProblemNodeHandler from '../p2p/ProblemNodeHandler'
import { Node } from '@shardeum-foundation/lib-types/build/src/p2p/NodeListTypes'
import { nodes } from '../p2p/NodeList'
import log4js from 'log4js'
const tar = require('tar-fs')
const fs = require('fs')

export let unsafeUnlock = false //REVIEWER WARNING: Never commit or merge this as true.  It disableds endpoint security for internal testing
export let debugZInProgress = false

interface Debug {
  baseDir: string
  network: NetworkClass
  archiveName: string
  files: { [name: string]: string }
}

class Debug {
  constructor(baseDir: string, network: NetworkClass) {
    this.baseDir = baseDir
    this.network = network
    this.archiveName = `debug-${network.ipInfo.externalIp}-${network.ipInfo.externalPort}.tar.gz`
    this.files = {}
    this._registerRoutes()
  }

  addToArchive(src, dest) {
    if (path.isAbsolute(dest)) throw new Error('"dest" must be a relative path.')
    src = path.isAbsolute(src) ? src : path.resolve(path.join(this.baseDir, src))
    this.files[src] = dest
  }

  /**
   * Build a tar pack stream containing the files previously registered via addToArchive.
   * @param ignoreDBFiles If true, any file whose path contains a folder named "db" will be skipped.
   */
  createArchiveStream(ignroreDBFiles: boolean = false) {
    // note: ignroreDBFiles name kept to match external specification
    const ignoreDBFiles = ignroreDBFiles // internal canonical name
    const cwd = process.cwd()
    const filesRel = {}
    for (const src in this.files) {
      if (ignoreDBFiles) {
        // Detect a path segment named 'db'. Normalize to forward slashes for consistent matching.
        const normalized = src.replace(/\\/g, '/')
        if (/(^|\/)db(\/|$)/.test(normalized)) continue
      }
      const srcRel = path.relative(cwd, src).replace(/\\/g, '/')
      const dest = this.files[src]
      filesRel[srcRel] = dest
    }
    const entries = Object.keys(filesRel)
    const trie = Trie(entries)
    const pack = tar.pack(cwd, {
      entries,
      map: function (header) {
        let entry = header.name.replace(/\\/g, '/')
        // Find the closest entry for this item
        while (!trie.isPrefix(entry) && entry.length > 0) {
          entry = entry.slice(0, -1)
        }
        if (entry.length === 0) {
          if (logFlags.error) {
            nestedCountersInstance.countEvent('debug', 'error: No valid entry found for header')
            this.main.logger.error('debug: No valid entry found for header:', header.name)
          }
          return header
        }
        // Remove srcRel from header.name
        header.name = path.relative(entry, header.name)
        // Prefix dest to whatever remains
        const dest = filesRel[entry]
        if (!dest) {
          if (logFlags.error) {
            nestedCountersInstance.countEvent('debug', 'error: Destination not found for entry')
            this.main.logger.error('debug: Destination not found for entry:', entry)
          }
          return header
        }
        header.name = path.normalize(path.join(dest, header.name))
        return header
      },
    })

    // Tolerate files rotated/deleted during packing
    pack.on('error', (err: any) => {
      if (err && (err.code === 'ENOENT' || String(err).includes('ENOENT'))) {
        try {
          pack.resume()
        } catch {}
        return
      }
      // propagate non-ENOENT errors
      try {
        pack.destroy(err)
      } catch {}
    })

    return pack
  }

  _registerRoutes() {
    this.network.registerExternalGet('debug', isDebugModeMiddlewareMedium, (req, res) => {
      const fatalLogger = log4js.getLogger('fatal')
      let archive
      let gzip
      try {
        debugZInProgress = true
        const logsOnlyRaw = req.query.logsOnly
        const logsOnly = typeof logsOnlyRaw === 'string' ? logsOnlyRaw === 'true' : false
        archive = this.createArchiveStream(logsOnly)
        gzip = zlib.createGzip()
        res.set('content-disposition', `attachment; filename="${this.archiveName}"`)
        res.set('content-type', 'application/gzip')
        archive.pipe(gzip).pipe(res)
      } catch (e) {
        // Log fatal error
        try {
          nestedCountersInstance?.countEvent('logRotation', 'crash in debug route' + e.message)
          fatalLogger.fatal('debug route error:', e)
        } catch {}
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'debug archive failed' })
        } else {
          try { res.end() } catch {}
        }
      } finally {
        debugZInProgress = false
      }
    })
    this.network.registerExternalGet('debug-logfile', isDebugModeMiddlewareMedium, (req, res) => {
      const requestedFile = req.query.file
      if (typeof requestedFile !== 'string' || !requestedFile) {
        res.json({ success: false, error: 'Invalid file parameter' })
        return
      }

      const normalizedFile = path.normalize(requestedFile).replace(/^(\.\.[/\\])+/, '')

      const logsAbsolutePath = Object.keys(this.files).find((key) => this.files[key] === './logs')
      if (!logsAbsolutePath) {
        res.json({ success: false, error: 'Logs directory not found' })
        return
      }

      const filePath = path.join(logsAbsolutePath, normalizedFile)
      if (!filePath.startsWith(logsAbsolutePath)) {
        res.json({ success: false, error: 'File not found' })
        return
      }

      res.set('Content-Disposition', `attachment; filename="${path.basename(normalizedFile)}"`)
      res.set('Content-Type', 'text/plain')

      const fileStream = fs.createReadStream(filePath)
      fileStream.on('error', (error) => {
        res.json({ success: false, error: 'Error reading the file' })
        return
      })
      fileStream.pipe(res)
    })
    this.network.registerExternalGet('debug-network-delay', isDebugModeMiddleware, (req, res) => {
      try {
        const delay = req.query.delay && typeof req.query.delay === 'string' ? parseInt(req.query.delay) : 120 * 1000
        this.network.setDebugNetworkDelay(delay)
      } catch (e) {
        res.json({ success: false, error: e.message })
        return
      }
      res.json({ success: true })
      return
    })
    this.network.registerExternalGet('debug-forcedExpiration', isDebugModeMiddleware, (req, res) => {
      try {
        const forcedExpiration =
          req.query.forcedExpiration && typeof req.query.forcedExpiration === 'string'
            ? req.query.forcedExpiration === 'true'
            : false
        Context.config.debug.forcedExpiration = forcedExpiration
        nestedCountersInstance.countEvent('debug', `forcedExpiration set to ${forcedExpiration}`)
      } catch (e) {
        res.json({ success: false, error: e.message })
        return
      }
      res.json({ success: true })
      return
    })

    this.network.registerExternalGet('debug_problematicNodeCacheExport', isDebugModeMiddleware, (_, res) => {
      try {
        const cacheData = ProblemNodeHandler.exportProblematicNodeCache()

        if (!cacheData) {
          res.json({
            success: false,
            error:
              'Problematic node cache is not enabled or not available. Ensure enableProblematicNodeCacheBuilding is true.',
          })
          return
        }

        res.json({
          success: true,
          data: {
            compressed: true,
            cache: cacheData,
            timestamp: Date.now(),
          },
        })
      } catch (e) {
        res.json({ success: false, error: e.message })
      }
    })
    this.network.registerExternalGet('debug_getProblematicNodes', isDebugModeMiddleware, (_, res) => {
      try {
        // Check if we have a current cycle
        const currentCycleRecord = CycleChain.newest
        if (!currentCycleRecord) {
          res.json({
            success: false,
            error: 'No current cycle available',
          })
          return
        }

        // Get problematic nodes using the standard method
        const problematicNodeIds = ProblemNodeHandler.getProblematicNodes(currentCycleRecord)

        // Get detailed info for each problematic node
        const problematicNodesInfo = problematicNodeIds
          .map((nodeId) => {
            const node = NodeList.nodes.get(nodeId)
            if (!node) return null

            return {
              id: nodeId.substring(0, 8),
              fullId: nodeId,
              refuteCycles: node.refuteCycles || [],
              consecutiveRefutes: ProblemNodeHandler.getConsecutiveRefutes(
                node.refuteCycles || [],
                currentCycleRecord.counter
              ),
              refutePercentage: (
                ProblemNodeHandler.getRefutePercentage(node.refuteCycles || [], currentCycleRecord.counter) * 100
              ).toFixed(1),
            }
          })
          .filter((n) => n !== null)

        res.json({
          success: true,
          data: {
            currentCycle: currentCycleRecord.counter,
            totalActiveNodes: NodeList.activeByIdOrder.length,
            problematicNodesCount: problematicNodeIds.length,
            problematicNodes: problematicNodesInfo,
            evictionEnabled: config.p2p.enableProblematicNodeRemoval,
            thresholds: {
              consecutiveRefutes: config.p2p.problematicNodeConsecutiveRefuteThreshold,
              refutePercentage: config.p2p.problematicNodeRefutePercentageThreshold,
              historyLength: config.p2p.problematicNodeHistoryLength,
            },
          },
        })
      } catch (e) {
        res.json({ success: false, error: e.message })
      }
    })
    this.network.registerExternalGet('debug_simulateProblematic', isDebugModeMiddleware, (req, res) => {
      try {
        // Parse parameters with defaults
        const missConsensus = req.query.missConsensus ? parseFloat(req.query.missConsensus as string) : 0
        const networkDelay = req.query.networkDelay ? parseInt(req.query.networkDelay as string) : 0
        const dropMessages = req.query.dropMessages ? parseFloat(req.query.dropMessages as string) : 0
        const slowResponse = req.query.slowResponse ? parseFloat(req.query.slowResponse as string) : 0
        const slowDelayMs = req.query.slowDelayMs ? parseInt(req.query.slowDelayMs as string) : 0
        const reset = req.query.reset === 'true'

        // Validate parameters
        if (missConsensus < 0 || missConsensus > 1) {
          throw new Error('missConsensus must be between 0 and 1')
        }
        if (dropMessages < 0 || dropMessages > 1) {
          throw new Error('dropMessages must be between 0 and 1')
        }
        if (slowResponse < 0 || slowResponse > 1) {
          throw new Error('slowResponse must be between 0 and 1')
        }
        if (networkDelay < 0 || networkDelay > 60000) {
          throw new Error('networkDelay must be between 0 and 60000 ms')
        }
        if (slowDelayMs < 0 || slowDelayMs > 60000) {
          throw new Error('slowDelayMs must be between 0 and 60000 ms')
        }

        // Apply or reset configurations
        if (reset) {
          // Reset all problematic simulation settings
          if (Context.config?.debug) {
            Context.config.debug.missConsensusChance = 0
            Context.config.debug.fakeNetworkDelay = 0
            Context.config.debug.dropMessageChance = 0
            Context.config.debug.slowResponseChance = 0
            Context.config.debug.slowResponseDelay = 0
          }

          // Also reset network delay if it was set
          if (this.network.setDebugNetworkDelay) {
            this.network.setDebugNetworkDelay(0)
          }

          nestedCountersInstance.countEvent('debug', 'simulateProblematic reset')
          res.json({
            success: true,
            message: 'Problematic simulation settings reset',
            settings: {
              missConsensus: 0,
              networkDelay: 0,
              dropMessages: 0,
              slowResponse: 0,
              slowDelayMs: 0,
            },
          })
        } else {
          // Apply new settings
          if (Context.config?.debug) {
            Context.config.debug.missConsensusChance = missConsensus
            Context.config.debug.fakeNetworkDelay = networkDelay
            Context.config.debug.dropMessageChance = dropMessages
            Context.config.debug.slowResponseChance = slowResponse
            Context.config.debug.slowResponseDelay = slowDelayMs
          } else {
            res.json({ success: false, error: 'Debug configuration not available' })
            return
          }

          // Set network delay if available
          if (networkDelay > 0 && this.network.setDebugNetworkDelay) {
            this.network.setDebugNetworkDelay(networkDelay)
          }

          nestedCountersInstance.countEvent(
            'debug',
            `simulateProblematic configured: miss=${missConsensus}, delay=${networkDelay}, drop=${dropMessages}, slow=${slowResponse}/${slowDelayMs}ms`
          )

          res.json({
            success: true,
            message: 'Problematic simulation settings applied',
            settings: {
              missConsensus,
              networkDelay,
              dropMessages,
              slowResponse,
              slowDelayMs,
            },
          })
        }
      } catch (e) {
        res.json({ success: false, error: e.message })
      }
    })
    //NEVER EVER RELEASE THIS... can only uncommment for test branches
    // this.network.registerExternalGet('unsafe_unlock', (req, res) => {
    //   try {
    //     unsafeUnlock = req.query.unlock === 'true' ? true : false

    //   } catch (e) {
    //     res.json({ success: false, error: e.message })
    //     return
    //   }
    //   res.json({ success: true , unsafeUnlock})
    //   return
    // })
  }
}

export default Debug
