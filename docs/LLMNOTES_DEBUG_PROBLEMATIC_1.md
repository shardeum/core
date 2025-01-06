## Problematic Node Removal System Investigation

### Components
1. Debug Endpoint (`debug_problemNodeTrackerDump`)
   - Located in `src/debug/debug.ts`
   - Returns data for nodes with refute history
   - Includes refute cycles, percentages, and problematic status

2. ProblemNodeHandler Logic (`src/p2p/ProblemNodeHandler.ts`)
   - `isNodeProblematic`: Checks if a node is problematic based on:
     - Consecutive refutes threshold
     - Refute percentage threshold
   - `getConsecutiveRefutes`: Tracks consecutive refute sequences
   - `getRefutePercentage`: Calculates refute percentage in recent history

### Investigation Findings
1. Root Cause Found:
   - Feature is disabled by default in `src/config/server.ts`:
     ```typescript
     enableProblematicNodeRemoval: false,
     enableProblematicNodeRemovalOnCycle: 20000,
     ```
   - No refutes are being tracked because the feature is disabled

2. Implementation Details:
   - Refutes are tracked in `node.refuteCycles` Set
   - Initialization happens in `NodeList.updateNode`
   - Only tracks if `config.p2p.enableProblematicNodeRemoval` is true
   - Only tracks after `config.p2p.enableProblematicNodeRemovalOnCycle`
   - Clean up uses sliding window to remove old refutes

3. Refute Generation Process:
   - Refutes are added to cycle records in two main cases:
     a. When a node is marked as lost and then sends an 'up' message
     b. When a node self-refutes after seeing itself in the lost field
   - The process flow is:
     1. Node gets marked as lost in a cycle
     2. Node sends an 'up' message or self-refutes
     3. Node gets added to `cycle.refuted` array
     4. `NodeList.updateNode` adds the cycle to `node.refuteCycles`

### Solution
1. Enable the feature by setting:
   ```typescript
   config.p2p.enableProblematicNodeRemoval = true
   ```
2. Wait until cycle number reaches `enableProblematicNodeRemovalOnCycle` (20000)
3. Refutes will start being tracked after both conditions are met

### Next Steps for Debugging
1. Check if nodes are being marked as lost:
   ```typescript
   record.lost.length > 0
   ```
2. Verify if 'up' messages are being sent after nodes are marked as lost
3. Confirm that cycle records contain refuted nodes
4. Add logging to track the refute process:
   - When nodes are marked as lost
   - When 'up' messages are sent
   - When refutes are added to cycle records
   - When refutes are tracked in `node.refuteCycles`

### Current Status
- Debug endpoint implementation is correct
- Empty results could be due to:
  1. Feature being disabled
  2. No nodes being marked as lost
  3. No refutes being generated
  4. Refutes not being tracked properly 