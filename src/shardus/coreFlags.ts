/**
 * Interface representing the core flags used in the system.
 */
export interface CoreFlags {
  /**
   * Indicates whether the contract storage key silo feature is enabled.
   */
  contractStorageKeySilo: boolean
}

/**
 * The default values for the core flags.
 */
export const CoreFlags: CoreFlags = {
  /**
   * Enables the contract storage key silo feature by default.
   */
  contractStorageKeySilo: true,
}
