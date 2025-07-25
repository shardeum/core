import RateLimiting from '../../../../src/rate-limiting/index'
import { NodeLoad } from '../../../../src/utils/profiler'
import { nestedCountersInstance } from '../../../../src/utils/nestedCounters'
import { shardusGetTime } from '../../../../src/network'
import { activeIdToPartition } from '../../../../src/p2p/NodeList'
import * as Self from '../../../../src/p2p/Self'
import * as Context from '../../../../src/p2p/Context'
import { logFlags } from '../../../../src/logger'

jest.mock('../../../../src/utils/nestedCounters')
jest.mock('../../../../src/network')
jest.mock('../../../../src/p2p/NodeList')
jest.mock('../../../../src/p2p/Self')
jest.mock('../../../../src/p2p/Context')
jest.mock('../../../../src/logger', () => ({
  logFlags: { seqdiagram: false },
  logger: {
    mainLog_debug: jest.fn(),
    combine: jest.fn(),
  },
}))
jest.mock('../../../../src/p2p/CycleCreator', () => ({
  currentCycle: 1,
  currentQuarter: 1,
}))
jest.mock('../../../../src/p2p/CycleAutoScale', () => ({
  reset: jest.fn(),
}))

describe('RateLimiting', () => {
  let rateLimiting: RateLimiting
  let mockConfig: any
  let mockSeqLogger: any
  let mockLoadDetection: any

  beforeEach(() => {
    mockConfig = {
      limitRate: true,
      loadLimit: {
        internal: 0.8,
        external: 0.9,
        txTimeInQueue: 1000,
        queueLength: 100,
        executeQueueLength: 50,
      },
    }

    mockSeqLogger = {
      info: jest.fn(),
    }

    mockLoadDetection = {
      getCurrentNodeLoad: jest.fn(),
      getQueueLoad: jest.fn(),
    }
    ;(Context as any).shardus = {
      loadDetection: mockLoadDetection,
    }
    ;(Context as any).config = {
      rateLimiting: mockConfig,
    }
    ;(nestedCountersInstance.countEvent as jest.Mock) = jest.fn()
    ;(shardusGetTime as jest.Mock) = jest.fn().mockReturnValue(1234567890)
    ;(activeIdToPartition.get as jest.Mock) = jest.fn().mockReturnValue('partition1')
    ;(Self as any).id = 'node1'
    ;(logFlags as any).seqdiagram = false

    rateLimiting = new RateLimiting(mockConfig, mockSeqLogger)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with config values', () => {
      expect(rateLimiting.limitRate).toBe(true)
      expect(rateLimiting.loadLimit).toEqual(mockConfig.loadLimit)
      expect(rateLimiting.seqLogger).toBe(mockSeqLogger)
    })
  })

  describe('calculateThrottlePropotion', () => {
    it('should calculate throttle proportion correctly', () => {
      const result = rateLimiting.calculateThrottlePropotion(0.9, 0.8)
      expect(result).toBe(0.5) // (0.9 - 0.8) / (1 - 0.8) = 0.1 / 0.2 = 0.5
    })

    it('should handle edge case when load equals limit', () => {
      const result = rateLimiting.calculateThrottlePropotion(0.8, 0.8)
      expect(result).toBe(0)
    })

    it('should handle edge case when load is at maximum', () => {
      const result = rateLimiting.calculateThrottlePropotion(1.0, 0.8)
      expect(result).toBe(1.0) // (1.0 - 0.8) / (1 - 0.8) = 0.2 / 0.2 = 1.0
    })
  })

  describe('getWinningLoad', () => {
    it('should return no throttle when loads are below limits', () => {
      const nodeLoad = { internal: 0.5, external: 0.6 }
      const queueLoad = { txTimeInQueue: 500, queueLength: 50, executeQueueLength: 25 }

      const result = rateLimiting.getWinningLoad(nodeLoad, queueLoad)

      expect(result.throttle).toBe(0)
      expect(result.loadType).toBeUndefined()
    })

    it('should return highest throttle when multiple loads exceed limits', () => {
      const nodeLoad = { internal: 0.9, external: 0.95 }
      const queueLoad = { txTimeInQueue: 1200, queueLength: 120, executeQueueLength: 60 }

      const result = rateLimiting.getWinningLoad(nodeLoad, queueLoad)

      expect(result.throttle).toBeGreaterThan(0)
      expect(result.loadType).toBeDefined()
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'loadRelated',
        expect.stringContaining('ratelimit reached')
      )
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'loadRelated',
        expect.stringContaining('ratelimit winning load factor')
      )
    })

    it('should skip loads with null or undefined limits', () => {
      const customLoadLimit = { ...rateLimiting.loadLimit, newMetric: null }
      rateLimiting.loadLimit = customLoadLimit
      const nodeLoad = { internal: 0.5, newMetric: 999 }
      const queueLoad = {}

      const result = rateLimiting.getWinningLoad(nodeLoad, queueLoad)

      expect(result.throttle).toBe(0)
      expect(result.loadType).toBeUndefined()
    })

    it('should handle single load exceeding limit', () => {
      const nodeLoad = { internal: 0.9 }
      const queueLoad = { txTimeInQueue: 500 }

      const result = rateLimiting.getWinningLoad(nodeLoad, queueLoad)

      expect(result.throttle).toBeGreaterThan(0)
      expect(result.loadType).toBe('internal')
    })
  })

  describe('isOverloaded', () => {
    beforeEach(() => {
      mockLoadDetection.getCurrentNodeLoad.mockReturnValue({ internal: 0.5, external: 0.6 })
      mockLoadDetection.getQueueLoad.mockReturnValue({ txTimeInQueue: 500, queueLength: 50, executeQueueLength: 25 })
    })

    it('should return false when limitRate is disabled', () => {
      rateLimiting.limitRate = false
      const result = rateLimiting.isOverloaded('tx123')
      expect(result).toBe(false)
    })

    it('should return false when loads are below limits', () => {
      const result = rateLimiting.isOverloaded('tx123')
      expect(result).toBe(false)
    })

    it('should use random to determine overload when throttle > 0', () => {
      mockLoadDetection.getCurrentNodeLoad.mockReturnValue({ internal: 0.9 })
      mockLoadDetection.getQueueLoad.mockReturnValue({})

      const mockRandom = jest.spyOn(Math, 'random')

      // Test case where random returns value less than throttle (should be overloaded)
      mockRandom.mockReturnValue(0.3)
      const result1 = rateLimiting.isOverloaded('tx123')
      expect(result1).toBe(true)

      // Test case where random returns value greater than throttle (should not be overloaded)
      mockRandom.mockReturnValue(0.8)
      const result2 = rateLimiting.isOverloaded('tx456')
      expect(result2).toBe(false)

      mockRandom.mockRestore()
    })

    it('should log sequence diagram when overloaded and seqdiagram flag is true', () => {
      ;(logFlags as any).seqdiagram = true
      mockLoadDetection.getCurrentNodeLoad.mockReturnValue({ internal: 0.9, external: 0.8 })
      mockLoadDetection.getQueueLoad.mockReturnValue({ txTimeInQueue: 1200, queueLength: 120, executeQueueLength: 60 })

      jest.spyOn(Math, 'random').mockReturnValue(0.1) // Force overloaded state

      const result = rateLimiting.isOverloaded('tx123')

      expect(result).toBe(true)
      expect(mockSeqLogger.info).toHaveBeenCalledTimes(3)
      expect(mockSeqLogger.info).toHaveBeenCalledWith(expect.stringContaining('overloaded_type'))
      expect(mockSeqLogger.info).toHaveBeenCalledWith(expect.stringContaining('overloaded_node'))
      expect(mockSeqLogger.info).toHaveBeenCalledWith(expect.stringContaining('overloaded_queue'))

      jest.spyOn(Math, 'random').mockRestore()
    })

    it('should count rejected transactions when overloaded', () => {
      mockLoadDetection.getCurrentNodeLoad.mockReturnValue({ internal: 0.9 })
      jest.spyOn(Math, 'random').mockReturnValue(0.1)

      rateLimiting.isOverloaded('tx123')

      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'loadRelated',
        expect.stringContaining('txRejected:')
      )

      jest.spyOn(Math, 'random').mockRestore()
    })
  })

  describe('configUpdated', () => {
    it('should update limitRate when config changes', () => {
      ;(Context as any).config.rateLimiting.limitRate = false
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      rateLimiting.configUpdated()

      expect(rateLimiting.limitRate).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith('Config updated for rateLimiting.limitRate', false)
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('RateLimiting', 'limitRate config updated')

      consoleSpy.mockRestore()
    })

    it('should update loadLimit when config changes', () => {
      const newLoadLimit = { internal: 0.7, external: 0.8 }
      ;(Context as any).config.rateLimiting.loadLimit = newLoadLimit
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      rateLimiting.configUpdated()

      expect(rateLimiting.loadLimit).toEqual(newLoadLimit)
      expect(consoleSpy).toHaveBeenCalledWith('Config updated for rateLimiting.loadLimit', newLoadLimit)
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('RateLimiting', 'loadLimit config updated')

      consoleSpy.mockRestore()
    })

    it('should not update when config values are the same', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      rateLimiting.configUpdated()

      expect(consoleSpy).not.toHaveBeenCalled()

      consoleSpy.mockRestore()
    })

    it('should handle errors during config update', () => {
      const originalConfig = Context.config
      ;(Context as any).config = null // Force an error

      rateLimiting.configUpdated()

      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith('RateLimiting', 'config update failed')
      ;(Context as any).config = originalConfig
    })
  })
})
