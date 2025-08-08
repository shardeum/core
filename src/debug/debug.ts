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
import * as NodeList from '../p2p/NodeList'
import * as CycleChain from '../p2p/CycleChain'
import { config } from '../p2p/Context'
const tar = require('tar-fs')
const fs = require('fs')

export let unsafeUnlock = false //REVIEWER WARNING: Never commit or merge this as true.  It disableds endpoint security for internal testing

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

  createArchiveStream() {
    const cwd = process.cwd()
    const filesRel = {}
    for (const src in this.files) {
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

    return pack
  }

  _registerRoutes() {
    this.network.registerExternalGet('debug', isDebugModeMiddlewareMedium, (req, res) => {
      const archive = this.createArchiveStream()
      const gzip = zlib.createGzip()
      res.set('content-disposition', `attachment; filename="${this.archiveName}"`)
      res.set('content-type', 'application/gzip')
      archive.pipe(gzip).pipe(res)
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
    
    // OOS Debug flags endpoint
    this.network.registerExternalGet('debug-oos-flags', isDebugModeMiddleware, (req, res) => {
      try {
        // Return current OOS flags
        const currentFlags = Context.config.debug?.oos || {}
        res.json({
          success: true,
          flags: currentFlags,
          enabled: Object.values(currentFlags).some(v => v !== 0 && v !== false)
        })
      } catch (e) {
        res.json({ success: false, error: e.message })
      }
    })
    
    this.network.registerExternalPost('debug-oos-flags', isDebugModeMiddleware, (req, res) => {
      try {
        // Ensure OOS config object exists
        if (!Context.config.debug) {
          Context.config.debug = {} as any
        }
        if (!Context.config.debug.oos) {
          Context.config.debug.oos = {} as any
        }
        
        const updates = req.body
        if (!updates || typeof updates !== 'object') {
          res.json({ success: false, error: 'Invalid request body' })
          return
        }
        
        // Validate and update each flag
        const validFlags = [
          'cacheUpdateFailureRate', 'cachePartialUpdateRate', 'cacheUpdateDelayMs',
          'storageWriteFailureRate', 'storagePartialWriteRate', 'storageWriteDelayMs', 'storageTimeoutMs',
          'reverseCacheStorageOrder', 'randomizeUpdateOrder', 'skipCacheUpdate', 'skipStorageUpdate',
          'timestampDriftMs', 'forceStaleTimestamps', 'randomTimestampRejection',
          'accountPatcherQueueDelay', 'dropAccountPatcherUpdates', 'reorderAccountPatcherQueue',
          'skipFifoLocks', 'fifoLockTimeoutMs', 'allowConcurrentUpdates',
          'corruptHashOnWrite', 'corruptDataOnWrite', 'truncateDataOnWrite',
          'simulateAsyncFailures', 'asyncOperationTimeoutMs', 'duplicateAsyncOperations'
        ]
        
        const updated = {}
        for (const [key, value] of Object.entries(updates)) {
          if (validFlags.includes(key)) {
            // Validate value types
            if (key.endsWith('Rate') || key.includes('Failure') || key.includes('Rejection') || key.includes('drop') || key.includes('corrupt') || key.includes('truncate')) {
              // These should be numbers between 0 and 1
              const numValue = parseFloat(value as string)
              if (!isNaN(numValue) && numValue >= 0 && numValue <= 1) {
                Context.config.debug.oos[key] = numValue
                updated[key] = numValue
              }
            } else if (key.endsWith('Ms') || key.endsWith('Delay') || key.endsWith('Timeout') || key === 'timestampDriftMs' || key === 'accountPatcherQueueDelay') {
              // These should be positive integers
              const intValue = parseInt(value as string)
              if (!isNaN(intValue) && intValue >= 0) {
                Context.config.debug.oos[key] = intValue
                updated[key] = intValue
              }
            } else if (typeof value === 'boolean') {
              // Boolean flags
              Context.config.debug.oos[key] = value
              updated[key] = value
            }
          }
        }
        
        nestedCountersInstance.countEvent('debug', 'oos-flags-updated')
        if (logFlags.debug) {
          console.log('OOS Debug flags updated:', updated)
        }
        
        res.json({
          success: true,
          updated,
          currentFlags: Context.config.debug.oos
        })
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
