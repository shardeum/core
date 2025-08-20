/**
 * Mock tests for FACT protocol
 * No unit test framework - just console output
 */

import { FACTOfflineTester, loadTestScenario } from './factOfflineTester'
import { getLogger, closeLogger } from './testLogger'
import path from 'path'

// Test configuration
const SAMPLE_DATA_DIR = path.join(__dirname, '../../../sample_data')
const RECEIPT_FILE = 'receipt.1.json'
const VALIDATORS_FILE = 'active_validators.153984.json'

/**
 * Run basic FACT simulation test
 */
async function runBasicTest() {
  const logger = getLogger()
  logger.summary('================================================')
  logger.summary('FACT Protocol Test - Full Validator Set')
  logger.summary('================================================\n')
  
  try {
    // Load test scenario with all validators from the file
    const scenario = loadTestScenario(
      path.join(SAMPLE_DATA_DIR, RECEIPT_FILE),
      path.join(SAMPLE_DATA_DIR, VALIDATORS_FILE)
    )
    
    logger.summary(`Using all ${scenario.activeValidators.length} validators from active_validators.153984.json`)
    
    // Create tester
    const tester = new FACTOfflineTester()
    
    // Run simulation
    const results = await tester.simulateTransaction(scenario)
    
    // Print results
    tester.printResults()
    
    // Check for issues
    logger.summary('\n================================================')
    logger.summary('Test Analysis')
    logger.summary('================================================\n')
    
    const coveragePercent = (results.nodesReached / results.totalInTransactionGroup) * 100
    logger.summary(`Coverage: ${coveragePercent.toFixed(1)}%`)
    
    if (coveragePercent < 50) {
      logger.summary('⚠️  WARNING: Low coverage detected!')
    } else if (coveragePercent < 80) {
      logger.summary('⚠️  Coverage could be improved')
    } else {
      logger.summary('✓ Good coverage achieved')
    }
    
    if (results.accountsMissing.size > 0) {
      logger.summary(`⚠️  ${results.accountsMissing.size} accounts have missing coverage`)
    } else {
      logger.summary('✓ All accounts fully covered')
    }
    
    if (results.messagesRejected > 0) {
      const rejectionRate = (results.messagesRejected / (results.messagesAccepted + results.messagesRejected)) * 100
      logger.summary(`⚠️  Rejection rate: ${rejectionRate.toFixed(1)}%`)
    } else {
      logger.summary('✓ No messages rejected')
    }
    
  } catch (error) {
    logger.error('Test failed with error:', error as Error)
  }
}

/**
 * Run test with custom transaction and execution groups
 */
async function runCustomGroupTest() {
  const logger = getLogger()
  logger.summary('\n\n================================================')
  logger.summary('Custom Group Test (Specific Node Selection)')
  logger.summary('================================================\n')
  
  try {
    // Load base scenario with full validator list
    const scenario = loadTestScenario(
      path.join(SAMPLE_DATA_DIR, RECEIPT_FILE),
      path.join(SAMPLE_DATA_DIR, VALIDATORS_FILE)
    )
    
    // Ensure we're using all validators from the file
    logger.summary(`Loaded ${scenario.activeValidators.length} validators from file`)
    
    // Override with specific groups
    // Use first 200 validators as transaction group
    scenario.transactionGroup = scenario.activeValidators.slice(0, 200)
    
    // Use validators 10-137 as execution group (128 nodes)
    scenario.executionGroup = scenario.activeValidators.slice(10, 138)
    
    logger.summary('Custom group configuration:')
    logger.summary(`  Total active validators: ${scenario.activeValidators.length}`)
    logger.summary(`  Transaction group: ${scenario.transactionGroup.length} nodes`)
    logger.summary(`  Execution group: ${scenario.executionGroup.length} nodes`)
    
    // Create tester
    const tester = new FACTOfflineTester()
    
    // Run simulation
    const results = await tester.simulateTransaction(scenario)
    
    // Print results
    tester.printResults()
    
  } catch (error) {
    logger.error('Custom group test failed:', error as Error)
  }
}

/**
 * Test with smaller subset of validators
 */
async function runMinimalTest() {
  const logger = getLogger()
  logger.summary('\n\n================================================')
  logger.summary('Smaller Network Test (Subset of Validators)')
  logger.summary('================================================\n')
  
  try {
    // Create scenario with a smaller subset of validators to test reduced network
    const scenario = loadTestScenario(
      path.join(SAMPLE_DATA_DIR, RECEIPT_FILE),
      path.join(SAMPLE_DATA_DIR, VALIDATORS_FILE)
    )
    
    // Use 150 validators for a smaller but functional test
    // This ensures we have enough nodes for both transaction and execution groups
    scenario.activeValidators = scenario.activeValidators.slice(0, 150)
    
    // Note: shardConfig will be overridden by configvalues.json in setupEnvironment
    
    logger.summary('Smaller network configuration:')
    logger.summary(`  Active validators: ${scenario.activeValidators.length}`)
    logger.summary(`  Config will use values from configvalues.json`)
    
    // Create tester
    const tester = new FACTOfflineTester()
    
    // Run simulation
    const results = await tester.simulateTransaction(scenario)
    
    // Print results
    tester.printResults()
    
  } catch (error) {
    logger.error('Minimal test failed:', error as Error)
  }
}

/**
 * Main test runner
 */
async function main() {
  const logger = getLogger()
  
  // Check for -all flag
  const runAll = process.argv.includes('-all')
  
  logger.summary('Starting FACT Protocol Tests...\n')
  logger.detail(`Working directory: ${process.cwd()}`)
  logger.detail(`Sample data directory: ${SAMPLE_DATA_DIR}\n`)
  
  if (runAll) {
    logger.summary('Running all test scenarios (-all flag detected)\n')
    // Run all tests sequentially
    await runBasicTest()
    await runCustomGroupTest()
    await runMinimalTest()
    
    logger.summary('\n\n================================================')
    logger.summary('All Tests Complete')
    logger.summary('================================================\n')
  } else {
    logger.summary('Running default test (Full Validator Set)')
    logger.summary('Use -all flag to run additional test scenarios\n')
    // Run only the most realistic test
    await runBasicTest()
    
    logger.summary('\n\n================================================')
    logger.summary('Test Complete')
    logger.summary('================================================\n')
  }
  
  // Close the logger when done
  logger.summary(`\n📝 Full log saved to: ${logger.getLogFilePath()}`)
  closeLogger()
}

// Run tests if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    const logger = getLogger()
    logger.error('Fatal error in test runner:', error)
    closeLogger()
    process.exit(1)
  })
}

// Export for use in other tests
export { runBasicTest, runCustomGroupTest, runMinimalTest }