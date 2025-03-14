import assert from 'assert';
import { AJVSchemaEnum } from '../../../../../src/types/enum/AJVSchemaEnum';

describe('AJVSchemaEnum', () => {
  it('should exist as an enum', () => {
    assert(AJVSchemaEnum !== undefined);
    assert(typeof AJVSchemaEnum === 'object');
  });

  it('should contain all expected enum values', () => {
    // Test a sample of enum values to ensure they exist and have correct values
    assert.strictEqual(AJVSchemaEnum.CompareCertReq, 'CompareCertReq');
    assert.strictEqual(AJVSchemaEnum.RepairOOSAccountsReq, 'RepairOOSAccountsReq');
    assert.strictEqual(AJVSchemaEnum.RequestStateForTxReq, 'RequestStateForTxReq');
    assert.strictEqual(AJVSchemaEnum.GetAccountDataResp, 'GetAccountDataResp');
    assert.strictEqual(AJVSchemaEnum.JoinReq, 'JoinReq');
    assert.strictEqual(AJVSchemaEnum.AllowedArchiverResponse, 'AllowedArchiverResponse');
  });

  it('should have matching key-value pairs', () => {
    // Verify that each enum key matches its string value
    Object.keys(AJVSchemaEnum).forEach(key => {
      const value = AJVSchemaEnum[key as keyof typeof AJVSchemaEnum];
      assert.strictEqual(key, value);
    });
  });

  it('should be usable as a type', () => {
    // Test function that accepts the enum as a parameter
    function processSchema(schemaType: AJVSchemaEnum): string {
      return `Processing schema: ${schemaType}`;
    }

    const result = processSchema(AJVSchemaEnum.CompareCertReq);
    assert.strictEqual(result, 'Processing schema: CompareCertReq');
  });

  it('should be usable in a switch statement', () => {
    function getSchemaDescription(schemaType: AJVSchemaEnum): string {
      switch (schemaType) {
        case AJVSchemaEnum.CompareCertReq:
          return 'Certificate comparison request';
        case AJVSchemaEnum.JoinReq:
          return 'Join request';
        default:
          return 'Unknown schema';
      }
    }

    assert.strictEqual(getSchemaDescription(AJVSchemaEnum.CompareCertReq), 'Certificate comparison request');
    assert.strictEqual(getSchemaDescription(AJVSchemaEnum.JoinReq), 'Join request');
    assert.strictEqual(getSchemaDescription(AJVSchemaEnum.GetAccountDataReq), 'Unknown schema');
  });

  it('should not contain invalid enum values', () => {
    // @ts-expect-error - Testing runtime behavior with invalid value
    assert.strictEqual(AJVSchemaEnum.InvalidEnumValue, undefined);
    assert.strictEqual(AJVSchemaEnum['NonExistentValue'], undefined);
  });

  it('should reject invalid assignments at compile time', () => {
    // This is valid and should compile
    const validAssignment: AJVSchemaEnum = AJVSchemaEnum.CompareCertReq;
    assert.strictEqual(validAssignment, 'CompareCertReq');
    
    // Test runtime type checking
    function acceptsOnlyValidEnum(value: AJVSchemaEnum): boolean {
      return Object.values(AJVSchemaEnum).includes(value);
    }
    
    // Valid cases should return true
    assert.strictEqual(acceptsOnlyValidEnum(AJVSchemaEnum.CompareCertReq), true);
    
    // Invalid cases - these would fail at compile time, but we can test runtime behavior
    // @ts-expect-error - Intentionally passing invalid value for testing
    assert.strictEqual(acceptsOnlyValidEnum('InvalidValue'), false);
    
    // @ts-expect-error - Intentionally passing wrong type for testing
    assert.strictEqual(acceptsOnlyValidEnum(123), false);
  });

  it('should handle type checking correctly', () => {
    function isValidSchemaType(value: unknown): value is AJVSchemaEnum {
      return Object.values(AJVSchemaEnum).includes(value as AJVSchemaEnum);
    }

    // Positive cases
    assert.strictEqual(isValidSchemaType(AJVSchemaEnum.CompareCertReq), true);
    assert.strictEqual(isValidSchemaType('CompareCertReq'), true);
    
    // Negative cases
    assert.strictEqual(isValidSchemaType('InvalidValue'), false);
    assert.strictEqual(isValidSchemaType(123), false);
    assert.strictEqual(isValidSchemaType(null), false);
    assert.strictEqual(isValidSchemaType(undefined), false);
  });
}); 