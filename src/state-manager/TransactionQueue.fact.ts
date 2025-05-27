import { QueueEntry } from './state-manager-types'
import * as Shardus from '../shardus/shardus-types'
import { StateManager as StateManagerTypes } from '@shardeum-foundation/lib-types'
import { logFlags } from '../logger'
import * as utils from '../utils'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { shardusGetTime } from '../network'
import { Node } from '@shardeum-foundation/lib-types/build/src/p2p/NodeListTypes'
import { getCorrespondingNodes } from '../utils/fastAggregatedCorrespondingTell'
import * as Comms from '../p2p/Comms'
import { BroadcastStateReq, serializeBroadcastStateReq } from '../types/BroadcastStateReq'
import { verificationDataCombiner } from '../types/Helpers'
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum'
import * as Self from '../p2p/Self'
import { config as configContext, P2PModuleContext } from '../p2p/Context'
import * as Context from '../p2p/Context'
import { P2P as P2PTypes } from '@shardeum-foundation/lib-types'
import { StringNodeObjectMap, WrappedResponses, RequestFinalDataResp } from './state-manager-types'
import * as NodeList from '../p2p/NodeList'
import { byPubKey, nodes } from '../p2p/NodeList'
import { verifyCorrespondingSender } from '../utils/fastAggregatedCorrespondingTell'
import { BroadcastFinalStateReq, serializeBroadcastFinalStateReq } from '../types/BroadcastFinalStateReq'
import { PoqoDataAndReceiptReq, serializePoqoDataAndReceiptReq } from '../types/PoqoDataAndReceiptReq'
import { profilerInstance } from '../utils/profiler'
import ShardFunctions from './shardFunctions'
import { DebugComplete } from './TransactionQueue'
import { Utils } from '@shardeum-foundation/lib-types'
import { RequestTxAndStateReq, serializeRequestTxAndStateReq } from '../types/RequestTxAndStateReq'
import { RequestTxAndStateResp, deserializeRequestTxAndStateResp } from '../types/RequestTxAndStateResp'

interface TransactionQueueContext {
  stateManager: any
  logger: any
  mainLogger: any
  profiler: any
  app: Shardus.App
  setDebugLastAwaitedCallInner: (call: string, status?: DebugComplete) => void
  queueEntryAddData: (queueEntry: QueueEntry, data: any, signatureCheck?: boolean) => void
  useNewPOQ: boolean
  txDebugStartTiming: (queueEntry: QueueEntry, tag: string) => void
  txDebugEndTiming: (queueEntry: QueueEntry, tag: string) => void
  p2p: P2PModuleContext
  config: Shardus.StrictServerConfiguration
  factValidateCorrespondingTellSender: (queueEntry: QueueEntry, accountId: string, senderId: string) => boolean
  validateCorrespondingTellSender: (queueEntry: QueueEntry, dataKey: string, senderNodeId: string) => boolean
  crypto: any
  broadcastState: (nodes: Shardus.Node[], message: { stateList: Shardus.WrappedResponse[]; txid: string }, context: string) => Promise<void>
  statemanager_fatal: (key: string, log: string) => void
  getStartAndEndIndexOfTargetGroup: (targetGroup: string[], transactionGroup: any[]) => { startIndex: number; endIndex: number }
  executeInOneShard: boolean
  getStorageGroupForAccount: (accountId: string) => any[]
  seqLogger: any
}

export const factMethods = {
     /**
   * tellCorrespondingNodes
   * @param queueEntry
   * -sends account data to the correct involved nodees
   * -loads locally available data into the queue entry
   */
  async tellCorrespondingNodes(this: TransactionQueueContext, queueEntry: QueueEntry): Promise<unknown> {
    if (this.stateManager.currentCycleShardData == null) {
      throw new Error('tellCorrespondingNodes: currentCycleShardData == null')
    }
    if (queueEntry.uniqueKeys == null) {
      throw new Error('tellCorrespondingNodes: queueEntry.uniqueKeys == null')
    }
    // Report data to corresponding nodes
    const ourNodeData = this.stateManager.currentCycleShardData.nodeShardData
    // let correspondingEdgeNodes = []
    let correspondingAccNodes: Shardus.Node[] = []
    const dataKeysWeHave = []
    const dataValuesWeHave = []
    const datas: { [accountID: string]: Shardus.WrappedResponse } = {}
    const remoteShardsByKey: { [accountID: string]: StateManagerTypes.shardFunctionTypes.NodeShardData } = {} // shard homenodes that we do not have the data for.
    let loggedPartition = false
    for (const key of queueEntry.uniqueKeys) {
      ///   test here
      // let hasKey = ShardFunctions.testAddressInRange(key, ourNodeData.storedPartitions)
      // todo : if this works maybe a nicer or faster version could be used
      let hasKey = false
      // eslint-disable-next-line security/detect-object-injection
      const homeNode = queueEntry.homeNodes[key]
      if (homeNode.node.id === ourNodeData.node.id) {
        hasKey = true
      } else {
        //perf todo: this seems like a slow calculation, coult improve this
        for (const node of homeNode.nodeThatStoreOurParitionFull) {
          if (node.id === ourNodeData.node.id) {
            hasKey = true
            break
          }
        }
      }

      // HOMENODEMATHS tellCorrespondingNodes patch the value of hasKey
      // did we get patched in
      if (queueEntry.patchedOnNodes.has(ourNodeData.node.id)) {
        hasKey = true
      }

      // for(let patchedNodeID of queueEntry.patchedOnNodes.values()){
      // }

      let isGlobalKey = false
      //intercept that we have this data rather than requesting it.
      if (this.stateManager.accountGlobals.isGlobalAccount(key)) {
        hasKey = true
        isGlobalKey = true
        /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('globalAccountMap', queueEntry.logID, `tellCorrespondingNodes - has`)
      }

      if (hasKey === false) {
        if (loggedPartition === false) {
          loggedPartition = true
          /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`tellCorrespondingNodes hasKey=false: ${utils.stringifyReduce(homeNode.nodeThatStoreOurParitionFull.map((v) => v.id))}`)
          /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`tellCorrespondingNodes hasKey=false: full: ${utils.stringifyReduce(homeNode.nodeThatStoreOurParitionFull)}`)
        }
        /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`tellCorrespondingNodes hasKey=false  key: ${utils.stringifyReduce(key)}`)
      }

      if (hasKey) {
        // TODO PERF is it possible that this query could be used to update our in memory cache? (this would save us from some slow look ups) later on
        //    when checking timestamps.. alternatively maybe there is a away we can note the timestamp with what is returned here in the queueEntry data
        //    and not have to deal with the cache.
        // todo old: Detect if our node covers this paritition..  need our partition data

        this.profiler.profileSectionStart('process_dapp.getRelevantData')
        this.profiler.scopedProfileSectionStart('process_dapp.getRelevantData')
        /* prettier-ignore */ this.setDebugLastAwaitedCallInner('this.stateManager.transactionQueue.app.getRelevantData')
        let data = await this.app.getRelevantData(key, queueEntry.acceptedTx.data, queueEntry.acceptedTx.appData)
        /* prettier-ignore */ this.setDebugLastAwaitedCallInner('this.stateManager.transactionQueue.app.getRelevantData', DebugComplete.Completed)
        this.profiler.scopedProfileSectionEnd('process_dapp.getRelevantData')
        this.profiler.profileSectionEnd('process_dapp.getRelevantData')

        //only queue this up to share if it is not a global account. global accounts dont need to be shared.

        // not sure if it is correct to update timestamp like this.
        // if(data.timestamp === 0){
        //   data.timestamp = queueEntry.acceptedTx.timestamp
        // }

        //if this is not freshly created data then we need to make a backup copy of it!!
        //This prevents us from changing data before the commiting phase
        if (data.accountCreated == false) {
          data = utils.deepCopy(data)
        }

        if (isGlobalKey === false) {
          // eslint-disable-next-line security/detect-object-injection
          datas[key] = data
          dataKeysWeHave.push(key)
          dataValuesWeHave.push(data)
        }

        // eslint-disable-next-line security/detect-object-injection
        queueEntry.localKeys[key] = true
        // add this data to our own queue entry!!
        this.queueEntryAddData(queueEntry, data, false)
      } else {
        // eslint-disable-next-line security/detect-object-injection
        remoteShardsByKey[key] = queueEntry.homeNodes[key]
      }
    }
    if (queueEntry.globalModification === true) {
      /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('tellCorrespondingNodes', queueEntry.logID, `tellCorrespondingNodes - globalModification = true, not telling other nodes`)
      return
    }

    let message: { stateList: Shardus.WrappedResponse[]; txid: string }
    let edgeNodeIds = []
    let consensusNodeIds = []

    const nodesToSendTo: StringNodeObjectMap = {}
    const doOnceNodeAccPair = new Set<string>() //can skip  node+acc if it happens more than once.

    for (const key of queueEntry.uniqueKeys) {
      // eslint-disable-next-line security/detect-object-injection
      if (datas[key] != null) {
        for (const key2 of queueEntry.uniqueKeys) {
          if (key !== key2) {
            // eslint-disable-next-line security/detect-object-injection
            const localHomeNode = queueEntry.homeNodes[key]
            // eslint-disable-next-line security/detect-object-injection
            const remoteHomeNode = queueEntry.homeNodes[key2]

            const ourLocalConsensusIndex = localHomeNode.consensusNodeForOurNodeFull.findIndex(
              (a) => a.id === ourNodeData.node.id
            )
            if (ourLocalConsensusIndex === -1) {
              continue
            }

            edgeNodeIds = []
            consensusNodeIds = []
            correspondingAccNodes = []

            const ourSendingGroupSize = localHomeNode.consensusNodeForOurNodeFull.length

            const targetConsensusGroupSize = remoteHomeNode.consensusNodeForOurNodeFull.length
            const targetEdgeGroupSize = remoteHomeNode.edgeNodes.length
            const pachedListSize = remoteHomeNode.patchedOnNodes.length

            // must add one to each lookup index!
            const indicies = ShardFunctions.debugFastStableCorrespondingIndicies(
              ourSendingGroupSize,
              targetConsensusGroupSize,
              ourLocalConsensusIndex + 1
            )
            const edgeIndicies = ShardFunctions.debugFastStableCorrespondingIndicies(
              ourSendingGroupSize,
              targetEdgeGroupSize,
              ourLocalConsensusIndex + 1
            )

            let patchIndicies = []
            if (remoteHomeNode.patchedOnNodes.length > 0) {
              patchIndicies = ShardFunctions.debugFastStableCorrespondingIndicies(
                ourSendingGroupSize,
                remoteHomeNode.patchedOnNodes.length,
                ourLocalConsensusIndex + 1
              )
            }

            // for each remote node lets save it's id
            for (const index of indicies) {
              const targetNode = remoteHomeNode.consensusNodeForOurNodeFull[index - 1] // fastStableCorrespondingIndicies is one based so adjust for 0 based array
              //only send data to the execution group
              if (queueEntry.executionGroupMap.has(targetNode.id) === false) {
                continue
              }

              if (targetNode != null && targetNode.id !== ourNodeData.node.id) {
                nodesToSendTo[targetNode.id] = targetNode
                consensusNodeIds.push(targetNode.id)
              }
            }
            for (const index of edgeIndicies) {
              const targetNode = remoteHomeNode.edgeNodes[index - 1] // fastStableCorrespondingIndicies is one based so adjust for 0 based array
              if (targetNode != null && targetNode.id !== ourNodeData.node.id) {
                //only send data to the execution group
                if (queueEntry.executionGroupMap.has(targetNode.id) === false) {
                  continue
                }
                nodesToSendTo[targetNode.id] = targetNode
                edgeNodeIds.push(targetNode.id)
              }
            }

            for (const index of patchIndicies) {
              const targetNode = remoteHomeNode.edgeNodes[index - 1] // fastStableCorrespondingIndicies is one based so adjust for 0 based array
              //only send data to the execution group
              if (queueEntry.executionGroupMap.has(targetNode.id) === false) {
                continue
              }
              if (targetNode != null && targetNode.id !== ourNodeData.node.id) {
                nodesToSendTo[targetNode.id] = targetNode
                //edgeNodeIds.push(targetNode.id)
              }
            }

            const dataToSend = []
            // eslint-disable-next-line security/detect-object-injection
            dataToSend.push(datas[key]) // only sending just this one key at a time

            // sign each account data
            for (let data of dataToSend) {
              data = this.crypto.sign(data)
            }

            message = { stateList: dataToSend, txid: queueEntry.acceptedTx.txId }

            //build correspondingAccNodes, but filter out nodeid, account key pairs we have seen before
            for (const [accountID, node] of Object.entries(nodesToSendTo)) {
              const keyPair = accountID + key
              if (node != null && doOnceNodeAccPair.has(keyPair) === false) {
                doOnceNodeAccPair.add(keyPair)
                correspondingAccNodes.push(node)
              }
            }

            /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) this.logger.playbackLogNote('tellCorrespondingNodes', queueEntry.logID, `tellCorrespondingNodes nodesToSendTo:${Object.keys(nodesToSendTo).length} doOnceNodeAccPair:${doOnceNodeAccPair.size} indicies:${Utils.safeStringify(indicies)} edgeIndicies:${Utils.safeStringify(edgeIndicies)} patchIndicies:${Utils.safeStringify(patchIndicies)}  doOnceNodeAccPair: ${Utils.safeStringify([...doOnceNodeAccPair.keys()])} ourLocalConsensusIndex:${ourLocalConsensusIndex} ourSendingGroupSize:${ourSendingGroupSize} targetEdgeGroupSize:${targetEdgeGroupSize} targetEdgeGroupSize:${targetEdgeGroupSize} pachedListSize:${pachedListSize}`)

            if (correspondingAccNodes.length > 0) {
              const remoteRelation = ShardFunctions.getNodeRelation(
                remoteHomeNode,
                this.stateManager.currentCycleShardData.ourNode.id
              )
              const localRelation = ShardFunctions.getNodeRelation(
                localHomeNode,
                this.stateManager.currentCycleShardData.ourNode.id
              )
              /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('shrd_tellCorrespondingNodes', `${queueEntry.acceptedTx.txId}`, `remoteRel: ${remoteRelation} localrel: ${localRelation} qId: ${queueEntry.entryID} AccountBeingShared: ${utils.makeShortHash(key)} EdgeNodes:${utils.stringifyReduce(edgeNodeIds)} ConsesusNodes${utils.stringifyReduce(consensusNodeIds)}`)

              // Filter nodes before we send tell()
              const filteredNodes = this.stateManager.filterValidNodesForInternalMessage(
                correspondingAccNodes,
                'tellCorrespondingNodes',
                true,
                true
              )
              if (filteredNodes.length === 0) {
                /* prettier-ignore */ if (logFlags.error) this.mainLogger.error('tellCorrespondingNodes: filterValidNodesForInternalMessage no valid nodes left to try')
                return null
              }
              const filterdCorrespondingAccNodes = filteredNodes

              this.broadcastState(filterdCorrespondingAccNodes, message, 'tellCorrespondingNodes')
            }
          }
        }
      }
    }
  },

  async factTellCorrespondingNodes(this: TransactionQueueContext, queueEntry: QueueEntry): Promise<unknown> {
    try {
      let cycleShardData = this.stateManager.currentCycleShardData
      if (Context.config.stateManager.deterministicTXCycleEnabled) {
        cycleShardData = this.stateManager.shardValuesByCycle.get(queueEntry.txGroupCycle)
      }
      if (cycleShardData == null) {
        throw new Error('factTellCorrespondingNodes: cycleShardData == null')
      }
      if (queueEntry.uniqueKeys == null) {
        throw new Error('factTellCorrespondingNodes: queueEntry.uniqueKeys == null')
      }
      const ourNodeData = cycleShardData.nodeShardData
      const dataKeysWeHave = []
      const dataValuesWeHave = []
      const datas: { [accountID: string]: Shardus.WrappedResponse } = {}
      const remoteShardsByKey: { [accountID: string]: StateManagerTypes.shardFunctionTypes.NodeShardData } = {} // shard homenodes that we do not have the data for.
      let loggedPartition = false
      for (const key of queueEntry.uniqueKeys) {
        let hasKey = ShardFunctions.testAddressInRange(key, ourNodeData.storedPartitions)

        // HOMENODEMATHS factTellCorrespondingNodes patch the value of hasKey
        // did we get patched in
        if (queueEntry.patchedOnNodes.has(ourNodeData.node.id)) {
          hasKey = true
        }

        let isGlobalKey = false
        //intercept that we have this data rather than requesting it.
        if (this.stateManager.accountGlobals.isGlobalAccount(key)) {
          hasKey = true
          isGlobalKey = true
          /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('globalAccountMap', queueEntry.logID, `factTellCorrespondingNodes - has`)
        }

        if (hasKey === false) {
          if (loggedPartition === false) {
            loggedPartition = true
            /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`factTellCorrespondingNodes hasKey=false`)
          }
          /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`factTellCorrespondingNodes hasKey=false  key: ${utils.stringifyReduce(key)}`)
        }

        if (hasKey) {
          // TODO PERF is it possible that this query could be used to update our in memory cache? (this would save us from some slow look ups) later on
          //    when checking timestamps.. alternatively maybe there is a away we can note the timestamp with what is returned here in the queueEntry data
          //    and not have to deal with the cache.
          // todo old: Detect if our node covers this paritition..  need our partition data

          this.profiler.profileSectionStart('process_dapp.getRelevantData')
          this.profiler.scopedProfileSectionStart('process_dapp.getRelevantData')
          /* prettier-ignore */ this.setDebugLastAwaitedCallInner('this.stateManager.transactionQueue.app.getRelevantData')
          let data = await this.app.getRelevantData(key, queueEntry.acceptedTx.data, queueEntry.acceptedTx.appData)
          /* prettier-ignore */ this.setDebugLastAwaitedCallInner('this.stateManager.transactionQueue.app.getRelevantData', DebugComplete.Completed)
          this.profiler.scopedProfileSectionEnd('process_dapp.getRelevantData')
          this.profiler.profileSectionEnd('process_dapp.getRelevantData')

          //if this is not freshly created data then we need to make a backup copy of it!!
          //This prevents us from changing data before the commiting phase
          if (data.accountCreated == false) {
            data = utils.deepCopy(data)
          }

          //only queue this up to share if it is not a global account. global accounts dont need to be shared.
          if (isGlobalKey === false) {
            // eslint-disable-next-line security/detect-object-injection
            datas[key] = data
            dataKeysWeHave.push(key)
            dataValuesWeHave.push(data)
          }

          // eslint-disable-next-line security/detect-object-injection
          queueEntry.localKeys[key] = true
          // add this data to our own queue entry!!
          this.queueEntryAddData(queueEntry, data, false)
        } else {
          // eslint-disable-next-line security/detect-object-injection
          remoteShardsByKey[key] = queueEntry.homeNodes[key]
        }
      }
      if (queueEntry.globalModification === true) {
        /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('factTellCorrespondingNodes', queueEntry.logID, `factTellCorrespondingNodes - globalModification = true, not telling other nodes`)
        return
      }

      const payload: { stateList: Shardus.WrappedResponse[]; txid: string } = {
        stateList: [],
        txid: queueEntry.acceptedTx.txId,
      }
      for (const key of queueEntry.uniqueKeys) {
        // eslint-disable-next-line security/detect-object-injection
        if (datas[key] != null) {
          // eslint-disable-next-line security/detect-object-injection
          payload.stateList.push(datas[key]) // only sending just this one key at a time
        }
      }
      // sign each account data
      const signedPayload = this.crypto.sign(payload)

      // prepare inputs to get corresponding indices
      const ourIndexInTxGroup = queueEntry.ourTXGroupIndex
      const targetGroup = queueEntry.executionNodeIdSorted
      const targetGroupSize = targetGroup.length
      const senderGroupSize = targetGroupSize

      // calculate target start and end indices in txGroup
      const targetIndices = this.getStartAndEndIndexOfTargetGroup(targetGroup, queueEntry.transactionGroup)
      const unwrappedIndex = queueEntry.isSenderWrappedTxGroup[Self.id]

      // temp logs
      if (logFlags.verbose) {
        this.mainLogger.debug(`factTellCorrespondingNodes: target group size`, targetGroup.length, targetGroup)
        this.mainLogger.debug(
          `factTellCorrespondingNodes: tx group size`,
          queueEntry.transactionGroup.length,
          queueEntry.transactionGroup.map((n) => n.id)
        )
        this.mainLogger.debug(
          `factTellCorrespondingNodes: getting corresponding indices for tx: ${queueEntry.logID}`,
          ourIndexInTxGroup,
          targetIndices.startIndex,
          targetIndices.endIndex,
          queueEntry.correspondingGlobalOffset,
          targetGroupSize,
          senderGroupSize,
          queueEntry.transactionGroup.length
        )
        this.mainLogger.debug(`factTellCorrespondingNodes: target group indices`, targetIndices)
      }

      let correspondingIndices = getCorrespondingNodes(
        ourIndexInTxGroup,
        targetIndices.startIndex,
        targetIndices.endIndex,
        queueEntry.correspondingGlobalOffset,
        targetGroupSize,
        senderGroupSize,
        queueEntry.transactionGroup.length
      )
      let oldCorrespondingIndices: number[] = undefined
      if (this.config.stateManager.correspondingTellUseUnwrapped) {
        // can just find if any home nodes for the accounts we cover would say that our node is wrapped
        // precalc shouldUnwrapSender   check if any account we own shows that we are on the left side of a wrapped range
        // can use partitions to check this
        if (unwrappedIndex != null) {
          const extraCorrespondingIndices = getCorrespondingNodes(
            unwrappedIndex,
            targetIndices.startIndex,
            targetIndices.endIndex,
            queueEntry.correspondingGlobalOffset,
            targetGroupSize,
            senderGroupSize,
            queueEntry.transactionGroup.length,
            queueEntry.logID
          )
          if (Context.config.stateManager.concatCorrespondingTellUseUnwrapped) {
            //add them
            correspondingIndices = correspondingIndices.concat(extraCorrespondingIndices)
          } else {
            // replace them
            oldCorrespondingIndices = correspondingIndices
            correspondingIndices = extraCorrespondingIndices
          }
          //replace them
          // possible optimization where we pick one or the other path based on our account index
          //correspondingIndices = extraCorrespondingIndices
        }
      }
      // check if we should avoid our index in the corresponding nodes
      if (Context.config.stateManager.avoidOurIndexInFactTell && correspondingIndices.includes(ourIndexInTxGroup)) {
        if (logFlags.debug)
          this.mainLogger.debug(
            `factTellCorrespondingNodes: avoiding our index in tx group`,
            ourIndexInTxGroup,
            correspondingIndices
          )
        queueEntry.correspondingGlobalOffset += 1
        nestedCountersInstance.countEvent('stateManager', 'factTellCorrespondingNodes: avoiding our index in tx group')
        correspondingIndices = getCorrespondingNodes(
          ourIndexInTxGroup,
          targetIndices.startIndex,
          targetIndices.endIndex,
          queueEntry.correspondingGlobalOffset,
          targetGroupSize,
          senderGroupSize,
          queueEntry.transactionGroup.length
        )
        let oldCorrespondingIndices: number[] = undefined
        if (this.config.stateManager.correspondingTellUseUnwrapped) {
          // can just find if any home nodes for the accounts we cover would say that our node is wrapped
          // precalc shouldUnwrapSender   check if any account we own shows that we are on the left side of a wrapped range
          // can use partitions to check this
          if (unwrappedIndex != null) {
            const extraCorrespondingIndices = getCorrespondingNodes(
              unwrappedIndex,
              targetIndices.startIndex,
              targetIndices.endIndex,
              queueEntry.correspondingGlobalOffset,
              targetGroupSize,
              senderGroupSize,
              queueEntry.transactionGroup.length,
              queueEntry.logID
            )
            if (Context.config.stateManager.concatCorrespondingTellUseUnwrapped) {
              //add them
              correspondingIndices = correspondingIndices.concat(extraCorrespondingIndices)
            } else {
              // replace them
              oldCorrespondingIndices = correspondingIndices
              correspondingIndices = extraCorrespondingIndices
            }
            //replace them
            // possible optimization where we pick one or the other path based on our account index
            //correspondingIndices = extraCorrespondingIndices
          }
        }
        if (logFlags.debug)
          this.mainLogger.debug(
            `factTellCorrespondingNodes: new corresponding indices after avoiding our index in tx group`,
            ourIndexInTxGroup,
            correspondingIndices
          )
      }

      const validCorrespondingIndices = []
      for (const targetIndex of correspondingIndices) {
        validCorrespondingIndices.push(targetIndex)

        // if (logFlags.debug) {
        //   //  debug verification code
        //   const isValid = verifyCorrespondingSender(targetIndex, ourIndexInTxGroup, queueEntry.correspondingGlobalOffset, targetGroupSize, senderGroupSize, targetIndices.startIndex, targetIndices.endIndex, queueEntry.transactionGroup.length)
        //   if (logFlags.debug) this.mainLogger.debug(`factTellCorrespondingNodes: debug verifyCorrespondingSender`, ourIndexInTxGroup, '->', targetIndex, isValid);
        // }
      }

      const correspondingNodes = []
      for (const index of validCorrespondingIndices) {
        if (index === ourIndexInTxGroup) {
          continue
        }
        const targetNode = queueEntry.transactionGroup[index]
        let targetHasOurData = false

        if (this.config.stateManager.filterReceivingNodesForTXData) {
          targetHasOurData = true
          for (const wrappedResponse of signedPayload.stateList) {
            const accountId = wrappedResponse.accountId
            const targetNodeShardData = cycleShardData.nodeShardDataMap.get(targetNode.id)
            if (targetNodeShardData == null) {
              targetHasOurData = false
              break
            }
            const targetHasKey = ShardFunctions.testAddressInRange(accountId, targetNodeShardData.storedPartitions)
            if (targetHasKey === false) {
              targetHasOurData = false
              break
            }
          }
        }

        // send only if target needs our data
        if (targetHasOurData === false) {
          correspondingNodes.push(targetNode)
        }
      }

      const callParams = {
        oi: unwrappedIndex ?? ourIndexInTxGroup,
        st: targetIndices.startIndex,
        et: targetIndices.endIndex,
        gl: queueEntry.correspondingGlobalOffset,
        tg: targetGroupSize,
        sg: senderGroupSize,
        tn: queueEntry.transactionGroup.length,
      }

      /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`factTellCorrespondingNodes: correspondingIndices and nodes ${queueEntry.logID}`, ourIndexInTxGroup, correspondingIndices, correspondingNodes.map(n => n.id), callParams)
      queueEntry.txDebug.correspondingDebugInfo = {
        ourIndex: ourIndexInTxGroup,
        ourUnwrappedIndex: unwrappedIndex,
        callParams,
        localKeys: queueEntry.localKeys,
        oldCorrespondingIndices,
        correspondingIndices: correspondingIndices,
        correspondingNodeIds: correspondingNodes.map((n) => n.id),
      }
      if (correspondingNodes.length === 0) {
        nestedCountersInstance.countEvent(
          'stateManager',
          'factTellCorrespondingNodes: no corresponding nodes needed to send'
        )
        return
      }
      // Filter nodes before we send tell()
      const filteredNodes = this.stateManager.filterValidNodesForInternalMessage(
        correspondingNodes,
        'factTellCorrespondingNodes',
        true,
        true
      )
      if (filteredNodes.length === 0) {
        /* prettier-ignore */ if (logFlags.error) this.mainLogger.error("factTellCorrespondingNodes: filterValidNodesForInternalMessage no valid nodes left to try");
        nestedCountersInstance.countEvent(
          'stateManager',
          'factTellCorrespondingNodes: no corresponding nodes needed to send'
        )
        return null
      }
      if (payload.stateList.length === 0) {
        /* prettier-ignore */ if (logFlags.error) this.mainLogger.error("factTellCorrespondingNodes: filterValidNodesForInternalMessage payload.stateList.length === 0");
        nestedCountersInstance.countEvent('stateManager', 'factTellCorrespondingNodes: payload.stateList.length === 0')
        return null
      }
      // send payload to each node in correspondingNodes
      this.broadcastState(filteredNodes, payload, 'factTellCorrespondingNodes')
    } catch (error) {
      /* prettier-ignore */ this.statemanager_fatal( `factTellCorrespondingNodes_ex`, 'factTellCorrespondingNodes' + utils.formatErrorMessage(error) )
    }
  },

  validateCorrespondingTellSender(this: TransactionQueueContext, queueEntry: QueueEntry, dataKey: string, senderNodeId: string): boolean {
    /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`validateCorrespondingTellSender: data key: ${dataKey} sender node id: ${senderNodeId}`)
    const receiverNode = this.stateManager.currentCycleShardData.nodeShardData
    if (receiverNode == null) return false

    const receiverIsInExecutionGroup = queueEntry.executionGroupMap.has(receiverNode.node.id)

    const senderNode = this.stateManager.currentCycleShardData.nodeShardDataMap.get(senderNodeId)
    if (senderNode === null) return false

    const senderHasAddress = ShardFunctions.testAddressInRange(dataKey, senderNode.storedPartitions)

    if (configContext.stateManager.shareCompleteData) {
      const senderIsInExecutionGroup = queueEntry.executionGroupMap.has(senderNodeId)

      // check if sender is an execution neighouring node
      const neighbourNodes = utils.selectNeighbors(
        queueEntry.executionGroup,
        queueEntry.ourExGroupIndex,
        2
      ) as Shardus.Node[]
      const neighbourNodeIds = neighbourNodes.map((node) => node.id)
      if (senderIsInExecutionGroup && neighbourNodeIds.includes(senderNodeId) === false) {
        this.mainLogger.error(`validateCorrespondingTellSender: sender is an execution node but not a neighbour node`)
        return false
      }
      if (senderIsInExecutionGroup)
        nestedCountersInstance.countEvent(
          'stateManager',
          'validateCorrespondingTellSender: sender is an execution node'
        )
      else
        nestedCountersInstance.countEvent(
          'stateManager',
          'validateCorrespondingTellSender: sender is not an execution node'
        )

      /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`validateCorrespondingTellSender: data key: ${dataKey} sender node id: ${senderNodeId} senderHasAddress: ${senderHasAddress} receiverIsInExecutionGroup: ${receiverIsInExecutionGroup} senderIsInExecutionGroup: ${senderIsInExecutionGroup}`)
      if (receiverIsInExecutionGroup === true || senderHasAddress === true || senderIsInExecutionGroup === true) {
        return true
      }
    } else {
      /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`validateCorrespondingTellSender: data key: ${dataKey} sender node id: ${senderNodeId} senderHasAddress: ${senderHasAddress} receiverIsInExecutionGroup: ${receiverIsInExecutionGroup}`)
      if (receiverIsInExecutionGroup === true || senderHasAddress === true) {
        return true
      }
    }

    return false
  },

  factValidateCorrespondingTellSender(this: TransactionQueueContext, queueEntry: QueueEntry, dataKey: string, senderNodeId: string): boolean {
    /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`factValidateCorrespondingTellSender: txId: ${queueEntry.acceptedTx.txId} sender node id: ${senderNodeId}, receiver id: ${Self.id}`)
    let cycleShardData = this.stateManager.currentCycleShardData
    if (Context.config.stateManager.deterministicTXCycleEnabled) {
      cycleShardData = this.stateManager.shardValuesByCycle.get(queueEntry.txGroupCycle)
    }
    const receiverNodeShardData = cycleShardData.nodeShardData
    if (receiverNodeShardData == null) {
      this.mainLogger.error(
        `factValidateCorrespondingTellSender: logID: ${queueEntry.logID} receiverNodeShardData == null, txGroupCycle: ${queueEntry.txGroupCycle}}`
      )
      nestedCountersInstance.countEvent(
        'stateManager',
        'factValidateCorrespondingTellSender: receiverNodeShardData == null'
      )
      return false
    }

    const senderNodeShardData = cycleShardData.nodeShardDataMap.get(senderNodeId)
    if (senderNodeShardData === null) {
      this.mainLogger.error(
        `factValidateCorrespondingTellSender: logID: ${queueEntry.logID} senderNodeShardData == null, txGroupCycle: ${queueEntry.txGroupCycle}}`
      )
      nestedCountersInstance.countEvent(
        'stateManager',
        'factValidateCorrespondingTellSender: senderNodeShardData == null'
      )
      return false
    }
    const senderHasAddress = ShardFunctions.testAddressInRange(dataKey, senderNodeShardData.storedPartitions)

    // check if it is a FACT sender
    const receivingNodeIndex = queueEntry.ourTXGroupIndex // we are the receiver
    const senderNodeIndex = queueEntry.transactionGroup.findIndex((node) => node.id === senderNodeId)
    let wrappedSenderNodeIndex = null
    if (queueEntry.isSenderWrappedTxGroup[senderNodeId] != null) {
      wrappedSenderNodeIndex = queueEntry.isSenderWrappedTxGroup[senderNodeId]
    }
    const receiverGroupSize = queueEntry.executionNodeIdSorted.length
    const senderGroupSize = receiverGroupSize

    const targetGroup = queueEntry.executionNodeIdSorted
    const targetIndices = this.getStartAndEndIndexOfTargetGroup(targetGroup, queueEntry.transactionGroup)

    /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`factValidateCorrespondingTellSender: txId: ${queueEntry.acceptedTx.txId} sender node id: ${senderNodeId}, receiver id: ${Self.id} senderHasAddress: ${senderHasAddress} receivingNodeIndex: ${receivingNodeIndex} senderNodeIndex: ${senderNodeIndex} receiverGroupSize: ${receiverGroupSize} senderGroupSize: ${senderGroupSize} targetIndices: ${utils.stringifyReduce(targetIndices)}`)

    let isValidFactSender = verifyCorrespondingSender(
      receivingNodeIndex,
      senderNodeIndex,
      queueEntry.correspondingGlobalOffset,
      receiverGroupSize,
      senderGroupSize,
      targetIndices.startIndex,
      targetIndices.endIndex,
      queueEntry.transactionGroup.length,
      false,
      queueEntry.logID
    )
    if (isValidFactSender === false && wrappedSenderNodeIndex != null && wrappedSenderNodeIndex >= 0) {
      // try again with wrapped sender index
      isValidFactSender = verifyCorrespondingSender(
        receivingNodeIndex,
        wrappedSenderNodeIndex,
        queueEntry.correspondingGlobalOffset,
        receiverGroupSize,
        senderGroupSize,
        targetIndices.startIndex,
        targetIndices.endIndex,
        queueEntry.transactionGroup.length,
        false,
        queueEntry.logID
      )
    }
    // it maybe a FACT sender but sender does not cover the account
    if (senderHasAddress === false) {
      this.mainLogger.error(
        `factValidateCorrespondingTellSender: logId: ${queueEntry.logID} sender does not have the address and is not a exe neighbour`
      )
      nestedCountersInstance.countEvent(
        'stateManager',
        'factValidateCorrespondingTellSender: sender does not have the address and is not a exe; neighbour'
      )
      return false
    }

    // it is neither a FACT corresponding node nor an exe neighbour node
    if (isValidFactSender === false) {
      this.mainLogger.error(
        `factValidateCorrespondingTellSender: logId: ${queueEntry.logID} sender is neither a valid sender nor a neighbour node isValidSender:  ${isValidFactSender}`
      )
      nestedCountersInstance.countEvent(
        'stateManager',
        'factValidateCorrespondingTellSender: sender is not a valid sender or a neighbour node'
      )
      return false
    }
    return true
  },

  getStartAndEndIndexOfTargetGroup(this: TransactionQueueContext,
    targetGroup: string[],
    transactionGroup: (Shardus.NodeWithRank | P2PTypes.NodeListTypes.Node)[]
  ): { startIndex: number; endIndex: number } {
    const targetIndexes: number[] = []
    for (let i = 0; i < transactionGroup.length; i++) {
      const nodeId = transactionGroup[i].id
      if (targetGroup.indexOf(nodeId) >= 0) {
        targetIndexes.push(i)
      }
    }
    if (logFlags.verbose) this.mainLogger.debug(`getStartAndEndIndexOfTargetGroup: all target indexes`, targetIndexes)
    const n = targetIndexes.length
    let startIndex = targetIndexes[0]
    // Find the pivot where the circular array starts
    for (let i = 1; i < n; i++) {
      if (targetIndexes[i] > targetIndexes[i - 1] + 1) {
        startIndex = targetIndexes[i]
        break
      }
    }
    let endIndex = startIndex + n
    if (endIndex > transactionGroup.length) {
      endIndex = endIndex - transactionGroup.length
    }
    return { startIndex, endIndex }
  },

  factTellCorrespondingNodesFinalData(this: TransactionQueueContext, queueEntry: QueueEntry): void {
    profilerInstance.profileSectionStart('factTellCorrespondingNodesFinalData', true)
    /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('factTellCorrespondingNodesFinalData', queueEntry.logID, `factTellCorrespondingNodesFinalData - start: ${queueEntry.logID}`)

    if (this.stateManager.currentCycleShardData == null) {
      throw new Error('factTellCorrespondingNodesFinalData: currentCycleShardData == null')
    }
    if (queueEntry.uniqueKeys == null) {
      throw new Error('factTellCorrespondingNodesFinalData: queueEntry.uniqueKeys == null')
    }
    if (queueEntry.globalModification === true) {
      throw new Error('factTellCorrespondingNodesFinalData globalModification === true')
    }

    if (this.executeInOneShard && queueEntry.isInExecutionHome === false) {
      throw new Error('factTellCorrespondingNodesFinalData isInExecutionHome === false')
    }
    if (queueEntry.executionShardKey == null || queueEntry.executionShardKey == '') {
      throw new Error('factTellCorrespondingNodesFinalData executionShardKey == null or empty')
    }
    if (queueEntry.preApplyTXResult == null) {
      throw new Error('factTellCorrespondingNodesFinalData preApplyTXResult == null')
    }

    const datas: { [accountID: string]: Shardus.WrappedResponse } = {}

    const applyResponse = queueEntry.preApplyTXResult.applyResponse
    let wrappedStates = this.stateManager.useAccountWritesOnly ? {} : queueEntry.collectedData
    const writtenAccountsMap: WrappedResponses = {}
    if (applyResponse.accountWrites != null && applyResponse.accountWrites.length > 0) {
      for (const writtenAccount of applyResponse.accountWrites) {
        writtenAccountsMap[writtenAccount.accountId] = writtenAccount.data
        writtenAccountsMap[writtenAccount.accountId].prevStateId = wrappedStates[writtenAccount.accountId]
          ? wrappedStates[writtenAccount.accountId].stateId
          : ''
        writtenAccountsMap[writtenAccount.accountId].prevDataCopy = wrappedStates[writtenAccount.accountId]
          ? utils.deepCopy(writtenAccount.data)
          : {}

        datas[writtenAccount.accountId] = writtenAccount.data
      }
      //override wrapped states with writtenAccountsMap which should be more complete if it included
      wrappedStates = writtenAccountsMap
    }
    const keysToShare = Object.keys(wrappedStates)

    let message: { stateList: Shardus.WrappedResponse[]; txid: string }

    let totalShares = 0
    const targetStartIndex = 0
    const targetEndIndex = queueEntry.transactionGroup.length
    const targetGroupSize = queueEntry.transactionGroup.length

    const senderIndexInTxGroup = queueEntry.ourTXGroupIndex
    const senderGroupSize = queueEntry.executionGroup.length
    const unwrappedIndex = queueEntry.isSenderWrappedTxGroup[Self.id]

    let correspondingIndices = getCorrespondingNodes(
      senderIndexInTxGroup,
      targetStartIndex,
      targetEndIndex,
      queueEntry.correspondingGlobalOffset,
      targetGroupSize,
      senderGroupSize,
      queueEntry.transactionGroup.length,
      queueEntry.logID
    )

    if (this.config.stateManager.correspondingTellUseUnwrapped) {
      if (unwrappedIndex != null) {
        const extraCorrespondingIndices = getCorrespondingNodes(
          unwrappedIndex,
          targetStartIndex,
          targetEndIndex,
          queueEntry.correspondingGlobalOffset,
          targetGroupSize,
          senderGroupSize,
          queueEntry.transactionGroup.length,
          queueEntry.logID
        )
        if (Context.config.stateManager.concatCorrespondingTellUseUnwrapped) {
          correspondingIndices.concat(extraCorrespondingIndices)
        } else {
          correspondingIndices = extraCorrespondingIndices
        }
      }
    }

    for (const key of keysToShare) {
      // eslint-disable-next-line security/detect-object-injection
      if (wrappedStates[key] != null) {
        if (queueEntry.ourExGroupIndex === -1) {
          throw new Error(
            'factTellCorrespondingNodesFinalData: should never get here.  our sending node must be in the execution group'
          )
        }
        const storageNodesForAccount = this.getStorageGroupForAccount(key)
        const storageNodesAccountIds = new Set(storageNodesForAccount.map((node) => node.id))

        const correspondingNodes: P2PTypes.NodeListTypes.Node[] = []
        for (const index of correspondingIndices) {
          const node = queueEntry.transactionGroup[index]
          if (storageNodesAccountIds.has(node.id)) {
            correspondingNodes.push(node)
          }
        }

        //how can we be making so many calls??
        /* prettier-ignore */ if (logFlags.verbose) if (logFlags.playback) {
          this.logger.playbackLogNote('factTellCorrespondingNodesFinalData', queueEntry.logID, `factTellCorrespondingNodesFinalData ourIndex: ${senderIndexInTxGroup} correspondingIndices:${JSON.stringify(correspondingIndices)} correspondingNodes:${JSON.stringify(correspondingNodes.map(node => node.id))} for accounts: ${key}`)
        }

        const dataToSend: Shardus.WrappedResponse[] = []
        // eslint-disable-next-line security/detect-object-injection
        dataToSend.push(datas[key]) // only sending just this one key at a time
        message = { stateList: dataToSend, txid: queueEntry.acceptedTx.txId }
        if (correspondingNodes.length > 0) {
          // Filter nodes before we send tell()
          const filteredNodes = this.stateManager.filterValidNodesForInternalMessage(
            correspondingNodes,
            'factTellCorrespondingNodesFinalData',
            true,
            true
          )
          if (filteredNodes.length === 0) {
            /* prettier-ignore */ if (logFlags.error) this.mainLogger.error('factTellCorrespondingNodesFinalData: filterValidNodesForInternalMessage no valid nodes left to try')
            //return null
            continue
          }
          const filterdCorrespondingAccNodes = filteredNodes
          const filterNodesIpPort = filterdCorrespondingAccNodes.map(
            (node) => node.externalIp + ':' + node.externalPort
          )
          /* prettier-ignore */ if (logFlags.error) this.mainLogger.debug('tellcorrernodingnodesfinaldata', queueEntry.logID, ` : filterValidNodesForInternalMessage ${filterNodesIpPort} for accounts: ${utils.stringifyReduce(message.stateList)}`)
          // convert legacy message to binary supported type
          const request = message as BroadcastFinalStateReq
          if (logFlags.seqdiagram) {
            for (const node of filterdCorrespondingAccNodes) {
              /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455102 ${shardusGetTime()} tx:${message.txid} ${NodeList.activeIdToPartition.get(Self.id)}-->>${NodeList.activeIdToPartition.get(node.id)}: ${'broadcast_finalstate'}`)
            }
          }

          // if (this.usePOQo) {
          // && this.config.p2p.useBinarySerializedEndpoints && Context.config.p2p.poqoDataAndReceiptBinary) {
          Comms.tellBinary<PoqoDataAndReceiptReq>(
            filterdCorrespondingAccNodes,
            InternalRouteEnum.binary_poqo_data_and_receipt,
            {
              finalState: message,
              receipt: queueEntry.signedReceipt,
              txGroupCycle: queueEntry.txGroupCycle,
            },
            serializePoqoDataAndReceiptReq,
            {}
          )
          // } else if (this.usePOQo) {
          //   this.p2p.tell(
          //     filterdCorrespondingAccNodes,
          //     'poqo-data-and-receipt',
          //     {
          //       finalState: message,
          //       receipt: queueEntry.appliedReceipt2
          //     }
          //   )
          // } else //if (this.config.p2p.useBinarySerializedEndpoints && this.config.p2p.broadcastFinalStateBinary) {
          //   this.p2p.tellBinary<BroadcastFinalStateReq>(
          //     filterdCorrespondingAccNodes,
          //     InternalRouteEnum.binary_broadcast_finalstate,
          //     request,
          //     serializeBroadcastFinalStateReq,
          //     {
          //       verification_data: verificationDataCombiner(
          //         message.txid,
          //         message.stateList.length.toString()
          //       ),
          //     }
          //   )
          // } else {
          // this.p2p.tell(filterdCorrespondingAccNodes, 'broadcast_finalstate', message)
          // }
          totalShares++
        }
      }
    }

    nestedCountersInstance.countEvent('factTellCorrespondingNodesFinalData', 'totalShares', totalShares)
    /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`factTellCorrespondingNodesFinalData - end: ${queueEntry.logID} totalShares:${totalShares}`)
    profilerInstance.profileSectionEnd('factTellCorrespondingNodesFinalData', true)
  },

  factValidateCorrespondingTellFinalDataSender(this: TransactionQueueContext, queueEntry: QueueEntry, senderNodeId: string): boolean {
    /* prettier-ignore */ if (logFlags.verbose) this.mainLogger.debug(`factValidateCorrespondingTellFinalDataSender: txId: ${queueEntry.acceptedTx.txId} sender node id: ${senderNodeId}, receiver id: ${Self.id}`)
    const senderNode = NodeList.nodes.get(senderNodeId)
    if (senderNode === null) {
      /* prettier-ignore */ if(logFlags.error) this.mainLogger.error(`factValidateCorrespondingTellFinalDataSender: logId: ${queueEntry.logID} sender node is null`)
      nestedCountersInstance.countEvent(
        'stateManager',
        'factValidateCorrespondingTellFinalDataSender: sender node is null'
      )
      return false
    }
    const senderIsInExecutionGroup = queueEntry.executionGroupMap.has(senderNodeId)

    if (senderIsInExecutionGroup === false) {
      /* prettier-ignore */ if(logFlags.error) this.mainLogger.error(`factValidateCorrespondingTellFinalDataSender: logId: ${queueEntry.logID} sender is not in the execution group sender:${senderNodeId}`)
      nestedCountersInstance.countEvent(
        'stateManager',
        'factValidateCorrespondingTellFinalDataSender: sender is not in the execution group'
      )
      return false
    }

    let senderNodeIndex = queueEntry.transactionGroup.findIndex((node) => node.id === senderNodeId)
    if (queueEntry.isSenderWrappedTxGroup[senderNodeId] != null) {
      senderNodeIndex = queueEntry.isSenderWrappedTxGroup[senderNodeId]
    }
    const senderGroupSize = queueEntry.executionGroup.length

    const targetNodeIndex = queueEntry.ourTXGroupIndex // we are the receiver
    const targetGroupSize = queueEntry.transactionGroup.length
    const targetStartIndex = 0 // start of tx group
    const targetEndIndex = queueEntry.transactionGroup.length // end of tx group

    // check if it is a FACT sender
    const isValidFactSender = verifyCorrespondingSender(
      targetNodeIndex,
      senderNodeIndex,
      queueEntry.correspondingGlobalOffset,
      targetGroupSize,
      senderGroupSize,
      targetStartIndex,
      targetEndIndex,
      queueEntry.transactionGroup.length
    )

    // it is not a FACT corresponding node
    if (isValidFactSender === false) {
      /* prettier-ignore */ if(logFlags.error) this.mainLogger.error(`factValidateCorrespondingTellFinalDataSender: logId: ${queueEntry.logID} sender is not a valid sender isValidSender:  ${isValidFactSender}`);
      nestedCountersInstance.countEvent(
        'stateManager',
        'factValidateCorrespondingTellFinalDataSender: sender is not a valid sender or a neighbour node'
      )
      return false
    }
    return true
  },
  async shareCompleteDataToNeighbours(this: TransactionQueueContext, queueEntry: QueueEntry): Promise<void> {
      if (configContext.stateManager.shareCompleteData === false) {
        return
      }
      if (queueEntry.hasAll === false || queueEntry.sharedCompleteData) {
        return
      }
      if (queueEntry.isInExecutionHome === false) {
        return
      }
      const dataToShare: WrappedResponses = {}
      const stateList: Shardus.WrappedResponse[] = []
      for (const accountId in queueEntry.collectedData) {
        const data = queueEntry.collectedData[accountId]
        const riCacheResult = await this.app.getCachedRIAccountData([accountId])
        if (riCacheResult != null && riCacheResult.length > 0) {
          nestedCountersInstance.countEvent('shareCompleteDataToNeighbours', 'riCacheResult, skipping')
          continue
        } else {
          dataToShare[accountId] = data
          stateList.push(data)
        }
      }
      const payload = { txid: queueEntry.acceptedTx.txId, stateList }
      const neighboursNodes = utils.selectNeighbors(queueEntry.executionGroup, queueEntry.ourExGroupIndex, 2)
      if (stateList.length > 0) {
        this.broadcastState(neighboursNodes, payload, 'shareCompleteDataToNeighbours')
  
        queueEntry.sharedCompleteData = true
        nestedCountersInstance.countEvent(
          `queueEntryAddData`,
          `sharedCompleteData stateList: ${stateList.length} neighbours: ${neighboursNodes.length}`
        )
        if (logFlags.debug || this.stateManager.consensusLog) {
          this.mainLogger.debug(
            `shareCompleteDataToNeighbours: shared complete data for txId ${
              queueEntry.logID
            } at timestamp: ${shardusGetTime()} nodeId: ${Self.id} to neighbours: ${Utils.safeStringify(
              neighboursNodes.map((node) => node.id)
            )}`
          )
        }
      }
    },
  
    async gossipCompleteData(queueEntry: QueueEntry): Promise<void> {
      if (queueEntry.hasAll === false || queueEntry.gossipedCompleteData) {
        return
      }
      if (configContext.stateManager.gossipCompleteData === false) {
        return
      }
      const dataToGossip: WrappedResponses = {}
      const stateList: Shardus.WrappedResponse[] = []
      for (const accountId in queueEntry.collectedData) {
        const data = queueEntry.collectedData[accountId]
        const riCacheResult = await this.app.getCachedRIAccountData([accountId])
        if (riCacheResult != null && riCacheResult.length > 0) {
          nestedCountersInstance.countEvent('gossipCompleteData', 'riCacheResult, skipping')
          continue
        } else {
          dataToGossip[accountId] = data
          stateList.push(data)
        }
      }
      const payload = { txid: queueEntry.acceptedTx.txId, stateList }
      if (stateList.length > 0) {
        Comms.sendGossip(
          'broadcast_state_complete_data', // deprecated
          payload,
          '',
          Self.id,
          queueEntry.executionGroup,
          true,
          6,
          queueEntry.acceptedTx.txId
        )
        queueEntry.gossipedCompleteData = true
        nestedCountersInstance.countEvent('gossipCompleteData', `stateList: ${stateList.length}`)
        if (logFlags.debug || this.stateManager.consensusLog) {
          this.mainLogger.debug(
            `gossipQueueEntryData: gossiped data for txId ${queueEntry.logID} at timestamp: ${shardusGetTime()} nodeId: ${
              Self.id
            }`
          )
        }
      }
    },
    async broadcastState(
      nodes: Shardus.Node[],
      message: { stateList: Shardus.WrappedResponse[]; txid: string },
      context: string
    ): Promise<void> {
      // if (this.config.p2p.useBinarySerializedEndpoints && this.config.p2p.broadcastStateBinary) {
      // convert legacy message to binary supported type
      const request = message as BroadcastStateReq
      if (logFlags.seqdiagram) {
        for (const node of nodes) {
          if (context == 'tellCorrespondingNodes') {
            /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455102 ${shardusGetTime()} tx:${message.txid} ${NodeList.activeIdToPartition.get(Self.id)}-->>${NodeList.activeIdToPartition.get(node.id)}: ${'broadcast_state_nodes'}`)
          } else {
            /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455102 ${shardusGetTime()} tx:${message.txid} ${NodeList.activeIdToPartition.get(Self.id)}-->>${NodeList.activeIdToPartition.get(node.id)}: ${'broadcast_state_neighbour'}`)
          }
        }
      }
      Comms.tellBinary<BroadcastStateReq>(
        nodes,
        InternalRouteEnum.binary_broadcast_state,
        request,
        serializeBroadcastStateReq,
        {
          verification_data: verificationDataCombiner(
            message.txid,
            message.stateList.length.toString(),
            request.stateList[0].accountId
          ),
        }
      )
      // return
      // }
      // this.p2p.tell(nodes, 'broadcast_state', message)
    },    
  
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async requestFinalData(
      queueEntry: QueueEntry,
      accountIds: string[],
      nodesToAskKeys: string[] | null = null,
      includeAppReceiptData = false
    ): Promise<RequestFinalDataResp> {
      profilerInstance.profileSectionStart('requestFinalData')
      /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`requestFinalData: txid: ${queueEntry.logID} accountIds: ${utils.stringifyReduce(accountIds)}`);
      const message = { txid: queueEntry.acceptedTx.txId, accountIds, includeAppReceiptData }
      let success = false
      let successCount = 0
      let validAppReceiptData = includeAppReceiptData === false ? true : false
  
      // first check if we have received final data
      for (const accountId of accountIds) {
        // eslint-disable-next-line security/detect-object-injection
        if (queueEntry.collectedFinalData[accountId] != null) {
          successCount++
        }
      }
      if (successCount === accountIds.length && includeAppReceiptData === false) {
        nestedCountersInstance.countEvent('stateManager', 'requestFinalDataAlreadyReceived')
        /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`requestFinalData: txid: ${queueEntry.logID} already received all data`)
        // no need to request data
        return
      }
  
      try {
        let nodeToAsk: Shardus.Node
        if (nodesToAskKeys && nodesToAskKeys.length > 0) {
          const randomIndex = Math.floor(Math.random() * nodesToAskKeys.length)
          // eslint-disable-next-line security/detect-object-injection
          const randomNodeToAskKey = nodesToAskKeys[randomIndex]
          nodeToAsk = byPubKey.get(randomNodeToAskKey)
        } else {
          const randomIndex = Math.floor(Math.random() * queueEntry.executionGroup.length)
          // eslint-disable-next-line security/detect-object-injection
          const randomExeNode = queueEntry.executionGroup[randomIndex]
          nodeToAsk = nodes.get(randomExeNode.id)
        }
  
        if (!nodeToAsk) {
          /* prettier-ignore */ if (logFlags.error) this.mainLogger.error('requestFinalData: could not find node from execution group')
          throw new Error('requestFinalData: could not find node from execution group')
        }
  
        /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug( `requestFinalData: txid: ${queueEntry.acceptedTx.txId} accountIds: ${utils.stringifyReduce( accountIds )}, asking node: ${nodeToAsk.id} ${nodeToAsk.externalPort} at timestamp ${shardusGetTime()}` )
  
        // if (this.config.p2p.useBinarySerializedEndpoints && this.config.p2p.requestTxAndStateBinary) {
        const requestMessage = message as RequestTxAndStateReq
        /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455101 ${shardusGetTime()} tx:${queueEntry.acceptedTx.txId} ${NodeList.activeIdToPartition.get(Self.id)}-->>${NodeList.activeIdToPartition.get(nodeToAsk.id)}: ${'request_tx_and_state'}`)
        const response = await Comms.askBinary<RequestTxAndStateReq, RequestTxAndStateResp>(
          nodeToAsk,
          InternalRouteEnum.binary_request_tx_and_state,
          requestMessage,
          serializeRequestTxAndStateReq,
          deserializeRequestTxAndStateResp,
          {}
        )
        // } else response = await Comms.ask(nodeToAsk, 'request_tx_and_state', message)
  
        if (response && response.stateList && response.stateList.length > 0) {
          /* prettier-ignore */ if (logFlags.debug) this.mainLogger.debug(`requestFinalData: txid: ${queueEntry.logID} received data for ${response.stateList.length} accounts`)
        } else {
          /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`requestFinalData: txid: ${queueEntry.logID} response is null`)
          nestedCountersInstance.countEvent(
            'stateManager',
            'requestFinalData: failed: response or response.stateList null or statelist length 0'
          )
          return
        }
  
        for (const data of response.stateList) {
          if (data == null) {
            /* prettier-ignore */
            if (logFlags.error && logFlags.debug) this.mainLogger.error(`requestFinalData data == null for tx ${queueEntry.logID}`);
            success = false
            break
          }
          const indexInVote = queueEntry.signedReceipt.proposal.accountIDs.indexOf(data.accountId)
          if (indexInVote === -1) continue
          const afterStateIdFromVote = queueEntry.signedReceipt.proposal.afterStateHashes[indexInVote]
          if (data.stateId !== afterStateIdFromVote) {
            nestedCountersInstance.countEvent('stateManager', 'requestFinalDataMismatch')
            continue
          }
          if (queueEntry.collectedFinalData[data.accountId] == null) {
            // todo: check the state hashes and verify
            queueEntry.collectedFinalData[data.accountId] = data
            successCount++
            /* prettier-ignore */
            if (logFlags.debug) this.mainLogger.debug(`requestFinalData: txid: ${queueEntry.logID} success accountId: ${data.accountId} stateId: ${data.stateId}`);
          }
        }
        if (includeAppReceiptData && response.appReceiptData) {
          const receivedAppReceiptDataHash = this.crypto.hash(response.appReceiptData)
          const receipt2 = this.stateManager.getSignedReceipt(queueEntry)
          if (receipt2 != null) {
            validAppReceiptData = receivedAppReceiptDataHash === receipt2.proposal.appReceiptDataHash
          }
        }
        if (successCount === accountIds.length && validAppReceiptData === true) {
          success = true
  
          //setting this for completeness. if our node is awaiting final data it will utilize what was looked up here
          queueEntry.hasValidFinalData = true
          return { wrappedResponses: queueEntry.collectedFinalData, appReceiptData: response.appReceiptData }
        } else {
          nestedCountersInstance.countEvent(
            'stateManager',
            `requestFinalData: failed: did not get enough data: ${successCount} <  ${accountIds.length}`
          )
        }
      } catch (e) {
        nestedCountersInstance.countEvent('stateManager', 'requestFinalData: failed: Error')
        /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`requestFinalData: txid: ${queueEntry.logID} error: ${e.message}`)
      } finally {
        if (success === false) {
          nestedCountersInstance.countEvent('stateManager', 'requestFinalData: failed: success === false')
          /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`requestFinalData: txid: ${queueEntry.logID} failed. successCount: ${successCount} accountIds: ${accountIds.length}`);
        }
      }
      profilerInstance.profileSectionEnd('requestFinalData')
    },
  
    async requestInitialData(queueEntry: QueueEntry, accountIds: string[]): Promise<WrappedResponses> {
      profilerInstance.profileSectionStart('requestInitialData')
      this.mainLogger.debug(
        `requestInitialData: txid: ${queueEntry.logID} accountIds: ${utils.stringifyReduce(accountIds)}`
      )
      const message = { txid: queueEntry.acceptedTx.txId, accountIds }
      let success = false
      let successCount = 0
      let retries = 0
      const maxRetry = 3
      const triedNodes = new Set<string>()
  
      if (queueEntry.executionGroup == null) return
  
      while (retries < maxRetry) {
        const executionNodeIds = queueEntry.executionGroup.map((node) => node.id)
        const randomExeNodeId = utils.getRandom(executionNodeIds, 1)[0]
        if (triedNodes.has(randomExeNodeId)) continue
        if (randomExeNodeId === Self.id) continue
        const nodeToAsk = nodes.get(randomExeNodeId)
        if (!nodeToAsk) {
          if (logFlags.error) this.mainLogger.error('requestInitialData: could not find node from execution group')
          throw new Error('requestInitialData: could not find node from execution group')
        }
        triedNodes.add(randomExeNodeId)
        retries++
        try {
          if (logFlags.debug)
            this.mainLogger.debug(
              `requestInitialData: txid: ${queueEntry.acceptedTx.txId} accountIds: ${utils.stringifyReduce(
                accountIds
              )}, asking node: ${nodeToAsk.id} ${nodeToAsk.externalPort} at timestamp ${shardusGetTime()}`
            )
  
          const requestMessage = message as RequestTxAndStateReq
          /* prettier-ignore */ if (logFlags.seqdiagram) this.seqLogger.info(`0x53455101 ${shardusGetTime()} tx:${queueEntry.acceptedTx.txId} ${NodeList.activeIdToPartition.get(Self.id)}-->>${NodeList.activeIdToPartition.get(nodeToAsk.id)}: ${'request_tx_and_state'}`)
          const response = await Comms.askBinary<RequestTxAndStateReq, RequestTxAndStateResp>(
            nodeToAsk,
            InternalRouteEnum.binary_request_tx_and_state_before,
            requestMessage,
            serializeRequestTxAndStateReq,
            deserializeRequestTxAndStateResp,
            {}
          )
  
          if (response && response.stateList && response.stateList.length === accountIds.length) {
            this.mainLogger.debug(
              `requestInitialData: txid: ${queueEntry.logID} received data for ${response.stateList.length} accounts`
            )
          } else {
            this.mainLogger.error(`requestInitialData: txid: ${queueEntry.logID} response is null or incomplete`)
            continue
          }
  
          const results: WrappedResponses = {}
          const receipt2 = this.stateManager.getSignedReceipt(queueEntry)
          if (receipt2 == null) {
            return
          }
          if (receipt2.proposal.accountIDs.length !== response.stateList.length) {
            if (logFlags.error && logFlags.debug)
              this.mainLogger.error(`requestInitialData data.length not matching for tx ${queueEntry.logID}`)
            return
          }
          for (const data of response.stateList) {
            if (data == null) {
              /* prettier-ignore */
              if (logFlags.error && logFlags.debug) this.mainLogger.error(`requestInitialData data == null for tx ${queueEntry.logID}`);
              success = false
              break
            }
            const indexInVote = receipt2.proposal.accountIDs.indexOf(data.accountId)
            if (data.stateId === receipt2.proposal.beforeStateHashes[indexInVote]) {
              successCount++
              results[data.accountId] = data
              /* prettier-ignore */
              if (logFlags.debug) this.mainLogger.debug(`requestInitialData: txid: ${queueEntry.logID} success accountId: ${data.accountId} stateId: ${data.stateId}`);
            }
          }
          return results
        } catch (e) {
          nestedCountersInstance.countEvent('stateManager', 'requestInitialDataError')
          /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`requestInitialData: txid: ${queueEntry.logID} error: ${e.message}`)
        }
      }
      /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`requestInitialData: txid: ${queueEntry.logID} failed. successCount: ${successCount} accountIds: ${accountIds.length}`);
      profilerInstance.profileSectionEnd('requestInitialData')
    }
}