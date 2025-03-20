import { Ordering } from '../../../../../src/utils/ordering'
import {
  sortAsc,
  sortDec,
  sort_i_Asc,
  sort_id_Asc,
  sortHashAsc,
  sortTimestampAsc,
  sortAscProp,
  sortDecProp,
} from '../../../../../src/utils/functions/sortingCompareFunctions'

describe('sortingCompareFunctions', () => {
  describe('sortAsc', () => {
    it('should return 0 when values are equal', () => {
      expect(sortAsc(5, 5)).toBe(Ordering.Equal)
      expect(sortAsc('test', 'test')).toBe(Ordering.Equal)
      expect(sortAsc(true, true)).toBe(Ordering.Equal)
    })

    it('should return -1 when first value is less than second', () => {
      expect(sortAsc(3, 5)).toBe(Ordering.Less)
      expect(sortAsc('abc', 'def')).toBe(Ordering.Less)
      expect(sortAsc(false, true)).toBe(Ordering.Less)
    })

    it('should return 1 when first value is greater than second', () => {
      expect(sortAsc(8, 5)).toBe(Ordering.Greater)
      expect(sortAsc('xyz', 'def')).toBe(Ordering.Greater)
      expect(sortAsc(true, false)).toBe(Ordering.Greater)
    })

    it('should handle edge cases correctly', () => {
      // Empty strings
      expect(sortAsc('', 'a')).toBe(Ordering.Less)
      expect(sortAsc('a', '')).toBe(Ordering.Greater)

      // Zero and negative numbers
      expect(sortAsc(0, 1)).toBe(Ordering.Less)
      expect(sortAsc(-1, 0)).toBe(Ordering.Less)
      expect(sortAsc(-1, -2)).toBe(Ordering.Greater)

      // Special numeric values
      expect(sortAsc(Infinity, 5)).toBe(Ordering.Greater)
      expect(sortAsc(5, Infinity)).toBe(Ordering.Less)
    })

    it('should handle null and undefined values according to JavaScript comparison rules', () => {
      // null is less than any number in JS comparison
      expect(sortAsc(null, 5)).toBe(Ordering.Less)
      expect(sortAsc(5, null)).toBe(Ordering.Greater)

      // undefined compared with numbers
      expect(sortAsc(undefined, 5)).toBe(Ordering.Greater)
      expect(sortAsc(5, undefined)).toBe(Ordering.Greater)

      // null vs undefined
      expect(sortAsc(null, undefined)).toBe(Ordering.Greater) // Actual behavior: null < undefined is false, so it returns 1
      expect(sortAsc(undefined, null)).toBe(Ordering.Greater)
    })
  })

  describe('sortDec', () => {
    it('should return 0 when values are equal', () => {
      expect(sortDec(5, 5)).toBe(Ordering.Equal)
      expect(sortDec('test', 'test')).toBe(Ordering.Equal)
      expect(sortDec(true, true)).toBe(Ordering.Equal)
    })

    it('should return -1 when first value is greater than second', () => {
      expect(sortDec(8, 5)).toBe(Ordering.Less)
      expect(sortDec('xyz', 'def')).toBe(Ordering.Less)
      expect(sortDec(true, false)).toBe(Ordering.Less)
    })

    it('should return 1 when first value is less than second', () => {
      expect(sortDec(3, 5)).toBe(Ordering.Greater)
      expect(sortDec('abc', 'def')).toBe(Ordering.Greater)
      expect(sortDec(false, true)).toBe(Ordering.Greater)
    })

    it('should handle edge cases correctly', () => {
      // Empty strings
      expect(sortDec('', 'a')).toBe(Ordering.Greater)
      expect(sortDec('a', '')).toBe(Ordering.Less)

      // Zero and negative numbers
      expect(sortDec(0, 1)).toBe(Ordering.Greater)
      expect(sortDec(-1, 0)).toBe(Ordering.Greater)
      expect(sortDec(-1, -2)).toBe(Ordering.Less)

      // Special numeric values
      expect(sortDec(Infinity, 5)).toBe(Ordering.Less)
      expect(sortDec(5, Infinity)).toBe(Ordering.Greater)
    })

    it('should handle null and undefined values according to JavaScript comparison rules', () => {
      // null is less than any number in JS comparison, but for descending order it's reversed
      expect(sortDec(null, 5)).toBe(Ordering.Greater)
      expect(sortDec(5, null)).toBe(Ordering.Less)

      // undefined compared with numbers
      expect(sortDec(undefined, 5)).toBe(Ordering.Greater)
      expect(sortDec(5, undefined)).toBe(Ordering.Greater)

      // null vs undefined
      expect(sortDec(null, undefined)).toBe(Ordering.Greater)
      expect(sortDec(undefined, null)).toBe(Ordering.Greater) // Actual behavior: undefined > null is false, so it returns 1
    })
  })

  describe('sort_i_Asc', () => {
    it('should return 0 when i values are equal', () => {
      expect(sort_i_Asc({ i: 5 }, { i: 5 })).toBe(Ordering.Equal)
      expect(sort_i_Asc({ i: 'test' }, { i: 'test' })).toBe(Ordering.Equal)
      expect(sort_i_Asc({ i: true }, { i: true })).toBe(Ordering.Equal)
    })

    it('should return -1 when first i value is less than second', () => {
      expect(sort_i_Asc({ i: 3 }, { i: 5 })).toBe(Ordering.Less)
      expect(sort_i_Asc({ i: 'abc' }, { i: 'def' })).toBe(Ordering.Less)
      expect(sort_i_Asc({ i: false }, { i: true })).toBe(Ordering.Less)
    })

    it('should return 1 when first i value is greater than second', () => {
      expect(sort_i_Asc({ i: 8 }, { i: 5 })).toBe(Ordering.Greater)
      expect(sort_i_Asc({ i: 'xyz' }, { i: 'def' })).toBe(Ordering.Greater)
      expect(sort_i_Asc({ i: true }, { i: false })).toBe(Ordering.Greater)
    })

    it('should handle edge cases correctly', () => {
      // Empty strings
      expect(sort_i_Asc({ i: '' }, { i: 'a' })).toBe(Ordering.Less)
      expect(sort_i_Asc({ i: 'a' }, { i: '' })).toBe(Ordering.Greater)

      // Zero and negative numbers
      expect(sort_i_Asc({ i: 0 }, { i: 1 })).toBe(Ordering.Less)
      expect(sort_i_Asc({ i: -1 }, { i: 0 })).toBe(Ordering.Less)
      expect(sort_i_Asc({ i: -1 }, { i: -2 })).toBe(Ordering.Greater)

      // Special numeric values
      expect(sort_i_Asc({ i: Infinity }, { i: 5 })).toBe(Ordering.Greater)
      expect(sort_i_Asc({ i: 5 }, { i: Infinity })).toBe(Ordering.Less)
    })

    it('should handle null and undefined i values according to JavaScript comparison rules', () => {
      // null is less than any number in JS comparison
      expect(sort_i_Asc({ i: null }, { i: 5 })).toBe(Ordering.Less)
      expect(sort_i_Asc({ i: 5 }, { i: null })).toBe(Ordering.Greater)

      // undefined compared with numbers
      expect(sort_i_Asc({ i: undefined }, { i: 5 })).toBe(Ordering.Greater)
      expect(sort_i_Asc({ i: 5 }, { i: undefined })).toBe(Ordering.Greater)

      // null vs undefined
      expect(sort_i_Asc({ i: null }, { i: undefined })).toBe(Ordering.Greater)
      expect(sort_i_Asc({ i: undefined }, { i: null })).toBe(Ordering.Greater)
    })

    it('should handle missing i property', () => {
      // When i property is missing, it's treated as undefined
      expect(sort_i_Asc({}, { i: 5 })).toBe(Ordering.Greater)
      expect(sort_i_Asc({ i: 5 }, {})).toBe(Ordering.Greater)
      expect(sort_i_Asc({}, {})).toBe(Ordering.Equal)
    })
  })

  describe('sort_id_Asc', () => {
    it('should return 0 when id values are equal', () => {
      expect(sort_id_Asc({ id: 5 }, { id: 5 })).toBe(Ordering.Equal)
      expect(sort_id_Asc({ id: 'test' }, { id: 'test' })).toBe(Ordering.Equal)
      expect(sort_id_Asc({ id: true }, { id: true })).toBe(Ordering.Equal)
    })

    it('should return -1 when first id value is less than second', () => {
      expect(sort_id_Asc({ id: 3 }, { id: 5 })).toBe(Ordering.Less)
      expect(sort_id_Asc({ id: 'abc' }, { id: 'def' })).toBe(Ordering.Less)
      expect(sort_id_Asc({ id: false }, { id: true })).toBe(Ordering.Less)
    })

    it('should return 1 when first id value is greater than second', () => {
      expect(sort_id_Asc({ id: 8 }, { id: 5 })).toBe(Ordering.Greater)
      expect(sort_id_Asc({ id: 'xyz' }, { id: 'def' })).toBe(Ordering.Greater)
      expect(sort_id_Asc({ id: true }, { id: false })).toBe(Ordering.Greater)
    })

    it('should handle edge cases correctly', () => {
      // Empty strings
      expect(sort_id_Asc({ id: '' }, { id: 'a' })).toBe(Ordering.Less)
      expect(sort_id_Asc({ id: 'a' }, { id: '' })).toBe(Ordering.Greater)

      // Zero and negative numbers
      expect(sort_id_Asc({ id: 0 }, { id: 1 })).toBe(Ordering.Less)
      expect(sort_id_Asc({ id: -1 }, { id: 0 })).toBe(Ordering.Less)
      expect(sort_id_Asc({ id: -1 }, { id: -2 })).toBe(Ordering.Greater)

      // Special numeric values
      expect(sort_id_Asc({ id: Infinity }, { id: 5 })).toBe(Ordering.Greater)
      expect(sort_id_Asc({ id: 5 }, { id: Infinity })).toBe(Ordering.Less)
    })

    it('should handle null and undefined id values according to JavaScript comparison rules', () => {
      // null is less than any number in JS comparison
      expect(sort_id_Asc({ id: null }, { id: 5 })).toBe(Ordering.Less)
      expect(sort_id_Asc({ id: 5 }, { id: null })).toBe(Ordering.Greater)

      // undefined compared with numbers
      expect(sort_id_Asc({ id: undefined }, { id: 5 })).toBe(Ordering.Greater)
      expect(sort_id_Asc({ id: 5 }, { id: undefined })).toBe(Ordering.Greater)

      // null vs undefined
      expect(sort_id_Asc({ id: null }, { id: undefined })).toBe(Ordering.Greater)
      expect(sort_id_Asc({ id: undefined }, { id: null })).toBe(Ordering.Greater)
    })

    it('should handle missing id property', () => {
      // When id property is missing, it's treated as undefined
      expect(sort_id_Asc({}, { id: 5 })).toBe(Ordering.Greater)
      expect(sort_id_Asc({ id: 5 }, {})).toBe(Ordering.Greater)
      expect(sort_id_Asc({}, {})).toBe(Ordering.Equal)
    })
  })

  describe('sortHashAsc', () => {
    it('should return 0 when hash values are equal', () => {
      expect(sortHashAsc({ hash: '0x123' }, { hash: '0x123' })).toBe(Ordering.Equal)
      expect(sortHashAsc({ hash: 'test' }, { hash: 'test' })).toBe(Ordering.Equal)
      expect(sortHashAsc({ hash: 123 }, { hash: 123 })).toBe(Ordering.Equal)
    })

    it('should return -1 when first hash value is less than second', () => {
      expect(sortHashAsc({ hash: '0x123' }, { hash: '0x456' })).toBe(Ordering.Less)
      expect(sortHashAsc({ hash: 'abc' }, { hash: 'def' })).toBe(Ordering.Less)
      expect(sortHashAsc({ hash: 100 }, { hash: 200 })).toBe(Ordering.Less)
    })

    it('should return 1 when first hash value is greater than second', () => {
      expect(sortHashAsc({ hash: '0x456' }, { hash: '0x123' })).toBe(Ordering.Greater)
      expect(sortHashAsc({ hash: 'xyz' }, { hash: 'def' })).toBe(Ordering.Greater)
      expect(sortHashAsc({ hash: 200 }, { hash: 100 })).toBe(Ordering.Greater)
    })

    it('should handle edge cases correctly', () => {
      // Empty strings
      expect(sortHashAsc({ hash: '' }, { hash: 'a' })).toBe(Ordering.Less)
      expect(sortHashAsc({ hash: 'a' }, { hash: '' })).toBe(Ordering.Greater)

      // Zero and negative numbers
      expect(sortHashAsc({ hash: 0 }, { hash: 1 })).toBe(Ordering.Less)
      expect(sortHashAsc({ hash: -1 }, { hash: 0 })).toBe(Ordering.Less)
      expect(sortHashAsc({ hash: -1 }, { hash: -2 })).toBe(Ordering.Greater)
    })

    it('should handle null and undefined hash values according to JavaScript comparison rules', () => {
      // null is less than any number in JS comparison
      expect(sortHashAsc({ hash: null }, { hash: '0x123' })).toBe(Ordering.Less)
      expect(sortHashAsc({ hash: '0x123' }, { hash: null })).toBe(Ordering.Greater)

      // undefined compared with strings
      expect(sortHashAsc({ hash: undefined }, { hash: '0x123' })).toBe(Ordering.Greater)
      expect(sortHashAsc({ hash: '0x123' }, { hash: undefined })).toBe(Ordering.Greater)

      // null vs undefined
      expect(sortHashAsc({ hash: null }, { hash: undefined })).toBe(Ordering.Greater)
      expect(sortHashAsc({ hash: undefined }, { hash: null })).toBe(Ordering.Greater)
    })

    it('should handle missing hash property', () => {
      // When hash property is missing, it's treated as undefined
      expect(sortHashAsc({}, { hash: '0x123' })).toBe(Ordering.Greater)
      expect(sortHashAsc({ hash: '0x123' }, {})).toBe(Ordering.Greater)
      expect(sortHashAsc({}, {})).toBe(Ordering.Equal)
    })
  })

  describe('sortTimestampAsc', () => {
    it('should return 0 when timestamp values are equal', () => {
      expect(sortTimestampAsc({ timestamp: 1625097600000 }, { timestamp: 1625097600000 })).toBe(Ordering.Equal)
      expect(sortTimestampAsc({ timestamp: '2021-07-01' }, { timestamp: '2021-07-01' })).toBe(Ordering.Equal)
      expect(sortTimestampAsc({ timestamp: 0 }, { timestamp: 0 })).toBe(Ordering.Equal)
    })

    it('should return -1 when first timestamp value is less than second', () => {
      expect(sortTimestampAsc({ timestamp: 1625097600000 }, { timestamp: 1625184000000 })).toBe(Ordering.Less)
      expect(sortTimestampAsc({ timestamp: '2021-07-01' }, { timestamp: '2021-07-02' })).toBe(Ordering.Less)
      expect(sortTimestampAsc({ timestamp: 0 }, { timestamp: 1 })).toBe(Ordering.Less)
    })

    it('should return 1 when first timestamp value is greater than second', () => {
      expect(sortTimestampAsc({ timestamp: 1625184000000 }, { timestamp: 1625097600000 })).toBe(Ordering.Greater)
      expect(sortTimestampAsc({ timestamp: '2021-07-02' }, { timestamp: '2021-07-01' })).toBe(Ordering.Greater)
      expect(sortTimestampAsc({ timestamp: 1 }, { timestamp: 0 })).toBe(Ordering.Greater)
    })

    it('should handle edge cases correctly', () => {
      // Zero and negative timestamps
      expect(sortTimestampAsc({ timestamp: 0 }, { timestamp: 1 })).toBe(Ordering.Less)
      expect(sortTimestampAsc({ timestamp: -1 }, { timestamp: 0 })).toBe(Ordering.Less)
      expect(sortTimestampAsc({ timestamp: -1 }, { timestamp: -2 })).toBe(Ordering.Greater)

      // Special numeric values
      expect(sortTimestampAsc({ timestamp: Infinity }, { timestamp: 1625097600000 })).toBe(Ordering.Greater)
      expect(sortTimestampAsc({ timestamp: 1625097600000 }, { timestamp: Infinity })).toBe(Ordering.Less)
    })

    it('should handle null and undefined timestamp values according to JavaScript comparison rules', () => {
      // null is less than any number in JS comparison
      expect(sortTimestampAsc({ timestamp: null }, { timestamp: 1625097600000 })).toBe(Ordering.Less)
      expect(sortTimestampAsc({ timestamp: 1625097600000 }, { timestamp: null })).toBe(Ordering.Greater)

      // undefined compared with numbers
      expect(sortTimestampAsc({ timestamp: undefined }, { timestamp: 1625097600000 })).toBe(Ordering.Greater)
      expect(sortTimestampAsc({ timestamp: 1625097600000 }, { timestamp: undefined })).toBe(Ordering.Greater)

      // null vs undefined
      expect(sortTimestampAsc({ timestamp: null }, { timestamp: undefined })).toBe(Ordering.Greater)
      expect(sortTimestampAsc({ timestamp: undefined }, { timestamp: null })).toBe(Ordering.Greater)
    })

    it('should handle missing timestamp property', () => {
      // When timestamp property is missing, it's treated as undefined
      expect(sortTimestampAsc({}, { timestamp: 1625097600000 })).toBe(Ordering.Greater)
      expect(sortTimestampAsc({ timestamp: 1625097600000 }, {})).toBe(Ordering.Greater)
      expect(sortTimestampAsc({}, {})).toBe(Ordering.Equal)
    })
  })

  describe('sortAscProp', () => {
    it('should return 0 when property values are equal', () => {
      expect(sortAscProp({ name: 'test' }, { name: 'test' }, 'name')).toBe(Ordering.Equal)
      expect(sortAscProp({ age: 30 }, { age: 30 }, 'age')).toBe(Ordering.Equal)
      expect(sortAscProp({ active: true }, { active: true }, 'active')).toBe(Ordering.Equal)
    })

    it('should return -1 when first property value is less than second', () => {
      expect(sortAscProp({ name: 'abc' }, { name: 'def' }, 'name')).toBe(Ordering.Less)
      expect(sortAscProp({ age: 25 }, { age: 30 }, 'age')).toBe(Ordering.Less)
      expect(sortAscProp({ active: false }, { active: true }, 'active')).toBe(Ordering.Less)
    })

    it('should return 1 when first property value is greater than second', () => {
      expect(sortAscProp({ name: 'xyz' }, { name: 'def' }, 'name')).toBe(Ordering.Greater)
      expect(sortAscProp({ age: 35 }, { age: 30 }, 'age')).toBe(Ordering.Greater)
      expect(sortAscProp({ active: true }, { active: false }, 'active')).toBe(Ordering.Greater)
    })

    it('should handle edge cases correctly', () => {
      // Empty strings
      expect(sortAscProp({ name: '' }, { name: 'a' }, 'name')).toBe(Ordering.Less)
      expect(sortAscProp({ name: 'a' }, { name: '' }, 'name')).toBe(Ordering.Greater)

      // Zero and negative numbers
      expect(sortAscProp({ value: 0 }, { value: 1 }, 'value')).toBe(Ordering.Less)
      expect(sortAscProp({ value: -1 }, { value: 0 }, 'value')).toBe(Ordering.Less)
      expect(sortAscProp({ value: -1 }, { value: -2 }, 'value')).toBe(Ordering.Greater)

      // Special numeric values
      expect(sortAscProp({ value: Infinity }, { value: 5 }, 'value')).toBe(Ordering.Greater)
      expect(sortAscProp({ value: 5 }, { value: Infinity }, 'value')).toBe(Ordering.Less)
    })

    it('should handle null and undefined property values according to JavaScript comparison rules', () => {
      // null is less than any number in JS comparison
      expect(sortAscProp({ value: null }, { value: 5 }, 'value')).toBe(Ordering.Less)
      expect(sortAscProp({ value: 5 }, { value: null }, 'value')).toBe(Ordering.Greater)

      // undefined compared with numbers
      expect(sortAscProp({ value: undefined }, { value: 5 }, 'value')).toBe(Ordering.Greater)
      expect(sortAscProp({ value: 5 }, { value: undefined }, 'value')).toBe(Ordering.Greater)

      // null vs undefined
      expect(sortAscProp({ value: null }, { value: undefined }, 'value')).toBe(Ordering.Greater)
      expect(sortAscProp({ value: undefined }, { value: null }, 'value')).toBe(Ordering.Greater)
    })

    it('should handle missing property', () => {
      // When property is missing, it's treated as undefined
      expect(sortAscProp({}, { value: 5 }, 'value')).toBe(Ordering.Greater)
      expect(sortAscProp({ value: 5 }, {}, 'value')).toBe(Ordering.Greater)
      expect(sortAscProp({}, {}, 'value')).toBe(Ordering.Equal)
    })

    it('should work with different property names', () => {
      const obj1 = { name: 'Alice', age: 30, active: true }
      const obj2 = { name: 'Bob', age: 25, active: false }

      expect(sortAscProp(obj1, obj2, 'name')).toBe(Ordering.Less) // 'Alice' < 'Bob'
      expect(sortAscProp(obj1, obj2, 'age')).toBe(Ordering.Greater) // 30 > 25
      expect(sortAscProp(obj1, obj2, 'active')).toBe(Ordering.Greater) // true > false
    })
  })

  describe('sortDecProp', () => {
    it('should return 0 when property values are equal', () => {
      expect(sortDecProp({ name: 'test' }, { name: 'test' }, 'name')).toBe(Ordering.Equal)
      expect(sortDecProp({ age: 30 }, { age: 30 }, 'age')).toBe(Ordering.Equal)
      expect(sortDecProp({ active: true }, { active: true }, 'active')).toBe(Ordering.Equal)
    })

    it('should return -1 when first property value is greater than second', () => {
      expect(sortDecProp({ name: 'xyz' }, { name: 'def' }, 'name')).toBe(Ordering.Less)
      expect(sortDecProp({ age: 35 }, { age: 30 }, 'age')).toBe(Ordering.Less)
      expect(sortDecProp({ active: true }, { active: false }, 'active')).toBe(Ordering.Less)
    })

    it('should return 1 when first property value is less than second', () => {
      expect(sortDecProp({ name: 'abc' }, { name: 'def' }, 'name')).toBe(Ordering.Greater)
      expect(sortDecProp({ age: 25 }, { age: 30 }, 'age')).toBe(Ordering.Greater)
      expect(sortDecProp({ active: false }, { active: true }, 'active')).toBe(Ordering.Greater)
    })

    it('should handle edge cases correctly', () => {
      // Empty strings
      expect(sortDecProp({ name: '' }, { name: 'a' }, 'name')).toBe(Ordering.Greater)
      expect(sortDecProp({ name: 'a' }, { name: '' }, 'name')).toBe(Ordering.Less)

      // Zero and negative numbers
      expect(sortDecProp({ value: 0 }, { value: 1 }, 'value')).toBe(Ordering.Greater)
      expect(sortDecProp({ value: -1 }, { value: 0 }, 'value')).toBe(Ordering.Greater)
      expect(sortDecProp({ value: -1 }, { value: -2 }, 'value')).toBe(Ordering.Less)

      // Special numeric values
      expect(sortDecProp({ value: Infinity }, { value: 5 }, 'value')).toBe(Ordering.Less)
      expect(sortDecProp({ value: 5 }, { value: Infinity }, 'value')).toBe(Ordering.Greater)
    })

    it('should handle null and undefined property values according to JavaScript comparison rules', () => {
      // null is less than any number in JS comparison, but for descending order it's reversed
      expect(sortDecProp({ value: null }, { value: 5 }, 'value')).toBe(Ordering.Greater)
      expect(sortDecProp({ value: 5 }, { value: null }, 'value')).toBe(Ordering.Less)

      // undefined compared with numbers
      expect(sortDecProp({ value: undefined }, { value: 5 }, 'value')).toBe(Ordering.Greater)
      expect(sortDecProp({ value: 5 }, { value: undefined }, 'value')).toBe(Ordering.Greater)

      // null vs undefined
      expect(sortDecProp({ value: null }, { value: undefined }, 'value')).toBe(Ordering.Greater)
      expect(sortDecProp({ value: undefined }, { value: null }, 'value')).toBe(Ordering.Greater)
    })

    it('should handle missing property', () => {
      // When property is missing, it's treated as undefined
      expect(sortDecProp({}, { value: 5 }, 'value')).toBe(Ordering.Greater)
      expect(sortDecProp({ value: 5 }, {}, 'value')).toBe(Ordering.Greater)
      expect(sortDecProp({}, {}, 'value')).toBe(Ordering.Equal)
    })

    it('should work with different property names', () => {
      const obj1 = { name: 'Alice', age: 30, active: true }
      const obj2 = { name: 'Bob', age: 25, active: false }

      expect(sortDecProp(obj1, obj2, 'name')).toBe(Ordering.Greater) // 'Alice' < 'Bob', but descending
      expect(sortDecProp(obj1, obj2, 'age')).toBe(Ordering.Less) // 30 > 25, so descending is -1
      expect(sortDecProp(obj1, obj2, 'active')).toBe(Ordering.Less) // true > false, so descending is -1
    })
  })
})
