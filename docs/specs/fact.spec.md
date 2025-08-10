# FACT (Fast Aggregated Corresponding Tell) Algorithm Specification

## Executive Summary

FACT (Fast Aggregated Corresponding Tell) is a deterministic message routing algorithm that enables efficient and secure data transfer between groups of nodes in a dynamically sharded network. It ensures that diverse data can be moved from one group to another with optimal aggregation while preventing any single node from exerting disproportionate power over the network.

## Overview

### Purpose

FACT addresses critical needs in sharded blockchain systems:
1. **Efficient Data Movement**: Transfer different facts between node groups without redundancy
2. **Security**: Deterministic authorization prevents unauthorized nodes from sending data
3. **Aggregation**: Optimally batch multiple data items into single messages
4. **Scalability**: Constant computation cost regardless of network size

### Key Features

- **One-Shot Authorization**: Verify sender legitimacy without iterating through entire groups
- **Deterministic Routing**: All nodes can independently calculate who should send to whom
- **Wrapping Support**: Handles circular address space edge cases
- **Variable Group Sizes**: Works with groups of different sizes

## Core Algorithm

### Parameters

```typescript
interface FACTParameters {
  ourIndex: number              // Sender's index in transaction group
  startTargetIndex: number      // Start of receiver group range
  endTargetIndex: number        // End of receiver group range  
  globalOffset: number          // Random deterministic offset from txId
  receiverGroupSize: number     // Size of receiving group
  sendGroupSize: number         // Size of sending group
  transactionGroupSize: number  // Total transaction group size
}
```

### Main Functions

#### 1. getCorrespondingNodes

Determines which nodes a sender should send data to.

```typescript
function getCorrespondingNodes(
  ourIndex: number,
  startTargetIndex: number,
  endTargetIndex: number,
  globalOffset: number,
  receiverGroupSize: number,
  sendGroupSize: number,
  transactionGroupSize: number,
  note = ''
): number[]
```

**Algorithm Steps**:

1. **Handle Wrapping**: If receiver group wraps around (start > end), adjust indices
2. **Wrap Sender Index**: `ourIndex = ourIndex % sendGroupSize`
3. **Find Initial Target**: 
   - Loop through receiver range
   - Calculate: `targetNumber = (i + globalOffset) % receiverGroupSize`
   - If `targetNumber === ourIndex`, sender is authorized
4. **Find Additional Targets**: When `sendGroupSize < receiverGroupSize`
   - Continue incrementing by `sendGroupSize`
   - Handle wrapping at transaction group and receiver group boundaries
5. **Return**: Array of receiver indices to send to

**Key Properties**:
- Returns empty array if node shouldn't send
- Handles split ranges (wrapping around address space)
- Loop complexity: O(receiverGroupSize / sendGroupSize)

#### 2. verifyCorrespondingSender

Validates if a sender is authorized to send data to a receiver.

```typescript
function verifyCorrespondingSender(
  receivingNodeIndex: number,
  sendingNodeIndex: number,
  globalOffset: number,
  receiverGroupSize: number,
  sendGroupSize: number,
  receiverStartIndex = 0,
  receiverEndIndex = 0,
  transactionGroupSize = 0,
  shouldUnwrapSender = false,
  note = ''
): boolean
```

**Algorithm**:

1. **Handle Wrapping**: Adjust indices if receiver group is split
2. **Calculate Target**: 
   ```typescript
   targetIndex = ((receivingNodeIndex + globalOffset) % receiverGroupSize) % sendGroupSize
   targetIndex2 = sendingNodeIndex % sendGroupSize
   ```
3. **Verify**: Return `targetIndex === targetIndex2`

**Key Properties**:
- One-shot verification (no loops)
- Supports unwrapping for split sender groups
- Deterministic based on global offset

### Security Features

#### Global Offset

The `globalOffset` is derived from transaction data (typically last 4 hex chars of txId):
- Randomizes sender-receiver pairings
- Prevents predictable routing patterns
- Different for each transaction

#### Authorization Layers

1. **FACT Algorithm**: Determines index-based authorization
2. **Group Membership**: Sender must be in appropriate group (execution/transaction)
3. **Coverage Validation**: Sender must cover the account ranges being sent

## Usage Patterns

### Pattern 1: Gather (N Groups → 1 Group)

**Use Case**: Collecting account data from transaction group to execution group

**Configuration**:
- `receiverGroupSize`: Execution group size (typically 128)
- `sendGroupSize`: Transaction group size
- `startTargetIndex/endTargetIndex`: Execution group range

**Flow**:
1. Each node in transaction group loads accounts it owns
2. Calls `getCorrespondingNodes` to find execution nodes to send to
3. Sends all owned account data to those nodes

### Pattern 2: Disperse (1 Group → N Groups)

**Use Case**: Distributing final state from execution group to transaction group

**Configuration**:
- `receiverGroupSize`: Transaction group size
- `sendGroupSize`: Execution group size (typically 128)
- `startTargetIndex/endTargetIndex`: Full transaction group (0 to size)

**Flow**:
1. Execution nodes have all final account states
2. Call `getCorrespondingNodes` to find target nodes
3. For each target, filter accounts within their storage range
4. Send relevant accounts to each target

### Pattern 3: Transfer (1 Group → 1 Group)

**Use Case**: Moving data between equal-sized groups

**Configuration**:
- Both groups same size
- Simple 1:1 or 1:few mapping

## Implementation Details

### Wrapping Handling

The algorithm handles three types of wrapping:

1. **Receiver Group Wrapping**: When group spans address space boundary
   ```typescript
   if (startTargetIndex > endTargetIndex) {
     unWrappedEndIndex = endTargetIndex
     endTargetIndex = endTargetIndex + transactionGroupSize
   }
   ```

2. **Transaction Group Wrapping**: When index exceeds transaction group size
   ```typescript
   if (wrappedIndex >= transactionGroupSize) {
     wrappedIndex = wrappedIndex - transactionGroupSize
   }
   ```

3. **Receiver Range Wrapping**: When index exceeds receiver range
   ```typescript
   if (wrappedIndex >= endTargetIndex) {
     wrappedIndex = wrappedIndex - receiverGroupSize
   }
   ```

### Edge Cases

1. **Split Receiver Range**: Special handling for wrapped-around ranges
2. **Unequal Group Sizes**: Multiple sends when sender group is smaller
3. **Self-Sending**: Filtered out in implementation
4. **Empty Authorization**: Returns empty array when not authorized

## Integration Points

### Configuration

Enable FACT in `config.json`:
```javascript
{
  p2p: {
    useFactCorrespondingTell: true  // Enable FACT algorithm
  },
  stateManager: {
    correspondingTellUseUnwrapped: true,  // Handle wrapped indices
    factBeforeSpreadFactor: 1,  // Spread factor for redundancy
    enableBeforeStateDissentDetection: false  // Enable dissent detection
  }
}
```

### Required Context

When using FACT, the following must be available:
- Transaction ID (for global offset calculation)
- Node indices in transaction group
- Group membership information
- Storage/consensus ranges for filtering

## Performance Characteristics

### Computation Complexity

- **getCorrespondingNodes**: O(receiverGroupSize / sendGroupSize)
  - Typically constant time (1-2 iterations)
  - Worst case: receiver much larger than sender

- **verifyCorrespondingSender**: O(1)
  - Single calculation, no loops
  - Constant time verification

### Network Efficiency

- **Message Aggregation**: All data to same receiver in one message
- **No Redundancy**: Each fact sent exactly once (without spread factor)
- **Deterministic Routing**: No coordination overhead

### Scalability

As network grows:
- Computation remains constant per node
- Total messages scale with shard count
- Per-node message count remains bounded

## Security Considerations

### Attack Resistance

1. **Sybil Attacks**: Global offset randomization prevents targeted positioning
2. **Message Spoofing**: One-shot verification rejects unauthorized senders
3. **Denial of Service**: Limited message targets per sender
4. **Data Withholding**: Multiple paths with spread factor

### Validation Requirements

Receivers must validate:
1. Sender is in correct group (execution/transaction)
2. Sender passes FACT verification
3. Sender covers claimed account ranges
4. Data integrity (hashes, signatures)

## Spread Factor Extension

For enhanced reliability, the spread factor allows multiple senders per receiver:

```typescript
// With spread factor = 2
for (let i = 0; i < spreadFactor; i++) {
  const modifiedGlobalOffset = globalOffset + i
  // Calculate different sender for each spread index
}
```

**Benefits**:
- Redundancy against node failures
- Detection of dissenting data
- Improved fault tolerance

**Trade-offs**:
- Increased network messages
- Higher bandwidth usage
- More complex verification

## Migration from Legacy

### Key Differences from Original Corresponding Tell

1. **Simplified Calculation**: No complex shard math per account
2. **Better Aggregation**: Automatic batching of all data to same target
3. **One-Shot Verification**: No iteration through sender groups
4. **Cleaner Abstraction**: Works in transaction group space

### Compatibility

- Coexists with legacy system via configuration flags
- Gradual rollout possible
- Backward compatible message formats

## Usage Guidelines

### When to Use FACT

**Ideal for**:
- Transaction data collection (gather)
- Result distribution (disperse)
- Cross-shard communication
- Any group-to-group data transfer

**Not Suitable for**:
- Single node to single node messages
- Broadcast to all nodes
- Non-deterministic routing needs

### Best Practices

1. **Calculate Once**: Cache corresponding nodes for multiple data items
2. **Batch Sends**: Aggregate all data for same target
3. **Verify Early**: Check authorization before processing
4. **Handle Failures**: Implement retry with spread factor

### Common Pitfalls

1. **Wrong Group Sizes**: Ensure accurate group size parameters
2. **Index Confusion**: Distinguish transaction vs execution indices
3. **Missing Unwrap**: Handle wrapped indices correctly
4. **Stale Offsets**: Use current transaction's offset

## Testing and Validation

### Unit Test Coverage

Test cases should cover:
- Basic routing (various group sizes)
- Wrapping scenarios (all three types)
- Edge cases (empty groups, single node)
- Security (unauthorized senders)
- Spread factor variations

### Integration Testing

Validate:
- Data completeness (all accounts transferred)
- No duplication (without spread factor)
- Performance at scale
- Failure recovery

### Debugging

Enable verbose logging:
```typescript
if (logFlags.verbose) {
  console.log(`FACT routing: ${ourIndex} -> ${destinationNodes}`)
}
```

Common debug points:
- Global offset calculation
- Index wrapping logic
- Group size mismatches
- Authorization failures

## Conclusion

The FACT algorithm provides an elegant solution to the complex problem of secure, efficient data routing in sharded systems. Its deterministic nature, combined with one-shot verification and optimal aggregation, makes it well-suited for high-performance blockchain networks. The algorithm's simplicity belies its power - handling complex scenarios like wrapping ranges and variable group sizes while maintaining constant-time performance characteristics.