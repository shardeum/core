# Double-Ended Queue (Deque)

## Overview
A double-ended queue (deque) is a data structure that allows efficient insertion and deletion at both ends. It combines features of both stacks and queues.

## Implementation Patterns in JavaScript

### 1. Circular Buffer Implementation
```typescript
class CircularDeque<T> {
    private buffer: T[];
    private head: number = 0;
    private tail: number = 0;
    private size: number = 0;
    
    constructor(capacity: number) {
        this.buffer = new Array(capacity);
    }
}
```

### 2. Key Operations
- **pushFront**: O(1) - Add to front
- **pushBack**: O(1) - Add to back
- **popFront**: O(1) - Remove from front
- **popBack**: O(1) - Remove from back
- **peekFront**: O(1) - View front element
- **peekBack**: O(1) - View back element

### 3. Memory Characteristics
- Fixed memory allocation
- No reallocation on push/pop
- Cache-friendly memory layout
- Zero fragmentation

## Advantages Over Arrays

1. **Performance Benefits**
   - No array shifting on insertion/deletion
   - Constant time operations at both ends
   - Better cache utilization
   - Reduced memory allocation

2. **Memory Benefits**
   - Pre-allocated memory
   - No resizing operations
   - Contiguous memory layout
   - Efficient memory reuse

3. **Use Cases**
   - Transaction queues
   - Buffer pools
   - Work stealing queues
   - Message queues

## Implementation Considerations

1. **Capacity Management**
   - Fixed size vs. dynamic growth
   - Overflow handling
   - Underflow handling
   - Resize strategies

2. **Memory Layout**
   ```
   [empty][empty][item3][item2][item1][empty][empty]
                 ^head         ^tail
   ```

3. **Index Management**
   - Circular wrapping
   - Modulo arithmetic
   - Boundary conditions

## Performance Characteristics

1. **Time Complexity**
   - Insert at ends: O(1)
   - Delete at ends: O(1)
   - Random access: O(1)
   - Search: O(n)

2. **Space Complexity**
   - Fixed: O(n) where n is capacity
   - No additional overhead
   - Cache-line optimized

## Best Practices
1. Size the deque based on expected load
2. Consider resize thresholds carefully
3. Use TypedArrays for numeric data
4. Implement boundary checks
5. Consider thread safety if needed 