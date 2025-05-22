import { describe, test, expect, beforeEach } from '@jest/globals'
import { computeStandbyCheckerIndexes, shouldCheckStandbyNode } from '../../../../src/p2p/StandbyChecker'
import * as NodeList from '../../../../src/p2p/NodeList'
import * as Context from '../../../../src/p2p/Context'

beforeEach(() => {
  // setup a simple active list of five nodes
  ;(NodeList as any).activeByIdOrder = Array.from({ length: 5 }, (_, i) => ({ id: `n${i}` }))
  ;(Context as any).config = { p2p: { numCheckerNodes: 1 } }
})

describe('StandbyChecker', () => {
  test('deterministic selection of checker nodes', () => {
    const standbyPK = 'a'.repeat(64)
    const indexes = computeStandbyCheckerIndexes(standbyPK)
    expect(indexes.length).toBe(1)
    for (let i = 0; i < NodeList.activeByIdOrder.length; i++) {
      const should = shouldCheckStandbyNode(standbyPK, i)
      expect(should).toBe(indexes.includes(i))
    }
  })
})
