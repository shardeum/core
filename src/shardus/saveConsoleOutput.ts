import { Console } from 'console'
import { PassThrough, Transform } from 'stream'
import { join } from 'path'
import { RollingFileStream } from 'streamroller'

export function startSaving(baseDir: string): void {
  // Create a file to save combined stdout and stderr output
  const outFileName = `out.log`
  const stream = new RollingFileStream(join(baseDir, outFileName), 10000000, 10)

  // Create a transform stream factory that adds timestamps
  const createTimestampTransform = () => new Transform({
    transform(chunk, encoding, callback) {
      const lines = chunk.toString().split('\n')
      const timestampedLines = lines.map((line) => {
        if (line.trim()) {
          const timestamp = new Date().toISOString()
          return `${timestamp} - ${line}`
        }
        return line
      })
      callback(null, timestampedLines.join('\n'))
    }
  })

  // Create passthroughs that write to stdout, stderr, and the output file
  const outPass = new PassThrough()
  outPass.pipe(process.stdout)
  outPass.pipe(createTimestampTransform()).pipe(stream)

  const errPass = new PassThrough()
  errPass.pipe(process.stderr)
  errPass.pipe(createTimestampTransform()).pipe(stream)

  // Monkey patch the global console with a new one that uses our passthroughs
  console = new Console({ stdout: outPass, stderr: errPass }) // eslint-disable-line no-global-assign
}
