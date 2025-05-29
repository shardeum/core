import { ProcessQueueStats, QueueEntry, SeenAccounts } from './state-manager-types'
import * as Shardus from '../shardus/shardus-types'
import { P2PModuleContext } from '../p2p/Context'

export interface TransactionQueueContext {
  // State management properties
  lastProcessStats: { [limitName: string]: ProcessQueueStats }
  queueReads: Set<string>
  queueWrites: Set<string>
  queueReadWritesOld: Set<string>
  pendingTransactionQueue: QueueEntry[]
  transactionProcessingQueueRunning: boolean
  largePendingQueueReported: boolean
  stateManager: any
  isStuckProcessing: boolean
  debugLastProcessingQueueStartTime: number
  processingLastRunTime: number
  processingMinRunBreak: number
  transactionQueueHasRemainingWork: boolean
  profiler: any
  _transactionQueue: QueueEntry[]
  queueRestartCounter: number
  app: Shardus.App
  queueTimingFixes: boolean
  pendingTransactionQueueByID: Map<string, QueueEntry>
  _transactionQueueByID: Map<string, QueueEntry>
  logger: any
  mainLogger: any
  seqLogger: any
  config: Shardus.StrictServerConfiguration
  queueStopped: boolean
  debugLastAwaitedCall: string
  
  // Additional properties from second interface
  queueEntryCounter: number
  p2p: P2PModuleContext
  executeInOneShard: boolean
  usePOQo: boolean
  useNewPOQ: boolean
  archivedQueueEntries: QueueEntry[]
  archivedQueueEntriesByID: Map<string, QueueEntry>
  archivedQueueEntryMaxCount: number
  crypto: any
  
  // Methods
  statemanager_fatal: (key: string, log: string) => void
  updateTxState: (queueEntry: QueueEntry, state: string, note?: string) => void
  processQueueEntry: (queueEntry: QueueEntry, processStats: ProcessQueueStats, seenAccounts: SeenAccounts) => Promise<string>
  archiveQueueEntry: (queueEntry: QueueEntry) => void
  checkReadyForTxApply: () => Promise<void>
  processQueue_accountSeen: (seenAccounts: SeenAccounts, queueEntry: QueueEntry) => boolean
  processQueue_getUpstreamTx: (seenAccounts: SeenAccounts, queueEntry: QueueEntry) => QueueEntry | null
  processQueue_markAccountsSeen: (seenAccounts: SeenAccounts, queueEntry: QueueEntry) => void
  processQueue_accountSeen2: (seenAccounts: SeenAccounts, queueEntry: QueueEntry) => boolean
  processQueue_markAccountsSeen2: (seenAccounts: SeenAccounts, queueEntry: QueueEntry) => void
  processQueue_clearAccountsSeen: (seenAccounts: SeenAccounts, queueEntry: QueueEntry) => void
  processQueue_debugAccountData: (queueEntry: QueueEntry, app: Shardus.App) => string
  removeFromQueue: (queueEntry: QueueEntry, currentIndex: number) => void
  setTXExpired: (queueEntry: QueueEntry, currentIndex: number, message: string) => void
  setTxAlmostExpired: (queueEntry: QueueEntry, currentIndex: number, message: string) => void
  
  // Additional methods from second interface
  isAccountInQueue: (accountId: string) => boolean
  txDebugStartTiming: (queueEntry: QueueEntry, tag: string) => void
  txDebugMarkStartTime: (queueEntry: QueueEntry, tag: string) => void
  isTxInPendingNonceQueue: (accountId: string, txId: string) => boolean
  addTransactionToNonceQueue: (nonceQueueItem: any) => { success: boolean; reason?: string; alreadyAdded?: boolean }
  getQueueEntrySafe: (txId: string) => QueueEntry | null
  updateHomeInformation: (queueEntry: QueueEntry) => void
  orderNodesByRank: (nodes: any[], key: string) => any[]
  computeNodeRank: (node: any, key: string) => number
  queueEntryGetTransactionGroup: (queueEntry: QueueEntry, tryUpdate?: boolean) => Shardus.Node[]
  queueEntryGetConsensusGroup: (queueEntry: QueueEntry) => Shardus.Node[]
  getStartAndEndIndexOfTargetGroup: (targetGroup: string[], transactionGroup: any[]) => { startIndex: number; endIndex: number }
  addOriginalTxDataToForward: (queueEntry: QueueEntry) => void
  computeTxSieveTime: (queueEntry: QueueEntry) => number
  queueEntryPrePush: (queueEntry: QueueEntry) => void
  shareCompleteDataToNeighbours: (queueEntry: QueueEntry) => Promise<void>
  queueEntryAddData: (queueEntry: QueueEntry, data: Shardus.WrappedResponse, signatureCheck?: boolean) => void
  txDebugMarkEndTime: (queueEntry: QueueEntry, tag: string) => void
  dumpTxDebugToStatList: (queueEntry: QueueEntry) => void
}