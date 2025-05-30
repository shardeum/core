# Cycle History Sync Plan for RefuteCache

## Problem Statement

The current RefuteCache sync approach attempts to synchronize derived data (the cache) without ensuring nodes have the underlying source data (cycle records). This creates several issues:

1. Nodes cannot verify the cache data they receive
2. Nodes cannot build upon the cache without historical context  
3. Nodes make security-critical decisions based on unverifiable data
4. The approach violates Byzantine fault tolerance principles

## Solution: Cycle History Synchronization

Instead of syncing the RefuteCache directly, we ensure nodes have sufficient cycle history to build the cache themselves. This maintains verifiability and security while achieving the same goal.

## Implementation Plan

### Phase 1: Atomic Cycle History Sync with Fallback

#### 1.1 New Atomic Cycle Sync Endpoint

Create a new endpoint that returns both current and historical cycles in a single response:

```typescript
// New atomic endpoint: /sync-cycle-history
interface CycleHistorySyncRequest {
  requestedHistoryLength: number  // Usually problematicNodeHistoryLength
}

interface CycleHistorySyncResponse {
  currentCycle: CycleRecord       // Latest cycle for easy access
  historicalCycles: CycleRecord[] // Previous N cycles, ordered oldest first
  oldestAvailable: number
  newestAvailable: number
}
```

#### 1.2 SyncV2 Process Updates with Fallback

Modify `syncV2()` to:
1. First attempt to use the new atomic endpoint `/sync-cycle-history`
2. If endpoint is not available (404), fall back to existing behavior:
   - Sync latest cycle using current endpoint
   - Make separate requests for historical cycles
3. Validate cycle chain integrity (each cycle references previous)
4. Store all cycles in CycleChain before proceeding

#### 1.3 Fallback Implementation Strategy

```typescript
async function syncCyclesWithHistory() {
  try {
    // Try new atomic endpoint first
    const response = await robustQuery('/sync-cycle-history', {
      requestedHistoryLength: problematicNodeHistoryLength
    })
    // Process atomic response
    return processAtomicCycleResponse(response)
  } catch (error) {
    if (error.code === 404) {
      // Fallback to legacy sync
      const currentCycle = await syncCurrentCycle()  // Existing method
      const historicalCycles = await syncHistoricalCycles()  // New method
      return { currentCycle, historicalCycles }
    }
    throw error
  }
}
```

#### 1.4 Robust Query for Cycle History

- Query multiple nodes for cycle history
- Verify each cycle's signature and previous hash
- Require consensus on cycle chain (not just individual cycles)
- Handle case where network is younger than requested history
- Track which nodes support the new endpoint for efficiency

### Phase 2: Track Cycles During Joining Phase

#### 2.1 Create CycleHistoryTracker

New module to track cycle coverage during joining:

```typescript
class CycleHistoryTracker {
  private targetCycleCount: number  // problematicNodeHistoryLength
  private oldestCycle: number
  private newestCycle: number
  private missingCycles: Set<number>
  
  // Track what cycles we have
  addCycle(cycle: CycleRecord): void
  
  // Check if we have sufficient history
  hasCompleteHistory(currentCycle: number): boolean
  
  // Get list of missing cycles to request
  getMissingCycles(): number[]
}
```

#### 2.2 Active Cycle Collection

During joining phase:
1. Subscribe to cycle gossip immediately after sync
2. Track every cycle received
3. Identify gaps in the sequence
4. Request missing cycles from active nodes

#### 2.3 Cycle Gap Filling

- Implement endpoint to request specific historical cycles
- Prioritize filling gaps near the current cycle
- Retry failed requests with exponential backoff
- Log warnings if gaps persist

### Phase 3: Completeness Verification and RefuteCache Management

#### 3.1 Pre-Active Verification

Before a node can transition to active:
1. Verify cycle chain has no gaps
2. Ensure we have at least `minCyclesForProblematicDetection` cycles
3. Build RefuteCache from cycle data (always built regardless of removal settings)
4. Verify cache completeness matches cycle coverage

#### 3.2 RefuteCache Always Active

The RefuteCache is always created and maintained:
1. All nodes build and update RefuteCache from cycle data
2. Cache tracks refute votes regardless of `enableProblematicNodeRemoval`
3. This ensures data consistency and readiness if removal is enabled later
4. Allows network analysis and debugging even when removal is disabled

#### 3.3 Gradual Participation

If a node goes active with incomplete history:
1. Node can perform all functions EXCEPT problematic node removal (if enabled)
2. Continue requesting missing cycles in background
3. Enable removal participation once history is complete
4. Log clear warnings about limited participation

### Phase 4: RefuteCache Generation and Maintenance

#### 4.1 Build Cache from Cycles

Cache building process (always executed):
1. Iterate through all cycles in order
2. Extract refute data from each cycle
3. Build RefuteCache incrementally
4. Verify final cache state
5. Cache is built regardless of `enableProblematicNodeRemoval` setting

#### 4.2 Cycle Window Management

```typescript
interface CycleWindowManager {
  // Maintain 33 cycles total
  private cycles: CycleRecord[]
  private maxCycles = 33
  
  // Analysis uses oldest 30 cycles
  getAnalysisWindow(): CycleRecord[] {
    if (cycles.length <= 30) return cycles
    return cycles.slice(0, 30)  // Oldest 30
  }
  
  // Add new cycle and prune if needed
  addCycle(cycle: CycleRecord): void {
    cycles.push(cycle)
    if (cycles.length > maxCycles) {
      cycles.shift()  // Remove oldest
    }
  }
}
```

#### 4.3 Ongoing Maintenance

- Update cache as new cycles arrive (always active)
- Maintain exactly 33 cycles in memory
- Use oldest 30 cycles for problematic node analysis
- Periodically verify cache matches cycle data
- Rebuild cache if corruption detected

## Configuration Parameters

```typescript
// Existing configs
enableProblematicNodeRemoval: boolean     // Controls removal actions, not cache
problematicNodeHistoryLength: number      // Set to 33 cycles

// New configs
requireCompleteCycleHistory: boolean      // Enforce complete history
cycleHistorySyncTimeout: number           // Timeout for history sync
maxCycleHistorySyncRetries: number        // Retry attempts
minCyclesForProblematicDetection: number  // Minimum cycles before participation
cycleGapWarningThreshold: number          // Warn if this many gaps exist
cyclesStoredByValidators: number          // ~33 cycles maintained by validators
problematicNodeAnalysisWindow: number     // 30 cycles (oldest 30 of 33)

// Note: RefuteCache is always maintained regardless of enableProblematicNodeRemoval
// The config only controls whether nodes act on the cache data
```

### Cycle Window Configuration

- **Validators maintain**: ~33 cycles of history
- **RefuteCache tracks**: All 33 cycles
- **Problematic analysis uses**: Oldest 30 cycles (cycles 1-30 of the 33)
- **Buffer cycles**: Newest 3 cycles are ignored for analysis

This provides:
1. A buffer for recent cycles that may have incomplete refute data
2. Consistent 30-cycle window for threshold calculations
3. Extra cycles for verification and debugging

## Benefits Over Previous Approach

1. **Verifiability**: All data can be verified through cycle signatures
2. **Security**: No need to trust cache data from other nodes
3. **Robustness**: Can rebuild cache anytime from source data
4. **Simplicity**: Leverages existing cycle validation logic
5. **Consistency**: All nodes build cache from same verified data

## Migration Path

1. Deploy new atomic sync endpoint alongside existing endpoints
2. Update nodes to prefer atomic sync with fallback to legacy
3. Monitor successful cycle history synchronization
4. Verify RefuteCaches built from cycles match expected state
5. Remove direct RefuteCache sync in subsequent release
6. Eventually remove legacy endpoints once all nodes support atomic sync

## Edge Cases Handled

1. **Young Networks**: If network has fewer cycles than history length, sync all available
2. **Missing Cycles**: If some historical cycles are lost, work with available data
3. **Joining Delays**: Continue collecting cycles even if joining takes longer than expected
4. **Verification Failures**: Fall back to gradual cache building if history sync fails
5. **Mixed Version Networks**: Fallback ensures new nodes can sync from old nodes
6. **First Upgrader**: First node to upgrade uses legacy sync, builds history over time
7. **33-Cycle Window**: Properly maintain sliding window, pruning cycles beyond 33
8. **30-Cycle Analysis**: Always use oldest 30 cycles for analysis, handling <30 gracefully

## Testing Strategy

### 1. Unit Tests

#### 1.1 Core Component Tests
- **CycleHistoryTracker**:
  - Track cycles correctly with no gaps
  - Detect missing cycles in sequence
  - Handle out-of-order cycle reception
  - Maintain 33-cycle window correctly
  
- **CycleWindowManager**:
  - Properly maintain 33-cycle sliding window
  - Return correct 30-cycle analysis window
  - Handle networks with <30 cycles
  - Prune old cycles beyond 33

- **Sync Fallback Logic**:
  - Successful atomic endpoint usage
  - Proper fallback on 404 error
  - Handle partial responses
  - Retry logic with exponential backoff

#### 1.2 Mock Scenarios

```typescript
// Mock different node responses
class MockNodeResponses {
  // Node with new atomic endpoint
  modernNode(): MockNode {
    return {
      supportsAtomicSync: true,
      hasFullHistory: true,
      cycleCount: 33
    }
  }
  
  // Legacy node without atomic endpoint
  legacyNode(): MockNode {
    return {
      supportsAtomicSync: false,
      hasFullHistory: true,
      cycleCount: 33
    }
  }
  
  // Node with incomplete history
  partialHistoryNode(): MockNode {
    return {
      supportsAtomicSync: true,
      hasFullHistory: false,
      cycleCount: 15,
      missingCycles: [5, 7, 11]
    }
  }
  
  // Young network node
  youngNetworkNode(): MockNode {
    return {
      supportsAtomicSync: true,
      hasFullHistory: true,
      cycleCount: 10  // Less than required 30
    }
  }
}
```

### 2. Integration Tests

#### 2.1 Sync Scenarios
- **Full Atomic Sync**:
  - Node joins network where all nodes support atomic sync
  - Verify receives all 33 cycles in one request
  - Confirm RefuteCache built correctly

- **Legacy Fallback Sync**:
  - Node joins network with only legacy nodes
  - Verify fallback to sequential sync works
  - Confirm same end state as atomic sync

- **Mixed Network Sync**:
  - Some nodes support atomic, others don't
  - Verify node preferentially uses atomic nodes
  - Test fallback when atomic nodes unavailable

#### 2.2 Gap Handling Tests
- **Missing Cycles During Join**:
  - Simulate missing cycles 5, 10, 15
  - Verify gap detection and filling
  - Confirm node requests specific missing cycles

- **Cycles Arriving During Join**:
  - Start sync at cycle 100
  - Simulate cycles 101, 102, 103 arriving during join
  - Verify all cycles properly tracked

#### 2.3 Edge Case Tests
- **Network Younger Than Window**:
  - Network has only 20 cycles
  - Verify node syncs all 20 and proceeds
  - Confirm analysis window adjusts correctly

- **Rapid Cycle Progression**:
  - Simulate 5 cycles occurring during sync
  - Verify node catches up properly
  - Confirm no gaps in final state

### 3. Network Tests

#### 3.1 Performance Tests
- **Large History Sync**:
  - Measure time to sync 33 cycles atomically
  - Compare with legacy sequential approach
  - Test with various network latencies

- **Concurrent Sync Load**:
  - Multiple nodes syncing simultaneously
  - Verify network handles load gracefully
  - Confirm no sync failures under load

#### 3.2 Failure Recovery Tests
- **Partial Sync Failure**:
  - Simulate connection drop mid-sync
  - Verify node retries and completes
  - Confirm no corrupt state

- **Byzantine Node Responses**:
  - Mock nodes returning invalid cycles
  - Verify robust query detects and rejects
  - Confirm node finds valid sources

### 4. Mock Testing Framework

```typescript
class CycleHistorySyncTestFramework {
  private mockNetwork: MockNetwork
  private testNode: TestNode
  
  // Scenario builders
  setupYoungNetwork(cycleCount: number): void
  setupMixedVersionNetwork(modernRatio: number): void
  setupNetworkWithGaps(missingCycles: number[]): void
  
  // Action simulators
  simulateCycleProgression(count: number): void
  simulateNetworkPartition(duration: number): void
  simulateByzyantineNodes(count: number): void
  
  // Verification helpers
  verifyCycleCompleteness(): boolean
  verifyRefuteCacheState(): boolean
  verifyAnalysisWindow(): boolean
  
  // Metric collectors
  getSyncDuration(): number
  getRetryCount(): number
  getBandwidthUsed(): number
}
```

### 5. Continuous Testing

- **Regression Tests**: Run on every commit
- **Load Tests**: Run nightly with large networks
- **Chaos Tests**: Weekly tests with random failures
- **Migration Tests**: Test upgrade paths continuously

## Conclusion

This approach solves the fundamental issue by ensuring nodes have verifiable source data (cycles) before making security-critical decisions. It maintains the security properties of the network while achieving the goal of consistent problematic node detection across all validators.