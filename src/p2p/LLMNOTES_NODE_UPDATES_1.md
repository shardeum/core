# Node Update Issue Investigation

## Current Implementation Flow
1. `updateNode` is called via `updateNodes` in `NodeList.ts`
2. `updateNodes` is called from `applyNodeListChange` in `Sync.ts`
3. `applyNodeListChange` is called when processing cycle changes

## Problem Identified
The current implementation only updates nodes that are in the `change.updated` array from cycle changes. This means:
1. Nodes are NOT automatically updated every cycle
2. Updates only happen when a node is explicitly listed in the cycle's changes
3. This affects the refute cycle tracking as refutes may be missed for nodes not in the update list

## Impact
1. RefuteCycles initialization message only appears once because subsequent updates aren't happening for all nodes
2. Problematic node detection may be incomplete since we're not tracking all potential refutes
3. The sliding window cleanup may not be running consistently for all nodes

## Potential Solutions
1. Modify cycle processing to update all nodes every cycle
2. Add a separate mechanism to periodically update all nodes
3. Review the cycle change generation to ensure all relevant nodes are included in updates

## Questions to Answer
1. Why aren't all nodes included in cycle updates?
2. Is this intentional behavior or an oversight?
3. What determines which nodes get included in `change.updated`? 