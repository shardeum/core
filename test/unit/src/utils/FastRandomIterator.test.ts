import FastRandomIterator from '../../../../src/utils/FastRandomIterator'

describe('FastRandomIterator', () => {
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockRestore()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with sparse mode when par > 0 and arraySize/par > 100', () => {
      const iterator = new FastRandomIterator(1000, 5)
      expect(iterator.debugGetMode()).toBe('sparse')
      expect(iterator.arraySize).toBe(1000)
      expect(iterator.iteratorIndex).toBe(0)
    })

    it('should initialize with fastSimple mode for small arrays', () => {
      const iterator = new FastRandomIterator(50)
      expect(iterator.debugGetMode()).toBe('fastSimple')
      expect(iterator.indexList).toHaveLength(50)
      expect(iterator.arraySize).toBe(50)
    })

    it('should initialize with fastSimple mode when par forces simple mode', () => {
      const iterator = new FastRandomIterator(1000, 150)
      expect(iterator.debugGetMode()).toBe('fastSimple')
      expect(iterator.indexList).toHaveLength(1000)
    })

    it('should initialize with fast mode for large arrays', () => {
      const iterator = new FastRandomIterator(1000)
      expect(iterator.debugGetMode()).toBe('fast')
      expect(iterator.strideSize).toBeGreaterThan(0)
      expect(iterator.indexStrides).toBeDefined()
    })

    it('should handle custom stride size', () => {
      const iterator = new FastRandomIterator(1000, -1, 50)
      expect(iterator.debugGetMode()).toBe('fast')
      expect(iterator.strideSize).toBe(50)
    })

    it('should enforce minimum stride size', () => {
      const iterator = new FastRandomIterator(1000, -1, 5)
      expect(iterator.strideSize).toBe(10)
    })

    it('should enforce maximum stride size', () => {
      const iterator = new FastRandomIterator(1000, -1, 150)
      expect(iterator.strideSize).toBe(100)
    })

    it('should calculate default stride size', () => {
      const iterator = new FastRandomIterator(1000)
      expect(iterator.strideSize).toBe(10)
    })

    it('should handle edge case where stride size exceeds array size', () => {
      const iterator = new FastRandomIterator(50, -1, 100)
      expect(iterator.debugGetMode()).toBe('fastSimple')
    })
  })

  describe('debugGetMode', () => {
    it('should return "sparse" for sparse mode', () => {
      const iterator = new FastRandomIterator(1000, 5)
      expect(iterator.debugGetMode()).toBe('sparse')
    })

    it('should return "fastSimple" for simple mode', () => {
      const iterator = new FastRandomIterator(50)
      expect(iterator.debugGetMode()).toBe('fastSimple')
    })

    it('should return "fast" for stride mode', () => {
      const iterator = new FastRandomIterator(1000)
      expect(iterator.debugGetMode()).toBe('fast')
    })
  })

  describe('debugForceSparse', () => {
    it('should force sparse mode', () => {
      const iterator = new FastRandomIterator(1000)
      expect(iterator.debugGetMode()).toBe('fast')
      iterator.debugForceSparse()
      expect(iterator.debugGetMode()).toBe('sparse')
    })
  })

  describe('getNextIndex - sparse mode', () => {
    let iterator: FastRandomIterator

    beforeEach(() => {
      iterator = new FastRandomIterator(1000, 5)
      expect(iterator.debugGetMode()).toBe('sparse')
    })

    it('should return random indices without repetition', () => {
      jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.1)
        .mockReturnValueOnce(0.5)
        .mockReturnValueOnce(0.9)

      const index1 = iterator.getNextIndex()
      const index2 = iterator.getNextIndex()
      const index3 = iterator.getNextIndex()

      expect(index1).toBe(100)
      expect(index2).toBe(500)
      expect(index3).toBe(900)
      expect(iterator.iteratorIndex).toBe(3)
    })

    it('should handle collision and retry', () => {
      jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.1)
        .mockReturnValueOnce(0.1)
        .mockReturnValueOnce(0.2)

      const index1 = iterator.getNextIndex()
      const index2 = iterator.getNextIndex()

      expect(index1).toBe(100)
      expect(index2).toBe(200)
    })

    it('should return -1 when all indices are exhausted', () => {
      iterator.iteratorIndex = 1000
      expect(iterator.getNextIndex()).toBe(-1)
    })
  })

  describe('getNextIndex - fastSimple mode', () => {
    let iterator: FastRandomIterator

    beforeEach(() => {
      iterator = new FastRandomIterator(10)
      expect(iterator.debugGetMode()).toBe('fastSimple')
    })

    it('should return indices and swap correctly', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5)

      const index1 = iterator.getNextIndex()
      expect(index1).toBeGreaterThanOrEqual(0)
      expect(index1).toBeLessThan(10)
      expect(iterator.iteratorIndex).toBe(1)
    })

    it('should shuffle remaining indices', () => {
      const indices = []
      for (let i = 0; i < 10; i++) {
        indices.push(iterator.getNextIndex())
      }

      expect(indices).toHaveLength(10)
      expect(new Set(indices)).toHaveProperty('size', 10)
      expect(indices.every(i => i >= 0 && i < 10)).toBe(true)
    })

    it('should return -1 when exhausted', () => {
      for (let i = 0; i < 10; i++) {
        iterator.getNextIndex()
      }
      expect(iterator.getNextIndex()).toBe(-1)
    })
  })

  describe('getNextIndex - fast mode', () => {
    let iterator: FastRandomIterator

    beforeEach(() => {
      iterator = new FastRandomIterator(1000)
      expect(iterator.debugGetMode()).toBe('fast')
    })

    it('should return indices using stride algorithm', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5)

      const index = iterator.getNextIndex()
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(1000)
      expect(iterator.iteratorIndex).toBe(1)
    })

    it('should create strides lazily', () => {
      expect(iterator.indexStrides[0]).toBe(false)
      
      iterator.getNextIndex()
      
      expect(Array.isArray(iterator.indexStrides[0])).toBe(true)
    })

    it('should handle cross-stride fetching', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.9)

      const index = iterator.getNextIndex()
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(1000)
    })

    it('should return all indices without repetition', () => {
      const indices = new Set()
      let index = iterator.getNextIndex()
      let count = 0

      while (index !== -1 && count < 100) {
        expect(indices.has(index)).toBe(false)
        indices.add(index)
        index = iterator.getNextIndex()
        count++
      }

      expect(indices.size).toBe(count)
    })
  })

  describe('edge cases', () => {
    it('should handle array size of 1', () => {
      const iterator = new FastRandomIterator(1)
      expect(iterator.debugGetMode()).toBe('fastSimple')
      expect(iterator.getNextIndex()).toBe(0)
      expect(iterator.getNextIndex()).toBe(-1)
    })

    it('should handle array size of 0', () => {
      const iterator = new FastRandomIterator(0)
      expect(iterator.getNextIndex()).toBe(-1)
    })

    it('should handle negative array size gracefully', () => {
      expect(() => new FastRandomIterator(-10)).toThrow('Invalid array length')
    })

    it('should handle par = 0', () => {
      const iterator = new FastRandomIterator(1000, 0)
      expect(iterator.debugGetMode()).toBe('fast')
    })

    it('should handle negative par', () => {
      const iterator = new FastRandomIterator(1000, -5)
      expect(iterator.debugGetMode()).toBe('fast')
    })
  })

  describe('state consistency', () => {
    it('should maintain correct iterator index', () => {
      const iterator = new FastRandomIterator(100)
      expect(iterator.iteratorIndex).toBe(0)

      for (let i = 0; i < 10; i++) {
        iterator.getNextIndex()
        expect(iterator.iteratorIndex).toBe(i + 1)
      }
    })

    it('should maintain array size', () => {
      const iterator = new FastRandomIterator(500)
      expect(iterator.arraySize).toBe(500)

      iterator.getNextIndex()
      iterator.getNextIndex()

      expect(iterator.arraySize).toBe(500)
    })
  })

  describe('randomness distribution', () => {
    it('should distribute indices across the range in fastSimple mode', () => {
      const iterator = new FastRandomIterator(100)
      const indices = []

      for (let i = 0; i < 50; i++) {
        const index = iterator.getNextIndex()
        if (index !== -1) indices.push(index)
      }

      const uniqueIndices = new Set(indices)
      expect(uniqueIndices.size).toBe(indices.length)
      expect(indices.every(i => i >= 0 && i < 100)).toBe(true)
    })
  })
})