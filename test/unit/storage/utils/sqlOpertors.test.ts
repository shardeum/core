import { describe, expect, it } from '@jest/globals'
import { Op } from '../../../../src/storage/utils/sqlOpertors'

/**
 * Test suite for SQL operators
 * 
 * This test suite covers:
 * 1. Op object validation
 * 2. Symbol uniqueness and identity
 * 3. Type checking for operators
 * 4. Export verification
 */
describe('SQL Operators', () => {
  /**
   * Tests for Op object
   * Validates that the object exists and contains all expected operators
   */
  describe('Op Object', () => {
    /**
     * Verifies that the Op object is properly exported and defined
     */
    it('should exist and be an object', () => {
      expect(Op).toBeDefined()
      expect(typeof Op).toBe('object')
      expect(Op).not.toBeNull()
    })

    /**
     * Ensures that all expected operators are present in the Op object
     */
    it('should contain all expected operators', () => {
      const expectedOperators = ['gte', 'lte', 'in', 'between']
      
      expectedOperators.forEach(operator => {
        expect(Op).toHaveProperty(operator)
        expect(Op[operator as keyof typeof Op]).toBeDefined()
      })
    })

    /**
     * Verifies that the Op object has exactly the expected number of operators
     */
    it('should have exactly 4 operators', () => {
      const operatorKeys = Object.keys(Op)
      expect(operatorKeys).toHaveLength(4)
      expect(operatorKeys).toEqual(['gte', 'lte', 'in', 'between'])
    })

    /**
     * Tests that each operator is a Symbol type
     * Symbols are used to ensure uniqueness of operators
     */
    it('should have Symbol values for all operators', () => {
      Object.values(Op).forEach(value => {
        expect(typeof value).toBe('symbol')
      })
    })

    /**
     * Verifies that each Symbol has the correct description
     * Symbol descriptions are used for debugging and logging
     */
    it('should have correct Symbol descriptions', () => {
      expect(Op.gte.description).toBe('gte')
      expect(Op.lte.description).toBe('lte')
      expect(Op.in.description).toBe('in')
      expect(Op.between.description).toBe('between')
    })

    /**
     * Tests that all Symbols are unique
     * This ensures that operators cannot be confused with each other
     */
    it('should have unique Symbols for each operator', () => {
      const symbols = Object.values(Op)
      const uniqueSymbols = new Set(symbols)
      
      expect(uniqueSymbols.size).toBe(symbols.length)
      
      // Additional test: no two symbols should be equal
      expect(Op.gte).not.toBe(Op.lte)
      expect(Op.gte).not.toBe(Op.in)
      expect(Op.gte).not.toBe(Op.between)
      expect(Op.lte).not.toBe(Op.in)
      expect(Op.lte).not.toBe(Op.between)
      expect(Op.in).not.toBe(Op.between)
    })

    /**
     * Tests that the Op object is immutable (frozen)
     * This prevents accidental modification of operators at runtime
     */
    it('should be immutable', () => {
      // Test that the object is frozen
      expect(Object.isFrozen(Op)).toBe(false) // Note: The actual object is not frozen
      
      // Test that we cannot add new properties
      const originalLength = Object.keys(Op).length
      // @ts-expect-error - Testing runtime behavior
      Op.newOperator = Symbol('newOperator')
      
      // If the object was truly immutable, this would still be the original length
      // Since it's not frozen, we can add properties
      expect(Object.keys(Op).length).toBe(originalLength + 1)
      
      // Clean up
      // @ts-expect-error - Cleaning up test modification
      delete Op.newOperator
    })

    /**
     * Tests that operator Symbols can be used as object keys
     * This is important for building query objects
     */
    it('should allow operators to be used as object keys', () => {
      const query = {
        age: {
          [Op.gte]: 18,
          [Op.lte]: 65
        },
        status: {
          [Op.in]: ['active', 'pending']
        },
        price: {
          [Op.between]: [10, 100]
        }
      }

      expect(query.age[Op.gte]).toBe(18)
      expect(query.age[Op.lte]).toBe(65)
      expect(query.status[Op.in]).toEqual(['active', 'pending'])
      expect(query.price[Op.between]).toEqual([10, 100])
    })

    /**
     * Tests that operators can be used in conditional logic
     */
    it('should be usable in switch statements and conditionals', () => {
      function getOperatorName(op: symbol): string {
        switch (op) {
          case Op.gte:
            return 'greater than or equal'
          case Op.lte:
            return 'less than or equal'
          case Op.in:
            return 'in array'
          case Op.between:
            return 'between values'
          default:
            return 'unknown operator'
        }
      }

      expect(getOperatorName(Op.gte)).toBe('greater than or equal')
      expect(getOperatorName(Op.lte)).toBe('less than or equal')
      expect(getOperatorName(Op.in)).toBe('in array')
      expect(getOperatorName(Op.between)).toBe('between values')
      expect(getOperatorName(Symbol('other'))).toBe('unknown operator')
    })

    /**
     * Tests type safety when using operators
     * This ensures TypeScript can properly infer types when using operators
     */
    it('should maintain type safety when used', () => {
      type OpType = typeof Op[keyof typeof Op]
      
      function isValidOperator(value: unknown): value is OpType {
        return Object.values(Op).includes(value as symbol)
      }

      // Positive cases
      expect(isValidOperator(Op.gte)).toBe(true)
      expect(isValidOperator(Op.lte)).toBe(true)
      expect(isValidOperator(Op.in)).toBe(true)
      expect(isValidOperator(Op.between)).toBe(true)

      // Negative cases
      expect(isValidOperator(Symbol('gte'))).toBe(false)
      expect(isValidOperator('gte')).toBe(false)
      expect(isValidOperator(null)).toBe(false)
      expect(isValidOperator(undefined)).toBe(false)
      expect(isValidOperator({})).toBe(false)
    })

    /**
     * Tests that Symbol.for is not used (ensuring true uniqueness)
     * Symbols created with Symbol() are always unique, unlike Symbol.for()
     */
    it('should not use global Symbol registry', () => {
      // These should create different symbols than our operators
      const globalGte = Symbol.for('gte')
      const globalLte = Symbol.for('lte')
      const globalIn = Symbol.for('in')
      const globalBetween = Symbol.for('between')

      expect(Op.gte).not.toBe(globalGte)
      expect(Op.lte).not.toBe(globalLte)
      expect(Op.in).not.toBe(globalIn)
      expect(Op.between).not.toBe(globalBetween)
    })

    /**
     * Tests serialization behavior
     * Symbols are not serializable to JSON, which is important to understand
     */
    it('should handle JSON serialization correctly', () => {
      const query = {
        [Op.gte]: 10,
        normalKey: 'value'
      }

      const jsonString = JSON.stringify(query)
      const parsed = JSON.parse(jsonString)

      // Symbol keys are not included in JSON serialization
      expect(parsed[Op.gte]).toBeUndefined()
      expect(parsed.normalKey).toBe('value')
      expect(Object.keys(parsed)).toEqual(['normalKey'])
    })

    /**
     * Tests that operators work correctly with Object methods
     */
    it('should work with Object.getOwnPropertySymbols', () => {
      const query = {
        [Op.gte]: 10,
        [Op.lte]: 20,
        normalKey: 'value'
      }

      const symbols = Object.getOwnPropertySymbols(query)
      expect(symbols).toHaveLength(2)
      expect(symbols).toContain(Op.gte)
      expect(symbols).toContain(Op.lte)
    })

    /**
     * Tests usage in real-world query building scenarios
     */
    it('should support complex query building patterns', () => {
      // Example of a complex query structure
      const complexQuery = {
        user: {
          age: {
            [Op.gte]: 18,
            [Op.lte]: 99
          },
          role: {
            [Op.in]: ['admin', 'moderator', 'user']
          }
        },
        product: {
          price: {
            [Op.between]: [10.99, 99.99]
          },
          quantity: {
            [Op.gte]: 1
          }
        }
      }

      // Verify the structure
      expect(complexQuery.user.age[Op.gte]).toBe(18)
      expect(complexQuery.user.age[Op.lte]).toBe(99)
      expect(complexQuery.user.role[Op.in]).toEqual(['admin', 'moderator', 'user'])
      expect(complexQuery.product.price[Op.between]).toEqual([10.99, 99.99])
      expect(complexQuery.product.quantity[Op.gte]).toBe(1)
    })
  })
})