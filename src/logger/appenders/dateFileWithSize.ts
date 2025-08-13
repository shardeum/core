import path from 'path'
import { RollingFileStream } from 'streamroller'

type Layouts = {
  patternLayout?: (pattern: string) => (evt: any) => string
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

export function configure(config: AppenderConfig = {}, layouts: Layouts) {
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

  const layoutFn =
    layouts && layouts.patternLayout && config.layout
      ? layouts.patternLayout(config.layout)
      : (evt: any) =>
          `${evt.startTime.toISOString()} [${evt.level.levelStr}] ${evt.categoryName} - ${evt.data.join(' ')}\n`

  function openNewStream() {
    const filePath = buildFilePath(baseFile, pattern)
    stream = new RollingFileStream(filePath, maxSize, backups)
    bytesWritten = 0
  }

  const appender = (loggingEvent: any) => {
    if (!stream) openNewStream()
    const line = layoutFn(loggingEvent)
    const sz = Buffer.byteLength(line)
    if (bytesWritten + sz > maxSize) {
      try {
        stream?.end()
      } catch {}
      stream = null
      openNewStream()
    }
    stream!.write(line)
    bytesWritten += sz
  }

  ;(appender as any).shutdown = (done: (err?: Error) => void) => {
    try {
      if (stream) {
        const s = stream
        stream = null
        s.end(() => done())
        return
      }
    } catch (e) {
      // ignore
    }
    done()
  }

  return appender
}
