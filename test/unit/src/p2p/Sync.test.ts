// test/unit/src/p2p/Sync.test.ts

import { Logger } from 'log4js'
import * as http from '../../../../src/http'
import { P2P } from '@shardeum-foundation/lib-types'
import * as Sync from '../../../../src/p2p/Sync'
import * as CycleChain from '../../../../src/p2p/CycleChain'
import * as NodeList from '../../../../src/p2p/NodeList'
import * as Self from '../../../../src/p2p/Self'
import { network, logger } from '../../../../src/p2p/Context'
import { logFlags } from '../../../../src/logger'

// Mock dependencies
jest.mock('../../../../src/http')
jest.mock('../../../../src/p2p/CycleChain')
jest.mock('../../../../src/p2p/NodeList')
jest.mock('../../../../src/p2p/Self')
jest.mock('../../../../src/p2p/CycleParser', () => ({
    parse: jest.fn().mockReturnValue({
        added: [],
        updated: [],
        removed: [],
        final: {
            added: [],
            updated: [],
            removed: []
        }
    })
}))
jest.mock('../../../../src/p2p/Context', () => ({
    network: {
        _registerExternal: jest.fn(),
        ipInfo: {
            externalIp: '127.0.0.1',
            externalPort: 8080
        }
    },
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        getLogger: () => ({
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        }),
        mainLog: jest.fn(),
        mainLog_debug: jest.fn(),
        combine: jest.fn().mockImplementation((...args) => args.join(' ')),
    },
    crypto: {
        hash: jest.fn().mockReturnValue('mock-hash'),
        verify: jest.fn().mockReturnValue(true),
    },
    config: {
        debug: {
            robustQueryDebug: true,
            p2pNonFatal: true,
            important_as_error: true,
            important_as_fatal: true,
        },
        p2p: {
            problematicNodeConsecutiveRefuteThreshold: 3,
            problematicNodeRefutePercentageThreshold: 0.1,
            problematicNodeHistoryLength: 100,
        }
    },
    setLoggerContext: jest.fn(),
    setP2pContext: jest.fn(),
    setCryptoContext: jest.fn(),
    setNetworkContext: jest.fn(),
    setShardusContext: jest.fn(),
    setStateManagerContext: jest.fn(),
    setStorageContext: jest.fn(),
    setIOContext: jest.fn(),
    setReporterContext: jest.fn(),
    setConfig: jest.fn(),
    setDefaultConfigs: jest.fn(),
}))
jest.mock('../../../../src/logger', () => ({
    logFlags: {
        verbose: true,
        debug: true,
        info: true,
        error: true,
        fatal: true,
        console: true,
        p2pNonFatal: true,
        important_as_error: true,
        important_as_fatal: true,
        // ... other required flags
    }
}))
jest.mock('../../../../src/network', () => ({
    shardusGetTime: jest.fn().mockReturnValue(1000),
    getNetworkTimeOffset: jest.fn().mockReturnValue(0),
}))

describe('Sync', () => {
    let mockLogger: jest.Mocked<Logger>
    let mockMainLogger: any

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks()

        // Setup mock logger
        mockMainLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        }

        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            getLogger: jest.fn().mockReturnValue(mockMainLogger),
            mainLog: jest.fn(),
            mainLog_debug: jest.fn(),
            combine: jest.fn().mockImplementation((...args) => args.join(' ')),
        } as any

            // Mock Self module exports
            ; (Self as any).ip = '127.0.0.1'
            ; (Self as any).port = 8080

        // Initialize Sync module to set up p2pLogger
        Sync.init()
    })

    describe('init()', () => {
        it('should initialize routes and logger correctly', () => {
            expect(network._registerExternal).toHaveBeenCalledTimes(2) // For newestCycleRoute and cyclesRoute
        })
    })

    describe('getNewestCycle()', () => {
        const mockActiveNodes = [
            { ip: '127.0.0.2', port: 8081 }
        ]

        const mockCycleRecord = {
            counter: 1,
            active: 2,
            networkStateHash: 'hash',
            syncing: 0,
            joinedConsensors: [],
            activated: [],
            activatedPublicKeys: [],
            lost: [],
            refuted: [],
            joined: [],
            returned: [],
            apoptosized: [],
            networkDataHash: [],
            networkReceiptHash: [],
            networkSummaryHash: [],
            desired: 2,
            nodeListHash: 'mock-node-list-hash',
            archiverListHash: 'mock-archiver-list-hash',
            standbyNodeListHash: 'mock-standby-list-hash'
        }

        it('should successfully get newest cycle from active nodes', async () => {
            ; (http.get as jest.Mock).mockResolvedValueOnce({ newestCycle: mockCycleRecord })

            const result = await Sync.getNewestCycle(mockActiveNodes)

            expect(result).toEqual(mockCycleRecord)
            expect(http.get).toHaveBeenCalledWith('127.0.0.2:8081/sync-newest-cycle')
        })

        it('should throw error when no active nodes provided', async () => {
            await expect(Sync.getNewestCycle([])).rejects.toThrow('empty activeNodes')
        })

        it('should skip self node when querying', async () => {
            ; (http.get as jest.Mock).mockResolvedValueOnce({ newestCycle: mockCycleRecord })

            const result = await Sync.getNewestCycle(mockActiveNodes)

            expect(result).toEqual(mockCycleRecord)
            // Should skip first node (self) and query second node
            expect(http.get).toHaveBeenCalledWith('127.0.0.2:8081/sync-newest-cycle')
        })

        it('should handle null response from node', async () => {
            ; (http.get as jest.Mock).mockResolvedValueOnce(null)

            await expect(Sync.getNewestCycle(mockActiveNodes)).rejects.toThrow('warning: getNewestCycle: no newestCycle yet')
        })
    })
})