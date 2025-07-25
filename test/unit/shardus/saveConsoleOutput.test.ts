import { startSaving } from '../../../src/shardus/saveConsoleOutput'
import { Console } from 'console'
import { PassThrough } from 'stream'
import { RollingFileStream } from 'streamroller'
import { join } from 'path'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

jest.mock('streamroller')

describe('saveConsoleOutput', () => {
  let originalConsole: Console
  let tempDir: string
  let mockRollingFileStream: jest.Mocked<RollingFileStream>

  beforeEach(() => {
    // Save the original console
    originalConsole = console

    // Create temp directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-save-console-'))

    // Mock RollingFileStream - need to implement stream methods
    mockRollingFileStream = {
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
      pipe: jest.fn(),
      removeListener: jest.fn(),
      removeAllListeners: jest.fn(),
      setMaxListeners: jest.fn(),
      getMaxListeners: jest.fn(() => 10),
      listeners: jest.fn(() => []),
      listenerCount: jest.fn(() => 0),
      eventNames: jest.fn(() => []),
      prependListener: jest.fn(),
      prependOnceListener: jest.fn(),
      off: jest.fn(),
      addListener: jest.fn(),
      readable: true,
      writable: true,
    } as any
    ;(RollingFileStream as jest.MockedClass<typeof RollingFileStream>).mockImplementation(() => mockRollingFileStream)
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

  it('should create RollingFileStream with correct parameters', () => {
    startSaving(tempDir)

    expect(RollingFileStream).toHaveBeenCalledWith(join(tempDir, 'out.log'), 10000000, 10)
  })

  it('should monkey patch global console', () => {
    const originalConsoleRef = console

    startSaving(tempDir)

    // Check that console has been replaced
    expect(console).not.toBe(originalConsoleRef)
    expect(console).toBeInstanceOf(Console)
  })

  it('should create PassThrough streams that pipe to stdout, stderr and file', () => {
    const originalStdout = process.stdout
    const originalStderr = process.stderr

    // Mock pipe methods
    const stdoutPipeSpy = jest.spyOn(PassThrough.prototype, 'pipe')

    startSaving(tempDir)

    // Should have created two PassThrough streams
    expect(stdoutPipeSpy).toHaveBeenCalledTimes(4) // 2 calls per PassThrough (stdout/file, stderr/file)

    // Check that PassThrough streams pipe to correct destinations
    const pipeCalls = stdoutPipeSpy.mock.calls
    const destinations = pipeCalls.map((call) => call[0])

    expect(destinations).toContain(originalStdout)
    expect(destinations).toContain(originalStderr)
    expect(destinations.filter((d) => d === mockRollingFileStream)).toHaveLength(2)

    stdoutPipeSpy.mockRestore()
  })

  it('should handle multiple calls to startSaving', () => {
    startSaving(tempDir)
    const firstConsole = console

    startSaving(tempDir)
    const secondConsole = console

    // Each call should create a new console
    expect(firstConsole).not.toBe(secondConsole)
    expect(RollingFileStream).toHaveBeenCalledTimes(2)
  })

  it('should use "out.log" as the filename', () => {
    startSaving(tempDir)

    const expectedPath = join(tempDir, 'out.log')
    expect(RollingFileStream).toHaveBeenCalledWith(expectedPath, expect.any(Number), expect.any(Number))
  })

  it('should create RollingFileStream with 10MB max file size', () => {
    startSaving(tempDir)

    expect(RollingFileStream).toHaveBeenCalledWith(
      expect.any(String),
      10000000, // 10MB in bytes
      expect.any(Number)
    )
  })

  it('should create RollingFileStream with max 10 backup files', () => {
    startSaving(tempDir)

    expect(RollingFileStream).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Number),
      10 // max backup files
    )
  })

  it('should handle different base directories', () => {
    const customDir = '/custom/path'
    startSaving(customDir)

    expect(RollingFileStream).toHaveBeenCalledWith(join(customDir, 'out.log'), expect.any(Number), expect.any(Number))
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
