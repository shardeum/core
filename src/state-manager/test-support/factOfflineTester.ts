/**
 * FACT Offline Tester
 * Simulates transaction flow from execution group to transaction group
 */

import { 
  MockP2P, 
  MockStateManager, 
  MockShardCalculator,
  MessageCollector,
  createNodesFromValidatorList,
  TestScenario,
  ShardConfig
} from './mocks'
import { factTellCorrespondingNodesFinalDataWrapper } from './factWrapper'
import { loadTestConfig, applyConfigToMocks, TestConfig } from './configLoader'
import { getLogger } from './testLogger'
import ShardFunctions from '../shardFunctions'
import fs from 'fs'
import path from 'path'

export interface MessageBatchResult {
  batchId: string
  accountId: string
  totalRecipients: number
  acceptedByNodes: string[]
  rejectedByNodes: string[]
  acceptanceRate: number
}

export interface TestResults {
  // Coverage metrics
  nodesReached: number
  totalInTransactionGroup: number
  
  // Account coverage
  accountsCovered: Map<string, string[]>  // accountId -> [nodeIds that received]
  accountsMissing: Map<string, string[]>   // accountId -> [nodeIds that should have received]
  
  // Message batch metrics (batch = one tellBinary call)
  messagesBatchesSent: number              // Number of tellBinary() calls
  messageBatchesAccepted: number           // Batches with ≥1 acceptance
  messageBatchesFullyAccepted: number      // Batches accepted by ALL recipients
  
  // Message reception metrics (individual node receptions)
  totalMessageReceptions: number           // Total individual receptions
  messageReceptionsAccepted: number        // Individual receptions accepted
  messageReceptionsRejected: number        // Individual receptions rejected
  rejectionReasons: Map<string, number>    // reason -> count
  
  // Detailed tracking
  messagesByNode: Map<string, number>      // nodeId -> message count
  batchResults: MessageBatchResult[]       // Per-batch detailed results
  averageAcceptanceRate: number            // Average acceptance rate across batches
  
  // Legacy fields (for backward compatibility)
  messagesAccepted: number                 // DEPRECATED: use messageReceptionsAccepted
  messagesRejected: number                 // DEPRECATED: use messageReceptionsRejected
  messagesSent: number                     // DEPRECATED: use messagesBatchesSent
}

export class FACTOfflineTester {
  private messageCollector: MessageCollector
  private mockP2P: MockP2P
  private mockStateManager: MockStateManager
  private results: TestResults
  private config: TestConfig
  
  constructor(configPath?: string) {
    this.messageCollector = new MessageCollector()
    this.mockP2P = new MockP2P(this.messageCollector)
    this.results = this.initResults()
    this.config = loadTestConfig(configPath)
  }
  
  private initResults(): TestResults {
    return {
      nodesReached: 0,
      totalInTransactionGroup: 0,
      accountsCovered: new Map(),
      accountsMissing: new Map(),
      
      // New batch metrics
      messagesBatchesSent: 0,
      messageBatchesAccepted: 0,
      messageBatchesFullyAccepted: 0,
      
      // New reception metrics
      totalMessageReceptions: 0,
      messageReceptionsAccepted: 0,
      messageReceptionsRejected: 0,
      rejectionReasons: new Map(),
      
      // Detailed tracking
      messagesByNode: new Map(),
      batchResults: [],
      averageAcceptanceRate: 0,
      
      // Legacy fields (for backward compatibility)
      messagesAccepted: 0,
      messagesRejected: 0,
      messagesSent: 0
    }
  }
  
  /**
   * Main simulation method
   */
  async simulateTransaction(scenario: TestScenario): Promise<TestResults> {
    const logger = getLogger()
    logger.section('Starting FACT Transaction Simulation', false)
    
    // Reset results
    this.results = this.initResults()
    this.messageCollector.clear()
    
    // 1. Setup environment
    logger.detail('Step 1: Setting up mock environment...')
    const { cycleShardData, transactionGroup, executionGroup } = this.setupEnvironment(scenario)
    
    // 2. Simulate sending from execution nodes
    logger.detail('\nStep 2: Simulating factTellCorrespondingNodesFinalData...')
    await this.simulateSending(scenario, cycleShardData, transactionGroup, executionGroup)
    
    // 3. Process received messages
    logger.detail('\nStep 3: Processing received messages...')
    await this.processReceivedMessages(scenario, cycleShardData, transactionGroup)
    
    // 4. Analyze results
    logger.detail('\nStep 4: Analyzing results...')
    this.analyzeResults(scenario, transactionGroup)
    
    return this.results
  }
  
  /**
   * Setup mock environment with shard data
   */
  private setupEnvironment(scenario: TestScenario) {
    const logger = getLogger()
    // Create nodes from validator list
    const activeNodes = createNodesFromValidatorList(scenario.activeValidators)
    logger.detail(`Created ${activeNodes.length} active nodes`)
    
    // Override scenario shard config with loaded config values
    const shardConfig = {
      nodesPerConsensusGroup: this.config.sharding.nodesPerConsensusGroup,
      nodesPerEdge: this.config.sharding.nodesPerEdge
    }
    logger.detail(`Using config values: nodesPerConsensusGroup=${shardConfig.nodesPerConsensusGroup}, nodesPerEdge=${shardConfig.nodesPerEdge}`)
    
    // Generate cycle shard data
    const cycleShardData = MockShardCalculator.generateCycleShardData(
      activeNodes,
      scenario.cycleNumber,
      shardConfig,
      scenario.executionGroup?.[0] // Use first execution node as "our" node for testing
    )
    
    // Initialize mock state manager
    this.mockStateManager = new MockStateManager(cycleShardData)
    
    // Get transaction and execution groups
    const transactionGroup = this.getTransactionGroup(scenario, activeNodes)
    const executionGroup = this.getExecutionGroup(scenario, activeNodes)
    
    logger.detail(`Transaction group size: ${transactionGroup.length}`)
    logger.detail(`Execution group size: ${executionGroup.length}`)
    
    this.results.totalInTransactionGroup = transactionGroup.length
    
    return { cycleShardData, transactionGroup, executionGroup }
  }
  
  /**
   * Simulate sending final data from execution nodes
   */
  private async simulateSending(
    scenario: TestScenario,
    cycleShardData: any,
    transactionGroup: any[],
    executionGroup: any[]
  ) {
    const logger = getLogger()
    // For each execution node, simulate sending
    for (let i = 0; i < executionGroup.length; i++) {
      const executionNode = executionGroup[i]
      logger.detail(`\nSimulating send from execution node ${i + 1}/${executionGroup.length}: ${executionNode.id.substring(0, 8)}...`)
      
      // Create minimal queue entry for this node
      const queueEntry = this.createQueueEntry(
        scenario,
        cycleShardData,
        transactionGroup,
        executionGroup,
        executionNode,
        i
      )
      
      // Create a mock TransactionQueue instance
      const mockTxQueue = this.createMockTransactionQueue(executionNode, cycleShardData)
      
      try {
        // Call the wrapper function with our mock P2P
        factTellCorrespondingNodesFinalDataWrapper(mockTxQueue, queueEntry, this.mockP2P as any)
        logger.detail(`  Successfully sent messages from node ${executionNode.id.substring(0, 8)}`)
      } catch (error) {
        logger.error(`  Error sending from node ${executionNode.id.substring(0, 8)}: ${error.message}`, error)
      }
    }
    
    this.results.messagesSent = this.messageCollector.sentMessages.length
    this.results.messagesBatchesSent = this.messageCollector.sentMessages.length
    logger.detail(`\nMessage batches sent: ${this.results.messagesBatchesSent}`)
  }
  
  /**
   * Process messages through receiver handlers
   */
  private async processReceivedMessages(
    scenario: TestScenario,
    cycleShardData: any,
    transactionGroup: any[]
  ) {
    const logger = getLogger()
    const poqoMessages = this.messageCollector.getMessagesByRoute('binary_poqo_data_and_receipt')
    logger.detail(`Found ${poqoMessages.length} POQO message batches to process`)
    
    const nodesReached = new Set<string>()
    const batchResults: MessageBatchResult[] = []
    
    // Process each message batch
    for (let i = 0; i < poqoMessages.length; i++) {
      const message = poqoMessages[i]
      const batchId = `batch_${i}`
      const accountId = message.data?.finalState?.stateList?.[0]?.accountId || 'unknown'
      
      const acceptedByNodes: string[] = []
      const rejectedByNodes: string[] = []
      
      // Process each recipient in the batch
      for (const receiverNode of message.nodes) {
        nodesReached.add(receiverNode.id)
        
        // Track receptions per node
        const currentCount = this.results.messagesByNode.get(receiverNode.id) || 0
        this.results.messagesByNode.set(receiverNode.id, currentCount + 1)
        
        // Validate message
        const isValid = this.validateMessage(message, receiverNode, transactionGroup, scenario)
        
        if (isValid) {
          acceptedByNodes.push(receiverNode.id)
          this.results.messageReceptionsAccepted++
          this.results.messagesAccepted++ // Legacy field
          
          // Track account coverage
          if (message.data?.finalState?.stateList) {
            for (const state of message.data.finalState.stateList) {
              const accountId = state.accountId
              if (!this.results.accountsCovered.has(accountId)) {
                this.results.accountsCovered.set(accountId, [])
              }
              this.results.accountsCovered.get(accountId).push(receiverNode.id)
            }
          }
        } else {
          rejectedByNodes.push(receiverNode.id)
          this.results.messageReceptionsRejected++
          this.results.messagesRejected++ // Legacy field
          const reason = 'validation_failed'
          this.results.rejectionReasons.set(
            reason,
            (this.results.rejectionReasons.get(reason) || 0) + 1
          )
        }
      }
      
      // Calculate batch-level metrics
      const totalRecipients = message.nodes.length
      const acceptanceRate = acceptedByNodes.length / totalRecipients
      
      batchResults.push({
        batchId,
        accountId,
        totalRecipients,
        acceptedByNodes,
        rejectedByNodes,
        acceptanceRate
      })
      
      // Track batch-level acceptance
      if (acceptedByNodes.length > 0) {
        this.results.messageBatchesAccepted++
      }
      if (acceptedByNodes.length === totalRecipients) {
        this.results.messageBatchesFullyAccepted++
      }
      
      logger.detail(`  Batch ${i + 1}: Account ${accountId.substring(0, 8)}... → ${acceptedByNodes.length}/${totalRecipients} nodes (${(acceptanceRate * 100).toFixed(1)}%)`)
    }
    
    // Calculate summary metrics
    this.results.batchResults = batchResults
    this.results.averageAcceptanceRate = batchResults.length > 0 
      ? batchResults.reduce((sum, b) => sum + b.acceptanceRate, 0) / batchResults.length 
      : 0
    this.results.totalMessageReceptions = this.results.messageReceptionsAccepted + this.results.messageReceptionsRejected
    this.results.nodesReached = nodesReached.size
    
    // Log improved summary
    logger.detail(`\nBatch Summary:`)
    logger.detail(`  - Message batches processed: ${poqoMessages.length}`)
    logger.detail(`  - Batches with full acceptance: ${this.results.messageBatchesFullyAccepted}`)
    logger.detail(`  - Batches with partial acceptance: ${this.results.messageBatchesAccepted - this.results.messageBatchesFullyAccepted}`)
    logger.detail(`  - Average batch acceptance rate: ${(this.results.averageAcceptanceRate * 100).toFixed(1)}%`)
    logger.detail(`\nReception Summary:`)
    logger.detail(`  - Total message receptions: ${this.results.totalMessageReceptions}`)
    logger.detail(`  - Receptions accepted: ${this.results.messageReceptionsAccepted}`)
    logger.detail(`  - Receptions rejected: ${this.results.messageReceptionsRejected}`)
    logger.detail(`  - Nodes reached: ${this.results.nodesReached}`)
  }
  
  /**
   * Analyze coverage and identify missing nodes
   */
  private analyzeResults(scenario: TestScenario, transactionGroup: any[]) {
    const logger = getLogger()
    // Check which accounts were supposed to be covered
    const accountsInReceipt = this.getAccountsFromReceipt(scenario.receipt)
    
    for (const accountId of accountsInReceipt) {
      const nodesCovered = this.results.accountsCovered.get(accountId) || []
      const uniqueNodesCovered = new Set(nodesCovered)
      
      // Find which nodes should have this account
      const nodesForAccount = this.getNodesForAccount(accountId, transactionGroup)
      
      // Find missing nodes
      const missingNodes = nodesForAccount.filter(nodeId => !uniqueNodesCovered.has(nodeId))
      
      if (missingNodes.length > 0) {
        this.results.accountsMissing.set(accountId, missingNodes)
      }
      
      logger.detail(`Account ${accountId.substring(0, 8)}...`)
      logger.detail(`  Should be on ${nodesForAccount.length} nodes`)
      logger.detail(`  Covered on ${uniqueNodesCovered.size} nodes`)
      logger.detail(`  Missing on ${missingNodes.length} nodes`)
    }
  }
  
  /**
   * Create a minimal queue entry for testing
   */
  private createQueueEntry(
    scenario: TestScenario,
    cycleShardData: any,
    transactionGroup: any[],
    executionGroup: any[],
    executionNode: any,
    executionNodeIndex: number
  ): any {
    const receipt = scenario.receipt
    
    // Extract account data from receipt
    const accountWrites = []
    const wrappedStates = {}
    
    if (receipt.receipts?.afterStates) {
      for (const state of receipt.receipts.afterStates) {
        accountWrites.push({
          accountId: state.accountId,
          data: state.data
        })
        wrappedStates[state.accountId] = state.data
      }
    }
    
    // Find our index in transaction group
    const ourTXGroupIndex = transactionGroup.findIndex(n => n.id === executionNode.id)
    
    // Calculate global offset from txId (last 4 hex chars)
    const txId = receipt.receipts?.receiptId || receipt.receipts?.signedReceipt?.proposal?.txid || 'default'
    const globalOffset = parseInt(txId.substring(txId.length - 4), 16) || 0
    
    const queueEntry: any = {
      acceptedTx: {
        txId,
        timestamp: Date.now(),
        data: receipt.tx?.originalTxData?.tx || {}
      },
      uniqueKeys: Object.keys(wrappedStates),
      globalModification: false,
      isInExecutionHome: true,
      executionShardKey: receipt.receipts?.executionShardKey || executionGroup[0]?.id,
      preApplyTXResult: {
        applyResponse: {
          accountWrites,
          appReceiptData: receipt.receipts?.appReceiptData,
          txId
        }
      },
      collectedData: wrappedStates,
      transactionGroup,
      executionGroup,
      ourTXGroupIndex,
      ourExGroupIndex: executionNodeIndex,
      correspondingGlobalOffset: globalOffset,
      txGroupCycle: scenario.cycleNumber,
      signedReceipt: receipt.receipts?.signedReceipt,
      isSenderWrappedTxGroup: {} // Empty for now
    }
    
    return queueEntry
  }
  
  /**
   * Create mock TransactionQueue with minimal setup
   */
  private createMockTransactionQueue(node: any, cycleShardData: any): any {
    const logger = getLogger()
    const mockQueue = {
      stateManager: this.mockStateManager,
      p2p: this.mockP2P,
      mainLogger: {
        debug: (...args) => logger.detail(`  [TxQueue] ${args.join(' ')}`),
        error: (...args) => logger.error(`  [TxQueue ERROR] ${args.join(' ')}`)
      },
      logger: {
        playbackLogNote: () => {}
      },
      executeInOneShard: this.config.sharding.executeInOneShard,
      config: {
        sharding: this.config.sharding,
        stateManager: this.config.stateManager,
        p2p: this.config.p2p
      },
      
      // Mock Self for this node
      Self: {
        id: node.id
      },
      
      // Add helper method for storage group - using production logic
      getStorageGroupForAccount: (accountId: string) => {
        const { homePartition } = ShardFunctions.addressToPartition(
          cycleShardData.shardGlobals,
          accountId
        )
        const homeShardData = cycleShardData.parititionShardDataMap.get(homePartition)
        if (!homeShardData || !homeShardData.homeNodes || !homeShardData.homeNodes[0]) {
          console.warn(`No home shard data for account ${accountId.substring(0, 8)}, partition ${homePartition}`)
          return []
        }
        const storageGroup = homeShardData.homeNodes[0].nodeThatStoreOurParitionFull.slice()
        return storageGroup
      }
    }
    
    // Apply additional config settings
    applyConfigToMocks(mockQueue, this.config)
    
    return mockQueue
  }
  
  /**
   * Simple message validation
   */
  private validateMessage(
    message: any,
    receiverNode: any,
    transactionGroup: any[],
    scenario: TestScenario
  ): boolean {
    // For now, just check if receiver is in transaction group
    const isInTxGroup = transactionGroup.some(n => n.id === receiverNode.id)
    return isInTxGroup
  }
  
  /**
   * Get accounts from receipt
   */
  private getAccountsFromReceipt(receipt: any): string[] {
    const accounts: string[] = []
    
    if (receipt.receipts?.afterStates) {
      for (const state of receipt.receipts.afterStates) {
        accounts.push(state.accountId)
      }
    }
    
    if (receipt.receipts?.signedReceipt?.proposal?.accountIDs) {
      for (const accountId of receipt.receipts.signedReceipt.proposal.accountIDs) {
        if (!accounts.includes(accountId)) {
          accounts.push(accountId)
        }
      }
    }
    
    return accounts
  }
  
  /**
   * Get nodes that should store an account (simplified)
   */
  private getNodesForAccount(accountId: string, transactionGroup: any[]): string[] {
    // Simplified: for testing, assume first half of tx group should have each account
    const halfSize = Math.floor(transactionGroup.length / 2)
    return transactionGroup.slice(0, halfSize).map(n => n.id)
  }
  
  /**
   * Get transaction group from scenario or derive it
   */
  private getTransactionGroup(scenario: TestScenario, activeNodes: any[]): any[] {
    if (scenario.transactionGroup) {
      return activeNodes.filter(n => scenario.transactionGroup.includes(n.id))
    }
    
    // If not specified, use a subset of active nodes
    // For testing, use first 150 nodes as transaction group
    return activeNodes.slice(0, Math.min(150, activeNodes.length))
  }
  
  /**
   * Get execution group from scenario or derive it
   */
  private getExecutionGroup(scenario: TestScenario, activeNodes: any[]): any[] {
    if (scenario.executionGroup) {
      return activeNodes.filter(n => scenario.executionGroup.includes(n.id))
    }
    
    // If not specified, use nodes around the execution shard key
    // For testing, use 128 nodes starting from index 10
    const startIdx = 10
    const size = Math.min(128, activeNodes.length - startIdx)
    return activeNodes.slice(startIdx, startIdx + size)
  }
  
  /**
   * Print detailed results
   */
  printResults(): void {
    const logger = getLogger()
    logger.summary('\n========================================')
    logger.summary('FACT Simulation Results')
    logger.summary('========================================\n')
    
    // Message batch metrics
    logger.summary('Message Batch Metrics:')
    logger.summary(`  - Message batches sent: ${this.results.messagesBatchesSent}`)
    logger.summary(`  - Batches with full acceptance: ${this.results.messageBatchesFullyAccepted}`)
    logger.summary(`  - Batches with partial acceptance: ${this.results.messageBatchesAccepted - this.results.messageBatchesFullyAccepted}`)
    logger.summary(`  - Batches with no acceptance: ${this.results.messagesBatchesSent - this.results.messageBatchesAccepted}`)
    logger.summary(`  - Average batch acceptance rate: ${(this.results.averageAcceptanceRate * 100).toFixed(1)}%`)
    
    // Message reception metrics  
    logger.summary('\nMessage Reception Metrics:')
    logger.summary(`  - Total message receptions: ${this.results.totalMessageReceptions}`)
    logger.summary(`  - Receptions accepted: ${this.results.messageReceptionsAccepted}`)
    logger.summary(`  - Receptions rejected: ${this.results.messageReceptionsRejected}`)
    if (this.results.totalMessageReceptions > 0) {
      logger.summary(`  - Reception success rate: ${(this.results.messageReceptionsAccepted / this.results.totalMessageReceptions * 100).toFixed(1)}%`)
    }
    
    // Node coverage
    logger.summary('\nNode Coverage:')
    logger.summary(`  - Nodes reached: ${this.results.nodesReached}/${this.results.totalInTransactionGroup} (${(this.results.nodesReached / this.results.totalInTransactionGroup * 100).toFixed(1)}%)`)
    
    // Account coverage
    logger.summary('\nAccount Coverage:')
    logger.summary(`  - Accounts tracked: ${this.results.accountsCovered.size}`)
    logger.summary(`  - Accounts with missing coverage: ${this.results.accountsMissing.size}`)
    
    if (this.results.accountsMissing.size > 0) {
      logger.summary('\n  Missing Coverage Details:')
      for (const [accountId, missingNodes] of this.results.accountsMissing) {
        logger.summary(`    Account ${accountId.substring(0, 8)}...: missing on ${missingNodes.length} nodes`)
      }
    }
    
    // Per-batch breakdown (if there are failed batches)
    const failedBatches = this.results.batchResults.filter(b => b.acceptanceRate < 1)
    if (failedBatches.length > 0) {
      logger.summary('\nFailed/Partial Batch Details:')
      for (const batch of failedBatches.slice(0, 5)) { // Show first 5 failed batches
        logger.summary(`  ${batch.batchId}: Account ${batch.accountId.substring(0, 8)}... → ${batch.acceptedByNodes.length}/${batch.totalRecipients} (${(batch.acceptanceRate * 100).toFixed(1)}%)`)
      }
      if (failedBatches.length > 5) {
        logger.summary(`  ... and ${failedBatches.length - 5} more failed batches`)
      }
    }
    
    if (this.results.rejectionReasons.size > 0) {
      logger.summary('\nRejection Reasons:')
      for (const [reason, count] of this.results.rejectionReasons) {
        logger.summary(`  - ${reason}: ${count}`)
      }
    }
    
    // Legacy compatibility note
    logger.summary('\nLegacy Fields (for backward compatibility):')
    logger.summary(`  - Messages sent (legacy): ${this.results.messagesSent}`)
    logger.summary(`  - Messages accepted (legacy): ${this.results.messagesAccepted}`)
    logger.summary(`  - Messages rejected (legacy): ${this.results.messagesRejected}`)
    
    // Print message collector summary
    this.messageCollector.printSummary()
  }
}

/**
 * Load test scenario from files
 */
export function loadTestScenario(
  receiptPath: string,
  validatorsPath: string,
  cycleNumber?: number
): TestScenario {
  const logger = getLogger()
  logger.detail('\nLoading test scenario...')
  logger.detail(`  Receipt: ${receiptPath}`)
  logger.detail(`  Validators: ${validatorsPath}`)
  
  // Load receipt
  const receiptData = JSON.parse(fs.readFileSync(receiptPath, 'utf8'))
  
  // Load validators
  const validatorIds = JSON.parse(fs.readFileSync(validatorsPath, 'utf8'))
  
  // Extract cycle number from receipt if not provided
  const cycle = cycleNumber || receiptData.receipts?.cycle || 153984
  
  logger.detail(`  Cycle: ${cycle}`)
  logger.detail(`  Active validators: ${validatorIds.length}`)
  
  // Load config from configvalues.json
  const config = loadTestConfig()
  
  return {
    receipt: receiptData,
    activeValidators: validatorIds,
    cycleNumber: cycle,
    shardConfig: {
      nodesPerConsensusGroup: config.sharding.nodesPerConsensusGroup,
      nodesPerEdge: config.sharding.nodesPerEdge
    }
  }
}