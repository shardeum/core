import {
  getLinearSeededGossip,
  getLinearGossipBurstList,
  getLinearGossipList,
  getRandomGossipIn,
} from '../../../../../src/utils/functions/gossip'

// Mock the mod function
jest.mock('../../../../../src/utils', () => ({
  mod: (a: number, b: number) => ((a % b) + b) % b,
}))

describe('gossip functions', () => {
  describe('getLinearSeededGossip', () => {
    it('should return array of node indices', () => {
      const result = getLinearSeededGossip([0, 1, 2, 3], 1, 2, 0, 0)
      expect(Array.isArray(result)).toBe(true)
      expect(result).not.toContain(1) // should not contain myIdx
    })

    it('should handle single node', () => {
      const result = getLinearSeededGossip([0], 0, 0, 0, 0)
      expect(result).toEqual([])
    })
  })

  describe('getLinearGossipBurstList', () => {
    it('should return array of node indices', () => {
      const result = getLinearGossipBurstList(5, 2, 1, 0)
      expect(Array.isArray(result)).toBe(true)
      expect(result).not.toContain(1) // should not contain myIdx
    })

    it('should limit gossipFactor when too large', () => {
      const result = getLinearGossipBurstList(3, 10, 1, 0)
      expect(result.length).toBeLessThanOrEqual(2)
    })
  })

  describe('getLinearGossipList', () => {
    it('should return array of node indices', () => {
      const result = getLinearGossipList(5, 2, 1, false)
      expect(Array.isArray(result)).toBe(true)
      expect(result).not.toContain(1) // should not contain myIdx
    })

    it('should return larger list when isOrigin is true', () => {
      const nonOrigin = getLinearGossipList(8, 2, 1, false)
      const origin = getLinearGossipList(8, 2, 1, true)
      expect(origin.length).toBeGreaterThanOrEqual(nonOrigin.length)
    })
  })

  describe('getRandomGossipIn', () => {
    it('should return array of node indices', () => {
      const result = getRandomGossipIn([0, 1, 2, 3], 2, 1)
      expect(Array.isArray(result)).toBe(true)
      expect(result).not.toContain(1) // should not contain myIdx
    })

    it('should return empty array when fanOut is 0', () => {
      const result = getRandomGossipIn([0, 1, 2, 3], 0, 1)
      expect(result).toEqual([])
    })

    it('should limit result size to available nodes', () => {
      const result = getRandomGossipIn([0, 1, 2], 10, 1)
      expect(result.length).toBeLessThanOrEqual(2) // excluding myIdx
    })
  })
})
