/**
 * Interface representing the core flags used in the system.
 */
export interface CoreFlags {
  /**
   * Indicates whether the kill node flag is enabled.
   */
  killNodeFlag: boolean
  /**
   * Indicates whether the network latency is enabled.
   */
  enableNetworkLatency: boolean
  /**
   * The delay in milliseconds for the network latency.
   */
  networkLatency: number
  /**
   * The delay in milliseconds for the syncV2 protocol.
   */
  delaySyncV2: number
  /**
   * Indicates whether the syncV2 delay is enabled.
   */
  enableSyncV2Delay: boolean
  validatorSyncDelay: number
  archiverSyncDelay: number
  standbyNodeSyncDelay: number
  txSyncDelay: number
  latestCycleSyncDelay: number
  enableAlterNetworkAccount: boolean
}

/**
 * The default values for the core flags.
 */
export const CoreFlags: CoreFlags = {
  /**
   * Enables the kill node flag by default.
   */
  killNodeFlag: false,
  /**
   * Enables the network latency feature by default.
   */
  enableNetworkLatency: false,
  /**
   * The delay in milliseconds for the network latency.
   */
  networkLatency: 0,
  delaySyncV2: 120000, // not used currently but can be used to delay syncV2 as a whole
  enableSyncV2Delay: true,
  validatorSyncDelay: 120000, // 2 minutes
  archiverSyncDelay: 120000, // CUMULATIVE DELAY is 10 minutes (2+2+2+2+2)
  standbyNodeSyncDelay: 120000,
  txSyncDelay: 120000,
  latestCycleSyncDelay: 120000,
  enableAlterNetworkAccount: false,
}
