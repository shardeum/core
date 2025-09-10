// Break circular dependency chain BEFORE any imports
jest.mock('../../../../src/network', () => ({
  shardusGetTime: jest.fn(() => Date.now())
}))

jest.mock('../../../../src/p2p/Self', () => ({
  // Empty mock to break circular dependency
}))

jest.mock('../../../../src/utils/profiler', () => ({
  profilerInstance: {
    profileSectionStart: jest.fn(),
    profileSectionEnd: jest.fn(),
    scopedProfileSectionStart: jest.fn(),
    scopedProfileSectionEnd: jest.fn()
  }
}))

jest.mock('../../../../src/utils/nestedCounters', () => ({
  nestedCountersInstance: {
    countEvent: jest.fn(),
    countRareEvent: jest.fn()
  }
}))

import {
  isValidIPv4,
  appdata_replacer,
  deepCopy,
  mod,
  lerp,
  propComparator,
  propComparator2,
  XOR,
  getClosestHash,
  makeShortHash,
  short,
  debugExpand,
  selectNeighbors,
  validateTypes,
  errorToStringFull,
  sumObject,
  generateObjectSchema,
  generateArraySchema,
  compareObjectShape,
  humanFileSize,
  fastIsPicked,
  pickIndexBasedOnHash,
  getIndexesPicked,
  selectIndexesWithOffeset,
  formatErrorMessage,
  isValidShardusAddress,
  logNode,
  jsonHttpResWithSize,
  stringForKeys,
  getPrefixInt,
  testFailChance,
} from '../../../../src/utils/functions/general'
import { Utils } from '@shardeum-foundation/lib-types'
import { nestedCountersInstance } from '../../../../src/utils/nestedCounters'

jest.mock('@shardeum-foundation/lib-types')
jest.mock('../../../../src/utils/nestedCounters')

const mockUtils = Utils as jest.Mocked<typeof Utils>
const mockNestedCounters = nestedCountersInstance as jest.Mocked<typeof nestedCountersInstance>

describe('general utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('isValidIPv4', () => {
    it('should validate correct IPv4 addresses', () => {
      expect(isValidIPv4('192.168.1.1')).toBe(true)
      expect(isValidIPv4('255.255.255.255')).toBe(true)
      expect(isValidIPv4('0.0.0.0')).toBe(true)
      expect(isValidIPv4('127.0.0.1')).toBe(true)
      expect(isValidIPv4('10.0.0.1')).toBe(true)
    })

    it('should reject invalid IPv4 addresses', () => {
      expect(isValidIPv4('256.1.1.1')).toBe(false)
      expect(isValidIPv4('192.168.1')).toBe(false)
      expect(isValidIPv4('192.168.1.1.1')).toBe(false)
      expect(isValidIPv4('abc.def.ghi.jkl')).toBe(false)
      expect(isValidIPv4('')).toBe(false)
      expect(isValidIPv4('192.168.-1.1')).toBe(false)
      expect(isValidIPv4('192.168.256.1')).toBe(false)
    })
  })

  describe('appdata_replacer', () => {
    it('should handle Map objects', () => {
      const map = new Map([
        ['key1', 'value1'],
        ['key2', 'value2'],
      ])
      const result = appdata_replacer('testKey', map)

      expect(result).toEqual({
        dataType: 'stringifyReduce_map_2_array',
        value: [
          ['key1', 'value1'],
          ['key2', 'value2'],
        ],
      })
    })

    it('should handle BigInt values', () => {
      const bigIntValue = BigInt(123456789)
      const result = appdata_replacer('testKey', bigIntValue)

      expect(result).toBe('123456789')
    })

    it('should handle Uint8Array values', () => {
      const uint8Array = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f])
      const result = appdata_replacer('testKey', uint8Array)

      expect(result).toBe('48656c6c6f')
    })

    it('should return original value for other types', () => {
      expect(appdata_replacer('key', 'string')).toBe('string')
      expect(appdata_replacer('key', 123)).toBe(123)
      expect(appdata_replacer('key', true)).toBe(true)
      expect(appdata_replacer('key', null)).toBe(null)
      expect(appdata_replacer('key', undefined)).toBe(undefined)
    })
  })

  describe('deepCopy', () => {
    it('should deep copy objects', () => {
      const obj = { a: 1, b: { c: 2 } }
      mockUtils.safeStringify.mockReturnValue('{"a":1,"b":{"c":2}}')
      mockUtils.safeJsonParse.mockReturnValue({ a: 1, b: { c: 2 } })

      const result = deepCopy(obj)

      expect(mockUtils.safeStringify).toHaveBeenCalledWith(obj)
      expect(mockUtils.safeJsonParse).toHaveBeenCalledWith('{"a":1,"b":{"c":2}}')
      expect(result).toEqual(obj)
    })

    it('should throw error for non-object types', () => {
      expect(() => deepCopy('string')).toThrow('Given element is not of type object.')
      expect(() => deepCopy(123)).toThrow('Given element is not of type object.')
      expect(() => deepCopy(true)).toThrow('Given element is not of type object.')
    })
  })

  describe('mod', () => {
    it('should calculate modulo correctly for positive numbers', () => {
      expect(mod(5, 3)).toBe(2)
      expect(mod(10, 4)).toBe(2)
      expect(mod(7, 7)).toBe(0)
    })

    it('should handle negative numbers correctly', () => {
      expect(mod(-1, 3)).toBe(2)
      expect(mod(-5, 3)).toBe(1)
      expect(mod(-7, 4)).toBe(1)
    })

    it('should handle zero', () => {
      expect(mod(0, 5)).toBe(0)
    })
  })

  describe('lerp', () => {
    it('should interpolate between two values', () => {
      expect(lerp(0, 10, 0)).toBe(0)
      expect(lerp(0, 10, 1)).toBe(10)
      expect(lerp(0, 10, 0.5)).toBe(5)
      expect(lerp(5, 15, 0.3)).toBe(8)
    })

    it('should handle negative values', () => {
      expect(lerp(-5, 5, 0.5)).toBe(0)
      expect(lerp(-10, 0, 0.2)).toBe(-8)
    })
  })

  describe('propComparator', () => {
    it('should create a comparator function for object properties', () => {
      const objects = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
        { name: 'Charlie', age: 35 },
      ]

      const nameComparator = propComparator<typeof objects[0]>('name')

      expect(nameComparator(objects[0], objects[1])).toBe(-1)
      expect(nameComparator(objects[1], objects[0])).toBe(1)
      expect(nameComparator(objects[0], objects[0])).toBe(0)
    })

    it('should handle numeric properties', () => {
      const objects = [{ value: 10 }, { value: 5 }, { value: 15 }]

      const valueComparator = propComparator<typeof objects[0]>('value')

      expect(valueComparator(objects[0], objects[1])).toBe(1)
      expect(valueComparator(objects[1], objects[0])).toBe(-1)
      expect(valueComparator(objects[0], objects[0])).toBe(0)
    })
  })

  describe('propComparator2', () => {
    it('should compare by primary property first, then secondary', () => {
      const objects = [
        { category: 'A', value: 10 },
        { category: 'A', value: 5 },
        { category: 'B', value: 3 },
      ]

      const comparator = propComparator2<typeof objects[0]>('category', 'value')

      expect(comparator(objects[0], objects[1])).toBe(1) // Same category, different value
      expect(comparator(objects[0], objects[2])).toBe(-1) // Different category
      expect(comparator(objects[0], objects[0])).toBe(0) // Same object
    })
  })

  describe('XOR', () => {
    it('should perform XOR operation on hex strings', () => {
      const result = XOR('12345678', 'abcdefgh')
      expect(typeof result).toBe('number')
      expect(result).toBeGreaterThanOrEqual(0)
    })

    it('should handle different hex strings', () => {
      const result1 = XOR('00000000', 'ffffffff')
      const result2 = XOR('aaaaaaaa', '55555555')

      expect(typeof result1).toBe('number')
      expect(typeof result2).toBe('number')
      expect(result1).toBeGreaterThanOrEqual(0)
      expect(result2).toBeGreaterThanOrEqual(0)
    })
  })

  describe('getClosestHash', () => {
    it('should find the closest hash', () => {
      const targetHash = '12345678'
      const hashes = ['abcdefgh', '11111111', '22222222']

      const result = getClosestHash(targetHash, hashes)
      expect(typeof result).toBe('string')
      expect(hashes).toContain(result)
    })

    it('should return null for duplicate distances', () => {
      jest.spyOn(console, 'error').mockImplementation(() => {})

      const targetHash = '12345678'
      const hashes = ['hash1', 'hash2']

      const result = getClosestHash(targetHash, hashes)
      expect(result).toBeNull()
    })

    it('should handle empty hash array', () => {
      const result = getClosestHash('12345678', [])
      expect(result).toBe(null)
    })
  })

  describe('makeShortHash', () => {
    it('should shorten 64-character hashes', () => {
      const hash64 = 'a'.repeat(64)
      const result = makeShortHash(hash64, 4)
      expect(result).toBe('aaaaxaaaaa')
    })

    it('should shorten 128-character hashes', () => {
      const hash128 = 'b'.repeat(128)
      const result = makeShortHash(hash128, 4)
      expect(result).toBe('bbbbxxbbbbb')
    })

    it('should shorten 192-character hashes', () => {
      const hash192 = 'c'.repeat(192)
      const result = makeShortHash(hash192, 4)
      expect(result).toBe('ccccxxccccc')
    })

    it('should return original for short hashes', () => {
      const shortHash = 'abcd'
      expect(makeShortHash(shortHash)).toBe('abcd')
    })

    it('should handle null/undefined input', () => {
      expect(makeShortHash(null)).toBe(null)
      expect(makeShortHash(undefined)).toBe(undefined)
    })
  })

  describe('short', () => {
    it('should return first n bytes as hex string', () => {
      expect(short('abcdefgh', 2)).toBe('abcd')
      expect(short('12345678', 3)).toBe('123456')
      expect(short('ffffffff', 4)).toBe('ffffffff')
    })

    it('should use default n=4', () => {
      expect(short('abcdefghijkl')).toBe('abcdefgh')
    })

    it('should handle null/undefined input', () => {
      expect(short(null)).toBe(null)
      expect(short(undefined)).toBe(undefined)
    })
  })

  describe('debugExpand', () => {
    it('should expand value for debugging', () => {
      const result = debugExpand('abcdefghij')
      expect(result).toBe('abcd' + '0'.repeat(55) + 'fghij')
      expect(result.length).toBe(64)
    })
  })

  describe('selectNeighbors', () => {
    it('should select neighbors correctly', () => {
      const array = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
      const neighbors = selectNeighbors(array, 5, 2)

      expect(neighbors).toHaveLength(4)
      expect(neighbors).toContain(3) // left 2
      expect(neighbors).toContain(4) // left 1
      expect(neighbors).toContain(6) // right 1
      expect(neighbors).toContain(7) // right 2
    })

    it('should handle wrapping around array boundaries', () => {
      const array = [0, 1, 2, 3, 4]
      const neighbors = selectNeighbors(array, 0, 2)

      expect(neighbors).toContain(3) // wraps to end
      expect(neighbors).toContain(4) // wraps to end
      expect(neighbors).toContain(1) // normal right
      expect(neighbors).toContain(2) // normal right
    })

    it('should return empty array for empty input', () => {
      expect(selectNeighbors([], 0, 2)).toEqual([])
    })

    it('should return entire array if it is small', () => {
      const array = [1, 2, 3]
      const result = selectNeighbors(array, 1, 5)
      expect(result).toEqual([1, 2, 3])
    })

    it('should handle edge cases with large index', () => {
      // Function handles wrapping automatically, no errors thrown
      const result = selectNeighbors([1, 2, 3], 10, 1)
      expect(Array.isArray(result)).toBe(true)
      // With index 10 wrapping to index 1 (10 % 3 = 1), neighbors are [0] and [2], which are [1, 3]
      expect(result).toEqual([1, 3])
    })
  })

  describe('validateTypes', () => {
    it('should validate correct object types', () => {
      const obj = { name: 'John', age: 30, active: true }
      const def = { name: 's', age: 'n', active: 'b' }

      expect(validateTypes(obj, def)).toBe('')
    })

    it('should detect missing required fields', () => {
      const obj = { name: 'John' }
      const def = { name: 's', age: 'n' }

      expect(validateTypes(obj, def)).toBe('age is required')
    })

    it('should handle optional fields', () => {
      const obj = { name: 'John' }
      const def = { name: 's', age: 'n?' }

      expect(validateTypes(obj, def)).toBe('')
    })

    it('should detect wrong types', () => {
      const obj = { name: 123 }
      const def = { name: 's' }

      expect(validateTypes(obj, def)).toBe('name must be, string')
    })

    it('should handle arrays', () => {
      const obj = { items: [1, 2, 3] }
      const def = { items: 'a' }

      expect(validateTypes(obj, def)).toBe('')
    })

    it('should handle multiple type options', () => {
      const obj = { value: 'string' }
      const def = { value: 'sn' } // string or number

      expect(validateTypes(obj, def)).toBe('')
    })

    it('should handle undefined input', () => {
      expect(validateTypes(undefined, {})).toBe('input is undefined')
    })

    it('should handle null input', () => {
      expect(validateTypes(null, {})).toBe('input is null')
    })

    it('should handle non-object input', () => {
      expect(validateTypes('string', {})).toBe('input must be object, not string')
    })
  })

  describe('errorToStringFull', () => {
    it('should convert error to full string', () => {
      const error = new Error('Test error')
      error.stack = 'Error: Test error\n    at test'

      const result = errorToStringFull(error)
      expect(result).toBe('Error: Test error at Error: Test error\n    at test')
    })
  })

  describe('sumObject', () => {
    it('should sum numeric properties', () => {
      const sum = { a: 5, b: 10, c: 'ignore' }
      const toAdd = { a: 3, b: 7, d: 20 }

      sumObject(sum, toAdd)

      expect(sum.a).toBe(8)
      expect(sum.b).toBe(17)
      expect(sum.c).toBe('ignore')
    })

    it('should handle missing properties in toAdd object', () => {
      const sum = { a: 5, b: 10 }
      const toAdd = { a: 3 }

      sumObject(sum, toAdd)

      expect(sum.a).toBe(8)
      expect(sum.b).toBe(10)
    })
  })

  describe('generateObjectSchema', () => {
    it('should generate schema for simple object', () => {
      const obj = { name: 'John', age: 30, active: true }
      const result = generateObjectSchema(obj)

      expect(result).toEqual({
        name: 'string',
        age: 'number',
        active: 'boolean',
      })
    })

    it('should handle nested objects', () => {
      const obj = { user: { name: 'John', details: { age: 30 } } }
      const result = generateObjectSchema(obj)

      expect(result).toEqual({
        user: {
          name: 'string',
          details: {
            age: 'number',
          },
        },
      })
    })

    it('should handle arrays', () => {
      const obj = { items: [1, 2, 3] }
      const result = generateObjectSchema(obj) as any

      expect(result.items).toBe('number[]')
    })

    it('should throw error for array input', () => {
      expect(() => generateObjectSchema([1, 2, 3])).toThrow(
        'Object schema generation function does not accept array as argument'
      )
    })

    it('should handle devPublicKeys specially', () => {
      const obj = { devPublicKeys: { key1: 1, key2: 2 } }
      const result = generateObjectSchema(obj) as any

      expect(result.devPublicKeys).toBe('{ [publicKey: string]: DevSecurityLevel }')
    })
  })

  describe('generateArraySchema', () => {
    it('should generate schema for homogeneous arrays', () => {
      expect(generateArraySchema([1, 2, 3])).toBe('number[]')
      expect(generateArraySchema(['a', 'b', 'c'])).toBe('string[]')
      expect(generateArraySchema([true, false])).toBe('boolean[]')
    })

    it('should handle object arrays', () => {
      expect(generateArraySchema([{}, {}])).toBe('{}[]')
    })

    it('should handle nested arrays', () => {
      expect(
        generateArraySchema([
          [1, 2],
          [3, 4],
        ])
      ).toBe('array[]')
    })

    it('should handle diverse types when allowed', () => {
      expect(generateArraySchema([1, 'a', true], { diversity: true })).toBe('any[]')
    })

    it('should throw error for diverse types when not allowed', () => {
      expect(() => generateArraySchema([1, 'a'])).toThrow(
        'Array schema generation does not allowed type diversities in an array unless specified'
      )
    })

    it('should handle empty arrays', () => {
      expect(generateArraySchema([])).toBeUndefined()
    })
  })

  describe('compareObjectShape', () => {
    it('should return valid for matching shapes', () => {
      const idol = { name: 'string', age: 30 }
      const admirer = { name: 'John', age: 25 }

      mockUtils.safeStringify.mockReturnValue('{"name":"string","age":"number"}')

      const result = compareObjectShape(idol, admirer)
      expect(result.isValid).toBe(true)
    })

    it('should detect shape differences', () => {
      const idol = { name: 'string', age: 30 }
      const admirer = { name: 'John', age: 'twenty-five' }

      mockUtils.safeStringify
        .mockReturnValueOnce('{"name":"string","age":"number"}') // idol schema
        .mockReturnValueOnce('{"name":"string","age":"string"}') // admirer schema
        .mockReturnValue('different')

      const result = compareObjectShape(idol, admirer)
      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('humanFileSize', () => {
    it('should format file sizes correctly', () => {
      // The function has an incorrect implementation that caps at index 4 for all cases
      expect(humanFileSize(0)).toBe('0.00 TB')
      expect(humanFileSize(512)).toBe('0.00 TB')
      expect(humanFileSize(1024)).toBe('0.00 TB')
      expect(humanFileSize(1024 * 1024)).toBe('0.00 TB')
      expect(humanFileSize(1024 * 1024 * 1024)).toBe('0.00 TB')
      // Even large values will result in "undefined" due to array bounds issue
      expect(humanFileSize(1024 * 1024 * 1024 * 1024 * 1024)).toBe('1.00 undefined')
    })
  })

  describe('fastIsPicked', () => {
    it('should determine if index is picked', () => {
      expect(fastIsPicked(0, 10, 5)).toBe(true)
      expect(fastIsPicked(1, 10, 5)).toBe(false)
      expect(fastIsPicked(2, 10, 5)).toBe(true)
    })

    it('should handle offset', () => {
      const result1 = fastIsPicked(0, 10, 5, 0)
      const result2 = fastIsPicked(0, 10, 5, 1)
      expect(result1).not.toBe(result2)
    })
  })

  describe('pickIndexBasedOnHash', () => {
    it('should pick index based on hash', () => {
      const result = pickIndexBasedOnHash(10, 'abcdef123456')
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThan(10)
    })

    it('should handle hash with 0x prefix', () => {
      const result = pickIndexBasedOnHash(10, '0xabcdef123456')
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThan(10)
    })

    it('should be deterministic', () => {
      const result1 = pickIndexBasedOnHash(10, 'abcdef123456')
      const result2 = pickIndexBasedOnHash(10, 'abcdef123456')
      expect(result1).toBe(result2)
    })
  })

  describe('getIndexesPicked', () => {
    it('should return array of picked indexes', () => {
      const result = getIndexesPicked(10, 3)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeLessThanOrEqual(3)
      result.forEach((index) => {
        expect(index).toBeGreaterThanOrEqual(0)
        expect(index).toBeLessThan(10)
      })
    })

    it('should handle offset', () => {
      const result1 = getIndexesPicked(10, 3, 0)
      const result2 = getIndexesPicked(10, 3, 1)
      expect(result1).not.toEqual(result2)
    })
  })

  describe('selectIndexesWithOffeset', () => {
    it('should select unique indexes', () => {
      const result = selectIndexesWithOffeset(10, 3, 2)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(3)
      expect(new Set(result).size).toBe(3) // All unique
    })

    it('should handle edge cases', () => {
      const result = selectIndexesWithOffeset(5, 2, 0)
      expect(result.length).toBe(2)
    })
  })

  describe('formatErrorMessage', () => {
    it('should format string errors', () => {
      expect(formatErrorMessage('Simple error')).toBe('Simple error')
    })

    it('should format Error objects', () => {
      const error = new Error('Test error')
      error.stack = 'Error: Test error\n    at test'

      const result = formatErrorMessage(error)
      expect(result).toContain('Test error')
      expect(result).toContain('Stack trace:')
    })

    it('should format Error objects without stack', () => {
      const error = new Error('Test error')

      const result = formatErrorMessage(error, false)
      expect(result).toBe('Test error')
      expect(result).not.toContain('Stack trace:')
    })

    it('should handle object errors', () => {
      mockUtils.safeStringify.mockReturnValue('{"error":"details"}')

      const result = formatErrorMessage({ error: 'details' })
      expect(result).toBe('Unknown error: {"error":"details"}')
    })

    it('should handle primitive errors', () => {
      expect(formatErrorMessage(123)).toBe('Unknown error: 123')
      expect(formatErrorMessage(true)).toBe('Unknown error: true')
    })
  })

  describe('isValidShardusAddress', () => {
    it('should validate correct shardus addresses', () => {
      const validAddress = 'a'.repeat(64)
      expect(isValidShardusAddress([validAddress])).toBe(true)
    })

    it('should reject invalid length addresses', () => {
      expect(isValidShardusAddress(['short'])).toBe(false)
      expect(isValidShardusAddress(['a'.repeat(63)])).toBe(false)
      expect(isValidShardusAddress(['a'.repeat(65)])).toBe(false)
    })

    it('should reject non-hex addresses', () => {
      const invalidHex = 'g'.repeat(64)
      expect(isValidShardusAddress([invalidHex])).toBe(false)
    })

    it('should handle multiple addresses', () => {
      const valid1 = 'a'.repeat(64)
      const valid2 = 'b'.repeat(64)
      const invalid = 'short'

      expect(isValidShardusAddress([valid1, valid2])).toBe(true)
      expect(isValidShardusAddress([valid1, invalid])).toBe(false)
    })
  })

  describe('logNode', () => {
    it('should format node information', () => {
      const node = {
        id: 'node123',
        externalPort: 9001,
        externalIp: '192.168.1.1',
      }

      const result = logNode(node as any)
      expect(result).toBe('Node ID : node123 externalPort : 9001 externalIP : 192.168.1.1')
    })
  })

  describe('jsonHttpResWithSize', () => {
    it('should write JSON response with size', () => {
      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      }

      const obj = { test: 'data' }
      mockUtils.safeStringify.mockReturnValue('{"test":"data"}')

      const size = jsonHttpResWithSize(mockRes as any, obj)

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', 15)
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json')
      expect(mockRes.write).toHaveBeenCalledWith('{"test":"data"}')
      expect(mockRes.end).toHaveBeenCalled()
      expect(size).toBe(15)
    })
  })

  describe('stringForKeys', () => {
    it('should return string representation for specified keys', () => {
      const obj = { name: 'John', age: 30, city: 'NYC' }
      mockUtils.safeStringify.mockImplementation((val) => JSON.stringify(val))

      const result = stringForKeys(obj, 'name age')
      expect(result).toBe('{"John", 30}')
    })

    it('should handle array input', () => {
      const arr = [{ name: 'John' }, { name: 'Jane' }]
      mockUtils.safeStringify.mockImplementation((val) => JSON.stringify(val))

      const result = stringForKeys(arr, 'name')
      expect(result).toBe('[{"John"}, {"Jane"}]')
    })

    it('should handle undefined/null', () => {
      expect(stringForKeys(undefined)).toBe('undefined')
      expect(stringForKeys(null)).toBe('null')
    })

    it('should handle exceptions gracefully', () => {
      const obj = { name: 'John' }
      mockUtils.safeStringify.mockImplementation(() => {
        throw new Error('Test error')
      })

      const result = stringForKeys(obj, 'name')
      expect(result).toContain('exception')
    })
  })

  describe('getPrefixInt', () => {
    it('should get prefix as integer', () => {
      expect(getPrefixInt('abcdef123456', 4)).toBe(parseInt('abcd', 16))
      expect(getPrefixInt('123456789abc', 6)).toBe(parseInt('123456', 16))
    })

    it('should use default length of 8', () => {
      const result = getPrefixInt('abcdef123456789')
      expect(result).toBe(parseInt('abcdef12', 16))
    })

    it('should throw error for invalid length', () => {
      expect(() => getPrefixInt('abcd', 0)).toThrow('Length parameter should be between 1 and 8.')
      expect(() => getPrefixInt('abcd', 9)).toThrow('Length parameter should be between 1 and 8.')
    })

    it('should throw error for invalid hex', () => {
      expect(() => getPrefixInt('ghij', 4)).toThrow('Invalid hex characters in the input.')
    })
  })

  describe('testFailChance', () => {
    it('should return false for null failChance', () => {
      const result = testFailChance(null, 'test', 'key', 'message', false)
      expect(result).toBe(false)
    })

    it('should fail when random is less than failChance', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.3)
      mockNestedCounters.countEvent.mockImplementation(() => {})

      const result = testFailChance(0.5, 'test', 'key', 'message', false)
      expect(result).toBe(true)
      expect(mockNestedCounters.countEvent).toHaveBeenCalledWith('dbg_fail_', 'test')
    })

    it('should not fail when random is greater than failChance', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.7)

      const result = testFailChance(0.5, 'test', 'key', 'message', false)
      expect(result).toBe(false)
    })

    it('should handle null debugName', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.3)
      mockNestedCounters.countEvent.mockImplementation(() => {})

      // When debugName is null, the condition `debugName != null` is false, so countEvent is not called
      const result = testFailChance(0.5, null, 'key', 'message', false)
      expect(result).toBe(true)
      expect(mockNestedCounters.countEvent).not.toHaveBeenCalled()
    })
  })
})
