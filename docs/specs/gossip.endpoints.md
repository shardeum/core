# Shardus Gossip Endpoints Reference

This document lists all gossip endpoints in the Shardus network, their purposes, and implementation details.

## Network Management

### `scaling`
- **Purpose**: Handles network scaling requests to add or remove nodes
- **Registered**: `src/p2p/CycleAutoScale.ts:78`
- **Sent From**: 
  - `src/p2p/CycleAutoScale.ts:58` - Route handler
  - `src/p2p/CycleAutoScale.ts:133` - Request scaling function
- **Payload Structure**:
  ```typescript
  {
    scale: number,        // Positive to add nodes, negative to remove
    timestamp: number
  }
  ```
- **Node List**: All active nodes
- **Re-gossip**: Yes, to ensure network-wide propagation

### `gossip-cert`
- **Purpose**: Gossips cycle certificates for consensus validation
- **Registered**: `src/p2p/CycleCreator.ts:262`
- **Sent From**: `src/p2p/CycleCreator.ts:1380`
- **Payload Structure**:
  ```typescript
  {
    marker: string,
    certificate: CycleCertificate,
    sign: Signature
  }
  ```
- **Node List**: All active nodes
- **Re-gossip**: Yes, with validation

## Node Join/Leave Protocol

### `gossip-join`
- **Purpose**: Manages node join request gossip throughout the join protocol
- **Registered**: `src/p2p/Join/index.ts:99`
- **Sent From**: Multiple locations in Join module for different join phases
- **Payload Structure**:
  ```typescript
  {
    nodeInfo: JoiningNode,
    phase: JoinPhase,
    timestamp: number,
    sign: Signature
  }
  ```
- **Node List**: All active nodes
- **Re-gossip**: Yes, based on join phase

### `gossip-valid-join-requests`
- **Purpose**: Gossips validated join requests across the network
- **Registered**: `src/p2p/Join/index.ts:99`
- **Sent From**: `src/p2p/Join/routes.ts:471`
- **Payload Structure**:
  ```typescript
  {
    validRequests: JoinRequest[],
    cycle: number
  }
  ```
- **Node List**: All active nodes
- **Re-gossip**: No

### `gossip-unjoin`
- **Purpose**: Handles node unjoin/leave requests
- **Registered**: `src/p2p/Join/index.ts:99`
- **Sent From**: 
  - `src/p2p/Join/routes.ts:586`
  - `src/p2p/Join/routes.ts:627`
- **Payload Structure**:
  ```typescript
  {
    nodeId: string,
    reason: string,
    timestamp: number
  }
  ```
- **Node List**: All active nodes
- **Re-gossip**: Yes

### `gossip-sync-started`
- **Purpose**: Announces when a node has started its sync process
- **Registered**: `src/p2p/Join/index.ts:99`
- **Sent From**: `src/p2p/Join/routes.ts:296`
- **Payload Structure**:
  ```typescript
  {
    nodeId: string,
    timestamp: number
  }
  ```
- **Node List**: All active nodes
- **Re-gossip**: No

### `gossip-sync-finished`
- **Purpose**: Announces when a node has finished its sync process
- **Registered**: `src/p2p/Join/index.ts:99`
- **Sent From**: `src/p2p/Join/routes.ts:675`
- **Payload Structure**:
  ```typescript
  {
    nodeId: string,
    timestamp: number,
    success: boolean
  }
  ```
- **Node List**: All active nodes
- **Re-gossip**: No

### `gossip-standby-refresh`
- **Purpose**: Handles standby node refresh to maintain readiness
- **Registered**: `src/p2p/Join/index.ts:99`
- **Sent From**: 
  - `src/p2p/Join/routes.ts:727`
  - `src/p2p/Join/routes.ts:776`
- **Payload Structure**:
  ```typescript
  {
    nodeId: string,
    refreshTime: number
  }
  ```
- **Node List**: All active nodes
- **Re-gossip**: Yes

## Node Health Monitoring

### `lost-down`
- **Purpose**: Reports nodes that have been detected as down/lost
- **Registered**: `src/p2p/Lost.ts:220`
- **Sent From**: 
  - `src/p2p/Lost.ts:621` - Initial detection
  - `src/p2p/Lost.ts:1345` - Re-gossip
- **Payload Structure**:
  ```typescript
  {
    nodeId: string,
    detector: string,
    timestamp: number,
    reason: string
  }
  ```
- **Node List**: All active nodes
- **Re-gossip**: Yes, with deduplication

### `lost-up`
- **Purpose**: Reports nodes that have recovered from being down
- **Registered**: `src/p2p/Lost.ts:220`
- **Sent From**: 
  - `src/p2p/Lost.ts:643` - Recovery detection
  - `src/p2p/Lost.ts:1395` - Re-gossip
- **Payload Structure**:
  ```typescript
  {
    nodeId: string,
    detector: string,
    timestamp: number
  }
  ```
- **Node List**: All active nodes
- **Re-gossip**: Yes

### `remove-by-app`
- **Purpose**: Handles application-initiated node removal requests
- **Registered**: `src/p2p/Lost.ts:220`
- **Sent From**: 
  - `src/p2p/Lost.ts:836` - App request
  - `src/p2p/Lost.ts:1415` - Re-gossip
- **Payload Structure**:
  ```typescript
  {
    nodeId: string,
    appReason: string,
    timestamp: number
  }
  ```
- **Node List**: All active nodes
- **Re-gossip**: Yes

### `gossip-active`
- **Purpose**: Node activity status and heartbeat
- **Registered**: `src/p2p/Active.ts:98`
- **Sent From**: `src/p2p/Active.ts:275`
- **Payload Structure**:
  ```typescript
  {
    nodeId: string,
    activeTime: number,
    stats: NodeStats
  }
  ```
- **Node List**: All active nodes
- **Re-gossip**: No

### `apoptosis`
- **Purpose**: Node removal proposals for network health
- **Registered**: `src/p2p/Apoptosis.ts:237`
- **Sent From**: Multiple locations for different apoptosis phases
- **Payload Structure**:
  ```typescript
  {
    proposal: ApoptosisProposal,
    votes: Vote[],
    phase: ApoptosisPhase
  }
  ```
- **Node List**: All active nodes
- **Re-gossip**: Yes, based on phase

## Archiver Management

### `joinarchiver`
- **Purpose**: Manages archiver node join requests
- **Registered**: `src/p2p/Archivers.ts:1077`
- **Sent From**: 
  - `src/p2p/Archivers.ts:478` - Initial request
  - `src/p2p/Archivers.ts:1088` - Re-gossip
- **Payload Structure**:
  ```typescript
  {
    archiver: ArchiverInfo,
    timestamp: number,
    sign: Signature
  }
  ```
- **Node List**: All active nodes
- **Re-gossip**: Yes

### `leavingarchiver`
- **Purpose**: Manages archiver node leave requests
- **Registered**: `src/p2p/Archivers.ts:1094`
- **Sent From**: 
  - `src/p2p/Archivers.ts:580` - Initial request
  - `src/p2p/Archivers.ts:1107` - Re-gossip
- **Payload Structure**:
  ```typescript
  {
    archiverId: string,
    reason: string,
    timestamp: number
  }
  ```
- **Node List**: All active nodes
- **Re-gossip**: Yes

### `lost-archiver-down`
- **Purpose**: Reports when an archiver is detected as lost/down
- **Registered**: `src/p2p/LostArchivers/routes.ts:374`
- **Sent From**: 
  - `src/p2p/LostArchivers/functions.ts:208`
  - `src/p2p/LostArchivers/routes.ts:157`
- **Payload Structure**:
  ```typescript
  {
    archiverId: string,
    detector: string,
    timestamp: number
  }
  ```
- **Node List**: All active nodes
- **Re-gossip**: Yes

### `lost-archiver-up`
- **Purpose**: Reports when a lost archiver has recovered
- **Registered**: `src/p2p/LostArchivers/routes.ts:374`
- **Sent From**: 
  - `src/p2p/LostArchivers/functions.ts:228`
  - `src/p2p/LostArchivers/routes.ts:96`
- **Payload Structure**:
  ```typescript
  {
    archiverId: string,
    detector: string,
    timestamp: number
  }
  ```
- **Node List**: All active nodes
- **Re-gossip**: Yes

## Transaction Processing

### `spread_tx_to_group`
- **Purpose**: Spreads transactions to their consensus groups
- **Registered**: `src/state-manager/TransactionQueue.ts:646`
- **Sent From**: `src/state-manager/TransactionQueue.ts:2347`
- **Payload Structure**:
  ```typescript
  {
    tx: WrappedTransaction,
    timestamp: number
  }
  ```
- **Node List**: Transaction consensus group
- **Re-gossip**: Conditional

### `poqo-receipt-gossip`
- **Purpose**: Proof of Quality (POQo) receipt gossip for consensus
- **Registered**: `src/state-manager/TransactionConsensus.ts:999`
- **Sent From**: Multiple locations during consensus phases
- **Payload Structure**:
  ```typescript
  {
    proposal: Proposal,
    signaturePack: Signature[],
    txGroupCycle: number
  }
  ```
- **Node List**: Transaction group
- **Re-gossip**: Yes, with validation
- **Special Notes**: Critical for transaction consensus

### `spread_appliedReceipt`
- **Purpose**: Spreads applied receipts across consensus groups (deprecated)
- **Registered**: Previously in TransactionQueue (now unregistered)
- **Status**: Being phased out
- **Payload Structure**:
  ```typescript
  {
    receipt: AppliedReceipt,
    txId: string
  }
  ```
- **Node List**: Execution group
- **Re-gossip**: No

### `broadcast_state_complete_data`
- **Purpose**: Broadcasts complete state data to execution group (deprecated)
- **Previously Registered**: `src/state-manager/TransactionQueue.ts`
- **Status**: Commented out, being replaced
- **Payload Structure**:
  ```typescript
  {
    txid: string,
    stateList: WrappedResponse[]
  }
  ```
- **Node List**: Execution group
- **Re-gossip**: No

## Global State Management

### `set-global`
- **Purpose**: Sets and propagates global account states
- **Registered**: `src/p2p/GlobalAccounts.ts:106`
- **Sent From**: 
  - `src/p2p/GlobalAccounts.ts:81` - Re-gossip
  - `src/p2p/GlobalAccounts.ts:202` - Initial set
- **Payload Structure**:
  ```typescript
  {
    accountId: string,
    value: any,
    when: number,
    sign: Signature
  }
  ```
- **Node List**: All active nodes
- **Re-gossip**: Yes

### `spread-applicaton-set-global`
- **Purpose**: Application-level global state transactions
- **Registered**: Dynamically by application
- **Sent From**: `src/shardus/index.ts:1359`
- **Payload Structure**: Application-defined
- **Node List**: All active nodes
- **Re-gossip**: Application-defined

## Service Queue Management

### `gossip-addtx`
- **Purpose**: Adds transactions to the service queue
- **Registered**: `src/p2p/ServiceQueue.ts:266`
- **Sent From**: 
  - `src/p2p/ServiceQueue.ts:98` - Add operation
  - `src/p2p/ServiceQueue.ts:477` - Re-gossip
- **Payload Structure**:
  ```typescript
  {
    tx: ServiceTransaction,
    timestamp: number
  }
  ```
- **Node List**: All active nodes
- **Re-gossip**: Yes

### `gossip-removetx`
- **Purpose**: Removes transactions from the service queue
- **Registered**: `src/p2p/ServiceQueue.ts:266`
- **Sent From**: 
  - `src/p2p/ServiceQueue.ts:172` - Remove operation
  - `src/p2p/ServiceQueue.ts:504` - Re-gossip
- **Payload Structure**:
  ```typescript
  {
    txId: string,
    reason: string,
    timestamp: number
  }
  ```
- **Node List**: All active nodes
- **Re-gossip**: Yes

### `debug-drop-ngt`
- **Purpose**: Debug endpoint for dropping network group transactions
- **Registered**: `src/p2p/ServiceQueue.ts:266`
- **Sent From**: `src/p2p/ServiceQueue.ts:532`
- **Payload Structure**:
  ```typescript
  {
    debugInfo: any
  }
  ```
- **Node List**: All active nodes
- **Re-gossip**: No

## State Snapshotting

### `snapshot_gossip`
- **Purpose**: Coordinates distributed state snapshotting
- **Registered**: `src/snapshot/partition-gossip.ts:247`
- **Sent From**: 
  - `src/snapshot/partition-gossip.ts:78`
  - `src/snapshot/index.ts:351`
- **Payload Structure**:
  ```typescript
  {
    cycle: number,
    partition: number,
    hash: string,
    data: SnapshotData
  }
  ```
- **Node List**: Partition nodes
- **Re-gossip**: Conditional

## Usage Notes

### Common Parameters for `Comms.sendGossip()`

```typescript
Comms.sendGossip(
  type: string,           // Gossip type identifier
  payload: any,           // Data to gossip
  tracker?: string,       // Tracking ID (auto-generated if empty)
  sender?: string,        // Sender to exclude from recipients
  nodes?: Node[],         // Participant list (defaults to all active)
  isOrigin?: boolean,     // Whether this node originated the message
  factor?: number,        // Override gossip factor (-1 for default)
  txId?: string,          // Transaction ID for debugging
  context?: string,       // Additional context for logging
  commonOrigin?: boolean  // Use common origin algorithm
)
```

### Best Practices

1. **Always validate** payloads before processing
2. **Use appropriate node lists** for gossip scope
3. **Implement deduplication** to prevent loops
4. **Add counters** for monitoring
5. **Handle errors gracefully** without blocking gossip
6. **Use `fireAndForget`** for non-critical gossip sends
7. **Document payload structures** clearly

### Deprecated Endpoints

The following endpoints are being phased out or replaced:
- `spread_appliedReceipt` - Being replaced by POQo consensus
- `broadcast_state_complete_data` - Commented out, being refactored

### Adding New Endpoints

When adding a new gossip endpoint:
1. Choose a unique, descriptive type name
2. Register handler in module's `init()` function
3. Implement validation and deduplication
4. Choose appropriate participant list
5. Document in this file
6. Add unit tests
7. Monitor with counters