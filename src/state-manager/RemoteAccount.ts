import { logFlags } from '../logger'
import { nestedCountersInstance } from '../utils/nestedCounters'
import * as utils from '../utils'
import * as Comms from '../p2p/Comms'
import { InternalRouteEnum } from '../types/enum/InternalRouteEnum'
import {
  GetAccountQueueCountReq,
  serializeGetAccountQueueCountReq,
} from '../types/GetAccountQueueCountReq'
import {
  deserializeGetAccountQueueCountResp,
  GetAccountQueueCountResp,
} from '../types/GetAccountQueueCountResp'
import { 
  QueueCountsResult,
  GetAccountDataWithQueueHintsResp,
  WrappedResponses,
} from './state-manager-types'
import {
  GetAccountDataWithQueueHintsReqSerializable,
  serializeGetAccountDataWithQueueHintsReq,
} from '../types/GetAccountDataWithQueueHintsReq'
import {
  deserializeGetAccountDataWithQueueHintsResp,
  GetAccountDataWithQueueHintsRespSerializable,
} from '../types/GetAccountDataWithQueueHintsResp'
import * as NodeList from '../p2p/NodeList'
import * as ShardusTypes from '../shardus/shardus-types'
import { isServiceMode } from '../debug'
import * as ShardFunctions from '../state-manager/shardFunctions'
import { ResponseError } from '../types/ResponseError'
import { RequestAccountQueueCounts, QueueCountsResponse } from './state-manager-types'
import { P2P as P2PTypes } from '@shardeum-foundation/lib-types'

export const remoteAccountMethods = {
  async getLocalOrRemoteAccountQueueCount(address: string): Promise<QueueCountsResult> {
    let count: number = -1
    let committingAppData: unknown = undefined
    let account: unknown = undefined
    if (this.currentCycleShardData == null) {
      await this.waitForShardData()
    }
    if (this.currentCycleShardData == null) {
      throw new Error('getLocalOrRemoteAccount: network not ready')
    }
    let forceLocalGlobalLookup = false
    if (this.accountGlobals.isGlobalAccount(address)) {
      forceLocalGlobalLookup = true
    }

    let accountIsRemote = this.transactionQueue.isAccountRemote(address)
    if (forceLocalGlobalLookup) {
      accountIsRemote = false
    }

    if (accountIsRemote) {
      const maxRetry = 3
      let success = false
      let retryCount = 0
      const triedConsensusNodeIds: string[] = []

      while (success === false && retryCount < maxRetry) {
        retryCount += 1
        const randomConsensusNode = this.transactionQueue.getRandomConsensusNodeForAccount(
          address,
          triedConsensusNodeIds
        )
        if (randomConsensusNode == null) {
          this.statemanager_fatal(
            'getLocalOrRemoteAccountQueueCount',
            `No consensus node found for account ${address}, retry ${retryCount}`
          )
          continue // will retry another node if counts permit
        }
        // record already tried consensus node
        triedConsensusNodeIds.push(randomConsensusNode.id)

        // Node Precheck!
        if (
          this.isNodeValidForInternalMessage(
            randomConsensusNode.id,
            'getLocalOrRemoteAccountQueueCount',
            true,
            true,
            true,
            true
          ) === false
        ) {
          /* prettier-ignore */ if (logFlags.verbose) this.getAccountFailDump(address, `getLocalOrRemoteAccountQueueCount: isNodeValidForInternalMessage failed, retry ${retryCount}`)
          continue // will retry another node if counts permit
        }

        const message: RequestAccountQueueCounts = { accountIds: [address] }
        let r: QueueCountsResponse | false

        try {
          // if (this.config.p2p.useBinarySerializedEndpoints && this.config.p2p.getAccountQueueCountBinary) {
          const serialized_res = await this.p2p.askBinary(
            randomConsensusNode,
            InternalRouteEnum.binary_get_account_queue_count,
            message,
            serializeGetAccountQueueCountReq,
            deserializeGetAccountQueueCountResp,
            {}
          )
          r = serialized_res as QueueCountsResponse
          // } else {
          //   r = await this.p2p.ask(randomConsensusNode, 'get_account_queue_count', message)
          // }
        } catch (error) {
          /* prettier-ignore */ if (logFlags.error) this.mainLogger.error(`ASK FAIL getLocalOrRemoteAccountQueueCount: askBinary ex: ${error.message}`)
          r = null
        }

        if (!r) {
          if (logFlags.error) this.mainLogger.error('ASK FAIL getLocalOrRemoteAccountQueueCount r === false')
        }

        const result = r as QueueCountsResponse
        if (result != null && result.counts != null && result.counts.length > 0) {
          count = result.counts[0]
          committingAppData = result.committingAppData[0]
          if (this.config.stateManager.enableAccountFetchForQueueCounts) {
            account = result.accounts[0]
          }
          success = true
          /* prettier-ignore */ if (logFlags.verbose) console.log(`queue counts response: ${count} address:${utils.stringifyReduce(address)}`)
        } else {
          if (result == null) {
            /* prettier-ignore */ if (logFlags.verbose) this.getAccountFailDump(address, 'remote request missing data 2: result == null')
          } else if (result.counts == null) {
            /* prettier-ignore */ if (logFlags.verbose) this.getAccountFailDump(address, 'remote request missing data 2: result.counts == null ' + utils.stringifyReduce(result))
          } else if (result.counts.length <= 0) {
            /* prettier-ignore */ if (logFlags.verbose) this.getAccountFailDump(address, 'remote request missing data 2: result.counts.length <= 0 ' + utils.stringifyReduce(result))
          }
          /* prettier-ignore */ if (logFlags.verbose) console.log(`queue counts failed: ${utils.stringifyReduce(result)} address:${utils.stringifyReduce(address)}`)
        }
      }
    } else {
      // we are local!
      const queueCountResult = this.transactionQueue.getAccountQueueCount(address)
      count = queueCountResult.count
      committingAppData = queueCountResult.committingAppData
      if (this.config.stateManager.enableAccountFetchForQueueCounts) {
        const currentAccountData = await this.getLocalOrRemoteAccount(address)
        if (currentAccountData) {
          account = currentAccountData.data
        }
      }
      /* prettier-ignore */ if (logFlags.verbose) console.log(`queue counts local: ${count} address:${utils.stringifyReduce(address)}`)
    }

    return { count, committingAppData, account }
  },

  // todo support metadata so we can serve up only a portion of the account
  // todo 2? communicate directly back to client... could have security issue.
  // todo 3? require a relatively stout client proof of work
  async getLocalOrRemoteAccount(
    address: string,
    opts: {
      useRICache: boolean // enables the RI cache. enable only for immutable data
      canThrowException?: boolean
    } = { useRICache: false, canThrowException: false }
  ): Promise<ShardusTypes.WrappedDataFromQueue | null> {
    let wrappedAccount: ShardusTypes.WrappedDataFromQueue | null = null
    if (!isServiceMode()) {
      if (this.currentCycleShardData == null) {
        await this.waitForShardData()
      }
      // TSConversion since this should never happen due to the above function should we assert that the value is non null?.  Still need to figure out the best practice.
      if (this.currentCycleShardData == null) {
        throw new Error('getLocalOrRemoteAccount: network not ready')
      }
    }

    // If enabled, check the RI cache first
    if (opts.useRICache) {
      const riCacheResult = await this.app.getCachedRIAccountData([address])
      if (riCacheResult != null) {
        if (riCacheResult.length > 0) {
          nestedCountersInstance.countEvent('stateManager', 'getLocalOrRemoteAccount: RI cache hit')
          if (logFlags.verbose) this.mainLogger.debug(`getLocalOrRemoteAccount: RI cache hit for ${address}`)
          wrappedAccount = riCacheResult[0] as ShardusTypes.WrappedDataFromQueue
          return wrappedAccount
        }
      } else {
        nestedCountersInstance.countEvent('stateManager', 'getLocalOrRemoteAccount: RI cache miss')
      }
    }

    let forceLocalGlobalLookup = false

    if (this.accountGlobals.isGlobalAccount(address) || isServiceMode()) {
      forceLocalGlobalLookup = true
    }

    //it seems backwards that isServiceMode would treat the account as always remote, as it has access to all data locally
    let accountIsRemote = isServiceMode() ? true : this.transactionQueue.isAccountRemote(address)

    // hack to say we have all the data
    if (!isServiceMode()) {
      if (this.currentCycleShardData.nodes.length <= this.currentCycleShardData.shardGlobals.consensusRadius) {
        accountIsRemote = false
      }
    }
    if (forceLocalGlobalLookup) {
      accountIsRemote = false
    }

    if (accountIsRemote) {
      let randomConsensusNode: P2PTypes.NodeListTypes.Node
      const preCheckLimit = 5
      for (let i = 0; i < preCheckLimit; i++) {
        randomConsensusNode = this.transactionQueue.getRandomConsensusNodeForAccount(address)
        if (randomConsensusNode == null) {
          nestedCountersInstance.countEvent('getLocalOrRemoteAccount', `precheck: no consensus node found`)
          throw new Error(`getLocalOrRemoteAccount: no consensus node found`)
        }
        // Node Precheck!.  this check our internal records to find a good node to talk to.
        // it is worth it to look through the list if needed.
        if (
          this.isNodeValidForInternalMessage(
            randomConsensusNode.id,
            'getLocalOrRemoteAccount',
            true,
            true,
            true,
            true
          ) === false
        ) {
          //we got to the end of our tries?
          if (i >= preCheckLimit - 1) {
            /* prettier-ignore */ if (logFlags.verbose || logFlags.getLocalOrRemote) this.getAccountFailDump(address, 'getLocalOrRemoteAccount: isNodeValidForInternalMessage failed, no retry')
            //return null   ....better to throw an error
            if (opts.canThrowException) {
              nestedCountersInstance.countEvent('getLocalOrRemoteAccount', `precheck: out of nodes to try`)
              throw new Error(`getLocalOrRemoteAccount: no consensus nodes worth asking`)
            } else return null
          }
        } else {
          break
        }
      }

      const message = { accountIds: [address] }

      let r: GetAccountDataWithQueueHintsResp

      // if (
      //   this.config.p2p.useBinarySerializedEndpoints &&
      //   this.config.p2p.getAccountDataWithQueueHintsBinary
      // ) {
      try {
        const serialized_res = await this.p2p.askBinary(
          randomConsensusNode,
          InternalRouteEnum.binary_get_account_data_with_queue_hints,
          message,
          serializeGetAccountDataWithQueueHintsReq,
          deserializeGetAccountDataWithQueueHintsResp,
          {}
        )
        r = serialized_res as GetAccountDataWithQueueHintsResp
      } catch (er) {
        if (er instanceof ResponseError && logFlags.error) {
          this.mainLogger.error(
            `ASK FAIL getLocalOrRemoteAccount exception: ResponseError encountered. Code: ${er.Code}, AppCode: ${er.AppCode}, Message: ${er.Message}`
          )
        }
        if (logFlags.verbose || logFlags.getLocalOrRemote) this.mainLogger.error('askBinary', er)
        if (opts.canThrowException) {
          throw er
        } else {
          nestedCountersInstance.countEvent('getLocalOrRemoteAccount', `askBinary ex: ${er?.message}`)
        }
      }
      // } else {
      // r = await this.p2p.ask(randomConsensusNode, 'get_account_data_with_queue_hints', message)
      // }

      if (!r) {
        if (logFlags.error || logFlags.getLocalOrRemote)
          this.mainLogger.error('ASK FAIL getLocalOrRemoteAccount r === false')
        if (opts.canThrowException) throw new Error(`getLocalOrRemoteAccount: remote node had an exception`)
      }

      const result = r as GetAccountDataWithQueueHintsResp
      if (result != null && result.accountData != null && result.accountData.length > 0) {
        wrappedAccount = result.accountData[0]
        if (wrappedAccount == null) {
          if (logFlags.verbose || logFlags.getLocalOrRemote)
            this.getAccountFailDump(address, 'remote result.accountData[0] == null')
          nestedCountersInstance.countEvent('getLocalOrRemoteAccount', `remote result.accountData[0] == null`)
        }
        return wrappedAccount
      } else {
        //these cases probably should throw an error to, but dont wont to over prescribe the format yet
        //if the remote node has a major breakdown it should return false
        if (result == null) {
          /* prettier-ignore */ if (logFlags.verbose || logFlags.getLocalOrRemote) this.getAccountFailDump(address, 'remote request missing data: result == null')
          nestedCountersInstance.countEvent('getLocalOrRemoteAccount', `remote else.. result == null`)
        } else if (result.accountData == null) {
          /* prettier-ignore */ if (logFlags.verbose || logFlags.getLocalOrRemote) this.getAccountFailDump(address, 'remote request missing data: result.accountData == null ' + utils.stringifyReduce(result))
          nestedCountersInstance.countEvent('getLocalOrRemoteAccount', `remote else.. result.accountData == null`)
        } else if (result.accountData.length <= 0) {
          /* prettier-ignore */ if (logFlags.verbose || logFlags.getLocalOrRemote) this.getAccountFailDump(address, 'remote request missing data: result.accountData.length <= 0 ' + utils.stringifyReduce(result))
          nestedCountersInstance.countEvent('getLocalOrRemoteAccount', `remote else.. result.accountData.length <= 0 `)
        }
      }
    } else {
      // we are local!
      const accountData = await this.app.getAccountDataByList([address])
      if (accountData != null) {
        for (const wrappedAccountEntry of accountData) {
          // We are going to add in new data here, which upgrades the account wrapper to a new type.
          const expandedRef = wrappedAccountEntry as ShardusTypes.WrappedDataFromQueue
          expandedRef.seenInQueue = false

          if (this.lastSeenAccountsMap != null) {
            const queueEntry = this.lastSeenAccountsMap[expandedRef.accountId]
            if (queueEntry != null) {
              expandedRef.seenInQueue = true
            }
          }
          wrappedAccount = expandedRef
        }
      } else {
        //this should probably throw as we expect a [] for the real empty case
        //avoiding too many changes
        if (logFlags.verbose || logFlags.getLocalOrRemote)
          this.getAccountFailDump(address, 'getAccountDataByList() returned null')
        nestedCountersInstance.countEvent('getLocalOrRemoteAccount', `localload: getAccountDataByList() returned null`)
        return null
      }
      // there must have been an issue in the past, but for some reason we are checking the first element in the array now.
      if (accountData[0] == null) {
        if (logFlags.verbose || logFlags.getLocalOrRemote) this.getAccountFailDump(address, 'accountData[0] == null')
        nestedCountersInstance.countEvent('getLocalOrRemoteAccount', `localload: accountData[0] == null`)
      }
      if (accountData.length > 1 || accountData.length == 0) {
        /* prettier-ignore */ if (logFlags.verbose || logFlags.getLocalOrRemote) this.getAccountFailDump(address, `getAccountDataByList() returned wrong element count: ${accountData}`)
        nestedCountersInstance.countEvent(
          'getLocalOrRemoteAccount',
          `localload: getAccountDataByList() returned wrong element count`
        )
      }
      return wrappedAccount
    }
    return null
  },

  getAccountFailDump(address: string, message: string) {
    // this.currentCycleShardData
    /* prettier-ignore */ if (logFlags.playback) this.logger.playbackLogNote('getAccountFailDump', ` `, `${utils.makeShortHash(address)} ${message} `)
  },

  // HOMENODEMATHS is this used by any apps? it is not used by shardus
  async getRemoteAccount(address: string) {
    let wrappedAccount: unknown

    await this.waitForShardData()
    // TSConversion since this should never happen due to the above function should we assert that the value is non null?.  Still need to figure out the best practice.
    if (this.currentCycleShardData == null) {
      throw new Error('getRemoteAccount: network not ready')
    }

    const homeNode = ShardFunctions.findHomeNode(
      this.currentCycleShardData.shardGlobals,
      address,
      this.currentCycleShardData.parititionShardDataMap
    )
    if (homeNode == null) {
      throw new Error(`getRemoteAccount: no home node found`)
    }

    // Node Precheck!  TODO implement retry
    if (this.isNodeValidForInternalMessage(homeNode.node.id, 'getRemoteAccount', true, true) === false) {
      /* prettier-ignore */ if (logFlags.error) this.mainLogger.error('getRemoteAccount: isNodeValidForInternalMessage failed, no retry yet')
      return null
    }

    const message = { accountIds: [address] }
    let result: GetAccountDataWithQueueHintsResp
    // if (this.config.p2p.useBinarySerializedEndpoints && this.config.p2p.getAccountDataWithQueueHintsBinary) {
    try {
      const serialized_res = await this.p2p.askBinary(
        homeNode.node,
        InternalRouteEnum.binary_get_account_data_with_queue_hints,
        message,
        serializeGetAccountDataWithQueueHintsReq,
        deserializeGetAccountDataWithQueueHintsResp,
        {}
      )
      result = serialized_res as GetAccountDataWithQueueHintsResp
    } catch (er) {
      if (er instanceof ResponseError && logFlags.error) {
        this.mainLogger.error(
          `ASK FAIL getRemoteAccount exception: ResponseError encountered. Code: ${er.Code}, AppCode: ${er.AppCode}, Message: ${er.Message}`
        )
      } else if (logFlags.verbose) this.mainLogger.error('ASK FAIL getRemoteAccount exception:', er)
      return null
    }
    // } else {
    // result = await this.p2p.ask(homeNode.node, 'get_account_data_with_queue_hints', message)
    // }

    if (!result) {
      if (logFlags.error) this.mainLogger.error('ASK FAIL getRemoteAccount result === false')
    }
    if (result === null) {
      if (logFlags.error) this.mainLogger.error('ASK FAIL getRemoteAccount result === null')
    }
    if (result != null && result.accountData != null && result.accountData.length > 0) {
      wrappedAccount = result.accountData[0]
      return wrappedAccount
    }

    return null
  }
}