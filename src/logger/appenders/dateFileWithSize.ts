import path from 'path'
import fs from 'fs'
import { RollingFileStream } from 'streamroller'

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
  let stream: RollingFileStream | null = null
  let bytesWritten = 0
  let lastStamp = ''
  let sameStampIndex = 0

  function buildFilePath(localBaseFile: string, localPattern: string): string {
    const dir = path.dirname(localBaseFile)
    const base = path.basename(localBaseFile, path.extname(localBaseFile))
    const ext = path.extname(localBaseFile) || '.log'
    const stamp = format(new Date(), localPattern)
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
      const base = path.basename(baseFile, path.extname(baseFile)) + '.' // prefix including trailing dot
      const ext = path.extname(baseFile) || '.log'
      // collect files that match base.<something>.ext; avoid deleting the original baseFile if it exists without timestamp
  // Synchronous directory scan is acceptable here because rotation is infrequent
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(base) && f.endsWith(ext))
      if (files.length <= backups) return
      files.sort() // lexical sort sufficient for default pattern
      while (files.length > backups) {
        const oldest = files.shift()
        if (!oldest) break
        try {
          // eslint-disable-next-line security/detect-non-literal-fs-filename
          fs.unlinkSync(path.join(dir, oldest))
        } catch (e) {
          // swallow to avoid crashing logging system
        }
      }
    } catch (e) {
      // best-effort retention; ignore errors
    }
  }

  const layoutFn =
    layouts && layouts.patternLayout && config.layout
      ? layouts.patternLayout(config.layout)
  : (evt: LogEvent) =>
          `${evt.startTime.toISOString()} [${evt.level.levelStr}] ${evt.categoryName} - ${evt.data.join(' ')}\n`

  function openNewStream(): void {
    try {
      const filePath = buildFilePath(baseFile, pattern)
      stream = new RollingFileStream(filePath, maxSize, backups)
      // attach error listener to prevent unhandled exceptions
  stream.on('error', (err: unknown) => {
        try {
          // eslint-disable-next-line no-console
          console.error('[dateFileWithSize] stream error', err)
        } catch {}
      })
      bytesWritten = 0
      // After creating a new file, prune old ones
      enforceRetention()
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[dateFileWithSize] failed to open new stream', e)
      stream = null
    }
  }

  const appender = (loggingEvent: LogEvent): void => {
    try {
      if (!stream) openNewStream()
      if (!stream) return // give up silently if stream creation failed
      const line = layoutFn(loggingEvent)
      const sz = Buffer.byteLength(line)
      if (bytesWritten + sz > maxSize) {
        try {
          stream.end()
        } catch {}
        stream = null
        openNewStream()
        if (!stream) return
      }
      stream.write(line)
      bytesWritten += sz
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[dateFileWithSize] appender error', e)
    }
  }

  ;(appender as unknown as { shutdown?: (done: (err?: Error) => void) => void }).shutdown = (done: (err?: Error) => void): void => {
    try {
      if (stream) {
        const s = stream
        stream = null
        try {
          s.end(() => done())
        } catch (e) {
          done()
        }
        return
      }
    } catch (e) {
      // ignore
    }
    done()
  }

  return appender
}
