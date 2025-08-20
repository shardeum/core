/**
 * Wrapper for factTellCorrespondingNodesFinalData
 * Extracted logic to avoid import dependencies
 */

import { getCorrespondingNodes } from '../../utils/fastAggregatedCorrespondingTell'
import { getLogger } from './testLogger'

export function factTellCorrespondingNodesFinalDataWrapper(
  mockQueue: any,
  queueEntry: any,
  p2pOverride: any
): void {
  const logger = getLogger()
  logger.detail(`  Executing factTellCorrespondingNodesFinalData for node ${mockQueue.Self.id.substring(0, 8)}...`)
  
  // Check if FACT is enabled
  if (!mockQueue.config?.p2p?.useFactCorrespondingTell) {
    logger.detail('    FACT is disabled in config (useFactCorrespondingTell=false)')
    return
  }
  
  // Validation checks
  if (!mockQueue.stateManager.currentCycleShardData) {
    throw new Error('factTellCorrespondingNodesFinalData: currentCycleShardData == null')
  }
  if (!queueEntry.uniqueKeys) {
    throw new Error('factTellCorrespondingNodesFinalData: queueEntry.uniqueKeys == null')
  }
  if (queueEntry.globalModification === true) {
    throw new Error('factTellCorrespondingNodesFinalData globalModification === true')
  }
  
  // Check executeInOneShard
  if (mockQueue.executeInOneShard && queueEntry.isInExecutionHome === false) {
    throw new Error('factTellCorrespondingNodesFinalData isInExecutionHome === false')
  }
  
  if (!queueEntry.preApplyTXResult) {
    throw new Error('factTellCorrespondingNodesFinalData preApplyTXResult == null')
  }
  
  const datas: { [accountID: string]: any } = {}
  const applyResponse = queueEntry.preApplyTXResult.applyResponse
  let wrappedStates = mockQueue.config?.stateManager?.useAccountWritesOnly ? {} : (queueEntry.collectedData || {})
  const writtenAccountsMap: any = {}
  
  if (applyResponse.accountWrites && applyResponse.accountWrites.length > 0) {
    for (const writtenAccount of applyResponse.accountWrites) {
      writtenAccountsMap[writtenAccount.accountId] = writtenAccount.data
      writtenAccountsMap[writtenAccount.accountId].prevStateId = wrappedStates[writtenAccount.accountId]
        ? wrappedStates[writtenAccount.accountId].stateId
        : ''
      writtenAccountsMap[writtenAccount.accountId].prevDataCopy = wrappedStates[writtenAccount.accountId]
        ? JSON.parse(JSON.stringify(writtenAccount.data))
        : {}
      
      datas[writtenAccount.accountId] = writtenAccount.data
    }
    wrappedStates = writtenAccountsMap
  }
  
  const keysToShare = Object.keys(wrappedStates)
  
  let totalShares = 0
  const targetStartIndex = 0
  const targetEndIndex = queueEntry.transactionGroup.length
  const targetGroupSize = queueEntry.transactionGroup.length
  
  const senderIndexInTxGroup = queueEntry.ourTXGroupIndex
  const senderGroupSize = queueEntry.executionGroup.length
  
  // Use wrapped index if available
  let senderIndex = senderIndexInTxGroup
  const wrappedIndex = queueEntry.isSenderWrappedTxGroup?.[mockQueue.Self.id]
  if (wrappedIndex != null) {
    senderIndex = wrappedIndex
    logger.detail(`    Using wrapped index ${wrappedIndex} instead of regular ${senderIndexInTxGroup}`)
  }
  
  // Calculate corresponding nodes
  const correspondingIndices = getCorrespondingNodes(
    senderIndex,
    targetStartIndex,
    targetEndIndex,
    queueEntry.correspondingGlobalOffset,
    targetGroupSize,
    senderGroupSize,
    queueEntry.transactionGroup.length,
    queueEntry.logID || 'test'
  )
  
  logger.detail(`    Calculated ${correspondingIndices.length} corresponding indices: ${correspondingIndices.join(', ')}`)
  
  for (const key of keysToShare) {
    if (wrappedStates[key] != null) {
      if (queueEntry.ourExGroupIndex === -1) {
        throw new Error('factTellCorrespondingNodesFinalData: should never get here. our sending node must be in the execution group')
      }
      
      const storageNodesForAccount = mockQueue.getStorageGroupForAccount(key)
      const storageNodesAccountIds = new Set(storageNodesForAccount.map((node) => node.id))
      
      const correspondingNodes: any[] = []
      for (const index of correspondingIndices) {
        const node = queueEntry.transactionGroup[index]
        if (storageNodesAccountIds.has(node.id)) {
          correspondingNodes.push(node)
        }
      }
      
      const dataToSend: any[] = []
      dataToSend.push(datas[key])
      const message = { stateList: dataToSend, txid: queueEntry.acceptedTx.txId }
      
      if (correspondingNodes.length > 0) {
        // Filter nodes
        const filteredNodes = mockQueue.stateManager.filterValidNodesForInternalMessage(
          correspondingNodes,
          'factTellCorrespondingNodesFinalData',
          true,
          true
        )
        
        if (filteredNodes.length === 0) {
          logger.detail('    No valid nodes left after filtering')
          continue
        }
        
        logger.detail(`    Sending to ${filteredNodes.length} nodes for account ${key.substring(0, 8)}...`)
        
        // Use the p2p override
        const p2p = p2pOverride || mockQueue.p2p
        p2p.tellBinary(
          filteredNodes,
          'binary_poqo_data_and_receipt',
          {
            finalState: message,
            receipt: queueEntry.signedReceipt,
            txGroupCycle: queueEntry.txGroupCycle,
          },
          null, // serializeFunc
          {}
        )
        
        totalShares++
      }
    }
  }
  
  logger.detail(`    Total shares: ${totalShares}`)
}