# RefuteCache Synchronization Plan

## Problem Analysis

### The Core Issue
The RefuteCycleCache JIT calculation assumes all validators have access to the same cycle record history to build identical refute caches. However, in practice:

1. **New Joining Nodes**: Start with no cycle history
2. **Rejoining Nodes**: May have gaps in their cycle history
3. **Syncing Nodes**: Build cycle history gradually during sync
4. **Long-Running Nodes**: Have complete history within the window

This creates a consensus risk where nodes with different history views will identify different sets of problematic nodes, potentially leading to:
- Inconsistent removal decisions
- Network instability
- Possible consensus failures

### Current Architecture Assumptions
- All nodes process the same cycle records in the same order
- RefuteCache is built deterministically from cycle records
- Problematic node detection uses only RefuteCache data
- No explicit synchronization of RefuteCache state

## Proposed Solution: Hybrid Sync Approach

### Overview
Implement a two-phase approach that combines cache state synchronization with gradual participation:

1. **Phase 1**: Cache State Sync on Join/Sync
2. **Phase 2**: Gradual Participation in Removal Decisions

### Detailed Implementation Plan

#### 1. RefuteCache State Synchronization

**A. Add RefuteCache State to Sync Data**
```typescript
interface RefuteCacheState {
  cycleNumber: number
  cacheData: Array<{
    cycle: number
    refutedNodes: string[]
  }>
  checksum: string  // For validation
}
```

**B. Sync Protocol Extension**
- During node sync, request RefuteCacheState from sync source nodes
- Validate received state against multiple sources
- Initialize RefuteCache with synchronized state

**C. State Validation**
- Compare checksums from multiple nodes
- Require consensus from at least 3 nodes
- Fall back to gradual build if consensus not achieved

#### 2. Gradual Participation Protocol

**A. Node Readiness Tracking**
```typescript
interface NodeRefuteReadiness {
  nodeId: string
  firstCycleWithFullCache: number
  isReadyForRemovalDecisions: boolean
}
```

**B. Participation Rules**
- Nodes must have at least `minCyclesBeforeParticipation` (e.g., 10) cycles of cache data
- Only nodes with `isReadyForRemovalDecisions = true` participate in removal consensus
- Track readiness in node state (not in consensus-critical data)

#### 3. Implementation Steps

**Step 1: Extend RefuteCycleCache Module**
```typescript
// Add to RefuteCycleCache.ts
export function exportCacheState(currentCycle: number): RefuteCacheState
export function importCacheState(state: RefuteCacheState): boolean
export function calculateCacheChecksum(): string
export function getCacheCompleteness(currentCycle: number): number
```

**Step 2: Modify Sync Process**
```typescript
// In Sync.ts or new SyncExtensions.ts
interface SyncDataV3 extends SyncDataV2 {
  refuteCacheState?: RefuteCacheState
}

async function syncRefuteCache(syncNodes: Node[]): Promise<boolean>
```

**Step 3: Update ProblemNodeHandler**
```typescript
// Add readiness check
export function canParticipateInRemovalDecisions(
  nodeId: string, 
  currentCycle: number
): boolean

// Modify getProblematicNodes to only include votes from ready nodes
export function getProblematicNodesWithReadiness(
  prevRecord: CycleRecord,
  participatingNodes: string[]
): string[]
```

**Step 4: Cycle Record Extension**
```typescript
// Add to cycle record to track participation
interface CycleRecord {
  // ... existing fields
  removalParticipants?: string[]  // Nodes that participated in removal decisions
}
```

#### 4. Fallback Mechanisms

**A. Incomplete Sync Fallback**
- If cache sync fails, node builds cache gradually
- Node doesn't participate in removals until cache is complete
- Log warnings about non-participation

**B. Network Bootstrap**
- First N cycles after network start: no removals
- Allows all initial nodes to build sufficient history
- Configurable via `bootstrapCyclesBeforeRemoval`

#### 5. Configuration Updates

Add new configuration parameters:
```typescript
interface P2PConfig {
  // Existing...
  
  // New sync-related configs
  enableRefuteCacheSync: boolean = true
  minCyclesBeforeRemovalParticipation: number = 10
  refuteCacheSyncTimeoutMs: number = 30000
  bootstrapCyclesBeforeRemoval: number = 20
  requireRefuteCacheConsensus: number = 3  // Min nodes to agree on cache state
}
```

## Testing Strategy

1. **Unit Tests**
   - Cache export/import functionality
   - Checksum calculation
   - Readiness determination

2. **Integration Tests**
   - Sync protocol with cache state
   - Gradual participation scenarios
   - Fallback behavior

3. **Network Tests**
   - New node joining with cache sync
   - Network with mixed readiness states
   - Cache sync failures and recovery

## Rollout Plan

1. **Phase 1**: Implement cache state export/import (backward compatible)
2. **Phase 2**: Add sync protocol extension (optional field)
3. **Phase 3**: Implement participation tracking
4. **Phase 4**: Enable full synchronization

## Alternative Approaches Considered

1. **Include Refute History in Cycle Records**: Too much data overhead
2. **Centralized Refute Service**: Against decentralization principles
3. **Delayed Removal Start**: Doesn't solve rejoining node issue
4. **Consensus on Cache State**: Would reintroduce the original problem

## Conclusion

This hybrid approach balances the need for consistent problematic node identification with the realities of nodes having different history views. By combining state synchronization with gradual participation, we ensure that removal decisions are made only by nodes with sufficient context while maintaining network stability during transitions.