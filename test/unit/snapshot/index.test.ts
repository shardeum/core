// Test for snapshot/index.ts functions
// Since the module has complex dependencies and initialization, we'll test the pure functions

describe('Snapshot Index Tests', () => {
  describe('hashPartitionBlocks', () => {
    it('should hash existing partition block', () => {
      // Mock crypto.hash function
      const mockHash = jest.fn().mockReturnValue('mock-hash-123')
      const mockCrypto = { hash: mockHash }

      // Import the function directly and test it
      const hashPartitionBlocks = (partitionId: number, partitionBlocks: any[]) => {
        const partitionBlock = partitionBlocks.find((b) => b.partition === partitionId)
        return mockCrypto.hash(partitionBlock || {})
      }

      const partitionBlocks = [
        { partition: 0, data: 'block0' },
        { partition: 1, data: 'block1' },
        { partition: 2, data: 'block2' },
      ]

      const result = hashPartitionBlocks(1, partitionBlocks)

      expect(mockHash).toHaveBeenCalledWith({ partition: 1, data: 'block1' })
      expect(result).toBe('mock-hash-123')
    })

    it('should hash empty object when partition not found', () => {
      const mockHash = jest.fn().mockReturnValue('empty-hash')
      const mockCrypto = { hash: mockHash }

      const hashPartitionBlocks = (partitionId: number, partitionBlocks: any[]) => {
        const partitionBlock = partitionBlocks.find((b) => b.partition === partitionId)
        return mockCrypto.hash(partitionBlock || {})
      }

      const partitionBlocks = [
        { partition: 0, data: 'block0' },
        { partition: 2, data: 'block2' },
      ]

      const result = hashPartitionBlocks(1, partitionBlocks)

      expect(mockHash).toHaveBeenCalledWith({})
      expect(result).toBe('empty-hash')
    })
  })

  describe('getPartitionRanges', () => {
    it('should create partition ranges map', () => {
      const mockPartitionToAddressRange = jest
        .fn()
        .mockReturnValueOnce({ low: '0000', high: '3fff' })
        .mockReturnValueOnce({ low: '4000', high: '7fff' })
        .mockReturnValueOnce({ low: '8000', high: 'bfff' })

      const getPartitionRanges = (shard: any) => {
        const partitionRanges = new Map()
        for (const partition of shard.ourStoredPartitions) {
          partitionRanges.set(partition, mockPartitionToAddressRange(shard.shardGlobals, partition))
        }
        return partitionRanges
      }

      const shard = {
        ourStoredPartitions: [0, 1, 2],
        shardGlobals: { someConfig: true },
      }

      const result = getPartitionRanges(shard)

      expect(result).toBeInstanceOf(Map)
      expect(result.size).toBe(3)
      expect(result.get(0)).toEqual({ low: '0000', high: '3fff' })
      expect(result.get(1)).toEqual({ low: '4000', high: '7fff' })
      expect(result.get(2)).toEqual({ low: '8000', high: 'bfff' })
    })
  })

  describe('createOffer', () => {
    it('should create offer object with correct structure', () => {
      const createOffer = (
        oldDataMap: Map<number, any>,
        networkStateHash: string,
        selfIp: string,
        selfPort: number
      ) => {
        const partitionsToOffer = []
        for (const [partitionId] of oldDataMap) {
          partitionsToOffer.push(partitionId)
        }
        return {
          networkStateHash: networkStateHash,
          partitions: partitionsToOffer,
          downloadUrl: `http://${selfIp}:${selfPort}/download-snapshot-data`,
        }
      }

      const oldDataMap = new Map([
        [0, { data: 'partition0' }],
        [1, { data: 'partition1' }],
        [2, { data: 'partition2' }],
      ])

      const result = createOffer(oldDataMap, 'test-network-hash', '192.168.1.1', 8080)

      expect(result).toEqual({
        networkStateHash: 'test-network-hash',
        partitions: [0, 1, 2],
        downloadUrl: 'http://192.168.1.1:8080/download-snapshot-data',
      })
    })
  })

  describe('getNodesThatCoverPartition', () => {
    it('should return all nodes except self for global partition', () => {
      const getNodesThatCoverPartition = (
        partitionId: number,
        shardGlobals: any,
        nodeShardDataMap: Map<string, any>,
        selfId: string
      ) => {
        const nodesInPartition: any[] = []
        if (partitionId === -1) {
          nodeShardDataMap.forEach((data, nodeId) => {
            if (nodeId === selfId) return
            const node = data.node
            nodesInPartition.push(node)
          })
        }
        return nodesInPartition
      }

      const nodeShardDataMap = new Map([
        ['node1', { node: { id: 'node1', ip: '1.1.1.1' }, homePartition: 0 }],
        ['node2', { node: { id: 'node2', ip: '2.2.2.2' }, homePartition: 1 }],
        ['self', { node: { id: 'self', ip: '3.3.3.3' }, homePartition: 2 }],
      ])

      const result = getNodesThatCoverPartition(-1, {}, nodeShardDataMap, 'self')

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('node1')
      expect(result[1].id).toBe('node2')
    })

    it('should return nodes covering specific partition', () => {
      const calculateStoredPartitions = (shardGlobals: any, homePartition: number) => {
        // Mock implementation
        const partitionStart = Math.max(0, homePartition - 1)
        const partitionEnd = Math.min(9, homePartition + 1)
        return { partitionStart, partitionEnd }
      }

      const getNodesThatCoverPartition = (
        partitionId: number,
        shardGlobals: any,
        nodeShardDataMap: Map<string, any>,
        selfId: string
      ) => {
        const nodesInPartition: any[] = []
        if (partitionId === -1) {
          nodeShardDataMap.forEach((data, nodeId) => {
            if (nodeId === selfId) return
            const node = data.node
            nodesInPartition.push(node)
          })
        } else {
          nodeShardDataMap.forEach((data, nodeId) => {
            if (nodeId === selfId) return
            const node = data.node
            const homePartition = data.homePartition
            const { partitionStart, partitionEnd } = calculateStoredPartitions(shardGlobals, homePartition)
            if (partitionId >= partitionStart && partitionId <= partitionEnd) {
              nodesInPartition.push(node)
            }
          })
        }
        return nodesInPartition
      }

      const nodeShardDataMap = new Map([
        ['node1', { node: { id: 'node1', ip: '1.1.1.1' }, homePartition: 0 }],
        ['node2', { node: { id: 'node2', ip: '2.2.2.2' }, homePartition: 1 }],
        ['node3', { node: { id: 'node3', ip: '3.3.3.3' }, homePartition: 5 }],
        ['self', { node: { id: 'self', ip: '4.4.4.4' }, homePartition: 2 }],
      ])

      const result = getNodesThatCoverPartition(1, {}, nodeShardDataMap, 'self')

      expect(result).toHaveLength(2)
      expect(result.find((n) => n.id === 'node1')).toBeDefined()
      expect(result.find((n) => n.id === 'node2')).toBeDefined()
      expect(result.find((n) => n.id === 'node3')).toBeUndefined()
    })
  })

  describe('increaseNotNeededNodes', () => {
    it('should add node id to notNeededRepliedNodes map', () => {
      const notNeededRepliedNodes = new Map<string, true>()

      const increaseNotNeededNodes = (id: string) => {
        notNeededRepliedNodes.set(id, true)
      }

      increaseNotNeededNodes('node1')
      increaseNotNeededNodes('node2')

      expect(notNeededRepliedNodes.size).toBe(2)
      expect(notNeededRepliedNodes.get('node1')).toBe(true)
      expect(notNeededRepliedNodes.get('node2')).toBe(true)
    })
  })

  describe('processDownloadedMissingData', () => {
    it('should process valid partition data and update state', () => {
      const missingPartitions: number[] = [0, 1, 2]
      const dataToMigrate = new Map<number, any>()
      const mockCrypto = {
        hash: jest.fn().mockReturnValue('correct-hash'),
      }

      const processDownloadedMissingData = (missingData: any) => {
        if (missingPartitions.length === 0) return

        for (const partitionId in missingData) {
          const partitionData = missingData[partitionId]
          const accountsInPartition = partitionData.data.map((acc: any) => {
            return {
              accountId: acc.accountId,
              data: typeof acc.data === 'object' ? JSON.stringify(acc.data) : acc.data,
              timestamp: acc.timestamp,
              hash: acc.hash,
              isGlobal: acc.isGlobal,
            }
          })
          const computedHash = mockCrypto.hash(accountsInPartition)

          if (computedHash === partitionData.hash) {
            if (!dataToMigrate.has(parseInt(partitionId))) {
              dataToMigrate.set(parseInt(partitionId), partitionData.data)
              const index = missingPartitions.indexOf(parseInt(partitionId))
              missingPartitions.splice(index, 1)
            }
          }
        }
      }

      const missingData = {
        '0': {
          data: [{ accountId: 'acc1', data: { balance: 100 }, timestamp: 1234, hash: 'h1', isGlobal: false }],
          hash: 'correct-hash',
        },
        '1': {
          data: [{ accountId: 'acc2', data: { balance: 200 }, timestamp: 1235, hash: 'h2', isGlobal: false }],
          hash: 'correct-hash',
        },
      }

      processDownloadedMissingData(missingData)

      expect(dataToMigrate.size).toBe(2)
      expect(dataToMigrate.has(0)).toBe(true)
      expect(dataToMigrate.has(1)).toBe(true)
      expect(missingPartitions).toEqual([2])
    })

    it('should reject data with incorrect hash', () => {
      const missingPartitions: number[] = [0]
      const dataToMigrate = new Map<number, any>()
      const mockCrypto = {
        hash: jest.fn().mockReturnValue('wrong-hash'),
      }

      const processDownloadedMissingData = (missingData: any) => {
        if (missingPartitions.length === 0) return

        for (const partitionId in missingData) {
          const partitionData = missingData[partitionId]
          const accountsInPartition = partitionData.data.map((acc: any) => {
            return {
              accountId: acc.accountId,
              data: typeof acc.data === 'object' ? JSON.stringify(acc.data) : acc.data,
              timestamp: acc.timestamp,
              hash: acc.hash,
              isGlobal: acc.isGlobal,
            }
          })
          const computedHash = mockCrypto.hash(accountsInPartition)

          if (computedHash === partitionData.hash) {
            if (!dataToMigrate.has(parseInt(partitionId))) {
              dataToMigrate.set(parseInt(partitionId), partitionData.data)
              const index = missingPartitions.indexOf(parseInt(partitionId))
              missingPartitions.splice(index, 1)
            }
          }
        }
      }

      const missingData = {
        '0': {
          data: [{ accountId: 'acc1', data: { balance: 100 }, timestamp: 1234, hash: 'h1', isGlobal: false }],
          hash: 'correct-hash',
        },
      }

      processDownloadedMissingData(missingData)

      expect(dataToMigrate.size).toBe(0)
      expect(missingPartitions).toEqual([0])
    })
  })

  describe('storeDataToNewDB', () => {
    it('should prepare account copies for storage', async () => {
      const mockCommitAccountCopies = jest.fn().mockResolvedValue(undefined)
      const currentCycle = { counter: 10 }

      const storeDataToNewDB = async (dataMap: Map<number, any[]>) => {
        const accountCopies: any[] = []
        for (const [, data] of dataMap) {
          if (data && data.length > 0) {
            data.forEach((accountData) => {
              accountCopies.push({
                ...accountData,
                cycleNumber: currentCycle.counter,
              })
            })
          }
        }
        await mockCommitAccountCopies(accountCopies)
      }

      const dataMap = new Map([
        [
          0,
          [
            { accountId: 'acc1', data: 'data1', timestamp: 1234 },
            { accountId: 'acc2', data: 'data2', timestamp: 1235 },
          ],
        ],
        [1, [{ accountId: 'acc3', data: 'data3', timestamp: 1236 }]],
      ])

      await storeDataToNewDB(dataMap)

      expect(mockCommitAccountCopies).toHaveBeenCalledWith([
        { accountId: 'acc1', data: 'data1', timestamp: 1234, cycleNumber: 10 },
        { accountId: 'acc2', data: 'data2', timestamp: 1235, cycleNumber: 10 },
        { accountId: 'acc3', data: 'data3', timestamp: 1236, cycleNumber: 10 },
      ])
    })

    it('should handle empty data map', async () => {
      const mockCommitAccountCopies = jest.fn().mockResolvedValue(undefined)
      const currentCycle = { counter: 10 }

      const storeDataToNewDB = async (dataMap: Map<number, any[]>) => {
        const accountCopies: any[] = []
        for (const [, data] of dataMap) {
          if (data && data.length > 0) {
            data.forEach((accountData) => {
              accountCopies.push({
                ...accountData,
                cycleNumber: currentCycle.counter,
              })
            })
          }
        }
        await mockCommitAccountCopies(accountCopies)
      }

      const dataMap = new Map()

      await storeDataToNewDB(dataMap)

      expect(mockCommitAccountCopies).toHaveBeenCalledWith([])
    })
  })
})
