import { reversed, randomShifted, shuffleMapIterator } from '../../../../../src/utils/functions/iterables'

describe('iterables', () => {
  describe('reversed', () => {
    test('should reverse an array', () => {
      const input = [1, 2, 3, 4, 5]
      const result = Array.from(reversed(input))
      expect(result).toEqual([5, 4, 3, 2, 1])
    })

    test('should handle empty array', () => {
      const input: number[] = []
      const result = Array.from(reversed(input))
      expect(result).toEqual([])
    })

    test('should handle single element array', () => {
      const input = ['only']
      const result = Array.from(reversed(input))
      expect(result).toEqual(['only'])
    })

    test('should reverse a Set', () => {
      const input = new Set([1, 2, 3])
      const result = Array.from(reversed(input))
      expect(result).toEqual([3, 2, 1])
    })

    test('should reverse a string iterable', () => {
      const input = 'hello'
      const result = Array.from(reversed(input))
      expect(result).toEqual(['o', 'l', 'l', 'e', 'h'])
    })

    test('should not modify original array', () => {
      const input = [1, 2, 3]
      const originalInput = [...input]
      Array.from(reversed(input))
      expect(input).toEqual(originalInput)
    })

    test('should handle iterator protocol correctly', () => {
      const input = [1, 2, 3]
      const iter = reversed(input)[Symbol.iterator]()

      expect(iter.next()).toEqual({ value: 3, done: false })
      expect(iter.next()).toEqual({ value: 2, done: false })
      expect(iter.next()).toEqual({ value: 1, done: false })
      expect(iter.next()).toEqual({ value: undefined, done: true })
    })

    test('should work with for...of loop', () => {
      const input = ['a', 'b', 'c']
      const result: string[] = []

      for (const item of reversed(input)) {
        result.push(item)
      }

      expect(result).toEqual(['c', 'b', 'a'])
    })

    test('should handle Map values', () => {
      const map = new Map([
        ['key1', 'value1'],
        ['key2', 'value2'],
      ])
      const result = Array.from(reversed(map.values()))
      expect(result).toEqual(['value2', 'value1'])
    })
  })

  describe('randomShifted', () => {
    test('should return all elements from array', () => {
      const input = [1, 2, 3, 4, 5]
      const result = Array.from(randomShifted(input))
      expect(result.sort()).toEqual([1, 2, 3, 4, 5])
    })

    test('should handle empty array', () => {
      const input: number[] = []
      const result = Array.from(randomShifted(input))
      expect(result).toEqual([])
    })

    test('should handle single element array', () => {
      const input = ['only']
      const result = Array.from(randomShifted(input))
      expect(result).toEqual(['only'])
    })

    test('should work with Set', () => {
      const input = new Set([1, 2, 3])
      const result = Array.from(randomShifted(input))
      expect(result.sort()).toEqual([1, 2, 3])
    })

    test('should not modify original array', () => {
      const input = [1, 2, 3]
      const originalInput = [...input]
      Array.from(randomShifted(input))
      expect(input).toEqual(originalInput)
    })

    test('should handle iterator protocol correctly', () => {
      const input = [1, 2]
      const iter = randomShifted(input)[Symbol.iterator]()

      const first = iter.next()
      const second = iter.next()
      const third = iter.next()

      expect([first.value, second.value].sort()).toEqual([1, 2])
      expect(third.done).toBe(true)
    })

    test('should work with for...of loop', () => {
      const input = ['a', 'b', 'c']
      const result: string[] = []

      for (const item of randomShifted(input)) {
        result.push(item)
      }

      expect(result.sort()).toEqual(['a', 'b', 'c'])
    })

    test('should handle string iterable', () => {
      const input = 'abc'
      const result = Array.from(randomShifted(input))
      expect(result.sort()).toEqual(['a', 'b', 'c'])
    })

    test('should handle large arrays', () => {
      const input = Array.from({ length: 1000 }, (_, i) => i)
      const result = Array.from(randomShifted(input))
      expect(result.length).toBe(1000)
      expect(result.sort((a, b) => a - b)).toEqual(input)
    })
  })

  describe('shuffleMapIterator', () => {
    test('should yield all values from map', () => {
      const map = new Map([
        ['key1', 'value1'],
        ['key2', 'value2'],
        ['key3', 'value3'],
      ])

      const result = Array.from(shuffleMapIterator(map))
      expect(result.sort()).toEqual(['value1', 'value2', 'value3'])
    })

    test('should handle empty map', () => {
      const map = new Map<string, string>()
      const result = Array.from(shuffleMapIterator(map))
      expect(result).toEqual([])
    })

    test('should handle single entry map', () => {
      const map = new Map([['key1', 'value1']])
      const result = Array.from(shuffleMapIterator(map))
      expect(result).toEqual(['value1'])
    })

    test('should not modify original map', () => {
      const map = new Map([
        ['key1', 'value1'],
        ['key2', 'value2'],
      ])
      const originalSize = map.size
      const originalValues = Array.from(map.values()).sort()

      Array.from(shuffleMapIterator(map))

      expect(map.size).toBe(originalSize)
      expect(Array.from(map.values()).sort()).toEqual(originalValues)
    })

    test('should work with different value types', () => {
      const map = new Map<number, any>([
        [1, 'string'],
        [2, 123],
        [3, { obj: 'value' }],
        [4, [1, 2, 3]],
      ])

      const result = Array.from(shuffleMapIterator(map))
      expect(result.length).toBe(4)
      expect(result).toContain('string')
      expect(result).toContain(123)
      expect(result).toContainEqual({ obj: 'value' })
      expect(result).toContainEqual([1, 2, 3])
    })

    test('should be a generator function', () => {
      const map = new Map([['key1', 'value1']])
      const iterator = shuffleMapIterator(map)

      expect(typeof iterator.next).toBe('function')
      expect(typeof iterator[Symbol.iterator]).toBe('function')
    })

    test('should work with for...of loop', () => {
      const map = new Map([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ])

      const result: number[] = []
      for (const value of shuffleMapIterator(map)) {
        result.push(value)
      }

      expect(result.sort()).toEqual([1, 2, 3])
    })

    test('should handle undefined values in map', () => {
      const map = new Map([
        ['key1', undefined],
        ['key2', 'value2'],
        ['key3', null],
      ])

      const result = Array.from(shuffleMapIterator(map))
      expect(result.length).toBe(3)
      expect(result).toContain(undefined)
      expect(result).toContain('value2')
      expect(result).toContain(null)
    })

    test('should produce different orders on multiple calls', () => {
      const map = new Map([
        ['key1', 1],
        ['key2', 2],
        ['key3', 3],
        ['key4', 4],
        ['key5', 5],
      ])

      const results = []
      for (let i = 0; i < 5; i++) {
        results.push(Array.from(shuffleMapIterator(map)).join(''))
      }

      const uniqueResults = new Set(results)
      expect(uniqueResults.size).toBeGreaterThan(1)
    })

    test('should handle Map with complex keys', () => {
      const complexKey1 = { id: 1 }
      const complexKey2 = { id: 2 }
      const map = new Map([
        [complexKey1, 'value1'],
        [complexKey2, 'value2'],
      ])

      const result = Array.from(shuffleMapIterator(map))
      expect(result.sort()).toEqual(['value1', 'value2'])
    })

    test('should handle large maps efficiently', () => {
      const map = new Map()
      for (let i = 0; i < 1000; i++) {
        map.set(`key${i}`, `value${i}`)
      }

      const start = Date.now()
      const result = Array.from(shuffleMapIterator(map))
      const end = Date.now()

      expect(result.length).toBe(1000)
      expect(end - start).toBeLessThan(100)
    })
  })
})
