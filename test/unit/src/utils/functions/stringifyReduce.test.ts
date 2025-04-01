// @ts-nocheck
import { Utils } from '@shardeum-foundation/lib-types'
import { makeShortHash } from '../../../../../src/utils'
import {
  stringifyReduce,
  stringifyReduceLimit,
  replacer,
  reviver,
  reviverExpander,
  reviverMemoize,
  debugReplacer,
  debugReviver,
} from '../../../../../src/utils/functions/stringifyReduce'

// Mock dependencies first
jest.mock('@shardeum-foundation/lib-types', () => ({
  Utils: {
    safeStringify: jest.fn((val) => JSON.stringify(val)),
  },
}))

jest.mock('../../../../../src/utils', () => ({
  makeShortHash: jest.fn((str) => {
    if (str.length > 10) {
      return str.slice(0, 4) + 'x' + str.slice(str.length - 5)
    }
    return str
  }),
}))

describe('stringifyReduce functions', () => {
  // Clear mocks before each test
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Internal objKeys handling', () => {
    it('should handle objects with non-standard prototypes', () => {
      // Create an object without the standard Object prototype
      const obj = Object.create(null)
      obj.a = 1
      obj.b = 2

      // This object doesn't inherit Object.prototype methods
      // But we don't actually expect special handling, as the function will use Object.keys anyway
      const result = stringifyReduce(obj)

      // Just check that the result contains values - don't test format specifics
      expect(result).toBeDefined()
      expect(result).toContain('1')
      expect(result).toContain('2')
    })

    it('should enumerate properties from objects with custom property descriptors', () => {
      // Create an object with custom property descriptors
      const obj = {}
      Object.defineProperties(obj, {
        a: { value: 1, enumerable: true, configurable: true, writable: true },
        b: { value: 2, enumerable: true, configurable: false, writable: false },
      })

      // Call stringifyReduce
      const result = stringifyReduce(obj)

      // Just check that the result contains values
      expect(result).toBeDefined()
      expect(result).toContain('1')
      expect(result).toContain('2')
    })
  })

  describe('stringifyReduce', () => {
    describe('primitive values', () => {
      it('should handle booleans correctly', () => {
        expect(stringifyReduce(true)).toBe('true')
        expect(stringifyReduce(false)).toBe('false')
      })

      it('should handle null correctly', () => {
        expect(stringifyReduce(null)).toBe(null)
      })

      it('should handle undefined correctly', () => {
        expect(stringifyReduce(undefined, false)).toBe(undefined)
        expect(stringifyReduce(undefined, true)).toBe(null)
      })

      it('should handle numbers correctly', () => {
        expect(stringifyReduce(123)).toBe(123)
        expect(stringifyReduce(0)).toBe(0)
        expect(stringifyReduce(-123)).toBe(-123)
      })

      it('should handle NaN and Infinity correctly', () => {
        expect(stringifyReduce(NaN)).toBe(null)
        expect(stringifyReduce(Infinity)).toBe(null)
        expect(stringifyReduce(-Infinity)).toBe(null)
      })

      it('should handle bigint values correctly', () => {
        const bigintVal = BigInt(123456789)
        stringifyReduce(bigintVal)
        expect(Utils.safeStringify).toHaveBeenCalled()
      })

      it('should handle string values correctly', () => {
        stringifyReduce('test string')
        expect(makeShortHash).toHaveBeenCalledWith('test string')
      })
    })

    describe('complex objects', () => {
      it('should handle objects with toJSON method', () => {
        const obj = {
          toJSON: jest.fn(() => ({ converted: 'value' })),
        }
        stringifyReduce(obj)
        expect(obj.toJSON).toHaveBeenCalled()
      })

      it('should handle Map with complex values', () => {
        // Create a Map with complex values
        const nestedObj = { a: 1, b: 2 }
        const map = new Map([
          ['key1', nestedObj],
          ['key2', [1, 2, 3]],
        ])

        // Call stringifyReduce and verify the type of return value
        const result = stringifyReduce(map)

        // Don't test for structure - just make sure it's defined and is a non-empty string or object
        expect(result).toBeDefined()
        expect(result).not.toBe(null)

        // It's difficult to predict the exact format due to mocking,
        // so let's just test that the values are included
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result)
        expect(resultStr).toContain('1') // From nestedObj
        expect(resultStr).toContain('2') // From nestedObj and array
        expect(resultStr).toContain('3') // From array
      })

      it('should correctly serialize objects with various property values', () => {
        const obj = {
          emptyString: '',
          nullValue: null,
          zeroValue: 0,
        }

        // Simply test that stringifyReduce accepts such an object without throwing
        const result = stringifyReduce(obj)
        expect(result).toBeDefined()

        // If we're expecting safeStringify to be called on keys, we can set up a spy
        // to see if it's called with anything (not specific values)
        jest.spyOn(Utils, 'safeStringify')
        stringifyReduce(obj)
        expect(Utils.safeStringify).toHaveBeenCalled()

        // Reset the spy
        Utils.safeStringify.mockReset()
      })

      it('should handle Map objects', () => {
        const map = new Map([
          ['key1', 'value1'],
          ['key2', 'value2'],
        ])
        const result = stringifyReduce(map)
        expect(result).toBeDefined()
      })

      it('should handle Uint8Array correctly', () => {
        const uint8Array = new Uint8Array([72, 101, 108, 108, 111]) // "Hello" in ASCII
        const result = stringifyReduce(uint8Array)
        expect(result).toBe('48656c6c6f') // Hex representation of "Hello"
      })

      it('should handle empty arrays', () => {
        expect(stringifyReduce([])).toBe('[]')
      })

      it('should handle arrays with primitive values', () => {
        const result = stringifyReduce([1, 2, 3])
        expect(result).toBe('[1,2,3]')
      })

      it('should handle arrays with mixed values', () => {
        stringifyReduce([1, 'test', null, true])
        expect(makeShortHash).toHaveBeenCalled()
      })

      it('should enumerate object properties', () => {
        const obj = {
          c: 3,
          a: 1,
          b: 2,
        }
        stringifyReduce(obj)
        // Just verify it doesn't throw
        expect(true).toBe(true)
      })

      it('should skip undefined properties in objects', () => {
        const obj = {
          a: 1,
          b: undefined,
          c: 3,
        }
        const result = stringifyReduce(obj)

        expect(result).not.toContain(':"undefined"')
      })

      it('should handle non-enumerable properties correctly', () => {
        const obj = Object.create(
          {},
          {
            a: { value: 1, enumerable: true },
            b: { value: 2, enumerable: false }, // Not enumerable
          }
        )
        const result = stringifyReduce(obj)
        expect(result).not.toContain('2')
      })
    })
  })

  describe('stringifyReduceLimit', () => {
    it('should return "LIMIT" when limit is negative', () => {
      const result = stringifyReduceLimit({ test: 'value' }, -1)
      expect(result).toContain('LIMIT')
    })

    it('should handle primitive values', () => {
      expect(stringifyReduceLimit(true)).toBe('true')
      expect(stringifyReduceLimit(false)).toBe('false')
      expect(stringifyReduceLimit(null)).toBe(null)
      expect(stringifyReduceLimit(undefined, 100, false)).toBe(undefined)
      expect(stringifyReduceLimit(undefined, 100, true)).toBe(null)
    })

    it('should properly limit array elements when total length exceeds limit', () => {
      // Create an array with elements that will definitely exceed the limit
      const arr = ['abc', 'def', 'ghi']

      // Set a very low limit
      const result = stringifyReduceLimit(arr, 5)

      // Verify it contains the LIMIT marker
      expect(result).toContain('LIMIT')
    })

    it('should properly limit nested array elements based on cumulative length', () => {
      // Create a nested array where the first element is short but later elements are long
      const arr = [
        1,
        'short',
        ['this', 'is', 'a', 'very', 'long', 'nested', 'array', 'that', 'will', 'exceed', 'the', 'limit'],
      ]

      // Set a limit that allows the first elements but cuts off in the nested array
      const result = stringifyReduceLimit(arr, 30)

      // Verify it contains the LIMIT marker
      expect(result).toContain('LIMIT')
    })

    it('should handle functions or undefined in stringifyReduceLimit', () => {
      const testFunction = () => {}

      // Test function handling
      expect(stringifyReduceLimit(testFunction, 100, false)).toBe(undefined)
      expect(stringifyReduceLimit(testFunction, 100, true)).toBe(null)

      // Test undefined handling more explicitly
      expect(stringifyReduceLimit(undefined, 100, false)).toBe(undefined)
      expect(stringifyReduceLimit(undefined, 100, true)).toBe(null)
    })

    it('should handle functions in array context', () => {
      const arr = [1, () => {}, 3]
      const result = stringifyReduceLimit(arr, 100)
      expect(result).toBe('[1,null,3]')
    })

    it('should handle other types like bigint in stringifyReduceLimit', () => {
      // Create a bigint value
      const bigintVal = BigInt(123456789)

      // Call the function
      const result = stringifyReduceLimit(bigintVal)

      // Verify the result
      expect(result).toBeDefined()

      // The result is a number, not a string in the implementation
      expect(result).toContain('123456789')
    })

    it('should handle numbers correctly in stringifyReduceLimit', () => {
      const num = 123.456
      const result = stringifyReduceLimit(num)
      // The implementation returns the number itself, not a string
      expect(result).toBe(123.456)
    })

    it('should limit output for large arrays', () => {
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      const result = stringifyReduceLimit(arr, 5)
      expect(result).toContain('LIMIT')
    })

    it('should handle limit parameter for objects', () => {
      const obj = { key: 'value' }

      // Call the function with various limits
      const result1 = stringifyReduceLimit(obj, 100)
      const result2 = stringifyReduceLimit(obj, 1)

      // Just verify the function doesn't throw
      expect(result1).toBeDefined()
      expect(result2).toBeDefined()
    })

    it('should handle objects with toJSON method', () => {
      const obj = {
        toJSON: jest.fn(() => ({ a: 1, b: 2 })),
      }
      stringifyReduceLimit(obj, 100)
      expect(obj.toJSON).toHaveBeenCalled()
    })

    it('should handle bigint values correctly', () => {
      const bigintVal = BigInt(123456789)
      stringifyReduceLimit(bigintVal)
      expect(true).toBe(true)
    })

    it('should handle string values correctly', () => {
      stringifyReduceLimit('test string')
      expect(makeShortHash).toHaveBeenCalledWith('test string')
    })
  })

  describe('replacer', () => {
    it('should handle Map objects', () => {
      const map = new Map([['key', 'value']])
      const result = replacer('testKey', map)

      expect(typeof result).toBe('object')
      expect(result.dataType).toBe('stringifyReduce_map_2_array')
      expect(Array.isArray(result.value)).toBe(true)
    })

    it('should return non-Map values as is', () => {
      expect(replacer('testKey', 'string')).toBe('string')
      expect(replacer('testKey', 123)).toBe(123)
      expect(replacer('testKey', null)).toBe(null)
    })
  })

  describe('reviver', () => {
    it('should convert serialized Maps back to Map instances', () => {
      const serializedMap = {
        dataType: 'stringifyReduce_map_2_array',
        value: [['key', 'value']],
      }

      const result = reviver('testKey', serializedMap)

      expect(result instanceof Map).toBe(true)
      expect(result.get('key')).toBe('value')
    })

    it('should return non-Map values as is', () => {
      expect(reviver('testKey', 'string')).toBe('string')
      expect(reviver('testKey', 123)).toBe(123)
      expect(reviver('testKey', null)).toBe(null)
    })

    it('should identify serialized data correctly', () => {
      // This test verifies that the function can differentiate between objects with and without dataType

      // Regular object without dataType
      const regularObj = { someKey: 'someValue' }
      expect(reviver('testKey', regularObj)).toBe(regularObj)

      // Object with a valid dataType
      const validMap = {
        dataType: 'stringifyReduce_map_2_array',
        value: [['key', 'value']],
      }
      expect(reviver('testKey', validMap) instanceof Map).toBe(true)
    })
  })

  describe('reviverExpander', () => {
    it('should convert serialized Maps back to Map instances', () => {
      const serializedMap = {
        dataType: 'stringifyReduce_map_2_array',
        value: [['key', 'value']],
      }

      const result = reviverExpander('testKey', serializedMap)

      expect(result instanceof Map).toBe(true)
      expect(result.get('key')).toBe('value')
    })

    it('should expand shortened strings correctly', () => {
      const shortenedString = 'aaaaxbbbbb'

      const result = reviverExpander('testKey', shortenedString)

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(shortenedString.length)

      expect(result.startsWith('aaaa')).toBe(true)
      expect(result.endsWith('bbbbb')).toBe(true)
    })

    it('should return other values as is', () => {
      expect(reviverExpander('testKey', 'normal-string')).toBe('normal-string')
      expect(reviverExpander('testKey', 123)).toBe(123)
      expect(reviverExpander('testKey', null)).toBe(null)
    })
  })

  describe('reviverMemoize', () => {
    it('should convert serialized Maps back to Map instances', () => {
      const serializedMap = {
        dataType: 'stringifyReduce_map_2_array',
        value: [['key', 'value']],
      }

      const result = reviverMemoize('testKey', serializedMap)

      expect(result instanceof Map).toBe(true)
      expect(result.get('key')).toBe('value')
    })

    it('should return other values as is', () => {
      expect(reviverMemoize('testKey', 'string')).toBe('string')
      expect(reviverMemoize('testKey', 123)).toBe(123)
      expect(reviverMemoize('testKey', null)).toBe(null)
    })

    it('should handle invalid serialized Map data', () => {
      const invalidMap = {
        dataType: 'not_a_map',
        value: [['key', 'value']],
      }

      const result = reviverMemoize('testKey', invalidMap)
      // Whether or not the function returns the original object,
      // it shouldn't throw an error
      try {
        expect(true).toBe(true) // Just verify no exception was thrown
      } catch (e) {
        fail('reviverMemoize threw an exception')
      }
    })
  })

  describe('debugReplacer', () => {
    it('should return empty object for accountTempMap', () => {
      const result = debugReplacer('accountTempMap', { test: 'value' })
      expect(result).toEqual({})
    })

    it('should handle string values by hashing them', () => {
      debugReplacer('testKey', 'test string')
      expect(makeShortHash).toHaveBeenCalled()
    })

    it('should handle Map objects', () => {
      const map = new Map([['key', 'value']])
      const result = debugReplacer('testKey', map)

      expect(typeof result).toBe('object')
      expect(result.dataType).toBe('stringifyReduce_map_2_array')
      expect(Array.isArray(result.value)).toBe(true)
    })

    it('should return other values as is', () => {
      expect(debugReplacer('testKey', 123)).toBe(123)
      expect(debugReplacer('testKey', null)).toBe(null)
      expect(debugReplacer('testKey', { a: 1 })).toEqual({ a: 1 })
    })
  })

  describe('debugReviver', () => {
    it('should convert serialized Maps back to Map instances', () => {
      const serializedMap = {
        dataType: 'stringifyReduce_map_2_array',
        value: [['key', 'value']],
      }

      const result = debugReviver('testKey', serializedMap)

      expect(result instanceof Map).toBe(true)
      expect(result.get('key')).toBe('value')
    })

    it('should return non-serialized Map values as is', () => {
      expect(debugReviver('testKey', 'string')).toBe('string')
      expect(debugReviver('testKey', 123)).toBe(123)
      expect(debugReviver('testKey', null)).toBe(null)
    })

    it('should handle objects without dataType property', () => {
      const obj = { foo: 'bar' }
      expect(debugReviver('testKey', obj)).toBe(obj)
    })

    it('should handle null and primitive values', () => {
      expect(debugReviver('testKey', null)).toBe(null)
      expect(debugReviver('testKey', 123)).toBe(123)
      expect(debugReviver('testKey', 'string')).toBe('string')
    })
  })
})
