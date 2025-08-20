/**
 * Test Logger for FACT Protocol Testing
 * Provides dual logging: summary to console, detailed to file
 */

import fs from 'fs'
import path from 'path'

export class TestLogger {
  private logFilePath: string
  private logStream: fs.WriteStream
  private summaryMode: boolean = false
  private buffer: string[] = []
  
  constructor(logDir: string = './logs') {
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }
    
    // Generate timestamp for filename
    const now = new Date()
    const timestamp = now.toISOString()
      .replace(/:/g, '-')  // Replace colons for Windows compatibility
      .replace(/\..+/, '') // Remove milliseconds
      .replace('T', '_')   // Replace T with underscore for readability
    
    // Create log file path
    this.logFilePath = path.join(logDir, `fact-test-${timestamp}.log`)
    
    // Create write stream
    this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' })
    
    // Write header
    this.writeHeader()
    
    console.log(`📝 Detailed logs will be written to: ${this.logFilePath}`)
    console.log('')
  }
  
  private writeHeader(): void {
    const header = [
      '=' .repeat(80),
      'FACT Protocol Test Log',
      `Started: ${new Date().toISOString()}`,
      `Node Version: ${process.version}`,
      `Platform: ${process.platform}`,
      `Working Directory: ${process.cwd()}`,
      '=' .repeat(80),
      ''
    ].join('\n')
    
    this.logStream.write(header + '\n')
  }
  
  /**
   * Log a message (goes to file, and to console if in summary mode)
   */
  log(message: string, toConsole: boolean = false): void {
    const timestamp = new Date().toISOString()
    const logLine = `[${timestamp}] ${message}`
    
    // Always write to file
    this.logStream.write(logLine + '\n')
    
    // Write to console if requested or in summary mode
    if (toConsole || this.summaryMode) {
      console.log(message)
    }
  }
  
  /**
   * Log a summary message (always goes to console and file)
   */
  summary(message: string): void {
    // Write to file with timestamp
    const timestamp = new Date().toISOString()
    const logLine = `[${timestamp}] [SUMMARY] ${message}`
    this.logStream.write(logLine + '\n')
    
    // Always write summaries to console
    console.log(message)
  }
  
  /**
   * Log a detail message (only goes to file)
   */
  detail(message: string): void {
    const timestamp = new Date().toISOString()
    const logLine = `[${timestamp}] [DETAIL] ${message}`
    this.logStream.write(logLine + '\n')
  }
  
  /**
   * Log an error (always goes to both console and file)
   */
  error(message: string, error?: Error): void {
    const timestamp = new Date().toISOString()
    const logLine = `[${timestamp}] [ERROR] ${message}`
    
    this.logStream.write(logLine + '\n')
    if (error) {
      this.logStream.write(`[${timestamp}] [ERROR] Stack: ${error.stack}\n`)
    }
    
    console.error(`❌ ${message}`)
    if (error) {
      console.error(error)
    }
  }
  
  /**
   * Log a section header
   */
  section(title: string, toConsole: boolean = true): void {
    const separator = '='.repeat(Math.min(title.length + 4, 80))
    const messages = [
      '',
      separator,
      title,
      separator,
      ''
    ]
    
    messages.forEach(msg => {
      this.log(msg, toConsole)
    })
  }
  
  /**
   * Log a subsection header
   */
  subsection(title: string, toConsole: boolean = false): void {
    const separator = '-'.repeat(Math.min(title.length, 60))
    const messages = [
      '',
      title,
      separator
    ]
    
    messages.forEach(msg => {
      this.log(msg, toConsole)
    })
  }
  
  /**
   * Start buffering logs (for grouping related logs)
   */
  startBuffer(): void {
    this.buffer = []
  }
  
  /**
   * Add to buffer
   */
  bufferLog(message: string): void {
    this.buffer.push(message)
  }
  
  /**
   * Flush buffer to file
   */
  flushBuffer(): void {
    const timestamp = new Date().toISOString()
    this.buffer.forEach(msg => {
      this.logStream.write(`[${timestamp}] ${msg}\n`)
    })
    this.buffer = []
  }
  
  /**
   * Close the log file
   */
  close(): void {
    const footer = [
      '',
      '=' .repeat(80),
      `Test completed: ${new Date().toISOString()}`,
      '=' .repeat(80)
    ].join('\n')
    
    this.logStream.write(footer + '\n')
    this.logStream.end()
  }
  
  /**
   * Get the log file path
   */
  getLogFilePath(): string {
    return this.logFilePath
  }
}

// Singleton instance
let loggerInstance: TestLogger | null = null

/**
 * Get or create the logger instance
 */
export function getLogger(logDir?: string): TestLogger {
  if (!loggerInstance) {
    loggerInstance = new TestLogger(logDir)
  }
  return loggerInstance
}

/**
 * Close and reset the logger
 */
export function closeLogger(): void {
  if (loggerInstance) {
    loggerInstance.close()
    loggerInstance = null
  }
}