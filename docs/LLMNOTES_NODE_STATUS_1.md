# Node Status Information

## Node States
Nodes can be in different states:
- ACTIVE - Currently participating in the network
- SYNCING - In the process of syncing data
- READY - Ready to become active
- SELECTED - Selected for activation

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