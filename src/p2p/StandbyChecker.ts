import { fastIsPicked, getIndexesPicked, getPrefixInt } from '../utils'
import * as NodeList from './NodeList'
import { getOurNodeIndex } from './Utils'
import { config } from './Context'

export function computeStandbyCheckerIndexes(
  publicKey: string,
  activeCount = NodeList.activeByIdOrder.length,
  numCheckers = config.p2p.numCheckerNodes
): number[] {
  const offset = getPrefixInt(publicKey, 8)
  return getIndexesPicked(activeCount, numCheckers, offset)
}

export function shouldCheckStandbyNode(publicKey: string, ourIndex: number | null = getOurNodeIndex()): boolean {
  if (ourIndex == null) return false
  const offset = getPrefixInt(publicKey, 8)
  return fastIsPicked(ourIndex, NodeList.activeByIdOrder.length, config.p2p.numCheckerNodes, offset)
}
