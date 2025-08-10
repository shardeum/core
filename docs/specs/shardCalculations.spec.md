# Sharding Calculations Specification

## High-Level Overview

The Shardeum L1 network implements a sophisticated dynamic sharding protocol where state, transactions, and compute are distributed across the network. Unlike traditional blockchain architectures that process transactions in blocks, Shardeum processes transactions independently and atomically using supermajority consensus within dynamically assigned shard groups.

### Key Principles

1. **Dynamic Sharding**: Each validator node covers a slightly offset range of the 32-byte address space, with no two nodes covering exactly the same range
2. **Atomic Composability**: Transactions are processed independently with guaranteed atomicity across shards
3. **Supermajority Consensus**: Transactions require 2/3 consensus from the relevant shard group
4. **Deterministic Routing**: All sharding calculations are deterministic, allowing any node to compute routing and consensus groups
5. **Adaptive Coverage**: The network automatically adjusts coverage as nodes join or leave

## Core Concepts

### Address Space
- The network operates over a 32-byte (256-bit) address space
- Addresses range from `0x00000000...` to `0xffffffff...`
- The space wraps around (circular topology)

### Partitions
- **Virtual construct**: Partitions are not physical data structures but computational tools
- **One-to-one mapping**: One partition per active validator node
- **Purpose**: Simplifies sharding calculations and range assignments
- **Dynamic sizing**: Partition size adjusts based on network size

### Node Coverage Types

#### 1. Home Partition
- The primary partition assigned to a validator
- Center point for calculating coverage ranges
- Unique to each validator

#### 2. Consensus Range
- Partitions where the node actively participates in consensus
- Extends `consensusRadius` partitions left and right from home partition
- Formula: `consensusRadius = floor((nodesPerConsensusGroup - 1) / 2)`

#### 3. Edge Range
- Additional partitions for data storage without consensus participation
- Provides buffer for network growth/shrinkage
- Prevents data loss during node transitions
- Default: `nodesPerEdge = consensusRadius`

#### 4. Storage Range
- Complete range of partitions stored by a node
- Includes both consensus and edge ranges
- Formula: `storageRadius = consensusRadius + nodesPerEdge`
- Total partitions: `1 + 2 * storageRadius`

## The updateShardValues() Function

The `updateShardValues()` function in `state-manager/index.ts` is called once per cycle to recalculate all sharding parameters. This function orchestrates the entire sharding calculation process.

### Execution Timing
- **Trigger**: Called at the start of Q1 of each cycle (cycle_q1_start event)
- **Frequency**: Once per 60-second cycle
- **Context**: Must complete before transaction processing begins

### Main Operations

#### 1. Initialize Cycle Shard Data
```javascript
const cycleShardData = {
  nodeShardDataMap: new Map(),        // Node ID -> NodeShardData
  parititionShardDataMap: new Map(),  // Partition -> PartitionShardData
  nodes: getNodesForCycleShard(),     // Active nodes for this cycle
  cycleNumber: cycleNumber,
  ourNode: NodeList.nodes.get(nodeId),
  shardGlobals: null,                 // To be calculated
  timestamp: cycle.start * 1000
}
```

#### 2. Calculate Shard Globals
Computes network-wide sharding parameters:

```javascript
shardGlobals = calculateShardGlobals(
  numActiveNodes,
  nodesPerConsensusGroup,
  nodesPerEdge
)
```

**Key calculations:**
- `numPartitions = numActiveNodes`
- `consensusRadius = floor((nodesPerConsensusGroup - 1) / 2)`
- `nodesPerEdge = consensusRadius` (default)
- `numVisiblePartitions = nodesPerConsensusGroup + nodesPerEdge * 2`
- `nodeLookRange = floor((storageRadius / numPartitions) * 0xffffffff)`

#### 3. Compute Partition Shard Data Map
Maps each partition to its coverage information:
- Which nodes store this partition
- Which nodes participate in consensus for this partition
- Address ranges for the partition

#### 4. Compute Node Partition Data
For each node, calculates:
- Home partition assignment
- Consensus partition range
- Storage partition range (consensus + edge)
- Address ranges covered
- Neighbor relationships

#### 5. Special Calculations for Our Node
Enhanced data for the local validator:
- Detailed coverage information
- Syncing neighbors detection
- Coverage change detection

#### 6. Store Results
- Current cycle shard data stored in `currentCycleShardData`
- Historical data maintained in `shardValuesByCycle` Map
- Used for coverage change calculations

## Partition Calculations

### Address to Partition Mapping
```javascript
partition = floor(numPartitions * (addressPrefix / 0xffffffff))
```
Where `addressPrefix` is the first 8 hex characters (32 bits) of the address.

### Partition to Address Range
```javascript
partitionSize = round((0xffffffff + 1) / numPartitions)
startAddr = partition * partitionSize
endAddr = (partition + 1) * partitionSize - 1

// Convert to full 256-bit addresses
low = startAddr.toString(16).padStart(8, '0') + '0'.repeat(56)
high = endAddr.toString(16).padStart(8, '0') + 'f'.repeat(56)
```

### Wrappable Partition Ranges
Handles ranges that wrap around the address space:

```javascript
if (partitionStart < 0) {
  // Split range: end of address space + beginning
  rangeIsSplit = true
  partitionStart2 = partitionStart + numPartitions
  partitionEnd2 = numPartitions - 1
  partitionStart1 = 0
  partitionEnd1 = partitionEnd
}
```

## Transaction Processing

### Transaction Group Calculation

1. **Identify involved accounts**: Extract all account addresses from transaction
2. **Calculate consensus ranges**: For each account, determine consensus nodes
3. **Calculate storage ranges**: For each account, determine storage nodes
4. **Union of ranges**: Transaction group = union of all consensus and storage ranges
5. **Select execution group**: Nodes in consensus range of primary account

### Consensus Flow

1. **Data Collection (Tell Phase)**
   - Non-execution nodes forward account data to execution group
   - Each execution node collects all required account states

2. **Transaction Execution**
   - Apply transaction in memory using collected states
   - Generate proposal with:
     - Before state hashes
     - After state hashes
     - Timestamp offset
     - Transaction metadata

3. **Voting**
   - Each execution node signs and broadcasts its proposal
   - Votes routed deterministically to designated collector nodes

4. **Receipt Generation**
   - Upon 2/3 supermajority agreement
   - Receipt contains consensus proof
   - Gossip receipt to network
   - Forward to archiver servers

## Network Dynamics

### Coverage Changes
When the network grows or shrinks, nodes must adjust their coverage:

1. **Detection**: Compare coverage between cycles
2. **Range Calculation**: Identify new ranges to cover or release
3. **Sync Triggers**: Create sync trackers for new ranges
4. **Data Migration**: Sync required data from neighbors

### Syncing Neighbors
Nodes entering the network sync data from active neighbors:
- Identified during Q1 calculations
- Added to `syncingNeighborsTxGroup` for transaction routing
- Ensures data availability during transition

### Edge Partition Benefits

1. **Growth Buffer**: Pre-stored data for potential expansion
2. **Shrink Protection**: Maintains data during network contraction
3. **Smooth Transitions**: Reduces sync requirements during changes
4. **Fault Tolerance**: Extra redundancy for border accounts

## Performance Optimizations

### Pre-calculation Strategy
All sharding calculations occur once per cycle to enable:
- Fast transaction routing decisions
- Immediate consensus group determination
- Efficient parallel processing
- Predictable performance characteristics

### Caching Mechanisms
- `nodeShardDataMap`: Pre-computed node coverage
- `parititionShardDataMap`: Pre-computed partition assignments
- Historical cycle data for change detection

### Profiling Points
Key sections monitored for performance:
- `updateShardValues_computePartitionShardDataMap1`: ~13ms
- `updateShardValues_computePartitionShardDataMap2`: ~37ms
- `updateShardValues_computeNodePartitionData`: ~22ms
- `updateShardValues_computeNodePartitionDataMap2`: ~232ms

## Configuration Parameters

### Core Settings
- `nodesPerConsensusGroup`: Size of consensus groups (must be odd, ≥3)
- `nodesPerEdge`: Edge partition radius (default: consensusRadius)
- `cycleDuration`: Time per cycle in seconds (60)
- `maxCyclesShardDataToKeep`: Historical data retention

### Validation Rules
1. Consensus group size must be odd for majority calculations
2. Minimum consensus group size is 3
3. Network must maintain minimum coverage overlap
4. Partition calculations must be deterministic

## Data Structures

### ShardGlobals
```typescript
{
  numActiveNodes: number
  nodesPerConsensusGroup: number
  numPartitions: number
  consensusRadius: number
  nodesPerEdge: number
  numVisiblePartitions: number
  nodeLookRange: number
}
```

### NodeShardData
```typescript
{
  node: NodeInfo
  homePartition: number
  consensusPartitions: WrappablePartitionRange
  storedPartitions: WrappablePartitionRange
  consensusNodes: NodeInfo[]
  edgeNodes: NodeInfo[]
}
```

### CycleShardData
```typescript
{
  cycleNumber: number
  timestamp: number
  shardGlobals: ShardGlobals
  nodeShardDataMap: Map<nodeId, NodeShardData>
  parititionShardDataMap: Map<partition, PartitionShardData>
  ourNode: NodeInfo
  ourNodeShardData: NodeShardData
  syncingNeighbors: NodeInfo[]
  hasCompleteData: boolean
}
```

## Error Handling

### Timing Violations
- Monitors calculation delays > 2-5 seconds
- Fatal error if delay > 5 seconds
- Ensures consistent cycle timing

### Coverage Validation
- Detects coverage gaps
- Validates partition assignments
- Ensures minimum redundancy maintained

### Range Wrapping
- Handles address space wraparound
- Validates split ranges
- Prevents partition overlaps

## Summary

The sharding calculation system provides a deterministic, scalable foundation for Shardeum's distributed architecture. By pre-calculating shard assignments once per cycle, the network achieves:

1. **Predictable Performance**: Known computation costs per cycle
2. **Deterministic Routing**: Any node can calculate transaction routing
3. **Dynamic Adaptation**: Automatic adjustment to network changes
4. **Fault Tolerance**: Edge partitions provide resilience
5. **Atomic Composability**: Clear ownership and consensus boundaries

The `updateShardValues()` function serves as the central orchestrator, ensuring all nodes maintain consistent views of the network's sharding topology, enabling efficient and reliable distributed transaction processing.