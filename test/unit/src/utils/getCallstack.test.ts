import getCallstack from '../../../../src/utils/getCallstack'

describe('getCallstack', () => {
  it('should return a string', () => {
    const result = getCallstack()
    expect(typeof result).toBe('string')
  })

  it('should contain stack trace information', () => {
    const result = getCallstack()
    expect(result).toBeDefined()
    expect(result.length).toBeGreaterThan(0)
  })

  it('should include "Error: Artificially induced error to get a call stack" in the stack trace', () => {
    const result = getCallstack()
    expect(result).toContain('Error: Artificially induced error to get a call stack')
  })

  it('should include the function name in the stack trace', () => {
    const result = getCallstack()
    expect(result).toContain('getCallstack')
  })

  it('should include file paths in the stack trace', () => {
    const result = getCallstack()
    // Stack traces typically include file paths with .js or .ts extensions
    expect(result).toMatch(/\.(js|ts)/i)
  })

  it('should include line numbers in the stack trace', () => {
    const result = getCallstack()
    // Stack traces typically include line numbers in format :line:column
    expect(result).toMatch(/:\d+:\d+/i)
  })

  it('should return consistent stack trace format', () => {
    const result1 = getCallstack()
    const result2 = getCallstack()
    
    // Both should start with the same error message
    const errorMessage = 'Error: Artificially induced error to get a call stack'
    expect(result1.startsWith(errorMessage)).toBe(true)
    expect(result2.startsWith(errorMessage)).toBe(true)
  })

  it('should handle being called from different contexts', () => {
    function testFunction() {
      return getCallstack()
    }

    const stackFromFunction = testFunction()
    const stackDirect = getCallstack()

    // Both should contain the error message
    expect(stackFromFunction).toContain('Error: Artificially induced error to get a call stack')
    expect(stackDirect).toContain('Error: Artificially induced error to get a call stack')

    // Stack from function should include testFunction
    expect(stackFromFunction).toContain('testFunction')
  })

  it('should handle being called from async context', async () => {
    const asyncFunction = async () => {
      return getCallstack()
    }

    const result = await asyncFunction()
    expect(result).toBeDefined()
    expect(result).toContain('Error: Artificially induced error to get a call stack')
    expect(result).toContain('asyncFunction')
  })

  it('should handle being called from nested functions', () => {
    function outer() {
      function inner() {
        return getCallstack()
      }
      return inner()
    }

    const result = outer()
    expect(result).toContain('Error: Artificially induced error to get a call stack')
    expect(result).toContain('inner')
    expect(result).toContain('outer')
  })

  // Edge case: Ensure the function always returns a valid string even in edge cases
  it('should never return undefined or null', () => {
    const result = getCallstack()
    expect(result).not.toBeUndefined()
    expect(result).not.toBeNull()
    expect(result).toBeTruthy()
  })

  // Test for stack trace structure
  it('should have multiple lines in the stack trace', () => {
    const result = getCallstack()
    const lines = result.split('\n')
    expect(lines.length).toBeGreaterThan(1)
  })

  // Test that it doesn't throw errors
  it('should not throw any errors when called', () => {
    expect(() => getCallstack()).not.toThrow()
  })

  // Test multiple consecutive calls
  it('should handle multiple consecutive calls', () => {
    const results = []
    for (let i = 0; i < 5; i++) {
      results.push(getCallstack())
    }

    results.forEach(result => {
      expect(result).toContain('Error: Artificially induced error to get a call stack')
      expect(typeof result).toBe('string')
    })
  })
})