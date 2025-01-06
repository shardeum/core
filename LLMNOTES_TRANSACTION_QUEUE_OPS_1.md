# Transaction Queue Operations Analysis

## Core Operations Required

### 1. Queue Management
```typescript
interface TransactionQueueOps {
    // Insert sorted by timestamp
    insertSorted(entry: QueueEntry): void;
    
    // Remove at index
    removeAt(index: number): QueueEntry;
    
    // Remove and optionally archive
    remove(entry: QueueEntry, archive?: boolean): void;
    
    // Clear with conditions
    clear(predicate?: (entry: QueueEntry) => boolean): void;
    
    // Get length
    length: number;
}
```

### 2. Iteration Support
```typescript
interface TransactionQueueIteration {
    // Forward iteration
    forEach(callback: (entry: QueueEntry, index: number) => void): void;
    
    // Reverse iteration
    forEachReverse(callback: (entry: QueueEntry, index: number) => void): void;
    
    // Get entry at index
    at(index: number): QueueEntry;
    
    // Convert to array (for compatibility)
    toArray(): QueueEntry[];
}
```

### 3. Pending Queue Operations
```typescript
interface PendingQueueOps {
    // Add to pending
    addPending(entry: QueueEntry): void;
    
    // Process pending into main queue
    processPending(): void;
    
    // Get pending length
    pendingLength: number;
}
```

## Implementation Requirements

1. **Memory Management**
   - Pre-allocated buffer
   - Circular buffer for main queue
   - Separate pending queue buffer
   - Archive buffer for removed entries

2. **Performance Goals**
   - O(log n) sorted insertion
   - O(1) removal at index
   - O(1) access by index
   - O(n) iteration
   - Minimal memory allocation

3. **Compatibility**
   - Must support existing queue entry interface
   - Must maintain timestamp ordering
   - Must support transaction IDs for ties
   - Must preserve archive functionality

4. **Special Considerations**
   - Handle queue overflow
   - Support transaction aging
   - Maintain order invariants
   - Support queue state inspection 