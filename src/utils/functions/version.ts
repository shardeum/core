/**
 * Represents a semantic version with major, minor, patch, and optional prerelease components.
 * Follows the SemVer specification format: MAJOR.MINOR.PATCH[-prerelease.PRERELEASE]
 * Example: 1.2.3-prerelease.4
 * 
 * @internal This interface is exported for testing purposes only and is not part of the public API.
 */
export interface SemVersion {
  /** Major version number (incremented for incompatible API changes) */
  major: number
  /** Minor version number (incremented for backward-compatible functionality) */
  minor: number
  /** Patch version number (incremented for backward-compatible bug fixes) */
  patch: number
  /** Optional prerelease information */
  prerelease?: {
    /** Prerelease version number */
    number: number
  }
}

/**
 * Validates if an object conforms to the SemVersion interface.
 * This function performs thorough validation of all properties and their types.
 * 
 * @param obj - The object to validate
 * @returns true if the object is a valid SemVersion, false otherwise
 * 
 * @internal This function is exported for testing purposes only and is not part of the public API.
 */
export function isValidSemVersionObject(obj: unknown): obj is SemVersion {
  // Check if obj is an object
  if (!obj || typeof obj !== 'object') {
    return false
  }

  const version = obj as Partial<SemVersion>
  
  // Check if major property exists and is a number
  if (typeof version.major !== 'number') {
    return false
  }
  
  // Check if minor property exists and is a number
  if (typeof version.minor !== 'number') {
    return false
  }
  
  // Check if patch property exists and is a number
  if (typeof version.patch !== 'number') {
    return false
  }
  
  // Check if major is a non-negative integer
  if (!Number.isInteger(version.major) || version.major < 0) {
    return false
  }
  
  // Check if minor is a non-negative integer
  if (!Number.isInteger(version.minor) || version.minor < 0) {
    return false
  }
  
  // Check if patch is a non-negative integer
  if (!Number.isInteger(version.patch) || version.patch < 0) {
    return false
  }
  
  // If prerelease exists, validate it
  if (version.prerelease !== undefined) {
    // Check if prerelease is an object
    if (typeof version.prerelease !== 'object' || version.prerelease === null) {
      return false
    }
    
    // Check if prerelease.number exists and is a number
    if (typeof version.prerelease.number !== 'number') {
      return false
    }
    
    // Check if prerelease.number is a non-negative integer
    if (!Number.isInteger(version.prerelease.number) || version.prerelease.number < 0) {
      return false
    }
  }
  
  // All checks passed
  return true
}

/**
 * Parses and validates a version string into a SemVersion object.
 * Supports formats:
 * - x.y.z (standard version)
 * - x.y.z-prerelease.n (version with prerelease)
 * 
 * @param version - The version string to parse
 * @throws Error if version string is invalid or malformed
 * @returns A validated SemVersion object
 * 
 * @internal This function is exported for testing purposes only and is not part of the public API.
 */
export function parseSemVersion(version: string | null | undefined): SemVersion {
  if (!version) {
    throw new Error('Version string cannot be null or undefined')
  }

  const [versionPart, prereleasePart] = version.split('-')
  const parts = versionPart.split('.')

  if (parts.length !== 3) {
    throw new Error(`Invalid version format: ${version}. Expected format: x.y.z or x.y.z-prerelease.n`)
  }

  const [major, minor, patch] = parts.map((part, index) => {
    const num = parseInt(part, 10)
    if (isNaN(num)) {
      throw new Error(`Invalid version number in ${version} - part ${index + 1} is not a number`)
    }
    if (num < 0) {
      throw new Error(`Invalid version number in ${version} - negative numbers are not allowed`)
    }
    return num
  })

  if (!prereleasePart) {
    return { major, minor, patch }
  }

  const [label, prereleaseNum] = prereleasePart.split('.')
  if (label !== 'prerelease' || !prereleaseNum) {
    throw new Error(`Invalid prerelease format in ${version}. Expected format: prerelease.n`)
  }

  const prereleaseNumber = parseInt(prereleaseNum, 10)
  if (isNaN(prereleaseNumber)) {
    throw new Error(`Invalid prerelease number in ${version} - not a number`)
  }
  if (prereleaseNumber < 0) {
    throw new Error(`Invalid prerelease number in ${version} - negative numbers are not allowed`)
  }

  return {
    major,
    minor,
    patch,
    prerelease: { number: prereleaseNumber },
  }
}

/**
 * Represents the result of comparing two versions.
 * 
 * @internal This enum is exported for testing purposes only and is not part of the public API.
 */
export enum VersionComparisonResult {
  /** First version is less than second version */
  LessThan,
  /** Versions are equal */
  EqualTo,
  /** First version is greater than second version */
  GreaterThan,
}

/**
 * Compares two SemVersion objects following SemVer rules.
 * Comparison order: major, minor, patch, then prerelease if necessary.
 * 
 * @param a - First version to compare
 * @param b - Second version to compare
 * @returns VersionComparisonResult indicating the relationship between versions
 * 
 * @internal This function is exported for testing purposes only and is not part of the public API.
 */
export function compareSemVersions(a: SemVersion, b: SemVersion): VersionComparisonResult {
  // Compare the x.y.z parts first.
  const normalRes = compareNormalSemVersions(a, b)
  if (normalRes !== VersionComparisonResult.EqualTo) {
    return normalRes
  }
  // Compare prerelease versions if necessary.
  const prereleaseRes = comparePrereleaseSemVersions(a, b)
  return prereleaseRes
}

/**
 * Compares the major, minor, and patch components of two versions.
 * 
 * @param a - First version to compare
 * @param b - Second version to compare
 * @returns VersionComparisonResult based on major, minor, and patch comparison
 */
function compareNormalSemVersions(a: SemVersion, b: SemVersion): VersionComparisonResult {
  if (a.major > b.major) {
    return VersionComparisonResult.GreaterThan
  }
  if (a.major < b.major) {
    return VersionComparisonResult.LessThan
  }
  if (a.minor > b.minor) {
    return VersionComparisonResult.GreaterThan
  }
  if (a.minor < b.minor) {
    return VersionComparisonResult.LessThan
  }
  if (a.patch > b.patch) {
    return VersionComparisonResult.GreaterThan
  }
  if (a.patch < b.patch) {
    return VersionComparisonResult.LessThan
  }
  return VersionComparisonResult.EqualTo
}

/**
 * Compares the prerelease components of two versions.
 * Per SemVer spec, a version with a prerelease component is lower than
 * the same version without a prerelease component.
 * 
 * @param a - First version to compare
 * @param b - Second version to compare
 * @returns VersionComparisonResult based on prerelease comparison
 */
function comparePrereleaseSemVersions(a: SemVersion, b: SemVersion): VersionComparisonResult {
  // Neither has prerelease version.
  if (!a.prerelease && !b.prerelease) {
    return VersionComparisonResult.EqualTo
  }
  // One or the other has prerelease version.
  if (!a.prerelease && b.prerelease) {
    return VersionComparisonResult.GreaterThan
  }
  if (a.prerelease && !b.prerelease) {
    return VersionComparisonResult.LessThan
  }
  // Both have prerelease version.
  if (a.prerelease!.number > b.prerelease!.number) {
    return VersionComparisonResult.GreaterThan
  }
  if (a.prerelease!.number < b.prerelease!.number) {
    return VersionComparisonResult.LessThan
  }
  return VersionComparisonResult.EqualTo
}

/**
 * Checks if a version meets or exceeds a minimum required version.
 * 
 * @param requiredVersion - The minimum version required
 * @param testVersion - The version to test
 * @returns true if testVersion is equal to or greater than requiredVersion
 * 
 * @internal This function is exported for testing purposes only and is not part of the public API.
 */
export function meetsMinimumSemVersion(requiredVersion: SemVersion, testVersion: SemVersion): boolean {
  const result = compareSemVersions(testVersion, requiredVersion)
  return result === VersionComparisonResult.EqualTo || result === VersionComparisonResult.GreaterThan
}

/**
 * Checks if a version is at or below a maximum allowed version.
 * 
 * @param maximumVersion - The maximum version allowed
 * @param testVersion - The version to test
 * @returns true if testVersion is equal to or less than maximumVersion
 * 
 * @internal This function is exported for testing purposes only and is not part of the public API.
 */
export function isWithinMaximumSemVersion(maximumVersion: SemVersion, testVersion: SemVersion): boolean {
  const result = compareSemVersions(testVersion, maximumVersion)
  return result === VersionComparisonResult.EqualTo || result === VersionComparisonResult.LessThan
}

/**
 * Represents the possible outcomes when comparing versions with validation.
 */
export enum VersionValidationResult {
  /** Operation succeeded, version requirements are met */
  Success,
  /** Failed to parse the control version (min/max version) */
  ControlVersionParseFailure,
  /** Control version (min/max version) is invalid */
  InvalidControlVersion,
  /** Failed to parse the test version */
  TestVersionParseFailure,
  /** Test version is invalid */
  InvalidTestVersion,
  /** Version comparison failed */
  ComparisonFailed,
}

/**
 * Validates and checks if a version meets or exceeds a minimum required version.
 * This function handles parsing, validation, and comparison in one step.
 * 
 * @param requiredVersionStr - The minimum version required (as a string)
 * @param testVersionStr - The version to test (as a string)
 * @returns A VersionValidationResult indicating success or the specific failure reason
 */
export function meetsMinimumVersion(
  requiredVersionStr: string | null | undefined,
  testVersionStr: string | null | undefined
): VersionValidationResult {
  // Parse and validate the required version
  let requiredVersion: SemVersion
  try {
    requiredVersion = parseSemVersion(requiredVersionStr)
  } catch (error) {
    return VersionValidationResult.ControlVersionParseFailure
  }

  if (!isValidSemVersionObject(requiredVersion)) {
    return VersionValidationResult.InvalidControlVersion
  }

  // Parse and validate the test version
  let testVersion: SemVersion
  try {
    testVersion = parseSemVersion(testVersionStr)
  } catch (error) {
    return VersionValidationResult.TestVersionParseFailure
  }

  if (!isValidSemVersionObject(testVersion)) {
    return VersionValidationResult.InvalidTestVersion
  }

  // Perform the comparison
  try {
    if (meetsMinimumSemVersion(requiredVersion, testVersion)) {
      return VersionValidationResult.Success
    } else {
      return VersionValidationResult.ComparisonFailed
    }
  } catch (error) {
    return VersionValidationResult.ComparisonFailed
  }
}

/**
 * Validates and checks if a version is at or below a maximum allowed version.
 * This function handles parsing, validation, and comparison in one step.
 * 
 * @param maximumVersionStr - The maximum allowed version (as a string)
 * @param testVersionStr - The version to test (as a string)
 * @returns A VersionValidationResult indicating success or the specific failure reason
 */
export function isWithinMaximumVersion(
  maximumVersionStr: string | null | undefined,
  testVersionStr: string | null | undefined
): VersionValidationResult {
  // Parse and validate the maximum version
  let maximumVersion: SemVersion
  try {
    maximumVersion = parseSemVersion(maximumVersionStr)
  } catch (error) {
    return VersionValidationResult.ControlVersionParseFailure
  }

  if (!isValidSemVersionObject(maximumVersion)) {
    return VersionValidationResult.InvalidControlVersion
  }

  // Parse and validate the test version
  let testVersion: SemVersion
  try {
    testVersion = parseSemVersion(testVersionStr)
  } catch (error) {
    return VersionValidationResult.TestVersionParseFailure
  }

  if (!isValidSemVersionObject(testVersion)) {
    return VersionValidationResult.InvalidTestVersion
  }

  // Perform the comparison
  try {
    if (isWithinMaximumSemVersion(maximumVersion, testVersion)) {
      return VersionValidationResult.Success
    } else {
      return VersionValidationResult.ComparisonFailed
    }
  } catch (error) {
    return VersionValidationResult.ComparisonFailed
  }
}

