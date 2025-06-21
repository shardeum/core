import { Ordering } from '../../../src/utils/ordering'

describe('Ordering', () => {
  it('should exist as an enum', () => {
    expect(Ordering).toBeDefined()
    expect(typeof Ordering).toBe('object')
  })

  it('should contain all expected enum values with correct numeric values', () => {
    expect(Ordering.Less).toBe(-1)
    expect(Ordering.Equal).toBe(0)
    expect(Ordering.Greater).toBe(1)
  })

  it('should have exactly 3 enum values', () => {
    // Get all enum keys (excluding numeric keys)
    const enumKeys = Object.keys(Ordering).filter((k) => isNaN(Number(k)))
    
    // Get all enum values (excluding string keys)
    const enumValues = Object.values(Ordering).filter((v) => typeof v === 'number')
    
    // Verify we have the same number of keys and values
    expect(enumKeys.length).toBe(enumValues.length)
    
    // Verify we have the expected number of enum values
    expect(enumKeys.length).toBe(3)
  })

  it('should have bidirectional mapping for all numeric enums', () => {
    // Test all reverse mappings
    expect(Ordering[-1]).toBe('Less')
    expect(Ordering[0]).toBe('Equal')
    expect(Ordering[1]).toBe('Greater')
    
    // Test that we can go both ways
    expect(Ordering[Ordering.Less]).toBe('Less')
    expect(Ordering[Ordering.Equal]).toBe('Equal')
    expect(Ordering[Ordering.Greater]).toBe('Greater')
  })

  it('should be usable as a type', () => {
    // Test function that accepts the enum as a parameter
    function compareValues(a: number, b: number): Ordering {
      if (a < b) return Ordering.Less
      if (a > b) return Ordering.Greater
      return Ordering.Equal
    }
    
    expect(compareValues(1, 2)).toBe(Ordering.Less)
    expect(compareValues(2, 1)).toBe(Ordering.Greater)
    expect(compareValues(1, 1)).toBe(Ordering.Equal)
  })

  it('should be usable in a switch statement', () => {
    function getComparisonDescription(comparison: Ordering): string {
      switch (comparison) {
        case Ordering.Less:
          return 'First value is less than second'
        case Ordering.Equal:
          return 'Values are equal'
        case Ordering.Greater:
          return 'First value is greater than second'
        default:
          return 'Unknown comparison result'
      }
    }
    
    expect(getComparisonDescription(Ordering.Less)).toBe('First value is less than second')
    expect(getComparisonDescription(Ordering.Equal)).toBe('Values are equal')
    expect(getComparisonDescription(Ordering.Greater)).toBe('First value is greater than second')
  })

  it('should not contain invalid enum values', () => {
    // @ts-expect-error - Testing runtime behavior with invalid value
    expect(Ordering.InvalidValue).toBeUndefined()
    expect(Ordering[2]).toBeUndefined()
    expect(Ordering[-2]).toBeUndefined()
  })

  it('should handle type checking correctly', () => {
    function isOrdering(value: unknown): value is Ordering {
      return (
        typeof value === 'number' &&
        Object.values(Ordering).includes(value as Ordering) &&
        value >= -1 &&
        value <= 1
      )
    }
    
    // Positive cases
    expect(isOrdering(Ordering.Less)).toBe(true)
    expect(isOrdering(Ordering.Equal)).toBe(true)
    expect(isOrdering(Ordering.Greater)).toBe(true)
    expect(isOrdering(-1)).toBe(true)
    expect(isOrdering(0)).toBe(true)
    expect(isOrdering(1)).toBe(true)
    
    // Negative cases
    expect(isOrdering(2)).toBe(false)
    expect(isOrdering(-2)).toBe(false)
    expect(isOrdering('Less')).toBe(false)
    expect(isOrdering(null)).toBe(false)
    expect(isOrdering(undefined)).toBe(false)
    expect(isOrdering({})).toBe(false)
  })

  it('should be useful for sorting functions', () => {
    const items = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
      { name: 'Charlie', age: 35 },
      { name: 'David', age: 25 }
    ]
    
    // Custom comparator using Ordering enum
    function compareByAge(a: { age: number }, b: { age: number }): Ordering {
      if (a.age < b.age) return Ordering.Less
      if (a.age > b.age) return Ordering.Greater
      return Ordering.Equal
    }
    
    const sorted = [...items].sort((a, b) => compareByAge(a, b))
    
    expect(sorted[0].name).toBe('Bob')
    expect(sorted[1].name).toBe('David')
    expect(sorted[2].name).toBe('Alice')
    expect(sorted[3].name).toBe('Charlie')
  })

  it('should work with conditional expressions', () => {
    function getOrdering(a: number, b: number): Ordering {
      return a < b ? Ordering.Less : a > b ? Ordering.Greater : Ordering.Equal
    }
    
    expect(getOrdering(1, 2)).toBe(Ordering.Less)
    expect(getOrdering(2, 1)).toBe(Ordering.Greater)
    expect(getOrdering(1, 1)).toBe(Ordering.Equal)
  })

  it('should have correct values for comparison operations', () => {
    // Test that the values make sense for mathematical comparison
    expect(Ordering.Less).toBeLessThan(Ordering.Equal)
    expect(Ordering.Equal).toBeLessThan(Ordering.Greater)
    expect(Ordering.Less).toBeLessThan(Ordering.Greater)
    
    // Test that they work as expected in arithmetic
    expect(Ordering.Less + 1).toBe(Ordering.Equal)
    expect(Ordering.Equal + 1).toBe(Ordering.Greater)
    expect(Ordering.Greater - 1).toBe(Ordering.Equal)
    expect(Ordering.Equal - 1).toBe(Ordering.Less)
  })

  it('should be compatible with standard JavaScript sort return values', () => {
    // JavaScript sort expects negative, zero, or positive values
    const numbers = [3, 1, 4, 1, 5, 9, 2, 6]
    
    const sortedWithOrdering = [...numbers].sort((a, b) => {
      if (a < b) return Ordering.Less
      if (a > b) return Ordering.Greater
      return Ordering.Equal
    })
    
    const sortedNormally = [...numbers].sort((a, b) => a - b)
    
    expect(sortedWithOrdering).toEqual(sortedNormally)
    expect(sortedWithOrdering).toEqual([1, 1, 2, 3, 4, 5, 6, 9])
  })

  it('should validate all enum members are tested', () => {
    // This test ensures we didn't miss any enum members
    const testedMembers = ['Less', 'Equal', 'Greater']
    const actualMembers = Object.keys(Ordering).filter((k) => isNaN(Number(k)))
    
    expect(actualMembers.sort()).toEqual(testedMembers.sort())
  })
})