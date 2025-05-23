import TransactionQueue from './TransactionQueue'
import { logFlags } from '../logger'
import * as utils from '../utils'
import { nestedCountersInstance } from '../utils/nestedCounters'
import { profilerInstance } from '../utils/profiler'
import { config as configContext, network as networkContext } from '../p2p/Context' // Added network for consistency if needed later
import * as Self from '../p2p/Self' // For Self.id
import * as CycleChain from '../p2p/CycleChain'
import { nodes, potentiallyRemoved, activeByIdOrder } from '../p2p/NodeList'
import * as Shardus from '../shardus/shardus-types'
import {
  QueueEntry,
  AcceptedTx,
  PreApplyAcceptedTransactionResult,
  CommitConsensedTransactionResult,
  RequestStateForTxReq,
  RequestStateForTxResp,
  WrappedResponses,
  AccountFilter,
  RequestFinalDataResp,
  // RequestReceiptForTxResp_old, // If needed
  RequestStateForTxRespSerialized, // For askBinary deserialization
  RequestReceiptForTxReqSerialized, // For askBinary serialization
  RequestReceiptForTxRespSerialized, // For askBinary deserialization
  ArchiverReceipt, // For getArchiverReceiptFromQueueEntryLogic
} from './state-manager-types'
import ShardFunctions from './shardFunctions'
import { Utils } from '@shardeum-foundation/lib-types'
import { DebugComplete } from './TransactionQueue' // For enum
import { StateManager as StateManagerTypes, P2P as P2PTypes } from '@shardeum-foundation/lib-types'
import { shardusGetTime, ipInfo } from '../network'
import {
  serializeRequestStateForTxReq,
  deserializeRequestStateForTxResp,
} from '../types/RequestStateForTxReq' // Matching types with handlers
import {
  serializeRequestReceiptForTxReq,
  deserializeRequestReceiptForTxResp,
} from '../types/RequestReceiptForTxReq' // Matching types with handlers
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum'
import { ResponseError } from '../types/ResponseError'
import { RequestTxAndStateReq, serializeRequestTxAndStateReq } from '../types/RequestTxAndStateReq'
import { RequestTxAndStateResp, deserializeRequestTxAndStateResp } from '../types/RequestTxAndStateResp'
import * as Comms from '../p2p/Comms' // For Comms.askBinary
import {
  SpreadTxToGroupSyncingReq,
  serializeSpreadTxToGroupSyncingReq,
} from '../types/SpreadTxToGroupSyncingReq'
import { XOR, errorToStringFull } from '../utils' // For computeNodeRank
import { getGlobalTxReceipt } from '../p2p/GlobalAccounts'; // For getArchiverReceiptFromQueueEntryLogic

export async function _getAccountsStateHashLogic(
    instance: TransactionQueue,
    accountStart = '0'.repeat(64),
    accountEnd = 'f'.repeat(64),
    tsStart = 0,
    tsEnd = shardusGetTime()
  ): Promise<string> {
    const accountStates = await instance.storage.queryAccountStateTable(
      accountStart,
      accountEnd,
      tsStart,
      tsEnd,
      100000000
    )
    const seenAccounts = new Set()
    const filteredAccountStates = []
    for (let i = accountStates.length - 1; i >= 0; i--) {
      const accountState: Shardus.StateTableObject = accountStates[i]
      if (seenAccounts.has(accountState.accountId) === true) {
        continue
      }
      seenAccounts.add(accountState.accountId)
      filteredAccountStates.unshift(accountState)
    }
    const stateHash = instance.crypto.hash(filteredAccountStates)
    return stateHash
}

export async function _preApplyTransactionLogic(instance: TransactionQueue, queueEntry: QueueEntry): Promise<PreApplyAcceptedTransactionResult> {
    if (instance.queueStopped) return { applied: false, passed: false, applyResult: '', reason: 'queue stopped', applyResponse: null } // Added applyResponse for type match

    const acceptedTX = queueEntry.acceptedTx
    const wrappedStates = queueEntry.collectedData
    const localCachedData = queueEntry.localCachedData
    const tx = acceptedTX.data
    const keysResponse = queueEntry.txKeys
    const { timestamp, debugInfo } = keysResponse
    const uniqueKeys = queueEntry.uniqueKeys
    let accountTimestampsAreOK = true
    let ourLockID = -1
    let ourAccountLocks = null
    let applyResponse: Shardus.ApplyResponse | null = null
    const isGlobalModifyingTX = queueEntry.globalModification === true
    let passedApply = false
    let applyResult: string
    const appData = acceptedTX.appData

    if (logFlags.verbose && logFlags.console) console.log('preApplyTransaction ' + timestamp + ' debugInfo:' + debugInfo)
    if (logFlags.verbose) instance.mainLogger.debug('preApplyTransaction ' + timestamp + ' debugInfo:' + debugInfo)
    instance.txDebugMarkStartTime(queueEntry, 'preApplyTransaction')

    for (const key of uniqueKeys) {
      if (wrappedStates[key] == null) {
        if (logFlags.verbose && logFlags.console) console.log(`preApplyTransaction missing some account data. timestamp:${timestamp}  key: ${utils.makeShortHash(key)}  debuginfo:${debugInfo}`)
        instance.txDebugMarkEndTime(queueEntry, 'preApplyTransaction')
        return { applied: false, passed: false, applyResult: '', reason: 'missing some account data', applyResponse: null }
      } else {
        const wrappedState = wrappedStates[key]
        wrappedState.prevStateId = wrappedState.stateId
        wrappedState.prevDataCopy = utils.deepCopy(wrappedState.data)
        const { timestamp: updatedTimestamp } = instance.app.getTimestampAndHashFromAccount(wrappedState.data)
        wrappedState.timestamp = updatedTimestamp
        if (wrappedState.timestamp >= timestamp) {
          accountTimestampsAreOK = false
          break
        }
      }
    }

    if (!accountTimestampsAreOK) {
      if (logFlags.verbose) instance.mainLogger.debug('preApplyTransaction pretest failed: ' + timestamp)
      if (logFlags.playback) instance.logger.playbackLogNote('tx_preapply_rejected 1', `${acceptedTX.txId}`, `Transaction: ${utils.stringifyReduce(acceptedTX)}`)
      instance.txDebugMarkEndTime(queueEntry, 'preApplyTransaction')
      return {
        applied: false,
        passed: false,
        applyResult: '',
        reason: 'preApplyTransaction pretest failed, TX rejected',
        applyResponse: null,
      }
    }

    try {
      if (logFlags.verbose) {
        instance.mainLogger.debug(`preApplyTransaction  txid:${utils.stringifyReduce(acceptedTX.txId)} ts:${timestamp} isGlobalModifyingTX:${isGlobalModifyingTX}  Applying! debugInfo: ${debugInfo}`)
        instance.mainLogger.debug(`preApplyTransaction  filter: ${utils.stringifyReduce(queueEntry.localKeys)}`)
        instance.mainLogger.debug(`preApplyTransaction  acceptedTX: ${utils.stringifyReduce(acceptedTX)}`)
        instance.mainLogger.debug(`preApplyTransaction  wrappedStates: ${utils.stringifyReduce(wrappedStates)}`)
        instance.mainLogger.debug(`preApplyTransaction  localCachedData: ${utils.stringifyReduce(localCachedData)}`)
      }

      instance.setDebugLastAwaitedCallInner('preApplyTransaction-bulkFifoLockAccounts')
      if (logFlags.verbose && instance.stateManager.extendedRepairLogging) instance.mainLogger.debug(` preApplyTransaction FIFO lock outer: ${utils.stringifyReduce(uniqueKeys)} `)
      ourAccountLocks = await instance.stateManager.bulkFifoLockAccounts(uniqueKeys)
      if (logFlags.verbose && instance.stateManager.extendedRepairLogging) instance.mainLogger.debug(` preApplyTransaction FIFO lock inner: ${utils.stringifyReduce(uniqueKeys)} ourLocks: ${utils.stringifyReduce(ourAccountLocks)}`)
      instance.setDebugLastAwaitedCallInner('preApplyTransaction-bulkFifoLockAccounts', DebugComplete.Completed)

      instance.setDebugLastAwaitedCallInner('preApplyTransaction-fifoLock(accountModification)')
      ourLockID = await instance.stateManager.fifoLock('accountModification')
      instance.setDebugLastAwaitedCallInner('preApplyTransaction-fifoLock(accountModification)', DebugComplete.Completed)

      instance.profiler.profileSectionStart('process-dapp.apply')
      instance.profiler.scopedProfileSectionStart('apply_duration')

      if (configContext.stateManager.useCopiedWrappedStateForApply === true) {
        const deepCopyWrappedStates = utils.deepCopy(wrappedStates)
        instance.setDebugLastAwaitedCallInner('stateManager.transactionQueue.app.apply(tx)')
        applyResponse = await instance.app.apply(tx as Shardus.OpaqueTransaction, deepCopyWrappedStates, appData)
        instance.setDebugLastAwaitedCallInner('stateManager.transactionQueue.app.apply(tx)', DebugComplete.Completed)
      } else {
        instance.setDebugLastAwaitedCallInner('stateManager.transactionQueue.app.apply(tx)')
        applyResponse = await instance.app.apply(tx as Shardus.OpaqueTransaction, wrappedStates, appData)
        instance.setDebugLastAwaitedCallInner('stateManager.transactionQueue.app.apply(tx)', DebugComplete.Completed)
      }

      instance.profiler.scopedProfileSectionEnd('apply_duration')
      instance.profiler.profileSectionEnd('process-dapp.apply')
      if (applyResponse == null) {
        throw Error('null response from app.apply')
      }

      if (instance.config.debug.checkTxGroupChanges && applyResponse.accountWrites.length > 0) {
        const transactionGroupIDs = new Set(queueEntry.transactionGroup.map((node) => node.id))
        for (const account of applyResponse.accountWrites) {
          let txGroupCycle = queueEntry.txGroupCycle
          if (txGroupCycle > CycleChain.newest.counter) {
            txGroupCycle = CycleChain.newest.counter
          }
          const cycleShardDataForTx = instance.stateManager.shardValuesByCycle.get(txGroupCycle)
          const fixHomeNodeCheckForTXGroupChanges = instance.config.features.fixHomeNodeCheckForTXGroupChanges ?? false
          const homeNode = fixHomeNodeCheckForTXGroupChanges
            ? ShardFunctions.findHomeNode(
                cycleShardDataForTx.shardGlobals,
                account.accountId,
                cycleShardDataForTx.parititionShardDataMap
              )
            : ShardFunctions.findHomeNode(
                instance.stateManager.currentCycleShardData.shardGlobals,
                account.accountId,
                instance.stateManager.currentCycleShardData.parititionShardDataMap
              )
          let isUnexpectedAccountWrite = false
          for (const storageNode of homeNode.nodeThatStoreOurParitionFull) {
            const isStorageNodeInTxGroup = transactionGroupIDs.has(storageNode.id)
            if (!isStorageNodeInTxGroup) {
              isUnexpectedAccountWrite = true
              if (logFlags.verbose) instance.mainLogger.debug( `preApplyTransaction Storage node ${storageNode.id} of accountId ${account.accountId} is not in transaction group` )
              break
            }
          }
          if (logFlags.verbose) instance.mainLogger.debug( `preApplyTransaction isUnexpectedAccountWrite for account ${account.accountId}`, isUnexpectedAccountWrite )
          if (isUnexpectedAccountWrite) {
            applyResponse.failed = true
            applyResponse.failMessage = `preApplyTransaction unexpected account ${account.accountId} is not covered by transaction group`
          }
        }
      }

      if (applyResponse.failed === true) {
        passedApply = false
        applyResult = applyResponse.failMessage
      } else {
        passedApply = true
        applyResult = 'applied'
      }
      if (logFlags.verbose) instance.mainLogger.debug(`preApplyTransaction ${queueEntry.logID} post apply wrappedStates: ${utils.stringifyReduce(wrappedStates)}`);
      if (instance.stateManager.consensusLog) instance.mainLogger.debug(`preApplyTransaction ${queueEntry.logID} completed.`)
      if (logFlags.verbose && applyResponse != null) instance.mainLogger.debug(`preApplyTransaction ${queueEntry.logID}  post applyResponse: ${utils.stringifyReduce(applyResponse)}`);
    } catch (ex) {
      if (logFlags.error) instance.mainLogger.error(`preApplyTransaction failed id:${utils.makeShortHash(acceptedTX.txId)}: ` + ex.name + ': ' + ex.message + ' at ' + ex.stack)
      if (logFlags.error) instance.mainLogger.error(`preApplyTransaction failed id:${utils.makeShortHash(acceptedTX.txId)}  ${utils.stringifyReduce(acceptedTX)}`)
      instance.profiler.scopedProfileSectionEnd('apply_duration') // Ensure this ends in case of exception
      passedApply = false
      applyResult = ex.message
    } finally {
      instance.stateManager.fifoUnlock('accountModification', ourLockID)
      if (ourAccountLocks != null) {
        instance.stateManager.bulkFifoUnlockAccounts(uniqueKeys, ourAccountLocks)
      }
      if (logFlags.verbose) instance.mainLogger.debug(` preApplyTransaction FIFO unlock inner: ${utils.stringifyReduce(uniqueKeys)} ourLocks: ${utils.stringifyReduce(ourAccountLocks)}`)
    }

    if (logFlags.playback) instance.logger.playbackLogNote('tx_preapplied', `${acceptedTX.txId}`, `preApplyTransaction ${timestamp} `)
    if (logFlags.verbose) instance.mainLogger.debug(`preApplyTransaction ${timestamp}`)
    instance.txDebugMarkEndTime(queueEntry, 'preApplyTransaction')
    return {
      applied: true,
      passed: passedApply,
      applyResult: applyResult,
      reason: 'apply result',
      applyResponse: applyResponse,
    }
}

export async function _commitConsensedTransactionLogic(instance: TransactionQueue, queueEntry: QueueEntry): Promise<CommitConsensedTransactionResult> {
    let ourLockID = -1
    let accountDataList: string | unknown[]
    let uniqueKeys = []
    let ourAccountLocks = null
    const acceptedTX = queueEntry.acceptedTx
    let wrappedStates = instance.stateManager.useAccountWritesOnly ? {} : queueEntry.collectedData
    const localCachedData = queueEntry.localCachedData
    const keysResponse = queueEntry.txKeys
    const { timestamp, debugInfo } = keysResponse
    const applyResponse = queueEntry?.preApplyTXResult?.applyResponse
    const isGlobalModifyingTX = queueEntry.globalModification === true
    let savedSomething = false

    try {
      instance.profiler.profileSectionStart('commit-1-setAccount')
      if (logFlags.verbose) {
        instance.mainLogger.debug( `commitConsensedTransaction txId: ${queueEntry.logID}  ts:${timestamp} isGlobalModifyingTX:${isGlobalModifyingTX}  Applying! debugInfo: ${debugInfo}` )
        instance.mainLogger.debug( `commitConsensedTransaction  filter: ${utils.stringifyReduce(queueEntry.localKeys)}` )
        instance.mainLogger.debug(`commitConsensedTransaction  acceptedTX: ${utils.stringifyReduce(acceptedTX)}`)
        instance.mainLogger.debug( `commitConsensedTransaction  wrappedStates: ${utils.stringifyReduce(wrappedStates)}` )
        instance.mainLogger.debug( `commitConsensedTransaction  localCachedData: ${utils.stringifyReduce(localCachedData)}` )
        instance.mainLogger.debug(`commitConsensedTransaction  preApplyResponse: ${utils.stringifyReduce(queueEntry.preApplyTXResult.applyResponse)}`)
        instance.mainLogger.debug(`commitConsensedTransaction  queueEntry: ${utils.stringifyReduce(queueEntry)}`)
      }

      uniqueKeys = queueEntry.uniqueKeys
      if (logFlags.verbose && instance.stateManager.extendedRepairLogging) instance.mainLogger.debug(`commitConsensedTransaction FIFO lock outer: ${utils.stringifyReduce(uniqueKeys)} `)
      instance.setDebugLastAwaitedCallInner('commit this.stateManager.bulkFifoLockAccounts')
      ourAccountLocks = await instance.stateManager.bulkFifoLockAccounts(uniqueKeys)
      instance.setDebugLastAwaitedCallInner('commit this.stateManager.bulkFifoLockAccounts', DebugComplete.Completed)
      if (logFlags.verbose && instance.stateManager.extendedRepairLogging) instance.mainLogger.debug(`commitConsensedTransaction FIFO lock inner: ${utils.stringifyReduce(uniqueKeys)} ourLocks: ${utils.stringifyReduce(ourAccountLocks)}`)

      instance.setDebugLastAwaitedCallInner('commit this.stateManager.fifoLock')
      ourLockID = await instance.stateManager.fifoLock('accountModification')
      instance.setDebugLastAwaitedCallInner('commit this.stateManager.fifoLock', DebugComplete.Completed)

      if (logFlags.verbose && logFlags.console) console.log(`commitConsensedTransaction tx:${queueEntry.logID} ts:${timestamp} Applying!`)
      
      let stateTableResults = null
      let _accountdata = []
      if (applyResponse != null) {
        stateTableResults = applyResponse.stateTableResults
        _accountdata = applyResponse.accountData
      }
      accountDataList = _accountdata

      const writtenAccountsMap: WrappedResponses = {}
      if (applyResponse != null && applyResponse.accountWrites != null && applyResponse.accountWrites.length > 0) {
        const collectedData = queueEntry.collectedData
        if (logFlags.verbose && logFlags.console) console.log(`commitConsensedTransaction collectedData: ${utils.stringifyReduce(collectedData)}`)
        for (const writtenAccount of applyResponse.accountWrites) {
          writtenAccountsMap[writtenAccount.accountId] = writtenAccount.data
          writtenAccountsMap[writtenAccount.accountId].prevStateId = collectedData[writtenAccount.accountId] ? collectedData[writtenAccount.accountId].stateId : ''
          writtenAccountsMap[writtenAccount.accountId].prevDataCopy = collectedData[writtenAccount.accountId] ? utils.deepCopy(collectedData[writtenAccount.accountId].data) : {}
        }
        wrappedStates = writtenAccountsMap
        if (logFlags.verbose) instance.mainLogger.debug(`commitConsensedTransaction applyResponse.accountWrites tx:${queueEntry.logID} ts:${timestamp} accounts: ${utils.stringifyReduce(Object.keys(wrappedStates))}  `)
      }

      if (queueEntry.globalModification === false && instance.executeInOneShard && queueEntry.isInExecutionHome === false) {
        wrappedStates = {}
        for (const key of Object.keys(queueEntry.collectedFinalData)) {
          const finalAccount = queueEntry.collectedFinalData[key]
          // const accountId = finalAccount.accountId // Not used
          // const prevStateCalc = wrappedStates[accountId] ? wrappedStates[accountId].stateId : '' // Logic seems flawed if wrappedStates is empty
          if (logFlags.verbose) instance.mainLogger.debug(`commitConsensedTransaction collectedFinalData tx:${queueEntry.logID} ts:${timestamp} ${utils.makeShortHash(finalAccount.accountId)} preveStateID: ${finalAccount.prevStateId }`) // Removed vs expected
          wrappedStates[key] = finalAccount
        }
        if (logFlags.verbose) instance.mainLogger.debug(`commitConsensedTransaction collectedFinalData tx:${queueEntry.logID} ts:${timestamp} accounts: ${utils.stringifyReduce(Object.keys(wrappedStates))}  `)
      }

      const filter: AccountFilter = {}
      const nodeShardData: StateManagerTypes.shardFunctionTypes.NodeShardData = instance.stateManager.currentCycleShardData.nodeShardData
      if (applyResponse != null && applyResponse.accountWrites != null && applyResponse.accountWrites.length > 0) {
        for (const writtenAccount of applyResponse.accountWrites) {
          const isLocal = ShardFunctions.testAddressInRange(writtenAccount.accountId, nodeShardData.storedPartitions)
          if (isLocal) {
            filter[writtenAccount.accountId] = 1
          }
          if (logFlags.verbose) instance.mainLogger.debug(`commitConsensedTransaction  tx:${queueEntry.logID} ts:${timestamp} setWritefilter: ${isLocal}  acc:${writtenAccount.accountId} `)
        }
      }
      if (instance.executeInOneShard && applyResponse == null && queueEntry.collectedFinalData != null) {
        for (const writtenAccount of Object.values(wrappedStates)) {
          const isLocal = ShardFunctions.testAddressInRange(writtenAccount.accountId, nodeShardData.storedPartitions)
          if (isLocal) {
            filter[writtenAccount.accountId] = 1
          }
          if (logFlags.verbose) instance.mainLogger.debug(`commitConsensedTransaction queueEntry.collectedFinalData != null tx:${queueEntry.logID} ts:${timestamp} setWritefilter: ${isLocal}  acc:${writtenAccount.accountId} `)
        }
      }
      if (logFlags.verbose) instance.mainLogger.debug(`commitConsensedTransaction  post apply wrappedStates: ${utils.stringifyReduce(wrappedStates)}`)
      const note = `setAccountData: tx:${queueEntry.logID} in commitConsensedTransaction. `
      for (const key of Object.keys(queueEntry.localKeys)) {
        filter[key] = 1
      }

      instance.profiler.scopedProfileSectionStart('commit_setAccount')
      instance.setDebugLastAwaitedCallInner('this.stateManager.setAccount')
      savedSomething = await instance.stateManager.setAccount(
        wrappedStates,
        localCachedData,
        applyResponse,
        isGlobalModifyingTX,
        filter,
        note
      )
      instance.setDebugLastAwaitedCallInner('this.stateManager.setAccount', DebugComplete.Completed)
      queueEntry.accountDataSet = true
      instance.profiler.scopedProfileSectionEnd('commit_setAccount')
      
      if (logFlags.verbose) {
        instance.mainLogger.debug(`commitConsensedTransaction ${queueEntry.logID}  savedSomething: ${savedSomething}`)
        instance.mainLogger.debug(`commitConsensedTransaction  accountData[${(accountDataList as Array<unknown>)?.length}]: ${utils.stringifyReduce(accountDataList)}`)
        instance.mainLogger.debug(`commitConsensedTransaction  stateTableResults[${stateTableResults?.length}]: ${utils.stringifyReduce(stateTableResults)}`)
      }

      instance.profiler.profileSectionEnd('commit-1-setAccount')
      instance.profiler.profileSectionStart('commit-2-addAccountStatesAndTX')

      if (stateTableResults != null) {
        for (const stateT of stateTableResults) {
          let wrappedRespose = wrappedStates[stateT.accountId]
          if (wrappedRespose == null) {
            wrappedRespose = writtenAccountsMap[stateT.accountId]
          }
          stateT.stateBefore = wrappedRespose.prevStateId
          if (logFlags.verbose) {
            if (logFlags.console) console.log('writeStateTable ' + utils.makeShortHash(stateT.accountId) + ' before: ' + utils.makeShortHash(stateT.stateBefore) + ' after: ' + utils.makeShortHash(stateT.stateAfter) + ' txid: ' + utils.makeShortHash(acceptedTX.txId) + ' ts: ' + acceptedTX.timestamp)
            instance.mainLogger.debug('writeStateTable ' + utils.makeShortHash(stateT.accountId) + ' before: ' + utils.makeShortHash(stateT.stateBefore) + ' after: ' + utils.makeShortHash(stateT.stateAfter) + ' txid: ' + utils.makeShortHash(acceptedTX.txId) + ' ts: ' + acceptedTX.timestamp)
          }
        }
        instance.setDebugLastAwaitedCallInner('this.storage.addAccountStates')
        await instance.storage.addAccountStates(stateTableResults)
        instance.setDebugLastAwaitedCallInner('this.storage.addAccountStates', DebugComplete.Completed)
      }
      instance.storage.addAcceptedTransactions([acceptedTX])
      instance.profiler.profileSectionEnd('commit-2-addAccountStatesAndTX')
      instance.profiler.profileSectionStart('commit-3-transactionReceiptPass')
      instance.app.transactionReceiptPass(acceptedTX.data, wrappedStates, applyResponse, true)
      if (logFlags.verbose) console.log('transactionReceiptPass 2', acceptedTX.txId, queueEntry)
      instance.profiler.profileSectionEnd('commit-3-transactionReceiptPass')
    } catch (ex) {
      instance.statemanager_fatal(`commitConsensedTransaction_ex`, 'commitConsensedTransaction failed: ' + ex.name + ': ' + ex.message + ' at ' + ex.stack)
      if (logFlags.debug) instance.mainLogger.debug(`commitConsensedTransaction failed id:${utils.makeShortHash(acceptedTX.txId)}  ${utils.stringifyReduce(acceptedTX)}`)
      return { success: false }
    } finally {
      instance.stateManager.fifoUnlock('accountModification', ourLockID)
      if (ourAccountLocks != null) {
        instance.stateManager.bulkFifoUnlockAccounts(uniqueKeys, ourAccountLocks)
      }
      if (logFlags.verbose) instance.mainLogger.debug(`commitConsensedTransaction FIFO unlock inner: ${utils.stringifyReduce(uniqueKeys)} ourLocks: ${utils.stringifyReduce(ourAccountLocks)}`)
    }

    instance.profiler.profileSectionStart('commit-4-updateAccountsCopyTable')
    const dataResultsFullList = []
    for (const wrappedData of applyResponse.accountData) {
      if (wrappedData.localCache != null) {
        dataResultsFullList.push(wrappedData)
      }
    }
    const upgradedAccountDataList: Shardus.AccountData[] = dataResultsFullList as unknown as Shardus.AccountData[]
    const repairing = false
    instance.setDebugLastAwaitedCallInner('stateManager.updateAccountsCopyTable')
    await instance.stateManager.updateAccountsCopyTable(upgradedAccountDataList, repairing, timestamp)
    instance.setDebugLastAwaitedCallInner('stateManager.updateAccountsCopyTable', DebugComplete.Completed)

    if (queueEntry != null && queueEntry.transactionGroup != null && instance.p2p.getNodeId() === queueEntry.transactionGroup[0].id) {
      if (queueEntry.globalModification === false) {
        instance.stateManager.eventEmitter.emit('txProcessed')
      }
    }
    instance.stateManager.eventEmitter.emit('txApplied', acceptedTX)
    instance.profiler.profileSectionEnd('commit-4-updateAccountsCopyTable')
    instance.profiler.profileSectionStart('commit-5-stats')
    instance.stateManager.partitionStats.statsTxSummaryUpdate(queueEntry.cycleToRecordOn, queueEntry)
    for (const wrappedData of applyResponse.accountData) {
      const queueData = wrappedStates[wrappedData.accountId]
      if (queueData != null) {
        if (queueData.accountCreated) {
          instance.stateManager.partitionStats.statsDataSummaryInit(
            queueEntry.cycleToRecordOn,
            queueData.accountId,
            queueData.prevDataCopy,
            'commit'
          )
        }
        instance.stateManager.partitionStats.statsDataSummaryUpdate(
          queueEntry.cycleToRecordOn,
          queueData.prevDataCopy,
          wrappedData,
          'commit'
        )
      } else {
        if (logFlags.error) instance.mainLogger.error(`commitConsensedTransaction failed to get account data for stats ${wrappedData.accountId}`)
      }
    }
    instance.profiler.profileSectionEnd('commit-5-stats')
    return { success: true }
}

export function _routeAndQueueAcceptedTransactionLogic(
    instance: TransactionQueue,
    acceptedTx: AcceptedTx,
    sendGossip = true,
    sender: Shardus.Node | null,
    globalModification: boolean,
    noConsensus: boolean
  ): string | boolean {
    if (logFlags.playback) instance.logger.playbackLogNote('routeAndQueueAcceptedTransaction-debug', '', `sendGossip:${sendGossip} globalModification:${globalModification} noConsensus:${noConsensus} this.readyforTXs:${instance.stateManager.accountSync.readyforTXs} hasshardData:${instance.stateManager.currentCycleShardData != null} acceptedTx:${utils.stringifyReduce(acceptedTx)} `)
    if (instance.stateManager.accountSync.readyforTXs === false) {
      if (logFlags.verbose && logFlags.error) instance.mainLogger.error(`routeAndQueueAcceptedTransaction too early for TX: this.readyforTXs === false`)
      return 'notReady'
    }
    if (instance.stateManager.currentCycleShardData == null) {
      if (logFlags.verbose && logFlags.error) instance.mainLogger.error(`routeAndQueueAcceptedTransaction too early for TX: this.stateManager.currentCycleShardData == null`)
      return 'notReady'
    }

    try {
      instance.profiler.profileSectionStart('enqueue')
      if (instance.stateManager.accountGlobals.hasknownGlobals == false) {
        if (logFlags.verbose && logFlags.error) instance.mainLogger.error(`routeAndQueueAcceptedTransaction too early for TX: hasknownGlobals == false`)
        return 'notReady'
      }

      const keysResponse = acceptedTx.keys
      const timestamp = acceptedTx.timestamp
      const txId = acceptedTx.txId

      if (instance.stateManager.debugNoTxVoting === true) {
        noConsensus = true
      }

      if (configContext.stateManager.waitUpstreamTx) {
        const keysToCheck = []
        if (acceptedTx.shardusMemoryPatterns && acceptedTx.shardusMemoryPatterns.rw) {
          keysToCheck.push(...acceptedTx.shardusMemoryPatterns.rw)
        }
        if (acceptedTx.shardusMemoryPatterns && acceptedTx.shardusMemoryPatterns.wo) {
          keysToCheck.push(...acceptedTx.shardusMemoryPatterns.wo)
        }
        if (keysToCheck.length === 0) {
          const sourceKey = acceptedTx.keys.sourceKeys[0]
          if (sourceKey) keysToCheck.push(sourceKey) // Check if sourceKey exists
        }
        for (const key of keysToCheck) {
          const isAccountInQueue = instance.isAccountInQueue(key)
          if (isAccountInQueue) {
            nestedCountersInstance.countEvent('stateManager', `cancel enqueue, isAccountInQueue ${key} ${isAccountInQueue}`)
            return false
          }
        }
      }

      let cycleNumber = instance.stateManager.currentCycleShardData.cycleNumber
      if (Context.config.stateManager.deterministicTXCycleEnabled) {
        cycleNumber = CycleChain.getCycleNumberFromTimestamp(
          acceptedTx.timestamp - Context.config.stateManager.reduceTimeFromTxTimestamp,
          true,
          false
        )
        if (cycleNumber > instance.stateManager.currentCycleShardData.cycleNumber) {
          if (logFlags.error) instance.mainLogger.error(`routeAndQueueAcceptedTransaction derived txGroupCycle > currentCycleShardData.cycleNumber. txId:${txId} txGroupCycle:${cycleNumber} currentCycleShardData.cycleNumber:${instance.stateManager.currentCycleShardData.cycleNumber}`)
          nestedCountersInstance.countEvent('stateManager', 'derived txGroupCycle is larger than current cycle')
          if (Context.config.stateManager.fallbackToCurrentCycleFortxGroup) {
            cycleNumber = instance.stateManager.currentCycleShardData.cycleNumber
          }
        } else if (cycleNumber < instance.stateManager.currentCycleShardData.cycleNumber) {
          if (logFlags.error) instance.mainLogger.error(`routeAndQueueAcceptedTransaction derived txGroupCycle < currentCycleShardData.cycleNumber. txId:${txId} txGroupCycle:${cycleNumber} currentCycleShardData.cycleNumber:${instance.stateManager.currentCycleShardData.cycleNumber}`)
          nestedCountersInstance.countEvent('stateManager', 'derived txGroupCycle is less than current cycle')
        } else if (cycleNumber === instance.stateManager.currentCycleShardData.cycleNumber) {
          nestedCountersInstance.countEvent('stateManager', 'derived txGroupCycle is same as current cycle')
        }
      }

      instance.queueEntryCounter++
      const txQueueEntry: QueueEntry = {
        // ... (Initialize QueueEntry as in original, ensure all fields are present)
        gossipedCompleteData: false, eligibleNodeIdsToConfirm: new Set(), eligibleNodeIdsToVote: new Set(), acceptedTx: acceptedTx, txKeys: keysResponse, executionShardKey: null, isInExecutionHome: true, shardusMemoryPatternSets: null, noConsensus, collectedData: {}, collectedFinalData: {}, originalData: {}, beforeHashes: {}, homeNodes: {}, patchedOnNodes: new Map(), hasShardInfo: false, state: 'aging', dataCollected: 0, hasAll: false, entryID: instance.queueEntryCounter, localKeys: {}, localCachedData: {}, syncCounter: 0, didSync: false, queuedBeforeMainSyncComplete: false, didWakeup: false, syncKeys: [], logstate: '', requests: {}, globalModification: globalModification, collectedVotes: [], collectedVoteHashes: [], pendingConfirmOrChallenge: new Map(), pendingVotes: new Map(), waitForReceiptOnly: false, m2TimeoutReached: false, debugFail_voteFlip: false, debugFail_failNoRepair: false, requestingReceipt: false, cycleToRecordOn: -5, involvedPartitions: [], involvedGlobalPartitions: [], shortReceiptHash: '', requestingReceiptFailed: false, approximateCycleAge: cycleNumber, ourNodeInTransactionGroup: false, ourNodeInConsensusGroup: false, logID: '', txGroupDebug: '', uniqueWritableKeys: [], txGroupCycle: 0, updatedTxGroupCycle: 0, updatedTransactionGroup: null, receiptEverRequested: false, repairStarted: false, repairFailed: false, hasValidFinalData: false, pendingDataRequest: false, queryingFinalData: false, lastFinalDataRequestTimestamp: 0, newVotes: false, fromClient: sendGossip, gossipedReceipt: false, gossipedVote: false, gossipedConfirmOrChallenge: false, completedConfirmedOrChallenge: false, uniqueChallengesCount: 0, uniqueChallenges: {}, archived: false, ourTXGroupIndex: -1, ourExGroupIndex: -1, involvedReads: {}, involvedWrites: {}, txDebug: { enqueueHrTime: process.hrtime(), startTime: {}, endTime: {}, duration: {}, startTimestamp: {}, endTimestamp: {}, }, executionGroupMap: new Map(), executionNodeIdSorted: [], txSieveTime: 0, debug: {}, voteCastAge: 0, dataSharedTimestamp: 0, firstVoteReceivedTimestamp: 0, firstConfirmOrChallengeTimestamp: 0, lastVoteReceivedTimestamp: 0, lastConfirmOrChallengeTimestamp: 0, robustQueryVoteCompleted: false, robustQueryConfirmOrChallengeCompleted: false, acceptVoteMessage: true, acceptConfirmOrChallenge: true, accountDataSet: false, topConfirmations: new Set(), topVoters: new Set(), hasRobustConfirmation: false, sharedCompleteData: false, correspondingGlobalOffset: 0, isSenderWrappedTxGroup: {}, isNGT: instance.app.isNGT(acceptedTx.data?.tx),
      }
      instance.txDebugMarkStartTime(txQueueEntry, 'total_queue_time')
      instance.txDebugMarkStartTime(txQueueEntry, 'aging')

      const entry = instance.getQueueEntrySafe(acceptedTx.txId)
      if (entry) {
        return false
      }
      txQueueEntry.logID = utils.makeShortHash(acceptedTx.txId)
      instance.stateManager.debugTXHistory[txQueueEntry.logID] = 'enteredQueue'

      if (instance.app.canDebugDropTx(acceptedTx.data)) {
        if (instance.stateManager.testFailChance(instance.stateManager.loseTxChance, 'loseTxChance', txQueueEntry.logID, '', logFlags.verbose) === true) {
          return 'lost'
        }
        if (instance.stateManager.testFailChance(instance.stateManager.voteFlipChance, 'voteFlipChance', txQueueEntry.logID, '', logFlags.verbose) === true) {
          txQueueEntry.debugFail_voteFlip = true
        }
        if (globalModification === false && instance.stateManager.testFailChance(instance.stateManager.failNoRepairTxChance, 'failNoRepairTxChance', txQueueEntry.logID, '', logFlags.verbose) === true) {
          txQueueEntry.debugFail_failNoRepair = true
        }
      }

      try {
        const age = shardusGetTime() - timestamp
        const keyHash: StringBoolObjectMap = {}
        for (const key of txQueueEntry.txKeys.allKeys) {
          if (key == null) {
            if (logFlags.verbose && logFlags.error) instance.mainLogger.error(`routeAndQueueAcceptedTransaction key == null ${timestamp} not putting tx in queue.`)
            return false
          }
          keyHash[key] = true
        }
        txQueueEntry.uniqueKeys = Object.keys(keyHash)

        if (txQueueEntry.txKeys.allKeys == null || txQueueEntry.txKeys.allKeys.length === 0) {
          if (logFlags.verbose && logFlags.error) instance.mainLogger.error(`routeAndQueueAcceptedTransaction allKeys == null || allKeys.length === 0 ${timestamp} not putting tx in queue.`)
          return false
        }
        let cycleShardData = instance.stateManager.currentCycleShardData
        if (Context.config.stateManager.deterministicTXCycleEnabled) {
          txQueueEntry.txGroupCycle = cycleNumber
          cycleShardData = instance.stateManager.shardValuesByCycle.get(cycleNumber)
        }
        const activeNode = activeByIdOrder.find(node => node.id === Self.id)
        txQueueEntry.txDebug.cycleSinceActivated = activeNode ? cycleNumber - activeNode.activeCycle : -1;


        if (cycleShardData == null) {
          if (logFlags.error) instance.mainLogger.error(`routeAndQueueAcceptedTransaction logID:${txQueueEntry.logID} cycleShardData == null cycle:${cycleNumber} not putting tx in queue.`)
          nestedCountersInstance.countEvent('stateManager', 'routeAndQueueAcceptedTransaction cycleShardData == null')
          return false
        }
        instance.updateHomeInformation(txQueueEntry)

        if (txQueueEntry.globalModification === false && instance.executeInOneShard) {
          txQueueEntry.executionShardKey = txQueueEntry.txKeys.allKeys[0]
          if (logFlags.verbose) instance.mainLogger.debug(`routeAndQueueAcceptedTransaction set executionShardKey tx:${txQueueEntry.logID} ts:${timestamp} executionShardKey: ${utils.stringifyReduce(txQueueEntry.executionShardKey)}  `)
          const { homePartition } = ShardFunctions.addressToPartition(cycleShardData.shardGlobals, txQueueEntry.executionShardKey)
          const homeShardData = cycleShardData.parititionShardDataMap.get(homePartition)
          const unRankedExecutionGroup = homeShardData.homeNodes[0].consensusNodeForOurNodeFull.slice()
          if (instance.usePOQo || instance.useNewPOQ) {
            txQueueEntry.executionGroup = instance.orderNodesByRank(unRankedExecutionGroup, txQueueEntry)
          } else {
            txQueueEntry.executionGroup = unRankedExecutionGroup
          }
          txQueueEntry.executionNodeIdSorted = txQueueEntry.executionGroup.map((node) => node.id).sort()
          if (txQueueEntry.isInExecutionHome) {
            txQueueEntry.ourNodeRank = instance.computeNodeRank(cycleShardData.ourNode.id, txQueueEntry.acceptedTx.txId, txQueueEntry.acceptedTx.timestamp)
          }
          const minNodesToVote = 3
          const voterPercentage = configContext.stateManager.voterPercentage
          const numberOfVoters = Math.max(minNodesToVote, Math.floor(txQueueEntry.executionGroup.length * voterPercentage))
          txQueueEntry.eligibleNodeIdsToVote = new Set(txQueueEntry.executionGroup.slice(0, numberOfVoters).map((node) => node.id))
          txQueueEntry.eligibleNodeIdsToConfirm = new Set(txQueueEntry.executionGroup.slice(txQueueEntry.executionGroup.length - numberOfVoters).map((node) => node.id))
          txQueueEntry.correspondingGlobalOffset = parseInt(txId.slice(-4), 16)
          const ourID = cycleShardData.ourNode.id
          for (let idx = 0; idx < txQueueEntry.executionGroup.length; idx++) {
            const node = txQueueEntry.executionGroup[idx]
            txQueueEntry.executionGroupMap.set(node.id, node)
            if (node.id === ourID) {
              txQueueEntry.ourExGroupIndex = idx
              if (logFlags.seqdiagram) instance.seqLogger.info(`0x53455105 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: executor index ${txQueueEntry.ourExGroupIndex}:${(node as Shardus.NodeWithRank).rank}`)
            }
          }
          if (txQueueEntry.eligibleNodeIdsToConfirm.has(Self.id)) {
            if (logFlags.seqdiagram) instance.seqLogger.info(`0x53455105 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: confirmator`)
          }
          if (txQueueEntry.eligibleNodeIdsToVote.has(Self.id)) {
            if (logFlags.seqdiagram) instance.seqLogger.info(`0x53455105 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: voter`)
          }
          if (logFlags.seqdiagram) instance.seqLogger.info(`0x53455105 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: groupsize voters ${txQueueEntry.eligibleNodeIdsToConfirm.size}`)
          if (logFlags.seqdiagram) instance.seqLogger.info(`0x53455105 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: groupsize confirmators ${txQueueEntry.eligibleNodeIdsToConfirm.size}`)
          if (logFlags.seqdiagram) instance.seqLogger.info(`0x53455105 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: groupsize execution ${txQueueEntry.executionGroup.length}`)
          if (txQueueEntry.executionGroupMap.has(cycleShardData.ourNode.id) === false) {
            txQueueEntry.isInExecutionHome = false
          }
          if (logFlags.verbose) instance.mainLogger.debug(`routeAndQueueAcceptedTransaction info ${txQueueEntry.logID} isInExecutionHome:${txQueueEntry.isInExecutionHome} hasShardInfo:${txQueueEntry.hasShardInfo}`)
          if (logFlags.playback) instance.logger.playbackLogNote('routeAndQueueAcceptedTransaction', `routeAndQueueAcceptedTransaction info ${txQueueEntry.logID} isInExecutionHome:${txQueueEntry.isInExecutionHome} hasShardInfo:${txQueueEntry.hasShardInfo} executionShardKey:${utils.makeShortHash(txQueueEntry.executionShardKey)}`)
          if (instance.stateManager.consensusLog) instance.mainLogger.debug(`routeAndQueueAcceptedTransaction info ${txQueueEntry.logID} isInExecutionHome:${txQueueEntry.isInExecutionHome}`)
        }

        txQueueEntry.cycleToRecordOn = CycleChain.getCycleNumberFromTimestamp(timestamp)
        if (logFlags.verbose) console.log('Cycle number from timestamp', timestamp, txQueueEntry.cycleToRecordOn)
        if (txQueueEntry.cycleToRecordOn < 0) {
          nestedCountersInstance.countEvent('getCycleNumberFromTimestamp', 'caused Enqueue fail')
          if (logFlags.verbose && logFlags.error) instance.mainLogger.error(`routeAndQueueAcceptedTransaction failed to calculate cycle ${timestamp} error code:${txQueueEntry.cycleToRecordOn}`)
          return false
        }
        if (txQueueEntry.cycleToRecordOn == null) {
          instance.statemanager_fatal(`routeAndQueueAcceptedTransaction cycleToRecordOn==null`, `routeAndQueueAcceptedTransaction cycleToRecordOn==null  ${txQueueEntry.logID} ${timestamp}`)
        }
        if (logFlags.playback) instance.logger.playbackLogNote('shrd_queueInsertion_start', txQueueEntry.logID, `${txQueueEntry.logID} uniqueKeys:${utils.stringifyReduce(txQueueEntry.uniqueKeys)}  txKeys: ${utils.stringifyReduce(txQueueEntry.txKeys)} cycleToRecordOn:${txQueueEntry.cycleToRecordOn}`)

        for (const key of txQueueEntry.uniqueKeys) {
          if (globalModification === true) {
            if (instance.stateManager.accountGlobals.isGlobalAccount(key)) {
              if (logFlags.playback) instance.logger.playbackLogNote('globalAccountMap', `routeAndQueueAcceptedTransaction - has account:${utils.stringifyReduce(key)}`)
            } else {
              instance.stateManager.accountGlobals.setGlobalAccount(key)
              if (logFlags.playback) instance.logger.playbackLogNote('globalAccountMap', `routeAndQueueAcceptedTransaction - set account:${utils.stringifyReduce(key)}`)
            }
          }
        }
        txQueueEntry.queuedBeforeMainSyncComplete = instance.stateManager.accountSync.dataSyncMainPhaseComplete

        if (age > instance.stateManager.queueSitTime * 0.9) {
          if (txQueueEntry.didSync === true) {
            nestedCountersInstance.countEvent('stateManager', `enqueue old TX didSync === true queuedBeforeMainSyncComplete:${txQueueEntry.queuedBeforeMainSyncComplete}`)
          } else {
            nestedCountersInstance.countEvent('stateManager', `enqueue old TX didSync === false queuedBeforeMainSyncComplete:${txQueueEntry.queuedBeforeMainSyncComplete}`)
            if (txQueueEntry.queuedBeforeMainSyncComplete) {
              instance.statemanager_fatal(`routeAndQueueAcceptedTransaction_olderTX`, 'routeAndQueueAcceptedTransaction working on older tx ' + timestamp + ' age: ' + age)
              if (logFlags.playback) instance.logger.playbackLogNote('shrd_oldQueueInsertion', '', 'routeAndQueueAcceptedTransaction working on older tx ' + timestamp + ' age: ' + age)
            }
          }
        }

        for (const key of txQueueEntry.uniqueKeys) {
          const isGlobalAcc = instance.stateManager.accountGlobals.isGlobalAccount(key)
          if (globalModification === true && isGlobalAcc === true) {
            txQueueEntry.uniqueWritableKeys.push(key)
          }
          if (globalModification === false && isGlobalAcc === false) {
            txQueueEntry.uniqueWritableKeys.push(key)
          }
        }
        txQueueEntry.uniqueWritableKeys.sort()

        if (txQueueEntry.hasShardInfo) {
          const transactionGroup = instance.queueEntryGetTransactionGroup(txQueueEntry)
          if (logFlags.seqdiagram) instance.seqLogger.info(`0x53455105 ${shardusGetTime()} tx:${txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: groupsize transaction ${txQueueEntry.transactionGroup.length}`)
          if (txQueueEntry.ourNodeInTransactionGroup || txQueueEntry.didSync === true) {
            instance.queueEntryGetConsensusGroup(txQueueEntry)
            for (const accountId of txQueueEntry.uniqueKeys) {
              const homeNodeShardData = txQueueEntry.homeNodes[accountId]
              if(!homeNodeShardData) continue; // Defensive check
              const consensusGroupForAccount = homeNodeShardData.consensusNodeForOurNodeFull.map(n => n.id)
              const startAndEndIndices = instance.getStartAndEndIndexOfTargetGroup(consensusGroupForAccount, txQueueEntry.transactionGroup)
              const isWrapped = startAndEndIndices.endIndex < startAndEndIndices.startIndex
              if (isWrapped === false) continue
              const unwrappedEndIndex = startAndEndIndices.endIndex + txQueueEntry.transactionGroup.length
              for (let i = startAndEndIndices.startIndex; i < unwrappedEndIndex; i++) {
                if (i >= txQueueEntry.transactionGroup.length) {
                  const wrappedIndex = i - txQueueEntry.transactionGroup.length
                  txQueueEntry.isSenderWrappedTxGroup[txQueueEntry.transactionGroup[wrappedIndex].id] = i
                }
              }
            }
            if (logFlags.verbose) instance.mainLogger.debug(`routeAndQueueAcceptedTransaction isSenderWrappedTxGroup ${txQueueEntry.logID} ${utils.stringifyReduce(txQueueEntry.isSenderWrappedTxGroup)}`)
          }
          if (sendGossip && txQueueEntry.globalModification === false) {
            try {
              if (transactionGroup.length > 1) {
                instance.stateManager.debugNodeGroup(txId, timestamp, `share to neighbors`, transactionGroup)
                instance.p2p.sendGossipIn('spread_tx_to_group', acceptedTx, '', sender, transactionGroup, true, -1, acceptedTx.txId)
                if (logFlags.verbose) console.log( 'spread_tx_to_group', txId, txQueueEntry.executionGroup.length, txQueueEntry.conensusGroup.length, txQueueEntry.transactionGroup.length )
                instance.addOriginalTxDataToForward(txQueueEntry)
              }
            } catch (ex) {
              instance.statemanager_fatal(`txQueueEntry_ex`, 'txQueueEntry: ' + utils.stringifyReduce(txQueueEntry))
            }
          }
          if (txQueueEntry.didSync === false) {
            if (txQueueEntry.ourNodeInTransactionGroup === false && txQueueEntry.globalModification === false) {
              if (logFlags.playback) instance.logger.playbackLogNote('shrd_notInTxGroup', `${txQueueEntry.logID}`, ``)
              return 'out of range'
            } else {
              if (instance.config.debug.forwardTXToSyncingNeighbors && cycleShardData.hasSyncingNeighbors === true) {
                let send_spread_tx_to_group_syncing = true
                if (txQueueEntry.ourNodeInTransactionGroup === false) {
                  nestedCountersInstance.countEvent('transactionQueue', 'spread_tx_to_group_syncing-skipped2')
                  send_spread_tx_to_group_syncing = false
                } else if (txQueueEntry.ourTXGroupIndex > 0) {
                  const everyN = Math.max(1, Math.floor(txQueueEntry.transactionGroup.length * 0.4))
                  const nonce = parseInt('0x' + txQueueEntry.acceptedTx.txId.substring(0, 2))
                  const idxPlusNonce = txQueueEntry.ourTXGroupIndex + nonce
                  const idxModEveryN = idxPlusNonce % everyN
                  if (idxModEveryN > 0) {
                    nestedCountersInstance.countEvent('transactionQueue', 'spread_tx_to_group_syncing-skipped')
                    send_spread_tx_to_group_syncing = false
                  }
                }
                if (send_spread_tx_to_group_syncing) {
                  nestedCountersInstance.countEvent('transactionQueue', 'spread_tx_to_group_syncing-notSkipped')
                  if (txQueueEntry.globalModification === false) {
                    if (logFlags.verbose) instance.mainLogger.debug(`routeAndQueueAcceptedTransaction: spread_tx_to_group ${txQueueEntry.logID}`)
                    if (logFlags.playback) instance.logger.playbackLogNote("shrd_sync_tx", `${txQueueEntry.logID}`, `txts: ${timestamp} nodes:${utils.stringifyReduce(cycleShardData.syncingNeighborsTxGroup.map((x) => x.id))}`)
                    instance.stateManager.debugNodeGroup(txId, timestamp, `share to syncing neighbors`, cycleShardData.syncingNeighborsTxGroup)
                    if (logFlags.seqdiagram) {
                      for (const node of cycleShardData.syncingNeighborsTxGroup) {
                        if (logFlags.seqdiagram) instance.seqLogger.info(`0x53455102 ${shardusGetTime()} tx:${acceptedTx.txId} ${NodeList.activeIdToPartition.get(Self.id)}-->>${NodeList.activeIdToPartition.get(node.id)}: ${'spread_tx_to_group_syncing'}`)
                      }
                    }
                    const request = acceptedTx as unknown as SpreadTxToGroupSyncingReq; // Cast, ensure types are actually compatible
                    instance.p2p.tellBinary<SpreadTxToGroupSyncingReq>(
                      cycleShardData.syncingNeighborsTxGroup,
                      InternalRouteEnum.binary_spread_tx_to_group_syncing,
                      request,
                      serializeSpreadTxToGroupSyncingReq,
                      {}
                    )
                  } else {
                    if (logFlags.verbose) instance.mainLogger.debug(`routeAndQueueAcceptedTransaction: bugfix detected. avoid forwarding txs where globalModification == true ${txQueueEntry.logID}`)
                  }
                }
              }
            }
          }
        } else {
          throw new Error('missing shard info')
        }

        _computeTxSieveTimeLogic(instance, txQueueEntry)

        if (instance.config.debug.useShardusMemoryPatterns && acceptedTx.shardusMemoryPatterns != null && acceptedTx.shardusMemoryPatterns.ro != null) {
          txQueueEntry.shardusMemoryPatternSets = {
            ro: new Set(acceptedTx.shardusMemoryPatterns.ro),
            rw: new Set(acceptedTx.shardusMemoryPatterns.rw),
            wo: new Set(acceptedTx.shardusMemoryPatterns.wo),
            on: new Set(acceptedTx.shardusMemoryPatterns.on),
            ri: new Set(acceptedTx.shardusMemoryPatterns.ri),
          }
          nestedCountersInstance.countEvent('transactionQueue', 'shardusMemoryPatternSets included')
        } else {
          nestedCountersInstance.countEvent('transactionQueue', 'shardusMemoryPatternSets not included')
        }

        instance.queueEntryPrePush(txQueueEntry)
        instance.pendingTransactionQueue.push(txQueueEntry)
        instance.pendingTransactionQueueByID.set(txQueueEntry.acceptedTx.txId, txQueueEntry)
        if (logFlags.seqdiagram) instance.seqLogger.info(`0x53455105 ${shardusGetTime()} tx:${txQueueEntry.acceptedTx.txId} Note over ${NodeList.activeIdToPartition.get(Self.id)}: pendingQ`)
        if (logFlags.playback) instance.logger.playbackLogNote('shrd_txPreQueued', `${txQueueEntry.logID}`, `${txQueueEntry.logID} gm:${txQueueEntry.globalModification}`)
        instance.stateManager.tryStartTransactionProcessingQueue()
      } catch (err) { // Changed from error to err
        if (logFlags.playback) instance.logger.playbackLogNote('shrd_addtoqueue_rejected', `${txId}`, `AcceptedTransaction: ${txQueueEntry?.logID} ts: ${txQueueEntry?.txKeys?.timestamp} acc: ${utils.stringifyReduce(txQueueEntry?.txKeys?.allKeys)}`)
        instance.statemanager_fatal(`routeAndQueueAcceptedTransaction_ex`, 'routeAndQueueAcceptedTransaction failed: ' + errorToStringFull(err))
        throw err; // Re-throw original error
      }
      return true
    } finally {
      instance.profiler.profileSectionEnd('enqueue')
    }
}

export async function _queueEntryRequestMissingDataLogic(instance: TransactionQueue, queueEntry: QueueEntry): Promise<void> {
    if (instance.stateManager.currentCycleShardData == null) {
      return
    }
    if (queueEntry.pendingDataRequest === true) {
      return
    }
    queueEntry.pendingDataRequest = true
    nestedCountersInstance.countEvent('processing', 'queueEntryRequestMissingData-start')
    if (!queueEntry.requests) {
      queueEntry.requests = {}
    }
    if (queueEntry.uniqueKeys == null) {
      throw new Error('queueEntryRequestMissingData queueEntry.uniqueKeys == null')
    }
    const allKeys = []
    for (const key of queueEntry.uniqueKeys) {
      if (queueEntry.collectedData[key] == null) {
        allKeys.push(key)
      }
    }
    if (logFlags.playback) instance.logger.playbackLogNote('shrd_queueEntryRequestMissingData_start', `${queueEntry.acceptedTx.txId}`, `qId: ${queueEntry.entryID} AccountsMissing:${utils.stringifyReduce(allKeys)}`)

    for (const key of queueEntry.uniqueKeys) {
      if (queueEntry.collectedData[key] == null && queueEntry.requests[key] == null) {
        let keepTrying = true
        let triesLeft = 5
        while (keepTrying) {
          if (triesLeft <= 0) {
            keepTrying = false
            break
          }
          triesLeft--
          const homeNodeShardData = queueEntry.homeNodes[key]
          let node = null
          let randomIndex: number
          let foundValidNode = false
          let maxTries = 1000
          while (foundValidNode == false) {
            maxTries--
            if (!homeNodeShardData || !homeNodeShardData.consensusNodeForOurNodeFull || homeNodeShardData.consensusNodeForOurNodeFull.length === 0) {
                instance.statemanager_fatal(`queueEntryRequestMissingData`, `No consensus nodes for key ${key} in tx ${queueEntry.logID}`);
                break; // Break from while(foundValidNode)
            }
            randomIndex = instance.stateManager.getRandomInt(homeNodeShardData.consensusNodeForOurNodeFull.length - 1)
            node = homeNodeShardData.consensusNodeForOurNodeFull[randomIndex]
            if (maxTries < 0) {
              instance.statemanager_fatal(`queueEntryRequestMissingData`, `unable to find node to ask after 1000 tries tx:${queueEntry.logID} key: ${utils.makeShortHash(key)} ${utils.stringifyReduce(homeNodeShardData.consensusNodeForOurNodeFull.map((x) => (x != null ? x.id : 'null')))}`)
              break
            }
            if (node == null) continue
            if (node.id === instance.stateManager.currentCycleShardData.nodeShardData.node.id) continue
            foundValidNode = true
          }
          if (!foundValidNode || node == null) { // Check if we broke out due to no nodes or maxTries
              keepTrying = false; // Stop trying for this key
              break; // Break from while(keepTrying)
          }

          if (node.status != 'active' || potentiallyRemoved.has(node.id)) continue
          if (node === instance.stateManager.currentCycleShardData.ourNode) continue
          for (const key2 of allKeys) {
            queueEntry.requests[key2] = node
          }
          const relationString = ShardFunctions.getNodeRelation(homeNodeShardData, instance.stateManager.currentCycleShardData.ourNode.id)
          if (logFlags.playback) instance.logger.playbackLogNote('shrd_queueEntryRequestMissingData_ask', `${queueEntry.logID}`, `r:${relationString}   asking: ${utils.makeShortHash(node.id)} qId: ${queueEntry.entryID} AccountsMissing:${utils.stringifyReduce(allKeys)}`)
          if (instance.stateManager.isNodeValidForInternalMessage(node.id, 'queueEntryRequestMissingData', true, true) === false) {
            continue
          }
          const message: RequestStateForTxReq = {
            keys: allKeys,
            txid: queueEntry.acceptedTx.txId,
            timestamp: queueEntry.acceptedTx.timestamp,
          }
          let result: RequestStateForTxRespSerialized = null
          try {
            if (logFlags.seqdiagram) instance.seqLogger.info(`0x53455101 ${shardusGetTime()} tx:${message.txid} ${NodeList.activeIdToPartition.get(Self.id)}-->>${NodeList.activeIdToPartition.get(node.id)}: ${'request_state_for_tx'}`)
            result = (await instance.p2p.askBinary<RequestStateForTxReq, RequestStateForTxRespSerialized>(
              node,
              InternalRouteEnum.binary_request_state_for_tx,
              message,
              serializeRequestStateForTxReq,
              deserializeRequestStateForTxResp,
              {}
            )) as RequestStateForTxRespSerialized
          } catch (error) {
            if (logFlags.error) {
              if (error instanceof ResponseError) {
                instance.mainLogger.error(`ASK FAIL request_state_for_tx : exception encountered where the error is ${error}`)
              }
            }
            if (logFlags.error) instance.mainLogger.error('askBinary request_state_for_tx exception:', error)
            if (logFlags.error) instance.mainLogger.error(`askBinary error: ${InternalRouteEnum.binary_request_state_for_tx} asked to ${node.externalIp}:${node.externalPort}:${node.id}`)
          }
          if (result == null) {
            if (logFlags.verbose && logFlags.error) instance.mainLogger.error('ASK FAIL request_state_for_tx')
            if (logFlags.playback) instance.logger.playbackLogNote('shrd_queueEntryRequestMissingData_askfailretry', `${queueEntry.logID}`, `r:${relationString}   asking: ${utils.makeShortHash(node.id)} qId: ${queueEntry.entryID} `)
            continue
          }
          if (result.success !== true) {
            if (logFlags.error) instance.mainLogger.error('ASK FAIL queueEntryRequestMissingData 9')
            if (logFlags.playback) instance.logger.playbackLogNote('shrd_queueEntryRequestMissingData_askfailretry2', `${queueEntry.logID}`, `r:${relationString}   asking: ${utils.makeShortHash(node.id)} qId: ${queueEntry.entryID} `)
            continue
          }
          let dataCountReturned = 0
          const accountIdsReturned = []
          for (const data of result.stateList) {
            instance.queueEntryAddData(queueEntry, data)
            dataCountReturned++
            accountIdsReturned.push(utils.makeShortHash(data.accountId))
          }
          if (queueEntry.hasAll === true) {
            queueEntry.logstate = 'got all missing data'
          } else {
            queueEntry.logstate = 'failed to get data:' + queueEntry.hasAll
          }
          if (logFlags.playback) instance.logger.playbackLogNote('shrd_queueEntryRequestMissingData_result', `${queueEntry.logID}`, `r:${relationString}   result:${queueEntry.logstate} dataCount:${dataCountReturned} asking: ${utils.makeShortHash(node.id)} qId: ${queueEntry.entryID}  AccountsMissing:${utils.stringifyReduce(allKeys)} AccountsReturned:${utils.stringifyReduce(accountIdsReturned)}`)
          for (const key2 of allKeys) {
            delete queueEntry.requests[key2]
          }
          if (queueEntry.hasAll === true) {
            break
          }
          keepTrying = false
        }
      }
    }
    if (queueEntry.hasAll === true) {
      nestedCountersInstance.countEvent('processing', 'queueEntryRequestMissingData-success')
    } else {
      nestedCountersInstance.countEvent('processing', 'queueEntryRequestMissingData-failed')
      queueEntry.waitForReceiptOnly = true
      if(instance.config.stateManager.txStateMachineChanges){
        instance.updateTxState(queueEntry, 'await final data', 'missing data')
      } else {
        instance.updateTxState(queueEntry, 'consensing')
      }
      if (logFlags.debug) instance.mainLogger.debug(`queueEntryRequestMissingData failed to get all data for: ${queueEntry.logID}`)
    }
}

export async function _queueEntryRequestMissingReceiptLogic(instance: TransactionQueue, queueEntry: QueueEntry): Promise<void> {
    if (instance.stateManager.currentCycleShardData == null) {
      return
    }
    if (queueEntry.uniqueKeys == null) {
      throw new Error('queueEntryRequestMissingReceipt queueEntry.uniqueKeys == null')
    }
    if (queueEntry.requestingReceipt === true) {
      return
    }
    queueEntry.requestingReceipt = true
    queueEntry.receiptEverRequested = true
    if (logFlags.playback) instance.logger.playbackLogNote('shrd_queueEntryRequestMissingReceipt_start', `${queueEntry.acceptedTx.txId}`, `qId: ${queueEntry.entryID}`)
    const consensusGroup = instance.queueEntryGetConsensusGroup(queueEntry)
    instance.stateManager.debugNodeGroup(queueEntry.acceptedTx.txId, queueEntry.acceptedTx.timestamp, `queueEntryRequestMissingReceipt`, consensusGroup)
    
    let gotReceipt = false
    for (const key of queueEntry.uniqueKeys) {
      if (gotReceipt === true) {
        break
      }
      let keepTrying = true
      let triesLeft = Math.min(5, consensusGroup.length)
      let nodeIndex = 0
      while (keepTrying) {
        if (triesLeft <= 0) {
          keepTrying = false
          break
        }
        triesLeft--
        const homeNodeShardData = queueEntry.homeNodes[key]
        if (!homeNodeShardData) { // Defensive check
            if (logFlags.error) instance.mainLogger.error(`Missing homeNodeShardData for key ${key} in tx ${queueEntry.logID}`);
            keepTrying = false;
            break;
        }
        const node = consensusGroup[nodeIndex]
        nodeIndex++
        if (node == null) continue
        if (node.status != 'active' || potentiallyRemoved.has(node.id)) continue
        if (node === instance.stateManager.currentCycleShardData.ourNode) continue
        const relationString = ShardFunctions.getNodeRelation(homeNodeShardData, instance.stateManager.currentCycleShardData.ourNode.id)
        if (logFlags.playback) instance.logger.playbackLogNote('shrd_queueEntryRequestMissingReceipt_ask', `${queueEntry.logID}`, `r:${relationString}   asking: ${utils.makeShortHash(node.id)} qId: ${queueEntry.entryID} `)
        if (instance.stateManager.isNodeValidForInternalMessage(node.id, 'queueEntryRequestMissingReceipt', true, true) === false) {
          continue
        }
        const message: RequestReceiptForTxReqSerialized = { txid: queueEntry.acceptedTx.txId, timestamp: queueEntry.acceptedTx.timestamp }
        let result: RequestReceiptForTxRespSerialized = null
        try {
          if (logFlags.seqdiagram) instance.seqLogger.info(`0x53455101 ${shardusGetTime()} tx:${message.txid} ${NodeList.activeIdToPartition.get(Self.id)}-->>${NodeList.activeIdToPartition.get(node.id)}: ${'request_receipt_for_tx'}`)
          result = await instance.p2p.askBinary<RequestReceiptForTxReqSerialized, RequestReceiptForTxRespSerialized>(
            node,
            InternalRouteEnum.binary_request_receipt_for_tx,
            message,
            serializeRequestReceiptForTxReq,
            deserializeRequestReceiptForTxResp,
            {}
          )
        } catch (e) {
          instance.statemanager_fatal(`queueEntryRequestMissingReceipt`, `error: ${e.message}`)
          instance.mainLogger.error(`askBinary error: ${InternalRouteEnum.binary_request_receipt_for_tx} asked to ${node.externalIp}:${node.externalPort}:${node.id}`)
        }
        if (result == null) {
          if (logFlags.verbose && logFlags.error) instance.mainLogger.error(`ASK FAIL request_receipt_for_tx ${triesLeft} ${utils.makeShortHash(node.id)}`)
          if (logFlags.playback) instance.logger.playbackLogNote('shrd_queueEntryRequestMissingReceipt_askfailretry', `${queueEntry.logID}`, `r:${relationString}   asking: ${utils.makeShortHash(node.id)} qId: ${queueEntry.entryID} `)
          continue
        }
        if (result.success !== true) {
          if (logFlags.error) instance.mainLogger.error(`ASK FAIL queueEntryRequestMissingReceipt 9 ${triesLeft} ${utils.makeShortHash(node.id)}:${utils.makeShortHash(node.internalPort)} note:${result.note} txid:${queueEntry.logID}`)
          continue
        }
        if (logFlags.playback) instance.logger.playbackLogNote('shrd_queueEntryRequestMissingReceipt_result', `${queueEntry.logID}`, `r:${relationString}   result:${queueEntry.logstate} asking: ${utils.makeShortHash(node.id)} qId: ${queueEntry.entryID} result: ${utils.stringifyReduce(result)}`)
        if (result.success === true && result.receipt != null) {
          queueEntry.receivedSignedReceipt = result.receipt
          keepTrying = false
          gotReceipt = true
          instance.mainLogger.debug(`queueEntryRequestMissingReceipt got good receipt for: ${queueEntry.logID} from: ${utils.makeShortHash(node.id)}:${utils.makeShortHash(node.internalPort)}`)
        }
      }
      if (keepTrying == false) {
        break
      }
    }
    queueEntry.requestingReceipt = false
    if (gotReceipt === false) {
      queueEntry.requestingReceiptFailed = true
    }
}

export async function _getArchiverReceiptFromQueueEntryLogic(instance: TransactionQueue, queueEntry: QueueEntry): Promise<ArchiverReceipt> {
    if (!queueEntry.preApplyTXResult || !queueEntry.preApplyTXResult.applyResponse)
      return null as ArchiverReceipt

    const txId = queueEntry.acceptedTx.txId
    const timestamp = queueEntry.acceptedTx.timestamp
    const globalModification = queueEntry.globalModification

    let signedReceipt = null as SignedReceipt | P2PTypes.GlobalAccountsTypes.GlobalTxReceipt
    if (globalModification) {
      signedReceipt = getGlobalTxReceipt(
        queueEntry.acceptedTx.txId
      ) as P2PTypes.GlobalAccountsTypes.GlobalTxReceipt
    } else {
      signedReceipt = instance.stateManager.getSignedReceipt(queueEntry) as SignedReceipt
    }
    if (!signedReceipt) {
      nestedCountersInstance.countEvent("stateManager", "getArchiverReceiptFromQueueEntry no signedReceipt")
      console.log(`getArchiverReceiptFromQueueEntry: signedReceipt is null for txId: ${txId} timestamp: ${timestamp} globalModification: ${globalModification}`)
      return null as ArchiverReceipt
    }

    const accountsToAdd: { [accountId: string]: Shardus.AccountsCopy } = {}
    const beforeAccountsToAdd: { [accountId: string]: Shardus.AccountsCopy } = {}

    if (globalModification) {
      const globalReceipt = signedReceipt as P2PTypes.GlobalAccountsTypes.GlobalTxReceipt;
      if (globalReceipt.tx && globalReceipt.tx.addressHash != '' && !beforeAccountsToAdd[globalReceipt.tx.address]) {
        if (queueEntry.collectedData[globalReceipt.tx.address]?.stateId === globalReceipt.tx.addressHash) {
          const isGlobal = instance.stateManager.accountGlobals.isGlobalAccount(globalReceipt.tx.address) // Used address instead of addressHash
          const account = queueEntry.collectedData[globalReceipt.tx.address]
          const accountCopy = {
            accountId: account.accountId,
            data: account.data,
            hash: account.stateId,
            timestamp: account.timestamp,
            isGlobal,
          } as Shardus.AccountsCopy
          beforeAccountsToAdd[account.accountId] = accountCopy
        } else {
          console.log(`getArchiverReceiptFromQueueEntry: before stateId does not match addressHash for txId: ${txId} timestamp: ${timestamp} globalModification: ${globalModification}`)
        }
      }
    } else if (instance.config.stateManager.includeBeforeStatesInReceipts) {
      if (configContext.mode === 'debug' && configContext.debug.beforeStateFailChance > Math.random()) {
        for (const accountId in queueEntry.collectedData) {
          const account = queueEntry.collectedData[accountId]
          account.stateId = 'debugFail2'
        }
      }
      const fileredBeforeStateToSend = []
      const badBeforeStateAccounts = []
      for (const account of Object.values(queueEntry.collectedData)) {
        if (typeof instance.app.beforeStateAccountFilter !== 'function' || instance.app.beforeStateAccountFilter(account)) {
          fileredBeforeStateToSend.push(account.accountId)
        }
      }
      const localSignedReceipt = signedReceipt as SignedReceipt; // Cast for non-global
      for (const accountId of fileredBeforeStateToSend) {
        const index = localSignedReceipt.proposal.accountIDs.indexOf(accountId)
        if (index === -1) continue
        const account = queueEntry.collectedData[accountId]
        if (account == null) {
          badBeforeStateAccounts.push(accountId)
          continue
        }
        if (account.stateId !== localSignedReceipt.proposal.beforeStateHashes[index]) {
          badBeforeStateAccounts.push(accountId)
        }
      }
      if (badBeforeStateAccounts.length > 0) {
        nestedCountersInstance.countEvent('stateManager', 'badBeforeStateAccounts in getArchiverReceiptFromQueueEntry', badBeforeStateAccounts.length)
        const wrappedResponses: WrappedResponses = await instance.requestInitialData(queueEntry, badBeforeStateAccounts)
        if (wrappedResponses) { // Check if not null
            for (const accountId in wrappedResponses) {
              queueEntry.collectedData[accountId] = wrappedResponses[accountId]
            }
        }
      }
      for (const accountId of fileredBeforeStateToSend) {
        const account = queueEntry.collectedData[accountId]
        if (!account) continue; // Skip if account still not found
        const isGlobal = instance.stateManager.accountGlobals.isGlobalAccount(account.accountId)
        const accountCopy = {
          accountId: account.accountId,
          data: account.data,
          hash: account.stateId,
          timestamp: account.timestamp,
          isGlobal,
        } as Shardus.AccountsCopy
        beforeAccountsToAdd[account.accountId] = accountCopy
      }
    }

    let isAccountsMatchWithReceipt2 = true
    const accountWrites = queueEntry.preApplyTXResult?.applyResponse?.accountWrites
    const localSignedReceipt = signedReceipt as SignedReceipt; // Cast for non-global

    if (globalModification) {
      if (accountWrites === null || accountWrites.length === 0) {
        console.log('No account update in global Modification tx', txId, timestamp)
      }
    } else if (accountWrites != null && accountWrites.length === localSignedReceipt.proposal.accountIDs.length) {
      for (const account of accountWrites) {
        const indexInVote = localSignedReceipt.proposal.accountIDs.indexOf(account.accountId)
        if (localSignedReceipt.proposal.afterStateHashes[indexInVote] !== account.data.stateId) {
          isAccountsMatchWithReceipt2 = false
          break
        }
      }
    } else {
      isAccountsMatchWithReceipt2 = false
    }

    let finalAccounts = []
    let appReceiptData = queueEntry.preApplyTXResult?.applyResponse?.appReceiptData || null
    if (isAccountsMatchWithReceipt2) {
      finalAccounts = accountWrites
    } else if (!globalModification) { // Only request if not global and mismatch
      let success = false
      let count = 0
      const maxRetry = 3
      const nodesToAskKeys = localSignedReceipt.signaturePack?.map((signature) => signature.owner)
      while (success === false && count < maxRetry) {
        count++
        const requestedData = await instance.requestFinalData(queueEntry, localSignedReceipt.proposal.accountIDs, nodesToAskKeys, true)
        if (requestedData && requestedData.wrappedResponses && requestedData.appReceiptData) {
          success = true
          for (const accountId in requestedData.wrappedResponses) {
            finalAccounts.push(requestedData.wrappedResponses[accountId])
          }
          appReceiptData = requestedData.appReceiptData
        }
      }
    }

    for (const account of finalAccounts) {
      const isGlobal = instance.stateManager.accountGlobals.isGlobalAccount(account.accountId)
      const accountCopy = {
        accountId: account.accountId,
        data: account.data.data, // Assuming account.data is a WrappedResponse like structure
        timestamp: account.timestamp,
        hash: account.data.stateId,
        isGlobal,
      } as Shardus.AccountsCopy
      accountsToAdd[account.accountId] = accountCopy
    }
    
    const archiverReceipt: ArchiverReceipt = {
      tx: {
        originalTxData: queueEntry.acceptedTx.data,
        txId: queueEntry.acceptedTx.txId,
        timestamp: queueEntry.acceptedTx.timestamp,
      },
      signedReceipt,
      appReceiptData,
      beforeStates: [...Object.values(beforeAccountsToAdd)],
      afterStates: [...Object.values(accountsToAdd)],
      cycle: queueEntry.txGroupCycle,
      globalModification,
    }
    return archiverReceipt
}

export async function _requestFinalDataLogic(instance: TransactionQueue, queueEntry: QueueEntry, accountIds: string[], nodesToAskKeys: string[] | null = null, includeAppReceiptData = false): Promise<RequestFinalDataResp> {
    profilerInstance.profileSectionStart('requestFinalData')
    if (logFlags.debug) instance.mainLogger.debug(`requestFinalData: txid: ${queueEntry.logID} accountIds: ${utils.stringifyReduce(accountIds)}`);
    const message: RequestTxAndStateReq = { txid: queueEntry.acceptedTx.txId, accountIds, includeAppReceiptData } // Type assertion
    let success = false
    let successCount = 0
    let validAppReceiptData = includeAppReceiptData === false ? true : false

    for (const accountId of accountIds) {
      if (queueEntry.collectedFinalData[accountId] != null) {
        successCount++
      }
    }
    if (successCount === accountIds.length && includeAppReceiptData === false) {
      nestedCountersInstance.countEvent('stateManager', 'requestFinalDataAlreadyReceived')
      if (logFlags.debug) instance.mainLogger.debug(`requestFinalData: txid: ${queueEntry.logID} already received all data`)
      profilerInstance.profileSectionEnd('requestFinalData');
      return { wrappedResponses: queueEntry.collectedFinalData, appReceiptData: null }; // Return what we have
    }

    try {
      let nodeToAsk: Shardus.Node
      if (nodesToAskKeys && nodesToAskKeys.length > 0) {
        const randomIndex = Math.floor(Math.random() * nodesToAskKeys.length)
        const randomNodeToAskKey = nodesToAskKeys[randomIndex]
        nodeToAsk = byPubKey.get(randomNodeToAskKey)
      } else if (queueEntry.executionGroup && queueEntry.executionGroup.length > 0) { // Check if executionGroup exists
        const randomIndex = Math.floor(Math.random() * queueEntry.executionGroup.length)
        const randomExeNode = queueEntry.executionGroup[randomIndex]
        nodeToAsk = nodes.get(randomExeNode.id)
      }

      if (!nodeToAsk) {
        if (logFlags.error) instance.mainLogger.error('requestFinalData: could not find node from execution group or provided keys')
        throw new Error('requestFinalData: could not find node to ask')
      }

      if (logFlags.debug) instance.mainLogger.debug( `requestFinalData: txid: ${queueEntry.acceptedTx.txId} accountIds: ${utils.stringifyReduce( accountIds )}, asking node: ${nodeToAsk.id} ${nodeToAsk.externalPort} at timestamp ${shardusGetTime()}` )
      
      const requestMessage = message as RequestTxAndStateReq
      if (logFlags.seqdiagram) instance.seqLogger.info(`0x53455101 ${shardusGetTime()} tx:${queueEntry.acceptedTx.txId} ${NodeList.activeIdToPartition.get(Self.id)}-->>${NodeList.activeIdToPartition.get(nodeToAsk.id)}: ${'request_tx_and_state'}`)
      const response = await Comms.askBinary<RequestTxAndStateReq, RequestTxAndStateResp>(
        nodeToAsk,
        InternalRouteEnum.binary_request_tx_and_state,
        requestMessage,
        serializeRequestTxAndStateReq,
        deserializeRequestTxAndStateResp,
        {}
      )

      if (response && response.stateList && response.stateList.length > 0) {
        if (logFlags.debug) instance.mainLogger.debug(`requestFinalData: txid: ${queueEntry.logID} received data for ${response.stateList.length} accounts`)
      } else {
        if (logFlags.error) instance.mainLogger.error(`requestFinalData: txid: ${queueEntry.logID} response is null or empty stateList`)
        nestedCountersInstance.countEvent('stateManager', 'requestFinalData: failed: response or response.stateList null or statelist length 0')
        profilerInstance.profileSectionEnd('requestFinalData');
        return { wrappedResponses: {}, appReceiptData: null };
      }
      
      const currentSignedReceipt = instance.stateManager.getSignedReceipt(queueEntry); // Get it once
      if (!currentSignedReceipt) {
          if (logFlags.error) instance.mainLogger.error(`requestFinalData: txid: ${queueEntry.logID} signedReceipt is null, cannot verify response.`);
          profilerInstance.profileSectionEnd('requestFinalData');
          return { wrappedResponses: {}, appReceiptData: null };
      }

      for (const data of response.stateList) {
        if (data == null) {
          if (logFlags.error && logFlags.debug) instance.mainLogger.error(`requestFinalData data == null for tx ${queueEntry.logID}`);
          success = false
          break // No point continuing if one piece is null
        }
        const indexInVote = currentSignedReceipt.proposal.accountIDs.indexOf(data.accountId)
        if (indexInVote === -1) continue // Account not in proposal, skip
        const afterStateIdFromVote = currentSignedReceipt.proposal.afterStateHashes[indexInVote]
        if (data.stateId !== afterStateIdFromVote) {
          nestedCountersInstance.countEvent("stateManager", "requestFinalDataMismatch")
          continue // Data doesn't match proposal, skip
        }
        if (queueEntry.collectedFinalData[data.accountId] == null) {
          queueEntry.collectedFinalData[data.accountId] = data
          successCount++
          if (logFlags.debug) instance.mainLogger.debug(`requestFinalData: txid: ${queueEntry.logID} success accountId: ${data.accountId} stateId: ${data.stateId}`);
        }
      }
      if (includeAppReceiptData && response.appReceiptData) {
        const receivedAppReceiptDataHash = instance.crypto.hash(response.appReceiptData)
        if (currentSignedReceipt != null) { // Check again as it might have been set
          validAppReceiptData = receivedAppReceiptDataHash === currentSignedReceipt.proposal.appReceiptDataHash
        }
      }
      if (successCount === accountIds.length && validAppReceiptData === true) {
        success = true
        queueEntry.hasValidFinalData = true
        profilerInstance.profileSectionEnd('requestFinalData');
        return { wrappedResponses: queueEntry.collectedFinalData, appReceiptData: response.appReceiptData }
      } else {
        nestedCountersInstance.countEvent('stateManager', `requestFinalData: failed: did not get enough data: ${successCount} <  ${accountIds.length}`)
      }
    } catch (e) {
      nestedCountersInstance.countEvent('stateManager', 'requestFinalData: failed: Error')
      if (logFlags.error) instance.mainLogger.error(`requestFinalData: txid: ${queueEntry.logID} error: ${e.message}`)
    } finally {
      if (success === false) {
        nestedCountersInstance.countEvent('stateManager', 'requestFinalData: failed: success === false')
        if (logFlags.error) instance.mainLogger.error(`requestFinalData: txid: ${queueEntry.logID} failed. successCount: ${successCount} accountIds: ${accountIds.length}`);
      }
    }
    profilerInstance.profileSectionEnd('requestFinalData')
    return { wrappedResponses: {}, appReceiptData: null }; // Default return on failure
}

export async function _requestInitialDataLogic(instance: TransactionQueue, queueEntry: QueueEntry, accountIds: string[]): Promise<WrappedResponses> {
    profilerInstance.profileSectionStart('requestInitialData')
    instance.mainLogger.debug(`requestInitialData: txid: ${queueEntry.logID} accountIds: ${utils.stringifyReduce(accountIds)}`);
    const message: RequestTxAndStateReq = { txid: queueEntry.acceptedTx.txId, accountIds } // Type assertion
    // let success = false; // Not used
    let successCount = 0
    let retries = 0
    const maxRetry = 3
    const triedNodes = new Set<string>()

    if (queueEntry.executionGroup == null || queueEntry.executionGroup.length === 0) {
        instance.mainLogger.error(`requestInitialData: txid: ${queueEntry.logID} executionGroup