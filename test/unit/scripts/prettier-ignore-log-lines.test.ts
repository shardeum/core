import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'

const scriptPath = path.resolve(__dirname, '../../../prettier-ignore-log-lines.js')

function runScriptWithFile(content: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prettier-test-'))
  const srcDir = path.join(tmpDir, 'src')
  fs.mkdirSync(srcDir)
  const filePath = path.join(srcDir, 'file.ts')
  fs.writeFileSync(filePath, content + '\n')
  const result = spawnSync('node', [scriptPath], { cwd: tmpDir })
  if (result.status !== 0) {
    throw new Error(result.stderr.toString())
  }
  const output = fs.readFileSync(filePath, 'utf8')
  fs.rmSync(tmpDir, { recursive: true, force: true })
  return output.trimEnd()
}

describe('prettier-ignore-log-lines script', () => {
  test('inserts comment for long instrumentation lines', () => {
    const content = [
      `  nestedCountersInstance.countEvent('cat', '${'x'.repeat(150)}')`,
      `  nestedCountersInstance.countRareEvent('cat', '${'x'.repeat(150)}')`,
      `  stateManager.statemanager_fatal('fatal', '${'x'.repeat(150)}')`,
      `  if (logFlags.verbose) console.log('${'x'.repeat(150)}')`,
    ].join('\n')

    const result = runScriptWithFile(content)
    const lines = result.split(/\r?\n/)
    for (const line of lines) {
      expect(line.startsWith('  /* prettier-ignore */ ')).toBe(true)
    }
  })

  test('keeps short and unrelated lines unchanged', () => {
    const originalLines = [
      `  nestedCountersInstance.countEvent('cat', 'short')`,
      `  console.log('hello')`,
    ]
    const result = runScriptWithFile(originalLines.join('\n'))
    const lines = result.split(/\r?\n/)
    lines.forEach((line, idx) => {
      expect(line).toBe(originalLines[idx])
    })
  })
})
