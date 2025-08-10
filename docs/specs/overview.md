# Shardus Core Protocol Overview

## Introduction

Shardus Core (`@shardeum-foundation/core`) implements a sophisticated distributed ledger protocol that uses dynamic sharding to achieve horizontal scalability while maintaining atomic composability across shards. Unlike traditional blockchain architectures that process transactions in blocks, Shardus processes each transaction independently and atomically using a novel consensus mechanism called POQo (Proof of Quorum).

## Core Architecture

### 32-Byte Address Space

The protocol operates over a 32-byte (256-bit) wrapping address space that ranges from `0x00000000...` to `0xffffffff...`. This circular topology ensures continuous coverage without gaps or edges. All accounts, contracts, and data are mapped to addresses within this space, enabling deterministic routing and sharding calculations.

### Dynamic Sharding Model

The network implements dynamic sharding where each active validator is responsible for:
- **Consensus participation**: For accounts within its consensus range
- **Data storage**: For accounts within its storage range (consensus + edge)
- **Transaction processing**: For transactions touching accounts in its coverage

Key sharding parameters (configurable in `config.sharding`):
- `nodesPerConsensusGroup`: 128 validators per consensus group
- `nodesPerEdge`: 5 validators for edge coverage
- `executeInOneShard`: true (atomic execution within one shard)

### Validator Network

Only active validators participate in consensus and store authoritative account data. The network maintains several validator states:

1. **Standby**: Validators waiting to join the network
2. **Syncing**: Selected validators downloading network state
3. **Ready**: Synchronized validators awaiting activation
4. **Active**: Full participants in consensus and storage
5. **Leaving**: Validators being rotated out or removed

See [validator-lifecycle.md](validator-lifecycle.md) for detailed state transitions.

## Cycle-Based Operation

The network operates in 60-second cycles, with each cycle producing a record that chains to the previous cycle's hash. This forms the CycleChain - the authoritative record of network state changes.

### Cycle Structure

Each cycle is divided into four quarters (Q1-Q4):
- **Q1**: Sharding calculations and network updates
- **Q2**: Node selection from standby pool
- **Q3**: Transaction processing continues
- **Q4**: Cycle record creation and consensus

### Cycle Records

Cycle records contain:
- Network membership changes (joins, leaves, lost nodes)
- Mode transitions (forming, processing, safety)
- Validator state updates
- Previous cycle hash for chain integrity

## Sharding Calculations

### Partition System

The network uses virtual partitions as a computational tool for sharding:
- One partition per active validator
- Partitions map to address ranges
- Dynamic sizing based on network size

### Coverage Types

Each validator maintains multiple coverage ranges:

1. **Home Partition**: Primary partition assignment
2. **Consensus Range**: `consensusRadius` partitions left and right
   - Formula: `consensusRadius = floor((nodesPerConsensusGroup - 1) / 2)`
   - With 128 nodes: radius = 63 partitions
3. **Edge Range**: Additional `nodesPerEdge` partitions for storage
4. **Storage Range**: Complete coverage (consensus + edge)

### UpdateShardValues Function

The critical `updateShardValues()` function (`src/state-manager/index.ts`) runs at cycle start to:
1. Calculate network-wide shard globals
2. Map partitions to validator coverage
3. Determine node relationships
4. Detect coverage changes
5. Trigger data synchronization

See [shardCalculations.spec.md](shardCalculations.spec.md) for implementation details.

## Transaction Processing

### Transaction Flow

1. **Submission**: Transaction enters the network via any validator
2. **Routing**: Deterministic routing to transaction group
3. **Queuing**: Added to consensus queue with timestamp
4. **Data Collection**: Non-execution nodes send account data
5. **Execution**: Execution group processes transaction
6. **Consensus**: POQo algorithm achieves agreement
7. **Distribution**: Receipt and data propagated to all affected nodes

### Transaction Groups

For a transaction involving accounts A and B:

- **Transaction Group**: All validators storing any involved account
  - Union of consensus and edge nodes for all accounts
  - Ensures data availability and redundancy
  
- **Execution Group**: Consensus nodes for the execution shard
  - 128 validators responsible for transaction execution
  - Deterministically selected based on execution shard key
  - All members vote on transaction outcome

### FACT Algorithm

The Fast Aggregated Corresponding Tell (FACT) algorithm (`src/utils/fastAggregatedCorrespondingTell.ts`) efficiently routes data between node groups:

1. **Before Execution**: Non-execution nodes forward account data to execution nodes
2. **After Consensus**: Execution nodes forward results to storage nodes
3. **Optimization**: Each node calculates minimal set of recipients
4. **Complexity**: O(1) calculation per node

## POQo Consensus Algorithm

POQo (Proof of Quorum) achieves Byzantine fault-tolerant consensus among 128 execution nodes with minimal message complexity.

### Consensus Phases

1. **Execution Phase**:
   - Each execution node independently executes transaction
   - Generates proposal with before/after state hashes
   - Signs proposal with timestamp offset

2. **Voting Phase**:
   - Nodes send votes in priority order
   - Deterministic routing minimizes messages
   - Continues until supermajority reached

3. **Receipt Formation**:
   - First node with 2/3 supermajority creates receipt
   - Receipt contains proposal and signature pack
   - Aggregator broadcasts to all execution nodes

4. **Distribution Phase**:
   - Receipt gossipped throughout network
   - Account data forwarded via FACT
   - Non-execution nodes apply changes

### Consensus Properties

- **Supermajority**: Requires 86 of 128 signatures
- **Byzantine Tolerance**: Handles up to 42 malicious nodes
- **Message Complexity**: O(n) in happy path
- **Latency**: 4-6 seconds typical

See [POQo-consenus.spec.md](POQo-consenus.spec.md) for complete specification.

## State Management

### Account Model

The protocol uses an account-based state model where:
- Each account has a unique 32-byte address
- Accounts store arbitrary application data
- State changes tracked via hash transitions
- Account data cached and synchronized across shards

### Transaction Queue

The TransactionQueue (`src/state-manager/TransactionQueue.ts`) manages:
- Transaction ordering and prioritization
- Dependency resolution
- Queue state transitions
- Consensus readiness checks

### Receipt Storage

Transaction receipts provide cryptographic proof of execution:
- Proposal with state transitions
- Supermajority signature pack
- Application-specific receipt data
- Cycle number and timestamp

## Network Operations

### Join Protocol

The Join Protocol v2 (`src/p2p/Join/v2/`) implements secure node admission:

1. **Join Request**: Node generates POW and submits request
2. **Validation**: Active nodes verify request validity
3. **Standby Pool**: Valid requests enter standby
4. **Selection**: Deterministic selection each cycle
5. **Activation**: Progress through sync/ready/active states

### Rotation Mechanism

The rotation system maintains network freshness:
- Oldest validators periodically rotated out
- New validators rotated in from standby
- Ensures decentralization over time
- Configurable rotation rate

### Lost Node Detection

The protocol detects and handles unresponsive nodes:
- Periodic liveness checks
- Consensus on lost node list
- Automatic removal from active set
- Data redistribution to maintain coverage

### Apoptosis

Network-initiated node removal for:
- Performance issues
- Protocol violations
- Network rebalancing
- Emergency interventions

## Data Persistence

### Archiver System

Archiver nodes provide long-term data storage:
- Receive all transaction receipts
- Store complete account history
- Provide data for analytics and recovery
- Not involved in consensus

### Storage Layer

The storage module (`src/storage/`) manages:
- SQLite databases for persistent data
- Cycle records and receipts
- Account snapshots
- Network state checkpoints

## Security Considerations

### Cryptographic Foundations

- Ed25519 signatures for all messages
- SHA256 hashing for state transitions
- Proof of Work for spam prevention
- Deterministic algorithms prevent manipulation

### Attack Resistance

The protocol resists various attacks:
- **Sybil attacks**: POW and controlled admission
- **Eclipse attacks**: Large consensus groups
- **Data withholding**: Redundant data distribution
- **Timing attacks**: Deterministic ordering
- **Byzantine nodes**: 2/3 supermajority requirement

## Performance Characteristics

### Scalability

- **Horizontal scaling**: Performance increases with node count
- **Shard isolation**: Transactions process independently
- **Parallel execution**: Multiple transactions simultaneously
- **Atomic composability**: Cross-shard transactions supported

### Benchmarks

Typical performance metrics:
- **Transaction latency**: 4-6 seconds
- **Throughput**: Scales linearly with nodes
- **Message complexity**: O(n) for consensus
- **Storage overhead**: Configurable redundancy

## Implementation Files

### Core Modules

- **State Manager**: `src/state-manager/`
  - `index.ts`: Main state management and sharding
  - `TransactionQueue.ts`: Transaction queuing
  - `TransactionConsensus.ts`: POQo implementation
  - `shardFunctions.ts`: Shard calculations

- **P2P Layer**: `src/p2p/`
  - `Join/v2/`: Join protocol implementation
  - `CycleCreator.ts`: Cycle record creation
  - `CycleChain.ts`: Cycle chain management
  - `Sync.ts`: State synchronization

- **Utilities**: `src/utils/`
  - `fastAggregatedCorrespondingTell.ts`: FACT algorithm
  - `functions/`: Helper functions
  
- **Cryptography**: `src/crypto/`
  - Signature verification
  - Proof of Work generation

## Configuration

Key configuration parameters in `config.json`:

```javascript
{
  sharding: {
    nodesPerConsensusGroup: 128,  // Consensus group size
    nodesPerEdge: 5,              // Edge coverage
    executeInOneShard: true       // Atomic execution
  },
  p2p: {
    cycleDuration: 60,            // Seconds per cycle
    maxSyncTime: 100000,          // Max sync duration
    rotationRate: 0.01            // Rotation percentage
  },
  consensus: {
    usePOQo: true,               // Enable POQo consensus
    poqoLoopTime: 2000,         // Vote loop interval
    poqoBatchCount: 1           // Votes per loop
  }
}
```

## Summary

Shardus Core provides a robust foundation for building scalable distributed applications. Its key innovations include:

1. **Dynamic sharding** with overlapping coverage for fault tolerance
2. **POQo consensus** optimized for large validator groups
3. **Atomic composability** across shards without sacrificing performance
4. **Cycle-based operation** for predictable network evolution
5. **FACT algorithm** for efficient cross-shard communication

The protocol balances theoretical optimality with practical engineering constraints, achieving horizontal scalability while maintaining the security and atomicity properties essential for distributed ledger applications.