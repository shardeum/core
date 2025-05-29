import { HashTrieUpdateStats, HashTrieNode, TrieAccount } from './state-manager-types'
import { nestedCountersInstance } from '../utils/nestedCounters'
import * as utils from '../utils'
import { logFlags } from '../logger'
import { StateManager as StateManagerTypes } from '@shardeum-foundation/lib-types'

export const trieMethods = {
  upateShardTrie(cycle: number): HashTrieUpdateStats {
    //we start with the later of nodes at max depth, and will build upwards one layer at a time
    const currentLayer = this.treeMaxDepth
    let treeNodeQueue: HashTrieNode[] = []

    const updateStats = {
      leafsUpdated: 0,
      leafsCreated: 0,
      updatedNodesPerLevel: new Array(this.treeMaxDepth + 1).fill(0),
      hashedChildrenPerLevel: new Array(this.treeMaxDepth + 1).fill(0),
      totalHashes: 0,
      //totalObjectsHashed: 0,
      totalNodesHashed: 0,
      totalAccountsHashed: 0,
      totalLeafs: 0,
    }

    //feed account data into lowest layer, generates list of treeNodes
    let currentMap = this.shardTrie.layerMaps[currentLayer] // eslint-disable-line security/detect-object-injection
    if (currentMap == null) {
      currentMap = new Map()
      this.shardTrie.layerMaps[currentLayer] = currentMap // eslint-disable-line security/detect-object-injection
    }

    //process accounts that need updating.  Create nodes as needed
    for (let i = 0; i < this.accountUpdateQueue.length; i++) {
      const tx = this.accountUpdateQueue[i] // eslint-disable-line security/detect-object-injection
      const key = tx.accountID.slice(0, currentLayer)
      let leafNode = currentMap.get(key)
      if (leafNode == null) {
        //init a leaf node.
        //leaf nodes will have a list of accounts that share the same radix.
        leafNode = {
          radix: key,
          children: [],
          childHashes: [],
          accounts: [],
          hash: '',
          accountTempMap: new Map(),
          updated: true,
          isIncomplete: false,
          nonSparseChildCount: 0,
        } //this map will cause issues with update
        currentMap.set(key, leafNode)
        updateStats.leafsCreated++
        treeNodeQueue.push(leafNode)
      }

      //this can happen if the depth gets smaller after being larger
      if (leafNode.accountTempMap == null) {
        leafNode.accountTempMap = new Map()
      }
      if (leafNode.accounts == null) {
        leafNode.accounts = []
      }

      if (leafNode.accountTempMap.has(tx.accountID) === false) {
        this.totalAccounts++
      }
      leafNode.accountTempMap.set(tx.accountID, tx)
      if (leafNode.updated === false) {
        treeNodeQueue.push(leafNode)
        updateStats.leafsUpdated++
      }
      leafNode.updated = true

      //too frequent in large tests.  only use this in local tests with smaller data
      //if (logFlags.verbose) /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('accountPatcher', `upateShardTrie ${utils.makeShortHash(tx.accountID)}`, `upateShardTrie update: ${utils.makeShortHash(tx.accountID)} h:${utils.makeShortHash(tx.hash)}`)
    }

    let removedAccounts = 0
    let removedAccountsFailed = 0

    if (this.accountRemovalQueue.length > 0) {
      //this.statemanager_fatal(`temp accountRemovalQueue`,`accountRemovalQueue c:${cycle} ${utils.stringifyReduce(this.accountRemovalQueue)}`)
      /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`remove account from trie tracking c:${cycle} ${utils.stringifyReduce(this.accountRemovalQueue)}`)
    }

    //remove accoutns from the trie.  this happens if our node no longer carries them in storage range.
    for (let i = 0; i < this.accountRemovalQueue.length; i++) {
      const accountID = this.accountRemovalQueue[i] // eslint-disable-line security/detect-object-injection

      const key = accountID.slice(0, currentLayer)
      const treeNode = currentMap.get(key)
      if (treeNode == null) {
        continue //already gone!
      }

      if (treeNode.updated === false) {
        treeNodeQueue.push(treeNode)
      }
      treeNode.updated = true

      if (treeNode.accountTempMap == null) {
        treeNode.accountTempMap = new Map()
      }
      if (treeNode.accounts == null) {
        treeNode.accounts = []
      }
      const removed = treeNode.accountTempMap.delete(accountID)
      if (removed) {
        removedAccounts++
        /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('accountPatcher', `upateShardTrie ${utils.makeShortHash(accountID)}`, `upateShardTrie remove ${utils.makeShortHash(accountID)} `)
      } else {
        removedAccountsFailed++
      }
    }
    if (removedAccounts > 0) {
      nestedCountersInstance.countEvent(`accountPatcher`, `removedAccounts c:${cycle}`, removedAccounts)
    }
    if (removedAccountsFailed > 0) {
      /* prettier-ignore */ nestedCountersInstance.countEvent(`accountPatcher`, `removedAccountsFailed c:${cycle}`, removedAccountsFailed)
    }
    this.accountRemovalQueue = []

    // for(let treeNode of this.incompleteNodes){
    //   treeNodeQueue.push(treeNode)
    // }

    //look at updated leaf nodes.  Sort accounts and update hash values
    for (let i = 0; i < treeNodeQueue.length; i++) {
      const treeNode = treeNodeQueue[i] // eslint-disable-line security/detect-object-injection

      if (treeNode.updated === true) {
        //treeNode.accountTempMap != null){
        treeNode.accounts = Array.from(treeNode.accountTempMap.values())

        //delete treeNode.accountTempMap...  need to keep it
        //treeNode.accountTempMap = null

        //sort treeNode.accounts by accountID
        treeNode.accounts.sort(this.sortByAccountID)
        //compute treenode hash of accounts
        treeNode.hash = this.hashObj(treeNode.accounts.map((a) => a.hash)) //todo why is this needed!!!

        treeNode.updated = false

        updateStats.totalHashes++
        updateStats.totalAccountsHashed = updateStats.totalAccountsHashed + treeNode.accounts.length
        updateStats.updatedNodesPerLevel[currentLayer] = updateStats.updatedNodesPerLevel[currentLayer] + 1 // eslint-disable-line security/detect-object-injection
      }
    }

    // update the tree one later at a time. start at the max depth and copy values to the parents.
    // Then the parent depth becomes the working depth and we repeat the process
    // a queue is used to efficiently update only the nodes that need it.
    // hashes are efficiently calculated only once after all children have set their hash data in the childHashes
    let parentTreeNodeQueue = []
    //treenode queue has updated treeNodes from each loop, gets fed into next loop
    for (let i = currentLayer - 1; i >= 0; i--) {
      currentMap = this.shardTrie.layerMaps[i] // eslint-disable-line security/detect-object-injection
      if (currentMap == null) {
        currentMap = new Map()
        this.shardTrie.layerMaps[i] = currentMap // eslint-disable-line security/detect-object-injection
      }
      //loop each node in treeNodeQueue (nodes from the previous level down)
      for (let j = 0; j < treeNodeQueue.length; j++) {
        const treeNode = treeNodeQueue[j] // eslint-disable-line security/detect-object-injection

        //compute parent nodes.
        const parentKey = treeNode.radix.slice(0, i)
        // fast? 0-15 conversion
        let index = treeNode.radix.charCodeAt(i)
        index = index < 90 ? index - 48 : index - 87
        //get parent node
        let parentTreeNode = currentMap.get(parentKey)
        if (parentTreeNode == null) {
          parentTreeNode = {
            radix: parentKey,
            children: new Array(16),
            childHashes: new Array(16),
            updated: false,
            hash: '',
            isIncomplete: false,
            nonSparseChildCount: 0,
          }
          currentMap.set(parentKey, parentTreeNode)
        }

        //if we have not set this child yet then count it
        // eslint-disable-next-line security/detect-object-injection
        if (parentTreeNode.children[index] == null) {
          // eslint-disable-line security/detect-object-injection
          parentTreeNode.nonSparseChildCount++
        }

        //assign position
        parentTreeNode.children[index] = treeNode // eslint-disable-line security/detect-object-injection
        parentTreeNode.childHashes[index] = treeNode.hash // eslint-disable-line security/detect-object-injection

        //insert new parent nodes if we have not yet, guided by updated flag
        if (parentTreeNode.updated === false) {
          parentTreeNodeQueue.push(parentTreeNode)
          parentTreeNode.updated = true
        }

        if (treeNode.isIncomplete) {
          // if(parentTreeNode.isIncomplete === false && parentTreeNode.updated === false ){
          //   parentTreeNode.updated = true
          //   parentTreeNodeQueue.push(parentTreeNode)
          // }
          parentTreeNode.isIncomplete = true
        }

        treeNode.updated = false //finished update of this node.
      }

      updateStats.updatedNodesPerLevel[i] = parentTreeNodeQueue.length // eslint-disable-line security/detect-object-injection

      //when we are one step below the sync depth add in incompete parents for hash updates!
      // if(i === this.treeSyncDepth + 1){
      //   for(let treeNode of this.incompleteNodes){
      //     parentTreeNodeQueue.push(treeNode)
      //   }
      // }

      //loop and compute hashes of parents
      for (let j = 0; j < parentTreeNodeQueue.length; j++) {
        const parentTreeNode = parentTreeNodeQueue[j] // eslint-disable-line security/detect-object-injection
        parentTreeNode.hash = this.hashObj(parentTreeNode.childHashes)

        updateStats.totalHashes++
        updateStats.totalNodesHashed = updateStats.totalNodesHashed + parentTreeNode.nonSparseChildCount
        updateStats.hashedChildrenPerLevel[i] = // eslint-disable-line security/detect-object-injection
          updateStats.hashedChildrenPerLevel[i] + parentTreeNode.nonSparseChildCount // eslint-disable-line security/detect-object-injection
      }
      //set the parents to the treeNodeQueue so we can loop and work on the next layer up
      treeNodeQueue = parentTreeNodeQueue
      parentTreeNodeQueue = []
    }

    updateStats.totalLeafs = this.shardTrie.layerMaps[this.treeMaxDepth].size

    this.accountUpdateQueue = []

    return updateStats
  },

  /**
     * updateTrieAndBroadCast
     * calculates what our tree leaf(max) depth and sync depths are.
     *   if there is a change we have to do some partition work to send old leaf data to new leafs.
     * Then calls upateShardTrie() and broadcastSyncHashes()
     *
     * @param cycle
     */
  async updateTrieAndBroadCast(cycle: number): Promise<void> {
      //calculate sync levels!!
      const shardValues = this.stateManager.shardValuesByCycle.get(cycle)
      const shardGlobals = shardValues.shardGlobals as StateManagerTypes.shardFunctionTypes.ShardGlobals
  
      const minHashesPerRange = 4
      // y = floor(log16((minHashesPerRange * max(1, x/consensusRange   ))))
      let syncDepthRaw =
        Math.log(minHashesPerRange * Math.max(1, shardGlobals.numPartitions / (shardGlobals.consensusRadius * 2 + 1))) /
        Math.log(16)
      syncDepthRaw = Math.max(1, syncDepthRaw) // at least 1
      const newSyncDepth = Math.ceil(syncDepthRaw)
  
      //This only happens when the depth of our tree change (based on num nodes above)
      //We have to partition the leaf node data into leafs of the correct level and rebuild the tree
      if (this.treeSyncDepth != newSyncDepth) {
        //todo add this in to prevent size flipflop..(better: some deadspace)  && newSyncDepth > this.treeSyncDepth){
        const resizeStats = {
          nodesWithAccounts: 0,
          nodesWithoutAccounts: 0,
        }
        const newMaxDepth = newSyncDepth + 3 //todo the "+3" should be based on total number of stored accounts pre node (in a consensed way, needs to be on cycle chain)
        //add more maps if needed  (+1 because we have a map level 0)
        while (this.shardTrie.layerMaps.length < newMaxDepth + 1) {
          this.shardTrie.layerMaps.push(new Map())
        }
  
        //detach all accounts.
        const currentLeafMap = this.shardTrie.layerMaps[this.treeMaxDepth]
  
        //put all accounts into queue to rebuild Tree!
        for (const treeNode of currentLeafMap.values()) {
          if (treeNode.accounts != null) {
            for (const account of treeNode.accounts) {
              //this.updateAccountHash(account.accountID, account.hash)
  
              //need to unshift these, becasue they could be older than what is alread in the queue!!
              this.accountUpdateQueue.unshift(account)
            }
            // //clear out leaf node only properties:
            // treeNode.accounts = null
            // treeNode.accountTempMap = null
  
            // //have to init these nodes to work as parents
            // treeNode.children = Array(16)
            // treeNode.childHashes = Array(16)
  
            //nestedCountersInstance.countEvent(`accountPatcher`, `updateTrieAndBroadCast: ok account list?`)
            resizeStats.nodesWithAccounts++
          } else {
            //nestedCountersInstance.countEvent(`accountPatcher`, `updateTrieAndBroadCast: null account list?`)
            resizeStats.nodesWithoutAccounts++
          }
        }
  
        //better to just wipe out old parent nodes!
        for (let idx = 0; idx < newMaxDepth; idx++) {
          this.shardTrie.layerMaps[idx].clear() // eslint-disable-line security/detect-object-injection
        }
  
        if (newMaxDepth < this.treeMaxDepth) {
          //cant get here, but consider deleting layers out of the map
          /* prettier-ignore */ nestedCountersInstance.countEvent(`accountPatcher`, `max depth decrease oldMaxDepth:${this.treeMaxDepth} maxDepth :${newMaxDepth} stats:${utils.stringifyReduce(resizeStats)} cycle:${cycle}`)
        } else {
          /* prettier-ignore */ nestedCountersInstance.countEvent(`accountPatcher`, `max depth increase oldMaxDepth:${this.treeMaxDepth} maxDepth :${newMaxDepth} stats:${utils.stringifyReduce(resizeStats)} cycle:${cycle}`)
        }
  
        this.treeSyncDepth = newSyncDepth
        this.treeMaxDepth = newMaxDepth
      }
  
      /* prettier-ignore */ nestedCountersInstance.countEvent(`accountPatcher`, ` syncDepth:${this.treeSyncDepth} maxDepth :${this.treeMaxDepth}`)
  
      // Update the trie with new account data updates since the last cycle
      const updateStats = this.upateShardTrie(cycle)
  
      /* prettier-ignore */ nestedCountersInstance.countEvent(`accountPatcher`, `totalAccountsHashed`, updateStats.totalAccountsHashed)
  
    //broadcast sync data to nodes that cover similar portions of the tree
    await this.broadcastSyncHashes(cycle)
  }
}