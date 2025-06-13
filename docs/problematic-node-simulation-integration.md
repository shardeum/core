# Problematic Node Simulation Integration Guide

## Overview

This guide explains how to integrate the problematic node simulation system with the actual lost/refute mechanism in Shardus to create nodes that will accumulate refutes and trigger problematic node detection.

## Key Integration Points

### 1. **Network Communication Layer** (`/src/network/index.ts`)

Add delays and packet drops at the network level:

```typescript
// In sendBinary() or similar network functions
import { getSimulationConfig, shouldDropMessage, shouldDelayResponse } from '../debug/problematic-node-simulator'

async function sendBinary(...) {
  const simulationConfig = getSimulationConfig()
  
  // Simulate packet drop
  if (shouldDropMessage()) {
    logSimulatedBehavior('Dropped outgoing message', { route, target })
    return // Silently drop the message
  }
  
  // Simulate network delay
  const delay = shouldDelayResponse()
  if (delay > 0) {
    await utils.sleep(delay)
    logSimulatedBehavior('Delayed message', { route, delay })
  }
  
  // Continue with normal send...
}
```

### 2. **Lost Node Detection** (`/src/p2p/Lost.ts`)

#### a. Make node appear down during checks (line ~1172):

```typescript
async function isDownCheck(node) {
  // Inject simulation - make ourselves appear down to checker nodes
  if (node.id === Self.id && shouldSimulateDown()) {
    logSimulatedBehavior('Simulating down state for checker')
    throw new Error('Simulated node down')
  }
  
  // Normal down check logic...
}
```

#### b. Ensure node still refutes when marked as lost (line ~533):

```typescript
// In parseRecord()
if (id === Self.id) {
  // Always refute if we're simulating problematic behavior
  if (isSimulatingProblematicBehavior()) {
    sendRefute = record.counter + 1
    warn(`[SIMULATION] Force refute - marked as lost in cycle ${record.counter}`)
  } else {
    // Normal refute logic
    sendRefute = record.counter + 1
  }
}
```

### 3. **Consensus Participation** (`/src/state-manager/TransactionConsensus.ts`)

Make node miss consensus votes:

```typescript
// In voting functions
import { shouldMissConsensus } from '../debug/problematic-node-simulator'

function sendVote(...) {
  if (shouldMissConsensus()) {
    logSimulatedBehavior('Skipping consensus vote', { txId })
    return // Don't send vote
  }
  
  // Normal voting logic...
}
```

### 4. **Cycle Participation** (`/src/p2p/CycleCreator.ts`)

Skip certain cycle duties:

```typescript
// In cycle creation or participation logic
if (shouldSkipCycleParticipation()) {
  logSimulatedBehavior('Skipping cycle participation', { cycle: currentCycle })
  return
}
```

## Integration Example

Here's a complete example of integrating the simulation into the lost node handler:

```typescript
// In /src/p2p/Lost.ts

import { 
  isSimulatingProblematicBehavior,
  shouldDropMessage,
  shouldDelayResponse,
  logSimulatedBehavior,
  getSimulationConfig
} from '../debug/problematic-node-simulator'

// Modify the isDownCheck function
async function isDownCheck(node) {
  const config = getSimulationConfig()
  
  // If we're checking ourselves and simulating, appear down randomly
  if (node.id === Self.id && isSimulatingProblematicBehavior()) {
    // But not always - we want to refute sometimes
    if (Math.random() < 0.7) { // 70% of the time appear down
      logSimulatedBehavior('Appearing down to checker', { 
        checker: Self.id, 
        cycle: currentCycle 
      })
      throw new Error('[SIMULATION] Node appearing down')
    }
  }
  
  // Add delays to responses
  const delay = shouldDelayResponse()
  if (delay > 0) {
    await utils.sleep(delay)
  }
  
  // Continue with normal check...
}

// Ensure we always refute when simulating
function parseRecord(record: P2P.CycleCreatorTypes.CycleRecord) {
  // ... existing code ...
  
  for (const id of record.lost) {
    stopReporting[id] = record.counter
    if (id === Self.id) {
      if (isSimulatingProblematicBehavior()) {
        // Always refute when simulating
        sendRefute = record.counter + 1
        warn(`[SIMULATION] Scheduling refute for cycle ${sendRefute}`)
        logSimulatedBehavior('Scheduled refute', {
          lostInCycle: record.counter,
          refuteInCycle: sendRefute
        })
      } else {
        sendRefute = record.counter + 1
      }
    }
  }
}
```

## Testing Workflow

1. **Enable simulation on specific nodes**:
```bash
# Make nodes 9001-9003 problematic
curl "http://localhost:9001/debug_simulateProblematicPreset?preset=flaky"
curl "http://localhost:9002/debug_simulateProblematicPreset?preset=slow"
curl "http://localhost:9003/debug_simulateProblematicPreset?preset=laggy"
```

2. **Monitor refute accumulation**:
```bash
# Watch refutes build up
./scripts/simulate-refute-nodes.sh monitor
```

3. **Check shadow mode comparison**:
```bash
# Verify both implementations detect the same nodes
./scripts/monitor-problematic-cache.sh
```

## Expected Behavior

With proper integration, simulated problematic nodes will:

1. **Appear unreliable** - Miss consensus, have network delays, drop packets
2. **Get marked as lost** - Other nodes detect their poor behavior
3. **Always refute** - Claim they're still operational
4. **Accumulate refutes** - Build up refute history in cycle records
5. **Trigger detection** - Eventually marked as problematic by both old and new implementations

## Configuration

Key simulation parameters:

```javascript
{
  // Network issues
  "missConsensusChance": 0.4,     // Miss 40% of consensus
  "dropMessageChance": 0.3,        // Drop 30% of messages
  "networkDelayMs": 2000,          // 2 second base delay
  
  // Response issues  
  "respondSlowChance": 0.5,        // 50% chance of slow response
  "responseDelayMs": 3000,         // 3 second slow response
  
  // Don't completely fail
  "skipCycleParticipation": false, // Still try to participate
  "enabled": true                  // Keep simulation active
}
```

## Safety Considerations

1. **Debug mode only** - All simulation endpoints require debug mode authentication
2. **Test networks only** - Never enable on production networks
3. **Reversible** - Can disable simulation at any time
4. **Logged** - All simulated behaviors are logged with `[SIMULATION]` prefix

## Minimal Integration

If you want to test without modifying core code, you can use just the existing debug features:

```bash
# Add network delays (causes missed consensus)
curl "http://localhost:9001/debug-network-delay?delay=3000"

# Make node produce bad votes (instant refutes)
curl "http://localhost:9001/debug-produceBadVote"

# Combine multiple issues
curl "http://localhost:9001/debug_simulateProblematic?enable=true&missConsensus=0.5&networkDelay=2000"
```

These existing features should be sufficient to cause nodes to be marked as lost and accumulate refutes.