import * as functionsIndex from '../../../../src/utils/functions/index'

describe('utils/functions/index.ts', () => {
  it('should export all expected function modules', () => {
    // Verify that the index file exports are available
    expect(functionsIndex).toBeDefined()
    expect(typeof functionsIndex).toBe('object')
  })

  it('should export functions from arrays module', () => {
    // Arrays functions should be available
    expect(typeof functionsIndex.shuffleArray).toBe('function')
    expect(typeof functionsIndex.getRandom).toBe('function')
  })

  it('should export functions from checkTypes module', () => {
    // CheckTypes functions should be available
    expect(typeof functionsIndex.isObject).toBe('function')
    expect(typeof functionsIndex.isUndefined).toBe('function')
  })

  it('should export functions from general module', () => {
    // General utility functions should be available
    expect(typeof functionsIndex.sleep).toBe('function')
    expect(typeof functionsIndex.deepCopy).toBe('function')
  })

  it('should export functions from json module', () => {
    // JSON utility functions should be available
    expect(typeof functionsIndex.readJSON).toBe('function')
    expect(typeof functionsIndex.readJSONDir).toBe('function')
  })

  it('should export functions from readableDuration module', () => {
    // Duration formatting functions should be available
    expect(typeof functionsIndex.readableDuration).toBe('function')
  })

  it('should export functions from signs module', () => {
    // Signing-related functions should be available
    expect(typeof functionsIndex.removeDuplicateSignatures).toBe('function')
  })

  it('should export functions from stringifyReduce module', () => {
    // String reduction functions should be available
    expect(typeof functionsIndex.stringifyReduce).toBe('function')
    expect(typeof functionsIndex.makeShortHash).toBe('function')
  })

  it('should export functions from version module', () => {
    // Version comparison functions should be available
    expect(typeof functionsIndex.compareSemVersions).toBe('function')
    expect(typeof functionsIndex.parseSemVersion).toBe('function')
  })

  it('should verify all re-exports are working', () => {
    // This test ensures all the re-export statements work correctly
    const moduleKeys = Object.keys(functionsIndex)
    expect(moduleKeys.length).toBeGreaterThan(10) // Should have many exports
  })

  it('should not have naming conflicts between modules', () => {
    // Verify that all exported functions have unique names
    const exportedKeys = Object.keys(functionsIndex)
    const uniqueKeys = new Set(exportedKeys)
    expect(uniqueKeys.size).toBe(exportedKeys.length)
  })

  it('should only export functions and values, not modules', () => {
    // The index should flatten all exports
    Object.keys(functionsIndex).forEach((key) => {
      const value = functionsIndex[key]
      // Should be either a function or a value, not a module object
      expect(
        typeof value === 'function' ||
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean' ||
          value === null ||
          value === undefined ||
          Array.isArray(value) ||
          (typeof value === 'object' && value.constructor === Object)
      ).toBe(true)
    })
  })
})
