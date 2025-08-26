import { Console } from 'console'
import { PassThrough } from 'stream'
import { join } from 'path'
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, WriteStream } from 'fs'

export function startSaving(baseDir: string): void {
  // Settings (match prior defaults): 10MB max size, keep 10 backups, timestamped filenames
  const baseName = 'out'
  const ext = '.log'
  const maxLogSize = 10485760
  const numBackups = 10
  const pattern = 'yyyy-MM-dd-HH-mm-ss'

  let currentStream: WriteStream | null = null
  let currentSize = 0
  let lastStamp = ''
  let sameStampIndex = 0

  function format(date: Date): string {
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

  function buildFilePath(): string {
    const dir = baseDir
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const stamp = format(new Date())
    if (stamp === lastStamp) sameStampIndex += 1
    else {
      sameStampIndex = 0
      lastStamp = stamp
    }
    const suffix = sameStampIndex > 0 ? `.${String(sameStampIndex).padStart(2, '0')}` : ''
    return join(dir, `${baseName}.${stamp}${suffix}${ext}`)
  }

  function pruneBackups(): void {
    try {
      const dir = baseDir
      const files = readdirSync(dir)
        .filter((f) => f.startsWith(`${baseName}.`) && f.endsWith(ext))
        .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)
      for (let i = numBackups; i < files.length; i++) {
        try {
          unlinkSync(join(dir, files[i].f))
        } catch {}
      }
    } catch {}
  }

  function openNewStream(): void {
    try {
      if (currentStream) currentStream.end()
    } catch {}
    const filePath = buildFilePath()
    currentStream = createWriteStream(filePath, { flags: 'a' })
    currentSize = 0
    pruneBackups()
  }

  function writeChunk(chunk: Buffer): void {
    if (!currentStream) openNewStream()
    if (currentSize + chunk.length > maxLogSize) {
      openNewStream()
    }
    currentStream.write(chunk)
    currentSize += chunk.length
  }

  // Create passthroughs that write to stdout/stderr and to the rotating file stream
  const outPass = new PassThrough()
  outPass.pipe(process.stdout)
  outPass.on('data', (chunk: Buffer) => writeChunk(chunk))

  const errPass = new PassThrough()
  errPass.pipe(process.stderr)
  errPass.on('data', (chunk: Buffer) => writeChunk(chunk))

  // Monkey patch the global console with a new one that uses our passthroughs
  console = new Console({ stdout: outPass, stderr: errPass }) // eslint-disable-line no-global-assign
}
