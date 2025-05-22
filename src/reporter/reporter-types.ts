/**
 * Typed payload definitions for Reporter HTTP interactions.
 */
import type { CountedEvent } from '../statistics/countedEvents'
import type { NodeLoad } from '../utils/profiler'
export interface NodeIpInfo {
  externalIp: string
  externalPort: number
  internalIp: string
  internalPort: number
}

export interface JoinReportPayload {
  publicKey: string
  nodeIpInfo: NodeIpInfo
  appData: unknown
}

export interface JoinedReportPayload {
  nodeId: string
  publicKey: string
  nodeIpInfo: NodeIpInfo
  appData: unknown
}

export interface ActiveReportPayload {
  nodeId: string
}

export interface SyncStatementPayload {
  nodeId: string
  syncStatement: unknown
}

export interface RemovedReportPayload {
  nodeId: string
}

export interface HeartbeatReportPayload {
  nodeId: string
  data: HeartbeatReportData
}

export interface HeartbeatReportData {
  repairsStarted: number
  repairsFinished: number
  isDataSynced: boolean
  appState: string
  cycleMarker: string
  cycleCounter: number
  nodelistHash: string
  desiredNodes: number
  lastScalingTypeWinner: string | null
  lastScalingTypeRequested: string | null
  timestamp: number
  txInjected: number
  txApplied: number
  txRejected: number
  txExpired: number
  txProcessed: number
  reportInterval: number
  networkId: string
  nodeIpInfo: NodeIpInfo
  partitionReport: unknown
  globalSync: boolean
  partitions: number
  partitionsCovered: number
  countedEvents: CountedEvent[]
  currentLoad: {
    networkLoad: number
    nodeLoad: NodeLoad
  }
  queueLengthAll: number
  queueLength: number
  executeQueueLength: number
  queueLengthBuckets: unknown
  txTimeInQueue: number
  maxTxTimeInQueue: number
  rareCounters: Record<string, unknown>
  txCoverage: Record<string, unknown>
  isLost: boolean
  isRefuted: boolean
  shardusVersion: string
  appData: unknown
  archiverListHash: string
  lastInSyncResult: unknown
  cycleFinishedSyncing: number
  stillNeedsInitialPatchPostActive: boolean
  memory: NodeJS.MemoryUsage
}
