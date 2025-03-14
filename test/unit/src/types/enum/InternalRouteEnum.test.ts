import assert from 'assert';
import { InternalRouteEnum, isAskRoute, isTellRoute } from '../../../../../src/types/enum/InternalRouteEnum';

describe('InternalRouteEnum', () => {
  it('should exist as an enum', () => {
    assert(InternalRouteEnum !== undefined);
    assert(typeof InternalRouteEnum === 'object');
  });

  it('should contain all expected enum values', () => {
    // Test a sample of enum values to ensure they exist and have correct values
    assert.strictEqual(InternalRouteEnum.apoptosize, 'apoptosize');
    assert.strictEqual(InternalRouteEnum.binary_broadcast_state, 'binary/broadcast_state');
    assert.strictEqual(InternalRouteEnum.binary_get_account_data, 'binary/get_account_data');
    assert.strictEqual(InternalRouteEnum.binary_poqo_send_vote, 'binary/poqo_send_vote');
  });

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
      binary_poqo_send_vote: 'binary/poqo_send_vote'
    };

    Object.keys(expectedValues).forEach(key => {
      const enumKey = key as keyof typeof InternalRouteEnum;
      const expectedValue = expectedValues[key as keyof typeof expectedValues];
      assert.strictEqual(InternalRouteEnum[enumKey], expectedValue);
    });
  });

  describe('isAskRoute function', () => {
    it('should correctly identify ask routes', () => {
      // Test known ask routes
      assert.strictEqual(isAskRoute(InternalRouteEnum.binary_get_account_data), true);
      assert.strictEqual(isAskRoute(InternalRouteEnum.binary_compare_cert), true);
      assert.strictEqual(isAskRoute(InternalRouteEnum.binary_request_state_for_tx), true);
      assert.strictEqual(isAskRoute(InternalRouteEnum.apoptosize), true);
    });

    it('should correctly identify non-ask routes', () => {
      // Test known tell routes
      assert.strictEqual(isAskRoute(InternalRouteEnum.binary_broadcast_state), false);
      assert.strictEqual(isAskRoute(InternalRouteEnum.binary_lost_report), false);
      assert.strictEqual(isAskRoute(InternalRouteEnum.binary_gossip), false);
    });

    it('should handle unknown routes', () => {
      assert.strictEqual(isAskRoute('unknown/route'), false);
      assert.strictEqual(isAskRoute(''), false);
    });
  });

  describe('isTellRoute function', () => {
    it('should correctly identify tell routes', () => {
      // Test known tell routes
      assert.strictEqual(isTellRoute(InternalRouteEnum.binary_broadcast_state), true);
      assert.strictEqual(isTellRoute(InternalRouteEnum.binary_lost_report), true);
      assert.strictEqual(isTellRoute(InternalRouteEnum.binary_gossip), true);
    });

    it('should correctly identify apoptosize as both ask and tell route', () => {
      assert.strictEqual(isAskRoute(InternalRouteEnum.apoptosize), true);
      assert.strictEqual(isTellRoute(InternalRouteEnum.apoptosize), true);
    });

    it('should correctly identify non-tell routes', () => {
      // All ask routes except apoptosize should not be tell routes
      assert.strictEqual(isTellRoute(InternalRouteEnum.binary_get_account_data), false);
      assert.strictEqual(isTellRoute(InternalRouteEnum.binary_compare_cert), false);
      assert.strictEqual(isTellRoute(InternalRouteEnum.binary_request_state_for_tx), false);
    });

    it('should handle unknown routes', () => {
      assert.strictEqual(isTellRoute('unknown/route'), true);
      assert.strictEqual(isTellRoute(''), true);
    });
  });

  it('should be usable as a type', () => {
    // Test function that accepts the enum as a parameter
    function processRoute(route: InternalRouteEnum): string {
      return `Processing route: ${route}`;
    }

    const result = processRoute(InternalRouteEnum.binary_get_account_data);
    assert.strictEqual(result, 'Processing route: binary/get_account_data');
  });

  it('should be usable in a switch statement', () => {
    function getRouteType(route: InternalRouteEnum): string {
      switch (route) {
        case InternalRouteEnum.apoptosize:
          return 'Both ask and tell route';
        case InternalRouteEnum.binary_broadcast_state:
          return 'Tell route';
        case InternalRouteEnum.binary_get_account_data:
          return 'Ask route';
        default:
          return 'Unknown route type';
      }
    }

    assert.strictEqual(getRouteType(InternalRouteEnum.apoptosize), 'Both ask and tell route');
    assert.strictEqual(getRouteType(InternalRouteEnum.binary_broadcast_state), 'Tell route');
    assert.strictEqual(getRouteType(InternalRouteEnum.binary_get_account_data), 'Ask route');
  });

  it('should not contain invalid enum values', () => {
    // @ts-expect-error - Testing runtime behavior with invalid value
    assert.strictEqual(InternalRouteEnum.InvalidEnumValue, undefined);
    assert.strictEqual(InternalRouteEnum['NonExistentValue'], undefined);
  });

  it('should handle type checking correctly', () => {
    function isValidRouteType(value: unknown): value is InternalRouteEnum {
      return Object.values(InternalRouteEnum).includes(value as InternalRouteEnum);
    }

    // Positive cases
    assert.strictEqual(isValidRouteType(InternalRouteEnum.binary_get_account_data), true);
    assert.strictEqual(isValidRouteType('binary/get_account_data'), true);
    
    // Negative cases
    assert.strictEqual(isValidRouteType('invalid/route'), false);
    assert.strictEqual(isValidRouteType(123), false);
    assert.strictEqual(isValidRouteType(null), false);
    assert.strictEqual(isValidRouteType(undefined), false);
  });
}); 