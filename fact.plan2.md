# FACT Testing Plan - Phase 2 (Revised)

## Executive Summary

This document outlines a focused plan for testing the FACT protocol's final data distribution phase in Shardus Core. The testing will specifically target the flow from execution group nodes distributing final state to transaction group nodes after consensus, using minimal code changes and dependency injection without third-party libraries.

## Scope (V1 - Focused)

### In Scope
- **Primary Flow**: `factTellCorrespondingNodesFinalData` → `poqoDataAndReceiptBinaryHandler`
- Execution group nodes sending final state data
- Transaction group nodes receiving and validating data
- Binary serialization path only
- Single cycle simulation (no cycle transitions)

### Out of Scope (V1)
- `factTellCorrespondingNodes` (gather operation)
- JSON serialization paths
- Cycle transitions during testing
- Random test data generation
- Performance benchmarking
- Code refactoring of production code

## Core Components to Test

### 1. Sender Component
**Location**: `src/state-manager/TransactionQueue.ts`
**Function**: `factTellCorrespondingNodesFinalData(queueEntry: QueueEntry): void`

This function:
- Runs on execution group nodes after consensus
- Calculates which transaction group nodes to send to using FACT
- Filters account data per receiver based on their storage range
- Sends binary messages via `tellBinary`

### 2. Receiver Component
**Location**: `src/state-manager/TransactionConsensus.ts`
**Handler**: `poqoDataAndReceiptBinaryHandler: Route<InternalBinaryHandler<Buffer>>`

This handler:
- Receives final state and receipt from execution nodes
- Validates sender authorization using FACT
- Applies state changes if valid
- Rejects invalid messages

## Testing Architecture (Minimal Disruption)

### Core Testing Infrastructure

#### 1. Test Orchestrator
**Location**: `src/state-manager/test-support/factOfflineTester.ts`

```typescript
class FACTOfflineTester {
  // Message collection
  private sentMessages: Map<string, BinaryMessage[]> = new Map()
  
  // Results tracking
  private acceptedMessages: Map<string, number> = new Map()
  private rejectedMessages: Map<string, RejectionInfo[]> = new Map()
  
  // Core simulation method
  async simulateTransaction(scenario: TestScenario): Promise<TestResults> {
    // 1. Setup mock environment
    // 2. Execute factTellCorrespondingNodesFinalData for each execution node
    // 3. Collect sent messages
    // 4. Process messages through poqoDataAndReceiptBinaryHandler for each receiver
    // 5. Collect and return results
  }
}
```

#### 2. Minimal Mocks
**Location**: `src/state-manager/test-support/mocks.ts`

```typescript
// Minimal P2P mock - just captures tellBinary calls
class MockP2P {
  private messageCollector: (nodes: Node[], route: string, data: any) => void
  
  tellBinary(nodes: Node[], route: string, data: any) {
    this.messageCollector(nodes, route, data)
  }
}

// Minimal StateManager - provides shard data
class MockStateManager {
  currentCycleShardData: CycleShardData
  shardValuesByCycle: Map<number, CycleShardData>
  
  constructor(cycleData: CycleShardData) {
    this.currentCycleShardData = cycleData
    this.shardValuesByCycle = new Map([[cycleData.cycleNumber, cycleData]])
  }
}

// Shard calculator - uses existing ShardFunctions
class MockShardCalculator {
  static generateCycleShardData(
    nodes: NodeInfo[],
    cycleNumber: number,
    config: ShardConfig
  ): CycleShardData {
    // Use actual ShardFunctions.calculateShardGlobals
    // Use actual ShardFunctions.computePartitionShardDataMap
    // Return valid CycleShardData
  }
}
```

### Test Data Structure

```typescript
interface TestScenario {
  // From receipt data
  receipt: {
    receiptId: string
    cycle: number
    executionShardKey: string
    signedReceipt: SignedReceipt
    accountStates: AccountState[]
  }
  
  // Node configuration
  nodes: {
    allActive: NodeInfo[]
    transactionGroup: string[]  // Node IDs
    executionGroup: string[]     // Node IDs
  }
  
  // Shard configuration
  shardConfig: {
    nodesPerConsensusGroup: number  // e.g., 128
    nodesPerEdge: number            // e.g., 5
  }
  
  // Account ownership mapping
  accountOwnership: Map<string, string[]>  // accountId -> [nodeIds that store it]
}
```

## Implementation Approach (Minimal Changes)

### Phase 1: Message Collection Infrastructure

1. **Inject Mock P2P**
   - Add optional parameter to `factTellCorrespondingNodesFinalData` for P2P instance
   - Default to `this.p2p` if not provided
   - Capture all `tellBinary` calls with full parameters

2. **Generate Shard Data**
   - Use existing `ShardFunctions` without modification
   - Create valid `CycleShardData` from node lists
   - Cache calculations for reuse

### Phase 2: Message Processing

1. **Simulate Sending**
   - For each execution node:
     - Create minimal queue entry
     - Call `factTellCorrespondingNodesFinalData`
     - Collect sent messages

2. **Simulate Receiving**
   - For each message sent:
     - Extract receiver nodes
     - For each receiver:
       - Call `poqoDataAndReceiptBinaryHandler`
       - Track accept/reject result
       - Record rejection reasons

### Phase 3: Results Analysis

1. **Coverage Analysis**
   ```typescript
   interface TestResults {
     // How many nodes received data
     nodesReached: number
     totalInTransactionGroup: number
     
     // Account coverage
     accountsCovered: Map<string, string[]>  // accountId -> [nodeIds that received]
     accountsMissing: Map<string, string[]>   // accountId -> [nodeIds that should have received]
     
     // Validation results
     messagesAccepted: number
     messagesRejected: number
     rejectionReasons: Map<string, number>    // reason -> count
   }
   ```

2. **Key Metrics** (Not Assertions)
   - Percentage of transaction group nodes that received data
   - Percentage of required account coverage achieved
   - Rejection rate and reasons
   - Any nodes that should have received data but didn't

## Minimal Code Changes Required

### 1. TransactionQueue.ts
```typescript
// Add optional P2P parameter for testing
factTellCorrespondingNodesFinalData(
  queueEntry: QueueEntry, 
  p2pOverride?: { tellBinary: Function }  // Optional for testing
): void {
  const p2p = p2pOverride || this.p2p
  // ... rest of the function remains unchanged, just use 'p2p' variable
}
```

### 2. TransactionConsensus.ts
```typescript
// Export the handler function for testing
export function processPoqoDataAndReceipt(
  payload: Buffer,
  stateManager: StateManager,
  sender: Node
): { accepted: boolean; reason?: string } {
  // Extract existing handler logic
  // Return accept/reject status
}
```

## Test Execution Flow

```typescript
// Example test execution
async function runFACTSimulation() {
  // 1. Load test scenario
  const scenario = loadTestScenario('sample_data/receipt.1.json')
  
  // 2. Initialize tester
  const tester = new FACTOfflineTester()
  
  // 3. Run simulation
  const results = await tester.simulateTransaction(scenario)
  
  // 4. Output results (not assertions)
  console.log('Coverage Report:')
  console.log(`- Nodes reached: ${results.nodesReached}/${results.totalInTransactionGroup}`)
  console.log(`- Messages accepted: ${results.messagesAccepted}`)
  console.log(`- Messages rejected: ${results.messagesRejected}`)
  
  // 5. Detailed analysis
  if (results.accountsMissing.size > 0) {
    console.log('Missing account coverage detected:')
    for (const [accountId, nodes] of results.accountsMissing) {
      console.log(`  Account ${accountId} missing on nodes: ${nodes.join(', ')}`)
    }
  }
}
```

## Key Design Decisions (Based on Feedback)

1. **No Refactoring**: Production code remains unchanged except for minimal injection points
2. **Binary Only**: Focus exclusively on binary serialization path
3. **Single Cycle**: Use receipt's cycle as txGroupCycle, no cycle transitions
4. **Memory Only**: No persistence between test runs
5. **Metrics Over Assertions**: Focus on coverage and rejection metrics rather than unit test assertions
6. **Message Collection**: Capture all messages via tell(), process them sequentially through handlers

## Success Criteria

The test framework succeeds if it can:

1. **Execute the Core Flow**: Run `factTellCorrespondingNodesFinalData` and process results through `poqoDataAndReceiptBinaryHandler`

2. **Provide Visibility**: Show clearly:
   - How many validators received vs rejected state
   - Which validators in the transaction group were never sent to
   - Why messages were rejected

3. **Maintain Code Integrity**: Require minimal or no changes to production code

4. **Support Various Scenarios**: Handle different network sizes and transaction types from provided test data

## Next Steps

1. **Implement Mock Infrastructure**: Create minimal mocks in `test-support/mocks.ts`
2. **Build Test Orchestrator**: Implement `factOfflineTester.ts` with simulation logic
3. **Create Data Loaders**: Parse receipt JSON and generate test scenarios
4. **Run Initial Tests**: Use provided `sample_data/receipt.1.json`
5. **Generate Reports**: Create clear visibility into message flow and coverage

## Advantages of This Approach

1. **Minimal Disruption**: Production code remains virtually unchanged
2. **High Confidence**: Testing actual production code paths
3. **Clear Visibility**: Focus on metrics that matter for FACT protocol
4. **Extensible**: Can easily add more test scenarios without code changes
5. **Debugging Friendly**: Can inspect every message sent and received

This revised plan focuses specifically on the final data distribution phase of FACT, requires minimal code changes, and provides clear visibility into the protocol's behavior without traditional unit test assertions.