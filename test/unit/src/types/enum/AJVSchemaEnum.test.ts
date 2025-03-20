import { AJVSchemaEnum } from '../../../../../src/types/enum/AJVSchemaEnum'

describe('AJVSchemaEnum', () => {
  it('should exist as an enum', () => {
    expect(AJVSchemaEnum).toBeDefined()
    expect(typeof AJVSchemaEnum).toBe('object')
  })

  it('should contain all expected enum values', () => {
    // Test a sample of enum values to ensure they exist and have correct values
    expect(AJVSchemaEnum.CompareCertReq).toBe('CompareCertReq')
    expect(AJVSchemaEnum.RepairOOSAccountsReq).toBe('RepairOOSAccountsReq')
    expect(AJVSchemaEnum.RequestStateForTxReq).toBe('RequestStateForTxReq')
    expect(AJVSchemaEnum.GetAccountDataResp).toBe('GetAccountDataResp')
    expect(AJVSchemaEnum.JoinReq).toBe('JoinReq')
    expect(AJVSchemaEnum.AllowedArchiverResponse).toBe('AllowedArchiverResponse')
  })

  it('should have matching key-value pairs', () => {
    // Verify that each enum key matches its string value
    Object.keys(AJVSchemaEnum).forEach((key) => {
      const value = AJVSchemaEnum[key as keyof typeof AJVSchemaEnum]
      expect(key).toBe(value)
    })
  })

  it('should be usable as a type', () => {
    // Test function that accepts the enum as a parameter
    function processSchema(schemaType: AJVSchemaEnum): string {
      return `Processing schema: ${schemaType}`
    }

    const result = processSchema(AJVSchemaEnum.CompareCertReq)
    expect(result).toBe('Processing schema: CompareCertReq')
  })

  it('should be usable in a switch statement', () => {
    function getSchemaDescription(schemaType: AJVSchemaEnum): string {
      switch (schemaType) {
        case AJVSchemaEnum.CompareCertReq:
          return 'Certificate comparison request'
        case AJVSchemaEnum.JoinReq:
          return 'Join request'
        default:
          return 'Unknown schema'
      }
    }

    expect(getSchemaDescription(AJVSchemaEnum.CompareCertReq)).toBe('Certificate comparison request')
    expect(getSchemaDescription(AJVSchemaEnum.JoinReq)).toBe('Join request')
    expect(getSchemaDescription(AJVSchemaEnum.GetAccountDataReq)).toBe('Unknown schema')
  })

  it('should not contain invalid enum values', () => {
    // @ts-expect-error - Testing runtime behavior with invalid value
    expect(AJVSchemaEnum.InvalidEnumValue).toBeUndefined()
    expect(AJVSchemaEnum['NonExistentValue']).toBeUndefined()
  })

  it('should reject invalid assignments at compile time', () => {
    // This is valid and should compile
    const validAssignment: AJVSchemaEnum = AJVSchemaEnum.CompareCertReq
    expect(validAssignment).toBe('CompareCertReq')

    // Test runtime type checking
    function acceptsOnlyValidEnum(value: AJVSchemaEnum): boolean {
      return Object.values(AJVSchemaEnum).includes(value)
    }

    // Valid cases should return true
    expect(acceptsOnlyValidEnum(AJVSchemaEnum.CompareCertReq)).toBe(true)

    // Invalid cases - these would fail at compile time, but we can test runtime behavior
    // @ts-expect-error - Intentionally passing invalid value for testing
    expect(acceptsOnlyValidEnum('InvalidValue')).toBe(false)

    // @ts-expect-error - Intentionally passing wrong type for testing
    expect(acceptsOnlyValidEnum(123)).toBe(false)
  })

  it('should handle type checking correctly', () => {
    function isValidSchemaType(value: unknown): value is AJVSchemaEnum {
      return Object.values(AJVSchemaEnum).includes(value as AJVSchemaEnum)
    }

    // Positive cases
    expect(isValidSchemaType(AJVSchemaEnum.CompareCertReq)).toBe(true)
    expect(isValidSchemaType('CompareCertReq')).toBe(true)

    // Negative cases
    expect(isValidSchemaType('InvalidValue')).toBe(false)
    expect(isValidSchemaType(123)).toBe(false)
    expect(isValidSchemaType(null)).toBe(false)
    expect(isValidSchemaType(undefined)).toBe(false)
  })
})
