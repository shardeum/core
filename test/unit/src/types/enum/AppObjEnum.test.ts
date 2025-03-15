import { AppObjEnum } from '../../../../../src/types/enum/AppObjEnum';

describe('AppObjEnum', () => {
  it('should exist as an enum', () => {
    expect(AppObjEnum).toBeDefined();
    expect(typeof AppObjEnum).toBe('object');
  });

  it('should contain all expected enum values', () => {
    // Test all enum values to ensure they exist and have correct values
    expect(AppObjEnum.AppData).toBe('AppData');
    expect(AppObjEnum.CachedAppData).toBe('CachedAppData');
  });

  it('should have matching key-value pairs', () => {
    // Verify that each enum key matches its string value
    Object.keys(AppObjEnum).forEach(key => {
      const value = AppObjEnum[key as keyof typeof AppObjEnum];
      expect(key).toBe(value);
    });
  });

  it('should be usable as a type', () => {
    // Test function that accepts the enum as a parameter
    function processAppObj(objType: AppObjEnum): string {
      return `Processing app object: ${objType}`;
    }

    const result = processAppObj(AppObjEnum.AppData);
    expect(result).toBe('Processing app object: AppData');
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

    expect(getObjectDescription(AppObjEnum.AppData)).toBe('Application data object');
    expect(getObjectDescription(AppObjEnum.CachedAppData)).toBe('Cached application data object');
  });

  it('should not contain invalid enum values', () => {
    // @ts-expect-error - Testing runtime behavior with invalid value
    expect(AppObjEnum.InvalidEnumValue).toBeUndefined();
    expect(AppObjEnum['NonExistentValue']).toBeUndefined();
  });

  it('should validate enum values at runtime', () => {
    // This is valid and should compile
    const validAssignment: AppObjEnum = AppObjEnum.AppData;
    expect(validAssignment).toBe('AppData');
    
    // Test runtime type checking
    function acceptsOnlyValidEnum(value: AppObjEnum): boolean {
      return Object.values(AppObjEnum).includes(value);
    }
    
    // Valid cases should return true
    expect(acceptsOnlyValidEnum(AppObjEnum.AppData)).toBe(true);
    
    // Invalid cases - these would fail at compile time, but we can test runtime behavior
    // @ts-expect-error - Intentionally passing invalid value for testing
    expect(acceptsOnlyValidEnum('InvalidValue')).toBe(false);
    
    // @ts-expect-error - Intentionally passing wrong type for testing
    expect(acceptsOnlyValidEnum(123)).toBe(false);
  });

  it('should handle type checking correctly', () => {
    function isValidAppObjType(value: unknown): value is AppObjEnum {
      return Object.values(AppObjEnum).includes(value as AppObjEnum);
    }

    // Positive cases
    expect(isValidAppObjType(AppObjEnum.AppData)).toBe(true);
    expect(isValidAppObjType('AppData')).toBe(true);
    
    // Negative cases
    expect(isValidAppObjType('InvalidValue')).toBe(false);
    expect(isValidAppObjType(123)).toBe(false);
    expect(isValidAppObjType(null)).toBe(false);
    expect(isValidAppObjType(undefined)).toBe(false);
  });
}); 