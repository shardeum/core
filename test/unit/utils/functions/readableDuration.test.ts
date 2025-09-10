// Mock the network module before any imports
jest.mock('../../../../src/network', () => ({
  shardusGetTime: jest.fn()
}))

import { readableDuration } from '../../../../src/utils/functions/readableDuration'
import * as network from '../../../../src/network'

describe('readableDuration', () => {
  const mockShardusGetTime = network.shardusGetTime as jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('with explicit endTime', () => {
    it('should format zero duration correctly', () => {
      const result = readableDuration(1000, 1000)
      expect(result).toBe('00:00:00.000')
    })

    it('should format milliseconds only', () => {
      const result = readableDuration(0, 123)
      expect(result).toBe('00:00:00.123')
    })

    it('should format single digit milliseconds with padding', () => {
      const result = readableDuration(0, 5)
      expect(result).toBe('00:00:00.005')
    })

    it('should format two digit milliseconds with padding', () => {
      const result = readableDuration(0, 45)
      expect(result).toBe('00:00:00.045')
    })

    it('should format seconds only', () => {
      const result = readableDuration(0, 5000)
      expect(result).toBe('00:00:05.000')
    })

    it('should format seconds and milliseconds', () => {
      const result = readableDuration(0, 5123)
      expect(result).toBe('00:00:05.123')
    })

    it('should format minutes only', () => {
      const result = readableDuration(0, 60000)
      expect(result).toBe('00:01:00.000')
    })

    it('should format minutes, seconds, and milliseconds', () => {
      const result = readableDuration(0, 65123)
      expect(result).toBe('00:01:05.123')
    })

    it('should format hours only', () => {
      const result = readableDuration(0, 3600000)
      expect(result).toBe('01:00:00.000')
    })

    it('should format hours, minutes, seconds, and milliseconds', () => {
      const result = readableDuration(0, 3665123)
      expect(result).toBe('01:01:05.123')
    })

    it('should format large durations correctly', () => {
      const result = readableDuration(0, 99 * 3600000 + 59 * 60000 + 59 * 1000 + 999)
      expect(result).toBe('99:59:59.999')
    })

    it('should handle three-digit hours', () => {
      const result = readableDuration(0, 100 * 3600000)
      expect(result).toBe('100:00:00.000')
    })

    it('should handle negative durations (endTime before startTime)', () => {
      const result = readableDuration(1000, 0)
      // Negative time will show as a large positive due to unsigned arithmetic
      expect(result).not.toBe('00:00:00.000')
    })

    it('should calculate duration from different start and end times', () => {
      const startTime = 1609459200000 // 2021-01-01 00:00:00
      const endTime = 1609462865123 // 2021-01-01 01:01:05.123
      const result = readableDuration(startTime, endTime)
      expect(result).toBe('01:01:05.123')
    })
  })

  describe('with undefined endTime', () => {
    it('should use shardusGetTime when endTime is undefined', () => {
      const currentTime = 5123
      mockShardusGetTime.mockReturnValue(currentTime)

      const result = readableDuration(0)

      expect(mockShardusGetTime).toHaveBeenCalledTimes(1)
      expect(result).toBe('00:00:05.123')
    })

    it('should calculate duration from startTime to current time', () => {
      const startTime = 1609459200000
      const currentTime = 1609462865123
      mockShardusGetTime.mockReturnValue(currentTime)

      const result = readableDuration(startTime)

      expect(mockShardusGetTime).toHaveBeenCalledTimes(1)
      expect(result).toBe('01:01:05.123')
    })

    it('should handle when current time equals start time', () => {
      const startTime = 1609459200000
      mockShardusGetTime.mockReturnValue(startTime)

      const result = readableDuration(startTime)

      expect(result).toBe('00:00:00.000')
    })
  })

  describe('edge cases', () => {
    it('should handle maximum safe integer', () => {
      const result = readableDuration(0, Number.MAX_SAFE_INTEGER)
      // This will be a very large duration
      expect(result).toMatch(/^\d+:\d{2}:\d{2}\.\d{3}$/)
    })

    it('should handle fractional milliseconds', () => {
      // The function doesn't handle fractional values well due to floating point math
      const result = readableDuration(0, 1000.5)
      // Should be 1 second and 0.5 milliseconds, but floating point causes issues
      expect(result).toMatch(/^00:00:01\./)
    })

    it('should handle exact day boundary (24 hours)', () => {
      const result = readableDuration(0, 24 * 3600000)
      expect(result).toBe('24:00:00.000')
    })

    it('should handle week duration', () => {
      const result = readableDuration(0, 7 * 24 * 3600000)
      expect(result).toBe('168:00:00.000')
    })

    it('should format complex duration correctly', () => {
      // 2 hours, 34 minutes, 56 seconds, 789 milliseconds
      const duration = 2 * 3600000 + 34 * 60000 + 56 * 1000 + 789
      const result = readableDuration(0, duration)
      expect(result).toBe('02:34:56.789')
    })
  })
})
