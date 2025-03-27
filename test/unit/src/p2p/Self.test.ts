import { P2P } from '@shardeum-foundation/lib-types'
import * as Context from '../../../../src/p2p/Context'
import * as network from '../../../../src/network'
import * as Comms from '../../../../src/p2p/Comms'
import * as Archivers from '../../../../src/p2p/Archivers'
import * as CycleCreator from '../../../../src/p2p/CycleCreator'
import * as GlobalAccounts from '../../../../src/p2p/GlobalAccounts'
import * as NodeList from '../../../../src/p2p/NodeList'
import * as Sync from '../../../../src/p2p/Sync'
import * as CycleChain from '../../../../src/p2p/CycleChain'
import * as Self from '../../../../src/p2p/Self'

const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    combine: jest.fn(),
    mainLog_debug: jest.fn()
}

// Then do the mocking
jest.mock('../../../../src/p2p/Comms')
jest.mock('../../../../src/p2p/Archivers')
jest.mock('../../../../src/p2p/CycleCreator')
jest.mock('../../../../src/p2p/GlobalAccounts')
jest.mock('../../../../src/p2p/NodeList')
jest.mock('../../../../src/p2p/Sync')
jest.mock('../../../../src/p2p/CycleChain')
jest.mock('../../../../src/p2p/ModeSystemFuncs')
jest.mock('../../../../src/p2p/CycleAutoScale')
jest.mock('../../../../src/p2p/SyncV2')
jest.mock('../../../../src/p2p/Join')
jest.mock('../../../../src/logger', () => ({
    logFlags: {}
}))

jest.mock('../../../../src/p2p/Context', () => ({
    logger: {
        getLogger: () => mockLogger
    },
    crypto: {
        getPublicKey: () => 'testPublicKey',
        convertPublicKeyToCurve: () => 'testCurveKey',
        sign: jest.fn(),
        verify: jest.fn()
    },
    config: {
        p2p: {
            useSyncProtocolV2: false,
            useJoinProtocolV2: false,
            cycleDuration: 30,
            maxNodes: 100
        },
        features: {
            archiverDataSubscriptionsUpdate: false
        }
    },
    setDefaultConfigs: jest.fn()
}))

describe('Self', () => {
    const mockIpInfo = {
        externalIp: '127.0.0.1',
        externalPort: 9001,
        internalIp: '127.0.0.1',
        internalPort: 9001
    }

    beforeEach(() => {
        jest.clearAllMocks()
            // Setup network.ipInfo mock
            ; (network.ipInfo as any) = mockIpInfo
            // Set the id value in Self module
            ; (Self as any).id = 'testId'
        // Initialize Self to set up p2pLogger
        Self.init()
    })

    describe('init()', () => {
        it('should initialize all required components', () => {
            Self.init()

            expect(Comms.init).toHaveBeenCalled()
            expect(Archivers.init).toHaveBeenCalled()
            expect(CycleCreator.init).toHaveBeenCalled()
            expect(GlobalAccounts.init).toHaveBeenCalled()
            expect(NodeList.init).toHaveBeenCalled()
            expect(Sync.init).toHaveBeenCalled()
            expect(CycleChain.init).toHaveBeenCalled()
        })

        it('should set initial IP and port from network info', () => {
            Self.init()
            expect(Self.ip).toBe(mockIpInfo.externalIp)
            expect(Self.port).toBe(mockIpInfo.externalPort)
        })
    })

    describe('getPublicNodeInfo()', () => {
        beforeEach(() => {
            Self.init()
        })

        it('should return correct node info structure', () => {
            // Mock NodeList.byPubKey for getNodeStatus
            ; (NodeList as any).byPubKey = new Map([
                ['testPublicKey', { status: P2P.P2PTypes.NodeStatus.ACTIVE }]
            ])

            const nodeInfo = Self.getPublicNodeInfo()

            expect(nodeInfo).toEqual({
                id: 'testId',
                publicKey: 'testPublicKey',
                curvePublicKey: 'testCurveKey',
                externalIp: mockIpInfo.externalIp,
                externalPort: mockIpInfo.externalPort,
                internalIp: mockIpInfo.internalIp,
                internalPort: mockIpInfo.internalPort,
                status: P2P.P2PTypes.NodeStatus.ACTIVE
            })
        })

        it('should handle case when node is not in NodeList', () => {
            // Mock empty NodeList.byPubKey
            ; (NodeList as any).byPubKey = new Map()

            const nodeInfo = Self.getPublicNodeInfo()

            expect(nodeInfo.status).toBeNull()
        })
    })

    describe('updateNodeState()', () => {
        beforeEach(() => {
            Self.init()
        })

        it('should update node state', () => {
            Self.updateNodeState(P2P.P2PTypes.NodeStatus.ACTIVE)
            const nodeInfo = Self.getPublicNodeInfo(true)
            expect(nodeInfo.status).toBe(P2P.P2PTypes.NodeStatus.ACTIVE)
        })
    })

    describe('contactArchiver()', () => {
        it('should throw error if no seed nodes are returned', async () => {
            ; (Archivers.postToArchiver as jest.Mock).mockResolvedValue({
                isErr: () => false,
                value: { nodeList: [] }
            })

            await expect(Self.contactArchiver('test')).rejects.toThrow()
            expect(mockLogger.info).toHaveBeenCalled()
        })
    })

    describe('setActive()', () => {
        it('should set isActive to true', () => {
            Self.setActive()
            expect(Self['isActive']).toBe(true)
        })
    })

    describe('setp2pIgnoreJoinRequests()', () => {
        it('should set p2pIgnoreJoinRequests flag', () => {
            Self.setp2pIgnoreJoinRequests(false)
            expect(Self['p2pIgnoreJoinRequests']).toBe(false)

            Self.setp2pIgnoreJoinRequests(true)
            expect(Self['p2pIgnoreJoinRequests']).toBe(true)
        })
    })
}) 