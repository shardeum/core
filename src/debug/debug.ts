import path from 'path'
import { NetworkClass } from '../network'
import * as Context from '../p2p/Context'
import zlib from 'zlib'
import Trie from 'trie-prefix-tree'
import { isDebugModeMiddleware, isDebugModeMiddlewareMedium } from '../network/debugMiddleware'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { logFlags } from '../logger'
import { currentCycle } from '../p2p/CycleCreator'
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
        } catch (e) {
          nestedCountersInstance?.countEvent('logRotation', 'logRotation: pack error: ' + e.message)
        }
        return
      }
      // propagate non-ENOENT errors
      try {
        pack.destroy(err)
      } catch (e) {
        nestedCountersInstance?.countEvent('logRotation', 'logRotation: pack error2: ' + e.message)
      }
    })

    return pack
  }

  _registerRoutes() {
    this.network.registerExternalGet('debug', isDebugModeMiddlewareMedium, (req, res) => {
      const fatalLogger = log4js.getLogger('fatal')
      let archive
      let gzip
      try {
        nestedCountersInstance?.countEvent('logRotation', 'logRotation: calling debug route')

        debugZInProgress = true
        // Safety timer: if still true after 10 minutes, log & force clear
        let forceClearTimeout: NodeJS.Timeout | null = setTimeout(() => {
          if (debugZInProgress) {
            nestedCountersInstance?.countEvent(
              'logRotation',
              'logRotation: force-clear: still true after 10m (timeout)'
            )
            debugZInProgress = false
          }
        }, 10 * 60 * 1000)
        const logsOnlyRaw = req.query.logsOnly
        const logsOnly = typeof logsOnlyRaw === 'string' ? logsOnlyRaw === 'true' : false
        archive = this.createArchiveStream(logsOnly)
        gzip = zlib.createGzip()
        res.set('content-disposition', `attachment; filename="${this.archiveName}"`)
        res.set('content-type', 'application/gzip')
        // Helper to ensure we only clear the flag once
        let completed = false
        const complete = (reason: string, err?: any) => {
          if (completed) return
          completed = true
          if (forceClearTimeout) {
            try {
              clearTimeout(forceClearTimeout)
            } catch (e) {
              nestedCountersInstance?.countEvent(
                'logRotation',
                `logRotation: error clearing timeout: ${e?.message || e}`
              )
            }
            forceClearTimeout = null
          }
          debugZInProgress = false
          if (err) {
            nestedCountersInstance?.countEvent('logRotation', `logRotation: end: ${reason}: ${err?.message || err}`)
          } else {
            nestedCountersInstance?.countEvent('logRotation', `logRotation: end: ${reason}`)
          }
        }

        // Attach lifecycle handlers BEFORE piping to avoid missed events
        archive.on('error', (e: any) => {
          // createArchiveStream already handles ENOENT gracefully; still mark completion if fatal
          if (e && String(e).includes('ENOENT')) return // allow resume logic inside createArchiveStream
          try {
            fatalLogger.fatal('debug archive stream error', e)
          } catch {}
          if (!res.headersSent) {
            try {
              res.status(500).json({ success: false, error: 'archive stream error' })
            } catch {}
          } else {
            try {
              res.end()
            } catch {}
          }
          complete('archive_error', e)
        })

        gzip.on('error', (e: any) => {
          try {
            fatalLogger?.fatal('debug gzip error', e)
          } catch {}
          if (!res.headersSent) {
            try {
              res.status(500).json({ success: false, error: 'compression error' })
            } catch {}
          } else {
            try {
              res.end()
            } catch {}
          }
          complete('gzip_error', e)
        })

        res.on('error', (e: any) => {
          try {
            fatalLogger?.fatal('debug response error', e)
          } catch {}
          complete('res_error', e)
        })
        res.on('finish', () => complete('res_finish'))
        res.on('close', () => complete('res_close'))

        archive.pipe(gzip).pipe(res)

        nestedCountersInstance?.countEvent('logRotation', 'logRotation: calling debug route - pipe started')
      } catch (e) {
        // Log fatal error
        try {
          nestedCountersInstance?.countEvent('logRotation', 'logRotation: crash in debug route: ' + e.message)
          fatalLogger.fatal('debug route error:', e)
        } catch (e) {
          nestedCountersInstance?.countEvent('logRotation', 'logRotation: crash in debug route2: ' + e.message)
        }
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'debug archive failed' })
        } else {
          try {
            res.end()
          } catch (e) {
            nestedCountersInstance?.countEvent('logRotation', 'logRotation: crash in debug route3: ' + e.message)
          }
        }
        debugZInProgress = false // ensure flag reset on synchronous failure
        // Clear safety timer if it was set
        // forceClearTimeout is only defined inside try block; guard via optional chain
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
    this.network.registerExternalGet('debug_problemNodeTrackerDump', isDebugModeMiddleware, (_, res) => {
      try {
        const dump: Record<string, any> = {}
        let lastCycle = Context.p2p.state.getLastCycle()
        // Collect data for all nodes that have any refute history
        for (const [nodeId, node] of nodes as Map<string, Node>) {
          if (node.refuteCycles?.length > 0) {
            const refuteCycles = node.refuteCycles
            dump[nodeId] = {
              refuteCycles,
              stats: {
                refutePercentage: ProblemNodeHandler.getRefutePercentage(node.refuteCycles, lastCycle.counter),
                consecutiveRefutes: ProblemNodeHandler.getConsecutiveRefutes(refuteCycles, lastCycle.counter),
                isProblematic: ProblemNodeHandler.isNodeProblematic(node, lastCycle.counter),
              },
            }
          }
        }

        res.json({ success: true, data: { cycle: lastCycle.counter, nodeHistories: dump } })
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
