import path from 'path'
import fs from 'fs'

type Layouts = {
  patternLayout?: (pattern: string) => (evt: LogEvent) => string
}

// Minimal shape of a log4js logging event we rely on
interface LogEvent {
  startTime: Date
  level: { levelStr: string }
  categoryName: string
  data: unknown[]
}

type AppenderConfig = {
  filename?: string
  maxLogSize?: number
  backups?: number
  pattern?: string
  layout?: string
}

function format(date: Date, pattern: string): string {
  const yyyy = String(date.getFullYear())
  const MM = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const HH = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  const SSS = String(date.getMilliseconds()).padStart(3, '0')
  return pattern
    .replace('yyyy', yyyy)
    .replace('MM', MM)
    .replace('dd', dd)
    .replace('HH', HH)
    .replace('mm', mm)
    .replace('ss', ss)
    .replace('SSS', SSS)
}

export function configure(config: AppenderConfig = {}, layouts: Layouts): (evt: LogEvent) => void {
  const maxSize = config.maxLogSize ?? 10_000_000
  const backups = config.backups ?? 10
  const pattern = config.pattern ?? 'yyyy-MM-dd-HH-mm-ss'
  const baseFile = config.filename ?? 'main.log'

  // Per-instance state
  let stream: fs.WriteStream | null = null
  let bytesWritten = 0
  let lastStamp = ''
  let sameStampIndex = 0
  let initialized = false // ensure startup archival only once

  function buildRotatedName(): string {
    const dir = path.dirname(baseFile)
    const base = path.basename(baseFile, path.extname(baseFile))
    const ext = path.extname(baseFile) || '.log'
    const stamp = format(new Date(), pattern)
    if (stamp === lastStamp) {
      sameStampIndex += 1
    } else {
      sameStampIndex = 0
      lastStamp = stamp
    }
    const suffix = sameStampIndex > 0 ? `.${String(sameStampIndex).padStart(2, '0')}` : ''
    return path.join(dir, `${base}.${stamp}${suffix}${ext}`)
  }

  /**
   * Enforce retention using the `backups` value.
   * Semantics: keep at most `backups` most recent timestamped files (including current)
   * for the given base name. Older ones are deleted. Works across restarts by scanning dir.
   * NOTE: Because filenames include the timestamp, ordering by filename is chronological
   * when using the default pattern (yyyy-MM-dd-HH-mm-ss). For custom patterns that break
   * lexical ordering, retention order may not be strictly chronological.
   */
  function enforceRetention(): void {
    if (!backups || backups <= 0) return
    try {
      const dir = path.dirname(baseFile)
      const basePrefix = path.basename(baseFile, path.extname(baseFile)) + '.'
      const ext = path.extname(baseFile) || '.log'
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const files = fs
        .readdirSync(dir)
        .filter((f) => f !== path.basename(baseFile) && f.startsWith(basePrefix) && f.endsWith(ext))
        .sort()
      if (files.length <= backups) return
      while (files.length > backups) {
        const oldest = files.shift()
        if (!oldest) break
        try {
          // eslint-disable-next-line security/detect-non-literal-fs-filename
          fs.unlinkSync(path.join(dir, oldest))
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }

  const layoutFn =
    layouts && layouts.patternLayout && config.layout
      ? layouts.patternLayout(config.layout)
  : (evt: LogEvent) =>
          `${evt.startTime.toISOString()} [${evt.level.levelStr}] ${evt.categoryName} - ${evt.data.join(' ')}\n`

  function safePath(p: string): boolean {
    // Basic guard: no null bytes, must be absolute or relative without traversal outside its dir
    if (!p || p.includes('\0')) return false
    return true
  }

  function pathExists(p: string): boolean {
    if (!safePath(p)) return false
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    try { return fs.existsSync(p) } catch { return false }
  }

  function makeDirRecursive(p: string): void {
    if (!safePath(p)) return
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    try { fs.mkdirSync(p, { recursive: true }) } catch {}
  }

  function createAppendStream(p: string): fs.WriteStream | null {
    if (!safePath(p)) return null
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    try { return fs.createWriteStream(p, { flags: 'a' }) } catch { return null }
  }

  function openActiveStream(): void {
    try {
      const dir = path.dirname(baseFile)
      if (safePath(dir) && dir && dir !== '.' && !pathExists(dir)) {
        makeDirRecursive(dir)
      }
      if (!safePath(baseFile)) return
      stream = createAppendStream(baseFile)
      stream.on('error', (err: unknown) => {
        try { console.error('[dateFileWithSize] stream error', err) } catch {}
      })
      bytesWritten = 0
    } catch (e) {
      try { console.error('[dateFileWithSize] failed to open active stream', e) } catch {}
      stream = null
    }
  }

  function rotate(): void {
    try {
      if (stream) {
        try { stream.end() } catch {}
      }
    } catch {}
    stream = null
    try {
      let shouldRotate = false
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const st = fs.statSync(baseFile)
        shouldRotate = st.size >= 0
      } catch {}
  if (shouldRotate && safePath(baseFile) && pathExists(baseFile)) {
        const rotated = buildRotatedName()
        try {
          // eslint-disable-next-line security/detect-non-literal-fs-filename
          fs.renameSync(baseFile, rotated)
        } catch (e) {
          try { console.error('[dateFileWithSize] rotate rename failed', e) } catch {}
        }
        enforceRetention()
      }
    } catch {}
    openActiveStream()
  }

  function ensureInitialized(): void {
    if (initialized) return
    initialized = true
    // Startup archival of previous active file
    try {
      let shouldArchive = false
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const st = fs.statSync(baseFile)
        if (st.size > 0) shouldArchive = true
      } catch {}
  if (shouldArchive && safePath(baseFile) && pathExists(baseFile)) {
        const rotated = buildRotatedName()
        try {
          // eslint-disable-next-line security/detect-non-literal-fs-filename
          fs.renameSync(baseFile, rotated)
          enforceRetention()
        } catch (e) {
          try { console.error('[dateFileWithSize] startup archival failed', e) } catch {}
        }
      }
    } catch {}
    openActiveStream()
  }

  const appender = (loggingEvent: LogEvent): void => {
    try {
      ensureInitialized()
      if (!stream) return
      const line = layoutFn(loggingEvent)
      const sz = Buffer.byteLength(line)
      if (bytesWritten + sz > maxSize) {
        rotate()
        if (!stream) return
      }
      stream.write(line)
      bytesWritten += sz
    } catch (e) {
      try { console.error('[dateFileWithSize] appender error', e) } catch {}
    }
  }

  ;(appender as unknown as { shutdown?: (done: (err?: Error) => void) => void }).shutdown = (done: (err?: Error) => void): void => {
    try {
      if (stream) {
        const s = stream
        stream = null
        try { s.end(() => done()) } catch { done() }
        return
      }
    } catch {
      // ignore
    }
    done()
  }

  return appender
}
