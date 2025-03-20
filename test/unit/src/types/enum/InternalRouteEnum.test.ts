import { InternalRouteEnum, isAskRoute, isTellRoute } from '../../../../../src/types/enum/InternalRouteEnum'

describe('InternalRouteEnum', () => {
  it('should exist as an enum', () => {
    expect(InternalRouteEnum).toBeDefined()
    expect(typeof InternalRouteEnum).toBe('object')
  })

  it('should contain all expected enum values', () => {
    // Test a sample of enum values to ensure they exist and have correct values
    expect(InternalRouteEnum.apoptosize).toBe('apoptosize')
    expect(InternalRouteEnum.binary_broadcast_state).toBe('binary/broadcast_state')
    expect(InternalRouteEnum.binary_get_account_data).toBe('binary/get_account_data')
    expect(InternalRouteEnum.binary_poqo_send_vote).toBe('binary/poqo_send_vote')
  })

  it('should have matching key-value pairs', () => {
    // Verify that each enum key matches its expected string value
    const expectedValues = {
      apoptosize: 'apoptosize',
      binary_broadcast_state: 'binary/broadcast_state',
      binary_send_cachedAppData: 'binary/send_cachedAppData',
      binary_get_account_data_with_queue_hints: 'binary/get_account_data_with_queue_hints',
      binary_get_account_queue_count: 'binary/get_account_queue_count',
      binary_get_account_data_by_list: 'binary/get_account_data_by_list',
      binary_broadcast_finalstate: 'binary/broadcast_finalstate',
      binary_get_account_data: 'binary/get_account_data',
      binary_sync_trie_hashes: 'binary/sync_trie_hashes',
      binary_compare_cert: 'binary/compare_cert',
      binary_get_tx_timestamp: 'binary/get_tx_timestamp',
      binary_get_trie_hashes: 'binary/get_trie_hashes',
      binary_get_account_data_by_hashes: 'binary/get_account_data_by_hashes',
      binary_spread_tx_to_group_syncing: 'binary/spread_tx_to_group_syncing',
      binary_request_state_for_tx_post: 'binary/request_state_for_tx_post',
      binary_make_receipt: 'binary/make_receipt',
      binary_spread_appliedVoteHash: 'binary/spread_applied_vote_hash',
      binary_get_globalaccountreport: 'binary/get_globalaccountreport',
      binary_get_confirm_or_challenge: 'binary/get_confirm_or_challenge',
      binary_sign_app_data: 'binary/sign_app_data',
      binary_get_trie_account_hashes: 'binary/get_trie_account_hashes',
      binary_get_cached_app_data: 'binary/get_cached_app_data',
      binary_request_tx_and_state: 'binary/request_tx_and_state',
      binary_request_tx_and_state_before: 'binary/request_tx_and_state_before',
      binary_lost_archiver_investigate: 'binary/lost_archiver_investigate',
      binary_request_state_for_tx: 'binary/request_state_for_tx',
      binary_request_receipt_for_tx: 'binary/request_receipt_for_tx',
      binary_get_applied_vote: 'binary/get_applied_vote',
      binary_lost_report: 'binary/lost_report',
      binary_gossip: 'binary/gossip',
      binary_repair_oos_accounts: 'binary/repair_oos_accounts',
      binary_poqo_send_receipt: 'binary/poqo_send_receipt',
      binary_poqo_data_and_receipt: 'binary/poqo_data_and_receipt',
      binary_poqo_send_vote: 'binary/poqo_send_vote',
    }

    Object.keys(expectedValues).forEach((key) => {
      const enumKey = key as keyof typeof InternalRouteEnum
      const expectedValue = expectedValues[key as keyof typeof expectedValues]
      expect(InternalRouteEnum[enumKey]).toBe(expectedValue)
    })
  })

  describe('isAskRoute function', () => {
    it('should correctly identify ask routes', () => {
      // Test known ask routes
      expect(isAskRoute(InternalRouteEnum.binary_get_account_data)).toBe(true)
      expect(isAskRoute(InternalRouteEnum.binary_compare_cert)).toBe(true)
      expect(isAskRoute(InternalRouteEnum.binary_request_state_for_tx)).toBe(true)
      expect(isAskRoute(InternalRouteEnum.apoptosize)).toBe(true)
    })

    it('should correctly identify non-ask routes', () => {
      // Test known tell routes
      expect(isAskRoute(InternalRouteEnum.binary_broadcast_state)).toBe(false)
      expect(isAskRoute(InternalRouteEnum.binary_lost_report)).toBe(false)
      expect(isAskRoute(InternalRouteEnum.binary_gossip)).toBe(false)
    })

    it('should handle unknown routes', () => {
      expect(isAskRoute('unknown/route')).toBe(false)
      expect(isAskRoute('')).toBe(false)
    })
  })

  describe('isTellRoute function', () => {
    it('should correctly identify tell routes', () => {
      // Test known tell routes
      expect(isTellRoute(InternalRouteEnum.binary_broadcast_state)).toBe(true)
      expect(isTellRoute(InternalRouteEnum.binary_lost_report)).toBe(true)
      expect(isTellRoute(InternalRouteEnum.binary_gossip)).toBe(true)
    })

    it('should correctly identify apoptosize as both ask and tell route', () => {
      expect(isAskRoute(InternalRouteEnum.apoptosize)).toBe(true)
      expect(isTellRoute(InternalRouteEnum.apoptosize)).toBe(true)
    })

    it('should correctly identify non-tell routes', () => {
      // All ask routes except apoptosize should not be tell routes
      expect(isTellRoute(InternalRouteEnum.binary_get_account_data)).toBe(false)
      expect(isTellRoute(InternalRouteEnum.binary_compare_cert)).toBe(false)
      expect(isTellRoute(InternalRouteEnum.binary_request_state_for_tx)).toBe(false)
    })

    it('should handle unknown routes', () => {
      expect(isTellRoute('unknown/route')).toBe(true)
      expect(isTellRoute('')).toBe(true)
    })
  })

  it('should be usable as a type', () => {
    // Test function that accepts the enum as a parameter
    function processRoute(route: InternalRouteEnum): string {
      return `Processing route: ${route}`
    }

    const result = processRoute(InternalRouteEnum.binary_get_account_data)
    expect(result).toBe('Processing route: binary/get_account_data')
  })

  it('should be usable in a switch statement', () => {
    function getRouteType(route: InternalRouteEnum): string {
      switch (route) {
        case InternalRouteEnum.apoptosize:
          return 'Both ask and tell route'
        case InternalRouteEnum.binary_broadcast_state:
          return 'Tell route'
        case InternalRouteEnum.binary_get_account_data:
          return 'Ask route'
        default:
          return 'Unknown route type'
      }
    }

    expect(getRouteType(InternalRouteEnum.apoptosize)).toBe('Both ask and tell route')
    expect(getRouteType(InternalRouteEnum.binary_broadcast_state)).toBe('Tell route')
    expect(getRouteType(InternalRouteEnum.binary_get_account_data)).toBe('Ask route')
  })

  it('should not contain invalid enum values', () => {
    // @ts-expect-error - Testing runtime behavior with invalid value
    expect(InternalRouteEnum.InvalidEnumValue).toBeUndefined()
    expect(InternalRouteEnum['NonExistentValue']).toBeUndefined()
  })

  it('should handle type checking correctly', () => {
    function isValidRouteType(value: unknown): value is InternalRouteEnum {
      return Object.values(InternalRouteEnum).includes(value as InternalRouteEnum)
    }

    // Positive cases
    expect(isValidRouteType(InternalRouteEnum.binary_get_account_data)).toBe(true)
    expect(isValidRouteType('binary/get_account_data')).toBe(true)

    // Negative cases
    expect(isValidRouteType('invalid/route')).toBe(false)
    expect(isValidRouteType(123)).toBe(false)
    expect(isValidRouteType(null)).toBe(false)
    expect(isValidRouteType(undefined)).toBe(false)
  })
})
