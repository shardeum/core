# POQo (Proof of Quorum) Specification

## Executive Summary

POQo (Proof of Quorum) is Shardeum's consensus algorithm for achieving agreement on transaction execution across a sharded network. It uses a 2/3 supermajority voting mechanism optimized for large consensus groups (128 nodes) while minimizing network messages and storage overhead. This specification documents the current implementation based on analysis of the codebase and example data.

## Core Concepts

### Node Groups

#### Consensus Nodes (128 nodes)
- Store account data for their assigned range
- Provide authority as execution nodes during consensus
- Act as data sources for synchronization
- Validate transaction execution and vote on results

#### Edge Nodes
- Store account data without consensus participation
- Provide buffer zones during network growth/shrinkage
- Typically 5-10 nodes on each side of consensus range
- Prevent data loss during node rotation

#### Storage Nodes
- Combined set of consensus and edge nodes
- All nodes that persistently store account data

#### Transaction Group
- All nodes storing any account involved in a transaction
- Includes both execution and non-execution nodes
- Encompasses edge nodes for affected accounts

#### Execution Group
- 128 consensus nodes selected to execute the transaction
- Deterministically chosen based on transaction's execution shard key
- Sorted by node ID for priority ordering
- All members participate in voting

#### Non-Execution (NonEx) Group
- Transaction group nodes not in the execution group
- Provide account data to execution nodes
- Receive and store transaction results

### Data Structures

#### Proposal
The core data structure representing transaction execution results:

```typescript
type Proposal = {
  txid: string                    // Transaction identifier
  applied: boolean                 // Whether transaction was successfully applied
  cant_preApply: boolean          // Indicates pre-apply validation failure
  accountIDs: string[]            // Affected account addresses
  beforeStateHashes: string[]     // Account state hashes before execution
  afterStateHashes: string[]      // Account state hashes after execution
  appReceiptDataHash: string      // Hash of application-specific receipt data
  executionShardKey: string       // Key determining execution group
}
```

#### Vote
Individual node's signed agreement on a proposal:

```typescript
type Vote = {
  proposalHash: string            // Hash of the proposal being voted on
  sign?: Shardus.Sign            // Node's signature
}
```

#### SignedReceipt
The consensus proof containing proposal and signatures:

```typescript
type SignedReceipt = {
  proposal: Proposal              // The agreed-upon execution result
  proposalHash: string           // Hash of the proposal (redundant, may be removed)
  signaturePack: Shardus.Sign[]  // Array of validator signatures
  voteOffsets: number[]          // Indices of signing nodes
  sign?: Shardus.Sign           // Aggregator's final signature
}
```

#### ArchiverReceipt
Complete transaction record sent to archiver nodes:

```typescript
type ArchiverReceipt = {
  tx: {
    originalTxData: OpaqueTransaction  // Original transaction data
    txId: string                       // Transaction identifier
    timestamp: number                  // Transaction timestamp
  }
  signedReceipt: SignedReceipt        // Consensus proof
  appReceiptData: any                 // Application-specific data (e.g., EVM receipt)
  beforeStates?: AccountsCopy[]      // Account states before execution (optional)
  afterStates?: AccountsCopy[]       // Account states after execution
  cycle: number                       // Network cycle when processed
  globalModification: boolean         // Whether affects global state
}
```

## Algorithm Flow

### Phase 0: Transaction Preparation

1. **Transaction Arrival**: Transaction enters the queue
2. **Data Collection**: Non-execution nodes send required account data to execution nodes
3. **Execution**: Each execution node independently executes the transaction
4. **Proposal Creation**: Each node generates a proposal with execution results

### Phase 1: Vote Collection

The voting process follows a deterministic priority order to minimize network traffic:

1. **Priority Ordering**: Execution group nodes are sorted deterministically by node ID
2. **Vote Loop** (`poqoVoteSendLoop`):
   - Starting with index 0, each node sends its vote to the next node in priority order
   - Loop continues with configurable wait time (`poqoLoopTime` = 2000ms default)
   - Batch size configurable (`poqoBatchCount` = 1 default)
3. **Vote Aggregation**: Each node collects votes until supermajority reached

### Phase 2: Receipt Formation

When a node achieves 2/3 supermajority:

1. **Receipt Creation**: Node creates `SignedReceipt` with:
   - The winning proposal
   - Collected signatures from voting nodes
   - Vote offsets indicating which nodes signed
   - Aggregator's signature over the entire receipt

2. **TellX128**: Aggregator broadcasts receipt to all execution nodes via `poqoSendReceipt`

3. **Validation**: Recipients verify:
   - Aggregator is in execution group
   - Signatures are valid
   - Supermajority threshold met (>= 86 signatures for 128-node group)

### Phase 3: Data Distribution

Receipt and data sharing follows a Tell+Gossip pattern:

1. **Corresponding Tell** (`factTellCorrespondingNodesFinalData`):
   - Execution nodes forward receipt + account data to non-execution nodes
   - Uses FACT (Forward Account Corresponding Tell) for efficiency
   - Each execution node handles specific non-execution nodes

2. **Gossip Propagation**:
   - First receipt recipient initiates gossip
   - Uses "common-origin-non-burst" gossip variant
   - Low gossip factor for controlled spread
   - Ensures redundancy if tell messages fail

3. **Fallback Data Request**:
   - If node receives receipt without data
   - Waits `nonExWaitForData` ms
   - Requests missing data via `poqoRequestData`

## Proposal Hash Calculation

The proposal hash uses a nested structure for future Merkle optimizations:

```
ProposalHash = hash(
  hash(applied, cant_preApply, executionShardKey),
  hash(
    hash(accountIDs),
    hash(beforeStateHashes),
    hash(afterStateHashes)
  ),
  appReceiptDataHash
)
```

This structure allows for:
- Selective data pruning while maintaining signature validity
- Future compression via Merkle proofs
- Efficient validation of partial data

## Network Message Types

### Internal Binary Routes

1. **`binary_poqo_send_vote`**: Vote transmission between execution nodes
2. **`binary_poqo_send_receipt`**: Receipt broadcast from aggregator
3. **`poqoDataPlusReceipt`**: Combined receipt and account data
4. **`poqoReceiptGossip`**: Gossip propagation of receipts
5. **`poqoRequestData`**: Fallback data request

### Message Optimizations

- Binary serialization for all POQo messages
- Separate arrays for node IDs and signatures (future compression)
- Type checking via `TypeIdentifierEnum`
- Scoped profiling for performance monitoring

## Validation Rules

### Vote Validation
1. Voter must be in execution group
2. Signature must be valid
3. Proposal hash must match
4. No duplicate votes from same node

### Receipt Validation
1. Aggregator must be in execution group
2. Aggregator signature must be valid
3. Minimum 2/3 supermajority (86 of 128 nodes)
4. All signatures in pack must be valid
5. No duplicate signatures

### Data Validation
1. Account state hashes must match proposal
2. Application receipt hash must match proposal
3. Execution shard key must be correct
4. Transaction ID must match

## Configuration Parameters

```javascript
{
  // POQo specific settings
  usePOQo: true,                    // Enable POQo consensus
  poqoLoopTime: 2000,              // Ms between vote attempts
  poqoBatchCount: 1,               // Nodes to contact per loop
  nonExWaitForData: 30000,         // Ms before requesting missing data
  
  // Network settings
  nodesPerConsensusGroup: 128,     // Consensus group size
  consensusRadius: 64,             // Nodes on each side
  
  // Gossip settings
  gossipFactor: 4,                 // Low factor for controlled spread
  maxGossipDepth: 5,               // Maximum gossip hops
}
```

## Storage Optimizations

### Current Implementation
- Binary encoding for network messages
- Signature deduplication before storage
- Optional before-state storage (configurable by archiver)

### Future Optimizations
1. **Signature Compression**:
   - ZK-SNARK proofs of validated signatures
   - Merkle reduction techniques
   - Cold storage with partial signatures

2. **Account Data**:
   - Use values as hashes for 32-byte EVM data
   - Compression of state transitions
   - Delta encoding for sequential states

3. **Block Integration**:
   - Merkle roots at archiver level
   - Transaction batching
   - Cross-shard proof generation

## Example Receipt

From production data (cycle 113561):

```json
{
  "proposal": {
    "txid": "0ea708a11ae6f33993ac1d7248b20d6d9a14acd5237c28737671e1915d5fef2b",
    "applied": true,
    "accountIDs": [
      "1b62e8ed306697b852d3ed73c125257611a7dbfc000000000000000000000000",
      "d147b878cdac7b04f3569f6f7fc44d6a308a4452000000000000000000000000"
    ],
    "beforeStateHashes": [
      "bd2ec4795bfe9c16426c62df8c95643161d030954a86206d838bada8041cbbcc",
      "e78368d7fddf55e81fb46a9019490bca8d91d5355e092a2e02712a8a8c093482"
    ],
    "afterStateHashes": [
      "9bc5a906109fcce1e869a23150aedd2957a11239e746d97e1636fc69979b83eb",
      "91364ff052d2ac9920d0bb5641cdc3702d0c0b5e633de7a7b02e9892eda37f13"
    ],
    "appReceiptDataHash": "c0d81fb4675f794a0d56699b0ac98ba7b9ee36d3859c0cb77ed01d746d61fdb1",
    "executionShardKey": "d147b878cdac7b04f3569f6f7fc44d6a308a4452000000000000000000000000"
  },
  "signaturePack": [/* 86+ signatures */],
  "sign": {/* aggregator signature */}
}
```

## Performance Characteristics

### Message Complexity
- **Vote Phase**: O(n) messages in happy path, O(n²) worst case
- **Receipt Distribution**: O(n) via TellX128
- **Data Distribution**: O(n) via corresponding tell
- **Gossip**: O(n log n) for redundancy

### Latency
- **Happy Path**: 3 network hops to consensus
- **Vote Collection**: 2-4 seconds typical
- **Total Consensus**: 4-6 seconds for 128 nodes

### Storage
- **Receipt Size**: ~10KB with 86 signatures
- **Binary Encoding**: 50% reduction vs JSON
- **Future Compression**: 80-90% possible reduction

## Security Considerations

### Attack Vectors and Mitigations

1. **Vote Spoofing**: Prevented by signature verification
2. **Receipt Forgery**: Requires compromising 86+ nodes
3. **Data Withholding**: Mitigated by redundant tell+gossip
4. **Timing Attacks**: Deterministic ordering prevents manipulation
5. **DoS Protection**: Rate limiting and proof-of-work for endpoints

### Byzantine Fault Tolerance
- Tolerates up to 42 malicious nodes (33% of 128)
- Supermajority requirement ensures safety
- Liveness guaranteed with 86+ honest nodes

## Migration and Compatibility

### Coexistence Strategy
- POQo coexists with legacy consensus (oPOQ, POQ-LS)
- Flag-based switching (`usePOQo` config)
- Gradual rollout possible via node updates

### Version Management
- Binary protocol versioning via TypeIdentifier
- Backward compatibility for receipt formats
- Progressive enhancement for optimizations

## Conclusion

POQo represents a significant advancement in sharded blockchain consensus, optimizing for:
- **Scalability**: Efficient message patterns for 128-node groups
- **Performance**: 3-hop happy path matching simpler algorithms
- **Storage**: Binary encoding and future compression paths
- **Reliability**: Multiple redundancy layers ensure delivery
- **Security**: Strong Byzantine fault tolerance with 2/3 supermajority

The implementation successfully balances theoretical optimality with practical engineering constraints, providing a robust foundation for Shardeum's high-throughput transaction processing.