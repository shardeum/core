//get the target nodes for a given corresponding sender
import { logFlags } from '../logger'

//this only has to be computed once time no matter how many facts are being shared
export function getCorrespondingNodes(
  ourIndex: number,
  startTargetIndex: number,
  endTargetIndex: number,
  globalOffset: number,
  receiverGroupSize: number,
  sendGroupSize: number,
  transactionGroupSize: number,
  note = ''
): number[] {
  // if (logFlags.verbose) {
    console.log(
      `getCorrespondingNodes ${note} ${ourIndex} ${startTargetIndex} ${endTargetIndex} ${globalOffset} ${receiverGroupSize} ${sendGroupSize} ${transactionGroupSize}`
    )
  // }
  
  const destinationNodes: number[] = []
  const normalizedSenderIndex = ourIndex % sendGroupSize
  
  // Calculate logical position of first receiver
  let logicalPosition = 0
  let currentIndex = startTargetIndex
  
  // Iterate through receiver group
  for (let count = 0; count < receiverGroupSize; count++) {
    // Calculate which sender this logical position maps to
    const mappedSenderIndex = ((logicalPosition + globalOffset) % receiverGroupSize) % sendGroupSize
    
    if (mappedSenderIndex === normalizedSenderIndex) {
      destinationNodes.push(currentIndex)
    }
    
    // Move to next receiver
    logicalPosition++
    currentIndex++
    
    // Handle wrap-around using modular arithmetic
    if (currentIndex === transactionGroupSize) {
      currentIndex = 0
    }
  }
  
  // if (logFlags.verbose) {
    console.log(`note: ${note} destinationNodes ${destinationNodes}`)
  // }
  return destinationNodes
}

export function verifyCorrespondingSender(
  receivingNodeIndex: number,
  sendingNodeIndex: number,
  globalOffset: number,
  receiverGroupSize: number,
  sendGroupSize: number,
  receiverStartIndex = 0,
  receiverEndIndex = 0,
  transactionGroupSize = 0,
  shouldUnwrapSender = false,
  note = ''
): boolean {
  // if (logFlags.verbose) {
    console.log(
      `verifyCorrespondingSender ${note} ${receivingNodeIndex} ${sendingNodeIndex} ${globalOffset} ${receiverGroupSize} ${sendGroupSize} ${receiverStartIndex} ${receiverEndIndex} ${transactionGroupSize}`
    )
  // }
  
  // Calculate logical position of receiver in its group
  let logicalPosition: number
  
  if (receiverStartIndex <= receiverEndIndex) {
    // Non-wrapped case
    if (receivingNodeIndex >= receiverStartIndex && receivingNodeIndex < receiverEndIndex) {
      logicalPosition = receivingNodeIndex - receiverStartIndex
    } else {
      // Receiver not in group
      console.log(
        `note: ${note} receiver not in group ${receivingNodeIndex} ${receiverStartIndex} ${receiverEndIndex}`
      )
      return false
    }
  } else {
    // Wrapped case
    if (receivingNodeIndex >= receiverStartIndex) {
      logicalPosition = receivingNodeIndex - receiverStartIndex
    } else if (receivingNodeIndex < receiverEndIndex) {
      logicalPosition = (transactionGroupSize - receiverStartIndex) + receivingNodeIndex
    } else {
      // Receiver not in group
      console.log(
        `note: ${note} receiver not in group ${receivingNodeIndex} ${receiverStartIndex} ${receiverEndIndex}`
      )
      return false
    }
  }
  
  // Calculate expected sender using pure math
  const expectedSenderIndex = ((logicalPosition + globalOffset) % receiverGroupSize) % sendGroupSize
  const actualSenderIndex = sendingNodeIndex % sendGroupSize
  
  const result = expectedSenderIndex === actualSenderIndex
  
  // if (logFlags.verbose) {
    if (result) {
      console.log(
        `note: ${note} verification passed ${expectedSenderIndex} === ${actualSenderIndex}  ${sendingNodeIndex}->${receivingNodeIndex}`
      )
    } else {
      console.log(
        `note: ${note} X verification failed ${expectedSenderIndex} !== ${actualSenderIndex} sender: ${sendingNodeIndex} receiver: ${receivingNodeIndex}`
      )
    }
  // }
  
  return result
}