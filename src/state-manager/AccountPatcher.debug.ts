import * as utils from '../utils'
import { Utils } from '@shardeum-foundation/lib-types'
import { Response } from 'express-serve-static-core'

interface Line {
  raw: string
  file: {
    owner: string
  }
}

export const debugMethods = {
  /**
   * processShardDump
   * debug only code to create a shard report.
   * @param stream
   * @param lines
   */
  processShardDump(
    stream: Response<unknown, Record<string, unknown>, number>,
    lines: Line[]
  ): { allPassed: boolean; allPassed2: boolean } {
    const dataByParition = new Map()

    const rangesCovered = []
    const nodesListsCovered = []
    const nodeLists = []
    let newestCycle = -1
    const partitionObjects = []
    for (const line of lines) {
      const index = line.raw.indexOf('{"allNodeIds')
      if (index >= 0) {
        const partitionStr = line.raw.slice(index)
        //this.generalLog(string)
        let partitionObj: { cycle: number; owner: string }
        try {
          partitionObj = Utils.safeJsonParse(partitionStr)
        } catch (error) {
          this.mainLogger.error('error parsing partitionObj', error, partitionStr)
          continue
        }

        if (newestCycle > 0 && partitionObj.cycle != newestCycle) {
          stream.write(
            `wrong cycle for node: ${line.file.owner} reportCycle:${newestCycle} thisNode:${partitionObj.cycle} \n`
          )
          continue
        }
        partitionObjects.push(partitionObj)

        if (partitionObj.cycle > newestCycle) {
          newestCycle = partitionObj.cycle
        }
        partitionObj.owner = line.file.owner //line.raw.slice(0, index)
      }
    }

    for (const partitionObj of partitionObjects) {
      // we only want data for nodes that were active in the latest cycle.
      if (partitionObj.cycle === newestCycle) {
        for (const partition of partitionObj.partitions) {
          let results = dataByParition.get(partition.parititionID)
          if (results == null) {
            results = []
            dataByParition.set(partition.parititionID, results)
          }
          results.push({
            owner: partitionObj.owner,
            accounts: partition.accounts,
            ownerId: partitionObj.rangesCovered.id,
            accounts2: partition.accounts2,
            partitionHash2: partition.partitionHash2,
          })
        }
        rangesCovered.push(partitionObj.rangesCovered)
        nodesListsCovered.push(partitionObj.nodesCovered)
        nodeLists.push(partitionObj.allNodeIds)
      }
    }

    // need to only count stuff from the newestCycle.

    // /////////////////////////////////////////////////
    // compare partition data: old system with data manual queried from app
    let allPassed = true
    // let uniqueVotesByPartition = new Array(numNodes).fill(0)
    for (const [key, value] of dataByParition) {
      const results = value
      const votes = {}
      for (const entry of results) {
        if (entry.accounts.length === 0) {
          // new settings allow for not using accounts from sql
          continue
        }
        entry.accounts.sort(function (a: { id: number }, b: { id: number }) {
          return a.id === b.id ? 0 : a.id < b.id ? -1 : 1
        })
        const string = utils.stringifyReduce(entry.accounts)
        let voteEntry = votes[string] // eslint-disable-line security/detect-object-injection
        if (voteEntry == null) {
          voteEntry = {}
          voteEntry.voteCount = 0
          voteEntry.ownerIds = []
          votes[string] = voteEntry // eslint-disable-line security/detect-object-injection
        }
        voteEntry.voteCount++
        votes[string] = voteEntry // eslint-disable-line security/detect-object-injection

        voteEntry.ownerIds.push(entry.ownerId)
      }
      for (const key2 of Object.keys(votes)) {
        const voteEntry = votes[key2] // eslint-disable-line security/detect-object-injection
        let voters = ''
        if (key2 !== '[]') {
          voters = `---voters:${Utils.safeStringify(voteEntry.ownerIds)}`
        }

        stream.write(`partition: ${key}  votes: ${voteEntry.voteCount} values: ${key2} \t\t\t${voters}\n`)
        // stream.write(`            ---voters: ${JSON.stringify(voteEntry.ownerIds)}\n`)
      }
      const numUniqueVotes = Object.keys(votes).length
      if (numUniqueVotes > 2 || (numUniqueVotes > 1 && votes['[]'] == null)) {
        allPassed = false
        stream.write(`partition: ${key} failed.  Too many different version of data: ${numUniqueVotes} \n`)
      }
    }
    stream.write(`partition tests all passed: ${allPassed}\n`)
    // rangesCovered

    // /////////////////////////////////////////////////
    // compare partition data 2: new system using the state manager cache
    let allPassed2 = true
    // let uniqueVotesByPartition = new Array(numNodes).fill(0)
    for (const [key, value] of dataByParition) {
      const results = value
      const votes = {}
      for (const entry of results) {
        // no account sort, we expect this to have a time sort!
        // entry.accounts.sort(function (a, b) { return a.id === b.id ? 0 : a.id < b.id ? -1 : 1 })
        const fullString = utils.stringifyReduce(entry.accounts2)
        let string = entry.partitionHash2
        if (string === undefined) {
          string = '[]'
        }

        let voteEntry = votes[string] // eslint-disable-line security/detect-object-injection
        if (voteEntry == null) {
          voteEntry = {}
          voteEntry.voteCount = 0
          voteEntry.ownerIds = []
          voteEntry.fullString = fullString
          votes[string] = voteEntry // eslint-disable-line security/detect-object-injection
        }
        voteEntry.voteCount++
        votes[string] = voteEntry // eslint-disable-line security/detect-object-injection

        voteEntry.ownerIds.push(entry.ownerId)
      }
      for (const key2 of Object.keys(votes)) {
        const voteEntry = votes[key2] // eslint-disable-line security/detect-object-injection
        let voters = ''
        if (key2 !== '[]') {
          voters = `---voters:${Utils.safeStringify(voteEntry.ownerIds)}`
        }

        stream.write(
          `partition: ${key}  votes: ${voteEntry.voteCount} values: ${key2} \t\t\t${voters}\t -details:${voteEntry.fullString}   \n`
        )
        // stream.write(`            ---voters: ${JSON.stringify(voteEntry.ownerIds)}\n`)
      }
      const numUniqueVotes = Object.keys(votes).length
      if (numUniqueVotes > 2 || (numUniqueVotes > 1 && votes['[]'] == null)) {
        allPassed2 = false
        stream.write(`partition: ${key} failed.  Too many different version of data: ${numUniqueVotes} \n`)
      }
    }

    stream.write(`partition tests all passed: ${allPassed2}\n`)

    rangesCovered.sort(function (a, b) {
      return a.id === b.id ? 0 : a.id < b.id ? -1 : 1
    })

    const isStored = function (i: number, rangeCovered: { stMin: number; stMax: number }): boolean {
      const key = i
      const minP = rangeCovered.stMin
      const maxP = rangeCovered.stMax
      if (minP === maxP) {
        if (i !== minP) {
          return false
        }
      } else if (maxP > minP) {
        // are we outside the min to max range
        if (key < minP || key > maxP) {
          return false
        }
      } else {
        // are we inside the min to max range (since the covered rage is inverted)
        if (key > maxP && key < minP) {
          return false
        }
      }
      return true
    }
    const isConsensus = function (i: number, rangeCovered: { cMin: number; cMax: number }): boolean {
      const key = i
      const minP = rangeCovered.cMin
      const maxP = rangeCovered.cMax
      if (minP === maxP) {
        if (i !== minP) {
          return false
        }
      } else if (maxP > minP) {
        // are we outside the min to max range
        if (key < minP || key > maxP) {
          return false
        }
      } else {
        // are we inside the min to max range (since the covered rage is inverted)
        if (key > maxP && key < minP) {
          return false
        }
      }
      return true
    }

    for (const range of rangesCovered) {
      let partitionGraph = ''
      for (let i = 0; i < range.numP; i++) {
        const isC = isConsensus(i, range)
        const isSt = isStored(i, range)

        if (i === range.hP) {
          partitionGraph += 'H'
        } else if (isC && isSt) {
          partitionGraph += 'C'
        } else if (isC) {
          partitionGraph += '!'
        } else if (isSt) {
          partitionGraph += 'e'
        } else {
          partitionGraph += '_'
        }
      }

      stream.write(
        `node: ${range.id} ${range.ipPort}\tgraph: ${partitionGraph}\thome: ${range.hP}   data:${Utils.safeStringify(
          range
        )}\n`
      )
    }
    stream.write(`\n\n`)
    nodesListsCovered.sort(function (a, b) {
      return a.id === b.id ? 0 : a.id < b.id ? -1 : 1
    })
    for (const nodesCovered of nodesListsCovered) {
      let partitionGraph = ''
      const consensusMap = {}
      const storedMap = {}
      for (const entry of nodesCovered.consensus) {
        consensusMap[entry.idx] = { hp: entry.hp }
      }
      for (const entry of nodesCovered.stored) {
        storedMap[entry.idx] = { hp: entry.hp }
      }

      for (let i = 0; i < nodesCovered.numP; i++) {
        const isC = consensusMap[i] != null // eslint-disable-line security/detect-object-injection
        const isSt = storedMap[i] != null // eslint-disable-line security/detect-object-injection
        if (i === nodesCovered.idx) {
          partitionGraph += 'O'
        } else if (isC && isSt) {
          partitionGraph += 'C'
        } else if (isC) {
          partitionGraph += '!'
        } else if (isSt) {
          partitionGraph += 'e'
        } else {
          partitionGraph += '_'
        }
      }

      stream.write(
        `node: ${nodesCovered.id} ${nodesCovered.ipPort}\tgraph: ${partitionGraph}\thome: ${
          nodesCovered.hP
        } data:${Utils.safeStringify(nodesCovered)}\n`
      )
    }
    stream.write(`\n\n`)
    for (const list of nodeLists) {
      stream.write(`${Utils.safeStringify(list)} \n`)
    }

    return { allPassed, allPassed2 }
  }
}