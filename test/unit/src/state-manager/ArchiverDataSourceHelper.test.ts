import ArchiverDataSourceHelper from '../../../../src/state-manager/ArchiverDataSourceHelper'
import { nestedCountersInstance } from '../../../../src/utils/nestedCounters'
import { logFlags } from '../../../../src/logger'
import * as utils from '../../../../src/utils'
import { P2P } from '@shardeum-foundation/lib-types'

jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
  },
}))

jest.mock('../../../../src/logger', () => ({
  logFlags: {
    error: false,
  },
}))

jest.mock('../../../../src/utils', () => ({
  shuffleArray: jest.fn(),
}))

const createMockStateManager = (): any => ({
  mainLogger: {
    error: jest.fn(),
  },
})

const createMockArchiver = (ip: string, port: number): P2P.ArchiversTypes.JoinedArchiver =>
  ({
    ip,
    port,
    publicKey: `mock-public-key-${ip}-${port}`,
    curvePk: `mock-curve-pk-${ip}-${port}`,
    nodeId: `${ip}:${port}`,
    cycleJoined: 1,
    activeTimestamp: Date.now(),
  } as P2P.ArchiversTypes.JoinedArchiver)

describe('ArchiverDataSourceHelper', () => {
  let archiverDataSourceHelper: ArchiverDataSourceHelper
  let mockStateManager: any

  beforeEach(() => {
    jest.clearAllMocks()
    mockStateManager = createMockStateManager()
    archiverDataSourceHelper = new ArchiverDataSourceHelper(mockStateManager)
  })

  describe('constructor', () => {
    test('should initialize with stateManager', () => {
      expect(archiverDataSourceHelper.stateManager).toBe(mockStateManager)
    })
  })

  describe('initWithList', () => {
    test('should initialize with list of archivers', () => {
      const archivers = [
        createMockArchiver('127.0.0.1', 4000),
        createMockArchiver('127.0.0.2', 4001),
        createMockArchiver('127.0.0.3', 4002),
      ]

      archiverDataSourceHelper.initWithList(archivers)

      expect(utils.shuffleArray).toHaveBeenCalledWith(archivers)
      expect(archiverDataSourceHelper.dataSourceArchiverIndex).toBe(0)
      expect(archiverDataSourceHelper.dataSourceArchiver).toBe(archivers[0])
      expect(archiverDataSourceHelper.dataSourceArchiverList).toEqual(archivers)
    })

    test('should handle empty list', () => {
      const archivers: P2P.ArchiversTypes.JoinedArchiver[] = []

      archiverDataSourceHelper.initWithList(archivers)

      expect(utils.shuffleArray).toHaveBeenCalledWith(archivers)
      expect(archiverDataSourceHelper.dataSourceArchiverIndex).toBe(0)
      expect(archiverDataSourceHelper.dataSourceArchiver).toBeUndefined()
      expect(archiverDataSourceHelper.dataSourceArchiverList).toEqual([])
    })

    test('should create copy of archiver list', () => {
      const archivers = [createMockArchiver('127.0.0.1', 4000)]
      const originalLength = archivers.length

      archiverDataSourceHelper.initWithList(archivers)

      archivers.push(createMockArchiver('127.0.0.2', 4001))

      expect(archiverDataSourceHelper.dataSourceArchiverList.length).toBe(originalLength)
    })
  })

  describe('tryNextDataSourceArchiver', () => {
    beforeEach(() => {
      const archivers = [
        createMockArchiver('127.0.0.1', 4000),
        createMockArchiver('127.0.0.2', 4001),
        createMockArchiver('127.0.0.3', 4002),
      ]
      archiverDataSourceHelper.initWithList(archivers)
    })

    test('should move to next archiver successfully', () => {
      const result = archiverDataSourceHelper.tryNextDataSourceArchiver('test-debug')

      expect(result).toBe(true)
      expect(archiverDataSourceHelper.dataSourceArchiverIndex).toBe(1)
      expect(archiverDataSourceHelper.dataSourceArchiver.ip).toBe('127.0.0.2')
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'archiver_sync',
        'tryNextDataSourceArchiver next try: 1 of 3',
        1
      )
    })

    test('should return false when reaching end of list', () => {
      archiverDataSourceHelper.dataSourceArchiverIndex = 2

      const result = archiverDataSourceHelper.tryNextDataSourceArchiver('test-debug')

      expect(result).toBe(false)
      expect(archiverDataSourceHelper.dataSourceArchiverIndex).toBe(0)
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'archiver_sync',
        'tryNextDataSourceArchiver Out of tries: 0 of 3 ',
        1
      )
    })

    test('should handle null archiver in list', () => {
      archiverDataSourceHelper.dataSourceArchiverList[1] = null as any

      const result = archiverDataSourceHelper.tryNextDataSourceArchiver('test-debug')

      expect(result).toBe(false)
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'archiver_sync',
        'tryNextDataSourceArchiver next try: 1 of 3 ARCHIVER==null',
        1
      )
    })

    test('should log error messages when logFlags.error is true', () => {
      ;(logFlags as any).error = true

      archiverDataSourceHelper.tryNextDataSourceArchiver('test-debug')

      expect(mockStateManager.mainLogger.error).toHaveBeenCalledWith(
        'tryNextDataSourceArchiver test-debug try next archiver: 1'
      )
      expect(mockStateManager.mainLogger.error).toHaveBeenCalledWith(
        'tryNextDataSourceArchiver test-debug found: 127.0.0.2 4001 '
      )
    })

    test('should log error when running out of archivers', () => {
      ;(logFlags as any).error = true
      archiverDataSourceHelper.dataSourceArchiverIndex = 2

      archiverDataSourceHelper.tryNextDataSourceArchiver('test-debug')

      expect(mockStateManager.mainLogger.error).toHaveBeenCalledWith(
        'tryNextDataSourceArchiver test-debug ran out of archivers ask for data'
      )
    })

    test('should handle single archiver list', () => {
      const singleArchiver = [createMockArchiver('127.0.0.1', 4000)]
      archiverDataSourceHelper.initWithList(singleArchiver)

      const result = archiverDataSourceHelper.tryNextDataSourceArchiver('test-debug')

      expect(result).toBe(false)
      expect(archiverDataSourceHelper.dataSourceArchiverIndex).toBe(0)
    })
  })

  describe('tryRestartList', () => {
    test('should restart list with small number of archivers', () => {
      const archivers = [createMockArchiver('127.0.0.1', 4000), createMockArchiver('127.0.0.2', 4001)]
      archiverDataSourceHelper.initWithList(archivers)
      archiverDataSourceHelper.dataSourceArchiverIndex = 1

      const result = archiverDataSourceHelper.tryRestartList('test-debug')

      expect(result).toBe(true)
      expect(archiverDataSourceHelper.dataSourceArchiverIndex).toBe(0)
      expect(archiverDataSourceHelper.dataSourceArchiver).toBe(archivers[0])
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'sync',
        'ArchiverDataSourceHelper restartList test-debug numberArchivers:2',
        1
      )
    })

    test('should not restart list with large number of archivers', () => {
      const archivers = [
        createMockArchiver('127.0.0.1', 4000),
        createMockArchiver('127.0.0.2', 4001),
        createMockArchiver('127.0.0.3', 4002),
        createMockArchiver('127.0.0.4', 4003),
        createMockArchiver('127.0.0.5', 4004),
      ]
      archiverDataSourceHelper.initWithList(archivers)
      archiverDataSourceHelper.dataSourceArchiverIndex = 2

      const result = archiverDataSourceHelper.tryRestartList('test-debug')

      expect(result).toBe(false)
      expect(archiverDataSourceHelper.dataSourceArchiverIndex).toBe(0)
    })

    test('should return false with empty list', () => {
      archiverDataSourceHelper.initWithList([])

      const result = archiverDataSourceHelper.tryRestartList('test-debug')

      expect(result).toBe(false)
      expect(nestedCountersInstance.countEvent).toHaveBeenCalledWith(
        'sync',
        'ArchiverDataSourceHelper restartList test-debug numberArchivers:0',
        1
      )
    })

    test('should handle exactly 3 archivers', () => {
      const archivers = [
        createMockArchiver('127.0.0.1', 4000),
        createMockArchiver('127.0.0.2', 4001),
        createMockArchiver('127.0.0.3', 4002),
      ]
      archiverDataSourceHelper.initWithList(archivers)
      archiverDataSourceHelper.dataSourceArchiverIndex = 2

      const result = archiverDataSourceHelper.tryRestartList('test-debug')

      expect(result).toBe(true)
      expect(archiverDataSourceHelper.dataSourceArchiverIndex).toBe(0)
      expect(archiverDataSourceHelper.dataSourceArchiver).toBe(archivers[0])
    })

    test('should handle exactly 4 archivers', () => {
      const archivers = [
        createMockArchiver('127.0.0.1', 4000),
        createMockArchiver('127.0.0.2', 4001),
        createMockArchiver('127.0.0.3', 4002),
        createMockArchiver('127.0.0.4', 4003),
      ]
      archiverDataSourceHelper.initWithList(archivers)
      archiverDataSourceHelper.dataSourceArchiverIndex = 2

      const result = archiverDataSourceHelper.tryRestartList('test-debug')

      expect(result).toBe(false)
      expect(archiverDataSourceHelper.dataSourceArchiverIndex).toBe(0)
    })
  })

  describe('getNumberArchivers', () => {
    test('should return number of archivers in list', () => {
      const archivers = [
        createMockArchiver('127.0.0.1', 4000),
        createMockArchiver('127.0.0.2', 4001),
        createMockArchiver('127.0.0.3', 4002),
      ]
      archiverDataSourceHelper.initWithList(archivers)

      const result = archiverDataSourceHelper.getNumberArchivers()

      expect(result).toBe(3)
    })

    test('should return 0 for empty list', () => {
      archiverDataSourceHelper.initWithList([])

      const result = archiverDataSourceHelper.getNumberArchivers()

      expect(result).toBe(0)
    })

    test('should return correct count after initialization', () => {
      const archivers = [createMockArchiver('127.0.0.1', 4000)]
      archiverDataSourceHelper.initWithList(archivers)

      const result = archiverDataSourceHelper.getNumberArchivers()

      expect(result).toBe(1)
    })
  })

  describe('integration scenarios', () => {
    test('should handle complete archiver rotation', () => {
      const archivers = [createMockArchiver('127.0.0.1', 4000), createMockArchiver('127.0.0.2', 4001)]
      archiverDataSourceHelper.initWithList(archivers)

      expect(archiverDataSourceHelper.dataSourceArchiver.ip).toBe('127.0.0.1')

      const first = archiverDataSourceHelper.tryNextDataSourceArchiver('test-1')
      expect(first).toBe(true)
      expect(archiverDataSourceHelper.dataSourceArchiver.ip).toBe('127.0.0.2')

      const second = archiverDataSourceHelper.tryNextDataSourceArchiver('test-2')
      expect(second).toBe(false)
      expect(archiverDataSourceHelper.dataSourceArchiverIndex).toBe(0)

      const restart = archiverDataSourceHelper.tryRestartList('test-restart')
      expect(restart).toBe(true)
      expect(archiverDataSourceHelper.dataSourceArchiver.ip).toBe('127.0.0.1')
    })

    test('should handle archiver failure and recovery', () => {
      const archivers = [createMockArchiver('127.0.0.1', 4000), null as any, createMockArchiver('127.0.0.3', 4002)]
      archiverDataSourceHelper.initWithList(archivers)

      const first = archiverDataSourceHelper.tryNextDataSourceArchiver('test-1')
      expect(first).toBe(false)

      const second = archiverDataSourceHelper.tryNextDataSourceArchiver('test-2')
      expect(second).toBe(true)
      expect(archiverDataSourceHelper.dataSourceArchiver.ip).toBe('127.0.0.3')
    })

    test('should track counter events properly', () => {
      const archivers = [createMockArchiver('127.0.0.1', 4000)]
      archiverDataSourceHelper.initWithList(archivers)

      archiverDataSourceHelper.tryNextDataSourceArchiver('test-1')
      archiverDataSourceHelper.tryRestartList('test-restart')

      expect(nestedCountersInstance.countEvent).toHaveBeenCalledTimes(2)
      expect(nestedCountersInstance.countEvent).toHaveBeenNthCalledWith(
        1,
        'archiver_sync',
        'tryNextDataSourceArchiver Out of tries: 0 of 1 ',
        1
      )
      expect(nestedCountersInstance.countEvent).toHaveBeenNthCalledWith(
        2,
        'sync',
        'ArchiverDataSourceHelper restartList test-restart numberArchivers:1',
        1
      )
    })
  })
})
