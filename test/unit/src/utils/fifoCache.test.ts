import { FIFOCache } from '../../../../src/utils/fifoCache'

describe('FIFOCache', () => {
  let cache: FIFOCache<string, number>

  beforeEach(() => {
    // Create a new cache with a capacity of 3 before each test
    cache = new FIFOCache<string, number>(3)
  })

  test('Should create a cache with the specified capacity', () => {
    expect(cache.size()).toBe(0)
  })

  test('Should add items to the cache', () => {
    cache.set('key1', 1)
    expect(cache.size()).toBe(1)
    expect(cache.get('key1')).toBe(1)
  })

  test('Should respect cache capacity by removing oldest item', () => {
    // Fill the cache to capacity
    cache.set('key1', 1)
    cache.set('key2', 2)
    cache.set('key3', 3)

    // Add a fourth item, which should remove the first item
    cache.set('key4', 4)

    expect(cache.size()).toBe(3)
    expect(cache.get('key1')).toBeUndefined() // First item should be removed
    expect(cache.get('key2')).toBe(2)
    expect(cache.get('key3')).toBe(3)
    expect(cache.get('key4')).toBe(4)
  })

  test('Should retrieve existing items', () => {
    cache.set('key1', 10)
    cache.set('key2', 20)

    expect(cache.get('key1')).toBe(10)
    expect(cache.get('key2')).toBe(20)
    expect(cache.get('nonexistent')).toBeUndefined()
  })

  test('Should delete items from the cache', () => {
    cache.set('key1', 1)
    cache.set('key2', 2)

    expect(cache.delete('key1')).toBe(true)
    expect(cache.size()).toBe(1)
    expect(cache.get('key1')).toBeUndefined()

    // Deleting a non-existent key should return false
    expect(cache.delete('nonexistent')).toBe(false)
  })

  test('Should clear the entire cache', () => {
    cache.set('key1', 1)
    cache.set('key2', 2)
    cache.set('key3', 3)

    cache.clear()

    expect(cache.size()).toBe(0)
    expect(cache.get('key1')).toBeUndefined()
    expect(cache.get('key2')).toBeUndefined()
    expect(cache.get('key3')).toBeUndefined()
  })

  test('Should allow iteration through entries', () => {
    cache.set('key1', 1)
    cache.set('key2', 2)
    cache.set('key3', 3)

    const entries = Array.from(cache.entries())

    expect(entries).toHaveLength(3)
    expect(entries).toEqual([
      ['key1', 1],
      ['key2', 2],
      ['key3', 3],
    ])
  })

  test('Should handle multiple sets of the same key', () => {
    cache.set('key1', 1)
    cache.set('key1', 10) // Overwrite existing value

    expect(cache.size()).toBe(1)
    expect(cache.get('key1')).toBe(10)
  })

  test('Should work with different types', () => {
    const stringCache = new FIFOCache<string, string>(2)
    stringCache.set('name', 'John')
    stringCache.set('city', 'New York')

    expect(stringCache.get('name')).toBe('John')

    const numberCache = new FIFOCache<number, boolean>(2)
    numberCache.set(1, true)
    numberCache.set(2, false)

    expect(numberCache.get(1)).toBe(true)
  })
})
