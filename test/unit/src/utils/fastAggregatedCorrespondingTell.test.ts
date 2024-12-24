import { getCorrespondingNodes, verifyCorrespondingSender, } from '../../../../src/utils/fastAggregatedCorrespondingTell';
const verbose = true;
describe('FACT Tests', () => {
    const receiverTestCases = [
        {
            startTargetIndex: 13,
            endTargetIndex: 23,
            transactionGroupSize: 50,
            senderStartRange: 33,
            senderEndRange: 43,
            sendGroupSize: 10,
        },
        {
            startTargetIndex: 13,
            endTargetIndex: 23,
            transactionGroupSize: 50,
            senderStartRange: 35,
            senderEndRange: 40,
            sendGroupSize: 5,
        },
        {
            startTargetIndex: 45,
            endTargetIndex: 5,
            transactionGroupSize: 50,
            senderStartRange: 0,
            senderEndRange: 10,
            sendGroupSize: 10,
        },
        {
            startTargetIndex: 13,
            endTargetIndex: 18,
            transactionGroupSize: 50,
            senderStartRange: 0,
            senderEndRange: 10,
            sendGroupSize: 10,
        },
        {
            startTargetIndex: 0,
            endTargetIndex: 50,
            transactionGroupSize: 50,
            senderStartRange: 0,
            senderEndRange: 10,
            sendGroupSize: 10,
        },
        {
            startTargetIndex: 3000,
            endTargetIndex: 3128,
            transactionGroupSize: 5000,
            senderStartRange: 100,
            senderEndRange: 228,
            sendGroupSize: 128,
        },
        {
            startTargetIndex: 15,
            endTargetIndex: 25,
            transactionGroupSize: 50,
            senderStartRange: 10,
            senderEndRange: 20,
            sendGroupSize: 10,
        },
        {
            startTargetIndex: 2,
            endTargetIndex: 7,
            transactionGroupSize: 8,
            senderStartRange: 5,
            senderEndRange: 2,
            sendGroupSize: 5,
        }
    ];
    receiverTestCases.forEach(({ startTargetIndex, endTargetIndex, transactionGroupSize, senderStartRange, senderEndRange, sendGroupSize, }, index) => {
        test(`Test case ${index}: startTargetIndex: ${startTargetIndex}, endTargetIndex: ${endTargetIndex} transactionGroupSize:${transactionGroupSize} sendGroupSize:${sendGroupSize}`, () => {
            const receiverGroupSize = endTargetIndex - startTargetIndex;
            const globalOffset = 0;
            const coverage = new Array(transactionGroupSize).fill(0);
            const senderIndicies: number[] = [];
            if (senderStartRange < senderEndRange) {
                for (let i = senderStartRange; i < senderEndRange; i++) {
                    senderIndicies.push(i);
                }
            }
            else {
                const useUnWrapped = true;
                if (useUnWrapped) {
                    for (let i = senderStartRange; i < senderEndRange + transactionGroupSize; i++) {
                        senderIndicies.push(i);
                    }
                }
                else {
                    for (let i = 0; i < senderEndRange; i++) {
                        senderIndicies.push(i);
                    }
                    for (let i = senderStartRange; i < transactionGroupSize; i++) {
                        senderIndicies.push(i);
                    }
                }
            }
            for (let senderNodeIndex of senderIndicies) {
                const destinationNodes = getCorrespondingNodes(senderNodeIndex, startTargetIndex, endTargetIndex, globalOffset, receiverGroupSize, sendGroupSize, transactionGroupSize);
                destinationNodes.forEach((receiverNodeIndex) => {
                    coverage[receiverNodeIndex]++;
                    let shouldUnwrapSender = false;
                    if (senderNodeIndex > transactionGroupSize) {
                        senderNodeIndex = senderNodeIndex - transactionGroupSize;
                        shouldUnwrapSender = true;
                    }
                    expect(verifyCorrespondingSender(receiverNodeIndex, senderNodeIndex, globalOffset, receiverGroupSize, sendGroupSize, 0, 0, transactionGroupSize, shouldUnwrapSender)).toBe(true);
                });
            }
            for (let i = startTargetIndex; i < endTargetIndex; i++) {
                const wrappedIndex = i >= transactionGroupSize ? i % transactionGroupSize : i;
                expect(coverage[wrappedIndex]).toBeGreaterThan(0);
            }
            for (let i = 0; i < transactionGroupSize; i++) {
                if (i < startTargetIndex || i >= endTargetIndex) {
                    expect(coverage[i]).toBe(0);
                }
            }
        });
    });
});