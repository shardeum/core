import { AccountIDAndHash, AccountIdAndHashToRepair, RadixAndHashWithNodeId, RadixAndHash } from './state-manager-types'
import { nestedCountersInstance } from '../utils/nestedCounters'
import * as NodeList from '../p2p/NodeList'
import { logFlags } from '../logger'
import * as utils from '../utils'
import { Utils } from '@shardeum-foundation/lib-types'
import { AccountHashCache, AccountHashCacheHistory, HashTrieAccountsResp, HashTrieNode } from './state-manager-types'
import { Node } from '../shardus/shardus-types'

interface BadAccountsInfo {
  badAccounts: AccountIDAndHash[]
  hashesPerLevel: number[]
  checkedKeysPerLevel: any[]
  requestedKeysPerLevel: number[]
  badHashesPerLevel: number[]
  accountHashesChecked: any
  stats: any
  extraBadAccounts: AccountIdAndHashToRepair[]
  extraBadKeys: RadixAndHashWithNodeId[]
  accountsTheyNeedToRepair: AccountIdAndHashToRepair[]
}

export const finderMethods = {
  /***
   *    ######## #### ##    ## ########  ########     ###    ########     ###     ######   ######   #######  ##     ## ##    ## ########  ######
   *    ##        ##  ###   ## ##     ## ##     ##   ## ##   ##     ##   ## ##   ##    ## ##    ## ##     ## ##     ## ###   ##    ##    ##    ##
   *    ##        ##  ####  ## ##     ## ##     ##  ##   ##  ##     ##  ##   ##  ##       ##       ##     ## ##     ## ####  ##    ##    ##
   *    ######    ##  ## ## ## ##     ## ########  ##     ## ##     ## ##     ## ##       ##       ##     ## ##     ## ## ## ##    ##     ######
   *    ##        ##  ##  #### ##     ## ##     ## ######### ##     ## ######### ##       ##       ##     ## ##     ## ##  ####    ##          ##
   *    ##        ##  ##   ### ##     ## ##     ## ##     ## ##     ## ##     ## ##    ## ##    ## ##     ## ##     ## ##   ###    ##    ##    ##
   *    ##       #### ##    ## ########  ########  ##     ## ########  ##     ##  ######   ######   #######   #######  ##    ##    ##     ######
   */
  /**
   * findBadAccounts
   *
   * starts at the sync level hashes that dont match and queries for child nodes to get more details about
   * what accounts could possibly be bad.  At the lowest level gets a list of accounts and hashes
   * We double check out cache values before returning a list of bad accounts that need repairs.
   *
   * @param cycle
   */
  async findBadAccounts(cycle: number): Promise<BadAccountsInfo> {
    let badAccounts: AccountIDAndHash[] = []
    let accountsTheyNeedToRepair: AccountIdAndHashToRepair[] = []
    let accountsWeNeedToRepair: AccountIDAndHash[] = []
    const hashesPerLevel: number[] = Array(this.treeMaxDepth + 1).fill(0)
    const checkedKeysPerLevel = Array(this.treeMaxDepth)
    const badHashesPerLevel: number[] = Array(this.treeMaxDepth + 1).fill(0)
    const requestedKeysPerLevel: number[] = Array(this.treeMaxDepth + 1).fill(0)

    let level = this.treeSyncDepth
    let badLayerMap = this.shardTrie.layerMaps[level] // eslint-disable-line security/detect-object-injection
    const syncTrackerRanges = this.getSyncTrackerRanges()

    const stats = {
      testedSyncRadix: 0,
      skippedSyncRadix: 0,
      badSyncRadix: 0,
      ok_noTrieAcc: 0,
      ok_trieHashBad: 0,
      fix_butHashMatch: 0,
      fixLastSeen: 0,
      needsVotes: 0,
      subHashesTested: 0,
      trailColdLevel: 0,
      checkedLevel: 0,
      leafsChecked: 0,
      leafResponses: 0,
      getAccountHashStats: {},
    }
    let extraBadKeys: RadixAndHashWithNodeId[] = []
    let extraBadAccounts: AccountIdAndHashToRepair[] = []

    const minVotes = this.calculateMinVotes()

    const goodVotes: RadixAndHash[] = []
    const hashTrieSyncConsensus = this.hashTrieSyncConsensusByCycle.get(cycle)
    for (const radix of hashTrieSyncConsensus.radixHashVotes.keys()) {
      const votesMap = hashTrieSyncConsensus.radixHashVotes.get(radix)
      let isSyncingRadix = false

      if (votesMap.bestVotes < minVotes) {
        stats.needsVotes++
        if (logFlags.debug) {
          //overkill, need it for now
          const kvp = []
          for (const [key, value] of votesMap.allVotes.entries()) {
            kvp.push({
              id: key,
              count: value.count,
              nodeIDs: [...value.voters].map((node) => utils.makeShortHash(node.id) + ':' + node.externalPort),
            })
          }
          const simpleMap = {
            bestHash: votesMap.bestHash,
            bestVotes: votesMap.bestVotes,
            allVotes: kvp,
          }
          /* prettier-ignore */ nestedCountersInstance.countEvent(`accountPatcher`, `not enough votes ${radix} ${utils.makeShortHash(votesMap.bestHash)} uniqueVotes: ${votesMap.allVotes.size}`, 1)
          this.statemanager_fatal(
            'debug findBadAccounts',
            `debug findBadAccounts ${cycle}: ${radix} bestVotes${
              votesMap.bestVotes
            } < minVotes:${minVotes} uniqueVotes: ${votesMap.allVotes.size} ${utils.stringifyReduce(simpleMap)}`
          )
        }
        // skipping 50% votes restriction to allow patcher to do account based patching
        // continue
      }

      //do we need to filter out a vote?
      for (const range of syncTrackerRanges) {
        if (radix >= range.low && radix <= range.high) {
          isSyncingRadix = true
          break
        }
      }
      if (isSyncingRadix === true) {
        stats.skippedSyncRadix++
        continue
      }
      stats.testedSyncRadix++
      goodVotes.push({ radix, hash: votesMap.bestHash })
    }

    let toFix = this.diffConsenus(goodVotes, badLayerMap)

    stats.badSyncRadix = toFix.length

    if (logFlags.debug) {
      toFix.sort(this.sortByRadix)
      this.statemanager_fatal(
        'debug findBadAccounts',
        `debug findBadAccounts ${cycle}: toFix: ${utils.stringifyReduce(toFix)}`
      )
      for (let radixToFix of toFix) {
        const votesMap = hashTrieSyncConsensus.radixHashVotes.get(radixToFix.radix)
        let hasNonConsensusRange = false
        let hasNonStorageRange = false

        const nonConsensusRanges = this.getNonConsensusRanges(cycle)
        const nonStorageRange = this.getNonStoredRanges(cycle)
        for (const range of nonConsensusRanges) {
          if (radixToFix.radix >= range.low && radixToFix.radix <= range.high) {
            hasNonConsensusRange = true
            nestedCountersInstance.countEvent(`accountPatcher`, `findBadAccounts hasNonConsensusRange`, 1)
          }
        }
        for (const range of nonStorageRange) {
          if (radixToFix.radix >= range.low && radixToFix.radix <= range.high) {
            hasNonStorageRange = true
            nestedCountersInstance.countEvent(`accountPatcher`, `findBadAccounts hasNonStorageRange`, 1)
          }
        }

        const kvp = []
        for (const [key, value] of votesMap.allVotes.entries()) {
          kvp.push({
            id: key,
            count: value.count,
            nodeIDs: [...value.voters].map((node) => utils.makeShortHash(node.id) + ':' + node.externalPort),
          })
        }
        const simpleMap = {
          bestHash: votesMap.bestHash,
          bestVotes: votesMap.bestVotes,
          allVotes: kvp,
        }
        this.statemanager_fatal(
          'debug findBadAccounts',
          `debug findBadAccounts ${cycle}: ${
            radixToFix.radix
          } isInNonConsensusRange: ${hasNonConsensusRange} isInNonStorageRange: ${hasNonStorageRange} bestVotes ${
            votesMap.bestVotes
          } minVotes:${minVotes} uniqueVotes: ${votesMap.allVotes.size} ${utils.stringifyReduce(simpleMap)}`
        )
      }
    }

    //record some debug info
    badHashesPerLevel[level] = toFix.length // eslint-disable-line security/detect-object-injection
    checkedKeysPerLevel[level] = toFix.map((x) => x.radix) // eslint-disable-line security/detect-object-injection
    requestedKeysPerLevel[level] = goodVotes.length // eslint-disable-line security/detect-object-injection
    hashesPerLevel[level] = goodVotes.length // eslint-disable-line security/detect-object-injection

    this.computeCoverage(cycle)

    stats.checkedLevel = level
    //refine our query until we get to the lowest level
    while (level < this.treeMaxDepth && toFix.length > 0) {
      level++
      stats.checkedLevel = level
      badLayerMap = this.shardTrie.layerMaps[level] // eslint-disable-line security/detect-object-injection
      const remoteChildrenToDiff: RadixAndHashWithNodeId[] = await this.getChildrenOf(toFix, cycle)

      if (remoteChildrenToDiff == null) {
        nestedCountersInstance.countEvent(
          `accountPatcher`,
          `findBadAccounts remoteChildrenToDiff == null for radixes: ${Utils.safeStringify(toFix)}, cycle: ${cycle}`,
          1
        )
      }
      if (remoteChildrenToDiff.length === 0) {
        nestedCountersInstance.countEvent(
          `accountPatcher`,
          `findBadAccounts remoteChildrenToDiff.length = 0 for radixes: ${Utils.safeStringify(toFix)}, cycle: ${cycle}`,
          1
        )
      }

      this.mainLogger.debug(
        `findBadAccounts ${cycle}: level: ${level}, toFix: ${toFix.length}, childrenToDiff: ${Utils.safeStringify(
          remoteChildrenToDiff
        )}, badLayerMap: ${Utils.safeStringify(badLayerMap)}`
      )
      toFix = this.diffConsenus(remoteChildrenToDiff, badLayerMap)

      stats.subHashesTested += toFix.length

      if (toFix.length === 0) {
        stats.trailColdLevel = level
        extraBadKeys = this.findExtraBadKeys(remoteChildrenToDiff, badLayerMap)

        let result = {
          nodeChildHashes: [],
          stats: {
            matched: 0,
            visisted: 0,
            empty: 0,
            childCount: 0,
          },
        } as HashTrieAccountsResp

        let allLeafNodes: HashTrieNode[] = []

        for (const radixAndHash of extraBadKeys) {
          let level = radixAndHash.radix.length
          while (level < this.treeMaxDepth) {
            level++
            const layerMap = this.shardTrie.layerMaps[level] // eslint-disable-line security/detect-object-injection
            if (layerMap == null) {
              /* prettier-ignore */ nestedCountersInstance.countEvent('accountPatcher', `get_trie_accountHashes badrange:${level}`)
              break
            }
            const hashTrieNode = layerMap.get(radixAndHash.radix)
            if (hashTrieNode != null && hashTrieNode.accounts != null) {
              result.stats.visisted++
              const childAccounts = []
              result.nodeChildHashes.push({ radix: radixAndHash.radix, childAccounts })
              for (const account of hashTrieNode.accounts) {
                childAccounts.push({ accountID: account.accountID, hash: account.hash })
                extraBadAccounts.push({
                  accountID: account.accountID,
                  hash: account.hash,
                  targetNodeId: radixAndHash.nodeId,
                })
                result.stats.childCount++
              }
              if (hashTrieNode.accounts.length === 0) {
                result.stats.empty++
              }
            }
          }
        }

        for (const radixAndHash of extraBadKeys) {
          const radix = radixAndHash.radix
          result.stats.visisted++
          const level = radix.length
          const layerMap = this.shardTrie.layerMaps[level] // eslint-disable-line security/detect-object-injection
          if (layerMap == null) {
            /* prettier-ignore */ nestedCountersInstance.countEvent('accountPatcher', `get_trie_accountHashes badrange:${level}`)
            break
          }

          const currentNode = layerMap.get(radix)
          const leafs: HashTrieNode[] = this.extractLeafNodes(currentNode)
          for (const leaf of leafs) {
            if (leaf != null && leaf.accounts != null) {
              result.stats.matched++
              const childAccounts = []
              result.nodeChildHashes.push({ radix, childAccounts })
              for (const account of leaf.accounts) {
                childAccounts.push({ accountID: account.accountID, hash: account.hash })
                extraBadAccounts.push({
                  accountID: account.accountID,
                  hash: account.hash,
                  targetNodeId: radixAndHash.nodeId,
                })
                result.stats.childCount++
              }
              if (leaf.accounts.length === 0) {
                result.stats.empty++
              }
            }
          }
        }

        if (extraBadKeys.length > 0) {
          toFix = toFix.concat(extraBadKeys)
          break
        }
      }

      //record some debug info
      badHashesPerLevel[level] = toFix.length // eslint-disable-line security/detect-object-injection
      checkedKeysPerLevel[level] = toFix.map((x) => x.radix) // eslint-disable-line security/detect-object-injection
      requestedKeysPerLevel[level] = remoteChildrenToDiff.length // eslint-disable-line security/detect-object-injection
      hashesPerLevel[level] = remoteChildrenToDiff.length // eslint-disable-line security/detect-object-injection
      // badLayerMap.size ...badLayerMap could be null!
    }

    stats.leafsChecked = toFix.length
    //get bad accounts from the leaf nodes
    const { radixAndChildHashes, getAccountHashStats } = await this.getChildAccountHashes(toFix, cycle)
    stats.getAccountHashStats = getAccountHashStats

    stats.leafResponses = radixAndChildHashes.length

    let accountHashesChecked = 0
    for (const radixAndChildHash of radixAndChildHashes) {
      accountHashesChecked += radixAndChildHash.childAccounts.length

      const badTreeNode = badLayerMap.get(radixAndChildHash.radix)
      if (badTreeNode != null) {
        const localAccountsMap = new Map()
        const remoteAccountsMap = new Map()
        if (badTreeNode.accounts != null) {
          for (let i = 0; i < badTreeNode.accounts.length; i++) {
            if (badTreeNode.accounts[i] == null) continue
            localAccountsMap.set(badTreeNode.accounts[i].accountID, badTreeNode.accounts[i]) // eslint-disable-line security/detect-object-injection
          }
        }
        for (let account of radixAndChildHash.childAccounts) {
          remoteAccountsMap.set(account.accountID, { account, nodeId: radixAndChildHash.nodeId })
        }
        if (radixAndChildHash.childAccounts.length > localAccountsMap.size) {
          /* prettier-ignore */ if (this.config.debug.verboseNestedCounters) nestedCountersInstance.countEvent(`accountPatcher`, `remote trie node has more accounts, radix: ${radixAndChildHash.radix}`)
        } else if (radixAndChildHash.childAccounts.length < localAccountsMap.size) {
          /* prettier-ignore */ if (this.config.debug.verboseNestedCounters) nestedCountersInstance.countEvent(`accountPatcher`, `remote trie node has less accounts than local trie node, radix: ${radixAndChildHash.radix}`)
        } else if (radixAndChildHash.childAccounts.length === localAccountsMap.size) {
          /* prettier-ignore */ if (this.config.debug.verboseNestedCounters) nestedCountersInstance.countEvent(`accountPatcher`, `remote trie node has same number of accounts as local trie node, radix: ${radixAndChildHash.radix}`)
        }
        for (let i = 0; i < radixAndChildHash.childAccounts.length; i++) {
          const potentalGoodAcc = radixAndChildHash.childAccounts[i] // eslint-disable-line security/detect-object-injection
          const potentalBadAcc = localAccountsMap.get(potentalGoodAcc.accountID)

          //check if our cache value has matching hash already.  The trie can lag behind.
          //  todo would be nice to find a way to reduce this, possibly by better control of syncing ranges.
          //   (we are not supposed to test syncing ranges , but maybe that is out of phase?)

          //only do this check if the account is new.  It was skipping potential oos situations.
          const accountMemData: AccountHashCache = this.stateManager.accountCache.getAccountHash(
            potentalGoodAcc.accountID
          )
          if (accountMemData != null && accountMemData.h === potentalGoodAcc.hash) {
            if (accountMemData.c >= cycle - 1) {
              if (potentalBadAcc != null) {
                if (potentalBadAcc.hash != potentalGoodAcc.hash) {
                  stats.ok_trieHashBad++ // mem account is good but trie account is bad
                }
              } else {
                stats.ok_noTrieAcc++ // no trie account at all
              }

              //this was in cache, but stale so we can reinstate the cache since it still matches the group consensus
              const accountHashCacheHistory: AccountHashCacheHistory =
                this.stateManager.accountCache.getAccountHashHistoryItem(potentalGoodAcc.accountID)
              if (
                accountHashCacheHistory != null &&
                accountHashCacheHistory.lastStaleCycle >= accountHashCacheHistory.lastSeenCycle
              ) {
                stats.fixLastSeen++
                accountHashCacheHistory.lastSeenCycle = cycle
              }
              //skip out
              continue
            } else {
              //dont skip out!
              //cache matches but trie hash is bad
              stats.fix_butHashMatch++
              //actually we can repair trie here:
              this.updateAccountHash(potentalGoodAcc.accountID, potentalGoodAcc.hash)
              continue
            }
          }

          //is the account missing or wrong hash?
          if (potentalBadAcc != null) {
            if (potentalBadAcc.hash != potentalGoodAcc.hash) {
              badAccounts.push(potentalGoodAcc)
            }
          } else {
            badAccounts.push(potentalGoodAcc)
          }
        }
        for (let i = 0; i < badTreeNode.accounts.length; i++) {
          const localAccount = badTreeNode.accounts[i] // eslint-disable-line security/detect-object-injection
          if (localAccount == null) continue
          const remoteNodeItem = remoteAccountsMap.get(localAccount.accountID)
          if (remoteNodeItem == null) {
            accountsWeNeedToRepair.push(localAccount)
            continue
          }
          const { account: remoteAccount, nodeId: targetNodeId } = remoteNodeItem
          if (remoteAccount == null) {
            accountsTheyNeedToRepair.push({ ...localAccount, targetNodeId })
          }
        }
      } else {
        badAccounts = badAccounts.concat(radixAndChildHash.childAccounts)
      }
    }
    if (accountsTheyNeedToRepair.length > 0) {
      nestedCountersInstance.countEvent(`accountPatcher`, `accountsTheyNeedToRepair`, accountsTheyNeedToRepair.length)
    }
    return {
      badAccounts,
      hashesPerLevel,
      checkedKeysPerLevel,
      requestedKeysPerLevel,
      badHashesPerLevel,
      accountHashesChecked,
      stats,
      extraBadAccounts,
      extraBadKeys,
      accountsTheyNeedToRepair,
    }
  }
}