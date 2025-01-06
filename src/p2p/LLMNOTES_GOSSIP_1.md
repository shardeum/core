# Gossip System Notes

## Overview
The gossip system is a critical part of the p2p network, responsible for:
- Node list synchronization between peers
- State propagation
- Network topology maintenance

## Key Components

### 1. Core Gossip Implementation (Comms.ts)
- `sendGossip()` - Main function for sending gossip messages to other nodes
- `sendGossipAll()` - Function to broadcast to all nodes
- `handleGossip()` - Processes incoming gossip messages
- Uses a gossip factor to determine how many nodes to propagate to
- Supports both regular and "burst" gossip patterns

### 2. Gossip Algorithms (utils/functions/gossip.ts)
- `getLinearGossipList()` - Basic linear gossip propagation
- `getLinearGossipBurstList()` - Burst pattern for faster propagation
- `getRandomGossipIn()` - Random node selection for gossip
- Uses mathematical formulas to optimize gossip spread

### 3. NodeList Management (NodeList.ts)
- Maintains various node lists by different criteria:
  - `nodes`: Map of all nodes by ID
  - `byPubKey`: Map by public key
  - `byIpPort`: Map by IP:port
  - `byJoinOrder`: Array sorted by join timestamp
  - Various status-based lists (active, syncing, etc.)

### 4. Gossip Validation (GossipValidation.ts)
- Validates gossip payloads
- Handles node information updates
- Manages signature verification

## NodeList Exchange Process

### Initial Sync (SyncV2)
1. New node gets starter list from archiver
2. Uses `syncValidValidatorList()` to get full nodelist
3. Verifies nodelist hash with multiple nodes
4. Gets latest cycle record for final verification

### Ongoing Updates
1. Node status changes trigger gossip messages
2. Changes propagated via `sendGossip()`
3. Receiving nodes:
   - Process via `handleGossip()`
   - Update local lists via `updateNode()`
   - Maintain sorted lists by status

### Nodelist Gossip Handlers
1. Status Change Handlers:
   - `gossip-sync-started`: When node begins syncing
   - `gossip-sync-finished`: When node completes syncing
   - `gossip-join`: For new node join requests
   - `gossip-unjoin`: For node departure requests
   - `gossip-standby-refresh`: For standby node updates

2. Handler Flow:
   - Validate payload structure and signatures
   - Check cycle number matches current cycle
   - Verify node state transitions are valid
   - Update local nodelist via NodeList.updateNode()
   - Forward gossip to other nodes if valid

3. State Validation:
   - Each state change is verified against current cycle
   - Public key signatures are checked
   - Duplicate messages are filtered
   - State transitions must follow correct sequence

### Consistency Verification
1. Each cycle includes `nodeListHash`
2. Nodes verify their list matches network consensus
3. Mismatches trigger resyncs
4. Uses sliding window for history cleanup

### Node State Progression
1. SELECTED: Initial state after joining
2. SYNCING: Getting network state
3. READY: Prepared to become active
4. ACTIVE: Participating in consensus

## Gossip Protocol Details

### Message Flow
1. Node initiates gossip via `sendGossip()`
2. System calculates target nodes using gossip algorithms
3. Messages are propagated to selected nodes
4. Receiving nodes process via `handleGossip()`
5. Nodes may further propagate based on protocol rules

### Gossip Factor Calculation
- Base factor determined by network size
- Dynamic adjustment based on:
  - Network size (log2 based scaling)
  - Node position in network
  - Message origin
  - Current network state

### Optimization Features
- Prevents self-messaging
- Avoids duplicate messages
- Handles node state transitions
- Supports both synchronous and asynchronous operations

## References
- `Comms.ts`: Core gossip implementation
- `NodeList.ts`: Node state management
- `gossip.ts`: Gossip algorithms
- `GossipValidation.ts`: Message validation
- `Wrapper.ts`: P2P interface wrapper
- `SyncV2/index.ts`: Initial sync implementation
- `Join/routes.ts`: Node status change handlers 