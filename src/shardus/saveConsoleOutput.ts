import { Console } from 'console'
import { PassThrough } from 'stream'
import { join } from 'path'
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, renameSync, WriteStream } from 'fs'

export function startSaving(baseDir: string): void {
  // Settings (match prior defaults): 10MB max size, keep 10 backups, timestamped filenames
  const baseName = 'out'
  const ext = '.log'
  const maxLogSize = 10485760
  const numBackups = 10
  const pattern = 'yyyy-MM-dd-HH-mm-ss'
  // NOTE: This implementation restores per-line timestamping (ISO8601) and strengthens
  // rotation/retention with defensive try/catch blocks so logging cannot crash the process.

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

  const basePath = join(baseDir, `${baseName}${ext}`) // active file without timestamp

  function buildRotatedName(): string {
    const dir = baseDir
    if (!existsSync(dir)) {
      try { mkdirSync(dir, { recursive: true }) } catch {}
    }
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
    if (!numBackups || numBackups <= 0) return
    try {
      const dir = baseDir
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const files = readdirSync(dir)
        .filter((f) => f !== `${baseName}${ext}` && f.startsWith(`${baseName}.`) && f.endsWith(ext))
        .map((f) => {
          try {
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            return { f, t: statSync(join(dir, f)).mtimeMs }
          } catch {
            return { f, t: 0 }
          }
        })
        .sort((a, b) => b.t - a.t)
      for (const target of files.slice(numBackups)) {
        try {
          const name = target.f
          if (!/^[A-Za-z0-9_.-]+$/.test(name)) continue
          // eslint-disable-next-line security/detect-non-literal-fs-filename
          unlinkSync(join(dir, name))
        } catch {
          // ignore unlink errors
        }
      }
    } catch {
      // ignore overall retention errors
    }
  }

  function openBaseStream(): void {
    try {
      if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true })
    } catch {}
    try {
      currentStream = createWriteStream(basePath, { flags: 'a' })
      currentSize = 0
    } catch {
      // ignore; logging disabled if this fails
    }
  }

  function rotateAndReopen(): void {
    // Flush any partial line to current file before rotate
    try { flushResidual() } catch {}
    try {
      if (currentStream) {
        try { currentStream.end() } catch {}
      }
    } catch {}
    currentStream = null
    try {
      // Only rotate if base file actually exists & has size
      let sizeOk = false
      try {
        const st = statSync(basePath)
        sizeOk = st.size >= 0 // rotate even empty to keep semantic separation (could require >0 if preferred)
      } catch {}
      if (sizeOk && existsSync(basePath)) {
        const rotated = buildRotatedName()
        try {
          renameSync(basePath, rotated)
        } catch (e) {
          try { process.stderr.write('[log-rotate] rename failed: ' + String(e) + '\n') } catch {}
        }
        pruneBackups()
      }
    } catch {}
    openBaseStream()
  }

  function writeChunk(chunk: Buffer): void {
    try {
      if (!currentStream) openBaseStream()
      if (!currentStream) return
      if (currentSize + chunk.length > maxLogSize) {
        rotateAndReopen()
        if (!currentStream) return
      }
      currentStream.write(chunk)
      currentSize += chunk.length
    } catch {
      // swallow write errors
    }
  }

  // Buffer for lines across chunk boundaries
  let lineBuffer = ''

  function addTimestamps(chunk: Buffer): Buffer {
    try {
      lineBuffer += chunk.toString('utf8')
      const lines = lineBuffer.split('\n')
      lineBuffer = lines.pop() ?? ''
      if (!lines.length) return Buffer.from('')
      const processed = lines
        .map((line) => {
          if (line.trim() === '') return line // preserve blank lines
          const ts = new Date().toISOString()
            // Prior format: `${timestamp} - ${line}`
          return `${ts} - ${line}`
        })
        .join('\n')
      return Buffer.from(processed + '\n')
    } catch {
      // On failure, emit raw chunk to avoid data loss
      return chunk
    }
  }

  function flushResidual(): void {
    try {
      if (lineBuffer && lineBuffer.trim() !== '') {
        const ts = new Date().toISOString()
        writeChunk(Buffer.from(`${ts} - ${lineBuffer}\n`))
      } else if (lineBuffer) {
        writeChunk(Buffer.from(lineBuffer))
      }
      lineBuffer = ''
    } catch {
      // ignore
    }
  }

  try {
    process.on('exit', flushResidual)
    process.on('SIGINT', () => {
      flushResidual()
      // allow default exit behavior
    })
  } catch {
    // ignore handler registration errors
  }

  // --- Startup archival of existing base file (previous run) ---
  try {
    let shouldArchive = false
    try {
      const st = statSync(basePath)
      if (st && st.size > 0) shouldArchive = true
    } catch {}
    if (shouldArchive) {
      try {
        const rotated = buildRotatedName()
        renameSync(basePath, rotated)
        pruneBackups()
      } catch (e) {
        try { process.stderr.write('[log-startup] archival rename failed: ' + String(e) + '\n') } catch {}
      }
    }
  } catch {}

  // Open the fresh active base file
  openBaseStream()

  // Create passthroughs that write to stdout/stderr and to the rotating file stream with per-line timestamps
  const outPass = new PassThrough()
  outPass.pipe(process.stdout)
  outPass.on('data', (chunk: Buffer) => {
    try {
      const stamped = addTimestamps(chunk)
      if (stamped.length) writeChunk(stamped)
    } catch {
      writeChunk(chunk)
    }
  })

  const errPass = new PassThrough()
  errPass.pipe(process.stderr)
  errPass.on('data', (chunk: Buffer) => {
    try {
      const stamped = addTimestamps(chunk)
      if (stamped.length) writeChunk(stamped)
    } catch {
      writeChunk(chunk)
    }
  })

  // Monkey patch the global console with a new one that uses our passthroughs
  try {
    console = new Console({ stdout: outPass, stderr: errPass }) // eslint-disable-line no-global-assign
  } catch {
    // ignore console patch errors
  }
}
