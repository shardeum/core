import { getCorrespondingNodes, verifyCorrespondingSender } from './fastAggregatedCorrespondingTell'
import * as Shardus from '../shardus/shardus-types'
import { logFlags } from '../logger'
import * as crypto from '@shardeum-foundation/lib-crypto-utils'

/**
 * Get all corresponding senders for a given account based on the spread factor
 * This is used for state hardening Phase 1 to enable 2x spread for before-state data
 */
export function getCorrespondingSenders(
  accountId: string,
  targetGroup: string[],
  transactionGroup: (Shardus.NodeWithRank | Shardus.Node)[],
  receiverIndex: number,
  globalOffset: number,
  spreadFactor: number
): string[] {
  const senders: string[] = []
  
  // Calculate primary sender using existing FACT logic
  const receiverGroupSize = targetGroup.length
  const senderGroupSize = receiverGroupSize
  
  // Get target group indices
  const targetIndices = getStartAndEndIndexOfTargetGroup(targetGroup, transactionGroup)
  
  // For each spread factor, calculate a different sender
  for (let i = 0; i < spreadFactor; i++) {
    // Modify global offset for secondary senders
    const modifiedGlobalOffset = globalOffset + i
    
    // Find which node should send this data for this spread index
    const correspondingNodes = getCorrespondingNodes(
      receiverIndex,
      targetIndices.startIndex,
      targetIndices.endIndex,
      modifiedGlobalOffset,
      receiverGroupSize,
      senderGroupSize,
      transactionGroup.length,
      `spread_${i}_${accountId}`
    )
    
    // Get the sender node IDs
    for (const nodeIndex of correspondingNodes) {
      if (nodeIndex >= 0 && nodeIndex < transactionGroup.length) {
        const senderId = transactionGroup[nodeIndex].id
        if (!senders.includes(senderId)) {
          senders.push(senderId)
        }
      }
    }
  }
  
  if (logFlags.verbose) {
    console.log(`getCorrespondingSenders for account ${accountId}: ${senders.join(', ')}`)
  }
  
  return senders
}

/**
 * Verify if a sender is valid for the given spread factor
 * This checks both primary and secondary senders based on the configured spread factor
 */
export function verifyCorrespondingSenderWithSpread(
  receivingNodeIndex: number,
  sendingNodeIndex: number,
  globalOffset: number,
  receiverGroupSize: number,
  sendGroupSize: number,
  receiverStartIndex: number,
  receiverEndIndex: number,
  transactionGroupSize: number,
  shouldUnwrapSender: boolean,
  spreadFactor: number,
  note = ''
): boolean {
  // Check for each possible spread factor offset
  for (let i = 0; i < spreadFactor; i++) {
    const modifiedGlobalOffset = globalOffset + i
    
    const isValid = verifyCorrespondingSender(
      receivingNodeIndex,
      sendingNodeIndex,
      modifiedGlobalOffset,
      receiverGroupSize,
      sendGroupSize,
      receiverStartIndex,
      receiverEndIndex,
      transactionGroupSize,
      shouldUnwrapSender,
      `${note}_spread_${i}`
    )
    
    if (isValid) {
      if (logFlags.verbose) {
        console.log(`Sender verified with spread factor ${i} for ${note}`)
      }
      return true
    }
  }
  
  return false
}

/**
 * Get start and end index of target group within transaction group
 * (Copied from TransactionQueue to avoid circular dependency)
 */
function getStartAndEndIndexOfTargetGroup(
  targetGroup: string[],
  transactionGroup: (Shardus.NodeWithRank | Shardus.Node)[]
): { startIndex: number; endIndex: number } {
  const targetIndexes: number[] = []
  for (let i = 0; i < transactionGroup.length; i++) {
    const nodeId = transactionGroup[i].id
    if (targetGroup.indexOf(nodeId) >= 0) {
      targetIndexes.push(i)
    }
  }
  
  if (targetIndexes.length === 0) {
    return { startIndex: -1, endIndex: -1 }
  }
  
  // Sort to ensure we get the correct range
  targetIndexes.sort((a, b) => a - b)
  
  return {
    startIndex: targetIndexes[0],
    endIndex: targetIndexes[targetIndexes.length - 1] + 1
  }
}

/**
 * Calculate a deterministic salt for secondary senders
 * This ensures the same secondary sender is chosen consistently
 */
export function getSecondarySenderSalt(accountId: string, spreadIndex: number): string {
  return crypto.hash(`${accountId}_spread_${spreadIndex}`)
}