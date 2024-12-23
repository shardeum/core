import { logFlags } from '../../logger';
type Comparator<T, E = T> = (a: E, b: T) => number;
export function shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}
export function getRandom<T>(arr: T[], n: number): T[] {
    let len = arr.length;
    const taken = new Array(len);
    if (n > len) {
        n = len;
    }
    const result = new Array(n);
    while (n--) {
        const x = Math.floor(Math.random() * len);
        result[n] = arr[x in taken ? taken[x] : x];
        taken[x] = --len in taken ? taken[len] : len;
    }
    return result;
}
export function insertSorted<T>(arr: T[], item: T, comparator?: Comparator<T>): number {
    let i = binarySearch(arr, item, comparator);
    if (i < 0) {
        i = -1 - i;
    }
    arr.splice(i, 0, item);
    return i;
}
export function linearInsertSorted<T>(arr: T[], item: T, comparator: Comparator<T>): void {
    let i = 0;
    while (i < arr.length) {
        if (comparator(item, arr[i]) < 0) {
            break;
        }
        i++;
    }
    arr.splice(i, 0, item);
}
export function binaryLowest<T>(ar: T[], comparator?: Comparator<T>): number {
    if (ar.length < 1)
        return -1;
    if (comparator == null) {
        comparator = (a, b) => {
            return a > b ? 1 : a < b ? -1 : 0;
        };
    }
    if (ar.length < 2)
        return 0;
    let m = 0;
    let n = ar.length - 1;
    if (comparator(ar[m], ar[n]) < 0)
        return m;
    while (m <= n) {
        const k = (n + m) >> 1;
        const cmp = comparator(ar[m], ar[k]);
        if (cmp > 0) {
            n = k;
        }
        else if (cmp < 0) {
            m = k;
        }
        else {
            if (k + 1 === n)
                return n;
            m = k;
        }
    }
    return m;
}
export function binarySearch<T, E = Partial<T>>(arr: T[], el: E, comparator?: Comparator<T, typeof el>): number {
    if (comparator == null) {
        comparator = (a, b) => {
            return a.toString() > b.toString() ? 1 : a.toString() < b.toString() ? -1 : 0;
        };
    }
    let m = 0;
    let n = arr.length - 1;
    while (m <= n) {
        const k = (n + m) >> 1;
        const cmp = comparator(el, arr[k]);
        if (cmp > 0) {
            m = k + 1;
        }
        else if (cmp < 0) {
            n = k - 1;
        }
        else {
            return k;
        }
    }
    return -m - 1;
}
export const computeMedian = (arr: number[] = [], sort = true): number => {
    if (sort) {
        arr.sort((a, b) => a - b);
    }
    const len = arr.length;
    switch (len) {
        case 0: {
            return 0;
        }
        case 1: {
            return arr[0];
        }
        default: {
            const mid = len / 2;
            if (len % 2 === 0) {
                return arr[mid];
            }
            else {
                return (arr[Math.floor(mid)] + arr[Math.ceil(mid)]) / 2;
            }
        }
    }
};