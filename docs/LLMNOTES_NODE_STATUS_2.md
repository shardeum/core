# Node Status Information

## Node State Progression
A node progresses through the following states:
1. INITIALIZING - Initial state when node starts up
2. STANDBY - Node is trying to get its join request accepted
3. SYNCING - Node has accepted join request and is syncing data
4. READY - Node has completed syncing and is ready to become active
5. SELECTED - Node has been selected to become active
6. ACTIVE - Node is fully participating in the network

## Available Endpoints
1. `/network-stats` - Returns counts of nodes in different states:
   - active: Number of active nodes
   - syncing: Number of syncing nodes
   - ready: Number of ready nodes
   - standby: Number of standby nodes
   - desired: Target number of nodes

2. `/nodelist_debug` - Returns list of active nodes with:
   - id: Short hash of node ID
   - ip: External IP
   - port: External port

## Additional Node States
Nodes can also be in these states:
- LOST - Node has been marked as lost/unreachable
- APOPTOSIZED - Node has been removed from the network
- REFUTED - Node has been challenged and failed verification 