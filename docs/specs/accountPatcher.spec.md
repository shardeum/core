# Account Patcher Specification

## Executive Summary

The AccountPatcher is a critical subsystem in the Shardus Core protocol that ensures data consistency across validators in a dynamically sharded network. It uses a Sharded-Hash-Trie structure to efficiently detect and repair out-of-sync account data, enabling validators to maintain consensus on the global state despite each validator only storing a portion of the total data.

## Overview

### Purpose

The AccountPatcher allows validators to:
1. Detect when their account data is out of sync with the network majority
2. Efficiently identify specific accounts that need repair
3. Request correct data from nodes in the majority
4. Handle edge cases where minority nodes have newer data than the majority

### Key Challenges Addressed

- **Dynamic Sharding**: Each validator stores a different, overlapping range of accounts
- **Partial View**: No single validator has the complete state
- **Network Dynamics**: Validators join/leave, causing coverage changes
- **Data Freshness**: Ensuring the newest valid data propagates correctly

## Architecture

### Sharded-Hash-Trie Structure

The core data structure is a 16-way radix trie with the following properties:

#### Structure Properties
- **Dynamic Depth (capped)**: Depths are computed each cycle from shard values and coverage, and capped by configuration
  - `treeMaxDepth`: Configured maximum trie depth (commonly 3–4)
  - `treeSyncDepth`: The level at which sync hashes are shared (often 1); may adapt with network size and coverage
- **Radix Keys**: Hexadecimal strings representing position in the 32-byte address space
- **Sparse Arrays**: Each node contains up to 16 children (0-9, a-f)
- **Distributed Construction**: No single node builds or stores the complete trie; each node maintains the portions it covers, with placeholders for incomplete regions

#### Trie Nodes

```typescript
type HashTrieNode = {
  radix: string                    // Position in trie (hex string)
  hash: string                     // Hash of node contents
  children: HashTrieNode[]         // Up to 16 child nodes
  childHashes: string[]            // Hashes of children
  accounts?: TrieAccount[]         // Leaf nodes only: sorted account list
  accountTempMap?: Map             // Temporary storage during updates
  updated: boolean                 // Dirty flag for updates
  isIncomplete: boolean            // Coverage gap indicator
  nonSparseChildCount: number      // Number of non-null children
}
```

#### Leaf Nodes
- Contain sorted lists of account IDs and their hashes
- Account data is hashed to produce the leaf hash
- Maximum depth nodes (`treeMaxDepth`)

#### Internal Nodes
- Contain hashes of their children
- Hash computed as: `hash(childHashes)`
- Enable efficient comparison of large subtrees

### Coverage Model

#### Node Coverage Types
1. **Stored Accounts**: Accounts within the validator's storage range
2. **Consensus Accounts**: Subset where validator participates in consensus
3. **Edge Accounts**: Additional buffer accounts for network dynamics

#### Incomplete Nodes
When a validator doesn't store all accounts in a trie region:
- Node marked as `isIncomplete`
- Cannot compute authoritative hash for that subtree
- Relies on majority consensus for validation

## Core Operations

### 1. Update Cycle (`updateTrieAndBroadCast`)

**Frequency**: Once per cycle (60 seconds)

**Process**:
1. Calculate tree depths based on network size and coverage; resize trie if needed
2. Ingest recent state changes meeting age requirements
3. Update the Sharded-Hash-Trie structure (bottom-up propagation)
4. Broadcast sync hashes to neighbors

**Function Flow**:
```
updateTrieAndBroadCast(cycle)
  ├── Calculate sync levels
  ├── Resize trie if needed
  ├── upateShardTrie(cycle)
  │   ├── Process accountUpdateQueue
  │   ├── Update leaf nodes
  │   ├── Propagate hashes upward
  │   └── Return update statistics
  └── broadcastSyncHashes(cycle)
```

### 2. Sync Hash Broadcasting (`broadcastSyncHashes`)

**Purpose**: Share trie hashes at sync depth with neighboring validators

**Process**:
1. Identify sync-level radixes within coverage
2. Group messages by destination nodes (consensus and edge neighbors)
3. Send hashes using binary-serialized P2P routes
4. Rate-limit payloads via configuration to avoid large responses

**Message Structure**:
```typescript
type HashTrieSyncTell = {
  cycle: number
  nodeHashes: Array<{
    radix: string
    hash: string
  }>
}
```

### 3. Consensus Building

**Process**:
1. Collect sync hashes from neighbors
2. Build consensus on each radix hash
3. Track votes per hash value
4. Determine majority hash (best votes)
5. Skip radixes with insufficient votes or currently in active syncing ranges

**Consensus Data**:
```typescript
type HashTrieSyncConsensus = {
  cycle: number
  radixHashVotes: Map<radix, {
    bestHash: string
    bestVotes: number
    allVotes: Map<hash, {
      count: number
      voters: Set<Node>
    }>
  }>
  // Tracks coverage/syncing state for each radix at sync depth
  coverageMap: Map<radix, { inCoverage: boolean; syncing: boolean }>
}
```

Notes:
- A minimum vote threshold (minVotes) is computed from network size/coverage. Radixes with fewer than `minVotes` are not considered authoritative for patching.

### 4. Testing and Patching (`testAndPatchAccounts`)

**Frequency**: Shortly after sync hash consensus

**Process**:
1. Check if in sync with majority (`isInSync`) at sync depth
2. If out of sync, find bad accounts (`findBadAccounts`)
3. Request repair data (account state by hashes) from majority nodes
4. Filter and apply repairs (timestamp and hash validation)
5. Handle special cases (newer local data, reverse healing)

**Decision Flow**:
```
testAndPatchAccounts(cycle)
  ├── isInSync(cycle)?
  │   ├── Yes: Done
  │   └── No: Continue
  ├── findBadAccounts(cycle)
  │   ├── Compare with consensus
  │   ├── Traverse trie to leaf level
  │   └── Identify specific accounts
  ├── Request account data by hashes
  ├── Filter repair candidates
  │   ├── Check timestamps (reject too-old)
  │   ├── Verify account hashes
  │   └── Handle removals
  └── Apply repairs
```

### 5. Finding Bad Accounts (`findBadAccounts`)

**Purpose**: Identify specific accounts that differ from majority

**Algorithm**:
1. Start at sync depth with consensus mismatches (meeting minVotes)
2. Request child hashes from majority nodes for those radixes
3. Compare with local hashes and descend levels where mismatches are found
4. At leaf level, compare per-account hashes to extract account IDs needing repair
5. If child hashes match but remote has additional known keys in our coverage, surface `extraBadKeys` for reverse healing

**Optimization**: Guided descent across trie levels using child-hash diffs and cached local leaves; avoids requesting entire subtrees unnecessarily.

### 6. Repair Flows

#### Standard Repair (Minority → Majority)
1. Local node has incorrect/old data
2. Requests correct data from majority
3. Validates and applies updates
4. Most common case

#### Reverse Healing (Minority → Majority)
Three mechanisms enable this:

1. **Too Old Accounts** (`tooOldAccountsMap`)
   - Detected when repair data is older than local
   - Local node sends newer data to helpers
   - Prevents regression to older state

2. **Extra Bad Accounts** (`extraBadAccounts`)
   - Accounts the remote node needs but didn't request
   - Discovered during trie traversal
   - Proactively sent to remote nodes

3. **Accounts They Need to Repair** (`accountsTheyNeedToRepair`)
   - Currently disabled/incomplete due to logic gaps in `findBadAccounts`
   - Intended to identify accounts remote nodes are missing
   - Would enable stronger bidirectional repair

## Data Flow

### Account Update Pipeline

1. **Transaction Execution**: Produces account updates
2. **Queue Accumulation**: Updates collected in `accountUpdateQueue`
3. **Cycle Trigger**: Updates processed once per cycle
4. **Trie Update**: Bottom-up hash recalculation
5. **Broadcast**: Sync hashes sent to neighbors
6. **Consensus**: Majority agreement on hashes
7. **Repair**: Out-of-sync accounts corrected

### Network Communication

#### Binary Endpoints
- `binary_sync_trie_hashes`: Broadcast sync hashes
- `binary_get_trie_hashes`: Request child hashes
- `binary_get_trie_account_hashes`: Request leaf accounts (accountID+hash at leaf radixes)
- `binary_get_account_data_by_hashes`: Get full account data for specific hashes
- `binary_repair_oos_accounts`: Send repair instructions

Note: Endpoint names correspond to `InternalRouteEnum.*` in code and are binary-serialized.

#### Message Patterns
- **Tell**: Direct message to specific nodes
- **Gossip**: Redundant propagation for reliability
- **Request/Response**: Query specific data

## Timing and Scheduling

### Cycle Timeline
1. **Q1 Start**: Shard calculations
2. **Early Q1**: Update trie and broadcast (`updateTrieAndBroadCast`)
3. **Mid Q1**: Build consensus on sync hashes
4. **Late Q1**: Test and patch accounts (`testAndPatchAccounts`)
5. **Q2-Q4**: Normal transaction processing

### Timing Parameters
- **Cycle Duration**: 60 seconds
- **Update Delay**: ~5 seconds after cycle start
- **Patch Delay**: ~10 seconds after update
- **Consensus Window**: ~5 seconds

## Security Considerations

### Byzantine Fault Tolerance
- Requires majority (>50%) honest nodes
- Consensus on sync hashes prevents individual manipulation
- Multiple nodes queried for repair data

### Data Integrity
- All account data includes cryptographic hashes
- Timestamps prevent rollback attacks
- Receipts provide proof of valid updates

### Attack Mitigation
- **False Data**: Detected by hash verification
- **Replay**: Prevented by timestamp checks
- **Eclipse**: Multiple source verification
- **Denial of Service**: Rate limiting and node reputation

## Performance Optimizations

### Efficient Updates
- Incremental trie updates (only changed paths)
- Bottom-up hash propagation
- Batch processing per cycle

### Network Efficiency
- Binary serialization for messages
- Compressed child hash requests
- Targeted repairs (only bad accounts)
- Limit per-response size via `patcherMaxChildHashResponses`

### Caching
- Account hash cache (`AccountHashCache`)
- Trie node reuse between cycles
- Consensus history for multiple cycles

## Configuration

### Key Parameters
```javascript
{
  stateManager: {
    accountPatcher: {
      enabled: true,                 // Enable patcher system
      treeMaxDepth: 4,               // Max trie depth (cap)
      treeSyncDepth: 1,              // Sync hash depth (typical starting level)
      patchCycleOffset: 10,          // Seconds after cycle start to run patcher
      maxRepairRequests: 100,        // Per-cycle repair limit
    },
    patcherMaxChildHashResponses: 5000 // Upper bound on leaf account responses per request
  },
  p2p: {
    useBinarySerializedEndpoints: true,
    syncTrieHashesBinary: true,
    getTrieHashesBinary: true,
    getTrieAccountHashesBinary: true
  },
  debug: {
    haltOnDataOOS: false,            // Optional: halt repairs when OOS detected (debug only)
    verboseNestedCounters: false
  }
}
```

Notes:
- Depths are computed per cycle based on shard values but limited by configured caps.
- Additional thresholds (e.g., minVotes) are derived from network size and coverage.

## Error Handling

### Failure Modes
1. **Consensus Timeout**: Skip cycle, retry next
2. **Network Partition**: Continue with available nodes; skip radixes with insufficient votes
3. **Invalid Repair Data**: Reject and log
4. **Persistent Mismatch**: Track failure history

### Recovery
- Automatic retry next cycle
- Failure history tracking (`syncFailHistory`)
- Escalating repair strategies
- Fatal error reporting for investigation
- Debug mode option to halt on OOS for forensic analysis

## Monitoring and Debugging

### Key Metrics
- `stats.testedSyncRadix`: Radixes checked for consensus
- `stats.badSyncRadix`: Radixes needing repair
- `badAccounts.length`: Accounts needing repair
- `filterStats`: Repair filtering statistics
- `repairRequestsMadeThisCycle`: Network load
- `accountHashesChecked`: Per-leaf accounts examined

### Debug Features
- Extensive counter events via `nestedCountersInstance`
- Detailed logging of repair decisions
- Stats objects at each operation level
- Cycle-by-cycle history tracking
- HTTP debug endpoint: `GET /debug-patcher-fail-hashes` to inspect consensus failures at sync depth

## Future Improvements

### Identified Issues
1. **accountsTheyNeedToRepair Logic**: Currently broken/incomplete, needs fix
2. **Bidirectional Repair**: Not fully implemented
3. **Scalability**: Tree depth calculation for very large networks

### Potential Enhancements
1. **Merkle Proofs**: For efficient verification
2. **Parallel Repair**: Multiple concurrent repairs
3. **Adaptive Sync Depth**: Based on network size and coverage
4. **Compression**: For trie node storage

## Conclusion

The AccountPatcher provides a robust mechanism for maintaining data consistency in a sharded blockchain network. Its hierarchical approach using the Sharded-Hash-Trie enables efficient detection and repair of inconsistencies while minimizing network overhead. The system's ability to handle both standard repairs and reverse healing ensures that the newest valid data propagates correctly throughout the network, maintaining the integrity of the global state despite the challenges of dynamic sharding.