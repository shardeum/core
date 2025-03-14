import assert from 'assert';
import { AppObjEnum } from '../../../../../src/types/enum/AppObjEnum';

describe('AppObjEnum', () => {
  it('should exist as an enum', () => {
    assert(AppObjEnum !== undefined);
    assert(typeof AppObjEnum === 'object');
  });

  it('should contain all expected enum values', () => {
    // Test all enum values to ensure they exist and have correct values
    assert.strictEqual(AppObjEnum.AppData, 'AppData');
    assert.strictEqual(AppObjEnum.CachedAppData, 'CachedAppData');
  });

  it('should have matching key-value pairs', () => {
    // Verify that each enum key matches its string value
    Object.keys(AppObjEnum).forEach(key => {
      const value = AppObjEnum[key as keyof typeof AppObjEnum];
      assert.strictEqual(key, value);
    });
  });

  it('should be usable as a type', () => {
    // Test function that accepts the enum as a parameter
    function processAppObj(objType: AppObjEnum): string {
      return `Processing app object: ${objType}`;
    }

    const result = processAppObj(AppObjEnum.AppData);
    assert.strictEqual(result, 'Processing app object: AppData');
  });

  it('should be usable in a switch statement', () => {
    function getObjectDescription(objType: AppObjEnum): string {
      switch (objType) {
        case AppObjEnum.AppData:
          return 'Application data object';
        case AppObjEnum.CachedAppData:
          return 'Cached application data object';
        default:
          return 'Unknown object type';
      }
    }

    assert.strictEqual(getObjectDescription(AppObjEnum.AppData), 'Application data object');
    assert.strictEqual(getObjectDescription(AppObjEnum.CachedAppData), 'Cached application data object');
  });

  it('should not contain invalid enum values', () => {
    // @ts-expect-error - Testing runtime behavior with invalid value
    assert.strictEqual(AppObjEnum.InvalidEnumValue, undefined);
    assert.strictEqual(AppObjEnum['NonExistentValue'], undefined);
  });

  it('should reject invalid assignments at compile time', () => {
    // This is valid and should compile
    const validAssignment: AppObjEnum = AppObjEnum.AppData;
    assert.strictEqual(validAssignment, 'AppData');
    
    // Test runtime type checking
    function acceptsOnlyValidEnum(value: AppObjEnum): boolean {
      return Object.values(AppObjEnum).includes(value);
    }
    
    // Valid cases should return true
    assert.strictEqual(acceptsOnlyValidEnum(AppObjEnum.AppData), true);
    
    // Invalid cases - these would fail at compile time, but we can test runtime behavior
    // @ts-expect-error - Intentionally passing invalid value for testing
    assert.strictEqual(acceptsOnlyValidEnum('InvalidValue'), false);
    
    // @ts-expect-error - Intentionally passing wrong type for testing
    assert.strictEqual(acceptsOnlyValidEnum(123), false);
  });

  it('should handle type checking correctly', () => {
    function isValidAppObjType(value: unknown): value is AppObjEnum {
      return Object.values(AppObjEnum).includes(value as AppObjEnum);
    }

    // Positive cases
    assert.strictEqual(isValidAppObjType(AppObjEnum.AppData), true);
    assert.strictEqual(isValidAppObjType('AppData'), true);
    
    // Negative cases
    assert.strictEqual(isValidAppObjType('InvalidValue'), false);
    assert.strictEqual(isValidAppObjType(123), false);
    assert.strictEqual(isValidAppObjType(null), false);
    assert.strictEqual(isValidAppObjType(undefined), false);
  });
}); 