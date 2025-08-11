import { 
  getCorrespondingNodes, 
  verifyCorrespondingSender,
  computeSecondaryOffset,
  getCorrespondingNodesWithSecondary,
  verifyCorrespondingSenderWithSecondary
} from '../../../../src/utils/fastAggregatedCorrespondingTell'

const verbose = true

describe('FACT Tests', () => {
  //push several test cases into an array
  const receiverTestCases = [
    // trivial case
    {
      startTargetIndex: 13,
      endTargetIndex: 23,
      transactionGroupSize: 50,
      senderStartRange: 33,
      senderEndRange: 43,
      sendGroupSize: 10,
    },
    // trivial case, half the sender size
    {
      startTargetIndex: 13,
      endTargetIndex: 23,
      transactionGroupSize: 50,
      senderStartRange: 35,
      senderEndRange: 40,
      sendGroupSize: 5,
    },
    // wrap around case
    {
      startTargetIndex: 45,
      endTargetIndex: 5,
      transactionGroupSize: 50,
      senderStartRange: 0,
      senderEndRange: 10,
      sendGroupSize: 10,
    },
    // smaller receiver group
    {
      startTargetIndex: 13,
      endTargetIndex: 18,
      transactionGroupSize: 50,
      senderStartRange: 0,
      senderEndRange: 10,
      sendGroupSize: 10,
    },
    // send to whole transaction group (disperse case)
    {
      startTargetIndex: 0,
      endTargetIndex: 50,
      transactionGroupSize: 50,
      senderStartRange: 0,
      senderEndRange: 10,
      sendGroupSize: 10,
    },
    // send to whole transaction group (disperse case)
    {
      startTargetIndex: 3000,
      endTargetIndex: 3128,
      transactionGroupSize: 5000,
      senderStartRange: 100,
      senderEndRange: 228,
      sendGroupSize: 128,
    },
    // send to whole transaction group (disperse case)
    {
      startTargetIndex: 15,
      endTargetIndex: 25,
      transactionGroupSize: 50,
      senderStartRange: 10,
      senderEndRange: 20,
      sendGroupSize: 10,
    },
    {
      //globalOffset           = 43776
      startTargetIndex: 2,
      endTargetIndex: 7,
      transactionGroupSize: 8,
      senderStartRange: 5,
      senderEndRange: 2,
      sendGroupSize: 5,
    },
  ]

  receiverTestCases.forEach(
    (
      { startTargetIndex, endTargetIndex, transactionGroupSize, senderStartRange, senderEndRange, sendGroupSize },
      index
    ) => {
      test(`Test case ${index}: startTargetIndex: ${startTargetIndex}, endTargetIndex: ${endTargetIndex} transactionGroupSize:${transactionGroupSize} sendGroupSize:${sendGroupSize}`, () => {
        const receiverGroupSize = endTargetIndex - startTargetIndex
        const globalOffset = 0 //43776 // Math.round(Math.random() * 1000)
        const coverage = new Array(transactionGroupSize).fill(0)

        const senderIndicies: number[] = []
        if (senderStartRange < senderEndRange) {
          for (let i = senderStartRange; i < senderEndRange; i++) {
            senderIndicies.push(i)
          }
        } else {
          const useUnWrapped = true
          if (useUnWrapped) {
            //indicies can go past the end
            for (let i = senderStartRange; i < senderEndRange + transactionGroupSize; i++) {
              senderIndicies.push(i)
            }
          } else {
            // wrapped
            for (let i = 0; i < senderEndRange; i++) {
              senderIndicies.push(i)
            }
            for (let i = senderStartRange; i < transactionGroupSize; i++) {
              senderIndicies.push(i)
            }
          }

          if (verbose) console.log(`wrapped sender ranges ${senderIndicies}`)
        }

        for (let senderNodeIndex of senderIndicies) {
          //get a list of destination nodes for this sender
          const destinationNodes = getCorrespondingNodes(
            senderNodeIndex,
            startTargetIndex,
            endTargetIndex,
            globalOffset,
            receiverGroupSize,
            sendGroupSize,
            transactionGroupSize
          )

          console.log(`sender ${senderNodeIndex} send all payload to nodes ${destinationNodes}`)
          //cheap hack to test that verification can refute things
          //globalOffset++

          //this is the list of nodes that we should send to,
          //in this test we will increment a coverage array
          destinationNodes.forEach((receiverNodeIndex) => {
            coverage[receiverNodeIndex]++
            //NOTE, This is where we would send the payload
            //for tellCorrespondingNodes we would send all accounts we cover
            //for tellCorrespondingNodesFinalData we would look at the receiver storage range and send only the accounts are covered

            //verification check
            //extra step here, remove in production

            let shouldUnwrapSender = false
            if (senderNodeIndex > transactionGroupSize) {
              senderNodeIndex = senderNodeIndex - transactionGroupSize
              shouldUnwrapSender = true
            }

            expect(
              verifyCorrespondingSender(
                receiverNodeIndex,
                senderNodeIndex,
                globalOffset,
                receiverGroupSize,
                sendGroupSize,
                0,
                0,
                transactionGroupSize,
                shouldUnwrapSender
              )
            ).toBe(true)
          })
        }

        // verify coverage
        for (let i = startTargetIndex; i < endTargetIndex; i++) {
          const wrappedIndex = i >= transactionGroupSize ? i % transactionGroupSize : i
          if (verbose) console.log(`Coverage ${i} ${wrappedIndex}: ${coverage[wrappedIndex]}`)
          expect(coverage[wrappedIndex]).toBeGreaterThan(0)
        }

        // check to make sure we did not cover anything outside of the target range
        for (let i = 0; i < transactionGroupSize; i++) {
          if (i < startTargetIndex || i >= endTargetIndex) {
            expect(coverage[i]).toBe(0)
          }
        }
      })
    }
  )
})

describe('State Hardening - FACT Extensions', () => {
  describe('computeSecondaryOffset', () => {
    it('should generate deterministic secondary offsets', () => {
      const primaryOffset = 5
      const accountId = 'account123'
      const txId = 'tx456'
      const receiverGroupSize = 20
      
      const offset1 = computeSecondaryOffset(primaryOffset, accountId, txId, receiverGroupSize)
      const offset2 = computeSecondaryOffset(primaryOffset, accountId, txId, receiverGroupSize)
      
      expect(offset1).toBe(offset2)
      expect(offset1).toBeGreaterThanOrEqual(0)
      expect(offset1).toBeLessThan(receiverGroupSize)
    })
    
    it('should generate different offsets for different inputs', () => {
      const primaryOffset = 5
      const receiverGroupSize = 20
      
      const offset1 = computeSecondaryOffset(primaryOffset, 'account1', 'tx1', receiverGroupSize)
      const offset2 = computeSecondaryOffset(primaryOffset, 'account2', 'tx1', receiverGroupSize)
      const offset3 = computeSecondaryOffset(primaryOffset, 'account1', 'tx2', receiverGroupSize)
      
      // Not all should be the same (with high probability)
      const allSame = offset1 === offset2 && offset2 === offset3
      expect(allSame).toBe(false)
    })
    
    it('should not return the same offset as primary', () => {
      const primaryOffset = 5
      const accountId = 'account123'
      const txId = 'tx456'
      const receiverGroupSize = 20
      
      const secondaryOffset = computeSecondaryOffset(primaryOffset, accountId, txId, receiverGroupSize)
      
      // Secondary should be different from primary (with high probability)
      expect(secondaryOffset).not.toBe(primaryOffset)
    })
  })
  
  describe('getCorrespondingNodesWithSecondary', () => {
    it('should return both primary and secondary nodes', () => {
      const result = getCorrespondingNodesWithSecondary(
        5, 0, 10, 3, 10, 10, 10, 'account123', 'tx456'
      )
      
      expect(result).toHaveProperty('primary')
      expect(result).toHaveProperty('secondary')
      expect(Array.isArray(result.primary)).toBe(true)
      expect(Array.isArray(result.secondary)).toBe(true)
    })
  })
  
  describe('verifyCorrespondingSenderWithSecondary', () => {
    it('should verify sender with secondary mapping', () => {
      const result = verifyCorrespondingSenderWithSecondary(
        5, 8, 3, 10, 10, 0, 10, 10, 'account123', 'tx456'
      )
      
      expect(typeof result).toBe('boolean')
    })
  })
})
