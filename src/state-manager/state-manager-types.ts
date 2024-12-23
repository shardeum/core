import { StateManager, P2P } from '@shardus/types';
import * as Shardus from '../shardus/shardus-types';
export { AcceptedTx, App, ApplyResponse, Cycle, Sign } from '../shardus/shardus-types';
export type WrappedStateArray = Shardus.WrappedData[];
export type HRTime = [
    number,
    number
];
export type TxDebug = {
    enqueueHrTime?: HRTime;
    dequeueHrTime?: HRTime;
    duration: {
        [key: string]: number;
    };
    startTime: {
        [key: string]: HRTime;
    };
    endTime: {
        [key: string]: HRTime;
    };
    startTimestamp: {
        [key: string]: number;
    };
    endTimestamp: {
        [key: string]: number;
    };
    cycleSinceActivated?: number;
    correspondingDebugInfo?: {
        ourIndex: number;
        ourUnwrappedIndex: number;
        callParams: {
            oi: number;
            st: number;
            et: number;
            gl: number;
            tg: number;
            sg: number;
            tn: number;
        };
        localKeys: {
            [x: string]: boolean;
        };
        oldCorrespondingIndices: number[];
        correspondingIndices: number[];
        correspondingNodeIds: string[];
    };
};
export type QueueEntry = {
    gossipedCompleteData: boolean;
    sharedCompleteData: boolean;
    eligibleNodeIdsToVote: Set<string>;
    eligibleNodeIdsToConfirm: Set<string>;
    acceptedTx: Shardus.AcceptedTx;
    txKeys: Shardus.TransactionKeys;
    collectedData: WrappedResponses;
    originalData: WrappedResponses;
    collectedFinalData: WrappedResponses;
    beforeHashes: {
        [accountID: string]: string;
    };
    homeNodes: {
        [accountID: string]: StateManager.shardFunctionTypes.NodeShardData;
    };
    executionShardKey: string;
    isInExecutionHome: boolean;
    patchedOnNodes: Map<string, StateManager.shardFunctionTypes.NodeShardData>;
    hasShardInfo: boolean;
    state: string;
    dataCollected: number;
    hasAll: boolean;
    entryID: number;
    localKeys: {
        [x: string]: boolean;
    };
    shardusMemoryPatternSets: ShardusMemoryPatternsSets;
    localCachedData: LocalCachedData;
    syncCounter: number;
    didSync: boolean;
    queuedBeforeMainSyncComplete: boolean;
    didWakeup: boolean;
    txGroupDebug: string;
    syncKeys: unknown[];
    logstate: string;
    requests: {
        [key: string]: Shardus.Node;
    };
    globalModification: boolean;
    noConsensus: boolean;
    m2TimeoutReached: boolean;
    waitForReceiptOnly: boolean;
    uniqueKeys?: string[];
    uniqueWritableKeys?: string[];
    ourNodeInTransactionGroup: boolean;
    ourNodeInConsensusGroup: boolean;
    ourNodeRank?: bigint;
    ourTXGroupIndex: number;
    ourExGroupIndex: number;
    conensusGroup?: Shardus.Node[];
    transactionGroup?: Shardus.Node[];
    executionGroup?: Shardus.NodeWithRank[] | Shardus.Node[];
    executionGroupMap?: Map<string, Shardus.NodeWithRank | Shardus.Node>;
    executionNodeIdSorted: string[];
    txGroupCycle: number;
    updatedTransactionGroup?: Shardus.Node[];
    updatedTxGroupCycle: number;
    approximateCycleAge: number;
    preApplyTXResult?: PreApplyAcceptedTransactionResult;
    poqoNextSendIndex?: number;
    poqoReceipt?: SignedReceipt;
    hasSentFinalReceipt?: boolean;
    ourProposal?: Proposal;
    ourVote?: Vote;
    signedReceipt?: SignedReceipt;
    ourVoteHash?: string;
    collectedVotes: AppliedVote[];
    collectedVoteHashes: AppliedVoteHash[];
    pendingVotes: Map<string, AppliedVote>;
    pendingConfirmOrChallenge: Map<string, ConfirmOrChallengeMessage>;
    receivedBestVote?: AppliedVote;
    receivedBestVoteHash?: string;
    receivedBestVoter?: Shardus.NodeWithRank;
    receivedBestConfirmation?: ConfirmOrChallengeMessage;
    receivedBestConfirmedNode?: Shardus.NodeWithRank;
    receivedBestChallenge?: ConfirmOrChallengeMessage;
    receivedBestChallenger?: Shardus.NodeWithRank;
    robustQueryVoteCompleted: boolean;
    robustQueryConfirmOrChallengeCompleted: boolean;
    newVotes: boolean;
    voteCastAge: number;
    dataSharedTimestamp: number;
    firstVoteReceivedTimestamp: number;
    firstConfirmOrChallengeTimestamp: number;
    lastVoteReceivedTimestamp: number;
    lastConfirmOrChallengeTimestamp: number;
    completedConfirmedOrChallenge: boolean;
    acceptVoteMessage: boolean;
    acceptConfirmOrChallenge: boolean;
    uniqueChallenges: {
        [key: string]: ConfirmOrChallengeMessage;
    };
    uniqueChallengesCount: number;
    robustAccountDataPromises?: {
        [key: string]: Promise<Shardus.WrappedData>;
    };
    queryingRobustVote?: boolean;
    queryingRobustConfirmOrChallenge?: boolean;
    queryingRobustAccountData?: boolean;
    queryingFinalData: boolean;
    lastFinalDataRequestTimestamp: number;
    topConfirmations: Set<string>;
    topVoters: Set<string>;
    almostExpired?: boolean;
    hasRobustConfirmation: boolean;
    gossipedReceipt: boolean;
    gossipedVote: boolean;
    gossipedConfirmOrChallenge: boolean;
    appliedReceipt?: AppliedReceipt;
    recievedAppliedReceipt?: AppliedReceipt;
    appliedReceiptForRepair?: AppliedReceipt;
    signedReceiptForRepair?: SignedReceipt;
    appliedReceiptFinal?: AppliedReceipt;
    signedReceiptFinal?: SignedReceipt;
    appliedReceipt2?: AppliedReceipt2;
    recievedAppliedReceipt2?: AppliedReceipt2;
    receivedSignedReceipt?: SignedReceipt;
    appliedReceiptForRepair2?: AppliedReceipt2;
    appliedReceiptFinal2?: AppliedReceipt2;
    repairStarted: boolean;
    repairFinished?: boolean;
    repairFailed: boolean;
    requestingReceipt: boolean;
    receiptEverRequested: boolean;
    cycleToRecordOn: number;
    involvedPartitions: number[];
    involvedGlobalPartitions: number[];
    shortReceiptHash: string;
    correspondingGlobalOffset: number;
    requestingReceiptFailed: boolean;
    debugFail_voteFlip: boolean;
    debugFail_failNoRepair: boolean;
    logID: string;
    hasValidFinalData: boolean;
    pendingDataRequest: boolean;
    fromClient: boolean;
    archived: boolean;
    involvedReads: {
        [accountID: string]: boolean;
    };
    involvedWrites: {
        [accountID: string]: boolean;
    };
    executionDebug?: ExecutionDebug;
    txDebug?: TxDebug;
    txSieveTime: number;
    accountDataSet: boolean;
    upStreamBlocker?: string;
    debug: {
        waitingOn?: string;
        loggedStats1?: boolean;
    };
    isSenderWrappedTxGroup: {
        [nodeId: string]: number;
    };
};
export type CycleShardData = {
    shardGlobals: StateManager.shardFunctionTypes.ShardGlobals;
    cycleNumber: number;
    ourNode: Shardus.Node;
    nodeShardData: StateManager.shardFunctionTypes.NodeShardData;
    nodeShardDataMap: Map<string, StateManager.shardFunctionTypes.NodeShardData>;
    parititionShardDataMap: Map<number, StateManager.shardFunctionTypes.ShardInfo>;
    nodes: Shardus.Node[];
    syncingNeighbors: Shardus.Node[];
    syncingNeighborsTxGroup: Shardus.Node[];
    hasSyncingNeighbors: boolean;
    partitionsToSkip: Map<number, boolean>;
    timestamp: number;
    timestampEndCycle: number;
    hasCompleteData: boolean;
    voters: number[];
    ourConsensusPartitions?: number[];
    ourStoredPartitions?: number[];
    calculationTime: number;
};
export type RepairTracker = {
    triedHashes: string[];
    numNodes: number;
    counter: number;
    partitionId: number;
    key: string;
    key2: string;
    removedTXIds: string[];
    repairedTXs: string[];
    newPendingTXs: Shardus.AcceptedTx[];
    newFailedTXs: Shardus.AcceptedTx[];
    extraTXIds: string[];
    missingTXIds: string[];
    repairing: boolean;
    repairsNeeded: boolean;
    busy: boolean;
    txRepairReady: boolean;
    txRepairComplete: boolean;
    evaluationStarted: boolean;
    evaluationComplete: boolean;
    awaitWinningHash: boolean;
    repairsFullyComplete: boolean;
    solutionDeltas?: SolutionDelta[];
    outputHashSet?: string;
};
export type PartitionReceipt = {
    resultsList: PartitionResult[];
    sign?: Shardus.Sign;
};
export type SimpleRange = {
    low: string;
    high: string;
};
export type PartitionObject = {
    Partition_id: number;
    Partitions: number;
    Cycle_number: number;
    Cycle_marker: string;
    Txids: string[];
    Status: number[];
    States: string[];
    Chain: unknown[];
};
export type PartitionResult = {
    Partition_id: number;
    Partition_hash: string;
    Cycle_number: number;
    hashSet: string;
    sign?: Shardus.Sign;
};
export type GenericHashSetEntry = {
    hash: string;
    votePower: number;
    hashSet: string;
    lastValue: string;
    errorStack: HashSetEntryError[];
    corrections: HashSetEntryCorrection[];
    indexOffset: number;
    waitForIndex: number;
    waitedForThis?: boolean;
    indexMap?: number[];
    extraMap?: number[];
    futureIndex?: number;
    futureValue?: string;
    pinIdx?: number;
    pinObj?: unknown;
    ownVotes?: unknown[];
};
export type IHashSetEntryPartitions = {
    owners: string[];
    ourRow?: boolean;
    outRow?: boolean;
};
export type UpdateRepairData = {
    newTXList: Shardus.AcceptedTx[];
    allAccountsToResetById: {
        [x: string]: number;
    };
    partitionId: number;
    txIDToAcc: {
        [x: string]: {
            sourceKeys: string[];
            targetKeys: string[];
        };
    };
};
export type TempTxRecord = {
    txTS: number;
    acceptedTx: Shardus.AcceptedTx;
    passed: boolean;
    applyResponse: Shardus.ApplyResponse;
    redacted: number;
    isGlobalModifyingTX: boolean;
    savedSomething: boolean;
};
export type TxTallyList = {
    hashes: string[];
    passed: number[];
    txs: unknown[];
    processed: boolean;
    states: unknown[];
    newTxList?: NewTXList;
};
export type NewTXList = {
    hashes: string[];
    passed: number[];
    txs: unknown[];
    thashes: string[];
    tpassed: number[];
    ttxs: unknown[];
    tstates: unknown[];
    states: unknown[];
    processed: boolean;
};
export type CombinedPartitionReceipt = {
    result: PartitionResult;
    signatures: Shardus.Sign[];
};
export type SolutionDelta = {
    i: number;
    tx: Shardus.AcceptedTx;
    pf: number;
    state: string;
};
export type HashSetEntryPartitions = GenericHashSetEntry & IHashSetEntryPartitions;
export type HashSetEntryCorrection = {
    i: number;
    tv: Vote;
    v: string;
    t: string;
    bv: string;
    if: number;
    hi?: number;
    c?: HashSetEntryCorrection;
};
export type HashSetEntryError = {
    i: number;
    tv: Vote;
    v: string;
};
export type StringVoteObjectMap = {
    [vote: string]: Vote;
};
export type ExtendedVote = Vote & {
    winIdx: number | null;
    val: string;
    lowestIndex: number;
    voteTally: {
        i: number;
        p: number;
    }[];
    votesseen: unknown;
    finalIdx: number;
};
export type StringExtendedVoteObjectMap = {
    [vote: string]: ExtendedVote;
};
export type CountEntry = {
    count: number;
    ec: number;
    voters: number[];
};
export type StringCountEntryObjectMap = {
    [vote: string]: CountEntry;
};
export type AccountCopy = {
    accountId: string;
    data: unknown;
    timestamp: number;
    hash: string;
    cycleNumber: number;
    isGlobal: boolean;
};
export type AppliedVoteCore = {
    txid: string;
    transaction_result: boolean;
    sign?: Shardus.Sign;
};
export type Proposal = {
    applied: boolean;
    cant_preApply: boolean;
    accountIDs: string[];
    beforeStateHashes: string[];
    afterStateHashes: string[];
    appReceiptDataHash: string;
    txid: string;
};
export type SignedReceipt = {
    proposal: Proposal;
    proposalHash: string;
    signaturePack: Shardus.Sign[];
    voteOffsets: number[];
    sign?: Shardus.Sign;
};
export type Vote = {
    proposalHash: string;
    sign?: Shardus.Sign;
};
export type ArchiverReceipt = {
    tx: {
        originalTxData: Shardus.OpaqueTransaction;
        txId: string;
        timestamp: number;
    };
    signedReceipt: SignedReceipt | P2P.GlobalAccountsTypes.GlobalTxReceipt;
    appReceiptData: any;
    beforeStates?: Shardus.AccountsCopy[];
    afterStates?: Shardus.AccountsCopy[];
    cycle: number;
    executionShardKey: string;
    globalModification: boolean;
};
export type AppliedVote = {
    txid: string;
    transaction_result: boolean;
    account_id: string[];
    account_state_hash_after: string[];
    account_state_hash_before: string[];
    cant_apply: boolean;
    node_id: string;
    sign?: Shardus.Sign;
    app_data_hash?: string;
};
export type AppliedReceipt = {
    txid: string;
    result: boolean;
    appliedVotes: AppliedVote[];
    confirmOrChallenge: ConfirmOrChallengeMessage[];
    app_data_hash: string;
};
export type ConfirmOrChallengeMessage = {
    message: string;
    nodeId: string;
    appliedVote: AppliedVote;
    sign?: Shardus.Sign;
};
export type AppliedReceipt2 = {
    txid: string;
    result: boolean;
    appliedVote: AppliedVote;
    confirmOrChallenge?: ConfirmOrChallengeMessage;
    signatures: Shardus.Sign[];
    app_data_hash: string;
};
export type AppliedVoteHash = {
    txid: string;
    voteHash: string;
    voteTime: number;
    sign?: Shardus.Sign;
};
export type AppliedVoteQuery = {
    txId: string;
};
export type ConfirmOrChallengeQuery = {
    txId: string;
};
export type AppliedVoteQueryResponse = {
    txId: string;
    appliedVote: AppliedVote;
    appliedVoteHash: string;
};
export type ConfirmOrChallengeQueryResponse = {
    txId: string;
    appliedVoteHash: string;
    result: ConfirmOrChallengeMessage;
    uniqueCount: number;
};
export type TimeRangeandLimit = {
    tsStart: number;
    tsEnd: number;
    limit: number;
};
export type AccountAddressAndTimeRange = {
    accountStart: string;
    accountEnd: string;
    tsStart: number;
    tsEnd: number;
};
export type AccountRangeAndLimit = {
    accountStart: string;
    accountEnd: string;
    maxRecords: number;
};
export type AccountStateHashReq = AccountAddressAndTimeRange;
export type AccountStateHashResp = {
    stateHash: string;
    ready: boolean;
};
export type GossipAcceptedTxRecv = {
    acceptedTX: Shardus.AcceptedTx;
    sender: Shardus.Node;
    tracker: string;
};
export type GetAccountStateReq = AccountAddressAndTimeRange & {
    stateTableBucketSize: number;
};
export type AcceptedTransactionsReq = TimeRangeandLimit;
export type GetAccountDataReq = AccountRangeAndLimit;
export type GetAccountData2Req = AccountAddressAndTimeRange & {
    maxRecords: number;
};
export type GetAccountData3Req = {
    accountStart: string;
    accountEnd: string;
    tsStart: number;
    maxRecords: number;
    offset: number;
    accountOffset: string;
};
export type GetAccountData3Resp = {
    data: GetAccountDataByRangeSmart;
    errors?: string[];
};
export type PosPartitionResults = {
    partitionResults: PartitionResult[];
    Cycle_number: number;
};
export type GetTransactionsByListReq = {
    Tx_ids: string[];
};
export type TransactionsByPartitionReq = {
    cycle: number;
    tx_indicies: unknown;
    hash: string;
    partitionId: number;
    debugSnippets: unknown;
};
export type TransactionsByPartitionResp = {
    success: boolean;
    acceptedTX?: unknown;
    passFail?: unknown[];
    statesList?: unknown[];
};
export type GetPartitionTxidsReq = {
    Partition_id: unknown;
    Cycle_number: string;
};
export type RouteToHomeNodeReq = {
    txid: unknown;
    timestamp: unknown;
    acceptedTx: Shardus.AcceptedTx;
};
export type RequestStateForTxReq = {
    txid: string;
    timestamp: number;
    keys: string[];
};
export type RequestStateForTxResp = {
    stateList: Shardus.WrappedResponse[];
    beforeHashes: {
        [accountID: string]: string;
    };
    note: string;
    success: boolean;
};
export type RequestTxResp = {
    stateList: Shardus.WrappedResponse[];
    account_state_hash_before: {
        [accountID: string]: string;
    };
    account_state_hash_after: {
        [accountID: string]: string;
    };
    note: string;
    success: boolean;
    acceptedTX?: Shardus.AcceptedTx;
    originalData?: WrappedResponses;
    appReceiptData?: any;
};
export type RequestReceiptForTxReq = {
    txid: string;
    timestamp: number;
};
export type RequestReceiptForTxResp_old = {
    receipt: SignedReceipt;
    note: string;
    success: boolean;
};
export type RequestReceiptForTxResp = {
    receipt: SignedReceipt;
    note: string;
    success: boolean;
};
export type RequestStateForTxReqPost = {
    txid: string;
    timestamp: number;
    key: string;
    hash: string;
};
export type GetAccountDataWithQueueHintsResp = {
    accountData: Shardus.WrappedDataFromQueue[] | null;
};
export type RequestAccountQueueCounts = {
    accountIds: string[];
};
export type QueueCountsResponse = {
    counts: number[];
    committingAppData: QueueEntry['acceptedTx']['appData'][];
    accounts: any[];
};
export type QueueCountsResult = {
    count: number;
    committingAppData: Shardus.AcceptedTx['appData'];
    account?: any;
};
export interface NonceQueueItem {
    tx: Shardus.OpaqueTransaction;
    txId: string;
    nonce: bigint;
    accountId: string;
    appData: any;
    global: boolean;
    noConsensus: boolean;
}
export interface RequestFinalDataResp {
    appReceiptData: any;
    wrappedResponses: WrappedResponses;
}
export type GlobalAccountReportResp = {
    ready: boolean;
    combinedHash: string;
    accounts: {
        id: string;
        hash: string;
        timestamp: number;
    }[];
};
export type PreApplyAcceptedTransactionResult = {
    applied: boolean;
    passed: boolean;
    applyResult: string;
    reason: string;
    applyResponse?: Shardus.ApplyResponse;
};
export type CommitConsensedTransactionResult = {
    success: boolean;
};
export type TellSignedVoteHash = {
    voteHash: string;
    sign: Shardus.Sign;
};
export type StateHashResult = {
    stateHash: string;
};
export type WrappedStates = {
    [accountID: string]: Shardus.WrappedData;
};
export type AccountFilter = {
    [accountID: string]: number;
};
export type AccountBoolObjectMap = AccountFilter;
export type WrappedResponses = {
    [accountID: string]: Shardus.WrappedResponse;
};
export type SimpleDistanceObject = {
    distance: number;
};
export type StringNodeObjectMap = {
    [accountID: string]: Shardus.Node;
};
export type AcceptedTxObjectById = {
    [txid: string]: Shardus.AcceptedTx;
};
export type TxObjectById = AcceptedTxObjectById;
export type TxIDToKeyObjectMap = {
    [accountID: string]: Shardus.TransactionKeys;
};
export type TxIDToSourceTargetObjectMap = {
    [accountID: string]: {
        sourceKeys: string[];
        targetKeys: string[];
    };
};
export type DebugDumpPartitionAccount = {
    id: string;
    hash: string;
    v: string;
};
export type DebugDumpNodesCovered = {
    idx: number;
    ipPort: string;
    id: string;
    fracID: number;
    hP: number;
    consensus: {
        idx: number;
        hp: number;
    }[];
    stored: {
        idx: number;
        hp: number;
    }[];
    extra: [
    ];
    numP: number;
};
export type DebugDumpRangesCovered = {
    ipPort: string;
    id: string;
    fracID: number;
    hP: number;
    cMin: number;
    cMax: number;
    stMin: number;
    stMax: number;
    numP: number;
};
export type DebugDumpPartition = {
    parititionID: number;
    accounts: DebugDumpPartitionAccount[];
    skip: DebugDumpPartitionSkip;
    accounts2?: DebugDumpPartitionAccount[];
    partitionHash2?: string;
};
export type DebugDumpPartitionSkip = {
    p: number;
    min: number;
    max: number;
    noSpread?: boolean;
    inverted?: boolean;
};
export type DebugDumpPartitions = {
    partitions: DebugDumpPartition[];
    cycle: number;
    rangesCovered: DebugDumpRangesCovered;
    nodesCovered: DebugDumpNodesCovered;
    allNodeIds: string[];
    globalAccountIDs: string[];
    globalAccountSummary: unknown[];
    globalStateHash: string;
    calculationTime: number;
};
export type SeenAccounts = {
    [accountId: string]: QueueEntry | null;
};
export type LocalCachedData = {
    [accountId: string]: unknown;
};
export type AccountValuesByKey = {
    [accountId: string]: unknown;
};
export type StatusMap = {
    [txid: string]: number;
};
export type StateMap = {
    [txid: string]: string;
};
export type GetAccountDataByRangeSmart = {
    wrappedAccounts: WrappedStateArray;
    lastUpdateNeeded: boolean;
    wrappedAccounts2: WrappedStateArray;
    highestTs: number;
    delta: number;
};
export type SignedObject = {
    sign: {
        owner: string;
    };
};
export type StringBoolObjectMap = {
    [key: string]: boolean;
};
export type StringNumberObjectMap = {
    [key: string]: number;
};
export type NumberStringObjectMap = {
    [index: number]: string;
};
export type StringStringObjectMap = {
    [key: string]: string;
};
export type FifoWaitingEntry = {
    id: number;
};
export type FifoLock = {
    fifoName: string;
    queueCounter: number;
    waitingList: FifoWaitingEntry[];
    lastServed: number;
    queueLocked: boolean;
    lockOwner: number;
    lastLock: number;
};
export type FifoLockObjectMap = {
    [lockID: string]: FifoLock;
};
export type AccountHashCache = {
    t: number;
    h: string;
    c: number;
};
export type AccountHashCacheHistory = {
    lastSeenCycle: number;
    lastSeenSortIndex: number;
    queueIndex: SafeIndex;
    accountHashList: AccountHashCache[];
    lastStaleCycle: number;
    lastUpdateCycle: number;
};
export type SafeIndex = {
    id: number;
    idx: number;
};
export type AccountHashesForPartition = {
    partition: number;
    accountHashesSorted: AccountHashCache[];
    accountIDs: string[];
};
export type AccountHashCacheList = {
    accountIDs: string[];
    accountHashesSorted: AccountHashCache[];
};
export type AccountHashCacheMain3 = {
    currentCalculationCycle: number;
    workingHistoryList: AccountHashCacheList;
    accountHashMap: Map<string, AccountHashCacheHistory>;
    futureHistoryList: AccountHashCacheList;
};
export type PartitionHashResults = {
    partition: number;
    hashOfHashes: string;
    ids: string[];
    hashes: string[];
    timestamps: number[];
};
export type MainHashResults = {
    cycle: number;
    partitionHashResults: Map<number, PartitionHashResults>;
};
export type PartitionCycleReportElement = {
    i: number;
    h: string;
};
export type PartitionCycleReport = {
    res?: PartitionCycleReportElement[];
    cycleNumber?: number;
};
export type TrieAccount = {
    accountID: string;
    hash: string;
};
export type HashTrieNode = {
    radix: string;
    hash: string;
    childHashes: string[];
    children: HashTrieNode[];
    nonSparseChildCount: number;
    updated: boolean;
    isIncomplete: boolean;
    accounts?: TrieAccount[];
    accountTempMap?: Map<string, TrieAccount>;
};
export type ShardedHashTrie = {
    layerMaps: Map<string, HashTrieNode>[];
};
export type HashTrieSyncConsensus = {
    cycle: number;
    radixHashVotes: Map<string, {
        allVotes: Map<string, {
            count: number;
            voters: Set<Shardus.Node>;
        }>;
        bestHash: string;
        bestVotes: number;
    }>;
    coverageMap: Map<string, HashTrieRadixCoverage>;
};
export type HashTrieRadixCoverage = {
    firstChoice: Shardus.Node;
    fullList: Shardus.Node[];
    refuted: Set<string>;
};
export type HashTrieReq = {
    radixList: string[];
};
export type HashTrieResp = {
    nodeHashes: RadixAndHash[];
    nodeId: string;
};
export type ProxyRequest = {
    nodeId: string;
    route: string;
    message: any;
};
export type ProxyResponse = {
    success: boolean;
    response: any;
};
export type RadixAndHash = {
    radix: string;
    hash: string;
};
export type RadixAndHashWithNodeId = RadixAndHash & {
    nodeId: string;
};
export type AccountIDAndHash = {
    accountID: string;
    hash: string;
};
export type AccountIdAndHashToRepair = AccountIDAndHash & {
    targetNodeId: string;
};
export enum PreTestStatus {
    Valid = 1,
    CantValidate,
    ValidationFailed
}
export type AccountPreTest = {
    accountID: string;
    hash: string;
    preTestStatus: PreTestStatus;
};
export type HashTrieSyncTell = {
    cycle: number;
    nodeHashes: {
        radix: string;
        hash: string;
    }[];
};
export type RadixAndChildHashes = {
    radix: string;
    childAccounts: AccountIDAndHash[];
};
export type RadixAndChildHashesWithNodeId = RadixAndChildHashes & {
    nodeId: string;
};
export type HashTrieAccountsResp = {
    nodeChildHashes: RadixAndChildHashes[];
    stats: {
        matched: number;
        visisted: number;
        empty: number;
        childCount: number;
    };
    nodeId: string;
};
export type HashTrieAccountDataRequest = {
    cycle: number;
    accounts: AccountIDAndHash[];
};
export type HashTrieAccountDataResponse = {
    accounts: Shardus.WrappedData[];
    stateTableData: Shardus.StateTableObject[];
};
export type HashTrieUpdateStats = {
    leafsUpdated: number;
    leafsCreated: number;
    updatedNodesPerLevel: number[];
    hashedChildrenPerLevel: number[];
    totalHashes: number;
    totalNodesHashed: number;
    totalAccountsHashed: number;
    totalLeafs: number;
};
export interface IsInsyncResult {
    radixes: any[];
    stats: {
        good: number;
        bad: number;
        total: number;
    };
    insync: boolean;
}
export type CycleDebugNotes = {
    repairs: number;
    lateRepairs: number;
    patchedAccounts: number;
    badAccounts: number;
    noRcptRepairs: number;
};
export type SimpleNumberStats = {
    min: number;
    max: number;
    count: number;
    total: number;
    average: number;
};
export type ProcessQueueStats = {
    totalTime: number;
    inserted: number;
    sameState: number;
    stateChanged: number;
    sameStateStats: {
        [statName: string]: SimpleNumberStats;
    };
    stateChangedStats: {
        [statName: string]: SimpleNumberStats;
    };
    awaitStats: {
        [statName: string]: SimpleNumberStats;
    };
};
export type CachedAppData = {
    dataID: string;
    appData: unknown;
    cycle: number;
};
export interface TimestampRemoveRequest {
    txId: string;
    signedReceipt: SignedReceipt;
    cycleCounter: number;
}
export type CacheTopic = {
    topic: string;
    maxCycleAge: number;
    maxCacheElements: number;
    cacheAppDataMap: Map<string, CachedAppData>;
    cachedAppDataArray: CachedAppData[];
    maxItemSize: number;
};
export type CacheAppDataResponse = {
    topic: string;
    cachedAppData: CachedAppData;
};
export type CacheAppDataRequest = {
    topic: string;
    dataId: string;
};
export type ShardusMemoryPatternsSets = {
    ro: Set<string>;
    rw: Set<string>;
    wo: Set<string>;
    on: Set<string>;
    ri: Set<string>;
};
export type ExecutionDebug = {
    process1?: unknown;
    a?: unknown;
    processElapsed?: unknown;
    log?: unknown;
    log1?: unknown;
    log2?: unknown;
    log3?: unknown;
    txResult?: unknown;
    logBusy?: unknown;
    logFinalData?: unknown;
};