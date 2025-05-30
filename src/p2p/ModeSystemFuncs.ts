import * as NodeList from './NodeList'
import * as Self from './Self'
import { enterRecovery, enterSafety, enterProcessing, enterShutdown } from './Modes'
import { config, logger } from './Context'
import { targetCount } from './CycleAutoScale'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { P2P } from '@shardeum-foundation/lib-types'
import { insertSorted, lerp } from '../utils'
import * as CycleCreator from './CycleCreator'
import * as CycleChain from './CycleChain'
import { logFlags } from '../logger'
import { Utils } from '@shardeum-foundation/lib-types'
import { getProblematicNodesWithReadiness } from './ProblemNodeHandler'

interface ToAcceptResult {
  add: number
  remove: number
}

export function calculateToAcceptV2(prevRecord: P2P.CycleCreatorTypes.CycleRecord): ToAcceptResult {
  const active = NodeList.activeByIdOrder.length
  const syncing = NodeList.byJoinOrder.length - NodeList.activeByIdOrder.length
  // For now, we are using the desired value from the previous cycle. In the future, we should look at using the next desired value
  const desired = prevRecord?.desired
  const target = targetCount
  const mode = prevRecord?.mode
  const hasPrevRecord = prevRecord != null
  const counter = prevRecord?.counter
  const lost_count = prevRecord?.lost?.length

  /* prettier-ignore */ if (config.debug.verboseNestedCounters || (logFlags?.verboseNestedCounters)) nestedCountersInstance.countEvent( 'p2p', `desired: ${desired}, target: ${target}, active: ${active}, syncing: ${syncing}` )
  /* prettier-ignore */ if (logFlags?.node_rotation_debug) logger.mainLog_debug('CALCULATETOACCEPTV2_1', logger.combine(`calculateToAcceptV2 prevCounter: ${counter}, desired: ${desired}, target: ${target}, active: ${active}, syncing: ${syncing}`, 'calculateToAcceptV2_prevCounter'))

  if (hasPrevRecord === false) {
    return { add: 0, remove: 0 }
  }

  return calculateAddRemove(mode, active, syncing, desired, target, counter, lost_count)
}

function calculateAddRemove(
  mode: string,
  active: number,
  syncing: number,
  desired: number,
  target: number,
  counter: number,
  lost_count: number
): ToAcceptResult {
  let add = 0
  let remove = 0

  // we can make desiredSyncingNodeCount dynamic later. it could be based on the average sync time and the desired rotaiton rate
  const desiredSyncingNodeCount = config.p2p.syncingDesiredMinCount
  const useNewSyncingDesiredCount = config.p2p.syncFloorEnabled
  const syncingMaxAddPercent = config.p2p.syncingMaxAddPercent
  const syncingCeilingBase = desiredSyncingNodeCount //config.p2p.syncingCeiling

  // going to re-evaluate this and make them adjustable
  const syncingCeilingProcessing = syncingCeilingBase * 2
  const syncingCeilingSafety = syncingCeilingBase * 4
  const syncingCeilingRecovery = syncingCeilingBase * 4

  const flexibleRotationDelta = config.p2p.flexibleRotationDelta
  const maxRemove = config.p2p.maxRotatedPerCycle
  const flexibleRotationEnabled = config.p2p.flexibleRotationEnabled

  if (mode === 'forming') {
    if (Self.isFirst && active < 1) {
      add = target
      remove = 0
      return { add, remove }
    } else if (active != desired) {
      let addRem = target - (active + syncing)
      /* prettier-ignore */ if (logFlags?.node_rotation_debug) logger.mainLog_debug('CALCULATEADDREMOVE_FORMING_1', logger.combine(`under forming active != desired; addRem: ${addRem}`, 'forming_active_not_desired'))
      if (addRem > 0) {
        add = Math.ceil(addRem)
        remove = 0
        return { add, remove }
      }
      if (addRem < 0) {
        addRem = active - target
        if (addRem > 0) {
          if (addRem > 0.1 * active) {
            addRem = 0.1 * active
          }
          if (addRem < 1) {
            addRem = 1
          }
          add = 0
          remove = Math.ceil(addRem)
          return { add, remove }
        }
      }
    }
  } else if (mode === 'restart') {
    if (syncing < desired + config.p2p.extraNodesToAddInRestart) {
      const addRem = target + config.p2p.extraNodesToAddInRestart - syncing
      /* prettier-ignore */ if (logFlags?.node_rotation_debug) logger.mainLog_debug('CALCULATEADDREMOVE_RESTART_1', logger.combine(`under restart active != desired; addRem: ${addRem}`, 'restart_active_not_desired'))
      if (addRem > 0) {
        add = Math.ceil(addRem)
        remove = 0
        return { add, remove }
      }
    }
  } else if (mode === 'processing') {
    if (enterSafety(active) === false && enterRecovery(active) === false) {
      /* prettier-ignore */ if (logFlags?.node_rotation_debug) logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_1', logger.combine("max rotated per cycle: ", config.p2p.maxRotatedPerCycle, 'max_rotated_per_cycle'))
      if (active !== ~~target) {
        // calculate nodes to add or remove
        /* prettier-ignore */ if (logFlags?.node_rotation_debug) logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_2', logger.combine("active not equal target", 'active_not_equal_target'))
        let addRem = target - (active + syncing)
        /* prettier-ignore */ if (logFlags?.node_rotation_debug) logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_3', logger.combine("addRem ", addRem, 'addRem'))
        if (addRem > 0) {
          if (addRem > active * config.p2p.rotationMaxAddPercent) {
            // limit nodes added to 10% of active; we are here because many were lost
            addRem = ~~(active * config.p2p.rotationMaxAddPercent)
            if (addRem === 0) {
              addRem = 1
            }
          }

          add = Math.ceil(addRem)
          remove = 0

          //new logic here , but it is not a total replacment, it will only boost the add value
          if (useNewSyncingDesiredCount) {
            //if (add + syncing < desiredSyncingNodeCount){ //???
            // NEED to decide if "add" count should be considered with the syncing count!

            add = maintainSyncingFloor(desiredSyncingNodeCount, syncing, add)
            add = clampMaxNodesToAdd(add, active, syncingMaxAddPercent)
            add = maintainSyncingCeiling(syncingCeilingProcessing, syncing, add)
            if (flexibleRotationEnabled) {
              remove = calculateFlexibleRotationRemovals(desired, active, flexibleRotationDelta, maxRemove, remove)
            }
          }
          const logMsg = 'active !== ~~target addRem > 0'
          /* prettier-ignore */ if(logFlags?.node_rotation_debug) logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_4', logger.combine(`calculateAddRemove: cycle:${counter} `, logMsg, `add: ${add} remove:${remove} active:${active} syncing:${syncing}`, 'calculateAddRemove_active_not_equal_target_addRem_greater_than_0'))
          /* prettier-ignore */ if (config.debug.verboseNestedCounters) nestedCountersInstance.countEvent('p2p', `calculateAddRemove c:${counter} active !== ~~target, addRem > 0 add: ${add}, remove: ${remove}`)
          return { add, remove }
        }
        if (addRem < 0) {
          //Note that we got here earlier because syncing nodes were "counting against us"
          //now we will look at addRem where syncing nodes are not considered
          let toRemove = active - target // only remove the active nodes more than target
          /* prettier-ignore */ if (logFlags?.node_rotation_debug) logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_5', logger.combine(`addRem in processing: ${toRemove}`, 'addRem_in_processing'))
          if (toRemove > active * config.p2p.rotationMaxRemovePercent) {
            // limit nodes removed to 5% of active; this should not happen
            /* prettier-ignore */ if(logFlags?.node_rotation_debug) logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_6', logger.combine('unexpected addRem > 5% of active', toRemove, active, target, desired, 'unexpected_addRem_greater_than_5_percent_of_active'))
            //~~ truncate the value of rnum i.e. fast Math.floor()
            toRemove = ~~(active * config.p2p.rotationMaxRemovePercent)
            if (toRemove === 0) {
              toRemove = 1
            }
          }
          //keep in mind that we use (active - target), so this value means we have too many nodes more than target
          if (toRemove > 0) {
            if (toRemove > active * config.p2p.rotationMaxRemovePercent) {
              // don't ever remove more than 5% of active per cycle
              toRemove = active * config.p2p.rotationMaxRemovePercent
            }
            if (toRemove < 1) {
              toRemove = 1
            }
            add = 0
            remove = Math.ceil(toRemove)

            //new logic here , but it is not a total replacment, it will only boost the add value
            if (useNewSyncingDesiredCount) {
              // even though we may have too many nodes we should still keep nodes in the syncing pipleline
              add = maintainSyncingFloor(desiredSyncingNodeCount, syncing, add)
              add = clampMaxNodesToAdd(add, active, syncingMaxAddPercent)
              add = maintainSyncingCeiling(syncingCeilingProcessing, syncing, add)
              if (flexibleRotationEnabled) {
                remove = calculateFlexibleRotationRemovals(desired, active, flexibleRotationDelta, maxRemove, remove)
              }
            }

            const logMsg = 'active !== ~~target addRem < 0 tooremove > 0'
            /* prettier-ignore */ if(logFlags?.node_rotation_debug) logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_7', logger.combine(`calculateAddRemove: cycle:${counter} `, logMsg, `add: ${add} remove:${remove} active:${active} syncing:${syncing}`, 'calculateAddRemove_active_not_equal_target_addRem_less_than_0_tooremove_greater_than_0'))

            /* prettier-ignore */ if (config.debug.verboseNestedCounters) nestedCountersInstance.countEvent('p2p', `calculateAddRemove c:${counter} active !== ~~target, addRem < 0 (remove) add: ${add}, remove: ${remove}`)
            return { add, remove }
          } else {
            //this is a case where syncing nodes are counting against us
            //  for example we still have less active nodes than we target, but
            //  if you count the syncing nodes we have more.
            //

            //New logic here.  To be rotation safe and correct it is better to run fresh logic
            if (useNewSyncingDesiredCount) {
              add = 0
              add = maintainSyncingFloor(desiredSyncingNodeCount, syncing, add)
              add = clampMaxNodesToAdd(add, active, syncingMaxAddPercent)
              add = maintainSyncingCeiling(syncingCeilingProcessing, syncing, add)
              //counter to other cases where we just add an go on, the best option here
              // is do avoid all the proceeding logic if we are using the new
              // syncingDesiredCount value
              if (flexibleRotationEnabled) {
                remove = calculateFlexibleRotationRemovals(desired, active, flexibleRotationDelta, maxRemove, remove)
              }
              const logMsg = 'active !== ~~target addRem too remove <= 0'
              /* prettier-ignore */ if(logFlags?.node_rotation_debug)  logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_8', logger.combine(`calculateAddRemove: cycle:${counter} `, logMsg, `add: ${add} remove:${remove} active:${active} syncing:${syncing}`, 'calculateAddRemove_active_not_equal_target_addRem_too_remove_less_than_or_equal_to_0'))

              return { add, remove }
            }

            // Logic below here was the old stopgap solution that is no longer
            // scaling well with larger, longer lived networks!
            // We have to keep it to be rotation safe!
            // syncingDesiredCount will not be set to a value greater than 0
            // until the activation migration of 1.15.3

            // we need to take a careful look to allow
            //some nodes to sync and go active  (can look at median time )

            // for now we will use an approximation that we want to rotate one per cycle
            // consier this a stand in for the 0.1% of active, but rounded up... i.e   1 for 1-1999 node networks
            const desiredRotationPerCycle = 1
            //const estimatedCyclesToSyncAndGoActive = 5

            //we can make a max syncing number that is based on our rotation rate desires and average syncing times
            //const maxSyncing = estimatedCyclesToSyncAndGoActive * desiredRotationPerCycle

            //for now max syncing can be based on our fudge factors
            const maxSyncing =
              desiredRotationPerCycle * config.p2p.rotationCountMultiply + config.p2p.rotationCountAdd + 1
            //note added +1 at the end so we can always buffere at least one syncing node if we hit this case

            if (syncing < maxSyncing) {
              //test code to see if we can manipulate a network to rotate at a better rate.
              // addRem = config.p2p.rotationCountMultiply * addRem
              // addRem = config.p2p.rotationCountAdd + addRem

              add = maxSyncing - syncing

              /* prettier-ignore */ if (config.debug.verboseNestedCounters) nestedCountersInstance.countEvent('p2p', `calculateAddRemove c:${counter} active !== ~~target, addRem < 0 (not-remove) add: ${add}, remove: ${remove}`)
              return { add, remove }
            }
          }
        }
      } else if (config.p2p.maxRotatedPerCycle !== 0) {
        //This is the case where active === target and we allow nodes to be rotated

        //New logic here.  To be rotation safe and correct it is better to run fresh logic
        if (useNewSyncingDesiredCount) {
          add = 0
          add = maintainSyncingFloor(desiredSyncingNodeCount, syncing, add)
          add = clampMaxNodesToAdd(add, active, syncingMaxAddPercent)
          add = maintainSyncingCeiling(syncingCeilingProcessing, syncing, add)
          if (flexibleRotationEnabled) {
            remove = calculateFlexibleRotationRemovals(desired, active, flexibleRotationDelta, maxRemove, remove)
          }
          const logMsg = 'active == ~~target 0'
          /* prettier-ignore */ if(logFlags?.node_rotation_debug) logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_9', logger.combine(`calculateAddRemove: cycle:${counter} `, logMsg, `add: ${add} remove:${remove} active:${active} syncing:${syncing}`, 'calculateAddRemove_active_equal_target_0'))

          return { add, remove }
        }

        //This essentially active === target and we have a non zero maxRotatedPerCycle
        /* prettier-ignore */ if (logFlags?.node_rotation_debug) logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_10', logger.combine("entered rotation", 'entered_rotation'))
        let rnum = config.p2p.maxRotatedPerCycle // num to rotate per cycle; can be less than 1; like 0.5 for every other cycle; -1 for auto
        if (rnum < 0) {
          // rotate all nodes in 1000 cycles
          rnum = active * config.p2p.rotationPercentActive
        }
        if (rnum < 1) {
          //This is supposed to be true rnum % of the time, that does not work
          //the math is wrong.  fortunately we can avoid this if maxRotatedPerCycle >= 1
          if (counter % (1 / rnum) === 0) {
            // rotate every few cycles if less than 1000 nodes
            rnum = 1
          } else {
            rnum = 0
          }
        }
        if (rnum > 0) {
          if (rnum > active * config.p2p.rotationPercentActive) {
            //~~ truncate the value of rnum i.e. fast Math.floor()
            rnum = ~~(active * config.p2p.rotationPercentActive)
            if (rnum < 1) {
              rnum = 1
            }
          }

          //test code to see if we can manipulate a network to rotate at a better rate.
          rnum = config.p2p.rotationCountMultiply * rnum
          rnum = config.p2p.rotationCountAdd + rnum

          /* prettier-ignore */ if (logFlags?.node_rotation_debug) logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_11', logger.combine("rnum: ", rnum, 'rnum'))
          /* prettier-ignore */ if (logFlags?.node_rotation_debug) logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_12', logger.combine("setting add to rnum", 'setting_add_to_rnum'))
          add = Math.ceil(rnum)
          remove = 0
        }

        /* prettier-ignore */ if (config.debug.verboseNestedCounters) nestedCountersInstance.countEvent('p2p', `calculateAddRemove c:${counter} config.p2p.maxRotatedPerCycle !== 0 add: ${add}, remove: ${remove}`)
        /* prettier-ignore */ if (logFlags?.node_rotation_debug) logger.mainLog_debug('CALCULATEADDREMOVE_PROCESSING_13', logger.combine(`add: ${add}, remove: ${remove}`, 'add_remove'))
        return { add, remove }
      }
    }
  } else if (mode === 'safety') {
    if (enterProcessing(active) === false && enterRecovery(active) === false) {
      //New logic here.  To be rotation safe and correct it is better to run fresh logic
      if (useNewSyncingDesiredCount) {
        add = config.p2p.minNodes - (active + syncing)
        add = Math.max(add, 0) // don't add negative nodes

        // the closer safety mode was getting to the goal the less syncing nodes were being maintained.
        // it is much better to maintain the correct steady state of syncing nodes
        // rather than letting it approach 0
        add = maintainSyncingFloor(desiredSyncingNodeCount, syncing, add)
        add = clampMaxNodesToAdd(add, active, syncingMaxAddPercent)
        add = maintainSyncingCeiling(syncingCeilingSafety, syncing, add)

        const logMsg = 'safety'
        /* prettier-ignore */ if(logFlags?.node_rotation_debug) logger.mainLog_debug('CALCULATEADDREMOVE_SAFETY_1', logger.combine(`calculateAddRemove: cycle:${counter} `, logMsg, `add: ${add} remove:${remove} active:${active} syncing:${syncing}`, 'calculateAddRemove_safety'))

        return { add, remove }
      }

      // since in safety mode, will use minNodes as the threshold to enter back into processing mode
      let addRem = 1.02 * config.p2p.minNodes - (active + syncing) // we try to overshoot min value by 2%; for slow syncing nodes
      if (addRem > active * 0.05) {
        addRem = ~~(active * 0.05)
        if (addRem === 0) {
          addRem = 1
        }
      }
      // Is this needed for lost nodes? lost nodes didn't get removed in next cycle if they refuted
      // Or is the intention to use the removed nodes in the previous cycle? If so, we can also consider apoptosized nodes as well.
      addRem += lost_count // compensate for nodes that were lost; though this could add more burden on existing nodes

      if (addRem > 0) {
        add = Math.ceil(addRem)
        remove = 0
        return { add, remove }
      }
    }
  } else if (mode === 'recovery') {
    if (enterShutdown(active) === false) {
      //New logic here.  To be rotation safe and correct it is better to run fresh logic
      if (useNewSyncingDesiredCount) {
        add = config.p2p.minNodes - (active + syncing)
        add = Math.max(add, 0) // don't add negative nodes

        // the closer recover mode was getting to the goal the less syncing nodes were being maintained.
        // it is much better to maintain the correct steady state of syncing nodes
        // rather than letting it approach 0
        add = maintainSyncingFloor(desiredSyncingNodeCount, syncing, add)
        add = clampMaxNodesToAdd(add, active, syncingMaxAddPercent)
        add = maintainSyncingCeiling(syncingCeilingRecovery, syncing, add)
        const logMsg = 'recovery'
        /* prettier-ignore */ if(logFlags?.node_rotation_debug) logger.mainLog_debug('CALCULATEADDREMOVE_RECOVERY_1', logger.combine(`calculateAddRemove: cycle:${counter} `, logMsg, `add: ${add} remove:${remove} active:${active} syncing:${syncing}`))

        return { add, remove }
      }

      const totalNodeCount = active + syncing
      let addRem = target - totalNodeCount
      /* prettier-ignore */ if (logFlags?.node_rotation_debug) logger.mainLog_debug('CALCULATEADDREMOVE_RECOVERY_1', `Recovery mode calculations addRem: ${addRem} active: ${active} syncing: ${syncing} target: ${target}`)
      if (addRem > totalNodeCount * 0.2) {
        addRem = ~~(totalNodeCount * 0.2) // Add 20% more nodes on each cycle
        if (addRem === 0) {
          addRem = 1
        }
      }
      if (addRem > 0) {
        add = Math.ceil(addRem)
        remove = 0
        return { add, remove }
      }
    }
  } else if (mode === 'restore') {
    const addRem = target - (active + syncing)
    /* prettier-ignore */ if (logFlags?.node_rotation_debug) logger.mainLog_debug('CALCULATEADDREMOVE_RESTORE_1', `Restore mode calculations addRem: ${addRem} active: ${active} syncing: ${syncing} target: ${target}`)
    if (addRem > 0) {
      add = Math.ceil(addRem)
      return { add, remove }
    }
  }

  /* prettier-ignore */ if (logFlags.verbose) logger.mainLog_debug('CALCULATEADDREMOVE_17', `add remove returned from default. add_remove_returned_from_default mode:${mode} add: ${add} remove:${remove} active:${active} syncing:${syncing}`)
  return { add, remove }
}

function maintainSyncingFloor(desiredSyncingNodeCount: number, syncing: number, add: number): number {
  if (syncing < desiredSyncingNodeCount) {
    const addtionalNodesToAdd = desiredSyncingNodeCount - (syncing - add)
    /* prettier-ignore */ if (logFlags?.node_rotation_debug) logger.mainLog_debug('MAINTAINSYNCINGFLOOR_ADD', `maintainSyncingFloor syncing: ${syncing} desiredSyncingNodeCount: ${desiredSyncingNodeCount} add: ${add} (before) addtionalNodesToAdd: ${addtionalNodesToAdd}`)
    add += addtionalNodesToAdd
  }
  return add
}

function maintainSyncingCeiling(syncCeiling: number, syncing: number, add: number): number {
  if (syncing > syncCeiling) {
    /* prettier-ignore */ if (logFlags?.node_rotation_debug) logger.mainLog_debug('MAINTAINSYNCINGCEILING_CLAMP', `maintainSyncingCeiling syncing: ${syncing} syncCeiling: ${syncCeiling} add: ${add} (will be set to 0)`)
    add = 0
  }
  return add
}

/**
 * clam the amount of node we will suggest adding in a cycle to a percentage of the active nodes
 *
 * @param add
 * @param active
 * @param syncingMaxAddPercent
 * @returns
 */
function clampMaxNodesToAdd(add: number, active: number, syncingMaxAddPercent: number): number {
  const maxAdd = active * syncingMaxAddPercent
  if (add > maxAdd) {
    /* prettier-ignore */ if (logFlags?.node_rotation_debug) logger.mainLog_debug('CLAMP_MAX_NODES_TO_ADD', `clampMaxNodesToAdd add: ${add} active: ${active} maxAdd: ${maxAdd}`)
    add = ~~maxAdd
    if (add === 0) {
      add = 1
    }
  }
  return add
}

function calculateFlexibleRotationRemovals(
  desired: number,
  active: number,
  belowDesiredRemovalDelta: number,
  maxRemove: number,
  remove: number
): number {
  const additionalRotation = belowDesiredRemovalDelta + active - desired

  if (additionalRotation > 0) {
    const originalRemove = remove
    //check our rotation limit
    const allowedToRemove = Math.min(additionalRotation, maxRemove)
    //if we are able to boost remove then do so
    remove = Math.max(remove, allowedToRemove)
    if (originalRemove !== remove) {
      /* prettier-ignore */ if (logFlags?.node_rotation_debug) logger.mainLog_debug('CALC_FLEXIBLE_ROTATION_REMOVAL', `calculateFlexibleRotationRemovals belowDesiredRemovalDelta: ${belowDesiredRemovalDelta} originalRemove: ${originalRemove} remove: ${remove}`)
    }
  }
  return remove
}

// need to think about and maybe ask Omar about using prev record for determining mode, could use next record
const getApoptosizedNodes = (txs: P2P.RotationTypes.Txs & P2P.ApoptosisTypes.Txs): string[] => {
  const apoptosizedNodesList = []
  for (const request of txs.apoptosis) {
    const node = NodeList.nodes.get(request.id)
    if (node) {
      apoptosizedNodesList.push(node.id)
    }
  }
  return apoptosizedNodesList
}

/** Returns the number of expired nodes and the list of removed nodes using calculateToAcceptV2 */
export function getExpiredRemovedV2(
  prevRecord: P2P.CycleCreatorTypes.CycleRecord,
  lastLoggedCycle: number,
  txs: P2P.RotationTypes.Txs & P2P.ApoptosisTypes.Txs,
  info: (...msg: string[]) => void
): { expired: number; removed: string[] } {
  const start = prevRecord.start
  let expired = 0
  const removed = []
  NodeList.potentiallyRemoved.clear()

  // Don't expire/remove any if nodeExpiryAge is negative
  if (config.p2p.nodeExpiryAge < 0) return { expired, removed }

  const active = NodeList.activeByIdOrder.length

  let expireTimestamp = start - config.p2p.nodeExpiryAge
  if (expireTimestamp < 0) expireTimestamp = 0

  // initialize the max amount to remove to our config value
  // let maxRemove = config.p2p.maxRotatedPerCycle //TODO check if this is needed

  // calculate the target number of nodes
  const { add, remove } = calculateToAcceptV2(prevRecord)
  nestedCountersInstance.countEvent(
    'p2p',
    `results of getExpiredRemovedV2.calculateToAcceptV2: add: ${add}, remove: ${remove}`
  )
  // initialize `scaleDownRemove` to at most any "excess" nodes more than
  // desired. it can't be less than zero.
  const maxRemove = remove

  //only let the scale factor impart a partial influence based on scaleInfluenceForShrink
  // const scaledAmountToShrink = getScaledAmountToShrink() //TODO check if this is needed

  //limit the scale down by scaledAmountToShrink
  // if (scaleDownRemove > scaledAmountToShrink) {
  //   scaleDownRemove = scaledAmountToShrink
  // }

  //maxActiveNodesToRemove is a percent of the active nodes that is set as a 0-1 value in maxShrinkMultiplier
  //this is to prevent the network from shrinking too fast
  //make sure the value is at least 1
  // const maxActiveNodesToRemove = Math.max(Math.floor(config.p2p.maxShrinkMultiplier * active), 1)

  const cycle = CycleChain.newest.counter
  if (cycle > lastLoggedCycle && maxRemove > 0) {
    lastLoggedCycle = cycle
    info(
      'scale down dump:' +
        Utils.safeStringify({
          cycle,
          scaleFactor: CycleCreator.scaleFactor,
          // scaleDownRemove,
          // maxActiveNodesToRemove,
          desired: prevRecord.desired,
          active,
          // scaledAmountToShrink,
          maxRemove,
          expired,
        })
    )
  }

  //TODO not sure we still need the following block anymore

  // Allows the network to scale down even if node rotation is turned off
  // if (maxRemove < 1) {
  //   maxRemove = scaleDownRemove
  // } else {
  //   //else pick the higher of the two
  //   maxRemove = Math.max(maxRemove, scaleDownRemove)
  // }

  // never remove more nodes than the difference between active and desired
  // if (maxRemove > active - desired) maxRemove = active - desired // [TODO] - this is handled inside calculateToAcceptV2

  // final clamp of max remove, but only if it is more than amountToShrink
  // to avoid messing up the calculation above this next part can only make maxRemove smaller.
  // maxActiveNodesToRemove is a percent of the active nodes that is set as a 0-1 value in maxShrinkMultiplier
  // if (maxRemove > config.p2p.amountToShrink && maxRemove > maxActiveNodesToRemove) {
  // yes, this max could be baked in earlier, but I like it here for clarity
  // maxRemove = Math.max(config.p2p.amountToShrink, maxActiveNodesToRemove)
  // }

  //TODO end of block

  nestedCountersInstance.countEvent('p2p', `results of getExpiredRemovedV2: scaleDownRemove: maxRemove: ${maxRemove}`)
  // get list of nodes that have been requested to be removed
  const apoptosizedNodesList = []
  for (const request of txs.apoptosis) {
    const node = NodeList.nodes.get(request.id)
    if (node) {
      apoptosizedNodesList.push(node.id)
    }
  }

  // Oldest node has index 0
  for (const node of NodeList.byJoinOrder) {
    // don't count syncing nodes in our expired count
    if (node.status === 'syncing') continue

    // once we've hit the first node that's not expired, stop counting
    // updated to use activeTimestamp as this is when the node has gone active for us
    if (node.activeTimestamp > expireTimestamp) break

    // otherwise, count this node as expired
    expired++

    // Add it to removed if it isn't full
    if (config.p2p.uniqueRemovedIds) {
      // Limit the number of nodes that can be removed by removed + apoptosized
      if (removed.length + apoptosizedNodesList.length < maxRemove) {
        NodeList.potentiallyRemoved.add(node.id)
        if (!apoptosizedNodesList.includes(node.id)) {
          insertSorted(removed, node.id)
        }
      } else break
    } else {
      if (removed.length < maxRemove) {
        NodeList.potentiallyRemoved.add(node.id)
        insertSorted(removed, node.id)
      }
    }
  }

  return { expired, removed }
}

type GetExpiredRemovedV3Result = {
  // the number of problematic nodes that we have removed
  problematic: number
  // the number of expired nodes that we have removed
  expired: number
  // the list of nodes (by id) that we have removed
  removed: string[]
}

/**
 * Gets the list of nodes that should be removed from the network in the next cycle.
 *
 */
export function getExpiredRemovedV3(
  prevRecord: P2P.CycleCreatorTypes.CycleRecord,
  lastLoggedCycle: number,
  txs: P2P.RotationTypes.Txs & P2P.ApoptosisTypes.Txs,
  info: (...msg: string[]) => void
): GetExpiredRemovedV3Result {
  // clear state from last run
  NodeList.potentiallyRemoved.clear()

  const active = NodeList.activeByIdOrder.length
  const start = prevRecord.start
  let expireTimestamp = start - config.p2p.nodeExpiryAge
  if (expireTimestamp < 0) expireTimestamp = 0

  // calculate the target number of nodes
  const { add, remove } = calculateToAcceptV2(prevRecord)
  // get list of expired nodes
  const expirationTimeThreshold = Math.max(start - config.p2p.nodeExpiryAge, 0)

  // get list of nodes that have been requested to be removed
  const apoptosizedNodesList = getApoptosizedNodes(txs)
  const numApoptosizedRemovals = apoptosizedNodesList.length

  // expired, non-apoptosized, non-syncing nodes
  const expiredNodes = NodeList.byJoinOrder
    .filter((node) => {
      const timestampExpired = node.activeTimestamp <= expirationTimeThreshold
      const isSyncing = node.status === 'syncing'
      const isApoptosized = apoptosizedNodesList.includes(node.id)
      return timestampExpired && !isSyncing && !isApoptosized
    })
    .map((node) => node.id)
  const numExpiredNodes = expiredNodes.length

  // Get the set of problematic nodes
  const problematicWithApoptosizedNodes = getProblematicNodesWithReadiness(prevRecord)
  // filter out apoptosized nodes from the problematic nodes
  const problematicNodes = problematicWithApoptosizedNodes.filter((id) => !apoptosizedNodesList.includes(id))
  const canRemoveProblematicNodesThisCycle = prevRecord.counter % config.p2p.problematicNodeRemovalCycleFrequency === 0
  const numProblematicRemovals = Math.min(
    problematicNodes.length,
    canRemoveProblematicNodesThisCycle ? config.p2p.maxProblematicNodeRemovalsPerCycle || 1 : 0
  )

  // we can remove `remove` nodes, but we *must* remove the number of apoptosized nodes,
  // the remainder is the number of expired nodes we can remove this cycle
  // if there are more nodes apopped than we can remove, we can't remove any expired nodes
  const numPotentiallyExpiredRemovals = Math.max(remove - numApoptosizedRemovals, 0)
  const numExpiredRemovals = Math.min(numPotentiallyExpiredRemovals, numExpiredNodes)

  const cycle = CycleChain.newest.counter

  if (cycle > lastLoggedCycle && remove > 0) {
    lastLoggedCycle = cycle
    info(
      'scale down dump:' +
        Utils.safeStringify({
          cycle,
          scaleFactor: CycleCreator.scaleFactor,
          desired: prevRecord.desired,
          active,
          maxRemove: remove,
          expired: numExpiredNodes,
        })
    )
  }

  if (logFlags?.node_rotation_debug) {
    const counters = {
      add,
      remove,
      numApoptosizedRemovals: numApoptosizedRemovals,
      numProblematicRemovals: numProblematicRemovals,
      numProblematicNodes: problematicNodes.length,
      canRemoveProblematicNodesThisCycle: canRemoveProblematicNodesThisCycle,
      numPotentiallyExpiredRemovals: numPotentiallyExpiredRemovals,
      numExpiredRemovals: numExpiredRemovals,
    }
    nestedCountersInstance.countEvent('p2p', `results of getExpiredRemovedV3: ${JSON.stringify(counters)}`)
  }

  const dangerousRemoval = remove === 0 && config.p2p.enableDangerousProblematicNodeRemoval === false
  const nodesNeverExpire = config.p2p.nodeExpiryAge < 0
  // if its recommended that we dont remove any nodes, Or the nodes never expire, we MUST adhere to this.
  if (dangerousRemoval || nodesNeverExpire) {
    return {
      problematic: 0,
      expired: 0,
      removed: [],
    }
  }

  // array that hold all the nodes to remove
  // maintains the sort order provided in activeByIdOrder
  const toRemoveUnsorted = problematicNodes
    .slice(0, numProblematicRemovals)
    .concat(expiredNodes.slice(0, numExpiredRemovals))

  // maintains the sort order provided in activeByIdOrder
  const toRemove = NodeList.byJoinOrder.filter((node) => toRemoveUnsorted.includes(node.id))

  const removed = []
  // Process nodes for removal
  for (const node of toRemove) {
    nestedCountersInstance.countEvent('p2p', `getExpiredRemovedV3: adding node to removed: ${node.id}`)
    NodeList.potentiallyRemoved.add(node.id)
    insertSorted(removed, node.id)
  }

  return { problematic: numProblematicRemovals, expired: numExpiredRemovals, removed }
}
