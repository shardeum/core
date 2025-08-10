# FACT Algorithm Usage Survey

## High-Level Overview

The FACT algorithm is used in **five primary locations** within the Shardus Core codebase:

1. **TransactionQueue.ts** - Main transaction processing (gather & disperse operations)
2. **CachedAppDataManager.ts** - Cached application data distribution
3. **TransactionConsensus.ts** - POQo consensus final data distribution
4. **stateHardeningUtils.ts** - Spread factor extension for state hardening
5. **Unit Tests** - Validation and testing

### Usage Pattern Summary

| Location | Operation Type | Direction | Purpose |
|----------|---------------|-----------|---------|
| `factTellCorrespondingNodes` | Gather | Transaction → Execution | Collect account data for execution |
| `factTellCorrespondingNodesFinalData` | Disperse | Execution → Transaction | Distribute final state after consensus |
| `sendCorrespondingCachedAppData` | Transfer | Node → Node | Share cached app data |
| `verifyCorrespondingSenderWithSpread` | Validation | N/A | Verify with redundancy factor |

## Detailed Usage Analysis

## 1. TransactionQueue.ts

### 1.1 factTellCorrespondingNodes (Gather Operation)

**Location**: `src/state-manager/TransactionQueue.ts:4365-4640`

**Purpose**: Collects account data from transaction group nodes and sends to execution group nodes before transaction execution.

**Detailed Implementation**:

```typescript
async factTellCorrespondingNodes(queueEntry: QueueEntry): Promise<unknown>
```

**Key Steps**:

1. **Setup Phase** (Lines 4367-4405):
   - Determines cycle shard data (current or deterministic)
   - Validates queue entry has unique keys
   - Initializes data collection structures

2. **Account Data Collection** (Lines 4407-4462):
   - Iterates through unique account keys
   - Determines if node owns each account
   - Loads account data and wraps with metadata
   - Tracks local vs remote keys

3. **Target Group Calculation** (Lines 4464-4491):
   - Gets execution group as target
   - Calculates start/end indices in transaction group
   - Determines our index in transaction group
   - Handles wrapped indices for edge cases

4. **FACT Routing Calculation** (Lines 4493-4524):
   ```typescript
   let correspondingIndices = getCorrespondingNodes(
     ourIndexInTxGroup,
     targetIndices.startIndex,
     targetIndices.endIndex,
     queueEntry.correspondingGlobalOffset,
     targetGroupSize,
     senderGroupSize,
     queueEntry.transactionGroup.length,
     'factTellCorrespondingNodes'
   )
   ```
   - Calculates primary corresponding nodes
   - Handles unwrapped index for split ranges
   - Merges indices from both calculations

5. **Spread Factor Handling** (Lines 4525-4551):
   - If `factBeforeSpreadFactor > 1`, calculates additional targets
   - Modifies global offset for each spread index
   - Prevents duplicate sends with Set

6. **Self-Exclusion** (Lines 4573-4607):
   - Checks if our node is in target list
   - Increments global offset if self-targeted
   - Recalculates corresponding nodes

7. **Message Sending** (Lines 4609-4640):
   - Creates broadcast state request with all account data
   - Filters valid nodes for internal message
   - Sends to all corresponding nodes
   - Records telemetry

**Notable Features**:
- Handles wrapped transaction groups
- Supports spread factor for redundancy
- Self-exclusion mechanism
- Extensive logging and telemetry

**Edge Cases Handled**:
- Empty account data (returns early)
- Global modifications (skips telling)
- Invalid nodes filtered before sending
- Wrapped indices in split groups

### 1.2 factValidateCorrespondingMessage (Validation)

**Location**: `src/state-manager/TransactionQueue.ts:4800-4880`

**Purpose**: Validates incoming account data from corresponding nodes during gather phase.

**Implementation Details**:

```typescript
factValidateCorrespondingMessage(
  message: BroadcastStateReq,
  sender: Shardus.Node,
  queueEntry: QueueEntry,
  ourNodeInExecutionGroup: boolean
): { success: boolean; reason: string }
```

**Validation Steps**:

1. **Basic Checks**:
   - Queue entry exists and has transaction group
   - Message has valid structure

2. **Index Calculation**:
   - Finds sender's index in transaction group
   - Determines our index as receiver
   - Handles wrapped sender indices

3. **FACT Verification**:
   ```typescript
   isValidFactSender = verifyCorrespondingSender(
     receivingNodeIndex,
     senderNodeIndex,
     queueEntry.correspondingGlobalOffset,
     targetGroupSize,
     senderGroupSize,
     targetIndices.startIndex,
     targetIndices.endIndex,
     queueEntry.transactionGroup.length,
     false,
     'factValidateCorrespondingMessage'
   )
   ```

4. **Spread Factor Support**:
   - Uses `verifyCorrespondingSenderWithSpread` if enabled
   - Checks multiple offset variations

5. **Retry with Wrapped Index**:
   - If initial verification fails, tries wrapped sender index
   - Handles edge case of split transaction groups

**Security Features**:
- Rejects unauthorized senders
- Validates group membership
- Supports redundancy verification

### 1.3 factTellCorrespondingNodesFinalData (Disperse Operation)

**Location**: `src/state-manager/TransactionQueue.ts:5265-5394`

**Purpose**: Distributes final account states from execution group to transaction group after consensus.

**Implementation Flow**:

1. **Setup** (Lines 5267-5311):
   - Validates execution group membership
   - Gets transaction and execution groups
   - Calculates sender index in transaction group

2. **FACT Calculation** (Lines 5313-5339):
   ```typescript
   let correspondingIndices = getCorrespondingNodes(
     senderIndexInTxGroup,
     targetStartIndex,
     targetEndIndex,
     queueEntry.correspondingGlobalOffset,
     targetGroupSize,
     senderGroupSize,
     queueEntry.transactionGroup.length,
     'factTellCorrespondingNodesFinalData'
   )
   ```
   - Targets entire transaction group
   - Handles unwrapped indices

3. **Per-Node Data Filtering** (Lines 5341-5393):
   - For each corresponding node:
     - Gets node's storage group
     - Filters accounts within their range
     - Creates node-specific payload
     - Sends final data message

**Key Differences from Gather**:
- Sends different data to each node (filtered by storage range)
- Sources from execution results, not loaded accounts
- Includes receipt and consensus proof

### 1.4 factValidateCorrespondingNodesFinalData (Validation)

**Location**: `src/state-manager/TransactionQueue.ts:5468-5497`

**Purpose**: Validates incoming final state data from execution nodes.

**Validation Process**:

```typescript
const isValidFactSender = verifyCorrespondingSender(
  targetNodeIndex,
  senderNodeIndex,
  queueEntry.correspondingGlobalOffset,
  transactionGroupSize,
  executionGroupSize,
  0,
  transactionGroupSize,
  transactionGroupSize,
  false,
  'factValidateCorrespondingNodesFinalData'
)
```

**Notable Aspects**:
- Simpler than gather validation (no spread factor)
- Validates sender is in execution group
- Ensures data relevance to receiver

## 2. CachedAppDataManager.ts

### 2.1 sendCorrespondingCachedAppData (Transfer Operation)

**Location**: `src/state-manager/CachedAppDataManager.ts:405-457`

**Purpose**: Distributes cached application data to nodes that need it for transaction processing.

**Implementation**:

1. **Target Calculation**:
   ```typescript
   const correspondingIndices = getCorrespondingNodes(
     senderIndexInTxGroup,
     targetStartIndex,
     targetEndIndex,
     globalOffset,
     targetGroupSize,
     senderGroupSize,
     transactionGroup.length,
     'sendCorrespondingCachedAppData'
   )
   ```

2. **Data Distribution**:
   - Sends cached app data to corresponding nodes
   - Used when nodes need app-specific cached data
   - Follows same FACT routing as transaction data

### 2.2 factValidateCorrespondingCachedAppDataSender (Validation)

**Location**: `src/state-manager/CachedAppDataManager.ts:368-393`

**Validation Logic**:

```typescript
const isValidFactSender = verifyCorrespondingSender(
  ourIndexInTxGroup,
  senderIndexInTxGroup,
  globalOffset,
  targetGroupSize,
  senderGroupSize,
  targetStartIndex,
  targetEndIndex,
  transactionGroup.length
)
```

**Security Checks**:
- Verifies sender authorization
- Validates transaction group membership
- Ensures data relevance

## 3. TransactionConsensus.ts

### Usage in POQo Consensus

**Location**: `src/state-manager/TransactionConsensus.ts:1516, 2259`

**Context**: Called after POQo consensus achieves supermajority.

**Integration Points**:

1. **After Receipt Formation** (Line 1516):
   ```typescript
   if (queueEntry.ourVoteHash === readableReq.proposalHash) {
     // We are a winning node
     this.stateManager.transactionQueue.factTellCorrespondingNodesFinalData(queueEntry)
   }
   ```
   - Only winning nodes distribute data
   - Ensures consensus before distribution

2. **General Distribution** (Line 2259):
   ```typescript
   if (queueEntry.preApplyTXResult != null && 
       queueEntry.preApplyTXResult.applyResponse != null) {
     this.stateManager.transactionQueue.factTellCorrespondingNodesFinalData(queueEntry)
   }
   ```
   - Validates execution results exist
   - Prevents distribution of failed transactions

**Key Integration Aspects**:
- Tightly coupled with consensus mechanism
- Only distributes after successful consensus
- Ensures data consistency across shards

## 4. stateHardeningUtils.ts

### 4.1 verifyCorrespondingSenderWithSpread

**Location**: `src/utils/stateHardeningUtils.ts:66-104`

**Purpose**: Extended verification supporting multiple senders per receiver for redundancy.

**Implementation**:

```typescript
export function verifyCorrespondingSenderWithSpread(
  receivingNodeIndex: number,
  sendingNodeIndex: number,
  globalOffset: number,
  receiverGroupSize: number,
  sendGroupSize: number,
  receiverStartIndex: number,
  receiverEndIndex: number,
  transactionGroupSize: number,
  shouldUnwrapSender: boolean,
  spreadFactor: number,
  note = ''
): boolean
```

**Algorithm**:
- Iterates through spread factor offsets
- Checks each modified global offset
- Returns true if any offset validates

**Usage Pattern**:
```typescript
for (let i = 0; i < spreadFactor; i++) {
  const modifiedGlobalOffset = globalOffset + i
  const isValid = verifyCorrespondingSender(
    receivingNodeIndex,
    sendingNodeIndex,
    modifiedGlobalOffset,
    // ... other params
  )
  if (isValid) return true
}
```

### 4.2 getCorrespondingSenders

**Location**: `src/utils/stateHardeningUtils.ts:10-60`

**Purpose**: Gets all valid senders for a receiver with spread factor.

**Key Features**:
- Returns array of all valid sender IDs
- Supports multiple spread indices
- Used for identifying redundant data sources

## 5. Configuration and Control Flow

### 5.1 Configuration Flags

**Location**: `src/config/server.ts`

```javascript
{
  p2p: {
    useFactCorrespondingTell: true  // Master switch for FACT
  },
  stateManager: {
    correspondingTellUseUnwrapped: true,  // Handle wrapped indices
    factBeforeSpreadFactor: 1,  // Redundancy factor (1-3)
    enableBeforeStateDissentDetection: false  // Dissent detection
  }
}
```

### 5.2 Control Flow Integration

**Transaction Processing Flow**:

1. **Transaction Arrival**: Queue entry created
2. **State Collection Phase**:
   ```typescript
   if (configContext.p2p.useFactCorrespondingTell) {
     await this.factTellCorrespondingNodes(queueEntry)  // Line 6532
   } else {
     await this.tellCorrespondingNodes(queueEntry)  // Legacy
   }
   ```

3. **Execution**: Transaction processed by execution group

4. **Consensus**: POQo algorithm reaches agreement

5. **Final Distribution**:
   ```typescript
   this.stateManager.transactionQueue.factTellCorrespondingNodesFinalData(queueEntry)
   ```

## 6. Testing Coverage

### Unit Tests

**Location**: `test/unit/src/utils/fastAggregatedCorrespondingTell.test.ts`

**Test Cases**:
- Basic routing scenarios
- Wrapping cases (all three types)
- Different group size combinations
- Verification correctness
- Edge cases (empty groups, single node)

### Integration Points

**Location**: `test/unit/src/state-manager/CachedAppDataManager.test.ts`

**Coverage**:
- Cached data distribution
- Validation logic
- Error handling

## Performance Characteristics Observed

### Message Patterns

1. **Gather Phase**:
   - Messages: O(execution_group_size)
   - Data per message: All owned accounts
   - Aggregation: Automatic

2. **Disperse Phase**:
   - Messages: O(transaction_group_nodes)
   - Data per message: Filtered by storage range
   - Aggregation: Per-node filtering

### Optimization Opportunities

**Current Optimizations**:
- Single calculation for all data to same node
- Efficient index-based routing
- Minimal network overhead

**Potential Improvements**:
- Cache corresponding node calculations
- Batch multiple transactions
- Parallel message sending

## Security Implementation

### Authorization Layers

1. **Group Membership** (Coarse):
   - Execution group validation
   - Transaction group validation
   - Storage range checks

2. **FACT Algorithm** (Fine):
   - Deterministic sender validation
   - Global offset randomization
   - One-shot verification

3. **Data Integrity**:
   - Hash verification
   - Signature validation
   - Timestamp checks

### Attack Surface Analysis

**Protected Against**:
- Unauthorized data injection
- Sybil positioning attacks
- Message spoofing
- Selective data withholding (with spread factor)

**Remaining Considerations**:
- Network partitioning
- Timing attacks
- Resource exhaustion

## Migration Status

### Current State

- FACT is **actively used** when `useFactCorrespondingTell = true`
- Coexists with legacy system
- Production-ready implementation

### Legacy Compatibility

**Parallel Code Paths**:
```typescript
if (configContext.p2p.useFactCorrespondingTell) {
  // FACT implementation
} else {
  // Legacy tellCorrespondingNodes
}
```

### Deprecation Path

**Remaining Legacy Usage**:
- Some test configurations
- Backward compatibility support
- Emergency fallback option

## Debugging and Monitoring

### Key Debug Points

1. **Routing Calculation**:
   ```typescript
   if (logFlags.verbose) {
     console.log(`getCorrespondingNodes ${note} destinationNodes ${destinationNodes}`)
   }
   ```

2. **Verification Failures**:
   ```typescript
   console.log(`X verification failed ${targetIndex} !== ${targetIndex2}`)
   ```

3. **Message Flow**:
   - Counter events for each phase
   - Timing profilers for performance
   - Error logging for failures

### Common Issues and Solutions

**Issue**: Verification failures
**Solution**: Check global offset calculation, verify group indices

**Issue**: Missing data
**Solution**: Verify storage range coverage, check wrapped indices

**Issue**: Performance degradation
**Solution**: Monitor message counts, check for redundant calculations

## Conclusion

The FACT algorithm is deeply integrated throughout the transaction processing pipeline, handling critical data movement operations. Its usage spans from initial state collection through final result distribution, with robust validation at each step. The implementation successfully achieves its design goals of efficiency, security, and scalability while maintaining compatibility with legacy systems. The spread factor extension provides additional reliability for critical operations, though it's currently underutilized in production configurations.