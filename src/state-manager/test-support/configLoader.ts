/**
 * Config loader for FACT tests
 * Loads configuration from configvalues.json
 */

import fs from 'fs'
import path from 'path'
import { getLogger } from './testLogger'

export interface TestConfig {
  sharding: {
    executeInOneShard: boolean
    nodesPerConsensusGroup: number
    nodesPerEdge: number
  }
  stateManager: {
    useAccountWritesOnly?: boolean
    usePOQo?: boolean
    correspondingTellUseUnwrapped?: boolean
    concatCorrespondingTellUseUnwrapped?: boolean
    avoidOurIndexInFactTell?: boolean
  }
  p2p: {
    useFactCorrespondingTell?: boolean
    cycleDuration?: number
  }
}

/**
 * Load configuration from sample_data/configvalues.json
 */
export function loadTestConfig(configPath?: string): TestConfig {
  const defaultPath = path.join(__dirname, '../../../sample_data/configvalues.json')
  const pathToUse = configPath || defaultPath
  
  const logger = getLogger()
  logger.detail(`Loading config from: ${pathToUse}`)
  
  try {
    const configData = fs.readFileSync(pathToUse, 'utf8')
    const fullConfig = JSON.parse(configData)
    
    // Extract the relevant sections for testing
    const testConfig: TestConfig = {
      sharding: {
        executeInOneShard: fullConfig.sharding?.executeInOneShard ?? true,
        nodesPerConsensusGroup: fullConfig.sharding?.nodesPerConsensusGroup ?? 128,
        nodesPerEdge: fullConfig.sharding?.nodesPerEdge ?? 5
      },
      stateManager: {
        useAccountWritesOnly: fullConfig.stateManager?.useAccountWritesOnly ?? false,
        usePOQo: fullConfig.stateManager?.usePOQo ?? true,
        correspondingTellUseUnwrapped: fullConfig.stateManager?.correspondingTellUseUnwrapped ?? true,
        concatCorrespondingTellUseUnwrapped: fullConfig.stateManager?.concatCorrespondingTellUseUnwrapped ?? true,
        avoidOurIndexInFactTell: fullConfig.stateManager?.avoidOurIndexInFactTell ?? false
      },
      p2p: {
        useFactCorrespondingTell: fullConfig.p2p?.useFactCorrespondingTell ?? true,
        cycleDuration: fullConfig.p2p?.cycleDuration ?? 60
      }
    }
    
    logger.detail('Loaded config:')
    logger.detail(`  - executeInOneShard: ${testConfig.sharding.executeInOneShard}`)
    logger.detail(`  - nodesPerConsensusGroup: ${testConfig.sharding.nodesPerConsensusGroup}`)
    logger.detail(`  - nodesPerEdge: ${testConfig.sharding.nodesPerEdge}`)
    logger.detail(`  - usePOQo: ${testConfig.stateManager.usePOQo}`)
    logger.detail(`  - useFactCorrespondingTell: ${testConfig.p2p.useFactCorrespondingTell}`)
    
    return testConfig
  } catch (error) {
    logger.error(`Failed to load config from ${pathToUse}: ${error.message}`)
    logger.detail('Using default config values')
    
    // Return default values
    return {
      sharding: {
        executeInOneShard: true,
        nodesPerConsensusGroup: 128,
        nodesPerEdge: 5
      },
      stateManager: {
        useAccountWritesOnly: false,
        usePOQo: true,
        correspondingTellUseUnwrapped: true,
        concatCorrespondingTellUseUnwrapped: true,
        avoidOurIndexInFactTell: false
      },
      p2p: {
        useFactCorrespondingTell: true,
        cycleDuration: 60
      }
    }
  }
}

/**
 * Apply config to mock objects
 */
export function applyConfigToMocks(mockQueue: any, config: TestConfig): void {
  // Apply sharding config
  if (mockQueue.config) {
    mockQueue.config.sharding = config.sharding
    mockQueue.config.stateManager = {
      ...mockQueue.config.stateManager,
      ...config.stateManager
    }
    mockQueue.config.p2p = config.p2p
  }
  
  // Set executeInOneShard flag
  mockQueue.executeInOneShard = config.sharding.executeInOneShard
  
  // Set stateManager config
  if (mockQueue.stateManager) {
    mockQueue.stateManager.config = config.stateManager
    mockQueue.stateManager.useAccountWritesOnly = config.stateManager.useAccountWritesOnly
  }
  
  const logger = getLogger()
  logger.detail(`Applied config to mock queue: executeInOneShard=${mockQueue.executeInOneShard}`)
}