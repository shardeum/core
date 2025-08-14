import { SpreadFactorError } from '../errors/stateHardeningErrors'
import { SpreadFactorResult } from '../types/stateHardening'
import { nestedCountersInstance } from './nestedCounters'
import * as Context from '../p2p/Context'

/**
 * Utility class for calculating spread factor targets and validating senders
 * This handles the logic for determining which nodes should receive spread messages
 * based on the configured spread factor
 */
export class SpreadFactorCalculator {
  /**
   * Get target node indices for spreading messages
   * @param ourIndex - Our index in the transaction group
   * @param groupSize - Total size of the transaction group
   * @param spreadFactor - The spread factor (1 = no spread, 2 = double, etc.)
   * @returns Array of node indices that should receive the message
   */
  static getTargetNodes(
    ourIndex: number,
    groupSize: number,
    spreadFactor: number
  ): number[] {
    // Validate inputs
    if (ourIndex < 0 || ourIndex >= groupSize) {
      throw new SpreadFactorError(
        ourIndex,
        groupSize,
        spreadFactor,
        `Invalid ourIndex: ${ourIndex} (group size: ${groupSize})`
      )
    }

    if (groupSize <= 0) {
      throw new SpreadFactorError(
        ourIndex,
        groupSize,
        spreadFactor,
        'Group size must be positive'
      )
    }

    if (spreadFactor < 1) {
      throw new SpreadFactorError(
        ourIndex,
        groupSize,
        spreadFactor,
        'Spread factor must be at least 1'
      )
    }

    const targets: number[] = []

    // For each spread level
    for (let spread = 0; spread < spreadFactor; spread++) {
      const offset = spread * groupSize
      const targetIndex = (ourIndex + offset) % groupSize

      // Don't send to ourselves
      if (targetIndex !== ourIndex) {
        targets.push(targetIndex)
      }
    }

    // Remove duplicates and sort
    const uniqueTargets = Array.from(new Set(targets)).sort((a, b) => a - b)

    nestedCountersInstance.countEvent('spreadFactor', `targetsCalculated.spread${spreadFactor}`, uniqueTargets.length)

    return uniqueTargets
  }

  /**
   * Check if a sender is valid for a given receiver with spread factor
   * @param receiverIndex - Index of the receiving node
   * @param senderIndex - Index of the sending node  
   * @param groupSize - Size of the transaction group
   * @param spreadFactor - The spread factor being used
   * @returns true if the sender is valid for this receiver
   */
  static isValidSpreadSender(
    receiverIndex: number,
    senderIndex: number,
    groupSize: number,
    spreadFactor: number
  ): boolean {
    // Validate inputs
    if (receiverIndex < 0 || receiverIndex >= groupSize ||
        senderIndex < 0 || senderIndex >= groupSize) {
      return false
    }

    // Check each possible spread offset
    for (let spread = 0; spread < spreadFactor; spread++) {
      const expectedSenderForSpread = (receiverIndex - spread * groupSize + groupSize * spreadFactor) % groupSize
      
      if (expectedSenderForSpread === senderIndex) {
        return true
      }
    }

    return false
  }

  /**
   * Calculate spread result with detailed information
   */
  static calculateSpreadTargets(
    ourIndex: number,
    groupSize: number,
    spreadFactor: number
  ): SpreadFactorResult {
    try {
      const nodeIndices = this.getTargetNodes(ourIndex, groupSize, spreadFactor)
      
      return {
        type: 'targets-calculated',
        nodeIndices,
        spreadFactor
      }
    } catch (error) {
      if (error instanceof SpreadFactorError) {
        return {
          type: 'invalid-params',
          reason: error.message
        }
      }
      
      return {
        type: 'error',
        error
      }
    }
  }

  /**
   * Get corresponding nodes for a given index (used in transaction processing)
   * This replicates the logic from getCorrespondingNodes but with cleaner structure
   */
  static getCorrespondingNodes(
    baseIndex: number,
    offsetIndex: number,
    groupSize: number,
    inverse = false,
    _spreadFactor = 1,
    spreadIndex = 0
  ): number[] {
    if (groupSize === 0) {
      return []
    }

    const results: number[] = []
    const nodesPerGroup = Context.config?.sharding?.nodesPerConsensusGroup || 5

    // Calculate base position with spread
    const spreadOffset = spreadIndex * groupSize
    const adjustedOffsetIndex = (offsetIndex + spreadOffset) % groupSize

    for (let i = 0; i < nodesPerGroup; i++) {
      let nodeIndex: number
      
      if (inverse) {
        nodeIndex = (adjustedOffsetIndex * nodesPerGroup + i + baseIndex + groupSize) % groupSize
      } else {
        nodeIndex = (adjustedOffsetIndex * nodesPerGroup + i - baseIndex + groupSize) % groupSize
      }

      results.push(nodeIndex)
    }

    return results
  }

  /**
   * Verify if a node is a valid corresponding sender with spread support
   */
  static verifyCorrespondingSenderWithSpread(
    receivingNodeIndex: number,
    sendingNodeIndex: number,
    baseIndex: number,
    groupOffset: number,
    groupSize: number,
    isInverse: boolean,
    spreadFactor: number,
    logId?: string
  ): boolean {
    // Try each spread index
    for (let spreadIndex = 0; spreadIndex < spreadFactor; spreadIndex++) {
      const correspondingNodes = this.getCorrespondingNodes(
        baseIndex,
        groupOffset,
        groupSize,
        isInverse,
        spreadFactor,
        spreadIndex
      )

      if (correspondingNodes.includes(sendingNodeIndex)) {
        if (logId) {
          nestedCountersInstance.countEvent('spreadFactor', `validSender.spread${spreadIndex}.inverse${isInverse}`)
        }
        return true
      }
    }

    return false
  }

  /**
   * Get spread statistics for monitoring
   */
  static getSpreadStats(
    groupSize: number,
    spreadFactor: number
  ): {
    maxTargetsPerNode: number
    totalMessagesInNetwork: number
    redundancyFactor: number
  } {
    // Each node sends to (spreadFactor - 1) additional nodes
    const targetsPerNode = Math.min(spreadFactor - 1, groupSize - 1)
    
    // Total messages = nodes * targets per node
    const totalMessages = groupSize * targetsPerNode
    
    // Redundancy = how many copies of each message exist
    const redundancy = spreadFactor

    return {
      maxTargetsPerNode: targetsPerNode,
      totalMessagesInNetwork: totalMessages,
      redundancyFactor: redundancy
    }
  }

  /**
   * Calculate optimal spread factor based on network conditions
   * (This is a placeholder for future dynamic spread factor adjustment)
   */
  static calculateOptimalSpreadFactor(
    groupSize: number,
    failureRate: number,
    targetReliability = 0.99
  ): number {
    // Simple calculation: increase spread based on failure rate
    // This ensures message delivery even with node failures
    
    if (failureRate <= 0) return 1
    if (failureRate >= 1) return groupSize // Maximum spread
    
    // Calculate required redundancy for target reliability
    // P(success) = 1 - P(all_fail) = 1 - failureRate^spreadFactor
    // targetReliability = 1 - failureRate^spreadFactor
    // spreadFactor = log(1 - targetReliability) / log(failureRate)
    
    const spreadFactor = Math.ceil(
      Math.log(1 - targetReliability) / Math.log(failureRate)
    )
    
    // Cap at reasonable limits
    return Math.max(1, Math.min(spreadFactor, Math.ceil(groupSize / 2)))
  }
}