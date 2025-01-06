# Memory Management in Shardus Core

## Memory Monitoring
- The codebase has a dedicated `MemoryReporting` class that tracks various memory metrics:
  - RSS (Resident Set Size)
  - Heap Total
  - Heap Used
  - External Memory
  - Array Buffers

## Memory Cleanup Mechanisms
1. **Periodic Cleanup**
   - Cache pruning based on cycle age and element limits
   - Cleanup of old partition data
   - Garbage collection can be triggered manually via endpoint

2. **Cache Management**
   - Configurable cache limits per topic
   - Memory limits can be set per cached item
   - Automatic pruning of aged cache entries

3. **P2P Memory Management**
   - Node list cleanup
   - Lost node record pruning
   - Network state cleanup

## Typical Memory Usage Patterns
Based on the codebase implementation:
- Most memory is used for:
  - Account cache
  - Transaction queues
  - Node lists
  - Network state
  - Partition data

## Recommendations for Node Operators
For an average node process:
- Minimum: 4GB RAM
- Recommended: 8GB RAM
- Optimal: 16GB RAM

This allows for:
- Sufficient heap space for account cache
- Room for transaction processing
- Network state management
- Safe buffer for peak loads

## Memory Warning Signs
- High RSS relative to heap usage may indicate memory leaks
- Growing heap without corresponding cache growth
- External memory spikes during network operations 