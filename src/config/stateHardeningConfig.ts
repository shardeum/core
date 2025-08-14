import * as Context from '../p2p/Context'
import { StrictServerConfiguration } from '../shardus/shardus-types'

/**
 * Configuration helper for state hardening features
 * Provides centralized access to state hardening configuration with defaults
 */
export class StateHardeningConfig {
  /**
   * Get the current configuration or use defaults
   */
  private static getConfig(): StrictServerConfiguration {
    return Context.config || {} as StrictServerConfiguration
  }

  /**
   * Check if rate limiting is effectively enabled
   * (not disabled by setting limits to very high values)
   */
  static isRateLimitingEnabled(): boolean {
    const config = this.getConfig().stateManager
    if (!config) return false

    // Check if dissent rate limiting is effectively disabled
    const dissentDisabled = config.dissentGossipMaxPerTx === 0 || 
                           config.dissentGossipMaxPerTx > 1000 ||
                           config.dissentGossipGlobalRate > 10000

    // Check if correction rate limiting is effectively disabled
    const correctionDisabled = config.correctionGossipMaxPerAccount === 0 ||
                              config.correctionGossipMaxPerAccount > 1000 ||
                              config.correctionGossipWindow < 10

    return !dissentDisabled && !correctionDisabled
  }

  /**
   * Get the effective dissent rate limit
   * Returns 0 if rate limiting is disabled
   */
  static getEffectiveDissentLimit(): number {
    const config = this.getConfig().stateManager
    if (!config) return 0

    // If set to 0 or very high, treat as disabled
    if (config.dissentGossipMaxPerTx === 0 || config.dissentGossipMaxPerTx > 1000) {
      return 0
    }

    return config.dissentGossipMaxPerTx
  }

  /**
   * Check if a specific state hardening feature is enabled
   */
  static shouldEnableFeature(feature: StateHardeningFeature): boolean {
    const config = this.getConfig().stateManager
    if (!config) return false

    switch (feature) {
      case 'beforeStateDissentDetection':
        return config.enableBeforeStateDissentDetection === true

      case 'factBeforeSpread':
        return config.enableBeforeStateDissentDetection === true && 
               config.factBeforeSpreadFactor > 1

      case 'recentReceiptBuffer':
        return config.recentReceiptBufferSize > 0 && 
               config.recentReceiptTTL > 0

      case 'archiverLookup':
        return config.enableArchiverLookupForDissent === true

      case 'conflictResolutionDelays':
        return config.enableConflictResolutionDelays === true

      case 'transactionRequeue':
        return config.enableTransactionRequeue === true

      case 'stateCorrectionGossip':
        return config.stateCorrectionGossipEnabled === true

      case 'waitForStateResolution':
        return config.waitForStateResolution === true

      case 'aggressiveStateSync':
        return config.aggressiveStateSync === true

      case 'validateStatesBeforeReceipt':
        return config.validateStatesBeforeReceipt === true

      default:
        return false
    }
  }

  /**
   * Get the spread factor for before-state FACT messages
   */
  static getFactBeforeSpreadFactor(): number {
    const config = this.getConfig().stateManager
    return config?.factBeforeSpreadFactor || 1
  }

  /**
   * Get the recent receipt buffer configuration
   */
  static getReceiptBufferConfig(): {
    size: number
    ttl: number
  } {
    const config = this.getConfig().stateManager
    return {
      size: config?.recentReceiptBufferSize || 1000,
      ttl: config?.recentReceiptTTL || 60000
    }
  }

  /**
   * Get archiver query configuration
   */
  static getArchiverQueryConfig(): {
    enabled: boolean
    maxQueries: number
  } {
    const config = this.getConfig().stateManager
    return {
      enabled: config?.enableArchiverLookupForDissent || false,
      maxQueries: config?.maxArchiverReceiptQueriesPerTx || 2
    }
  }

  /**
   * Get conflict resolution delay configuration
   */
  static getDelayConfig(): {
    enabled: boolean
    initialDelay: number
    maxDelay: number
  } {
    const config = this.getConfig().stateManager
    return {
      enabled: config?.enableConflictResolutionDelays || false,
      initialDelay: config?.beforeStateDissentDelayMs || 1000,
      maxDelay: config?.maxDissentDelayMs || 3000
    }
  }

  /**
   * Get transaction requeue configuration
   */
  static getRequeueConfig(): {
    enabled: boolean
    maxAttempts: number
  } {
    const config = this.getConfig().stateManager
    return {
      enabled: config?.enableTransactionRequeue || false,
      maxAttempts: config?.maxRequeueAttempts || 3
    }
  }

  /**
   * Get gossip configuration
   */
  static getGossipConfig(): {
    correctionEnabled: boolean
    messageTTL: number
    cacheSize: number
    dissentMaxPerTx: number
    dissentGlobalRate: number
    correctionMaxPerAccount: number
    correctionWindow: number
  } {
    const config = this.getConfig().stateManager
    return {
      correctionEnabled: config?.stateCorrectionGossipEnabled || false,
      messageTTL: config?.gossipMessageTTL || 30000,
      cacheSize: config?.gossipCacheSize || 10000,
      dissentMaxPerTx: config?.dissentGossipMaxPerTx || 3,
      dissentGlobalRate: config?.dissentGossipGlobalRate || 10,
      correctionMaxPerAccount: config?.correctionGossipMaxPerAccount || 1,
      correctionWindow: config?.correctionGossipWindow || 60000
    }
  }

  /**
   * Get minimum dissent observers required
   */
  static getMinDissentObservers(): number {
    const config = this.getConfig().stateManager
    return config?.minDissentObservers || 2
  }

  /**
   * Get aggressive state sync configuration
   */
  static getAggressiveSyncConfig(): {
    enabled: boolean
    timeout: number
    maxRetries: number
    retryDelay: number
  } {
    const config = this.getConfig().stateManager
    return {
      enabled: config?.aggressiveStateSync || false,
      timeout: config?.stateConflictResolutionTimeout || 5000,
      maxRetries: config?.maxStateValidationRetries || 3,
      retryDelay: config?.stateValidationRetryDelay || 500
    }
  }

  /**
   * Check if we should allow mismatches in conflict scenarios (for testing)
   */
  static allowMismatchInConflictScenarios(): boolean {
    const config = this.getConfig().stateManager
    return config?.allowMismatchInConflictScenarios === true
  }

  /**
   * Get all state hardening configuration as a summary
   */
  static getConfigSummary(): Record<string, unknown> {
    const config = this.getConfig().stateManager
    if (!config) return { enabled: false }

    return {
      phase1: {
        detection: this.shouldEnableFeature('beforeStateDissentDetection'),
        spreadFactor: this.getFactBeforeSpreadFactor()
      },
      phase2: {
        receiptBuffer: this.getReceiptBufferConfig(),
        archiverQueries: this.getArchiverQueryConfig(),
        delays: this.getDelayConfig(),
        requeue: this.getRequeueConfig()
      },
      phase3: {
        gossip: this.getGossipConfig(),
        rateLimiting: this.isRateLimitingEnabled()
      },
      aggressiveSync: this.getAggressiveSyncConfig(),
      testing: {
        allowMismatch: this.allowMismatchInConflictScenarios()
      }
    }
  }
}

/**
 * Enumeration of state hardening features
 */
export type StateHardeningFeature = 
  | 'beforeStateDissentDetection'
  | 'factBeforeSpread'
  | 'recentReceiptBuffer'
  | 'archiverLookup'
  | 'conflictResolutionDelays'
  | 'transactionRequeue'
  | 'stateCorrectionGossip'
  | 'waitForStateResolution'
  | 'aggressiveStateSync'
  | 'validateStatesBeforeReceipt'