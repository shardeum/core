# Shardus Gossip Protocol Usage Guide

## Quick Start

This guide helps developers and LLMs implement gossip protocol messages in the Shardus network. Follow these patterns to add or update gossip endpoints correctly.

## Implementation Checklist

When implementing a new gossip endpoint, ensure you:

- [ ] Register a gossip handler using `Comms.registerGossipHandler()`
- [ ] Implement payload validation in the handler
- [ ] Send gossip using `Comms.sendGossip()` with appropriate parameters
- [ ] Choose the correct node list for participants
- [ ] Add proper error handling and logging
- [ ] Implement re-gossip logic when needed
- [ ] Add performance counters for monitoring

## Step-by-Step Implementation

### Step 1: Define Your Gossip Type

Choose a descriptive, unique name for your gossip type:

```typescript
const GOSSIP_TYPE = 'my-feature-gossip'
```

**Important**: As of the current implementation, all gossip uses binary serialization via the `binary_gossip` route. The protocol automatically handles serialization/deserialization using `serializeGossipReq` and `deserializeGossipReq`.

### Step 2: Create the Gossip Handler

Register your handler during module initialization:

```typescript
import * as Comms from '../p2p/Comms'

export function init() {
  Comms.registerGossipHandler(GOSSIP_TYPE, handleMyFeatureGossip)
}

async function handleMyFeatureGossip(
  payload: MyPayloadType,
  sender: string,
  tracker: string,
  msgSize: number
) {
  // Step 1: Validate the payload
  if (!validatePayload(payload)) {
    nestedCountersInstance.countEvent('gossip', `${GOSSIP_TYPE}-invalid`)
    return
  }

  // Step 2: Check if we've already processed this
  if (alreadyProcessed(payload)) {
    return
  }

  // Step 3: Process the gossip
  processGossip(payload)

  // Step 4: Re-gossip if needed (with deduplication)
  if (shouldReGossip(payload)) {
    await Comms.sendGossip(
      GOSSIP_TYPE,
      payload,
      tracker,  // Preserve original tracker
      sender,   // Exclude original sender
      getNodeList(payload),
      false,    // Not origin
      -1,       // Use default gossip factor
      payload.txId || ''
    )
  }
}
```

### Step 3: Send Gossip

Initiate gossip from your business logic:

```typescript
import * as Comms from '../p2p/Comms'
import { fireAndForget } from '../utils'

function initiateGossip(data: MyDataType) {
  const payload = {
    timestamp: Date.now(),
    data: data,
    sign: crypto.sign(data)  // If protocol message
  }

  // Choose the appropriate node list
  const nodeList = selectNodeList(data)

  // Send gossip (use fireAndForget for non-blocking)
  fireAndForget(() =>
    Comms.sendGossip(
      GOSSIP_TYPE,
      payload,
      '',           // Auto-generate tracker
      null,         // No sender to exclude
      nodeList,     // Participant nodes
      true,         // We are origin
      -1,           // Use default gossip factor
      data.id || '' // Transaction/context ID for debugging
    )
  )
}
```

## Choosing the Right Node List

Select the appropriate participant list based on your gossip scope:

### 1. Network-Wide Gossip
```typescript
import * as NodeList from '../p2p/NodeList'
const nodeList = NodeList.byIdOrder  // All active nodes
```

### 2. Transaction Group Gossip
```typescript
// For transaction-specific gossip
const nodeList = queueEntry.transactionGroup
```

### 3. Execution Group Gossip
```typescript
// For execution-related messages
const nodeList = queueEntry.executionGroup
```

### 4. Consensus Group Gossip
```typescript
// For consensus-specific communication
const nodeList = this.stateManager.transactionQueue.getConsenusGroupForAccount(accountId)
```

### 5. Custom Node Selection
```typescript
// Filter nodes based on custom criteria
const nodeList = NodeList.byIdOrder.filter(node => 
  meetsCriteria(node)
)
```

## Validation Best Practices

### Essential Validation Steps

```typescript
function validatePayload(payload: any): boolean {
  // 1. Type validation using Shardus utilities
  const err = utils.validateTypes(payload, {
    timestamp: 'n',     // Number
    data: 'o',         // Object
    sign: 'o?'         // Optional object
  })
  if (err) {
    warn(`Invalid payload structure: ${err}`)
    return false
  }

  // 2. Signature verification (for protocol messages)
  if (payload.sign) {
    const signer = NodeList.byPubKey.get(payload.sign.owner)
    if (!signer) {
      warn('Unknown signer')
      return false
    }
    // Use crypto.verify for signature validation
    if (!crypto.verify(payload, signer.publicKey)) {
      warn('Invalid signature')
      return false
    }
  }

  // 3. Business logic validation
  // Implement your specific validation rules here
  if (!isValidBusinessLogic(payload.data)) {
    warn('Invalid business data')
    return false
  }

  return true
}
```

## Common Patterns

### Pattern 1: Simple One-Time Gossip

For messages that should be processed once and not re-gossiped:

```typescript
Comms.registerGossipHandler('simple-gossip', (payload, sender) => {
  if (processedSet.has(payload.id)) return
  
  processPayload(payload)
  processedSet.add(payload.id)
  // No re-gossip
})
```

### Pattern 2: Gossip with Re-broadcast

For messages that need network-wide propagation:

```typescript
Comms.registerGossipHandler('broadcast-gossip', async (payload, sender, tracker) => {
  if (processedSet.has(payload.id)) return
  
  processPayload(payload)
  processedSet.add(payload.id)
  
  // Re-gossip to ensure coverage
  await Comms.sendGossip(
    'broadcast-gossip',
    payload,
    tracker,
    sender,
    NodeList.byIdOrder,
    false
  )
})
```

### Pattern 3: Conditional Re-gossip

For messages that should be re-gossiped based on conditions:

```typescript
Comms.registerGossipHandler('conditional-gossip', async (payload, sender, tracker) => {
  const shouldProcess = evaluateConditions(payload)
  
  if (!shouldProcess) {
    // Store for later or ignore
    pendingGossip.set(payload.id, payload)
    return
  }
  
  processPayload(payload)
  
  // Re-gossip only if we're in the right quarter/cycle
  if (isCorrectTiming()) {
    await Comms.sendGossip(
      'conditional-gossip',
      payload,
      tracker,
      sender,
      getRelevantNodes(payload),
      false
    )
  }
})
```

### Pattern 4: Aggregated Gossip

For collecting multiple items before gossiping:

```typescript
const aggregationBuffer = new Map()

function aggregateAndGossip(item: any) {
  const key = getAggregationKey(item)
  
  if (!aggregationBuffer.has(key)) {
    aggregationBuffer.set(key, [])
  }
  
  aggregationBuffer.get(key).push(item)
  
  // Gossip when buffer reaches threshold
  if (aggregationBuffer.get(key).length >= THRESHOLD) {
    const payload = {
      items: aggregationBuffer.get(key),
      timestamp: Date.now()
    }
    
    fireAndForget(() =>
      Comms.sendGossip('aggregated-gossip', payload, '', null, NodeList.byIdOrder, true)
    )
    
    aggregationBuffer.delete(key)
  }
}
```

## Performance Considerations

### 1. Use FireAndForget for Non-Critical Gossip

```typescript
import { fireAndForget } from '../utils'

// Don't block on gossip send
fireAndForget(() => Comms.sendGossip(...))
```

### 2. Implement Deduplication

```typescript
const processedGossip = new Map<string, number>()
const GOSSIP_EXPIRY = 60000 // 1 minute

function isDuplicate(gossipId: string): boolean {
  const processed = processedGossip.get(gossipId)
  if (!processed) return false
  
  if (Date.now() - processed > GOSSIP_EXPIRY) {
    processedGossip.delete(gossipId)
    return false
  }
  
  return true
}
```

### 3. Batch Related Gossip

```typescript
const gossipQueue: GossipItem[] = []

function queueGossip(item: GossipItem) {
  gossipQueue.push(item)
  
  if (gossipQueue.length >= BATCH_SIZE) {
    flushGossipQueue()
  }
}

function flushGossipQueue() {
  if (gossipQueue.length === 0) return
  
  const batch = {
    items: gossipQueue.splice(0),
    timestamp: Date.now()
  }
  
  fireAndForget(() =>
    Comms.sendGossip('batched-gossip', batch, '', null, NodeList.byIdOrder, true)
  )
}
```

## Error Handling

### Implement Robust Error Handling

```typescript
async function handleGossipWithErrors(payload: any, sender: string) {
  try {
    // Validation
    if (!validatePayload(payload)) {
      nestedCountersInstance.countEvent('gossip-error', 'validation-failed')
      return
    }
    
    // Processing
    await processPayload(payload)
    
    // Re-gossip
    await Comms.sendGossip(...)
    
  } catch (error) {
    logger.error(`Gossip handler error: ${error.message}`)
    nestedCountersInstance.countEvent('gossip-error', 'handler-exception')
    
    // Don't re-throw - let gossip continue to other nodes
  }
}
```

## Monitoring and Debugging

### Add Counters

```typescript
import { nestedCountersInstance } from '../utils/nestedCounters'

function handleGossip(payload: any) {
  nestedCountersInstance.countEvent('gossip', `${GOSSIP_TYPE}-received`)
  
  if (isDuplicate(payload)) {
    nestedCountersInstance.countEvent('gossip', `${GOSSIP_TYPE}-duplicate`)
    return
  }
  
  if (processPayload(payload)) {
    nestedCountersInstance.countEvent('gossip', `${GOSSIP_TYPE}-processed`)
  } else {
    nestedCountersInstance.countEvent('gossip', `${GOSSIP_TYPE}-failed`)
  }
}
```

### Add Logging

```typescript
import { logFlags } from '../logger'

function handleGossip(payload: any, sender: string, tracker: string) {
  if (logFlags.verbose) {
    logger.debug(`Received ${GOSSIP_TYPE} from ${sender} with tracker ${tracker}`)
  }
  
  // Process...
  
  if (logFlags.playback) {
    logger.playbackLog(sender, 'self', 'GossipRecv', GOSSIP_TYPE, tracker, payload)
  }
}
```

## Testing Your Gossip Implementation

### Unit Test Template

```typescript
describe('MyFeature Gossip', () => {
  beforeEach(() => {
    // Register handler
    init()
  })
  
  afterEach(() => {
    // Cleanup
    Comms.unregisterGossipHandler(GOSSIP_TYPE)
  })
  
  test('should validate correct payload', () => {
    const payload = createValidPayload()
    expect(validatePayload(payload)).toBe(true)
  })
  
  test('should reject invalid payload', () => {
    const payload = { invalid: 'data' }
    expect(validatePayload(payload)).toBe(false)
  })
  
  test('should process gossip once', async () => {
    const payload = createValidPayload()
    
    await handleMyFeatureGossip(payload, 'sender1', 'tracker1', 100)
    await handleMyFeatureGossip(payload, 'sender2', 'tracker1', 100)
    
    expect(processCount).toBe(1)
  })
})
```

## Common Pitfalls to Avoid

1. **Don't forget to validate** - Always validate before processing or re-gossiping
2. **Don't create gossip loops** - Implement proper deduplication
3. **Don't block on gossip** - Use `fireAndForget` for non-critical paths
4. **Don't gossip to wrong nodes** - Choose appropriate participant lists
5. **Don't ignore errors** - Log and count failures for debugging
6. **Don't forget cleanup** - Unregister handlers when shutting down
7. **Don't send sensitive data** - Gossip is visible to all participants

## Migration Guide

### Updating Existing Gossip Endpoints

When updating an existing gossip endpoint:

1. **Maintain backward compatibility** - Support old payload formats during transition
2. **Version your payloads** - Add version field to detect format
3. **Gradual rollout** - Use feature flags to control new behavior
4. **Monitor carefully** - Track both old and new format processing

Example:

```typescript
function handleVersionedGossip(payload: any) {
  const version = payload.version || 1
  
  switch (version) {
    case 1:
      return handleV1Payload(payload)
    case 2:
      return handleV2Payload(payload)
    default:
      logger.warn(`Unknown payload version: ${version}`)
  }
}
```

## Additional Resources

- See `gossip.spec.md` for protocol specification
- See `gossip.endpoints.md` for list of existing endpoints
- Review `src/p2p/Comms.ts` for core implementation
- Check existing handlers for implementation examples