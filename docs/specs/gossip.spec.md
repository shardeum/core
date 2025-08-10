# Shardus Gossip Protocol Specification

## Overview

The Shardus gossip protocol is a critical communication layer built on top of the internal P2P protocol that enables efficient, reliable message propagation across the network. It uses deterministic patterns for node selection to ensure complete coverage while minimizing redundancy.

## Core Architecture

### Design Principles

1. **Deterministic Routing**: Nodes follow deterministic patterns when selecting gossip recipients to ensure predictable message propagation
2. **Efficient Coverage**: The protocol guarantees network-wide coverage with controlled redundancy
3. **Consistent Node Lists**: All nodes use the same participant list for a given message to ensure uniform propagation
4. **Security-First**: Messages are validated before propagation to prevent DOS attacks and bad data spread

### Key Components

The gossip system consists of three main components:

1. **Gossip Handlers** - Functions that process incoming gossip messages
2. **Gossip Senders** - Functions that initiate and propagate gossip
3. **Gossip Router** - The core routing logic in `Comms.ts` that manages message distribution

## Protocol Mechanics

### Message Structure

Every gossip message follows this structure:

```typescript
interface GossipPayload {
  type: string       // The gossip type identifier
  data: any         // The actual payload being gossiped
}
```

### Node Selection Algorithms

The protocol uses two primary algorithms for selecting gossip recipients:

#### 1. Linear Gossip List (for standard messages)
Used when the message originator is not a node in the network (e.g., application transactions):

```typescript
utils.getLinearGossipList(
  nodeCount,      // Total number of nodes
  gossipFactor,   // Number of nodes each node should gossip to
  myIndex,        // Current node's index in sorted list
  isOrigin        // Whether this node originated the message
)
```

#### 2. Linear Gossip Burst List (for protocol messages)
Used when the message is signed by a node in the network (protocol transactions):

```typescript
utils.getLinearGossipBurstList(
  nodeCount,      // Total number of nodes
  gossipFactor,   // Number of nodes each node should gossip to
  myIndex,        // Current node's index in sorted list
  originIndex     // Original sender's index in sorted list
)
```

### Gossip Factor Calculation

The gossip factor determines how many nodes each participant should forward messages to:

- **Static Mode**: Uses configured `config.p2p.gossipFactor`
- **Dynamic Mode**: Calculates based on network size: `ceil(log₃(nodeCount))`

This ensures logarithmic scaling as the network grows.

### Message Flow

1. **Origination**: A node creates a gossip message with a unique tracker ID
2. **Recipient Selection**: Node sorts participant list and selects recipients using appropriate algorithm
3. **Validation**: Before forwarding, node validates message authenticity and payload correctness
4. **Propagation**: Message is sent to selected recipients via binary serialization
5. **Handler Processing**: Recipients process the message through registered handlers
6. **Re-gossip**: Recipients may forward the message to their selected nodes (if not already seen)

## Security Features

### Message Authentication

All internal communications, including gossip messages, include cryptographic signatures or authentication tags:

- **Signature Mode**: Messages are signed using the sender's private key (when `config.p2p.useSignaturesForAuth` is true)
- **Tag Mode**: Messages are authenticated using curve25519 keys (legacy mode)

### Validation Requirements

Before propagating gossip, nodes MUST:

1. Verify the sender's identity and signature
2. Validate the payload structure and content
3. Check protocol-specific validation rules (e.g., receipt signatures, data integrity)
4. Ensure the sender is in the expected participant list

### DOS Protection

The protocol includes multiple layers of DOS protection:

1. **Pre-send Filtering**: Nodes can be filtered based on their status (down, lost, not recent)
2. **Duplicate Detection**: Handlers track processed messages to avoid reprocessing
3. **Rate Limiting**: Counter-based tracking of gossip messages by type
4. **Payload Validation**: Malformed messages are rejected before propagation

## Node List Management

### Participant Lists

Different gossip types use different participant lists:

- **All Active Nodes**: For network-wide announcements
- **Transaction Group**: For transaction-specific gossip
- **Execution Group**: For execution-related messages
- **Consensus Group**: For consensus-specific communication

### Node Filtering

Nodes can be filtered from gossip based on:

- **Node Status**: Only active nodes participate (unless in special modes)
- **Down Detection**: Nodes detected as down are excluded
- **Lost Detection**: Nodes marked as lost are excluded
- **Recent Activity**: Nodes without recent activity may be excluded

### Mode-Specific Behavior

Certain network modes disable filtering:

- **Recovery Mode**: All filtering disabled
- **Restart Mode**: All filtering disabled
- **Restore Mode**: All filtering disabled
- **Forming Mode**: Normal filtering applies
- **Processing Mode**: Normal filtering applies

## Binary Serialization

The protocol uses binary serialization for efficiency:

1. Messages are serialized using `VectorBufferStream`
2. Wrapped in a request structure with headers
3. Sent via `tellBinary` for one-way messages
4. Sent via `askBinary` for request-response patterns

## Performance Optimizations

### Batching
- Multiple gossip messages can be batched when sent to the same recipients
- Reduces network overhead and connection setup costs

### Caching
- Node lists are pre-sorted and indexed
- Gossip factors are cached when static

### Early Termination
- Nodes skip gossip if no valid recipients remain after filtering
- Duplicate messages are rejected early in the pipeline

## Monitoring and Debugging

### Counters
The protocol maintains extensive counters for monitoring:
- Messages sent/received by type
- Filter effectiveness
- Validation failures
- Network coverage metrics

### Logging
Comprehensive logging includes:
- Sequence diagrams for transaction flow
- Gossip path tracking
- Validation failure reasons
- Performance profiling

## Protocol Evolution

The gossip protocol supports backward compatibility through:

1. **Type-based Routing**: New gossip types can be added without breaking existing ones
2. **Handler Registration**: Dynamic handler registration allows protocol upgrades
3. **Version Negotiation**: Nodes can adapt behavior based on network version

## Best Practices

1. **Always Validate**: Never trust incoming gossip without validation
2. **Use Appropriate Lists**: Choose the correct participant list for your gossip type
3. **Handle Failures Gracefully**: Implement timeout and retry logic
4. **Monitor Coverage**: Track gossip propagation to ensure network-wide delivery
5. **Optimize Factor**: Tune gossip factor based on network size and reliability requirements