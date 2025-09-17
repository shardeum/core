import Logger, { logFlags } from '../../../../src/logger'
import LOGS_CONFIG from '../../../../src/config/logs'
import fs from 'fs'
import os from 'os'
import path from 'path'

describe('Logger seqdiagram flag', () => {
  let logger: Logger
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'))
    logger = new Logger(tempDir, LOGS_CONFIG, 'default')
    // ensure starting state
    logFlags.seqdiagram = false
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('setFatalFlags enables seqdiagram', () => {
    logger.setFatalFlags()
    expect(logFlags.seqdiagram).toBe(true)
  })

  test('setDisableAllFlags enables seqdiagram', () => {
    logger.setDisableAllFlags()
    expect(logFlags.seqdiagram).toBe(true)
  })

  test('setErrorFlags enables seqdiagram', () => {
    logger.setErrorFlags()
    expect(logFlags.seqdiagram).toBe(true)
  })

  test('setDefaultFlags enables seqdiagram', () => {
    logger.setDefaultFlags()
    expect(logFlags.seqdiagram).toBe(true)
  })
})
