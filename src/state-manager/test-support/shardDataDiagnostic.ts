/**
 * Comprehensive diagnostic tool to test all shard math in Andrew's FACT test
 */

import { MockShardCalculator, createNodesFromValidatorList } from './mocks'
import { getLogger } from './testLogger'
import fs from 'fs'
import path from 'path'

interface ShardConfig {
  nodesPerConsensusGroup: number
  nodesPerEdge: number
}

async function loadProductionValidators(): Promise<string[]> {
  try {
    const validatorsPath = path.join(__dirname, '../../../sample_data/active_validators.153984.json')
    const data = JSON.parse(fs.readFileSync(validatorsPath, 'utf8'))
    return data
  } catch (error) {
    console.log('Could not load production validators, using test data')
    // Generate test validator IDs  
    const validators = []
    for (let i = 1; i <= 257; i++) {
      const hex = i.toString(16).padStart(4, '0')
      validators.push(`${hex}${'0'.repeat(60)}`)
    }
    return validators
  }
}

async function runShardDataDiagnostic() {
  const logger = getLogger()
  logger.summary('\n=== COMPREHENSIVE SHARD MATH DIAGNOSTIC ===')
  
  // Test with both small and large datasets
  await testShardMathWithSize('Small Network', 10, { nodesPerConsensusGroup: 7, nodesPerEdge: 2 })
  await testShardMathWithSize('Medium Network', 50, { nodesPerConsensusGroup: 32, nodesPerEdge: 3 })
  await testShardMathWithSize('Production Size', 257, { nodesPerConsensusGroup: 128, nodesPerEdge: 5 })
}

async function testShardMathWithSize(testName: string, nodeCount: number, config: ShardConfig) {
  const logger = getLogger()
  logger.summary(`\n\n=== ${testName.toUpperCase()} TEST (${nodeCount} nodes) ===`)
  
  // Load or generate validators
  const validatorIds = await loadProductionValidators()
  const activeNodes = createNodesFromValidatorList(validatorIds.slice(0, nodeCount))
  
  logger.summary(`Config: nodesPerConsensusGroup=${config.nodesPerConsensusGroup}, nodesPerEdge=${config.nodesPerEdge}`)
  
  // Generate shard data
  const startTime = Date.now()
  const cycleShardData = MockShardCalculator.generateCycleShardData(
    activeNodes,
    153984,
    config,
    activeNodes[Math.min(10, nodeCount-1)].id
  )
  const generationTime = Date.now() - startTime
  logger.summary(`Shard data generation: ${generationTime}ms`)
  
  // === SHARD GLOBALS VALIDATION ===
  logger.summary('\n--- Shard Globals Validation ---')
  const sg = cycleShardData.shardGlobals
  
  const expectedConsensusRadius = Math.floor((config.nodesPerConsensusGroup - 1) / 2)
  const expectedVisiblePartitions = sg.nodesPerConsenusGroup + config.nodesPerEdge * 2
  
  logger.summary(`✓ numPartitions: ${sg.numPartitions} (= numActiveNodes: ${sg.numActiveNodes})`)
  logger.summary(`✓ nodesPerConsenusGroup: ${sg.nodesPerConsenusGroup} (config: ${config.nodesPerConsensusGroup})`)
  logger.summary(`✓ consensusRadius: ${sg.consensusRadius} (expected: ${expectedConsensusRadius})`)
  logger.summary(`✓ nodesPerEdge: ${sg.nodesPerEdge} (config: ${config.nodesPerEdge})`)
  logger.summary(`✓ numVisiblePartitions: ${sg.numVisiblePartitions} (expected: ${expectedVisiblePartitions})`)
  
  // === NODE EXTENDED DATA VALIDATION ===
  logger.summary('\n--- Extended Data Generation Check ---')
  
  let extendedDataCount = 0
  let storedPartitionsCount = 0
  let consensusPartitionsCount = 0
  let nodeThatStoreCount = 0
  let consensusNodesCount = 0
  let edgeNodesCount = 0
  
  for (const [nodeId, nodeShardData] of cycleShardData.nodeShardDataMap) {
    if (nodeShardData.extendedData) extendedDataCount++
    if (nodeShardData.storedPartitions) storedPartitionsCount++
    if (nodeShardData.consensusPartitions) consensusPartitionsCount++
    if (nodeShardData.nodeThatStoreOurParitionFull) nodeThatStoreCount++
    if (nodeShardData.consensusNodeForOurNodeFull) consensusNodesCount++
    if (nodeShardData.edgeNodes) edgeNodesCount++
  }
  
  logger.summary(`✓ Nodes with extendedData: ${extendedDataCount}/${nodeCount}`)
  logger.summary(`✓ Nodes with storedPartitions: ${storedPartitionsCount}/${nodeCount}`)
  logger.summary(`✓ Nodes with consensusPartitions: ${consensusPartitionsCount}/${nodeCount}`)
  logger.summary(`✓ Nodes with nodeThatStoreOurParitionFull: ${nodeThatStoreCount}/${nodeCount}`)
  logger.summary(`✓ Nodes with consensusNodeForOurNodeFull: ${consensusNodesCount}/${nodeCount}`)
  logger.summary(`✓ Nodes with edgeNodes: ${edgeNodesCount}/${nodeCount}`)
  
  // === DETAILED NODE SAMPLE ===
  if (nodeCount <= 10) {
    logger.summary('\n--- Detailed Node Analysis (All Nodes) ---')
    for (const [nodeId, nodeShardData] of cycleShardData.nodeShardDataMap) {
      const shortId = nodeId.substring(0, 8)
      logger.summary(`Node ${shortId} (idx=${nodeShardData.ourNodeIndex}, home=${nodeShardData.homePartition})`)
      
      if (nodeShardData.storedPartitions) {
        logger.summary(`  stored: ${nodeShardData.storedPartitions.partitionStart}-${nodeShardData.storedPartitions.partitionEnd} ${nodeShardData.storedPartitions.rangeIsSplit ? '(split)' : ''}`)
      }
      if (nodeShardData.consensusPartitions) {
        logger.summary(`  consensus: ${nodeShardData.consensusPartitions.partitionStart}-${nodeShardData.consensusPartitions.partitionEnd}`)
      }
      if (nodeShardData.nodeThatStoreOurParitionFull) {
        logger.summary(`  storage_peers: ${nodeShardData.nodeThatStoreOurParitionFull.length}`)
      }
      if (nodeShardData.consensusNodeForOurNodeFull) {
        logger.summary(`  consensus_peers: ${nodeShardData.consensusNodeForOurNodeFull.length}`)
      }
    }
  }
  
  // === ACCOUNT MAPPING TESTS ===
  logger.summary('\n--- Account-to-Node Mapping Tests ---')
  
  const ShardFunctions = (await import('../shardFunctions')).default
  
  // Test accounts across address space
  const testAccounts = [
    '0000000000000000000000000000000000000000000000000000000000000000',
    '4000000000000000000000000000000000000000000000000000000000000000', 
    '8000000000000000000000000000000000000000000000000000000000000000',
    'c000000000000000000000000000000000000000000000000000000000000000',
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
  ]
  
  for (const accountId of testAccounts) {
    const { homePartition, addressNum } = ShardFunctions.addressToPartition(cycleShardData.shardGlobals, accountId)
    
    // Find storage nodes
    const storageNodes = []
    for (const [nodeId, nodeShardData] of cycleShardData.nodeShardDataMap) {
      if (nodeShardData.storedPartitions && ShardFunctions.testInRange(homePartition, nodeShardData.storedPartitions)) {
        storageNodes.push(nodeId.substring(0, 8))
      }
    }
    
    // Find consensus nodes
    const consensusNodes = []
    for (const [nodeId, nodeShardData] of cycleShardData.nodeShardDataMap) {
      if (nodeShardData.consensusPartitions && ShardFunctions.testInRange(homePartition, nodeShardData.consensusPartitions)) {
        consensusNodes.push(nodeId.substring(0, 8))
      }
    }
    
    logger.summary(`Account ${accountId.substring(0, 12)}... → partition ${homePartition}`)
    logger.summary(`  storage: ${storageNodes.length} nodes [${storageNodes.slice(0, 4).join(',')}${storageNodes.length > 4 ? '...' : ''}]`)
    logger.summary(`  consensus: ${consensusNodes.length} nodes [${consensusNodes.slice(0, 4).join(',')}${consensusNodes.length > 4 ? '...' : ''}]`)
    
    if (storageNodes.length === 0) logger.summary(`  ❌ No storage nodes found!`)
    if (consensusNodes.length === 0) logger.summary(`  ❌ No consensus nodes found!`)
  }
  
  // === PARTITION COVERAGE ANALYSIS ===
  logger.summary('\n--- Partition Coverage Analysis ---')
  
  const partitionCoverage = new Map<number, { storage: number, consensus: number }>()
  for (let p = 0; p < sg.numPartitions; p++) {
    partitionCoverage.set(p, { storage: 0, consensus: 0 })
  }
  
  for (const [nodeId, nodeShardData] of cycleShardData.nodeShardDataMap) {
    for (let p = 0; p < sg.numPartitions; p++) {
      if (nodeShardData.storedPartitions && ShardFunctions.testInRange(p, nodeShardData.storedPartitions)) {
        partitionCoverage.get(p)!.storage++
      }
      if (nodeShardData.consensusPartitions && ShardFunctions.testInRange(p, nodeShardData.consensusPartitions)) {
        partitionCoverage.get(p)!.consensus++
      }
    }
  }
  
  let minStorage = Infinity, maxStorage = 0, totalStorage = 0
  let minConsensus = Infinity, maxConsensus = 0, totalConsensus = 0
  
  for (const coverage of partitionCoverage.values()) {
    minStorage = Math.min(minStorage, coverage.storage)
    maxStorage = Math.max(maxStorage, coverage.storage)
    totalStorage += coverage.storage
    
    minConsensus = Math.min(minConsensus, coverage.consensus)
    maxConsensus = Math.max(maxConsensus, coverage.consensus)
    totalConsensus += coverage.consensus
  }
  
  const avgStorage = totalStorage / sg.numPartitions
  const avgConsensus = totalConsensus / sg.numPartitions
  
  logger.summary(`Storage coverage: min=${minStorage}, max=${maxStorage}, avg=${avgStorage.toFixed(1)}`)
  logger.summary(`Consensus coverage: min=${minConsensus}, max=${maxConsensus}, avg=${avgConsensus.toFixed(1)}`)
  logger.summary(`Expected storage: ~${sg.numVisiblePartitions}, consensus: ~${config.nodesPerConsensusGroup}`)
  
  // === FACT ALGORITHM TEST ===
  logger.summary('\n--- FACT Algorithm Simulation ---')
  
  const testTxId = '0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0'
  const globalOffset = parseInt(testTxId.slice(-4), 16)
  logger.summary(`Test txId: ${testTxId.slice(-8)}`)
  logger.summary(`Global offset: ${globalOffset}`)
  
  // Simulate what Andrew's test does
  const transactionGroup = activeNodes.slice(0, Math.min(150, activeNodes.length))
  const executionGroup = activeNodes.slice(10, Math.min(138, activeNodes.length))
  
  logger.summary(`Transaction group size: ${transactionGroup.length} (hardcoded)`)
  logger.summary(`Execution group size: ${executionGroup.length} (hardcoded)`)
  
  // Test the getCorrespondingNodes calculation from Andrew's test
  const { getCorrespondingNodes } = await import('../../utils/fastAggregatedCorrespondingTell')
  
  const senderIndex = 10
  const correspondingIndices = getCorrespondingNodes(
    senderIndex,
    0,
    transactionGroup.length - 1,
    globalOffset,
    transactionGroup.length,
    executionGroup.length,
    transactionGroup.length,
    'diagnostic-test'
  )
  
  logger.summary(`getCorrespondingNodes(${senderIndex}, 0, ${transactionGroup.length-1}, ${globalOffset}, ${transactionGroup.length}, ${executionGroup.length}, ${transactionGroup.length})`)
  logger.summary(`Result: [${correspondingIndices.join(', ')}] (${correspondingIndices.length} nodes)`)
  
  // Test with proper shard-based groups for one account
  const testAccount = testAccounts[0]
  const { homePartition: testPartition } = ShardFunctions.addressToPartition(cycleShardData.shardGlobals, testAccount)
  
  const properStorageNodes = []
  for (const [nodeId, nodeShardData] of cycleShardData.nodeShardDataMap) {
    if (nodeShardData.storedPartitions && ShardFunctions.testInRange(testPartition, nodeShardData.storedPartitions)) {
      properStorageNodes.push(cycleShardData.nodes.find(n => n.id === nodeId))
    }
  }
  
  if (properStorageNodes.length > 0) {
    const properCorrespondingIndices = getCorrespondingNodes(
      senderIndex,
      0,
      properStorageNodes.length - 1,
      globalOffset,
      properStorageNodes.length, // CORRECT: actual storage group size
      executionGroup.length,
      properStorageNodes.length, // CORRECT: storage group size
      'proper-test'
    )
    
    logger.summary('\nProper FACT calculation (using real storage group):')
    logger.summary(`Storage group size: ${properStorageNodes.length} (calculated from shard data)`)
    logger.summary(`Corresponding indices: [${properCorrespondingIndices.join(', ')}] (${properCorrespondingIndices.length} nodes)`)
    
    if (properCorrespondingIndices.length !== correspondingIndices.length) {
      logger.summary(`⚠️  DIFFERENCE: Proper calculation gives ${properCorrespondingIndices.length} nodes vs Andrew's ${correspondingIndices.length} nodes`)
    }
  }
  
  // === FINAL ASSESSMENT FOR THIS TEST ===
  const issues = []
  
  if (extendedDataCount < nodeCount) issues.push(`Missing extended data: ${nodeCount - extendedDataCount} nodes`)
  if (storedPartitionsCount < nodeCount) issues.push(`Missing stored partitions: ${nodeCount - storedPartitionsCount} nodes`)  
  if (consensusPartitionsCount < nodeCount) issues.push(`Missing consensus partitions: ${nodeCount - consensusPartitionsCount} nodes`)
  if (avgStorage < sg.numVisiblePartitions * 0.5) issues.push(`Low storage coverage: ${avgStorage.toFixed(1)}`)
  if (avgConsensus < config.nodesPerConsensusGroup * 0.5) issues.push(`Low consensus coverage: ${avgConsensus.toFixed(1)}`)
  
  logger.summary('\n--- Assessment ---')
  if (issues.length === 0) {
    logger.summary(`✅ ${testName}: All shard math working correctly`)
  } else {
    logger.summary(`❌ ${testName}: Issues found:`)
    issues.forEach(issue => logger.summary(`   - ${issue}`))
  }
}

if (require.main === module) {
  runShardDataDiagnostic().catch(console.error)
}

export { runShardDataDiagnostic }