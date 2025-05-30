# Problematic Node Removal Analysis - PR #521

## Problem Statement

The network needs a mechanism to identify and remove nodes that are consistently problematic - specifically nodes that repeatedly claim to be "up" when the network thinks they are "down" (refuting their lost status). These nodes can cause network instability and should be removed.

### Previous Approach Issues

1. **Consensus Hash Contamination**: Refute data was stored directly on node objects in the NodeList, which meant it was included in the node list hash. This created synchronization issues because different nodes could have different views of refute history.

2. **Circular Dependency**: The system had a circular dependency where consensus needed to agree on data (refute history) that affected consensus itself.

3. **Network Split Risk**: Different nodes processing refute information at slightly different times could lead to different node list hashes, potentially causing network splits.

4. **Timing Sensitivity**: The system was fragile to timing differences in when nodes processed refute information.

## Solution Implemented in PR #521

### Core Architecture Change

The solution introduces a **RefuteCycleCache** - a separate, centralized cache that tracks which nodes were refuted in each cycle. This cache is:
- Derived from consensed cycle records
- NOT included in the node list hash
- Completely decoupled from consensus calculations

### Key Components

#### 1. RefuteCycleCache (`src/p2p/RefuteCycleCache.ts`)
- **Data Structure**: `Map<cycleNumber, Set<nodeId>>`
- **Purpose**: Track which nodes refuted their "lost" status in each cycle
- **Key Functions**:
  - `updateRefuteCache(cycle)`: Updates cache when processing cycle records
  - `getRefuteCyclesForNode(nodeId, currentCycle)`: Returns cycles where a node was refuted
  - Automatic pruning of old data outside the history window

#### 2. ProblemNodeHandler (`src/p2p/ProblemNodeHandler.ts`)
- **Purpose**: Determine if a node is problematic based on refute history
- **Detection Methods**:
  1. **Consecutive Refutes**: Node refuted in N consecutive cycles (default: 6)
  2. **Refute Percentage**: Node refuted in X% of cycles within history window (default: 10% over 100 cycles)
- **Function**: `getProblematicNodes()` returns sorted list of problematic nodes

#### 3. Integration Points
- **Cycle Processing**: `Lost.parseRecord()` calls `updateRefuteCache()` when processing cycle records
- **Node Removal**: `ModeSystemFuncs.getExpiredRemovedV3()` uses problematic node list to determine removals

### Configuration Parameters

#### Detection Settings:
- `enableProblematicNodeRemoval`: Master switch (boolean)
- `problematicNodeConsecutiveRefuteThreshold`: Consecutive cycles threshold (default: 6)
- `problematicNodeRefutePercentageThreshold`: Percentage threshold (default: 0.1)
- `problematicNodeHistoryLength`: History window in cycles (default: 100)

#### Removal Control:
- `problematicNodeRemovalCycleFrequency`: How often to check (default: every 5 cycles)
- `maxProblematicNodeRemovalsPerCycle`: Max removals per check (default: 1)
- `enableProblematicNodeRemovalOnCycle`: When to start checking (default: cycle 1)

### Data Flow

1. **Node Reports as Lost**: Network gossip identifies a node as potentially down
2. **Node Refutes**: Node sends message claiming it's still active
3. **Cycle Record Created**: Refuted node IDs added to `record.refuted`
4. **Cache Updated**: `parseRecord()` → `updateRefuteCache(record)`
5. **Detection**: Every N cycles, system checks all active nodes for problematic behavior
6. **Removal**: Up to `maxProblematicNodeRemovalsPerCycle` nodes selected for removal

### Benefits of New Approach

1. **Decoupled from Consensus**: Refute tracking doesn't affect node list hash
2. **Deterministic**: All nodes derive same refute history from same cycle records
3. **Flexible Detection**: Two complementary methods catch different problematic patterns
4. **Controlled Removal**: Prevents network instability from mass removals
5. **Better Architecture**: Clear separation of concerns between tracking and consensus
6. **Improved Testability**: Cache can be easily mocked and tested

### Summary

The solution elegantly solves the original problem by moving refute tracking out of the consensus-critical data structures into a separate cache that all nodes can build identically from consensed cycle records. This ensures that while all nodes can independently identify problematic nodes, they do so in a deterministic way that doesn't affect the consensus process itself.