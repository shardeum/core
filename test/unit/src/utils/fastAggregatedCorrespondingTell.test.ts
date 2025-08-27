import { getCorrespondingNodes, verifyCorrespondingSender } from '../../../../src/utils/fastAggregatedCorrespondingTell'

const verbose = true

describe('FACT Tests - Comprehensive Sender/Receiver Verification', () => {
  // Test configuration type for better clarity
  interface TestCase {
    name: string
    startTargetIndex: number
    endTargetIndex: number
    transactionGroupSize: number
    senderStartRange: number
    senderEndRange: number
    sendGroupSize: number
    globalOffset?: number
    expectedCoverage?: number // Expected coverage per receiver
  }

  const testCases: TestCase[] = [
    // Basic cases
    {
      name: 'Basic non-wrapped case',
      startTargetIndex: 13,
      endTargetIndex: 23,
      transactionGroupSize: 50,
      senderStartRange: 33,
      senderEndRange: 43,
      sendGroupSize: 10,
    },
    {
      name: 'Half sender size',
      startTargetIndex: 13,
      endTargetIndex: 23,
      transactionGroupSize: 50,
      senderStartRange: 35,
      senderEndRange: 40,
      sendGroupSize: 5,
    },
    
    // Wrap-around cases
    {
      name: 'Receiver wrap-around',
      startTargetIndex: 45,
      endTargetIndex: 5,
      transactionGroupSize: 50,
      senderStartRange: 0,
      senderEndRange: 10,
      sendGroupSize: 10,
    },
    {
      name: 'Sender wrap-around - valid consecutive',
      startTargetIndex: 10,
      endTargetIndex: 20,
      transactionGroupSize: 50,
      senderStartRange: 45,
      senderEndRange: 5,  // [45,46,47,48,49,0,1,2,3,4] - 10 consecutive nodes
      sendGroupSize: 10,
    },
    {
      name: 'Both wrap-around',
      startTargetIndex: 45,
      endTargetIndex: 5,
      transactionGroupSize: 50,
      senderStartRange: 48,
      senderEndRange: 3,  // [48,49,0,1,2] - 5 consecutive nodes
      sendGroupSize: 5,
    },
    
    // Edge cases - small groups
    {
      name: 'Minimal receiver group',
      startTargetIndex: 13,
      endTargetIndex: 14,
      transactionGroupSize: 50,
      senderStartRange: 0,
      senderEndRange: 10,
      sendGroupSize: 10,
    },
    {
      name: 'Minimal sender group',
      startTargetIndex: 10,
      endTargetIndex: 20,
      transactionGroupSize: 50,
      senderStartRange: 5,
      senderEndRange: 6,
      sendGroupSize: 1,
    },
    {
      name: 'Both minimal groups',
      startTargetIndex: 5,
      endTargetIndex: 6,
      transactionGroupSize: 20,
      senderStartRange: 10,
      senderEndRange: 11,
      sendGroupSize: 1,
    },
    
    // Different size ratios
    {
      name: 'Receiver larger than sender',
      startTargetIndex: 10,
      endTargetIndex: 30,
      transactionGroupSize: 50,
      senderStartRange: 35,
      senderEndRange: 40,
      sendGroupSize: 5,
    },
    {
      name: 'Sender larger than receiver',
      startTargetIndex: 13,
      endTargetIndex: 18,
      transactionGroupSize: 50,
      senderStartRange: 0,
      senderEndRange: 20,
      sendGroupSize: 20,
    },
    {
      name: 'Equal size groups',
      startTargetIndex: 10,
      endTargetIndex: 20,
      transactionGroupSize: 50,
      senderStartRange: 30,
      senderEndRange: 40,
      sendGroupSize: 10,
    },
    
    // Full coverage cases
    {
      name: 'Full transaction group coverage',
      startTargetIndex: 0,
      endTargetIndex: 50,
      transactionGroupSize: 50,
      senderStartRange: 0,
      senderEndRange: 10,
      sendGroupSize: 10,
    },
    {
      name: 'Large scale test',
      startTargetIndex: 3000,
      endTargetIndex: 3128,
      transactionGroupSize: 5000,
      senderStartRange: 100,
      senderEndRange: 228,
      sendGroupSize: 128,
    },
    
    // Boundary conditions
    {
      name: 'Receiver at start boundary',
      startTargetIndex: 0,
      endTargetIndex: 10,
      transactionGroupSize: 50,
      senderStartRange: 20,
      senderEndRange: 30,
      sendGroupSize: 10,
    },
    {
      name: 'Receiver at end boundary',
      startTargetIndex: 40,
      endTargetIndex: 50,
      transactionGroupSize: 50,
      senderStartRange: 10,
      senderEndRange: 20,
      sendGroupSize: 10,
    },
    
    // With different global offsets
    {
      name: 'Large global offset',
      startTargetIndex: 10,
      endTargetIndex: 20,
      transactionGroupSize: 50,
      senderStartRange: 25,
      senderEndRange: 35,
      sendGroupSize: 10,
      globalOffset: 43776,
    },
    {
      name: 'Prime number sizes',
      startTargetIndex: 7,
      endTargetIndex: 18,
      transactionGroupSize: 53,
      senderStartRange: 23,
      senderEndRange: 30,
      sendGroupSize: 7,
      globalOffset: 13,
    },
    
    // Stress test cases - CORRECTED
    {
      name: 'Maximum wrap complexity - valid group',
      startTargetIndex: 2,
      endTargetIndex: 7,
      transactionGroupSize: 8,
      senderStartRange: 0,
      senderEndRange: 5,  // [0,1,2,3,4] - valid group with all normalized indices
      sendGroupSize: 5,
      globalOffset: 43776,
    },
    {
      name: 'Non-aligned boundaries - consecutive senders',
      startTargetIndex: 17,
      endTargetIndex: 33,
      transactionGroupSize: 47,
      senderStartRange: 30,
      senderEndRange: 43,  // [30,31,...,42] - 13 consecutive nodes
      sendGroupSize: 13,
    },
    
    // Additional wrapped sender test cases
    {
      name: 'Wrapped senders at boundary - partial indices',
      startTargetIndex: 5,
      endTargetIndex: 15,
      transactionGroupSize: 20,
      senderStartRange: 17,
      senderEndRange: 5,  // [17,18,19,0,1,2,3,4] - normalized [1,2,3,0,1,2,3,4], unique [0,1,2,3,4]
      sendGroupSize: 5,  // Match the actual unique normalized indices available
    },
    {
      name: 'Large wrapped sender group - aligned',
      startTargetIndex: 100,
      endTargetIndex: 200,
      transactionGroupSize: 256,
      senderStartRange: 192,
      senderEndRange: 240,  // [192-239] - 48 consecutive nodes, all unique when %48
      sendGroupSize: 48,
    },
    
    // Real-world scenarios
    {
      name: 'Typical sharding scenario',
      startTargetIndex: 256,
      endTargetIndex: 512,
      transactionGroupSize: 1024,
      senderStartRange: 512,
      senderEndRange: 768,
      sendGroupSize: 256,
    },
    {
      name: 'High node count scenario',
      startTargetIndex: 1000,
      endTargetIndex: 2000,
      transactionGroupSize: 10000,
      senderStartRange: 3000,
      senderEndRange: 4000,
      sendGroupSize: 1000,
    },
  ]

  // Helper function to generate sender indices
  function generateSenderIndices(
    senderStartRange: number,
    senderEndRange: number,
    transactionGroupSize: number,
    sendGroupSize: number
  ): number[] {
    const indices: number[] = []
    
    if (senderStartRange < senderEndRange) {
      // Non-wrapped case
      for (let i = senderStartRange; i < senderEndRange; i++) {
        indices.push(i)
      }
    } else {
      // Wrapped case - we need to ensure we generate a contiguous set of 
      // normalized indices. The sender group should contain exactly sendGroupSize
      // consecutive nodes when considered modulo sendGroupSize.
      
      // First, check if this wrapped range creates a valid sender group
      const expectedSenderCount = (transactionGroupSize - senderStartRange) + senderEndRange
      
      if (expectedSenderCount !== sendGroupSize) {
        console.warn(`Warning: Wrapped sender range has ${expectedSenderCount} senders, but sendGroupSize is ${sendGroupSize}`)
      }
      
      // Generate indices maintaining the correct wrap-around
      for (let i = senderStartRange; i < transactionGroupSize; i++) {
        indices.push(i)
      }
      for (let i = 0; i < senderEndRange; i++) {
        indices.push(i)
      }
    }
    
    // Validate that the sender group is valid
    const normalizedIndices = new Set(indices.map(i => i % sendGroupSize))
    if (normalizedIndices.size !== sendGroupSize) {
      console.warn(`Warning: Sender group does not contain all normalized indices. Has ${normalizedIndices.size}, needs ${sendGroupSize}`)
      console.warn(`Missing indices: ${Array.from({length: sendGroupSize}, (_, i) => i).filter(i => !normalizedIndices.has(i))}`)
    }
    
    return indices
  }

  // Helper function to calculate actual receiver group size
  function calculateReceiverGroupSize(
    startTargetIndex: number,
    endTargetIndex: number,
    transactionGroupSize: number
  ): number {
    if (startTargetIndex <= endTargetIndex) {
      return endTargetIndex - startTargetIndex
    } else {
      // Wrapped case
      return (transactionGroupSize - startTargetIndex) + endTargetIndex
    }
  }

  // Main test loop
  testCases.forEach((testCase, index) => {
    test(`Case ${index + 1}: ${testCase.name}`, () => {
      const {
        startTargetIndex,
        endTargetIndex,
        transactionGroupSize,
        senderStartRange,
        senderEndRange,
        sendGroupSize,
        globalOffset = 0,
      } = testCase

      const receiverGroupSize = calculateReceiverGroupSize(
        startTargetIndex,
        endTargetIndex,
        transactionGroupSize
      )
      
      // Track coverage for each node
      const coverage = new Array(transactionGroupSize).fill(0)
      const senderToReceivers: Map<number, number[]> = new Map()

      // Generate sender indices
      const senderIndices = generateSenderIndices(
        senderStartRange,
        senderEndRange,
        transactionGroupSize,
        sendGroupSize
      )

      if (verbose) {
        console.log(`\n=== Test Case: ${testCase.name} ===`)
        console.log(`Receiver range: [${startTargetIndex}, ${endTargetIndex})`)
        console.log(`Sender range: [${senderStartRange}, ${senderEndRange})`)
        console.log(`Receiver group size: ${receiverGroupSize}`)
        console.log(`Send group size: ${sendGroupSize}`)
        console.log(`Global offset: ${globalOffset}`)
        console.log(`Transaction group size: ${transactionGroupSize}`)
        
        // Additional diagnostics for wrapped cases
        if (senderStartRange > senderEndRange) {
          const actualSenderCount = (transactionGroupSize - senderStartRange) + senderEndRange
          console.log(`Wrapped sender count: ${actualSenderCount}`)
          const normalizedSet = new Set<number>()
          for (let i = senderStartRange; i < transactionGroupSize; i++) {
            normalizedSet.add(i % sendGroupSize)
          }
          for (let i = 0; i < senderEndRange; i++) {
            normalizedSet.add(i % sendGroupSize)
          }
          console.log(`Unique normalized sender indices: [${Array.from(normalizedSet).sort((a, b) => a - b)}]`)
          console.log(`Expected normalized indices: [${Array.from({length: sendGroupSize}, (_, i) => i)}]`)
        }
      }

      // Test each sender
      for (let senderNodeIndex of senderIndices) {
        const originalSenderIndex = senderNodeIndex
        const destinationNodes = getCorrespondingNodes(
          senderNodeIndex,
          startTargetIndex,
          endTargetIndex,
          globalOffset,
          receiverGroupSize,
          sendGroupSize,
          transactionGroupSize,
          testCase.name
        )

        // Store sender-receiver mapping
        senderToReceivers.set(originalSenderIndex % transactionGroupSize, destinationNodes)

        if (verbose && destinationNodes.length > 0) {
          console.log(`Sender ${senderNodeIndex} -> Receivers ${destinationNodes}`)
        }

        // Update coverage and verify each destination
        destinationNodes.forEach((receiverNodeIndex) => {
          coverage[receiverNodeIndex]++

          // Verify the correspondence
          const isValid = verifyCorrespondingSender(
            receiverNodeIndex,
            senderNodeIndex % transactionGroupSize, // Always use actual node index
            globalOffset,
            receiverGroupSize,
            sendGroupSize,
            startTargetIndex,
            endTargetIndex,
            transactionGroupSize,
            false, // Don't use shouldUnwrapSender
            testCase.name
          )

          expect(isValid).toBe(true)
        })
      }

      // Verify coverage completeness
      let totalCoverage = 0
      let minCoverage = Infinity
      let maxCoverage = 0

      // Check receiver coverage
      for (let i = 0; i < transactionGroupSize; i++) {
        const isInReceiverRange = startTargetIndex <= endTargetIndex
          ? i >= startTargetIndex && i < endTargetIndex
          : i >= startTargetIndex || i < endTargetIndex

        if (isInReceiverRange) {
          expect(coverage[i]).toBeGreaterThan(0)
          totalCoverage += coverage[i]
          minCoverage = Math.min(minCoverage, coverage[i])
          maxCoverage = Math.max(maxCoverage, coverage[i])
        } else {
          expect(coverage[i]).toBe(0)
        }
      }

      if (verbose) {
        console.log(`Coverage stats - Total: ${totalCoverage}, Min: ${minCoverage}, Max: ${maxCoverage}`)
        console.log(`Coverage distribution: ${coverage.filter(c => c > 0).join(', ')}`)
      }

      // Verify coverage balance (should be relatively even)
      if (receiverGroupSize > 0 && minCoverage > 0) {
        const coverageRatio = maxCoverage / minCoverage
        // Coverage should be reasonably balanced (within 2x)
        expect(coverageRatio).toBeLessThanOrEqual(2)
      }

      // Verify reverse mapping: each receiver should be able to identify its senders
      const receiverToSenders: Map<number, number[]> = new Map()
      
      for (const [sender, receivers] of senderToReceivers.entries()) {
        receivers.forEach(receiver => {
          if (!receiverToSenders.has(receiver)) {
            receiverToSenders.set(receiver, [])
          }
          receiverToSenders.get(receiver)!.push(sender)
        })
      }

      // Each receiver should have at least one sender
      for (let i = 0; i < transactionGroupSize; i++) {
        const isInReceiverRange = startTargetIndex <= endTargetIndex
          ? i >= startTargetIndex && i < endTargetIndex
          : i >= startTargetIndex || i < endTargetIndex

        if (isInReceiverRange) {
          expect(receiverToSenders.has(i)).toBe(true)
          expect(receiverToSenders.get(i)!.length).toBeGreaterThan(0)
        }
      }
    })
  })

  // Additional verification test
  test('Verify sender-receiver correspondence is bijective', () => {
    const testCase = {
      startTargetIndex: 10,
      endTargetIndex: 20,
      transactionGroupSize: 50,
      senderStartRange: 25,
      senderEndRange: 35,
      sendGroupSize: 10,
      globalOffset: 0,
    }

    const { startTargetIndex, endTargetIndex, transactionGroupSize, senderStartRange, senderEndRange, sendGroupSize, globalOffset } = testCase
    const receiverGroupSize = calculateReceiverGroupSize(startTargetIndex, endTargetIndex, transactionGroupSize)
    
    // Map each receiver to its expected sender
    const receiverToExpectedSender: Map<number, number> = new Map()
    
    for (let receiverIndex = startTargetIndex; receiverIndex < endTargetIndex; receiverIndex++) {
      const logicalPosition = receiverIndex - startTargetIndex
      const expectedSenderIndex = ((logicalPosition + globalOffset) % receiverGroupSize) % sendGroupSize
      receiverToExpectedSender.set(receiverIndex, expectedSenderIndex)
    }

    // Verify each sender sends to the correct receivers
    const senderIndices = generateSenderIndices(senderStartRange, senderEndRange, transactionGroupSize, sendGroupSize)
    
    for (const senderIndex of senderIndices) {
      const destinations = getCorrespondingNodes(
        senderIndex,
        startTargetIndex,
        endTargetIndex,
        globalOffset,
        receiverGroupSize,
        sendGroupSize,
        transactionGroupSize
      )
      
      destinations.forEach(receiver => {
        const expectedSender = receiverToExpectedSender.get(receiver)
        const actualSender = senderIndex % sendGroupSize
        expect(actualSender).toBe(expectedSender)
      })
    }
  })
})