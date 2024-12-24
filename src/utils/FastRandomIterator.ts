const minStrideSize = 10;
const maxStrideSize = 100;
export default class FastRandomIterator {
    strideSize: number;
    indexStrides: (boolean | number[])[];
    arraySize: number;
    iteratorIndex: number;
    indexList: number[] = null;
    sparseSet: Set<number> = null;
    constructor(arraySize: number, par = -1, strideSize = -1) {
        this.iteratorIndex = 0;
        this.arraySize = arraySize;
        let parForcesSimpleMode = false;
        if (par > 0) {
            if (arraySize / par > 100) {
                this.sparseSet = new Set();
                return;
            }
            if (strideSize < 0) {
                strideSize = arraySize / 100;
            }
            if (strideSize < minStrideSize) {
                strideSize = minStrideSize;
            }
            if (strideSize > maxStrideSize) {
                strideSize = maxStrideSize;
            }
            this.strideSize = Math.floor(strideSize);
            const forceSimpleCalc = par / arraySize;
            parForcesSimpleMode = forceSimpleCalc > 0.1;
        }
        if (arraySize < 100 || strideSize > arraySize || parForcesSimpleMode) {
            this.indexList = new Array(arraySize);
            for (let i = 0; i < arraySize; ++i) {
                this.indexList[i] = i;
            }
        }
        else {
            if (par <= 0) {
                if (strideSize < 0) {
                    strideSize = arraySize / 100;
                }
                if (strideSize < minStrideSize) {
                    strideSize = minStrideSize;
                }
                if (strideSize > maxStrideSize) {
                    strideSize = maxStrideSize;
                }
            }
            this.strideSize = Math.floor(strideSize);
            this.indexStrides = Array(Math.ceil(arraySize / this.strideSize)).fill(false);
        }
    }
    debugGetMode(): string {
        if (this.sparseSet != null) {
            return 'sparse';
        }
        if (this.indexList != null) {
            return 'fastSimple';
        }
        return 'fast';
    }
    debugForceSparse(): void {
        this.sparseSet = new Set();
    }
    getNextIndex(): number {
        if (this.iteratorIndex >= this.arraySize) {
            return -1;
        }
        let nextIndex: number;
        if (this.sparseSet != null) {
            let nextIndex = Math.floor(Math.random() * this.arraySize);
            while (this.sparseSet.has(nextIndex)) {
                nextIndex = Math.floor(Math.random() * this.arraySize);
            }
            this.sparseSet.add(nextIndex);
            this.iteratorIndex++;
            return nextIndex;
        }
        const randomFetchIndex = Math.floor(Math.random() * (this.arraySize - this.iteratorIndex)) + this.iteratorIndex;
        if (this.indexList != null) {
            nextIndex = this.indexList[randomFetchIndex];
            const indexValueToSwap = this.indexList[this.iteratorIndex];
            this.indexList[randomFetchIndex] = indexValueToSwap;
            this.iteratorIndex++;
            return nextIndex;
        }
        else {
            const currentStrideKey = Math.floor(this.iteratorIndex / this.strideSize);
            const hasCurrentStride = this.indexStrides[currentStrideKey];
            const currentStrideStart = currentStrideKey * this.strideSize;
            let currentStride: boolean | number[];
            if (hasCurrentStride === false) {
                currentStride = new Array(this.strideSize);
                for (let i = 0; i < this.strideSize; ++i) {
                    currentStride[i] = i + currentStrideStart;
                }
                this.indexStrides[currentStrideKey] = currentStride;
            }
            else {
                currentStride = this.indexStrides[currentStrideKey];
            }
            const fetchStrideKey = Math.floor(randomFetchIndex / this.strideSize);
            const fetchStrideStart = fetchStrideKey * this.strideSize;
            const hasFetchStride = this.indexStrides[fetchStrideKey];
            let fetchStride: boolean | number[];
            if (hasFetchStride === false) {
                fetchStride = new Array(this.strideSize);
                for (let i = 0; i < this.strideSize; ++i) {
                    fetchStride[i] = i + fetchStrideStart;
                }
                this.indexStrides[fetchStrideKey] = fetchStride;
            }
            else {
                fetchStride = this.indexStrides[fetchStrideKey];
            }
            const fetchStrideLocalDestIndex = randomFetchIndex - fetchStrideStart;
            nextIndex = fetchStride[fetchStrideLocalDestIndex];
            const indexValueToSwap = currentStride[this.iteratorIndex - currentStrideStart];
            fetchStride[fetchStrideLocalDestIndex] = indexValueToSwap;
            this.iteratorIndex++;
            return nextIndex;
        }
    }
}