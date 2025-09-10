import { startSaving } from '../../../src/shardus/saveConsoleOutput'
import { Console } from 'console'
import { PassThrough } from 'stream'
import { join } from 'path'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

describe('saveConsoleOutput', () => {
  let originalConsole: Console
  let tempDir: string

  beforeEach(() => {
    // Save the original console
    originalConsole = console

    // Create temp directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-save-console-'))
  })

  afterEach(() => {
    // Restore original console
    global.console = originalConsole

    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }

    // Clear all mocks
    jest.clearAllMocks()
  })

  it('should create a plain log file on first write', async () => {
    startSaving(tempDir)
    console.log('hello world')
    await new Promise((r) => setTimeout(r, 10))
    const files = fs.readdirSync(tempDir).filter((f) => f === 'out.log')
    expect(files.length).toBe(1)
    expect(files[0]).toBe('out.log')
  })

  it('should monkey patch global console', () => {
    const originalConsoleRef = console

    startSaving(tempDir)

    // Check that console has been replaced
    expect(console).not.toBe(originalConsoleRef)
    expect(console).toBeInstanceOf(Console)
  })

  it('should write to stdout and stderr and create file output', async () => {
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true as any)
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true as any)

    startSaving(tempDir)

    console.log('to stdout')
    console.error('to stderr')
    await new Promise((r) => setTimeout(r, 10))

    expect(stdoutSpy).toHaveBeenCalled()
    expect(stderrSpy).toHaveBeenCalled()

    const files = fs.readdirSync(tempDir).filter((f) => f === 'out.log')
    expect(files.length).toBe(1)
    const stat = fs.statSync(join(tempDir, files[0]))
    expect(stat.size).toBeGreaterThan(0)

    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
  })

  it('should handle multiple calls to startSaving', () => {
    startSaving(tempDir)
    const firstConsole = console

    startSaving(tempDir)
    const secondConsole = console

    // Each call should create a new console
    expect(firstConsole).not.toBe(secondConsole)
  })

  it('should use filenames that start with out. and end with .log', async () => {
    startSaving(tempDir)
    console.log('filename test')
    await new Promise((r) => setTimeout(r, 10))
    const files = fs.readdirSync(tempDir).filter((f) => f === 'out.log')
    expect(files.length).toBe(1)
  })

  // Size and backup limits are enforced internally; rotation behavior is covered via integration.

  it('should handle different base directories', async () => {
    const customDir = path.join(tempDir, 'nested')
    startSaving(customDir)
    console.log('custom dir write')
    await new Promise((r) => setTimeout(r, 10))
    const files = fs.readdirSync(customDir).filter((f) => f === 'out.log')
    expect(files.length).toBe(1)
  })

  it('should replace console with a new Console instance', () => {
    const originalConsoleInstance = console

    startSaving(tempDir)

    // Verify console has been replaced
    expect(console).not.toBe(originalConsoleInstance)

    // Verify it's still a Console instance
    expect(console.log).toBeDefined()
    expect(console.error).toBeDefined()
    expect(console.warn).toBeDefined()
    expect(console.info).toBeDefined()
  })
})
