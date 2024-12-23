import { logFlags } from '../logger';
export function getCorrespondingNodes(ourIndex: number, startTargetIndex: number, endTargetIndex: number, globalOffset: number, receiverGroupSize: number, sendGroupSize: number, transactionGroupSize: number, note = ''): number[] {
    if (logFlags.verbose) {
    }
    let wrappedIndex: number;
    let targetNumber: number;
    let found = false;
    let unWrappedEndIndex = -1;
    if (startTargetIndex > endTargetIndex) {
        unWrappedEndIndex = endTargetIndex;
        endTargetIndex = endTargetIndex + transactionGroupSize;
    }
    ourIndex = ourIndex % sendGroupSize;
    for (let i = startTargetIndex; i < endTargetIndex; i++) {
        wrappedIndex = i;
        if (i >= transactionGroupSize) {
            wrappedIndex = i - transactionGroupSize;
        }
        targetNumber = (i + globalOffset) % receiverGroupSize;
        if (targetNumber === ourIndex) {
            found = true;
            break;
        }
    }
    if (!found) {
        return [];
    }
    const destinationNodes: number[] = [];
    while (targetNumber < receiverGroupSize) {
        const destinationNode = wrappedIndex;
        destinationNodes.push(destinationNode);
        targetNumber += sendGroupSize;
        wrappedIndex += sendGroupSize;
        if (wrappedIndex >= transactionGroupSize) {
            wrappedIndex = wrappedIndex - transactionGroupSize;
        }
        if (wrappedIndex >= endTargetIndex) {
            wrappedIndex = wrappedIndex - receiverGroupSize;
        }
        if (unWrappedEndIndex != -1 && wrappedIndex >= unWrappedEndIndex) {
            const howFarPastUnWrapped = wrappedIndex - unWrappedEndIndex;
            wrappedIndex = startTargetIndex + howFarPastUnWrapped;
        }
    }
    if (logFlags.verbose) {
    }
    return destinationNodes;
}
export function verifyCorrespondingSender(receivingNodeIndex: number, sendingNodeIndex: number, globalOffset: number, receiverGroupSize: number, sendGroupSize: number, receiverStartIndex = 0, receiverEndIndex = 0, transactionGroupSize = 0, shouldUnwrapSender = false, note = ''): boolean {
    if (logFlags.verbose) {
    }
    let unwrappedReceivingNodeIndex = receivingNodeIndex;
    if (receiverStartIndex > unwrappedReceivingNodeIndex) {
        unwrappedReceivingNodeIndex = unwrappedReceivingNodeIndex + transactionGroupSize;
    }
    let unwrappedSendingNodeIndex = sendingNodeIndex;
    if (shouldUnwrapSender) {
        unwrappedSendingNodeIndex = sendingNodeIndex + transactionGroupSize;
    }
    const targetIndex = ((unwrappedReceivingNodeIndex + globalOffset) % receiverGroupSize) % sendGroupSize;
    const targetIndex2 = unwrappedSendingNodeIndex % sendGroupSize;
    if (targetIndex === targetIndex2) {
        return true;
    }
    else {
        return false;
    }
}