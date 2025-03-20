import {
  parseSemVersion,
  compareSemVersions,
  VersionComparisonResult,
  meetsMinimumSemVersion,
  isWithinMaximumSemVersion,
  isValidSemVersionObject,
  SemVersion,
  meetsMinimumVersion,
  isWithinMaximumVersion,
  VersionValidationResult,
} from '@utils/functions/version'

describe('Version Management', () => {
  describe('parseSemVersion', () => {
    it('should parse valid version strings', () => {
      expect(parseSemVersion('1.2.3')).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
      })

      expect(parseSemVersion('0.0.1')).toEqual({
        major: 0,
        minor: 0,
        patch: 1,
      })

      expect(parseSemVersion('10.20.30')).toEqual({
        major: 10,
        minor: 20,
        patch: 30,
      })

      expect(parseSemVersion('1.2.3-prerelease.4')).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
        prerelease: { number: 4 },
      })
    })

    it('should throw for invalid version strings', () => {
      expect(() => parseSemVersion(null)).toThrow()
      expect(() => parseSemVersion(undefined)).toThrow()
      expect(() => parseSemVersion('')).toThrow()
      expect(() => parseSemVersion('1')).toThrow()
      expect(() => parseSemVersion('1.2')).toThrow()
      expect(() => parseSemVersion('1.2.3.4')).toThrow()
      expect(() => parseSemVersion('a.b.c')).toThrow()
      expect(() => parseSemVersion('1.2.3-alpha.1')).toThrow()
      expect(() => parseSemVersion('1.2.3-prerelease')).toThrow()
    })
  })

  describe('compareSemVersions', () => {
    it('should correctly compare major versions', () => {
      expect(compareSemVersions({ major: 2, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 })).toBe(
        VersionComparisonResult.GreaterThan
      )
      expect(compareSemVersions({ major: 1, minor: 0, patch: 0 }, { major: 2, minor: 0, patch: 0 })).toBe(
        VersionComparisonResult.LessThan
      )
    })

    it('should correctly compare minor versions when major versions are equal', () => {
      expect(compareSemVersions({ major: 1, minor: 2, patch: 0 }, { major: 1, minor: 1, patch: 0 })).toBe(
        VersionComparisonResult.GreaterThan
      )
      expect(compareSemVersions({ major: 1, minor: 1, patch: 0 }, { major: 1, minor: 2, patch: 0 })).toBe(
        VersionComparisonResult.LessThan
      )
    })

    it('should correctly compare patch versions when major and minor versions are equal', () => {
      expect(compareSemVersions({ major: 1, minor: 1, patch: 2 }, { major: 1, minor: 1, patch: 1 })).toBe(
        VersionComparisonResult.GreaterThan
      )
      expect(compareSemVersions({ major: 1, minor: 1, patch: 1 }, { major: 1, minor: 1, patch: 2 })).toBe(
        VersionComparisonResult.LessThan
      )
    })

    it('should correctly compare versions with prerelease components', () => {
      // Version with prerelease is less than the same version without prerelease
      expect(
        compareSemVersions(
          { major: 1, minor: 0, patch: 0 },
          { major: 1, minor: 0, patch: 0, prerelease: { number: 1 } }
        )
      ).toBe(VersionComparisonResult.GreaterThan)

      expect(
        compareSemVersions(
          { major: 1, minor: 0, patch: 0, prerelease: { number: 1 } },
          { major: 1, minor: 0, patch: 0 }
        )
      ).toBe(VersionComparisonResult.LessThan)

      // Compare prerelease numbers
      expect(
        compareSemVersions(
          { major: 1, minor: 0, patch: 0, prerelease: { number: 2 } },
          { major: 1, minor: 0, patch: 0, prerelease: { number: 1 } }
        )
      ).toBe(VersionComparisonResult.GreaterThan)

      expect(
        compareSemVersions(
          { major: 1, minor: 0, patch: 0, prerelease: { number: 1 } },
          { major: 1, minor: 0, patch: 0, prerelease: { number: 2 } }
        )
      ).toBe(VersionComparisonResult.LessThan)

      // Equal prerelease numbers
      expect(
        compareSemVersions(
          { major: 1, minor: 0, patch: 0, prerelease: { number: 1 } },
          { major: 1, minor: 0, patch: 0, prerelease: { number: 1 } }
        )
      ).toBe(VersionComparisonResult.EqualTo)
    })

    it('should prioritize major, minor, patch over prerelease', () => {
      // Higher version with prerelease is still higher than lower version
      expect(
        compareSemVersions(
          { major: 2, minor: 0, patch: 0, prerelease: { number: 1 } },
          { major: 1, minor: 9, patch: 9 }
        )
      ).toBe(VersionComparisonResult.GreaterThan)

      expect(
        compareSemVersions(
          { major: 1, minor: 9, patch: 9 },
          { major: 2, minor: 0, patch: 0, prerelease: { number: 1 } }
        )
      ).toBe(VersionComparisonResult.LessThan)
    })
  })

  describe('meetsMinimumSemVersion', () => {
    it('should return true when version meets minimum', () => {
      expect(meetsMinimumSemVersion({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 })).toBe(true)
      expect(meetsMinimumSemVersion({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 1 })).toBe(true)
      expect(meetsMinimumSemVersion({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 1, patch: 0 })).toBe(true)
      expect(meetsMinimumSemVersion({ major: 1, minor: 0, patch: 0 }, { major: 2, minor: 0, patch: 0 })).toBe(true)
    })

    it('should return false when version does not meet minimum', () => {
      expect(meetsMinimumSemVersion({ major: 1, minor: 0, patch: 1 }, { major: 1, minor: 0, patch: 0 })).toBe(false)
      expect(meetsMinimumSemVersion({ major: 1, minor: 1, patch: 0 }, { major: 1, minor: 0, patch: 0 })).toBe(false)
      expect(meetsMinimumSemVersion({ major: 2, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 })).toBe(false)
    })

    it('should handle prerelease versions correctly', () => {
      // Prerelease version is less than the same version without prerelease
      expect(
        meetsMinimumSemVersion(
          { major: 1, minor: 0, patch: 0 },
          { major: 1, minor: 0, patch: 0, prerelease: { number: 1 } }
        )
      ).toBe(false)

      // Higher prerelease number meets minimum of lower prerelease
      expect(
        meetsMinimumSemVersion(
          { major: 1, minor: 0, patch: 0, prerelease: { number: 1 } },
          { major: 1, minor: 0, patch: 0, prerelease: { number: 2 } }
        )
      ).toBe(true)
    })
  })

  describe('isWithinMaximumSemVersion', () => {
    it('should return true when version is within maximum', () => {
      expect(isWithinMaximumSemVersion({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 })).toBe(true)
      expect(isWithinMaximumSemVersion({ major: 1, minor: 0, patch: 1 }, { major: 1, minor: 0, patch: 0 })).toBe(true)
      expect(isWithinMaximumSemVersion({ major: 1, minor: 1, patch: 0 }, { major: 1, minor: 0, patch: 0 })).toBe(true)
      expect(isWithinMaximumSemVersion({ major: 2, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 })).toBe(true)
    })

    it('should return false when version exceeds maximum', () => {
      expect(isWithinMaximumSemVersion({ major: 1, minor: 0, patch: 0 }, { major: 2, minor: 0, patch: 0 })).toBe(false)
      expect(isWithinMaximumSemVersion({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 1, patch: 0 })).toBe(false)
      expect(isWithinMaximumSemVersion({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 1 })).toBe(false)
    })

    it('should handle prerelease versions correctly', () => {
      // Prerelease version is less than the same version without prerelease
      expect(
        isWithinMaximumSemVersion(
          { major: 1, minor: 0, patch: 0 },
          { major: 1, minor: 0, patch: 0, prerelease: { number: 1 } }
        )
      ).toBe(true)

      // Lower prerelease number is within maximum of higher prerelease
      expect(
        isWithinMaximumSemVersion(
          { major: 1, minor: 0, patch: 0, prerelease: { number: 2 } },
          { major: 1, minor: 0, patch: 0, prerelease: { number: 1 } }
        )
      ).toBe(true)
    })
  })

  describe('isValidSemVersionObject', () => {
    it('should return true for valid SemVersion objects', () => {
      expect(isValidSemVersionObject({ major: 1, minor: 2, patch: 3 })).toBe(true)
      expect(isValidSemVersionObject({ major: 0, minor: 0, patch: 0 })).toBe(true)
      expect(
        isValidSemVersionObject({
          major: 1,
          minor: 2,
          patch: 3,
          prerelease: { number: 4 },
        })
      ).toBe(true)
    })

    it('should return false for invalid SemVersion objects', () => {
      // Not an object
      expect(isValidSemVersionObject(null)).toBe(false)
      expect(isValidSemVersionObject(undefined)).toBe(false)
      expect(isValidSemVersionObject('1.2.3')).toBe(false)
      expect(isValidSemVersionObject(123)).toBe(false)

      // Missing required properties
      expect(isValidSemVersionObject({})).toBe(false)
      expect(isValidSemVersionObject({ major: 1 })).toBe(false)
      expect(isValidSemVersionObject({ major: 1, minor: 2 })).toBe(false)
      expect(isValidSemVersionObject({ minor: 1, patch: 2 })).toBe(false)

      // Invalid property types
      expect(isValidSemVersionObject({ major: '1', minor: 2, patch: 3 })).toBe(false)
      expect(isValidSemVersionObject({ major: 1, minor: '2', patch: 3 })).toBe(false)
      expect(isValidSemVersionObject({ major: 1, minor: 2, patch: '3' })).toBe(false)

      // Negative numbers
      expect(isValidSemVersionObject({ major: -1, minor: 2, patch: 3 })).toBe(false)
      expect(isValidSemVersionObject({ major: 1, minor: -2, patch: 3 })).toBe(false)
      expect(isValidSemVersionObject({ major: 1, minor: 2, patch: -3 })).toBe(false)

      // Non-integer numbers
      expect(isValidSemVersionObject({ major: 1.5, minor: 2, patch: 3 })).toBe(false)
      expect(isValidSemVersionObject({ major: 1, minor: 2.5, patch: 3 })).toBe(false)
      expect(isValidSemVersionObject({ major: 1, minor: 2, patch: 3.5 })).toBe(false)

      // Invalid prerelease
      expect(
        isValidSemVersionObject({
          major: 1,
          minor: 2,
          patch: 3,
          prerelease: 'invalid',
        })
      ).toBe(false)
      expect(
        isValidSemVersionObject({
          major: 1,
          minor: 2,
          patch: 3,
          prerelease: {},
        })
      ).toBe(false)
      expect(
        isValidSemVersionObject({
          major: 1,
          minor: 2,
          patch: 3,
          prerelease: { number: '1' },
        })
      ).toBe(false)
      expect(
        isValidSemVersionObject({
          major: 1,
          minor: 2,
          patch: 3,
          prerelease: { number: -1 },
        })
      ).toBe(false)
      expect(
        isValidSemVersionObject({
          major: 1,
          minor: 2,
          patch: 3,
          prerelease: { number: 1.5 },
        })
      ).toBe(false)
    })
  })

  describe('meetsMinimumVersion', () => {
    it('should return Success when test version meets minimum version', () => {
      expect(meetsMinimumVersion('1.0.0', '1.0.0')).toBe(VersionValidationResult.Success)
      expect(meetsMinimumVersion('1.0.0', '1.0.1')).toBe(VersionValidationResult.Success)
      expect(meetsMinimumVersion('1.0.0', '2.0.0')).toBe(VersionValidationResult.Success)
    })

    it('should return ComparisonFailed when test version is below minimum version', () => {
      expect(meetsMinimumVersion('1.0.1', '1.0.0')).toBe(VersionValidationResult.ComparisonFailed)
      expect(meetsMinimumVersion('2.0.0', '1.9.9')).toBe(VersionValidationResult.ComparisonFailed)
    })

    it('should return ControlVersionParseFailure for invalid required version string', () => {
      expect(meetsMinimumVersion('invalid', '1.0.0')).toBe(VersionValidationResult.ControlVersionParseFailure)
      expect(meetsMinimumVersion(null, '1.0.0')).toBe(VersionValidationResult.ControlVersionParseFailure)
      expect(meetsMinimumVersion(undefined, '1.0.0')).toBe(VersionValidationResult.ControlVersionParseFailure)
    })

    it('should return TestVersionParseFailure for invalid test version string', () => {
      expect(meetsMinimumVersion('1.0.0', 'invalid')).toBe(VersionValidationResult.TestVersionParseFailure)
      expect(meetsMinimumVersion('1.0.0', null)).toBe(VersionValidationResult.TestVersionParseFailure)
      expect(meetsMinimumVersion('1.0.0', undefined)).toBe(VersionValidationResult.TestVersionParseFailure)
    })

    it('should handle prerelease versions correctly', () => {
      expect(meetsMinimumVersion('1.0.0-prerelease.1', '1.0.0')).toBe(VersionValidationResult.Success)
      expect(meetsMinimumVersion('1.0.0', '1.0.0-prerelease.1')).toBe(VersionValidationResult.ComparisonFailed)
    })
  })

  describe('isWithinMaximumVersion', () => {
    it('should return Success when test version is within maximum version', () => {
      expect(isWithinMaximumVersion('1.0.0', '1.0.0')).toBe(VersionValidationResult.Success)
      expect(isWithinMaximumVersion('1.0.1', '1.0.0')).toBe(VersionValidationResult.Success)
      expect(isWithinMaximumVersion('2.0.0', '1.0.0')).toBe(VersionValidationResult.Success)
    })

    it('should return ComparisonFailed when test version exceeds maximum version', () => {
      expect(isWithinMaximumVersion('1.0.0', '1.0.1')).toBe(VersionValidationResult.ComparisonFailed)
      expect(isWithinMaximumVersion('1.9.9', '2.0.0')).toBe(VersionValidationResult.ComparisonFailed)
    })

    it('should return ControlVersionParseFailure for invalid maximum version string', () => {
      expect(isWithinMaximumVersion('invalid', '1.0.0')).toBe(VersionValidationResult.ControlVersionParseFailure)
      expect(isWithinMaximumVersion(null, '1.0.0')).toBe(VersionValidationResult.ControlVersionParseFailure)
      expect(isWithinMaximumVersion(undefined, '1.0.0')).toBe(VersionValidationResult.ControlVersionParseFailure)
    })

    it('should return TestVersionParseFailure for invalid test version string', () => {
      expect(isWithinMaximumVersion('1.0.0', 'invalid')).toBe(VersionValidationResult.TestVersionParseFailure)
      expect(isWithinMaximumVersion('1.0.0', null)).toBe(VersionValidationResult.TestVersionParseFailure)
      expect(isWithinMaximumVersion('1.0.0', undefined)).toBe(VersionValidationResult.TestVersionParseFailure)
    })

    it('should handle prerelease versions correctly', () => {
      expect(isWithinMaximumVersion('1.0.0', '1.0.0-prerelease.1')).toBe(VersionValidationResult.Success)
      expect(isWithinMaximumVersion('1.0.0-prerelease.1', '1.0.0')).toBe(VersionValidationResult.ComparisonFailed)
    })
  })

  describe('POC', () => {
    it('Tests all POC cases for proper acceptance or rejection of versions', () => {
      expect(meetsMinimumVersion('1.2.0', '1.2')).toBe(VersionValidationResult.TestVersionParseFailure)
      expect(meetsMinimumVersion('1.2.0', '1.3.0')).toBe(VersionValidationResult.Success)
      expect(meetsMinimumVersion('1.2.0', '1.10')).toBe(VersionValidationResult.TestVersionParseFailure)
      expect(meetsMinimumVersion('1.2.0', '1.2.0')).toBe(VersionValidationResult.Success)
      expect(meetsMinimumVersion('1.2.0', '1.2beta')).toBe(VersionValidationResult.TestVersionParseFailure)
      expect(meetsMinimumVersion('1.2.0', '1.1')).toBe(VersionValidationResult.TestVersionParseFailure)
      expect(meetsMinimumVersion('1.2.0', '1.2.5')).toBe(VersionValidationResult.Success)
      expect(meetsMinimumVersion('1.2.0', '1.2.3')).toBe(VersionValidationResult.Success)
      expect(meetsMinimumVersion('1.2.0', '1.10.0')).toBe(VersionValidationResult.Success)
      expect(meetsMinimumVersion('1.2.0', '1.2')).toBe(VersionValidationResult.TestVersionParseFailure)
    })
  })

  describe('POC2', () => {
    it('Tests all POC cases for proper acceptance or rejection of versions', () => {
      expect(meetsMinimumVersion('1.2', '1.2.0')).toBe(VersionValidationResult.ControlVersionParseFailure)
      expect(meetsMinimumVersion('1.3.0', '1.2.0')).toBe(VersionValidationResult.ComparisonFailed)
      expect(meetsMinimumVersion('1.10', '1.2.0')).toBe(VersionValidationResult.ControlVersionParseFailure)
      expect(meetsMinimumVersion('1.2.0', '1.2.0')).toBe(VersionValidationResult.Success)
      expect(meetsMinimumVersion('1.2beta', '1.2.0')).toBe(VersionValidationResult.ControlVersionParseFailure)
      expect(meetsMinimumVersion('1.1', '1.2.0')).toBe(VersionValidationResult.ControlVersionParseFailure)
      expect(meetsMinimumVersion('1.2.5', '1.2.0')).toBe(VersionValidationResult.ComparisonFailed)
      expect(meetsMinimumVersion('1.2.3', '1.2.0')).toBe(VersionValidationResult.ComparisonFailed)
      expect(meetsMinimumVersion('1.10.0', '1.2.0')).toBe(VersionValidationResult.ComparisonFailed)
      expect(meetsMinimumVersion('1.2', '1.2.0')).toBe(VersionValidationResult.ControlVersionParseFailure)
    })
  })
})
