/**
 * This module contains the logic for selecting the nodes that will be allowed
 * to join the network.
 */

import { crypto, shardus } from '../../Context'
import * as Self from '../../Self'
import * as CycleChain from '../../CycleChain'
import * as NodeList from '../../NodeList'
import * as http from '../../../http'
import { getStandbyNodesInfoMap } from '.'
import { calculateToAcceptV2 } from '../../ModeSystemFuncs'
import { fastIsPicked, selectIndexesWithOffeset } from '../../../utils'
import { getOurNodeIndex, getOurNodeIndexFromSyncingList } from '../../Utils'
import { nestedCountersInstance } from '../../../utils/nestedCounters'
import { logFlags } from '../../../logger'

const selectedPublicKeys: Set<string> = new Set()

/** The number of nodes that will try to contact a single joining node about its selection. */
const NUM_NOTIFYING_NODES = 5

/**
 * Decides how many nodes to accept into the network, then selects nodes that
 * will be allowed to join. If this node isn't active yet, selection will be
 * skipped.
 */
export function executeNodeSelection(): void {
  // Only if the node is active or if the network is in restart mode
  if (Self.isActive || (!Self.isActive && Self.isRestartNetwork)) {
    const { add } = calculateToAcceptV2(CycleChain.newest)
    /* prettier-ignore */ if (logFlags.p2pNonFatal && logFlags.console) console.log(`selecting ${add} nodes to accept`)
    selectNodes(add)
  } else {
    /* prettier-ignore */ if (logFlags.p2pNonFatal && logFlags.console) console.warn('not selecting nodes because we are not active yet')
    return
  }
}

/**
 * Selects the nodes to be allowed to join.
 * Iterates through all standby nodes and pick the best ones by their scores
 * (`selectionNum`)
 *
 * @returns The list of public keys of the nodes that have been selected.
 */
export function selectNodes(maxAllowed: number): void {
  const standbyNodesInfo = getStandbyNodesInfoMap()
  /* prettier-ignore */ if (logFlags.p2pNonFatal && logFlags.console) console.log('selecting from standbyNodesInfo', standbyNodesInfo)

  // construct a list of objects that we'll sort by `selectionNum`. we'll use
  // the public key to get the join request associated with the public key and
  // inform the node later that it has been accepted
  const objs: {
    publicKey: string
    selectionNum: string
    appJoinData?: Record<string, any> | null //appJoinData is required for golden ticket
  }[] = []
  for (const [publicKey, info] of standbyNodesInfo) {
    objs.push({
      publicKey,
      selectionNum: info.selectionNum,
      appJoinData: info.appJoinData,
    })
  }

  // sort the objects by their selection numbers
  objs.sort((a, b) => (a.selectionNum < b.selectionNum ? 1 : a.selectionNum > b.selectionNum ? -1 : 0))

  let offset = 0
  const cycleMarker = CycleChain.getCurrentCycleMarker()
  if (cycleMarker) {
    const first8HexChars = cycleMarker.substring(0, 8)
    offset = parseInt(first8HexChars, 16)
  }

  /* prettier-ignore */ if (logFlags.p2pNonFatal && logFlags.console)
  console.log('Input parameters to selectIndexesWithOffset - Max allowed:', maxAllowed, 'Offset:', offset, 'Array Size: ',objs.length);

  if (maxAllowed > objs.length) {
    /* prettier-ignore */ nestedCountersInstance.countEvent('joinV2', `selectNodes: capping maxAllowed ${maxAllowed} to ${objs.length}`)
    maxAllowed = objs.length
  }

  if (offset >= 0 && maxAllowed >= 1 && maxAllowed <= objs.length) {
    const selectedIndexes = selectIndexesWithOffeset(objs.length, maxAllowed, offset)

    /* prettier-ignore */ if (logFlags.p2pNonFatal && logFlags.console)
    console.log("SelectedIndexes: ",selectedIndexes)

    for (let i = 0; i < selectedIndexes.length; i++) {
      // eslint-disable-next-line security/detect-object-injection
      const selectedIndex = selectedIndexes[i]
      // eslint-disable-next-line security/detect-object-injection
      selectedPublicKeys.add(objs[selectedIndex].publicKey)
    }
  } else {
    /* prettier-ignore */ if (logFlags.p2pNonFatal && logFlags.console) console.log(`Invalid input parameters for selection: array length: ${objs.length} maxAllowed:${maxAllowed} offset:${offset}`)
    /* prettier-ignore */ nestedCountersInstance.countEvent('joinV2', 'selectNodes: Invalid input parameters for selection')
  }

  // If golden ticket is enabled, add nodes with adminCert + golden ticket to selectedPublicKeys if they are not already there
  if (shardus.config.p2p.goldenTicketEnabled === true) {
    for (const obj of objs) {
      if (obj.appJoinData?.adminCert?.goldenTicket === true && !selectedPublicKeys.has(obj.publicKey)) {
        /* prettier-ignore */ if (logFlags.p2pNonFatal && logFlags.console) console.log('selecting golden ticket nodes from standbyNodesInfo')
        selectedPublicKeys.add(obj.publicKey)
      }
    }
  }
}
/**
 * Returns the list of public keys of the nodes that have been selected and
 * empties the list.
 */
export function drainSelectedPublicKeys(): string[] {
  const tmp = [...selectedPublicKeys.values()]
  selectedPublicKeys.clear()
  return tmp
}

export function forceSelectSelf(): void {
  selectedPublicKeys.add(crypto.keypair.publicKey)
}
