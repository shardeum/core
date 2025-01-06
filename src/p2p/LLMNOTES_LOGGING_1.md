# RefuteCycles Initialization Logging

The log message "createNode: initializing refuteCycles for new node at cycle X" appears in `NodeList.ts` during node creation. It's part of a conditional block that initializes `refuteCycles` for problematic node removal feature.

The log appears under these conditions:
1. `config.p2p.enableProblematicNodeRemoval` must be true
2. There must be a newest cycle AND its counter must be >= `config.p2p.enableProblematicNodeRemovalOnCycle`

Alternative logs in this code path:
- "createNode: forcing refuteCycles initialization for new node (no cycle yet)" - when no cycle exists but threshold is 0
- "createNode: skipping refuteCycles init - cycle X below threshold Y" - when cycle exists but is below threshold

This suggests if you're only seeing the log once, either:
1. Not many nodes are being created
2. The conditions for initialization aren't being met frequently
3. The problematic node removal feature might not be enabled consistently 