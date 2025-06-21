import { Utils } from '@shardeum-foundation/lib-types'
import {
  stringifyReduce,
  stringifyReduceLimit,
  replacer,
  reviver,
  reviverExpander,
  reviverMemoize,
  debugReplacer,
  debugReviver
} from '../../../../../src/utils/functions/stringifyReduce'
import { makeShortHash } from '../../../../../src/utils'

jest.mock('@shardeum-foundation/lib-types', () => ({
  Utils: {
    safeStringify: jest.fn().mockImplementation((val) => JSON.stringify(val))
  }
}))

jest.mock('../../../../../src/utils', () => ({
  makeShortHash: jest.fn().mockImplementation((x, n = 4) => {
    if (!x) {
      return x
    }
    if (x.length > 63) {
      if (x.length === 64) {
        return x.slice(0, n) + 'x' + x.slice(63 - n)
      } else if (x.length === 128) {
        return x.slice(0, n) + 'xx' + x.slice(127 - n)
      } else if (x.length === 192) {
        return x.slice(0, n) + 'xx' + x.slice(191 - n)
      }
    }
    return x
  })
}))

// Global setup for all tests
beforeEach(() => {
  jest.clearAllMocks()
  // Re-setup mock implementations after clearing
  const { makeShortHash } = require('../../../../../src/utils')
  makeShortHash.mockImplementation((x, n = 4) => {
    if (!x) {
      return x
    }
    if (x.length > 63) {
      if (x.length === 64) {
        return x.slice(0, n) + 'x' + x.slice(63 - n)
      } else if (x.length === 128) {
        return x.slice(0, n) + 'xx' + x.slice(127 - n)
      } else if (x.length === 192) {
        return x.slice(0, n) + 'xx' + x.slice(191 - n)
      }
    }
    return x
  })
  
  const { Utils } = require('@shardeum-foundation/lib-types')
  Utils.safeStringify.mockImplementation((val) => JSON.stringify(val))
})

describe('stringifyReduce', () => {


  describe('primitive values', () => {
    it('should handle boolean true', () => {
      const result = stringifyReduce(true)
      expect(result).toBe('true')
    })

    it('should handle boolean false', () => {
      const result = stringifyReduce(false)
      expect(result).toBe('false')
    })

    it('should handle null', () => {
      const result = stringifyReduce(null)
      expect(result).toBe(null)
    })

    it('should handle undefined', () => {
      const result = stringifyReduce(undefined)
      expect(result).toBe(undefined)
    })

    it('should handle undefined as array property', () => {
      const result = stringifyReduce(undefined, true)
      expect(result).toBe(null)
    })

    it('should handle functions', () => {
      const result = stringifyReduce(() => {})
      expect(result).toBe(undefined)
    })

    it('should handle functions as array property', () => {
      const result = stringifyReduce(() => {}, true)
      expect(result).toBe(null)
    })

    it('should handle numbers', () => {
      const result = stringifyReduce(42)
      expect(result).toBe(42)
    })

    it('should handle finite numbers', () => {
      const result = stringifyReduce(3.14)
      expect(result).toBe(3.14)
    })

    it('should handle infinite numbers', () => {
      const result = stringifyReduce(Infinity)
      expect(result).toBe(null)
    })

    it('should handle NaN', () => {
      const result = stringifyReduce(NaN)
      expect(result).toBe(null)
    })
  })

  describe('string handling', () => {
    it('should reduce strings using makeShortHash', () => {
      const testString = 'this is a long string'
      const result = stringifyReduce(testString)
      
      expect(makeShortHash).toHaveBeenCalledWith(testString)
      expect(Utils.safeStringify).toHaveBeenCalledWith('this is a long string')
      expect(result).toBe('"this is a long string"')
    })
  })

  describe('bigint handling', () => {
    it('should handle bigint values', () => {
      const bigintValue = BigInt(123456789)
      const result = stringifyReduce(bigintValue)
      
      expect(Utils.safeStringify).toHaveBeenCalledWith('75bcd15')
      expect(result).toBe('"75bcd15"')
    })

    it('should handle bigint values in default case', () => {
      // Mock typeof to return 'bigint' in default case
      const bigintValue = BigInt(999)
      const result = stringifyReduce(bigintValue)
      
      expect(result).toBe('"3e7"')
    })
  })

  describe('array handling', () => {
    it('should handle empty arrays', () => {
      const result = stringifyReduce([])
      expect(result).toBe('[]')
    })

    it('should handle arrays with primitive values', () => {
      const result = stringifyReduce([1, 2, 3])
      expect(result).toBe('[1,2,3]')
    })

    it('should handle arrays with mixed types', () => {
      const result = stringifyReduce([1, 'test', true, null])
      
      expect(makeShortHash).toHaveBeenCalledWith('test')
      expect(result).toBe('[1,"test",true,null]')
    })

    it('should handle nested arrays', () => {
      const result = stringifyReduce([[1, 2], [3, 4]])
      expect(result).toBe('[[1,2],[3,4]]')
    })
  })

  describe('object handling', () => {
    it('should handle empty objects', () => {
      const result = stringifyReduce({})
      expect(result).toBe('{}')
    })

    it('should handle simple objects', () => {
      const result = stringifyReduce({ a: 1, b: 2 })
      expect(result).toBe('{"a":1,"b":2}')
    })

    it('should sort object keys', () => {
      const result = stringifyReduce({ c: 3, a: 1, b: 2 })
      expect(result).toBe('{"a":1,"b":2,"c":3}')
    })

    it('should skip undefined values in objects', () => {
      const result = stringifyReduce({ a: 1, b: undefined, c: 3 })
      expect(result).toBe('{"a":1,"c":3}')
    })

    it('should handle nested objects', () => {
      const result = stringifyReduce({ a: { x: 1 }, b: 2 })
      expect(result).toBe('{"a":{"x":1},"b":2}')
    })
  })

  describe('special object types', () => {
    it('should handle objects with toJSON method', () => {
      const objWithToJSON = {
        value: 'test',
        toJSON: jest.fn(() => ({ serialized: true }))
      }
      
      const result = stringifyReduce(objWithToJSON)
      
      expect(objWithToJSON.toJSON).toHaveBeenCalled()
      expect(result).toBe('{"serialized":true}')
    })

    it('should handle Map objects', () => {
      const map = new Map([['key1', 'value1'], ['key2', 'value2']])
      const result = stringifyReduce(map)
      
      expect(result).toBe('{"dataType":"stringifyReduce_map_2_array","value":[["key1","value1"],["key2","value2"]]}')
    })

    it('should handle Uint8Array', () => {
      const uint8Array = new Uint8Array([72, 101, 108, 108, 111])
      const result = stringifyReduce(uint8Array)
      
      expect(result).toBe('48656c6c6f')
    })

    it('should handle other object types using safeStringify', () => {
      const date = new Date('2023-01-01')
      const result = stringifyReduce(date)
      
      expect(Utils.safeStringify).toHaveBeenCalledWith('2023-01-01T00:00:00.000Z')
    })
  })
})

describe('stringifyReduceLimit', () => {

  it('should return LIMIT when limit is negative', () => {
    const result = stringifyReduceLimit({ a: 1 }, -1)
    expect(result).toBe('undefinedLIMIT')
  })

  it('should handle primitive values like stringifyReduce', () => {
    expect(stringifyReduceLimit(true)).toBe('true')
    expect(stringifyReduceLimit(false)).toBe('false')
    expect(stringifyReduceLimit(null)).toBe(null)
    expect(stringifyReduceLimit(42)).toBe(42)
  })

  it('should handle arrays within limit', () => {
    const result = stringifyReduceLimit([1, 2, 3], 100)
    expect(result).toBe('[1,2,3]')
  })

  it('should truncate arrays when limit exceeded', () => {
    const result = stringifyReduceLimit([1, 2, 3, 4, 5], 5)
    expect(result).toBe('[1,2,3,LIMIT')
  })

  it('should handle objects within limit', () => {
    const result = stringifyReduceLimit({ a: 1, b: 2 }, 100)
    expect(result).toBe('{"a":1,"b":2}')
  })

  it('should truncate objects when limit exceeded', () => {
    const result = stringifyReduceLimit({ a: 1, b: 2, c: 3, d: 4 }, 10)
    expect(result).toBe('\"a\":1,\"b\":2LIMIT')
  })

  it('should handle strings with makeShortHash', () => {
    const result = stringifyReduceLimit('test string')
    
    expect(makeShortHash).toHaveBeenCalledWith('test string')
    expect(result).toBe('"test string"')
  })

  it('should handle bigint by converting to string', () => {
    const bigintValue = BigInt(123)
    const result = stringifyReduceLimit(bigintValue)
    
    expect(result).toBe('123')
  })

  it('should handle objects with toJSON method', () => {
    const objWithToJSON = {
      toJSON: jest.fn(() => ({ reduced: true }))
    }
    
    const result = stringifyReduceLimit(objWithToJSON, 100)
    
    expect(objWithToJSON.toJSON).toHaveBeenCalled()
    expect(result).toBe('{"reduced":true}')
  })
})

describe('replacer', () => {
  it('should convert Map to stringifyReduce_map_2_array format', () => {
    const map = new Map([['key1', 'value1'], ['key2', 'value2']])
    const result = replacer('testKey', map)
    
    expect(result).toEqual({
      dataType: 'stringifyReduce_map_2_array',
      value: [['key1', 'value1'], ['key2', 'value2']]
    })
  })

  it('should return value unchanged for non-Map objects', () => {
    const obj = { a: 1, b: 2 }
    const result = replacer('testKey', obj)
    
    expect(result).toBe(obj)
  })

  it('should return primitive values unchanged', () => {
    expect(replacer('key', 'string')).toBe('string')
    expect(replacer('key', 42)).toBe(42)
    expect(replacer('key', true)).toBe(true)
  })
})

describe('reviver', () => {
  it('should convert stringifyReduce_map_2_array back to Map', () => {
    const mapData = {
      dataType: 'stringifyReduce_map_2_array',
      value: [['key1', 'value1'], ['key2', 'value2']]
    }
    
    const result = reviver('testKey', mapData)
    
    expect(result).toBeInstanceOf(Map)
    expect((result as Map<string, string>).get('key1')).toBe('value1')
    expect((result as Map<string, string>).get('key2')).toBe('value2')
  })

  it('should return value unchanged for non-map objects', () => {
    const obj = { a: 1, b: 2 }
    const result = reviver('testKey', obj)
    
    expect(result).toBe(obj)
  })

  it('should return primitive values unchanged', () => {
    expect(reviver('key', 'string')).toBe('string')
    expect(reviver('key', 42)).toBe(42)
    expect(reviver('key', null)).toBe(null)
  })
})

describe('reviverExpander', () => {
  it('should convert stringifyReduce_map_2_array back to Map', () => {
    const mapData = {
      dataType: 'stringifyReduce_map_2_array',
      value: [['key1', 'value1'], ['key2', 'value2']]
    }
    
    const result = reviverExpander('testKey', mapData)
    
    expect(result).toBeInstanceOf(Map)
    expect((result as Map<string, string>).get('key1')).toBe('value1')
  })

  it('should expand shortened strings', () => {
    const shortString = '1234x56789'
    const result = reviverExpander('testKey', shortString)
    
    expect(result).toBe('1234' + '0'.repeat(55) + '56789')
  })

  it('should not expand strings that do not match pattern', () => {
    const normalString = 'normal string'
    const result = reviverExpander('testKey', normalString)
    
    expect(result).toBe(normalString)
  })

  it('should return other values unchanged', () => {
    const obj = { a: 1 }
    const result = reviverExpander('testKey', obj)
    
    expect(result).toBe(obj)
  })
})

describe('reviverMemoize', () => {
  it('should convert stringifyReduce_map_2_array back to Map', () => {
    const mapData = {
      dataType: 'stringifyReduce_map_2_array',
      value: [['key1', 'value1'], ['key2', 'value2']]
    }
    
    const result = reviverMemoize('testKey', mapData)
    
    expect(result).toBeInstanceOf(Map)
    expect((result as Map<string, string>).get('key1')).toBe('value1')
  })

  it('should return value unchanged for non-map objects', () => {
    const obj = { a: 1, b: 2 }
    const result = reviverMemoize('testKey', obj)
    
    expect(result).toBe(obj)
  })
})

describe('debugReplacer', () => {

  it('should return empty object for accountTempMap key', () => {
    const result = debugReplacer('accountTempMap', { some: 'data' })
    expect(result).toEqual({})
  })

  it('should reduce strings using makeShortHash', () => {
    const testString = 'this is a test string'
    const result = debugReplacer('testKey', testString)
    
    expect(makeShortHash).toHaveBeenCalledWith(testString)
    expect(result).toBe('this is a test string')
  })

  it('should convert Map to stringifyReduce_map_2_array format', () => {
    const map = new Map([['key1', 'value1'], ['key2', 'value2']])
    const result = debugReplacer('testKey', map)
    
    expect(result).toEqual({
      dataType: 'stringifyReduce_map_2_array',
      value: [['key1', 'value1'], ['key2', 'value2']]
    })
  })

  it('should return value unchanged for other types', () => {
    const obj = { a: 1, b: 2 }
    const result = debugReplacer('testKey', obj)
    
    expect(result).toBe(obj)
  })
})

describe('debugReviver', () => {
  it('should convert stringifyReduce_map_2_array back to Map', () => {
    const mapData = {
      dataType: 'stringifyReduce_map_2_array',
      value: [['key1', 'value1'], ['key2', 'value2']]
    }
    
    const result = debugReviver('testKey', mapData)
    
    expect(result).toBeInstanceOf(Map)
    expect((result as Map<string, string>).get('key1')).toBe('value1')
  })

  it('should return value unchanged for non-map objects', () => {
    const obj = { a: 1, b: 2 }
    const result = debugReviver('testKey', obj)
    
    expect(result).toBe(obj)
  })
})

describe('edge cases and integration', () => {

  it('should handle complex nested structures', () => {
    const complex = {
      array: [1, 'test', { nested: true }],
      map: new Map([['mapKey', 'mapValue']]),
      string: 'long string value',
      number: 42,
      boolean: true,
      nullValue: null,
      undefinedValue: undefined
    }
    
    const result = stringifyReduce(complex)
    
    expect(result).toContain('"array":[1,"test",{"nested":true}]')
    expect(result).toContain('"boolean":true')
    expect(result).toContain('"number":42')
    expect(result).toContain('"nullValue":null')
    expect(result).not.toContain('undefinedValue')
  })

  it('should handle circular references through toJSON', () => {
    const obj = { value: 'test' }
    obj['circular'] = obj
    
    // Add toJSON to handle circular reference
    obj['toJSON'] = () => ({ value: obj.value, hasCircular: true })
    
    const result = stringifyReduce(obj)
    expect(result).toBe('{"hasCircular":true,"value":"test"}')
  })

  it('should handle Uint8Array with various byte values', () => {
    const uint8Array = new Uint8Array([0, 255, 128, 64])
    const result = stringifyReduce(uint8Array)
    
    expect(result).toBe('00ff8040')
  })
})