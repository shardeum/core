# ShardFunctions API Specification

## Overview

The `ShardFunctions` class in `src/state-manager/shardFunctions.ts` provides the core mathematical and computational functions for Shardeum's dynamic sharding system. These functions handle partition calculations, address range mappings, node coverage determination, and network topology management.

## Function Documentation

### Core Calculation Functions

#### `calculateShardGlobals(numNodes, nodesPerConsenusGroup, nodesPerEdge)`
**Purpose**: Calculates network-wide sharding parameters for a given cycle.

**Description**: Computes fundamental sharding values including partition counts, consensus radius, and address lookup ranges. Ensures consensus group size is odd for proper majority calculations.

**Direct Usage**: 
- ✅ `updateShardValues()` in state-manager/index.ts

**Returns**: ShardGlobals object containing:
- numActiveNodes, nodesPerConsenusGroup, numPartitions
- consensusRadius, nodesPerEdge, numVisiblePartitions, nodeLookRange

---

#### `calculateShardValues(shardGlobals, address)`
**Purpose**: Calculates shard information for a specific address.

**Description**: Determines the home partition and coverage information for a given 256-bit address. Computes which nodes store and participate in consensus for this address.

**Internal Calls**:
- `leadZeros8()` - formatting
- `addressNumberToPartition()` - partition calculation
- `partitionToAddressRange2()` - range conversion

**Indirect Usage**: Through internal call chain

---

### Partition Range Functions

#### `calculateStoredPartitions2(shardGlobals, homePartition)`
**Purpose**: Calculates the complete storage range (consensus + edge) for a node.

**Description**: Determines all partitions a node must store, including both consensus participation and edge buffer zones.

**Internal Calls**:
- `calculateParitionRange()` with storageRadius

**Indirect Usage**: Through `computeNodePartitionData()`

---

#### `calculateConsensusPartitions(shardGlobals, homePartition)`
**Purpose**: Calculates the consensus participation range for a node.

**Description**: Determines partitions where a node actively participates in consensus decisions.

**Internal Calls**:
- `calculateParitionRange()` with consensusRadius

**Indirect Usage**: Through `computeNodePartitionData()`

---

#### `calculateParitionRange(shardGlobals, homePartition, partitionRadius)`
**Purpose**: Generic partition range calculator with configurable radius.

**Description**: Core function for calculating wrappable partition ranges. Handles edge cases where ranges wrap around the address space boundaries.

**Internal Calls**:
- `partitionToAddressRange2()`
- `calculatePartitionRangeInternal()`

**Indirect Usage**: Through `calculateStoredPartitions2()` and `calculateConsensusPartitions()`

---

#### `calculatePartitionRangeInternal(shardGlobals, wrappablePartitionRange, partitionRadius)`
**Purpose**: Handles the complex logic of range wrapping and splitting.

**Description**: Manages cases where partition ranges cross the address space boundary (0xffffffff), splitting them into two non-contiguous ranges.

**Internal Calls**:
- `partitionToAddressRange2()` - multiple times for split ranges

**Indirect Usage**: Through `calculateParitionRange()`

---

### Range Testing Functions

#### `testAddressInRange(address, wrappableParitionRange)`
**Purpose**: Tests if a string address falls within a partition range.

**Description**: Handles both simple and split (wrapped) ranges, checking if an address belongs to a node's coverage area.

**Direct Usage**:
- ✅ TransactionQueue.ts - multiple locations for local account detection

---

#### `testAddressNumberInRange(addressNum, wrappableParitionRange)`
**Purpose**: Tests if a numeric address falls within a partition range.

**Description**: Numeric version of address range testing, optimized for performance.

**No external usage detected**

---

#### `testInRange(partition, wrappableParitionRange)`
**Purpose**: Tests if a partition number falls within a range.

**Description**: Determines partition membership in both simple and wrapped ranges.

**Direct Usage**:
- ✅ TransactionQueue.ts - partition coverage checks

**Indirect Usage**: Through various internal functions

---

### Data Structure Computation

#### `computePartitionShardDataMap(shardGlobals, parititionShardDataMap, minPartition, maxPartition)`
**Purpose**: Builds a map of partition-to-shard data relationships.

**Description**: Pre-computes which nodes are responsible for each partition, enabling fast lookup during transaction routing.

**Internal Calls**:
- `calculateShardValues()` for each partition

**Direct Usage**:
- ✅ `updateShardValues()` in state-manager/index.ts

---

#### `computeNodePartitionDataMap(shardGlobals, nodeShardDataMap, targetNodes, parititionShardDataMap, activeNodes, extendedData)`
**Purpose**: Builds comprehensive node coverage data for multiple nodes.

**Description**: Batch computation of node partition data, with optional extended data calculation for detailed coverage information.

**Internal Calls**:
- `computeNodePartitionData()` for each node
- `computeExtendedNodePartitionData()` if extended data requested

**Direct Usage**:
- ✅ `updateShardValues()` in state-manager/index.ts (called twice)

---

#### `computeNodePartitionData(shardGlobals, node, nodeShardDataMap, parititionShardDataMap, activeNodes, extendedData)`
**Purpose**: Computes complete shard data for a single node.

**Description**: Calculates stored partitions, consensus partitions, and neighbor relationships for a specific node.

**Internal Calls**:
- `calculateStoredPartitions2()`
- `calculateConsensusPartitions()`
- `computeExtendedNodePartitionData()` if extended

**Direct Usage**:
- ✅ `updateShardValues()` in state-manager/index.ts

**Indirect Usage**: Through `computeNodePartitionDataMap()`

---

#### `computeExtendedNodePartitionData(shardGlobals, nodeShardDataMap, parititionShardDataMap, activeNodes, nodeShardData, consensusNodes)`
**Purpose**: Computes detailed neighbor and coverage relationships.

**Description**: Calculates consensus nodes, edge nodes, and various neighbor relationships. This is computationally expensive and used selectively.

**Internal Calls**:
- `getCombinedNodeLists()`
- `getNodesThatCoverHomePartition()`
- `getNeigborNodesInRange()`
- `mergeNodeLists()`
- `subtractNodeLists()` - multiple times

**Direct Usage**:
- ✅ TransactionQueue.ts - three locations for dynamic computation

**Indirect Usage**: Through `computeNodePartitionData()`

---

### Node Relationship Functions

#### `findHomeNode(shardGlobals, address, partitionShardDataMap)`
**Purpose**: Finds the primary node responsible for an address.

**Description**: Determines which node has the given address in its home partition, making it the primary authority for that address.

**Internal Calls**:
- `addressToPartition()`

**Direct Usage**:
- ✅ state-manager/index.ts - multiple locations
- ✅ TransactionQueue.ts - multiple locations
- ✅ TransactionConsensus.ts

---

#### `getNodesByProximity(shardGlobals, address, activeNodes, shardDataMap)`
**Purpose**: Gets nodes ordered by distance from an address.

**Description**: Returns nodes sorted by their proximity to a given address, useful for finding nearest neighbors and fallback nodes.

**Direct Usage**:
- ✅ state-manager/index.ts

---

#### `getHomeNodeSummaryObject(nodeShardData)`
**Purpose**: Creates a summary object of a node's shard data.

**Description**: Generates a condensed view of node coverage information for logging and debugging.

**Direct Usage**:
- ✅ TransactionQueue.ts

---

#### `getNodeRelation(nodeShardData, nodeId)`
**Purpose**: Determines the relationship between nodes.

**Description**: Returns a string describing how a node relates to the reference node (e.g., "consensus", "edge", "none").

**Direct Usage**:
- ✅ TransactionQueue.ts - multiple locations for debugging

---

### List Operations

#### `mergeNodeLists(listA, listB)`
**Purpose**: Merges two node lists maintaining uniqueness.

**Description**: Combines node lists, removing duplicates and returning both merged list and extras.

**Internal Calls**: None

**Indirect Usage**: Through `computeExtendedNodePartitionData()`

---

#### `subtractNodeLists(listA, listB)`
**Purpose**: Removes nodes in listB from listA.

**Description**: Set difference operation for node lists, used for calculating edge nodes and differences.

**Internal Calls**: None

**Indirect Usage**: Through `computeExtendedNodePartitionData()` (called 10+ times)

---

### Address/Partition Conversion

#### `addressToPartition(shardGlobals, address)`
**Purpose**: Converts a 256-bit address to partition number.

**Description**: Maps addresses to partitions using the first 32 bits as a prefix for even distribution.

**Internal Calls**:
- `addressNumberToPartition()`

**Direct Usage**:
- ✅ TransactionQueue.ts - multiple locations

**Indirect Usage**: Through many internal functions

---

#### `addressNumberToPartition(shardGlobals, addressNum)`
**Purpose**: Converts a numeric address prefix to partition.

**Description**: Core mathematical conversion from address number to partition index.

**Internal Calls**: None

**Indirect Usage**: Through `calculateShardValues()` and `addressToPartition()`

---

#### `partitionToAddressRange2(shardGlobals, partition, partitionMax?)`
**Purpose**: Converts partition(s) to address range.

**Description**: Calculates the address boundaries for one or more consecutive partitions.

**Internal Calls**: None

**Indirect Usage**: Through many range calculation functions

---

### Coverage Analysis

#### `computeCoverageChanges(oldNodeShardData, newNodeShardData)`
**Purpose**: Detects changes in node coverage between cycles.

**Description**: Compares old and new coverage to identify expanded or contracted ranges, triggering data synchronization.

**Internal Calls**:
- `setOverlap()`, `setEpandedLeft()`, `setEpandedRight()` - multiple times

**Direct Usage**:
- ✅ `updateShardValues()` → `calculateChangeInCoverage()` in state-manager/index.ts

---

#### `getConsenusPartitionList(shardGlobals, nodeShardData)`
**Purpose**: Gets list of consensus partitions for a node.

**Description**: Returns array of partition numbers where the node participates in consensus.

**Direct Usage**:
- ✅ `updateShardValues()` in state-manager/index.ts

---

#### `getStoredPartitionList(shardGlobals, nodeShardData)`
**Purpose**: Gets list of all stored partitions for a node.

**Description**: Returns array of all partition numbers the node stores (consensus + edge).

**Direct Usage**:
- ✅ `updateShardValues()` in state-manager/index.ts

---

### Utility Functions

#### `leadZeros8(input)`
**Purpose**: Pads string with leading zeros to 8 characters.

**Description**: Formatting utility for consistent hex string representation.

**Direct Usage**:
- ✅ state-manager/index.ts - for logging

**Indirect Usage**: Through various formatting operations

---

#### `partitionInWrappingRange(i, minP, maxP)`
**Purpose**: Tests if partition is in a potentially wrapped range.

**Description**: Handles circular partition space where ranges can wrap from max to 0.

**Direct Usage**:
- ✅ TransactionQueue.ts

---

#### `debugFastStableCorrespondingIndicies(fromListSize, toListSize, fromListIndex, tag)`
**Purpose**: Debug version of index correspondence calculation.

**Description**: Calculates deterministic index mappings between lists of different sizes with debug output.

**Internal Calls**:
- `fastStableCorrespondingIndicies()`

**Direct Usage**:
- ✅ TransactionQueue.ts - multiple locations for gossip routing

---

#### `fastStableCorrespondingIndicies(fromListSize, toListSize, fromListIndex)`
**Purpose**: Calculates deterministic index mapping between lists.

**Description**: Maps indices from one list to corresponding indices in another list of different size, maintaining stable, deterministic correspondence.

**Internal Calls**: Recursive self-calls for symmetry checking

**Indirect Usage**: Through `debugFastStableCorrespondingIndicies()`

---

### Node Selection Functions

#### `getNodesThatCoverPartitionRaw(shardGlobals, nodeShardDataMap, partition, exclude, activeNodes)`
**Purpose**: Gets all nodes covering a specific partition.

**Description**: Returns nodes that have the partition in their storage range, with exclusion support.

**Internal Calls**:
- `testInRange()`

**Indirect Usage**: Through coverage calculations

---

#### `getCombinedNodeLists(shardGlobals, parititionShardDataMap, storedRanges, consensusRanges)`
**Purpose**: Combines nodes from stored and consensus ranges.

**Description**: Merges different node lists based on partition coverage for comprehensive node selection.

**Indirect Usage**: Through `computeExtendedNodePartitionData()`

---

#### `getNodesThatCoverHomePartition(shardGlobals, homePartition, parititionShardDataMap, storedRanges, consensusRanges)`
**Purpose**: Gets nodes covering a home partition with range filters.

**Description**: Specialized function for finding nodes that cover a specific home partition within given ranges.

**Indirect Usage**: Through `computeExtendedNodePartitionData()`

---

#### `getEdgeNodes(shardGlobals, nodeShardDataMap, consensusNodeList, parititionShardDataMap, activeNodes, ...)`
**Purpose**: Calculates edge nodes for a given consensus group.

**Description**: Determines which nodes provide edge coverage beyond the consensus group.

**Internal Calls**: Complex logic with partition testing

**Not directly used externally**

---

#### `getNeigborNodesInRange(shardGlobals, targetNode, fullConsensusNodeList, partitionsCovered, activeNodes, ...)`
**Purpose**: Gets neighbor nodes within a specific range.

**Description**: Finds nodes that are neighbors within a partition distance, used for consensus group determination.

**Indirect Usage**: Through `computeExtendedNodePartitionData()`

---

### Mathematical Utilities

#### `circularDistance(a, b, max)`
**Purpose**: Calculates distance in circular number space.

**Description**: Computes shortest distance between two points in a wrapping number line.

**Internal Calls**: None

**Indirect Usage**: Through internal distance calculations

---

#### `nodeSortAsc(a, b)`
**Purpose**: Sorts nodes by ID in ascending order.

**Description**: Comparator function for consistent node ordering.

**Not directly used externally**

---

### Range Testing Helpers

#### `setOverlap(aStart, aEnd, bStart, bEnd)`
**Purpose**: Tests if two ranges overlap.

**Indirect Usage**: Through `computeCoverageChanges()`

---

#### `setEpanded(aStart, aEnd, bStart, bEnd)`
**Purpose**: Tests if range b expands range a.

**Not directly used**

---

#### `setEpandedLeft(aStart, aEnd, bStart, bEnd)`
**Purpose**: Tests if range b expands range a to the left.

**Indirect Usage**: Through `computeCoverageChanges()`

---

#### `setEpandedRight(aStart, aEnd, bStart, bEnd)`
**Purpose**: Tests if range b expands range a to the right.

**Indirect Usage**: Through `computeCoverageChanges()`

---

#### `setShrink(aStart, aEnd, bStart, bEnd)`
**Purpose**: Tests if range b is smaller than range a.

**Not directly used**

---

### Address Utilities

#### `getPartitionRangeFromRadix(shardGlobals, radix)`
**Purpose**: Gets partition range from address radix.

**Description**: Converts partial address prefix to partition range boundaries.

**Internal Calls**:
- `addressToPartition()` - twice

**Not directly used externally**

---

#### `findCenterAddressPair(lowAddress, highAddress)`
**Purpose**: Finds center addresses between two boundaries.

**Description**: Calculates midpoint addresses in the address space.

**Internal Calls**:
- `leadZeros8()` - for formatting

**Indirect Usage**: Through `getCenterHomeNode()`

---

#### `getNextAdjacentAddresses(address)`
**Purpose**: Gets adjacent addresses to a given address.

**Description**: Returns the next sequential addresses in the address space.

**Internal Calls**:
- `leadZeros8()` - for formatting

**Not directly used externally**

---

#### `getCenterHomeNode(shardGlobals, lowAddress, highAddress, partitionShardDataMap)`
**Purpose**: Finds the home node for the center of an address range.

**Description**: Locates the node responsible for the midpoint of an address range.

**Internal Calls**:
- `findCenterAddressPair()`
- `findHomeNode()`

**Not directly used externally**

---

#### `getPartitionsCovered(wrappableParitionRange)`
**Purpose**: Returns count of partitions in a range.

**Description**: Calculates the total number of partitions covered by a potentially wrapped range.

**Not directly used externally**

---

## Usage Summary

### Functions Used in updateShardValues()

**Direct calls**:
1. `calculateShardGlobals()` - Initialize shard parameters
2. `computePartitionShardDataMap()` - Build partition map
3. `computeNodePartitionDataMap()` - Build node maps (called twice)
4. `computeNodePartitionData()` - Compute our node's data
5. `getConsenusPartitionList()` - Get consensus partitions
6. `getStoredPartitionList()` - Get stored partitions
7. `computeCoverageChanges()` - Detect coverage changes
8. `leadZeros8()` - Format logging output

### Functions Used in TransactionQueue.ts

**Direct calls**:
1. `findHomeNode()` - Find primary node for addresses
2. `testAddressInRange()` - Check local account ownership
3. `testInRange()` - Check partition coverage
4. `getHomeNodeSummaryObject()` - Debug logging
5. `getNodeRelation()` - Debug relationship info
6. `addressToPartition()` - Address to partition conversion
7. `computeExtendedNodePartitionData()` - Dynamic neighbor calculation
8. `debugFastStableCorrespondingIndicies()` - Gossip routing
9. `partitionInWrappingRange()` - Range testing

### Functions Used in TransactionConsensus.ts

**Direct calls**:
1. `findHomeNode()` - Find consensus coordinator

## Internal Call Graph

### High-Level Dependencies

```
calculateShardGlobals() [standalone - called by updateShardValues]
    └── No internal dependencies

computePartitionShardDataMap() [called by updateShardValues]
    └── calculateShardValues()
        ├── leadZeros8()
        ├── addressNumberToPartition()
        └── partitionToAddressRange2()

computeNodePartitionDataMap() [called by updateShardValues]
    └── computeNodePartitionData()
        ├── calculateStoredPartitions2()
        │   └── calculateParitionRange()
        │       ├── partitionToAddressRange2()
        │       └── calculatePartitionRangeInternal()
        │           └── partitionToAddressRange2()
        ├── calculateConsensusPartitions()
        │   └── calculateParitionRange() [same as above]
        └── computeExtendedNodePartitionData()
            ├── getCombinedNodeLists()
            ├── getNodesThatCoverHomePartition()
            ├── getNeigborNodesInRange()
            ├── mergeNodeLists()
            └── subtractNodeLists() [multiple calls]

computeCoverageChanges() [called by updateShardValues]
    ├── setOverlap()
    ├── setEpandedLeft()
    └── setEpandedRight()

findHomeNode() [called by multiple external modules]
    └── addressToPartition()
        └── addressNumberToPartition()
```

### Most Called Internal Functions

1. **partitionToAddressRange2()** - Core conversion function
2. **subtractNodeLists()** - Called 10+ times in extended data computation
3. **testInRange()** - Range testing throughout
4. **addressNumberToPartition()** - Address mapping foundation
5. **leadZeros8()** - Formatting utility

## Performance Considerations

### Expensive Operations
- `computeExtendedNodePartitionData()` - Complex neighbor calculations
- `computeNodePartitionDataMap()` with extended data - O(n²) complexity
- `computeCoverageChanges()` - Multiple range comparisons

### Optimized Patterns
- Pre-computation in `updateShardValues()` for cycle-wide reuse
- Caching through nodeShardDataMap and parititionShardDataMap
- Numeric address operations where possible

## Conclusion

The ShardFunctions module provides a comprehensive set of mathematical and algorithmic functions for managing Shardeum's dynamic sharding system. The functions are organized in layers:

1. **Core calculations** (globals, ranges, partitions)
2. **Data structure builders** (maps and node data)
3. **Query functions** (testing, finding, relationships)
4. **Utilities** (formatting, list operations, math)

Most functions are used indirectly through the main `updateShardValues()` orchestration, with TransactionQueue.ts being the primary direct consumer for runtime transaction routing decisions.