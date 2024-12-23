import { P2P } from '@shardus/types';
import { JoinRequest } from '@shardus/types/build/src/p2p/JoinTypes';
import { AppObjEnum } from '../types/enum/AppObjEnum';
export type Node = P2P.NodeListTypes.Node;
export type Cycle = P2P.CycleCreatorTypes.CycleRecord;
export type Archiver = P2P.ArchiversTypes.JoinedArchiver;
export interface NodeWithRank {
    rank: bigint;
    id: string;
    status: string;
    publicKey: string;
    externalIp: string;
    externalPort: number;
    internalIp: string;
    internalPort: number;
}
export { AppObjEnum };
interface ValidateJoinRequestResponse {
    success: boolean;
    reason: string;
    fatal: boolean;
    data?: string;
}
export interface InjectTxResponse {
    success: boolean;
    reason?: string;
}
export interface App {
    injectTxToConsensor(consensor: ValidatorNodeDetails[], tx: OpaqueTransaction): Promise<InjectTxResponse | null>;
    getNonceFromTx(tx: OpaqueTransaction): bigint;
    getAccountNonce(accountId: string, wrappedData?: WrappedData): Promise<bigint>;
    getTxSenderAddress(tx: OpaqueTransaction): string;
    validate(tx: OpaqueTransaction, appData: any): {
        success: boolean;
        reason: string;
        status: number;
    };
    isInternalTx(tx: OpaqueTransaction): boolean;
    crack(tx: OpaqueTransaction, appData: any): {
        timestamp: number;
        id: string;
        keys: TransactionKeys;
        shardusMemoryPatterns: ShardusMemoryPatternsInput;
    };
    txPreCrackData(tx: OpaqueTransaction, appData: any): Promise<{
        status: boolean;
        reason: string;
    }>;
    validateTransaction?: (...data: any) => any;
    validateTxnFields?: (inTx: OpaqueTransaction, appData: any) => IncomingTransactionResult;
    apply: (inTx: OpaqueTransaction, wrappedStates: {
        [accountId: string]: WrappedData;
    }, appData: any) => Promise<ApplyResponse>;
    transactionReceiptPass?: (inTx: OpaqueTransaction, wrappedStates: any, applyResponse: ApplyResponse, isExecutionGroup: boolean) => void;
    transactionReceiptFail?: (inTx: OpaqueTransaction, wrappedStates: any, applyResponse: ApplyResponse) => void;
    updateAccountFull: (wrappedState: WrappedResponse, localCache: any, applyResponse: ApplyResponse) => void;
    updateAccountPartial: (wrappedState: WrappedResponse, localCache: any, applyResponse: ApplyResponse) => void;
    getRelevantData: (accountId: string, tx: object, appData: any) => Promise<WrappedResponse>;
    getTimestampFromTransaction: (inTx: OpaqueTransaction, appData: {}) => number;
    calculateTxId: (inTx: OpaqueTransaction) => string;
    getKeyFromTransaction?: (inTx: OpaqueTransaction) => TransactionKeys;
    getStateId?: (accountAddress: string, mustExist?: boolean) => Promise<string>;
    getAccountTimestamp?: (accountAddress: string, mustExist?: boolean) => Promise<number>;
    getTimestampAndHashFromAccount?: (account: any) => {
        timestamp: number;
        hash: string;
    };
    close: () => void;
    getAccountData: (accountStart: string, accountEnd: string, maxRecords: number) => Promise<WrappedData[]>;
    getAccountDataByRange: (accountStart: string, accountEnd: string, tsStart: number, tsEnd: number, maxRecords: number, offset: number, accountOffset: string) => Promise<WrappedData[]>;
    calculateAccountHash: (account: unknown) => string;
    setAccountData: (accountRecords: unknown[]) => Promise<void>;
    resetAccountData: (accountRecords: unknown[]) => void;
    deleteAccountData: (addressList: string[]) => void;
    getAccountDataByList: (addressList: string[]) => Promise<WrappedData[]>;
    getCachedRIAccountData: (addressList: string[]) => Promise<WrappedData[]>;
    setCachedRIAccountData: (accountRecords: unknown[]) => Promise<void>;
    getNetworkAccount: () => Promise<WrappedData>;
    deleteLocalAccountData: () => Promise<void>;
    getAccountDebugValue: (wrappedAccount: WrappedData) => string;
    getSimpleTxDebugValue?: (tx: unknown) => string;
    canDebugDropTx?: (tx: unknown) => boolean;
    sync?: () => any;
    dataSummaryInit?: (blob: any, accountData: any) => void;
    dataSummaryUpdate?: (blob: any, accountDataBefore: any, accountDataAfter: any) => void;
    txSummaryUpdate?: (blob: any, tx: any, wrappedStates: any) => void;
    validateJoinRequest?: (data: any, mode: P2P.ModesTypes.Record['mode'] | null, latestCycle: Cycle, minNodes: number) => ValidateJoinRequestResponse;
    validateArchiverJoinRequest?: (data: any) => any;
    getJoinData?: () => any;
    eventNotify?: (event: ShardusEvent) => void;
    isReadyToJoin: (latestCycle: Cycle, nodePublicKey: string, activeNodes: P2P.P2PTypes.Node[], mode: P2P.ModesTypes.Record['mode'] | null) => Promise<boolean>;
    getNodeInfoAppData?: () => any;
    signAppData?: (type: string, hash: string, nodesToSign: number, appData: any) => Promise<SignAppDataResult>;
    updateNetworkChangeQueue?: (account: WrappedData, appData: any) => Promise<WrappedData[]>;
    pruneNetworkChangeQueue?: (account: WrappedData, cycle: number) => Promise<WrappedData[]>;
    beforeStateAccountFilter?: (account: WrappedData) => boolean;
    canStayOnStandby: (joinInfo: JoinRequest) => {
        canStay: boolean;
        reason: string;
    };
    binarySerializeObject: (identifier: AppObjEnum, obj: any) => Buffer;
    binaryDeserializeObject: (identifier: AppObjEnum, buffer: Buffer) => any;
    verifyMultiSigs: (rawPayload: object, sigs: Sign[], allowedPubkeys: {
        [pubkey: string]: DevSecurityLevel;
    }, minSigRequired: number, requiredSecurityLevel: DevSecurityLevel) => boolean;
}
export interface TransactionKeys {
    sourceKeys: string[];
    targetKeys: string[];
    allKeys: string[];
    timestamp: number;
    debugInfo?: string;
}
export interface ApplyResponse {
    stateTableResults: StateTableObject[];
    txId: string;
    txTimestamp: number;
    accountData: WrappedResponse[];
    accountWrites: {
        accountId: string;
        data: WrappedResponse;
        txId: string;
        timestamp: number;
    }[];
    appDefinedData: unknown;
    failed: boolean;
    failMessage: string;
    appReceiptData: any;
    appReceiptDataHash: string;
}
export interface AccountData {
    accountId: string;
    data: string;
    txId: string;
    timestamp: number;
    hash: string;
}
export interface AccountsCopy {
    accountId: string;
    cycleNumber: number;
    data: unknown;
    timestamp: number;
    hash: string;
    isGlobal: boolean;
}
export interface WrappedData {
    accountId: string;
    stateId: string;
    data: unknown;
    timestamp: number;
    syncData?: any;
}
export interface WrappedResponse extends WrappedData {
    accountCreated: boolean;
    isPartial: boolean;
    userTag?: any;
    localCache?: any;
    prevStateId?: string;
    prevDataCopy?: any;
    sign?: Sign;
}
export interface WrappedDataFromQueue extends WrappedData {
    seenInQueue: boolean;
}
export interface TimestampReceipt {
    txId: string;
    cycleMarker: string;
    cycleCounter: number;
    timestamp: number;
}
export interface TimestampedTx {
    tx: OpaqueTransaction;
    timestampReceipt?: TimestampReceipt;
}
export interface AccountData2 {
    accountId: string;
    data: string;
    txId: string;
    txTimestamp: string;
    hash: string;
    accountData: unknown;
    localCache: any;
}
export interface StateTableObject {
    accountId: string;
    txId: string;
    txTimestamp: string;
    stateBefore: string;
    stateAfter: string;
}
export interface IncomingTransaction {
    srcAct: string;
    tgtActs?: string;
    tgtAct?: string;
    txnType: string;
    txnAmt: number;
    seqNum: number;
    sign: Sign;
    txnTimestamp?: string;
}
export interface Sign {
    owner: string;
    sig: string;
}
export interface IncomingTransactionResult {
    success: boolean;
    reason: string;
    txnTimestamp?: number;
    status?: number;
}
export enum ServerMode {
    Debug = 'debug',
    Release = 'release'
}
export enum DevSecurityLevel {
    Unauthorized = 0,
    Low = 1,
    Medium = 2,
    High = 3
}
export interface ServerConfiguration {
    heartbeatInterval?: number;
    baseDir?: string;
    transactionExpireTime?: number;
    globalAccount: string;
    nonceMode: boolean;
    crypto?: {
        hashKey?: string;
        keyPairConfig?: {
            useKeyPairFromFile?: boolean;
            keyPairJsonFile?: string;
        };
    };
    p2p?: {
        ipServers?: string[];
        timeServers?: string[];
        existingArchivers?: Array<P2P.P2PTypes.Node>;
        syncLimit?: number;
        useNTPOffsets?: boolean;
        useFakeTimeOffsets?: boolean;
        cycleDuration?: number;
        maxRejoinTime?: number;
        dynamicBogonFiltering: boolean;
        forceBogonFilteringOn: boolean;
        rejectBogonOutboundJoin: boolean;
        difficulty?: number;
        queryDelay?: number;
        gossipRecipients?: number;
        gossipFactor?: number;
        dynamicGossipFactor: boolean;
        gossipStartSeed?: number;
        gossipSeedFallof?: number;
        gossipTimeout?: number;
        maxSeedNodes?: number;
        minNodesToAllowTxs?: number;
        continueOnException?: boolean;
        minNodesPerctToAllowExitOnException?: number;
        baselineNodes?: number;
        minNodes?: number;
        maxNodes?: number;
        enableMaxStandbyCount: boolean;
        maxStandbyCount: number;
        seedNodeOffset?: number;
        nodeExpiryAge?: number;
        maxJoinedPerCycle?: number;
        maxSyncingPerCycle?: number;
        syncBoostEnabled?: boolean;
        maxSyncTimeFloor?: number;
        maxNodeForSyncTime?: number;
        maxRotatedPerCycle?: number;
        firstCycleJoin?: number;
        maxPercentOfDelta?: number;
        minScaleReqsNeeded?: number;
        maxScaleReqs?: number;
        scaleConsensusRequired?: number;
        amountToGrow?: number;
        amountToShrink?: number;
        maxShrinkMultiplier?: number;
        scaleInfluenceForShrink?: number;
        maxDesiredMultiplier?: number;
        startInWitnessMode?: boolean;
        experimentalSnapshot?: boolean;
        detectLostSyncing?: boolean;
        scaleGroupLimit?: number;
        useSignaturesForAuth?: boolean;
        checkVersion: boolean;
        extraCyclesToKeep: number;
        extraCyclesToKeepMultiplier: number;
        checkNetworkStopped: boolean;
        validateActiveRequests: boolean;
        hackForceCycleSyncComplete: boolean;
        uniqueRemovedIds: boolean;
        uniqueRemovedIdsUpdate: boolean;
        uniqueLostIdsUpdate: boolean;
        useLruCacheForSocketMgmt: boolean;
        lruCacheSizeForSocketMgmt: number;
        payloadSizeLimitInBytes: number;
        headerSizeLimitInBytes: number;
        delayLostReportByNumOfCycles: number;
        aggregateLostReportsTillQ1: boolean;
        isDownCachePruneCycles: number;
        isDownCacheEnabled: boolean;
        stopReportingLostPruneCycles: number;
        lostMapPruneCycles: number;
        instantForwardReceipts: boolean;
        maxArchiversSubscriptionPerNode: number;
        writeSyncProtocolV2: boolean;
        useSyncProtocolV2: boolean;
        validateArchiverAppData: boolean;
        useNetworkModes: boolean;
        useJoinProtocolV2: boolean;
        randomJoinRequestWait: number;
        standbyListCyclesTTL: number;
        standbyListMaxRemoveTTL: number;
        standbyListMaxRemoveApp: number;
        standbyAgeScrub: boolean;
        standbyVersionScrub: boolean;
        standbyAgeCheck: boolean;
        q1DelayPercent: number;
        goldenTicketEnabled: boolean;
        preGossipNodeCheck: boolean;
        preGossipDownCheck: boolean;
        preGossipLostCheck: boolean;
        preGossipRecentCheck: boolean;
        initShutdown: boolean;
        enableLostArchiversCycles: boolean;
        lostArchiversCyclesToWait: number;
        standbyListFastHash: boolean;
        networkBaselineEnabled: boolean;
        useCombinedTellBinary: boolean;
        rotationCountMultiply: number;
        rotationCountAdd: number;
        rotationPercentActive: number;
        rotationMaxAddPercent: number;
        rotationMaxRemovePercent: number;
        syncFloorEnabled: boolean;
        syncingMaxAddPercent: number;
        syncingDesiredMinCount: number;
        allowActivePerCycle: number;
        allowActivePerCycleRecover: number;
        activeRecoveryEnabled: boolean;
        useProxyForDownCheck: boolean;
        numCheckerNodes: number;
        minChecksForDown: number;
        minChecksForUp: number;
        attemptJoiningWaitMultiplier: number;
        cyclesToWaitForSyncStarted: number;
        cyclesToRefreshEarly: number;
        extraNodesToAddInRestart: number;
        secondsToCheckForQ1: number;
        hardenNewSyncingProtocol: boolean;
        removeLostSyncingNodeFromList: boolean;
        rotationEdgeToAvoid: number;
        forcedMode?: string;
        delayZombieRestartSec: number;
        resumbitStandbyRefreshWaitDuration: number;
        formingNodesPerCycle: number;
        downNodeFilteringEnabled: boolean;
        useFactCorrespondingTell: boolean;
        resubmitStandbyAddWaitDuration: number;
        requiredVotesPercentage: number;
        timestampCacheFix: boolean;
        networkTransactionsToProcessPerCycle: number;
        useAjvCycleRecordValidation: boolean;
        getTxTimestampTimeoutOffset?: number;
    };
    ip?: {
        externalIp?: string | 'auto';
        externalPort?: number | 'auto';
        internalIp?: string | 'auto';
        internalPort?: number | 'auto';
    };
    network?: {
        timeout?: number;
    };
    reporting?: {
        report?: boolean;
        recipient?: string;
        interval?: number;
        console?: boolean;
        logSocketReports: boolean;
    };
    mode?: ServerMode;
    debug?: {
        ignoreScaleGossipSelfCheck?: boolean;
        loseReceiptChance?: number;
        loseTxChance?: number;
        canDataRepair?: boolean;
        debugNoTxVoting?: boolean;
        ignoreRecieptChance?: number;
        ignoreVoteChance?: number;
        failReceiptChance?: number;
        voteFlipChance?: number;
        skipPatcherRepair?: boolean;
        failNoRepairTxChance?: number;
        useNewParitionReport?: boolean;
        oldPartitionSystem?: boolean;
        dumpAccountReportFromSQL?: boolean;
        profiler?: boolean;
        startInFatalsLogMode?: boolean;
        startInErrorLogMode?: boolean;
        verboseNestedCounters?: boolean;
        fakeNetworkDelay?: number;
        disableSnapshots?: boolean;
        disableTxCoverageReport?: boolean;
        disableLostNodeReports?: boolean;
        haltOnDataOOS?: boolean;
        countEndpointStart?: number;
        countEndpointStop?: number;
        hashedDevAuth?: string;
        devPublicKeys?: {
            [pubKey: string]: DevSecurityLevel;
        };
        multisigKeys?: {
            [pubKey: string]: DevSecurityLevel;
        };
        minMultiSigRequiredForEndpoints: number;
        minMultiSigRequiredForGlobalTxs: number;
        robustQueryDebug: boolean;
        forwardTXToSyncingNeighbors: boolean;
        recordAcceptedTx: boolean;
        recordAccountStates: boolean;
        useShardusMemoryPatterns: boolean;
        sanitizeInput: boolean;
        checkTxGroupChanges: boolean;
        ignoreTimeCheck: boolean;
        checkAddressFormat: boolean;
        produceBadVote: boolean;
        produceBadChallenge: boolean;
        debugNTPErrorWindowMs: number;
        enableScopedProfiling: boolean;
        enableBasicProfiling: boolean;
        enableCycleRecordDebugTool: boolean;
        forcedExpiration: boolean;
        ignoreStandbyRefreshChance: number;
        localEnableCycleRecordDebugTool: boolean;
        enableTestMode: boolean;
        highResolutionProfiling: boolean;
        randomCycleData: boolean;
        debugStatListMaxSize: number;
        ignoreDataTellChance: number;
        debugNTPBogusDecrements: boolean;
        startedSyncingDelay: number;
        finishedSyncingDelay: number;
        readyNodeDelay: number;
        beforeStateFailChance: number;
    };
    statistics?: {
        save?: boolean;
        interval?: number;
    };
    loadDetection?: {
        queueLimit?: number;
        executeQueueLimit?: number;
        desiredTxTime?: number;
        highThreshold?: number;
        lowThreshold?: number;
    };
    rateLimiting?: {
        limitRate?: boolean;
        loadLimit?: {
            internal?: number;
            external?: number;
            txTimeInQueue?: number;
            queueLength?: number;
            executeQueueLength?: number;
        };
    };
    stateManager?: {
        maxNonceQueueSize?: number;
        stateTableBucketSize?: number;
        accountBucketSize?: number;
        patcherAccountsPerRequest: number;
        patcherAccountsPerUpdate: number;
        patcherMaxHashesPerRequest: number;
        patcherMaxLeafHashesPerRequest: number;
        patcherMaxChildHashResponses: number;
        maxDataSyncRestarts: number;
        maxTrackerRestarts: number;
        syncWithAccountOffset: boolean;
        useAccountCopiesTable: boolean;
        stuckProcessingLimit: number;
        autoUnstickProcessing: boolean;
        apopFromStuckProcessing: boolean;
        discardVeryOldPendingTX: boolean;
        transactionApplyTimeout: number;
        includeBeforeStatesInReceipts: boolean;
        fifoUnlockFix: boolean;
        fifoUnlockFix2: boolean;
        fifoUnlockFix3: boolean;
        enableAccountFetchForQueueCounts: boolean;
        configChangeMaxCyclesToKeep: number;
        configChangeMaxChangesToKeep: number;
        waitTimeBeforeConfirm: number;
        waitLimitAfterFirstVote: number;
        waitTimeBeforeReceipt: number;
        waitLimitAfterFirstMessage: number;
        minRequiredChallenges: number;
        useNewPOQ: boolean;
        nonExWaitForData: number;
        usePOQo: boolean;
        poqoloopTime: number;
        poqobatchCount: number;
        forwardToLuckyNodes: boolean;
        forwardToLuckyNodesNonceQueue: boolean;
        forwardToLuckyMulti: boolean;
        forwardToLuckyNodesNonceQueueLimitFix: boolean;
        forwardToLuckyNodesCheckRotation: boolean;
        integrityCheckBeforeChallenge: boolean;
        checkPrecrackStatus: boolean;
        noVoteSeenExpirationTime: number;
        voteSeenExpirationTime: number;
        confirmationSeenExpirationTime: number;
        voterPercentage: number;
        waitUpstreamTx: boolean;
        gossipCompleteData: boolean;
        shareCompleteData: boolean;
        txStateMachineChanges: boolean;
        canRequestFinalData: boolean;
        numberOfReInjectNodes: number;
        maxPendingNonceTxs: number;
        attachDataToReceipt: boolean;
        nodesToGossipAppliedReceipt: number;
        useCopiedWrappedStateForApply: boolean;
        disableTxExpiration: boolean;
        removeStuckTxsFromQueue: boolean;
        stuckTxRemoveTime: number;
        removeStuckTxsFromQueue2: boolean;
        stuckTxRemoveTime2: number;
        removeStuckTxsFromQueue3: boolean;
        stuckTxRemoveTime3: number;
        removeStuckChallengedTXs: boolean;
        receiptRemoveFix: boolean;
        stuckTxQueueFix: boolean;
        forceVoteForFailedPreApply: boolean;
        singleAccountStuckFix: boolean;
        stuckTxMoveTime: number;
        collectedDataFix: boolean;
        noRepairIfDataAttached: boolean;
        rejectSharedDataIfCovered: boolean;
        requestAwaitedDataAllowed: boolean;
        awaitingDataCanBailOnReceipt: boolean;
        filterReceivingNodesForTXData: boolean;
        correspondingTellUseUnwrapped: boolean;
        concatCorrespondingTellUseUnwrapped: boolean;
        deterministicTXCycleEnabled: boolean;
        reduceTimeFromTxTimestamp: number;
        fallbackToCurrentCycleFortxGroup: boolean;
        maxCyclesShardDataToKeep: number;
        avoidOurIndexInFactTell: boolean;
    };
    sharding?: {
        nodesPerConsensusGroup?: number;
        nodesPerEdge?: number;
        executeInOneShard?: boolean;
    };
    features?: {
        dappFeature1enabled: boolean;
        fixHomeNodeCheckForTXGroupChanges?: boolean;
        archiverDataSubscriptionsUpdate?: boolean;
        startInServiceMode?: boolean;
        enableRIAccountsCache: boolean;
        tickets?: {
            updateTicketListTimeInMs?: number;
            ticketTypes?: Array<{
                type: string;
                enabled: boolean;
            }>;
        };
    };
}
export interface LogsConfiguration {
    saveConsoleOutput?: boolean;
    dir?: string;
    files?: {
        main?: string;
        fatal?: string;
        net?: string;
        app?: string;
        seq?: string;
    };
    options?: {
        appenders?: {
            out?: {
                type?: string;
                maxLogSize?: number;
                backups?: number;
            };
            main?: {
                type?: string;
                maxLogSize?: number;
                backups?: number;
            };
            seq?: {
                type?: string;
                maxLogSize?: number;
                backups?: number;
            };
            app?: {
                type?: string;
                maxLogSize?: number;
                backups?: number;
            };
            p2p?: {
                type?: string;
                maxLogSize?: number;
                backups?: number;
            };
            snapshot?: {
                type?: string;
                maxLogSize?: number;
                backups?: number;
            };
            cycle?: {
                type?: string;
                maxLogSize?: number;
                backups?: number;
            };
            fatal?: {
                type?: string;
                maxLogSize?: number;
                backups?: number;
            };
            exit?: {
                type?: string;
                maxLogSize?: number;
                backups?: number;
            };
            errorFile?: {
                type?: string;
                maxLogSize?: number;
                backups?: number;
            };
            errors?: {
                type?: string;
                level?: string;
                appender?: string;
            };
            net?: {
                type?: string;
                maxLogSize?: number;
                backups?: number;
            };
            playback?: {
                type?: string;
                maxLogSize?: number;
                backups?: number;
            };
            shardDump?: {
                type?: string;
                maxLogSize?: number;
                backups?: number;
            };
            statsDump?: {
                type?: string;
                maxLogSize?: number;
                backups?: number;
            };
        };
        categories?: {
            default?: {
                appenders?: string[];
                level?: string;
            };
            app?: {
                appenders?: string[];
                level?: string;
            };
            main?: {
                appenders?: string[];
                level?: string;
            };
            seq?: {
                appenders?: string[];
                level?: string;
            };
            p2p?: {
                appenders?: string[];
                level?: string;
            };
            snapshot?: {
                appenders?: string[];
                level?: string;
            };
            cycle?: {
                appenders?: string[];
                level?: string;
            };
            fatal?: {
                appenders?: string[];
                level?: string;
            };
            exit?: {
                appenders?: string[];
                level?: string;
            };
            net?: {
                appenders?: string[];
                level?: string;
            };
            playback?: {
                appenders?: string[];
                level?: string;
            };
            shardDump?: {
                appenders?: string[];
                level?: string;
            };
            statsDump?: {
                appenders?: string[];
                level?: string;
            };
        };
    };
}
export interface StorageConfiguration {
    database?: string;
    username?: string;
    password?: string;
    options?: {
        logging?: false;
        host?: string;
        dialect?: string;
        operatorsAliases?: false;
        pool?: {
            max?: number;
            min?: number;
            acquire?: number;
            idle?: number;
        };
        storage?: string;
        sync?: {
            force?: false;
        };
        memoryFile?: false;
        saveOldDBFiles: boolean;
        walMode: boolean;
        exclusiveLockMode: boolean;
    };
}
export interface ShardusConfiguration {
    server?: ServerConfiguration;
    logs?: LogsConfiguration;
    storage?: StorageConfiguration;
}
export type StrictServerConfiguration = DeepRequired<ServerConfiguration>;
export type StrictLogsConfiguration = DeepRequired<LogsConfiguration>;
export type StrictStorageConfiguration = DeepRequired<StorageConfiguration>;
export interface StrictShardusConfiguration {
    server: StrictServerConfiguration;
    logs: StrictLogsConfiguration;
    storage: StrictStorageConfiguration;
}
export interface AcceptedTx {
    timestamp: number;
    txId: string;
    keys: TransactionKeys;
    data: TimestampedTx;
    appData: any;
    shardusMemoryPatterns: ShardusMemoryPatternsInput;
}
export type ShardusMemoryPatternsInput = {
    ro: string[];
    rw: string[];
    wo: string[];
    on: string[];
    ri: string[];
};
export interface TxReceipt {
    txHash: string;
    sign?: Sign;
    time: number;
    stateId: string;
    targetStateId: string;
}
type ObjectAlias = object;
export interface OpaqueTransaction extends ObjectAlias {
}
export interface ReinjectedOpaqueTransaction extends OpaqueTransaction {
    isReinjected: boolean;
}
export type DeepRequired<T> = Required<{
    [P in keyof T]: T[P] extends object | undefined ? DeepRequired<Required<T[P]>> : T[P];
}>;
type ShardusEventType = 'node-activated' | 'node-deactivated' | 'node-left-early' | 'node-refuted' | 'node-sync-timeout' | 'try-network-transaction';
export type ShardusEvent = {
    type: ShardusEventType;
    nodeId: string;
    reason: string;
    time: number;
    publicKey: string;
    cycleNumber: number;
    activeCycle?: number;
    additionalData?: any;
};
export type GetAppDataSignaturesResult = {
    success: boolean;
    signatures: Sign[];
};
export type SignAppDataResult = {
    success: boolean;
    signature: Sign;
};
export interface ValidatorNodeDetails {
    ip: string;
    port: number;
    publicKey: string;
}