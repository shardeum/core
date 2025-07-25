/* eslint-disable security/detect-non-literal-fs-filename */
/* eslint-disable @typescript-eslint/no-var-requires */
import * as fs from 'fs'
import { logPerfEvents } from '../../../../src/logger/csvPerfEvents'

// Mock dependencies
jest.mock('fs')
jest.mock('../../../../src/p2p/Context', () => ({
  config: {
    debug: {
      logCSVPerfEvents: true,
      numOfPerfEventsNeededForLogging: 3,
    },
  },
}))
jest.mock('../../../../src/p2p/CycleCreator', () => ({
  currentCycle: 42,
}))
jest.mock('../../../../src/shardus', () => ({
  logDir_global: '/test/log/dir',
}))

// Import mocked modules to modify config
import { config } from '../../../../src/p2p/Context'

const mockFs = fs as jest.Mocked<typeof fs>

describe('csvPerfEvents', () => {
  const mockFilePath = '/test/log/dir/nodePerfEvents.csv'
  let dateNowSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    // Reset module state by re-requiring
    jest.resetModules()
    // Clear the module cache to ensure fresh imports
    jest.isolateModules(() => {
      // No-op to clear module cache
    })
    // Mock Date.now to return consistent value
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1234567890)
  })

  afterEach(() => {
    dateNowSpy.mockRestore()
    jest.resetModules()
  })

  describe('logPerfEvents', () => {
    it('should not log when logCSVPerfEvents is false', () => {
      config.debug.logCSVPerfEvents = false

      logPerfEvents('testEvent')

      expect(mockFs.existsSync).not.toHaveBeenCalled()
      expect(mockFs.appendFileSync).not.toHaveBeenCalled()
    })

    it('should create CSV file with headers when file does not exist', () => {
      config.debug.logCSVPerfEvents = true
      mockFs.existsSync.mockReturnValue(false)

      logPerfEvents('testEvent')

      expect(mockFs.existsSync).toHaveBeenCalledWith(mockFilePath)
      expect(mockFs.appendFileSync).toHaveBeenCalledWith(mockFilePath, 'timestamp,eventName,cycleNumber\n', 'utf8')
      expect(mockFs.appendFileSync).toHaveBeenCalledWith(mockFilePath, '1234567890,testEvent,42\n', 'utf8')
    })

    it('should append event when file exists and is under 10MB', () => {
      config.debug.logCSVPerfEvents = true
      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ size: 1000 } as fs.Stats)

      logPerfEvents('testEvent')

      expect(mockFs.existsSync).toHaveBeenCalledWith(mockFilePath)
      expect(mockFs.statSync).toHaveBeenCalledWith(mockFilePath)
      expect(mockFs.appendFileSync).toHaveBeenCalledWith(mockFilePath, '1234567890,testEvent,42\n', 'utf8')
    })

    it('should not log when file is over 10MB', () => {
      config.debug.logCSVPerfEvents = true
      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue({ size: 10_485_761 } as fs.Stats)
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      logPerfEvents('testEvent')

      expect(mockFs.existsSync).toHaveBeenCalledWith(mockFilePath)
      expect(mockFs.statSync).toHaveBeenCalledWith(mockFilePath)
      expect(consoleSpy).toHaveBeenCalledWith('perf events csv file size is > 10MB!')
      expect(mockFs.appendFileSync).not.toHaveBeenCalled()

      consoleSpy.mockRestore()
    })

    it('should handle undefined stats gracefully', () => {
      config.debug.logCSVPerfEvents = true
      mockFs.existsSync.mockReturnValue(true)
      mockFs.statSync.mockReturnValue(undefined as unknown as fs.Stats)

      logPerfEvents('testEvent')

      expect(mockFs.appendFileSync).toHaveBeenCalledWith(mockFilePath, '1234567890,testEvent,42\n', 'utf8')
    })

    describe('buffering behavior', () => {
      it('should write directly for first N events', () => {
        jest.isolateModules(() => {
          jest.doMock('fs')
          jest.doMock('../../../../src/p2p/Context', () => ({
            config: {
              debug: {
                logCSVPerfEvents: true,
                numOfPerfEventsNeededForLogging: 3,
              },
            },
          }))
          jest.doMock('../../../../src/p2p/CycleCreator', () => ({
            currentCycle: 42,
          }))
          jest.doMock('../../../../src/shardus', () => ({
            logDir_global: '/test/log/dir',
          }))

          const { logPerfEvents } = require('../../../../src/logger/csvPerfEvents')
          const mockFs = require('fs') as jest.Mocked<typeof fs>
          mockFs.existsSync.mockReturnValue(true)
          mockFs.statSync.mockReturnValue({ size: 1000 } as fs.Stats)
          jest.spyOn(Date, 'now').mockReturnValue(1234567890)

          // First 3 events should be written directly
          logPerfEvents('event1')
          logPerfEvents('event2')
          logPerfEvents('event3')

          expect(mockFs.appendFileSync).toHaveBeenCalledTimes(3)
        })
      })

      it('should buffer events and flush on Nth multiple', () => {
        jest.isolateModules(() => {
          jest.doMock('fs')
          jest.doMock('../../../../src/p2p/Context', () => ({
            config: {
              debug: {
                logCSVPerfEvents: true,
                numOfPerfEventsNeededForLogging: 3,
              },
            },
          }))
          jest.doMock('../../../../src/p2p/CycleCreator', () => ({
            currentCycle: 42,
          }))
          jest.doMock('../../../../src/shardus', () => ({
            logDir_global: '/test/log/dir',
          }))

          const { logPerfEvents } = require('../../../../src/logger/csvPerfEvents')
          const mockFs = require('fs') as jest.Mocked<typeof fs>
          mockFs.existsSync.mockReturnValue(true)
          mockFs.statSync.mockReturnValue({ size: 1000 } as fs.Stats)
          jest.spyOn(Date, 'now').mockReturnValue(1234567890)

          // Write first 3 events directly (numOfEvents: 0, 1, 2)
          logPerfEvents('event1')
          logPerfEvents('event2')
          logPerfEvents('event3')

          // Clear previous calls
          mockFs.appendFileSync.mockClear()

          // Event 4: numOfEvents=3, 3%3=0, so it flushes buffer (empty) and writes event4
          logPerfEvents('event4')
          expect(mockFs.appendFileSync).toHaveBeenCalledTimes(1)

          mockFs.appendFileSync.mockClear()

          // Events 5 and 6 should be buffered
          logPerfEvents('event5')
          logPerfEvents('event6')
          expect(mockFs.appendFileSync).not.toHaveBeenCalled()

          // Event 7: numOfEvents=6, 6%3=0, so it should flush buffer
          logPerfEvents('event7')
          expect(mockFs.appendFileSync).toHaveBeenCalledTimes(3) // event5, event6, event7
        })
      })
    })
  })

  describe('writeBufferToCSV', () => {
    it('should write all buffered events to CSV', () => {
      jest.isolateModules(() => {
        jest.doMock('fs')
        jest.doMock('../../../../src/p2p/Context', () => ({
          config: {
            debug: {
              logCSVPerfEvents: true,
              numOfPerfEventsNeededForLogging: 3,
            },
          },
        }))
        jest.doMock('../../../../src/p2p/CycleCreator', () => ({
          currentCycle: 42,
        }))
        jest.doMock('../../../../src/shardus', () => ({
          logDir_global: '/test/log/dir',
        }))

        const { logPerfEvents, writeBufferToCSV } = require('../../../../src/logger/csvPerfEvents')
        const mockFs = require('fs') as jest.Mocked<typeof fs>
        mockFs.existsSync.mockReturnValue(true)
        mockFs.statSync.mockReturnValue({ size: 1000 } as fs.Stats)
        jest.spyOn(Date, 'now').mockReturnValue(1234567890)

        // Write first 3 events directly
        logPerfEvents('event1')
        logPerfEvents('event2')
        logPerfEvents('event3')

        // Event 4 is written directly (numOfEvents=3, 3%3=0)
        logPerfEvents('event4')

        // Buffer events 5 and 6
        logPerfEvents('event5')
        logPerfEvents('event6')

        mockFs.appendFileSync.mockClear()

        // Write buffer to CSV
        writeBufferToCSV()

        expect(mockFs.appendFileSync).toHaveBeenCalledTimes(2)
        expect(mockFs.appendFileSync).toHaveBeenCalledWith(mockFilePath, '1234567890,event5,42\n', 'utf8')
        expect(mockFs.appendFileSync).toHaveBeenCalledWith(mockFilePath, '1234567890,event6,42\n', 'utf8')
      })
    })

    it('should handle empty buffer gracefully', () => {
      jest.isolateModules(() => {
        jest.doMock('fs')
        jest.doMock('../../../../src/p2p/Context', () => ({
          config: {
            debug: {
              logCSVPerfEvents: true,
              numOfPerfEventsNeededForLogging: 3,
            },
          },
        }))
        jest.doMock('../../../../src/p2p/CycleCreator', () => ({
          currentCycle: 42,
        }))
        jest.doMock('../../../../src/shardus', () => ({
          logDir_global: '/test/log/dir',
        }))

        const { writeBufferToCSV } = require('../../../../src/logger/csvPerfEvents')
        const mockFs = require('fs') as jest.Mocked<typeof fs>

        writeBufferToCSV()

        expect(mockFs.appendFileSync).not.toHaveBeenCalled()
      })
    })

    it('should clear buffer after writing', () => {
      jest.isolateModules(() => {
        jest.doMock('fs')
        jest.doMock('../../../../src/p2p/Context', () => ({
          config: {
            debug: {
              logCSVPerfEvents: true,
              numOfPerfEventsNeededForLogging: 3,
            },
          },
        }))
        jest.doMock('../../../../src/p2p/CycleCreator', () => ({
          currentCycle: 42,
        }))
        jest.doMock('../../../../src/shardus', () => ({
          logDir_global: '/test/log/dir',
        }))

        const { logPerfEvents, writeBufferToCSV } = require('../../../../src/logger/csvPerfEvents')
        const mockFs = require('fs') as jest.Mocked<typeof fs>
        mockFs.existsSync.mockReturnValue(true)
        mockFs.statSync.mockReturnValue({ size: 1000 } as fs.Stats)
        jest.spyOn(Date, 'now').mockReturnValue(1234567890)

        // Write first 3 events
        logPerfEvents('event1')
        logPerfEvents('event2')
        logPerfEvents('event3')

        // Event 4 is written directly
        logPerfEvents('event4')

        // Buffer events 5 and 6
        logPerfEvents('event5')
        logPerfEvents('event6')

        mockFs.appendFileSync.mockClear()

        // Write buffer twice
        writeBufferToCSV()
        expect(mockFs.appendFileSync).toHaveBeenCalledTimes(2)

        mockFs.appendFileSync.mockClear()
        writeBufferToCSV()
        expect(mockFs.appendFileSync).not.toHaveBeenCalled()
      })
    })
  })
})
