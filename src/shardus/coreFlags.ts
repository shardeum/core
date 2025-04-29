/**
 * Interface representing the core flags used in the system.
 */
export interface CoreFlags {
  /**
   * Indicates whether the contract storage key silo feature is enabled.
   */
  contractStorageKeySilo: boolean
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
}

/**
 * The default values for the core flags.
 */
export const CoreFlags: CoreFlags = {
  /**
   * Enables the contract storage key silo feature by default.
   */
  contractStorageKeySilo: true,
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
}
