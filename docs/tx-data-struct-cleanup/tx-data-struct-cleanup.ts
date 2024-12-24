type Timestamp = number;
type HexString = string;
interface Signature {
    owner: HexString;
    sig: HexString;
}
interface InjectedTx {
    type: string;
    from: HexString;
    to: HexString;
    amount: number;
    timestamp: Timestamp;
    sign: Signature;
}
interface SignedShardusTx {
    receivedTimestamp: Timestamp;
    inTransaction: InjectedTx;
    sign: Signature;
}
interface TransactionReceipt {
    stateId: null;
    targetStateId: null;
    txHash: HexString;
    time: Timestamp;
}
interface AcceptedTX {
    id: HexString;
    timestamp: Timestamp;
    data: InjectedTx;
    status: number;
    receipt: TransactionReceipt;
}
type PreApplyAcceptedTransactionResult = {
    applied: boolean;
    passed: boolean;
    applyResult: string;
    reason: string;
    applyResponse?: ApplyResponse;
};
interface ApplyResponse {
    stateTableResults: StateTableObject[];
    txId: string;
    txTimestamp: number;
    accountData: WrappedResponse[];
    appDefinedData: any;
}
interface StateTableObject {
    accountId: string;
    txId: string;
    txTimestamp: string;
    stateBefore: string;
    stateAfter: string;
}
interface WrappedResponse {
}
export type AppliedVote = {
    txid: string;
    transaction_result: boolean;
    account_id: string[];
    account_state_hash_after: string[];
    cant_apply: boolean;
    node_id: string;
    sign?: Signature;
};
export type AppliedReceipt = {
    txid: string;
    result: boolean;
    appliedVotes: AppliedVote[];
};
type CommitConsensedTransactionResult = {
    success: boolean;
};