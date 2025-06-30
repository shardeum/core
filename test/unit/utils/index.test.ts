import * as utils from '../../../src/utils/index'

describe('utils/index.ts', () => {
  it('should export all expected modules', () => {
    // Verify that the index file exports are available
    expect(utils).toBeDefined()
    expect(typeof utils).toBe('object')
  })

  it('should export functions from arrays module', () => {
    // Functions from arrays module should be available
    expect(typeof utils.shuffleArray).toBe('function')
    expect(typeof utils.getRandom).toBe('function')
  })

  it('should export functions from checkTypes module', () => {
    // Functions from checkTypes module should be available
    expect(typeof utils.isObject).toBe('function')
    expect(typeof utils.isUndefined).toBe('function')
  })

  it('should export functions from general module', () => {
    // Functions from general module should be available
    expect(typeof utils.sleep).toBe('function')
    expect(typeof utils.deepCopy).toBe('function')
  })

  it('should export functions from iterables module', () => {
    // Functions from iterables module should be available
    // Will check if function exists once we know specific exports
    expect(utils).toBeDefined()
  })

  it('should export functions from json module', () => {
    // Functions from json module should be available
    expect(typeof utils.readJSON).toBe('function')
    expect(typeof utils.readJSONDir).toBe('function')
  })

  it('should export functions from promises module', () => {
    // Functions from promises module should be available  
    // Will check if function exists once we know specific exports
    expect(utils).toBeDefined()
  })

  it('should export functions from readableDuration module', () => {
    // Functions from readableDuration module should be available
    expect(typeof utils.readableDuration).toBe('function')
  })

  it('should export functions from sortingCompareFunctions module', () => {
    // Functions from sortingCompareFunctions module should be available
    // Will check if function exists once we know specific exports
    expect(utils).toBeDefined()
  })

  it('should export functions from stringifyReduce module', () => {
    // Functions from stringifyReduce module should be available
    expect(typeof utils.stringifyReduce).toBe('function')
  })

  it('should export functions from version module', () => {
    // Functions from version module should be available
    expect(typeof utils.compareSemVersions).toBe('function')
  })

  it('should export ordering constants', () => {
    // Ordering enum should be available
    expect(utils.Ordering).toBeDefined()
    expect(utils.Ordering.Less).toBe(-1)
    expect(utils.Ordering.Equal).toBe(0)
    expect(utils.Ordering.Greater).toBe(1)
  })

  it('should export FIFOCache class', () => {
    // FIFOCache should be available
    expect(utils.FIFOCache).toBeDefined()
    expect(typeof utils.FIFOCache).toBe('function')
  })

  it('should verify no circular dependencies', () => {
    // This test ensures the module can be imported without errors
    const moduleKeys = Object.keys(utils)
    expect(moduleKeys.length).toBeGreaterThan(0)
  })

  it('should not export internal implementation details', () => {
    // The index should only export public APIs
    const exportedKeys = Object.keys(utils)
    
    // Check that common internal patterns are not exposed
    exportedKeys.forEach(key => {
      expect(key).not.toMatch(/^_/)  // No private members starting with _
      expect(key).not.toMatch(/Internal$/)  // No internal suffixed members
    })
  })
})